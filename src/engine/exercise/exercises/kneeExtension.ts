/**
 * kneeExtension.ts
 * Exercise Definition and 16-Second Demonstration Timeline for Seated Knee Extension.
 *
 * Primary metric: Right knee extension angle (degrees).
 * Primary landmarks: Right Hip (24), Right Knee (26), Right Ankle (28).
 * Target: 170° (nearly straight leg).
 * Limitation: 125° (incomplete extension).
 * Posture: Seated.
 */

import type { ReferencePose, AnimationTimeline } from '../PoseTypes';
import { createDemoPhases } from '../PoseTypes';
import type { ExerciseDefinition, Landmark3D, LiveGuideOverlay } from '../ExerciseTypes';
import type { MovementState } from '../../biomechanics/biomechanicsTypes';
import { clamp } from '../../../utils/math';

export const KNEE_EXTENSION_TARGET_DEG = 170;
export const KNEE_EXTENSION_LIMITED_DEG = 125;
export const KNEE_EXTENSION_START_DEG = 90;

// ─── Seated Keyframe Poses ───────────────────────────────────────────────────

/** Seated starting posture with bent knee at 90°. */
export const POSE_SEATED_NEUTRAL: ReferencePose = {
  postureMode: 'seated',
  activeAngleDeg: 90,

  trunkLean: 0,
  trunkSideFlexion: 0,

  rightShoulderFlexion: 5,
  rightShoulderAbduction: 2,
  rightElbowFlexion: 65, // resting on lap

  leftShoulderFlexion: 0,
  leftShoulderAbduction: 2,
  leftElbowFlexion: 65,

  rightHipFlexion: 0, // thigh horizontal
  rightKneeFlexion: 90, // knee bent 90° down
  leftHipFlexion: 0,
  leftKneeFlexion: 90,

  headFlexion: 2,
  headRotation: 0,

  rightShoulderElevation: 0,
  leftShoulderElevation: 0,
};

/** Full 170° knee extension posture. */
export const POSE_SEATED_EXTENDED: ReferencePose = {
  postureMode: 'seated',
  activeAngleDeg: 170,

  trunkLean: -2, // slight stable trunk posture
  trunkSideFlexion: 1,

  rightShoulderFlexion: 5,
  rightShoulderAbduction: 2,
  rightElbowFlexion: 65,

  leftShoulderFlexion: 0,
  leftShoulderAbduction: 2,
  leftElbowFlexion: 65,

  rightHipFlexion: 2,
  rightKneeFlexion: 10, // 180 - 10 = 170° extension
  leftHipFlexion: 0,
  leftKneeFlexion: 90,

  headFlexion: 3,
  headRotation: 0,

  rightShoulderElevation: 1,
  leftShoulderElevation: 0,
};

/** Limited 125° knee extension posture. */
export const POSE_SEATED_LIMITED: ReferencePose = {
  postureMode: 'seated',
  activeAngleDeg: 125,

  trunkLean: 0,
  trunkSideFlexion: 0,

  rightShoulderFlexion: 5,
  rightShoulderAbduction: 2,
  rightElbowFlexion: 65,

  leftShoulderFlexion: 0,
  leftShoulderAbduction: 2,
  leftElbowFlexion: 65,

  rightHipFlexion: 0,
  rightKneeFlexion: 55, // 180 - 55 = 125° extension
  leftHipFlexion: 0,
  leftKneeFlexion: 90,

  headFlexion: 2,
  headRotation: 0,

  rightShoulderElevation: 0,
  leftShoulderElevation: 0,
};

// ─── 16-Second Master Timeline ────────────────────────────────────────────────

export const KNEE_EXTENSION_TIMELINE: AnimationTimeline = {
  durationMs: 16000,
  keyframes: [
    // 0.0s – 4.0s: REFERENCE (90° → 170° → 90°)
    { timeMs: 0, pose: POSE_SEATED_NEUTRAL },
    { timeMs: 1500, pose: POSE_SEATED_EXTENDED },
    { timeMs: 2500, pose: POSE_SEATED_EXTENDED },
    { timeMs: 4000, pose: POSE_SEATED_NEUTRAL },

    // 4.0s – 8.0s: LIMITATION (90° → 125° hold)
    { timeMs: 4050, pose: POSE_SEATED_NEUTRAL },
    { timeMs: 5500, pose: POSE_SEATED_LIMITED },
    { timeMs: 7200, pose: POSE_SEATED_LIMITED },
    { timeMs: 8000, pose: POSE_SEATED_LIMITED },

    // 8.0s – 13.0s: GUIDED CORRECTION (125° → 140° → 155° → 170°)
    { timeMs: 8100, pose: POSE_SEATED_LIMITED },
    {
      timeMs: 9500,
      pose: { ...POSE_SEATED_EXTENDED, rightKneeFlexion: 40, activeAngleDeg: 140 },
    },
    {
      timeMs: 11200,
      pose: { ...POSE_SEATED_EXTENDED, rightKneeFlexion: 25, activeAngleDeg: 155 },
    },
    { timeMs: 13000, pose: POSE_SEATED_EXTENDED },

    // 13.0s – 16.0s: IMPROVED (170° hold → return)
    { timeMs: 14200, pose: POSE_SEATED_EXTENDED },
    { timeMs: 15900, pose: POSE_SEATED_NEUTRAL },
    { timeMs: 16000, pose: POSE_SEATED_NEUTRAL },
  ],
};

