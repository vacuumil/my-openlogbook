import React, { useState, useEffect } from 'react';
import {
  X,
  User,
  Lock,
  Mail,
  FileBadge,
  Check,
  LogOut,
  Building,
  Plane,
  Award,
  Calendar,
  Save,
  Globe,
  Clock,
} from 'lucide-react';
import { api } from '../api/client';
import { syncEngine } from '../services/syncEngine';

export interface PilotProfileData {
  fullName: string;
  fullNameEn: string;
  airline: string;
  licenseNumber: string;
  licenseType: 'ATPL' | 'CPL' | 'PPL' | 'MPL';
  aircraftType: string;
  // Previous hours brought forward
  previousTotalHours: number;
  previousPicHours: number;
  previousSicHours: number;
  previousNightHours: number;
  previousLandings: number;
  // Language & Medical
  icaoEnglishLevel: 'Level 4' | 'Level 5' | 'Level 6';
  icaoEnglishExpires: string;
  medicalExpires: string;
  medicalNotes: string;
}

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser: any;
  initialRegister?: boolean;
  onAuthSuccess: (user: any) => void;
  onLogout: () => void;
}

const DEFAULT_PROFILE: PilotProfileData = {
  fullName: '',
  fullNameEn: '',
  airline: 'Аэрофлот / Aeroflot',
  licenseNumber: 'RUS/ATPL/012345',
  licenseType: 'ATPL',
  aircraftType: 'A320 / A321',
  previousTotalHours: 0,
  previousPicHours: 0,
  previousSicHours: 0,
  previousNightHours: 0,
  previousLandings: 0,
  icaoEnglishLevel: 'Level 4',
  icaoEnglishExpires: '2027-10-15',
  medicalExpires: '2027-04-20',
  medicalNotes: 'ВЛЭК Графа 1 (Class 1)',
};

export const getStoredPilotProfile = (): PilotProfileData => {
  try {
    const raw = localStorage.getItem('openlogbook_pilot_profile');
    if (raw) return { ...DEFAULT_PROFILE, ...JSON.parse(raw) };
  } catch {}
  return DEFAULT_PROFILE;
};

