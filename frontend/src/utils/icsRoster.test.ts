import { describe, expect, it } from 'vitest';
import { WorkEntry } from '../db/db';
import { mergeRosterEntries, parseIcs, parseRosterCalendar } from './icsRoster';

const MSK = 180;

const calendar = (...events: string[]) =>
  ['BEGIN:VCALENDAR', 'VERSION:2.0', 'X-WR-CALNAME:Aeroflot schedule', ...events, 'END:VCALENDAR'].join('\r\n');

const event = (...lines: string[]) => ['BEGIN:VEVENT', ...lines, 'END:VEVENT'].join('\r\n');

describe('parseIcs', () => {
  it('reads UTC, zoned and folded values', () => {
    const [utc, zoned] = parseIcs(
      calendar(
        event('UID:1', 'SUMMARY:SU1480 SVO-KJA', 'DTSTART:20261105T050000Z', 'DTEND:20261105T090000Z'),
        event('UID:2', 'SUMMARY:Резерв', 'DESCRIPTION:Аэропорт\, ', ' Шереметьево', 'DTSTART;TZID=Europe/Moscow:20261106T080000', 'DTEND;TZID=Europe/Moscow:20261106T200000')
      ),
      MSK
    );

    expect(new Date(utc.start).toISOString()).toBe('2026-11-05T05:00:00.000Z');
    expect(new Date(zoned.start).toISOString()).toBe('2026-11-06T05:00:00.000Z');
    expect(zoned.description).toBe('Аэропорт, Шереметьево');
  });
});

describe('parseRosterCalendar', () => {
  it('turns flights into rows in the plan time zone', () => {
    const [flight] = parseRosterCalendar(
      calendar(event('UID:f1', 'SUMMARY:SU 1480 SVO - KJA', 'LOCATION:A321', 'DTSTART:20261105T200000Z', 'DTEND:20261106T005000Z')),
      MSK
    );

    expect(flight).toMatchObject({ date: '2026-11-05', kind: 'flight', title: 'SU1480 SVO-KJA', start: '23:00', end: '03:50', note: 'A321' });
  });

  it('sorts the rest of the roster by keywords', () => {
    const rows = parseRosterCalendar(
      calendar(
        event('UID:a', 'SUMMARY:Резерв RES', 'DTSTART:20261107T050000Z', 'DTEND:20261107T170000Z'),
        event('UID:b', 'SUMMARY:Тренажёр A320', 'DTSTART:20261108T050000Z', 'DTEND:20261108T090000Z'),
        event('UID:c', 'SUMMARY:Отпуск', 'DTSTART;VALUE=DATE:20261110', 'DTEND;VALUE=DATE:20261113'),
        event('UID:d', 'SUMMARY:Выходной', 'DTSTART;VALUE=DATE:20261114')
      ),
      MSK
    );

    expect(rows.map((row) => [row.date, row.kind, row.start])).toEqual([
      ['2026-11-07', 'reserve', '08:00'],
      ['2026-11-08', 'training', '08:00'],
      ['2026-11-10', 'vacation', ''],
      ['2026-11-11', 'vacation', ''],
      ['2026-11-12', 'vacation', ''],
      ['2026-11-14', 'off', ''],
    ]);
  });

  it('reads an empty calendar as no rows', () => {
    expect(parseRosterCalendar(calendar(), MSK)).toEqual([]);
  });
});

describe('mergeRosterEntries', () => {
  const row = (overrides: Partial<WorkEntry>): WorkEntry => ({
    id: 'x',
    date: '2026-11-05',
    kind: 'flight',
    title: 'SU1480 SVO-KJA',
    start: '08:00',
    end: '12:00',
    nightMinutes: 0,
    note: '',
    ...overrides,
  });

  it('updates rows from the same event and keeps the pilot notes', () => {
    const existing = [row({ id: 'kept', sourceId: 'ics:1', note: 'мой комментарий', dutyLink: 'split' })];
    const { put, added, updated } = mergeRosterEntries(existing, [row({ id: 'new', sourceId: 'ics:1', start: '09:00', end: '13:00' })]);

    expect([added, updated]).toEqual([0, 1]);
    expect(put[0]).toMatchObject({ id: 'kept', start: '09:00', note: 'мой комментарий', dutyLink: 'split' });
  });

  it('skips rows already loaded from a plan', () => {
    const { put } = mergeRosterEntries([row({ id: 'plan' })], [row({ id: 'ics', sourceId: 'ics:1' })]);

    expect(put).toEqual([]);
  });
});
