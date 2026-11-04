import { db, LocalFlight } from '../db/db';
import { api, ApiFlightItem, CURRENCY_SETTINGS_KEY, PROFILE_DATA_DIRTY_KEY, PROFILE_DATA_SYNCED_KEY, WORK_RATES_KEY } from '../api/client';
import { CurrencySettings, DEFAULT_CURRENCY_SETTINGS } from '../utils/currency';
import { DEFAULT_WORK_RATES, WorkRates } from '../utils/workTime';
import { packDetails, unpackDetails } from '../utils/entries';

export type SyncState = 'idle' | 'syncing' | 'success' | 'error' | 'offline';

type SyncListener = (state: SyncState, message?: string) => void;

const PUSH_BATCH_SIZE = 100;
export const FLIGHT_FILTERS_KEY = 'openlogbook_flight_filters';

// Sample rows earlier versions inserted for every pilot. They must never reach the server as real dates.
const LEGACY_SAMPLE_QUALIFICATIONS: Array<[string, string]> = [
  ['Medical Class 1 (ВЛЭК / ВЛП)', '2027-05-15'],
  ['LPC / Type Rating (A320 / B738)', '2027-01-30'],
  ['OPC (Operator Proficiency Check)', '2026-11-20'],
  ['Заграничный паспорт', '2029-08-10'],
];

const toApiFlight = (f: LocalFlight): ApiFlightItem => ({
  id: f.id,
  date: f.date,
  dep_icao: f.depIcao,
  arr_icao: f.arrIcao,
  out_time_utc: f.outTimeUtc,
  off_time_utc: f.offTimeUtc,
  on_time_utc: f.onTimeUtc,
  in_time_utc: f.inTimeUtc,
  total_time_minutes: f.totalTimeMinutes,
  night_time_minutes: f.nightTimeMinutes,
  ifr_time_minutes: f.ifrTimeMinutes,
  pic_time_minutes: f.picTimeMinutes,
  sic_time_minutes: f.sicTimeMinutes,
  picus_time_minutes: f.picusTimeMinutes,
  dual_time_minutes: f.dualTimeMinutes,
  flight_role: f.flightRole || 'SIC',
  flight_handling: f.flightHandling || 'PF',
  landings_day: f.landingsDay,
  landings_night: f.landingsNight,
  aircraft_reg: f.aircraftReg,
  aircraft_type: f.aircraftType,
  approach_type: f.approachType,
  remarks: f.remarks,
  is_deleted: f.syncStatus === 'deleted',
  updated_at: f.updatedAt,
  base_updated_at: f.serverUpdatedAt,
  details: packDetails(f),
});

const toLocalFlight = (remote: ApiFlightItem): LocalFlight => ({
  id: remote.id,
  date: remote.date,
  depIcao: remote.dep_icao,
  arrIcao: remote.arr_icao,
  outTimeUtc: remote.out_time_utc,
  offTimeUtc: remote.off_time_utc,
  onTimeUtc: remote.on_time_utc,
  inTimeUtc: remote.in_time_utc,
  totalTimeMinutes: remote.total_time_minutes,
  nightTimeMinutes: remote.night_time_minutes,
  ifrTimeMinutes: remote.ifr_time_minutes,
  picTimeMinutes: remote.pic_time_minutes,
  sicTimeMinutes: remote.sic_time_minutes,
  picusTimeMinutes: remote.picus_time_minutes,
  dualTimeMinutes: remote.dual_time_minutes,
  // The server has no instructor column: it always equals the block time of an Instructor flight
  instructorTimeMinutes: remote.flight_role === 'Instructor' ? remote.total_time_minutes : 0,
  flightRole: (remote.flight_role as any) || 'SIC',
  flightHandling: (remote.flight_handling as any) || 'PF',
  landingsDay: remote.landings_day,
  landingsNight: remote.landings_night,
  aircraftReg: remote.aircraft_reg,
  aircraftType: remote.aircraft_type,
  approachType: remote.approach_type,
  remarks: remote.remarks,
  syncStatus: 'synced',
  updatedAt: remote.updated_at,
  serverUpdatedAt: remote.updated_at,
  ...unpackDetails(remote.details),
});

