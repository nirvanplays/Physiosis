/**
 * SkeletonPose3D.ts
 * Normalized 3D skeletal pose format, human anatomical proportions,
 * and hand-authored rehabilitation keyframe demonstrations.
 *
 * Coordinate system: Standard Three.js / Y-up (meters):
 *   +Y = Up
 *   +X = Patient's Left (Viewer's Right when facing front)
 *   -X = Patient's Right (Viewer's Left when facing front)
 *   +Z = Anterior (Forward toward camera)
 *   -Z = Posterior (Backward)
 */

import * as THREE from 'three';

export interface SkeletonPose3D {
  pelvis: THREE.Vector3;
  spine: THREE.Vector3;
  chest: THREE.Vector3;

  leftShoulder: THREE.Vector3;
  leftElbow: THREE.Vector3;
  leftWrist: THREE.Vector3;

  rightShoulder: THREE.Vector3;
  rightElbow: THREE.Vector3;
  rightWrist: THREE.Vector3;

  leftHip: THREE.Vector3;
  leftKnee: THREE.Vector3;
  leftAnkle: THREE.Vector3;

  rightHip: THREE.Vector3;
  rightKnee: THREE.Vector3;
  rightAnkle: THREE.Vector3;

  neck: THREE.Vector3;
  head: THREE.Vector3;
}

export type JointName3D = keyof SkeletonPose3D;

/**
 * Standard adult anatomical proportions in meters (Height ~1.72m).
 */
export const ANATOMICAL_REST_POSE: SkeletonPose3D = {
  pelvis: new THREE.Vector3(0, 0.95, 0),
  spine: new THREE.Vector3(0, 1.15, 0),
  chest: new THREE.Vector3(0, 1.35, 0),
  neck: new THREE.Vector3(0, 1.50, 0),
  head: new THREE.Vector3(0, 1.68, 0),

  // Left Arm (anatomical left: +X)
  leftShoulder: new THREE.Vector3(0.19, 1.42, 0),
  leftElbow: new THREE.Vector3(0.22, 1.14, -0.02),
  leftWrist: new THREE.Vector3(0.24, 0.88, 0.02),

  // Right Arm (anatomical right: -X)
  rightShoulder: new THREE.Vector3(-0.19, 1.42, 0),
  rightElbow: new THREE.Vector3(-0.22, 1.14, -0.02),
  rightWrist: new THREE.Vector3(-0.24, 0.88, 0.02),

  // Left Leg (+X)
  leftHip: new THREE.Vector3(0.10, 0.90, 0),
  leftKnee: new THREE.Vector3(0.10, 0.50, 0.02),
  leftAnkle: new THREE.Vector3(0.10, 0.08, 0),

  // Right Leg (-X)
  rightHip: new THREE.Vector3(-0.10, 0.90, 0),
  rightKnee: new THREE.Vector3(-0.10, 0.50, 0.02),
  rightAnkle: new THREE.Vector3(-0.10, 0.08, 0),
};

/**
 * Deep clones a SkeletonPose3D structure.
 */
export function clonePose3D(pose: SkeletonPose3D): SkeletonPose3D {
  return {
    pelvis: pose.pelvis.clone(),
    spine: pose.spine.clone(),
    chest: pose.chest.clone(),
    leftShoulder: pose.leftShoulder.clone(),
    leftElbow: pose.leftElbow.clone(),
    leftWrist: pose.leftWrist.clone(),
    rightShoulder: pose.rightShoulder.clone(),
    rightElbow: pose.rightElbow.clone(),
    rightWrist: pose.rightWrist.clone(),
    leftHip: pose.leftHip.clone(),
    leftKnee: pose.leftKnee.clone(),
    leftAnkle: pose.leftAnkle.clone(),
    rightHip: pose.rightHip.clone(),
    rightKnee: pose.rightKnee.clone(),
    rightAnkle: pose.rightAnkle.clone(),
    neck: pose.neck.clone(),
    head: pose.head.clone(),
  };
}

const _POSE_JOINT_KEYS: readonly JointName3D[] = [
  'pelvis',
  'spine',
  'chest',
  'neck',
  'head',
  'leftShoulder',
  'leftElbow',
  'leftWrist',
  'rightShoulder',
  'rightElbow',
  'rightWrist',
  'leftHip',
  'leftKnee',
  'leftAnkle',
  'rightHip',
  'rightKnee',
  'rightAnkle',
];

