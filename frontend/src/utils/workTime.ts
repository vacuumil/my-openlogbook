import { DutyLink, LocalFlight, WorkEntry, WorkKind } from '../db/db';
import { generateUUID } from './uuid';
import { isFlightTime } from './entries';
import { absoluteMinutes, BASE_UTC_OFFSET_MINUTES, clockAt } from './workClock';

export const WORK_KIND_LABELS: Record<WorkKind, string> = {
  flight: 'Рейс',
  reserve: 'Резерв',
  training: 'Тренажёр, обучение',
  ground: 'Наземная работа',
  vacation: 'Отпуск',
  sick: 'Больничный',
  off: 'Выходной',
};

export const PAID_KINDS: WorkKind[] = ['flight', 'reserve', 'training', 'ground'];

export type FlightPayBasis = 'duty' | 'block';

export interface WorkRates {
  monthlyBase: number;
  hourly: Record<string, number>;
  nightPercent: number;
  /** Report time before the first departure of a duty */
  reportMinutes: number;
  /** Release time after the last engine shutdown of a duty */
  releaseMinutes: number;
  flightPayBasis: FlightPayBasis;
  /** Offset of a loaded plan's clock from UTC; Russian airline plans use Moscow time */
  planUtcOffsetMinutes: number;
  /** A stay away from base this long or longer is a layover: the duty ends before it */
  layoverMinutes: number;
  /** Release after the last shutdown when a post-flight medical check is needed */
  medicalReleaseMinutes: number;
  /** Monthly flight time limit: 80 hours, or 90 with the crew member's written consent (Order 139, pp. 11–12) */
  flightLimitHours: 80 | 90;
}

export const DEFAULT_WORK_RATES: WorkRates = {
  monthlyBase: 0,
  hourly: {},
  nightPercent: 0,
  reportMinutes: 60,
  releaseMinutes: 30,
  flightPayBasis: 'duty',
  planUtcOffsetMinutes: 180,
  layoverMinutes: 12 * 60,
  medicalReleaseMinutes: 40,
  flightLimitHours: 80,
};

/** Legs closer than this belong to one duty: a turnaround, not a rest. */
export const MAX_TURNAROUND_MINUTES = 4 * 60;

/** Departure and arrival codes from a title such as "SU1480 SVO-KJA" or "SVO/B-KJA" */
export function routeOf(title: string): { dep: string; arr: string } | null {
  const matches = [...title.toUpperCase().matchAll(/\b([A-Z]{3,4})(?:\/[A-Z0-9]+)?\s*-\s*([A-Z]{3,4})\b/g)];
  const last = matches[matches.length - 1];
  return last ? { dep: last[1], arr: last[2] } : null;
}

const KIND_TOKENS: Array<[WorkKind, string[]]> = [
  ['vacation', ['ОТПУСК', 'ОТП', 'VAC', 'VACATION', 'LEAVE']],
  ['sick', ['БОЛЬНИЧНЫЙ', 'БЛ', 'SICK']],
  ['off', ['ВЫХОДНОЙ', 'ВЫХ', 'OFF']],
  ['reserve', ['РЕЗЕРВ', 'РЕЗ', 'ДЕЖУРСТВО', 'ДЕЖ', 'RES', 'SBY', 'STBY', 'STANDBY']],
  ['training', ['ТРЕНАЖЁР', 'ТРЕНАЖЕР', 'ТР', 'ОБУЧЕНИЕ', 'КПК', 'SIM', 'FFS', 'LPC', 'OPC', 'TRN']],
  ['ground', ['НАЗЕМНАЯ', 'КЛАСС', 'МЕДОСМОТР', 'ВЛЭК', 'GRD', 'OFFICE', 'MED']],
];

const MONTHS: Record<string, number> = {
  JAN: 1, FEB: 2, MAR: 3, APR: 4, MAY: 5, JUN: 6, JUL: 7, AUG: 8, SEP: 9, OCT: 10, NOV: 11, DEC: 12,
  ЯНВ: 1, ФЕВ: 2, МАР: 3, АПР: 4, МАЙ: 5, МАЯ: 5, ИЮН: 6, ИЮЛ: 7, АВГ: 8, СЕН: 9, ОКТ: 10, НОЯ: 11, ДЕК: 12,
};

const pad = (value: number) => String(value).padStart(2, '0');
const isValidDay = (day: number) => day >= 1 && day <= 31;

export function computeEntryMinutes(start: string, end: string): number {
  if (!/^\d{1,2}:\d{2}$/.test(start) || !/^\d{1,2}:\d{2}$/.test(end)) return 0;
  const toMinutes = (time: string) => {
    const [hours, minutes] = time.split(':').map(Number);
    return hours * 60 + minutes;
  };
  const difference = toMinutes(end) - toMinutes(start);
  // Work that ends on the next calendar day
  return difference < 0 ? difference + 24 * 60 : difference;
}

