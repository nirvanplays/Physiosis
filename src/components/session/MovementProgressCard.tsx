/**
 * MovementProgressCard.tsx
 * Patient-Specific Movement Baseline & Individual Progress Model (Patch 4).
 *
 * Replaces artificial recovery percentages with:
 *   1. Empirical patient baseline (best, typical, median ROM, consistency, compensation frequency)
 *   2. Strict eligibility status: "Baseline available" vs "Insufficient history"
 *   3. 3-Way Comparison: Reference Target vs Patient Baseline vs Current Movement
 *   4. Objective comparative statements: "Above your recent baseline." (Never "Recovered.")
 *   5. Statistical trend classification: improving | stable | declining | insufficient data
 *   6. Personalized difficulty progression milestones within clinical safety bounds
 */

import React from 'react';
import { TrendingUp, Award, AlertCircle, Zap } from 'lucide-react';
import type { PhysiosisSession } from '../../engine/session/SessionTypes';
import type { ExerciseDefinition } from '../../engine/exercise/ExerciseTypes';
import { PatientBaselineEngine } from '../../engine/ai/baseline/PatientBaselineEngine';
import type { PatientRehabilitationState } from '../../engine/state/PatientRehabilitationState';

interface MovementProgressCardProps {
  sessions: PhysiosisSession[];
  activeExercise: ExerciseDefinition;
  onOpenLatestReport?: () => void;
  currentAngle?: number | null;
  patientState?: PatientRehabilitationState | null;
}

