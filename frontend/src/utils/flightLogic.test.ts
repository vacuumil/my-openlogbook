import { describe, expect, it } from 'vitest';
import { LocalAirport, LocalFlight } from '../db/db';
import { parseFlightDate, toDateKey } from './dates';
import { computeCurrency, computeFlightLimits, DEFAULT_CURRENCY_SETTINGS, getCurrencyAlerts, isObserverFlight } from './currency';
import { computePeriodComparison, computeRecords, computeTotals } from './flightStats';
import {
  buildIataIndex,
  EMPTY_FILTERS,
  filterFlights,
  getFilterChips,
  hasActiveFilters,
  resolvePeriod,
  sortFlights,
} from './flightFilters';
import { buildGreatCirclePath, buildRouteNetwork, getViewBounds, getWorldOffsets } from './routeNetwork';
import { resolveHotkey } from './hotkeys';

const flight = (overrides: Partial<LocalFlight> = {}): LocalFlight => ({
  id: crypto.randomUUID(),
  date: '2026-10-01',
  depIcao: 'UUEE',
  arrIcao: 'OMDB',
  outTimeUtc: '08:00',
  offTimeUtc: '08:15',
  onTimeUtc: '13:00',
  inTimeUtc: '13:10',
  totalTimeMinutes: 300,
  nightTimeMinutes: 0,
  ifrTimeMinutes: 300,
  picTimeMinutes: 0,
  sicTimeMinutes: 300,
  picusTimeMinutes: 0,
  dualTimeMinutes: 0,
  landingsDay: 1,
  landingsNight: 0,
  aircraftReg: 'RA-73000',
  aircraftType: 'A320',
  syncStatus: 'synced',
  updatedAt: '2026-10-01T14:00:00.000Z',
  ...overrides,
});

const airport = (icao: string, latitude: number, longitude: number, iata?: string): LocalAirport => ({
  icao,
  iata,
  name: icao,
  latitude,
  longitude,
  timezone: 'UTC',
});

const today = new Date(2026, 10, 2);
const iataIndex = buildIataIndex([airport('UUEE', 55.97, 37.41, 'SVO'), airport('OMDB', 25.25, 55.36, 'DXB')]);

describe('filterFlights', () => {
  const flights = [
    flight({ remarks: 'Ночной рейс', nightTimeMinutes: 60 }),
    flight({ depIcao: 'OMDB', arrIcao: 'UUEE', aircraftType: 'B738', aircraftReg: 'VP-BAA', date: '2025-03-01', syncStatus: 'created' }),
    flight({ depIcao: 'ULLI', arrIcao: 'LTFM', flightRole: 'PIC', flightHandling: 'PM', approachType: 'ILS CAT I' }),
  ];
  const search = (query: string) => filterFlights(flights, { ...EMPTY_FILTERS, query }, iataIndex, today);

  it('requires every search word to match', () => {
    expect(search('UUEE B738')).toHaveLength(1);
    expect(search('UUEE LTFM')).toHaveLength(0);
  });

  it('finds a route in both directions', () => {
    expect(search('UUEE-OMDB')).toHaveLength(2);
    expect(search('omdb>uuee')).toHaveLength(2);
    expect(search('SVO-DXB')).toHaveLength(2);
  });

  it('finds ICAO flights by IATA code', () => {
    expect(search('SVO')).toHaveLength(2);
  });

  it('still finds registrations that look like routes', () => {
    expect(search('VP-BAA')).toHaveLength(1);
  });

  it('searches Cyrillic remarks regardless of case', () => {
    expect(search('ночной')).toHaveLength(1);
  });

  it('combines structured filters', () => {
    const apply = (overrides: Partial<typeof EMPTY_FILTERS>) =>
      filterFlights(flights, { ...EMPTY_FILTERS, ...overrides }, iataIndex, today);

    expect(apply({ aircraftTypes: ['B738', 'A320'] })).toHaveLength(3);
    expect(apply({ handling: 'PM' })).toHaveLength(1);
    expect(apply({ role: 'PIC', approach: 'ils' })).toHaveLength(1);
    expect(apply({ nightOnly: true })).toHaveLength(1);
    expect(apply({ pendingOnly: true })).toHaveLength(1);
    expect(apply({ airport: 'SVO' })).toHaveLength(2);
    expect(apply({ registration: 'vp-' })).toHaveLength(1);
  });

  it('applies periods inclusively', () => {
    const edge = [flight({ date: '2026-10-04' }), flight({ date: '2026-10-03' })];

    expect(filterFlights(edge, { ...EMPTY_FILTERS, period: '30d' }, iataIndex, today)).toHaveLength(1);
    expect(resolvePeriod({ ...EMPTY_FILTERS, period: 'lastYear' }, today)).toEqual({ from: '2025-01-01', to: '2025-12-31' });
    expect(
      filterFlights(flights, { ...EMPTY_FILTERS, period: 'custom', dateFrom: '2025-01-01', dateTo: '2025-12-31' }, iataIndex, today)
    ).toHaveLength(1);
  });

  it('describes active filters as removable chips', () => {
    const filters = { ...EMPTY_FILTERS, aircraftTypes: ['A320', 'B738'], nightOnly: true };

    expect(hasActiveFilters(EMPTY_FILTERS)).toBe(false);
    expect(hasActiveFilters(filters)).toBe(true);
    const chips = getFilterChips(filters);
    expect(chips).toHaveLength(3);
    expect(chips[0].clear).toEqual({ aircraftTypes: ['B738'] });
  });

  it('sorts without mutating the source', () => {
    const list = [flight({ date: '2026-01-01', totalTimeMinutes: 10 }), flight({ date: '2026-02-01', totalTimeMinutes: 5 })];

    expect(sortFlights(list, 'date-desc')[0].date).toBe('2026-02-01');
    expect(sortFlights(list, 'date-asc')[0].date).toBe('2026-01-01');
    expect(sortFlights(list, 'time-desc')[0].totalTimeMinutes).toBe(10);
    expect(list[0].date).toBe('2026-01-01');
  });
});

