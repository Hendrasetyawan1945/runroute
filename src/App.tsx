import { useState, useEffect, useCallback, useRef } from 'react';
import type {
  Coordinate,
  ElevationStats,
  MapStyleMode,
  RoutingMode,
  Waypoint,
} from './types/route';
import { MapCanvas } from './components/MapCanvas';
import { RunnerToolbar } from './components/RunnerToolbar';
import { ElevationChart } from './components/ElevationChart';
import { ExportModal } from './components/ExportModal';
import {
  calculatePolylineDistance,
  getPedestrianSegment,
} from './services/routing';
import { fetchRouteElevation } from './services/elevation';
import { downloadGpxFile, generateGpxString } from './services/gpx';

const STORAGE_KEY = 'runroute_saved_state_v1';

interface SavedState {
  waypoints: Waypoint[];
  routeCoordinates: Coordinate[];
  targetPaceMinutes: number;
}

export function App() {
  const [waypoints, setWaypoints] = useState<Waypoint[]>([]);
  const [routeCoordinates, setRouteCoordinates] = useState<Coordinate[]>([]);
  const [distanceMeters, setDistanceMeters] = useState<number>(0);
  const [elevationStats, setElevationStats] = useState<ElevationStats | null>(null);
  const [hoverCoordinate, setHoverCoordinate] = useState<Coordinate | null>(null);

  const [routingMode, setRoutingMode] = useState<RoutingMode>('follow-roads');
  const [mapStyle, setMapStyle] = useState<MapStyleMode>('outdoor');
  const [targetPaceMinutes, setTargetPaceMinutes] = useState<number>(5.5); // 5:30/km
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);

  // Undo / Redo History
  const [history, setHistory] = useState<{ waypoints: Waypoint[]; routeCoords: Coordinate[] }[]>([]);
  const [historyIndex, setHistoryIndex] = useState<number>(-1);

  // Track if action comes from undo/redo
  const isNavigatingHistory = useRef(false);

  // Load from localStorage on initial mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed: SavedState = JSON.parse(saved);
        if (parsed.waypoints && parsed.waypoints.length > 0) {
          setWaypoints(parsed.waypoints);
          setRouteCoordinates(parsed.routeCoordinates);
          setTargetPaceMinutes(parsed.targetPaceMinutes || 5.5);
          const dist = calculatePolylineDistance(parsed.routeCoordinates);
          setDistanceMeters(dist);

          setHistory([{ waypoints: parsed.waypoints, routeCoords: parsed.routeCoordinates }]);
          setHistoryIndex(0);

          // Fetch elevation
          fetchRouteElevation(parsed.routeCoordinates).then(setElevationStats);
        }
      }
    } catch {
      // Ignore parse errors
    }
  }, []);

  // Save to localStorage when route changes
  useEffect(() => {
    if (waypoints.length > 0) {
      const stateToSave: SavedState = {
        waypoints,
        routeCoordinates,
        targetPaceMinutes,
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(stateToSave));
    }
  }, [waypoints, routeCoordinates, targetPaceMinutes]);

  // Push to history helper
  const recordHistory = useCallback(
    (newWaypoints: Waypoint[], newCoords: Coordinate[]) => {
      if (isNavigatingHistory.current) return;
      setHistory((prev) => {
        const sliced = prev.slice(0, historyIndex + 1);
        return [...sliced, { waypoints: newWaypoints, routeCoords: newCoords }];
      });
      setHistoryIndex((prev) => prev + 1);
    },
    [historyIndex]
  );

  // Add Waypoint
  const handleAddWaypoint = async (coord: Coordinate) => {
    const newWp: Waypoint = {
      id: `wp-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      coord,
      isManual: routingMode === 'straight-line',
    };

    if (waypoints.length === 0) {
      const newWps = [newWp];
      const newCoords = [coord];
      setWaypoints(newWps);
      setRouteCoordinates(newCoords);
      setDistanceMeters(0);
      recordHistory(newWps, newCoords);
      return;
    }

    const lastWp = waypoints[waypoints.length - 1];
    const segment = await getPedestrianSegment(lastWp.coord, coord, routingMode);

    const newWps = [...waypoints, newWp];
    // Avoid duplicate joint coordinate
    const segmentPoints = segment.coordinates.slice(1);
    const newCoords = [...routeCoordinates, ...segmentPoints];

    setWaypoints(newWps);
    setRouteCoordinates(newCoords);

    const dist = calculatePolylineDistance(newCoords);
    setDistanceMeters(dist);
    recordHistory(newWps, newCoords);

    // Fetch elevation asynchronously
    fetchRouteElevation(newCoords).then(setElevationStats);
  };

  // Undo
  const handleUndo = () => {
    if (historyIndex > 0) {
      isNavigatingHistory.current = true;
      const targetState = history[historyIndex - 1];
      setWaypoints(targetState.waypoints);
      setRouteCoordinates(targetState.routeCoords);
      const dist = calculatePolylineDistance(targetState.routeCoords);
      setDistanceMeters(dist);
      setHistoryIndex(historyIndex - 1);

      fetchRouteElevation(targetState.routeCoords).then(setElevationStats);
      setTimeout(() => {
        isNavigatingHistory.current = false;
      }, 50);
    } else if (historyIndex === 0) {
      // Undo all back to empty
      isNavigatingHistory.current = true;
      setWaypoints([]);
      setRouteCoordinates([]);
      setDistanceMeters(0);
      setElevationStats(null);
      setHistoryIndex(-1);
      setTimeout(() => {
        isNavigatingHistory.current = false;
      }, 50);
    }
  };

  // Redo
  const handleRedo = () => {
    if (historyIndex < history.length - 1) {
      isNavigatingHistory.current = true;
      const targetState = history[historyIndex + 1];
      setWaypoints(targetState.waypoints);
      setRouteCoordinates(targetState.routeCoords);
      const dist = calculatePolylineDistance(targetState.routeCoords);
      setDistanceMeters(dist);
      setHistoryIndex(historyIndex + 1);

      fetchRouteElevation(targetState.routeCoords).then(setElevationStats);
      setTimeout(() => {
        isNavigatingHistory.current = false;
      }, 50);
    }
  };

  // Out and Back (Bolak-balik lewat jalur sama)
  const handleOutAndBack = async () => {
    if (waypoints.length < 2) return;
    const reversedWaypoints = [...waypoints].reverse().slice(1);

    let currentCoords = [...routeCoordinates];
    const newWaypoints = [...waypoints];

    for (const wp of reversedWaypoints) {
      const lastCoord = currentCoords[currentCoords.length - 1];
      const segment = await getPedestrianSegment(lastCoord, wp.coord, routingMode);
      currentCoords = [...currentCoords, ...segment.coordinates.slice(1)];
      newWaypoints.push({
        id: `wp-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
        coord: wp.coord,
        isManual: wp.isManual,
      });
    }

    setWaypoints(newWaypoints);
    setRouteCoordinates(currentCoords);
    const dist = calculatePolylineDistance(currentCoords);
    setDistanceMeters(dist);
    recordHistory(newWaypoints, currentCoords);
    fetchRouteElevation(currentCoords).then(setElevationStats);
  };

  // Close Loop (Sambung ke titik awal)
  const handleCloseLoop = async () => {
    if (waypoints.length < 2) return;
    const startWp = waypoints[0];
    const lastWp = waypoints[waypoints.length - 1];

    const segment = await getPedestrianSegment(lastWp.coord, startWp.coord, routingMode);
    const newWp: Waypoint = {
      id: `wp-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      coord: startWp.coord,
    };

    const newWps = [...waypoints, newWp];
    const newCoords = [...routeCoordinates, ...segment.coordinates.slice(1)];

    setWaypoints(newWps);
    setRouteCoordinates(newCoords);
    const dist = calculatePolylineDistance(newCoords);
    setDistanceMeters(dist);
    recordHistory(newWps, newCoords);
    fetchRouteElevation(newCoords).then(setElevationStats);
  };

  // Reverse Route (Balikkan arah start/finish)
  const handleReverseRoute = async () => {
    if (waypoints.length < 2) return;
    const revWps = [...waypoints].reverse();
    let revCoords: Coordinate[] = [revWps[0].coord];

    for (let i = 0; i < revWps.length - 1; i++) {
      const segment = await getPedestrianSegment(revWps[i].coord, revWps[i + 1].coord, routingMode);
      revCoords = [...revCoords, ...segment.coordinates.slice(1)];
    }

    setWaypoints(revWps);
    setRouteCoordinates(revCoords);
    const dist = calculatePolylineDistance(revCoords);
    setDistanceMeters(dist);
    recordHistory(revWps, revCoords);
    fetchRouteElevation(revCoords).then(setElevationStats);
  };

  // Clear Route
  const handleClearRoute = () => {
    setWaypoints([]);
    setRouteCoordinates([]);
    setDistanceMeters(0);
    setElevationStats(null);
    setHoverCoordinate(null);
    setHistory([]);
    setHistoryIndex(-1);
    localStorage.removeItem(STORAGE_KEY);
  };

  // Toggle Map Style
  const handleToggleMapStyle = () => {
    setMapStyle((prev) => {
      if (prev === 'outdoor') return 'dark';
      if (prev === 'dark') return 'streets';
      return 'outdoor';
    });
  };

  // Export GPX trigger
  const handleConfirmExport = (name: string, desc: string, pace: number) => {
    const gpxString = generateGpxString(routeCoordinates, {
      name,
      description: desc,
      targetPaceMinutes: pace,
      elevationStats,
    });
    const filename = `${name.toLowerCase().replace(/[^a-z0-9]/g, '-')}.gpx`;
    downloadGpxFile(filename, gpxString);
  };

  // Quick Preset Loader (e.g. Waterfront Run)
  const handleLoadPreset = async () => {
    // Beautiful 5K Padang Waterfront & Beach Running Loop
    const presetCoords: Coordinate[] = [
      [100.3543, -0.9471],
      [100.3521, -0.9385],
      [100.3562, -0.9298],
      [100.3615, -0.9342],
      [100.3543, -0.9471],
    ];

    const wps: Waypoint[] = presetCoords.map((c, i) => ({
      id: `wp-preset-${i}`,
      coord: c,
    }));

    let fullCoords: Coordinate[] = [presetCoords[0]];
    for (let i = 0; i < presetCoords.length - 1; i++) {
      const seg = await getPedestrianSegment(presetCoords[i], presetCoords[i + 1], 'follow-roads');
      fullCoords = [...fullCoords, ...seg.coordinates.slice(1)];
    }

    setWaypoints(wps);
    setRouteCoordinates(fullCoords);
    const dist = calculatePolylineDistance(fullCoords);
    setDistanceMeters(dist);
    recordHistory(wps, fullCoords);
    fetchRouteElevation(fullCoords).then(setElevationStats);
  };

  // Keyboard Shortcuts (Ctrl+Z, Ctrl+Y, Esc)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
        e.preventDefault();
        if (e.shiftKey) {
          handleRedo();
        } else {
          handleUndo();
        }
      } else if ((e.ctrlKey || e.metaKey) && e.key === 'y') {
        e.preventDefault();
        handleRedo();
      } else if (e.key === 'Escape') {
        setIsExportModalOpen(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [historyIndex, history]);

  return (
    <div className="app-viewport">
      {/* Map Canvas */}
      <MapCanvas
        waypoints={waypoints}
        routeCoordinates={routeCoordinates}
        mapStyle={mapStyle}
        hoverCoordinate={hoverCoordinate}
        onAddWaypoint={handleAddWaypoint}
      />

      {/* Top HUD & Action Toolbar */}
      <RunnerToolbar
        distanceMeters={distanceMeters}
        elevationStats={elevationStats}
        routingMode={routingMode}
        mapStyle={mapStyle}
        targetPaceMinutes={targetPaceMinutes}
        canUndo={historyIndex >= 0}
        canRedo={historyIndex < history.length - 1}
        waypointCount={waypoints.length}
        onUndo={handleUndo}
        onRedo={handleRedo}
        onToggleRoutingMode={() =>
          setRoutingMode((prev) => (prev === 'follow-roads' ? 'straight-line' : 'follow-roads'))
        }
        onToggleMapStyle={handleToggleMapStyle}
        onOutAndBack={handleOutAndBack}
        onCloseLoop={handleCloseLoop}
        onReverseRoute={handleReverseRoute}
        onClearRoute={handleClearRoute}
        onOpenExportModal={() => setIsExportModalOpen(true)}
        onLoadPreset={handleLoadPreset}
        onChangePace={setTargetPaceMinutes}
      />

      {/* Bottom Elevation Dock */}
      <ElevationChart
        elevationStats={elevationStats}
        onHoverCoordinate={setHoverCoordinate}
      />

      {/* Export to Garmin/Coros Modal */}
      <ExportModal
        isOpen={isExportModalOpen}
        onClose={() => setIsExportModalOpen(false)}
        totalDistanceKm={distanceMeters / 1000}
        elevationStats={elevationStats}
        targetPaceMinutes={targetPaceMinutes}
        onConfirmExport={handleConfirmExport}
      />
    </div>
  );
}

export default App;
