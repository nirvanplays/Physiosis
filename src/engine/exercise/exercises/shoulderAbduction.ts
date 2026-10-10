/**
 * shoulderAbduction.ts
 * Verified Biomechanical Kinematics Pipeline for Shoulder Abduction (Coronal Plane).
 *
 * Measured Metric:
 *   Glenohumeral abduction angle formed between the torso axis (Hip -> Shoulder)
 *   and upper arm axis (Shoulder -> Elbow) projected onto the coronal/frontal plane.
 *
 * Master 16s Animation Timeline:
 *   0.0s – 4.0s:  REFERENCE (0° -> 160° -> 0°)
 *   4.0s – 8.0s:  DETECTED LIMITATION (0° -> 65° restriction)
 *   8.0s – 13.0s: GUIDED CORRECTION (65° -> 90° -> 120° -> 145° -> 160°)
 *   13.0s – 16.0s: SUCCESS & RETURN (160° hold -> 0°)
 */

import type { ReferencePose, AnimationTimeline, PhaseConfig } from '../PoseTypes';
import { createDemoPhases } from '../PoseTypes';
import type { ExerciseDefinition, Landmark3D, LiveGuideOverlay } from '../ExerciseTypes';
import type { MovementState } from '../../biomechanics/biomechanicsTypes';
import { angleBetweenVectors, clamp, lerp } from '../../../utils/math';

export const SHOULDER_ABDUCTION_TARGET_DEG = 160;
export const SHOULDER_ABDUCTION_LIMITED_DEG = 65;

// ─── Keyframe Poses ───────────────────────────────────────────────────────────
export const POSE_NEUTRAL: ReferencePose = {
  trunkLean: 0,
  trunkSideFlexion: 0,
  rightShoulderFlexion: 0,
  rightShoulderAbduction: 4,
  rightElbowFlexion: 6,
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
  rightShoulderAbduction: 160,
  rightShoulderElevation: 8,
  trunkSideFlexion: -1.5, // slight natural counter-balance
};

export const POSE_LIMITED_65: ReferencePose = {
  ...POSE_NEUTRAL,
  rightShoulderAbduction: 65,
  rightShoulderElevation: 4,
};

export const SHOULDER_ABDUCTION_TIMELINE: AnimationTimeline = {
  durationMs: 16000,
  keyframes: [
    { timeMs: 0,     pose: POSE_NEUTRAL },
    { timeMs: 2000,  pose: POSE_FULL_TARGET },
    { timeMs: 2800,  pose: POSE_FULL_TARGET },
    { timeMs: 4000,  pose: POSE_NEUTRAL },

    { timeMs: 5800,  pose: POSE_LIMITED_65 },
    { timeMs: 6800,  pose: POSE_LIMITED_65 },
    { timeMs: 8000,  pose: POSE_LIMITED_65 },

    { timeMs: 9500,  pose: { ...POSE_NEUTRAL, rightShoulderAbduction: 90 } },
    { timeMs: 11000, pose: { ...POSE_NEUTRAL, rightShoulderAbduction: 125, rightShoulderElevation: 4 } },
    { timeMs: 12500, pose: { ...POSE_NEUTRAL, rightShoulderAbduction: 148, rightShoulderElevation: 6 } },
    { timeMs: 13800, pose: POSE_FULL_TARGET },
    { timeMs: 14800, pose: POSE_FULL_TARGET },
    { timeMs: 16000, pose: POSE_NEUTRAL },
  ],
};

export const SHOULDER_ABDUCTION_DEMO_PHASES: PhaseConfig[] = createDemoPhases(
  SHOULDER_ABDUCTION_TARGET_DEG,
  SHOULDER_ABDUCTION_LIMITED_DEG,
  'Abduction'
);

