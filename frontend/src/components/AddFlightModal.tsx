import { addDays, parseFlightDate, toDateKey } from '../utils/dates';
import React, { useState, useEffect } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { X, Plane, Clock, Moon, Shield, UserCheck, Search, CheckCircle, RotateCcw, Repeat, Sparkles, AlertCircle } from 'lucide-react';
import { LocalFlight, LocalAirport, db } from '../db/db';
import { airportService } from '../utils/airportService';
import { syncEngine } from '../services/syncEngine';
import { generateUUID } from '../utils/uuid';
import { formatMinutesToHHMM } from './FlightList';
import { calculateFlightTimes } from '../utils/nightCalculator';
import { getStoredPilotProfile } from './AuthModal';
import { RecencyFields, RecencyFieldValues } from './RecencyFields';
import * as SunCalc from 'suncalc';

export const ICAO_APPROACH_TYPES = [
  'ILS CAT I',
  'ILS CAT II',
  'ILS CAT IIIA',
  'ILS CAT IIIB',
  'ILS CAT IIIC',
  'RNP / RNAV (LNAV/VNAV)',
  'RNP AR',
  'LPV',
  'GLS',
  'VOR',
  'VOR/DME',
  'NDB',
  'Visual (Визуальный / ПВП)',
  'Circling (Визуальное маневрирование)',
  'PAR (Посадочный локатор)',
];

