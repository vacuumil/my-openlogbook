import { LocalFlight, LocalAirport } from '../db/db';
import { addDays, parseFlightDate, toDateKey } from './dates';
import { ENTRY_TYPE_LABELS, entryTypeOf, isDraft } from './entries';

export type FilterPeriod = 'all' | '30d' | '90d' | '12m' | 'thisYear' | 'lastYear' | 'custom';
export type FlightSort = 'date-desc' | 'date-asc' | 'time-desc' | 'route';

export interface FlightFilters {
  query: string;
  period: FilterPeriod;
  dateFrom: string;
  dateTo: string;
  aircraftTypes: string[];
  registration: string;
  role: string;
  handling: string;
  airport: string;
  approach: string;
  nightOnly: boolean;
  pendingOnly: boolean;
  /** Entry kind, or 'draft' for flights from a plan waiting for confirmation */
  entryType: '' | 'flight' | 'simulator' | 'ground' | 'draft';
}

export const EMPTY_FILTERS: FlightFilters = {
  query: '',
  period: 'all',
  dateFrom: '',
  dateTo: '',
  aircraftTypes: [],
  registration: '',
  role: '',
  handling: '',
  airport: '',
  approach: '',
  nightOnly: false,
  pendingOnly: false,
  entryType: '',
};

export const PERIOD_LABELS: Record<FilterPeriod, string> = {
  all: 'За всё время',
  '30d': '30 дней',
  '90d': '90 дней',
  '12m': '12 месяцев',
  thisYear: 'Этот год',
  lastYear: 'Прошлый год',
  custom: 'Свой период',
};

const ROUTE_TOKEN = /^([A-Z0-9]{3,4})[-–—>→]+([A-Z0-9]{3,4})$/;

const normalize = (value?: string) => (value || '').trim().toUpperCase();

export function resolvePeriod(filters: FlightFilters, today: Date = new Date()): { from: string; to: string } {
  const year = today.getFullYear();
  switch (filters.period) {
    case '30d':
      return { from: toDateKey(addDays(today, -29)), to: toDateKey(today) };
    case '90d':
      return { from: toDateKey(addDays(today, -89)), to: toDateKey(today) };
    case '12m':
      return { from: toDateKey(new Date(year - 1, today.getMonth(), today.getDate() + 1)), to: toDateKey(today) };
    case 'thisYear':
      return { from: `${year}-01-01`, to: `${year}-12-31` };
    case 'lastYear':
      return { from: `${year - 1}-01-01`, to: `${year - 1}-12-31` };
    case 'custom':
      return { from: filters.dateFrom, to: filters.dateTo };
    default:
      return { from: '', to: '' };
  }
}

/** Maps IATA codes to ICAO so that a search for SVO also finds flights logged as UUEE. */
export function buildIataIndex(airports: LocalAirport[]): Map<string, string> {
  const index = new Map<string, string>();
  airports.forEach((airport) => {
    if (airport.iata) index.set(airport.iata.toUpperCase(), airport.icao.toUpperCase());
  });
  return index;
}

const resolveCode = (code: string, iataIndex: Map<string, string>) => iataIndex.get(code) || code;

const servesAirport = (flight: LocalFlight, code: string, iataIndex: Map<string, string>) => {
  const target = resolveCode(code, iataIndex);
  return (
    resolveCode(normalize(flight.depIcao), iataIndex) === target ||
    resolveCode(normalize(flight.arrIcao), iataIndex) === target
  );
};

function matchesToken(flight: LocalFlight, token: string, iataIndex: Map<string, string>): boolean {
  const route = token.match(ROUTE_TOKEN);
  if (route) {
    const first = resolveCode(route[1], iataIndex);
    const second = resolveCode(route[2], iataIndex);
    const dep = resolveCode(normalize(flight.depIcao), iataIndex);
    const arr = resolveCode(normalize(flight.arrIcao), iataIndex);
    if ((dep === first && arr === second) || (dep === second && arr === first)) return true;
  }

  if (iataIndex.has(token) && servesAirport(flight, token, iataIndex)) return true;

  return [
    flight.depIcao,
    flight.arrIcao,
    flight.aircraftReg,
    flight.aircraftType,
    flight.approachType,
    flight.remarks,
    flight.date,
  ].some((field) => normalize(field).includes(token));
}

