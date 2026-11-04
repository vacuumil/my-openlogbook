import { WorkEntry, WorkKind } from '../db/db';
import { generateUUID } from './uuid';
import { absoluteMinutes, BASE_UTC_OFFSET_MINUTES, clockAt } from './workClock';

/**
 * Crew roster calendars (.ics), as crew.aeroflot.ru publishes them, read into work time rows in UTC.
 *
 * An Aeroflot flight event is one leg:
 *   SUMMARY:SU1204 ✈️ Moscow (SVO | Sheremetyevo (B)) → Perm (PEE | Bolshoye Savino)
 *   DESCRIPTION:[SU1204/SU1205, A-320A] Moscow (SVO | …) → Perm (PEE | …) → Moscow (SVO | …)\n\n<crew>
 * The bracket names the pairing and the aircraft: legs of one pairing form one duty. The crew list
 * that follows is personal data of other people and is never kept.
 */

export interface IcsEvent {
  uid: string;
  summary: string;
  description: string;
  location: string;
  /** UTC minutes since the epoch day; for an all-day event, the first day's midnight on the base clock */
  start: number;
  end: number;
  allDay: boolean;
}

const unescapeText = (value: string) => value.replace(/\\n/gi, '\n').replace(/\\([,;\\])/g, '$1').trim();

/** Offset of a time zone from UTC at an instant, in minutes; null for an unknown zone */
function zoneOffsetMinutes(timeZone: string, utcMinutes: number): number | null {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    }).formatToParts(new Date(utcMinutes * 60000));
    const get = (type: string) => Number(parts.find((part) => part.type === type)?.value);
    const asUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute')) / 60000;
    return Math.round(asUtc - utcMinutes);
  } catch {
    return null;
  }
}

/** DTSTART/DTEND value to UTC minutes since the epoch day */
function parseIcsTime(value: string, params: Record<string, string>): { at: number; allDay: boolean } | null {
  const match = value.match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?(Z)?)?$/);
  if (!match) return null;
  const [, y, mo, d, h, mi, , z] = match;
  const wall = absoluteMinutes(`${y}-${mo}-${d}`, `${h || '00'}:${mi || '00'}`);
  if (!h) return { at: wall - BASE_UTC_OFFSET_MINUTES, allDay: true };
  if (z) return { at: wall, allDay: false };
  const zone = params.TZID?.replace(/^"|"$/g, '');
  if (zone) {
    // A wall clock time in that zone: correct the guess once for the offset at that moment
    const first = zoneOffsetMinutes(zone, wall);
    if (first !== null) return { at: wall - (zoneOffsetMinutes(zone, wall - first) ?? first), allDay: false };
  }
  // Floating time: read it on the base clock, as the airline does
  return { at: wall - BASE_UTC_OFFSET_MINUTES, allDay: false };
}

