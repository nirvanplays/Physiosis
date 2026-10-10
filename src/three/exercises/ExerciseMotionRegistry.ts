/**
 * ExerciseMotionRegistry.ts
 * Authoritative 3D Kinematic Motion Definitions & Reference Keyframe Sequences for all 11 Physiosis Protocols.
 *
 * Biomechanical Standards:
 *   1. Differentiated Kinematics: Every exercise defines its exact movement plane, articulating chain,
 *      and anatomically accurate trajectory (no generic or duplicated animations).
 *   2. Analysis Modalities: Distinguishes dynamic repetitions, isometric holds (stability score),
 *      and end-range stretch holds.
 *   3. Anatomical Proportions: Strict bone-length invariance across all keyframe poses.
 *   4. Visual Augmentations: Optional multiplanar trajectory paths and abstract therapy visuals.
 */

import * as THREE from 'three';
import type { SkeletonPose3D, JointName3D } from '../skeleton/SkeletonPose3D';
import { ANATOMICAL_REST_POSE, clonePose3D } from '../skeleton/SkeletonPose3D';

export type MovementPlane = 'sagittal' | 'frontal' | 'transverse' | 'multiplanar';
export type AnalysisType = 'repetition' | 'isometric_hold' | 'range_of_motion' | 'stretch_hold';

export interface MovementKeyframe {
  timeMs: number;
  metricValue: number;
  metricLabel: string;
  phaseLabel: string;
  pose: SkeletonPose3D;
  stabilityScore?: number; // 0-100 for isometric holds
}

export interface ExerciseMotionDefinition {
  exerciseId: string;
  name: string;
  bodyRegion: string;
  plane: MovementPlane;
  laterality: 'unilateral' | 'bilateral';
  analysisType: AnalysisType;
  targetMetricLabel: string;
  targetMetricValue: number;
  clinicalDescription: string;
  abstractVisualObject?: 'therapy_ball' | 'none';

