import React, { useMemo } from 'react';
import {
  Plane,
  Moon,
  ShieldCheck,
  UserCheck,
  Plus,
  CloudSun,
  Upload,
  Download,
  MapPin,
  Calendar,
  Clock,
  ArrowRight,
  ChevronRight,
  Compass,
  AlertCircle,
  CheckCircle2,
  TrendingUp,
} from 'lucide-react';
import { LocalFlight, LocalAirport } from '../db/db';
import { FlightMap } from './FlightMap';
import { formatMinutesToHHMM } from './FlightList';

interface PilotDashboardProps {
  flights: LocalFlight[];
  airports: LocalAirport[];
  currentUser: any;
  theme: 'dark' | 'light';
  onOpenNewFlight: () => void;
  onOpenWeather: () => void;
  onOpenImport: () => void;
  onOpenExport: () => void;
  onSelectFlight: (flight: LocalFlight) => void;
  onNavigateToFlights: () => void;
  onNavigateToMap?: () => void;
}

export const PilotDashboard: React.FC<PilotDashboardProps> = ({
  flights,
  airports,
  currentUser,
  theme,
  onOpenNewFlight,
  onOpenWeather,
  onOpenImport,
  onOpenExport,
  onSelectFlight,
  onNavigateToFlights,
  onNavigateToMap,
}) => {
  // Aggregate Pilot Metrics
  const stats = useMemo(() => {
    let totalMinutes = 0;
    let nightMinutes = 0;
    let picMinutes = 0;
    let sicMinutes = 0;
    let landingsDay = 0;
    let landingsNight = 0;

    flights.forEach((f) => {
      totalMinutes += f.totalTimeMinutes || 0;
      nightMinutes += f.nightTimeMinutes || 0;
      picMinutes += (f.picTimeMinutes || 0) + (f.picusTimeMinutes || 0);
      sicMinutes += f.sicTimeMinutes || 0;
      landingsDay += f.landingsDay || 0;
      landingsNight += f.landingsNight || 0;
    });

    // 90-day recency check (EASA FCL.060: 3 landings in preceding 90 days)
    const ninetyDaysAgo = new Date();
    ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

    let recencyDayLandings = 0;
    let recencyNightLandings = 0;

    flights.forEach((f) => {
      const flightDate = new Date(f.date);
      if (flightDate >= ninetyDaysAgo) {
        recencyDayLandings += f.landingsDay || 0;
        recencyNightLandings += f.landingsNight || 0;
      }
    });

    const isDayCurrent = recencyDayLandings >= 3;
    const isNightCurrent = recencyNightLandings >= 3;

    return {
      totalMinutes,
      nightMinutes,
      picMinutes,
      sicMinutes,
      totalLandings: landingsDay + landingsNight,
      landingsDay,
      landingsNight,
      recencyDayLandings,
      recencyNightLandings,
      isDayCurrent,
      isNightCurrent,
    };
  }, [flights]);

  // Recent 4 flights
  const recentFlights = useMemo(() => {
    return [...flights]
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
      .slice(0, 4);
  }, [flights]);

  const pilotName = currentUser?.full_name || currentUser?.email?.split('@')[0] || 'Пилот';

  return (
    <div className="space-y-6">
      {/* 1. Key Flight Statistics Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {/* Total Time */}
        <div className="p-3.5 sm:p-5 rounded-2xl bg-avionics-surface border border-avionics-border shadow-sm min-w-0 overflow-hidden">
          <div className="flex items-center justify-between text-avionics-muted text-2xs sm:text-xs font-semibold uppercase tracking-wider">
            <span className="truncate mr-1">Общий налёт</span>
            <Clock className="w-4 h-4 text-sky-400 shrink-0" />
          </div>
          <div className="mt-1.5 text-xl sm:text-2xl lg:text-3xl font-black font-mono text-sky-400 truncate">
            {formatMinutesToHHMM(stats.totalMinutes)}
          </div>
          <div className="text-2xs text-avionics-muted mt-1 truncate">Всего рейсов: {flights.length}</div>
        </div>

        {/* Night Time */}
        <div className="p-3.5 sm:p-5 rounded-2xl bg-avionics-surface border border-avionics-border shadow-sm min-w-0 overflow-hidden">
          <div className="flex items-center justify-between text-avionics-muted text-2xs sm:text-xs font-semibold uppercase tracking-wider">
            <span className="truncate mr-1">Ночной налёт</span>
            <Moon className="w-4 h-4 text-indigo-400 shrink-0" />
          </div>
          <div className="mt-1.5 text-xl sm:text-2xl lg:text-3xl font-black font-mono text-indigo-400 truncate">
            {formatMinutesToHHMM(stats.nightMinutes)}
          </div>
          <div className="text-2xs text-avionics-muted mt-1 truncate">
            {stats.totalMinutes > 0
              ? `${Math.round((stats.nightMinutes / stats.totalMinutes) * 100)}% от общего налёта`
              : '0%'}
          </div>
        </div>

        {/* PIC Time */}
        <div className="p-3.5 sm:p-5 rounded-2xl bg-avionics-surface border border-avionics-border shadow-sm min-w-0 overflow-hidden">
          <div className="flex items-center justify-between text-avionics-muted text-2xs sm:text-xs font-semibold uppercase tracking-wider">
            <span className="truncate mr-1">Командир (PIC)</span>
            <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
          </div>
          <div className="mt-1.5 text-xl sm:text-2xl lg:text-3xl font-black font-mono text-emerald-400 truncate">
            {formatMinutesToHHMM(stats.picMinutes)}
          </div>
          <div className="text-2xs text-avionics-muted mt-1 truncate">
            SIC: {formatMinutesToHHMM(stats.sicMinutes)}
          </div>
        </div>

        {/* Currency 90 Days */}
        <div className="p-3.5 sm:p-5 rounded-2xl bg-avionics-surface border border-avionics-border shadow-sm min-w-0 overflow-hidden">
          <div className="flex items-center justify-between text-avionics-muted text-2xs sm:text-xs font-semibold uppercase tracking-wider">
            <span className="truncate mr-1">Правило 90 дней</span>
            <UserCheck className="w-4 h-4 text-amber-400 shrink-0" />
          </div>
          <div className="mt-1.5 flex items-baseline space-x-1.5 truncate">
            <span className="text-xl sm:text-2xl lg:text-3xl font-black font-mono text-avionics-text">
              {stats.recencyDayLandings + stats.recencyNightLandings}
            </span>
            <span className="text-xs text-avionics-muted">посадок</span>
          </div>
          <div className="text-2xs mt-1 truncate">
            {stats.isDayCurrent ? (
              <span className="text-emerald-400 font-bold flex items-center truncate">
                <CheckCircle2 className="w-3 h-3 mr-1 shrink-0" /> Допуск активен ✓
              </span>
            ) : (
              <span className="text-amber-400 font-bold flex items-center truncate">
                <AlertCircle className="w-3 h-3 mr-1 shrink-0" /> Нужно 3 посадки
              </span>
            )}
          </div>
        </div>
      </div>

      {/* 2. Central Panoramic Interactive Flight Map */}
      <div className="bg-avionics-surface border border-avionics-border rounded-3xl p-4 sm:p-6 shadow-sm space-y-3 sm:space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div className="flex items-center space-x-2.5">
            <div className="p-2 bg-sky-500/10 border border-sky-500/20 rounded-xl text-sky-400 shrink-0">
              <MapPin className="w-4 sm:w-5 h-4 sm:h-5" />
            </div>
            <div className="min-w-0">
              <h2 className="text-xs sm:text-base font-bold uppercase tracking-wider text-avionics-text truncate">
                Панорамная карта полётов
              </h2>
              <p className="text-[11px] sm:text-2xs text-avionics-muted truncate">
                Ортодромические маршруты (Great Circle) и аэродромы
              </p>
            </div>
          </div>
          <div className="flex items-center space-x-2 self-start sm:self-auto">
            <span className="px-2.5 sm:px-3 py-1 rounded-xl bg-sky-500/10 border border-sky-500/20 text-sky-400 font-mono text-2xs sm:text-xs font-bold">
              {flights.length} маршрутов
            </span>
          </div>
        </div>

        <FlightMap
          flights={flights}
          airports={airports}
          theme={theme}
          variant="dashboard"
          onOpenFullMap={onNavigateToMap}
        />
      </div>

      {/* 3. Recent Flights Section (Full Width) */}
      <div className="bg-avionics-surface border border-avionics-border rounded-3xl p-6 shadow-sm space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-avionics-border">
          <h3 className="text-sm font-bold uppercase tracking-wider text-avionics-text flex items-center space-x-2">
            <Calendar className="w-4 h-4 text-sky-400" />
            <span>Недавние рейсы в лётной книжке</span>
          </h3>
          <button
            onClick={onNavigateToFlights}
            className="text-xs text-sky-400 hover:text-sky-300 font-semibold flex items-center space-x-1"
          >
            <span>Все рейсы ({flights.length})</span>
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>

        {recentFlights.length === 0 ? (
          <div className="p-12 text-center text-avionics-muted space-y-3">
            <Clock className="w-10 h-10 mx-auto opacity-30 text-sky-400" />
            <p className="text-sm">Записей о рейсах пока нет.</p>
            <button
              onClick={onOpenNewFlight}
              className="px-4 py-2 bg-sky-500 hover:bg-sky-400 text-slate-950 font-bold text-xs rounded-xl shadow transition-all"
            >
              Внести первый рейс
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {recentFlights.map((f) => (
              <div
                key={f.id}
                onClick={() => onSelectFlight(f)}
                className="p-4 rounded-2xl bg-avionics-card hover:bg-avionics-surface active:bg-avionics-surface border border-avionics-border transition-all cursor-pointer flex flex-col justify-between group hover:border-sky-500/40 hover:shadow-md space-y-3"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-1.5">
                    <span className="font-mono font-black text-sky-400 text-base group-hover:text-sky-300 transition-colors">
                      {f.depIcao}
                    </span>
                    <ArrowRight className="w-3.5 h-3.5 text-avionics-muted" />
                    <span className="font-mono font-black text-sky-400 text-base group-hover:text-sky-300 transition-colors">
                      {f.arrIcao}
                    </span>
                  </div>
                  <span className="text-2xs font-mono text-avionics-muted">
                    {f.aircraftReg}
                  </span>
                </div>

                <div className="flex items-center justify-between text-2xs text-avionics-muted">
                  <span>
                    {new Date(f.date).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })} • {f.aircraftType}
                  </span>
                  <span className="text-emerald-400 font-bold font-mono">{f.flightRole}</span>
                </div>

                <div className="pt-2 border-t border-avionics-border/60 flex items-center justify-between">
                  <div className="font-mono font-bold text-sm text-avionics-text">
                    {formatMinutesToHHMM(f.totalTimeMinutes)}
                  </div>
                  {f.nightTimeMinutes > 0 ? (
                    <div className="text-2xs text-indigo-400 font-mono">
                      Ночь: {formatMinutesToHHMM(f.nightTimeMinutes)}
                    </div>
                  ) : f.approachType ? (
                    <div className="text-[10px] text-sky-400 font-mono truncate max-w-[120px]">
                      {f.approachType}
                    </div>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
