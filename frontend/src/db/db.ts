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

export class OpenLogBookDB extends Dexie {
  flights!: Table<LocalFlight, string>;
  airports!: Table<LocalAirport, string>;
  aircraft!: Table<LocalAircraft, string>;
  qualifications!: Table<LocalQualification, string>;

  constructor() {
    super('OpenLogBookDB');
    this.version(2).stores({
      flights: 'id, date, depIcao, arrIcao, aircraftReg, syncStatus, updatedAt',
      airports: 'icao, iata',
      aircraft: 'id, registration, icaoType',
      qualifications: 'id, type, expiresAt'
    });
  }
}

export const db = new OpenLogBookDB();
