import React, { useState, useMemo } from 'react';
import { LocalFlight } from '../db/db';
import { formatMinutesToHHMM } from './FlightList';
import { BarChart2, PieChart, TrendingUp, Calendar, Moon, Sun, Filter } from 'lucide-react';

interface FlightChartsProps {
  flights: LocalFlight[];
}

export const FlightCharts: React.FC<FlightChartsProps> = ({ flights }) => {
  const [period, setPeriod] = useState<'6m' | '12m' | 'all'>('12m');
  const [selectedTypeFilter, setSelectedTypeFilter] = useState<string>('ALL');
  const [hoveredBar, setHoveredBar] = useState<{
    key: string;
    label: string;
    dayMins: number;
    nightMins: number;
    totalMins: number;
    count: number;
  } | null>(null);

  // Available aircraft types for filter
  const aircraftTypes = useMemo(() => {
    const set = new Set<string>();
    flights.forEach((f) => {
      if (f.aircraftType) set.add(f.aircraftType.toUpperCase());
    });
    return ['ALL', ...Array.from(set).sort()];
  }, [flights]);

  // Filtered flights
  const filteredFlights = useMemo(() => {
    if (selectedTypeFilter === 'ALL') return flights;
    return flights.filter((f) => f.aircraftType.toUpperCase() === selectedTypeFilter);
  }, [flights, selectedTypeFilter]);

  // Aggregate monthly data
  const monthlyData = useMemo(() => {
    const map = new Map<
      string,
      { label: string; dayMins: number; nightMins: number; totalMins: number; count: number }
    >();

    const now = new Date();
    const limitMonths = period === '6m' ? 6 : period === '12m' ? 12 : 999;

    // Build month slots
    const months: string[] = [];
    if (limitMonths <= 24) {
      for (let i = limitMonths - 1; i >= 0; i--) {
        const d = new Date(Date.UTC(now.getFullYear(), now.getMonth() - i, 1));
        const key = d.toISOString().substring(0, 7);
        const label = d.toLocaleDateString('ru-RU', { month: 'short', year: '2-digit', timeZone: 'UTC' }).replace('.', '');
        months.push(key);
        map.set(key, { label, dayMins: 0, nightMins: 0, totalMins: 0, count: 0 });
      }
    }

    // Populate data
    filteredFlights.forEach((f) => {
      const key = f.date.substring(0, 7);
      if (!map.has(key)) {
        if (period === 'all') {
          const [y, m] = key.split('-');
          const d = new Date(Date.UTC(Number(y), Number(m) - 1, 1));
          const label = d.toLocaleDateString('ru-RU', { month: 'short', year: '2-digit', timeZone: 'UTC' }).replace('.', '');
          map.set(key, { label, dayMins: 0, nightMins: 0, totalMins: 0, count: 0 });
        } else {
          return; // Skip flights outside recent window
        }
      }

      const item = map.get(key)!;
      const total = f.totalTimeMinutes || 0;
      const night = f.nightTimeMinutes || 0;
      const day = Math.max(0, total - night);

      item.dayMins += day;
      item.nightMins += night;
      item.totalMins += total;
      item.count += 1;
    });

    const result = Array.from(map.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([key, data]) => ({ key, ...data }));

    return period === 'all' ? result : result.slice(-limitMonths);
  }, [filteredFlights, period]);

  const maxTotalMins = useMemo(() => {
    const max = Math.max(...monthlyData.map((d) => d.totalMins), 0);
    return max > 0 ? max : 60; // fallback to 1 hour
  }, [monthlyData]);

  // Crew Role Distribution (Donut Chart)
  const roleData = useMemo(() => {
    let pic = 0;
    let sic = 0;
    let picus = 0;
    let dual = 0;
    let instructor = 0;
    let observer = 0;

    filteredFlights.forEach((f) => {
      const role = f.flightRole || 'SIC';
      const mins = f.totalTimeMinutes || 0;
      if (role === 'PIC') pic += mins;
      else if (role === 'SIC') sic += mins;
      else if (role === 'PICUS') picus += mins;
      else if (role === 'Dual') dual += mins;
      else if (role === 'Instructor') instructor += mins;
      else if (role === 'Observer') observer += mins;
    });

    const total = pic + sic + picus + dual + instructor + observer;
    return [
      { role: 'PIC (КВС)', mins: pic, color: '#38bdf8' },
      { role: 'SIC (2-й пилот)', mins: sic, color: '#818cf8' },
      { role: 'PICUS (Наблюдение)', mins: picus, color: '#34d399' },
      { role: 'Dual (Обучение)', mins: dual, color: '#c084fc' },
      { role: 'Instructor (Инструктор)', mins: instructor, color: '#fb923c' },
      { role: 'Observer (Стажер)', mins: observer, color: '#94a3b8' },
    ].filter((item) => item.mins > 0 || total === 0);
  }, [filteredFlights]);

  const totalRoleMins = useMemo(() => {
    return roleData.reduce((acc, curr) => acc + curr.mins, 0);
  }, [roleData]);

  // Donut SVG segments
  const donutSegments = useMemo(() => {
    if (totalRoleMins === 0) {
      return [{
        role: 'Нет данных',
        mins: 0,
        color: '#334155',
        pct: 100,
        strokeDasharray: '0 999',
        strokeDashoffset: 0,
      }];
    }

    let accumulatedPct = 0;
    const radius = 40;
    const center = 50;
    const circumference = 2 * Math.PI * radius;

    return roleData.map((item) => {
      const pct = (item.mins / totalRoleMins) * 100;
      const strokeDasharray = `${(pct / 100) * circumference} ${circumference}`;
      const strokeDashoffset = -((accumulatedPct / 100) * circumference);
      accumulatedPct += pct;

      return {
        ...item,
        pct,
        strokeDasharray,
        strokeDashoffset,
      };
    });
  }, [roleData, totalRoleMins]);

  // Handling distribution: PF vs PM
  const handlingData = useMemo(() => {
    let pf = 0;
    let pm = 0;
    filteredFlights.forEach((f) => {
      const h = f.flightHandling || 'PF';
      const m = f.totalTimeMinutes || 0;
      if (h === 'PF') pf += m;
      else pm += m;
    });
    const sum = pf + pm;
    return {
      pf,
      pm,
      pfPct: sum > 0 ? (pf / sum) * 100 : 50,
      pmPct: sum > 0 ? (pm / sum) * 100 : 50,
      total: sum,
    };
  }, [filteredFlights]);

  return (
    <div className="space-y-6">
      {/* Controls: Period and Aircraft Type Filter */}
      <div className="flex flex-wrap items-center justify-between gap-3 p-4 bg-avionics-surface border border-avionics-border rounded-2xl">
        <div className="flex items-center space-x-2">
          <BarChart2 className="w-5 h-5 text-sky-400" />
          <h3 className="text-sm font-bold text-avionics-text">Интерактивные графики налёта</h3>
        </div>

        <div className="flex items-center space-x-2">
          {/* Aircraft Type Filter */}
          <div className="flex items-center space-x-1.5 bg-avionics-card border border-avionics-border rounded-xl px-2.5 py-1 text-xs">
            <Filter className="w-3.5 h-3.5 text-avionics-muted" />
            <select
              value={selectedTypeFilter}
              onChange={(e) => setSelectedTypeFilter(e.target.value)}
              className="bg-transparent text-avionics-text font-mono font-bold focus:outline-none cursor-pointer"
            >
              {aircraftTypes.map((type) => (
                <option key={type} value={type} className="bg-avionics-surface text-avionics-text">
                  {type === 'ALL' ? 'Все типы ВС' : type}
                </option>
              ))}
            </select>
          </div>

          {/* Period selector */}
          <div className="flex rounded-xl bg-avionics-card border border-avionics-border p-0.5 text-xs font-semibold">
            <button
              onClick={() => setPeriod('6m')}
              className={`px-3 py-1 rounded-lg transition-colors ${
                period === '6m' ? 'bg-sky-500 text-slate-950 font-bold' : 'text-avionics-muted hover:text-avionics-text'
              }`}
            >
              6 мес
            </button>
            <button
              onClick={() => setPeriod('12m')}
              className={`px-3 py-1 rounded-lg transition-colors ${
                period === '12m' ? 'bg-sky-500 text-slate-950 font-bold' : 'text-avionics-muted hover:text-avionics-text'
              }`}
            >
              12 мес
            </button>
            <button
              onClick={() => setPeriod('all')}
              className={`px-3 py-1 rounded-lg transition-colors ${
                period === 'all' ? 'bg-sky-500 text-slate-950 font-bold' : 'text-avionics-muted hover:text-avionics-text'
              }`}
            >
              Всё время
            </button>
          </div>
        </div>
      </div>

      {/* Main Bar Chart: Monthly Flight Time (Day vs Night) */}
      <div className="p-5 bg-avionics-surface border border-avionics-border rounded-2xl shadow-sm space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <TrendingUp className="w-4 h-4 text-sky-400" />
            <span className="text-xs font-bold uppercase tracking-wider text-avionics-muted">
              Динамика налёта по месяцам (День / Ночь)
            </span>
          </div>

          <div className="flex items-center space-x-4 text-xs font-medium">
            <div className="flex items-center space-x-1.5">
              <span className="w-2.5 h-2.5 rounded-sm bg-sky-400"></span>
              <span className="text-avionics-muted">Дневной</span>
            </div>
            <div className="flex items-center space-x-1.5">
              <span className="w-2.5 h-2.5 rounded-sm bg-indigo-500"></span>
              <span className="text-avionics-muted">Ночной</span>
            </div>
          </div>
        </div>

        {/* Bar Chart Area */}
        <div className="relative pt-6 pb-2">
          {/* Hover Tooltip Overlay */}
          {hoveredBar && (
            <div className="absolute top-0 right-4 bg-avionics-card border border-sky-500/40 rounded-xl px-3 py-1.5 shadow-xl text-xs z-10 flex items-center space-x-3 pointer-events-none">
              <div className="font-bold text-sky-400 font-mono">{hoveredBar.label}</div>
              <div className="text-avionics-muted">
                Итого: <strong className="text-avionics-text font-mono">{formatMinutesToHHMM(hoveredBar.totalMins)}</strong>
              </div>
              <div className="text-avionics-muted flex items-center space-x-1">
                <Sun className="w-3 h-3 text-amber-400" />
                <span className="font-mono text-avionics-text">{formatMinutesToHHMM(hoveredBar.dayMins)}</span>
              </div>
              <div className="text-avionics-muted flex items-center space-x-1">
                <Moon className="w-3 h-3 text-indigo-400" />
                <span className="font-mono text-avionics-text">{formatMinutesToHHMM(hoveredBar.nightMins)}</span>
              </div>
              <div className="text-avionics-muted">({hoveredBar.count} рейсов)</div>
            </div>
          )}

          {/* SVG Bar Chart */}
          <div className="h-56 flex items-end justify-between gap-1 sm:gap-2 px-2 border-b border-avionics-border">
            {monthlyData.map((d) => {
              const totalHeightPct = maxTotalMins > 0 ? (d.totalMins / maxTotalMins) * 100 : 0;
              const nightPct = d.totalMins > 0 ? (d.nightMins / d.totalMins) * 100 : 0;
              const dayPct = 100 - nightPct;

              return (
                <div
                  key={d.key}
                  onMouseEnter={() => setHoveredBar(d)}
                  onMouseLeave={() => setHoveredBar(null)}
                  className="flex-1 flex flex-col items-center h-full justify-end group cursor-pointer relative"
                >
                  {/* Total time label on top of bar */}
                  {d.totalMins > 0 && (
                    <span className="text-[10px] font-mono text-sky-400 opacity-0 group-hover:opacity-100 transition-opacity mb-1 font-bold">
                      {formatMinutesToHHMM(d.totalMins)}
                    </span>
                  )}

                  {/* Stacked Bar */}
                  <div
                    style={{ height: `${Math.max(totalHeightPct, d.totalMins > 0 ? 4 : 0)}%` }}
                    className="w-full max-w-[42px] rounded-t-md overflow-hidden flex flex-col-reverse transition-all duration-300 group-hover:brightness-125 group-hover:scale-x-105"
                  >
                    {/* Day segment */}
                    <div
                      style={{ height: `${dayPct}%` }}
                      className="w-full bg-sky-400/90 transition-all"
                    />
                    {/* Night segment */}
                    <div
                      style={{ height: `${nightPct}%` }}
                      className="w-full bg-indigo-500/90 transition-all"
                    />
                  </div>
                </div>
              );
            })}
          </div>

          {/* Month labels below bars */}
          <div className="flex justify-between gap-1 sm:gap-2 px-2 pt-2">
            {monthlyData.map((d) => (
              <div
                key={d.key}
                className="flex-1 text-center text-[10px] font-mono text-avionics-muted truncate"
              >
                {d.label}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Two Column Grid: Roles Donut + Pilot Flying vs Monitoring */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Roles Donut Chart */}
        <div className="p-5 bg-avionics-surface border border-avionics-border rounded-2xl shadow-sm space-y-4">
          <div className="flex items-center space-x-2">
            <PieChart className="w-4 h-4 text-sky-400" />
            <h4 className="text-xs font-bold uppercase tracking-wider text-avionics-muted">
              Распределение ролей в экипаже
            </h4>
          </div>

          <div className="flex items-center justify-between gap-6 pt-2">
            {/* SVG Donut */}
            <div className="relative w-36 h-36 flex-shrink-0">
              <svg viewBox="0 0 100 100" className="w-full h-full -rotate-90 transform">
                {/* Background circle */}
                <circle
                  cx="50"
                  cy="50"
                  r="40"
                  fill="transparent"
                  stroke="#1e293b"
                  strokeWidth="12"
                />
                {/* Segment circles */}
                {donutSegments.map((seg, idx) => (
                  <circle
                    key={idx}
                    cx="50"
                    cy="50"
                    r="40"
                    fill="transparent"
                    stroke={seg.color}
                    strokeWidth="12"
                    strokeDasharray={seg.strokeDasharray}
                    strokeDashoffset={seg.strokeDashoffset}
                    className="transition-all duration-500 ease-out"
                  />
                ))}
              </svg>

              {/* Center Total Hours */}
              <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                <span className="text-[10px] text-avionics-muted uppercase font-bold">Налёт</span>
                <span className="text-sm font-black font-mono text-sky-400">
                  {formatMinutesToHHMM(totalRoleMins)}
                </span>
              </div>
            </div>

            {/* Legend */}
            <div className="flex-1 space-y-2 text-xs">
              {roleData.map((item) => {
                const pct = totalRoleMins > 0 ? (item.mins / totalRoleMins) * 100 : 0;
                return (
                  <div key={item.role} className="flex items-center justify-between">
                    <div className="flex items-center space-x-2">
                      <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: item.color }} />
                      <span className="text-avionics-muted">{item.role}</span>
                    </div>
                    <div className="space-x-2 font-mono">
                      <strong className="text-avionics-text">{formatMinutesToHHMM(item.mins)}</strong>
                      <span className="text-slate-500 text-[11px]">({pct.toFixed(0)}%)</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Handling: Pilot Flying (PF) vs Pilot Monitoring (PM) */}
        <div className="p-5 bg-avionics-surface border border-avionics-border rounded-2xl shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-bold uppercase tracking-wider text-avionics-muted">
              Пилотирование (Pilot Flying vs Pilot Monitoring)
            </h4>
            <span className="text-xs font-mono text-avionics-muted">
              Всего: {formatMinutesToHHMM(handlingData.total)}
            </span>
          </div>

          <div className="space-y-4 pt-2">
            {/* Split Progress Bar */}
            <div className="h-5 w-full bg-avionics-card rounded-xl overflow-hidden flex p-0.5 border border-avionics-border">
              <div
                style={{ width: `${handlingData.pfPct}%` }}
                className="h-full bg-gradient-to-r from-emerald-500 to-teal-400 rounded-l-lg transition-all flex items-center justify-center text-[10px] font-bold text-slate-950"
              >
                {handlingData.pfPct > 15 && `PF ${handlingData.pfPct.toFixed(0)}%`}
              </div>
              <div
                style={{ width: `${handlingData.pmPct}%` }}
                className="h-full bg-gradient-to-r from-indigo-500 to-blue-500 rounded-r-lg transition-all flex items-center justify-center text-[10px] font-bold text-white"
              >
                {handlingData.pmPct > 15 && `PM ${handlingData.pmPct.toFixed(0)}%`}
              </div>
            </div>

            {/* Detail Stats */}
            <div className="grid grid-cols-2 gap-3 pt-2">
              <div className="p-3 bg-avionics-card border border-avionics-border rounded-xl">
                <div className="text-[11px] font-bold text-emerald-400 uppercase">Pilot Flying (PF)</div>
                <div className="text-lg font-black font-mono text-avionics-text mt-0.5">
                  {formatMinutesToHHMM(handlingData.pf)}
                </div>
                <div className="text-[10px] text-avionics-muted mt-0.5">{handlingData.pfPct.toFixed(1)}% налёта</div>
              </div>

              <div className="p-3 bg-avionics-card border border-avionics-border rounded-xl">
                <div className="text-[11px] font-bold text-indigo-400 uppercase">Pilot Monitoring (PM)</div>
                <div className="text-lg font-black font-mono text-avionics-text mt-0.5">
                  {formatMinutesToHHMM(handlingData.pm)}
                </div>
                <div className="text-[10px] text-avionics-muted mt-0.5">{handlingData.pmPct.toFixed(1)}% налёта</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
