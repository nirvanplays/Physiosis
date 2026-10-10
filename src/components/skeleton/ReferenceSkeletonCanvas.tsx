/**
 * ReferenceSkeletonCanvas.tsx
 * Universal reference movement animation component supporting all exercises.
 *
 * MODES:
 *   TUTORIAL — Default. Plays canned 4-phase demonstration animation.
 *              Play / Pause / Restart / Phase seeking / Scrubbing fully supported.
 *
 *   PRACTICE — Entered via "Start Practice" button. Pauses the tutorial animation.
 *              Reads live patient angle from the existing pose pipeline (liveAngle prop).
 *              Displays ACTUAL vs TARGET comparison and typed advisory feedback.
 *              No second MediaPipe instance, no second webcam, no second animation loop.
 */

import React, { useEffect, useRef, useCallback, useState } from 'react';
import {
  Play, Pause, RotateCcw, AlertCircle, CheckCircle,
  Navigation, Info, Wand2, RefreshCw, ArrowLeft, Dumbbell
} from 'lucide-react';
import { AnimationController } from '../../engine/exercise/AnimationController';
import { SkeletonRenderer } from '../../engine/exercise/SkeletonRenderer';
import { getPhaseAtTime } from '../../engine/exercise/PoseTypes';
import type {
  ReferencePose, ExercisePhase, PhaseConfig, AnimationTimeline,
} from '../../engine/exercise/PoseTypes';
import type { PlaybackState } from '../../engine/exercise/AnimationController';
import type { RepResult } from '../../engine/session/SessionTypes';
import type { ExerciseDefinition } from '../../engine/exercise/ExerciseTypes';
import type { ShoulderFlexionAnalysis } from '../../engine/biomechanics/biomechanicsTypes';
import { getDefaultExercise } from '../../engine/exercise/ExerciseRegistry';
import type { PatientRehabilitationState } from '../../engine/state/PatientRehabilitationState';

// ─── Practice state model ───────────────────────────────────────────────────

export type PracticeStatus =
  | 'WAITING'
  | 'NEEDS_CORRECTION'
  | 'APPROACHING_TARGET'
  | 'GOOD'
  | 'HOLD';

function computePracticeStatus(
  liveAngle: number | null,
  targetAngle: number,
  exerciseState: string,
): PracticeStatus {
  if (liveAngle === null || exerciseState === 'WAITING') return 'WAITING';
  const deviation = targetAngle - liveAngle;
  const tolerance = 10; // degrees — matches existing SHOULDER_FLEXION_CONFIG.tolerance
  if (deviation <= 0 || Math.abs(deviation) <= tolerance) return 'HOLD';
  if (deviation <= 20) return 'APPROACHING_TARGET';
  if (deviation <= (targetAngle * 0.4)) return 'NEEDS_CORRECTION'; // < 60% of target
  return 'NEEDS_CORRECTION';
}

function practiceStatusColour(status: PracticeStatus): string {
  switch (status) {
    case 'HOLD':         return 'var(--color-good)';
    case 'GOOD':         return 'var(--color-good)';
    case 'APPROACHING_TARGET': return 'var(--accent-cyan)';
    case 'NEEDS_CORRECTION':   return 'var(--color-warn)';
    case 'WAITING':
    default:             return 'var(--text-muted)';
  }
}

// ─── Component ──────────────────────────────────────────────────────────────

export type ReferenceViewMode = 'TUTORIAL' | 'PRACTICE' | 'LIVE' | 'DEMO';

