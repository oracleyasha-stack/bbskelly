import React, { useEffect, useState } from 'react';
import { Coins, TrendingUp, TrendingDown } from 'lucide-react';
import { FX_RATES, CRYPTO_RATES } from '../../data/fx';
import { PanelSection } from '../layout/PanelSection';
import { subscribeLiveData } from '../../services/liveData';
import { marketEngine } from '../../services/marketEngine';
import { audioService } from '../../services/audioService';

interface CurrencyMatrixPanelProps {
  onSelectTicker?: (ticker: string) => void;
}

const fmtRate = (v: unknown, rate: number): string =>
  Number.isFinite(v as number) ? (v as number).toFixed(rate > 10 ? 2 : 4) : 'N/A';

export const CurrencyMatrixPanel: React.FC<CurrencyMatrixPanelProps> = ({ onSelectTicker }) => {
  const [, forceUpdate] = useState(0);

  // Re-render when fresh FX / crypto rates arrive from the live data poller.
  useEffect(() => subscribeLiveData(() => forceUpdate((v) => v + 1)), []);

  const handleRowClick = (pair: string) => {
    audioService.playKeyClick();
    // Fiat pairs (EUR/USD, USD/JPY…) are quotes only — they are not in the
    // security universe, so clicking them previously fired an UNKNOWN TICKER
    // error toast. Only route pairs the terminal can actually load.
    if (onSelectTicker && marketEngine.getSecurity(pair)) {
      onSelectTicker(pair);
    }
  };

  return (
    <div className="h-full w-full min-h-0 bg-[#080d16] text-zinc-300 font-mono text-xs flex flex-col gap-2 p-2 select-none">
      <div className="flex items-center space-x-2 bg-[#0e1422] p-2 rounded border border-[#1b253b] shrink-0">
        <Coins className="w-4 h-4 text-amber-400" />
        <span className="font-bold text-amber-400 tracking-wider">FOREIGN EXCHANGE & DIGITAL ASSETS MATRIX (FX)</span>
      </div>

      {/* G10 & Emerging FX Matrix (own scroll region) */}
      <PanelSection
        title="GLOBAL FIAT CURRENCY CROSS-RATES"
        icon={<Coins className="w-3 h-3" />}
        className="flex-1 min-h-0"
        bodyClassName="overflow-auto"
        actions={<span className="text-[9px] text-zinc-500">{FX_RATES.length} PAIRS</span>}
      >
        <table className="w-full text-left text-[11px]">
          <thead className="bg-[#0b101c] text-zinc-400 border-b border-[#182338] text-[10px]">
            <tr>
              <th className="py-2 px-3">CURRENCY PAIR</th>
              <th className="py-2 px-3 text-right">SPOT RATE</th>
              <th className="py-2 px-3 text-right">NET CHANGE</th>
              <th className="py-2 px-3 text-right">% CHANGE</th>
              <th className="py-2 px-3 text-right">DAY HIGH</th>
              <th className="py-2 px-3 text-right">DAY LOW</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#131b2c]">
            {FX_RATES.map((fx) => {
              const isPositive = Number.isFinite(fx.chg) ? fx.chg >= 0 : true;
              const selectable = !!marketEngine.getSecurity(fx.pair);
              return (
                <tr
                  key={fx.pair}
                  tabIndex={selectable ? 0 : -1}
                  onClick={selectable ? () => handleRowClick(fx.pair) : undefined}
                  onKeyDown={selectable ? (e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      handleRowClick(fx.pair);
                    }
                  } : undefined}
                  className={`transition-colors focus:outline-none focus:bg-[#121a2d] ${selectable ? 'hover:bg-[#121a2d] cursor-pointer group' : 'cursor-default'}`}
                >
                  <td className={`py-2 px-3 font-bold ${selectable ? 'text-amber-400 group-hover:underline' : 'text-zinc-400'}`}>{fx.pair}</td>
                  <td className="py-2 px-3 text-right font-bold text-white">
                    {fmtRate(fx.rate, fx.rate)}
                  </td>
                  <td
                    className={`py-2 px-3 text-right font-semibold ${
                      isPositive ? 'text-emerald-400' : 'text-rose-400'
                    }`}
                  >
                    {Number.isFinite(fx.chg) ? `${isPositive ? '+' : ''}${fmtRate(fx.chg, fx.rate)}` : 'N/A'}
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
                      {Number.isFinite(fx.pctChg) ? `${isPositive ? '+' : ''}${fx.pctChg.toFixed(2)}%` : 'N/A'}
                    </span>
                  </td>
                  <td className="py-2 px-3 text-right text-zinc-400">{fmtRate(fx.high, fx.rate)}</td>
                  <td className="py-2 px-3 text-right text-zinc-500">{fmtRate(fx.low, fx.rate)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </PanelSection>

      {/* Crypto Matrix (own scroll region) */}
      <PanelSection
        title="INSTITUTIONAL DIGITAL ASSETS"
        icon={<Coins className="w-3 h-3" />}
        className="flex-1 min-h-0"
        bodyClassName="overflow-auto"
        actions={<span className="text-[9px] text-zinc-500">{CRYPTO_RATES.length} ASSETS</span>}
      >
        <table className="w-full text-left text-[11px]">
          <thead className="bg-[#0b101c] text-zinc-400 border-b border-[#182338] text-[10px]">
            <tr>
              <th className="py-2 px-3">ASSET</th>
              <th className="py-2 px-3 text-right">LAST (USD)</th>
              <th className="py-2 px-3 text-right">CHANGE</th>
              <th className="py-2 px-3 text-right">% CHANGE</th>
              <th className="py-2 px-3 text-right">24H HIGH</th>
              <th className="py-2 px-3 text-right">24H LOW</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#131b2c]">
            {CRYPTO_RATES.map((cr) => {
              const isPositive = Number.isFinite(cr.chg) ? cr.chg >= 0 : true;
              const selectable = !!marketEngine.getSecurity(cr.pair);
              return (
                <tr
                  key={cr.pair}
                  tabIndex={selectable ? 0 : -1}
                  onClick={selectable ? () => handleRowClick(cr.pair) : undefined}
                  onKeyDown={selectable ? (e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      handleRowClick(cr.pair);
                    }
                  } : undefined}
                  className={`transition-colors focus:outline-none focus:bg-[#121a2d] ${selectable ? 'hover:bg-[#121a2d] cursor-pointer group' : 'cursor-default'}`}
                >
                  <td className={`py-2 px-3 font-bold ${selectable ? 'text-amber-400 group-hover:underline' : 'text-zinc-400'}`}>{cr.pair}</td>
                  <td className="py-2 px-3 text-right font-bold text-white">
                  ${Number.isFinite(cr.rate) ? cr.rate.toLocaleString(undefined, { minimumFractionDigits: 2 }) : 'N/A'}
                </td>
                <td className={`py-2 px-3 text-right font-semibold ${isPositive ? 'text-emerald-400' : 'text-rose-400'}`}>
                    {Number.isFinite(cr.chg) ? `${isPositive ? '+' : '-'}$${Math.abs(cr.chg).toFixed(2)}` : 'N/A'}
                  </td>
                  <td className={`py-2 px-3 text-right font-bold ${isPositive ? 'text-emerald-400' : 'text-rose-400'}`}>
                    {Number.isFinite(cr.pctChg) ? `${isPositive ? '+' : '-'}${Math.abs(cr.pctChg).toFixed(2)}%` : 'N/A'}
                  </td>
                <td className="py-2 px-3 text-right text-zinc-400">${Number.isFinite(cr.high) ? cr.high.toLocaleString() : 'N/A'}</td>
                <td className="py-2 px-3 text-right text-zinc-500">${Number.isFinite(cr.low) ? cr.low.toLocaleString() : 'N/A'}</td>
              </tr>
              );
            })}
          </tbody>
        </table>
      </PanelSection>
    </div>
  );
};
