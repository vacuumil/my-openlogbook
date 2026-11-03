import { describe, expect, it } from 'vitest';
import { LocalFlight, WorkEntry } from '../db/db';
import {
  buildWorkCsv,
  computeEntryMinutes,
  detectPlanMonth,
  entriesFromFlights,
  parseDutyPlan,
  summarizeMonth,
  withoutDuplicates,
} from './workTime';

const entry = (overrides: Partial<WorkEntry> = {}): WorkEntry => ({
  id: crypto.randomUUID(),
  date: '2026-11-05',
  kind: 'flight',
  title: 'SVO-LED',
  start: '08:00',
  end: '10:30',
  nightMinutes: 0,
  note: '',
  ...overrides,
});

describe('computeEntryMinutes', () => {
  it('handles work over midnight and empty times', () => {
    expect(computeEntryMinutes('08:00', '10:30')).toBe(150);
    expect(computeEntryMinutes('23:30', '01:00')).toBe(90);
    expect(computeEntryMinutes('', '')).toBe(0);
  });
});

describe('detectPlanMonth', () => {
  it('reads the month from a header', () => {
    expect(detectPlanMonth(['План на ноябрь 2026'], '2020-01')).toBe('2026-11');
    expect(detectPlanMonth(['Period 11.2026'], '2020-01')).toBe('2026-11');
    expect(detectPlanMonth(['Roster NOV 2026'], '2020-01')).toBe('2026-11');
    expect(detectPlanMonth(['Иванов И.И.'], '2020-01')).toBe('2020-01');
  });
});

describe('parseDutyPlan', () => {
  it('recognises flights in several date formats', () => {
    const entries = parseDutyPlan(
      [
        '05.11.2026 SU1492 SVO-LED 08:00 10:30',
        '2026-11-06 SVO-AER-SVO 09:15 16:45',
        '07NOV SU1000 LED-SVO 23:30 01:00',
      ],
      '2026-11'
    );

    expect(entries.map((e) => [e.date, e.kind, e.title, e.start, e.end])).toEqual([
      ['2026-11-05', 'flight', 'SU1492 SVO-LED', '08:00', '10:30'],
      ['2026-11-06', 'flight', 'SVO-AER-SVO', '09:15', '16:45'],
      ['2026-11-07', 'flight', 'SU1000 LED-SVO', '23:30', '01:00'],
    ]);
  });

  it('recognises duties in Russian and English', () => {
    const entries = parseDutyPlan(
      ['01 ОТПУСК', '02 ВЫХ', '03 Резерв 08:00 20:00', '04 SIM 10:00 14:00', '05 SICK', '06 Медосмотр 09:00 10:00'],
      '2026-11'
    );

    expect(entries.map((e) => [e.date.slice(-2), e.kind])).toEqual([
      ['01', 'vacation'],
      ['02', 'off'],
      ['03', 'reserve'],
      ['04', 'training'],
      ['05', 'sick'],
      ['06', 'ground'],
    ]);
  });

  it('uses the plan header for rows that only state the day', () => {
    const [first] = parseDutyPlan(['План: ноябрь 2026', '12 SU100 SVO-LED 08:00 09:30'], '2020-01');

    expect(first.date).toBe('2026-11-12');
  });

  it('continues the previous date for extra legs', () => {
    const entries = parseDutyPlan(['05.11.2026 SVO-LED 08:00 09:30', 'LED-SVO 11:00 12:30'], '2026-11');

    expect(entries.map((e) => e.date)).toEqual(['2026-11-05', '2026-11-05']);
  });

  it('skips headers and text that is not work', () => {
    expect(parseDutyPlan(['Иванов Иван Иванович', 'Страница 1 из 2', 'Табельный 1234'], '2026-11')).toEqual([]);
  });

  it('does not take a registration or a time for a date', () => {
    const [flight] = parseDutyPlan(['05.11.2026 RA-73001 SVO-LED 08:00 09:30'], '2026-11');

    expect(flight.date).toBe('2026-11-05');
    expect(flight.start).toBe('08:00');
  });
});

describe('entriesFromFlights', () => {
  const flight = (overrides: Partial<LocalFlight>) =>
    ({
      id: 'f1',
      date: '2026-11-05',
      depIcao: 'UUEE',
      arrIcao: 'ULLI',
      outTimeUtc: '08:00',
      inTimeUtc: '09:30',
      nightTimeMinutes: 30,
      syncStatus: 'synced',
      ...overrides,
    }) as LocalFlight;

  it('takes only the chosen month and skips deleted flights', () => {
    const entries = entriesFromFlights(
      [flight({}), flight({ id: 'f2', date: '2026-10-05' }), flight({ id: 'f3', syncStatus: 'deleted' })],
      '2026-11'
    );

    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ id: 'flight-f1', title: 'UUEE-ULLI', nightMinutes: 30 });
  });
});

describe('withoutDuplicates', () => {
  it('skips rows already in the table and repeated in the file', () => {
    const existing = [entry()];
    const incoming = [entry(), entry({ title: 'LED-SVO' }), entry({ title: 'LED-SVO' })];

    expect(withoutDuplicates(existing, incoming).map((e) => e.title)).toEqual(['LED-SVO']);
  });
});

describe('summarizeMonth', () => {
  it('sums paid work, night surcharge and base salary', () => {
    const summary = summarizeMonth(
      [
        entry({ nightMinutes: 60 }),
        entry({ date: '2026-11-06', kind: 'reserve', start: '08:00', end: '12:00' }),
        entry({ date: '2026-11-07', kind: 'vacation', start: '08:00', end: '12:00' }),
      ],
      { monthlyBase: 1000, hourly: { flight: 100, reserve: 50 }, nightPercent: 20 }
    );

    expect(summary.totalMinutes).toBe(390);
    expect(summary.workDays).toBe(2);
    expect(summary.minutesByKind).toEqual({ flight: 150, reserve: 240 });
    expect(summary.estimatedPay).toBe(1000 + 250 + 200 + 20);
  });
});

describe('buildWorkCsv', () => {
  it('produces rows in date order with a decimal comma', () => {
    const csv = buildWorkCsv([entry({ date: '2026-11-06' }), entry({ date: '2026-11-05', note: 'тест; ещё' })]);
    const rows = csv.split('\r\n');

    expect(rows[1]).toBe('2026-11-05;Рейс;SVO-LED;08:00;10:30;2,50;0,00;"тест; ещё"');
    expect(rows[2].startsWith('2026-11-06')).toBe(true);
  });

  it('neutralises spreadsheet formulas from imported text', () => {
    expect(buildWorkCsv([entry({ title: '=HYPERLINK("x")' })])).toContain(`"'=HYPERLINK(""x"")"`);
  });
});