export function createPersonalizedAbductionTimeline(patientPeakAngle: number): AnimationTimeline {
  const clampedPeak = clamp(patientPeakAngle, 30, SHOULDER_ABDUCTION_TARGET_DEG);
  const patientLimitedPose: ReferencePose = {
    ...POSE_NEUTRAL,
    rightShoulderAbduction: clampedPeak,
    rightShoulderElevation: clampedPeak > 100 ? 5 : 2,
  };

  return {
    durationMs: 16000,
    keyframes: [
      { timeMs: 0,     pose: POSE_NEUTRAL },
      { timeMs: 2000,  pose: POSE_FULL_TARGET },
      { timeMs: 2800,  pose: POSE_FULL_TARGET },
      { timeMs: 4000,  pose: POSE_NEUTRAL },

      { timeMs: 5800,  pose: patientLimitedPose },
      { timeMs: 6800,  pose: patientLimitedPose },
      { timeMs: 8000,  pose: patientLimitedPose },

      { timeMs: 9500,  pose: { ...POSE_NEUTRAL, rightShoulderAbduction: lerp(clampedPeak, SHOULDER_ABDUCTION_TARGET_DEG, 0.3) } },
      { timeMs: 11000, pose: { ...POSE_NEUTRAL, rightShoulderAbduction: lerp(clampedPeak, SHOULDER_ABDUCTION_TARGET_DEG, 0.6) } },
      { timeMs: 12500, pose: { ...POSE_NEUTRAL, rightShoulderAbduction: lerp(clampedPeak, SHOULDER_ABDUCTION_TARGET_DEG, 0.85) } },
      { timeMs: 13800, pose: POSE_FULL_TARGET },
      { timeMs: 14800, pose: POSE_FULL_TARGET },
      { timeMs: 16000, pose: POSE_NEUTRAL },
    ],
  };
}

import { getLandmarksForSide } from '../../biomechanics/sideLandmarks';

// ─── Biomechanical Metric Calculator ───────────────────────────────────────────
export function calculateShoulderAbductionMetric(
  landmarks: Landmark3D[],
  side: 'left' | 'right' | 'bilateral' = 'right'
): number | null {
  if (!landmarks || landmarks.length < 25) return null;

  const { shoulder, elbow, hip } = getLandmarksForSide(landmarks, side);

  if (!shoulder || !elbow || !hip) return null;
  if (
    (shoulder.visibility !== undefined && shoulder.visibility < 0.45) ||
    (elbow.visibility !== undefined && elbow.visibility < 0.45) ||
    (hip.visibility !== undefined && hip.visibility < 0.4)
  ) {
    return null;
  }

  // Vector 1: Torso downward vector (Shoulder -> Hip)
  const vTorso = {
    x: hip.x - shoulder.x,
    y: hip.y - shoulder.y,
    z: (hip.z ?? 0) - (shoulder.z ?? 0),
  };

  // Vector 2: Upper arm vector (Shoulder -> Elbow)
  const vArm = {
    x: elbow.x - shoulder.x,
    y: elbow.y - shoulder.y,
    z: (elbow.z ?? 0) - (shoulder.z ?? 0),
  };

  const angle = angleBetweenVectors(vTorso, vArm);
  if (isNaN(angle)) return null;

  return clamp(Math.round(angle * 10) / 10, 0, 180);
}

// ─── State Detector ───────────────────────────────────────────────────────────
export function detectShoulderAbductionState(
  currentAngle: number | null,
  prevAngle: number | null,
  currentState: MovementState,
  peakAngle: number
): MovementState {
  if (currentAngle === null) return 'WAITING';

  const START_THRESH = 22;
  const TARGET_THRESH = 145;

  if (currentState === 'WAITING') {
    return currentAngle < START_THRESH ? 'READY' : 'WAITING';
  }

  if (currentState === 'READY') {
    if (currentAngle > START_THRESH + 3) return 'LIFTING';
    return 'READY';
  }

  if (currentState === 'LIFTING') {
    if (currentAngle >= TARGET_THRESH) return 'AT_TARGET';
    if (prevAngle !== null && currentAngle < prevAngle - 5 && currentAngle < peakAngle - 8) {
      return 'RETURNING';
    }
    return 'LIFTING';
  }

  if (currentState === 'AT_TARGET') {
    if (currentAngle < TARGET_THRESH - 10) return 'RETURNING';
    return 'AT_TARGET';
  }

  if (currentState === 'RETURNING') {
    if (currentAngle <= START_THRESH) return 'READY';
    if (prevAngle !== null && currentAngle > prevAngle + 6 && currentAngle > START_THRESH + 10) {
      return 'LIFTING';
    }
    return 'RETURNING';
  }

  return currentState;
}

