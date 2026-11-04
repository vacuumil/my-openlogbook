import React, { useEffect, useMemo, useState } from 'react';
import { LocalFlight } from '../db/db';
import {
  AlertCircle,
  ArrowRight,
  ChevronRight,
  Clock,
  Cloud,
  CloudOff,
  Download,
  Moon,
  ShieldCheck,
  UserCheck,
  MonitorPlay,
} from 'lucide-react';
import { getStoredPilotProfile } from './AuthModal';
import { FlightFilterBar } from './FlightFilterBar';
import { parseFlightDate } from '../utils/dates';
import { EMPTY_FILTERS, FlightFilters, FlightSort, hasActiveFilters, sortFlights } from '../utils/flightFilters';
import { computeTotals } from '../utils/flightStats';
import { entryTypeOf, isDraft, ENTRY_TYPE_LABELS } from '../utils/entries';

const PAGE_SIZE = 50;

const SORT_LABELS: Record<FlightSort, string> = {
  'date-desc': 'Сначала новые',
  'date-asc': 'Сначала старые',
  'time-desc': 'По налёту',
  route: 'По маршруту',
};

interface FlightListProps {
  flights: LocalFlight[];
  filteredFlights: LocalFlight[];
  filters: FlightFilters;
  onFiltersChange: (filters: FlightFilters) => void;
  onSelectFlight: (flight: LocalFlight) => void;
  onExportSelection: () => void;
  onAddSession: () => void;
}

export const formatMinutesToHHMM = (totalMinutes: number): string => {
  const hours = Math.floor(totalMinutes / 60);
  const minutes = Math.round(totalMinutes % 60);
  return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
};

