import { describe, expect, it } from 'vitest';
import { WorkEntry } from '../db/db';
import { mergeRosterEntries, parseIcs, parseRosterCalendar } from './icsRoster';
import { absoluteMinutes } from './workClock';

const calendar = (...events: string[]) =>
  ['BEGIN:VCALENDAR', 'VERSION:2.0', 'X-WR-CALNAME:Aeroflot schedule', ...events, 'END:VCALENDAR'].join('\r\n');

const event = (...lines: string[]) => ['BEGIN:VEVENT', ...lines, 'END:VEVENT'].join('\r\n');

/** One leg as crew.aeroflot.ru writes it; the crew list is made up */
const aeroflotLeg = (uid: string, number: string, from: string, to: string, start: string, end: string, pairing: string) =>
  event(
    `DTSTART;TZID=Europe/Moscow:${start}`,
    `DTEND;TZID=Europe/Moscow:${end}`,
    `SUMMARY:${number} ✈️ ${from} → ${to}`,
    `UID:${uid}`,
    'LOCATION:Аэропорт Moscow SVO/B ',
    `DESCRIPTION:${pairing} Moscow (SVO | Sheremetyevo (B)) → Perm (PEE | Bolshoye Savino) → Moscow (SVO | Sheremetyevo (B)) \\n\\nIvanov Ivan (КВС)\\;\\nPetrov Petr (2П)`,
    'TZID:Europe/Moscow'
  );

const SVO = 'Moscow (SVO | Sheremetyevo (B))';
const PEE = 'Perm (PEE | Bolshoye Savino)';

describe('parseIcs', () => {
  it('reads UTC, zoned and folded values', () => {
    const [utc, zoned] = parseIcs(
      calendar(
        event('UID:1', 'SUMMARY:Резерв', 'DTSTART:20261105T050000Z', 'DTEND:20261105T090000Z'),
        event('UID:2', 'SUMMARY:Резерв', 'DESCRIPTION:Аэропорт\\, ', ' Шереметьево', 'DTSTART;TZID=Europe/Moscow:20261106T080000', 'DTEND;TZID=Europe/Moscow:20261106T200000')
      )
    );

    expect(utc.start).toBe(absoluteMinutes('2026-11-05', '05:00'));
    expect(zoned.start).toBe(absoluteMinutes('2026-11-06', '05:00'));
    expect(zoned.description).toBe('Аэропорт, Шереметьево');
  });
});

