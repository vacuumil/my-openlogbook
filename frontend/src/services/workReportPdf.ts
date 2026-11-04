import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { WorkEntry } from '../db/db';
import { registerFonts } from './logbookPrint';
import {
  computeEntryMinutes,
  DutyWarning,
  formatDutyLength,
  MonthSummary,
  mskClock,
  utcClock,
  WORK_KIND_LABELS,
} from '../utils/workTime';

const FONT = 'LiberationSans';

const dayLabel = (date: string) => date.split('-').reverse().slice(0, 2).join('.');

const monthTitle = (month: string) => {
  const [year, number] = month.split('-').map(Number);
  const label = new Date(Date.UTC(year, number - 1, 1)).toLocaleDateString('ru-RU', { month: 'long', year: 'numeric', timeZone: 'UTC' });
  return label.charAt(0).toUpperCase() + label.slice(1);
};

/** Month report for checking against the pay slip: totals and norms, every duty, other work, warnings */
export async function buildWorkReportPdf(month: string, summary: MonthSummary, entries: WorkEntry[], warnings: DutyWarning[], holder = ''): Promise<jsPDF> {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  await registerFonts(doc);
  const styles = { font: FONT, fontSize: 8, cellPadding: 1.5 };
  const head = { fillColor: [14, 116, 144] as [number, number, number], textColor: 255, fontStyle: 'bold' as const };

  doc.setFont(FONT, 'bold');
  doc.setFontSize(14);
  doc.text(`Рабочее время — ${monthTitle(month)}`, 14, 16);
  doc.setFont(FONT, 'normal');
  doc.setFontSize(9);
  doc.text([holder, 'Время — UTC, в скобках московское. Нормы — справочно, по Приказу Минтранса № 139.'].filter(Boolean), 14, 22);

  const overtime = summary.overtimeMinutes;
  autoTable(doc, {
    startY: 30,
    styles,
    headStyles: head,
    head: [['Показатель', 'Значение']],
    body: [
      ['Рабочее время', formatDutyLength(summary.totalMinutes)],
      [`Норма месяца (36-часовая неделя${summary.normApproximate ? ', примерно' : ''})`, formatDutyLength(summary.normMinutes)],
      [overtime >= 0 ? 'Сверх нормы' : 'До нормы', formatDutyLength(Math.abs(overtime))],
      ['Полётное время (полёты + 50% пассажиром)', `${formatDutyLength(summary.flightTimeMinutes)} из ${summary.flightLimitMinutes / 60} ч`],
      ['Налёт (блок)', formatDutyLength(summary.blockMinutes)],
      ['Ночные часы (22:00–06:00 МСК)', formatDutyLength(summary.nightMinutes)],
      ['Смен с рейсами', String(summary.duties.length)],
      ['из них ночных / разделённых', `${summary.nightDuties} / ${summary.splitDuties}`],
      ['Рабочих дней', String(summary.workDays)],
    ],
    columnStyles: { 1: { halign: 'right' } },
    tableWidth: 120,
  });

  if (summary.duties.length > 0) {
    autoTable(doc, {
      startY: (doc as any).lastAutoTable.finalY + 6,
      styles,
      headStyles: head,
      head: [['Дата', 'Рейсы', 'Явка', 'Окончание', 'Рабочее', 'Полётное', 'Ночные', 'Отдых', 'Отметки']],
      body: summary.duties.map((duty) => [
        dayLabel(duty.date),
        duty.legs.map((leg) => leg.title).join(', '),
        `${utcClock(duty.startAt)} (${mskClock(duty.startAt)})`,
        `${utcClock(duty.endAt)} (${mskClock(duty.endAt)})`,
        formatDutyLength(duty.minutes),
        formatDutyLength(duty.flightTimeMinutes),
        formatDutyLength(duty.nightMinutes),
        duty.breakMinutes ? formatDutyLength(duty.breakMinutes) : '',
        [duty.isSplit && 'разделённая', duty.isNight && 'ночная', duty.medicalCheck && 'санчасть', duty.deadheadMinutes > 0 && 'пассажиром']
          .filter(Boolean)
          .join(', '),
      ]),
      columnStyles: { 1: { cellWidth: 46 }, 4: { halign: 'right' }, 5: { halign: 'right' }, 6: { halign: 'right' }, 7: { halign: 'right' } },
    });
  }

  const other = entries.filter((entry) => entry.kind !== 'flight').sort((a, b) => a.date.localeCompare(b.date) || a.start.localeCompare(b.start));
  if (other.length > 0) {
    autoTable(doc, {
      startY: (doc as any).lastAutoTable.finalY + 6,
      styles,
      headStyles: head,
      head: [['Дата', 'Вид', 'Описание', 'Время UTC', 'Часы']],
      body: other.map((entry) => [
        dayLabel(entry.date),
        WORK_KIND_LABELS[entry.kind],
        entry.title,
        entry.start ? `${entry.start}–${entry.end}` : 'весь день',
        entry.start ? formatDutyLength(computeEntryMinutes(entry.start, entry.end)) : '',
      ]),
    });
  }

  if (warnings.length > 0) {
    autoTable(doc, {
      startY: (doc as any).lastAutoTable.finalY + 6,
      styles,
      headStyles: { ...head, fillColor: [180, 83, 9] as [number, number, number] },
      head: [['Дата', 'Проверьте']],
      body: warnings.map((warning) => [warning.date ? dayLabel(warning.date) : 'месяц', warning.message]),
      columnStyles: { 0: { cellWidth: 18 } },
    });
  }

  const pages = doc.getNumberOfPages();
  for (let page = 1; page <= pages; page++) {
    doc.setPage(page);
    doc.setFontSize(7);
    doc.setTextColor(120);
    doc.text(`OpenLogBook · ${page} / ${pages}`, 196, 290, { align: 'right' });
  }
  return doc;
}
