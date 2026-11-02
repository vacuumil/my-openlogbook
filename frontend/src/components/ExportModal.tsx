import React, { useState } from 'react';
import { X, FileText, Download, Calendar, Check, FileSpreadsheet } from 'lucide-react';
import { LocalFlight } from '../db/db';
import { exportService } from '../services/exportService';
import { getStoredPilotProfile } from './AuthModal';

interface ExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  flights: LocalFlight[];
}

type DateRangeFilter = 'all' | 'currentYear' | '90days' | '30days';

export const ExportModal: React.FC<ExportModalProps> = ({ isOpen, onClose, flights }) => {
  const [range, setRange] = useState<DateRangeFilter>('all');
  const [isExporting, setIsExporting] = useState(false);
  const [exportedFormat, setExportedFormat] = useState<string | null>(null);

  if (!isOpen) return null;

  const now = new Date();

  // Filter flights by selected range
  const filteredFlights = flights.filter((f) => {
    if (range === 'all') return true;
    const flightDate = new Date(f.date);
    if (range === 'currentYear') {
      return flightDate.getFullYear() === now.getFullYear();
    }
    if (range === '90days') {
      const cutOff = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
      return flightDate >= cutOff;
    }
    if (range === '30days') {
      const cutOff = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      return flightDate >= cutOff;
    }
    return true;
  });

  const handleExportPDF = () => {
    setIsExporting(true);
    const profile = getStoredPilotProfile();
    try {
      exportService.exportToPDF(filteredFlights, profile);
      setExportedFormat('PDF');
      setTimeout(() => setExportedFormat(null), 3000);
    } catch (err) {
      console.error('PDF export error:', err);
    } finally {
      setIsExporting(false);
    }
  };

  const handleExportCSV = () => {
    setIsExporting(true);
    const profile = getStoredPilotProfile();
    try {
      exportService.exportToCSV(filteredFlights, profile);
      setExportedFormat('Excel');
      setTimeout(() => setExportedFormat(null), 3000);
    } catch (err) {
      console.error('CSV export error:', err);
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4 overflow-y-auto">
      <div className="bg-avionics-surface border border-avionics-border rounded-t-3xl sm:rounded-2xl w-full max-w-md shadow-2xl overflow-hidden my-0 sm:my-8 max-h-[92vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 sm:px-6 py-3.5 sm:py-4 border-b border-avionics-border bg-avionics-card shrink-0">
          <div className="flex items-center space-x-2.5">
            <Download className="w-5 h-5 text-sky-400" />
            <h2 className="text-base md:text-lg font-bold text-avionics-text">
              Экспорт лётной книжки
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-avionics-muted hover:text-avionics-text rounded-lg hover:bg-avionics-surface transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-4 sm:p-6 space-y-4 sm:space-y-5 overflow-y-auto flex-1">
          {exportedFormat && (
            <div className="p-3 bg-emerald-950/40 border border-emerald-500/40 text-emerald-300 text-xs rounded-xl flex items-center space-x-2">
              <Check className="w-4 h-4" />
              <span>Файл {exportedFormat} успешно сформирован и скачан!</span>
            </div>
          )}

          {/* Date Range Selection */}
          <div className="space-y-2">
            <label className="block text-xs font-semibold text-avionics-muted flex items-center space-x-1.5">
              <Calendar className="w-3.5 h-3.5 text-sky-400" />
              <span>Период выгрузки</span>
            </label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setRange('all')}
                className={`py-2 px-3 text-xs font-bold rounded-xl border transition-all text-left ${
                  range === 'all'
                    ? 'bg-sky-500/20 text-sky-400 border-sky-500/40 shadow-sm'
                    : 'bg-avionics-card text-avionics-muted border-avionics-border hover:text-avionics-text'
                }`}
              >
                Все записи ({flights.length})
              </button>
              <button
                type="button"
                onClick={() => setRange('currentYear')}
                className={`py-2 px-3 text-xs font-bold rounded-xl border transition-all text-left ${
                  range === 'currentYear'
                    ? 'bg-sky-500/20 text-sky-400 border-sky-500/40 shadow-sm'
                    : 'bg-avionics-card text-avionics-muted border-avionics-border hover:text-avionics-text'
                }`}
              >
                {now.getFullYear()} год
              </button>
              <button
                type="button"
                onClick={() => setRange('90days')}
                className={`py-2 px-3 text-xs font-bold rounded-xl border transition-all text-left ${
                  range === '90days'
                    ? 'bg-sky-500/20 text-sky-400 border-sky-500/40 shadow-sm'
                    : 'bg-avionics-card text-avionics-muted border-avionics-border hover:text-avionics-text'
                }`}
              >
                Крайние 90 дней
              </button>
              <button
                type="button"
                onClick={() => setRange('30days')}
                className={`py-2 px-3 text-xs font-bold rounded-xl border transition-all text-left ${
                  range === '30days'
                    ? 'bg-sky-500/20 text-sky-400 border-sky-500/40 shadow-sm'
                    : 'bg-avionics-card text-avionics-muted border-avionics-border hover:text-avionics-text'
                }`}
              >
                Крайние 30 дней
              </button>
            </div>
            <div className="text-[11px] text-avionics-muted pt-1">
              Выбрано рейсов для экспорта:{' '}
              <strong className="text-avionics-text font-mono">{filteredFlights.length}</strong>
            </div>
          </div>

          {/* Export Options Cards */}
          <div className="space-y-3 pt-2">
            {/* EASA PDF Option */}
            <button
              type="button"
              onClick={handleExportPDF}
              disabled={isExporting || filteredFlights.length === 0}
              className="w-full p-4 bg-avionics-card hover:bg-avionics-surface active:bg-avionics-surface border border-avionics-border hover:border-sky-500/40 rounded-2xl flex items-center justify-between text-left transition-all group disabled:opacity-50 cursor-pointer"
            >
              <div className="flex items-center space-x-3.5">
                <div className="p-2.5 rounded-xl bg-sky-500/10 text-sky-400 group-hover:scale-105 transition-transform">
                  <FileText className="w-5 h-5" />
                </div>
                <div>
                  <div className="text-sm font-bold text-avionics-text">
                    EASA FCL.050 / FAA Logbook (PDF)
                  </div>
                  <div className="text-xs text-avionics-muted mt-0.5">
                    Официальный альбомный бланк A4 для продления квалификаций
                  </div>
                </div>
              </div>
              <Download className="w-4 h-4 text-avionics-muted group-hover:text-sky-400 transition-colors" />
            </button>

            {/* Excel CSV Option */}
            <button
              type="button"
              onClick={handleExportCSV}
              disabled={isExporting || filteredFlights.length === 0}
              className="w-full p-4 bg-avionics-card hover:bg-avionics-surface active:bg-avionics-surface border border-avionics-border hover:border-emerald-500/40 rounded-2xl flex items-center justify-between text-left transition-all group disabled:opacity-50 cursor-pointer"
            >
              <div className="flex items-center space-x-3.5">
                <div className="p-2.5 rounded-xl bg-emerald-500/10 text-emerald-400 group-hover:scale-105 transition-transform">
                  <FileSpreadsheet className="w-5 h-5" />
                </div>
                <div>
                  <div className="text-sm font-bold text-avionics-text">
                    Электронная таблица (Excel / CSV)
                  </div>
                  <div className="text-xs text-avionics-muted mt-0.5">
                    Полная выгрузка всех параметров рейсов с кодировкой UTF-8
                  </div>
                </div>
              </div>
              <Download className="w-4 h-4 text-avionics-muted group-hover:text-emerald-400 transition-colors" />
            </button>
          </div>

          <div className="pt-2 flex justify-end">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold text-avionics-muted hover:text-avionics-text"
            >
              Закрыть
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
