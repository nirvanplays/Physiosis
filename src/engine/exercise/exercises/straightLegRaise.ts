/**
 * straightLegRaise.ts
 * Exercise Definition and 16-Second Demonstration Timeline for Straight-Leg Raise.
 *
 * Primary metric: Leg elevation angle (degrees).
 * Primary landmarks: Right Shoulder (12), Right Hip (24), Right Knee (26), Right Ankle (28).
 * Target: 45° (prototype reference target).
 * Limitation: 20° (restricted elevation).
 * Posture: Supine (lying).
 */

import type { ReferencePose, AnimationTimeline } from '../PoseTypes';
import { createDemoPhases } from '../PoseTypes';
import type { ExerciseDefinition, Landmark3D, LiveGuideOverlay } from '../ExerciseTypes';
import type { MovementState } from '../../biomechanics/biomechanicsTypes';
import { clamp } from '../../../utils/math';

export const STRAIGHT_LEG_RAISE_TARGET_DEG = 45;
export const STRAIGHT_LEG_RAISE_LIMITED_DEG = 20;
export const STRAIGHT_LEG_RAISE_START_DEG = 0;

// ─── Supine Keyframe Poses ───────────────────────────────────────────────────

/** Supine resting posture with leg flat at 0°. */
export const POSE_SUPINE_NEUTRAL: ReferencePose = {
  postureMode: 'supine',
  activeAngleDeg: 0,

  trunkLean: 0,
  trunkSideFlexion: 0,

  rightShoulderFlexion: 0,
  rightShoulderAbduction: 0,
  rightElbowFlexion: 10,

  leftShoulderFlexion: 0,
  leftShoulderAbduction: 0,
  leftElbowFlexion: 10,

  rightHipFlexion: 0, // leg resting flat on floor
  rightKneeFlexion: 2, // extended leg
  leftHipFlexion: 0,
  leftKneeFlexion: 2,

  headFlexion: 0,
  headRotation: 0,

  rightShoulderElevation: 0,
  leftShoulderElevation: 0,
};

/** Full 45° target leg elevation posture. */
export const POSE_SUPINE_ELEVATED: ReferencePose = {
  postureMode: 'supine',
  activeAngleDeg: 45,

  trunkLean: 0,
  trunkSideFlexion: 0,

  rightShoulderFlexion: 0,
  rightShoulderAbduction: 0,
  rightElbowFlexion: 10,

  leftShoulderFlexion: 0,
  leftShoulderAbduction: 0,
  leftElbowFlexion: 10,

  rightHipFlexion: 45, // elevated 45°
  rightKneeFlexion: 3, // knee kept straight
  leftHipFlexion: 0,
  leftKneeFlexion: 2,

  headFlexion: 1,
  headRotation: 0,

  rightShoulderElevation: 0,
  leftShoulderElevation: 0,
};

/** Limited 20° leg elevation posture. */
export const POSE_SUPINE_LIMITED: ReferencePose = {
  postureMode: 'supine',
  activeAngleDeg: 20,

  trunkLean: 0,
  trunkSideFlexion: 0,

  rightShoulderFlexion: 0,
  rightShoulderAbduction: 0,
  rightElbowFlexion: 10,

  leftShoulderFlexion: 0,
  leftShoulderAbduction: 0,
  leftElbowFlexion: 10,

  rightHipFlexion: 20, // elevated only 20°
  rightKneeFlexion: 4,
  leftHipFlexion: 0,
  leftKneeFlexion: 2,

  headFlexion: 1,
  headRotation: 0,

  rightShoulderElevation: 0,
  leftShoulderElevation: 0,
};

// ─── 16-Second Master Timeline ────────────────────────────────────────────────

export const STRAIGHT_LEG_RAISE_TIMELINE: AnimationTimeline = {
  durationMs: 16000,
  keyframes: [
    // 0.0s – 4.0s: REFERENCE (0° → 45° → 0°)
    { timeMs: 0, pose: POSE_SUPINE_NEUTRAL },
    { timeMs: 1600, pose: POSE_SUPINE_ELEVATED },
    { timeMs: 2500, pose: POSE_SUPINE_ELEVATED },
    { timeMs: 4000, pose: POSE_SUPINE_NEUTRAL },

    // 4.0s – 8.0s: LIMITATION (0° → 20° hold)
    { timeMs: 4050, pose: POSE_SUPINE_NEUTRAL },
    { timeMs: 5500, pose: POSE_SUPINE_LIMITED },
    { timeMs: 7200, pose: POSE_SUPINE_LIMITED },
    { timeMs: 8000, pose: POSE_SUPINE_LIMITED },

    // 8.0s – 13.0s: GUIDED CORRECTION (20° → 28° → 35° → 45°)
    { timeMs: 8100, pose: POSE_SUPINE_LIMITED },
    {
      timeMs: 9600,
      pose: { ...POSE_SUPINE_ELEVATED, rightHipFlexion: 28, activeAngleDeg: 28 },
    },
    {
      timeMs: 11200,
      pose: { ...POSE_SUPINE_ELEVATED, rightHipFlexion: 36, activeAngleDeg: 36 },
    },
    { timeMs: 13000, pose: POSE_SUPINE_ELEVATED },

    // 13.0s – 16.0s: IMPROVED (45° hold → return)
    { timeMs: 14200, pose: POSE_SUPINE_ELEVATED },
    { timeMs: 15900, pose: POSE_SUPINE_NEUTRAL },
    { timeMs: 16000, pose: POSE_SUPINE_NEUTRAL },
  ],
};

