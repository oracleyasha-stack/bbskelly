import React, { useState, useEffect, useMemo, useRef } from 'react';
import type { FunctionCode, LayoutMode, Security, TerminalTheme } from '../../types/terminal';
import { FUNCTION_CODES } from '../../types/terminal';
import { AVAILABLE_FUNCTIONS } from '../../data/functions';
import { INITIAL_SECURITIES } from '../../data/securities';
import { marketEngine } from '../../services/marketEngine';
import { audioService } from '../../services/audioService';
import {
  Volume2,
  VolumeX,
  LayoutGrid,
  Square,
  Columns,
  Rows,
  Terminal,
  Search,
  Clock,
  Wifi,
} from 'lucide-react';

interface TerminalHeaderProps {
  currentTicker: string;
  currentFunction: FunctionCode;
  layoutMode: LayoutMode;
  theme: TerminalTheme;
  onExecuteCommand: (command: string) => void;
  onChangeLayout: (mode: LayoutMode) => void;
  onChangeTheme: (theme: TerminalTheme) => void;
  onToggleSound: () => void;
  soundEnabled: boolean;
}

export const TerminalHeader: React.FC<TerminalHeaderProps> = ({
  currentTicker,
  currentFunction,
  layoutMode,
  theme,
  onExecuteCommand,
  onChangeLayout,
  onChangeTheme,
  onToggleSound,
  soundEnabled,
}) => {
  const getAlphaNovaCommand = (ticker: string, func: FunctionCode): string => {
    const sec = marketEngine.getSecurity(ticker);
    if (!sec) return `${ticker} US <EQUITY> ${func}`;
    if (sec.exchange === 'NSE' || sec.currency === 'INR') return `${sec.ticker} IN <EQUITY> ${func}`;
    if (sec.assetClass === 'INDEX') return `${sec.ticker} <INDEX> ${func}`;
    if (sec.assetClass === 'CRYPTO') return `${sec.ticker} <CRYPTO> ${func}`;
    if (sec.assetClass === 'CURR') return `${sec.ticker} <CURR> ${func}`;
    if (sec.assetClass === 'CMDTY') return `${sec.ticker} <CMDTY> ${func}`;
    if (sec.assetClass === 'GOVT') return `${sec.ticker} <GOVT> ${func}`;
    return `${sec.ticker} US <EQUITY> ${func}`;
  };

  const [commandInput, setCommandInput] = useState(() => getAlphaNovaCommand(currentTicker, currentFunction));
  const [isFocused, setIsFocused] = useState(false);
  const [dismissSuggestions, setDismissSuggestions] = useState(false);
  const [activeSuggestion, setActiveSuggestion] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const [time, setTime] = useState<{ utc: string; nyc: string; lon: string; bom: string }>({
    utc: '',
    nyc: '',
    lon: '',
    bom: '',
  });

  // Keep command input synced when ticker/function changes from outside
  useEffect(() => {
    setCommandInput(getAlphaNovaCommand(currentTicker, currentFunction));
  }, [currentTicker, currentFunction]);

  // Live multi-session financial market clocks
  useEffect(() => {
    const updateClocks = () => {
      const now = new Date();
      setTime({
        utc: now.toLocaleTimeString('en-GB', { timeZone: 'UTC', hour12: false }),
        nyc: now.toLocaleTimeString('en-US', { timeZone: 'America/New_York', hour12: false }),
        lon: now.toLocaleTimeString('en-GB', { timeZone: 'Europe/London', hour12: false }),
        bom: now.toLocaleTimeString('en-GB', { timeZone: 'Asia/Kolkata', hour12: false }),
      });
    };
    updateClocks();
    const interval = setInterval(updateClocks, 1000);
    return () => clearInterval(interval);
  }, []);

  // --- Ticker autocomplete: match the first command token against known securities ---
  const firstToken = commandInput.trim().split(/\s+/)[0] ?? '';

  // Alpha Nova function codes must win over ticker suggestions: "PORT" also matches the
  // ticker/name of ADANIPORTS, but <GO> on "PORT" has to run the Portfolio function.
  const tokenIsFunctionCode = FUNCTION_CODES.includes(firstToken.toUpperCase() as FunctionCode);
  const exactFunctionInput = FUNCTION_CODES.includes(commandInput.trim().toUpperCase() as FunctionCode);

  // Function-code queries start with no highlighted row (index -1) so a bare Enter
  // executes the command itself; ticker queries keep the usual top-match highlight.
  useEffect(() => {
    setActiveSuggestion(tokenIsFunctionCode ? -1 : 0);
  }, [firstToken, tokenIsFunctionCode]);

  // Alpha Nova tickers may contain '.' and '-' (BTC/USD, BRK-B) and the Indian
  // universe includes '&' (M&M.NS), so the token shape check allows them too.
  const suggestions = useMemo(() => {
    const token = firstToken.toUpperCase();
    if (dismissSuggestions || token.length === 0 || !/^[A-Z0-9/&.-]+$/.test(token)) return [];
    const query = commandInput.trim().toLowerCase();
    const functionMatches = query.length >= 2 ? AVAILABLE_FUNCTIONS.filter(f =>
      f.label.toLowerCase().includes(query) || (f.code === 'FA' && ['financials', 'financial analysis'].some(alias => alias.startsWith(query)))
    ) : [];
    const securities = INITIAL_SECURITIES.filter(
      (s) =>
        s.ticker.toUpperCase().startsWith(token) ||
        (!tokenIsFunctionCode && s.name.toUpperCase().includes(token))
    )
      .sort((a, b) => {
        // Rank exact ticker matches first, then ticker prefix matches,
        // then name matches — so typing "TCS" keeps "TCS" at the top
        // instead of making the dropdown disappear.
        const aT = a.ticker.toUpperCase();
        const bT = b.ticker.toUpperCase();
        const rank = (t: string) => (t === token ? 0 : t.startsWith(token) ? 1 : 2);
        const r = rank(aT) - rank(bT);
        if (r !== 0) return r;
        return aT.localeCompare(bT);
      })
      .slice(0, 12);
    const exact = securities.filter(s => s.ticker.toUpperCase() === token);
    return [...exact, ...functionMatches, ...securities.filter(s => s.ticker.toUpperCase() !== token)].slice(0, 12);
  }, [commandInput, firstToken, dismissSuggestions, tokenIsFunctionCode]);

  /**
   * True when the first token is already an exact ticker. In that case the user
   * has fully qualified their command, so Enter must run it verbatim instead of
   * hijacking to suggestion #0. Without this, "GOLD DES" was rewritten to
   * "GS <fn>": "GOLD" also appears inside the name "The Goldman Sachs Group",
   * so GS sat at index 0 and swallowed the function the user had typed.
   */
  const firstTokenIsExactTicker = useMemo(
    () => INITIAL_SECURITIES.some((s) => s.ticker.toUpperCase() === firstToken.toUpperCase()),
    [firstToken]
  );

  const showSuggestions = isFocused && suggestions.length > 0;

  // Keep the active suggestion visible while arrowing through the list.
  useEffect(() => {
    if (!showSuggestions || activeSuggestion < 0) return;
    document.getElementById(`ticker-option-${activeSuggestion}`)?.scrollIntoView({ block: 'nearest' });
  }, [activeSuggestion, showSuggestions]);

  /**
   * Replaces only the first token of the command, preserving everything the
   * user typed after it. Picking "GS" from the "GOL" autocomplete of "GOL DES"
   * used to execute "GS GP", silently dropping the requested DES.
   */
  const selectSuggestion = (sec: Security | typeof AVAILABLE_FUNCTIONS[number]) => {
    audioService.playExecuteThud();
    setDismissSuggestions(true);
    const rest = commandInput.trim().split(/\s+/).slice(1).join(' ');
    const next = 'code' in sec ? sec.code : rest ? `${sec.ticker} ${rest}` : `${sec.ticker} ${currentFunction}`;
    setCommandInput(next);
    onExecuteCommand(next);
    inputRef.current?.focus();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (showSuggestions) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        audioService.playKeyClick();
        setActiveSuggestion((i) => (i + 1 >= suggestions.length ? 0 : i + 1));
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        audioService.playKeyClick();
        setActiveSuggestion((i) => (i - 1 < 0 ? suggestions.length - 1 : i - 1));
        return;
      }
      // Enter hijacks to the highlighted suggestion only when the user still
      // needs to disambiguate. An exact ticker (or a bare function code) means
      // they typed a complete command, so run it as written.
      if (
        e.key === 'Enter' &&
        !exactFunctionInput &&
        !firstTokenIsExactTicker &&
        activeSuggestion >= 0 &&
        activeSuggestion < suggestions.length
      ) {
        e.preventDefault();
        selectSuggestion(suggestions[activeSuggestion]);
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        setDismissSuggestions(true);
        return;
      }
    }

    // Click sound only for actionable keys: typing, Enter, navigation.
    // Modifier-only presses (Shift, Ctrl, Alt, Meta) must stay silent.
    if (e.key.length === 1 || e.key === 'Enter' || e.key === 'Backspace' || e.key === 'Delete') {
      audioService.playKeyClick();
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      audioService.playExecuteThud();
      setDismissSuggestions(true);
      onExecuteCommand(commandInput.trim());
    } else if (e.key === 'Escape') {
      // Escape only dismisses the autocomplete — never wipes the command line.
      // (The App-level handler dismisses the error toast.) Wiping here destroyed
      // a fully typed command when the user only meant to clear the toast.
      setDismissSuggestions(true);
      inputRef.current?.blur();
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    audioService.playExecuteThud();
    const match = suggestions[activeSuggestion];
    if (match && 'code' in match && !exactFunctionInput && !firstTokenIsExactTicker) {
      selectSuggestion(match);
    } else {
      onExecuteCommand(commandInput.trim());
    }
  };

  return (
    <header className="relative z-50 bg-[#0b0f19] border-b border-[#2b3a58] select-none text-zinc-300">
      {/* Top Bar: Brand, Data Refresh, Session Clocks, Theme & Layout Controls */}
      <div className="flex flex-wrap items-center justify-between gap-y-1 px-2 py-1 border-b border-[#202c46] text-[11px] font-mono md:flex-nowrap">
        {/* Logo and Status */}
        <div className="flex items-center space-x-3">
          <div className="flex items-center space-x-1.5">
            <span className="inline-block w-2.5 h-2.5 rounded-full bg-amber-500" />
            <span className="font-extrabold tracking-wider text-amber-400 text-sm flex items-center gap-1.5">
              <Terminal className="w-4 h-4 text-amber-500" />
              ALPHA NOVA <span className="text-zinc-400 font-semibold">TERMINAL</span>
              <span className="text-[9px] bg-amber-500/20 text-amber-300 px-1.5 py-0.5 rounded font-mono border border-amber-500/30">
                PRO 2026
              </span>
            </span>
          </div>

          <div className="hidden lg:flex items-center space-x-2 text-[10px] text-zinc-500 border-l border-zinc-800 pl-3">
            <span className="flex items-center gap-1 text-amber-300 font-medium">
              <Wifi className="w-3 h-3 text-amber-400" /> QUOTE POLL: 30s
            </span>
            <span className="text-zinc-600">|</span>
            <span>SOURCE: YAHOO FINANCE</span>
          </div>
        </div>

        {/* Global Financial Centers Clocks */}
        <div className="hidden md:flex items-center space-x-3 text-[10px] font-mono">
          <div className="flex items-center gap-1 text-zinc-400">
            <Clock className="w-3 h-3 text-amber-400" />
            <span>UTC:</span>
            <span className="text-zinc-200 font-semibold">{time.utc}</span>
          </div>
          <div className="flex items-center gap-1">
            <span className="text-zinc-500">NYC:</span>
            <span className="text-emerald-300 font-semibold">{time.nyc}</span>
          </div>
          <div className="flex items-center gap-1">
            <span className="text-zinc-500">LON:</span>
            <span className="text-cyan-300 font-semibold">{time.lon}</span>
          </div>
          <div className="flex items-center gap-1">
            <span className="text-zinc-500">BOM:</span>
            <span className="text-amber-300 font-semibold">{time.bom}</span>
          </div>
        </div>

        {/* Controls: Audio, Theme, Layout */}
        <div className="flex w-full items-center justify-end space-x-2 md:w-auto">
          {/* Sound Toggle */}
          <button
            onClick={onToggleSound}
            aria-label={soundEnabled ? 'Mute terminal audio' : 'Enable terminal audio'}
            title={soundEnabled ? 'Terminal Audio FX: ON' : 'Terminal Audio FX: MUTED'}
            className={`p-1.5 rounded border transition-colors min-h-[28px] min-w-[28px] flex items-center justify-center focus-visible:outline-2 focus-visible:outline-amber-400 ${
              soundEnabled
                ? 'border-amber-500/50 bg-amber-500/10 text-amber-400'
                : 'border-zinc-800 bg-zinc-900/60 text-zinc-500 hover:text-zinc-400'
            }`}
          >
            {soundEnabled ? <Volume2 className="w-3.5 h-3.5" aria-hidden="true" /> : <VolumeX className="w-3.5 h-3.5" aria-hidden="true" />}
          </button>

          {/* Theme Selector */}
          <select
            value={theme}
            onChange={(e) => onChangeTheme(e.target.value as TerminalTheme)}
            aria-label="Terminal theme"
            className="bg-[#121824] border border-[#232d42] text-[10px] text-amber-400 px-2 py-1 rounded cursor-pointer hover:border-amber-500/50 focus-visible:outline-2 focus-visible:outline-amber-400 min-h-[28px]"
          >
            <option value="modern">Modern Obsidian</option>
            <option value="classic-amber">Classic Amber CRT</option>
            <option value="bloomberg-green">Alpha Emerald</option>
            <option value="neon-cyan">Electric Cyan</option>
          </select>

          {/* Layout Mode Controls */}
          <div role="group" aria-label="Workspace layout" className="hidden md:flex items-center border border-[#232d42] rounded bg-[#121824] p-0.5 space-x-0.5">
            <button
              onClick={() => onChangeLayout('single')}
              aria-label="Single full screen"
              aria-pressed={layoutMode === 'single'}
              title="Single Full Screen"
              className={`p-1.5 rounded min-h-[28px] min-w-[28px] flex items-center justify-center focus-visible:outline-2 focus-visible:outline-amber-400 ${
                layoutMode === 'single'
                  ? 'bg-amber-500 text-black font-bold'
                  : 'text-zinc-400 hover:text-white'
              }`}
            >
              <Square className="w-3 h-3" aria-hidden="true" />
            </button>
            <button
              onClick={() => onChangeLayout('split-h')}
              aria-label="Split horizontal"
              aria-pressed={layoutMode === 'split-h'}
              title="Split Horizontal (2-Screen)"
              className={`p-1.5 rounded min-h-[28px] min-w-[28px] flex items-center justify-center focus-visible:outline-2 focus-visible:outline-amber-400 ${
                layoutMode === 'split-h'
                  ? 'bg-amber-500 text-black font-bold'
                  : 'text-zinc-400 hover:text-white'
              }`}
            >
              <Columns className="w-3 h-3" aria-hidden="true" />
            </button>
            <button
              onClick={() => onChangeLayout('split-v')}
              aria-label="Split vertical"
              aria-pressed={layoutMode === 'split-v'}
              title="Split Vertical (2-Screen)"
              className={`p-1.5 rounded min-h-[28px] min-w-[28px] flex items-center justify-center focus-visible:outline-2 focus-visible:outline-amber-400 ${
                layoutMode === 'split-v'
                  ? 'bg-amber-500 text-black font-bold'
                  : 'text-zinc-400 hover:text-white'
              }`}
            >
              <Rows className="w-3 h-3" aria-hidden="true" />
            </button>
            <button
              onClick={() => onChangeLayout('quadrant')}
              aria-label="Four quadrant workspace"
              aria-pressed={layoutMode === 'quadrant'}
              title="4-Quadrant Trading Workstation"
              className={`p-1.5 rounded min-h-[28px] min-w-[28px] flex items-center justify-center focus-visible:outline-2 focus-visible:outline-amber-400 ${
                layoutMode === 'quadrant'
                  ? 'bg-amber-500 text-black font-bold'
                  : 'text-zinc-400 hover:text-white'
              }`}
            >
              <LayoutGrid className="w-3 h-3" aria-hidden="true" />
            </button>
          </div>
        </div>
      </div>

      {/* Main Alpha Nova Command Bar */}
      <div className="px-2 py-1 flex items-center space-x-2 bg-[#080c14]">
        <div className="flex items-center space-x-1 text-amber-500 font-bold text-xs uppercase shrink-0">
          <span className="text-zinc-500 font-normal">CMD:</span>
          <span className="bg-amber-500/20 text-amber-300 px-1.5 py-0.5 rounded border border-amber-500/40 text-[11px]">
            {currentTicker}
          </span>
          <span className="text-zinc-600">|</span>
          <span className="text-cyan-400 text-[11px]">{currentFunction}</span>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 min-w-0 relative flex items-center">
          <div
            className={`w-full flex items-center rounded bg-[#101726] border transition-all duration-200 ${
              isFocused
                ? 'border-amber-400 shadow-[0_0_12px_rgba(255,153,0,0.25)] ring-1 ring-amber-400/40'
                : 'border-[#1f293d] hover:border-zinc-700'
            }`}
          >
            <div className="pl-3 pr-1 text-amber-500/70">
              <Search className="w-3.5 h-3.5" />
            </div>

            <input
              ref={inputRef}
              type="text"
              role="combobox"
              aria-label="Alpha Nova command line"
              aria-expanded={showSuggestions}
              aria-controls="ticker-suggestions"
              aria-activedescendant={showSuggestions && activeSuggestion >= 0 ? `ticker-option-${activeSuggestion}` : undefined}
              value={commandInput}
              onChange={(e) => {
                const next = e.target.value;
                setCommandInput(next);
                setDismissSuggestions(false);
                // Keep function-code inputs at -1 (no highlight) so a fast
                // Enter can't hijack to suggestion #0 before the effect runs.
                const tok = next.trim().split(/\s+/)[0] ?? '';
                setActiveSuggestion(FUNCTION_CODES.includes(tok.toUpperCase() as FunctionCode) ? -1 : 0);
              }}
              onFocus={() => {
                setIsFocused(true);
                setDismissSuggestions(false);
                setActiveSuggestion(tokenIsFunctionCode ? -1 : 0);
              }}
              onBlur={() => {
                // Delay close so option mousedown/click wins the race.
                // (Options already preventDefault on mousedown; this covers
                // keyboard + touch blur paths.)
                window.setTimeout(() => setIsFocused(false), 120);
              }}
              onKeyDown={handleKeyDown}
              placeholder="Search a ticker or function, e.g. NVIDIA, financials, or NVDA GP"
              className="w-full bg-transparent px-2 py-1.5 text-xs text-amber-300 font-mono tracking-wide placeholder-zinc-600 focus:outline-none uppercase"
              autoComplete="off"
              spellCheck="false"
            />

            <div className="pr-2 flex items-center space-x-1 shrink-0">
              <button
                type="submit"
                className="bg-amber-500 hover:bg-amber-400 text-black px-2.5 py-1 rounded text-[11px] font-bold tracking-wider transition-colors shadow-sm flex items-center gap-1 active:scale-95"
              >
                <span>&lt;GO&gt;</span>
              </button>
            </div>
          </div>

          {/* Ticker Autocomplete Dropdown */}
          {showSuggestions && (
            <div
              id="ticker-suggestions"
              role="listbox"
              aria-label="Securities and functions"
              className="absolute left-0 right-0 top-full mt-1 z-50 bg-[#0d1420] border border-[#2b3a58] rounded shadow-[0_16px_40px_rgba(0,0,0,0.75)] overflow-hidden flex flex-col max-h-[60vh]"
            >
              <div className="flex-1 min-h-0 overflow-y-auto">
                {suggestions.map((suggestion, idx) => {
                  const sec = 'code' in suggestion ? suggestion : marketEngine.getSecurity(suggestion.ticker) ?? suggestion;
                  const isActive = idx === activeSuggestion;
                  return (
                    <div
                      key={'code' in sec ? 'function-' + sec.code : sec.ticker}
                      id={`ticker-option-${idx}`}
                      role="option"
                      aria-selected={isActive}
                      onMouseDown={(e) => e.preventDefault()}
                      onMouseEnter={() => setActiveSuggestion(idx)}
                      onClick={() => selectSuggestion(sec)}
                      className={`flex items-center gap-2 px-3 py-1.5 cursor-pointer border-l-2 text-[11px] transition-colors ${
                        isActive ? 'bg-amber-500/15 border-amber-400' : 'border-transparent hover:bg-[#131c2e]'
                      }`}
                    >
                      {'code' in sec ? (
                        <><strong className="text-amber-300">{sec.code}</strong><span>{sec.label.split(': ')[1]}</span></>
                      ) : (<>
                      <span
                        className={`w-28 shrink-0 truncate font-bold ${
                          isActive ? 'text-amber-300' : 'text-amber-400'
                        }`}
                      >
                        {sec.ticker}
                      </span>
                      <span className="flex-1 truncate text-zinc-300">{sec.name}</span>
                      <span className="shrink-0 text-zinc-500">{sec.exchange}</span>
                      <span className="shrink-0 text-zinc-500 tabular-nums">
                        {Number.isFinite(sec.price) ? sec.price.toFixed(2) : 'N/A'}
                      </span>
                      <span
                        className={`shrink-0 w-14 text-right font-semibold ${
                          Number.isFinite(sec.changePercent) && sec.changePercent >= 0 ? 'text-emerald-400' : 'text-rose-400'
                        }`}
                      >
                        {Number.isFinite(sec.changePercent) ? `${sec.changePercent >= 0 ? '+' : ''}${sec.changePercent.toFixed(2)}%` : 'N/A'}
                      </span>
                      <span className="shrink-0 px-1 rounded border border-[#2b3a58] text-cyan-400 text-[10px]">
                        {sec.assetClass}
                      </span>
                      </>)}
                    </div>
                  );
                })}
              </div>
              <div className="shrink-0 px-3 py-1 text-[9px] tracking-wider text-zinc-600 bg-[#0a0f19] border-t border-[#1c2740]">
                ↑/↓ NAVIGATE · ENTER SELECT · ESC CLOSE · {suggestions.length} MATCH
                {suggestions.length === 12 ? ' (TYPE MORE TO NARROW)' : ''}
              </div>
            </div>
          )}
        </form>

        {/* Quick Command Hints */}
        <div className="hidden xl:flex items-center space-x-1.5 text-[10px] text-zinc-500">
          <span className="text-zinc-600">HOT:</span>
          {['GP', 'DES', 'WEI', 'TOP', 'YCRV', 'FA', 'ANR', 'OPTS', 'PORT', 'SIG', 'IB'].map((cmd) => (
            <button
              key={cmd}
              onClick={() => {
                audioService.playKeyClick();
                onExecuteCommand(cmd);
              }}
              className="px-1.5 py-0.5 rounded bg-[#131b2c] border border-zinc-800 hover:border-amber-500/60 hover:text-amber-300 text-zinc-400 transition-colors"
            >
              {cmd}
            </button>
          ))}
        </div>
      </div>
    </header>
  );
};
