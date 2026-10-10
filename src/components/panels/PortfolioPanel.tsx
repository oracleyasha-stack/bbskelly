import React, { useState, useEffect, useMemo } from 'react';
import type { PortfolioPosition } from '../../types/terminal';
import { marketEngine } from '../../services/marketEngine';
import { audioService } from '../../services/audioService';
import { Briefcase, Plus, Trash2 } from 'lucide-react';
import { PanelSection } from '../layout/PanelSection';
import { formatMoney, formatSignedMoney } from '../../utils/format';
import { blendReturns, computePortfolioRisk, sparklineReturns } from '../../services/riskEngine';

interface PortfolioPanelProps {
  onSelectTicker?: (ticker: string) => void;
}

const DEFAULT_POSITIONS: PortfolioPosition[] = [
  { id: 'pos-1', ticker: 'NVDA', name: 'NVIDIA Corp', quantity: 250, entryPrice: 110.20, currentPrice: 225.07, marketValue: 56267.50, unrealizedPnL: 28717.50, unrealizedPnLPercent: 104.24, dayPnL: 122.50, weight: 37.5, assetClass: 'EQUITY' },
  { id: 'pos-2', ticker: 'AAPL', name: 'Apple Inc', quantity: 120, entryPrice: 215.00, currentPrice: 341.07, marketValue: 40928.40, unrealizedPnL: 15128.40, unrealizedPnLPercent: 58.64, dayPnL: 615.60, weight: 27.2, assetClass: 'EQUITY' },
  { id: 'pos-3', ticker: 'MSFT', name: 'Microsoft Corp', quantity: 45, entryPrice: 410.00, currentPrice: 516.17, marketValue: 23227.65, unrealizedPnL: 4777.65, unrealizedPnLPercent: 25.89, dayPnL: 819.90, weight: 15.5, assetClass: 'EQUITY' },
  { id: 'pos-4', ticker: 'GOLD', name: 'Spot Gold', quantity: 5, entryPrice: 2520.00, currentPrice: 4280.00, marketValue: 21400.00, unrealizedPnL: 8800.00, unrealizedPnLPercent: 34.92, dayPnL: 24.00, weight: 14.2, assetClass: 'CMDTY' },
  { id: 'pos-5', ticker: 'BTC/USD', name: 'Bitcoin', quantity: 0.1, entryPrice: 58000.00, currentPrice: 83904.00, marketValue: 8390.40, unrealizedPnL: 2590.40, unrealizedPnLPercent: 44.66, dayPnL: -7.60, weight: 5.6, assetClass: 'CRYPTO' },
];

const POSITIONS_KEY = 'bloomberg-terminal:portfolio:v1';

const loadPositions = (): PortfolioPosition[] => {
  try {
    const saved = window.localStorage.getItem(POSITIONS_KEY);
    if (!saved) return DEFAULT_POSITIONS;
    const parsed: unknown = JSON.parse(saved);
    if (!Array.isArray(parsed)) return DEFAULT_POSITIONS;
    if (parsed.length === 0) return [];
    const cleaned = parsed.filter(
      (position): position is PortfolioPosition =>
        position &&
        typeof position.id === 'string' &&
        typeof position.ticker === 'string' &&
        typeof position.quantity === 'number' &&
        Number.isFinite(position.quantity) &&
        position.quantity > 0 &&
        typeof position.entryPrice === 'number' &&
        Number.isFinite(position.entryPrice) &&
        position.entryPrice > 0
    );
    // If storage held only corrupt rows, fall back to defaults rather than
    // rendering an empty portfolio the user never asked for.
    return cleaned.length > 0 || parsed.length === 0 ? cleaned : DEFAULT_POSITIONS;
  } catch {
    return DEFAULT_POSITIONS;
  }
};