/**
 * In-place deep copy of all joint vectors from source to target.
 */
export function copyPose3D(source: SkeletonPose3D, target: SkeletonPose3D): void {
  for (let i = 0; i < _POSE_JOINT_KEYS.length; i++) {
    const key = _POSE_JOINT_KEYS[i];
    target[key].copy(source[key]);
  }
}

/**
 * Linearly interpolates between two 3D skeletal poses in-place with zero GC allocations.
 */
export function lerpPose3D(
  poseA: SkeletonPose3D,
  poseB: SkeletonPose3D,
  alpha: number,
  target: SkeletonPose3D
): void {
  const t = Math.max(0, Math.min(1, alpha));
  for (let i = 0; i < _POSE_JOINT_KEYS.length; i++) {
    const key = _POSE_JOINT_KEYS[i];
    target[key].lerpVectors(poseA[key], poseB[key], t);
  }
}

/**
 * Generates an anatomical Shoulder Flexion pose at a specific flexion angle in degrees (0° - 180°).
 *
 * Kinematics:
 *   Upper arm length = ~0.28m, Forearm length = ~0.26m
 *   Flexion rotates the arm forward into the +Z (sagittal) and +Y (overhead) plane.
 */
export function createShoulderFlexionPose(
  angleDeg: number,
  side: 'left' | 'right' = 'right'
): SkeletonPose3D {
  const pose = clonePose3D(ANATOMICAL_REST_POSE);
  const rad = (angleDeg * Math.PI) / 180;
  const isLeft = side === 'left';

  const shoulder = isLeft ? pose.leftShoulder : pose.rightShoulder;
  const elbow = isLeft ? pose.leftElbow : pose.rightElbow;
  const wrist = isLeft ? pose.leftWrist : pose.rightWrist;

  const upperArmLen = 0.28;
  const forearmLen = 0.26;

  // At 0°: arm hangs straight down (Y: -upperArmLen, Z: 0)
  // At 90°: arm straight forward (Y: 0, Z: +upperArmLen)
  // At 165° / 180°: arm elevated overhead (Y: +upperArmLen * cos, Z: +upperArmLen * sin)
  const dyUpper = -Math.cos(rad) * upperArmLen;
  const dzUpper = Math.sin(rad) * upperArmLen;

  elbow.set(shoulder.x + (isLeft ? 0.02 : -0.02), shoulder.y + dyUpper, shoulder.z + dzUpper);

  // Slight natural elbow flexion of 5° during elevation
  const elbowFlexRad = (5 * Math.PI) / 180;
  const netAngle = rad + elbowFlexRad;
  const dyFore = -Math.cos(netAngle) * forearmLen;
  const dzFore = Math.sin(netAngle) * forearmLen;

  wrist.set(elbow.x, elbow.y + dyFore, elbow.z + dzFore);

  return pose;
}

/**
 * Hand-authored keyframe sequence for Shoulder Flexion (0° -> 30° -> 60° -> 90° -> 120° -> 150° -> 165° -> 0°).
 */
export interface DemoKeyframe3D {
  timeMs: number;
  angleDeg: number;
  pose: SkeletonPose3D;
  phaseLabel: string;
}

export function generateShoulderFlexionDemoSequence(
  side: 'left' | 'right' = 'right'
): DemoKeyframe3D[] {
  const angles = [
    { angle: 0, timeMs: 0, label: 'Rest Position (0°)' },
    { angle: 30, timeMs: 800, label: 'Initiation (30°)' },
    { angle: 60, timeMs: 1600, label: 'Early Elevation (60°)' },
    { angle: 90, timeMs: 2500, label: 'Horizontal Plane (90°)' },
    { angle: 120, timeMs: 3400, label: 'Mid Elevation (120°)' },
    { angle: 150, timeMs: 4200, label: 'Late Elevation (150°)' },
    { angle: 165, timeMs: 5000, label: 'Target Reached (165°)' },
    { angle: 165, timeMs: 6500, label: 'Target Hold (165°)' },
    { angle: 120, timeMs: 7600, label: 'Controlled Descent (120°)' },
    { angle: 60, timeMs: 8800, label: 'Controlled Descent (60°)' },
    { angle: 0, timeMs: 10000, label: 'Return to Rest (0°)' },
  ];

  return angles.map((item) => ({
    timeMs: item.timeMs,
    angleDeg: item.angle,
    pose: createShoulderFlexionPose(item.angle, side),
    phaseLabel: item.label,
  }));
}
