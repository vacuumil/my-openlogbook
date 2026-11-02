import { api } from '../api/client';

export interface WeatherInfo {
  icao: string;
  has_weather: boolean;
  raw_metar?: string | null;
  flight_category?: 'VFR' | 'MVFR' | 'IFR' | 'LIFR' | string | null;
  obs_time?: string | null;
  wind_dir?: number | null;
  wind_speed?: number | null;
  wind_gust?: number | null;
  visibility_sm?: number | string | null;
  temp_c?: number | null;
  dewpoint_c?: number | null;
  altim_hpa?: number | null;
  cover?: string | null;
  clouds?: Array<{ cover: string; base?: number }> | null;
  raw_taf?: string | null;
}

const memoryCache = new Map<string, { time: number; data: WeatherInfo }>();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

export const weatherService = {
  async getWeather(icao: string): Promise<WeatherInfo | null> {
    const code = icao.trim().toUpperCase();
    if (!code || code.length < 3) return null;

    const cached = memoryCache.get(code);
    const now = Date.now();
    if (cached && now - cached.time < CACHE_TTL_MS) {
      return cached.data;
    }

    try {
      const data = await api.getAirportWeather(code);
      if (data) {
        memoryCache.set(code, { time: now, data });
        return data;
      }
      return null;
    } catch (err) {
      console.warn(`[Weather] Could not fetch METAR for ${code}:`, err);
      return null;
    }
  },

  getCategoryStyle(category?: string | null) {
    switch (category) {
      case 'VFR':
        return {
          bg: 'bg-emerald-500/15 border-emerald-500/40 text-emerald-400',
          dot: 'bg-emerald-500',
          label: 'VFR (ПВП)',
          description: 'Потолок > 3000 ft, видимость > 5 миль (> 8 км)',
        };
      case 'MVFR':
        return {
          bg: 'bg-sky-500/15 border-sky-500/40 text-sky-400',
          dot: 'bg-sky-400',
          label: 'MVFR (Marginal VFR)',
          description: 'Потолок 1000–3000 ft и/или видимость 3–5 миль',
        };
      case 'IFR':
        return {
          bg: 'bg-rose-500/15 border-rose-500/40 text-rose-400',
          dot: 'bg-rose-500',
          label: 'IFR (ППП)',
          description: 'Потолок 500–1000 ft и/или видимость 1–3 мили',
        };
      case 'LIFR':
        return {
          bg: 'bg-fuchsia-500/15 border-fuchsia-500/40 text-fuchsia-400',
          dot: 'bg-fuchsia-500',
          label: 'LIFR (Low IFR)',
          description: 'Потолок < 500 ft и/или видимость < 1 мили',
        };
      default:
        return {
          bg: 'bg-slate-500/15 border-slate-500/40 text-slate-400',
          dot: 'bg-slate-400',
          label: category || 'Погода',
          description: 'Метеоданные обновляются',
        };
    }
  },
};
