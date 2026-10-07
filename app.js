/**
 * RunRoute — Ultra-Lightweight Running Route Planner & GPX Exporter
 * 100% Client-Side. 0% Server CPU. 0 MB Server Memory.
 */

// Application State
const state = {
  waypoints: [],      // [{ lat, lng, isManual }]
  routeCoords: [],    // [[lat, lng], ...]
  history: [],        // [{ waypoints, routeCoords }]
  historyIndex: -1,
  routingMode: 'follow-roads', // 'follow-roads' | 'straight-line'
  mapLayer: 'streets',    // 'streets' | 'osm' | 'topo'
  targetPace: 5.5,    // min/km (5:30/km)
  elevationStats: null,
};

const STORAGE_KEY = 'runroute_v2_state';

// Tile Layers Configuration (100% Free, Full CORS, No API Keys)
const TILE_PROVIDERS = {
  streets: {
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}',
    options: {
      maxZoom: 19,
      attribution: '&copy; Esri, HERE, Garmin, USGS, OpenStreetMap',
    },
  },
  osm: {
    url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
    options: {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap contributors',
    },
  },
  topo: {
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}',
    options: {
      maxZoom: 19,
      attribution: '&copy; Esri, Intermap, OpenStreetMap',
    },
  },
};

// Initialize Leaflet Map
const defaultCenter = [-0.9471, 100.3543]; // Padang / Indonesia
const map = L.map('map', {
  center: defaultCenter,
  zoom: 15,
  zoomControl: false,
});

// Custom zoom control in bottom-right
L.control.zoom({ position: 'bottom-right' }).addTo(map);

let currentTileLayer = L.tileLayer(TILE_PROVIDERS.streets.url, TILE_PROVIDERS.streets.options).addTo(map);

// Invalidate size on start to ensure tiles fill screen immediately
map.invalidateSize();
setTimeout(() => map.invalidateSize(), 150);
setTimeout(() => map.invalidateSize(), 600);
window.addEventListener('resize', () => map.invalidateSize());

// Route Polylines
const casingPolyline = L.polyline([], {
  color: '#022c22',
  weight: 9,
  opacity: 0.85,
  lineCap: 'round',
  lineJoin: 'round',
}).addTo(map);

const mainPolyline = L.polyline([], {
  color: '#10b981',
  weight: 6,
  opacity: 1,
  lineCap: 'round',
  lineJoin: 'round',
}).addTo(map);

// Markers Layer Group
const markersGroup = L.layerGroup().addTo(map);
let scrubberMarker = null;

// Haversine Distance (Meters)
function getDistanceMeters(c1, c2) {
  const [lat1, lon1] = c1;
  const [lat2, lon2] = c2;
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function calculateTotalDistance(coords) {
  if (coords.length < 2) return 0;
  let total = 0;
  for (let i = 0; i < coords.length - 1; i++) {
    total += getDistanceMeters(coords[i], coords[i + 1]);
  }
  return total;
}

// OSRM Pedestrian Routing Service
async function getRouteSegment(from, to, mode = 'follow-roads') {
  if (mode === 'straight-line') {
    return [from, to];
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 2500);

    // OSRM takes {lng},{lat};{lng},{lat}
    const url = `https://router.project-osrm.org/route/v1/foot/${from[1]},${from[0]};${to[1]},${to[0]}?overview=full&geometries=geojson`;
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timeout);

    if (!res.ok) return [from, to];

    const data = await res.json();
    if (data.code === 'Ok' && data.routes && data.routes[0]) {
      // Convert GeoJSON [lng, lat] to Leaflet [lat, lng]
      return data.routes[0].geometry.coordinates.map((c) => [c[1], c[0]]);
    }
  } catch {
    // Fallback to straight line
    return [from, to];
  }

  return [from, to];
}

