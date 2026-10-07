# Issue 04: Runner Toolbar & Metrics Panel

Status: resolved
Type: task

## Goal
Build top HUD metrics bar and runner action controls: Undo, Redo, Out & Back, Loop Closer, Reverse, Clear, Routing Mode Switch, Pace Selector, and GPX Export Modal.

## Requirements
- Realtime metrics:
  - Total Distance in KM (e.g. `10.42 km`)
  - Estimated Time (e.g. `57m 18s` at 5:30/km)
  - Elevation Gain (+34m) / Loss (-32m)
  - Waypoints count
- Action buttons:
  - Undo (Ctrl+Z) & Redo (Ctrl+Y)
  - Out & Back (duplicate route reversed)
  - Loop Closer (route back to start)
  - Reverse Route (swap start & finish)
  - Clear Route
  - Mode toggle: Snap to Road (Pedestrian) vs Straight Line (Manual)
  - Target Pace dropdown / slider (Easy 6:00, Normal 5:30, Tempo 5:00, Race 4:15)
  - Export GPX button with custom name input
