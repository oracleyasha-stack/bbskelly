import type { AssetClass, PortfolioPosition } from '../types/terminal';

export interface RiskInput {
  positions: PortfolioPosition[];
  /** Annualized vol assumption per asset class when no history is available. */
  annVolByClass?: Record<AssetClass, number>;
  /** Average pairwise correlation assumption for the block model. */
  correlation?: number;
  /** Annual risk-free rate (decimal) for Sharpe. */
  riskFreeRate?: number;
  /** Benchmark daily returns for beta (e.g. SPX). Optional. */
  benchmarkReturns?: number[];
  /** Portfolio daily returns history (fractional, e.g. 0.01 = +1%). Optional — enables historical VaR. */
  portfolioReturns?: number[];
}

export interface RiskStats {
  totalValue: number;
  totalCost: number;
  totalPnL: number;
  totalPnLPercent: number;
  dayPnL: number;
  dayPnLPercent: number;
  weights: { ticker: string; weight: number; riskContribution: number }[];
  annVolatility: number; // decimal, e.g. 0.24 = 24%
  dailyVol: number;
  var95Param: number; // positive loss amount
  var99Param: number;
  var95Hist: number | null;
  cvar95Hist: number | null;
  sharpe: number | null;
  sortino: number | null;
  beta: number | null;
  maxDrawdown: number | null;
  concentrationHHI: number;
  top3Weight: number;
}

const DEFAULT_VOL: Record<AssetClass, number> = {
  EQUITY: 0.28,
  INDEX: 0.18,
  CURR: 0.1,
  CMDTY: 0.24,
  GOVT: 0.06,
  CRYPTO: 0.7,
};

const mean = (xs: number[]): number => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
const stdev = (xs: number[], m?: number): number => {
  if (xs.length < 2) return 0;
  const mu = m ?? mean(xs);
  const v = xs.reduce((a, x) => a + (x - mu) * (x - mu), 0) / (xs.length - 1);
  return Math.sqrt(Math.max(0, v));
};

