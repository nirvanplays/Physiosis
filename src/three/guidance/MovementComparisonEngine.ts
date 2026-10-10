/**
 * MovementComparisonEngine.ts
 * Real-Time Current vs Target Kinematic Comparison Engine.
 *
 * Compares live patient biomechanical measurements against authoritative target poses,
 * computing signed differences, completion percentages, exercise-specific directions,
 * and adaptive patient-centered coaching guidance.
 */

import { getExerciseMotion } from '../exercises/ExerciseMotionRegistry';

export type ComparisonState =
  | 'WAITING'
  | 'START'
  | 'MOVING'
  | 'APPROACHING'
  | 'NEAR_TARGET'
  | 'TARGET_REACHED'
  | 'HOLD'
  | 'LIMITED'
  | 'LOW_CONFIDENCE';

export type TargetDirection =
  | 'UP/FORWARD'
  | 'UP/SIDE'
  | 'EXTEND'
  | 'UPWARD'
  | 'PLANTAR'
  | 'EXTEND WRIST'
  | 'FOLLOW ARC'
  | 'COMPRESS'
  | 'ROTATE OUTWARD'
  | 'LATERAL BEND'
  | 'ADDUCT';

export interface MovementComparison {
  primaryInstruction: string;
  currentValue: number;
  targetValue: number;
  difference: number; // Signed distance remaining: Math.max(0, targetValue - currentValue)
  completionPercentage: number; // 0 - 100%
  direction: TargetDirection;
  state: ComparisonState;
  unit: string;
  actionInstruction: string;
  directionalCue: string;
  qualityBadge: string;
  isTargetReached: boolean;
  isHoldBased: boolean;
  holdSecondsElapsed?: number;
  holdTargetSeconds?: number;
  holdProgressPercent?: number;
  holdStabilityScore?: number;
}

export interface ComparisonInput {
  exerciseId: string;
  side: 'left' | 'right' | 'bilateral';
  currentValue: number | null | undefined;
  targetValue?: number;
  isConfidenceLow?: boolean;
  isStreaming?: boolean;
  isLimitationDetected?: boolean;
  stabilityScore?: number;
  holdDurationMs?: number;
}

export class MovementComparisonEngine {
  private holdStartTimestamp: number | null = null;
  private holdDurationMs = 2500;
  private stabilitySamples: number[] = [];

  public resetHold(): void {
    this.holdStartTimestamp = null;
    this.stabilitySamples = [];
  }

