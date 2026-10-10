import type { OptionContract } from '../types/terminal';

// Standard normal cumulative distribution function approximation
function cdf(x: number): number {
  const a1 = 0.254829592;
  const a2 = -0.284496736;
  const a3 = 1.421413741;
  const a4 = -1.453152027;
  const a5 = 1.061405429;
  const p = 0.3275911;

  const sign = x < 0 ? -1 : 1;
  const absX = Math.abs(x) / Math.SQRT2;

  const t = 1.0 / (1.0 + p * absX);
  const y = 1.0 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-absX * absX);

  return 0.5 * (1.0 + sign * y);
}

// Standard normal probability density function
function pdf(x: number): number {
  return (1 / Math.sqrt(2 * Math.PI)) * Math.exp(-0.5 * x * x);
}

export interface BlackScholesResult {
  callPrice: number;
  putPrice: number;
  callDelta: number;
  putDelta: number;
  gamma: number;
  vega: number; // per 1% vol change
  callTheta: number; // 1-day decay
  putTheta: number;
  callRho: number; // per 1% rate change
  putRho: number;
  vanna: number; // dDelta/dVol (per 1% vol), finite-difference
  volga: number; // dVega/dVol (per 1% vol^2), finite-difference
  callCharm: number; // dDelta/dT per day, finite-difference
  putCharm: number;
  parityViolation: number; // C - P - (S*e^-qT - K*e^-rT), ~0 when arbitrage-free
  d1: number;
  d2: number;
}

export function calculateBlackScholes(
  spot: number,
  strike: number,
  timeToExpiryYears: number,
  volatility: number,
  riskFreeRate: number,
  dividendYield = 0
): BlackScholesResult {
  // Reject non-finite/negative core inputs up front so a single NaN quote can
  // never poison every greek (Math.max(0, NaN) === NaN).
  if (!Number.isFinite(spot) || spot <= 0 || !Number.isFinite(strike) || strike <= 0) {
    const nan = NaN;
    return {
      callPrice: nan,
      putPrice: nan,
      callDelta: nan,
      putDelta: nan,
      gamma: nan,
      vega: nan,
      callTheta: nan,
      putTheta: nan,
      callRho: nan,
      putRho: nan,
      vanna: nan,
      volga: nan,
      callCharm: nan,
      putCharm: nan,
      parityViolation: nan,
      d1: nan,
      d2: nan,
    };
  }
  if (!Number.isFinite(volatility) || !Number.isFinite(timeToExpiryYears) || !Number.isFinite(riskFreeRate) || !Number.isFinite(dividendYield)) {
    const nan = NaN;
    return {
      callPrice: nan,
      putPrice: nan,
      callDelta: nan,
      putDelta: nan,
      gamma: nan,
      vega: nan,
      callTheta: nan,
      putTheta: nan,
      callRho: nan,
      putRho: nan,
      vanna: nan,
      volga: nan,
      callCharm: nan,
      putCharm: nan,
      parityViolation: nan,
      d1: nan,
      d2: nan,
    };
  }
  if (timeToExpiryYears <= 0) {
    const callIntrinsic = Math.max(0, spot - strike);
    const putIntrinsic = Math.max(0, strike - spot);
    return {
      callPrice: callIntrinsic,
      putPrice: putIntrinsic,
      callDelta: spot >= strike ? 1 : 0,
      putDelta: spot <= strike ? -1 : 0,
      gamma: 0,
      vega: 0,
      callTheta: 0,
      putTheta: 0,
      callRho: 0,
      putRho: 0,
      vanna: 0,
      volga: 0,
      callCharm: 0,
      putCharm: 0,
      parityViolation: 0,
      d1: 0,
      d2: 0,
    };
  }

  const S = Math.max(0.01, spot);
  const K = Math.max(0.01, strike);
  const T = Math.max(0.001, timeToExpiryYears);
  const v = Math.max(0.01, volatility);
  const r = riskFreeRate;
  const q = Math.max(0, dividendYield);

  const sqrtT = Math.sqrt(T);
  const d1 = (Math.log(S / K) + (r - q + 0.5 * v * v) * T) / (v * sqrtT);
  const d2 = d1 - v * sqrtT;

  const nd1 = cdf(d1);
  const nd2 = cdf(d2);
  const n_minus_d1 = cdf(-d1);
  const n_minus_d2 = cdf(-d2);
  const pdf_d1 = pdf(d1);
  const discountFactor = Math.exp(-r * T);
  const divDiscount = Math.exp(-q * T);

  // Prices with continuous dividend yield
  const callPrice = S * divDiscount * nd1 - K * discountFactor * nd2;
  const putPrice = K * discountFactor * n_minus_d2 - S * divDiscount * n_minus_d1;

  // Greeks
  const callDelta = divDiscount * nd1;
  const putDelta = divDiscount * (nd1 - 1.0);
  const gamma = (divDiscount * pdf_d1) / (S * v * sqrtT);
  const vega = (S * divDiscount * sqrtT * pdf_d1) / 100; // 1% change

  // Theta (per calendar day, ACT/365)
  const term1 = -(S * divDiscount * pdf_d1 * v) / (2 * sqrtT);
  const callTheta = (term1 - r * K * discountFactor * nd2 + q * S * divDiscount * nd1) / 365;
  const putTheta = (term1 + r * K * discountFactor * n_minus_d2 - q * S * divDiscount * n_minus_d1) / 365;

  // Rho (per 1% interest rate change)
  const callRho = (K * T * discountFactor * nd2) / 100;
  const putRho = (-K * T * discountFactor * n_minus_d2) / 100;

  // Put-call parity: C - P = S*e^-qT - K*e^-rT
  const parityViolation = callPrice - putPrice - (S * divDiscount - K * discountFactor);

  // Second-order / time-decay of delta via finite differences (robust, no closed-form drift)
  const bumpVol = (dv: number): { cd: number; pd: number; vega: number } => {
    const up = calculateCore(S, K, T, Math.max(0.01, v + dv), r, q);
    return { cd: up.callDelta, pd: up.putDelta, vega: up.vega };
  };
  const base = { cd: callDelta, pd: putDelta, vega };
  const up1 = bumpVol(0.01);
  const dn1 = bumpVol(-0.01);
  const vanna = (up1.cd - dn1.cd) / 2; // dDelta per +1% vol
  const volga = (up1.vega - dn1.vega) / 2;
  void base;
  void dn1;
  const dT = 1 / 365;
  const nearCall = calculateCore(S, K, Math.max(0.001, T - dT), v, r, q);
  const callCharm = (nearCall.callDelta - callDelta) / 1; // per day
  const putCharm = (nearCall.putDelta - putDelta) / 1;

  return {
    callPrice: Math.max(0, callPrice),
    putPrice: Math.max(0, putPrice),
    callDelta,
    putDelta,
    gamma,
    vega,
    callTheta,
    putTheta,
    callRho,
    putRho,
    vanna,
    volga,
    callCharm,
    putCharm,
    parityViolation,
    d1,
    d2,
  };
}

