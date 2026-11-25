import React from 'react';
import type { Security } from '../../types/terminal';
import { Building2, TrendingUp, DollarSign, Award } from 'lucide-react';
import { PanelSection } from '../layout/PanelSection';
import { currencySymbol } from '../../services/analystData';

interface SecurityDescriptionProps {
  security: Security;
}

export const SecurityDescription: React.FC<SecurityDescriptionProps> = ({ security }) => {
  const safeNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
  const price = safeNum(security.price) ? security.price : 0;
  const change = safeNum(security.change) ? security.change : 0;
  const changePercent = safeNum(security.changePercent) ? security.changePercent : 0;
  const isPositive = change >= 0;
  const symbol = currencySymbol(security);
  const low52 = safeNum(security.fiftyTwoWeekLow) ? security.fiftyTwoWeekLow : price;
  const high52 = safeNum(security.fiftyTwoWeekHigh) ? security.fiftyTwoWeekHigh : price;
  const fiftyTwoRange = high52 - low52;
  const currentRangePosition = fiftyTwoRange > 0
    ? Math.min(100, Math.max(0, ((price - low52) / fiftyTwoRange) * 100))
    : 0;

  const hasTarget = safeNum(security.targetPrice) && security.targetPrice > 0;
  const upsidePercent = hasTarget && price > 0
    ? ((security.targetPrice - price) / price) * 100
    : null;

  return (
    <div className="h-full w-full min-h-0 bg-[#080d16] text-zinc-300 font-mono text-xs flex flex-col gap-1.5 p-1.5 select-none">
      {/* ---- Profile & Description (own scroll region) ---- */}
      <PanelSection
        title={`${security.ticker} COMPANY PROFILE`}
        icon={<Building2 className="w-3 h-3" />}
        className="shrink-0"
        scroll={false}
        bodyClassName="p-2 overflow-visible"
      >
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#182236] pb-1.5 mb-2">
          <div>
            <div className="flex items-center space-x-2">
              <span className="text-lg font-bold text-amber-400">{security.ticker}</span>
              <span className="text-xs font-semibold text-white">{security.name}</span>
              <span className="text-[10px] bg-[#1a253d] text-cyan-300 px-1.5 py-0.5 rounded border border-[#27385a]">
                {security.exchange} : {security.assetClass}
              </span>
            </div>
            <p className="text-[10px] text-zinc-400 mt-0.5">
              {security.sector} • {security.industry}
            </p>
          </div>

          <div className="text-right">
            <div className="text-xl font-bold text-white tracking-tight">
              {symbol}
              {price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
            <div
              className={`text-xs font-bold ${
                isPositive ? 'text-emerald-400' : 'text-rose-400'
              }`}
            >
              {isPositive ? '+' : ''}
              {change.toFixed(2)} ({isPositive ? '+' : ''}
              {changePercent.toFixed(2)}%)
            </div>
          </div>
        </div>

        {/* Description Text */}
        <p className="text-zinc-300 text-[10px] leading-snug bg-[#0a0f1b] p-2 rounded border border-[#151f33] max-h-16 overflow-y-auto">
          {security.description}
        </p>
      </PanelSection>

      {/* ---- Valuation, Range & Consensus (own scroll region) ---- */}
      <PanelSection
        title="VALUATION, TRADING RANGE & STREET CONSENSUS"
        icon={<DollarSign className="w-3 h-3" />}
        className="flex-1 min-h-0"
        bodyClassName="p-1.5 overflow-auto space-y-2"
      >
      {/* Grid: Key Financial Metrics & 52-Week Range */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
        {/* Valuation Multiples */}
        <div className="bg-[#0e1422] border border-[#1b253b] rounded-lg p-2">
          <div className="flex items-center space-x-1.5 text-amber-400 font-bold text-[11px] mb-2 border-b border-[#182236] pb-1">
            <DollarSign className="w-3.5 h-3.5" />
            <span>VALUATION & CAPITALIZATION</span>
          </div>

          <div className="space-y-1 text-[10px]">
            <div className="flex justify-between py-0.5 border-b border-[#141b2a]">
              <span className="text-zinc-400">Market Cap</span>
              <span className="text-white font-semibold">{security.marketCap}</span>
            </div>
            <div className="flex justify-between py-0.5 border-b border-[#141b2a]">
              <span className="text-zinc-400">P/E Ratio (TTM)</span>
              <span className="text-amber-300 font-semibold">{safeNum(security.peRatio) ? security.peRatio.toFixed(2) : 'N/A'}</span>
            </div>
            <div className="flex justify-between py-0.5 border-b border-[#141b2a]">
              <span className="text-zinc-400">Forward P/E</span>
              <span className="text-zinc-200 font-semibold">{safeNum(security.fwdPe) ? security.fwdPe.toFixed(2) : 'N/A'}</span>
            </div>
            <div className="flex justify-between py-0.5 border-b border-[#141b2a]">
              <span className="text-zinc-400">EV / EBITDA</span>
              <span className="text-zinc-200 font-semibold">{safeNum(security.evEbitda) ? security.evEbitda.toFixed(1) : 'N/A'}</span>
            </div>
            <div className="flex justify-between py-0.5 border-b border-[#141b2a]">
              <span className="text-zinc-400">Earnings Per Share (EPS)</span>
              <span className="text-emerald-400 font-semibold">
                {safeNum(security.eps) ? `${symbol}${security.eps.toFixed(2)}` : 'N/A'}
              </span>
            </div>
            <div className="flex justify-between py-0.5 border-b border-[#141b2a]">
              <span className="text-zinc-400">Dividend Yield</span>
              <span className="text-cyan-300 font-semibold">
                {safeNum(security.divYield) ? `${security.divYield.toFixed(2)}%` : 'N/A'}
              </span>
            </div>
            <div className="flex justify-between py-0.5">
              <span className="text-zinc-400">Beta (5Y Monthly)</span>
              <span className="text-zinc-200 font-semibold">{safeNum(security.beta) ? security.beta.toFixed(2) : 'N/A'}</span>
            </div>
          </div>
        </div>

        {/* 52-Week Range & Trading Liquidity */}
        <div className="bg-[#0e1422] border border-[#1b253b] rounded-lg p-2 flex flex-col justify-between">
          <div>
            <div className="flex items-center space-x-1.5 text-cyan-400 font-bold text-[11px] mb-2 border-b border-[#182236] pb-1">
              <TrendingUp className="w-3.5 h-3.5" />
              <span>52-WEEK TRADING RANGE</span>
            </div>

            {/* Range Bar */}
            <div className="my-3">
              <div className="flex justify-between text-[10px] text-zinc-400 mb-1">
                <span>52W LOW: {symbol}{low52.toFixed(2)}</span>
                <span className="text-amber-400 font-bold">CURRENT: {symbol}{price.toFixed(2)}</span>
                <span>52W HIGH: {symbol}{high52.toFixed(2)}</span>
              </div>
              <div className="w-full bg-[#182236] h-2.5 rounded-full overflow-hidden relative">
                <div
                  className="bg-gradient-to-r from-cyan-500 via-amber-400 to-emerald-400 h-full rounded-full transition-all duration-500"
                  style={{ width: `${currentRangePosition}%` }}
                />
              </div>
            </div>
          </div>

          <div className="space-y-1 text-[10px] border-t border-[#182236] pt-1.5">
            <div className="flex justify-between py-0.5 border-b border-[#141b2a]">
              <span className="text-zinc-400">Day High / Low</span>
              <span className="text-zinc-200">
                {symbol}{(safeNum(security.low) ? security.low : price).toFixed(2)} - {symbol}{(safeNum(security.high) ? security.high : price).toFixed(2)}
              </span>
            </div>
            <div className="flex justify-between py-0.5 border-b border-[#141b2a]">
              <span className="text-zinc-400">Current Volume</span>
              <span className="text-white font-semibold">{(safeNum(security.volume) ? security.volume : 0).toLocaleString()}</span>
            </div>
            <div className="flex justify-between py-0.5">
              <span className="text-zinc-400">Average Volume (30D)</span>
              <span className="text-zinc-300">{(safeNum(security.avgVolume) ? security.avgVolume : 0).toLocaleString()}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Wall Street Consensus & Price Target Gauge */}
      <div className="bg-[#0e1422] border border-[#1b253b] rounded-lg p-2">
        <div className="flex items-center space-x-1.5 text-emerald-400 font-bold text-[11px] mb-2 border-b border-[#182236] pb-1">
          <Award className="w-3.5 h-3.5" />
          <span>ANALYST CONSENSUS & 12-MONTH TARGET</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-2 items-center">
          <div className="bg-[#0b101c] p-2.5 rounded border border-[#172238] text-center">
            <span className="text-[10px] text-zinc-500 uppercase tracking-wider block">CONSENSUS</span>
            <span
              className={`text-base font-extrabold mt-0.5 block ${
                (security.consensusRating ?? '').includes('BUY')
                  ? 'text-emerald-400'
                  : security.consensusRating === 'HOLD'
                  ? 'text-amber-400'
                  : 'text-rose-400'
              }`}
            >
              {(security.consensusRating ?? 'HOLD').replace(/_/g, ' ')}
            </span>
            <span className="text-[9px] text-zinc-500">{security.analystCount} Wall Street Analysts</span>
          </div>

          <div className="bg-[#0b101c] p-2.5 rounded border border-[#172238] text-center">
            <span className="text-[10px] text-zinc-500 uppercase tracking-wider block">12M MEAN TARGET</span>
            <span className="text-base font-extrabold text-amber-300 mt-0.5 block">
              {hasTarget && safeNum(security.targetPrice) ? `${symbol}${security.targetPrice.toFixed(2)}` : 'N/A'}
            </span>
            <span
              className={`text-[10px] font-bold ${
                upsidePercent === null
                  ? 'text-zinc-500'
                  : upsidePercent >= 0
                  ? 'text-emerald-400'
                  : 'text-rose-400'
              }`}
            >
              {upsidePercent !== null
                ? `${upsidePercent >= 0 ? '+' : ''}${upsidePercent.toFixed(1)}% Implied Upside`
                : 'No target set'}
            </span>
          </div>

          <div className="bg-[#0b101c] p-2.5 rounded border border-[#172238] space-y-1 text-[10px]">
            <div className="flex justify-between">
              <span className="text-zinc-500">Street High Target:</span>
              <span className="text-emerald-400 font-semibold">
                {hasTarget && safeNum(security.targetHigh) ? `${symbol}${security.targetHigh.toFixed(2)}` : 'N/A'}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-zinc-500">Street Low Target:</span>
              <span className="text-rose-400 font-semibold">
                {hasTarget && safeNum(security.targetLow) ? `${symbol}${security.targetLow.toFixed(2)}` : 'N/A'}
              </span>
            </div>
          </div>
        </div>
      </div>
      </PanelSection>
    </div>
  );
};
