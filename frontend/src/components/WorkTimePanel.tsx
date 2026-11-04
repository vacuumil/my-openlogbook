import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  CalendarDays,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  AlertTriangle,
  BookPlus,
  Download,
  Loader2,
  Plane,
  Plus,
  Trash2,
  Upload,
} from 'lucide-react';
import { db, LocalFlight, WorkEntry, WorkKind } from '../db/db';
import { generateUUID } from '../utils/uuid';
import { toDateKey } from '../utils/dates';
import { getWorkRates, saveWorkRates, syncEngine } from '../services/syncEngine';
import {
  buildWorkCsv,
  computeEntryMinutes,
  entriesFromFlights,
  PAID_KINDS,
  parseDutyPlan,
  summarizeMonth,
  withoutDuplicates,
  WORK_KIND_LABELS,
  WorkRates,
  FlightPayBasis,
  formatClock,
  getDutyWarnings,
  getPlannedFlightMinutes,
} from '../utils/workTime';
import { formatMinutesToHHMM } from './FlightList';
import { buildDraftFlights } from '../utils/planDrafts';
import { resolveAirportCode } from '../utils/rosterParser';
import { airportService } from '../utils/airportService';
import { buildIataIndex } from '../utils/flightFilters';
import { MAJOR_AIRPORTS } from '../data/majorAirports';

const SYNC_DELAY_MS = 2000;

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

const money = (value: number) => value.toLocaleString('ru-RU', { maximumFractionDigits: 2 });

const Tile: React.FC<{ label: string; value: string; hint?: string }> = ({ label, value, hint }) => (
  <div className="p-3 sm:p-4 bg-avionics-surface border border-avionics-border rounded-2xl min-w-0">
    <div className="text-2xs sm:text-xs font-semibold uppercase tracking-wider text-avionics-muted truncate">{label}</div>
    <div className="mt-1 text-lg sm:text-2xl font-black font-mono text-avionics-text truncate">{value}</div>
    {hint && <div className="text-2xs text-avionics-muted truncate">{hint}</div>}
  </div>
);

