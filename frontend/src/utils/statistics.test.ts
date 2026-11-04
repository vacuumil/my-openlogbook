import { describe, expect, it } from 'vitest';
import { LocalFlight } from '../db/db';
import { computeStatistics, percentChange } from './statistics';
import { getTypeRating } from './typeRatings';

const flight = (overrides: Partial<LocalFlight> = {}): LocalFlight =>
  ({
    id: crypto.randomUUID(),
    date: '2026-10-05',
    depIcao: 'UUEE',
    arrIcao: 'ULLI',
    totalTimeMinutes: 100,
    nightTimeMinutes: 0,
    picTimeMinutes: 0,
    picusTimeMinutes: 0,
    landingsDay: 1,
    landingsNight: 0,
    aircraftType: 'A320',
    flightRole: 'SIC',
    flightHandling: 'PF',
    syncStatus: 'synced',
    ...overrides,
  }) as LocalFlight;

const today = new Date(2026, 10, 3); // Tuesday, 3 November 2026

describe('computeStatistics', () => {
  it('limits totals to the period and compares with the period before', () => {
    const stats = computeStatistics(
      [flight({ date: '2026-10-05' }), flight({ date: '2025-12-01' }), flight({ date: '2025-11-30' }), flight({ date: '2024-12-01' }), flight({ date: '2024-11-30' })],
      '12m',
      today
    );

    expect(stats.totals.flights).toBe(2);
    expect(stats.previousTotals?.flights).toBe(2);
  });

  it('builds twelve monthly buckets split into day and night', () => {
    const stats = computeStatistics([flight({ date: '2026-11-01', totalTimeMinutes: 120, nightTimeMinutes: 30 })], '12m', today);

    expect(stats.timeline).toHaveLength(12);
    expect(stats.timeline[0].key).toBe('2025-12');
    expect(stats.timeline[11]).toMatchObject({ key: '2026-11', label: 'ноя', dayMinutes: 90, nightMinutes: 30, flights: 1 });
  });

  it('caps night time at the flight time', () => {
    const stats = computeStatistics([flight({ totalTimeMinutes: 60, nightTimeMinutes: 90 })], 'year', today);

    expect(stats.timeline[9]).toMatchObject({ dayMinutes: 0, nightMinutes: 60 });
  });

  it('groups a whole career by year', () => {
    const stats = computeStatistics([flight({ date: '2023-04-01' }), flight({ date: '2026-01-01' })], 'all', today);

    expect(stats.timeline.map((bucket) => bucket.key)).toEqual(['2023', '2024', '2025', '2026']);
    expect(stats.previousTotals).toBeNull();
  });

  it('ranks types, roles and airports', () => {
    const stats = computeStatistics(
      [
        flight({ aircraftType: 'b738', totalTimeMinutes: 300, flightRole: 'PIC', flightHandling: 'PM' }),
        flight({ aircraftType: 'A320' }),
        flight({ aircraftType: 'A320', depIcao: 'ULLI', arrIcao: 'ULLI' }),
      ],
      'all',
      today
    );

    expect(stats.byType.map((share) => [share.label, share.minutes])).toEqual([['B738', 300], ['A320', 200]]);
    expect(stats.byRole[0].label).toBe('PIC');
    expect(stats.byHandling.map((share) => share.label)).toEqual(['PM', 'PF']);
    expect(stats.airports[0]).toMatchObject({ label: 'ULLI', flights: 3 });
  });

  it('counts weekdays from Monday in local time', () => {
    const stats = computeStatistics([flight({ date: '2026-11-02' }), flight({ date: '2026-11-08' })], 'all', today);

    expect(stats.byWeekday[0].flights).toBe(1);
    expect(stats.byWeekday[6].flights).toBe(1);
  });

  it('lays out a year of weeks ending today', () => {
    const stats = computeStatistics([flight({ date: '2026-11-03', totalTimeMinutes: 200 }), flight({ date: '2026-11-03' })], '12m', today);
    const lastWeek = stats.heatmap.weeks[stats.heatmap.weeks.length - 1];

    expect(stats.heatmap.weeks).toHaveLength(53);
    expect(lastWeek[0]?.date).toBe('2026-11-02');
    expect(lastWeek[1]).toMatchObject({ date: '2026-11-03', minutes: 300, flights: 2 });
    expect(lastWeek[2]).toBeNull();
    expect(stats.heatmap.maxMinutes).toBe(300);
  });
});

