import React, { useMemo, useState } from 'react';
import { ChevronDown, ChevronUp, Moon, CloudOff, RotateCcw, Search, SlidersHorizontal, X } from 'lucide-react';
import { LocalFlight } from '../db/db';
import {
  EMPTY_FILTERS,
  FilterPeriod,
  FlightFilters,
  getFilterChips,
  getFilterOptions,
  hasActiveFilters,
  PERIOD_LABELS,
} from '../utils/flightFilters';

export const FLIGHT_SEARCH_INPUT_ID = 'flight-search';

interface FlightFilterBarProps {
  flights: LocalFlight[];
  filters: FlightFilters;
  onChange: (filters: FlightFilters) => void;
  resultCount: number;
  children?: React.ReactNode;
}

const ROLES = ['PIC', 'SIC', 'PICUS', 'Dual', 'Instructor', 'Observer'];
const HANDLING = ['PF', 'PM'];

const fieldClassName =
  'w-full bg-avionics-card border border-avionics-border rounded-xl px-2.5 py-2 text-xs text-avionics-text focus:outline-none focus:border-sky-500';
const labelClassName = 'block text-[11px] font-semibold text-avionics-muted mb-1';

const toggleClassName = (active: boolean) =>
  `px-2.5 py-1.5 rounded-lg border text-xs font-bold font-mono transition-colors cursor-pointer ${
    active
      ? 'bg-sky-500/20 text-sky-400 border-sky-500/40'
      : 'bg-avionics-card text-avionics-muted border-avionics-border hover:text-avionics-text'
  }`;

