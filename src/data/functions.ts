import type { FunctionCode } from '../types/terminal';

export const AVAILABLE_FUNCTIONS: { code: FunctionCode; label: string }[] = [
  { code: 'GP', label: 'GP: Graph Price & Chart' },
  { code: 'DES', label: 'DES: Security Profile' },
  { code: 'WEI', label: 'WEI: World Equity Indices' },
  { code: 'TOP', label: 'TOP: News & Headlines Wire' },
  { code: 'YCRV', label: 'YCRV: Govt Yield Curve (US/IN)' },
  { code: 'FA', label: 'FA: Financial Statements' },
  { code: 'ANR', label: 'ANR: Analyst Targets & Recommendations' },
  { code: 'OPTS', label: 'OPTS: Black-Scholes Options Pricer' },
  { code: 'PORT', label: 'PORT: Portfolio & Risk Monitor' },
  { code: 'FX', label: 'FX: Currency Matrix' },
  { code: 'ECO', label: 'ECO: Economic Calendar' },
  { code: 'MOST', label: 'MOST: Market Movers' },
  { code: 'SIG', label: 'SIG: Top Regime Signals (HMM)' },
  { code: 'IB', label: 'IB: Instant Quant Copilot' },
  { code: 'HELP', label: 'HELP: Terminal Directory & Shortcuts' },
];