describe('custom period', () => {
  const flights = [
    flight({ date: '2026-09-10' }),
    flight({ date: '2026-09-30' }),
    flight({ date: '2026-08-31' }),
    flight({ date: '2026-08-02' }),
    flight({ date: '2026-08-01' }),
  ];

  it('compares with the stretch of the same length just before', () => {
    const stats = computeStatistics(flights, 'custom', today, { from: '2026-09-01', to: '2026-09-30' });

    expect(stats.totals.flights).toBe(2);
    expect(stats.previousTotals?.flights).toBe(2);
  });

  it('accepts dates in either order', () => {
    const stats = computeStatistics(flights, 'custom', today, { from: '2026-09-30', to: '2026-09-01' });

    expect(stats.totals.flights).toBe(2);
  });

  it('switches bars to days, months or years by the length of the period', () => {
    const daily = computeStatistics(flights, 'custom', today, { from: '2026-09-01', to: '2026-09-30' });
    const monthly = computeStatistics(flights, 'custom', today, { from: '2025-11-15', to: '2026-09-30' });
    const yearly = computeStatistics(flights, 'custom', today, { from: '2020-01-01', to: '2026-09-30' });

    expect(daily.granularity).toBe('day');
    expect(daily.timeline).toHaveLength(30);
    expect(daily.timeline[9]).toMatchObject({ key: '2026-09-10', label: '10 сен', flights: 1 });
    expect(monthly.granularity).toBe('month');
    expect(monthly.timeline[0]).toMatchObject({ key: '2025-11', label: 'ноя 25' });
    expect(monthly.timeline).toHaveLength(11);
    expect(yearly.granularity).toBe('year');
    expect(yearly.timeline.map((bucket) => bucket.key)).toEqual(['2020', '2021', '2022', '2023', '2024', '2025', '2026']);
  });

  it('ends the activity map on the last day of the period', () => {
    const stats = computeStatistics(flights, 'custom', today, { from: '2026-09-01', to: '2026-09-30' });
    const lastWeek = stats.heatmap.weeks[stats.heatmap.weeks.length - 1];

    expect(lastWeek.filter(Boolean).pop()?.date).toBe('2026-09-30');
  });
});

describe('getTypeRating', () => {
  it('groups aircraft flown on one type rating', () => {
    expect(['A318', 'A319', 'a320', 'A321', 'A320neo', 'A-321', 'A20N', 'A21N'].map(getTypeRating)).toEqual(
      Array(8).fill('A320 (A318–A321)')
    );
    expect(['B737', 'B738', 'B39M', '737-800'].map(getTypeRating)).toEqual(Array(4).fill('B737'));
    expect(['E170', 'E190', 'E195'].map(getTypeRating)).toEqual(Array(3).fill('E170/E190'));
    expect(getTypeRating('SU95')).toBe('SSJ100');
  });

  it('keeps unrelated types apart and unknown types as they are', () => {
    expect(getTypeRating('A330')).not.toBe(getTypeRating('A320'));
    expect(getTypeRating('B777')).not.toBe(getTypeRating('B737'));
    expect(getTypeRating('L-410')).toBe('L410');
  });
});

describe('percentChange', () => {
  it('reports change only when a baseline exists', () => {
    expect(percentChange(150, 100)).toBe(50);
    expect(percentChange(50, 100)).toBe(-50);
    expect(percentChange(10, 0)).toBeNull();
    expect(percentChange(10, undefined)).toBeNull();
  });
});
