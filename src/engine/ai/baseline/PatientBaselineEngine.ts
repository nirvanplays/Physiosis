/**
 * PatientBaselineEngine.ts
 * Core algorithmic engine for patient-specific movement baselines,
 * statistical trend classification, 3-way multi-target comparison, and personalization.
 *
 * Grounded in empirical kinematics from completed Physiosis sessions.
 *
 * STRICT SAFETY & COMPLIANCE:
 *   - No single noisy frame baselines (requires >= 2 sessions, >= 6 valid reps).
 *   - Zero invented recovery percentages.
 *   - Clear indicator: "Baseline available" vs "Insufficient history".
 *   - Objective comparison: "Above your recent baseline." (never "Recovered.").
 *   - Safe difficulty progression bounded by clinical reference envelopes.
 */

import type { PhysiosisSession, RepResult, LiveSessionState } from '../../session/SessionTypes';
import type { ExerciseDefinition } from '../../exercise/ExerciseTypes';
import type {
  ExerciseBaseline,
  BaselineComparisonResult,
  StatisticalTrend,
  StatisticalTrendResult,
  PersonalizedRecommendations,
} from './PatientBaselineTypes';


/** Configuration thresholds for statistical baseline eligibility */
export const BASELINE_CONFIG = {
  MIN_SESSIONS_REQUIRED: 2,
  MIN_REPS_REQUIRED: 6,
  MIN_SESSION_DURATION_SECONDS: 30,
  MIN_VALID_PEAK_ANGLE: 15,
  MAX_VALID_PEAK_ANGLE: 220,
  TRIM_FRACTION: 0.1, // Trim top and bottom 10% for typical ROM to filter outliers
  SLOPE_IMPROVEMENT_THRESHOLD: 1.5, // degrees per session
  SLOPE_DECLINE_THRESHOLD: -1.5, // degrees per session
  R_SQUARED_MIN_CONFIDENCE: 0.25,
  MAX_PROGRESSION_STEP_DEGREES: 10,
  FATIGUE_SPEED_DROP_RATIO: 0.35, // 35% slower indicates fatigue
};

export class PatientBaselineEngine {
  /**
   * Filters raw sessions and reps to extract valid, noise-free rehabilitation kinematics.
   */
  public static filterValidSessionsAndReps(
    sessions: PhysiosisSession[],
    exerciseKey: string
  ): { qualifyingSessions: PhysiosisSession[]; validReps: RepResult[] } {
    const cleanKey = exerciseKey.toLowerCase().replace(/[\s-_]+/g, '');

    const qualifyingSessions = (sessions || [])
      .filter((s) => {
        const sKey = (s.exerciseId || s.exercise || '').toLowerCase().replace(/[\s-_]+/g, '');
        const matchesExercise =
          sKey === cleanKey ||
          (cleanKey.includes('shoulderflexion') && (!s.exercise || sKey.includes('shoulderflexion')));
        const hasValidDuration = (s.durationSeconds || 0) >= BASELINE_CONFIG.MIN_SESSION_DURATION_SECONDS;
        const hasCompletedReps = ((s.totalReps || (s as any).repsCompleted || 0) > 0 || (Array.isArray(s.reps) && s.reps.length > 0)) && Array.isArray(s.reps) && s.reps.length > 0;
        return matchesExercise && hasValidDuration && hasCompletedReps;
      })
      .sort((a, b) => a.startedAt - b.startedAt); // Chronological: oldest first

    const validReps: RepResult[] = [];
    for (const session of qualifyingSessions) {
      for (const rep of session.reps || []) {
        if (
          rep &&
          typeof rep.peakAngle === 'number' &&
          rep.peakAngle >= BASELINE_CONFIG.MIN_VALID_PEAK_ANGLE &&
          rep.peakAngle <= BASELINE_CONFIG.MAX_VALID_PEAK_ANGLE
        ) {
          validReps.push(rep);
        }
      }
    }

    return { qualifyingSessions, validReps };
  }

