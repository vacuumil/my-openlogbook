import React, { useEffect, useRef, useState, useMemo } from 'react';
import L from 'leaflet';
import { escapeHtml } from '../utils/escapeHtml';
import { LocalFlight, LocalAirport } from '../db/db';
import { getGreatCirclePoint } from '../utils/nightCalculator';
import { MAJOR_AIRPORTS } from '../data/majorAirports';
import { airportService } from '../utils/airportService';
import { getNightTerminatorPolygon, calculateDistance } from '../utils/solarTerminator';
import {
  MapPin,
  Navigation,
  Compass,
  Globe,
  Loader2,
  Moon,
  Sun,
  Filter,
  Play,
  Pause,
  Layers,
  ChevronDown,
  ChevronUp,
  RotateCcw,
} from 'lucide-react';

interface FlightMapProps {
  flights: LocalFlight[];
  airports: LocalAirport[];
  theme: 'dark' | 'light';
  variant?: 'standalone' | 'dashboard';
  onOpenFullMap?: () => void;
}

export const FlightMap: React.FC<FlightMapProps> = ({
  flights,
  airports,
  theme,
  variant = 'standalone',
  onOpenFullMap,
}) => {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const [resolvedAirports, setResolvedAirports] = useState<Map<string, LocalAirport>>(() => {
    const initial = new Map<string, LocalAirport>();
    MAJOR_AIRPORTS.forEach((a) => initial.set(a.icao.toUpperCase(), a));
    return initial;
  });
  const [loadingAirports, setLoadingAirports] = useState(false);

  // Map layer controls
  const [mapStyle, setMapStyle] = useState<'light' | 'satellite' | 'dark'>(() => {
    try {
      const saved = localStorage.getItem('openlogbook_map_style');
      if (saved === 'light' || saved === 'satellite' || saved === 'dark') return saved;
    } catch {}
    return 'light';
  });

  const handleMapStyleChange = (style: 'light' | 'satellite' | 'dark') => {
    setMapStyle(style);
    try {
      localStorage.setItem('openlogbook_map_style', style);
    } catch {}
  };

  const [showTerminator, setShowTerminator] = useState(true);
  const [animateVectors, setAnimateVectors] = useState(true);
  const [isMobileControlsOpen, setIsMobileControlsOpen] = useState(false);

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
      scrollWheelZoom: false,
    });
    mapInstanceRef.current = map;

    // Base Tile Layer (100% Free - Never requires an API key)
    let tileUrl = 'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}';
    if (mapStyle === 'satellite') {
      tileUrl = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';
    } else if (mapStyle === 'dark') {
      tileUrl = 'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}';
    }

    const tileLayer = L.tileLayer(tileUrl, {
      maxZoom: 19,
      subdomains: 'abc',
      attribution: '&copy; <a href="https://www.esri.com/">Esri</a>',
    }).addTo(map);

    tileLayer.on('tileerror', () => {
      const fallbackUrl = mapStyle === 'dark'
        ? 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png'
        : 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png';
      L.tileLayer(fallbackUrl, { maxZoom: 19 }).addTo(map);
    });

    const isLight = mapStyle === 'light';

    // 1. Day / Night Solar Terminator Shadow Layer
    if (showTerminator) {
      try {
        const terminatorCoords = getNightTerminatorPolygon(new Date());
        L.polygon(terminatorCoords, {
          fillColor: isLight ? '#0B0F19' : '#000000',
          fillOpacity: isLight ? 0.12 : 0.35,
          stroke: true,
          color: isLight ? '#0284C7' : '#38BDF8',
          weight: 1,
          opacity: isLight ? 0.22 : 0.35,
          interactive: false,
        }).addTo(map);
      } catch (err) {
        console.error('Terminator render error:', err);
      }
    }

    const bounds = L.latLngBounds([]);
    let pointsAdded = 0;

    const haloColor = isLight ? '#38BDF8' : '#00F0FF';
    const coreColor = isLight ? '#0369A1' : '#38BDF8';

    // 2. Draw Premium Great Circle Flight Vectors (Dual-Layer Glow + Direction Arrows)
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

        // Ultra-smooth Great Circle arc (48 steps)
        const numSteps = 48;
        const latLngs: [number, number][] = [];

        for (let i = 0; i <= numSteps; i++) {
          const pt = getGreatCirclePoint(
            { latitude: depAirport.latitude, longitude: depAirport.longitude },
            { latitude: arrAirport.latitude, longitude: arrAirport.longitude },
            i / numSteps
          );
          latLngs.push([pt.latitude, pt.longitude]);
        }

        // Layer A: Soft Neon Halo Glow Layer
        L.polyline(latLngs, {
          color: haloColor,
          weight: Math.min(6 + count * 1.5, 13),
          opacity: isLight ? 0.28 : 0.38,
          lineCap: 'round',
          lineJoin: 'round',
          interactive: false,
        }).addTo(map);

        // Layer B: Core Vector Line
        const polyline = L.polyline(latLngs, {
          color: coreColor,
          weight: Math.min(2.2 + count * 0.6, 5.5),
          opacity: 0.95,
          lineCap: 'round',
          lineJoin: 'round',
          className: animateVectors ? 'animated-flight-line' : '',
        }).addTo(map);

        // Layer C: Midpoint Flight Track Direction Arrow
        if (latLngs.length >= 3) {
          const midIdx = Math.floor(latLngs.length / 2);
          const p1 = latLngs[midIdx - 1];
          const p2 = latLngs[midIdx + 1];
          const dLon = (p2[1] - p1[1]) * Math.cos(((p1[0] + p2[0]) / 2) * (Math.PI / 180));
          const dLat = p2[0] - p1[0];
          const angleDeg = (Math.atan2(dLon, dLat) * 180) / Math.PI;

          const arrowIcon = L.divIcon({
            className: 'flight-vector-arrow',
            html: `<div style="transform: rotate(${angleDeg.toFixed(1)}deg); width: 14px; height: 14px; display: flex; align-items: center; justify-content: center;">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="${coreColor}" style="filter: drop-shadow(0 1px 2px rgba(0,0,0,0.5));">
                <path d="M12 2L4 21l8-4 8 4L12 2z"/>
              </svg>
            </div>`,
            iconSize: [14, 14],
            iconAnchor: [7, 7],
          });
          L.marker(latLngs[midIdx], { icon: arrowIcon, interactive: false }).addTo(map);
        }

        const aircraftTypes = Array.from(new Set(routeFlights.map((f) => f.aircraftType))).join(', ');
        const latestFlight = routeFlights[0];

        polyline.bindPopup(`
          <div style="font-family: system-ui, sans-serif; font-size: 13px; line-height: 1.5; padding: 6px; min-width: 180px;">
            <div style="font-size: 15px; font-weight: 800; font-family: monospace; color: ${coreColor};">
              ${escapeHtml(depIcao)} &rarr; ${escapeHtml(arrIcao)}
            </div>
            <div style="margin-top: 3px; font-size: 12px; color: #64748B;">
              ${escapeHtml(depAirport.name)} &rarr; ${escapeHtml(arrAirport.name)}
            </div>
            
            <div style="margin-top: 8px; padding-top: 6px; border-top: 1px solid #E2E8F0; font-size: 12px;">
              <div>Дистанция: <strong style="font-family: monospace; color: ${coreColor};">${distance.nm} NM</strong> (${distance.km} км)</div>
              <div>Рейсов выполнено: <strong>${count}</strong></div>
              <div>Тип ВС: <strong>${escapeHtml(aircraftTypes || 'A320')}</strong></div>
              ${latestFlight ? `<div style="font-size: 11px; color: #64748B; margin-top: 2px;">Крайний рейс: ${escapeHtml(latestFlight.date)}</div>` : ''}
            </div>
          </div>
        `);
      }
    });

    // 3. Draw Visited Airport Hubs with Permanent ICAO Labels
    visitedAirports.forEach((icao) => {
      const airport = resolvedAirports.get(icao);
      if (airport) {
        bounds.extend([airport.latitude, airport.longitude]);
        pointsAdded++;

        const depCount = filteredFlights.filter((f) => f.depIcao.toUpperCase() === icao).length;
        const arrCount = filteredFlights.filter((f) => f.arrIcao.toUpperCase() === icao).length;

        // Permanent ICAO Badge + Radar Dot
        const airportIcon = L.divIcon({
          className: 'airport-hub-marker',
          html: `
            <div class="airport-marker-container">
              <div class="airport-marker-badge ${isLight ? 'light' : 'dark'}">
                <span>${escapeHtml(icao)}</span>
              </div>
              <div class="airport-dot-anchor">
                <div class="airport-dot-pulse ${isLight ? 'light' : 'dark'}"></div>
                <div class="airport-dot-core ${isLight ? 'light' : 'dark'}"></div>
              </div>
            </div>
          `,
          iconSize: [54, 34],
          iconAnchor: [27, 28],
          popupAnchor: [0, -28],
        });

        const marker = L.marker([airport.latitude, airport.longitude], {
          icon: airportIcon,
          zIndexOffset: 100,
        }).addTo(map);

        marker.bindPopup(`
          <div style="font-family: system-ui, sans-serif; font-size: 13px; padding: 6px; min-width: 190px;">
            <div style="font-weight: 900; font-size: 17px; color: ${coreColor}; font-family: monospace;">
              ${escapeHtml(airport.icao)} ${airport.iata ? `(${escapeHtml(airport.iata)})` : ''}
            </div>
            <div style="font-size: 13px; font-weight: 600; margin-top: 2px;">${escapeHtml(airport.name)}</div>
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
      map.fitBounds(bounds, { padding: [60, 60], maxZoom: 7, animate: false });
    } else if (pointsAdded === 1) {
      map.setView(bounds.getCenter(), 5, { animate: false });
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
  }, [filteredFlights, resolvedAirports, theme, showTerminator, animateVectors, mapStyle]);

  const hasActiveFilters = selectedYear !== 'all' || selectedAircraft !== 'all' || selectedRole !== 'all';
  const resetFilters = () => {
    setSelectedYear('all');
    setSelectedAircraft('all');
    setSelectedRole('all');
  };

  if (variant === 'dashboard') {
    return (
      <div className="relative w-full h-[300px] sm:h-[400px] md:h-[500px] rounded-2xl overflow-hidden border border-avionics-border shadow-inner group">
        <div ref={mapContainerRef} className="w-full h-full" />

        {/* Floating Dashboard Overlay Controls (Top-Right) */}
        <div className="absolute top-3 right-3 z-[400] flex items-center space-x-2">
          {/* Quick 3-Way Map Layer Toggle */}
          <div className="flex items-center p-0.5 rounded-xl bg-slate-900/90 backdrop-blur-md border border-avionics-border/80 shadow-lg text-2xs font-semibold">
            <button
              type="button"
              onClick={() => handleMapStyleChange('light')}
              className={`px-2 py-1 rounded-lg transition-all cursor-pointer flex items-center space-x-1 ${
                mapStyle === 'light'
                  ? 'bg-sky-500 text-slate-950 font-bold shadow-sm'
                  : 'text-slate-300 hover:text-white'
              }`}
              title="Светлая картографическая основа"
            >
              <Sun className="w-3 h-3" />
              <span className="hidden xs:inline">Светлая</span>
            </button>
            <button
              type="button"
              onClick={() => handleMapStyleChange('satellite')}
              className={`px-2 py-1 rounded-lg transition-all cursor-pointer flex items-center space-x-1 ${
                mapStyle === 'satellite'
                  ? 'bg-amber-500 text-slate-950 font-bold shadow-sm'
                  : 'text-slate-300 hover:text-white'
              }`}
              title="Спутниковый снимок HD"
            >
              <Layers className="w-3 h-3" />
              <span className="hidden xs:inline">Спутник</span>
            </button>
            <button
              type="button"
              onClick={() => handleMapStyleChange('dark')}
              className={`px-2 py-1 rounded-lg transition-all cursor-pointer flex items-center space-x-1 ${
                mapStyle === 'dark'
                  ? 'bg-sky-500 text-slate-950 font-bold shadow-sm'
                  : 'text-slate-300 hover:text-white'
              }`}
              title="Тёмная приборная схема"
            >
              <Moon className="w-3 h-3" />
              <span className="hidden xs:inline">Тёмная</span>
            </button>
          </div>

          {/* Quick Jump to Full Map Tab */}
          {onOpenFullMap && (
            <button
              type="button"
              onClick={onOpenFullMap}
              className="flex items-center space-x-1 px-3 py-1.5 rounded-xl text-xs font-bold bg-slate-900/85 backdrop-blur-md text-sky-400 border border-sky-500/30 hover:bg-sky-500/20 hover:border-sky-500/60 shadow-lg transition-all cursor-pointer"
              title="Открыть карту со всеми фильтрами и деталями"
            >
              <Filter className="w-3.5 h-3.5" />
              <span className="hidden xs:inline">Фильтры</span>
              <span className="xs:hidden">Карта</span>
            </button>
          )}
        </div>

        {/* Floating Route Counter Badge (Bottom-Left) */}
        <div className="absolute bottom-3 left-3 z-[400] bg-slate-900/85 backdrop-blur-md border border-avionics-border/80 px-2.5 py-1 rounded-xl text-2xs text-avionics-muted font-mono flex items-center space-x-2 shadow-lg">
          <span className="flex items-center space-x-1 text-sky-400 font-bold">
            <Compass className="w-3.5 h-3.5" />
            <span>{routeCounts.size} маршрутов</span>
          </span>
          <span className="text-avionics-border">•</span>
          <span>{visitedAirports.size} аэродромов</span>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3 sm:space-y-4">
      {/* Map Stats Header */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 sm:gap-3">
        <div className="p-3 sm:p-4 bg-avionics-surface border border-avionics-border rounded-2xl shadow-sm flex items-center space-x-3 min-w-0 overflow-hidden">
          <div className="p-2 sm:p-2.5 rounded-xl bg-sky-500/10 text-sky-400 shrink-0">
            <MapPin className="w-4 sm:w-5 h-4 sm:h-5" />
          </div>
          <div className="min-w-0">
            <div className="text-2xs sm:text-xs text-avionics-muted font-semibold uppercase truncate">Аэродромов</div>
            <div className="text-lg sm:text-2xl font-black font-mono text-avionics-text truncate">{visitedAirports.size}</div>
          </div>
        </div>

        <div className="p-3 sm:p-4 bg-avionics-surface border border-avionics-border rounded-2xl shadow-sm flex items-center space-x-3 min-w-0 overflow-hidden">
          <div className="p-2 sm:p-2.5 rounded-xl bg-indigo-500/10 text-indigo-400 shrink-0">
            <Navigation className="w-4 sm:w-5 h-4 sm:h-5" />
          </div>
          <div className="min-w-0">
            <div className="text-2xs sm:text-xs text-avionics-muted font-semibold uppercase truncate">Маршрутов</div>
            <div className="text-lg sm:text-2xl font-black font-mono text-avionics-text truncate">{routeCounts.size}</div>
          </div>
        </div>

        <div className="p-3 sm:p-4 bg-avionics-surface border border-avionics-border rounded-2xl shadow-sm flex items-center space-x-3 min-w-0 overflow-hidden">
          <div className="p-2 sm:p-2.5 rounded-xl bg-emerald-500/10 text-emerald-400 shrink-0">
            <Compass className="w-4 sm:w-5 h-4 sm:h-5" />
          </div>
          <div className="min-w-0">
            <div className="text-2xs sm:text-xs text-avionics-muted font-semibold uppercase truncate">Рейсов на карте</div>
            <div className="text-lg sm:text-2xl font-black font-mono text-avionics-text truncate">{filteredFlights.length}</div>
          </div>
        </div>

        <div className="p-3 sm:p-4 bg-avionics-surface border border-avionics-border rounded-2xl shadow-sm flex items-center space-x-3 min-w-0 overflow-hidden">
          <div className="p-2 sm:p-2.5 rounded-xl bg-amber-500/10 text-amber-400 shrink-0">
            <Globe className="w-4 sm:w-5 h-4 sm:h-5" />
          </div>
          <div className="min-w-0">
            <div className="text-2xs sm:text-xs text-avionics-muted font-semibold uppercase truncate">Слой карты</div>
            <div className="text-xs sm:text-sm font-bold text-avionics-text truncate">
              {loadingAirports ? (
                <span className="flex items-center space-x-1 text-sky-400">
                  <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />
                  <span className="truncate">Поиск...</span>
                </span>
              ) : (
                mapStyle === 'light' ? 'Светлая карта' : mapStyle === 'satellite' ? 'Спутник HD' : 'Тёмная карта'
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Map Control Toolbar & Filters */}
      <div className="bg-avionics-surface border border-avionics-border rounded-2xl overflow-hidden shadow-sm">
        {/* Main Bar (Always Visible) */}
        <div className="p-2.5 sm:p-3 flex items-center justify-between gap-2 text-xs">
          {/* Left: Quick Summary / Title */}
          <div className="flex items-center space-x-2 min-w-0">
            <span className="p-1.5 rounded-lg bg-sky-500/10 text-sky-400 shrink-0">
              <Navigation className="w-4 h-4" />
            </span>
            <span className="font-semibold text-avionics-text truncate text-xs">
              {filteredFlights.length} {filteredFlights.length === 1 ? 'рейс' : 'рейсов'}
            </span>
            {hasActiveFilters && (
              <button
                onClick={resetFilters}
                className="hidden xs:inline-flex items-center space-x-1 px-2 py-0.5 rounded-md text-2xs font-semibold bg-rose-500/10 text-rose-400 border border-rose-500/20 cursor-pointer"
                title="Сбросить фильтры"
              >
                <RotateCcw className="w-3 h-3" />
                <span>Сброс</span>
              </button>
            )}
          </div>

          {/* Right: Quick actions */}
          <div className="flex items-center space-x-1.5 shrink-0">
            {/* Quick 3-Way Map Layer Toggle */}
            <div className="flex items-center p-0.5 rounded-xl bg-avionics-card border border-avionics-border shadow-sm text-xs font-semibold">
              <button
                type="button"
                onClick={() => handleMapStyleChange('light')}
                className={`px-2.5 py-1 rounded-lg transition-all cursor-pointer flex items-center space-x-1 ${
                  mapStyle === 'light'
                    ? 'bg-sky-500 text-slate-950 font-bold shadow-sm'
                    : 'text-avionics-muted hover:text-avionics-text'
                }`}
                title="Светлая карта"
              >
                <Sun className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Светлая</span>
              </button>
              <button
                type="button"
                onClick={() => handleMapStyleChange('satellite')}
                className={`px-2.5 py-1 rounded-lg transition-all cursor-pointer flex items-center space-x-1 ${
                  mapStyle === 'satellite'
                    ? 'bg-amber-500 text-slate-950 font-bold shadow-sm'
                    : 'text-avionics-muted hover:text-avionics-text'
                }`}
                title="Спутник HD"
              >
                <Layers className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Спутник HD</span>
                <span className="sm:hidden">Спутник</span>
              </button>
              <button
                type="button"
                onClick={() => handleMapStyleChange('dark')}
                className={`px-2.5 py-1 rounded-lg transition-all cursor-pointer flex items-center space-x-1 ${
                  mapStyle === 'dark'
                    ? 'bg-sky-500 text-slate-950 font-bold shadow-sm'
                    : 'text-avionics-muted hover:text-avionics-text'
                }`}
                title="Тёмная карта"
              >
                <Moon className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Тёмная</span>
              </button>
            </div>

            {/* Mobile Filter Toggle Button */}
            <button
              type="button"
              onClick={() => setIsMobileControlsOpen(!isMobileControlsOpen)}
              className={`md:hidden flex items-center space-x-1 px-2.5 py-1.5 rounded-xl border text-xs font-semibold transition-all cursor-pointer ${
                isMobileControlsOpen || hasActiveFilters
                  ? 'bg-sky-500/20 text-sky-400 border-sky-500/40 shadow-sm'
                  : 'bg-avionics-card text-avionics-muted border-avionics-border hover:text-avionics-text'
              }`}
            >
              <Filter className="w-3.5 h-3.5" />
              <span>Фильтры</span>
              {hasActiveFilters && (
                <span className="w-1.5 h-1.5 rounded-full bg-sky-400 animate-pulse" />
              )}
              {isMobileControlsOpen ? (
                <ChevronUp className="w-3.5 h-3.5 ml-0.5" />
              ) : (
                <ChevronDown className="w-3.5 h-3.5 ml-0.5" />
              )}
            </button>
          </div>
        </div>

        {/* Collapsible Mobile Controls (Drawer) */}
        {isMobileControlsOpen && (
          <div className="md:hidden p-3 border-t border-avionics-border bg-avionics-card/50 space-y-3 animate-in fade-in duration-150">
            <div className="grid grid-cols-1 xs:grid-cols-3 gap-2">
              <div>
                <label className="block text-[11px] font-semibold text-avionics-muted mb-1">Год полета</label>
                <select
                  value={selectedYear}
                  onChange={(e) => setSelectedYear(e.target.value)}
                  className="w-full bg-avionics-surface border border-avionics-border rounded-xl px-2.5 py-2 text-xs text-avionics-text font-medium focus:outline-none focus:border-sky-500"
                >
                  <option value="all">Все года ({flights.length})</option>
                  {availableYears.map((yr) => (
                    <option key={yr} value={yr}>{yr} год</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-avionics-muted mb-1">Тип ВС</label>
                <select
                  value={selectedAircraft}
                  onChange={(e) => setSelectedAircraft(e.target.value)}
                  className="w-full bg-avionics-surface border border-avionics-border rounded-xl px-2.5 py-2 text-xs text-avionics-text font-medium focus:outline-none focus:border-sky-500"
                >
                  <option value="all">Все ВС</option>
                  {availableAircraft.map((type) => (
                    <option key={type} value={type}>{type}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-avionics-muted mb-1">Роль / Ротация</label>
                <select
                  value={selectedRole}
                  onChange={(e) => setSelectedRole(e.target.value)}
                  className="w-full bg-avionics-surface border border-avionics-border rounded-xl px-2.5 py-2 text-xs text-avionics-text font-medium focus:outline-none focus:border-sky-500"
                >
                  <option value="all">Все роли</option>
                  <option value="PF">PF (Пилотирующий)</option>
                  <option value="PM">PM (Мониторящий)</option>
                  <option value="Observer">Observer</option>
                  <option value="PIC">PIC (КВС)</option>
                  <option value="SIC">SIC (2-й пилот)</option>
                </select>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-avionics-border/60">
              <div className="flex items-center space-x-2">
                <button
                  type="button"
                  onClick={() => setShowTerminator(!showTerminator)}
                  className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-xl border text-2xs font-semibold transition-all cursor-pointer ${
                    showTerminator
                      ? 'bg-indigo-500/20 text-indigo-300 border-indigo-500/40'
                      : 'bg-avionics-surface text-avionics-muted border-avionics-border'
                  }`}
                >
                  <Moon className="w-3 h-3 text-indigo-400" />
                  <span>Терминатор: {showTerminator ? 'Вкл' : 'Выкл'}</span>
                </button>

                <button
                  type="button"
                  onClick={() => setAnimateVectors(!animateVectors)}
                  className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-xl border text-2xs font-semibold transition-all cursor-pointer ${
                    animateVectors
                      ? 'bg-sky-500/20 text-sky-400 border-sky-500/40'
                      : 'bg-avionics-surface text-avionics-muted border-avionics-border'
                  }`}
                >
                  {animateVectors ? <Pause className="w-3 h-3" /> : <Play className="w-3 h-3" />}
                  <span>Анимация: {animateVectors ? 'Вкл' : 'Выкл'}</span>
                </button>
              </div>

              {hasActiveFilters && (
                <button
                  type="button"
                  onClick={resetFilters}
                  className="flex items-center space-x-1 text-2xs text-rose-400 font-semibold py-1 px-2.5 rounded-lg bg-rose-500/10 border border-rose-500/20 cursor-pointer"
                >
                  <RotateCcw className="w-3 h-3" />
                  <span>Сбросить всё</span>
                </button>
              )}
            </div>
          </div>
        )}

        {/* Desktop Controls (Inline, hidden on mobile) */}
        <div className="hidden md:flex p-3 border-t border-avionics-border items-center justify-between gap-3 text-xs">
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center space-x-1.5 text-avionics-muted font-semibold">
              <Filter className="w-3.5 h-3.5 text-sky-400" />
              <span>Фильтры:</span>
            </div>

            <select
              value={selectedYear}
              onChange={(e) => setSelectedYear(e.target.value)}
              className="bg-avionics-card border border-avionics-border rounded-lg px-2.5 py-1.5 text-xs text-avionics-text font-medium focus:outline-none focus:border-sky-500"
            >
              <option value="all">Все года ({flights.length})</option>
              {availableYears.map((yr) => (
                <option key={yr} value={yr}>{yr} год</option>
              ))}
            </select>

            <select
              value={selectedAircraft}
              onChange={(e) => setSelectedAircraft(e.target.value)}
              className="bg-avionics-card border border-avionics-border rounded-lg px-2.5 py-1.5 text-xs text-avionics-text font-medium focus:outline-none focus:border-sky-500"
            >
              <option value="all">Все ВС</option>
              {availableAircraft.map((type) => (
                <option key={type} value={type}>{type}</option>
              ))}
            </select>

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

            {hasActiveFilters && (
              <button
                onClick={resetFilters}
                className="px-2.5 py-1.5 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/30 rounded-lg text-xs font-semibold flex items-center space-x-1 cursor-pointer"
              >
                <RotateCcw className="w-3 h-3" />
                <span>Сброс</span>
              </button>
            )}
          </div>

          <div className="flex items-center space-x-2">
            <button
              type="button"
              onClick={() => setShowTerminator(!showTerminator)}
              className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg border text-xs font-semibold transition-all cursor-pointer ${
                showTerminator
                  ? 'bg-indigo-500/20 text-indigo-300 border-indigo-500/40 shadow-sm'
                  : 'bg-avionics-card text-avionics-muted border-avionics-border hover:text-avionics-text'
              }`}
            >
              <Moon className="w-3.5 h-3.5 text-indigo-400" />
              <span>Терминатор: {showTerminator ? 'Вкл' : 'Выкл'}</span>
            </button>

            <button
              type="button"
              onClick={() => setAnimateVectors(!animateVectors)}
              className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg border text-xs font-semibold transition-all cursor-pointer ${
                animateVectors
                  ? 'bg-sky-500/20 text-sky-400 border-sky-500/40 shadow-sm'
                  : 'bg-avionics-card text-avionics-muted border-avionics-border hover:text-avionics-text'
              }`}
            >
              {animateVectors ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
              <span>Анимация: {animateVectors ? 'Вкл' : 'Выкл'}</span>
            </button>
          </div>
        </div>
      </div>

      {/* Interactive Map Canvas */}
      <div className="bg-avionics-surface border border-avionics-border rounded-2xl overflow-hidden shadow-lg h-[280px] sm:h-[400px] md:h-[600px] relative">
        <div ref={mapContainerRef} className="w-full h-full" />
      </div>
    </div>
  );
};
