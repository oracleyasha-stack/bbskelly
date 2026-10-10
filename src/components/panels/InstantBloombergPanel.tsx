import React, { useState } from 'react';
import type { QuantMessage, FunctionCode } from '../../types/terminal';
import { marketEngine } from '../../services/marketEngine';
import { US_TREASURY_YIELD_CURVE } from '../../data/yieldCurve';
import { calculateBlackScholes } from '../../services/optionsPricer';
import { getFeedStatus } from '../../services/liveData';
import { audioService } from '../../services/audioService';
import { MessageSquare, Send } from 'lucide-react';

interface InstantBloombergPanelProps {
  onSelectTicker?: (ticker: string) => void;
  onSelectFunction?: (func: FunctionCode) => void;
}

const INITIAL_MESSAGES: QuantMessage[] = [
  {
    id: 'm-1',
    sender: 'SYSTEM',
    text: 'ALPHA NOVA QUANT DESK - MARKET COPILOT (IB) ACTIVE. CONNECTION ESTABLISHED: SECURE DESK PROTOCOL.',
    timestamp: '14:30:00 UTC',
  },
  {
    id: 'm-2',
    sender: 'QUANT_COPILOT',
    text: `Good session. I am your Alpha Nova Quantitative Market Copilot. 
I can analyze factor risk models, Black-Scholes volatility surfaces, macroeconomic releases, Wall Street consensus estimates, or execute cross-asset pricing queries. How can I assist your desk today?`,
    timestamp: '14:30:02 UTC',
  },
];

