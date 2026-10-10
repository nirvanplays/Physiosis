/**
 * crossBodyShoulderStretch.ts
 * Verified Biomechanical Kinematics Pipeline for Cross-Body Shoulder Stretch.
 *
 * Measured Metric:
 *   Horizontal adduction angle of the humerus across the thorax relative
 *   to the coronal bi-acromial reference line.
 */

import type { ReferencePose, AnimationTimeline, PhaseConfig } from '../PoseTypes';
import { createDemoPhases } from '../PoseTypes';
import type { ExerciseDefinition, Landmark3D, LiveGuideOverlay } from '../ExerciseTypes';
import type { MovementState } from '../../biomechanics/biomechanicsTypes';
import { angleBetweenVectors, clamp, lerp } from '../../../utils/math';

export const CROSS_BODY_TARGET_DEG = 90;
export const CROSS_BODY_LIMITED_DEG = 40;

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
  rightShoulderFlexion: 80,
  rightShoulderAbduction: -45, // horizontal adduction across chest
  rightElbowFlexion: 35,
  leftShoulderFlexion: 45,
  leftElbowFlexion: 70, // supporting arm
  headRotation: 2,
};

export const POSE_LIMITED_40: ReferencePose = {
  ...POSE_NEUTRAL,
  rightShoulderFlexion: 45,
  rightShoulderAbduction: -15,
  rightElbowFlexion: 25,
};

export const CROSS_BODY_TIMELINE: AnimationTimeline = {
  durationMs: 16000,
  keyframes: [
    { timeMs: 0,     pose: POSE_NEUTRAL },
    { timeMs: 2000,  pose: POSE_FULL_TARGET },
    { timeMs: 3000,  pose: POSE_FULL_TARGET },
    { timeMs: 4000,  pose: POSE_NEUTRAL },

    { timeMs: 5800,  pose: POSE_LIMITED_40 },
    { timeMs: 7000,  pose: POSE_LIMITED_40 },
    { timeMs: 8000,  pose: POSE_LIMITED_40 },

    { timeMs: 9500,  pose: { ...POSE_NEUTRAL, rightShoulderFlexion: 55, rightShoulderAbduction: -25, rightElbowFlexion: 30 } },
    { timeMs: 11000, pose: { ...POSE_NEUTRAL, rightShoulderFlexion: 68, rightShoulderAbduction: -35, rightElbowFlexion: 32 } },
    { timeMs: 12500, pose: { ...POSE_NEUTRAL, rightShoulderFlexion: 75, rightShoulderAbduction: -40, rightElbowFlexion: 34 } },
    { timeMs: 13800, pose: POSE_FULL_TARGET },
    { timeMs: 14800, pose: POSE_FULL_TARGET },
    { timeMs: 16000, pose: POSE_NEUTRAL },
  ],
};

export const CROSS_BODY_DEMO_PHASES: PhaseConfig[] = createDemoPhases(
  CROSS_BODY_TARGET_DEG,
  CROSS_BODY_LIMITED_DEG,
  'Adduction Stretch'
);

