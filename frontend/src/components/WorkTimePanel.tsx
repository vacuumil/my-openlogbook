import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  AlertTriangle,
  BookPlus,
  CalendarDays,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Download,
  FileText,
  LayoutGrid,
  Link2,
  List,
  Loader2,
  Plane,
  Plus,
  RefreshCw,
  Trash2,
  Upload,
} from 'lucide-react';
import { db, DutyLink, LocalFlight, WorkEntry, WorkKind } from '../db/db';
import { generateUUID } from '../utils/uuid';
import { toDateKey } from '../utils/dates';
import { getWorkRates, saveWorkRates, syncEngine } from '../services/syncEngine';
import {
  applyLogbookTimes,
  buildFlightDuties,
  buildWorkCsv,
  computeEntryMinutes,
  DUTY_LINK_LABELS,
  entriesFromFlights,
  FlightPayBasis,
  formatDutyLength,
  getDutyWarnings,
  getPlannedFlightMinutes,
  PAID_KINDS,
  parseDutyPlan,
  summarizeMonth,
  withoutDuplicates,
  WORK_KIND_LABELS,
  WorkRates,
  routeOf,
} from '../utils/workTime';
import { absoluteMinutes, entryToUtc } from '../utils/workClock';
import { formatMinutesToHHMM } from './FlightList';
import { buildDraftFlights } from '../utils/planDrafts';
import { buildIataIndex } from '../utils/flightFilters';
import { MAJOR_AIRPORTS } from '../data/majorAirports';
import { createDrafts, getRosterFetchedAt, getRosterUrl, refreshRoster, setRosterUrl as saveRosterUrl } from '../services/rosterService';
import { getStoredPilotProfile } from './AuthModal';
import { WorkCalendar } from './WorkCalendar';
import { DutyTimeline } from './DutyTimeline';

const SYNC_DELAY_MS = 2000;
const VIEW_KEY = 'openlogbook_work_view';

interface WorkTimePanelProps {
  flights: LocalFlight[];
}

const cellClassName =
  'w-full min-w-0 bg-avionics-card border border-avionics-border rounded-lg px-2 py-1.5 text-xs text-avionics-text focus:outline-none focus:border-sky-500';

const shiftMonth = (month: string, delta: number) => {
  const [year, monthNumber] = month.split('-').map(Number);
  return toDateKey(new Date(year, monthNumber - 1 + delta, 1)).substring(0, 7);
};

const monthLabel = (month: string) => {
  const [year, monthNumber] = month.split('-').map(Number);
  const label = new Date(year, monthNumber - 1, 1).toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' });
  return label.charAt(0).toUpperCase() + label.slice(1);
};

const dayLabel = (date: string) => new Date(`${date}T00:00`).toLocaleDateString('ru-RU', { weekday: 'long', day: 'numeric', month: 'long' });

const money = (value: number) => value.toLocaleString('ru-RU', { maximumFractionDigits: 2 });

const minutesAgo = (at: number) => {
  const minutes = Math.round((Date.now() - at) / 60000);
  if (minutes < 1) return 'только что';
  if (minutes < 60) return `${minutes} мин назад`;
  return `${Math.floor(minutes / 60)} ч назад`;
};

const readView = (): 'calendar' | 'list' => {
  try {
    return localStorage.getItem(VIEW_KEY) === 'list' ? 'list' : 'calendar';
  } catch {
    return 'calendar';
  }
};

const Tile: React.FC<{ label: string; value: string; hint?: string; tone?: 'warn' | 'ok' }> = ({ label, value, hint, tone }) => (
  <div className="p-3 sm:p-4 bg-avionics-surface border border-avionics-border rounded-2xl min-w-0">
    <div className="text-2xs sm:text-xs font-semibold uppercase tracking-wider text-avionics-muted truncate">{label}</div>
    <div className={`mt-1 text-lg sm:text-2xl font-black font-mono truncate ${tone === 'warn' ? 'text-amber-400' : 'text-avionics-text'}`}>{value}</div>
    {hint && <div className="text-2xs text-avionics-muted truncate">{hint}</div>}
  </div>
);

