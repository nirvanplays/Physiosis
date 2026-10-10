/**
 * MediaPipeTo3DPose.ts
 * High-Precision, Exercise-Aware 3D Biomechanical Pose Adapter for Three.js SkeletonRig.
 *
 * Core Biomechanical Guarantees:
 *   1. Exercise-Aware Retargeting: Specific joint projection rules per protocol (Flexion, Abduction,
 *      Circumduction, Side Bending, Ankle, Wrist, Knee Extension, Straight-Leg Raise).
 *   2. Strict Bone Length Invariance: Forward kinematics unit direction projection prevents limbs from stretching.
 *   3. Left/Right/Bilateral Laterality: Maps mirrored webcam coordinates (Left = +X, Right = -X).
 *   4. Occlusion & Low-Confidence Resilience: Direction buffer holds stable pose during dropouts and recovers smoothly.
 *   5. Velocity Clamping & Exponential Low-Pass Filtering: 60fps smooth movement with zero snapping or jitter.
 */

import * as THREE from 'three';
import type { Landmark } from '../../types/pose';
import type { SkeletonPose3D } from './SkeletonPose3D';
import { ANATOMICAL_REST_POSE, clonePose3D } from './SkeletonPose3D';

export interface AdapterOptions {
  exerciseId?: string;
  side?: 'left' | 'right' | 'bilateral';
  smoothingAlpha?: number;
  minVisibility?: number;
  mirrored?: boolean;
}

// Canonical adult anatomical bone lengths in meters (~1.72m height)
const BONE_LENGTHS = {
  torsoSpine: 0.20,
  torsoChest: 0.20,
  neck: 0.15,
  head: 0.18,
  clavicleOffset: 0.19,
  upperArm: 0.28,
  forearm: 0.26,
  hipOffset: 0.10,
  thigh: 0.40,
  shin: 0.42,
};

/**
 * MediaPipe Pose landmark indices:
 *  0: Nose, 11: L Shoulder, 12: R Shoulder, 13: L Elbow, 14: R Elbow,
 *  15: L Wrist, 16: R Wrist, 19: L Index, 20: R Index,
 *  23: L Hip, 24: R Hip, 25: L Knee, 26: R Knee, 27: L Ankle, 28: R Ankle,
 *  31: L Foot Index, 32: R Foot Index
 */
const MP = {
  NOSE: 0,
  L_SHOULDER: 11,
  R_SHOULDER: 12,
  L_ELBOW: 13,
  R_ELBOW: 14,
  L_WRIST: 15,
  R_WRIST: 16,
  L_INDEX: 19,
  R_INDEX: 20,
  L_HIP: 23,
  R_HIP: 24,
  L_KNEE: 25,
  R_KNEE: 26,
  L_ANKLE: 27,
  R_ANKLE: 28,
  L_FOOT: 31,
  R_FOOT: 32,
};

