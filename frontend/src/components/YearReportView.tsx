import React, { useMemo, useState } from 'react';
import { Download, MapPin, Moon, Plane, Share2, Sparkles, Timer, Trophy } from 'lucide-react';
import { LocalAirport, LocalFlight } from '../db/db';
import { availableYears, computeYearReport, MONTH_NAMES } from '../utils/analytics';
import { percentChange } from '../utils/statistics';
import { formatMinutesToHHMM } from './FlightList';
import { FlightMap } from './FlightMap';
import { drawYearReportImage } from '../utils/yearReportImage';
import { isFlightTime } from '../utils/entries';

interface YearReportViewProps {
  flights: LocalFlight[];
  airports: LocalAirport[];
  theme: 'dark' | 'light';
}

const Highlight: React.FC<{ icon: React.ReactNode; label: string; value: string; hint?: string }> = ({ icon, label, value, hint }) => (
  <div className="p-3 rounded-xl bg-avionics-card min-w-0">
    <div className="flex items-center space-x-1.5 text-2xs font-semibold uppercase tracking-wider text-avionics-muted">
      <span className="text-sky-400">{icon}</span>
      <span className="truncate">{label}</span>
    </div>
    <div className="mt-1 font-bold text-sm text-avionics-text truncate">{value}</div>
    {hint && <div className="text-2xs text-avionics-muted truncate">{hint}</div>}
  </div>
);

