/**
 * ExerciseAnimationLibrary.ts
 * Authoritative 3D Keyframe Sequences & Anatomical Reference Poses for all 11 Physiosis Protocols.
 *
 * Each protocol provides:
 *   - Unique Start Pose & Target Pose
 *   - Smooth 4-Phase Deterministic Animation Loop (Reference -> Movement -> Target Hold -> Return)
 *   - Active Articulating Joints for Selective PBR Illumination
 *   - Anatomical Left / Right Mirroring
 */

import * as THREE from 'three';
import type { SkeletonPose3D, JointName3D, DemoKeyframe3D } from './SkeletonPose3D';
import { ANATOMICAL_REST_POSE, clonePose3D } from './SkeletonPose3D';

export interface Exercise3DConfig {
  exerciseId: string;
  name: string;
  laterality: 'unilateral' | 'bilateral';
  targetMetric: string;
  targetAngle: number;
  plane: string;
  activeJoints: (side: 'left' | 'right' | 'bilateral') => JointName3D[];
  getPoseForProgress: (progress: number, side: 'left' | 'right' | 'bilateral') => SkeletonPose3D;
  generateSequence: (side: 'left' | 'right' | 'bilateral') => DemoKeyframe3D[];
}

/**
 * ── 1. Shoulder Flexion (0° -> 165° Sagittal Elevation) ────────────────────
 */
function getShoulderFlexionPose(angleDeg: number, side: 'left' | 'right' | 'bilateral'): SkeletonPose3D {
  const pose = clonePose3D(ANATOMICAL_REST_POSE);
  const rad = (angleDeg * Math.PI) / 180;
  const isLeft = side === 'left';

  const upperArmLen = 0.28;
  const forearmLen = 0.26;

  const shoulderPos = isLeft ? pose.leftShoulder : pose.rightShoulder;
  const elbowPos = new THREE.Vector3(
    shoulderPos.x,
    shoulderPos.y - upperArmLen * Math.cos(rad),
    shoulderPos.z + upperArmLen * Math.sin(rad)
  );
  const wristPos = new THREE.Vector3(
    shoulderPos.x,
    elbowPos.y - forearmLen * Math.cos(rad),
    elbowPos.z + forearmLen * Math.sin(rad)
  );

  if (isLeft) {
    pose.leftElbow.copy(elbowPos);
    pose.leftWrist.copy(wristPos);
  } else {
    pose.rightElbow.copy(elbowPos);
    pose.rightWrist.copy(wristPos);
  }
  return pose;
}

/**
 * ── 2. Shoulder Abduction (0° -> 170° Coronal Lateral Elevation) ───────────
 */
function getShoulderAbductionPose(angleDeg: number, side: 'left' | 'right' | 'bilateral'): SkeletonPose3D {
  const pose = clonePose3D(ANATOMICAL_REST_POSE);
  const rad = (angleDeg * Math.PI) / 180;
  const isLeft = side === 'left';
  const sign = isLeft ? 1 : -1;

  const upperArmLen = 0.28;
  const forearmLen = 0.26;

  const shoulderPos = isLeft ? pose.leftShoulder : pose.rightShoulder;
  const elbowPos = new THREE.Vector3(
    shoulderPos.x + sign * upperArmLen * Math.sin(rad),
    shoulderPos.y - upperArmLen * Math.cos(rad),
    shoulderPos.z
  );
  const wristPos = new THREE.Vector3(
    elbowPos.x + sign * forearmLen * Math.sin(rad),
    elbowPos.y - forearmLen * Math.cos(rad),
    elbowPos.z
  );

  if (isLeft) {
    pose.leftElbow.copy(elbowPos);
    pose.leftWrist.copy(wristPos);
  } else {
    pose.rightElbow.copy(elbowPos);
    pose.rightWrist.copy(wristPos);
  }
  return pose;
}

/**
 * ── 3. Arm Circumduction (360° Conical Glenohumeral Sweep) ─────────────────
 */
