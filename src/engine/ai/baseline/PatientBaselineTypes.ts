/**
 * PatientBaselineTypes.ts
 * Typed contracts for the Physiosis Patient Baseline & Individual Progress Model.
 *
 * Core Concept:
 *   Instead of comparing patients only against a generic reference target,
 *   we compare:
 *     Current Session / Rep
 *     vs
 *     Patient Historical Baseline
 *     +
 *     Exercise Reference Target
 *
 * STRICT MEDICAL SAFETY & NON-DIAGNOSTIC RULES:
 *   - Never claims "Recovered" or outputs clinical prognoses.
 *   - Never invents artificial recovery percentages.
 *   - All difficulty progressions are bounded within clinical safety envelopes.
 */

export type BaselineStatus = 'BASELINE_AVAILABLE' | 'INSUFFICIENT_HISTORY';

export type StatisticalTrend = 'improving' | 'stable' | 'declining' | 'insufficient data';

export type ComparisonStatus =
  | 'ABOVE_BASELINE'
  | 'AT_BASELINE'
  | 'BELOW_BASELINE'
  | 'AT_REFERENCE_TARGET'
  | 'INSUFFICIENT_HISTORY';

/**
 * Historical biomechanical baseline for a specific rehabilitation exercise.
 * Computed across qualifying completed sessions and repetitions.
 */
export interface ExerciseBaseline {
  exerciseId: string;
  exerciseName: string;
  status: BaselineStatus;
  eligibilityReason: string;

  /** Total number of qualifying sessions used to compute this baseline. */
  totalCompletedSessions: number;
  /** Total number of valid completed repetitions analyzed. */
  totalCompletedReps: number;

  /** Absolute highest valid ROM reached across historical sessions (degrees). */
  bestROM: number;
  /** Typical ROM: 10% trimmed mean across valid repetitions to filter noise (degrees). */
  typicalROM: number;
  /** Median ROM: 50th percentile of valid historical repetitions (degrees). */
  medianROM: number;

  /** Average historical movement quality [0–100]. */
  quality: number;
  /** Bilateral kinetic symmetry index [0–100]. */
  symmetry: number;
  /** Average movement speed in degrees per second (or average rep duration). */
  movementSpeed: number;
  /** Repetition consistency score [0–100] (based on coefficient of variation 1 - std/mean). */
  repConsistency: number;
  /** Percentage of historical reps exhibiting abnormal posture compensations [0–100%]. */
  compensationFrequency: number;

  /** Timestamp of the most recent session included in the baseline. */
  lastSessionDate: number | null;
}

/**
 * Three-way comparison output:
 * Current Session/Rep vs Patient Historical Baseline + Exercise Reference Target.
 */
export interface BaselineComparisonResult {
  exerciseName: string;
  /** Clinical/anatomical reference target for healthy mobility (e.g. 165°). */
  referenceTarget: number;
  /** Patient historical baseline typical ROM (e.g. 128°), or null if insufficient history. */
  baselineROM: number | null;
  /** Current session peak or active angle (e.g. 139°). */
  currentValue: number;
  /** Delta between current and patient baseline (current - baselineROM). */
  deltaVsBaseline: number | null;
  /** Remaining deviation from clinical reference target (referenceTarget - currentValue). */
  deviationFromReference: number;

  comparisonStatus: ComparisonStatus;
  /**
   * Prominent human-facing status statement.
   * Example: "Above your recent baseline." (Never "Recovered.")
   */
  comparisonStatement: string;
  /** Detailed objective description grounded strictly in the observed numbers. */
  detailedNote: string;
}

/**
 * Statistical longitudinal trend computed from historical sessions.
 * Grounded in Ordinary Least Squares (OLS) regression slope across sessions.
 */
export interface StatisticalTrendResult {
  trend: StatisticalTrend;
  /** Rate of change in peak ROM per session (degrees/session). */
  slopeDegreesPerSession: number;
  /** Coefficient of determination (R²) indicating linear trend fit strength [0–1]. */
  rSquared: number;
  /** Total session data points analyzed. */
  sampleCount: number;
  /** Objective, non-clinical interpretation statement. */
  interpretation: string;
}

/**
 * Personalized adaptations derived from individual baseline kinematics.
 */
export interface PersonalizedRecommendations {
  /** Calibrated verbal encouragement relative to individual baseline. */
  encouragement: string;

  /**
   * Difficulty progression:
   * Dynamically recommends an achievable interim target between patient baseline
   * and final reference target within configured safety bounds.
   */
  difficultyProgression: {
    /** Recommended interim target angle (e.g. 138° for a 128° baseline with 165° reference). */
    interimTargetAngle: number;
    /** Safe incremental step size (typically +10°). */
    progressionStep: number;
    /** Clinical rationale for the milestone. */
    rationale: string;
    /** Upper safety ceiling (never exceeds reference target). */
    safetyBound: number;
  };

  /**
   * Intra-session rest recommendation:
   * Triggered when fatigue patterns appear relative to baseline (speed drop, compensation spike).
   */
  restSuggestion: {
    shouldRest: boolean;
    reason: string | null;
    recommendedRestSeconds: number;
  };

  /**
   * Rehabilitation sequencing:
   * Suggests appropriate placement in the daily routine based on baseline mastery.
   */
  exerciseSequencing: {
    recommendedPhase: 'WARM_UP' | 'FOCUS' | 'COOL_DOWN';
    sequencePriority: number;
    rationale: string;
  };
}
