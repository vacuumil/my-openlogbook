import React, { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import { getGreatCirclePoint } from '../utils/nightCalculator';
import { Layers, Globe, Plane, Sparkles } from 'lucide-react';

interface GuestFlightMapProps {
  activePreset: 'all' | 'a320' | 'b738';
}

interface DemoAirport {
  icao: string;
  iata: string;
  name: string;
  city: string;
  lat: number;
  lng: number;
}

const DEMO_AIRPORTS: Record<string, DemoAirport> = {
  UUEE: { icao: 'UUEE', iata: 'SVO', name: 'Шереметьево', city: 'Москва', lat: 55.9726, lng: 37.4146 },
  OMDB: { icao: 'OMDB', iata: 'DXB', name: 'Дубай', city: 'ОАЭ', lat: 25.2532, lng: 55.3657 },
  ULLI: { icao: 'ULLI', iata: 'LED', name: 'Пулково', city: 'Санкт-Петербург', lat: 59.8003, lng: 30.2625 },
  LTFM: { icao: 'LTFM', iata: 'IST', name: 'Стамбул', city: 'Турция', lat: 41.2753, lng: 28.7519 },
  EDDF: { icao: 'EDDF', iata: 'FRA', name: 'Франкфурт', city: 'Германия', lat: 50.0379, lng: 8.5622 },
  KJFK: { icao: 'KJFK', iata: 'JFK', name: 'Дж. Кеннеди', city: 'Нью-Йорк', lat: 40.6413, lng: -73.7781 },
  URSS: { icao: 'URSS', iata: 'AER', name: 'Сочи', city: 'Адлер', lat: 43.4499, lng: 39.9566 },
};

interface DemoRoute {
  dep: string;
  arr: string;
  fleet: ('a320' | 'b738')[];
  flightNo: string;
  aircraft: string;
  time: string;
}

const DEMO_ROUTES: DemoRoute[] = [
  { dep: 'UUEE', arr: 'OMDB', fleet: ['b738'], flightNo: 'AFL200', aircraft: 'Boeing 737-800', time: '05:15' },
  { dep: 'ULLI', arr: 'LTFM', fleet: ['a320'], flightNo: 'SU1494', aircraft: 'Airbus A320', time: '03:40' },
  { dep: 'EDDF', arr: 'KJFK', fleet: ['b738'], flightNo: 'DLH400', aircraft: 'Boeing 747 / 738', time: '08:25' },
  { dep: 'UUEE', arr: 'ULLI', fleet: ['a320', 'b738'], flightNo: 'SU1492', aircraft: 'Airbus A320', time: '01:30' },
  { dep: 'UUEE', arr: 'URSS', fleet: ['a320'], flightNo: 'SU1120', aircraft: 'Airbus A321', time: '03:50' },
];

export const GuestFlightMap: React.FC<GuestFlightMapProps> = ({ activePreset }) => {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const [mapStyle, setMapStyle] = useState<'light' | 'satellite' | 'dark'>('light');

  useEffect(() => {
    if (!mapContainerRef.current) return;

    // Clean up previous instance
    if (mapInstanceRef.current) {
      mapInstanceRef.current.remove();
      mapInstanceRef.current = null;
    }

    const map = L.map(mapContainerRef.current, {
      center: [45, 20],
      zoom: 3,
      minZoom: 2,
      maxZoom: 10,
      zoomControl: false,
      attributionControl: false,
      scrollWheelZoom: false,
    });
    mapInstanceRef.current = map;

    // Base Tile Layer
    let tileUrl = 'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}';
    if (mapStyle === 'satellite') {
      tileUrl = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';
    } else if (mapStyle === 'dark') {
      tileUrl = 'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}';
    }

    L.tileLayer(tileUrl, {
      maxZoom: 19,
      subdomains: 'abc',
    }).addTo(map);

    // Filter routes by preset
    const activeRoutes = DEMO_ROUTES.filter((r) => {
      if (activePreset === 'all') return true;
      return r.fleet.includes(activePreset);
    });

    const latLngBounds: [number, number][] = [];
    const activeAirportsSet = new Set<string>();

    activeRoutes.forEach((r) => {
      activeAirportsSet.add(r.dep);
      activeAirportsSet.add(r.arr);

      const depAp = DEMO_AIRPORTS[r.dep];
      const arrAp = DEMO_AIRPORTS[r.arr];
      if (!depAp || !arrAp) return;

      latLngBounds.push([depAp.lat, depAp.lng]);
      latLngBounds.push([arrAp.lat, arrAp.lng]);

      // Generate ultra-smooth great-circle arc
      const arcPoints: [number, number][] = [];
      const steps = 40;
      for (let s = 0; s <= steps; s++) {
        const pt = getGreatCirclePoint(
          { latitude: depAp.lat, longitude: depAp.lng },
          { latitude: arrAp.lat, longitude: arrAp.lng },
          s / steps
        );
        arcPoints.push([pt.latitude, pt.longitude]);
      }

      // Outer glow line
      L.polyline(arcPoints, {
        color: '#0284c7',
        weight: 6,
        opacity: 0.25,
        lineCap: 'round',
        lineJoin: 'round',
      }).addTo(map);

      // Core neon flight vector
      const vectorColor = r.fleet.includes('b738') && activePreset === 'b738' ? '#0ea5e9' : '#0284c7';
      const coreLine = L.polyline(arcPoints, {
        color: vectorColor,
        weight: 2.5,
        opacity: 0.9,
        lineCap: 'round',
        lineJoin: 'round',
      }).addTo(map);

      coreLine.bindTooltip(
        `<div style="font-family: monospace; font-size: 11px; font-weight: bold; padding: 2px 4px;">
           ${r.flightNo} • ${r.dep} &rarr; ${r.arr} (${r.time})<br/>
           <span style="font-weight: normal; color: #94a3b8;">${r.aircraft}</span>
         </div>`,
        { sticky: true }
      );
    });

    // Add beacons for active airports
    activeAirportsSet.forEach((icao) => {
      const ap = DEMO_AIRPORTS[icao];
      if (!ap) return;

      const markerHtml = `
        <div style="position: relative; display: flex; align-items: center; justify-content: center; width: 32px; height: 32px;">
          <span style="position: absolute; width: 22px; height: 22px; background: rgba(14, 165, 233, 0.35); border-radius: 9999px; animation: ping 2s cubic-bezier(0, 0, 0.2, 1) infinite;"></span>
          <span style="position: relative; width: 9px; height: 9px; background: #0284c7; border: 2px solid #ffffff; border-radius: 9999px; box-shadow: 0 0 8px rgba(2, 132, 199, 0.8);"></span>
          <span style="position: absolute; top: -16px; font-family: monospace; font-size: 9px; font-weight: 800; background: rgba(15, 23, 42, 0.85); color: #38bdf8; padding: 1px 4px; border-radius: 4px; border: 1px solid rgba(56, 189, 248, 0.3); pointer-events: none;">
            ${ap.icao}
          </span>
        </div>
      `;

      const customIcon = L.divIcon({
        className: 'guest-radar-beacon',
        html: markerHtml,
        iconSize: [32, 32],
        iconAnchor: [16, 16],
      });

      L.marker([ap.lat, ap.lng], { icon: customIcon })
        .bindTooltip(
          `<div style="font-size: 11px;">
             <strong>${ap.name} (${ap.icao}/${ap.iata})</strong><br/>
             <span style="color: #94a3b8;">${ap.city}</span>
           </div>`
        )
        .addTo(map);
    });

    // Fit map view to active routes
    if (latLngBounds.length > 0) {
      const bounds = L.latLngBounds(latLngBounds);
      map.fitBounds(bounds, { padding: [35, 35], maxZoom: 6, animate: false });
    }

    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, [activePreset, mapStyle]);

  return (
    <div className="relative isolate w-full h-[260px] sm:h-[320px] rounded-2xl overflow-hidden border border-avionics-border shadow-inner bg-slate-900">
      {/* Map Container */}
      <div ref={mapContainerRef} className="w-full h-full z-0" />

      {/* Top Map Style Switcher Floating Pill */}
      <div className="absolute top-3 right-3 z-10 flex items-center bg-slate-900/85 backdrop-blur-md border border-slate-700/60 p-1 rounded-xl shadow-lg text-2xs font-semibold gap-1">
        <button
          type="button"
          onClick={() => setMapStyle('light')}
          className={`px-2 py-1 rounded-lg transition-colors cursor-pointer ${
            mapStyle === 'light' ? 'bg-sky-500 text-slate-950 font-bold' : 'text-slate-300 hover:text-white'
          }`}
        >
          Светлая
        </button>
        <button
          type="button"
          onClick={() => setMapStyle('satellite')}
          className={`px-2 py-1 rounded-lg transition-colors cursor-pointer ${
            mapStyle === 'satellite' ? 'bg-sky-500 text-slate-950 font-bold' : 'text-slate-300 hover:text-white'
          }`}
        >
          Спутник
        </button>
        <button
          type="button"
          onClick={() => setMapStyle('dark')}
          className={`px-2 py-1 rounded-lg transition-colors cursor-pointer ${
            mapStyle === 'dark' ? 'bg-sky-500 text-slate-950 font-bold' : 'text-slate-300 hover:text-white'
          }`}
        >
          Тёмная
        </button>
      </div>

      {/* Bottom Floating Legend */}
      <div className="absolute bottom-3 left-3 z-10 hidden sm:flex items-center space-x-2 bg-slate-950/85 backdrop-blur-md border border-slate-700/60 px-3 py-1.5 rounded-xl shadow-lg text-2xs text-slate-300 font-mono">
        <div className="w-2.5 h-2.5 rounded-full bg-sky-400 animate-pulse" />
        <span>Живой радар налёта пилота</span>
        <span className="text-slate-600">|</span>
        <span className="text-sky-400 font-bold">Ортодромические дуги</span>
      </div>
    </div>
  );
};
