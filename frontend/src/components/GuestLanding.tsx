import React from 'react';
import { Plane, Moon, MapPin, ShieldCheck, BarChart3, WifiOff, Lock, ArrowRight, CheckCircle2 } from 'lucide-react';

interface GuestLandingProps {
  onOpenAuth: (isRegister: boolean) => void;
}

export const GuestLanding: React.FC<GuestLandingProps> = ({ onOpenAuth }) => {
  return (
    <div className="min-h-[calc(100vh-80px)] flex flex-col justify-between">
      {/* Hero Section */}
      <section className="relative py-12 md:py-20 px-4 text-center max-w-5xl mx-auto">
        <div className="inline-flex items-center space-x-2 px-3 py-1.5 rounded-full bg-sky-500/10 border border-sky-500/30 text-sky-400 text-xs font-semibold mb-6">
          <Plane className="w-4 h-4 animate-pulse" />
          <span>Независимая цифровая лётная книжка для пилотов</span>
        </div>

        <h1 className="text-3xl md:text-5xl lg:text-6xl font-extrabold tracking-tight text-avionics-text mb-6">
          Полный контроль вашего налёта <br className="hidden sm:inline" />
          <span className="bg-gradient-to-r from-sky-400 via-teal-300 to-indigo-400 bg-clip-text text-transparent">
            без платных подписок
          </span>
        </h1>

        <p className="max-w-2xl mx-auto text-base md:text-lg text-avionics-muted mb-10 leading-relaxed">
          Профессиональный инструмент гражданской авиации. Ведите записи прямо в кабине в 100% офлайн-режиме, отслеживайте допуски по стандартам <strong>EASA</strong> и <strong>FAA</strong>, визуализируйте маршруты на карте и забудьте о платных зарубежных сервисах.
        </p>

        {/* CTA Buttons */}
        <div className="flex flex-col sm:flex-row items-center justify-center gap-4 max-w-md mx-auto mb-16">
          <button
            onClick={() => onOpenAuth(true)}
            className="w-full sm:w-auto flex items-center justify-center space-x-2 px-8 py-3.5 bg-sky-500 hover:bg-sky-400 text-slate-950 font-bold text-base rounded-xl transition-all shadow-lg shadow-sky-500/25 hover:shadow-sky-500/40 transform hover:-translate-y-0.5"
          >
            <span>Зарегистрироваться бесплатно</span>
            <ArrowRight className="w-5 h-5" />
          </button>

          <button
            onClick={() => onOpenAuth(false)}
            className="w-full sm:w-auto flex items-center justify-center space-x-2 px-8 py-3.5 bg-avionics-card hover:bg-slate-800 text-avionics-text border border-avionics-border font-semibold text-base rounded-xl transition-all"
          >
            <span>Войти в аккаунт</span>
          </button>
        </div>

        {/* Features Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 text-left">
          <div className="p-6 bg-avionics-surface border border-avionics-border rounded-2xl shadow-sm hover:border-sky-500/40 transition-colors">
            <div className="w-12 h-12 rounded-xl bg-sky-500/10 border border-sky-500/20 text-sky-400 flex items-center justify-center mb-4">
              <WifiOff className="w-6 h-6" />
            </div>
            <h3 className="text-lg font-bold text-avionics-text mb-2">100% Cockpit Offline</h3>
            <p className="text-sm text-avionics-muted leading-relaxed">
              Работайте в кабине самолёта при включенном «Авиарежиме». Все данные сохраняются на устройстве и синхронизируются с сервером при появлении сети.
            </p>
          </div>

          <div className="p-6 bg-avionics-surface border border-avionics-border rounded-2xl shadow-sm hover:border-indigo-500/40 transition-colors">
            <div className="w-12 h-12 rounded-xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 flex items-center justify-center mb-4">
              <Moon className="w-6 h-6" />
            </div>
            <h3 className="text-lg font-bold text-avionics-text mb-2">Авто-расчет Night Time</h3>
            <p className="text-sm text-avionics-muted leading-relaxed">
              Точный расчет ночного времени по гражданским сумеркам (Civil Twilight $&lt;-6^\circ$) и ортодромической дуге полета между аэропортами вылета и прилета.
            </p>
          </div>

          <div className="p-6 bg-avionics-surface border border-avionics-border rounded-2xl shadow-sm hover:border-emerald-500/40 transition-colors">
            <div className="w-12 h-12 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center justify-center mb-4">
              <ShieldCheck className="w-6 h-6" />
            </div>
            <h3 className="text-lg font-bold text-avionics-text mb-2">Контроль 90 дней (Currency)</h3>
            <p className="text-sm text-avionics-muted leading-relaxed">
              Автоматический контроль допуска к перевозке пассажиров (3 посадки за 90 дней день/ночь), контроль сроков Medical (ВЛЭК) и проверок LPC/OPC.
            </p>
          </div>

          <div className="p-6 bg-avionics-surface border border-avionics-border rounded-2xl shadow-sm hover:border-teal-500/40 transition-colors">
            <div className="w-12 h-12 rounded-xl bg-teal-500/10 border border-teal-500/20 text-teal-400 flex items-center justify-center mb-4">
              <MapPin className="w-6 h-6" />
            </div>
            <h3 className="text-lg font-bold text-avionics-text mb-2">Карта полетов</h3>
            <p className="text-sm text-avionics-muted leading-relaxed">
              Интерактивная карта мира с векторными линиями всех ваших рейсов, статистикой посещенных стран и аэродромов.
            </p>
          </div>

          <div className="p-6 bg-avionics-surface border border-avionics-border rounded-2xl shadow-sm hover:border-amber-500/40 transition-colors">
            <div className="w-12 h-12 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400 flex items-center justify-center mb-4">
              <BarChart3 className="w-6 h-6" />
            </div>
            <h3 className="text-lg font-bold text-avionics-text mb-2">Умная аналитика</h3>
            <p className="text-sm text-avionics-muted leading-relaxed">
              Подробная статистика налёта по типам ВС, ролям (PIC, SIC, PICUS), категориям заходов на посадку и динамике по месяцам.
            </p>
          </div>

          <div className="p-6 bg-avionics-surface border border-avionics-border rounded-2xl shadow-sm hover:border-purple-500/40 transition-colors">
            <div className="w-12 h-12 rounded-xl bg-purple-500/10 border border-purple-500/20 text-purple-400 flex items-center justify-center mb-4">
              <Lock className="w-6 h-6" />
            </div>
            <h3 className="text-lg font-bold text-avionics-text mb-2">Приватность и Multi-User</h3>
            <p className="text-sm text-avionics-muted leading-relaxed">
              Никаких третьих лиц. Разворачивайте на личном сервере для себя и своих коллег-пилотов с полной изоляцией учетных записей.
            </p>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-avionics-border py-6 text-center text-xs text-avionics-muted">
        OpenLogBook — Цифровая лётная книжка для пилотов ГА. Стандарты EASA FCL.050 & FAA Part 61.
      </footer>
    </div>
  );
};
