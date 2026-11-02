import { generateUUID } from './uuid';
import { resolveAirportCode } from './rosterParser';

export interface ParsedUniversalFlight {
  id: string;
  selected: boolean;
  date: string; // YYYY-MM-DD
  flightNumber?: string;
  depIcao: string;
  arrIcao: string;
  outTimeUtc: string; // HH:MM
  offTimeUtc?: string;
  onTimeUtc?: string;
  inTimeUtc: string; // HH:MM
  totalTimeMinutes: number;
  nightTimeMinutes: number;
  ifrTimeMinutes?: number;
  picTimeMinutes?: number;
  sicTimeMinutes?: number;
  dualTimeMinutes?: number;
  aircraftType: string;
  aircraftReg: string;
  flightRole: 'PIC' | 'SIC' | 'PICUS' | 'Dual' | 'Instructor' | 'Observer';
  flightHandling: 'PF' | 'PM' | 'Observer' | 'Relief';
  landingsDay: number;
  landingsNight: number;
  approachType?: string;
  remarks?: string;
  isDuplicate?: boolean;
  duplicateReason?: string;
  sourceFormat?: string;
}

/**
 * Parses time string (HH:MM, H:MM) or decimal hours (1.5, 2.7) into minutes
 */
export function parseDurationToMinutes(val: any): number {
  if (val === undefined || val === null || val === '') return 0;
  const str = String(val).trim().replace(',', '.');

  // Format HH:MM or H:MM
  if (/^\d{1,2}:\d{2}$/.test(str)) {
    const [h, m] = str.split(':').map(Number);
    return Math.max(0, h * 60 + m);
  }

  // Decimal hours (e.g. 1.7)
  const num = parseFloat(str);
  if (!isNaN(num) && num > 0) {
    return Math.round(num * 60);
  }

  return 0;
}

/**
 * Normalizes date string to YYYY-MM-DD
 */
export function normalizeDateString(raw: string): string {
  const trimmed = raw.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;

  // DD.MM.YYYY, DD/MM/YYYY, DD-MM-YYYY
  const dmy = trimmed.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})$/);
  if (dmy) {
    const day = dmy[1].padStart(2, '0');
    const month = dmy[2].padStart(2, '0');
    const year = dmy[3].length === 2 ? `20${dmy[3]}` : dmy[3];
    return `${year}-${month}-${day}`;
  }

  // MM/DD/YYYY (US format often found in ForeFlight / LogTen Pro)
  const usDate = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (usDate) {
    const month = usDate[1].padStart(2, '0');
    const day = usDate[2].padStart(2, '0');
    const year = usDate[3];
    return `${year}-${month}-${day}`;
  }

  // Text month (e.g. 15-OCT-2026 or 15OCT26)
  const months: Record<string, string> = {
    JAN: '01', FEB: '02', MAR: '03', APR: '04', MAY: '05', JUN: '06',
    JUL: '07', AUG: '08', SEP: '09', OCT: '10', NOV: '11', DEC: '12',
    ЯНВ: '01', ФЕВ: '02', МАР: '03', АПР: '04', МАЙ: '05', ИЮН: '06',
    ИЮЛ: '07', АВГ: '08', СЕН: '09', ОКТ: '10', НОЯ: '11', ДЕК: '12'
  };
  const textMatch = trimmed.toUpperCase().match(/^(\d{1,2})[-/\s]?([A-ZА-Я]{3})[-/\s]?(\d{2,4})$/);
  if (textMatch) {
    const day = textMatch[1].padStart(2, '0');
    const mStr = textMatch[2];
    const yStr = textMatch[3];
    const year = yStr.length === 2 ? `20${yStr}` : yStr;
    const month = months[mStr] || '01';
    return `${year}-${month}-${day}`;
  }

  return new Date().toISOString().split('T')[0];
}

/**
 * Normalizes time string to HH:MM format
 */
export function normalizeTimeString(val: any, fallback: string = '08:00'): string {
  if (!val) return fallback;
  const str = String(val).trim();
  if (/^\d{1,2}:\d{2}$/.test(str)) {
    return str.padStart(5, '0');
  }
  if (/^\d{4}$/.test(str)) {
    return `${str.slice(0, 2)}:${str.slice(2, 4)}`;
  }
  return fallback;
}

/**
 * Calculates inTimeUtc given outTimeUtc and duration in minutes
 */
export function addMinutesToTimeString(outTime: string, durationMinutes: number): string {
  try {
    const [h, m] = outTime.split(':').map(Number);
    const totalM = (h * 60 + m + durationMinutes) % (24 * 60);
    const endH = Math.floor(totalM / 60);
    const endM = totalM % 60;
    return `${String(endH).padStart(2, '0')}:${String(endM).padStart(2, '0')}`;
  } catch {
    return outTime;
  }
}

