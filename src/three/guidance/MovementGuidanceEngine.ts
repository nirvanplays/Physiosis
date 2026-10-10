/**
 * MovementGuidanceEngine.ts
 * Real-Time Visual Rehabilitation Guidance & Coaching State Machine.
 *
 * Responsibilities:
 *   1. Compares Current Patient Metric vs Therapeutic Target Metric.
 *   2. Calculates Movement Gap & Remaining Distance.
 *   3. Evaluates Real-Time Movement Quality & Trajectory Alignment.
 *   4. Generates Patient-Centered Actionable Instructions (Zero Diagnostic Jargon).
 *   5. Manages Isometric / Stretch Hold Timers.
 */

import { getExerciseMotion } from '../exercises/ExerciseMotionRegistry';

export type GuidanceState =
  | 'LOW_CONFIDENCE'
  | 'STARTING'
  | 'FAR_FROM_TARGET'
  | 'APPROACHING'
  | 'NEAR_TARGET'
  | 'TARGET_REACHED'
  | 'HOLD'
  | 'WRONG_DIRECTION';

export type MovementQuality = 'NEEDS_CORRECTION' | 'APPROACHING' | 'TARGET_REACHED' | 'HOLD';

export interface GuidanceEvaluation {
  state: GuidanceState;
  quality: MovementQuality;
  primaryMessage: string;
  directionalCue: string;
  currentValue: number;
  targetValue: number;
  gap: number;
  unit: string;
  progressPercent: number; // 0 - 100%
  isTargetReached: boolean;
  isHoldBased: boolean;
  holdSecondsElapsed?: number;
  holdTargetSeconds?: number;
  holdProgressPercent?: number; // 0 - 100%
}

export interface GuidanceInput {
  exerciseId: string;
  side: 'left' | 'right' | 'bilateral';
  currentValue: number | null | undefined;
  targetValue?: number;
  isConfidenceLow?: boolean;
  isStreaming?: boolean;
  holdTimeMs?: number;
  isWrongDirection?: boolean;
}

export class MovementGuidanceEngine {
  private holdStartTimestamp: number | null = null;
  private holdDurationMs = 2500; // Standard 2.5s hold for isometric/stretch holds

  public resetHold(): void {
    this.holdStartTimestamp = null;
  }