const applyRemoteFlight = async (remote: ApiFlightItem) => {
  if (remote.is_deleted) {
    await db.flights.delete(remote.id);
  } else {
    await db.flights.put(toLocalFlight(remote));
  }
};

export const getPendingFlightCount = () => db.flights.filter((f) => f.syncStatus !== 'synced').count();

export const clearLocalUserData = async () => {
  await db.flights.clear();
  await db.qualifications.clear();
  await db.workEntries.clear();
  localStorage.removeItem('openlogbook_active_user_id');
  localStorage.removeItem('openlogbook_last_sync');
  localStorage.removeItem('openlogbook_pilot_profile');
  localStorage.removeItem(PROFILE_DATA_DIRTY_KEY);
  localStorage.removeItem(PROFILE_DATA_SYNCED_KEY);
  localStorage.removeItem(WORK_RATES_KEY);
  localStorage.removeItem(CURRENCY_SETTINGS_KEY);
  sessionStorage.removeItem(FLIGHT_FILTERS_KEY);
};

export const getWorkRates = (): WorkRates => {
  try {
    return { ...DEFAULT_WORK_RATES, ...JSON.parse(localStorage.getItem(WORK_RATES_KEY) || '{}') };
  } catch {
    return DEFAULT_WORK_RATES;
  }
};

let dirtyStampCounter = 0;

class SyncEngine {
  private listeners: Set<SyncListener> = new Set();
  private currentState: SyncState = 'idle';
  private isSyncing = false;
  private rerunRequested = false;

