import React, { useMemo, useState } from 'react';
import { ArrowDownRight, ArrowUpRight, BarChart3, Clock, Minus, Moon, Plane, ShieldCheck } from 'lucide-react';
import { LocalAirport, LocalFlight } from '../db/db';
import { YearReportView } from './YearReportView';
import { YearComparisonChart } from './YearComparisonChart';
import { formatMinutesToHHMM } from './FlightList';
import { getStoredPilotProfile } from './AuthModal';
import { computeTotals, fliesAsCommander } from '../utils/flightStats';
import { parseFlightDate, toDateKey } from '../utils/dates';
import {
  computeStatistics,
  DateRange,
  HeatmapDay,
  percentChange,
  Share,
  STATS_PERIOD_LABELS,
  StatsPeriod,
  TimeBucket,
  WEEKDAY_LABELS,
} from '../utils/statistics';

interface StatsDashboardProps {
  flights: LocalFlight[];
  airports: LocalAirport[];
  theme: 'dark' | 'light';
}

type StatsView = 'overview' | 'year' | 'compare';

const VIEW_LABELS: Record<StatsView, string> = { overview: 'Обзор', year: 'Итоги года', compare: 'Сравнение лет' };

const HEAT_LEVELS = 4;

const Card: React.FC<React.PropsWithChildren<{ title: string; className?: string }>> = ({ title, className = '', children }) => (
  <section className={`bg-avionics-surface border border-avionics-border rounded-2xl p-4 sm:p-5 min-w-0 ${className}`}>
    <h2 className="text-xs font-bold uppercase tracking-wider text-avionics-text mb-4">{title}</h2>
    {children}
  </section>
);

const Delta: React.FC<{ value: number | null; label: string }> = ({ value, label }) => {
  if (value === null) return <span className="text-2xs text-avionics-muted">{label}: нет данных</span>;
  const Icon = value > 0 ? ArrowUpRight : value < 0 ? ArrowDownRight : Minus;
  return (
    <span className="flex items-center space-x-0.5 text-2xs text-avionics-muted">
      <Icon className="w-3 h-3 shrink-0" />
      <span>
        {value > 0 ? '+' : ''}
        {value}% {label}
      </span>
    </span>
  );
};

const Kpi: React.FC<{ label: string; value: string; icon: React.ReactNode; change: number | null; changeLabel: string }> = ({
  label,
  value,
  icon,
  change,
  changeLabel,
}) => (
  <div className="p-3.5 sm:p-5 rounded-2xl bg-avionics-surface border border-avionics-border min-w-0">
    <div className="flex items-center justify-between text-2xs sm:text-xs font-semibold uppercase tracking-wider text-avionics-muted">
      <span className="truncate mr-1">{label}</span>
      <span className="text-sky-400 shrink-0">{icon}</span>
    </div>
    <div className="mt-1.5 text-xl sm:text-3xl font-black font-mono text-avionics-text truncate">{value}</div>
    <div className="mt-1">
      <Delta value={change} label={changeLabel} />
    </div>
  </div>
);

