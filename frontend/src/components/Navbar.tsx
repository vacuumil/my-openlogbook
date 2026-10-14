import React from 'react';
import {
  Plane,
  Moon,
  Sun,
  Wifi,
  WifiOff,
  Plus,
  Award,
  RefreshCw,
  User,
  CheckCircle2,
  AlertCircle,
  Map,
  BarChart3,
  Download,
  Upload,
} from 'lucide-react';
import { SyncState } from '../services/syncEngine';

export type ActiveTab = 'flights' | 'map' | 'stats' | 'currency';
export type ThemeMode = 'dark' | 'light';

interface NavbarProps {
  activeTab: ActiveTab;
  setActiveTab: (tab: ActiveTab) => void;
  onOpenNewFlight: () => void;
  onOpenExport: () => void;
  onOpenImport: () => void;
  onOpenAuth: () => void;
  currentUser: any;
  isOnline: boolean;
  syncState: SyncState;
  syncMessage?: string;
  onManualSync: () => void;
  theme: ThemeMode;
  setTheme: (t: ThemeMode) => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  activeTab,
  setActiveTab,
  onOpenNewFlight,
  onOpenExport,
  onOpenImport,
  onOpenAuth,
  currentUser,
  isOnline,
  syncState,
  syncMessage,
  onManualSync,
  theme,
  setTheme,
}) => {
  // 2-Mode toggle: Dark <-> Daylight
  const toggleTheme = () => {
    setTheme(theme === 'dark' ? 'light' : 'dark');
  };

  return (
    <header className="sticky top-0 z-40 bg-avionics-surface border-b border-avionics-border px-4 py-3 shadow-md">
      <div className="max-w-7xl mx-auto flex items-center justify-between gap-2">
        {/* Logo & Brand */}
        <div className="flex items-center space-x-3">
          <div className="p-2.5 bg-sky-500/10 border border-sky-500/30 rounded-xl text-sky-400">
            <Plane className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <span className="text-base md:text-lg font-black tracking-tight text-avionics-text">
                OpenLogBook
              </span>
              <span className="text-[10px] font-mono font-bold uppercase bg-sky-500/20 text-sky-400 px-2 py-0.5 rounded-full border border-sky-500/30">
                EASA / FAA
              </span>
            </div>
            {currentUser && (
              <div className="flex items-center space-x-2 text-xs text-avionics-muted mt-0.5">
                {isOnline ? (
                  <button
                    onClick={onManualSync}
                    title={syncMessage || 'Нажмите для синхронизации'}
                    className="flex items-center text-emerald-400 space-x-1 hover:underline"
                  >
                    <Wifi className="w-3 h-3" />
                    <span>{syncState === 'syncing' ? 'Синхронизация...' : 'Онлайн'}</span>
                    {syncState === 'syncing' ? (
                      <RefreshCw className="w-2.5 h-2.5 animate-spin ml-0.5 text-sky-400" />
                    ) : syncState === 'success' ? (
                      <CheckCircle2 className="w-2.5 h-2.5 ml-0.5 text-emerald-400" />
                    ) : syncState === 'error' ? (
                      <AlertCircle className="w-2.5 h-2.5 ml-0.5 text-rose-400" />
                    ) : null}
                  </button>
                ) : (
                  <span className="flex items-center text-amber-400 space-x-1">
                    <WifiOff className="w-3 h-3" />
                    <span>Кабина (Офлайн)</span>
                  </span>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Navigation Tabs (Only if authenticated) */}
        {currentUser && (
          <nav className="hidden md:flex items-center space-x-1 bg-avionics-bg p-1 rounded-xl border border-avionics-border">
            <button
              onClick={() => setActiveTab('flights')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center space-x-1.5 ${
                activeTab === 'flights'
                  ? 'bg-sky-500/20 text-sky-400 border border-sky-500/40 shadow-sm'
                  : 'text-avionics-muted hover:text-avionics-text'
              }`}
            >
              <Plane className="w-3.5 h-3.5" />
              <span>Книжка</span>
            </button>
            <button
              onClick={() => setActiveTab('map')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center space-x-1.5 ${
                activeTab === 'map'
                  ? 'bg-sky-500/20 text-sky-400 border border-sky-500/40 shadow-sm'
                  : 'text-avionics-muted hover:text-avionics-text'
              }`}
            >
              <Map className="w-3.5 h-3.5" />
              <span>Карта полетов</span>
            </button>
            <button
              onClick={() => setActiveTab('stats')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center space-x-1.5 ${
                activeTab === 'stats'
                  ? 'bg-sky-500/20 text-sky-400 border border-sky-500/40 shadow-sm'
                  : 'text-avionics-muted hover:text-avionics-text'
              }`}
            >
              <BarChart3 className="w-3.5 h-3.5" />
              <span>Статистика</span>
            </button>
            <button
              onClick={() => setActiveTab('currency')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center space-x-1.5 ${
                activeTab === 'currency'
                  ? 'bg-sky-500/20 text-sky-400 border border-sky-500/40 shadow-sm'
                  : 'text-avionics-muted hover:text-avionics-text'
              }`}
            >
              <Award className="w-3.5 h-3.5" />
              <span>Квалификации</span>
            </button>
          </nav>
        )}

        {/* Actions */}
        <div className="flex items-center space-x-2">
          {/* Theme Mode Toggle (Dark <-> Light) */}
          <button
            onClick={toggleTheme}
            title={
              theme === 'dark'
                ? 'Режим: Ночной (Avionics Dark). Нажмите для перехода в дневной'
                : 'Режим: Дневной (Daylight). Нажмите для перехода в ночной'
            }
            className="p-2.5 rounded-xl border border-avionics-border bg-avionics-card text-avionics-muted hover:text-avionics-text transition-colors flex items-center space-x-1"
          >
            {theme === 'dark' ? (
              <Moon className="w-4 h-4 text-sky-400" />
            ) : (
              <Sun className="w-4 h-4 text-amber-500" />
            )}
            <span className="text-[11px] font-mono uppercase hidden lg:inline font-bold">
              {theme === 'dark' ? 'Dark' : 'Day'}
            </span>
          </button>

          {/* Import Roster Button */}
          {currentUser && (
            <button
              onClick={onOpenImport}
              title="Импорт расписания / ростера из авиакомпании (e-Crew, AIMS, CSV)"
              className="flex items-center space-x-1.5 bg-avionics-card hover:bg-slate-800 text-avionics-text px-3 py-2 rounded-xl border border-avionics-border text-xs md:text-sm font-semibold transition-colors"
            >
              <Upload className="w-4 h-4 text-emerald-400" />
              <span className="hidden sm:inline">Импорт</span>
            </button>
          )}

          {/* Export Button */}
          {currentUser && (
            <button
              onClick={onOpenExport}
              title="Экспорт летной книжки в PDF и Excel"
              className="flex items-center space-x-1.5 bg-avionics-card hover:bg-slate-800 text-avionics-text px-3 py-2 rounded-xl border border-avionics-border text-xs md:text-sm font-semibold transition-colors"
            >
              <Download className="w-4 h-4 text-sky-400" />
              <span className="hidden sm:inline">Экспорт</span>
            </button>
          )}

          {/* User profile / login button */}
          <button
            onClick={onOpenAuth}
            className="flex items-center space-x-2 bg-avionics-card hover:bg-slate-800 text-avionics-text px-3 py-2 rounded-xl border border-avionics-border text-xs md:text-sm font-semibold transition-colors"
          >
            <User className="w-4 h-4 text-sky-400" />
            <span>
              {currentUser ? currentUser.full_name || currentUser.email.split('@')[0] : 'Войти'}
            </span>
          </button>

          {/* Add flight button (if authenticated) */}
          {currentUser && (
            <button
              onClick={onOpenNewFlight}
              className="flex items-center space-x-1.5 bg-sky-500 hover:bg-sky-400 text-slate-950 font-bold px-3.5 py-2 rounded-xl text-xs md:text-sm transition-all shadow-md shadow-sky-500/20"
            >
              <Plus className="w-4 h-4" />
              <span className="hidden sm:inline">Новый рейс</span>
            </button>
          )}
        </div>
      </div>

      {/* Mobile Navigation Sub-bar */}
      {currentUser && (
        <div className="md:hidden mt-3 pt-2 border-t border-avionics-border flex items-center justify-around text-xs">
          <button
            onClick={() => setActiveTab('flights')}
            className={`py-1 px-2 font-bold rounded-lg ${
              activeTab === 'flights' ? 'text-sky-400 bg-sky-500/10' : 'text-avionics-muted'
            }`}
          >
            Книжка
          </button>
          <button
            onClick={() => setActiveTab('map')}
            className={`py-1 px-2 font-bold rounded-lg ${
              activeTab === 'map' ? 'text-sky-400 bg-sky-500/10' : 'text-avionics-muted'
            }`}
          >
            Карта
          </button>
          <button
            onClick={() => setActiveTab('stats')}
            className={`py-1 px-2 font-bold rounded-lg ${
              activeTab === 'stats' ? 'text-sky-400 bg-sky-500/10' : 'text-avionics-muted'
            }`}
          >
            Статистика
          </button>
          <button
            onClick={() => setActiveTab('currency')}
            className={`py-1 px-2 font-bold rounded-lg ${
              activeTab === 'currency' ? 'text-sky-400 bg-sky-500/10' : 'text-avionics-muted'
            }`}
          >
            Допуски
          </button>
        </div>
      )}
    </header>
  );
};
