import React, { useState, useEffect, useRef, lazy, Suspense } from 'react';
import type { FunctionCode, LayoutMode, Security } from '../../types/terminal';
import { FUNCTION_CODES } from '../../types/terminal';
import { usePersistentState, isOneOf } from '../../hooks/usePersistentState';
import { PanelWrapper } from './PanelWrapper';
import { ResizeHandle } from './ResizeHandle';
import { ErrorBoundary } from '../common/ErrorBoundary';

// Lazy-load panels so the initial bundle is shell + Q1 only.
// Each chunk loads on first use in a quadrant.
const ChartPanel = lazy(() => import('../panels/ChartPanel').then((m) => ({ default: m.ChartPanel })));
const SecurityDescription = lazy(() => import('../panels/SecurityDescription').then((m) => ({ default: m.SecurityDescription })));
const WorldIndicesPanel = lazy(() => import('../panels/WorldIndicesPanel').then((m) => ({ default: m.WorldIndicesPanel })));
const NewsPanel = lazy(() => import('../panels/NewsPanel').then((m) => ({ default: m.NewsPanel })));
const YieldCurvePanel = lazy(() => import('../panels/YieldCurvePanel').then((m) => ({ default: m.YieldCurvePanel })));
const FinancialAnalysisPanel = lazy(() => import('../panels/FinancialAnalysisPanel').then((m) => ({ default: m.FinancialAnalysisPanel })));
const AnalystRecommendations = lazy(() => import('../panels/AnalystRecommendations').then((m) => ({ default: m.AnalystRecommendations })));
const OptionsPricerPanel = lazy(() => import('../panels/OptionsPricerPanel').then((m) => ({ default: m.OptionsPricerPanel })));
const PortfolioPanel = lazy(() => import('../panels/PortfolioPanel').then((m) => ({ default: m.PortfolioPanel })));
const CurrencyMatrixPanel = lazy(() => import('../panels/CurrencyMatrixPanel').then((m) => ({ default: m.CurrencyMatrixPanel })));
const EconomicCalendarPanel = lazy(() => import('../panels/EconomicCalendarPanel').then((m) => ({ default: m.EconomicCalendarPanel })));
const MarketMoversPanel = lazy(() => import('../panels/MarketMoversPanel').then((m) => ({ default: m.MarketMoversPanel })));
const SignalsPanel = lazy(() => import('../panels/SignalsPanel').then((m) => ({ default: m.SignalsPanel })));
const InstantBloombergPanel = lazy(() => import('../panels/InstantBloombergPanel').then((m) => ({ default: m.InstantBloombergPanel })));
const HelpShortcutsPanel = lazy(() => import('../panels/HelpShortcutsPanel').then((m) => ({ default: m.HelpShortcutsPanel })));

const PanelFallback: React.FC<{ label: string }> = ({ label }) => (
  <div className="flex h-full w-full items-center justify-center bg-[#090d16] text-[11px] font-mono text-zinc-500" role="status" aria-live="polite">
    LOADING {label}…
  </div>
);

interface QuadrantLayoutProps {
  layoutMode: LayoutMode;
  security: Security;
  activeFunction: FunctionCode;
  onSelectTicker: (ticker: string) => void;
  onSelectFunction: (code: FunctionCode) => void;
}

interface LayoutSizes {
  colPct: number;
  leftRowPct: number;
  rightRowPct: number;
  splitPct: number;
}

const LAYOUT_SIZES_KEY = 'bloomberg-terminal:layout-sizes:v1';
const DEFAULT_LAYOUT_SIZES: LayoutSizes = {
  colPct: 50,
  leftRowPct: 50,
  rightRowPct: 50,
  splitPct: 50,
};

const loadLayoutSizes = (): LayoutSizes => {
  if (typeof window === 'undefined') return DEFAULT_LAYOUT_SIZES;

  try {
    const saved = window.localStorage.getItem(LAYOUT_SIZES_KEY);
    if (!saved) return DEFAULT_LAYOUT_SIZES;

    const parsed: unknown = JSON.parse(saved);
    if (!parsed || typeof parsed !== 'object') return DEFAULT_LAYOUT_SIZES;

    const values = parsed as Partial<Record<keyof LayoutSizes, unknown>>;
    const getSize = (key: keyof LayoutSizes) => {
      const value = values[key];
      return typeof value === 'number' && Number.isFinite(value)
        ? Math.min(85, Math.max(15, value))
        : DEFAULT_LAYOUT_SIZES[key];
    };

    return {
      colPct: getSize('colPct'),
      leftRowPct: getSize('leftRowPct'),
      rightRowPct: getSize('rightRowPct'),
      splitPct: getSize('splitPct'),
    };
  } catch {
    return DEFAULT_LAYOUT_SIZES;
  }
};

