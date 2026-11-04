import { absoluteMinutes } from './workClock';
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
  nextDuty,
  utcClock,
  mskClock,
  monthWorkNorm,
  maxDutyMinutes,
  applyLogbookTimes,
  routeOf,
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
    expect(duty).toMatchObject({ breakMinutes: 8 * 60 + 30, minutes: 7 * 60, isSplit: true, flightDutyMinutes: 15 * 60 + 30 });
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

  it('keeps a round trip with a long wait away from base as one duty', () => {
    const [duty, ...rest] = buildFlightDuties([outbound, inbound(undefined)], rates);

    expect(rest).toEqual([]);
    expect(duty).toMatchObject({ minutes: 15 * 60 + 30, breakMinutes: 0 });
  });

  it('splits a night stay away from base: the hotel rest is not work', () => {
    // Ufa overnight: in 20:27, out 06:50 the next morning
    const night = [
      entry({ date: '2026-10-29', start: '18:26', end: '20:27', title: 'UUEE-UWUU' }),
      entry({ date: '2026-10-30', start: '06:50', end: '09:00', title: 'UWUU-UUEE' }),
    ];
    const [duty, ...rest] = buildFlightDuties(night, rates);

    // Report 17:26, release 09:30 (+1); rest 20:57–05:50
    expect(rest).toEqual([]);
    expect(duty).toMatchObject({ isSplit: true, breakMinutes: 8 * 60 + 53, minutes: 16 * 60 + 4 - (8 * 60 + 53) });
    expect(getDutyWarnings([duty])).toEqual([]);
  });

  it('keeps a daytime wait away from base as work', () => {
    const day = [
      entry({ date: '2026-10-10', start: '08:00', end: '10:00', title: 'UUEE-USCM' }),
      entry({ date: '2026-10-10', start: '16:00', end: '18:00', title: 'USCM-UUEE' }),
    ];

    expect(buildFlightDuties(day, rates)[0]).toMatchObject({ isSplit: false, minutes: 60 + 10 * 60 + 30 });
  });

  it('lets the pilot keep a night stay as one duty', () => {
    const night = [
      entry({ date: '2026-10-29', start: '18:26', end: '20:27', title: 'UUEE-UWUU' }),
      entry({ date: '2026-10-30', start: '06:50', end: '09:00', title: 'UWUU-UUEE', dutyLink: 'continue' }),
    ];

    expect(buildFlightDuties(night, rates)[0]).toMatchObject({ isSplit: false, minutes: 16 * 60 + 4 });
  });

  it('ends the duty once the crew is back at base', () => {
    const home = entry({ date: '2026-11-06', start: '03:00', end: '04:00', title: 'SU3 SVO-LED' });

    expect(buildFlightDuties([outbound, inbound(undefined, '11:00'), home], rates)).toHaveLength(2);
  });

  it('treats a wait of a full rest away from base as a layover', () => {
    expect(buildFlightDuties([outbound, inbound(undefined, '06:00', '2026-11-06')], rates)).toHaveLength(2);
  });

  it('splits on a long gap when the route is unknown', () => {
    const legs = [entry({ start: '08:00', end: '10:00', title: 'Рейс' }), entry({ start: '20:00', end: '22:00', title: 'Рейс' })];

    expect(buildFlightDuties(legs, rates)).toHaveLength(2);
  });

  it('reads routes from titles', () => {
    expect(routeOf('SU1480 SVO/B-KJA')).toEqual({ dep: 'SVO', arr: 'KJA' });
    expect(routeOf('svo - led')).toEqual({ dep: 'SVO', arr: 'LED' });
    expect(routeOf('Тренажёр')).toBeNull();
  });

  it('checks a split duty by its working parts, not by its whole span (Order 139, p. 31)', () => {
    const split = [entry({ start: '05:00', end: '08:00' }), entry({ start: '17:00', end: '19:30', dutyLink: 'split' })];
    const continuous = [entry({ start: '05:00', end: '08:00' }), entry({ start: '17:00', end: '19:30', dutyLink: 'continue' })];

    // 04:00–08:30 and 16:00–20:00 UTC work 8:30 of a 12:00 limit; one duty would last 16:00
    expect(getDutyWarnings(buildFlightDuties(split, rates))).toEqual([]);
    expect(getDutyWarnings(buildFlightDuties(continuous, rates))[0].message).toMatch(/Смена 16:00: больше 12:00/);
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

describe('roster duties', () => {
  const leg = (overrides: Partial<WorkEntry>) => entry({ pairing: 'SU1204/SU1205', ...overrides });

  it('keeps the legs of one pairing in one duty, the wait included', () => {
    const [duty, ...rest] = buildFlightDuties(
      [
        leg({ date: '2026-11-01', start: '14:35', end: '16:45', title: 'SU1204 SVO-PEE' }),
        leg({ date: '2026-11-01', start: '17:40', end: '20:00', title: 'SU1205 PEE-SVO' }),
      ],
      DEFAULTS
    );

    expect(rest).toEqual([]);
    expect(duty).toMatchObject({ minutes: 6 * 60 + 55, blockMinutes: 4 * 60 + 30, landings: 2, isSplit: false });
    expect(duty.segments.map((segment) => segment.kind)).toEqual(['report', 'leg', 'wait', 'leg', 'release']);
  });

  it('starts a new duty with a new pairing even after a short gap', () => {
    const duties = buildFlightDuties(
      [
        leg({ start: '08:00', end: '10:00', title: 'SU1 SVO-LED', pairing: 'SU1/SU2' }),
        leg({ start: '11:00', end: '13:00', title: 'SU3 SVO-KZN', pairing: 'SU3/SU4' }),
      ],
      DEFAULTS
    );

    expect(duties).toHaveLength(2);
  });

  it('splits one-way pairings around a layover', () => {
    const duties = buildFlightDuties(
      [
        entry({ date: '2026-11-19', start: '05:15', end: '09:40', title: 'SU1886 SVO-BSZ', pairing: 'SU1886' }),
        entry({ date: '2026-11-20', start: '10:55', end: '15:40', title: 'SU1887 BSZ-SVO', pairing: 'SU1887' }),
      ],
      DEFAULTS
    );

    expect(duties.map((duty) => duty.date)).toEqual(['2026-11-19', '2026-11-20']);
  });

  it('marks a night turnaround as a night duty', () => {
    // SU1510/SU1511: 22:10–06:30 Moscow time
    const [duty] = buildFlightDuties(
      [
        leg({ date: '2026-11-09', start: '19:10', end: '22:30', title: 'SU1510 SVO-SGC', pairing: 'SU1510/SU1511' }),
        leg({ date: '2026-11-09', start: '23:30', end: '03:00', title: 'SU1511 SGC-SVO', pairing: 'SU1510/SU1511' }),
      ],
      DEFAULTS
    );

    expect(duty).toMatchObject({ isNight: true, nightMinutes: 8 * 60, minutes: 9 * 60 + 20 });
  });

  it('counts a passenger leg as work and half of it as flight time', () => {
    const [duty] = buildFlightDuties([entry({ start: '08:00', end: '12:00', title: 'SU1480 SVO-KJA', deadhead: true })], DEFAULTS);

    expect(duty).toMatchObject({ blockMinutes: 0, deadheadMinutes: 240, flightTimeMinutes: 120, landings: 0, minutes: 60 + 240 + 30 });
  });

  it('releases 40 minutes after shutdown with a medical check', () => {
    const [duty] = buildFlightDuties([entry({ start: '08:00', end: '10:00', medicalCheck: true })], DEFAULTS);

    expect(utcClock(duty.endAt)).toBe('10:40');
  });

  it('takes report and release set by hand', () => {
    const [duty] = buildFlightDuties([entry({ start: '08:00', end: '10:00', reportAt: '06:15', releaseAt: '11:05' })], DEFAULTS);

    expect([utcClock(duty.startAt), utcClock(duty.endAt), duty.minutes]).toEqual(['06:15', '11:05', 4 * 60 + 50]);
  });

  it('shows Moscow time beside UTC', () => {
    const [duty] = buildFlightDuties([entry({ start: '21:30', end: '23:00' })], DEFAULTS);

    expect([utcClock(duty.startAt), mskClock(duty.startAt)]).toEqual(['20:30', '23:30']);
  });

  it('uses the Appendix 1 limits for night reports and many landings', () => {
    const at = (time: string) => absoluteMinutes('2026-11-05', time);

    expect(maxDutyMinutes(at('19:30'), 2)).toBe(11 * 60); // 22:30 Moscow time
    expect(maxDutyMinutes(at('06:00'), 4)).toBe(10 * 60 + 30);
    expect(maxDutyMinutes(at('06:00'), 6)).toBe(8 * 60 + 30);
  });

  it('works out the norm of other years from weekdays and holidays', () => {
    expect(monthWorkNorm('2027-03')).toMatchObject({ approximate: true });
    expect(monthWorkNorm('2026-11')).toEqual({ minutes: 143 * 60, approximate: false });
  });
});

describe('applyLogbookTimes', () => {
  const flown = { id: 'f1', date: '2026-11-01', depIcao: 'UUEE', arrIcao: 'USPP', outTimeUtc: '14:50', inTimeUtc: '17:05', syncStatus: 'synced' } as LocalFlight;
  const iata = new Map([['SVO', 'UUEE'], ['PEE', 'USPP']]);

  it('replaces planned times with the logbook ones after the flight', () => {
    const [row] = applyLogbookTimes([entry({ date: '2026-11-01', start: '14:35', end: '16:45', title: 'SU1204 SVO-PEE' })], [flown], iata);

    expect(row).toMatchObject({ start: '14:50', end: '17:05', actual: true });
  });

  it('leaves legs without a logbook flight alone', () => {
    const [row] = applyLogbookTimes([entry({ date: '2026-11-03', start: '14:35', end: '16:45', title: 'SU1204 SVO-PEE' })], [flown], iata);

    expect(row.actual).toBeUndefined();
  });

  it('ignores drafts', () => {
    const [row] = applyLogbookTimes([entry({ date: '2026-11-01', start: '14:35', end: '16:45', title: 'SU1204 SVO-PEE' })], [{ ...flown, status: 'draft' }], iata);

    expect(row.actual).toBeUndefined();
  });
});

describe('getDutyWarnings', () => {
  const day = (date: string, start = '06:00', end = '08:00') => entry({ date, start, end, title: 'SU1 SVO-LED' });

  it('asks for a weekly rest after six working days in a row (p. 61)', () => {
    const week = ['01', '02', '03', '04', '05', '06', '07'].map((d) => day(`2026-11-${d}`));
    const warnings = getDutyWarnings(buildFlightDuties(week, { reportMinutes: 60, releaseMinutes: 30 }));

    expect(warnings.filter((warning) => warning.message.includes('п. 61'))).toMatchObject([{ date: '2026-11-07' }]);
  });

  it('starts counting again after 42 hours off', () => {
    const days = ['01', '02', '03', '05', '06', '07', '08'].map((d) => day(`2026-11-${d}`));

    expect(getDutyWarnings(buildFlightDuties(days, { reportMinutes: 60, releaseMinutes: 30 })).some((warning) => warning.message.includes('п. 61'))).toBe(false);
  });

  it('asks for 42 hours after two night duties in a row (p. 63)', () => {
    // 22:00–04:00 Moscow time three nights running
    const nights = ['01', '02', '03'].map((d) => day(`2026-11-${d}`, '20:00', '00:30'));
    const warnings = getDutyWarnings(buildFlightDuties(nights, { reportMinutes: 60, releaseMinutes: 30 }));

    expect(warnings.filter((warning) => warning.message.includes('п. 63'))).toMatchObject([{ date: '2026-11-03' }]);
  });

  const rates = { reportMinutes: 60, releaseMinutes: 30 };

  it('flags a duty over the Appendix 1 limit for its report time and landings', () => {
    const duties = buildFlightDuties([entry({ start: '06:00', end: '18:30' })], rates);

    // Report 05:00 UTC is 08:00 Moscow time: one landing allows 12 hours
    expect(duties[0]).toMatchObject({ flightDutyMinutes: 14 * 60, maxDutyMinutes: 12 * 60 });
    expect(getDutyWarnings(duties)).toMatchObject([{ date: '2026-11-05', message: expect.stringContaining('14:00') }]);
  });

  it('flags the monthly flight time over 80 hours, or 90 with consent', () => {
    const days = Array.from({ length: 9 }, (_, index) => entry({ date: `2026-11-${String(index * 3 + 1).padStart(2, '0')}`, start: '06:00', end: '15:30' }));
    const duties = buildFlightDuties(days, rates);

    expect(getDutyWarnings(duties).some((warning) => warning.message.includes('больше 80 часов'))).toBe(true);
    expect(getDutyWarnings(duties, { flightLimitHours: 90 }).some((warning) => warning.message.includes('часов'))).toBe(false);
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
    // Daytime work: no night hours to pay
    expect(summary.estimatedPay).toBe(1000 + 400 + 200);
  });

  it('can pay flights by block time instead', () => {
    expect(summarizeMonth(entries, { ...settings, flightPayBasis: 'block' }).estimatedPay).toBe(1000 + 250 + 200);
  });

  it('pays night hours worked between 22:00 and 06:00 Moscow time', () => {
    // 20:00–22:00 UTC flight: duty 19:00–22:30 UTC is 22:00–01:30 Moscow time
    const summary = summarizeMonth([entry({ start: '20:00', end: '22:00' })], settings);

    expect(summary.nightMinutes).toBe(3 * 60 + 30);
    expect(summary.estimatedPay).toBe(1000 + 350 + 70);
  });

  it('compares working time with the month norm of a 36-hour week', () => {
    const summary = summarizeMonth(entries, settings, '2026-11');

    expect(summary.normMinutes).toBe(143 * 60);
    expect(summary.overtimeMinutes).toBe(480 - 143 * 60);
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

    expect(rows[1]).toBe('2026-11-05;Рейс;SVO-LED;08:00;10:30;2,50;;"тест; ещё"');
    expect(rows[2].startsWith('2026-11-06')).toBe(true);
  });

  it('appends the duty summary', () => {
    const csv = buildWorkCsv([entry()]);

    expect(csv).toContain('Смена;Явка UTC;Явка МСК;Окончание UTC;Окончание МСК;Рабочее время, ч;Отдых в смене, ч;Полётное время, ч;Ночные (22–06), ч;Посадок');
    expect(csv).toContain('2026-11-05;07:00;10:00;11:00;14:00;4,00;0,00;2,50;0,00;1');
  });

  it('neutralises spreadsheet formulas from imported text', () => {
    expect(buildWorkCsv([entry({ title: '=HYPERLINK("x")' })])).toContain(`"'=HYPERLINK(""x"")"`);
  });
});

describe('nextDuty', () => {
  const duties = buildFlightDuties([
    entry({ date: '2026-11-05', start: '08:00', end: '10:00' }),
    entry({ date: '2026-11-07', start: '08:00', end: '10:00' }),
  ]);

  it('finds the duty under way', () => {
    expect(nextDuty(duties, absoluteMinutes('2026-11-05', '09:00'))).toMatchObject({ current: true, inMinutes: 0, duty: { date: '2026-11-05' } });
  });

  it('finds the next one and the time to its report', () => {
    expect(nextDuty(duties, absoluteMinutes('2026-11-06', '07:00'))).toMatchObject({ current: false, inMinutes: 24 * 60, duty: { date: '2026-11-07' } });
  });

  it('has nothing after the last duty', () => {
    expect(nextDuty(duties, absoluteMinutes('2026-11-08', '00:00'))).toBeNull();
  });
});
