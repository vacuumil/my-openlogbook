import React, { useState, useRef, useEffect } from 'react';
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
  CloudSun,
  ShieldAlert,
  ChevronDown,
  LogOut,
} from 'lucide-react';
import { SyncState } from '../services/syncEngine';

export type ActiveTab = 'dashboard' | 'flights' | 'map' | 'stats' | 'currency' | 'admin';
export type ThemeMode = 'dark' | 'light';

interface NavbarProps {
  activeTab: ActiveTab;
  setActiveTab: (tab: ActiveTab) => void;
  onOpenNewFlight: () => void;
  onOpenWeather: () => void;
  onOpenExport: () => void;
  onOpenImport: () => void;
  onOpenAuth: () => void;
  onLogout?: () => void;
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
  onOpenWeather,
  onOpenExport,
  onOpenImport,
  onOpenAuth,
  onLogout,
  currentUser,
  isOnline,
  syncState,
  syncMessage,
  onManualSync,
  theme,
  setTheme,
}) => {
  const [isProfileMenuOpen, setIsProfileMenuOpen] = useState(false);
  const profileMenuRef = useRef<HTMLDivElement>(null);

  // Close dropdown menu on outside click
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (profileMenuRef.current && !profileMenuRef.current.contains(event.target as Node)) {
        setIsProfileMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  // 2-Mode toggle: Dark <-> Daylight
  const toggleTheme = () => {
    setTheme(theme === 'dark' ? 'light' : 'dark');
  };

  return (
    <header className="sticky top-0 z-40 bg-avionics-surface border-b border-avionics-border px-4 py-3 shadow-md">
      <div className="max-w-7xl mx-auto flex items-center justify-between gap-3">
        {/* Logo & Brand (Clicking returns to Dashboard / Admin) */}
        <div
          className="flex items-center space-x-3 cursor-pointer group select-none"
          onClick={() => {
            if (currentUser) {
              setActiveTab(currentUser.is_superuser ? 'admin' : 'dashboard');
            }
          }}
          title={currentUser ? 'На главную' : 'OpenLogBook'}
        >
          <div className="p-2.5 bg-sky-500/10 border border-sky-500/30 rounded-xl text-sky-400 group-hover:bg-sky-500/20 group-hover:border-sky-500/50 transition-all">
            <Plane className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <span className="text-base md:text-lg font-black tracking-tight text-avionics-text group-hover:text-sky-400 transition-colors">
                OpenLogBook
              </span>
            </div>
            {currentUser && (
              <div className="flex items-center space-x-2 text-xs text-avionics-muted mt-0.5">
                {currentUser.is_superuser ? (
                  <span className="flex items-center text-amber-400 space-x-1 font-bold">
                    <ShieldAlert className="w-3 h-3" />
                    <span>Администратор</span>
                  </span>
                ) : isOnline ? (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onManualSync();
                    }}
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

        {/* Central Navigation Tabs (Cleaned: no duplicate Home tab) */}
        {currentUser && !currentUser.is_superuser && (
          <nav className="hidden md:flex items-center space-x-1 bg-avionics-bg p-1 rounded-xl border border-avionics-border">
            <button
              onClick={() => setActiveTab('flights')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center space-x-1.5 ${
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
              className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center space-x-1.5 ${
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
              className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center space-x-1.5 ${
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
              className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center space-x-1.5 ${
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

        {/* Dedicated Admin Console Badge */}
        {currentUser && currentUser.is_superuser && (
          <div className="hidden md:flex items-center space-x-2 px-3 py-1.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-400 font-bold text-xs shadow-sm">
            <ShieldAlert className="w-4 h-4" />
            <span>Панель Администратора Системы</span>
          </div>
        )}

        {/* Decluttered Right Actions: Theme Toggle + Unified Pilot Menu + New Flight */}
        <div className="flex items-center space-x-2">
          {/* Theme Mode Toggle (Minimalist Icon-only) */}
          <button
            onClick={toggleTheme}
            title={
              theme === 'dark'
                ? 'Режим: Ночной (Avionics Dark). Нажмите для дневной темы'
                : 'Режим: Дневной (Daylight). Нажмите для ночной темы'
            }
            className="p-2.5 rounded-xl border border-avionics-border bg-avionics-card text-avionics-muted hover:text-avionics-text hover:border-sky-500/30 transition-all flex items-center justify-center cursor-pointer shadow-sm"
          >
            {theme === 'dark' ? (
              <Moon className="w-4 h-4 text-sky-400" />
            ) : (
              <Sun className="w-4 h-4 text-amber-500" />
            )}
          </button>

          {/* Unified Profile & Tools Dropdown */}
          {!currentUser ? (
            <button
              onClick={onOpenAuth}
              className="flex items-center space-x-1.5 bg-sky-500/10 hover:bg-sky-500/20 text-sky-400 px-3.5 py-2 rounded-xl border border-sky-500/30 text-xs md:text-sm font-semibold transition-colors cursor-pointer"
            >
              <User className="w-4 h-4" />
              <span>Войти</span>
            </button>
          ) : (
            <div className="relative" ref={profileMenuRef}>
              <button
                onClick={() => setIsProfileMenuOpen(!isProfileMenuOpen)}
                className={`flex items-center space-x-1.5 sm:space-x-2 bg-avionics-card hover:bg-avionics-surface active:bg-avionics-surface text-avionics-text px-2.5 sm:px-3 py-2 rounded-xl border transition-all cursor-pointer text-xs md:text-sm font-semibold shadow-sm select-none ${
                  isProfileMenuOpen
                    ? 'border-sky-500 ring-2 ring-sky-500/20 bg-avionics-surface'
                    : 'border-avionics-border hover:border-sky-500/40'
                }`}
              >
                <div className="w-5 h-5 rounded-lg bg-sky-500/20 border border-sky-500/40 text-sky-400 flex items-center justify-center text-xs font-bold">
                  {currentUser.full_name ? currentUser.full_name.charAt(0).toUpperCase() : 'P'}
                </div>
                <span className="max-w-[100px] sm:max-w-[130px] truncate hidden xs:inline sm:inline">
                  {currentUser.full_name || currentUser.email.split('@')[0]}
                </span>
                <ChevronDown
                  className={`w-3.5 h-3.5 text-avionics-muted transition-transform duration-200 ${
                    isProfileMenuOpen ? 'rotate-180 text-sky-400' : ''
                  }`}
                />
              </button>

              {/* Dropdown Menu Popup */}
              {isProfileMenuOpen && (
                <div className="absolute right-0 mt-2 w-64 bg-avionics-surface border border-avionics-border rounded-2xl shadow-2xl py-2 z-50 animate-in fade-in slide-in-from-top-2 duration-150">
                  {/* User brief header */}
                  <div className="px-4 py-2.5 border-b border-avionics-border">
                    <div className="text-xs font-bold text-avionics-text truncate">
                      {currentUser.full_name || 'Пилот'}
                    </div>
                    <div className="text-[11px] font-mono text-avionics-muted truncate mt-0.5">
                      {currentUser.email}
                    </div>
                    {currentUser.is_superuser && (
                      <div className="mt-1.5 inline-flex items-center space-x-1 text-[10px] font-bold text-amber-400 bg-amber-500/10 border border-amber-500/30 px-2 py-0.5 rounded-full">
                        <ShieldAlert className="w-3 h-3" />
                        <span>Администратор системы</span>
                      </div>
                    )}
                  </div>

                  {/* Operational Tools */}
                  <div className="p-1 space-y-0.5 text-xs">
                    {/* Weather */}
                    <button
                      onClick={() => {
                        setIsProfileMenuOpen(false);
                        onOpenWeather();
                      }}
                      className="w-full flex items-center space-x-2.5 px-3 py-2 rounded-xl text-avionics-text hover:bg-avionics-card active:bg-avionics-card transition-colors text-left font-medium cursor-pointer"
                    >
                      <CloudSun className="w-4 h-4 text-amber-400" />
                      <span>Погода (METAR / TAF)</span>
                    </button>

                    {/* Import (Regular pilots only) */}
                    {!currentUser.is_superuser && (
                      <button
                        onClick={() => {
                          setIsProfileMenuOpen(false);
                          onOpenImport();
                        }}
                        className="w-full flex items-center space-x-2.5 px-3 py-2 rounded-xl text-avionics-text hover:bg-avionics-card active:bg-avionics-card transition-colors text-left font-medium cursor-pointer"
                      >
                        <Upload className="w-4 h-4 text-emerald-400" />
                        <span>Импорт ростера (e-Crew, CSV)</span>
                      </button>
                    )}

                    {/* Export (Regular pilots only) */}
                    {!currentUser.is_superuser && (
                      <button
                        onClick={() => {
                          setIsProfileMenuOpen(false);
                          onOpenExport();
                        }}
                        className="w-full flex items-center space-x-2.5 px-3 py-2 rounded-xl text-avionics-text hover:bg-avionics-card active:bg-avionics-card transition-colors text-left font-medium cursor-pointer"
                      >
                        <Download className="w-4 h-4 text-sky-400" />
                        <span>Экспорт книжки (PDF, Excel)</span>
                      </button>
                    )}
                  </div>

                  <div className="border-t border-avionics-border my-1" />

                  {/* Profile Settings & Logout */}
                  <div className="p-1 space-y-0.5 text-xs">
                    <button
                      onClick={() => {
                        setIsProfileMenuOpen(false);
                        onOpenAuth();
                      }}
                      className="w-full flex items-center space-x-2.5 px-3 py-2 rounded-xl text-avionics-text hover:bg-avionics-card active:bg-avionics-card transition-colors text-left font-medium cursor-pointer"
                    >
                      <User className="w-4 h-4 text-sky-400" />
                      <span>Настройки профиля</span>
                    </button>

                    {onLogout && (
                      <button
                        onClick={() => {
                          setIsProfileMenuOpen(false);
                          onLogout();
                        }}
                        className="w-full flex items-center space-x-2.5 px-3 py-2 rounded-xl text-rose-400 hover:bg-rose-950/20 active:bg-rose-950/30 hover:text-rose-300 transition-colors text-left font-semibold cursor-pointer"
                      >
                        <LogOut className="w-4 h-4" />
                        <span>Выйти из аккаунта</span>
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Add flight button (if authenticated and not superuser) */}
          {currentUser && !currentUser.is_superuser && (
            <button
              onClick={onOpenNewFlight}
              className="flex items-center space-x-1 sm:space-x-1.5 bg-sky-500 hover:bg-sky-400 active:bg-sky-600 text-slate-950 font-bold px-2.5 sm:px-3.5 py-2 rounded-xl text-xs md:text-sm transition-all shadow-md shadow-sky-500/20 cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span className="hidden sm:inline">Новый рейс</span>
            </button>
          )}
        </div>
      </div>

      {/* Fixed Bottom Navigation Bar for Mobile (<md screens) */}
      {currentUser && !currentUser.is_superuser && (
        <div className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-avionics-surface/95 backdrop-blur-md border-t border-avionics-border px-2 py-1.5 shadow-2xl flex items-center justify-around pb-[max(0.5rem,env(safe-area-inset-bottom))]">
          <button
            onClick={() => setActiveTab('flights')}
            className={`flex flex-col items-center justify-center flex-1 py-1 px-1 rounded-xl transition-all cursor-pointer ${
              activeTab === 'flights'
                ? 'text-sky-400 font-bold bg-sky-500/10'
                : 'text-avionics-muted hover:text-avionics-text'
            }`}
          >
            <Plane className="w-5 h-5" />
            <span className="text-[10px] mt-0.5">Книжка</span>
          </button>
          <button
            onClick={() => setActiveTab('map')}
            className={`flex flex-col items-center justify-center flex-1 py-1 px-1 rounded-xl transition-all cursor-pointer ${
              activeTab === 'map'
                ? 'text-sky-400 font-bold bg-sky-500/10'
                : 'text-avionics-muted hover:text-avionics-text'
            }`}
          >
            <Map className="w-5 h-5" />
            <span className="text-[10px] mt-0.5">Карта</span>
          </button>
          <button
            onClick={() => setActiveTab('stats')}
            className={`flex flex-col items-center justify-center flex-1 py-1 px-1 rounded-xl transition-all cursor-pointer ${
              activeTab === 'stats'
                ? 'text-sky-400 font-bold bg-sky-500/10'
                : 'text-avionics-muted hover:text-avionics-text'
            }`}
          >
            <BarChart3 className="w-5 h-5" />
            <span className="text-[10px] mt-0.5">Статистика</span>
          </button>
          <button
            onClick={() => setActiveTab('currency')}
            className={`flex flex-col items-center justify-center flex-1 py-1 px-1 rounded-xl transition-all cursor-pointer ${
              activeTab === 'currency'
                ? 'text-sky-400 font-bold bg-sky-500/10'
                : 'text-avionics-muted hover:text-avionics-text'
            }`}
          >
            <Award className="w-5 h-5" />
            <span className="text-[10px] mt-0.5">Допуски</span>
          </button>
        </div>
      )}

      {/* Admin Mobile Banner */}
      {currentUser && currentUser.is_superuser && (
        <div className="md:hidden mt-2 pt-2 border-t border-avionics-border flex items-center justify-center text-xs">
          <span className="flex items-center space-x-1.5 text-amber-400 font-bold py-1 px-3 bg-amber-500/10 rounded-lg border border-amber-500/30">
            <ShieldAlert className="w-3.5 h-3.5" />
            <span>Панель Администратора Системы</span>
          </span>
        </div>
      )}
    </header>
  );
};