/** Finds the month a plan covers from its header, for rows that only state the day. */
export function detectPlanMonth(lines: string[], fallback: string): string {
  for (const line of lines) {
    const upper = line.toUpperCase();
    const numeric = upper.match(/(?:^|[^\d.])(0?[1-9]|1[0-2])[./](20\d{2})(?![\d.])/);
    if (numeric) return `${numeric[2]}-${pad(Number(numeric[1]))}`;

    const named = upper.match(/([A-ZА-ЯЁ]{3,})\s+(20\d{2})/);
    const month = named && MONTHS[named[1].substring(0, 3)];
    if (named && month) return `${named[2]}-${pad(month)}`;
  }
  return fallback;
}

function extractDate(line: string, month: string): { date: string; rest: string } | null {
  const [fallbackYear, fallbackMonth] = month.split('-').map(Number);

  const iso = line.match(/\b(20\d{2})-(\d{2})-(\d{2})\b/);
  if (iso) return { date: iso[0], rest: line.replace(iso[0], ' ') };

  const dotted = line.match(/(?:^|[^\d:])(\d{1,2})[./](\d{1,2})(?:[./](\d{2,4}))?(?![\d:])/);
  if (dotted && isValidDay(Number(dotted[1])) && Number(dotted[2]) <= 12) {
    const yearText = dotted[3];
    const year = yearText ? (yearText.length === 2 ? 2000 + Number(yearText) : Number(yearText)) : fallbackYear;
    return {
      date: `${year}-${pad(Number(dotted[2]))}-${pad(Number(dotted[1]))}`,
      rest: line.replace(dotted[0], ' '),
    };
  }

  const named = line.toUpperCase().match(/(?:^|[^\dA-ZА-ЯЁ])(\d{1,2})\s*([A-ZА-ЯЁ]{3,})/);
  const namedMonth = named && MONTHS[named[2].substring(0, 3)];
  if (named && namedMonth && isValidDay(Number(named[1]))) {
    return { date: `${fallbackYear}-${pad(namedMonth)}-${pad(Number(named[1]))}`, rest: line.replace(new RegExp(`${named[1]}\\s*${named[2]}`, 'i'), ' ') };
  }

  const leadingDay = line.match(/^\s*(\d{1,2})(?=[\s,.;|]|$)(?![:.]\d)/);
  if (leadingDay && isValidDay(Number(leadingDay[1]))) {
    return { date: `${fallbackYear}-${pad(fallbackMonth)}-${pad(Number(leadingDay[1]))}`, rest: line.replace(leadingDay[1], ' ') };
  }

  return null;
}

function detectKind(text: string): WorkKind | null {
  const tokens = text.toUpperCase().split(/[^\p{L}\p{N}]+/u);
  return KIND_TOKENS.find(([, words]) => words.some((word) => tokens.includes(word)))?.[0] ?? null;
}

const makeEntry = (fields: Partial<WorkEntry> & Pick<WorkEntry, 'date' | 'kind'>): WorkEntry => ({
  id: generateUUID(),
  title: '',
  start: '',
  end: '',
  nightMinutes: 0,
  note: '',
  ...fields,
});

// Crew plan layout: one row with the date, departure and arrival, then a row with durations,
// aircraft type and flight number, e.g.
//   01.11, Вс 17:35 SVO/B - Шереметьево (B) 19:45 PEE - Пермь
//   4 ч 30 мин 2 ч 10 мин A-320A - SU1204
const CREW_PLAN_LEG =
  /^(?:(\d{1,2})\.(\d{1,2})(?:\.(\d{2,4}))?,?\s+\S+\s+)?(\d{1,2}:\d{2})\s+([A-Z]{3})(?:\/\w+)?\s+-\s+.*?\s(\d{1,2}:\d{2})\s+([A-Z]{3})(?:\/\w+)?\s+-\s+/;
const CREW_PLAN_FLIGHT = /([A-Z]{1,2}-?\d{3}[A-Z0-9]?)\s+-\s+([A-Z0-9]{2}\d{2,4})\s*$/;
const PLANNED_FLIGHT_TIME = /Планируемое\s+пол[её]тное\s+время\s+(\d+)\s*ч\s*(\d+)\s*мин/i;

const minutesOfDay = (time: string) => {
  const [hours, minutes] = time.split(':').map(Number);
  return hours * 60 + minutes;
};

/** The flight time a crew plan states for the month, to check the import against. */
export function getPlannedFlightMinutes(lines: string[]): number | null {
  for (const line of lines) {
    const match = line.match(PLANNED_FLIGHT_TIME);
    if (match) return Number(match[1]) * 60 + Number(match[2]);
  }
  return null;
}