// Fetch Elevation Data via Open-Meteo API
async function fetchElevation(coords) {
  if (coords.length < 2) return null;

  // Sample up to 80 points along the route
  const maxSamples = 80;
  const sampleIndices = [];
  const step = Math.max(1, Math.floor(coords.length / maxSamples));
  for (let i = 0; i < coords.length; i += step) {
    sampleIndices.push(i);
  }
  if (sampleIndices[sampleIndices.length - 1] !== coords.length - 1) {
    sampleIndices.push(coords.length - 1);
  }

  const sampledCoords = sampleIndices.map((i) => coords[i]);
  const lats = sampledCoords.map((c) => c[0].toFixed(5)).join(',');
  const lons = sampledCoords.map((c) => c[1].toFixed(5)).join(',');

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 4000);

    const res = await fetch(
      `https://api.open-meteo.com/v1/elevation?latitude=${lats}&longitude=${lons}`,
      { signal: controller.signal }
    );
    clearTimeout(timeout);

    if (!res.ok) return null;

    const data = await res.json();
    const elevations = data.elevation;
    if (!elevations || elevations.length === 0) return null;

    let gain = 0;
    let loss = 0;
    let minEle = elevations[0];
    let maxEle = elevations[0];

    // Cumulative distances
    let cumDist = 0;
    const points = elevations.map((ele, idx) => {
      const origIdx = sampleIndices[idx];
      if (idx > 0) {
        const prevIdx = sampleIndices[idx - 1];
        cumDist += getDistanceMeters(coords[prevIdx], coords[origIdx]);
        const diff = ele - elevations[idx - 1];
        if (diff > 0) gain += diff;
        else loss += Math.abs(diff);
      }
      if (ele < minEle) minEle = ele;
      if (ele > maxEle) maxEle = ele;

      return {
        distanceKm: Number((cumDist / 1000).toFixed(2)),
        elevationM: Math.round(ele),
        coord: coords[origIdx],
      };
    });

    return {
      gain: Math.round(gain),
      loss: Math.round(loss),
      minElevation: Math.round(minEle),
      maxElevation: Math.round(maxEle),
      points,
    };
  } catch {
    return null;
  }
}

// Update Map Renderings
function renderMap() {
  casingPolyline.setLatLngs(state.routeCoords);
  mainPolyline.setLatLngs(state.routeCoords);

  markersGroup.clearLayers();

  state.waypoints.forEach((wp, idx) => {
    let pinHtml = `<div class="custom-runner-pin pin-waypoint"></div>`;
    let iconSize = [12, 12];
    let iconAnchor = [6, 6];

    if (idx === 0) {
      pinHtml = `<div class="custom-runner-pin pin-start">S</div>`;
      iconSize = [28, 28];
      iconAnchor = [14, 14];
    } else if (idx === state.waypoints.length - 1 && state.waypoints.length > 1) {
      pinHtml = `<div class="custom-runner-pin pin-finish">F</div>`;
      iconSize = [28, 28];
      iconAnchor = [14, 14];
    }

    const icon = L.divIcon({
      html: pinHtml,
      className: '',
      iconSize: iconSize,
      iconAnchor: iconAnchor,
    });

    L.marker([wp.lat, wp.lng], { icon }).addTo(markersGroup);
  });

  updateMetricsUI();
}

// Update Top HUD Metrics
function updateMetricsUI() {
  const totalMeters = calculateTotalDistance(state.routeCoords);
  const km = totalMeters / 1000;

  document.getElementById('stat-distance').textContent = `${km.toFixed(2)} km`;

  // Duration
  const totalSeconds = km * (state.targetPace * 60);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = Math.floor(totalSeconds % 60);
  const timeStr = hours > 0 ? `${hours}j ${minutes}m` : `${minutes}m ${seconds}s`;

  document.getElementById('stat-time').textContent = km > 0 ? timeStr : '00:00';

  // Elevation
  const elevGain = state.elevationStats ? state.elevationStats.gain : 0;
  document.getElementById('stat-elevation').textContent = `+${elevGain}m`;

  // Buttons state
  const hasPoints = state.waypoints.length > 0;
  const hasRoute = state.waypoints.length >= 2;

  document.getElementById('btn-export-gpx').disabled = !hasRoute;
  document.getElementById('btn-out-back').disabled = !hasRoute;
  document.getElementById('btn-close-loop').disabled = !hasRoute;
  document.getElementById('btn-reverse').disabled = !hasRoute;
  document.getElementById('btn-clear').disabled = !hasPoints;
  document.getElementById('btn-undo').disabled = state.historyIndex < 0;
  document.getElementById('btn-redo').disabled = state.historyIndex >= state.history.length - 1;

  document.getElementById('btn-fit-route').style.display = hasRoute ? 'flex' : 'none';
  document.getElementById('guide-toast').style.display = hasPoints ? 'none' : 'block';

  // Update Elevation Chart Dock
  renderElevationChart();
}

