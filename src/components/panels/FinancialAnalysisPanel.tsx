import React, { useEffect, useState } from 'react';
import type { FinancialMetricYear, Security } from '../../types/terminal';
import { FINANCIALS_DATABASE } from '../../data/financials';
import { Database, LoaderCircle, Table } from 'lucide-react';
import { PanelSection } from '../layout/PanelSection';
import { audioService } from '../../services/audioService';
import { formatMoney } from '../../utils/format';
import { marketEngine } from '../../services/marketEngine';
import { fetchFinancialStatements } from '../../services/liveData';
import { usePersistentState, isOneOf } from '../../hooks/usePersistentState';

type FinancialDataSource = 'loading' | 'nse' | 'yahoo' | 'cached' | 'unavailable';

interface FinancialDataState {
  ticker: string;
  rows: FinancialMetricYear[];
  source: FinancialDataSource;
}

const formatStatementMoney = (value: number | null, symbol: string): string =>
  value == null ? 'N/A' : formatMoney(value, 2, symbol);

const formatStatementPercent = (value: number | null): string =>
  value == null ? 'N/A' : `${value.toFixed(1)}%`;

const hasUsefulStatementCoverage = (rows: FinancialMetricYear[]): boolean => {
  const fields: (keyof FinancialMetricYear)[] = [
    'revenue', 'grossProfit', 'operatingIncome', 'netIncome', 'eps',
    'freeCashFlow', 'totalAssets', 'totalDebt', 'equity',
  ];
  const values = rows.flatMap((row) => fields.map((field) => row[field]));
  const available = values.filter((value) => value != null).length;
  return values.length > 0 && available / values.length >= 0.5;
};

interface FinancialAnalysisPanelProps {
  security: Security;
}

