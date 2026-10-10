/**
 * Gaussian Hidden Markov Model for market-regime detection.
 *
 * Models daily (or weekly) log returns as emissions from N hidden states
 * (e.g. BULL / RANGE / BEAR), estimated with Baum-Welch EM (forward-backward
 * with scaling, Rabiner) from multiple restarts, decoded with Viterbi.
 *
 * Quality measures:
 * - scaled forward-backward (no underflow on long series)
 * - quantile + jittered inits, best-of-restarts by log-likelihood
 * - variance floors + winsorized inputs (one bad print can't collapse a state)
 * - convergence on relative log-likelihood gain, Viterbi path, stationary
 *   distribution, per-state dwell times
 * - deterministic self-test (`hmmSelfTest`) on synthetic two-regime data
 */

/** Seeded RNG (mulberry32) so the self-test is deterministic. */
export const mulberry32 = (seed: number): (() => number) => {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

const randn = (rand: () => number): number => {
  let u = 0;
  let v = 0;
  while (u === 0) u = rand();
  while (v === 0) v = rand();
  return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
};

const gaussianPdf = (x: number, mu: number, variance: number): number => {
  const v = Math.max(variance, 1e-12);
  const diff = x - mu;
  return Math.exp(-(diff * diff) / (2 * v)) / Math.sqrt(2 * Math.PI * v);
};

/** Simple log returns from a closes series; drops non-finite steps. */
export const logReturns = (closes: number[]): number[] => {
  const out: number[] = [];
  for (let i = 1; i < closes.length; i++) {
    const prev = closes[i - 1];
    const cur = closes[i];
    if (Number.isFinite(prev) && Number.isFinite(cur) && prev > 0 && cur > 0) {
      out.push(Math.log(cur / prev));
    }
  }
  return out;
};

/** Mild winsorization (±6σ) so a single bad print can't collapse a state. */
const winsorize = (xs: number[]): number[] => {
  if (xs.length === 0) return xs;
  const mean = xs.reduce((a, b) => a + b, 0) / xs.length;
  const sd = Math.sqrt(xs.reduce((a, b) => a + (b - mean) * (b - mean), 0) / xs.length);
  if (!Number.isFinite(sd) || sd === 0) return xs;
  const cap = 6 * sd;
  return xs.map((x) => Math.min(cap, Math.max(-cap, x - mean)) + mean);
};

export interface HMMFit {
  nStates: number;
  nObs: number;
  pi: number[];
  /** Transition matrix A[i][j]. Rows sum to 1. */
  transitions: number[][];
  mu: number[];
  sigma2: number[];
  logLikelihood: number;
  iterations: number;
  converged: boolean;
  /** Smoothed state posteriors gamma[t][k]. Rows sum to 1. */
  gamma: number[][];
  /** Viterbi most-likely path. */
  path: number[];
  /** Stationary distribution of A. */
  stationary: number[];
}

export interface FitOptions {
  restarts?: number;
  maxIter?: number;
  /** Relative log-likelihood gain to declare convergence. */
  tol?: number;
  rand?: () => number;
}

const normalize = (xs: number[]): number[] => {
  const s = xs.reduce((a, b) => a + b, 0);
  if (!Number.isFinite(s) || s <= 0) return xs.map(() => 1 / xs.length);
  return xs.map((x) => x / s);
};

const stationaryOf = (a: number[][], n: number): number[] => {
  let p = new Array(n).fill(1 / n);
  for (let it = 0; it < 200; it++) {
    const next = new Array(n).fill(0);
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) next[j] += p[i] * a[i][j];
    p = normalize(next);
  }
  return p;
};

interface EMLambda {
  pi: number[];
  a: number[][];
  mu: number[];
  v: number[];
}

