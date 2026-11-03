import { LocalFlight } from '../db/db';
import { addDays, parseFlightDate, toDateKey } from './dates';

export type StatsPeriod = '12m' | 'year' | 'all';

export const STATS_PERIOD_LABELS: Record<StatsPeriod, string> = {
  '12m': '12 месяцев',
  year: 'Этот год',
  all: 'Всё время',
};

const HEATMAP_WEEKS = 53;
const TOP_LIMIT = 8;
const MONTH_LABELS = ['янв', 'фев', 'мар', 'апр', 'май', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
export const WEEKDAY_LABELS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];

export interface StatsTotals {
  minutes: number;
  flights: number;
  nightMinutes: number;
  picMinutes: number;
  landings: number;
}

export interface TimeBucket {
  key: string;
  label: string;
  dayMinutes: number;
  nightMinutes: number;
  flights: number;
}

export interface Share {
  label: string;
  minutes: number;
  flights: number;
}

export interface HeatmapDay {
  date: string;
  minutes: number;
  flights: number;
}

export interface Statistics {
  totals: StatsTotals;
  previousTotals: StatsTotals | null;
  timeline: TimeBucket[];
  byType: Share[];
  byRole: Share[];
  byHandling: Share[];
  byWeekday: Share[];
  approaches: Share[];
  airports: Share[];
  heatmap: { weeks: Array<Array<HeatmapDay | null>>; maxMinutes: number };
}

const emptyTotals = (): StatsTotals => ({ minutes: 0, flights: 0, nightMinutes: 0, picMinutes: 0, landings: 0 });

function totalsOf(flights: LocalFlight[]): StatsTotals {
  return flights.reduce((totals, flight) => {
    totals.minutes += flight.totalTimeMinutes || 0;
    totals.flights += 1;
    totals.nightMinutes += flight.nightTimeMinutes || 0;
    totals.picMinutes += (flight.picTimeMinutes || 0) + (flight.picusTimeMinutes || 0);
    totals.landings += (flight.landingsDay || 0) + (flight.landingsNight || 0);
    return totals;
  }, emptyTotals());
}

function getRanges(period: StatsPeriod, today: Date) {
  const year = today.getFullYear();
  const month = today.getMonth();
  if (period === 'year') {
    return {
      current: { from: `${year}-01-01`, to: `${year}-12-31` },
      previous: { from: `${year - 1}-01-01`, to: `${year - 1}-12-31` },
    };
  }
  if (period === '12m') {
    return {
      current: { from: toDateKey(new Date(year, month - 11, 1)), to: toDateKey(today) },
      previous: { from: toDateKey(new Date(year, month - 23, 1)), to: toDateKey(new Date(year, month - 11, 0)) },
    };
  }
  return { current: null, previous: null };
}

const inRange = (flights: LocalFlight[], range: { from: string; to: string } | null) =>
  range ? flights.filter((flight) => flight.date >= range.from && flight.date <= range.to) : flights;

function buildTimeline(flights: LocalFlight[], period: StatsPeriod, today: Date): TimeBucket[] {
  const buckets = new Map<string, TimeBucket>();
  const year = today.getFullYear();

  if (period === 'all') {
    // Years: a career of monthly bars would be unreadable
    const years = flights.map((flight) => Number(flight.date.substring(0, 4)));
    const first = years.length > 0 ? Math.min(...years) : year;
    for (let y = first; y <= year; y++) buckets.set(String(y), { key: String(y), label: String(y), dayMinutes: 0, nightMinutes: 0, flights: 0 });
  } else {
    const start = period === 'year' ? new Date(year, 0, 1) : new Date(year, today.getMonth() - 11, 1);
    for (let i = 0; i < 12; i++) {
      const date = new Date(start.getFullYear(), start.getMonth() + i, 1);
      const key = toDateKey(date).substring(0, 7);
      buckets.set(key, { key, label: MONTH_LABELS[date.getMonth()], dayMinutes: 0, nightMinutes: 0, flights: 0 });
    }
  }

  flights.forEach((flight) => {
    const bucket = buckets.get(period === 'all' ? flight.date.substring(0, 4) : flight.date.substring(0, 7));
    if (!bucket) return;
    const night = Math.min(flight.nightTimeMinutes || 0, flight.totalTimeMinutes || 0);
    bucket.nightMinutes += night;
    bucket.dayMinutes += (flight.totalTimeMinutes || 0) - night;
    bucket.flights += 1;
  });

  return Array.from(buckets.values());
}