export function computePortfolioRisk(input: RiskInput): RiskStats {
  const positions = Array.isArray(input?.positions) ? input.positions : [];
  const annVolByClass = { ...DEFAULT_VOL, ...(input.annVolByClass ?? {}) };
  // Clamp correlation into [-1, 1] and reject NaN so a bad input can never
  // silently zero out (or NaN) the portfolio variance.
  const rawRho = input.correlation ?? 0.45;
  const rho = Number.isFinite(rawRho) ? Math.min(1, Math.max(-1, rawRho)) : 0.45;
  const rawRf = input.riskFreeRate ?? 0.0388;
  const rf = Number.isFinite(rawRf) ? rawRf : 0.0388;
  // Sanitize vol assumptions: non-finite or negative vols fall back to defaults.
  for (const k of Object.keys(annVolByClass) as AssetClass[]) {
    const v = annVolByClass[k];
    if (!Number.isFinite(v) || v < 0) annVolByClass[k] = DEFAULT_VOL[k];
  }

  let totalValue = 0;
  let totalCost = 0;
  let dayPnL = 0;
  for (const p of positions) {
    const mv = Number.isFinite(p?.marketValue) ? p.marketValue : 0;
    const qty = Number.isFinite(p?.quantity) ? p.quantity : 0;
    const entry = Number.isFinite(p?.entryPrice) ? p.entryPrice : 0;
    const dpnl = Number.isFinite(p?.dayPnL) ? p.dayPnL : 0;
    totalValue += mv;
    totalCost += qty * entry;
    dayPnL += dpnl;
  }
  const totalPnL = totalValue - totalCost;
  const totalPnLPercent = totalCost > 0 ? (totalPnL / totalCost) * 100 : 0;
  const dayPnLPercent = totalValue > 0 ? (dayPnL / totalValue) * 100 : 0;

  const weights = positions.map((p) => {
    if (!(totalValue > 0)) return 0;
    const mv = Number.isFinite(p?.marketValue) ? p.marketValue : 0;
    const w = mv / totalValue;
    return Number.isFinite(w) ? w : 0;
  });
  const sigmas = positions.map((p) => {
    const v = annVolByClass[p?.assetClass as AssetClass] ?? 0.25;
    return Number.isFinite(v) && v >= 0 ? v : 0.25;
  });

  // Portfolio annualized vol via block correlation model:
  // sigma_p^2 = sum w_i^2 s_i^2 + 2 rho sum_{i<j} w_i w_j s_i s_j
  let variance = 0;
  for (let i = 0; i < positions.length; i++) {
    variance += weights[i] * weights[i] * sigmas[i] * sigmas[i];
    for (let j = i + 1; j < positions.length; j++) {
      variance += 2 * rho * weights[i] * weights[j] * sigmas[i] * sigmas[j];
    }
  }
  // Block-model vol is the book of record for risk contributions: RC sums to
  // 100% by construction only when numerator and denominator share it.
  const blockVol = Math.sqrt(Math.max(0, variance));
  let annVolatility = blockVol;

  // Sample stats from spark-implied histories. Spark steps are ~5-minute bars
  // (Yahoo 5m closes; sim pulses model a ~5min slice) — never daily bars — so
  // rescale to daily equivalents before annualizing. A degenerate sample
  // (flat tape while markets are closed ⇒ stdev ≈ 0) is discarded outright so
  // a ~0 vol can never price VaR or detonate risk contributions.
  const STEPS_PER_DAY = 78;
  const TRADING_DAYS = 252;
  let usableHistory = false;
  const cleanReturns = Array.isArray(input.portfolioReturns)
    ? input.portfolioReturns.filter((r) => Number.isFinite(r))
    : [];
  if (cleanReturns.length >= 20) {
    const stepSd = stdev(cleanReturns);
    if (stepSd > 1e-9) {
      usableHistory = true;
      annVolatility = stepSd * Math.sqrt(STEPS_PER_DAY * TRADING_DAYS);
    }
  }
  const dailyVol = annVolatility / Math.sqrt(TRADING_DAYS);

  // Parametric VaR (normal): VaR = z * sigma_daily * NAV
  const var95Param = 1.645 * dailyVol * totalValue;
  const var99Param = 2.326 * dailyVol * totalValue;

  // Historical VaR / CVaR from supplied daily returns (as positive loss amounts).
  let var95Hist: number | null = null;
  let cvar95Hist: number | null = null;
  let sharpe: number | null = null;
  let sortino: number | null = null;
  let maxDrawdown: number | null = null;
  if (usableHistory && cleanReturns.length >= 20) {
    const rets = [...cleanReturns].sort((a, b) => a - b);
    const idx = Math.max(0, Math.floor(0.05 * rets.length));
    // Square-root-of-time: scale the 5-min quantile to a 1-day equivalent.
    const dayScale = Math.sqrt(STEPS_PER_DAY);
    const q05 = rets[idx];
    var95Hist = Number.isFinite(q05) ? Math.max(0, -q05 * dayScale * totalValue) : null;
    const tail = rets.slice(0, idx + 1);
    cvar95Hist = tail.length ? Math.max(0, -mean(tail) * dayScale * totalValue) : var95Hist;
    const rfStep = Math.pow(1 + rf, 1 / (STEPS_PER_DAY * TRADING_DAYS)) - 1;
    const excess = cleanReturns.map((r) => r - rfStep);
    const sd = stdev(excess);
    const annScale = Math.sqrt(STEPS_PER_DAY * TRADING_DAYS);
    sharpe = sd > 0 ? (mean(excess) / sd) * annScale : null;
    const downside = excess.filter((x) => x < 0);
    const dd = downside.length >= 2 ? stdev(downside) : sd;
    sortino = dd > 0 ? (mean(excess) / dd) * annScale : null;
    // Max drawdown from cumulative wealth curve
    let peak = 1;
    let wealth = 1;
    let mdd = 0;
    for (const r of cleanReturns) {
      wealth *= 1 + r;
      if (!Number.isFinite(wealth)) break;
      peak = Math.max(peak, wealth);
      mdd = Math.min(mdd, wealth / peak - 1);
    }
    maxDrawdown = Number.isFinite(mdd) ? mdd : null; // negative fraction
  }

  // Beta vs benchmark (sample covariance / variance)
  let beta: number | null = null;
  const cleanBench = Array.isArray(input.benchmarkReturns)
    ? input.benchmarkReturns.filter(Number.isFinite)
    : [];
  if (
    cleanBench.length === cleanReturns.length &&
    cleanReturns.length >= 20
  ) {
    const n = cleanReturns.length;
    const mp = mean(cleanReturns);
    const mb = mean(cleanBench);
    let cov = 0;
    let vb = 0;
    for (let i = 0; i < n; i++) {
      cov += (cleanReturns[i] - mp) * (cleanBench[i] - mb);
      vb += (cleanBench[i] - mb) * (cleanBench[i] - mb);
    }
    beta = vb > 0 ? cov / vb : null;
  } else {
    // Fallback: value-weighted analyst beta proxy is NOT available here;
    // report null so the UI shows N/A instead of a fabricated constant.
    beta = null;
  }

  // Risk contributions: RC_i = w_i * (Sigma w)_i / sigma_p^2, evaluated on the
  // BLOCK model (blockVol) so contributions always sum to 100% and move only
  // with weights — never with tape noise while markets are closed.
  const rc: number[] = positions.map((_, i) => {
    if (blockVol <= 0 || totalValue <= 0) return 0;
    let marginal = weights[i] * sigmas[i] * sigmas[i];
    for (let j = 0; j < positions.length; j++) {
      if (j === i) continue;
      marginal += rho * weights[j] * sigmas[i] * sigmas[j];
    }
    return ((weights[i] * marginal) / (blockVol * blockVol)) * 100;
  });

  const hhi = weights.reduce((a, w) => a + w * w, 0);
  const top3 = [...weights].sort((a, b) => b - a).slice(0, 3).reduce((a, w) => a + w, 0);

  return {
    totalValue,
    totalCost,
    totalPnL,
    totalPnLPercent,
    dayPnL,
    dayPnLPercent: dayPnLPercent,
    weights: positions.map((p, i) => ({ ticker: p.ticker, weight: weights[i] * 100, riskContribution: rc[i] ?? 0 })),
    annVolatility,
    dailyVol,
    var95Param,
    var99Param,
    var95Hist,
    cvar95Hist,
    sharpe,
    sortino,
    beta,
    maxDrawdown,
    concentrationHHI: hhi,
    top3Weight: top3 * 100,
  };
}

