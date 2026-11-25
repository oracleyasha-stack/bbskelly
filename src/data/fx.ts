export interface FxRow {
  pair: string;
  source?: 'Yahoo';
  marketTime?: number;
  rate: number;
  chg: number;
  pctChg: number;
  high: number;
  low: number;
}

export const FX_RATES: FxRow[] = [
  // Spot levels are the ECB euro reference rates for 25 September 2026,
  // converted to conventional pair quotes; day changes are illustrative.
  { pair: 'EUR/USD', rate: 1.1403, chg: -0.0035, pctChg: -0.31, high: 1.1448, low: 1.1396 },
  { pair: 'USD/JPY', rate: 157.59, chg: +0.62, pctChg: +0.39, high: 158.10, low: 156.72 },
  { pair: 'GBP/USD', rate: 1.3252, chg: -0.0028, pctChg: -0.21, high: 1.3295, low: 1.3241 },
  { pair: 'USD/INR', rate: 95.8175, chg: -0.0002, pctChg: -0.00, high: 95.9020, low: 95.7610 },
  { pair: 'USD/CHF', rate: 0.8283, chg: +0.0015, pctChg: +0.18, high: 0.8301, low: 0.8258 },
  { pair: 'AUD/USD', rate: 0.7030, chg: -0.0020, pctChg: -0.28, high: 0.7062, low: 0.7018 },
  { pair: 'USD/CAD', rate: 1.4143, chg: +0.0031, pctChg: +0.22, high: 1.4168, low: 1.4095 },
  { pair: 'USD/CNY', rate: 6.7133, chg: +0.0120, pctChg: +0.18, high: 6.7210, low: 6.6985 },
];

export const CRYPTO_RATES: FxRow[] = [
  { pair: 'BTC/USD', rate: 83904.00, chg: -76.00, pctChg: -0.09, high: 84720.00, low: 83210.00 },
  { pair: 'ETH/USD', rate: 2685.40, chg: -2.40, pctChg: -0.09, high: 2712.00, low: 2654.00 },
  { pair: 'SOL/USD', rate: 120.35, chg: -1.69, pctChg: -1.40, high: 123.10, low: 118.80 },
];