function shareBy(flights: LocalFlight[], getLabel: (flight: LocalFlight) => string | undefined, limit = TOP_LIMIT): Share[] {
  const shares = new Map<string, Share>();
  flights.forEach((flight) => {
    const label = getLabel(flight);
    if (!label) return;
    const share = shares.get(label) || { label, minutes: 0, flights: 0 };
    share.minutes += flight.totalTimeMinutes || 0;
    share.flights += 1;
    shares.set(label, share);
  });
  return Array.from(shares.values())
    .sort((a, b) => b.minutes - a.minutes || b.flights - a.flights || a.label.localeCompare(b.label))
    .slice(0, limit);
}

function buildHeatmap(flights: LocalFlight[], end: Date) {
  const byDate = new Map<string, HeatmapDay>();
  flights.forEach((flight) => {
    const day = byDate.get(flight.date) || { date: flight.date, minutes: 0, flights: 0 };
    day.minutes += flight.totalTimeMinutes || 0;
    day.flights += 1;
    byDate.set(flight.date, day);
  });

  // Columns are weeks starting on Monday; days after `end` stay empty
  const mondayOffset = (end.getDay() + 6) % 7;
  const start = addDays(end, -mondayOffset - (HEATMAP_WEEKS - 1) * 7);
  const weeks: Array<Array<HeatmapDay | null>> = [];
  let maxMinutes = 0;

  for (let week = 0; week < HEATMAP_WEEKS; week++) {
    const column: Array<HeatmapDay | null> = [];
    for (let weekday = 0; weekday < 7; weekday++) {
      const date = addDays(start, week * 7 + weekday);
      if (date > end) {
        column.push(null);
        continue;
      }
      const key = toDateKey(date);
      const day = byDate.get(key) || { date: key, minutes: 0, flights: 0 };
      maxMinutes = Math.max(maxMinutes, day.minutes);
      column.push(day);
    }
    weeks.push(column);
  }

  return { weeks, maxMinutes };
}

export function computeStatistics(flights: LocalFlight[], period: StatsPeriod, today: Date = new Date()): Statistics {
  const ranges = getRanges(period, today);
  const selected = inRange(flights, ranges.current);
  const heatmapEnd = period === 'year' ? new Date(today.getFullYear(), 11, 31) : today;

  const handling = (flight: LocalFlight) =>
    flight.flightHandling === 'PF' ? 'PF' : flight.flightHandling === 'PM' ? 'PM' : flight.flightHandling ? 'Другое' : undefined;

  return {
    totals: totalsOf(selected),
    previousTotals: ranges.previous ? totalsOf(inRange(flights, ranges.previous)) : null,
    timeline: buildTimeline(selected, period, today),
    byType: shareBy(selected, (flight) => (flight.aircraftType || '').toUpperCase() || undefined),
    byRole: shareBy(selected, (flight) => flight.flightRole),
    byHandling: shareBy(selected, handling),
    byWeekday: WEEKDAY_LABELS.map((label, index) => {
      const day = selected.filter((flight) => (parseFlightDate(flight.date).getDay() + 6) % 7 === index);
      return { label, minutes: day.reduce((sum, flight) => sum + (flight.totalTimeMinutes || 0), 0), flights: day.length };
    }),
    approaches: shareBy(selected, (flight) => flight.approachType?.trim() || undefined, 6),
    airports: (() => {
      const visits = new Map<string, Share>();
      selected.forEach((flight) => {
        new Set([flight.depIcao.toUpperCase(), flight.arrIcao.toUpperCase()]).forEach((icao) => {
          const share = visits.get(icao) || { label: icao, minutes: 0, flights: 0 };
          share.flights += 1;
          share.minutes += flight.totalTimeMinutes || 0;
          visits.set(icao, share);
        });
      });
      return Array.from(visits.values())
        .sort((a, b) => b.flights - a.flights || a.label.localeCompare(b.label))
        .slice(0, TOP_LIMIT);
    })(),
    heatmap: buildHeatmap(inRange(flights, period === 'year' ? ranges.current : null), heatmapEnd),
  };
}

/** Relative change, or null when there is nothing to compare with. */
export function percentChange(current: number, previous: number | undefined): number | null {
  if (previous === undefined || previous === 0) return null;
  return Math.round(((current - previous) / previous) * 100);
}
