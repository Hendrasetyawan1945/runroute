# RunRoute - Running Route Planner & GPX Exporter

Web-based running route builder designed for runners. Create custom running routes with pedestrian snap-to-road, real-time distance calculation, elevation profile, and export clean GPX files compatible with Garmin, Coros, Suunto, and Apple Watch.

## Agent skills

### Issue tracker

Local markdown files in `.scratch/<feature>/`. See `docs/agents/issue-tracker.md`.

### Triage labels

Canonical 5 triage roles (`needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`). See `docs/agents/triage-labels.md`.

### Domain docs

Single-context repo layout (`GLOSSARY.md` + `docs/adr/`). See `docs/agents/domain.md`.

## Context7 (ctx7) Documentation Helper

Use `ctx7` to fetch up-to-date documentation and code patterns for libraries:
- Resolve library ID: `npx ctx7 library <name> [query]`
- Fetch docs: `npx ctx7 docs <libraryId> <query>`
- Verified library IDs:
  - MapLibre GL JS: `/maplibre/maplibre-gl-js`