describe('parseRosterCalendar', () => {
  it('reads Aeroflot legs in UTC with their pairing and aircraft', () => {
    const rows = parseRosterCalendar(
      calendar(
        aeroflotLeg('6299378', 'SU1204', SVO, PEE, '20261101T173500', '20261101T194500', '[SU1204/SU1205\\, A-320A]'),
        aeroflotLeg('6299532', 'SU1205', PEE, SVO, '20261101T204000', '20261101T230000', '[SU1204/SU1205\\, A-320A]')
      )
    );

    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      date: '2026-11-01',
      kind: 'flight',
      title: 'SU1204 SVO-PEE',
      start: '14:35',
      end: '16:45',
      note: 'A-320A',
      pairing: 'SU1204/SU1205',
      sourceId: 'ics:6299378',
      utc: true,
    });
    expect(rows[1]).toMatchObject({ title: 'SU1205 PEE-SVO', start: '17:40', end: '20:00' });
  });

  it('never keeps the crew list', () => {
    const [row] = parseRosterCalendar(calendar(aeroflotLeg('1', 'SU1204', SVO, PEE, '20261101T173500', '20261101T194500', '[SU1204/SU1205\\, A-320A]')));

    expect(JSON.stringify(row)).not.toMatch(/Ivanov|Petrov|КВС/);
  });

  it('takes a flight number or an aircraft as proof of a flight', () => {
    const [byNumber, byAircraft] = parseRosterCalendar(
      calendar(
        event('UID:a', 'SUMMARY:SU1480', 'DTSTART:20261105T050000Z', 'DTEND:20261105T090000Z'),
        event('UID:b', 'SUMMARY:Перегон', 'DESCRIPTION:[A-321B]', 'DTSTART:20261106T050000Z', 'DTEND:20261106T090000Z')
      )
    );

    expect([byNumber.kind, byAircraft.kind]).toEqual(['flight', 'flight']);
  });

  it('marks a leg flown as a passenger', () => {
    const [row] = parseRosterCalendar(
      calendar(event('UID:p', `SUMMARY:SU1480 ✈️ ${SVO} → Krasnoyarsk (KJA | Krasnoyarsk) пасс.`, 'DTSTART:20261105T050000Z', 'DTEND:20261105T090000Z'))
    );

    expect(row).toMatchObject({ kind: 'flight', deadhead: true, title: 'SU1480 SVO-KJA' });
  });

  it('sorts the rest of the roster by keywords', () => {
    const rows = parseRosterCalendar(
      calendar(
        event('UID:a', 'SUMMARY:Резерв RES', 'DTSTART:20261107T050000Z', 'DTEND:20261107T170000Z'),
        event('UID:b', 'SUMMARY:Тренажёр', 'DTSTART:20261108T050000Z', 'DTEND:20261108T090000Z'),
        event('UID:c', 'SUMMARY:Отпуск', 'DTSTART;VALUE=DATE:20261110', 'DTEND;VALUE=DATE:20261113'),
        event('UID:d', 'SUMMARY:Выходной', 'DTSTART;VALUE=DATE:20261114')
      )
    );

    expect(rows.map((row) => [row.date, row.kind, row.start])).toEqual([
      ['2026-11-07', 'reserve', '05:00'],
      ['2026-11-08', 'training', '05:00'],
      ['2026-11-10', 'vacation', ''],
      ['2026-11-11', 'vacation', ''],
      ['2026-11-12', 'vacation', ''],
      ['2026-11-14', 'off', ''],
    ]);
  });

  it('reads an empty calendar as no rows', () => {
    expect(parseRosterCalendar(calendar())).toEqual([]);
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
    utc: true,
    ...overrides,
  });
  const now = absoluteMinutes('2026-11-04', '12:00');

  it('updates rows from the same event', () => {
    const { put, added, updated } = mergeRosterEntries([row({ id: 'kept', sourceId: 'ics:1', dutyLink: 'split' })], [row({ id: 'new', sourceId: 'ics:1', start: '09:00' })], now);

    expect([added, updated]).toEqual([0, 1]);
    expect(put[0]).toMatchObject({ id: 'kept', start: '09:00', dutyLink: 'split' });
  });

  it('keeps rows the pilot changed', () => {
    const { put } = mergeRosterEntries([row({ id: 'mine', sourceId: 'ics:1', edited: true })], [row({ sourceId: 'ics:1', start: '09:00' })], now);

    expect(put).toEqual([]);
  });

  it('drops cancelled future flights but never the past or other months', () => {
    const existing = [
      row({ id: 'cancelled', sourceId: 'ics:2', date: '2026-11-20' }),
      row({ id: 'flown', sourceId: 'ics:3', date: '2026-11-02' }),
      row({ id: 'last-month', sourceId: 'ics:4', date: '2026-10-28' }),
      row({ id: 'changed-by-hand', sourceId: 'ics:5', date: '2026-11-21', edited: true }),
      row({ id: 'typed', date: '2026-11-22' }),
    ];
    const { removeIds } = mergeRosterEntries(existing, [row({ sourceId: 'ics:1', date: '2026-11-05' })], now);

    expect(removeIds).toEqual(['cancelled']);
  });

  it('skips rows already loaded from a plan', () => {
    const { put } = mergeRosterEntries([row({ id: 'plan' })], [row({ id: 'ics', sourceId: 'ics:1' })], now);

    expect(put).toEqual([]);
  });
});
