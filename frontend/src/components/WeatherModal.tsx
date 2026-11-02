import React, { useState, useEffect } from 'react';
import {
  X,
  CloudSun,
  Search,
  Wind,
  Thermometer,
  Gauge,
  Eye,
  Copy,
  Check,
  RefreshCw,
  Compass,
  ArrowRight,
  PlaneTakeoff,
  PlaneLanding,
  ShieldAlert,
} from 'lucide-react';
import { weatherService, WeatherInfo } from '../utils/weatherService';
import { airportService } from '../utils/airportService';
import { LocalAirport } from '../db/db';

interface WeatherModalProps {
  isOpen: boolean;
  onClose: () => void;
  defaultIcao?: string;
}

const POPULAR_AIRPORTS = [
  { icao: 'UUEE', name: 'Шереметьево' },
  { icao: 'UUDD', name: 'Домодедово' },
  { icao: 'UUWW', name: 'Внуково' },
  { icao: 'ULLI', name: 'Пулково' },
  { icao: 'OMDB', name: 'Дубай' },
  { icao: 'LTFM', name: 'Стамбул' },
  { icao: 'EDDF', name: 'Франкфурт' },
  { icao: 'KJFK', name: 'Нью-Йорк' },
];

export const WeatherModal: React.FC<WeatherModalProps> = ({ isOpen, onClose, defaultIcao = 'UUEE' }) => {
  const [tab, setTab] = useState<'single' | 'route'>('single');

  // Single mode state
  const [singleIcao, setSingleIcao] = useState(defaultIcao);
  const [singleWeather, setSingleWeather] = useState<WeatherInfo | null>(null);
  const [singleLoading, setSingleLoading] = useState(false);
  const [suggestions, setSuggestions] = useState<LocalAirport[]>([]);

  // Route mode state
  const [depIcao, setDepIcao] = useState('UUEE');
  const [arrIcao, setArrIcao] = useState('OMDB');
  const [altnIcao, setAltnIcao] = useState('OMAA');
  const [routeWeather, setRouteWeather] = useState<{
    dep: WeatherInfo | null;
    arr: WeatherInfo | null;
    altn: WeatherInfo | null;
  }>({ dep: null, arr: null, altn: null });
  const [routeLoading, setRouteLoading] = useState(false);

  // Copy feedback states
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const fetchSingle = async (icao: string) => {
    const code = icao.trim().toUpperCase();
    if (!code || code.length < 3) return;
    setSingleLoading(true);
    const data = await weatherService.getWeather(code);
    setSingleWeather(data);
    setSingleLoading(false);
  };

  const fetchRoute = async () => {
    setRouteLoading(true);
    const [dep, arr, altn] = await Promise.all([
      depIcao.length >= 3 ? weatherService.getWeather(depIcao) : Promise.resolve(null),
      arrIcao.length >= 3 ? weatherService.getWeather(arrIcao) : Promise.resolve(null),
      altnIcao.length >= 3 ? weatherService.getWeather(altnIcao) : Promise.resolve(null),
    ]);
    setRouteWeather({ dep, arr, altn });
    setRouteLoading(false);
  };

  useEffect(() => {
    if (isOpen) {
      if (tab === 'single') {
        fetchSingle(singleIcao);
      } else {
        fetchRoute();
      }
    }
  }, [isOpen, tab]);

  if (!isOpen) return null;

  const copyText = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const handleAirportInputChange = async (val: string) => {
    const up = val.toUpperCase();
    setSingleIcao(up);
    if (up.length >= 2) {
      const res = await airportService.searchAirports(up, 5);
      setSuggestions(res);
    } else {
      setSuggestions([]);
    }
  };

  const selectSuggestion = (icao: string) => {
    setSingleIcao(icao);
    setSuggestions([]);
    fetchSingle(icao);
  };

  const renderWeatherCard = (w: WeatherInfo | null, title?: string) => {
    if (!w) {
      return (
        <div className="p-5 rounded-2xl bg-avionics-card border border-avionics-border text-center text-avionics-muted text-xs">
          Нет данных по аэродрому
        </div>
      );
    }

    const cat = weatherService.getCategoryStyle(w.flight_category);

    return (
      <div className="p-5 rounded-2xl bg-avionics-card border border-avionics-border space-y-4 shadow-sm">
        {/* Card Header */}
        <div className="flex items-center justify-between pb-3 border-b border-avionics-border">
          <div className="flex items-center space-x-3">
            {title && (
              <span className="text-2xs font-bold uppercase tracking-wider text-sky-400 bg-sky-500/10 px-2 py-0.5 rounded border border-sky-500/20">
                {title}
              </span>
            )}
            <span className="text-xl font-black font-mono text-avionics-text tracking-wider">{w.icao}</span>
            <span className={`inline-flex items-center space-x-1 px-2 py-0.5 rounded text-xs font-bold border ${cat.bg}`}>
              <span className={`w-1.5 h-1.5 rounded-full ${cat.dot}`} />
              <span>{cat.label}</span>
            </span>
          </div>

          {w.obs_time && (
            <span className="text-2xs font-mono text-avionics-muted">
              {new Date(w.obs_time).toUTCString().slice(17, 22)} UTC
            </span>
          )}
        </div>

        {/* Decoded Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-xs">
          <div className="p-2.5 rounded-xl bg-avionics-surface border border-avionics-border">
            <span className="text-avionics-muted text-2xs block flex items-center">
              <Wind className="w-3 h-3 mr-1 text-sky-400" /> Ветер
            </span>
            <span className="font-mono font-bold text-avionics-text text-sm">
              {w.wind_dir ?? '—'}° / {w.wind_speed ?? '—'} kt
              {w.wind_gust ? ` G${w.wind_gust}` : ''}
            </span>
          </div>

          <div className="p-2.5 rounded-xl bg-avionics-surface border border-avionics-border">
            <span className="text-avionics-muted text-2xs block flex items-center">
              <Eye className="w-3 h-3 mr-1 text-emerald-400" /> Видимость
            </span>
            <span className="font-mono font-bold text-avionics-text text-sm">
              {w.visibility_sm !== null && w.visibility_sm !== undefined ? `${w.visibility_sm} SM` : '10+ км'}
            </span>
          </div>

          <div className="p-2.5 rounded-xl bg-avionics-surface border border-avionics-border">
            <span className="text-avionics-muted text-2xs block flex items-center">
              <Thermometer className="w-3 h-3 mr-1 text-amber-400" /> Темп. / Роса
            </span>
            <span className="font-mono font-bold text-avionics-text text-sm">
              {w.temp_c ?? '—'}°C / {w.dewpoint_c ?? '—'}°C
            </span>
          </div>

          <div className="p-2.5 rounded-xl bg-avionics-surface border border-avionics-border">
            <span className="text-avionics-muted text-2xs block flex items-center">
              <Gauge className="w-3 h-3 mr-1 text-indigo-400" /> QNH
            </span>
            <span className="font-mono font-bold text-avionics-text text-sm">
              {w.altim_hpa ? `Q${Math.round(w.altim_hpa)} hPa` : '—'}
            </span>
          </div>
        </div>

        {/* Clouds */}
        {w.clouds && w.clouds.length > 0 && (
          <div className="p-2.5 rounded-xl bg-avionics-surface border border-avionics-border text-xs">
            <span className="text-avionics-muted text-2xs block mb-1">Нижний край / Облачность:</span>
            <div className="flex flex-wrap gap-1.5 font-mono">
              {w.clouds.map((c, i) => (
                <span key={i} className="px-2 py-0.5 rounded bg-avionics-card border border-avionics-border text-avionics-text text-2xs">
                  {c.cover} {c.base ? `${c.base} ft (${Math.round(c.base * 0.3048)} м)` : ''}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* RAW METAR */}
        {w.raw_metar && (
          <div>
            <div className="flex items-center justify-between text-2xs text-avionics-muted font-semibold mb-1">
              <span>RAW METAR:</span>
              <button
                type="button"
                onClick={() => copyText(w.raw_metar!, `metar-${w.icao}`)}
                className="flex items-center space-x-1 text-sky-400 hover:text-sky-300 transition-colors"
              >
                {copiedKey === `metar-${w.icao}` ? (
                  <Check className="w-3.5 h-3.5 text-emerald-400" />
                ) : (
                  <Copy className="w-3.5 h-3.5" />
                )}
                <span>{copiedKey === `metar-${w.icao}` ? 'Скопировано' : 'Копировать'}</span>
              </button>
            </div>
            <pre className="p-3 rounded-xl bg-black/40 border border-avionics-border font-mono text-xs text-sky-300 whitespace-pre-wrap select-all leading-relaxed">
              {w.raw_metar}
            </pre>
          </div>
        )}

        {/* RAW TAF */}
        {w.raw_taf && (
          <div>
            <div className="flex items-center justify-between text-2xs text-avionics-muted font-semibold mb-1">
              <span>RAW TAF (Прогноз аэродрома):</span>
              <button
                type="button"
                onClick={() => copyText(w.raw_taf!, `taf-${w.icao}`)}
                className="flex items-center space-x-1 text-indigo-400 hover:text-indigo-300 transition-colors"
              >
                {copiedKey === `taf-${w.icao}` ? (
                  <Check className="w-3.5 h-3.5 text-emerald-400" />
                ) : (
                  <Copy className="w-3.5 h-3.5" />
                )}
                <span>{copiedKey === `taf-${w.icao}` ? 'Скопировано' : 'Копировать'}</span>
              </button>
            </div>
            <pre className="p-3 max-h-40 overflow-y-auto rounded-xl bg-black/40 border border-avionics-border font-mono text-xs text-indigo-200 whitespace-pre-wrap select-all leading-relaxed">
              {w.raw_taf}
            </pre>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4 overflow-y-auto">
      <div className="bg-avionics-surface border border-avionics-border rounded-t-3xl sm:rounded-3xl w-full max-w-4xl shadow-2xl overflow-hidden my-0 sm:my-6 max-h-[92vh] flex flex-col">
        {/* Modal Header */}
        <div className="flex items-center justify-between px-4 sm:px-6 py-3.5 sm:py-4 border-b border-avionics-border bg-avionics-card shrink-0">
          <div className="flex items-center space-x-3">
            <div className="p-2 sm:p-2.5 bg-sky-500/10 border border-sky-500/20 rounded-2xl text-sky-400">
              <CloudSun className="w-5 h-5 sm:w-6 sm:h-6" />
            </div>
            <div>
              <h2 className="text-sm sm:text-lg font-bold text-avionics-text">
                Авиационный метеобрифинг (METAR & TAF)
              </h2>
              <p className="text-[11px] sm:text-xs text-avionics-muted">
                Фактическая погода и прогнозы аэродромов в реальном времени (NOAA)
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 sm:p-2 text-avionics-muted hover:text-avionics-text rounded-xl hover:bg-avionics-surface transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Mode Tabs */}
        <div className="flex border-b border-avionics-border bg-avionics-card/50 px-6 pt-3">
          <div className="flex space-x-2">
            <button
              onClick={() => setTab('single')}
              className={`px-4 py-2 text-xs font-bold rounded-t-xl transition-all border-b-2 ${
                tab === 'single'
                  ? 'border-sky-400 text-sky-400 bg-avionics-surface'
                  : 'border-transparent text-avionics-muted hover:text-avionics-text'
              }`}
            >
              Одиночный аэродром
            </button>
            <button
              onClick={() => setTab('route')}
              className={`px-4 py-2 text-xs font-bold rounded-t-xl transition-all border-b-2 ${
                tab === 'route'
                  ? 'border-sky-400 text-sky-400 bg-avionics-surface'
                  : 'border-transparent text-avionics-muted hover:text-avionics-text'
              }`}
            >
              Маршрутный брифинг (DEP — ARR — ALTN)
            </button>
          </div>
        </div>

        {/* Modal Content */}
        <div className="p-4 sm:p-6 space-y-4 sm:space-y-6 flex-1 overflow-y-auto">
          {tab === 'single' ? (
            <div className="space-y-5">
              {/* Airport Search Bar */}
              <div className="relative">
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <input
                      type="text"
                      value={singleIcao}
                      onChange={(e) => handleAirportInputChange(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && fetchSingle(singleIcao)}
                      placeholder="Введите код ICAO (например: UUEE, OMDB, KJFK)..."
                      className="w-full bg-avionics-card border border-avionics-border rounded-xl px-4 py-3 text-base font-mono font-bold tracking-wider text-sky-400 uppercase focus:outline-none focus:border-sky-500 placeholder:normal-case placeholder:font-normal placeholder:text-avionics-muted"
                    />
                    {suggestions.length > 0 && (
                      <div className="absolute left-0 right-0 top-full mt-1 bg-avionics-card border border-avionics-border rounded-xl shadow-xl z-30 max-h-48 overflow-y-auto divide-y divide-avionics-border">
                        {suggestions.map((s) => (
                          <button
                            key={s.icao}
                            type="button"
                            onClick={() => selectSuggestion(s.icao)}
                            className="w-full text-left px-4 py-2 hover:bg-avionics-surface active:bg-avionics-surface transition-colors flex items-center justify-between text-xs cursor-pointer"
                          >
                            <span className="font-mono font-bold text-sky-400">{s.icao} ({s.iata || '—'})</span>
                            <span className="text-avionics-muted truncate max-w-[240px]">{s.name}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  <button
                    onClick={() => fetchSingle(singleIcao)}
                    disabled={singleLoading}
                    className="px-6 py-3 bg-sky-500 hover:bg-sky-400 text-slate-950 font-bold text-sm rounded-xl transition-all flex items-center space-x-2 cursor-pointer shadow-md shadow-sky-500/20 disabled:opacity-50"
                  >
                    {singleLoading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                    <span>Запросить</span>
                  </button>
                </div>

                {/* Popular airport quick chips */}
                <div className="flex flex-wrap items-center gap-1.5 mt-3">
                  <span className="text-2xs text-avionics-muted mr-1 font-semibold">Популярные:</span>
                  {POPULAR_AIRPORTS.map((a) => (
                    <button
                      key={a.icao}
                      type="button"
                      onClick={() => selectSuggestion(a.icao)}
                      className="px-2.5 py-1 rounded-lg bg-avionics-card hover:bg-avionics-surface active:bg-avionics-surface text-avionics-muted hover:text-sky-400 border border-avionics-border text-2xs font-mono font-semibold transition-all cursor-pointer"
                    >
                      {a.icao} <span className="opacity-70 font-sans">({a.name})</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Weather Display */}
              {singleLoading ? (
                <div className="p-12 text-center text-avionics-muted space-y-3">
                  <RefreshCw className="w-8 h-8 animate-spin mx-auto text-sky-400" />
                  <p className="text-sm font-semibold">Запрос сводки METAR и прогноза TAF для {singleIcao}...</p>
                </div>
              ) : (
                renderWeatherCard(singleWeather)
              )}
            </div>
          ) : (
            /* Route Mode */
            <div className="space-y-6">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 p-4 bg-avionics-card border border-avionics-border rounded-2xl">
                <div>
                  <label className="block text-2xs font-bold uppercase tracking-wider text-avionics-muted mb-1 flex items-center">
                    <PlaneTakeoff className="w-3.5 h-3.5 mr-1 text-sky-400" /> Вылет (DEP)
                  </label>
                  <input
                    type="text"
                    value={depIcao}
                    onChange={(e) => setDepIcao(e.target.value.toUpperCase())}
                    placeholder="UUEE"
                    className="w-full bg-avionics-surface border border-avionics-border rounded-xl px-3 py-2 text-sm font-mono font-bold tracking-wider text-sky-400 uppercase focus:outline-none focus:border-sky-500"
                  />
                </div>

                <div>
                  <label className="block text-2xs font-bold uppercase tracking-wider text-avionics-muted mb-1 flex items-center">
                    <PlaneLanding className="w-3.5 h-3.5 mr-1 text-sky-400" /> Прилет (ARR)
                  </label>
                  <input
                    type="text"
                    value={arrIcao}
                    onChange={(e) => setArrIcao(e.target.value.toUpperCase())}
                    placeholder="OMDB"
                    className="w-full bg-avionics-surface border border-avionics-border rounded-xl px-3 py-2 text-sm font-mono font-bold tracking-wider text-sky-400 uppercase focus:outline-none focus:border-sky-500"
                  />
                </div>

                <div>
                  <label className="block text-2xs font-bold uppercase tracking-wider text-avionics-muted mb-1 flex items-center">
                    <ShieldAlert className="w-3.5 h-3.5 mr-1 text-amber-400" /> Запасной (ALTN)
                  </label>
                  <input
                    type="text"
                    value={altnIcao}
                    onChange={(e) => setAltnIcao(e.target.value.toUpperCase())}
                    placeholder="OMAA"
                    className="w-full bg-avionics-surface border border-avionics-border rounded-xl px-3 py-2 text-sm font-mono font-bold tracking-wider text-sky-400 uppercase focus:outline-none focus:border-sky-500"
                  />
                </div>
              </div>

              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={fetchRoute}
                  disabled={routeLoading}
                  className="px-6 py-2.5 bg-sky-500 hover:bg-sky-400 text-slate-950 font-bold text-xs rounded-xl transition-all flex items-center space-x-2 cursor-pointer shadow-md disabled:opacity-50"
                >
                  {routeLoading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                  <span>Запросить маршрут</span>
                </button>
              </div>

              {routeLoading ? (
                <div className="p-12 text-center text-avionics-muted space-y-3">
                  <RefreshCw className="w-8 h-8 animate-spin mx-auto text-sky-400" />
                  <p className="text-sm font-semibold">Запрос сводок для маршрута {depIcao} → {arrIcao}...</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {routeWeather.dep && renderWeatherCard(routeWeather.dep, 'Аэродром вылета (DEP)')}
                  {routeWeather.arr && renderWeatherCard(routeWeather.arr, 'Аэродром прилета (ARR)')}
                  {routeWeather.altn && renderWeatherCard(routeWeather.altn, 'Запасной аэродром (ALTN)')}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
