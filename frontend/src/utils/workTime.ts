import { DutyLink, LocalFlight, WorkEntry, WorkKind } from '../db/db';
import { generateUUID } from './uuid';
import { isFlightTime } from './entries';

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
  /** Offset of the plan's clock from UTC; Russian airline plans use Moscow time */
  planUtcOffsetMinutes: number;
}

export const DEFAULT_WORK_RATES: WorkRates = {
  monthlyBase: 0,
  hourly: {},
  nightPercent: 0,
  reportMinutes: 60,
  releaseMinutes: 30,
  flightPayBasis: 'duty',
  planUtcOffsetMinutes: 180,
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

export interface FlightDuty {
  date: string;
  /** Minutes from the duty date's midnight; may exceed 24 hours */
  reportAt: number;
  releaseAt: number;
  minutes: number;
  /** From report to the last engine shutdown: the flight duty period */
  flightDutyMinutes: number;
  blockMinutes: number;
  nightMinutes: number;
  legs: WorkEntry[];
  /** Rest inside a split duty, from release after a leg to report before the next */
  breakMinutes: number;
  isSplit: boolean;
}

export const DUTY_LINK_LABELS: Record<DutyLink, string> = {
  auto: 'Авто',
  continue: 'Одна смена',
  split: 'Разделённая',
  separate: 'Новая смена',
};

/** ORO.FTL.220: a break of at least 3 hours extends the flight duty period by half of it */
export const MIN_SPLIT_BREAK_MINUTES = 3 * 60;

const dayNumber = (date: string) => {
  const [year, month, day] = date.split('-').map(Number);
  return Date.UTC(year, month - 1, day) / 86400000;
};

const toMinutesOfDay = (time: string) => {
  const [hours, minutes] = time.split(':').map(Number);
  return hours * 60 + minutes;
};

export const formatClock = (minutesFromMidnight: number) => {
  const normalized = ((minutesFromMidnight % 1440) + 1440) % 1440;
  const dayShift = Math.floor(minutesFromMidnight / 1440);
  const time = `${pad(Math.floor(normalized / 60))}:${pad(normalized % 60)}`;
  return dayShift === 0 ? time : `${time} (${dayShift > 0 ? '+' : ''}${dayShift} д)`;
};

/**
 * Flight legs grouped into duties. A duty runs from report time before the first departure to
 * release time after the last shutdown, so it is what an airline counts as working time.
 */
/**
 * The crew is still away from where the duty began and flies on from where it landed: the duty
 * cannot end there, so the whole wait is work unless the crew marks it as a split duty. A wait
 * of a full minimum rest or longer is a layover.
 */
function isAwayTurnaround(duty: Array<{ entry: WorkEntry }>, next: { entry: WorkEntry }, gap: number): boolean {
  const origin = routeOf(duty[0].entry.title)?.dep;
  const landed = routeOf(duty[duty.length - 1].entry.title)?.arr;
  const departs = routeOf(next.entry.title)?.dep;
  return Boolean(origin && landed && landed !== origin && departs === landed && gap < MIN_REST_MINUTES);
}

/** Night for a stay away from base: from 22:00 to 06:00 on the plan's clock */
const NIGHT_START = 22 * 60;
const NIGHT_END = 6 * 60;

/** Minutes of [from, to) that fall into the night; both are minutes counted from the epoch day */
function nightOverlap(from: number, to: number): number {
  let total = 0;
  for (let day = Math.floor(from / 1440) - 1; day <= Math.floor(to / 1440); day++) {
    const start = day * 1440 + NIGHT_START;
    const end = (day + 1) * 1440 + NIGHT_END;
    total += Math.max(0, Math.min(to, end) - Math.max(from, start));
  }
  return total;
}

export function buildFlightDuties(entries: WorkEntry[], rates: Pick<WorkRates, 'reportMinutes' | 'releaseMinutes'>): FlightDuty[] {
  const legs = entries
    .filter((entry) => entry.kind === 'flight' && computeEntryMinutes(entry.start, entry.end) > 0)
    .map((entry) => {
      const start = dayNumber(entry.date) * 1440 + toMinutesOfDay(entry.start);
      return { entry, start, end: start + computeEntryMinutes(entry.start, entry.end) };
    })
    .sort((a, b) => a.start - b.start);

  type Leg = (typeof legs)[number];
  const report = rates.reportMinutes || 0;
  const release = rates.releaseMinutes || 0;
  const groups: Array<{ legs: Leg[]; splitAfter: Set<number> }> = [];
  legs.forEach((leg) => {
    const current = groups[groups.length - 1];
    const link = leg.entry.dutyLink ?? 'auto';
    const previous = current?.legs[current.legs.length - 1];
    const gap = previous ? leg.start - previous.end : Infinity;
    const away = Boolean(current && previous && link === 'auto' && isAwayTurnaround(current.legs, leg, gap));
    const joins = current && (link === 'continue' || link === 'split' || (link === 'auto' && (gap <= MAX_TURNAROUND_MINUTES || away)));
    if (!joins) {
      groups.push({ legs: [leg], splitAfter: new Set() });
      return;
    }
    // A night away from base means a hotel: the duty is split and the rest is not work.
    // A daytime wait at the outstation stays work, as the duty cannot end there.
    const nightRest = away && previous ? nightOverlap(previous.end + release, leg.start - report) : 0;
    if (link === 'split' || nightRest >= MIN_SPLIT_BREAK_MINUTES) current.splitAfter.add(current.legs.length - 1);
    current.legs.push(leg);
  });

  return groups.map(({ legs: group, splitAfter }) => {
    const first = group[0];
    const last = group[group.length - 1];
    const base = dayNumber(first.entry.date) * 1440;
    const reportAt = first.start - base - report;
    const releaseAt = last.end - base + release;
    // The break runs from release after one leg to report before the next; a gap too short
    // to leave the aircraft is simply work
    const breakMinutes = group.reduce((sum, leg, index) => {
      if (!splitAfter.has(index) || !group[index + 1]) return sum;
      return sum + Math.max(0, group[index + 1].start - report - (leg.end + release));
    }, 0);
    return {
      date: first.entry.date,
      reportAt,
      releaseAt,
      minutes: releaseAt - reportAt - breakMinutes,
      flightDutyMinutes: last.end - base - reportAt,
      blockMinutes: group.reduce((sum, leg) => sum + (leg.end - leg.start), 0),
      nightMinutes: group.reduce((sum, leg) => sum + (leg.entry.nightMinutes || 0), 0),
      legs: group.map((leg) => leg.entry),
      breakMinutes,
      isSplit: breakMinutes > 0,
    };
  });
}

/** Basic maximum daily FDP of ORO.FTL.205(b); the real limit depends on report time and sectors */
export const BASIC_MAX_FDP_MINUTES = 13 * 60;
/** ORO.FTL.235(c): rest at home base is at least the preceding duty and never under 12 hours */
export const MIN_REST_MINUTES = 12 * 60;

export interface DutyWarning {
  date: string;
  message: string;
}

const formatDuration = (minutes: number) => `${Math.floor(minutes / 60)}:${pad(minutes % 60)}`;

/** Reference checks against EASA flight time limitations. Airline rules may be stricter or differ. */
export function getDutyWarnings(duties: FlightDuty[]): DutyWarning[] {
  const ordered = [...duties].sort((a, b) => dayNumber(a.date) * 1440 + a.reportAt - (dayNumber(b.date) * 1440 + b.reportAt));
  const warnings: DutyWarning[] = [];

  ordered.forEach((duty, index) => {
    const extension = duty.breakMinutes >= MIN_SPLIT_BREAK_MINUTES ? Math.floor(duty.breakMinutes / 2) : 0;
    const allowed = BASIC_MAX_FDP_MINUTES + extension;
    if (duty.flightDutyMinutes > allowed) {
      warnings.push({
        date: duty.date,
        message: extension
          ? `Разделённая полётная смена ${formatDuration(duty.flightDutyMinutes)}: больше 13:00 плюс половина перерыва (${formatDuration(allowed)}).`
          : `Полётная смена ${formatDuration(duty.flightDutyMinutes)}: больше базовых 13:00. Сверьте с таблицей для вашего времени явки и числа участков.`,
      });
    }
    const previous = ordered[index - 1];
    if (!previous) return;
    const rest = dayNumber(duty.date) * 1440 + duty.reportAt - (dayNumber(previous.date) * 1440 + previous.releaseAt);
    const required = Math.max(previous.minutes, MIN_REST_MINUTES);
    if (rest < required) {
      warnings.push({
        date: duty.date,
        message: `Отдых перед сменой ${formatDuration(Math.max(rest, 0))}: меньше минимума ${formatDuration(required)}.`,
      });
    }
  });

  return warnings;
}

export interface MonthSummary {
  /** Working time: flight duties plus other paid work */
  totalMinutes: number;
  blockMinutes: number;
  nightMinutes: number;
  workDays: number;
  minutesByKind: Partial<Record<WorkKind, number>>;
  duties: FlightDuty[];
  estimatedPay: number;
}

export function summarizeMonth(entries: WorkEntry[], rates: WorkRates): MonthSummary {
  const settings = { ...DEFAULT_WORK_RATES, ...rates };
  const duties = buildFlightDuties(entries, settings);
  const minutesByKind: Partial<Record<WorkKind, number>> = {};
  const workDays = new Set<string>();
  const nightRate = (settings.hourly.flight || 0) * ((settings.nightPercent || 0) / 100);
  let hourlyPay = 0;

  const dutyMinutes = duties.reduce((sum, duty) => sum + duty.minutes, 0);
  const blockMinutes = duties.reduce((sum, duty) => sum + duty.blockMinutes, 0);
  const nightMinutes = duties.reduce((sum, duty) => sum + duty.nightMinutes, 0);
  if (duties.length > 0) minutesByKind.flight = dutyMinutes;
  duties.forEach((duty) => workDays.add(duty.date));
  hourlyPay += ((settings.flightPayBasis === 'block' ? blockMinutes : dutyMinutes) / 60) * (settings.hourly.flight || 0);
  hourlyPay += (nightMinutes / 60) * nightRate;

  entries.forEach((entry) => {
    if (entry.kind === 'flight' || !PAID_KINDS.includes(entry.kind)) return;
    const minutes = computeEntryMinutes(entry.start, entry.end);
    minutesByKind[entry.kind] = (minutesByKind[entry.kind] || 0) + minutes;
    workDays.add(entry.date);
    hourlyPay += (minutes / 60) * (settings.hourly[entry.kind] || 0);
  });

  return {
    totalMinutes: Object.values(minutesByKind).reduce((sum, minutes) => sum + (minutes || 0), 0),
    blockMinutes,
    nightMinutes,
    workDays: workDays.size,
    minutesByKind,
    duties,
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

export function buildWorkCsv(entries: WorkEntry[], rates: WorkRates = DEFAULT_WORK_RATES): string {
  const header = ['Дата', 'Вид работы', 'Рейс / описание', 'Начало', 'Конец', 'Часы', 'Ночные часы', 'Комментарий'];
  const rows = [...entries]
    .sort((a, b) => a.date.localeCompare(b.date) || a.start.localeCompare(b.start))
    .map((entry) => [
      entry.date,
      WORK_KIND_LABELS[entry.kind],
      entry.title,
      entry.start,
      entry.end,
      formatHours(computeEntryMinutes(entry.start, entry.end)),
      formatHours(entry.nightMinutes || 0),
      entry.note,
    ]);
  const duties = buildFlightDuties(entries, { ...DEFAULT_WORK_RATES, ...rates });
  const dutyHeader = ['Смена', 'Явка', 'Окончание', 'Рабочее время, ч', 'Перерыв, ч', 'Налёт, ч', 'Участков'];
  const dutyRows = duties.map((duty) => [
    duty.date,
    formatClock(duty.reportAt),
    formatClock(duty.releaseAt),
    formatHours(duty.minutes),
    formatHours(duty.breakMinutes),
    formatHours(duty.blockMinutes),
    duty.legs.length,
  ]);
  const table = [header, ...rows];
  const sections = duties.length > 0 ? [...table, [], dutyHeader, ...dutyRows] : table;
  return sections.map((row) => row.map(csvCell).join(';')).join('\r\n');
}
