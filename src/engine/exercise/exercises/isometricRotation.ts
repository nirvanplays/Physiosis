/**
 * isometricRotation.ts
 * Verified Biomechanical Kinematics Pipeline for Isometric Shoulder Rotation.
 *
 * Measured Metric:
 *   Rotational alignment of the forearm with 90° fixed elbow flexion
 *   against lateral torso resistance.
 */

import type { ReferencePose, AnimationTimeline, PhaseConfig } from '../PoseTypes';
import { createDemoPhases } from '../PoseTypes';
import type { ExerciseDefinition, Landmark3D, LiveGuideOverlay } from '../ExerciseTypes';
import type { MovementState } from '../../biomechanics/biomechanicsTypes';
import { angleBetweenVectors, clamp, lerp } from '../../../utils/math';

export const ISOMETRIC_ROTATION_TARGET_DEG = 45;
export const ISOMETRIC_ROTATION_LIMITED_DEG = 18;

// ─── Keyframe Poses ───────────────────────────────────────────────────────────
export const POSE_NEUTRAL: ReferencePose = {
  trunkLean: 0,
  trunkSideFlexion: 0,
  rightShoulderFlexion: 0,
  rightShoulderAbduction: 4,
  rightElbowFlexion: 90, // tucked 90 deg elbow
  leftShoulderFlexion: 0,
  leftShoulderAbduction: 4,
  leftElbowFlexion: 6,
  rightHipFlexion: 0,
  rightKneeFlexion: 4,
  leftHipFlexion: 0,
  leftKneeFlexion: 4,
  headFlexion: 0,
  headRotation: 0,
  rightShoulderElevation: 0,
  leftShoulderElevation: 0,
};

export const POSE_FULL_TARGET: ReferencePose = {
  ...POSE_NEUTRAL,
  rightShoulderAbduction: 25, // external rotation arc
  headRotation: 1,
};

export const POSE_LIMITED_18: ReferencePose = {
  ...POSE_NEUTRAL,
  rightShoulderAbduction: 10,
};

export const ISOMETRIC_ROTATION_TIMELINE: AnimationTimeline = {
  durationMs: 16000,
  keyframes: [
    { timeMs: 0,     pose: POSE_NEUTRAL },
    { timeMs: 2000,  pose: POSE_FULL_TARGET },
    { timeMs: 3000,  pose: POSE_FULL_TARGET },
    { timeMs: 4000,  pose: POSE_NEUTRAL },

    { timeMs: 5800,  pose: POSE_LIMITED_18 },
    { timeMs: 7000,  pose: POSE_LIMITED_18 },
    { timeMs: 8000,  pose: POSE_LIMITED_18 },

    { timeMs: 9500,  pose: { ...POSE_NEUTRAL, rightShoulderAbduction: 14 } },
    { timeMs: 11000, pose: { ...POSE_NEUTRAL, rightShoulderAbduction: 18 } },
    { timeMs: 12500, pose: { ...POSE_NEUTRAL, rightShoulderAbduction: 22 } },
    { timeMs: 13800, pose: POSE_FULL_TARGET },
    { timeMs: 14800, pose: POSE_FULL_TARGET },
    { timeMs: 16000, pose: POSE_NEUTRAL },
  ],
};

export const ISOMETRIC_ROTATION_DEMO_PHASES: PhaseConfig[] = createDemoPhases(
  ISOMETRIC_ROTATION_TARGET_DEG,
  ISOMETRIC_ROTATION_LIMITED_DEG,
  'External Rotation'
);