export function filterFlights(
  flights: LocalFlight[],
  filters: FlightFilters,
  iataIndex: Map<string, string> = new Map(),
  today: Date = new Date()
): LocalFlight[] {
  const tokens = normalize(filters.query).split(/\s+/).filter(Boolean);
  const { from, to } = resolvePeriod(filters, today);
  const registration = normalize(filters.registration);
  const airport = normalize(filters.airport);
  const approach = normalize(filters.approach);

  return flights.filter((flight) => {
    if (from && flight.date < from) return false;
    if (to && flight.date > to) return false;
    if (filters.aircraftTypes.length > 0 && !filters.aircraftTypes.includes(normalize(flight.aircraftType))) return false;
    if (registration && !normalize(flight.aircraftReg).includes(registration)) return false;
    if (filters.role === 'Observer') {
      if (flight.flightRole !== 'Observer' && flight.flightHandling !== 'Observer') return false;
    } else if (filters.role && flight.flightRole !== filters.role) {
      return false;
    }
    if (filters.handling && flight.flightHandling !== filters.handling) return false;
    if (airport && !servesAirport(flight, airport, iataIndex)) return false;
    if (approach && !normalize(flight.approachType).includes(approach)) return false;
    if (filters.nightOnly && !(flight.nightTimeMinutes > 0)) return false;
    if (filters.pendingOnly && flight.syncStatus === 'synced') return false;
    if (filters.entryType === 'draft' && !isDraft(flight)) return false;
    if (filters.entryType && filters.entryType !== 'draft' && entryTypeOf(flight) !== filters.entryType) return false;
    return tokens.every((token) => matchesToken(flight, token, iataIndex));
  });
}

export function hasActiveFilters(filters: FlightFilters): boolean {
  return (
    filters.query.trim() !== '' ||
    (filters.period === 'custom' ? Boolean(filters.dateFrom || filters.dateTo) : filters.period !== 'all') ||
    filters.aircraftTypes.length > 0 ||
    filters.registration.trim() !== '' ||
    filters.role !== '' ||
    filters.handling !== '' ||
    filters.airport.trim() !== '' ||
    filters.approach !== '' ||
    filters.nightOnly ||
    filters.pendingOnly ||
    Boolean(filters.entryType)
  );
}

export interface FilterChip {
  key: string;
  label: string;
  clear: Partial<FlightFilters>;
}

/** Active filters as individually removable chips. */
export function getFilterChips(filters: FlightFilters): FilterChip[] {
  const chips: FilterChip[] = [];
  if (filters.query.trim()) chips.push({ key: 'query', label: `Поиск: ${filters.query.trim()}`, clear: { query: '' } });
  if (filters.period === 'custom') {
    const range = [filters.dateFrom, filters.dateTo].filter(Boolean).join(' — ');
    if (range) chips.push({ key: 'period', label: range, clear: { period: 'all', dateFrom: '', dateTo: '' } });
  } else if (filters.period !== 'all') {
    chips.push({ key: 'period', label: PERIOD_LABELS[filters.period], clear: { period: 'all' } });
  }
  filters.aircraftTypes.forEach((type) => {
    chips.push({
      key: `type-${type}`,
      label: type,
      clear: { aircraftTypes: filters.aircraftTypes.filter((item) => item !== type) },
    });
  });
  if (filters.registration.trim()) chips.push({ key: 'reg', label: `Борт: ${filters.registration.trim()}`, clear: { registration: '' } });
  if (filters.role) chips.push({ key: 'role', label: filters.role, clear: { role: '' } });
  if (filters.handling) chips.push({ key: 'handling', label: filters.handling, clear: { handling: '' } });
  if (filters.airport.trim()) chips.push({ key: 'airport', label: `Аэродром: ${normalize(filters.airport)}`, clear: { airport: '' } });
  if (filters.approach) chips.push({ key: 'approach', label: filters.approach, clear: { approach: '' } });
  if (filters.nightOnly) chips.push({ key: 'night', label: 'Ночные', clear: { nightOnly: false } });
  if (filters.pendingOnly) chips.push({ key: 'pending', label: 'Не синхронизированы', clear: { pendingOnly: false } });
  if (filters.entryType) {
    const label = filters.entryType === 'draft' ? 'Черновики' : ENTRY_TYPE_LABELS[filters.entryType];
    chips.push({ key: 'entryType', label, clear: { entryType: '' } });
  }
  return chips;
}

export function getFilterOptions(flights: LocalFlight[]) {
  const types = new Set<string>();
  const approaches = new Set<string>();
  flights.forEach((flight) => {
    if (flight.aircraftType) types.add(normalize(flight.aircraftType));
    if (flight.approachType) approaches.add(flight.approachType.trim());
  });
  return {
    aircraftTypes: Array.from(types).sort(),
    approaches: Array.from(approaches).sort(),
  };
}

export function sortFlights(flights: LocalFlight[], sort: FlightSort): LocalFlight[] {
  const byDateDesc = (a: LocalFlight, b: LocalFlight) =>
    b.date.localeCompare(a.date) || (b.outTimeUtc || '').localeCompare(a.outTimeUtc || '');

  const sorted = [...flights];
  switch (sort) {
    case 'date-asc':
      return sorted.sort((a, b) => byDateDesc(b, a));
    case 'time-desc':
      return sorted.sort((a, b) => (b.totalTimeMinutes || 0) - (a.totalTimeMinutes || 0) || byDateDesc(a, b));
    case 'route':
      return sorted.sort(
        (a, b) => `${a.depIcao}${a.arrIcao}`.localeCompare(`${b.depIcao}${b.arrIcao}`) || byDateDesc(a, b)
      );
    default:
      return sorted.sort(byDateDesc);
  }
}

export function isWithinFlightDate(flight: LocalFlight, from: Date, to: Date): boolean {
  const date = parseFlightDate(flight.date);
  return date >= from && date <= to;
}
