import { describe, expect, it } from 'vitest';
import { WorkEntry } from '../db/db';
import { absoluteMinutes, clockAt, entryToUtc } from './workClock';

const row = (overrides: Partial<WorkEntry> = {}): WorkEntry => ({
  id: 'r1',
  date: '2026-11-05',
  kind: 'flight',
  title: 'SU1480 SVO-KJA',
  start: '01:30',
  end: '06:15',
  nightMinutes: 0,
  note: '',
  ...overrides,
});

describe('entryToUtc', () => {
  it('moves a row kept on Moscow time to UTC, across midnight too', () => {
    expect(entryToUtc(row(), 180)).toMatchObject({ date: '2026-11-04', start: '22:30', end: '03:15', utc: true });
  });

  it('leaves rows already in UTC alone', () => {
    const utc = row({ utc: true });

    expect(entryToUtc(utc, 180)).toBe(utc);
  });

  it('only marks rows taken from the logbook, which always held UTC', () => {
    expect(entryToUtc(row({ id: 'flight-1' }), 180)).toMatchObject({ start: '01:30', utc: true });
  });

  it('only marks all-day rows without times', () => {
    expect(entryToUtc(row({ kind: 'vacation', start: '', end: '' }), 180)).toMatchObject({ date: '2026-11-05', utc: true });
  });
});

describe('clockAt', () => {
  it('reads an absolute minute in UTC and on another clock', () => {
    const at = absoluteMinutes('2026-11-09', '22:30');

    expect(clockAt(at)).toEqual({ date: '2026-11-09', time: '22:30' });
    expect(clockAt(at, 180)).toEqual({ date: '2026-11-10', time: '01:30' });
  });
});
