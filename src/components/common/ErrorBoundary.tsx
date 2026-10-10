import React from 'react';

interface ErrorBoundaryProps {
  children: React.ReactNode;
  panelName?: string;
  onReset?: () => void;
}

interface ErrorBoundaryState {
  hasError: boolean;
  message: string | null;
}

/**
 * Isolates panel crashes so one bad security / NaN SVG path cannot
 * take down the whole 4-quadrant terminal. Required for multi-client rollout.
 */
export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false, message: null };

  static getDerivedStateFromError(error: unknown): ErrorBoundaryState {
    return {
      hasError: true,
      message: error instanceof Error ? error.message : 'Unexpected render error',
    };
  }

  componentDidCatch(error: unknown, info: unknown) {
    // Keep console telemetry; hook up to Sentry/Datadog here when available.
    console.error(`[ErrorBoundary:${this.props.panelName ?? 'panel'}]`, error, info);
  }

  // NOTE: stale-error recovery is handled by callers passing a `key` that
  // includes the ticker/function identity (see QuadrantLayout renderPanel), so
  // a navigation remounts the boundary instead of latching FAILED TO RENDER.

  private handleReset = () => {
    this.setState({ hasError: false, message: null });
    this.props.onReset?.();
  };

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <div
        role="alert"
        className="flex h-full w-full min-h-[120px] flex-col items-center justify-center gap-2 bg-[#0b0f18] p-4 text-center font-mono text-xs"
      >
        <div className="text-[11px] font-bold tracking-wider text-rose-400">
          {this.props.panelName ?? 'PANEL'} FAILED TO RENDER
        </div>
        <div className="max-w-md truncate text-[10px] text-zinc-500">
          {this.state.message?.slice(0, 160) ?? 'Unknown error'}
        </div>
        <div className="text-[10px] text-zinc-600">
          Other panels are unaffected. Try reloading this panel.
        </div>
        <button
          type="button"
          onClick={this.handleReset}
          className="rounded border border-amber-500/40 bg-amber-500/10 px-3 py-1 text-[11px] font-bold text-amber-300 hover:bg-amber-500/20"
        >
          RETRY PANEL
        </button>
      </div>
    );
  }
}
