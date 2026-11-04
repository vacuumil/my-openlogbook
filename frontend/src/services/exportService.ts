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
};
