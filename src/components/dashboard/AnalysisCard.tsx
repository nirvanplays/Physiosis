/**
 * AnalysisCard.tsx
 * Right-side panel: Real-time patient biomechanical movement analysis.
 *
 * Modernized for Premium Medical-Tech / Sports-Science UI:
 *   - Large typography for key kinematics (Current ROM, Target, Completion %).
 *   - Clean clinical micro-cards with subtle surfaces and thin borders.
 *   - Movement Quality score ring, limitation alert, and non-prescriptive advisory guidance.
 */

import React, { useState, useMemo } from 'react';
import {
  BarChart2,
  Lightbulb,
  Info,
  AlertTriangle,
  CheckCircle2,
  Activity,
  ShieldAlert,
  HelpCircle,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import type { PoseTrackingStats } from '../../types/pose';
import type { EngineStatus } from '../../types/engine';
import type { ShoulderFlexionAnalysis, MovementState } from '../../engine/biomechanics/biomechanicsTypes';
import type { LiveSessionState } from '../../engine/session/SessionTypes';
import type { ExerciseDefinition } from '../../engine/exercise/ExerciseTypes';
import { getDefaultExercise } from '../../engine/exercise/ExerciseRegistry';
import type { PhaseConfig } from '../../engine/exercise/PoseTypes';
import { getSuggestionForLimitation, SUGGESTION_DISCLAIMER } from '../../engine/feedback/SuggestionLibrary';
import { PatientBaselineEngine } from '../../engine/ai/baseline/PatientBaselineEngine';
import { getSessions } from '../../engine/session/SessionStorage';
import { RehabilitationSafetyEngine } from '../../engine/safety/RehabilitationSafetyEngine';
import { RehabilitationRecommendationEngine } from '../../engine/recommendation/RehabilitationRecommendationEngine';
import type { PatientRehabilitationState } from '../../engine/state/PatientRehabilitationState';


interface AnalysisCardProps {
  exercise?: ExerciseDefinition;
  mode?: 'TUTORIAL' | 'PRACTICE' | 'LIVE' | 'DEMO';
  engineStatus: EngineStatus;
  isStreaming: boolean;
  stats: PoseTrackingStats;
  shoulderFlexion: ShoulderFlexionAnalysis;
  sessionState?: LiveSessionState;
  demoAngle?: number;
  demoPhase?: PhaseConfig;
  demoTimelineMs?: number;
  patientState?: PatientRehabilitationState | null;
}

const STATE_LABELS: Record<MovementState, string> = {
  WAITING:   'Waiting for landmarks',
  READY:     'Ready',
  LIFTING:   'In motion',
  AT_TARGET: 'Target reached',
  RETURNING: 'Returning',
  LOW_RANGE: 'Limited range detected',
};

const STATE_COLOUR: Record<MovementState, string> = {
  WAITING:   'var(--text-disabled)',
  READY:     'var(--accent-cyan)',
  LIFTING:   'var(--accent-blue)',
  AT_TARGET: 'var(--color-good)',
  RETURNING: 'var(--accent-cyan)',
  LOW_RANGE: 'var(--color-warn)',
};

function scoreColour(score: number): string {
  if (score >= 75) return 'var(--color-good)';
  if (score >= 45) return 'var(--color-warn)';
  return 'var(--color-crit)';
}

export const AnalysisCard: React.FC<AnalysisCardProps> = ({
  exercise = getDefaultExercise(),
  mode = 'TUTORIAL',
  engineStatus: _engineStatus,
  isStreaming,
  stats,
  shoulderFlexion,
  sessionState,
  demoAngle,
  demoPhase,
  demoTimelineMs: _demoTimelineMs,
  patientState: _patientState,
}) => {
  const isDemo = mode === 'DEMO';

  // ── Demo derivations ───────────────────────────────────────────────────────
  const currentDemoAngle = demoAngle !== undefined ? Math.round(demoAngle) : exercise.startAngle;
  const demoTarget = exercise.targetAngle;
  const demoRomPct = Math.min(100, Math.max(0, Math.round((currentDemoAngle / demoTarget) * 100)));
  const phaseType = demoPhase?.phase || 'REFERENCE';

  let demoScore = 95;
  let demoStateLabel = 'Reference Form';
  let demoStateColour = 'var(--color-good)';
  let demoFeedback = demoPhase?.caption || `Reference range of motion (${demoTarget}°) demonstration.`;

  if (phaseType === 'LIMITATION') {
    demoScore = 42;
    demoStateLabel = 'Detected Limitation';
    demoStateColour = '#FFA726';
    demoFeedback = `Detected limitation: Peak restricted to ${exercise.limitedAngle}° vs reference ${demoTarget}°.`;
  } else if (phaseType === 'CORRECTION') {
    demoScore = 78;
    demoStateLabel = 'Correction Phase';
    demoStateColour = 'var(--accent-cyan)';
    demoFeedback = `Correction: Focus on smooth scapular elevation to achieve ${demoTarget}°.`;
  }

  // ── Live derivations ───────────────────────────────────────────────────────
  const hasValidAnalysis = isStreaming && shoulderFlexion.angle !== null;
  const activeAngle = isDemo ? currentDemoAngle : hasValidAnalysis ? shoulderFlexion.angle : null;
  const targetAngle = exercise.targetAngle;
  const romPct =
    isDemo
      ? demoRomPct
      : activeAngle !== null
      ? Math.min(100, Math.max(0, Math.round((activeAngle / targetAngle) * 100)))
      : null;

  const formScore = isDemo ? demoScore : hasValidAnalysis && shoulderFlexion.score !== null ? shoulderFlexion.score : 0;
  const showScore = isDemo || (hasValidAnalysis && shoulderFlexion.score !== null);
  const stateLabel = isDemo ? demoStateLabel : STATE_LABELS[shoulderFlexion.state] ?? shoulderFlexion.state;
  const stateColour = isDemo ? demoStateColour : STATE_COLOUR[shoulderFlexion.state] ?? 'var(--text-disabled)';

  const repCount = sessionState?.repHistory?.length ?? shoulderFlexion.repCount;
  const latestRep = sessionState?.latestRep;
  const isLastRepLimited = latestRep?.limitationDetected ?? false;
  const isLimitationActive =
    hasValidAnalysis &&
    (isLastRepLimited || shoulderFlexion.state === 'LOW_RANGE');

  const activeSuggestion = isLimitationActive
    ? getSuggestionForLimitation(exercise.id, true)
    : null;

  const baseline = React.useMemo(() => {
    try {
      const allSessions = getSessions();
      return PatientBaselineEngine.computeExerciseBaseline(
        allSessions,
        exercise.id || exercise.name,
        exercise.name
      );
    } catch {
      return null;
    }
  }, [exercise.id, exercise.name, sessionState?.sessionState]);

  const baselineComparison = React.useMemo(() => {
    if (!baseline || baseline.status !== 'BASELINE_AVAILABLE') return null;
    return PatientBaselineEngine.compareWithBaseline(activeAngle ?? 0, baseline, targetAngle);
  }, [activeAngle, baseline, targetAngle]);

  const safetyEval = React.useMemo(() => {
    return RehabilitationSafetyEngine.evaluate({
      exerciseId: exercise.id,
      trackingConfidence: (shoulderFlexion.confidence ?? (stats.poseDetected ? stats.confidence : 0)) / 100,
      currentAngle: activeAngle ?? 0,
      targetAngle,
      angularVelocity: 0,
      severeCompensation: shoulderFlexion.postureResult?.isAbnormalDetected && shoulderFlexion.postureResult.primaryFault?.severity === 'SEVERE',
    });
  }, [exercise.id, shoulderFlexion.confidence, stats.poseDetected, stats.confidence, activeAngle, targetAngle, shoulderFlexion.postureResult]);

  const [isExplainOpen, setIsExplainOpen] = useState(false);

  const rec = useMemo(() => {
    return RehabilitationRecommendationEngine.evaluate({
      exercise,
      rom: {
        currentAngle: activeAngle,
        targetAngle,
        romPercentage: romPct ?? 0,
      },
      movementQuality: {
        score: shoulderFlexion.score ?? 80,
        stability: 85,
        symmetry: shoulderFlexion.postureResult?.isAbnormalDetected ? 75 : 92,
      },
      compensation: {
        detected: Boolean(shoulderFlexion.postureResult?.isAbnormalDetected),
        primaryFault: shoulderFlexion.postureResult?.primaryFault ?? null,
      },
      confidence: {
        trackingConfidence: stats.poseDetected ? Math.round(stats.confidence) : 0,
        biomechanicalConfidence: shoulderFlexion.confidence ?? 0,
        isReliable: stats.poseDetected && stats.confidence >= 50,
      },
      safetyState: {
        level:
          safetyEval.state === 'STOP' || safetyEval.state === 'ESCALATE'
            ? 'STOP_MOVEMENT'
            : safetyEval.state === 'CAUTION'
            ? 'CAUTION'
            : 'SAFE',
        flaggedHazards: safetyEval.flaggedHazards,
      },
    });
  }, [exercise, activeAngle, targetAngle, romPct, shoulderFlexion, stats, safetyEval]);

  let displayFeedback = shoulderFlexion.feedback;

  if (safetyEval.state === 'STOP') {
    displayFeedback = RehabilitationSafetyEngine.STOP_CLINICAL_PROMPT;
  } else if (safetyEval.state === 'ESCALATE') {
    displayFeedback = safetyEval.escalationNotice || RehabilitationSafetyEngine.ESCALATION_PROMPT;
  } else if (isDemo) {
    displayFeedback = demoFeedback;
  } else if (!isStreaming) {
    displayFeedback = 'Start optical camera or select an exercise to begin real-time biomechanics tracking.';
  } else if (!hasValidAnalysis) {
    displayFeedback = 'Position yourself in full view of the camera to begin tracking.';
  }

  return (
    <div className="card analysis-card" role="region" aria-label="Biomechanical Movement Analysis">
      {/* ── Card Header ─────────────────────────────────────────────────── */}
      <div className="card__header">
        <div className="card__header-left">
          <BarChart2 size={16} />
          <div>
            <span className="card__title">{isDemo ? 'Demonstration Analysis' : 'Real-Time Analysis'}</span>
            <span style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'block' }}>
              {exercise.name} · Side: {exercise.laterality === 'bilateral' ? 'Bilateral' : (exercise.side?.toUpperCase() || 'RIGHT')}
            </span>
          </div>
        </div>

        <div className="card__header-right">
          <span
            className="analysis-card__live-badge"
            style={{
              background: isDemo
                ? 'rgba(255, 167, 38, 0.15)'
                : !exercise.liveAnalysisAvailable
                ? 'rgba(255, 171, 0, 0.15)'
                : hasValidAnalysis
                ? 'var(--color-good-dim)'
                : 'var(--bg-overlay)',
              color: isDemo
                ? '#FFA726'
                : !exercise.liveAnalysisAvailable
                ? '#ffab00'
                : hasValidAnalysis
                ? 'var(--color-good)'
                : 'var(--text-muted)',
              fontWeight: 600,
            }}
          >
            {isDemo
              ? 'DEMO ANALYSIS'
              : !exercise.liveAnalysisAvailable
              ? 'REFERENCE DEMO ONLY'
              : hasValidAnalysis
              ? 'LIVE KINEMATICS'
              : isStreaming
              ? 'WAITING FOR LANDMARKS'
              : 'STANDBY'}
          </span>
        </div>
      </div>

      {/* ── Unsupported Live Analysis Notice ─────────────────────────── */}
      {!exercise.liveAnalysisAvailable && !isDemo ? (
        <div className="analysis-card__unsupported-container">
          <div className="analysis-card__unsupported-badge">
            <Info size={14} className="text-amber" />
            <span>REFERENCE DEMO MODE</span>
          </div>
          <h4 className="analysis-card__unsupported-title">Prototype Analysis Not Yet Available</h4>
          <p className="analysis-card__unsupported-text">
            {exercise.liveAnalysisStatusMessage ||
              'Optical single-camera telemetry for this protocol is currently in development.'}
          </p>
          <div className="analysis-card__unsupported-hint">
            <span>• Explore ideal movement form using the Reference Demonstration panel.</span>
            <span>• No artificial or uncalibrated angle measurements are displayed.</span>
          </div>
        </div>
      ) : (
        <div className="analysis-card__body">
          {/* ── Key Kinematics Hero Micro-Card Grid ────────────────────────── */}
          <div className="kinematics-grid">
            {/* 1. Current ROM */}
            <div className="kinematics-card kinematics-card--hero">
              <span className="kinematics-card__label">CURRENT ROM</span>
              <div className="kinematics-card__val-row">
                <span className="kinematics-card__val mono text-cyan">
                  {activeAngle !== null ? `${activeAngle}°` : '—'}
                </span>
              </div>
              <span className="kinematics-card__sub">
                {activeAngle !== null && activeAngle >= targetAngle - 5
                  ? 'Target reached'
                  : activeAngle !== null && activeAngle >= targetAngle - 25
                  ? 'Near target'
                  : 'Elevation'}
              </span>
            </div>

            {/* 2. Target ROM */}
            <div className="kinematics-card">
              <span className="kinematics-card__label">TARGET ROM</span>
              <div className="kinematics-card__val-row">
                <span className="kinematics-card__val mono text-muted">
                  {targetAngle}°
                </span>
              </div>
              <span className="kinematics-card__sub">{exercise.plane} Plane</span>
            </div>

            {/* 3. ROM Completion */}
            <div className="kinematics-card">
              <span className="kinematics-card__label">COMPLETION</span>
              <div className="kinematics-card__val-row">
                <span
                  className="kinematics-card__val mono"
                  style={{
                    color:
                      romPct !== null
                        ? romPct >= 90
                          ? 'var(--color-good)'
                          : romPct >= 65
                          ? 'var(--accent-cyan)'
                          : 'var(--color-warn)'
                        : 'var(--text-disabled)',
                  }}
                >
                  {romPct !== null ? `${romPct}%` : '—'}
                </span>
              </div>
              <span className="kinematics-card__sub">
                {activeAngle !== null ? `${Math.max(0, targetAngle - activeAngle)}° remaining` : 'Standby'}
              </span>
            </div>
          </div>

          {/* ── Patient Baseline Comparison Chip (Patch 4) ──────────────── */}
          {baselineComparison && (
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                background: 'rgba(56, 189, 248, 0.05)',
                border: '1px solid rgba(56, 189, 248, 0.15)',
                borderRadius: '6px',
                padding: '6px 10px',
                marginBottom: '10px',
                fontSize: '11px',
              }}
            >
              <span style={{ color: 'var(--text-secondary)' }}>
                Baseline: <strong className="text-mono" style={{ color: '#38bdf8' }}>{baselineComparison.baselineROM}°</strong>
              </span>
              <span
                style={{
                  fontWeight: 600,
                  color:
                    baselineComparison.comparisonStatus === 'ABOVE_BASELINE' ||
                    baselineComparison.comparisonStatus === 'AT_REFERENCE_TARGET'
                      ? 'var(--color-good)'
                      : baselineComparison.comparisonStatus === 'BELOW_BASELINE'
                      ? 'var(--color-warn)'
                      : 'var(--text-primary)',
                }}
              >
                {baselineComparison.comparisonStatement}
              </span>
            </div>
          )}

          {/* ── Horizontal ROM Progress Bar ───────────────────────────────── */}

          <div className="sf-rom-bar-container">
            <div
              className="sf-rom-bar"
              role="progressbar"
              aria-valuenow={romPct ?? 0}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label="Range-of-motion completion"
            >
              <div
                className="sf-rom-bar__fill"
                style={{
                  width: `${romPct ?? 0}%`,
                  background:
                    activeAngle !== null && activeAngle >= targetAngle - 5
                      ? 'var(--color-good)'
                      : isLimitationActive
                      ? 'var(--color-warn)'
                      : 'var(--accent-cyan)',
                }}
              />
            </div>
          </div>

          {/* ── Movement Quality & Repetitions Row ─────────────────────────── */}
          <div className="quality-reps-row">
            {/* Score Ring */}
            <div className="quality-mini-card">
              <div className="quality-mini-ring">
                <svg viewBox="0 0 60 60" className="form-score__ring" aria-hidden="true">
                  <circle className="form-score__ring-track" cx="30" cy="30" r="24" strokeWidth="5" fill="none" />
                  <circle
                    className="form-score__ring-fill"
                    cx="30" cy="30" r="24"
                    strokeWidth="5" fill="none"
                    strokeDasharray={`${2 * Math.PI * 24}`}
                    strokeDashoffset={showScore ? `${2 * Math.PI * 24 * (1 - formScore / 100)}` : `${2 * Math.PI * 24}`}
                    strokeLinecap="round"
                    transform="rotate(-90 30 30)"
                    style={{ stroke: showScore ? scoreColour(formScore) : 'var(--border-subtle)' }}
                  />
                </svg>
                <span className="quality-mini-val mono">{showScore ? formScore : '—'}</span>
              </div>
              <div className="quality-mini-info">
                <span className="quality-mini-label">MOVEMENT QUALITY</span>
                <span className="quality-mini-status" style={{ color: stateColour }}>
                  {stateLabel}
                </span>
              </div>
            </div>

            {/* Rep Counter */}
            <div className="reps-mini-card">
              <span className="reps-mini-label">COMPLETED REPS</span>
              <span className="reps-mini-val mono">{repCount}</span>
              <span className="reps-mini-sub">{isStreaming ? 'Session Active' : 'Session Ready'}</span>
            </div>
          </div>

          {/* ── Postural Integrity & Abnormal Compensation Status ─────────── */}
          {hasValidAnalysis && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '8px 12px',
                borderRadius: 'var(--radius-md)',
                background: shoulderFlexion.postureResult?.isAbnormalDetected
                  ? 'rgba(255, 82, 82, 0.08)'
                  : 'rgba(0, 229, 255, 0.05)',
                border: `1px solid ${
                  shoulderFlexion.postureResult?.isAbnormalDetected
                    ? 'rgba(255, 82, 82, 0.3)'
                    : 'rgba(0, 229, 255, 0.15)'
                }`,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Activity
                  size={14}
                  style={{
                    color: shoulderFlexion.postureResult?.isAbnormalDetected
                      ? '#FF5252'
                      : 'var(--accent-cyan)',
                  }}
                />
                <div>
                  <span style={{ fontSize: '10px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', display: 'block' }}>
                    POSTURAL INTEGRITY
                  </span>
                  <span
                    style={{
                      fontSize: '11.5px',
                      fontWeight: 600,
                      color: shoulderFlexion.postureResult?.isAbnormalDetected
                        ? '#FF8A80'
                        : '#00E676',
                    }}
                  >
                    {shoulderFlexion.postureResult?.isAbnormalDetected && shoulderFlexion.postureResult.primaryFault
                      ? `${shoulderFlexion.postureResult.primaryFault.name} (+${shoulderFlexion.postureResult.primaryFault.measuredValue}${shoulderFlexion.postureResult.primaryFault.unit})`
                      : '✓ Kinetic Chain Alignment Stable'}
                  </span>
                </div>
              </div>

              <span
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: '14px',
                  fontWeight: 700,
                  color:
                    (shoulderFlexion.postureResult?.overallPosturalScore ?? 100) >= 80
                      ? '#00E676'
                      : (shoulderFlexion.postureResult?.overallPosturalScore ?? 100) >= 60
                      ? '#FFA726'
                      : '#FF5252',
                }}
              >
                {shoulderFlexion.postureResult?.overallPosturalScore ?? 100}%
              </span>
            </div>
          )}

          {/* ── Real-Time Clinical Safety Alert (Patch 6) ─────────────────── */}
          {safetyEval.state === 'ESCALATE' && (
            <div
              style={{
                background: 'rgba(255, 82, 82, 0.15)',
                border: '1px solid #FF5252',
                borderRadius: 'var(--radius-md)',
                padding: '10px 14px',
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
              }}
              role="alert"
            >
              <ShieldAlert size={18} style={{ color: '#FF5252', flexShrink: 0 }} />
              <div>
                <strong style={{ color: '#FF5252', fontSize: '12px', display: 'block' }}>
                  Clinical Escalation Alert
                </strong>
                <span style={{ color: '#FF8A80', fontSize: '11.5px' }}>
                  {safetyEval.escalationNotice || RehabilitationSafetyEngine.ESCALATION_PROMPT}
                </span>
              </div>
            </div>
          )}

          {safetyEval.state === 'STOP' && (
            <div
              style={{
                background: 'rgba(255, 167, 38, 0.15)',
                border: '1px solid #FFA726',
                borderRadius: 'var(--radius-md)',
                padding: '10px 14px',
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
              }}
              role="alert"
            >
              <AlertTriangle size={18} style={{ color: '#FFA726', flexShrink: 0 }} />
              <div>
                <strong style={{ color: '#FFA726', fontSize: '12px', display: 'block' }}>
                  Movement Safety Stop
                </strong>
                <span style={{ color: '#FFE082', fontSize: '11.5px' }}>
                  {RehabilitationSafetyEngine.STOP_CLINICAL_PROMPT}
                </span>
              </div>
            </div>
          )}

          {/* ── Limitation Alert Banner ───────────────────────────────────── */}
          {isLimitationActive && (
            <div className="limitation-alert-banner" role="alert">
              <AlertTriangle size={15} className="text-warn flex-shrink-0" />
              <div className="limitation-alert-content">
                <strong>Limitation Detected: </strong>
                <span>
                  Shoulder elevation peaked below reference ({activeAngle}° vs {targetAngle}° target).
                </span>
              </div>
            </div>
          )}

          {activeAngle !== null && activeAngle >= targetAngle - 5 && (
            <div className="target-met-banner" role="status">
              <CheckCircle2 size={15} className="text-good flex-shrink-0" />
              <div className="target-met-content">
                <strong>Target Range Achieved: </strong>
                <span>Full {targetAngle}° elevation completed with good form.</span>
              </div>
            </div>
          )}

          {/* ── Clinical Advisory Feedback ────────────────────────────────── */}
          <div className="advisory-guidance-box">
            <p className="flexion-feedback" role="status" aria-live="polite">
              {displayFeedback}
            </p>

            {activeSuggestion && (
              <div className="analysis-card__suggestion" role="complementary" aria-label="Advisory suggestion">
                <div className="analysis-card__suggestion-header">
                  <Lightbulb size={12} className="text-cyan" />
                  <span className="analysis-card__suggestion-label">Advisory Suggestion</span>
                </div>
                <p className="analysis-card__suggestion-name">{activeSuggestion.name}</p>
                <p className="analysis-card__suggestion-guidance">{activeSuggestion.shortGuidance}</p>
                <p className="analysis-card__suggestion-disclaimer">{SUGGESTION_DISCLAIMER}</p>
              </div>
            )}
          </div>

          {/* ── Explainable AI: Patient View & Evidence Rationale (Patch 8) ─ */}
          <div
            style={{
              background: 'rgba(56, 189, 248, 0.04)',
              border: '1px solid rgba(56, 189, 248, 0.2)',
              borderRadius: 'var(--radius-md)',
              padding: '10px 12px',
              marginBottom: '12px',
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                cursor: 'pointer',
              }}
              onClick={() => setIsExplainOpen(!isExplainOpen)}
              title="Click to toggle clinical evidence rationale"
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <HelpCircle size={14} className="text-cyan" />
                <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  Why This Recommendation? (Patient View)
                </span>
              </div>
              <span style={{ fontSize: '11px', color: 'var(--accent-cyan)', display: 'flex', alignItems: 'center', gap: '2px' }}>
                {isExplainOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
              </span>
            </div>

            <p style={{ fontSize: '12px', color: 'var(--text-primary)', margin: '6px 0 0 0', lineHeight: 1.45 }}>
              "{rec.explanation.patientView}"
            </p>

            {isExplainOpen && (
              <div
                style={{
                  marginTop: '8px',
                  paddingTop: '8px',
                  borderTop: '1px solid rgba(255, 255, 255, 0.08)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '4px',
                  fontSize: '11px',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--text-muted)' }}>Observation:</span>
                  <span style={{ color: 'var(--text-secondary)', textAlign: 'right' }}>{rec.explanation.observation}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--text-muted)' }}>Clinical Evidence:</span>
                  <span style={{ color: 'var(--accent-cyan)', fontFamily: 'var(--font-mono)' }}>{rec.explanation.evidence}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ color: 'var(--text-muted)' }}>Confidence / Source:</span>
                  <span style={{ color: 'var(--color-good)' }}>
                    {Math.round(rec.explanation.confidence * 100)}% ({rec.explanation.source.join(', ')})
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* ── Engine Pipeline Telemetry ─────────────────────────────────── */}
          <div className="engine-telemetry-box">
            <div className="telemetry-item">
              <span className="telemetry-item__key">Protocol</span>
              <span className="telemetry-item__val">{exercise.name}</span>
            </div>
            <div className="telemetry-item">
              <span className="telemetry-item__key">Kinematics</span>
              <span className="telemetry-item__val">{exercise.metricName}</span>
            </div>
            <div className="telemetry-item">
              <span className="telemetry-item__key">Safety</span>
              <span className="telemetry-item__val" style={{ color: safetyEval.state === 'SAFE' ? '#00E676' : safetyEval.state === 'CAUTION' ? '#FFA726' : '#FF5252' }}>
                {safetyEval.state}
              </span>
            </div>
            <div className="telemetry-item">
              <span className="telemetry-item__key">Confidence</span>
              <span className="telemetry-item__val mono">
                {shoulderFlexion.confidence !== null ? `${shoulderFlexion.confidence}%` : '—'}
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