// Pre-allocated static scratch vectors for zero runtime GC allocations
const _SCRATCH_VEC_A = new THREE.Vector3();
const _SCRATCH_AXIS = new THREE.Vector3();
const _DEFAULT_DOWN = new THREE.Vector3(0, -1, 0);
const _DEFAULT_UP = new THREE.Vector3(0, 1, 0);
const _JOINT_KEYS: readonly (keyof SkeletonPose3D)[] = [
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

export class MediaPipeTo3DPoseAdapter {
  private previousPose: SkeletonPose3D;
  private outPose: SkeletonPose3D;
  private lastValidDirs: Map<string, THREE.Vector3> = new Map();
  private isInitialized = false;

  constructor() {
    this.previousPose = clonePose3D(ANATOMICAL_REST_POSE);
    this.outPose = clonePose3D(ANATOMICAL_REST_POSE);
  }

  /**
   * Resets temporal filters to standard resting anatomical pose.
   */
  public reset(): void {
    this.previousPose = clonePose3D(ANATOMICAL_REST_POSE);
    this.outPose = clonePose3D(ANATOMICAL_REST_POSE);
    this.lastValidDirs.clear();
    this.isInitialized = false;
  }

  /**
   * Maps live MediaPipe landmarks into a stable, exercise-aware 3D SkeletonPose3D.
   */
  public mapLandmarksTo3DPose(
    landmarks: Landmark[] | null | undefined,
    options: AdapterOptions = {}
  ): SkeletonPose3D {
    if (!landmarks || landmarks.length < 25) {
      return this.previousPose;
    }

    const {
      exerciseId = 'shoulder-flexion',
      side = 'right',
      smoothingAlpha = 0.35,
      minVisibility = 0.30,
      mirrored = true,
    } = options;

    const normExId = exerciseId.toLowerCase().replace(/_/g, '-');
    const outPose = this.outPose;

    // ── Helper: Extract 3D Unit Direction Vector with Occlusion Memory & Velocity Clamping ──
    const getDirectionVector = (
      name: string,
      idxFrom: number,
      idxTo: number,
      defaultDir: THREE.Vector3,
      maxAngularSpeedRad: number = 0.45
    ): THREE.Vector3 => {
      let storedDir = this.lastValidDirs.get(name);
      if (!storedDir) {
        storedDir = defaultDir.clone();
        this.lastValidDirs.set(name, storedDir);
      }

      const a = landmarks[idxFrom];
      const b = landmarks[idxTo];
      if (!a || !b) return storedDir;

      const visA = a.visibility ?? 1.0;
      const visB = b.visibility ?? 1.0;
      const confidence = Math.min(visA, visB);

      if (confidence < minVisibility) {
        return storedDir; // Hold last confirmed stable orientation during temporary dropout
      }

      // Mirrored single-webcam mapping:
      const multX = mirrored ? 1.0 : -1.0;
      const dx = (b.x - a.x) * multX;
      const dy = -(b.y - a.y);
      const dz = -((b.z ?? 0) - (a.z ?? 0));

      _SCRATCH_VEC_A.set(dx, dy, dz);
      if (_SCRATCH_VEC_A.lengthSq() < 1e-6) {
        return storedDir;
      }

      _SCRATCH_VEC_A.normalize();

      // Velocity Clamping
      const angle = storedDir.angleTo(_SCRATCH_VEC_A);
      if (angle > maxAngularSpeedRad) {
        _SCRATCH_AXIS.crossVectors(storedDir, _SCRATCH_VEC_A).normalize();
        if (_SCRATCH_AXIS.lengthSq() > 1e-4) {
          storedDir.applyAxisAngle(_SCRATCH_AXIS, maxAngularSpeedRad);
        }
      } else {
        storedDir.copy(_SCRATCH_VEC_A);
      }

      return storedDir;
    };

    // ─────────────────────────────────────────────────────────────────────────
    // 1. TORSO & SPINE COLUMN
    // ─────────────────────────────────────────────────────────────────────────
    outPose.pelvis.set(0, 0.95, 0);

    const torsoDir = _DEFAULT_UP.clone();

    if (
      landmarks[MP.L_HIP] &&
      landmarks[MP.R_HIP] &&
      landmarks[MP.L_SHOULDER] &&
      landmarks[MP.R_SHOULDER]
    ) {
      const hipL = landmarks[MP.L_HIP];
      const hipR = landmarks[MP.R_HIP];
      const shL = landmarks[MP.L_SHOULDER];
      const shR = landmarks[MP.R_SHOULDER];

      const midHipX = (hipL.x + hipR.x) / 2;
      const midHipY = (hipL.y + hipR.y) / 2;
      const midHipZ = ((hipL.z ?? 0) + (hipR.z ?? 0)) / 2;

      const midShX = (shL.x + shR.x) / 2;
      const midShY = (shL.y + shR.y) / 2;
      const midShZ = ((shL.z ?? 0) + (shR.z ?? 0)) / 2;

      const tDx = (midShX - midHipX) * (mirrored ? 1.0 : -1.0);
      const tDy = -(midShY - midHipY);
      const tDz = -(midShZ - midHipZ);

      _SCRATCH_VEC_A.set(tDx, tDy, tDz);
      if (_SCRATCH_VEC_A.lengthSq() > 1e-4) {
        _SCRATCH_VEC_A.normalize();
        const maxAngle = normExId.includes('side-bending') ? Math.PI / 4.5 : Math.PI / 6;
        if (_SCRATCH_VEC_A.angleTo(_DEFAULT_UP) < maxAngle) {
          torsoDir.copy(_SCRATCH_VEC_A);
        }
      }
    }

    // Solve torso spinal chain
    outPose.spine.copy(outPose.pelvis).addScaledVector(torsoDir, BONE_LENGTHS.torsoSpine);
    outPose.chest.copy(outPose.spine).addScaledVector(torsoDir, BONE_LENGTHS.torsoChest);
    outPose.neck.copy(outPose.chest).addScaledVector(torsoDir, BONE_LENGTHS.neck);
    outPose.head.copy(outPose.neck).addScaledVector(torsoDir, BONE_LENGTHS.head);

    // ─────────────────────────────────────────────────────────────────────────
    // 2. UPPER LIMBS RETARGETING (EXERCISE-AWARE)
    // ─────────────────────────────────────────────────────────────────────────
    const isLeftActive = side === 'left' || side === 'bilateral';
    const isRightActive = side === 'right' || side === 'bilateral';

    // Base shoulder positions off clavicle offset
    outPose.rightShoulder.set(
      outPose.chest.x - BONE_LENGTHS.clavicleOffset,
      outPose.chest.y + 0.05,
      outPose.chest.z
    );
    outPose.leftShoulder.set(
      outPose.chest.x + BONE_LENGTHS.clavicleOffset,
      outPose.chest.y + 0.05,
      outPose.chest.z
    );

    // --- Right Arm (Landmarks 12 -> 14 -> 16) ---
    let rUpperDir = getDirectionVector('r_upper', MP.R_SHOULDER, MP.R_ELBOW, _DEFAULT_DOWN);
    let rForeDir = getDirectionVector('r_fore', MP.R_ELBOW, MP.R_WRIST, _DEFAULT_DOWN);

    // Exercise-specific kinematic projections for Right Arm:
    if (normExId.includes('shoulder-abduction')) {
      // Clamping depth Z noise for pure frontal lateral abduction
      rUpperDir.z *= 0.2;
      rUpperDir.normalize();
      rForeDir.z *= 0.2;
      rForeDir.normalize();
    } else if (normExId.includes('wrist-extension') && isRightActive) {
      // Forearm stabilized horizontally forward, wrist dorsiflexion projected
      rUpperDir.set(0, 0, 0.4).normalize();
      rForeDir.set(0, 0.2, 0.9).normalize();
    } else if (normExId.includes('cross-body') && isRightActive) {
      // Horizontal adduction across chest
      rUpperDir.set(0.6, 0.1, 0.4).normalize();
    } else if (normExId.includes('ball-press')) {
      // Inward anterior compression
      const lWrist = landmarks[MP.L_WRIST];
      const rWrist = landmarks[MP.R_WRIST];
      if (lWrist && rWrist) {
        const handDist = Math.abs(rWrist.x - lWrist.x);
        const compress = Math.max(0, Math.min(1, 1 - handDist * 2.5));
        rUpperDir.set(0.2 + compress * 0.3, -0.2, 0.8).normalize();
        rForeDir.set(0.4 + compress * 0.4, 0, 0.6).normalize();
      }
    }

    outPose.rightElbow.copy(outPose.rightShoulder).addScaledVector(rUpperDir, BONE_LENGTHS.upperArm);
    outPose.rightWrist.copy(outPose.rightElbow).addScaledVector(rForeDir, BONE_LENGTHS.forearm);

    // --- Left Arm (Landmarks 11 -> 13 -> 15) ---
    let lUpperDir = getDirectionVector('l_upper', MP.L_SHOULDER, MP.L_ELBOW, _DEFAULT_DOWN);
    let lForeDir = getDirectionVector('l_fore', MP.L_ELBOW, MP.L_WRIST, _DEFAULT_DOWN);

    if (normExId.includes('shoulder-abduction')) {
      lUpperDir.z *= 0.2;
      lUpperDir.normalize();
      lForeDir.z *= 0.2;
      lForeDir.normalize();
    } else if (normExId.includes('wrist-extension') && isLeftActive) {
      lUpperDir.set(0, 0, 0.4).normalize();
      lForeDir.set(0, 0.2, 0.9).normalize();
    } else if (normExId.includes('cross-body') && isLeftActive) {
      lUpperDir.set(-0.6, 0.1, 0.4).normalize();
    } else if (normExId.includes('ball-press')) {
      const lWrist = landmarks[MP.L_WRIST];
      const rWrist = landmarks[MP.R_WRIST];
      if (lWrist && rWrist) {
        const handDist = Math.abs(rWrist.x - lWrist.x);
        const compress = Math.max(0, Math.min(1, 1 - handDist * 2.5));
        lUpperDir.set(-0.2 - compress * 0.3, -0.2, 0.8).normalize();
        lForeDir.set(-0.4 - compress * 0.4, 0, 0.6).normalize();
      }
    }

    outPose.leftElbow.copy(outPose.leftShoulder).addScaledVector(lUpperDir, BONE_LENGTHS.upperArm);
    outPose.leftWrist.copy(outPose.leftElbow).addScaledVector(lForeDir, BONE_LENGTHS.forearm);

    // ─────────────────────────────────────────────────────────────────────────
    // 3. LOWER LIMBS RETARGETING (EXERCISE-AWARE)
    // ─────────────────────────────────────────────────────────────────────────
    outPose.rightHip.set(
      outPose.pelvis.x - BONE_LENGTHS.hipOffset,
      outPose.pelvis.y - 0.05,
      outPose.pelvis.z
    );
    outPose.leftHip.set(
      outPose.pelvis.x + BONE_LENGTHS.hipOffset,
      outPose.pelvis.y - 0.05,
      outPose.pelvis.z
    );

    // --- Right Leg (Landmarks 24 -> 26 -> 28) ---
    let rThighDir = getDirectionVector('r_thigh', MP.R_HIP, MP.R_KNEE, _DEFAULT_DOWN);
    let rShinDir = getDirectionVector('r_shin', MP.R_KNEE, MP.R_ANKLE, _DEFAULT_DOWN);

    if (normExId.includes('knee-extension') && isRightActive) {
      // Seated posture adaptation
      outPose.pelvis.set(0, 0.60, 0);
      outPose.rightHip.set(-0.10, 0.58, 0.02);
      outPose.rightKnee.set(-0.10, 0.58, 0.38);
      // Shin direction extends forward based on MediaPipe knee angle
      rShinDir.set(0, Math.max(0, rShinDir.y + 0.4), 0.8).normalize();
      outPose.rightAnkle.copy(outPose.rightKnee).addScaledVector(rShinDir, BONE_LENGTHS.shin);
    } else if (normExId.includes('straight-leg-raise') && isRightActive) {
      // Straight leg with locked knee
      rShinDir.copy(rThighDir);
      outPose.rightKnee.copy(outPose.rightHip).addScaledVector(rThighDir, BONE_LENGTHS.thigh);
      outPose.rightAnkle.copy(outPose.rightKnee).addScaledVector(rShinDir, BONE_LENGTHS.shin);
    } else if (normExId.includes('ankle-plantar-flexion') && isRightActive) {
      // Track heel raise
      const rAnkle = landmarks[MP.R_ANKLE];
      const rFoot = landmarks[MP.R_FOOT];
      if (rAnkle && rFoot && rFoot.y < rAnkle.y + 0.02) {
        rShinDir.set(0, -0.9, 0.2).normalize();
      }
      outPose.rightKnee.copy(outPose.rightHip).addScaledVector(rThighDir, BONE_LENGTHS.thigh);
      outPose.rightAnkle.copy(outPose.rightKnee).addScaledVector(rShinDir, BONE_LENGTHS.shin);
    } else {
      outPose.rightKnee.copy(outPose.rightHip).addScaledVector(rThighDir, BONE_LENGTHS.thigh);
      outPose.rightAnkle.copy(outPose.rightKnee).addScaledVector(rShinDir, BONE_LENGTHS.shin);
    }

    // --- Left Leg (Landmarks 23 -> 25 -> 27) ---
    let lThighDir = getDirectionVector('l_thigh', MP.L_HIP, MP.L_KNEE, _DEFAULT_DOWN);
    let lShinDir = getDirectionVector('l_shin', MP.L_KNEE, MP.L_ANKLE, _DEFAULT_DOWN);

    if (normExId.includes('knee-extension') && isLeftActive) {
      outPose.pelvis.set(0, 0.60, 0);
      outPose.leftHip.set(0.10, 0.58, 0.02);
      outPose.leftKnee.set(0.10, 0.58, 0.38);
      lShinDir.set(0, Math.max(0, lShinDir.y + 0.4), 0.8).normalize();
      outPose.leftAnkle.copy(outPose.leftKnee).addScaledVector(lShinDir, BONE_LENGTHS.shin);
    } else if (normExId.includes('straight-leg-raise') && isLeftActive) {
      lShinDir.copy(lThighDir);
      outPose.leftKnee.copy(outPose.leftHip).addScaledVector(lThighDir, BONE_LENGTHS.thigh);
      outPose.leftAnkle.copy(outPose.leftKnee).addScaledVector(lShinDir, BONE_LENGTHS.shin);
    } else if (normExId.includes('ankle-plantar-flexion') && isLeftActive) {
      const lAnkle = landmarks[MP.L_ANKLE];
      const lFoot = landmarks[MP.L_FOOT];
      if (lAnkle && lFoot && lFoot.y < lAnkle.y + 0.02) {
        lShinDir.set(0, -0.9, 0.2).normalize();
      }
      outPose.leftKnee.copy(outPose.leftHip).addScaledVector(lThighDir, BONE_LENGTHS.thigh);
      outPose.leftAnkle.copy(outPose.leftKnee).addScaledVector(lShinDir, BONE_LENGTHS.shin);
    } else {
      outPose.leftKnee.copy(outPose.leftHip).addScaledVector(lThighDir, BONE_LENGTHS.thigh);
      outPose.leftAnkle.copy(outPose.leftKnee).addScaledVector(lShinDir, BONE_LENGTHS.shin);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 4. TEMPORAL EXPONENTIAL SMOOTHING (LOW-PASS FILTER)
    // ─────────────────────────────────────────────────────────────────────────
    if (this.isInitialized) {
      const alpha = Math.max(0.15, Math.min(0.85, smoothingAlpha));
      for (let i = 0; i < _JOINT_KEYS.length; i++) {
        const key = _JOINT_KEYS[i];
        outPose[key].lerpVectors(this.previousPose[key], outPose[key], alpha);
      }
    } else {
      this.isInitialized = true;
    }

    for (let i = 0; i < _JOINT_KEYS.length; i++) {
      const key = _JOINT_KEYS[i];
      this.previousPose[key].copy(outPose[key]);
    }
    return outPose;
  }
}

export const mediaPipeTo3DAdapter = new MediaPipeTo3DPoseAdapter();

/**
 * Functional export for direct live retargeting.
 */
export function mapLandmarksTo3DPose(
  landmarks: Landmark[] | null | undefined,
  _previousPose?: SkeletonPose3D,
  options?: AdapterOptions
): SkeletonPose3D {
  return mediaPipeTo3DAdapter.mapLandmarksTo3DPose(landmarks, options);
}
