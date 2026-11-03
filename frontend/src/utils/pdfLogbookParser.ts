import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';
import pdfjsWorker from 'pdfjs-dist/legacy/build/pdf.worker.min.mjs?url';
import { generateUUID } from './uuid';
import { resolveAirportCode } from './rosterParser';

// Set up pdf.js worker using Vite asset URL
pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorker;

export interface ParsedPdfFlight {
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
  aircraftType: string;
  aircraftReg: string;
  flightRole: 'PIC' | 'SIC' | 'PICUS' | 'Dual' | 'Instructor' | 'Observer';
  flightHandling: 'PF' | 'PM' | 'Observer' | 'Relief';
  landingsDay: number;
  landingsNight: number;
  approachType?: string;
  remarks?: string;
}

interface TextItem {
  str: string;
  x: number;
  y: number;
  width: number;
}

// Convert various date formats (DD/MM/YYYY, DD.MM.YYYY, YYYY-MM-DD, DD-MMM-YYYY) to YYYY-MM-DD
function parseDate(raw: string): string | null {
  const trimmed = raw.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;

  // DD.MM.YYYY or DD/MM/YYYY or DD-MM-YYYY
  const dmyMatch = trimmed.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})$/);
  if (dmyMatch) {
    const day = dmyMatch[1].padStart(2, '0');
    const month = dmyMatch[2].padStart(2, '0');
    let year = dmyMatch[3];
    if (year.length === 2) {
      year = parseInt(year, 10) > 70 ? `19${year}` : `20${year}`;
    }
    return `${year}-${month}-${day}`;
  }

  // DD-MMM-YYYY (e.g., 14-OCT-2024 or 14-Oct-24)
  const monthMap: Record<string, string> = {
    JAN: '01', FEB: '02', MAR: '03', APR: '04', MAY: '05', JUN: '06',
    JUL: '07', AUG: '08', SEP: '09', OCT: '10', NOV: '11', DEC: '12',
    ЯНВ: '01', ФЕВ: '02', МАР: '03', АПР: '04', МАЙ: '05', ИЮН: '06',
    ИЮЛ: '07', АВГ: '08', СЕН: '09', ОКТ: '10', НОЯ: '11', ДЕК: '12',
  };
  const mmmMatch = trimmed.toUpperCase().match(/^(\d{1,2})[-/\s]?([A-ZА-Я]{3})[-/\s]?(\d{2,4})$/);
  if (mmmMatch) {
    const day = mmmMatch[1].padStart(2, '0');
    const mStr = mmmMatch[2];
    let year = mmmMatch[3];
    if (year.length === 2) {
      year = parseInt(year, 10) > 70 ? `19${year}` : `20${year}`;
    }
    const month = monthMap[mStr];
    if (month) return `${year}-${month}-${day}`;
  }

  return null;
}

// Convert "HH:MM", "HHMM", or decimal hours "1.5" to minutes
function parseTimeToMinutes(str: string): number {
  if (!str) return 0;
  const s = str.trim();
  if (s.includes(':')) {
    const [h, m] = s.split(':').map((v) => parseInt(v, 10) || 0);
    return h * 60 + m;
  }
  if (/^\d{4}$/.test(s)) {
    const h = parseInt(s.substring(0, 2), 10);
    const m = parseInt(s.substring(2, 4), 10);
    return h * 60 + m;
  }
  const dec = parseFloat(s);
  if (!isNaN(dec)) {
    return Math.round(dec * 60);
  }
  return 0;
}

// Format minutes to "HH:MM"
function formatMinutes(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
}

// Extract lines of text from PDF page by clustering items with similar Y coordinates
async function extractLinesFromPdf(fileData: ArrayBuffer): Promise<string[]> {
  const loadingTask = pdfjsLib.getDocument({ data: fileData });
  const pdfDoc = await loadingTask.promise;
  const lines: string[] = [];

  for (let pageNum = 1; pageNum <= pdfDoc.numPages; pageNum++) {
    const page = await pdfDoc.getPage(pageNum);
    const content = await page.getTextContent();

    const items: TextItem[] = [];
    for (const item of content.items) {
      if ('str' in item && typeof item.str === 'string') {
        const text = item.str.trim();
        if (text.length > 0) {
          items.push({
            str: item.str,
            x: item.transform[4],
            y: item.transform[5],
            width: item.width || 0,
          });
        }
      }
    }

    // Group items into rows by Y (within 3 points tolerance)
    items.sort((a, b) => b.y - a.y || a.x - b.x);

    const rows: TextItem[][] = [];
    let currentRow: TextItem[] = [];
    let currentY: number | null = null;

    for (const item of items) {
      if (currentY === null || Math.abs(item.y - currentY) <= 3.5) {
        currentRow.push(item);
        if (currentY === null) currentY = item.y;
      } else {
        // Sort items in previous row by X ascending
        currentRow.sort((a, b) => a.x - b.x);
        rows.push(currentRow);
        currentRow = [item];
        currentY = item.y;
      }
    }
    if (currentRow.length > 0) {
      currentRow.sort((a, b) => a.x - b.x);
      rows.push(currentRow);
    }

    // Join each row into a single space-separated line
    for (const row of rows) {
      const lineStr = row.map((it) => it.str).join(' ').trim();
      if (lineStr.length > 0) {
        lines.push(lineStr);
      }
    }
  }

  return lines;
}