export const FinancialAnalysisPanel: React.FC<FinancialAnalysisPanelProps> = ({ security }) => {
  // Statement section persists across tickers and TOP<->FA hops — switching
  // from NVDA/RATIOS to AAPL stays on RATIOS instead of resetting to INCOME.
  const [section, setSection] = usePersistentState<'INCOME' | 'MARGINS' | 'BALANCE_SHEET' | 'CASHFLOW' | 'RATIOS' | 'PEERS' | 'DCF'>(
    'bloomberg-terminal:fa:section:v1',
    'INCOME',
    isOneOf(['INCOME', 'MARGINS', 'BALANCE_SHEET', 'CASHFLOW', 'RATIOS', 'PEERS', 'DCF'] as const),
  );
  const [dcfGrowth, setDcfGrowth] = useState(8);
  const [dcfDiscount, setDcfDiscount] = useState(10);
  const [dataState, setDataState] = useState<FinancialDataState>({
    ticker: security.ticker,
    rows: FINANCIALS_DATABASE[security.ticker] || [],
    source: 'loading',
  });
  const cachedFinancials = FINANCIALS_DATABASE[security.ticker] || [];
  const activeData = dataState.ticker === security.ticker
    ? dataState
    : {
        ticker: security.ticker,
        rows: cachedFinancials,
        source: cachedFinancials.length ? 'cached' as const : 'loading' as const,
      };
  const financials = activeData.rows;
  const sym = security.currency === 'INR' ? '₹' : '$';
  const unitLabel = security.currency === 'INR'
    ? 'INR MILLIONS · EPS PER SHARE IN INR'
    : 'USD MILLIONS · EPS PER SHARE IN USD';

  const secTickerFA = security.ticker;
  useEffect(() => {
    let cancelled = false;
    const cached = FINANCIALS_DATABASE[secTickerFA] || [];
    setDataState({ ticker: secTickerFA, rows: cached, source: cached.length ? 'cached' : 'loading' });
    fetchFinancialStatements(secTickerFA)
      .then((result) => {
        if (cancelled) return;
        const rows = result?.rows ?? null;
        if (rows && rows.length > 0) {
          if (result?.source === 'nse') {
            setDataState({ ticker: secTickerFA, rows, source: 'nse' });
          } else if (cached.length > 0 && !hasUsefulStatementCoverage(rows)) {
            setDataState({ ticker: secTickerFA, rows: cached, source: 'cached' });
          } else {
            setDataState({ ticker: secTickerFA, rows, source: 'yahoo' });
          }
        } else if (cached.length > 0) {
          setDataState({ ticker: secTickerFA, rows: cached, source: 'cached' });
        } else {
          setDataState({ ticker: secTickerFA, rows: [], source: 'unavailable' });
        }
      })
      .catch(() => {
        if (cancelled) return;
        // Network rejection (not just empty data): fall back to snapshot
        // instead of spinning forever on the loading state.
        setDataState({
          ticker: secTickerFA,
          rows: cached,
          source: cached.length ? 'cached' : 'unavailable',
        });
      });

    return () => {
      cancelled = true;
    };
  }, [secTickerFA]);

  const sourceLabel = {
    loading: 'LOADING',
    nse: 'NSE XBRL FILINGS',
    yahoo: 'YAHOO FINANCIALS',
    cached: 'LOCAL SNAPSHOT',
    unavailable: 'NO STATEMENT DATA',
  }[activeData.source];

  return (
    <div className="h-full w-full min-h-0 bg-[#080d16] text-zinc-300 font-mono text-xs flex flex-col gap-2 p-2 select-none">
      {/* Header and Section Filter */}
      <div className="flex flex-wrap items-center justify-between bg-[#0e1422] p-2 rounded border border-[#1b253b] gap-2 shrink-0">
        <div className="flex items-center space-x-2">
          <Table className="w-4 h-4 text-amber-400" />
          <span className="font-bold text-amber-400 tracking-wider">
            {security.ticker} FINANCIAL ANALYSIS (FA)
          </span>
          <span className="text-[10px] text-zinc-500">
            {unitLabel}
          </span>
        </div>

        <div className="flex flex-wrap gap-1 bg-[#101726] border border-[#212d44] p-0.5 rounded text-[10px]">
          {(['INCOME', 'MARGINS', 'BALANCE_SHEET', 'CASHFLOW', 'RATIOS', 'PEERS', 'DCF'] as const).map((sec) => (
            <button
              key={sec}
              onClick={() => {
                audioService.playKeyClick();
                setSection(sec);
              }}
              className={`px-2 py-0.5 rounded font-bold transition-colors ${
                section === sec ? 'bg-amber-500 text-black' : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              {sec.replace('_', ' ')}
            </button>
          ))}
        </div>
      </div>

      {/* DCF controls */}
      {section === 'DCF' && (
        <div className="flex flex-wrap items-center gap-3 rounded border border-[#1b253b] bg-[#0e1422] px-2.5 py-1.5 text-[10px] text-zinc-400 shrink-0">
          <label className="flex items-center gap-1.5">
            FCF GROWTH 5Y
            <input type="range" min={-5} max={25} step={0.5} value={dcfGrowth} onChange={(e) => setDcfGrowth(parseFloat(e.target.value))} className="accent-amber-500" />
            <strong className="text-amber-300">{dcfGrowth.toFixed(1)}%</strong>
          </label>
          <label className="flex items-center gap-1.5">
            DISCOUNT (WACC)
            <input type="range" min={5} max={20} step={0.5} value={dcfDiscount} onChange={(e) => setDcfDiscount(parseFloat(e.target.value))} className="accent-cyan-500" />
            <strong className="text-cyan-300">{dcfDiscount.toFixed(1)}%</strong>
          </label>
          <span className="text-zinc-500">Gordon terminal g=3% · simple educational DCF on latest FCF</span>
        </div>
      )}

      {/* Financial Table (own scroll region) */}
      <PanelSection
        title={`${section.replace('_', ' ')} STATEMENT`}
        icon={<Table className="w-3 h-3" />}
        className="flex-1 min-h-0"
        actions={
          <span className="text-[9px] text-zinc-500">
            {sourceLabel}{financials.length > 0 && ` · ${financials.length} PERIODS · THROUGH ${financials[0].period}`}
          </span>
        }
      >
        {activeData.source === 'loading' ? (
          <div className="flex h-full min-h-40 items-center justify-center gap-2 text-zinc-400">
            <LoaderCircle className="h-4 w-4 animate-spin text-amber-400" />
            Loading annual statements for {security.ticker}…
          </div>
        ) : financials.length === 0 ? (
          <div className="flex h-full min-h-40 flex-col items-center justify-center gap-2 px-5 text-center">
            <Database className="h-5 w-5 text-zinc-500" />
            <p className="font-semibold text-zinc-300">No annual statements available for {security.ticker}.</p>
            <p className="max-w-md text-[10px] leading-relaxed text-zinc-500">
              The data provider returned no statement history. This panel does not substitute figures from another company.
            </p>
          </div>
        ) : (
        <table className="w-full text-left text-[11px]">
          <thead className="bg-[#0b101c] text-zinc-400 border-b border-[#182338] text-[10px]">
            <tr>
              <th className="py-2 px-3">METRIC</th>
              {financials.map((f) => (
                <th key={f.period} className="py-2 px-3 text-right">
                  {f.period}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-[#131b2c]">
            {section === 'INCOME' && (
              <>
                <tr className="hover:bg-[#121a2d]">
                  <td className="py-2 px-3 font-semibold text-zinc-300">Revenue (Sales)</td>
                  {financials.map((f) => (
                    <td key={f.period} className="py-2 px-3 text-right font-bold text-white">
                      {formatStatementMoney(f.revenue, sym)}
                    </td>
                  ))}
                </tr>
                <tr className="hover:bg-[#121a2d]">
                  <td className="py-2 px-3 text-zinc-400 pl-6">YoY Revenue Growth</td>
                  {financials.map((f) => (
                    <td
                      key={f.period}
                      className={`py-2 px-3 text-right font-semibold ${
                        f.revenueGrowth == null ? 'text-zinc-500' : f.revenueGrowth >= 0 ? 'text-emerald-400' : 'text-rose-400'
                      }`}
                    >
                      {f.revenueGrowth == null ? 'N/A' : `${f.revenueGrowth >= 0 ? '+' : ''}${f.revenueGrowth.toFixed(1)}%`}
                    </td>
                  ))}
                </tr>
                <tr className="hover:bg-[#121a2d]">
                  <td className="py-2 px-3 font-semibold text-zinc-300">Gross Profit</td>
                  {financials.map((f) => (
                    <td key={f.period} className="py-2 px-3 text-right text-zinc-200">
                      {formatStatementMoney(f.grossProfit, sym)}
                    </td>
                  ))}
                </tr>
                <tr className="hover:bg-[#121a2d]">
                  <td className="py-2 px-3 font-semibold text-zinc-300">Operating Income (EBIT)</td>
                  {financials.map((f) => (
                    <td key={f.period} className="py-2 px-3 text-right font-bold text-amber-300">
                      {formatStatementMoney(f.operatingIncome, sym)}
                    </td>
                  ))}
                </tr>
                <tr className="hover:bg-[#121a2d]">
                  <td className="py-2 px-3 font-semibold text-zinc-300">Net Income</td>
                  {financials.map((f) => (
                    <td key={f.period} className="py-2 px-3 text-right font-bold text-emerald-400">
                      {formatStatementMoney(f.netIncome, sym)}
                    </td>
                  ))}
                </tr>
                <tr className="hover:bg-[#121a2d]">
                  <td className="py-2 px-3 font-semibold text-zinc-300">Diluted EPS</td>
                  {financials.map((f) => (
                    <td key={f.period} className="py-2 px-3 text-right font-bold text-cyan-300">
                      {formatStatementMoney(f.eps, sym)}
                    </td>
                  ))}
                </tr>
                <tr className="hover:bg-[#121a2d]">
                  <td className="py-2 px-3 font-semibold text-zinc-300">Free Cash Flow (FCF)</td>
                  {financials.map((f) => (
                    <td key={f.period} className="py-2 px-3 text-right text-emerald-300">
                      {formatStatementMoney(f.freeCashFlow, sym)}
                    </td>
                  ))}
                </tr>
              </>
            )}

            {section === 'MARGINS' && (
              <>
                <tr className="hover:bg-[#121a2d]">
                  <td className="py-2 px-3 font-semibold text-zinc-300">Gross Margin</td>
                  {financials.map((f) => (
                    <td key={f.period} className="py-2 px-3 text-right font-bold text-cyan-300">
                      {formatStatementPercent(f.grossMargin)}
                    </td>
                  ))}
                </tr>
                <tr className="hover:bg-[#121a2d]">
                  <td className="py-2 px-3 font-semibold text-zinc-300">Operating Margin</td>
                  {financials.map((f) => (
                    <td key={f.period} className="py-2 px-3 text-right font-bold text-amber-300">
                      {formatStatementPercent(f.operatingMargin)}
                    </td>
                  ))}
                </tr>
                <tr className="hover:bg-[#121a2d]">
                  <td className="py-2 px-3 font-semibold text-zinc-300">Net Profit Margin</td>
                  {financials.map((f) => (
                    <td key={f.period} className="py-2 px-3 text-right font-bold text-emerald-400">
                      {formatStatementPercent(f.netMargin)}
                    </td>
                  ))}
                </tr>
                <tr className="hover:bg-[#121a2d]">
                  <td className="py-2 px-3 font-semibold text-zinc-300">Return on Equity (ROE)</td>
                  {financials.map((f) => (
                    <td key={f.period} className="py-2 px-3 text-right font-bold text-pink-400">
                      {formatStatementPercent(f.roe)}
                    </td>
                  ))}
                </tr>
              </>
            )}

            {section === 'BALANCE_SHEET' && (
              <>
                <tr className="hover:bg-[#121a2d]">
                  <td className="py-2 px-3 font-semibold text-zinc-300">Total Assets</td>
                  {financials.map((f) => (
                    <td key={f.period} className="py-2 px-3 text-right font-bold text-white">
                      {formatStatementMoney(f.totalAssets, sym)}
                    </td>
                  ))}
                </tr>
                <tr className="hover:bg-[#121a2d]">
                  <td className="py-2 px-3 font-semibold text-zinc-300">Total Debt</td>
                  {financials.map((f) => (
                    <td key={f.period} className="py-2 px-3 text-right text-rose-300">
                      {formatStatementMoney(f.totalDebt, sym)}
                    </td>
                  ))}
                </tr>
                <tr className="hover:bg-[#121a2d]">
                  <td className="py-2 px-3 font-semibold text-zinc-300">Stockholders Equity</td>
                  {financials.map((f) => (
                    <td key={f.period} className="py-2 px-3 text-right font-bold text-emerald-400">
                      {formatStatementMoney(f.equity, sym)}
                    </td>
                  ))}
                </tr>
                <tr className="hover:bg-[#121a2d]">
                  <td className="py-2 px-3 text-zinc-400 pl-6">Debt / Equity</td>
                  {financials.map((f) => (
                    <td key={f.period} className="py-2 px-3 text-right text-zinc-200">
                      {f.totalDebt != null && f.equity ? (f.totalDebt / f.equity).toFixed(2) + 'x' : 'N/A'}
                    </td>
                  ))}
                </tr>
              </>
            )}

            {section === 'CASHFLOW' && (
              <>
                <tr className="hover:bg-[#121a2d]">
                  <td className="py-2 px-3 font-semibold text-zinc-300">Free Cash Flow (FCF)</td>
                  {financials.map((f) => (
                    <td key={f.period} className="py-2 px-3 text-right font-bold text-emerald-300">
                      {formatStatementMoney(f.freeCashFlow, sym)}
                    </td>
                  ))}
                </tr>
                <tr className="hover:bg-[#121a2d]">
                  <td className="py-2 px-3 text-zinc-400 pl-6">FCF Margin (FCF / Revenue)</td>
                  {financials.map((f) => (
                    <td key={f.period} className="py-2 px-3 text-right text-zinc-200">
                      {f.freeCashFlow != null && f.revenue ? ((f.freeCashFlow / f.revenue) * 100).toFixed(1) + '%' : 'N/A'}
                    </td>
                  ))}
                </tr>
                <tr className="hover:bg-[#121a2d]">
                  <td className="py-2 px-3 text-zinc-400 pl-6">FCF vs Net Income</td>
                  {financials.map((f) => (
                    <td key={f.period} className={`py-2 px-3 text-right font-semibold ${f.freeCashFlow != null && f.netIncome != null && f.freeCashFlow >= f.netIncome ? 'text-emerald-400' : 'text-amber-300'}`}>
                      {f.freeCashFlow != null && f.netIncome ? (f.freeCashFlow / f.netIncome).toFixed(2) + 'x' : 'N/A'}
                    </td>
                  ))}
                </tr>
                <tr>
                  <td colSpan={financials.length + 1} className="py-2 px-3 text-[10px] text-zinc-500">
                    Annual statements only (no quarterly split in this feed). FCF quality &gt;1x net income is the earnings-quality check.
                  </td>
                </tr>
              </>
            )}

            {section === 'RATIOS' && (
              <>
                {[
                  { label: 'Debt / Equity', get: (f: FinancialMetricYear): string => (f.totalDebt != null && f.equity ? (f.totalDebt / f.equity).toFixed(2) + 'x' : 'N/A') },
                  { label: 'ROA (Net / Assets)', get: (f: FinancialMetricYear): string => (f.netIncome != null && f.totalAssets ? ((f.netIncome / f.totalAssets) * 100).toFixed(1) + '%' : 'N/A') },
                  { label: 'FCF Margin', get: (f: FinancialMetricYear): string => (f.freeCashFlow != null && f.revenue ? ((f.freeCashFlow / f.revenue) * 100).toFixed(1) + '%' : 'N/A') },
                  { label: 'Revenue / Assets (x)', get: (f: FinancialMetricYear): string => (f.revenue != null && f.totalAssets ? (f.revenue / f.totalAssets).toFixed(2) + 'x' : 'N/A') },
                ].map((row) => (
                  <tr key={row.label} className="hover:bg-[#121a2d]">
                    <td className="py-2 px-3 font-semibold text-zinc-300">{row.label}</td>
                    {financials.map((f) => (
                      <td key={f.period} className="py-2 px-3 text-right text-zinc-200">{row.get(f)}</td>
                    ))}
                  </tr>
                ))}
                <tr>
                  <td colSpan={financials.length + 1} className="py-2 px-3 text-[10px] text-zinc-500">
                    Quality score (improvements YoY across revenue, net margin, ROE, FCF&gt;0, debt down):{' '}
                    <strong className="text-amber-300">
                      {(() => {
                        if (financials.length < 2) return 'N/A (need 2 periods)';
                        const [a, b] = financials;
                        let s = 0;
                        if ((a.revenue ?? -Infinity) > (b.revenue ?? -Infinity)) s++;
                        if ((a.netMargin ?? -Infinity) > (b.netMargin ?? -Infinity)) s++;
                        if ((a.roe ?? -Infinity) > (b.roe ?? -Infinity)) s++;
                        if ((a.freeCashFlow ?? 0) > 0) s++;
                        if ((a.totalDebt ?? Infinity) < (b.totalDebt ?? Infinity)) s++;
                        return `${s}/5`;
                      })()}
                    </strong>{' '}
                    · simplified Piotroski-style, educational only.
                  </td>
                </tr>
              </>
            )}

            {section === 'PEERS' && (
              <>
                {(() => {
                  const peers = marketEngine
                    .getAllSecurities()
                    .filter((s) => s.sector === security.sector && s.ticker !== security.ticker)
                    .slice(0, 6);
                  if (!peers.length) return <tr><td className="py-2 px-3 text-zinc-500">No same-sector peers in universe.</td></tr>;
                  return (
                    <>
                      <tr className="text-[10px] text-zinc-500">
                        <td className="py-2 px-3">PEER</td>
                        <td className="py-2 px-3 text-right">PRICE</td>
                        <td className="py-2 px-3 text-right">P/E</td>
                        <td className="py-2 px-3 text-right">DAY%</td>
                        <td className="py-2 px-3 text-right">TARGET IMPL%</td>
                      </tr>
                      {[security, ...peers].map((s) => {
                        const psym = s.currency === 'INR' ? '₹' : '$';
                        const impl = s.targetPrice > 0 && s.price > 0 ? (((s.targetPrice - s.price) / s.price) * 100).toFixed(1) + '%' : 'N/A';
                        return (
                          <tr key={s.ticker} className={`hover:bg-[#121a2d] ${s.ticker === security.ticker ? 'bg-amber-500/10' : ''}`}>
                            <td className="py-2 px-3 font-bold text-amber-300">{s.ticker}</td>
                            <td className="py-2 px-3 text-right text-white">{formatMoney(s.price, 2, psym)}</td>
                            <td className="py-2 px-3 text-right text-zinc-200">{s.peRatio?.toFixed(1) ?? 'N/A'}</td>
                            <td className={`py-2 px-3 text-right ${s.changePercent >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                              {s.changePercent >= 0 ? '+' : ''}{s.changePercent.toFixed(2)}%
                            </td>
                            <td className="py-2 px-3 text-right text-cyan-300">{impl}</td>
                          </tr>
                        );
                      })}
                    </>
                  );
                })()}
              </>
            )}

            {section === 'DCF' && (
              <>
                {(() => {
                  const latest = financials[0];
                  const fcf = latest?.freeCashFlow;
                  if (fcf == null || fcf <= 0) return <tr><td className="py-2 px-3 text-zinc-500">DCF needs positive latest FCF (currently {fcf == null ? 'N/A' : formatStatementMoney(fcf, sym)}).</td></tr>;
                  const g = dcfGrowth / 100;
                  const wacc = dcfDiscount / 100;
                  const termG = 0.03;
                  if (wacc <= termG) return <tr><td className="py-2 px-3 text-rose-400">WACC must exceed terminal growth (3%).</td></tr>;
                  let pv = 0;
                  const rows: { y: number; f: number; df: number; pv: number }[] = [];
                  for (let y = 1; y <= 5; y++) {
                    const f = fcf * Math.pow(1 + g, y);
                    const df = Math.pow(1 + wacc, y);
                    const p = f / df;
                    pv += p;
                    rows.push({ y, f, df, pv: p });
                  }
                  const f6 = fcf * Math.pow(1 + g, 5) * (1 + termG);
                  const tv = f6 / (wacc - termG);
                  const pvTv = tv / Math.pow(1 + wacc, 5);
                  const ev = pv + pvTv;
                  return (
                    <>
                      {rows.map((r) => (
                        <tr key={r.y} className="hover:bg-[#121a2d]">
                          <td className="py-2 px-3 text-zinc-300">Year {r.y} FCF</td>
                          {financials.map((f, i) => (
                            <td key={f.period} className="py-2 px-3 text-right text-zinc-200">
                              {i === 0 ? formatStatementMoney(r.f, sym) : <span className="text-zinc-600">—</span>}
                            </td>
                          ))}
                        </tr>
                      ))}
                      <tr className="hover:bg-[#121a2d]">
                        <td className="py-2 px-3 font-bold text-white">Enterprise Value (5Y + terminal)</td>
                        {financials.map((f, i) => (
                          <td key={f.period} className="py-2 px-3 text-right font-bold text-amber-300">
                            {i === 0 ? formatStatementMoney(ev, sym) : <span className="text-zinc-600">—</span>}
                          </td>
                        ))}
                      </tr>
                      <tr>
                        <td colSpan={financials.length + 1} className="py-2 px-3 text-[10px] text-zinc-500">
                          Terminal value {formatStatementMoney(tv, sym)} → PV {formatStatementMoney(pvTv, sym)}. Compare EV to market cap {security.marketCap} for a rough margin-of-safety read. Educational model — ignores net debt/cash, share count and cyclicality.
                        </td>
                      </tr>
                    </>
                  );
                })()}
              </>
            )}
          </tbody>
        </table>
        )}
      </PanelSection>
    </div>
  );
};
