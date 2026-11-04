import { LocalFlight } from '../db/db';
import { parseFlightDate } from './dates';
import { isFlightTime } from './entries';

export interface PreviousHours {
  previousTotalHours?: number;
  previousPicHours?: number;
  previousSicHours?: number;
  previousNightHours?: number;
  previousLandings?: number;
}

/** One calculation for every screen, so the dashboard and the logbook cannot disagree. */
export function computeTotals(flights: LocalFlight[], previous: PreviousHours = {}) {
  const totals = {
    totalMinutes: Math.round((previous.previousTotalHours || 0) * 60),
    nightMinutes: Math.round((previous.previousNightHours || 0) * 60),
    picMinutes: Math.round((previous.previousPicHours || 0) * 60),
    sicMinutes: Math.round((previous.previousSicHours || 0) * 60),
    landingsDay: 0,
    landingsNight: 0,
    landings: previous.previousLandings || 0,
  };

  flights.filter(isFlightTime).forEach((flight) => {
    totals.totalMinutes += flight.totalTimeMinutes || 0;
    totals.nightMinutes += flight.nightTimeMinutes || 0;
    totals.picMinutes += (flight.picTimeMinutes || 0) + (flight.picusTimeMinutes || 0);
    totals.sicMinutes += flight.sicTimeMinutes || 0;
    totals.landingsDay += flight.landingsDay || 0;
    totals.landingsNight += flight.landingsNight || 0;
    totals.landings += (flight.landingsDay || 0) + (flight.landingsNight || 0);
  });

  return totals;
}

/**
 * Whether the pilot flies as commander now, judged by the latest logged flight with PIC or SIC
 * time: a first officer has no use for a PIC tile, a captain still has SIC from earlier years.
 * Without such flights the larger carried-over figure decides.
 */
export function fliesAsCommander(flights: LocalFlight[], previous: PreviousHours = {}): boolean {
  const latest = flights
    .filter((flight) => isFlightTime(flight) && (flight.picTimeMinutes || 0) + (flight.sicTimeMinutes || 0) > 0)
    .reduce<LocalFlight | null>(
      (last, flight) => (!last || `${flight.date} ${flight.outTimeUtc}` > `${last.date} ${last.outTimeUtc}` ? flight : last),
      null
    );
  if (latest) return (latest.picTimeMinutes || 0) > 0;
  return (previous.previousPicHours || 0) >= (previous.previousSicHours || 0);
}

const sumMinutes = (flights: LocalFlight[], matches: (date: Date) => boolean) =>
  flights.filter(isFlightTime).reduce((sum, flight) => (matches(parseFlightDate(flight.date)) ? sum + (flight.totalTimeMinutes || 0) : sum), 0);

export function computePeriodComparison(flights: LocalFlight[], today: Date = new Date()) {
  const year = today.getFullYear();
  const month = today.getMonth();
  const previousMonth = new Date(year, month - 1, 1);

  return {
    thisMonth: sumMinutes(flights, (d) => d.getFullYear() === year && d.getMonth() === month),
    lastMonth: sumMinutes(
      flights,
      (d) => d.getFullYear() === previousMonth.getFullYear() && d.getMonth() === previousMonth.getMonth()
    ),
    thisYear: sumMinutes(flights, (d) => d.getFullYear() === year),
    lastYear: sumMinutes(flights, (d) => d.getFullYear() === year - 1),
  };
}

export interface PersonalRecords {
  longestFlight: LocalFlight | null;
  topRoute: { dep: string; arr: string; count: number } | null;
  bestMonth: { key: string; minutes: number } | null;
}

export function computeRecords(flights: LocalFlight[]): PersonalRecords {
  let longestFlight: LocalFlight | null = null;
  const routes = new Map<string, { dep: string; arr: string; count: number }>();
  const months = new Map<string, number>();

  flights.filter(isFlightTime).forEach((flight) => {
    if (!longestFlight || (flight.totalTimeMinutes || 0) > (longestFlight.totalTimeMinutes || 0)) longestFlight = flight;

    const [dep, arr] = [flight.depIcao.toUpperCase(), flight.arrIcao.toUpperCase()].sort();
    const key = `${dep}-${arr}`;
    const route = routes.get(key) || { dep, arr, count: 0 };
    routes.set(key, { ...route, count: route.count + 1 });

    const month = flight.date.substring(0, 7);
    months.set(month, (months.get(month) || 0) + (flight.totalTimeMinutes || 0));
  });

  const topRoute = Array.from(routes.values()).sort((a, b) => b.count - a.count)[0] || null;
  const bestMonthEntry = Array.from(months.entries()).sort((a, b) => b[1] - a[1])[0];

  return {
    longestFlight,
    topRoute,
    bestMonth: bestMonthEntry ? { key: bestMonthEntry[0], minutes: bestMonthEntry[1] } : null,
  };
}