  /**
   * Compares real-time patient kinematics with configured target pose.
   */
  public compare(input: ComparisonInput): MovementComparison {
    const {
      exerciseId = 'shoulder-flexion',
      side = 'right',
      currentValue = 0,
      targetValue: propTargetValue,
      isConfidenceLow = false,
      isStreaming = false,
      isLimitationDetected = false,
      stabilityScore,
      holdDurationMs = 2500,
    } = input;

    const motion = getExerciseMotion(exerciseId);
    const targetVal = propTargetValue ?? motion.targetMetricValue;
    const currentVal = Math.round(currentValue ?? 0);
    const unit = motion.targetMetricLabel.includes('mm') ? 'mm' : '°';
    const isHoldBased = motion.analysisType === 'isometric_hold' || motion.analysisType === 'stretch_hold';
    this.holdDurationMs = holdDurationMs;

    const difference = Math.max(0, targetVal - currentVal);
    const completionPercentage = Math.min(
      100,
      Math.max(0, Math.round((currentVal / Math.max(1, targetVal)) * 100))
    );
    const isTargetReached = currentVal >= targetVal - 5;

    // ── Exercise-Specific Target Direction & Descriptive Labels ──
    const normId = exerciseId.toLowerCase().replace(/_/g, '-');
    let direction: TargetDirection = 'UP/FORWARD';
    let directionalCue = '↗ Raise arm';
    let simpleVerb = 'Raise your arm';

    if (normId.includes('flexion')) {
      direction = 'UP/FORWARD';
      directionalCue = '↗ Raise arm';
      simpleVerb = 'Raise your arm';
    } else if (normId.includes('abduction')) {
      direction = 'UP/SIDE';
      directionalCue = '→ Lift arm';
      simpleVerb = 'Lift your arm';
    } else if (normId.includes('circumduction')) {
      direction = 'FOLLOW ARC';
      directionalCue = '↻ Follow arc';
      simpleVerb = 'Follow the circle';
    } else if (normId.includes('side-bending')) {
      direction = 'LATERAL BEND';
      directionalCue = '⤹ Bend torso';
      simpleVerb = 'Bend your torso';
    } else if (normId.includes('wrist')) {
      direction = 'EXTEND WRIST';
      directionalCue = '↑ Extend wrist';
      simpleVerb = 'Extend your wrist';
    } else if (normId.includes('ankle')) {
      direction = 'PLANTAR';
      directionalCue = '↓ Raise heel';
      simpleVerb = 'Raise your heel';
    } else if (normId.includes('knee-extension')) {
      direction = 'EXTEND';
      directionalCue = '↗ Straighten leg';
      simpleVerb = 'Straighten your leg';
    } else if (normId.includes('straight-leg')) {
      direction = 'UPWARD';
      directionalCue = '↑ Lift leg';
      simpleVerb = 'Lift your leg';
    } else if (normId.includes('ball-press')) {
      direction = 'COMPRESS';
      directionalCue = '→ Compress inward';
      simpleVerb = 'Compress your hands';
    } else if (normId.includes('cross-body')) {
      direction = 'ADDUCT';
      directionalCue = '← Draw across chest';
      simpleVerb = 'Draw arm across chest';
    } else if (normId.includes('rotation')) {
      direction = 'ROTATE OUTWARD';
      directionalCue = '↷ Rotate outward';
      simpleVerb = 'Rotate your forearm';
    }

    const sideLabel = side === 'bilateral' ? 'both limbs' : `${side} side`;

    // ── 1. Low Tracking Confidence ──
    if (isConfidenceLow) {
      return {
        primaryInstruction: 'Move slightly back into view.',
        currentValue: currentVal,
        targetValue: targetVal,
        difference,
        completionPercentage,
        direction,
        state: 'LOW_CONFIDENCE',
        unit,
        actionInstruction: 'Move slightly back so your shoulder and elbow remain visible.',
        directionalCue: '⛶ Position in frame',
        qualityBadge: 'CALIBRATING',
        isTargetReached: false,
        isHoldBased,
      };
    }

    // ── 2. Limitation Detected State ──
    if (isLimitationDetected && currentVal > 15 && currentVal < targetVal - 25) {
      return {
        primaryInstruction: 'Move gradually toward the target.',
        currentValue: currentVal,
        targetValue: targetVal,
        difference,
        completionPercentage,
        direction,
        state: 'LIMITED',
        unit,
        actionInstruction: 'Move gradually toward the reference position.',
        directionalCue,
        qualityBadge: 'LIMITED RANGE',
        isTargetReached: false,
        isHoldBased,
      };
    }

    // ── 3. Target Reached & Hold State ──
    if (isTargetReached) {
      if (isHoldBased) {
        if (this.holdStartTimestamp === null) {
          this.holdStartTimestamp = performance.now();
        }

        const elapsedMs = performance.now() - this.holdStartTimestamp;
        const elapsedSec = Math.min(this.holdDurationMs / 1000, elapsedMs / 1000);
        const holdTargetSec = this.holdDurationMs / 1000;
        const holdProgressPercent = Math.min(100, Math.round((elapsedMs / this.holdDurationMs) * 100));

        if (stabilityScore !== undefined) {
          this.stabilitySamples.push(stabilityScore);
        }
        const avgStability =
          this.stabilitySamples.length > 0
            ? Math.round(
                this.stabilitySamples.reduce((a, b) => a + b, 0) / this.stabilitySamples.length
              )
            : stabilityScore ?? 98;

        const isHoldComplete = elapsedMs >= this.holdDurationMs;

        return {
          primaryInstruction: isHoldComplete ? 'Great — lower slowly.' : 'Great — hold this position.',
          currentValue: currentVal,
          targetValue: targetVal,
          difference: 0,
          completionPercentage: 100,
          direction,
          state: 'HOLD',
          unit,
          actionInstruction: isHoldComplete
            ? 'Hold completed! Lower your limb slowly.'
            : `Great — hold this position (${elapsedSec.toFixed(1)}s / ${holdTargetSec}s).`,
          directionalCue: '⏱ Maintain position',
          qualityBadge: isHoldComplete ? 'HOLD COMPLETE' : 'HOLDING',
          isTargetReached: true,
          isHoldBased: true,
          holdSecondsElapsed: Number(elapsedSec.toFixed(1)),
          holdTargetSeconds: holdTargetSec,
          holdProgressPercent,
          holdStabilityScore: avgStability,
        };
      }

      this.holdStartTimestamp = null;
      this.stabilitySamples = [];

      return {
        primaryInstruction: 'Great — target reached.',
        currentValue: currentVal,
        targetValue: targetVal,
        difference: 0,
        completionPercentage: 100,
        direction,
        state: 'TARGET_REACHED',
        unit,
        actionInstruction: 'Great — hold this position.',
        directionalCue: '✓ Target reached',
        qualityBadge: 'TARGET REACHED',
        isTargetReached: true,
        isHoldBased: false,
      };
    }

    // Reset hold timer if user moves away from target
    this.holdStartTimestamp = null;
    this.stabilitySamples = [];

    // ── 4. Waiting / Standby ──
    if (!isStreaming && currentVal < 5) {
      return {
        primaryInstruction: `${simpleVerb}.`,
        currentValue: currentVal,
        targetValue: targetVal,
        difference,
        completionPercentage: 0,
        direction,
        state: 'WAITING',
        unit,
        actionInstruction: `Select Start Practice to track your ${sideLabel}.`,
        directionalCue,
        qualityBadge: 'STANDBY',
        isTargetReached: false,
        isHoldBased,
      };
    }

    // ── 5. Starting Position (currentVal < 15) ──
    if (currentVal < 15) {
      return {
        primaryInstruction: `${simpleVerb}.`,
        currentValue: currentVal,
        targetValue: targetVal,
        difference,
        completionPercentage,
        direction,
        state: 'START',
        unit,
        actionInstruction: `${simpleVerb} toward the ghost target.`,
        directionalCue,
        qualityBadge: 'STARTING',
        isTargetReached: false,
        isHoldBased,
      };
    }

    // ── 6. Near Target (difference <= 15) ──
    if (difference <= 15) {
      return {
        primaryInstruction: 'Almost there.',
        currentValue: currentVal,
        targetValue: targetVal,
        difference,
        completionPercentage,
        direction,
        state: 'NEAR_TARGET',
        unit,
        actionInstruction: 'Almost there — raise it a little more.',
        directionalCue: '↑ Almost at target',
        qualityBadge: 'NEAR TARGET',
        isTargetReached: false,
        isHoldBased,
      };
    }

    // ── 7. Approaching Target (15 < difference <= 35) ──
    if (difference <= 35) {
      return {
        primaryInstruction: 'Raise it a little more.',
        currentValue: currentVal,
        targetValue: targetVal,
        difference,
        completionPercentage,
        direction,
        state: 'APPROACHING',
        unit,
        actionInstruction: 'Keep going — raise it a little more.',
        directionalCue,
        qualityBadge: 'APPROACHING',
        isTargetReached: false,
        isHoldBased,
      };
    }

    // ── 8. Moving / Far from Target (difference > 35) ──
    return {
      primaryInstruction: `${simpleVerb}.`,
      currentValue: currentVal,
      targetValue: targetVal,
      difference,
      completionPercentage,
      direction,
      state: 'MOVING',
      unit,
      actionInstruction: `${simpleVerb} toward the target.`,
      directionalCue,
      qualityBadge: 'MOVING',
      isTargetReached: false,
      isHoldBased,
    };
  }
}

export const movementComparisonEngine = new MovementComparisonEngine();
