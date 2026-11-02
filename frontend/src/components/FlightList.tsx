import React, { useState, useMemo } from 'react';
import { LocalFlight } from '../db/db';
import {
  Clock,
  Moon,
  ArrowRight,
  ShieldCheck,
  UserCheck,
  Cloud,
  CloudOff,
  ChevronRight,
  Search,
  Filter,
  X,
  RotateCcw,
} from 'lucide-react';
import { getStoredPilotProfile } from './AuthModal';

interface FlightListProps {
  flights: LocalFlight[];
  onSelectFlight: (flight: LocalFlight) => void;
}

export const formatMinutesToHHMM = (totalMinutes: number): string => {
  const hours = Math.floor(totalMinutes / 60);
  const minutes = Math.round(totalMinutes % 60);
  return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
};

export const FlightList: React.FC<FlightListProps> = ({ flights, onSelectFlight }) => {
  // Search & Filters state
  const [searchQuery, setSearchQuery] = useState('');
  const [filterYear, setFilterYear] = useState('all');
  const [filterType, setFilterType] = useState('all');
  const [filterRole, setFilterRole] = useState('all');

  // Available filter options extracted from flights
  const availableYears = useMemo(() => {
    const set = new Set<string>();
    flights.forEach((f) => {
      if (f.date) set.add(f.date.substring(0, 4));
    });
    return Array.from(set).sort().reverse();
  }, [flights]);

  const availableTypes = useMemo(() => {
    const set = new Set<string>();
    flights.forEach((f) => {
      if (f.aircraftType) set.add(f.aircraftType.toUpperCase());
    });
    return Array.from(set).sort();
  }, [flights]);

  // Filtered flights subset
  const filteredFlights = useMemo(() => {
    const query = searchQuery.trim().toUpperCase();

    return flights.filter((f) => {
      // 1. Text search
      if (query) {
        const matchDep = f.depIcao.toUpperCase().includes(query);
        const matchArr = f.arrIcao.toUpperCase().includes(query);
        const matchReg = f.aircraftReg.toUpperCase().includes(query);
        const matchType = f.aircraftType.toUpperCase().includes(query);
        const matchRemarks = f.remarks ? f.remarks.toUpperCase().includes(query) : false;
        if (!matchDep && !matchArr && !matchReg && !matchType && !matchRemarks) {
          return false;
        }
      }

      // 2. Year filter
      if (filterYear !== 'all') {
        if (!f.date.startsWith(filterYear)) return false;
      }

      // 3. Aircraft type filter
      if (filterType !== 'all') {
        if (f.aircraftType.toUpperCase() !== filterType) return false;
      }

      // 4. Role filter
      if (filterRole !== 'all') {
        if (f.flightRole !== filterRole) return false;
      }

      return true;
    });
  }, [flights, searchQuery, filterYear, filterType, filterRole]);

  const isFiltered = searchQuery.trim() !== '' || filterYear !== 'all' || filterType !== 'all' || filterRole !== 'all';

  const resetFilters = () => {
    setSearchQuery('');
    setFilterYear('all');
    setFilterType('all');
    setFilterRole('all');
  };

  // Pilot career profile hours transfer
  const profile = getStoredPilotProfile();
  const previousMinutes = isFiltered ? 0 : Math.round((profile.previousTotalHours || 0) * 60);
  const previousPicMinutes = isFiltered ? 0 : Math.round((profile.previousPicHours || 0) * 60);
  const previousSicMinutes = isFiltered ? 0 : Math.round((profile.previousSicHours || 0) * 60);
  const previousNightMinutes = isFiltered ? 0 : Math.round((profile.previousNightHours || 0) * 60);
  const previousLandings = isFiltered ? 0 : profile.previousLandings || 0;

  // Aggregate statistics for the currently selected/filtered dataset
  const totalMinutes = filteredFlights.reduce((sum, f) => sum + (f.totalTimeMinutes || 0), 0);
  const nightMinutes = filteredFlights.reduce((sum, f) => sum + (f.nightTimeMinutes || 0), 0);
  const picMinutes = filteredFlights.reduce((sum, f) => sum + (f.picTimeMinutes || 0), 0);
  const sicMinutes = filteredFlights.reduce((sum, f) => sum + (f.sicTimeMinutes || 0), 0);
  const dayLandings = filteredFlights.reduce((sum, f) => sum + (f.landingsDay || 0), 0);
  const nightLandings = filteredFlights.reduce((sum, f) => sum + (f.landingsNight || 0), 0);

  const grandTotalMinutes = totalMinutes + previousMinutes;
  const grandPicMinutes = picMinutes + previousPicMinutes;
  const grandNightMinutes = nightMinutes + previousNightMinutes;
  const grandLandings = dayLandings + nightLandings + previousLandings;

  return (
    <div className="space-y-6">
      {/* Flight Time Summary Dashboard Cards (Dynamically computed from filtered results) */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4">
        <div className="bg-avionics-surface border border-avionics-border rounded-2xl p-3.5 sm:p-4 shadow-sm min-w-0 overflow-hidden">
          <div className="flex items-center justify-between text-avionics-muted text-2xs sm:text-xs font-semibold uppercase tracking-wider">
            <span className="truncate mr-1">Общий налёт</span>
            <Clock className="w-4 h-4 text-sky-400 shrink-0" />
          </div>
          <div className="mt-1.5 text-xl sm:text-2xl md:text-3xl font-extrabold font-mono text-sky-400 truncate">
            {formatMinutesToHHMM(grandTotalMinutes)}
          </div>
          <div className="text-xs text-avionics-muted mt-1 truncate">
            {isFiltered ? (
              <span className="text-amber-400 font-semibold truncate block">В выборке: {filteredFlights.length} рейсов</span>
            ) : previousMinutes > 0 ? (
              <span className="truncate block">Перенос: <strong className="text-slate-300 font-mono">+{profile.previousTotalHours}ч</strong> ({flights.length})</span>
            ) : (
              <span>Рейсов: <strong className="text-avionics-text font-mono">{flights.length}</strong></span>
            )}
          </div>
        </div>

        <div className="bg-avionics-surface border border-avionics-border rounded-2xl p-3.5 sm:p-4 shadow-sm min-w-0 overflow-hidden">
          <div className="flex items-center justify-between text-avionics-muted text-2xs sm:text-xs font-semibold uppercase tracking-wider">
            <span className="truncate mr-1">Ночной налёт</span>
            <Moon className="w-4 h-4 text-indigo-400 shrink-0" />
          </div>
          <div className="mt-1.5 text-xl sm:text-2xl md:text-3xl font-extrabold font-mono text-indigo-400 truncate">
            {formatMinutesToHHMM(grandNightMinutes)}
          </div>
          <div className="text-xs text-avionics-muted mt-1 truncate">
            Посадок ночью: <strong className="text-avionics-text font-mono">{nightLandings}</strong>
          </div>
        </div>

        <div className="bg-avionics-surface border border-avionics-border rounded-2xl p-3.5 sm:p-4 shadow-sm min-w-0 overflow-hidden">
          <div className="flex items-center justify-between text-avionics-muted text-2xs sm:text-xs font-semibold uppercase tracking-wider">
            <span className="truncate mr-1">PIC (КВС)</span>
            <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
          </div>
          <div className="mt-1.5 text-xl sm:text-2xl md:text-3xl font-extrabold font-mono text-emerald-400 truncate">
            {formatMinutesToHHMM(grandPicMinutes)}
          </div>
          <div className="text-xs text-avionics-muted mt-1 truncate">
            SIC: <strong className="text-avionics-text font-mono">{formatMinutesToHHMM(sicMinutes + previousSicMinutes)}</strong>
          </div>
        </div>

        <div className="bg-avionics-surface border border-avionics-border rounded-2xl p-3.5 sm:p-4 shadow-sm min-w-0 overflow-hidden">
          <div className="flex items-center justify-between text-avionics-muted text-2xs sm:text-xs font-semibold uppercase tracking-wider">
            <span className="truncate mr-1">Посадки</span>
            <UserCheck className="w-4 h-4 text-amber-400 shrink-0" />
          </div>
          <div className="mt-1.5 text-xl sm:text-2xl md:text-3xl font-extrabold font-mono text-amber-400 truncate">
            {grandLandings}
          </div>
          <div className="text-xs text-avionics-muted mt-1 truncate">
            День: {dayLandings} | Ночь: {nightLandings}
          </div>
        </div>
      </div>

      {/* Smart Search & Filter Toolbar */}
      <div className="p-4 bg-avionics-surface border border-avionics-border rounded-2xl space-y-3 shadow-sm">
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
          {/* Search Input */}
          <div className="relative flex-1">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-avionics-muted" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Поиск рейса (UUEE, OMDB, борт RA-73001, тип A320, заметки)..."
              className="w-full bg-avionics-card border border-avionics-border rounded-xl pl-9 pr-8 py-2 text-xs md:text-sm text-avionics-text placeholder:text-avionics-muted focus:outline-none focus:border-sky-500"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-avionics-muted hover:text-avionics-text"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Year Filter */}
          <div className="flex items-center space-x-1.5 bg-avionics-card border border-avionics-border rounded-xl px-2.5 py-1.5 text-xs">
            <span className="text-avionics-muted font-semibold">Год:</span>
            <select
              value={filterYear}
              onChange={(e) => setFilterYear(e.target.value)}
              className="bg-transparent text-avionics-text font-bold font-mono focus:outline-none cursor-pointer"
            >
              <option value="all" className="bg-avionics-surface text-avionics-text">Все года</option>
              {availableYears.map((y) => (
                <option key={y} value={y} className="bg-avionics-surface text-avionics-text">{y}</option>
              ))}
            </select>
          </div>

          {/* Aircraft Type Filter */}
          <div className="flex items-center space-x-1.5 bg-avionics-card border border-avionics-border rounded-xl px-2.5 py-1.5 text-xs">
            <span className="text-avionics-muted font-semibold">Тип ВС:</span>
            <select
              value={filterType}
              onChange={(e) => setFilterType(e.target.value)}
              className="bg-transparent text-avionics-text font-bold font-mono focus:outline-none cursor-pointer"
            >
              <option value="all" className="bg-avionics-surface text-avionics-text">Все типы</option>
              {availableTypes.map((t) => (
                <option key={t} value={t} className="bg-avionics-surface text-avionics-text">{t}</option>
              ))}
            </select>
          </div>

          {/* Role Filter */}
          <div className="flex items-center space-x-1.5 bg-avionics-card border border-avionics-border rounded-xl px-2.5 py-1.5 text-xs">
            <span className="text-avionics-muted font-semibold">Роль:</span>
            <select
              value={filterRole}
              onChange={(e) => setFilterRole(e.target.value)}
              className="bg-transparent text-avionics-text font-bold font-mono focus:outline-none cursor-pointer"
            >
              <option value="all" className="bg-avionics-surface text-avionics-text">Все роли</option>
              <option value="PIC" className="bg-avionics-surface text-avionics-text">PIC (КВС)</option>
              <option value="SIC" className="bg-avionics-surface text-avionics-text">SIC (2П)</option>
              <option value="PICUS" className="bg-avionics-surface text-avionics-text">PICUS</option>
              <option value="Dual" className="bg-avionics-surface text-avionics-text">Dual</option>
              <option value="Instructor" className="bg-avionics-surface text-avionics-text">Instructor</option>
            </select>
          </div>

          {/* Reset Filters button */}
          {isFiltered && (
            <button
              onClick={resetFilters}
              className="px-3 py-1.5 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/30 rounded-xl text-xs font-semibold flex items-center justify-center space-x-1 transition-colors cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Сброс</span>
            </button>
          )}
        </div>

        {/* Filter indicator banner if active */}
        {isFiltered && (
          <div className="flex items-center justify-between text-2xs text-avionics-muted pt-1">
            <span>
              Найдено: <strong className="text-avionics-text font-mono font-bold">{filteredFlights.length}</strong> из {flights.length} рейсов
            </span>
            <span className="font-mono text-sky-400 font-bold">
              Суммарный налёт в выборке: {formatMinutesToHHMM(totalMinutes)}
            </span>
          </div>
        )}
      </div>

      {/* Flight Log Entries Table / List */}
      <div className="bg-avionics-surface border border-avionics-border rounded-2xl overflow-hidden shadow-sm">
        <div className="px-5 py-3.5 border-b border-avionics-border flex items-center justify-between bg-avionics-card/50">
          <h2 className="text-sm md:text-base font-bold text-avionics-text flex items-center space-x-2">
            <span>Записи в лётной книжке</span>
            <span className="text-xs bg-avionics-surface text-avionics-muted px-2.5 py-0.5 rounded-full border border-avionics-border font-mono">
              {filteredFlights.length}
            </span>
          </h2>
          <div className="text-xs text-avionics-muted hidden sm:block">
            Нажмите на рейс для просмотра и редактирования
          </div>
        </div>

        {filteredFlights.length === 0 ? (
          <div className="p-12 text-center text-avionics-muted">
            <Clock className="w-10 h-10 mx-auto mb-3 opacity-30" />
            <p className="text-base font-semibold">
              {isFiltered ? 'По заданным фильтрам рейсов не найдено.' : 'Пока нет записей о полетах.'}
            </p>
            {isFiltered ? (
              <button
                onClick={resetFilters}
                className="mt-2 text-xs text-sky-400 font-bold hover:underline cursor-pointer"
              >
                Сбросить фильтры поиска
              </button>
            ) : (
              <p className="text-sm mt-1 text-slate-500">Нажмите «Новый рейс», чтобы внести свой первый полет.</p>
            )}
          </div>
        ) : (
          <div className="divide-y divide-avionics-border">
            {filteredFlights.map((flight) => (
              <div
                key={flight.id}
                onClick={() => onSelectFlight(flight)}
                className="p-3.5 sm:p-4 md:p-5 hover:bg-avionics-card/60 transition-colors cursor-pointer flex flex-col md:flex-row md:items-center justify-between gap-3 sm:gap-4 group min-w-0 overflow-hidden"
              >
                {/* Route & Date */}
                <div className="flex items-center space-x-3 sm:space-x-4 min-w-0 flex-1">
                  <div className="flex flex-col items-center justify-center bg-avionics-card border border-avionics-border rounded-xl px-2.5 sm:px-3 py-1.5 sm:py-2 text-center min-w-[54px] sm:min-w-[64px] shrink-0 shadow-sm">
                    <span className="text-[10px] sm:text-[11px] text-avionics-muted uppercase font-bold">
                      {new Date(flight.date).toLocaleDateString('ru-RU', { month: 'short' })}
                    </span>
                    <span className="text-lg sm:text-xl font-black font-mono text-avionics-text leading-tight">
                      {new Date(flight.date).getDate()}
                    </span>
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
                      <span className="font-mono font-black text-sky-400 text-base sm:text-lg md:text-xl tracking-wide group-hover:text-sky-300 transition-colors">
                        {flight.depIcao}
                      </span>
                      <ArrowRight className="w-3.5 sm:w-4 h-3.5 sm:h-4 text-avionics-muted shrink-0" />
                      <span className="font-mono font-black text-sky-400 text-base sm:text-lg md:text-xl tracking-wide group-hover:text-sky-300 transition-colors">
                        {flight.arrIcao}
                      </span>

                      <span className="text-2xs sm:text-xs font-mono font-semibold bg-avionics-card text-avionics-text px-1.5 sm:px-2 py-0.5 rounded-md border border-avionics-border truncate max-w-[150px]">
                        {flight.aircraftReg} ({flight.aircraftType})
                      </span>

                      {flight.flightRole === 'PIC' && (
                        <span className="text-2xs sm:text-xs uppercase font-extrabold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 px-1.5 sm:px-2 py-0.5 rounded-md shrink-0">
                          PIC
                        </span>
                      )}
                      {flight.flightRole === 'SIC' && (
                        <span className="text-2xs sm:text-xs uppercase font-extrabold bg-sky-500/15 text-sky-400 border border-sky-500/30 px-1.5 sm:px-2 py-0.5 rounded-md shrink-0">
                          SIC
                        </span>
                      )}
                      {flight.flightRole === 'PICUS' && (
                        <span className="text-2xs sm:text-xs uppercase font-extrabold bg-amber-500/15 text-amber-400 border border-amber-500/30 px-1.5 sm:px-2 py-0.5 rounded-md shrink-0">
                          PICUS
                        </span>
                      )}
                      {flight.flightRole === 'Observer' && (
                        <span className="text-2xs sm:text-xs uppercase font-extrabold bg-purple-500/15 text-purple-400 border border-purple-500/30 px-1.5 sm:px-2 py-0.5 rounded-md shrink-0">
                          OBSERVER
                        </span>
                      )}
                      {flight.flightRole === 'Instructor' && (
                        <span className="text-2xs sm:text-xs uppercase font-extrabold bg-rose-500/15 text-rose-400 border border-rose-500/30 px-1.5 sm:px-2 py-0.5 rounded-md shrink-0">
                          TRI
                        </span>
                      )}

                      {flight.flightHandling && (
                        <span className={`text-[10px] sm:text-[11px] font-bold px-1.5 py-0.5 rounded border shrink-0 ${
                          flight.flightHandling === 'PF'
                            ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                            : 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20'
                        }`}>
                          {flight.flightHandling}
                        </span>
                      )}

                      {flight.syncStatus === 'synced' ? (
                        <span title="Синхронизировано" className="text-emerald-400 shrink-0">
                          <Cloud className="w-3.5 sm:w-4 h-3.5 sm:h-4" />
                        </span>
                      ) : (
                        <span title="Ожидает синхронизации" className="text-amber-400 flex items-center space-x-1 text-2xs sm:text-xs bg-amber-500/15 px-1.5 sm:px-2 py-0.5 rounded-md border border-amber-500/30 shrink-0">
                          <CloudOff className="w-3 h-3" />
                          <span>Офлайн</span>
                        </span>
                      )}
                    </div>

                    <div className="text-xs sm:text-sm text-avionics-muted mt-1.5 flex flex-wrap items-center gap-x-2.5 gap-y-1 min-w-0">
                      <span className="shrink-0">
                        OUT <strong className="text-avionics-text font-mono font-bold">{flight.outTimeUtc}</strong> — IN{' '}
                        <strong className="text-avionics-text font-mono font-bold">{flight.inTimeUtc}</strong> UTC
                      </span>
                      {flight.remarks && (
                        <span className="text-avionics-muted italic break-words max-w-full">«{flight.remarks}»</span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Times & Chevron */}
                <div className="flex items-center justify-between md:justify-end space-x-3 sm:space-x-4 border-t md:border-t-0 pt-2 md:pt-0 border-avionics-border shrink-0">
                  <div className="text-left md:text-right shrink-0">
                    <div className="text-base sm:text-lg md:text-xl font-mono font-black text-avionics-text">
                      {formatMinutesToHHMM(flight.totalTimeMinutes)}
                    </div>
                    {flight.nightTimeMinutes > 0 && (
                      <div className="text-2xs sm:text-xs font-mono font-bold text-indigo-400 flex items-center md:justify-end space-x-1">
                        <Moon className="w-3 h-3 shrink-0" />
                        <span>Night: {formatMinutesToHHMM(flight.nightTimeMinutes)}</span>
                      </div>
                    )}
                  </div>

                  <div className="p-1 sm:p-2 text-avionics-muted group-hover:text-sky-400 transition-colors shrink-0">
                    <ChevronRight className="w-4 sm:w-5 h-4 sm:h-5" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
