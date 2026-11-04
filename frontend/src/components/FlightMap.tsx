import React, { useEffect, useMemo, useRef, useState } from 'react';
import L from 'leaflet';
import { escapeHtml } from '../utils/escapeHtml';
import { LocalFlight, LocalAirport } from '../db/db';
import { MAJOR_AIRPORTS } from '../data/majorAirports';
import { airportService } from '../utils/airportService';
import { getNightTerminatorPolygon } from '../utils/solarTerminator';
import { buildRouteNetwork, getViewBounds, getWorldOffsets, MapAirport, MapRoute, shiftPath } from '../utils/routeNetwork';
import { parseFlightDate } from '../utils/dates';
import { formatMinutesToHHMM } from './FlightList';
import {
  AlertTriangle,
  ArrowRight,
  ArrowLeftRight,
  Compass,
  Filter,
  Globe,
  Layers,
  Loader2,
  LocateFixed,
  MapPin,
  Maximize2,
  Minimize2,
  Moon,
  Navigation,
  Pause,
  Play,
  Sun,
  X,
} from 'lucide-react';

type MapStyle = 'light' | 'satellite' | 'dark';
type ColorMode = 'single' | 'type' | 'year';
type Selection = { kind: 'route'; key: string } | { kind: 'airport'; icao: string } | null;

interface FlightMapProps {
  flights: LocalFlight[];
  /** Unfiltered flights: group colors come from here, so a filter never repaints a type. */
  allFlights?: LocalFlight[];
  airports: LocalAirport[];
  theme: 'dark' | 'light';
  variant?: 'standalone' | 'dashboard';
  onOpenFullMap?: () => void;
  onSelectFlight?: (flight: LocalFlight) => void;
  onFilterAirport?: (icao: string) => void;
  onFilterRoute?: (route: string) => void;
}

// Label-free bases that need no API key: airfields and routes are the only text on the map
const TILE_URLS: Record<MapStyle, string> = {
  light: 'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}',
  dark: 'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}',
  satellite: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
};
// Past these zooms the services return no tiles, so the last level is scaled up
const MAX_TILE_ZOOM: Record<MapStyle, number> = { light: 16, dark: 16, satellite: 19 };
const MAP_BACKGROUNDS: Record<MapStyle, string> = { light: '#d6d6d4', dark: '#1e1f20', satellite: '#0b1a2a' };
const ROUTE_COLORS: Record<MapStyle, string> = { light: '#1c5cab', dark: '#6da7ec', satellite: '#9ec5f4' };
const ESRI_ATTRIBUTION = '&copy; <a href="https://www.esri.com/">Esri</a>';

// Validated categorical order: fixed slots, never cycled. Extra groups fold into "Другие".
const SERIES_LIGHT = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#6250d6', '#e34948'];
const SERIES_DARK = ['#3987e5', '#d95926', '#199e70', '#c98500', '#d55181', '#008300', '#9085e9', '#e66767'];
const OTHER_COLOR = '#8a8a86';
const OTHER_LABEL = 'Другие';

// Only the busiest airfields keep a label on a wide view
const LABELS_ALWAYS_VISIBLE = 10;
const LABELS_HIDE_BELOW_ZOOM = 5;
const REPLAY_TICK_MS = 150;
const REPLAY_TICKS = 160;

const flightWord = (count: number) => {
  const tens = count % 100;
  const units = count % 10;
  if (tens >= 11 && tens <= 14) return 'рейсов';
  if (units === 1) return 'рейс';
  if (units >= 2 && units <= 4) return 'рейса';
  return 'рейсов';
};

const groupOf = (flight: LocalFlight, mode: ColorMode) =>
  mode === 'year' ? flight.date.substring(0, 4) : (flight.aircraftType || '').toUpperCase() || 'N/A';

/** Every group flown on a route, most flights first: a route flown on two types shows both */
const groupsOf = (route: MapRoute, mode: ColorMode) => {
  const counts = new Map<string, number>();
  route.flights.forEach((flight) => {
    const group = groupOf(flight, mode);
    counts.set(group, (counts.get(group) || 0) + 1);
  });
  return Array.from(counts.entries()).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
};

const STRIPE = 10;