export const STRAIGHT_LEG_RAISE_DEMO_PHASES = createDemoPhases(
  STRAIGHT_LEG_RAISE_TARGET_DEG,
  STRAIGHT_LEG_RAISE_LIMITED_DEG,
  'Straight-Leg Raise'
);

// ─── Personalized Correction Generator ────────────────────────────────────────

export function createPersonalizedLegRaiseTimeline(patientPeakAngle: number): AnimationTimeline {
  const safePeak = Math.max(8, Math.min(44, Math.round(patientPeakAngle)));

  const customLimitedPose: ReferencePose = {
    ...POSE_SUPINE_NEUTRAL,
    rightHipFlexion: safePeak,
    activeAngleDeg: safePeak,
  };

  const midAngle = Math.round(safePeak + (45 - safePeak) * 0.5);
  const customMidPose: ReferencePose = {
    ...POSE_SUPINE_ELEVATED,
    rightHipFlexion: midAngle,
    activeAngleDeg: midAngle,
  };

  return {
    durationMs: 7500,
    keyframes: [
      { timeMs: 0, pose: customLimitedPose },
      { timeMs: 1600, pose: customLimitedPose },
      { timeMs: 4000, pose: customMidPose },
      { timeMs: 6000, pose: POSE_SUPINE_ELEVATED },
      { timeMs: 7500, pose: POSE_SUPINE_ELEVATED },
    ],
  };
}

import { getLandmarksForSide } from '../../biomechanics/sideLandmarks';

// ─── Biomechanical Metric Calculation ─────────────────────────────────────────

/**
 * Calculate straight-leg raise elevation angle (degrees) relative to torso axis for selected side.
 * Uses Shoulder, Hip, Knee, and Ankle landmarks.
 */
export function calculateStraightLegRaise(
  landmarks: Landmark3D[],
  side: 'left' | 'right' | 'bilateral' = 'right'
): number | null {
  const { shoulder, hip, ankle, knee } = getLandmarksForSide(landmarks, side);
  const distalAnkle = ankle ?? knee;

  if (!hip || !distalAnkle) return null;
  if ((hip.visibility ?? 1) < 0.35 || (distalAnkle.visibility ?? 1) < 0.35) {
    return null;
  }

  // Torso vector (Shoulder to Hip) or horizontal ground fallback
  let torsoDx = 1;
  let torsoDy = 0;
  if (shoulder && (shoulder.visibility ?? 1) >= 0.35) {
    torsoDx = hip.x - shoulder.x;
    torsoDy = hip.y - shoulder.y;
  }

  // Leg vector (Hip to Ankle)
  const legDx = distalAnkle.x - hip.x;
  const legDy = distalAnkle.y - hip.y;

  const torsoMag = Math.sqrt(torsoDx * torsoDx + torsoDy * torsoDy) || 1;
  const legMag = Math.sqrt(legDx * legDx + legDy * legDy) || 1;

  // Dot product
  const dot = torsoDx * legDx + torsoDy * legDy;
  const cosTheta = clamp(dot / (torsoMag * legMag), -1, 1);
  const includedDeg = Math.acos(cosTheta) * (180 / Math.PI);

  // Elevation from straight line:
  const elevation = clamp(Math.round(includedDeg), 0, 90);

  return elevation;
}

// ─── State Machine ────────────────────────────────────────────────────────────

export function detectStraightLegRaiseState(
  currentAngle: number | null,
  prevAngle: number | null,
  currentState: MovementState,
  peakAngle: number
): MovementState {
  if (currentAngle === null) return 'WAITING';

  const startThreshold = 8;  // Resting flat <= 8°
  const targetThreshold = 40; // Target reached >= 40°

  switch (currentState) {
    case 'WAITING':
      return currentAngle <= startThreshold ? 'READY' : 'LIFTING';

    case 'READY':
      if (currentAngle > startThreshold + 4) return 'LIFTING';
      return 'READY';

    case 'LIFTING':
      if (currentAngle >= targetThreshold) return 'AT_TARGET';
      if (prevAngle !== null && currentAngle < peakAngle - 5) return 'RETURNING';
      return 'LIFTING';

    case 'AT_TARGET':
      if (currentAngle < targetThreshold - 4) return 'RETURNING';
      return 'AT_TARGET';

    case 'RETURNING':
      if (currentAngle <= startThreshold) return 'READY';
      if (prevAngle !== null && currentAngle > prevAngle + 3) return 'LIFTING';
      return 'RETURNING';

    case 'LOW_RANGE':
      if (currentAngle <= startThreshold) return 'READY';
      return 'LOW_RANGE';

    default:
      return 'READY';
  }
}