  subscribe(listener: SyncListener) {
    this.listeners.add(listener);
    listener(this.currentState);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notify(state: SyncState, message?: string) {
    this.currentState = state;
    this.listeners.forEach((listener) => listener(state, message));
  }

  getLastSyncTime(): string | null {
    return localStorage.getItem('openlogbook_last_sync');
  }

  /** Call before changing the data: a sync in progress must see the mark before it restores rows. */
  markProfileDataDirty() {
    dirtyStampCounter += 1;
    const stamp = `${Date.now()}-${dirtyStampCounter}`;
    localStorage.setItem(PROFILE_DATA_DIRTY_KEY, stamp);
    return stamp;
  }

  private async pushPendingFlights() {
    const pendingFlights = await db.flights.filter((f) => f.syncStatus !== 'synced').toArray();
    let conflictCount = 0;
    const rejectedReasons: string[] = [];

    for (let i = 0; i < pendingFlights.length; i += PUSH_BATCH_SIZE) {
      const batch = pendingFlights.slice(i, i + PUSH_BATCH_SIZE);
      const response = await api.syncPush(batch.map(toApiFlight));
      const rejected = new Map(response.rejected.map((item) => [item.id, item.reason]));
      const conflicts = new Map(response.conflicts.map((item) => [item.id, item]));

      await db.transaction('rw', db.flights, async () => {
        for (const sent of batch) {
          const current = await db.flights.get(sent.id);
          // Edited while the request was in flight: stays pending for the next run
          if (!current || current.updatedAt !== sent.updatedAt) continue;

          const reason = rejected.get(sent.id);
          const conflict = conflicts.get(sent.id);
          if (reason) {
            await db.flights.update(sent.id, { syncError: reason });
            rejectedReasons.push(`${sent.date} ${sent.depIcao}–${sent.arrIcao}: ${reason}`);
          } else if (conflict) {
            await applyRemoteFlight(conflict);
            conflictCount += 1;
          } else if (sent.syncStatus === 'deleted') {
            await db.flights.delete(sent.id);
          } else {
            await db.flights.update(sent.id, {
              syncStatus: 'synced',
              serverUpdatedAt: response.server_time,
              syncError: undefined,
            });
          }
        }
      });
    }

    return { conflictCount, rejectedReasons };
  }

  private async pullServerFlights() {
    const lastSync = this.getLastSyncTime();
    const pullResponse = await api.syncPull(lastSync || undefined);

    await db.transaction('rw', db.flights, async () => {
      for (const remote of pullResponse.flights) {
        const local = await db.flights.get(remote.id);
        // Never overwrite an edit that has not reached the server yet
        if (local && local.syncStatus !== 'synced') continue;
        await applyRemoteFlight(remote);
      }
    });

    localStorage.setItem('openlogbook_last_sync', pullResponse.server_time);
  }

  // Qualifications and work time travel inside profile_json: the server keeps it encrypted and needs no new table
  private async syncProfileData() {
    const me = await api.getMe();
    let profile: Record<string, any> = {};
    try {
      profile = me.profile_json ? JSON.parse(me.profile_json) : {};
    } catch {
      // Unreadable profile: treated as empty
    }

    let stamp = localStorage.getItem(PROFILE_DATA_DIRTY_KEY);
    const serverHasData = Array.isArray(profile.qualifications) || profile.workTime || profile.currencySettings;

    if (!stamp && serverHasData) {
      await db.transaction('rw', db.qualifications, db.workEntries, async () => {
        await db.qualifications.clear();
        await db.qualifications.bulkPut(profile.qualifications || []);
        await db.workEntries.clear();
        await db.workEntries.bulkPut(profile.workTime?.entries || []);
      });
      if (profile.workTime?.rates) localStorage.setItem(WORK_RATES_KEY, JSON.stringify(profile.workTime.rates));
      if (profile.currencySettings) localStorage.setItem(CURRENCY_SETTINGS_KEY, JSON.stringify(profile.currencySettings));
      localStorage.setItem(PROFILE_DATA_SYNCED_KEY, '1');
      return;
    }

    if (!stamp) {
      await db.qualifications
        .filter((q) => LEGACY_SAMPLE_QUALIFICATIONS.some(([name, date]) => q.name === name && q.expiresAt === date))
        .delete();
      if ((await db.qualifications.count()) === 0) {
        localStorage.setItem(PROFILE_DATA_SYNCED_KEY, '1');
        return;
      }
      stamp = this.markProfileDataDirty();
    }

    await api.updateProfile({ profile_json: JSON.stringify(profile) });
    localStorage.setItem(PROFILE_DATA_SYNCED_KEY, '1');
    // An edit made during the upload keeps its own mark and goes out next time
    if (localStorage.getItem(PROFILE_DATA_DIRTY_KEY) === stamp) localStorage.removeItem(PROFILE_DATA_DIRTY_KEY);
  }

  async syncNow(): Promise<boolean> {
    if (this.isSyncing) {
      this.rerunRequested = true;
      return false;
    }

    if (!navigator.onLine) {
      this.notify('offline', 'Нет подключения к сети (Cockpit Mode)');
      return false;
    }

    const user = api.getUser();
    if (!user) {
      this.notify('idle', 'Не выполнен вход в аккаунт');
      return false;
    }

    if (user.is_superuser) {
      this.notify('idle', 'Консоль администратора');
      return true;
    }

    this.isSyncing = true;
    this.notify('syncing', 'Синхронизация записей...');

    try {
      const { conflictCount, rejectedReasons } = await this.pushPendingFlights();
      await this.pullServerFlights();
      await this.syncProfileData();

      if (rejectedReasons.length > 0) {
        this.notify('error', `Сервер не принял рейсы (${rejectedReasons.length}). ${rejectedReasons[0]}`);
        return false;
      }
      this.notify(
        'success',
        conflictCount > 0
          ? `Синхронизировано. Рейсов заменено более новой версией с другого устройства: ${conflictCount}`
          : 'Все данные синхронизированы с сервером'
      );
      return true;
    } catch (error: any) {
      console.error('Sync failed:', error);
      this.notify('error', error.message || 'Ошибка синхронизации');
      return false;
    } finally {
      this.isSyncing = false;
      if (this.rerunRequested) {
        this.rerunRequested = false;
        void this.syncNow();
      }
    }
  }
}

export const syncEngine = new SyncEngine();

export const saveWorkRates = (rates: WorkRates) => {
  syncEngine.markProfileDataDirty();
  localStorage.setItem(WORK_RATES_KEY, JSON.stringify(rates));
};

export const getCurrencySettings = (): CurrencySettings => {
  try {
    return { ...DEFAULT_CURRENCY_SETTINGS, ...JSON.parse(localStorage.getItem(CURRENCY_SETTINGS_KEY) || '{}') };
  } catch {
    return DEFAULT_CURRENCY_SETTINGS;
  }
};

export const saveCurrencySettings = (settings: CurrencySettings) => {
  syncEngine.markProfileDataDirty();
  localStorage.setItem(CURRENCY_SETTINGS_KEY, JSON.stringify(settings));
};
