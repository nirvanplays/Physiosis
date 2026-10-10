/**
 * isometricSideBending.ts
 * Verified Biomechanical Kinematics Pipeline for Isometric Side Bending (Frontal Plane).
 *
 * Measured Metric:
 *   Coronal lateral trunk flexion angle formed by the spinal vector (Mid-Hip -> Mid-Shoulder)
 *   relative to the vertical gravitational axis.
 */

import type { ReferencePose, AnimationTimeline, PhaseConfig } from '../PoseTypes';
import { createDemoPhases } from '../PoseTypes';
import type { ExerciseDefinition, Landmark3D, LiveGuideOverlay } from '../ExerciseTypes';
import type { MovementState } from '../../biomechanics/biomechanicsTypes';
import { clamp, lerp } from '../../../utils/math';

export const SIDE_BENDING_TARGET_DEG = 30;
export const SIDE_BENDING_LIMITED_DEG = 12;

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
  trunkSideFlexion: 30,
  headRotation: 4,
};

export const POSE_LIMITED_12: ReferencePose = {
  ...POSE_NEUTRAL,
  trunkSideFlexion: 12,
};

export const SIDE_BENDING_TIMELINE: AnimationTimeline = {
  durationMs: 16000,
  keyframes: [
    { timeMs: 0,     pose: POSE_NEUTRAL },
    { timeMs: 2000,  pose: POSE_FULL_TARGET },
    { timeMs: 3000,  pose: POSE_FULL_TARGET },
    { timeMs: 4000,  pose: POSE_NEUTRAL },

    { timeMs: 5800,  pose: POSE_LIMITED_12 },
    { timeMs: 7000,  pose: POSE_LIMITED_12 },
    { timeMs: 8000,  pose: POSE_LIMITED_12 },

    { timeMs: 9500,  pose: { ...POSE_NEUTRAL, trunkSideFlexion: 16 } },
    { timeMs: 11000, pose: { ...POSE_NEUTRAL, trunkSideFlexion: 22 } },
    { timeMs: 12500, pose: { ...POSE_NEUTRAL, trunkSideFlexion: 27 } },
    { timeMs: 13800, pose: POSE_FULL_TARGET },
    { timeMs: 14800, pose: POSE_FULL_TARGET },
    { timeMs: 16000, pose: POSE_NEUTRAL },
  ],
};

export const SIDE_BENDING_DEMO_PHASES: PhaseConfig[] = createDemoPhases(
  SIDE_BENDING_TARGET_DEG,
  SIDE_BENDING_LIMITED_DEG,
  'Lateral Flexion'
);

export function createPersonalizedSideBendingTimeline(patientPeakAngle: number): AnimationTimeline {
  const clampedPeak = clamp(patientPeakAngle, 8, SIDE_BENDING_TARGET_DEG);
  return {
    durationMs: 16000,
    keyframes: [
      { timeMs: 0,     pose: POSE_NEUTRAL },
      { timeMs: 2000,  pose: POSE_FULL_TARGET },
      { timeMs: 3000,  pose: POSE_FULL_TARGET },
      { timeMs: 4000,  pose: POSE_NEUTRAL },

      { timeMs: 5800,  pose: { ...POSE_NEUTRAL, trunkSideFlexion: clampedPeak } },
      { timeMs: 7000,  pose: { ...POSE_NEUTRAL, trunkSideFlexion: clampedPeak } },
      { timeMs: 8000,  pose: { ...POSE_NEUTRAL, trunkSideFlexion: clampedPeak } },

      { timeMs: 9500,  pose: { ...POSE_NEUTRAL, trunkSideFlexion: lerp(clampedPeak, SIDE_BENDING_TARGET_DEG, 0.35) } },
      { timeMs: 11000, pose: { ...POSE_NEUTRAL, trunkSideFlexion: lerp(clampedPeak, SIDE_BENDING_TARGET_DEG, 0.65) } },
      { timeMs: 12500, pose: { ...POSE_NEUTRAL, trunkSideFlexion: lerp(clampedPeak, SIDE_BENDING_TARGET_DEG, 0.85) } },
      { timeMs: 13800, pose: POSE_FULL_TARGET },
      { timeMs: 14800, pose: POSE_FULL_TARGET },
      { timeMs: 16000, pose: POSE_NEUTRAL },
    ],
  };
}

import { getLandmarksForSide } from '../../biomechanics/sideLandmarks';

// ─── Biomechanical Metric Calculator ───────────────────────────────────────────
export function calculateSideBendingMetric(
  landmarks: Landmark3D[],
  side: 'left' | 'right' | 'bilateral' = 'right'
): number | null {
  if (!landmarks || landmarks.length < 25) return null;

  const { leftShoulder, rightShoulder, leftHip, rightHip } = getLandmarksForSide(landmarks, side);

  if (!leftShoulder || !rightShoulder || !leftHip || !rightHip) return null;

  const midShoulderX = (leftShoulder.x + rightShoulder.x) / 2;
  const midShoulderY = (leftShoulder.y + rightShoulder.y) / 2;
  const midHipX = (leftHip.x + rightHip.x) / 2;
  const midHipY = (leftHip.y + rightHip.y) / 2;

  // Spinal vector from pelvis center to thoracic shoulder center
  const dx = midShoulderX - midHipX;
  const dy = midHipY - midShoulderY; // positive upward

  if (Math.abs(dy) < 0.05) return null;

  // Lateral angle from vertical in degrees
  const angleRad = Math.atan2(Math.abs(dx), dy);
  const angleDeg = (angleRad * 180) / Math.PI;

  return clamp(Math.round(angleDeg * 10) / 10, 0, 60);
}

