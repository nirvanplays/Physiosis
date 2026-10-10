/**
 * ExerciseTypes.ts
 * Type definitions for generic rehabilitation exercises, kinematics calculators,
 * state detectors, and guide generators.
 */

import type { AnimationTimeline, PhaseConfig, Vec2 } from './PoseTypes';
import type { MovementState } from '../biomechanics/biomechanicsTypes';

export type ExerciseId =
  | 'ankle_plantar_flexion'
  | 'arm_circumduction'
  | 'ball_press'
  | 'cross_body_shoulder_stretch'
  | 'isometric_rotation'
  | 'isometric_side_bending'
  | 'shoulder_abduction'
  | 'shoulder_flexion'
  | 'wrist_extension_stretch'
  | 'knee_extension'
  | 'straight_leg_raise'
  | 'shoulder-flexion'
  | 'knee-extension'
  | 'straight-leg-raise'
  | string;

export type JointHighlight =
  | 'shoulder'
  | 'knee'
  | 'hip'
  | 'ankle'
  | 'wrist'
  | 'spine'
  | 'trunk'
  | 'arm'
  | 'general';

export type PostureMode = 'standing' | 'seated' | 'supine';

export type BodyRegion =
  | 'Shoulder / Upper Limb'
  | 'Spine / Neck'
  | 'Wrist'
  | 'Ankle'
  | 'Knee / Lower Limb';

export type ExerciseSourceType =
  | 'DATASET-BACKED EXERCISE'
  | 'PHYSIOSIS PROTOTYPE EXERCISE';

export interface Landmark3D {
  x: number;
  y: number;
  z: number;
  visibility?: number;
}

export interface LiveGuideOverlay {
  start: Vec2;
  end: Vec2;
  mid?: Vec2;
  label: string;
  targetAngle: number;
}

/**
 * Reusable Exercise Definition structure.
 * Allows each exercise to define its own kinematics, states, timelines,
 * reference postures, and live camera overlays.
 */
export interface ExerciseDefinition {
  id: string;
  name: string;
  category: string;
  bodyRegion: BodyRegion;
  description: string;
  difficulty: 'beginner' | 'intermediate' | 'advanced';
  side: 'right' | 'left' | 'bilateral';

  // ── Extended Metadata for 9-Exercise Dataset Integration ──────────────────
  laterality: 'bilateral' | 'left' | 'right' | 'left/right';
  supportedLateralities?: ('bilateral' | 'left' | 'right')[];
  targetMetric: string;
  unit: string;
  poseLandmarks: string[];
  analysisMode: string;
  referenceDataAvailable: boolean;
  sourceType: ExerciseSourceType;
  isDatasetBacked: boolean;
  liveAnalysisAvailable: boolean;
  analysisConfidence: 'HIGH' | 'MEDIUM' | 'LOW';
  liveAnalysisStatusMessage?: string;

  // ── Kinematic Telemetry Properties ─────────────────────────────────────────
  metricName: string;
  plane: string;

  targetAngle: number;
  limitedAngle: number;
  startAngle: number;
  minValidAmplitude: number;

  postureMode: PostureMode;
  highlightJoint: JointHighlight;
  requiredLandmarks: string[];

  timeline: AnimationTimeline;
  demoPhases: PhaseConfig[];

  createPersonalizedTimeline: (patientPeakAngle: number) => AnimationTimeline;

  calculateMetric: (
    landmarks: Landmark3D[],
    side?: 'left' | 'right' | 'bilateral',
    rawLandmarks?: Landmark3D[]
  ) => number | null;

  detectState: (
    currentAngle: number | null,
    prevAngle: number | null,
    currentState: MovementState,
    peakAngle: number
  ) => MovementState;

  getFeedback: (
    state: MovementState,
    angle: number | null,
    peakAngle: number | null
  ) => string;

  getLiveGuide?: (
    landmarks: Landmark3D[],
    canvasWidth: number,
    canvasHeight: number,
    side?: 'left' | 'right' | 'bilateral'
  ) => LiveGuideOverlay | null;
}