/** Build a deterministic pseudo daily-return history from sparklines when no chart cache exists. */
export function sparklineReturns(spark: number[]): number[] {
  const out: number[] = [];
  if (!Array.isArray(spark)) return out;
  for (let i = 1; i < spark.length; i++) {
    const prev = spark[i - 1];
    if (typeof prev !== 'number' || typeof spark[i] !== 'number') continue;
    if (prev > 0 && isFinite(spark[i]) && isFinite(prev)) out.push(spark[i] / prev - 1);
  }
  return out;
}

/** Value-weighted portfolio daily returns from per-ticker histories (aligned by shortest length). */
export function blendReturns(histories: Record<string, number[]>, weights: Record<string, number>): number[] {
  if (!histories || typeof histories !== 'object' || !weights || typeof weights !== 'object') return [];
  const keys = Object.keys(histories).filter((k) => Array.isArray(histories[k]) && histories[k].length > 1);
  if (!keys.length) return [];
  const n = Math.min(...keys.map((k) => histories[k].length));
  if (!Number.isFinite(n) || n <= 0) return [];
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    let r = 0;
    for (const k of keys) {
      const w = Number.isFinite(weights[k]) ? weights[k] : 0;
      const v = histories[k][histories[k].length - n + i];
      if (Number.isFinite(v)) r += w * v;
    }
    out.push(r);
  }
  return out;
}