/** One Baum-Welch run from a given init. Returns fit + log-likelihood. */
const runEM = (
  obs: number[],
  n: number,
  init: EMLambda,
  maxIter: number,
  tol: number,
  varFloor: number,
): { lambda: EMLambda; logLik: number; iterations: number; converged: boolean; gamma: number[][] } => {
  const T = obs.length;
  let { pi, a, mu, v } = init;
  let prevLl = -Infinity;
  let gamma: number[][] = [];
  let converged = false;
  let iterations = 0;

  for (let iter = 0; iter < maxIter; iter++) {
    iterations = iter + 1;
    // ---- scaled forward pass ----
    const alpha: number[][] = new Array(T);
    const c: number[] = new Array(T);
    for (let t = 0; t < T; t++) {
      alpha[t] = new Array(n);
      if (t === 0) {
        let s = 0;
        for (let i = 0; i < n; i++) {
          alpha[0][i] = pi[i] * gaussianPdf(obs[0], mu[i], v[i]);
          s += alpha[0][i];
        }
        c[0] = s > 0 ? s : 1e-300;
        for (let i = 0; i < n; i++) alpha[0][i] /= c[0];
      } else {
        let s = 0;
        for (let j = 0; j < n; j++) {
          let acc = 0;
          for (let i = 0; i < n; i++) acc += alpha[t - 1][i] * a[i][j];
          alpha[t][j] = acc * gaussianPdf(obs[t], mu[j], v[j]);
          s += alpha[t][j];
        }
        c[t] = s > 0 ? s : 1e-300;
        for (let j = 0; j < n; j++) alpha[t][j] /= c[t];
      }
    }
    // ---- scaled backward pass ----
    const beta: number[][] = new Array(T);
    for (let i = 0; i < n; i++) {
      beta[T - 1] = beta[T - 1] || new Array(n);
      beta[T - 1][i] = 1 / c[T - 1];
    }
    for (let t = T - 2; t >= 0; t--) {
      beta[t] = new Array(n);
      for (let i = 0; i < n; i++) {
        let acc = 0;
        for (let j = 0; j < n; j++) acc += a[i][j] * gaussianPdf(obs[t + 1], mu[j], v[j]) * beta[t + 1][j];
        beta[t][i] = acc / c[t];
      }
    }
    // ---- gamma / xi + log-likelihood ----
    const ll = c.reduce((acc, x) => acc + Math.log(Math.max(x, 1e-300)), 0);
    gamma = new Array(T);
    const xiSum: number[][] = Array.from({ length: n }, () => new Array(n).fill(0));
    const gammaSum = new Array(n).fill(0);
    for (let t = 0; t < T; t++) {
      gamma[t] = new Array(n);
      let denom = 0;
      for (let i = 0; i < n; i++) {
        gamma[t][i] = alpha[t][i] * beta[t][i];
        denom += gamma[t][i];
      }
      if (!(denom > 0)) denom = 1;
      for (let i = 0; i < n; i++) {
        gamma[t][i] /= denom;
        if (t < T - 1) gammaSum[i] += gamma[t][i];
      }
      if (t < T - 1) {
        let xiDenom = 0;
        const xi: number[][] = Array.from({ length: n }, () => new Array(n).fill(0));
        for (let i = 0; i < n; i++) {
          for (let j = 0; j < n; j++) {
            xi[i][j] =
              alpha[t][i] * a[i][j] * gaussianPdf(obs[t + 1], mu[j], v[j]) * beta[t + 1][j];
            xiDenom += xi[i][j];
          }
        }
        if (!(xiDenom > 0)) xiDenom = 1;
        for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) xiSum[i][j] += xi[i][j] / xiDenom;
      }
    }
    // ---- M step ----
    const newPi = [...gamma[0]];
    const newA: number[][] = Array.from({ length: n }, () => new Array(n).fill(0));
    for (let i = 0; i < n; i++) {
      const rowSum = gammaSum[i] > 1e-12 ? gammaSum[i] : 1e-12;
      for (let j = 0; j < n; j++) newA[i][j] = xiSum[i][j] / rowSum;
    }
    const fullGamma = new Array(n).fill(0);
    const wMean = new Array(n).fill(0);
    for (let t = 0; t < T; t++) for (let k = 0; k < n; k++) fullGamma[k] += gamma[t][k];
    for (let t = 0; t < T; t++) for (let k = 0; k < n; k++) wMean[k] += gamma[t][k] * obs[t];
    const newMu = wMean.map((s, k) => (fullGamma[k] > 1e-12 ? s / fullGamma[k] : mu[k]));
    const newV = new Array(n).fill(0);
    for (let t = 0; t < T; t++) {
      for (let k = 0; k < n; k++) {
        const d = obs[t] - newMu[k];
        newV[k] += gamma[t][k] * d * d;
      }
    }
    for (let k = 0; k < n; k++) {
      newV[k] = fullGamma[k] > 1e-12 ? Math.max(newV[k] / fullGamma[k], varFloor) : Math.max(v[k], varFloor);
    }
    pi = normalize(newPi);
    a = newA.map(normalize);
    mu = newMu;
    v = newV;

    if (iter > 4 && ll - prevLl < tol * (1 + Math.abs(prevLl))) {
      converged = true;
      iterations = iter + 1;
      break;
    }
    prevLl = ll;
    if (!Number.isFinite(ll)) break;
  }
  const finalLl = cSafeLogLik(gamma, obs, { pi, a, mu, v });
  return { lambda: { pi, a, mu, v }, logLik: finalLl, iterations, converged, gamma };
};