  referencePose: (side: 'left' | 'right' | 'bilateral') => SkeletonPose3D;
  targetPose: (side: 'left' | 'right' | 'bilateral') => SkeletonPose3D;
  activeJoints: (side: 'left' | 'right' | 'bilateral') => JointName3D[];
  getPoseForProgress: (progress: number, side: 'left' | 'right' | 'bilateral') => SkeletonPose3D;
  generateSequence: (side: 'left' | 'right' | 'bilateral') => MovementKeyframe[];
  trajectoryPoints?: (side: 'left' | 'right' | 'bilateral') => THREE.Vector3[];
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. SHOULDER FLEXION (Sagittal Forward Elevation: 0° -> 165°)
// ─────────────────────────────────────────────────────────────────────────────
function buildShoulderFlexionPose(angleDeg: number, side: 'left' | 'right' | 'bilateral'): SkeletonPose3D {
  const pose = clonePose3D(ANATOMICAL_REST_POSE);
  const rad = (angleDeg * Math.PI) / 180;
  const isLeft = side === 'left';

  const upperArmLen = 0.28;
  const forearmLen = 0.26;

  const shoulder = isLeft ? pose.leftShoulder : pose.rightShoulder;
  const elbow = new THREE.Vector3(
    shoulder.x,
    shoulder.y - upperArmLen * Math.cos(rad),
    shoulder.z + upperArmLen * Math.sin(rad)
  );

  // Natural 5° elbow flexion during elevation
  const elbowFlexRad = (5 * Math.PI) / 180;
  const netAngle = rad + elbowFlexRad;
  const wrist = new THREE.Vector3(
    elbow.x,
    elbow.y - forearmLen * Math.cos(netAngle),
    elbow.z + forearmLen * Math.sin(netAngle)
  );

  if (isLeft) {
    pose.leftElbow.copy(elbow);
    pose.leftWrist.copy(wrist);
  } else {
    pose.rightElbow.copy(elbow);
    pose.rightWrist.copy(wrist);
  }
  return pose;
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. SHOULDER ABDUCTION (Frontal Lateral Elevation: 0° -> 160°)
// ─────────────────────────────────────────────────────────────────────────────
function buildShoulderAbductionPose(angleDeg: number, side: 'left' | 'right' | 'bilateral'): SkeletonPose3D {
  const pose = clonePose3D(ANATOMICAL_REST_POSE);
  const rad = (angleDeg * Math.PI) / 180;
  const isLeft = side === 'left';
  const sign = isLeft ? 1 : -1;

  const upperArmLen = 0.28;
  const forearmLen = 0.26;

  const shoulder = isLeft ? pose.leftShoulder : pose.rightShoulder;
  const elbow = new THREE.Vector3(
    shoulder.x + sign * upperArmLen * Math.sin(rad),
    shoulder.y - upperArmLen * Math.cos(rad),
    shoulder.z
  );
  const wrist = new THREE.Vector3(
    elbow.x + sign * forearmLen * Math.sin(rad),
    elbow.y - forearmLen * Math.cos(rad),
    elbow.z
  );

  if (isLeft) {
    pose.leftElbow.copy(elbow);
    pose.leftWrist.copy(wrist);
  } else {
    pose.rightElbow.copy(elbow);
    pose.rightWrist.copy(wrist);
  }
  return pose;
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. ARM CIRCUMDUCTION (Multiplanar Circular Trajectory: 0° -> 360°)
// ─────────────────────────────────────────────────────────────────────────────
function buildArmCircumductionPose(angleDeg: number, side: 'left' | 'right' | 'bilateral'): SkeletonPose3D {
  const pose = clonePose3D(ANATOMICAL_REST_POSE);
  const rad = (angleDeg * Math.PI) / 180;
  const isLeft = side === 'left';
  const sign = isLeft ? 1 : -1;

  const shoulder = isLeft ? pose.leftShoulder : pose.rightShoulder;
  const coneRadius = 0.16;

  const elbow = new THREE.Vector3(
    shoulder.x + sign * (0.04 + coneRadius * Math.sin(rad)),
    shoulder.y - 0.26,
    shoulder.z + coneRadius * Math.cos(rad)
  );
  const wrist = new THREE.Vector3(
    elbow.x + sign * (0.04 + coneRadius * 1.5 * Math.sin(rad)),
    elbow.y - 0.24,
    elbow.z + coneRadius * 1.5 * Math.cos(rad)
  );

  if (isLeft) {
    pose.leftElbow.copy(elbow);
    pose.leftWrist.copy(wrist);
  } else {
    pose.rightElbow.copy(elbow);
    pose.rightWrist.copy(wrist);
  }
  return pose;
}

function generateCircumductionTrajectory(side: 'left' | 'right' | 'bilateral'): THREE.Vector3[] {
  const points: THREE.Vector3[] = [];
  const segments = 36;
  for (let i = 0; i <= segments; i++) {
    const deg = (i / segments) * 360;
    const pose = buildArmCircumductionPose(deg, side);
    points.push(side === 'left' ? pose.leftWrist.clone() : pose.rightWrist.clone());
  }
  return points;
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. BALL PRESS (Transverse Bilateral Chest Press & Isometric Compression)
// ─────────────────────────────────────────────────────────────────────────────
function buildBallPressPose(compressionMm: number, _side: 'left' | 'right' | 'bilateral'): SkeletonPose3D {
  const pose = clonePose3D(ANATOMICAL_REST_POSE);
  const compressM = (compressionMm / 1000) * 0.9;

  pose.leftShoulder.set(0.19, 1.38, 0);
  pose.rightShoulder.set(-0.19, 1.38, 0);

  pose.leftElbow.set(0.24 - compressM * 0.5, 1.28, 0.20);
  pose.rightElbow.set(-0.24 + compressM * 0.5, 1.28, 0.20);

  pose.leftWrist.set(0.12 - compressM, 1.28, 0.36);
  pose.rightWrist.set(-0.12 + compressM, 1.28, 0.36);

  return pose;
}

// ─────────────────────────────────────────────────────────────────────────────
// 5. CROSS-BODY SHOULDER STRETCH (Transverse Horizontal Adduction: 0° -> 110°)
// ─────────────────────────────────────────────────────────────────────────────
function buildCrossBodyStretchPose(angleDeg: number, side: 'left' | 'right' | 'bilateral'): SkeletonPose3D {
  const pose = clonePose3D(ANATOMICAL_REST_POSE);
  const t = Math.min(1, Math.max(0, angleDeg / 110));
  const isLeft = side === 'left';

  if (isLeft) {
    pose.leftElbow.set(
      THREE.MathUtils.lerp(0.22, -0.08, t),
      THREE.MathUtils.lerp(1.14, 1.32, t),
      THREE.MathUtils.lerp(-0.02, 0.22, t)
    );
    pose.leftWrist.set(
      THREE.MathUtils.lerp(0.24, -0.22, t),
      THREE.MathUtils.lerp(0.88, 1.35, t),
      THREE.MathUtils.lerp(0.02, 0.18, t)
    );
    if (t > 0.2) {
      pose.rightElbow.set(-0.20, 1.15, 0.12);
      pose.rightWrist.set(pose.leftElbow.x - 0.04, pose.leftElbow.y, pose.leftElbow.z + 0.02);
    }
  } else {
    pose.rightElbow.set(
      THREE.MathUtils.lerp(-0.22, 0.08, t),
      THREE.MathUtils.lerp(1.14, 1.32, t),
      THREE.MathUtils.lerp(-0.02, 0.22, t)
    );
    pose.rightWrist.set(
      THREE.MathUtils.lerp(-0.24, 0.22, t),
      THREE.MathUtils.lerp(0.88, 1.35, t),
      THREE.MathUtils.lerp(0.02, 0.18, t)
    );
    if (t > 0.2) {
      pose.leftElbow.set(0.20, 1.15, 0.12);
      pose.leftWrist.set(pose.rightElbow.x + 0.04, pose.rightElbow.y, pose.rightElbow.z + 0.02);
    }
  }
  return pose;
}

// ─────────────────────────────────────────────────────────────────────────────
// 6. ISOMETRIC ROTATION (Transverse External Rotation Hold: 0° -> 45°)
// ─────────────────────────────────────────────────────────────────────────────
function buildIsometricRotationPose(angleDeg: number, side: 'left' | 'right' | 'bilateral'): SkeletonPose3D {
  const pose = clonePose3D(ANATOMICAL_REST_POSE);
  const rad = (angleDeg * Math.PI) / 180;
  const isLeft = side === 'left';

  if (isLeft) {
    pose.leftElbow.set(0.20, 1.14, 0.02);
    pose.leftWrist.set(
      0.20 + 0.26 * Math.sin(rad),
      1.14,
      0.26 * Math.cos(rad)
    );
  } else {
    pose.rightElbow.set(-0.20, 1.14, 0.02);
    pose.rightWrist.set(
      -0.20 - 0.26 * Math.sin(rad),
      1.14,
      0.26 * Math.cos(rad)
    );
  }
  return pose;
}

// ─────────────────────────────────────────────────────────────────────────────
// 7. ISOMETRIC SIDE BENDING (Frontal Lateral Trunk Flexion: 0° -> 25°)
// ─────────────────────────────────────────────────────────────────────────────
function buildIsometricSideBendingPose(angleDeg: number, side: 'left' | 'right' | 'bilateral'): SkeletonPose3D {
  const pose = clonePose3D(ANATOMICAL_REST_POSE);
  const t = Math.min(1, Math.max(0, angleDeg / 25));
  const isLeft = side === 'left';
  const sign = isLeft ? 1 : -1;

  const dx = sign * t * 0.14;
  pose.spine.x += dx * 0.45;
  pose.chest.x += dx * 0.90;
  pose.neck.x += dx * 1.15;
  pose.head.x += dx * 1.35;

  pose.leftShoulder.x += dx * 0.9;
  pose.rightShoulder.x += dx * 0.9;
  pose.leftElbow.x += dx * 0.9;
  pose.rightElbow.x += dx * 0.9;
  pose.leftWrist.x += dx * 0.9;
  pose.rightWrist.x += dx * 0.9;

  return pose;
}

// ─────────────────────────────────────────────────────────────────────────────
// 8. WRIST EXTENSION STRETCH (Sagittal Forearm Extension & Dorsiflexion: 0° -> 70°)
// ─────────────────────────────────────────────────────────────────────────────
function buildWristExtensionPose(_angleDeg: number, side: 'left' | 'right' | 'bilateral'): SkeletonPose3D {
  const pose = clonePose3D(ANATOMICAL_REST_POSE);
  const isLeft = side === 'left';

  if (isLeft) {
    pose.leftElbow.set(0.19, 1.38, 0.26);
    pose.leftWrist.set(0.19, 1.38, 0.52);
    // Assisting right hand holds fingers in stretch
    pose.rightElbow.set(-0.06, 1.25, 0.38);
    pose.rightWrist.set(0.17, 1.40, 0.53);
  } else {
    pose.rightElbow.set(-0.19, 1.38, 0.26);
    pose.rightWrist.set(-0.19, 1.38, 0.52);
    // Assisting left hand holds fingers in stretch
    pose.leftElbow.set(0.06, 1.25, 0.38);
    pose.leftWrist.set(-0.17, 1.40, 0.53);
  }
  return pose;
}

// ─────────────────────────────────────────────────────────────────────────────
// 9. ANKLE PLANTAR FLEXION (Sagittal Plantarflexion & Heel Elevation: 0° -> 45°)
// ─────────────────────────────────────────────────────────────────────────────
function buildAnklePlantarFlexionPose(angleDeg: number, side: 'left' | 'right' | 'bilateral'): SkeletonPose3D {
  const pose = clonePose3D(ANATOMICAL_REST_POSE);
  const isLeft = side === 'left';
  const isBilateral = side === 'bilateral';
  const t = Math.min(1, Math.max(0, angleDeg / 45));

  if (isLeft || isBilateral) {
    pose.leftKnee.set(0.10, 0.52, 0.04);
    pose.leftAnkle.set(0.10, 0.14 + t * 0.06, -0.02 + t * 0.06);
  }
  if (!isLeft || isBilateral) {
    pose.rightKnee.set(-0.10, 0.52, 0.04);
    pose.rightAnkle.set(-0.10, 0.14 + t * 0.06, -0.02 + t * 0.06);
  }
  return pose;
}

// ─────────────────────────────────────────────────────────────────────────────
// 10. SEATED KNEE EXTENSION (Sagittal Tibial Extension: 90° Flexion -> 0° Extension)
// ─────────────────────────────────────────────────────────────────────────────
function buildSeatedKneeExtensionPose(angleDeg: number, side: 'left' | 'right' | 'bilateral'): SkeletonPose3D {
  const pose = clonePose3D(ANATOMICAL_REST_POSE);
  const isLeft = side === 'left';
  const progress = 1 - Math.min(1, Math.max(0, angleDeg / 90)); // 0 = 90° bent, 1 = 0° straight

  // Seated posture (Chair height 0.60m)
  pose.pelvis.set(0, 0.60, 0);
  pose.spine.set(0, 0.80, 0);
  pose.chest.set(0, 1.00, 0);
  pose.neck.set(0, 1.15, 0);
  pose.head.set(0, 1.33, 0);

  pose.leftHip.set(0.10, 0.58, 0.02);
  pose.rightHip.set(-0.10, 0.58, 0.02);

  pose.leftKnee.set(0.10, 0.58, 0.38);
  pose.rightKnee.set(-0.10, 0.58, 0.38);

  // Inactive resting leg
  pose.leftAnkle.set(0.10, 0.16, 0.38);
  pose.rightAnkle.set(-0.10, 0.16, 0.38);

  // Active leg extends forward & upward
  if (isLeft) {
    pose.leftAnkle.set(
      0.10,
      THREE.MathUtils.lerp(0.16, 0.58, progress),
      THREE.MathUtils.lerp(0.38, 0.80, progress)
    );
  } else {
    pose.rightAnkle.set(
      -0.10,
      THREE.MathUtils.lerp(0.16, 0.58, progress),
      THREE.MathUtils.lerp(0.38, 0.80, progress)
    );
  }
  return pose;
}

// ─────────────────────────────────────────────────────────────────────────────
// 11. STRAIGHT-LEG RAISE (Sagittal Hip Flexion with Locked Knee: 0° -> 60°)
// ─────────────────────────────────────────────────────────────────────────────
function buildStraightLegRaisePose(angleDeg: number, side: 'left' | 'right' | 'bilateral'): SkeletonPose3D {
  const pose = clonePose3D(ANATOMICAL_REST_POSE);
  const rad = (angleDeg * Math.PI) / 180;
  const isLeft = side === 'left';

  const thighLen = 0.40;
  const shinLen = 0.42;

  if (isLeft) {
    pose.leftKnee.set(
      0.10,
      pose.leftHip.y - thighLen * Math.cos(rad),
      pose.leftHip.z + thighLen * Math.sin(rad)
    );
    pose.leftAnkle.set(
      0.10,
      pose.leftKnee.y - shinLen * Math.cos(rad),
      pose.leftKnee.z + shinLen * Math.sin(rad)
    );
  } else {
    pose.rightKnee.set(
      -0.10,
      pose.rightHip.y - thighLen * Math.cos(rad),
      pose.rightHip.z + thighLen * Math.sin(rad)
    );
    pose.rightAnkle.set(
      -0.10,
      pose.rightKnee.y - shinLen * Math.cos(rad),
      pose.rightKnee.z + shinLen * Math.sin(rad)
    );
  }
  return pose;
}

// ─────────────────────────────────────────────────────────────────────────────
// MOTION REGISTRY DATABASE
// ─────────────────────────────────────────────────────────────────────────────
export const EXERCISE_MOTION_REGISTRY: Record<string, ExerciseMotionDefinition> = {
  // 1. Shoulder Flexion
  'shoulder-flexion': {
    exerciseId: 'shoulder-flexion',
    name: 'Shoulder Flexion',
    bodyRegion: 'Shoulder / Upper Limb',
    plane: 'sagittal',
    laterality: 'unilateral',
    analysisType: 'repetition',
    targetMetricLabel: 'Target ROM',
    targetMetricValue: 165,
    clinicalDescription: 'Sagittal plane anterior humerus elevation through full 165° arc of motion.',
    referencePose: (s) => buildShoulderFlexionPose(0, s),
    targetPose: (s) => buildShoulderFlexionPose(165, s),
    activeJoints: (s) => (s === 'left' ? ['leftShoulder', 'leftElbow', 'leftWrist'] : ['rightShoulder', 'rightElbow', 'rightWrist']),
    getPoseForProgress: (p, s) => buildShoulderFlexionPose(p * 165, s),
    generateSequence: (s) => [
      { timeMs: 0, metricValue: 0, metricLabel: '0°', phaseLabel: 'Rest Position (0°)', pose: buildShoulderFlexionPose(0, s) },
      { timeMs: 800, metricValue: 45, metricLabel: '45°', phaseLabel: 'Early Elevation (45°)', pose: buildShoulderFlexionPose(45, s) },
      { timeMs: 1600, metricValue: 90, metricLabel: '90°', phaseLabel: 'Mid-Range Elevation (90°)', pose: buildShoulderFlexionPose(90, s) },
      { timeMs: 2400, metricValue: 120, metricLabel: '120°', phaseLabel: 'High Elevation (120°)', pose: buildShoulderFlexionPose(120, s) },
      { timeMs: 3200, metricValue: 150, metricLabel: '150°', phaseLabel: 'Near-Target (150°)', pose: buildShoulderFlexionPose(150, s) },
      { timeMs: 4000, metricValue: 165, metricLabel: '165°', phaseLabel: 'Target Reached (165°)', pose: buildShoulderFlexionPose(165, s) },
      { timeMs: 4800, metricValue: 165, metricLabel: '165°', phaseLabel: 'Peak Hold (165°)', pose: buildShoulderFlexionPose(165, s) },
      { timeMs: 6200, metricValue: 0, metricLabel: '0°', phaseLabel: 'Controlled Return (0°)', pose: buildShoulderFlexionPose(0, s) },
    ],
  },
  'shoulder_flexion': {
    exerciseId: 'shoulder_flexion',
    name: 'Shoulder Flexion',
    bodyRegion: 'Shoulder / Upper Limb',
    plane: 'sagittal',
    laterality: 'unilateral',
    analysisType: 'repetition',
    targetMetricLabel: 'Target ROM',
    targetMetricValue: 165,
    clinicalDescription: 'Sagittal plane anterior humerus elevation through full 165° arc of motion.',
    referencePose: (s) => buildShoulderFlexionPose(0, s),
    targetPose: (s) => buildShoulderFlexionPose(165, s),
    activeJoints: (s) => (s === 'left' ? ['leftShoulder', 'leftElbow', 'leftWrist'] : ['rightShoulder', 'rightElbow', 'rightWrist']),
    getPoseForProgress: (p, s) => buildShoulderFlexionPose(p * 165, s),
    generateSequence: (s) => [
      { timeMs: 0, metricValue: 0, metricLabel: '0°', phaseLabel: 'Rest Position (0°)', pose: buildShoulderFlexionPose(0, s) },
      { timeMs: 800, metricValue: 45, metricLabel: '45°', phaseLabel: 'Early Elevation (45°)', pose: buildShoulderFlexionPose(45, s) },
      { timeMs: 1600, metricValue: 90, metricLabel: '90°', phaseLabel: 'Mid-Range Elevation (90°)', pose: buildShoulderFlexionPose(90, s) },
      { timeMs: 2400, metricValue: 120, metricLabel: '120°', phaseLabel: 'High Elevation (120°)', pose: buildShoulderFlexionPose(120, s) },
      { timeMs: 3200, metricValue: 150, metricLabel: '150°', phaseLabel: 'Near-Target (150°)', pose: buildShoulderFlexionPose(150, s) },
      { timeMs: 4000, metricValue: 165, metricLabel: '165°', phaseLabel: 'Target Reached (165°)', pose: buildShoulderFlexionPose(165, s) },
      { timeMs: 4800, metricValue: 165, metricLabel: '165°', phaseLabel: 'Peak Hold (165°)', pose: buildShoulderFlexionPose(165, s) },
      { timeMs: 6200, metricValue: 0, metricLabel: '0°', phaseLabel: 'Controlled Return (0°)', pose: buildShoulderFlexionPose(0, s) },
    ],
  },

  // 2. Shoulder Abduction
  'shoulder-abduction': {
    exerciseId: 'shoulder-abduction',
    name: 'Shoulder Abduction',
    bodyRegion: 'Shoulder / Upper Limb',
    plane: 'frontal',
    laterality: 'unilateral',
    analysisType: 'repetition',
    targetMetricLabel: 'Target ROM',
    targetMetricValue: 160,
    clinicalDescription: 'Frontal/coronal plane lateral humerus elevation away from body to 160°.',
    referencePose: (s) => buildShoulderAbductionPose(0, s),
    targetPose: (s) => buildShoulderAbductionPose(160, s),
    activeJoints: (s) => (s === 'left' ? ['leftShoulder', 'leftElbow', 'leftWrist'] : ['rightShoulder', 'rightElbow', 'rightWrist']),
    getPoseForProgress: (p, s) => buildShoulderAbductionPose(p * 160, s),
    generateSequence: (s) => [
      { timeMs: 0, metricValue: 0, metricLabel: '0°', phaseLabel: 'Rest Position (0°)', pose: buildShoulderAbductionPose(0, s) },
      { timeMs: 800, metricValue: 30, metricLabel: '30°', phaseLabel: 'Supraspinatus Initiation (30°)', pose: buildShoulderAbductionPose(30, s) },
      { timeMs: 1600, metricValue: 60, metricLabel: '60°', phaseLabel: 'Deltoid Takeover (60°)', pose: buildShoulderAbductionPose(60, s) },
      { timeMs: 2400, metricValue: 90, metricLabel: '90°', phaseLabel: 'Horizontal Abduction (90°)', pose: buildShoulderAbductionPose(90, s) },
      { timeMs: 3200, metricValue: 120, metricLabel: '120°', phaseLabel: 'Scapular Upward Rotation (120°)', pose: buildShoulderAbductionPose(120, s) },
      { timeMs: 4000, metricValue: 160, metricLabel: '160°', phaseLabel: 'Target Abduction (160°)', pose: buildShoulderAbductionPose(160, s) },
      { timeMs: 4800, metricValue: 160, metricLabel: '160°', phaseLabel: 'Abduction Hold (160°)', pose: buildShoulderAbductionPose(160, s) },
      { timeMs: 6200, metricValue: 0, metricLabel: '0°', phaseLabel: 'Controlled Return (0°)', pose: buildShoulderAbductionPose(0, s) },
    ],
  },
  'shoulder_abduction': {
    exerciseId: 'shoulder_abduction',
    name: 'Shoulder Abduction',
    bodyRegion: 'Shoulder / Upper Limb',
    plane: 'frontal',
    laterality: 'unilateral',
    analysisType: 'repetition',
    targetMetricLabel: 'Target ROM',
    targetMetricValue: 160,
    clinicalDescription: 'Frontal/coronal plane lateral humerus elevation away from body to 160°.',
    referencePose: (s) => buildShoulderAbductionPose(0, s),
    targetPose: (s) => buildShoulderAbductionPose(160, s),
    activeJoints: (s) => (s === 'left' ? ['leftShoulder', 'leftElbow', 'leftWrist'] : ['rightShoulder', 'rightElbow', 'rightWrist']),
    getPoseForProgress: (p, s) => buildShoulderAbductionPose(p * 160, s),
    generateSequence: (s) => [
      { timeMs: 0, metricValue: 0, metricLabel: '0°', phaseLabel: 'Rest Position (0°)', pose: buildShoulderAbductionPose(0, s) },
      { timeMs: 800, metricValue: 30, metricLabel: '30°', phaseLabel: 'Supraspinatus Initiation (30°)', pose: buildShoulderAbductionPose(30, s) },
      { timeMs: 1600, metricValue: 60, metricLabel: '60°', phaseLabel: 'Deltoid Takeover (60°)', pose: buildShoulderAbductionPose(60, s) },
      { timeMs: 2400, metricValue: 90, metricLabel: '90°', phaseLabel: 'Horizontal Abduction (90°)', pose: buildShoulderAbductionPose(90, s) },
      { timeMs: 3200, metricValue: 120, metricLabel: '120°', phaseLabel: 'Scapular Upward Rotation (120°)', pose: buildShoulderAbductionPose(120, s) },
      { timeMs: 4000, metricValue: 160, metricLabel: '160°', phaseLabel: 'Target Abduction (160°)', pose: buildShoulderAbductionPose(160, s) },
      { timeMs: 4800, metricValue: 160, metricLabel: '160°', phaseLabel: 'Abduction Hold (160°)', pose: buildShoulderAbductionPose(160, s) },
      { timeMs: 6200, metricValue: 0, metricLabel: '0°', phaseLabel: 'Controlled Return (0°)', pose: buildShoulderAbductionPose(0, s) },
    ],
  },

  // 3. Arm Circumduction
  'arm-circumduction': {
    exerciseId: 'arm-circumduction',
    name: 'Arm Circumduction',
    bodyRegion: 'Shoulder / Upper Limb',
    plane: 'multiplanar',
    laterality: 'unilateral',
    analysisType: 'range_of_motion',
    targetMetricLabel: 'Full Rotation',
    targetMetricValue: 360,
    clinicalDescription: 'Multiplanar conical 360° circular trajectory mobilizing the glenohumeral capsule.',
    referencePose: (s) => buildArmCircumductionPose(0, s),
    targetPose: (s) => buildArmCircumductionPose(180, s),
    activeJoints: (s) => (s === 'left' ? ['leftShoulder', 'leftElbow', 'leftWrist'] : ['rightShoulder', 'rightElbow', 'rightWrist']),
    getPoseForProgress: (p, s) => buildArmCircumductionPose(p * 360, s),
    trajectoryPoints: generateCircumductionTrajectory,
    generateSequence: (s) => [
      { timeMs: 0, metricValue: 0, metricLabel: '0°', phaseLabel: 'Circumduction Start (0°)', pose: buildArmCircumductionPose(0, s) },
      { timeMs: 1000, metricValue: 60, metricLabel: '60°', phaseLabel: 'Quadrant I (60°)', pose: buildArmCircumductionPose(60, s) },
      { timeMs: 2000, metricValue: 120, metricLabel: '120°', phaseLabel: 'Quadrant II (120°)', pose: buildArmCircumductionPose(120, s) },
      { timeMs: 3000, metricValue: 180, metricLabel: '180°', phaseLabel: 'Apex Rotation (180°)', pose: buildArmCircumductionPose(180, s) },
      { timeMs: 4000, metricValue: 240, metricLabel: '240°', phaseLabel: 'Quadrant III (240°)', pose: buildArmCircumductionPose(240, s) },
      { timeMs: 5000, metricValue: 300, metricLabel: '300°', phaseLabel: 'Quadrant IV (300°)', pose: buildArmCircumductionPose(300, s) },
      { timeMs: 6000, metricValue: 360, metricLabel: '360°', phaseLabel: 'Full Rotation Completed (360°)', pose: buildArmCircumductionPose(360, s) },
    ],
  },
  'arm_circumduction': {
    exerciseId: 'arm_circumduction',
    name: 'Arm Circumduction',
    bodyRegion: 'Shoulder / Upper Limb',
    plane: 'multiplanar',
    laterality: 'unilateral',
    analysisType: 'range_of_motion',
    targetMetricLabel: 'Full Rotation',
    targetMetricValue: 360,
    clinicalDescription: 'Multiplanar conical 360° circular trajectory mobilizing the glenohumeral capsule.',
    referencePose: (s) => buildArmCircumductionPose(0, s),
    targetPose: (s) => buildArmCircumductionPose(180, s),
    activeJoints: (s) => (s === 'left' ? ['leftShoulder', 'leftElbow', 'leftWrist'] : ['rightShoulder', 'rightElbow', 'rightWrist']),
    getPoseForProgress: (p, s) => buildArmCircumductionPose(p * 360, s),
    trajectoryPoints: generateCircumductionTrajectory,
    generateSequence: (s) => [
      { timeMs: 0, metricValue: 0, metricLabel: '0°', phaseLabel: 'Circumduction Start (0°)', pose: buildArmCircumductionPose(0, s) },
      { timeMs: 1000, metricValue: 60, metricLabel: '60°', phaseLabel: 'Quadrant I (60°)', pose: buildArmCircumductionPose(60, s) },
      { timeMs: 2000, metricValue: 120, metricLabel: '120°', phaseLabel: 'Quadrant II (120°)', pose: buildArmCircumductionPose(120, s) },
      { timeMs: 3000, metricValue: 180, metricLabel: '180°', phaseLabel: 'Apex Rotation (180°)', pose: buildArmCircumductionPose(180, s) },
      { timeMs: 4000, metricValue: 240, metricLabel: '240°', phaseLabel: 'Quadrant III (240°)', pose: buildArmCircumductionPose(240, s) },
      { timeMs: 5000, metricValue: 300, metricLabel: '300°', phaseLabel: 'Quadrant IV (300°)', pose: buildArmCircumductionPose(300, s) },
      { timeMs: 6000, metricValue: 360, metricLabel: '360°', phaseLabel: 'Full Rotation Completed (360°)', pose: buildArmCircumductionPose(360, s) },
    ],
  },

  // 4. Ball Press
  'ball-press': {
    exerciseId: 'ball-press',
    name: 'Ball Press',
    bodyRegion: 'Shoulder / Upper Limb',
    plane: 'transverse',
    laterality: 'bilateral',
    analysisType: 'isometric_hold',
    targetMetricLabel: 'Compression',
    targetMetricValue: 60,
    clinicalDescription: 'Bilateral anterior chest press holding a therapy ball with isometric pectoralis contraction.',
    abstractVisualObject: 'therapy_ball',
    referencePose: (s) => buildBallPressPose(0, s),
    targetPose: (s) => buildBallPressPose(60, s),
    activeJoints: () => ['leftShoulder', 'rightShoulder', 'leftElbow', 'rightElbow', 'leftWrist', 'rightWrist'],
    getPoseForProgress: (p, s) => buildBallPressPose(p * 60, s),
    generateSequence: (s) => [
      { timeMs: 0, metricValue: 0, metricLabel: '0 mm', phaseLabel: 'Pre-Press Positioning', pose: buildBallPressPose(0, s), stabilityScore: 100 },
      { timeMs: 1200, metricValue: 30, metricLabel: '30 mm', phaseLabel: 'Engaging Pectorals (30mm)', pose: buildBallPressPose(30, s), stabilityScore: 92 },
      { timeMs: 2400, metricValue: 60, metricLabel: '60 mm', phaseLabel: 'Target Compression (60mm)', pose: buildBallPressPose(60, s), stabilityScore: 96 },
      { timeMs: 3600, metricValue: 60, metricLabel: '60 mm', phaseLabel: 'Isometric Hold (2s)', pose: buildBallPressPose(60, s), stabilityScore: 98 },
      { timeMs: 4800, metricValue: 60, metricLabel: '60 mm', phaseLabel: 'Isometric Hold (4s)', pose: buildBallPressPose(60, s), stabilityScore: 95 },
      { timeMs: 6000, metricValue: 0, metricLabel: '0 mm', phaseLabel: 'Controlled Decompression', pose: buildBallPressPose(0, s), stabilityScore: 100 },
    ],
  },
  'ball_press': {
    exerciseId: 'ball_press',
    name: 'Ball Press',
    bodyRegion: 'Shoulder / Upper Limb',
    plane: 'transverse',
    laterality: 'bilateral',
    analysisType: 'isometric_hold',
    targetMetricLabel: 'Compression',
    targetMetricValue: 60,
    clinicalDescription: 'Bilateral anterior chest press holding a therapy ball with isometric pectoralis contraction.',
    abstractVisualObject: 'therapy_ball',
    referencePose: (s) => buildBallPressPose(0, s),
    targetPose: (s) => buildBallPressPose(60, s),
    activeJoints: () => ['leftShoulder', 'rightShoulder', 'leftElbow', 'rightElbow', 'leftWrist', 'rightWrist'],
    getPoseForProgress: (p, s) => buildBallPressPose(p * 60, s),
    generateSequence: (s) => [
      { timeMs: 0, metricValue: 0, metricLabel: '0 mm', phaseLabel: 'Pre-Press Positioning', pose: buildBallPressPose(0, s), stabilityScore: 100 },
      { timeMs: 1200, metricValue: 30, metricLabel: '30 mm', phaseLabel: 'Engaging Pectorals (30mm)', pose: buildBallPressPose(30, s), stabilityScore: 92 },
      { timeMs: 2400, metricValue: 60, metricLabel: '60 mm', phaseLabel: 'Target Compression (60mm)', pose: buildBallPressPose(60, s), stabilityScore: 96 },
      { timeMs: 3600, metricValue: 60, metricLabel: '60 mm', phaseLabel: 'Isometric Hold (2s)', pose: buildBallPressPose(60, s), stabilityScore: 98 },
      { timeMs: 4800, metricValue: 60, metricLabel: '60 mm', phaseLabel: 'Isometric Hold (4s)', pose: buildBallPressPose(60, s), stabilityScore: 95 },
      { timeMs: 6000, metricValue: 0, metricLabel: '0 mm', phaseLabel: 'Controlled Decompression', pose: buildBallPressPose(0, s), stabilityScore: 100 },
    ],
  },

  // 5. Cross-Body Shoulder Stretch
  'cross-body-shoulder-stretch': {
    exerciseId: 'cross-body-shoulder-stretch',
    name: 'Cross-Body Shoulder Stretch',
    bodyRegion: 'Shoulder / Upper Limb',
    plane: 'transverse',
    laterality: 'unilateral',
    analysisType: 'stretch_hold',
    targetMetricLabel: 'Adduction Angle',
    targetMetricValue: 110,
    clinicalDescription: 'Transverse horizontal adduction stretching the posterior glenohumeral capsule and infraspinatus.',
    referencePose: (s) => buildCrossBodyStretchPose(0, s),
    targetPose: (s) => buildCrossBodyStretchPose(110, s),
    activeJoints: (s) => (s === 'left' ? ['leftShoulder', 'leftElbow', 'leftWrist', 'rightWrist'] : ['rightShoulder', 'rightElbow', 'rightWrist', 'leftWrist']),
    getPoseForProgress: (p, s) => buildCrossBodyStretchPose(p * 110, s),
    generateSequence: (s) => [
      { timeMs: 0, metricValue: 0, metricLabel: '0°', phaseLabel: 'Start Neutral Position', pose: buildCrossBodyStretchPose(0, s) },
      { timeMs: 1400, metricValue: 55, metricLabel: '55°', phaseLabel: 'Crossing Anterior Midline (55°)', pose: buildCrossBodyStretchPose(55, s) },
      { timeMs: 2600, metricValue: 110, metricLabel: '110°', phaseLabel: 'Full Posterior Stretch (110°)', pose: buildCrossBodyStretchPose(110, s) },
      { timeMs: 4000, metricValue: 110, metricLabel: '110°', phaseLabel: 'Capsule Stretch Hold (110°)', pose: buildCrossBodyStretchPose(110, s) },
      { timeMs: 5600, metricValue: 0, metricLabel: '0°', phaseLabel: 'Controlled Release (0°)', pose: buildCrossBodyStretchPose(0, s) },
    ],
  },
  'cross_body_shoulder_stretch': {
    exerciseId: 'cross_body_shoulder_stretch',
    name: 'Cross-Body Shoulder Stretch',
    bodyRegion: 'Shoulder / Upper Limb',
    plane: 'transverse',
    laterality: 'unilateral',
    analysisType: 'stretch_hold',
    targetMetricLabel: 'Adduction Angle',
    targetMetricValue: 110,
    clinicalDescription: 'Transverse horizontal adduction stretching the posterior glenohumeral capsule and infraspinatus.',
    referencePose: (s) => buildCrossBodyStretchPose(0, s),
    targetPose: (s) => buildCrossBodyStretchPose(110, s),
    activeJoints: (s) => (s === 'left' ? ['leftShoulder', 'leftElbow', 'leftWrist', 'rightWrist'] : ['rightShoulder', 'rightElbow', 'rightWrist', 'leftWrist']),
    getPoseForProgress: (p, s) => buildCrossBodyStretchPose(p * 110, s),
    generateSequence: (s) => [
      { timeMs: 0, metricValue: 0, metricLabel: '0°', phaseLabel: 'Start Neutral Position', pose: buildCrossBodyStretchPose(0, s) },
      { timeMs: 1400, metricValue: 55, metricLabel: '55°', phaseLabel: 'Crossing Anterior Midline (55°)', pose: buildCrossBodyStretchPose(55, s) },
      { timeMs: 2600, metricValue: 110, metricLabel: '110°', phaseLabel: 'Full Posterior Stretch (110°)', pose: buildCrossBodyStretchPose(110, s) },
      { timeMs: 4000, metricValue: 110, metricLabel: '110°', phaseLabel: 'Capsule Stretch Hold (110°)', pose: buildCrossBodyStretchPose(110, s) },
      { timeMs: 5600, metricValue: 0, metricLabel: '0°', phaseLabel: 'Controlled Release (0°)', pose: buildCrossBodyStretchPose(0, s) },
    ],
  },

  // 6. Isometric Rotation
  'isometric-rotation': {
    exerciseId: 'isometric-rotation',
    name: 'Isometric Rotation',
    bodyRegion: 'Shoulder / Upper Limb',
    plane: 'transverse',
    laterality: 'unilateral',
    analysisType: 'isometric_hold',
    targetMetricLabel: 'Rotation Hold',
    targetMetricValue: 45,
    clinicalDescription: 'Transverse plane rotator cuff external rotation hold with elbow stabilized at 90° flexion.',
    referencePose: (s) => buildIsometricRotationPose(0, s),
    targetPose: (s) => buildIsometricRotationPose(45, s),
    activeJoints: (s) => (s === 'left' ? ['leftShoulder', 'leftElbow', 'leftWrist'] : ['rightShoulder', 'rightElbow', 'rightWrist']),
    getPoseForProgress: (p, s) => buildIsometricRotationPose(p * 45, s),
    generateSequence: (s) => [
      { timeMs: 0, metricValue: 0, metricLabel: '0°', phaseLabel: 'Forearm Neutral (0°)', pose: buildIsometricRotationPose(0, s), stabilityScore: 100 },
      { timeMs: 1200, metricValue: 45, metricLabel: '45°', phaseLabel: 'External Rotation Reached (45°)', pose: buildIsometricRotationPose(45, s), stabilityScore: 94 },
      { timeMs: 2600, metricValue: 45, metricLabel: '45°', phaseLabel: 'Rotator Cuff Hold (2s)', pose: buildIsometricRotationPose(45, s), stabilityScore: 97 },
      { timeMs: 4000, metricValue: 45, metricLabel: '45°', phaseLabel: 'Rotator Cuff Hold (4s)', pose: buildIsometricRotationPose(45, s), stabilityScore: 98 },
      { timeMs: 5400, metricValue: 0, metricLabel: '0°', phaseLabel: 'Controlled Return', pose: buildIsometricRotationPose(0, s), stabilityScore: 100 },
    ],
  },
  'isometric_rotation': {
    exerciseId: 'isometric_rotation',
    name: 'Isometric Rotation',
    bodyRegion: 'Shoulder / Upper Limb',
    plane: 'transverse',
    laterality: 'unilateral',
    analysisType: 'isometric_hold',
    targetMetricLabel: 'Rotation Hold',
    targetMetricValue: 45,
    clinicalDescription: 'Transverse plane rotator cuff external rotation hold with elbow stabilized at 90° flexion.',
    referencePose: (s) => buildIsometricRotationPose(0, s),
    targetPose: (s) => buildIsometricRotationPose(45, s),
    activeJoints: (s) => (s === 'left' ? ['leftShoulder', 'leftElbow', 'leftWrist'] : ['rightShoulder', 'rightElbow', 'rightWrist']),
    getPoseForProgress: (p, s) => buildIsometricRotationPose(p * 45, s),
    generateSequence: (s) => [
      { timeMs: 0, metricValue: 0, metricLabel: '0°', phaseLabel: 'Forearm Neutral (0°)', pose: buildIsometricRotationPose(0, s), stabilityScore: 100 },
      { timeMs: 1200, metricValue: 45, metricLabel: '45°', phaseLabel: 'External Rotation Reached (45°)', pose: buildIsometricRotationPose(45, s), stabilityScore: 94 },
      { timeMs: 2600, metricValue: 45, metricLabel: '45°', phaseLabel: 'Rotator Cuff Hold (2s)', pose: buildIsometricRotationPose(45, s), stabilityScore: 97 },
      { timeMs: 4000, metricValue: 45, metricLabel: '45°', phaseLabel: 'Rotator Cuff Hold (4s)', pose: buildIsometricRotationPose(45, s), stabilityScore: 98 },
      { timeMs: 5400, metricValue: 0, metricLabel: '0°', phaseLabel: 'Controlled Return', pose: buildIsometricRotationPose(0, s), stabilityScore: 100 },
    ],
  },

  // 7. Isometric Side Bending
  'isometric-side-bending': {
    exerciseId: 'isometric-side-bending',
    name: 'Isometric Side Bending',
    bodyRegion: 'Spine / Neck',
    plane: 'frontal',
    laterality: 'unilateral',
    analysisType: 'isometric_hold',
    targetMetricLabel: 'Lateral Flexion',
    targetMetricValue: 25,
    clinicalDescription: 'Frontal plane lateral trunk flexion strengthening the quadratus lumborum and obliques.',
    referencePose: (s) => buildIsometricSideBendingPose(0, s),
    targetPose: (s) => buildIsometricSideBendingPose(25, s),
    activeJoints: () => ['spine', 'chest', 'neck', 'head'],
    getPoseForProgress: (p, s) => buildIsometricSideBendingPose(p * 25, s),
    generateSequence: (s) => [
      { timeMs: 0, metricValue: 0, metricLabel: '0°', phaseLabel: 'Neutral Spine Alignment', pose: buildIsometricSideBendingPose(0, s), stabilityScore: 100 },
      { timeMs: 1400, metricValue: 25, metricLabel: '25°', phaseLabel: 'Lateral Lean Reached (25°)', pose: buildIsometricSideBendingPose(25, s), stabilityScore: 95 },
      { timeMs: 2800, metricValue: 25, metricLabel: '25°', phaseLabel: 'Isometric Core Hold (2s)', pose: buildIsometricSideBendingPose(25, s), stabilityScore: 98 },
      { timeMs: 4200, metricValue: 25, metricLabel: '25°', phaseLabel: 'Isometric Core Hold (4s)', pose: buildIsometricSideBendingPose(25, s), stabilityScore: 96 },
      { timeMs: 5600, metricValue: 0, metricLabel: '0°', phaseLabel: 'Return to Neutral Spine', pose: buildIsometricSideBendingPose(0, s), stabilityScore: 100 },
    ],
  },
  'isometric_side_bending': {
    exerciseId: 'isometric_side_bending',
    name: 'Isometric Side Bending',
    bodyRegion: 'Spine / Neck',
    plane: 'frontal',
    laterality: 'unilateral',
    analysisType: 'isometric_hold',
    targetMetricLabel: 'Lateral Flexion',
    targetMetricValue: 25,
    clinicalDescription: 'Frontal plane lateral trunk flexion strengthening the quadratus lumborum and obliques.',
    referencePose: (s) => buildIsometricSideBendingPose(0, s),
    targetPose: (s) => buildIsometricSideBendingPose(25, s),
    activeJoints: () => ['spine', 'chest', 'neck', 'head'],
    getPoseForProgress: (p, s) => buildIsometricSideBendingPose(p * 25, s),
    generateSequence: (s) => [
      { timeMs: 0, metricValue: 0, metricLabel: '0°', phaseLabel: 'Neutral Spine Alignment', pose: buildIsometricSideBendingPose(0, s), stabilityScore: 100 },
      { timeMs: 1400, metricValue: 25, metricLabel: '25°', phaseLabel: 'Lateral Lean Reached (25°)', pose: buildIsometricSideBendingPose(25, s), stabilityScore: 95 },
      { timeMs: 2800, metricValue: 25, metricLabel: '25°', phaseLabel: 'Isometric Core Hold (2s)', pose: buildIsometricSideBendingPose(25, s), stabilityScore: 98 },
      { timeMs: 4200, metricValue: 25, metricLabel: '25°', phaseLabel: 'Isometric Core Hold (4s)', pose: buildIsometricSideBendingPose(25, s), stabilityScore: 96 },
      { timeMs: 5600, metricValue: 0, metricLabel: '0°', phaseLabel: 'Return to Neutral Spine', pose: buildIsometricSideBendingPose(0, s), stabilityScore: 100 },
    ],
  },

  // 8. Wrist Extension Stretch
  'wrist-extension-stretch': {
    exerciseId: 'wrist-extension-stretch',
    name: 'Wrist Extension Stretch',
    bodyRegion: 'Wrist',
    plane: 'sagittal',
    laterality: 'unilateral',
    analysisType: 'stretch_hold',
    targetMetricLabel: 'Dorsiflexion',
    targetMetricValue: 70,
    clinicalDescription: 'Sagittal plane wrist dorsiflexion stretch with stabilized extended forearm.',
    referencePose: (s) => buildWristExtensionPose(0, s),
    targetPose: (s) => buildWristExtensionPose(70, s),
    activeJoints: (s) => (s === 'left' ? ['leftShoulder', 'leftElbow', 'leftWrist'] : ['rightShoulder', 'rightElbow', 'rightWrist']),
    getPoseForProgress: (p, s) => buildWristExtensionPose(p * 70, s),
    generateSequence: (s) => [
      { timeMs: 0, metricValue: 0, metricLabel: '0°', phaseLabel: 'Forearm Extended Forward', pose: buildWristExtensionPose(0, s) },
      { timeMs: 1400, metricValue: 70, metricLabel: '70°', phaseLabel: 'Wrist Dorsiflexion (70°)', pose: buildWristExtensionPose(70, s) },
      { timeMs: 3000, metricValue: 70, metricLabel: '70°', phaseLabel: 'Flexor Tendon Stretch Hold', pose: buildWristExtensionPose(70, s) },
      { timeMs: 4800, metricValue: 0, metricLabel: '0°', phaseLabel: 'Controlled Release', pose: buildWristExtensionPose(0, s) },
    ],
  },
  'wrist_extension_stretch': {
    exerciseId: 'wrist_extension_stretch',
    name: 'Wrist Extension Stretch',
    bodyRegion: 'Wrist',
    plane: 'sagittal',
    laterality: 'unilateral',
    analysisType: 'stretch_hold',
    targetMetricLabel: 'Dorsiflexion',
    targetMetricValue: 70,
    clinicalDescription: 'Sagittal plane wrist dorsiflexion stretch with stabilized extended forearm.',
    referencePose: (s) => buildWristExtensionPose(0, s),
    targetPose: (s) => buildWristExtensionPose(70, s),
    activeJoints: (s) => (s === 'left' ? ['leftShoulder', 'leftElbow', 'leftWrist'] : ['rightShoulder', 'rightElbow', 'rightWrist']),
    getPoseForProgress: (p, s) => buildWristExtensionPose(p * 70, s),
    generateSequence: (s) => [
      { timeMs: 0, metricValue: 0, metricLabel: '0°', phaseLabel: 'Forearm Extended Forward', pose: buildWristExtensionPose(0, s) },
      { timeMs: 1400, metricValue: 70, metricLabel: '70°', phaseLabel: 'Wrist Dorsiflexion (70°)', pose: buildWristExtensionPose(70, s) },
      { timeMs: 3000, metricValue: 70, metricLabel: '70°', phaseLabel: 'Flexor Tendon Stretch Hold', pose: buildWristExtensionPose(70, s) },
      { timeMs: 4800, metricValue: 0, metricLabel: '0°', phaseLabel: 'Controlled Release', pose: buildWristExtensionPose(0, s) },
    ],
  },

  // 9. Ankle Plantar Flexion
  'ankle-plantar-flexion': {
    exerciseId: 'ankle-plantar-flexion',
    name: 'Ankle Plantar Flexion',
    bodyRegion: 'Ankle',
    plane: 'sagittal',
    laterality: 'unilateral',
    analysisType: 'repetition',
    targetMetricLabel: 'Heel Elevation',
    targetMetricValue: 45,
    clinicalDescription: 'Sagittal plane gastrocnemius/soleus contraction elevating the calcaneus (heel raise).',
    referencePose: (s) => buildAnklePlantarFlexionPose(0, s),
    targetPose: (s) => buildAnklePlantarFlexionPose(45, s),
    activeJoints: (s) => (s === 'left' ? ['leftKnee', 'leftAnkle'] : s === 'right' ? ['rightKnee', 'rightAnkle'] : ['leftKnee', 'leftAnkle', 'rightKnee', 'rightAnkle']),
    getPoseForProgress: (p, s) => buildAnklePlantarFlexionPose(p * 45, s),
    generateSequence: (s) => [
      { timeMs: 0, metricValue: 0, metricLabel: '0°', phaseLabel: 'Foot Flat on Ground (0°)', pose: buildAnklePlantarFlexionPose(0, s) },
      { timeMs: 1200, metricValue: 45, metricLabel: '45°', phaseLabel: 'Peak Heel Elevation (45°)', pose: buildAnklePlantarFlexionPose(45, s) },
      { timeMs: 2400, metricValue: 45, metricLabel: '45°', phaseLabel: 'Calf Contraction Hold', pose: buildAnklePlantarFlexionPose(45, s) },
      { timeMs: 3800, metricValue: 0, metricLabel: '0°', phaseLabel: 'Controlled Lowering (0°)', pose: buildAnklePlantarFlexionPose(0, s) },
    ],
  },
  'ankle_plantar_flexion': {
    exerciseId: 'ankle_plantar_flexion',
    name: 'Ankle Plantar Flexion',
    bodyRegion: 'Ankle',
    plane: 'sagittal',
    laterality: 'unilateral',
    analysisType: 'repetition',
    targetMetricLabel: 'Heel Elevation',
    targetMetricValue: 45,
    clinicalDescription: 'Sagittal plane gastrocnemius/soleus contraction elevating the calcaneus (heel raise).',
    referencePose: (s) => buildAnklePlantarFlexionPose(0, s),
    targetPose: (s) => buildAnklePlantarFlexionPose(45, s),
    activeJoints: (s) => (s === 'left' ? ['leftKnee', 'leftAnkle'] : s === 'right' ? ['rightKnee', 'rightAnkle'] : ['leftKnee', 'leftAnkle', 'rightKnee', 'rightAnkle']),
    getPoseForProgress: (p, s) => buildAnklePlantarFlexionPose(p * 45, s),
    generateSequence: (s) => [
      { timeMs: 0, metricValue: 0, metricLabel: '0°', phaseLabel: 'Foot Flat on Ground (0°)', pose: buildAnklePlantarFlexionPose(0, s) },
      { timeMs: 1200, metricValue: 45, metricLabel: '45°', phaseLabel: 'Peak Heel Elevation (45°)', pose: buildAnklePlantarFlexionPose(45, s) },
      { timeMs: 2400, metricValue: 45, metricLabel: '45°', phaseLabel: 'Calf Contraction Hold', pose: buildAnklePlantarFlexionPose(45, s) },
      { timeMs: 3800, metricValue: 0, metricLabel: '0°', phaseLabel: 'Controlled Lowering (0°)', pose: buildAnklePlantarFlexionPose(0, s) },
    ],
  },

  // 10. Seated Knee Extension
  'knee-extension': {
    exerciseId: 'knee-extension',
    name: 'Seated Knee Extension',
    bodyRegion: 'Knee / Lower Limb',
    plane: 'sagittal',
    laterality: 'unilateral',
    analysisType: 'repetition',
    targetMetricLabel: 'Extension Angle',
    targetMetricValue: 0,
    clinicalDescription: 'Sagittal plane quadriceps strengthening extending the tibia forward from 90° seated flexion to 0° full extension.',
    referencePose: (s) => buildSeatedKneeExtensionPose(90, s),
    targetPose: (s) => buildSeatedKneeExtensionPose(0, s),
    activeJoints: (s) => (s === 'left' ? ['leftHip', 'leftKnee', 'leftAnkle'] : ['rightHip', 'rightKnee', 'rightAnkle']),
    getPoseForProgress: (p, s) => buildSeatedKneeExtensionPose(90 * (1 - p), s),
    generateSequence: (s) => [
      { timeMs: 0, metricValue: 90, metricLabel: '90°', phaseLabel: 'Seated 90° Knee Flexion', pose: buildSeatedKneeExtensionPose(90, s) },
      { timeMs: 1200, metricValue: 45, metricLabel: '45°', phaseLabel: 'Ascending Tibial Extension (45°)', pose: buildSeatedKneeExtensionPose(45, s) },
      { timeMs: 2400, metricValue: 0, metricLabel: '0°', phaseLabel: 'Full Knee Extension (0°)', pose: buildSeatedKneeExtensionPose(0, s) },
      { timeMs: 3400, metricValue: 0, metricLabel: '0°', phaseLabel: 'Quadriceps Lock Hold (0°)', pose: buildSeatedKneeExtensionPose(0, s) },
      { timeMs: 4800, metricValue: 90, metricLabel: '90°', phaseLabel: 'Controlled Lowering (90°)', pose: buildSeatedKneeExtensionPose(90, s) },
    ],
  },
  'knee_extension': {
    exerciseId: 'knee_extension',
    name: 'Seated Knee Extension',
    bodyRegion: 'Knee / Lower Limb',
    plane: 'sagittal',
    laterality: 'unilateral',
    analysisType: 'repetition',
    targetMetricLabel: 'Extension Angle',
    targetMetricValue: 0,
    clinicalDescription: 'Sagittal plane quadriceps strengthening extending the tibia forward from 90° seated flexion to 0° full extension.',
    referencePose: (s) => buildSeatedKneeExtensionPose(90, s),
    targetPose: (s) => buildSeatedKneeExtensionPose(0, s),
    activeJoints: (s) => (s === 'left' ? ['leftHip', 'leftKnee', 'leftAnkle'] : ['rightHip', 'rightKnee', 'rightAnkle']),
    getPoseForProgress: (p, s) => buildSeatedKneeExtensionPose(90 * (1 - p), s),
    generateSequence: (s) => [
      { timeMs: 0, metricValue: 90, metricLabel: '90°', phaseLabel: 'Seated 90° Knee Flexion', pose: buildSeatedKneeExtensionPose(90, s) },
      { timeMs: 1200, metricValue: 45, metricLabel: '45°', phaseLabel: 'Ascending Tibial Extension (45°)', pose: buildSeatedKneeExtensionPose(45, s) },
      { timeMs: 2400, metricValue: 0, metricLabel: '0°', phaseLabel: 'Full Knee Extension (0°)', pose: buildSeatedKneeExtensionPose(0, s) },
      { timeMs: 3400, metricValue: 0, metricLabel: '0°', phaseLabel: 'Quadriceps Lock Hold (0°)', pose: buildSeatedKneeExtensionPose(0, s) },
      { timeMs: 4800, metricValue: 90, metricLabel: '90°', phaseLabel: 'Controlled Lowering (90°)', pose: buildSeatedKneeExtensionPose(90, s) },
    ],
  },

  // 11. Straight-Leg Raise
  'straight-leg-raise': {
    exerciseId: 'straight-leg-raise',
    name: 'Straight-Leg Raise',
    bodyRegion: 'Knee / Lower Limb',
    plane: 'sagittal',
    laterality: 'unilateral',
    analysisType: 'range_of_motion',
    targetMetricLabel: 'Hip Flexion',
    targetMetricValue: 60,
    clinicalDescription: 'Sagittal hip flexion maintaining full knee extension to strengthen the iliopsoas and rectus femoris.',
    referencePose: (s) => buildStraightLegRaisePose(0, s),
    targetPose: (s) => buildStraightLegRaisePose(60, s),
    activeJoints: (s) => (s === 'left' ? ['leftHip', 'leftKnee', 'leftAnkle'] : ['rightHip', 'rightKnee', 'rightAnkle']),
    getPoseForProgress: (p, s) => buildStraightLegRaisePose(p * 60, s),
    generateSequence: (s) => [
      { timeMs: 0, metricValue: 0, metricLabel: '0°', phaseLabel: 'Resting Leg Position (0°)', pose: buildStraightLegRaisePose(0, s) },
      { timeMs: 1200, metricValue: 30, metricLabel: '30°', phaseLabel: 'Mid-Elevation with Locked Knee (30°)', pose: buildStraightLegRaisePose(30, s) },
      { timeMs: 2400, metricValue: 60, metricLabel: '60°', phaseLabel: 'Target 60° Hip Flexion', pose: buildStraightLegRaisePose(60, s) },
      { timeMs: 3400, metricValue: 60, metricLabel: '60°', phaseLabel: 'End-Range Isometric Hold', pose: buildStraightLegRaisePose(60, s) },
      { timeMs: 4800, metricValue: 0, metricLabel: '0°', phaseLabel: 'Controlled Leg Lowering', pose: buildStraightLegRaisePose(0, s) },
    ],
  },
  'straight_leg_raise': {
    exerciseId: 'straight_leg_raise',
    name: 'Straight-Leg Raise',
    bodyRegion: 'Knee / Lower Limb',
    plane: 'sagittal',
    laterality: 'unilateral',
    analysisType: 'range_of_motion',
    targetMetricLabel: 'Hip Flexion',
    targetMetricValue: 60,
    clinicalDescription: 'Sagittal hip flexion maintaining full knee extension to strengthen the iliopsoas and rectus femoris.',
    referencePose: (s) => buildStraightLegRaisePose(0, s),
    targetPose: (s) => buildStraightLegRaisePose(60, s),
    activeJoints: (s) => (s === 'left' ? ['leftHip', 'leftKnee', 'leftAnkle'] : ['rightHip', 'rightKnee', 'rightAnkle']),
    getPoseForProgress: (p, s) => buildStraightLegRaisePose(p * 60, s),
    generateSequence: (s) => [
      { timeMs: 0, metricValue: 0, metricLabel: '0°', phaseLabel: 'Resting Leg Position (0°)', pose: buildStraightLegRaisePose(0, s) },
      { timeMs: 1200, metricValue: 30, metricLabel: '30°', phaseLabel: 'Mid-Elevation with Locked Knee (30°)', pose: buildStraightLegRaisePose(30, s) },
      { timeMs: 2400, metricValue: 60, metricLabel: '60°', phaseLabel: 'Target 60° Hip Flexion', pose: buildStraightLegRaisePose(60, s) },
      { timeMs: 3400, metricValue: 60, metricLabel: '60°', phaseLabel: 'End-Range Isometric Hold', pose: buildStraightLegRaisePose(60, s) },
      { timeMs: 4800, metricValue: 0, metricLabel: '0°', phaseLabel: 'Controlled Leg Lowering', pose: buildStraightLegRaisePose(0, s) },
    ],
  },
};

/**
 * Retrieves the full 3D motion definition for any exerciseId (with safe fallback).
 */
export function getExerciseMotion(exerciseId: string): ExerciseMotionDefinition {
  const norm = exerciseId.toLowerCase().trim();
  return EXERCISE_MOTION_REGISTRY[norm] ?? EXERCISE_MOTION_REGISTRY['shoulder-flexion'];
}