export function createPersonalizedRotationTimeline(patientPeakAngle: number): AnimationTimeline {
  const clampedPeak = clamp(patientPeakAngle, 10, ISOMETRIC_ROTATION_TARGET_DEG);
  return {
    durationMs: 16000,
    keyframes: [
      { timeMs: 0,     pose: POSE_NEUTRAL },
      { timeMs: 2000,  pose: POSE_FULL_TARGET },
      { timeMs: 3000,  pose: POSE_FULL_TARGET },
      { timeMs: 4000,  pose: POSE_NEUTRAL },

      { timeMs: 5800,  pose: { ...POSE_NEUTRAL, rightShoulderAbduction: clampedPeak * 0.55 } },
      { timeMs: 7000,  pose: { ...POSE_NEUTRAL, rightShoulderAbduction: clampedPeak * 0.55 } },
      { timeMs: 8000,  pose: { ...POSE_NEUTRAL, rightShoulderAbduction: clampedPeak * 0.55 } },

      { timeMs: 9500,  pose: { ...POSE_NEUTRAL, rightShoulderAbduction: lerp(clampedPeak, ISOMETRIC_ROTATION_TARGET_DEG, 0.3) * 0.55 } },
      { timeMs: 11000, pose: { ...POSE_NEUTRAL, rightShoulderAbduction: lerp(clampedPeak, ISOMETRIC_ROTATION_TARGET_DEG, 0.6) * 0.55 } },
      { timeMs: 12500, pose: { ...POSE_NEUTRAL, rightShoulderAbduction: lerp(clampedPeak, ISOMETRIC_ROTATION_TARGET_DEG, 0.85) * 0.55 } },
      { timeMs: 13800, pose: POSE_FULL_TARGET },
      { timeMs: 14800, pose: POSE_FULL_TARGET },
      { timeMs: 16000, pose: POSE_NEUTRAL },
    ],
  };
}

import { getLandmarksForSide } from '../../biomechanics/sideLandmarks';

// ─── Biomechanical Metric Calculator ───────────────────────────────────────────
export function calculateIsometricRotationMetric(
  landmarks: Landmark3D[],
  side: 'left' | 'right' | 'bilateral' = 'right'
): number | null {
  if (!landmarks || landmarks.length < 25) return null;

  const { shoulder, elbow, wrist, hip } = getLandmarksForSide(landmarks, side);

  if (!shoulder || !elbow || !wrist || !hip) return null;
  if (
    (shoulder.visibility !== undefined && shoulder.visibility < 0.45) ||
    (elbow.visibility !== undefined && elbow.visibility < 0.45) ||
    (wrist.visibility !== undefined && wrist.visibility < 0.4)
  ) {
    return null;
  }

  // Vector 1: Forearm vector (Elbow -> Wrist)
  const vForearm = {
    x: wrist.x - elbow.x,
    y: wrist.y - elbow.y,
    z: (wrist.z ?? 0) - (elbow.z ?? 0),
  };

  // Vector 2: Torso anterior baseline (Torso cross product / Sagittal forward vector)
  const vTorso = {
    x: shoulder.x - hip.x,
    y: shoulder.y - hip.y,
    z: (shoulder.z ?? 0) - (hip.z ?? 0),
  };

  const angle = angleBetweenVectors(vForearm, vTorso);
  if (isNaN(angle)) return null;

  // External rotation deviation from sagittal neutral (90 deg)
  const rotAngle = Math.abs(angle - 90);
  return clamp(Math.round(rotAngle * 10) / 10, 0, 90);
}

// ─── State Detector ───────────────────────────────────────────────────────────
export function detectIsometricRotationState(
  currentAngle: number | null,
  prevAngle: number | null,
  currentState: MovementState,
  peakAngle: number
): MovementState {
  if (currentAngle === null) return 'WAITING';

  const START_THRESH = 8;
  const TARGET_THRESH = 35;

  if (currentState === 'WAITING') {
    return currentAngle < START_THRESH ? 'READY' : 'WAITING';
  }

  if (currentState === 'READY') {
    if (currentAngle > START_THRESH + 2) return 'LIFTING';
    return 'READY';
  }

  if (currentState === 'LIFTING') {
    if (currentAngle >= TARGET_THRESH) return 'AT_TARGET';
    if (prevAngle !== null && currentAngle < prevAngle - 3 && currentAngle < peakAngle - 4) {
      return 'RETURNING';
    }
    return 'LIFTING';
  }

  if (currentState === 'AT_TARGET') {
    if (currentAngle < TARGET_THRESH - 5) return 'RETURNING';
    return 'AT_TARGET';
  }

  if (currentState === 'RETURNING') {
    if (currentAngle <= START_THRESH) return 'READY';
    if (prevAngle !== null && currentAngle > prevAngle + 3 && currentAngle > START_THRESH + 4) {
      return 'LIFTING';
    }
    return 'RETURNING';
  }

  return currentState;
}

