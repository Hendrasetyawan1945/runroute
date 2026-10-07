# Issue 01: Pedestrian Routing Engine & Rich GPX Exporter

Status: resolved
Type: task

## Goal
Implement client-side pedestrian routing service (OSRM / OpenRouteService with straight-line fallback) and standard-compliant GPX 1.1 exporter with elevation and simulated timestamps for Garmin/Coros.

## Requirements
1. `src/services/routing.ts`:
   - Query pedestrian route between waypoints.
   - Fallback gracefully to direct straight line if network/API fails.
   - Calculate precise geodesic distance in km (Haversine or Turf formula).
2. `src/services/gpx.ts`:
   - Generate standard GPX 1.1 XML string:
     - Header with schema, creator "RunRoute"
     - `<trk>` with `<name>`, `<type>running</type>`
     - `<trkseg>` with `<trkpt lat="..." lon="...">`
     - `<ele>` with rounded elevation in meters
     - `<time>` with ISO timestamp spaced according to pace
   - Provide `downloadGpx(filename, gpxContent)` trigger.