export const InstantBloombergPanel: React.FC<InstantBloombergPanelProps> = ({
  onSelectTicker,
  onSelectFunction,
}) => {
  const [messages, setMessages] = useState<QuantMessage[]>(INITIAL_MESSAGES);
  const [inputText, setInputText] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const replyTimer = React.useRef<number | null>(null);
  const scrollRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    return () => {
      if (replyTimer.current !== null) window.clearTimeout(replyTimer.current);
    };
  }, []);

  React.useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, isTyping]);

  const handleSend = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!inputText.trim()) return;

    audioService.playExecuteThud();
    const userMsg: QuantMessage = {
      id: `m-${Date.now()}`,
      sender: 'TRADER',
      text: inputText.trim(),
      timestamp: new Date().toLocaleTimeString('en-GB', { timeZone: 'UTC', hour12: false }) + ' UTC',
    };

    const query = inputText.trim().toUpperCase();
    setInputText('');
    setMessages((prev) => [...prev, userMsg]);
    setIsTyping(true);

    if (replyTimer.current !== null) window.clearTimeout(replyTimer.current);
    replyTimer.current = window.setTimeout(() => {
      let botResponse = '';
      // Tickers/functions the copilot cites, surfaced as clickable chips.
      let replyTickers: string[] = [];
      let replyFunctions: FunctionCode[] = [];
      const stamp = new Date().toLocaleTimeString('en-GB', { timeZone: 'UTC', hour12: false }) + ' UTC';
      const feed = getFeedStatus();
      const src = feed.live && !feed.stale ? 'Yahoo Finance live' : 'curated snapshot + simulated tape';

      // Check if user is asking about a specific security in our coverage universe
      const allSecs = marketEngine.getAllSecurities();
      const words = query.split(/[^A-Z0-9&.-]+/).filter(Boolean);
      const matchedAll = allSecs.filter(
        (s) =>
          words.includes(s.ticker.toUpperCase()) ||
          words.includes(s.ticker.replace('.NS', '').toUpperCase()) ||
          (s.name.length > 3 && query.includes(s.name.toUpperCase()))
      );
      const matchedSec = matchedAll[0] ?? null;
      const secondSec = matchedAll[1] ?? null;

      const rangePos = (s: typeof matchedSec): string => {
        if (!s) return 'N/A';
        if (!Number.isFinite(s.fiftyTwoWeekHigh) || !Number.isFinite(s.fiftyTwoWeekLow) || !Number.isFinite(s.price)) return 'N/A';
        const r = s.fiftyTwoWeekHigh - s.fiftyTwoWeekLow;
        if (!(r > 0)) return 'N/A';
        return (((s.price - s.fiftyTwoWeekLow) / r) * 100).toFixed(0) + '% up 52w range';
      };
      const pctStr = (v: number): string => Number.isFinite(v) ? `${v >= 0 ? '+' : ''}${v.toFixed(2)}%` : 'N/A';

      if (matchedSec && secondSec && matchedSec.ticker !== secondSec.ticker) {
        const a = matchedSec;
        const b = secondSec;
        botResponse = `[ALPHA NOVA // COMPARE ${a.ticker} vs ${b.ticker} · ${src} ${stamp}]
• ${a.ticker}: ${pctStr(a.changePercent)} day · P/E ${a.peRatio?.toFixed(1) ?? 'N/A'} · range ${rangePos(a)}
• ${b.ticker}: ${pctStr(b.changePercent)} day · P/E ${b.peRatio?.toFixed(1) ?? 'N/A'} · range ${rangePos(b)}
• Spread (day): ${Number.isFinite(a.changePercent) && Number.isFinite(b.changePercent) ? (a.changePercent - b.changePercent).toFixed(2) + 'pp in favour of ' + (a.changePercent >= b.changePercent ? a : b).ticker : 'N/A'}
• Not investment advice. Open GP/DES for full series.`;
        replyTickers = [a.ticker, b.ticker];
        replyFunctions = ['GP', 'DES', 'MOST', 'SIG'];
      } else if (matchedSec && (query.includes('OPTION') || query.includes('VOL') || query.includes('GREEK') || query.includes('STRADDLE'))) {
        const S = matchedSec.price;
        if (!Number.isFinite(S) || S <= 0) {
          botResponse = `[QUANT DERIVATIVES // ${matchedSec.ticker} ATM 30D]\n• No valid spot price available for ${matchedSec.ticker} — open OPTS once the quote feed resumes.`;
          replyTickers = [matchedSec.ticker];
          replyFunctions = ['OPTS', 'GP'];
        } else {
        const K = Math.round(S);
        const bs = calculateBlackScholes(S, K, 30 / 365, 0.32, 0.0388, (matchedSec.divYield ?? 0) / 100);
        const sym = matchedSec.currency === 'INR' ? '₹' : '$';
        botResponse = `[QUANT DERIVATIVES // ${matchedSec.ticker} ATM 30D · model theo, vols simulated]
• S=${sym}${S.toFixed(2)} K=${sym}${K.toFixed(2)} σ=32% r=3.88% q=${((matchedSec.divYield ?? 0)).toFixed(2)}%
• Call ${sym}${bs.callPrice.toFixed(2)} Δ${bs.callDelta.toFixed(2)} · Put ${sym}${bs.putPrice.toFixed(2)} Δ${bs.putDelta.toFixed(2)} · Γ${bs.gamma.toFixed(4)} · Vega ${sym}${bs.vega.toFixed(2)}/1% · Θ ${sym}${bs.callTheta.toFixed(2)}/${sym}${bs.putTheta.toFixed(2)}/day
• Straddle theo ≈ ${sym}${(bs.callPrice + bs.putPrice).toFixed(2)} (${(((bs.callPrice + bs.putPrice) / S) * 100).toFixed(1)}% of spot). Chain OI/vol are simulated — use OPTS solver with a broker quote for tradable IV.`;
        replyTickers = [matchedSec.ticker];
        replyFunctions = ['OPTS', 'GP'];
        }
      } else if (matchedSec) {
        const sym = matchedSec.currency === 'INR' ? '₹' : '$';
        const safePrice = Number.isFinite(matchedSec.price) ? matchedSec.price : NaN;
        const upside =
          matchedSec.targetPrice > 0 && safePrice > 0
            ? (((matchedSec.targetPrice - safePrice) / safePrice) * 100).toFixed(1)
            : null;
        const volFlag = matchedSec.avgVolume > 0 ? ` · Vol ${(Number.isFinite(matchedSec.volume) ? matchedSec.volume : 0).toLocaleString()} vs avg ${(matchedSec.avgVolume).toLocaleString()}` : '';
        const priceStr = Number.isFinite(safePrice) ? `${sym}${safePrice.toFixed(2)}` : 'N/A';
        const chgStr = Number.isFinite(matchedSec.change) ? `${matchedSec.change >= 0 ? '+' : ''}${matchedSec.change.toFixed(2)}` : 'N/A';
        const pctDetail = Number.isFinite(matchedSec.changePercent) ? ` ${matchedSec.changePercent >= 0 ? '+' : ''}${matchedSec.changePercent.toFixed(2)}%` : '';
        const low52 = Number.isFinite(matchedSec.fiftyTwoWeekLow) ? `${sym}${matchedSec.fiftyTwoWeekLow.toFixed(2)}` : 'N/A';
        const high52 = Number.isFinite(matchedSec.fiftyTwoWeekHigh) ? `${sym}${matchedSec.fiftyTwoWeekHigh.toFixed(2)}` : 'N/A';
        const bidStr = Number.isFinite(matchedSec.bid) ? `${sym}${matchedSec.bid.toFixed(2)}` : 'N/A';
        const askStr = Number.isFinite(matchedSec.ask) ? `${sym}${matchedSec.ask.toFixed(2)}` : 'N/A';
        botResponse = `[ALPHA NOVA // ${matchedSec.ticker} ${matchedSec.exchange} : ${matchedSec.assetClass} · ${src} ${stamp}]
• Market Quote: ${priceStr} (${chgStr} /${pctDetail})${volFlag}
• 52-Week: ${low52} - ${high52} (${rangePos(matchedSec)}) | Bid/Ask ${bidStr}/${askStr}
• Valuation & Risk: P/E ${matchedSec.peRatio ? matchedSec.peRatio.toFixed(2) + 'x' : 'N/A'} | Fwd P/E ${matchedSec.fwdPe?.toFixed(1) ?? 'N/A'} | EPS ${matchedSec.eps ? sym + matchedSec.eps.toFixed(2) : 'N/A'} | Beta ${matchedSec.beta ? matchedSec.beta.toFixed(2) : 'N/A'} | Div ${matchedSec.divYield ? matchedSec.divYield.toFixed(2) + '%' : 'N/A'}
• Wall Street Consensus: ${(matchedSec.consensusRating ?? 'HOLD').replace('_', ' ')} (${matchedSec.analystCount} analysts)${upside !== null ? ` | 12M Target ${sym}${matchedSec.targetPrice.toFixed(2)} (${upside}% implied)` : ''}
• Educational only, not investment advice.`;
        replyTickers = [matchedSec.ticker];
        replyFunctions = ['GP', 'DES', 'FA', 'ANR'];
      } else if (query.includes('CURVE') || query.includes('YIELD') || query.includes('YCRV') || query.includes('RATES') || query.includes('SPREAD') || query.includes('2Y')) {
        const y = (t: string): number => US_TREASURY_YIELD_CURVE.find((p) => p.tenor === t)?.yield ?? NaN;
        const y2 = y('2Y');
        const y10 = y('10Y');
        const y30 = y('30Y');
        const spread210 = (y10 - y2) * 100;
        const spread1030 = (y30 - y10) * 100;
        const p2 = US_TREASURY_YIELD_CURVE.find((p) => p.tenor === '2Y');
        const p10 = US_TREASURY_YIELD_CURVE.find((p) => p.tenor === '10Y');
        botResponse = `[ALPHA NOVA FIXED INCOME // YCRV snapshot in app]
• 2Y ${y2.toFixed(2)}% / 10Y ${y10.toFixed(2)}% / 30Y ${y30.toFixed(2)}%
• 2s10s ${spread210 >= 0 ? '+' : ''}${spread210.toFixed(0)} bps (1M prior ${p2 && p10 ? (((p10.priorMonthYield - p2.priorMonthYield) * 100 >= 0 ? '+' : '') + ((p10.priorMonthYield - p2.priorMonthYield) * 100).toFixed(0) + ' bps') : 'N/A'}) · 10s30s ${spread1030 >= 0 ? '+' : ''}${spread1030.toFixed(0)} bps
• Curve data is a static snapshot — check YCRV panel timestamps before trading. Steepener/flattener sizing needs DV01 from the live curve.`;
        replyFunctions = ['YCRV'];
      } else if (query.includes('OPTION') || query.includes('VOL') || query.includes('BLACK') || query.includes('GREEK') || query.includes('VIX') || query.includes('GAMMA')) {
        botResponse = `[QUANT DERIVATIVES // BLACK-SCHOLES · vols simulated]
• No live VIX feed in this terminal — do not quote VIX levels here. Use OPTS with explicit σ, r, q inputs.
• ATM 30D example uses σ=32% placeholder; replace with broker IV via the OPTS IV solver (paste a market price → implied σ).
• American exercise premium is computed by CRR binomial (200 steps) in OPTS; European theo shows put-call parity deviation for input checks.`;
        replyFunctions = ['OPTS'];
      } else if (query.includes('MOVER') || query.includes('MOST') || query.includes('TOP') || query.includes('Gainer') || query.includes('LOSER') || query.includes('SCREENER')) {
        const ranked = [...allSecs].sort((a, b) => (Number.isFinite(b.changePercent) ? b.changePercent : -Infinity) - (Number.isFinite(a.changePercent) ? a.changePercent : -Infinity));
        const top = ranked.slice(0, 3).map((s) => `${s.ticker} ${pctStr(s.changePercent)}`).join(' · ');
        const bot = ranked.slice(-3).reverse().map((s) => `${s.ticker} ${pctStr(s.changePercent)}`).join(' · ');
        botResponse = `[MOST // LIVE RANKED FROM ENGINE ${stamp}]
• Gainers: ${top}
• Losers: ${bot}
• Source: ${src}. Open MOST for the full board.`;
        replyTickers = ranked.slice(0, 3).map((s) => s.ticker);
        replyFunctions = ['MOST', 'SIG', 'GP'];
      } else if (query.includes('INDIA') || query.includes('NIFTY') || query.includes('SENSEX')) {
        const nifty = marketEngine.getSecurity('NIFTY50');
        const nseNames = allSecs.filter((s) => s.exchange === 'NSE' && s.assetClass === 'EQUITY');
        const leaders = [...nseNames].sort((a, b) => (Number.isFinite(b.changePercent) ? b.changePercent : -Infinity) - (Number.isFinite(a.changePercent) ? a.changePercent : -Infinity)).slice(0, 5).map((s) => `${s.ticker} ${pctStr(s.changePercent)}`).join(' · ');
        const niftyStr = nifty && Number.isFinite(nifty.price) && Number.isFinite(nifty.changePercent)
          ? `₹${nifty.price.toFixed(2)} (${nifty.changePercent >= 0 ? '+' : ''}${nifty.changePercent.toFixed(2)}%)`
          : 'snapshot only';
        botResponse = `[ALPHA NOVA MACRO // INDIA · ${src} ${stamp}]
• NIFTY 50 ${niftyStr}
• Day leaders: ${leaders}
• SIP/FPI flow commentary needs a fund-flows feed — not in this terminal. Verify flows before citing.`;
        replyTickers = ['NIFTY50', 'RELIANCE', 'HDFCBANK', 'INFY', 'ICICIBANK'].filter((t) => marketEngine.getSecurity(t));
        replyFunctions = ['WEI', 'MOST'];
      } else if (query.includes('PORT') || query.includes('RISK') || query.includes('VAR') || query.includes('SHARPE') || query.includes('HEDGE') || query.includes('BETA')) {
        botResponse = `[PORT RISK // HOW THIS TERMINAL COMPUTES IT]
• PORT uses a covariance-block model (ρ=0.45, vols by asset class: EQ 28%, IDX 18%, CMD 24%, CRYPTO 70%) blended with sparkline histories: parametric VaR = 1.645·σ_daily·NAV, plus historical VaR/CVaR when ≥12 blended daily returns exist.
• Sharpe/Sortino annualised vs 3.88% rf; beta needs a benchmark return series (else N/A — never hardcoded).
• Open PORT for VaR 95/99, vol, MDD, HHI concentration and per-name risk contribution.`;
        replyFunctions = ['PORT', 'GP'];
      } else {
        botResponse = `[QUANT RESPONSE // ${stamp}]
• I can answer from live engine data: "<TICKER> quote", "NVDA vs AAPL", "top movers", "2Y10Y spread", "NIFTY leaders", "PORT VaR method", "<TICKER> options ATM".
• Sources: ${src}. Options chain vols/OI are simulated; fundamentals via Yahoo/NSE XBRL where mapped.
• Try: "NVDA vs MSFT", "top movers", "2Y10Y spread", "RELIANCE options".`;
        replyFunctions = ['GP', 'DES', 'MOST', 'SIG', 'HELP'];
      }

      const reply: QuantMessage = {
        id: `m-bot-${Date.now()}`,
        sender: 'QUANT_COPILOT',
        text: botResponse,
        timestamp: new Date().toLocaleTimeString('en-GB', { timeZone: 'UTC', hour12: false }) + ' UTC',
        // Only offer chips the terminal can actually resolve, so a click never
        // silently does nothing.
        tickers: replyTickers.filter((t) => marketEngine.getSecurity(t)),
        functions: replyFunctions,
      };

      setMessages((prev) => [...prev, reply]);
      setIsTyping(false);
      audioService.playAlert();
    }, 600);
  };

  const samplePrompts = [
    'NVDA vs MSFT compare',
    'Top movers today',
    'US 2Y10Y spread',
    'RELIANCE options ATM',
  ];

  return (
    <div className="h-full w-full bg-[#080d16] text-zinc-300 font-mono text-xs flex flex-col select-none">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 bg-[#0c1322] border-b border-[#1b253b] shrink-0">
        <div className="flex items-center space-x-2">
          <MessageSquare className="w-4 h-4 text-amber-400" />
          <span className="font-bold text-amber-400 tracking-wider">
            INSTANT ALPHA NOVA (IB) // QUANT DESK
          </span>
        </div>
        <span className="flex items-center gap-1.5 text-[10px] text-emerald-400 font-bold bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/30">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" /> COPILOT ONLINE
        </span>
      </div>

      {/* Quick Prompts */}
      <div className="flex items-center space-x-1 px-3 py-1.5 bg-[#0a0f1b] border-b border-[#162033] overflow-x-auto scrollbar-none text-[10px]">
        <span className="text-zinc-500 shrink-0 font-bold">QUICK QUERIES:</span>
        {samplePrompts.map((p) => (
          <button
            key={p}
            onClick={() => {
              audioService.playKeyClick();
              setInputText(p);
            }}
            className="px-2 py-0.5 rounded bg-[#121929] border border-zinc-800 hover:border-amber-500/50 hover:text-amber-300 text-zinc-400 whitespace-nowrap transition-colors"
          >
            {p}
          </button>
        ))}
      </div>

      {/* Messages Scroll Area */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-3 space-y-3">
        {messages.map((m) => {
          const isUser = m.sender === 'TRADER';
          const isSystem = m.sender === 'SYSTEM';

          if (isSystem) {
            return (
              <div
                key={m.id}
                className="text-[10px] text-zinc-500 text-center py-1 border-y border-[#182338] bg-[#0c121f]"
              >
                {m.text}
              </div>
            );
          }

          return (
            <div
              key={m.id}
              className={`flex flex-col space-y-1 ${isUser ? 'items-end' : 'items-start'}`}
            >
              <div className="flex items-center space-x-1.5 text-[10px] text-zinc-500">
                {isUser ? (
                  <>
                    <span>TRADER DESK</span>
                    <span>•</span>
                    <span>{m.timestamp}</span>
                  </>
                ) : (
                  <>
                    <span className="text-amber-400 font-bold">ALPHA COPILOT</span>
                    <span>•</span>
                    <span>{m.timestamp}</span>
                  </>
                )}
              </div>

              <div
                className={`max-w-[85%] rounded-lg p-3 text-[11px] leading-relaxed whitespace-pre-line border ${
                  isUser
                    ? 'bg-[#18233a] border-[#293b61] text-amber-200'
                    : 'bg-[#0e1524] border-[#1c273e] text-zinc-200'
                }`}
              >
                {m.text}
              </div>

              {/* Clickable follow-ups: the copilot's cited tickers and function
                  codes, wired to the terminal's actual navigation callbacks. */}
              {((m.tickers && m.tickers.length > 0) || (m.functions && m.functions.length > 0)) && (
                <div className="flex flex-wrap items-center gap-1 max-w-[85%] pl-1 pt-0.5">
                  {m.tickers?.map((t) => (
                    <button
                      key={`${m.id}-t-${t}`}
                      onClick={() => {
                        audioService.playKeyClick();
                        onSelectTicker?.(t);
                      }}
                      className="px-1.5 py-0.5 rounded bg-[#121929] border border-amber-500/30 text-amber-300 hover:bg-amber-500/20 text-[10px] font-bold transition-colors"
                      title={`Load ${t} across the terminal`}
                    >
                      {t}
                    </button>
                  ))}
                  {m.functions?.map((f) => (
                    <button
                      key={`${m.id}-f-${f}`}
                      onClick={() => {
                        audioService.playKeyClick();
                        onSelectFunction?.(f);
                      }}
                      className="px-1.5 py-0.5 rounded bg-[#121929] border border-cyan-500/30 text-cyan-300 hover:bg-cyan-500/20 text-[10px] font-bold transition-colors"
                      title={`Open the ${f} function`}
                    >
                      {f} &lt;GO&gt;
                    </button>
                  ))}
                </div>
              )}
            </div>
          );
        })}

        {isTyping && (
          <div className="flex items-center space-x-2 text-[10px] text-amber-400 bg-[#0e1524] p-2 rounded w-48 border border-[#1c273e]">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-ping" />
            <span>QUANT MODEL COMPUTING...</span>
          </div>
        )}
      </div>

      {/* Chat Input Bar */}
      <form
        onSubmit={handleSend}
        className="p-2.5 bg-[#0b101c] border-t border-[#182338] flex items-center space-x-2 shrink-0"
      >
        <label htmlFor="ib-input" className="sr-only">Ask Quant Copilot</label>
        <input
          id="ib-input"
          type="text"
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          placeholder="Ask Quant Copilot about tickers, options pricing, macro indicators..."
          aria-label="Ask Quant Copilot about tickers, options pricing, macro indicators"
          className="flex-1 bg-[#101726] border border-[#202c44] px-3 py-1.5 rounded text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-amber-400 font-mono"
        />
        <button
          type="submit"
          className="bg-amber-500 hover:bg-amber-400 text-black px-3 py-1.5 rounded font-bold text-xs flex items-center gap-1 transition-colors"
        >
          <Send className="w-3.5 h-3.5" />
          <span>SEND</span>
        </button>
      </form>
    </div>
  );
};