interface AddFlightModalProps {
  isOpen: boolean;
  onClose: () => void;
  airports: LocalAirport[];
  initialData?: Partial<LocalFlight> | null;
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

export const addMinutesToTime = (timeStr: string, minutesToAdd: number): string => {
  if (!timeStr || !timeStr.includes(':')) return '10:00';
  const [h, m] = timeStr.split(':').map(Number);
  const totalMins = (((h * 60 + m + minutesToAdd) % (24 * 60)) + (24 * 60)) % (24 * 60);
  const newH = Math.floor(totalMins / 60);
  const newM = totalMins % 60;
  return `${String(newH).padStart(2, '0')}:${String(newM).padStart(2, '0')}`;
};

export interface FlightChronologyValidation {
  isValid: boolean;
  offError?: string;
  inError?: string;
  orderError?: string;
}

export const validateFlightTimes = (
  outTime: string,
  offTime: string,
  onTime: string,
  inTime: string
): FlightChronologyValidation => {
  if (!outTime) return { isValid: true };

  const toMins = (t: string) => {
    const [h, m] = t.split(':').map(Number);
    return h * 60 + m;
  };

  const outM = toMins(outTime);
  let inM = inTime ? toMins(inTime) : null;
  if (inM !== null && inM < outM) inM += 24 * 60; // overnight flight

  const result: FlightChronologyValidation = { isValid: true };

  // Check OFF relative to OUT
  if (offTime) {
    let offM = toMins(offTime);
    if (offM < outM && outM - offM > 12 * 60) offM += 24 * 60; // wrap over midnight
    if (offM < outM) {
      result.isValid = false;
      result.offError = 'Взлёт (OFF) не может быть раньше уборки колодок (OUT)';
    } else if (inM !== null && offM > inM) {
      result.isValid = false;
      result.offError = 'Взлёт (OFF) не может быть позже окончания рейса (IN)';
    }
  }

  // Check ON relative to IN and OFF
  if (onTime) {
    let onM = toMins(onTime);
    if (onM < outM && outM - onM > 12 * 60) {
      onM += 24 * 60;
    } else if (inM !== null && inM >= 24 * 60 && onM < 12 * 60) {
      onM += 24 * 60;
    }

    if (inM !== null && onM > inM) {
      result.isValid = false;
      result.inError = 'Постановка на колодки (IN) не может быть раньше посадки (ON)';
    }

    if (offTime) {
      let offM = toMins(offTime);
      if (offM < outM && outM - offM > 12 * 60) offM += 24 * 60;
      if (onM < offM) {
        result.isValid = false;
        result.orderError = 'Посадка (ON) не может быть раньше взлёта (OFF)';
      }
    }
  }

  return result;
};

export const AddFlightModal: React.FC<AddFlightModalProps> = ({ isOpen, onClose, initialData }) => {
  const today = toDateKey(new Date());

  // Available pilot aircraft types from profile
  const [availableTypes, setAvailableTypes] = useState<string[]>([]);

  // Primary Leg State (initialized clean)
  const [date, setDate] = useState(today);
  const [depIcao, setDepIcao] = useState('');
  const [arrIcao, setArrIcao] = useState('');
  const [depAirportInfo, setDepAirportInfo] = useState<LocalAirport | null>(null);
  const [arrAirportInfo, setArrAirportInfo] = useState<LocalAirport | null>(null);

  // Suggestions state
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

  // Manual Night Time
  const [nightTimeInput, setNightTimeInput] = useState('00:00');

  // Crew roles including Observer
  const [flightRole, setFlightRole] = useState<'PIC' | 'SIC' | 'PICUS' | 'Dual' | 'Instructor' | 'Observer'>('SIC');
  const [flightHandling, setFlightHandling] = useState<'PF' | 'PM' | 'Observer' | 'Relief'>('PF');

  const [landingsDay, setLandingsDay] = useState(0);
  const [landingsNight, setLandingsNight] = useState(0);
  const [approachType, setApproachType] = useState('');
  const [remarks, setRemarks] = useState('');

  // Turnaround (Return Leg) State with Full Parity
  const [isReturnLegEnabled, setIsReturnLegEnabled] = useState(false);
  const [retDate, setRetDate] = useState(today);
  const [retDepIcao, setRetDepIcao] = useState('');
  const [retArrIcao, setRetArrIcao] = useState('');
  const [retDepAirportInfo, setRetDepAirportInfo] = useState<LocalAirport | null>(null);
  const [retArrAirportInfo, setRetArrAirportInfo] = useState<LocalAirport | null>(null);
  const [retDepSuggestions, setRetDepSuggestions] = useState<LocalAirport[]>([]);
  const [retArrSuggestions, setRetArrSuggestions] = useState<LocalAirport[]>([]);
  const [showRetDepDropdown, setShowRetDepDropdown] = useState(false);
  const [showRetArrDropdown, setShowRetArrDropdown] = useState(false);

  const [retAircraftReg, setRetAircraftReg] = useState('');
  const [recencyFields, setRecencyFields] = useState<RecencyFieldValues>({});
  useEffect(() => {
    if (isOpen) setRecencyFields({});
  }, [isOpen, initialData]);

  // Registrations already in the logbook: suggested while typing, and each one knows its type
  const knownRegistrations = useLiveQuery(() => db.flights.orderBy('aircraftReg').uniqueKeys(), []) as string[] | undefined;
  // The pilot's most flown routes, one tap to fill route, type and last registration
  const frequentRoutes = useLiveQuery(async () => {
    const counts = new Map<string, { key: string; depIcao: string; arrIcao: string; aircraftType: string; aircraftReg: string; count: number }>();
    (await db.flights.toArray())
      .filter((flight) => (flight.entryType ?? 'flight') === 'flight' && flight.status !== 'draft' && flight.syncStatus !== 'deleted')
      .sort((a, b) => b.date.localeCompare(a.date))
      .forEach((flight) => {
        const key = `${flight.depIcao}-${flight.arrIcao}-${flight.aircraftType}`;
        const route = counts.get(key) || { key, depIcao: flight.depIcao, arrIcao: flight.arrIcao, aircraftType: flight.aircraftType, aircraftReg: flight.aircraftReg, count: 0 };
        route.count += 1;
        counts.set(key, route);
      });
    return Array.from(counts.values()).sort((a, b) => b.count - a.count).slice(0, 6);
  }, []) || [];

  const fillTypeFromRegistration = async (registration: string) => {
    const normalized = registration.trim().toUpperCase();
    if (!normalized) return;
    const previous = await db.flights.where('aircraftReg').equals(normalized).first();
    if (previous?.aircraftType) setAircraftType(previous.aircraftType.toUpperCase());
  };
  const [retAircraftType, setRetAircraftType] = useState('');
  const [retOutTimeUtc, setRetOutTimeUtc] = useState('');
  const [retOffTimeUtc, setRetOffTimeUtc] = useState('');
  const [retOnTimeUtc, setRetOnTimeUtc] = useState('');
  const [retInTimeUtc, setRetInTimeUtc] = useState('');
  const [retFlightRole, setRetFlightRole] = useState<'PIC' | 'SIC' | 'PICUS' | 'Dual' | 'Instructor' | 'Observer'>('SIC');
  const [retFlightHandling, setRetFlightHandling] = useState<'PF' | 'PM' | 'Observer' | 'Relief'>('PM');
  const [retLandingsDay, setRetLandingsDay] = useState(0);
  const [retLandingsNight, setRetLandingsNight] = useState(0);
  const [retNightTimeInput, setRetNightTimeInput] = useState('00:00');
  const [retApproachType, setRetApproachType] = useState('');
  const [retRemarks, setRetRemarks] = useState('');
  const [retTotalMinutes, setRetTotalMinutes] = useState(0);
  const [retCalculatedNightMins, setRetCalculatedNightMins] = useState<number | null>(null);
  const [retIsNightLandingSuggested, setRetIsNightLandingSuggested] = useState(false);

  // Clean card reset & initialData synchronization
  useEffect(() => {
    if (!isOpen) return;

    const pilotProf = getStoredPilotProfile();
    setAvailableTypes(
      pilotProf.aircraftTypes && pilotProf.aircraftTypes.length > 0
        ? pilotProf.aircraftTypes
        : ['A320', 'B738']
    );

    if (initialData) {
      setDate(initialData.date || today);
      setDepIcao(initialData.depIcao || '');
      setArrIcao(initialData.arrIcao || '');
      setAircraftReg(initialData.aircraftReg || '');
      setAircraftType(initialData.aircraftType || '');
      setFlightRole((initialData.flightRole as any) || 'SIC');
      setFlightHandling((initialData.flightHandling as any) || 'PF');
      setOutTimeUtc(initialData.outTimeUtc || '');
      setOffTimeUtc(initialData.offTimeUtc || '');
      setOnTimeUtc(initialData.onTimeUtc || '');
      setInTimeUtc(initialData.inTimeUtc || '');
      setApproachType(initialData.approachType || '');
      setRemarks(initialData.remarks || '');
      setLandingsDay(initialData.landingsDay || 0);
      setLandingsNight(initialData.landingsNight || 0);
      setNightTimeInput(formatMinutesToHHMM(initialData.nightTimeMinutes || 0));
      setIsReturnLegEnabled(false);
      if (initialData.depIcao) airportService.getAirport(initialData.depIcao).then(setDepAirportInfo);
      if (initialData.arrIcao) airportService.getAirport(initialData.arrIcao).then(setArrAirportInfo);
    } else {
      // Чистая карточка при каждом новом открытии
      setDate(today);
      setDepIcao('');
      setArrIcao('');
      setDepAirportInfo(null);
      setArrAirportInfo(null);
      setDepSuggestions([]);
      setArrSuggestions([]);
      setShowDepDropdown(false);
      setShowArrDropdown(false);
      setAircraftReg('');
      setAircraftType('');
      setOutTimeUtc('');
      setOffTimeUtc('');
      setOnTimeUtc('');
      setInTimeUtc('');
      setNightTimeInput('00:00');
      setFlightRole('SIC');
      setFlightHandling('PF');
      setLandingsDay(0);
      setLandingsNight(0);
      setApproachType('');
      setRemarks('');
      setTotalMinutes(0);
      setCalculatedNightMins(null);
      setIsNightLandingSuggested(false);

      // Return leg reset
      setIsReturnLegEnabled(false);
      setRetDate(today);
      setRetDepIcao('');
      setRetArrIcao('');
      setRetDepAirportInfo(null);
      setRetArrAirportInfo(null);
      setRetDepSuggestions([]);
      setRetArrSuggestions([]);
      setShowRetDepDropdown(false);
      setShowRetArrDropdown(false);
      setRetAircraftReg('');
      setRetAircraftType('');
      setRetOutTimeUtc('');
      setRetOffTimeUtc('');
      setRetOnTimeUtc('');
      setRetInTimeUtc('');
      setRetFlightRole('SIC');
      setRetFlightHandling('PM');
      setRetLandingsDay(0);
      setRetLandingsNight(0);
      setRetNightTimeInput('00:00');
      setRetApproachType('');
      setRetRemarks('');
      setRetTotalMinutes(0);
      setRetCalculatedNightMins(null);
      setRetIsNightLandingSuggested(false);
    }
  }, [isOpen, initialData]);

  // Computed total block minutes
  const [totalMinutes, setTotalMinutes] = useState(0);
  const [calculatedNightMins, setCalculatedNightMins] = useState<number | null>(null);
  const [isNightLandingSuggested, setIsNightLandingSuggested] = useState(false);

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
    if (isOpen) {
      const originalOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = originalOverflow;
      };
    }
  }, [isOpen]);

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

  // Return leg airport lookups
  const handleRetDepChange = async (val: string) => {
    const up = val.toUpperCase();
    setRetDepIcao(up);
    if (up.length >= 2) {
      const results = await airportService.searchAirports(up, 5);
      setRetDepSuggestions(results);
      setShowRetDepDropdown(results.length > 0);
    } else {
      setRetDepSuggestions([]);
      setShowRetDepDropdown(false);
    }
    if (up.length >= 3) {
      airportService.getAirport(up).then(setRetDepAirportInfo);
    }
  };

  const handleRetArrChange = async (val: string) => {
    const up = val.toUpperCase();
    setRetArrIcao(up);
    if (up.length >= 2) {
      const results = await airportService.searchAirports(up, 5);
      setRetArrSuggestions(results);
      setShowRetArrDropdown(results.length > 0);
    } else {
      setRetArrSuggestions([]);
      setShowRetArrDropdown(false);
    }
    if (up.length >= 3) {
      airportService.getAirport(up).then(setRetArrAirportInfo);
    }
  };

  // Auto-offset taxi times (OUT -> OFF +15m, ON -> IN +10m)
  const handleOutTimeChange = (val: string) => {
    setOutTimeUtc(val);
    if (val && (!offTimeUtc || offTimeUtc === addMinutesToTime(outTimeUtc, 15))) {
      setOffTimeUtc(addMinutesToTime(val, 15));
    }
  };

  const handleOnTimeChange = (val: string) => {
    setOnTimeUtc(val);
    if (val && (!inTimeUtc || inTimeUtc === addMinutesToTime(onTimeUtc, 10))) {
      setInTimeUtc(addMinutesToTime(val, 10));
    }
  };

  const handleRetOutTimeChange = (val: string) => {
    setRetOutTimeUtc(val);
    if (val && (!retOffTimeUtc || retOffTimeUtc === addMinutesToTime(retOutTimeUtc, 15))) {
      setRetOffTimeUtc(addMinutesToTime(val, 15));
    }
  };

  const handleRetOnTimeChange = (val: string) => {
    setRetOnTimeUtc(val);
    if (val && (!retInTimeUtc || retInTimeUtc === addMinutesToTime(retOnTimeUtc, 10))) {
      setRetInTimeUtc(addMinutesToTime(val, 10));
    }
  };

  // Real-time chronology validations
  const validation1 = validateFlightTimes(outTimeUtc, offTimeUtc, onTimeUtc, inTimeUtc);
  const validation2 = validateFlightTimes(retOutTimeUtc, retOffTimeUtc, retOnTimeUtc, retInTimeUtc);
  const isFormValid = validation1.isValid && (!isReturnLegEnabled || validation2.isValid);

  // Turnaround activation logic
  const handleToggleReturnLeg = () => {
    const next = !isReturnLegEnabled;
    setIsReturnLegEnabled(next);
    if (next) {
      const revDep = arrIcao;
      const revArr = depIcao;
      setRetDepIcao(revDep);
      setRetArrIcao(revArr);
      setRetDepAirportInfo(arrAirportInfo);
      setRetArrAirportInfo(depAirportInfo);
      setRetAircraftReg(aircraftReg);
      setRetAircraftType(aircraftType);

      // Times calculation
      const newOut = inTimeUtc ? addMinutesToTime(inTimeUtc, 45) : '12:00';
      const duration = totalMinutes > 0 ? totalMinutes : 90;
      const newIn = addMinutesToTime(newOut, duration);
      setRetOutTimeUtc(newOut);
      setRetOffTimeUtc(addMinutesToTime(newOut, 15));
      setRetOnTimeUtc(addMinutesToTime(newIn, -10));
      setRetInTimeUtc(newIn);

      // Overnight date detection
      if (inTimeUtc && newOut < inTimeUtc) {
        try {
          setRetDate(toDateKey(addDays(parseFlightDate(date), 1)));
        } catch {
          setRetDate(date);
        }
      } else {
        setRetDate(date);
      }

      // Invert PF / PM handling
      setRetFlightRole(flightRole);
      const nextHandling = flightHandling === 'PF' ? 'PM' : 'PF';
      setRetFlightHandling(nextHandling);
      if (nextHandling === 'PF') {
        setRetLandingsDay(1);
        setRetLandingsNight(0);
      } else {
        setRetLandingsDay(0);
        setRetLandingsNight(0);
      }
      setRetApproachType(approachType || '');
      setRetRemarks(remarks ? `Обратное плечо: ${remarks}` : '');
    }
  };

  // Block time computation
  useEffect(() => {
    try {
      if (!outTimeUtc || !inTimeUtc) {
        setTotalMinutes(0);
        return;
      }
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

  // Block time computation for return leg
  useEffect(() => {
    if (!isReturnLegEnabled) return;
    try {
      if (!retOutTimeUtc || !retInTimeUtc) {
        setRetTotalMinutes(0);
        return;
      }
      const [outH, outM] = retOutTimeUtc.split(':').map(Number);
      const [inH, inM] = retInTimeUtc.split(':').map(Number);
      const [year, month, day] = (retDate || date).split('-').map(Number);

      const outDate = new Date(Date.UTC(year, month - 1, day, outH, outM));
      let inDate = new Date(Date.UTC(year, month - 1, day, inH, inM));
      if (inDate < outDate) {
        inDate = new Date(inDate.getTime() + 24 * 60 * 60 * 1000);
      }

      const blockMins = Math.max(0, Math.round((inDate.getTime() - outDate.getTime()) / (1000 * 60)));
      setRetTotalMinutes(blockMins);
    } catch {
      // Ignore
    }
  }, [isReturnLegEnabled, retDate, date, retOutTimeUtc, retInTimeUtc]);

  // Astronomical Civil Twilight night computation along Great Circle route
  useEffect(() => {
    try {
      if (!depAirportInfo || !arrAirportInfo || !date) {
        setCalculatedNightMins(null);
        return;
      }
      const depTime = offTimeUtc || outTimeUtc;
      const arrTime = onTimeUtc || inTimeUtc;
      if (!depTime || !arrTime) {
        setCalculatedNightMins(null);
        return;
      }

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

      setCalculatedNightMins(res.nightMinutes);

      // Check sun elevation at arrival airport at time of landing
      const sunAtLanding = SunCalc.getPosition(onDate, arrAirportInfo.latitude, arrAirportInfo.longitude);
      const isNight = sunAtLanding.altitude <= -6.0;
      setIsNightLandingSuggested(isNight);
      if (flightHandling === 'PF') {
        if (isNight) {
          setLandingsDay(0);
          setLandingsNight(1);
        } else {
          setLandingsDay(1);
          setLandingsNight(0);
        }
      }
    } catch (err) {
      console.warn('Night computation warning:', err);
      setCalculatedNightMins(null);
      setIsNightLandingSuggested(false);
    }
  }, [depAirportInfo, arrAirportInfo, date, outTimeUtc, offTimeUtc, onTimeUtc, inTimeUtc, flightHandling]);

  // Return leg night computation
  const calculateReturnNightTimesAuto = () => {
    try {
      if (!retDepAirportInfo || !retArrAirportInfo || !retDate) return;
      const depTime = retOffTimeUtc || retOutTimeUtc;
      const arrTime = retOnTimeUtc || retInTimeUtc;
      if (!depTime || !arrTime) return;

      const [outH, outM] = depTime.split(':').map(Number);
      const [inH, inM] = arrTime.split(':').map(Number);
      const [year, month, day] = retDate.split('-').map(Number);

      const offDate = new Date(Date.UTC(year, month - 1, day, outH, outM));
      let onDate = new Date(Date.UTC(year, month - 1, day, inH, inM));
      if (onDate < offDate) {
        onDate = new Date(onDate.getTime() + 24 * 60 * 60 * 1000);
      }

      const res = calculateFlightTimes(
        { latitude: retDepAirportInfo.latitude, longitude: retDepAirportInfo.longitude },
        { latitude: retArrAirportInfo.latitude, longitude: retArrAirportInfo.longitude },
        offDate,
        onDate,
        'civil_twilight'
      );

      setRetCalculatedNightMins(res.nightMinutes);
      setRetNightTimeInput(formatMinutesToHHMM(res.nightMinutes));

      const sunAtLanding = SunCalc.getPosition(onDate, retArrAirportInfo.latitude, retArrAirportInfo.longitude);
      const isNight = sunAtLanding.altitude <= -6.0;
      setRetIsNightLandingSuggested(isNight);
      if (retFlightHandling === 'PF') {
        if (isNight) {
          setRetLandingsDay(0);
          setRetLandingsNight(1);
        } else {
          setRetLandingsDay(1);
          setRetLandingsNight(0);
        }
      }
    } catch (err) {
      console.warn('Return night computation error:', err);
    }
  };

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const nightMins = parseTimeToMinutes(nightTimeInput);

    const newFlight: LocalFlight = {
      id: generateUUID(),
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
      ...recencyFields,
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

    const flightsToAdd = [newFlight];

    if (isReturnLegEnabled) {
      const retNightMins = parseTimeToMinutes(retNightTimeInput);
      const returnFlight: LocalFlight = {
        id: generateUUID(),
        date: retDate || date,
        depIcao: (retDepIcao || arrIcao).toUpperCase().trim(),
        arrIcao: (retArrIcao || depIcao).toUpperCase().trim(),
        outTimeUtc: retOutTimeUtc,
        offTimeUtc: retOffTimeUtc || retOutTimeUtc,
        onTimeUtc: retOnTimeUtc || retInTimeUtc,
        inTimeUtc: retInTimeUtc,
        totalTimeMinutes: retTotalMinutes,
        nightTimeMinutes: Math.min(retNightMins, retTotalMinutes > 0 ? retTotalMinutes : retNightMins),
        ifrTimeMinutes: retTotalMinutes,
        picTimeMinutes: retFlightRole === 'PIC' ? retTotalMinutes : 0,
        sicTimeMinutes: retFlightRole === 'SIC' ? retTotalMinutes : 0,
        picusTimeMinutes: retFlightRole === 'PICUS' ? retTotalMinutes : 0,
        dualTimeMinutes: retFlightRole === 'Dual' ? retTotalMinutes : 0,
        instructorTimeMinutes: retFlightRole === 'Instructor' ? retTotalMinutes : 0,
        flightRole: retFlightRole,
        flightHandling: retFlightHandling,
        landingsDay: retLandingsDay,
        landingsNight: retLandingsNight,
        aircraftReg: (retAircraftReg || aircraftReg).toUpperCase().trim(),
        aircraftType: (retAircraftType || aircraftType).toUpperCase().trim(),
        approachType: retApproachType,
        remarks: retRemarks,
        syncStatus: 'created',
        updatedAt: new Date().toISOString(),
      };
      flightsToAdd.push(returnFlight);
    }

    await db.flights.bulkAdd(flightsToAdd);
    syncEngine.syncNow();

    // Cache airports in Dexie if resolved
    if (depAirportInfo) db.airports.put(depAirportInfo).catch(() => {});
    if (arrAirportInfo) db.airports.put(arrAirportInfo).catch(() => {});
    if (retDepAirportInfo) db.airports.put(retDepAirportInfo).catch(() => {});
    if (retArrAirportInfo) db.airports.put(retArrAirportInfo).catch(() => {});

    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4 overflow-hidden"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="bg-avionics-surface border border-avionics-border rounded-t-3xl sm:rounded-2xl w-full max-w-xl shadow-2xl overflow-hidden my-0 sm:my-8 max-h-[90dvh] sm:max-h-[88vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Mobile Drag Handle Indicator */}
        <div className="w-10 h-1 bg-avionics-border/80 rounded-full mx-auto sm:hidden mt-2 shrink-0" />

        {/* Header */}
        <div className="flex items-center justify-between px-5 sm:px-6 py-3.5 sm:py-4 border-b border-avionics-border bg-avionics-card shrink-0">
          <div className="flex items-center space-x-2.5">
            <Plane className="w-5 h-5 text-sky-400" />
            <h2 className="text-base md:text-lg font-bold text-avionics-text">Внесение полета в LogBook</h2>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-avionics-muted hover:text-avionics-text rounded-lg hover:bg-avionics-surface transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-4 sm:p-6 space-y-4 sm:space-y-5 overflow-y-auto overscroll-contain flex-1">
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
                onBlur={(e) => fillTypeFromRegistration(e.target.value)}
                list="known-registrations"
                placeholder="RA-73001"
                className="w-full bg-avionics-card border border-avionics-border rounded-xl px-3 py-2 text-sm font-mono uppercase text-avionics-text focus:outline-none focus:border-sky-500"
                required
              />
              <datalist id="known-registrations">
                {(knownRegistrations || []).filter(Boolean).map((registration) => (
                  <option key={registration} value={registration} />
                ))}
              </datalist>
            </div>
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-xs font-semibold text-avionics-muted">Тип ВС (Type)</label>
                {availableTypes.length > 0 && (
                  <span className="text-2xs text-sky-400 font-normal">Из профиля</span>
                )}
              </div>
              <input
                type="text"
                value={aircraftType}
                onChange={(e) => setAircraftType(e.target.value.toUpperCase())}
                placeholder="A320 / B738"
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

          {frequentRoutes.length > 0 && !initialData && (
            <div>
              <span className="block text-xs font-semibold text-avionics-muted mb-1.5">Частые рейсы</span>
              <div className="flex flex-wrap gap-1.5">
                {frequentRoutes.map((route) => (
                  <button
                    key={route.key}
                    type="button"
                    onClick={() => {
                      setDepIcao(route.depIcao);
                      setArrIcao(route.arrIcao);
                      setAircraftType(route.aircraftType);
                      if (route.aircraftReg) setAircraftReg(route.aircraftReg);
                    }}
                    className="px-2.5 py-1 rounded-lg bg-avionics-card border border-avionics-border text-xs font-mono font-semibold text-avionics-text hover:border-sky-500/50 cursor-pointer"
                  >
                    {route.depIcao}–{route.arrIcao} · {route.aircraftType}
                  </button>
                ))}
              </div>
            </div>
          )}

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
                  onChange={(e) => handleOutTimeChange(e.target.value)}
                  className="w-full bg-avionics-surface border border-avionics-border rounded-lg px-2 py-1.5 text-sm font-mono text-avionics-text focus:outline-none focus:border-sky-500 text-center"
                  required
                />
              </div>
              <div>
                <label className="block text-xs text-avionics-muted mb-0.5">OFF (Взлёт)</label>
                <input
                  type="time"
                  value={offTimeUtc}
                  onChange={(e) => setOffTimeUtc(e.target.value)}
                  className={`w-full bg-avionics-surface border rounded-lg px-2 py-1.5 text-sm font-mono text-center focus:outline-none ${
                    validation1.offError
                      ? 'border-rose-500 text-rose-300 ring-1 ring-rose-500/30'
                      : 'border-avionics-border text-avionics-text focus:border-sky-500'
                  }`}
                />
              </div>
              <div>
                <label className="block text-xs text-avionics-muted mb-0.5">ON (Посадка)</label>
                <input
                  type="time"
                  value={onTimeUtc}
                  onChange={(e) => handleOnTimeChange(e.target.value)}
                  className={`w-full bg-avionics-surface border rounded-lg px-2 py-1.5 text-sm font-mono text-center focus:outline-none ${
                    validation1.orderError
                      ? 'border-rose-500 text-rose-300 ring-1 ring-rose-500/30'
                      : 'border-avionics-border text-avionics-text focus:border-sky-500'
                  }`}
                />
              </div>
              <div>
                <label className="block text-xs text-avionics-muted mb-0.5">IN (Колодки)</label>
                <input
                  type="time"
                  value={inTimeUtc}
                  onChange={(e) => setInTimeUtc(e.target.value)}
                  className={`w-full bg-avionics-surface border rounded-lg px-2 py-1.5 text-sm font-mono text-center focus:outline-none ${
                    validation1.inError
                      ? 'border-rose-500 text-rose-300 ring-1 ring-rose-500/30'
                      : 'border-avionics-border text-avionics-text focus:border-sky-500'
                  }`}
                  required
                />
              </div>
            </div>

            {/* Validation warning message if any */}
            {(validation1.offError || validation1.inError || validation1.orderError) && (
              <div className="p-2.5 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-center space-x-2">
                <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
                <span>
                  {validation1.offError || validation1.inError || validation1.orderError}
                </span>
              </div>
            )}

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

            {/* Exact Astronomical Night Time Calculation Display */}
            {calculatedNightMins !== null && (
              <div className="mt-3 p-3 rounded-xl bg-indigo-500/10 border border-indigo-500/25 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                <div className="flex items-center space-x-2.5">
                  <Moon className="w-4 h-4 text-indigo-400 shrink-0" />
                  <div className="text-xs">
                    <span className="text-avionics-text font-semibold">
                      Точный расчет ночи (Civil Twilight):{' '}
                      <strong className="text-indigo-400 font-mono text-sm">
                        {calculatedNightMins} мин
                      </strong>
                      <span className="text-avionics-muted font-mono ml-1.5">
                        ({formatMinutesToHHMM(calculatedNightMins)})
                      </span>
                    </span>
                    {totalMinutes > 0 && (
                      <span className="text-avionics-muted text-2xs block sm:inline sm:ml-1.5">
                        • {Math.round((calculatedNightMins / totalMinutes) * 100)}% от времени рейса
                      </span>
                    )}
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setNightTimeInput(formatMinutesToHHMM(calculatedNightMins))}
                  className="px-3 py-1.5 bg-indigo-500 hover:bg-indigo-400 text-slate-950 font-bold text-2xs rounded-lg transition-all cursor-pointer self-start sm:self-auto shrink-0 shadow-sm shadow-indigo-500/20"
                >
                  Применить {calculatedNightMins} мин
                </button>
              </div>
            )}
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
          <div className="space-y-2">
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
                <label className="block text-xs font-semibold text-avionics-muted mb-1 flex items-center justify-between">
                  <span>Посадки (Ночь)</span>
                  {isNightLandingSuggested && (
                    <span className="text-[10px] text-indigo-400 font-bold uppercase">Авто</span>
                  )}
                </label>
                <input
                  type="number"
                  min={0}
                  max={20}
                  value={landingsNight}
                  onChange={(e) => setLandingsNight(Number(e.target.value))}
                  className={`w-full bg-avionics-card border rounded-xl px-3 py-2 text-sm font-mono focus:outline-none ${
                    isNightLandingSuggested
                      ? 'border-indigo-500/60 text-indigo-300 font-bold'
                      : 'border-avionics-border text-avionics-text focus:border-sky-500'
                  }`}
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-avionics-muted mb-1">Заход (Approach)</label>
                <input
                  type="text"
                  list="icao-approach-list"
                  value={approachType}
                  onChange={(e) => setApproachType(e.target.value)}
                  placeholder="Выберите или введите заход (необязательно)..."
                  className="w-full bg-avionics-card border border-avionics-border rounded-xl px-3 py-2 text-sm text-avionics-text focus:outline-none focus:border-sky-500"
                />
                <datalist id="icao-approach-list">
                  {ICAO_APPROACH_TYPES.map((t) => (
                    <option key={t} value={t} />
                  ))}
                </datalist>
              </div>
            </div>

            <RecencyFields
              landingsDay={landingsDay}
              landingsNight={landingsNight}
              values={recencyFields}
              onChange={setRecencyFields}
            />

            {/* Night landing auto-suggestion indicator */}
            {isNightLandingSuggested && (
              <div className="p-2.5 rounded-xl bg-indigo-500/10 border border-indigo-500/25 text-2xs text-indigo-300 flex items-center space-x-2">
                <Moon className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                <span>
                  Посадка после наступления темноты (Civil Twilight) — автоматически установлена <strong>1 ночная посадка</strong>.
                </span>
              </div>
            )}
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

          {/* Turnaround Flight Toggle (Разворотный рейс туда и обратно) */}
          <div className="pt-2 border-t border-avionics-border">
            <div
              onClick={handleToggleReturnLeg}
              className="flex items-center justify-between p-3.5 rounded-2xl bg-sky-500/10 border border-sky-500/30 hover:border-sky-500/50 cursor-pointer transition-all"
            >
              <div className="flex items-center space-x-3 min-w-0">
                <div className={`p-2 rounded-xl shrink-0 transition-colors ${isReturnLegEnabled ? 'bg-sky-500 text-slate-950' : 'bg-avionics-card text-sky-400 border border-avionics-border'}`}>
                  <RotateCcw className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <div className="text-xs sm:text-sm font-bold text-avionics-text flex items-center space-x-1.5 flex-wrap">
                    <span>Разворотный рейс (обратное плечо)</span>
                    <span className="text-2xs bg-sky-500/20 text-sky-300 font-mono px-2 py-0.5 rounded-full font-bold">
                      {arrIcao || 'ARR'} → {depIcao || 'DEP'}
                    </span>
                  </div>
                  <div className="text-2xs text-avionics-muted mt-0.5 truncate">
                    Создать обратный рейс с тем же бортом, инверсией PF/PM и полными параметрами
                  </div>
                </div>
              </div>

              <input
                type="checkbox"
                checked={isReturnLegEnabled}
                onChange={() => {}}
                className="w-4 h-4 text-sky-500 rounded focus:ring-0 cursor-pointer shrink-0 ml-2"
              />
            </div>
          </div>

          {/* Leg 2: Return Leg Details with Full Parity */}
          {isReturnLegEnabled && (
            <div className="p-4 rounded-2xl bg-avionics-card/80 border border-sky-500/30 space-y-4 animate-in fade-in duration-200">
              <div className="flex items-center justify-between pb-2 border-b border-avionics-border">
                <div className="flex items-center space-x-2 text-sky-400 font-bold text-xs sm:text-sm">
                  <Plane className="w-4 h-4 rotate-180" />
                  <span>Обратный рейс: {retDepIcao || arrIcao || '—'} → {retArrIcao || depIcao || '—'}</span>
                </div>
                <span className="text-2xs font-mono font-bold text-sky-300 bg-sky-500/10 px-2 py-0.5 rounded border border-sky-500/20">
                  Плечо 2
                </span>
              </div>

              {/* Date & Aircraft for Leg 2 */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-avionics-muted mb-1">Дата обратного рейса</label>
                  <input
                    type="date"
                    value={retDate}
                    onChange={(e) => setRetDate(e.target.value)}
                    className="w-full bg-avionics-surface border border-avionics-border rounded-xl px-3 py-2 text-sm font-mono text-avionics-text focus:outline-none focus:border-sky-500"
                    required={isReturnLegEnabled}
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-avionics-muted mb-1">Бортовой №</label>
                  <input
                    type="text"
                    value={retAircraftReg}
                    onChange={(e) => setRetAircraftReg(e.target.value.toUpperCase())}
                    placeholder={aircraftReg || 'RA-73001'}
                    className="w-full bg-avionics-surface border border-avionics-border rounded-xl px-3 py-2 text-sm font-mono uppercase text-avionics-text focus:outline-none focus:border-sky-500"
                    required={isReturnLegEnabled}
                  />
                </div>
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-xs font-semibold text-avionics-muted">Тип ВС (Type)</label>
                    {availableTypes.length > 0 && (
                      <span className="text-2xs text-sky-400 font-normal">Из профиля</span>
                    )}
                  </div>
                  <input
                    type="text"
                    value={retAircraftType}
                    onChange={(e) => setRetAircraftType(e.target.value.toUpperCase())}
                    placeholder={aircraftType || 'A320'}
                    className="w-full bg-avionics-surface border border-avionics-border rounded-xl px-3 py-2 text-sm font-mono uppercase text-avionics-text focus:outline-none focus:border-sky-500"
                    required={isReturnLegEnabled}
                  />
                  {availableTypes.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-1.5">
                      {availableTypes.map((t) => (
                        <button
                          key={t}
                          type="button"
                          onClick={() => setRetAircraftType(t)}
                          className={`px-2 py-0.5 rounded-lg text-2xs font-mono font-bold transition-all cursor-pointer border ${
                            retAircraftType === t
                              ? 'bg-sky-500 text-slate-950 border-sky-400 shadow-sm'
                              : 'bg-avionics-card text-avionics-muted hover:text-sky-300 border-avionics-border'
                          }`}
                        >
                          {t}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Return Route (DEP / ARR) with Autocomplete */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {/* Return DEP */}
                <div className="relative">
                  <label className="block text-xs font-semibold text-avionics-muted mb-1 flex items-center justify-between">
                    <span>Вылет обратный (ICAO)</span>
                    {retDepAirportInfo && (
                      <span className="text-[11px] text-emerald-400 font-normal flex items-center space-x-1">
                        <CheckCircle className="w-3 h-3" />
                        <span>{retDepAirportInfo.iata ? `${retDepAirportInfo.iata} • ` : ''}Определен</span>
                      </span>
                    )}
                  </label>
                  <input
                    type="text"
                    value={retDepIcao}
                    onChange={(e) => handleRetDepChange(e.target.value)}
                    onFocus={() => retDepSuggestions.length > 0 && setShowRetDepDropdown(true)}
                    placeholder="ULLI"
                    className="w-full bg-avionics-surface border border-avionics-border rounded-xl px-3 py-2 text-base font-mono font-bold tracking-wider text-sky-400 uppercase focus:outline-none focus:border-sky-500"
                    required={isReturnLegEnabled}
                  />
                  {retDepAirportInfo && (
                    <div className="text-[11px] text-avionics-muted truncate mt-1">
                      {retDepAirportInfo.name}
                    </div>
                  )}
                  {showRetDepDropdown && retDepSuggestions.length > 0 && (
                    <div className="absolute left-0 right-0 top-full mt-1 bg-avionics-card border border-avionics-border rounded-xl shadow-xl z-30 max-h-48 overflow-y-auto divide-y divide-avionics-border">
                      {retDepSuggestions.map((item) => (
                        <button
                          key={item.icao}
                          type="button"
                          onClick={() => {
                            setRetDepIcao(item.icao);
                            setRetDepAirportInfo(item);
                            setShowRetDepDropdown(false);
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

                {/* Return ARR */}
                <div className="relative">
                  <label className="block text-xs font-semibold text-avionics-muted mb-1 flex items-center justify-between">
                    <span>Прилет обратный (ICAO)</span>
                    {retArrAirportInfo && (
                      <span className="text-[11px] text-emerald-400 font-normal flex items-center space-x-1">
                        <CheckCircle className="w-3 h-3" />
                        <span>{retArrAirportInfo.iata ? `${retArrAirportInfo.iata} • ` : ''}Определен</span>
                      </span>
                    )}
                  </label>
                  <input
                    type="text"
                    value={retArrIcao}
                    onChange={(e) => handleRetArrChange(e.target.value)}
                    onFocus={() => retArrSuggestions.length > 0 && setShowRetArrDropdown(true)}
                    placeholder="UUEE"
                    className="w-full bg-avionics-surface border border-avionics-border rounded-xl px-3 py-2 text-base font-mono font-bold tracking-wider text-sky-400 uppercase focus:outline-none focus:border-sky-500"
                    required={isReturnLegEnabled}
                  />
                  {retArrAirportInfo && (
                    <div className="text-[11px] text-avionics-muted truncate mt-1">
                      {retArrAirportInfo.name}
                    </div>
                  )}
                  {showRetArrDropdown && retArrSuggestions.length > 0 && (
                    <div className="absolute left-0 right-0 top-full mt-1 bg-avionics-card border border-avionics-border rounded-xl shadow-xl z-30 max-h-48 overflow-y-auto divide-y divide-avionics-border">
                      {retArrSuggestions.map((item) => (
                        <button
                          key={item.icao}
                          type="button"
                          onClick={() => {
                            setRetArrIcao(item.icao);
                            setRetArrAirportInfo(item);
                            setShowRetArrDropdown(false);
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

              {/* Times for Leg 2 */}
              <div className="bg-avionics-surface border border-avionics-border rounded-2xl p-4 space-y-3">
                <div className="text-xs font-bold uppercase tracking-wider text-avionics-muted flex items-center justify-between">
                  <span>Время обратного рейса (UTC / ZULU)</span>
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
                      value={retOutTimeUtc}
                      onChange={(e) => handleRetOutTimeChange(e.target.value)}
                      className="w-full bg-avionics-card border border-avionics-border rounded-lg px-2 py-1.5 text-sm font-mono text-avionics-text text-center focus:outline-none focus:border-sky-500"
                      required={isReturnLegEnabled}
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-avionics-muted mb-0.5">OFF (Взлёт)</label>
                    <input
                      type="time"
                      value={retOffTimeUtc}
                      onChange={(e) => setRetOffTimeUtc(e.target.value)}
                      className={`w-full bg-avionics-card border rounded-lg px-2 py-1.5 text-sm font-mono text-center focus:outline-none ${
                        validation2.offError
                          ? 'border-rose-500 text-rose-300 ring-1 ring-rose-500/30'
                          : 'border-avionics-border text-avionics-text focus:border-sky-500'
                      }`}
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-avionics-muted mb-0.5">ON (Посадка)</label>
                    <input
                      type="time"
                      value={retOnTimeUtc}
                      onChange={(e) => handleRetOnTimeChange(e.target.value)}
                      className={`w-full bg-avionics-card border rounded-lg px-2 py-1.5 text-sm font-mono text-center focus:outline-none ${
                        validation2.orderError
                          ? 'border-rose-500 text-rose-300 ring-1 ring-rose-500/30'
                          : 'border-avionics-border text-avionics-text focus:border-sky-500'
                      }`}
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-avionics-muted mb-0.5">IN (Колодки)</label>
                    <input
                      type="time"
                      value={retInTimeUtc}
                      onChange={(e) => setRetInTimeUtc(e.target.value)}
                      className={`w-full bg-avionics-card border rounded-lg px-2 py-1.5 text-sm font-mono text-center focus:outline-none ${
                        validation2.inError
                          ? 'border-rose-500 text-rose-300 ring-1 ring-rose-500/30'
                          : 'border-avionics-border text-avionics-text focus:border-sky-500'
                      }`}
                      required={isReturnLegEnabled}
                    />
                  </div>
                </div>

                {/* Validation warning message for return leg */}
                {(validation2.offError || validation2.inError || validation2.orderError) && (
                  <div className="p-2.5 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-center space-x-2">
                    <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
                    <span>
                      {validation2.offError || validation2.inError || validation2.orderError}
                    </span>
                  </div>
                )}

                <div className="pt-2 border-t border-avionics-border flex flex-wrap items-center justify-between gap-3 text-xs">
                  <div className="flex items-center space-x-2">
                    <span className="text-avionics-muted">Время Block Time:</span>
                    <span className="font-mono font-black text-sky-400 text-base">
                      {formatMinutesToHHMM(retTotalMinutes)}
                    </span>
                  </div>

                  <div className="flex items-center space-x-2">
                    <label className="text-xs font-semibold text-avionics-muted flex items-center space-x-1 shrink-0">
                      <Moon className="w-3.5 h-3.5 text-indigo-400" />
                      <span>Ночное время:</span>
                    </label>
                    <input
                      type="text"
                      placeholder="00:00"
                      value={retNightTimeInput}
                      onChange={(e) => setRetNightTimeInput(e.target.value)}
                      className="w-20 bg-avionics-card border border-avionics-border rounded-lg px-2.5 py-1 text-xs font-mono font-bold text-indigo-300 text-center focus:outline-none focus:border-indigo-500"
                    />
                    <button
                      type="button"
                      onClick={calculateReturnNightTimesAuto}
                      className="flex items-center space-x-1 px-2.5 py-1 rounded-lg bg-indigo-500/20 hover:bg-indigo-500/30 text-indigo-300 border border-indigo-500/30 text-[11px] font-semibold transition-colors cursor-pointer"
                      title="Рассчитать ночное время обратного рейса астрономически"
                    >
                      <Sparkles className="w-3 h-3 text-indigo-400" />
                      <span>Авто-расчет</span>
                    </button>
                  </div>
                </div>

                {retCalculatedNightMins !== null && (
                  <div className="mt-2 p-2.5 rounded-xl bg-indigo-500/10 border border-indigo-500/25 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div className="flex items-center space-x-2 text-xs">
                      <Moon className="w-4 h-4 text-indigo-400 shrink-0" />
                      <span className="text-avionics-text font-semibold">
                        Точный расчет ночи:{' '}
                        <strong className="text-indigo-400 font-mono">
                          {retCalculatedNightMins} мин
                        </strong>
                        <span className="text-avionics-muted font-mono ml-1">
                          ({formatMinutesToHHMM(retCalculatedNightMins)})
                        </span>
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setRetNightTimeInput(formatMinutesToHHMM(retCalculatedNightMins))}
                      className="px-2.5 py-1 bg-indigo-500 hover:bg-indigo-400 text-slate-950 font-bold text-2xs rounded-lg transition-all cursor-pointer self-start sm:self-auto shrink-0"
                    >
                      Применить
                    </button>
                  </div>
                )}
              </div>

              {/* Role & Handling Status for Leg 2 */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-avionics-muted mb-1 flex items-center space-x-1">
                    <Shield className="w-3.5 h-3.5 text-sky-400" />
                    <span>Функция в экипаже (Crew Role)</span>
                  </label>
                  <select
                    value={retFlightRole}
                    onChange={(e) => setRetFlightRole(e.target.value as any)}
                    className="w-full bg-avionics-surface border border-avionics-border rounded-xl px-3 py-2 text-sm font-semibold text-avionics-text focus:outline-none focus:border-sky-500"
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
                    value={retFlightHandling}
                    onChange={(e) => setRetFlightHandling(e.target.value as any)}
                    className="w-full bg-avionics-surface border border-avionics-border rounded-xl px-3 py-2 text-sm font-semibold text-avionics-text focus:outline-none focus:border-sky-500"
                  >
                    <option value="PF">PF — Пилотирующий пилот (Pilot Flying)</option>
                    <option value="PM">PM — Мониторящий пилот (Pilot Monitoring)</option>
                    <option value="Observer">Observer — Наблюдатель (Observer)</option>
                    <option value="Relief">Relief — Сменный пилот (Cruise Relief)</option>
                  </select>
                </div>
              </div>

              {/* Landings & Approach for Leg 2 */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-avionics-muted mb-1">Посадки (День)</label>
                  <input
                    type="number"
                    min={0}
                    max={20}
                    value={retLandingsDay}
                    onChange={(e) => setRetLandingsDay(Number(e.target.value))}
                    className="w-full bg-avionics-surface border border-avionics-border rounded-xl px-3 py-2 text-sm font-mono text-avionics-text focus:outline-none focus:border-sky-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-avionics-muted mb-1 flex items-center justify-between">
                    <span>Посадки (Ночь)</span>
                    {retIsNightLandingSuggested && (
                      <span className="text-[10px] text-indigo-400 font-bold uppercase">Авто</span>
                    )}
                  </label>
                  <input
                    type="number"
                    min={0}
                    max={20}
                    value={retLandingsNight}
                    onChange={(e) => setRetLandingsNight(Number(e.target.value))}
                    className={`w-full bg-avionics-surface border rounded-xl px-3 py-2 text-sm font-mono focus:outline-none ${
                      retIsNightLandingSuggested
                        ? 'border-indigo-500/60 text-indigo-300 font-bold'
                        : 'border-avionics-border text-avionics-text focus:border-sky-500'
                    }`}
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-avionics-muted mb-1">Заход (Approach)</label>
                  <input
                    type="text"
                    list="icao-approach-list"
                    value={retApproachType}
                    onChange={(e) => setRetApproachType(e.target.value)}
                    placeholder="ILS CAT I, RNP..."
                    className="w-full bg-avionics-surface border border-avionics-border rounded-xl px-3 py-2 text-sm text-avionics-text focus:outline-none focus:border-sky-500"
                  />
                </div>
              </div>

              {/* Remarks for Leg 2 */}
              <div>
                <label className="block text-xs font-semibold text-avionics-muted mb-1">Заметки / Примечания к обратному рейсу</label>
                <input
                  type="text"
                  value={retRemarks}
                  onChange={(e) => setRetRemarks(e.target.value)}
                  placeholder="Crew, turnaround delay, weather, de-icing..."
                  className="w-full bg-avionics-surface border border-avionics-border rounded-xl px-3 py-2 text-sm text-avionics-text focus:outline-none focus:border-sky-500"
                />
              </div>
            </div>
          )}

          {/* Submit Buttons */}
          <div className="flex items-center justify-end space-x-3 pt-3 border-t border-avionics-border">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 text-sm font-medium text-avionics-muted hover:text-avionics-text rounded-xl hover:bg-avionics-card transition-colors cursor-pointer"
            >
              Отмена
            </button>
            <button
              type="submit"
              disabled={!isFormValid}
              className={`px-6 py-2.5 text-sm font-bold rounded-xl transition-all shadow-lg ${
                !isFormValid
                  ? 'bg-slate-700 text-slate-400 cursor-not-allowed opacity-50 shadow-none'
                  : 'bg-sky-500 hover:bg-sky-400 text-slate-950 shadow-sky-500/25 cursor-pointer'
              }`}
            >
              {isReturnLegEnabled ? 'Сохранить оба рейса (туда и обратно)' : 'Сохранить в лётную книжку'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
