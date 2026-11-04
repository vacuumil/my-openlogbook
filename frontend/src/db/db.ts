import Dexie, { Table } from 'dexie';
import { entryToUtc, storedPlanOffset } from '../utils/workClock';

export interface LocalFlight {
  id: string; // UUID
  date: string; // YYYY-MM-DD
  depIcao: string;
  arrIcao: string;
  outTimeUtc: string; // HH:MM
  offTimeUtc: string;
  onTimeUtc: string;
  inTimeUtc: string;
  totalTimeMinutes: number;
  nightTimeMinutes: number;
  ifrTimeMinutes: number;
  picTimeMinutes: number;
  sicTimeMinutes: number;
  picusTimeMinutes: number;
  dualTimeMinutes: number;
  instructorTimeMinutes?: number;
  flightRole?: 'PIC' | 'SIC' | 'PICUS' | 'Dual' | 'Instructor' | 'Observer';
  flightHandling?: 'PF' | 'PM' | 'Observer' | 'Relief'; // Pilot Flying vs Pilot Monitoring vs Observer
  nightRule?: 'civil_twilight' | 'sunset_sunrise';
  landingsDay: number;
  landingsNight: number;
  aircraftReg: string;
  aircraftType: string;
  approachType?: string;
  remarks?: string;
  syncStatus: 'synced' | 'created' | 'updated' | 'deleted';
  updatedAt: string;
  serverUpdatedAt?: string; // Server version this record is based on
  syncError?: string; // Why the server refused this record
  entryType?: 'flight' | 'simulator' | 'ground'; // Absent means a flight
  status?: 'draft' | 'confirmed'; // Drafts come from a duty plan and wait for the pilot
  takeoffsDay?: number; // Absent means equal to the landings
  takeoffsNight?: number;
  fullStopLandingsNight?: number; // Absent means every night landing was to a full stop
  simDevice?: string; // FFS, FNPT II, FTD...
}

export interface LocalAirport {
  icao: string;
  iata?: string;
  name: string;
  latitude: number;
  longitude: number;
  timezone: string;
}

export interface LocalAircraft {
  id: string;
  registration: string;
  icaoType: string;
  isMultiPilot: boolean;
  category: 'SEP' | 'MEP' | 'Jet' | 'Turboprop' | 'Helicopter';
}

export interface LocalQualification {
  id: string;
  type: 'medical' | 'check' | 'document' | 'custom';
  name: string;
  expiresAt: string; // YYYY-MM-DD
  notes?: string;
}

export type WorkKind = 'flight' | 'reserve' | 'training' | 'ground' | 'vacation' | 'sick' | 'off';

export interface WorkEntry {
  id: string;
  date: string; // YYYY-MM-DD, UTC
  kind: WorkKind;
  title: string;
  start: string; // HH:MM UTC
  end: string; // HH:MM UTC
  nightMinutes: number;
  note: string;
  /** How a flight joins the previous one; absent means automatic */
  dutyLink?: DutyLink;
  /** Row read from a roster calendar: the event it came from, so a reload updates it */
  sourceId?: string;
  /** Times are UTC; rows without it are from before the switch and on the plan's clock */
  utc?: boolean;
  /** Roster pairing, e.g. SU1204/SU1205: its legs form one duty */
  pairing?: string;
  /** Flown as a passenger: working time, half of it counts as flight time */
  deadhead?: boolean;
  /** The pilot changed this row: a roster reload leaves it alone */
  edited?: boolean;
  /** Report (on the duty's first leg) and release (on its last leg) set by hand, HH:MM UTC */
  reportAt?: string;
  releaseAt?: string;
  /** Post-flight medical check: release comes later (40 minutes instead of 30) */
  medicalCheck?: boolean;
  /** Computed on screen: the times come from the logbook, not the plan. Never stored */
  actual?: boolean;
}

/**
 * auto: one duty when the gap is short; continue: one duty, the whole gap is work;
 * split: one duty with a rest break that is not work; separate: always a new duty.
 */
export type DutyLink = 'auto' | 'continue' | 'split' | 'separate';

export class OpenLogBookDB extends Dexie {
  flights!: Table<LocalFlight, string>;
  airports!: Table<LocalAirport, string>;
  aircraft!: Table<LocalAircraft, string>;
  qualifications!: Table<LocalQualification, string>;
  workEntries!: Table<WorkEntry, string>;

  constructor() {
    super('OpenLogBookDB');
    this.version(2).stores({
      flights: 'id, date, depIcao, arrIcao, aircraftReg, syncStatus, updatedAt',
      airports: 'icao, iata',
      aircraft: 'id, registration, icaoType',
      qualifications: 'id, type, expiresAt'
    });
    this.version(3).stores({
      workEntries: 'id, date'
    });
    // Work time moves to UTC, like the logbook
    this.version(4)
      .stores({ workEntries: 'id, date' })
      .upgrade((tx) => {
        const offset = storedPlanOffset();
        return tx
          .table('workEntries')
          .toCollection()
          .modify((entry: WorkEntry, ref: { value: WorkEntry }) => {
            ref.value = entryToUtc(entry, offset);
          });
      });
  }
}

export const db = new OpenLogBookDB();

/**
 * Safari drops the IndexedDB connection of a page iOS suspended; every read then fails with
 * "UnknownError: Unable to open cursor" or "Connection to Indexed Database server lost".
 */
export const isStorageError = (error: unknown) => {
  const { name = '', message = '' } = (error as { name?: string; message?: string }) || {};
  return (
    ['UnknownError', 'InvalidStateError', 'DatabaseClosedError', 'OpenFailedError'].includes(name) ||
    /indexed ?db|open cursor|IDBDatabase|database server lost|database connection is closing/i.test(message)
  );
};

/** A fresh connection to the same database */
export async function reopenDatabase() {
  db.close();
  await db.open();
}

/** Reads through a cursor once and reconnects if Safari has dropped the connection */
export async function ensureDatabase() {
  try {
    await db.flights.orderBy('date').limit(1).keys();
  } catch (error) {
    if (!isStorageError(error)) throw error;
    console.warn('Reopening the local database:', error);
    await reopenDatabase();
  }
}

/**
 * Last resort for a database Safari can no longer read: the local copy is deleted and the next
 * sync loads everything from the server again. The sign-in stays.
 */
export async function resetLocalDatabase() {
  db.close();
  await Dexie.delete('OpenLogBookDB');
  ['openlogbook_last_sync', 'openlogbook_quals_dirty', 'openlogbook_profile_data_synced', 'openlogbook_roster_fetched_at', 'openlogbook_roster_drafted'].forEach(
    (key) => {
      try {
        localStorage.removeItem(key);
      } catch {
        // Storage blocked: the sync still works from scratch
      }
    }
  );
}