export const WorkTimePanel: React.FC<WorkTimePanelProps> = ({ flights }) => {
  const [month, setMonth] = useState(() => toDateKey(new Date()).substring(0, 7));
  const [rates, setRates] = useState<WorkRates>(getWorkRates);
  const [view, setView] = useState(readView);
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [isRatesOpen, setIsRatesOpen] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [message, setMessage] = useState<{ text: string; isError: boolean } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [rosterUrl, setRosterUrl] = useState(getRosterUrl);
  const [isLinkFormOpen, setIsLinkFormOpen] = useState(false);
  const [fetchedAt, setFetchedAt] = useState(getRosterFetchedAt);
  const syncTimerRef = useRef<number | undefined>(undefined);

  // The last days of the month before too: a duty that began there runs into this month,
  // and the rest before the first duty here starts with it
  const entries = useLiveQuery(
    () => db.workEntries.where('date').between(`${shiftMonth(month, -1)}-25`, `${month}-31`, true, true).toArray(),
    [month]
  );
  const reach = useMemo(
    () => [...(entries || [])].sort((a, b) => a.date.localeCompare(b.date) || a.start.localeCompare(b.start)),
    [entries]
  );
  const rows = useMemo(() => reach.filter((entry) => entry.date.startsWith(month)), [reach, month]);
  const referenceAirports = useLiveQuery(() => db.airports.toArray(), []);
  const iataIndex = useMemo(() => buildIataIndex([...MAJOR_AIRPORTS, ...(referenceAirports || [])]), [referenceAirports]);
  // Flown legs count by the logbook's actual times, planned ones by the roster
  const effectiveReach = useMemo(() => applyLogbookTimes(reach, flights, iataIndex), [reach, flights, iataIndex]);
  const effectiveRows = useMemo(() => effectiveReach.filter((entry) => entry.date.startsWith(month)), [effectiveReach, month]);
  const summary = useMemo(() => summarizeMonth(effectiveRows, rates, month), [effectiveRows, rates, month]);
  const allDuties = useMemo(() => buildFlightDuties(effectiveReach, rates), [effectiveReach, rates]);
  const dutyWarnings = useMemo(() => {
    const monthly = getDutyWarnings(summary.duties, rates).filter((warning) => !warning.date);
    const daily = getDutyWarnings(allDuties, rates).filter((warning) => warning.date.startsWith(month));
    return [...daily, ...monthly];
  }, [summary.duties, allDuties, rates, month]);
  // Logbook flights of the month that work time does not hold yet: the roster or a plan already
  // counts the others, with the logbook's times
  const logbookMissing = useMemo(() => {
    const toIcao = (code: string) => (iataIndex.get(code) || code).toUpperCase();
    const known = rows.flatMap((row) => {
      const route = row.kind === 'flight' && row.start ? routeOf(row.title) : null;
      return route ? [{ dep: toIcao(route.dep), arr: toIcao(route.arr), at: absoluteMinutes(row.date, row.start) }] : [];
    });
    return entriesFromFlights(flights, month).filter((entry) => {
      const route = routeOf(entry.title);
      const at = absoluteMinutes(entry.date, entry.start);
      return !known.some((row) => route && row.dep === toIcao(route.dep) && row.arr === toIcao(route.arr) && Math.abs(row.at - at) <= 12 * 60);
    });
  }, [rows, flights, month, iataIndex]);

  // Plan flights not yet in the logbook become drafts the pilot confirms after flying
  const drafts = useMemo(() => {
    const known = [...MAJOR_AIRPORTS, ...(referenceAirports || [])];
    return buildDraftFlights(rows, flights, {
      utcOffsetMinutes: 0,
      iataIndex,
      airports: new Map(known.map((airport) => [airport.icao.toUpperCase(), airport])),
    });
  }, [rows, flights, referenceAirports, iataIndex]);

  useEffect(() => () => window.clearTimeout(syncTimerRef.current), []);
  useEffect(() => setSelectedDay(null), [month]);

  const scheduleSync = () => {
    window.clearTimeout(syncTimerRef.current);
    syncTimerRef.current = window.setTimeout(() => syncEngine.syncNow(), SYNC_DELAY_MS);
  };

  const mutate = async (change: () => Promise<unknown>) => {
    // Marked first: a sync finishing right now must not restore the old rows
    syncEngine.markProfileDataDirty();
    await change();
    scheduleSync();
  };

  // A row the pilot changed keeps the change when the roster is loaded again
  const updateEntry = (entry: WorkEntry, patch: Partial<WorkEntry>) =>
    mutate(async () => {
      const stored = await db.workEntries.get(entry.id);
      if (!stored) return;
      const next: WorkEntry = { ...stored, ...patch, ...(stored.sourceId ? { edited: true } : {}) };
      (Object.keys(patch) as Array<keyof WorkEntry>).forEach((key) => patch[key] === undefined && delete next[key]);
      await db.workEntries.put(next);
    });
  const removeEntry = (id: string) => mutate(() => db.workEntries.delete(id));

  const addEntries = async (incoming: WorkEntry[]) => {
    const existing = await db.workEntries.toArray();
    const fresh = withoutDuplicates(existing, incoming);
    if (fresh.length > 0) await mutate(() => db.workEntries.bulkPut(fresh));
    return fresh;
  };

  const addRow = (date?: string) => {
    const today = toDateKey(new Date());
    const day = date ?? (today.startsWith(month) ? today : `${month}-01`);
    return mutate(() =>
      db.workEntries.add({ id: generateUUID(), date: day, kind: 'flight', title: '', start: '', end: '', nightMinutes: 0, note: '', utc: true })
    );
  };

  const handleCreateDrafts = async () => {
    const created = await createDrafts(rows);
    syncEngine.syncNow();
    setMessage({
      text: `В книжку добавлено черновиков: ${created.length}. После полёта откройте каждый, внесите факт и сохраните.`,
      isError: false,
    });
  };

  const handleAddFromLogbook = async () => {
    const fresh = await addEntries(logbookMissing.map((entry) => ({ ...entry, utc: true })));
    setMessage({ text: fresh.length > 0 ? `Добавлено рейсов из книжки: ${fresh.length}` : 'Новых рейсов в книжке нет', isError: false });
  };

  const handleFile = async (file: File) => {
    setIsImporting(true);
    setMessage(null);
    try {
      const isPdf = file.name.toLowerCase().endsWith('.pdf');
      let lines: string[];
      try {
        lines = isPdf
          ? await (await import('../utils/pdfLogbookParser')).extractPdfLines(file)
          : (await file.text()).split(/\r?\n/);
      } catch (error) {
        // Usually the PDF reader itself failed to load: a stale page after an update
        console.error('Plan file could not be read:', error);
        setMessage({
          text: isPdf
            ? 'Не удалось открыть PDF: модуль чтения не загрузился. Обновите страницу; если не поможет, файл может быть защищён паролем или повреждён.'
            : 'Не удалось прочитать файл.',
          isError: true,
        });
        return;
      }
      // Plans print the plan's clock (Moscow time): rows keep UTC
      const parsed = parseDutyPlan(lines, month).map((entry) => entryToUtc(entry, rates.planUtcOffsetMinutes ?? 180));
      if (parsed.length === 0) {
        setMessage({
          text: isPdf && lines.length === 0 ? 'В PDF нет текста: похоже, это скан. Добавьте строки вручную.' : 'Не удалось распознать строки плана. Добавьте их вручную.',
          isError: true,
        });
        return;
      }
      const fresh = await addEntries(parsed);
      setMonth(parsed[0].date.substring(0, 7));
      // Plans that state their total flight time let the pilot see at once whether every leg was read
      const planned = getPlannedFlightMinutes(lines);
      const parsedFlightMinutes = parsed.filter((entry) => entry.kind === 'flight').reduce((sum, entry) => sum + computeEntryMinutes(entry.start, entry.end), 0);
      const check =
        planned === null
          ? ''
          : planned === parsedFlightMinutes
            ? ` Налёт совпадает с планом: ${formatMinutesToHHMM(planned)}.`
            : ` Налёт по плану ${formatMinutesToHHMM(planned)}, распознано ${formatMinutesToHHMM(parsedFlightMinutes)}: проверьте строки.`;
      setMessage({ text: `Распознано строк: ${parsed.length}, добавлено новых: ${fresh.length}.${check}`, isError: planned !== null && planned !== parsedFlightMinutes });
    } catch (error) {
      console.error('Plan import failed:', error);
      setMessage({ text: 'Файл прочитан, но сохранить строки не удалось. Попробуйте ещё раз.', isError: true });
    } finally {
      setIsImporting(false);
    }
  };

  const handleRosterRefresh = async (url = rosterUrl) => {
    if (!url.trim()) return;
    setIsImporting(true);
    setMessage(null);
    try {
      saveRosterUrl(url);
      const result = await refreshRoster({ force: true });
      setFetchedAt(getRosterFetchedAt());
      setIsLinkFormOpen(false);
      if (!result || result.events === 0) {
        setMessage({ text: 'Календарь загружен, но в нём пока нет событий.', isError: false });
        return;
      }
      const parts = [`Событий в ростере: ${result.events}`, `добавлено: ${result.added}`, `обновлено: ${result.updated}`];
      if (result.removed) parts.push(`отменено: ${result.removed}`);
      if (result.drafts) parts.push(`черновиков в книжке: ${result.drafts}`);
      setMessage({ text: `${parts.join(', ')}.`, isError: false });
    } catch (error) {
      setMessage({ text: (error as Error)?.message || 'Не удалось загрузить календарь', isError: true });
    } finally {
      setIsImporting(false);
    }
  };

  const updateRates = (next: WorkRates) => {
    setRates(next);
    saveWorkRates(next);
    scheduleSync();
  };

  const switchView = (next: 'calendar' | 'list') => {
    setView(next);
    try {
      localStorage.setItem(VIEW_KEY, next);
    } catch {
      // Only a convenience
    }
  };

  const handleExport = () => {
    // The BOM makes Excel read the file as UTF-8
    const blob = new Blob([String.fromCharCode(0xfeff), buildWorkCsv(effectiveRows, rates)], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `work-time-${month}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const handlePdf = async () => {
    try {
      const { buildWorkReportPdf } = await import('../services/workReportPdf');
      const profile = getStoredPilotProfile();
      const doc = await buildWorkReportPdf(month, summary, effectiveRows, dutyWarnings, profile?.fullName || '');
      doc.save(`work-time-${month}.pdf`);
    } catch (error) {
      console.error('Work report failed:', error);
      setMessage({ text: 'Не удалось собрать PDF-отчёт. Попробуйте ещё раз.', isError: true });
    }
  };

  const buttonClassName =
    'flex items-center justify-center space-x-1.5 px-3 py-2 rounded-xl bg-avionics-card border border-avionics-border text-xs font-semibold text-avionics-text hover:border-sky-500/50 transition-colors cursor-pointer disabled:opacity-50';

  const savedUrl = getRosterUrl();
  const overtime = summary.overtimeMinutes;
  // A night duty also belongs to the day it runs into
  const selectedDuties = selectedDay
    ? allDuties.filter((duty) => {
        const dayStart = absoluteMinutes(selectedDay, '00:00');
        return duty.startAt < dayStart + 1440 && duty.endAt > dayStart;
      })
    : [];
  const selectedOther = selectedDay ? rows.filter((row) => row.kind !== 'flight' && row.date === selectedDay) : [];

  return (
    <div className="space-y-3 sm:space-y-4">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 p-3 bg-avionics-surface border border-avionics-border rounded-2xl">
        <div className="flex items-center justify-between lg:justify-start gap-1">
          <button type="button" onClick={() => setMonth(shiftMonth(month, -1))} aria-label="Предыдущий месяц" className="p-2 text-avionics-muted hover:text-avionics-text cursor-pointer">
            <ChevronLeft className="w-4 h-4" />
          </button>
          <h1 className="min-w-[150px] text-center font-bold text-sm text-avionics-text">{monthLabel(month)}</h1>
          <button type="button" onClick={() => setMonth(shiftMonth(month, 1))} aria-label="Следующий месяц" className="p-2 text-avionics-muted hover:text-avionics-text cursor-pointer">
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>

        <div className="grid grid-cols-2 sm:flex sm:flex-wrap gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,.txt,.csv"
            className="hidden"
            aria-label="Файл плана"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleFile(file);
              e.target.value = '';
            }}
          />
          {savedUrl ? (
            <button
              type="button"
              onClick={() => handleRosterRefresh(savedUrl)}
              disabled={isImporting}
              title={fetchedAt ? `Ростер обновлён ${minutesAgo(fetchedAt)}` : 'Загрузить ростер'}
              className="flex items-center justify-center space-x-1.5 px-3 py-2 rounded-xl bg-sky-500 hover:bg-sky-400 text-slate-950 text-xs font-bold cursor-pointer disabled:opacity-50"
            >
              {isImporting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
              <span>Обновить ростер</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setIsLinkFormOpen(!isLinkFormOpen)}
              aria-expanded={isLinkFormOpen}
              className="flex items-center justify-center space-x-1.5 px-3 py-2 rounded-xl bg-sky-500 hover:bg-sky-400 text-slate-950 text-xs font-bold cursor-pointer"
            >
              <Link2 className="w-3.5 h-3.5" />
              <span>Ростер по ссылке</span>
            </button>
          )}
          <button type="button" onClick={() => fileInputRef.current?.click()} disabled={isImporting} className={buttonClassName}>
            <Upload className="w-3.5 h-3.5 text-sky-400" />
            <span>План PDF</span>
          </button>
          <button
            type="button"
            onClick={handleAddFromLogbook}
            disabled={logbookMissing.length === 0}
            title="Рейсы из лётной книжки, которых нет в ростере или плане"
            className={buttonClassName}
          >
            <Plane className="w-3.5 h-3.5 text-sky-400" />
            <span>Из книжки ({logbookMissing.length})</span>
          </button>
          {drafts.length > 0 && (
            <button type="button" onClick={handleCreateDrafts} className={buttonClassName} title="Создать черновики рейсов в лётной книжке">
              <BookPlus className="w-3.5 h-3.5 text-sky-400" />
              <span>В книжку ({drafts.length})</span>
            </button>
          )}
          <button type="button" onClick={handlePdf} disabled={rows.length === 0} className={buttonClassName}>
            <FileText className="w-3.5 h-3.5 text-sky-400" />
            <span>Отчёт PDF</span>
          </button>
          <button type="button" onClick={handleExport} disabled={rows.length === 0} className={buttonClassName}>
            <Download className="w-3.5 h-3.5 text-sky-400" />
            <span>Excel</span>
          </button>
        </div>
      </div>

      {savedUrl && (
        <p className="flex flex-wrap items-center gap-x-2 text-2xs text-avionics-muted px-1">
          <span>
            Ростер подключён{fetchedAt ? `, обновлён ${minutesAgo(fetchedAt)}` : ''}. Обновляется сам при открытии приложения, не чаще раза в 3 часа.
          </span>
          <button type="button" onClick={() => setIsLinkFormOpen(!isLinkFormOpen)} className="text-sky-400 hover:underline cursor-pointer">
            Изменить ссылку
          </button>
        </p>
      )}

      {isLinkFormOpen && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleRosterRefresh();
          }}
          className="p-3 bg-avionics-surface border border-avionics-border rounded-2xl space-y-2"
        >
          <label htmlFor="roster-url" className="block text-xs font-semibold text-avionics-text">
            Ссылка на календарь ростера
          </label>
          <div className="flex flex-col sm:flex-row gap-2">
            <input
              id="roster-url"
              type="url"
              inputMode="url"
              autoComplete="off"
              placeholder="https://crew.aeroflot.ru/api/calendar/ics/…"
              value={rosterUrl}
              onChange={(e) => setRosterUrl(e.target.value)}
              className="flex-1 min-w-0 bg-avionics-card border border-avionics-border rounded-xl px-3 py-2 text-sm font-mono text-avionics-text focus:outline-none focus:border-sky-500"
            />
            <button
              type="submit"
              disabled={isImporting || !rosterUrl.trim()}
              className="flex items-center justify-center space-x-1.5 px-4 py-2 rounded-xl bg-sky-500 hover:bg-sky-400 text-slate-950 text-xs font-bold cursor-pointer disabled:opacity-50"
            >
              {isImporting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Link2 className="w-3.5 h-3.5" />}
              <span>Загрузить</span>
            </button>
          </div>
          <p className="text-2xs text-avionics-muted">
            Ссылка на .ics из crew.aeroflot.ru (раздел календаря). Она хранится только на этом устройстве. Рейсы сразу попадают
            в лётную книжку черновиками; изменения ростера применяются сами, а ваши правки важнее.
          </p>
        </form>
      )}

      {message && (
        <p role="status" className={`px-3 py-2 rounded-xl text-xs border ${message.isError ? 'bg-rose-500/10 border-rose-500/30 text-rose-400' : 'bg-sky-500/10 border-sky-500/30 text-avionics-text'}`}>
          {message.text}
        </p>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-2.5 sm:gap-3">
        <Tile
          label="Рабочее время"
          value={formatDutyLength(summary.totalMinutes)}
          hint={`${overtime > 0 ? 'Сверх нормы' : 'До нормы'} ${formatDutyLength(Math.abs(overtime))} · норма ${formatDutyLength(summary.normMinutes)}${summary.normApproximate ? '≈' : ''}`}
          tone={overtime > 0 ? 'warn' : undefined}
        />
        <Tile
          label="Полётное время"
          value={formatDutyLength(summary.flightTimeMinutes)}
          hint={`Лимит ${summary.flightLimitMinutes / 60} ч · блок ${formatDutyLength(summary.blockMinutes)}`}
          tone={summary.flightTimeMinutes > summary.flightLimitMinutes ? 'warn' : undefined}
        />
        <Tile label="Ночные 22–06" value={formatDutyLength(summary.nightMinutes)} hint={`Ночных смен: ${summary.nightDuties}`} />
        <Tile label="Смены" value={String(summary.duties.length)} hint={`Разделённых: ${summary.splitDuties} · рабочих дней: ${summary.workDays}`} />
        <Tile label="Предв. сумма" value={money(summary.estimatedPay)} hint="По вашим ставкам, до налогов" />
      </div>

      {dutyWarnings.length > 0 && (
        <div role="note" className="p-3 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-xs text-avionics-text space-y-1">
          <p className="flex items-center space-x-1.5 font-semibold">
            <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0" />
            <span>Проверьте по Приказу Минтранса № 139 (справочно)</span>
          </p>
          {dutyWarnings.map((warning, index) => (
            <p key={`${warning.date}-${index}`}>
              {warning.date && <span className="font-mono">{new Date(`${warning.date}T00:00`).toLocaleDateString('ru-RU')}: </span>}
              {warning.message}
            </p>
          ))}
        </div>
      )}

      <div className="flex items-center justify-between gap-2">
        <div role="tablist" aria-label="Вид" className="flex p-1 rounded-xl bg-avionics-surface border border-avionics-border text-xs font-semibold">
          {(
            [
              ['calendar', 'Календарь', LayoutGrid],
              ['list', 'Список', List],
            ] as const
          ).map(([id, label, Icon]) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={view === id}
              onClick={() => switchView(id)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg cursor-pointer ${view === id ? 'bg-sky-500 text-slate-950' : 'text-avionics-muted hover:text-avionics-text'}`}
            >
              <Icon className="w-3.5 h-3.5" />
              {label}
            </button>
          ))}
        </div>
        <button type="button" onClick={() => addRow(selectedDay ?? undefined)} className={buttonClassName}>
          <Plus className="w-3.5 h-3.5 text-sky-400" />
          <span>Запись</span>
        </button>
      </div>

      {view === 'calendar' ? (
        <>
          <WorkCalendar month={month} duties={allDuties} entries={rows} selected={selectedDay} onSelect={(date) => setSelectedDay(date === selectedDay ? null : date)} />
          {selectedDay && (
            <section className="space-y-2" aria-label="Выбранный день">
              <h2 className="text-sm font-bold text-avionics-text first-letter:uppercase">{dayLabel(selectedDay)}</h2>
              {selectedDuties.map((duty) => (
                <DutyTimeline
                  key={duty.startAt}
                  duty={duty}
                  onPatch={updateEntry}
                  previous={allDuties[allDuties.indexOf(duty) - 1]}
                  next={allDuties[allDuties.indexOf(duty) + 1]}
                />
              ))}
              {selectedOther.map((row) => (
                <EntryRow key={row.id} row={row} onUpdate={updateEntry} onRemove={removeEntry} compact />
              ))}
              {selectedDuties.length === 0 && selectedOther.length === 0 && (
                <p className="p-4 rounded-2xl bg-avionics-surface border border-avionics-border text-xs text-avionics-muted">
                  В этот день записей нет.{' '}
                  <button type="button" onClick={() => addRow(selectedDay)} className="text-sky-400 hover:underline cursor-pointer">
                    Добавить запись
                  </button>
                </p>
              )}
            </section>
          )}
        </>
      ) : (
        <section className="bg-avionics-surface border border-avionics-border rounded-2xl overflow-hidden">
          <div className="hidden xl:grid grid-cols-[130px_150px_minmax(0,1fr)_90px_90px_60px_120px_minmax(0,1fr)_32px] gap-2 px-3 py-2 border-b border-avionics-border text-2xs font-bold uppercase tracking-wider text-avionics-muted">
            <span>Дата UTC</span>
            <span>Вид</span>
            <span>Рейс / описание</span>
            <span>Начало UTC</span>
            <span>Конец UTC</span>
            <span>Часы</span>
            <span title="Связь с предыдущим рейсом">Смена</span>
            <span>Комментарий</span>
            <span />
          </div>
          {rows.length === 0 ? (
            <div className="p-10 text-center text-avionics-muted">
              <CalendarDays className="w-10 h-10 mx-auto mb-3 opacity-30" />
              <p className="text-sm font-semibold">За этот месяц записей нет</p>
              <p className="text-xs mt-1">Подключите ростер по ссылке, загрузите план в PDF или добавьте запись вручную.</p>
            </div>
          ) : (
            <ul className="divide-y divide-avionics-border">
              {rows.map((row) => (
                <EntryRow key={row.id} row={row} onUpdate={updateEntry} onRemove={removeEntry} />
              ))}
            </ul>
          )}
        </section>
      )}

      <section className="bg-avionics-surface border border-avionics-border rounded-2xl overflow-hidden">
        <button
          type="button"
          onClick={() => setIsRatesOpen(!isRatesOpen)}
          aria-expanded={isRatesOpen}
          className="w-full flex items-center justify-between px-4 py-3 text-xs font-bold uppercase tracking-wider text-avionics-text cursor-pointer"
        >
          <span>Правила и ставки</span>
          {isRatesOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </button>
        {isRatesOpen && (
          <div className="px-4 pb-4 grid grid-cols-2 lg:grid-cols-3 gap-3">
            <NumberSetting label="Явка до вылета, мин" value={rates.reportMinutes} onChange={(value) => updateRates({ ...rates, reportMinutes: value })} />
            <NumberSetting label="После выключения двигателей, мин" value={rates.releaseMinutes} onChange={(value) => updateRates({ ...rates, releaseMinutes: value })} />
            <NumberSetting label="С санчастью, мин" value={rates.medicalReleaseMinutes} onChange={(value) => updateRates({ ...rates, medicalReleaseMinutes: value })} />
            <label className="text-[11px] font-semibold text-avionics-muted">
              Стоянка, после которой смена закрывается
              <select value={rates.layoverMinutes} onChange={(e) => updateRates({ ...rates, layoverMinutes: Number(e.target.value) })} className={`${cellClassName} mt-1`}>
                {[10, 11, 12, 13, 14, 16].map((hours) => (
                  <option key={hours} value={hours * 60}>{hours} ч</option>
                ))}
              </select>
            </label>
            <label className="text-[11px] font-semibold text-avionics-muted">
              Полётное время в месяц
              <select value={rates.flightLimitHours} onChange={(e) => updateRates({ ...rates, flightLimitHours: Number(e.target.value) as 80 | 90 })} className={`${cellClassName} mt-1`}>
                <option value={80}>80 ч (п. 11)</option>
                <option value={90}>90 ч, с письменным согласием (п. 12)</option>
              </select>
            </label>
            <label className="text-[11px] font-semibold text-avionics-muted">
              Время в PDF-плане
              <select value={rates.planUtcOffsetMinutes ?? 180} onChange={(e) => updateRates({ ...rates, planUtcOffsetMinutes: Number(e.target.value) })} className={`${cellClassName} mt-1`}>
                {Array.from({ length: 27 }, (_, index) => (index - 12) * 60).map((offset) => (
                  <option key={offset} value={offset}>
                    {offset === 0 ? 'UTC' : `UTC${offset > 0 ? '+' : '−'}${Math.abs(offset / 60)}`}
                    {offset === 180 ? ' (МСК)' : ''}
                  </option>
                ))}
              </select>
            </label>
            <NumberSetting label="Оклад в месяц" value={rates.monthlyBase} onChange={(value) => updateRates({ ...rates, monthlyBase: value })} />
            {PAID_KINDS.map((kind) => (
              <NumberSetting
                key={kind}
                label={`${WORK_KIND_LABELS[kind]}, за час`}
                value={rates.hourly[kind] || 0}
                onChange={(value) => updateRates({ ...rates, hourly: { ...rates.hourly, [kind]: value } })}
              />
            ))}
            <label className="text-[11px] font-semibold text-avionics-muted">
              Ставка за рейсы от
              <select value={rates.flightPayBasis} onChange={(e) => updateRates({ ...rates, flightPayBasis: e.target.value as FlightPayBasis })} className={`${cellClassName} mt-1`}>
                <option value="duty">рабочего времени смены</option>
                <option value="block">налёта (блок)</option>
              </select>
            </label>
            <NumberSetting label="Доплата за ночные часы, %" value={rates.nightPercent} onChange={(value) => updateRates({ ...rates, nightPercent: value })} />
            <p className="col-span-2 lg:col-span-3 text-2xs text-avionics-muted">
              Смена — от явки до окончания после последнего выключения двигателей. Рейсы одной связки ростера (например, SU1204/SU1205) — одна
              смена, стоянка между ними входит в рабочее время. Ночёвка вне базы делает смену разделённой: отдых в гостинице не входит в рабочее время.
              Полёт пассажиром — рабочее время, в полётное засчитывается 50%. Ночные часы — с 22:00 до 06:00 МСК. Нормы — справочно, по Приказу
              Минтранса № 139; сумма предварительная и зависит от договора.
            </p>
          </div>
        )}
      </section>
    </div>
  );
};

