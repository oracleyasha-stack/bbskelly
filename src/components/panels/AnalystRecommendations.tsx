import React from 'react';
import type { Security } from '../../types/terminal';
import { ExternalLink, Target, Award } from 'lucide-react';
import { PanelSection } from '../layout/PanelSection';
import { audioService } from '../../services/audioService';
import { fetchAnalystActions, type AnalystAction } from '../../services/liveData';
import { currencySymbol, publicReportSearchUrl } from '../../services/analystData';

interface AnalystRecommendationsProps {
  security: Security;
}

const ratingClass = (rating: string | null | undefined): string => {
  const normalized = (rating ?? '').toUpperCase();
  if (/BUY|OUTPERFORM|OVERWEIGHT|ACCUMULATE|ADD/.test(normalized)) {
    return 'text-emerald-400';
  }
  if (/HOLD|NEUTRAL|EQUAL/.test(normalized)) return 'text-amber-400';
  if (/SELL|UNDERPERFORM|REDUCE/.test(normalized)) return 'text-rose-400';
  return 'text-zinc-300';
};

const actionDate = (timestamp: number | null): string =>
  timestamp && Number.isFinite(timestamp)
    ? new Date(timestamp).toLocaleDateString(undefined, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      })
    : '—';

const actionLabel = (action: string | null | undefined): string => {
  const labels: Record<string, string> = {
    down: 'Downgraded',
    init: 'Initiated',
    main: 'Maintained',
    reit: 'Reiterated',
    up: 'Upgraded',
  };
  const key = (action ?? '').toLowerCase();
  return labels[key] ?? (action || 'Rating update');
};