interface ReferenceSkeletonCanvasProps {
  mode?: 'TUTORIAL' | 'PRACTICE' | 'LIVE' | 'DEMO';
  onStartPractice?: () => void;
  onBackToTutorial?: () => void;
  onExitDemoMode?: () => void;
  exercise?: ExerciseDefinition;
  onAngleUpdate?: (angleDeg: number) => void;
  onDemoFrame?: (angleDeg: number, phaseConfig: PhaseConfig, elapsedMs: number) => void;
  liveAngle?: number | null;
  lastLimitationPeak?: number | null;
  latestRep?: RepResult | null;
  /** Full live analysis snapshot from usePoseTracking — used for practice state */
  liveAnalysis?: ShoulderFlexionAnalysis | null;
  /** Authoritative multimodal patient state (Patch 9) */
  patientState?: PatientRehabilitationState | null;
}

function computePracticeFeedback(
  status: PracticeStatus,
  liveAngle: number | null,
  targetAngle: number,
  highlightJoint: string,
): string {
  const jointAction =
    highlightJoint === 'shoulder'
      ? 'shoulder elevation'
      : highlightJoint === 'knee'
      ? 'knee extension'
      : 'leg elevation';

  switch (status) {
    case 'WAITING':
      return 'Move into view so the required landmarks are visible.';
    case 'HOLD':
      return `Nice, hold this position.`;
    case 'APPROACHING_TARGET':
      return `Approaching the reference range. You're at ${liveAngle}° — keep going toward ${targetAngle}°.`;
    case 'NEEDS_CORRECTION':
      return `Increase ${jointAction} toward the reference range (${targetAngle}°). You're currently at ${liveAngle ?? '—'}°.`;
    case 'GOOD':
      return `Nice, hold this position.`;
    default:
      return 'Begin the movement when ready.';
  }
}

