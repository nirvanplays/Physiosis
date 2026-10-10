/**
 * TargetPoseGenerator.ts
 * Authoritative 3D Target Reference Pose & Biomechanical Kinematics Generator.
 *
 * Provides exact, exercise-specific target poses for all 11 Physiosis protocols
 * with full Left/Right/Bilateral laterality support and custom target angle scaling.
 */

import type { SkeletonPose3D, JointName3D } from './SkeletonPose3D';
import {
  getExerciseMotion,
  type MovementPlane,
  type AnalysisType,
} from '../exercises/ExerciseMotionRegistry';

export interface TargetPoseInfo {
  exerciseId: string;
  name: string;
  side: 'left' | 'right' | 'bilateral';
  plane: MovementPlane;
  analysisType: AnalysisType;
  targetMetricLabel: string;
  targetMetricValue: number;
  activeJoints: JointName3D[];
  referencePose: SkeletonPose3D;
  targetPose: SkeletonPose3D;
  directionalCue: string;
}

/**
 * Returns the exact therapeutic target pose for an exercise and side.
 */
export function getTargetPose(
  exerciseId: string = 'shoulder-flexion',
  side: 'left' | 'right' | 'bilateral' = 'right',
  customTargetValue?: number
): SkeletonPose3D {
  const motion = getExerciseMotion(exerciseId);

  // If a custom target metric value is provided (e.g. patient-specific calibrated ROM),
  // scale target pose progress accordingly (1.0 = standard target)
  if (customTargetValue !== undefined && customTargetValue > 0 && motion.targetMetricValue > 0) {
    const progress = Math.min(1.2, Math.max(0.1, customTargetValue / motion.targetMetricValue));
    return motion.getPoseForProgress(progress, side);
  }

  return motion.targetPose(side);
}

/**
 * Returns comprehensive target pose metadata and directional cues.
 */
export function getTargetPoseInfo(
  exerciseId: string = 'shoulder-flexion',
  side: 'left' | 'right' | 'bilateral' = 'right',
  customTargetValue?: number
): TargetPoseInfo {
  const motion = getExerciseMotion(exerciseId);
  const targetVal = customTargetValue ?? motion.targetMetricValue;
  const targetPose = getTargetPose(exerciseId, side, customTargetValue);
  const referencePose = motion.referencePose(side);
  const activeJoints = motion.activeJoints(side);

  // Exercise-specific directional cue labels
  const normId = exerciseId.toLowerCase().replace(/_/g, '-');
  let directionalCue = '↗ Move toward target';

  if (normId.includes('flexion')) {
    directionalCue = '↗ Raise arm forward and upward';
  } else if (normId.includes('abduction')) {
    directionalCue = '→ Raise arm sideways and upward';
  } else if (normId.includes('circumduction')) {
    directionalCue = '↻ Follow 360° circular conical arc';
  } else if (normId.includes('side-bending')) {
    directionalCue = '⤹ Bend torso laterally';
  } else if (normId.includes('wrist')) {
    directionalCue = '↑ Extend wrist upward (dorsiflex)';
  } else if (normId.includes('ankle')) {
    directionalCue = '↓ Raise heel & point toes downward';
  } else if (normId.includes('knee-extension')) {
    directionalCue = '↗ Extend lower leg horizontally forward';
  } else if (normId.includes('straight-leg')) {
    directionalCue = '↑ Raise straight leg from hip';
  } else if (normId.includes('ball-press')) {
    directionalCue = '→ Compress hands inward toward chest';
  } else if (normId.includes('cross-body')) {
    directionalCue = '← Draw arm across chest to opposite shoulder';
  } else if (normId.includes('rotation')) {
    directionalCue = '↷ Rotate forearm outward (flank pinned)';
  }

  return {
    exerciseId: motion.exerciseId,
    name: motion.name,
    side,
    plane: motion.plane,
    analysisType: motion.analysisType,
    targetMetricLabel: motion.targetMetricLabel,
    targetMetricValue: targetVal,
    activeJoints,
    referencePose,
    targetPose,
    directionalCue,
  };
}
