import type { WorkEntry } from '../db/db';

/**
 * Work time rows keep their times in UTC, like the logbook. Before November 2026 they were kept
 * on the plan's clock (Moscow by default): those rows carry no `utc` mark and are converted once.
 */

/** Aeroflot crews are based in Moscow: night work (22:00–06:00) and «МСК» labels use this clock */
export const BASE_UTC_OFFSET_MINUTES = 180;

const pad = (value: number) => String(value).padStart(2, '0');

/** Minutes since the epoch day for a date and HH:MM */
export const absoluteMinutes = (date: string, time: string) => {
  const [year, month, day] = date.split('-').map(Number);
  const [hours, minutes] = time.split(':').map(Number);
  return Date.UTC(year, month - 1, day) / 60000 + hours * 60 + minutes;
};

/** Date and HH:MM of an absolute minute, shifted by an offset (0 for UTC) */
export function clockAt(minutes: number, offsetMinutes = 0): { date: string; time: string } {
  const at = new Date((minutes + offsetMinutes) * 60000);
  return {
    date: `${at.getUTCFullYear()}-${pad(at.getUTCMonth() + 1)}-${pad(at.getUTCDate())}`,
    time: `${pad(at.getUTCHours())}:${pad(at.getUTCMinutes())}`,
  };
}

/** Rows a plan or an old version wrote on the plan's clock, moved to UTC */
export function entryToUtc(entry: WorkEntry, offsetMinutes: number): WorkEntry {
  if (entry.utc) return entry;
  // Rows taken from the logbook always held its UTC times
  if (entry.id.startsWith('flight-') || !/^\d{1,2}:\d{2}$/.test(entry.start) || !offsetMinutes) {
    return { ...entry, utc: true };
  }
  const start = absoluteMinutes(entry.date, entry.start);
  const moved = clockAt(start - offsetMinutes);
  const end = /^\d{1,2}:\d{2}$/.test(entry.end) ? clockAt(absoluteMinutes(entry.date, entry.end) - offsetMinutes).time : entry.end;
  return { ...entry, date: moved.date, start: moved.time, end, utc: true };
}

/** The plan time zone saved with the work rates before the switch to UTC */
export function storedPlanOffset(): number {
  try {
    const rates = JSON.parse(localStorage.getItem('openlogbook_work_rates') || '{}');
    return typeof rates.planUtcOffsetMinutes === 'number' ? rates.planUtcOffsetMinutes : BASE_UTC_OFFSET_MINUTES;
  } catch {
    return BASE_UTC_OFFSET_MINUTES;
  }
}
