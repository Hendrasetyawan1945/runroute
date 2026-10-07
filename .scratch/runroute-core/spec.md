# Specification: RunRoute Core (Running Route Planner & Rich GPX Exporter)

## Status: Approved
Date: 2026-10-07

## Overview
**RunRoute** is a modern, high-performance, local-first web application designed specifically for runners to plan running routes on an interactive vector map, inspect elevation and distance metrics in real time, and export clean, rich GPX files compatible with Garmin, Coros, Suunto, and Apple Watch.

## Key Decisions (from /grill-me session)
1. **Routing Mode:** Smart snap-to-road pedestrian/foot routing via OpenRouteService/OSRM Foot profile, with a single-click toggle to manual straight-line mode for trails/parks/tracks.
2. **Architecture & Storage:** Zero-friction Local-First (stored in `localStorage`), no mandatory login or external database needed for core functionality.
3. **GPX Format:** Rich GPX Track 1.1 format with:
   - Route metadata (`<name>`, `<desc>`)
   - Track coordinates (`<trkpt lat="..." lon="...">`)
   - Real elevation values (`<ele>`)
   - Synthetic ISO timestamps (`<time>`) derived from target running pace (enabling Garmin ClimbPro & Virtual Pacer).
4. **Map Engine & Tiles:** MapLibre GL JS with tile layer switcher:
   - Outdoor / Terrain (contour, trails, footpaths)
   - Modern Dark / Strava-style (high-contrast night/dashboard theme)
   - Geolocation auto-detection for user's starting area.
5. **Elevation Profile:** Real-time elevation profile chart (via Open-Meteo Elevation API) showing gain/loss and syncing cursor hover with map point.
6. **Runner Actions:**
   - Undo / Redo (`Ctrl+Z`, `Ctrl+Y`)
   - Out & Back (mirror route back to start via same path)
   - Loop Closer (connect last waypoint back to start)
   - Reverse Route (swap start and finish)
   - Clear Route
7. **Pace & Metric System:** Metric system by default (KM, min/km, meters elevation), pace presets (e.g., Easy Run 6:00/km, Tempo 5:00/km, Race 4:30/km).

## Technical Architecture
- **Framework:** React 19 + TypeScript + Vite
- **Styling:** Premium Vanilla CSS design system (glassmorphism, dark/slate theme, smooth transitions, responsive mobile-friendly sidebar and overlay bar)
- **Map:** MapLibre GL JS
- **Icons:** Lucide React
- **Data Flow:**
  - `waypoints`: Array of `[lng, lat]` control points
  - `routeCoordinates`: Array of `[lng, lat]` detailed polyline points (either fetched from foot routing or straight lines)
  - `elevationData`: Array of `{ distanceKm, elevationMeters, coord }`
  - `history`: Stack for undo / redo
