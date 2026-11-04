import React from 'react';
import { ChevronDown } from 'lucide-react';

export interface RecencyFieldValues {
  takeoffsDay?: number;
  takeoffsNight?: number;
  fullStopLandingsNight?: number;
}

interface RecencyFieldsProps {
  landingsDay: number;
  landingsNight: number;
  values: RecencyFieldValues;
  onChange: (values: RecencyFieldValues) => void;
}

const inputClassName =
  'w-full bg-avionics-card border border-avionics-border rounded-xl px-3 py-2 text-sm font-mono text-avionics-text focus:outline-none focus:border-sky-500';

/**
 * Take-offs and full-stop landings only matter for recency and usually equal the landings,
 * so they stay folded and follow the landings until the pilot sets them.
 */
export const RecencyFields: React.FC<RecencyFieldsProps> = ({ landingsDay, landingsNight, values, onChange }) => {
  const isCustom = Object.values(values).some((value) => value !== undefined);
  const fields: Array<{ key: keyof RecencyFieldValues; label: string; fallback: number }> = [
    { key: 'takeoffsDay', label: 'Взлёты днём', fallback: landingsDay },
    { key: 'takeoffsNight', label: 'Взлёты ночью', fallback: landingsNight },
    { key: 'fullStopLandingsNight', label: 'Ночью до полной остановки', fallback: landingsNight },
  ];

  return (
    <details className="group rounded-xl border border-avionics-border" open={isCustom}>
      <summary className="flex items-center justify-between px-3 py-2 text-xs font-semibold text-avionics-muted cursor-pointer list-none">
        <span>Взлёты и посадки для допусков {isCustom ? '' : '· как посадки'}</span>
        <ChevronDown className="w-3.5 h-3.5 transition-transform group-open:rotate-180" />
      </summary>
      <div className="px-3 pb-3 grid grid-cols-1 sm:grid-cols-3 gap-2">
        {fields.map(({ key, label, fallback }) => (
          <label key={key} className="text-[11px] font-semibold text-avionics-muted">
            {label}
            <input
              type="number"
              min={0}
              max={20}
              value={values[key] ?? fallback}
              onChange={(e) => onChange({ ...values, [key]: Math.max(0, Number(e.target.value) || 0) })}
              className={`${inputClassName} mt-1`}
            />
          </label>
        ))}
        <p className="sm:col-span-3 text-2xs text-avionics-muted">
          Нужны для правила 90 дней: EASA учитывает взлёты и посадки, FAA ночью — посадки до полной остановки.
        </p>
      </div>
    </details>
  );
};