export const AnalystRecommendations: React.FC<AnalystRecommendationsProps> = ({ security }) => {
  const symbol = currencySymbol(security);
  const safeNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
  const price = safeNum(security.price) ? security.price : NaN;
  const hasTarget = safeNum(security.targetPrice) && security.targetPrice > 0;
  const upsidePercent = hasTarget && Number.isFinite(price) && price > 0
    ? ((security.targetPrice - price) / price) * 100
    : null;
  const [actions, setActions] = React.useState<AnalystAction[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState(false);
  const [retryKey, setRetryKey] = React.useState(0);
  const secTicker = security.ticker;
  React.useEffect(() => {
    let active = true;
    setLoading(true);
    setError(false);
    setActions([]);
    fetchAnalystActions(secTicker)
      .then((data) => {
        if (active) setActions(data);
      })
      .catch(() => {
        if (active) setError(true);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [secTicker, retryKey]);

  const allReportsUrl = publicReportSearchUrl(security.ticker, security.name);
  const openSearch = () => audioService.playExecuteThud();

  return (
    <div className="h-full w-full min-h-0 bg-[#080d16] text-zinc-300 font-mono text-xs flex flex-col gap-2 p-2 select-none">
      <div className="flex items-center justify-between bg-[#0e1422] p-2 rounded border border-[#1b253b] shrink-0 gap-2">
        <div className="flex items-center space-x-2 min-w-0">
          <Target className="w-4 h-4 text-amber-400 shrink-0" />
          <span className="font-bold text-amber-400 tracking-wider truncate">
            {security.ticker} ANALYST RECOMMENDATIONS &amp; TARGETS (ANR)
          </span>
        </div>
        <a
          href={allReportsUrl}
          target="_blank"
          rel="noopener noreferrer"
          onClick={openSearch}
          className="inline-flex items-center gap-1.5 px-2 py-1 rounded border border-amber-500/50 bg-amber-500/10 text-amber-300 hover:bg-amber-500/25 text-[10px] font-bold tracking-wider shrink-0"
          title="Search the web for public original research reports"
        >
          <ExternalLink className="w-3 h-3" />
          <span className="hidden sm:inline">FIND PUBLIC REPORTS</span>
          <span className="sm:hidden">REPORTS</span>
        </a>
      </div>

      <PanelSection
        title="CONSENSUS & 12-MONTH TARGET SUMMARY"
        icon={<Target className="w-3 h-3" />}
        className="shrink-0"
        scroll={false}
        bodyClassName="p-2 grid grid-cols-1 md:grid-cols-3 gap-2 overflow-visible"
      >
        <div className="bg-[#0b101c] p-2 rounded border border-[#1b253b] text-center flex flex-col justify-center">
          <span className="text-[10px] text-zinc-400 uppercase">YAHOO FINANCE CONSENSUS</span>
          <span className={`text-lg font-extrabold mt-1 ${ratingClass(security.consensusRating)}`}>
            {(security.consensusRating ?? 'HOLD').replace(/_/g, ' ')}
          </span>
          <span className="text-[9px] text-zinc-500 mt-1">
            {security.analystCount} analysts in consensus
          </span>
        </div>

        <div className="bg-[#0b101c] p-2 rounded border border-[#1b253b] text-center flex flex-col justify-center">
          <span className="text-[10px] text-zinc-400 uppercase">12-MONTH CONSENSUS TARGET</span>
          <span className="text-xl font-bold text-amber-300 mt-0.5">
            {hasTarget ? `${symbol}${security.targetPrice.toFixed(2)}` : 'N/A'}
          </span>
          <span
            className={`text-xs font-bold mt-1 ${
              upsidePercent === null
                ? 'text-zinc-500'
                : upsidePercent >= 0
                ? 'text-emerald-400'
                : 'text-rose-400'
            }`}
          >
            {upsidePercent !== null
              ? `${upsidePercent >= 0 ? '+' : ''}${upsidePercent.toFixed(1)}% implied return`
              : 'No consensus target set'}
          </span>
        </div>

        <div className="bg-[#0b101c] p-2 rounded border border-[#1b253b] flex flex-col justify-center space-y-1 text-[11px]">
          <div className="flex justify-between pb-1 border-b border-[#182338]">
            <span className="text-zinc-400">Street high:</span>
            <span className="text-emerald-400 font-bold">
              {hasTarget && safeNum(security.targetHigh) ? `${symbol}${security.targetHigh.toFixed(2)}` : 'N/A'}
            </span>
          </div>
          <div className="flex justify-between pb-1 border-b border-[#182338]">
            <span className="text-zinc-400">Street low:</span>
            <span className="text-rose-400 font-bold">
              {hasTarget && safeNum(security.targetLow) ? `${symbol}${security.targetLow.toFixed(2)}` : 'N/A'}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-zinc-400">Current price:</span>
            <span className="text-white font-bold">{symbol}{Number.isFinite(price) ? price.toFixed(2) : 'N/A'}</span>
          </div>
        </div>
      </PanelSection>

      <PanelSection
        title="LIVE BROKER RATING ACTIONS — YAHOO FINANCE"
        icon={<Award className="w-3 h-3" />}
        className="flex-1 min-h-0"
        bodyClassName="overflow-auto"
        actions={<span className="text-[9px] text-zinc-500">PUBLIC SOURCE LINKS ONLY</span>}
      >
        {loading ? (
          <div className="p-4 text-zinc-400">Loading current broker actions…</div>
        ) : error ? (
          <div className="flex flex-col items-start gap-2 p-4">
            <div className="text-rose-300">
              Live broker actions are unavailable right now. Use “Find public reports” to search public sources.
            </div>
            <button
              type="button"
              onClick={() => setRetryKey((k) => k + 1)}
              className="rounded border border-amber-500/40 bg-amber-500/10 px-2.5 py-1 text-[10px] font-bold text-amber-300 hover:bg-amber-500/20"
            >
              RETRY LIVE FEED
            </button>
          </div>
        ) : actions.length === 0 ? (
          <div className="p-4 text-zinc-400">
            No broker action history is available for {security.ticker} from the live data source.
            Public reports may still be available through the search link above.
          </div>
        ) : (
          <table className="w-full text-left text-[11px]">
            <thead className="sticky top-0 z-10 bg-[#0b101c] text-zinc-400 border-b border-[#182338] text-[10px]">
              <tr>
                <th className="py-2 px-3">BROKER</th>
                <th className="py-2 px-3">PREVIOUS RATING</th>
                <th className="py-2 px-3">CURRENT RATING</th>
                <th className="py-2 px-3">ACTION</th>
                <th className="py-2 px-3 text-right">DATE</th>
                <th className="py-2 px-3 text-right">PUBLIC REPORT</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#131b2c]">
              {actions.map((item, index) => {
                const reportUrl = publicReportSearchUrl(security.ticker, security.name, item.firm);
                return (
                  <tr key={`${item.firm}-${item.date ?? index}-${index}`} className="hover:bg-[#121a2d]">
                    <td className="py-2 px-3 font-bold text-white">{item.firm}</td>
                    <td className={`py-2 px-3 ${ratingClass(item.fromGrade)}`}>{item.fromGrade || '—'}</td>
                    <td className={`py-2 px-3 font-semibold ${ratingClass(item.toGrade)}`}>{item.toGrade || '—'}</td>
                    <td className="py-2 px-3 text-zinc-300">{actionLabel(item.action)}</td>
                    <td className="py-2 px-3 text-right text-zinc-400">{actionDate(item.date)}</td>
                    <td className="py-2 px-3 text-right">
                      <a
                        href={reportUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={openSearch}
                        className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded border border-amber-500/40 text-amber-300 hover:bg-amber-500/20"
                        aria-label={`Search for a public ${item.firm} report about ${security.ticker}`}
                      >
                        <ExternalLink className="w-3 h-3" /> SEARCH
                      </a>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </PanelSection>
    </div>
  );
};
