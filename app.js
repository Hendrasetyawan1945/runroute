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
  mapLayer: 'googleRoads',    // 'googleRoads' | 'osm' | 'googleSat' | 'carto'
  targetPace: 0,              // 0 = Tanpa Pace (default)
  elevationStats: null,
};

const STORAGE_KEY = 'runroute_v2_state';

// Tile Layers Configuration (100% Free, High Reliability, Ultra Fast in Indonesia)
const TILE_PROVIDERS = {
  googleRoads: {
    name: 'Google Maps (Jalan)',
    url: 'https://mt{s}.google.com/vt/lyrs=m&x={x}&y={y}&z={z}',
    options: {
      maxZoom: 20,
      subdomains: ['0', '1', '2', '3'],
      attribution: '&copy; Google Maps',
    },
  },
  osm: {
    name: 'OpenStreetMap',
    url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    options: {
      maxZoom: 19,
      subdomains: ['a', 'b', 'c'],
      attribution: '&copy; OpenStreetMap contributors',
    },
  },
  googleSat: {
    name: 'Google Satelit Hybrid',
    url: 'https://mt{s}.google.com/vt/lyrs=y&x={x}&y={y}&z={z}',
    options: {
      maxZoom: 20,
      subdomains: ['0', '1', '2', '3'],
      attribution: '&copy; Google Maps Satellite',
    },
  },
  carto: {
    name: 'Carto Voyager',
    url: 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png',
    options: {
      maxZoom: 19,
      subdomains: ['a', 'b', 'c', 'd'],
      attribution: '&copy; CARTO &copy; OpenStreetMap',
    },
  },
};

// Telemetry ping
try { new Image().src = '/log_status?s=app_js_running_L=' + (typeof L); } catch (e) {}

// Initialize Leaflet Map
const defaultCenter = [-0.9471, 100.3543]; // Padang / Indonesia
const map = L.map('map', {
  center: defaultCenter,
  zoom: 15,
  zoomControl: false,
});

try { new Image().src = '/log_status?s=map_created_ok'; } catch (e) {}

// Custom zoom control in bottom-right
L.control.zoom({ position: 'bottomright' }).addTo(map);

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

// Markers Layer Groups
const markersGroup = L.layerGroup().addTo(map);
const kmMarkersGroup = L.layerGroup().addTo(map);
let scrubberMarker = null;

// Tile Layer Management
let currentTileLayer = null;
let consecutiveTileErrors = 0;
let loggedFirstTile = false;

function setTileLayer(layerKey) {
  const provider = TILE_PROVIDERS[layerKey] || TILE_PROVIDERS.googleRoads;
  if (currentTileLayer) {
    map.removeLayer(currentTileLayer);
  }
  state.mapLayer = layerKey;
  try { new Image().src = '/log_status?s=setting_layer_' + layerKey; } catch (e) {}
  
  // Standard tile layer without crossOrigin restrictions (loads 100% reliably like native <img>)
  currentTileLayer = L.tileLayer(provider.url, provider.options).addTo(map);

  // If tiles fail (e.g., adblocker blocks mt*.google.com), auto-fallback to OpenStreetMap
  currentTileLayer.on('tileerror', (err) => {
    consecutiveTileErrors++;
    try { new Image().src = '/log_status?s=tile_err_' + layerKey; } catch (e) {}
    if (consecutiveTileErrors >= 3 && state.mapLayer === 'googleRoads') {
      console.warn('Google Maps tiles blocked by browser/adblocker, switching to OpenStreetMap');
      consecutiveTileErrors = 0;
      setTileLayer('osm');
    }
  });

  currentTileLayer.on('tileload', () => {
    consecutiveTileErrors = 0;
    if (!loggedFirstTile) {
      loggedFirstTile = true;
      try { new Image().src = '/log_status?s=first_tile_loaded_' + layerKey; } catch (e) {}
    }
  });

  if (casingPolyline) casingPolyline.bringToFront();
  if (mainPolyline) mainPolyline.bringToFront();
}

// Initial tile layer: Google Maps Roads
setTileLayer('googleRoads');