const TimelineChart: React.FC<{ buckets: TimeBucket[] }> = ({ buckets }) => {
  const [active, setActive] = useState<number | null>(null);
  const max = Math.max(...buckets.map((bucket) => bucket.dayMinutes + bucket.nightMinutes), 60);
  // Round the scale to whole tens of hours so the gridlines read cleanly
  const scaleHours = Math.max(10, Math.ceil(max / 60 / 10) * 10);
  const gridlines = [scaleHours, scaleHours / 2, 0];
  const activeBucket = active !== null ? buckets[active] : null;
  // Many daily bars: thinner gaps and a label on every few bars only
  const labelStep = Math.max(1, Math.ceil(buckets.length / 12));
  const denseGap = buckets.length > 24 ? 'gap-px sm:gap-0.5' : 'gap-1 sm:gap-2';

  return (
    <div>
      <div className="flex items-center gap-4 mb-3 text-xs text-avionics-muted">
        <span className="flex items-center space-x-1.5">
          <span className="w-2.5 h-2.5 rounded-sm" style={{ background: 'var(--chart-day)' }} />
          <span>День</span>
        </span>
        <span className="flex items-center space-x-1.5">
          <span className="w-2.5 h-2.5 rounded-sm" style={{ background: 'var(--chart-night)' }} />
          <span>Ночь</span>
        </span>
        <span className="ml-auto font-mono text-avionics-text min-h-[1rem]">
          {activeBucket
            ? `${activeBucket.label}: ${formatMinutesToHHMM(activeBucket.dayMinutes + activeBucket.nightMinutes)}, ночь ${formatMinutesToHHMM(activeBucket.nightMinutes)}, рейсов ${activeBucket.flights}`
            : ''}
        </span>
      </div>

      <div className="relative h-56 pl-9">
        {gridlines.map((hours) => (
          <div
            key={hours}
            className="absolute left-9 right-0 border-t border-avionics-border/60"
            style={{ bottom: `${(hours / scaleHours) * 100}%` }}
          >
            <span className="absolute -left-9 -translate-y-1/2 w-8 text-right text-2xs font-mono text-avionics-muted">{hours} ч</span>
          </div>
        ))}

        <div className={`relative h-full flex items-end ${denseGap}`} onMouseLeave={() => setActive(null)}>
          {buckets.map((bucket, index) => {
            const total = bucket.dayMinutes + bucket.nightMinutes;
            const toPercent = (minutes: number) => `${(minutes / 60 / scaleHours) * 100}%`;
            return (
              <button
                key={bucket.key}
                type="button"
                onMouseEnter={() => setActive(index)}
                onFocus={() => setActive(index)}
                onBlur={() => setActive(null)}
                aria-label={`${bucket.label}: ${formatMinutesToHHMM(total)}, ночь ${formatMinutesToHHMM(bucket.nightMinutes)}, рейсов ${bucket.flights}`}
                className={`relative flex-1 h-full flex flex-col justify-end items-stretch rounded-t-md cursor-default focus:outline-none ${
                  active === index ? 'bg-avionics-card/70' : ''
                }`}
              >
                {bucket.nightMinutes > 0 && (
                  <span
                    className="block rounded-t-[4px] mb-[2px]"
                    style={{ height: toPercent(bucket.nightMinutes), background: 'var(--chart-night)' }}
                  />
                )}
                {bucket.dayMinutes > 0 && (
                  <span
                    className={`block ${bucket.nightMinutes > 0 ? '' : 'rounded-t-[4px]'}`}
                    style={{ height: toPercent(bucket.dayMinutes), background: 'var(--chart-day)' }}
                  />
                )}
              </button>
            );
          })}
        </div>
      </div>

      <div className={`flex ${denseGap} pl-9 mt-1.5`}>
        {buckets.map((bucket, index) => (
          <span key={bucket.key} className="flex-1 min-w-0 text-center text-2xs text-avionics-muted whitespace-nowrap overflow-visible">
            {index % labelStep === 0 ? bucket.label : ''}
          </span>
        ))}
      </div>
    </div>
  );
};

const Heatmap: React.FC<{ weeks: Array<Array<HeatmapDay | null>>; maxMinutes: number }> = ({ weeks, maxMinutes }) => {
  const [active, setActive] = useState<HeatmapDay | null>(null);
  const level = (minutes: number) => (minutes === 0 || maxMinutes === 0 ? 0 : Math.ceil((minutes / maxMinutes) * HEAT_LEVELS));

  return (
    <div>
      <p className="text-xs font-mono text-avionics-text min-h-[1rem] mb-2">
        {active
          ? `${parseFlightDate(active.date).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' })}: ${
              active.flights > 0 ? `${formatMinutesToHHMM(active.minutes)}, рейсов ${active.flights}` : 'без полётов'
            }`
          : 'Наведите на день, чтобы увидеть налёт'}
      </p>
      {/* Weeks are columns: the grid flows top to bottom, then left to right, and stretches to the card */}
      <div className="overflow-x-auto pb-1">
        <div
          className="grid gap-[3px] min-w-[560px]"
          style={{ gridTemplateColumns: `auto repeat(${weeks.length}, minmax(0, 1fr))`, gridTemplateRows: 'repeat(7, auto)', gridAutoFlow: 'column' }}
          onMouseLeave={() => setActive(null)}
        >
          {WEEKDAY_LABELS.map((label, index) => (
            <span key={label} className="pr-1 text-[9px] leading-none self-center text-avionics-muted">
              {index % 2 === 0 ? label : ''}
            </span>
          ))}
          {weeks.flatMap((week, weekIndex) =>
            week.map((day, dayIndex) =>
              day ? (
                <span
                  key={day.date}
                  role="img"
                  aria-label={`${day.date}: ${formatMinutesToHHMM(day.minutes)}`}
                  onMouseEnter={() => setActive(day)}
                  className="aspect-square rounded-[2px]"
                  style={{ background: `var(--heat-${level(day.minutes)})` }}
                />
              ) : (
                <span key={`empty-${weekIndex}-${dayIndex}`} className="aspect-square" />
              )
            )
          )}
        </div>
      </div>
      <div className="flex items-center justify-end gap-1 mt-2 text-2xs text-avionics-muted">
        <span>Меньше</span>
        {Array.from({ length: HEAT_LEVELS + 1 }, (_, index) => (
          <span key={index} className="w-[11px] h-[11px] rounded-[2px]" style={{ background: `var(--heat-${index})` }} />
        ))}
        <span>Больше</span>
      </div>
    </div>
  );
};