export const MovementProgressCard: React.FC<MovementProgressCardProps> = ({
  sessions,
  activeExercise,
  onOpenLatestReport,
  currentAngle = null,
  patientState,
}) => {
  const exerciseKey = activeExercise.id || activeExercise.name;
  const baseline = PatientBaselineEngine.computeExerciseBaseline(
    sessions,
    exerciseKey,
    activeExercise.name
  );

  const referenceTarget = activeExercise.targetAngle;

  // Determine current value: prefer live angle if active, otherwise latest session best/typical ROM
  const latestSession = sessions
    .filter((s) => (s.exerciseId || s.exercise || '').toLowerCase().replace(/[\s-_]+/g, '') ===
      exerciseKey.toLowerCase().replace(/[\s-_]+/g, ''))
    .sort((a, b) => b.startedAt - a.startedAt)[0];

  const effectiveCurrent = currentAngle !== null && currentAngle > 10
    ? Math.round(currentAngle)
    : patientState?.currentROM.value !== null && patientState?.currentROM.value !== undefined && patientState.currentROM.value > 10
    ? Math.round(patientState.currentROM.value)
    : latestSession?.bestROM || baseline.bestROM || 0;

  const comparison = PatientBaselineEngine.compareWithBaseline(
    effectiveCurrent,
    baseline,
    referenceTarget
  );

  const trendResult = PatientBaselineEngine.calculateStatisticalTrend(sessions, exerciseKey);
  const personalization = PatientBaselineEngine.generatePersonalization(baseline, null, activeExercise);

  const isBaselineAvailable = baseline.status === 'BASELINE_AVAILABLE';

  // Map statistical trend to badge styling
  const trendClasses: Record<string, string> = {
    improving: 'trend-badge--improving',
    stable: 'trend-badge--stable',
    declining: 'trend-badge--declining',
    'insufficient data': 'trend-badge--insufficient',
  };

  const trendClass = trendClasses[trendResult.trend] || 'trend-badge--insufficient';

  return (
    <div className="card movement-progress-card">
      {/* Header */}
      <div className="card__header">
        <div className="card__header-left">
          <TrendingUp size={16} className="text-cyan" />
          <div>
            <span className="card__title">Personal Baseline & Progress</span>
            <span className="movement-progress-card__sub">{activeExercise.name}</span>
          </div>
        </div>

        <div className="card__header-right" style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
          {/* Baseline Status Indicator */}
          <span
            className={`status-pill ${
              isBaselineAvailable ? 'status-pill--active' : 'status-pill--standby'
            }`}
            style={{ fontSize: '11px', padding: '2px 8px' }}
          >
            {isBaselineAvailable ? 'Baseline available' : 'Insufficient history'}
          </span>

          {/* Statistical Trend Badge */}
          <span className={`trend-badge ${trendClass}`}>
            {trendResult.trend.charAt(0).toUpperCase() + trendResult.trend.slice(1)}
          </span>
        </div>
      </div>

      <div className="movement-progress-card__body">
        {/* ── Section A: Three-Way Comparison Statement ──────────────────────── */}
        <div
          className="baseline-comparison-banner"
          style={{
            background: 'var(--surface-sunken, rgba(255, 255, 255, 0.03))',
            border: '1px solid var(--border-subtle, rgba(255, 255, 255, 0.08))',
            borderRadius: '8px',
            padding: '12px 14px',
            marginBottom: '12px',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
            <span
              style={{
                fontSize: '13px',
                fontWeight: 600,
                color:
                  comparison.comparisonStatus === 'ABOVE_BASELINE' || comparison.comparisonStatus === 'AT_REFERENCE_TARGET'
                    ? 'var(--color-good, #10b981)'
                    : comparison.comparisonStatus === 'BELOW_BASELINE'
                    ? 'var(--color-warn, #f59e0b)'
                    : 'var(--text-primary, #ffffff)',
              }}
            >
              {comparison.comparisonStatement}
            </span>
            {comparison.deltaVsBaseline !== null && (
              <span
                className="text-mono"
                style={{
                  fontSize: '12px',
                  fontWeight: 700,
                  color: comparison.deltaVsBaseline >= 0 ? 'var(--color-good, #10b981)' : 'var(--color-warn, #f59e0b)',
                }}
              >
                {comparison.deltaVsBaseline >= 0 ? `+${comparison.deltaVsBaseline}°` : `${comparison.deltaVsBaseline}°`} vs baseline
              </span>
            )}
          </div>
          <p style={{ fontSize: '11px', color: 'var(--text-secondary, #94a3b8)', margin: 0, lineHeight: 1.4 }}>
            {comparison.detailedNote}
          </p>
        </div>

        {/* ── Section B: Triple Target Visualizer (Current vs Baseline vs Target) ── */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(3, 1fr)',
            gap: '8px',
            marginBottom: '14px',
            textAlign: 'center',
          }}
        >
          {/* 1. Patient Baseline */}
          <div
            style={{
              background: 'rgba(255, 255, 255, 0.02)',
              border: '1px solid rgba(255, 255, 255, 0.06)',
              borderRadius: '6px',
              padding: '8px 4px',
            }}
          >
            <div style={{ fontSize: '10px', color: 'var(--text-muted, #64748b)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Your Baseline
            </div>
            <div className="text-mono" style={{ fontSize: '18px', fontWeight: 700, color: '#38bdf8', marginTop: '2px' }}>
              {isBaselineAvailable ? `${baseline.typicalROM}°` : '—'}
            </div>
            <div style={{ fontSize: '9px', color: 'var(--text-secondary, #94a3b8)' }}>Typical ROM</div>
          </div>

          {/* 2. Current Session / Movement */}
          <div
            style={{
              background: 'rgba(56, 189, 248, 0.06)',
              border: '1px solid rgba(56, 189, 248, 0.25)',
              borderRadius: '6px',
              padding: '8px 4px',
            }}
          >
            <div style={{ fontSize: '10px', color: 'var(--accent-cyan, #38bdf8)', textTransform: 'uppercase', letterSpacing: '0.04em', fontWeight: 600 }}>
              Current
            </div>
            <div className="text-mono" style={{ fontSize: '18px', fontWeight: 700, color: '#ffffff', marginTop: '2px' }}>
              {effectiveCurrent > 0 ? `${effectiveCurrent}°` : '—'}
            </div>
            <div style={{ fontSize: '9px', color: 'var(--text-secondary, #94a3b8)' }}>Observed ROM</div>
          </div>

          {/* 3. Reference Target */}
          <div
            style={{
              background: 'rgba(16, 185, 129, 0.04)',
              border: '1px solid rgba(16, 185, 129, 0.15)',
              borderRadius: '6px',
              padding: '8px 4px',
            }}
          >
            <div style={{ fontSize: '10px', color: 'var(--color-good, #10b981)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Reference Target
            </div>
            <div className="text-mono" style={{ fontSize: '18px', fontWeight: 700, color: '#10b981', marginTop: '2px' }}>
              {referenceTarget}°
            </div>
            <div style={{ fontSize: '9px', color: 'var(--text-secondary, #94a3b8)' }}>Clinical Target</div>
          </div>
        </div>

        {/* ── Section C: Baseline Kinematics Grid ────────────────────────────── */}
        {isBaselineAvailable ? (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(3, 1fr)',
              gap: '6px',
              background: 'rgba(0, 0, 0, 0.2)',
              borderRadius: '6px',
              padding: '10px',
              marginBottom: '12px',
            }}
          >
            <div>
              <span style={{ fontSize: '10px', color: 'var(--text-muted, #64748b)' }}>Best ROM</span>
              <div className="text-mono" style={{ fontSize: '13px', fontWeight: 600 }}>{baseline.bestROM}°</div>
            </div>
            <div>
              <span style={{ fontSize: '10px', color: 'var(--text-muted, #64748b)' }}>Median ROM</span>
              <div className="text-mono" style={{ fontSize: '13px', fontWeight: 600 }}>{baseline.medianROM}°</div>
            </div>
            <div>
              <span style={{ fontSize: '10px', color: 'var(--text-muted, #64748b)' }}>Consistency</span>
              <div className="text-mono" style={{ fontSize: '13px', fontWeight: 600 }}>{baseline.repConsistency}%</div>
            </div>
            <div>
              <span style={{ fontSize: '10px', color: 'var(--text-muted, #64748b)' }}>Avg Quality</span>
              <div className="text-mono" style={{ fontSize: '13px', fontWeight: 600 }}>{baseline.quality}/100</div>
            </div>
            <div>
              <span style={{ fontSize: '10px', color: 'var(--text-muted, #64748b)' }}>Compensations</span>
              <div
                className="text-mono"
                style={{
                  fontSize: '13px',
                  fontWeight: 600,
                  color: baseline.compensationFrequency > 25 ? 'var(--color-warn, #f59e0b)' : 'inherit',
                }}
              >
                {baseline.compensationFrequency}%
              </div>
            </div>
            <div>
              <span style={{ fontSize: '10px', color: 'var(--text-muted, #64748b)' }}>Speed</span>
              <div className="text-mono" style={{ fontSize: '13px', fontWeight: 600 }}>{baseline.movementSpeed}°/s</div>
            </div>
          </div>
        ) : (
          <div
            style={{
              padding: '10px 12px',
              borderRadius: '6px',
              background: 'rgba(245, 158, 11, 0.05)',
              border: '1px solid rgba(245, 158, 11, 0.15)',
              marginBottom: '12px',
              display: 'flex',
              gap: '8px',
              alignItems: 'center',
            }}
          >
            <AlertCircle size={15} style={{ color: 'var(--color-warn, #f59e0b)', flexShrink: 0 }} />
            <span style={{ fontSize: '11px', color: 'var(--text-secondary, #94a3b8)', lineHeight: 1.3 }}>
              {baseline.eligibilityReason}
            </span>
          </div>
        )}

        {/* ── Section D: Personalized Difficulty Progression ────────────────── */}
        {isBaselineAvailable && personalization.difficultyProgression.interimTargetAngle < referenceTarget && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '8px 10px',
              borderRadius: '6px',
              background: 'rgba(56, 189, 248, 0.05)',
              border: '1px solid rgba(56, 189, 248, 0.15)',
              marginBottom: '10px',
            }}
          >
            <Zap size={14} className="text-cyan" style={{ flexShrink: 0 }} />
            <div style={{ fontSize: '11px', color: 'var(--text-secondary, #94a3b8)' }}>
              <span style={{ fontWeight: 600, color: '#ffffff' }}>Interim Milestone: </span>
              {personalization.difficultyProgression.interimTargetAngle}° (+{personalization.difficultyProgression.progressionStep}°) — building safe capacity toward {referenceTarget}°.
            </div>
          </div>
        )}

        {/* Disclaimer / Non-diagnostic notice */}
        <p className="movement-progress-card__note" style={{ fontSize: '10px', color: 'var(--text-muted, #64748b)', margin: '0 0 10px 0' }}>
          Personal baseline grounded in completed session kinematics. Evaluated for progress comparison, not medical prognosis or recovery percentage.
        </p>

        {onOpenLatestReport && (
          <button
            type="button"
            className="btn btn--secondary btn--full-width movement-progress-card__btn"
            onClick={onOpenLatestReport}
          >
            <Award size={13} />
            <span>View Latest Session Report</span>
          </button>
        )}
      </div>
    </div>
  );
};
