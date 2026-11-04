import { LocalFlight, WorkEntry } from '../db/db';
import { addDays, parseFlightDate, toDateKey } from './dates';
import { isFlightTime } from './entries';
import { computeFlightLimits } from './currency';
import { computeEntryMinutes } from './workTime';

export const MONTH_NAMES = ['январь', 'февраль', 'март', 'апрель', 'май', 'июнь', 'июль', 'август', 'сентябрь', 'октябрь', 'ноябрь', 'декабрь'];
const WEEKDAY_NAMES = ['понедельник', 'вторник', 'среда', 'четверг', 'пятница', 'суббота', 'воскресенье'];

const logged = (flights: LocalFlight[]) => flights.filter(isFlightTime);

export function availableYears(flights: LocalFlight[]): number[] {
  return Array.from(new Set(logged(flights).map((flight) => Number(flight.date.substring(0, 4))))).sort((a, b) => b - a);
}

export interface YearTotals {
  minutes: number;
  flights: number;
  nightMinutes: number;
  landings: number;
}

export interface YearReport {
  year: number;
  totals: YearTotals;
  previous: YearTotals | null;
  airports: string[];
  /** Airfields visited for the first time this year */
  newAirports: string[];
  longestFlight: LocalFlight | null;
  busiestMonth: { month: number; minutes: number } | null;
  busiestWeekday: string | null;
  topRoute: { dep: string; arr: string; count: number } | null;
  types: Array<{ type: string; minutes: number }>;
  firstDate: string | null;
  lastDate: string | null;
}

const totalsOf = (flights: LocalFlight[]): YearTotals => ({
  minutes: flights.reduce((sum, f) => sum + (f.totalTimeMinutes || 0), 0),
  flights: flights.length,
  nightMinutes: flights.reduce((sum, f) => sum + (f.nightTimeMinutes || 0), 0),
  landings: flights.reduce((sum, f) => sum + (f.landingsDay || 0) + (f.landingsNight || 0), 0),
});

export function computeYearReport(flights: LocalFlight[], year: number): YearReport {
  const all = logged(flights).sort((a, b) => a.date.localeCompare(b.date));
  const inYear = all.filter((f) => f.date.startsWith(String(year)));
  const before = all.filter((f) => f.date < `${year}-01-01`);
  const previousYear = all.filter((f) => f.date.startsWith(String(year - 1)));

  const airportsOf = (list: LocalFlight[]) => new Set(list.flatMap((f) => [f.depIcao.toUpperCase(), f.arrIcao.toUpperCase()]));
  const seenBefore = airportsOf(before);
  const airports = Array.from(airportsOf(inYear)).sort();

  const months = Array.from({ length: 12 }, () => 0);
  const weekdays = Array.from({ length: 7 }, () => 0);
  const routes = new Map<string, { dep: string; arr: string; count: number }>();
  const types = new Map<string, number>();
  inYear.forEach((f) => {
    const date = parseFlightDate(f.date);
    months[date.getMonth()] += f.totalTimeMinutes || 0;
    weekdays[(date.getDay() + 6) % 7] += 1;
    const [dep, arr] = [f.depIcao.toUpperCase(), f.arrIcao.toUpperCase()].sort();
    const route = routes.get(`${dep}-${arr}`) || { dep, arr, count: 0 };
    routes.set(`${dep}-${arr}`, { ...route, count: route.count + 1 });
    const type = (f.aircraftType || '').toUpperCase();
    if (type) types.set(type, (types.get(type) || 0) + (f.totalTimeMinutes || 0));
  });

  const busiestMonthIndex = months.indexOf(Math.max(...months));
  const busiestWeekdayIndex = weekdays.indexOf(Math.max(...weekdays));

  return {
    year,
    totals: totalsOf(inYear),
    previous: previousYear.length > 0 ? totalsOf(previousYear) : null,
    airports,
    newAirports: airports.filter((icao) => !seenBefore.has(icao)),
    longestFlight: inYear.reduce<LocalFlight | null>((longest, f) => (!longest || f.totalTimeMinutes > longest.totalTimeMinutes ? f : longest), null),
    busiestMonth: inYear.length > 0 ? { month: busiestMonthIndex, minutes: months[busiestMonthIndex] } : null,
    busiestWeekday: inYear.length > 0 ? WEEKDAY_NAMES[busiestWeekdayIndex] : null,
    topRoute: Array.from(routes.values()).sort((a, b) => b.count - a.count)[0] || null,
    types: Array.from(types.entries()).map(([type, minutes]) => ({ type, minutes })).sort((a, b) => b.minutes - a.minutes),
    firstDate: inYear[0]?.date ?? null,
    lastDate: inYear[inYear.length - 1]?.date ?? null,
  };
}

