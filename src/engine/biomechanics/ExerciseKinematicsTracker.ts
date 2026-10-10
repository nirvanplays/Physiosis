/**
 * ExerciseKinematicsTracker.ts
 * Unified, stateful kinematics tracker that operates on any ExerciseDefinition.
 *
 * Handles per-frame angle smoothing (EMA α=0.32), repetition state transitions,
 * peak detection, quality scoring, and advisory feedback generation.
 */

import type { Landmark } from '../../types/pose';
import { clamp, lerp } from '../../utils/math';
import type { ExerciseDefinition } from '../exercise/ExerciseTypes';
import { getDefaultExercise } from '../exercise/ExerciseRegistry';
import type { MovementState, ShoulderFlexionAnalysis } from './biomechanicsTypes';
import { postureCompensationEngine } from './PostureCompensationEngine';

const ANGLE_SMOOTH_ALPHA = 0.32;

export class ExerciseKinematicsTracker {
  private exercise: ExerciseDefinition;
  private smoothedAngle: number | null = null;
  private peakAngle = 0;
  private totalReps = 0;
  private currentRep = 0;
  private lastRepPeak: number | null = null;
  private currentState: MovementState = 'WAITING';
  private previousAngle: number | null = null;
  private snapshot: ShoulderFlexionAnalysis;

  constructor(exercise: ExerciseDefinition = getDefaultExercise()) {
    this.exercise = exercise;
    this.snapshot = this.createEmptySnapshot();
  }

  setExercise(exercise: ExerciseDefinition): void {
    this.exercise = exercise;
    this.reset();
  }

  reset(): void {
    this.smoothedAngle = null;
    this.peakAngle = 0;
    this.totalReps = 0;
    this.currentRep = 0;
    this.lastRepPeak = null;
    this.currentState = 'WAITING';
    this.previousAngle = null;
    this.snapshot = this.createEmptySnapshot();
  }

  update(landmarks: Landmark[] | null): ShoulderFlexionAnalysis {
    if (!landmarks || landmarks.length === 0) {
      return this.publishWaiting();
    }

    const rawAngle = this.exercise.calculateMetric(landmarks, this.exercise.side);
    if (rawAngle === null) {
      return this.publishWaiting();
    }

    // Smooth angle with EMA filter
    this.smoothedAngle =
      this.smoothedAngle === null
        ? rawAngle
        : lerp(this.smoothedAngle, rawAngle, ANGLE_SMOOTH_ALPHA);

    const angle = Math.round(this.smoothedAngle * 10) / 10;
    const target = this.exercise.targetAngle;
    const startAngle = this.exercise.startAngle;
    const minAmplitude = this.exercise.minValidAmplitude;

    // Detect state
    const nextState = this.exercise.detectState(
      angle,
      this.previousAngle,
      this.currentState,
      this.peakAngle
    );

    // Repetition lifecycle
    if (nextState === 'LIFTING' || nextState === 'AT_TARGET') {
      if (this.currentRep === 0) {
        this.currentRep = this.totalReps + 1;
        this.peakAngle = angle;
      } else {
        this.peakAngle = Math.max(this.peakAngle, angle);
      }
    } else if (nextState === 'RETURNING') {
      this.peakAngle = Math.max(this.peakAngle, angle);
    } else if (nextState === 'READY' && this.currentRep > 0) {
      // Completed repetition
      if (this.peakAngle >= startAngle + minAmplitude) {
        this.totalReps += 1;
        this.lastRepPeak = Math.round(this.peakAngle);
      }
      this.currentRep = 0;
      this.peakAngle = 0;
    }

    this.currentState = nextState;
    this.previousAngle = angle;

    // Range percentage & quality score
    const deviation = Math.max(0, Math.round(target - angle));
    const rangePercentage = Math.round(clamp((angle / target) * 100, 0, 100));
    const score = Math.round(clamp(Math.sqrt(angle / target) * 100, 0, 100));

    // Confidence
    const avgConf =
      landmarks.reduce((acc, curr) => acc + (curr.visibility ?? 1), 0) /
      landmarks.length;

    const baseFeedback = this.exercise.getFeedback(
      this.currentState,
      angle,
      this.lastRepPeak
    );

    // Analyze postural integrity & abnormal compensations
    const postureResult = postureCompensationEngine.analyze({
      landmarks,
      exerciseId: this.exercise.id,
      side: this.exercise.side,
      currentAngle: angle,
    });

    const feedback =
      postureResult.isAbnormalDetected && postureResult.primaryFault
        ? `${postureResult.primaryFault.clinicalCue} (${baseFeedback})`
        : baseFeedback;

    this.snapshot = {
      angle: Math.round(angle),
      targetAngle: target,
      deviation,
      rangePercentage,
      state: this.currentState,
      score,
      repCount: this.totalReps,
      currentRep: this.currentRep,
      lastRepPeak: this.lastRepPeak,
      confidence: Math.round(avgConf * 100),
      feedback,
      postureResult,
    };

    return this.snapshot;
  }

  getSnapshot(): ShoulderFlexionAnalysis {
    return this.snapshot;
  }

  private publishWaiting(): ShoulderFlexionAnalysis {
    this.snapshot = {
      ...this.createEmptySnapshot(),
      repCount: this.totalReps,
      lastRepPeak: this.lastRepPeak,
    };
    return this.snapshot;
  }

  private createEmptySnapshot(): ShoulderFlexionAnalysis {
    return {
      angle: null,
      targetAngle: this.exercise.targetAngle,
      deviation: null,
      rangePercentage: null,
      state: 'WAITING',
      score: null,
      repCount: 0,
      currentRep: 0,
      lastRepPeak: null,
      confidence: null,
      feedback: this.exercise.getFeedback('WAITING', null, null),
    };
  }
}