// Core pricer without second-order recursion (used for finite differences)
function calculateCore(
  S: number,
  K: number,
  T: number,
  v: number,
  r: number,
  q: number
): { callPrice: number; putPrice: number; callDelta: number; putDelta: number; vega: number } {
  const sqrtT = Math.sqrt(Math.max(1e-6, T));
  const d1 = (Math.log(S / K) + (r - q + 0.5 * v * v) * T) / (v * sqrtT);
  const d2 = d1 - v * sqrtT;
  const dd = Math.exp(-q * T);
  const df = Math.exp(-r * T);
  return {
    callPrice: S * dd * cdf(d1) - K * df * cdf(d2),
    putPrice: K * df * cdf(-d2) - S * dd * cdf(-d1),
    callDelta: dd * cdf(d1),
    putDelta: dd * (cdf(d1) - 1),
    vega: (S * dd * sqrtT * pdf(d1)) / 100,
  };
}

/** Implied volatility via Newton-Raphson with bisection fallback. Returns decimal vol or null. */
export function impliedVolatility(
  marketPrice: number,
  spot: number,
  strike: number,
  tYears: number,
  rate: number,
  isCall: boolean,
  dividendYield = 0,
  initGuess = 0.3
): number | null {
  if (!(marketPrice > 0) || !(spot > 0) || !(strike > 0) || !(tYears > 0)) return null;
  let vol = Math.min(5, Math.max(0.01, initGuess));
  for (let i = 0; i < 50; i++) {
    const bs = calculateBlackScholes(spot, strike, tYears, vol, rate, dividendYield);
    const price = isCall ? bs.callPrice : bs.putPrice;
    const vegaTotal = bs.vega * 100; // per 1.0 vol
    const diff = price - marketPrice;
    if (Math.abs(diff) < 1e-6) return vol;
    if (vegaTotal <= 1e-8) break;
    const next = vol - diff / vegaTotal;
    if (!isFinite(next) || next <= 0 || next > 5) break;
    vol = next;
  }
  // Bisection fallback
  let lo = 0.01;
  let hi = 5;
  const target = marketPrice;
  const priceAt = (vv: number): number => {
    const bs = calculateBlackScholes(spot, strike, tYears, vv, rate, dividendYield);
    return isCall ? bs.callPrice : bs.putPrice;
  };
  if (priceAt(hi) < target || priceAt(lo) > target) return null;
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    if (priceAt(mid) > target) hi = mid;
    else lo = mid;
  }
  return (lo + hi) / 2;
}

