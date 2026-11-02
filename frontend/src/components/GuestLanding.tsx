import React, { useState } from 'react';
import {
  Plane,
  Moon,
  MapPin,
  ShieldCheck,
  BarChart3,
  WifiOff,
  ArrowRight,
  CloudSun,
  FileSpreadsheet,
  UploadCloud,
  CheckCircle2,
  Calendar,
  Compass,
  TrendingUp,
  Sparkles,
  Globe,
} from 'lucide-react';
import { GuestFlightMap } from './GuestFlightMap';

interface GuestLandingProps {
  onOpenAuth: (isRegister: boolean) => void;
}

interface DemoData {
  totalHours: string;
  nightHours: string;
  picHours: string;
  landings: number;
  route: { dep: string; depCity: string; arr: string; arrCity: string; dist: string; fltTime: string };
  weather: { cat: string; wind: string; temp: string; qnh: string; desc: string };
  bars: Array<{ month: string; dayH: number; nightH: number }>;
}

const DEMO_PRESETS: Record<'all' | 'a320' | 'b738', DemoData> = {
  all: {
    totalHours: '1 248:40',
    nightHours: '312:15',
    picHours: '780:30',
    landings: 486,
    route: { dep: 'UUEE', depCity: 'Москва (SVO)', arr: 'OMDB', arrCity: 'Дубай (DXB)', dist: '3 680 км', fltTime: '05:15' },
    weather: { cat: 'VFR', wind: '020° 08kt', temp: '+28°C', qnh: 'Q1014', desc: 'Cavok, видимость >10 км' },
    bars: [
      { month: 'Май', dayH: 52, nightH: 18 },
      { month: 'Июн', dayH: 64, nightH: 22 },
      { month: 'Июл', dayH: 78, nightH: 26 },
      { month: 'Авг', dayH: 82, nightH: 28 },
      { month: 'Сен', dayH: 68, nightH: 24 },
      { month: 'Окт', dayH: 58, nightH: 20 },
    ],
  },
  a320: {
    totalHours: '864:20',
    nightHours: '214:50',
    picHours: '540:00',
    landings: 342,
    route: { dep: 'ULLI', depCity: 'Санкт-Петербург (LED)', arr: 'LTFM', arrCity: 'Стамбул (IST)', dist: '2 120 км', fltTime: '03:40' },
    weather: { cat: 'MVFR', wind: '060° 14kt', temp: '+16°C', qnh: 'Q1019', desc: 'BKN 1800ft, видимость 7 км' },
    bars: [
      { month: 'Май', dayH: 38, nightH: 14 },
      { month: 'Июн', dayH: 46, nightH: 16 },
      { month: 'Июл', dayH: 54, nightH: 18 },
      { month: 'Авг', dayH: 58, nightH: 20 },
      { month: 'Сен', dayH: 48, nightH: 16 },
      { month: 'Окт', dayH: 40, nightH: 14 },
    ],
  },
  b738: {
    totalHours: '384:20',
    nightHours: '97:25',
    picHours: '240:30',
    landings: 144,
    route: { dep: 'EDDF', depCity: 'Франкфурт (FRA)', arr: 'KJFK', arrCity: 'Нью-Йорк (JFK)', dist: '6 200 км', fltTime: '08:25' },
    weather: { cat: 'VFR', wind: '240° 11kt', temp: '+21°C', qnh: 'Q1022', desc: 'SCT 4500ft, видимость 10 км' },
    bars: [
      { month: 'Май', dayH: 14, nightH: 4 },
      { month: 'Июн', dayH: 18, nightH: 6 },
      { month: 'Июл', dayH: 24, nightH: 8 },
      { month: 'Авг', dayH: 24, nightH: 8 },
      { month: 'Сен', dayH: 20, nightH: 8 },
      { month: 'Окт', dayH: 18, nightH: 6 },
    ],
  },
};