export const FlightFilterBar: React.FC<FlightFilterBarProps> = ({ flights, filters, onChange, resultCount, children }) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const options = useMemo(() => getFilterOptions(flights), [flights]);
  const chips = getFilterChips(filters);
  const isFiltered = hasActiveFilters(filters);

  const update = (patch: Partial<FlightFilters>) => onChange({ ...filters, ...patch });

  const toggleType = (type: string) =>
    update({
      aircraftTypes: filters.aircraftTypes.includes(type)
        ? filters.aircraftTypes.filter((item) => item !== type)
        : [...filters.aircraftTypes, type],
    });

  return (
    <div className="p-3 sm:p-4 bg-avionics-surface border border-avionics-border rounded-2xl space-y-3 shadow-sm">
      <div className="flex flex-col md:flex-row md:items-center gap-2">
        <div className="relative flex-1 min-w-0">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-avionics-muted" />
          <input
            id={FLIGHT_SEARCH_INPUT_ID}
            type="search"
            value={filters.query}
            onChange={(e) => update({ query: e.target.value })}
            placeholder="Поиск: UUEE-OMDB, SVO, RA-73001, A320, заметки"
            aria-label="Поиск рейсов"
            className="w-full bg-avionics-card border border-avionics-border rounded-xl pl-9 pr-8 py-2 text-base md:text-sm text-avionics-text placeholder:text-avionics-muted focus:outline-none focus:border-sky-500"
          />
          {filters.query && (
            <button
              type="button"
              onClick={() => update({ query: '' })}
              aria-label="Очистить поиск"
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-avionics-muted hover:text-avionics-text"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        <div className="flex items-center gap-2">
          <select
            value={filters.period}
            onChange={(e) => update({ period: e.target.value as FilterPeriod })}
            aria-label="Период"
            className="flex-1 md:flex-none bg-avionics-card border border-avionics-border rounded-xl px-2.5 py-2 text-xs font-semibold text-avionics-text focus:outline-none focus:border-sky-500 cursor-pointer"
          >
            {(Object.keys(PERIOD_LABELS) as FilterPeriod[]).map((period) => (
              <option key={period} value={period} className="bg-avionics-surface text-avionics-text">
                {PERIOD_LABELS[period]}
              </option>
            ))}
          </select>

          <button
            type="button"
            onClick={() => setIsExpanded(!isExpanded)}
            aria-expanded={isExpanded}
            className={`flex items-center space-x-1.5 px-3 py-2 rounded-xl border text-xs font-semibold transition-colors cursor-pointer ${
              isExpanded
                ? 'bg-sky-500/20 text-sky-400 border-sky-500/40'
                : 'bg-avionics-card text-avionics-muted border-avionics-border hover:text-avionics-text'
            }`}
          >
            <SlidersHorizontal className="w-3.5 h-3.5" />
            <span>Фильтры</span>
            {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </button>

          {children}
        </div>
      </div>

      {filters.period === 'custom' && (
        <div className="grid grid-cols-2 gap-2 sm:max-w-sm">
          <label className={labelClassName}>
            С даты
            <input
              type="date"
              value={filters.dateFrom}
              onChange={(e) => update({ dateFrom: e.target.value })}
              className={`${fieldClassName} mt-1 font-mono`}
            />
          </label>
          <label className={labelClassName}>
            По дату
            <input
              type="date"
              value={filters.dateTo}
              onChange={(e) => update({ dateTo: e.target.value })}
              className={`${fieldClassName} mt-1 font-mono`}
            />
          </label>
        </div>
      )}

      {isExpanded && (
        <div className="pt-3 border-t border-avionics-border space-y-3">
          {options.aircraftTypes.length > 0 && (
            <div>
              <span className={labelClassName}>Типы ВС</span>
              <div className="flex flex-wrap gap-1.5">
                {options.aircraftTypes.map((type) => (
                  <button
                    key={type}
                    type="button"
                    aria-pressed={filters.aircraftTypes.includes(type)}
                    onClick={() => toggleType(type)}
                    className={toggleClassName(filters.aircraftTypes.includes(type))}
                  >
                    {type}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 lg:grid-cols-6 gap-2">
            <label className={labelClassName}>
              Тип записи
              <select value={filters.entryType} onChange={(e) => update({ entryType: e.target.value as FlightFilters['entryType'] })} className={`${fieldClassName} mt-1`}>
                <option value="">Все</option>
                <option value="flight">Рейсы</option>
                <option value="draft">Черновики из плана</option>
                <option value="simulator">Тренажёр</option>
                <option value="ground">Наземная подготовка</option>
              </select>
            </label>

            <label className={labelClassName}>
              Роль
              <select value={filters.role} onChange={(e) => update({ role: e.target.value })} className={`${fieldClassName} mt-1`}>
                <option value="">Все</option>
                {ROLES.map((role) => (
                  <option key={role} value={role}>{role}</option>
                ))}
              </select>
            </label>

            <label className={labelClassName}>
              PF / PM
              <select value={filters.handling} onChange={(e) => update({ handling: e.target.value })} className={`${fieldClassName} mt-1`}>
                <option value="">Все</option>
                {HANDLING.map((handling) => (
                  <option key={handling} value={handling}>{handling}</option>
                ))}
              </select>
            </label>

            <label className={labelClassName}>
              Заход
              <select value={filters.approach} onChange={(e) => update({ approach: e.target.value })} className={`${fieldClassName} mt-1`}>
                <option value="">Все</option>
                {options.approaches.map((approach) => (
                  <option key={approach} value={approach}>{approach}</option>
                ))}
              </select>
            </label>

            <label className={labelClassName}>
              Борт
              <input
                type="text"
                value={filters.registration}
                onChange={(e) => update({ registration: e.target.value })}
                placeholder="RA-73001"
                className={`${fieldClassName} mt-1 font-mono`}
              />
            </label>

            <label className={labelClassName}>
              Аэродром
              <input
                type="text"
                value={filters.airport}
                onChange={(e) => update({ airport: e.target.value })}
                placeholder="UUEE или SVO"
                className={`${fieldClassName} mt-1 font-mono`}
              />
            </label>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              aria-pressed={filters.nightOnly}
              onClick={() => update({ nightOnly: !filters.nightOnly })}
              className={`${toggleClassName(filters.nightOnly)} flex items-center space-x-1.5`}
            >
              <Moon className="w-3.5 h-3.5" />
              <span>Только ночные</span>
            </button>
            <button
              type="button"
              aria-pressed={filters.pendingOnly}
              onClick={() => update({ pendingOnly: !filters.pendingOnly })}
              className={`${toggleClassName(filters.pendingOnly)} flex items-center space-x-1.5`}
            >
              <CloudOff className="w-3.5 h-3.5" />
              <span>Не синхронизированы</span>
            </button>
          </div>
        </div>
      )}

      {isFiltered && (
        <div className="flex flex-wrap items-center gap-1.5 text-xs">
          <span className="text-avionics-muted mr-1" aria-live="polite">
            Найдено <strong className="text-avionics-text font-mono">{resultCount}</strong> из {flights.length}
          </span>
          {chips.map((chip) => (
            <button
              key={chip.key}
              type="button"
              onClick={() => update(chip.clear)}
              aria-label={`Снять фильтр ${chip.label}`}
              className="max-w-[220px] flex items-center space-x-1 px-2 py-1 rounded-lg bg-sky-500/10 text-sky-400 border border-sky-500/30 font-semibold cursor-pointer"
            >
              <span className="truncate">{chip.label}</span>
              <X className="w-3 h-3 shrink-0" />
            </button>
          ))}
          <button
            type="button"
            onClick={() => onChange(EMPTY_FILTERS)}
            className="flex items-center space-x-1 px-2 py-1 rounded-lg text-rose-400 font-semibold cursor-pointer hover:bg-rose-500/10"
          >
            <RotateCcw className="w-3 h-3" />
            <span>Сбросить всё</span>
          </button>
        </div>
      )}
    </div>
  );
};
