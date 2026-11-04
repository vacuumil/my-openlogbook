import { describe, expect, it } from 'vitest';
import { LocalFlight, WorkEntry } from '../db/db';
import {
  buildWorkCsv,
  computeEntryMinutes,
  detectPlanMonth,
  entriesFromFlights,
  parseDutyPlan,
  getPlannedFlightMinutes,
  buildFlightDuties,
  DEFAULT_WORK_RATES as DEFAULTS,
  getDutyWarnings,
  DEFAULT_WORK_RATES,
  formatClock,
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

describe('crew plan layout', () => {
  // Same layout as the airline's monthly plan; names and flights are made up
  const plan = [
    'График работ на ноябрь 2026 года.',
    'Пилот Тестовый',
    'Планируемое полётное время 17 ч 05 мин Сгенерировано 02.11.2026 15:19',
    'Дата Назначение',
    '01.11, Вс 17:35 SVO/B - Шереметьево (B) 19:45 PEE - Пермь',
    '4 ч 30 мин 2 ч 10 мин A-320A - SU1204',
    '20:40 PEE - Пермь 23:00 SVO/B - Шереметьево (B)',
    '2 ч 20 мин A-320A - SU1205',
    '13.11, Пт 23:35 SVO/C - Шереметьево (C) 03:05 NQZ - Астана',
    '7 ч 20 мин 3 ч 30 мин A-321B - SU1956',
    '04:05 NQZ - Астана 07:55 SVO/C - Шереметьево (C)',
    '3 ч 50 мин A-321B - SU1957',
    '30.11, Пн 03:15 KJA - Красноярск 08:30 SVO/B - Шереметьево (B)',
    '5 ч 15 мин',
    '5 ч 15 мин A-321B - SU1481',
    '17 ч 05 мин – планируемое полётное время за ноябрь 2026 года.',
  ];

  it('reads every leg with its flight number and aircraft', () => {
    const entries = parseDutyPlan(plan, '2020-01');

    expect(entries.map((e) => [e.date, e.title, e.start, e.end, e.note])).toEqual([
      ['2026-11-01', 'SU1204 SVO-PEE', '17:35', '19:45', 'A-320A'],
      ['2026-11-01', 'SU1205 PEE-SVO', '20:40', '23:00', 'A-320A'],
      ['2026-11-13', 'SU1956 SVO-NQZ', '23:35', '03:05', 'A-321B'],
      ['2026-11-14', 'SU1957 NQZ-SVO', '04:05', '07:55', 'A-321B'],
      ['2026-11-30', 'SU1481 KJA-SVO', '03:15', '08:30', 'A-321B'],
    ]);
  });

  it('matches the flight time the plan states', () => {
    const entries = parseDutyPlan(plan, '2020-01');
    const parsed = entries.reduce((sum, e) => sum + computeEntryMinutes(e.start, e.end), 0);

    expect(getPlannedFlightMinutes(plan)).toBe(17 * 60 + 5);
    expect(parsed).toBe(17 * 60 + 5);
  });

  it('keeps a night duty in one piece', () => {
    const duties = buildFlightDuties(parseDutyPlan(plan, '2020-01'), { reportMinutes: 60, releaseMinutes: 30 });

    expect(duties.map((d) => [d.date, d.legs.length])).toEqual([
      ['2026-11-01', 2],
      ['2026-11-13', 2],
      ['2026-11-30', 1],
    ]);
  });

  it('puts a January flight of a December plan into the next year', () => {
    const [entry] = parseDutyPlan(['График работ на декабрь 2026 года.', '01.01, Пт 08:00 SVO/B - Шереметьево (B) 10:00 LED - Пулково'], '2020-01');

    expect(entry.date).toBe('2027-01-01');
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

describe('buildFlightDuties', () => {
  const rates = { reportMinutes: 60, releaseMinutes: 30 };

  it('runs a duty from report before departure to release after shutdown', () => {
    const [duty] = buildFlightDuties([entry({ start: '08:00', end: '10:30' })], rates);

    expect(formatClock(duty.reportAt)).toBe('07:00');
    expect(formatClock(duty.releaseAt)).toBe('11:00');
    expect(duty.minutes).toBe(240);
    expect(duty.blockMinutes).toBe(150);
  });

  it('joins a turnaround into one duty and splits on rest', () => {
    const duties = buildFlightDuties(
      [
        entry({ start: '08:00', end: '09:35' }),
        entry({ start: '11:00', end: '12:30' }),
        entry({ date: '2026-11-05', start: '19:00', end: '20:00' }),
      ],
      rates
    );

    expect(duties).toHaveLength(2);
    expect(duties[0]).toMatchObject({ minutes: 60 + 270 + 30, blockMinutes: 185 });
    expect(duties[0].legs).toHaveLength(2);
  });

  it('keeps a night duty together across midnight and calendar days', () => {
    const duties = buildFlightDuties(
      [entry({ date: '2026-11-06', start: '22:30', end: '01:15' }), entry({ date: '2026-11-07', start: '02:30', end: '05:00' })],
      rates
    );

    expect(duties).toHaveLength(1);
    expect(duties[0].date).toBe('2026-11-06');
    expect(formatClock(duties[0].releaseAt)).toBe('05:30 (+1 д)');
    expect(duties[0].minutes).toBe(60 + 390 + 30);
  });

  it('ignores flights without times and other kinds of work', () => {
    expect(buildFlightDuties([entry({ start: '', end: '' }), entry({ kind: 'reserve' })], rates)).toEqual([]);
  });
});

describe('duty links', () => {
  const rates = { reportMinutes: 60, releaseMinutes: 30 };
  const outbound = entry({ date: '2026-11-05', start: '08:00', end: '10:00', title: 'SU1 SVO-KJA' });
  const inbound = (dutyLink?: WorkEntry['dutyLink'], start = '20:00', date = '2026-11-05') =>
    entry({ date, start, end: '22:00', title: 'SU2 KJA-SVO', dutyLink });

  it('keeps a long turnaround as one duty when asked', () => {
    const [duty, ...rest] = buildFlightDuties([outbound, inbound('continue')], rates);

    expect(rest).toEqual([]);
    expect(duty).toMatchObject({ minutes: 15 * 60 + 30, breakMinutes: 0, isSplit: false });
  });

  it('leaves the rest of a split duty out of working time', () => {
    const [duty, ...rest] = buildFlightDuties([outbound, inbound('split')], rates);

    // 07:00–22:30 on duty, 10:30–19:00 resting
    expect(rest).toEqual([]);
    expect(duty).toMatchObject({ breakMinutes: 8 * 60 + 30, minutes: 7 * 60, isSplit: true, flightDutyMinutes: 15 * 60 });
  });

  it('keeps a split duty across days together', () => {
    const [duty] = buildFlightDuties([outbound, inbound('split', '06:00', '2026-11-06')], rates);

    expect(duty.legs).toHaveLength(2);
    expect(duty.breakMinutes).toBe(18 * 60 + 30);
    expect(formatClock(duty.releaseAt)).toBe('22:30 (+1 д)');
  });

  it('treats a break too short to leave the aircraft as work', () => {
    const [duty] = buildFlightDuties([outbound, inbound('split', '11:00')], rates);

    expect(duty).toMatchObject({ breakMinutes: 0, isSplit: false, minutes: 15 * 60 + 30 });
  });

  it('starts a new duty on request even after a short turnaround', () => {
    expect(buildFlightDuties([outbound, inbound('separate', '11:00')], rates)).toHaveLength(2);
  });

  it('still splits automatically on a long gap', () => {
    expect(buildFlightDuties([outbound, inbound(undefined)], rates)).toHaveLength(2);
  });

  it('extends the allowed flight duty by half of a split break', () => {
    const long = [entry({ start: '05:00', end: '08:00' }), entry({ start: '17:00', end: '19:30', dutyLink: 'split' })];
    const continuous = [entry({ start: '05:00', end: '08:00' }), entry({ start: '17:00', end: '19:30', dutyLink: 'continue' })];

    // FDP 04:00–19:30 = 15:30; break 08:30–16:00 = 7:30 allows 13:00 + 3:45 = 16:45
    expect(getDutyWarnings(buildFlightDuties(long, rates))).toEqual([]);
    expect(getDutyWarnings(buildFlightDuties(continuous, rates))[0].message).toContain('15:30');
  });

  it('reads undated plan legs as the same duty', () => {
    const entries = parseDutyPlan(
      ['График работ на ноябрь 2026 года.', '28.11, Сб 20:55 SVO/B - Шереметьево (B) 01:40 KJA - Красноярск', '4 ч 45 мин 4 ч 45 мин A-321B - SU1480', '06:00 KJA - Красноярск 11:00 SVO/B - Шереметьево (B)', '5 ч 00 мин A-321B - SU1481'],
      '2026-11'
    );

    expect(entries.map((e) => e.dutyLink)).toEqual([undefined, 'continue']);
    expect(buildFlightDuties(entries, DEFAULTS)).toHaveLength(1);
  });
});

describe('getDutyWarnings', () => {
  const rates = { reportMinutes: 60, releaseMinutes: 30 };

  it('flags a flight duty over the basic 13 hours', () => {
    const duties = buildFlightDuties([entry({ start: '06:00', end: '18:30' })], rates);

    expect(duties[0].flightDutyMinutes).toBe(13 * 60 + 30);
    expect(getDutyWarnings(duties)).toMatchObject([{ date: '2026-11-05', message: expect.stringContaining('13:30') }]);
  });

  it('flags rest shorter than twelve hours or the preceding duty', () => {
    const duties = buildFlightDuties(
      [entry({ date: '2026-11-05', start: '08:00', end: '16:00' }), entry({ date: '2026-11-06', start: '04:00', end: '06:00' })],
      rates
    );

    expect(getDutyWarnings(duties)).toMatchObject([{ date: '2026-11-06', message: expect.stringContaining('10:30') }]);
  });

  it('stays quiet for normal duties', () => {
    const duties = buildFlightDuties(
      [entry({ date: '2026-11-05', start: '08:00', end: '10:00' }), entry({ date: '2026-11-06', start: '08:00', end: '10:00' })],
      rates
    );

    expect(getDutyWarnings(duties)).toEqual([]);
  });
});

describe('summarizeMonth', () => {
  const settings = { ...DEFAULT_WORK_RATES, monthlyBase: 1000, hourly: { flight: 100, reserve: 50 }, nightPercent: 20 };
  const entries = [
    entry({ nightMinutes: 60 }),
    entry({ date: '2026-11-06', kind: 'reserve', start: '08:00', end: '12:00' }),
    entry({ date: '2026-11-07', kind: 'vacation', start: '08:00', end: '12:00' }),
  ];

  it('counts flight work as duty time and pays by it', () => {
    const summary = summarizeMonth(entries, settings);

    expect(summary.minutesByKind).toEqual({ flight: 240, reserve: 240 });
    expect(summary.totalMinutes).toBe(480);
    expect(summary.blockMinutes).toBe(150);
    expect(summary.workDays).toBe(2);
    expect(summary.estimatedPay).toBe(1000 + 400 + 200 + 20);
  });

  it('can pay flights by block time instead', () => {
    expect(summarizeMonth(entries, { ...settings, flightPayBasis: 'block' }).estimatedPay).toBe(1000 + 250 + 200 + 20);
  });

  it('fills settings missing from rates saved by an older version', () => {
    const summary = summarizeMonth(entries, { monthlyBase: 0, hourly: {}, nightPercent: 0 } as any);

    expect(summary.minutesByKind.flight).toBe(240);
  });
});

describe('buildWorkCsv', () => {
  it('produces rows in date order with a decimal comma', () => {
    const csv = buildWorkCsv([entry({ date: '2026-11-06' }), entry({ date: '2026-11-05', note: 'тест; ещё' })]);
    const rows = csv.split('\r\n');

    expect(rows[1]).toBe('2026-11-05;Рейс;SVO-LED;08:00;10:30;2,50;0,00;"тест; ещё"');
    expect(rows[2].startsWith('2026-11-06')).toBe(true);
  });

  it('appends the duty summary', () => {
    const csv = buildWorkCsv([entry()]);

    expect(csv).toContain('Смена;Явка;Окончание;Рабочее время, ч;Перерыв, ч;Налёт, ч;Участков');
    expect(csv).toContain('2026-11-05;07:00;11:00;4,00;0,00;2,50;1');
  });

  it('neutralises spreadsheet formulas from imported text', () => {
    expect(buildWorkCsv([entry({ title: '=HYPERLINK("x")' })])).toContain(`"'=HYPERLINK(""x"")"`);
  });
});
