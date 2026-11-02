import React, { useState, useEffect } from 'react';
import { Cloud, Wind, Thermometer, Gauge, ChevronDown, ChevronUp, Copy, Check, Eye } from 'lucide-react';
import { weatherService, WeatherInfo } from '../utils/weatherService';

interface WeatherBadgeProps {
  icao?: string;
  prefix?: string; // e.g. "Вылет" or "Прилет"
  className?: string;
}

export const WeatherBadge: React.FC<WeatherBadgeProps> = ({ icao, prefix, className = '' }) => {
  const [weather, setWeather] = useState<WeatherInfo | null>(null);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [copiedMetar, setCopiedMetar] = useState(false);
  const [copiedTaf, setCopiedTaf] = useState(false);

  useEffect(() => {
    let active = true;
    if (!icao || icao.length < 3) {
      setWeather(null);
      return;
    }

    setLoading(true);
    weatherService.getWeather(icao).then((data) => {
      if (active) {
        setWeather(data);
        setLoading(false);
      }
    });

    return () => {
      active = false;
    };
  }, [icao]);

  if (!icao || icao.length < 3) return null;

  if (loading) {
    return (
      <div className={`inline-flex items-center space-x-1.5 px-2.5 py-1 rounded-lg bg-avionics-surface border border-avionics-border text-2xs text-avionics-muted animate-pulse ${className}`}>
        <Cloud className="w-3.5 h-3.5" />
        <span>Запрос METAR {icao}...</span>
      </div>
    );
  }

  if (!weather || !weather.has_weather) {
    return (
      <div className={`inline-flex items-center space-x-1 px-2.5 py-1 rounded-lg bg-avionics-surface border border-avionics-border text-2xs text-avionics-muted ${className}`}>
        <Cloud className="w-3.5 h-3.5 opacity-60" />
        <span>{icao}: нет METAR</span>
      </div>
    );
  }

  const catStyle = weatherService.getCategoryStyle(weather.flight_category);

  const copyText = (text: string, type: 'metar' | 'taf') => {
    navigator.clipboard.writeText(text);
    if (type === 'metar') {
      setCopiedMetar(true);
      setTimeout(() => setCopiedMetar(false), 2000);
    } else {
      setCopiedTaf(true);
      setTimeout(() => setCopiedTaf(false), 2000);
    }
  };

  return (
    <div className={`relative inline-block ${className}`}>
      {/* Compact Badge Bar */}
      <div
        onClick={() => setExpanded(!expanded)}
        role="button"
        tabIndex={0}
        title="Нажмите для просмотра расшифровки METAR / TAF"
        className="flex items-center flex-wrap gap-1.5 px-2.5 py-1 rounded-lg bg-avionics-surface border border-avionics-border hover:border-sky-500/40 text-xs transition-all cursor-pointer select-none shadow-sm"
      >
        {prefix && (
          <span className="font-semibold text-avionics-muted text-2xs uppercase tracking-wide">
            {prefix}:
          </span>
        )}

        {/* Flight Category Pill */}
        <span
          className={`inline-flex items-center space-x-1 px-1.5 py-0.5 rounded text-2xs font-bold border ${catStyle.bg}`}
          title={catStyle.description}
        >
          <span className={`w-1.5 h-1.5 rounded-full ${catStyle.dot}`} />
          <span>{weather.flight_category || 'METAR'}</span>
        </span>

        {/* Wind */}
        {weather.wind_dir !== null && weather.wind_speed !== null && (
          <span className="inline-flex items-center text-avionics-text font-mono text-2xs">
            <Wind className="w-3 h-3 text-avionics-muted mr-0.5" />
            {String(weather.wind_dir).padStart(3, '0')}°/{weather.wind_speed}kt
            {weather.wind_gust ? `G${weather.wind_gust}` : ''}
          </span>
        )}

        {/* Temperature */}
        {weather.temp_c !== null && weather.temp_c !== undefined && (
          <span className="inline-flex items-center text-avionics-text font-mono text-2xs">
            <Thermometer className="w-3 h-3 text-avionics-muted mr-0.5" />
            {weather.temp_c > 0 ? `+${weather.temp_c}` : weather.temp_c}°C
          </span>
        )}

        {/* QNH */}
        {weather.altim_hpa !== null && weather.altim_hpa !== undefined && (
          <span className="inline-flex items-center text-avionics-muted font-mono text-2xs">
            <Gauge className="w-3 h-3 mr-0.5" />
            Q{Math.round(weather.altim_hpa)}
          </span>
        )}

        {expanded ? (
          <ChevronUp className="w-3.5 h-3.5 text-avionics-muted ml-0.5" />
        ) : (
          <ChevronDown className="w-3.5 h-3.5 text-avionics-muted ml-0.5" />
        )}
      </div>

      {/* Expanded Popover / Card */}
      {expanded && (
        <div className="absolute z-50 left-0 mt-2 w-80 sm:w-96 p-4 rounded-xl bg-avionics-card border border-avionics-border shadow-2xl backdrop-blur-md">
          {/* Header */}
          <div className="flex items-center justify-between pb-2 mb-3 border-b border-avionics-border">
            <div className="flex items-center space-x-2">
              <span className="font-bold text-sm text-avionics-text font-mono">{icao}</span>
              <span className={`px-2 py-0.5 rounded text-2xs font-bold border ${catStyle.bg}`}>
                {catStyle.label}
              </span>
            </div>
            {weather.obs_time && (
              <span className="text-2xs text-avionics-muted font-mono">
                {new Date(weather.obs_time).toUTCString().slice(17, 22)} UTC
              </span>
            )}
          </div>

          {/* Decoded Grid */}
          <div className="grid grid-cols-2 gap-2 text-2xs mb-3">
            <div className="p-2 rounded-lg bg-avionics-surface border border-avionics-border">
              <span className="text-avionics-muted block">Ветер</span>
              <span className="font-mono font-bold text-avionics-text text-xs">
                {weather.wind_dir ?? '—'}° / {weather.wind_speed ?? '—'} kt
                {weather.wind_gust ? ` (порывы ${weather.wind_gust} kt)` : ''}
              </span>
            </div>

            <div className="p-2 rounded-lg bg-avionics-surface border border-avionics-border">
              <span className="text-avionics-muted block">Видимость</span>
              <span className="font-mono font-bold text-avionics-text text-xs">
                {weather.visibility_sm !== null ? `${weather.visibility_sm} SM` : '10+ км'}
              </span>
            </div>

            <div className="p-2 rounded-lg bg-avionics-surface border border-avionics-border">
              <span className="text-avionics-muted block">Темп. / Точка росы</span>
              <span className="font-mono font-bold text-avionics-text text-xs">
                {weather.temp_c ?? '—'}°C / {weather.dewpoint_c ?? '—'}°C
              </span>
            </div>

            <div className="p-2 rounded-lg bg-avionics-surface border border-avionics-border">
              <span className="text-avionics-muted block">Давление QNH</span>
              <span className="font-mono font-bold text-avionics-text text-xs">
                {weather.altim_hpa ? `${Math.round(weather.altim_hpa)} hPa` : '—'}
              </span>
            </div>
          </div>

          {/* Cloud layers */}
          {weather.clouds && weather.clouds.length > 0 && (
            <div className="mb-3 p-2 rounded-lg bg-avionics-surface border border-avionics-border text-2xs">
              <span className="text-avionics-muted block mb-1">Облачность:</span>
              <div className="flex flex-wrap gap-1.5 font-mono">
                {weather.clouds.map((c, idx) => (
                  <span key={idx} className="px-1.5 py-0.5 rounded bg-avionics-card border border-avionics-border text-avionics-text">
                    {c.cover} {c.base ? `${c.base} ft (${Math.round(c.base * 0.3048)} м)` : ''}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Raw METAR */}
          {weather.raw_metar && (
            <div className="mb-3">
              <div className="flex items-center justify-between text-2xs text-avionics-muted mb-1 font-semibold">
                <span>RAW METAR:</span>
                <button
                  type="button"
                  onClick={() => copyText(weather.raw_metar!, 'metar')}
                  className="flex items-center space-x-1 text-sky-400 hover:text-sky-300"
                >
                  {copiedMetar ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                  <span>{copiedMetar ? 'Скопировано' : 'Копировать'}</span>
                </button>
              </div>
              <pre className="p-2 rounded-lg bg-black/40 border border-avionics-border font-mono text-2xs text-sky-300 whitespace-pre-wrap select-all leading-relaxed">
                {weather.raw_metar}
              </pre>
            </div>
          )}

          {/* Raw TAF */}
          {weather.raw_taf && (
            <div>
              <div className="flex items-center justify-between text-2xs text-avionics-muted mb-1 font-semibold">
                <span>RAW TAF (Прогноз):</span>
                <button
                  type="button"
                  onClick={() => copyText(weather.raw_taf!, 'taf')}
                  className="flex items-center space-x-1 text-indigo-400 hover:text-indigo-300"
                >
                  {copiedTaf ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                  <span>{copiedTaf ? 'Скопировано' : 'Копировать'}</span>
                </button>
              </div>
              <pre className="p-2 max-h-32 overflow-y-auto rounded-lg bg-black/40 border border-avionics-border font-mono text-2xs text-indigo-200 whitespace-pre-wrap select-all leading-relaxed">
                {weather.raw_taf}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
