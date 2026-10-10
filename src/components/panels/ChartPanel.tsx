import React, { useState, useEffect, useMemo, useRef } from 'react';
import type { PricePoint, Security } from '../../types/terminal';
import { marketEngine } from '../../services/marketEngine';
import { atr, bollinger, ema, smaCrossBacktest, vwap } from '../../services/quant';
import { fetchChartSeries, getFeedStatus, marketSessionLabel } from '../../services/liveData';
import { audioService } from '../../services/audioService';
import { usePersistentState, isOneOf } from '../../hooks/usePersistentState';
import { TrendingUp, TrendingDown } from 'lucide-react';
interface ChartPanelProps {
  security: Security;
  onSelectTicker?: (ticker: string) => void;
}

const CHART_TIMEFRAMES = ['1D', '5D', '1M', '6M', '1Y', '5Y'] as const;
type ChartTimeframe = (typeof CHART_TIMEFRAMES)[number];
const CHART_TIMEFRAME_KEY = 'bloomberg-terminal:chart-timeframe:v1';
const CHART_TYPES = ['candles', 'area', 'line'] as const;
type ChartType = (typeof CHART_TYPES)[number];
const SUB_INDICATORS = ['volume', 'rsi', 'macd'] as const;
type SubIndicator = (typeof SUB_INDICATORS)[number];

const loadChartTimeframe = (): ChartTimeframe => {
  try {
    const saved = window.localStorage.getItem(CHART_TIMEFRAME_KEY);
    if (saved) {
      let parsed: unknown = saved;
      try {
        parsed = JSON.parse(saved);
      } catch {
        parsed = saved;
      }
      if (typeof parsed === 'string' && (CHART_TIMEFRAMES as readonly string[]).includes(parsed)) {
        return parsed as ChartTimeframe;
      }
    }
  } catch {
    // Browser storage unavailable — fall through to the default.
  }
  return '1D';
};

const loadBool = (key: string, fallback: boolean): boolean => {
  try {
    const saved = window.localStorage.getItem(key);
    if (saved != null) return JSON.parse(saved) === true;
  } catch {
    // fall through
  }
  return fallback;
};