/** Flight time per calendar month for each year, January first. */
export function compareYears(flights: LocalFlight[], years: number[]): Array<{ year: number; months: number[] }> {
  return years.map((year) => {
    const months = Array.from({ length: 12 }, () => 0);
    logged(flights)
      .filter((f) => f.date.startsWith(String(year)))
      .forEach((f) => {
        months[parseFlightDate(f.date).getMonth()] += f.totalTimeMinutes || 0;
      });
    return { year, months };
  });
}

export interface LimitForecast {
  key: string;
  label: string;
  limitMinutes: number;
  /** Highest projected value within the horizon and the day it is reached */
  peakMinutes: number;
  peakDate: string;
  /** First day the limit would be exceeded, if any */
  exceedsOn: string | null;
}

/**
 * Flight time limits over the coming days if the plan is flown as scheduled. Plan flights from
 * tomorrow on are added to the logbook; today's plan is left out, as it may already be logged.
 */
export function forecastLimits(flights: LocalFlight[], plan: WorkEntry[], today: Date = new Date(), horizonDays = 31): LimitForecast[] {
  const todayKey = toDateKey(today);
  const planned = plan
    .filter((entry) => entry.kind === 'flight' && entry.date > todayKey)
    .map((entry) => ({ id: entry.id, date: entry.date, totalTimeMinutes: computeEntryMinutes(entry.start, entry.end) }) as LocalFlight);
  const projected = [...logged(flights), ...planned];

  const results = new Map<string, LimitForecast>();
  for (let offset = 0; offset <= horizonDays; offset++) {
    const day = addDays(today, offset);
    const dayKey = toDateKey(day);
    computeFlightLimits(projected, day).forEach((limit) => {
      const current = results.get(limit.key) || {
        key: limit.key,
        label: limit.label,
        limitMinutes: limit.limitMinutes,
        peakMinutes: -1,
        peakDate: dayKey,
        exceedsOn: null,
      };
      if (limit.minutes > current.peakMinutes) {
        current.peakMinutes = limit.minutes;
        current.peakDate = dayKey;
      }
      if (!current.exceedsOn && limit.minutes > limit.limitMinutes) current.exceedsOn = dayKey;
      results.set(limit.key, current);
    });
  }
  return Array.from(results.values());
}

export interface UpcomingFlight {
  id: string;
  date: string;
  start: string;
  end: string;
  flightNumber: string;
  depIcao: string;
  arrIcao: string;
}

/** Plan flights of today and tomorrow, in the plan's own clock, with ICAO codes for weather. */
export function upcomingPlanFlights(plan: WorkEntry[], iataIndex: Map<string, string>, today: Date = new Date()): UpcomingFlight[] {
  const days = [toDateKey(today), toDateKey(addDays(today, 1))];
  return plan
    .filter((entry) => entry.kind === 'flight' && days.includes(entry.date))
    .flatMap((entry) => {
      const route = entry.title.toUpperCase().match(/([A-Z]{3,4})-([A-Z]{3,4})\s*$/);
      if (!route) return [];
      return [
        {
          id: entry.id,
          date: entry.date,
          start: entry.start,
          end: entry.end,
          flightNumber: entry.title.toUpperCase().match(/^([A-Z0-9]{2}\d{2,4})\s/)?.[1] || '',
          depIcao: iataIndex.get(route[1]) || route[1],
          arrIcao: iataIndex.get(route[2]) || route[2],
        },
      ];
    })
    .sort((a, b) => a.date.localeCompare(b.date) || a.start.localeCompare(b.start));
}