// Render SVG Elevation Chart
function renderElevationChart() {
  const dock = document.getElementById('elevation-dock');
  const stats = state.elevationStats;

  if (!stats || stats.points.length < 2) {
    dock.style.display = 'none';
    return;
  }

  dock.style.display = 'block';

  document.getElementById('badge-gain').textContent = `+${stats.gain}m`;
  document.getElementById('badge-loss').textContent = `-${stats.loss}m`;
  document.getElementById('badge-range').textContent = `${stats.minElevation}m - ${stats.maxElevation}m`;

  const pts = stats.points;
  const totalKm = pts[pts.length - 1].distanceKm;
  const width = 800;
  const height = 80;
  const padX = 8;
  const padY = 10;
  const effW = width - padX * 2;
  const effH = height - padY * 2;
  const elevSpan = Math.max(15, stats.maxElevation - stats.minElevation);

  const svgCoords = pts.map((pt) => {
    const x = padX + (pt.distanceKm / totalKm) * effW;
    const y = height - padY - ((pt.elevationM - stats.minElevation) / elevSpan) * effH;
    return { x, y, pt };
  });

  const pathD = svgCoords.reduce((acc, curr, idx) => {
    return `${acc} ${idx === 0 ? 'M' : 'L'} ${curr.x.toFixed(1)},${curr.y.toFixed(1)}`;
  }, '');

  const fillD = `${pathD} L ${(padX + effW).toFixed(1)},${(height - padY).toFixed(1)} L ${padX},${(height - padY).toFixed(1)} Z`;

  document.getElementById('svg-stroke-path').setAttribute('d', pathD);
  document.getElementById('svg-fill-path').setAttribute('d', fillD);
}

// Interactive Elevation Scrubber
const elevationSvg = document.getElementById('elevation-svg');
elevationSvg.addEventListener('mousemove', (e) => {
  const stats = state.elevationStats;
  if (!stats || stats.points.length < 2) return;

  const rect = elevationSvg.getBoundingClientRect();
  const mouseX = e.clientX - rect.left;
  const ratio = Math.max(0, Math.min(1, mouseX / rect.width));
  const pts = stats.points;
  const targetKm = ratio * pts[pts.length - 1].distanceKm;

  let nearest = pts[0];
  let minDiff = Infinity;
  pts.forEach((p) => {
    const diff = Math.abs(p.distanceKm - targetKm);
    if (diff < minDiff) {
      minDiff = diff;
      nearest = p;
    }
  });

  document.getElementById('elevation-hover-info').textContent = `${nearest.elevationM}m @ ${nearest.distanceKm} km`;

  const lineX = (ratio * 800).toFixed(1);
  const scrubberLine = document.getElementById('svg-scrubber-line');
  const scrubberDot = document.getElementById('svg-scrubber-dot');
  scrubberLine.setAttribute('x1', lineX);
  scrubberLine.setAttribute('x2', lineX);
  scrubberLine.style.display = 'block';

  // Map scrubber pulse marker
  if (!scrubberMarker) {
    const el = L.divIcon({
      html: `<div style="width:16px; height:16px; border-radius:50%; background:#06b6d4; border:3px solid #fff; box-shadow:0 0 10px #06b6d4;"></div>`,
      className: '',
      iconSize: [16, 16],
      iconAnchor: [8, 8],
    });
    scrubberMarker = L.marker(nearest.coord, { icon: el }).addTo(map);
  } else {
    scrubberMarker.setLatLng(nearest.coord);
  }
});

