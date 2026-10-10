/**
 * shoulderFlexion.ts  (exercises/shoulderFlexion.ts)
 * 16-Second Master SIH Demonstration Timeline for Shoulder Flexion:
 *
 *   0.0s – 4.0s:  REFERENCE
 *     Arm moves from 0° → 165° → hold → 0° (ideal therapeutic form)
 *
 *   4.0s – 8.0s:  DETECTED LIMITATION
 *     Arm moves from 0° → 62° restricted elevation and holds (with amber shoulder warning)
 *
 *   8.0s – 13.0s: GUIDED CORRECTION
 *     Arm transitions smoothly from 62° → 78° → 98° → 120° → 140° → 155° → 165°
 *
 *   13.0s – 16.0s: IMPROVED
 *     Arm holds at full 165° target with success state, then smoothly returns to 0°
 *     to seamlessly repeat the loop.
 */

import type { ReferencePose, AnimationTimeline } from '../PoseTypes';
import type { MovementState } from '../../biomechanics/biomechanicsTypes';
import { clamp } from '../../../utils/math';

// ─── Keyframe Poses ───────────────────────────────────────────────────────────

/** Neutral resting standing posture. */
export const POSE_NEUTRAL: ReferencePose = {
  trunkLean:              0,
  trunkSideFlexion:       0,

  rightShoulderFlexion:   2,   // relaxed hanging position
  rightShoulderAbduction: 0,
  rightElbowFlexion:      14,  // natural resting flex

  leftShoulderFlexion:   -6,   // arm relaxed slightly behind
  leftShoulderAbduction:  0,
  leftElbowFlexion:       18,

  rightHipFlexion:        0,
  rightKneeFlexion:       4,
  leftHipFlexion:         0,
  leftKneeFlexion:        4,

  headFlexion:            0,
  headRotation:           0,

  rightShoulderElevation: 0,
  leftShoulderElevation:  0,
};

/** Full 165° target elevation with natural secondary mechanics. */
export const POSE_FULL_TARGET: ReferencePose = {
  trunkLean:             -2.5,  // slight backward counter-lean
  trunkSideFlexion:       1.8,  // weight shift toward right

  rightShoulderFlexion:  165,
  rightShoulderAbduction: 4,
  rightElbowFlexion:      8,

  leftShoulderFlexion:   -4,
  leftShoulderAbduction:  1,
  leftElbowFlexion:       22,

  rightHipFlexion:        2,
  rightKneeFlexion:       3,
  leftHipFlexion:        -1,
  leftKneeFlexion:        5,

  headFlexion:            3,
  headRotation:           1.5,

  rightShoulderElevation: 9,
  leftShoulderElevation:  1,
};

/** Micro-settled hold at 163°. */
export const POSE_FULL_HOLD: ReferencePose = {
  ...POSE_FULL_TARGET,
  rightShoulderFlexion:  163,
  rightElbowFlexion:      10,
  trunkLean:             -2.2,
  headFlexion:            2.8,
};

/** Intermediate return pose. */
export const POSE_RETURN_TRANSITION: ReferencePose = {
  ...POSE_NEUTRAL,
  trunkLean:              0.5,
  trunkSideFlexion:       0.4,
  rightShoulderElevation: 1,
  rightElbowFlexion:      16,
};

/**
 * Restricted Limitation Pose:
 * Peak flexion is only 62° (insufficient elevation, slight compensatory shoulder tension).
 */
export const POSE_LIMITED_62: ReferencePose = {
  trunkLean:             -0.8,
  trunkSideFlexion:       0.5,

  rightShoulderFlexion:   62,   // restricted peak
  rightShoulderAbduction: 2,
  rightElbowFlexion:      14,

  leftShoulderFlexion:   -5,
  leftShoulderAbduction:  0,
  leftElbowFlexion:       18,

  rightHipFlexion:        0.5,
  rightKneeFlexion:       4,
  leftHipFlexion:         0,
  leftKneeFlexion:        4,

  headFlexion:            0.5,
  headRotation:           0.5,

  rightShoulderElevation: 4,   // mild compensatory tension
  leftShoulderElevation:  0,
};