function getArmCircumductionPose(angleDeg: number, side: 'left' | 'right' | 'bilateral'): SkeletonPose3D {
  const pose = clonePose3D(ANATOMICAL_REST_POSE);
  const rad = (angleDeg * Math.PI) / 180;
  const isLeft = side === 'left';
  const sign = isLeft ? 1 : -1;

  const shoulderPos = isLeft ? pose.leftShoulder : pose.rightShoulder;
  const coneRadius = 0.16;

  const elbowPos = new THREE.Vector3(
    shoulderPos.x + sign * (0.04 + coneRadius * Math.sin(rad)),
    shoulderPos.y - 0.26,
    shoulderPos.z + coneRadius * Math.cos(rad)
  );
  const wristPos = new THREE.Vector3(
    elbowPos.x + sign * (0.04 + coneRadius * 1.5 * Math.sin(rad)),
    elbowPos.y - 0.24,
    elbowPos.z + coneRadius * 1.5 * Math.cos(rad)
  );

  if (isLeft) {
    pose.leftElbow.copy(elbowPos);
    pose.leftWrist.copy(wristPos);
  } else {
    pose.rightElbow.copy(elbowPos);
    pose.rightWrist.copy(wristPos);
  }
  return pose;
}

/**
 * ── 4. Ball Press (Bilateral Anterior Chest Press 0 -> 60mm) ──────────────
 */
function getBallPressPose(progressNorm: number, _side: 'left' | 'right' | 'bilateral'): SkeletonPose3D {
  const pose = clonePose3D(ANATOMICAL_REST_POSE);
  const compress = progressNorm * 0.08; // 0 to 8cm compression

  // Both arms extended anteriorly holding ball at chest level
  pose.leftShoulder.set(0.19, 1.38, 0);
  pose.rightShoulder.set(-0.19, 1.38, 0);

  pose.leftElbow.set(0.24 - compress * 0.5, 1.28, 0.20);
  pose.rightElbow.set(-0.24 + compress * 0.5, 1.28, 0.20);

  pose.leftWrist.set(0.12 - compress, 1.28, 0.36);
  pose.rightWrist.set(-0.12 + compress, 1.28, 0.36);

  return pose;
}

/**
 * ── 5. Cross-Body Shoulder Stretch (0° -> 110° Horizontal Adduction) ───────
 */
function getCrossBodyStretchPose(angleDeg: number, side: 'left' | 'right' | 'bilateral'): SkeletonPose3D {
  const pose = clonePose3D(ANATOMICAL_REST_POSE);
  const t = Math.min(1, Math.max(0, angleDeg / 110));
  const isLeft = side === 'left';

  if (isLeft) {
    // Left arm adducts across to right side
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
    // Right hand assists at left elbow
    if (t > 0.3) {
      pose.rightElbow.set(-0.20, 1.15, 0.12);
      pose.rightWrist.set(pose.leftElbow.x - 0.04, pose.leftElbow.y, pose.leftElbow.z + 0.02);
    }
  } else {
    // Right arm adducts across to left side
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
    if (t > 0.3) {
      pose.leftElbow.set(0.20, 1.15, 0.12);
      pose.leftWrist.set(pose.rightElbow.x + 0.04, pose.rightElbow.y, pose.rightElbow.z + 0.02);
    }
  }
  return pose;
}

/**
 * ── 6. Isometric Internal/External Rotation (0° -> 45° Transverse Plane) ──
 */