elevationSvg.addEventListener('mouseleave', () => {
  document.getElementById('elevation-hover-info').textContent = '';
  document.getElementById('svg-scrubber-line').style.display = 'none';
  if (scrubberMarker) {
    map.removeLayer(scrubberMarker);
    scrubberMarker = null;
  }
});

// History Tracking
function recordHistory() {
  const sliced = state.history.slice(0, state.historyIndex + 1);
  state.history = [...sliced, { waypoints: [...state.waypoints], routeCoords: [...state.routeCoords] }];
  state.historyIndex = state.history.length - 1;

  // Save to localStorage
  localStorage.setItem(STORAGE_KEY, JSON.stringify({
    waypoints: state.waypoints,
    routeCoords: state.routeCoords,
    targetPace: state.targetPace,
  }));
}

// Add Waypoint
async function addWaypoint(latlng) {
  const wp = { lat: latlng.lat, lng: latlng.lng, isManual: state.routingMode === 'straight-line' };

  if (state.waypoints.length === 0) {
    state.waypoints = [wp];
    state.routeCoords = [[wp.lat, wp.lng]];
    recordHistory();
    renderMap();
    return;
  }

  const lastWp = state.waypoints[state.waypoints.length - 1];
  const segment = await getRouteSegment([lastWp.lat, lastWp.lng], [wp.lat, wp.lng], state.routingMode);

  state.waypoints.push(wp);
  // Avoid duplicate joint coordinate
  state.routeCoords = [...state.routeCoords, ...segment.slice(1)];

  recordHistory();
  renderMap();

  // Async elevation
  fetchElevation(state.routeCoords).then((res) => {
    state.elevationStats = res;
    updateMetricsUI();
  });
}

// Map Click Listener
map.on('click', (e) => {
  addWaypoint(e.latlng);
});

// Action: Undo
function handleUndo() {
  if (state.historyIndex > 0) {
    state.historyIndex--;
    const prev = state.history[state.historyIndex];
    state.waypoints = [...prev.waypoints];
    state.routeCoords = [...prev.routeCoords];
    renderMap();
    fetchElevation(state.routeCoords).then((res) => {
      state.elevationStats = res;
      updateMetricsUI();
    });
  } else if (state.historyIndex === 0) {
    state.historyIndex = -1;
    state.waypoints = [];
    state.routeCoords = [];
    state.elevationStats = null;
    renderMap();
  }
}

// Action: Redo
function handleRedo() {
  if (state.historyIndex < state.history.length - 1) {
    state.historyIndex++;
    const next = state.history[state.historyIndex];
    state.waypoints = [...next.waypoints];
    state.routeCoords = [...next.routeCoords];
    renderMap();
    fetchElevation(state.routeCoords).then((res) => {
      state.elevationStats = res;
      updateMetricsUI();
    });
  }
}

// Action: Out & Back (Balik Rute)
async function handleOutAndBack() {
  if (state.waypoints.length < 2) return;
  const reversedWps = [...state.waypoints].reverse().slice(1);

  for (const wp of reversedWps) {
    const lastCoord = state.routeCoords[state.routeCoords.length - 1];
    const segment = await getRouteSegment(lastCoord, [wp.lat, wp.lng], state.routingMode);
    state.routeCoords = [...state.routeCoords, ...segment.slice(1)];
    state.waypoints.push({ ...wp });
  }

  recordHistory();
  renderMap();
  fetchElevation(state.routeCoords).then((res) => {
    state.elevationStats = res;
    updateMetricsUI();
  });
}

