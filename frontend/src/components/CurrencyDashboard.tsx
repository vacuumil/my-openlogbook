import React, { useState, useEffect } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, LocalFlight, LocalQualification } from '../db/db';
import { Award, CheckCircle, AlertTriangle, XCircle, Calendar, Plus, Shield, Edit3, Trash2, Check, X } from 'lucide-react';

interface CurrencyDashboardProps {
  flights: LocalFlight[];
}

export const CurrencyDashboard: React.FC<CurrencyDashboardProps> = ({ flights }) => {
  // 90-day currency calculation
  const ninetyDaysAgo = new Date();
  ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

  const recentFlights = flights.filter((f) => new Date(f.date) >= ninetyDaysAgo);
  const totalRecentLandings = recentFlights.reduce(
    (sum, f) => sum + (f.landingsDay || 0) + (f.landingsNight || 0),
    0
  );
  const recentNightLandings = recentFlights.reduce((sum, f) => sum + (f.landingsNight || 0), 0);

  const isDayCurrent = totalRecentLandings >= 3;
  const isNightCurrent = totalRecentLandings >= 3 && recentNightLandings >= 1;

  // Reactive qualifications from Dexie.js
  const qualifications = useLiveQuery(() => db.qualifications.toArray()) || [];

  // Seed default qualifications if empty
  useEffect(() => {
    const initQuals = async () => {
      const count = await db.qualifications.count();
      if (count === 0) {
        await db.qualifications.bulkAdd([
          {
            id: crypto.randomUUID(),
            name: 'Medical Class 1 (ВЛЭК / ВЛП)',
            type: 'medical',
            expiresAt: '2027-05-15',
            notes: 'Ежегодное медицинское освидетельствование',
          },
          {
            id: crypto.randomUUID(),
            name: 'LPC / Type Rating (A320 / B738)',
            type: 'check',
            expiresAt: '2027-01-30',
            notes: 'Проверка техники пилотирования на FFS тренажере',
          },
          {
            id: crypto.randomUUID(),
            name: 'OPC (Operator Proficiency Check)',
            type: 'check',
            expiresAt: '2026-11-20',
            notes: 'Полугодовая проверка авиакомпании',
          },
          {
            id: crypto.randomUUID(),
            name: 'Заграничный паспорт',
            type: 'document',
            expiresAt: '2029-08-10',
            notes: 'Служебный паспорт пилота',
          },
        ]);
      }
    };
    initQuals();
  }, []);

  // Form states for Add / Edit
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const [name, setName] = useState('');
  const [type, setType] = useState<'medical' | 'check' | 'document' | 'custom'>('check');
  const [expiresAt, setExpiresAt] = useState('');
  const [notes, setNotes] = useState('');

  const getDaysRemaining = (dateStr: string) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const exp = new Date(dateStr);
    const diffTime = exp.getTime() - today.getTime();
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  };

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
      await db.qualifications.update(editingId, {
        name,
        type,
        expiresAt,
        notes,
      });
    } else {
      // Add new
      await db.qualifications.add({
        id: crypto.randomUUID(),
        name,
        type,
        expiresAt,
        notes,
      });
    }

    setIsFormOpen(false);
  };

  const handleDelete = async (id: string) => {
    if (window.confirm('Удалить эту запись о квалификации?')) {
      await db.qualifications.delete(id);
    }
  };

  return (
    <div className="space-y-6">
      {/* 90-Day Currency Section */}
      <div className="bg-avionics-surface border border-avionics-border rounded-2xl p-6 shadow-sm">
        <div className="flex items-center space-x-3 mb-3">
          <div className="p-2.5 rounded-xl bg-sky-500/10 text-sky-400">
            <Shield className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-base md:text-lg font-bold text-avionics-text">
              Квалификационный допуск (90-Day Passenger Currency)
            </h2>
            <p className="text-xs text-avionics-muted mt-0.5">
              Стандарты EASA FCL.060 / FAA 61.57: допуск к перевозке пассажиров
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
          {/* Day Currency */}
          <div
            className={`p-5 rounded-2xl border flex items-center justify-between ${
              isDayCurrent
                ? 'bg-emerald-950/20 border-emerald-500/30 text-emerald-400'
                : 'bg-rose-950/20 border-rose-500/30 text-rose-400'
            }`}
          >
            <div>
              <div className="text-xs font-bold uppercase tracking-wider text-avionics-muted">
                Дневной допуск (Day Passenger)
              </div>
              <div className="text-xl md:text-2xl font-black font-mono mt-1.5">
                {isDayCurrent ? 'Действителен (CURRENT)' : 'Истёк (NOT CURRENT)'}
              </div>
              <div className="text-xs text-avionics-muted mt-1">
                Посадок за 90 дней: <strong className="text-avionics-text font-mono text-sm">{totalRecentLandings} / 3</strong>
              </div>
            </div>
            {isDayCurrent ? (
              <CheckCircle className="w-10 h-10 text-emerald-400" />
            ) : (
              <XCircle className="w-10 h-10 text-rose-400" />
            )}
          </div>

          {/* Night Currency */}
          <div
            className={`p-5 rounded-2xl border flex items-center justify-between ${
              isNightCurrent
                ? 'bg-emerald-950/20 border-emerald-500/30 text-emerald-400'
                : 'bg-amber-950/20 border-amber-500/30 text-amber-400'
            }`}
          >
            <div>
              <div className="text-xs font-bold uppercase tracking-wider text-avionics-muted">
                Ночной допуск (Night Passenger)
              </div>
              <div className="text-xl md:text-2xl font-black font-mono mt-1.5">
                {isNightCurrent ? 'Действителен (CURRENT)' : 'Требуется ночная посадка'}
              </div>
              <div className="text-xs text-avionics-muted mt-1">
                Ночных посадок за 90 дней:{' '}
                <strong className="text-avionics-text font-mono text-sm">{recentNightLandings} / 1</strong>
              </div>
            </div>
            {isNightCurrent ? (
              <CheckCircle className="w-10 h-10 text-emerald-400" />
            ) : (
              <AlertTriangle className="w-10 h-10 text-amber-400" />
            )}
          </div>
        </div>
      </div>

      {/* Expirations Section */}
      <div className="bg-avionics-surface border border-avionics-border rounded-2xl p-6 shadow-sm">
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center space-x-3">
            <div className="p-2.5 rounded-xl bg-sky-500/10 text-sky-400">
              <Award className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base md:text-lg font-bold text-avionics-text">
                Сроки действия проверок и документов
              </h2>
              <p className="text-xs text-avionics-muted mt-0.5">ВЛЭК, тренажерные проверки, паспорта и визы</p>
            </div>
          </div>
          <button
            onClick={handleOpenAdd}
            className="flex items-center space-x-1.5 text-xs font-bold bg-avionics-card hover:bg-slate-800 text-sky-400 px-3.5 py-2 rounded-xl border border-avionics-border transition-colors"
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

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
          {qualifications.map((item) => {
            const daysLeft = getDaysRemaining(item.expiresAt);
            const isCritical = daysLeft < 30;
            const isWarning = daysLeft >= 30 && daysLeft <= 90;

            return (
              <div
                key={item.id}
                className="p-4 bg-avionics-card border border-avionics-border rounded-2xl flex items-center justify-between shadow-sm group"
              >
                <div className="space-y-1">
                  <div className="text-sm font-bold text-avionics-text flex items-center space-x-2">
                    <span>{item.name}</span>
                  </div>
                  <div className="text-xs text-avionics-muted flex items-center space-x-1.5">
                    <Calendar className="w-3.5 h-3.5 text-sky-400" />
                    <span>До {new Date(item.expiresAt).toLocaleDateString('ru-RU')}</span>
                    {item.notes && <span className="italic text-slate-400">({item.notes})</span>}
                  </div>
                </div>

                <div className="flex items-center space-x-3">
                  <div className="text-right">
                    <div
                      className={`text-base font-mono font-black ${
                        daysLeft <= 0
                          ? 'text-rose-400'
                          : isCritical
                          ? 'text-rose-400'
                          : isWarning
                          ? 'text-amber-400'
                          : 'text-emerald-400'
                      }`}
                    >
                      {daysLeft <= 0 ? 'Истёк' : `${daysLeft} дн.`}
                    </div>
                    <div className="text-[11px] text-avionics-muted">
                      {daysLeft <= 0 ? 'Требуется продление' : 'Осталось'}
                    </div>
                  </div>

                  {/* Edit and Delete Actions */}
                  <div className="flex items-center space-x-1 border-l border-avionics-border pl-2">
                    <button
                      onClick={() => handleOpenEdit(item)}
                      title="Редактировать"
                      className="p-1.5 text-avionics-muted hover:text-sky-400 rounded-lg hover:bg-slate-800 transition-colors"
                    >
                      <Edit3 className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handleDelete(item.id)}
                      title="Удалить"
                      className="p-1.5 text-avionics-muted hover:text-rose-400 rounded-lg hover:bg-rose-500/10 transition-colors"
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