const NumberSetting: React.FC<{ label: string; value: number; onChange: (value: number) => void }> = ({ label, value, onChange }) => (
  <label className="text-[11px] font-semibold text-avionics-muted">
    {label}
    <input
      type="number"
      min={0}
      defaultValue={value || ''}
      onBlur={(e) => Number(e.target.value || 0) !== value && onChange(Number(e.target.value) || 0)}
      className={`${cellClassName} mt-1 font-mono`}
    />
  </label>
);

interface EntryRowProps {
  row: WorkEntry;
  onUpdate: (entry: WorkEntry, patch: Partial<WorkEntry>) => void;
  onRemove: (id: string) => void;
  /** Inside a day card: no date column */
  compact?: boolean;
}

/** One work time row, edited in place; times are UTC */
const EntryRow: React.FC<EntryRowProps> = ({ row, onUpdate, onRemove, compact }) => (
  <li
    className={`grid grid-cols-2 md:grid-cols-4 gap-2 p-3 items-center ${
      compact
        ? 'rounded-2xl bg-avionics-surface border border-avionics-border list-none'
        : 'xl:grid-cols-[130px_150px_minmax(0,1fr)_90px_90px_60px_120px_minmax(0,1fr)_32px]'
    }`}
  >
    {!compact && (
      <input
        type="date"
        aria-label="Дата"
        defaultValue={row.date}
        onBlur={(e) => e.target.value && e.target.value !== row.date && onUpdate(row, { date: e.target.value })}
        className={`${cellClassName} font-mono`}
      />
    )}
    <select aria-label="Вид работы" value={row.kind} onChange={(e) => onUpdate(row, { kind: e.target.value as WorkKind })} className={cellClassName}>
      {(Object.keys(WORK_KIND_LABELS) as WorkKind[]).map((kind) => (
        <option key={kind} value={kind}>{WORK_KIND_LABELS[kind]}</option>
      ))}
    </select>
    <input
      type="text"
      aria-label="Рейс или описание"
      placeholder="Рейс, маршрут"
      defaultValue={row.title}
      onBlur={(e) => e.target.value !== row.title && onUpdate(row, { title: e.target.value })}
      className={`${cellClassName} col-span-2 ${compact ? '' : 'xl:col-span-1'} font-mono`}
    />
    <input
      type="time"
      aria-label="Начало, UTC"
      defaultValue={row.start}
      onBlur={(e) => e.target.value !== row.start && onUpdate(row, { start: e.target.value })}
      className={`${cellClassName} font-mono`}
    />
    <input
      type="time"
      aria-label="Конец, UTC"
      defaultValue={row.end}
      onBlur={(e) => e.target.value !== row.end && onUpdate(row, { end: e.target.value })}
      className={`${cellClassName} font-mono`}
    />
    <span className="text-xs font-mono font-bold text-avionics-text px-1">
      <span className={`${compact ? '' : 'xl:hidden'} text-avionics-muted font-normal`}>Часы: </span>
      {formatMinutesToHHMM(computeEntryMinutes(row.start, row.end))}
    </span>
    {row.kind === 'flight' && !compact ? (
      <label className="flex items-center gap-2 min-w-0 col-span-2 xl:col-span-1">
        <span className="xl:hidden text-xs text-avionics-muted shrink-0">Смена с предыдущим:</span>
        <select
          aria-label="Связь с предыдущим рейсом"
          value={row.dutyLink ?? 'auto'}
          onChange={(e) => onUpdate(row, { dutyLink: e.target.value as DutyLink })}
          className={`${cellClassName} flex-1 min-w-0`}
        >
          {(Object.keys(DUTY_LINK_LABELS) as DutyLink[]).map((link) => (
            <option key={link} value={link}>{DUTY_LINK_LABELS[link]}</option>
          ))}
        </select>
      </label>
    ) : (
      !compact && <span className="hidden xl:block text-xs text-avionics-muted px-1">—</span>
    )}
    <input
      type="text"
      aria-label="Комментарий"
      placeholder={row.kind === 'flight' ? 'Тип ВС, комментарий' : 'Комментарий'}
      defaultValue={row.note}
      onBlur={(e) => e.target.value !== row.note && onUpdate(row, { note: e.target.value })}
      className={`${cellClassName} col-span-2 md:col-span-1`}
    />
    <button type="button" onClick={() => onRemove(row.id)} aria-label="Удалить строку" className="justify-self-end p-1.5 text-avionics-muted hover:text-rose-400 cursor-pointer">
      <Trash2 className="w-3.5 h-3.5" />
    </button>
  </li>
);