describe('dates', () => {
  it('keeps the calendar day in any timezone', () => {
    expect(parseFlightDate('2026-10-01').getDate()).toBe(1);
    expect(toDateKey(parseFlightDate('2026-10-01'))).toBe('2026-10-01');
  });
});

describe('computeCurrency', () => {
  it('counts recency per aircraft type', () => {
    const flights = [
      flight({ date: '2026-10-30', landingsDay: 2 }),
      flight({ date: '2026-10-29', aircraftType: 'B738', landingsDay: 2 }),
    ];

    const result = computeCurrency(flights, today);

    expect(result).toHaveLength(2);
    expect(result.every((item) => !item.easaDay.isCurrent)).toBe(true);
  });

  it('dates expiry from the third most recent landing', () => {
    const flights = [
      flight({ date: '2026-10-20', landingsDay: 1 }),
      flight({ date: '2026-10-10', landingsDay: 1 }),
      flight({ date: '2026-10-01', landingsDay: 1 }),
      flight({ date: '2026-09-01', landingsDay: 5 }),
    ];

    const [a320] = computeCurrency(flights, today);

    expect(a320.easaDay.isCurrent).toBe(true);
    expect(toDateKey(a320.easaDay.validUntil as Date)).toBe('2026-12-30');
  });

  it('treats the 90th day as still valid and the 91st as expired', () => {
    const flights = [flight({ date: '2026-08-04', landingsDay: 3 })];

    expect(computeCurrency(flights, today)[0].easaDay.isCurrent).toBe(true);
    expect(computeCurrency(flights, new Date(2026, 10, 3))[0].easaDay.isCurrent).toBe(false);
  });

  it('applies different night rules for EASA and FAA', () => {
    const flights = [flight({ date: '2026-10-20', landingsDay: 2, landingsNight: 1 })];

    const [a320] = computeCurrency(flights, today);

    expect(a320.easaNight.isCurrent).toBe(true);
    expect(a320.faaNight.isCurrent).toBe(false);
    expect(a320.faaNight.count).toBe(1);
  });

  it('does not report night currency without three landings overall', () => {
    const [a320] = computeCurrency([flight({ date: '2026-10-20', landingsDay: 0, landingsNight: 1 })], today);

    expect(a320.easaNight.isCurrent).toBe(false);
  });

  it('ignores flights without landings', () => {
    expect(computeCurrency([flight({ landingsDay: 0 })], today)).toEqual([]);
  });
});

describe('computeFlightLimits', () => {
  const limit = (flights: LocalFlight[], key: string) => computeFlightLimits(flights, today).find((item) => item.key === key)!;

  it('uses a rolling window of exactly 28 days', () => {
    const flights = [flight({ date: '2026-10-06', totalTimeMinutes: 60 }), flight({ date: '2026-10-05', totalTimeMinutes: 600 })];

    expect(limit(flights, '28d').minutes).toBe(60);
    expect(limit(flights, '28d').limitMinutes).toBe(6000);
  });

  it('separates the calendar year from twelve calendar months', () => {
    const flights = [
      flight({ date: '2026-01-01', totalTimeMinutes: 60 }),
      flight({ date: '2025-12-01', totalTimeMinutes: 120 }),
      flight({ date: '2025-11-30', totalTimeMinutes: 240 }),
    ];

    expect(limit(flights, 'year').minutes).toBe(60);
    expect(limit(flights, '12m').minutes).toBe(180);
  });

  it('does not count observer flights or future dates', () => {
    const flights = [flight({ date: '2026-11-01', flightRole: 'Observer' }), flight({ date: '2026-11-03' })];

    expect(limit(flights, '28d').minutes).toBe(0);
  });
});