// Action: Close Loop
async function handleCloseLoop() {
  if (state.waypoints.length < 2) return;
  const startWp = state.waypoints[0];
  const lastCoord = state.routeCoords[state.routeCoords.length - 1];

  const segment = await getRouteSegment(lastCoord, [startWp.lat, startWp.lng], state.routingMode);
  state.waypoints.push({ ...startWp });
  state.routeCoords = [...state.routeCoords, ...segment.slice(1)];

  recordHistory();
  renderMap();
  fetchElevation(state.routeCoords).then((res) => {
    state.elevationStats = res;
    updateMetricsUI();
  });
}

// Action: Reverse Route
async function handleReverse() {
  if (state.waypoints.length < 2) return;
  const revWps = [...state.waypoints].reverse();
  let newCoords = [[revWps[0].lat, revWps[0].lng]];

  for (let i = 0; i < revWps.length - 1; i++) {
    const seg = await getRouteSegment([revWps[i].lat, revWps[i].lng], [revWps[i + 1].lat, revWps[i + 1].lng], state.routingMode);
    newCoords = [...newCoords, ...seg.slice(1)];
  }

  state.waypoints = revWps;
  state.routeCoords = newCoords;

  recordHistory();
  renderMap();
  fetchElevation(state.routeCoords).then((res) => {
    state.elevationStats = res;
    updateMetricsUI();
  });
}

// Action: Reset
function handleClear() {
  state.waypoints = [];
  state.routeCoords = [];
  state.history = [];
  state.historyIndex = -1;
  state.elevationStats = null;
  localStorage.removeItem(STORAGE_KEY);
  renderMap();
}

// Action: Demo Preset (Padang Beach Waterfront 5K)
async function handleDemoPreset() {
  const preset = [
    [-0.9471, 100.3543],
    [-0.9385, 100.3521],
    [-0.9298, 100.3562],
    [-0.9342, 100.3615],
    [-0.9471, 100.3543],
  ];

  state.waypoints = preset.map((c) => ({ lat: c[0], lng: c[1] }));
  let full = [preset[0]];

  for (let i = 0; i < preset.length - 1; i++) {
    const seg = await getRouteSegment(preset[i], preset[i + 1], 'follow-roads');
    full = [...full, ...seg.slice(1)];
  }

  state.routeCoords = full;
  recordHistory();
  renderMap();

  // Fit bounds
  const bounds = L.latLngBounds(state.routeCoords);
  map.fitBounds(bounds, { padding: [80, 80] });

  fetchElevation(state.routeCoords).then((res) => {
    state.elevationStats = res;
    updateMetricsUI();
  });
}

// GPX 1.1 Exporter
function generateGpxXml(name, desc, paceMinutes) {
  const now = new Date();
  const startTime = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 6, 0, 0);
  const paceSecondsPerMeter = (paceMinutes * 60) / 1000;

  let currentTimestampMs = startTime.getTime();
  let cumulativeDist = 0;
  const pts = state.elevationStats ? state.elevationStats.points : [];

  const trkpts = state.routeCoords.map((coord, idx) => {
    const [lat, lon] = coord;
    if (idx > 0) {
      const segDist = getDistanceMeters(state.routeCoords[idx - 1], coord);
      cumulativeDist += segDist;
      currentTimestampMs += segDist * paceSecondsPerMeter * 1000;
    }

    const isoTime = new Date(currentTimestampMs).toISOString();

    // Elevation lookup
    let eleTag = '';
    if (pts.length > 0) {
      const curKm = cumulativeDist / 1000;
      let eleVal = pts[0].elevationM;
      for (let j = 0; j < pts.length; j++) {
        if (pts[j].distanceKm <= curKm) {
          eleVal = pts[j].elevationM;
        } else {
          break;
        }
      }
      eleTag = `\n        <ele>${eleVal.toFixed(1)}</ele>`;
    }

    return `      <trkpt lat="${lat.toFixed(6)}" lon="${lon.toFixed(6)}">${eleTag}\n        <time>${isoTime}</time>\n      </trkpt>`;
  });

  return `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="RunRoute - Running Route Planner (https://runroute.local)"
  xmlns="http://www.topografix.com/GPX/1/1"
  xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
  xsi:schemaLocation="http://www.topografix.com/GPX/1/1 http://www.topografix.com/GPX/1/1/gpx.xsd">
  <metadata>
    <name>${escapeXml(name)}</name>
    <desc>${escapeXml(desc)}</desc>
    <time>${startTime.toISOString()}</time>
  </metadata>
  <trk>
    <name>${escapeXml(name)}</name>
    <type>running</type>
    <trkseg>
${trkpts.join('\n')}
    </trkseg>
  </trk>
</gpx>`;
}

