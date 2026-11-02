import React, { useState } from 'react';
import { CheckCircle2, KeyRound, Trash2 } from 'lucide-react';
import { api } from '../api/client';

interface AccountSecurityPanelProps {
  onAccountDeleted: () => void;
}

const inputClassName =
  'w-full bg-avionics-card border border-avionics-border rounded-xl px-3 py-2 text-sm text-avionics-text focus:outline-none focus:border-sky-500';

// Rendered inside the profile form, so actions are plain buttons rather than a nested form
export const AccountSecurityPanel: React.FC<AccountSecurityPanelProps> = ({ onAccountDeleted }) => {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [deletePassword, setDeletePassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [passwordChanged, setPasswordChanged] = useState(false);

  const handleChangePassword = async () => {
    setLoading(true);
    setError(null);
    setPasswordChanged(false);
    try {
      await api.changePassword(currentPassword, newPassword);
      setCurrentPassword('');
      setNewPassword('');
      setPasswordChanged(true);
    } catch (err: any) {
      setError(err.message || 'Не удалось сменить пароль');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteAccount = async () => {
    if (!window.confirm('Удалить аккаунт и все рейсы без возможности восстановления?')) return;

    setLoading(true);
    setError(null);
    try {
      await api.deleteAccount(deletePassword);
      onAccountDeleted();
    } catch (err: any) {
      setError(err.message || 'Не удалось удалить аккаунт');
      setLoading(false);
    }
  };

  return (
    <div className="space-y-5">
      {error && (
        <div role="alert" className="p-3 bg-rose-950/40 border border-rose-500/40 text-rose-300 text-xs rounded-xl">
          {error}
        </div>
      )}

      <section className="space-y-2.5">
        <h3 className="flex items-center space-x-1.5 text-sm font-bold text-avionics-text">
          <KeyRound className="w-4 h-4 text-sky-400" />
          <span>Смена пароля</span>
        </h3>
        <input
          type="password"
          value={currentPassword}
          onChange={(e) => setCurrentPassword(e.target.value)}
          placeholder="Текущий пароль"
          aria-label="Текущий пароль"
          autoComplete="current-password"
          className={inputClassName}
        />
        <input
          type="password"
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          placeholder="Новый пароль: от 8 символов, буквы и цифры"
          aria-label="Новый пароль"
          autoComplete="new-password"
          className={inputClassName}
        />
        <button
          type="button"
          onClick={handleChangePassword}
          disabled={loading || !currentPassword || !newPassword}
          className="px-4 py-2 bg-sky-500 hover:bg-sky-400 disabled:opacity-50 text-slate-950 font-bold text-xs rounded-xl"
        >
          Сменить пароль
        </button>
        {passwordChanged && (
          <p role="status" className="flex items-center space-x-1.5 text-xs text-emerald-400">
            <CheckCircle2 className="w-3.5 h-3.5" />
            <span>Пароль изменён. Другие устройства потребуют новый вход.</span>
          </p>
        )}
      </section>

      <section className="space-y-2.5 pt-4 border-t border-avionics-border">
        <h3 className="flex items-center space-x-1.5 text-sm font-bold text-rose-400">
          <Trash2 className="w-4 h-4" />
          <span>Удаление аккаунта</span>
        </h3>
        <p className="text-xs text-avionics-muted">
          Перед удалением сохраните экспорт логбука: восстановить данные будет невозможно.
        </p>
        <input
          type="password"
          value={deletePassword}
          onChange={(e) => setDeletePassword(e.target.value)}
          placeholder="Пароль для подтверждения"
          aria-label="Пароль для подтверждения удаления"
          autoComplete="current-password"
          className={inputClassName}
        />
        <button
          type="button"
          onClick={handleDeleteAccount}
          disabled={loading || !deletePassword}
          className="px-4 py-2 text-rose-400 hover:bg-rose-950/30 disabled:opacity-50 border border-rose-800/40 font-bold text-xs rounded-xl"
        >
          Удалить аккаунт
        </button>
      </section>
    </div>
  );
};
