import React, { useMemo, useState } from 'react';
import { LocalFlight } from '../db/db';
import { availableYears, compareYears } from '../utils/analytics';
import { formatMinutesToHHMM } from './FlightList';

const MAX_YEARS = 4;
const MONTHS = ['янв', 'фев', 'мар', 'апр', 'май', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
const WIDTH = 640;
const HEIGHT = 240;
const PADDING = { left: 36, right: 56, top: 12, bottom: 24 };

/** Monthly flight time of recent years on one chart, the newest year in the first series color. */
export const YearComparisonChart: React.FC<{ flights: LocalFlight[] }> = ({ flights }) => {
  const years = useMemo(() => availableYears(flights).slice(0, MAX_YEARS), [flights]);
  const series = useMemo(() => compareYears(flights, years), [flights, years]);
  const [activeMonth, setActiveMonth] = useState<number | null>(null);

  if (series.length === 0) return <p className="text-sm text-avionics-muted">Нет данных для сравнения.</p>;

  const maxHours = Math.max(10, Math.ceil(Math.max(...series.flatMap((s) => s.months)) / 60 / 10) * 10);
  const x = (month: number) => PADDING.left + (month / 11) * (WIDTH - PADDING.left - PADDING.right);
  const y = (minutes: number) => PADDING.top + (1 - minutes / 60 / maxHours) * (HEIGHT - PADDING.top - PADDING.bottom);
  const now = new Date();
  // The current year stops at the current month instead of dropping to zero
  const lastMonthOf = (year: number) => (year === now.getFullYear() ? now.getMonth() : 11);

  return (
    <div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mb-2 text-xs text-avionics-muted">
        {series.map((s, index) => (
          <span key={s.year} className="flex items-center space-x-1.5">
            <span className="w-3 h-0.5 rounded-full" style={{ background: `var(--series-${index + 1})` }} />
            <span className="font-mono text-avionics-text">{s.year}</span>
          </span>
        ))}
        <span className="ml-auto font-mono text-avionics-text min-h-[1rem]">
          {activeMonth !== null &&
            `${MONTHS[activeMonth]}: ${series.map((s) => `${s.year} — ${formatMinutesToHHMM(s.months[activeMonth])}`).join(', ')}`}
        </span>
      </div>

      <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} className="w-full h-auto" role="img" aria-label="Налёт по месяцам разных лет" onMouseLeave={() => setActiveMonth(null)}>
        {[maxHours, maxHours / 2, 0].map((hours) => (
          <g key={hours}>
            <line x1={PADDING.left} x2={WIDTH - PADDING.right} y1={y(hours * 60)} y2={y(hours * 60)} stroke="var(--color-border)" strokeWidth={1} />
            <text x={PADDING.left - 6} y={y(hours * 60) + 3} textAnchor="end" fontSize={10} fill="var(--color-muted)">{hours} ч</text>
          </g>
        ))}
        {MONTHS.map((label, month) => (
          <text key={label} x={x(month)} y={HEIGHT - 6} textAnchor="middle" fontSize={10} fill="var(--color-muted)">{label}</text>
        ))}
        {activeMonth !== null && (
          <line x1={x(activeMonth)} x2={x(activeMonth)} y1={PADDING.top} y2={HEIGHT - PADDING.bottom} stroke="var(--color-muted)" strokeWidth={1} strokeDasharray="3 3" />
        )}

        {series.map((s, index) => {
          const last = lastMonthOf(s.year);
          const points = s.months.slice(0, last + 1).map((minutes, month) => `${x(month)},${y(minutes)}`).join(' ');
          return (
            <g key={s.year}>
              <polyline points={points} fill="none" stroke={`var(--series-${index + 1})`} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
              {activeMonth !== null && activeMonth <= last && (
                <circle cx={x(activeMonth)} cy={y(s.months[activeMonth])} r={4} fill={`var(--series-${index + 1})`} stroke="var(--color-surface)" strokeWidth={2} />
              )}
              {/* Direct label at the line end, so the year never depends on color alone */}
              <text x={x(last) + 6} y={y(s.months[last]) + 3} fontSize={10} fontWeight={700} fill="var(--color-text)">{s.year}</text>
            </g>
          );
        })}

        {MONTHS.map((label, month) => (
          <rect
            key={`hit-${label}`}
            x={x(month) - (WIDTH - PADDING.left - PADDING.right) / 22}
            y={0}
            width={(WIDTH - PADDING.left - PADDING.right) / 11}
            height={HEIGHT}
            fill="transparent"
            onMouseEnter={() => setActiveMonth(month)}
            onClick={() => setActiveMonth(month)}
          />
        ))}
      </svg>
    </div>
  );
};