const MapStyleToggle: React.FC<{ value: MapStyle; onChange: (style: MapStyle) => void }> = ({ value, onChange }) => {
  const items: Array<{ style: MapStyle; label: string; icon: React.ReactNode }> = [
    { style: 'light', label: 'Светлая', icon: <Sun className="w-3.5 h-3.5" /> },
    { style: 'satellite', label: 'Спутник', icon: <Layers className="w-3.5 h-3.5" /> },
    { style: 'dark', label: 'Тёмная', icon: <Moon className="w-3.5 h-3.5" /> },
  ];

  return (
    <div className="flex items-center p-0.5 rounded-xl bg-slate-900/90 border border-slate-700 text-xs font-semibold">
      {items.map(({ style, label, icon }) => (
        <button
          key={style}
          type="button"
          onClick={() => onChange(style)}
          title={label}
          aria-label={label}
          aria-pressed={value === style}
          className={`px-2 py-1 rounded-lg transition-all cursor-pointer ${
            value === style ? 'bg-sky-500 text-slate-950' : 'text-slate-300 hover:text-white'
          }`}
        >
          {icon}
        </button>
      ))}
    </div>
  );
};

const StatTile: React.FC<{ label: string; value: string; hint?: string; icon: React.ReactNode }> = ({ label, value, hint, icon }) => (
  <div className="p-3 sm:p-4 bg-avionics-surface border border-avionics-border rounded-2xl shadow-sm min-w-0">
    <div className="flex items-center justify-between text-2xs sm:text-xs text-avionics-muted font-semibold uppercase">
      <span className="truncate mr-1">{label}</span>
      <span className="text-sky-400 shrink-0">{icon}</span>
    </div>
    <div className="mt-1 text-lg sm:text-2xl font-black font-mono text-avionics-text truncate">{value}</div>
    {hint && <div className="text-2xs text-avionics-muted truncate">{hint}</div>}
  </div>
);

const FlightRows: React.FC<{ flights: LocalFlight[]; onSelectFlight?: (flight: LocalFlight) => void }> = ({ flights, onSelectFlight }) => (
  <ul className="max-h-56 overflow-y-auto divide-y divide-avionics-border rounded-xl border border-avionics-border">
    {[...flights]
      .sort((a, b) => b.date.localeCompare(a.date))
      .slice(0, 50)
      .map((flight) => (
        <li key={flight.id}>
          <button
            type="button"
            onClick={() => onSelectFlight?.(flight)}
            className="w-full flex items-center justify-between gap-2 px-2.5 py-2 text-xs hover:bg-avionics-card cursor-pointer"
          >
            <span className="font-mono text-avionics-muted shrink-0">
              {parseFlightDate(flight.date).toLocaleDateString('ru-RU')}
            </span>
            <span className="font-mono font-bold text-avionics-text truncate">
              {flight.depIcao}–{flight.arrIcao}
            </span>
            <span className="font-mono text-avionics-muted shrink-0">{formatMinutesToHHMM(flight.totalTimeMinutes)}</span>
          </button>
        </li>
      ))}
  </ul>
);

