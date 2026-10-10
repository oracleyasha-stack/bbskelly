export type FunctionCode =
  | 'GP'     // Graph Price (Interactive Chart)
  | 'DES'    // Security Description
  | 'WEI'    // World Equity Indices
  | 'TOP'    // Top News
  | 'YCRV'   // Yield Curve
  | 'FA'     // Financial Analysis
  | 'ANR'    // Analyst Recommendations
  | 'FX'     // FX & Crypto Matrix
  | 'ECO'    // Economic Calendar
  | 'OPTS'   // Options Pricer & Chain
  | 'PORT'   // Portfolio & Risk
  | 'MOST'   // Market Movers
  | 'SIG'    // Top Regime Signals (HMM)
  | 'IB'     // Alpha Nova Copilot (Quant Copilot)
  | 'HELP';  // Help & Shortcuts

/** Runtime list of all function codes (single source of truth for the command line). */
export const FUNCTION_CODES: FunctionCode[] = [
  'GP', 'DES', 'WEI', 'TOP', 'YCRV', 'FA', 'ANR', 'FX', 'ECO', 'OPTS', 'PORT', 'MOST', 'SIG', 'IB', 'HELP',
];

export type AssetClass = 'EQUITY' | 'INDEX' | 'CURR' | 'CMDTY' | 'GOVT' | 'CRYPTO';

export type TerminalTheme = 'modern' | 'classic-amber' | 'bloomberg-green' | 'neon-cyan';

export type LayoutMode = 'single' | 'split-h' | 'split-v' | 'quadrant';

export interface PricePoint {
  time: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface Security {
  ticker: string;
  name: string;
  assetClass: AssetClass;
  exchange: string;
  currency: string;
  price: number;
  change: number;
  changePercent: number;
  open: number;
  high: number;
  low: number;
  prevClose: number;
  volume: number;
  avgVolume: number;
  marketCap: string;
  peRatio?: number;
  fwdPe?: number;
  evEbitda?: number;
  eps?: number;
  divYield?: number;
  beta?: number;
  fiftyTwoWeekHigh: number;
  fiftyTwoWeekLow: number;
  description: string;
  sector: string;
  industry: string;
  consensusRating: 'STRONG_BUY' | 'BUY' | 'HOLD' | 'UNDERPERFORM' | 'SELL';
  targetPrice: number;
  targetHigh: number;
  targetLow: number;
  analystCount: number;
  sparkline: number[];
  lastUpdate: number;
  bid: number;
  ask: number;
  bidSize: number;
  askSize: number;
}

export interface NewsStory {
  id: string;
  headline: string;
  summary: string;
  body: string;
  /** Publisher label: 'ALPHA NOVA' for seeded demo stories, outlet name for live wire stories. */
  source: string;
  timestamp: string;
  category: 'EQUITIES' | 'MACRO' | 'COMMODITIES' | 'FX' | 'CRYPTO';
  urgency: 'BREAKING' | 'URGENT' | 'ROUTINE';
  tickers: string[];
  /** Live wire stories link out to the publisher; seeded stories open the in-app reader. */
  url?: string;
  /** True for fetched wire stories (Google News RSS), false/undefined for seeded demo content. */
  live?: boolean;
}

export interface EconomicEvent {
  id: string;
  /** ISO calendar date (YYYY-MM-DD) — seeded rows must always carry a day. */
  date: string;
  /** Release time in UTC (HH:MM). */
  time: string;
  country: string;
  countryCode: string;
  event: string;
  actual?: string;
  survey: string;
  prior: string;
  importance: 'HIGH' | 'MEDIUM' | 'LOW';
  impact: 'positive' | 'negative' | 'neutral';
}

export interface YieldPoint {
  tenor: string;
  maturityMonths: number;
  yield: number;
  change: number;
  priorMonthYield: number;
  priorYearYield: number;
}

export interface FinancialMetricYear {
  period: string;
  revenue: number | null;
  revenueGrowth: number | null;
  grossProfit: number | null;
  grossMargin: number | null;
  operatingIncome: number | null;
  operatingMargin: number | null;
  netIncome: number | null;
  netMargin: number | null;
  eps: number | null;
  freeCashFlow: number | null;
  totalAssets: number | null;
  totalDebt: number | null;
  equity: number | null;
  roe: number | null;
}

export interface OptionContract {
  strike: number;
  callBid: number;
  callAsk: number;
  callLast: number;
  callVol: number;
  callOI: number;
  callIV: number;
  callDelta: number;
  putBid: number;
  putAsk: number;
  putLast: number;
  putVol: number;
  putOI: number;
  putIV: number;
  putDelta: number;
}

export interface PortfolioPosition {
  id: string;
  ticker: string;
  name: string;
  quantity: number;
  entryPrice: number;
  currentPrice: number;
  marketValue: number;
  unrealizedPnL: number;
  unrealizedPnLPercent: number;
  dayPnL: number;
  weight: number;
  assetClass: AssetClass;
  currency?: string;
}

export interface QuantMessage {
  id: string;
  sender: 'SYSTEM' | 'QUANT_COPILOT' | 'TRADER';
  text: string;
  timestamp: string;
  /**
   * Tickers the copilot referenced, rendered as clickable chips that load the
   * security in the rest of the terminal.
   */
  tickers?: string[];
  /** Function codes the copilot suggested, rendered as clickable chips. */
  functions?: FunctionCode[];
  attachments?: {
    type: 'METRICS' | 'CHART' | 'TRADE_IDEA';
    data: any;
  };
}