export const QuadrantLayout: React.FC<QuadrantLayoutProps> = ({
  layoutMode,
  security,
  activeFunction,
  onSelectTicker,
  onSelectFunction,
}) => {
  // Independent state for 4-quadrant multi-monitor workspace.
  // Q1 always mirrors the global activeFunction (which itself persists in
  // App), so only Q2–Q4 need their own persisted slots. Changing a quadrant
  // from TOP to WEI now survives reload *and* layout-mode hops because the
  // component stays mounted and the value is in localStorage.
  const isValidFunc = isOneOf(FUNCTION_CODES);
  const [q1Func, setQ1Func] = useState<FunctionCode>(activeFunction);
  const [q2Func, setQ2Func] = usePersistentState<FunctionCode>(
    'bloomberg-terminal:quadrant:q2:v1',
    'DES',
    isValidFunc,
  );
  const [q3Func, setQ3Func] = usePersistentState<FunctionCode>(
    'bloomberg-terminal:quadrant:q3:v1',
    'TOP',
    isValidFunc,
  );
  const [q4Func, setQ4Func] = usePersistentState<FunctionCode>(
    'bloomberg-terminal:quadrant:q4:v1',
    'WEI',
    isValidFunc,
  );

  // Maximize specific quadrant
  const [maximizedQuadrant, setMaximizedQuadrant] = useState<number | null>(null);

  // Draggable layout proportions (% of the workspace)
  const [layoutSizes, setLayoutSizes] = useState<LayoutSizes>(loadLayoutSizes);
  const { colPct, leftRowPct, rightRowPct, splitPct } = layoutSizes;

  useEffect(() => {
    try {
      window.localStorage.setItem(LAYOUT_SIZES_KEY, JSON.stringify(layoutSizes));
    } catch {
      // Keep resizing usable when browser storage is unavailable.
    }
  }, [layoutSizes]);

  const updateLayoutSize = (key: keyof LayoutSizes) => (value: number) => {
    setLayoutSizes((current) => ({ ...current, [key]: value }));
  };

  // Q1 is the header-linked quadrant: changing it must also update the global
  // activeFunction so the command bar badge never desyncs from the panel.
  // (Quadrant mode already did this; split modes previously did not.)
  const handleQ1Change = (c: FunctionCode) => {
    setQ1Func(c);
    onSelectFunction(c);
  };

  // Reference boxes for pointer-to-percentage drag math
  const workspaceRef = useRef<HTMLDivElement>(null);
  const leftColRef = useRef<HTMLDivElement>(null);
  const rightColRef = useRef<HTMLDivElement>(null);
  const splitRef = useRef<HTMLDivElement>(null);

  // Below the md breakpoint the workspace stacks vertically and drag handles hide.
  const [isStacked, setIsStacked] = useState<boolean>(
    () => typeof window !== 'undefined' && !window.matchMedia('(min-width: 768px)').matches
  );
  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      setIsStacked(true);
      return;
    }
    const mq = window.matchMedia('(min-width: 768px)');
    const onChange = () => setIsStacked(!mq.matches);
    onChange();
    // Safari < 14 uses addListener/removeListener instead of addEventListener.
    if (typeof mq.addEventListener === 'function') {
      mq.addEventListener('change', onChange);
      return () => mq.removeEventListener('change', onChange);
    } else if (typeof (mq as unknown as { addListener?: (cb: () => void) => void }).addListener === 'function') {
      (mq as unknown as { addListener: (cb: () => void) => void }).addListener(onChange);
      return () => (mq as unknown as { removeListener: (cb: () => void) => void }).removeListener?.(onChange);
    }
    return undefined;
  }, []);

  // Sync Q1 with active function — but never while a quadrant is maximized.
  // Otherwise changing the maximized quadrant's function (which notifies App)
  // silently overwrites Q1 behind the user's back.
  React.useEffect(() => {
    if (maximizedQuadrant !== null) return;
    setQ1Func((prev) => (prev === activeFunction ? prev : activeFunction));
  }, [activeFunction, maximizedQuadrant]);

  // Clear a stale maximized view when the layout mode changes, otherwise a
  // quadrant maximized in one mode confusingly persists in another.
  React.useEffect(() => {
    setMaximizedQuadrant(null);
  }, [layoutMode]);

  const renderPanel = (code: FunctionCode) => {
    // Include the ticker in the ErrorBoundary key for ticker-bound panels so a
    // crash on one bad ticker resets when the user switches to a good ticker
    // (instead of latching FAILED TO RENDER until manual retry).
    // Per-panel boundary: one crashing quadrant no longer kills the workspace.
    const tickerBound = ['GP', 'DES', 'FA', 'ANR', 'OPTS', 'TOP'].includes(code);
    const key = tickerBound ? `${code}:${security.ticker}` : `${code}`;
    const wrapped = (node: React.ReactNode) => (
      <ErrorBoundary key={key} panelName={getPanelTitle(code)}>
        <Suspense fallback={<PanelFallback label={getPanelTitle(code)} />}>{node}</Suspense>
      </ErrorBoundary>
    );
    switch (code) {
      case 'GP':
        return wrapped(<ChartPanel security={security} onSelectTicker={onSelectTicker} />);
      case 'DES':
        return wrapped(<SecurityDescription security={security} />);
      case 'WEI':
        return wrapped(<WorldIndicesPanel onSelectTicker={onSelectTicker} />);
      case 'TOP':
        return wrapped(<NewsPanel security={security} onSelectTicker={onSelectTicker} />);
      case 'YCRV':
        return wrapped(<YieldCurvePanel />);
      case 'FA':
        return wrapped(<FinancialAnalysisPanel security={security} />);
      case 'ANR':
        return wrapped(<AnalystRecommendations security={security} />);
      case 'OPTS':
        return wrapped(<OptionsPricerPanel security={security} />);
      case 'PORT':
        return wrapped(<PortfolioPanel onSelectTicker={onSelectTicker} />);
      case 'FX':
        return wrapped(<CurrencyMatrixPanel onSelectTicker={onSelectTicker} />);
      case 'ECO':
        return wrapped(<EconomicCalendarPanel />);
      case 'MOST':
        return wrapped(<MarketMoversPanel onSelectTicker={onSelectTicker} />);
      case 'SIG':
        return wrapped(<SignalsPanel security={security} onSelectTicker={onSelectTicker} />);
      case 'IB':
        return wrapped(<InstantBloombergPanel onSelectTicker={onSelectTicker} onSelectFunction={onSelectFunction} />);
      case 'HELP':
      default:
        return wrapped(<HelpShortcutsPanel onSelectFunction={onSelectFunction} />);
    }
  };

  const getPanelTitle = (code: FunctionCode): string => {
    switch (code) {
      case 'GP': return 'GRAPH PRICE & TECHNICALS';
      case 'DES': return 'SECURITY DESCRIPTION';
      case 'WEI': return 'WORLD EQUITY INDICES';
      case 'TOP': return 'TOP NEWS & HEADLINES WIRE';
      case 'YCRV': return 'GOVT YIELD CURVE (US/IN)';
      case 'FA': return 'FINANCIAL ANALYSIS';
      case 'ANR': return 'ANALYST RECOMMENDATIONS';
      case 'OPTS': return 'OPTIONS PRICER & GREEKS';
      case 'PORT': return 'PORTFOLIO & RISK MONITOR';
      case 'FX': return 'FOREIGN EXCHANGE MATRIX';
      case 'ECO': return 'ECONOMIC RELEASES CALENDAR';
      case 'MOST': return 'MARKET MOVERS';
      case 'SIG': return 'TOP REGIME SIGNALS (HMM)';
      case 'IB': return 'ALPHA NOVA COPILOT';
      case 'HELP': return 'TERMINAL DIRECTORY';
      default: return code;
    }
  };

  // If a quadrant is maximized, render just that quadrant
  if (maximizedQuadrant !== null) {
    const code =
      maximizedQuadrant === 1 ? q1Func : maximizedQuadrant === 2 ? q2Func : maximizedQuadrant === 3 ? q3Func : q4Func;
    const setFunc =
      maximizedQuadrant === 1 ? setQ1Func : maximizedQuadrant === 2 ? setQ2Func : maximizedQuadrant === 3 ? setQ3Func : setQ4Func;

    return (
      <div className="h-full w-full p-1 bg-[#04060c]">
        <PanelWrapper
          title={getPanelTitle(code)}
          code={code}
          ticker={['GP', 'DES', 'FA', 'ANR', 'OPTS', 'TOP', 'SIG'].includes(code) ? security.ticker : undefined}
          isMaximized={true}
          onToggleMaximize={() => setMaximizedQuadrant(null)}
          onChangeFunction={(c) => {
            setFunc(c);
            // Maximized panel fills the workspace, so the header badge must
            // follow whichever quadrant is maximized — not just Q1.
            onSelectFunction(c);
          }}
        >
          {renderPanel(code)}
        </PanelWrapper>
      </div>
    );
  }

  // Single Panel Mode
  if (layoutMode === 'single') {
    return (
      <div className="h-full w-full p-1 bg-[#04060c]">
        <PanelWrapper
          title={getPanelTitle(activeFunction)}
          code={activeFunction}
          ticker={['GP', 'DES', 'FA', 'ANR', 'OPTS', 'TOP', 'SIG'].includes(activeFunction) ? security.ticker : undefined}
          onChangeFunction={onSelectFunction}
        >
          {renderPanel(activeFunction)}
        </PanelWrapper>
      </div>
    );
  }

  // Split Horizontal (2 side-by-side panels, divider is draggable)
  if (layoutMode === 'split-h') {
    if (isStacked) {
      return (
        <div className="h-full w-full flex flex-col gap-1 p-1 bg-[#04060c] overflow-y-auto">
          <div className="shrink-0 min-h-[340px] h-[50vh] flex flex-col">
          <PanelWrapper
            title={getPanelTitle(q1Func)}
            code={q1Func}
            ticker={['GP', 'DES', 'FA', 'ANR', 'OPTS', 'TOP', 'SIG'].includes(q1Func) ? security.ticker : undefined}
            onToggleMaximize={() => setMaximizedQuadrant(1)}
            onChangeFunction={handleQ1Change}
          >
            {renderPanel(q1Func)}
          </PanelWrapper>
          </div>

          <div className="shrink-0 min-h-[340px] h-[50vh] flex flex-col">
          <PanelWrapper
            title={getPanelTitle(q2Func)}
            code={q2Func}
            ticker={['GP', 'DES', 'FA', 'ANR', 'OPTS', 'TOP', 'SIG'].includes(q2Func) ? security.ticker : undefined}
            onToggleMaximize={() => setMaximizedQuadrant(2)}
            onChangeFunction={setQ2Func}
          >
            {renderPanel(q2Func)}
          </PanelWrapper>
          </div>
        </div>
      );
    }

    return (
      <div className="h-full w-full p-1 bg-[#04060c]">
        <div ref={splitRef} className="flex h-full w-full overflow-hidden">
          <div className="flex min-h-0 min-w-0 flex-col overflow-hidden" style={{ width: `${splitPct}%` }}>
            <PanelWrapper
              title={getPanelTitle(q1Func)}
              code={q1Func}
              ticker={['GP', 'DES', 'FA', 'ANR', 'OPTS', 'TOP', 'SIG'].includes(q1Func) ? security.ticker : undefined}
              onToggleMaximize={() => setMaximizedQuadrant(1)}
              onChangeFunction={handleQ1Change}
            >
              {renderPanel(q1Func)}
            </PanelWrapper>
          </div>

          <ResizeHandle orientation="vertical" containerRef={splitRef} value={splitPct} onChange={updateLayoutSize('splitPct')} />

          <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
            <PanelWrapper
              title={getPanelTitle(q2Func)}
              code={q2Func}
              ticker={['GP', 'DES', 'FA', 'ANR', 'OPTS', 'TOP', 'SIG'].includes(q2Func) ? security.ticker : undefined}
              onToggleMaximize={() => setMaximizedQuadrant(2)}
              onChangeFunction={setQ2Func}
            >
              {renderPanel(q2Func)}
            </PanelWrapper>
          </div>
        </div>
      </div>
    );
  }

  // Split Vertical (2 stacked panels, divider is draggable)
  if (layoutMode === 'split-v') {
    if (isStacked) {
      return (
        <div className="h-full w-full flex flex-col gap-1 p-1 bg-[#04060c] overflow-y-auto">
          <div className="shrink-0 min-h-[340px] h-[50vh] flex flex-col">
          <PanelWrapper
            title={getPanelTitle(q1Func)}
            code={q1Func}
            ticker={['GP', 'DES', 'FA', 'ANR', 'OPTS', 'TOP', 'SIG'].includes(q1Func) ? security.ticker : undefined}
            onToggleMaximize={() => setMaximizedQuadrant(1)}
            onChangeFunction={handleQ1Change}
          >
            {renderPanel(q1Func)}
          </PanelWrapper>
          </div>

          <div className="shrink-0 min-h-[340px] h-[50vh] flex flex-col">
          <PanelWrapper
            title={getPanelTitle(q2Func)}
            code={q2Func}
            ticker={['GP', 'DES', 'FA', 'ANR', 'OPTS', 'TOP', 'SIG'].includes(q2Func) ? security.ticker : undefined}
            onToggleMaximize={() => setMaximizedQuadrant(2)}
            onChangeFunction={setQ2Func}
          >
            {renderPanel(q2Func)}
          </PanelWrapper>
          </div>
        </div>
      );
    }

    return (
      <div className="h-full w-full p-1 bg-[#04060c]">
        <div ref={splitRef} className="flex h-full w-full flex-col overflow-hidden">
          <div
            className="flex min-h-0 flex-col overflow-hidden"
            style={{ height: `calc(${splitPct}% - 4px)` }}
          >
            <PanelWrapper
              title={getPanelTitle(q1Func)}
              code={q1Func}
              ticker={['GP', 'DES', 'FA', 'ANR', 'OPTS', 'TOP', 'SIG'].includes(q1Func) ? security.ticker : undefined}
              onToggleMaximize={() => setMaximizedQuadrant(1)}
              onChangeFunction={handleQ1Change}
            >
              {renderPanel(q1Func)}
            </PanelWrapper>
          </div>

          <ResizeHandle orientation="horizontal" containerRef={splitRef} value={splitPct} onChange={updateLayoutSize('splitPct')} />

          <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
            <PanelWrapper
              title={getPanelTitle(q2Func)}
              code={q2Func}
              ticker={['GP', 'DES', 'FA', 'ANR', 'OPTS', 'TOP', 'SIG'].includes(q2Func) ? security.ticker : undefined}
              onToggleMaximize={() => setMaximizedQuadrant(2)}
              onChangeFunction={setQ2Func}
            >
              {renderPanel(q2Func)}
            </PanelWrapper>
          </div>
        </div>
      </div>
    );
  }

  // 4-Quadrant Trading Workstation (Default Multi-Screen Setup)
  // Narrow screens: scrollable stacked rows with usable min-heights.
  // Desktop: draggable column/row dividers.
  if (isStacked) {
    return (
      <div
        className="h-full w-full flex flex-col gap-1 p-1 bg-[#04060c] overflow-y-auto"
      >
        <div className="shrink-0 min-h-[360px] h-[55vh] flex flex-col">
        <PanelWrapper
          title={getPanelTitle(q1Func)}
          code={q1Func}
          ticker={['GP', 'DES', 'FA', 'ANR', 'OPTS', 'TOP', 'SIG'].includes(q1Func) ? security.ticker : undefined}
          onToggleMaximize={() => setMaximizedQuadrant(1)}
          onChangeFunction={(c) => {
            setQ1Func(c);
            onSelectFunction(c);
          }}
        >
          {renderPanel(q1Func)}
        </PanelWrapper>
        </div>

        <div className="shrink-0 min-h-[360px] h-[55vh] flex flex-col">
        <PanelWrapper
          title={getPanelTitle(q2Func)}
          code={q2Func}
          ticker={['GP', 'DES', 'FA', 'ANR', 'OPTS', 'TOP', 'SIG'].includes(q2Func) ? security.ticker : undefined}
          onToggleMaximize={() => setMaximizedQuadrant(2)}
          onChangeFunction={setQ2Func}
        >
          {renderPanel(q2Func)}
        </PanelWrapper>
        </div>

        <div className="shrink-0 min-h-[360px] h-[55vh] flex flex-col">
        <PanelWrapper
          title={getPanelTitle(q3Func)}
          code={q3Func}
          onToggleMaximize={() => setMaximizedQuadrant(3)}
          onChangeFunction={setQ3Func}
        >
          {renderPanel(q3Func)}
        </PanelWrapper>
        </div>

        <div className="shrink-0 min-h-[360px] h-[55vh] flex flex-col">
        <PanelWrapper
          title={getPanelTitle(q4Func)}
          code={q4Func}
          onToggleMaximize={() => setMaximizedQuadrant(4)}
          onChangeFunction={setQ4Func}
        >
          {renderPanel(q4Func)}
        </PanelWrapper>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full w-full p-1 bg-[#04060c]">
      <div ref={workspaceRef} className="flex h-full w-full overflow-hidden">
        {/* Left column: Q1 (top) + Q3 (bottom) */}
        <div
          ref={leftColRef}
          className="flex min-h-0 flex-col overflow-hidden"
          style={{ width: `${colPct}%` }}
        >
          <div
            className="flex min-h-0 flex-col overflow-hidden"
            style={{ height: `calc(${leftRowPct}% - 4px)` }}
          >
            <PanelWrapper
              title={getPanelTitle(q1Func)}
              code={q1Func}
              ticker={['GP', 'DES', 'FA', 'ANR', 'OPTS', 'TOP', 'SIG'].includes(q1Func) ? security.ticker : undefined}
              onToggleMaximize={() => setMaximizedQuadrant(1)}
              onChangeFunction={(c) => {
                setQ1Func(c);
                onSelectFunction(c);
              }}
            >
              {renderPanel(q1Func)}
            </PanelWrapper>
          </div>

          <ResizeHandle orientation="horizontal" containerRef={leftColRef} value={leftRowPct} onChange={updateLayoutSize('leftRowPct')} />

          <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
            <PanelWrapper
              title={getPanelTitle(q3Func)}
              code={q3Func}
              ticker={['GP', 'DES', 'FA', 'ANR', 'OPTS', 'TOP', 'SIG'].includes(q3Func) ? security.ticker : undefined}
              onToggleMaximize={() => setMaximizedQuadrant(3)}
              onChangeFunction={setQ3Func}
            >
              {renderPanel(q3Func)}
            </PanelWrapper>
          </div>
        </div>

        <ResizeHandle orientation="vertical" containerRef={workspaceRef} value={colPct} onChange={updateLayoutSize('colPct')} />

        {/* Right column: Q2 (top) + Q4 (bottom) */}
        <div
          ref={rightColRef}
          className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden"
        >
          <div
            className="flex min-h-0 flex-col overflow-hidden"
            style={{ height: `calc(${rightRowPct}% - 4px)` }}
          >
            <PanelWrapper
              title={getPanelTitle(q2Func)}
              code={q2Func}
              ticker={['GP', 'DES', 'FA', 'ANR', 'OPTS', 'TOP', 'SIG'].includes(q2Func) ? security.ticker : undefined}
              onToggleMaximize={() => setMaximizedQuadrant(2)}
              onChangeFunction={setQ2Func}
            >
              {renderPanel(q2Func)}
            </PanelWrapper>
          </div>

          <ResizeHandle orientation="horizontal" containerRef={rightColRef} value={rightRowPct} onChange={updateLayoutSize('rightRowPct')} />

          <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
            <PanelWrapper
              title={getPanelTitle(q4Func)}
              code={q4Func}
              ticker={['GP', 'DES', 'FA', 'ANR', 'OPTS', 'TOP', 'SIG'].includes(q4Func) ? security.ticker : undefined}
              onToggleMaximize={() => setMaximizedQuadrant(4)}
              onChangeFunction={setQ4Func}
            >
              {renderPanel(q4Func)}
            </PanelWrapper>
          </div>
        </div>
      </div>
    </div>
  );
};
