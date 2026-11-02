import React, { useState, useRef, useEffect } from 'react';
import {
  X,
  Upload,
  Check,
  Plane,
  Clock,
  ShieldCheck,
  ArrowRight,
  Loader2,
  Sparkles,
  FileText,
  FileSpreadsheet,
  Calendar,
  FileCheck2,
  AlertCircle,
  HelpCircle,
  Filter,
  CheckCheck,
  XCircle,
  Copy,
  Trash2,
  ChevronDown,
  Layers,
} from 'lucide-react';
import { db, LocalFlight } from '../db/db';
import { generateUUID } from '../utils/uuid';
import { parseRosterText } from '../utils/rosterParser';
import { parsePdfLogbook } from '../utils/pdfLogbookParser';
import {
  ParsedUniversalFlight,
  parseCsvLogbook,
  parseIcalLogbook,
} from '../utils/universalFlightParser';
import { applyDeduplication, DeduplicationSummary } from '../utils/deduplicationService';
import { formatMinutesToHHMM } from './FlightList';
import { syncEngine } from '../services/syncEngine';
import { ICAO_APPROACH_TYPES } from './AddFlightModal';
import { getStoredPilotProfile, POPULAR_AIRCRAFT_TYPES } from './AuthModal';

interface RosterImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onImportComplete: () => void;
}

const SAMPLE_CSV = `Date,Flight,Departure,Destination,Out,In,TotalTime,PIC,SIC,Night,ActualInstrument,DayLandings,NightLandings,AircraftID,AircraftType
2026-10-15,SU1492,SVO,LED,08:00,09:30,1.5,0.0,1.5,0.0,1.2,1,0,RA-73001,A320
2026-10-15,SU1493,LED,SVO,11:00,12:35,1.58,0.0,1.58,0.0,1.0,1,0,RA-73001,A320
2026-10-16,SU2130,SVO,IST,14:15,19:00,4.75,4.75,0.0,1.5,4.0,0,1,RA-73702,A321
2026-10-18,AFL200,SVO,DXB,07:20,13:45,6.42,0.0,6.42,0.0,5.5,1,0,RA-73305,B738`;

const SAMPLE_ROSTER = `2026-10-15 SU1492 SVO LED 08:00 09:30 A320 RA-73001
2026-10-15 SU1493 LED SVO 11:00 12:35 A320 RA-73001
2026-10-16 SU2130 SVO IST 14:15 19:00 A321 RA-73702
2026-10-18 AFL200 SVO DXB 07:20 13:45 B738 RA-73305`;

