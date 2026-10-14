import { LocalFlight } from '../db/db';
import { airportService } from './airportService';

export interface ParsedRosterFlight {
  id: string;
  selected: boolean;
  date: string; // YYYY-MM-DD
  flightNumber?: string;
  depIcao: string;
  arrIcao: string;
  outTimeUtc: string; // HH:MM
  offTimeUtc: string;
  onTimeUtc: string;
  inTimeUtc: string;
  totalTimeMinutes: number;
  aircraftType: string;
  aircraftReg: string;
  flightRole: 'PIC' | 'SIC' | 'PICUS' | 'Dual' | 'Instructor' | 'Observer';
  flightHandling: 'PF' | 'PM' | 'Observer' | 'Relief';
}

const COMMON_IATA_MAP: Record<string, string> = {
  SVO: 'UUEE',
  DME: 'UUDD',
  VKO: 'UUWW',
  ZIA: 'UUBW',
  LED: 'ULLI',
  AER: 'URSS',
  SVX: 'USSS',
  OVB: 'UNNT',
  KUF: 'UWWW',
  KZN: 'UWKD',
  GOJ: 'UWGG',
  UFA: 'UWUU',
  CEK: 'USCC',
  KJA: 'UNKL',
  OMS: 'UNOO',
  IKT: 'UIII',
  KHV: 'UHHH',
  VVO: 'UHWW',
  PKC: 'UHPP',
  YKS: 'UEEE',
  MRV: 'URMM',
  GRV: 'URMG',
  MCX: 'URML',
  ASF: 'URWA',
  VOG: 'URWW',
  TJM: 'USTR',
  SGC: 'USRR',
  ARH: 'ULAA',
  MMK: 'ULMM',
  KGD: 'UMKK',
  MSQ: 'UMMS',
  ALA: 'UAAA',
  NQZ: 'UACC',
  TAS: 'UTTT',
  SKD: 'UTSS',
  FRU: 'UCFM',
  EVN: 'UDYZ',
  GYD: 'UBBB',
  TBS: 'UGTB',
  BUS: 'UGSB',
  IST: 'LTFM',
  SAW: 'LTFJ',
  AYT: 'LTAI',
  DXB: 'OMDB',
  DWC: 'OMDW',
  AUH: 'OMAA',
  SHJ: 'OMSJ',
  DOH: 'OTHH',
  FRA: 'EDDF',
  MUC: 'EDDM',
  BER: 'EDDB',
  CDG: 'LFPG',
  ORY: 'LFPO',
  LHR: 'EGLL',
  LGW: 'EGKK',
  AMS: 'EHAM',
  FCO: 'LIRF',
  MXP: 'LIMC',
  BCN: 'LEBL',
  MAD: 'LEMD',
  JFK: 'KJFK',
  ORD: 'KORD',
  LAX: 'KLAX',
  HKG: 'VHHH',
  SIN: 'WSSS',
  BKK: 'VTBS',
  HKT: 'VTSP',
};

export async function resolveAirportCode(code: string): Promise<string> {
  const clean = code.trim().toUpperCase();
  if (clean.length === 4) return clean;
  if (clean.length === 3) {
    if (COMMON_IATA_MAP[clean]) return COMMON_IATA_MAP[clean];
    const found = await airportService.getAirport(clean);
    if (found) return found.icao;
  }
  return clean;
}

function parseBlockMinutes(outTime: string, inTime: string, dateStr: string): number {
  try {
    const [outH, outM] = outTime.split(':').map(Number);
    const [inH, inM] = inTime.split(':').map(Number);
    const [y, m, d] = dateStr.split('-').map(Number);

    const outDate = new Date(Date.UTC(y, m - 1, d, outH, outM));
    let inDate = new Date(Date.UTC(y, m - 1, d, inH, inM));
    if (inDate < outDate) {
      inDate = new Date(inDate.getTime() + 24 * 60 * 60 * 1000);
    }
    return Math.max(0, Math.round((inDate.getTime() - outDate.getTime()) / (1000 * 60)));
  } catch {
    return 0;
  }
}

function normalizeDate(raw: string): string {
  // Matches YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;

  // Matches DD.MM.YYYY
  const ruMatch = raw.match(/^(\d{1,2})[./](\d{1,2})[./](\d{4})$/);
  if (ruMatch) {
    const day = ruMatch[1].padStart(2, '0');
    const month = ruMatch[2].padStart(2, '0');
    const year = ruMatch[3];
    return `${year}-${month}-${day}`;
  }

  // Matches DD-MMM-YYYY (e.g. 15-OCT-2026 or 15OCT26)
  const months: Record<string, string> = {
    JAN: '01', FEB: '02', MAR: '03', APR: '04', MAY: '05', JUN: '06',
    JUL: '07', AUG: '08', SEP: '09', OCT: '10', NOV: '11', DEC: '12',
    ЯНВ: '01', ФЕВ: '02', МАР: '03', АПР: '04', МАЙ: '05', ИЮН: '06',
    ИЮЛ: '07', АВГ: '08', СЕН: '09', ОКТ: '10', НОЯ: '11', ДЕК: '12'
  };

  const textMonthMatch = raw.toUpperCase().match(/^(\d{1,2})[-/\s]?([A-ZА-Я]{3})[-/\s]?(\d{2,4})$/);
  if (textMonthMatch) {
    const day = textMonthMatch[1].padStart(2, '0');
    const mStr = textMonthMatch[2];
    const yStr = textMonthMatch[3];
    const year = yStr.length === 2 ? `20${yStr}` : yStr;
    const month = months[mStr] || '01';
    return `${year}-${month}-${day}`;
  }

  return new Date().toISOString().split('T')[0];
}

/**
 * Intelligent parser that extracts flights from airline schedules and rosters
 */
