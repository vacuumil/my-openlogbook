import React, { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, LocalFlight, LocalQualification } from '../db/db';
import { generateUUID } from '../utils/uuid';
import { syncEngine } from '../services/syncEngine';
import { computeCurrency, daysUntil, RecencyStatus } from '../utils/currency';
import { parseFlightDate } from '../utils/dates';
import { Award, CheckCircle, AlertTriangle, XCircle, Calendar, Plus, Shield, Edit3, Trash2, Check, X } from 'lucide-react';

interface CurrencyDashboardProps {
  flights: LocalFlight[];
}

const RecencyCell: React.FC<{ label: string; status: RecencyStatus }> = ({ label, status }) => (
  <div className="p-2.5 rounded-xl bg-avionics-surface border border-avionics-border min-w-0">
    <div className="text-2xs text-avionics-muted">{label}</div>
    <div className={`mt-0.5 flex items-center space-x-1 text-xs font-bold ${status.isCurrent ? 'text-emerald-400' : 'text-rose-400'}`}>
      {status.isCurrent ? <CheckCircle className="w-3.5 h-3.5 shrink-0" /> : <XCircle className="w-3.5 h-3.5 shrink-0" />}
      <span>{status.isCurrent ? 'Действует' : 'Не действует'}</span>
    </div>
    <div className="mt-0.5 text-2xs text-avionics-muted font-mono truncate">
      {status.count} / {status.required}
      {status.validUntil ? `, до ${status.validUntil.toLocaleDateString('ru-RU')}` : ''}
    </div>
  </div>
);

