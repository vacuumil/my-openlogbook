import React from 'react';
import { LocalFlight } from '../db/db';
import { Clock, Moon, ArrowRight, ShieldCheck, UserCheck, Cloud, CloudOff, ChevronRight } from 'lucide-react';

interface FlightListProps {
  flights: LocalFlight[];
  onSelectFlight: (flight: LocalFlight) => void;
}

export const formatMinutesToHHMM = (totalMinutes: number): string => {
  const hours = Math.floor(totalMinutes / 60);
  const minutes = Math.round(totalMinutes % 60);
  return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
};

import { getStoredPilotProfile } from './AuthModal';

export const FlightList: React.FC<FlightListProps> = ({ flights, onSelectFlight }) => {
  // Pilot career profile hours transfer
  const profile = getStoredPilotProfile();
  const previousMinutes = Math.round((profile.previousTotalHours || 0) * 60);
  const previousPicMinutes = Math.round((profile.previousPicHours || 0) * 60);
  const previousSicMinutes = Math.round((profile.previousSicHours || 0) * 60);
  const previousNightMinutes = Math.round((profile.previousNightHours || 0) * 60);
  const previousLandings = profile.previousLandings || 0;

  // Aggregate statistics
  const totalMinutes = flights.reduce((sum, f) => sum + (f.totalTimeMinutes || 0), 0);
  const nightMinutes = flights.reduce((sum, f) => sum + (f.nightTimeMinutes || 0), 0);
  const picMinutes = flights.reduce((sum, f) => sum + (f.picTimeMinutes || 0), 0);
  const sicMinutes = flights.reduce((sum, f) => sum + (f.sicTimeMinutes || 0), 0);
  const dayLandings = flights.reduce((sum, f) => sum + (f.landingsDay || 0), 0);
  const nightLandings = flights.reduce((sum, f) => sum + (f.landingsNight || 0), 0);

  const grandTotalMinutes = totalMinutes + previousMinutes;
  const grandPicMinutes = picMinutes + previousPicMinutes;
  const grandNightMinutes = nightMinutes + previousNightMinutes;
  const grandLandings = dayLandings + nightLandings + previousLandings;

  return (
    <div className="space-y-6">
      {/* Flight Time Summary Dashboard Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-avionics-surface border border-avionics-border rounded-2xl p-4 shadow-sm">
          <div className="flex items-center justify-between text-avionics-muted text-xs font-semibold uppercase tracking-wider">
            <span>Общий налёт</span>
            <Clock className="w-4 h-4 text-sky-400" />
          </div>
          <div className="mt-2 text-2xl md:text-3xl font-extrabold font-mono text-sky-400">
            {formatMinutesToHHMM(grandTotalMinutes)}
          </div>
          <div className="text-xs text-avionics-muted mt-1 truncate">
            {previousMinutes > 0 ? (
              <span>Перенос: <strong className="text-slate-300 font-mono">+{profile.previousTotalHours}ч</strong> (рейсов: {flights.length})</span>
            ) : (
              <span>Рейсов: <strong className="text-avionics-text font-mono">{flights.length}</strong></span>
            )}
          </div>
        </div>

        <div className="bg-avionics-surface border border-avionics-border rounded-2xl p-4 shadow-sm">
          <div className="flex items-center justify-between text-avionics-muted text-xs font-semibold uppercase tracking-wider">
            <span>Ночной налёт</span>
            <Moon className="w-4 h-4 text-indigo-400" />
          </div>
          <div className="mt-2 text-2xl md:text-3xl font-extrabold font-mono text-indigo-400">
            {formatMinutesToHHMM(grandNightMinutes)}
          </div>
          <div className="text-xs text-avionics-muted mt-1">
            Посадок ночью: <strong className="text-avionics-text font-mono">{nightLandings}</strong>
          </div>
        </div>

        <div className="bg-avionics-surface border border-avionics-border rounded-2xl p-4 shadow-sm">
          <div className="flex items-center justify-between text-avionics-muted text-xs font-semibold uppercase tracking-wider">
            <span>PIC (КВС)</span>
            <ShieldCheck className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="mt-2 text-2xl md:text-3xl font-extrabold font-mono text-emerald-400">
            {formatMinutesToHHMM(grandPicMinutes)}
          </div>
          <div className="text-xs text-avionics-muted mt-1 truncate">
            SIC: <strong className="text-avionics-text font-mono">{formatMinutesToHHMM(sicMinutes + previousSicMinutes)}</strong>
          </div>
        </div>

        <div className="bg-avionics-surface border border-avionics-border rounded-2xl p-4 shadow-sm">
          <div className="flex items-center justify-between text-avionics-muted text-xs font-semibold uppercase tracking-wider">
            <span>Посадки</span>
            <UserCheck className="w-4 h-4 text-amber-400" />
          </div>
          <div className="mt-2 text-2xl md:text-3xl font-extrabold font-mono text-amber-400">
            {grandLandings}
          </div>
          <div className="text-xs text-avionics-muted mt-1">
            День: {dayLandings} | Ночь: {nightLandings}
          </div>
        </div>
      </div>
      {/* Flight Log Entries Table / List */}
      <div className="bg-avionics-surface border border-avionics-border rounded-2xl overflow-hidden shadow-sm">
        <div className="px-5 py-3.5 border-b border-avionics-border flex items-center justify-between bg-avionics-card/50">
          <h2 className="text-sm md:text-base font-bold text-avionics-text flex items-center space-x-2">
            <span>Записи в лётной книжке</span>
            <span className="text-xs bg-avionics-surface text-avionics-muted px-2.5 py-0.5 rounded-full border border-avionics-border font-mono">
              {flights.length}
            </span>
          </h2>
          <div className="text-xs text-avionics-muted hidden sm:block">
            Нажмите на рейс для просмотра и редактирования
          </div>
        </div>

        {flights.length === 0 ? (
          <div className="p-12 text-center text-avionics-muted">
            <Clock className="w-10 h-10 mx-auto mb-3 opacity-30" />
            <p className="text-base font-semibold">Пока нет записей о полетах.</p>
            <p className="text-sm mt-1 text-slate-500">Нажмите «Новый рейс», чтобы внести свой первый полет.</p>
          </div>
        ) : (
          <div className="divide-y divide-avionics-border">
            {flights.map((flight) => (
              <div
                key={flight.id}
                onClick={() => onSelectFlight(flight)}
                className="p-4 md:p-5 hover:bg-avionics-card/60 transition-colors cursor-pointer flex flex-col md:flex-row md:items-center justify-between gap-4 group"
              >
                {/* Route & Date */}
                <div className="flex items-center space-x-4">
                  <div className="flex flex-col items-center justify-center bg-avionics-card border border-avionics-border rounded-xl px-3 py-2 text-center min-w-[64px] shadow-sm">
                    <span className="text-[11px] text-avionics-muted uppercase font-bold">
                      {new Date(flight.date).toLocaleDateString('ru-RU', { month: 'short' })}
                    </span>
                    <span className="text-xl font-black font-mono text-avionics-text leading-tight">
                      {new Date(flight.date).getDate()}
                    </span>
                  </div>

                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono font-black text-sky-400 text-lg md:text-xl tracking-wide group-hover:text-sky-300 transition-colors">
                        {flight.depIcao}
                      </span>
                      <ArrowRight className="w-4 h-4 text-avionics-muted" />
                      <span className="font-mono font-black text-sky-400 text-lg md:text-xl tracking-wide group-hover:text-sky-300 transition-colors">
                        {flight.arrIcao}
                      </span>

                      <span className="text-xs font-mono font-semibold bg-slate-800/80 text-slate-200 px-2 py-0.5 rounded-md border border-slate-700">
                        {flight.aircraftReg} ({flight.aircraftType})
                      </span>

                      {flight.flightRole === 'PIC' && (
                        <span className="text-xs uppercase font-extrabold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 px-2 py-0.5 rounded-md">
                          PIC
                        </span>
                      )}
                      {flight.flightRole === 'SIC' && (
                        <span className="text-xs uppercase font-extrabold bg-sky-500/15 text-sky-400 border border-sky-500/30 px-2 py-0.5 rounded-md">
                          SIC
                        </span>
                      )}
                      {flight.flightRole === 'PICUS' && (
                        <span className="text-xs uppercase font-extrabold bg-amber-500/15 text-amber-400 border border-amber-500/30 px-2 py-0.5 rounded-md">
                          PICUS
                        </span>
                      )}
                      {flight.flightRole === 'Observer' && (
                        <span className="text-xs uppercase font-extrabold bg-purple-500/15 text-purple-400 border border-purple-500/30 px-2 py-0.5 rounded-md">
                          OBSERVER
                        </span>
                      )}
                      {flight.flightRole === 'Instructor' && (
                        <span className="text-xs uppercase font-extrabold bg-rose-500/15 text-rose-400 border border-rose-500/30 px-2 py-0.5 rounded-md">
                          TRI
                        </span>
                      )}

                      {flight.flightHandling && (
                        <span className={`text-[11px] font-bold px-1.5 py-0.5 rounded border ${
                          flight.flightHandling === 'PF'
                            ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                            : flight.flightHandling === 'Observer'
                            ? 'bg-purple-500/10 text-purple-400 border-purple-500/20'
                            : 'bg-sky-500/10 text-sky-400 border-sky-500/20'
                        }`}>
                          {flight.flightHandling}
                        </span>
                      )}

                      {flight.syncStatus === 'synced' ? (
                        <span title="Синхронизировано" className="text-emerald-400">
                          <Cloud className="w-4 h-4" />
                        </span>
                      ) : (
                        <span title="Ожидает синхронизации" className="text-amber-400 flex items-center space-x-1 text-xs bg-amber-500/15 px-2 py-0.5 rounded-md border border-amber-500/30">
                          <CloudOff className="w-3.5 h-3.5" />
                          <span>Офлайн</span>
                        </span>
                      )}
                    </div>

                    <div className="text-sm text-avionics-muted mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1">
                      <span>
                        OUT <strong className="text-slate-200 font-mono">{flight.outTimeUtc}</strong> — IN{' '}
                        <strong className="text-slate-200 font-mono">{flight.inTimeUtc}</strong> UTC
                      </span>
                      {flight.remarks && (
                        <span className="text-slate-400 italic">«{flight.remarks}»</span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Times & Chevron */}
                <div className="flex items-center justify-between md:justify-end space-x-4 border-t md:border-t-0 pt-2 md:pt-0 border-avionics-border">
                  <div className="text-right">
                    <div className="text-lg md:text-xl font-mono font-black text-avionics-text">
                      {formatMinutesToHHMM(flight.totalTimeMinutes)}
                    </div>
                    {flight.nightTimeMinutes > 0 && (
                      <div className="text-xs font-mono font-bold text-indigo-400 flex items-center justify-end space-x-1">
                        <Moon className="w-3 h-3" />
                        <span>Night: {formatMinutesToHHMM(flight.nightTimeMinutes)}</span>
                      </div>
                    )}
                  </div>

                  <div className="p-2 text-avionics-muted group-hover:text-sky-400 transition-colors">
                    <ChevronRight className="w-5 h-5" />
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