  /**
   * Computes the comprehensive empirical baseline for a specific exercise.
   */
  public static computeExerciseBaseline(
    sessions: PhysiosisSession[],
    exerciseKey: string,
    exerciseName?: string
  ): ExerciseBaseline {
    const { qualifyingSessions, validReps } = this.filterValidSessionsAndReps(sessions, exerciseKey);

    const displayName = exerciseName || qualifyingSessions[0]?.exercise || exerciseKey;
    const totalSessions = qualifyingSessions.length;
    const totalReps = validReps.length;

    // Minimum data check: prevent single noisy frame or insufficient history from creating a baseline
    if (
      totalSessions < BASELINE_CONFIG.MIN_SESSIONS_REQUIRED ||
      totalReps < BASELINE_CONFIG.MIN_REPS_REQUIRED
    ) {
      return {
        exerciseId: exerciseKey,
        exerciseName: displayName,
        status: 'INSUFFICIENT_HISTORY',
        eligibilityReason: `Requires at least ${BASELINE_CONFIG.MIN_SESSIONS_REQUIRED} completed sessions and ${BASELINE_CONFIG.MIN_REPS_REQUIRED} valid repetitions (currently ${totalSessions} sessions, ${totalReps} reps).`,
        totalCompletedSessions: totalSessions,
        totalCompletedReps: totalReps,
        bestROM: totalReps > 0 ? Math.round(Math.max(...validReps.map((r) => r.peakAngle))) : 0,
        typicalROM: totalReps > 0 ? Math.round(this.computeTrimmedMean(validReps.map((r) => r.peakAngle))) : 0,
        medianROM: totalReps > 0 ? Math.round(this.computeMedian(validReps.map((r) => r.peakAngle))) : 0,
        quality: totalReps > 0 ? Math.round(this.computeMean(validReps.map((r) => r.qualityScore || 0))) : 0,
        symmetry: 100,
        movementSpeed: 0,
        repConsistency: 0,
        compensationFrequency: 0,
        lastSessionDate: qualifyingSessions.length > 0 ? qualifyingSessions[qualifyingSessions.length - 1].startedAt : null,
      };
    }

    // Extract kinematics arrays
    const peakAngles = validReps.map((r) => r.peakAngle);
    const qualities = validReps.map((r) => r.qualityScore || 70);

    // 1. Peak & Central Tendency ROMs
    const bestROM = Math.round(Math.max(...peakAngles));
    const typicalROM = Math.round(this.computeTrimmedMean(peakAngles, BASELINE_CONFIG.TRIM_FRACTION));
    const medianROM = Math.round(this.computeMedian(peakAngles));

    // 2. Movement Quality & Symmetry
    const quality = Math.round(this.computeMean(qualities));
    const symmetryScores = qualifyingSessions
      .map((s) => s.averagePosturalScore)
      .filter((s): s is number => typeof s === 'number');
    const symmetry = symmetryScores.length > 0 ? Math.round(this.computeMean(symmetryScores)) : 90;

    // 3. Movement Speed (estimated degrees/second or duration)
    const validDurations = validReps
      .map((r) => r.durationMs)
      .filter((d): d is number => typeof d === 'number' && d > 500 && d < 15000);
    const avgDurationSeconds = validDurations.length > 0 ? this.computeMean(validDurations) / 1000 : 3.0;
    const movementSpeed = typicalROM > 0 && avgDurationSeconds > 0 ? Math.round((typicalROM * 2) / avgDurationSeconds) : 45;

    // 4. Repetition Consistency Score [0–100] based on coefficient of variation (CV = std/mean)
    const stdROM = this.computeStandardDeviation(peakAngles);
    const meanROM = this.computeMean(peakAngles);
    const cv = meanROM > 0 ? stdROM / meanROM : 0;
    const repConsistency = Math.round(Math.max(0, Math.min(100, (1 - cv) * 100)));

    // 5. Compensation Frequency (% of reps exhibiting limitations or compensations)
    const compensatedCount = validReps.filter(
      (r) => r.limitationDetected || (r.detectedCompensations && r.detectedCompensations.length > 0)
    ).length;
    const compensationFrequency = Math.round((compensatedCount / totalReps) * 100);

    const lastSession = qualifyingSessions[qualifyingSessions.length - 1];

    return {
      exerciseId: exerciseKey,
      exerciseName: displayName,
      status: 'BASELINE_AVAILABLE',
      eligibilityReason: `Verified across ${totalSessions} sessions and ${totalReps} completed repetitions.`,
      totalCompletedSessions: totalSessions,
      totalCompletedReps: totalReps,
      bestROM,
      typicalROM,
      medianROM,
      quality,
      symmetry,
      movementSpeed,
      repConsistency,
      compensationFrequency,
      lastSessionDate: lastSession.endedAt || lastSession.startedAt,
    };
  }