function escapeXml(unsafe) {
  return String(unsafe).replace(/[<>&'"]/g, (c) => {
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

function triggerDownloadGpx(filename, xml) {
  const blob = new Blob([xml], { type: 'application/gpx+xml;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename.endsWith('.gpx') ? filename : `${filename}.gpx`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// Event Listeners
document.getElementById('btn-undo').addEventListener('click', handleUndo);
document.getElementById('btn-redo').addEventListener('click', handleRedo);
document.getElementById('btn-out-back').addEventListener('click', handleOutAndBack);
document.getElementById('btn-close-loop').addEventListener('click', handleCloseLoop);
document.getElementById('btn-reverse').addEventListener('click', handleReverse);
document.getElementById('btn-clear').addEventListener('click', handleClear);
document.getElementById('btn-demo-preset').addEventListener('click', handleDemoPreset);

// Routing Mode Toggle
const btnToggleMode = document.getElementById('btn-toggle-mode');
btnToggleMode.addEventListener('click', () => {
  if (state.routingMode === 'follow-roads') {
    state.routingMode = 'straight-line';
    btnToggleMode.classList.remove('active');
    document.getElementById('mode-text').textContent = 'Garis Lurus';
    btnToggleMode.title = 'Mode: Garis Lurus (Klik untuk Snap Jalan)';
  } else {
    state.routingMode = 'follow-roads';
    btnToggleMode.classList.add('active');
    document.getElementById('mode-text').textContent = 'Snap Jalan';
    btnToggleMode.title = 'Mode: Snap Jalan (Klik untuk Garis Lurus)';
  }
});

// Map Layer Switcher
document.getElementById('btn-toggle-layer').addEventListener('click', () => {
  map.removeLayer(currentTileLayer);
  if (state.mapLayer === 'streets') {
    state.mapLayer = 'osm';
    currentTileLayer = L.tileLayer(TILE_PROVIDERS.osm.url, TILE_PROVIDERS.osm.options).addTo(map);
  } else if (state.mapLayer === 'osm') {
    state.mapLayer = 'topo';
    currentTileLayer = L.tileLayer(TILE_PROVIDERS.topo.url, TILE_PROVIDERS.topo.options).addTo(map);
  } else {
    state.mapLayer = 'streets';
    currentTileLayer = L.tileLayer(TILE_PROVIDERS.streets.url, TILE_PROVIDERS.streets.options).addTo(map);
  }
});

// Fit Route Bounds
document.getElementById('btn-fit-route').addEventListener('click', () => {
  if (state.routeCoords.length > 1) {
    map.fitBounds(L.latLngBounds(state.routeCoords), { padding: [80, 80] });
  }
});

// Geolocate GPS
document.getElementById('btn-geolocate').addEventListener('click', () => {
  if (!navigator.geolocation) return alert('GPS tidak didukung oleh browser Anda.');
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      map.flyTo([pos.coords.latitude, pos.coords.longitude], 16);
    },
    () => alert('Tidak dapat mendeteksi lokasi GPS.')
  );
});

// Search Location (Nominatim)
document.getElementById('search-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const query = document.getElementById('search-input').value.trim();
  if (!query) return;

  const btnSearch = document.getElementById('btn-search');
  btnSearch.textContent = '...';

  try {
    const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=1`);
    if (res.ok) {
      const data = await res.json();
      if (data && data.length > 0) {
        map.flyTo([parseFloat(data[0].lat), parseFloat(data[0].lon)], 15);
      } else {
        alert('Lokasi tidak ditemukan.');
      }
    }
  } catch {
    alert('Gagal mencari lokasi.');
  } finally {
    btnSearch.textContent = 'Cari';
  }
});

// Pace Selector in HUD
document.getElementById('select-pace').addEventListener('change', (e) => {
  state.targetPace = parseFloat(e.target.value);
  updateMetricsUI();
});

// Modal Export Dialog
const modal = document.getElementById('export-modal');
document.getElementById('btn-export-gpx').addEventListener('click', () => {
  const km = (calculateTotalDistance(state.routeCoords) / 1000).toFixed(2);
  const totalSeconds = km * (state.targetPace * 60);
  const mins = Math.floor(totalSeconds / 60);
  const secs = Math.floor(totalSeconds % 60);

  document.getElementById('modal-summary-distance').textContent = `${km} km`;
  document.getElementById('modal-summary-time').textContent = `${mins}m ${secs}s`;
  document.getElementById('modal-summary-elevation').textContent = `+${state.elevationStats ? state.elevationStats.gain : 0}m`;

  modal.style.display = 'flex';
});

document.getElementById('btn-close-modal').addEventListener('click', () => modal.style.display = 'none');
document.getElementById('btn-cancel-modal').addEventListener('click', () => modal.style.display = 'none');

// Pace chips in modal
document.querySelectorAll('.pace-chip').forEach((chip) => {
  chip.addEventListener('click', () => {
    document.querySelectorAll('.pace-chip').forEach((c) => c.classList.remove('active'));
    chip.classList.add('active');
    state.targetPace = parseFloat(chip.dataset.pace);
    document.getElementById('select-pace').value = state.targetPace;
    updateMetricsUI();
  });
});

// Submit Export Form
document.getElementById('export-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const name = document.getElementById('modal-route-name').value.trim() || 'Rute Lari';
  const desc = document.getElementById('modal-route-desc').value.trim();
  const xml = generateGpxXml(name, desc, state.targetPace);
  const fname = `${name.toLowerCase().replace(/[^a-z0-9]/g, '-')}.gpx`;
  triggerDownloadGpx(fname, xml);
  modal.style.display = 'none';
});

// Keyboard shortcuts (Ctrl+Z, Ctrl+Y, Esc)
window.addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
    e.preventDefault();
    if (e.shiftKey) handleRedo();
    else handleUndo();
  } else if ((e.ctrlKey || e.metaKey) && e.key === 'y') {
    e.preventDefault();
    handleRedo();
  } else if (e.key === 'Escape') {
    modal.style.display = 'none';
  }
});

// Collapse Elevation Toggle
document.getElementById('btn-collapse-elev').addEventListener('click', () => {
  const container = document.getElementById('chart-container');
  if (container.style.display === 'none') {
    container.style.display = 'block';
  } else {
    container.style.display = 'none';
  }
});

// Load saved state from LocalStorage on mount
try {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved) {
    const parsed = JSON.parse(saved);
    if (parsed.waypoints && parsed.waypoints.length > 0) {
      state.waypoints = parsed.waypoints;
      state.routeCoords = parsed.routeCoords;
      state.targetPace = parsed.targetPace || 5.5;
      document.getElementById('select-pace').value = state.targetPace;
      state.history = [{ waypoints: [...state.waypoints], routeCoords: [...state.routeCoords] }];
      state.historyIndex = 0;

      renderMap();

      if (state.routeCoords.length > 1) {
        map.fitBounds(L.latLngBounds(state.routeCoords), { padding: [80, 80] });
      }

      fetchElevation(state.routeCoords).then((res) => {
        state.elevationStats = res;
        updateMetricsUI();
      });
    }
  }
} catch {}

// If no saved route, attempt user geolocate or stay at default Padang
if (state.waypoints.length === 0 && navigator.geolocation) {
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      map.setView([pos.coords.latitude, pos.coords.longitude], 15);
    },
    () => {},
    { timeout: 4000 }
  );
}
