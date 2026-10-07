# Issue 02: Elevation Service (Open-Meteo Integration)

Status: resolved
Type: task

## Goal
Implement elevation sampling service using Open-Meteo Elevation API (free, reliable, no API key).

## Requirements
1. `src/services/elevation.ts`:
   - Take array of `[lng, lat]` coordinates.
   - Sample up to 100 evenly-spaced points along route to avoid excessive payload.
   - Fetch elevations from `https://api.open-meteo.com/v1/elevation?latitude=...&longitude=...`.
   - Calculate cumulative distance for each point.
   - Compute total Elevation Gain (`+m`) and Elevation Loss (`-m`).
   - Return `{ points: Array<{ distanceKm, elevationM, coord }>, gain, loss }`.
