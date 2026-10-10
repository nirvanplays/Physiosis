/**
 * MovementProfileCard.tsx
 * PHYSIOSIS — PERSONAL MOVEMENT PROFILE PATCH 11
 *
 * Interactive longitudinal patient movement profile & trend visualization.
 * Features 4 separately selectable metric trend views:
 *   1. ROM Trend
 *   2. Quality Trend
 *   3. Compensation Trend
 *   4. Consistency Trend
 *
 * Grounded strictly in non-diagnostic terminology (movement profile, performance trend, observed progress).
 */

import React, { useState } from 'react';
import {
  TrendingUp,
  Activity,
  ShieldAlert,
  Repeat,
  HelpCircle,
} from 'lucide-react';
import type { PhysiosisSession } from '../../engine/session/SessionTypes';
import type { ExerciseDefinition } from '../../engine/exercise/ExerciseTypes';
import { getAllExercises } from '../../engine/exercise/ExerciseRegistry';
import { PatientMovementProfileEngine } from '../../engine/profile/PatientMovementProfileEngine';
import type { MovementMetricType } from '../../engine/profile/MovementProfileTypes';

interface MovementProfileCardProps {
  sessions: PhysiosisSession[];
  activeExerciseId?: string;
  activeExercise?: ExerciseDefinition;
  onSelectExercise?: (exerciseId: string) => void;
}

