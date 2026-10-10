/**
 * Physiosis3DViewer.tsx
 * Premium 3D Biomechanical Visualization & Real-Time Rehabilitation Guidance Engine.
 *
 * Core Visual Guidance Architecture:
 *   1. Two-Skeleton State (Live Practice/Demo):
 *      - CURRENT: Solid porcelain & cyan patient reconstruction from live landmarks.
 *      - TARGET: Semi-transparent cyan/neutral ghost silhouette representing therapeutic target pose.
 *   2. Active Angular Gap & Movement Direction:
 *      - Authoritative real-time gap (target - current) matching Real-Time Analysis.
 *      - Dynamic directional cue (e.g. ↗ Raise arm forward & upward).
 *   3. Patient-Centered Coaching Panel:
 *      - Actionable, adaptive coaching instructions with quality state indicators.
 *      - Isometric & stretch hold timers (e.g. HOLD: 1.5s / 2.5s).
 *   4. Exercise-Specific Retargeting & Trajectory Guides:
 *      - Differentiated kinematics across all 11 protocols.
 *      - Multiplanar trajectory paths (e.g. Arm Circumduction) & therapy props (Ball Press).
 */

import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import {
  RotateCcw,
  Play,
  Pause,
  Compass,
  Activity,
  Sliders,
  Ghost,
  CheckCircle2,
  AlertTriangle,
  Camera,
  CameraOff,
  Minimize2,
  Maximize2,
  Loader2,
  ChevronRight,
  Sparkles,
  ShieldCheck,
  Zap,
  Clock,
  Square,
  Glasses,
  Eye,
  Globe,
} from 'lucide-react';
import { SkeletonViewerController } from '../../three/skeleton/SkeletonViewerController';
import { mapLandmarksTo3DPose } from '../../three/skeleton/MediaPipeTo3DPose';
import { getTargetPose } from '../../three/skeleton/TargetPoseGenerator';
import { movementComparisonEngine, type MovementComparison } from '../../three/guidance/MovementComparisonEngine';
import type { BodyRegionId } from '../../three/skeleton/SkeletonRig';
import {
  getExerciseMotion,
  type MovementKeyframe,
} from '../../three/exercises/ExerciseMotionRegistry';
import type { CameraPreset } from '../../three/camera';
import type { Landmark, PoseTrackingStats } from '../../types/pose';
import type {
  ShoulderFlexionAnalysis,
  DetectedCompensation,
} from '../../engine/biomechanics/biomechanicsTypes';
import { CorrectiveDemonstrationModal } from '../guidance/CorrectiveDemonstrationModal';

interface Physiosis3DViewerProps {
  exerciseId?: string;
  exerciseName?: string;
  mode?: 'TUTORIAL' | 'PRACTICE' | 'LIVE' | 'DEMO';
  initialSide?: 'left' | 'right' | 'bilateral';
  targetAngle?: number;
  liveLandmarks?: Landmark[] | null;
  isStreaming?: boolean;
  isInitializing?: boolean;
  errorMessage?: string | null;
  liveAngle?: number | null;
  liveAnalysis?: ShoulderFlexionAnalysis | null;
  stats?: PoseTrackingStats;
  isSessionActive?: boolean;
  sessionRemainingSeconds?: number;
  completedReps?: number;
  onStartSession?: () => void;
  onEndSession?: (reason?: 'manual' | 'automatic') => void;
  videoRef?: React.RefObject<HTMLVideoElement>;
  canvasRef?: React.RefObject<HTMLCanvasElement>;
  onToggleCamera?: () => void;
  onSwitchTo2D?: () => void;
  className?: string;
  onAngleChange?: (angle: number) => void;
  showCameraPip?: boolean;
  showControls?: boolean;
  enableBodyMapInteraction?: boolean;
  onSelectBodyRegion?: (region: BodyRegionId) => void;
}

const REGION_INFO: Record<BodyRegionId, { label: string; protocolCount: number }> = {
  shoulders: { label: 'Shoulders & Clavicle', protocolCount: 6 },
  arms: { label: 'Upper Limbs & Elbows', protocolCount: 4 },
  wrists: { label: 'Wrists & Hands', protocolCount: 1 },
  spine: { label: 'Spine & Trunk', protocolCount: 1 },
  head: { label: 'Head & Cervical Column', protocolCount: 1 },
  hips: { label: 'Pelvis & Hips', protocolCount: 2 },
  knees: { label: 'Knees & Patella', protocolCount: 2 },
  ankles: { label: 'Ankles & Feet', protocolCount: 1 },
};

