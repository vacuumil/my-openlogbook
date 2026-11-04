import React from 'react';
import { BedDouble, Moon, Plane, RotateCcw, Stethoscope, UserRound } from 'lucide-react';
import { DutyLink, WorkEntry } from '../db/db';
import { DUTY_LINK_LABELS, DutySegment, DutySegmentKind, FlightDuty, formatDutyLength, mskClock, utcClock } from '../utils/workTime';

interface DutyTimelineProps {
  duty: FlightDuty;
  onPatch: (entry: WorkEntry, patch: Partial<WorkEntry>) => void;
  /** The duties around this one, for the rest before and after it */
  previous?: FlightDuty;
  next?: FlightDuty;
}

const SEGMENT_STYLE: Record<DutySegmentKind, { label: string; bar: string }> = {
  report: { label: 'Явка, подготовка', bar: 'bg-amber-400/70' },
  leg: { label: 'Полёт', bar: 'bg-sky-500' },
  deadhead: { label: 'Пассажиром', bar: 'bg-slate-400' },
  wait: { label: 'Стоянка', bar: 'bg-sky-500/30' },
  rest: { label: 'Отдых (не рабочее время)', bar: 'bg-violet-500/50' },
  release: { label: 'После полёта', bar: 'bg-amber-400/70' },
};

const inputClassName =
  'w-24 bg-avionics-card border border-avionics-border rounded-lg px-2 py-1 text-xs font-mono text-avionics-text focus:outline-none focus:border-sky-500';

const both = (at: number) => (
  <>
    <span className="text-avionics-text">{utcClock(at)}</span>
    <span className="text-avionics-muted"> UTC · {mskClock(at)} МСК</span>
  </>
);

const segmentTitle = (segment: DutySegment) =>
  segment.entry ? `${segment.entry.title}${segment.entry.note ? ` · ${segment.entry.note}` : ''}` : SEGMENT_STYLE[segment.kind].label;