describe('flight statistics', () => {
  it('adds transferred hours to totals', () => {
    const totals = computeTotals([flight({ picTimeMinutes: 60, picusTimeMinutes: 30, landingsNight: 1 })], {
      previousTotalHours: 10,
      previousPicHours: 1,
      previousLandings: 5,
    });

    expect(totals.totalMinutes).toBe(900);
    expect(totals.picMinutes).toBe(150);
    expect(totals.landings).toBe(7);
  });

  it('compares calendar periods across a year boundary', () => {
    const january = new Date(2027, 0, 15);
    const result = computePeriodComparison(
      [flight({ date: '2027-01-02', totalTimeMinutes: 60 }), flight({ date: '2026-12-31', totalTimeMinutes: 120 })],
      january
    );

    expect(result).toEqual({ thisMonth: 60, lastMonth: 120, thisYear: 60, lastYear: 120 });
  });

  it('finds personal records and merges route directions', () => {
    const long = flight({ totalTimeMinutes: 800, date: '2026-05-01' });
    const records = computeRecords([long, flight({ depIcao: 'OMDB', arrIcao: 'UUEE' }), flight({ depIcao: 'ULLI', arrIcao: 'LTFM' })]);

    expect(records.longestFlight?.id).toBe(long.id);
    expect(records.topRoute?.count).toBe(2);
    expect(records.bestMonth?.key).toBe('2026-05');
    expect(computeRecords([]).longestFlight).toBeNull();
  });
});

describe('route network', () => {
  const airports = new Map<string, LocalAirport>([
    ['UUEE', airport('UUEE', 55.97, 37.41)],
    ['OMDB', airport('OMDB', 25.25, 55.36)],
    ['RJAA', airport('RJAA', 35.76, 140.39)],
    ['KSFO', airport('KSFO', 37.62, -122.38)],
  ]);

  it('merges both directions into one route', () => {
    const network = buildRouteNetwork(
      [flight({ totalTimeMinutes: 100 }), flight({ depIcao: 'OMDB', arrIcao: 'UUEE', totalTimeMinutes: 50 })],
      airports
    );

    expect(network.routes).toHaveLength(1);
    expect(network.routes[0].flights).toHaveLength(2);
    expect(network.routes[0].minutes).toBe(150);
    expect(network.airports).toHaveLength(2);
    expect(network.totalKm).toBeCloseTo(network.routes[0].distanceKm * 2);
  });

  it('reports airfields without coordinates', () => {
    const network = buildRouteNetwork([flight({ arrIcao: 'ZZZZ' })], airports);

    expect(network.routes).toHaveLength(0);
    expect(network.unresolved).toEqual(['ZZZZ']);
    expect(network.airports).toHaveLength(1);
  });

  it('skips local flights as routes but keeps the airfield', () => {
    const network = buildRouteNetwork([flight({ arrIcao: 'UUEE' })], airports);

    expect(network.routes).toHaveLength(0);
    expect(network.airports).toHaveLength(1);
  });

  it('keeps transpacific arcs continuous across the antimeridian', () => {
    const path = buildGreatCirclePath(airports.get('RJAA')!, airports.get('KSFO')!);
    const jumps = path.slice(1).map(([, lng], index) => Math.abs(lng - path[index][1]));

    expect(Math.max(...jumps)).toBeLessThan(20);
  });
});

describe('antimeridian rendering', () => {
  const airports = new Map<string, LocalAirport>([
    ['RJAA', airport('RJAA', 35.76, 140.39)],
    ['KSFO', airport('KSFO', 37.62, -122.38)],
    ['UUEE', airport('UUEE', 55.97, 37.41)],
    ['OMDB', airport('OMDB', 25.25, 55.36)],
  ]);

  it('ends the unwrapped arc on the destination airfield of a world copy', () => {
    const path = buildGreatCirclePath(airports.get('RJAA')!, airports.get('KSFO')!);
    const [latitude, longitude] = path[path.length - 1];

    expect(latitude).toBeCloseTo(37.62, 1);
    expect(((longitude - -122.38) % 360 + 360) % 360).toBeCloseTo(0, 1);
  });

  it('draws world copies only when an arc crosses the antimeridian', () => {
    const regional = buildRouteNetwork([flight()], airports);
    const transpacific = buildRouteNetwork([flight({ depIcao: 'RJAA', arrIcao: 'KSFO' })], airports);

    expect(getWorldOffsets(regional.routes)).toEqual([0]);
    expect(getWorldOffsets(transpacific.routes)).toEqual([-360, 0, 360]);
  });
});

