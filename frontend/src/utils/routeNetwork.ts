import { LocalAirport, LocalFlight } from '../db/db';
import { getGreatCirclePoint } from './nightCalculator';
import { calculateDistance } from './solarTerminator';

const EARTH_CIRCUMFERENCE_KM = 40075;
const PATH_STEPS = 48;

export interface MapRoute {
  key: string;
  from: LocalAirport;
  to: LocalAirport;
  flights: LocalFlight[];
  minutes: number;
  distanceKm: number;
  distanceNm: number;
  path: [number, number][];
}

export interface MapAirport {
  airport: LocalAirport;
  flights: LocalFlight[];
  minutes: number;
}

export interface RouteNetwork {
  routes: MapRoute[];
  airports: MapAirport[];
  unresolved: string[];
  totalKm: number;
  earthLaps: number;
  longestRoute: MapRoute | null;
}

/** Longitudes keep increasing past ±180°, otherwise Leaflet draws the arc across the whole map. */
export function buildGreatCirclePath(from: LocalAirport, to: LocalAirport, steps: number = PATH_STEPS): [number, number][] {
  const path: [number, number][] = [];
  let previousLongitude: number | null = null;

  for (let i = 0; i <= steps; i++) {
    const point = getGreatCirclePoint(
      { latitude: from.latitude, longitude: from.longitude },
      { latitude: to.latitude, longitude: to.longitude },
      i / steps
    );
    let longitude = point.longitude;
    if (previousLongitude !== null) {
      while (longitude - previousLongitude > 180) longitude -= 360;
      while (longitude - previousLongitude < -180) longitude += 360;
    }
    previousLongitude = longitude;
    path.push([point.latitude, longitude]);
  }

  // Past the antimeridian always means the eastern side, so all arcs share one world copy
  // and the map view does not stretch across the whole globe.
  return path.some(([, longitude]) => longitude < -180)
    ? path.map(([latitude, longitude]) => [latitude, longitude + 360])
    : path;
}

export const crossesAntimeridian = (route: MapRoute) => route.path.some(([, longitude]) => Math.abs(longitude) > 180);

/** An unwrapped arc ends on a neighbouring world copy, so lines and markers are drawn on each copy they touch. */
export function getWorldOffsets(routes: MapRoute[]): number[] {
  return routes.some(crossesAntimeridian) ? [-360, 0, 360] : [0];
}

export const shiftPath = (path: [number, number][], offset: number): [number, number][] =>
  offset === 0 ? path : path.map(([latitude, longitude]) => [latitude, longitude + offset]);

export interface ViewBounds {
  south: number;
  north: number;
  west: number;
  east: number;
}

/**
 * Smallest longitude window holding every point: the window opens at the widest empty gap around
 * the globe, so a Pacific network stays compact. Longitudes may exceed 180, world copies cover them.
 */
export function getViewBounds(points: Array<[number, number]>): ViewBounds | null {
  if (points.length === 0) return null;

  const longitudes = Array.from(new Set(points.map(([, longitude]) => ((longitude % 360) + 360) % 360))).sort((a, b) => a - b);
  let widestGap = 360 - longitudes[longitudes.length - 1] + longitudes[0];
  let west = longitudes[0];
  longitudes.slice(0, -1).forEach((longitude, index) => {
    const gap = longitudes[index + 1] - longitude;
    if (gap > widestGap) {
      widestGap = gap;
      west = longitudes[index + 1];
    }
  });

  const start = west > 180 ? west - 360 : west;
  const latitudes = points.map(([latitude]) => latitude);
  return {
    south: Math.min(...latitudes),
    north: Math.max(...latitudes),
    west: start,
    east: start + (360 - widestGap),
  };
}

/** Flights in both directions form one route: the arc between two airfields is the same line. */
export function buildRouteNetwork(flights: LocalFlight[], airports: Map<string, LocalAirport>): RouteNetwork {
  const routes = new Map<string, MapRoute>();
  const stops = new Map<string, MapAirport>();
  const unresolved = new Set<string>();

  const visit = (airport: LocalAirport, flight: LocalFlight) => {
    const icao = airport.icao.toUpperCase();
    const stop = stops.get(icao) || { airport, flights: [], minutes: 0 };
    if (!stop.flights.includes(flight)) {
      stop.flights.push(flight);
      stop.minutes += flight.totalTimeMinutes || 0;
    }
    stops.set(icao, stop);
  };

  flights.forEach((flight) => {
    const dep = flight.depIcao.toUpperCase().trim();
    const arr = flight.arrIcao.toUpperCase().trim();
    const depAirport = airports.get(dep);
    const arrAirport = airports.get(arr);

    if (!depAirport) unresolved.add(dep);
    if (!arrAirport) unresolved.add(arr);
    if (depAirport) visit(depAirport, flight);
    if (arrAirport) visit(arrAirport, flight);
    if (!depAirport || !arrAirport || dep === arr) return;

    const [first, second] = [depAirport, arrAirport].sort((a, b) => a.icao.localeCompare(b.icao));
    const key = `${first.icao}-${second.icao}`.toUpperCase();
    let route = routes.get(key);
    if (!route) {
      const distance = calculateDistance(first.latitude, first.longitude, second.latitude, second.longitude);
      route = {
        key,
        from: first,
        to: second,
        flights: [],
        minutes: 0,
        distanceKm: distance.km,
        distanceNm: distance.nm,
        path: buildGreatCirclePath(first, second),
      };
      routes.set(key, route);
    }
    route.flights.push(flight);
    route.minutes += flight.totalTimeMinutes || 0;
  });

  const routeList = Array.from(routes.values()).sort((a, b) => b.flights.length - a.flights.length);
  const totalKm = routeList.reduce((sum, route) => sum + route.distanceKm * route.flights.length, 0);

  return {
    routes: routeList,
    airports: Array.from(stops.values()).sort((a, b) => b.flights.length - a.flights.length),
    unresolved: Array.from(unresolved).sort(),
    totalKm,
    earthLaps: totalKm / EARTH_CIRCUMFERENCE_KM,
    longestRoute: routeList.reduce<MapRoute | null>(
      (longest, route) => (!longest || route.distanceKm > longest.distanceKm ? route : longest),
      null
    ),
  };
}
