import React, { useState } from 'react';
import { X, Upload, Check, Plane, Clock, ShieldCheck, ArrowRight, Loader2, Sparkles, FileText } from 'lucide-react';
import { db, LocalFlight } from '../db/db';
import { parseRosterText, ParsedRosterFlight } from '../utils/rosterParser';
import { formatMinutesToHHMM } from './FlightList';
import { syncEngine } from '../services/syncEngine';

interface RosterImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onImportComplete: () => void;
}

const SAMPLE_ROSTER = `2026-10-15 SU1492 SVO LED 08:00 09:30 A320 RA-73001
2026-10-15 SU1493 LED SVO 11:00 12:35 A320 RA-73001
2026-10-16 SU2130 SVO IST 14:15 19:00 A321 RA-73702
2026-10-16 SU2131 IST SVO 20:30 01:10 A321 RA-73702
2026-10-18 AFL200 SVO DXB 07:20 13:45 B738 RA-73305`;

export const RosterImportModal: React.FC<RosterImportModalProps> = ({
  isOpen,
  onClose,
  onImportComplete,
}) => {
  const [inputText, setInputText] = useState('');
  const [parsedFlights, setParsedFlights] = useState<ParsedRosterFlight[]>([]);
  const [isParsing, setIsParsing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [importCount, setImportCount] = useState<number | null>(null);

  if (!isOpen) return null;

  const handleParse = async () => {
    if (!inputText.trim()) return;
    setIsParsing(true);
    try {
      const results = await parseRosterText(inputText);
      setParsedFlights(results);
    } catch (err) {
      console.error('Roster parse error:', err);
    } finally {
      setIsParsing(false);
    }
  };

  const handleLoadSample = () => {
    setInputText(SAMPLE_ROSTER);
    parseRosterText(SAMPLE_ROSTER).then(setParsedFlights);
  };

  const handleToggleSelectAll = (checked: boolean) => {
    setParsedFlights((prev) => prev.map((f) => ({ ...f, selected: checked })));
  };

  const handleToggleFlight = (id: string) => {
    setParsedFlights((prev) =>
      prev.map((f) => (f.id === id ? { ...f, selected: !f.selected } : f))
    );
  };

  const handleUpdateFlight = (id: string, updates: Partial<ParsedRosterFlight>) => {
    setParsedFlights((prev) =>
      prev.map((f) => (f.id === id ? { ...f, ...updates } : f))
    );
  };

  const handleImport = async () => {
    const selected = parsedFlights.filter((f) => f.selected);
    if (selected.length === 0) return;

    setIsSaving(true);
    try {
      const newLocalFlights: LocalFlight[] = selected.map((f) => ({
        id: crypto.randomUUID(),
        date: f.date,
        depIcao: f.depIcao.toUpperCase().trim(),
        arrIcao: f.arrIcao.toUpperCase().trim(),
        outTimeUtc: f.outTimeUtc,
        offTimeUtc: f.offTimeUtc,
        onTimeUtc: f.onTimeUtc,
        inTimeUtc: f.inTimeUtc,
        totalTimeMinutes: f.totalTimeMinutes,
        nightTimeMinutes: 0,
        ifrTimeMinutes: f.totalTimeMinutes,
        picTimeMinutes: f.flightRole === 'PIC' ? f.totalTimeMinutes : 0,
        sicTimeMinutes: f.flightRole === 'SIC' ? f.totalTimeMinutes : 0,
        picusTimeMinutes: f.flightRole === 'PICUS' ? f.totalTimeMinutes : 0,
        dualTimeMinutes: f.flightRole === 'Dual' ? f.totalTimeMinutes : 0,
        instructorTimeMinutes: f.flightRole === 'Instructor' ? f.totalTimeMinutes : 0,
        flightRole: f.flightRole,
        flightHandling: f.flightHandling,
        landingsDay: 1,
        landingsNight: 0,
        aircraftReg: f.aircraftReg.toUpperCase().trim(),
        aircraftType: f.aircraftType.toUpperCase().trim(),
        approachType: 'ILS CAT IIIB',
        remarks: f.flightNumber ? `Flight ${f.flightNumber}` : 'Imported roster',
        syncStatus: 'created',
        updatedAt: new Date().toISOString(),
      }));

      await db.flights.bulkAdd(newLocalFlights);
      setImportCount(newLocalFlights.length);
      syncEngine.syncNow();
      onImportComplete();

      setTimeout(() => {
        onClose();
        setImportCount(null);
        setParsedFlights([]);
        setInputText('');
      }, 1500);
    } catch (err) {
      console.error('Import save error:', err);
    } finally {
      setIsSaving(false);
    }
  };

  const selectedCount = parsedFlights.filter((f) => f.selected).length;

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-avionics-surface border border-avionics-border rounded-2xl w-full max-w-3xl shadow-2xl overflow-hidden my-8">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-avionics-border bg-avionics-card">
          <div className="flex items-center space-x-2.5">
            <Upload className="w-5 h-5 text-sky-400" />
            <h2 className="text-base md:text-lg font-bold text-avionics-text">
              Умный импорт ростера (e-Crew / AIMS / CSV)
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-avionics-muted hover:text-avionics-text rounded-lg hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-5">
          {importCount !== null && (
            <div className="p-3.5 bg-emerald-950/40 border border-emerald-500/40 text-emerald-300 text-sm rounded-xl flex items-center space-x-2">
              <Check className="w-4 h-4" />
              <span>Успешно импортировано {importCount} рейсов в лётную книжку!</span>
            </div>
          )}

          {/* Paste Section */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-avionics-muted">
                Вставьте текст расписания или CSV из авиакомпании:
              </label>
              <button
                type="button"
                onClick={handleLoadSample}
                className="text-xs text-sky-400 hover:underline flex items-center space-x-1"
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>Загрузить пример</span>
              </button>
            </div>
            <textarea
              rows={4}
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              placeholder={`Вставьте сюда текст из AIMS e-Crew, NetLine, Sabre или CSV. Например:
2026-10-15 SU1492 SVO LED 08:00 09:30 A320 RA-73001
2026-10-16 SU2130 SVO IST 14:15 19:00 A321 RA-73702`}
              className="w-full bg-avionics-card border border-avionics-border rounded-xl p-3 text-xs font-mono text-avionics-text focus:outline-none focus:border-sky-500"
            />

            <div className="flex justify-end">
              <button
                type="button"
                onClick={handleParse}
                disabled={isParsing || !inputText.trim()}
                className="flex items-center space-x-1.5 px-4 py-2 bg-sky-500 hover:bg-sky-400 text-slate-950 text-xs font-bold rounded-xl transition-all shadow-md shadow-sky-500/20 disabled:opacity-50"
              >
                {isParsing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                <span>Распознать рейсы</span>
              </button>
            </div>
          </div>

          {/* Parsed Flights Preview */}
          {parsedFlights.length > 0 && (
            <div className="space-y-3 pt-2 border-t border-avionics-border">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <input
                    type="checkbox"
                    checked={parsedFlights.length > 0 && selectedCount === parsedFlights.length}
                    onChange={(e) => handleToggleSelectAll(e.target.checked)}
                    className="rounded border-avionics-border text-sky-500"
                  />
                  <span className="text-xs font-bold text-avionics-text">
                    Распознано рейсов: {parsedFlights.length} (выбрано {selectedCount})
                  </span>
                </div>
                <div className="text-xs text-avionics-muted">
                  Проверьте параметры и выберите рейсы для добавления
                </div>
              </div>

              {/* Table */}
              <div className="max-h-60 overflow-y-auto border border-avionics-border rounded-xl divide-y divide-avionics-border bg-avionics-card">
                {parsedFlights.map((item) => (
                  <div
                    key={item.id}
                    className={`p-3 text-xs flex flex-wrap items-center justify-between gap-3 transition-colors ${
                      item.selected ? 'bg-sky-500/5' : 'opacity-60'
                    }`}
                  >
                    <div className="flex items-center space-x-3">
                      <input
                        type="checkbox"
                        checked={item.selected}
                        onChange={() => handleToggleFlight(item.id)}
                        className="rounded border-avionics-border text-sky-500"
                      />
                      <div>
                        <div className="font-mono font-bold text-avionics-text flex items-center space-x-2">
                          <span>{item.date}</span>
                          <span className="text-sky-400">{item.depIcao} &rarr; {item.arrIcao}</span>
                          {item.flightNumber && (
                            <span className="text-[10px] bg-slate-800 text-slate-300 px-1.5 py-0.5 rounded">
                              {item.flightNumber}
                            </span>
                          )}
                        </div>
                        <div className="text-[11px] text-avionics-muted mt-0.5">
                          UTC {item.outTimeUtc} &ndash; {item.inTimeUtc} ({formatMinutesToHHMM(item.totalTimeMinutes)}) | {item.aircraftType} ({item.aircraftReg})
                        </div>
                      </div>
                    </div>

                    {/* Role & Handling selector */}
                    <div className="flex items-center space-x-2">
                      <select
                        value={item.flightRole}
                        onChange={(e) => handleUpdateFlight(item.id, { flightRole: e.target.value as any })}
                        className="bg-avionics-surface border border-avionics-border rounded-lg px-2 py-1 text-[11px] font-semibold text-avionics-text"
                      >
                        <option value="SIC">SIC</option>
                        <option value="PIC">PIC</option>
                        <option value="Observer">Observer</option>
                        <option value="PICUS">PICUS</option>
                        <option value="Dual">Dual</option>
                      </select>

                      <select
                        value={item.flightHandling}
                        onChange={(e) => handleUpdateFlight(item.id, { flightHandling: e.target.value as any })}
                        className="bg-avionics-surface border border-avionics-border rounded-lg px-2 py-1 text-[11px] font-semibold text-avionics-text"
                      >
                        <option value="PF">PF</option>
                        <option value="PM">PM</option>
                        <option value="Observer">Observer</option>
                      </select>
                    </div>
                  </div>
                ))}
              </div>

              {/* Import Button */}
              <div className="flex justify-end pt-2">
                <button
                  type="button"
                  onClick={handleImport}
                  disabled={isSaving || selectedCount === 0}
                  className="flex items-center space-x-1.5 px-6 py-2.5 bg-sky-500 hover:bg-sky-400 text-slate-950 text-sm font-bold rounded-xl transition-all shadow-lg shadow-sky-500/25 disabled:opacity-50"
                >
                  {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                  <span>Импортировать {selectedCount} рейс(ов) в книжку</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