describe('resolveHotkey', () => {
  const event = (code: string, overrides: Record<string, unknown> = {}) =>
    ({ code, ctrlKey: false, metaKey: false, altKey: false, target: { tagName: 'BODY' }, ...overrides }) as unknown as KeyboardEvent;

  it('maps physical keys, whatever the keyboard layout', () => {
    expect(resolveHotkey(event('KeyN'), false)).toBe('new-flight');
    expect(resolveHotkey(event('Slash'), false)).toBe('search');
    expect(resolveHotkey(event('KeyQ'), false)).toBeNull();
  });

  it('stays out of the way of typing, dialogs and browser shortcuts', () => {
    expect(resolveHotkey(event('KeyN', { target: { tagName: 'INPUT' } }), false)).toBeNull();
    expect(resolveHotkey(event('KeyN', { target: { tagName: 'SELECT' } }), false)).toBeNull();
    expect(resolveHotkey(event('KeyN', { target: { isContentEditable: true } }), false)).toBeNull();
    expect(resolveHotkey(event('KeyN', { ctrlKey: true }), false)).toBeNull();
    expect(resolveHotkey(event('KeyN', { metaKey: true }), false)).toBeNull();
    expect(resolveHotkey(event('KeyN'), true)).toBeNull();
  });
});

describe('recency per type rating', () => {
  it('counts A320 and A321 landings towards one rating', () => {
    const flights = [
      flight({ date: '2026-10-20', aircraftType: 'A320', landingsDay: 2 }),
      flight({ date: '2026-10-21', aircraftType: 'A321', landingsDay: 1 }),
    ];

    const [rating] = computeCurrency(flights, today);

    expect(rating.aircraftType).toBe('A320 (A318–A321)');
    expect(rating.aircraftTypes).toEqual(['A320', 'A321']);
    expect(rating.easaDay.isCurrent).toBe(true);
  });

  it('keeps separate ratings apart', () => {
    const flights = [flight({ date: '2026-10-20', landingsDay: 2 }), flight({ date: '2026-10-21', aircraftType: 'B738', landingsDay: 1 })];

    expect(computeCurrency(flights, today).every((rating) => !rating.easaDay.isCurrent)).toBe(true);
  });
});

describe('recency details', () => {
  const settings = DEFAULT_CURRENCY_SETTINGS;

  it('needs a take-off with every landing', () => {
    const [rating] = computeCurrency([flight({ date: '2026-10-20', landingsDay: 3, takeoffsDay: 2 })], today, settings);

    expect(rating.easaDay.count).toBe(2);
    expect(rating.easaDay.isCurrent).toBe(false);
  });

  it('counts only full-stop night landings for FAA', () => {
    const [rating] = computeCurrency(
      [flight({ date: '2026-10-20', landingsDay: 0, landingsNight: 3, fullStopLandingsNight: 1 })],
      today,
      settings
    );

    expect(rating.easaNight.isCurrent).toBe(true);
    expect(rating.faaNight.count).toBe(1);
  });

  it('exempts IR holders from the EASA night landing', () => {
    const [rating] = computeCurrency([flight({ date: '2026-10-20', landingsDay: 3 })], today, { ...settings, holdsInstrumentRating: true });

    expect(rating.easaNight).toMatchObject({ isCurrent: true, exempt: true });
  });

  it('accepts full flight simulator sessions but not other devices or drafts', () => {
    const ffs = flight({ date: '2026-10-20', landingsDay: 3, entryType: 'simulator', simDevice: 'FFS' });
    const fnpt = flight({ date: '2026-10-20', landingsDay: 3, entryType: 'simulator', simDevice: 'FNPT II' });
    const draft = flight({ date: '2026-10-20', landingsDay: 3, status: 'draft' });

    expect(computeCurrency([ffs], today, settings)[0].easaDay.isCurrent).toBe(true);
    expect(computeCurrency([fnpt, draft], today, settings)).toEqual([]);
  });

  it('applies the pilot\'s own rating groups and requirements', () => {
    const flights = [flight({ date: '2026-10-20', aircraftType: 'A330', landingsDay: 1 }), flight({ date: '2026-10-21', aircraftType: 'A320', landingsDay: 1 })];
    const custom = { ...settings, ratingOverrides: { A330: 'A320/A330 CCQ', A320: 'A320/A330 CCQ' }, requiredLandings: 2, recencyDays: 30 };

    const [rating] = computeCurrency(flights, today, custom);

    expect(rating.aircraftType).toBe('A320/A330 CCQ');
    expect(rating.easaDay).toMatchObject({ isCurrent: true, required: 2 });
    expect(rating.easaDay.validUntil?.getDate()).toBe(19);
  });
});