export const ReferenceSkeletonCanvas: React.FC<ReferenceSkeletonCanvasProps> = ({
  mode = 'TUTORIAL',
  onStartPractice,
  onBackToTutorial,
  onExitDemoMode,
  exercise = getDefaultExercise(),
  onAngleUpdate,
  onDemoFrame,
  liveAngle,
  lastLimitationPeak,
  latestRep,
  liveAnalysis,
  patientState,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const controllerRef = useRef<AnimationController | null>(null);
  const rendererRef = useRef<SkeletonRenderer>(new SkeletonRenderer());
  const lastUiUpdateRef = useRef(0);
  const isScrubbingRef = useRef(false);

  // ── Tutorial animation state (throttled) ───────────────────────────────────
  const [playbackState, setPlaybackState] = useState<PlaybackState>('playing');
  const [currentMs, setCurrentMs] = useState(0);
  const [currentPhaseConfig, setCurrentPhaseConfig] = useState<PhaseConfig>(
    exercise.demoPhases[0],
  );
  const [displayAngle, setDisplayAngle] = useState(exercise.startAngle);
  const [isPersonalizedActive, setIsPersonalizedActive] = useState(false);

  const syncSize = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    rendererRef.current.syncCanvas(canvas);
  }, []);

  // ── Build tutorial animation controller ────────────────────────────────────
  const initController = useCallback(
    (timeline: AnimationTimeline = exercise.timeline, isCustom = false) => {
      if (controllerRef.current) {
        controllerRef.current.dispose();
      }

      const onFrame = (pose: ReferencePose, elapsedMs: number) => {
        const currentCanvas = canvasRef.current;
        if (!currentCanvas) return;

        let phaseConfig: PhaseConfig;
        if (isCustom) {
          phaseConfig = {
            phase: 'CORRECTION',
            name: 'Personalized Correction',
            shortLabel: 'Correction',
            caption: `Guided correction from your measured peak of ${Math.round(
              lastLimitationPeak ?? exercise.limitedAngle,
            )}° toward ${exercise.targetAngle}°`,
            statusText: 'Personalized Guidance',
            statusType: 'guidance',
            startMs: 0,
            endMs: timeline.durationMs,
            targetAngle: exercise.targetAngle,
            expectedAngle: exercise.targetAngle,
          };
        } else {
          phaseConfig = getPhaseAtTime(elapsedMs, exercise.demoPhases);
        }

        const angleValue =
          pose.activeAngleDeg ??
          (exercise.highlightJoint === 'shoulder'
            ? pose.rightShoulderFlexion
            : exercise.highlightJoint === 'knee'
            ? 180 - pose.rightKneeFlexion
            : pose.rightHipFlexion);

        rendererRef.current.syncCanvas(currentCanvas);
        rendererRef.current.render(currentCanvas, pose, {
          phase: phaseConfig.phase,
          currentAngle: angleValue,
          targetAngle: exercise.targetAngle,
          highlightJoint: exercise.highlightJoint,
          metricName: exercise.metricName,
          postureMode: exercise.postureMode,
          elapsedMs,
          side: exercise.side,
        });

        const now = performance.now();
        if (!isScrubbingRef.current && now - lastUiUpdateRef.current >= 150) {
          lastUiUpdateRef.current = now;
          setCurrentMs(elapsedMs);
          setCurrentPhaseConfig(phaseConfig);
          setDisplayAngle(Math.round(angleValue));
          if (onAngleUpdate) onAngleUpdate(angleValue);
          if (onDemoFrame) onDemoFrame(angleValue, phaseConfig, elapsedMs);
        }
      };

      const ctrl = new AnimationController(timeline, onFrame);
      controllerRef.current = ctrl;
      ctrl.reset();
      ctrl.play();
      setPlaybackState('playing');
    },
    [exercise, lastLimitationPeak, onAngleUpdate, onDemoFrame],
  );

  // ── Re-init when exercise changes: always return to TUTORIAL ──────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    setIsPersonalizedActive(false);
    syncSize();
    initController(exercise.timeline, false);
    setCurrentPhaseConfig(exercise.demoPhases[0]);

    const ro = new ResizeObserver(() => {
      syncSize();
      const c = canvasRef.current;
      if (c && controllerRef.current && mode === 'TUTORIAL') {
        const p = controllerRef.current.getCurrentPose();
        const pCfg = currentPhaseConfig;
        const angleValue = p.activeAngleDeg ?? p.rightShoulderFlexion;
        rendererRef.current.render(c, p, {
          phase: pCfg.phase,
          currentAngle: angleValue,
          targetAngle: exercise.targetAngle,
          highlightJoint: exercise.highlightJoint,
          metricName: exercise.metricName,
          postureMode: exercise.postureMode,
          side: exercise.side,
        });
      }
    });
    ro.observe(canvas.parentElement ?? canvas);

    return () => {
      ro.disconnect();
      if (controllerRef.current) controllerRef.current.dispose();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [exercise, initController, syncSize]);

  // ── Mode change effect: pause on PRACTICE, restart on TUTORIAL ────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (mode === 'PRACTICE') {
      if (controllerRef.current) {
        controllerRef.current.pause();
      }
      setPlaybackState('paused');
      setIsPersonalizedActive(false);

      if (canvas) {
        syncSize();
        // Render target pose on canvas for reference
        const targetPose =
          exercise.timeline.keyframes.find(
            (k) =>
              (k.pose.activeAngleDeg ?? k.pose.rightShoulderFlexion) >=
              exercise.targetAngle - 5,
          )?.pose ??
          exercise.timeline.keyframes[1]?.pose ??
          exercise.timeline.keyframes[0].pose;

        rendererRef.current.render(canvas, targetPose, {
          phase: 'REFERENCE',
          currentAngle: exercise.targetAngle,
          targetAngle: exercise.targetAngle,
          highlightJoint: exercise.highlightJoint,
          metricName: exercise.metricName,
          postureMode: exercise.postureMode,
          side: exercise.side,
        });
      }
    } else {
      // Returned to TUTORIAL mode: reset and play animation from start
      setIsPersonalizedActive(false);
      if (controllerRef.current) {
        controllerRef.current.reset();
        controllerRef.current.play();
        setPlaybackState('playing');
        setCurrentMs(0);
        setCurrentPhaseConfig(exercise.demoPhases[0]);
        setDisplayAngle(exercise.startAngle);
      }
    }
  }, [mode, exercise, syncSize]);

  // ── Mode switching handlers ────────────────────────────────────────────────
  const handleStartPractice = useCallback(() => {
    if (controllerRef.current) {
      controllerRef.current.pause();
    }
    setPlaybackState('paused');
    setIsPersonalizedActive(false);
    if (onStartPractice) onStartPractice();
  }, [onStartPractice]);

  const handleBackToTutorial = useCallback(() => {
    setIsPersonalizedActive(false);
    if (controllerRef.current) {
      controllerRef.current.reset();
      controllerRef.current.play();
      setPlaybackState('playing');
      setCurrentMs(0);
      setCurrentPhaseConfig(exercise.demoPhases[0]);
      setDisplayAngle(exercise.startAngle);
    }
    if (onBackToTutorial) onBackToTutorial();
  }, [exercise, onBackToTutorial]);

  // ── Personalized correction (TUTORIAL mode only) ───────────────────────────
  const handleStartPersonalizedCorrection = () => {
    const patientPeak =
      lastLimitationPeak ?? latestRep?.peakAngle ?? exercise.limitedAngle;
    const personalizedTimeline = exercise.createPersonalizedTimeline(patientPeak);
    setIsPersonalizedActive(true);
    initController(personalizedTimeline, true);
  };

  const handleResetToStandard = () => {
    setIsPersonalizedActive(false);
    initController(exercise.timeline, false);
  };

  // ── Tutorial playback controls ─────────────────────────────────────────────
  const handlePlay = useCallback(() => {
    if (!controllerRef.current) return;
    controllerRef.current.play();
    setPlaybackState('playing');
  }, []);

  const handlePause = useCallback(() => {
    if (!controllerRef.current) return;
    controllerRef.current.pause();
    setPlaybackState('paused');
  }, []);

  const handleRestart = useCallback(() => {
    if (!controllerRef.current) return;
    controllerRef.current.reset();
    controllerRef.current.play();
    setPlaybackState('playing');
    setCurrentMs(0);
  }, []);

  const togglePlayPause = useCallback(() => {
    if (playbackState === 'playing') handlePause();
    else handlePlay();
  }, [playbackState, handlePlay, handlePause]);

  const handleResetDemo = useCallback(() => {
    setIsPersonalizedActive(false);
    if (controllerRef.current) {
      controllerRef.current.reset();
      controllerRef.current.play();
    }
    setPlaybackState('playing');
    setCurrentMs(0);
    setCurrentPhaseConfig(exercise.demoPhases[0]);
    setDisplayAngle(exercise.startAngle);
  }, [exercise]);

  const handleSeekPhase = useCallback(
    (phase: ExercisePhase) => {
      const targetConfig = exercise.demoPhases.find((p) => p.phase === phase);
      if (!targetConfig || !controllerRef.current) return;
      controllerRef.current.seek(targetConfig.startMs);
      setCurrentMs(targetConfig.startMs);
      setCurrentPhaseConfig(targetConfig);
      const p = controllerRef.current.getCurrentPose();
      setDisplayAngle(Math.round(p.activeAngleDeg ?? p.rightShoulderFlexion));
    },
    [exercise.demoPhases],
  );

  const handleScrubberChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const ms = Number(e.target.value);
      setCurrentMs(ms);
      if (controllerRef.current) {
        controllerRef.current.seek(ms);
        if (!isPersonalizedActive) {
          setCurrentPhaseConfig(getPhaseAtTime(ms, exercise.demoPhases));
        }
        const p = controllerRef.current.getCurrentPose();
        setDisplayAngle(Math.round(p.activeAngleDeg ?? p.rightShoulderFlexion));
      }
    },
    [exercise.demoPhases, isPersonalizedActive],
  );

  const handleScrubberMouseDown = useCallback(() => { isScrubbingRef.current = true; }, []);
  const handleScrubberMouseUp   = useCallback(() => { isScrubbingRef.current = false; }, []);

  // ── Derived values ─────────────────────────────────────────────────────────
  const totalDuration = isPersonalizedActive ? 7500 : exercise.timeline.durationMs;
  const progressPercent = (currentMs / totalDuration) * 100;
  const currentSeconds = (currentMs / 1000).toFixed(1);

  // Practice-mode derived values (read from liveAnalysis / liveAngle props or patientState)
  const practiceAngle = liveAngle ?? patientState?.currentROM.value ?? null;
  const practiceExerciseState = liveAnalysis?.state ?? 'WAITING';
  const practiceStatus = computePracticeStatus(
    practiceAngle,
    exercise.targetAngle,
    practiceExerciseState,
  );
  const practiceFeedback = computePracticeFeedback(
    practiceStatus,
    practiceAngle,
    exercise.targetAngle,
    exercise.highlightJoint,
  );
  const practiceDeviation =
    practiceAngle !== null ? Math.max(0, exercise.targetAngle - practiceAngle) : null;
  const practiceRomPct =
    practiceAngle !== null
      ? Math.min(100, Math.round((practiceAngle / exercise.targetAngle) * 100))
      : null;

  const renderStatusIcon = () => {
    switch (currentPhaseConfig.statusType) {
      case 'amber':    return <AlertCircle size={12} className="status-icon--warning" />;
      case 'guidance': return <Navigation size={12} style={{ color: 'var(--accent-cyan)' }} />;
      case 'success':  return <CheckCircle size={12} className="status-icon--good" />;
      default:         return <Info size={12} style={{ color: 'var(--accent-blue)' }} />;
    }
  };

  // ═════════════════════════════════════════════════════════════════════════
  // RENDER — PRACTICE MODE
  // ═════════════════════════════════════════════════════════════════════════
  if (mode === 'PRACTICE') {
    const statusColor = practiceStatusColour(practiceStatus);
    const hasData = practiceAngle !== null;

    return (
      <div className="ref-skel">
        {/* ── Practice header bar ─────────────────────────────────────────── */}
        <div className="ref-skel__practice-header">
          <button
            type="button"
            className="ref-skel__back-btn"
            onClick={handleBackToTutorial}
            aria-label="Back to Tutorial"
          >
            <ArrowLeft size={13} />
            <span>Back to Tutorial</span>
          </button>
          <div className="ref-skel__practice-badge">
            <Dumbbell size={12} />
            <span>LIVE PRACTICE</span>
          </div>
        </div>

        {/* ── Live comparison panel ───────────────────────────────────────── */}
        <div className="ref-skel__practice-panel">
          {/* Actual metric */}
          <div className="ref-skel__practice-metric ref-skel__practice-metric--actual">
            <span className="ref-skel__practice-metric-label">ACTUAL</span>
            <span
              className="ref-skel__practice-metric-value"
              style={{ color: hasData ? statusColor : 'var(--text-muted)' }}
            >
              {hasData ? `${Math.round(practiceAngle!)}°` : '—'}
            </span>
            <span className="ref-skel__practice-metric-unit">
              {exercise.metricName}
            </span>
          </div>

          {/* ROM progress arc */}
          <div className="ref-skel__practice-progress">
            <svg viewBox="0 0 80 80" width="80" height="80" aria-hidden="true">
              <circle
                cx="40" cy="40" r="30"
                fill="none"
                stroke="var(--bg-overlay)"
                strokeWidth="6"
              />
              <circle
                cx="40" cy="40" r="30"
                fill="none"
                stroke={hasData ? statusColor : 'var(--bg-overlay)'}
                strokeWidth="6"
                strokeLinecap="round"
                strokeDasharray={`${2 * Math.PI * 30}`}
                strokeDashoffset={
                  hasData
                    ? `${2 * Math.PI * 30 * (1 - (practiceRomPct ?? 0) / 100)}`
                    : `${2 * Math.PI * 30}`
                }
                transform="rotate(-90 40 40)"
                style={{ transition: 'stroke-dashoffset 0.25s ease, stroke 0.25s ease' }}
              />
            </svg>
            <div className="ref-skel__practice-progress-label">
              <span style={{ color: hasData ? statusColor : 'var(--text-muted)', fontWeight: 700, fontSize: '0.8rem' }}>
                {practiceRomPct !== null ? `${practiceRomPct}%` : '—'}
              </span>
              <span style={{ fontSize: '0.6rem', color: 'var(--text-muted)' }}>ROM</span>
            </div>
          </div>

          {/* Target metric */}
          <div className="ref-skel__practice-metric ref-skel__practice-metric--target">
            <span className="ref-skel__practice-metric-label">TARGET</span>
            <span
              className="ref-skel__practice-metric-value"
              style={{ color: 'var(--text-muted)' }}
            >
              {exercise.targetAngle}°
            </span>
            <span className="ref-skel__practice-metric-unit">reference</span>
          </div>
        </div>

        {/* ── Deviation row ────────────────────────────────────────────────── */}
        <div className="ref-skel__practice-deviation">
          <span className="ref-skel__practice-dev-label">Deviation:</span>
          <span
            className="ref-skel__practice-dev-val"
            style={{ color: practiceDeviation !== null ? statusColor : 'var(--text-muted)' }}
          >
            {practiceDeviation !== null ? `${practiceDeviation}° remaining` : '—'}
          </span>
        </div>

        {/* ── Advisory feedback ────────────────────────────────────────────── */}
        <div
          className="ref-skel__caption-card"
          style={{ borderLeftColor: statusColor }}
        >
          <div className="ref-skel__caption-header">
            <div className="ref-skel__caption-status">
              {practiceStatus === 'HOLD' || practiceStatus === 'GOOD'
                ? <CheckCircle size={12} className="status-icon--good" />
                : practiceStatus === 'APPROACHING_TARGET'
                ? <Navigation size={12} style={{ color: 'var(--accent-cyan)' }} />
                : practiceStatus === 'NEEDS_CORRECTION'
                ? <AlertCircle size={12} className="status-icon--warning" />
                : <Info size={12} style={{ color: 'var(--text-muted)' }} />}
              <span style={{ color: statusColor, fontWeight: 600, fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                {practiceStatus.replace('_', ' ')}
              </span>
            </div>
          </div>
          <p className="ref-skel__caption-text" role="status" aria-live="polite">
            {practiceFeedback}
          </p>
        </div>

        {/* ── Canvas (frozen on last tutorial frame) ──────────────────────── */}
        <div className="ref-skel__canvas-wrap" style={{ opacity: 0.35, pointerEvents: 'none' }}>
          <canvas
            ref={canvasRef}
            className="ref-skel__canvas"
            aria-label={`${exercise.name} Reference (paused)`}
            role="img"
          />
        </div>

        {/* ── Back to tutorial link ────────────────────────────────────────── */}
        <div style={{ textAlign: 'center', marginTop: '0.4rem' }}>
          <button
            type="button"
            className="ref-skel__mode-btn"
            onClick={handleBackToTutorial}
          >
            <RotateCcw size={11} /> Watch Tutorial Again
          </button>
        </div>
      </div>
    );
  }

  // ═════════════════════════════════════════════════════════════════════════
  // RENDER — TUTORIAL MODE (original layout, preserved exactly)
  // ═════════════════════════════════════════════════════════════════════════
  return (
    <div className="ref-skel">
      {/* ── Tutorial / Practice mode-switch header ───────────────────────── */}
      <div className="ref-skel__mode-switch">
        <button
          type="button"
          className="ref-skel__mode-btn ref-skel__mode-btn--active"
          disabled
        >
          TUTORIAL
        </button>
        <button
          type="button"
          className="ref-skel__mode-btn ref-skel__mode-btn--action"
          onClick={handleStartPractice}
          id="ref-skel-start-practice"
          title="Enter Practice Mode — uses your live webcam movement"
        >
          <Dumbbell size={12} />
          <span>Start Practice</span>
        </button>
      </div>

      {/* ── Phase segmented step selector ───────────────────────────────── */}
      <div className="ref-skel__phase-nav" role="tablist" aria-label="Demonstration phase selector">
        {exercise.demoPhases.map((p) => {
          const isActive = currentPhaseConfig.phase === p.phase;
          return (
            <button
              key={p.phase}
              type="button"
              role="tab"
              aria-selected={isActive}
              className={`ref-skel__phase-tab ref-skel__phase-tab--${p.statusType} ${
                isActive ? 'ref-skel__phase-tab--active' : ''
              }`}
              onClick={() => handleSeekPhase(p.phase)}
            >
              {p.shortLabel}
            </button>
          );
        })}
      </div>

      {/* ── Personalized correction banner ──────────────────────────────── */}
      <div className="ref-skel__live-banner">
        <div className="ref-skel__live-banner-left">
          <span className="ref-skel__live-label">Patient Peak:</span>
          <span className="ref-skel__live-val">
            {typeof lastLimitationPeak === 'number' && lastLimitationPeak > 0
              ? `${lastLimitationPeak}°`
              : '—'}
          </span>
          <span className="ref-skel__live-ref">/ {exercise.targetAngle}° Ref</span>
        </div>

        {!isPersonalizedActive ? (
          <button
            type="button"
            className="ref-skel__action-btn"
            onClick={handleStartPersonalizedCorrection}
            disabled={!lastLimitationPeak || lastLimitationPeak <= 0}
            title={
              lastLimitationPeak && lastLimitationPeak > 0
                ? `Animate guided correction from patient's measured peak to ${exercise.targetAngle}°`
                : 'Complete a live practice repetition first to see personalized guided correction.'
            }
          >
            <Wand2 size={12} />
            <span>Show Guided Correction</span>
          </button>
        ) : (
          <button
            type="button"
            className="ref-skel__action-btn ref-skel__action-btn--secondary"
            onClick={handleResetToStandard}
          >
            <RefreshCw size={12} />
            <span>Standard Demo</span>
          </button>
        )}
      </div>

      {/* ── Canvas viewport ─────────────────────────────────────────────── */}
      <div className="ref-skel__canvas-wrap">
        <canvas
          ref={canvasRef}
          className="ref-skel__canvas"
          aria-label={`${exercise.name} Demonstration`}
          role="img"
        />
        <div
          className={`ref-skel__angle-badge ref-skel__angle-badge--${currentPhaseConfig.statusType}`}
          aria-live="polite"
        >
          <span className="ref-skel__angle-value">{displayAngle}°</span>
          <span className="ref-skel__angle-label">Target {exercise.targetAngle}°</span>
        </div>
        <div className={`ref-skel__state-badge ref-skel__state-badge--${currentPhaseConfig.statusType}`}>
          {currentPhaseConfig.name}
        </div>
      </div>

      {/* ── Timeline scrubber ────────────────────────────────────────────── */}
      <div className="ref-skel__timeline-container">
        <div className="ref-skel__timeline-track">
          {!isPersonalizedActive && (
            <>
              <div className="ref-skel__segment-marker" style={{ left: '0%', width: '25%' }} title="Reference (0-4s)" />
              <div className="ref-skel__segment-marker ref-skel__segment-marker--amber" style={{ left: '25%', width: '25%' }} title="Limitation (4-8s)" />
              <div className="ref-skel__segment-marker ref-skel__segment-marker--guidance" style={{ left: '50%', width: '31.25%' }} title="Correction (8-13s)" />
              <div className="ref-skel__segment-marker ref-skel__segment-marker--success" style={{ left: '81.25%', width: '18.75%' }} title="Improved (13-16s)" />
            </>
          )}
          <div
            className={`ref-skel__timeline-fill ref-skel__timeline-fill--${currentPhaseConfig.statusType}`}
            style={{ width: `${progressPercent}%` }}
          />
          <input
            type="range"
            min={0}
            max={totalDuration}
            step={50}
            value={currentMs}
            onChange={handleScrubberChange}
            onMouseDown={handleScrubberMouseDown}
            onMouseUp={handleScrubberMouseUp}
            onTouchStart={handleScrubberMouseDown}
            onTouchEnd={handleScrubberMouseUp}
            className="ref-skel__scrubber"
            aria-label="Demonstration timeline scrubber"
          />
        </div>
        <div className="ref-skel__timeline-labels">
          <span>0s</span>
          {!isPersonalizedActive ? (
            <>
              <span>4s (Limitation)</span>
              <span>8s (Correction)</span>
              <span>13s</span>
              <span>16s</span>
            </>
          ) : (
            <>
              <span>2.0s (Your Peak)</span>
              <span>5.0s (Elevating)</span>
              <span>7.5s (Target {exercise.targetAngle}°)</span>
            </>
          )}
        </div>
      </div>

      {/* ── Playback controls ────────────────────────────────────────────── */}
      <div className="ref-skel__controls" role="toolbar" aria-label="Playback controls">
        <button
          id="ref-skel-play-pause"
          type="button"
          className="ref-skel__btn ref-skel__btn--primary"
          onClick={togglePlayPause}
          aria-label={playbackState === 'playing' ? 'Pause animation' : 'Play animation'}
        >
          {playbackState === 'playing' ? <Pause size={13} /> : <Play size={13} />}
          <span>{playbackState === 'playing' ? 'Pause' : 'Play'}</span>
        </button>
        <button
          id="ref-skel-restart"
          type="button"
          className="ref-skel__btn"
          onClick={handleRestart}
          aria-label="Restart demonstration"
        >
          <RotateCcw size={13} />
          <span>Restart</span>
        </button>
        <button
          id="ref-skel-reset-demo"
          type="button"
          className="ref-skel__btn ref-skel__btn--reset"
          onClick={handleResetDemo}
          title="Reset demonstration to initial reference keyframe"
          aria-label="Reset demonstration"
        >
          <RefreshCw size={12} />
          <span>Reset Demo</span>
        </button>

        {mode === 'DEMO' && onExitDemoMode && (
          <button
            type="button"
            className="ref-skel__btn"
            onClick={onExitDemoMode}
            style={{ borderColor: 'var(--border-default)', background: 'var(--bg-overlay)' }}
            title="Exit demonstration mode"
          >
            <RotateCcw size={12} />
            <span>Exit Demo Mode</span>
          </button>
        )}

        <div className="ref-skel__time-readout">
          <span className="ref-skel__time-mono">{currentSeconds}s</span>
          <span className="ref-skel__time-total">/ {(totalDuration / 1000).toFixed(1)}s</span>
        </div>
      </div>

      {/* ── Dynamic guidance caption ─────────────────────────────────────── */}
      <div className={`ref-skel__caption-card ref-skel__caption-card--${currentPhaseConfig.statusType}`}>
        <div className="ref-skel__caption-header">
          <div className="ref-skel__caption-status">
            {renderStatusIcon()}
            <span>{currentPhaseConfig.statusText}</span>
          </div>
          <span className="ref-skel__caption-angle">
            {displayAngle}° / {exercise.targetAngle}°
          </span>
        </div>
        <p className="ref-skel__caption-text">{currentPhaseConfig.caption}</p>
      </div>
    </div>
  );
};