export const GuestLanding: React.FC<GuestLandingProps> = ({ onOpenAuth }) => {
  const [activePreset, setActivePreset] = useState<'all' | 'a320' | 'b738'>('all');
  const demo = DEMO_PRESETS[activePreset];

  const maxBarH = 110;

  return (
    <div className="min-h-[calc(100vh-80px)] flex flex-col justify-between">
      {/* Hero Section */}
      <section className="relative pt-10 pb-16 md:py-16 px-4 max-w-6xl mx-auto text-center">
        {/* Top Pilot Badge */}
        <div className="inline-flex items-center space-x-2 px-3.5 py-1.5 rounded-full bg-sky-500/10 border border-sky-500/30 text-sky-400 text-xs font-semibold mb-6 shadow-sm">
          <Plane className="w-4 h-4 animate-pulse" />
          <span>Профессиональная цифровая лётная книжка для пилотов ГА</span>
        </div>

        {/* Hero Title */}
        <h1 className="text-3xl sm:text-5xl lg:text-6xl font-black tracking-tight text-avionics-text mb-6 leading-tight">
          Полный контроль вашего налёта <br className="hidden sm:inline" />
          <span className="bg-gradient-to-r from-sky-400 via-teal-300 to-indigo-400 bg-clip-text text-transparent">
            в кабине и на земле
          </span>
        </h1>

        {/* Subtitle */}
        <p className="max-w-3xl mx-auto text-base sm:text-lg text-avionics-muted mb-8 leading-relaxed">
          Ведите записи прямо в рейсе при 100% авиарежиме, получайте актуальную погоду <strong>METAR & TAF</strong> с автодекодированием, рассчитывайте ночной налёт по гражданским сумеркам и экспортируйте данные в официальные форматы <strong>EASA FCL.050</strong> и <strong>FAA Part 61</strong>.
        </p>

        {/* CTA Buttons */}
        <div className="flex flex-col sm:flex-row items-center justify-center gap-4 max-w-md mx-auto mb-14">
          <button
            onClick={() => onOpenAuth(true)}
            className="w-full sm:w-auto flex items-center justify-center space-x-2 px-8 py-3.5 bg-sky-500 hover:bg-sky-400 text-slate-950 font-bold text-base rounded-xl transition-all shadow-lg shadow-sky-500/25 hover:shadow-sky-500/40 transform hover:-translate-y-0.5 cursor-pointer"
          >
            <span>Начать бесплатно</span>
            <ArrowRight className="w-5 h-5" />
          </button>

          <button
            onClick={() => onOpenAuth(false)}
            className="w-full sm:w-auto flex items-center justify-center space-x-2 px-8 py-3.5 bg-avionics-card hover:bg-avionics-surface active:bg-avionics-surface text-avionics-text border border-avionics-border font-semibold text-base rounded-xl transition-all cursor-pointer shadow-sm"
          >
            <span>Войти в систему</span>
          </button>
        </div>

        {/* ========================================================= */}
        {/* INTERACTIVE DEMO COCKPIT DASHBOARD (Live Interactive Sandbox) */}
        {/* ========================================================= */}
        <div className="relative text-left bg-avionics-surface border border-avionics-border rounded-3xl p-4 sm:p-7 shadow-2xl mb-16 overflow-hidden">
          {/* Dashboard Header Bar */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-5 border-b border-avionics-border gap-4">
            <div className="flex items-center space-x-3">
              <div className="p-2.5 rounded-2xl bg-sky-500/10 border border-sky-500/30 text-sky-400 shrink-0">
                <Compass className="w-5 h-5 animate-spin-slow" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center space-x-2 flex-wrap">
                  <h3 className="font-extrabold text-base sm:text-lg text-avionics-text truncate">
                    Интерактивное превью кабины
                  </h3>
                  <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 text-2xs font-bold uppercase shrink-0">
                    <Sparkles className="w-3 h-3 mr-0.5" /> Демо
                  </span>
                </div>
                <p className="text-xs text-avionics-muted mt-0.5">
                  Переключайте типы воздушных судов для мгновенного пересчета часов
                </p>
              </div>
            </div>

            {/* Type selector buttons - Responsive 3-col grid on mobile, flex on desktop */}
            <div className="grid grid-cols-3 sm:flex items-center bg-avionics-card p-1 rounded-xl border border-avionics-border w-full sm:w-auto text-xs font-semibold gap-1 shrink-0">
              <button
                type="button"
                onClick={() => setActivePreset('all')}
                className={`px-2.5 sm:px-3 py-1.5 rounded-lg text-center truncate transition-all cursor-pointer ${
                  activePreset === 'all'
                    ? 'bg-sky-500 text-slate-950 font-bold shadow-sm'
                    : 'text-avionics-muted hover:text-avionics-text'
                }`}
              >
                <span className="sm:hidden">Весь флот</span>
                <span className="hidden sm:inline">Весь налёт (Fleet)</span>
              </button>
              <button
                type="button"
                onClick={() => setActivePreset('a320')}
                className={`px-2.5 sm:px-3 py-1.5 rounded-lg text-center truncate transition-all cursor-pointer ${
                  activePreset === 'a320'
                    ? 'bg-sky-500 text-slate-950 font-bold shadow-sm'
                    : 'text-avionics-muted hover:text-avionics-text'
                }`}
              >
                Airbus A320
              </button>
              <button
                type="button"
                onClick={() => setActivePreset('b738')}
                className={`px-2.5 sm:px-3 py-1.5 rounded-lg text-center truncate transition-all cursor-pointer ${
                  activePreset === 'b738'
                    ? 'bg-sky-500 text-slate-950 font-bold shadow-sm'
                    : 'text-avionics-muted hover:text-avionics-text'
                }`}
              >
                Boeing 737
              </button>
            </div>
          </div>

          {/* Interactive KPI Cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 my-6">
            <div className="p-4 rounded-2xl bg-avionics-card border border-avionics-border shadow-sm">
              <span className="text-2xs font-bold uppercase tracking-wider text-avionics-muted block">
                Общий налёт (Total)
              </span>
              <div className="text-xl sm:text-2xl font-black font-mono text-sky-400 mt-1">
                {demo.totalHours}
              </div>
              <div className="text-2xs text-avionics-muted mt-0.5">Точный суммарный налёт</div>
            </div>

            <div className="p-4 rounded-2xl bg-avionics-card border border-avionics-border shadow-sm">
              <span className="text-2xs font-bold uppercase tracking-wider text-avionics-muted block">
                Ночной налёт (Night)
              </span>
              <div className="text-xl sm:text-2xl font-black font-mono text-indigo-400 mt-1">
                {demo.nightHours}
              </div>
              <div className="text-2xs text-avionics-muted mt-0.5">Расчет по Civil Twilight</div>
            </div>

            <div className="p-4 rounded-2xl bg-avionics-card border border-avionics-border shadow-sm">
              <span className="text-2xs font-bold uppercase tracking-wider text-avionics-muted block">
                Командир (PIC)
              </span>
              <div className="text-xl sm:text-2xl font-black font-mono text-emerald-400 mt-1">
                {demo.picHours}
              </div>
              <div className="text-2xs text-avionics-muted mt-0.5">PIC / PICUS часы</div>
            </div>

            <div className="p-4 rounded-2xl bg-avionics-card border border-avionics-border shadow-sm">
              <span className="text-2xs font-bold uppercase tracking-wider text-avionics-muted block">
                Посадки (Landings)
              </span>
              <div className="text-xl sm:text-2xl font-black font-mono text-amber-400 mt-1">
                {demo.landings}
              </div>
              <div className="text-2xs text-emerald-400 font-semibold mt-0.5">
                3 за 90 дней: Допуск активен ✓
              </div>
            </div>
          </div>

          {/* Live Flight Radar Map (Guest Interactive Demo) */}
          <div className="mb-6">
            <div className="flex items-center justify-between mb-2 px-1">
              <div className="flex items-center space-x-2 text-xs font-bold uppercase tracking-wider text-avionics-muted">
                <Globe className="w-4 h-4 text-sky-400" />
                <span>Радарная карта маршрутов (Great-Circle Arcs)</span>
              </div>
              <span className="text-2xs text-avionics-muted font-mono hidden sm:inline">
                {activePreset === 'all'
                  ? '5 маршрутов • Шереметьево, Дубай, Пулково, Стамбул, JFK'
                  : activePreset === 'a320'
                  ? 'Флот А320: LED-IST, SVO-LED, SVO-AER'
                  : 'Флот B738: SVO-DXB, FRA-JFK, SVO-LED'}
              </span>
            </div>
            <GuestFlightMap activePreset={activePreset} />
          </div>

          {/* Interactive Chart + Live Route Preview Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Monthly Stacked Chart */}
            <div className="lg:col-span-2 p-5 bg-avionics-card border border-avionics-border rounded-2xl">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center space-x-2">
                  <TrendingUp className="w-4 h-4 text-sky-400" />
                  <span className="text-xs font-bold uppercase tracking-wider text-avionics-muted">
                    Динамика часов (День / Ночь)
                  </span>
                </div>
                <div className="flex items-center space-x-3 text-2xs font-semibold">
                  <span className="flex items-center space-x-1">
                    <span className="w-2.5 h-2.5 rounded-sm bg-sky-400 inline-block" />
                    <span className="text-avionics-muted">День</span>
                  </span>
                  <span className="flex items-center space-x-1">
                    <span className="w-2.5 h-2.5 rounded-sm bg-indigo-500 inline-block" />
                    <span className="text-avionics-muted">Ночь</span>
                  </span>
                </div>
              </div>

              {/* SVG Stacked Bars */}
              <div className="h-44 flex items-end justify-between gap-3 px-2 border-b border-avionics-border pb-1">
                {demo.bars.map((bar) => {
                  const total = bar.dayH + bar.nightH;
                  const totalHeightPct = Math.round((total / maxBarH) * 100);
                  const dayPct = Math.round((bar.dayH / total) * 100);
                  const nightPct = 100 - dayPct;

                  return (
                    <div key={bar.month} className="flex-1 flex flex-col items-center h-full justify-end group">
                      <span className="text-2xs font-mono font-bold text-sky-400 mb-1 opacity-80 group-hover:opacity-100 transition-opacity">
                        {total} ч
                      </span>
                      <div
                        style={{ height: `${totalHeightPct}%` }}
                        className="w-full max-w-[36px] rounded-t-lg overflow-hidden flex flex-col-reverse shadow-md transition-all duration-300 group-hover:brightness-125"
                      >
                        <div style={{ height: `${dayPct}%` }} className="w-full bg-sky-400 transition-all" />
                        <div style={{ height: `${nightPct}%` }} className="w-full bg-indigo-500 transition-all" />
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Month Labels */}
              <div className="flex justify-between gap-3 px-2 pt-2 text-2xs font-mono text-avionics-muted text-center">
                {demo.bars.map((b) => (
                  <span key={b.month} className="flex-1">
                    {b.month}
                  </span>
                ))}
              </div>
            </div>

            {/* Live Route & Weather Card */}
            <div className="p-5 bg-avionics-card border border-avionics-border rounded-2xl flex flex-col justify-between">
              <div>
                <span className="text-2xs font-bold uppercase tracking-wider text-avionics-muted block mb-3">
                  Отображение рейса и погода
                </span>

                <div className="p-3.5 bg-avionics-surface border border-avionics-border rounded-xl mb-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="font-mono font-black text-xl text-sky-400">{demo.route.dep}</div>
                      <div className="text-2xs text-avionics-muted truncate">{demo.route.depCity}</div>
                    </div>
                    <div className="flex flex-col items-center px-2">
                      <span className="text-2xs font-mono font-bold text-avionics-muted">{demo.route.fltTime}</span>
                      <Plane className="w-4 h-4 text-sky-400 rotate-90 my-0.5" />
                      <span className="text-2xs text-avionics-muted">{demo.route.dist}</span>
                    </div>
                    <div className="text-right">
                      <div className="font-mono font-black text-xl text-sky-400">{demo.route.arr}</div>
                      <div className="text-2xs text-avionics-muted truncate">{demo.route.arrCity}</div>
                    </div>
                  </div>
                </div>

                {/* Weather Pill */}
                <div className="p-3 bg-avionics-surface border border-avionics-border rounded-xl space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-2xs font-bold text-avionics-muted uppercase flex items-center space-x-1">
                      <CloudSun className="w-3.5 h-3.5 text-amber-400 mr-1" />
                      METAR {demo.route.arr}
                    </span>
                    <span className="px-1.5 py-0.5 rounded text-2xs font-bold bg-emerald-500/15 border border-emerald-500/30 text-emerald-400">
                      {demo.weather.cat}
                    </span>
                  </div>
                  <div className="font-mono text-2xs text-avionics-text flex items-center justify-between">
                    <span>Ветер: <strong>{demo.weather.wind}</strong></span>
                    <span>t°: <strong>{demo.weather.temp}</strong></span>
                    <span>QNH: <strong>{demo.weather.qnh}</strong></span>
                  </div>
                  <div className="text-2xs text-avionics-muted truncate">
                    {demo.weather.desc}
                  </div>
                </div>
              </div>

              <div className="mt-4 pt-3 border-t border-avionics-border flex items-center justify-between text-2xs">
                <span className="text-avionics-muted">Готово к синхронизации</span>
                <span className="text-emerald-400 font-bold flex items-center space-x-1">
                  <CheckCircle2 className="w-3.5 h-3.5 mr-0.5" /> Все данные сохранены
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* ========================================================= */}
        {/* 6 KEY AVIATION ADVANTAGES (Zero mention of security) */}
        {/* ========================================================= */}
        <div className="text-center mb-8">
          <h2 className="text-2xl sm:text-3xl font-extrabold text-avionics-text">
            Создано пилотами для пилотов
          </h2>
          <p className="text-sm text-avionics-muted mt-2 max-w-xl mx-auto">
            Каждая функция разработана с учетом реальных рабочих процессов авиакомпаний и авиации общего назначения
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 text-left">
          {/* 1. Cockpit Offline */}
          <div className="p-6 bg-avionics-surface border border-avionics-border rounded-2xl shadow-sm hover:border-sky-500/40 transition-colors">
            <div className="w-12 h-12 rounded-xl bg-sky-500/10 border border-sky-500/20 text-sky-400 flex items-center justify-center mb-4">
              <WifiOff className="w-6 h-6" />
            </div>
            <h3 className="text-lg font-bold text-avionics-text mb-2">100% Cockpit Offline</h3>
            <p className="text-sm text-avionics-muted leading-relaxed">
              Заполняйте лётную книжку прямо на эшелоне при включенном «Авиарежиме». Все данные надежно сохраняются в локальной базе устройства и автоматически синхронизируются при посадке.
            </p>
          </div>

          {/* 2. Night Time Calculator */}
          <div className="p-6 bg-avionics-surface border border-avionics-border rounded-2xl shadow-sm hover:border-indigo-500/40 transition-colors">
            <div className="w-12 h-12 rounded-xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 flex items-center justify-center mb-4">
              <Moon className="w-6 h-6" />
            </div>
            <h3 className="text-lg font-bold text-avionics-text mb-2">Авто-расчет Night Time</h3>
            <p className="text-sm text-avionics-muted leading-relaxed">
              Математически точный расчет времени ночного полета по гражданским сумеркам (Civil Twilight $&lt;-6^\circ$) с учетом координат солнца и ортодромической дуги маршрута.
            </p>
          </div>

          {/* 3. Currency 90 Days */}
          <div className="p-6 bg-avionics-surface border border-avionics-border rounded-2xl shadow-sm hover:border-emerald-500/40 transition-colors">
            <div className="w-12 h-12 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center justify-center mb-4">
              <ShieldCheck className="w-6 h-6" />
            </div>
            <h3 className="text-lg font-bold text-avionics-text mb-2">Контроль допусков (90 дней)</h3>
            <p className="text-sm text-avionics-muted leading-relaxed">
              Автоматическое отслеживание правила 3 посадок за 90 дней (день и ночь), сроков действия медицинского сертификата (ВЛЭК/Medical) и периодических проверок LPC / OPC.
            </p>
          </div>

          {/* 4. Live METAR & TAF Weather */}
          <div className="p-6 bg-avionics-surface border border-avionics-border rounded-2xl shadow-sm hover:border-teal-500/40 transition-colors">
            <div className="w-12 h-12 rounded-xl bg-teal-500/10 border border-teal-500/20 text-teal-400 flex items-center justify-center mb-4">
              <CloudSun className="w-6 h-6" />
            </div>
            <h3 className="text-lg font-bold text-avionics-text mb-2">Погода METAR & TAF</h3>
            <p className="text-sm text-avionics-muted leading-relaxed">
              Мгновенное получение и декодирование фактической погоды и прогноза при выборе аэродромов. Определение летной категории VFR/MVFR/IFR, ветра, видимости, потолка и давления QNH.
            </p>
          </div>

          {/* 5. EASA & FAA Export */}
          <div className="p-6 bg-avionics-surface border border-avionics-border rounded-2xl shadow-sm hover:border-amber-500/40 transition-colors">
            <div className="w-12 h-12 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400 flex items-center justify-center mb-4">
              <FileSpreadsheet className="w-6 h-6" />
            </div>
            <h3 className="text-lg font-bold text-avionics-text mb-2">Экспорт EASA & FAA</h3>
            <p className="text-sm text-avionics-muted leading-relaxed">
              Формирование официальных отчетов по стандартам EASA FCL.050 и FAA Part 61. Выгрузка в профессиональный PDF с разбивкой по ролям и табличный Excel для отчетности.
            </p>
          </div>

          {/* 6. Airline Roster Import */}
          <div className="p-6 bg-avionics-surface border border-avionics-border rounded-2xl shadow-sm hover:border-purple-500/40 transition-colors">
            <div className="w-12 h-12 rounded-xl bg-purple-500/10 border border-purple-500/20 text-purple-400 flex items-center justify-center mb-4">
              <UploadCloud className="w-6 h-6" />
            </div>
            <h3 className="text-lg font-bold text-avionics-text mb-2">Импорт экипажных ростеров</h3>
            <p className="text-sm text-avionics-muted leading-relaxed">
              Забудьте о ручном вводе каждого рейса. Импортируйте месячные графики полетов из систем AIMS, Sabre, e-Crew за пару кликов с автоматическим заполнением типов ВС и времени.
            </p>
          </div>
        </div>

        {/* Bottom Call to action box */}
        <div className="mt-16 p-8 bg-gradient-to-r from-sky-500/10 via-avionics-surface to-indigo-500/10 border border-sky-500/30 rounded-3xl text-center">
          <h3 className="text-2xl font-black text-avionics-text mb-2">
            Готовы навести идеальный порядок в лётной книжке?
          </h3>
          <p className="text-sm text-avionics-muted mb-6 max-w-xl mx-auto">
            Создайте аккаунт за 10 секунд и оцените удобство независимой авиационной системы уже сегодня.
          </p>
          <button
            onClick={() => onOpenAuth(true)}
            className="inline-flex items-center space-x-2 px-8 py-3.5 bg-sky-500 hover:bg-sky-400 text-slate-950 font-bold text-base rounded-xl transition-all shadow-lg shadow-sky-500/25 hover:shadow-sky-500/40 cursor-pointer"
          >
            <span>Зарегистрироваться бесплатно</span>
            <ArrowRight className="w-5 h-5" />
          </button>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-avionics-border py-6 text-center text-xs text-avionics-muted">
        OpenLogBook — Цифровая лётная книжка для пилотов ГА. Стандарты EASA FCL.050 & FAA Part 61.
      </footer>
    </div>
  );
};