export function parseIcs(text: string): IcsEvent[] {
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
      const start = parseIcsTime(event.DTSTART.value, event.DTSTART.params);
      if (!start) return;
      const end = event.DTEND ? parseIcsTime(event.DTEND.value, event.DTEND.params) : null;
      events.push({
        uid: event.UID?.value || '',
        summary: unescapeText(event.SUMMARY?.value || ''),
        description: unescapeText(event.DESCRIPTION?.value || ''),
        location: unescapeText(event.LOCATION?.value || ''),
        start: start.at,
        // An all-day event without an end lasts one day
        end: end?.at ?? start.at + (start.allDay ? 1440 : 0),
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

/** SU1204, FV6123, 5N123 at the start of a summary */
const FLIGHT_NUMBER = /^\s*([A-Z]{2}|[A-Z]\d|\d[A-Z])\s?(\d{1,4}[A-Z]?)\b/;
/** Airport codes as Aeroflot writes them: "(SVO | Sheremetyevo (B))" */
const AIRPORT_IN_PARENS = /\(([A-Z]{3,4})\s*\|/g;
/** Or plain: "SVO-KJA", "SVO → KJA" */
const PLAIN_ROUTE = /\b([A-Z]{3,4})(?:\/[A-Z0-9]+)?\s*(?:-|–|—|→|>)\s*([A-Z]{3,4})\b/;
const AIRCRAFT = /\b(A-?3[1-5]\d[A-Z]?|B-?7[0-8]7(?:-\d{3})?|B-?737|SSJ-?100|RRJ-?95|SU-?95|MC-?21|E-?1[79]0|ATR-?7\d)\b/i;
const DEADHEAD = /пасс|пассажир|\bdhd\b|deadhead|\bpax\b|\bdh\b/i;

/** "[SU1204/SU1205, A-320A] …" → pairing and aircraft */
function pairingOf(description: string): { pairing?: string; aircraft?: string } {
  const bracket = description.match(/^\s*\[([^\]]+)\]/);
  if (!bracket) return {};
  const [flights, aircraft] = bracket[1].split(',').map((part) => part.trim());
  return { pairing: /\d/.test(flights) ? flights.replace(/\s+/g, '') : undefined, aircraft: aircraft || undefined };
}

function routeOfEvent(event: IcsEvent): [string, string] | null {
  const codes = [...event.summary.matchAll(AIRPORT_IN_PARENS)].map((match) => match[1]);
  if (codes.length >= 2) return [codes[0], codes[codes.length - 1]];
  const plain = event.summary.toUpperCase().match(PLAIN_ROUTE);
  return plain ? [plain[1], plain[2]] : null;
}

export function icsEventToEntries(event: IcsEvent): WorkEntry[] {
  // Only the first line of the description: the rest is the crew list
  const firstLine = event.description.split('\n')[0];
  const text = [event.summary, event.location, firstLine].join('\n');
  const sourceId = `ics:${event.uid || `${event.summary}:${event.start}`}`;
  const flightNumber = event.summary.toUpperCase().match(FLIGHT_NUMBER);
  const { pairing, aircraft: pairingAircraft } = pairingOf(firstLine);
  const aircraft = pairingAircraft || text.match(AIRCRAFT)?.[1];
  const route = routeOfEvent(event);
  // A flight number, an aircraft or a route with times makes it a flight, never ground work
  const isFlight = !event.allDay && (Boolean(flightNumber) || Boolean(aircraft) || Boolean(route) || text.includes('✈'));

  if (isFlight) {
    const start = clockAt(event.start);
    const end = clockAt(event.end);
    const number = flightNumber ? `${flightNumber[1]}${flightNumber[2]}` : '';
    return [
      {
        id: generateUUID(),
        sourceId,
        utc: true,
        date: start.date,
        kind: 'flight',
        title: [number, route ? `${route[0]}-${route[1]}` : event.summary].filter(Boolean).join(' '),
        start: start.time,
        end: end.time,
        nightMinutes: 0,
        note: aircraft ? aircraft.toUpperCase() : '',
        ...(pairing ? { pairing } : {}),
        ...(DEADHEAD.test(text) ? { deadhead: true } : {}),
      },
    ];
  }

  const kind = KIND_RULES.find(([, pattern]) => pattern.test(text))?.[0] ?? 'ground';
  const title = event.summary || event.location;

  if (event.allDay) {
    // One row per day, so days off and leave count day by day; a stray long event stays bounded
    const days = Math.min(Math.max(Math.round((event.end - event.start) / 1440), 1), 62);
    return Array.from({ length: days }, (_, index) => ({
      id: generateUUID(),
      sourceId: `${sourceId}:${index}`,
      utc: true,
      date: clockAt(event.start + index * 1440, BASE_UTC_OFFSET_MINUTES).date,
      kind,
      title,
      start: '',
      end: '',
      nightMinutes: 0,
      note: '',
    }));
  }

  const start = clockAt(event.start);
  return [
    { id: generateUUID(), sourceId, utc: true, date: start.date, kind, title, start: start.time, end: clockAt(event.end).time, nightMinutes: 0, note: '' },
  ];
}

export function parseRosterCalendar(text: string): WorkEntry[] {
  return parseIcs(text)
    .sort((a, b) => a.start - b.start)
    .flatMap((event) => icsEventToEntries(event));
}

export interface RosterMerge {
  put: WorkEntry[];
  removeIds: string[];
  added: number;
  updated: number;
  removed: number;
}

const ROSTER_FIELDS = ['date', 'kind', 'title', 'start', 'end', 'pairing', 'deadhead', 'note'] as const;

/** First and last day of the months the calendar covers: only there can an event have been cancelled */
function coverageOf(incoming: WorkEntry[]): [string, string] | null {
  if (incoming.length === 0) return null;
  const dates = incoming.map((entry) => entry.date).sort();
  const [year, month] = dates[dates.length - 1].split('-').map(Number);
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return [`${dates[0].slice(0, 7)}-01`, `${dates[dates.length - 1].slice(0, 7)}-${String(lastDay).padStart(2, '0')}`];
}

/**
 * A fresh roster updates the rows it made before, adds new ones and drops cancelled ones. The
 * pilot's own changes win, and nothing in the past or outside the calendar's months is touched:
 * last month simply leaves the calendar when a new one starts.
 */
export function mergeRosterEntries(existing: WorkEntry[], incoming: WorkEntry[], nowMinutes = Date.now() / 60000): RosterMerge {
  const bySource = new Map(existing.filter((entry) => entry.sourceId).map((entry) => [entry.sourceId!, entry]));
  const plainKeys = new Set(existing.map((entry) => `${entry.date}|${entry.kind}|${entry.title}|${entry.start}`));
  const put: WorkEntry[] = [];
  let added = 0;
  let updated = 0;

  incoming.forEach((entry) => {
    const previous = entry.sourceId ? bySource.get(entry.sourceId) : undefined;
    if (previous) {
      if (previous.edited) return;
      const changed = ROSTER_FIELDS.some((field) => (previous[field] ?? '') !== (entry[field] ?? ''));
      if (changed || !previous.utc) {
        put.push({ ...previous, ...Object.fromEntries(ROSTER_FIELDS.map((field) => [field, entry[field]])), utc: true });
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

  const fresh = new Set(incoming.map((entry) => entry.sourceId));
  const coverage = coverageOf(incoming);
  const removeIds = coverage
    ? existing
        .filter((entry) => {
          if (!entry.sourceId?.startsWith('ics:') || fresh.has(entry.sourceId) || entry.edited) return false;
          if (entry.date < coverage[0] || entry.date > coverage[1]) return false;
          const startsAt = absoluteMinutes(entry.date, entry.start || '23:59');
          return startsAt > nowMinutes;
        })
        .map((entry) => entry.id)
    : [];

  return { put, removeIds, added, updated, removed: removeIds.length };
}
