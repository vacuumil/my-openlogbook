import { LocalFlight } from '../db/db';

export type EntryType = 'flight' | 'simulator' | 'ground';

export const ENTRY_TYPE_LABELS: Record<EntryType, string> = {
  flight: 'Рейс',
  simulator: 'Тренажёр',
  ground: 'Наземная подготовка',
};

/** Training devices whose sessions count towards take-off and landing recency. */
export const RECENCY_DEVICES = ['FFS'];

/** ICAO placeholder for "no location": simulator and ground entries have no route. */
export const NO_LOCATION = 'ZZZZ';

export const entryTypeOf = (entry: LocalFlight): EntryType => entry.entryType ?? 'flight';

export const isDraft = (entry: LocalFlight) => entry.status === 'draft';

/** Real, confirmed flights: the only entries that count as flight time, on the map and in limits. */
export const isFlightTime = (entry: LocalFlight) => entryTypeOf(entry) === 'flight' && !isDraft(entry);

/** Fields without a server column travel together in the `details` JSON. */
const DETAIL_KEYS = [
  'entryType',
  'status',
  'takeoffsDay',
  'takeoffsNight',
  'fullStopLandingsNight',
  'simDevice',
  'instructorTimeMinutes',
  'nightRule',
] as const;

export function packDetails(entry: LocalFlight): string | undefined {
  const details: Record<string, unknown> = {};
  DETAIL_KEYS.forEach((key) => {
    if (entry[key] !== undefined && entry[key] !== null) details[key] = entry[key];
  });
  return Object.keys(details).length > 0 ? JSON.stringify(details) : undefined;
}

export function unpackDetails(details: string | null | undefined): Partial<LocalFlight> {
  if (!details) return {};
  try {
    const parsed = JSON.parse(details);
    if (!parsed || typeof parsed !== 'object') return {};
    const result: Record<string, unknown> = {};
    DETAIL_KEYS.forEach((key) => {
      if (parsed[key] !== undefined) result[key] = parsed[key];
    });
    return result as Partial<LocalFlight>;
  } catch {
    return {};
  }
}

/** Take-offs default to the landings for records made before take-offs were logged. */
export const takeoffsOf = (entry: LocalFlight) => ({
  day: entry.takeoffsDay ?? entry.landingsDay ?? 0,
  night: entry.takeoffsNight ?? entry.landingsNight ?? 0,
});

/** Night landings to a full stop (FAA 61.57(b)); older records count every night landing. */
export const fullStopNightLandingsOf = (entry: LocalFlight) => entry.fullStopLandingsNight ?? entry.landingsNight ?? 0;
