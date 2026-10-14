import { db, LocalAirport } from '../db/db';
import { MAJOR_AIRPORTS } from '../data/majorAirports';

// In-memory cache for fast synchronous lookup
const airportCache = new Map<string, LocalAirport>();

// Initialize cache with MAJOR_AIRPORTS
MAJOR_AIRPORTS.forEach((apt) => {
  airportCache.set(apt.icao.toUpperCase(), apt);
});

export const airportService = {
  /**
   * Get an airport by ICAO code (or IATA)
   */
  async getAirport(code: string): Promise<LocalAirport | null> {
    if (!code) return null;
    const cleanCode = code.trim().toUpperCase();

    // 1. Check in-memory cache
    if (airportCache.has(cleanCode)) {
      return airportCache.get(cleanCode)!;
    }

    // 2. Check IndexedDB
    try {
      const fromDb = await db.airports.get(cleanCode);
      if (fromDb) {
        airportCache.set(cleanCode, fromDb);
        return fromDb;
      }
    } catch {
      // Ignore DB read error
    }

    // 3. Try to query backend API
    try {
      const response = await fetch(`/api/v1/airports/${cleanCode}`);
      if (response.ok) {
        const data = await response.json();
        const airport: LocalAirport = {
          icao: data.icao,
          iata: data.iata || undefined,
          name: data.name,
          latitude: data.latitude,
          longitude: data.longitude,
          timezone: data.timezone || 'UTC',
        };
        airportCache.set(cleanCode, airport);
        await db.airports.put(airport).catch(() => {});
        return airport;
      }
    } catch {
      // Offline or network error
    }

    return null;
  },

  /**
   * Search airports by query (ICAO, IATA, or Name)
   */
  async searchAirports(query: string, limit: number = 8): Promise<LocalAirport[]> {
    const q = query.trim().toUpperCase();
    if (q.length < 2) return [];

    const results = new Map<string, LocalAirport>();

    // 1. Search in local major airports first
    for (const apt of MAJOR_AIRPORTS) {
      if (
        apt.icao.toUpperCase().includes(q) ||
        (apt.iata && apt.iata.toUpperCase().includes(q)) ||
        apt.name.toUpperCase().includes(q)
      ) {
        results.set(apt.icao, apt);
        if (results.size >= limit) return Array.from(results.values());
      }
    }

    // 2. Search in IndexedDB
    try {
      const dbMatches = await db.airports
        .filter(
          (apt) =>
            apt.icao.toUpperCase().includes(q) ||
            (apt.iata ? apt.iata.toUpperCase().includes(q) : false) ||
            apt.name.toUpperCase().includes(q)
        )
        .limit(limit)
        .toArray();

      for (const apt of dbMatches) {
        results.set(apt.icao, apt);
        if (results.size >= limit) return Array.from(results.values());
      }
    } catch {
      // Ignore
    }

    // 3. Search via backend API
    try {
      const response = await fetch(`/api/v1/airports/search?q=${encodeURIComponent(query)}&limit=${limit}`);
      if (response.ok) {
        const data = await response.json();
        for (const item of data) {
          const apt: LocalAirport = {
            icao: item.icao,
            iata: item.iata || undefined,
            name: item.name,
            latitude: item.latitude,
            longitude: item.longitude,
            timezone: item.timezone || 'UTC',
          };
          results.set(apt.icao, apt);
          airportCache.set(apt.icao, apt);
          db.airports.put(apt).catch(() => {});
        }
      }
    } catch {
      // Offline fallback
    }

    return Array.from(results.values()).slice(0, limit);
  },

  /**
   * Pre-load a list of ICAOs into cache
   */
  async preloadAirports(icaos: string[]): Promise<Map<string, LocalAirport>> {
    const unique = Array.from(new Set(icaos.map((c) => c.trim().toUpperCase()))).filter(Boolean);
    const resolved = new Map<string, LocalAirport>();

    const missing: string[] = [];

    for (const icao of unique) {
      if (airportCache.has(icao)) {
        resolved.set(icao, airportCache.get(icao)!);
      } else {
        missing.push(icao);
      }
    }

    if (missing.length > 0) {
      // Check Dexie
      try {
        const fromDb = await db.airports.where('icao').anyOf(missing).toArray();
        for (const apt of fromDb) {
          airportCache.set(apt.icao, apt);
          resolved.set(apt.icao, apt);
        }
      } catch {
        // Ignore
      }

      // Query any remaining missing from backend in parallel
      const stillMissing = missing.filter((c) => !resolved.has(c));
      await Promise.all(
        stillMissing.map(async (code) => {
          try {
            const res = await fetch(`/api/v1/airports/${code}`);
            if (res.ok) {
              const data = await res.json();
              const apt: LocalAirport = {
                icao: data.icao,
                iata: data.iata || undefined,
                name: data.name,
                latitude: data.latitude,
                longitude: data.longitude,
                timezone: data.timezone || 'UTC',
              };
              airportCache.set(code, apt);
              resolved.set(code, apt);
              db.airports.put(apt).catch(() => {});
            }
          } catch {
            // Offline
          }
        })
      );
    }

    return resolved;
  },
};
