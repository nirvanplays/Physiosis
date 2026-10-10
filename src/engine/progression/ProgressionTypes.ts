/**
 * ProgressionTypes.ts
 * PHYSIOSIS — ADAPTIVE REHABILITATION PATCH 10
 * SAFE DIFFICULTY PROGRESSION TYPE DEFINITIONS
 *
 * Core Concept:
 *   Evaluates multi-stream telemetry (recent performance, historical baseline,
 *   movement quality, rep consistency, compensation rate, camera confidence,
 *   and authoritative safety state) to adapt difficulty for the next session.
 *
 * STRICT CLINICAL & SAFETY PRINCIPLES:
 *   1. Safety state strictly overrides progression:
 *      - CAUTION: Do not increase difficulty (clamped to SAME or EASIER).
 *      - STOP: No progression allowed.
 *      - ESCALATE: Stop automated progression (recommend REST/REVIEW).
 *   2. Strict boundary enforcement:
 *      - Progression is strictly constrained inside exercise-specific configured boundaries
 *        (maxTargetAngle, minTargetAngle, maxRepetitions, maxHold, minimumQuality).
 *      - The engine cannot invent arbitrary targets.
 *   3. Patient-safe, non-diagnostic communication:
 *      - Avoids clinical claims ("Treatment increased").
 *      - Uses clear, supportive language:
 *        "Your next exercise session can continue at the current reference level."
 */

import type { AIExplanation } from '../recommendation/RecommendationTypes';
import type { RehabilitationSafetyState } from '../safety/SafetyTypes';

/**
 * 4 Discrete difficulty tiers for next rehabilitation session.
 */
export type SessionDifficulty =
  | 'EASIER'
  | 'SAME'
  | 'SLIGHTLY_ADVANCED'
  | 'REST/REVIEW';

/**
 * Hard exercise-specific biomechanical boundaries.
 * No adaptive progression or regression may ever breach these thresholds.
 */
export interface ExerciseProgressionBoundaries {
  exerciseId: string;
  exerciseName: string;
  minTargetAngle: number;
  maxTargetAngle: number;
  minRepetitions: number;
  maxRepetitions: number;
  minHold: number;         // seconds
  maxHold: number;         // seconds
  minSets: number;
  maxSets: number;
  minimumQuality: number;  // 0 - 100 quality threshold required to advance
  maxAngleIncrementPerStep: number; // e.g. 5° max change per advancement step
  maxRepIncrementPerStep: number;   // e.g. 2 reps max change per advancement step
  maxHoldIncrementPerStep: number;  // e.g. 1 second max change per advancement step
}

/**
 * Prescribed dosage and motion parameters.
 */
export interface ProgressionDosageParameters {
  targetAngle: number;
  repetitions: number;
  sets: number;
  holdDuration: number;
  rest: number;
}

/**
 * Input contract for adaptive progression evaluation.
 */
export interface AdaptiveProgressionInput {
  exerciseId: string;
  exerciseName?: string;

  /** Real-time or latest completed session performance. */
  recentPerformance: {
    completedReps: number;
    targetReps: number;
    currentAngle: number | null;
    peakAngle: number | null;
    averageAngle?: number | null;
    targetAngle: number;
    romPercentage: number;
    isSessionComplete?: boolean;
  };

  /** Longitudinal patient baseline kinematics (Patch 4). */
  historicalBaseline?: {
    status: 'BASELINE_AVAILABLE' | 'INSUFFICIENT_HISTORY';
    typicalROM: number | null;
    medianROM: number | null;
    bestROM: number | null;
    repConsistency: number | null;
    compensationFrequency: number | null;
    qualifyingSessionsCount?: number;
  } | null;

  /** Biomechanical movement quality and stability. */
  quality: {
    score: number;      // 0 - 100
    stability: number;  // 0 - 100
    symmetry: number;   // 0 - 100
    velocityQuality?: 'OPTIMAL' | 'TOO_FAST' | 'TOO_SLOW' | 'JERKY';
  };

  /** Repetition consistency score (0 - 100). */
  consistency: number;

  /** Posture compensation rate and severity. */
  compensationRate: {
    frequency: number; // 0 - 100%
    detected: boolean;
    activeFaultsCount: number;
    severity: 'NONE' | 'MILD' | 'MODERATE' | 'SEVERE';
    primaryFaultName?: string | null;
  };

  /** Tracking confidence and camera reliability. */
  confidence: {
    trackingConfidence: number;      // 0 - 100
    biomechanicalConfidence: number; // 0 - 100
    isReliable: boolean;
    degradationReason?: string | null;
  };

  /** Real-time authoritative clinical safety state (Patch 6). */
  safetyState: {
    level: RehabilitationSafetyState;
    isProgressionAllowed: boolean;
    flaggedHazards: string[];
    triggerDetail?: string;
  };

  /** Current session dosage parameters before progression. */
  currentDosage?: Partial<ProgressionDosageParameters>;

  /** Optional evaluation timestamp (epoch ms). */
  timestamp?: number;
}

/**
 * Output result from AdaptiveProgressionEngine.
 */
export interface AdaptiveProgressionResult {
  /** Next session difficulty tier */
  nextSessionDifficulty: SessionDifficulty;

  /** Patient-facing supportive communication */
  patientMessage: string;

  /** Adapted dosage parameters clamped within exercise boundaries */
  adaptedParameters: ProgressionDosageParameters;

  /** Previous session parameters for transparent delta comparison */
  previousParameters: ProgressionDosageParameters;

  /** Biomechanical rationale explaining the decision */
  rationale: string;

  /** Boundaries actively applied to protect the patient */
  boundariesEnforced: ExerciseProgressionBoundaries;

  /** True if safety state overrode or constrained the progression */
  safetyOverrideApplied: boolean;

  /** The safety state evaluated */
  safetyState: RehabilitationSafetyState;

  /** Authoritative Explainable AI rationale (Patch 8) */
  explanation: AIExplanation;

  /** Evaluation timestamp (epoch ms) */
  timestamp: number;
}
