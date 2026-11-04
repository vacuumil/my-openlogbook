import { describe, expect, it } from 'vitest';
import { WorkEntry } from '../db/db';
import { buildFlightDuties } from './workTime';
import { buildCalendar, dutyDestinations, guessBase, layoversOf } from './workCalendar';

const leg = (date: string, start: string, end: string, title: string, pairing?: string): WorkEntry => ({
  id: `${date}-${start}`,
  date,
  kind: 'flight',
  title,
  start,
  end,
  nightMinutes: 0,
  note: '',
  utc: true,
  ...(pairing ? { pairing } : {}),
});

const november = buildFlightDuties([
  leg('2026-11-01', '14:35', '16:45', 'SU1204 SVO-PEE', 'SU1204/SU1205'),
  leg('2026-11-01', '17:40', '20:00', 'SU1205 PEE-SVO', 'SU1204/SU1205'),
  leg('2026-11-19', '05:15', '09:40', 'SU1886 SVO-BSZ', 'SU1886'),
  leg('2026-11-20', '10:55', '15:40', 'SU1887 BSZ-SVO', 'SU1887'),
]);

describe('buildCalendar', () => {
  it('lays a month out in weeks from Monday', () => {
    const weeks = buildCalendar('2026-11', november, []);

    // 1 November 2026 is a Sunday
    expect(weeks[0].map((day) => day.date)).toEqual(['2026-10-26', '2026-10-27', '2026-10-28', '2026-10-29', '2026-10-30', '2026-10-31', '2026-11-01']);
    expect(weeks.flat().filter((day) => day.inMonth)).toHaveLength(30);
    expect(weeks[0][6].duties).toHaveLength(1);
  });

  it('marks the night stay away from base', () => {
    const days = buildCalendar('2026-11', november, []).flat();

    expect(days.filter((day) => day.layover).map((day) => [day.date, day.layover])).toEqual([
      ['2026-11-19', 'BSZ'],
      ['2026-11-20', 'BSZ'],
    ]);
  });

  it('places other work on its day', () => {
    const reserve = { ...leg('2026-11-07', '05:00', '17:00', 'Резерв'), kind: 'reserve' as const };
    const day = buildCalendar('2026-11', [], [reserve]).flat().find((cell) => cell.date === '2026-11-07');

    expect(day?.entries).toEqual([reserve]);
  });
});

describe('duty helpers', () => {
  it('finds the base and the stays away from it', () => {
    expect(guessBase(november)).toBe('SVO');
    expect(layoversOf(november).map((stay) => stay.airport)).toEqual(['BSZ']);
  });

  it('names a duty by where it went', () => {
    expect(dutyDestinations(november[0], 'SVO')).toBe('PEE');
  });
});