/** Mid-way correction pose at ~98°. */
export const POSE_CORRECTION_MID_98: ReferencePose = {
  trunkLean:             -1.4,
  trunkSideFlexion:       0.9,

  rightShoulderFlexion:   98,
  rightShoulderAbduction: 2.8,
  rightElbowFlexion:      12,

  leftShoulderFlexion:   -4.5,
  leftShoulderAbduction:  0.5,
  leftElbowFlexion:       19,

  rightHipFlexion:        1.0,
  rightKneeFlexion:       3.5,
  leftHipFlexion:        -0.5,
  leftKneeFlexion:        4.5,

  headFlexion:            1.4,
  headRotation:           0.9,

  rightShoulderElevation: 6,
  leftShoulderElevation:  0.5,
};

/** High correction pose at ~138°. */
export const POSE_CORRECTION_HIGH_138: ReferencePose = {
  trunkLean:             -2.0,
  trunkSideFlexion:       1.4,

  rightShoulderFlexion:  138,
  rightShoulderAbduction: 3.5,
  rightElbowFlexion:      9.5,

  leftShoulderFlexion:   -4.2,
  leftShoulderAbduction:  0.8,
  leftElbowFlexion:       20.5,

  rightHipFlexion:        1.6,
  rightKneeFlexion:       3.2,
  leftHipFlexion:        -0.8,
  leftKneeFlexion:        4.8,

  headFlexion:            2.2,
  headRotation:           1.2,

  rightShoulderElevation: 7.8,
  leftShoulderElevation:  0.8,
};

// ─── Complete 16-Second Master Timeline ───────────────────────────────────────

export const SHOULDER_FLEXION_TIMELINE: AnimationTimeline = {
  durationMs: 16000,
  keyframes: [
    // ── Phase 1: REFERENCE (0s – 4s) ──────────────────────────────────────────
    { timeMs:     0, pose: POSE_NEUTRAL },
    { timeMs:   400, pose: POSE_NEUTRAL },
    { timeMs:  1800, pose: POSE_FULL_TARGET },    // reaches 165°
    { timeMs:  2500, pose: POSE_FULL_HOLD },      // holds
    { timeMs:  3600, pose: POSE_RETURN_TRANSITION },// returns
    { timeMs:  4000, pose: POSE_NEUTRAL },        // back to 0°

    // ── Phase 2: DETECTED LIMITATION (4s – 8s) ────────────────────────────────
    { timeMs:  4300, pose: POSE_NEUTRAL },
    { timeMs:  5700, pose: POSE_LIMITED_62 },     // rises only to 62°
    { timeMs:  7200, pose: POSE_LIMITED_62 },     // holds at 62° to show limitation
    { timeMs:  8000, pose: POSE_LIMITED_62 },     // seamlessly ready for correction

    // ── Phase 3: GUIDED CORRECTION (8s – 13s) ─────────────────────────────────
    // Smooth, human progression from 62° → 98° → 138° → 165°
    { timeMs:  9400, pose: POSE_CORRECTION_MID_98 },
    { timeMs: 11000, pose: POSE_CORRECTION_HIGH_138 },
    { timeMs: 12600, pose: POSE_FULL_TARGET },   // achieves 165°
    { timeMs: 13000, pose: POSE_FULL_TARGET },

    // ── Phase 4: IMPROVED (13s – 16s) ─────────────────────────────────────────
    { timeMs: 14200, pose: POSE_FULL_HOLD },     // holds with success state
    { timeMs: 15400, pose: POSE_RETURN_TRANSITION },// smooth descent
    { timeMs: 16000, pose: POSE_NEUTRAL },       // matches 0ms for seamless loop
  ],
};

export const SHOULDER_FLEXION_TARGET_DEG = 165;
export const SHOULDER_FLEXION_LIMITED_DEG = 62;

/**
 * Generate a personalized correction animation timeline tailored to
 * a patient's actual achieved peak ROM.
 *
 * @param patientPeakAngle The patient's actual measured peak angle (e.g. 78°, 112°, 62°).
 */
