import * as SunCalc from 'suncalc';

export interface LatLon {
  latitude: number;
  longitude: number;
}

export type NightRule = 'civil_twilight' | 'sunset_sunrise';

/**
 * Intermediate point along great circle path between two coordinates
 */
export function getGreatCirclePoint(
  p1: LatLon,
  p2: LatLon,
  fraction: number // 0 = start, 1 = end
): LatLon {
  const rad = Math.PI / 180;
  const lat1 = p1.latitude * rad;
  const lon1 = p1.longitude * rad;
  const lat2 = p2.latitude * rad;
  const lon2 = p2.longitude * rad;

  const d =
    2 *
    Math.asin(
      Math.sqrt(
        Math.pow(Math.sin((lat1 - lat2) / 2), 2) +
          Math.cos(lat1) * Math.cos(lat2) * Math.pow(Math.sin((lon1 - lon2) / 2), 2)
      )
    );

  if (d === 0) {
    return p1;
  }

  const a = Math.sin((1 - fraction) * d) / Math.sin(d);
  const b = Math.sin(fraction * d) / Math.sin(d);

  const x = a * Math.cos(lat1) * Math.cos(lon1) + b * Math.cos(lat2) * Math.cos(lon2);
  const y = a * Math.cos(lat1) * Math.sin(lon1) + b * Math.cos(lat2) * Math.sin(lon2);
  const z = a * Math.sin(lat1) + b * Math.sin(lat2);

  const lat = Math.atan2(z, Math.sqrt(x * x + y * y));
  const lon = Math.atan2(y, x);

  return {
    latitude: lat / rad,
    longitude: lon / rad,
  };
}

/**
 * Calculates total flight duration and night time in minutes with precision
 * @param dep Location of departure airport
 * @param arr Location of arrival airport
 * @param offTime Takeoff time (UTC)
 * @param onTime Landing time (UTC)
 * @param rule 'civil_twilight' (-6 deg for EASA/FAA) or 'sunset_sunrise' (-0.833 deg for RF/ICAO)
 */
export function calculateFlightTimes(
  dep: LatLon,
  arr: LatLon,
  offTime: Date,
  onTime: Date,
  rule: NightRule = 'civil_twilight'
): { totalFlightMinutes: number; nightMinutes: number } {
  const totalMillis = onTime.getTime() - offTime.getTime();
  if (totalMillis <= 0) {
    return { totalFlightMinutes: 0, nightMinutes: 0 };
  }

  const totalFlightMinutes = Math.round(totalMillis / (1000 * 60));
  
  // Sun elevation threshold in degrees
  const twilightThresholdDeg = rule === 'sunset_sunrise' ? -0.833 : -6.0;

  // Sample every 5 minutes along great circle (minimum 10 samples)
  const stepMinutes = 5;
  const numSteps = Math.max(10, Math.ceil(totalFlightMinutes / stepMinutes));
  const stepDurationMinutes = totalFlightMinutes / numSteps;

  let nightMinutes = 0;

  for (let i = 0; i < numSteps; i++) {
    const fraction = (i + 0.5) / numSteps; // Exact midpoint of interval
    const sampleTime = new Date(offTime.getTime() + fraction * totalMillis);
    const samplePos = getGreatCirclePoint(dep, arr, fraction);

    const pos = SunCalc.getPosition(sampleTime, samplePos.latitude, samplePos.longitude);
    const sunAltitudeDeg = pos.altitude; // In SunCalc, altitude is already in degrees

    if (sunAltitudeDeg <= twilightThresholdDeg) {
      nightMinutes += stepDurationMinutes;
    }
  }

  return {
    totalFlightMinutes,
    nightMinutes: Math.min(totalFlightMinutes, Math.round(nightMinutes)),
  };
}