export const KNEE_EXTENSION_DEMO_PHASES = createDemoPhases(
  KNEE_EXTENSION_TARGET_DEG,
  KNEE_EXTENSION_LIMITED_DEG,
  'Knee Extension'
);

// ─── Personalized Correction Generator ────────────────────────────────────────

export function createPersonalizedKneeTimeline(patientPeakAngle: number): AnimationTimeline {
  const safePeak = Math.max(90, Math.min(168, Math.round(patientPeakAngle)));
  const kneeFlex = Math.round(180 - safePeak);

  const customLimitedPose: ReferencePose = {
    ...POSE_SEATED_NEUTRAL,
    rightKneeFlexion: kneeFlex,
    activeAngleDeg: safePeak,
  };

  const midAngle = Math.round(safePeak + (170 - safePeak) * 0.5);
  const midKneeFlex = Math.round(180 - midAngle);
  const customMidPose: ReferencePose = {
    ...POSE_SEATED_EXTENDED,
    rightKneeFlexion: midKneeFlex,
    activeAngleDeg: midAngle,
  };

  return {
    durationMs: 7500,
    keyframes: [
      { timeMs: 0, pose: customLimitedPose },
      { timeMs: 1600, pose: customLimitedPose },
      { timeMs: 4000, pose: customMidPose },
      { timeMs: 6000, pose: POSE_SEATED_EXTENDED },
      { timeMs: 7500, pose: POSE_SEATED_EXTENDED },
    ],
  };
}

import { getLandmarksForSide } from '../../biomechanics/sideLandmarks';

// ─── Biomechanical Metric Calculation ─────────────────────────────────────────

/**
 * Calculate knee extension angle in degrees from Hip, Knee, and Ankle landmarks for selected side.
 * Returns angle in [0, 180] where 180° is fully straight and 90° is bent sitting.
 */
export function calculateKneeExtension(
  landmarks: Landmark3D[],
  side: 'left' | 'right' | 'bilateral' = 'right'
): number | null {
  const { hip, knee, ankle } = getLandmarksForSide(landmarks, side);

  if (!hip || !knee || !ankle) return null;
  if ((hip.visibility ?? 1) < 0.35 || (knee.visibility ?? 1) < 0.35 || (ankle.visibility ?? 1) < 0.35) {
    return null;
  }

  // Vector Knee -> Hip
  const v1x = hip.x - knee.x;
  const v1y = hip.y - knee.y;
  const v1z = (hip.z ?? 0) - (knee.z ?? 0);

  // Vector Knee -> Ankle
  const v2x = ankle.x - knee.x;
  const v2y = ankle.y - knee.y;
  const v2z = (ankle.z ?? 0) - (knee.z ?? 0);

  const dot = v1x * v2x + v1y * v2y + v1z * v2z;
  const mag1 = Math.sqrt(v1x * v1x + v1y * v1y + v1z * v1z);
  const mag2 = Math.sqrt(v2x * v2x + v2y * v2y + v2z * v2z);

  if (mag1 < 1e-4 || mag2 < 1e-4) return null;

  const cosTheta = clamp(dot / (mag1 * mag2), -1, 1);
  const deg = Math.acos(cosTheta) * (180 / Math.PI);

  return Math.round(clamp(deg, 45, 180));
}

// ─── State Machine ────────────────────────────────────────────────────────────

export function detectKneeExtensionState(
  currentAngle: number | null,
  prevAngle: number | null,
  currentState: MovementState,
  peakAngle: number
): MovementState {
  if (currentAngle === null) return 'WAITING';

  const startThreshold = 105; // Sitting resting position <= 105°
  const targetThreshold = 160; // Near target extension >= 160°

  switch (currentState) {
    case 'WAITING':
      return currentAngle <= startThreshold ? 'READY' : 'LIFTING';

    case 'READY':
      if (currentAngle > startThreshold + 8) return 'LIFTING';
      return 'READY';

    case 'LIFTING':
      if (currentAngle >= targetThreshold) return 'AT_TARGET';
      if (prevAngle !== null && currentAngle < peakAngle - 10) return 'RETURNING';
      return 'LIFTING';

    case 'AT_TARGET':
      if (currentAngle < targetThreshold - 8) return 'RETURNING';
      return 'AT_TARGET';

    case 'RETURNING':
      if (currentAngle <= startThreshold) return 'READY';
      if (prevAngle !== null && currentAngle > prevAngle + 6) return 'LIFTING';
      return 'RETURNING';

    case 'LOW_RANGE':
      if (currentAngle <= startThreshold) return 'READY';
      return 'LOW_RANGE';

    default:
      return 'READY';
  }
}