export function createPersonalizedCorrectionTimeline(patientPeakAngle: number): AnimationTimeline {
  const safePeak = Math.max(15, Math.min(150, Math.round(patientPeakAngle)));
  const customLimitedPose: ReferencePose = {
    ...POSE_NEUTRAL,
    rightShoulderFlexion: safePeak,
    rightShoulderElevation: Math.round(clamp((165 - safePeak) / 165, 0, 1) * 7),
    rightElbowFlexion: 13,
    activeAngleDeg: safePeak,
  };

  const midAngle = Math.round(safePeak + (165 - safePeak) * 0.45);
  const customMidPose: ReferencePose = {
    ...POSE_FULL_TARGET,
    rightShoulderFlexion: midAngle,
    rightElbowFlexion: 10,
    activeAngleDeg: midAngle,
  };

  return {
    durationMs: 7500,
    keyframes: [
      { timeMs: 0, pose: customLimitedPose },
      { timeMs: 1600, pose: customLimitedPose }, // hold at patient's actual achieved peak
      { timeMs: 4000, pose: customMidPose },     // continuous guided elevation
      { timeMs: 6000, pose: POSE_FULL_TARGET },  // achieves 165° target
      { timeMs: 7500, pose: POSE_FULL_HOLD },    // holds target confirmation
    ],
  };
}

import { getLandmarksForSide } from '../../biomechanics/sideLandmarks';

// ─── Biomechanical Metric Calculation & State Logic ──────────────────────────

export function calculateShoulderFlexionMetric(
  landmarks: Landmark3D[],
  side: 'left' | 'right' | 'bilateral' = 'right'
): number | null {
  const { shoulder, elbow, wrist, hip } = getLandmarksForSide(landmarks, side);

  if (!shoulder || !hip) return null;
  if ((shoulder.visibility ?? 1) < 0.35 || (hip.visibility ?? 1) < 0.35) return null;

  const distal = (wrist && (wrist.visibility ?? 1) >= 0.35) ? wrist : elbow;
  if (!distal || (distal.visibility ?? 1) < 0.35) return null;

  // Torso vector (Shoulder - Hip, points up)
  const torsoDx = shoulder.x - hip.x;
  const torsoDy = shoulder.y - hip.y;

  // Arm vector (Distal - Shoulder)
  const armDx = distal.x - shoulder.x;
  const armDy = distal.y - shoulder.y;

  const torsoMag = Math.sqrt(torsoDx * torsoDx + torsoDy * torsoDy) || 1;
  const armMag = Math.sqrt(armDx * armDx + armDy * armDy) || 1;

  const dot = torsoDx * armDx + torsoDy * armDy;
  const cosTheta = clamp(dot / (torsoMag * armMag), -1, 1);
  const includedDeg = Math.acos(cosTheta) * (180 / Math.PI);

  const flexion = clamp(Math.round(180 - includedDeg), 0, 180);
  return flexion;
}

export function detectShoulderFlexionState(
  currentAngle: number | null,
  prevAngle: number | null,
  currentState: MovementState,
  peakAngle: number
): MovementState {
  if (currentAngle === null) return 'WAITING';

  const startThreshold = 20;
  const targetThreshold = 150;

  switch (currentState) {
    case 'WAITING':
      return currentAngle <= startThreshold ? 'READY' : 'LIFTING';

    case 'READY':
      if (currentAngle > startThreshold + 6) return 'LIFTING';
      return 'READY';

    case 'LIFTING':
      if (currentAngle >= targetThreshold) return 'AT_TARGET';
      if (prevAngle !== null && currentAngle < peakAngle - 12) return 'RETURNING';
      return 'LIFTING';

    case 'AT_TARGET':
      if (currentAngle < targetThreshold - 10) return 'RETURNING';
      return 'AT_TARGET';

    case 'RETURNING':
      if (currentAngle <= startThreshold) return 'READY';
      if (prevAngle !== null && currentAngle > prevAngle + 8) return 'LIFTING';
      return 'RETURNING';

    case 'LOW_RANGE':
      if (currentAngle <= startThreshold) return 'READY';
      return 'LOW_RANGE';

    default:
      return 'READY';
  }
}

