import { LocalAirport, LocalFlight, WorkEntry } from '../db/db';
import { calculateFlightTimes } from './nightCalculator';
import { computeEntryMinutes } from './workTime';
import { generateUUID } from './uuid';

const pad = (value: number) => String(value).padStart(2, '0');

/** Plan date and time in the plan's time zone to a UTC date and HH:MM. */
export function planTimeToUtc(date: string, time: string, utcOffsetMinutes: number): { date: string; time: string } {
  const [year, month, day] = date.split('-').map(Number);
  const [hours, minutes] = time.split(':').map(Number);
  const utc = new Date(Date.UTC(year, month - 1, day, hours, minutes) - utcOffsetMinutes * 60000);
  return {
    date: `${utc.getUTCFullYear()}-${pad(utc.getUTCMonth() + 1)}-${pad(utc.getUTCDate())}`,
    time: `${pad(utc.getUTCHours())}:${pad(utc.getUTCMinutes())}`,
  };
}

/** A-320A, A-321B, B-737-800 → A320, A321, B737: the variant letters are not part of the type. */
export function aircraftTypeFromPlan(code: string): string {
  const match = code.toUpperCase().replace(/\s+/g, '').match(/^([A-Z]{1,3})-?(\d{2,3})/);
  return match ? `${match[1]}${match[2]}` : code.toUpperCase();
}

export interface DraftOptions {
  utcOffsetMinutes: number;
  /** IATA → ICAO, from the airport reference */
  iataIndex: Map<string, string>;
  airports: Map<string, LocalAirport>;
  /** Role the pilot usually flies: drafts start with it */
  defaultRole?: LocalFlight['flightRole'];
}

const ROUTE = /([A-Z]{3,4})-([A-Z]{3,4})\s*$/;
const FLIGHT_NUMBER = /^([A-Z0-9]{2}\d{2,4})\s/;

/**
 * Logbook drafts for the plan's flights. A draft carries the planned block and night time and waits
 * for the pilot to confirm it after the flight; flights already in the logbook are skipped.
 */
export function buildDraftFlights(entries: WorkEntry[], existing: LocalFlight[], options: DraftOptions): LocalFlight[] {
  const taken = new Set(existing.map((flight) => `${flight.date}|${flight.depIcao.toUpperCase()}|${flight.arrIcao.toUpperCase()}`));
  const toIcao = (code: string) => options.iataIndex.get(code) || code;

  return entries.flatMap((entry) => {
    const route = entry.title.toUpperCase().match(ROUTE);
    const minutes = computeEntryMinutes(entry.start, entry.end);
    // A leg flown as a passenger is not the pilot's flight time
    if (entry.kind !== 'flight' || entry.deadhead || !route || minutes === 0) return [];

    const depIcao = toIcao(route[1]);
    const arrIcao = toIcao(route[2]);
    const out = planTimeToUtc(entry.date, entry.start, options.utcOffsetMinutes);
    const key = `${out.date}|${depIcao}|${arrIcao}`;
    if (taken.has(key)) return [];
    taken.add(key);

    const [inHours, inMinutes] = out.time.split(':').map(Number);
    const inTotal = inHours * 60 + inMinutes + minutes;
    const inTimeUtc = `${pad(Math.floor(inTotal / 60) % 24)}:${pad(inTotal % 60)}`;

    const dep = options.airports.get(depIcao);
    const arr = options.airports.get(arrIcao);
    const offAt = new Date(`${out.date}T${out.time}:00Z`);
    const night = dep && arr
      ? calculateFlightTimes(dep, arr, offAt, new Date(offAt.getTime() + minutes * 60000)).nightMinutes
      : 0;

    const role = options.defaultRole || 'SIC';
    const flightNumber = entry.title.toUpperCase().match(FLIGHT_NUMBER)?.[1];

    return [
      {
        id: generateUUID(),
        date: out.date,
        depIcao,
        arrIcao,
        outTimeUtc: out.time,
        offTimeUtc: out.time,
        onTimeUtc: inTimeUtc,
        inTimeUtc,
        totalTimeMinutes: minutes,
        nightTimeMinutes: night,
        ifrTimeMinutes: minutes,
        picTimeMinutes: role === 'PIC' ? minutes : 0,
        sicTimeMinutes: role === 'SIC' ? minutes : 0,
        picusTimeMinutes: role === 'PICUS' ? minutes : 0,
        dualTimeMinutes: 0,
        flightRole: role,
        landingsDay: 0,
        landingsNight: 0,
        aircraftReg: '',
        aircraftType: aircraftTypeFromPlan(entry.note || ''),
        remarks: flightNumber ? `Рейс ${flightNumber} (из ${entry.sourceId ? 'ростера' : 'плана'})` : entry.sourceId ? 'Из ростера' : 'Из плана',
        status: 'draft',
        syncStatus: 'created',
        updatedAt: new Date().toISOString(),
      } satisfies LocalFlight,
    ];
  });
}
