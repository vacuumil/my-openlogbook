import { LocalFlight } from '../db/db';
import { addDays, daysBetween, parseFlightDate } from './dates';

const RECENCY_DAYS = 90;
const REQUIRED_LANDINGS = 3;

export interface RecencyStatus {
  isCurrent: boolean;
  count: number;
  required: number;
  validUntil: Date | null;
}

export interface TypeCurrency {
  aircraftType: string;
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

function evaluate(landings: Date[], required: number, today: Date): RecencyStatus {
  const windowStart = addDays(today, -RECENCY_DAYS);
  const count = landings.filter((date) => date >= windowStart && date <= today).length;
  const decisive = landings.filter((date) => date <= today)[required - 1];
  const validUntil = decisive ? addDays(decisive, RECENCY_DAYS) : null;
  return { isCurrent: count >= required, count, required, validUntil };
}

/** Observers log flights too, but that time is not crew flight time. */
export const isObserverFlight = (flight: LocalFlight) =>
  flight.flightRole === 'Observer' || flight.flightHandling === 'Observer';

/** Only the pilot at the controls earns recency. Records without the field predate it and keep counting. */
const earnsRecency = (flight: LocalFlight) => !flight.flightHandling || flight.flightHandling === 'PF';

/** Recency is per type: landings on an A320 say nothing about a B738. */
export function computeCurrency(flights: LocalFlight[], today: Date = new Date()): TypeCurrency[] {
  const byType = new Map<string, LocalFlight[]>();
  flights.forEach((flight) => {
    const type = (flight.aircraftType || '').trim().toUpperCase();
    if (!type || !earnsRecency(flight) || isObserverFlight(flight)) return;
    if ((flight.landingsDay || 0) + (flight.landingsNight || 0) === 0) return;
    byType.set(type, [...(byType.get(type) || []), flight]);
  });

  return Array.from(byType.entries())
    .map(([aircraftType, typeFlights]) => {
      const all = expandLandings(
        typeFlights.map((f) => ({
          date: parseFlightDate(f.date),
          count: (f.landingsDay || 0) + (f.landingsNight || 0),
        }))
      );
      const night = expandLandings(typeFlights.map((f) => ({ date: parseFlightDate(f.date), count: f.landingsNight || 0 })));

      const easaDay = evaluate(all, REQUIRED_LANDINGS, today);
      // FCL.060(b)(2): the three take-offs and landings must include at least one at night
      const lastNight = evaluate(night, 1, today);
      const nightDates = [easaDay.validUntil, lastNight.validUntil];
      const easaNight: RecencyStatus = {
        isCurrent: easaDay.isCurrent && lastNight.isCurrent,
        count: lastNight.count,
        required: 1,
        validUntil: nightDates.every(Boolean)
          ? new Date(Math.min(...nightDates.map((date) => (date as Date).getTime())))
          : null,
      };

      return {
        aircraftType,
        easaDay,
        easaNight,
        faaDay: evaluate(all, REQUIRED_LANDINGS, today),
        // 61.57(b): three night landings to a full stop
        faaNight: evaluate(night, REQUIRED_LANDINGS, today),
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
  const logged = flights.filter((flight) => !isObserverFlight(flight));

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