export function getShoulderFlexionFeedback(
  state: MovementState,
  angle: number | null,
  peakAngle: number | null
): string {
  switch (state) {
    case 'WAITING':
      return 'Move into view so your right shoulder, elbow, wrist and hip are visible.';
    case 'READY':
      return 'Starting position detected. Begin lifting your arm forward.';
    case 'LIFTING':
      return angle !== null && angle >= 135
        ? 'Approaching target range (165°).'
        : 'Continue lifting toward the target range.';
    case 'AT_TARGET':
      return 'Target range reached. Lower your arm smoothly.';
    case 'RETURNING':
      return 'Controlled return to starting position.';
    case 'LOW_RANGE':
      return `Detected limited range of motion (${Math.round(peakAngle ?? 62)}° / 165°). Try reaching a bit higher next time.`;
    default:
      return 'Perform controlled forward arm elevations.';
  }
}

export function getShoulderFlexionLiveGuide(
  landmarks: Landmark3D[],
  canvasWidth: number,
  canvasHeight: number,
  side: 'left' | 'right' | 'bilateral' = 'right'
): LiveGuideOverlay | null {
  const { shoulder, hip } = getLandmarksForSide(landmarks, side);
  if (!shoulder || !hip) return null;

  const sX = shoulder.x * canvasWidth;
  const sY = shoulder.y * canvasHeight;
  const hX = hip.x * canvasWidth;
  const hY = hip.y * canvasHeight;

  const torsoDx = sX - hX;
  const torsoDy = sY - hY;
  const torsoAngle = Math.atan2(torsoDy, torsoDx);
  const armLen = canvasHeight * 0.32;

  // Target 165° elevation relative to hanging (180° - 165° = 15° forward of upright torso)
  const targetArmAngle = torsoAngle - (15 * Math.PI) / 180;

  return {
    start: { x: sX, y: sY },
    end: {
      x: sX + Math.cos(targetArmAngle) * armLen,
      y: sY + Math.sin(targetArmAngle) * armLen,
    },
    label: 'Target 165°',
    targetAngle: 165,
  };
}

// ─── Exported Exercise Definition ─────────────────────────────────────────────

import type { ExerciseDefinition, Landmark3D, LiveGuideOverlay } from '../ExerciseTypes';
import { DEMO_PHASES } from '../PoseTypes';

export const shoulderFlexionExercise: ExerciseDefinition = {
  id: 'shoulder_flexion',
  name: 'Shoulder Flexion',
  category: 'Upper Body',
  bodyRegion: 'Shoulder / Upper Limb',
  description:
    'Controlled forward elevation of the arm through the sagittal plane to assess shoulder range of motion.',
  difficulty: 'beginner',
  side: 'right',

  // Dataset Integration Metadata
  laterality: 'left/right',
  supportedLateralities: ['left', 'right'],
  targetMetric: 'Glenohumeral Flexion Angle',
  unit: 'degrees',
  poseLandmarks: ['hip', 'shoulder', 'elbow', 'wrist'],
  analysisMode: 'kinematic_rom',
  referenceDataAvailable: true,
  sourceType: 'DATASET-BACKED EXERCISE',
  isDatasetBacked: true,
  liveAnalysisAvailable: true,
  analysisConfidence: 'HIGH',

  metricName: 'Shoulder Flexion',
  plane: 'Sagittal Plane',

  targetAngle: SHOULDER_FLEXION_TARGET_DEG,
  limitedAngle: SHOULDER_FLEXION_LIMITED_DEG,
  startAngle: 0,
  minValidAmplitude: 20,

  postureMode: 'standing',
  highlightJoint: 'shoulder',
  requiredLandmarks: ['right_shoulder', 'right_elbow', 'right_wrist', 'right_hip'],

  timeline: SHOULDER_FLEXION_TIMELINE,
  demoPhases: DEMO_PHASES,
  createPersonalizedTimeline: createPersonalizedCorrectionTimeline,

  calculateMetric: calculateShoulderFlexionMetric,
  detectState: detectShoulderFlexionState,
  getFeedback: getShoulderFlexionFeedback,
  getLiveGuide: getShoulderFlexionLiveGuide,
};