// Invalidate size on start to ensure tiles fill screen immediately
map.invalidateSize();
setTimeout(() => map.invalidateSize(), 100);
setTimeout(() => map.invalidateSize(), 300);
setTimeout(() => map.invalidateSize(), 800);
setTimeout(() => map.invalidateSize(), 1500);
window.addEventListener('resize', () => map.invalidateSize());
window.addEventListener('load', () => map.invalidateSize());

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

// Check if an OSRM route is taking an unnecessary multi-block detour or wandering away
function isRouteDetour(from, to, coords) {
  if (!coords || coords.length < 2) return true;

  const straightDist = getDistanceMeters(from, to);
  const routeDist = calculateTotalDistance(coords);

  // 1. Short crossing check (< 50m):
  // When straight line is < 50m, any route exceeding straightDist + 40m or 2.0x is an unwanted crosswalk detour
  if (straightDist < 50) {
    if (routeDist > Math.max(straightDist * 2.0, straightDist + 40)) {
      return true;
    }
    return false;
  }

  // 2. Wandering far away check:
  // A road curve or hillside bend can curve slightly, but a multi-block detour travels far away to other streets!
  const distsToTarget = coords.map((c) => getDistanceMeters(c, to));
  const maxDistToTarget = Math.max(...distsToTarget);
  // Allowed buffer: for a curved road, max distance to target rarely exceeds 1.55x or straightDist + 100m.
  // Real block detours wander 200m - 1000m+ away!
  if (maxDistToTarget > Math.max(straightDist + 100, straightDist * 1.55)) {
    return true;
  }

  // 3. Excessive length check (multi-block loops):
  // Natural winding roads have route/straight ratio between 1.1x and 1.8x.
  // Block detours have ratio 2.0x - 15x!
  if (
    (straightDist < 120 && routeDist > straightDist * 2.2 && (routeDist - straightDist) > 80) ||
    (straightDist < 350 && routeDist > straightDist * 2.0 && (routeDist - straightDist) > 140) ||
    (routeDist > straightDist * 1.9 && (routeDist - straightDist) > 220)
  ) {
    return true;
  }

  return false;
}

// Fetch raw route from OSRM pedestrian API
async function fetchOsrmRoute(origin, dest) {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 2000);
    const url = `https://router.project-osrm.org/route/v1/foot/${origin[1]},${origin[0]};${dest[1]},${dest[0]}?overview=full&geometries=geojson`;
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timeout);

    if (!res.ok) return null;
    const data = await res.json();
    if (data.code === 'Ok' && data.routes && data.routes[0]) {
      return data.routes[0].geometry.coordinates.map((c) => [c[1], c[0]]);
    }
  } catch {
    return null;
  }
  return null;
}