/**
 * Parse an uploaded logbook PDF file into a list of flights.
 * Supports LogTen Pro, ForeFlight, Safelog, CrewLounge, EASA/FAA logbook formats.
 */
export async function parsePdfLogbook(file: File): Promise<ParsedPdfFlight[]> {
  const arrayBuffer = await file.arrayBuffer();
  const rawLines = await extractLinesFromPdf(arrayBuffer);

  const parsedFlights: ParsedPdfFlight[] = [];

  // Regex patterns
  const dateRegex = /\b(\d{4}[-/.]\d{1,2}[-/.]\d{1,2}|\d{1,2}[-/.]\d{1,2}[-/.]\d{2,4}|\d{1,2}[-/.\s][A-Za-zА-Яа-я]{3}[-/.\s]\d{2,4})\b/;
  const icaoPairRegex = /\b([A-Z]{3,4})\s*[-/—–\s]+\s*([A-Z]{3,4})\b/;
  const timeRegex = /\b([0-2]?\d:[0-5]\d)\b/g;
  const regRegex = /\b([A-Z0-9]{1,2}-[A-Z0-9]{3,5}|RA-\d{5}|N\d{2,5}[A-Z]{0,2}|VP-[A-Z]{3}|VQ-[A-Z]{3})\b/i;
  const typeRegex = /\b(A3[123458]0|A220|B7[345678]7[A-Z0-9]*|B738|B77W|B744|B788|B789|C172|C152|C182|PA28|PA34|DA40|DA42|CRJ[279]00?|E190|E195|SU95|SSJ100|L410|AT72|AT76|DHC8|Q400)\b/i;
  const roleRegex = /\b(PIC|SIC|PICUS|DUAL|INST|INSTRUCTOR|P1|P2|CPT|FO|COPILOT|OBSERVER|OBS)\b/i;
  const approachRegex = /\b(ILS(?:\s*CAT\s*[I|II|III|A|B|C]+)?|RNP|RNAV|GLS|VOR(?:\/DME)?|NDB|VISUAL|CIRCLING|PAR)\b/i;

  for (const line of rawLines) {
    // Skip table header / footer lines
    const upperLine = line.toUpperCase();
    if (
      upperLine.includes('TOTAL') && (upperLine.includes('PAGE') || upperLine.includes('CARRIED FORWARD') || upperLine.includes('TIME FORWARD')) ||
      upperLine.includes('DATE') && (upperLine.includes('DEPARTURE') || upperLine.includes('AIRCRAFT') || upperLine.includes('REMARKS')) ||
      upperLine.includes('PILOT LOGBOOK') || upperLine.includes('FLIGHT LOG')
    ) {
      continue;
    }

    const dateMatch = line.match(dateRegex);
    if (!dateMatch) continue;

    const parsedDate = parseDate(dateMatch[1]);
    if (!parsedDate) continue;

    // Remaining text after removing date
    const remainingAfterDate = line.replace(dateMatch[0], ' ');

    // Match departure and arrival airports
    let depCode = '';
    let arrCode = '';

    const pairMatch = remainingAfterDate.match(icaoPairRegex);
    if (pairMatch) {
      depCode = pairMatch[1].toUpperCase();
      arrCode = pairMatch[2].toUpperCase();
    } else {
      // Find all 3 or 4 uppercase letter tokens
      const words = remainingAfterDate.match(/\b[A-Z]{3,4}\b/g) || [];
      const airportCandidates = words.filter(
        (w) =>
          !['DATE', 'TIME', 'TOTAL', 'NIGHT', 'LAND', 'PAGE', 'DUAL', 'INST', 'TYPE', 'REGS', 'NOTE', 'INFO'].includes(w)
      );
      if (airportCandidates.length >= 2 && airportCandidates[0] && airportCandidates[1]) {
        depCode = airportCandidates[0];
        arrCode = airportCandidates[1];
      }
    }

    if (!depCode || !arrCode || (depCode === arrCode && depCode.length < 4)) {
      continue;
    }

    // Resolve ICAO / IATA
    const depIcao = await resolveAirportCode(depCode);
    const arrIcao = await resolveAirportCode(arrCode);

    // Times extraction
    const times = remainingAfterDate.match(timeRegex) || [];
    let outTimeUtc = '10:00';
    let inTimeUtc = '12:00';
    let totalMinutes = 0;

    if (times.length >= 2 && times[0] && times[1]) {
      outTimeUtc = times[0];
      inTimeUtc = times[1];
      const mOut = parseTimeToMinutes(outTimeUtc);
      const mIn = parseTimeToMinutes(inTimeUtc);
      totalMinutes = mIn >= mOut ? mIn - mOut : mIn + 24 * 60 - mOut;
    }

    // Check for decimal hours (e.g. " 1.8 " or " 2.5 ")
    if (totalMinutes === 0) {
      const decimals = remainingAfterDate.match(/\b([0-1]?\d\.\d{1,2})\b/g);
      if (decimals && decimals.length > 0) {
        totalMinutes = Math.round(parseFloat(decimals[0]) * 60);
      }
    }

    if (totalMinutes === 0) {
      totalMinutes = 120; // Default reasonable block time
    }

    // Night minutes
    let nightMinutes = 0;
    const nightMatch = remainingAfterDate.match(/NIGHT[:\s]+([0-2]?\d:[0-5]\d|\d+\.\d+)/i);
    if (nightMatch) {
      nightMinutes = parseTimeToMinutes(nightMatch[1]);
    }

    // Aircraft Reg & Type
    const regMatch = remainingAfterDate.match(regRegex);
    const aircraftReg = regMatch ? regMatch[1].toUpperCase() : 'RA-73000';

    const typeMatch = remainingAfterDate.match(typeRegex);
    const aircraftType = typeMatch ? typeMatch[1].toUpperCase() : 'A320';

    // Role
    let flightRole: ParsedPdfFlight['flightRole'] = 'SIC';
    const roleMatch = remainingAfterDate.match(roleRegex);
    if (roleMatch) {
      const r = roleMatch[1].toUpperCase();
      if (r === 'PIC' || r === 'P1' || r === 'CPT') flightRole = 'PIC';
      else if (r === 'SIC' || r === 'P2' || r === 'FO' || r === 'COPILOT') flightRole = 'SIC';
      else if (r === 'PICUS') flightRole = 'PICUS';
      else if (r === 'DUAL') flightRole = 'Dual';
      else if (r === 'INST' || r === 'INSTRUCTOR') flightRole = 'Instructor';
      else if (r === 'OBS' || r === 'OBSERVER') flightRole = 'Observer';
    }

    // Landings
    let landingsDay = 1;
    let landingsNight = 0;
    const landingMatch = remainingAfterDate.match(/(\d+)\s*(?:D|DAY)?\s*[/,]\s*(\d+)\s*(?:N|NIGHT)?/i);
    if (landingMatch) {
      landingsDay = parseInt(landingMatch[1], 10) || 0;
      landingsNight = parseInt(landingMatch[2], 10) || 0;
    }

    // Approach Type
    let approachType: string | undefined;
    const appMatch = remainingAfterDate.match(approachRegex);
    if (appMatch) {
      approachType = appMatch[1].toUpperCase();
    }

    parsedFlights.push({
      id: generateUUID(),
      selected: true,
      date: parsedDate,
      depIcao,
      arrIcao,
      outTimeUtc,
      inTimeUtc,
      totalTimeMinutes: totalMinutes,
      nightTimeMinutes: Math.min(nightMinutes, totalMinutes),
      aircraftType,
      aircraftReg,
      flightRole,
      flightHandling: 'PF',
      landingsDay,
      landingsNight,
      approachType,
      remarks: 'Импортировано из PDF лётной книжки',
    });
  }

  return parsedFlights;
}

/** Text lines of any PDF, for documents other than logbooks. An empty result means a scan without text. */
export async function extractPdfLines(file: File): Promise<string[]> {
  return extractLinesFromPdf(await file.arrayBuffer());
}
