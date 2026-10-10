import React, { useEffect, useState } from 'react';
import type { Security } from '../../types/terminal';
import { marketEngine } from '../../services/marketEngine';
import { fetchChartSeries } from '../../services/liveData';
import { audioService } from '../../services/audioService';
import { usePersistentState, isOneOf } from '../../hooks/usePersistentState';
import {
  fitGaussianHMM,
  hmmSelfTest,
  labelStates,
  logReturns,
  scoreSignal,
  type HMMFit,
  type RegimeSignal,
  type SelfTestResult,
} from '../../services/hmm';
import { Activity, Crosshair, FlaskConical } from 'lucide-react';
import { PanelSection } from '../layout/PanelSection';

interface SignalsPanelProps {
  security: Security;
  onSelectTicker?: (ticker: string) => void;
}

type SigTimeframe = '6M' | '1Y' | '5Y';
const SIG_TIMEFRAMES = ['6M', '1Y', '5Y'] as const;
const SIG_STATES = [2, 3, 4] as const;
type SigStates = (typeof SIG_STATES)[number];

/** Liquid names covering US / India / commodities / crypto. Filtered at runtime. */
const WATCHLIST = [
  'SPX', 'NDX', 'NIFTY50', 'SENSEX30',
  'NVDA', 'AAPL', 'MSFT', 'TSLA', 'AMZN', 'GOOGL', 'META', 'JPM',
  'RELIANCE', 'TCS', 'INFY', 'HDFCBANK',
  'GOLD', 'BTC/USD',
];

const CACHE_TTL_MS = 5 * 60 * 1000;
const closesCache = new Map<string, { closes: number[]; live: boolean; exp: number }>();
const fitCache = new Map<string, { fit: HMMFit; signal: RegimeSignal; live: boolean; exp: number }>();

const BAR_LABEL: Record<SigTimeframe, string> = { '6M': 'daily bars', '1Y': 'daily bars', '5Y': 'weekly bars' };
const ANN_FACTOR: Record<SigTimeframe, number> = { '6M': 252, '1Y': 252, '5Y': 52 };

const isSigStates = (v: unknown): v is SigStates =>
  typeof v === 'number' && (SIG_STATES as readonly number[]).includes(v);

async function getCloses(
  ticker: string,
  timeframe: SigTimeframe,
): Promise<{ closes: number[]; live: boolean }> {
  const key = `${ticker}:${timeframe}`;
  const hit = closesCache.get(key);
  if (hit && hit.exp > Date.now()) return { closes: hit.closes, live: hit.live };
  let closes: number[] = [];
  let live = false;
  try {
    const points = await fetchChartSeries(ticker, timeframe);
    if (points && points.length >= 40) {
      const clean = points.map((p) => p.close).filter((c) => Number.isFinite(c) && c > 0);
      if (clean.length >= 40) {
        closes = clean;
        live = true;
      }
    }
  } catch {
    // fall through to synthetic
  }
  if (closes.length < 40) {
    closes = marketEngine
      .generateChartData(ticker, timeframe)
      .map((p) => p.close)
      .filter((c) => Number.isFinite(c) && c > 0);
    live = false;
  }
  closesCache.set(key, { closes, live, exp: Date.now() + CACHE_TTL_MS });
  if (closesCache.size > 100) {
    const oldest = closesCache.keys().next();
    if (!oldest.done) closesCache.delete(oldest.value);
  }
  return { closes, live };
}

async function getFit(
  ticker: string,
  timeframe: SigTimeframe,
  nStates: SigStates,
  restarts: number,
): Promise<{ fit: HMMFit; signal: RegimeSignal; live: boolean } | null> {
  const key = `${ticker}:${timeframe}:${nStates}`;
  const hit = fitCache.get(key);
  if (hit && hit.exp > Date.now()) return { fit: hit.fit, signal: hit.signal, live: hit.live };
  const { closes, live } = await getCloses(ticker, timeframe);
  const rets = logReturns(closes);
  const { fit } = fitGaussianHMM(rets, nStates, { restarts });
  if (!fit) return null;
  const signal = scoreSignal(fit);
  fitCache.set(key, { fit, signal, live, exp: Date.now() + CACHE_TTL_MS });
  if (fitCache.size > 100) {
    const oldest = fitCache.keys().next();
    if (!oldest.done) fitCache.delete(oldest.value);
  }
  return { fit, signal, live };
}

