import React, { useState, useEffect, useCallback } from 'react';
import type { FunctionCode, LayoutMode, TerminalTheme, AssetClass, Security } from './types/terminal';
import { FUNCTION_CODES } from './types/terminal';
import { INITIAL_SECURITIES } from './data/securities';
import { marketEngine } from './services/marketEngine';
import { startLiveData } from './services/liveData';
import { audioService } from './services/audioService';
import { TerminalHeader } from './components/header/TerminalHeader';
import { FunctionKeysBar } from './components/header/FunctionKeysBar';
import { TickerTape } from './components/footer/TickerTape';
import { QuadrantLayout } from './components/layout/QuadrantLayout';
import { ErrorBoundary } from './components/common/ErrorBoundary';

const THEME_KEY = 'bloomberg-terminal:theme:v1';
const THEMES: TerminalTheme[] = ['modern', 'classic-amber', 'bloomberg-green', 'neon-cyan'];
const TICKER_KEY = 'bloomberg-terminal:active-ticker:v1';
const FUNCTION_KEY = 'bloomberg-terminal:active-function:v1';
const LAYOUT_MODE_KEY = 'bloomberg-terminal:layout-mode:v1';
const ASSET_CLASS_KEY = 'bloomberg-terminal:asset-class:v1';
const SOUND_KEY = 'bloomberg-terminal:sound-enabled:v1';
const LAYOUT_MODES: LayoutMode[] = ['single', 'split-h', 'split-v', 'quadrant'];
const ASSET_CLASSES: AssetClass[] = ['EQUITY', 'INDEX', 'CURR', 'CMDTY', 'GOVT', 'CRYPTO'];

const loadTheme = (): TerminalTheme => {
  try {
    const saved = window.localStorage.getItem(THEME_KEY);
    if (saved) {
      let parsed: unknown = saved;
      try {
        parsed = JSON.parse(saved);
      } catch {
        parsed = saved;
      }
      if (typeof parsed === 'string' && (THEMES as string[]).includes(parsed)) {
        return parsed as TerminalTheme;
      }
    }
  } catch {
    // Browser storage unavailable — fall through to the default.
  }
  return 'modern';
};

/** Persisted workspace prefs — each validates before accepting the stored value. */
const loadActiveTicker = (): string => {
  try {
    const saved = window.localStorage.getItem(TICKER_KEY);
    if (saved) {
      let parsed: unknown = saved;
      try {
        parsed = JSON.parse(saved);
      } catch {
        parsed = saved;
      }
      const ticker =
        typeof parsed === 'string' ? parsed.toUpperCase() : String(saved).toUpperCase();
      if (ticker && marketEngine.getSecurity(ticker)) return ticker;
    }
  } catch {
    // fall through to default
  }
  return 'NVDA';
};

const loadActiveFunction = (): FunctionCode => {
  try {
    const saved = window.localStorage.getItem(FUNCTION_KEY);
    if (saved) {
      let parsed: unknown = saved;
      try {
        parsed = JSON.parse(saved);
      } catch {
        parsed = saved;
      }
      if (typeof parsed === 'string' && FUNCTION_CODES.includes(parsed as FunctionCode)) {
        return parsed as FunctionCode;
      }
    }
  } catch {
    // fall through to default
  }
  return 'GP';
};

const loadLayoutMode = (): LayoutMode => {
  try {
    const saved = window.localStorage.getItem(LAYOUT_MODE_KEY);
    if (saved) {
      let parsed: unknown = saved;
      try {
        parsed = JSON.parse(saved);
      } catch {
        parsed = saved;
      }
      if (typeof parsed === 'string' && (LAYOUT_MODES as string[]).includes(parsed)) {
        return parsed as LayoutMode;
      }
    }
  } catch {
    // fall through to responsive default
  }
  return typeof window !== 'undefined' && window.matchMedia('(max-width: 767px)').matches
    ? 'single'
    : 'quadrant';
};