/** One duty from report to release: a bar of its parts, the times in UTC and Moscow time, and the pilot's corrections */
export const DutyTimeline: React.FC<DutyTimelineProps> = ({ duty, onPatch, previous, next }) => {
  const span = Math.max(duty.endAt - duty.startAt, 1);
  const first = duty.legs[0];
  const last = duty.legs[duty.legs.length - 1];
  const overLimit = (duty.isSplit ? duty.minutes : duty.flightDutyMinutes) > duty.maxDutyMinutes;

  return (
    <article className="p-3 sm:p-4 rounded-2xl bg-avionics-card border border-avionics-border space-y-3">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <h3 className="font-bold text-sm text-avionics-text truncate">{duty.legs.map((leg) => leg.title).join(' · ')}</h3>
          <p className="text-2xs font-mono mt-0.5">
            {both(duty.startAt)} <span className="text-avionics-muted">→</span> {both(duty.endAt)}
          </p>
        </div>
        <div className="flex flex-wrap gap-1.5 text-2xs font-semibold">
          {duty.isSplit && <span className="px-2 py-0.5 rounded-full bg-violet-500/15 text-violet-400">Разделённая</span>}
          {duty.isNight && <span className="px-2 py-0.5 rounded-full bg-indigo-500/15 text-indigo-400">Ночная</span>}
          {duty.medicalCheck && <span className="px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400">Санчасть</span>}
          {duty.legs.some((leg) => leg.actual) && <span className="px-2 py-0.5 rounded-full bg-sky-500/15 text-sky-400">Факт из книжки</span>}
        </div>
      </header>

      <div className="flex h-3 rounded-full overflow-hidden bg-avionics-surface" role="img" aria-label="Шкала смены">
        {duty.segments.map((segment, index) => (
          <div
            key={index}
            title={`${segmentTitle(segment)}: ${utcClock(segment.from)}–${utcClock(segment.to)} UTC`}
            className={SEGMENT_STYLE[segment.kind].bar}
            style={{ width: `${(Math.max(segment.to - segment.from, 0) / span) * 100}%` }}
          />
        ))}
      </div>

      <dl className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
        {[
          ['Рабочее время', formatDutyLength(duty.minutes)],
          ['Полётное', formatDutyLength(duty.flightTimeMinutes)],
          ['Ночные 22–06', formatDutyLength(duty.nightMinutes)],
          ['Предел (прил. 1)', formatDutyLength(duty.maxDutyMinutes)],
        ].map(([label, value]) => (
          <div key={label} className="p-2 rounded-lg bg-avionics-surface">
            <dt className="text-2xs text-avionics-muted">{label}</dt>
            <dd className={`font-mono font-bold ${label.startsWith('Предел') && overLimit ? 'text-rose-400' : 'text-avionics-text'}`}>{value}</dd>
          </div>
        ))}
      </dl>

      <ol className="space-y-1 text-xs">
        {duty.segments.map((segment, index) => {
          if (segment.to <= segment.from && segment.kind !== 'leg') return null;
          const isLeg = segment.kind === 'leg' || segment.kind === 'deadhead';
          const Icon = segment.kind === 'rest' ? BedDouble : segment.kind === 'deadhead' ? UserRound : isLeg ? Plane : null;
          return (
            <li key={index} className="flex items-center gap-2 min-w-0">
              <span className={`w-1.5 self-stretch rounded-full ${SEGMENT_STYLE[segment.kind].bar}`} />
              <span className="w-24 sm:w-28 shrink-0 font-mono text-avionics-text">
                {utcClock(segment.from)}–{utcClock(segment.to)}
              </span>
              <span className="hidden sm:inline w-24 shrink-0 font-mono text-avionics-muted">
                {mskClock(segment.from)}–{mskClock(segment.to)}
              </span>
              <span className="flex items-center gap-1 min-w-0 text-avionics-muted">
                {Icon && <Icon className="w-3.5 h-3.5 shrink-0" />}
                <span className={`truncate ${isLeg ? 'text-avionics-text font-semibold' : ''}`}>{segmentTitle(segment)}</span>
              </span>
              <span className="ml-auto font-mono text-avionics-muted shrink-0">{formatDutyLength(segment.to - segment.from)}</span>
            </li>
          );
        })}
      </ol>
      <p className="text-2xs text-avionics-muted">Слева UTC, правее — московское время.</p>

      {(previous || next) && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
          {previous && (() => {
            const rest = duty.startAt - previous.endAt;
            const required = previous.minutes * 2;
            const short = rest < required;
            return (
              <div className={`p-2 rounded-lg border ${short ? 'border-amber-500/40 bg-amber-500/10' : 'border-avionics-border bg-avionics-surface'}`}>
                <div className="text-2xs text-avionics-muted">Отдых перед сменой</div>
                <div className="font-mono font-bold text-avionics-text">
                  {formatDutyLength(rest)}
                  <span className="font-normal text-avionics-muted"> · нужно от {formatDutyLength(required)}</span>
                </div>
              </div>
            );
          })()}
          {next && (
            <div className="p-2 rounded-lg border border-avionics-border bg-avionics-surface">
              <div className="text-2xs text-avionics-muted">До следующей смены</div>
              <div className="font-mono font-bold text-avionics-text">
                {formatDutyLength(next.startAt - duty.endAt)}
                <span className="font-normal text-avionics-muted"> · явка {utcClock(next.startAt)} UTC, {next.date.split('-').reverse().slice(0, 2).join('.')}</span>
              </div>
            </div>
          )}
        </div>
      )}

      <details className="group">
        <summary className="text-xs font-semibold text-sky-400 cursor-pointer select-none">Поправить смену</summary>
        <div className="mt-3 space-y-3 text-xs">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <label className="flex items-center gap-2 text-avionics-muted">
              Явка, UTC
              <input
                type="time"
                defaultValue={utcClock(duty.startAt)}
                key={`report-${duty.startAt}`}
                onBlur={(e) => e.target.value && e.target.value !== utcClock(duty.startAt) && onPatch(first, { reportAt: e.target.value })}
                className={inputClassName}
              />
              {first.reportAt && (
                <button type="button" onClick={() => onPatch(first, { reportAt: undefined })} title="Явка за 60 минут до вылета" className="text-avionics-muted hover:text-sky-400 cursor-pointer">
                  <RotateCcw className="w-3.5 h-3.5" />
                </button>
              )}
            </label>
            <label className="flex items-center gap-2 text-avionics-muted">
              Окончание, UTC
              <input
                type="time"
                defaultValue={utcClock(duty.endAt)}
                key={`release-${duty.endAt}`}
                onBlur={(e) => e.target.value && e.target.value !== utcClock(duty.endAt) && onPatch(last, { releaseAt: e.target.value })}
                className={inputClassName}
              />
              {last.releaseAt && (
                <button type="button" onClick={() => onPatch(last, { releaseAt: undefined })} title="Окончание по правилу" className="text-avionics-muted hover:text-sky-400 cursor-pointer">
                  <RotateCcw className="w-3.5 h-3.5" />
                </button>
              )}
            </label>
            <label className="flex items-center gap-2 text-avionics-text cursor-pointer">
              <input type="checkbox" checked={Boolean(last.medicalCheck)} onChange={(e) => onPatch(last, { medicalCheck: e.target.checked || undefined })} />
              <Stethoscope className="w-3.5 h-3.5 text-emerald-400" />
              Санчасть после рейса (окончание через 40 мин)
            </label>
          </div>

          <ul className="space-y-2">
            {duty.legs.map((leg, index) => (
              <li key={leg.id} className="flex flex-wrap items-center gap-x-3 gap-y-1.5 p-2 rounded-lg bg-avionics-surface">
                <span className="font-mono font-semibold text-avionics-text">{leg.title}</span>
                {index > 0 && (
                  <label className="flex items-center gap-1.5 text-avionics-muted">
                    с предыдущим:
                    <select
                      value={leg.dutyLink ?? 'auto'}
                      onChange={(e) => onPatch(leg, { dutyLink: e.target.value as DutyLink })}
                      className="bg-avionics-card border border-avionics-border rounded-lg px-2 py-1 text-xs text-avionics-text"
                    >
                      {(Object.keys(DUTY_LINK_LABELS) as DutyLink[]).map((link) => (
                        <option key={link} value={link}>{DUTY_LINK_LABELS[link]}</option>
                      ))}
                    </select>
                  </label>
                )}
                <label className="flex items-center gap-1.5 text-avionics-text cursor-pointer">
                  <input type="checkbox" checked={Boolean(leg.deadhead)} onChange={(e) => onPatch(leg, { deadhead: e.target.checked || undefined })} />
                  <UserRound className="w-3.5 h-3.5 text-avionics-muted" />
                  пассажиром
                </label>
              </li>
            ))}
          </ul>
          {duty.legs.length > 1 && (
            <p className="text-2xs text-avionics-muted flex items-start gap-1.5">
              <Moon className="w-3.5 h-3.5 shrink-0" />
              «Авто»: рейсы одной связки — одна смена; ночёвка вне базы делает смену разделённой; стоянка дольше порога из настроек — новая смена.
            </p>
          )}
        </div>
      </details>
    </article>
  );
};