export const AuthModal: React.FC<AuthModalProps> = ({
  isOpen,
  onClose,
  currentUser,
  initialRegister = false,
  onAuthSuccess,
  onLogout,
}) => {
  const [isRegister, setIsRegister] = useState(initialRegister);
  const [activeProfileTab, setActiveProfileTab] = useState<'profile' | 'hours' | 'docs'>('profile');

  // Login / Register state
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [regFullName, setRegFullName] = useState('');
  const [regLicenseNumber, setRegLicenseNumber] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);

  // Pilot Profile state
  const [profile, setProfile] = useState<PilotProfileData>(getStoredPilotProfile);

  useEffect(() => {
    setIsRegister(initialRegister);
  }, [initialRegister, isOpen]);

  useEffect(() => {
    if (currentUser) {
      const stored = getStoredPilotProfile();
      setProfile({
        ...stored,
        fullName: currentUser.full_name || stored.fullName || '',
        licenseNumber: currentUser.license_number || stored.licenseNumber || '',
      });
    }
  }, [currentUser, isOpen]);

  if (!isOpen) return null;

  const handleSubmitAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      let res;
      if (isRegister) {
        res = await api.register({
          email,
          password,
          full_name: regFullName || undefined,
          license_number: regLicenseNumber || undefined,
        });
      } else {
        res = await api.login({ email, password });
      }

      onAuthSuccess(res.user);
      syncEngine.syncNow();
      onClose();
    } catch (err: any) {
      setError(err.message || 'Ошибка соединения с сервером');
    } finally {
      setLoading(false);
    }
  };

  const handleSaveProfile = (e: React.FormEvent) => {
    e.preventDefault();
    localStorage.setItem('openlogbook_pilot_profile', JSON.stringify(profile));
    setSaveSuccess(true);
    setTimeout(() => setSaveSuccess(false), 2500);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-avionics-surface border border-avionics-border rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden my-8">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-avionics-border bg-avionics-card">
          <div className="flex items-center space-x-2.5">
            <User className="w-5 h-5 text-sky-400" />
            <h2 className="text-base md:text-lg font-bold text-avionics-text">
              {currentUser ? 'Профиль пилота (Pilot Profile)' : isRegister ? 'Регистрация пилота' : 'Вход в OpenLogBook'}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-avionics-muted hover:text-avionics-text rounded-lg hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6">
          {currentUser ? (
            /* Logged-in Pilot Profile Manager */
            <form onSubmit={handleSaveProfile} className="space-y-5">
              {saveSuccess && (
                <div className="p-3 bg-emerald-950/40 border border-emerald-500/40 text-emerald-300 text-xs rounded-xl flex items-center space-x-2">
                  <Check className="w-4 h-4" />
                  <span>Данные профиля успешно сохранены!</span>
                </div>
              )}

              {/* Pilot Card Brief */}
              <div className="p-4 bg-avionics-card rounded-2xl border border-avionics-border flex items-center justify-between">
                <div>
                  <div className="text-base font-extrabold text-avionics-text">
                    {profile.fullName || currentUser.full_name || 'Пилот'}
                  </div>
                  <div className="text-xs text-sky-400 font-mono mt-0.5">{currentUser.email}</div>
                  <div className="text-xs text-avionics-muted mt-1">
                    Свидетельство:{' '}
                    <strong className="text-avionics-text font-mono">
                      {profile.licenseNumber || currentUser.license_number || 'Не указано'}
                    </strong>
                  </div>
                </div>
                <div className="px-3 py-1 bg-sky-500/10 border border-sky-500/20 rounded-xl text-sky-400 font-mono font-bold text-xs">
                  {profile.licenseType}
                </div>
              </div>

              {/* Sub-tabs */}
              <div className="grid grid-cols-3 gap-1 p-1 bg-avionics-bg rounded-xl border border-avionics-border">
                <button
                  type="button"
                  onClick={() => setActiveProfileTab('profile')}
                  className={`py-1.5 text-xs font-bold rounded-lg transition-colors ${
                    activeProfileTab === 'profile'
                      ? 'bg-sky-500/20 text-sky-400 border border-sky-500/30'
                      : 'text-avionics-muted hover:text-avionics-text'
                  }`}
                >
                  Личные данные
                </button>
                <button
                  type="button"
                  onClick={() => setActiveProfileTab('hours')}
                  className={`py-1.5 text-xs font-bold rounded-lg transition-colors ${
                    activeProfileTab === 'hours'
                      ? 'bg-sky-500/20 text-sky-400 border border-sky-500/30'
                      : 'text-avionics-muted hover:text-avionics-text'
                  }`}
                >
                  Перенос налёта
                </button>
                <button
                  type="button"
                  onClick={() => setActiveProfileTab('docs')}
                  className={`py-1.5 text-xs font-bold rounded-lg transition-colors ${
                    activeProfileTab === 'docs'
                      ? 'bg-sky-500/20 text-sky-400 border border-sky-500/30'
                      : 'text-avionics-muted hover:text-avionics-text'
                  }`}
                >
                  Сроки / ICAO
                </button>
              </div>

              {/* Tab 1: Profile & Career Info */}
              {activeProfileTab === 'profile' && (
                <div className="space-y-3">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-semibold text-avionics-muted mb-1 flex items-center space-x-1">
                        <User className="w-3.5 h-3.5 text-sky-400" />
                        <span>ФИО Пилота (Русский)</span>
                      </label>
                      <input
                        type="text"
                        value={profile.fullName}
                        onChange={(e) => setProfile({ ...profile, fullName: e.target.value })}
                        placeholder="Иванов Иван Иванович"
                        className="w-full bg-avionics-card border border-avionics-border rounded-xl px-3 py-2 text-sm text-avionics-text focus:outline-none focus:border-sky-500"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-avionics-muted mb-1 flex items-center space-x-1">
                        <Globe className="w-3.5 h-3.5 text-sky-400" />
                        <span>Full Name in Latin (для EASA / ICAO)</span>
                      </label>
                      <input
                        type="text"
                        value={profile.fullNameEn || ''}
                        onChange={(e) => setProfile({ ...profile, fullNameEn: e.target.value.toUpperCase() })}
                        placeholder="IVAN IVANOV"
                        className="w-full bg-avionics-card border border-avionics-border rounded-xl px-3 py-2 text-sm font-mono uppercase text-avionics-text focus:outline-none focus:border-sky-500"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-semibold text-avionics-muted mb-1 flex items-center space-x-1">
                        <Building className="w-3.5 h-3.5 text-sky-400" />
                        <span>Авиакомпания / Оператор</span>
                      </label>
                      <input
                        type="text"
                        value={profile.airline}
                        onChange={(e) => setProfile({ ...profile, airline: e.target.value })}
                        placeholder="Аэрофлот / S7"
                        className="w-full bg-avionics-card border border-avionics-border rounded-xl px-3 py-2 text-sm text-avionics-text focus:outline-none focus:border-sky-500"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-avionics-muted mb-1 flex items-center space-x-1">
                        <Plane className="w-3.5 h-3.5 text-sky-400" />
                        <span>Основной тип ВС (Type)</span>
                      </label>
                      <input
                        type="text"
                        value={profile.aircraftType}
                        onChange={(e) => setProfile({ ...profile, aircraftType: e.target.value })}
                        placeholder="A320 / B737 / SSJ100"
                        className="w-full bg-avionics-card border border-avionics-border rounded-xl px-3 py-2 text-sm uppercase font-mono text-avionics-text focus:outline-none focus:border-sky-500"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-semibold text-avionics-muted mb-1 flex items-center space-x-1">
                        <FileBadge className="w-3.5 h-3.5 text-sky-400" />
                        <span>Номер свидетельства</span>
                      </label>
                      <input
                        type="text"
                        value={profile.licenseNumber}
                        onChange={(e) => setProfile({ ...profile, licenseNumber: e.target.value })}
                        placeholder="RUS/ATPL/012345"
                        className="w-full bg-avionics-card border border-avionics-border rounded-xl px-3 py-2 text-sm uppercase font-mono text-avionics-text focus:outline-none focus:border-sky-500"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-avionics-muted mb-1 flex items-center space-x-1">
                        <Award className="w-3.5 h-3.5 text-sky-400" />
                        <span>Категория лицензии</span>
                      </label>
                      <select
                        value={profile.licenseType}
                        onChange={(e) => setProfile({ ...profile, licenseType: e.target.value as any })}
                        className="w-full bg-avionics-card border border-avionics-border rounded-xl px-3 py-2 text-sm font-semibold text-avionics-text focus:outline-none focus:border-sky-500"
                      >
                        <option value="ATPL">ATPL — Линейный пилот</option>
                        <option value="CPL">CPL — Коммерческий пилот</option>
                        <option value="MPL">MPL — Multi-Crew Pilot</option>
                        <option value="PPL">PPL — Частный пилот</option>
                      </select>
                    </div>
                  </div>
                </div>
              )}

              {/* Tab 2: Previous Hours Transfer (Brought forward) */}
              {activeProfileTab === 'hours' && (
                <div className="space-y-3">
                  <div className="p-3 bg-avionics-card rounded-xl border border-avionics-border text-xs text-avionics-muted leading-relaxed">
                    Укажите налёт из предыдущей бумажной лётной книжки. Эти часы будут суммироваться с вашими рейсами в OpenLogBook для отображения полного карьерного налёта.
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-semibold text-avionics-muted mb-1">
                        Предыдущий налёт (Всего, ч)
                      </label>
                      <input
                        type="number"
                        step="0.1"
                        min="0"
                        value={profile.previousTotalHours}
                        onChange={(e) =>
                          setProfile({ ...profile, previousTotalHours: parseFloat(e.target.value) || 0 })
                        }
                        className="w-full bg-avionics-card border border-avionics-border rounded-xl px-3 py-2 text-sm font-mono text-sky-400 font-bold focus:outline-none focus:border-sky-500"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-avionics-muted mb-1">
                        В качестве КВС (PIC, ч)
                      </label>
                      <input
                        type="number"
                        step="0.1"
                        min="0"
                        value={profile.previousPicHours}
                        onChange={(e) =>
                          setProfile({ ...profile, previousPicHours: parseFloat(e.target.value) || 0 })
                        }
                        className="w-full bg-avionics-card border border-avionics-border rounded-xl px-3 py-2 text-sm font-mono text-emerald-400 font-bold focus:outline-none focus:border-sky-500"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-2">
                    <div>
                      <label className="block text-[11px] font-semibold text-avionics-muted mb-1">
                        Второй пилот (SIC)
                      </label>
                      <input
                        type="number"
                        step="0.1"
                        min="0"
                        value={profile.previousSicHours}
                        onChange={(e) =>
                          setProfile({ ...profile, previousSicHours: parseFloat(e.target.value) || 0 })
                        }
                        className="w-full bg-avionics-card border border-avionics-border rounded-xl px-2 py-1.5 text-xs font-mono text-avionics-text focus:outline-none focus:border-sky-500"
                      />
                    </div>

                    <div>
                      <label className="block text-[11px] font-semibold text-avionics-muted mb-1">
                        Ночной налёт
                      </label>
                      <input
                        type="number"
                        step="0.1"
                        min="0"
                        value={profile.previousNightHours}
                        onChange={(e) =>
                          setProfile({ ...profile, previousNightHours: parseFloat(e.target.value) || 0 })
                        }
                        className="w-full bg-avionics-card border border-avionics-border rounded-xl px-2 py-1.5 text-xs font-mono text-indigo-400 focus:outline-none focus:border-sky-500"
                      />
                    </div>

                    <div>
                      <label className="block text-[11px] font-semibold text-avionics-muted mb-1">
                        Посадки (Кол-во)
                      </label>
                      <input
                        type="number"
                        min="0"
                        value={profile.previousLandings}
                        onChange={(e) =>
                          setProfile({ ...profile, previousLandings: parseInt(e.target.value, 10) || 0 })
                        }
                        className="w-full bg-avionics-card border border-avionics-border rounded-xl px-2 py-1.5 text-xs font-mono text-amber-400 focus:outline-none focus:border-sky-500"
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* Tab 3: ICAO English & Medical */}
              {activeProfileTab === 'docs' && (
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-semibold text-avionics-muted mb-1 flex items-center space-x-1">
                        <Globe className="w-3.5 h-3.5 text-sky-400" />
                        <span>Уровень ICAO English</span>
                      </label>
                      <select
                        value={profile.icaoEnglishLevel}
                        onChange={(e) => setProfile({ ...profile, icaoEnglishLevel: e.target.value as any })}
                        className="w-full bg-avionics-card border border-avionics-border rounded-xl px-3 py-2 text-sm font-semibold text-avionics-text focus:outline-none focus:border-sky-500"
                      >
                        <option value="Level 4">ICAO Level 4 (Operational)</option>
                        <option value="Level 5">ICAO Level 5 (Extended)</option>
                        <option value="Level 6">ICAO Level 6 (Expert / Бессрочно)</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-avionics-muted mb-1 flex items-center space-x-1">
                        <Calendar className="w-3.5 h-3.5 text-sky-400" />
                        <span>Срок ICAO English</span>
                      </label>
                      <input
                        type="date"
                        value={profile.icaoEnglishExpires}
                        onChange={(e) => setProfile({ ...profile, icaoEnglishExpires: e.target.value })}
                        className="w-full bg-avionics-card border border-avionics-border rounded-xl px-3 py-2 text-sm font-mono text-avionics-text focus:outline-none focus:border-sky-500"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-semibold text-avionics-muted mb-1 flex items-center space-x-1">
                        <Award className="w-3.5 h-3.5 text-sky-400" />
                        <span>Медицинский класс (ВЛЭК)</span>
                      </label>
                      <input
                        type="text"
                        value={profile.medicalNotes}
                        onChange={(e) => setProfile({ ...profile, medicalNotes: e.target.value })}
                        placeholder="ВЛЭК Графа 1"
                        className="w-full bg-avionics-card border border-avionics-border rounded-xl px-3 py-2 text-sm text-avionics-text focus:outline-none focus:border-sky-500"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-avionics-muted mb-1 flex items-center space-x-1">
                        <Calendar className="w-3.5 h-3.5 text-sky-400" />
                        <span>Срок действия ВЛЭК</span>
                      </label>
                      <input
                        type="date"
                        value={profile.medicalExpires}
                        onChange={(e) => setProfile({ ...profile, medicalExpires: e.target.value })}
                        className="w-full bg-avionics-card border border-avionics-border rounded-xl px-3 py-2 text-sm font-mono text-avionics-text focus:outline-none focus:border-sky-500"
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* Actions */}
              <div className="pt-3 border-t border-avionics-border flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => {
                    onLogout();
                    onClose();
                  }}
                  className="flex items-center space-x-1.5 px-3 py-2 text-rose-400 hover:bg-rose-950/30 border border-rose-800/40 text-xs font-bold rounded-xl transition-colors"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  <span>Выйти</span>
                </button>

                <div className="flex items-center space-x-2">
                  <button
                    type="button"
                    onClick={onClose}
                    className="px-4 py-2 text-xs font-semibold text-avionics-muted hover:text-avionics-text"
                  >
                    Закрыть
                  </button>
                  <button
                    type="submit"
                    className="flex items-center space-x-1.5 px-5 py-2.5 bg-sky-500 hover:bg-sky-400 text-slate-950 font-bold text-xs rounded-xl shadow-md shadow-sky-500/25"
                  >
                    <Save className="w-3.5 h-3.5" />
                    <span>Сохранить профиль</span>
                  </button>
                </div>
              </div>
            </form>
          ) : (
            /* Login / Register Form */
            <form onSubmit={handleSubmitAuth} className="space-y-4">
              {error && (
                <div className="p-3.5 bg-rose-950/50 border border-rose-800 text-rose-300 text-xs md:text-sm rounded-xl">
                  {error}
                </div>
              )}

              {/* Mode Switcher */}
              <div className="grid grid-cols-2 gap-1 p-1 bg-avionics-bg rounded-xl border border-avionics-border mb-4">
                <button
                  type="button"
                  onClick={() => {
                    setIsRegister(false);
                    setError(null);
                  }}
                  className={`py-2 text-xs md:text-sm font-bold rounded-lg transition-colors ${
                    !isRegister
                      ? 'bg-sky-500/20 text-sky-400 border border-sky-500/40'
                      : 'text-avionics-muted hover:text-avionics-text'
                  }`}
                >
                  Вход
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setIsRegister(true);
                    setError(null);
                  }}
                  className={`py-2 text-xs md:text-sm font-bold rounded-lg transition-colors ${
                    isRegister
                      ? 'bg-sky-500/20 text-sky-400 border border-sky-500/40'
                      : 'text-avionics-muted hover:text-avionics-text'
                  }`}
                >
                  Регистрация
                </button>
              </div>

              <div>
                <label className="block text-xs font-semibold text-avionics-muted mb-1 flex items-center space-x-1.5">
                  <Mail className="w-3.5 h-3.5 text-sky-400" />
                  <span>Email</span>
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="pilot@airline.com"
                  className="w-full bg-avionics-card border border-avionics-border rounded-xl px-3.5 py-2.5 text-sm text-avionics-text focus:outline-none focus:border-sky-500"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-avionics-muted mb-1 flex items-center space-x-1.5">
                  <Lock className="w-3.5 h-3.5 text-sky-400" />
                  <span>Пароль</span>
                </label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full bg-avionics-card border border-avionics-border rounded-xl px-3.5 py-2.5 text-sm text-avionics-text focus:outline-none focus:border-sky-500"
                  required
                />
              </div>

              {isRegister && (
                <>
                  <div>
                    <label className="block text-xs font-semibold text-avionics-muted mb-1 flex items-center space-x-1.5">
                      <User className="w-3.5 h-3.5 text-sky-400" />
                      <span>ФИО Пилота (Full Name)</span>
                    </label>
                    <input
                      type="text"
                      value={regFullName}
                      onChange={(e) => setRegFullName(e.target.value)}
                      placeholder="Иван Иванов"
                      className="w-full bg-avionics-card border border-avionics-border rounded-xl px-3.5 py-2.5 text-sm text-avionics-text focus:outline-none focus:border-sky-500"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-avionics-muted mb-1 flex items-center space-x-1.5">
                      <FileBadge className="w-3.5 h-3.5 text-sky-400" />
                      <span>Свидетельство пилота (CPL / ATPL)</span>
                    </label>
                    <input
                      type="text"
                      value={regLicenseNumber}
                      onChange={(e) => setRegLicenseNumber(e.target.value)}
                      placeholder="RUS/ATPL/012345"
                      className="w-full bg-avionics-card border border-avionics-border rounded-xl px-3.5 py-2.5 text-sm font-mono uppercase text-avionics-text focus:outline-none focus:border-sky-500"
                    />
                  </div>
                </>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full mt-5 flex items-center justify-center space-x-2 bg-sky-500 hover:bg-sky-400 text-slate-950 font-bold py-3 px-4 rounded-xl text-sm transition-all shadow-lg shadow-sky-500/25 disabled:opacity-50"
              >
                {loading ? (
                  <span>Выполняется...</span>
                ) : (
                  <>
                    <Check className="w-4 h-4" />
                    <span>{isRegister ? 'Зарегистрироваться' : 'Войти в систему'}</span>
                  </>
                )}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};
