import React, { useState, useEffect } from 'react';
import {
  ShieldAlert,
  Users,
  Plane,
  Clock,
  Database,
  Search,
  Lock,
  Unlock,
  KeyRound,
  Trash2,
  AlertTriangle,
  CheckCircle2,
  RefreshCw,
  Loader2,
  X,
  Check,
  RotateCcw,
  Eye,
  ArrowRight,
  Filter,
  Archive,
  Info,
} from 'lucide-react';
import { api, AdminFlightItem } from '../api/client';
import { formatMinutesToHHMM } from './FlightList';

interface AdminUser {
  id: string;
  email: string;
  full_name?: string;
  license_number?: string;
  is_active: boolean;
  is_superuser: boolean;
  created_at: string;
  flight_count: number;
}

interface AdminStats {
  total_users: number;
  active_users: number;
  total_flights: number;
  deleted_flights_count: number;
  total_flight_hours: number;
  db_status: string;
}

interface AdminPanelProps {
  currentUser: any;
}

export const AdminPanel: React.FC<AdminPanelProps> = ({ currentUser }) => {
  const [activeTab, setActiveTab] = useState<'users' | 'flights'>('users');
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [statusMessage, setStatusMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  // Users Tab state
  const [searchQuery, setSearchQuery] = useState('');
  const [passwordResetUser, setPasswordResetUser] = useState<AdminUser | null>(null);
  const [newPassword, setNewPassword] = useState('');
  const [isSubmittingPassword, setIsSubmittingPassword] = useState(false);
  const [deleteTargetUser, setDeleteTargetUser] = useState<AdminUser | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Flights DB Tab state
  const [flights, setFlights] = useState<AdminFlightItem[]>([]);
  const [loadingFlights, setLoadingFlights] = useState(false);
  const [flightSearch, setFlightSearch] = useState('');
  const [flightStatusFilter, setFlightStatusFilter] = useState<'all' | 'active' | 'deleted'>('all');
  const [selectedPilotFilter, setSelectedPilotFilter] = useState<string>('all');
  const [detailFlight, setDetailFlight] = useState<AdminFlightItem | null>(null);
  const [permanentDeleteFlight, setPermanentDeleteFlight] = useState<AdminFlightItem | null>(null);
  const [isActionPending, setIsActionPending] = useState(false);

  const loadData = async () => {
    setLoading(true);
    try {
      const [usersData, statsData] = await Promise.all([
        api.adminGetUsers(),
        api.adminGetStats(),
      ]);
      setUsers(usersData);
      setStats(statsData);
    } catch (err: any) {
      console.error('Admin data load error:', err);
      showNotification(err?.message || 'Ошибка загрузки данных админ-панели', 'error');
    } finally {
      setLoading(false);
    }
  };

  const loadFlights = async () => {
    setLoadingFlights(true);
    try {
      const params: any = {
        status_filter: flightStatusFilter,
        search: flightSearch.trim() || undefined,
        limit: 150,
      };
      if (selectedPilotFilter !== 'all') {
        params.user_id = selectedPilotFilter;
      }
      const flightsData = await api.adminGetFlights(params);
      setFlights(flightsData);
    } catch (err: any) {
      console.error('Admin flights load error:', err);
      showNotification(err?.message || 'Ошибка загрузки реестра полётов', 'error');
    } finally {
      setLoadingFlights(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    if (activeTab === 'flights') {
      loadFlights();
    }
  }, [activeTab, flightStatusFilter, selectedPilotFilter]);

  const handleFlightSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    loadFlights();
  };

  const showNotification = (text: string, type: 'success' | 'error' = 'success') => {
    setStatusMessage({ text, type });
    setTimeout(() => setStatusMessage(null), 4000);
  };

  // Toggle user active / blocked status
  const handleToggleStatus = async (user: AdminUser) => {
    const nextStatus = !user.is_active;
    const actionName = nextStatus ? 'разблокировать' : 'заблокировать';
    if (!window.confirm(`Вы уверены, что хотите ${actionName} пользователя ${user.email}?`)) {
      return;
    }

    try {
      await api.adminUpdateUserStatus(user.id, nextStatus);
      setUsers((prev) =>
        prev.map((u) => (u.id === user.id ? { ...u, is_active: nextStatus } : u))
      );
      showNotification(`Статус пользователя ${user.email} обновлен`);
    } catch (err: any) {
      showNotification(err?.message || 'Не удалось обновить статус', 'error');
    }
  };

  // Reset password
  const handleResetPasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!passwordResetUser || newPassword.length < 6) return;

    setIsSubmittingPassword(true);
    try {
      await api.adminResetPassword(passwordResetUser.id, newPassword);
      showNotification(`Новый пароль для ${passwordResetUser.email} успешно установлен`);
      setPasswordResetUser(null);
      setNewPassword('');
    } catch (err: any) {
      showNotification(err?.message || 'Ошибка сброса пароля', 'error');
    } finally {
      setIsSubmittingPassword(false);
    }
  };

  // Delete user
  const handleDeleteUserSubmit = async () => {
    if (!deleteTargetUser) return;
    setIsDeleting(true);
    try {
      await api.adminDeleteUser(deleteTargetUser.id);
      setUsers((prev) => prev.filter((u) => u.id !== deleteTargetUser.id));
      showNotification(`Пользователь ${deleteTargetUser.email} и все его данные удалены`);
      setDeleteTargetUser(null);
      loadData();
    } catch (err: any) {
      showNotification(err?.message || 'Ошибка удаления пользователя', 'error');
    } finally {
      setIsDeleting(false);
    }
  };

  // Restore deleted flight
  const handleRestoreFlight = async (flight: AdminFlightItem) => {
    setIsActionPending(true);
    try {
      await api.adminRestoreFlight(flight.id);
      showNotification(`Рейс ${flight.dep_icao}→${flight.arr_icao} успешно восстановлен`);
      setFlights((prev) =>
        prev.map((f) => (f.id === flight.id ? { ...f, is_deleted: false } : f))
      );
      loadData();
    } catch (err: any) {
      showNotification(err?.message || 'Ошибка восстановления рейса', 'error');
    } finally {
      setIsActionPending(false);
    }
  };

  // Permanent Delete flight
  const handlePermanentDeleteSubmit = async () => {
    if (!permanentDeleteFlight) return;
    setIsActionPending(true);
    try {
      await api.adminDeleteFlightPermanent(permanentDeleteFlight.id);
      showNotification(`Рейс ${permanentDeleteFlight.dep_icao}→${permanentDeleteFlight.arr_icao} навсегда удален из базы данных`);
      setFlights((prev) => prev.filter((f) => f.id !== permanentDeleteFlight.id));
      setPermanentDeleteFlight(null);
      loadData();
    } catch (err: any) {
      showNotification(err?.message || 'Ошибка удаления рейса', 'error');
    } finally {
      setIsActionPending(false);
    }
  };

  // Filter users
  const filteredUsers = users.filter((u) => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return true;
    return (
      u.email.toLowerCase().includes(q) ||
      (u.full_name && u.full_name.toLowerCase().includes(q)) ||
      (u.license_number && u.license_number.toLowerCase().includes(q))
    );
  });

  return (
    <div className="space-y-6">
      {/* Header bar */}
      <div className="p-6 rounded-3xl bg-avionics-surface border border-avionics-border shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center space-x-3.5">
          <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-2xl text-amber-400">
            <ShieldAlert className="w-7 h-7" />
          </div>
          <div>
            <h1 className="text-xl sm:text-2xl font-black text-avionics-text flex items-center space-x-2">
              <span>Панель администратора OpenLogBook</span>
              <span className="text-2xs uppercase tracking-wider bg-amber-500/10 text-amber-400 border border-amber-500/30 px-2 py-0.5 rounded-md font-mono">
                Superuser Mode
              </span>
            </h1>
            <p className="text-xs text-avionics-muted mt-0.5">
              Управление зарегистрированными пилотами, базой данных полётов и безопасностью системы
            </p>
          </div>
        </div>

        <button
          onClick={() => {
            loadData();
            if (activeTab === 'flights') loadFlights();
          }}
          disabled={loading || loadingFlights}
          className="flex items-center space-x-2 px-4 py-2 bg-avionics-card hover:bg-slate-100 dark:hover:bg-slate-800 border border-avionics-border rounded-xl text-xs font-semibold text-avionics-text transition-all self-start sm:self-auto disabled:opacity-50 cursor-pointer"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading || loadingFlights ? 'animate-spin text-sky-400' : ''}`} />
          <span>Обновить данные</span>
        </button>
      </div>

      {/* Notification Toast */}
      {statusMessage && (
        <div
          className={`p-4 rounded-2xl text-xs flex items-center space-x-2 border shadow-sm ${
            statusMessage.type === 'success'
              ? 'bg-emerald-950/40 border-emerald-500/40 text-emerald-300'
              : 'bg-rose-950/40 border-rose-500/40 text-rose-300'
          }`}
        >
          {statusMessage.type === 'success' ? (
            <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
          ) : (
            <AlertTriangle className="w-4 h-4 shrink-0 text-rose-400" />
          )}
          <span>{statusMessage.text}</span>
        </div>
      )}

      {/* System Metrics Cards */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="p-5 rounded-2xl bg-avionics-surface border border-avionics-border shadow-sm">
            <div className="flex items-center justify-between text-avionics-muted text-xs font-semibold uppercase tracking-wider">
              <span>Всего пилотов</span>
              <Users className="w-4 h-4 text-sky-400" />
            </div>
            <div className="text-2xl sm:text-3xl font-black font-mono text-sky-400 mt-2">
              {stats.total_users}
            </div>
            <div className="text-2xs text-avionics-muted mt-1">
              Активных: <span className="text-emerald-400 font-bold">{stats.active_users}</span>
            </div>
          </div>

          <div className="p-5 rounded-2xl bg-avionics-surface border border-avionics-border shadow-sm">
            <div className="flex items-center justify-between text-avionics-muted text-xs font-semibold uppercase tracking-wider">
              <span>Активных рейсов</span>
              <Plane className="w-4 h-4 text-indigo-400" />
            </div>
            <div className="text-2xl sm:text-3xl font-black font-mono text-indigo-400 mt-2">
              {stats.total_flights}
            </div>
            <div className="text-2xs text-avionics-muted mt-1 flex items-center space-x-1">
              <span>В корзине/архиве:</span>
              <span className="text-amber-400 font-bold font-mono">{stats.deleted_flights_count}</span>
            </div>
          </div>

          <div className="p-5 rounded-2xl bg-avionics-surface border border-avionics-border shadow-sm">
            <div className="flex items-center justify-between text-avionics-muted text-xs font-semibold uppercase tracking-wider">
              <span>Общий налёт в БД</span>
              <Clock className="w-4 h-4 text-emerald-400" />
            </div>
            <div className="text-2xl sm:text-3xl font-black font-mono text-emerald-400 mt-2">
              {stats.total_flight_hours} ч
            </div>
            <div className="text-2xs text-avionics-muted mt-1">Только активные полеты</div>
          </div>

          <div className="p-5 rounded-2xl bg-avionics-surface border border-avionics-border shadow-sm">
            <div className="flex items-center justify-between text-avionics-muted text-xs font-semibold uppercase tracking-wider">
              <span>Состояние БД</span>
              <Database className="w-4 h-4 text-teal-400" />
            </div>
            <div className="text-base font-bold font-mono text-teal-400 mt-2 flex items-center space-x-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-teal-400 animate-pulse"></span>
              <span>PostgreSQL 16</span>
            </div>
            <div className="text-2xs text-avionics-muted mt-1">Connection Pool asyncpg: OK</div>
          </div>
        </div>
      )}

      {/* Main Navigation Tabs */}
      <div className="flex items-center space-x-2 border-b border-avionics-border px-1">
        <button
          type="button"
          onClick={() => setActiveTab('users')}
          className={`flex items-center space-x-2 px-5 py-3 text-xs font-bold border-b-2 transition-all cursor-pointer ${
            activeTab === 'users'
              ? 'border-sky-500 text-sky-400'
              : 'border-transparent text-avionics-muted hover:text-avionics-text'
          }`}
        >
          <Users className="w-4 h-4" />
          <span>Пилоты и пользователи ({users.length})</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('flights')}
          className={`flex items-center space-x-2 px-5 py-3 text-xs font-bold border-b-2 transition-all cursor-pointer ${
            activeTab === 'flights'
              ? 'border-sky-500 text-sky-400'
              : 'border-transparent text-avionics-muted hover:text-avionics-text'
          }`}
        >
          <Database className="w-4 h-4" />
          <span>База полётов (Реестр всех рейсов)</span>
        </button>
      </div>

      {/* TAB 1: PILOTS MANAGEMENT */}
      {activeTab === 'users' && (
        <div className="p-6 rounded-3xl bg-avionics-surface border border-avionics-border shadow-sm space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center space-x-2">
              <Users className="w-5 h-5 text-sky-400" />
              <h2 className="text-base font-bold uppercase tracking-wider text-avionics-text">
                Учетные записи пилотов ({filteredUsers.length})
              </h2>
            </div>

            {/* Search box */}
            <div className="relative w-full sm:w-72">
              <Search className="w-4 h-4 text-avionics-muted absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Поиск по email, имени, CPL/ATPL..."
                className="w-full bg-avionics-card border border-avionics-border rounded-xl pl-9 pr-3 py-2 text-xs text-avionics-text focus:outline-none focus:border-sky-500"
              />
            </div>
          </div>

          {/* Table */}
          <div className="border border-avionics-border rounded-2xl overflow-hidden overflow-x-auto bg-avionics-card">
            <table className="w-full text-left text-xs text-avionics-text">
              <thead className="bg-avionics-surface border-b border-avionics-border text-2xs uppercase tracking-wider text-avionics-muted font-bold">
                <tr>
                  <th className="py-3 px-4">Пилот / Email</th>
                  <th className="py-3 px-4">Лицензия</th>
                  <th className="py-3 px-4">Активных рейсов</th>
                  <th className="py-3 px-4">Дата регистрации</th>
                  <th className="py-3 px-4">Статус</th>
                  <th className="py-3 px-4 text-right">Действия</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-avionics-border">
                {loading ? (
                  <tr>
                    <td colSpan={6} className="py-12 text-center text-avionics-muted">
                      <Loader2 className="w-6 h-6 animate-spin mx-auto text-sky-400 mb-2" />
                      <span>Загрузка списка пользователей...</span>
                    </td>
                  </tr>
                ) : filteredUsers.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-8 text-center text-avionics-muted">
                      Пользователи не найдены
                    </td>
                  </tr>
                ) : (
                  filteredUsers.map((user) => (
                    <tr
                      key={user.id}
                      className="hover:bg-avionics-surface/80 transition-colors"
                    >
                      <td className="py-3.5 px-4">
                        <div className="font-bold text-avionics-text flex items-center space-x-2">
                          <span>{user.full_name || 'Без имени'}</span>
                          {user.is_superuser && (
                            <span className="text-[10px] font-mono bg-amber-500/20 text-amber-400 border border-amber-500/40 px-1.5 py-0.2 rounded font-semibold">
                              ADMIN
                            </span>
                          )}
                        </div>
                        <div className="font-mono text-avionics-muted text-2xs mt-0.5">{user.email}</div>
                      </td>

                      <td className="py-3.5 px-4 font-mono font-semibold">
                        {user.license_number ? (
                          <span className="text-sky-400">{user.license_number}</span>
                        ) : (
                          <span className="text-avionics-muted">&mdash;</span>
                        )}
                      </td>

                      <td className="py-3.5 px-4 font-mono font-bold">
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedPilotFilter(user.id);
                            setActiveTab('flights');
                          }}
                          className="px-2.5 py-1 bg-avionics-surface hover:bg-sky-500/20 hover:text-sky-400 border border-avionics-border rounded-lg transition-colors cursor-pointer"
                          title="Открыть рейсы этого пилота"
                        >
                          {user.flight_count} рейсов
                        </button>
                      </td>

                      <td className="py-3.5 px-4 text-avionics-muted font-mono text-2xs">
                        {new Date(user.created_at).toLocaleDateString('ru-RU', {
                          day: '2-digit',
                          month: 'short',
                          year: 'numeric',
                        })}
                      </td>

                      <td className="py-3.5 px-4">
                        {user.is_active ? (
                          <span className="inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-full text-2xs font-bold bg-emerald-500/10 border border-emerald-500/30 text-emerald-400">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
                            <span>Активен</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-full text-2xs font-bold bg-rose-500/10 border border-rose-500/30 text-rose-400">
                            <span className="w-1.5 h-1.5 rounded-full bg-rose-400"></span>
                            <span>Заблокирован</span>
                          </span>
                        )}
                      </td>

                      <td className="py-3.5 px-4 text-right">
                        <div className="flex items-center justify-end space-x-1.5">
                          {/* Toggle active button */}
                          <button
                            onClick={() => handleToggleStatus(user)}
                            disabled={user.id === currentUser?.id}
                            title={user.is_active ? 'Заблокировать аккаунт' : 'Разблокировать аккаунт'}
                            className={`p-1.5 rounded-xl border transition-all cursor-pointer ${
                              user.is_active
                                ? 'bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 border-amber-500/30'
                                : 'bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
                            } disabled:opacity-30 disabled:cursor-not-allowed`}
                          >
                            {user.is_active ? <Lock className="w-3.5 h-3.5" /> : <Unlock className="w-3.5 h-3.5" />}
                          </button>

                          {/* Reset password button */}
                          <button
                            onClick={() => {
                              setPasswordResetUser(user);
                              setNewPassword('');
                            }}
                            title="Сбросить пароль"
                            className="p-1.5 rounded-xl bg-sky-500/10 hover:bg-sky-500/20 text-sky-400 border border-sky-500/30 transition-all cursor-pointer"
                          >
                            <KeyRound className="w-3.5 h-3.5" />
                          </button>

                          {/* Delete user button */}
                          <button
                            onClick={() => setDeleteTargetUser(user)}
                            disabled={user.id === currentUser?.id}
                            title="Удалить пользователя"
                            className="p-1.5 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/30 transition-all disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 2: FLIGHTS DATABASE BROWSER */}
      {activeTab === 'flights' && (
        <div className="p-6 rounded-3xl bg-avionics-surface border border-avionics-border shadow-sm space-y-4">
          {/* Controls Bar */}
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
            <div className="flex items-center space-x-2">
              <Database className="w-5 h-5 text-sky-400" />
              <h2 className="text-base font-bold uppercase tracking-wider text-avionics-text">
                База рейсов пилотов ({flights.length})
              </h2>
            </div>

            {/* Filters Row */}
            <div className="flex flex-wrap items-center gap-2.5">
              {/* Status Filter Pills */}
              <div className="flex items-center bg-avionics-card p-1 rounded-xl border border-avionics-border text-2xs font-semibold">
                <button
                  type="button"
                  onClick={() => setFlightStatusFilter('all')}
                  className={`px-3 py-1.5 rounded-lg transition-colors cursor-pointer ${
                    flightStatusFilter === 'all'
                      ? 'bg-sky-500 text-slate-950 font-bold'
                      : 'text-avionics-muted hover:text-avionics-text'
                  }`}
                >
                  Все
                </button>
                <button
                  type="button"
                  onClick={() => setFlightStatusFilter('active')}
                  className={`px-3 py-1.5 rounded-lg transition-colors cursor-pointer ${
                    flightStatusFilter === 'active'
                      ? 'bg-emerald-500 text-slate-950 font-bold'
                      : 'text-avionics-muted hover:text-avionics-text'
                  }`}
                >
                  Активные
                </button>
                <button
                  type="button"
                  onClick={() => setFlightStatusFilter('deleted')}
                  className={`px-3 py-1.5 rounded-lg transition-colors cursor-pointer ${
                    flightStatusFilter === 'deleted'
                      ? 'bg-rose-500 text-white font-bold'
                      : 'text-avionics-muted hover:text-avionics-text'
                  }`}
                >
                  В корзине
                </button>
              </div>

              {/* Pilot Dropdown */}
              <select
                value={selectedPilotFilter}
                onChange={(e) => setSelectedPilotFilter(e.target.value)}
                className="bg-avionics-card border border-avionics-border rounded-xl px-3 py-1.5 text-xs text-avionics-text focus:outline-none focus:border-sky-500"
              >
                <option value="all">Все пилоты ({users.length})</option>
                {users.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.email} ({u.flight_count} активных)
                  </option>
                ))}
              </select>

              {/* Search Form */}
              <form onSubmit={handleFlightSearchSubmit} className="relative flex-1 sm:w-64">
                <Search className="w-3.5 h-3.5 text-avionics-muted absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={flightSearch}
                  onChange={(e) => setFlightSearch(e.target.value)}
                  placeholder="ICAO, борт, пилот..."
                  className="w-full bg-avionics-card border border-avionics-border rounded-xl pl-8 pr-3 py-1.5 text-xs text-avionics-text focus:outline-none focus:border-sky-500"
                />
              </form>
            </div>
          </div>

          {/* Table */}
          <div className="border border-avionics-border rounded-2xl overflow-hidden overflow-x-auto bg-avionics-card">
            <table className="w-full text-left text-xs text-avionics-text">
              <thead className="bg-avionics-surface border-b border-avionics-border text-2xs uppercase tracking-wider text-avionics-muted font-bold">
                <tr>
                  <th className="py-3 px-4">Пилот</th>
                  <th className="py-3 px-4">Дата / Маршрут</th>
                  <th className="py-3 px-4">Время UTC / Налёт</th>
                  <th className="py-3 px-4">Воздушное судно</th>
                  <th className="py-3 px-4">Роль / Посадки</th>
                  <th className="py-3 px-4">Статус в БД</th>
                  <th className="py-3 px-4 text-right">Действия</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-avionics-border">
                {loadingFlights ? (
                  <tr>
                    <td colSpan={7} className="py-12 text-center text-avionics-muted">
                      <Loader2 className="w-6 h-6 animate-spin mx-auto text-sky-400 mb-2" />
                      <span>Загрузка записей из PostgreSQL...</span>
                    </td>
                  </tr>
                ) : flights.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-10 text-center text-avionics-muted space-y-1">
                      <Archive className="w-8 h-8 mx-auto text-avionics-muted/60" />
                      <div>Рейсы по заданным критериям не найдены</div>
                    </td>
                  </tr>
                ) : (
                  flights.map((flight) => (
                    <tr
                      key={flight.id}
                      className={`hover:bg-avionics-surface/80 transition-colors ${
                        flight.is_deleted ? 'bg-rose-950/10 opacity-70' : ''
                      }`}
                    >
                      {/* Pilot */}
                      <td className="py-3 px-4">
                        <div className="font-bold text-avionics-text truncate max-w-[160px]">
                          {flight.user_name || 'Пилот'}
                        </div>
                        <div className="font-mono text-2xs text-sky-400 truncate max-w-[160px]">
                          {flight.user_email}
                        </div>
                      </td>

                      {/* Date & Route */}
                      <td className="py-3 px-4">
                        <div className="font-mono text-2xs text-avionics-muted">{flight.date}</div>
                        <div className="font-mono font-bold text-sm text-avionics-text flex items-center space-x-1.5 mt-0.5">
                          <span className="text-sky-400">{flight.dep_icao}</span>
                          <ArrowRight className="w-3.5 h-3.5 text-avionics-muted" />
                          <span className="text-teal-400">{flight.arr_icao}</span>
                        </div>
                      </td>

                      {/* Times & Hours */}
                      <td className="py-3 px-4">
                        <div className="font-mono font-bold text-avionics-text">
                          {formatMinutesToHHMM(flight.total_time_minutes)}
                        </div>
                        <div className="font-mono text-2xs text-avionics-muted mt-0.5">
                          {flight.out_time_utc} &ndash; {flight.in_time_utc} UTC
                          {flight.night_time_minutes > 0 && ` • N: ${formatMinutesToHHMM(flight.night_time_minutes)}`}
                        </div>
                      </td>

                      {/* Aircraft */}
                      <td className="py-3 px-4 font-mono">
                        <div className="font-bold text-avionics-text">{flight.aircraft_type}</div>
                        <div className="text-2xs text-avionics-muted">{flight.aircraft_reg}</div>
                      </td>

                      {/* Role & Landings */}
                      <td className="py-3 px-4">
                        <div className="font-bold text-xs flex items-center space-x-1.5">
                          <span className="px-1.5 py-0.5 bg-avionics-surface border border-avionics-border rounded font-mono text-2xs text-sky-400">
                            {flight.flight_role || 'SIC'}
                          </span>
                          <span className="text-2xs text-avionics-muted">({flight.flight_handling || 'PF'})</span>
                        </div>
                        <div className="font-mono text-2xs text-avionics-muted mt-1">
                          Посадки: D:{flight.landings_day} N:{flight.landings_night}
                        </div>
                      </td>

                      {/* Status */}
                      <td className="py-3 px-4">
                        {flight.is_deleted ? (
                          <span className="inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-full text-2xs font-bold bg-rose-500/15 border border-rose-500/30 text-rose-400">
                            <Trash2 className="w-3 h-3" />
                            <span>В корзине (Tombstone)</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-full text-2xs font-bold bg-emerald-500/15 border border-emerald-500/30 text-emerald-400">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
                            <span>Активен</span>
                          </span>
                        )}
                      </td>

                      {/* Actions */}
                      <td className="py-3 px-4 text-right">
                        <div className="flex items-center justify-end space-x-1.5">
                          {/* View details */}
                          <button
                            type="button"
                            onClick={() => setDetailFlight(flight)}
                            title="Подробная информация о рейсе"
                            className="p-1.5 rounded-xl bg-avionics-surface hover:bg-avionics-border text-avionics-text border border-avionics-border transition-colors cursor-pointer"
                          >
                            <Eye className="w-3.5 h-3.5" />
                          </button>

                          {/* Restore flight if deleted */}
                          {flight.is_deleted && (
                            <button
                              type="button"
                              onClick={() => handleRestoreFlight(flight)}
                              disabled={isActionPending}
                              title="Восстановить рейс из корзины"
                              className="p-1.5 rounded-xl bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 transition-colors cursor-pointer"
                            >
                              <RotateCcw className="w-3.5 h-3.5" />
                            </button>
                          )}

                          {/* Hard Delete */}
                          <button
                            type="button"
                            onClick={() => setPermanentDeleteFlight(flight)}
                            title="Удалить навсегда из базы данных"
                            className="p-1.5 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/30 transition-colors cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Modal 1: Reset Password */}
      {passwordResetUser && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-avionics-surface border border-avionics-border rounded-3xl w-full max-w-md shadow-2xl overflow-hidden p-6 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-avionics-border">
              <div className="flex items-center space-x-2 text-sky-400 font-bold text-sm">
                <KeyRound className="w-4 h-4" />
                <span>Сброс пароля пилота</span>
              </div>
              <button
                onClick={() => setPasswordResetUser(null)}
                className="p-1 text-avionics-muted hover:text-avionics-text rounded-lg cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-avionics-muted">
              Укажите новый пароль для учетной записи{' '}
              <strong className="text-avionics-text font-mono">{passwordResetUser.email}</strong>:
            </p>

            <form onSubmit={handleResetPasswordSubmit} className="space-y-4">
              <div>
                <label className="block text-2xs uppercase tracking-wider text-avionics-muted font-bold mb-1">
                  Новый пароль (минимум 6 символов)
                </label>
                <input
                  type="text"
                  required
                  minLength={6}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Введите новый надежный пароль..."
                  className="w-full bg-avionics-card border border-avionics-border rounded-xl px-3 py-2 text-sm font-mono text-avionics-text focus:outline-none focus:border-sky-500"
                />
              </div>

              <div className="flex items-center justify-end space-x-2 pt-2">
                <button
                  type="button"
                  onClick={() => setPasswordResetUser(null)}
                  className="px-4 py-2 text-xs font-semibold text-avionics-muted hover:text-avionics-text cursor-pointer"
                >
                  Отмена
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingPassword || newPassword.length < 6}
                  className="flex items-center space-x-1.5 px-5 py-2 bg-sky-500 hover:bg-sky-400 text-slate-950 font-bold text-xs rounded-xl shadow transition-all disabled:opacity-50 cursor-pointer"
                >
                  {isSubmittingPassword ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Check className="w-3.5 h-3.5" />
                  )}
                  <span>Сохранить пароль</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal 2: Delete User Confirmation */}
      {deleteTargetUser && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-avionics-surface border border-rose-500/40 rounded-3xl w-full max-w-md shadow-2xl overflow-hidden p-6 space-y-4">
            <div className="flex items-center space-x-3 text-rose-400 font-bold text-sm pb-3 border-b border-avionics-border">
              <AlertTriangle className="w-5 h-5 shrink-0" />
              <span>Подтверждение удаления аккаунта</span>
            </div>

            <div className="text-xs text-avionics-muted space-y-2">
              <p>
                Вы действительно хотите навсегда удалить учетную запись{' '}
                <strong className="text-avionics-text font-mono">{deleteTargetUser.email}</strong>?
              </p>
              <div className="p-3 bg-rose-950/30 border border-rose-800/40 rounded-xl text-rose-300 space-y-1">
                <div className="font-bold flex items-center space-x-1">
                  <span>Внимание!</span>
                </div>
                <div>
                  Будут безвозвратно удалены все <strong>{deleteTargetUser.flight_count}</strong> активных рейсов,
                  воздушные суда и синхронизированные данные этого пилота.
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end space-x-2 pt-2">
              <button
                type="button"
                onClick={() => setDeleteTargetUser(null)}
                className="px-4 py-2 text-xs font-semibold text-avionics-muted hover:text-avionics-text cursor-pointer"
              >
                Отмена
              </button>
              <button
                type="button"
                onClick={handleDeleteUserSubmit}
                disabled={isDeleting}
                className="flex items-center space-x-1.5 px-5 py-2 bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs rounded-xl shadow transition-all disabled:opacity-50 cursor-pointer"
              >
                {isDeleting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                <span>Да, удалить безвозвратно</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal 3: Flight Details Drawer / Modal */}
      {detailFlight && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-avionics-surface border border-avionics-border rounded-3xl w-full max-w-lg shadow-2xl overflow-hidden p-6 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-avionics-border">
              <div className="flex items-center space-x-2 text-sky-400 font-bold text-sm">
                <Plane className="w-4 h-4" />
                <span>Карточка рейса: {detailFlight.dep_icao} &rarr; {detailFlight.arr_icao}</span>
              </div>
              <button
                onClick={() => setDetailFlight(null)}
                className="p-1 text-avionics-muted hover:text-avionics-text rounded-lg cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div className="p-3 bg-avionics-card rounded-xl border border-avionics-border space-y-1">
                <div className="text-2xs text-avionics-muted">Пилот / Владелец:</div>
                <div className="font-bold text-avionics-text font-mono">{detailFlight.user_email}</div>
                <div className="text-2xs text-avionics-muted">{detailFlight.user_name || 'Без имени'} • ID: {detailFlight.user_id}</div>
              </div>

              <div className="grid grid-cols-2 gap-2 font-mono">
                <div className="p-2.5 bg-avionics-card rounded-xl border border-avionics-border">
                  <div className="text-2xs text-avionics-muted">Дата рейса</div>
                  <div className="font-bold text-avionics-text mt-0.5">{detailFlight.date}</div>
                </div>
                <div className="p-2.5 bg-avionics-card rounded-xl border border-avionics-border">
                  <div className="text-2xs text-avionics-muted">Общее время (Block)</div>
                  <div className="font-bold text-sky-400 mt-0.5">{formatMinutesToHHMM(detailFlight.total_time_minutes)}</div>
                </div>
                <div className="p-2.5 bg-avionics-card rounded-xl border border-avionics-border">
                  <div className="text-2xs text-avionics-muted">Время UTC</div>
                  <div className="font-bold text-avionics-text mt-0.5">{detailFlight.out_time_utc} &ndash; {detailFlight.in_time_utc}</div>
                </div>
                <div className="p-2.5 bg-avionics-card rounded-xl border border-avionics-border">
                  <div className="text-2xs text-avionics-muted">Воздушное судно</div>
                  <div className="font-bold text-avionics-text mt-0.5">{detailFlight.aircraft_type} ({detailFlight.aircraft_reg})</div>
                </div>
              </div>

              <div className="p-3 bg-avionics-card rounded-xl border border-avionics-border space-y-1">
                <div className="text-2xs text-avionics-muted">Распределение часов:</div>
                <div className="flex flex-wrap gap-2 text-2xs font-mono">
                  <span className="px-2 py-0.5 bg-avionics-surface rounded border border-avionics-border">PIC: {formatMinutesToHHMM(detailFlight.pic_time_minutes)}</span>
                  <span className="px-2 py-0.5 bg-avionics-surface rounded border border-avionics-border">SIC: {formatMinutesToHHMM(detailFlight.sic_time_minutes)}</span>
                  <span className="px-2 py-0.5 bg-avionics-surface rounded border border-avionics-border">Night: {formatMinutesToHHMM(detailFlight.night_time_minutes)}</span>
                  <span className="px-2 py-0.5 bg-avionics-surface rounded border border-avionics-border">IFR: {formatMinutesToHHMM(detailFlight.ifr_time_minutes)}</span>
                </div>
              </div>

              {detailFlight.remarks && (
                <div className="p-3 bg-avionics-card rounded-xl border border-avionics-border">
                  <div className="text-2xs text-avionics-muted mb-1">Замечания / Remarks:</div>
                  <div className="text-avionics-text">{detailFlight.remarks}</div>
                </div>
              )}
            </div>

            <div className="flex justify-end pt-2">
              <button
                type="button"
                onClick={() => setDetailFlight(null)}
                className="px-4 py-2 bg-avionics-card hover:bg-avionics-border border border-avionics-border text-xs font-bold rounded-xl transition-all cursor-pointer"
              >
                Закрыть
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal 4: Permanent Delete Flight Confirmation */}
      {permanentDeleteFlight && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-avionics-surface border border-rose-500/40 rounded-3xl w-full max-w-md shadow-2xl overflow-hidden p-6 space-y-4">
            <div className="flex items-center space-x-3 text-rose-400 font-bold text-sm pb-3 border-b border-avionics-border">
              <AlertTriangle className="w-5 h-5 shrink-0" />
              <span>Безвозвратное удаление рейса</span>
            </div>

            <div className="text-xs text-avionics-muted space-y-2">
              <p>
                Вы действительно хотите навсегда стереть рейс{' '}
                <strong className="text-avionics-text font-mono">{permanentDeleteFlight.dep_icao} &rarr; {permanentDeleteFlight.arr_icao}</strong> ({permanentDeleteFlight.date}) пилота{' '}
                <strong className="text-avionics-text">{permanentDeleteFlight.user_email}</strong> из базы данных PostgreSQL?
              </p>
              <div className="p-3 bg-rose-950/30 border border-rose-800/40 rounded-xl text-rose-300">
                Запись будет физически удалена без возможности восстановления.
              </div>
            </div>

            <div className="flex items-center justify-end space-x-2 pt-2">
              <button
                type="button"
                onClick={() => setPermanentDeleteFlight(null)}
                className="px-4 py-2 text-xs font-semibold text-avionics-muted hover:text-avionics-text cursor-pointer"
              >
                Отмена
              </button>
              <button
                type="button"
                onClick={handlePermanentDeleteSubmit}
                disabled={isActionPending}
                className="flex items-center space-x-1.5 px-5 py-2 bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs rounded-xl shadow transition-all disabled:opacity-50 cursor-pointer"
              >
                {isActionPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                <span>Удалить навсегда из БД</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
