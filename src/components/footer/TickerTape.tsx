import React, { memo, useEffect, useMemo, useState } from 'react';
import type { Security } from '../../types/terminal';
import { marketEngine, type TickEvent } from '../../services/marketEngine';
import { audioService } from '../../services/audioService';
import { TrendingUp, TrendingDown } from 'lucide-react';

interface TickerTapeProps {
  onSelectTicker: (ticker: string) => void;
}

interface SessionState {
  label: string;
  isOpen: boolean;
}

/**
 * Real exchange session status, derived from the current wall clock.
 *
 * This replaces hardcoded "OPEN/CLOSED" text, which previously claimed NYSE was
 * open at 3am. Weekday/hour checks are in each venue's local time; the minute is
 * handled by the half-open session start, so we only need the hour.
 */
const getSession = (
  timeZone: string,
  openHour: number,
  openMinute: number,
  closeHour: number,
  closeMinute: number,
  now: Date
): boolean => {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    weekday: 'short',
    hour12: false,
  }).formatToParts(now);

  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '0';
  const weekday = get('weekday');
  // Weekends are closed for every cash venue handled here.
  if (weekday === 'Sat' || weekday === 'Sun') return false;

  const hour = Number(get('hour')) % 24;
  const minute = Number(get('minute'));
  const minutesNow = hour * 60 + minute;
  return minutesNow >= openHour * 60 + openMinute && minutesNow < closeHour * 60 + closeMinute;
};

const getSessions = (now: Date): SessionState[] => [
  // NYSE / Nasdaq: 09:30-16:00 America/New_York.
  { label: 'NYSE', isOpen: getSession('America/New_York', 9, 30, 16, 0, now) },
  // NSE: 09:15-15:30 Asia/Kolkata.
  { label: 'NSE', isOpen: getSession('Asia/Kolkata', 9, 15, 15, 30, now) },
  // LSE: 08:00-16:30 Europe/London.
  { label: 'LSE', isOpen: getSession('Europe/London', 8, 0, 16, 30, now) },
];

