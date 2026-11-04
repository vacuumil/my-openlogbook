import { WorkEntry, WorkKind } from '../db/db';
import { generateUUID } from './uuid';

/**
 * Crew roster calendars (.ics), such as the one crew.aeroflot.ru publishes, read into work time rows.
 * Times land in the plan's time zone, like a loaded duty plan, so drafts and duty sums agree.
 */

export interface IcsEvent {
  uid: string;
  summary: string;
  description: string;
  location: string;
  /** UTC milliseconds; for an all-day event, midnight of the first day in the plan zone */
  start: number;
  end: number;
  allDay: boolean;
}

const unescapeText = (value: string) =>
  value.replace(/\\n/gi, '\n').replace(/\\([,;\\])/g, '$1').trim();

/** Offset of a time zone from UTC at an instant, in minutes; null for an unknown zone */
function zoneOffsetMinutes(timeZone: string, utc: number): number | null {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    }).formatToParts(new Date(utc));
    const get = (type: string) => Number(parts.find((part) => part.type === type)?.value);
    const asUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second'));
    return Math.round((asUtc - utc) / 60000);
  } catch {
    return null;
  }
}

/** DTSTART/DTEND value to UTC milliseconds */
function parseIcsTime(value: string, params: Record<string, string>, planOffset: number): { utc: number; allDay: boolean } | null {
  const match = value.match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?(Z)?)?$/);
  if (!match) return null;
  const [, y, mo, d, h, mi, s, z] = match;
  const wall = Date.UTC(Number(y), Number(mo) - 1, Number(d), Number(h || 0), Number(mi || 0), Number(s || 0));
  if (!h) return { utc: wall - planOffset * 60000, allDay: true };
  if (z) return { utc: wall, allDay: false };
  const zone = params.TZID?.replace(/^"|"$/g, '');
  if (zone) {
    // A wall clock time in that zone: correct the guess once for the offset at that moment
    const first = zoneOffsetMinutes(zone, wall);
    if (first !== null) {
      const second = zoneOffsetMinutes(zone, wall - first * 60000) ?? first;
      return { utc: wall - second * 60000, allDay: false };
    }
  }
  // Floating time: read it as the plan's own clock
  return { utc: wall - planOffset * 60000, allDay: false };
}

export function parseIcs(text: string, planOffset: number): IcsEvent[] {
  // Long lines are folded onto continuation lines that start with a space or a tab
  const lines = text.replace(/\r\n?/g, '\n').replace(/\n[ \t]/g, '').split('\n');
  const events: IcsEvent[] = [];
  let current: Record<string, { value: string; params: Record<string, string> }> | null = null;

  lines.forEach((line) => {
    if (/^BEGIN:VEVENT$/i.test(line.trim())) {
      current = {};
      return;
    }
    if (/^END:VEVENT$/i.test(line.trim())) {
      const event = current;
      current = null;
      if (!event?.DTSTART) return;
      const start = parseIcsTime(event.DTSTART.value, event.DTSTART.params, planOffset);
      if (!start) return;
      const end = event.DTEND ? parseIcsTime(event.DTEND.value, event.DTEND.params, planOffset) : null;
      events.push({
        uid: event.UID?.value || '',
        summary: unescapeText(event.SUMMARY?.value || ''),
        description: unescapeText(event.DESCRIPTION?.value || ''),
        location: unescapeText(event.LOCATION?.value || ''),
        start: start.utc,
        // An all-day event without an end lasts one day
        end: end?.utc ?? start.utc + (start.allDay ? 86400000 : 0),
        allDay: start.allDay,
      });
      return;
    }
    if (!current) return;
    const colon = line.indexOf(':');
    if (colon < 0) return;
    const [name, ...rawParams] = line.slice(0, colon).split(';');
    const params: Record<string, string> = {};
    rawParams.forEach((param) => {
      const [key, value = ''] = param.split('=');
      params[key.toUpperCase()] = value;
    });
    current[name.toUpperCase()] = { value: line.slice(colon + 1), params };
  });

  return events;
}

const KIND_RULES: Array<[WorkKind, RegExp]> = [
  ['vacation', /отпуск|vacation|annual leave|\bleave\b/i],
  ['sick', /больнич|sick/i],
  ['reserve', /резерв|reserve|standby|\bsby\b|\bres\b/i],
  ['training', /тренаж|\bsim\b|кпк|\blpc\b|\bopc\b|обучен|подготовк|training|курс|ground school|вл[эе]к|медкомисс/i],
  ['off', /выходн|day off|\boff\b|отдых/i],
];