export async function parseRosterText(text: string): Promise<ParsedRosterFlight[]> {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter((l) => l.length > 5);
  const flights: ParsedRosterFlight[] = [];

  for (const line of lines) {
    // Skip table headers and non-flight lines
    if (/^(DATE|FLIGHT|ROSTER|DUTY|REST|HOTEL|DAY|OFF|LEAVE|SIM|CHECK)/i.test(line)) {
      continue;
    }

    // 1. Check CSV format (comma, semicolon, or tab)
    if (line.includes(';') || line.includes(',') || line.includes('\t')) {
      const delimiter = line.includes(';') ? ';' : line.includes('\t') ? '\t' : ',';
      const parts = line.split(delimiter).map((p) => p.trim().replace(/^["']|["']$/g, ''));

      if (parts.length >= 4) {
        // Find date part
        let dateVal = parts.find((p) => /\d{1,4}[-./]\d{1,2}[-./]\d{1,4}/.test(p));
        const airports = parts.filter((p) => /^[A-Za-z]{3,4}$/.test(p));
        const times = parts.filter((p) => /^\d{1,2}:\d{2}$/.test(p));

        if (airports.length >= 2 && times.length >= 2) {
          const date = normalizeDate(dateVal || '');
          const depIcao = await resolveAirportCode(airports[0]);
          const arrIcao = await resolveAirportCode(airports[1]);
          const outTimeUtc = times[0].padStart(5, '0');
          const inTimeUtc = times[1].padStart(5, '0');

          const aircraftType = parts.find((p) => /^(A320|A321|A330|A350|B738|B737|B777|B787|SSJ|SU9|E190|CRJ)/i.test(p))?.toUpperCase() || 'A320';
          const aircraftReg = parts.find((p) => /^(RA-|VQ-|VP-|EI-|TC-|N\d)/i.test(p))?.toUpperCase() || 'RA-73001';

          flights.push({
            id: crypto.randomUUID(),
            selected: true,
            date,
            depIcao,
            arrIcao,
            outTimeUtc,
            offTimeUtc: outTimeUtc,
            onTimeUtc: inTimeUtc,
            inTimeUtc,
            totalTimeMinutes: parseBlockMinutes(outTimeUtc, inTimeUtc, date),
            aircraftType,
            aircraftReg,
            flightRole: 'SIC',
            flightHandling: 'PF',
          });
          continue;
        }
      }
    }

    // 2. Space-separated airline roster line
    // Example: 2026-10-15 SU1492 SVO LED 08:00 09:30 A320 RA-73001
    // or: 15OCT SVO-LED 08:00 09:30
    const tokens = line.split(/\s+/);

    // Look for date
    let dateStr = tokens.find((t) => /\d{1,4}[-./]\d{1,2}[-./]\d{1,4}/.test(t) || /\d{1,2}[A-Za-zА-Яа-я]{3}\d{0,4}/.test(t));
    const normalizedDate = dateStr ? normalizeDate(dateStr) : new Date().toISOString().split('T')[0];

    // Look for route (e.g. SVO-LED, SVO/LED, or two standalone codes)
    let depCode = '';
    let arrCode = '';

    const joinedRoute = tokens.find((t) => /^[A-Za-z]{3,4}[-/][A-Za-z]{3,4}$/.test(t));
    if (joinedRoute) {
      const [d, a] = joinedRoute.split(/[-/]/);
      depCode = d;
      arrCode = a;
    } else {
      const codeMatches = tokens.filter((t) => /^[A-Za-z]{3,4}$/.test(t) && !/^(AND|THE|OUT|AIR|DAY|FLT|UTC)$/i.test(t));
      if (codeMatches.length >= 2) {
        depCode = codeMatches[0];
        arrCode = codeMatches[1];
      }
    }

    // Look for times (HH:MM)
    const timeMatches = tokens.filter((t) => /^\d{1,2}:\d{2}$/.test(t) || /^\d{4}$/.test(t));
    let outTimeUtc = '08:00';
    let inTimeUtc = '10:00';

    if (timeMatches.length >= 2) {
      outTimeUtc = timeMatches[0].includes(':') ? timeMatches[0].padStart(5, '0') : `${timeMatches[0].slice(0, 2)}:${timeMatches[0].slice(2, 4)}`;
      inTimeUtc = timeMatches[1].includes(':') ? timeMatches[1].padStart(5, '0') : `${timeMatches[1].slice(0, 2)}:${timeMatches[1].slice(2, 4)}`;
    }

    // Look for aircraft & reg
    const aType = tokens.find((t) => /^(A3\d\d|B7\d\d|SSJ|SU9|E\d\d\d|CRJ)/i.test(t))?.toUpperCase() || 'A320';
    const aReg = tokens.find((t) => /^(RA-|VQ-|VP-|EI-|TC-|N\d)/i.test(t))?.toUpperCase() || 'RA-73001';
    const fltNum = tokens.find((t) => /^[A-Z0-9]{2,3}\d{2,4}$/i.test(t));

    if (depCode && arrCode) {
      const depIcao = await resolveAirportCode(depCode);
      const arrIcao = await resolveAirportCode(arrCode);

      flights.push({
        id: crypto.randomUUID(),
        selected: true,
        date: normalizedDate,
        flightNumber: fltNum,
        depIcao,
        arrIcao,
        outTimeUtc,
        offTimeUtc: outTimeUtc,
        onTimeUtc: inTimeUtc,
        inTimeUtc,
        totalTimeMinutes: parseBlockMinutes(outTimeUtc, inTimeUtc, normalizedDate),
        aircraftType: aType,
        aircraftReg: aReg,
        flightRole: 'SIC',
        flightHandling: 'PF',
      });
    }
  }

  return flights;
}
