import React, { useEffect, useState } from 'react';
import { GraduationCap, MonitorPlay, Trash2, X } from 'lucide-react';
import { LocalFlight } from '../db/db';
import { generateUUID } from '../utils/uuid';
import { toDateKey } from '../utils/dates';
import { NO_LOCATION } from '../utils/entries';

type SessionType = 'simulator' | 'ground';

interface SessionModalProps {
  isOpen: boolean;
  /** An existing simulator or ground entry to edit; empty for a new one */
  entry: LocalFlight | null;
  defaultType?: SessionType;
  onClose: () => void;
  onSave: (entry: LocalFlight) => void;
  onDelete: (id: string) => void;
}

const DEVICES: Record<SessionType, string[]> = {
  simulator: ['FFS', 'FNPT II', 'FNPT I', 'FTD', 'BITD'],
  ground: ['Класс', 'CBT', 'Аварийно-спасательная', 'КПК', 'Другое'],
};

const ROLES = [
  { value: 'PF', label: 'Пилотирующий (PF)' },
  { value: 'PM', label: 'Контролирующий (PM)' },
  { value: 'Instructor', label: 'Инструктор' },
  { value: 'Observer', label: 'Наблюдатель' },
];

const fieldClassName =
  'w-full bg-avionics-card border border-avionics-border rounded-xl px-3 py-2 text-sm text-avionics-text focus:outline-none focus:border-sky-500';
const labelClassName = 'block text-xs font-semibold text-avionics-muted mb-1';