// ─── Form Feedback ─────────────────────────────────────────────────────────────
export function getShoulderAbductionFeedback(
  state: MovementState,
  angle: number | null,
  peakAngle: number | null
): string {
  if (state === 'WAITING' || angle === null) {
    return 'Stand facing the camera with your arm relaxed at your side.';
  }
  if (state === 'READY') {
    if (peakAngle && peakAngle >= 145) {
      return 'Great abduction repetition! Ready for your next rep.';
    }
    return 'Raise your arm out to the side in the coronal plane.';
  }
  if (state === 'LIFTING') {
    if (angle < 90) return 'Lifting arm out laterally. Keep your elbow straight.';
    return 'Approaching full overhead abduction. Avoid leaning your torso.';
  }
  if (state === 'AT_TARGET') {
    return 'Excellent full shoulder abduction! Hold briefly, then lower smoothly.';
  }
  if (state === 'RETURNING') {
    return 'Lower your arm smoothly and under control back to your side.';
  }
  return 'Maintain steady coronal arm elevation.';
}

// ─── Live Camera Guide ─────────────────────────────────────────────────────────
export function getShoulderAbductionLiveGuide(
  landmarks: Landmark3D[],
  canvasWidth: number,
  canvasHeight: number,
  side: 'left' | 'right' | 'bilateral' = 'right'
): LiveGuideOverlay | null {
  const { shoulder } = getLandmarksForSide(landmarks, side);
  if (!shoulder) return null;

  const sx = shoulder.x * canvasWidth;
  const sy = shoulder.y * canvasHeight;

  // Arc out to the side at target angle
  const armLength = 120;
  const rad = ((180 - SHOULDER_ABDUCTION_TARGET_DEG) * Math.PI) / 180;
  const dir = side === 'left' ? -1 : 1;
  const ex = sx + dir * Math.sin(rad) * armLength;
  const ey = sy - Math.cos(rad) * armLength;

  return {
    start: { x: sx, y: sy },
    end: { x: ex, y: ey },
    label: `Target ${SHOULDER_ABDUCTION_TARGET_DEG}°`,
    targetAngle: SHOULDER_ABDUCTION_TARGET_DEG,
  };
}

// ─── Exported Exercise Definition ─────────────────────────────────────────────
export const shoulderAbductionExercise: ExerciseDefinition = {
  id: 'shoulder_abduction',
  name: 'Shoulder Abduction',
  category: 'Upper Extremity',
  bodyRegion: 'Shoulder / Upper Limb',
  description:
    'Coronal plane elevation of the arm away from the anatomical midline to evaluate middle deltoid and supraspinatus range.',
  difficulty: 'beginner',
  side: 'right',

  laterality: 'left/right',
  supportedLateralities: ['left', 'right'],
  targetMetric: 'Glenohumeral Abduction Angle',
  unit: 'degrees',
  poseLandmarks: ['hip', 'shoulder', 'elbow', 'wrist'],
  analysisMode: 'kinematic_rom',
  referenceDataAvailable: true,
  sourceType: 'DATASET-BACKED EXERCISE',
  isDatasetBacked: true,
  liveAnalysisAvailable: true,
  analysisConfidence: 'HIGH',

  metricName: 'Shoulder Abduction',
  plane: 'Frontal Plane',

  targetAngle: SHOULDER_ABDUCTION_TARGET_DEG,
  limitedAngle: SHOULDER_ABDUCTION_LIMITED_DEG,
  startAngle: 0,
  minValidAmplitude: 20,

  postureMode: 'standing',
  highlightJoint: 'shoulder',
  requiredLandmarks: ['right_shoulder', 'right_elbow', 'right_wrist', 'right_hip'],

  timeline: SHOULDER_ABDUCTION_TIMELINE,
  demoPhases: SHOULDER_ABDUCTION_DEMO_PHASES,
  createPersonalizedTimeline: createPersonalizedAbductionTimeline,

  calculateMetric: calculateShoulderAbductionMetric,
  detectState: detectShoulderAbductionState,
  getFeedback: getShoulderAbductionFeedback,
  getLiveGuide: getShoulderAbductionLiveGuide,
};
