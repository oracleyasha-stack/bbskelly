import React, { useEffect, useState } from 'react';
import { WORLD_EQUITY_INDICES } from '../../data/securities';
import { subscribeLiveData } from '../../services/liveData';
import { audioService } from '../../services/audioService';
import { usePersistentState, isOneOf } from '../../hooks/usePersistentState';
import { Globe, TrendingUp, TrendingDown } from 'lucide-react';

interface WorldIndicesPanelProps {
  onSelectTicker?: (ticker: string) => void;
}

const REGIONS = ['ALL', 'AMERICAS', 'EMEA', 'APAC'] as const;
type Region = (typeof REGIONS)[number];

export const WorldIndicesPanel: React.FC<WorldIndicesPanelProps> = ({ onSelectTicker }) => {
  // Region filter persists across TOP<->WEI hops and reloads — leaving WEI and
  // coming back restores the same region instead of resetting to ALL.
  const [filterRegion, setFilterRegion] = usePersistentState<Region>(
    'bloomberg-terminal:wei:region:v1',
    'ALL',
    isOneOf(REGIONS),
  );
  const [, forceUpdate] = useState(0);

  // Re-render when fresh index values arrive from the live data poller.
  useEffect(() => subscribeLiveData(() => forceUpdate((v) => v + 1)), []);

  const filteredIndices =
    filterRegion === 'ALL'
      ? WORLD_EQUITY_INDICES
      : WORLD_EQUITY_INDICES.filter((idx) => idx.region === filterRegion);

  const handleRowClick = (ticker: string) => {
    audioService.playKeyClick();
    if (onSelectTicker) {
      onSelectTicker(ticker);
    }
  };

  return (
    <div className="h-full w-full bg-[#080d16] text-zinc-300 font-mono text-xs flex flex-col select-none">
      {/* Region Filter Bar */}
      <div className="flex items-center justify-between px-3 py-2 bg-[#0c1322] border-b border-[#1b253b]">
        <div className="flex items-center space-x-2">
          <Globe className="w-4 h-4 text-amber-400" />
          <span className="font-bold text-amber-400 tracking-wider">WORLD EQUITY INDICES MONITOR</span>
        </div>

        <div className="flex space-x-1 bg-[#101726] border border-[#212d44] p-0.5 rounded text-[10px]">
          {(['ALL', 'AMERICAS', 'EMEA', 'APAC'] as const).map((reg) => (
            <button
              key={reg}
              onClick={() => {
                audioService.playKeyClick();
                setFilterRegion(reg);
              }}
              className={`px-2 py-0.5 rounded font-bold transition-colors ${
                filterRegion === reg ? 'bg-amber-500 text-black' : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              {reg}
            </button>
          ))}
        </div>
      </div>

      {/* Indices Table */}
      <div className="flex-1 overflow-auto">
        <table className="w-full text-left border-collapse text-[11px]">
          <thead className="bg-[#0b101c] text-zinc-400 border-b border-[#182338] sticky top-0 z-10 text-[10px]">
            <tr>
              <th className="py-2 px-3">REGION</th>
              <th className="py-2 px-3">TICKER</th>
              <th className="py-2 px-3">NAME</th>
              <th className="py-2 px-3 text-right">LAST</th>
              <th className="py-2 px-3 text-right">CHG</th>
              <th className="py-2 px-3 text-right">%CHG</th>
              <th className="py-2 px-3 text-right">YTD%</th>
              <th className="py-2 px-3 text-right hidden sm:table-cell">52W HIGH</th>
              <th className="py-2 px-3 text-right hidden sm:table-cell">52W LOW</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#131b2c]">
            {filteredIndices.map((idx) => {
              const isPositive = Number.isFinite(idx.chg) ? idx.chg >= 0 : true;
              const last = Number.isFinite(idx.value) ? idx.value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : 'N/A';
              const chg = Number.isFinite(idx.chg) ? `${idx.chg >= 0 ? '+' : ''}${idx.chg.toFixed(2)}` : 'N/A';
              const pct = Number.isFinite(idx.pctChg) ? `${idx.pctChg >= 0 ? '+' : ''}${idx.pctChg.toFixed(2)}%` : 'N/A';
              const ytd = Number.isFinite(idx.ytd) ? `${idx.ytd >= 0 ? '+' : ''}${idx.ytd.toFixed(1)}%` : 'N/A';
              return (
                <tr
                  key={idx.ticker}
                  tabIndex={0}
                  onClick={() => handleRowClick(idx.ticker)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      handleRowClick(idx.ticker);
                    }
                  }}
                  className="hover:bg-[#121a2d] transition-colors cursor-pointer group focus:outline-none focus:bg-[#121a2d]"
                >
                  <td className="py-2 px-3 text-[10px] text-zinc-500 font-semibold">{idx.region}</td>
                  <td className="py-2 px-3 font-bold text-amber-400 group-hover:underline">{idx.ticker}</td>
                  <td className="py-2 px-3 text-zinc-200">{idx.name}</td>
                  <td className="py-2 px-3 text-right font-bold text-white">
                    {last}
                  </td>
                  <td
                    className={`py-2 px-3 text-right font-semibold ${
                      isPositive ? 'text-emerald-400' : 'text-rose-400'
                    }`}
                  >
                    {chg}
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
                      {pct}
                    </span>
                  </td>
                  <td
                    className={`py-2 px-3 text-right font-semibold ${
                      Number.isFinite(idx.ytd) ? idx.ytd >= 0 ? 'text-emerald-400' : 'text-rose-400' : 'text-zinc-500'
                    }`}
                  >
                    {ytd}
                  </td>
                  <td className="py-2 px-3 text-right text-zinc-400 hidden sm:table-cell">
                    {Number.isFinite(idx.high) && idx.high > 0 ? idx.high.toLocaleString() : 'N/A'}
                  </td>
                  <td className="py-2 px-3 text-right text-zinc-500 hidden sm:table-cell">
                    {Number.isFinite(idx.low) && idx.low > 0 ? idx.low.toLocaleString() : 'N/A'}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};
