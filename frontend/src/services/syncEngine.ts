import { db, LocalFlight } from '../db/db';
import { api, ApiFlightItem } from '../api/client';

export type SyncState = 'idle' | 'syncing' | 'success' | 'error' | 'offline';

type SyncListener = (state: SyncState, message?: string) => void;

class SyncEngine {
  private listeners: Set<SyncListener> = new Set();
  private currentState: SyncState = 'idle';
  private isSyncing = false;

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

  async syncNow(): Promise<boolean> {
    if (this.isSyncing) return false;

    if (!navigator.onLine) {
      this.notify('offline', 'Нет подключения к сети (Cockpit Mode)');
      return false;
    }

    const user = api.getUser();
    if (!user) {
      this.notify('idle', 'Не выполнен вход в аккаунт');
      return false;
    }

    this.isSyncing = true;
    this.notify('syncing', 'Синхронизация записей...');

    try {
      // 1. PUSH: Find local pending modifications
      const pendingFlights = await db.flights
        .filter((f) => f.syncStatus !== 'synced')
        .toArray();

      if (pendingFlights.length > 0) {
        const payload: ApiFlightItem[] = pendingFlights.map((f) => ({
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
        }));

        await api.syncPush(payload);

        // Mark pushed records as synced or remove deleted ones
        for (const flight of pendingFlights) {
          if (flight.syncStatus === 'deleted') {
            await db.flights.delete(flight.id);
          } else {
            await db.flights.update(flight.id, { syncStatus: 'synced' });
          }
        }
      }

      // 2. PULL: Fetch server updates since last sync
      const lastSync = this.getLastSyncTime();
      const pullResponse = await api.syncPull(lastSync || undefined);

      if (pullResponse.flights && pullResponse.flights.length > 0) {
        for (const remote of pullResponse.flights) {
          if (remote.is_deleted) {
            await db.flights.delete(remote.id);
          } else {
            const localRecord: LocalFlight = {
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
            };
            await db.flights.put(localRecord);
          }
        }
      }

      // Update timestamp
      localStorage.setItem('openlogbook_last_sync', pullResponse.server_time);
      this.notify('success', 'Все данные синхронизированы с сервером');
      return true;
    } catch (error: any) {
      console.error('Sync failed:', error);
      this.notify('error', error.message || 'Ошибка синхронизации');
      return false;
    } finally {
      this.isSyncing = false;
    }
  }
}

export const syncEngine = new SyncEngine();
