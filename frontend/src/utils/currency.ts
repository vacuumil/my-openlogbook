import { LocalFlight } from '../db/db';
import { addDays, daysBetween, parseFlightDate } from './dates';
import { getTypeRating, normalizeAircraftType } from './typeRatings';
import { entryTypeOf, fullStopNightLandingsOf, isDraft, RECENCY_DEVICES, takeoffsOf } from './entries';

export interface CurrencySettings {
  /** EASA FCL.060(b)(2): holders of a valid IR are exempt from the night landing */
  holdsInstrumentRating: boolean;
  recencyDays: number;
  requiredLandings: number;
  /** Normalized aircraft type -> type rating name, overriding the built-in groups */
  ratingOverrides: Record<string, string>;
}

export const DEFAULT_CURRENCY_SETTINGS: CurrencySettings = {
  holdsInstrumentRating: false,
  recencyDays: 90,
  requiredLandings: 3,
  ratingOverrides: {},
};

export interface RecencyStatus {
  isCurrent: boolean;
  count: number;
  required: number;
  validUntil: Date | null;
  /** The rule does not apply, e.g. night recency for an IR holder */
  exempt?: boolean;
}

export interface TypeCurrency {
  /** Type rating the recency is held on, e.g. A320 (A318–A321) */
  aircraftType: string;
  /** Aircraft types from the logbook that count towards this rating */
  aircraftTypes: string[];
  easaDay: RecencyStatus;
  easaNight: RecencyStatus;
  faaDay: RecencyStatus;
  faaNight: RecencyStatus;
}

interface LandingEvent {
  date: Date;
  count: number;
}

function expandLandings(events: LandingEvent[]): Date[] {
  return events
    .flatMap((event) => Array.from({ length: event.count }, () => event.date))
    .sort((a, b) => b.getTime() - a.getTime());
}

function evaluate(landings: Date[], required: number, today: Date, days: number): RecencyStatus {
  const windowStart = addDays(today, -days);
  const count = landings.filter((date) => date >= windowStart && date <= today).length;
  const decisive = landings.filter((date) => date <= today)[required - 1];
  const validUntil = decisive ? addDays(decisive, days) : null;
  return { isCurrent: count >= required, count, required, validUntil };
}

/** Observers log flights too, but that time is not crew flight time. */
export const isObserverFlight = (flight: LocalFlight) =>
  flight.flightRole === 'Observer' || flight.flightHandling === 'Observer';

/** Only the pilot at the controls earns recency. Records without the field predate it and keep counting. */
const earnsRecency = (flight: LocalFlight) => !flight.flightHandling || flight.flightHandling === 'PF';

/** Flights, and sessions in a full flight simulator, which both rules accept for take-offs and landings. */
const countsForRecency = (entry: LocalFlight) => {
  if (isDraft(entry) || isObserverFlight(entry) || !earnsRecency(entry)) return false;
  const type = entryTypeOf(entry);
  return type === 'flight' || (type === 'simulator' && RECENCY_DEVICES.includes((entry.simDevice || '').toUpperCase()));
};

export const ratingOf = (aircraftType: string, settings: CurrencySettings = DEFAULT_CURRENCY_SETTINGS) =>
  settings.ratingOverrides[normalizeAircraftType(aircraftType)]?.trim() || getTypeRating(aircraftType);

/**
 * Recency per type rating. A take-off and a landing count as one event only together, and at
 * night EASA needs one such event while FAA needs three night landings to a full stop.
 */