export const WorkTimePanel: React.FC<WorkTimePanelProps> = ({ flights }) => {
  const [month, setMonth] = useState(() => toDateKey(new Date()).substring(0, 7));
  const [rates, setRates] = useState<WorkRates>(getWorkRates);
  const [isRatesOpen, setIsRatesOpen] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [message, setMessage] = useState<{ text: string; isError: boolean } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const syncTimerRef = useRef<number | undefined>(undefined);

  const entries = useLiveQuery(
    () => db.workEntries.where('date').startsWith(month).sortBy('date'),
    [month]
  );
  const rows = useMemo(
    () => [...(entries || [])].sort((a, b) => a.date.localeCompare(b.date) || a.start.localeCompare(b.start)),
    [entries]
  );
  const summary = useMemo(() => summarizeMonth(rows, rates), [rows, rates]);
  const dutyWarnings = useMemo(() => getDutyWarnings(summary.duties), [summary.duties]);
  const flightsInMonth = flights.filter((flight) => flight.date.startsWith(month)).length;

  // Plan flights not yet in the logbook become drafts the pilot confirms after flying
  const referenceAirports = useLiveQuery(() => db.airports.toArray(), []);
  const drafts = useMemo(() => {
    const known = [...MAJOR_AIRPORTS, ...(referenceAirports || [])];
    const roles = flights.filter((flight) => flight.flightRole && flight.status !== 'draft').slice(0, 30).map((flight) => flight.flightRole);
    const defaultRole = roles.sort((a, b) => roles.filter((r) => r === b).length - roles.filter((r) => r === a).length)[0];
    return buildDraftFlights(rows, flights, {
      utcOffsetMinutes: rates.planUtcOffsetMinutes ?? 180,
      iataIndex: buildIataIndex(known),
      airports: new Map(known.map((airport) => [airport.icao.toUpperCase(), airport])),
      defaultRole,
    });
  }, [rows, flights, referenceAirports, rates.planUtcOffsetMinutes]);

  const handleCreateDrafts = async () => {
    // Codes missing from the built-in list are looked up first, coordinates included, so drafts
    // get ICAO codes and night time even for smaller airports
    const known = [...MAJOR_AIRPORTS, ...(referenceAirports || [])];
    const iataIndex = buildIataIndex(known);
    const codes = Array.from(new Set(drafts.flatMap((draft) => [draft.depIcao, draft.arrIcao]).filter((code) => code.length === 3)));
    for (const code of codes) {
      const icao = await resolveAirportCode(code).catch(() => code);
      if (icao.length === 4) iataIndex.set(code, icao);
    }
    const icaos = Array.from(new Set(drafts.flatMap((draft) => [iataIndex.get(draft.depIcao) || draft.depIcao, iataIndex.get(draft.arrIcao) || draft.arrIcao])));
    const loaded = await airportService.preloadAirports(icaos).catch(() => new Map());
    const airportsByIcao = new Map(known.map((airport) => [airport.icao.toUpperCase(), airport]));
    loaded.forEach((airport, icao) => airportsByIcao.set(icao.toUpperCase(), airport));

    const resolvedDrafts = buildDraftFlights(rows, flights, {
      utcOffsetMinutes: rates.planUtcOffsetMinutes ?? 180,
      iataIndex,
      airports: airportsByIcao,
      defaultRole: drafts[0]?.flightRole,
    });
    await db.flights.bulkPut(resolvedDrafts);
    syncEngine.syncNow();
    setMessage({
      text: `В книжку добавлено черновиков: ${resolvedDrafts.length}. После полёта откройте каждый, внесите факт и сохраните.`,
      isError: false,
    });
  };

  useEffect(() => () => window.clearTimeout(syncTimerRef.current), []);

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

  const updateEntry = (id: string, patch: Partial<WorkEntry>) => mutate(() => db.workEntries.update(id, patch));
  const removeEntry = (id: string) => mutate(() => db.workEntries.delete(id));

  const addEntries = async (incoming: WorkEntry[]) => {
    const existing = await db.workEntries.toArray();
    const fresh = withoutDuplicates(existing, incoming);
    if (fresh.length > 0) await mutate(() => db.workEntries.bulkPut(fresh));
    return fresh;
  };

  const addRow = () => {
    const today = toDateKey(new Date());
    const date = today.startsWith(month) ? today : `${month}-01`;
    return mutate(() =>
      db.workEntries.add({ id: generateUUID(), date, kind: 'flight', title: '', start: '', end: '', nightMinutes: 0, note: '' })
    );
  };

  const handleAddFromLogbook = async () => {
    const fresh = await addEntries(entriesFromFlights(flights, month));
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
        // Usually the PDF reader itself failed to load: a stale page after an update, or the server
        // sending its worker with a wrong content type
        console.error('Plan file could not be read:', error);
        setMessage({
          text: isPdf
            ? 'Не удалось открыть PDF: модуль чтения не загрузился. Обновите страницу; если не поможет, файл может быть защищён паролем или повреждён.'
            : 'Не удалось прочитать файл.',
          isError: true,
        });
        return;
      }
      const parsed = parseDutyPlan(lines, month);
      if (parsed.length === 0) {
        setMessage({
          text: isPdf && lines.length === 0
            ? 'В PDF нет текста: похоже, это скан. Добавьте строки вручную.'
            : 'Не удалось распознать строки плана. Добавьте их вручную.',
          isError: true,
        });
        return;
      }
      const fresh = await addEntries(parsed);
      setMonth(parsed[0].date.substring(0, 7));
      // Plans that state their total flight time let the pilot see at once whether every leg was read
      const planned = getPlannedFlightMinutes(lines);
      const parsedFlightMinutes = parsed
        .filter((entry) => entry.kind === 'flight')
        .reduce((sum, entry) => sum + computeEntryMinutes(entry.start, entry.end), 0);
      const check =
        planned === null
          ? ''
          : planned === parsedFlightMinutes
            ? ` Налёт совпадает с планом: ${formatMinutesToHHMM(planned)}.`
            : ` Налёт по плану ${formatMinutesToHHMM(planned)}, распознано ${formatMinutesToHHMM(parsedFlightMinutes)}: проверьте строки.`;
      setMessage({
        text: `Распознано строк: ${parsed.length}, добавлено новых: ${fresh.length}.${check}`,
        isError: planned !== null && planned !== parsedFlightMinutes,
      });
    } catch (error) {
      console.error('Plan import failed:', error);
      setMessage({ text: 'Файл прочитан, но сохранить строки не удалось. Попробуйте ещё раз.', isError: true });
    } finally {
      setIsImporting(false);
    }
  };

  const updateRates = (next: WorkRates) => {
    setRates(next);
    saveWorkRates(next);
    scheduleSync();
  };

  const handleExport = () => {
    // The BOM makes Excel read the file as UTF-8
    const blob = new Blob([String.fromCharCode(0xfeff), buildWorkCsv(rows, rates)], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `work-time-${month}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const buttonClassName =
    'flex items-center justify-center space-x-1.5 px-3 py-2 rounded-xl bg-avionics-card border border-avionics-border text-xs font-semibold text-avionics-text hover:border-sky-500/50 transition-colors cursor-pointer disabled:opacity-50';

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
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={isImporting}
            className="flex items-center justify-center space-x-1.5 px-3 py-2 rounded-xl bg-sky-500 hover:bg-sky-400 text-slate-950 text-xs font-bold cursor-pointer disabled:opacity-50"
          >
            {isImporting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
            <span>Загрузить план</span>
          </button>
          <button type="button" onClick={handleAddFromLogbook} disabled={flightsInMonth === 0} className={buttonClassName}>
            <Plane className="w-3.5 h-3.5 text-sky-400" />
            <span>Из книжки ({flightsInMonth})</span>
          </button>
          {drafts.length > 0 && (
            <button type="button" onClick={handleCreateDrafts} className={buttonClassName} title="Создать черновики рейсов плана в лётной книжке">
              <BookPlus className="w-3.5 h-3.5 text-sky-400" />
              <span>В книжку ({drafts.length})</span>
            </button>
          )}
          <button type="button" onClick={addRow} className={buttonClassName}>
            <Plus className="w-3.5 h-3.5 text-sky-400" />
            <span>Строка</span>
          </button>
          <button type="button" onClick={handleExport} disabled={rows.length === 0} className={buttonClassName}>
            <Download className="w-3.5 h-3.5 text-sky-400" />
            <span>Excel (CSV)</span>
          </button>
        </div>
      </div>

      {message && (
        <p role="status" className={`px-3 py-2 rounded-xl text-xs border ${
          message.isError ? 'bg-rose-500/10 border-rose-500/30 text-rose-400' : 'bg-sky-500/10 border-sky-500/30 text-avionics-text'
        }`}>
          {message.text}
        </p>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-3">
        <Tile label="Рабочее время" value={formatMinutesToHHMM(summary.totalMinutes)} hint={`Смены с рейсами: ${formatMinutesToHHMM(summary.minutesByKind.flight || 0)}`} />
        <Tile label="Налёт (блок)" value={formatMinutesToHHMM(summary.blockMinutes)} hint={`Ночью: ${formatMinutesToHHMM(summary.nightMinutes)}`} />
        <Tile label="Рабочих дней" value={String(summary.workDays)} hint={`Смен с рейсами: ${summary.duties.length}`} />
        <Tile label="Предв. сумма" value={money(summary.estimatedPay)} hint="По вашим ставкам, до налогов" />
      </div>

      <section className="bg-avionics-surface border border-avionics-border rounded-2xl overflow-hidden">
        <button
          type="button"
          onClick={() => setIsRatesOpen(!isRatesOpen)}
          aria-expanded={isRatesOpen}
          className="w-full flex items-center justify-between px-4 py-3 text-xs font-bold uppercase tracking-wider text-avionics-text cursor-pointer"
        >
          <span>Ставки для расчёта</span>
          {isRatesOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </button>
        {isRatesOpen && (
          <div className="px-4 pb-4 grid grid-cols-2 lg:grid-cols-3 gap-3">
            <label className="text-[11px] font-semibold text-avionics-muted">
              Оклад в месяц
              <input
                type="number"
                min={0}
                defaultValue={rates.monthlyBase || ''}
                onBlur={(e) => updateRates({ ...rates, monthlyBase: Number(e.target.value) || 0 })}
                className={`${cellClassName} mt-1 font-mono`}
              />
            </label>
            {PAID_KINDS.map((kind) => (
              <label key={kind} className="text-[11px] font-semibold text-avionics-muted">
                {WORK_KIND_LABELS[kind]}, за час
                <input
                  type="number"
                  min={0}
                  defaultValue={rates.hourly[kind] || ''}
                  onBlur={(e) => updateRates({ ...rates, hourly: { ...rates.hourly, [kind]: Number(e.target.value) || 0 } })}
                  className={`${cellClassName} mt-1 font-mono`}
                />
              </label>
            ))}
            <label className="text-[11px] font-semibold text-avionics-muted">
              Явка до вылета, мин
              <input
                type="number"
                min={0}
                defaultValue={rates.reportMinutes}
                onBlur={(e) => updateRates({ ...rates, reportMinutes: Number(e.target.value) || 0 })}
                className={`${cellClassName} mt-1 font-mono`}
              />
            </label>
            <label className="text-[11px] font-semibold text-avionics-muted">
              После выключения двигателей, мин
              <input
                type="number"
                min={0}
                defaultValue={rates.releaseMinutes}
                onBlur={(e) => updateRates({ ...rates, releaseMinutes: Number(e.target.value) || 0 })}
                className={`${cellClassName} mt-1 font-mono`}
              />
            </label>
            <label className="text-[11px] font-semibold text-avionics-muted">
              Время в плане
              <select
                value={rates.planUtcOffsetMinutes ?? 180}
                onChange={(e) => updateRates({ ...rates, planUtcOffsetMinutes: Number(e.target.value) })}
                className={`${cellClassName} mt-1`}
              >
                {Array.from({ length: 27 }, (_, index) => (index - 12) * 60).map((offset) => (
                  <option key={offset} value={offset}>
                    {offset === 0 ? 'UTC' : `UTC${offset > 0 ? '+' : '−'}${Math.abs(offset / 60)}`}
                    {offset === 180 ? ' (МСК)' : ''}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-[11px] font-semibold text-avionics-muted">
              Ставка за рейсы от
              <select
                value={rates.flightPayBasis}
                onChange={(e) => updateRates({ ...rates, flightPayBasis: e.target.value as FlightPayBasis })}
                className={`${cellClassName} mt-1`}
              >
                <option value="duty">рабочего времени смены</option>
                <option value="block">налёта (блок)</option>
              </select>
            </label>
            <label className="text-[11px] font-semibold text-avionics-muted">
              Доплата за ночь, %
              <input
                type="number"
                min={0}
                defaultValue={rates.nightPercent || ''}
                onBlur={(e) => updateRates({ ...rates, nightPercent: Number(e.target.value) || 0 })}
                className={`${cellClassName} mt-1 font-mono`}
              />
            </label>
            <p className="col-span-2 lg:col-span-3 text-2xs text-avionics-muted">
              Рабочее время смены: от явки до первого вылета до окончания после последнего выключения двигателей.
              Участки с перерывом до 4 часов считаются одной сменой. Сумма предварительная: точный расчёт зависит
              от договора и правил вашей авиакомпании.
            </p>
          </div>
        )}
      </section>

      {summary.duties.length > 0 && (
        <section className="bg-avionics-surface border border-avionics-border rounded-2xl p-4">
          <h2 className="text-xs font-bold uppercase tracking-wider text-avionics-text mb-3">Смены с рейсами</h2>
          {dutyWarnings.length > 0 && (
            <div role="note" className="mb-3 p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-xs text-avionics-text space-y-1">
              <p className="flex items-center space-x-1.5 font-semibold">
                <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                <span>Проверьте нормы рабочего времени (справочно, по EASA ORO.FTL)</span>
              </p>
              {dutyWarnings.map((warning, index) => (
                <p key={`${warning.date}-${index}`}>
                  <span className="font-mono">{new Date(`${warning.date}T00:00`).toLocaleDateString('ru-RU')}</span>: {warning.message}
                </p>
              ))}
            </div>
          )}
          <ul className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-2">
            {summary.duties.map((duty) => (
              <li key={`${duty.date}-${duty.reportAt}`} className="p-3 rounded-xl bg-avionics-card text-xs">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="font-semibold text-avionics-text">
                    {new Date(`${duty.date}T00:00`).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' })}
                  </span>
                  <span className="font-mono font-bold text-avionics-text">{formatMinutesToHHMM(duty.minutes)}</span>
                </div>
                <div className="mt-1 font-mono text-avionics-muted">
                  {formatClock(duty.reportAt)} – {formatClock(duty.releaseAt)} · налёт {formatMinutesToHHMM(duty.blockMinutes)}
                </div>
                <div className="mt-0.5 text-avionics-muted truncate">
                  {duty.legs.map((leg) => leg.title || '—').join(', ')}
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="bg-avionics-surface border border-avionics-border rounded-2xl overflow-hidden">
        <div className="hidden lg:grid grid-cols-[130px_150px_minmax(0,1fr)_90px_90px_60px_70px_minmax(0,1fr)_32px] gap-2 px-3 py-2 border-b border-avionics-border text-2xs font-bold uppercase tracking-wider text-avionics-muted">
          <span>Дата</span>
          <span>Вид</span>
          <span>Рейс / описание</span>
          <span>Начало</span>
          <span>Конец</span>
          <span>Часы</span>
          <span>Ночь, мин</span>
          <span>Комментарий</span>
          <span />
        </div>

        {rows.length === 0 ? (
          <div className="p-10 text-center text-avionics-muted">
            <CalendarDays className="w-10 h-10 mx-auto mb-3 opacity-30" />
            <p className="text-sm font-semibold">За этот месяц записей нет</p>
            <p className="text-xs mt-1">Загрузите план в PDF, возьмите рейсы из книжки или добавьте строку вручную.</p>
          </div>
        ) : (
          <ul className="divide-y divide-avionics-border">
            {rows.map((row) => (
              <li
                key={row.id}
                className="grid grid-cols-2 lg:grid-cols-[130px_150px_minmax(0,1fr)_90px_90px_60px_70px_minmax(0,1fr)_32px] gap-2 p-3 items-center"
              >
                <input
                  type="date"
                  aria-label="Дата"
                  defaultValue={row.date}
                  onBlur={(e) => e.target.value && e.target.value !== row.date && updateEntry(row.id, { date: e.target.value })}
                  className={`${cellClassName} font-mono`}
                />
                <select
                  aria-label="Вид работы"
                  value={row.kind}
                  onChange={(e) => updateEntry(row.id, { kind: e.target.value as WorkKind })}
                  className={cellClassName}
                >
                  {(Object.keys(WORK_KIND_LABELS) as WorkKind[]).map((kind) => (
                    <option key={kind} value={kind}>{WORK_KIND_LABELS[kind]}</option>
                  ))}
                </select>
                <input
                  type="text"
                  aria-label="Рейс или описание"
                  placeholder="Рейс, маршрут"
                  defaultValue={row.title}
                  onBlur={(e) => e.target.value !== row.title && updateEntry(row.id, { title: e.target.value })}
                  className={`${cellClassName} col-span-2 lg:col-span-1 font-mono`}
                />
                <input
                  type="time"
                  aria-label="Начало"
                  defaultValue={row.start}
                  onBlur={(e) => e.target.value !== row.start && updateEntry(row.id, { start: e.target.value })}
                  className={`${cellClassName} font-mono`}
                />
                <input
                  type="time"
                  aria-label="Конец"
                  defaultValue={row.end}
                  onBlur={(e) => e.target.value !== row.end && updateEntry(row.id, { end: e.target.value })}
                  className={`${cellClassName} font-mono`}
                />
                <span className="text-xs font-mono font-bold text-avionics-text px-1">
                  <span className="lg:hidden text-avionics-muted font-normal">Часы: </span>
                  {formatMinutesToHHMM(computeEntryMinutes(row.start, row.end))}
                </span>
                <input
                  type="number"
                  min={0}
                  aria-label="Ночные минуты"
                  placeholder="Ночь, мин"
                  defaultValue={row.nightMinutes || ''}
                  onBlur={(e) => {
                    const nightMinutes = Number(e.target.value) || 0;
                    if (nightMinutes !== row.nightMinutes) updateEntry(row.id, { nightMinutes });
                  }}
                  className={`${cellClassName} font-mono`}
                />
                <input
                  type="text"
                  aria-label="Комментарий"
                  placeholder="Комментарий"
                  defaultValue={row.note}
                  onBlur={(e) => e.target.value !== row.note && updateEntry(row.id, { note: e.target.value })}
                  className={`${cellClassName} col-span-2 lg:col-span-1`}
                />
                <button
                  type="button"
                  onClick={() => removeEntry(row.id)}
                  aria-label="Удалить строку"
                  className="justify-self-end p-1.5 text-avionics-muted hover:text-rose-400 cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
};
