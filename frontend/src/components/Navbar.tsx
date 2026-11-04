import React, { useState, useRef, useEffect } from 'react';
import {
  Plane,
  Moon,
  Sun,
  Plus,
  Award,
  Timer,
  User,
  Map,
  BarChart3,
  BookOpen,
  LayoutDashboard,
  Download,
  Upload,
  CloudSun,
  ShieldAlert,
  ChevronDown,
  LogOut,
  RefreshCw,
} from 'lucide-react';
import { SyncState } from '../services/syncEngine';

export type ActiveTab = 'dashboard' | 'flights' | 'map' | 'stats' | 'currency' | 'worktime' | 'admin';
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

const PILOT_TABS: Array<{ id: ActiveTab; label: string; shortLabel: string; icon: React.ElementType }> = [
  { id: 'dashboard', label: 'Главная', shortLabel: 'Главная', icon: LayoutDashboard },
  { id: 'flights', label: 'Книжка', shortLabel: 'Книжка', icon: BookOpen },
  { id: 'map', label: 'Карта', shortLabel: 'Карта', icon: Map },
  { id: 'stats', label: 'Статистика', shortLabel: 'Статистика', icon: BarChart3 },
  { id: 'currency', label: 'Допуски', shortLabel: 'Допуски', icon: Award },
  { id: 'worktime', label: 'Рабочее время', shortLabel: 'Работа', icon: Timer },
];

const getInitials = (user: any) => {
  const source = (user?.full_name || user?.email || 'P').trim();
  const parts = source.split(/\s+/).filter(Boolean);
  return (parts.length > 1 ? parts[0][0] + parts[1][0] : source[0]).toUpperCase();
};

const getSyncStatus = (isOnline: boolean, syncState: SyncState) => {
  if (!isOnline) return { label: 'Офлайн', dot: 'bg-amber-400' };
  if (syncState === 'syncing') return { label: 'Синхронизация', dot: 'bg-sky-400 animate-pulse' };
  if (syncState === 'error') return { label: 'Ошибка синхронизации', dot: 'bg-rose-500' };
  return { label: 'Синхронизировано', dot: 'bg-emerald-400' };
};

const iconButtonClassName =
  'w-9 h-9 flex items-center justify-center rounded-xl text-avionics-muted hover:text-avionics-text hover:bg-avionics-card transition-colors cursor-pointer';