function getIsometricRotationPose(angleDeg: number, side: 'left' | 'right' | 'bilateral'): SkeletonPose3D {
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

/**
 * ── 7. Isometric Side Bending (0° -> 25° Coronal Lateral Trunk Flexion) ─────
 */
function getIsometricSideBendingPose(angleDeg: number, side: 'left' | 'right' | 'bilateral'): SkeletonPose3D {
  const pose = clonePose3D(ANATOMICAL_REST_POSE);
  const t = Math.min(1, Math.max(0, angleDeg / 25));
  const isLeft = side === 'left';
  const sign = isLeft ? 1 : -1;

  const dx = sign * t * 0.12;
  pose.spine.x += dx * 0.5;
  pose.chest.x += dx;
  pose.neck.x += dx * 1.2;
  pose.head.x += dx * 1.4;

  pose.leftShoulder.x += dx;
  pose.rightShoulder.x += dx;
  pose.leftElbow.x += dx;
  pose.rightElbow.x += dx;
  pose.leftWrist.x += dx;
  pose.rightWrist.x += dx;

  return pose;
}

/**
 * ── 8. Wrist Extension Stretch (0° -> 70° Dorsiflexion) ─────────────────────
 */
function getWristExtensionPose(_angleDeg: number, side: 'left' | 'right' | 'bilateral'): SkeletonPose3D {
  const pose = clonePose3D(ANATOMICAL_REST_POSE);
  const isLeft = side === 'left';

  if (isLeft) {
    pose.leftElbow.set(0.19, 1.38, 0.26);
    pose.leftWrist.set(0.19, 1.38, 0.52);
  } else {
    pose.rightElbow.set(-0.19, 1.38, 0.26);
    pose.rightWrist.set(-0.19, 1.38, 0.52);
  }
  return pose;
}

/**
 * ── 9. Ankle Plantar Flexion (0° -> 45° Plantarflexion) ────────────────────
 */
function getAnklePlantarFlexionPose(angleDeg: number, side: 'left' | 'right' | 'bilateral'): SkeletonPose3D {
  const pose = clonePose3D(ANATOMICAL_REST_POSE);
  const isLeft = side === 'left';
  const t = Math.min(1, Math.max(0, angleDeg / 45));

  if (isLeft) {
    pose.leftKnee.set(0.10, 0.52, 0.04);
    pose.leftAnkle.set(0.10, 0.14 + t * 0.04, -0.02 + t * 0.06);
  } else {
    pose.rightKnee.set(-0.10, 0.52, 0.04);
    pose.rightAnkle.set(-0.10, 0.14 + t * 0.04, -0.02 + t * 0.06);
  }
  return pose;
}

/**
 * ── 10. Seated Knee Extension (90° Flexion -> 0° Full Extension) ───────────
 */
function getSeatedKneeExtensionPose(angleDeg: number, side: 'left' | 'right' | 'bilateral'): SkeletonPose3D {
  const pose = clonePose3D(ANATOMICAL_REST_POSE);
  const isLeft = side === 'left';
  const progress = 1 - Math.min(1, Math.max(0, angleDeg / 90)); // 0 = bent (90°), 1 = straight (0°)

  // Seated base posture (Pelvis at chair height 0.60m)
  pose.pelvis.set(0, 0.60, 0);
  pose.spine.set(0, 0.80, 0);
  pose.chest.set(0, 1.00, 0);
  pose.neck.set(0, 1.15, 0);
  pose.head.set(0, 1.33, 0);

  pose.leftHip.set(0.10, 0.58, 0.02);
  pose.rightHip.set(-0.10, 0.58, 0.02);

  pose.leftKnee.set(0.10, 0.58, 0.38);
  pose.rightKnee.set(-0.10, 0.58, 0.38);

  // Inactive leg rests at 90° down to floor
  pose.leftAnkle.set(0.10, 0.16, 0.38);
  pose.rightAnkle.set(-0.10, 0.16, 0.38);

  // Active leg extends forward and upward
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

/**
 * ── 11. Straight-Leg Raise (0° -> 60° Supine/Standing Sagittal Hip Flexion) ─
 */
function getStraightLegRaisePose(angleDeg: number, side: 'left' | 'right' | 'bilateral'): SkeletonPose3D {
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

/**
 * Helper to build standard 4-phase demonstration keyframe sequence.
 */
function build4PhaseSequence(
  targetVal: number,
  targetUnit: string,
  poseBuilder: (val: number, side: 'left' | 'right' | 'bilateral') => SkeletonPose3D,
  side: 'left' | 'right' | 'bilateral'
): DemoKeyframe3D[] {
  return [
    {
      timeMs: 0,
      angleDeg: 0,
      phaseLabel: `Rest Position (0${targetUnit})`,
      pose: poseBuilder(0, side),
    },
    {
      timeMs: 1400,
      angleDeg: targetVal * 0.5,
      phaseLabel: `Ascending Movement (${Math.round(targetVal * 0.5)}${targetUnit})`,
      pose: poseBuilder(targetVal * 0.5, side),
    },
    {
      timeMs: 2800,
      angleDeg: targetVal,
      phaseLabel: `Target Reached (${targetVal}${targetUnit})`,
      pose: poseBuilder(targetVal, side),
    },
    {
      timeMs: 3800,
      angleDeg: targetVal,
      phaseLabel: `Target Hold (${targetVal}${targetUnit})`,
      pose: poseBuilder(targetVal, side),
    },
    {
      timeMs: 5200,
      angleDeg: 0,
      phaseLabel: `Controlled Return (0${targetUnit})`,
      pose: poseBuilder(0, side),
    },
  ];
}

/**
 * ── Global Registry of all 11 3D Biomechanics Protocols ────────────────────
 */
export const EXERCISE_3D_REGISTRY: Record<string, Exercise3DConfig> = {
  'shoulder-flexion': {
    exerciseId: 'shoulder-flexion',
    name: 'Shoulder Flexion',
    laterality: 'unilateral',
    targetMetric: '165°',
    targetAngle: 165,
    plane: 'Sagittal',
    activeJoints: (s) => (s === 'left' ? ['leftShoulder', 'leftElbow', 'leftWrist'] : ['rightShoulder', 'rightElbow', 'rightWrist']),
    getPoseForProgress: (p, s) => getShoulderFlexionPose(p * 165, s),
    generateSequence: (s) => build4PhaseSequence(165, '°', (v, side) => getShoulderFlexionPose(v, side), s),
  },
  'shoulder_flexion': {
    exerciseId: 'shoulder_flexion',
    name: 'Shoulder Flexion',
    laterality: 'unilateral',
    targetMetric: '165°',
    targetAngle: 165,
    plane: 'Sagittal',
    activeJoints: (s) => (s === 'left' ? ['leftShoulder', 'leftElbow', 'leftWrist'] : ['rightShoulder', 'rightElbow', 'rightWrist']),
    getPoseForProgress: (p, s) => getShoulderFlexionPose(p * 165, s),
    generateSequence: (s) => build4PhaseSequence(165, '°', (v, side) => getShoulderFlexionPose(v, side), s),
  },

  'shoulder-abduction': {
    exerciseId: 'shoulder-abduction',
    name: 'Shoulder Abduction',
    laterality: 'unilateral',
    targetMetric: '170°',
    targetAngle: 170,
    plane: 'Coronal',
    activeJoints: (s) => (s === 'left' ? ['leftShoulder', 'leftElbow', 'leftWrist'] : ['rightShoulder', 'rightElbow', 'rightWrist']),
    getPoseForProgress: (p, s) => getShoulderAbductionPose(p * 170, s),
    generateSequence: (s) => build4PhaseSequence(170, '°', (v, side) => getShoulderAbductionPose(v, side), s),
  },
  'shoulder_abduction': {
    exerciseId: 'shoulder_abduction',
    name: 'Shoulder Abduction',
    laterality: 'unilateral',
    targetMetric: '170°',
    targetAngle: 170,
    plane: 'Coronal',
    activeJoints: (s) => (s === 'left' ? ['leftShoulder', 'leftElbow', 'leftWrist'] : ['rightShoulder', 'rightElbow', 'rightWrist']),
    getPoseForProgress: (p, s) => getShoulderAbductionPose(p * 170, s),
    generateSequence: (s) => build4PhaseSequence(170, '°', (v, side) => getShoulderAbductionPose(v, side), s),
  },

  'arm-circumduction': {
    exerciseId: 'arm-circumduction',
    name: 'Arm Circumduction',
    laterality: 'unilateral',
    targetMetric: '360°',
    targetAngle: 360,
    plane: 'Multiplanar',
    activeJoints: (s) => (s === 'left' ? ['leftShoulder', 'leftElbow', 'leftWrist'] : ['rightShoulder', 'rightElbow', 'rightWrist']),
    getPoseForProgress: (p, s) => getArmCircumductionPose(p * 360, s),
    generateSequence: (s) => [
      { timeMs: 0, angleDeg: 0, phaseLabel: 'Start Circumduction', pose: getArmCircumductionPose(0, s) },
      { timeMs: 1200, angleDeg: 90, phaseLabel: 'Quadrant 1 (90°)', pose: getArmCircumductionPose(90, s) },
      { timeMs: 2400, angleDeg: 180, phaseLabel: 'Quadrant 2 (180°)', pose: getArmCircumductionPose(180, s) },
      { timeMs: 3600, angleDeg: 270, phaseLabel: 'Quadrant 3 (270°)', pose: getArmCircumductionPose(270, s) },
      { timeMs: 4800, angleDeg: 360, phaseLabel: 'Full Rotation (360°)', pose: getArmCircumductionPose(360, s) },
    ],
  },
  'arm_circumduction': {
    exerciseId: 'arm_circumduction',
    name: 'Arm Circumduction',
    laterality: 'unilateral',
    targetMetric: '360°',
    targetAngle: 360,
    plane: 'Multiplanar',
    activeJoints: (s) => (s === 'left' ? ['leftShoulder', 'leftElbow', 'leftWrist'] : ['rightShoulder', 'rightElbow', 'rightWrist']),
    getPoseForProgress: (p, s) => getArmCircumductionPose(p * 360, s),
    generateSequence: (s) => [
      { timeMs: 0, angleDeg: 0, phaseLabel: 'Start Circumduction', pose: getArmCircumductionPose(0, s) },
      { timeMs: 1200, angleDeg: 90, phaseLabel: 'Quadrant 1 (90°)', pose: getArmCircumductionPose(90, s) },
      { timeMs: 2400, angleDeg: 180, phaseLabel: 'Quadrant 2 (180°)', pose: getArmCircumductionPose(180, s) },
      { timeMs: 3600, angleDeg: 270, phaseLabel: 'Quadrant 3 (270°)', pose: getArmCircumductionPose(270, s) },
      { timeMs: 4800, angleDeg: 360, phaseLabel: 'Full Rotation (360°)', pose: getArmCircumductionPose(360, s) },
    ],
  },

  'ball-press': {
    exerciseId: 'ball-press',
    name: 'Ball Press',
    laterality: 'bilateral',
    targetMetric: '60 mm',
    targetAngle: 60,
    plane: 'Transverse',
    activeJoints: () => ['leftShoulder', 'rightShoulder', 'leftElbow', 'rightElbow', 'leftWrist', 'rightWrist'],
    getPoseForProgress: (p, s) => getBallPressPose(p, s),
    generateSequence: (s) => build4PhaseSequence(60, 'mm', (v) => getBallPressPose(v / 60, s), s),
  },
  'ball_press': {
    exerciseId: 'ball_press',
    name: 'Ball Press',
    laterality: 'bilateral',
    targetMetric: '60 mm',
    targetAngle: 60,
    plane: 'Transverse',
    activeJoints: () => ['leftShoulder', 'rightShoulder', 'leftElbow', 'rightElbow', 'leftWrist', 'rightWrist'],
    getPoseForProgress: (p, s) => getBallPressPose(p, s),
    generateSequence: (s) => build4PhaseSequence(60, 'mm', (v) => getBallPressPose(v / 60, s), s),
  },

  'cross-body-shoulder-stretch': {
    exerciseId: 'cross-body-shoulder-stretch',
    name: 'Cross-Body Shoulder Stretch',
    laterality: 'unilateral',
    targetMetric: '110°',
    targetAngle: 110,
    plane: 'Transverse',
    activeJoints: (s) => (s === 'left' ? ['leftShoulder', 'leftElbow', 'leftWrist', 'rightWrist'] : ['rightShoulder', 'rightElbow', 'rightWrist', 'leftWrist']),
    getPoseForProgress: (p, s) => getCrossBodyStretchPose(p * 110, s),
    generateSequence: (s) => build4PhaseSequence(110, '°', (v, side) => getCrossBodyStretchPose(v, side), s),
  },
  'cross_body_shoulder_stretch': {
    exerciseId: 'cross_body_shoulder_stretch',
    name: 'Cross-Body Shoulder Stretch',
    laterality: 'unilateral',
    targetMetric: '110°',
    targetAngle: 110,
    plane: 'Transverse',
    activeJoints: (s) => (s === 'left' ? ['leftShoulder', 'leftElbow', 'leftWrist', 'rightWrist'] : ['rightShoulder', 'rightElbow', 'rightWrist', 'leftWrist']),
    getPoseForProgress: (p, s) => getCrossBodyStretchPose(p * 110, s),
    generateSequence: (s) => build4PhaseSequence(110, '°', (v, side) => getCrossBodyStretchPose(v, side), s),
  },

  'isometric-rotation': {
    exerciseId: 'isometric-rotation',
    name: 'Isometric Rotation',
    laterality: 'unilateral',
    targetMetric: '45°',
    targetAngle: 45,
    plane: 'Transverse',
    activeJoints: (s) => (s === 'left' ? ['leftShoulder', 'leftElbow', 'leftWrist'] : ['rightShoulder', 'rightElbow', 'rightWrist']),
    getPoseForProgress: (p, s) => getIsometricRotationPose(p * 45, s),
    generateSequence: (s) => build4PhaseSequence(45, '°', (v, side) => getIsometricRotationPose(v, side), s),
  },
  'isometric_rotation': {
    exerciseId: 'isometric_rotation',
    name: 'Isometric Rotation',
    laterality: 'unilateral',
    targetMetric: '45°',
    targetAngle: 45,
    plane: 'Transverse',
    activeJoints: (s) => (s === 'left' ? ['leftShoulder', 'leftElbow', 'leftWrist'] : ['rightShoulder', 'rightElbow', 'rightWrist']),
    getPoseForProgress: (p, s) => getIsometricRotationPose(p * 45, s),
    generateSequence: (s) => build4PhaseSequence(45, '°', (v, side) => getIsometricRotationPose(v, side), s),
  },

  'isometric-side-bending': {
    exerciseId: 'isometric-side-bending',
    name: 'Isometric Side Bending',
    laterality: 'unilateral',
    targetMetric: '25°',
    targetAngle: 25,
    plane: 'Coronal',
    activeJoints: () => ['spine', 'chest', 'neck', 'head'],
    getPoseForProgress: (p, s) => getIsometricSideBendingPose(p * 25, s),
    generateSequence: (s) => build4PhaseSequence(25, '°', (v, side) => getIsometricSideBendingPose(v, side), s),
  },
  'isometric_side_bending': {
    exerciseId: 'isometric_side_bending',
    name: 'Isometric Side Bending',
    laterality: 'unilateral',
    targetMetric: '25°',
    targetAngle: 25,
    plane: 'Coronal',
    activeJoints: () => ['spine', 'chest', 'neck', 'head'],
    getPoseForProgress: (p, s) => getIsometricSideBendingPose(p * 25, s),
    generateSequence: (s) => build4PhaseSequence(25, '°', (v, side) => getIsometricSideBendingPose(v, side), s),
  },

  'wrist-extension-stretch': {
    exerciseId: 'wrist-extension-stretch',
    name: 'Wrist Extension Stretch',
    laterality: 'unilateral',
    targetMetric: '70°',
    targetAngle: 70,
    plane: 'Sagittal',
    activeJoints: (s) => (s === 'left' ? ['leftShoulder', 'leftElbow', 'leftWrist'] : ['rightShoulder', 'rightElbow', 'rightWrist']),
    getPoseForProgress: (p, s) => getWristExtensionPose(p * 70, s),
    generateSequence: (s) => build4PhaseSequence(70, '°', (v, side) => getWristExtensionPose(v, side), s),
  },
  'wrist_extension_stretch': {
    exerciseId: 'wrist_extension_stretch',
    name: 'Wrist Extension Stretch',
    laterality: 'unilateral',
    targetMetric: '70°',
    targetAngle: 70,
    plane: 'Sagittal',
    activeJoints: (s) => (s === 'left' ? ['leftShoulder', 'leftElbow', 'leftWrist'] : ['rightShoulder', 'rightElbow', 'rightWrist']),
    getPoseForProgress: (p, s) => getWristExtensionPose(p * 70, s),
    generateSequence: (s) => build4PhaseSequence(70, '°', (v, side) => getWristExtensionPose(v, side), s),
  },

  'ankle-plantar-flexion': {
    exerciseId: 'ankle-plantar-flexion',
    name: 'Ankle Plantar Flexion',
    laterality: 'unilateral',
    targetMetric: '45°',
    targetAngle: 45,
    plane: 'Sagittal',
    activeJoints: (s) => (s === 'left' ? ['leftKnee', 'leftAnkle'] : ['rightKnee', 'rightAnkle']),
    getPoseForProgress: (p, s) => getAnklePlantarFlexionPose(p * 45, s),
    generateSequence: (s) => build4PhaseSequence(45, '°', (v, side) => getAnklePlantarFlexionPose(v, side), s),
  },
  'ankle_plantar_flexion': {
    exerciseId: 'ankle_plantar_flexion',
    name: 'Ankle Plantar Flexion',
    laterality: 'unilateral',
    targetMetric: '45°',
    targetAngle: 45,
    plane: 'Sagittal',
    activeJoints: (s) => (s === 'left' ? ['leftKnee', 'leftAnkle'] : ['rightKnee', 'rightAnkle']),
    getPoseForProgress: (p, s) => getAnklePlantarFlexionPose(p * 45, s),
    generateSequence: (s) => build4PhaseSequence(45, '°', (v, side) => getAnklePlantarFlexionPose(v, side), s),
  },

  'knee-extension': {
    exerciseId: 'knee-extension',
    name: 'Seated Knee Extension',
    laterality: 'unilateral',
    targetMetric: '0°',
    targetAngle: 0,
    plane: 'Sagittal',
    activeJoints: (s) => (s === 'left' ? ['leftHip', 'leftKnee', 'leftAnkle'] : ['rightHip', 'rightKnee', 'rightAnkle']),
    getPoseForProgress: (p, s) => getSeatedKneeExtensionPose(90 * (1 - p), s),
    generateSequence: (s) => [
      { timeMs: 0, angleDeg: 90, phaseLabel: 'Seated 90° Knee Flexion', pose: getSeatedKneeExtensionPose(90, s) },
      { timeMs: 1400, angleDeg: 45, phaseLabel: 'Extending Tibia (45°)', pose: getSeatedKneeExtensionPose(45, s) },
      { timeMs: 2800, angleDeg: 0, phaseLabel: 'Full Knee Extension (0°)', pose: getSeatedKneeExtensionPose(0, s) },
      { timeMs: 3800, angleDeg: 0, phaseLabel: 'Hold Extension (0°)', pose: getSeatedKneeExtensionPose(0, s) },
      { timeMs: 5200, angleDeg: 90, phaseLabel: 'Controlled Return (90°)', pose: getSeatedKneeExtensionPose(90, s) },
    ],
  },
  'knee_extension': {
    exerciseId: 'knee_extension',
    name: 'Seated Knee Extension',
    laterality: 'unilateral',
    targetMetric: '0°',
    targetAngle: 0,
    plane: 'Sagittal',
    activeJoints: (s) => (s === 'left' ? ['leftHip', 'leftKnee', 'leftAnkle'] : ['rightHip', 'rightKnee', 'rightAnkle']),
    getPoseForProgress: (p, s) => getSeatedKneeExtensionPose(90 * (1 - p), s),
    generateSequence: (s) => [
      { timeMs: 0, angleDeg: 90, phaseLabel: 'Seated 90° Knee Flexion', pose: getSeatedKneeExtensionPose(90, s) },
      { timeMs: 1400, angleDeg: 45, phaseLabel: 'Extending Tibia (45°)', pose: getSeatedKneeExtensionPose(45, s) },
      { timeMs: 2800, angleDeg: 0, phaseLabel: 'Full Knee Extension (0°)', pose: getSeatedKneeExtensionPose(0, s) },
      { timeMs: 3800, angleDeg: 0, phaseLabel: 'Hold Extension (0°)', pose: getSeatedKneeExtensionPose(0, s) },
      { timeMs: 5200, angleDeg: 90, phaseLabel: 'Controlled Return (90°)', pose: getSeatedKneeExtensionPose(90, s) },
    ],
  },

  'straight-leg-raise': {
    exerciseId: 'straight-leg-raise',
    name: 'Straight-Leg Raise',
    laterality: 'unilateral',
    targetMetric: '60°',
    targetAngle: 60,
    plane: 'Sagittal',
    activeJoints: (s) => (s === 'left' ? ['leftHip', 'leftKnee', 'leftAnkle'] : ['rightHip', 'rightKnee', 'rightAnkle']),
    getPoseForProgress: (p, s) => getStraightLegRaisePose(p * 60, s),
    generateSequence: (s) => build4PhaseSequence(60, '°', (v, side) => getStraightLegRaisePose(v, side), s),
  },
  'straight_leg_raise': {
    exerciseId: 'straight_leg_raise',
    name: 'Straight-Leg Raise',
    laterality: 'unilateral',
    targetMetric: '60°',
    targetAngle: 60,
    plane: 'Sagittal',
    activeJoints: (s) => (s === 'left' ? ['leftHip', 'leftKnee', 'leftAnkle'] : ['rightHip', 'rightKnee', 'rightAnkle']),
    getPoseForProgress: (p, s) => getStraightLegRaisePose(p * 60, s),
    generateSequence: (s) => build4PhaseSequence(60, '°', (v, side) => getStraightLegRaisePose(v, side), s),
  },
};

/**
 * Retrieves 3D animation configuration for any exerciseId (with fallback).
 */
export function getExercise3DConfig(exerciseId: string): Exercise3DConfig {
  const norm = exerciseId.toLowerCase().trim();
  return EXERCISE_3D_REGISTRY[norm] ?? EXERCISE_3D_REGISTRY['shoulder-flexion'];
}
