import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { db, LocalFlight } from '../db/db';
import { api, ApiFlightItem } from '../api/client';
import { clearLocalUserData, getPendingFlightCount, syncEngine } from './syncEngine';

const storage = new Map<string, string>();
vi.stubGlobal('localStorage', {
  getItem: (key: string) => storage.get(key) ?? null,
  setItem: (key: string, value: string) => storage.set(key, value),
  removeItem: (key: string) => storage.delete(key),
});
vi.stubGlobal('navigator', { onLine: true });

const SERVER_TIME = '2026-11-02T10:00:00.123456+00:00';

const localFlight = (overrides: Partial<LocalFlight> = {}): LocalFlight => ({
  id: crypto.randomUUID(),
  date: '2026-10-01',
  depIcao: 'UUEE',
  arrIcao: 'OMDB',
  outTimeUtc: '08:00',
  offTimeUtc: '08:15',
  onTimeUtc: '13:00',
  inTimeUtc: '13:10',
  totalTimeMinutes: 310,
  nightTimeMinutes: 0,
  ifrTimeMinutes: 310,
  picTimeMinutes: 0,
  sicTimeMinutes: 310,
  picusTimeMinutes: 0,
  dualTimeMinutes: 0,
  landingsDay: 1,
  landingsNight: 0,
  aircraftReg: 'RA-73000',
  aircraftType: 'A320',
  syncStatus: 'created',
  updatedAt: '2026-10-01T14:00:00.000Z',
  ...overrides,
});

const remoteFlight = (overrides: Partial<ApiFlightItem> = {}): ApiFlightItem => ({
  id: crypto.randomUUID(),
  date: '2026-10-02',
  dep_icao: 'EGLL',
  arr_icao: 'LFPG',
  out_time_utc: '08:00',
  off_time_utc: '08:15',
  on_time_utc: '09:00',
  in_time_utc: '09:10',
  total_time_minutes: 70,
  night_time_minutes: 0,
  ifr_time_minutes: 70,
  pic_time_minutes: 70,
  sic_time_minutes: 0,
  picus_time_minutes: 0,
  dual_time_minutes: 0,
  landings_day: 1,
  landings_night: 0,
  aircraft_reg: 'RA-73001',
  aircraft_type: 'A321',
  updated_at: SERVER_TIME,
  ...overrides,
});

const accepted = () => ({ synced_count: 1, conflicts: [], rejected: [], server_time: SERVER_TIME });

