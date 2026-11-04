import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { db, ensureDatabase, isStorageError, resetLocalDatabase } from './db';

const storage = new Map<string, string>();
vi.stubGlobal('localStorage', {
  getItem: (key: string) => storage.get(key) ?? null,
  setItem: (key: string, value: string) => storage.set(key, value),
  removeItem: (key: string) => storage.delete(key),
});

const unknownError =Object.assign(new Error('Unable to open cursor'), { name: 'UnknownError' });

afterEach(() => vi.restoreAllMocks());

describe('isStorageError', () => {
  it('recognises what Safari reports for a dropped database', () => {
    expect(isStorageError(unknownError)).toBe(true);
    expect(isStorageError(new Error('Connection to Indexed Database server lost. Refresh the page to try again'))).toBe(true);
    expect(isStorageError(Object.assign(new Error('x'), { name: 'DatabaseClosedError' }))).toBe(true);
  });

  it('leaves ordinary errors alone', () => {
    expect(isStorageError(new TypeError('x is undefined'))).toBe(false);
    expect(isStorageError(undefined)).toBe(false);
  });
});

describe('ensureDatabase', () => {
  it('reconnects when Safari has dropped the connection', async () => {
    await db.open();
    vi.spyOn(db.flights, 'orderBy').mockImplementationOnce(() => {
      throw unknownError;
    });
    const close = vi.spyOn(db, 'close');

    await ensureDatabase();

    expect(close).toHaveBeenCalled();
    expect(db.isOpen()).toBe(true);
  });

  it('passes other errors on', async () => {
    vi.spyOn(db.flights, 'orderBy').mockImplementationOnce(() => {
      throw new TypeError('bug');
    });

    await expect(ensureDatabase()).rejects.toThrow('bug');
  });
});

describe('resetLocalDatabase', () => {
  it('deletes the local copy and forgets the sync point, keeping the sign-in', async () => {
    await db.open();
    await db.workEntries.put({ id: 'w', date: '2026-11-05', kind: 'off', title: '', start: '', end: '', nightMinutes: 0, note: '' });
    localStorage.setItem('openlogbook_last_sync', '2026-11-01T00:00:00Z');
    localStorage.setItem('openlogbook_token', 'kept');

    await resetLocalDatabase();
    await db.open();

    expect(await db.workEntries.count()).toBe(0);
    expect(localStorage.getItem('openlogbook_last_sync')).toBeNull();
    expect(localStorage.getItem('openlogbook_token')).toBe('kept');
  });
});
