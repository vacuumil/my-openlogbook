import React, { useMemo, useState } from 'react';
import { ChevronDown, ChevronUp, Settings2 } from 'lucide-react';
import { LocalFlight } from '../db/db';
import { CurrencySettings } from '../utils/currency';
import { getTypeRating, normalizeAircraftType } from '../utils/typeRatings';

interface CurrencySettingsPanelProps {
  flights: LocalFlight[];
  settings: CurrencySettings;
  onChange: (settings: CurrencySettings) => void;
}

const inputClassName =
  'w-full bg-avionics-card border border-avionics-border rounded-lg px-2.5 py-1.5 text-xs text-avionics-text focus:outline-none focus:border-sky-500';

export const CurrencySettingsPanel: React.FC<CurrencySettingsPanelProps> = ({ flights, settings, onChange }) => {
  const [isOpen, setIsOpen] = useState(false);
  const types = useMemo(
    () => Array.from(new Set(flights.map((flight) => normalizeAircraftType(flight.aircraftType)).filter(Boolean))).sort(),
    [flights]
  );

  const setOverride = (type: string, rating: string) => {
    const ratingOverrides = { ...settings.ratingOverrides };
    // An empty field or the built-in rating means "use the default group"
    if (!rating.trim() || rating.trim() === getTypeRating(type)) delete ratingOverrides[type];
    else ratingOverrides[type] = rating.trim();
    onChange({ ...settings, ratingOverrides });
  };

  return (
    <section className="rounded-2xl border border-avionics-border">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        aria-expanded={isOpen}
        className="w-full flex items-center justify-between px-4 py-3 text-xs font-bold text-avionics-text cursor-pointer"
      >
        <span className="flex items-center space-x-2">
          <Settings2 className="w-4 h-4 text-sky-400" />
          <span>Правила расчёта</span>
        </span>
        {isOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
      </button>

      {isOpen && (
        <div className="px-4 pb-4 space-y-4">
          <label className="flex items-start space-x-2.5 text-xs text-avionics-text cursor-pointer">
            <input
              type="checkbox"
              checked={settings.holdsInstrumentRating}
              onChange={(e) => onChange({ ...settings, holdsInstrumentRating: e.target.checked })}
              className="mt-0.5 accent-sky-500"
            />
            <span>
              У меня действующий IR
              <span className="block text-2xs text-avionics-muted">EASA FCL.060(b)(2): ночная посадка для допуска не нужна</span>
            </span>
          </label>

          <div className="grid grid-cols-2 gap-3 max-w-sm">
            <label className="text-[11px] font-semibold text-avionics-muted">
              Период, дней
              <input
                type="number"
                min={1}
                defaultValue={settings.recencyDays}
                onBlur={(e) => onChange({ ...settings, recencyDays: Math.max(1, Number(e.target.value) || 90) })}
                className={`${inputClassName} mt-1 font-mono`}
              />
            </label>
            <label className="text-[11px] font-semibold text-avionics-muted">
              Взлётов и посадок
              <input
                type="number"
                min={1}
                defaultValue={settings.requiredLandings}
                onBlur={(e) => onChange({ ...settings, requiredLandings: Math.max(1, Number(e.target.value) || 3) })}
                className={`${inputClassName} mt-1 font-mono`}
              />
            </label>
          </div>

          {types.length > 0 && (
            <div>
              <h3 className="text-[11px] font-semibold text-avionics-muted mb-1.5">Типовой рейтинг для каждого типа ВС</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {types.map((type) => (
                  <label key={type} className="flex items-center gap-2 text-xs">
                    <span className="w-16 shrink-0 font-mono font-bold text-avionics-text">{type}</span>
                    <input
                      type="text"
                      defaultValue={settings.ratingOverrides[type] || ''}
                      placeholder={getTypeRating(type)}
                      onBlur={(e) => setOverride(type, e.target.value)}
                      aria-label={`Рейтинг для ${type}`}
                      className={inputClassName}
                    />
                  </label>
                ))}
              </div>
              <p className="mt-1.5 text-2xs text-avionics-muted">
                Типы с одинаковым названием рейтинга считаются вместе. Пустое поле — встроенная группа.
              </p>
            </div>
          )}
        </div>
      )}
    </section>
  );
};
