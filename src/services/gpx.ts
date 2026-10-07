import type { Coordinate, ElevationStats } from '../types/route';
import { calculateHaversineDistance } from './routing';

export interface GpxExportOptions {
  name: string;
  description?: string;
  targetPaceMinutes?: number; // min per km, default 5.5 (5:30/km)
  elevationStats?: ElevationStats | null;
}

/**
 * Generates standard GPX 1.1 XML string compatible with Garmin, Coros, Suunto, Strava.
 */
export function generateGpxString(
  coordinates: Coordinate[],
  options: GpxExportOptions
): string {
  if (coordinates.length === 0) return '';

  const {
    name = 'My Running Route',
    description = 'Created with RunRoute',
    targetPaceMinutes = 5.5,
    elevationStats = null,
  } = options;

  const now = new Date();
  // Set starting time to 06:00 AM today (classic morning run time)
  const startTime = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 6, 0, 0);

  // Speed in meters per second:
  // Pace P min/km => (P * 60) seconds per 1000m => speed = 1000 / (P * 60) m/s
  const paceSecondsPerMeter = (targetPaceMinutes * 60) / 1000;

  // Build elevation map / lookup if available
  const hasElevationPoints = elevationStats && elevationStats.points.length > 0;

  let currentTimestampMs = startTime.getTime();
  let cumulativeDistanceMeters = 0;

  const trackPointsXml: string[] = [];

  for (let i = 0; i < coordinates.length; i++) {
    const [lon, lat] = coordinates[i];

    if (i > 0) {
      const segDistance = calculateHaversineDistance(coordinates[i - 1], coordinates[i]);
      cumulativeDistanceMeters += segDistance;
      currentTimestampMs += segDistance * paceSecondsPerMeter * 1000;
    }

    const isoTime = new Date(currentTimestampMs).toISOString();

    // Elevation calculation (interpolated from sampled elevation points if available)
    let eleTag = '';
    if (hasElevationPoints) {
      const currentDistKm = cumulativeDistanceMeters / 1000;
      const pts = elevationStats.points;
      
      // Find closest sample point
      let bestEle = pts[0].elevationM;
      for (let j = 0; j < pts.length; j++) {
        if (pts[j].distanceKm <= currentDistKm) {
          bestEle = pts[j].elevationM;
        } else {
          // linear interpolation between j-1 and j
          if (j > 0) {
            const prev = pts[j - 1];
            const next = pts[j];
            const span = next.distanceKm - prev.distanceKm;
            if (span > 0) {
              const ratio = (currentDistKm - prev.distanceKm) / span;
              bestEle = Math.round(prev.elevationM + ratio * (next.elevationM - prev.elevationM));
            }
          }
          break;
        }
      }
      eleTag = `\n        <ele>${bestEle.toFixed(1)}</ele>`;
    }

    trackPointsXml.push(
      `      <trkpt lat="${lat.toFixed(6)}" lon="${lon.toFixed(6)}">${eleTag}\n        <time>${isoTime}</time>\n      </trkpt>`
    );
  }

  const cleanName = escapeXml(name);
  const cleanDesc = escapeXml(description);

  return `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="RunRoute - Running Route Planner (https://runroute.local)"
  xmlns="http://www.topografix.com/GPX/1/1"
  xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
  xsi:schemaLocation="http://www.topografix.com/GPX/1/1 http://www.topografix.com/GPX/1/1/gpx.xsd">
  <metadata>
    <name>${cleanName}</name>
    <desc>${cleanDesc}</desc>
    <time>${startTime.toISOString()}</time>
  </metadata>
  <trk>
    <name>${cleanName}</name>
    <type>running</type>
    <trkseg>
${trackPointsXml.join('\n')}
    </trkseg>
  </trk>
</gpx>`;
}

function escapeXml(unsafe: string): string {
  return unsafe.replace(/[<>&'"]/g, (c) => {
    switch (c) {
      case '<': return '&lt;';
      case '>': return '&gt;';
      case '&': return '&amp;';
      case '\'': return '&apos;';
      case '"': return '&quot;';
      default: return c;
    }
  });
}

/**
 * Triggers instant browser download of the GPX file
 */
export function downloadGpxFile(filename: string, gpxContent: string): void {
  const blob = new Blob([gpxContent], { type: 'application/gpx+xml;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename.endsWith('.gpx') ? filename : `${filename}.gpx`;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}
