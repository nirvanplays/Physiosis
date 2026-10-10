/**
 * datasetExercises.ts
 * Exercise definitions for PHYSIO-DATASET benchmark protocols.
 *
 * Provides side-aware kinematic implementations where technically feasible (Arm Circumduction, Ankle Plantar Flexion)
 * and honest "REFERENCE DEMO ONLY" demarcations where sensors are physically insufficient (Ball Press, Wrist Extension Stretch).
 */

import type { AnimationTimeline, PhaseConfig, ReferencePose } from '../PoseTypes';
import { createDemoPhases } from '../PoseTypes';
import type { ExerciseDefinition, Landmark3D } from '../ExerciseTypes';
import type { MovementState } from '../../biomechanics/biomechanicsTypes';
import { getLandmarksForSide } from '../../biomechanics/sideLandmarks';
import { clamp, angleBetweenVectors } from '../../../utils/math';

// ── Neutral Baseline Posture Stub ───────────────────────────────────────────
const NEUTRAL_STANDING_POSE: ReferencePose = {
  postureMode: 'standing',
  activeAngleDeg: 0,
  trunkLean: 0,
  trunkSideFlexion: 0,
  rightShoulderFlexion: 0,
  rightShoulderAbduction: 5,
  rightElbowFlexion: 5,
  leftShoulderFlexion: 0,
  leftShoulderAbduction: 5,
  leftElbowFlexion: 5,
  rightHipFlexion: 0,
  rightKneeFlexion: 0,
  leftHipFlexion: 0,
  leftKneeFlexion: 0,
  headFlexion: 0,
  headRotation: 0,
  rightShoulderElevation: 0,
  leftShoulderElevation: 0,
};

const DEFAULT_TIMELINE: AnimationTimeline = {
  durationMs: 16000,
  keyframes: [
    { timeMs: 0, pose: NEUTRAL_STANDING_POSE },
    { timeMs: 4000, pose: NEUTRAL_STANDING_POSE },
    { timeMs: 8000, pose: NEUTRAL_STANDING_POSE },
    { timeMs: 12000, pose: NEUTRAL_STANDING_POSE },
    { timeMs: 16000, pose: NEUTRAL_STANDING_POSE },
  ],
};

const DEFAULT_DEMO_PHASES: PhaseConfig[] = createDemoPhases(0, 0, 'Movement');

function createNeutralTimeline(): AnimationTimeline {
  return DEFAULT_TIMELINE;
}

