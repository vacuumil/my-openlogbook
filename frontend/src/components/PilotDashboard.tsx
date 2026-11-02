import React, { useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  AlertCircle,
  ArrowRight,
  Calendar,
  CheckCircle2,
  ChevronRight,
  Clock,
  CloudOff,
  CloudSun,
  Download,
  Gauge,
  MapPin,
  Moon,
  Plus,
  ShieldCheck,
  TrendingUp,
  Trophy,
  Upload,
  UserCheck,
} from 'lucide-react';
import { db, LocalFlight, LocalAirport } from '../db/db';
import { FlightMap } from './FlightMap';
import { formatMinutesToHHMM } from './FlightList';
import { getStoredPilotProfile } from './AuthModal';
import { computeCurrency, computeFlightLimits, daysUntil, getCurrencyAlerts } from '../utils/currency';
import { computePeriodComparison, computeRecords, computeTotals } from '../utils/flightStats';
import { parseFlightDate } from '../utils/dates';

const EXPIRY_WARNING_DAYS = 90;
const EXPIRY_CRITICAL_DAYS = 30;

interface PilotDashboardProps {
  flights: LocalFlight[];
  airports: LocalAirport[];
  currentUser: any;
  theme: 'dark' | 'light';
  onOpenNewFlight: () => void;
  onOpenWeather: () => void;
  onOpenImport: () => void;
  onOpenExport: () => void;
  onSelectFlight: (flight: LocalFlight) => void;
  onNavigateToFlights: () => void;
  onNavigateToMap?: () => void;
  onNavigateToCurrency: () => void;
  onShowPendingFlights: () => void;
}

interface AttentionItem {
  key: string;
  severity: 'critical' | 'warning';
  text: string;
  onClick: () => void;
}

const formatDate = (date: Date) => date.toLocaleDateString('ru-RU');

const KpiCard: React.FC<{ label: string; value: string; hint: string; icon: React.ReactNode; valueClassName: string }> = ({
  label,
  value,
  hint,
  icon,
  valueClassName,
}) => (
  <div className="p-3.5 sm:p-5 rounded-2xl bg-avionics-surface border border-avionics-border shadow-sm min-w-0 overflow-hidden">
    <div className="flex items-center justify-between text-avionics-muted text-2xs sm:text-xs font-semibold uppercase tracking-wider">
      <span className="truncate mr-1">{label}</span>
      {icon}
    </div>
    <div className={`mt-1.5 text-xl sm:text-2xl lg:text-3xl font-black font-mono truncate ${valueClassName}`}>{value}</div>
    <div className="text-2xs text-avionics-muted mt-1 truncate">{hint}</div>
  </div>
);

const PeriodRow: React.FC<{ label: string; current: number; previous: number; previousLabel: string }> = ({
  label,
  current,
  previous,
  previousLabel,
}) => (
  <div className="flex items-baseline justify-between gap-3">
    <div className="min-w-0">
      <div className="text-xs font-semibold text-avionics-text">{label}</div>
      <div className="text-2xs text-avionics-muted truncate">
        {previousLabel}: <span className="font-mono">{formatMinutesToHHMM(previous)}</span>
      </div>
    </div>
    <div className="font-mono font-black text-lg text-avionics-text shrink-0">{formatMinutesToHHMM(current)}</div>
  </div>
);

