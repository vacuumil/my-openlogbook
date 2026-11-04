import { WorkEntry } from '../db/db';
import { FlightDuty, routeOf } from './workTime';
import { absoluteMinutes, clockAt } from './workClock';

export interface CalendarDay {
  date: string;
  inMonth: boolean;
  /** Duties that report on this day (UTC) */
  duties: FlightDuty[];
  /** Duties that began on an earlier day and run past this day's midnight */
  continued: FlightDuty[];
  /** Other work and days off */
  entries: WorkEntry[];
  /** Airport of a night stay away from base that covers this day */
  layover?: string;
}

/** The airport most duties start from: no setting needed for a pilot who always flies from one base */
export function guessBase(duties: FlightDuty[]): string | null {
  const counts = new Map<string, number>();
  duties.forEach((duty) => {
    const dep = routeOf(duty.legs[0]?.title || '')?.dep;
    if (dep) counts.set(dep, (counts.get(dep) || 0) + 1);
  });
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
}

/** Stays away from base between two duties: the first ends at an outstation, the next starts there */
export function layoversOf(duties: FlightDuty[]): Array<{ airport: string; from: number; to: number }> {
  const base = guessBase(duties);
  const ordered = [...duties].sort((a, b) => a.startAt - b.startAt);
  return ordered.flatMap((duty, index) => {
    const next = ordered[index + 1];
    const landed = routeOf(duty.legs[duty.legs.length - 1]?.title || '')?.arr;
    const departs = next ? routeOf(next.legs[0]?.title || '')?.dep : undefined;
    if (!next || !landed || landed === base || departs !== landed) return [];
    return [{ airport: landed, from: duty.endAt, to: next.startAt }];
  });
}

/** Weeks of a month from Monday to Sunday, with the days around it to fill the grid */
export function buildCalendar(month: string, duties: FlightDuty[], entries: WorkEntry[]): CalendarDay[][] {
  const first = absoluteMinutes(`${month}-01`, '00:00');
  const weekday = (new Date(first * 60000).getUTCDay() + 6) % 7;
  const [year, monthNumber] = month.split('-').map(Number);
  const length = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
  const cells = Math.ceil((weekday + length) / 7) * 7;
  const layovers = layoversOf(duties);

  const days: CalendarDay[] = Array.from({ length: cells }, (_, index) => {
    const dayStart = first + (index - weekday) * 1440;
    const date = clockAt(dayStart).date;
    const stay = layovers.find(({ from, to }) => from < dayStart + 1440 && to > dayStart);
    return {
      date,
      inMonth: date.startsWith(month),
      duties: duties.filter((duty) => duty.date === date),
      continued: duties.filter((duty) => duty.startAt < dayStart && duty.endAt > dayStart),
      entries: entries.filter((entry) => entry.kind !== 'flight' && entry.date === date),
      ...(stay ? { layover: stay.airport } : {}),
    };
  });

  return Array.from({ length: cells / 7 }, (_, week) => days.slice(week * 7, week * 7 + 7));
}

/** Short route of a duty without the base: SVO-PEE-SVO reads as PEE */
export function dutyDestinations(duty: FlightDuty, base: string | null): string {
  const stops = duty.legs.flatMap((leg) => {
    const route = routeOf(leg.title);
    return route ? [route.dep, route.arr] : [];
  });
  const away = Array.from(new Set(stops.filter((code) => code !== base)));
  return away.join('·') || stops[stops.length - 1] || duty.legs[0]?.title || 'Рейс';
}
