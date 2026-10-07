import React from 'react';
import type { ElevationStats, MapStyleMode, RoutingMode } from '../types/route';
import {
  RotateCcw,
  RotateCw,
  Repeat,
  Compass,
  Trash2,
  Download,
  Footprints,
  Minus,
  Layers,
  Clock,
  TrendingUp,
  Activity,
  Sparkles,
} from 'lucide-react';

interface RunnerToolbarProps {
  distanceMeters: number;
  elevationStats: ElevationStats | null;
  routingMode: RoutingMode;
  mapStyle: MapStyleMode;
  targetPaceMinutes: number;
  canUndo: boolean;
  canRedo: boolean;
  waypointCount: number;
  onUndo: () => void;
  onRedo: () => void;
  onToggleRoutingMode: () => void;
  onToggleMapStyle: () => void;
  onOutAndBack: () => void;
  onCloseLoop: () => void;
  onReverseRoute: () => void;
  onClearRoute: () => void;
  onOpenExportModal: () => void;
  onLoadPreset: (presetName: string) => void;
  onChangePace: (pace: number) => void;
}

export const RunnerToolbar: React.FC<RunnerToolbarProps> = ({
  distanceMeters,
  elevationStats,
  routingMode,
  mapStyle,
  targetPaceMinutes,
  canUndo,
  canRedo,
  waypointCount,
  onUndo,
  onRedo,
  onToggleRoutingMode,
  onToggleMapStyle,
  onOutAndBack,
  onCloseLoop,
  onReverseRoute,
  onClearRoute,
  onOpenExportModal,
  onLoadPreset,
  onChangePace,
}) => {
  const distanceKm = distanceMeters / 1000;

  // Calculate estimated time based on target pace
  const timeText = (!targetPaceMinutes || targetPaceMinutes <= 0)
    ? '--:--'
    : (() => {
        const totalSeconds = distanceKm * (targetPaceMinutes * 60);
        const hours = Math.floor(totalSeconds / 3600);
        const minutes = Math.floor((totalSeconds % 3600) / 60);
        const seconds = Math.floor(totalSeconds % 60);
        return hours > 0 ? `${hours}j ${minutes}m` : `${minutes}m ${seconds}s`;
      })();

  return (
    <>
      {/* TOP FLOATING HUD BAR */}
      <header className="top-hud-bar glass-panel">
        <div className="brand-section">
          <div className="brand-icon">
            <Activity size={22} />
          </div>
          <div className="brand-text">
            <h1>RunRoute</h1>
            <div className="brand-tag">GPX Route Builder</div>
          </div>
        </div>

        {/* Realtime Metrics Group */}
        <div className="metrics-group">
          {/* Distance */}
          <div className="stat-pill highlight">
            <span className="stat-icon">
              <Footprints size={18} />
            </span>
            <div>
              <div className="stat-value">{distanceKm.toFixed(2)} km</div>
              <div className="stat-label">Total Jarak</div>
            </div>
          </div>

          {/* Estimated Time with quick pace changer */}
          <div className="stat-pill">
            <span className="stat-icon" style={{ color: '#06b6d4' }}>
              <Clock size={18} />
            </span>
            <div>
              <div className="stat-value">{distanceKm > 0 ? timeText : '00:00'}</div>
              <div className="stat-label" style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <span>Pace:</span>
                <select
                  value={targetPaceMinutes}
                  onChange={(e) => onChangePace(parseFloat(e.target.value))}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    color: 'var(--color-primary)',
                    fontSize: '0.72rem',
                    fontWeight: 700,
                    outline: 'none',
                    cursor: 'pointer',
                  }}
                  title="Ubah Target Pace"
                >
                  <option value="0" style={{ background: '#0f172a' }}>Tanpa Pace (--:--)</option>
                  <option value="4.0" style={{ background: '#0f172a' }}>4:00/km (Fast)</option>
                  <option value="4.25" style={{ background: '#0f172a' }}>4:15/km (Race)</option>
                  <option value="4.5" style={{ background: '#0f172a' }}>4:30/km (Threshold)</option>
                  <option value="5.0" style={{ background: '#0f172a' }}>5:00/km (Tempo)</option>
                  <option value="5.5" style={{ background: '#0f172a' }}>5:30/km (Base)</option>
                  <option value="6.0" style={{ background: '#0f172a' }}>6:00/km (Easy)</option>
                  <option value="6.5" style={{ background: '#0f172a' }}>6:30/km (Recovery)</option>
                  <option value="7.0" style={{ background: '#0f172a' }}>7:00/km (Slow Run)</option>
                  <option value="7.5" style={{ background: '#0f172a' }}>7:30/km (Easy Jog)</option>
                  <option value="8.0" style={{ background: '#0f172a' }}>8:00/km (Jog / Walk)</option>
                  <option value="8.5" style={{ background: '#0f172a' }}>8:30/km (Slow Jog)</option>
                  <option value="9.0" style={{ background: '#0f172a' }}>9:00/km (Pace 9 / Walk)</option>
                  <option value="9.5" style={{ background: '#0f172a' }}>9:30/km (Pace 9:30)</option>
                  <option value="10.0" style={{ background: '#0f172a' }}>10:00/km (Brisk Walk)</option>
                </select>
              </div>
            </div>
          </div>

          {/* Elevation Gain */}
          <div className="stat-pill">
            <span className="stat-icon" style={{ color: '#f97316' }}>
              <TrendingUp size={18} />
            </span>
            <div>
              <div className="stat-value">+{elevationStats ? elevationStats.gain : 0}m</div>
              <div className="stat-label">Elev Gain</div>
            </div>
          </div>
        </div>

        {/* Actions: Presets & Export */}
        <div className="hud-actions">
          {/* Quick Demo Preset */}
          {waypointCount === 0 && (
            <button
              id="btn-load-preset"
              className="tool-btn"
              style={{ background: 'rgba(255,255,255,0.06)', borderRadius: 'var(--radius-full)', padding: '8px 14px' }}
              onClick={() => onLoadPreset('padang-waterfront')}
              title="Coba Contoh Rute Siap Pakai"
            >
              <Sparkles size={16} color="#fbbf24" />
              <span className="tool-label">Demo Rute 5K</span>
            </button>
          )}

          {/* Export GPX */}
          <button
            id="btn-open-export-modal"
            className="btn-primary"
            disabled={waypointCount < 2}
            onClick={onOpenExportModal}
            title={waypointCount < 2 ? 'Klik peta minimal 2 titik untuk export GPX' : 'Export GPX untuk Garmin/Coros'}
          >
            <Download size={16} />
            <span>Export GPX</span>
          </button>
        </div>
      </header>

      {/* LEFT RUNNER ACTION TOOLBAR */}
      <aside className="runner-toolbar glass-panel">
        {/* Routing Mode Toggle */}
        <button
          id="btn-toggle-routing-mode"
          className={`tool-btn ${routingMode === 'follow-roads' ? 'active' : ''}`}
          onClick={onToggleRoutingMode}
          title={routingMode === 'follow-roads' ? 'Mode: Mengikuti Jalan/Trotoar (Klik untuk ubah ke Garis Lurus)' : 'Mode: Garis Lurus/Offroad (Klik untuk ubah ke Auto-Jalan)'}
        >
          {routingMode === 'follow-roads' ? <Footprints size={18} /> : <Minus size={18} />}
          <span className="tool-label">{routingMode === 'follow-roads' ? 'Snap Jalan' : 'Garis Lurus'}</span>
        </button>

        <div className="toolbar-divider" />

        {/* Undo */}
        <button
          id="btn-undo"
          className="tool-btn"
          disabled={!canUndo}
          onClick={onUndo}
          title="Undo Titik (Ctrl + Z)"
        >
          <RotateCcw size={18} />
          <span className="tool-label">Undo</span>
        </button>

        {/* Redo */}
        <button
          id="btn-redo"
          className="tool-btn"
          disabled={!canRedo}
          onClick={onRedo}
          title="Redo Titik (Ctrl + Y)"
        >
          <RotateCw size={18} />
          <span className="tool-label">Redo</span>
        </button>

        <div className="toolbar-divider" />

        {/* Out & Back (Balik Rute) */}
        <button
          id="btn-out-and-back"
          className="tool-btn"
          disabled={waypointCount < 2}
          onClick={onOutAndBack}
          title="Out & Back: Bolak-balik melewati rute yang sama persis"
        >
          <Repeat size={18} />
          <span className="tool-label">Out & Back</span>
        </button>

        {/* Close Loop */}
        <button
          id="btn-close-loop"
          className="tool-btn"
          disabled={waypointCount < 2}
          onClick={onCloseLoop}
          title="Loop Closer: Sambung otomatis kembali ke titik Start"
        >
          <Compass size={18} />
          <span className="tool-label">Close Loop</span>
        </button>

        {/* Reverse Direction */}
        <button
          id="btn-reverse-route"
          className="tool-btn"
          disabled={waypointCount < 2}
          onClick={onReverseRoute}
          title="Reverse: Balikkan arah rute (Start menjadi Finish)"
        >
          <RotateCw size={18} />
          <span className="tool-label">Balik Arah</span>
        </button>

        <div className="toolbar-divider" />

        {/* Clear All */}
        <button
          id="btn-clear-route"
          className="tool-btn"
          style={{ color: waypointCount > 0 ? '#f43f5e' : undefined }}
          disabled={waypointCount === 0}
          onClick={onClearRoute}
          title="Hapus Rute"
        >
          <Trash2 size={18} />
          <span className="tool-label">Reset</span>
        </button>
      </aside>

      {/* RIGHT CONTROLS: Layer Switcher */}
      <div className="right-controls">
        <button
          id="btn-toggle-map-style"
          className="round-control-btn glass-panel"
          onClick={onToggleMapStyle}
          title={`Tema Peta Saat Ini: ${mapStyle}. Klik untuk ganti (Outdoor / Dark / Streets)`}
        >
          <Layers size={18} />
        </button>
      </div>

      {/* INSTRUCTIONS TOAST WHEN EMPTY */}
      {waypointCount === 0 && (
        <div className="guide-toast">
          💡 <strong>Klik sembarang lokasi di peta</strong> untuk mulai membuat rute lari Anda!
        </div>
      )}
    </>
  );
};
