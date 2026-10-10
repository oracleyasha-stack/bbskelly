import React, { useMemo } from 'react';
import { INDIA_GSEC_YIELD_CURVE, US_TREASURY_YIELD_CURVE } from '../../data/yieldCurve';
import { LineChart } from 'lucide-react';
import { PanelSection } from '../layout/PanelSection';
import { usePersistentState, isOneOf } from '../../hooks/usePersistentState';

type CurveId = 'US' | 'IN';

const CURVES: Record<CurveId, { title: string; short: string; points: typeof US_TREASURY_YIELD_CURVE }> = {
  US: { title: 'US TREASURY BENCHMARK YIELD CURVE', short: 'US', points: US_TREASURY_YIELD_CURVE },
  IN: { title: 'INDIA G-SEC BENCHMARK YIELD CURVE', short: 'IN', points: INDIA_GSEC_YIELD_CURVE },
};

export const YieldCurvePanel: React.FC = () => {
  const [curveId, setCurveId] = usePersistentState<CurveId>(
    'bloomberg-terminal:ycrv:curve:v1',
    'US',
    isOneOf(['US', 'IN'] as const),
  );
  const curve = CURVES[curveId].points;

  const y = (tenor: string): number => curve.find((p) => p.tenor === tenor)?.yield ?? NaN;
  const yPrior = (tenor: string, key: 'priorMonthYield' | 'priorYearYield'): number =>
    curve.find((p) => p.tenor === tenor)?.[key] ?? NaN;
  const spreads = useMemo(() => {
    const defs = [
      { label: '2Y / 10Y Spread', a: '2Y', b: '10Y' },
      { label: '3M / 10Y Spread', a: '3M', b: '10Y' },
      { label: '5Y / 30Y Spread', a: '5Y', b: '30Y' },
      { label: '10Y / 30Y Spread', a: '10Y', b: '30Y' },
    ];
    return defs.map((d) => {
      const cur = (y(d.b) - y(d.a)) * 100;
      const m1 = (yPrior(d.b, 'priorMonthYield') - yPrior(d.a, 'priorMonthYield')) * 100;
      const status = !Number.isFinite(cur) ? 'N/A' : cur < 0 ? 'INVERTED' : cur < 25 ? 'FLAT' : 'NORMAL';
      const fmt = (v: number): string => (isFinite(v) ? `${v >= 0 ? '+' : ''}${v.toFixed(0)} bps` : 'N/A');
      return { label: d.label, current: fmt(cur), priorMonth: fmt(m1), status };
    });
    // Recompute when the selected curve changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [curveId]);
  const svgWidth = 700;
  const svgHeight = 240;

  // Dynamic axis with padding so live moves outside the original
  // snapshot never clip outside the viewBox.
  const allYields = curve.flatMap((p) => [p.yield, p.priorMonthYield, p.priorYearYield]).filter((v) => Number.isFinite(v));
  const dataMin = allYields.length ? Math.min(...allYields) : 3.0;
  const dataMax = allYields.length ? Math.max(...allYields) : 5.8;
  const pad = Math.max(0.2, (dataMax - dataMin) * 0.15);
  const minYield = Math.floor((dataMin - pad) * 2) / 2;
  const maxYield = Math.ceil((dataMax + pad) * 2) / 2;

  // Grid ticks derived from the visible range so both US (~3-5.5%)
  // and India (~5.5-7%) curves get sensible axis labels.
  const gridLevels = useMemo(() => {
    const levels: number[] = [];
    for (let v = Math.ceil(minYield * 2) / 2; v <= maxYield + 1e-9; v += 0.5) {
      levels.push(+v.toFixed(1));
    }
    return levels;
  }, [minYield, maxYield]);

  const getX = (index: number) => (index / (curve.length - 1)) * (svgWidth - 80) + 40;
  const getY = (val: number) => {
    if (!Number.isFinite(val) || maxYield <= minYield) return svgHeight / 2;
    return svgHeight - ((val - minYield) / (maxYield - minYield)) * (svgHeight - 40) - 20;
  };

  // Path generators
  const currentPath = curve.map((p, i) => `${i === 0 ? 'M' : 'L'} ${getX(i)} ${getY(p.yield)}`).join(' ');
  const monthPriorPath = curve.map((p, i) => `${i === 0 ? 'M' : 'L'} ${getX(i)} ${getY(p.priorMonthYield)}`).join(' ');
  const yearPriorPath = curve.map((p, i) => `${i === 0 ? 'M' : 'L'} ${getX(i)} ${getY(p.priorYearYield)}`).join(' ');

  return (
    <div className="h-full w-full bg-[#080d16] text-zinc-300 font-mono text-xs flex flex-col p-2 overflow-y-auto space-y-2 select-none">
      {/* Header and Legend */}
      <div className="flex flex-wrap items-center justify-between bg-[#0e1422] p-1.5 rounded border border-[#1b253b] gap-2">
        <div className="flex items-center space-x-2">
          <LineChart className="w-4 h-4 text-amber-400" />
          <span className="font-bold text-amber-400 tracking-wider">{CURVES[curveId].title}</span>
        </div>

        <div className="flex items-center gap-2">
          {/* Country toggle */}
          <div className="flex items-center rounded border border-[#2b3a58] overflow-hidden text-[10px] font-bold" role="tablist" aria-label="Government bond curve country">
            {(['US', 'IN'] as CurveId[]).map((id) => (
              <button
                key={id}
                role="tab"
                aria-selected={curveId === id}
                onClick={() => setCurveId(id)}
                className={`px-2.5 py-1 transition-colors ${
                  curveId === id ? 'bg-amber-500 text-black' : 'text-zinc-400 hover:text-amber-300 hover:bg-[#162033]'
                }`}
              >
                {id === 'US' ? 'US' : 'INDIA'}
              </button>
            ))}
          </div>

          {/* Legend */}
          <div className="hidden sm:flex items-center space-x-3 text-[10px]">
            <span className="flex items-center gap-1.5 text-amber-400 font-bold">
              <span className="w-3 h-0.5 bg-amber-400 inline-block" /> CURRENT
            </span>
            <span className="flex items-center gap-1.5 text-cyan-400">
              <span className="w-3 h-0.5 bg-cyan-400 inline-block border-b border-dashed border-cyan-400" /> 1M PRIOR
            </span>
            <span className="flex items-center gap-1.5 text-purple-400">
              <span className="w-3 h-0.5 bg-purple-400 inline-block border-b border-dotted border-purple-400" /> 1Y PRIOR
            </span>
          </div>
        </div>
      </div>

      {/* Yield Curve SVG Graph */}
      <div className="bg-[#0b101c] p-2 rounded-lg border border-[#172238] relative">
        <svg viewBox={`0 0 ${svgWidth} ${svgHeight}`} className="w-full h-48 overflow-visible" preserveAspectRatio="none">
          {/* Horizontal Yield Grid */}
          {gridLevels.map((level) => {
            const yy = getY(level);
            return (
              <g key={level}>
                <line x1="40" y1={yy} x2={svgWidth - 20} y2={yy} stroke="#172238" strokeDasharray="3 3" />
                <text x="10" y={yy + 3} fill="#5a6b85" fontSize="9" fontFamily="monospace">
                  {level.toFixed(1)}%
                </text>
              </g>
            );
          })}

          {/* 1 Year Prior Curve (Purple) */}
          <path d={yearPriorPath} fill="none" stroke="#a855f7" strokeWidth="1.5" strokeDasharray="3 3" opacity="0.6" />

          {/* 1 Month Prior Curve (Cyan) */}
          <path d={monthPriorPath} fill="none" stroke="#00d4ff" strokeWidth="1.5" strokeDasharray="4 2" opacity="0.75" />

          {/* Current Yield Curve (Amber Solid) */}
          <path d={currentPath} fill="none" stroke="#ff9900" strokeWidth="2.5" />

          {/* Tenor points on Current Curve */}
          {curve.map((p, i) => {
            const x = getX(i);
            const yy = getY(p.yield);
            return (
              <g key={p.tenor}>
                <circle cx={x} cy={yy} r="3.5" fill="#ff9900" stroke="#000" strokeWidth="1.5" />
                <text x={x} y={svgHeight - 5} fill="#7888a3" fontSize="9" textAnchor="middle" fontFamily="monospace">
                  {p.tenor}
                </text>
                <text x={x} y={yy - 8} fill="#ffb74d" fontSize="9" textAnchor="middle" fontFamily="monospace" fontWeight="bold">
                  {p.yield.toFixed(2)}%
                </text>
              </g>
            );
          })}
        </svg>
      </div>

      {/* Yield Curve Spreads & Inversion Indicators (computed live from curve snapshot) */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        {spreads.map((sp) => (
          <div key={sp.label} className="bg-[#0e1422] p-1.5 rounded border border-[#1b253b] text-center space-y-0.5">
            <span className="text-[10px] text-zinc-400 font-semibold block">{sp.label}</span>
            <span className="text-base font-bold text-amber-300 block">{sp.current}</span>
            <div className="flex justify-between text-[9px] text-zinc-500 pt-1 border-t border-[#162033]">
              <span>1M: {sp.priorMonth}</span>
              <span
                className={`font-bold ${
                  sp.status === 'INVERTED'
                    ? 'text-rose-400'
                    : sp.status === 'FLAT'
                    ? 'text-emerald-400'
                    : sp.status === 'N/A'
                    ? 'text-zinc-500'
                    : 'text-zinc-400'
                }`}
              >
                {sp.status}
              </span>
            </div>
          </div>
        ))}
      </div>

      {/* Tenor Rates Data Table (own scroll region) */}
      <PanelSection
        title="TENOR RATES & DAILY MOVEMENTS"
        icon={<LineChart className="w-3 h-3" />}
        className="flex-1 min-h-0"
        bodyClassName="overflow-auto"
        actions={
          <span className="text-[9px] text-zinc-500">{curve.length} TENORS · {CURVES[curveId].short}</span>
        }
      >
        <table className="w-full text-left text-[10px]">
          <thead className="bg-[#0b101c] text-zinc-400 border-b border-[#182338] text-[10px]">
            <tr>
              <th className="py-1 px-2">TENOR</th>
              <th className="py-1 px-2 text-right">CURRENT</th>
              <th className="py-1 px-2 text-right">CHG (BPS)</th>
              <th className="py-1 px-2 text-right">1M PRIOR</th>
              <th className="py-1 px-2 text-right">1Y PRIOR</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#131b2c]">
            {curve.map((p) => {
              const isPositive = p.change >= 0;
              return (
                <tr key={p.tenor} className="hover:bg-[#121a2d]">
                  <td className="py-1 px-2 font-bold text-amber-400">{p.tenor}</td>
                  <td className="py-1 px-2 text-right font-bold text-white">{p.yield.toFixed(2)}%</td>
                  <td
                    className={`py-1 px-2 text-right font-semibold ${
                      isPositive ? 'text-emerald-400' : 'text-rose-400'
                    }`}
                  >
                    {isPositive ? '+' : ''}
                    {(p.change * 100).toFixed(0)} bps
                  </td>
                  <td className="py-1 px-2 text-right text-cyan-300">{p.priorMonthYield.toFixed(2)}%</td>
                  <td className="py-1 px-2 text-right text-purple-300">{p.priorYearYield.toFixed(2)}%</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </PanelSection>
    </div>
  );
};