const loadAssetClass = (): AssetClass => {
  try {
    const saved = window.localStorage.getItem(ASSET_CLASS_KEY);
    if (saved) {
      let parsed: unknown = saved;
      try {
        parsed = JSON.parse(saved);
      } catch {
        parsed = saved;
      }
      if (typeof parsed === 'string' && (ASSET_CLASSES as string[]).includes(parsed)) {
        return parsed as AssetClass;
      }
    }
  } catch {
    // fall through to default
  }
  return 'EQUITY';
};

const loadSoundEnabled = (): boolean => {
  try {
    const saved = window.localStorage.getItem(SOUND_KEY);
    if (saved != null) return JSON.parse(saved) !== false;
  } catch {
    // fall through to default
  }
  return true;
};

const persist = (key: string, value: unknown) => {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Keep the terminal usable when browser storage is unavailable.
  }
};

export const App: React.FC = () => {
  const [activeTicker, setActiveTicker] = useState<string>(loadActiveTicker);
  const [activeFunction, setActiveFunction] = useState<FunctionCode>(loadActiveFunction);
  const [activeAssetClass, setActiveAssetClass] = useState<AssetClass>(loadAssetClass);
  // A four-pane terminal is useful on desktop, but makes every panel too small
  // to use on a phone. Start narrow screens in the focused view; the layout
  // controls remain available if the user wants to switch later.
  // A stored preference (if any) wins over the responsive default.
  const [layoutMode, setLayoutMode] = useState<LayoutMode>(loadLayoutMode);
  const [theme, setTheme] = useState<TerminalTheme>(loadTheme);
  const [soundEnabled, setSoundEnabled] = useState<boolean>(() => {
    const initial = loadSoundEnabled();
    // Keep the singleton in sync with the restored pref before first render.
    audioService.setEnabled(initial);
    return initial;
  });
  /**
   * Non-null when the last command matched nothing. Previously an unrecognized
   * command was swallowed silently, so a typo looked identical to a no-op.
   */
  const [commandError, setCommandError] = useState<string | null>(null);
  const errorTimer = React.useRef<number | null>(null);

  const showCommandError = useCallback((message: string) => {
    setCommandError(message);
    if (errorTimer.current !== null) window.clearTimeout(errorTimer.current);
    errorTimer.current = window.setTimeout(() => {
      setCommandError(null);
      errorTimer.current = null;
    }, 6000);
  }, []);

  // Clear the pending toast timer on unmount so a late fire can't set state
  // on an unmounted component (StrictMode/HMR remount within the 4s window).
  useEffect(() => {
    return () => {
      if (errorTimer.current !== null) {
        window.clearTimeout(errorTimer.current);
        errorTimer.current = null;
      }
    };
  }, []);

  const dismissCommandError = useCallback(() => {
    if (errorTimer.current !== null) window.clearTimeout(errorTimer.current);
    errorTimer.current = null;
    setCommandError(null);
  }, []);

  const [currentSecurity, setCurrentSecurity] = useState<Security>(
    marketEngine.getSecurity(activeTicker) || marketEngine.getSecurity('NVDA') || INITIAL_SECURITIES[0]
  );

  // Persist workspace prefs so close/reopen and TOP<->WEI hops restore the desk.
  useEffect(() => {
    persist(THEME_KEY, theme);
  }, [theme]);
  useEffect(() => {
    persist(TICKER_KEY, activeTicker);
  }, [activeTicker]);
  useEffect(() => {
    persist(FUNCTION_KEY, activeFunction);
  }, [activeFunction]);
  useEffect(() => {
    persist(LAYOUT_MODE_KEY, layoutMode);
  }, [layoutMode]);
  useEffect(() => {
    persist(ASSET_CLASS_KEY, activeAssetClass);
  }, [activeAssetClass]);
  useEffect(() => {
    persist(SOUND_KEY, soundEnabled);
    audioService.setEnabled(soundEnabled);
  }, [soundEnabled]);

  // Boot the market engine + live-data polling once for the app's lifetime. Both calls are
  // idempotent, and restarting them on every ticker change only churns the tick interval.
  // 2.5s pulse (was 1s): halves re-render/CPU wakeups; tape + charts stay lively.
  useEffect(() => {
    marketEngine.start(2500); // relaxed pulse for lower CPU + longer battery
    const stopLive = startLiveData(); // real market data via /api/market (Yahoo Finance)

    return () => {
      stopLive();
      marketEngine.stop();
    };
  }, []);

  // Keep the active security marked to market by re-subscribing when the ticker changes.
  useEffect(() => {
    const unsubscribe = marketEngine.subscribe((_tick, updatedSecurity) => {
      if (updatedSecurity.ticker === activeTicker) {
        setCurrentSecurity(updatedSecurity);
      }
    });

    return () => unsubscribe();
  }, [activeTicker]);

  // When active ticker changes, grab the latest security state
  useEffect(() => {
    const sec = marketEngine.getSecurity(activeTicker) || INITIAL_SECURITIES[0];
    setCurrentSecurity(sec);
    setActiveAssetClass(sec.assetClass);
  }, [activeTicker]);

  // Command parser (Alpha Nova syntax: <TICKER> [US] [<EQUITY>] <FUNCTION>)
  const handleExecuteCommand = useCallback(
    (commandRaw: string) => {
      if (!commandRaw) return;
      const clean = commandRaw.toUpperCase().trim();

      // Handle function codes directly (FUNCTION_CODES is the single source of truth)
      if (FUNCTION_CODES.includes(clean as FunctionCode)) {
        setActiveFunction(clean as FunctionCode);
        setCommandError(null);
        audioService.playExecuteThud();
        return;
      }

      // Tokenize command string
      const tokens = clean.split(/\s+/).filter(Boolean);

      let foundTicker: string | null = null;
      let foundFunction: FunctionCode | null = null;

      tokens.forEach((token) => {
        // Strip out AN qualifiers like <EQUITY>, <INDEX>, <GO>, US, etc.
        const tokenClean = token.replace(/[<>]/g, '');

        if (FUNCTION_CODES.includes(tokenClean as FunctionCode)) {
          foundFunction = tokenClean as FunctionCode;
        } else if (
          marketEngine.getSecurity(tokenClean) ||
          marketEngine.getSecurity(token)
        ) {
          foundTicker = tokenClean;
        } else if (!['US', 'IN', 'EQUITY', 'CORP', 'INDEX', 'CURR', 'CMDTY', 'GO', 'HELP'].includes(tokenClean)) {
          // Check if token matches part of known securities
          const matched = INITIAL_SECURITIES.find(
            (s) => s.ticker === tokenClean || s.ticker.startsWith(tokenClean)
          );
          if (matched) {
            foundTicker = matched.ticker;
          }
        }
      });

      if (foundTicker) {
        setActiveTicker(foundTicker);
      }
      if (foundFunction) {
        setActiveFunction(foundFunction);
      }

      if (foundTicker || foundFunction) {
        dismissCommandError();
        audioService.playExecuteThud();
      } else {
        // Surface the failure instead of silently doing nothing.
        showCommandError(`UNRECOGNIZED: "${commandRaw.trim()}"`);
      }
    },
    [dismissCommandError, showCommandError]
  );

  // Direct ticker selection from panels/tape. Validates against the coverage
  // universe so a stale/unknown ticker can never desync the header badge
  // (which shows activeTicker) from the panels (which fall back to NVDA).
  const handleSelectTicker = useCallback(
    (ticker: string) => {
      if (marketEngine.getSecurity(ticker)) {
        setActiveTicker(ticker.toUpperCase());
      } else {
        showCommandError(`UNKNOWN TICKER: "${ticker}" — NOT IN COVERAGE`);
      }
    },
    [showCommandError]
  );

  // Global Alpha Nova keyboard shortcut bindings (F1 to F12, Escape)
  // F8/F9/F10 route through the same coverage validation as every other ticker
  // selection so the header badge can never desync from the panels.
  // F1/F5/F11 are intentionally NOT hijacked: F5 = browser refresh,
  // F11 = browser fullscreen, F1 = browser help. Blocking them traps users
  // and breaks expectations. Use HELP command or Alt+F1 instead.
  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      // Escape dismisses a pending error toast. It is handled here, not in the
      // header, so it works no matter which panel currently has focus.
      if (e.key === 'Escape') {
        dismissCommandError();
      }

      // Never steal browser-reserved keys.
      if (e.key === 'F1' || e.key === 'F5' || e.key === 'F11') return;

      if (['F2', 'F3', 'F4', 'F6', 'F7', 'F8', 'F9', 'F10', 'F12'].includes(e.key)) {
        e.preventDefault();
        audioService.playKeyClick();
      }

      switch (e.key) {
        case 'F2':
          setActiveFunction('YCRV');
          break;
        case 'F3':
          setActiveFunction('DES');
          break;
        case 'F4':
          setActiveFunction('TOP');
          break;
        case 'F6':
          setActiveFunction('FA');
          break;
        case 'F7':
          setActiveFunction('ANR');
          break;
        case 'F8':
          handleSelectTicker('AAPL');
          setActiveFunction('GP');
          break;
        case 'F9':
          handleSelectTicker('GOLD');
          setActiveFunction('GP');
          break;
        case 'F10':
          handleSelectTicker('SPX');
          setActiveFunction('WEI');
          break;
        case 'F12':
          setActiveFunction('PORT');
          break;
        // F1 (help), F5 (refresh), F11 (fullscreen) deliberately fall through
        // to the browser. WEI is reachable via TOP->WEI hop, HELP via command.
      }
    };

    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, [dismissCommandError, handleSelectTicker]);

  const handleToggleSound = () => {
    setSoundEnabled((prev) => {
      const next = !prev;
      audioService.setEnabled(next);
      if (next) audioService.playKeyClick();
      return next;
    });
  };

  return (
    <div
      data-terminal-theme={theme}
      className="flex flex-col h-dvh w-screen overflow-hidden bg-[#07090e] text-zinc-200"
    >
      {/* Top Alpha Nova Function Keys (F1 - F12) */}
      <FunctionKeysBar
        activeAssetClass={activeAssetClass}
        onSelectAssetClass={(ac) => setActiveAssetClass(ac)}
        onSelectFunction={(cmd) => handleExecuteCommand(cmd)}
      />

      {/* Main Terminal Header with Command Line, Multi-Session Clocks, Layout & Theme Controls */}
      <TerminalHeader
        currentTicker={activeTicker}
        currentFunction={activeFunction}
        layoutMode={layoutMode}
        theme={theme}
        onExecuteCommand={handleExecuteCommand}
        onChangeLayout={(mode) => setLayoutMode(mode)}
        onChangeTheme={(t) => setTheme(t)}
        onToggleSound={handleToggleSound}
        soundEnabled={soundEnabled}
      />

      {/* Central Trading Workspace Canvas */}
      <main className="flex-1 min-h-0 w-full overflow-hidden relative">
        <ErrorBoundary panelName="WORKSPACE">
          <QuadrantLayout
            layoutMode={layoutMode}
            security={currentSecurity}
            activeFunction={activeFunction}
            onSelectTicker={handleSelectTicker}
            onSelectFunction={(func) => {
              setActiveFunction(func);
            }}
          />
        </ErrorBoundary>

        {/* Unrecognized-command toast. Auto-dismisses after 6s, or press Escape. */}
        {commandError && (
          <div
            role="status"
            aria-live="polite"
            className="absolute bottom-3 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 rounded border border-rose-500/50 bg-[#1a0d12] px-3 py-1.5 text-[11px] font-bold text-rose-300 shadow-2xl max-w-[calc(100vw-2rem)]"
          >
            <span className="w-1.5 h-1.5 rounded-full bg-rose-500 shrink-0" aria-hidden="true" />
            <span className="truncate">{commandError}</span>
            <span className="text-rose-500/70 font-normal hidden sm:inline">
              (ESC to dismiss)
            </span>
            <button
              type="button"
              onClick={dismissCommandError}
              aria-label="Dismiss error"
              className="ml-1 rounded px-1.5 py-0.5 text-rose-300 hover:bg-rose-500/20 hover:text-white focus-visible:outline-2 focus-visible:outline-rose-400 min-h-[24px] min-w-[24px]"
            >
              ✕
            </button>
          </div>
        )}
      </main>

      {/* Real-time Streaming Ticker Tape & Market Session Footer */}
      <ErrorBoundary panelName="TICKER TAPE">
        <TickerTape onSelectTicker={handleSelectTicker} />
      </ErrorBoundary>
    </div>
  );
};

export default App;