  /**
   * Three-Way Comparison:
   * Compares Current Session Peak vs Patient Historical Baseline + Exercise Reference Target.
   */
  public static compareWithBaseline(
    currentValue: number,
    baseline: ExerciseBaseline,
    referenceTarget: number
  ): BaselineComparisonResult {
    const safeCurrent = Math.max(0, Math.round(currentValue));
    const safeTarget = Math.max(1, Math.round(referenceTarget));

    if (baseline.status === 'INSUFFICIENT_HISTORY' || baseline.typicalROM <= 0) {
      return {
        exerciseName: baseline.exerciseName,
        referenceTarget: safeTarget,
        baselineROM: null,
        currentValue: safeCurrent,
        deltaVsBaseline: null,
        deviationFromReference: Math.max(0, safeTarget - safeCurrent),
        comparisonStatus: 'INSUFFICIENT_HISTORY',
        comparisonStatement: 'Establishing individual baseline...',
        detailedNote: `Compared against the ${safeTarget}° clinical reference target while building your movement history.`,
      };
    }

    const baselineROM = baseline.typicalROM;
    const deltaVsBaseline = safeCurrent - baselineROM;
    const deviationFromReference = Math.max(0, safeTarget - safeCurrent);

    let comparisonStatus: BaselineComparisonResult['comparisonStatus'] = 'AT_BASELINE';
    let comparisonStatement = 'Matching your recent baseline.';
    let detailedNote = `Current movement of ${safeCurrent}° is consistent with your typical baseline of ${baselineROM}°.`;

    if (safeCurrent >= safeTarget - 3) {
      comparisonStatus = 'AT_REFERENCE_TARGET';
      comparisonStatement = 'At clinical reference target.';
      detailedNote = `Current movement (${safeCurrent}°) has reached the prescribed clinical reference target (${safeTarget}°).`;
    } else if (deltaVsBaseline >= 4) {
      comparisonStatus = 'ABOVE_BASELINE';
      // Prompt specification: "Above your recent baseline." (not "Recovered.")
      comparisonStatement = 'Above your recent baseline.';
      detailedNote = `Current movement of ${safeCurrent}° is +${deltaVsBaseline}° above your typical baseline (${baselineROM}°), working toward the ${safeTarget}° reference target.`;
    } else if (deltaVsBaseline <= -4) {
      comparisonStatus = 'BELOW_BASELINE';
      comparisonStatement = 'Below your recent baseline.';
      detailedNote = `Current movement of ${safeCurrent}° is ${Math.abs(deltaVsBaseline)}° below your typical baseline (${baselineROM}°).`;
    }

    return {
      exerciseName: baseline.exerciseName,
      referenceTarget: safeTarget,
      baselineROM,
      currentValue: safeCurrent,
      deltaVsBaseline,
      deviationFromReference,
      comparisonStatus,
      comparisonStatement,
      detailedNote,
    };
  }