describe('recency eligibility', () => {
  it('does not grant recency for landings made as PM or observer', () => {
    const landings = (flightHandling: LocalFlight['flightHandling']) => [flight({ date: '2026-10-20', landingsDay: 3, flightHandling })];

    expect(computeCurrency(landings('PM'), today)).toEqual([]);
    expect(computeCurrency(landings('Observer'), today)).toEqual([]);
    expect(computeCurrency(landings('PF'), today)[0].easaDay.isCurrent).toBe(true);
    expect(computeCurrency(landings(undefined), today)[0].easaDay.isCurrent).toBe(true);
  });

  it('does not count an observer by either field in flight time limits', () => {
    const flights = [flight({ date: '2026-11-01', flightRole: 'SIC', flightHandling: 'Observer' })];

    expect(isObserverFlight(flights[0])).toBe(true);
    expect(computeFlightLimits(flights, today)[0].minutes).toBe(0);
  });
});

describe('getCurrencyAlerts', () => {
  const alertsFor = (date: string) => getCurrencyAlerts(computeCurrency([flight({ date, landingsDay: 3 })], today), today);

  it('warns shortly before expiry', () => {
    expect(alertsFor('2026-08-10')).toMatchObject([{ aircraftType: 'A320 (A318–A321)', isExpired: false }]);
    expect(alertsFor('2026-10-20')).toEqual([]);
  });

  it('reports a recent expiry but forgets types flown long ago', () => {
    expect(alertsFor('2026-07-20')).toMatchObject([{ isExpired: true }]);
    expect(alertsFor('2019-01-01')).toEqual([]);
  });
});

describe('map view bounds', () => {
  it('keeps regional and transpacific routes on one world copy', () => {
    const airports = new Map<string, LocalAirport>([
      ['UUEE', airport('UUEE', 55.97, 37.41)],
      ['RJAA', airport('RJAA', 35.76, 140.39)],
      ['KSFO', airport('KSFO', 37.62, -122.38)],
    ]);

    const network = buildRouteNetwork(
      [flight({ arrIcao: 'RJAA' }), flight({ depIcao: 'RJAA', arrIcao: 'KSFO' })],
      airports
    );
    const longitudes = network.routes.flatMap((route) => route.path.map(([, longitude]) => longitude));

    expect(Math.max(...longitudes) - Math.min(...longitudes)).toBeLessThan(210);
  });
});

describe('custom period', () => {
  it('is not an active filter until a date is set', () => {
    const custom = { ...EMPTY_FILTERS, period: 'custom' as const };

    expect(hasActiveFilters(custom)).toBe(false);
    expect(getFilterChips(custom)).toEqual([]);
    expect(hasActiveFilters({ ...custom, dateFrom: '2026-01-01' })).toBe(true);
  });
});

describe('getViewBounds', () => {
  const pacific = new Map<string, LocalAirport>([
    ['RJAA', airport('RJAA', 35.76, 140.39)],
    ['KSFO', airport('KSFO', 37.62, -122.38)],
    ['KJFK', airport('KJFK', 40.64, -73.78)],
  ]);

  it('keeps a network around the Pacific compact', () => {
    const network = buildRouteNetwork(
      [flight({ depIcao: 'RJAA', arrIcao: 'KSFO' }), flight({ depIcao: 'KSFO', arrIcao: 'KJFK' })],
      pacific
    );
    const view = getViewBounds([
      ...network.routes.flatMap((route) => route.path),
      ...network.airports.map(({ airport: a }): [number, number] => [a.latitude, a.longitude]),
    ])!;

    expect(view.east - view.west).toBeLessThan(160);
  });

  it('frames a regional network as is', () => {
    expect(getViewBounds([[55, 37], [25, 55]])).toEqual({ south: 25, north: 55, west: 37, east: 55 });
  });

  it('handles an empty network', () => {
    expect(getViewBounds([])).toBeNull();
  });
});
