/**
 * AdaptiveProgressionEngine.ts
 * PHYSIOSIS — ADAPTIVE REHABILITATION PATCH 10
 * SAFE DIFFICULTY PROGRESSION ENGINE
 *
 * Evaluates patient multi-stream telemetry to adapt next-session rehabilitation difficulty:
 *   - EASIER
 *   - SAME
 *   - SLIGHTLY_ADVANCED
 *   - REST/REVIEW
 *
 * HARD CONSTRAINTS & CLINICAL GUARDRAILS:
 *   1. Safety state strictly overrides progression:
 *      - CAUTION: Do NOT increase difficulty (clamped to SAME or EASIER).
 *      - STOP: No progression allowed (REST/REVIEW or EASIER).
 *      - ESCALATE: Stop automated progression (REST/REVIEW).
 *   2. Only allow progression inside exercise-specific configured boundaries:
 *      - maxTargetAngle, minTargetAngle
 *      - maxRepetitions, minRepetitions
 *      - maxHold, minHold
 *      - minimumQuality
 *      - The AI CANNOT invent arbitrary targets.
 *   3. Patient-safe, non-diagnostic communication:
 *      - Instead of: "Treatment increased."
 *      - Use: "Your next exercise session can continue at the current reference level."
 *   4. Explainable AI integration:
 *      - Returns structured AIExplanation with concise evidence and machine-auditable trace.
 */

import type {
  AdaptiveProgressionInput,
  AdaptiveProgressionResult,
  ExerciseProgressionBoundaries,
  ProgressionDosageParameters,
  SessionDifficulty,
} from './ProgressionTypes';
import type { AIExplanation, ExplanationSourceCategory } from '../recommendation/RecommendationTypes';

/**
 * Authoritative exercise-specific boundary matrix for all Physiosis exercises.
 * Derived from clinical biomechanics protocols and normal physiological ranges.
 */