const toDuration = (minutes: number) => `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
const fromDuration = (value: string) => {
  const [hours, minutes] = value.split(':').map(Number);
  return (hours || 0) * 60 + (minutes || 0);
};

/**
 * Simulator and ground training are logged apart from flights: they never count as flight time.
 * Take-offs and landings on a full flight simulator still count towards recency.
 */
export const SessionModal: React.FC<SessionModalProps> = ({ isOpen, entry, defaultType = 'simulator', onClose, onSave, onDelete }) => {
  const [type, setType] = useState<SessionType>(defaultType);
  const [date, setDate] = useState(toDateKey(new Date()));
  const [device, setDevice] = useState(DEVICES.simulator[0]);
  const [aircraftType, setAircraftType] = useState('');
  const [duration, setDuration] = useState('04:00');
  const [handling, setHandling] = useState('PF');
  const [landingsDay, setLandingsDay] = useState(0);
  const [landingsNight, setLandingsNight] = useState(0);
  const [remarks, setRemarks] = useState('');

  useEffect(() => {
    if (!isOpen) return;
    const sessionType = (entry?.entryType === 'ground' ? 'ground' : entry ? 'simulator' : defaultType) as SessionType;
    setType(sessionType);
    setDate(entry?.date || toDateKey(new Date()));
    setDevice(entry?.simDevice || DEVICES[sessionType][0]);
    setAircraftType(entry?.aircraftType || '');
    setDuration(toDuration(entry?.totalTimeMinutes ?? (sessionType === 'ground' ? 120 : 240)));
    setHandling(entry?.flightHandling || 'PF');
    setLandingsDay(entry?.landingsDay || 0);
    setLandingsNight(entry?.landingsNight || 0);
    setRemarks(entry?.remarks || '');
  }, [isOpen, entry, defaultType]);

  if (!isOpen) return null;

  const switchType = (next: SessionType) => {
    setType(next);
    setDevice(DEVICES[next][0]);
  };

  const minutes = fromDuration(duration);

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    const isSimulator = type === 'simulator';
    onSave({
      ...(entry || {}),
      id: entry?.id || generateUUID(),
      entryType: type,
      simDevice: device,
      date,
      depIcao: NO_LOCATION,
      arrIcao: NO_LOCATION,
      outTimeUtc: '00:00',
      offTimeUtc: '00:00',
      onTimeUtc: duration,
      inTimeUtc: duration,
      totalTimeMinutes: minutes,
      nightTimeMinutes: 0,
      ifrTimeMinutes: 0,
      picTimeMinutes: 0,
      sicTimeMinutes: 0,
      picusTimeMinutes: 0,
      dualTimeMinutes: 0,
      instructorTimeMinutes: handling === 'Instructor' ? minutes : 0,
      flightRole: handling === 'Instructor' ? 'Instructor' : handling === 'Observer' ? 'Observer' : undefined,
      flightHandling: handling === 'PF' || handling === 'PM' || handling === 'Observer' ? handling : undefined,
      landingsDay: isSimulator ? landingsDay : 0,
      landingsNight: isSimulator ? landingsNight : 0,
      aircraftReg: device,
      aircraftType: aircraftType.toUpperCase().trim(),
      remarks: remarks.trim(),
      syncStatus: entry && entry.syncStatus === 'synced' ? 'updated' : entry?.syncStatus || 'created',
      updatedAt: new Date().toISOString(),
    } as LocalFlight);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-lg max-h-[92vh] overflow-y-auto bg-avionics-surface border border-avionics-border rounded-t-3xl sm:rounded-2xl shadow-2xl"
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-avionics-border">
          <h2 className="text-base font-bold text-avionics-text">
            {entry ? 'Тренировка' : 'Новая тренировка'}
          </h2>
          <button type="button" onClick={onClose} aria-label="Закрыть" className="p-1.5 text-avionics-muted hover:text-avionics-text cursor-pointer">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <div role="group" aria-label="Тип записи" className="grid grid-cols-2 gap-2">
            {([
              ['simulator', 'Тренажёр', MonitorPlay],
              ['ground', 'Наземная подготовка', GraduationCap],
            ] as const).map(([value, label, Icon]) => (
              <button
                key={value}
                type="button"
                aria-pressed={type === value}
                onClick={() => switchType(value)}
                className={`flex items-center justify-center space-x-2 py-2.5 rounded-xl border text-sm font-semibold cursor-pointer ${
                  type === value ? 'bg-sky-500/15 border-sky-500/50 text-sky-400' : 'bg-avionics-card border-avionics-border text-avionics-muted'
                }`}
              >
                <Icon className="w-4 h-4" />
                <span>{label}</span>
              </button>
            ))}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <label className={labelClassName}>
              Дата
              <input type="date" required value={date} onChange={(e) => setDate(e.target.value)} className={`${fieldClassName} mt-1 font-mono`} />
            </label>
            <label className={labelClassName}>
              Длительность
              <input type="time" required value={duration} onChange={(e) => setDuration(e.target.value)} className={`${fieldClassName} mt-1 font-mono`} />
            </label>
            <label className={labelClassName}>
              {type === 'simulator' ? 'Устройство' : 'Вид'}
              <select value={device} onChange={(e) => setDevice(e.target.value)} className={`${fieldClassName} mt-1`}>
                {DEVICES[type].map((value) => (
                  <option key={value} value={value}>{value}</option>
                ))}
              </select>
            </label>
            <label className={labelClassName}>
              Тип ВС
              <input
                type="text"
                value={aircraftType}
                onChange={(e) => setAircraftType(e.target.value.toUpperCase())}
                placeholder="A320"
                required={type === 'simulator'}
                className={`${fieldClassName} mt-1 font-mono uppercase`}
              />
            </label>
          </div>

          {type === 'simulator' && (
            <>
              <label className={labelClassName}>
                Роль
                <select value={handling} onChange={(e) => setHandling(e.target.value)} className={`${fieldClassName} mt-1`}>
                  {ROLES.map(({ value, label }) => (
                    <option key={value} value={value}>{label}</option>
                  ))}
                </select>
              </label>
              <div className="grid grid-cols-2 gap-3">
                <label className={labelClassName}>
                  Взлёты и посадки днём
                  <input type="number" min={0} max={30} value={landingsDay} onChange={(e) => setLandingsDay(Number(e.target.value) || 0)} className={`${fieldClassName} mt-1 font-mono`} />
                </label>
                <label className={labelClassName}>
                  Взлёты и посадки ночью
                  <input type="number" min={0} max={30} value={landingsNight} onChange={(e) => setLandingsNight(Number(e.target.value) || 0)} className={`${fieldClassName} mt-1 font-mono`} />
                </label>
              </div>
              <p className="text-2xs text-avionics-muted">
                Время на тренажёре не входит в налёт. Взлёты и посадки на FFS в роли PF засчитываются в правило 90 дней.
              </p>
            </>
          )}

          <label className={labelClassName}>
            Заметки
            <input
              type="text"
              value={remarks}
              onChange={(e) => setRemarks(e.target.value)}
              placeholder={type === 'simulator' ? 'LPC, OPC, отказ двигателя...' : 'Тема занятия'}
              className={`${fieldClassName} mt-1`}
            />
          </label>
        </div>

        <div className="flex items-center justify-between gap-2 px-5 py-4 border-t border-avionics-border">
          {entry ? (
            <button
              type="button"
              onClick={() => window.confirm('Удалить эту запись?') && onDelete(entry.id)}
              className="flex items-center space-x-1.5 px-3 py-2 text-rose-400 border border-rose-500/30 rounded-xl text-xs font-bold cursor-pointer"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Удалить</span>
            </button>
          ) : (
            <span />
          )}
          <button
            type="submit"
            disabled={minutes <= 0}
            className="px-5 py-2.5 bg-sky-500 hover:bg-sky-400 disabled:opacity-50 text-slate-950 text-sm font-bold rounded-xl cursor-pointer"
          >
            Сохранить
          </button>
        </div>
      </form>
    </div>
  );
};
