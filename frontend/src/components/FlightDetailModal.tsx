import { parseFlightDate } from '../utils/dates';
import { RecencyFields, RecencyFieldValues } from './RecencyFields';
import React, { useState, useEffect } from 'react';
import {
  X,
  Plane,
  Clock,
  Moon,
  Edit3,
  Trash2,
  Check,
  Shield,
  UserCheck,
  CheckCircle,
  RotateCcw,
  Sparkles,
  Search,
  AlertCircle,
  Copy,
} from 'lucide-react';
import { LocalFlight, LocalAirport, db } from '../db/db';
import { airportService } from '../utils/airportService';
import { formatMinutesToHHMM } from './FlightList';
import { ICAO_APPROACH_TYPES, addMinutesToTime, validateFlightTimes } from './AddFlightModal';
import { getStoredPilotProfile } from './AuthModal';
import { calculateFlightTimes } from '../utils/nightCalculator';
import * as SunCalc from 'suncalc';

interface FlightDetailModalProps {
  flight: LocalFlight | null;
  isOpen: boolean;
  onClose: () => void;
  onSave: (updated: LocalFlight) => void;
  onDelete: (id: string) => void;
  airports: LocalAirport[];
  onAddReturnFlight?: (flight: LocalFlight) => void;
  onRepeatFlight?: (flight: LocalFlight) => void;
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

export const FlightDetailModal: React.FC<FlightDetailModalProps> = ({
  flight,
  isOpen,
  onClose,
  onSave,
  onDelete,
  onAddReturnFlight,
  onRepeatFlight,
}) => {
  const [isEditing, setIsEditing] = useState(false);

  // Form states
  const [date, setDate] = useState('');
  const [depIcao, setDepIcao] = useState('');
  const [arrIcao, setArrIcao] = useState('');
  const [depAirportInfo, setDepAirportInfo] = useState<LocalAirport | null>(null);
  const [arrAirportInfo, setArrAirportInfo] = useState<LocalAirport | null>(null);

  // Suggestions state for editing
  const [depSuggestions, setDepSuggestions] = useState<LocalAirport[]>([]);
  const [arrSuggestions, setArrSuggestions] = useState<LocalAirport[]>([]);
  const [showDepDropdown, setShowDepDropdown] = useState(false);
  const [showArrDropdown, setShowArrDropdown] = useState(false);

  const [aircraftReg, setAircraftReg] = useState('');
  const [aircraftType, setAircraftType] = useState('');
  const [outTimeUtc, setOutTimeUtc] = useState('');
  const [offTimeUtc, setOffTimeUtc] = useState('');
  const [onTimeUtc, setOnTimeUtc] = useState('');
  const [inTimeUtc, setInTimeUtc] = useState('');

  const [nightTimeInput, setNightTimeInput] = useState('00:00');

  const [flightRole, setFlightRole] = useState<'PIC' | 'SIC' | 'PICUS' | 'Dual' | 'Instructor' | 'Observer'>('SIC');
  const [flightHandling, setFlightHandling] = useState<'PF' | 'PM' | 'Observer' | 'Relief'>('PF');

  const [landingsDay, setLandingsDay] = useState(0);
  const [recencyFields, setRecencyFields] = useState<RecencyFieldValues>({});
  const [landingsNight, setLandingsNight] = useState(0);
  const [approachType, setApproachType] = useState('');
  const [remarks, setRemarks] = useState('');
  const [totalMinutes, setTotalMinutes] = useState(0);
  const [availableTypes, setAvailableTypes] = useState<string[]>([]);

  useEffect(() => {
    if (isOpen) {
      const originalOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';

      const profile = getStoredPilotProfile();
      if (profile && Array.isArray(profile.aircraftTypes) && profile.aircraftTypes.length > 0) {
        setAvailableTypes(profile.aircraftTypes);
      }

      return () => {
        document.body.style.overflow = originalOverflow;
      };
    }
  }, [isOpen]);

  const handleOutTimeChange = (val: string) => {
    setOutTimeUtc(val);
    if (val && !offTimeUtc) {
      setOffTimeUtc(addMinutesToTime(val, 15));
    }
  };

  const handleOnTimeChange = (val: string) => {
    setOnTimeUtc(val);
    if (val && !inTimeUtc) {
      setInTimeUtc(addMinutesToTime(val, 10));
    }
  };

  const validation = validateFlightTimes(outTimeUtc, offTimeUtc, onTimeUtc, inTimeUtc);
  const isFormValid = validation.isValid;

  useEffect(() => {
    if (flight) {
      setDate(flight.date);
      setDepIcao(flight.depIcao);
      setArrIcao(flight.arrIcao);
      setAircraftReg(flight.aircraftReg);
      setAircraftType(flight.aircraftType);
      setOutTimeUtc(flight.outTimeUtc);
      setOffTimeUtc(flight.offTimeUtc);
      setOnTimeUtc(flight.onTimeUtc);
      setInTimeUtc(flight.inTimeUtc);
      setTotalMinutes(flight.totalTimeMinutes);
      setNightTimeInput(formatMinutesToHHMM(flight.nightTimeMinutes || 0));
      setLandingsDay(flight.landingsDay || 0);
      setRecencyFields({
        takeoffsDay: flight.takeoffsDay,
        takeoffsNight: flight.takeoffsNight,
        fullStopLandingsNight: flight.fullStopLandingsNight,
      });
      setLandingsNight(flight.landingsNight || 0);
      setApproachType(flight.approachType || '');
      setRemarks(flight.remarks || '');

      setFlightRole((flight.flightRole as any) || (flight.picTimeMinutes > 0 ? 'PIC' : flight.picusTimeMinutes > 0 ? 'PICUS' : flight.dualTimeMinutes > 0 ? 'Dual' : 'SIC'));
      setFlightHandling((flight.flightHandling as any) || 'PF');

      // A plan draft opens ready to correct and confirm
      setIsEditing(flight.status === 'draft');

      // Resolve airport info
      airportService.getAirport(flight.depIcao).then(setDepAirportInfo);
      airportService.getAirport(flight.arrIcao).then(setArrAirportInfo);
    }
  }, [flight]);

  // Recalculate block time in edit mode
  useEffect(() => {
    if (!isEditing || !outTimeUtc || !inTimeUtc) return;

    try {
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
      // Ignored
    }
  }, [isEditing, date, outTimeUtc, inTimeUtc]);

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
    if (up.length >= 3) {
      airportService.getAirport(up).then(setDepAirportInfo);
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
    if (up.length >= 3) {
      airportService.getAirport(up).then(setArrAirportInfo);
    }
  };

  const calculateNightTimesAuto = () => {
    try {
      if (!depAirportInfo || !arrAirportInfo || !date) return;
      const depTime = offTimeUtc || outTimeUtc;
      const arrTime = onTimeUtc || inTimeUtc;
      if (!depTime || !arrTime) return;

      const [outH, outM] = depTime.split(':').map(Number);
      const [inH, inM] = arrTime.split(':').map(Number);
      const [year, month, day] = date.split('-').map(Number);

      const offDate = new Date(Date.UTC(year, month - 1, day, outH, outM));
      let onDate = new Date(Date.UTC(year, month - 1, day, inH, inM));
      if (onDate < offDate) {
        onDate = new Date(onDate.getTime() + 24 * 60 * 60 * 1000);
      }

      const res = calculateFlightTimes(
        { latitude: depAirportInfo.latitude, longitude: depAirportInfo.longitude },
        { latitude: arrAirportInfo.latitude, longitude: arrAirportInfo.longitude },
        offDate,
        onDate,
        'civil_twilight'
      );

      setNightTimeInput(formatMinutesToHHMM(res.nightMinutes));

      const sunAtLanding = SunCalc.getPosition(onDate, arrAirportInfo.latitude, arrAirportInfo.longitude);
      const isNight = sunAtLanding.altitude <= -6.0;
      if (isNight) {
        setLandingsNight(Math.max(1, landingsNight));
      }
    } catch (err) {
      console.warn('Night calculation error:', err);
    }
  };

  if (!isOpen || !flight) return null;

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (!isFormValid) return;
    const nightMins = parseTimeToMinutes(nightTimeInput);

    const updated: LocalFlight = {
      ...flight,
      date,
      depIcao: depIcao.toUpperCase().trim(),
      arrIcao: arrIcao.toUpperCase().trim(),
      aircraftReg: aircraftReg.toUpperCase().trim(),
      aircraftType: aircraftType.toUpperCase().trim(),
      outTimeUtc,
      offTimeUtc,
      onTimeUtc,
      inTimeUtc,
      totalTimeMinutes: totalMinutes,
      nightTimeMinutes: Math.min(nightMins, totalMinutes > 0 ? totalMinutes : nightMins),
      ifrTimeMinutes: totalMinutes,
      picTimeMinutes: flightRole === 'PIC' ? totalMinutes : 0,
      sicTimeMinutes: flightRole === 'SIC' ? totalMinutes : 0,
      picusTimeMinutes: flightRole === 'PICUS' ? totalMinutes : 0,
      dualTimeMinutes: flightRole === 'Dual' ? totalMinutes : 0,
      instructorTimeMinutes: flightRole === 'Instructor' ? totalMinutes : 0,
      ...recencyFields,
      flightRole,
      flightHandling,
      landingsDay,
      landingsNight,
      approachType,
      remarks,
      syncStatus: flight.syncStatus === 'synced' ? 'updated' : flight.syncStatus,
      updatedAt: new Date().toISOString(),
    };

    onSave(updated);
    setIsEditing(false);
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4 overflow-hidden"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="bg-avionics-surface border border-avionics-border rounded-t-3xl sm:rounded-2xl w-full max-w-2xl shadow-2xl overflow-hidden my-0 sm:my-8 max-h-[90dvh] sm:max-h-[88vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Mobile Drag Handle Indicator */}
        <div className="w-10 h-1 bg-avionics-border/80 rounded-full mx-auto sm:hidden mt-2 shrink-0" />

        {/* Modal Header */}
        <div className="flex items-center justify-between px-4 sm:px-6 py-3 sm:py-4 border-b border-avionics-border bg-avionics-card shrink-0">
          <div className="flex items-center space-x-3">
            <div className="p-2 bg-sky-500/10 border border-sky-500/20 rounded-xl text-sky-400">
              <Plane className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base md:text-lg font-bold text-avionics-text">
                {isEditing ? 'Редактирование рейса' : 'Сведения о рейсе'}
              </h2>
              <div className="text-xs text-avionics-muted font-mono">
                {parseFlightDate(flight.date).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' })}
              </div>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            {!isEditing && (
              <button
                onClick={() => setIsEditing(true)}
                className="flex items-center space-x-1.5 px-3 py-1.5 rounded-xl bg-sky-500/10 hover:bg-sky-500/20 text-sky-400 border border-sky-500/30 text-xs font-semibold transition-colors cursor-pointer"
              >
                <Edit3 className="w-4 h-4" />
                <span className="hidden sm:inline">Редактировать</span>
              </button>
            )}
            <button
              onClick={onClose}
              className="p-1.5 text-avionics-muted hover:text-avionics-text rounded-lg hover:bg-avionics-surface transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Route Banner */}
        <div className="p-3.5 sm:p-5 md:p-6 bg-gradient-to-r from-sky-950/20 via-avionics-surface to-indigo-950/20 border-b border-avionics-border shrink-0">
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0 flex-1">
              <div className="text-xl sm:text-3xl md:text-4xl font-black font-mono text-sky-400 tracking-wider truncate">
                {flight.depIcao}
              </div>
              <div className="text-2xs sm:text-xs md:text-sm text-avionics-muted mt-0.5 truncate max-w-[90px] sm:max-w-[170px]" title={depAirportInfo ? depAirportInfo.name : 'Вылет'}>
                {depAirportInfo ? depAirportInfo.name : 'Вылет'}
              </div>
            </div>

            <div className="flex flex-col items-center px-1.5 sm:px-4 shrink-0">
              <span className="text-xs font-mono font-bold text-avionics-muted mb-0.5">
                {formatMinutesToHHMM(flight.totalTimeMinutes)}
              </span>
              <div className="flex items-center space-x-1 text-sky-400">
                <div className="w-5 sm:w-12 md:w-16 h-[2px] bg-sky-500/40"></div>
                <Plane className="w-4 h-4 sm:w-5 sm:h-5 rotate-90" />
                <div className="w-5 sm:w-12 md:w-16 h-[2px] bg-sky-500/40"></div>
              </div>
              <span className="text-[10px] sm:text-[11px] text-avionics-muted mt-0.5 uppercase font-semibold max-w-[100px] sm:max-w-[160px] truncate text-center">
                {flight.aircraftReg} ({flight.aircraftType})
              </span>
            </div>

            <div className="text-right flex flex-col items-end min-w-0 flex-1">
              <div className="text-xl sm:text-3xl md:text-4xl font-black font-mono text-sky-400 tracking-wider truncate">
                {flight.arrIcao}
              </div>
              <div className="text-2xs sm:text-xs md:text-sm text-avionics-muted mt-0.5 truncate max-w-[90px] sm:max-w-[170px] text-right" title={arrAirportInfo ? arrAirportInfo.name : 'Прилет'}>
                {arrAirportInfo ? arrAirportInfo.name : 'Прилет'}
              </div>
            </div>
          </div>
        </div>

        {/* Body */}
        {isEditing ? (
          <form onSubmit={handleSave} className="p-4 sm:p-6 space-y-5 overflow-y-auto overscroll-contain flex-1">
            {flight.status === 'draft' && (
              <div role="note" className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-xs text-avionics-text">
                Черновик из месячного плана. Укажите фактическое время, борт, роль и посадки: сохранение подтвердит рейс и
                добавит его в налёт.
              </div>
            )}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-semibold text-avionics-muted mb-1">Дата</label>
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
                  className="w-full bg-avionics-card border border-avionics-border rounded-xl px-3 py-2 text-sm font-mono uppercase text-avionics-text focus:outline-none focus:border-sky-500"
                  required
                />
              </div>
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-xs font-semibold text-avionics-muted">Тип ВС</label>
                  {availableTypes.length > 0 && (
                    <span className="text-2xs text-sky-400 font-normal">Из профиля</span>
                  )}
                </div>
                <input
                  type="text"
                  value={aircraftType}
                  onChange={(e) => setAircraftType(e.target.value.toUpperCase())}
                  className="w-full bg-avionics-card border border-avionics-border rounded-xl px-3 py-2 text-sm font-mono uppercase text-avionics-text focus:outline-none focus:border-sky-500"
                  required
                />
                {availableTypes.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-1.5">
                    {availableTypes.map((t) => (
                      <button
                        key={t}
                        type="button"
                        onClick={() => setAircraftType(t)}
                        className={`px-2 py-0.5 rounded-lg text-2xs font-mono font-bold transition-all cursor-pointer border ${
                          aircraftType === t
                            ? 'bg-sky-500 text-slate-950 border-sky-400 shadow-sm'
                            : 'bg-avionics-surface text-avionics-muted hover:text-sky-300 border-avionics-border'
                        }`}
                      >
                        {t}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {/* DEP ICAO */}
              <div className="relative">
                <label className="block text-xs font-semibold text-avionics-muted mb-1 flex items-center justify-between">
                  <span>Вылет (ICAO / Название)</span>
                  {depAirportInfo && (
                    <span className="text-[11px] text-emerald-400 font-normal flex items-center space-x-1">
                      <CheckCircle className="w-3 h-3" />
                      <span>{depAirportInfo.iata ? `${depAirportInfo.iata} • ` : ''}Определен</span>
                    </span>
                  )}
                </label>
                <input
                  type="text"
                  maxLength={4}
                  value={depIcao}
                  onChange={(e) => handleDepChange(e.target.value)}
                  onFocus={() => depSuggestions.length > 0 && setShowDepDropdown(true)}
                  className="w-full bg-avionics-card border border-avionics-border rounded-xl px-3 py-2 text-base font-mono font-bold text-sky-400 uppercase focus:outline-none focus:border-sky-500"
                  required
                />
                {depAirportInfo && (
                  <div className="text-[11px] text-avionics-muted truncate mt-1">
                    {depAirportInfo.name}
                  </div>
                )}
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
                        className="w-full text-left px-3 py-2 hover:bg-avionics-surface active:bg-avionics-surface transition-colors flex items-center justify-between text-xs cursor-pointer"
                      >
                        <div>
                          <strong className="text-sky-400 font-mono">{item.icao}</strong>
                          {item.iata && <span className="text-avionics-muted ml-1">({item.iata})</span>}
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
                      <span>{arrAirportInfo.iata ? `${arrAirportInfo.iata} • ` : ''}Определен</span>
                    </span>
                  )}
                </label>
                <input
                  type="text"
                  maxLength={4}
                  value={arrIcao}
                  onChange={(e) => handleArrChange(e.target.value)}
                  onFocus={() => arrSuggestions.length > 0 && setShowArrDropdown(true)}
                  className="w-full bg-avionics-card border border-avionics-border rounded-xl px-3 py-2 text-base font-mono font-bold text-sky-400 uppercase focus:outline-none focus:border-sky-500"
                  required
                />
                {arrAirportInfo && (
                  <div className="text-[11px] text-avionics-muted truncate mt-1">
                    {arrAirportInfo.name}
                  </div>
                )}
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
                        className="w-full text-left px-3 py-2 hover:bg-avionics-surface active:bg-avionics-surface transition-colors flex items-center justify-between text-xs cursor-pointer"
                      >
                        <div>
                          <strong className="text-sky-400 font-mono">{item.icao}</strong>
                          {item.iata && <span className="text-avionics-muted ml-1">({item.iata})</span>}
                          <div className="text-avionics-muted text-[11px] truncate max-w-[200px]">{item.name}</div>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Block & Flight Times */}
            <div className="bg-avionics-card border border-avionics-border rounded-xl p-4 space-y-3">
              <div className="text-xs font-bold uppercase tracking-wider text-avionics-muted">
                Время в формате UTC
              </div>
              <div className="grid grid-cols-4 gap-2">
                <div>
                  <label className="block text-[11px] text-avionics-muted mb-0.5">OUT (Колодки)</label>
                  <input
                    type="time"
                    value={outTimeUtc}
                    onChange={(e) => handleOutTimeChange(e.target.value)}
                    className="w-full bg-avionics-surface border border-avionics-border rounded-lg px-2 py-1.5 text-sm font-mono text-center text-avionics-text focus:outline-none focus:border-sky-500"
                    required
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-avionics-muted mb-0.5">OFF (Взлёт)</label>
                  <input
                    type="time"
                    value={offTimeUtc}
                    onChange={(e) => setOffTimeUtc(e.target.value)}
                    className={`w-full bg-avionics-surface border rounded-lg px-2 py-1.5 text-sm font-mono text-center focus:outline-none ${
                      validation.offError
                        ? 'border-rose-500 text-rose-300 ring-1 ring-rose-500/30'
                        : 'border-avionics-border text-avionics-text focus:border-sky-500'
                    }`}
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-avionics-muted mb-0.5">ON (Посадка)</label>
                  <input
                    type="time"
                    value={onTimeUtc}
                    onChange={(e) => handleOnTimeChange(e.target.value)}
                    className={`w-full bg-avionics-surface border rounded-lg px-2 py-1.5 text-sm font-mono text-center focus:outline-none ${
                      validation.orderError
                        ? 'border-rose-500 text-rose-300 ring-1 ring-rose-500/30'
                        : 'border-avionics-border text-avionics-text focus:border-sky-500'
                    }`}
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-avionics-muted mb-0.5">IN (Колодки)</label>
                  <input
                    type="time"
                    value={inTimeUtc}
                    onChange={(e) => setInTimeUtc(e.target.value)}
                    className={`w-full bg-avionics-surface border rounded-lg px-2 py-1.5 text-sm font-mono text-center focus:outline-none ${
                      validation.inError
                        ? 'border-rose-500 text-rose-300 ring-1 ring-rose-500/30'
                        : 'border-avionics-border text-avionics-text focus:border-sky-500'
                    }`}
                    required
                  />
                </div>
              </div>

              {/* Chronology Validation Warning */}
              {(validation.offError || validation.inError || validation.orderError) && (
                <div className="p-2.5 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-center space-x-2">
                  <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
                  <span>
                    {validation.offError || validation.inError || validation.orderError}
                  </span>
                </div>
              )}

              {/* Total Block & Manual Night Time Input */}
              <div className="pt-2 border-t border-avionics-border flex flex-wrap items-center justify-between gap-2 text-xs">
                <span className="text-avionics-muted">
                  Block: <strong className="text-sky-400 font-mono text-sm">{formatMinutesToHHMM(totalMinutes)}</strong>
                </span>

                <div className="flex items-center space-x-2">
                  <label className="text-xs text-avionics-muted flex items-center space-x-1">
                    <Moon className="w-3.5 h-3.5 text-indigo-400" />
                    <span>Ночное:</span>
                  </label>
                  <input
                    type="text"
                    value={nightTimeInput}
                    onChange={(e) => setNightTimeInput(e.target.value)}
                    className="w-20 bg-avionics-surface border border-avionics-border rounded-lg px-2 py-1 text-xs font-mono font-bold text-indigo-300 text-center"
                  />
                  <button
                    type="button"
                    onClick={calculateNightTimesAuto}
                    className="flex items-center space-x-1 px-2.5 py-1 rounded-lg bg-indigo-500/20 hover:bg-indigo-500/30 text-indigo-300 border border-indigo-500/30 text-[11px] font-semibold transition-colors cursor-pointer"
                    title="Рассчитать ночное время астрономически по Civil Twilight и координатам"
                  >
                    <Sparkles className="w-3 h-3 text-indigo-400" />
                    <span>Авто-расчет</span>
                  </button>
                </div>
              </div>
            </div>

            {/* Role & Handling Status */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-avionics-muted mb-1">Командная функция экипажа</label>
                <select
                  value={flightRole}
                  onChange={(e) => setFlightRole(e.target.value as any)}
                  className="w-full bg-avionics-card border border-avionics-border rounded-xl px-3 py-2 text-sm font-semibold text-avionics-text"
                >
                  <option value="SIC">SIC — Второй пилот</option>
                  <option value="PIC">PIC — Командир ВС</option>
                  <option value="PICUS">PICUS — Под надзором</option>
                  <option value="Dual">Dual — Обучение</option>
                  <option value="Instructor">Instructor — Инструктор</option>
                  <option value="Observer">Observer — Пилот-наблюдатель</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-avionics-muted mb-1">Статус управления</label>
                <select
                  value={flightHandling}
                  onChange={(e) => setFlightHandling(e.target.value as any)}
                  className="w-full bg-avionics-card border border-avionics-border rounded-xl px-3 py-2 text-sm font-semibold text-avionics-text"
                >
                  <option value="PF">PF — Пилотирующий (Pilot Flying)</option>
                  <option value="PM">PM — Мониторящий (Pilot Monitoring)</option>
                  <option value="Observer">Observer — Наблюдатель</option>
                  <option value="Relief">Relief — Сменный пилот</option>
                </select>
              </div>
            </div>

            {/* Landings */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-avionics-muted mb-1">Посадки (День)</label>
                <input
                  type="number"
                  min={0}
                  value={landingsDay}
                  onChange={(e) => setLandingsDay(Number(e.target.value))}
                  className="w-full bg-avionics-card border border-avionics-border rounded-xl px-3 py-2 text-sm font-mono text-avionics-text"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-avionics-muted mb-1">Посадки (Ночь)</label>
                <input
                  type="number"
                  min={0}
                  value={landingsNight}
                  onChange={(e) => setLandingsNight(Number(e.target.value))}
                  className="w-full bg-avionics-card border border-avionics-border rounded-xl px-3 py-2 text-sm font-mono text-avionics-text"
                />
              </div>
            </div>

            <RecencyFields
              landingsDay={landingsDay}
              landingsNight={landingsNight}
              values={recencyFields}
              onChange={setRecencyFields}
            />

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-avionics-muted mb-1">
                  Вид захода на посадку (Approach Type)
                </label>
                <input
                  type="text"
                  list="edit-approach-types"
                  value={approachType}
                  onChange={(e) => setApproachType(e.target.value)}
                  placeholder="ILS CAT I, RNP, Visual..."
                  className="w-full bg-avionics-card border border-avionics-border rounded-xl px-3 py-2 text-sm text-avionics-text font-semibold uppercase focus:outline-none focus:border-sky-500"
                />
                <datalist id="edit-approach-types">
                  {ICAO_APPROACH_TYPES.map((type) => (
                    <option key={type} value={type} />
                  ))}
                </datalist>
              </div>

              <div>
                <label className="block text-xs font-semibold text-avionics-muted mb-1">Примечания</label>
                <input
                  type="text"
                  value={remarks}
                  onChange={(e) => setRemarks(e.target.value)}
                  placeholder="Заметки о полете..."
                  className="w-full bg-avionics-card border border-avionics-border rounded-xl px-3 py-2 text-sm text-avionics-text focus:outline-none focus:border-sky-500"
                />
              </div>
            </div>

            {/* Buttons */}
            <div className="flex items-center justify-between pt-3 border-t border-avionics-border">
              <button
                type="button"
                onClick={() => setIsEditing(false)}
                className="px-4 py-2 text-sm font-semibold text-avionics-muted hover:text-avionics-text rounded-xl"
              >
                Отмена
              </button>
              <button
                type="submit"
                disabled={!isFormValid}
                className={`flex items-center space-x-1.5 px-6 py-2.5 font-bold text-sm rounded-xl transition-all shadow-lg ${
                  !isFormValid
                    ? 'bg-slate-700 text-slate-400 cursor-not-allowed opacity-50 shadow-none'
                    : 'bg-sky-500 hover:bg-sky-400 text-slate-950 shadow-sky-500/25 cursor-pointer'
                }`}
              >
                <Check className="w-4 h-4" />
                <span>{flight.status === 'draft' ? 'Подтвердить рейс' : 'Сохранить изменения'}</span>
              </button>
            </div>
          </form>
        ) : (
          /* View Mode */
          <div className="p-4 sm:p-6 space-y-6 overflow-y-auto overscroll-contain flex-1">
            {/* Key Flight Metrics */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="p-3 bg-avionics-card rounded-xl border border-avionics-border text-center">
                <div className="text-xs text-avionics-muted uppercase font-semibold">Block Time</div>
                <div className="text-xl md:text-2xl font-bold font-mono text-sky-400 mt-1">
                  {formatMinutesToHHMM(flight.totalTimeMinutes)}
                </div>
              </div>

              <div className="p-3 bg-avionics-card rounded-xl border border-avionics-border text-center">
                <div className="text-xs text-avionics-muted uppercase font-semibold">Night Time</div>
                <div className="text-xl md:text-2xl font-bold font-mono text-indigo-400 mt-1">
                  {formatMinutesToHHMM(flight.nightTimeMinutes)}
                </div>
              </div>

              <div className="p-3 bg-avionics-card rounded-xl border border-avionics-border text-center">
                <div className="text-xs text-avionics-muted uppercase font-semibold">Роль & Управление</div>
                <div className="text-base md:text-lg font-bold font-mono text-emerald-400 mt-1">
                  {flight.flightRole || 'SIC'}
                  <span className="text-xs bg-emerald-500/20 text-emerald-300 px-1.5 py-0.5 rounded ml-1">
                    {flight.flightHandling || 'PF'}
                  </span>
                </div>
              </div>

              <div className="p-3 bg-avionics-card rounded-xl border border-avionics-border text-center">
                <div className="text-xs text-avionics-muted uppercase font-semibold">Посадки</div>
                <div className="text-xl md:text-2xl font-bold font-mono text-amber-400 mt-1">
                  {flight.landingsDay}D / {flight.landingsNight}N
                </div>
              </div>
            </div>

            {/* Timetable Times */}
            <div className="p-4 bg-avionics-card rounded-xl border border-avionics-border space-y-2">
              <div className="text-xs font-bold uppercase tracking-wider text-avionics-muted flex items-center justify-between">
                <span>Хронометраж рейса (UTC)</span>
                <Clock className="w-4 h-4 text-sky-400" />
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center pt-2">
                <div className="p-2 rounded-xl bg-avionics-surface/60 border border-avionics-border/60">
                  <div className="text-2xs sm:text-xs text-avionics-muted font-medium truncate">OUT (Колодки)</div>
                  <div className="text-sm sm:text-base font-mono font-bold text-avionics-text mt-0.5">{flight.outTimeUtc}</div>
                </div>
                <div className="p-2 rounded-xl bg-avionics-surface/60 border border-avionics-border/60">
                  <div className="text-2xs sm:text-xs text-avionics-muted font-medium truncate">OFF (Взлёт)</div>
                  <div className="text-sm sm:text-base font-mono font-bold text-avionics-text mt-0.5">{flight.offTimeUtc}</div>
                </div>
                <div className="p-2 rounded-xl bg-avionics-surface/60 border border-avionics-border/60">
                  <div className="text-2xs sm:text-xs text-avionics-muted font-medium truncate">ON (Посадка)</div>
                  <div className="text-sm sm:text-base font-mono font-bold text-avionics-text mt-0.5">{flight.onTimeUtc}</div>
                </div>
                <div className="p-2 rounded-xl bg-avionics-surface/60 border border-avionics-border/60">
                  <div className="text-2xs sm:text-xs text-avionics-muted font-medium truncate">IN (Колодки)</div>
                  <div className="text-sm sm:text-base font-mono font-bold text-avionics-text mt-0.5">{flight.inTimeUtc}</div>
                </div>
              </div>
            </div>

            {/* Remarks */}
            {(flight.approachType || flight.remarks) && (
              <div className="p-4 bg-avionics-card rounded-xl border border-avionics-border space-y-2">
                {flight.approachType && (
                  <div className="flex items-center space-x-2 text-sm">
                    <span className="text-avionics-muted">Вид захода: </span>
                    <span className="px-2.5 py-0.5 rounded-lg bg-sky-500/15 border border-sky-500/30 text-sky-400 font-mono text-xs font-bold">
                      {flight.approachType}
                    </span>
                  </div>
                )}
                {flight.remarks && (
                  <div className="text-sm">
                    <span className="text-avionics-muted">Примечания: </span>
                    <span className="text-avionics-text italic">«{flight.remarks}»</span>
                  </div>
                )}
              </div>
            )}

            {/* Actions */}
            <div className="flex items-center justify-between pt-4 border-t border-avionics-border gap-2">
              <button
                onClick={() => {
                  if (window.confirm('Вы уверены, что хотите удалить этот рейс?')) {
                    onDelete(flight.id);
                    onClose();
                  }
                }}
                className="flex items-center space-x-1.5 px-3 sm:px-4 py-2 bg-rose-950/30 hover:bg-rose-900/50 text-rose-400 border border-rose-800/50 rounded-xl text-xs sm:text-sm font-semibold transition-colors cursor-pointer"
              >
                <Trash2 className="w-4 h-4 shrink-0" />
                <span>Удалить</span>
              </button>

              <div className="flex items-center space-x-2">
                {onRepeatFlight && (
                  <button
                    onClick={() => {
                      onClose();
                      onRepeatFlight(flight);
                    }}
                    className="flex items-center space-x-1.5 px-3 sm:px-4 py-2 bg-avionics-card hover:bg-avionics-surface text-sky-400 border border-avionics-border rounded-xl text-xs sm:text-sm font-semibold transition-colors cursor-pointer"
                    title="Новый рейс с тем же маршрутом, бортом и временем на сегодня"
                  >
                    <Copy className="w-4 h-4 shrink-0" />
                    <span>Повторить</span>
                  </button>
                )}

                {onAddReturnFlight && (
                  <button
                    onClick={() => {
                      onClose();
                      onAddReturnFlight(flight);
                    }}
                    className="flex items-center space-x-1.5 px-3 sm:px-4 py-2 bg-avionics-card hover:bg-avionics-surface text-sky-400 border border-sky-500/30 rounded-xl text-xs sm:text-sm font-semibold transition-colors cursor-pointer"
                    title="Создать обратный рейс с обратным маршрутом и расчетом времени"
                  >
                    <RotateCcw className="w-4 h-4 shrink-0" />
                    <span>+ Обратный рейс</span>
                  </button>
                )}

                <button
                  onClick={() => setIsEditing(true)}
                  className="flex items-center space-x-1.5 px-4 sm:px-5 py-2 sm:py-2.5 bg-sky-500 hover:bg-sky-400 text-slate-950 rounded-xl text-xs sm:text-sm font-bold transition-all shadow-lg shadow-sky-500/20 cursor-pointer"
                >
                  <Edit3 className="w-4 h-4 shrink-0" />
                  <span>Редактировать</span>
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
