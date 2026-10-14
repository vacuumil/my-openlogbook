import React, { useState, useEffect } from 'react';
import { X, Plane, Clock, Moon, Edit3, Trash2, Check, Shield, UserCheck, CheckCircle } from 'lucide-react';
import { LocalFlight, LocalAirport, db } from '../db/db';
import { airportService } from '../utils/airportService';
import { formatMinutesToHHMM } from './FlightList';

interface FlightDetailModalProps {
  flight: LocalFlight | null;
  isOpen: boolean;
  onClose: () => void;
  onSave: (updated: LocalFlight) => void;
  onDelete: (id: string) => void;
  airports: LocalAirport[];
}

const parseTimeToMinutes = (timeStr: string): number => {
  if (!timeStr) return 0;
  if (timeStr.includes(':')) {
    const [h, m] = timeStr.split(':').map((v) => parseInt(v, 10) || 0);
    return h * 60 + m;
  }
  const val = parseFloat(timeStr);
  return isNaN(val) ? 0 : Math.round(val * 60);
};

export const FlightDetailModal: React.FC<FlightDetailModalProps> = ({
  flight,
  isOpen,
  onClose,
  onSave,
  onDelete,
}) => {
  const [isEditing, setIsEditing] = useState(false);

  // Form states
  const [date, setDate] = useState('');
  const [depIcao, setDepIcao] = useState('');
  const [arrIcao, setArrIcao] = useState('');
  const [depAirportInfo, setDepAirportInfo] = useState<LocalAirport | null>(null);
  const [arrAirportInfo, setArrAirportInfo] = useState<LocalAirport | null>(null);

  const [aircraftReg, setAircraftReg] = useState('');
  const [aircraftType, setAircraftType] = useState('');
  const [outTimeUtc, setOutTimeUtc] = useState('');
  const [offTimeUtc, setOffTimeUtc] = useState('');
  const [onTimeUtc, setOnTimeUtc] = useState('');
  const [inTimeUtc, setInTimeUtc] = useState('');

  const [nightTimeInput, setNightTimeInput] = useState('00:00');

  const [flightRole, setFlightRole] = useState<'PIC' | 'SIC' | 'PICUS' | 'Dual' | 'Instructor' | 'Observer'>('SIC');
  const [flightHandling, setFlightHandling] = useState<'PF' | 'PM' | 'Observer' | 'Relief'>('PF');

  const [landingsDay, setLandingsDay] = useState(0);
  const [landingsNight, setLandingsNight] = useState(0);
  const [approachType, setApproachType] = useState('');
  const [remarks, setRemarks] = useState('');

  const [totalMinutes, setTotalMinutes] = useState(0);

  useEffect(() => {
    if (flight) {
      setDate(flight.date);
      setDepIcao(flight.depIcao);
      setArrIcao(flight.arrIcao);
      setAircraftReg(flight.aircraftReg);
      setAircraftType(flight.aircraftType);
      setOutTimeUtc(flight.outTimeUtc);
      setOffTimeUtc(flight.offTimeUtc);
      setOnTimeUtc(flight.onTimeUtc);
      setInTimeUtc(flight.inTimeUtc);
      setTotalMinutes(flight.totalTimeMinutes);
      setNightTimeInput(formatMinutesToHHMM(flight.nightTimeMinutes || 0));
      setLandingsDay(flight.landingsDay || 0);
      setLandingsNight(flight.landingsNight || 0);
      setApproachType(flight.approachType || '');
      setRemarks(flight.remarks || '');

      setFlightRole((flight.flightRole as any) || (flight.picTimeMinutes > 0 ? 'PIC' : flight.picusTimeMinutes > 0 ? 'PICUS' : flight.dualTimeMinutes > 0 ? 'Dual' : 'SIC'));
      setFlightHandling((flight.flightHandling as any) || 'PF');

      setIsEditing(false);

      // Resolve airport info
      airportService.getAirport(flight.depIcao).then(setDepAirportInfo);
      airportService.getAirport(flight.arrIcao).then(setArrAirportInfo);
    }
  }, [flight]);

  // Recalculate block time in edit mode
  useEffect(() => {
    if (!isEditing || !outTimeUtc || !inTimeUtc) return;

    try {
      const [outH, outM] = outTimeUtc.split(':').map(Number);
      const [inH, inM] = inTimeUtc.split(':').map(Number);
      const [year, month, day] = date.split('-').map(Number);

      const outDate = new Date(Date.UTC(year, month - 1, day, outH, outM));
      let inDate = new Date(Date.UTC(year, month - 1, day, inH, inM));
      if (inDate < outDate) {
        inDate = new Date(inDate.getTime() + 24 * 60 * 60 * 1000);
      }

      const blockMins = Math.max(0, Math.round((inDate.getTime() - outDate.getTime()) / (1000 * 60)));
      setTotalMinutes(blockMins);
    } catch {
      // Ignored
    }
  }, [isEditing, date, outTimeUtc, inTimeUtc]);

  if (!isOpen || !flight) return null;

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    const nightMins = parseTimeToMinutes(nightTimeInput);

    const updated: LocalFlight = {
      ...flight,
      date,
      depIcao: depIcao.toUpperCase().trim(),
      arrIcao: arrIcao.toUpperCase().trim(),
      aircraftReg: aircraftReg.toUpperCase().trim(),
      aircraftType: aircraftType.toUpperCase().trim(),
      outTimeUtc,
      offTimeUtc,
      onTimeUtc,
      inTimeUtc,
      totalTimeMinutes: totalMinutes,
      nightTimeMinutes: Math.min(nightMins, totalMinutes > 0 ? totalMinutes : nightMins),
      ifrTimeMinutes: totalMinutes,
      picTimeMinutes: flightRole === 'PIC' ? totalMinutes : 0,
      sicTimeMinutes: flightRole === 'SIC' ? totalMinutes : 0,
      picusTimeMinutes: flightRole === 'PICUS' ? totalMinutes : 0,
      dualTimeMinutes: flightRole === 'Dual' ? totalMinutes : 0,
      instructorTimeMinutes: flightRole === 'Instructor' ? totalMinutes : 0,
      flightRole,
      flightHandling,
      landingsDay,
      landingsNight,
      approachType,
      remarks,
      syncStatus: flight.syncStatus === 'synced' ? 'updated' : flight.syncStatus,
      updatedAt: new Date().toISOString(),
    };

    onSave(updated);
    setIsEditing(false);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-avionics-surface border border-avionics-border rounded-2xl w-full max-w-2xl shadow-2xl overflow-hidden my-8">
        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-avionics-border bg-avionics-card">
          <div className="flex items-center space-x-3">
            <div className="p-2 bg-sky-500/10 border border-sky-500/20 rounded-xl text-sky-400">
              <Plane className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base md:text-lg font-bold text-avionics-text">
                {isEditing ? 'Редактирование рейса' : 'Сведения о рейсе'}
              </h2>
              <div className="text-xs text-avionics-muted font-mono">
                {new Date(flight.date).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' })}
              </div>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            {!isEditing && (
              <button
                onClick={() => setIsEditing(true)}
                className="flex items-center space-x-1.5 px-3.5 py-1.5 rounded-xl bg-sky-500/10 hover:bg-sky-500/20 text-sky-400 border border-sky-500/30 text-xs font-semibold transition-colors"
              >
                <Edit3 className="w-4 h-4" />
                <span className="hidden sm:inline">Редактировать</span>
              </button>
            )}
            <button
              onClick={onClose}
              className="p-1.5 text-avionics-muted hover:text-avionics-text rounded-lg hover:bg-slate-800 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Route Banner */}
        <div className="p-6 bg-gradient-to-r from-sky-950/20 via-avionics-surface to-indigo-950/20 border-b border-avionics-border">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-2xl md:text-4xl font-black font-mono text-sky-400 tracking-wider">
                {flight.depIcao}
              </div>
              <div className="text-xs md:text-sm text-avionics-muted mt-0.5 max-w-[150px] truncate">
                {depAirportInfo ? depAirportInfo.name : 'Вылет'}
              </div>
            </div>

            <div className="flex flex-col items-center px-4">
              <span className="text-xs font-mono font-bold text-avionics-muted mb-1">
                {formatMinutesToHHMM(flight.totalTimeMinutes)}
              </span>
              <div className="flex items-center space-x-1 text-sky-400">
                <div className="w-8 md:w-16 h-[2px] bg-sky-500/40"></div>
                <Plane className="w-5 h-5 rotate-90" />
                <div className="w-8 md:w-16 h-[2px] bg-sky-500/40"></div>
              </div>
              <span className="text-[11px] text-avionics-muted mt-1 uppercase font-semibold">
                {flight.aircraftReg} ({flight.aircraftType})
              </span>
            </div>

            <div className="text-right">
              <div className="text-2xl md:text-4xl font-black font-mono text-sky-400 tracking-wider">
                {flight.arrIcao}
              </div>
              <div className="text-xs md:text-sm text-avionics-muted mt-0.5 max-w-[150px] truncate">
                {arrAirportInfo ? arrAirportInfo.name : 'Прилет'}
              </div>
            </div>
          </div>
        </div>

        {/* Body */}
        {isEditing ? (
          <form onSubmit={handleSave} className="p-6 space-y-5">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-semibold text-avionics-muted mb-1">Дата</label>
                <input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="w-full bg-avionics-card border border-avionics-border rounded-xl px-3 py-2 text-sm font-mono text-avionics-text focus:outline-none focus:border-sky-500"
                  required
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-avionics-muted mb-1">Бортовой №</label>
                <input
                  type="text"
                  value={aircraftReg}
                  onChange={(e) => setAircraftReg(e.target.value.toUpperCase())}
                  className="w-full bg-avionics-card border border-avionics-border rounded-xl px-3 py-2 text-sm font-mono uppercase text-avionics-text focus:outline-none focus:border-sky-500"
                  required
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-avionics-muted mb-1">Тип ВС</label>
                <input
                  type="text"
                  value={aircraftType}
                  onChange={(e) => setAircraftType(e.target.value.toUpperCase())}
                  className="w-full bg-avionics-card border border-avionics-border rounded-xl px-3 py-2 text-sm font-mono uppercase text-avionics-text focus:outline-none focus:border-sky-500"
                  required
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-avionics-muted mb-1">Вылет (ICAO)</label>
                <input
                  type="text"
                  maxLength={4}
                  value={depIcao}
                  onChange={(e) => {
                    const up = e.target.value.toUpperCase();
                    setDepIcao(up);
                    if (up.length >= 3) airportService.getAirport(up).then(setDepAirportInfo);
                  }}
                  className="w-full bg-avionics-card border border-avionics-border rounded-xl px-3 py-2 text-base font-mono font-bold text-sky-400 uppercase focus:outline-none focus:border-sky-500"
                  required
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-avionics-muted mb-1">Прилет (ICAO)</label>
                <input
                  type="text"
                  maxLength={4}
                  value={arrIcao}
                  onChange={(e) => {
                    const up = e.target.value.toUpperCase();
                    setArrIcao(up);
                    if (up.length >= 3) airportService.getAirport(up).then(setArrAirportInfo);
                  }}
                  className="w-full bg-avionics-card border border-avionics-border rounded-xl px-3 py-2 text-base font-mono font-bold text-sky-400 uppercase focus:outline-none focus:border-sky-500"
                  required
                />
              </div>
            </div>

            {/* Block & Flight Times */}
            <div className="bg-avionics-card border border-avionics-border rounded-xl p-4 space-y-3">
              <div className="text-xs font-bold uppercase tracking-wider text-avionics-muted">
                Время в формате UTC
              </div>
              <div className="grid grid-cols-4 gap-2">
                <div>
                  <label className="block text-[11px] text-avionics-muted mb-0.5">OUT</label>
                  <input
                    type="time"
                    value={outTimeUtc}
                    onChange={(e) => setOutTimeUtc(e.target.value)}
                    className="w-full bg-avionics-surface border border-avionics-border rounded-lg px-2 py-1.5 text-sm font-mono text-center text-avionics-text"
                    required
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-avionics-muted mb-0.5">OFF</label>
                  <input
                    type="time"
                    value={offTimeUtc}
                    onChange={(e) => setOffTimeUtc(e.target.value)}
                    className="w-full bg-avionics-surface border border-avionics-border rounded-lg px-2 py-1.5 text-sm font-mono text-center text-avionics-text"
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-avionics-muted mb-0.5">ON</label>
                  <input
                    type="time"
                    value={onTimeUtc}
                    onChange={(e) => setOnTimeUtc(e.target.value)}
                    className="w-full bg-avionics-surface border border-avionics-border rounded-lg px-2 py-1.5 text-sm font-mono text-center text-avionics-text"
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-avionics-muted mb-0.5">IN</label>
                  <input
                    type="time"
                    value={inTimeUtc}
                    onChange={(e) => setInTimeUtc(e.target.value)}
                    className="w-full bg-avionics-surface border border-avionics-border rounded-lg px-2 py-1.5 text-sm font-mono text-center text-avionics-text"
                    required
                  />
                </div>
              </div>

              {/* Total Block & Manual Night Time Input */}
              <div className="pt-2 border-t border-avionics-border flex flex-wrap items-center justify-between gap-2 text-xs">
                <span className="text-avionics-muted">
                  Block: <strong className="text-sky-400 font-mono text-sm">{formatMinutesToHHMM(totalMinutes)}</strong>
                </span>

                <div className="flex items-center space-x-2">
                  <label className="text-xs text-avionics-muted flex items-center space-x-1">
                    <Moon className="w-3.5 h-3.5 text-indigo-400" />
                    <span>Ночное:</span>
                  </label>
                  <input
                    type="text"
                    value={nightTimeInput}
                    onChange={(e) => setNightTimeInput(e.target.value)}
                    className="w-20 bg-avionics-surface border border-avionics-border rounded-lg px-2 py-1 text-xs font-mono font-bold text-indigo-300 text-center"
                  />
                </div>
              </div>
            </div>

            {/* Role & Handling Status */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-avionics-muted mb-1">Командная функция экипажа</label>
                <select
                  value={flightRole}
                  onChange={(e) => setFlightRole(e.target.value as any)}
                  className="w-full bg-avionics-card border border-avionics-border rounded-xl px-3 py-2 text-sm font-semibold text-avionics-text"
                >
                  <option value="SIC">SIC — Второй пилот</option>
                  <option value="PIC">PIC — Командир ВС</option>
                  <option value="PICUS">PICUS — Под надзором</option>
                  <option value="Dual">Dual — Обучение</option>
                  <option value="Instructor">Instructor — Инструктор</option>
                  <option value="Observer">Observer — Пилот-наблюдатель</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-avionics-muted mb-1">Статус управления</label>
                <select
                  value={flightHandling}
                  onChange={(e) => setFlightHandling(e.target.value as any)}
                  className="w-full bg-avionics-card border border-avionics-border rounded-xl px-3 py-2 text-sm font-semibold text-avionics-text"
                >
                  <option value="PF">PF — Пилотирующий (Pilot Flying)</option>
                  <option value="PM">PM — Мониторящий (Pilot Monitoring)</option>
                  <option value="Observer">Observer — Наблюдатель</option>
                  <option value="Relief">Relief — Сменный пилот</option>
                </select>
              </div>
            </div>

            {/* Landings */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-avionics-muted mb-1">Посадки (День)</label>
                <input
                  type="number"
                  min={0}
                  value={landingsDay}
                  onChange={(e) => setLandingsDay(Number(e.target.value))}
                  className="w-full bg-avionics-card border border-avionics-border rounded-xl px-3 py-2 text-sm font-mono text-avionics-text"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-avionics-muted mb-1">Посадки (Ночь)</label>
                <input
                  type="number"
                  min={0}
                  value={landingsNight}
                  onChange={(e) => setLandingsNight(Number(e.target.value))}
                  className="w-full bg-avionics-card border border-avionics-border rounded-xl px-3 py-2 text-sm font-mono text-avionics-text"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-avionics-muted mb-1">Примечания</label>
              <input
                type="text"
                value={remarks}
                onChange={(e) => setRemarks(e.target.value)}
                placeholder="Заметки о полете..."
                className="w-full bg-avionics-card border border-avionics-border rounded-xl px-3 py-2 text-sm text-avionics-text"
              />
            </div>

            {/* Buttons */}
            <div className="flex items-center justify-between pt-3 border-t border-avionics-border">
              <button
                type="button"
                onClick={() => setIsEditing(false)}
                className="px-4 py-2 text-sm font-semibold text-avionics-muted hover:text-avionics-text rounded-xl"
              >
                Отмена
              </button>
              <button
                type="submit"
                className="flex items-center space-x-1.5 px-6 py-2.5 bg-sky-500 hover:bg-sky-400 text-slate-950 font-bold text-sm rounded-xl transition-all shadow-lg shadow-sky-500/25"
              >
                <Check className="w-4 h-4" />
                <span>Сохранить изменения</span>
              </button>
            </div>
          </form>
        ) : (
          /* View Mode */
          <div className="p-6 space-y-6">
            {/* Key Flight Metrics */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="p-3 bg-avionics-card rounded-xl border border-avionics-border text-center">
                <div className="text-xs text-avionics-muted uppercase font-semibold">Block Time</div>
                <div className="text-xl md:text-2xl font-bold font-mono text-sky-400 mt-1">
                  {formatMinutesToHHMM(flight.totalTimeMinutes)}
                </div>
              </div>

              <div className="p-3 bg-avionics-card rounded-xl border border-avionics-border text-center">
                <div className="text-xs text-avionics-muted uppercase font-semibold">Night Time</div>
                <div className="text-xl md:text-2xl font-bold font-mono text-indigo-400 mt-1">
                  {formatMinutesToHHMM(flight.nightTimeMinutes)}
                </div>
              </div>

              <div className="p-3 bg-avionics-card rounded-xl border border-avionics-border text-center">
                <div className="text-xs text-avionics-muted uppercase font-semibold">Роль & Управление</div>
                <div className="text-base md:text-lg font-bold font-mono text-emerald-400 mt-1">
                  {flight.flightRole || 'SIC'}
                  <span className="text-xs bg-emerald-500/20 text-emerald-300 px-1.5 py-0.5 rounded ml-1">
                    {flight.flightHandling || 'PF'}
                  </span>
                </div>
              </div>

              <div className="p-3 bg-avionics-card rounded-xl border border-avionics-border text-center">
                <div className="text-xs text-avionics-muted uppercase font-semibold">Посадки</div>
                <div className="text-xl md:text-2xl font-bold font-mono text-amber-400 mt-1">
                  {flight.landingsDay}D / {flight.landingsNight}N
                </div>
              </div>
            </div>

            {/* Timetable Times */}
            <div className="p-4 bg-avionics-card rounded-xl border border-avionics-border space-y-2">
              <div className="text-xs font-bold uppercase tracking-wider text-avionics-muted flex items-center justify-between">
                <span>Хронометраж рейса (UTC)</span>
                <Clock className="w-4 h-4 text-sky-400" />
              </div>

              <div className="grid grid-cols-4 gap-2 text-center pt-2">
                <div>
                  <div className="text-xs text-avionics-muted">OUT (Колодки)</div>
                  <div className="text-base font-mono font-bold text-avionics-text mt-0.5">{flight.outTimeUtc}</div>
                </div>
                <div>
                  <div className="text-xs text-avionics-muted">OFF (Взлет)</div>
                  <div className="text-base font-mono font-bold text-avionics-text mt-0.5">{flight.offTimeUtc}</div>
                </div>
                <div>
                  <div className="text-xs text-avionics-muted">ON (Посадка)</div>
                  <div className="text-base font-mono font-bold text-avionics-text mt-0.5">{flight.onTimeUtc}</div>
                </div>
                <div>
                  <div className="text-xs text-avionics-muted">IN (Колодки)</div>
                  <div className="text-base font-mono font-bold text-avionics-text mt-0.5">{flight.inTimeUtc}</div>
                </div>
              </div>
            </div>

            {/* Remarks */}
            {(flight.approachType || flight.remarks) && (
              <div className="p-4 bg-avionics-card rounded-xl border border-avionics-border space-y-2">
                {flight.approachType && (
                  <div className="text-sm">
                    <span className="text-avionics-muted">Заход: </span>
                    <strong className="text-avionics-text font-mono">{flight.approachType}</strong>
                  </div>
                )}
                {flight.remarks && (
                  <div className="text-sm">
                    <span className="text-avionics-muted">Примечания: </span>
                    <span className="text-avionics-text italic">«{flight.remarks}»</span>
                  </div>
                )}
              </div>
            )}

            {/* Actions */}
            <div className="flex items-center justify-between pt-4 border-t border-avionics-border">
              <button
                onClick={() => {
                  if (window.confirm('Вы уверены, что хотите удалить этот рейс?')) {
                    onDelete(flight.id);
                    onClose();
                  }
                }}
                className="flex items-center space-x-1.5 px-4 py-2 bg-rose-950/30 hover:bg-rose-900/50 text-rose-400 border border-rose-800/50 rounded-xl text-sm font-semibold transition-colors"
              >
                <Trash2 className="w-4 h-4" />
                <span>Удалить рейс</span>
              </button>

              <button
                onClick={() => setIsEditing(true)}
                className="flex items-center space-x-1.5 px-6 py-2.5 bg-sky-500 hover:bg-sky-400 text-slate-950 rounded-xl text-sm font-bold transition-all shadow-lg shadow-sky-500/20"
              >
                <Edit3 className="w-4 h-4" />
                <span>Редактировать рейс</span>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
