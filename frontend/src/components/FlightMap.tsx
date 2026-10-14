import React, { useEffect, useRef, useState, useMemo } from 'react';
import L from 'leaflet';
import { LocalFlight, LocalAirport } from '../db/db';
import { getGreatCirclePoint } from '../utils/nightCalculator';
import { MAJOR_AIRPORTS } from '../data/majorAirports';
import { airportService } from '../utils/airportService';
import { getNightTerminatorPolygon, calculateDistance } from '../utils/solarTerminator';
import { MapPin, Navigation, Compass, Globe, Loader2, Moon, Sun, Filter, Play, Pause, Layers } from 'lucide-react';

interface FlightMapProps {
  flights: LocalFlight[];
  airports: LocalAirport[];
  theme: 'dark' | 'light';
}

export const FlightMap: React.FC<FlightMapProps> = ({ flights, airports, theme }) => {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const [resolvedAirports, setResolvedAirports] = useState<Map<string, LocalAirport>>(new Map());
  const [loadingAirports, setLoadingAirports] = useState(false);

  // Map layer controls
  const [showTerminator, setShowTerminator] = useState(true);
  const [animateVectors, setAnimateVectors] = useState(true);

  // Filters state
  const [selectedYear, setSelectedYear] = useState<string>('all');
  const [selectedAircraft, setSelectedAircraft] = useState<string>('all');
  const [selectedRole, setSelectedRole] = useState<string>('all');

  // Compute available filter options from flights
  const availableYears = useMemo(() => {
    const years = new Set<string>();
    flights.forEach((f) => {
      if (f.date) years.add(f.date.substring(0, 4));
    });
    return Array.from(years).sort().reverse();
  }, [flights]);

  const availableAircraft = useMemo(() => {
    const types = new Set<string>();
    flights.forEach((f) => {
      if (f.aircraftType) types.add(f.aircraftType.toUpperCase());
    });
    return Array.from(types).sort();
  }, [flights]);

  // Filtered flights
  const filteredFlights = useMemo(() => {
    return flights.filter((f) => {
      if (selectedYear !== 'all' && !f.date.startsWith(selectedYear)) return false;
      if (selectedAircraft !== 'all' && f.aircraftType.toUpperCase() !== selectedAircraft) return false;
      if (selectedRole !== 'all') {
        if (selectedRole === 'PF' && f.flightHandling !== 'PF') return false;
        if (selectedRole === 'PM' && f.flightHandling !== 'PM') return false;
        if (selectedRole === 'Observer' && f.flightHandling !== 'Observer' && f.flightRole !== 'Observer') return false;
        if (selectedRole === 'PIC' && f.flightRole !== 'PIC') return false;
        if (selectedRole === 'SIC' && f.flightRole !== 'SIC') return false;
      }
      return true;
    });
  }, [flights, selectedYear, selectedAircraft, selectedRole]);

  // Extract all unique ICAO codes across all flights
  const allIcaos = useMemo(() => {
    const set = new Set<string>();
    flights.forEach((f) => {
      if (f.depIcao) set.add(f.depIcao.toUpperCase().trim());
      if (f.arrIcao) set.add(f.arrIcao.toUpperCase().trim());
    });
    return Array.from(set);
  }, [flights]);

  // Load and resolve any missing airports
  useEffect(() => {
    let isMounted = true;
    const load = async () => {
      setLoadingAirports(true);
      try {
        const loadedMap = await airportService.preloadAirports(allIcaos);
        if (isMounted) {
          const merged = new Map<string, LocalAirport>();
          MAJOR_AIRPORTS.forEach((a) => merged.set(a.icao.toUpperCase(), a));
          airports.forEach((a) => merged.set(a.icao.toUpperCase(), a));
          loadedMap.forEach((v, k) => merged.set(k.toUpperCase(), v));
          setResolvedAirports(merged);
        }
      } catch (err) {
        console.error('Error preloading airports:', err);
      } finally {
        if (isMounted) setLoadingAirports(false);
      }
    };

    if (allIcaos.length > 0) {
      load();
    }
    return () => {
      isMounted = false;
    };
  }, [allIcaos, airports]);

  // Route counts and stats for filtered flights
  const routeCounts = new Map<string, { count: number; flights: LocalFlight[] }>();
  const visitedAirports = new Set<string>();

  filteredFlights.forEach((f) => {
    const dep = f.depIcao.toUpperCase().trim();
    const arr = f.arrIcao.toUpperCase().trim();
    visitedAirports.add(dep);
    visitedAirports.add(arr);

    const routeKey = `${dep}-${arr}`;
    const existing = routeCounts.get(routeKey) || { count: 0, flights: [] };
    existing.count += 1;
    existing.flights.push(f);
    routeCounts.set(routeKey, existing);
  });

  useEffect(() => {
    if (!mapContainerRef.current) return;

    // Clean up old map instance
    if (mapInstanceRef.current) {
      mapInstanceRef.current.remove();
      mapInstanceRef.current = null;
    }

    // Initialize Leaflet map
    const map = L.map(mapContainerRef.current, {
      center: [52, 35],
      zoom: 3,
      minZoom: 2,
      maxZoom: 13,
      zoomControl: true,
      attributionControl: false,
    });
    mapInstanceRef.current = map;

    // Base Tile Layer (100% Free - Esri Gray Canvas & OpenStreetMap)
    let tileUrl = 'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}';
    if (theme === 'light') {
      tileUrl = 'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}';
    }

    const tileLayer = L.tileLayer(tileUrl, { maxZoom: 19, subdomains: 'abc' }).addTo(map);

    tileLayer.on('tileerror', () => {
      L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19 }).addTo(map);
    });

    // 1. Day / Night Solar Terminator Shadow Layer
    if (showTerminator) {
      try {
        const terminatorCoords = getNightTerminatorPolygon(new Date());
        L.polygon(terminatorCoords, {
          fillColor: theme === 'dark' ? '#000000' : '#0B0F19',
          fillOpacity: theme === 'dark' ? 0.38 : 0.22,
          stroke: true,
          color: theme === 'dark' ? '#38BDF8' : '#0284C7',
          weight: 1,
          opacity: 0.35,
          interactive: false,
        }).addTo(map);
      } catch (err) {
        console.error('Terminator render error:', err);
      }
    }

    const bounds = L.latLngBounds([]);
    let pointsAdded = 0;

    const lineColor = theme === 'light' ? '#0284C7' : '#38BDF8';
    const markerColor = theme === 'light' ? '#0F172A' : '#F8FAFC';
    const markerBorder = theme === 'light' ? '#CBD5E1' : '#0B0F19';

    // 2. Draw Great Circle Flight Vector Lines
    routeCounts.forEach(({ count, flights: routeFlights }, routeKey) => {
      const [depIcao, arrIcao] = routeKey.split('-');
      const depAirport = resolvedAirports.get(depIcao);
      const arrAirport = resolvedAirports.get(arrIcao);

      if (depAirport && arrAirport) {
        const distance = calculateDistance(
          depAirport.latitude,
          depAirport.longitude,
          arrAirport.latitude,
          arrAirport.longitude
        );

        // Sample points along Great Circle arc
        const numSteps = 24;
        const latLngs: [number, number][] = [];

        for (let i = 0; i <= numSteps; i++) {
          const pt = getGreatCirclePoint(
            { latitude: depAirport.latitude, longitude: depAirport.longitude },
            { latitude: arrAirport.latitude, longitude: arrAirport.longitude },
            i / numSteps
          );
          latLngs.push([pt.latitude, pt.longitude]);
        }

        // Draw vector line
        const polyline = L.polyline(latLngs, {
          color: lineColor,
          weight: Math.min(2.5 + count * 0.7, 7),
          opacity: 0.88,
          lineCap: 'round',
          lineJoin: 'round',
          className: animateVectors ? 'animated-flight-line' : '',
        }).addTo(map);

        const aircraftTypes = Array.from(new Set(routeFlights.map((f) => f.aircraftType))).join(', ');
        const latestFlight = routeFlights[0];

        polyline.bindPopup(`
          <div style="font-family: system-ui, sans-serif; font-size: 13px; line-height: 1.5; padding: 6px; min-width: 180px;">
            <div style="font-size: 15px; font-weight: 800; font-family: monospace; color: ${lineColor};">
              ${depIcao} &rarr; ${arrIcao}
            </div>
            <div style="margin-top: 3px; font-size: 12px; color: #64748B;">
              ${depAirport.name} &rarr; ${arrAirport.name}
            </div>
            
            <div style="margin-top: 8px; padding-top: 6px; border-top: 1px solid #E2E8F0; font-size: 12px;">
              <div>Дистанция: <strong style="font-family: monospace; color: ${lineColor};">${distance.nm} NM</strong> (${distance.km} км)</div>
              <div>Рейсов выполнено: <strong>${count}</strong></div>
              <div>Тип ВС: <strong>${aircraftTypes || 'A320'}</strong></div>
              ${latestFlight ? `<div style="font-size: 11px; color: #64748B; margin-top: 2px;">Крайний рейс: ${latestFlight.date}</div>` : ''}
            </div>
          </div>
        `);
      }
    });

    // 3. Draw Visited Airport Pins
    visitedAirports.forEach((icao) => {
      const airport = resolvedAirports.get(icao);
      if (airport) {
        bounds.extend([airport.latitude, airport.longitude]);
        pointsAdded++;

        // Airport circle marker
        const marker = L.circleMarker([airport.latitude, airport.longitude], {
          radius: 7,
          fillColor: markerColor,
          color: markerBorder,
          weight: 2,
          opacity: 1,
          fillOpacity: 0.95,
        }).addTo(map);

        const depCount = filteredFlights.filter((f) => f.depIcao.toUpperCase() === icao).length;
        const arrCount = filteredFlights.filter((f) => f.arrIcao.toUpperCase() === icao).length;

        marker.bindPopup(`
          <div style="font-family: system-ui, sans-serif; font-size: 13px; padding: 6px; min-width: 190px;">
            <div style="font-weight: 900; font-size: 17px; color: ${lineColor}; font-family: monospace;">
              ${airport.icao} ${airport.iata ? `(${airport.iata})` : ''}
            </div>
            <div style="font-size: 13px; font-weight: 600; margin-top: 2px;">${airport.name}</div>
            <div style="font-size: 11px; margin-top: 4px; color: #64748B; font-family: monospace;">
              ${airport.latitude.toFixed(3)}°, ${airport.longitude.toFixed(3)}°
            </div>
            <div style="margin-top: 8px; padding-top: 6px; border-top: 1px solid #E2E8F0; font-size: 12px;">
              Вылетов: <strong>${depCount}</strong> | Прилетов: <strong>${arrCount}</strong>
            </div>
          </div>
        `);
      }
    });

    if (pointsAdded > 1) {
      map.fitBounds(bounds, { padding: [60, 60], maxZoom: 7 });
    } else if (pointsAdded === 1) {
      map.setView(bounds.getCenter(), 5);
    }

    const timer = setTimeout(() => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.invalidateSize();
      }
    }, 250);

    return () => {
      clearTimeout(timer);
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, [filteredFlights, resolvedAirports, theme, showTerminator, animateVectors]);

  return (
    <div className="space-y-4">
      {/* Map Stats Header */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="p-4 bg-avionics-surface border border-avionics-border rounded-2xl shadow-sm flex items-center space-x-3.5">
          <div className="p-2.5 rounded-xl bg-sky-500/10 text-sky-400">
            <MapPin className="w-5 h-5" />
          </div>
          <div>
            <div className="text-xs text-avionics-muted font-semibold uppercase">Аэродромов</div>
            <div className="text-2xl font-black font-mono text-avionics-text">{visitedAirports.size}</div>
          </div>
        </div>

        <div className="p-4 bg-avionics-surface border border-avionics-border rounded-2xl shadow-sm flex items-center space-x-3.5">
          <div className="p-2.5 rounded-xl bg-indigo-500/10 text-indigo-400">
            <Navigation className="w-5 h-5" />
          </div>
          <div>
            <div className="text-xs text-avionics-muted font-semibold uppercase">Маршрутов</div>
            <div className="text-2xl font-black font-mono text-avionics-text">{routeCounts.size}</div>
          </div>
        </div>

        <div className="p-4 bg-avionics-surface border border-avionics-border rounded-2xl shadow-sm flex items-center space-x-3.5">
          <div className="p-2.5 rounded-xl bg-emerald-500/10 text-emerald-400">
            <Compass className="w-5 h-5" />
          </div>
          <div>
            <div className="text-xs text-avionics-muted font-semibold uppercase">Рейсов на карте</div>
            <div className="text-2xl font-black font-mono text-avionics-text">{filteredFlights.length}</div>
          </div>
        </div>

        <div className="p-4 bg-avionics-surface border border-avionics-border rounded-2xl shadow-sm flex items-center space-x-3.5">
          <div className="p-2.5 rounded-xl bg-amber-500/10 text-amber-400">
            <Globe className="w-5 h-5" />
          </div>
          <div>
            <div className="text-xs text-avionics-muted font-semibold uppercase">Слой карты</div>
            <div className="text-sm font-bold text-avionics-text">
              {loadingAirports ? (
                <span className="flex items-center space-x-1 text-sky-400">
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Поиск координат...</span>
                </span>
              ) : (
                'Great Circle + NM'
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Map Control Toolbar & Filters */}
      <div className="p-3 bg-avionics-surface border border-avionics-border rounded-2xl flex flex-wrap items-center justify-between gap-3 text-xs">
        {/* Left: Filters */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center space-x-1.5 text-avionics-muted font-semibold">
            <Filter className="w-3.5 h-3.5 text-sky-400" />
            <span>Фильтры:</span>
          </div>

          {/* Year Filter */}
          <select
            value={selectedYear}
            onChange={(e) => setSelectedYear(e.target.value)}
            className="bg-avionics-card border border-avionics-border rounded-lg px-2.5 py-1.5 text-xs text-avionics-text font-medium focus:outline-none focus:border-sky-500"
          >
            <option value="all">Все года ({flights.length})</option>
            {availableYears.map((yr) => (
              <option key={yr} value={yr}>
                {yr} год
              </option>
            ))}
          </select>

          {/* Aircraft Filter */}
          <select
            value={selectedAircraft}
            onChange={(e) => setSelectedAircraft(e.target.value)}
            className="bg-avionics-card border border-avionics-border rounded-lg px-2.5 py-1.5 text-xs text-avionics-text font-medium focus:outline-none focus:border-sky-500"
          >
            <option value="all">Все ВС</option>
            {availableAircraft.map((type) => (
              <option key={type} value={type}>
                {type}
              </option>
            ))}
          </select>

          {/* Role Filter */}
          <select
            value={selectedRole}
            onChange={(e) => setSelectedRole(e.target.value)}
            className="bg-avionics-card border border-avionics-border rounded-lg px-2.5 py-1.5 text-xs text-avionics-text font-medium focus:outline-none focus:border-sky-500"
          >
            <option value="all">Все роли</option>
            <option value="PF">Только PF (Пилотирующий)</option>
            <option value="PM">Только PM (Мониторящий)</option>
            <option value="Observer">Observer (Наблюдатель)</option>
            <option value="PIC">PIC (КВС)</option>
            <option value="SIC">SIC (2-й пилот)</option>
          </select>
        </div>

        {/* Right: Layers and Animation Toggles */}
        <div className="flex items-center space-x-2">
          {/* Solar Terminator Toggle */}
          <button
            type="button"
            onClick={() => setShowTerminator(!showTerminator)}
            className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg border text-xs font-semibold transition-all ${
              showTerminator
                ? 'bg-indigo-500/20 text-indigo-300 border-indigo-500/40 shadow-sm'
                : 'bg-avionics-card text-avionics-muted border-avionics-border hover:text-avionics-text'
            }`}
            title="Отображать астрономическую границу дня и ночи (Терминатор)"
          >
            <Moon className="w-3.5 h-3.5 text-indigo-400" />
            <span>Терминатор: {showTerminator ? 'Вкл' : 'Выкл'}</span>
          </button>

          {/* Vector Animation Toggle */}
          <button
            type="button"
            onClick={() => setAnimateVectors(!animateVectors)}
            className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg border text-xs font-semibold transition-all ${
              animateVectors
                ? 'bg-sky-500/20 text-sky-400 border-sky-500/40 shadow-sm'
                : 'bg-avionics-card text-avionics-muted border-avionics-border hover:text-avionics-text'
            }`}
            title="Анимация движения по векторам маршрутов"
          >
            {animateVectors ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
            <span>Анимация: {animateVectors ? 'Вкл' : 'Выкл'}</span>
          </button>
        </div>
      </div>

      {/* Interactive Map Canvas */}
      <div className="bg-avionics-surface border border-avionics-border rounded-2xl overflow-hidden shadow-lg h-[520px] md:h-[620px] relative">
        <div ref={mapContainerRef} className="w-full h-full" />
      </div>
    </div>
  );
};
