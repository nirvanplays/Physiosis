/**
 * RecommendationTypes.ts
 * Typed contracts for the Physiosis Constrained Rehabilitation Protocol Engine.
 *
 * Core Concept:
 *   Selects personalized, evidence-based rehabilitation protocols strictly
 *   from the curated Physiosis exercise registry.
 *
 * STRICT MEDICAL & CLINICAL GUARDRAILS:
 *   - The engine may only select from a curated exercise registry.
 *   - It may NOT invent arbitrary exercises.
 *   - It may NOT prescribe medication.
 *   - It may NOT diagnose.
 *   - Recommendations are strictly deterministic and reproducible.
 */

import type { ExerciseDefinition } from '../exercise/ExerciseTypes';
import type { CorrectiveDrill } from '../guidance/CorrectiveDrillRegistry';
import type { BaselineStatus, StatisticalTrend } from '../ai/baseline/PatientBaselineTypes';
import type { TemporalPredictionOutput } from '../ai/temporal/TemporalTypes';

export type RecommendationSourceType =
  | 'PROTOCOL'
  | 'PATIENT_BASELINE'
  | 'SAFETY_RULE'
  | 'TEMPORAL_MODEL';

export type RecommendationDifficulty = 'beginner' | 'intermediate' | 'advanced';

/**
 * Authoritative category of evidence sources backing an AI coaching decision.
 * Every coaching decision must trace to at least one of:
 * - 'sensor_data'
 * - 'protocol' (protocol rule)
 * - 'knowledge_source'
 * - 'model_output'
 * alongside biomechanics, patient_baseline, or safety_rule.
 */
export type ExplanationSourceCategory =
  | 'sensor_data'
  | 'biomechanics'
  | 'protocol'
  | 'patient_baseline'
  | 'safety_rule'
  | 'knowledge_source'
  | 'model_output';

/**
 * Developer / Clinician audit trace view for machine-traceable verification.
 */
export interface DeveloperTraceView {
  metric: string;
  threshold: string | number;
  confidence: number;
  source: ExplanationSourceCategory[];
  timestamp: number;
  rawValues?: Record<string, any>;
}

/**
 * PHYSIOSIS EXPLAINABLE AI PATCH 8: Authoritative Structured Explanation Object.
 * Encapsulates concise evidence-based rationale without exposing private chain-of-thought.
 */
export interface AIExplanation {
  observation: string;
  evidence: string;
  contributingFactors: string[];
  recommendation: string;
  confidence: number; // 0.0 to 1.0 (normalized)
  source: ExplanationSourceCategory[];

  /** Concise, empathetic, jargon-free coaching rationale for the patient */
  patientView: string;

  /** Machine-auditable telemetry trace for clinicians and developers */
  developerView: DeveloperTraceView;
}

/**
 * Multi-stream input contract for the recommendation engine.
 */
export interface RehabilitationRecommendationInput {
  /** The active exercise currently being performed. */
  exercise: ExerciseDefinition;

  /** Real-time range-of-motion telemetry. */
  rom: {
    currentAngle: number | null;
    targetAngle: number;
    romPercentage: number;
    bestROM?: number | null;
  };

  /** Biomechanical movement quality and stability telemetry. */
  movementQuality: {
    score: number; // 0 - 100
    stability: number; // 0 - 100
    symmetry: number; // 0 - 100
    velocityQuality?: 'OPTIMAL' | 'TOO_FAST' | 'TOO_SLOW' | 'JERKY';
  };

  /** Detected abnormal posture and compensation telemetry. */
  compensation: {
    detected: boolean;
    primaryFault?: {
      type: string;
      name: string;
      severity: 'MILD' | 'MODERATE' | 'SEVERE';
      measuredValue: number;
      unit: string;
    } | null;
    activeFaultsCount?: number;
    activeCompensatingJoints?: string[];
  };

  /** Patient-specific longitudinal baseline kinematics. */
  patientBaseline?: {
    status: BaselineStatus;
    typicalROM: number | null;
    medianROM: number | null;
    bestROM: number | null;
    repConsistency: number | null;
    compensationFrequency: number | null;
  } | null;

  /** Recent session trajectory trend. */
  recentSessionTrend?: {
    trend: StatisticalTrend;
    slopeDegreesPerSession?: number;
  } | null;

  /** Tracking confidence and camera reliability. */
  confidence: {
    trackingConfidence: number; // 0 - 100
    biomechanicalConfidence: number; // 0 - 100
    isReliable: boolean;
    degradationReason?: string | null;
  };

  /** Real-time safety state and flagged hazards. */
  safetyState: {
    level: 'SAFE' | 'CAUTION' | 'STOP_MOVEMENT';
    flaggedHazards: string[];
  };

  /** Optional temporal neural model prediction telemetry (TCN / LSTM / Transformer). */
  temporalPrediction?: TemporalPredictionOutput | null;

  /** Optional evaluation timestamp (epoch ms) for deterministic telemetry audits. */
  timestamp?: number;
}

/**
 * Authoritative structured recommendation output contract.
 */
export interface RehabilitationRecommendation {
  /** Curated exercise selected strictly from the approved Physiosis registry. */
  recommendedExercise: ExerciseDefinition;

  /** Clinical and biomechanical rationale for this specific recommendation. */
  reason: string;

  /** Recommended difficulty tier. */
  difficulty: RecommendationDifficulty;

  /** Prescribed sets for the protocol. */
  sets: number;

  /** Prescribed repetitions per set. */
  repetitions: number;

  /** Isometric peak hold duration in seconds. */
  holdDuration: number;

  /** Recommended inter-set rest period in seconds. */
  rest: number;

  /** Actionable next execution step or coaching cue for the patient. */
  nextStep: string;

  /** Confidence score in this recommendation [0–100]. */
  confidence: number;

  /** Authoritative source attribution for this recommendation. */
  sourceType: RecommendationSourceType;

  /** Optional paired corrective drill if compensatory patterns were detected. */
  correctiveDrill?: CorrectiveDrill | null;

  /** True if this scenario warrants clinical physiotherapist consultation. */
  clinicalEscalationRequired?: boolean;

  /** Suggested interim progression target angle (degrees), if advancing baseline. */
  interimTargetAngle?: number;

  /** Authoritative Explainable AI rationale for patient and clinical developer audit */
  explanation: AIExplanation;
}