export const CurrencyDashboard: React.FC<CurrencyDashboardProps> = ({ flights }) => {
  const currency = useMemo(() => computeCurrency(flights), [flights]);

  // Reactive qualifications from Dexie.js
  const qualifications = useLiveQuery(() => db.qualifications.orderBy('expiresAt').toArray());

  const changeQualifications = async (change: () => Promise<unknown>) => {
    // Marked first: a sync finishing right now must not restore the old list
    syncEngine.markProfileDataDirty();
    await change();
    syncEngine.syncNow();
  };

  // Form states for Add / Edit
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const [name, setName] = useState('');
  const [type, setType] = useState<'medical' | 'check' | 'document' | 'custom'>('check');
  const [expiresAt, setExpiresAt] = useState('');
  const [notes, setNotes] = useState('');

  const getDaysRemaining = (dateStr: string) => daysUntil(parseFlightDate(dateStr));

  const handleOpenAdd = () => {
    setEditingId(null);
    setName('');
    setType('check');
    setExpiresAt('');
    setNotes('');
    setIsFormOpen(true);
  };

  const handleOpenEdit = (qual: LocalQualification) => {
    setEditingId(qual.id);
    setName(qual.name);
    setType(qual.type);
    setExpiresAt(qual.expiresAt);
    setNotes(qual.notes || '');
    setIsFormOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !expiresAt) return;

    if (editingId) {
      // Update existing
      await changeQualifications(() => db.qualifications.update(editingId, { name, type, expiresAt, notes }));
    } else {
      // Add new
      await changeQualifications(() => db.qualifications.add({ id: generateUUID(), name, type, expiresAt, notes }));
    }

    setIsFormOpen(false);
  };

  const handleDelete = async (id: string) => {
    if (window.confirm('Удалить эту запись о квалификации?')) {
      await changeQualifications(() => db.qualifications.delete(id));
    }
  };

  return (
    <div className="space-y-6">
      {/* 90-Day Currency Section */}
      <div className="bg-avionics-surface border border-avionics-border rounded-2xl p-4 sm:p-6 shadow-sm space-y-4">
        <div className="flex items-center space-x-3">
          <div className="p-2.5 rounded-xl bg-sky-500/10 text-sky-400 shrink-0">
            <Shield className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <h2 className="text-base md:text-lg font-bold text-avionics-text">Допуск к перевозке пассажиров</h2>
            <p className="text-xs text-avionics-muted mt-0.5">EASA FCL.060 и FAA 61.57, отдельно по каждому типу ВС</p>
          </div>
        </div>

        {currency.length === 0 ? (
          <p className="py-6 text-center text-sm text-avionics-muted">Рейсов с посадками пока нет.</p>
        ) : (
          <div className="space-y-3">
            {currency.map((item) => (
              <div key={item.aircraftType} className="p-3 bg-avionics-card border border-avionics-border rounded-2xl">
                <h3 className="font-mono font-black text-sm text-avionics-text mb-2">{item.aircraftType}</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
                  <RecencyCell label="EASA, день" status={item.easaDay} />
                  <RecencyCell label="EASA, ночь" status={item.easaNight} />
                  <RecencyCell label="FAA, день" status={item.faaDay} />
                  <RecencyCell label="FAA, ночь" status={item.faaNight} />
                </div>
              </div>
            ))}
          </div>
        )}

        <p className="text-2xs text-avionics-muted leading-relaxed">
          Предварительная оценка по записанным посадкам, не юридическое подтверждение. Считаются посадки в роли PF.
          Не учитываются взлёты, тренажёр, посадка до полной остановки и освобождение держателей IR. Тип сравнивается по коду из
          книжки, поэтому A320 и A321 считаются отдельно. Ночной налёт рассчитан по гражданским сумеркам и может
          отличаться от определения FAA.
        </p>
      </div>

      {/* Expirations Section */}
      <div className="bg-avionics-surface border border-avionics-border rounded-2xl p-4 sm:p-6 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5">
          <div className="flex items-center space-x-3 min-w-0">
            <div className="p-2.5 rounded-xl bg-sky-500/10 text-sky-400 shrink-0">
              <Award className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h2 className="text-base md:text-lg font-bold text-avionics-text truncate">
                Сроки действия проверок и документов
              </h2>
              <p className="text-xs text-avionics-muted mt-0.5 truncate">ВЛЭК, тренажерные проверки, паспорта и визы</p>
            </div>
          </div>
          <button
            onClick={handleOpenAdd}
            className="flex items-center justify-center space-x-1.5 text-xs font-bold bg-avionics-card hover:bg-avionics-surface active:bg-avionics-surface text-sky-400 px-3.5 py-2 rounded-xl border border-avionics-border transition-colors cursor-pointer shrink-0 self-start sm:self-auto"
          >
            <Plus className="w-4 h-4" />
            <span>Добавить срок</span>
          </button>
        </div>

        {/* Modal/Form for Add / Edit */}
        {isFormOpen && (
          <form
            onSubmit={handleSave}
            className="mb-6 p-5 bg-avionics-card rounded-2xl border border-avionics-border space-y-4"
          >
            <div className="flex items-center justify-between pb-2 border-b border-avionics-border">
              <h3 className="text-sm font-bold text-avionics-text">
                {editingId ? 'Редактирование срока квалификации' : 'Добавление квалификации / проверки'}
              </h3>
              <button
                type="button"
                onClick={() => setIsFormOpen(false)}
                className="text-avionics-muted hover:text-avionics-text p-1"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-semibold text-avionics-muted mb-1">Наименование</label>
                <input
                  type="text"
                  placeholder="Medical Class 1, LPC A320, Виза..."
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full bg-avionics-surface border border-avionics-border rounded-xl px-3 py-2 text-sm text-avionics-text focus:outline-none focus:border-sky-500"
                  required
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-avionics-muted mb-1">Категория</label>
                <select
                  value={type}
                  onChange={(e) => setType(e.target.value as any)}
                  className="w-full bg-avionics-surface border border-avionics-border rounded-xl px-3 py-2 text-sm text-avionics-text focus:outline-none focus:border-sky-500"
                >
                  <option value="medical">Medical (ВЛЭК / ВЛП / Medical Class 1)</option>
                  <option value="check">Check (LPC, OPC, Line Check, Sim)</option>
                  <option value="document">Document (Паспорт, Виза, ID)</option>
                  <option value="custom">Custom (Другое)</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-avionics-muted mb-1">Дата окончания</label>
                <input
                  type="date"
                  value={expiresAt}
                  onChange={(e) => setExpiresAt(e.target.value)}
                  className="w-full bg-avionics-surface border border-avionics-border rounded-xl px-3 py-2 text-sm font-mono text-avionics-text focus:outline-none focus:border-sky-500"
                  required
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-avionics-muted mb-1">Заметки / Инструктор</label>
              <input
                type="text"
                placeholder="Номер сертификата, дата следующего тренажера..."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="w-full bg-avionics-surface border border-avionics-border rounded-xl px-3 py-2 text-sm text-avionics-text focus:outline-none focus:border-sky-500"
              />
            </div>

            <div className="flex justify-end space-x-2 pt-2">
              <button
                type="button"
                onClick={() => setIsFormOpen(false)}
                className="px-4 py-2 text-xs font-semibold text-avionics-muted hover:text-avionics-text"
              >
                Отмена
              </button>
              <button
                type="submit"
                className="flex items-center space-x-1.5 px-5 py-2 text-xs font-bold bg-sky-500 hover:bg-sky-400 text-slate-950 rounded-xl"
              >
                <Check className="w-4 h-4" />
                <span>Сохранить</span>
              </button>
            </div>
          </form>
        )}

        {qualifications?.length === 0 && !isFormOpen && (
          <div className="py-8 text-center border border-dashed border-avionics-border rounded-2xl">
            <p className="text-sm font-semibold text-avionics-text">Сроков пока нет</p>
            <p className="mt-1 text-xs text-avionics-muted">
              Добавьте ВЛЭК, LPC, OPC и документы: приложение предупредит об окончании срока.
            </p>
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
          {(qualifications || []).map((item) => {
            const daysLeft = getDaysRemaining(item.expiresAt);
            const isCritical = daysLeft < 30;
            const isWarning = daysLeft >= 30 && daysLeft <= 90;

            return (
              <div
                key={item.id}
                className="p-4 bg-avionics-card border border-avionics-border rounded-2xl flex flex-col justify-between shadow-sm space-y-3 group"
              >
                {/* Top Row: Title & Status Badge */}
                <div className="flex items-start justify-between gap-2.5">
                  <div className="min-w-0 flex-1">
                    <span className="text-sm font-bold text-avionics-text break-words">
                      {item.name}
                    </span>
                  </div>
                  <span
                    className={`shrink-0 font-mono text-xs font-bold px-2 py-0.5 rounded-lg border ${
                      daysLeft < 0
                        ? 'bg-rose-500/15 border-rose-500/30 text-rose-400'
                        : isCritical
                        ? 'bg-rose-500/10 border-rose-500/20 text-rose-400'
                        : isWarning
                        ? 'bg-amber-500/15 border-amber-500/30 text-amber-400'
                        : 'bg-emerald-500/15 border-emerald-500/30 text-emerald-400'
                    }`}
                  >
                    {daysLeft < 0 ? 'Истёк' : `${daysLeft} дн.`}
                  </span>
                </div>

                {/* Bottom Row: Expiry Date + Notes & Action Buttons */}
                <div className="flex items-center justify-between pt-2 border-t border-avionics-border/60 gap-2">
                  <div className="text-xs text-avionics-muted flex items-center space-x-1.5 flex-wrap min-w-0">
                    <Calendar className="w-3.5 h-3.5 text-sky-400 shrink-0" />
                    <span className="shrink-0">До {parseFlightDate(item.expiresAt).toLocaleDateString('ru-RU')}</span>
                    {item.notes && (
                      <span className="italic text-slate-400 truncate max-w-[140px] sm:max-w-[200px]" title={item.notes}>
                        ({item.notes})
                      </span>
                    )}
                  </div>

                  <div className="flex items-center space-x-1 shrink-0">
                    <button
                      onClick={() => handleOpenEdit(item)}
                      title="Редактировать"
                      className="p-1.5 text-avionics-muted hover:text-sky-400 rounded-lg hover:bg-avionics-surface active:bg-avionics-surface transition-colors cursor-pointer"
                    >
                      <Edit3 className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handleDelete(item.id)}
                      title="Удалить"
                      className="p-1.5 text-avionics-muted hover:text-rose-400 rounded-lg hover:bg-rose-500/10 transition-colors cursor-pointer"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