export const Physiosis3DViewer: React.FC<Physiosis3DViewerProps> = ({
  exerciseId = 'shoulder-flexion',
  exerciseName,
  mode = 'TUTORIAL',
  initialSide = 'right',
  targetAngle,
  liveLandmarks,
  isStreaming = false,
  isInitializing = false,
  errorMessage,
  liveAngle,
  liveAnalysis,
  stats,
  isSessionActive = false,
  sessionRemainingSeconds,
  completedReps = 0,
  onStartSession,
  onEndSession,
  videoRef,
  canvasRef,
  onToggleCamera,
  onSwitchTo2D,
  className = '',
  onAngleChange,
  showCameraPip = true,
  showControls = true,
  enableBodyMapInteraction = false,
  onSelectBodyRegion,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const controllerRef = useRef<SkeletonViewerController | null>(null);

  // Load authoritative motion definition & target metrics
  const motion = getExerciseMotion(exerciseId);
  const effectiveTarget = targetAngle ?? motion.targetMetricValue;
  const effectiveName = exerciseName || motion.name;

  // WebGL State
  const [webglError, setWebglError] = useState<string | null>(null);
  const [isReady, setIsReady] = useState<boolean>(false);

  // Interactive UI State
  const [selectedSide, setSelectedSide] = useState<'left' | 'right' | 'bilateral'>(
    motion.laterality === 'bilateral' ? 'bilateral' : initialSide
  );
  const [currentMetricVal, setCurrentMetricVal] = useState<number>(0);
  const [isPlayingDemo, setIsPlayingDemo] = useState<boolean>(!isStreaming && mode !== 'PRACTICE');
  const [isAutoRotating, setIsAutoRotating] = useState<boolean>(false);
  const [activePreset, setActivePreset] = useState<CameraPreset>('reset');
  const [phaseLabel, setPhaseLabel] = useState<string>('Reference Position');
  const [stabilityScore, setStabilityScore] = useState<number | undefined>(undefined);

  // 3D Body Map Raycast Hover State
  const [hoveredRegion, setHoveredRegion] = useState<BodyRegionId | null>(null);
  const [tooltipPos, setTooltipPos] = useState<{ x: number; y: number } | null>(null);

  // Annotation Toggles
  const [showGhost, setShowGhost] = useState<boolean>(true);
  const [showAngles, setShowAngles] = useState<boolean>(true);
  const [showJoints, setShowJoints] = useState<boolean>(true);
  const [showTrajectory, setShowTrajectory] = useState<boolean>(true);

  // Immersive Viewport Mode State: '3d' (Studio), 'ar' (Passthrough), 'vr' (WebXR/Stereo)
  const [viewportMode, setViewportMode] = useState<'3d' | 'ar' | 'vr'>('3d');
  const [activeCompensationModal, setActiveCompensationModal] = useState<DetectedCompensation | null>(null);
  const [vrStatusMsg, setVrStatusMsg] = useState<string | null>(null);
  const arVideoRef = useRef<HTMLVideoElement>(null);

  // Live Camera PiP Monitor State
  const [isPipOpen, setIsPipOpen] = useState<boolean>(true);

  // Animation timeline reference
  const demoKeyframesRef = useRef<MovementKeyframe[]>([]);
  const animFrameIdRef = useRef<number | null>(null);
  const animStartTimeRef = useRef<number | null>(null);
  const prevMetricValRef = useRef<number>(0);
  const prevPhaseLabelRef = useRef<string>('Reference Position');

  // Sync selectedSide with prop or bilateral constraint
  useEffect(() => {
    if (motion.laterality === 'bilateral') {
      setSelectedSide('bilateral');
    } else if (initialSide === 'bilateral') {
      setSelectedSide('right');
    } else {
      setSelectedSide(initialSide);
    }
  }, [initialSide, motion.laterality]);

  // Authoritative Live/Demo/Reference Value Computation (Single Source of Truth)
  const effectiveLiveVal = useMemo(() => {
    if (isStreaming || mode === 'LIVE' || mode === 'PRACTICE') {
      if (liveAngle !== null && liveAngle !== undefined) return Math.round(liveAngle);
      if (liveAnalysis?.angle !== null && liveAnalysis?.angle !== undefined) return Math.round(liveAnalysis.angle);
      return 0;
    }
    if (mode === 'DEMO') {
      return currentMetricVal;
    }
    return 0;
  }, [isStreaming, mode, liveAngle, liveAnalysis?.angle, currentMetricVal]);

  // Real-time Visual Kinematics Comparison Engine (Authoritative Current vs Target)
  const comparison: MovementComparison = useMemo(() => {
    return movementComparisonEngine.compare({
      exerciseId,
      side: selectedSide,
      currentValue: effectiveLiveVal,
      targetValue: effectiveTarget,
      isConfidenceLow: isStreaming && stats ? stats.confidence < 35 : false,
      isStreaming,
      isLimitationDetected: liveAnalysis?.state === 'LOW_RANGE',
      stabilityScore,
      holdDurationMs: 2500,
    });
  }, [exerciseId, selectedSide, effectiveLiveVal, effectiveTarget, isStreaming, stats, liveAnalysis, stabilityScore]);

  // Synchronize AR optical passthrough mode with Three.js Controller
  useEffect(() => {
    if (!controllerRef.current) return;
    controllerRef.current.setARPassthroughMode(viewportMode === 'ar');
  }, [viewportMode]);

  // Synchronize live camera stream to full-bleed AR video background
  useEffect(() => {
    if (viewportMode === 'ar' && arVideoRef.current && videoRef?.current?.srcObject) {
      arVideoRef.current.srcObject = videoRef.current.srcObject;
    }
  }, [viewportMode, videoRef]);

  // Synchronize compensating joints highlight on 3D skeleton
  useEffect(() => {
    if (!controllerRef.current) return;
    const comps = liveAnalysis?.postureResult?.compensatingJoints;
    if (liveAnalysis?.postureResult?.isAbnormalDetected && comps && comps.length > 0) {
      controllerRef.current.setCompensatingJoints(comps as any);
    } else if (showJoints) {
      const activeJoints = motion.activeJoints(selectedSide);
      controllerRef.current.setJointHighlight(activeJoints, 'active');
    }
  }, [liveAnalysis?.postureResult, showJoints, motion, selectedSide]);

  // Handle VR Mode toggle with WebXR detection
  const handleToggleVR = async () => {
    if (viewportMode === 'vr') {
      setViewportMode('3d');
      setVrStatusMsg(null);
      return;
    }

    setViewportMode('vr');
    if (controllerRef.current) {
      const entered = await controllerRef.current.enterWebXRVR();
      if (!entered) {
        setVrStatusMsg('WebXR headset not detected · Stereoscopic studio view active');
        setTimeout(() => setVrStatusMsg(null), 4500);
      }
    }
  };

  // 1. Initialize Three.js Controller with error boundary
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    try {
      const testCanvas = document.createElement('canvas');
      const gl = testCanvas.getContext('webgl2') || testCanvas.getContext('webgl');
      if (!gl) {
        setWebglError('3D visualization is unavailable on this device (WebGL not supported).');
        return;
      }

      const initialPose = motion.referencePose(selectedSide);
      const controller = new SkeletonViewerController({
        container,
        initialPose,
      });
      controllerRef.current = controller;

      // Set target ghost pose (strictly stable at target orientation)
      if (showGhost) {
        const ghostPose = getTargetPose(exerciseId, selectedSide, effectiveTarget);
        controller.setGhostPose(ghostPose);
      }

      // Highlight active joints
      const activeJoints = motion.activeJoints(selectedSide);
      controller.setJointHighlight(activeJoints, showJoints ? 'active' : 'none');

      // Set trajectory line if applicable
      if (showTrajectory && motion.trajectoryPoints) {
        controller.setTrajectoryPoints(motion.trajectoryPoints(selectedSide));
      } else {
        controller.setTrajectoryPoints(null);
      }

      // Set abstract therapy prop (e.g. therapy ball for Ball Press)
      if (motion.abstractVisualObject === 'therapy_ball') {
        controller.setAbstractVisualObject('therapy_ball', 0);
      } else {
        controller.setAbstractVisualObject('none');
      }

      setIsReady(true);

      const resizeObserver = new ResizeObserver((entries) => {
        for (const entry of entries) {
          const { width, height } = entry.contentRect;
          if (width > 0 && height > 0) {
            controller.resize(width, height);
          }
        }
      });
      resizeObserver.observe(container);

      return () => {
        resizeObserver.disconnect();
        if (animFrameIdRef.current) cancelAnimationFrame(animFrameIdRef.current);
        controller.dispose();
        controllerRef.current = null;
      };
    } catch (err) {
      console.error('[Physiosis3DViewer] WebGL initialization failed:', err);
      setWebglError('3D visualization could not be initialized.');
    }
  }, [exerciseId, selectedSide, effectiveTarget, showGhost, showJoints, showTrajectory, motion]);

  // 2. LIVE MEDIAPIPE RETARGETING STREAM (Continuous 60fps Pipeline)
  useEffect(() => {
    if (!isStreaming || !liveLandmarks || liveLandmarks.length === 0) return;

    setIsPlayingDemo(false);
    if (animFrameIdRef.current) {
      cancelAnimationFrame(animFrameIdRef.current);
      animFrameIdRef.current = null;
    }

    const mappedPose = mapLandmarksTo3DPose(liveLandmarks, undefined, {
      exerciseId,
      side: selectedSide,
      smoothingAlpha: 0.30,
      minVisibility: 0.30,
      mirrored: true,
    });

    if (controllerRef.current) {
      controllerRef.current.setLivePose(mappedPose);

      const displayVal = effectiveLiveVal;
      if (prevMetricValRef.current !== displayVal) {
        prevMetricValRef.current = displayVal;
        setCurrentMetricVal(displayVal);
      }

      if (motion.abstractVisualObject === 'therapy_ball') {
        const progress = Math.min(1, Math.max(0, displayVal / Math.max(1, effectiveTarget)));
        controllerRef.current.setAbstractVisualObject('therapy_ball', progress);
      }

      const activeJoints = motion.activeJoints(selectedSide);
      const isTargetReached = displayVal >= effectiveTarget - 5;
      const isLimitation = liveAnalysis?.state === 'LOW_RANGE';

      if (showJoints) {
        if (isTargetReached) {
          controllerRef.current.setJointHighlight(activeJoints, 'success');
        } else if (isLimitation) {
          controllerRef.current.setJointHighlight(activeJoints, 'limitation');
        } else {
          controllerRef.current.setJointHighlight(activeJoints, 'active');
        }
      } else {
        controllerRef.current.setJointHighlight([], 'none');
      }

      let nextPhase = 'Live Tracking Active';
      if (isTargetReached) {
        nextPhase = `Target Met (${displayVal}${motion.targetMetricLabel.includes('mm') ? 'mm' : '°'})`;
      } else if (isLimitation) {
        nextPhase = `Range Limited (${displayVal}${motion.targetMetricLabel.includes('mm') ? 'mm' : '°'})`;
      } else if (displayVal > 15) {
        nextPhase = `Active Movement (${displayVal}${motion.targetMetricLabel.includes('mm') ? 'mm' : '°'})`;
      }

      if (prevPhaseLabelRef.current !== nextPhase) {
        prevPhaseLabelRef.current = nextPhase;
        setPhaseLabel(nextPhase);
      }

      if (showGhost) {
        const ghostPose = getTargetPose(exerciseId, selectedSide, effectiveTarget);
        controllerRef.current.setGhostPose(ghostPose);
      }
    }
  }, [liveLandmarks, isStreaming, effectiveLiveVal, liveAnalysis, selectedSide, effectiveTarget, showGhost, showJoints, motion, exerciseId]);

  // 3. Simulated Demo Keyframe Loop (ONLY active in explicit DEMO mode)
  useEffect(() => {
    demoKeyframesRef.current = motion.generateSequence(selectedSide);
  }, [exerciseId, selectedSide, motion]);

  const runDemoLoop = useCallback(() => {
    if (mode !== 'DEMO') return;
    const sequence = demoKeyframesRef.current;
    if (!sequence || sequence.length === 0) return;

    const totalDuration = sequence[sequence.length - 1].timeMs;

    const tick = (now: number) => {
      if (mode !== 'DEMO') return;
      if (!animStartTimeRef.current) animStartTimeRef.current = now;
      const elapsed = (now - animStartTimeRef.current) % totalDuration;

      let idx = 0;
      for (let i = 0; i < sequence.length - 1; i++) {
        if (elapsed >= sequence[i].timeMs && elapsed <= sequence[i + 1].timeMs) {
          idx = i;
          break;
        }
      }

      const kfA = sequence[idx];
      const kfB = sequence[idx + 1] || sequence[idx];
      const interval = Math.max(1, kfB.timeMs - kfA.timeMs);
      const alpha = (elapsed - kfA.timeMs) / interval;
      const ease = (1 - Math.cos(alpha * Math.PI)) / 2;

      const interpolatedVal = Math.round(kfA.metricValue + (kfB.metricValue - kfA.metricValue) * ease);
      setCurrentMetricVal(interpolatedVal);
      setPhaseLabel(kfA.phaseLabel);
      setStabilityScore(kfA.stabilityScore);
      if (onAngleChange) onAngleChange(interpolatedVal);

      if (controllerRef.current) {
        const maxVal = Math.max(1, effectiveTarget);
        const progress = Math.min(1, Math.max(0, interpolatedVal / maxVal));
        const pose = motion.getPoseForProgress(progress, selectedSide);
        controllerRef.current.setPose(pose, 0);

        if (motion.abstractVisualObject === 'therapy_ball') {
          controllerRef.current.setAbstractVisualObject('therapy_ball', progress);
        }

        const activeJoints = motion.activeJoints(selectedSide);
        if (showJoints) {
          if (interpolatedVal >= effectiveTarget - 2) {
            controllerRef.current.setJointHighlight(activeJoints, 'success');
          } else {
            controllerRef.current.setJointHighlight(activeJoints, 'active');
          }
        }
      }

      animFrameIdRef.current = requestAnimationFrame(tick);
    };

    animFrameIdRef.current = requestAnimationFrame(tick);
  }, [mode, selectedSide, effectiveTarget, onAngleChange, showJoints, motion]);

  useEffect(() => {
    if (mode === 'DEMO' && !isStreaming) {
      setIsPlayingDemo(true);
      animStartTimeRef.current = performance.now();
      runDemoLoop();
    } else {
      setIsPlayingDemo(false);
      if (animFrameIdRef.current) {
        cancelAnimationFrame(animFrameIdRef.current);
        animFrameIdRef.current = null;
      }
      if (mode === 'TUTORIAL' && controllerRef.current) {
        controllerRef.current.setPose(motion.referencePose(selectedSide), 0);
        setPhaseLabel('Reference Position');
      }
    }
    return () => {
      if (animFrameIdRef.current) cancelAnimationFrame(animFrameIdRef.current);
    };
  }, [mode, isStreaming, runDemoLoop, selectedSide, motion]);

  // 4. Interactive Handlers
  const handleTogglePlay = () => {
    setIsPlayingDemo((prev) => !prev);
  };

  const handleSliderScrub = (val: number) => {
    setIsPlayingDemo(false);
    if (animFrameIdRef.current) {
      cancelAnimationFrame(animFrameIdRef.current);
      animFrameIdRef.current = null;
    }
    setCurrentMetricVal(val);
    setPhaseLabel(`Scrub: ${val}${motion.targetMetricLabel.includes('mm') ? 'mm' : '°'}`);
    if (onAngleChange) onAngleChange(val);

    if (controllerRef.current) {
      const maxVal = Math.max(1, effectiveTarget);
      const progress = Math.min(1, Math.max(0, val / maxVal));
      const pose = motion.getPoseForProgress(progress, selectedSide);
      controllerRef.current.setPose(pose, 80);

      if (motion.abstractVisualObject === 'therapy_ball') {
        controllerRef.current.setAbstractVisualObject('therapy_ball', progress);
      }
    }
  };

  const handlePreset = (preset: CameraPreset) => {
    setActivePreset(preset);
    if (controllerRef.current) {
      controllerRef.current.setCameraPreset(preset, 700);
    }
  };

  const handleToggleAutoRotate = () => {
    if (controllerRef.current) {
      const state = controllerRef.current.toggleAutoRotate();
      setIsAutoRotating(state);
    }
  };

  const handleToggleGhost = () => {
    setShowGhost((prev) => {
      const next = !prev;
      if (controllerRef.current) {
        if (next) {
          const ghostPose = getTargetPose(exerciseId, selectedSide, effectiveTarget);
          controllerRef.current.setGhostPose(ghostPose);
        } else {
          controllerRef.current.setGhostPose(null);
        }
      }
      return next;
    });
  };

  const handleToggleJoints = () => {
    setShowJoints((prev) => !prev);
  };

  const handleToggleAngles = () => {
    setShowAngles((prev) => !prev);
  };

  const handleToggleTrajectory = () => {
    setShowTrajectory((prev) => {
      const next = !prev;
      if (controllerRef.current) {
        if (next && motion.trajectoryPoints) {
          controllerRef.current.setTrajectoryPoints(motion.trajectoryPoints(selectedSide));
        } else {
          controllerRef.current.setTrajectoryPoints(null);
        }
      }
      return next;
    });
  };

  const handleSideSwitch = (side: 'left' | 'right' | 'bilateral') => {
    setSelectedSide(side);
  };

  const handleCanvasMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!enableBodyMapInteraction || !controllerRef.current) return;
    const region = controllerRef.current.getBodyRegionAtScreenCoords(e.clientX, e.clientY);
    setHoveredRegion(region);
    controllerRef.current.setHoveredBodyRegion(region);

    if (region) {
      const rect = containerRef.current?.getBoundingClientRect();
      if (rect) {
        setTooltipPos({ x: e.clientX - rect.left, y: e.clientY - rect.top });
      }
    } else {
      setTooltipPos(null);
    }
  };

  const handleCanvasMouseLeave = () => {
    if (!enableBodyMapInteraction || !controllerRef.current) return;
    setHoveredRegion(null);
    setTooltipPos(null);
    controllerRef.current.setHoveredBodyRegion(null);
  };

  const handleCanvasClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!enableBodyMapInteraction || !controllerRef.current) return;
    const region = controllerRef.current.getBodyRegionAtScreenCoords(e.clientX, e.clientY);
    if (region && onSelectBodyRegion) {
      onSelectBodyRegion(region);
    }
  };

  const modeBadgeText = isStreaming
    ? '3D LIVE RECONSTRUCTION'
    : mode === 'PRACTICE'
    ? '3D LIVE PRACTICE'
    : mode === 'DEMO'
    ? '3D DEMONSTRATION'
    : '3D REFERENCE TUTORIAL';

  const modalityBadge =
    motion.analysisType === 'isometric_hold'
      ? 'ISOMETRIC HOLD'
      : motion.analysisType === 'stretch_hold'
      ? 'STRETCH HOLD'
      : motion.analysisType === 'range_of_motion'
      ? 'RANGE OF MOTION'
      : 'REPETITIONS';

  if (webglError) {
    return (
      <div className="physiosis-3d-viewer-container physiosis-3d-viewer-container--error">
        <div className="viewer-3d__error-box">
          <AlertTriangle size={32} className="text-warn" />
          <h3>3D Visualization Unavailable</h3>
          <p>{webglError}</p>
          {onSwitchTo2D && (
            <button type="button" className="btn btn--primary" onClick={onSwitchTo2D}>
              Switch to 2D Canvas View
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className={`physiosis-3d-viewer-container ${className}`} role="region" aria-label="3D Biomechanics Viewer">
      {/* ── Top Floating Overlay HUD ────────────────────────────────────── */}
      <div className="viewer-3d__hud-top">
        <div className="viewer-3d__badge-group">
          <span
            className={`viewer-3d__pill viewer-3d__pill--mode ${
              isStreaming
                ? 'viewer-3d__pill--live'
                : mode === 'DEMO'
                ? 'viewer-3d__pill--demo'
                : 'viewer-3d__pill--reference'
            }`}
          >
            <span className="viewer-3d__dot" />
            <span>{modeBadgeText}</span>
          </span>

          <span className="viewer-3d__pill viewer-3d__pill--exercise">
            {effectiveName} · {selectedSide === 'bilateral' ? 'BILATERAL' : selectedSide.toUpperCase()}
          </span>

          <span className="viewer-3d__pill viewer-3d__pill--phase">
            <span className="text-cyan font-bold mr-1">[{modalityBadge}]</span>
            {phaseLabel}
          </span>

          {/* Session Countdown Timer Pill */}
          {isSessionActive && sessionRemainingSeconds !== undefined && (
            <span
              className={`viewer-3d__pill viewer-3d__pill--timer ${
                sessionRemainingSeconds <= 10
                  ? 'viewer-3d__pill--timer-crit'
                  : sessionRemainingSeconds <= 30
                  ? 'viewer-3d__pill--timer-warn'
                  : 'viewer-3d__pill--timer-active'
              }`}
              style={{
                background:
                  sessionRemainingSeconds <= 10
                    ? 'rgba(255, 82, 82, 0.25)'
                    : sessionRemainingSeconds <= 30
                    ? 'rgba(255, 167, 38, 0.25)'
                    : 'rgba(0, 229, 255, 0.18)',
                color:
                  sessionRemainingSeconds <= 10
                    ? '#FF5252'
                    : sessionRemainingSeconds <= 30
                    ? '#FFA726'
                    : '#00E5FF',
                borderColor:
                  sessionRemainingSeconds <= 10
                    ? 'rgba(255, 82, 82, 0.4)'
                    : sessionRemainingSeconds <= 30
                    ? 'rgba(255, 167, 38, 0.4)'
                    : 'rgba(0, 229, 255, 0.35)',
                fontWeight: 700,
                fontFamily: 'var(--font-mono)',
              }}
            >
              <Clock size={11} />
              <span>
                {Math.floor(sessionRemainingSeconds / 60)
                  .toString()
                  .padStart(2, '0')}
                :
                {(sessionRemainingSeconds % 60)
                  .toString()
                  .padStart(2, '0')}
              </span>
            </span>
          )}

          {/* Quick Start Session Button when Camera is on but session is standby */}
          {!isSessionActive && isStreaming && onStartSession && (
            <button
              type="button"
              className="btn btn--primary btn--sm viewer-3d__hud-btn"
              onClick={onStartSession}
              style={{ padding: '3px 10px', fontSize: 11, fontWeight: 600, height: 26 }}
              title="Start 3-minute guided rehabilitation session"
            >
              <Play size={11} fill="currentColor" />
              <span>Start Session (3 min)</span>
            </button>
          )}

          {/* Quick End Session Button during active session */}
          {isSessionActive && onEndSession && (
            <button
              type="button"
              className="btn btn--secondary btn--sm viewer-3d__hud-btn"
              onClick={() => onEndSession('manual')}
              style={{ padding: '3px 10px', fontSize: 11, fontWeight: 600, height: 26, color: '#FF5252', borderColor: 'rgba(255, 82, 82, 0.4)' }}
              title="End session and generate final patient report"
            >
              <Square size={10} fill="currentColor" />
              <span>End Session</span>
            </button>
          )}

          {/* Immersive Viewport Mode Switcher: 3D Studio, AR Passthrough, VR Studio */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              background: 'rgba(0, 0, 0, 0.45)',
              border: '1px solid rgba(0, 229, 255, 0.25)',
              borderRadius: '6px',
              padding: '2px',
              gap: '2px',
            }}
            role="group"
            aria-label="Rehabilitation Viewport Mode"
          >
            <button
              type="button"
              className={`viewer-3d__preset-btn ${viewportMode === '3d' ? 'viewer-3d__preset-btn--active' : ''}`}
              onClick={() => setViewportMode('3d')}
              style={{ height: '24px', padding: '0 8px', fontSize: '10.5px' }}
              title="3D Biomechanical Studio View"
            >
              <Globe size={11} />
              <span>3D Studio</span>
            </button>

            <button
              type="button"
              className={`viewer-3d__preset-btn ${viewportMode === 'ar' ? 'viewer-3d__preset-btn--active' : ''}`}
              onClick={() => setViewportMode('ar')}
              style={{ height: '24px', padding: '0 8px', fontSize: '10.5px' }}
              title="Augmented Reality (AR) Optical Passthrough Overlay"
            >
              <Eye size={11} />
              <span>AR Mode</span>
            </button>

            <button
              type="button"
              className={`viewer-3d__preset-btn ${viewportMode === 'vr' ? 'viewer-3d__preset-btn--active' : ''}`}
              onClick={handleToggleVR}
              style={{ height: '24px', padding: '0 8px', fontSize: '10.5px' }}
              title="Virtual Reality (VR) Immersive Studio / WebXR"
            >
              <Glasses size={11} />
              <span>VR Mode</span>
            </button>
          </div>

          {vrStatusMsg && (
            <span
              style={{
                fontSize: '10.5px',
                color: 'var(--accent-cyan)',
                background: 'rgba(0, 229, 255, 0.12)',
                border: '1px solid rgba(0, 229, 255, 0.3)',
                padding: '2px 8px',
                borderRadius: '4px',
              }}
            >
              {vrStatusMsg}
            </span>
          )}
        </div>

        {/* View Preset & Camera Controls */}
        <div className="viewer-3d__preset-bar" role="group" aria-label="Camera Presets">
          <button
            type="button"
            className={`viewer-3d__preset-btn ${activePreset === 'front' ? 'viewer-3d__preset-btn--active' : ''}`}
            onClick={() => handlePreset('front')}
            title="Front (Coronal / Frontal View)"
          >
            Front
          </button>
          <button
            type="button"
            className={`viewer-3d__preset-btn ${activePreset === 'side' ? 'viewer-3d__preset-btn--active' : ''}`}
            onClick={() => handlePreset('side')}
            title="Side (Sagittal View)"
          >
            Side
          </button>
          <button
            type="button"
            className={`viewer-3d__preset-btn ${activePreset === 'back' ? 'viewer-3d__preset-btn--active' : ''}`}
            onClick={() => handlePreset('back')}
            title="Back (Posterior View)"
          >
            Back
          </button>
          <button
            type="button"
            className={`viewer-3d__preset-btn ${activePreset === 'reset' ? 'viewer-3d__preset-btn--active' : ''}`}
            onClick={() => handlePreset('reset')}
            title="Reset to 3/4 Inspection Perspective"
          >
            <RotateCcw size={11} />
            <span>Reset</span>
          </button>
          <button
            type="button"
            className={`viewer-3d__preset-btn ${isAutoRotating ? 'viewer-3d__preset-btn--active' : ''}`}
            onClick={handleToggleAutoRotate}
            title="Toggle Continuous Turntable Rotation"
          >
            <Compass size={11} className={isAutoRotating ? 'spin-icon' : ''} />
            <span>Rotate</span>
          </button>
        </div>
      </div>

      {/* ── Active Posture Compensation & Abnormal Movement Alert ──────── */}
      {liveAnalysis?.postureResult?.isAbnormalDetected && liveAnalysis.postureResult.primaryFault && (
        <div
          className="viewer-3d__compensation-banner"
          role="alert"
          style={{
            position: 'absolute',
            top: '52px',
            left: '14px',
            zIndex: 26,
            maxWidth: '320px',
            background: 'rgba(26, 10, 10, 0.94)',
            border: '1px solid rgba(255, 82, 82, 0.55)',
            boxShadow: '0 8px 24px rgba(0, 0, 0, 0.7), 0 0 16px rgba(255, 82, 82, 0.25)',
            backdropFilter: 'blur(12px)',
            borderRadius: 'var(--radius-md)',
            padding: '10px 12px',
            display: 'flex',
            flexDirection: 'column',
            gap: '6px',
            animation: 'fadeIn 0.2s ease-out',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <AlertTriangle size={14} style={{ color: '#FF5252' }} />
              <span style={{ fontSize: '10px', fontWeight: 700, color: '#FF5252', letterSpacing: '0.04em', textTransform: 'uppercase' }}>
                ABNORMAL POSTURE DETECTED
              </span>
            </div>
            <span
              style={{
                fontSize: '9px',
                fontWeight: 700,
                color: '#FF8A80',
                background: 'rgba(255, 82, 82, 0.2)',
                padding: '2px 5px',
                borderRadius: '3px',
                border: '1px solid rgba(255, 82, 82, 0.35)',
              }}
            >
              +{liveAnalysis.postureResult.primaryFault.measuredValue}{liveAnalysis.postureResult.primaryFault.unit}
            </span>
          </div>

          <div style={{ fontSize: '12px', fontWeight: 600, color: '#FFFFFF' }}>
            {liveAnalysis.postureResult.primaryFault.name}
          </div>

          <div style={{ fontSize: '11px', color: 'var(--text-secondary)', lineHeight: 1.35 }}>
            {liveAnalysis.postureResult.primaryFault.clinicalCue}
          </div>

          <button
            type="button"
            className="btn btn--primary btn--sm"
            onClick={() => setActiveCompensationModal(liveAnalysis.postureResult!.primaryFault)}
            style={{
              marginTop: '4px',
              padding: '5px 10px',
              fontSize: '11px',
              fontWeight: 700,
              background: 'linear-gradient(135deg, #FF5252, #D50000)',
              borderColor: '#FF5252',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px',
              color: '#fff',
              cursor: 'pointer',
            }}
          >
            <Zap size={11} fill="currentColor" />
            <span>View Form Fix & Video Drill</span>
          </button>
        </div>
      )}

      {/* ── Active Patient Rehabilitation Guidance & Visual Coach ───────── */}
      {(mode === 'PRACTICE' || mode === 'LIVE' || isStreaming || mode === 'DEMO') && (
        <div className="viewer-3d__coaching-card" role="status" aria-live="polite">
          <div className="viewer-3d__coaching-header">
            <div className="viewer-3d__coaching-title-wrap">
              <Zap size={12} className="text-cyan" />
              <span>REHABILITATION COACH</span>
            </div>
            <span
              className={`viewer-3d__coaching-quality-badge viewer-3d__coaching-quality-badge--${comparison.state.toLowerCase()}`}
            >
              {comparison.qualityBadge}
            </span>
          </div>

          {/* 1. Primary One-Sentence Instruction */}
          <div className="viewer-3d__hero-instruction">{comparison.primaryInstruction}</div>

          {/* 2. Action Description */}
          <div className="viewer-3d__coaching-msg">{comparison.actionInstruction}</div>

          {/* 3. Progress percentage indicator */}
          <div className="viewer-3d__coaching-progress-row">
            <span>Progress:</span>
            <span className="viewer-3d__coaching-progress-pct">
              {comparison.completionPercentage}% of reference range
            </span>
          </div>

          {/* 4. Telemetry Micro-grid */}
          <div className="viewer-3d__coaching-metrics-grid">
            <div className="viewer-3d__coaching-metric-cell">
              <span className="viewer-3d__coaching-metric-label">CURRENT</span>
              <span className="viewer-3d__coaching-metric-val viewer-3d__coaching-metric-val--current">
                {comparison.currentValue}
                {comparison.unit}
              </span>
            </div>
            <div className="viewer-3d__coaching-metric-cell">
              <span className="viewer-3d__coaching-metric-label">TARGET</span>
              <span className="viewer-3d__coaching-metric-val viewer-3d__coaching-metric-val--target">
                {comparison.targetValue}
                {comparison.unit}
              </span>
            </div>
            <div className="viewer-3d__coaching-metric-cell">
              <span className="viewer-3d__coaching-metric-label">REMAINING</span>
              <span
                className={`viewer-3d__coaching-metric-val ${
                  comparison.difference === 0
                    ? 'viewer-3d__coaching-metric-val--met'
                    : 'viewer-3d__coaching-metric-val--gap'
                }`}
              >
                {comparison.difference === 0 ? 'MET' : `+${comparison.difference}${comparison.unit}`}
              </span>
            </div>
          </div>

          {/* 5. Hold Timer or Directional Cue */}
          {comparison.isHoldBased && comparison.holdSecondsElapsed !== undefined ? (
            <div className="viewer-3d__hold-timer-bar">
              <div className="viewer-3d__hold-timer-labels">
                <span>HOLD DURATION ({comparison.holdStabilityScore ?? 98}% Stability)</span>
                <span>
                  {comparison.holdSecondsElapsed}s / {comparison.holdTargetSeconds}s
                </span>
              </div>
              <div className="viewer-3d__hold-progress-track">
                <div
                  className="viewer-3d__hold-progress-fill"
                  style={{ width: `${comparison.holdProgressPercent}%` }}
                />
              </div>
            </div>
          ) : (
            <div className="viewer-3d__coaching-cue-bar">
              <span style={{ fontSize: '9px', textTransform: 'uppercase', color: 'var(--text-muted)' }}>
                {comparison.direction}
              </span>
              <span>{comparison.directionalCue}</span>
            </div>
          )}

          {/* 6. Live Repetition Telemetry Row */}
          {isSessionActive && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '6px 10px',
                marginTop: '6px',
                background: 'rgba(0, 229, 255, 0.08)',
                borderRadius: '4px',
                border: '1px solid rgba(0, 229, 255, 0.2)',
                fontSize: '11px',
                fontFamily: 'var(--font-mono)',
              }}
            >
              <span style={{ color: 'var(--accent-cyan)', fontWeight: 700 }}>
                REP {liveAnalysis?.currentRep && liveAnalysis.currentRep > 0 ? liveAnalysis.currentRep : completedReps + 1}
              </span>
              <span style={{ color: 'var(--text-muted)' }}>
                Peak: <strong style={{ color: 'var(--text-primary)' }}>{liveAnalysis?.lastRepPeak !== null && liveAnalysis?.lastRepPeak !== undefined ? `${liveAnalysis.lastRepPeak}°` : '—'}</strong>
              </span>
              <span style={{ color: 'var(--text-muted)' }}>
                Reps Done: <strong style={{ color: '#00E676' }}>{completedReps}</strong>
              </span>
            </div>
          )}

          {/* 7. Safety Footnote */}
          <div className="viewer-3d__coaching-safety-note">
            Stop if movement causes discomfort & follow your physiotherapist's guidance.
          </div>
        </div>
      )}

      {/* ── AR Mode: Full-Bleed Live Webcam Passthrough Background ───────── */}
      {viewportMode === 'ar' && (
        <video
          ref={arVideoRef}
          autoPlay
          playsInline
          muted
          style={{
            position: 'absolute',
            inset: 0,
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            zIndex: 1,
            transform: 'scaleX(-1)', // Mirrored webcam feed
            filter: 'brightness(0.92) contrast(1.05)',
          }}
        />
      )}

      {/* ── Three.js Canvas Mount Node ──────────────────────────────────── */}
      <div
        ref={containerRef}
        className={`viewer-3d__canvas-wrapper ${enableBodyMapInteraction && hoveredRegion ? 'viewer-3d__canvas-wrapper--interactive' : ''}`}
        tabIndex={0}
        aria-label="3D Skeletal Canvas"
        onMouseMove={handleCanvasMouseMove}
        onMouseLeave={handleCanvasMouseLeave}
        onClick={handleCanvasClick}
      />

      {/* 3D Body Map Raycast Hover Tooltip */}
      {enableBodyMapInteraction && hoveredRegion && tooltipPos && (
        <div
          className="viewer-3d__body-tooltip"
          style={{ left: `${tooltipPos.x + 16}px`, top: `${tooltipPos.y - 14}px` }}
        >
          <div className="viewer-3d__body-tooltip-title">{REGION_INFO[hoveredRegion]?.label || hoveredRegion}</div>
          <div className="viewer-3d__body-tooltip-count">
            {REGION_INFO[hoveredRegion]?.protocolCount} Protocols · Click to view
          </div>
        </div>
      )}

      {/* Loading Overlay */}
      {!isReady && (
        <div className="viewer-3d__loading-overlay">
          <Loader2 size={32} className="spin-icon text-cyan" />
          <span>Initializing 3D biomechanics viewer…</span>
        </div>
      )}

      {/* ── 3D Skeletal Legend Overlay ─────────────────────────────────── */}
      <div className="viewer-3d__legend-bar" role="note" aria-label="3D Skeletal Legend">
        <div className="viewer-3d__legend-item">
          <span className="viewer-3d__legend-dot viewer-3d__legend-dot--current" />
          <span>CURRENT (Solid)</span>
        </div>
        <div className="viewer-3d__legend-item">
          <span className="viewer-3d__legend-dot viewer-3d__legend-dot--target" />
          <span>TARGET ({effectiveTarget}{motion.targetMetricLabel.includes('mm') ? 'mm' : '°'} Ghost)</span>
        </div>
        <div className="viewer-3d__legend-item">
          <span className="viewer-3d__legend-dot viewer-3d__legend-dot--active" />
          <span>ACTIVE JOINT</span>
        </div>
      </div>

      {/* ── Left Floating Telemetry & Annotation Controls ───────────────── */}
      {showAngles && (
        <div className="viewer-3d__telemetry-card">
          <div className="viewer-3d__telemetry-header">
            <span className="viewer-3d__telemetry-title">{effectiveName}</span>
            <span className="viewer-3d__telemetry-side">
              {selectedSide === 'bilateral' ? 'Bilateral' : selectedSide === 'left' ? 'Left Limb' : 'Right Limb'}
            </span>
          </div>

          <div className="viewer-3d__angle-display">
            <div className="viewer-3d__angle-main">
              <span className="viewer-3d__angle-val mono">
                {effectiveLiveVal}
                {motion.targetMetricLabel.includes('mm') ? 'mm' : '°'}
              </span>
              <span className="viewer-3d__angle-denom mono">
                / {effectiveTarget}
                {motion.targetMetricLabel.includes('mm') ? 'mm' : '°'}
              </span>
            </div>

            <div className="viewer-3d__angle-status">
              {stabilityScore !== undefined ? (
                <span className="text-good font-bold flex items-center gap-1">
                  <ShieldCheck size={12} style={{ display: 'inline' }} /> {stabilityScore}% Stability
                </span>
              ) : effectiveLiveVal >= effectiveTarget - 5 ? (
                <span className="text-good font-bold flex items-center gap-1">
                  <CheckCircle2 size={12} style={{ display: 'inline' }} /> Target Met
                </span>
              ) : liveAnalysis?.state === 'LOW_RANGE' ? (
                <span className="text-warn font-bold flex items-center gap-1">
                  <AlertTriangle size={12} style={{ display: 'inline' }} /> Range Limited
                </span>
              ) : (
                <span className="text-muted capitalize">{motion.plane} Plane</span>
              )}
            </div>
          </div>

          {/* Progress track */}
          <div className="viewer-3d__progress-track">
            <div
              className="viewer-3d__progress-fill"
              style={{
                width: `${Math.min(100, Math.max(0, Math.round((effectiveLiveVal / Math.max(1, effectiveTarget)) * 100)))}%`,
                background:
                  effectiveLiveVal >= effectiveTarget - 5
                    ? 'var(--color-good)'
                    : liveAnalysis?.state === 'LOW_RANGE'
                    ? 'var(--color-warn)'
                    : 'var(--accent-cyan)',
              }}
            />
          </div>

          {/* Annotation Layer Toggles */}
          <div className="viewer-3d__annotation-toggles">
            <button
              type="button"
              className={`viewer-3d__ann-btn ${showGhost ? 'viewer-3d__ann-btn--active' : ''}`}
              onClick={handleToggleGhost}
              title="Toggle Semi-Transparent Target Ghost Skeleton"
            >
              <Ghost size={10} />
              <span>Target Ghost</span>
            </button>
            <button
              type="button"
              className={`viewer-3d__ann-btn ${showJoints ? 'viewer-3d__ann-btn--active' : ''}`}
              onClick={handleToggleJoints}
              title="Toggle Glowing Active Joint Highlights"
            >
              <Sparkles size={10} />
              <span>Joints</span>
            </button>
            {motion.trajectoryPoints && (
              <button
                type="button"
                className={`viewer-3d__ann-btn ${showTrajectory ? 'viewer-3d__ann-btn--active' : ''}`}
                onClick={handleToggleTrajectory}
                title="Toggle 3D Trajectory Path"
              >
                <Activity size={10} />
                <span>Path</span>
              </button>
            )}
            <button
              type="button"
              className={`viewer-3d__ann-btn ${showAngles ? 'viewer-3d__ann-btn--active' : ''}`}
              onClick={handleToggleAngles}
              title="Toggle HUD Telemetry"
            >
              <Activity size={10} />
              <span>HUD</span>
            </button>
          </div>
        </div>
      )}

      {/* ── Top-Right Docked Live Webcam PiP Monitor ─────────────────────── */}
      {showCameraPip && (
        <div className={`viewer-3d__pip-monitor ${!isPipOpen ? 'viewer-3d__pip-monitor--collapsed' : ''}`}>
          <div className="viewer-3d__pip-header">
            <div className="viewer-3d__pip-title-row">
              <span className={`viewer-3d__pip-dot ${isStreaming ? 'viewer-3d__pip-dot--live' : ''}`} />
              <span className="viewer-3d__pip-title">{isStreaming ? 'LIVE CAMERA' : 'OPTICAL SENSOR'}</span>
            </div>
            <div className="viewer-3d__pip-actions">
              {onToggleCamera && (
                <button
                  type="button"
                  className={`viewer-3d__pip-cam-btn ${isStreaming ? 'viewer-3d__pip-cam-btn--active' : ''}`}
                  onClick={onToggleCamera}
                  disabled={isInitializing}
                  title={isStreaming ? 'Stop Optical Camera' : 'Start Optical Camera'}
                >
                  {isInitializing ? (
                    <Loader2 size={11} className="spin-icon" />
                  ) : isStreaming ? (
                    <CameraOff size={11} />
                  ) : (
                    <Camera size={11} />
                  )}
                  <span>{isStreaming ? 'Stop' : 'Start'}</span>
                </button>
              )}
              <button
                type="button"
                className="viewer-3d__pip-toggle-btn"
                onClick={() => setIsPipOpen((prev) => !prev)}
                title={isPipOpen ? 'Minimize Camera Feed' : 'Expand Camera Feed'}
              >
                {isPipOpen ? <Minimize2 size={11} /> : <Maximize2 size={11} />}
              </button>
            </div>
          </div>

          {isPipOpen && (
            <div className="viewer-3d__pip-body">
              {videoRef && (
                <video
                  ref={videoRef}
                  className={`viewer-3d__pip-video ${isStreaming ? 'viewer-3d__pip-video--active' : ''}`}
                  playsInline
                  muted
                  autoPlay
                />
              )}
              {canvasRef && (
                <canvas
                  ref={canvasRef}
                  className={`viewer-3d__pip-canvas ${isStreaming ? 'viewer-3d__pip-canvas--active' : ''}`}
                />
              )}
              {!isStreaming && !isInitializing && (
                <div className="viewer-3d__pip-placeholder">
                  <Camera size={20} className="text-muted" />
                  <span>Optical Sensor Standby</span>
                </div>
              )}
              {isInitializing && (
                <div className="viewer-3d__pip-placeholder">
                  <Loader2 size={20} className="spin-icon text-cyan" />
                  <span>Calibrating MediaPipe…</span>
                </div>
              )}
              {errorMessage && !isStreaming && (
                <div className="viewer-3d__pip-placeholder viewer-3d__pip-placeholder--err">
                  <span>{errorMessage}</span>
                </div>
              )}

              {isStreaming && stats && (
                <div className="viewer-3d__pip-footer">
                  <span>{stats.fps > 0 ? `${stats.fps} FPS` : '—'}</span>
                  <span>•</span>
                  <span>{stats.confidence}% Conf</span>
                  <span>•</span>
                  <span>33 Landmarks</span>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── Bottom Floating Controls & Phase Timeline Bar ───────────────── */}
      {showControls && (
        <div className="viewer-3d__bottom-controls">
          {/* 4-Phase Rehabilitation Timeline */}
          <div className="viewer-3d__phase-timeline" role="group" aria-label="Movement Phases">
            <div className={`viewer-3d__phase-step ${currentMetricVal < 10 ? 'viewer-3d__phase-step--active' : ''}`}>
              <span className="viewer-3d__phase-num">1</span>
              <span>Reference</span>
            </div>
            <ChevronRight size={12} className="viewer-3d__phase-arrow" />
            <div
              className={`viewer-3d__phase-step ${
                currentMetricVal >= 10 && currentMetricVal < effectiveTarget - 15 ? 'viewer-3d__phase-step--active' : ''
              } ${liveAnalysis?.state === 'LOW_RANGE' ? 'viewer-3d__phase-step--limitation' : ''}`}
            >
              <span className="viewer-3d__phase-num">2</span>
              <span>{motion.analysisType === 'isometric_hold' ? 'Load Hold' : 'Movement'}</span>
            </div>
            <ChevronRight size={12} className="viewer-3d__phase-arrow" />
            <div
              className={`viewer-3d__phase-step ${
                currentMetricVal >= effectiveTarget - 15 && currentMetricVal < effectiveTarget - 5
                  ? 'viewer-3d__phase-step--active'
                  : ''
              }`}
            >
              <span className="viewer-3d__phase-num">3</span>
              <span>Correction</span>
            </div>
            <ChevronRight size={12} className="viewer-3d__phase-arrow" />
            <div
              className={`viewer-3d__phase-step ${
                currentMetricVal >= effectiveTarget - 5 ? 'viewer-3d__phase-step--active viewer-3d__phase-step--target' : ''
              }`}
            >
              <span className="viewer-3d__phase-num">4</span>
              <span>
                Target ({effectiveTarget}
                {motion.targetMetricLabel.includes('mm') ? 'mm' : '°'})
              </span>
            </div>
          </div>

          {/* Offline Demo Scrubber Controls */}
          {!isStreaming && (
            <div className="viewer-3d__demo-bar">
              <button
                type="button"
                className="viewer-3d__control-btn viewer-3d__control-btn--play"
                onClick={handleTogglePlay}
                title={isPlayingDemo ? 'Pause Animation' : 'Play Demonstration'}
              >
                {isPlayingDemo ? <Pause size={13} /> : <Play size={13} />}
                <span>{isPlayingDemo ? 'Pause' : 'Play Demo'}</span>
              </button>

              {motion.laterality === 'unilateral' && (
                <div className="viewer-3d__side-group" role="group" aria-label="Target Limb Side">
                  <button
                    type="button"
                    className={`viewer-3d__side-btn ${selectedSide === 'left' ? 'viewer-3d__side-btn--active' : ''}`}
                    onClick={() => handleSideSwitch('left')}
                  >
                    Left
                  </button>
                  <button
                    type="button"
                    className={`viewer-3d__side-btn ${selectedSide === 'right' ? 'viewer-3d__side-btn--active' : ''}`}
                    onClick={() => handleSideSwitch('right')}
                  >
                    Right
                  </button>
                </div>
              )}

              <div className="viewer-3d__slider-group">
                <Sliders size={12} className="text-muted" />
                <input
                  type="range"
                  min={0}
                  max={Math.max(1, effectiveTarget)}
                  step={1}
                  value={currentMetricVal}
                  onChange={(e) => handleSliderScrub(Number(e.target.value))}
                  className="viewer-3d__slider"
                  title="Scrub movement metric"
                />
                <span className="viewer-3d__slider-val mono">
                  {currentMetricVal}
                  {motion.targetMetricLabel.includes('mm') ? 'mm' : '°'}
                </span>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Visual/Video Form Correction & Drill Demonstration Modal ────── */}
      {activeCompensationModal && (
        <CorrectiveDemonstrationModal
          compensation={activeCompensationModal}
          onClose={() => setActiveCompensationModal(null)}
          onContinuePractice={() => setActiveCompensationModal(null)}
        />
      )}
    </div>
  );
};