export const PortfolioPanel: React.FC<PortfolioPanelProps> = ({ onSelectTicker }) => {
  const [positions, setPositions] = useState<PortfolioPosition[]>(loadPositions);
  const [showAddModal, setShowAddModal] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [newTicker, setNewTicker] = useState('TSLA');
  const [newQty, setNewQty] = useState('50');
  const [newEntry, setNewEntry] = useState('220');

// Re-render on every market tick so positions stay marked to market.
  const [liveTick, setLiveTick] = useState(0);
  useEffect(() => {
    const unsubscribe = marketEngine.subscribe(() => setLiveTick((v) => v + 1));
    const fallback = window.setInterval(() => setLiveTick((v) => v + 1), 15_000);
    return () => {
      unsubscribe();
      window.clearInterval(fallback);
    };
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem(POSITIONS_KEY, JSON.stringify(positions));
    } catch {
      // Keep the portfolio usable when browser storage is unavailable.
    }
  }, [positions]);

  // Mark each position to the engine's latest price (falls back to stored value).
  // Memoized on positions + liveTick so typing in the Add-Position modal (or any
  // unrelated parent render) doesn't recompute blendReturns + risk per keystroke.
  // liveTick is the refresh signal: the memo reads live engine prices via getSecurity.
  const livePositions: PortfolioPosition[] = useMemo(() => positions.map((p) => {
    const live = marketEngine.getSecurity(p.ticker);
    const livePrice = live?.price;
    const storedPrice = typeof p.currentPrice === 'number' ? p.currentPrice : NaN;
    const price = typeof livePrice === 'number' && Number.isFinite(livePrice) && livePrice > 0
      ? livePrice
      : Number.isFinite(storedPrice) && storedPrice > 0
        ? storedPrice
        : 0;
    const dayChange = live?.change ?? (p.quantity > 0 ? p.dayPnL / p.quantity : 0);
    const marketValue = p.quantity * price;
    const cost = p.quantity * p.entryPrice;
    const unrealizedPnL = marketValue - cost;
    return {
      ...p,
      currentPrice: price,
      marketValue,
      unrealizedPnL,
      unrealizedPnLPercent: cost > 0 ? (unrealizedPnL / cost) * 100 : 0,
      dayPnL: p.quantity * dayChange,
    };
  }), [positions, liveTick]);

  // Compute live portfolio metrics with a real covariance-block risk model.
  // No hardcoded VaR/Sharpe/Beta: vol comes from asset-class assumptions blended
  // with sparkline-implied histories, VaR is z * sigma_daily * NAV.
  const portfolioStats = useMemo(() => {
    const histories: Record<string, number[]> = {};
    const wmap: Record<string, number> = {};
    const nav = livePositions.reduce((a, p) => a + p.marketValue, 0);
    for (const p of livePositions) {
      const live = marketEngine.getSecurity(p.ticker);
      const spark = live?.sparkline ?? [];
      const rets = sparklineReturns(spark);
      // Repeat short spark histories to reach a minimum sample for hist VaR;
      // flagged as ESTIMATED in the UI.
      const extended: number[] = [];
      while (extended.length < 60 && rets.length > 0) extended.push(...rets);
      histories[p.ticker] = extended.slice(-60);
      wmap[p.ticker] = nav > 0 ? p.marketValue / nav : 0;
    }
    const blended = blendReturns(histories, wmap);
    const risk = computePortfolioRisk({
      positions: livePositions,
      portfolioReturns: blended.length >= 12 ? blended : undefined,
    });
    const dayTotalPnL = livePositions.reduce((a, p) => a + p.dayPnL, 0);
    return { ...risk, dayTotalPnL };
  }, [livePositions]);

  const handleRemove = (id: string) => {
    audioService.playKeyClick();
    setPositions((prev) => prev.filter((p) => p.id !== id));
  };

  const handleAddPosition = (e: React.FormEvent) => {
    e.preventDefault();
    const ticker = newTicker.trim().toUpperCase();
    const sec = marketEngine.getSecurity(ticker);
    const qty = Number(newQty);
    const entry = Number(newEntry);
    if (!sec) {
      setFormError(`Ticker ${ticker || '(blank)'} is not in the supported universe.`);
      return;
    }
    if (!Number.isFinite(qty) || qty <= 0) {
      setFormError('Quantity must be greater than zero.');
      return;
    }
    if (!Number.isFinite(entry) || entry <= 0) {
      setFormError('Entry price must be greater than zero.');
      return;
    }
    audioService.playExecuteThud();
    setFormError(null);
    const marketVal = qty * sec.price;
    const pnl = marketVal - qty * entry;
    const pnlPct = (pnl / (qty * entry)) * 100;

    const newPos: PortfolioPosition = {
      id: `pos-${Date.now()}`,
      ticker: sec.ticker,
      name: sec.name,
      quantity: qty,
      entryPrice: entry,
      currentPrice: sec.price,
      marketValue: marketVal,
      unrealizedPnL: pnl,
      unrealizedPnLPercent: pnlPct,
      dayPnL: qty * sec.change,
      weight: 10,
      assetClass: sec.assetClass,
      currency: (sec as any).currency || 'USD',
    };

    setPositions((prev) => [...prev, newPos]);
    setShowAddModal(false);
  };

  return (
    <div className="h-full w-full min-h-0 bg-[#080d16] text-zinc-300 font-mono text-xs flex flex-col gap-2 p-2 select-none">
      {/* Header and Add Button */}
      <div className="flex items-center justify-between bg-[#0e1422] p-2 rounded border border-[#1b253b] shrink-0">
        <div className="flex items-center space-x-2">
          <Briefcase className="w-4 h-4 text-amber-400" />
          <span className="font-bold text-amber-400 tracking-wider">PORTFOLIO & RISK MONITOR (PORT)</span>
        </div>

        <button
          onClick={() => {
            audioService.playKeyClick();
            setShowAddModal(true);
          }}
          className="flex items-center space-x-1 bg-amber-500 hover:bg-amber-400 text-black px-2.5 py-1 rounded text-[11px] font-bold transition-colors"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>ADD POSITION</span>
        </button>
      </div>

      {/* Top Institutional KPI Cards (fixed height, no scroll) */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 shrink-0">
        <div className="bg-[#0e1422] p-2.5 rounded-lg border border-[#1b253b]">
          <span className="text-[10px] text-zinc-400 uppercase">PORTFOLIO NAV</span>
          <span className="text-xl font-bold text-white block mt-0.5">
            {formatMoney(portfolioStats.totalValue)}
          </span>
          <span className="text-[10px] text-zinc-500">Book Cost: {formatMoney(portfolioStats.totalCost, 0)}</span>
        </div>

        <div className="bg-[#0e1422] p-2.5 rounded-lg border border-[#1b253b]">
          <span className="text-[10px] text-zinc-400 uppercase">UNREALIZED P&L</span>
          <span
            className={`text-xl font-bold block mt-0.5 ${
              portfolioStats.totalPnL >= 0 ? 'text-emerald-400' : 'text-rose-400'
            }`}
          >
            {formatSignedMoney(portfolioStats.totalPnL)}
          </span>
          <span
            className={`text-[10px] font-semibold ${
              portfolioStats.totalPnLPercent >= 0 ? 'text-emerald-400' : 'text-rose-400'
            }`}
          >
            {portfolioStats.totalPnLPercent >= 0 ? '+' : ''}
            {portfolioStats.totalPnLPercent.toFixed(2)}% Overall
          </span>
        </div>

        <div className="bg-[#0e1422] p-2.5 rounded-lg border border-[#1b253b]">
          <span className="text-[10px] text-zinc-400 uppercase">1-DAY VaR 95% (PARAM)</span>
          <span className="text-xl font-bold text-rose-400 block mt-0.5">
            {formatMoney(-portfolioStats.var95Param)}
          </span>
          <span className="text-[10px] text-zinc-500">
            HIST: {portfolioStats.var95Hist != null ? formatMoney(-portfolioStats.var95Hist) : 'N/A'} · CVaR:{' '}
            {portfolioStats.cvar95Hist != null ? formatMoney(-portfolioStats.cvar95Hist) : 'N/A'}
          </span>
        </div>

        <div className="bg-[#0e1422] p-2.5 rounded-lg border border-[#1b253b]">
          <span className="text-[10px] text-zinc-400 uppercase">VOL / SHARPE / BETA</span>
          <span className="text-xl font-bold text-cyan-300 block mt-0.5">
            {(portfolioStats.annVolatility * 100).toFixed(1)}%{' '}
            <span className="text-zinc-500 text-sm font-normal">
              / {portfolioStats.sharpe != null ? portfolioStats.sharpe.toFixed(2) : 'N/A'} /{' '}
              {portfolioStats.beta != null ? portfolioStats.beta.toFixed(2) + 'β' : 'N/A β'}
            </span>
          </span>
          <span className="text-[10px] text-zinc-500">
            MDD: {portfolioStats.maxDrawdown != null ? (portfolioStats.maxDrawdown * 100).toFixed(1) + '%' : 'N/A'} ·
            HHI: {portfolioStats.concentrationHHI.toFixed(2)} · TOP3:{' '}
            {portfolioStats.top3Weight.toFixed(1)}% · ESTIMATED
          </span>
        </div>
      </div>

      {/* Risk contribution strip */}
      <div className="shrink-0 rounded border border-[#1b253b] bg-[#0e1422] px-2.5 py-1.5 text-[10px] text-zinc-400">
        <span className="font-bold text-zinc-300">RISK CONTRIB: </span>
        {portfolioStats.weights.map((w) => (
          <span key={w.ticker} className="mr-2">
            {w.ticker} {w.weight.toFixed(1)}% wt / {w.riskContribution.toFixed(1)}% risk
          </span>
        ))}
        <span className="text-zinc-500">· RC from block model ρ=0.45, vols by asset class (sums to 100%) · sample stats scaled from ~5-min bars, ESTIMATED</span>
      </div>

      {/* Holdings Table (own scroll region) */}
      <PanelSection
        title="HOLDINGS & POSITION-LEVEL P&L"
        icon={<Briefcase className="w-3 h-3" />}
        className="flex-1 min-h-0"
        bodyClassName="overflow-auto"
        actions={
          <span className="text-[9px] text-zinc-500">
            {positions.length} POSITIONS
          </span>
        }
      >
        <table className="w-full text-left text-[11px]">
          <thead className="bg-[#0b101c] text-zinc-400 border-b border-[#182338] text-[10px]">
            <tr>
              <th className="py-2 px-3">TICKER</th>
              <th className="py-2 px-3">SECURITY NAME</th>
              <th className="py-2 px-3 text-right">QTY</th>
              <th className="py-2 px-3 text-right">AVG ENTRY</th>
              <th className="py-2 px-3 text-right">MARKET PRICE</th>
              <th className="py-2 px-3 text-right">TOTAL VALUE</th>
              <th className="py-2 px-3 text-right">DAY P&L</th>
              <th className="py-2 px-3 text-right">TOTAL P&L</th>
              <th className="py-2 px-3 text-center">ACTION</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#131b2c]">
            {livePositions.length === 0 ? (
              <tr>
                <td colSpan={9} className="py-8 px-3 text-center">
                  <p className="font-bold text-zinc-300">NO POSITIONS — PORTFOLIO IS FLAT</p>
                  <p className="text-[10px] text-zinc-500 mt-1">Use ADD POSITION to open your first holding.</p>
                </td>
              </tr>
            ) : (
            livePositions.map((p) => {
              const isPositive = p.unrealizedPnL >= 0;
              const isDayPositive = p.dayPnL >= 0;
              const posCurrency = p.currency || marketEngine.getSecurity(p.ticker)?.currency || 'USD';
              const sym = posCurrency === 'INR' ? '₹' : '$';
              return (
                <tr key={p.id} className="hover:bg-[#121a2d] transition-colors">
                  <td className="py-2 px-3 font-bold text-amber-400">
                    <button
                      onClick={() => onSelectTicker?.(p.ticker)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          onSelectTicker?.(p.ticker);
                        }
                      }}
                      className="font-bold text-amber-400 hover:underline focus:outline-none focus:underline"
                      title={`Load ${p.ticker} across the terminal`}
                    >
                      {p.ticker}
                    </button>
                  </td>
                  <td className="py-2 px-3 text-zinc-300">{p.name}</td>
                  <td className="py-2 px-3 text-right font-semibold text-white">{p.quantity}</td>
                  <td className="py-2 px-3 text-right text-zinc-400">{formatMoney(p.entryPrice, 2, sym)}</td>
                  <td className="py-2 px-3 text-right font-bold text-zinc-100">{formatMoney(p.currentPrice, 2, sym)}</td>
                  <td className="py-2 px-3 text-right font-bold text-white">
                    {formatMoney(p.marketValue, 2, sym)}
                  </td>
                  <td
                    className={`py-2 px-3 text-right font-semibold ${
                      isDayPositive ? 'text-emerald-400' : 'text-rose-400'
                    }`}
                  >
                    {formatSignedMoney(p.dayPnL, 2, sym)}
                  </td>
                  <td
                    className={`py-2 px-3 text-right font-bold ${
                      isPositive ? 'text-emerald-400' : 'text-rose-400'
                    }`}
                  >
                    {formatSignedMoney(p.unrealizedPnL, 2, sym)} ({isPositive ? '+' : ''}
                    {p.unrealizedPnLPercent.toFixed(1)}%)
                  </td>
                  <td className="py-2 px-3 text-center">
                    <button
                      onClick={() => {
                        if (window.confirm(`Remove ${p.ticker} position? This cannot be undone.`)) {
                          handleRemove(p.id);
                        }
                      }}
                      aria-label={`Remove ${p.ticker} position`}
                      title="Delete Position"
                      className="text-zinc-500 hover:text-rose-400 transition-colors p-1.5 min-h-[28px] min-w-[28px] inline-flex items-center justify-center rounded focus-visible:outline-2 focus-visible:outline-rose-400"
                    >
                      <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                    </button>
                  </td>
                </tr>
              );
            }))}
          </tbody>
        </table>
      </PanelSection>

      {/* Add Position Modal */}
      {showAddModal && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Add portfolio position"
          onKeyDown={(e) => {
            if (e.key === 'Escape') setShowAddModal(false);
          }}
          className="fixed inset-0 bg-black/75 backdrop-blur-xs flex items-center justify-center z-50 p-4"
        >
          <div className="bg-[#0f1626] border border-[#22304d] rounded-lg p-4 max-w-sm w-full space-y-3 shadow-2xl">
            <div className="flex justify-between items-center pb-2 border-b border-[#1b263e]">
              <span className="font-bold text-amber-400 text-sm">ADD PORTFOLIO POSITION</span>
              <button onClick={() => setShowAddModal(false)} aria-label="Close add position dialog" className="text-zinc-400 hover:text-white p-1.5 min-h-[28px] min-w-[28px] inline-flex items-center justify-center rounded focus-visible:outline-2 focus-visible:outline-amber-400">
                ✕
              </button>
            </div>

            <form onSubmit={handleAddPosition} className="space-y-3 text-xs">
              <div>
                <label className="text-zinc-400 block mb-1">TICKER SYMBOL</label>
                <input
                  type="text"
                  value={newTicker}
                  onChange={(e) => setNewTicker(e.target.value.toUpperCase())}
                  className="w-full bg-[#0a0f1b] border border-[#232f48] px-2.5 py-1.5 rounded text-amber-300 font-bold focus:outline-none focus:border-amber-400 uppercase"
                  required
                />
              </div>

              <div>
                <label className="text-zinc-400 block mb-1">QUANTITY</label>
                <input
                  type="number"
                  step="any"
                  min="0.00000001"
                  value={newQty}
                  onChange={(e) => setNewQty(e.target.value)}
                  className="w-full bg-[#0a0f1b] border border-[#232f48] px-2.5 py-1.5 rounded text-white focus:outline-none focus:border-amber-400"
                  required
                />
              </div>

              <div>
                <label className="text-zinc-400 block mb-1">ENTRY PRICE ($)</label>
                <input
                  type="number"
                  step="any"
                  min="0.00000001"
                  value={newEntry}
                  onChange={(e) => setNewEntry(e.target.value)}
                  className="w-full bg-[#0a0f1b] border border-[#232f48] px-2.5 py-1.5 rounded text-white focus:outline-none focus:border-amber-400"
                  required
                />
              </div>

              {formError && (
                <p role="alert" className="text-rose-400" aria-live="polite">
                  {formError}
                </p>
              )}

              <div className="flex justify-end space-x-2 pt-2 border-t border-[#1b263e]">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-3 py-1.5 rounded bg-zinc-800 text-zinc-300 hover:bg-zinc-700"
                >
                  CANCEL
                </button>
                <button
                  type="submit"
                  className="px-3 py-1.5 rounded bg-amber-500 hover:bg-amber-400 text-black font-bold"
                >
                  CONFIRM &lt;GO&gt;
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
