import { useEffect, useRef, useState, type FC } from 'react';
import * as maplibregl from 'maplibre-gl';
import type { Coordinate, MapStyleMode, Waypoint } from '../types/route';
import { Search, Loader2, Navigation, Maximize2 } from 'lucide-react';

interface MapCanvasProps {
  waypoints: Waypoint[];
  routeCoordinates: Coordinate[];
  mapStyle: MapStyleMode;
  hoverCoordinate: Coordinate | null;
  onAddWaypoint: (coord: Coordinate) => void;
  onMapLoaded?: () => void;
}

const MULTI_LAYER_STYLE: maplibregl.StyleSpecification = {
  version: 8,
  sources: {
    'osm-tiles': {
      type: 'raster',
      tiles: [
        'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
      ],
      tileSize: 256,
      attribution: '&copy; OpenStreetMap contributors',
      maxzoom: 19,
    },
    'carto-voyager': {
      type: 'raster',
      tiles: [
        'https://a.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}@2x.png',
        'https://b.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}@2x.png',
        'https://c.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}@2x.png',
      ],
      tileSize: 256,
      attribution: '&copy; OpenStreetMap contributors &copy; CARTO',
      maxzoom: 20,
    },
    'carto-dark': {
      type: 'raster',
      tiles: [
        'https://a.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}@2x.png',
        'https://b.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}@2x.png',
        'https://c.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}@2x.png',
      ],
      tileSize: 256,
      attribution: '&copy; OpenStreetMap contributors &copy; CARTO',
      maxzoom: 20,
    },
  },
  layers: [
    {
      id: 'layer-osm',
      type: 'raster',
      source: 'osm-tiles',
      minzoom: 0,
      maxzoom: 19,
      layout: {
        visibility: 'visible',
      },
    },
    {
      id: 'layer-carto-voyager',
      type: 'raster',
      source: 'carto-voyager',
      minzoom: 0,
      maxzoom: 20,
      layout: {
        visibility: 'none',
      },
    },
    {
      id: 'layer-carto-dark',
      type: 'raster',
      source: 'carto-dark',
      minzoom: 0,
      maxzoom: 20,
      layout: {
        visibility: 'none',
      },
    },
  ],
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

  const [isMapReady, setIsMapReady] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);

  // Initialize Map
  useEffect(() => {
    if (!mapContainerRef.current) return;

    // Default center: Indonesia (Padang Beach running strip / Monas)
    const initialCenter: [number, number] = [100.3543, -0.9471];

    const map = new maplibregl.Map({
      container: mapContainerRef.current,
      style: MULTI_LAYER_STYLE,
      center: initialCenter,
      zoom: 15,
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
            coordinates: routeCoordinates,
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
          'line-color': '#022c22',
          'line-width': 9,
          'line-opacity': 0.9,
        },
      });

      // Main Route Line (Bright Athletic Emerald)
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
          'line-width': 6,
        },
      });

      // Waypoints Point Source
      map.addSource('waypoints-source', {
        type: 'geojson',
        data: {
          type: 'FeatureCollection',
          features: waypoints.map((wp, idx) => ({
            type: 'Feature',
            properties: { index: idx },
            geometry: {
              type: 'Point',
              coordinates: wp.coord,
            },
          })),
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

      // Click listener
      map.on('click', (e: maplibregl.MapMouseEvent) => {
        onAddWaypoint([e.lngLat.lng, e.lngLat.lat]);
      });

      map.getCanvas().style.cursor = 'crosshair';

      setIsMapReady(true);

      // If initial route exists, fit bounds immediately
      if (routeCoordinates.length > 1) {
        const bounds = new maplibregl.LngLatBounds(routeCoordinates[0], routeCoordinates[0]);
        routeCoordinates.forEach((c) => bounds.extend(c));
        map.fitBounds(bounds, { padding: 90, duration: 800, maxZoom: 16 });
      }

      // Auto detect user location
      if (navigator.geolocation && routeCoordinates.length === 0) {
        navigator.geolocation.getCurrentPosition(
          (pos) => {
            const userCoord: [number, number] = [pos.coords.longitude, pos.coords.latitude];
            map.flyTo({ center: userCoord, zoom: 15, duration: 1500 });
          },
          () => {},
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

  // Update Map Layer visibility on style change (Preserves all route lines!)
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !isMapReady) return;

    if (mapStyle === 'dark') {
      map.setLayoutProperty('layer-carto-dark', 'visibility', 'visible');
      map.setLayoutProperty('layer-osm', 'visibility', 'none');
      map.setLayoutProperty('layer-carto-voyager', 'visibility', 'none');
      if (map.getLayer('route-line-main')) {
        map.setPaintProperty('route-line-main', 'line-color', '#10b981');
        map.setPaintProperty('route-line-casing', 'line-color', '#022c22');
      }
    } else if (mapStyle === 'streets') {
      map.setLayoutProperty('layer-carto-voyager', 'visibility', 'visible');
      map.setLayoutProperty('layer-osm', 'visibility', 'none');
      map.setLayoutProperty('layer-carto-dark', 'visibility', 'none');
      if (map.getLayer('route-line-main')) {
        map.setPaintProperty('route-line-main', 'line-color', '#059669');
        map.setPaintProperty('route-line-casing', 'line-color', '#064e3b');
      }
    } else {
      // Default: OSM Classic (High contrast roads)
      map.setLayoutProperty('layer-osm', 'visibility', 'visible');
      map.setLayoutProperty('layer-carto-voyager', 'visibility', 'none');
      map.setLayoutProperty('layer-carto-dark', 'visibility', 'none');
      if (map.getLayer('route-line-main')) {
        map.setPaintProperty('route-line-main', 'line-color', '#059669');
        map.setPaintProperty('route-line-casing', 'line-color', '#064e3b');
      }
    }
  }, [mapStyle, isMapReady]);

  // Update Route Polyline & Waypoints whenever coordinates change OR map becomes ready
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !isMapReady) return;

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
        el.innerHTML = `<div style="background:#10b981; color:#fff; font-weight:800; font-size:11px; width:26px; height:26px; border-radius:50%; display:flex; align-items:center; justify-content:center; box-shadow:0 3px 12px rgba(0,0,0,0.5); border:2px solid #fff;">S</div>`;
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
        el.innerHTML = `<div style="background:#f97316; color:#fff; font-weight:800; font-size:11px; width:26px; height:26px; border-radius:50%; display:flex; align-items:center; justify-content:center; box-shadow:0 3px 12px rgba(0,0,0,0.5); border:2px solid #fff;">F</div>`;
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
  }, [routeCoordinates, waypoints, isMapReady]);

  // Elevation Hover Scrubber Marker
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !isMapReady) return;

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
  }, [hoverCoordinate, isMapReady]);

  // Fit bounds to entire route
  const handleFitRouteBounds = () => {
    const map = mapRef.current;
    if (!map || routeCoordinates.length < 2) return;

    const bounds = new maplibregl.LngLatBounds(routeCoordinates[0], routeCoordinates[0]);
    routeCoordinates.forEach((coord) => bounds.extend(coord));
    map.fitBounds(bounds, { padding: 90, duration: 1000 });
  };

  // Search city or street with Nominatim
  const handleSearchSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim() || !mapRef.current) return;

    setIsSearching(true);
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(
          searchQuery.trim()
        )}&limit=1`
      );
      if (res.ok) {
        const results = await res.json();
        if (results && results.length > 0) {
          const lat = parseFloat(results[0].lat);
          const lon = parseFloat(results[0].lon);
          mapRef.current.flyTo({
            center: [lon, lat],
            zoom: 15,
            duration: 1500,
          });
        }
      }
    } catch {
      // Ignore network error
    } finally {
      setIsSearching(false);
    }
  };

  // Fly to user location
  const handleGeolocate = () => {
    if (!navigator.geolocation || !mapRef.current) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        mapRef.current?.flyTo({
          center: [pos.coords.longitude, pos.coords.latitude],
          zoom: 16,
          duration: 1500,
        });
      },
      () => {
        alert('Tidak dapat mendeteksi lokasi GPS browser.');
      },
      { enableHighAccuracy: true }
    );
  };

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      {/* Top Search & Navigation Float Bar */}
      <div
        className="glass-panel"
        style={{
          position: 'absolute',
          top: '76px',
          left: '16px',
          zIndex: 10,
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          padding: '4px 10px',
          maxWidth: '340px',
        }}
      >
        <form onSubmit={handleSearchSubmit} style={{ display: 'flex', alignItems: 'center', gap: '6px', width: '100%' }}>
          <Search size={16} color="var(--text-dim)" />
          <input
            id="map-search-input"
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Cari kota / jalan (mis: Padang)..."
            style={{
              background: 'transparent',
              border: 'none',
              color: '#fff',
              fontSize: '0.8rem',
              outline: 'none',
              width: '180px',
              fontFamily: 'inherit',
            }}
          />
          {isSearching ? (
            <Loader2 size={16} className="animate-spin" color="var(--color-primary)" />
          ) : (
            <button
              type="submit"
              style={{
                fontSize: '0.72rem',
                fontWeight: 600,
                color: 'var(--color-primary)',
                padding: '2px 6px',
              }}
            >
              Cari
            </button>
          )}
        </form>

        {/* GPS Button */}
        <button
          onClick={handleGeolocate}
          style={{ padding: '4px', color: 'var(--text-muted)' }}
          title="Lokasi Saya (GPS)"
        >
          <Navigation size={15} />
        </button>

        {/* Fit Bounds Button */}
        {routeCoordinates.length > 1 && (
          <button
            onClick={handleFitRouteBounds}
            style={{ padding: '4px', color: 'var(--color-primary)' }}
            title="Lihat Seluruh Rute"
          >
            <Maximize2 size={15} />
          </button>
        )}
      </div>

      {/* Main Map Container */}
      <div id="map-canvas" ref={mapContainerRef} className="map-canvas-container" />
    </div>
  );
};