const BarList: React.FC<{ items: Share[]; value?: 'minutes' | 'flights'; empty?: string }> = ({
  items,
  value = 'minutes',
  empty = 'Нет данных за период',
}) => {
  const max = Math.max(...items.map((item) => item[value]), 1);
  if (items.every((item) => item[value] === 0)) return <p className="text-xs text-avionics-muted">{empty}</p>;

  return (
    <ul className="space-y-2.5">
      {items.map((item) => (
        <li key={item.label}>
          <div className="flex items-baseline justify-between gap-2 text-xs">
            <span className="font-semibold text-avionics-text truncate">{item.label}</span>
            <span className="font-mono text-avionics-muted shrink-0">
              {value === 'minutes' ? formatMinutesToHHMM(item.minutes) : item.flights}
              {value === 'minutes' && <span className="ml-1.5">· {item.flights}</span>}
            </span>
          </div>
          <div className="mt-1 h-1.5 rounded-full bg-avionics-card overflow-hidden">
            <div className="h-full rounded-full" style={{ width: `${(item[value] / max) * 100}%`, background: 'var(--chart-day)' }} />
          </div>
        </li>
      ))}
    </ul>
  );
};

export const StatsDashboard: React.FC<StatsDashboardProps> = ({ flights, airports, theme }) => {
  const [view, setView] = useState<StatsView>('overview');
  const [period, setPeriod] = useState<StatsPeriod>('12m');
  const [customRange, setCustomRange] = useState<DateRange>(() => {
    const today = new Date();
    return { from: toDateKey(new Date(today.getFullYear(), today.getMonth() - 2, 1)), to: toDateKey(today) };
  });
  const stats = useMemo(
    () => computeStatistics(flights, period, undefined, customRange),
    [flights, period, customRange]
  );
  const career = useMemo(() => computeTotals(flights, getStoredPilotProfile()), [flights]);
  const commander = useMemo(() => fliesAsCommander(flights, getStoredPilotProfile()), [flights]);

  const { totals, previousTotals } = stats;
  const changeLabel = period === 'year' ? 'к прошлому году' : period === 'custom' ? 'к предыдущему периоду' : 'к прошлым 12 мес.';
  const change = (key: keyof typeof totals) => (previousTotals ? percentChange(totals[key], previousTotals[key]) : null);

  if (flights.length === 0) {
    return (
      <div className="p-12 text-center text-avionics-muted bg-avionics-surface border border-avionics-border rounded-2xl">
        <BarChart3 className="w-10 h-10 mx-auto mb-3 opacity-30" />
        <p className="text-sm font-semibold">Статистика появится после первого рейса</p>
      </div>
    );
  }

  return (
    <div className="space-y-3 sm:space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <h1 className="text-lg sm:text-2xl font-black text-avionics-text">Статистика</h1>
        <div role="tablist" aria-label="Раздел статистики" className="flex p-1 rounded-xl bg-avionics-surface border border-avionics-border text-xs font-semibold">
          {(Object.keys(VIEW_LABELS) as StatsView[]).map((value) => (
            <button
              key={value}
              type="button"
              role="tab"
              aria-selected={view === value}
              onClick={() => setView(value)}
              className={`flex-1 sm:flex-none px-3 py-1.5 rounded-lg transition-colors cursor-pointer ${
                view === value ? 'bg-avionics-card text-avionics-text font-bold shadow-sm' : 'text-avionics-muted hover:text-avionics-text'
              }`}
            >
              {VIEW_LABELS[value]}
            </button>
          ))}
        </div>
      </div>

      {view === 'year' && <YearReportView flights={flights} airports={airports} theme={theme} />}

      {view === 'compare' && (
        <Card title="Налёт по месяцам: сравнение лет">
          <YearComparisonChart flights={flights} />
        </Card>
      )}

      {view === 'overview' && (
      <>
      <div className="flex justify-end">
        <div role="group" aria-label="Период" className="flex p-1 rounded-xl bg-avionics-surface border border-avionics-border text-xs font-semibold">
          {(Object.keys(STATS_PERIOD_LABELS) as StatsPeriod[]).map((value) => (
            <button
              key={value}
              type="button"
              aria-pressed={period === value}
              onClick={() => setPeriod(value)}
              className={`flex-1 sm:flex-none px-3 py-1.5 rounded-lg transition-colors cursor-pointer ${
                period === value ? 'bg-sky-500 text-slate-950 font-bold' : 'text-avionics-muted hover:text-avionics-text'
              }`}
            >
              {STATS_PERIOD_LABELS[value]}
            </button>
          ))}
        </div>
      </div>

      {period === 'custom' && (
        <div className="flex flex-wrap items-end gap-3 p-3 bg-avionics-surface border border-avionics-border rounded-2xl">
          {(['from', 'to'] as const).map((field) => (
            <label key={field} className="text-[11px] font-semibold text-avionics-muted">
              {field === 'from' ? 'С даты' : 'По дату'}
              <input
                type="date"
                value={customRange[field]}
                onChange={(e) => e.target.value && setCustomRange({ ...customRange, [field]: e.target.value })}
                className="block mt-1 bg-avionics-card border border-avionics-border rounded-xl px-3 py-2 text-sm font-mono text-avionics-text focus:outline-none focus:border-sky-500"
              />
            </label>
          ))}
          <p className="text-2xs text-avionics-muted pb-2">Сравнение идёт с отрезком такой же длины перед выбранным.</p>
        </div>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <Kpi label="Налёт" value={formatMinutesToHHMM(totals.minutes)} icon={<Clock className="w-4 h-4" />} change={change('minutes')} changeLabel={changeLabel} />
        <Kpi label="Рейсов" value={String(totals.flights)} icon={<Plane className="w-4 h-4" />} change={change('flights')} changeLabel={changeLabel} />
        <Kpi label="Ночью" value={formatMinutesToHHMM(totals.nightMinutes)} icon={<Moon className="w-4 h-4" />} change={change('nightMinutes')} changeLabel={changeLabel} />
        {commander ? (
          <Kpi label="PIC" value={formatMinutesToHHMM(totals.picMinutes)} icon={<ShieldCheck className="w-4 h-4" />} change={change('picMinutes')} changeLabel={changeLabel} />
        ) : (
          <Kpi label="Второй пилот" value={formatMinutesToHHMM(totals.sicMinutes)} icon={<ShieldCheck className="w-4 h-4" />} change={change('sicMinutes')} changeLabel={changeLabel} />
        )}
      </div>

      <Card title={stats.granularity === 'year' ? 'Налёт по годам' : stats.granularity === 'day' ? 'Налёт по дням' : 'Налёт по месяцам'}>
        <TimelineChart buckets={stats.timeline} />
      </Card>

      <Card title={period === 'year' ? 'Активность за год' : period === 'custom' ? 'Активность до конца периода' : 'Активность за последние 12 месяцев'}>
        <Heatmap weeks={stats.heatmap.weeks} maxMinutes={stats.heatmap.maxMinutes} />
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3 sm:gap-4">
        <Card title="Типы ВС">
          <BarList items={stats.byType} />
        </Card>
        <Card title="Роль в экипаже">
          <BarList items={stats.byRole} />
        </Card>
        <Card title="PF и PM">
          <BarList items={stats.byHandling} empty="PF и PM не отмечены" />
        </Card>
        <Card title="Дни недели">
          <BarList items={stats.byWeekday} />
        </Card>
        <Card title="Аэродромы, рейсов">
          <BarList items={stats.airports} value="flights" />
        </Card>
        <Card title="Заходы, рейсов">
          <BarList items={stats.approaches} value="flights" empty="Тип захода не указан" />
        </Card>
      </div>

      <Card title="За всю карьеру, с перенесённым налётом">
        <dl className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            ['Общий налёт', formatMinutesToHHMM(career.totalMinutes)],
            ['Ночью', formatMinutesToHHMM(career.nightMinutes)],
            commander ? ['PIC', formatMinutesToHHMM(career.picMinutes)] : ['Второй пилот', formatMinutesToHHMM(career.sicMinutes)],
            ['Посадок', String(career.landings)],
          ].map(([label, value]) => (
            <div key={label} className="p-3 rounded-xl bg-avionics-card">
              <dt className="text-2xs text-avionics-muted">{label}</dt>
              <dd className="font-mono font-bold text-base text-avionics-text">{value}</dd>
            </div>
          ))}
        </dl>
      </Card>
      </>
      )}
    </div>
  );
};
