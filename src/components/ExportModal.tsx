import React, { useState } from 'react';
import type { ElevationStats } from '../types/route';
import { Download, X, CheckCircle2 } from 'lucide-react';

interface ExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  totalDistanceKm: number;
  elevationStats: ElevationStats | null;
  targetPaceMinutes: number;
  onConfirmExport: (name: string, desc: string, pace: number) => void;
}

const PACE_PRESETS = [
  { label: 'Easy / Recovery', pace: 6.5, display: '6:30' },
  { label: 'Daily Base', pace: 5.5, display: '5:30' },
  { label: 'Tempo Run', pace: 5.0, display: '5:00' },
  { label: 'Race Pace', pace: 4.25, display: '4:15' },
];

export const ExportModal: React.FC<ExportModalProps> = ({
  isOpen,
  onClose,
  totalDistanceKm,
  elevationStats,
  targetPaceMinutes: initialPace,
  onConfirmExport,
}) => {
  const [routeName, setRouteName] = useState('Rute Lari Saya');
  const [description, setDescription] = useState('Dibuat dengan RunRoute');
  const [pace, setPace] = useState(initialPace);

  if (!isOpen) return null;

  // Calculate estimated duration
  const totalSeconds = totalDistanceKm * (pace * 60);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = Math.floor(totalSeconds % 60);
  const durationText = hours > 0 ? `${hours}j ${minutes}m ${seconds}s` : `${minutes}m ${seconds}s`;

  const handleExport = (e: React.FormEvent) => {
    e.preventDefault();
    onConfirmExport(routeName.trim() || 'Rute Lari', description.trim(), pace);
    onClose();
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content glass-panel" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-title">Export ke Jam Lari (GPX 1.1)</div>
          <button onClick={onClose} style={{ color: 'var(--text-muted)' }}>
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleExport}>
          <div>
            <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-muted)' }}>
              Nama Rute
            </label>
            <input
              id="export-route-name-input"
              className="input-field"
              type="text"
              value={routeName}
              onChange={(e) => setRouteName(e.target.value)}
              placeholder="Contoh: Rute Lari Pagi 10K"
              required
            />
          </div>

          <div>
            <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-muted)' }}>
              Catatan / Deskripsi Rute
            </label>
            <input
              id="export-route-desc-input"
              className="input-field"
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Catatan rute (opsional)"
            />
          </div>

          <div>
            <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-muted)' }}>
              Pilih Target Pace (min/km)
            </label>
            <div className="pace-presets-grid" style={{ marginTop: 6 }}>
              {PACE_PRESETS.map((p) => (
                <button
                  type="button"
                  key={p.display}
                  className={`pace-chip ${Math.abs(pace - p.pace) < 0.05 ? 'active' : ''}`}
                  onClick={() => setPace(p.pace)}
                >
                  <div style={{ fontSize: '0.9rem', color: '#fff' }}>{p.display}</div>
                  <div style={{ fontSize: '0.65rem', color: 'var(--text-dim)', marginTop: 2 }}>{p.label}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Quick Metrics Summary */}
          <div
            style={{
              background: 'rgba(255,255,255,0.03)',
              borderRadius: 'var(--radius-md)',
              padding: '12px 16px',
              marginBottom: 20,
              display: 'grid',
              gridTemplateColumns: 'repeat(3, 1fr)',
              gap: 12,
              textAlign: 'center',
            }}
          >
            <div>
              <div style={{ color: 'var(--text-dim)', fontSize: '0.7rem' }}>JARAK</div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: '1rem', fontWeight: 700, color: '#10b981' }}>
                {totalDistanceKm.toFixed(2)} km
              </div>
            </div>
            <div>
              <div style={{ color: 'var(--text-dim)', fontSize: '0.7rem' }}>EST. WAKTU</div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: '1rem', fontWeight: 700, color: '#06b6d4' }}>
                {durationText}
              </div>
            </div>
            <div>
              <div style={{ color: 'var(--text-dim)', fontSize: '0.7rem' }}>ELEVASI (+GAIN)</div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: '1rem', fontWeight: 700, color: '#f97316' }}>
                +{elevationStats ? elevationStats.gain : 0}m
              </div>
            </div>
          </div>

          {/* Compatibility badge */}
          <div
            style={{
              fontSize: '0.75rem',
              color: 'var(--text-muted)',
              marginBottom: 20,
              display: 'flex',
              alignItems: 'center',
              gap: 8,
            }}
          >
            <CheckCircle2 size={16} color="#10b981" />
            <span>Format GPX 1.1 siap sync ke <strong>Garmin Connect</strong> (ClimbPro), <strong>Coros</strong>, <strong>Apple Watch</strong>, dan <strong>Suunto</strong>.</span>
          </div>

          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
            <button
              type="button"
              onClick={onClose}
              style={{
                padding: '9px 18px',
                borderRadius: 'var(--radius-full)',
                background: 'rgba(255,255,255,0.08)',
                fontSize: '0.85rem',
                fontWeight: 600,
              }}
            >
              Batal
            </button>
            <button
              id="btn-confirm-download-gpx"
              type="submit"
              className="btn-primary"
            >
              <Download size={16} />
              <span>Download .GPX File</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
