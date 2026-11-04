import { db, LocalAirport, LocalFlight, WorkEntry } from '../db/db';
import { api } from '../api/client';
import { MAJOR_AIRPORTS } from '../data/majorAirports';
import { mergeRosterEntries, parseRosterCalendar } from '../utils/icsRoster';
import { buildDraftFlights } from '../utils/planDrafts';
import { buildIataIndex } from '../utils/flightFilters';
import { resolveAirportCode } from '../utils/rosterParser';
import { airportService } from '../utils/airportService';
import { routeOf } from '../utils/workTime';
import { absoluteMinutes } from '../utils/workClock';
import { syncEngine } from './syncEngine';

// The link holds a personal token: it stays on this device and is not synced
const URL_KEY = 'openlogbook_roster_calendar_url';
const FETCHED_KEY = 'openlogbook_roster_fetched_at';
/** Roster legs that already got a logbook draft: a draft the pilot deleted is not made again */
const DRAFTED_KEY = 'openlogbook_roster_drafted';
const REFRESH_EVERY_MS = 3 * 60 * 60 * 1000;

const read = (key: string) => {
  try {
    return localStorage.getItem(key) || '';
  } catch {
    return '';
  }
};

const write = (key: string, value: string) => {
  try {
    if (value) localStorage.setItem(key, value);
    else localStorage.removeItem(key);
  } catch {
    // Storage blocked: the roster is simply loaded again next time
  }
};

export const getRosterUrl = () => read(URL_KEY);
export const setRosterUrl = (url: string) => write(URL_KEY, url.trim());
export const getRosterFetchedAt = () => Number(read(FETCHED_KEY)) || 0;

export const clearRosterSettings = () => [URL_KEY, FETCHED_KEY, DRAFTED_KEY].forEach((key) => write(key, ''));

/** The role the pilot flies most in recent flights: drafts start with it */
function usualRole(flights: LocalFlight[]): LocalFlight['flightRole'] {
  const roles = flights.filter((flight) => flight.flightRole && flight.status !== 'draft').slice(-30).map((flight) => flight.flightRole);
  return roles.sort((a, b) => roles.filter((role) => role === b).length - roles.filter((role) => role === a).length)[0];
}

/**
 * Logbook drafts for flights of the work time rows. Codes missing from the built-in list are looked
 * up first, coordinates included, so drafts get ICAO codes and night time for smaller airports too.
 */
export async function createDrafts(entries: WorkEntry[]): Promise<LocalFlight[]> {
  const flights = await db.flights.toArray();
  const reference = await db.airports.toArray();
  const known: LocalAirport[] = [...MAJOR_AIRPORTS, ...reference];
  const iataIndex = buildIataIndex(known);
  const legs = entries.filter((entry) => entry.kind === 'flight' && !entry.deadhead);
  const codes = Array.from(new Set(legs.flatMap((entry) => Object.values(routeOf(entry.title) || {})).filter((code) => code.length === 3)));
  for (const code of codes) {
    if (iataIndex.has(code)) continue;
    const icao = await resolveAirportCode(code).catch(() => code);
    if (icao.length === 4) iataIndex.set(code, icao);
  }
  const icaos = Array.from(new Set(codes.map((code) => iataIndex.get(code) || code)));
  const loaded = await airportService.preloadAirports(icaos).catch(() => new Map<string, LocalAirport>());
  const airports = new Map(known.map((airport) => [airport.icao.toUpperCase(), airport]));
  loaded.forEach((airport, icao) => airports.set(icao.toUpperCase(), airport));

  const drafts = buildDraftFlights(legs, flights, { utcOffsetMinutes: 0, iataIndex, airports, defaultRole: usualRole(flights) });
  if (drafts.length > 0) await db.flights.bulkPut(drafts);
  return drafts;
}

export interface RosterRefresh {
  events: number;
  added: number;
  updated: number;
  removed: number;
  drafts: number;
}

/**
 * Loads the roster calendar and brings work time and logbook drafts up to date. Without `force` it
 * runs at most every three hours, so opening the app often costs nothing.
 */
export async function refreshRoster({ force = false } = {}): Promise<RosterRefresh | null> {
  const url = getRosterUrl();
  if (!url) return null;
  if (!force && Date.now() - getRosterFetchedAt() < REFRESH_EVERY_MS) return null;

  const incoming = parseRosterCalendar(await api.fetchRosterCalendar(url));
  write(FETCHED_KEY, String(Date.now()));
  const existing = await db.workEntries.toArray();
  const merge = mergeRosterEntries(existing, incoming);

  const changed = merge.put.length > 0 || merge.removeIds.length > 0 || merge.replaceIds.length > 0;
  if (changed) {
    // Marked first: a sync finishing right now must not restore the old rows
    syncEngine.markProfileDataDirty();
    await db.transaction('rw', db.workEntries, async () => {
      await db.workEntries.bulkPut(merge.put);
      await db.workEntries.bulkDelete([...merge.removeIds, ...merge.replaceIds]);
    });
  }

  // Cancelled flights take their untouched drafts with them
  const removed = existing.filter((entry) => merge.removeIds.includes(entry.id));
  if (removed.length > 0) {
    const iataIndex = buildIataIndex([...MAJOR_AIRPORTS, ...(await db.airports.toArray())]);
    const toIcao = (code: string) => iataIndex.get(code) || code;
    const now = Date.now() / 60000;
    const doomed = (await db.flights.filter((flight) => flight.status === 'draft').toArray()).filter((flight) =>
      removed.some((entry) => {
        const route = routeOf(entry.title);
        return (
          route &&
          flight.date === entry.date &&
          flight.depIcao === toIcao(route.dep) &&
          flight.arrIcao === toIcao(route.arr) &&
          absoluteMinutes(flight.date, flight.outTimeUtc || '23:59') > now
        );
      })
    );
    // Drafts never sent to the server go at once; the rest are deleted through sync
    await db.transaction('rw', db.flights, async () => {
      for (const flight of doomed) {
        if (flight.syncStatus === 'created') await db.flights.delete(flight.id);
        else await db.flights.update(flight.id, { syncStatus: 'deleted', updatedAt: new Date().toISOString() });
      }
    });
  }

  // Each roster leg gets a draft once; one the pilot deleted is not made again
  const drafted = new Set(read(DRAFTED_KEY).split(',').filter(Boolean));
  const current = await db.workEntries.toArray();
  const fresh = current.filter((entry) => entry.sourceId?.startsWith('ics:') && entry.kind === 'flight' && !drafted.has(entry.sourceId));
  const drafts = fresh.length > 0 ? await createDrafts(fresh) : [];
  fresh.forEach((entry) => drafted.add(entry.sourceId!));
  // Only the recent legs are worth remembering
  write(DRAFTED_KEY, Array.from(drafted).slice(-400).join(','));

  if (changed || drafts.length > 0) syncEngine.syncNow();
  return { events: incoming.length, added: merge.added, updated: merge.updated, removed: merge.removed, drafts: drafts.length };
}