/** Cox-Ross-Rubinstein American option pricer (early exercise). Steps default 200. */
export function americanBinomial(
  spot: number,
  strike: number,
  tYears: number,
  volatility: number,
  rate: number,
  dividendYield = 0,
  isCall: boolean,
  steps = 200
): number {
  if (!Number.isFinite(spot) || spot <= 0 || !Number.isFinite(strike) || strike <= 0) return NaN;
  if (!Number.isFinite(tYears) || !Number.isFinite(volatility) || !Number.isFinite(rate) || !Number.isFinite(dividendYield)) return NaN;
  const safeSteps = Number.isFinite(steps) ? steps : 200;
  const S = Math.max(0.01, spot);
  const K = Math.max(0.01, strike);
  const T = Math.max(1 / 365, tYears);
  const v = Math.max(0.01, volatility);
  const n = Math.max(10, Math.min(500, Math.floor(safeSteps)));
  const dt = T / n;
  const up = Math.exp(v * Math.sqrt(dt));
  const down = 1 / up;
  const disc = Math.exp(-rate * dt);
  const p = (Math.exp((rate - dividendYield) * dt) - down) / (up - down);
  const qUp = Math.min(1, Math.max(0, p));
  const values: number[] = new Array(n + 1);
  for (let i = 0; i <= n; i++) {
    const st = S * Math.pow(up, n - i) * Math.pow(down, i);
    values[i] = isCall ? Math.max(0, st - K) : Math.max(0, K - st);
  }
  for (let j = n - 1; j >= 0; j--) {
    for (let i = 0; i <= j; i++) {
      const st = S * Math.pow(up, j - i) * Math.pow(down, i);
      const hold = disc * (qUp * values[i] + (1 - qUp) * values[i + 1]);
      const exercise = isCall ? Math.max(0, st - K) : Math.max(0, K - st);
      values[i] = Math.max(hold, exercise);
    }
  }
  return Math.max(0, values[0]);
}

export function generateOptionsChain(
  spotPrice: number,
  baseIV = 0.32,
  dte = 30,
  rate = 0.03875,
  dividendYield = 0
): OptionContract[] {
  if (!Number.isFinite(spotPrice) || spotPrice <= 0) return [];
  if (!Number.isFinite(baseIV) || !Number.isFinite(dte) || !Number.isFinite(rate) || !Number.isFinite(dividendYield)) return [];
  if (dte <= 0) return [];
  const T = dte / 365;
  const r = rate; // linked to YCRV / user slider; default = Fed midpoint 3.75%-4.00%

  // Spot-relative strike grid. The old fixed tiers (step 50 for everything over
  // 1000) collapsed index chains: NIFTY 50 spanned ±1.5% with 15 near-identical
  // ATM rows (delta 0.46-0.59), SENSEX/BANKNIFTY ±<1%, while sub-₹5 names went
  // negative. Target a half-width of ~11% of spot (≈±1 monthly σ at typical
  // equity vol) snapped to tradable NSE-style increments, so every underlying
  // from NATGAS (0.05) to SENSEX (1000) renders a real skew.
  const LADDER = [0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10, 25, 50, 100, 250, 500, 1000, 2500];
  const rawStep = spotPrice * 0.016;
  let step = LADDER[0];
  for (const s of LADDER) {
    if (Math.abs(s - rawStep) < Math.abs(step - rawStep)) step = s;
  }

  const atmStrike = Math.round(spotPrice / step) * step;

  const strikes: number[] = [];
  for (let i = -7; i <= 7; i++) {
    // Round to 2dp to keep FP dust (61 * 0.05 = 3.0500000000000003) out of
    // strikes, React keys and the strike column.
    const strike = +(atmStrike + i * step).toFixed(2);
    // Drop non-positive strikes so a deep window on a tiny spot can never
    // emit NaN Greeks (Math.log of a negative) into the chain table.
    if (strike > 0) strikes.push(strike);
  }
  if (strikes.length === 0) return [];

  return strikes.map((strike) => {
    // Volatility skew / smile effect
    const moneyness = strike / spotPrice;
    const skew = baseIV + 0.12 * Math.pow(moneyness - 1.0, 2) - 0.08 * (moneyness - 1.0);
    const iv = Math.max(0.12, Math.min(0.95, skew));

    const bs = calculateBlackScholes(spotPrice, strike, T, iv, r, dividendYield);
    // Per-side spreads sized off each leg's own theoretical value. The old code
    // sized BOTH sides off the call price, so deep-ITM puts (worth 100x the
    // paired call) quoted unrealistically tight, and far-OTM rows crossed
    // (0.01 bid over a 0.00 last). Bids floor at 0.00, never above last.
    const callSpread = Math.max(0.05, bs.callPrice * 0.03);
    const putSpread = Math.max(0.05, bs.putPrice * 0.03);

    return {
      strike,
      callBid: +Math.max(0, bs.callPrice - callSpread / 2).toFixed(2),
      callAsk: +(bs.callPrice + callSpread / 2).toFixed(2),
      callLast: +bs.callPrice.toFixed(2),
      callVol: Math.floor(Math.random() * 8500 + 400),
      callOI: Math.floor(Math.random() * 32000 + 1500),
      callIV: +(iv * 100).toFixed(1),
      callDelta: +bs.callDelta.toFixed(3),

      putBid: +Math.max(0, bs.putPrice - putSpread / 2).toFixed(2),
      putAsk: +(bs.putPrice + putSpread / 2).toFixed(2),
      putLast: +bs.putPrice.toFixed(2),
      putVol: Math.floor(Math.random() * 7200 + 350),
      putOI: Math.floor(Math.random() * 28000 + 1200),
      putIV: +(iv * 100).toFixed(1),
      putDelta: +bs.putDelta.toFixed(3),
    };
  });
}