export function createPersonalizedCrossBodyTimeline(patientPeakAngle: number): AnimationTimeline {
  const clampedPeak = clamp(patientPeakAngle, 20, CROSS_BODY_TARGET_DEG);
  return {
    durationMs: 16000,
    keyframes: [
      { timeMs: 0,     pose: POSE_NEUTRAL },
      { timeMs: 2000,  pose: POSE_FULL_TARGET },
      { timeMs: 3000,  pose: POSE_FULL_TARGET },
      { timeMs: 4000,  pose: POSE_NEUTRAL },

      { timeMs: 5800,  pose: { ...POSE_NEUTRAL, rightShoulderFlexion: clampedPeak * 0.9, rightShoulderAbduction: -clampedPeak * 0.5 } },
      { timeMs: 7000,  pose: { ...POSE_NEUTRAL, rightShoulderFlexion: clampedPeak * 0.9, rightShoulderAbduction: -clampedPeak * 0.5 } },
      { timeMs: 8000,  pose: { ...POSE_NEUTRAL, rightShoulderFlexion: clampedPeak * 0.9, rightShoulderAbduction: -clampedPeak * 0.5 } },

      { timeMs: 9500,  pose: { ...POSE_NEUTRAL, rightShoulderFlexion: lerp(clampedPeak, CROSS_BODY_TARGET_DEG, 0.3) * 0.9 } },
      { timeMs: 11000, pose: { ...POSE_NEUTRAL, rightShoulderFlexion: lerp(clampedPeak, CROSS_BODY_TARGET_DEG, 0.6) * 0.9 } },
      { timeMs: 12500, pose: { ...POSE_NEUTRAL, rightShoulderFlexion: lerp(clampedPeak, CROSS_BODY_TARGET_DEG, 0.85) * 0.9 } },
      { timeMs: 13800, pose: POSE_FULL_TARGET },
      { timeMs: 14800, pose: POSE_FULL_TARGET },
      { timeMs: 16000, pose: POSE_NEUTRAL },
    ],
  };
}

import { getLandmarksForSide } from '../../biomechanics/sideLandmarks';

// ─── Biomechanical Metric Calculator ───────────────────────────────────────────
export function calculateCrossBodyMetric(
  landmarks: Landmark3D[],
  side: 'left' | 'right' | 'bilateral' = 'right'
): number | null {
  if (!landmarks || landmarks.length < 25) return null;

  const { shoulder, oppositeShoulder, elbow } = getLandmarksForSide(landmarks, side);

  if (!shoulder || !oppositeShoulder || !elbow) return null;
  if (
    (shoulder.visibility !== undefined && shoulder.visibility < 0.45) ||
    (oppositeShoulder.visibility !== undefined && oppositeShoulder.visibility < 0.45) ||
    (elbow.visibility !== undefined && elbow.visibility < 0.4)
  ) {
    return null;
  }

  // Chest axis (Active Shoulder -> Opposite Shoulder)
  const vChest = {
    x: oppositeShoulder.x - shoulder.x,
    y: oppositeShoulder.y - shoulder.y,
    z: (oppositeShoulder.z ?? 0) - (shoulder.z ?? 0),
  };

  // Arm vector (Active Shoulder -> Active Elbow)
  const vArm = {
    x: elbow.x - shoulder.x,
    y: elbow.y - shoulder.y,
    z: (elbow.z ?? 0) - (shoulder.z ?? 0),
  };

  const angle = angleBetweenVectors(vChest, vArm);
  if (isNaN(angle)) return null;

  // Horizontal adduction angle relative to resting coronal position
  const adductionAngle = clamp(180 - angle, 0, 130);
  return Math.round(adductionAngle * 10) / 10;
}

// ─── State Detector ───────────────────────────────────────────────────────────
export function detectCrossBodyState(
  currentAngle: number | null,
  prevAngle: number | null,
  currentState: MovementState,
  peakAngle: number
): MovementState {
  if (currentAngle === null) return 'WAITING';

  const START_THRESH = 15;
  const TARGET_THRESH = 75;

  if (currentState === 'WAITING') {
    return currentAngle < START_THRESH ? 'READY' : 'WAITING';
  }

  if (currentState === 'READY') {
    if (currentAngle > START_THRESH + 3) return 'LIFTING';
    return 'READY';
  }

  if (currentState === 'LIFTING') {
    if (currentAngle >= TARGET_THRESH) return 'AT_TARGET';
    if (prevAngle !== null && currentAngle < prevAngle - 4 && currentAngle < peakAngle - 6) {
      return 'RETURNING';
    }
    return 'LIFTING';
  }

  if (currentState === 'AT_TARGET') {
    if (currentAngle < TARGET_THRESH - 8) return 'RETURNING';
    return 'AT_TARGET';
  }

  if (currentState === 'RETURNING') {
    if (currentAngle <= START_THRESH) return 'READY';
    if (prevAngle !== null && currentAngle > prevAngle + 5 && currentAngle > START_THRESH + 6) {
      return 'LIFTING';
    }
    return 'RETURNING';
  }

  return currentState;
}

