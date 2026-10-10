import type { YieldPoint } from '../types/terminal';

export const US_TREASURY_YIELD_CURVE: YieldPoint[] = [
  { tenor: '1M', maturityMonths: 1, yield: 3.94, change: 0.00, priorMonthYield: 3.58, priorYearYield: 3.98 },
  { tenor: '3M', maturityMonths: 3, yield: 3.90, change: 0.00, priorMonthYield: 3.55, priorYearYield: 3.96 },
  { tenor: '6M', maturityMonths: 6, yield: 3.97, change: -0.01, priorMonthYield: 3.63, priorYearYield: 3.88 },
  { tenor: '1Y', maturityMonths: 12, yield: 4.18, change: -0.01, priorMonthYield: 3.95, priorYearYield: 3.72 },
  { tenor: '2Y', maturityMonths: 24, yield: 4.86, change: -0.03, priorMonthYield: 4.41, priorYearYield: 3.60 },
  { tenor: '3Y', maturityMonths: 36, yield: 4.97, change: 0.00, priorMonthYield: 4.52, priorYearYield: 3.60 },
  { tenor: '5Y', maturityMonths: 60, yield: 5.06, change: 0.00, priorMonthYield: 4.66, priorYearYield: 3.72 },
  { tenor: '7Y', maturityMonths: 84, yield: 5.11, change: +0.01, priorMonthYield: 4.75, priorYearYield: 3.92 },
  { tenor: '10Y', maturityMonths: 120, yield: 5.16, change: +0.01, priorMonthYield: 4.85, priorYearYield: 4.12 },
  { tenor: '20Y', maturityMonths: 240, yield: 5.45, change: +0.02, priorMonthYield: 5.10, priorYearYield: 4.70 },
  { tenor: '30Y', maturityMonths: 360, yield: 5.49, change: +0.02, priorMonthYield: 5.14, priorYearYield: 4.66 },
];

export const INDIA_GSEC_YIELD_CURVE: YieldPoint[] = [
  { tenor: '1M', maturityMonths: 1, yield: 5.48, change: 0.01, priorMonthYield: 5.42, priorYearYield: 6.72 },
  { tenor: '3M', maturityMonths: 3, yield: 5.58, change: 0.01, priorMonthYield: 5.51, priorYearYield: 6.78 },
  { tenor: '6M', maturityMonths: 6, yield: 5.82, change: 0.00, priorMonthYield: 5.78, priorYearYield: 6.95 },
  { tenor: '1Y', maturityMonths: 12, yield: 5.96, change: -0.01, priorMonthYield: 6.00, priorYearYield: 7.02 },
  { tenor: '2Y', maturityMonths: 24, yield: 6.05, change: -0.01, priorMonthYield: 6.10, priorYearYield: 7.08 },
  { tenor: '3Y', maturityMonths: 36, yield: 6.16, change: 0.00, priorMonthYield: 6.18, priorYearYield: 7.12 },
  { tenor: '5Y', maturityMonths: 60, yield: 6.32, change: 0.01, priorMonthYield: 6.28, priorYearYield: 7.15 },
  { tenor: '7Y', maturityMonths: 84, yield: 6.46, change: 0.01, priorMonthYield: 6.41, priorYearYield: 7.18 },
  { tenor: '10Y', maturityMonths: 120, yield: 6.58, change: 0.02, priorMonthYield: 6.52, priorYearYield: 7.22 },
  { tenor: '20Y', maturityMonths: 240, yield: 6.94, change: 0.01, priorMonthYield: 6.90, priorYearYield: 7.38 },
  { tenor: '30Y', maturityMonths: 360, yield: 7.02, change: 0.01, priorMonthYield: 6.98, priorYearYield: 7.42 },
];

export const YIELD_SPREADS = [
  { label: '2Y / 10Y Spread', current: '+30 bps', priorMonth: '+44 bps', priorYear: '+52 bps', status: 'NORMAL' },
  { label: '3M / 10Y Spread', current: '+126 bps', priorMonth: '+130 bps', priorYear: '+16 bps', status: 'NORMAL' },
  { label: '5Y / 30Y Spread', current: '+43 bps', priorMonth: '+48 bps', priorYear: '+94 bps', status: 'NORMAL' },
  { label: '10Y / 30Y Spread', current: '+33 bps', priorMonth: '+29 bps', priorYear: '+54 bps', status: 'NORMAL' },
];
