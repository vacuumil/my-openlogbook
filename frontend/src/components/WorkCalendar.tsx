import React, { useMemo } from 'react';
import { BedDouble } from 'lucide-react';
import { WorkEntry, WorkKind } from '../db/db';
import { FlightDuty, formatDutyLength, utcClock } from '../utils/workTime';
import { buildCalendar, dutyDestinations, guessBase } from '../utils/workCalendar';
import { toDateKey } from '../utils/dates';

interface WorkCalendarProps {
  month: string;
  duties: FlightDuty[];
  entries: WorkEntry[];
  selected: string | null;
  onSelect: (date: string) => void;
}

const WEEKDAYS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];

const KIND_STYLE: Record<Exclude<WorkKind, 'flight'>, { label: string; chip: string }> = {
  reserve: { label: 'Резерв', chip: 'bg-amber-500/15 text-amber-400' },
  training: { label: 'Тренажёр', chip: 'bg-emerald-500/15 text-emerald-400' },
  ground: { label: 'Работа', chip: 'bg-slate-500/20 text-avionics-text' },
  vacation: { label: 'Отпуск', chip: 'bg-teal-500/15 text-teal-400' },
  sick: { label: 'Больничный', chip: 'bg-rose-500/15 text-rose-400' },
  off: { label: 'Выходной', chip: 'bg-avionics-surface text-avionics-muted' },
};

const dutyChip = (duty: FlightDuty) =>
  duty.isSplit
    ? 'bg-violet-500/20 text-violet-300 border-violet-500/40'
    : duty.isNight
      ? 'bg-indigo-500/20 text-indigo-300 border-indigo-500/40'
      : 'bg-sky-500/15 text-sky-300 border-sky-500/40';

/** The month as a calendar: each day shows its duties and other work; a tap opens the day */
export const WorkCalendar: React.FC<WorkCalendarProps> = ({ month, duties, entries, selected, onSelect }) => {
  const weeks = useMemo(() => buildCalendar(month, duties, entries), [month, duties, entries]);
  const base = useMemo(() => guessBase(duties), [duties]);
  const today = toDateKey(new Date());

  return (
    <section className="bg-avionics-surface border border-avionics-border rounded-2xl p-2 sm:p-3">
      <div className="grid grid-cols-7 gap-1 sm:gap-1.5 mb-1">
        {WEEKDAYS.map((day, index) => (
          <div key={day} className={`text-center text-2xs font-bold uppercase tracking-wider ${index >= 5 ? 'text-rose-400/80' : 'text-avionics-muted'}`}>
            {day}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1 sm:gap-1.5" role="grid" aria-label="Календарь месяца">
        {weeks.flat().map((day) => {
          const isSelected = selected === day.date;
          const busy = day.duties.length > 0 || day.continued.length > 0 || day.entries.length > 0 || day.layover;
          return (
            <button
              key={day.date}
              type="button"
              role="gridcell"
              aria-selected={isSelected}
              aria-label={`${day.date}${busy ? '' : ', свободно'}`}
              onClick={() => onSelect(day.date)}
              className={`relative min-h-[64px] sm:min-h-[96px] p-1 sm:p-1.5 rounded-lg sm:rounded-xl border text-left flex flex-col gap-0.5 sm:gap-1 transition-colors cursor-pointer overflow-hidden ${
                isSelected
                  ? 'border-sky-400 bg-sky-500/10'
                  : day.inMonth
                    ? 'border-avionics-border bg-avionics-card hover:border-sky-500/50'
                    : 'border-transparent bg-avionics-card/40 opacity-50'
              }`}
            >
              <span
                className={`text-2xs sm:text-xs font-bold leading-none ${
                  day.date === today ? 'w-5 h-5 -m-0.5 rounded-full bg-sky-500 text-slate-950 flex items-center justify-center' : 'text-avionics-text'
                }`}
              >
                {Number(day.date.slice(8))}
              </span>
              {day.continued.map((duty) => (
                // A duty that began the day before is still running after midnight
                <span key={`cont-${duty.startAt}`} className={`block rounded-md border border-dashed px-1 py-0.5 leading-tight opacity-90 ${dutyChip(duty)}`}>
                  <span className="block font-bold text-[10px] sm:text-2xs truncate">↳ {dutyDestinations(duty, base)}</span>
                  <span className="block font-mono text-[10px] opacity-80 truncate">до {utcClock(duty.endAt)}</span>
                </span>
              ))}
              {day.duties.map((duty) => (
                <span key={duty.startAt} className={`block rounded-md border px-1 py-0.5 leading-tight ${dutyChip(duty)}`}>
                  <span className="block font-bold text-[10px] sm:text-2xs truncate">{dutyDestinations(duty, base)}</span>
                  <span className="hidden sm:block font-mono text-[10px] opacity-80 truncate">
                    {utcClock(duty.startAt)}–{utcClock(duty.endAt)}
                    {Math.floor(duty.endAt / 1440) > Math.floor(duty.startAt / 1440) && <sup className="ml-0.5">+1</sup>}
                  </span>
                  <span className="block font-mono text-[10px] opacity-80">{formatDutyLength(duty.minutes)}</span>
                </span>
              ))}
              {day.entries.map((entry) => {
                const style = KIND_STYLE[entry.kind as Exclude<WorkKind, 'flight'>];
                return (
                  <span key={entry.id} className={`block rounded-md px-1 py-0.5 text-[10px] sm:text-2xs font-semibold truncate ${style.chip}`}>
                    {style.label}
                  </span>
                );
              })}
              {day.layover && day.duties.length === 0 && day.continued.length === 0 && (
                <span className="flex items-center gap-0.5 text-[10px] sm:text-2xs text-violet-300 truncate">
                  <BedDouble className="w-3 h-3 shrink-0" />
                  {day.layover}
                </span>
              )}
            </button>
          );
        })}
      </div>
      <div className="flex flex-wrap gap-x-3 gap-y-1 mt-2 px-1 text-2xs text-avionics-muted">
        <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-sky-500/40" />смена</span>
        <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-indigo-500/50" />ночная</span>
        <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-violet-500/50" />разделённая</span>
        <span className="flex items-center gap-1"><BedDouble className="w-3 h-3" />ночёвка вне базы</span>
        <span>Время — UTC</span>
      </div>
    </section>
  );
};
