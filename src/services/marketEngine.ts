import type { PricePoint, Security } from '../types/terminal';
import { INITIAL_SECURITIES } from '../data/securities';

export interface TickEvent {
  ticker: string;
  price: number;
  change: number;
  changePercent: number;
  bid: number;
  ask: number;
  direction: 'UP' | 'DOWN' | 'NEUTRAL';
  timestamp: number;
}

type TickListener = (tick: TickEvent, updatedSecurity: Security) => void;

export interface LiveQuote {
  price: number;
  prevClose?: number;
  change?: number;
  changePercent?: number;
  open?: number;
  high?: number;
  low?: number;
  volume?: number;
  fiftyTwoWeekHigh?: number;
  fiftyTwoWeekLow?: number;
  currency?: string;
  name?: string;
  marketTime?: number;
  regularSessionEnd?: number;
  series?: number[];
}

export interface FundamentalsPatch {
  peRatio?: number;
  fwdPe?: number;
  eps?: number;
  beta?: number;
  evEbitda?: number;
  divYield?: number;
  marketCap?: string;
  sector?: string;
  industry?: string;
  description?: string;
  targetPrice?: number;
  targetHigh?: number;
  targetLow?: number;
  analystCount?: number;
  consensusRating?: Security['consensusRating'];
  fiftyTwoWeekHigh?: number;
  fiftyTwoWeekLow?: number;
}

class MarketEngine {
  private securities: Map<string, Security> = new Map();
  private listeners: Set<TickListener> = new Set();
  private intervalId: ReturnType<typeof setInterval> | null = null;
  private isRunning: boolean = false;

  constructor() {
    INITIAL_SECURITIES.forEach((sec) => {
      this.securities.set(sec.ticker, { ...sec });
    });
  }

  public start(frequencyMs = 1200) {
    const safeFreq = Number.isFinite(frequencyMs) ? Math.max(250, Math.floor(frequencyMs)) : 1200;
    if (this.isRunning) return;
    this.isRunning = true;

    this.intervalId = setInterval(() => {
      this.generateTicks();
    }, safeFreq);
  }