function parseCrewPlan(lines: string[], month: string): WorkEntry[] {
  const [planYear, planMonth] = month.split('-').map(Number);
  const entries: WorkEntry[] = [];
  let currentDate: string | null = null;
  // End of the previous leg in minutes from the current date's midnight
  let previousEnd = -Infinity;

  lines.forEach((line) => {
    const leg = line.match(CREW_PLAN_LEG);
    if (leg) {
      const [, day, monthText, yearText, start, dep, end, arr] = leg;
      if (day) {
        const year = yearText ? (yearText.length === 2 ? 2000 + Number(yearText) : Number(yearText)) : planYear;
        // A December plan may end with a flight on 1 January
        const legMonth = Number(monthText);
        const legYear = !yearText && legMonth < planMonth ? year + 1 : year;
        currentDate = `${legYear}-${pad(legMonth)}-${pad(Number(day))}`;
        previousEnd = -Infinity;
      }
      if (!currentDate) return;

      // The plan prints the date once per duty: a later leg that starts "earlier" is on the next day
      let date: string = currentDate;
      let startAt = minutesOfDay(start);
      while (startAt < previousEnd) {
        startAt += 24 * 60;
      }
      const dayShift = Math.floor(startAt / (24 * 60));
      if (dayShift > 0) {
        const [y, m, d] = currentDate.split('-').map(Number);
        const shifted = new Date(y, m - 1, d + dayShift);
        date = `${shifted.getFullYear()}-${pad(shifted.getMonth() + 1)}-${pad(shifted.getDate())}`;
      }
      previousEnd = startAt + computeEntryMinutes(start.padStart(5, '0'), end.padStart(5, '0'));

      entries.push(
        makeEntry({
          date,
          kind: 'flight',
          title: `${dep}-${arr}`,
          start: start.padStart(5, '0'),
          end: end.padStart(5, '0'),
          // The plan prints the date once per duty, so an undated leg continues the duty above
          ...(day ? {} : { dutyLink: 'continue' as const }),
        })
      );
      return;
    }

    const flight = line.match(CREW_PLAN_FLIGHT);
    const last = entries[entries.length - 1];
    if (flight && last && !last.note) {
      last.title = `${flight[2]} ${last.title}`;
      last.note = flight[1];
    }
  });

  return entries;
}

/**
 * Airline plans have no common layout, so rows are recognised by content: a date, a duty word or
 * route, and times. Whatever is guessed wrong stays editable in the table.
 */
export function parseDutyPlan(lines: string[], fallbackMonth: string): WorkEntry[] {
  const month = detectPlanMonth(lines, fallbackMonth);
  const crewPlan = parseCrewPlan(lines, month);
  if (crewPlan.length > 0) return crewPlan;

  const entries: WorkEntry[] = [];
  let currentDate: string | null = null;

  lines.forEach((line) => {
    const extracted = extractDate(line, month);
    const text = extracted ? extracted.rest : line;
    const times = text.match(/\b(?:[01]?\d|2[0-3]):[0-5]\d\b/g) || [];
    const route = text.toUpperCase().match(/[A-ZА-ЯЁ]{3,4}(?:\s*[-–—/>]\s*[A-ZА-ЯЁ]{3,4})+/)?.[0].replace(/\s+/g, '');
    const flightNumber = text.toUpperCase().match(/\b[A-ZА-Я0-9]{2}\s?\d{2,4}\b/)?.[0].replace(/\s+/g, '');
    const hasFlightNumber = Boolean(flightNumber && /[A-ZА-Я]/.test(flightNumber));
    const kind = route || hasFlightNumber ? 'flight' : detectKind(text);

    if (extracted && !kind && times.length === 0) return;
    if (!kind && times.length < 2) return;

    const date = extracted?.date ?? currentDate;
    if (!date) return;
    currentDate = date;

    entries.push(
      makeEntry({
        date,
        kind: kind ?? 'ground',
        title: [hasFlightNumber ? flightNumber : '', route].filter(Boolean).join(' '),
        start: times[0]?.padStart(5, '0') ?? '',
        end: times.length > 1 ? times[times.length - 1].padStart(5, '0') : '',
      })
    );
  });

  return entries;
}

export function entriesFromFlights(flights: LocalFlight[], month: string): WorkEntry[] {
  return flights
    .filter((flight) => flight.date.startsWith(month) && flight.syncStatus !== 'deleted' && isFlightTime(flight))
    .sort((a, b) => a.date.localeCompare(b.date) || a.outTimeUtc.localeCompare(b.outTimeUtc))
    .map((flight) =>
      makeEntry({
        id: `flight-${flight.id}`,
        date: flight.date,
        kind: 'flight',
        title: `${flight.depIcao}-${flight.arrIcao}`,
        start: flight.outTimeUtc,
        end: flight.inTimeUtc,
        nightMinutes: flight.nightTimeMinutes || 0,
      })
    );
}

const entryKey = (entry: WorkEntry) => `${entry.date}|${entry.kind}|${entry.title}|${entry.start}`;

