import React from 'react';
import type { FunctionCode } from '../../types/terminal';
import { HelpCircle, Terminal, ArrowRight } from 'lucide-react';
import { audioService } from '../../services/audioService';

interface HelpShortcutsPanelProps {
  onSelectFunction?: (func: FunctionCode) => void;
}

export const HelpShortcutsPanel: React.FC<HelpShortcutsPanelProps> = ({ onSelectFunction }) => {
  const COMMANDS: { code: FunctionCode; name: string; desc: string }[] = [
    { code: 'GP', name: 'Graph Price', desc: 'Interactive candlestick & volume charting with SMA(20), SMA(50), RSI, MACD, and multi-timeframe views (1D to 5Y).' },
    { code: 'DES', name: 'Security Description', desc: 'Institutional profile, market cap, P/E multiples, 52-week trading range, EPS, and revenue overview.' },
    { code: 'WEI', name: 'World Equity Indices', desc: 'Comprehensive global index matrix across Americas, EMEA, and APAC with % change and YTD performance.' },
    { code: 'TOP', name: 'Top News Wire', desc: 'Live ticker-specific headlines (Google News RSS) plus the seeded macro/equities wire, with per-ticker and category filters.' },
    { code: 'YCRV', name: 'Yield Curve Analysis', desc: 'Govt benchmark yield curves — US Treasury + India G-Sec (1M to 30Y), historical shifts (1M/1Y prior), and 2Y-10Y inversion monitor.' },
    { code: 'FA', name: 'Financial Analysis', desc: 'Multi-year fundamental statements: Income Statement, Balance Sheet, Gross/Operating Margins, and DuPont ROE.' },
    { code: 'ANR', name: 'Analyst Recommendations', desc: 'Wall Street consensus (Strong Buy/Buy/Hold/Sell), 12-month target price distribution, and individual broker ratings.' },
    { code: 'OPTS', name: 'Options & Black-Scholes', desc: 'Interactive Black-Scholes quant pricer with full Greeks (Δ, Γ, Θ, Vega, ρ), volatility smile, and strike chain.' },
    { code: 'PORT', name: 'Portfolio & Risk Monitor', desc: 'Institutional position tracker with daily P&L, 95% 1-day Value at Risk (VaR), Sharpe Ratio, and Beta.' },
    { code: 'FX', name: 'Foreign Exchange Matrix', desc: 'Global G10 & emerging currency cross-rates table, crypto assets (BTC, ETH, SOL), and daily performance.' },
    { code: 'ECO', name: 'Economic Calendar', desc: 'Macro releases (CPI, Non-Farm Payrolls, Fed Interest Rate, GDP, PMI) with Actual vs. Survey vs. Prior.' },
    { code: 'MOST', name: 'Market Movers', desc: 'Top percentage gainers, top decliners, and high trading volume leaders.' },
    { code: 'SIG', name: 'Top Regime Signals', desc: 'Hidden Markov Model regime detection (Bull/Range/Bear) on log returns with Baum-Welch EM, Viterbi decode, and conviction-ranked LONG/SHORT signals.' },
    { code: 'IB', name: 'Alpha Nova Copilot (IB)', desc: 'Institutional Alpha Nova quant-desk AI copilot for answering market and quantitative queries.' },
    { code: 'HELP', name: 'Terminal Directory', desc: 'Command syntax guide, keyboard shortcut cheatsheet, and full terminal functionality directory.' },
  ];

  return (
    <div className="h-full w-full bg-[#080d16] text-zinc-300 font-mono text-xs flex flex-col p-4 overflow-y-auto space-y-4 select-none">
      <div className="flex items-center space-x-2 bg-[#0e1422] p-3 rounded-lg border border-[#1b253b]">
        <HelpCircle className="w-5 h-5 text-amber-400" />
        <div>
          <h2 className="font-bold text-amber-400 text-sm tracking-wider">
            ALPHA NOVA COMMAND SYNTAX & FUNCTION DIRECTORY
          </h2>
          <p className="text-[11px] text-zinc-400">
            Alpha Nova Quant Desk • Master User Guide & Navigation Cheatsheet
          </p>
        </div>
      </div>

      {/* Syntax Guide */}
      <div className="bg-[#0e1422] p-3.5 rounded-lg border border-[#1b253b] space-y-2">
        <span className="text-[11px] font-bold text-cyan-300 flex items-center gap-1.5">
          <Terminal className="w-4 h-4 text-cyan-400" /> COMMAND-LINE SYNTAX RULES
        </span>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5 text-[11px]">
          <div className="bg-[#0a0f1b] p-2.5 rounded border border-[#172238]">
            <span className="text-amber-400 font-bold block mb-1">&lt;TICKER&gt; &lt;FUNCTION&gt;</span>
            <span className="text-zinc-400 text-[10px]">
              Directly loads that security and function. Example: <code className="text-white">NVDA GP</code> or <code className="text-white">AAPL DES</code>.
            </span>
          </div>

          <div className="bg-[#0a0f1b] p-2.5 rounded border border-[#172238]">
            <span className="text-amber-400 font-bold block mb-1">&lt;FUNCTION ONLY&gt;</span>
            <span className="text-zinc-400 text-[10px]">
              Changes the view for the currently selected security. Example: typing <code className="text-white">FA</code> or <code className="text-white">ANR</code>.
            </span>
          </div>

          <div className="bg-[#0a0f1b] p-2.5 rounded border border-[#172238]">
            <span className="text-amber-400 font-bold block mb-1">GLOBAL FUNCTION</span>
            <span className="text-zinc-400 text-[10px]">
              Opens macro workstations. Example: <code className="text-white">WEI</code> (Indices), <code className="text-white">YCRV</code> (Yield Curve), <code className="text-white">TOP</code> (News).
            </span>
          </div>
        </div>
      </div>

      {/* Function Directory Table */}
      <div className="bg-[#0e1422] rounded-lg border border-[#1b253b] overflow-hidden">
        <div className="px-3 py-2 bg-[#0b101c] border-b border-[#182338] text-[10px] font-bold text-amber-400 flex justify-between items-center">
          <span>FUNCTION MNEMONICS DIRECTORY</span>
          <span className="text-zinc-500 font-normal">CLICK ANY ROW TO LAUNCH</span>
        </div>

        <table className="w-full text-left text-[11px]">
          <thead className="bg-[#0b101c] text-zinc-400 border-b border-[#182338] text-[10px]">
            <tr>
              <th className="py-2 px-3 w-24">MNEMONIC</th>
              <th className="py-2 px-3 w-48">FUNCTION NAME</th>
              <th className="py-2 px-3">CAPABILITIES & ANALYTICS</th>
              <th className="py-2 px-3 w-16 text-right">ACTION</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#131b2c]">
            {COMMANDS.map((c) => (
              <tr
                key={c.code}
                tabIndex={0}
                onClick={() => {
                  if (onSelectFunction) {
                    audioService.playKeyClick();
                    onSelectFunction(c.code);
                  }
                }}
                onKeyDown={(e) => {
                  if ((e.key === 'Enter' || e.key === ' ') && onSelectFunction) {
                    e.preventDefault();
                    audioService.playKeyClick();
                    onSelectFunction(c.code);
                  }
                }}
                className="hover:bg-[#121a2d] cursor-pointer group transition-colors focus:outline-none focus:bg-[#121a2d]"
              >
                <td className="py-2 px-3 font-bold text-amber-400">
                  <span className="bg-amber-500/15 border border-amber-500/30 px-1.5 py-0.5 rounded text-[10px] group-hover:bg-amber-500/30">
                    {c.code}
                  </span>
                </td>
                <td className="py-2 px-3 font-semibold text-white group-hover:text-amber-300 transition-colors">
                  {c.name}
                </td>
                <td className="py-2 px-3 text-zinc-400 text-[10px] leading-relaxed">{c.desc}</td>
                <td className="py-2 px-3 text-right">
                  <span className="text-zinc-500 group-hover:text-amber-400 text-[10px] inline-flex items-center gap-0.5">
                    &lt;GO&gt; <ArrowRight className="w-2.5 h-2.5" />
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};