const ROUTE = /\b([A-Z]{3,4})(?:\/[A-Z0-9]+)?\s*(?:-|–|—|→|>)\s*([A-Z]{3,4})\b/;
const FLIGHT_NUMBER = /\b([A-Z]{2}|[A-Z]\d|\d[A-Z])\s?(\d{1,4}[A-Z]?)\b/;
const AIRCRAFT = /\b(A-?3[1-5]\d[A-Z]?|B-?7[0-8]7(?:-\d{3})?|B-?737|SSJ-?100|RRJ-?95|SU-?95|MC-?21|E-?1[79]0|ATR-?7\d)\b/i;

const pad = (value: number) => String(value).padStart(2, '0');

/** Date and wall clock time of a UTC instant in the plan zone */
function planClock(utc: number, planOffset: number) {
  const local = new Date(utc + planOffset * 60000);
  return {
    date: `${local.getUTCFullYear()}-${pad(local.getUTCMonth() + 1)}-${pad(local.getUTCDate())}`,
    time: `${pad(local.getUTCHours())}:${pad(local.getUTCMinutes())}`,
  };
}

export function icsEventToEntries(event: IcsEvent, planOffset: number): WorkEntry[] {
  const text = [event.summary, event.location, event.description].join('\n');
  const upper = text.toUpperCase();
  const route = event.summary.toUpperCase().match(ROUTE) || upper.match(ROUTE);
  const sourceId = `ics:${event.uid || event.summary}:${event.start}`;
  const base = { nightMinutes: 0, sourceId };

  if (route && !event.allDay) {
    const start = planClock(event.start, planOffset);
    const end = planClock(event.end, planOffset);
    const flightNumber = event.summary.toUpperCase().match(FLIGHT_NUMBER) || upper.match(FLIGHT_NUMBER);
    const aircraft = text.match(AIRCRAFT)?.[1].toUpperCase();
    return [
      {
        ...base,
        id: generateUUID(),
        date: start.date,
        kind: 'flight',
        title: `${flightNumber ? `${flightNumber[1]}${flightNumber[2]} ` : ''}${route[1]}-${route[2]}`,
        start: start.time,
        end: end.time,
        note: aircraft || '',
      },
    ];
  }

  const kind = KIND_RULES.find(([, pattern]) => pattern.test(text))?.[0] ?? 'ground';
  const title = event.summary || event.location;

  if (event.allDay) {
    // One row per day, so days off and leave count day by day; a stray long event stays bounded
    const days = Math.min(Math.max(Math.round((event.end - event.start) / 86400000), 1), 62);
    return Array.from({ length: days }, (_, index) => ({
      ...base,
      sourceId: `${sourceId}:${index}`,
      id: generateUUID(),
      date: planClock(event.start + index * 86400000, planOffset).date,
      kind,
      title,
      start: '',
      end: '',
      note: '',
    }));
  }

  const start = planClock(event.start, planOffset);
  const end = planClock(event.end, planOffset);
  return [{ ...base, id: generateUUID(), date: start.date, kind, title, start: start.time, end: end.time, note: '' }];
}

export function parseRosterCalendar(text: string, planOffset: number): WorkEntry[] {
  return parseIcs(text, planOffset)
    .sort((a, b) => a.start - b.start)
    .flatMap((event) => icsEventToEntries(event, planOffset));
}

/**
 * Loading the calendar again updates the rows it made before (the roster changes), keeps the
 * pilot's own notes and adds the new ones.
 */
export function mergeRosterEntries(existing: WorkEntry[], incoming: WorkEntry[]): { put: WorkEntry[]; added: number; updated: number } {
  const bySource = new Map(existing.filter((entry) => entry.sourceId).map((entry) => [entry.sourceId!, entry]));
  const plainKeys = new Set(existing.map((entry) => `${entry.date}|${entry.kind}|${entry.title}|${entry.start}`));
  const put: WorkEntry[] = [];
  let added = 0;
  let updated = 0;
  incoming.forEach((entry) => {
    const previous = entry.sourceId ? bySource.get(entry.sourceId) : undefined;
    if (previous) {
      const changed = (['date', 'kind', 'title', 'start', 'end'] as const).some((field) => previous[field] !== entry[field]);
      if (changed) {
        put.push({ ...previous, date: entry.date, kind: entry.kind, title: entry.title, start: entry.start, end: entry.end });
        updated++;
      }
      return;
    }
    const key = `${entry.date}|${entry.kind}|${entry.title}|${entry.start}`;
    if (plainKeys.has(key)) return;
    plainKeys.add(key);
    put.push(entry);
    added++;
  });
  return { put, added, updated };
}