// ─── State Detector ───────────────────────────────────────────────────────────
export function detectSideBendingState(
  currentAngle: number | null,
  prevAngle: number | null,
  currentState: MovementState,
  peakAngle: number
): MovementState {
  if (currentAngle === null) return 'WAITING';

  const START_THRESH = 6;
  const TARGET_THRESH = 22;

  if (currentState === 'WAITING') {
    return currentAngle < START_THRESH ? 'READY' : 'WAITING';
  }

  if (currentState === 'READY') {
    if (currentAngle > START_THRESH + 2) return 'LIFTING';
    return 'READY';
  }

  if (currentState === 'LIFTING') {
    if (currentAngle >= TARGET_THRESH) return 'AT_TARGET';
    if (prevAngle !== null && currentAngle < prevAngle - 3 && currentAngle < peakAngle - 5) {
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
    if (prevAngle !== null && currentAngle > prevAngle + 4 && currentAngle > START_THRESH + 4) {
      return 'LIFTING';
    }
    return 'RETURNING';
  }

  return currentState;
}

// ─── Form Feedback ─────────────────────────────────────────────────────────────
export function getSideBendingFeedback(
  state: MovementState,
  angle: number | null,
  peakAngle: number | null
): string {
  if (state === 'WAITING' || angle === null) {
    return 'Stand straight facing the camera with your feet shoulder-width apart.';
  }
  if (state === 'READY') {
    if (peakAngle && peakAngle >= 22) {
      return 'Great lateral flexion repetition! Ready for the next hold.';
    }
    return 'Gently bend your torso to the side without rotating your hips.';
  }
  if (state === 'LIFTING') {
    return 'Bending laterally. Keep both feet firmly planted.';
  }
  if (state === 'AT_TARGET') {
    return 'Holding target lateral flexion angle. Maintain smooth isometric tension.';
  }
  if (state === 'RETURNING') {
    return 'Return smoothly to the upright vertical posture.';
  }
  return 'Maintain controlled coronal spine alignment.';
}

// ─── Live Camera Guide ─────────────────────────────────────────────────────────
export function getSideBendingLiveGuide(
  landmarks: Landmark3D[],
  canvasWidth: number,
  canvasHeight: number,
  side: 'left' | 'right' | 'bilateral' = 'right'
): LiveGuideOverlay | null {
  const { leftHip, rightHip } = getLandmarksForSide(landmarks, side);
  if (!leftHip || !rightHip) return null;

  const hx = ((leftHip.x + rightHip.x) / 2) * canvasWidth;
  const hy = ((leftHip.y + rightHip.y) / 2) * canvasHeight;

  // Guide ray tilted at target 30 deg
  const length = 140;
  const rad = (SIDE_BENDING_TARGET_DEG * Math.PI) / 180;
  const dir = side === 'left' ? -1 : 1;
  const ex = hx + dir * Math.sin(rad) * length;
  const ey = hy - Math.cos(rad) * length;

  return {
    start: { x: hx, y: hy },
    end: { x: ex, y: ey },
    label: `Target ${SIDE_BENDING_TARGET_DEG}°`,
    targetAngle: SIDE_BENDING_TARGET_DEG,
  };
}

// ─── Exported Exercise Definition ─────────────────────────────────────────────
export const isometricSideBendingExercise: ExerciseDefinition = {
  id: 'isometric_side_bending',
  name: 'Isometric Side Bending',
  category: 'Spinal / Trunk Stability',
  bodyRegion: 'Spine / Neck',
  description:
    'Static lateral trunk flexion hold assessing lateral spinal stabilizer compliance and abdominal oblique isometric endurance.',
  difficulty: 'intermediate',
  side: 'right',

  laterality: 'left/right',
  supportedLateralities: ['left', 'right'],
  targetMetric: 'Lateral Trunk Flexion Angle',
  unit: 'degrees',
  poseLandmarks: ['left_shoulder', 'right_shoulder', 'left_hip', 'right_hip'],
  analysisMode: 'isometric_stability',
  referenceDataAvailable: true,
  sourceType: 'DATASET-BACKED EXERCISE',
  isDatasetBacked: true,
  liveAnalysisAvailable: true,
  analysisConfidence: 'HIGH',

  metricName: 'Lateral Trunk Angle',
  plane: 'Frontal Plane',

  targetAngle: SIDE_BENDING_TARGET_DEG,
  limitedAngle: SIDE_BENDING_LIMITED_DEG,
  startAngle: 0,
  minValidAmplitude: 8,

  postureMode: 'standing',
  highlightJoint: 'spine',
  requiredLandmarks: ['left_shoulder', 'right_shoulder', 'left_hip', 'right_hip'],

  timeline: SIDE_BENDING_TIMELINE,
  demoPhases: SIDE_BENDING_DEMO_PHASES,
  createPersonalizedTimeline: createPersonalizedSideBendingTimeline,

  calculateMetric: calculateSideBendingMetric,
  detectState: detectSideBendingState,
  getFeedback: getSideBendingFeedback,
  getLiveGuide: getSideBendingLiveGuide,
};