  /**
   * Computes statistical trend using Ordinary Least Squares (OLS) linear regression
   * over historical session peaks.
   *
   * Strictly outputs: 'improving' | 'stable' | 'declining' | 'insufficient data'
   * Zero invented recovery percentages.
   */
  public static calculateStatisticalTrend(
    sessions: PhysiosisSession[],
    exerciseKey: string
  ): StatisticalTrendResult {
    const { qualifyingSessions } = this.filterValidSessionsAndReps(sessions, exerciseKey);

    if (qualifyingSessions.length < BASELINE_CONFIG.MIN_SESSIONS_REQUIRED) {
      return {
        trend: 'insufficient data',
        slopeDegreesPerSession: 0,
        rSquared: 0,
        sampleCount: qualifyingSessions.length,
        interpretation: 'Additional completed sessions are needed to establish a statistical trend.',
      };
    }

    const n = qualifyingSessions.length;
    const xVals = Array.from({ length: n }, (_, i) => i);
    const yVals = qualifyingSessions.map((s) => s.bestROM || s.averageROM || 0);

    const xMean = this.computeMean(xVals);
    const yMean = this.computeMean(yVals);

    let num = 0;
    let denX = 0;
    let denY = 0;

    for (let i = 0; i < n; i++) {
      const dx = xVals[i] - xMean;
      const dy = yVals[i] - yMean;
      num += dx * dy;
      denX += dx * dx;
      denY += dy * dy;
    }

    const slope = denX !== 0 ? num / denX : 0;
    const rSquared = denX > 0 && denY > 0 ? (num * num) / (denX * denY) : 0;
    const roundedSlope = Math.round(slope * 10) / 10;
    const netDelta = yVals[n - 1] - yVals[0];

    let trend: StatisticalTrend = 'stable';
    let interpretation = 'Movement range has remained relatively consistent across recent sessions.';

    if (
      slope >= BASELINE_CONFIG.SLOPE_IMPROVEMENT_THRESHOLD &&
      (rSquared >= BASELINE_CONFIG.R_SQUARED_MIN_CONFIDENCE || netDelta >= 6)
    ) {
      trend = 'improving';
      interpretation = `Observed movement range demonstrates an upward trajectory (+${roundedSlope}°/session) across recorded sessions.`;
    } else if (
      slope <= BASELINE_CONFIG.SLOPE_DECLINE_THRESHOLD &&
      (rSquared >= BASELINE_CONFIG.R_SQUARED_MIN_CONFIDENCE || netDelta <= -6)
    ) {
      trend = 'declining';
      interpretation = `Observed movement range was lower in recent sessions (${roundedSlope}°/session). Consider discussing this finding with your physiotherapist.`;
    }

    return {
      trend,
      slopeDegreesPerSession: roundedSlope,
      rSquared: Math.round(rSquared * 100) / 100,
      sampleCount: n,
      interpretation,
    };
  }

