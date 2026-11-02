import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { LocalFlight } from '../db/db';
import { formatMinutesToHHMM } from '../components/FlightList';
import { PilotProfileData } from '../components/AuthModal';

export const exportService = {
  /**
   * Export flights to CSV / Excel (with UTF-8 BOM for Microsoft Excel compatibility)
   */
  exportToCSV(flights: LocalFlight[], profile?: PilotProfileData) {
    const headers = [
      'Дата',
      'Вылет ICAO',
      'Прилет ICAO',
      'OUT (UTC)',
      'OFF (UTC)',
      'ON (UTC)',
      'IN (UTC)',
      'Block Time (ЧЧ:ММ)',
      'Block (Минуты)',
      'Ночной налет (ЧЧ:ММ)',
      'IFR (ЧЧ:ММ)',
      'PIC (КВС)',
      'SIC (2-й пилот)',
      'PICUS',
      'Dual',
      'Instructor',
      'Роль экипажа',
      'Управление (PF/PM)',
      'Тип ВС',
      'Бортовой №',
      'Посадки день',
      'Посадки ночь',
      'Заход',
      'Примечания',
    ];

    const rows = flights.map((f) => [
      f.date,
      f.depIcao,
      f.arrIcao,
      f.outTimeUtc,
      f.offTimeUtc,
      f.onTimeUtc,
      f.inTimeUtc,
      formatMinutesToHHMM(f.totalTimeMinutes),
      f.totalTimeMinutes,
      formatMinutesToHHMM(f.nightTimeMinutes),
      formatMinutesToHHMM(f.ifrTimeMinutes),
      formatMinutesToHHMM(f.picTimeMinutes),
      formatMinutesToHHMM(f.sicTimeMinutes),
      formatMinutesToHHMM(f.picusTimeMinutes),
      formatMinutesToHHMM(f.dualTimeMinutes),
      formatMinutesToHHMM(f.instructorTimeMinutes || 0),
      f.flightRole || 'SIC',
      f.flightHandling || 'PF',
      f.aircraftType,
      f.aircraftReg,
      f.landingsDay,
      f.landingsNight,
      `"${(f.approachType || '').replace(/"/g, '""')}"`,
      `"${(f.remarks || '').replace(/"/g, '""')}"`,
    ]);

    // Prepend UTF-8 BOM so Excel opens Cyrillic without garbling
    const csvContent =
      '\uFEFF' +
      [
        `# PILOT LOGBOOK EXPORT;Pilot: ${profile?.fullNameEn || profile?.fullName || 'Pilot'};License: ${profile?.licenseNumber || ''};Airline: ${profile?.airline || ''}`,
        headers.join(';'),
        ...rows.map((row) => row.join(';')),
      ].join('\r\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    const nameSlug = (profile?.fullNameEn || profile?.fullName || 'Pilot').replace(/[^a-zA-Z0-9_-]/g, '_');
    link.setAttribute(
      'download',
      `LogBook_${nameSlug}_${new Date().toISOString().split('T')[0]}.csv`
    );
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  },

  /**
   * Export flights to official printable PDF format (EASA FCL.050 / FAA Part 61 layout)
   */
  exportToPDF(flights: LocalFlight[], profile?: PilotProfileData) {
    const doc = new jsPDF({
      orientation: 'landscape',
      unit: 'mm',
      format: 'a4',
    });

    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const todayStr = new Date().toISOString().split('T')[0];

    // Profile Details
    const pilotNameLatin = (profile?.fullNameEn || profile?.fullName || 'PILOT').toUpperCase();
    const licenseNumber = profile?.licenseNumber || '';
    const licenseType = profile?.licenseType || 'ATPL';
    const airline = (profile?.airline || 'COMMERCIAL AVIATION').toUpperCase();

    // Previous Hours Brought Forward
    const prevTotalMins = Math.round((profile?.previousTotalHours || 0) * 60);
    const prevPicMins = Math.round((profile?.previousPicHours || 0) * 60);
    const prevSicMins = Math.round((profile?.previousSicHours || 0) * 60);
    const prevNightMins = Math.round((profile?.previousNightHours || 0) * 60);
    const prevLandings = profile?.previousLandings || 0;

    // Header Drawing
    doc.setFillColor(15, 23, 42); // Slate 900
    doc.rect(10, 8, pageWidth - 20, 18, 'F');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(255, 255, 255);
    doc.text('PILOT LOGBOOK', 14, 15);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(203, 213, 225); // Slate 300
    doc.text(
      `HOLDER: ${pilotNameLatin}   |   LIC: ${licenseNumber} (${licenseType})   |   OPR: ${airline}   |   DATE: ${todayStr}`,
      14,
      21
    );

    // Sum flights in export
    const totalFlownMins = flights.reduce((sum, f) => sum + (f.totalTimeMinutes || 0), 0);
    const nightFlownMins = flights.reduce((sum, f) => sum + (f.nightTimeMinutes || 0), 0);
    const ifrFlownMins = flights.reduce((sum, f) => sum + (f.ifrTimeMinutes || 0), 0);
    const picFlownMins = flights.reduce((sum, f) => sum + (f.picTimeMinutes || 0), 0);
    const sicFlownMins = flights.reduce((sum, f) => sum + (f.sicTimeMinutes || 0), 0);
    const dayLand = flights.reduce((sum, f) => sum + (f.landingsDay || 0), 0);
    const nightLand = flights.reduce((sum, f) => sum + (f.landingsNight || 0), 0);

    const tableHeaders = [
      [
        { content: 'DATE', rowSpan: 2, styles: { valign: 'middle', halign: 'center' } },
        { content: 'DEPARTURE', colSpan: 2, styles: { halign: 'center' } },
        { content: 'ARRIVAL', colSpan: 2, styles: { halign: 'center' } },
        { content: 'AIRCRAFT', colSpan: 2, styles: { halign: 'center' } },
        { content: 'TOTAL TIME', rowSpan: 2, styles: { valign: 'middle', halign: 'center' } },
        { content: 'CONDITIONS', colSpan: 2, styles: { halign: 'center' } },
        { content: 'PILOT FUNCTION TIME', colSpan: 3, styles: { halign: 'center' } },
        { content: 'LANDINGS', colSpan: 2, styles: { halign: 'center' } },
        { content: 'REMARKS & ENDORSEMENTS', rowSpan: 2, styles: { valign: 'middle', halign: 'center' } },
      ],
      [
        { content: 'ICAO', styles: { halign: 'center' } },
        { content: 'OUT', styles: { halign: 'center' } },
        { content: 'ICAO', styles: { halign: 'center' } },
        { content: 'IN', styles: { halign: 'center' } },
        { content: 'TYPE', styles: { halign: 'center' } },
        { content: 'REG', styles: { halign: 'center' } },
        { content: 'NIGHT', styles: { halign: 'center' } },
        { content: 'IFR', styles: { halign: 'center' } },
        { content: 'PIC', styles: { halign: 'center' } },
        { content: 'SIC', styles: { halign: 'center' } },
        { content: 'FUNCTION', styles: { halign: 'center' } },
        { content: 'DAY', styles: { halign: 'center' } },
        { content: 'NIGHT', styles: { halign: 'center' } },
      ],
    ];

    const tableRows = flights.map((f) => [
      f.date,
      f.depIcao,
      f.outTimeUtc,
      f.arrIcao,
      f.inTimeUtc,
      f.aircraftType,
      f.aircraftReg,
      formatMinutesToHHMM(f.totalTimeMinutes),
      formatMinutesToHHMM(f.nightTimeMinutes),
      formatMinutesToHHMM(f.ifrTimeMinutes),
      formatMinutesToHHMM(f.picTimeMinutes),
      formatMinutesToHHMM(f.sicTimeMinutes),
      `${f.flightRole || 'SIC'} (${f.flightHandling || 'PF'})`,
      f.landingsDay.toString(),
      f.landingsNight.toString(),
      f.approachType ? `${f.approachType}; ${f.remarks || ''}` : f.remarks || '',
    ]);

    // Footer summary rows
    const footerRows: any[] = [];

    // 1. Time brought forward
    if (prevTotalMins > 0) {
      footerRows.push([
        { content: 'TIME BROUGHT FORWARD (PREVIOUS LOGBOOK)', colSpan: 7, styles: { halign: 'right', fontStyle: 'bold' } },
        formatMinutesToHHMM(prevTotalMins),
        formatMinutesToHHMM(prevNightMins),
        '-',
        formatMinutesToHHMM(prevPicMins),
        formatMinutesToHHMM(prevSicMins),
        'TRANSFER',
        prevLandings.toString(),
        '-',
        'Official career hours transfer',
      ]);
    }

    // 2. This page / export total
    footerRows.push([
      { content: 'TOTAL FOR THIS LOGBOOK PERIOD', colSpan: 7, styles: { halign: 'right', fontStyle: 'bold' } },
      formatMinutesToHHMM(totalFlownMins),
      formatMinutesToHHMM(nightFlownMins),
      formatMinutesToHHMM(ifrFlownMins),
      formatMinutesToHHMM(picFlownMins),
      formatMinutesToHHMM(sicFlownMins),
      `${flights.length} FLTS`,
      dayLand.toString(),
      nightLand.toString(),
      'Certified flight records',
    ]);

    // 3. Grand total to date
    footerRows.push([
      { content: 'TOTAL TO DATE (GRAND TOTAL)', colSpan: 7, styles: { halign: 'right', fontStyle: 'bold', fillColor: [226, 232, 240] } },
      { content: formatMinutesToHHMM(totalFlownMins + prevTotalMins), styles: { fontStyle: 'bold', fillColor: [226, 232, 240] } },
      { content: formatMinutesToHHMM(nightFlownMins + prevNightMins), styles: { fontStyle: 'bold', fillColor: [226, 232, 240] } },
      { content: formatMinutesToHHMM(ifrFlownMins), styles: { fontStyle: 'bold', fillColor: [226, 232, 240] } },
      { content: formatMinutesToHHMM(picFlownMins + prevPicMins), styles: { fontStyle: 'bold', fillColor: [226, 232, 240] } },
      { content: formatMinutesToHHMM(sicFlownMins + prevSicMins), styles: { fontStyle: 'bold', fillColor: [226, 232, 240] } },
      { content: 'ALL-TIME', styles: { fontStyle: 'bold', fillColor: [226, 232, 240] } },
      { content: (dayLand + prevLandings).toString(), styles: { fontStyle: 'bold', fillColor: [226, 232, 240] } },
      { content: nightLand.toString(), styles: { fontStyle: 'bold', fillColor: [226, 232, 240] } },
      { content: 'Verified career total', styles: { fontStyle: 'bold', fillColor: [226, 232, 240] } },
    ]);

    autoTable(doc, {
      head: tableHeaders as any,
      body: tableRows,
      foot: footerRows,
      startY: 28,
      theme: 'grid',
      styles: {
        fontSize: 7.5,
        cellPadding: 1.5,
        lineColor: [180, 185, 195],
        lineWidth: 0.15,
        textColor: [15, 23, 42],
      },
      headStyles: {
        fillColor: [15, 23, 42],
        textColor: [255, 255, 255],
        fontStyle: 'bold',
      },
      footStyles: {
        fillColor: [241, 245, 249],
        textColor: [15, 23, 42],
        fontStyle: 'bold',
      },
      alternateRowStyles: {
        fillColor: [248, 250, 252],
      },
      margin: { left: 10, right: 10, bottom: 20 },
      didDrawPage: (data) => {
        // Certification & Signature block at the bottom
        doc.setFontSize(8);
        doc.setFont('helvetica', 'italic');
        doc.setTextColor(71, 85, 105);
        doc.text(
          'I certify that the entries in this logbook are true, correct and complete to the best of my knowledge.',
          14,
          pageHeight - 12
        );

        doc.setFont('helvetica', 'normal');
        doc.text(
          'Pilot Signature: _____________________________________   Date: ________________________',
          14,
          pageHeight - 6
        );

        doc.text(
          `Page ${data.pageNumber} — OpenLogBook`,
          pageWidth - 65,
          pageHeight - 6
        );
      },
    });

    const nameSlug = pilotNameLatin.replace(/[^a-zA-Z0-9_-]/g, '_');
    doc.save(`OpenLogBook_${nameSlug}_${todayStr}.pdf`);
  },
};
