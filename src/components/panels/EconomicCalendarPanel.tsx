import React from 'react';
import { INITIAL_ECONOMIC_EVENTS, ECO_AS_OF } from '../../data/economic';
import { Calendar } from 'lucide-react';
import { PanelSection } from '../layout/PanelSection';
import { audioService } from '../../services/audioService';
import { usePersistentState, isOneOf } from '../../hooks/usePersistentState';

/** 'YYYY-MM-DD' → '25 SEP 2026'. Falls back to the raw string when malformed. */
const formatEventDate = (iso: string): string => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return iso || 'N/A';
  const months = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
  const mi = Number(m[2]) - 1;
  if (mi < 0 || mi > 11) return iso;
  return `${m[3]} ${months[mi]} ${m[1]}`;
};

export const EconomicCalendarPanel: React.FC = () => {
  const [filter, setFilter] = usePersistentState<'ALL' | 'HIGH' | 'US' | 'IN' | 'EU'>(
    'bloomberg-terminal:eco:filter:v1',
    'ALL',
    isOneOf(['ALL', 'HIGH', 'US', 'IN', 'EU'] as const),
  );

  const filteredEvents = INITIAL_ECONOMIC_EVENTS.filter((ev) => {
    if (filter === 'HIGH') return ev.importance === 'HIGH';
    if (filter === 'US') return ev.countryCode === 'US';
    if (filter === 'IN') return ev.countryCode === 'IN' || ev.country.includes('India');
    if (filter === 'EU') return ['EU', 'DE', 'GB', 'FR'].includes(ev.countryCode);
    return true;
  });

  return (
    <div className="h-full w-full min-h-0 bg-[#080d16] text-zinc-300 font-mono text-xs flex flex-col gap-2 p-2 select-none">
      <div className="flex flex-wrap items-center justify-between bg-[#0e1422] p-2 rounded border border-[#1b253b] gap-2 shrink-0">
        <div className="flex items-center space-x-2">
          <Calendar className="w-4 h-4 text-amber-400" />
          <span className="font-bold text-amber-400 tracking-wider">GLOBAL ECONOMIC RELEASES & CALENDAR (ECO)</span>
        </div>

        <div className="flex space-x-1 bg-[#101726] border border-[#212d44] p-0.5 rounded text-[10px]">
          {(
            [
              { id: 'ALL', label: 'ALL' },
              { id: 'HIGH', label: 'HIGH IMPACT' },
              { id: 'US', label: 'UNITED STATES' },
              { id: 'IN', label: 'INDIA' },
              { id: 'EU', label: 'EUROPE' },
            ] as const
          ).map((tab) => (
            <button
              key={tab.id}
              onClick={() => {
                audioService.playKeyClick();
                setFilter(tab.id);
              }}
              className={`px-2 py-0.5 rounded font-bold transition-colors ${
                filter === tab.id ? 'bg-amber-500 text-black' : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      <PanelSection
        title={`SCHEDULED & RELEASED ECONOMIC DATA — ${filter} (${filteredEvents.length} RELEASES)`}
        icon={<Calendar className="w-3 h-3" />}
        className="flex-1 min-h-0"
        bodyClassName="overflow-auto"
        actions={
          <span className="text-[9px] text-zinc-500">
            {filteredEvents.length} of {INITIAL_ECONOMIC_EVENTS.length} EVENTS · CURATED SNAPSHOT · AS OF{' '}
            {ECO_AS_OF} · SEEDED DEMO DATA
          </span>
        }
      >
        <table className="w-full text-left text-[11px]">
          <thead className="bg-[#0b101c] text-zinc-400 border-b border-[#182338] sticky top-0 z-10 text-[10px]">
            <tr>
              <th className="py-2 px-3">DATE</th>
              <th className="py-2 px-3">TIME (UTC)</th>
              <th className="py-2 px-3">COUNTRY</th>
              <th className="py-2 px-3">EVENT</th>
              <th className="py-2 px-3 text-center">IMPACT</th>
              <th className="py-2 px-3 text-right">ACTUAL</th>
              <th className="py-2 px-3 text-right">SURVEY</th>
              <th className="py-2 px-3 text-right">PRIOR</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#131b2c]">
            {filteredEvents.length === 0 ? (
              <tr>
                <td colSpan={8} className="py-8 px-3 text-center">
                  <p className="font-bold text-zinc-300">NO {filter} RELEASES IN THIS VIEW</p>
                  <p className="text-[10px] text-zinc-500 mt-1">Try a different filter to see scheduled data.</p>
                </td>
              </tr>
            ) : (
            filteredEvents.map((ev) => (
              <tr key={ev.id} className="hover:bg-[#121a2d]">
                <td className="py-2 px-3 font-semibold text-cyan-300 whitespace-nowrap">{formatEventDate(ev.date)}</td>
                <td className="py-2 px-3 font-semibold text-amber-400">{ev.time}</td>
                <td className="py-2 px-3 text-zinc-300 font-medium">
                  <span className="px-1.5 py-0.5 rounded bg-[#131b2c] border border-zinc-800 text-[10px] mr-1.5 font-bold text-cyan-300">
                    {ev.countryCode}
                  </span>
                  {ev.country}
                </td>
                <td className="py-2 px-3 font-semibold text-white">{ev.event}</td>
                <td className="py-2 px-3 text-center">
                  <span
                    className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${
                      ev.importance === 'HIGH'
                        ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                        : 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                    }`}
                  >
                    {ev.importance}
                  </span>
                </td>
                <td
                  className={`py-2 px-3 text-right font-bold ${
                    ev.impact === 'positive'
                      ? 'text-emerald-400'
                      : ev.impact === 'negative'
                      ? 'text-rose-400'
                      : 'text-zinc-200'
                  }`}
                >
                  {ev.actual || '--'}
                </td>
                <td className="py-2 px-3 text-right text-zinc-400">{ev.survey}</td>
                <td className="py-2 px-3 text-right text-zinc-500">{ev.prior}</td>
              </tr>
            )))}
          </tbody>
        </table>
      </PanelSection>
    </div>
  );
};