function defaultDetectState(
  currentAngle: number | null,
  _prevAngle: number | null,
  currentState: MovementState
): MovementState {
  if (currentAngle === null) return 'WAITING';
  if (currentState === 'WAITING') return 'READY';
  return currentState;
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. Ankle Plantar Flexion (Bilateral) — LIVE ANALYSIS AVAILABLE
// ─────────────────────────────────────────────────────────────────────────────

export function calculateAnklePlantarFlexionMetric(
  landmarks: Landmark3D[],
  side: 'left' | 'right' | 'bilateral' = 'bilateral'
): number | null {
  if (!landmarks || landmarks.length < 33) return null;

  const { knee, ankle, heel, footIndex, leftAnkle, rightAnkle, leftHeel, rightHeel } =
    getLandmarksForSide(landmarks, side === 'bilateral' ? 'right' : side);

  if (side === 'bilateral' && leftAnkle && rightAnkle && leftHeel && rightHeel) {
    if (
      (leftAnkle.visibility ?? 1) < 0.4 ||
      (rightAnkle.visibility ?? 1) < 0.4 ||
      (leftHeel.visibility ?? 1) < 0.4 ||
      (rightHeel.visibility ?? 1) < 0.4
    ) {
      return null;
    }

    // Relative heel elevation in normalized screen coords
    const leftElevation = Math.max(0, (leftAnkle.y - leftHeel.y) * 400);
    const rightElevation = Math.max(0, (rightAnkle.y - rightHeel.y) * 400);
    const avgElevation = (leftElevation + rightElevation) / 2;
    return clamp(Math.round(avgElevation), 0, 50);
  }

  if (!knee || !ankle || !heel) return null;
  if ((knee.visibility ?? 1) < 0.4 || (ankle.visibility ?? 1) < 0.4 || (heel.visibility ?? 1) < 0.4) {
    return null;
  }

  // Shin vector (Knee -> Ankle)
  const vShin = { x: ankle.x - knee.x, y: ankle.y - knee.y, z: (ankle.z ?? 0) - (knee.z ?? 0) };
  // Foot vector (Heel -> FootIndex)
  const distalFoot = footIndex ?? ankle;
  const vFoot = { x: distalFoot.x - heel.x, y: distalFoot.y - heel.y, z: (distalFoot.z ?? 0) - (heel.z ?? 0) };

  const angle = angleBetweenVectors(vShin, vFoot);
  if (isNaN(angle)) return null;

  // Plantarflexion degrees past 90°
  const plantarDeg = Math.max(0, angle - 90);
  return clamp(Math.round(plantarDeg), 0, 50);
}

export function detectAnklePlantarFlexionState(
  currentAngle: number | null,
  prevAngle: number | null,
  currentState: MovementState,
  peakAngle: number
): MovementState {
  if (currentAngle === null) return 'WAITING';

  const START_THRESH = 8;
  const TARGET_THRESH = 30;

  switch (currentState) {
    case 'WAITING':
      return currentAngle <= START_THRESH ? 'READY' : 'LIFTING';
    case 'READY':
      if (currentAngle > START_THRESH + 4) return 'LIFTING';
      return 'READY';
    case 'LIFTING':
      if (currentAngle >= TARGET_THRESH) return 'AT_TARGET';
      if (prevAngle !== null && currentAngle < peakAngle - 6) return 'RETURNING';
      return 'LIFTING';
    case 'AT_TARGET':
      if (currentAngle < TARGET_THRESH - 5) return 'RETURNING';
      return 'AT_TARGET';
    case 'RETURNING':
      if (currentAngle <= START_THRESH) return 'READY';
      if (prevAngle !== null && currentAngle > prevAngle + 4) return 'LIFTING';
      return 'RETURNING';
    default:
      return 'READY';
  }
}

export const anklePlantarFlexionExercise: ExerciseDefinition = {
  id: 'ankle_plantar_flexion',
  name: 'Ankle Plantar Flexion',
  category: 'Lower Extremity',
  bodyRegion: 'Ankle',
  description:
    'Bilateral ankle plantarflexion (calf heel raises) assessing gastrocnemius-soleus strength, bilateral symmetry, and ankle mobility.',
  difficulty: 'beginner',
  side: 'bilateral',

  laterality: 'bilateral',
  supportedLateralities: ['bilateral'],
  targetMetric: 'Plantarflexion Heel Elevation',
  unit: 'degrees / elevation',
  poseLandmarks: [
    'left_knee',
    'left_ankle',
    'left_heel',
    'left_foot_index',
    'right_knee',
    'right_ankle',
    'right_heel',
    'right_foot_index',
  ],
  analysisMode: 'bilateral_rom',
  referenceDataAvailable: true,
  sourceType: 'DATASET-BACKED EXERCISE',
  isDatasetBacked: true,
  liveAnalysisAvailable: true,
  analysisConfidence: 'HIGH',

  metricName: 'Ankle Plantarflexion',
  plane: 'Sagittal Plane',
  targetAngle: 35,
  limitedAngle: 20,
  startAngle: 0,
  minValidAmplitude: 8,

  postureMode: 'standing',
  highlightJoint: 'ankle',
  requiredLandmarks: ['left_ankle', 'right_ankle', 'left_heel', 'right_heel'],

  timeline: DEFAULT_TIMELINE,
  demoPhases: DEFAULT_DEMO_PHASES,
  createPersonalizedTimeline: createNeutralTimeline,

  calculateMetric: calculateAnklePlantarFlexionMetric,
  detectState: detectAnklePlantarFlexionState,
  getFeedback: (state: MovementState) => {
    switch (state) {
      case 'WAITING':
        return 'Step back so your full body and feet are clearly visible in the camera frame.';
      case 'READY':
        return 'Starting position detected. Raise both heels smoothly onto your toes.';
      case 'LIFTING':
        return 'Elevating heels into plantarflexion. Maintain bilateral symmetry.';
      case 'AT_TARGET':
        return 'Full heel elevation reached! Hold briefly at the top.';
      case 'RETURNING':
        return 'Lower heels back down smoothly with controlled deceleration.';
      default:
        return 'Perform bilateral heel raises in full view.';
    }
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// 2. Arm Circumduction (Left / Right) — LIVE ANALYSIS AVAILABLE
// ─────────────────────────────────────────────────────────────────────────────

let lastCircumductionAngle = 0;
let cumulativeSweptDeg = 0;

export function calculateArmCircumductionMetric(
  landmarks: Landmark3D[],
  side: 'left' | 'right' | 'bilateral' = 'right'
): number | null {
  if (!landmarks || landmarks.length < 25) return null;

  const { shoulder, wrist } = getLandmarksForSide(landmarks, side);

  if (!shoulder || !wrist) return null;
  if ((shoulder.visibility ?? 1) < 0.4 || (wrist.visibility ?? 1) < 0.4) return null;

  const dx = wrist.x - shoulder.x;
  const dy = wrist.y - shoulder.y;

  // Polar angle around glenohumeral center
  const currentAngleRad = Math.atan2(dy, dx);
  const currentAngleDeg = (currentAngleRad * 180) / Math.PI;

  if (lastCircumductionAngle !== 0) {
    let delta = Math.abs(currentAngleDeg - lastCircumductionAngle);
    if (delta > 180) delta = 360 - delta;
    if (delta < 45) {
      cumulativeSweptDeg += delta;
    }
  }
  lastCircumductionAngle = currentAngleDeg;

  // Modulo 360 for single circular cycle progress
  const cycleProgress = Math.round(cumulativeSweptDeg % 360);
  return clamp(cycleProgress, 0, 360);
}

export function detectArmCircumductionState(
  currentAngle: number | null,
  _prevAngle: number | null,
  currentState: MovementState
): MovementState {
  if (currentAngle === null) return 'WAITING';

  if (currentState === 'WAITING' || currentState === 'READY') {
    if (currentAngle > 15 && currentAngle < 340) return 'LIFTING';
    return 'READY';
  }

  if (currentState === 'LIFTING') {
    if (currentAngle >= 340) return 'AT_TARGET';
    return 'LIFTING';
  }

  if (currentState === 'AT_TARGET') {
    if (currentAngle < 60) return 'READY';
    return 'AT_TARGET';
  }

  return 'READY';
}

export const armCircumductionExercise: ExerciseDefinition = {
  id: 'arm_circumduction',
  name: 'Arm Circumduction',
  category: 'Upper Extremity',
  bodyRegion: 'Shoulder / Upper Limb',
  description:
    'Multi-planar circular motion of the upper limb about the glenohumeral joint tracking swept rotational trajectory and arc completion.',
  difficulty: 'intermediate',
  side: 'right',

  laterality: 'left/right',
  supportedLateralities: ['left', 'right'],
  targetMetric: 'Swept Trajectory Arc (360°)',
  unit: 'degrees swept',
  poseLandmarks: ['shoulder', 'elbow', 'wrist', 'hip'],
  analysisMode: 'circumduction_path',
  referenceDataAvailable: true,
  sourceType: 'DATASET-BACKED EXERCISE',
  isDatasetBacked: true,
  liveAnalysisAvailable: true,
  analysisConfidence: 'HIGH',

  metricName: 'Circumduction Arc',
  plane: 'Multi-Planar (Sagittal / Frontal)',
  targetAngle: 360,
  limitedAngle: 180,
  startAngle: 0,
  minValidAmplitude: 45,

  postureMode: 'standing',
  highlightJoint: 'shoulder',
  requiredLandmarks: ['right_shoulder', 'right_elbow', 'right_wrist'],

  timeline: DEFAULT_TIMELINE,
  demoPhases: DEFAULT_DEMO_PHASES,
  createPersonalizedTimeline: createNeutralTimeline,

  calculateMetric: calculateArmCircumductionMetric,
  detectState: detectArmCircumductionState,
  getFeedback: (state: MovementState, angle: number | null) => {
    switch (state) {
      case 'WAITING':
        return 'Ensure your shoulder and active arm are in clear view of the camera.';
      case 'READY':
        return 'Begin performing smooth circular rotations with your active arm.';
      case 'LIFTING':
        return `Sweeping circular trajectory (${Math.round(angle ?? 0)}° / 360°). Maintain fluid motion.`;
      case 'AT_TARGET':
        return 'Full 360° circular trajectory completed! Continue smooth rotational revolutions.';
      default:
        return 'Perform controlled circular arm circumduction.';
    }
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// 3. Ball Press (Left / Right) — REFERENCE DEMO ONLY (Sensor Insufficient)
// ─────────────────────────────────────────────────────────────────────────────

export const ballPressExercise: ExerciseDefinition = {
  id: 'ball_press',
  name: 'Ball Press',
  category: 'Distal Upper Extremity',
  bodyRegion: 'Shoulder / Upper Limb',
  description:
    'Sustained isometric compression against a physical therapy ball assessing distal neuromuscular force and joint stability.',
  difficulty: 'beginner',
  side: 'right',

  laterality: 'left/right',
  supportedLateralities: ['left', 'right'],
  targetMetric: 'Isometric Press Stability & Hold Time',
  unit: 'hold seconds',
  poseLandmarks: ['shoulder', 'elbow', 'wrist', 'index'],
  analysisMode: 'isometric_stability',
  referenceDataAvailable: true,
  sourceType: 'DATASET-BACKED EXERCISE',
  isDatasetBacked: true,
  liveAnalysisAvailable: false,
  analysisConfidence: 'MEDIUM',
  liveAnalysisStatusMessage:
    'Live analysis unavailable: Mechanical compressive foam ball force requires physical pressure transducer.',

  metricName: 'Ball Press Hold',
  plane: 'Transverse / Frontal Plane',
  targetAngle: 0,
  limitedAngle: 0,
  startAngle: 0,
  minValidAmplitude: 5,

  postureMode: 'seated',
  highlightJoint: 'wrist',
  requiredLandmarks: ['right_elbow', 'right_wrist'],

  timeline: DEFAULT_TIMELINE,
  demoPhases: DEFAULT_DEMO_PHASES,
  createPersonalizedTimeline: createNeutralTimeline,

  calculateMetric: () => null,
  detectState: defaultDetectState,
  getFeedback: () =>
    'REFERENCE DEMO ONLY: Live analysis unavailable. Compress firmly into therapy ball and sustain hold.',
};

// ─────────────────────────────────────────────────────────────────────────────
// 4. Wrist Extension Stretch (Left / Right) — REFERENCE DEMO ONLY (Mesh Insufficient)
// ─────────────────────────────────────────────────────────────────────────────

export const wristExtensionStretchExercise: ExerciseDefinition = {
  id: 'wrist_extension_stretch',
  name: 'Wrist Extension Stretch',
  category: 'Distal Upper Extremity',
  bodyRegion: 'Wrist',
  description:
    'Assisted or active wrist extension stretch targeting the forearm flexor musculature and anterior wrist compliance.',
  difficulty: 'beginner',
  side: 'right',

  laterality: 'left/right',
  supportedLateralities: ['left', 'right'],
  targetMetric: 'Radiocarpal Extension Angle',
  unit: 'degrees / hold seconds',
  poseLandmarks: ['elbow', 'wrist', 'index', 'pinky'],
  analysisMode: 'stretch_hold',
  referenceDataAvailable: true,
  sourceType: 'DATASET-BACKED EXERCISE',
  isDatasetBacked: true,
  liveAnalysisAvailable: false,
  analysisConfidence: 'MEDIUM',
  liveAnalysisStatusMessage:
    'Live analysis unavailable: Metacarpal hand mesh tracking not supported by current single-camera pose model.',

  metricName: 'Wrist Extension',
  plane: 'Sagittal Plane',
  targetAngle: 0,
  limitedAngle: 0,
  startAngle: 0,
  minValidAmplitude: 10,

  postureMode: 'seated',
  highlightJoint: 'wrist',
  requiredLandmarks: ['right_elbow', 'right_wrist', 'right_index'],

  timeline: DEFAULT_TIMELINE,
  demoPhases: DEFAULT_DEMO_PHASES,
  createPersonalizedTimeline: createNeutralTimeline,

  calculateMetric: () => null,
  detectState: defaultDetectState,
  getFeedback: () =>
    'REFERENCE DEMO ONLY: Live analysis unavailable. Extend wrist upward and hold comfortably.',
};
