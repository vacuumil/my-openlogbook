import { describe, expect, it } from 'vitest';
import { LocalAirport, LocalFlight, WorkEntry } from '../db/db';
import { aircraftTypeFromPlan, buildDraftFlights, planTimeToUtc } from './planDrafts';

const entry = (overrides: Partial<WorkEntry> = {}): WorkEntry => ({
  id: crypto.randomUUID(),
  date: '2026-11-01',
  kind: 'flight',
  title: 'SU1204 SVO-PEE',
  start: '17:35',
  end: '19:45',
  nightMinutes: 0,
  note: 'A-320A',
  ...overrides,
});

const airport = (icao: string, iata: string, latitude: number, longitude: number): LocalAirport => ({
  icao,
  iata,
  name: icao,
  latitude,
  longitude,
  timezone: 'Europe/Moscow',
});

const airports = new Map([
  ['UUEE', airport('UUEE', 'SVO', 55.97, 37.41)],
  ['USPP', airport('USPP', 'PEE', 57.91, 56.02)],
]);
const options = {
  utcOffsetMinutes: 180,
  iataIndex: new Map([['SVO', 'UUEE'], ['PEE', 'USPP']]),
  airports,
};

describe('planTimeToUtc', () => {
  it('moves Moscow time to UTC across midnight', () => {
    expect(planTimeToUtc('2026-11-01', '17:35', 180)).toEqual({ date: '2026-11-01', time: '14:35' });
    expect(planTimeToUtc('2026-11-02', '01:30', 180)).toEqual({ date: '2026-11-01', time: '22:30' });
    expect(planTimeToUtc('2026-11-02', '01:30', 0)).toEqual({ date: '2026-11-02', time: '01:30' });
  });
});

describe('aircraftTypeFromPlan', () => {
  it('drops variant letters and dashes', () => {
    expect(['A-320A', 'A-321B', 'A-320', 'B-737-800'].map(aircraftTypeFromPlan)).toEqual(['A320', 'A321', 'A320', 'B737']);
  });
});

describe('buildDraftFlights', () => {
  it('turns plan flights into drafts with UTC times, ICAO codes and planned block time', () => {
    const [draft] = buildDraftFlights([entry()], [], options);

    expect(draft).toMatchObject({
      date: '2026-11-01',
      depIcao: 'UUEE',
      arrIcao: 'USPP',
      outTimeUtc: '14:35',
      inTimeUtc: '16:45',
      totalTimeMinutes: 130,
      sicTimeMinutes: 130,
      aircraftType: 'A320',
      status: 'draft',
      syncStatus: 'created',
      landingsDay: 0,
      remarks: 'Рейс SU1204 (из плана)',
    });
  });

  it('computes night time from the route', () => {
    const [nightFlight] = buildDraftFlights([entry({ start: '23:00', end: '01:10' })], [], options);
    const [dayFlight] = buildDraftFlights([entry({ date: '2026-06-15', start: '12:00', end: '14:10' })], [], options);

    expect(nightFlight.nightTimeMinutes).toBe(130);
    expect(dayFlight.nightTimeMinutes).toBe(0);
  });

  it('skips flights already in the logbook and repeats within the plan', () => {
    const existing = [{ date: '2026-11-01', depIcao: 'UUEE', arrIcao: 'USPP' } as LocalFlight];

    expect(buildDraftFlights([entry()], existing, options)).toEqual([]);
    expect(buildDraftFlights([entry(), entry()], [], options)).toHaveLength(1);
  });

  it('ignores duties other than flights and flights without times', () => {
    expect(buildDraftFlights([entry({ kind: 'reserve' }), entry({ start: '', end: '' })], [], options)).toEqual([]);
  });

  it('keeps unknown airport codes for the pilot to correct', () => {
    const [draft] = buildDraftFlights([entry({ title: 'SU1 SVO-XYZ' })], [], options);

    expect(draft.arrIcao).toBe('XYZ');
    expect(draft.nightTimeMinutes).toBe(0);
  });

  it('starts drafts with the pilot\'s usual role', () => {
    const [draft] = buildDraftFlights([entry()], [], { ...options, defaultRole: 'PIC' });

    expect(draft).toMatchObject({ flightRole: 'PIC', picTimeMinutes: 130, sicTimeMinutes: 0 });
  });
});
