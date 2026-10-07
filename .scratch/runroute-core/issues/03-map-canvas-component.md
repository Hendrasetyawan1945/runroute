# Issue 03: Map Canvas Component (MapLibre GL JS)

Status: resolved
Type: task

## Goal
Build interactive vector map component with MapLibre GL JS, featuring layer switching (Outdoor/Terrain & Modern Dark), waypoint markers, and interactive click-to-route drawing.

## Requirements
- Map container filling full height.
- Dynamic layers:
  - OpenFreeMap Liberty / Bright (Outdoor/Topo style)
  - Dark Matter style (High contrast dark mode)
- Click on map creates a new waypoint and triggers routing to last waypoint.
- Render dynamic GeoJSON Line layer showing runner path in vibrant athletic color (#10b981 or #06b6d4 / #f97316).
- Start marker (Green pin/badge) and Finish marker (Checkered or Orange badge).
- Geolocation control button ("My Location").