/** Recompute log-likelihood of the final params with a clean forward pass. */
const cSafeLogLik = (
  _gamma: number[][],
  obs: number[],
  lambda: EMLambda,
): number => {
  const n = lambda.pi.length;
  const T = obs.length;
  let ll = 0;
  let prev = lambda.pi.map((p, i) => p * gaussianPdf(obs[0], lambda.mu[i], lambda.v[i]));
  let s = prev.reduce((x, y) => x + y, 0);
  if (!(s > 0)) return -Infinity;
  ll += Math.log(s);
  prev = prev.map((x) => x / s);
  for (let t = 1; t < T; t++) {
    const cur = new Array(n).fill(0);
    for (let j = 0; j < n; j++) {
      let acc = 0;
      for (let i = 0; i < n; i++) acc += prev[i] * lambda.a[i][j];
      cur[j] = acc * gaussianPdf(obs[t], lambda.mu[j], lambda.v[j]);
    }
    s = cur.reduce((x, y) => x + y, 0);
    if (!(s > 0)) return -Infinity;
    ll += Math.log(s);
    prev = cur.map((x) => x / s);
  }
  return ll;
};

/** Viterbi most-likely state path (log domain). */
const viterbi = (obs: number[], lambda: EMLambda): number[] => {
  const n = lambda.pi.length;
  const T = obs.length;
  const logA = lambda.a.map((row) => row.map((x) => Math.log(Math.max(x, 1e-300))));
  const emit = (t: number, k: number) =>
    Math.log(Math.max(gaussianPdf(obs[t], lambda.mu[k], lambda.v[k]), 1e-300));
  let delta = lambda.pi.map((p, i) => Math.log(Math.max(p, 1e-300)) + emit(0, i));
  const psi: number[][] = [new Array(n).fill(0)];
  for (let t = 1; t < T; t++) {
    const next = new Array(n).fill(-Infinity);
    psi[t] = new Array(n).fill(0);
    for (let j = 0; j < n; j++) {
      let best = -Infinity;
      let arg = 0;
      for (let i = 0; i < n; i++) {
        const cand = delta[i] + logA[i][j];
        if (cand > best) {
          best = cand;
          arg = i;
        }
      }
      next[j] = best + emit(t, j);
      psi[t][j] = arg;
    }
    delta = next;
  }
  const path = new Array(T).fill(0);
  let best = -Infinity;
  for (let i = 0; i < n; i++) {
    if (delta[i] > best) {
      best = delta[i];
      path[T - 1] = i;
    }
  }
  for (let t = T - 2; t >= 0; t--) path[t] = psi[t + 1][path[t + 1]];
  return path;
};

export interface FitResult {
  fit: HMMFit | null;
  /** Machine-readable reason when fit is null. */
  reason?: string;
}

/**
 * Fit a Gaussian HMM to log returns. Best-of-`restarts` by log-likelihood.
 * Returns null (with reason) when the sample is too short or degenerate.
 */
