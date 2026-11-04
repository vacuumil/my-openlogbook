import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { LocalFlight } from '../db/db';
import { PilotProfileData } from '../components/AuthModal';
import { formatMinutesToHHMM } from '../components/FlightList';
import { emptyLogbookTotals, LogbookPage, LogbookTotals, paginateLogbook } from '../utils/logbookPages';
import { entryTypeOf } from '../utils/entries';
import { toDateKey } from '../utils/dates';

export type LogbookFormat = 'easa' | 'ru';

const ROWS_PER_PAGE = 16;
const FONT = 'LiberationSans';

const hhmm = (minutes: number) => (minutes ? formatMinutesToHHMM(minutes) : '');
const count = (value: number) => (value ? String(value) : '');

const toBase64 = (buffer: ArrayBuffer) => {
  let binary = '';
  const bytes = new Uint8Array(buffer);
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
};

/** The built-in PDF fonts have no Cyrillic, so a TTF that covers it is embedded. */
async function registerFonts(doc: jsPDF) {
  const fonts: Array<[string, string]> = [
    ['LiberationSans-Regular.ttf', 'normal'],
    ['LiberationSans-Bold.ttf', 'bold'],
  ];
  for (const [file, style] of fonts) {
    const response = await fetch(`/fonts/${file}`);
    if (!response.ok) throw new Error(`Font ${file} is unavailable`);
    doc.addFileToVFS(file, toBase64(await response.arrayBuffer()));
    doc.addFont(file, FONT, style);
  }
  doc.setFont(FONT, 'normal');
}

function carriedInFrom(profile: PilotProfileData | undefined): LogbookTotals {
  return {
    ...emptyLogbookTotals(),
    totalMinutes: Math.round((profile?.previousTotalHours || 0) * 60),
    nightMinutes: Math.round((profile?.previousNightHours || 0) * 60),
    picMinutes: Math.round((profile?.previousPicHours || 0) * 60),
    copilotMinutes: Math.round((profile?.previousSicHours || 0) * 60),
    landingsDay: profile?.previousLandings || 0,
  };
}

const isSimulator = (entry: LocalFlight) => entryTypeOf(entry) === 'simulator';

interface Layout {
  title: string;
  head: any[][];
  row: (entry: LocalFlight) => string[];
  totals: (label: string, totals: LogbookTotals) => any[];
  certification: string;
  signature: string;
}

const LAYOUTS: Record<LogbookFormat, Layout> = {
  // Column order of the EASA pilot logbook, AMC1 FCL.050
  easa: {
    title: 'PILOT LOGBOOK',
    head: [
      [
        { content: 'DATE', rowSpan: 2 },
        { content: 'DEPARTURE', colSpan: 2 },
        { content: 'ARRIVAL', colSpan: 2 },
        { content: 'AIRCRAFT', colSpan: 2 },
        { content: 'TOTAL TIME OF FLIGHT', rowSpan: 2 },
        { content: 'LANDINGS', colSpan: 2 },
        { content: 'OPERATIONAL CONDITION', colSpan: 2 },
        { content: 'PILOT FUNCTION TIME', colSpan: 4 },
        { content: 'FSTD SESSION', colSpan: 2 },
        { content: 'REMARKS AND ENDORSEMENTS', rowSpan: 2 },
      ],
      ['PLACE', 'TIME', 'PLACE', 'TIME', 'TYPE', 'REG', 'DAY', 'NIGHT', 'NIGHT', 'IFR', 'PIC', 'CO-PILOT', 'DUAL', 'INSTR.', 'TYPE', 'TIME'],
    ],
    row: (entry) =>
      isSimulator(entry)
        ? [entry.date, '', '', '', '', '', '', '', count(entry.landingsDay), count(entry.landingsNight), '', '', '', '', '', '', `${entry.simDevice || 'FSTD'} ${entry.aircraftType}`, hhmm(entry.totalTimeMinutes), entry.remarks || '']
        : [
            entry.date,
            entry.depIcao,
            entry.outTimeUtc,
            entry.arrIcao,
            entry.inTimeUtc,
            entry.aircraftType,
            entry.aircraftReg,
            hhmm(entry.totalTimeMinutes),
            count(entry.landingsDay),
            count(entry.landingsNight),
            hhmm(entry.nightTimeMinutes),
            hhmm(entry.ifrTimeMinutes),
            hhmm((entry.picTimeMinutes || 0) + (entry.picusTimeMinutes || 0)),
            hhmm(entry.sicTimeMinutes),
            hhmm(entry.dualTimeMinutes),
            hhmm(entry.instructorTimeMinutes || 0),
            '',
            '',
            [entry.approachType, entry.remarks].filter(Boolean).join('; '),
          ],
    totals: (label, t) => [
      { content: label, colSpan: 7, styles: { halign: 'right' } },
      hhmm(t.totalMinutes),
      count(t.landingsDay),
      count(t.landingsNight),
      hhmm(t.nightMinutes),
      hhmm(t.ifrMinutes),
      hhmm(t.picMinutes),
      hhmm(t.copilotMinutes),
      hhmm(t.dualMinutes),
      hhmm(t.instructorMinutes),
      '',
      hhmm(t.simulatorMinutes),
      '',
    ],
    certification: 'I certify that the entries in this log are true.',
    signature: "Pilot's signature: ______________________________",
  },
  // Columns of a Russian pilot logbook page
  ru: {
    title: 'ЛЁТНАЯ КНИЖКА',
    head: [
      [
        { content: 'Дата', rowSpan: 2 },
        { content: 'Тип ВС', rowSpan: 2 },
        { content: 'Бортовой №', rowSpan: 2 },
        { content: 'Маршрут', rowSpan: 2 },
        { content: 'Налёт, ч:мин', colSpan: 4 },
        { content: 'Посадки', colSpan: 2 },
        { content: 'В качестве', colSpan: 3 },
        { content: 'Тренажёр', rowSpan: 2 },
        { content: 'Примечание', rowSpan: 2 },
      ],
      ['Всего', 'Днём', 'Ночью', 'По приборам', 'Днём', 'Ночью', 'КВС', '2-го пилота', 'Инстр.'],
    ],
    row: (entry) =>
      isSimulator(entry)
        ? [entry.date, entry.aircraftType, entry.simDevice || 'Тренажёр', '', '', '', '', '', count(entry.landingsDay), count(entry.landingsNight), '', '', '', hhmm(entry.totalTimeMinutes), entry.remarks || '']
        : [
            entry.date,
            entry.aircraftType,
            entry.aircraftReg,
            `${entry.depIcao} – ${entry.arrIcao}`,
            hhmm(entry.totalTimeMinutes),
            hhmm(Math.max(0, (entry.totalTimeMinutes || 0) - (entry.nightTimeMinutes || 0))),
            hhmm(entry.nightTimeMinutes),
            hhmm(entry.ifrTimeMinutes),
            count(entry.landingsDay),
            count(entry.landingsNight),
            hhmm((entry.picTimeMinutes || 0) + (entry.picusTimeMinutes || 0)),
            hhmm(entry.sicTimeMinutes),
            hhmm(entry.instructorTimeMinutes || 0),
            '',
            [entry.approachType, entry.remarks].filter(Boolean).join('; '),
          ],
    totals: (label, t) => [
      { content: label, colSpan: 4, styles: { halign: 'right' } },
      hhmm(t.totalMinutes),
      hhmm(Math.max(0, t.totalMinutes - t.nightMinutes)),
      hhmm(t.nightMinutes),
      hhmm(t.ifrMinutes),
      count(t.landingsDay),
      count(t.landingsNight),
      hhmm(t.picMinutes),
      hhmm(t.copilotMinutes),
      hhmm(t.instructorMinutes),
      hhmm(t.simulatorMinutes),
      '',
    ],
    certification: 'Записи в лётной книжке верны.',
    signature: 'Подпись пилота: ______________________________',
  },
};