export const FlightMap: React.FC<FlightMapProps> = ({
  flights,
  allFlights,
  airports,
  theme,
  variant = 'standalone',
  onOpenFullMap,
  onSelectFlight,
  onFilterAirport,
  onFilterRoute,
}) => {
  const isDashboard = variant === 'dashboard';
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const tileLayerRef = useRef<L.TileLayer | null>(null);
  const terminatorLayerRef = useRef<L.LayerGroup | null>(null);
  const routesLayerRef = useRef<L.LayerGroup | null>(null);
  const airportsLayerRef = useRef<L.LayerGroup | null>(null);
  const userMovedMapRef = useRef(false);
  const isFittingRef = useRef(false);

  const [resolvedAirports, setResolvedAirports] = useState<Map<string, LocalAirport>>(() => {
    const initial = new Map<string, LocalAirport>();
    MAJOR_AIRPORTS.forEach((a) => initial.set(a.icao.toUpperCase(), a));
    return initial;
  });
  const [loadingAirports, setLoadingAirports] = useState(false);

  const [mapStyle, setMapStyle] = useState<MapStyle>(() => {
    try {
      const saved = localStorage.getItem('openlogbook_map_style');
      if (saved === 'light' || saved === 'satellite' || saved === 'dark') return saved;
    } catch {}
    return theme === 'dark' ? 'dark' : 'light';
  });

  const handleMapStyleChange = (style: MapStyle) => {
    setMapStyle(style);
    try {
      localStorage.setItem('openlogbook_map_style', style);
    } catch {}
  };

  const [showTerminator, setShowTerminator] = useState(false);
  const [colorMode, setColorMode] = useState<ColorMode>('single');
  const [selection, setSelection] = useState<Selection>(null);
  // A group picked in the legend: only its routes stay bright
  const [focusGroup, setFocusGroup] = useState<string | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [replayIndex, setReplayIndex] = useState<number | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);

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

  const chronological = useMemo(() => [...flights].sort((a, b) => a.date.localeCompare(b.date)), [flights]);
  const isReplaying = replayIndex !== null;
  const visibleFlights = useMemo(
    () => (isReplaying ? chronological.slice(0, replayIndex + 1) : flights),
    [isReplaying, chronological, replayIndex, flights]
  );

  const network = useMemo(() => buildRouteNetwork(visibleFlights, resolvedAirports), [visibleFlights, resolvedAirports]);

  // Colors follow the entity: groups come from the whole logbook, so filters never repaint survivors
  const groupColors = useMemo(() => {
    const series = mapStyle === 'light' ? SERIES_LIGHT : SERIES_DARK;
    const colors = new Map<string, string>();
    if (colorMode === 'single') return colors;

    const counts = new Map<string, number>();
    (allFlights || flights).forEach((flight) => {
      const group = groupOf(flight, colorMode);
      counts.set(group, (counts.get(group) || 0) + 1);
    });
    Array.from(counts.keys())
      .sort((a, b) => (colorMode === 'year' ? b.localeCompare(a) : (counts.get(b) || 0) - (counts.get(a) || 0) || a.localeCompare(b)))
      .forEach((group, index) => colors.set(group, series[index] || OTHER_COLOR));
    return colors;
  }, [allFlights, flights, colorMode, mapStyle]);

  useEffect(() => setFocusGroup(null), [colorMode]);

  const legend = useMemo(() => {
    const entries = Array.from(groupColors.entries()).filter(([, color]) => color !== OTHER_COLOR);
    return groupColors.size > entries.length ? [...entries, [OTHER_LABEL, OTHER_COLOR] as [string, string]] : entries;
  }, [groupColors]);

  const fitToNetwork = (map: L.Map) => {
    const points = [
      ...network.routes.flatMap((route) => route.path),
      ...network.airports.map(({ airport }): [number, number] => [airport.latitude, airport.longitude]),
    ];
    if (points.length === 0) return;

    // World copies exist only when an arc crosses the antimeridian, so only then may the view wrap around it
    const view = getWorldOffsets(network.routes).length > 1 ? getViewBounds(points) : null;
    const bounds = view
      ? L.latLngBounds([view.south, view.west], [view.north, view.east])
      : L.latLngBounds(points);

    isFittingRef.current = true;
    map.fitBounds(bounds, { padding: [50, 50], maxZoom: 7, animate: false });
    isFittingRef.current = false;
  };

  const updateLabelVisibility = (map: L.Map) => {
    map.getContainer().classList.toggle(
      'map-hide-minor-labels',
      map.getZoom() < LABELS_HIDE_BELOW_ZOOM
    );
  };

  // The map lives as long as the component: data changes only touch its layers
  useEffect(() => {
    if (!mapContainerRef.current) return;

    const map = L.map(mapContainerRef.current, {
      center: [52, 35],
      zoom: 3,
      minZoom: 2,
      maxZoom: 13,
      zoomControl: true,
      attributionControl: true,
      scrollWheelZoom: !isDashboard,
    });
    map.attributionControl.setPrefix(false);
    mapInstanceRef.current = map;
    terminatorLayerRef.current = L.layerGroup().addTo(map);
    routesLayerRef.current = L.layerGroup().addTo(map);
    airportsLayerRef.current = L.layerGroup().addTo(map);

    const markUserMove = () => {
      if (!isFittingRef.current) userMovedMapRef.current = true;
    };
    map.on('dragstart', markUserMove);
    map.on('zoomstart', markUserMove);

    const observer = new ResizeObserver(() => map.invalidateSize());
    observer.observe(mapContainerRef.current);

    return () => {
      observer.disconnect();
      map.remove();
      mapInstanceRef.current = null;
    };
  }, [isDashboard]);

  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    map.getContainer().style.background = MAP_BACKGROUNDS[mapStyle];
    tileLayerRef.current?.remove();
    tileLayerRef.current = L.tileLayer(TILE_URLS[mapStyle], {
      maxNativeZoom: MAX_TILE_ZOOM[mapStyle],
      maxZoom: 19,
      attribution: ESRI_ATTRIBUTION,
    }).addTo(map);
  }, [mapStyle]);

  useEffect(() => {
    const group = terminatorLayerRef.current;
    if (!group) return;

    group.clearLayers();
    if (!showTerminator) return;
    const isLight = mapStyle === 'light';
    try {
      L.polygon(getNightTerminatorPolygon(new Date()), {
        fillColor: isLight ? '#0B0F19' : '#000000',
        fillOpacity: isLight ? 0.12 : 0.35,
        stroke: true,
        color: isLight ? '#0284C7' : '#38BDF8',
        weight: 1,
        opacity: isLight ? 0.22 : 0.35,
        interactive: false,
      }).addTo(group);
    } catch (err) {
      console.error('Terminator render error:', err);
    }
  }, [showTerminator, mapStyle]);

  useEffect(() => {
    const map = mapInstanceRef.current;
    const routesLayer = routesLayerRef.current;
    const airportsLayer = airportsLayerRef.current;
    if (!map || !routesLayer || !airportsLayer) return;

    routesLayer.clearLayers();
    airportsLayer.clearLayers();

    const isLight = mapStyle === 'light';
    const defaultColor = ROUTE_COLORS[mapStyle];
    const selectedKey = selection?.kind === 'route' ? selection.key : null;
    const selectedIcao = selection?.kind === 'airport' ? selection.icao : null;
    const hasSelection = selection !== null;
    const worldOffsets = getWorldOffsets(network.routes);

    network.routes.forEach((route) => {
      const count = route.flights.length;
      const groups = colorMode === 'single' ? [] : groupsOf(route, colorMode);
      const inFocus = !focusGroup || groups.some(([group]) => group === focusGroup);
      // Stripes of every group's color, or the focused group alone
      const colors =
        colorMode === 'single'
          ? [defaultColor]
          : focusGroup && inFocus
            ? [groupColors.get(focusGroup) || OTHER_COLOR]
            : Array.from(new Set(groups.map(([group]) => groupColors.get(group) || OTHER_COLOR)));
      const color = colors[0];
      const isConnected =
        selectedKey === route.key ||
        selectedIcao === route.from.icao.toUpperCase() ||
        selectedIcao === route.to.icao.toUpperCase();
      const opacity = hasSelection ? (isConnected ? 1 : 0.15) : !inFocus ? 0.12 : Math.min(0.6 + count * 0.05, 0.95);
      const breakdown = groups.length > 1 ? ` (${groups.map(([group, n]) => `${escapeHtml(group)}: ${n}`).join(', ')})` : '';
      const label = `${escapeHtml(route.from.icao)} ↔ ${escapeHtml(route.to.icao)}: ${count} ${flightWord(count)}${breakdown}, ${route.distanceNm} NM`;

      worldOffsets.forEach((offset) => {
        const path = shiftPath(route.path, offset);

        colors.forEach((stripeColor, index) => {
          L.polyline(path, {
            color: stripeColor,
            weight: Math.min(1.5 + count * 0.15, 3) + (isConnected ? 1 : 0) + (colors.length > 1 ? 0.5 : 0),
            opacity,
            lineCap: colors.length > 1 ? 'butt' : 'round',
            lineJoin: 'round',
            dashArray: colors.length > 1 ? `${STRIPE} ${STRIPE * (colors.length - 1)}` : undefined,
            dashOffset: colors.length > 1 ? String(index * STRIPE) : undefined,
            interactive: false,
          }).addTo(routesLayer);
        });

        if (isReplaying) return;

        // Wider than the line, so routes stay tappable on a phone
        const hitArea = L.polyline(path, { color, weight: 18, opacity: 0 }).addTo(routesLayer);
        hitArea.bindTooltip(label, { sticky: true });
        hitArea.on('click', () => {
          if (isDashboard) onOpenFullMap?.();
          else setSelection({ kind: 'route', key: route.key });
        });
      });
    });

    network.airports.forEach(({ airport, flights: airportFlights }, index) => {
      const icao = airport.icao.toUpperCase();
      // The icon is exactly the dot and anchored at its centre, so it sits on the end of the arcs;
      // the label hangs above it without moving the anchor.
      const icon = L.divIcon({
        className: 'airport-hub-marker',
        html: `
          <div class="airport-pin ${isLight ? 'light' : 'dark'} ${index < LABELS_ALWAYS_VISIBLE ? '' : 'is-minor'}">
            <span class="airport-pin-label">${escapeHtml(icao)}</span>
          </div>
        `,
        iconSize: [10, 10],
        iconAnchor: [5, 5],
      });

      worldOffsets.forEach((offset) => {
        const marker = L.marker([airport.latitude, airport.longitude + offset], { icon, zIndexOffset: 100 }).addTo(airportsLayer);
        marker.bindTooltip(
          `<strong>${escapeHtml(icao)}</strong> ${escapeHtml(airport.name)}<br/>${airportFlights.length} ${flightWord(airportFlights.length)}`
        );
        marker.on('click', () => {
          if (isDashboard) onOpenFullMap?.();
          else setSelection({ kind: 'airport', icao });
        });
      });
    });

    if (!userMovedMapRef.current && !isReplaying) fitToNetwork(map);
    updateLabelVisibility(map);

    const onZoom = () => updateLabelVisibility(map);
    map.on('zoomend', onZoom);
    return () => {
      map.off('zoomend', onZoom);
    };
  }, [network, mapStyle, colorMode, groupColors, focusGroup, selection, isReplaying, isDashboard]);

  // Replay
  useEffect(() => {
    if (!isPlaying) return;

    const step = Math.max(1, Math.ceil(chronological.length / REPLAY_TICKS));
    const timer = window.setInterval(() => {
      setReplayIndex((index) => {
        const next = (index ?? -1) + step;
        if (next >= chronological.length - 1) {
          setIsPlaying(false);
          return chronological.length - 1;
        }
        return next;
      });
    }, REPLAY_TICK_MS);
    return () => window.clearInterval(timer);
  }, [isPlaying, chronological.length]);

  // A different set of flights invalidates the replay position
  const flightsKey = useMemo(() => chronological.map((flight) => flight.id).join(), [chronological]);
  useEffect(() => {
    setReplayIndex(null);
    setIsPlaying(false);
  }, [flightsKey]);

  // A selection outlives data changes for as long as its route or airfield is still there
  useEffect(() => {
    if (selection?.kind === 'route' && !network.routes.some((route) => route.key === selection.key)) setSelection(null);
    if (selection?.kind === 'airport' && !network.airports.some((stop) => stop.airport.icao.toUpperCase() === selection.icao)) {
      setSelection(null);
    }
  }, [network, selection]);

  useEffect(() => {
    if (!isFullscreen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setIsFullscreen(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isFullscreen]);

  const showEverything = () => {
    const map = mapInstanceRef.current;
    if (!map) return;
    userMovedMapRef.current = false;
    setSelection(null);
    fitToNetwork(map);
  };

  const focusRoute = (route: MapRoute) => {
    setSelection({ kind: 'route', key: route.key });
    const map = mapInstanceRef.current;
    if (!map) return;
    userMovedMapRef.current = true;
    map.flyToBounds(L.latLngBounds(route.path), { padding: [60, 60], maxZoom: 7, duration: 0.6 });
  };

  const focusAirport = (stop: MapAirport) => {
    setSelection({ kind: 'airport', icao: stop.airport.icao.toUpperCase() });
    const map = mapInstanceRef.current;
    if (!map) return;
    userMovedMapRef.current = true;
    map.flyTo([stop.airport.latitude, stop.airport.longitude], Math.max(map.getZoom(), 5), { duration: 0.6 });
  };

  const togglePlay = () => {
    if (isPlaying) {
      setIsPlaying(false);
      return;
    }
    if (replayIndex === null || replayIndex >= chronological.length - 1) {
      showEverything();
      setReplayIndex(0);
    }
    setSelection(null);
    setIsPlaying(true);
  };

  const exitReplay = () => {
    setIsPlaying(false);
    setReplayIndex(null);
  };

  const selectedRoute = selection?.kind === 'route' ? network.routes.find((route) => route.key === selection.key) : undefined;
  const selectedAirport = selection?.kind === 'airport'
    ? network.airports.find((stop) => stop.airport.icao.toUpperCase() === selection.icao)
    : undefined;
  const replayFlight = isReplaying ? chronological[replayIndex] : null;

  const mapOverlay = (
    <div className="absolute top-3 right-3 z-[400] flex items-center gap-2">
      <MapStyleToggle value={mapStyle} onChange={handleMapStyleChange} />
      {isDashboard && onOpenFullMap && (
        <button
          type="button"
          onClick={onOpenFullMap}
          className="flex items-center space-x-1 px-3 py-1.5 rounded-xl text-xs font-bold bg-slate-900/90 text-sky-400 border border-sky-500/40 cursor-pointer"
        >
          <Filter className="w-3.5 h-3.5" />
          <span>Открыть карту</span>
        </button>
      )}
    </div>
  );

  if (isDashboard) {
    return (
      <div className="relative isolate w-full h-[280px] sm:h-[360px] rounded-2xl overflow-hidden border border-avionics-border">
        <div ref={mapContainerRef} className="w-full h-full" />
        {mapOverlay}
        <div className="absolute bottom-3 left-3 z-[400] bg-slate-900/90 border border-slate-700 px-2.5 py-1 rounded-xl text-2xs text-slate-300 font-mono flex items-center space-x-2">
          <span className="flex items-center space-x-1 text-sky-400 font-bold">
            <Compass className="w-3.5 h-3.5" />
            <span>Маршрутов: {network.routes.length}</span>
          </span>
          <span>Аэродромов: {network.airports.length}</span>
        </div>
      </div>
    );
  }

  const toolbarButton = (active: boolean) =>
    `flex items-center space-x-1.5 px-2.5 py-1.5 rounded-lg border text-xs font-semibold transition-colors cursor-pointer ${
      active
        ? 'bg-sky-500/20 text-sky-400 border-sky-500/40'
        : 'bg-avionics-card text-avionics-muted border-avionics-border hover:text-avionics-text'
    }`;

  return (
    <div className={isFullscreen ? 'fixed inset-0 z-50 overflow-y-auto bg-avionics-bg p-2 sm:p-3 space-y-2' : 'space-y-3 sm:space-y-4'}>
      {!isFullscreen && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-3">
          <StatTile
            label="Аэродромов"
            value={String(network.airports.length)}
            hint={`Маршрутов: ${network.routes.length}`}
            icon={<MapPin className="w-4 h-4" />}
          />
          <StatTile
            label="Рейсов на карте"
            value={String(visibleFlights.length)}
            hint={loadingAirports ? 'Поиск аэродромов...' : undefined}
            icon={loadingAirports ? <Loader2 className="w-4 h-4 animate-spin" /> : <Navigation className="w-4 h-4" />}
          />
          <StatTile
            label="Дистанция"
            value={`${Math.round(network.totalKm).toLocaleString('ru-RU')} км`}
            hint={`Оборотов вокруг Земли: ${network.earthLaps.toFixed(1)}`}
            icon={<Globe className="w-4 h-4" />}
          />
          <StatTile
            label="Самый длинный"
            value={network.longestRoute ? `${network.longestRoute.distanceNm} NM` : '—'}
            hint={network.longestRoute ? `${network.longestRoute.from.icao} ↔ ${network.longestRoute.to.icao}` : undefined}
            icon={<Compass className="w-4 h-4" />}
          />
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2 p-2 bg-avionics-surface border border-avionics-border rounded-2xl">
        <button type="button" onClick={togglePlay} disabled={chronological.length === 0} className={toolbarButton(isPlaying)}>
          {isPlaying ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
          <span>{isPlaying ? 'Пауза' : 'История полётов'}</span>
        </button>

        <label className="flex items-center space-x-1.5 text-xs text-avionics-muted font-semibold">
          <span>Цвет:</span>
          <select
            value={colorMode}
            onChange={(e) => setColorMode(e.target.value as ColorMode)}
            className="bg-avionics-card border border-avionics-border rounded-lg px-2 py-1.5 text-xs text-avionics-text focus:outline-none focus:border-sky-500"
          >
            <option value="single">Единый</option>
            <option value="type">По типу ВС</option>
            <option value="year">По году</option>
          </select>
        </label>

        <button type="button" onClick={() => setShowTerminator(!showTerminator)} aria-pressed={showTerminator} className={toolbarButton(showTerminator)}>
          <Moon className="w-3.5 h-3.5" />
          <span>Ночь</span>
        </button>
        <button type="button" onClick={showEverything} className={toolbarButton(false)}>
          <LocateFixed className="w-3.5 h-3.5" />
          <span>Показать всё</span>
        </button>
        <button type="button" onClick={() => setIsFullscreen(!isFullscreen)} aria-pressed={isFullscreen} className={`${toolbarButton(isFullscreen)} sm:ml-auto`}>
          {isFullscreen ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
          <span>{isFullscreen ? 'Свернуть' : 'На весь экран'}</span>
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_300px] gap-3 sm:gap-4">
        <div
          className={`relative isolate min-w-0 bg-avionics-surface border border-avionics-border rounded-2xl overflow-hidden shadow-lg ${
            isFullscreen ? 'h-[calc(100dvh-7rem)]' : 'h-[340px] sm:h-[460px] lg:h-[600px]'
          }`}
        >
          <div ref={mapContainerRef} className="w-full h-full" />
          {mapOverlay}

          {legend.length > 0 && (
            <div className={`absolute ${isReplaying ? 'bottom-24' : 'bottom-6'} left-2 z-[400] max-w-[70%] bg-slate-900/90 border border-slate-700 rounded-xl px-2.5 py-1.5 flex flex-wrap gap-x-2.5 gap-y-1 text-2xs text-slate-200`}>
              {legend.map(([group, color]) =>
                group === OTHER_LABEL ? (
                  <span key={group} className="flex items-center space-x-1">
                    <span className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: color }} />
                    <span className="font-mono">{group}</span>
                  </span>
                ) : (
                  <button
                    key={group}
                    type="button"
                    onClick={() => setFocusGroup((current) => (current === group ? null : group))}
                    aria-pressed={focusGroup === group}
                    title={focusGroup === group ? 'Показать все' : `Только ${group}`}
                    className={`flex items-center space-x-1 cursor-pointer transition-opacity ${
                      focusGroup && focusGroup !== group ? 'opacity-40' : ''
                    } ${focusGroup === group ? 'font-bold' : ''}`}
                  >
                    <span className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: color }} />
                    <span className="font-mono">{group}</span>
                  </button>
                )
              )}
            </div>
          )}

          {isReplaying && (
            <div className="absolute bottom-6 inset-x-2 sm:inset-x-16 z-[400] bg-slate-900/90 border border-slate-700 rounded-xl px-3 py-2 text-slate-200">
              <div className="flex items-center justify-between gap-2 text-xs">
                <span className="font-mono font-bold text-sky-400">
                  {replayFlight ? parseFlightDate(replayFlight.date).toLocaleDateString('ru-RU') : ''}
                </span>
                <span className="font-mono truncate">
                  {replayFlight ? `${replayFlight.depIcao}–${replayFlight.arrIcao}` : ''}
                </span>
                <span className="font-mono text-slate-400 shrink-0">
                  {(replayIndex ?? 0) + 1} / {chronological.length}
                </span>
                <button type="button" onClick={exitReplay} aria-label="Закрыть историю" className="text-slate-400 hover:text-white cursor-pointer">
                  <X className="w-4 h-4" />
                </button>
              </div>
              <input
                type="range"
                min={0}
                max={chronological.length - 1}
                value={replayIndex ?? 0}
                onChange={(e) => {
                  setIsPlaying(false);
                  setReplayIndex(Number(e.target.value));
                }}
                aria-label="Позиция в истории полётов"
                className="w-full mt-1 accent-sky-500"
              />
            </div>
          )}
        </div>

        <aside className="min-w-0 bg-avionics-surface border border-avionics-border rounded-2xl p-3 sm:p-4 space-y-4 lg:max-h-[600px] lg:overflow-y-auto">
          {selectedRoute ? (
            <section className="space-y-2.5">
              <div className="flex items-start justify-between gap-2">
                <h3 className="font-mono font-black text-sky-400 text-base flex items-center space-x-1.5">
                  <span>{selectedRoute.from.icao}</span>
                  <ArrowLeftRight className="w-4 h-4" />
                  <span>{selectedRoute.to.icao}</span>
                </h3>
                <button type="button" onClick={() => setSelection(null)} aria-label="Закрыть" className="text-avionics-muted hover:text-avionics-text cursor-pointer">
                  <X className="w-4 h-4" />
                </button>
              </div>
              <p className="text-xs text-avionics-muted">{selectedRoute.from.name} — {selectedRoute.to.name}</p>
              <dl className="grid grid-cols-3 gap-2 text-center">
                {[
                  ['Рейсов', String(selectedRoute.flights.length)],
                  ['Налёт', formatMinutesToHHMM(selectedRoute.minutes)],
                  ['NM', String(selectedRoute.distanceNm)],
                ].map(([label, value]) => (
                  <div key={label} className="p-2 bg-avionics-card rounded-xl">
                    <dt className="text-2xs text-avionics-muted">{label}</dt>
                    <dd className="font-mono font-bold text-sm text-avionics-text">{value}</dd>
                  </div>
                ))}
              </dl>
              <FlightRows flights={selectedRoute.flights} onSelectFlight={onSelectFlight} />
              <button
                type="button"
                onClick={() => onFilterRoute?.(`${selectedRoute.from.icao}-${selectedRoute.to.icao}`)}
                className="w-full flex items-center justify-center space-x-1.5 px-3 py-2 rounded-xl text-xs font-bold bg-sky-500/15 text-sky-400 border border-sky-500/30 cursor-pointer"
              >
                <Filter className="w-3.5 h-3.5" />
                <span>Показать только этот маршрут</span>
              </button>
            </section>
          ) : selectedAirport ? (
            <section className="space-y-2.5">
              <div className="flex items-start justify-between gap-2">
                <h3 className="font-mono font-black text-sky-400 text-base">
                  {selectedAirport.airport.icao}
                  {selectedAirport.airport.iata ? ` (${selectedAirport.airport.iata})` : ''}
                </h3>
                <button type="button" onClick={() => setSelection(null)} aria-label="Закрыть" className="text-avionics-muted hover:text-avionics-text cursor-pointer">
                  <X className="w-4 h-4" />
                </button>
              </div>
              <p className="text-xs text-avionics-muted">{selectedAirport.airport.name}</p>
              <dl className="grid grid-cols-2 gap-2 text-center">
                {[
                  ['Рейсов', String(selectedAirport.flights.length)],
                  ['Налёт', formatMinutesToHHMM(selectedAirport.minutes)],
                ].map(([label, value]) => (
                  <div key={label} className="p-2 bg-avionics-card rounded-xl">
                    <dt className="text-2xs text-avionics-muted">{label}</dt>
                    <dd className="font-mono font-bold text-sm text-avionics-text">{value}</dd>
                  </div>
                ))}
              </dl>
              <FlightRows flights={selectedAirport.flights} onSelectFlight={onSelectFlight} />
              <button
                type="button"
                onClick={() => onFilterAirport?.(selectedAirport.airport.icao)}
                className="w-full flex items-center justify-center space-x-1.5 px-3 py-2 rounded-xl text-xs font-bold bg-sky-500/15 text-sky-400 border border-sky-500/30 cursor-pointer"
              >
                <Filter className="w-3.5 h-3.5" />
                <span>Показать только этот аэродром</span>
              </button>
            </section>
          ) : (
            <>
              <section>
                <h3 className="text-xs font-bold uppercase tracking-wider text-avionics-text mb-2">Топ маршрутов</h3>
                {network.routes.length === 0 ? (
                  <p className="text-xs text-avionics-muted">Нет маршрутов в выборке.</p>
                ) : (
                  <ol className="space-y-1">
                    {network.routes.slice(0, 5).map((route) => (
                      <li key={route.key}>
                        <button
                          type="button"
                          onClick={() => focusRoute(route)}
                          className="w-full flex items-center justify-between gap-2 px-2 py-1.5 rounded-lg hover:bg-avionics-card text-xs cursor-pointer"
                        >
                          <span className="font-mono font-bold text-avionics-text flex items-center space-x-1 min-w-0">
                            <span>{route.from.icao}</span>
                            <ArrowRight className="w-3 h-3 text-avionics-muted shrink-0" />
                            <span>{route.to.icao}</span>
                          </span>
                          <span className="font-mono text-avionics-muted shrink-0">{route.flights.length}</span>
                        </button>
                      </li>
                    ))}
                  </ol>
                )}
              </section>

              <section>
                <h3 className="text-xs font-bold uppercase tracking-wider text-avionics-text mb-2">Топ аэродромов</h3>
                <ol className="space-y-1">
                  {network.airports.slice(0, 5).map((stop) => (
                    <li key={stop.airport.icao}>
                      <button
                        type="button"
                        onClick={() => focusAirport(stop)}
                        className="w-full flex items-center justify-between gap-2 px-2 py-1.5 rounded-lg hover:bg-avionics-card text-xs cursor-pointer"
                      >
                        <span className="min-w-0 truncate text-left">
                          <span className="font-mono font-bold text-avionics-text">{stop.airport.icao}</span>{' '}
                          <span className="text-avionics-muted">{stop.airport.name}</span>
                        </span>
                        <span className="font-mono text-avionics-muted shrink-0">{stop.flights.length}</span>
                      </button>
                    </li>
                  ))}
                </ol>
              </section>
            </>
          )}

          {network.unresolved.length > 0 && (
            <section className="p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-xs text-avionics-text">
              <p className="flex items-center space-x-1.5 font-semibold">
                <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                <span>Нет координат, на карте не показаны:</span>
              </p>
              <p className="mt-1 font-mono break-words">{network.unresolved.join(', ')}</p>
            </section>
          )}
        </aside>
      </div>
    </div>
  );
};