// ─── Advisory Feedback ────────────────────────────────────────────────────────

export function getKneeExtensionFeedback(
  state: MovementState,
  _angle: number | null,
  peakAngle: number | null
): string {
  switch (state) {
    case 'WAITING':
      return 'Position camera seated with your right hip, knee, and ankle in view.';
    case 'READY':
      return 'Ready — slowly straighten your right knee forward.';
    case 'LIFTING':
      return 'Continue extending the knee toward the target range (170°).';
    case 'AT_TARGET':
      return 'Target extension reached! Hold briefly and return with control.';
    case 'RETURNING':
      return 'Slowly return to the bent knee starting position.';
    case 'LOW_RANGE':
      return `Detected range below reference (${Math.round(peakAngle ?? 125)}° / 170°). Practice controlled extension.`;
    default:
      return 'Perform controlled knee extensions in a seated position.';
  }
}

// ─── Live Camera Guide Generator ──────────────────────────────────────────────

export function getKneeExtensionLiveGuide(
  landmarks: Landmark3D[],
  canvasWidth: number,
  canvasHeight: number,
  side: 'left' | 'right' | 'bilateral' = 'right'
): LiveGuideOverlay | null {
  const { hip, knee } = getLandmarksForSide(landmarks, side);
  if (!hip || !knee) return null;

  const kneeX = knee.x * canvasWidth;
  const kneeY = knee.y * canvasHeight;
  const hipX = hip.x * canvasWidth;
  const hipY = hip.y * canvasHeight;

  // Thigh vector
  const dx = kneeX - hipX;
  const dy = kneeY - hipY;
  const thighLen = Math.sqrt(dx * dx + dy * dy) || 1;

  // Target 170° extension line straight forward from knee
  const shinLen = thighLen * 0.95;
  const thighAngle = Math.atan2(dy, dx);
  // 170° extension relative to thigh line:
  const targetShinAngle = thighAngle + ((180 - 170) * Math.PI) / 180;

  return {
    start: { x: kneeX, y: kneeY },
    end: {
      x: kneeX + Math.cos(targetShinAngle) * shinLen,
      y: kneeY + Math.sin(targetShinAngle) * shinLen,
    },
    label: 'Target 170°',
    targetAngle: 170,
  };
}

// ─── Exported Exercise Definition ─────────────────────────────────────────────

export const kneeExtensionExercise: ExerciseDefinition = {
  id: 'knee_extension',
  name: 'Seated Knee Extension',
  category: 'Lower Body',
  bodyRegion: 'Knee / Lower Limb',
  description:
    'Seated extension of the knee joint to assess quadriceps mobility and joint extension range.',
  difficulty: 'beginner',
  side: 'right',

  // Exercise Classification Metadata
  laterality: 'left/right',
  supportedLateralities: ['left', 'right'],
  targetMetric: 'Tibiofemoral Extension Angle',
  unit: 'degrees',
  poseLandmarks: ['hip', 'knee', 'ankle'],
  analysisMode: 'kinematic_rom',
  referenceDataAvailable: false,
  sourceType: 'PHYSIOSIS PROTOTYPE EXERCISE',
  isDatasetBacked: false,
  liveAnalysisAvailable: true,
  analysisConfidence: 'HIGH',

  metricName: 'Knee Extension',
  plane: 'Sagittal Plane',

  targetAngle: KNEE_EXTENSION_TARGET_DEG,
  limitedAngle: KNEE_EXTENSION_LIMITED_DEG,
  startAngle: KNEE_EXTENSION_START_DEG,
  minValidAmplitude: 25,

  postureMode: 'seated',
  highlightJoint: 'knee',
  requiredLandmarks: ['right_hip', 'right_knee', 'right_ankle'],

  timeline: KNEE_EXTENSION_TIMELINE,
  demoPhases: KNEE_EXTENSION_DEMO_PHASES,
  createPersonalizedTimeline: createPersonalizedKneeTimeline,

  calculateMetric: calculateKneeExtension,
  detectState: detectKneeExtensionState,
  getFeedback: getKneeExtensionFeedback,
  getLiveGuide: getKneeExtensionLiveGuide,
};
