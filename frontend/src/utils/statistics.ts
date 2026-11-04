import { LocalFlight } from '../db/db';
import { addDays, daysBetween, parseFlightDate, toDateKey } from './dates';

export type StatsPeriod = '12m' | 'year' | 'all' | 'custom';
export type StatsGranularity = 'day' | 'month' | 'year';

export interface DateRange {
  from: string;
  to: string;
}

export const STATS_PERIOD_LABELS: Record<StatsPeriod, string> = {
  '12m': '12 месяцев',
  year: 'Этот год',
  all: 'Всё время',
  custom: 'Свой период',
};

/** Daily bars stay readable up to about two months, monthly ones up to two years. */
const MAX_DAILY_BUCKETS = 62;
const MAX_MONTHLY_BUCKETS = 24;

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
  granularity: StatsGranularity;
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

export function normalizeRange(range: DateRange): DateRange {
  return range.from <= range.to ? range : { from: range.to, to: range.from };
}

function getRanges(period: StatsPeriod, today: Date, custom?: DateRange) {
  const year = today.getFullYear();
  if (period === 'custom' && custom?.from && custom?.to) {
    const current = normalizeRange(custom);
    const start = parseFlightDate(current.from);
    const length = daysBetween(start, parseFlightDate(current.to)) + 1;
    // The comparison is the stretch of the same length just before
    return {
      current,
      previous: { from: toDateKey(addDays(start, -length)), to: toDateKey(addDays(start, -1)) },
    };
  }
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

const monthsBetween = (from: string, to: string) =>
  (Number(to.substring(0, 4)) - Number(from.substring(0, 4))) * 12 + Number(to.substring(5, 7)) - Number(from.substring(5, 7)) + 1;

function getGranularity(period: StatsPeriod, range: DateRange | null): StatsGranularity {
  if (period === 'all') return 'year';
  if (period !== 'custom' || !range) return 'month';
  if (daysBetween(parseFlightDate(range.from), parseFlightDate(range.to)) + 1 <= MAX_DAILY_BUCKETS) return 'day';
  return monthsBetween(range.from, range.to) <= MAX_MONTHLY_BUCKETS ? 'month' : 'year';
}

const emptyBucket = (key: string, label: string): TimeBucket => ({ key, label, dayMinutes: 0, nightMinutes: 0, flights: 0 });

function buildTimeline(
  flights: LocalFlight[],
  granularity: StatsGranularity,
  period: StatsPeriod,
  range: DateRange | null,
  today: Date
): TimeBucket[] {
  const buckets = new Map<string, TimeBucket>();
  const year = today.getFullYear();

  if (granularity === 'day' && range) {
    const start = parseFlightDate(range.from);
    const days = daysBetween(start, parseFlightDate(range.to)) + 1;
    for (let i = 0; i < days; i++) {
      const date = addDays(start, i);
      const key = toDateKey(date);
      buckets.set(key, emptyBucket(key, `${date.getDate()} ${MONTH_LABELS[date.getMonth()]}`));
    }
  } else if (granularity === 'year') {
    // Years: a career of monthly bars would be unreadable
    const years = flights.map((flight) => Number(flight.date.substring(0, 4)));
    const first = range ? Number(range.from.substring(0, 4)) : years.length > 0 ? Math.min(...years) : year;
    const last = range ? Number(range.to.substring(0, 4)) : year;
    for (let y = first; y <= last; y++) buckets.set(String(y), emptyBucket(String(y), String(y)));
  } else {
    const start = range
      ? parseFlightDate(`${range.from.substring(0, 7)}-01`)
      : period === 'year'
        ? new Date(year, 0, 1)
        : new Date(year, today.getMonth() - 11, 1);
    const count = range ? monthsBetween(range.from, range.to) : 12;
    const spansYears = range ? range.from.substring(0, 4) !== range.to.substring(0, 4) : false;
    for (let i = 0; i < count; i++) {
      const date = new Date(start.getFullYear(), start.getMonth() + i, 1);
      const key = toDateKey(date).substring(0, 7);
      const label = spansYears ? `${MONTH_LABELS[date.getMonth()]} ${String(date.getFullYear()).slice(-2)}` : MONTH_LABELS[date.getMonth()];
      buckets.set(key, emptyBucket(key, label));
    }
  }

  const keyLength = granularity === 'day' ? 10 : granularity === 'month' ? 7 : 4;
  flights.forEach((flight) => {
    const bucket = buckets.get(flight.date.substring(0, keyLength));
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

export function computeStatistics(
  flights: LocalFlight[],
  period: StatsPeriod,
  today: Date = new Date(),
  custom?: DateRange
): Statistics {
  const ranges = getRanges(period, today, custom);
  const selected = inRange(flights, ranges.current);
  const customRange = period === 'custom' ? ranges.current : null;
  const granularity = getGranularity(period, customRange);
  const heatmapEnd = customRange
    ? parseFlightDate(customRange.to)
    : period === 'year'
      ? new Date(today.getFullYear(), 11, 31)
      : today;

  const handling = (flight: LocalFlight) =>
    flight.flightHandling === 'PF' ? 'PF' : flight.flightHandling === 'PM' ? 'PM' : flight.flightHandling ? 'Другое' : undefined;

  return {
    granularity,
    totals: totalsOf(selected),
    previousTotals: ranges.previous ? totalsOf(inRange(flights, ranges.previous)) : null,
    timeline: buildTimeline(selected, granularity, period, customRange, today),
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
    heatmap: buildHeatmap(inRange(flights, period === 'year' || customRange ? ranges.current : null), heatmapEnd),
  };
}

/** Relative change, or null when there is nothing to compare with. */
export function percentChange(current: number, previous: number | undefined): number | null {
  if (previous === undefined || previous === 0) return null;
  return Math.round(((current - previous) / previous) * 100);
}
