import React, { useState, useEffect } from 'react';
import { X, Plane, Clock, Moon, Shield, UserCheck, Search, CheckCircle } from 'lucide-react';
import { LocalFlight, LocalAirport, db } from '../db/db';
import { airportService } from '../utils/airportService';
import { formatMinutesToHHMM } from './FlightList';

interface AddFlightModalProps {
  isOpen: boolean;
  onClose: () => void;
  airports: LocalAirport[];
}

const parseTimeToMinutes = (timeStr: string): number => {
  if (!timeStr) return 0;
  if (timeStr.includes(':')) {
    const [h, m] = timeStr.split(':').map((v) => parseInt(v, 10) || 0);
    return h * 60 + m;
  }
  const val = parseFloat(timeStr);
  return isNaN(val) ? 0 : Math.round(val * 60);
};

export const AddFlightModal: React.FC<AddFlightModalProps> = ({ isOpen, onClose }) => {
  const today = new Date().toISOString().split('T')[0];

  const [date, setDate] = useState(today);
  const [depIcao, setDepIcao] = useState('UUEE');
  const [arrIcao, setArrIcao] = useState('ULLI');
  const [depAirportInfo, setDepAirportInfo] = useState<LocalAirport | null>(null);
  const [arrAirportInfo, setArrAirportInfo] = useState<LocalAirport | null>(null);

  // Suggestions state
  const [depSuggestions, setDepSuggestions] = useState<LocalAirport[]>([]);
  const [arrSuggestions, setArrSuggestions] = useState<LocalAirport[]>([]);
  const [showDepDropdown, setShowDepDropdown] = useState(false);
  const [showArrDropdown, setShowArrDropdown] = useState(false);

  const [aircraftReg, setAircraftReg] = useState('RA-73001');
  const [aircraftType, setAircraftType] = useState('A320');

  const [outTimeUtc, setOutTimeUtc] = useState('08:00');
  const [offTimeUtc, setOffTimeUtc] = useState('08:15');
  const [onTimeUtc, setOnTimeUtc] = useState('09:25');
  const [inTimeUtc, setInTimeUtc] = useState('09:35');

  // Manual Night Time (User explicitly requested manual input)
  const [nightTimeInput, setNightTimeInput] = useState('00:00');

  // Crew roles including Observer
  const [flightRole, setFlightRole] = useState<'PIC' | 'SIC' | 'PICUS' | 'Dual' | 'Instructor' | 'Observer'>('SIC');
  const [flightHandling, setFlightHandling] = useState<'PF' | 'PM' | 'Observer' | 'Relief'>('PF');

  const [landingsDay, setLandingsDay] = useState(1);
  const [landingsNight, setLandingsNight] = useState(0);
  const [approachType, setApproachType] = useState('ILS CAT IIIB');
  const [remarks, setRemarks] = useState('');

  // Computed total block minutes
  const [totalMinutes, setTotalMinutes] = useState(0);

  // Auto-lookup airport on ICAO change
  useEffect(() => {
    let active = true;
    const lookup = async () => {
      if (depIcao.length >= 3) {
        const apt = await airportService.getAirport(depIcao);
        if (active) setDepAirportInfo(apt);
      } else {
        setDepAirportInfo(null);
      }
    };
    lookup();
    return () => {
      active = false;
    };
  }, [depIcao]);

  useEffect(() => {
    let active = true;
    const lookup = async () => {
      if (arrIcao.length >= 3) {
        const apt = await airportService.getAirport(arrIcao);
        if (active) setArrAirportInfo(apt);
      } else {
        setArrAirportInfo(null);
      }
    };
    lookup();
    return () => {
      active = false;
    };
  }, [arrIcao]);

  // Handle typing suggestions
  const handleDepChange = async (val: string) => {
    const up = val.toUpperCase();
    setDepIcao(up);
    if (up.length >= 2) {
      const results = await airportService.searchAirports(up, 5);
      setDepSuggestions(results);
      setShowDepDropdown(results.length > 0);
    } else {
      setDepSuggestions([]);
      setShowDepDropdown(false);
    }
  };

  const handleArrChange = async (val: string) => {
    const up = val.toUpperCase();
    setArrIcao(up);
    if (up.length >= 2) {
      const results = await airportService.searchAirports(up, 5);
      setArrSuggestions(results);
      setShowArrDropdown(results.length > 0);
    } else {
      setArrSuggestions([]);
      setShowArrDropdown(false);
    }
  };

  // Block time computation
  useEffect(() => {
    try {
      if (!outTimeUtc || !inTimeUtc) return;
      const [outH, outM] = outTimeUtc.split(':').map(Number);
      const [inH, inM] = inTimeUtc.split(':').map(Number);
      const [year, month, day] = date.split('-').map(Number);

      const outDate = new Date(Date.UTC(year, month - 1, day, outH, outM));
      let inDate = new Date(Date.UTC(year, month - 1, day, inH, inM));
      if (inDate < outDate) {
        inDate = new Date(inDate.getTime() + 24 * 60 * 60 * 1000);
      }

      const blockMins = Math.max(0, Math.round((inDate.getTime() - outDate.getTime()) / (1000 * 60)));
      setTotalMinutes(blockMins);
    } catch {
      // Ignore
    }
  }, [date, outTimeUtc, inTimeUtc]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const nightMins = parseTimeToMinutes(nightTimeInput);

    const newFlight: LocalFlight = {
      id: crypto.randomUUID(),
      date,
      depIcao: depIcao.toUpperCase().trim(),
      arrIcao: arrIcao.toUpperCase().trim(),
      outTimeUtc,
      offTimeUtc: offTimeUtc || outTimeUtc,
      onTimeUtc: onTimeUtc || inTimeUtc,
      inTimeUtc,
      totalTimeMinutes: totalMinutes,
      nightTimeMinutes: Math.min(nightMins, totalMinutes > 0 ? totalMinutes : nightMins),
      ifrTimeMinutes: totalMinutes,
      picTimeMinutes: flightRole === 'PIC' ? totalMinutes : 0,
      sicTimeMinutes: flightRole === 'SIC' ? totalMinutes : 0,
      picusTimeMinutes: flightRole === 'PICUS' ? totalMinutes : 0,
      dualTimeMinutes: flightRole === 'Dual' ? totalMinutes : 0,
      instructorTimeMinutes: flightRole === 'Instructor' ? totalMinutes : 0,
      flightRole,
      flightHandling,
      landingsDay,
      landingsNight,
      aircraftReg: aircraftReg.toUpperCase().trim(),
      aircraftType: aircraftType.toUpperCase().trim(),
      approachType,
      remarks,
      syncStatus: 'created',
      updatedAt: new Date().toISOString(),
    };

    await db.flights.add(newFlight);

    // Cache airports in Dexie if resolved
    if (depAirportInfo) db.airports.put(depAirportInfo).catch(() => {});
    if (arrAirportInfo) db.airports.put(arrAirportInfo).catch(() => {});

    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-avionics-surface border border-avionics-border rounded-2xl w-full max-w-xl shadow-2xl overflow-hidden my-8">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-avionics-border bg-avionics-card">
          <div className="flex items-center space-x-2.5">
            <Plane className="w-5 h-5 text-sky-400" />
            <h2 className="text-base md:text-lg font-bold text-avionics-text">Внесение полета в LogBook</h2>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-avionics-muted hover:text-avionics-text rounded-lg hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          {/* Date & Aircraft */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-semibold text-avionics-muted mb-1">Дата рейса</label>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full bg-avionics-card border border-avionics-border rounded-xl px-3 py-2 text-sm font-mono text-avionics-text focus:outline-none focus:border-sky-500"
                required
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-avionics-muted mb-1">Бортовой №</label>
              <input
                type="text"
                value={aircraftReg}
                onChange={(e) => setAircraftReg(e.target.value.toUpperCase())}
                placeholder="RA-73001"
                className="w-full bg-avionics-card border border-avionics-border rounded-xl px-3 py-2 text-sm font-mono uppercase text-avionics-text focus:outline-none focus:border-sky-500"
                required
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-avionics-muted mb-1">Тип ВС (Type)</label>
              <input
                type="text"
                value={aircraftType}
                onChange={(e) => setAircraftType(e.target.value.toUpperCase())}
                placeholder="A320 / B738"
                className="w-full bg-avionics-card border border-avionics-border rounded-xl px-3 py-2 text-sm font-mono uppercase text-avionics-text focus:outline-none focus:border-sky-500"
                required
              />
            </div>
          </div>

          {/* Route (DEP / ARR ICAO) with Auto-Lookup */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {/* DEP ICAO */}
            <div className="relative">
              <label className="block text-xs font-semibold text-avionics-muted mb-1 flex items-center justify-between">
                <span>Вылет (ICAO / Название)</span>
                {depAirportInfo && (
                  <span className="text-[11px] text-emerald-400 font-normal flex items-center space-x-1">
                    <CheckCircle className="w-3 h-3" />
                    <span>Определен</span>
                  </span>
                )}
              </label>
              <input
                type="text"
                value={depIcao}
                onChange={(e) => handleDepChange(e.target.value)}
                onFocus={() => depSuggestions.length > 0 && setShowDepDropdown(true)}
                placeholder="UUEE"
                className="w-full bg-avionics-card border border-avionics-border rounded-xl px-3 py-2 text-base font-mono font-bold tracking-wider text-sky-400 uppercase focus:outline-none focus:border-sky-500"
                required
              />
              {depAirportInfo && (
                <div className="text-[11px] text-avionics-muted truncate mt-1">
                  {depAirportInfo.name} {depAirportInfo.iata ? `(${depAirportInfo.iata})` : ''}
                </div>
              )}

              {/* Suggestions Dropdown */}
              {showDepDropdown && depSuggestions.length > 0 && (
                <div className="absolute left-0 right-0 top-full mt-1 bg-avionics-card border border-avionics-border rounded-xl shadow-xl z-30 max-h-48 overflow-y-auto divide-y divide-avionics-border">
                  {depSuggestions.map((item) => (
                    <button
                      key={item.icao}
                      type="button"
                      onClick={() => {
                        setDepIcao(item.icao);
                        setDepAirportInfo(item);
                        setShowDepDropdown(false);
                      }}
                      className="w-full text-left px-3 py-2 hover:bg-slate-800 transition-colors flex items-center justify-between text-xs"
                    >
                      <div>
                        <strong className="text-sky-400 font-mono">{item.icao}</strong>
                        {item.iata && <span className="text-slate-400 ml-1">({item.iata})</span>}
                        <div className="text-avionics-muted text-[11px] truncate max-w-[200px]">{item.name}</div>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* ARR ICAO */}
            <div className="relative">
              <label className="block text-xs font-semibold text-avionics-muted mb-1 flex items-center justify-between">
                <span>Прилет (ICAO / Название)</span>
                {arrAirportInfo && (
                  <span className="text-[11px] text-emerald-400 font-normal flex items-center space-x-1">
                    <CheckCircle className="w-3 h-3" />
                    <span>Определен</span>
                  </span>
                )}
              </label>
              <input
                type="text"
                value={arrIcao}
                onChange={(e) => handleArrChange(e.target.value)}
                onFocus={() => arrSuggestions.length > 0 && setShowArrDropdown(true)}
                placeholder="ULLI"
                className="w-full bg-avionics-card border border-avionics-border rounded-xl px-3 py-2 text-base font-mono font-bold tracking-wider text-sky-400 uppercase focus:outline-none focus:border-sky-500"
                required
              />
              {arrAirportInfo && (
                <div className="text-[11px] text-avionics-muted truncate mt-1">
                  {arrAirportInfo.name} {arrAirportInfo.iata ? `(${arrAirportInfo.iata})` : ''}
                </div>
              )}

              {/* Suggestions Dropdown */}
              {showArrDropdown && arrSuggestions.length > 0 && (
                <div className="absolute left-0 right-0 top-full mt-1 bg-avionics-card border border-avionics-border rounded-xl shadow-xl z-30 max-h-48 overflow-y-auto divide-y divide-avionics-border">
                  {arrSuggestions.map((item) => (
                    <button
                      key={item.icao}
                      type="button"
                      onClick={() => {
                        setArrIcao(item.icao);
                        setArrAirportInfo(item);
                        setShowArrDropdown(false);
                      }}
                      className="w-full text-left px-3 py-2 hover:bg-slate-800 transition-colors flex items-center justify-between text-xs"
                    >
                      <div>
                        <strong className="text-sky-400 font-mono">{item.icao}</strong>
                        {item.iata && <span className="text-slate-400 ml-1">({item.iata})</span>}
                        <div className="text-avionics-muted text-[11px] truncate max-w-[200px]">{item.name}</div>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Block & Flight Times (UTC) */}
          <div className="bg-avionics-card border border-avionics-border rounded-2xl p-4 space-y-3">
            <div className="text-xs font-bold uppercase tracking-wider text-avionics-muted flex items-center justify-between">
              <span>Время рейса (UTC / ZULU)</span>
              <span className="text-xs text-sky-400 flex items-center space-x-1 font-semibold">
                <Clock className="w-3.5 h-3.5" />
                <span>24-Hour Format</span>
              </span>
            </div>

            <div className="grid grid-cols-4 gap-2">
              <div>
                <label className="block text-xs text-avionics-muted mb-0.5">OUT (Колодки)</label>
                <input
                  type="time"
                  value={outTimeUtc}
                  onChange={(e) => setOutTimeUtc(e.target.value)}
                  className="w-full bg-avionics-surface border border-avionics-border rounded-lg px-2 py-1.5 text-sm font-mono text-avionics-text focus:outline-none focus:border-sky-500 text-center"
                  required
                />
              </div>
              <div>
                <label className="block text-xs text-avionics-muted mb-0.5">OFF (Взлет)</label>
                <input
                  type="time"
                  value={offTimeUtc}
                  onChange={(e) => setOffTimeUtc(e.target.value)}
                  className="w-full bg-avionics-surface border border-avionics-border rounded-lg px-2 py-1.5 text-sm font-mono text-avionics-text focus:outline-none focus:border-sky-500 text-center"
                />
              </div>
              <div>
                <label className="block text-xs text-avionics-muted mb-0.5">ON (Посадка)</label>
                <input
                  type="time"
                  value={onTimeUtc}
                  onChange={(e) => setOnTimeUtc(e.target.value)}
                  className="w-full bg-avionics-surface border border-avionics-border rounded-lg px-2 py-1.5 text-sm font-mono text-avionics-text focus:outline-none focus:border-sky-500 text-center"
                />
              </div>
              <div>
                <label className="block text-xs text-avionics-muted mb-0.5">IN (Колодки)</label>
                <input
                  type="time"
                  value={inTimeUtc}
                  onChange={(e) => setInTimeUtc(e.target.value)}
                  className="w-full bg-avionics-surface border border-avionics-border rounded-lg px-2 py-1.5 text-sm font-mono text-avionics-text focus:outline-none focus:border-sky-500 text-center"
                  required
                />
              </div>
            </div>

            {/* Total Block & Manual Night Time Input */}
            <div className="pt-3 border-t border-avionics-border grid grid-cols-1 sm:grid-cols-2 gap-3 items-center">
              <div className="flex items-center space-x-2 text-xs md:text-sm">
                <span className="text-avionics-muted">Общее время (Block):</span>
                <span className="font-mono font-black text-sky-400 text-base">
                  {formatMinutesToHHMM(totalMinutes)}
                </span>
              </div>

              {/* Clean manual Night Time input */}
              <div className="flex items-center space-x-2">
                <label className="text-xs font-semibold text-avionics-muted flex items-center space-x-1 shrink-0">
                  <Moon className="w-3.5 h-3.5 text-indigo-400" />
                  <span>Ночное время:</span>
                </label>
                <input
                  type="text"
                  placeholder="00:00"
                  value={nightTimeInput}
                  onChange={(e) => setNightTimeInput(e.target.value)}
                  className="w-24 bg-avionics-surface border border-avionics-border rounded-lg px-2.5 py-1 text-sm font-mono font-bold text-indigo-300 text-center focus:outline-none focus:border-indigo-500"
                />
                <button
                  type="button"
                  onClick={() => setNightTimeInput(formatMinutesToHHMM(totalMinutes))}
                  className="text-[11px] text-avionics-muted hover:text-indigo-400 underline"
                  title="Установить всё время как ночное"
                >
                  Вся ночь
                </button>
              </div>
            </div>
          </div>

          {/* Role & Handling Status (PF / PM / Observer) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-avionics-muted mb-1 flex items-center space-x-1">
                <Shield className="w-3.5 h-3.5 text-sky-400" />
                <span>Функция в экипаже (Crew Role)</span>
              </label>
              <select
                value={flightRole}
                onChange={(e) => setFlightRole(e.target.value as any)}
                className="w-full bg-avionics-card border border-avionics-border rounded-xl px-3 py-2 text-sm font-semibold text-avionics-text focus:outline-none focus:border-sky-500"
              >
                <option value="SIC">SIC — Второй пилот (First Officer)</option>
                <option value="PIC">PIC — Командир ВС (Captain)</option>
                <option value="PICUS">PICUS — Под надзором (Command under Supervision)</option>
                <option value="Dual">Dual — Обучение (Dual Flight)</option>
                <option value="Instructor">Instructor — Инструктор (TRI / TRE)</option>
                <option value="Observer">Observer — Пилот-наблюдатель / Стажер</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-avionics-muted mb-1 flex items-center space-x-1">
                <UserCheck className="w-3.5 h-3.5 text-emerald-400" />
                <span>Статус управления (Handling)</span>
              </label>
              <select
                value={flightHandling}
                onChange={(e) => setFlightHandling(e.target.value as any)}
                className="w-full bg-avionics-card border border-avionics-border rounded-xl px-3 py-2 text-sm font-semibold text-avionics-text focus:outline-none focus:border-sky-500"
              >
                <option value="PF">PF — Пилотирующий пилот (Pilot Flying)</option>
                <option value="PM">PM — Мониторящий пилот (Pilot Monitoring)</option>
                <option value="Observer">Observer — Наблюдатель (Observer)</option>
                <option value="Relief">Relief — Сменный пилот (Cruise Relief)</option>
              </select>
            </div>
          </div>

          {/* Landings & Approach */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-semibold text-avionics-muted mb-1">Посадки (День)</label>
              <input
                type="number"
                min={0}
                max={20}
                value={landingsDay}
                onChange={(e) => setLandingsDay(Number(e.target.value))}
                className="w-full bg-avionics-card border border-avionics-border rounded-xl px-3 py-2 text-sm font-mono text-avionics-text focus:outline-none focus:border-sky-500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-avionics-muted mb-1">Посадки (Ночь)</label>
              <input
                type="number"
                min={0}
                max={20}
                value={landingsNight}
                onChange={(e) => setLandingsNight(Number(e.target.value))}
                className="w-full bg-avionics-card border border-avionics-border rounded-xl px-3 py-2 text-sm font-mono text-avionics-text focus:outline-none focus:border-sky-500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-avionics-muted mb-1">Заход (Approach)</label>
              <input
                type="text"
                value={approachType}
                onChange={(e) => setApproachType(e.target.value)}
                placeholder="ILS / RNP / Visual"
                className="w-full bg-avionics-card border border-avionics-border rounded-xl px-3 py-2 text-sm text-avionics-text focus:outline-none focus:border-sky-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-avionics-muted mb-1">Заметки / Примечания</label>
            <input
              type="text"
              value={remarks}
              onChange={(e) => setRemarks(e.target.value)}
              placeholder="Crew, weather, runway, de-icing..."
              className="w-full bg-avionics-card border border-avionics-border rounded-xl px-3 py-2 text-sm text-avionics-text focus:outline-none focus:border-sky-500"
            />
          </div>

          {/* Submit Buttons */}
          <div className="flex items-center justify-end space-x-3 pt-3 border-t border-avionics-border">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 text-sm font-medium text-avionics-muted hover:text-avionics-text rounded-xl hover:bg-avionics-card transition-colors"
            >
              Отмена
            </button>
            <button
              type="submit"
              className="px-6 py-2.5 text-sm font-bold bg-sky-500 hover:bg-sky-400 text-slate-950 rounded-xl transition-all shadow-lg shadow-sky-500/25"
            >
              Сохранить в лётную книжку
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