const MenuItem: React.FC<{ icon: React.ReactNode; label: string; onClick: () => void; danger?: boolean }> = ({
  icon,
  label,
  onClick,
  danger = false,
}) => (
  <button
    type="button"
    role="menuitem"
    onClick={onClick}
    className={`w-full flex items-center space-x-2.5 px-3 py-2 rounded-xl text-left text-xs font-medium transition-colors cursor-pointer ${
      danger ? 'text-rose-400 hover:bg-rose-500/10' : 'text-avionics-text hover:bg-avionics-card'
    }`}
  >
    {icon}
    <span>{label}</span>
  </button>
);

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
  const isPilot = currentUser && !currentUser.is_superuser;

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

  const closeMenuAnd = (action: () => void) => () => {
    setIsProfileMenuOpen(false);
    action();
  };

  const sync = getSyncStatus(isOnline, syncState);

  return (
    <>
    <header className="sticky top-0 z-40 bg-avionics-surface/85 backdrop-blur-xl border-b border-avionics-border/70">
      <div className="max-w-7xl mx-auto h-16 px-3 sm:px-4 flex items-center justify-between gap-3">
        {/* Brand: returns to the home screen */}
        <button
          type="button"
          onClick={() => currentUser && setActiveTab(currentUser.is_superuser ? 'admin' : 'dashboard')}
          className="flex items-center space-x-2.5 cursor-pointer select-none shrink-0"
          title="На главную"
        >
          <span className="w-9 h-9 rounded-xl bg-gradient-to-br from-sky-400 to-indigo-500 flex items-center justify-center shadow-lg shadow-sky-500/25">
            <Plane className="w-[18px] h-[18px] text-white -rotate-45" />
          </span>
          <span className="flex flex-col items-start leading-none">
            <span className="text-[15px] font-black tracking-tight text-avionics-text">
              <span className="text-avionics-muted font-semibold">Open</span>LogBook
            </span>
            {currentUser && !currentUser.is_superuser && (
              <span className="mt-1 flex items-center space-x-1.5 text-[10px] font-semibold text-avionics-muted">
                <span className={`w-1.5 h-1.5 rounded-full ${sync.dot}`} />
                <span>{sync.label}</span>
              </span>
            )}
          </span>
        </button>

        {/* Tabs: the bar under the active one sits on the header's bottom edge */}
        {isPilot && (
          <nav aria-label="Разделы" className="hidden xl:flex items-stretch self-stretch">
            {PILOT_TABS.map(({ id, label, icon: Icon }) => {
              const isActive = activeTab === id;
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => setActiveTab(id)}
                  aria-current={isActive ? 'page' : undefined}
                  className={`relative flex items-center space-x-2 px-3.5 text-[13px] font-semibold transition-colors cursor-pointer ${
                    isActive ? 'text-avionics-text' : 'text-avionics-muted hover:text-avionics-text'
                  }`}
                >
                  <Icon className={`w-4 h-4 ${isActive ? 'text-sky-400' : ''}`} />
                  <span>{label}</span>
                  {isActive && <span className="absolute left-3 right-3 bottom-0 h-0.5 rounded-full bg-sky-400" />}
                </button>
              );
            })}
          </nav>
        )}

        {currentUser?.is_superuser && (
          <span className="hidden md:flex items-center space-x-1.5 px-3 py-1.5 rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-400 font-bold text-xs">
            <ShieldAlert className="w-3.5 h-3.5" />
            <span>Панель администратора</span>
          </span>
        )}

        <div className="flex items-center space-x-1 sm:space-x-1.5 shrink-0">
          {isPilot && (
            <button
              type="button"
              onClick={onManualSync}
              title={syncMessage || 'Синхронизировать'}
              aria-label="Синхронизировать"
              className={`${iconButtonClassName} hidden sm:flex`}
            >
              <RefreshCw className={`w-4 h-4 ${syncState === 'syncing' ? 'animate-spin text-sky-400' : ''}`} />
            </button>
          )}

          <button
            type="button"
            onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
            title={theme === 'dark' ? 'Включить дневную тему' : 'Включить ночную тему'}
            aria-label="Сменить тему"
            className={iconButtonClassName}
          >
            {theme === 'dark' ? <Moon className="w-4 h-4" /> : <Sun className="w-4 h-4" />}
          </button>

          {!currentUser ? (
            <button
              type="button"
              onClick={onOpenAuth}
              className="flex items-center space-x-1.5 px-3.5 py-2 rounded-xl bg-sky-500 hover:bg-sky-400 text-slate-950 text-xs font-bold transition-colors cursor-pointer"
            >
              <User className="w-4 h-4" />
              <span>Войти</span>
            </button>
          ) : (
            <div className="relative" ref={profileMenuRef}>
              <button
                type="button"
                onClick={() => setIsProfileMenuOpen(!isProfileMenuOpen)}
                aria-haspopup="menu"
                aria-expanded={isProfileMenuOpen}
                className="flex items-center space-x-1.5 pl-1 pr-1.5 py-1 rounded-full hover:bg-avionics-card transition-colors cursor-pointer"
              >
                <span className="w-8 h-8 rounded-full bg-gradient-to-br from-sky-500/30 to-indigo-500/30 border border-sky-500/40 text-avionics-text flex items-center justify-center text-xs font-black">
                  {getInitials(currentUser)}
                </span>
                <span className="hidden lg:inline max-w-[120px] truncate text-xs font-semibold text-avionics-text">
                  {currentUser.full_name || currentUser.email.split('@')[0]}
                </span>
                <ChevronDown className={`w-3.5 h-3.5 text-avionics-muted transition-transform ${isProfileMenuOpen ? 'rotate-180' : ''}`} />
              </button>

              {isProfileMenuOpen && (
                <div
                  role="menu"
                  className="absolute right-0 mt-2 w-64 bg-avionics-surface border border-avionics-border rounded-2xl shadow-2xl p-1.5 z-50"
                >
                  <div className="px-3 py-2.5 mb-1 border-b border-avionics-border">
                    <div className="text-xs font-bold text-avionics-text truncate">{currentUser.full_name || 'Пилот'}</div>
                    <div className="text-[11px] font-mono text-avionics-muted truncate mt-0.5">{currentUser.email}</div>
                  </div>
                  <MenuItem icon={<CloudSun className="w-4 h-4 text-amber-400" />} label="Погода (METAR / TAF)" onClick={closeMenuAnd(onOpenWeather)} />
                  {isPilot && (
                    <>
                      <MenuItem icon={<Upload className="w-4 h-4 text-emerald-400" />} label="Импорт ростера и книжки" onClick={closeMenuAnd(onOpenImport)} />
                      <MenuItem icon={<Download className="w-4 h-4 text-sky-400" />} label="Экспорт книжки (PDF, Excel)" onClick={closeMenuAnd(onOpenExport)} />
                    </>
                  )}
                  <div className="my-1 border-t border-avionics-border" />
                  <MenuItem icon={<User className="w-4 h-4 text-sky-400" />} label="Профиль и безопасность" onClick={closeMenuAnd(onOpenAuth)} />
                  {onLogout && <MenuItem icon={<LogOut className="w-4 h-4" />} label="Выйти" onClick={closeMenuAnd(onLogout)} danger />}
                </div>
              )}
            </div>
          )}

          {isPilot && (
            <button
              type="button"
              onClick={onOpenNewFlight}
              className="flex items-center space-x-1.5 h-9 px-2.5 sm:px-3.5 rounded-xl bg-sky-500 hover:bg-sky-400 active:bg-sky-600 text-slate-950 text-xs font-bold shadow-lg shadow-sky-500/20 transition-colors cursor-pointer"
              aria-label="Новый рейс"
            >
              <Plus className="w-4 h-4" />
              <span className="hidden sm:inline">Новый рейс</span>
            </button>
          )}
        </div>
      </div>
    </header>

      {/* Bottom navigation below 1280 px. Kept outside the header: its backdrop-filter would
          become the containing block and pin this fixed bar to the top. */}
      {isPilot && (
        <nav
          aria-label="Разделы"
          className="xl:hidden fixed bottom-0 left-0 right-0 z-40 bg-avionics-surface/90 backdrop-blur-xl border-t border-avionics-border/70 flex pb-[env(safe-area-inset-bottom)]"
        >
          {PILOT_TABS.map(({ id, shortLabel, icon: Icon }) => {
            const isActive = activeTab === id;
            return (
              <button
                key={id}
                type="button"
                onClick={() => setActiveTab(id)}
                aria-current={isActive ? 'page' : undefined}
                className={`relative flex-1 min-w-0 flex flex-col items-center justify-center pt-2 pb-1.5 transition-colors cursor-pointer ${
                  isActive ? 'text-sky-400' : 'text-avionics-muted hover:text-avionics-text'
                }`}
              >
                {isActive && <span className="absolute top-0 left-1/4 right-1/4 h-0.5 rounded-full bg-sky-400" />}
                <Icon className="w-5 h-5" />
                <span className={`text-[10px] mt-1 truncate max-w-full px-0.5 ${isActive ? 'font-bold' : 'font-medium'}`}>{shortLabel}</span>
              </button>
            );
          })}
        </nav>
      )}
    </>
  );
};
