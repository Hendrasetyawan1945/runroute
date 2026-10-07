import type { Coordinate, ElevationPoint, ElevationStats } from '../types/route';
import { calculateHaversineDistance } from './routing';

/**
 * Samples a route polyline into up to `maxSamples` points and fetches
 * real SRTM elevation data from Open-Meteo API.
 */
export async function fetchRouteElevation(
  coords: Coordinate[],
  maxSamples: number = 80
): Promise<ElevationStats | null> {
  if (coords.length < 2) return null;

  // Calculate cumulative distance for all points
  const cumDistances: number[] = [0];
  for (let i = 0; i < coords.length - 1; i++) {
    const segDist = calculateHaversineDistance(coords[i], coords[i + 1]);
    cumDistances.push(cumDistances[cumDistances.length - 1] + segDist);
  }

  // Pick sample indices evenly distributed
  const sampleIndices: number[] = [];
  const step = Math.max(1, Math.floor(coords.length / maxSamples));
  for (let i = 0; i < coords.length; i += step) {
    sampleIndices.push(i);
  }
  if (sampleIndices[sampleIndices.length - 1] !== coords.length - 1) {
    sampleIndices.push(coords.length - 1);
  }

  const sampledCoords = sampleIndices.map((i) => coords[i]);
  const lats = sampledCoords.map((c) => c[1].toFixed(5)).join(',');
  const lons = sampledCoords.map((c) => c[0].toFixed(5)).join(',');

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 4000);

    const res = await fetch(
      `https://api.open-meteo.com/v1/elevation?latitude=${lats}&longitude=${lons}`,
      { signal: controller.signal }
    );
    clearTimeout(timeout);

    if (!res.ok) return null;

    const data = await res.json();
    const elevations: number[] = data.elevation;
    if (!elevations || elevations.length === 0) return null;

    let gain = 0;
    let loss = 0;
    let minEle = elevations[0];
    let maxEle = elevations[0];

    const points: ElevationPoint[] = elevations.map((ele, idx) => {
      const origIndex = sampleIndices[idx];
      const distKm = cumDistances[origIndex] / 1000;
      if (idx > 0) {
        const diff = ele - elevations[idx - 1];
        if (diff > 0) gain += diff;
        else loss += Math.abs(diff);
      }
      if (ele < minEle) minEle = ele;
      if (ele > maxEle) maxEle = ele;

      return {
        distanceKm: Number(distKm.toFixed(2)),
        elevationM: Math.round(ele),
        coord: coords[origIndex],
      };
    });

    return {
      gain: Math.round(gain),
      loss: Math.round(loss),
      minElevation: Math.round(minEle),
      maxElevation: Math.round(maxEle),
      points,
    };
  } catch {
    return null;
  }
}
