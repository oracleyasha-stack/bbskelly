import type { PricePoint } from '../types/terminal';

export function ema(values: number[], period: number): (number | null)[] {
  const out: (number | null)[] = new Array(values.length).fill(null);
  if (!Number.isFinite(period) || Math.floor(period) <= 0) return out;
  const p = Math.floor(period);
  if (values.length < p) return out;
  const k = 2 / (p + 1);
  let prev = values.slice(0, p).reduce((a, b) => a + b, 0) / p;
  if (!Number.isFinite(prev)) return out;
  out[p - 1] = prev;
  for (let i = p; i < values.length; i++) {
    if (!Number.isFinite(values[i])) {
      out[i] = prev;
      continue;
    }
    prev = values[i] * k + prev * (1 - k);
    out[i] = prev;
  }
  return out;
}

export function bollinger(
  values: number[],
  period = 20,
  mult = 2
): { mid: (number | null)[]; upper: (number | null)[]; lower: (number | null)[] } {
  const mid: (number | null)[] = new Array(values.length).fill(null);
  const upper: (number | null)[] = new Array(values.length).fill(null);
  const lower: (number | null)[] = new Array(values.length).fill(null);
  if (!Number.isFinite(period) || Math.floor(period) <= 0) return { mid, upper, lower };
  const p = Math.floor(period);
  for (let i = p - 1; i < values.length; i++) {
    const slice = values.slice(i - p + 1, i + 1);
    if (!slice.every(Number.isFinite)) continue;
    const m = slice.reduce((a, b) => a + b, 0) / p;
    const sd = Math.sqrt(slice.reduce((a, x) => a + (x - m) * (x - m), 0) / p);
    mid[i] = m;
    upper[i] = m + mult * sd;
    lower[i] = m - mult * sd;
  }
  return { mid, upper, lower };
}

export function vwap(data: PricePoint[]): (number | null)[] {
  const out: (number | null)[] = [];
  let cumPV = 0;
  let cumV = 0;
  for (const d of data) {
    if (!Number.isFinite(d.high) || !Number.isFinite(d.low) || !Number.isFinite(d.close) || !Number.isFinite(d.volume) || d.volume < 0) {
      out.push(cumV > 0 ? cumPV / cumV : null);
      continue;
    }
    const typical = (d.high + d.low + d.close) / 3;
    cumPV += typical * d.volume;
    cumV += d.volume;
    out.push(cumV > 0 ? cumPV / cumV : null);
  }
  return out;
}

export function atr(data: PricePoint[], period = 14): (number | null)[] {
  const out: (number | null)[] = new Array(data.length).fill(null);
  if (!Number.isFinite(period) || Math.floor(period) <= 0) return out;
  const p = Math.floor(period);
  if (data.length < p + 1) return out;
  const trs: number[] = [];
  for (let i = 1; i < data.length; i++) {
    const h = data[i].high;
    const l = data[i].low;
    const pc = data[i - 1].close;
    if (!Number.isFinite(h) || !Number.isFinite(l) || !Number.isFinite(pc)) {
      trs.push(NaN);
      continue;
    }
    trs.push(Math.max(h - l, Math.abs(h - pc), Math.abs(l - pc)));
  }
  const seed = trs.slice(0, p).filter(Number.isFinite);
  if (seed.length < p) return out;
  let prev = seed.reduce((a, b) => a + b, 0) / p;
  out[p] = prev;
  for (let i = p + 1; i < data.length; i++) {
    const tr = trs[i - 1];
    if (!Number.isFinite(tr)) {
      out[i] = prev;
      continue;
    }
    prev = (prev * (p - 1) + tr) / p;
    out[i] = prev;
  }
  return out;
}

export interface BacktestResult {
  trades: number;
  wins: number;
  winRate: number;
  totalReturn: number; // fraction
  buyHoldReturn: number;
  sharpe: number | null;
  maxDrawdown: number;
  lastSignal: 'LONG' | 'FLAT';
}

/** Long/flat SMA(fast,slow) crossover backtest on closes. No leverage, no costs by default. */
export function smaCrossBacktest(
  closes: number[],
  fast = 20,
  slow = 50,
  costPerTrade = 0.0005
): BacktestResult | null {
  if (!Number.isFinite(fast) || !Number.isFinite(slow)) return null;
  const f = Math.floor(fast);
  const s = Math.floor(slow);
  if (f <= 0 || s <= 0 || f >= s) return null;
  if (closes.length < s + 5) return null;
  if (!closes.every((c) => Number.isFinite(c) && c > 0)) return null;
  const sma = (n: number, i: number): number => {
    const sl = closes.slice(i - n + 1, i + 1);
    return sl.reduce((a, b) => a + b, 0) / n;
  };
  let pos = 0;
  let equity = 1;
  let peak = 1;
  let mdd = 0;
  let trades = 0;
  let wins = 0;
  let entryEq = 1;
  const rets: number[] = [];
  for (let i = s - 1; i < closes.length; i++) {
    const fastAvg = sma(f, i);
    const slowAvg = sma(s, i);
    const want = fastAvg > slowAvg ? 1 : 0;
    if (want !== pos) {
      if (want === 1) {
        entryEq = equity;
        equity *= 1 - costPerTrade;
      } else {
        trades += 1;
        if (equity > entryEq) wins += 1;
        equity *= 1 - costPerTrade;
      }
      pos = want;
    }
    if (pos === 1 && i + 1 < closes.length) {
      const r = closes[i + 1] / closes[i] - 1;
      equity *= 1 + r;
      rets.push(r);
    }
    peak = Math.max(peak, equity);
    mdd = Math.min(mdd, equity / peak - 1);
  }
  if (pos === 1) {
    trades += 1;
    if (equity > entryEq) wins += 1;
  }
  const buyHold = closes[closes.length - 1] / closes[s - 1] - 1;
  const mu = rets.length ? rets.reduce((a, b) => a + b, 0) / rets.length : 0;
  const sd = rets.length > 1 ? Math.sqrt(rets.reduce((a, x) => a + (x - mu) * (x - mu), 0) / (rets.length - 1)) : 0;
  return {
    trades,
    wins,
    winRate: trades ? (wins / trades) * 100 : 0,
    totalReturn: equity - 1,
    buyHoldReturn: buyHold,
    sharpe: sd > 0 ? (mu / sd) * Math.sqrt(252) : null,
    maxDrawdown: mdd,
    lastSignal: pos === 1 ? 'LONG' : 'FLAT',
  };
}