export const RosterImportModal: React.FC<RosterImportModalProps> = ({
  isOpen,
  onClose,
  onImportComplete,
}) => {
  const [activeTab, setActiveTab] = useState<'file' | 'text'>('file');
  const [inputText, setInputText] = useState('');
  const [parsedFlights, setParsedFlights] = useState<ParsedUniversalFlight[]>([]);
  const [dedupSummary, setDedupSummary] = useState<DeduplicationSummary | null>(null);
  const [isParsing, setIsParsing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [importCount, setImportCount] = useState<number | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [selectedFileName, setSelectedFileName] = useState<string | null>(null);
  const [detectedFormat, setDetectedFormat] = useState<string | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);

  // Quick Pilot Types from Profile
  const [userAircraftTypes, setUserAircraftTypes] = useState<string[]>([]);

  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      const profile = getStoredPilotProfile();
      const types = new Set<string>();
      if (profile?.aircraftType) types.add(profile.aircraftType.toUpperCase());
      if (profile?.aircraftTypes && Array.isArray(profile.aircraftTypes)) {
        profile.aircraftTypes.forEach((t) => types.add(t.toUpperCase()));
      }
      setUserAircraftTypes(Array.from(types));
    }
  }, [isOpen]);

  if (!isOpen) return null;

  // Process flights through deduplication engine
  const processAndSetFlights = async (flights: ParsedUniversalFlight[], formatName: string) => {
    if (flights.length === 0) {
      setParseError('Не удалось распознать рейсы. Проверьте формат файла или текста.');
      setParsedFlights([]);
      setDedupSummary(null);
      return;
    }
    setDetectedFormat(formatName);
    const { flights: dedupedFlights, summary } = await applyDeduplication(flights);
    setParsedFlights(dedupedFlights);
    setDedupSummary(summary);
  };

  // Handle file selection (CSV, ICS, PDF, TXT)
  const handleUniversalFile = async (file: File) => {
    const ext = file.name.split('.').pop()?.toLowerCase();
    setParseError(null);
    setSelectedFileName(file.name);
    setIsParsing(true);

    try {
      if (ext === 'pdf') {
        const rawPdfFlights = await parsePdfLogbook(file);
        const mapped: ParsedUniversalFlight[] = rawPdfFlights.map((f) => ({
          ...f,
          sourceFormat: 'PDF Logbook',
        }));
        await processAndSetFlights(mapped, 'PDF Logbook (LogTen / ForeFlight / EASA)');
      } else if (ext === 'ics' || ext === 'ical') {
        const text = await file.text();
        const results = await parseIcalLogbook(text);
        await processAndSetFlights(results, 'iCalendar (.ics)');
      } else if (ext === 'csv') {
        const text = await file.text();
        const results = await parseCsvLogbook(text);
        const detected = results[0]?.sourceFormat || 'CSV Logbook';
        await processAndSetFlights(results, detected);
      } else {
        // Fallback to text / CSV parsing
        const text = await file.text();
        if (text.includes('BEGIN:VEVENT')) {
          const results = await parseIcalLogbook(text);
          await processAndSetFlights(results, 'iCalendar (.ics)');
        } else if (text.includes(',') || text.includes(';') || text.includes('\t')) {
          const results = await parseCsvLogbook(text);
          await processAndSetFlights(results, results[0]?.sourceFormat || 'CSV Logbook');
        } else {
          const rosterRes = await parseRosterText(text);
          const mapped: ParsedUniversalFlight[] = rosterRes.map((r) => ({
            ...r,
            nightTimeMinutes: 0,
            landingsDay: 1,
            landingsNight: 0,
            sourceFormat: 'AIMS / Text Roster',
          }));
          await processAndSetFlights(mapped, 'AIMS / Text Roster');
        }
      }
    } catch (err: any) {
      console.error('File parse error:', err);
      setParseError(err?.message || 'Ошибка чтения и распознавания файла');
    } finally {
      setIsParsing(false);
    }
  };

  // Text parser
  const handleParseText = async () => {
    if (!inputText.trim()) return;
    setParseError(null);
    setIsParsing(true);
    try {
      const trimmed = inputText.trim();
      if (trimmed.includes('BEGIN:VEVENT')) {
        const results = await parseIcalLogbook(trimmed);
        await processAndSetFlights(results, 'iCalendar (.ics)');
      } else if (trimmed.includes(',') || trimmed.includes(';')) {
        const results = await parseCsvLogbook(trimmed);
        await processAndSetFlights(results, results[0]?.sourceFormat || 'CSV');
      } else {
        const results = await parseRosterText(trimmed);
        const mapped: ParsedUniversalFlight[] = results.map((r) => ({
          ...r,
          nightTimeMinutes: 0,
          landingsDay: 1,
          landingsNight: 0,
          sourceFormat: 'AIMS e-Crew Roster',
        }));
        await processAndSetFlights(mapped, 'AIMS e-Crew Roster');
      }
    } catch (err: any) {
      console.error('Roster parse error:', err);
      setParseError('Ошибка распознавания текста расписания');
    } finally {
      setIsParsing(false);
    }
  };

  const handleLoadSample = (type: 'csv' | 'roster') => {
    const text = type === 'csv' ? SAMPLE_CSV : SAMPLE_ROSTER;
    setInputText(text);
    setActiveTab('text');
    if (type === 'csv') {
      parseCsvLogbook(text).then((res) => processAndSetFlights(res, 'LogTen Pro CSV'));
    } else {
      parseRosterText(text).then((res) =>
        processAndSetFlights(
          res.map((r) => ({
            ...r,
            nightTimeMinutes: 0,
            landingsDay: 1,
            landingsNight: 0,
            sourceFormat: 'AIMS e-Crew',
          })),
          'AIMS e-Crew'
        )
      );
    }
  };

  // Bulk selection actions
  const handleSelectOnlyNew = () => {
    setParsedFlights((prev) =>
      prev.map((f) => ({
        ...f,
        selected: !f.isDuplicate,
      }))
    );
  };

  const handleSelectAll = (checked: boolean) => {
    setParsedFlights((prev) => prev.map((f) => ({ ...f, selected: checked })));
  };

  const handleToggleFlight = (id: string) => {
    setParsedFlights((prev) =>
      prev.map((f) => (f.id === id ? { ...f, selected: !f.selected } : f))
    );
  };

  const handleRemoveFlight = (id: string) => {
    setParsedFlights((prev) => prev.filter((f) => f.id !== id));
  };

  const handleUpdateFlight = (id: string, updates: Partial<ParsedUniversalFlight>) => {
    setParsedFlights((prev) =>
      prev.map((f) => (f.id === id ? { ...f, ...updates } : f))
    );
  };

  // Bulk modifiers
  const handleBulkSetRole = (role: ParsedUniversalFlight['flightRole']) => {
    setParsedFlights((prev) =>
      prev.map((f) => (f.selected ? { ...f, flightRole: role } : f))
    );
  };

  const handleBulkSetHandling = (handling: ParsedUniversalFlight['flightHandling']) => {
    setParsedFlights((prev) =>
      prev.map((f) => (f.selected ? { ...f, flightHandling: handling } : f))
    );
  };

  const handleBulkSetAircraftType = (type: string) => {
    if (!type.trim()) return;
    setParsedFlights((prev) =>
      prev.map((f) => (f.selected ? { ...f, aircraftType: type.toUpperCase().trim() } : f))
    );
  };

  // Save selected flights to Dexie and sync to cloud PostgreSQL
  const handleImport = async () => {
    const selected = parsedFlights.filter((f) => f.selected);
    if (selected.length === 0) return;

    setIsSaving(true);
    try {
      const newLocalFlights: LocalFlight[] = selected.map((f) => {
        const total = f.totalTimeMinutes || 90;
        const night = f.nightTimeMinutes || 0;
        const ifr = f.ifrTimeMinutes ?? total;
        const pic = f.flightRole === 'PIC' ? (f.picTimeMinutes || total) : 0;
        const sic = f.flightRole === 'SIC' ? (f.sicTimeMinutes || total) : 0;
        const picus = f.flightRole === 'PICUS' ? total : 0;
        const dual = f.flightRole === 'Dual' ? (f.dualTimeMinutes || total) : 0;

        return {
          id: generateUUID(),
          date: f.date,
          depIcao: f.depIcao.toUpperCase().trim(),
          arrIcao: f.arrIcao.toUpperCase().trim(),
          outTimeUtc: f.outTimeUtc,
          offTimeUtc: f.offTimeUtc || f.outTimeUtc,
          onTimeUtc: f.onTimeUtc || f.inTimeUtc,
          inTimeUtc: f.inTimeUtc,
          totalTimeMinutes: total,
          nightTimeMinutes: night,
          ifrTimeMinutes: ifr,
          picTimeMinutes: pic,
          sicTimeMinutes: sic,
          picusTimeMinutes: picus,
          dualTimeMinutes: dual,
          flightRole: f.flightRole,
          flightHandling: f.flightHandling,
          landingsDay: f.landingsDay ?? 1,
          landingsNight: f.landingsNight ?? 0,
          aircraftReg: f.aircraftReg.toUpperCase().trim(),
          aircraftType: f.aircraftType.toUpperCase().trim(),
          approachType: f.approachType || '',
          remarks: f.remarks || (f.flightNumber ? `Flight ${f.flightNumber}` : 'Imported'),
          syncStatus: 'created',
          updatedAt: new Date().toISOString(),
        };
      });

      await db.flights.bulkAdd(newLocalFlights);
      setImportCount(newLocalFlights.length);
      syncEngine.syncNow();
      onImportComplete();

      setTimeout(() => {
        onClose();
        setImportCount(null);
        setParsedFlights([]);
        setInputText('');
        setSelectedFileName(null);
        setDedupSummary(null);
      }, 1600);
    } catch (err) {
      console.error('Import save error:', err);
      setParseError('Ошибка при сохранении рейсов в локальную базу данных');
    } finally {
      setIsSaving(false);
    }
  };

  const selectedCount = parsedFlights.filter((f) => f.selected).length;
  const selectedMinutes = parsedFlights
    .filter((f) => f.selected)
    .reduce((acc, curr) => acc + (curr.totalTimeMinutes || 0), 0);

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4 overflow-y-auto">
      <div className="bg-avionics-surface border border-avionics-border rounded-t-3xl sm:rounded-3xl w-full max-w-5xl shadow-2xl overflow-hidden my-0 sm:my-6 max-h-[94vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-4 sm:px-6 py-3.5 sm:py-4 border-b border-avionics-border bg-avionics-card shrink-0">
          <div className="flex items-center space-x-3">
            <div className="p-2.5 bg-sky-500/10 border border-sky-500/20 rounded-2xl text-sky-400">
              <Upload className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h2 className="text-base md:text-lg font-bold text-avionics-text">
                  Универсальный импорт полётов
                </h2>
                {detectedFormat && (
                  <span className="text-2xs font-bold px-2 py-0.5 bg-sky-500/10 border border-sky-500/30 text-sky-400 rounded-lg">
                    {detectedFormat}
                  </span>
                )}
              </div>
              <div className="text-2xs text-avionics-muted mt-0.5">
                LogTen Pro, ForeFlight, Safelog CSV, календари iCal (.ics), AIMS e-Crew и PDF
              </div>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-avionics-muted hover:text-avionics-text rounded-xl hover:bg-avionics-surface transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Navigation Tabs */}
        <div className="px-6 pt-3 border-b border-avionics-border flex items-center space-x-4 bg-avionics-card/50 shrink-0">
          <button
            type="button"
            onClick={() => setActiveTab('file')}
            className={`pb-3 px-3 text-xs font-bold border-b-2 flex items-center space-x-2 transition-all cursor-pointer ${
              activeTab === 'file'
                ? 'border-sky-500 text-sky-400'
                : 'border-transparent text-avionics-muted hover:text-avionics-text'
            }`}
          >
            <FileSpreadsheet className="w-4 h-4" />
            <span>Файл (CSV / iCal .ics / PDF)</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('text')}
            className={`pb-3 px-3 text-xs font-bold border-b-2 flex items-center space-x-2 transition-all cursor-pointer ${
              activeTab === 'text'
                ? 'border-sky-500 text-sky-400'
                : 'border-transparent text-avionics-muted hover:text-avionics-text'
            }`}
          >
            <FileText className="w-4 h-4" />
            <span>Вставка текста / расписания (AIMS / NetLine)</span>
          </button>
        </div>

        {/* Content Body */}
        <div className="p-4 sm:p-6 space-y-4 overflow-y-auto flex-1">
          {importCount !== null && (
            <div className="p-4 bg-emerald-950/40 border border-emerald-500/40 text-emerald-300 text-sm rounded-2xl flex items-center space-x-2 shadow-sm animate-in fade-in">
              <Check className="w-5 h-5 text-emerald-400 shrink-0" />
              <span>
                Успешно импортировано <strong>{importCount}</strong> рейсов в вашу лётную книжку!
              </span>
            </div>
          )}

          {parseError && (
            <div className="p-3.5 bg-rose-950/40 border border-rose-500/40 text-rose-300 text-xs rounded-2xl flex items-start space-x-2">
              <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
              <div>{parseError}</div>
            </div>
          )}

          {/* TAB 1: UNIVERSAL FILE DRAG & DROP */}
          {activeTab === 'file' && (
            <div className="space-y-4">
              <div
                onClick={() => fileInputRef.current?.click()}
                onDragOver={(e) => {
                  e.preventDefault();
                  setIsDragOver(true);
                }}
                onDragLeave={() => setIsDragOver(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setIsDragOver(false);
                  if (e.dataTransfer.files && e.dataTransfer.files[0]) {
                    handleUniversalFile(e.dataTransfer.files[0]);
                  }
                }}
                className={`border-2 border-dashed rounded-3xl p-6 sm:p-8 text-center cursor-pointer transition-all flex flex-col items-center justify-center space-y-3 group ${
                  isDragOver
                    ? 'border-sky-400 bg-sky-500/10 scale-[0.99]'
                    : 'border-avionics-border hover:border-sky-500/60 bg-avionics-card/60 hover:bg-sky-500/5'
                }`}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv,.ics,.ical,.pdf,.txt,text/csv,text/calendar,application/pdf"
                  className="hidden"
                  onChange={(e) => {
                    if (e.target.files && e.target.files[0]) {
                      handleUniversalFile(e.target.files[0]);
                    }
                  }}
                />

                <div className="p-4 bg-sky-500/10 group-hover:bg-sky-500/20 border border-sky-500/20 rounded-2xl text-sky-400 transition-colors">
                  {isParsing ? (
                    <Loader2 className="w-8 h-8 animate-spin" />
                  ) : (
                    <Upload className="w-8 h-8" />
                  )}
                </div>

                <div>
                  <div className="text-sm font-bold text-avionics-text">
                    {selectedFileName ? (
                      <span className="text-sky-400 font-mono">{selectedFileName}</span>
                    ) : (
                      'Нажмите для выбора файла или перетащите его сюда'
                    )}
                  </div>
                  <p className="text-2xs text-avionics-muted mt-1 max-w-md mx-auto">
                    Поддерживаются CSV выгрузки из LogTen Pro и ForeFlight, файлы расписаний iCal (.ics) и PDF отчёты.
                  </p>
                </div>

                <div className="flex flex-wrap items-center justify-center gap-1.5 text-2xs text-avionics-muted">
                  <span className="px-2 py-0.5 bg-avionics-surface border border-avionics-border rounded font-mono text-sky-400">.CSV</span>
                  <span className="px-2 py-0.5 bg-avionics-surface border border-avionics-border rounded font-mono text-indigo-400">.ICS / .ICAL</span>
                  <span className="px-2 py-0.5 bg-avionics-surface border border-avionics-border rounded font-mono text-rose-400">.PDF</span>
                  <span className="px-2 py-0.5 bg-avionics-surface border border-avionics-border rounded">LogTen Pro</span>
                  <span className="px-2 py-0.5 bg-avionics-surface border border-avionics-border rounded">ForeFlight</span>
                  <span className="px-2 py-0.5 bg-avionics-surface border border-avionics-border rounded">AIMS e-Crew</span>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: TEXT / ROSTER INPUT */}
          {activeTab === 'text' && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <label className="text-xs font-semibold text-avionics-muted">
                  Вставьте текст расписания, CSV или события календаря:
                </label>
                <div className="flex items-center space-x-2">
                  <button
                    type="button"
                    onClick={() => handleLoadSample('csv')}
                    className="text-2xs text-sky-400 hover:underline flex items-center space-x-1 cursor-pointer"
                  >
                    <Sparkles className="w-3 h-3" />
                    <span>Пример CSV</span>
                  </button>
                  <span className="text-avionics-border">•</span>
                  <button
                    type="button"
                    onClick={() => handleLoadSample('roster')}
                    className="text-2xs text-sky-400 hover:underline flex items-center space-x-1 cursor-pointer"
                  >
                    <Sparkles className="w-3 h-3" />
                    <span>Пример AIMS</span>
                  </button>
                </div>
              </div>

              <textarea
                rows={4}
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                placeholder={`Вставьте сюда текст из AIMS e-Crew, NetLine, Sabre или CSV. Например:
2026-10-15 SU1492 SVO LED 08:00 09:30 A320 RA-73001
2026-10-16 SU2130 SVO IST 14:15 19:00 A321 RA-73702`}
                className="w-full bg-avionics-card border border-avionics-border rounded-2xl p-3 text-xs font-mono text-avionics-text focus:outline-none focus:border-sky-500"
              />

              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={handleParseText}
                  disabled={isParsing || !inputText.trim()}
                  className="flex items-center space-x-1.5 px-4 py-2 bg-sky-500 hover:bg-sky-400 text-slate-950 text-xs font-bold rounded-xl transition-all shadow-md shadow-sky-500/20 disabled:opacity-50 cursor-pointer"
                >
                  {isParsing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                  <span>Распознать данные</span>
                </button>
              </div>
            </div>
          )}

          {/* DEDUPLICATION SUMMARY & STATS BAR */}
          {dedupSummary && parsedFlights.length > 0 && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 pt-2">
              <div className="bg-avionics-card border border-avionics-border rounded-2xl p-2.5">
                <div className="text-2xs text-avionics-muted">Распознано в файле</div>
                <div className="text-base font-bold text-avionics-text font-mono mt-0.5">
                  {dedupSummary.totalParsed}
                </div>
              </div>

              <div className="bg-emerald-950/20 border border-emerald-500/30 rounded-2xl p-2.5">
                <div className="text-2xs text-emerald-400">Новых рейсов</div>
                <div className="text-base font-bold text-emerald-300 font-mono mt-0.5">
                  {dedupSummary.newFlightsCount}
                </div>
              </div>

              <div className="bg-amber-950/20 border border-amber-500/30 rounded-2xl p-2.5">
                <div className="text-2xs text-amber-400">Уже есть в базе</div>
                <div className="text-base font-bold text-amber-300 font-mono mt-0.5">
                  {dedupSummary.duplicatesCount}
                </div>
              </div>

              <div className="bg-sky-950/20 border border-sky-500/30 rounded-2xl p-2.5">
                <div className="text-2xs text-sky-400">Выбрано к добавлению</div>
                <div className="text-base font-bold text-sky-300 font-mono mt-0.5">
                  {selectedCount} <span className="text-2xs text-avionics-muted font-normal">({formatMinutesToHHMM(selectedMinutes)})</span>
                </div>
              </div>
            </div>
          )}

          {/* BULK ACTIONS TOOLBAR */}
          {parsedFlights.length > 0 && (
            <div className="bg-avionics-card border border-avionics-border rounded-2xl p-3 space-y-2.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center space-x-2">
                  <button
                    type="button"
                    onClick={handleSelectOnlyNew}
                    className="px-2.5 py-1 text-2xs font-bold bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 rounded-lg transition-colors cursor-pointer"
                  >
                    Только новые ({dedupSummary?.newFlightsCount || 0})
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSelectAll(true)}
                    className="px-2.5 py-1 text-2xs font-semibold bg-avionics-surface hover:bg-avionics-border text-avionics-text border border-avionics-border rounded-lg transition-colors cursor-pointer"
                  >
                    Выбрать все
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSelectAll(false)}
                    className="px-2.5 py-1 text-2xs font-semibold bg-avionics-surface hover:bg-avionics-border text-avionics-muted rounded-lg transition-colors cursor-pointer"
                  >
                    Снять выбор
                  </button>
                </div>

                {/* Bulk Role Buttons */}
                <div className="flex items-center space-x-1.5 text-2xs">
                  <span className="text-avionics-muted font-medium">Роль для выбранных:</span>
                  {(['PIC', 'SIC', 'PICUS', 'Dual'] as const).map((r) => (
                    <button
                      key={r}
                      type="button"
                      onClick={() => handleBulkSetRole(r)}
                      className="px-2 py-0.5 bg-avionics-surface hover:bg-sky-500/20 hover:text-sky-400 border border-avionics-border rounded text-avionics-text font-bold transition-colors cursor-pointer"
                    >
                      {r}
                    </button>
                  ))}
                </div>
              </div>

              {/* Bulk Aircraft Type Quick Setter */}
              {userAircraftTypes.length > 0 && (
                <div className="flex items-center space-x-2 pt-1.5 border-t border-avionics-border/60 text-2xs">
                  <span className="text-avionics-muted font-medium">Тип ВС из профиля:</span>
                  <div className="flex flex-wrap items-center gap-1">
                    {userAircraftTypes.map((t) => (
                      <button
                        key={t}
                        type="button"
                        onClick={() => handleBulkSetAircraftType(t)}
                        className="px-2 py-0.5 bg-sky-500/10 hover:bg-sky-500/25 text-sky-400 border border-sky-500/20 rounded font-mono font-bold transition-colors cursor-pointer"
                      >
                        {t}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* PARSED FLIGHTS TABLE */}
          {parsedFlights.length > 0 && (
            <div className="space-y-2">
              <div className="max-h-80 overflow-y-auto border border-avionics-border rounded-2xl divide-y divide-avionics-border bg-avionics-card">
                {parsedFlights.map((item) => (
                  <div
                    key={item.id}
                    className={`p-3 text-xs flex flex-wrap items-center justify-between gap-3 transition-colors ${
                      item.selected
                        ? item.isDuplicate
                          ? 'bg-amber-500/5'
                          : 'bg-sky-500/5'
                        : 'opacity-50 bg-avionics-surface/20'
                    }`}
                  >
                    {/* Left: Checkbox & Flight Details */}
                    <div className="flex items-center space-x-3 min-w-[240px]">
                      <input
                        type="checkbox"
                        checked={item.selected}
                        onChange={() => handleToggleFlight(item.id)}
                        className="rounded border-avionics-border text-sky-500 focus:ring-0 cursor-pointer w-4 h-4"
                      />

                      <div>
                        <div className="font-mono font-bold text-avionics-text flex items-center space-x-2 flex-wrap">
                          <span>{item.date}</span>
                          <span className="text-sky-400 font-bold flex items-center space-x-1">
                            <span>{item.depIcao}</span>
                            <ArrowRight className="w-3 h-3 text-avionics-muted" />
                            <span>{item.arrIcao}</span>
                          </span>

                          {item.flightNumber && (
                            <span className="text-2xs bg-slate-800 text-slate-300 px-1.5 py-0.2 rounded font-mono">
                              {item.flightNumber}
                            </span>
                          )}

                          {item.isDuplicate ? (
                            <span
                              title={item.duplicateReason}
                              className="text-2xs font-semibold bg-amber-500/15 border border-amber-500/30 text-amber-400 px-1.5 py-0.2 rounded cursor-help"
                            >
                              Уже в базе
                            </span>
                          ) : (
                            <span className="text-2xs font-semibold bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 px-1.5 py-0.2 rounded">
                              Новый
                            </span>
                          )}
                        </div>

                        <div className="text-2xs text-avionics-muted mt-0.5 font-mono">
                          UTC {item.outTimeUtc} &ndash; {item.inTimeUtc} ({formatMinutesToHHMM(item.totalTimeMinutes)})
                          {item.nightTimeMinutes > 0 && ` • Ночь: ${formatMinutesToHHMM(item.nightTimeMinutes)}`}
                          {item.ifrTimeMinutes && item.ifrTimeMinutes > 0 ? ` • IFR: ${formatMinutesToHHMM(item.ifrTimeMinutes)}` : ''}
                        </div>
                      </div>
                    </div>

                    {/* Right: Inline Controls (Aircraft, Role, Landings, Approach) */}
                    <div className="flex items-center space-x-2 flex-wrap gap-y-1">
                      {/* Aircraft Type & Reg editable */}
                      <input
                        type="text"
                        value={item.aircraftType}
                        onChange={(e) => handleUpdateFlight(item.id, { aircraftType: e.target.value.toUpperCase() })}
                        placeholder="Тип ВС"
                        className="w-16 bg-avionics-surface border border-avionics-border rounded-lg px-2 py-1 text-2xs font-mono font-bold text-avionics-text text-center focus:border-sky-500 focus:outline-none"
                      />

                      <input
                        type="text"
                        value={item.aircraftReg}
                        onChange={(e) => handleUpdateFlight(item.id, { aircraftReg: e.target.value.toUpperCase() })}
                        placeholder="Бортовой №"
                        className="w-20 bg-avionics-surface border border-avionics-border rounded-lg px-2 py-1 text-2xs font-mono font-bold text-avionics-text text-center focus:border-sky-500 focus:outline-none"
                      />

                      {/* Approach selector */}
                      <select
                        value={item.approachType || ''}
                        onChange={(e) => handleUpdateFlight(item.id, { approachType: e.target.value })}
                        className="bg-avionics-surface border border-avionics-border rounded-lg px-2 py-1 text-2xs font-semibold text-avionics-text"
                      >
                        <option value="">Без захода (—)</option>
                        {ICAO_APPROACH_TYPES.map((app) => (
                          <option key={app} value={app}>
                            {app}
                          </option>
                        ))}
                      </select>

                      {/* Landings */}
                      <div className="flex items-center space-x-1 text-2xs font-mono text-avionics-muted bg-avionics-surface border border-avionics-border px-2 py-1 rounded-lg">
                        <span>D:</span>
                        <input
                          type="number"
                          min={0}
                          max={10}
                          value={item.landingsDay}
                          onChange={(e) =>
                            handleUpdateFlight(item.id, { landingsDay: parseInt(e.target.value, 10) || 0 })
                          }
                          className="w-6 bg-transparent text-avionics-text font-bold text-center focus:outline-none"
                        />
                        <span>N:</span>
                        <input
                          type="number"
                          min={0}
                          max={10}
                          value={item.landingsNight}
                          onChange={(e) =>
                            handleUpdateFlight(item.id, { landingsNight: parseInt(e.target.value, 10) || 0 })
                          }
                          className="w-6 bg-transparent text-indigo-400 font-bold text-center focus:outline-none"
                        />
                      </div>

                      {/* Role */}
                      <select
                        value={item.flightRole}
                        onChange={(e) => handleUpdateFlight(item.id, { flightRole: e.target.value as any })}
                        className="bg-avionics-surface border border-avionics-border rounded-lg px-2 py-1 text-2xs font-semibold text-avionics-text"
                      >
                        <option value="SIC">SIC</option>
                        <option value="PIC">PIC</option>
                        <option value="Observer">Observer</option>
                        <option value="PICUS">PICUS</option>
                        <option value="Dual">Dual</option>
                        <option value="Instructor">Instructor</option>
                      </select>

                      {/* Handling */}
                      <select
                        value={item.flightHandling}
                        onChange={(e) => handleUpdateFlight(item.id, { flightHandling: e.target.value as any })}
                        className="bg-avionics-surface border border-avionics-border rounded-lg px-2 py-1 text-2xs font-semibold text-avionics-text"
                      >
                        <option value="PF">PF</option>
                        <option value="PM">PM</option>
                        <option value="Observer">Observer</option>
                        <option value="Relief">Relief</option>
                      </select>

                      {/* Remove Button */}
                      <button
                        type="button"
                        onClick={() => handleRemoveFlight(item.id)}
                        className="p-1 text-avionics-muted hover:text-rose-400 transition-colors cursor-pointer"
                        title="Удалить из списка"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              {/* The source does not say who landed, and these values drive the 90-day currency */}
              <div role="note" className="flex items-start space-x-2 p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-xs text-avionics-text">
                <AlertCircle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                <span>
                  Ростер не показывает, кто пилотировал и сажал самолёт. Проверьте PF/PM и посадки: они определяют
                  допуск 90 дней.
                </span>
              </div>

              {/* Bottom Actions */}
              <div className="flex items-center justify-between pt-2">
                <div className="text-2xs text-avionics-muted">
                  Выбрано <strong>{selectedCount}</strong> из {parsedFlights.length} рейсов
                </div>

                <button
                  type="button"
                  onClick={handleImport}
                  disabled={isSaving || selectedCount === 0}
                  className="flex items-center space-x-2 px-6 py-2.5 bg-sky-500 hover:bg-sky-400 text-slate-950 text-sm font-bold rounded-2xl transition-all shadow-lg shadow-sky-500/25 disabled:opacity-50 cursor-pointer"
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
