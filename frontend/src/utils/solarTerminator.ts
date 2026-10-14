/**
 * Solar Terminator (Day / Night boundary calculation)
 * Calculates the solar terminator line and night hemisphere polygon for Leaflet
 */

export interface LatLngPoint {
  lat: number;
  lng: number;
}

/**
 * Returns [lat, lng] array coordinates for the night polygon to render on Leaflet
 */
export function getNightTerminatorPolygon(date: Date = new Date()): [number, number][] {
  // Day of the year
  const startOfYear = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const dayOfYear = Math.floor((date.getTime() - startOfYear.getTime()) / (1000 * 60 * 60 * 24)) + 1;

  // Approximate solar declination in radians
  const declinationDeg = -23.44 * Math.cos(((2 * Math.PI) / 365) * (dayOfYear + 10));
  const declination = (declinationDeg * Math.PI) / 180;

  // Greenwich Hour Angle / Subsolar longitude in degrees
  const utcHours = date.getUTCHours() + date.getUTCMinutes() / 60 + date.getUTCSeconds() / 3600;
  const subsolarLngDeg = -((utcHours - 12) * 15);

  const points: [number, number][] = [];

  // Sample longitudes from -180 to +180 in 2-degree increments
  for (let lon = -180; lon <= 180; lon += 2) {
    const deltaLonRad = ((lon - subsolarLngDeg) * Math.PI) / 180;
    
    // Terminator latitude
    // tan(lat) = -cos(deltaLon) / tan(declination)
    const tanLat = -Math.cos(deltaLonRad) / Math.tan(declination);
    let latRad = Math.atan(tanLat);
    let latDeg = (latRad * 180) / Math.PI;

    // Clamp to valid latitudes
    latDeg = Math.max(-85, Math.min(85, latDeg));
    points.push([latDeg, lon]);
  }

  // Close the polygon through the winter / night pole
  const nightPoleLat = declinationDeg > 0 ? -90 : 90;
  points.push([nightPoleLat, 180]);
  points.push([nightPoleLat, -180]);
  points.push(points[0]); // close loop

  return points;
}

/**
 * Calculates Great Circle distance between two points in Nautical Miles (NM) and Kilometers (KM)
 */
export function calculateDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): { nm: number; km: number } {
  const R_NM = 3440.065; // Earth radius in nautical miles
  const R_KM = 6371.0;   // Earth radius in kilometers

  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;

  const lat1Rad = (lat1 * Math.PI) / 180;
  const lat2Rad = (lat2 * Math.PI) / 180;

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1Rad) * Math.cos(lat2Rad) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return {
    nm: Math.round(R_NM * c),
    km: Math.round(R_KM * c),
  };
}