// ─── Advisory Feedback ────────────────────────────────────────────────────────

export function getStraightLegRaiseFeedback(
  state: MovementState,
  _angle: number | null,
  peakAngle: number | null
): string {
  switch (state) {
    case 'WAITING':
      return 'Position camera to view right hip, knee, and ankle lying supine.';
    case 'READY':
      return 'Ready — slowly elevate your straight right leg upward.';
    case 'LIFTING':
      return 'Continue lifting the leg toward the reference position (45°).';
    case 'AT_TARGET':
      return 'Reference elevation reached! Hold briefly and lower with control.';
    case 'RETURNING':
      return 'Lowering leg back to the starting resting position...';
    case 'LOW_RANGE':
      return `Detected range below reference (${Math.round(peakAngle ?? 20)}° / 45°). Practice controlled elevation.`;
    default:
      return 'Perform controlled straight-leg raises in a supine position.';
  }
}

// ─── Live Camera Guide Generator ──────────────────────────────────────────────

export function getStraightLegRaiseLiveGuide(
  landmarks: Landmark3D[],
  canvasWidth: number,
  canvasHeight: number,
  side: 'left' | 'right' | 'bilateral' = 'right'
): LiveGuideOverlay | null {
  const { hip, shoulder } = getLandmarksForSide(landmarks, side);
  if (!hip) return null;

  const hipX = hip.x * canvasWidth;
  const hipY = hip.y * canvasHeight;

  let legLen = canvasHeight * 0.45;
  let torsoAngle = 0;
  if (shoulder) {
    const sX = shoulder.x * canvasWidth;
    const sY = shoulder.y * canvasHeight;
    torsoAngle = Math.atan2(hipY - sY, hipX - sX);
  }

  // 45° elevation upward relative to torso axis
  const targetLegAngle = torsoAngle - (45 * Math.PI) / 180;

  return {
    start: { x: hipX, y: hipY },
    end: {
      x: hipX + Math.cos(targetLegAngle) * legLen,
      y: hipY + Math.sin(targetLegAngle) * legLen,
    },
    label: 'Target 45°',
    targetAngle: 45,
  };
}

// ─── Exported Exercise Definition ─────────────────────────────────────────────

export const straightLegRaiseExercise: ExerciseDefinition = {
  id: 'straight_leg_raise',
  name: 'Straight-Leg Raise',
  category: 'Lower Body',
  bodyRegion: 'Knee / Lower Limb',
  description:
    'Supine elevation of the extended leg to assess hip flexor control and active hamstring range of motion.',
  difficulty: 'intermediate',
  side: 'right',

  // Exercise Classification Metadata
  laterality: 'left/right',
  supportedLateralities: ['left', 'right'],
  targetMetric: 'Acetabulofemoral Flexion Angle',
  unit: 'degrees',
  poseLandmarks: ['shoulder', 'hip', 'knee', 'ankle'],
  analysisMode: 'kinematic_rom',
  referenceDataAvailable: false,
  sourceType: 'PHYSIOSIS PROTOTYPE EXERCISE',
  isDatasetBacked: false,
  liveAnalysisAvailable: true,
  analysisConfidence: 'HIGH',

  metricName: 'Leg Elevation',
  plane: 'Sagittal Plane',

  targetAngle: STRAIGHT_LEG_RAISE_TARGET_DEG,
  limitedAngle: STRAIGHT_LEG_RAISE_LIMITED_DEG,
  startAngle: STRAIGHT_LEG_RAISE_START_DEG,
  minValidAmplitude: 10,

  postureMode: 'supine',
  highlightJoint: 'hip',
  requiredLandmarks: ['right_shoulder', 'right_hip', 'right_knee', 'right_ankle'],

  timeline: STRAIGHT_LEG_RAISE_TIMELINE,
  demoPhases: STRAIGHT_LEG_RAISE_DEMO_PHASES,
  createPersonalizedTimeline: createPersonalizedLegRaiseTimeline,

  calculateMetric: calculateStraightLegRaise,
  detectState: detectStraightLegRaiseState,
  getFeedback: getStraightLegRaiseFeedback,
  getLiveGuide: getStraightLegRaiseLiveGuide,
};