// OSRM Pedestrian Routing Service with One-Way Bypass & Runner-Intent Enforcement
async function getRouteSegment(from, to, mode = 'follow-roads') {
  if (mode === 'straight-line') {
    return [from, to];
  }

  const straightDist = getDistanceMeters(from, to);
  if (straightDist < 3) {
    return [from, to];
  }

  // 1. Primary forward query: from -> to
  const forwardCoords = await fetchOsrmRoute(from, to);

  // If forward route is clean and directly follows the street without looping away:
  if (forwardCoords && forwardCoords.length >= 2 && !isRouteDetour(from, to, forwardCoords)) {
    return forwardCoords;
  }

  // 2. If forward route detours (frequently because of one-way traffic rules):
  // Query in REVERSE (to -> from). If reverse direction follows the street cleanly, flip coordinates!
  // This allows runners to run in BOTH directions on any street, ignoring vehicular one-way restrictions.
  const reverseCoords = await fetchOsrmRoute(to, from);
  if (reverseCoords && reverseCoords.length >= 2 && !isRouteDetour(to, from, reverseCoords)) {
    console.log(`[RunRoute] Snap jalan satu arah berlawanan (${Math.round(straightDist)}m) tanpa memutar blok.`);
    return [...reverseCoords].reverse();
  }

  // 3. If neither forward nor reverse can follow the road without detouring:
  // (e.g. pedestrian malls, closed streets, median barriers, or contradictory restrictions)
  // The runner connects directly to destination in a straight line without ANY block looping!
  console.log(`[RunRoute] Mengabaikan arah jalan memutar (${Math.round(straightDist)}m). Berlari lurus ke tujuan.`);
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

// Render Kilometer Milestone Badges (Every 1000m along the route)
function renderKmMilestones() {
  kmMarkersGroup.clearLayers();
  if (state.routeCoords.length < 2) return;

  let cumDist = 0;
  let nextKm = 1;

  for (let i = 1; i < state.routeCoords.length; i++) {
    const pPrev = state.routeCoords[i - 1];
    const pCurr = state.routeCoords[i];
    const segDist = getDistanceMeters(pPrev, pCurr);

    while (cumDist + segDist >= nextKm * 1000) {
      const needed = (nextKm * 1000) - cumDist;
      const ratio = segDist > 0 ? needed / segDist : 0;
      const lat = pPrev[0] + (pCurr[0] - pPrev[0]) * ratio;
      const lng = pPrev[1] + (pCurr[1] - pPrev[1]) * ratio;

      const kmIcon = L.divIcon({
        html: `<div class="custom-km-badge" title="Kilometer ${nextKm}"><span class="km-val">${nextKm}</span><span class="km-lbl">km</span></div>`,
        className: '',
        iconSize: [40, 24],
        iconAnchor: [20, 12],
      });

      const kmMarker = L.marker([lat, lng], { icon: kmIcon, zIndexOffset: 300 }).addTo(kmMarkersGroup);
      kmMarker.bindPopup(`<div style="font-size:12px; font-weight:700; text-align:center; padding:4px;">Kilometer ${nextKm}<br><span style="color:#10b981; font-weight:600;">Jarak: ${nextKm}.00 km</span></div>`);
      nextKm++;
    }

    cumDist += segDist;
  }
}

// Remove Individual Waypoint and Recalculate
async function removeWaypoint(idx) {
  if (idx < 0 || idx >= state.waypoints.length) return;
  state.waypoints.splice(idx, 1);

  if (state.waypoints.length === 0) {
    handleClear();
    return;
  }

  if (state.waypoints.length === 1) {
    state.routeCoords = [[state.waypoints[0].lat, state.waypoints[0].lng]];
    state.elevationStats = null;
    recordHistory();
    renderMap();
    return;
  }

  // Rebuild remaining route segments
  let coords = [[state.waypoints[0].lat, state.waypoints[0].lng]];
  for (let i = 0; i < state.waypoints.length - 1; i++) {
    const fromWp = state.waypoints[i];
    const toWp = state.waypoints[i + 1];
    const mode = toWp.isManual ? 'straight-line' : state.routingMode;
    const seg = await getRouteSegment([fromWp.lat, fromWp.lng], [toWp.lat, toWp.lng], mode);
    coords = [...coords, ...seg.slice(1)];
  }

  state.routeCoords = coords;
  recordHistory();
  renderMap();

  fetchElevation(state.routeCoords).then((res) => {
    state.elevationStats = res;
    updateMetricsUI();
  });
}

// Update Map Renderings
function renderMap() {
  casingPolyline.setLatLngs(state.routeCoords);
  mainPolyline.setLatLngs(state.routeCoords);

  markersGroup.clearLayers();

  state.waypoints.forEach((wp, idx) => {
    let pinHtml = `<div class="custom-runner-pin pin-waypoint" title="Klik titik untuk opsi"></div>`;
    let iconSize = [14, 14];
    let iconAnchor = [7, 7];

    if (idx === 0) {
      pinHtml = `<div class="custom-runner-pin pin-start" title="Start (Titik Awal)">S</div>`;
      iconSize = [28, 28];
      iconAnchor = [14, 14];
    } else if (idx === state.waypoints.length - 1 && state.waypoints.length > 1) {
      pinHtml = `<div class="custom-runner-pin pin-finish" title="Finish (Titik Akhir)">F</div>`;
      iconSize = [28, 28];
      iconAnchor = [14, 14];
    }

    const icon = L.divIcon({
      html: pinHtml,
      className: '',
      iconSize: iconSize,
      iconAnchor: iconAnchor,
    });

    const marker = L.marker([wp.lat, wp.lng], { icon, zIndexOffset: 100 }).addTo(markersGroup);

    // Click popup to delete waypoint
    if (state.waypoints.length > 1) {
      const label = idx === 0 ? 'Titik Awal (Start)' : (idx === state.waypoints.length - 1 ? 'Titik Akhir (Finish)' : `Titik Belokan #${idx + 1}`);
      const popupDiv = document.createElement('div');
      popupDiv.className = 'wp-popup-content';
      popupDiv.innerHTML = `
        <div class="wp-popup-title">${label}</div>
        <button type="button" class="btn-delete-wp">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
          Hapus Titik Ini
        </button>
      `;
      const btnDel = popupDiv.querySelector('.btn-delete-wp');
      btnDel.addEventListener('click', (ev) => {
        ev.stopPropagation();
        map.closePopup();
        removeWaypoint(idx);
      });
      marker.bindPopup(popupDiv, { offset: [0, -6] });
    }
  });

  renderKmMilestones();
  updateMetricsUI();
}

// Update Top HUD Metrics
function updateMetricsUI() {
  const totalMeters = calculateTotalDistance(state.routeCoords);
  const km = totalMeters / 1000;

  document.getElementById('stat-distance').textContent = `${km.toFixed(2)} km`;

  // Duration
  if (!state.targetPace || state.targetPace <= 0) {
    document.getElementById('stat-time').textContent = '--:--';
  } else {
    const totalSeconds = km * (state.targetPace * 60);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = Math.floor(totalSeconds % 60);
    const timeStr = hours > 0 ? `${hours}j ${minutes}m` : `${minutes}m ${seconds}s`;
    document.getElementById('stat-time').textContent = km > 0 ? timeStr : '00:00';
  }

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

  const btnShare = document.getElementById('btn-share-route');
  if (btnShare) {
    btnShare.style.display = hasRoute ? 'inline-flex' : 'none';
  }

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
async function addWaypoint(latlng, overrideMode = null) {
  const activeMode = overrideMode || state.routingMode;
  const wp = { lat: latlng.lat, lng: latlng.lng, isManual: activeMode === 'straight-line' };

  if (state.waypoints.length === 0) {
    state.waypoints = [wp];
    state.routeCoords = [[wp.lat, wp.lng]];
    recordHistory();
    renderMap();
    return;
  }

  const lastWp = state.waypoints[state.waypoints.length - 1];
  const segment = await getRouteSegment([lastWp.lat, lastWp.lng], [wp.lat, wp.lng], activeMode);

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

// Map Click Listener (Supports Shift+Click for instant Straight Line segment)
map.on('click', (e) => {
  const isShiftOrAlt = Boolean(e.originalEvent && (e.originalEvent.shiftKey || e.originalEvent.altKey));
  addWaypoint(e.latlng, isShiftOrAlt ? 'straight-line' : null);
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

// Action: Reset (Clean Route and URL)
function handleClear() {
  state.waypoints = [];
  state.routeCoords = [];
  state.history = [];
  state.historyIndex = -1;
  state.elevationStats = null;
  localStorage.removeItem(STORAGE_KEY);

  if (window.location.hash) {
    history.replaceState(null, '', window.location.pathname);
  }

  if (kmMarkersGroup) kmMarkersGroup.clearLayers();
  if (markersGroup) markersGroup.clearLayers();
  if (casingPolyline) casingPolyline.setLatLngs([]);
  if (mainPolyline) mainPolyline.setLatLngs([]);

  const dock = document.getElementById('elevation-dock');
  if (dock) dock.style.display = 'none';
  const fillPath = document.getElementById('svg-fill-path');
  if (fillPath) fillPath.setAttribute('d', '');
  const strokePath = document.getElementById('svg-stroke-path');
  if (strokePath) strokePath.setAttribute('d', '');

  renderMap();
}

// Generate Shareable URL
function getShareUrl() {
  if (state.waypoints.length === 0) return window.location.href.split('#')[0];
  const wps = state.waypoints.map(w => `${w.lat.toFixed(5)},${w.lng.toFixed(5)}${w.isManual ? ',1' : ''}`).join(';');
  let hash = `r=${wps}`;
  if (state.targetPace && state.targetPace > 0) {
    hash += `&p=${state.targetPace}`;
  }
  return `${window.location.origin}${window.location.pathname}#${hash}`;
}

// Handle Share Route Button Click
async function handleShareRoute() {
  if (state.waypoints.length < 2) return;
  const shareUrl = getShareUrl();
  window.history.replaceState(null, '', shareUrl);

  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(shareUrl);
    } else {
      const input = document.createElement('input');
      input.value = shareUrl;
      document.body.appendChild(input);
      input.select();
      document.execCommand('copy');
      document.body.removeChild(input);
    }
  } catch (e) {
    prompt('Salin link rute ini:', shareUrl);
    return;
  }

  const toast = document.getElementById('guide-toast');
  if (toast) {
    const origText = '💡 Klik jalan di peta untuk mulai membuat rute lari Anda!';
    toast.textContent = '🔗 Tautan rute berhasil disalin ke clipboard!';
    toast.style.borderColor = '#06b6d4';
    toast.style.color = '#38bdf8';
    toast.style.display = 'block';
    setTimeout(() => {
      toast.textContent = origText;
      toast.style.borderColor = '';
      toast.style.color = '';
      if (state.waypoints.length > 0) {
        toast.style.display = 'none';
      }
    }, 2800);
  }
}

// Render KM Splits in Export Modal
function renderModalSplits() {
  const container = document.getElementById('modal-splits-container');
  const summaryPace = document.getElementById('splits-summary-pace');
  if (!container) return;

  if (!state.targetPace || state.targetPace <= 0) {
    if (summaryPace) summaryPace.textContent = 'Tanpa Pace';
    container.innerHTML = '<div class="splits-empty-hint">Pilih salah satu target pace di atas untuk melihat estimasi split per kilometer.</div>';
    return;
  }

  const paceMin = state.targetPace;
  const paceSec = paceMin * 60;
  const paceMinPart = Math.floor(paceMin);
  const paceSecPart = Math.round((paceMin - paceMinPart) * 60);
  const paceStr = `${paceMinPart}:${paceSecPart.toString().padStart(2, '0')}`;
  if (summaryPace) summaryPace.textContent = `${paceStr} /km`;

  const totalMeters = calculateTotalDistance(state.routeCoords);
  const totalKm = totalMeters / 1000;
  if (totalKm <= 0) {
    container.innerHTML = '<div class="splits-empty-hint">Rute belum memiliki jarak.</div>';
    return;
  }

  const fullKms = Math.floor(totalKm);
  const pts = state.elevationStats ? state.elevationStats.points : [];

  let rowsHtml = '';
  for (let k = 1; k <= fullKms; k++) {
    const cumSeconds = k * paceSec;
    const hrs = Math.floor(cumSeconds / 3600);
    const mins = Math.floor((cumSeconds % 3600) / 60);
    const secs = Math.floor(cumSeconds % 60);
    const timeStr = hrs > 0 
      ? `${hrs}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
      : `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;

    let eleInfo = '--';
    if (pts.length > 0) {
      const p = pts.find(pt => pt.distanceKm >= k) || pts[pts.length - 1];
      eleInfo = `${p.elevationM}m`;
    }

    rowsHtml += `
      <tr>
        <td style="font-weight:600;">KM ${k}</td>
        <td class="split-time">${timeStr}</td>
        <td style="color:#10b981;">+${paceStr}</td>
        <td style="color:#f97316;">${eleInfo}</td>
      </tr>
    `;
  }

  if (totalKm > fullKms) {
    const finalSeconds = totalKm * paceSec;
    const hrs = Math.floor(finalSeconds / 3600);
    const mins = Math.floor((finalSeconds % 3600) / 60);
    const secs = Math.floor(finalSeconds % 60);
    const timeStr = hrs > 0 
      ? `${hrs}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
      : `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;

    let eleInfo = '--';
    if (pts.length > 0) {
      eleInfo = `${pts[pts.length - 1].elevationM}m`;
    }

    rowsHtml += `
      <tr style="background: rgba(16, 185, 129, 0.08); font-weight:700;">
        <td>Finish (${totalKm.toFixed(2)} km)</td>
        <td class="split-time" style="color:#34d399;">${timeStr}</td>
        <td style="color:#10b981;">Total</td>
        <td style="color:#f97316;">${eleInfo}</td>
      </tr>
    `;
  }

  container.innerHTML = `
    <table class="splits-table">
      <thead>
        <tr>
          <th>Split</th>
          <th>Waktu Total</th>
          <th>Lap Pace</th>
          <th>Elevasi</th>
        </tr>
      </thead>
      <tbody>${rowsHtml}</tbody>
    </table>
  `;
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
  const hasPace = paceMinutes && paceMinutes > 0;
  const now = new Date();
  const startTime = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 6, 0, 0);
  const paceSecondsPerMeter = hasPace ? (paceMinutes * 60) / 1000 : 0;

  let currentTimestampMs = startTime.getTime();
  let cumulativeDist = 0;
  const pts = state.elevationStats ? state.elevationStats.points : [];

  const trkpts = state.routeCoords.map((coord, idx) => {
    const [lat, lon] = coord;
    if (idx > 0) {
      const segDist = getDistanceMeters(state.routeCoords[idx - 1], coord);
      cumulativeDist += segDist;
      if (hasPace) {
        currentTimestampMs += segDist * paceSecondsPerMeter * 1000;
      }
    }

    const timeTag = hasPace ? `\n        <time>${new Date(currentTimestampMs).toISOString()}</time>` : '';

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

    return `      <trkpt lat="${lat.toFixed(6)}" lon="${lon.toFixed(6)}">${eleTag}${timeTag}\n      </trkpt>`;
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

const btnShareRoute = document.getElementById('btn-share-route');
if (btnShareRoute) {
  btnShareRoute.addEventListener('click', handleShareRoute);
}

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

// Map Layer Switcher (Cycles: Google Roads -> OpenStreetMap -> Google Satelit -> Carto)
const LAYER_KEYS = ['googleRoads', 'osm', 'googleSat', 'carto'];
document.getElementById('btn-toggle-layer').addEventListener('click', () => {
  const currentIndex = LAYER_KEYS.indexOf(state.mapLayer);
  const nextIndex = (currentIndex + 1) % LAYER_KEYS.length;
  const nextKey = LAYER_KEYS[nextIndex];
  setTileLayer(nextKey);

  // Show temporary toast notification
  const toast = document.getElementById('guide-toast');
  if (toast) {
    const origText = '💡 Klik jalan di peta untuk mulai membuat rute lari Anda!';
    toast.textContent = `🗺️ Tampilan Peta: ${TILE_PROVIDERS[nextKey].name}`;
    toast.style.borderColor = '#10b981';
    toast.style.color = '#10b981';
    setTimeout(() => {
      toast.textContent = origText;
      toast.style.borderColor = '';
      toast.style.color = '';
    }, 2000);
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
  let timeDisplay = '--:--';
  if (state.targetPace && state.targetPace > 0) {
    const totalSeconds = km * (state.targetPace * 60);
    const mins = Math.floor(totalSeconds / 60);
    const secs = Math.floor(totalSeconds % 60);
    timeDisplay = `${mins}m ${secs}s`;
  }

  document.getElementById('modal-summary-distance').textContent = `${km} km`;
  document.getElementById('modal-summary-time').textContent = timeDisplay;
  document.getElementById('modal-summary-elevation').textContent = `+${state.elevationStats ? state.elevationStats.gain : 0}m`;

  // Sync active chip with current target pace
  document.querySelectorAll('.pace-chip').forEach((c) => {
    const chipPace = parseFloat(c.dataset.pace);
    if ((!state.targetPace || state.targetPace === 0) && chipPace === 0) {
      c.classList.add('active');
    } else if (state.targetPace > 0 && Math.abs(chipPace - state.targetPace) < 0.05) {
      c.classList.add('active');
    } else {
      c.classList.remove('active');
    }
  });

  renderModalSplits();
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
    document.getElementById('select-pace').value = state.targetPace || 0;
    updateMetricsUI();

    const km = (calculateTotalDistance(state.routeCoords) / 1000).toFixed(2);
    if (!state.targetPace || state.targetPace <= 0) {
      document.getElementById('modal-summary-time').textContent = '--:--';
    } else {
      const totalSeconds = km * (state.targetPace * 60);
      const mins = Math.floor(totalSeconds / 60);
      const secs = Math.floor(totalSeconds % 60);
      document.getElementById('modal-summary-time').textContent = `${mins}m ${secs}s`;
    }

    renderModalSplits();
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

// Load Route from URL Hash (#r=lat,lng,isManual;...)
async function loadFromUrlHash() {
  const hash = window.location.hash;
  if (!hash || !hash.includes('r=')) return false;

  try {
    const cleanHash = hash.startsWith('#') ? hash.slice(1) : hash;
    const params = new URLSearchParams(cleanHash);
    const rStr = params.get('r');
    const pStr = params.get('p');
    if (!rStr) return false;

    if (pStr) {
      state.targetPace = parseFloat(pStr) || 0;
      const sel = document.getElementById('select-pace');
      if (sel) sel.value = state.targetPace || 0;
    }

    const pairs = rStr.split(';');
    const parsedWps = [];
    for (const p of pairs) {
      const parts = p.split(',');
      if (parts.length >= 2) {
        const lat = parseFloat(parts[0]);
        const lng = parseFloat(parts[1]);
        const isManual = parts[2] === '1';
        if (!isNaN(lat) && !isNaN(lng)) {
          parsedWps.push({ lat, lng, isManual });
        }
      }
    }

    if (parsedWps.length === 0) return false;

    state.waypoints = parsedWps;
    if (parsedWps.length === 1) {
      state.routeCoords = [[parsedWps[0].lat, parsedWps[0].lng]];
    } else {
      let coords = [[parsedWps[0].lat, parsedWps[0].lng]];
      for (let i = 0; i < parsedWps.length - 1; i++) {
        const from = [parsedWps[i].lat, parsedWps[i].lng];
        const to = [parsedWps[i + 1].lat, parsedWps[i + 1].lng];
        const mode = parsedWps[i + 1].isManual ? 'straight-line' : state.routingMode;
        const seg = await getRouteSegment(from, to, mode);
        coords = [...coords, ...seg.slice(1)];
      }
      state.routeCoords = coords;
    }

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

    const toast = document.getElementById('guide-toast');
    if (toast) {
      toast.textContent = '📍 Rute berhasil dimuat dari tautan URL!';
      toast.style.borderColor = '#10b981';
      toast.style.color = '#10b981';
      toast.style.display = 'block';
      setTimeout(() => {
        if (state.waypoints.length > 0) toast.style.display = 'none';
      }, 3500);
    }

    return true;
  } catch (err) {
    console.error('Gagal memuat rute dari URL:', err);
    return false;
  }
}

// Load saved state from LocalStorage on mount
function loadLocalStorage() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      if (parsed.waypoints && parsed.waypoints.length > 0) {
        state.waypoints = parsed.waypoints;
        state.routeCoords = parsed.routeCoords;
        state.targetPace = parsed.targetPace !== undefined ? parsed.targetPace : 0;
        document.getElementById('select-pace').value = state.targetPace || 0;
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
        return true;
      }
    }
  } catch {}
  return false;
}

// Startup sequence: Prioritize URL Hash -> LocalStorage -> Geolocation
(async function initStartup() {
  const fromUrl = await loadFromUrlHash();
  if (!fromUrl) {
    const fromStorage = loadLocalStorage();
    if (!fromStorage && state.waypoints.length === 0 && navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          map.setView([pos.coords.latitude, pos.coords.longitude], 15);
        },
        () => {},
        { timeout: 4000 }
      );
    }
  }
})();
