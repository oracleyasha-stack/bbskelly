import React, { useState, useEffect } from 'react';
import { marketEngine } from '../../services/marketEngine';
import { subscribeLiveData } from '../../services/liveData';
import { audioService } from '../../services/audioService';
import { usePersistentState, isOneOf } from '../../hooks/usePersistentState';
import { Flame, TrendingUp, TrendingDown } from 'lucide-react';
import { PanelSection } from '../layout/PanelSection';

interface MarketMoversPanelProps {
  onSelectTicker?: (ticker: string) => void;
}

const TABS = ['GAINERS', 'LOSERS', 'VOLUME'] as const;
type MoversTab = (typeof TABS)[number];
const MARKETS = ['ALL', 'US', 'INDIA', 'CRYPTO_CMDTY'] as const;
type MarketFilter = (typeof MARKETS)[number];

export const MarketMoversPanel: React.FC<MarketMoversPanelProps> = ({ onSelectTicker }) => {
  const [tab, setTab] = usePersistentState<MoversTab>(
    'bloomberg-terminal:most:tab:v1',
    'GAINERS',
    isOneOf(TABS),
  );
  const [marketFilter, setMarketFilter] = usePersistentState<MarketFilter>(
    'bloomberg-terminal:most:market:v1',
    'ALL',
    isOneOf(MARKETS),
  );
  const [, setTick] = useState(0);

  // Subscribe to live market updates and real-time streaming ticks
  useEffect(() => {
    const unsubEngine = marketEngine.subscribe(() => setTick((v) => v + 1));
    const unsubLive = subscribeLiveData(() => setTick((v) => v + 1));
    return () => {
      unsubEngine();
      unsubLive();
    };
  }, []);

  const rawSecurities = marketEngine.getAllSecurities();

  const filteredSecurities = rawSecurities.filter((sec) => {
    if (marketFilter === 'INDIA') return sec.exchange === 'NSE' || sec.currency === 'INR';
    if (marketFilter === 'US') return (sec.exchange === 'NASDAQ' || sec.exchange === 'NYSE') && sec.assetClass === 'EQUITY';
    if (marketFilter === 'CRYPTO_CMDTY') return sec.assetClass === 'CRYPTO' || sec.assetClass === 'CMDTY';
    return true;
  });

  const sortedSecurities = [...filteredSecurities].sort((a, b) => {
    if (tab === 'GAINERS') return (Number.isFinite(b.changePercent) ? b.changePercent : -Infinity) - (Number.isFinite(a.changePercent) ? a.changePercent : -Infinity);
    if (tab === 'LOSERS') return (Number.isFinite(a.changePercent) ? a.changePercent : Infinity) - (Number.isFinite(b.changePercent) ? b.changePercent : Infinity);
    return (Number.isFinite(b.volume) ? b.volume : 0) - (Number.isFinite(a.volume) ? a.volume : 0);
  });

  const handleRowClick = (ticker: string) => {
    audioService.playKeyClick();
    if (onSelectTicker) {
      onSelectTicker(ticker);
    }
  };

  return (
    <div className="h-full w-full min-h-0 bg-[#080d16] text-zinc-300 font-mono text-xs flex flex-col gap-2 p-2 select-none">
      <div className="flex flex-wrap items-center justify-between bg-[#0e1422] p-2 rounded border border-[#1b253b] gap-2 shrink-0">
        <div className="flex items-center space-x-2">
          <Flame className="w-4 h-4 text-amber-400" />
          <span className="font-bold text-amber-400 tracking-wider">MARKET MOVERS & VOLUME LEADERS (MOST)</span>
          <span className="flex items-center gap-1 text-[9px] bg-emerald-500/15 text-emerald-400 px-1.5 py-0.5 rounded border border-emerald-500/30">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" /> LIVE STREAM
          </span>
        </div>

        {/* Tab & Market Filters */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Market Segment Filter */}
          <div className="flex space-x-1 bg-[#101726] border border-[#212d44] p-0.5 rounded text-[10px]">
            {(
              [
                { id: 'ALL', label: 'ALL' },
                { id: 'US', label: 'US EQ' },
                { id: 'INDIA', label: 'NSE' },
                { id: 'CRYPTO_CMDTY', label: 'CRYPTO/CMD' },
              ] as const
            ).map((m) => (
              <button
                key={m.id}
                onClick={() => {
                  audioService.playKeyClick();
                  setMarketFilter(m.id);
                }}
                className={`px-1.5 py-0.5 rounded font-bold transition-colors ${
                  marketFilter === m.id ? 'bg-cyan-500 text-black' : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                {m.label}
              </button>
            ))}
          </div>

          {/* Ranking Type */}
          <div className="flex space-x-1 bg-[#101726] border border-[#212d44] p-0.5 rounded text-[10px]">
            {(['GAINERS', 'LOSERS', 'VOLUME'] as const).map((t) => (
              <button
                key={t}
                onClick={() => {
                  audioService.playKeyClick();
                  setTab(t);
                }}
                className={`px-2 py-0.5 rounded font-bold transition-colors ${
                  tab === t ? 'bg-amber-500 text-black' : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                {t}
              </button>
            ))}
          </div>
        </div>
      </div>

      <PanelSection
        title={`${tab} — RANKED ACROSS ${marketFilter.replace('_', ' & ')} (${sortedSecurities.length} ASSETS)`}
        icon={<Flame className="w-3 h-3" />}
        className="flex-1 min-h-0"
        bodyClassName="overflow-auto"
        actions={
          <span className="text-[9px] text-zinc-500">{sortedSecurities.length} SECURITIES</span>
        }
      >
        <table className="w-full text-left text-[11px]">
          <thead className="bg-[#0b101c] text-zinc-400 border-b border-[#182338] sticky top-0 z-10 text-[10px]">
            <tr>
              <th className="py-2 px-3">TICKER</th>
              <th className="py-2 px-3">NAME</th>
              <th className="py-2 px-3 text-right">LAST</th>
              <th className="py-2 px-3 text-right">CHANGE</th>
              <th className="py-2 px-3 text-right">% CHANGE</th>
              <th className="py-2 px-3 text-right">VOLUME</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#131b2c]">
            {sortedSecurities.map((sec) => {
              const change = Number.isFinite(sec.change) ? sec.change : 0;
              const pct = Number.isFinite(sec.changePercent) ? sec.changePercent : 0;
              const isPositive = change >= 0;
              return (
                <tr
                  key={sec.ticker}
                  tabIndex={0}
                  onClick={() => handleRowClick(sec.ticker)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      handleRowClick(sec.ticker);
                    }
                  }}
                  className="hover:bg-[#121a2d] transition-colors cursor-pointer group focus:outline-none focus:bg-[#121a2d]"
                >
                  <td className="py-2 px-3 font-bold text-amber-400 group-hover:underline">
                    {sec.ticker}
                    <span className="ml-1 text-[9px] text-zinc-500 font-normal">[{sec.exchange}]</span>
                  </td>
                  <td className="py-2 px-3 text-zinc-300 truncate max-w-[200px]">{sec.name}</td>
                  <td className="py-2 px-3 text-right font-bold text-white">
                    {sec.currency === 'INR' ? '₹' : '$'}
                    {Number.isFinite(sec.price) ? sec.price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : 'N/A'}
                  </td>
                  <td
                    className={`py-2 px-3 text-right font-semibold ${
                      isPositive ? 'text-emerald-400' : 'text-rose-400'
                    }`}
                  >
                    {isPositive ? '+' : ''}
                    {change.toFixed(2)}
                  </td>
                  <td
                    className={`py-2 px-3 text-right font-bold ${
                      isPositive ? 'text-emerald-400' : 'text-rose-400'
                    }`}
                  >
                    <span
                      className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] ${
                        isPositive ? 'bg-emerald-500/10' : 'bg-rose-500/10'
                      }`}
                    >
                      {isPositive ? <TrendingUp className="w-2.5 h-2.5 mr-0.5" /> : <TrendingDown className="w-2.5 h-2.5 mr-0.5" />}
                      {isPositive ? '+' : ''}
                      {pct.toFixed(2)}%
                    </span>
                  </td>
                  <td className="py-2 px-3 text-right text-zinc-300">{Number.isFinite(sec.volume) ? sec.volume.toLocaleString() : 'N/A'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </PanelSection>
    </div>
  );
};
