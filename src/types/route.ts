export type Coordinate = [number, number]; // [lng, lat]

export interface Waypoint {
  id: string;
  coord: Coordinate;
  isManual?: boolean; // If true, connected via straight line
}

export interface RouteSegment {
  coordinates: Coordinate[];
  distanceMeters: number;
}

export interface ElevationPoint {
  distanceKm: number;
  elevationM: number;
  coord: Coordinate;
}

export interface ElevationStats {
  gain: number;
  loss: number;
  minElevation: number;
  maxElevation: number;
  points: ElevationPoint[];
}

export type RoutingMode = 'follow-roads' | 'straight-line';

export type MapStyleMode = 'outdoor' | 'dark' | 'streets';

export interface RouteMetadata {
  name: string;
  description: string;
  targetPaceMinutes: number; // e.g. 5.5 = 5m 30s / km
}
