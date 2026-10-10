import React, { useState, useEffect, useMemo } from 'react';
import type { Security } from '../../types/terminal';
import { americanBinomial, calculateBlackScholes, generateOptionsChain, impliedVolatility } from '../../services/optionsPricer';
import { audioService } from '../../services/audioService';
import { usePersistentState, isOneOf } from '../../hooks/usePersistentState';
import { Calculator, SlidersVertical } from 'lucide-react';
import { formatMoney } from '../../utils/format';

interface OptionsPricerPanelProps {
  security: Security;
}

type PanelView = 'CALCULATOR' | 'CHAIN';

/**
 * Black-Scholes options pricer + volatility matrix.
 *
 * NOTE: this file was restored from the pre-corruption production bundle after an
 * editor write zeroed it out (all-NUL, 15,462 bytes). Logic and layout match the
 * build that shipped; money cells now go through `formatMoney` so negative Greeks
 * render `-$x.xx` (finance convention) instead of `$-x.xx`.
 */
export const OptionsPricerPanel: React.FC<OptionsPricerPanelProps> = ({ security }) => {
  const [spot, setSpot] = useState(security.price);
  const [strike, setStrike] = useState(Math.round(security.price));
  const [dte, setDte] = useState(30);
  const [ivPct, setIvPct] = useState(35);
  // Fed funds target is 3.75%-4.00% (FOMC, Sep 16 2026) — 3.88% is the midpoint,
  // matching the risk-free rate hardcoded in generateOptionsChain.
  const [ratePct, setRatePct] = useState(3.88);
  const [divPct, setDivPct] = useState(0);
  const [isAmerican, setIsAmerican] = useState(false);
  const [solverPrice, setSolverPrice] = useState('');
  const [solverIsCall, setSolverIsCall] = useState(true);
  const [view, setView] = usePersistentState<PanelView>(
    'bloomberg-terminal:opts:view:v1',
    'CALCULATOR',
    isOneOf(['CALCULATOR', 'CHAIN'] as const),
  );

  const sym = security.currency === 'INR' ? '₹' : '$';
  // Calculator slider granularity scales with the underlying: a fixed step of
  // 25 is fine for NIFTY but a rounding error on SENSEX 83k (2662 detents) and
  // far too coarse below ₹50. Strike steps mirror liquid strike grids.
  const priceStep =
    security.price > 50000 ? 100
    : security.price > 20000 ? 50
    : security.price > 5000 ? 25
    : security.price > 500 ? 5
    : security.price > 50 ? 1
    : 0.1;
  // Clamp slider bounds so a missing/zero spot price can't invert min > max and
  // wedge the range input (out-of-range value warning + stuck thumb).
  const safePrice = Number.isFinite(security.price) && security.price > 0 ? security.price : 100;
  const spotMin = Math.max(1, safePrice * 0.5);
  const spotMax = Math.max(spotMin + 1, safePrice * 1.5);
  const strikeMin = Math.max(1, safePrice * 0.6);
  const strikeMax = Math.max(strikeMin + 1, safePrice * 1.4);

  // Re-anchor the model to the new underlying whenever the active security changes.
  // Depends on ticker only: depending on price reset the sliders on every
  // live tick and made them impossible to drag.
  const secTicker = security.ticker;
  useEffect(() => {
    setSpot(security.price);
    setStrike(Math.round(security.price));
  }, [secTicker]);

  const greeks = useMemo(
    () => calculateBlackScholes(spot, strike, dte / 365, ivPct / 100, ratePct / 100, divPct / 100),
    [spot, strike, dte, ivPct, ratePct, divPct]
  );

  const americanCall = useMemo(
    () => americanBinomial(spot, strike, dte / 365, ivPct / 100, ratePct / 100, divPct / 100, true, 200),
    [spot, strike, dte, ivPct, ratePct, divPct]
  );
  const americanPut = useMemo(
    () => americanBinomial(spot, strike, dte / 365, ivPct / 100, ratePct / 100, divPct / 100, false, 200),
    [spot, strike, dte, ivPct, ratePct, divPct]
  );

  const solverIV = useMemo(() => {
    const px = parseFloat(solverPrice);
    if (!isFinite(px) || px <= 0) return null;
    return impliedVolatility(px, spot, strike, dte / 365, ratePct / 100, solverIsCall, divPct / 100);
  }, [solverPrice, spot, strike, dte, ratePct, solverIsCall, divPct]);

  const chain = useMemo(
    () => generateOptionsChain(spot, ivPct / 100, dte, ratePct / 100, divPct / 100),
    [spot, ivPct, dte, ratePct, divPct]
  );

  // Strike-grid step derived from the chain itself (no service API change).
  // Drives the ATM band + strike decimals so 1000-pt SENSEX grids and 0.05
  // sub-₹1 grids both highlight and format sanely.
  const chainStep =
    chain.length > 1 && chain[1].strike > chain[0].strike
      ? chain[1].strike - chain[0].strike
      : (security.price * 0.02 || 5);
  const strikeDecimals = chainStep < 1 ? 2 : Number.isInteger(chainStep) ? 0 : 1;
  const fmtBidAsk = (v: number): string =>
    v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  return (
    <div className="h-full w-full min-h-0 bg-[#080d16] text-zinc-300 font-mono text-xs flex flex-col gap-2 p-2 select-none">
      {/* Panel-local header + view switcher */}
      <div className="flex flex-wrap items-center justify-between bg-[#0e1422] p-2 rounded border border-[#1b253b] gap-2 shrink-0">
        <div className="flex items-center space-x-2">
          <Calculator className="w-4 h-4 text-amber-400" />
          <span className="font-bold text-amber-400 tracking-wider">
            BLACK-SCHOLES OPTIONS PRICER & VOLATILITY MATRIX (OPTS)
          </span>
        </div>
        <div className="flex space-x-1 bg-[#101726] border border-[#212d44] p-0.5 rounded text-[10px]">
          <button
            onClick={() => {
              audioService.playKeyClick();
              setView('CALCULATOR');
            }}
            className={`px-2 py-0.5 rounded font-bold transition-colors ${
              view === 'CALCULATOR' ? 'bg-amber-500 text-black' : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            QUANT CALCULATOR
          </button>
          <button
            onClick={() => {
              audioService.playKeyClick();
              setView('CHAIN');
            }}
            className={`px-2 py-0.5 rounded font-bold transition-colors ${
              view === 'CHAIN' ? 'bg-amber-500 text-black' : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            OPTIONS CHAIN
          </button>
        </div>
      </div>

      {view === 'CALCULATOR' ? (
        <div className="space-y-3">
          <div className="bg-[#0e1422] p-3 rounded-lg border border-[#1b253b] space-y-3">
            <div className="flex items-center space-x-1.5 text-amber-400 font-bold text-[11px] pb-1 border-b border-[#182338]">
              <SlidersVertical className="w-3.5 h-3.5" />
              <span>BLACK-SCHOLES MODEL PARAMETERS</span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="space-y-1">
                <div className="flex justify-between text-[11px]">
                  <label htmlFor="opts-spot" className="text-zinc-400">Underlying Spot (S)</label>
                  <span className="text-white font-bold">{formatMoney(spot, 2, sym)}</span>
                </div>
                <input
                  id="opts-spot"
                  type="range"
                  min={spotMin}
                  max={spotMax}
                  step={priceStep}
                  value={Math.min(spotMax, Math.max(spotMin, Number.isFinite(spot) ? spot : spotMin))}
                  aria-label="Underlying spot price"
                  onChange={(e) => setSpot(parseFloat(e.target.value))}
                  className="w-full accent-amber-500"
                />
              </div>
              <div className="space-y-1">
                <div className="flex justify-between text-[11px]">
                  <label htmlFor="opts-strike" className="text-zinc-400">Strike Price (K)</label>
                  <span className="text-amber-400 font-bold">{formatMoney(strike, 2, sym)}</span>
                </div>
                <input
                  id="opts-strike"
                  type="range"
                  min={strikeMin}
                  max={strikeMax}
                  step={priceStep}
                  value={Math.min(strikeMax, Math.max(strikeMin, Number.isFinite(strike) ? strike : strikeMin))}
                  aria-label="Strike price"
                  onChange={(e) => setStrike(parseFloat(e.target.value))}
                  className="w-full accent-amber-500"
                />
              </div>
              <div className="space-y-1">
                <div className="flex justify-between text-[11px]">
                  <span className="text-zinc-400">Days to Expiration (DTE)</span>
                  <span className="text-cyan-300 font-bold">{dte} days</span>
                </div>
                <input
                  type="range"
                  min={1}
                  max={365}
                  value={dte}
                  onChange={(e) => setDte(parseInt(e.target.value))}
                  className="w-full accent-cyan-500"
                />
              </div>
              <div className="space-y-1">
                <div className="flex justify-between text-[11px]">
                  <span className="text-zinc-400">Implied Volatility (σ)</span>
                  <span className="text-purple-300 font-bold">{ivPct}%</span>
                </div>
                <input
                  type="range"
                  min={5}
                  max={150}
                  value={ivPct}
                  onChange={(e) => setIvPct(parseInt(e.target.value))}
                  className="w-full accent-purple-500"
                />
              </div>
              <div className="space-y-1">
                <div className="flex justify-between text-[11px]">
                  <span className="text-zinc-400">Risk-Free Rate (r)</span>
                  <span className="text-emerald-300 font-bold">{ratePct.toFixed(2)}%</span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={12}
                  step={0.05}
                  value={ratePct}
                  onChange={(e) => setRatePct(parseFloat(e.target.value))}
                  className="w-full accent-emerald-500"
                />
              </div>
              <div className="space-y-1">
                <div className="flex justify-between text-[11px]">
                  <span className="text-zinc-400">Dividend Yield (q)</span>
                  <span className="text-emerald-300 font-bold">{divPct.toFixed(2)}%</span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={12}
                  step={0.05}
                  value={divPct}
                  onChange={(e) => setDivPct(parseFloat(e.target.value))}
                  className="w-full accent-emerald-500"
                />
              </div>
              <div className="flex flex-col justify-center bg-[#0a0f1b] p-2 rounded border border-[#172238] text-center">
                <span className="text-[10px] text-zinc-500">MONEYNESS (S / K)</span>
                <span className="text-sm font-bold text-white">{strike > 0 ? (spot / strike).toFixed(3) : 'N/A'}</span>
                <span className="text-[9px] text-amber-400">
                  {spot > strike ? 'IN THE MONEY (CALL)' : spot < strike ? 'OUT OF THE MONEY (CALL)' : 'AT THE MONEY'}
                </span>
              </div>
              <div className="flex items-center justify-between bg-[#0a0f1b] p-2 rounded border border-[#172238] text-[11px]">
                <span className="text-zinc-400">Exercise</span>
                <div className="flex gap-1" role="group" aria-label="Option exercise style">
                  <button
                    onClick={() => setIsAmerican(false)}
                    aria-pressed={!isAmerican}
                    className={`px-2 py-0.5 rounded font-bold ${!isAmerican ? 'bg-amber-500 text-black' : 'text-zinc-400'}`}
                  >
                    EUROPEAN
                  </button>
                  <button
                    onClick={() => setIsAmerican(true)}
                    aria-pressed={isAmerican}
                    className={`px-2 py-0.5 rounded font-bold ${isAmerican ? 'bg-amber-500 text-black' : 'text-zinc-400'}`}
                  >
                    AMERICAN
                  </button>
                </div>
              </div>
              <div className="flex items-center justify-between bg-[#0a0f1b] p-2 rounded border border-[#172238] text-[11px] gap-2">
                <label htmlFor="opts-iv-solver" className="text-zinc-400 whitespace-nowrap">IV Solver</label>
                <input
                  id="opts-iv-solver"
                  value={solverPrice}
                  onChange={(e) => setSolverPrice(e.target.value)}
                  placeholder="mkt price"
                  aria-label="Market option price for implied volatility solver"
                  className="w-20 bg-[#101726] border border-[#202c44] px-1.5 py-0.5 rounded text-white"
                />
                <button
                  onClick={() => setSolverIsCall(!solverIsCall)}
                  className="px-1.5 py-0.5 rounded border border-[#2a3a5c] text-cyan-300 font-bold"
                >
                  {solverIsCall ? 'CALL' : 'PUT'}
                </button>
                <span className="text-purple-300 font-bold">
                  {solverPrice ? (solverIV != null ? (solverIV * 100).toFixed(1) + '%' : 'NO SOL') : '--'}
                </span>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2 text-[10px]">
              <span className={`px-1.5 py-0.5 rounded border font-bold ${Math.abs(greeks.parityViolation) < 0.01 ? 'text-emerald-400 border-emerald-500/40' : 'text-rose-400 border-rose-500/40'}`}>
                PARITY DEV: {greeks.parityViolation.toFixed(4)} {Math.abs(greeks.parityViolation) < 0.01 ? '(ARB-FREE)' : '(CHECK INPUTS)'}
              </span>
              <span className="text-zinc-500">
                Vanna {greeks.vanna.toFixed(4)} · Volga {greeks.volga.toFixed(4)} · Call Charm {greeks.callCharm.toFixed(4)}/day · Put Charm {greeks.putCharm.toFixed(4)}/day · Chain uses r/q above · SIMULATED vols/OI
              </span>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {/* CALL THEO */}
            <div className="bg-[#0e1422] p-3 rounded-lg border border-[#1b253b] space-y-2">
              <div className="flex justify-between items-center pb-1.5 border-b border-[#182338]">
                <span className="text-emerald-400 font-bold text-sm">{isAmerican ? 'AMERICAN CALL' : 'EUROPEAN CALL THEO'}</span>
                <span className="text-xl font-bold text-white">
                  {formatMoney(isAmerican ? americanCall : greeks.callPrice, 2, sym)}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2 text-[11px]">
                <div className="flex justify-between py-0.5 border-b border-[#141b2a]">
                  <span className="text-zinc-400">Delta (Δ):</span>
                  <span className="text-emerald-400 font-semibold">{greeks.callDelta.toFixed(3)}</span>
                </div>
                <div className="flex justify-between py-0.5 border-b border-[#141b2a]">
                  <span className="text-zinc-400">Gamma (Γ):</span>
                  <span className="text-cyan-300 font-semibold">{greeks.gamma.toFixed(4)}</span>
                </div>
                <div className="flex justify-between py-0.5 border-b border-[#141b2a]">
                  <span className="text-zinc-400">Theta (Θ / day):</span>
                  <span className="text-rose-400 font-semibold">{formatMoney(greeks.callTheta, 3, sym)}</span>
                </div>
                <div className="flex justify-between py-0.5 border-b border-[#141b2a]">
                  <span className="text-zinc-400">Vega (per 1% σ):</span>
                  <span className="text-purple-300 font-semibold">{formatMoney(greeks.vega, 3, sym)}</span>
                </div>
                <div className="flex justify-between py-0.5">
                  <span className="text-zinc-400">Rho (per 1% r):</span>
                  <span className="text-zinc-200 font-semibold">{formatMoney(greeks.callRho, 3, sym)}</span>
                </div>
                <div className="flex justify-between py-0.5">
                  <span className="text-zinc-400">d1 / d2:</span>
                  <span className="text-zinc-400">
                    {greeks.d1.toFixed(2)} / {greeks.d2.toFixed(2)}
                  </span>
                </div>
              </div>
            </div>

            {/* PUT THEO */}
            <div className="bg-[#0e1422] p-3 rounded-lg border border-[#1b253b] space-y-2">
              <div className="flex justify-between items-center pb-1.5 border-b border-[#182338]">
                <span className="text-rose-400 font-bold text-sm">{isAmerican ? 'AMERICAN PUT' : 'EUROPEAN PUT THEO'}</span>
                <span className="text-xl font-bold text-white">
                  {formatMoney(isAmerican ? americanPut : greeks.putPrice, 2, sym)}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2 text-[11px]">
                <div className="flex justify-between py-0.5 border-b border-[#141b2a]">
                  <span className="text-zinc-400">Delta (Δ):</span>
                  <span className="text-rose-400 font-semibold">{greeks.putDelta.toFixed(3)}</span>
                </div>
                <div className="flex justify-between py-0.5 border-b border-[#141b2a]">
                  <span className="text-zinc-400">Gamma (Γ):</span>
                  <span className="text-cyan-300 font-semibold">{greeks.gamma.toFixed(4)}</span>
                </div>
                <div className="flex justify-between py-0.5 border-b border-[#141b2a]">
                  <span className="text-zinc-400">Theta (Θ / day):</span>
                  <span className="text-rose-400 font-semibold">{formatMoney(greeks.putTheta, 3, sym)}</span>
                </div>
                <div className="flex justify-between py-0.5 border-b border-[#141b2a]">
                  <span className="text-zinc-400">Vega (per 1% σ):</span>
                  <span className="text-purple-300 font-semibold">{formatMoney(greeks.vega, 3, sym)}</span>
                </div>
                <div className="flex justify-between py-0.5">
                  <span className="text-zinc-400">Rho (per 1% r):</span>
                  <span className="text-zinc-200 font-semibold">{formatMoney(greeks.putRho, 3, sym)}</span>
                </div>
                <div className="flex justify-between py-0.5">
                  <span className="text-zinc-400">Intrinsic:</span>
                  <span className="text-zinc-400">{formatMoney(Math.max(0, strike - spot), 2, sym)}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="bg-[#0e1422] rounded-lg border border-[#1b253b] overflow-auto">
          <table className="w-full text-center text-[10px]">
            <thead className="bg-[#0b101c] text-zinc-400 border-b border-[#182338]">
              <tr>
                <th colSpan={4} className="py-1 bg-emerald-950/40 text-emerald-400 border-r border-[#1e293b]">
                  CALL OPTIONS
                </th>
                <th className="py-1 bg-[#121929] text-amber-400 font-bold">STRIKE</th>
                <th colSpan={4} className="py-1 bg-rose-950/40 text-rose-400 border-l border-[#1e293b]">
                  PUT OPTIONS
                </th>
              </tr>
              <tr className="border-b border-[#182338] text-zinc-500">
                <th className="py-1 px-1.5">DELTA</th>
                <th className="py-1 px-1.5">IV%</th>
                <th className="py-1 px-1.5">BID/ASK</th>
                <th className="py-1 px-1.5 border-r border-[#1e293b]">LAST</th>
                <th className="py-1 px-2 text-amber-400 font-bold">{security.currency}</th>
                <th className="py-1 px-1.5 border-l border-[#1e293b]">LAST</th>
                <th className="py-1 px-1.5">BID/ASK</th>
                <th className="py-1 px-1.5">IV%</th>
                <th className="py-1 px-1.5">DELTA</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#131b2c]">
              {chain.map((c) => {
                // ATM band: the strike(s) within one grid step of spot. The old
                // 2%-of-spot threshold highlighted ALL 15 rows on NIFTY/SENSEX
                // (₹462 band over a ₹700-wide chain) and zero rows on INDIAVIX.
                const nearSpot = Math.abs(c.strike - spot) <= chainStep + 1e-9;
                return (
                  <tr key={c.strike} className={`hover:bg-[#121a2d] ${nearSpot ? 'bg-amber-500/10 font-semibold' : ''}`}>
                    <td className="py-1 px-1.5 text-emerald-400">{c.callDelta.toFixed(2)}</td>
                    <td className="py-1 px-1.5 text-purple-300">{c.callIV}%</td>
                    <td className="py-1 px-1.5 text-zinc-300">
                      {fmtBidAsk(c.callBid)} / {fmtBidAsk(c.callAsk)}
                    </td>
                    <td className="py-1 px-1.5 font-bold text-white border-r border-[#1e293b]">{formatMoney(c.callLast, 2, sym)}</td>
                    <td className="py-1 px-2 font-bold text-amber-400 bg-[#0d1424]">
                      {formatMoney(c.strike, strikeDecimals, sym)}
                    </td>
                    <td className="py-1 px-1.5 font-bold text-white border-l border-[#1e293b]">{formatMoney(c.putLast, 2, sym)}</td>
                    <td className="py-1 px-1.5 text-zinc-300">
                      {fmtBidAsk(c.putBid)} / {fmtBidAsk(c.putAsk)}
                    </td>
                    <td className="py-1 px-1.5 text-purple-300">{c.putIV}%</td>
                    <td className="py-1 px-1.5 text-rose-400">{c.putDelta.toFixed(2)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};



