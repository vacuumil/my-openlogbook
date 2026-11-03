import { LocalFlight, WorkEntry, WorkKind } from '../db/db';
import { generateUUID } from './uuid';

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

export interface WorkRates {
  monthlyBase: number;
  hourly: Record<string, number>;
  nightPercent: number;
}

export const DEFAULT_WORK_RATES: WorkRates = { monthlyBase: 0, hourly: {}, nightPercent: 0 };

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

/**
 * Airline plans have no common layout, so rows are recognised by content: a date, a duty word or
 * route, and times. Whatever is guessed wrong stays editable in the table.
 */
export function parseDutyPlan(lines: string[], fallbackMonth: string): WorkEntry[] {
  const month = detectPlanMonth(lines, fallbackMonth);
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
    .filter((flight) => flight.date.startsWith(month) && flight.syncStatus !== 'deleted')
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

export interface MonthSummary {
  totalMinutes: number;
  nightMinutes: number;
  workDays: number;
  minutesByKind: Partial<Record<WorkKind, number>>;
  estimatedPay: number;
}

export function summarizeMonth(entries: WorkEntry[], rates: WorkRates): MonthSummary {
  const minutesByKind: Partial<Record<WorkKind, number>> = {};
  const workDays = new Set<string>();
  let nightMinutes = 0;
  let hourlyPay = 0;

  entries.forEach((entry) => {
    if (!PAID_KINDS.includes(entry.kind)) return;
    const minutes = computeEntryMinutes(entry.start, entry.end);
    const rate = rates.hourly[entry.kind] || 0;
    minutesByKind[entry.kind] = (minutesByKind[entry.kind] || 0) + minutes;
    workDays.add(entry.date);
    nightMinutes += entry.nightMinutes || 0;
    hourlyPay += (minutes / 60) * rate + ((entry.nightMinutes || 0) / 60) * rate * ((rates.nightPercent || 0) / 100);
  });

  return {
    totalMinutes: Object.values(minutesByKind).reduce((sum, minutes) => sum + (minutes || 0), 0),
    nightMinutes,
    workDays: workDays.size,
    minutesByKind,
    estimatedPay: Math.round(((rates.monthlyBase || 0) + hourlyPay) * 100) / 100,
  };
}

/** Spreadsheets execute cells starting with these characters, and imported text is not trusted. */
const csvCell = (value: string | number) => {
  const text = String(value);
  const safe = /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
  return /[;"\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
};

const formatHours = (minutes: number) => (minutes / 60).toFixed(2).replace('.', ',');

export function buildWorkCsv(entries: WorkEntry[]): string {
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
  return [header, ...rows].map((row) => row.map(csvCell).join(';')).join('\r\n');
}