interface ScanRow {
  ticker: string;
  name: string;
  direction: RegimeSignal['direction'];
  strength: number;
  regime: string;
  regimeProb: number;
  pBull: number;
  expRetPct: number;
  confidence: number;
  live: boolean;
  n: number;
}

const dirClass = (d: RegimeSignal['direction']): string =>
  d === 'LONG' ? 'text-emerald-400' : d === 'SHORT' ? 'text-rose-400' : 'text-zinc-400';

const dirBadge = (d: RegimeSignal['direction']): string =>
  d === 'LONG'
    ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/40'
    : d === 'SHORT'
      ? 'bg-rose-500/15 text-rose-300 border-rose-500/40'
      : 'bg-zinc-500/15 text-zinc-300 border-zinc-600/50';

export const SignalsPanel: React.FC<SignalsPanelProps> = ({ security, onSelectTicker }) => {
  const [timeframe, setTimeframe] = usePersistentState<SigTimeframe>(
    'bloomberg-terminal:sig:timeframe:v1',
    '1Y',
    isOneOf(SIG_TIMEFRAMES),
  );
  const [nStates, setNStates] = usePersistentState<SigStates>(
    'bloomberg-terminal:sig:states:v1',
    3,
    isSigStates,
  );
  const [rows, setRows] = useState<ScanRow[]>([]);
  const [scanned, setScanned] = useState(0);
  const [scanTotal, setScanTotal] = useState(0);
  const [detail, setDetail] = useState<{ fit: HMMFit; signal: RegimeSignal; live: boolean } | null>(null);
  const [detailMissing, setDetailMissing] = useState<string | null>(null);
  const [selfTest, setSelfTest] = useState<SelfTestResult | null>(null);

  // Deterministic model quality gate — runs once, displayed in the footer.
  useEffect(() => {
    let cancelled = false;
    const id = window.setTimeout(() => {
      if (cancelled) return;
      try {
        setSelfTest(hmmSelfTest());
      } catch {
        setSelfTest({ pass: false, details: 'self-test threw' });
      }
    }, 0);
    return () => {
      cancelled = true;
      window.clearTimeout(id);
    };
  }, []);

  // Universe scan. Sequential with a yield between names so the tape stays alive.
  useEffect(() => {
    let cancelled = false;
    setRows([]);
    setScanned(0);
    const names = WATCHLIST.filter((t) => marketEngine.getSecurity(t));
    setScanTotal(names.length);
    const ann = ANN_FACTOR[timeframe];
    (async () => {
      const out: ScanRow[] = [];
      for (const ticker of names) {
        if (cancelled) return;
        try {
          const res = await getFit(ticker, timeframe, nStates, 4);
          if (cancelled) return;
          if (res) {
            const sec = marketEngine.getSecurity(ticker);
            const labels = labelStates(res.fit.mu);
            const pBull = res.signal.probs[labels.indexOf('BULL')] ?? 0;
            out.push({
              ticker,
              name: sec?.name ?? ticker,
              direction: res.signal.direction,
              strength: res.signal.strength,
              regime: labels[res.signal.currentState] ?? '—',
              regimeProb: res.signal.probs[res.signal.currentState] ?? 0,
              pBull,
              expRetPct: (Math.exp(res.signal.expectedLogRet * ann) - 1) * 100,
              confidence: res.signal.confidence,
              live: res.live,
              n: res.fit.nObs,
            });
            // Strongest conviction first.
            out.sort((a, b) => b.strength - a.strength);
            setRows([...out]);
          }
        } catch {
          // Skip failed names — the table shows what fitted.
        }
        setScanned((s) => s + 1);
        await new Promise((r) => window.setTimeout(r, 0));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [timeframe, nStates]);

  // Detail fit for the globally selected ticker (full restarts for quality).
  const secTicker = security.ticker;
  useEffect(() => {
    let cancelled = false;
    setDetail(null);
    setDetailMissing(null);
    (async () => {
      try {
        const res = await getFit(secTicker, timeframe, nStates, 10);
        if (cancelled) return;
        if (res) {
          setDetail(res);
        } else {
          setDetailMissing(`insufficient history for ${secTicker} on ${timeframe}`);
        }
      } catch {
        if (!cancelled) setDetailMissing(`model failed for ${secTicker}`);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [secTicker, timeframe, nStates]);

  const handleRowClick = (ticker: string) => {
    audioService.playKeyClick();
    onSelectTicker?.(ticker);
  };

  const detailLabels = detail ? labelStates(detail.fit.mu) : [];
  const ann = ANN_FACTOR[timeframe];
  const detailExpAnn =
    detail != null ? (Math.exp(detail.signal.expectedLogRet * ann) - 1) * 100 : null;

  return (
    <div className="h-full w-full min-h-0 bg-[#080d16] text-zinc-300 font-mono text-xs flex flex-col gap-2 p-2 select-none">
      {/* Header + model controls */}
      <div className="flex flex-wrap items-center justify-between bg-[#0e1422] p-2 rounded border border-[#1b253b] gap-2 shrink-0">
        <div className="flex items-center space-x-2">
          <Crosshair className="w-4 h-4 text-amber-400" />
          <span className="font-bold text-amber-400 tracking-wider">
            TOP REGIME SIGNALS · HIDDEN MARKOV MODEL (SIG)
          </span>
          <span
            className={`text-[9px] font-bold px-1.5 py-0.5 rounded border ${
              detail?.live
                ? 'text-emerald-400 border-emerald-500/40 bg-emerald-500/10'
                : 'text-zinc-500 border-[#212d44]'
            }`}
            title={detail?.live ? 'Estimated on live market data' : 'Live fetch unavailable — simulated series'}
          >
            {detail ? (detail.live ? 'LIVE DATA' : 'SIMULATED') : '…'}
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex space-x-1 bg-[#101726] border border-[#212d44] p-0.5 rounded text-[10px]">
            {SIG_TIMEFRAMES.map((tf) => (
              <button
                key={tf}
                onClick={() => {
                  audioService.playKeyClick();
                  setTimeframe(tf);
                }}
                className={`px-2 py-0.5 rounded font-bold transition-colors ${
                  timeframe === tf ? 'bg-amber-500 text-black' : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                {tf}
              </button>
            ))}
          </div>
          <div
            className="flex space-x-1 bg-[#101726] border border-[#212d44] p-0.5 rounded text-[10px]"
            role="group"
            aria-label="HMM state count"
          >
            {SIG_STATES.map((s) => (
              <button
                key={s}
                onClick={() => {
                  audioService.playKeyClick();
                  setNStates(s);
                }}
                className={`px-2 py-0.5 rounded font-bold transition-colors ${
                  nStates === s ? 'bg-cyan-500 text-black' : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                {s}ST
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Detail: selected ticker regime readout */}
      <div className="shrink-0 rounded border border-[#1b253b] bg-[#0e1422] px-2.5 py-2">
        {detail ? (
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
            <span className="text-base font-bold text-white">{secTicker}</span>
            <span className={`px-2 py-0.5 rounded border text-[11px] font-extrabold ${dirBadge(detail.signal.direction)}`}>
              {detail.signal.direction} · {detail.signal.strength}
            </span>
            <span className="text-[11px]">
              <span className="text-zinc-500">REGIME </span>
              <strong className={dirClass(detail.signal.direction)}>
                {detailLabels[detail.signal.currentState]} {(detail.signal.probs[detail.signal.currentState] * 100).toFixed(0)}%
              </strong>
            </span>
            <span className="text-[11px] text-zinc-400">
              E[r] <strong className="text-amber-300">{detailExpAnn != null ? `${detailExpAnn >= 0 ? '+' : ''}${detailExpAnn.toFixed(1)}% ann` : 'N/A'}</strong>
            </span>
            <span className="text-[11px] text-zinc-400">
              CONF <strong className="text-cyan-300">{detail.signal.confidence}%</strong>
            </span>
            <span className="text-[10px] text-zinc-500 hidden lg:inline">{detail.signal.rationale}</span>
          </div>
        ) : (
          <div className="text-[11px] text-zinc-500">
            {detailMissing ?? `FITTING ${nStates}-STATE HMM ON ${secTicker} ${timeframe}…`}
          </div>
        )}
      </div>

      {/* Ranked signals table */}
      <PanelSection
        title={`RANKED BY CONVICTION — ${nStates}-STATE HMM ON ${timeframe} ${BAR_LABEL[timeframe].toUpperCase()} (${rows.length}/${scanTotal || WATCHLIST.length})`}
        icon={<Activity className="w-3 h-3" />}
        className="flex-1 min-h-0"
        bodyClassName="overflow-auto"
        actions={
          <span className="text-[9px] text-zinc-500">
            {scanned < (scanTotal || 0) ? `SCANNING ${scanned}/${scanTotal}…` : `${rows.length} FITTED`}
          </span>
        }
      >
        <table className="w-full text-left text-[11px]">
          <thead className="bg-[#0b101c] text-zinc-400 border-b border-[#182338] sticky top-0 z-10 text-[10px]">
            <tr>
              <th className="py-2 px-3">#</th>
              <th className="py-2 px-3">TICKER</th>
              <th className="py-2 px-3">SIGNAL</th>
              <th className="py-2 px-3 text-right">STR</th>
              <th className="py-2 px-3">REGIME</th>
              <th className="py-2 px-3 text-right">P(BULL)</th>
              <th className="py-2 px-3 text-right">E[r] ANN</th>
              <th className="py-2 px-3 text-right">CONF</th>
              <th className="py-2 px-3 text-right">DATA</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#131b2c]">
            {rows.map((r, i) => (
              <tr
                key={r.ticker}
                tabIndex={0}
                onClick={() => handleRowClick(r.ticker)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    handleRowClick(r.ticker);
                  }
                }}
                className={`hover:bg-[#121a2d] transition-colors cursor-pointer focus:outline-none focus:bg-[#121a2d] ${
                  r.ticker === secTicker ? 'bg-amber-500/10' : ''
                }`}
              >
                <td className="py-2 px-3 text-zinc-500">{i + 1}</td>
                <td className="py-2 px-3 font-bold text-amber-400">
                  {r.ticker}
                  <span className="ml-1 text-[9px] text-zinc-500 font-normal hidden xl:inline">{r.name.slice(0, 22)}</span>
                </td>
                <td className="py-2 px-3">
                  <span className={`px-1.5 py-0.5 rounded border text-[10px] font-bold ${dirBadge(r.direction)}`}>
                    {r.direction}
                  </span>
                </td>
                <td className={`py-2 px-3 text-right font-bold ${dirClass(r.direction)}`}>{r.strength}</td>
                <td className="py-2 px-3 text-zinc-200">
                  {r.regime} <span className="text-zinc-500">{(r.regimeProb * 100).toFixed(0)}%</span>
                </td>
                <td className="py-2 px-3 text-right text-zinc-300">{(r.pBull * 100).toFixed(0)}%</td>
                <td className={`py-2 px-3 text-right font-semibold ${r.expRetPct >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                  {r.expRetPct >= 0 ? '+' : ''}{r.expRetPct.toFixed(1)}%
                </td>
                <td className="py-2 px-3 text-right text-cyan-300">{r.confidence}%</td>
                <td className="py-2 px-3 text-right text-[10px] text-zinc-500">{r.live ? 'LIVE' : 'SIM'}</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={9} className="py-8 px-3 text-center text-zinc-500">
                  FITTING REGIMES ACROSS THE WATCHLIST… ({scanned}/{scanTotal || '—'})
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </PanelSection>

      {/* Model footnote + self-test */}
      <div className="shrink-0 flex flex-wrap items-center gap-x-3 gap-y-1 text-[9px] text-zinc-500 px-1">
        <span className="flex items-center gap-1">
          <FlaskConical className="w-3 h-3" />
          GAUSSIAN HMM ON LOG RETURNS · BAUM-WELCH EM (4 RESTARTS SCAN / 10 DETAIL) · VITERBI DECODE
        </span>
        <span>
          SELF-TEST:{' '}
          {selfTest == null ? (
            <span className="text-zinc-500">RUNNING…</span>
          ) : (
            <span className={selfTest.pass ? 'text-emerald-400 font-bold' : 'text-rose-400 font-bold'}>
              {selfTest.pass ? 'PASS' : 'FAIL'} · {selfTest.details}
            </span>
          )}
        </span>
        <span>EDUCATIONAL — REGIME ESTIMATES, NOT INVESTMENT ADVICE</span>
      </div>
    </div>
  );
};