export const MovementProfileCard: React.FC<MovementProfileCardProps> = ({
  sessions,
  activeExerciseId,
  activeExercise,
  onSelectExercise,
}) => {
  const allExercises = getAllExercises();
  const [selectedId, setSelectedId] = useState<string>(
    activeExercise?.id ?? activeExerciseId ?? 'shoulder-flexion'
  );
  const [selectedMetric, setSelectedMetric] = useState<MovementMetricType>('ROM');
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

  const selectedExercise =
    allExercises.find((e) => e.id === selectedId) ?? activeExercise ?? allExercises[0];

  // Compute longitudinal movement profile
  const profile = PatientMovementProfileEngine.computeMovementProfile(
    sessions,
    selectedExercise.id,
    selectedExercise.targetAngle
  );

  const chronological = profile.chronologicalSessions;
  const hasData = chronological.length > 0;

  // Resolve current active trend metric object
  const currentTrend =
    selectedMetric === 'ROM'
      ? profile.romTrend
      : selectedMetric === 'QUALITY'
      ? profile.qualityTrend
      : selectedMetric === 'COMPENSATION'
      ? profile.compensationTrend
      : profile.consistencyTrend;

  // Chart layout dimensions
  const width = 360;
  const height = 150;
  const padLeft = 36;
  const padRight = 20;
  const padTop = 18;
  const padBottom = 26;
  const chartW = width - padLeft - padRight;
  const chartH = height - padTop - padBottom;

  // Metric Y scale limits
  let minY = 0;
  let maxY = 100;
  let targetYVal: number | null = null;
  let baselineYVal: number | null = null;
  let metricUnit = '%';

  switch (selectedMetric) {
    case 'ROM':
      minY = 0;
      maxY = Math.max(180, selectedExercise.targetAngle + 15);
      targetYVal = selectedExercise.targetAngle;
      baselineYVal = profile.baselineROM;
      metricUnit = '°';
      break;
    case 'QUALITY':
      minY = 0;
      maxY = 100;
      targetYVal = 85;
      baselineYVal = profile.qualityTrend.baselineValue;
      metricUnit = '%';
      break;
    case 'COMPENSATION':
      minY = 0;
      maxY = 100;
      targetYVal = 0; // Target is 0% compensation
      baselineYVal = profile.compensationTrend.baselineValue;
      metricUnit = '%';
      break;
    case 'CONSISTENCY':
      minY = 0;
      maxY = 100;
      targetYVal = 80;
      baselineYVal = profile.consistencyTrend.baselineValue;
      metricUnit = '%';
      break;
  }

  const getMetricValue = (pt: typeof chronological[0]): number => {
    switch (selectedMetric) {
      case 'ROM':
        return pt.rom;
      case 'QUALITY':
        return pt.quality;
      case 'COMPENSATION':
        return pt.compensation;
      case 'CONSISTENCY':
        return pt.consistency;
      default:
        return pt.rom;
    }
  };

  const getX = (idx: number) => {
    if (chronological.length <= 1) return padLeft + chartW / 2;
    return padLeft + (idx / (chronological.length - 1)) * chartW;
  };

  const getY = (val: number) => {
    const clamped = Math.max(minY, Math.min(maxY, val));
    return padTop + chartH - ((clamped - minY) / (maxY - minY)) * chartH;
  };

  const points = chronological.map((pt, idx) => ({
    x: getX(idx),
    y: getY(getMetricValue(pt)),
    val: getMetricValue(pt),
    pt,
  }));

  const pathD = points.reduce((acc, p, i) => {
    return i === 0 ? `M ${p.x} ${p.y}` : `${acc} L ${p.x} ${p.y}`;
  }, '');

  const areaD =
    points.length > 0
      ? `${pathD} L ${points[points.length - 1].x} ${padTop + chartH} L ${points[0].x} ${padTop + chartH} Z`
      : '';

  const targetLineY = targetYVal !== null ? getY(targetYVal) : null;
  const baselineLineY = baselineYVal !== null && baselineYVal > 0 ? getY(baselineYVal) : null;

  // Trend direction badge styling
  const getTrendBadgeStyle = (dir: string) => {
    switch (dir) {
      case 'improving':
        return { bg: 'rgba(16, 185, 129, 0.15)', text: '#10b981', label: 'Improving' };
      case 'declining':
        return { bg: 'rgba(239, 68, 68, 0.15)', text: '#ef4444', label: 'Fluctuating' };
      case 'stable':
        return { bg: 'rgba(6, 182, 212, 0.15)', text: '#06b6d4', label: 'Stable' };
      default:
        return { bg: 'rgba(148, 163, 184, 0.15)', text: '#94a3b8', label: 'Baseline Building' };
    }
  };

  const badge = getTrendBadgeStyle(currentTrend.direction);

  const handleExerciseChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newId = e.target.value;
    setSelectedId(newId);
    if (onSelectExercise) {
      onSelectExercise(newId);
    }
  };

  return (
    <div
      className="movement-profile-card"
      style={{
        background: 'var(--bg-surface)',
        border: '1px solid var(--border-subtle)',
        borderRadius: 'var(--radius-lg)',
        padding: '16px',
        display: 'flex',
        flexDirection: 'column',
        gap: '12px',
        boxShadow: 'var(--shadow-sm)',
      }}
      aria-label="Personal Movement Profile"
    >
      {/* ── CARD HEADER ────────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Activity size={18} className="text-cyan" />
          <h3 style={{ margin: 0, fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)' }}>
            Personal Movement Profile
          </h3>
        </div>

        {/* Exercise Selector */}
        <select
          value={selectedId}
          onChange={handleExerciseChange}
          style={{
            background: 'var(--bg-card)',
            color: 'var(--text-secondary)',
            border: '1px solid var(--border-subtle)',
            borderRadius: 'var(--radius-sm)',
            padding: '3px 8px',
            fontSize: '11px',
            fontWeight: 500,
            cursor: 'pointer',
          }}
          aria-label="Select movement profile exercise"
        >
          {allExercises.map((ex) => (
            <option key={ex.id} value={ex.id}>
              {ex.name}
            </option>
          ))}
        </select>
      </div>

      {/* ── METRIC SELECTOR TABS ───────────────────────────────────────────── */}
      <div
        role="tablist"
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(4, 1fr)',
          background: 'rgba(0, 0, 0, 0.15)',
          borderRadius: 'var(--radius-sm)',
          padding: '3px',
          gap: '4px',
        }}
        aria-label="Movement trend metrics"
      >
        <button
          role="tab"
          aria-selected={selectedMetric === 'ROM'}
          onClick={() => setSelectedMetric('ROM')}
          style={{
            background: selectedMetric === 'ROM' ? 'var(--primary-dark)' : 'transparent',
            color: selectedMetric === 'ROM' ? 'white' : 'var(--text-secondary)',
            border: 'none',
            borderRadius: 'var(--radius-xs)',
            padding: '5px 4px',
            fontSize: '11px',
            fontWeight: 600,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '4px',
            transition: 'all 0.15s ease',
          }}
        >
          <TrendingUp size={11} />
          <span>ROM</span>
        </button>

        <button
          role="tab"
          aria-selected={selectedMetric === 'QUALITY'}
          onClick={() => setSelectedMetric('QUALITY')}
          style={{
            background: selectedMetric === 'QUALITY' ? 'var(--primary-dark)' : 'transparent',
            color: selectedMetric === 'QUALITY' ? 'white' : 'var(--text-secondary)',
            border: 'none',
            borderRadius: 'var(--radius-xs)',
            padding: '5px 4px',
            fontSize: '11px',
            fontWeight: 600,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '4px',
            transition: 'all 0.15s ease',
          }}
        >
          <Activity size={11} />
          <span>Quality</span>
        </button>

        <button
          role="tab"
          aria-selected={selectedMetric === 'COMPENSATION'}
          onClick={() => setSelectedMetric('COMPENSATION')}
          style={{
            background: selectedMetric === 'COMPENSATION' ? 'var(--primary-dark)' : 'transparent',
            color: selectedMetric === 'COMPENSATION' ? 'white' : 'var(--text-secondary)',
            border: 'none',
            borderRadius: 'var(--radius-xs)',
            padding: '5px 4px',
            fontSize: '11px',
            fontWeight: 600,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '4px',
            transition: 'all 0.15s ease',
          }}
        >
          <ShieldAlert size={11} />
          <span>Comp</span>
        </button>

        <button
          role="tab"
          aria-selected={selectedMetric === 'CONSISTENCY'}
          onClick={() => setSelectedMetric('CONSISTENCY')}
          style={{
            background: selectedMetric === 'CONSISTENCY' ? 'var(--primary-dark)' : 'transparent',
            color: selectedMetric === 'CONSISTENCY' ? 'white' : 'var(--text-secondary)',
            border: 'none',
            borderRadius: 'var(--radius-xs)',
            padding: '5px 4px',
            fontSize: '11px',
            fontWeight: 600,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '4px',
            transition: 'all 0.15s ease',
          }}
        >
          <Repeat size={11} />
          <span>Control</span>
        </button>
      </div>

      {/* ── TREND VISUALIZATION CANVAS ───────────────────────────────────────── */}
      <div style={{ position: 'relative', width: '100%', height: `${height}px` }}>
        {hasData ? (
          <svg
            viewBox={`0 0 ${width} ${height}`}
            style={{ width: '100%', height: '100%', overflow: 'visible' }}
          >
            <defs>
              <linearGradient id={`grad-${selectedMetric}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#06b6d4" stopOpacity="0.35" />
                <stop offset="100%" stopColor="#06b6d4" stopOpacity="0.0" />
              </linearGradient>
            </defs>

            {/* Target reference line */}
            {targetLineY !== null && (
              <>
                <line
                  x1={padLeft}
                  y1={targetLineY}
                  x2={padLeft + chartW}
                  y2={targetLineY}
                  stroke="#10b981"
                  strokeWidth="1.2"
                  strokeDasharray="4 3"
                  opacity="0.8"
                />
                <text
                  x={padLeft + chartW}
                  y={targetLineY - 4}
                  textAnchor="end"
                  fill="#10b981"
                  fontSize="9"
                  fontWeight="600"
                >
                  Target {targetYVal}{metricUnit}
                </text>
              </>
            )}

            {/* Baseline reference line */}
            {baselineLineY !== null && (
              <>
                <line
                  x1={padLeft}
                  y1={baselineLineY}
                  x2={padLeft + chartW}
                  y2={baselineLineY}
                  stroke="#06b6d4"
                  strokeWidth="1"
                  strokeDasharray="2 3"
                  opacity="0.6"
                />
                <text
                  x={padLeft + 4}
                  y={baselineLineY - 4}
                  textAnchor="start"
                  fill="#06b6d4"
                  fontSize="8"
                  fontWeight="500"
                >
                  Baseline {baselineYVal}{metricUnit}
                </text>
              </>
            )}

            {/* Shaded Area */}
            {areaD && <path d={areaD} fill={`url(#grad-${selectedMetric})`} />}

            {/* Trendline Path */}
            {pathD && (
              <path
                d={pathD}
                fill="none"
                stroke="#06b6d4"
                strokeWidth="2.2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            )}

            {/* Data Points */}
            {points.map((p, i) => (
              <g
                key={i}
                onMouseEnter={() => setHoveredIndex(i)}
                onMouseLeave={() => setHoveredIndex(null)}
                style={{ cursor: 'pointer' }}
              >
                <circle
                  cx={p.x}
                  cy={p.y}
                  r={hoveredIndex === i ? 5 : 3.5}
                  fill={hoveredIndex === i ? '#ffffff' : '#06b6d4'}
                  stroke="#0f172a"
                  strokeWidth="1.5"
                />
                {/* X axis date labels */}
                <text
                  x={p.x}
                  y={height - 8}
                  textAnchor="middle"
                  fill="var(--text-tertiary)"
                  fontSize="8"
                >
                  {p.pt.dateLabel}
                </text>
              </g>
            ))}

            {/* Active hover tooltip */}
            {hoveredIndex !== null && points[hoveredIndex] && (
              <g transform={`translate(${points[hoveredIndex].x}, ${Math.max(22, points[hoveredIndex].y - 20)})`}>
                <rect
                  x="-35"
                  y="-18"
                  width="70"
                  height="20"
                  rx="4"
                  fill="#0f172a"
                  stroke="var(--border-subtle)"
                  strokeWidth="1"
                />
                <text x="0" y="-4" textAnchor="middle" fill="#ffffff" fontSize="10" fontWeight="bold">
                  {points[hoveredIndex].val}{metricUnit}
                </text>
              </g>
            )}
          </svg>
        ) : (
          <div
            style={{
              height: '100%',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--text-tertiary)',
              fontSize: '12px',
              gap: '6px',
            }}
          >
            <HelpCircle size={22} className="text-secondary" />
            <span>Complete sessions to generate observed progress trend.</span>
          </div>
        )}
      </div>

      {/* ── OBSERVED PROGRESS & STATUS STATEMENT ────────────────────────────── */}
      <div
        style={{
          background: 'rgba(0, 0, 0, 0.12)',
          border: '1px solid var(--border-subtle)',
          borderRadius: 'var(--radius-md)',
          padding: '10px 12px',
          display: 'flex',
          flexDirection: 'column',
          gap: '6px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontSize: '11px', color: 'var(--text-secondary)', fontWeight: 500 }}>
            {selectedMetric} Performance Trend:
          </span>
          <span
            style={{
              fontSize: '10px',
              fontWeight: 700,
              padding: '2px 8px',
              borderRadius: '12px',
              background: badge.bg,
              color: badge.text,
              textTransform: 'uppercase',
              letterSpacing: '0.04em',
            }}
          >
            {badge.label}
          </span>
        </div>

        <p
          style={{
            margin: 0,
            fontSize: '12px',
            color: 'var(--text-primary)',
            lineHeight: 1.4,
          }}
        >
          {profile.observedProgressStatement}
        </p>
      </div>

      {/* ── LONGITUDINAL PROFILE SUMMARY METRICS BAR ────────────────────────── */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(4, 1fr)',
          gap: '8px',
          paddingTop: '4px',
        }}
      >
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '10px', color: 'var(--text-tertiary)' }}>Baseline</div>
          <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)' }}>
            {profile.baselineROM ? `${profile.baselineROM}°` : '--'}
          </div>
        </div>

        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '10px', color: 'var(--text-tertiary)' }}>Recent</div>
          <div style={{ fontSize: '13px', fontWeight: 700, color: '#06b6d4' }}>
            {profile.recentROM ? `${profile.recentROM}°` : '--'}
          </div>
        </div>

        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '10px', color: 'var(--text-tertiary)' }}>Adherence</div>
          <div style={{ fontSize: '13px', fontWeight: 700, color: '#10b981' }}>
            {profile.adherence.adherenceScore}%
          </div>
        </div>

        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '10px', color: 'var(--text-tertiary)' }}>Control</div>
          <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)' }}>
            {profile.consistency}%
          </div>
        </div>
      </div>
    </div>
  );
};