// ─── Form Feedback ─────────────────────────────────────────────────────────────
export function getIsometricRotationFeedback(
  state: MovementState,
  angle: number | null,
  peakAngle: number | null
): string {
  if (state === 'WAITING' || angle === null) {
    return 'Tuck your elbow at 90 degrees against your rib cage.';
  }
  if (state === 'READY') {
    if (peakAngle && peakAngle >= 35) {
      return 'Great rotational hold! Ready for the next rep.';
    }
    return 'Rotate your forearm outward while keeping your elbow pinned to your side.';
  }
  if (state === 'LIFTING') {
    return 'Rotating outward. Do not let your elbow drift away from your torso.';
  }
  if (state === 'AT_TARGET') {
    return 'Holding external rotation target. Maintain rotator cuff engagement.';
  }
  if (state === 'RETURNING') {
    return 'Return forearm back to center.';
  }
  return 'Condition rotator cuff stabilizers with steady rotational resistance.';
}

export function getIsometricRotationLiveGuide(
  landmarks: Landmark3D[],
  canvasWidth: number,
  canvasHeight: number,
  side: 'left' | 'right' | 'bilateral' = 'right'
): LiveGuideOverlay | null {
  const { elbow } = getLandmarksForSide(landmarks, side);
  if (!elbow) return null;

  const ex = elbow.x * canvasWidth;
  const ey = elbow.y * canvasHeight;
  const dir = side === 'left' ? -1 : 1;

  return {
    start: { x: ex, y: ey },
    end: { x: ex + dir * 80, y: ey },
    label: `Target ${ISOMETRIC_ROTATION_TARGET_DEG}°`,
    targetAngle: ISOMETRIC_ROTATION_TARGET_DEG,
  };
}

// ─── Exported Exercise Definition ─────────────────────────────────────────────
export const isometricRotationExercise: ExerciseDefinition = {
  id: 'isometric_rotation',
  name: 'Isometric Rotation',
  category: 'Shoulder & Core Stability',
  bodyRegion: 'Shoulder / Upper Limb',
  description:
    'Static isometric rotational hold of the upper limb / torso to condition rotator cuff stabilizers and resist torque.',
  difficulty: 'intermediate',
  side: 'right',

  laterality: 'left/right',
  supportedLateralities: ['left', 'right'],
  targetMetric: 'Rotational Hold Stability',
  unit: 'degrees / hold seconds',
  poseLandmarks: ['shoulder', 'elbow', 'wrist', 'hip'],
  analysisMode: 'isometric_stability',
  referenceDataAvailable: true,
  sourceType: 'DATASET-BACKED EXERCISE',
  isDatasetBacked: true,
  liveAnalysisAvailable: true,
  analysisConfidence: 'HIGH',

  metricName: 'Isometric Rotation Hold',
  plane: 'Transverse Plane',

  targetAngle: ISOMETRIC_ROTATION_TARGET_DEG,
  limitedAngle: ISOMETRIC_ROTATION_LIMITED_DEG,
  startAngle: 0,
  minValidAmplitude: 8,

  postureMode: 'standing',
  highlightJoint: 'shoulder',
  requiredLandmarks: ['right_shoulder', 'right_elbow', 'right_wrist', 'right_hip'],

  timeline: ISOMETRIC_ROTATION_TIMELINE,
  demoPhases: ISOMETRIC_ROTATION_DEMO_PHASES,
  createPersonalizedTimeline: createPersonalizedRotationTimeline,

  calculateMetric: calculateIsometricRotationMetric,
  detectState: detectIsometricRotationState,
  getFeedback: getIsometricRotationFeedback,
  getLiveGuide: getIsometricRotationLiveGuide,
};