export const EXERCISE_PROGRESSION_BOUNDARIES: Record<string, ExerciseProgressionBoundaries> = {
  // ── SHOULDER / UPPER LIMB ──────────────────────────────────────────────────
  shoulder_flexion: {
    exerciseId: 'shoulder_flexion',
    exerciseName: 'Shoulder Flexion',
    minTargetAngle: 90,
    maxTargetAngle: 175,
    minRepetitions: 5,
    maxRepetitions: 15,
    minHold: 2,
    maxHold: 5,
    minSets: 1,
    maxSets: 4,
    minimumQuality: 75,
    maxAngleIncrementPerStep: 5,
    maxRepIncrementPerStep: 2,
    maxHoldIncrementPerStep: 1,
  },
  'shoulder-flexion': {
    exerciseId: 'shoulder-flexion',
    exerciseName: 'Shoulder Flexion',
    minTargetAngle: 90,
    maxTargetAngle: 175,
    minRepetitions: 5,
    maxRepetitions: 15,
    minHold: 2,
    maxHold: 5,
    minSets: 1,
    maxSets: 4,
    minimumQuality: 75,
    maxAngleIncrementPerStep: 5,
    maxRepIncrementPerStep: 2,
    maxHoldIncrementPerStep: 1,
  },
  shoulder_abduction: {
    exerciseId: 'shoulder_abduction',
    exerciseName: 'Shoulder Abduction',
    minTargetAngle: 80,
    maxTargetAngle: 170,
    minRepetitions: 5,
    maxRepetitions: 15,
    minHold: 2,
    maxHold: 5,
    minSets: 1,
    maxSets: 4,
    minimumQuality: 75,
    maxAngleIncrementPerStep: 5,
    maxRepIncrementPerStep: 2,
    maxHoldIncrementPerStep: 1,
  },
  'shoulder-abduction': {
    exerciseId: 'shoulder-abduction',
    exerciseName: 'Shoulder Abduction',
    minTargetAngle: 80,
    maxTargetAngle: 170,
    minRepetitions: 5,
    maxRepetitions: 15,
    minHold: 2,
    maxHold: 5,
    minSets: 1,
    maxSets: 4,
    minimumQuality: 75,
    maxAngleIncrementPerStep: 5,
    maxRepIncrementPerStep: 2,
    maxHoldIncrementPerStep: 1,
  },
  cross_body_shoulder_stretch: {
    exerciseId: 'cross_body_shoulder_stretch',
    exerciseName: 'Cross-Body Shoulder Stretch',
    minTargetAngle: 40,
    maxTargetAngle: 90,
    minRepetitions: 3,
    maxRepetitions: 10,
    minHold: 5,
    maxHold: 20,
    minSets: 1,
    maxSets: 3,
    minimumQuality: 70,
    maxAngleIncrementPerStep: 5,
    maxRepIncrementPerStep: 1,
    maxHoldIncrementPerStep: 2,
  },
  isometric_rotation: {
    exerciseId: 'isometric_rotation',
    exerciseName: 'Isometric Shoulder External Rotation',
    minTargetAngle: 15,
    maxTargetAngle: 45,
    minRepetitions: 5,
    maxRepetitions: 12,
    minHold: 3,
    maxHold: 8,
    minSets: 1,
    maxSets: 4,
    minimumQuality: 75,
    maxAngleIncrementPerStep: 3,
    maxRepIncrementPerStep: 2,
    maxHoldIncrementPerStep: 1,
  },
  arm_circumduction: {
    exerciseId: 'arm_circumduction',
    exerciseName: 'Arm Circumduction',
    minTargetAngle: 60,
    maxTargetAngle: 160,
    minRepetitions: 5,
    maxRepetitions: 15,
    minHold: 1,
    maxHold: 3,
    minSets: 1,
    maxSets: 3,
    minimumQuality: 70,
    maxAngleIncrementPerStep: 10,
    maxRepIncrementPerStep: 2,
    maxHoldIncrementPerStep: 1,
  },
  ball_press: {
    exerciseId: 'ball_press',
    exerciseName: 'Ball Press Exercise',
    minTargetAngle: 20,
    maxTargetAngle: 60,
    minRepetitions: 5,
    maxRepetitions: 15,
    minHold: 2,
    maxHold: 6,
    minSets: 1,
    maxSets: 4,
    minimumQuality: 70,
    maxAngleIncrementPerStep: 5,
    maxRepIncrementPerStep: 2,
    maxHoldIncrementPerStep: 1,
  },

  // ── SPINE & TRUNK ──────────────────────────────────────────────────────────
  isometric_side_bending: {
    exerciseId: 'isometric_side_bending',
    exerciseName: 'Isometric Trunk Side Bending',
    minTargetAngle: 10,
    maxTargetAngle: 30,
    minRepetitions: 5,
    maxRepetitions: 12,
    minHold: 3,
    maxHold: 8,
    minSets: 1,
    maxSets: 4,
    minimumQuality: 75,
    maxAngleIncrementPerStep: 2,
    maxRepIncrementPerStep: 2,
    maxHoldIncrementPerStep: 1,
  },

  // ── KNEE & LOWER LIMB ──────────────────────────────────────────────────────
  knee_extension: {
    exerciseId: 'knee_extension',
    exerciseName: 'Knee Extension',
    minTargetAngle: 60,
    maxTargetAngle: 95,
    minRepetitions: 5,
    maxRepetitions: 15,
    minHold: 2,
    maxHold: 6,
    minSets: 1,
    maxSets: 4,
    minimumQuality: 75,
    maxAngleIncrementPerStep: 5,
    maxRepIncrementPerStep: 2,
    maxHoldIncrementPerStep: 1,
  },
  'knee-extension': {
    exerciseId: 'knee-extension',
    exerciseName: 'Knee Extension',
    minTargetAngle: 60,
    maxTargetAngle: 95,
    minRepetitions: 5,
    maxRepetitions: 15,
    minHold: 2,
    maxHold: 6,
    minSets: 1,
    maxSets: 4,
    minimumQuality: 75,
    maxAngleIncrementPerStep: 5,
    maxRepIncrementPerStep: 2,
    maxHoldIncrementPerStep: 1,
  },
  straight_leg_raise: {
    exerciseId: 'straight_leg_raise',
    exerciseName: 'Straight Leg Raise',
    minTargetAngle: 30,
    maxTargetAngle: 75,
    minRepetitions: 5,
    maxRepetitions: 15,
    minHold: 2,
    maxHold: 5,
    minSets: 1,
    maxSets: 4,
    minimumQuality: 75,
    maxAngleIncrementPerStep: 5,
    maxRepIncrementPerStep: 2,
    maxHoldIncrementPerStep: 1,
  },
  'straight-leg-raise': {
    exerciseId: 'straight-leg-raise',
    exerciseName: 'Straight Leg Raise',
    minTargetAngle: 30,
    maxTargetAngle: 75,
    minRepetitions: 5,
    maxRepetitions: 15,
    minHold: 2,
    maxHold: 5,
    minSets: 1,
    maxSets: 4,
    minimumQuality: 75,
    maxAngleIncrementPerStep: 5,
    maxRepIncrementPerStep: 2,
    maxHoldIncrementPerStep: 1,
  },
  ankle_plantar_flexion: {
    exerciseId: 'ankle_plantar_flexion',
    exerciseName: 'Ankle Plantar Flexion',
    minTargetAngle: 20,
    maxTargetAngle: 50,
    minRepetitions: 5,
    maxRepetitions: 20,
    minHold: 1,
    maxHold: 4,
    minSets: 1,
    maxSets: 4,
    minimumQuality: 70,
    maxAngleIncrementPerStep: 5,
    maxRepIncrementPerStep: 3,
    maxHoldIncrementPerStep: 1,
  },

  // ── WRIST ──────────────────────────────────────────────────────────────────
  wrist_extension_stretch: {
    exerciseId: 'wrist_extension_stretch',
    exerciseName: 'Wrist Extension Stretch',
    minTargetAngle: 30,
    maxTargetAngle: 70,
    minRepetitions: 3,
    maxRepetitions: 10,
    minHold: 5,
    maxHold: 15,
    minSets: 1,
    maxSets: 3,
    minimumQuality: 70,
    maxAngleIncrementPerStep: 5,
    maxRepIncrementPerStep: 1,
    maxHoldIncrementPerStep: 2,
  },
};

