import Dexie, { Table } from 'dexie';

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
  date: string; // YYYY-MM-DD
  kind: WorkKind;
  title: string;
  start: string; // HH:MM
  end: string; // HH:MM
  nightMinutes: number;
  note: string;
  /** How a flight joins the previous one; absent means automatic */
  dutyLink?: DutyLink;
  /** Row read from a roster calendar: the event it came from, so a reload updates it */
  sourceId?: string;
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
  }
}

export const db = new OpenLogBookDB();
