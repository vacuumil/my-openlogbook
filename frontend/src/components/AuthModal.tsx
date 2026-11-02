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
  Eye,
  EyeOff,
  AlertCircle,
  CheckCircle2,
} from 'lucide-react';
import { api, ApiError } from '../api/client';
import { syncEngine } from '../services/syncEngine';
import { AccountSecurityPanel } from './AccountSecurityPanel';

export interface PilotProfileData {
  fullName: string;
  fullNameEn: string;
  airline: string;
  licenseNumber: string;
  licenseType: 'ATPL' | 'CPL' | 'PPL' | 'MPL';
  aircraftType: string;
  aircraftTypes?: string[];
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

export const POPULAR_AIRCRAFT_TYPES = [
  'A320',
  'A321',
  'B738',
  'B777',
  'B787',
  'SSJ100',
  'MS-21',
  'E190',
  'CRJ200',
  'DA42',
  'DA40',
  'C172',
  'L-410',
];

export const parseAircraftTypes = (str: string): string[] => {
  if (!str) return [];
  return str
    .split(/[,/;\s]+/)
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean);
};

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser: any;
  initialRegister?: boolean;
  onAuthSuccess: (user: any) => void;
  onLogout: () => void;
  onAccountDeleted: () => void;
}

const DEFAULT_PROFILE: PilotProfileData = {
  fullName: '',
  fullNameEn: '',
  airline: '',
  licenseNumber: '',
  licenseType: 'ATPL',
  aircraftType: 'A320, A321',
  aircraftTypes: ['A320', 'A321'],
  previousTotalHours: 0,
  previousPicHours: 0,
  previousSicHours: 0,
  previousNightHours: 0,
  previousLandings: 0,
  icaoEnglishLevel: 'Level 4',
  icaoEnglishExpires: '',
  medicalExpires: '',
  medicalNotes: '',
};

