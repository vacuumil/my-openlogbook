import { describe, expect, it } from 'vitest';
import { LocalFlight, WorkEntry } from '../db/db';
import { availableYears, compareYears, computeYearReport, forecastLimits, upcomingPlanFlights } from './analytics';

const flight = (overrides: Partial<LocalFlight> = {}): LocalFlight =>
  ({
    id: crypto.randomUUID(),
    date: '2026-03-02',
    depIcao: 'UUEE',
    arrIcao: 'ULLI',
    totalTimeMinutes: 90,
    nightTimeMinutes: 30,
    landingsDay: 1,
    landingsNight: 0,
    aircraftType: 'A320',
    ...overrides,
  }) as LocalFlight;

const planEntry = (overrides: Partial<WorkEntry> = {}): WorkEntry => ({
  id: crypto.randomUUID(),
  date: '2026-11-05',
  kind: 'flight',
  title: 'SU1204 SVO-PEE',
  start: '08:00',
  end: '18:00',
  nightMinutes: 0,
  note: '',
  ...overrides,
});

const today = new Date(2026, 10, 3);

describe('computeYearReport', () => {
  const flights = [
    flight({ date: '2025-05-01' }),
    flight({ date: '2026-03-02', totalTimeMinutes: 300, arrIcao: 'OMDB' }),
    flight({ date: '2026-03-09' }),
    flight({ date: '2026-07-10', aircraftType: 'B738', depIcao: 'ULLI', arrIcao: 'UUEE' }),
    flight({ date: '2026-08-01', status: 'draft', arrIcao: 'KJFK' }),
  ];

  it('sums the year and compares with the previous one', () => {
    const report = computeYearReport(flights, 2026);

    expect(report.totals).toEqual({ minutes: 480, flights: 3, nightMinutes: 90, landings: 3 });
    expect(report.previous?.flights).toBe(1);
  });

  it('finds firsts and favourites of the year', () => {
    const report = computeYearReport(flights, 2026);

    expect(report.newAirports).toEqual(['OMDB']);
    expect(report.longestFlight?.arrIcao).toBe('OMDB');
    expect(report.busiestMonth).toEqual({ month: 2, minutes: 390 });
    expect(report.busiestWeekday).toBe('понедельник');
    expect(report.topRoute).toMatchObject({ dep: 'ULLI', arr: 'UUEE', count: 2 });
    expect(report.types.map((t) => t.type)).toEqual(['A320', 'B738']);
    expect([report.firstDate, report.lastDate]).toEqual(['2026-03-02', '2026-07-10']);
  });

  it('handles a year without flights', () => {
    const report = computeYearReport(flights, 2020);

    expect(report.totals.flights).toBe(0);
    expect(report.longestFlight).toBeNull();
    expect(report.busiestMonth).toBeNull();
  });

  it('lists years with flights, newest first and without drafts', () => {
    expect(availableYears(flights)).toEqual([2026, 2025]);
  });
});

describe('compareYears', () => {
  it('splits each year into calendar months', () => {
    const [current, previous] = compareYears([flight({ date: '2026-03-02' }), flight({ date: '2025-12-31' })], [2026, 2025]);

    expect(current.months[2]).toBe(90);
    expect(previous.months[11]).toBe(90);
    expect(current.months).toHaveLength(12);
  });
});

describe('forecastLimits', () => {
  it('adds plan flights from tomorrow and finds the day a limit breaks', () => {
    const logbook = [flight({ date: '2026-10-20', totalTimeMinutes: 80 * 60 })];
    const plan = [planEntry({ date: '2026-11-03' }), planEntry({ date: '2026-11-05' }), planEntry({ date: '2026-11-08' })];

    const forecast = forecastLimits(logbook, plan, today, 10);
    const window28 = forecast.find((limit) => limit.key === '28d')!;

    // 80 h logged + 10 h on 5 Nov + 10 h on 8 Nov; today's 10 h plan is not counted
    expect(window28.peakMinutes).toBe(100 * 60);
    expect(window28.peakDate).toBe('2026-11-08');
    expect(window28.exceedsOn).toBeNull();
  });

  it('reports the first day over the limit', () => {
    const logbook = [flight({ date: '2026-10-20', totalTimeMinutes: 95 * 60 })];

    const forecast = forecastLimits(logbook, [planEntry({ date: '2026-11-05' })], today, 10);

    expect(forecast.find((limit) => limit.key === '28d')?.exceedsOn).toBe('2026-11-05');
  });

  it('ignores duties other than flights', () => {
    const forecast = forecastLimits([], [planEntry({ kind: 'reserve' })], today, 5);

    expect(forecast.every((limit) => limit.peakMinutes === 0)).toBe(true);
  });
});

describe('upcomingPlanFlights', () => {
  it('returns today and tomorrow in order with ICAO codes', () => {
    const plan = [
      planEntry({ date: '2026-11-04', start: '20:00' }),
      planEntry({ date: '2026-11-03', start: '09:00', title: 'SU10 PEE-SVO' }),
      planEntry({ date: '2026-11-06' }),
      planEntry({ date: '2026-11-03', kind: 'reserve' }),
    ];

    const flights = upcomingPlanFlights(plan, new Map([['SVO', 'UUEE'], ['PEE', 'USPP']]), today);

    expect(flights.map((f) => [f.date, f.flightNumber, f.depIcao, f.arrIcao])).toEqual([
      ['2026-11-03', 'SU10', 'USPP', 'UUEE'],
      ['2026-11-04', 'SU1204', 'UUEE', 'USPP'],
    ]);
  });
});