/**
 * Simple CSV parser handling quoted values with commas
 */
function parseCsvLines(csvText: string): string[][] {
  const lines: string[][] = [];
  const rawLines = csvText.split(/\r?\n/).filter((l) => l.trim().length > 0);

  for (const line of rawLines) {
    const row: string[] = [];
    let insideQuote = false;
    let entry = '';

    // Detect delimiter: comma, semicolon, tab
    let delimiter = ',';
    if (!line.includes(',') && line.includes(';')) delimiter = ';';
    else if (!line.includes(',') && line.includes('\t')) delimiter = '\t';

    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"') {
        insideQuote = !insideQuote;
      } else if (char === delimiter && !insideQuote) {
        row.push(entry.trim());
        entry = '';
      } else {
        entry += char;
      }
    }
    row.push(entry.trim());
    lines.push(row.map((col) => col.replace(/^["']|["']$/g, '').trim()));
  }

  return lines;
}

/**
 * Intelligent CSV Logbook Parser (LogTen Pro, ForeFlight, Safelog, Generic)
 */
export async function parseCsvLogbook(csvContent: string): Promise<ParsedUniversalFlight[]> {
  const rows = parseCsvLines(csvContent);
  if (rows.length < 2) return [];

  // Find header row (usually row 0 or row 1)
  let headerIndex = 0;
  for (let i = 0; i < Math.min(5, rows.length); i++) {
    const rowStr = rows[i].join(' ').toLowerCase();
    if (
      rowStr.includes('date') ||
      rowStr.includes('departure') ||
      rowStr.includes('from') ||
      rowStr.includes('flight') ||
      rowStr.includes('aircraft')
    ) {
      headerIndex = i;
      break;
    }
  }

  const headers = rows[headerIndex].map((h) => h.toLowerCase().replace(/[\s_-]/g, ''));
  const dataRows = rows.slice(headerIndex + 1);

  // Column matching helper
  const findCol = (...keywords: string[]): number => {
    return headers.findIndex((h) => keywords.some((kw) => h === kw || h.includes(kw)));
  };

  const dateCol = findCol('date', 'flightdate', 'datum', 'дата');
  const fltNumCol = findCol('flightdesignator', 'flightnumber', 'flightno', 'flight', 'рейс', 'flt');
  const depCol = findCol('departure', 'from', 'orig', 'dep', 'depicao', 'вылет');
  const arrCol = findCol('destination', 'to', 'dest', 'arr', 'arricao', 'прилет');
  const routeCol = findCol('route', 'маршрут');
  const outTimeCol = findCol('timeout', 'outtime', 'out', 'blockout', 'времявылета');
  const offTimeCol = findCol('timeoff', 'offtime', 'off', 'takeoff', 'взлет');
  const onTimeCol = findCol('timeon', 'ontime', 'on', 'touchdown', 'посадка');
  const inTimeCol = findCol('timein', 'intime', 'in', 'blockin', 'времяприлета');
  const totalTimeCol = findCol('totaltime', 'totalflighttime', 'blocktime', 'total', 'время');
  const picTimeCol = findCol('pictime', 'pic', 'квс');
  const sicTimeCol = findCol('sictime', 'sic', '2п', 'copilot', 'secondincommand');
  const nightTimeCol = findCol('nighttime', 'night', 'ночь');
  const ifrTimeCol = findCol('actualinstrument', 'instrument', 'ifrtime', 'ifr');
  const acTypeCol = findCol('aircrafttype', 'type', 'actype', 'aircraft', 'модель');
  const acRegCol = findCol('aircraftid', 'registration', 'tailnumber', 'reg', 'борт');
  const ldgDayCol = findCol('daylandingsfullstop', 'daylandings', 'landingsday', 'dayldg', 'посадкидень');
  const ldgNightCol = findCol('nightlandingsfullstop', 'nightlandings', 'landingsnight', 'nightldg', 'посадкиночь');
  const approachCol = findCol('approach1', 'approachtype', 'approach', 'заход');
  const remarksCol = findCol('pilotcomments', 'remarks', 'comments', 'notes', 'заметки');

  // Detect format name
  let formatName = 'CSV Logbook';
  const joinedHeaders = headers.join(' ');
  if (joinedHeaders.includes('flightdesignator') || joinedHeaders.includes('actualinstrument')) {
    formatName = 'LogTen Pro CSV';
  } else if (joinedHeaders.includes('daylandingsfullstop') || joinedHeaders.includes('pilotcomments')) {
    formatName = 'ForeFlight CSV';
  }

  const results: ParsedUniversalFlight[] = [];

  for (const row of dataRows) {
    if (row.length < 2 || row.every((c) => !c.trim())) continue;

    // Date
    const rawDate = dateCol !== -1 ? row[dateCol] : '';
    if (!rawDate) continue;
    const date = normalizeDateString(rawDate);

    // Route
    let depStr = depCol !== -1 ? row[depCol] : '';
    let arrStr = arrCol !== -1 ? row[arrCol] : '';

    if ((!depStr || !arrStr) && routeCol !== -1 && row[routeCol]) {
      const parts = row[routeCol].split(/[-/\s]+/);
      if (parts.length >= 2) {
        depStr = parts[0];
        arrStr = parts[parts.length - 1];
      }
    }

    if (!depStr || !arrStr) continue;

    const depIcao = await resolveAirportCode(depStr);
    const arrIcao = await resolveAirportCode(arrStr);

    // Times & Durations
    const totalTimeMinutes = totalTimeCol !== -1 ? parseDurationToMinutes(row[totalTimeCol]) : 0;
    const picMinutes = picTimeCol !== -1 ? parseDurationToMinutes(row[picTimeCol]) : 0;
    const sicMinutes = sicTimeCol !== -1 ? parseDurationToMinutes(row[sicTimeCol]) : 0;
    const nightMinutes = nightTimeCol !== -1 ? parseDurationToMinutes(row[nightTimeCol]) : 0;
    const ifrMinutes = ifrTimeCol !== -1 ? parseDurationToMinutes(row[ifrTimeCol]) : 0;

    let outTimeUtc = outTimeCol !== -1 && row[outTimeCol] ? normalizeTimeString(row[outTimeCol]) : '08:00';
    let inTimeUtc = inTimeCol !== -1 && row[inTimeCol] ? normalizeTimeString(row[inTimeCol]) : '';

    if (!inTimeUtc && totalTimeMinutes > 0) {
      inTimeUtc = addMinutesToTimeString(outTimeUtc, totalTimeMinutes);
    } else if (!inTimeUtc) {
      inTimeUtc = addMinutesToTimeString(outTimeUtc, 90);
    }

    // Role deduction
    let flightRole: ParsedUniversalFlight['flightRole'] = 'SIC';
    if (picMinutes > 0 && picMinutes >= sicMinutes) {
      flightRole = 'PIC';
    } else if (sicMinutes > 0) {
      flightRole = 'SIC';
    }

    // Aircraft & Reg
    const acTypeRaw = acTypeCol !== -1 ? row[acTypeCol] : '';
    const acType = acTypeRaw.toUpperCase().trim() || 'A320';

    const acRegRaw = acRegCol !== -1 ? row[acRegCol] : '';
    const acReg = acRegRaw.toUpperCase().trim() || 'RA-73001';

    // Landings
    const ldgDay = ldgDayCol !== -1 ? parseInt(row[ldgDayCol], 10) || 0 : 0;
    const ldgNight = ldgNightCol !== -1 ? parseInt(row[ldgNightCol], 10) || 0 : 0;

    results.push({
      id: generateUUID(),
      selected: true,
      date,
      flightNumber: fltNumCol !== -1 ? row[fltNumCol] : undefined,
      depIcao,
      arrIcao,
      outTimeUtc,
      offTimeUtc: offTimeCol !== -1 && row[offTimeCol] ? normalizeTimeString(row[offTimeCol]) : outTimeUtc,
      onTimeUtc: onTimeCol !== -1 && row[onTimeCol] ? normalizeTimeString(row[onTimeCol]) : inTimeUtc,
      inTimeUtc,
      totalTimeMinutes: totalTimeMinutes || 90,
      nightTimeMinutes: nightMinutes,
      ifrTimeMinutes: ifrMinutes,
      picTimeMinutes: picMinutes,
      sicTimeMinutes: sicMinutes,
      aircraftType: acType,
      aircraftReg: acReg,
      flightRole,
      flightHandling: 'PF',
      landingsDay: ldgDay,
      landingsNight: ldgNight,
      approachType: approachCol !== -1 ? row[approachCol] : undefined,
      remarks: remarksCol !== -1 ? row[remarksCol] : undefined,
      sourceFormat: formatName,
    });
  }

  return results;
}

/**
 * iCalendar (.ics / .ical) Roster Parser (AIMS e-Crew, Jeppesen, NetLine, Calendar exports)
 */
export async function parseIcalLogbook(icsContent: string): Promise<ParsedUniversalFlight[]> {
  const events = icsContent.split(/BEGIN:VEVENT/i).slice(1);
  const results: ParsedUniversalFlight[] = [];

  for (const evt of events) {
    const summaryMatch = evt.match(/SUMMARY.*?:([^\r\n]+)/i);
    const dtstartMatch = evt.match(/DTSTART.*?:([^\r\n]+)/i);
    const dtendMatch = evt.match(/DTEND.*?:([^\r\n]+)/i);
    const descMatch = evt.match(/DESCRIPTION.*?:([^\r\n]+)/i);
    const locMatch = evt.match(/LOCATION.*?:([^\r\n]+)/i);

    if (!summaryMatch || !dtstartMatch) continue;

    const summary = summaryMatch[1].trim();
    const dtstart = dtstartMatch[1].trim();
    const dtend = dtendMatch ? dtendMatch[1].trim() : '';
    const desc = descMatch ? descMatch[1].trim() : '';
    const loc = locMatch ? locMatch[1].trim() : '';

    // Filter out non-flight events (Off, Simulator, Ground School, Standby, Hotel)
    if (/^(OFF|DAY\s*OFF|LEAVE|VACATION|SIM|CHECK|GROUND|HOTEL|SBY|STANDBY|REST)/i.test(summary)) {
      continue;
    }

    // Extract Date and Times from DTSTART / DTEND (e.g. 20261015T080000Z or 20261015T080000)
    const startIsoMatch = dtstart.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})/);
    if (!startIsoMatch) continue;

    const date = `${startIsoMatch[1]}-${startIsoMatch[2]}-${startIsoMatch[3]}`;
    const outTimeUtc = `${startIsoMatch[4]}:${startIsoMatch[5]}`;

    let inTimeUtc = addMinutesToTimeString(outTimeUtc, 90);
    let totalMinutes = 90;

    if (dtend) {
      const endIsoMatch = dtend.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})/);
      if (endIsoMatch) {
        inTimeUtc = `${endIsoMatch[4]}:${endIsoMatch[5]}`;
        const startH = parseInt(startIsoMatch[4], 10);
        const startM = parseInt(startIsoMatch[5], 10);
        const endH = parseInt(endIsoMatch[4], 10);
        const endM = parseInt(endIsoMatch[5], 10);
        let diffM = (endH * 60 + endM) - (startH * 60 + startM);
        if (diffM < 0) diffM += 24 * 60; // Next day
        if (diffM > 0) totalMinutes = diffM;
      }
    }

    // Route search: Check SUMMARY (e.g. "SU1492 SVO-LED" or "SVO / LED") or LOCATION
    const textToSearch = `${summary} ${loc} ${desc}`;
    let depCode = '';
    let arrCode = '';

    const routePattern = textToSearch.match(/\b([A-Za-z]{3,4})\s*[-/]\s*([A-Za-z]{3,4})\b/);
    if (routePattern) {
      depCode = routePattern[1];
      arrCode = routePattern[2];
    } else {
      const codeMatches = textToSearch.match(/\b([A-Z]{3,4})\b/g)?.filter((c) => !/^(UTC|DAY|FLT|AND|AIR|AFL|AIMS|DUTY|CREW)$/i.test(c));
      if (codeMatches && codeMatches.length >= 2) {
        depCode = codeMatches[0];
        arrCode = codeMatches[1];
      }
    }

    if (!depCode || !arrCode) continue;

    const depIcao = await resolveAirportCode(depCode);
    const arrIcao = await resolveAirportCode(arrCode);

    // Flight number (e.g. SU1492, AFL2130, S7 1140)
    const fltNumMatch = textToSearch.match(/\b([A-Z0-9]{2,3}\s?\d{2,4})\b/);
    const flightNumber = fltNumMatch ? fltNumMatch[1].replace(/\s+/, '') : undefined;

    // Aircraft & Reg
    const acTypeMatch = textToSearch.match(/\b(A3\d\d|B7\d\d|SSJ|SU9|E\d\d\d|CRJ)\b/i);
    const acType = acTypeMatch ? acTypeMatch[1].toUpperCase() : 'A320';

    const acRegMatch = textToSearch.match(/\b(RA-\d{5}|VQ-[A-Z]{3}|VP-[A-Z]{3}|EI-[A-Z]{3}|TC-[A-Z]{3}|N\d{3,5}[A-Z]{0,2})\b/i);
    const acReg = acRegMatch ? acRegMatch[1].toUpperCase() : 'RA-73001';

    // Role
    let flightRole: ParsedUniversalFlight['flightRole'] = 'SIC';
    if (/\b(CPT|PIC|CAPTAIN|КВС)\b/i.test(textToSearch)) {
      flightRole = 'PIC';
    }

    results.push({
      id: generateUUID(),
      selected: true,
      date,
      flightNumber,
      depIcao,
      arrIcao,
      outTimeUtc,
      offTimeUtc: outTimeUtc,
      onTimeUtc: inTimeUtc,
      inTimeUtc,
      totalTimeMinutes: totalMinutes,
      nightTimeMinutes: 0,
      aircraftType: acType,
      aircraftReg: acReg,
      flightRole,
      flightHandling: 'PF',
      landingsDay: 1,
      landingsNight: 0,
      sourceFormat: 'iCalendar (.ics)',
      remarks: desc || summary,
    });
  }

  return results;
}