export const getStoredPilotProfile = (): PilotProfileData => {
  try {
    const raw = localStorage.getItem('openlogbook_pilot_profile');
    if (raw) {
      const parsed = JSON.parse(raw);
      const types = parsed.aircraftTypes && parsed.aircraftTypes.length > 0
        ? parsed.aircraftTypes
        : parseAircraftTypes(parsed.aircraftType || 'A320');
      return { ...DEFAULT_PROFILE, ...parsed, aircraftTypes: types };
    }
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
  onAccountDeleted,
}) => {
  const [isRegister, setIsRegister] = useState(initialRegister);
  const [activeProfileTab, setActiveProfileTab] = useState<'profile' | 'hours' | 'docs' | 'security'>('profile');

  // Login / Register state
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [regFullName, setRegFullName] = useState('');
  const [regLicenseNumber, setRegLicenseNumber] = useState('');
  const [regAircraftTypesInput, setRegAircraftTypesInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [isReauthRequired, setIsReauthRequired] = useState(false);
  const [reauthPassword, setReauthPassword] = useState('');

  // Real-time password requirement indicators
  const pwdHasLength = password.length >= 8;
  const pwdHasLetter = /[a-zA-Zа-яА-Я]/.test(password);
  const pwdHasDigit = /\d/.test(password);

  // Pilot Profile state
  const [profile, setProfile] = useState<PilotProfileData>(getStoredPilotProfile);

  useEffect(() => {
    setIsRegister(initialRegister);
    setError(null);
    setFieldErrors({});
  }, [initialRegister, isOpen]);

  useEffect(() => {
    if (currentUser) {
      let stored = getStoredPilotProfile();
      if (currentUser.profile_json) {
        try {
          const parsed = JSON.parse(currentUser.profile_json);
          stored = { ...stored, ...parsed };
          localStorage.setItem('openlogbook_pilot_profile', JSON.stringify(stored));
        } catch {
          // ignore
        }
      }
      setProfile({
        ...stored,
        fullName: currentUser.full_name || stored.fullName || '',
        licenseNumber: currentUser.license_number || stored.licenseNumber || '',
      });
    }
  }, [currentUser, isOpen]);

  useEffect(() => {
    if (isOpen) {
      const originalOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = originalOverflow;
      };
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSubmitAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const errors: Record<string, string> = {};
    const trimmedEmail = email.trim();

    if (!trimmedEmail) {
      errors.email = 'Пожалуйста, укажите адрес электронной почты.';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
      errors.email = 'Неверный формат email (пример: pilot@airline.com).';
    }

    if (!password) {
      errors.password = 'Пожалуйста, введите пароль.';
    } else if (isRegister) {
      if (!pwdHasLength) {
        errors.password = 'Пароль слишком короткий: требуется не менее 8 символов.';
      } else if (!pwdHasLetter) {
        errors.password = 'Пароль должен содержать хотя бы одну букву (A-Z или А-Я).';
      } else if (!pwdHasDigit) {
        errors.password = 'Пароль должен содержать хотя бы одну цифру (0-9).';
      }
    }

    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      return;
    }

    setFieldErrors({});
    setLoading(true);

    try {
      let res;
      if (isRegister) {
        res = await api.register({
          email: trimmedEmail,
          password,
          full_name: regFullName.trim() || undefined,
          license_number: regLicenseNumber.trim() || undefined,
        });

        const selectedTypes = parseAircraftTypes(regAircraftTypesInput);
        const typesList = selectedTypes.length > 0 ? selectedTypes : ['A320'];
        const initialProf: PilotProfileData = {
          ...DEFAULT_PROFILE,
          fullName: regFullName.trim() || '',
          licenseNumber: regLicenseNumber.trim() || '',
          aircraftTypes: typesList,
          aircraftType: typesList.join(', '),
        };
        localStorage.setItem('openlogbook_pilot_profile', JSON.stringify(initialProf));
        try {
          await api.updateProfile({
            full_name: initialProf.fullName,
            license_number: initialProf.licenseNumber,
            profile_json: JSON.stringify(initialProf),
          });
        } catch {
          // ignore
        }
      } else {
        res = await api.login({ email: trimmedEmail, password });
      }

      await onAuthSuccess(res.user);
      onClose();
    } catch (err: any) {
      if (err instanceof ApiError && err.fieldErrors && Object.keys(err.fieldErrors).length > 0) {
        setFieldErrors(err.fieldErrors);
      } else if (err.message) {
        const msg = err.message.toLowerCase();
        if (msg.includes('уже зарегистрирован') || msg.includes('email')) {
          setFieldErrors({ email: err.message });
        } else if (msg.includes('парол')) {
          setFieldErrors({ password: err.message });
        }
      }
      setError(err.message || 'Ошибка соединения с сервером');
    } finally {
      setLoading(false);
    }
  };

  const handleReauthAndSave = async () => {
    if (!reauthPassword || !currentUser?.email) return;
    setLoading(true);
    setError(null);
    try {
      const loginRes = await api.login({
        email: currentUser.email,
        password: reauthPassword,
      });
      const updated = await api.updateProfile({
        full_name: profile.fullName || loginRes.user.full_name,
        license_number: profile.licenseNumber || loginRes.user.license_number,
        profile_json: JSON.stringify(profile),
      });
      setIsReauthRequired(false);
      setReauthPassword('');
      onAuthSuccess(updated);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 2500);
    } catch (err: any) {
      setError(err?.message || 'Неверный пароль. Попробуйте еще раз.');
    } finally {
      setLoading(false);
    }
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      localStorage.setItem('openlogbook_pilot_profile', JSON.stringify(profile));
      if (currentUser) {
        const updated = await api.updateProfile({
          full_name: profile.fullName || currentUser.full_name,
          license_number: profile.licenseNumber || currentUser.license_number,
          profile_json: JSON.stringify(profile),
        });
        setIsReauthRequired(false);
        onAuthSuccess(updated);
      }
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 2500);
    } catch (err: any) {
      if (err?.status === 401 || err?.message?.toLowerCase().includes('credentials')) {
        setIsReauthRequired(true);
        setError('Срок действия сессии истёк. Пожалуйста, подтвердите пароль ниже, чтобы сохранить изменения.');
      } else {
        setError(err.message || 'Ошибка сохранения профиля на сервере');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4 overflow-y-auto">
      <div className="bg-avionics-surface border border-avionics-border rounded-t-3xl sm:rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden my-0 sm:my-8 max-h-[92vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 sm:px-6 py-3.5 sm:py-4 border-b border-avionics-border bg-avionics-card shrink-0">
          <div className="flex items-center space-x-2.5">
            <User className="w-5 h-5 text-sky-400" />
            <h2 className="text-base md:text-lg font-bold text-avionics-text">
              {currentUser ? 'Профиль пилота (Pilot Profile)' : isRegister ? 'Регистрация пилота' : 'Вход в OpenLogBook'}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-avionics-muted hover:text-avionics-text rounded-lg hover:bg-avionics-surface transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-4 sm:p-6 overflow-y-auto flex-1">
          {currentUser ? (
            /* Logged-in Pilot Profile Manager */
            <form onSubmit={handleSaveProfile} className="space-y-5">
              {error && (
                <div className="p-3 bg-rose-950/40 border border-rose-500/40 text-rose-300 text-xs rounded-xl flex items-center space-x-2">
                  <X className="w-4 h-4" />
                  <span>{error}</span>
                </div>
              )}
              {isReauthRequired && (
                <div className="p-4 bg-amber-950/40 border border-amber-500/40 rounded-2xl space-y-3">
                  <div className="flex items-start space-x-2 text-amber-300 text-xs font-semibold">
                    <AlertCircle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                    <span>
                      Сессия устарела. Введите пароль для аккаунта <strong className="text-white font-mono">{currentUser.email}</strong>, чтобы применить изменения:
                    </span>
                  </div>
                  <div className="flex items-center space-x-2">
                    <input
                      type="password"
                      value={reauthPassword}
                      onChange={(e) => setReauthPassword(e.target.value)}
                      placeholder="Пароль от аккаунта"
                      className="flex-1 bg-avionics-card border border-avionics-border rounded-xl px-3 py-2 text-xs text-avionics-text focus:outline-none focus:border-sky-500"
                    />
                    <button
                      type="button"
                      disabled={loading || !reauthPassword}
                      onClick={handleReauthAndSave}
                      className="px-4 py-2 bg-sky-500 hover:bg-sky-400 text-slate-950 text-xs font-bold rounded-xl transition-all shadow-md shadow-sky-500/20 disabled:opacity-50 cursor-pointer"
                    >
                      {loading ? 'Вход...' : 'Подтвердить и сохранить'}
                    </button>
                  </div>
                </div>
              )}
              {saveSuccess && (
                <div className="p-3 bg-emerald-950/40 border border-emerald-500/40 text-emerald-300 text-xs rounded-xl flex items-center space-x-2">
                  <Check className="w-4 h-4" />
                  <span>Данные профиля успешно сохранены в облаке и на устройстве!</span>
                </div>
              )}

              {/* Pilot Card Brief */}
              <div className="p-3.5 sm:p-4 bg-avionics-card rounded-2xl border border-avionics-border flex items-center justify-between gap-3 min-w-0">
                <div className="min-w-0 flex-1">
                  <div className="text-sm sm:text-base font-extrabold text-avionics-text truncate">
                    {profile.fullName || currentUser.full_name || 'Пилот'}
                  </div>
                  <div className="text-xs text-sky-400 font-mono mt-0.5 truncate">{currentUser.email}</div>
                  <div className="text-xs text-avionics-muted mt-1 truncate">
                    Свидетельство:{' '}
                    <strong className="text-avionics-text font-mono">
                      {profile.licenseNumber || currentUser.license_number || 'Не указано'}
                    </strong>
                  </div>
                </div>
                <div className="px-2.5 sm:px-3 py-1 bg-sky-500/10 border border-sky-500/20 rounded-xl text-sky-400 font-mono font-bold text-xs shrink-0">
                  {profile.licenseType}
                </div>
              </div>

              {/* Sub-tabs */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-1 p-1 bg-avionics-bg rounded-xl border border-avionics-border">
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
                <button
                  type="button"
                  onClick={() => setActiveProfileTab('security')}
                  className={`py-1.5 text-xs font-bold rounded-lg transition-colors ${
                    activeProfileTab === 'security'
                      ? 'bg-sky-500/20 text-sky-400 border border-sky-500/30'
                      : 'text-avionics-muted hover:text-avionics-text'
                  }`}
                >
                  Безопасность
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
                      <label className="block text-xs font-semibold text-avionics-muted mb-1 flex items-center justify-between">
                        <span className="flex items-center space-x-1">
                          <Plane className="w-3.5 h-3.5 text-sky-400" />
                          <span>Типы ВС пилота (Type Ratings)</span>
                        </span>
                        <span className="text-2xs text-avionics-muted">Через запятую</span>
                      </label>
                      <input
                        type="text"
                        value={profile.aircraftType}
                        onChange={(e) => {
                          const val = e.target.value.toUpperCase();
                          const parsed = parseAircraftTypes(val);
                          setProfile({ ...profile, aircraftType: val, aircraftTypes: parsed });
                        }}
                        placeholder="A320, B738, SSJ100"
                        className="w-full bg-avionics-card border border-avionics-border rounded-xl px-3 py-2 text-sm uppercase font-mono text-avionics-text focus:outline-none focus:border-sky-500"
                      />
                      <div className="flex flex-wrap gap-1 mt-1.5">
                        {POPULAR_AIRCRAFT_TYPES.slice(0, 8).map((type) => {
                          const currentTypes = parseAircraftTypes(profile.aircraftType || '');
                          const isSelected = currentTypes.includes(type);
                          return (
                            <button
                              key={type}
                              type="button"
                              onClick={() => {
                                let updated: string[];
                                if (isSelected) {
                                  updated = currentTypes.filter((t) => t !== type);
                                } else {
                                  updated = [...currentTypes, type];
                                }
                                setProfile({
                                  ...profile,
                                  aircraftType: updated.join(', '),
                                  aircraftTypes: updated,
                                });
                              }}
                              className={`px-2 py-0.5 rounded-lg text-2xs font-mono font-bold transition-all cursor-pointer border ${
                                isSelected
                                  ? 'bg-sky-500 text-slate-950 border-sky-400 shadow-sm'
                                  : 'bg-avionics-bg text-avionics-muted hover:text-sky-300 border-avionics-border'
                              }`}
                            >
                              {isSelected ? `✓ ${type}` : `+ ${type}`}
                            </button>
                          );
                        })}
                      </div>
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
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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

              {activeProfileTab === 'security' && (
                <AccountSecurityPanel
                  onAccountDeleted={() => {
                    onAccountDeleted();
                    onClose();
                  }}
                />
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
                <div className="p-3.5 bg-rose-950/60 border border-rose-800 text-rose-300 text-xs md:text-sm rounded-xl flex items-start space-x-2">
                  <AlertCircle className="w-4 h-4 text-rose-400 mt-0.5 shrink-0" />
                  <div className="flex-1 font-medium">{error}</div>
                </div>
              )}

              {/* Mode Switcher */}
              <div className="grid grid-cols-2 gap-1 p-1 bg-avionics-bg rounded-xl border border-avionics-border mb-4">
                <button
                  type="button"
                  onClick={() => {
                    setIsRegister(false);
                    setError(null);
                    setFieldErrors({});
                  }}
                  className={`py-2 text-xs md:text-sm font-bold rounded-lg transition-colors ${
                    !isRegister
                      ? 'bg-sky-500/20 text-sky-400 border border-sky-500/40 shadow-sm'
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
                    setFieldErrors({});
                  }}
                  className={`py-2 text-xs md:text-sm font-bold rounded-lg transition-colors ${
                    isRegister
                      ? 'bg-sky-500/20 text-sky-400 border border-sky-500/40 shadow-sm'
                      : 'text-avionics-muted hover:text-avionics-text'
                  }`}
                >
                  Регистрация
                </button>
              </div>

              {/* Email Field */}
              <div>
                <label className="block text-xs font-semibold text-avionics-muted mb-1 flex items-center justify-between">
                  <span className="flex items-center space-x-1.5">
                    <Mail className="w-3.5 h-3.5 text-sky-400" />
                    <span>Email</span>
                  </span>
                  <span className="text-[11px] text-avionics-muted font-normal">Пример: pilot@openlogbook.aero</span>
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    if (fieldErrors.email) {
                      setFieldErrors((prev) => {
                        const copy = { ...prev };
                        delete copy.email;
                        return copy;
                      });
                    }
                  }}
                  placeholder="pilot@airline.com"
                  className={`w-full bg-avionics-card border rounded-xl px-3.5 py-2.5 text-sm text-avionics-text transition-colors focus:outline-none ${
                    fieldErrors.email
                      ? 'border-rose-500 focus:border-rose-500 ring-1 ring-rose-500/30'
                      : 'border-avionics-border focus:border-sky-500'
                  }`}
                  required
                />
                {fieldErrors.email && (
                  <div className="text-xs text-rose-400 mt-1.5 flex items-start space-x-1.5 font-medium">
                    <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                    <span>{fieldErrors.email}</span>
                  </div>
                )}
              </div>

              {/* Password Field */}
              <div>
                <label className="block text-xs font-semibold text-avionics-muted mb-1 flex items-center space-x-1.5">
                  <Lock className="w-3.5 h-3.5 text-sky-400" />
                  <span>Пароль</span>
                </label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => {
                      setPassword(e.target.value);
                      if (fieldErrors.password) {
                        setFieldErrors((prev) => {
                          const copy = { ...prev };
                          delete copy.password;
                          return copy;
                        });
                      }
                    }}
                    placeholder="••••••••"
                    className={`w-full bg-avionics-card border rounded-xl pl-3.5 pr-10 py-2.5 text-sm text-avionics-text transition-colors focus:outline-none ${
                      fieldErrors.password
                        ? 'border-rose-500 focus:border-rose-500 ring-1 ring-rose-500/30'
                        : 'border-avionics-border focus:border-sky-500'
                    }`}
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-avionics-muted hover:text-avionics-text transition-colors cursor-pointer"
                    title={showPassword ? 'Скрыть пароль' : 'Показать пароль'}
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                {fieldErrors.password && (
                  <div className="text-xs text-rose-400 mt-1.5 flex items-start space-x-1.5 font-medium">
                    <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                    <span>{fieldErrors.password}</span>
                  </div>
                )}

                {/* Real-time Password Rules Checklist (Only in Register mode) */}
                {isRegister && (
                  <div className="mt-2.5 p-3 bg-avionics-bg rounded-xl border border-avionics-border space-y-1.5">
                    <div className="text-[11px] font-bold uppercase tracking-wider text-avionics-muted mb-1">
                      Требования к паролю:
                    </div>
                    <div
                      className={`flex items-center space-x-2 text-xs transition-colors ${
                        pwdHasLength ? 'text-emerald-400 font-bold' : 'text-avionics-muted'
                      }`}
                    >
                      <CheckCircle2
                        className={`w-3.5 h-3.5 shrink-0 ${
                          pwdHasLength ? 'text-emerald-400' : 'text-avionics-muted opacity-40'
                        }`}
                      />
                      <span>Не менее 8 символов (введено: {password.length})</span>
                    </div>
                    <div
                      className={`flex items-center space-x-2 text-xs transition-colors ${
                        pwdHasLetter ? 'text-emerald-400 font-bold' : 'text-avionics-muted'
                      }`}
                    >
                      <CheckCircle2
                        className={`w-3.5 h-3.5 shrink-0 ${
                          pwdHasLetter ? 'text-emerald-400' : 'text-avionics-muted opacity-40'
                        }`}
                      />
                      <span>Хотя бы одна буква (латиница или кириллица)</span>
                    </div>
                    <div
                      className={`flex items-center space-x-2 text-xs transition-colors ${
                        pwdHasDigit ? 'text-emerald-400 font-bold' : 'text-avionics-muted'
                      }`}
                    >
                      <CheckCircle2
                        className={`w-3.5 h-3.5 shrink-0 ${
                          pwdHasDigit ? 'text-emerald-400' : 'text-avionics-muted opacity-40'
                        }`}
                      />
                      <span>Хотя бы одна цифра (0–9)</span>
                    </div>
                  </div>
                )}
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

                  <div>
                    <label className="block text-xs font-semibold text-avionics-muted mb-1 flex items-center justify-between">
                      <span className="flex items-center space-x-1.5">
                        <Plane className="w-3.5 h-3.5 text-sky-400" />
                        <span>Освоенные типы ВС (Type Ratings)</span>
                      </span>
                      <span className="text-[11px] text-sky-400 font-normal">Для быстрого выбора</span>
                    </label>
                    <input
                      type="text"
                      value={regAircraftTypesInput}
                      onChange={(e) => setRegAircraftTypesInput(e.target.value.toUpperCase())}
                      placeholder="A320, B738, SSJ100..."
                      className="w-full bg-avionics-card border border-avionics-border rounded-xl px-3.5 py-2.5 text-sm font-mono uppercase text-avionics-text focus:outline-none focus:border-sky-500"
                    />
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      {POPULAR_AIRCRAFT_TYPES.slice(0, 7).map((type) => {
                        const currentTypes = parseAircraftTypes(regAircraftTypesInput);
                        const isSelected = currentTypes.includes(type);
                        return (
                          <button
                            key={type}
                            type="button"
                            onClick={() => {
                              let next: string[];
                              if (isSelected) {
                                next = currentTypes.filter((t) => t !== type);
                              } else {
                                next = [...currentTypes, type];
                              }
                              setRegAircraftTypesInput(next.join(', '));
                            }}
                            className={`px-2.5 py-1 rounded-lg text-2xs font-mono font-bold transition-all cursor-pointer border ${
                              isSelected
                                ? 'bg-sky-500 text-slate-950 border-sky-400 shadow-sm'
                                : 'bg-avionics-bg text-avionics-muted hover:text-sky-300 border-avionics-border hover:border-sky-500/40'
                            }`}
                          >
                            {isSelected ? `✓ ${type}` : `+ ${type}`}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full mt-5 flex items-center justify-center space-x-2 bg-sky-500 hover:bg-sky-400 active:bg-sky-600 text-slate-950 font-bold py-3 px-4 rounded-xl text-sm transition-all shadow-lg shadow-sky-500/25 disabled:opacity-50 cursor-pointer"
              >
                {loading ? (
                  <span>Выполняется проверка...</span>
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
