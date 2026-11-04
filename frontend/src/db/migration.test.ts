import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { describe, expect, it } from 'vitest';

describe('work time moves to UTC', () => {
  it('converts rows an older version kept on the plan clock', async () => {
    // The database as version 3 of the app left it
    const old = new Dexie('OpenLogBookDB');
    old.version(2).stores({
      flights: 'id, date, depIcao, arrIcao, aircraftReg, syncStatus, updatedAt',
      airports: 'icao, iata',
      aircraft: 'id, registration, icaoType',
      qualifications: 'id, type, expiresAt',
    });
    old.version(3).stores({ workEntries: 'id, date' });
    await old.table('workEntries').bulkPut([
      { id: 'plan', date: '2026-11-10', kind: 'flight', title: 'SU1511 SGC-SVO', start: '02:30', end: '06:00', nightMinutes: 0, note: '' },
      { id: 'flight-1', date: '2026-11-01', kind: 'flight', title: 'UUEE-USPP', start: '14:50', end: '17:05', nightMinutes: 0, note: '' },
    ]);
    old.close();

    const { db } = await import('./db');
    const rows = await db.workEntries.orderBy('id').toArray();

    expect(rows).toMatchObject([
      { id: 'flight-1', start: '14:50', utc: true },
      { id: 'plan', date: '2026-11-09', start: '23:30', end: '03:00', utc: true },
    ]);
  });
});
