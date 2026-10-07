import type { Coordinate, RouteSegment } from '../types/route';

/**
 * Calculates geodesic distance between two points in meters using Haversine formula
 */
export function calculateHaversineDistance(c1: Coordinate, c2: Coordinate): number {
  const [lon1, lat1] = c1;
  const [lon2, lat2] = c2;
  const R = 6371000; // Earth radius in meters
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Calculates total distance of an array of coordinates in meters
 */
export function calculatePolylineDistance(coords: Coordinate[]): number {
  if (coords.length < 2) return 0;
  let total = 0;
  for (let i = 0; i < coords.length - 1; i++) {
    total += calculateHaversineDistance(coords[i], coords[i + 1]);
  }
  return total;
}

/**
 * Fetch pedestrian route between two coordinates.
 * Falls back immediately to straight line if offline or request fails.
 */
export async function getPedestrianSegment(
  from: Coordinate,
  to: Coordinate,
  mode: 'follow-roads' | 'straight-line' = 'follow-roads'
): Promise<RouteSegment> {
  const directDistance = calculateHaversineDistance(from, to);
  const directSegment: RouteSegment = {
    coordinates: [from, to],
    distanceMeters: directDistance,
  };

  if (mode === 'straight-line') {
    return directSegment;
  }

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3000);

    const url = `https://router.project-osrm.org/route/v1/foot/${from[0]},${from[1]};${to[0]},${to[1]}?overview=full&geometries=geojson`;
    const response = await fetch(url, { signal: controller.signal });
    clearTimeout(timeoutId);

    if (!response.ok) {
      return directSegment;
    }

    const data = await response.json();
    if (data.code === 'Ok' && data.routes && data.routes[0]) {
      const route = data.routes[0];
      return {
        coordinates: route.geometry.coordinates as Coordinate[],
        distanceMeters: route.distance,
      };
    }
  } catch {
    // Graceful fallback to direct straight line
    return directSegment;
  }

  return directSegment;
}