export function computeCurrency(
  flights: LocalFlight[],
  today: Date = new Date(),
  settings: CurrencySettings = DEFAULT_CURRENCY_SETTINGS
): TypeCurrency[] {
  const { recencyDays, requiredLandings } = { ...DEFAULT_CURRENCY_SETTINGS, ...settings };
  const byRating = new Map<string, LocalFlight[]>();
  flights.forEach((flight) => {
    if (!normalizeAircraftType(flight.aircraftType) || !countsForRecency(flight)) return;
    if ((flight.landingsDay || 0) + (flight.landingsNight || 0) === 0) return;
    const rating = ratingOf(flight.aircraftType, settings);
    byRating.set(rating, [...(byRating.get(rating) || []), flight]);
  });

  return Array.from(byRating.entries())
    .map(([aircraftType, ratingFlights]) => {
      const events = (count: (flight: LocalFlight) => number) =>
        expandLandings(ratingFlights.map((flight) => ({ date: parseFlightDate(flight.date), count: count(flight) })));

      const all = events((flight) => {
        const takeoffs = takeoffsOf(flight);
        return Math.min(takeoffs.day + takeoffs.night, (flight.landingsDay || 0) + (flight.landingsNight || 0));
      });
      const night = events((flight) => Math.min(takeoffsOf(flight).night, flight.landingsNight || 0));
      const fullStopNight = events((flight) => Math.min(takeoffsOf(flight).night, fullStopNightLandingsOf(flight)));

      const easaDay = evaluate(all, requiredLandings, today, recencyDays);
      // FCL.060(b)(2): one of the take-offs and landings must be at night, unless the pilot holds an IR
      const lastNight = evaluate(night, 1, today, recencyDays);
      const nightDates = [easaDay.validUntil, lastNight.validUntil];
      const easaNight: RecencyStatus = settings.holdsInstrumentRating
        ? { ...easaDay, exempt: true }
        : {
            isCurrent: easaDay.isCurrent && lastNight.isCurrent,
            count: lastNight.count,
            required: 1,
            validUntil: nightDates.every(Boolean)
              ? new Date(Math.min(...nightDates.map((date) => (date as Date).getTime())))
              : null,
          };

      return {
        aircraftType,
        aircraftTypes: Array.from(new Set(ratingFlights.map((f) => normalizeAircraftType(f.aircraftType)))).sort(),
        easaDay,
        easaNight,
        faaDay: evaluate(all, requiredLandings, today, recencyDays),
        // 61.57(b): three take-offs and landings to a full stop at night
        faaNight: evaluate(fullStopNight, requiredLandings, today, recencyDays),
      };
    })
    .sort((a, b) => (b.easaDay.validUntil?.getTime() || 0) - (a.easaDay.validUntil?.getTime() || 0));
}

export const daysUntil = (date: Date, today: Date = new Date()) => daysBetween(today, date);

const CURRENCY_ALERT_DAYS = 14;
const EXPIRED_ALERT_DAYS = 30;

export interface CurrencyAlert {
  aircraftType: string;
  validUntil: Date;
  isExpired: boolean;
}

/** Warns about recency that is ending or just ended. A type flown years ago is history, not an alert. */
export function getCurrencyAlerts(currency: TypeCurrency[], today: Date = new Date()): CurrencyAlert[] {
  return currency.flatMap(({ aircraftType, easaDay }) => {
    if (!easaDay.validUntil) return [];
    const days = daysUntil(easaDay.validUntil, today);
    if (easaDay.isCurrent ? days > CURRENCY_ALERT_DAYS : days < -EXPIRED_ALERT_DAYS) return [];
    return [{ aircraftType, validUntil: easaDay.validUntil, isExpired: !easaDay.isCurrent }];
  });
}

export interface LimitStatus {
  key: string;
  label: string;
  minutes: number;
  limitMinutes: number;
  ratio: number;
}

/** EASA ORO.FTL.210(b) flight time limits. */
export function computeFlightLimits(flights: LocalFlight[], today: Date = new Date()): LimitStatus[] {
  const end = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const logged = flights.filter((flight) => entryTypeOf(flight) === 'flight' && !isDraft(flight) && !isObserverFlight(flight));

  const sumFrom = (start: Date) =>
    logged.reduce((sum, flight) => {
      const date = parseFlightDate(flight.date);
      return date >= start && date <= end ? sum + (flight.totalTimeMinutes || 0) : sum;
    }, 0);

  const limits = [
    { key: '28d', label: '28 дней', hours: 100, start: addDays(end, -27) },
    { key: 'year', label: 'Календарный год', hours: 900, start: new Date(end.getFullYear(), 0, 1) },
    { key: '12m', label: '12 календарных месяцев', hours: 1000, start: new Date(end.getFullYear(), end.getMonth() - 11, 1) },
  ];

  return limits.map(({ key, label, hours, start }) => {
    const minutes = sumFrom(start);
    return { key, label, minutes, limitMinutes: hours * 60, ratio: minutes / (hours * 60) };
  });
}