  /**
   * Evaluates current patient biomechanical telemetry against exercise target.
   */
  public evaluate(input: GuidanceInput): GuidanceEvaluation {
    const {
      exerciseId = 'shoulder-flexion',
      side = 'right',
      currentValue = 0,
      targetValue: propTargetValue,
      isConfidenceLow = false,
      holdTimeMs = 2500,
      isWrongDirection = false,
    } = input;

    // Use side in directional phrasing if appropriate
    const sidePrefix = side === 'bilateral' ? 'both limbs' : `${side} limb`;

    const motion = getExerciseMotion(exerciseId);
    const targetVal = propTargetValue ?? motion.targetMetricValue;
    const currentVal = Math.round(currentValue ?? 0);
    const unit = motion.targetMetricLabel.includes('mm') ? 'mm' : '°';
    const isHoldBased = motion.analysisType === 'isometric_hold' || motion.analysisType === 'stretch_hold';
    this.holdDurationMs = holdTimeMs;

    // Movement gap
    const gap = Math.max(0, targetVal - currentVal);
    const progressPercent = Math.min(100, Math.max(0, Math.round((currentVal / Math.max(1, targetVal)) * 100)));
    const isTargetReached = currentVal >= targetVal - 5;

    // Exercise-specific directional cues
    const normId = exerciseId.toLowerCase().replace(/_/g, '-');
    let directionalCue = '↗ Move toward target';
    let verbAction = 'move';

    if (normId.includes('flexion')) {
      directionalCue = '↗ Raise arm forward & upward';
      verbAction = 'raise your arm forward';
    } else if (normId.includes('abduction')) {
      directionalCue = '→ Raise arm sideways';
      verbAction = 'raise your arm sideways';
    } else if (normId.includes('circumduction')) {
      directionalCue = '↻ Follow circular arc';
      verbAction = 'sweep your arm in a circular arc';
    } else if (normId.includes('side-bending')) {
      directionalCue = '⤹ Bend torso laterally';
      verbAction = 'bend your torso laterally';
    } else if (normId.includes('wrist')) {
      directionalCue = '↑ Extend wrist upward';
      verbAction = 'extend your wrist upward';
    } else if (normId.includes('ankle')) {
      directionalCue = '↓ Raise heel & point toes';
      verbAction = 'raise your heel to point toes downward';
    } else if (normId.includes('knee-extension')) {
      directionalCue = '↗ Extend lower leg forward';
      verbAction = 'extend your lower leg forward';
    } else if (normId.includes('straight-leg')) {
      directionalCue = '↑ Raise straight leg';
      verbAction = 'raise your straight leg';
    } else if (normId.includes('ball-press')) {
      directionalCue = '→ Compress hands inward';
      verbAction = 'compress both hands inward';
    } else if (normId.includes('cross-body')) {
      directionalCue = '← Draw arm across chest';
      verbAction = 'draw your arm across your chest';
    } else if (normId.includes('rotation')) {
      directionalCue = '↷ Rotate forearm outward';
      verbAction = 'rotate your forearm outward';
    }

    // 1. Check Low Tracking Confidence
    if (isConfidenceLow) {
      return {
        state: 'LOW_CONFIDENCE',
        quality: 'NEEDS_CORRECTION',
        primaryMessage: 'Move into full view so your tracking landmarks can be calibrated.',
        directionalCue: '⛶ Position in frame',
        currentValue: currentVal,
        targetValue: targetVal,
        gap,
        unit,
        progressPercent,
        isTargetReached: false,
        isHoldBased,
      };
    }

    // 2. Check Wrong Direction Movement
    if (isWrongDirection && currentVal > 15 && !isTargetReached) {
      return {
        state: 'WRONG_DIRECTION',
        quality: 'NEEDS_CORRECTION',
        primaryMessage: `Move your ${sidePrefix} toward the highlighted target position.`,
        directionalCue,
        currentValue: currentVal,
        targetValue: targetVal,
        gap,
        unit,
        progressPercent,
        isTargetReached: false,
        isHoldBased,
      };
    }

    // 3. Target Reached & Hold State
    if (isTargetReached) {
      if (isHoldBased) {
        if (this.holdStartTimestamp === null) {
          this.holdStartTimestamp = performance.now();
        }

        const elapsedMs = performance.now() - this.holdStartTimestamp;
        const elapsedSec = Math.min(this.holdDurationMs / 1000, elapsedMs / 1000);
        const holdTargetSec = this.holdDurationMs / 1000;
        const holdProgressPercent = Math.min(100, Math.round((elapsedMs / this.holdDurationMs) * 100));

        const isHoldComplete = elapsedMs >= this.holdDurationMs;

        return {
          state: 'HOLD',
          quality: 'HOLD',
          primaryMessage: isHoldComplete ? 'Excellent! Target hold duration completed.' : 'Great — hold this therapeutic position.',
          directionalCue: '⏱ Maintain position',
          currentValue: currentVal,
          targetValue: targetVal,
          gap: 0,
          unit,
          progressPercent: 100,
          isTargetReached: true,
          isHoldBased: true,
          holdSecondsElapsed: Number(elapsedSec.toFixed(1)),
          holdTargetSeconds: holdTargetSec,
          holdProgressPercent,
        };
      }

      this.holdStartTimestamp = null;
      return {
        state: 'TARGET_REACHED',
        quality: 'TARGET_REACHED',
        primaryMessage: 'Great — target range reached! Return smoothly to starting position.',
        directionalCue: '✓ Target reached',
        currentValue: currentVal,
        targetValue: targetVal,
        gap: 0,
        unit,
        progressPercent: 100,
        isTargetReached: true,
        isHoldBased: false,
      };
    }

    // Reset hold timer if patient drops below target
    this.holdStartTimestamp = null;

    // 4. Starting / Resting Position
    if (currentVal < 15) {
      return {
        state: 'STARTING',
        quality: 'APPROACHING',
        primaryMessage: `Begin to ${verbAction} (${sidePrefix}) toward the highlighted target ghost.`,
        directionalCue,
        currentValue: currentVal,
        targetValue: targetVal,
        gap,
        unit,
        progressPercent,
        isTargetReached: false,
        isHoldBased,
      };
    }

    // 5. Near Target (5° < gap <= 15°)
    if (gap <= 15) {
      return {
        state: 'NEAR_TARGET',
        quality: 'APPROACHING',
        primaryMessage: `Almost there — ${verbAction.split(' ')[0]} a little more to meet the target.`,
        directionalCue: '↑ Almost at target',
        currentValue: currentVal,
        targetValue: targetVal,
        gap,
        unit,
        progressPercent,
        isTargetReached: false,
        isHoldBased,
      };
    }

    // 6. Approaching (15° < gap <= 35°)
    if (gap <= 35) {
      return {
        state: 'APPROACHING',
        quality: 'APPROACHING',
        primaryMessage: `Good — keep moving smoothly toward the target position.`,
        directionalCue,
        currentValue: currentVal,
        targetValue: targetVal,
        gap,
        unit,
        progressPercent,
        isTargetReached: false,
        isHoldBased,
      };
    }

    // 7. Far from Target (gap > 35°)
    return {
      state: 'FAR_FROM_TARGET',
      quality: 'NEEDS_CORRECTION',
      primaryMessage: `Continue to ${verbAction} toward the target reference position.`,
      directionalCue,
      currentValue: currentVal,
      targetValue: targetVal,
      gap,
      unit,
      progressPercent,
      isTargetReached: false,
      isHoldBased,
    };
  }
}

export const movementGuidanceEngine = new MovementGuidanceEngine();