  /**
   * Generates personalized adaptations: encouragement, safe interim difficulty progression,
   * intra-session rest suggestions, and rehabilitation sequencing.
   */
  public static generatePersonalization(
    baseline: ExerciseBaseline,
    currentSessionState: LiveSessionState | null,
    activeExercise: ExerciseDefinition
  ): PersonalizedRecommendations {
    const referenceTarget = activeExercise.targetAngle;
    const currentAngle = currentSessionState?.metrics?.bestROM || currentSessionState?.latestRep?.peakAngle || 0;

    // ── 1. Encouragement ─────────────────────────────────────────────────────
    let encouragement = `Elevate your limb with smooth control toward the ${referenceTarget}° reference target.`;
    if (baseline.status === 'BASELINE_AVAILABLE') {
      const delta = currentAngle - baseline.typicalROM;
      if (delta >= 4) {
        encouragement = `Excellent progress! You're ${delta}° above your recent ${baseline.typicalROM}° baseline.`;
      } else if (delta <= -5) {
        encouragement = `Maintain steady form. Focus on controlled tempo rather than forcing extra range.`;
      } else {
        encouragement = `Consistent form. Moving right within your typical ${baseline.typicalROM}° baseline.`;
      }
    }

    // ── 2. Difficulty Progression (Safe Interim Target Milestone) ────────────
    let interimTargetAngle = referenceTarget;
    let progressionStep = 0;
    let rationale = `Standard protocol targeting healthy reference range of ${referenceTarget}°.`;

    if (baseline.status === 'BASELINE_AVAILABLE') {
      // Step +10° above current baseline, capped strictly at clinical reference target
      const targetStep = Math.min(
        referenceTarget,
        Math.round(baseline.typicalROM + BASELINE_CONFIG.MAX_PROGRESSION_STEP_DEGREES)
      );

      if (targetStep < referenceTarget) {
        interimTargetAngle = targetStep;
        progressionStep = targetStep - baseline.typicalROM;
        rationale = `Targeting an achievable +${progressionStep}° milestone (${interimTargetAngle}°) above your ${baseline.typicalROM}° baseline to build progressive joint capacity toward ${referenceTarget}°.`;
      } else {
        interimTargetAngle = referenceTarget;
        progressionStep = Math.max(0, referenceTarget - baseline.typicalROM);
        rationale = `Your baseline (${baseline.typicalROM}°) is close to target. Working toward the final ${referenceTarget}° reference target.`;
      }
    }

    // ── 3. Intra-Session Rest Suggestion (Fatigue Monitoring) ─────────────────
    let shouldRest = false;
    let restReason: string | null = null;
    let recommendedRestSeconds = 0;

    if (currentSessionState && currentSessionState.repHistory.length >= 3) {
      const reps = currentSessionState.repHistory;
      const recentReps = reps.slice(-3);

      // Check 1: Declining peak angles over 3 consecutive reps
      const isConsecutiveDeclining =
        recentReps[2].peakAngle < recentReps[1].peakAngle - 4 &&
        recentReps[1].peakAngle < recentReps[0].peakAngle - 4;

      // Check 2: Spike in compensatory abnormal postures
      const sessionCompensations = reps.filter(
        (r) => r.limitationDetected || (r.detectedCompensations && r.detectedCompensations.length > 0)
      ).length;
      const currentCompFreq = (sessionCompensations / reps.length) * 100;
      const isCompSpike =
        baseline.status === 'BASELINE_AVAILABLE' &&
        currentCompFreq > Math.max(30, baseline.compensationFrequency * 1.8);

      if (isConsecutiveDeclining) {
        shouldRest = true;
        restReason = 'Noticeable drop in peak range across consecutive repetitions. Take a brief breather.';
        recommendedRestSeconds = 30;
      } else if (isCompSpike) {
        shouldRest = true;
        restReason = 'Compensatory muscle recruitment detected under load. Rest 30 seconds before your next set.';
        recommendedRestSeconds = 30;
      }
    }

    // ── 4. Rehabilitation Exercise Sequencing ────────────────────────────────
    let recommendedPhase: 'WARM_UP' | 'FOCUS' | 'COOL_DOWN' = 'FOCUS';
    let sequencePriority = 2;
    let sequencingRationale = 'Maintain scheduled protocol priority.';

    if (baseline.status === 'BASELINE_AVAILABLE') {
      if (baseline.repConsistency >= 85 && baseline.compensationFrequency <= 15) {
        recommendedPhase = 'WARM_UP';
        sequencePriority = 1;
        sequencingRationale = 'High baseline consistency and minimal compensation: Ideal as a gentle warm-up movement.';
      } else if (baseline.compensationFrequency >= 35) {
        recommendedPhase = 'FOCUS';
        sequencePriority = 2;
        sequencingRationale = 'Requires active motor control: Perform early in your session while muscle fatigue is low.';
      } else {
        recommendedPhase = 'FOCUS';
        sequencePriority = 2;
        sequencingRationale = 'Core therapeutic exercise for active range-of-motion conditioning.';
      }
    }

    return {
      encouragement,
      difficultyProgression: {
        interimTargetAngle,
        progressionStep,
        rationale,
        safetyBound: referenceTarget,
      },
      restSuggestion: {
        shouldRest,
        reason: restReason,
        recommendedRestSeconds,
      },
      exerciseSequencing: {
        recommendedPhase,
        sequencePriority,
        rationale: sequencingRationale,
      },
    };
  }

  // ── Mathematical Helper Methods ───────────────────────────────────────────

  private static computeMean(values: number[]): number {
    if (values.length === 0) return 0;
    return values.reduce((sum, v) => sum + v, 0) / values.length;
  }

  private static computeMedian(values: number[]): number {
    if (values.length === 0) return 0;
    const sorted = [...values].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  }

  private static computeTrimmedMean(values: number[], trimFraction = 0.1): number {
    if (values.length === 0) return 0;
    if (values.length <= 4) return this.computeMean(values);
    const sorted = [...values].sort((a, b) => a - b);
    const k = Math.floor(sorted.length * trimFraction);
    const trimmed = sorted.slice(k, sorted.length - k);
    return trimmed.length > 0 ? this.computeMean(trimmed) : this.computeMean(values);
  }

  private static computeStandardDeviation(values: number[]): number {
    if (values.length <= 1) return 0;
    const mean = this.computeMean(values);
    const variance = values.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / (values.length - 1);
    return Math.sqrt(variance);
  }
}