// ─── Form Feedback ─────────────────────────────────────────────────────────────
export function getCrossBodyFeedback(
  state: MovementState,
  angle: number | null,
  peakAngle: number | null
): string {
  if (state === 'WAITING' || angle === null) {
    return 'Stand facing the camera with your arms at your side.';
  }
  if (state === 'READY') {
    if (peakAngle && peakAngle >= 75) {
      return 'Great stretch hold! Ready for the next rep.';
    }
    return 'Draw your arm across your chest using your opposite hand.';
  }
  if (state === 'LIFTING') {
    return 'Drawing arm across thorax. Keep shoulders level.';
  }
  if (state === 'AT_TARGET') {
    return 'Holding posterior capsule stretch. Maintain steady breathing.';
  }
  if (state === 'RETURNING') {
    return 'Release gently and return your arm to your side.';
  }
  return 'Gently stretch posterior shoulder capsule.';
}

export function getCrossBodyLiveGuide(
  landmarks: Landmark3D[],
  canvasWidth: number,
  canvasHeight: number,
  side: 'left' | 'right' | 'bilateral' = 'right'
): LiveGuideOverlay | null {
  const { shoulder, oppositeShoulder } = getLandmarksForSide(landmarks, side);
  if (!shoulder || !oppositeShoulder) return null;

  const sx = shoulder.x * canvasWidth;
  const sy = shoulder.y * canvasHeight;
  const ox = oppositeShoulder.x * canvasWidth;

  return {
    start: { x: sx, y: sy },
    end: { x: (sx + ox) / 2, y: sy },
    label: `Target ${CROSS_BODY_TARGET_DEG}°`,
    targetAngle: CROSS_BODY_TARGET_DEG,
  };
}

// ─── Exported Exercise Definition ─────────────────────────────────────────────
export const crossBodyShoulderStretchExercise: ExerciseDefinition = {
  id: 'cross_body_shoulder_stretch',
  name: 'Cross-Body Shoulder Stretch',
  category: 'Shoulder Rehabilitation',
  bodyRegion: 'Shoulder / Upper Limb',
  description:
    'Horizontal adduction stretch of the arm across the thorax to elongate the posterior shoulder capsule and rotator cuff.',
  difficulty: 'beginner',
  side: 'right',

  laterality: 'left/right',
  supportedLateralities: ['left', 'right'],
  targetMetric: 'Horizontal Adduction Angle',
  unit: 'degrees',
  poseLandmarks: ['left_shoulder', 'right_shoulder', 'elbow', 'wrist'],
  analysisMode: 'stretch_hold',
  referenceDataAvailable: true,
  sourceType: 'DATASET-BACKED EXERCISE',
  isDatasetBacked: true,
  liveAnalysisAvailable: true,
  analysisConfidence: 'HIGH',

  metricName: 'Cross-Body Adduction',
  plane: 'Transverse Plane',

  targetAngle: CROSS_BODY_TARGET_DEG,
  limitedAngle: CROSS_BODY_LIMITED_DEG,
  startAngle: 0,
  minValidAmplitude: 15,

  postureMode: 'standing',
  highlightJoint: 'shoulder',
  requiredLandmarks: ['left_shoulder', 'right_shoulder', 'right_elbow', 'left_elbow'],

  timeline: CROSS_BODY_TIMELINE,
  demoPhases: CROSS_BODY_DEMO_PHASES,
  createPersonalizedTimeline: createPersonalizedCrossBodyTimeline,

  calculateMetric: calculateCrossBodyMetric,
  detectState: detectCrossBodyState,
  getFeedback: getCrossBodyFeedback,
  getLiveGuide: getCrossBodyLiveGuide,
};