export const FlightList: React.FC<FlightListProps> = ({
  flights,
  filteredFlights,
  filters,
  onFiltersChange,
  onSelectFlight,
  onExportSelection,
  onAddSession,
}) => {
  const [sort, setSort] = useState<FlightSort>('date-desc');
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  useEffect(() => setVisibleCount(PAGE_SIZE), [filteredFlights, sort]);

  const isFiltered = hasActiveFilters(filters);
  const resetFilters = () => onFiltersChange(EMPTY_FILTERS);
  const sortedFlights = useMemo(() => sortFlights(filteredFlights, sort), [filteredFlights, sort]);
  const visibleFlights = sortedFlights.slice(0, visibleCount);

  // Transferred hours belong to the whole logbook, never to a filtered selection
  const profile = getStoredPilotProfile();
  const previousMinutes = isFiltered ? 0 : Math.round((profile.previousTotalHours || 0) * 60);
  const previousLandings = isFiltered ? 0 : profile.previousLandings || 0;
  const totals = useMemo(
    () => computeTotals(filteredFlights, isFiltered ? {} : profile),
    [filteredFlights, isFiltered]
  );

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
            {formatMinutesToHHMM(totals.totalMinutes)}
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
            {formatMinutesToHHMM(totals.nightMinutes)}
          </div>
          <div className="text-xs text-avionics-muted mt-1 truncate">
            Посадок ночью: <strong className="text-avionics-text font-mono">{totals.landingsNight}</strong>
          </div>
        </div>

        <div className="bg-avionics-surface border border-avionics-border rounded-2xl p-3.5 sm:p-4 shadow-sm min-w-0 overflow-hidden">
          <div className="flex items-center justify-between text-avionics-muted text-2xs sm:text-xs font-semibold uppercase tracking-wider">
            <span className="truncate mr-1">PIC (КВС)</span>
            <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
          </div>
          <div className="mt-1.5 text-xl sm:text-2xl md:text-3xl font-extrabold font-mono text-emerald-400 truncate">
            {formatMinutesToHHMM(totals.picMinutes)}
          </div>
          <div className="text-xs text-avionics-muted mt-1 truncate">
            SIC: <strong className="text-avionics-text font-mono">{formatMinutesToHHMM(totals.sicMinutes)}</strong>
          </div>
        </div>

        <div className="bg-avionics-surface border border-avionics-border rounded-2xl p-3.5 sm:p-4 shadow-sm min-w-0 overflow-hidden">
          <div className="flex items-center justify-between text-avionics-muted text-2xs sm:text-xs font-semibold uppercase tracking-wider">
            <span className="truncate mr-1">Посадки</span>
            <UserCheck className="w-4 h-4 text-amber-400 shrink-0" />
          </div>
          <div className="mt-1.5 text-xl sm:text-2xl md:text-3xl font-extrabold font-mono text-amber-400 truncate">
            {totals.landings}
          </div>
          <div className="text-xs text-avionics-muted mt-1 truncate">
            День: {totals.landingsDay} | Ночь: {totals.landingsNight}
            {previousLandings > 0 && ` | Перенос: ${previousLandings}`}
          </div>
        </div>
      </div>

      <FlightFilterBar flights={flights} filters={filters} onChange={onFiltersChange} resultCount={filteredFlights.length}>
        {isFiltered && filteredFlights.length > 0 && (
          <button
            type="button"
            onClick={onExportSelection}
            title="Экспорт выборки"
            className="flex items-center space-x-1.5 px-3 py-2 rounded-xl border border-avionics-border bg-avionics-card text-xs font-semibold text-avionics-muted hover:text-avionics-text cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Экспорт</span>
          </button>
        )}
      </FlightFilterBar>

      {/* Flight Log Entries Table / List */}
      <div className="bg-avionics-surface border border-avionics-border rounded-2xl overflow-hidden shadow-sm">
        <div className="px-5 py-3.5 border-b border-avionics-border flex items-center justify-between bg-avionics-card/50">
          <h2 className="text-sm md:text-base font-bold text-avionics-text flex items-center space-x-2">
            <span>Записи в лётной книжке</span>
            <span className="text-xs bg-avionics-surface text-avionics-muted px-2.5 py-0.5 rounded-full border border-avionics-border font-mono">
              {filteredFlights.length}
            </span>
          </h2>
          <button
            type="button"
            onClick={onAddSession}
            className="ml-auto mr-2 flex items-center space-x-1.5 px-2.5 py-1 rounded-lg border border-avionics-border text-xs font-semibold text-avionics-muted hover:text-avionics-text cursor-pointer"
          >
            <MonitorPlay className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Тренажёр или подготовка</span>
          </button>
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as FlightSort)}
            aria-label="Сортировка"
            className="bg-avionics-card border border-avionics-border rounded-lg px-2 py-1 text-xs text-avionics-text focus:outline-none focus:border-sky-500 cursor-pointer"
          >
            {(Object.keys(SORT_LABELS) as FlightSort[]).map((value) => (
              <option key={value} value={value}>{SORT_LABELS[value]}</option>
            ))}
          </select>
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
            {visibleFlights.map((flight) => (
              <div
                key={flight.id}
                onClick={() => onSelectFlight(flight)}
                className="p-3.5 sm:p-4 md:p-5 hover:bg-avionics-card/60 transition-colors cursor-pointer flex flex-col md:flex-row md:items-center justify-between gap-3 sm:gap-4 group min-w-0 overflow-hidden"
              >
                {/* Route & Date */}
                <div className="flex items-center space-x-3 sm:space-x-4 min-w-0 flex-1">
                  <div className="flex flex-col items-center justify-center bg-avionics-card border border-avionics-border rounded-xl px-2.5 sm:px-3 py-1.5 sm:py-2 text-center min-w-[54px] sm:min-w-[64px] shrink-0 shadow-sm">
                    <span className="text-[10px] sm:text-[11px] text-avionics-muted uppercase font-bold">
                      {parseFlightDate(flight.date).toLocaleDateString('ru-RU', { month: 'short' })}
                    </span>
                    <span className="text-lg sm:text-xl font-black font-mono text-avionics-text leading-tight">
                      {parseFlightDate(flight.date).getDate()}
                    </span>
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
                      {entryTypeOf(flight) === 'flight' ? (
                        <>
                          <span className="font-mono font-black text-sky-400 text-base sm:text-lg md:text-xl tracking-wide group-hover:text-sky-300 transition-colors">
                            {flight.depIcao}
                          </span>
                          <ArrowRight className="w-3.5 sm:w-4 h-3.5 sm:h-4 text-avionics-muted shrink-0" />
                          <span className="font-mono font-black text-sky-400 text-base sm:text-lg md:text-xl tracking-wide group-hover:text-sky-300 transition-colors">
                            {flight.arrIcao}
                          </span>
                        </>
                      ) : (
                        <span className="flex items-center space-x-1.5 font-bold text-violet-400 text-base sm:text-lg">
                          <MonitorPlay className="w-4 h-4 shrink-0" />
                          <span>{ENTRY_TYPE_LABELS[entryTypeOf(flight)]}</span>
                        </span>
                      )}

                      <span className="text-2xs sm:text-xs font-mono font-semibold bg-avionics-card text-avionics-text px-1.5 sm:px-2 py-0.5 rounded-md border border-avionics-border truncate max-w-[150px]">
                        {[flight.aircraftReg, flight.aircraftType && `(${flight.aircraftType})`].filter(Boolean).join(' ') || '—'}
                      </span>

                      {isDraft(flight) && (
                        <span className="text-2xs sm:text-xs font-extrabold uppercase bg-amber-500/15 text-amber-400 border border-amber-500/30 px-1.5 sm:px-2 py-0.5 rounded-md shrink-0">
                          Черновик
                        </span>
                      )}

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
                      ) : flight.syncError ? (
                        <span title={flight.syncError} className="text-rose-400 flex items-center space-x-1 text-2xs sm:text-xs bg-rose-500/15 px-1.5 sm:px-2 py-0.5 rounded-md border border-rose-500/30 shrink-0">
                          <AlertCircle className="w-3 h-3" />
                          <span>Не принят</span>
                        </span>
                      ) : (
                        <span title="Ожидает синхронизации" className="text-amber-400 flex items-center space-x-1 text-2xs sm:text-xs bg-amber-500/15 px-1.5 sm:px-2 py-0.5 rounded-md border border-amber-500/30 shrink-0">
                          <CloudOff className="w-3 h-3" />
                          <span>Офлайн</span>
                        </span>
                      )}
                    </div>

                    <div className="text-xs sm:text-sm text-avionics-muted mt-1.5 flex flex-wrap items-center gap-x-2.5 gap-y-1 min-w-0">
                      {entryTypeOf(flight) === 'flight' && (
                        <span className="shrink-0">
                          OUT <strong className="text-avionics-text font-mono font-bold">{flight.outTimeUtc}</strong> — IN{' '}
                          <strong className="text-avionics-text font-mono font-bold">{flight.inTimeUtc}</strong> UTC
                        </span>
                      )}
                      {isDraft(flight) && <span className="text-amber-400">Проверьте время и посадки, затем сохраните</span>}
                      {flight.remarks && (
                        <span className="text-avionics-muted italic break-words max-w-full">«{flight.remarks}»</span>
                      )}
                      {flight.syncError && (
                        <span className="text-rose-400 break-words max-w-full">{flight.syncError}</span>
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
            {sortedFlights.length > visibleFlights.length && (
              <button
                type="button"
                onClick={() => setVisibleCount(visibleCount + PAGE_SIZE)}
                className="w-full p-3 text-xs font-bold text-sky-400 hover:bg-avionics-card/60 cursor-pointer"
              >
                Показать ещё (осталось {sortedFlights.length - visibleFlights.length})
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