  public stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    this.isRunning = false;
  }

  public subscribe(listener: TickListener) {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  public getSecurity(ticker: string): Security | undefined {
    if (typeof ticker !== 'string' || !ticker) return undefined;
    return this.securities.get(ticker.toUpperCase());
  }

  public getAllSecurities(): Security[] {
    return Array.from(this.securities.values());
  }

  private liveMode: boolean = false;

  /** Switch to real-data mode: simulated random-walk ticks become heartbeats. */
  public setLiveMode(on: boolean) {
    this.liveMode = on;
    // Track when live mode engaged so callers can detect a stale feed
    // (see liveData.getFeedStatus) and fall back to simulation if needed.
    if (on) this.liveModeSince = Date.now();
    else this.liveModeSince = 0;
  }

  public getLiveModeSince(): number {
    return this.liveModeSince;
  }

  private liveModeSince: number = 0;

  /** Apply a real market quote (from /api/market → Yahoo Finance) to a security. */
  public applyLiveQuote(ticker: string, q: LiveQuote) {
    const sec = this.securities.get(ticker.toUpperCase());
    if (!sec || typeof q.price !== 'number' || !isFinite(q.price)) return;

    const price = q.price;
    const prevClose =
      typeof q.prevClose === 'number' && Number.isFinite(q.prevClose) && q.prevClose > 0 ? q.prevClose : sec.prevClose;
    const change = +(price - prevClose).toFixed(2);
    const changePercent = prevClose ? +((change / prevClose) * 100).toFixed(2) : 0;
    const finiteNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
    const open = finiteNum(q.open) ? q.open : sec.open;
    const high = finiteNum(q.high) ? q.high : Math.max(sec.high, price);
    const low = finiteNum(q.low) ? q.low : Math.min(sec.low, price);
    const volume = finiteNum(q.volume) && q.volume >= 0 ? q.volume : sec.volume;
    const spread = Math.max(0.01, +(price * 0.0002).toFixed(2));
    const sparkline =
      Array.isArray(q.series) && q.series.length > 1
        ? q.series.filter(finiteNum).slice(-15)
        : sec.sparkline;
    // If the feed sent only non-finite series values, keep the previous sparkline
    // instead of rendering an empty chart.
    const safeSparkline = sparkline.length > 1 ? sparkline : sec.sparkline;

    const updated: Security = {
      ...sec,
      price,
      change,
      changePercent,
      open,
      high,
      low,
      prevClose,
      volume,
      fiftyTwoWeekHigh:
        typeof q.fiftyTwoWeekHigh === 'number' && Number.isFinite(q.fiftyTwoWeekHigh) && q.fiftyTwoWeekHigh > 0
          ? q.fiftyTwoWeekHigh
          : sec.fiftyTwoWeekHigh,
      fiftyTwoWeekLow:
        typeof q.fiftyTwoWeekLow === 'number' && Number.isFinite(q.fiftyTwoWeekLow) && q.fiftyTwoWeekLow > 0
          ? q.fiftyTwoWeekLow
          : sec.fiftyTwoWeekLow,
      bid: +(price - spread / 2).toFixed(2),
      ask: +(price + spread / 2).toFixed(2),
      sparkline: safeSparkline,
      quote: { marketTime: q.marketTime, regularSessionEnd: q.regularSessionEnd },
      lastUpdate: typeof q.marketTime === 'number' && Number.isFinite(q.marketTime) ? q.marketTime * 1000 : Date.now(),
    };
    this.securities.set(updated.ticker, updated);

    const direction: 'UP' | 'DOWN' | 'NEUTRAL' =
      price > sec.price ? 'UP' : price < sec.price ? 'DOWN' : 'NEUTRAL';
    const tick: TickEvent = {
      ticker: updated.ticker,
      price,
      change,
      changePercent,
      bid: updated.bid,
      ask: updated.ask,
      direction,
      timestamp: Date.now(),
    };
    this.listeners.forEach((listener) => {
      try {
        listener(tick, updated);
      } catch (error) {
        console.warn('[marketEngine] tick listener failed:', error);
      }
    });
  }

  /** Merge real fundamentals/analyst data (P/E, targets, ratings…) into a security. */
  public applyFundamentals(ticker: string, f: FundamentalsPatch) {
    const sec = this.securities.get(ticker.toUpperCase());
    if (!sec) return;
    const next: Security = { ...sec };
    const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
    const VALID_RATINGS: ReadonlySet<string> = new Set(['STRONG_BUY', 'BUY', 'HOLD', 'UNDERPERFORM', 'SELL']);
    if (finite(f.peRatio)) next.peRatio = f.peRatio;
    if (finite(f.fwdPe)) next.fwdPe = f.fwdPe;
    if (finite(f.eps)) next.eps = f.eps;
    if (finite(f.beta)) next.beta = f.beta;
    // EV/EBITDA used to keep a hard-coded seed value forever, so it could
    // contradict the live P/E beside it. Once a live fundamentals record
    // arrives, show Yahoo's figure or nothing ("N/A") — never the stale seed.
    next.evEbitda = finite(f.evEbitda) && f.evEbitda > 0 ? f.evEbitda : undefined;
    if (finite(f.divYield)) next.divYield = f.divYield;
    if (typeof f.marketCap === 'string' && f.marketCap) next.marketCap = f.marketCap;
    if (finite(f.targetPrice)) next.targetPrice = f.targetPrice;
    if (finite(f.targetHigh)) next.targetHigh = f.targetHigh;
    if (finite(f.targetLow)) next.targetLow = f.targetLow;
    if (finite(f.analystCount)) next.analystCount = f.analystCount;
    if (typeof f.consensusRating === 'string' && VALID_RATINGS.has(f.consensusRating)) next.consensusRating = f.consensusRating;
    if (finite(f.fiftyTwoWeekHigh)) next.fiftyTwoWeekHigh = f.fiftyTwoWeekHigh;
    if (finite(f.fiftyTwoWeekLow)) next.fiftyTwoWeekLow = f.fiftyTwoWeekLow;
    if (typeof f.sector === 'string' && f.sector) next.sector = f.sector;
    if (typeof f.industry === 'string' && f.industry) next.industry = f.industry;
    if (typeof f.description === 'string' && f.description) next.description = f.description;
    this.securities.set(next.ticker, next);

    const tick: TickEvent = {
      ticker: next.ticker,
      price: next.price,
      change: next.change,
      changePercent: next.changePercent,
      bid: next.bid,
      ask: next.ask,
      direction: 'NEUTRAL',
      timestamp: Date.now(),
    };
    this.listeners.forEach((listener) => {
      try {
        listener(tick, next);
      } catch (error) {
        console.warn('[marketEngine] fundamentals listener failed:', error);
      }
    });
  }

  private randn(): number {
    // Box-Muller standard normal
    let u = 0;
    let v = 0;
    while (u === 0) u = Math.random();
    while (v === 0) v = Math.random();
    return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
  }

  private annVolFor(sec: Security): number {
    switch (sec.assetClass) {
      case 'CRYPTO':
        return 0.7;
      case 'INDEX':
        return 0.18;
      case 'CMDTY':
        return 0.24;
      case 'CURR':
        return 0.1;
      case 'GOVT':
        return 0.06;
      default:
        return 0.28;
    }
  }

  private generateTicks() {
    // GBM pulse: dS = mu*S*dt + sigma*S*sqrt(dt)*Z, with a common market factor
    // for cross-asset correlation. Each 1s pulse simulates a ~5min trading slice
    // (dt = 1/(252*78)) so the tape stays lively while staying scale-correct.
    const DT = 1 / (252 * 78);
    const sqrtDt = Math.sqrt(DT);
    const marketShock = this.randn();
    const tickers = Array.from(this.securities.keys());
    // Shuffle tickers (Fisher-Yates) so every symbol gets coverage over time
    // instead of random-with-replacement starving some names.
    for (let s = tickers.length - 1; s > 0; s--) {
      const j = Math.floor(Math.random() * (s + 1));
      [tickers[s], tickers[j]] = [tickers[j], tickers[s]];
    }
    const countToUpdate = Math.min(tickers.length, Math.floor(Math.random() * 3) + 1);

    for (let i = 0; i < countToUpdate; i++) {
      const ticker = tickers[i];
      const sec = this.securities.get(ticker);
      if (!sec) continue;

      // Live-data mode: prices are refreshed only by real polls; emit
      // heartbeat ticks so the tape keeps pulsing without inventing prices.
      if (this.liveMode) {
        const heartbeat: TickEvent = {
          ticker,
          price: sec.price,
          change: sec.change,
          changePercent: sec.changePercent,
          bid: sec.bid,
          ask: sec.ask,
          direction: sec.change > 0 ? 'UP' : sec.change < 0 ? 'DOWN' : 'NEUTRAL',
          timestamp: Date.now(),
        };
        this.listeners.forEach((listener) => {
          try {
            listener(heartbeat, sec);
          } catch (error) {
            console.warn('[marketEngine] heartbeat listener failed:', error);
          }
        });
        continue;
      }

      // GBM tick: correlated shock + drift, scale-correct per asset class
      // Guard against a poisoned price/sparkline so one bad quote can never
      // NaN the tape permanently.
      const basePrice = Number.isFinite(sec.price) && sec.price > 0 ? sec.price : sec.prevClose > 0 ? sec.prevClose : 100;
      const sigma = this.annVolFor(sec);
      const mu = sec.assetClass === 'EQUITY' || sec.assetClass === 'INDEX' ? 0.05 : 0;
      const rho = sec.assetClass === 'EQUITY' || sec.assetClass === 'INDEX' ? 0.55 : 0.2;
      const idio = this.randn();
      const z = rho * marketShock + Math.sqrt(1 - rho * rho) * idio;
      const ret = (mu - 0.5 * sigma * sigma) * DT + sigma * sqrtDt * z;
      const newPrice = Math.max(0.01, +(basePrice * Math.exp(ret)).toFixed(2));
      const direction: 'UP' | 'DOWN' | 'NEUTRAL' = newPrice > sec.price ? 'UP' : newPrice < sec.price ? 'DOWN' : 'NEUTRAL';

      const change = +(newPrice - sec.prevClose).toFixed(2);
      const changePercent = sec.prevClose > 0 ? +((change / sec.prevClose) * 100).toFixed(2) : 0;
      const high = Math.max(sec.high, newPrice);
      const low = Math.min(sec.low, newPrice);
      // Volume scales with the security's typical size so YESBANK (42M) and
      // BLUEDART (42k) both move plausibly. Crypto uses a smaller base.
      const baseVol = sec.assetClass === 'CRYPTO' ? 50 : Math.max(5000, sec.avgVolume || 1000000);
      const volumeDelta = Math.floor(baseVol * 0.0008 * (0.5 + Math.random()));
      const newVolume = sec.volume + Math.max(1, volumeDelta);

      const spread = Math.max(0.01, +(newPrice * 0.0002).toFixed(2));
      const bid = +(newPrice - spread / 2).toFixed(2);
      const ask = +(newPrice + spread / 2).toFixed(2);

      // Update sparkline keeping 15 elements
      const prevSpark = Array.isArray(sec.sparkline) ? sec.sparkline.filter((v) => Number.isFinite(v)) : [];
      const sparkline = [...prevSpark.slice(-14), newPrice];

      const updated: Security = {
        ...sec,
        price: newPrice,
        change,
        changePercent,
        high,
        low,
        volume: newVolume,
        bid,
        ask,
        sparkline,
        quote: undefined,
        lastUpdate: Date.now(),
      };

      this.securities.set(ticker, updated);

      const tickEvent: TickEvent = {
        ticker,
        price: newPrice,
        change,
        changePercent,
        bid,
        ask,
        direction,
        timestamp: Date.now(),
      };

      this.listeners.forEach((listener) => {
        try {
          listener(tickEvent, updated);
        } catch (error) {
          console.warn('[marketEngine] tick listener failed:', error);
        }
      });
    }
  }

  // Generates high-resolution OHLCV series for charts.
  // Returns an empty array for unknown tickers so callers can show
  // an explicit "no data" state instead of silently charting NVDA.
  public generateChartData(ticker: string, timeframe: '1D' | '5D' | '1M' | '6M' | '1Y' | '5Y'): PricePoint[] {
    const sec = this.getSecurity(ticker);
    if (!sec) return [];
    if (!Number.isFinite(sec.price) || sec.price <= 0) return [];
    const currentPrice = sec.price;
    const points: PricePoint[] = [];

    let count = 78; // default 1 trading day in 5m intervals
    let intervalMinutes = 5;

    if (timeframe === '1D') {
      count = 78;
      intervalMinutes = 5;
    } else if (timeframe === '5D') {
      count = 100;
      intervalMinutes = 20;
    } else if (timeframe === '1M') {
      count = 30;
      intervalMinutes = 1440;
    } else if (timeframe === '6M') {
      count = 120;
      intervalMinutes = 1440;
    } else if (timeframe === '1Y') {
      count = 252;
      intervalMinutes = 1440;
    } else if (timeframe === '5Y') {
      count = 260; // weekly
      intervalMinutes = 10080;
    }

    // GBM forward simulation, then drift-adjusted to pin the end at currentPrice.
    // Per-bar vol scales with sqrt(dt): intraday bars use higher per-step vol than daily.
    const sigmaAnn = this.annVolFor(sec);
    const dtYears = intervalMinutes / (252 * 6.5 * 60);
    const sigmaBar = sigmaAnn * Math.sqrt(Math.max(dtYears, 1e-6));
    let fwd = currentPrice * Math.exp(-0.02 * count * dtYears); // start slightly below spot
    const closes: number[] = [];
    for (let i = 0; i < count; i++) {
      const z = this.randn();
      fwd = Math.max(0.1, fwd * Math.exp(-0.5 * sigmaBar * sigmaBar + sigmaBar * z));
      closes.push(fwd);
    }
    // De-drift so the path ends exactly at spot (bridge correction)
    const driftErr = closes[closes.length - 1] / currentPrice;
    const tempPrices: { open: number; high: number; low: number; close: number; vol: number }[] = [];
    for (let i = 0; i < count; i++) {
      const bridgeAdj = Math.pow(driftErr, -i / (count - 1 || 1));
      const close = closes[i] * bridgeAdj;
      const open = i === 0 ? close * (1 - sigmaBar * 0.2 * this.randn()) : tempPrices[i - 1].close;
      const high = Math.max(open, close) + Math.abs(this.randn()) * close * sigmaBar * 0.5;
      const low = Math.min(open, close) - Math.abs(this.randn()) * close * sigmaBar * 0.5;
      const baseVol = sec.avgVolume || 1000000;
      const volume = Math.max(1000, Math.floor(baseVol * (0.5 + Math.random()) * (intervalMinutes / 1440 + 0.2)));

      tempPrices.push({
        open: +open.toFixed(2),
        high: +high.toFixed(2),
        low: +low.toFixed(2),
        close: +close.toFixed(2),
        vol: volume,
      });
    }

    const now = Date.now();
    for (let i = 0; i < count; i++) {
      const p = tempPrices[i];
      const timeOffset = (count - 1 - i) * intervalMinutes * 60 * 1000;
      const date = new Date(now - timeOffset);

      let timeStr: string;
      if (timeframe === '1D' || timeframe === '5D') {
        timeStr = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
      } else {
        timeStr = date.toLocaleDateString([], { month: 'short', day: 'numeric' });
      }

      points.push({
        time: timeStr,
        open: p.open,
        high: p.high,
        low: p.low,
        close: p.close,
        volume: p.vol,
      });
    }

    // Ensure the last close matches currentPrice exactly
    if (points.length > 0) {
      points[points.length - 1].close = currentPrice;
      points[points.length - 1].high = Math.max(points[points.length - 1].high, currentPrice);
      points[points.length - 1].low = Math.min(points[points.length - 1].low, currentPrice);
    }

    return points;
  }
}

export const marketEngine = new MarketEngine();