describe('syncEngine', () => {
  let syncPush: ReturnType<typeof vi.spyOn>;
  let syncPull: ReturnType<typeof vi.spyOn>;
  let getMe: ReturnType<typeof vi.spyOn>;
  let updateProfile: ReturnType<typeof vi.spyOn>;

  beforeEach(async () => {
    vi.restoreAllMocks();
    storage.clear();
    await db.flights.clear();
    await db.qualifications.clear();
    storage.set('openlogbook_user', JSON.stringify({ id: 'pilot-1' }));
    syncPush = vi.spyOn(api, 'syncPush').mockImplementation(async () => accepted());
    syncPull = vi.spyOn(api, 'syncPull').mockResolvedValue({ flights: [], server_time: SERVER_TIME });
    getMe = vi.spyOn(api, 'getMe').mockResolvedValue({} as any);
    updateProfile = vi.spyOn(api, 'updateProfile').mockResolvedValue({});
  });

  it('pushes a large import in batches the server accepts', async () => {
    await db.flights.bulkPut(Array.from({ length: 250 }, () => localFlight()));

    expect(await syncEngine.syncNow()).toBe(true);

    expect(syncPush).toHaveBeenCalledTimes(3);
    expect(syncPush.mock.calls.every((call: unknown[]) => (call[0] as unknown[]).length <= 100)).toBe(true);
    expect(await getPendingFlightCount()).toBe(0);
  });

  it('keeps already saved batches when a later batch fails', async () => {
    await db.flights.bulkPut(Array.from({ length: 150 }, () => localFlight()));
    syncPush.mockResolvedValueOnce(accepted()).mockRejectedValueOnce(new Error('Network down'));

    expect(await syncEngine.syncNow()).toBe(false);

    expect(await getPendingFlightCount()).toBe(50);
  });

  it('records the server version so the next edit is not mistaken for a conflict', async () => {
    const flight = localFlight();
    await db.flights.put(flight);

    await syncEngine.syncNow();

    const saved = await db.flights.get(flight.id);
    expect(saved?.syncStatus).toBe('synced');
    expect(saved?.serverUpdatedAt).toBe(SERVER_TIME);
  });

  it('does not mark a flight synced when it was edited during the push', async () => {
    const flight = localFlight();
    await db.flights.put(flight);
    syncPush.mockImplementationOnce(async () => {
      await db.flights.update(flight.id, { arrIcao: 'EGLL', updatedAt: '2026-10-01T15:00:00.000Z' });
      return accepted();
    });

    await syncEngine.syncNow();

    const saved = await db.flights.get(flight.id);
    expect(saved?.syncStatus).toBe('created');
    expect(saved?.arrIcao).toBe('EGLL');
  });

  it('never lets a pull overwrite a pending local edit', async () => {
    const flight = localFlight({ syncStatus: 'updated', arrIcao: 'EGLL' });
    await db.flights.put(flight);
    syncPush.mockRejectedValueOnce(new Error('Network down'));
    await syncEngine.syncNow();
    syncPush.mockImplementationOnce(async () => {
      await db.flights.update(flight.id, { updatedAt: '2026-10-01T15:00:00.000Z' });
      return accepted();
    });
    syncPull.mockResolvedValueOnce({
      flights: [remoteFlight({ id: flight.id, arr_icao: 'LFPG' })],
      server_time: SERVER_TIME,
    });

    await syncEngine.syncNow();

    expect((await db.flights.get(flight.id))?.arrIcao).toBe('EGLL');
  });

  it('keeps rejected flights and reports why', async () => {
    const flight = localFlight();
    await db.flights.put(flight);
    syncPush.mockResolvedValueOnce({
      ...accepted(),
      synced_count: 0,
      rejected: [{ id: flight.id, reason: 'Поле aircraft_type длиннее 20 символов.' }],
    });
    const messages: Array<string | undefined> = [];
    const unsubscribe = syncEngine.subscribe((_, message) => messages.push(message));

    expect(await syncEngine.syncNow()).toBe(false);
    unsubscribe();

    const saved = await db.flights.get(flight.id);
    expect(saved?.syncStatus).toBe('created');
    expect(saved?.syncError).toContain('aircraft_type');
    expect(messages.at(-1)).toContain('aircraft_type');
  });

  it('replaces a conflicting flight with the server version', async () => {
    const flight = localFlight({ syncStatus: 'updated' });
    await db.flights.put(flight);
    syncPush.mockResolvedValueOnce({
      ...accepted(),
      synced_count: 0,
      conflicts: [remoteFlight({ id: flight.id, arr_icao: 'LFPG' })],
    });

    await syncEngine.syncNow();

    const saved = await db.flights.get(flight.id);
    expect(saved?.arrIcao).toBe('LFPG');
    expect(saved?.syncStatus).toBe('synced');
  });

  it('derives instructor time that the server does not store', async () => {
    const remote = remoteFlight({ flight_role: 'Instructor', total_time_minutes: 70 });
    syncPull.mockResolvedValueOnce({ flights: [remote], server_time: SERVER_TIME });

    await syncEngine.syncNow();

    expect((await db.flights.get(remote.id))?.instructorTimeMinutes).toBe(70);
  });

  it('runs again when a sync is requested while one is in progress', async () => {
    let finishFirstPull: (value: { flights: ApiFlightItem[]; server_time: string }) => void = () => {};
    syncPull.mockImplementationOnce(() => new Promise((resolve) => (finishFirstPull = resolve)));

    const first = syncEngine.syncNow();
    await vi.waitFor(() => expect(syncPull).toHaveBeenCalledTimes(1));
    expect(await syncEngine.syncNow()).toBe(false);
    finishFirstPull({ flights: [], server_time: SERVER_TIME });
    await first;

    await vi.waitFor(() => expect(syncPull).toHaveBeenCalledTimes(2));
  });

  it('restores qualifications from the profile on a new device', async () => {
    const qualification = { id: 'q1', type: 'medical', name: 'ВЛЭК', expiresAt: '2027-01-01' };
    getMe.mockResolvedValue({ profile_json: JSON.stringify({ qualifications: [qualification] }) } as any);

    await syncEngine.syncNow();

    expect(await db.qualifications.toArray()).toEqual([qualification]);
  });

  it('uploads edited qualifications instead of overwriting them', async () => {
    await db.qualifications.put({ id: 'q2', type: 'check', name: 'LPC', expiresAt: '2027-02-02' });
    getMe.mockResolvedValue({ profile_json: JSON.stringify({ qualifications: [] }) } as any);
    syncEngine.markQualificationsDirty();

    await syncEngine.syncNow();

    expect(updateProfile).toHaveBeenCalledTimes(1);
    expect(await db.qualifications.count()).toBe(1);
  });

  it('drops old sample dates rather than uploading them as real ones', async () => {
    await db.qualifications.put({
      id: 'sample',
      type: 'medical',
      name: 'Medical Class 1 (ВЛЭК / ВЛП)',
      expiresAt: '2027-05-15',
    });

    await syncEngine.syncNow();

    expect(updateProfile).not.toHaveBeenCalled();
    expect(await db.qualifications.count()).toBe(0);
  });

  it('clears personal data from the device', async () => {
    await db.flights.put(localFlight());
    await db.qualifications.put({ id: 'q3', type: 'medical', name: 'ВЛЭК', expiresAt: '2027-01-01' });

    await clearLocalUserData();

    expect(await db.flights.count()).toBe(0);
    expect(await db.qualifications.count()).toBe(0);
  });
});