// Cached formatter: constructing Intl.NumberFormat per row per tick was a
// measurable cost with ~200 tape buttons re-rendering on every pulse.
const priceFmt = new Intl.NumberFormat(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

interface TapeItemProps {
  sec: Security;
  highlighted: boolean;
  onClick: (ticker: string) => void;
  /** Second marquee copy is aria-hidden + untabbable so SR/keyboard see each ticker once. */
  ariaHidden?: boolean;
}

/** Memoized so a 1-ticker pulse doesn't re-render the other ~199 buttons. */
const TapeItem: React.FC<TapeItemProps> = memo(({ sec, highlighted, onClick, ariaHidden }) => {
  const change = Number.isFinite(sec.changePercent) ? sec.changePercent : 0;
  const price = Number.isFinite(sec.price) ? sec.price : NaN;
  const isPositive = change >= 0;
  if (ariaHidden) {
    return (
      <span
        aria-hidden="true"
        className={`flex items-center space-x-1 px-1.5 py-px rounded border border-transparent shrink-0 ${
          highlighted
            ? isPositive
              ? 'bg-emerald-950/60 border-emerald-500/50'
              : 'bg-rose-950/60 border-rose-500/50'
            : ''
        }`}
      >
        <span className="font-bold text-amber-400">{sec.ticker}</span>
        <span className="text-zinc-200 tabular-nums">
          {sec.currency === 'INR' ? '₹' : sec.currency === 'USD' ? '$' : ''}
          {Number.isFinite(price) ? priceFmt.format(price) : 'N/A'}
        </span>
        <span
          className={`flex items-center text-[10px] font-bold tabular-nums ${
            isPositive ? 'text-emerald-400' : 'text-rose-400'
          }`}
        >
          {isPositive ? (
            <TrendingUp className="w-3 h-3 mr-0.5 inline" aria-hidden="true" />
          ) : (
            <TrendingDown className="w-3 h-3 mr-0.5 inline" aria-hidden="true" />
          )}
          {isPositive ? '+' : ''}
          {change.toFixed(2)}%
        </span>
      </span>
    );
  }
  return (
    <button
      onClick={() => onClick(sec.ticker)}
      aria-label={`${sec.ticker} ${Number.isFinite(price) ? priceFmt.format(price) : 'price unavailable'}, ${isPositive ? '+' : ''}${change.toFixed(2)} percent`}
      className={`flex items-center space-x-1 px-1.5 py-px rounded transition-colors duration-200 border border-transparent hover:border-amber-500/40 hover:bg-[#131b2e] shrink-0 min-h-[24px] focus-visible:outline-2 focus-visible:outline-amber-400 ${
        highlighted
          ? isPositive
            ? 'bg-emerald-950/60 border-emerald-500/50'
            : 'bg-rose-950/60 border-rose-500/50'
          : ''
      }`}
    >
      <span className="font-bold text-amber-400">{sec.ticker}</span>
      <span className="text-zinc-200 tabular-nums">
        {sec.currency === 'INR' ? '₹' : sec.currency === 'USD' ? '$' : ''}
        {Number.isFinite(price) ? priceFmt.format(price) : 'N/A'}
      </span>
      <span
        className={`flex items-center text-[10px] font-bold tabular-nums ${
          isPositive ? 'text-emerald-400' : 'text-rose-400'
        }`}
      >
        {isPositive ? (
          <TrendingUp className="w-3 h-3 mr-0.5 inline" aria-hidden="true" />
        ) : (
          <TrendingDown className="w-3 h-3 mr-0.5 inline" aria-hidden="true" />
        )}
        {isPositive ? '+' : ''}
        {change.toFixed(2)}%
      </span>
    </button>
  );
});
TapeItem.displayName = 'TapeItem';

export const TickerTape: React.FC<TickerTapeProps> = ({ onSelectTicker }) => {
  const [securities, setSecurities] = useState<Security[]>(marketEngine.getAllSecurities());
  const [lastTick, setLastTick] = useState<TickEvent | null>(null);
  const [sessions, setSessions] = useState<SessionState[]>(() => getSessions(new Date()));
  const [paused, setPaused] = useState(false);

  // Refresh the exchange session badges every 60s so OPEN/CLOSED stays honest.
  useEffect(() => {
    const update = () => setSessions(getSessions(new Date()));
    update();
    const id = window.setInterval(update, 60_000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    const unsubscribe = marketEngine.subscribe((tick, updatedSecurity) => {
      setLastTick(tick);
      setSecurities((prev) => {
        // Skip the array rebuild when nothing actually moved (heartbeat ticks).
        const cur = prev.find((s) => s.ticker === updatedSecurity.ticker);
        if (cur && cur.price === updatedSecurity.price && cur.changePercent === updatedSecurity.changePercent) {
          return prev;
        }
        return prev.map((s) => (s.ticker === updatedSecurity.ticker ? updatedSecurity : s));
      });
    });
    return () => unsubscribe();
  }, []);

  const handleTickerClick = (ticker: string) => {
    audioService.playKeyClick();
    onSelectTicker(ticker);
  };

  // Duplicated once for the seamless -50% marquee loop; memoized so the
  // 2x array isn't reallocated on unrelated renders.
  // First copy is interactive; second copy is aria-hidden so keyboard/SR
  // encounter each ticker exactly once.
  const looped = useMemo(() => [...securities, ...securities], [securities]);

  return (
    <footer aria-label="Market ticker tape" className="bg-[#080b12] border-t border-[#2b3a58] px-2 py-0.5 select-none text-[10px] font-mono flex items-center z-20">
      {/* Market Status Badges — live from the wall clock, not hardcoded */}
      <div className="hidden md:flex items-center space-x-1.5 text-[10px] pr-2 border-r border-[#1a2336] shrink-0">
        {sessions.map((s, idx) => (
          <React.Fragment key={s.label}>
            {idx > 0 && <span className="text-zinc-600" aria-hidden="true">|</span>}
            <span
              className={`flex items-center gap-1 ${s.isOpen ? 'text-emerald-400' : 'text-zinc-500'}`}
              title={s.isOpen ? `${s.label} session is open` : `${s.label} session is closed`}
            >
              <span
                aria-hidden="true"
                className={`w-1.5 h-1.5 rounded-full ${
                  s.isOpen ? 'bg-emerald-500' : 'bg-zinc-600'
                }`}
              />
              {s.label}: <span className="font-bold">{s.isOpen ? 'OPEN' : 'CLOSED'}</span>
            </span>
          </React.Fragment>
        ))}
      </div>

      <button
        type="button"
        onClick={() => setPaused((p) => !p)}
        aria-pressed={paused}
        aria-label={paused ? 'Resume ticker tape' : 'Pause ticker tape'}
        title={paused ? 'Resume tape' : 'Pause tape (touch-friendly)'}
        className="shrink-0 ml-1.5 px-1.5 py-0.5 rounded border border-[#2b3a58] text-zinc-400 hover:text-amber-300 hover:border-amber-500/50 min-h-[24px] min-w-[24px] focus-visible:outline-2 focus-visible:outline-amber-400"
      >
        {paused ? '▶' : '⏸'}
      </button>

      {/* Real-Time Scrolling Ticker Tape */}
      <div className="flex-1 overflow-x-hidden relative mx-1.5 min-w-0">
        <div className={`ticker-tape-track flex items-center space-x-3 py-px w-max${paused ? ' ticker-paused' : ''}`}>
          {looped.map((sec, dupIdx) => {
            const isDuplicate = dupIdx >= securities.length;
            return (
              <TapeItem
                key={`${sec.ticker}-${dupIdx}`}
                sec={sec}
                highlighted={lastTick?.ticker === sec.ticker}
                onClick={handleTickerClick}
                ariaHidden={isDuplicate}
              />
            );
          })}
        </div>
      </div>

      {/* Standing disclaimer — the terminal mixes live, delayed and demo data. */}
      <span
        className="hidden sm:inline shrink-0 pl-2 border-l border-[#1a2336] text-[9px] text-zinc-500 tracking-wide"
        title="Educational tool. Quotes from Yahoo Finance and headlines from Google News may be delayed; items marked DEMO are simulated. Nothing here is investment advice or a recommendation to buy or sell."
      >
        NOT INVESTMENT ADVICE · DATA MAY BE DELAYED
      </span>
    </footer>
  );
};
