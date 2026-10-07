import { useEffect, useRef, type FC } from 'react';
import * as maplibregl from 'maplibre-gl';
import type { Coordinate, MapStyleMode, Waypoint } from '../types/route';

interface MapCanvasProps {
  waypoints: Waypoint[];
  routeCoordinates: Coordinate[];
  mapStyle: MapStyleMode;
  hoverCoordinate: Coordinate | null;
  onAddWaypoint: (coord: Coordinate) => void;
  onMapLoaded?: () => void;
}

const STYLE_URLS: Record<MapStyleMode, string | maplibregl.StyleSpecification> = {
  outdoor: 'https://tiles.openfreemap.org/styles/liberty',
  streets: 'https://tiles.openfreemap.org/styles/bright',
  dark: {
    version: 8,
    sources: {
      'carto-dark': {
        type: 'raster',
        tiles: [
          'https://a.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png',
          'https://b.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png',
          'https://c.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png',
        ],
        tileSize: 256,
        attribution: '&copy; OpenStreetMap contributors &copy; CARTO',
      },
    },
    layers: [
      {
        id: 'carto-dark-layer',
        type: 'raster',
        source: 'carto-dark',
        minzoom: 0,
        maxzoom: 20,
      },
    ],
  },
};

export const MapCanvas: FC<MapCanvasProps> = ({
  waypoints,
  routeCoordinates,
  mapStyle,
  hoverCoordinate,
  onAddWaypoint,
  onMapLoaded,
}) => {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const startMarkerRef = useRef<maplibregl.Marker | null>(null);
  const finishMarkerRef = useRef<maplibregl.Marker | null>(null);
  const scrubberMarkerRef = useRef<maplibregl.Marker | null>(null);

  // Initialize Map
  useEffect(() => {
    if (!mapContainerRef.current) return;

    // Default center (Padang / Indonesia)
    const initialCenter: [number, number] = [100.3543, -0.9471];

    const map = new maplibregl.Map({
      container: mapContainerRef.current,
      style: STYLE_URLS[mapStyle],
      center: initialCenter,
      zoom: 14,
      pitch: 0,
    });

    map.addControl(new maplibregl.NavigationControl({ showCompass: true }), 'bottom-right');

    map.on('load', () => {
      // Add Route Line Source
      map.addSource('route-line-source', {
        type: 'geojson',
        data: {
          type: 'Feature',
          properties: {},
          geometry: {
            type: 'LineString',
            coordinates: [],
          },
        },
      });

      // Outer Casing / Glow
      map.addLayer({
        id: 'route-line-casing',
        type: 'line',
        source: 'route-line-source',
        layout: {
          'line-cap': 'round',
          'line-join': 'round',
        },
        paint: {
          'line-color': '#064e3b',
          'line-width': 8,
          'line-opacity': 0.8,
        },
      });

      // Main Route Line
      map.addLayer({
        id: 'route-line-main',
        type: 'line',
        source: 'route-line-source',
        layout: {
          'line-cap': 'round',
          'line-join': 'round',
        },
        paint: {
          'line-color': '#10b981',
          'line-width': 5,
        },
      });

      // Waypoints Point Source
      map.addSource('waypoints-source', {
        type: 'geojson',
        data: {
          type: 'FeatureCollection',
          features: [],
        },
      });

      map.addLayer({
        id: 'waypoints-circles',
        type: 'circle',
        source: 'waypoints-source',
        paint: {
          'circle-radius': 5,
          'circle-color': '#ffffff',
          'circle-stroke-width': 2.5,
          'circle-stroke-color': '#10b981',
        },
      });

      // Map canvas click listener
      map.on('click', (e: maplibregl.MapMouseEvent) => {
        onAddWaypoint([e.lngLat.lng, e.lngLat.lat]);
      });

      map.getCanvas().style.cursor = 'crosshair';

      // Auto detect user location if available
      if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
          (pos) => {
            const userCoord: [number, number] = [pos.coords.longitude, pos.coords.latitude];
            map.flyTo({ center: userCoord, zoom: 15, duration: 1500 });
          },
          () => {
            // keep default
          },
          { enableHighAccuracy: true, timeout: 5000 }
        );
      }

      onMapLoaded?.();
    });

    mapRef.current = map;

    return () => {
      map.remove();
    };
  }, []);

  // Update Style on change
  useEffect(() => {
    if (!mapRef.current) return;
    mapRef.current.setStyle(STYLE_URLS[mapStyle]);
  }, [mapStyle]);

  // Update Route Polyline & Waypoints
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const source = map.getSource('route-line-source') as maplibregl.GeoJSONSource;
    if (source) {
      source.setData({
        type: 'Feature',
        properties: {},
        geometry: {
          type: 'LineString',
          coordinates: routeCoordinates,
        },
      });
    }

    const waypointsSource = map.getSource('waypoints-source') as maplibregl.GeoJSONSource;
    if (waypointsSource) {
      waypointsSource.setData({
        type: 'FeatureCollection',
        features: waypoints.map((wp, idx) => ({
          type: 'Feature',
          properties: { index: idx },
          geometry: {
            type: 'Point',
            coordinates: wp.coord,
          },
        })),
      });
    }

    // Start Marker
    if (waypoints.length > 0) {
      const startCoord = waypoints[0].coord;
      if (!startMarkerRef.current) {
        const el = document.createElement('div');
        el.className = 'map-marker-start';
        el.innerHTML = `<div style="background:#10b981; color:#fff; font-weight:800; font-size:11px; width:26px; height:26px; border-radius:50%; display:flex; align-items:center; justify-content:center; box-shadow:0 2px 10px rgba(0,0,0,0.5); border:2px solid #fff;">S</div>`;
        startMarkerRef.current = new maplibregl.Marker({ element: el })
          .setLngLat(startCoord)
          .addTo(map);
      } else {
        startMarkerRef.current.setLngLat(startCoord);
      }
    } else if (startMarkerRef.current) {
      startMarkerRef.current.remove();
      startMarkerRef.current = null;
    }

    // Finish Marker (only if more than 1 waypoint)
    if (waypoints.length > 1) {
      const finishCoord = waypoints[waypoints.length - 1].coord;
      if (!finishMarkerRef.current) {
        const el = document.createElement('div');
        el.className = 'map-marker-finish';
        el.innerHTML = `<div style="background:#f97316; color:#fff; font-weight:800; font-size:11px; width:26px; height:26px; border-radius:50%; display:flex; align-items:center; justify-content:center; box-shadow:0 2px 10px rgba(0,0,0,0.5); border:2px solid #fff;">F</div>`;
        finishMarkerRef.current = new maplibregl.Marker({ element: el })
          .setLngLat(finishCoord)
          .addTo(map);
      } else {
        finishMarkerRef.current.setLngLat(finishCoord);
      }
    } else if (finishMarkerRef.current) {
      finishMarkerRef.current.remove();
      finishMarkerRef.current = null;
    }
  }, [routeCoordinates, waypoints]);

  // Elevation Hover Scrubber Marker
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (hoverCoordinate) {
      if (!scrubberMarkerRef.current) {
        const el = document.createElement('div');
        el.innerHTML = `<div style="width:16px; height:16px; border-radius:50%; background:#06b6d4; border:3px solid #fff; box-shadow:0 0 12px #06b6d4;"></div>`;
        scrubberMarkerRef.current = new maplibregl.Marker({ element: el })
          .setLngLat(hoverCoordinate)
          .addTo(map);
      } else {
        scrubberMarkerRef.current.setLngLat(hoverCoordinate);
      }
    } else if (scrubberMarkerRef.current) {
      scrubberMarkerRef.current.remove();
      scrubberMarkerRef.current = null;
    }
  }, [hoverCoordinate]);

  return <div id="map-canvas" ref={mapContainerRef} className="map-canvas-container" />;
};