/** Generic fallback boundaries for arbitrary or unlisted exercises. */
const DEFAULT_FALLBACK_BOUNDARIES: ExerciseProgressionBoundaries = {
  exerciseId: 'generic_exercise',
  exerciseName: 'Rehabilitation Exercise',
  minTargetAngle: 30,
  maxTargetAngle: 160,
  minRepetitions: 5,
  maxRepetitions: 15,
  minHold: 2,
  maxHold: 5,
  minSets: 1,
  maxSets: 3,
  minimumQuality: 70,
  maxAngleIncrementPerStep: 5,
  maxRepIncrementPerStep: 2,
  maxHoldIncrementPerStep: 1,
};

/**
 * Clamps a numerical value strictly between min and max bounds.
 */
function clamp(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, val));
}

export class AdaptiveProgressionEngine {
  /**
   * Evaluates patient multi-stream telemetry to adapt next-session rehabilitation difficulty.
   * Strictly enforces configured boundaries and safety state precedence.
   */
  public static evaluate(input: AdaptiveProgressionInput): AdaptiveProgressionResult {
    const timestamp = input.timestamp ?? Date.now();

    // 1. Resolve exercise-specific configured boundaries
    const boundary = this.getBoundaries(input.exerciseId);

    // 2. Establish current dosage baseline clamped within configured boundaries
    const currentTargetAngle = clamp(
      input.currentDosage?.targetAngle ?? input.recentPerformance.targetAngle ?? boundary.minTargetAngle,
      boundary.minTargetAngle,
      boundary.maxTargetAngle
    );

    const currentReps = clamp(
      input.currentDosage?.repetitions ?? input.recentPerformance.targetReps ?? boundary.minRepetitions,
      boundary.minRepetitions,
      boundary.maxRepetitions
    );

    const currentSets = clamp(
      input.currentDosage?.sets ?? 3,
      boundary.minSets,
      boundary.maxSets
    );

    const currentHold = clamp(
      input.currentDosage?.holdDuration ?? boundary.minHold,
      boundary.minHold,
      boundary.maxHold
    );

    const currentRest = input.currentDosage?.rest ?? 60;

    const previousParameters: ProgressionDosageParameters = {
      targetAngle: currentTargetAngle,
      repetitions: currentReps,
      sets: currentSets,
      holdDuration: currentHold,
      rest: currentRest,
    };

    // 3. Initialize working variables
    let nextDifficulty: SessionDifficulty = 'SAME';
    let safetyOverrideApplied = false;
    let rationale = '';
    let patientMessage = 'Your next exercise session can continue at the current reference level.';
    let adaptedTargetAngle = currentTargetAngle;
    let adaptedReps = currentReps;
    let adaptedSets = currentSets;
    let adaptedHold = currentHold;
    let adaptedRest = currentRest;
    const explanationSources: ExplanationSourceCategory[] = ['biomechanics', 'protocol'];
    const contributingFactors: string[] = [];

    const { safetyState, confidence, quality, consistency, compensationRate, recentPerformance } = input;

    // =========================================================================
    // RULE 1: SAFETY STATE OVERRIDES PROGRESSION (ABSOLUTE PRIORITY)
    // =========================================================================
    if (safetyState.level === 'ESCALATE') {
      nextDifficulty = 'REST/REVIEW';
      safetyOverrideApplied = true;
      rationale = `Clinical safety escalation active (${safetyState.triggerDetail || 'adverse hazard flagged'}). Automated progression is stopped.`;
      patientMessage = 'A clinical review with your physiotherapist is recommended before continuing sessions.';
      explanationSources.push('safety_rule');
      contributingFactors.push('safety_escalate_active');

    } else if (safetyState.level === 'STOP') {
      nextDifficulty = 'REST/REVIEW';
      safetyOverrideApplied = true;
      rationale = `Safety stop condition encountered (${safetyState.triggerDetail || 'movement hazard'}). No progression allowed.`;
      patientMessage = 'A rest period is recommended before your next session.';
      explanationSources.push('safety_rule');
      contributingFactors.push('safety_stop_condition');

    } else if (safetyState.level === 'CAUTION' || !safetyState.isProgressionAllowed) {
      safetyOverrideApplied = true;
      explanationSources.push('safety_rule');
      contributingFactors.push('safety_caution_freeze');

      // In CAUTION: difficulty CANNOT increase to SLIGHTLY_ADVANCED.
      // If quality is deeply degraded or high compensation detected, step down to EASIER.
      if (
        quality.score < boundary.minimumQuality - 10 ||
        compensationRate.frequency > 40 ||
        compensationRate.severity === 'SEVERE'
      ) {
        nextDifficulty = 'EASIER';
        adaptedTargetAngle = clamp(
          currentTargetAngle - boundary.maxAngleIncrementPerStep,
          boundary.minTargetAngle,
          boundary.maxTargetAngle
        );
        adaptedReps = clamp(
          currentReps - boundary.maxRepIncrementPerStep,
          boundary.minRepetitions,
          boundary.maxRepetitions
        );
        rationale = `Cautionary state and elevated compensation detected. Reducing difficulty within safe reference bounds.`;
        patientMessage = 'Your next exercise session can adjust to a lighter target to help you build comfort and control.';
      } else {
        nextDifficulty = 'SAME';
        rationale = `Cautionary safety state active. Protocol progression frozen; difficulty maintained at current reference level.`;
        patientMessage = 'Your next exercise session can continue at the current reference level.';
      }

    // =========================================================================
    // RULE 2: SENSOR & TRACKING RELIABILITY FILTER
    // =========================================================================
    } else if (!confidence.isReliable || confidence.trackingConfidence < 60) {
      nextDifficulty = 'SAME';
      rationale = `Pose tracking confidence is degraded (${confidence.trackingConfidence}%). Maintaining current difficulty level until tracking is stabilized.`;
      patientMessage = 'Your next exercise session can continue at the current reference level.';
      explanationSources.push('sensor_data');
      contributingFactors.push('tracking_confidence_low');

    // =========================================================================
    // RULE 3: SAFE STATE BIOMECHANICAL & PERFORMANCE EVALUATION
    // =========================================================================
    } else {
      const completionRate = recentPerformance.targetReps > 0
        ? recentPerformance.completedReps / recentPerformance.targetReps
        : 0;

      const effectivePeak = recentPerformance.peakAngle ?? recentPerformance.currentAngle ?? 0;
      const romRatio = currentTargetAngle > 0 ? effectivePeak / currentTargetAngle : 0;
      const compFreq = compensationRate.frequency;
      const hasSignificantCompensation =
        compensationRate.severity === 'MODERATE' || compensationRate.severity === 'SEVERE' || compFreq > 25;

      // ── CANDIDATE FOR PROGRESSION: SLIGHTLY_ADVANCED ───────────────────────
      const qualifiesForAdvancement =
        quality.score >= boundary.minimumQuality &&
        quality.stability >= 70 &&
        consistency >= 70 &&
        compFreq <= 15 &&
        !hasSignificantCompensation &&
        completionRate >= 0.85 &&
        romRatio >= 0.95;

      if (qualifiesForAdvancement) {
        // Check if already at maximum configured boundary
        const isMaxTargetAngleReached = currentTargetAngle >= boundary.maxTargetAngle;
        const isMaxRepsReached = currentReps >= boundary.maxRepetitions;
        const isMaxHoldReached = currentHold >= boundary.maxHold;

        if (isMaxTargetAngleReached && isMaxRepsReached && isMaxHoldReached) {
          nextDifficulty = 'SAME';
          rationale = `Optimal movement quality and mastery achieved at maximum clinical boundaries for ${boundary.exerciseName}. Maintaining current level for motor consolidation.`;
          patientMessage = 'Your next exercise session can continue at the current reference level.';
          contributingFactors.push('maximum_boundaries_reached');
        } else {
          nextDifficulty = 'SLIGHTLY_ADVANCED';
          patientMessage = 'Your next exercise session can introduce a gentle progression within your recommended reference range.';

          // Safely step up parameters strictly within configured boundaries
          if (!isMaxTargetAngleReached) {
            adaptedTargetAngle = clamp(
              currentTargetAngle + boundary.maxAngleIncrementPerStep,
              boundary.minTargetAngle,
              boundary.maxTargetAngle
            );
            rationale = `Consistently achieved reference target with stable form and low compensation (quality: ${quality.score}%, consistency: ${consistency}%). Advanced target angle to ${adaptedTargetAngle}°.`;
            contributingFactors.push('target_angle_advanced');
          } else if (!isMaxRepsReached) {
            adaptedReps = clamp(
              currentReps + boundary.maxRepIncrementPerStep,
              boundary.minRepetitions,
              boundary.maxRepetitions
            );
            rationale = `Consistently achieved maximum target angle with optimal control. Increased repetition volume to ${adaptedReps} reps.`;
            contributingFactors.push('repetitions_advanced');
          } else {
            adaptedHold = clamp(
              currentHold + boundary.maxHoldIncrementPerStep,
              boundary.minHold,
              boundary.maxHold
            );
            rationale = `Target angle and repetitions at target. Extended isometric hold duration to ${adaptedHold}s.`;
            contributingFactors.push('hold_duration_advanced');
          }
        }

      // ── CANDIDATE FOR REGRESSION: EASIER ──────────────────────────────────
      } else if (
        completionRate < 0.50 ||
        romRatio < 0.70 ||
        compFreq > 30 ||
        compensationRate.severity === 'SEVERE' ||
        quality.score < (boundary.minimumQuality - 15)
      ) {
        nextDifficulty = 'EASIER';
        patientMessage = 'Your next exercise session can adjust to a lighter target to help you build comfort and control.';

        if (currentTargetAngle > boundary.minTargetAngle) {
          adaptedTargetAngle = clamp(
            currentTargetAngle - boundary.maxAngleIncrementPerStep,
            boundary.minTargetAngle,
            boundary.maxTargetAngle
          );
        } else if (currentReps > boundary.minRepetitions) {
          adaptedReps = clamp(
            currentReps - boundary.maxRepIncrementPerStep,
            boundary.minRepetitions,
            boundary.maxRepetitions
          );
        }

        rationale = `Movement fatigue or compensatory patterns observed (quality: ${quality.score}%, compensation: ${compFreq}%). Regressing target to support safe motor control.`;
        contributingFactors.push('movement_fatigue_or_compensation');

      // ── NOMINAL MAINTENANCE: SAME ─────────────────────────────────────────
      } else {
        nextDifficulty = 'SAME';
        patientMessage = 'Your next exercise session can continue at the current reference level.';
        rationale = `Movement progress is steady (quality: ${quality.score}%, completion: ${Math.round(completionRate * 100)}%). Consolidating performance at current reference level.`;
        contributingFactors.push('steady_consolidation');
      }
    }

    if (input.historicalBaseline && input.historicalBaseline.status === 'BASELINE_AVAILABLE') {
      explanationSources.push('patient_baseline');
    }

    // 4. Assemble adapted parameters
    const adaptedParameters: ProgressionDosageParameters = {
      targetAngle: adaptedTargetAngle,
      repetitions: adaptedReps,
      sets: adaptedSets,
      holdDuration: adaptedHold,
      rest: adaptedRest,
    };

    // 5. Build Explainable AI structure (Patch 8 compliant)
    const explanation: AIExplanation = {
      observation: `Session difficulty determined as ${nextDifficulty} for ${boundary.exerciseName}.`,
      evidence: `Quality=${quality.score}%, Consistency=${consistency}%, Compensation=${compensationRate.frequency}%, Angle=${currentTargetAngle}°->${adaptedTargetAngle}°, Safety=${safetyState.level}`,
      contributingFactors,
      recommendation: rationale,
      confidence: Number((Math.min(confidence.trackingConfidence, confidence.biomechanicalConfidence) / 100).toFixed(2)),
      source: explanationSources,
      patientView: patientMessage,
      developerView: {
        metric: 'nextSessionDifficulty',
        threshold: nextDifficulty,
        confidence: Number((confidence.biomechanicalConfidence / 100).toFixed(2)),
        source: explanationSources,
        timestamp,
        rawValues: {
          previousParameters,
          adaptedParameters,
          boundariesEnforced: boundary,
          safetyOverrideApplied,
        },
      },
    };

    return {
      nextSessionDifficulty: nextDifficulty,
      patientMessage,
      adaptedParameters,
      previousParameters,
      rationale,
      boundariesEnforced: boundary,
      safetyOverrideApplied,
      safetyState: safetyState.level,
      explanation,
      timestamp,
    };
  }

  /**
   * Retrieves the configured boundaries for an exercise ID with fallback to safe defaults.
   */
  public static getBoundaries(exerciseId: string): ExerciseProgressionBoundaries {
    const normalized = (exerciseId || '').toLowerCase().trim();
    if (EXERCISE_PROGRESSION_BOUNDARIES[normalized]) {
      return EXERCISE_PROGRESSION_BOUNDARIES[normalized];
    }
    const withUnderscore = normalized.replace(/-/g, '_');
    if (EXERCISE_PROGRESSION_BOUNDARIES[withUnderscore]) {
      return EXERCISE_PROGRESSION_BOUNDARIES[withUnderscore];
    }
    const withDash = normalized.replace(/_/g, '-');
    if (EXERCISE_PROGRESSION_BOUNDARIES[withDash]) {
      return EXERCISE_PROGRESSION_BOUNDARIES[withDash];
    }
    return {
      ...DEFAULT_FALLBACK_BOUNDARIES,
      exerciseId,
      exerciseName: exerciseId,
    };
  }
}