export function fitGaussianHMM(
  rawReturns: number[],
  nStates: number,
  opts: FitOptions = {},
): FitResult {
  const { restarts = 8, maxIter = 150, tol = 1e-4, rand = Math.random } = opts;
  const clean = winsorize(rawReturns.filter((x) => Number.isFinite(x)));
  if (clean.length < 40) return { fit: null, reason: `need ≥40 bars, have ${clean.length}` };
  const mean = clean.reduce((a, b) => a + b, 0) / clean.length;
  const rawVar = clean.reduce((a, b) => a + (b - mean) * (b - mean), 0) / clean.length;
  if (!Number.isFinite(rawVar) || rawVar < 1e-18) {
    return { fit: null, reason: 'near-zero variance — flat series' };
  }
  const overallVar = rawVar;
  const overallSd = Math.sqrt(overallVar);
  const varFloor = Math.max(overallVar * 1e-4, 1e-12);

  const sorted = [...clean].sort((a, b) => a - b);
  const quantileMeans = (n: number): number[] => {
    const groups: number[][] = Array.from({ length: n }, () => []);
    sorted.forEach((x, idx) => groups[Math.min(n - 1, Math.floor((idx / sorted.length) * n))].push(x));
    return groups.map((g) => (g.length ? g.reduce((a, b) => a + b, 0) / g.length : mean));
  };
  const quantileVars = (n: number, means: number[]): number[] => {
    const groups: number[][] = Array.from({ length: n }, () => []);
    sorted.forEach((x, idx) => groups[Math.min(n - 1, Math.floor((idx / sorted.length) * n))].push(x));
    return groups.map((g, k) => {
      if (g.length < 2) return overallVar;
      const m = means[k];
      return Math.max(g.reduce((a, b) => a + (b - m) * (b - m), 0) / g.length, varFloor);
    });
  };

  let best: {
    lambda: EMLambda;
    logLik: number;
    iterations: number;
    converged: boolean;
    gamma: number[][];
  } | null = null;

  const R = Math.max(1, Math.floor(restarts));
  for (let r = 0; r < R; r++) {
    const qm = quantileMeans(nStates);
    const qv = quantileVars(nStates, qm);
    const mu0 = qm.map((m) => m + randn(rand) * overallSd * 0.25);
    // Keep the first restart exactly at quantile means (stable anchor);
    // jitter the rest for diversity.
    const mu = r === 0 ? qm : mu0;
    const v0 = qv.map((x) => Math.max(x, varFloor));
    const pi0 = normalize(Array.from({ length: nStates }, () => 1 + rand() * 0.5));
    const a0 = Array.from({ length: nStates }, (_, i) =>
      normalize(
        Array.from({ length: nStates }, (_, j) => (i === j ? 4 + rand() * 2 : 0.4 + rand() * 0.6)),
      ),
    );
    const run = runEM(clean, nStates, { pi: pi0, a: a0, mu, v: v0 }, maxIter, tol, varFloor);
    if (!Number.isFinite(run.logLik)) continue;
    if (!best || run.logLik > best.logLik) best = run;
  }
  if (!best) return { fit: null, reason: 'EM failed to converge to a finite likelihood' };

  const path = viterbi(clean, best.lambda);
  const stationary = stationaryOf(best.lambda.a, nStates);
  return {
    fit: {
      nStates,
      nObs: clean.length,
      pi: best.lambda.pi,
      transitions: best.lambda.a,
      mu: best.lambda.mu,
      sigma2: best.lambda.v,
      logLikelihood: best.logLik,
      iterations: best.iterations,
      converged: best.converged,
      gamma: best.gamma,
      path,
      stationary,
    },
  };
}

/** Order state indices by mean desc: [bull … bear]. */
export const orderByMeanDesc = (mu: number[]): number[] =>
  mu.map((_, i) => i).sort((a, b) => mu[b] - mu[a]);

/** Human label per state index. */
export const labelStates = (mu: number[]): string[] => {
  const order = orderByMeanDesc(mu);
  const labels = new Array(mu.length).fill('RANGE');
  if (order.length >= 1) labels[order[0]] = 'BULL';
  if (order.length >= 2) labels[order[order.length - 1]] = 'BEAR';
  if (order.length >= 4) {
    labels[order[1]] = 'RANGE+';
    labels[order[2]] = 'RANGE−';
  }
  return labels;
};

export type SignalDirection = 'LONG' | 'SHORT' | 'NEUTRAL';

export interface RegimeSignal {
  direction: SignalDirection;
  /** 0–100 conviction. */
  strength: number;
  /** 0–100 model confidence. */
  confidence: number;
  /** P(bull) − P(bear) from smoothed current posteriors. */
  edge: number;
  /** Posterior P(state) at the last bar. */
  probs: number[];
  /** Viterbi regime at the last bar. */
  currentState: number;
  /** Posterior-weighted expected log return for the next bar. */
  expectedLogRet: number;
  /** Self-transition prob of the current regime (persistence). */
  persistence: number;
  /** Expected dwell in bars: 1/(1−a_ii). */
  dwellBars: number;
  rationale: string;
}