/** Loading the same plan twice must not double the hours. */
export function withoutDuplicates(existing: WorkEntry[], incoming: WorkEntry[]): WorkEntry[] {
  const seen = new Set(existing.map(entryKey));
  return incoming.filter((entry) => {
    const key = entryKey(entry);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export const DUTY_LINK_LABELS: Record<DutyLink, string> = {
  auto: 'Авто',
  continue: 'Одна смена',
  split: 'Разделённая',
  separate: 'Новая смена',
};

/** A rest this long inside a night stay away from base makes the duty a split one */
export const MIN_SPLIT_BREAK_MINUTES = 3 * 60;

export type DutySegmentKind = 'report' | 'leg' | 'deadhead' | 'wait' | 'rest' | 'release';

/** One piece of a duty's timeline, in UTC minutes since the epoch day */
export interface DutySegment {
  kind: DutySegmentKind;
  from: number;
  to: number;
  entry?: WorkEntry;
}

export interface FlightDuty {
  /** UTC date of the report */
  date: string;
  /** Minutes from the duty date's midnight (UTC); may exceed 24 hours */
  reportAt: number;
  releaseAt: number;
  /** Absolute UTC minutes of report and release */
  startAt: number;
  endAt: number;
  /** Working time: report to release, less the rest of a split duty */
  minutes: number;
  /** Report to release */
  flightDutyMinutes: number;
  /** Block time actually flown */
  blockMinutes: number;
  /** Time flown as a passenger */
  deadheadMinutes: number;
  /** Flight time for the limits: flown block plus half of the passenger time (Order 139) */
  flightTimeMinutes: number;
  /** Working time between 22:00 and 06:00 Moscow time */
  nightMinutes: number;
  /** Half or more of the duty falls between 22:00 and 06:00 at base (Order 139, p. 63) */
  isNight: boolean;
  landings: number;
  legs: WorkEntry[];
  breakMinutes: number;
  isSplit: boolean;
  medicalCheck: boolean;
  /** Longest duty allowed for this report time and number of landings (Order 139, Appendix 1) */
  maxDutyMinutes: number;
  segments: DutySegment[];
}

export const formatDutyLength = (minutes: number) => {
  const total = Math.round(Math.abs(minutes));
  return `${minutes < 0 ? '−' : ''}${Math.floor(total / 60)}:${pad(total % 60)}`;
};

export const formatClock = (minutesFromMidnight: number) => {
  const normalized = ((minutesFromMidnight % 1440) + 1440) % 1440;
  const dayShift = Math.floor(minutesFromMidnight / 1440);
  const time = `${pad(Math.floor(normalized / 60))}:${pad(normalized % 60)}`;
  return dayShift === 0 ? time : `${time} (${dayShift > 0 ? '+' : ''}${dayShift} д)`;
};

/** HH:MM of an absolute minute in UTC and in Moscow time */
export const utcClock = (at: number) => clockAt(at).time;
export const mskClock = (at: number) => clockAt(at, BASE_UTC_OFFSET_MINUTES).time;

/** Night on the base clock: 22:00–06:00 Moscow time, as the Labour Code counts it */
const NIGHT_START = 22 * 60;
const NIGHT_END = 6 * 60;

/** Minutes of [from, to) (UTC minutes) that fall into the night at base */
export function nightOverlap(from: number, to: number): number {
  const start = from + BASE_UTC_OFFSET_MINUTES;
  const end = to + BASE_UTC_OFFSET_MINUTES;
  let total = 0;
  for (let day = Math.floor(start / 1440) - 1; day <= Math.floor(end / 1440); day++) {
    const nightStart = day * 1440 + NIGHT_START;
    const nightEnd = (day + 1) * 1440 + NIGHT_END;
    total += Math.max(0, Math.min(end, nightEnd) - Math.max(start, nightStart));
  }
  return total;
}

/**
 * Order 139, Appendix 1: crews of two or more pilots. The limit depends on the report time at base
 * and the number of landings.
 */
export function maxDutyMinutes(reportAt: number, landings: number): number {
  const local = (((reportAt + BASE_UTC_OFFSET_MINUTES) % 1440) + 1440) % 1440;
  const day = local > 6 * 60 && local < 22 * 60;
  if (landings <= 2) return day ? 12 * 60 : 11 * 60;
  if (landings <= 4) return day ? 10 * 60 + 30 : 10 * 60;
  return day ? 8 * 60 + 30 : 6 * 60 + 30;
}

type Leg = { entry: WorkEntry; start: number; end: number };

/** The crew is away from where the duty began and flies on from where it landed */
function isAwayTurnaround(duty: Leg[], next: Leg): boolean {
  const origin = routeOf(duty[0].entry.title)?.dep;
  const landed = routeOf(duty[duty.length - 1].entry.title)?.arr;
  const departs = routeOf(next.entry.title)?.dep;
  return Boolean(origin && landed && landed !== origin && departs === landed);
}

/** A hand-set HH:MM UTC as the nearest moment before (report) or after (release) an anchor */
function nearestClock(time: string | undefined, anchor: number, direction: -1 | 1): number | null {
  if (!time || !/^\d{1,2}:\d{2}$/.test(time)) return null;
  const [hours, minutes] = time.split(':').map(Number);
  let at = Math.floor(anchor / 1440) * 1440 + hours * 60 + minutes;
  if (direction < 0 && at > anchor) at -= 1440;
  if (direction > 0 && at < anchor) at += 1440;
  return at;
}

/**
 * Flight legs grouped into duties. Legs of one roster pairing (SU1204/SU1205) are one duty: the
 * crew cannot end it at the outstation, so the wait between them is work. A night stay away from
 * base splits the duty (the hotel rest is not work); a stay of a full layover ends it. The pilot can
 * override every link by hand.
 */
export function buildFlightDuties(entries: WorkEntry[], rates: Partial<WorkRates> = {}): FlightDuty[] {
  const settings = { ...DEFAULT_WORK_RATES, ...rates };
  const report = settings.reportMinutes || 0;
  const legs: Leg[] = entries
    .filter((entry) => entry.kind === 'flight' && computeEntryMinutes(entry.start, entry.end) > 0)
    .map((entry) => {
      const start = absoluteMinutes(entry.date, entry.start);
      return { entry, start, end: start + computeEntryMinutes(entry.start, entry.end) };
    })
    .sort((a, b) => a.start - b.start);

  const groups: Array<{ legs: Leg[]; splitAfter: Set<number> }> = [];
  legs.forEach((leg) => {
    const current = groups[groups.length - 1];
    const previous = current?.legs[current.legs.length - 1];
    const link = leg.entry.dutyLink ?? 'auto';
    if (!current || !previous || link === 'separate') {
      groups.push({ legs: [leg], splitAfter: new Set() });
      return;
    }
    const gap = leg.start - previous.end;
    let joins = link === 'continue' || link === 'split';
    if (link === 'auto') {
      const [before, after] = [previous.entry.pairing, leg.entry.pairing];
      joins =
        before && after
          ? before === after && gap < settings.layoverMinutes
          : gap <= MAX_TURNAROUND_MINUTES || (isAwayTurnaround(current.legs, leg) && gap < settings.layoverMinutes);
    }
    if (!joins) {
      groups.push({ legs: [leg], splitAfter: new Set() });
      return;
    }
    // A night away from base means a hotel: the duty is split and the rest is not work
    const nightRest = link === 'auto' && gap > MAX_TURNAROUND_MINUTES ? nightOverlap(previous.end + settings.releaseMinutes, leg.start - report) : 0;
    if (link === 'split' || nightRest >= MIN_SPLIT_BREAK_MINUTES) current.splitAfter.add(current.legs.length - 1);
    current.legs.push(leg);
  });

  return groups.map(({ legs: group, splitAfter }) => {
    const first = group[0];
    const last = group[group.length - 1];
    const medicalCheck = Boolean(last.entry.medicalCheck);
    const release = medicalCheck ? settings.medicalReleaseMinutes : settings.releaseMinutes;
    const startAt = nearestClock(first.entry.reportAt, first.start, -1) ?? first.start - report;
    const endAt = nearestClock(last.entry.releaseAt, last.end, 1) ?? last.end + release;

    const segments: DutySegment[] = [{ kind: 'report', from: startAt, to: first.start }];
    const working: Array<[number, number]> = [];
    let breakMinutes = 0;
    let cursor = startAt;
    group.forEach((leg, index) => {
      segments.push({ kind: leg.entry.deadhead ? 'deadhead' : 'leg', from: leg.start, to: leg.end, entry: leg.entry });
      const next = group[index + 1];
      if (!next) return;
      // The rest runs from release after this leg to report before the next one
      const restFrom = leg.end + settings.releaseMinutes;
      const restTo = next.start - report;
      if (splitAfter.has(index) && restTo > restFrom) {
        segments.push({ kind: 'wait', from: leg.end, to: restFrom });
        segments.push({ kind: 'rest', from: restFrom, to: restTo });
        segments.push({ kind: 'wait', from: restTo, to: next.start });
        working.push([cursor, restFrom]);
        cursor = restTo;
        breakMinutes += restTo - restFrom;
        return;
      }
      segments.push({ kind: 'wait', from: leg.end, to: next.start });
    });
    segments.push({ kind: 'release', from: last.end, to: endAt });
    working.push([cursor, endAt]);

    const spans = working.filter(([from, to]) => to > from);
    const minutes = spans.reduce((sum, [from, to]) => sum + to - from, 0);
    const nightMinutes = spans.reduce((sum, [from, to]) => sum + nightOverlap(from, to), 0);
    const flown = group.filter((leg) => !leg.entry.deadhead);
    const blockMinutes = flown.reduce((sum, leg) => sum + (leg.end - leg.start), 0);
    const deadheadMinutes = group.filter((leg) => leg.entry.deadhead).reduce((sum, leg) => sum + (leg.end - leg.start), 0);
    const date = clockAt(startAt).date;
    const dayStart = absoluteMinutes(date, '00:00');

    return {
      date,
      reportAt: startAt - dayStart,
      releaseAt: endAt - dayStart,
      startAt,
      endAt,
      minutes,
      flightDutyMinutes: endAt - startAt,
      blockMinutes,
      deadheadMinutes,
      flightTimeMinutes: blockMinutes + Math.round(deadheadMinutes / 2),
      nightMinutes,
      isNight: minutes > 0 && nightMinutes * 2 >= minutes,
      landings: flown.length,
      legs: group.map((leg) => leg.entry),
      breakMinutes,
      isSplit: breakMinutes > 0,
      medicalCheck,
      maxDutyMinutes: maxDutyMinutes(startAt, flown.length),
      segments,
    };
  });
}

/** Legs flown and confirmed in the logbook take their actual times instead of the plan's */
export function applyLogbookTimes(entries: WorkEntry[], flights: LocalFlight[], iataIndex: Map<string, string> = new Map()): WorkEntry[] {
  const toIcao = (code: string) => (iataIndex.get(code.toUpperCase()) || code).toUpperCase();
  const flown = flights.filter((flight) => isFlightTime(flight) && flight.syncStatus !== 'deleted' && /^\d{1,2}:\d{2}$/.test(flight.outTimeUtc || ''));
  const used = new Set<string>();
  return entries.map((entry) => {
    const route = entry.kind === 'flight' && !entry.deadhead ? routeOf(entry.title) : null;
    if (!route || !/^\d{1,2}:\d{2}$/.test(entry.start)) return entry;
    const planned = absoluteMinutes(entry.date, entry.start);
    const match = flown
      .filter((flight) => !used.has(flight.id) && toIcao(flight.depIcao) === toIcao(route.dep) && toIcao(flight.arrIcao) === toIcao(route.arr))
      .map((flight) => ({ flight, delta: Math.abs(absoluteMinutes(flight.date, flight.outTimeUtc) - planned) }))
      .filter(({ delta }) => delta <= 12 * 60)
      .sort((a, b) => a.delta - b.delta)[0];
    if (!match) return entry;
    used.add(match.flight.id);
    return { ...entry, date: match.flight.date, start: match.flight.outTimeUtc, end: match.flight.inTimeUtc, actual: true };
  });
}

export interface DutyWarning {
  date: string;
  message: string;
}

/** Order 139 checks: a reference for the pilot, not a substitute for the airline's planning */
/** Weekly rest of Order 139, pp. 61 and 63 */
export const WEEKLY_REST_MINUTES = 42 * 60;

export function getDutyWarnings(duties: FlightDuty[], rates: Partial<WorkRates> = {}): DutyWarning[] {
  const settings = { ...DEFAULT_WORK_RATES, ...rates };
  const ordered = [...duties].sort((a, b) => a.startAt - b.startAt);
  const warnings: DutyWarning[] = [];

  ordered.forEach((duty, index) => {
    // A split duty is checked by its working parts, its break is not work (p. 31)
    const length = duty.isSplit ? duty.minutes : duty.flightDutyMinutes;
    if (length > duty.maxDutyMinutes) {
      warnings.push({
        date: duty.date,
        message: `${duty.isSplit ? 'Разделённая смена' : 'Смена'} ${formatDutyLength(length)}: больше ${formatDutyLength(duty.maxDutyMinutes)} для явки в ${mskClock(duty.startAt)} МСК и ${duty.landings} пос. (Приказ 139, прил. 1).`,
      });
    }
    const previous = ordered[index - 1];
    if (!previous) return;
    const rest = duty.startAt - previous.endAt;
    const required = previous.minutes * 2;
    if (rest < required) {
      warnings.push({
        date: duty.date,
        message: `Отдых перед сменой ${formatDutyLength(Math.max(rest, 0))}: меньше двойной продолжительности предыдущей смены (${formatDutyLength(required)}, п. 55). Сокращённый отдых — только по прил. 6.`,
      });
    }
  });

  // Weekly rest of 42 hours is due after six working days in a row (p. 61) and after two night
  // duties in a row (p. 63); days are counted on the base clock
  let workDays = new Set<string>();
  let nightsInRow = 0;
  let streakWarned = false;
  ordered.forEach((duty, index) => {
    const next = ordered[index + 1];
    workDays.add(clockAt(duty.startAt, BASE_UTC_OFFSET_MINUTES).date);
    workDays.add(clockAt(duty.endAt - 1, BASE_UTC_OFFSET_MINUTES).date);
    nightsInRow = duty.isNight ? nightsInRow + 1 : 0;
    const restAfter = next ? next.startAt - duty.endAt : Infinity;
    if (restAfter >= WEEKLY_REST_MINUTES) {
      workDays = new Set();
      nightsInRow = 0;
      streakWarned = false;
      return;
    }
    if (workDays.size >= 6 && !streakWarned) {
      streakWarned = true;
      warnings.push({
        date: next!.date,
        message: `${workDays.size} рабочих дней подряд без еженедельного отдыха: после шести дней нужен отдых не менее 42 часов (п. 61).`,
      });
    }
    if (nightsInRow >= 2) {
      nightsInRow = 0;
      warnings.push({
        date: next!.date,
        message: `После двух ночных смен подряд нужен отдых не менее 42 часов, а до следующей смены ${formatDutyLength(restAfter)} (п. 63).`,
      });
    }
  });

  const flightTime = duties.reduce((sum, duty) => sum + duty.flightTimeMinutes, 0);
  if (flightTime > settings.flightLimitHours * 60) {
    warnings.push({
      date: '',
      message: `Полётное время за месяц ${formatDutyLength(flightTime)}: больше ${settings.flightLimitHours} часов (п. ${settings.flightLimitHours === 80 ? 11 : 12}).`,
    });
  }
  const splits = duties.filter((duty) => duty.isSplit).length;
  if (splits > 2) {
    warnings.push({ date: '', message: `Разделённых смен за месяц: ${splits}. Допускается не более двух за учётный период (п. 30).` });
  }

  return warnings;
}

/**
 * Norm of working hours for a 36-hour week (flight crews, Order 139, p. 6). The 2026 figures come
 * from the official production calendar; other years are counted from weekdays and the fixed
 * public holidays without the yearly day swaps, so they are approximate.
 */
const NORMS_36H: Record<string, number> = {
  '2026-01': 108, '2026-02': 136.8, '2026-03': 151.2, '2026-04': 157.4, '2026-05': 135.8, '2026-06': 150.2,
  '2026-07': 165.6, '2026-08': 151.2, '2026-09': 158.4, '2026-10': 158.4, '2026-11': 143, '2026-12': 158.4,
};
const FIXED_HOLIDAYS = ['01-01', '01-02', '01-03', '01-04', '01-05', '01-06', '01-07', '01-08', '02-23', '03-08', '05-01', '05-09', '06-12', '11-04'];

export function monthWorkNorm(month: string): { minutes: number; approximate: boolean } {
  if (NORMS_36H[month] !== undefined) return { minutes: Math.round(NORMS_36H[month] * 60), approximate: false };
  const [year, monthNumber] = month.split('-').map(Number);
  const days = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
  let workdays = 0;
  let preHolidays = 0;
  for (let day = 1; day <= days; day++) {
    const weekday = new Date(Date.UTC(year, monthNumber - 1, day)).getUTCDay();
    if (weekday === 0 || weekday === 6 || FIXED_HOLIDAYS.includes(`${pad(monthNumber)}-${pad(day)}`)) continue;
    workdays++;
    const next = new Date(Date.UTC(year, monthNumber - 1, day + 1));
    if (FIXED_HOLIDAYS.includes(`${pad(next.getUTCMonth() + 1)}-${pad(next.getUTCDate())}`)) preHolidays++;
  }
  return { minutes: Math.round((workdays * 7.2 - preHolidays) * 60), approximate: true };
}

export interface MonthSummary {
  /** Working time: flight duties plus other paid work */
  totalMinutes: number;
  dutyMinutes: number;
  blockMinutes: number;
  deadheadMinutes: number;
  /** Flight time for the limits: flown plus half of the passenger time */
  flightTimeMinutes: number;
  /** Working time between 22:00 and 06:00 Moscow time */
  nightMinutes: number;
  workDays: number;
  minutesByKind: Partial<Record<WorkKind, number>>;
  duties: FlightDuty[];
  splitDuties: number;
  nightDuties: number;
  normMinutes: number;
  normApproximate: boolean;
  /** Working time over the month's norm; negative while under it */
  overtimeMinutes: number;
  flightLimitMinutes: number;
  estimatedPay: number;
}

export function summarizeMonth(entries: WorkEntry[], rates: Partial<WorkRates>, month?: string): MonthSummary {
  const settings = { ...DEFAULT_WORK_RATES, ...rates };
  const duties = buildFlightDuties(entries, settings);
  const minutesByKind: Partial<Record<WorkKind, number>> = {};
  const workDays = new Set<string>();
  const nightRate = (settings.hourly.flight || 0) * ((settings.nightPercent || 0) / 100);
  let hourlyPay = 0;

  const dutyMinutes = duties.reduce((sum, duty) => sum + duty.minutes, 0);
  const blockMinutes = duties.reduce((sum, duty) => sum + duty.blockMinutes, 0);
  const deadheadMinutes = duties.reduce((sum, duty) => sum + duty.deadheadMinutes, 0);
  let nightMinutes = duties.reduce((sum, duty) => sum + duty.nightMinutes, 0);
  if (duties.length > 0) minutesByKind.flight = dutyMinutes;
  duties.forEach((duty) => workDays.add(duty.date));
  hourlyPay += ((settings.flightPayBasis === 'block' ? blockMinutes : dutyMinutes) / 60) * (settings.hourly.flight || 0);

  entries.forEach((entry) => {
    if (entry.kind === 'flight' || !PAID_KINDS.includes(entry.kind)) return;
    const minutes = computeEntryMinutes(entry.start, entry.end);
    minutesByKind[entry.kind] = (minutesByKind[entry.kind] || 0) + minutes;
    workDays.add(entry.date);
    hourlyPay += (minutes / 60) * (settings.hourly[entry.kind] || 0);
    if (minutes > 0) {
      const from = absoluteMinutes(entry.date, entry.start);
      nightMinutes += nightOverlap(from, from + minutes);
    }
  });
  hourlyPay += (nightMinutes / 60) * nightRate;

  const totalMinutes = Object.values(minutesByKind).reduce((sum, minutes) => sum + (minutes || 0), 0);
  const normMonth = month ?? entries.map((entry) => entry.date.slice(0, 7)).sort()[0] ?? clockAt(Date.now() / 60000).date.slice(0, 7);
  const norm = monthWorkNorm(normMonth);

  return {
    totalMinutes,
    dutyMinutes,
    blockMinutes,
    deadheadMinutes,
    flightTimeMinutes: blockMinutes + Math.round(deadheadMinutes / 2),
    nightMinutes,
    workDays: workDays.size,
    minutesByKind,
    duties,
    splitDuties: duties.filter((duty) => duty.isSplit).length,
    nightDuties: duties.filter((duty) => duty.isNight).length,
    normMinutes: norm.minutes,
    normApproximate: norm.approximate,
    overtimeMinutes: totalMinutes - norm.minutes,
    flightLimitMinutes: settings.flightLimitHours * 60,
    estimatedPay: Math.round(((settings.monthlyBase || 0) + hourlyPay) * 100) / 100,
  };
}

/** Spreadsheets execute cells starting with these characters, and imported text is not trusted. */
const csvCell = (value: string | number) => {
  const text = String(value);
  const safe = /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
  return /[;"\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
};

const formatHours = (minutes: number) => (minutes / 60).toFixed(2).replace('.', ',');

export function buildWorkCsv(entries: WorkEntry[], rates: Partial<WorkRates> = DEFAULT_WORK_RATES): string {
  const header = ['Дата (UTC)', 'Вид работы', 'Рейс / описание', 'Начало UTC', 'Конец UTC', 'Часы', 'Пассажиром', 'Комментарий'];
  const rows = [...entries]
    .sort((a, b) => a.date.localeCompare(b.date) || a.start.localeCompare(b.start))
    .map((entry) => [
      entry.date,
      WORK_KIND_LABELS[entry.kind],
      entry.title,
      entry.start,
      entry.end,
      formatHours(computeEntryMinutes(entry.start, entry.end)),
      entry.deadhead ? 'да' : '',
      entry.note,
    ]);
  const duties = buildFlightDuties(entries, rates);
  const dutyHeader = ['Смена', 'Явка UTC', 'Явка МСК', 'Окончание UTC', 'Окончание МСК', 'Рабочее время, ч', 'Отдых в смене, ч', 'Полётное время, ч', 'Ночные (22–06), ч', 'Посадок'];
  const dutyRows = duties.map((duty) => [
    duty.date,
    utcClock(duty.startAt),
    mskClock(duty.startAt),
    utcClock(duty.endAt),
    mskClock(duty.endAt),
    formatHours(duty.minutes),
    formatHours(duty.breakMinutes),
    formatHours(duty.flightTimeMinutes),
    formatHours(duty.nightMinutes),
    duty.landings,
  ]);
  const table = [header, ...rows];
  const sections = duties.length > 0 ? [...table, [], dutyHeader, ...dutyRows] : table;
  return sections.map((row) => row.map(csvCell).join(';')).join('\r\n');
}

/** The duty under way or the next one to come, with the time left until its report */
export function nextDuty(duties: FlightDuty[], nowMinutes = Date.now() / 60000): { duty: FlightDuty; current: boolean; inMinutes: number } | null {
  const duty = [...duties].sort((a, b) => a.startAt - b.startAt).find((candidate) => candidate.endAt > nowMinutes);
  return duty ? { duty, current: duty.startAt <= nowMinutes, inMinutes: Math.max(0, Math.round(duty.startAt - nowMinutes)) } : null;
}
