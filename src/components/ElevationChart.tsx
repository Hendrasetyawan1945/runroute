import React, { useState } from 'react';
import type { Coordinate, ElevationStats } from '../types/route';
import { TrendingUp, TrendingDown, Mountain, ChevronDown, ChevronUp } from 'lucide-react';

interface ElevationChartProps {
  elevationStats: ElevationStats | null;
  onHoverCoordinate: (coord: Coordinate | null) => void;
}

export const ElevationChart: React.FC<ElevationChartProps> = ({
  elevationStats,
  onHoverCoordinate,
}) => {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

  if (!elevationStats || elevationStats.points.length < 2) {
    return null;
  }

  const { points, gain, loss, minElevation, maxElevation } = elevationStats;
  const totalDistanceKm = points[points.length - 1].distanceKm;

  // Chart Dimensions
  const width = 800;
  const height = 90;
  const paddingX = 10;
  const paddingY = 12;

  const effectiveWidth = width - paddingX * 2;
  const effectiveHeight = height - paddingY * 2;

  const elevationRange = Math.max(15, maxElevation - minElevation);

  // Map points to SVG coordinates
  const svgCoords = points.map((pt) => {
    const x = paddingX + (pt.distanceKm / totalDistanceKm) * effectiveWidth;
    const y =
      height -
      paddingY -
      ((pt.elevationM - minElevation) / elevationRange) * effectiveHeight;
    return { x, y, pt };
  });

  // Build SVG path
  const pathD = svgCoords.reduce((acc, curr, idx) => {
    return `${acc} ${idx === 0 ? 'M' : 'L'} ${curr.x.toFixed(1)},${curr.y.toFixed(1)}`;
  }, '');

  // Fill path closing at the bottom
  const fillD = `${pathD} L ${(paddingX + effectiveWidth).toFixed(1)},${(height - paddingY).toFixed(1)} L ${paddingX},${(height - paddingY).toFixed(1)} Z`;

  const handleMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const ratio = Math.max(0, Math.min(1, (mouseX - paddingX) / (rect.width - paddingX * 2)));
    const targetDist = ratio * totalDistanceKm;

    // Find nearest point
    let nearestIdx = 0;
    let minDiff = Infinity;
    points.forEach((pt, idx) => {
      const diff = Math.abs(pt.distanceKm - targetDist);
      if (diff < minDiff) {
        minDiff = diff;
        nearestIdx = idx;
      }
    });

    setHoverIndex(nearestIdx);
    onHoverCoordinate(points[nearestIdx].coord);
  };

  const handleMouseLeave = () => {
    setHoverIndex(null);
    onHoverCoordinate(null);
  };

  const hoveredPoint = hoverIndex !== null ? points[hoverIndex] : null;
  const hoveredSvgCoord = hoverIndex !== null ? svgCoords[hoverIndex] : null;

  return (
    <div id="elevation-dock-panel" className="elevation-dock glass-panel">
      <div className="elevation-header">
        <div className="elevation-title">
          <Mountain size={16} color="#10b981" />
          <span>Profil Elevasi</span>
          {hoveredPoint && (
            <span style={{ color: '#06b6d4', marginLeft: '12px', textTransform: 'none' }}>
              <strong>{hoveredPoint.elevationM}m</strong> @ {hoveredPoint.distanceKm} km
            </span>
          )}
        </div>

        <div className="elevation-metrics-mini">
          <span className="gain-badge" title="Total Tanjakan">
            <TrendingUp size={14} style={{ display: 'inline', verticalAlign: 'middle', marginRight: 3 }} />
            +{gain}m
          </span>
          <span className="loss-badge" title="Total Turunan">
            <TrendingDown size={14} style={{ display: 'inline', verticalAlign: 'middle', marginRight: 3 }} />
            -{loss}m
          </span>
          <span style={{ color: 'var(--text-dim)' }}>
            Elev: {minElevation}m - {maxElevation}m
          </span>
          <button
            onClick={() => setIsCollapsed(!isCollapsed)}
            style={{ padding: '2px 6px', color: 'var(--text-muted)' }}
            title={isCollapsed ? 'Tampilkan Grafik' : 'Sembunyikan Grafik'}
          >
            {isCollapsed ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </button>
        </div>
      </div>

      {!isCollapsed && (
        <div className="chart-svg-container">
          <svg
            viewBox={`0 0 ${width} ${height}`}
            preserveAspectRatio="none"
            style={{ width: '100%', height: '100%', cursor: 'crosshair' }}
            onMouseMove={handleMouseMove}
            onMouseLeave={handleMouseLeave}
          >
            <defs>
              <linearGradient id="elevationGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#10b981" stopOpacity="0.45" />
                <stop offset="100%" stopColor="#10b981" stopOpacity="0.02" />
              </linearGradient>
            </defs>

            {/* Background horizontal guide lines */}
            <line
              x1={paddingX}
              y1={height - paddingY}
              x2={width - paddingX}
              y2={height - paddingY}
              stroke="rgba(255,255,255,0.08)"
              strokeDasharray="4 4"
            />
            <line
              x1={paddingX}
              y1={paddingY}
              x2={width - paddingX}
              y2={paddingY}
              stroke="rgba(255,255,255,0.08)"
              strokeDasharray="4 4"
            />

            {/* Filled Area */}
            <path d={fillD} fill="url(#elevationGrad)" />

            {/* Stroke line */}
            <path d={pathD} fill="none" stroke="#34d399" strokeWidth="2.5" />

            {/* Scrubber vertical line */}
            {hoveredSvgCoord && (
              <>
                <line
                  x1={hoveredSvgCoord.x}
                  y1={0}
                  x2={hoveredSvgCoord.x}
                  y2={height}
                  stroke="#06b6d4"
                  strokeWidth="1.5"
                  strokeDasharray="2 2"
                />
                <circle
                  cx={hoveredSvgCoord.x}
                  cy={hoveredSvgCoord.y}
                  r="4.5"
                  fill="#06b6d4"
                  stroke="#fff"
                  strokeWidth="2"
                />
              </>
            )}
          </svg>
        </div>
      )}
    </div>
  );
};