const TOTAL_LABELS: Record<LogbookFormat, [string, string, string]> = {
  easa: ['TOTAL THIS PAGE', 'TOTAL FROM PREVIOUS PAGES', 'TOTAL TIME'],
  ru: ['Итого за страницу', 'Перенесено', 'Всего'],
};

function drawPage(doc: jsPDF, page: LogbookPage, pageCount: number, layout: Layout, format: LogbookFormat, holder: string) {
  const width = doc.internal.pageSize.getWidth();
  const height = doc.internal.pageSize.getHeight();
  const [pageLabel, forwardLabel, totalLabel] = TOTAL_LABELS[format];

  doc.setFont(FONT, 'bold');
  doc.setFontSize(11);
  doc.setTextColor(15, 23, 42);
  doc.text(layout.title, 10, 12);
  doc.setFont(FONT, 'normal');
  doc.setFontSize(8);
  doc.text(holder, 10, 17);

  autoTable(doc, {
    head: layout.head,
    body: page.entries.map(layout.row),
    foot: [
      layout.totals(pageLabel, page.page),
      layout.totals(forwardLabel, page.broughtForward),
      layout.totals(totalLabel, page.toDate),
    ],
    startY: 21,
    theme: 'grid',
    showFoot: 'lastPage',
    styles: { font: FONT, fontSize: 6.8, cellPadding: 1, lineColor: [150, 158, 170], lineWidth: 0.15, textColor: [15, 23, 42], valign: 'middle' },
    headStyles: { font: FONT, fontStyle: 'bold', fillColor: [226, 232, 240], textColor: [15, 23, 42], halign: 'center' },
    footStyles: { font: FONT, fontStyle: 'bold', fillColor: [241, 245, 249], textColor: [15, 23, 42] },
    margin: { left: 8, right: 8, bottom: 16 },
  });

  doc.setFontSize(7.5);
  doc.setTextColor(71, 85, 105);
  doc.text(layout.certification, 10, height - 10);
  doc.text(layout.signature, 10, height - 5);
  doc.text(`${page.number} / ${pageCount}`, width - 20, height - 5);
}

/** A paper-like logbook: fixed pages, each with its own totals and the totals carried forward. */
export async function buildLogbookPdf(entries: LocalFlight[], format: LogbookFormat, profile?: PilotProfileData): Promise<jsPDF> {
  const pages = paginateLogbook(entries, ROWS_PER_PAGE, carriedInFrom(profile));
  if (pages.length === 0) throw new Error('Нет записей для печати');

  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  await registerFonts(doc);

  const name = format === 'easa' ? profile?.fullNameEn || profile?.fullName : profile?.fullName || profile?.fullNameEn;
  const licence = profile?.licenseNumber ? `${format === 'easa' ? 'Licence' : 'Свидетельство'}: ${profile.licenseNumber}` : '';
  const holder = [name, licence].filter(Boolean).join('   ');

  pages.forEach((page, index) => {
    if (index > 0) doc.addPage();
    drawPage(doc, page, pages.length, LAYOUTS[format], format, holder);
  });

  return doc;
}

export async function printLogbook(entries: LocalFlight[], format: LogbookFormat, profile?: PilotProfileData) {
  const doc = await buildLogbookPdf(entries, format, profile);
  doc.save(`logbook-${format}-${toDateKey(new Date())}.pdf`);
}
