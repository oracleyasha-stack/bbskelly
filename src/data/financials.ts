import type { FinancialMetricYear } from '../types/terminal';

export const FINANCIALS_DATABASE: Record<string, FinancialMetricYear[]> = {
  NVDA: [
    { period: 'FY2026', revenue: 215938, revenueGrowth: 65.5, grossProfit: 153463, grossMargin: 71.1, operatingIncome: 130387, operatingMargin: 60.4, netIncome: 120067, netMargin: 55.6, eps: 4.90, freeCashFlow: 96676, totalAssets: 206803, totalDebt: 11412, equity: 157293, roe: 76.3 },
    { period: 'FY2025', revenue: 130497, revenueGrowth: 114.2, grossProfit: 97858, grossMargin: 75.0, operatingIncome: 81453, operatingMargin: 62.4, netIncome: 72880, netMargin: 55.9, eps: 2.94, freeCashFlow: 60853, totalAssets: 111601, totalDebt: 9982, equity: 79327, roe: 91.9 },
    { period: 'FY2024', revenue: 60922, revenueGrowth: 125.9, grossProfit: 44301, grossMargin: 72.7, operatingIncome: 32972, operatingMargin: 54.1, netIncome: 29760, netMargin: 48.9, eps: 1.19, freeCashFlow: 27021, totalAssets: 65728, totalDebt: 11056, equity: 42978, roe: 69.2 },
    { period: 'FY2023', revenue: 26974, revenueGrowth: 0.2, grossProfit: 15356, grossMargin: 56.9, operatingIncome: 5577, operatingMargin: 20.7, netIncome: 4368, netMargin: 16.2, eps: 0.17, freeCashFlow: 3808, totalAssets: 41182, totalDebt: 12031, equity: 22101, roe: 19.8 },
  ],
  AAPL: [
    { period: 'FY2025', revenue: 416161, revenueGrowth: 6.4, grossProfit: 195201, grossMargin: 46.9, operatingIncome: 133050, operatingMargin: 32.0, netIncome: 112010, netMargin: 26.9, eps: 7.46, freeCashFlow: 98767, totalAssets: 359241, totalDebt: 98657, equity: 73733, roe: 151.9 },
    { period: 'FY2024', revenue: 391035, revenueGrowth: 2.0, grossProfit: 180683, grossMargin: 46.2, operatingIncome: 123216, operatingMargin: 31.5, netIncome: 93736, netMargin: 24.0, eps: 6.08, freeCashFlow: 108807, totalAssets: 364980, totalDebt: 106629, equity: 56950, roe: 164.6 },
    { period: 'FY2023', revenue: 383285, revenueGrowth: -2.8, grossProfit: 169148, grossMargin: 44.1, operatingIncome: 114301, operatingMargin: 29.8, netIncome: 96995, netMargin: 25.3, eps: 6.13, freeCashFlow: 99584, totalAssets: 352583, totalDebt: 111088, equity: 62146, roe: 156.1 },
    { period: 'FY2022', revenue: 394328, revenueGrowth: 7.8, grossProfit: 170782, grossMargin: 43.3, operatingIncome: 119437, operatingMargin: 30.3, netIncome: 99803, netMargin: 25.3, eps: 6.11, freeCashFlow: 111443, totalAssets: 352755, totalDebt: 120069, equity: 50672, roe: 196.9 },
  ],
  GS: [
    { period: 'FY2025', revenue: 58283, revenueGrowth: 8.9, grossProfit: 49774, grossMargin: 85.4, operatingIncome: 22251, operatingMargin: 38.2, netIncome: 16244, netMargin: 27.9, eps: 51.32, freeCashFlow: -47218, totalAssets: 1809320, totalDebt: 328521, equity: 125418, roe: 13.0 },
    { period: 'FY2024', revenue: 53512, revenueGrowth: 15.7, grossProfit: 45700, grossMargin: 85.4, operatingIncome: 18791, operatingMargin: 35.1, netIncome: 13476, netMargin: 25.2, eps: 40.54, freeCashFlow: -15303, totalAssets: 1675972, totalDebt: 290156, equity: 122413, roe: 11.0 },
    { period: 'FY2023', revenue: 46254, revenueGrowth: -2.3, grossProfit: 39500, grossMargin: 85.4, operatingIncome: 12961, operatingMargin: 28.0, netIncome: 7856, netMargin: 17.0, eps: 22.87, freeCashFlow: -14903, totalAssets: 1641594, totalDebt: 299135, equity: 117268, roe: 6.7 },
    { period: 'FY2022', revenue: 47365, revenueGrowth: -20.2, grossProfit: 40454, grossMargin: 85.4, operatingIncome: 13800, operatingMargin: 29.1, netIncome: 10711, netMargin: 22.6, eps: 30.06, freeCashFlow: 4960, totalAssets: 1441799, totalDebt: 294709, equity: 117838, roe: 9.1 },
  ],
};

export const DEFAULT_FINANCIALS: FinancialMetricYear[] = [
  { period: 'FY2025 (Est)', revenue: 150000, revenueGrowth: 15.0, grossProfit: 80000, grossMargin: 53.3, operatingIncome: 45000, operatingMargin: 30.0, netIncome: 36000, netMargin: 24.0, eps: 5.20, freeCashFlow: 32000, totalAssets: 210000, totalDebt: 45000, equity: 110000, roe: 32.7 },
  { period: 'FY2024', revenue: 130400, revenueGrowth: 12.5, grossProfit: 68500, grossMargin: 52.5, operatingIncome: 38200, operatingMargin: 29.3, netIncome: 30500, netMargin: 23.4, eps: 4.45, freeCashFlow: 27500, totalAssets: 195000, totalDebt: 42000, equity: 98000, roe: 31.1 },
  { period: 'FY2023', revenue: 115900, revenueGrowth: 9.8, grossProfit: 60200, grossMargin: 51.9, operatingIncome: 33100, operatingMargin: 28.6, netIncome: 26400, netMargin: 22.8, eps: 3.82, freeCashFlow: 23800, totalAssets: 180000, totalDebt: 40000, equity: 89000, roe: 29.6 },
  { period: 'FY2022', revenue: 105500, revenueGrowth: 14.2, grossProfit: 54100, grossMargin: 51.3, operatingIncome: 29800, operatingMargin: 28.2, netIncome: 23800, netMargin: 22.5, eps: 3.40, freeCashFlow: 21200, totalAssets: 168000, totalDebt: 38000, equity: 81000, roe: 29.4 },
];