export const PilotDashboard: React.FC<PilotDashboardProps> = ({
  flights,
  airports,
  currentUser,
  theme,
  onOpenNewFlight,
  onOpenWeather,
  onOpenImport,
  onOpenExport,
  onSelectFlight,
  onNavigateToFlights,
  onNavigateToMap,
  onNavigateToCurrency,
  onShowPendingFlights,
}) => {
  const qualifications = useLiveQuery(() => db.qualifications.toArray()) || [];
  const profile = getStoredPilotProfile();
  const today = new Date();

  const totals = useMemo(() => computeTotals(flights, profile), [flights]);
  const currency = useMemo(() => computeCurrency(flights), [flights]);
  const limits = useMemo(() => computeFlightLimits(flights), [flights]);
  const periods = useMemo(() => computePeriodComparison(flights), [flights]);
  const records = useMemo(() => computeRecords(flights), [flights]);

  const recentFlights = useMemo(
    () => [...flights].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 4),
    [flights]
  );

  const pendingFlights = flights.filter((flight) => flight.syncStatus !== 'synced');
  const rejectedFlights = flights.filter((flight) => flight.syncError);

  const attentionItems = useMemo(() => {
    const items: AttentionItem[] = [];

    if (rejectedFlights.length > 0) {
      items.push({
        key: 'rejected',
        severity: 'critical',
        text: `Сервер не принял рейсы: ${rejectedFlights.length}. Откройте их и исправьте данные.`,
        onClick: onShowPendingFlights,
      });
    } else if (pendingFlights.length > 0) {
      items.push({
        key: 'pending',
        severity: 'warning',
        text: `Ждут синхронизации рейсы: ${pendingFlights.length}.`,
        onClick: onShowPendingFlights,
      });
    }

    qualifications.forEach((qualification) => {
      const days = daysUntil(parseFlightDate(qualification.expiresAt), today);
      if (days > EXPIRY_WARNING_DAYS) return;
      items.push({
        key: qualification.id,
        severity: days < EXPIRY_CRITICAL_DAYS ? 'critical' : 'warning',
        text: days < 0
          ? `${qualification.name}: срок истёк ${formatDate(parseFlightDate(qualification.expiresAt))}`
          : `${qualification.name}: осталось дней ${days}`,
        onClick: onNavigateToCurrency,
      });
    });

    getCurrencyAlerts(currency, today).forEach(({ aircraftType, validUntil, isExpired }) => {
      items.push({
        key: `currency-${aircraftType}`,
        severity: isExpired ? 'critical' : 'warning',
        text: `${aircraftType}: допуск 90 дней ${isExpired ? 'истёк' : 'истекает'} ${formatDate(validUntil)}`,
        onClick: onNavigateToCurrency,
      });
    });

    return items.sort((a, b) => Number(a.severity !== 'critical') - Number(b.severity !== 'critical'));
  }, [qualifications, currency, pendingFlights.length, rejectedFlights.length]);

  const currentTypes = currency.filter((item) => item.easaDay.isCurrent);
  const pilotName = currentUser?.full_name || currentUser?.email?.split('@')[0] || 'пилот';
  const quickActions = [
    { label: 'Погода', icon: <CloudSun className="w-4 h-4" />, onClick: onOpenWeather },
    { label: 'Импорт', icon: <Upload className="w-4 h-4" />, onClick: onOpenImport },
    { label: 'Экспорт', icon: <Download className="w-4 h-4" />, onClick: onOpenExport },
  ];

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* 1. Greeting & quick actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-lg sm:text-2xl font-black text-avionics-text truncate">Здравствуйте, {pilotName}</h1>
          <p className="text-xs text-avionics-muted">
            {today.toLocaleDateString('ru-RU', { weekday: 'long', day: 'numeric', month: 'long' })}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {quickActions.map(({ label, icon, onClick }) => (
            <button
              key={label}
              type="button"
              onClick={onClick}
              className="flex-1 sm:flex-none flex items-center justify-center space-x-1.5 px-3 py-2 rounded-xl bg-avionics-surface border border-avionics-border text-xs font-semibold text-avionics-text hover:border-sky-500/50 transition-colors cursor-pointer"
            >
              <span className="text-sky-400">{icon}</span>
              <span>{label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* 2. Attention */}
      {attentionItems.length > 0 && (
        <section aria-label="Требует внимания" className="bg-avionics-surface border border-amber-500/30 rounded-2xl p-3 sm:p-4 space-y-1">
          <h2 className="text-xs font-bold uppercase tracking-wider text-avionics-text px-1 pb-1">Требует внимания</h2>
          {attentionItems.map((item) => (
            <button
              key={item.key}
              type="button"
              onClick={item.onClick}
              className="w-full flex items-center gap-2 px-1 py-1.5 rounded-lg text-left text-xs text-avionics-text hover:bg-avionics-card cursor-pointer"
            >
              <AlertCircle className={`w-4 h-4 shrink-0 ${item.severity === 'critical' ? 'text-rose-400' : 'text-amber-400'}`} />
              <span className="flex-1 min-w-0">{item.text}</span>
              <ChevronRight className="w-4 h-4 text-avionics-muted shrink-0" />
            </button>
          ))}
        </section>
      )}

      {/* 3. Key statistics */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <KpiCard
          label="Общий налёт"
          value={formatMinutesToHHMM(totals.totalMinutes)}
          hint={profile.previousTotalHours ? `Рейсов: ${flights.length}, с переносом ${profile.previousTotalHours} ч` : `Рейсов: ${flights.length}`}
          icon={<Clock className="w-4 h-4 text-sky-400 shrink-0" />}
          valueClassName="text-sky-400"
        />
        <KpiCard
          label="Ночной налёт"
          value={formatMinutesToHHMM(totals.nightMinutes)}
          hint={totals.totalMinutes > 0 ? `${Math.round((totals.nightMinutes / totals.totalMinutes) * 100)}% от общего налёта` : '0%'}
          icon={<Moon className="w-4 h-4 text-indigo-400 shrink-0" />}
          valueClassName="text-indigo-400"
        />
        <KpiCard
          label="Командир (PIC)"
          value={formatMinutesToHHMM(totals.picMinutes)}
          hint={`SIC: ${formatMinutesToHHMM(totals.sicMinutes)}`}
          icon={<ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />}
          valueClassName="text-emerald-400"
        />
        <button
          type="button"
          onClick={onNavigateToCurrency}
          className="p-3.5 sm:p-5 rounded-2xl bg-avionics-surface border border-avionics-border shadow-sm min-w-0 overflow-hidden text-left hover:border-sky-500/50 transition-colors cursor-pointer"
        >
          <div className="flex items-center justify-between text-avionics-muted text-2xs sm:text-xs font-semibold uppercase tracking-wider">
            <span className="truncate mr-1">Правило 90 дней (оценка)</span>
            <UserCheck className="w-4 h-4 text-amber-400 shrink-0" />
          </div>
          <div className="mt-1.5 text-xl sm:text-2xl lg:text-3xl font-black font-mono text-avionics-text truncate">
            {currentTypes.length} / {currency.length}
          </div>
          <div className="text-2xs mt-1 truncate">
            {currentTypes.length > 0 ? (
              <span className="text-emerald-400 font-bold flex items-center truncate">
                <CheckCircle2 className="w-3 h-3 mr-1 shrink-0" />
                <span className="truncate">{currentTypes.map((item) => item.aircraftType).join(', ')}</span>
              </span>
            ) : (
              <span className="text-amber-400 font-bold flex items-center truncate">
                <AlertCircle className="w-3 h-3 mr-1 shrink-0" />
                <span className="truncate">Нет действующих типов</span>
              </span>
            )}
          </div>
        </button>
      </div>

      {/* 4. Limits & periods */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 sm:gap-4">
        <section className="lg:col-span-2 bg-avionics-surface border border-avionics-border rounded-2xl p-4 sm:p-5 space-y-3">
          <h2 className="text-xs font-bold uppercase tracking-wider text-avionics-text flex items-center space-x-2">
            <Gauge className="w-4 h-4 text-sky-400" />
            <span>Лимиты налёта EASA ORO.FTL.210</span>
          </h2>
          {limits.map((limit) => {
            const percent = Math.min(limit.ratio * 100, 100);
            const barColor = limit.ratio >= 1 ? 'bg-rose-500' : limit.ratio >= 0.85 ? 'bg-amber-500' : 'bg-sky-500';
            return (
              <div key={limit.key}>
                <div className="flex items-baseline justify-between gap-2 text-xs">
                  <span className="text-avionics-muted truncate">{limit.label}</span>
                  <span className="font-mono font-bold text-avionics-text shrink-0">
                    {formatMinutesToHHMM(limit.minutes)} / {limit.limitMinutes / 60}:00
                  </span>
                </div>
                <div
                  role="progressbar"
                  aria-label={limit.label}
                  aria-valuenow={Math.round(percent)}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  className="mt-1 h-1.5 rounded-full bg-avionics-card overflow-hidden"
                >
                  <div className={`h-full rounded-full ${barColor}`} style={{ width: `${percent}%` }} />
                </div>
              </div>
            );
          })}
          <p className="text-2xs text-avionics-muted">Справочно. Действующие лимиты определяются правилами вашего оператора.</p>
        </section>

        <section className="bg-avionics-surface border border-avionics-border rounded-2xl p-4 sm:p-5 space-y-3">
          <h2 className="text-xs font-bold uppercase tracking-wider text-avionics-text flex items-center space-x-2">
            <TrendingUp className="w-4 h-4 text-sky-400" />
            <span>Налёт по периодам</span>
          </h2>
          <PeriodRow label="Этот месяц" current={periods.thisMonth} previous={periods.lastMonth} previousLabel="Прошлый месяц" />
          <PeriodRow label="Этот год" current={periods.thisYear} previous={periods.lastYear} previousLabel="Прошлый год" />
        </section>
      </div>

      {/* 5. Map */}
      <section className="bg-avionics-surface border border-avionics-border rounded-3xl p-3 sm:p-5 shadow-sm space-y-3">
        <h2 className="text-xs sm:text-sm font-bold uppercase tracking-wider text-avionics-text flex items-center space-x-2">
          <MapPin className="w-4 h-4 text-sky-400" />
          <span>Карта полётов</span>
        </h2>
        <FlightMap flights={flights} airports={airports} theme={theme} variant="dashboard" onOpenFullMap={onNavigateToMap} />
      </section>

      {/* 6. Recent flights */}
      <section className="bg-avionics-surface border border-avionics-border rounded-3xl p-4 sm:p-6 shadow-sm space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-avionics-border">
          <h2 className="text-xs sm:text-sm font-bold uppercase tracking-wider text-avionics-text flex items-center space-x-2">
            <Calendar className="w-4 h-4 text-sky-400" />
            <span>Недавние рейсы</span>
          </h2>
          <button
            type="button"
            onClick={onNavigateToFlights}
            className="text-xs text-sky-400 hover:text-sky-300 font-semibold flex items-center space-x-1 cursor-pointer"
          >
            <span>Все рейсы ({flights.length})</span>
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>

        {recentFlights.length === 0 ? (
          <div className="p-8 text-center text-avionics-muted space-y-3">
            <Clock className="w-10 h-10 mx-auto opacity-30 text-sky-400" />
            <p className="text-sm">Записей о рейсах пока нет. Внесите первый рейс или импортируйте ростер.</p>
            <div className="flex justify-center gap-2">
              <button
                type="button"
                onClick={onOpenNewFlight}
                className="flex items-center space-x-1.5 px-4 py-2 bg-sky-500 hover:bg-sky-400 text-slate-950 font-bold text-xs rounded-xl cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>Новый рейс</span>
              </button>
              <button
                type="button"
                onClick={onOpenImport}
                className="px-4 py-2 border border-avionics-border text-avionics-text font-bold text-xs rounded-xl cursor-pointer"
              >
                Импорт
              </button>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {recentFlights.map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => onSelectFlight(f)}
                className="p-4 rounded-2xl bg-avionics-card border border-avionics-border transition-all cursor-pointer flex flex-col justify-between group hover:border-sky-500/40 space-y-3 text-left"
              >
                <div className="w-full flex items-center justify-between">
                  <div className="flex items-center space-x-1.5">
                    <span className="font-mono font-black text-sky-400 text-base">{f.depIcao}</span>
                    <ArrowRight className="w-3.5 h-3.5 text-avionics-muted" />
                    <span className="font-mono font-black text-sky-400 text-base">{f.arrIcao}</span>
                  </div>
                  <span className="text-2xs font-mono text-avionics-muted truncate ml-2">{f.aircraftReg}</span>
                </div>
                <div className="w-full flex items-center justify-between text-2xs text-avionics-muted">
                  <span>
                    {parseFlightDate(f.date).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })} • {f.aircraftType}
                  </span>
                  <span className="text-emerald-400 font-bold font-mono">{f.flightRole}</span>
                </div>
                <div className="w-full pt-2 border-t border-avionics-border/60 flex items-center justify-between">
                  <span className="font-mono font-bold text-sm text-avionics-text">{formatMinutesToHHMM(f.totalTimeMinutes)}</span>
                  {f.nightTimeMinutes > 0 && (
                    <span className="text-2xs text-indigo-400 font-mono">Ночь: {formatMinutesToHHMM(f.nightTimeMinutes)}</span>
                  )}
                </div>
              </button>
            ))}
          </div>
        )}
      </section>

      {/* 7. Personal records */}
      {records.longestFlight && (
        <section className="bg-avionics-surface border border-avionics-border rounded-2xl p-4 sm:p-5">
          <h2 className="text-xs font-bold uppercase tracking-wider text-avionics-text flex items-center space-x-2 mb-3">
            <Trophy className="w-4 h-4 text-amber-400" />
            <span>Личные рекорды</span>
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
            <div>
              <div className="text-avionics-muted">Самый длинный рейс</div>
              <div className="font-mono font-bold text-avionics-text">
                {records.longestFlight.depIcao}–{records.longestFlight.arrIcao}, {formatMinutesToHHMM(records.longestFlight.totalTimeMinutes)}
              </div>
            </div>
            {records.topRoute && (
              <div>
                <div className="text-avionics-muted">Самый частый маршрут</div>
                <div className="font-mono font-bold text-avionics-text">
                  {records.topRoute.dep} ↔ {records.topRoute.arr}, {records.topRoute.count}
                </div>
              </div>
            )}
            {records.bestMonth && (
              <div>
                <div className="text-avionics-muted">Самый активный месяц</div>
                <div className="font-mono font-bold text-avionics-text">
                  {parseFlightDate(`${records.bestMonth.key}-01`).toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' })},{' '}
                  {formatMinutesToHHMM(records.bestMonth.minutes)}
                </div>
              </div>
            )}
          </div>
        </section>
      )}

    </div>
  );
};