/** Turn a fitted HMM into a directional signal. */
export function scoreSignal(fit: HMMFit): RegimeSignal {
  const n = fit.nStates;
  const T = fit.gamma.length;
  const last = fit.gamma[T - 1];
  const labels = labelStates(fit.mu);
  const bullIdx = labels.indexOf('BULL');
  const bearIdx = labels.indexOf('BEAR');
  const pBull = last[bullIdx] ?? 0;
  const pBear = n > 1 ? last[bearIdx] ?? 0 : 0;
  const edge = n > 1 ? pBull - pBear : 2 * pBull - 1;
  const expectedLogRet = last.reduce((acc, p, k) => acc + p * fit.mu[k], 0);
  const currentState = fit.path[T - 1];
  const persistence = fit.transitions[currentState][currentState] ?? 0;
  const dwellBars = persistence < 1 ? 1 / Math.max(1e-6, 1 - persistence) : Infinity;

  const direction: SignalDirection = edge >= 0.25 ? 'LONG' : edge <= -0.25 ? 'SHORT' : 'NEUTRAL';

  // Confidence: posterior concentration (50%) + bull/bear separation in vol
  // units (30%) + sample size (20%).
  const maxProb = Math.max(...last);
  const bullVol = Math.sqrt(Math.max(fit.sigma2[bullIdx] ?? 1e-12, 1e-12));
  const bearVol = Math.sqrt(Math.max(fit.sigma2[bearIdx] ?? bullVol * bullVol, 1e-12));
  const avgVol = (bullVol + bearVol) / 2 || 1e-9;
  const gap = n > 1 ? Math.abs(fit.mu[bullIdx] - fit.mu[bearIdx]) / avgVol : 0;
  const separation = Math.min(1, gap / 1.5);
  const sizeFactor = Math.min(1, fit.nObs / 200);
  const confidence = Math.round(100 * (0.5 * maxProb + 0.3 * separation + 0.2 * sizeFactor));
  const strength = Math.round(100 * Math.min(1, Math.abs(edge)) * (0.4 + 0.6 * (confidence / 100)));

  const pct = (x: number): string => `${x >= 0 ? '+' : ''}${(x * 100).toFixed(2)}%`;
  const rationale =
    `${labels[currentState]} regime ${(last[currentState] * 100).toFixed(0)}% likely · ` +
    `P(BULL) ${(pBull * 100).toFixed(0)}% vs P(BEAR) ${(pBear * 100).toFixed(0)}% · ` +
    `E[r] ${pct(expectedLogRet)}/bar · dwell ${Number.isFinite(dwellBars) ? dwellBars.toFixed(1) : '∞'} bars`;

  return {
    direction,
    strength,
    edge,
    confidence,
    probs: [...last],
    currentState,
    expectedLogRet,
    persistence,
    dwellBars,
    rationale,
  };
}

export interface SelfTestResult {
  pass: boolean;
  details: string;
}

/**
 * Deterministic quality gate: simulate a known 2-state market, refit, and
 * verify the recovered means match (up to label permutation) and the math
 * invariants hold (rows of A sum to 1, gamma rows sum to 1).
 */
export function hmmSelfTest(): SelfTestResult {
  const rand = mulberry32(20260930);
  const trueMu = [0.0012, -0.0015];
  const trueSd = [0.006, 0.016];
  const trueA = [
    [0.97, 0.03],
    [0.05, 0.95],
  ];
  const T = 500;
  const obs: number[] = [];
  let s = 0;
  for (let t = 0; t < T; t++) {
    obs.push(trueMu[s] + trueSd[s] * randn(rand));
    s = rand() < trueA[s][0] ? 0 : 1;
  }
  const { fit, reason } = fitGaussianHMM(obs, 2, { restarts: 6, maxIter: 150, tol: 1e-4, rand });
  if (!fit) return { pass: false, details: `fit failed: ${reason}` };
  const order = orderByMeanDesc(fit.mu);
  const muErrHi = Math.abs(fit.mu[order[0]] - trueMu[0]);
  const muErrLo = Math.abs(fit.mu[order[order.length - 1]] - trueMu[1]);
  const aRowErr = Math.max(
    ...fit.transitions.map((row) => Math.abs(row.reduce((x, y) => x + y, 0) - 1)),
  );
  const gRowErr = Math.max(
    ...fit.gamma.map((row) => Math.abs(row.reduce((x, y) => x + y, 0) - 1)),
  );
  const diagMin = Math.min(fit.transitions[0][0], fit.transitions[1][1]);
  const pass = muErrHi < 0.004 && muErrLo < 0.004 && aRowErr < 1e-6 && gRowErr < 1e-6 && diagMin > 0.8;
  return {
    pass,
    details:
      `μerr +${muErrHi.toExponential(1)}/−${muErrLo.toExponential(1)} · ` +
      `A-rows Δ${aRowErr.toExponential(1)} · γ-rows Δ${gRowErr.toExponential(1)} · ` +
      `min self-p ${diagMin.toFixed(2)} · ll/obs ${(fit.logLikelihood / fit.nObs).toFixed(3)}`,
  };
}
