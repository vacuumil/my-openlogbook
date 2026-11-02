import React from 'react';
import { LocalFlight } from '../db/db';
import { formatMinutesToHHMM } from './FlightList';
import { FlightCharts } from './FlightCharts';
import { Clock, Moon, Award, Plane, MapPin, Calendar, Compass, ShieldCheck, UserCheck } from 'lucide-react';

import { getStoredPilotProfile } from './AuthModal';

interface StatsDashboardProps {
  flights: LocalFlight[];
}

export const StatsDashboard: React.FC<StatsDashboardProps> = ({ flights }) => {
  const profile = getStoredPilotProfile();
  const previousMinutes = Math.round((profile.previousTotalHours || 0) * 60);
  const previousPicMinutes = Math.round((profile.previousPicHours || 0) * 60);
  const previousSicMinutes = Math.round((profile.previousSicHours || 0) * 60);
  const previousNightMinutes = Math.round((profile.previousNightHours || 0) * 60);
  const previousLandings = profile.previousLandings || 0;

  const totalMinutes = flights.reduce((sum, f) => sum + (f.totalTimeMinutes || 0), 0);
  const nightMinutes = flights.reduce((sum, f) => sum + (f.nightTimeMinutes || 0), 0);
  const ifrMinutes = flights.reduce((sum, f) => sum + (f.ifrTimeMinutes || 0), 0);
  const picMinutes = flights.reduce((sum, f) => sum + (f.picTimeMinutes || 0), 0);
  const sicMinutes = flights.reduce((sum, f) => sum + (f.sicTimeMinutes || 0), 0);
  const picusMinutes = flights.reduce((sum, f) => sum + (f.picusTimeMinutes || 0), 0);
  const dualMinutes = flights.reduce((sum, f) => sum + (f.dualTimeMinutes || 0), 0);
  const instructorMinutes = flights.reduce((sum, f) => sum + (f.instructorTimeMinutes || 0), 0);

  const grandTotalMinutes = totalMinutes + previousMinutes;
  const grandNightMinutes = nightMinutes + previousNightMinutes;

  // PF vs PM vs Observer statistics
  const pfFlights = flights.filter((f) => (f.flightHandling || 'PF') === 'PF');
  const pmFlights = flights.filter((f) => f.flightHandling === 'PM');
  const observerFlights = flights.filter((f) => f.flightHandling === 'Observer' || f.flightRole === 'Observer');
  const reliefFlights = flights.filter((f) => f.flightHandling === 'Relief');

  const pfMinutes = pfFlights.reduce((sum, f) => sum + (f.totalTimeMinutes || 0), 0);
  const pmMinutes = pmFlights.reduce((sum, f) => sum + (f.totalTimeMinutes || 0), 0);
  const observerMinutes = observerFlights.reduce((sum, f) => sum + (f.totalTimeMinutes || 0), 0);
  const reliefMinutes = reliefFlights.reduce((sum, f) => sum + (f.totalTimeMinutes || 0), 0);

  const dayLandings = flights.reduce((sum, f) => sum + (f.landingsDay || 0), 0);
  const nightLandings = flights.reduce((sum, f) => sum + (f.landingsNight || 0), 0);
  const totalLandings = dayLandings + nightLandings;
  const grandLandings = totalLandings + previousLandings;

  const avgFlightMinutes = flights.length > 0 ? Math.round(totalMinutes / flights.length) : 0;

  // Breakdown by aircraft type
  const typeMap = new Map<string, { minutes: number; count: number }>();
  flights.forEach((f) => {
    const type = f.aircraftType.toUpperCase() || 'UNKNOWN';
    const curr = typeMap.get(type) || { minutes: 0, count: 0 };
    typeMap.set(type, {
      minutes: curr.minutes + (f.totalTimeMinutes || 0),
      count: curr.count + 1,
    });
  });

  const aircraftStats = Array.from(typeMap.entries())
    .map(([type, data]) => ({
      type,
      minutes: data.minutes,
      count: data.count,
      pct: totalMinutes > 0 ? (data.minutes / totalMinutes) * 100 : 0,
    }))
    .sort((a, b) => b.minutes - a.minutes);

  // Breakdown by visited airports
  const airportFreq = new Map<string, number>();
  flights.forEach((f) => {
    airportFreq.set(f.depIcao, (airportFreq.get(f.depIcao) || 0) + 1);
    airportFreq.set(f.arrIcao, (airportFreq.get(f.arrIcao) || 0) + 1);
  });

  const topAirports = Array.from(airportFreq.entries())
    .map(([icao, visits]) => ({ icao, visits }))
    .sort((a, b) => b.visits - a.visits)
    .slice(0, 6);

  // Monthly breakdown (last 6 months)
  const monthMap = new Map<string, number>();
  flights.forEach((f) => {
    const monthKey = f.date.substring(0, 7);
    monthMap.set(monthKey, (monthMap.get(monthKey) || 0) + (f.totalTimeMinutes || 0));
  });

  const monthlyStats = Array.from(monthMap.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .slice(-6);

  const maxMonthMinutes = Math.max(...monthlyStats.map((s) => s[1]), 1);

  // Breakdown by approach types
  const approachMap = new Map<string, number>();
  let totalApproaches = 0;
  flights.forEach((f) => {
    if (f.approachType && f.approachType.trim()) {
      const app = f.approachType.trim();
      approachMap.set(app, (approachMap.get(app) || 0) + 1);
      totalApproaches += 1;
    }
  });

  const approachStats = Array.from(approachMap.entries())
    .map(([type, count]) => ({
      type,
      count,
      pct: totalApproaches > 0 ? (count / totalApproaches) * 100 : 0,
    }))
    .sort((a, b) => b.count - a.count);

  return (
    <div className="space-y-6">
      {/* Top Level Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="p-5 bg-avionics-surface border border-avionics-border rounded-2xl shadow-sm">
          <div className="flex items-center justify-between text-xs text-avionics-muted font-bold uppercase tracking-wider">
            <span>Общий налёт</span>
            <Clock className="w-4 h-4 text-sky-400" />
          </div>
          <div className="text-2xl md:text-3xl font-black font-mono text-sky-400 mt-2">
            {formatMinutesToHHMM(grandTotalMinutes)}
          </div>
          <div className="text-xs text-avionics-muted mt-1 truncate">
            {previousMinutes > 0 ? (
              <span>Перенос: +{profile.previousTotalHours}ч (рейсов: {flights.length})</span>
            ) : (
              <span>Всего рейсов: {flights.length}</span>
            )}
          </div>
        </div>

        <div className="p-5 bg-avionics-surface border border-avionics-border rounded-2xl shadow-sm">
          <div className="flex items-center justify-between text-xs text-avionics-muted font-bold uppercase tracking-wider">
            <span>Ночной налёт</span>
            <Moon className="w-4 h-4 text-indigo-400" />
          </div>
          <div className="text-2xl md:text-3xl font-black font-mono text-indigo-400 mt-2">
            {formatMinutesToHHMM(grandNightMinutes)}
          </div>
          <div className="text-xs text-avionics-muted mt-1">
            {totalMinutes > 0 ? `${Math.round((nightMinutes / totalMinutes) * 100)}% от текущих рейсов` : '0%'}
          </div>
        </div>

        <div className="p-5 bg-avionics-surface border border-avionics-border rounded-2xl shadow-sm">
          <div className="flex items-center justify-between text-xs text-avionics-muted font-bold uppercase tracking-wider">
            <span>Всего посадок</span>
            <Award className="w-4 h-4 text-amber-400" />
          </div>
          <div className="text-2xl md:text-3xl font-black font-mono text-amber-400 mt-2">
            {grandLandings}
          </div>
          <div className="text-xs text-avionics-muted mt-1">
            День: {dayLandings} | Ночь: {nightLandings}
          </div>
        </div>

        <div className="p-5 bg-avionics-surface border border-avionics-border rounded-2xl shadow-sm">
          <div className="flex items-center justify-between text-xs text-avionics-muted font-bold uppercase tracking-wider">
            <span>Средний рейс</span>
            <Compass className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="text-2xl md:text-3xl font-black font-mono text-emerald-400 mt-2">
            {formatMinutesToHHMM(avgFlightMinutes)}
          </div>
          <div className="text-xs text-avionics-muted mt-1">IFR: {formatMinutesToHHMM(ifrMinutes)}</div>
        </div>
      </div>

      {/* PF vs PM (Pilot Flying vs Pilot Monitoring) Section */}
      <div className="p-5 bg-avionics-surface border border-avionics-border rounded-2xl shadow-sm space-y-4">
        <h3 className="text-sm font-bold uppercase tracking-wider text-avionics-muted flex items-center space-x-2">
          <UserCheck className="w-4 h-4 text-emerald-400" />
          <span>Статус пилотирования (PF vs PM Legs)</span>
        </h3>

        <div className="h-4 w-full bg-avionics-card rounded-full overflow-hidden flex">
          {pfMinutes > 0 && (
            <div
              style={{ width: `${(pfMinutes / (totalMinutes || 1)) * 100}%` }}
              className="bg-emerald-500 h-full"
              title={`PF: ${formatMinutesToHHMM(pfMinutes)}`}
            />
          )}
          {pmMinutes > 0 && (
            <div
              style={{ width: `${(pmMinutes / (totalMinutes || 1)) * 100}%` }}
              className="bg-sky-500 h-full"
              title={`PM: ${formatMinutesToHHMM(pmMinutes)}`}
            />
          )}
          {observerMinutes > 0 && (
            <div
              style={{ width: `${(observerMinutes / (totalMinutes || 1)) * 100}%` }}
              className="bg-purple-500 h-full"
              title={`Observer: ${formatMinutesToHHMM(observerMinutes)}`}
            />
          )}
          {reliefMinutes > 0 && (
            <div
              style={{ width: `${(reliefMinutes / (totalMinutes || 1)) * 100}%` }}
              className="bg-amber-500 h-full"
              title={`Relief: ${formatMinutesToHHMM(reliefMinutes)}`}
            />
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 text-sm">
          <div className="p-3 bg-avionics-card rounded-xl border border-avionics-border flex items-center justify-between">
            <div>
              <div className="text-xs text-avionics-muted font-bold">PF (Пилотирующий)</div>
              <div className="text-base font-black font-mono text-emerald-400 mt-0.5">
                {formatMinutesToHHMM(pfMinutes)}
              </div>
            </div>
            <div className="text-[11px] font-mono text-avionics-muted">{pfFlights.length} рейс.</div>
          </div>

          <div className="p-3 bg-avionics-card rounded-xl border border-avionics-border flex items-center justify-between">
            <div>
              <div className="text-xs text-avionics-muted font-bold">PM (Мониторящий)</div>
              <div className="text-base font-black font-mono text-sky-400 mt-0.5">
                {formatMinutesToHHMM(pmMinutes)}
              </div>
            </div>
            <div className="text-[11px] font-mono text-avionics-muted">{pmFlights.length} рейс.</div>
          </div>

          <div className="p-3 bg-avionics-card rounded-xl border border-avionics-border flex items-center justify-between">
            <div>
              <div className="text-xs text-avionics-muted font-bold">Observer (Наблюдатель)</div>
              <div className="text-base font-black font-mono text-purple-400 mt-0.5">
                {formatMinutesToHHMM(observerMinutes)}
              </div>
            </div>
            <div className="text-[11px] font-mono text-avionics-muted">{observerFlights.length} рейс.</div>
          </div>

          <div className="p-3 bg-avionics-card rounded-xl border border-avionics-border flex items-center justify-between">
            <div>
              <div className="text-xs text-avionics-muted font-bold">Relief (Сменный)</div>
              <div className="text-base font-black font-mono text-amber-400 mt-0.5">
                {formatMinutesToHHMM(reliefMinutes)}
              </div>
            </div>
            <div className="text-[11px] font-mono text-avionics-muted">{reliefFlights.length} рейс.</div>
          </div>
        </div>
      </div>

      {/* Interactive Charts Section */}
      <FlightCharts flights={flights} />

      {/* Role Distribution Bar */}
      <div className="p-5 bg-avionics-surface border border-avionics-border rounded-2xl shadow-sm space-y-4">
        <h3 className="text-sm font-bold uppercase tracking-wider text-avionics-muted flex items-center space-x-2">
          <ShieldCheck className="w-4 h-4 text-sky-400" />
          <span>Распределение налёта по функциям экипажа (EASA / FAA)</span>
        </h3>

        <div className="h-4 w-full bg-avionics-card rounded-full overflow-hidden flex">
          {picMinutes > 0 && (
            <div
              style={{ width: `${(picMinutes / (totalMinutes || 1)) * 100}%` }}
              className="bg-emerald-500 h-full"
              title={`PIC: ${formatMinutesToHHMM(picMinutes)}`}
            />
          )}
          {sicMinutes > 0 && (
            <div
              style={{ width: `${(sicMinutes / (totalMinutes || 1)) * 100}%` }}
              className="bg-sky-500 h-full"
              title={`SIC: ${formatMinutesToHHMM(sicMinutes)}`}
            />
          )}
          {picusMinutes > 0 && (
            <div
              style={{ width: `${(picusMinutes / (totalMinutes || 1)) * 100}%` }}
              className="bg-amber-500 h-full"
              title={`PICUS: ${formatMinutesToHHMM(picusMinutes)}`}
            />
          )}
          {dualMinutes > 0 && (
            <div
              style={{ width: `${(dualMinutes / (totalMinutes || 1)) * 100}%` }}
              className="bg-purple-500 h-full"
              title={`Dual: ${formatMinutesToHHMM(dualMinutes)}`}
            />
          )}
          {instructorMinutes > 0 && (
            <div
              style={{ width: `${(instructorMinutes / (totalMinutes || 1)) * 100}%` }}
              className="bg-rose-500 h-full"
              title={`Instructor: ${formatMinutesToHHMM(instructorMinutes)}`}
            />
          )}
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
          <div className="flex items-center space-x-2">
            <div className="w-3 h-3 rounded-full bg-emerald-500"></div>
            <div>
              <span className="text-avionics-muted text-xs">PIC (КВС): </span>
              <strong className="font-mono text-avionics-text">{formatMinutesToHHMM(picMinutes)}</strong>
            </div>
          </div>
          <div className="flex items-center space-x-2">
            <div className="w-3 h-3 rounded-full bg-sky-500"></div>
            <div>
              <span className="text-avionics-muted text-xs">SIC (2-й пилот): </span>
              <strong className="font-mono text-avionics-text">{formatMinutesToHHMM(sicMinutes)}</strong>
            </div>
          </div>
          <div className="flex items-center space-x-2">
            <div className="w-3 h-3 rounded-full bg-amber-500"></div>
            <div>
              <span className="text-avionics-muted text-xs">PICUS: </span>
              <strong className="font-mono text-avionics-text">{formatMinutesToHHMM(picusMinutes)}</strong>
            </div>
          </div>
          <div className="flex items-center space-x-2">
            <div className="w-3 h-3 rounded-full bg-purple-500"></div>
            <div>
              <span className="text-avionics-muted text-xs">Dual: </span>
              <strong className="font-mono text-avionics-text">{formatMinutesToHHMM(dualMinutes)}</strong>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Aircraft Type Breakdown */}
        <div className="p-5 bg-avionics-surface border border-avionics-border rounded-2xl shadow-sm space-y-4">
          <h3 className="text-sm font-bold uppercase tracking-wider text-avionics-muted flex items-center space-x-2">
            <Plane className="w-4 h-4 text-sky-400" />
            <span>Налёт по типам воздушных судов (Aircraft Types)</span>
          </h3>

          <div className="space-y-3">
            {aircraftStats.map((item) => (
              <div key={item.type} className="space-y-1">
                <div className="flex items-center justify-between text-sm">
                  <span className="font-mono font-bold text-sky-400">{item.type}</span>
                  <div className="space-x-3 text-xs">
                    <span className="text-avionics-muted">{item.count} рейс(ов)</span>
                    <strong className="font-mono text-avionics-text text-sm">
                      {formatMinutesToHHMM(item.minutes)} ({item.pct.toFixed(1)}%)
                    </strong>
                  </div>
                </div>
                <div className="h-2 w-full bg-avionics-card rounded-full overflow-hidden">
                  <div
                    style={{ width: `${item.pct}%` }}
                    className="h-full bg-gradient-to-r from-sky-500 to-indigo-500 rounded-full"
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Monthly Trend */}
        <div className="p-5 bg-avionics-surface border border-avionics-border rounded-2xl shadow-sm space-y-4">
          <h3 className="text-sm font-bold uppercase tracking-wider text-avionics-muted flex items-center space-x-2">
            <Calendar className="w-4 h-4 text-sky-400" />
            <span>Динамика налёта по месяцам</span>
          </h3>

          <div className="space-y-3">
            {monthlyStats.length === 0 ? (
              <div className="text-xs text-avionics-muted py-8 text-center">Нет данных</div>
            ) : (
              monthlyStats.map(([month, minutes]) => {
                const pct = (minutes / maxMonthMinutes) * 100;
                return (
                  <div key={month} className="space-y-1">
                    <div className="flex items-center justify-between text-sm">
                      <span className="font-mono text-xs text-avionics-muted">{month}</span>
                      <strong className="font-mono text-avionics-text">{formatMinutesToHHMM(minutes)}</strong>
                    </div>
                    <div className="h-2 w-full bg-avionics-card rounded-full overflow-hidden">
                      <div style={{ width: `${pct}%` }} className="h-full bg-teal-400 rounded-full" />
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>

      {/* Top Visited Airports */}
      <div className="p-5 bg-avionics-surface border border-avionics-border rounded-2xl shadow-sm space-y-4">
        <h3 className="text-sm font-bold uppercase tracking-wider text-avionics-muted flex items-center space-x-2">
          <MapPin className="w-4 h-4 text-sky-400" />
          <span>Самые частые аэродромы</span>
        </h3>

        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3">
          {topAirports.map((item) => (
            <div
              key={item.icao}
              className="p-3 bg-avionics-card border border-avionics-border rounded-xl text-center"
            >
              <div className="text-lg font-bold font-mono text-sky-400">{item.icao}</div>
              <div className="text-xs text-avionics-muted mt-0.5">{item.visits} операций</div>
            </div>
          ))}
        </div>
      </div>

      {/* Approach Types Breakdown */}
      <div className="p-5 bg-avionics-surface border border-avionics-border rounded-2xl shadow-sm space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold uppercase tracking-wider text-avionics-muted flex items-center space-x-2">
            <Compass className="w-4 h-4 text-sky-400" />
            <span>Статистика заходов на посадку (Approach Types)</span>
          </h3>
          <span className="text-xs text-avionics-muted font-mono">
            Всего с заходом: {totalApproaches}
          </span>
        </div>

        {approachStats.length === 0 ? (
          <div className="text-xs text-avionics-muted py-6 text-center">
            Заходы на посадку пока не указаны в рейсах. Вы можете выбрать вид захода при внесении или редактировании рейса (ILS CAT I/II/III, RNP, Visual и др.).
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {approachStats.map((item) => (
              <div
                key={item.type}
                className="p-3 bg-avionics-card border border-avionics-border rounded-xl space-y-2"
              >
                <div className="flex items-center justify-between text-xs">
                  <span className="font-mono font-bold text-sky-400 truncate mr-2">{item.type}</span>
                  <div className="space-x-1.5 shrink-0">
                    <span className="font-mono font-bold text-avionics-text">{item.count}</span>
                    <span className="text-avionics-muted text-2xs">({item.pct.toFixed(0)}%)</span>
                  </div>
                </div>
                <div className="h-1.5 w-full bg-avionics-surface rounded-full overflow-hidden">
                  <div
                    style={{ width: `${item.pct}%` }}
                    className="h-full bg-gradient-to-r from-sky-500 to-emerald-400 rounded-full"
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