export const ChartPanel: React.FC<ChartPanelProps> = ({ security }) => {
  const [timeframe, setTimeframe] = useState<ChartTimeframe>(loadChartTimeframe);
  const [chartType, setChartType] = usePersistentState<ChartType>(
    'bloomberg-terminal:chart:type:v1',
    'candles',
    isOneOf(CHART_TYPES),
  );
  const [showSMA20, setShowSMA20] = useState<boolean>(() => loadBool('bloomberg-terminal:chart:sma20:v1', true));
  const [showSMA50, setShowSMA50] = useState<boolean>(() => loadBool('bloomberg-terminal:chart:sma50:v1', true));
  const [showEMA12, setShowEMA12] = useState<boolean>(() => loadBool('bloomberg-terminal:chart:ema12:v1', false));
  const [showBB, setShowBB] = useState<boolean>(() => loadBool('bloomberg-terminal:chart:bb:v1', false));
  const [showVWAP, setShowVWAP] = useState<boolean>(() => loadBool('bloomberg-terminal:chart:vwap:v1', false));
  const [logScale, setLogScale] = useState<boolean>(() => loadBool('bloomberg-terminal:chart:log:v1', false));
  const [showBacktest, setShowBacktest] = useState<boolean>(() => loadBool('bloomberg-terminal:chart:backtest:v1', false));
  const [subIndicator, setSubIndicator] = usePersistentState<SubIndicator>(
    'bloomberg-terminal:chart:sub:v1',
    'volume',
    isOneOf(SUB_INDICATORS),
  );
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);
  // Render the synthetic series immediately so the panel never mounts empty;
  // the effect below swaps in real OHLCV data when the API responds.
  const [data, setData] = useState<PricePoint[]>(() => marketEngine.generateChartData(security.ticker, timeframe));
  const [dataSource, setDataSource] = useState<'simulated' | 'live'>('simulated');
  const [chartError, setChartError] = useState<string | null>(null);
  const [feedTick, setFeedTick] = useState(0);

  const secTicker = security.ticker;

  // Persist the timeframe so it survives close/reopen.
  useEffect(() => {
    try {
      window.localStorage.setItem(CHART_TIMEFRAME_KEY, JSON.stringify(timeframe));
    } catch {
      // Keep the chart usable when browser storage is unavailable.
    }
  }, [timeframe]);

  // Persist overlay + scale prefs so GP keeps the same tech setup across hops.
  useEffect(() => {
    try {
      window.localStorage.setItem('bloomberg-terminal:chart:sma20:v1', JSON.stringify(showSMA20));
      window.localStorage.setItem('bloomberg-terminal:chart:sma50:v1', JSON.stringify(showSMA50));
      window.localStorage.setItem('bloomberg-terminal:chart:ema12:v1', JSON.stringify(showEMA12));
      window.localStorage.setItem('bloomberg-terminal:chart:bb:v1', JSON.stringify(showBB));
      window.localStorage.setItem('bloomberg-terminal:chart:vwap:v1', JSON.stringify(showVWAP));
      window.localStorage.setItem('bloomberg-terminal:chart:log:v1', JSON.stringify(logScale));
      window.localStorage.setItem('bloomberg-terminal:chart:backtest:v1', JSON.stringify(showBacktest));
    } catch {
      // non-fatal
    }
  }, [showSMA20, showSMA50, showEMA12, showBB, showVWAP, logScale, showBacktest]);

  // Tick the feed-age label every 10s so "quotes Xs ago" stays honest.
  useEffect(() => {
    const id = window.setInterval(() => setFeedTick((t) => t + 1), 10_000);
    return () => window.clearInterval(id);
  }, []);

  // New ticker/timeframe needs a synchronous series reset + async live swap.
  useEffect(() => {
    let cancelled = false;
    // Render instantly with the synthetic series, then swap in real OHLCV data.
    const fallback = marketEngine.generateChartData(secTicker, timeframe);
    setData(fallback);
    setDataSource('simulated');
    setChartError(null);
    fetchChartSeries(secTicker, timeframe)
      .then((points) => {
        if (cancelled) return;
        if (points && points.length > 1) {
          // Validate upstream candles — a single NaN open/high/low/close would
          // poison every indicator and SVG path downstream.
          const clean = points.filter(
            (p) =>
              p &&
              Number.isFinite(p.open) &&
              Number.isFinite(p.high) &&
              Number.isFinite(p.low) &&
              Number.isFinite(p.close) &&
              Number.isFinite(p.volume)
          );
          if (clean.length > 1) {
            setData(clean);
            setDataSource('live');
          }
        }
      })
      .catch((err) => {
        if (cancelled) return;
        // Keep the simulated series visible; surface the cause in the status strip.
        setChartError(err instanceof Error ? err.message : 'chart fetch failed');
      });
    return () => {
      cancelled = true;
    };
  }, [secTicker, timeframe]);

  // Update last point if real-time tick changes price. Previously this was
  // throttled with an early-return inside the effect, which permanently
  // dropped any price update that arrived within 2s of the previous one and
  // left the chart pinned to a stale candle. The update is a single-element
  // copy so it is cheap enough to apply on every tick.
  const livePrice = security.price;

  useEffect(() => {
    setData((prev) => {
      if (prev.length === 0) return prev;
      const last = prev[prev.length - 1];
      if (last.close === livePrice) return prev;
      const next = { ...last };
      next.close = livePrice;
      next.high = Math.max(next.high, livePrice);
      next.low = Math.min(next.low, livePrice);
      return [...prev.slice(0, -1), next];
    });
  }, [livePrice]);

  // Calculate technical indicators
  const indicators = useMemo(() => {
    if (data.length === 0) {
      return {
        sma20: [] as (number | null)[],
        sma50: [] as (number | null)[],
        rsi: [] as (number | null)[],
        macd: { line: [] as (number | null)[], signal: [] as (number | null)[], hist: [] as (number | null)[] },
        ema12: [] as (number | null)[],
        bb: { mid: [] as (number | null)[], upper: [] as (number | null)[], lower: [] as (number | null)[] },
        vwapArr: [] as (number | null)[],
        atrArr: [] as (number | null)[],
        backtest: null as ReturnType<typeof smaCrossBacktest>,
      };
    }

    // SMA 20
    const sma20: (number | null)[] = data.map((_, i, arr) => {
      if (i < 19) return null;
      const slice = arr.slice(i - 19, i + 1);
      return slice.reduce((acc, curr) => acc + curr.close, 0) / 20;
    });

    // SMA 50
    const sma50: (number | null)[] = data.map((_, i, arr) => {
      if (i < 49) return null;
      const slice = arr.slice(i - 49, i + 1);
      return slice.reduce((acc, curr) => acc + curr.close, 0) / 50;
    });

    // RSI 14 (Wilder smoothing). gains/losses hold the running *averages*
    // after the seed period — not the raw sums — so the smoothing stays ~1x.
    const rsi: (number | null)[] = [];
    let avgGain = 0;
    let avgLoss = 0;
    for (let i = 0; i < data.length; i++) {
      if (i === 0) {
        rsi.push(null);
        continue;
      }
      const change = data[i].close - data[i - 1].close;
      const gain = change >= 0 ? change : 0;
      const loss = change < 0 ? -change : 0;
      if (i <= 14) {
        avgGain += gain;
        avgLoss += loss;
        if (i < 14) {
          rsi.push(null);
        } else {
          avgGain /= 14;
          avgLoss /= 14;
          const rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
          rsi.push(100 - 100 / (1 + rs));
        }
      } else {
        avgGain = (avgGain * 13 + gain) / 14;
        avgLoss = (avgLoss * 13 + loss) / 14;
        const rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
        rsi.push(100 - 100 / (1 + rs));
      }
    }

    // MACD (12, 26, 9)
    const calcEMA = (period: number): (number | null)[] => {
      const k = 2 / (period + 1);
      const ema: (number | null)[] = [];
      let sum = 0;
      for (let i = 0; i < data.length; i++) {
        if (i < period - 1) {
          sum += data[i].close;
          ema.push(null);
        } else if (i === period - 1) {
          sum += data[i].close;
          ema.push(sum / period);
        } else {
          const prev = ema[i - 1]!;
          ema.push(data[i].close * k + prev * (1 - k));
        }
      }
      return ema;
    };

    const ema12 = calcEMA(12);
    const ema26 = calcEMA(26);

    const macdLine: (number | null)[] = data.map((_, i) => {
      if (ema12[i] !== null && ema26[i] !== null) {
        return ema12[i]! - ema26[i]!;
      }
      return null;
    });

    const validMacdIndices = macdLine
      .map((val, idx) => ({ val, idx }))
      .filter((x): x is { val: number; idx: number } => x.val !== null);

    const signalK = 2 / (9 + 1);
    let sigSum = 0;
    const signalByMacdIdx = new Map<number, number>();

    for (let j = 0; j < validMacdIndices.length; j++) {
      const { val, idx } = validMacdIndices[j];
      if (j < 8) {
        sigSum += val;
      } else if (j === 8) {
        sigSum += val;
        signalByMacdIdx.set(idx, sigSum / 9);
      } else {
        const prevSig = signalByMacdIdx.get(validMacdIndices[j - 1].idx)!;
        signalByMacdIdx.set(idx, val * signalK + prevSig * (1 - signalK));
      }
    }

    const signalLine: (number | null)[] = [];
    const histogram: (number | null)[] = data.map((_, i) => {
      const m = macdLine[i];
      const s = signalByMacdIdx.get(i) ?? null;
      signalLine.push(s);
      return m !== null && s !== null ? m - s : null;
    });

    return {
      sma20,
      sma50,
      rsi,
      macd: { line: macdLine, signal: signalLine, hist: histogram },
      ema12: ema(data.map((d) => d.close), 12),
      bb: bollinger(data.map((d) => d.close), 20, 2),
      vwapArr: vwap(data),
      atrArr: atr(data, 14),
      backtest: smaCrossBacktest(data.map((d) => d.close), 20, 50),
    };
  }, [data]);

  // SVG Chart bounds and scaling
  const chartMetrics = useMemo(() => {
    if (data.length === 0) return { minPrice: 0, maxPrice: 1, maxVol: 1 };
    let min = Infinity;
    let max = -Infinity;
    let maxVol = 0;

    data.forEach((d) => {
      if (Number.isFinite(d.low) && d.low < min) min = d.low;
      if (Number.isFinite(d.high) && d.high > max) max = d.high;
      if (Number.isFinite(d.volume) && d.volume > maxVol) maxVol = d.volume;
    });
    if (!Number.isFinite(min) || !Number.isFinite(max) || min >= max) {
      const fallback = Number.isFinite(data[data.length - 1]?.close) ? data[data.length - 1].close : 100;
      min = fallback * 0.99;
      max = fallback * 1.01;
    }

    const padding = (max - min) * 0.08 || 1;
    return {
      minPrice: min - padding,
      maxPrice: max + padding,
      maxVol: maxVol || 1,
    };
  }, [data]);

  const activePoint = hoverIndex !== null && data[hoverIndex] ? data[hoverIndex] : data[data.length - 1];

  // SVG dimensions
  const svgWidth = 800;
  const svgHeight = 300;
  const subHeight = 90;

  const getX = (index: number) => (index / Math.max(1, data.length - 1)) * (svgWidth - 60) + 10;
  const getY = (price: number) => {
    if (!Number.isFinite(price)) return svgHeight / 2;
    if (!logScale) {
      const range = chartMetrics.maxPrice - chartMetrics.minPrice;
      if (range === 0) return svgHeight / 2;
      return svgHeight - ((price - chartMetrics.minPrice) / range) * (svgHeight - 30) - 15;
    }
    const min = Math.max(0.01, chartMetrics.minPrice);
    const max = Math.max(min + 0.01, chartMetrics.maxPrice);
    const logMin = Math.log(min);
    const logMax = Math.log(max);
    const lp = Math.log(Math.max(0.01, price));
    return svgHeight - ((lp - logMin) / (logMax - logMin)) * (svgHeight - 30) - 15;
  };
  const getSubY = (val: number, max: number) => subHeight - (val / max) * (subHeight - 15) - 5;

  const macdMax = useMemo(() => {
    if (data.length === 0 || !indicators.macd) return 1;
    let maxVal = 0.05;
    const { line, signal, hist } = indicators.macd;
    for (let i = 0; i < data.length; i++) {
      if (line[i] !== null) maxVal = Math.max(maxVal, Math.abs(line[i]!));
      if (signal[i] !== null) maxVal = Math.max(maxVal, Math.abs(signal[i]!));
      if (hist[i] !== null) maxVal = Math.max(maxVal, Math.abs(hist[i]!));
    }
    return maxVal * 1.2 || 1;
  }, [data, indicators.macd]);

  const getMacdY = (val: number) => {
    const mid = subHeight / 2;
    return mid - (val / macdMax) * (mid - 8);
  };

  const isPositive = security.change >= 0;

  return (
    <div className="flex flex-col h-full w-full bg-[#080c14] text-zinc-300 font-mono text-xs select-none">
      {/* Chart Top Metrics Header */}
      <div className="flex flex-wrap items-center justify-between px-2 py-1 bg-[#0c121e] border-b border-[#182236] gap-1.5">
        <div className="flex items-center space-x-3">
          <span className="text-base font-bold text-amber-400">{security.ticker}</span>
          <span className="text-zinc-400 text-[11px] truncate max-w-[150px]">{security.name}</span>
          <div className="flex items-baseline space-x-1.5">
            {/* Header price is always the live security price. Previously this
                showed the hovered/last chart candle close, so hovering the
                chart or a stale series (e.g. GOLD) displayed a price that
                disagreed with the change % next to it. The hovered candle
                still drives the OHLC tooltip below. */}
            <span className="text-base font-bold text-white">
              {security.currency === 'INR' ? '₹' : '$'}
              {security.price.toFixed(2)}
            </span>
            <span
              className={`flex items-center font-bold text-[11px] ${
                isPositive ? 'text-emerald-400' : 'text-rose-400'
              }`}
            >
              {isPositive ? <TrendingUp className="w-3 h-3 mr-0.5 inline" /> : <TrendingDown className="w-3 h-3 mr-0.5 inline" />}
              {isPositive ? '+' : ''}
              {security.change.toFixed(2)} ({isPositive ? '+' : ''}
              {security.changePercent.toFixed(2)}%)
            </span>
            <span
              className={`text-[9px] font-bold px-1.5 py-0.5 rounded border ${
                dataSource === 'live'
                  ? 'text-emerald-400 border-emerald-500/40 bg-emerald-500/10'
                  : 'text-zinc-500 border-[#212d44]'
              }`}
            >
              {dataSource === 'live' ? 'LIVE · YAHOO FINANCE' : 'SIMULATED SERIES'}
            </span>
          </div>
        </div>

        {/* OHLC Tooltip Banner — wraps on mobile instead of hiding */}
        {activePoint && (
          <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-zinc-400 bg-[#121a2b] px-2.5 py-1 rounded border border-[#1f2c45] select-text">
            {dataSource === 'simulated' && (
              <span className="text-[9px] font-bold px-1 py-px rounded border border-dashed border-amber-500/50 text-amber-300">
                SIM
              </span>
            )}
            <span>TIME: <span className="text-zinc-200">{activePoint.time}</span></span>
            <span>O: <span className="text-zinc-200">{activePoint.open.toFixed(2)}</span></span>
            <span>H: <span className="text-emerald-300">{activePoint.high.toFixed(2)}</span></span>
            <span>L: <span className="text-rose-300">{activePoint.low.toFixed(2)}</span></span>
            <span>C: <span className="text-amber-300">{activePoint.close.toFixed(2)}</span></span>
            <span>VOL: <span className="text-zinc-200">{(activePoint.volume / 1000).toFixed(0)}k</span></span>
          </div>
        )}

        {/* Timeframe & Overlay Toggles */}
        <div className="flex items-center space-x-1">
          {/* Timeframes */}
          <div className="flex items-center bg-[#101726] border border-[#202c44] rounded p-0.5 space-x-0.5" role="group" aria-label="Chart timeframe">
            {(['1D', '5D', '1M', '6M', '1Y', '5Y'] as const).map((tf) => (
              <button
                key={tf}
                onClick={() => {
                  audioService.playKeyClick();
                  setTimeframe(tf);
                }}
                aria-pressed={timeframe === tf}
                className={`px-1.5 py-0.5 text-[10px] font-bold rounded transition-colors min-h-[24px] focus-visible:outline-2 focus-visible:outline-amber-400 ${
                  timeframe === tf ? 'bg-amber-500 text-black' : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                {tf}
              </button>
            ))}
          </div>

          {/* Chart Style Switcher */}
          <div className="flex items-center bg-[#101726] border border-[#202c44] rounded p-0.5 space-x-0.5" role="group" aria-label="Chart style">
            <button
              onClick={() => {
                audioService.playKeyClick();
                setChartType('candles');
              }}
              aria-pressed={chartType === 'candles'}
              title="Candlestick Chart"
              className={`px-1.5 py-0.5 text-[10px] rounded ${
                chartType === 'candles' ? 'bg-amber-500 text-black font-bold' : 'text-zinc-400'
              }`}
            >
              CANDLES
            </button>
            <button
              onClick={() => {
                audioService.playKeyClick();
                setChartType('area');
              }}
              aria-pressed={chartType === 'area'}
              title="Mountain/Area Chart"
              className={`px-1.5 py-0.5 text-[10px] rounded min-h-[24px] focus-visible:outline-2 focus-visible:outline-amber-400 ${
                chartType === 'area' ? 'bg-amber-500 text-black font-bold' : 'text-zinc-400'
              }`}
            >
              MOUNTAIN
            </button>
            <button
              onClick={() => {
                audioService.playKeyClick();
                setChartType('line');
              }}
              aria-pressed={chartType === 'line'}
              title="Line Chart"
              className={`px-1.5 py-0.5 text-[10px] rounded min-h-[24px] focus-visible:outline-2 focus-visible:outline-amber-400 ${
                chartType === 'line' ? 'bg-amber-500 text-black font-bold' : 'text-zinc-400'
              }`}
            >
              LINE
            </button>
          </div>

          {/* Technical Overlays Toggles */}
          <button
            onClick={() => setShowSMA20(!showSMA20)}
            aria-pressed={showSMA20}
            title="20-period simple moving average (cyan)"
            className={`px-1.5 py-0.5 text-[10px] rounded border min-h-[24px] focus-visible:outline-2 focus-visible:outline-amber-400 ${
              showSMA20 ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40' : 'bg-transparent text-zinc-500 border-zinc-800'
            }`}
          >
            SMA(20)
          </button>
          <button
            onClick={() => setShowSMA50(!showSMA50)}
            aria-pressed={showSMA50}
            title="50-period simple moving average (amber)"
            className={`px-1.5 py-0.5 text-[10px] rounded border min-h-[24px] focus-visible:outline-2 focus-visible:outline-amber-400 ${
              showSMA50 ? 'bg-amber-500/20 text-amber-300 border-amber-500/40' : 'bg-transparent text-zinc-500 border-zinc-800'
            }`}
          >
            SMA(50)
          </button>
          <button
            onClick={() => setShowEMA12(!showEMA12)}
            aria-pressed={showEMA12}
            title="12-period exponential moving average (purple)"
            className={`px-1.5 py-0.5 text-[10px] rounded border min-h-[24px] focus-visible:outline-2 focus-visible:outline-amber-400 ${
              showEMA12 ? 'bg-purple-500/20 text-purple-300 border-purple-500/40' : 'bg-transparent text-zinc-500 border-zinc-800'
            }`}
          >
            EMA(12)
          </button>
          <button
            onClick={() => setShowBB(!showBB)}
            aria-pressed={showBB}
            title="Bollinger Bands, 20-period 2 std dev (green)"
            className={`px-1.5 py-0.5 text-[10px] rounded border min-h-[24px] focus-visible:outline-2 focus-visible:outline-amber-400 ${
              showBB ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40' : 'bg-transparent text-zinc-500 border-zinc-800'
            }`}
          >
            BB(20)
          </button>
          <button
            onClick={() => setShowVWAP(!showVWAP)}
            aria-pressed={showVWAP}
            title="Volume-weighted average price (pink)"
            className={`px-1.5 py-0.5 text-[10px] rounded border min-h-[24px] focus-visible:outline-2 focus-visible:outline-amber-400 ${
              showVWAP ? 'bg-pink-500/20 text-pink-300 border-pink-500/40' : 'bg-transparent text-zinc-500 border-zinc-800'
            }`}
          >
            VWAP
          </button>
          <button
            onClick={() => setLogScale(!logScale)}
            aria-pressed={logScale}
            title="Logarithmic price scale — use for long ranges (e.g. 5Y) to compare % moves"
            className={`px-1.5 py-0.5 text-[10px] rounded border min-h-[24px] focus-visible:outline-2 focus-visible:outline-amber-400 ${
              logScale ? 'bg-white/10 text-white border-zinc-500' : 'bg-transparent text-zinc-500 border-zinc-800'
            }`}
          >
            LOG
          </button>
          <button
            onClick={() => setShowBacktest(!showBacktest)}
            className={`px-1.5 py-0.5 text-[10px] rounded border ${
              showBacktest ? 'bg-amber-500/20 text-amber-300 border-amber-500/40' : 'bg-transparent text-zinc-500 border-zinc-800'
            }`}
          >
            BACKTEST
          </button>
        </div>
      </div>
      {/* Feed + ATR + backtest status strip */}
      <div className="flex flex-wrap items-center gap-2 px-2 py-0.5 bg-[#0a0f18] border-b border-[#182236] text-[9px] text-zinc-500">
        <span>
          {(() => {
            const st = getFeedStatus();
            // feedTick (10s interval above) re-renders this strip so the age label
            // stays fresh via the feedTick interval above.
            void feedTick;
            const ageMs = Date.now() - (st.lastQuotesAt ?? 0);
            const age = st.lastQuotesAt ? Math.round(ageMs / 1000) + 's ago' : 'never';
            const feedErr = chartError ?? st.lastQuoteError;
            const series =
              dataSource === 'live'
                ? 'SERIES: LIVE · YAHOO'
                : 'SERIES: SIMULATED — ILLUSTRATIVE ONLY, NOT MARKET DATA';
            return `FEED: ${st.live ? (st.stale ? 'LIVE-STALE' : 'LIVE') : 'SIMULATED'} · quotes ${age} · ${series} · ${marketSessionLabel()}${
              feedErr ? ` · ERR: ${feedErr.slice(0, 60)}` : ''
            }`;
          })()}
        </span>
        <span>
          ATR(14):{' '}
          <strong className="text-zinc-200">
            {(() => {
              const a = indicators.atrArr?.[indicators.atrArr.length - 1];
              return a != null ? a.toFixed(2) : '--';
            })()}
          </strong>
        </span>
        {showBacktest && indicators.backtest && (
          <span className="text-amber-300">
            SMA20/50 L/F: {indicators.backtest.lastSignal} · TRADES {indicators.backtest.trades} · WIN{' '}
            {indicators.backtest.winRate.toFixed(0)}% · RET {(indicators.backtest.totalReturn * 100).toFixed(1)}% vs B/H{' '}
            {(indicators.backtest.buyHoldReturn * 100).toFixed(1)}% · Sharpe{' '}
            {indicators.backtest.sharpe != null ? indicators.backtest.sharpe.toFixed(2) : 'N/A'} · MDD{' '}
            {(indicators.backtest.maxDrawdown * 100).toFixed(1)}% · 5bps/trade
          </span>
        )}
      </div>

      {/* Simulated-series banner: segregates generated bars from market data */}
      {dataSource === 'simulated' && (
        <div
          role="note"
          className="shrink-0 mx-2 mt-1 rounded border border-dashed border-amber-500/50 bg-amber-500/5 px-2 py-0.5 text-[9px] font-bold tracking-wide text-amber-300"
        >
          SIMULATED SERIES — ILLUSTRATIVE ONLY · NOT MARKET DATA
        </div>
      )}

      {/* Main SVG Interactive Chart Area — keyboard + touch accessible */}
      <div
        ref={containerRef}
        tabIndex={0}
        role="application"
        aria-label={`${security.ticker} price chart, ${timeframe}. Use left and right arrow keys to inspect candles.`}
        onKeyDown={(e) => {
          if (data.length === 0) return;
          if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
            e.preventDefault();
            setHoverIndex((prev) => {
              const base = prev ?? data.length - 1;
              const next = e.key === 'ArrowRight' ? Math.min(data.length - 1, base + 1) : Math.max(0, base - 1);
              return next;
            });
          } else if (e.key === 'Escape') {
            setHoverIndex(null);
          }
        }}
        className="flex-1 w-full relative min-h-[220px] bg-[#070b12] focus-visible:outline-2 focus-visible:outline-amber-400"
        onMouseMove={(e) => {
          if (!containerRef.current || data.length === 0) return;
          const rect = containerRef.current.getBoundingClientRect();
          // Map client px → viewBox coords, then invert getX().
          // Plot area spans viewBox x=10 → svgWidth-50 (width svgWidth-60).
          const mouseX = e.clientX - rect.left;
          const vbX = (mouseX / Math.max(1, rect.width)) * svgWidth;
          const frac = (vbX - 10) / Math.max(1, svgWidth - 60);
          const index = Math.round(frac * (data.length - 1));
          if (index >= 0 && index < data.length) {
            setHoverIndex(index);
          }
        }}
        onMouseLeave={() => setHoverIndex(null)}
        onTouchMove={(e) => {
          if (!containerRef.current || data.length === 0) return;
          const touch = e.touches[0];
          if (!touch) return;
          const rect = containerRef.current.getBoundingClientRect();
          const mouseX = touch.clientX - rect.left;
          const vbX = (mouseX / Math.max(1, rect.width)) * svgWidth;
          const frac = (vbX - 10) / Math.max(1, svgWidth - 60);
          const index = Math.round(frac * (data.length - 1));
          if (index >= 0 && index < data.length) {
            setHoverIndex(index);
          }
        }}
      >
        <svg
          viewBox={`0 0 ${svgWidth} ${svgHeight}`}
          role="img"
          aria-label={`${security.ticker} ${timeframe} ${chartType} chart, last close ${data.length > 0 ? data[data.length - 1].close.toFixed(2) : 'unavailable'}`}
          className="w-full h-full overflow-visible"
          preserveAspectRatio="none"
        >
          <title>{`${security.ticker} price history`}</title>
          <defs>
            <linearGradient id="areaGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#ff9900" stopOpacity="0.35" />
              <stop offset="100%" stopColor="#ff9900" stopOpacity="0.0" />
            </linearGradient>
            <linearGradient id="bullGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#00e676" stopOpacity="0.3" />
              <stop offset="100%" stopColor="#00e676" stopOpacity="0.0" />
            </linearGradient>
          </defs>

          {/* Grid lines */}
          {[0.2, 0.4, 0.6, 0.8].map((ratio) => {
            const price = chartMetrics.minPrice + (chartMetrics.maxPrice - chartMetrics.minPrice) * (1 - ratio);
            const y = ratio * svgHeight;
            return (
              <g key={ratio}>
                <line x1="10" y1={y} x2={svgWidth - 50} y2={y} stroke="#131c2c" strokeDasharray="3 3" />
                <text x={svgWidth - 45} y={y + 3} fill="#50617a" fontSize="9" fontFamily="monospace">
                  {price.toFixed(1)}
                </text>
              </g>
            );
          })}

          {/* Mountain / Area Chart Path */}
          {chartType === 'area' && data.length > 1 && (
            <>
              <path
                d={`M ${getX(0)} ${getY(data[0].close)} ${data
                  .slice(1)
                  .map((d, k) => `L ${getX(k + 1)} ${getY(d.close)}`)
                  .join(' ')} L ${getX(data.length - 1)} ${svgHeight} L ${getX(0)} ${svgHeight} Z`}
                fill="url(#areaGradient)"
              />
              <path
                d={`M ${getX(0)} ${getY(data[0].close)} ${data
                  .slice(1)
                  .map((d, k) => `L ${getX(k + 1)} ${getY(d.close)}`)
                  .join(' ')}`}
                fill="none"
                stroke="#ff9900"
                strokeWidth="2"
              />
            </>
          )}

          {/* Line Chart Path */}
          {chartType === 'line' && data.length > 1 && (
            <path
              d={`M ${getX(0)} ${getY(data[0].close)} ${data
                .slice(1)
                .map((d, k) => `L ${getX(k + 1)} ${getY(d.close)}`)
                .join(' ')}`}
              fill="none"
              stroke="#00d4ff"
              strokeWidth="2"
            />
          )}

          {/* Candlesticks (adaptive width so dense timeframes don't blob) */}
          {chartType === 'candles' &&
            data.map((d, i) => {
              const x = getX(i);
              const isBull = d.close >= d.open;
              const yOpen = getY(d.open);
              const yClose = getY(d.close);
              const yHigh = getY(d.high);
              const yLow = getY(d.low);
              const bodyTop = Math.min(yOpen, yClose);
              const bodyHeight = Math.max(1.5, Math.abs(yOpen - yClose));
              const color = isBull ? '#00e676' : '#ff334b';
              const slot = (svgWidth - 60) / Math.max(1, data.length);
              const bodyW = Math.max(1.5, Math.min(8, slot * 0.6));

              return (
                <g key={i}>
                  {/* High/Low Wick */}
                  <line x1={x} y1={yHigh} x2={x} y2={yLow} stroke={color} strokeWidth="1" />
                  {/* Candle Body */}
                  <rect
                    x={x - bodyW / 2}
                    y={bodyTop}
                    width={bodyW}
                    height={bodyHeight}
                    fill={isBull ? '#00e676' : '#ff334b'}
                    stroke={color}
                    strokeWidth="0.5"
                  />
                </g>
              );
            })}

          {/* SMA 20 Overlay (Cyan) */}
          {showSMA20 && (
            <path
              d={indicators.sma20
                .map((val, i) => (val !== null ? `${i === 19 ? 'M' : 'L'} ${getX(i)} ${getY(val)}` : ''))
                .filter(Boolean)
                .join(' ')}
              fill="none"
              stroke="#00d4ff"
              strokeWidth="1.5"
              opacity="0.85"
            />
          )}

          {/* SMA 50 Overlay (Amber) */}
          {showSMA50 && (
            <path
              d={indicators.sma50
                .map((val, i) => (val !== null ? `${i === 49 ? 'M' : 'L'} ${getX(i)} ${getY(val)}` : ''))
                .filter(Boolean)
                .join(' ')}
              fill="none"
              stroke="#ffaa00"
              strokeWidth="1.5"
              opacity="0.85"
            />
          )}

          {/* EMA 12 Overlay (Purple) */}
          {showEMA12 && indicators.ema12 && (
            <path
              d={indicators.ema12
                .map((val, i) => (val !== null ? `${i === 0 || indicators.ema12[i - 1] === null ? 'M' : 'L'} ${getX(i)} ${getY(val)}` : ''))
                .filter(Boolean)
                .join(' ')}
              fill="none"
              stroke="#c084fc"
              strokeWidth="1.5"
              opacity="0.9"
            />
          )}

          {/* Bollinger Bands */}
          {showBB && indicators.bb && (
            <>
              <path
                d={indicators.bb.upper
                  .map((val, i) => (val !== null ? `${i === 0 || indicators.bb.upper[i - 1] === null ? 'M' : 'L'} ${getX(i)} ${getY(val)}` : ''))
                  .filter(Boolean)
                  .join(' ')}
                fill="none"
                stroke="#00e676"
                strokeWidth="1"
                strokeDasharray="4 2"
                opacity="0.8"
              />
              <path
                d={indicators.bb.lower
                  .map((val, i) => (val !== null ? `${i === 0 || indicators.bb.lower[i - 1] === null ? 'M' : 'L'} ${getX(i)} ${getY(val)}` : ''))
                  .filter(Boolean)
                  .join(' ')}
                fill="none"
                stroke="#ff334b"
                strokeWidth="1"
                strokeDasharray="4 2"
                opacity="0.8"
              />
            </>
          )}

          {/* VWAP */}
          {showVWAP && indicators.vwapArr && (
            <path
              d={indicators.vwapArr
                .map((val, i) => (val !== null ? `${i === 0 ? 'M' : 'L'} ${getX(i)} ${getY(val)}` : ''))
                .filter(Boolean)
                .join(' ')}
              fill="none"
              stroke="#f472b6"
              strokeWidth="1.5"
              opacity="0.9"
            />
          )}

          {/* Interactive Crosshair */}
          {hoverIndex !== null && data[hoverIndex] && (
            <g>
              <line
                x1={getX(hoverIndex)}
                y1="0"
                x2={getX(hoverIndex)}
                y2={svgHeight}
                stroke="#ff9900"
                strokeWidth="1"
                strokeDasharray="2 2"
                opacity="0.8"
              />
              <line
                x1="10"
                y1={getY(data[hoverIndex].close)}
                x2={svgWidth - 50}
                y2={getY(data[hoverIndex].close)}
                stroke="#ff9900"
                strokeWidth="1"
                strokeDasharray="2 2"
                opacity="0.8"
              />
              <circle
                cx={getX(hoverIndex)}
                cy={getY(data[hoverIndex].close)}
                r="3.5"
                fill="#ff9900"
                stroke="#000"
                strokeWidth="1.5"
              />
            </g>
          )}
        </svg>
      </div>

      {/* Sub-Indicator Section (Volume / RSI / MACD) */}
      <div className="h-20 bg-[#0a0f18] border-t border-[#182236] relative flex flex-col">
        <div className="flex items-center justify-between px-2 py-0.5 bg-[#0d1422] border-b border-[#182338] text-[10px]">
          <div className="flex items-center space-x-2">
            <span className="text-zinc-500 font-bold">SUB-INDICATOR:</span>
            <div className="flex space-x-1">
              {(['volume', 'rsi', 'macd'] as const).map((ind) => (
                <button
                  key={ind}
                  onClick={() => {
                    audioService.playKeyClick();
                    setSubIndicator(ind);
                  }}
                  className={`px-1.5 py-0.5 rounded uppercase font-bold text-[9px] ${
                    subIndicator === ind
                      ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                      : 'text-zinc-500 hover:text-zinc-300'
                  }`}
                >
                  {ind}
                </button>
              ))}
            </div>
          </div>

          <div className="text-zinc-400 text-[10px]">
            {subIndicator === 'volume' && (
              <span>VOL: <strong className="text-zinc-200">{(activePoint ? activePoint.volume : 0).toLocaleString()}</strong></span>
            )}
            {subIndicator === 'rsi' && (
              <span>
                RSI(14):{' '}
                <strong
                  className={
                    hoverIndex !== null && indicators.rsi[hoverIndex] != null && indicators.rsi[hoverIndex]! > 70
                      ? 'text-rose-400'
                      : hoverIndex !== null && indicators.rsi[hoverIndex] != null && indicators.rsi[hoverIndex]! < 30
                      ? 'text-emerald-400'
                      : 'text-amber-400'
                  }
                >
                  {(() => {
                    const hovered = hoverIndex !== null ? indicators.rsi[hoverIndex] : null;
                    const latest = indicators.rsi[indicators.rsi.length - 1];
                    const shown = hovered ?? latest;
                    return shown != null ? shown.toFixed(1) : '--';
                  })()}
                </strong>
              </span>
            )}
            {subIndicator === 'macd' && (() => {
              const idx = hoverIndex !== null ? hoverIndex : data.length - 1;
              const macdVal = indicators.macd?.line[idx] ?? null;
              const sigVal = indicators.macd?.signal[idx] ?? null;
              const histVal = indicators.macd?.hist[idx] ?? null;
              return (
                <span className="space-x-2">
                  <span>MACD(12,26): <strong className="text-cyan-300">{macdVal !== null ? macdVal.toFixed(2) : '--'}</strong></span>
                  <span>SIG(9): <strong className="text-amber-300">{sigVal !== null ? sigVal.toFixed(2) : '--'}</strong></span>
                  <span>HIST: <strong className={histVal !== null && histVal >= 0 ? 'text-emerald-400' : 'text-rose-400'}>{histVal !== null ? `${histVal >= 0 ? '+' : ''}${histVal.toFixed(2)}` : '--'}</strong></span>
                </span>
              );
            })()}
          </div>
        </div>

        {/* Sub-chart SVG */}
        <div className="flex-1 w-full relative">
          <svg viewBox={`0 0 ${svgWidth} ${subHeight}`} className="w-full h-full" preserveAspectRatio="none">
            {subIndicator === 'volume' &&
              data.map((d, i) => {
                const x = getX(i);
                const isBull = d.close >= d.open;
                const h = (d.volume / chartMetrics.maxVol) * (subHeight - 15);
                return (
                  <rect
                    key={i}
                    x={x - 2}
                    y={subHeight - h - 5}
                    width="4"
                    height={h}
                    fill={isBull ? '#00e676' : '#ff334b'}
                    opacity={hoverIndex === i ? 0.9 : 0.45}
                  />
                );
              })}

            {subIndicator === 'rsi' && (
              <>
                {/* 70 overbought and 30 oversold bands */}
                <line x1="10" y1={getSubY(70, 100)} x2={svgWidth - 50} y2={getSubY(70, 100)} stroke="#ff334b" strokeDasharray="3 3" opacity="0.5" />
                <line x1="10" y1={getSubY(30, 100)} x2={svgWidth - 50} y2={getSubY(30, 100)} stroke="#00e676" strokeDasharray="3 3" opacity="0.5" />
                <path
                  d={indicators.rsi
                    .map((val, i) => (val !== null ? `${i === 14 ? 'M' : 'L'} ${getX(i)} ${getSubY(val, 100)}` : ''))
                    .filter(Boolean)
                    .join(' ')}
                  fill="none"
                  stroke="#ff9900"
                  strokeWidth="1.5"
                />
              </>
            )}

            {subIndicator === 'macd' && (
              <>
                {/* Zero line */}
                <line x1="10" y1={subHeight / 2} x2={svgWidth - 50} y2={subHeight / 2} stroke="#2b3b55" strokeDasharray="3 3" />
                {/* Histogram Bars */}
                {data.map((_, i) => {
                  const h = indicators.macd?.hist[i];
                  if (h === null || h === undefined) return null;
                  const x = getX(i);
                  const zeroY = subHeight / 2;
                  const barY = getMacdY(h);
                  const isBull = h >= 0;
                  const top = isBull ? barY : zeroY;
                  const height = Math.max(1, Math.abs(zeroY - barY));
                  return (
                    <rect
                      key={i}
                      x={x - 2}
                      y={top}
                      width="4"
                      height={height}
                      fill={isBull ? '#00e676' : '#ff334b'}
                      opacity={hoverIndex === i ? 0.95 : 0.55}
                    />
                  );
                })}
                {/* MACD Line (Cyan) */}
                <path
                  d={indicators.macd?.line
                    .map((val, i) => {
                      if (val === null) return '';
                      const isFirst = i === 0 || indicators.macd.line[i - 1] === null;
                      return `${isFirst ? 'M' : 'L'} ${getX(i)} ${getMacdY(val)}`;
                    })
                    .filter(Boolean)
                    .join(' ')}
                  fill="none"
                  stroke="#00d4ff"
                  strokeWidth="1.5"
                />
                {/* Signal Line (Amber) */}
                <path
                  d={indicators.macd?.signal
                    .map((val, i) => {
                      if (val === null) return '';
                      const isFirst = i === 0 || indicators.macd.signal[i - 1] === null;
                      return `${isFirst ? 'M' : 'L'} ${getX(i)} ${getMacdY(val)}`;
                    })
                    .filter(Boolean)
                    .join(' ')}
                  fill="none"
                  stroke="#ffaa00"
                  strokeWidth="1.5"
                />
              </>
            )}
          </svg>
        </div>
      </div>
    </div>
  );
};