export const YearReportView: React.FC<YearReportViewProps> = ({ flights, airports, theme }) => {
  const years = useMemo(() => availableYears(flights), [flights]);
  const [year, setYear] = useState(() => years[0] ?? new Date().getFullYear());
  const report = useMemo(() => computeYearReport(flights, year), [flights, year]);
  const yearFlights = useMemo(() => flights.filter((flight) => flight.date.startsWith(String(year))), [flights, year]);
  const [status, setStatus] = useState<string | null>(null);

  const change = report.previous ? percentChange(report.totals.minutes, report.previous.minutes) : null;
  const summary = [
    `Мой ${year} год в OpenLogBook`,
    `Налёт ${formatMinutesToHHMM(report.totals.minutes)}, рейсов ${report.totals.flights}, ночью ${formatMinutesToHHMM(report.totals.nightMinutes)}`,
    `Аэродромов ${report.airports.length}, новых ${report.newAirports.length}`,
    report.topRoute ? `Чаще всего: ${report.topRoute.dep}–${report.topRoute.arr}` : '',
  ].filter(Boolean).join('\n');

  const handleShare = async () => {
    try {
      if (navigator.share) {
        await navigator.share({ title: `Итоги ${year}`, text: summary });
      } else {
        await navigator.clipboard.writeText(summary);
        setStatus('Текст итогов скопирован');
      }
    } catch {
      // The pilot closed the share sheet
    }
  };

  const handleSaveImage = async () => {
    try {
      await document.fonts?.ready;
      const canvas = drawYearReportImage({ report, flights: yearFlights.filter(isFlightTime), airports, formatDuration: formatMinutesToHHMM });
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
      if (!blob) throw new Error('Empty image');
      const file = new File([blob], `итоги-${year}.png`, { type: 'image/png' });
      // On phones the share sheet saves to the gallery or sends to a chat in one step
      if (navigator.canShare?.({ files: [file] })) {
        try {
          await navigator.share({ files: [file], title: `Итоги ${year}` });
          return;
        } catch (error) {
          if ((error as Error).name === 'AbortError') return;
        }
      }
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = file.name;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (error) {
      console.error('Year report image failed:', error);
      setStatus('Не удалось сохранить картинку');
    }
  };

  if (years.length === 0) {
    return <p className="p-8 text-center text-sm text-avionics-muted">Итоги появятся после первого рейса.</p>;
  }

  return (
    <div className="space-y-3 sm:space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <select
          value={year}
          onChange={(e) => setYear(Number(e.target.value))}
          aria-label="Год"
          className="bg-avionics-surface border border-avionics-border rounded-xl px-3 py-2 text-sm font-bold text-avionics-text focus:outline-none focus:border-sky-500"
        >
          {years.map((value) => (
            <option key={value} value={value}>{value}</option>
          ))}
        </select>
        <button type="button" onClick={handleShare} className="flex items-center space-x-1.5 px-3 py-2 rounded-xl bg-avionics-surface border border-avionics-border text-xs font-semibold text-avionics-text cursor-pointer">
          <Share2 className="w-3.5 h-3.5 text-sky-400" />
          <span>Поделиться</span>
        </button>
        <button type="button" onClick={handleSaveImage} className="flex items-center space-x-1.5 px-3 py-2 rounded-xl bg-avionics-surface border border-avionics-border text-xs font-semibold text-avionics-text cursor-pointer">
          <Download className="w-3.5 h-3.5 text-sky-400" />
          <span>Картинка</span>
        </button>
        {status && <span role="status" className="text-xs text-avionics-muted">{status}</span>}
      </div>

      <div className="p-5 sm:p-6 rounded-3xl border border-avionics-border bg-gradient-to-br from-sky-500/15 via-avionics-surface to-indigo-500/15">
        <div className="flex items-center space-x-2 text-xs font-bold uppercase tracking-widest text-sky-400">
          <Sparkles className="w-4 h-4" />
          <span>Итоги {year} года</span>
        </div>

        <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-4">
          {[
            ['Налёт', formatMinutesToHHMM(report.totals.minutes)],
            ['Рейсов', String(report.totals.flights)],
            ['Ночью', formatMinutesToHHMM(report.totals.nightMinutes)],
            ['Посадок', String(report.totals.landings)],
          ].map(([label, value]) => (
            <div key={label}>
              <div className="text-2xs font-semibold uppercase tracking-wider text-avionics-muted">{label}</div>
              <div className="text-2xl sm:text-4xl font-black font-mono text-avionics-text">{value}</div>
            </div>
          ))}
        </div>
        {change !== null && (
          <p className="mt-2 text-xs text-avionics-muted">
            {change >= 0 ? '+' : ''}
            {change}% налёта к {year - 1} году
          </p>
        )}

        <div className="mt-5 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
          {report.longestFlight && (
            <Highlight
              icon={<Trophy className="w-3.5 h-3.5" />}
              label="Самый длинный рейс"
              value={`${report.longestFlight.depIcao}–${report.longestFlight.arrIcao}, ${formatMinutesToHHMM(report.longestFlight.totalTimeMinutes)}`}
              hint={report.longestFlight.date}
            />
          )}
          {report.topRoute && (
            <Highlight icon={<Plane className="w-3.5 h-3.5" />} label="Чаще всего" value={`${report.topRoute.dep} ↔ ${report.topRoute.arr}`} hint={`рейсов: ${report.topRoute.count}`} />
          )}
          {report.busiestMonth && (
            <Highlight
              icon={<Timer className="w-3.5 h-3.5" />}
              label="Самый плотный месяц"
              value={MONTH_NAMES[report.busiestMonth.month]}
              hint={formatMinutesToHHMM(report.busiestMonth.minutes)}
            />
          )}
          <Highlight
            icon={<MapPin className="w-3.5 h-3.5" />}
            label="Аэродромов"
            value={`${report.airports.length}, из них новых ${report.newAirports.length}`}
            hint={report.newAirports.slice(0, 6).join(', ')}
          />
          {report.busiestWeekday && <Highlight icon={<Moon className="w-3.5 h-3.5" />} label="Любимый день" value={report.busiestWeekday} />}
          {report.types.length > 0 && (
            <Highlight
              icon={<Plane className="w-3.5 h-3.5" />}
              label="Типы ВС"
              value={report.types.map((t) => t.type).join(', ')}
              hint={report.types.map((t) => `${t.type} ${formatMinutesToHHMM(t.minutes)}`).join(' · ')}
            />
          )}
        </div>
      </div>

      <section className="bg-avionics-surface border border-avionics-border rounded-2xl p-3 sm:p-4">
        <h2 className="text-xs font-bold uppercase tracking-wider text-avionics-text mb-3">Карта {year} года</h2>
        <FlightMap flights={yearFlights} airports={airports} theme={theme} variant="dashboard" />
      </section>
    </div>
  );
};
