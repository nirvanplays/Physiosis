/**
 * AIOrchestratorTypes.ts
 * Typed contracts for the Physiosis Rehabilitation AI Orchestrator.
 *
 * Single authoritative contract integrating pose estimation, biomechanics,
 * posture compensation, exercise protocol, patient history, and clinical safety.
 */

import type { MovementState, PostureCompensationResult } from '../biomechanics/biomechanicsTypes';
import type { LiveSessionState, PhysiosisSession } from '../session/SessionTypes';
import type { ExerciseDefinition } from '../exercise/ExerciseTypes';
import type { Landmark3D } from '../exercise/ExerciseTypes';
import type { PoseTrackingStats } from '../../types/pose';
import type { TemporalPredictionOutput } from './temporal/TemporalTypes';
import type { RehabilitationSafetyState, SafetyAuditEvent } from '../safety/SafetyTypes';
import type { AIExplanation } from '../recommendation/RecommendationTypes';
import type { PatientRehabilitationState, VoiceTextInteractionContext } from '../state/PatientRehabilitationState';
import type { AdaptiveProgressionResult } from '../progression/ProgressionTypes';

export type AISafetyLevel = 'SAFE' | 'CAUTION' | 'STOP_MOVEMENT';
export type AIProgressionStage = 'REGRESSION' | 'MAINTAIN' | 'PROGRESSION';
export type AIRecommendationSource =
  | 'CLINICAL_PROTOCOL_MATRIX'
  | 'SAFETY_OVERRIDE'
  | 'BASELINE_RULES'
  | 'STANDBY';
export type AIVelocityQuality = 'OPTIMAL' | 'TOO_FAST' | 'TOO_SLOW' | 'JERKY';
export type AIEscalationUrgency = 'NONE' | 'ROUTINE' | 'PROMPT';

export interface AIOrchestratorInput {
  landmarks: Landmark3D[] | null;
  activeExercise: ExerciseDefinition;
  sessionState: LiveSessionState;
  postureResult?: PostureCompensationResult | null;
  stats?: PoseTrackingStats | null;
  savedSessions?: PhysiosisSession[];
  isStreaming: boolean;
  selectedSide?: 'left' | 'right' | 'bilateral';
  currentAngle?: number | null;
  temporalPrediction?: TemporalPredictionOutput | null;
  userReportedPain?: number;
  userReportedDizziness?: boolean;
  balanceLossCount?: number;
  sessionInterrupted?: boolean;
  angularVelocity?: number;
  angularAcceleration?: number;
  asymmetryAngle?: number;
  voiceTextContext?: VoiceTextInteractionContext;
}

export interface PhysiosisAIState {
  /** 1. Overall Session State Telemetry */
  sessionState: {
    status: 'IDLE' | 'READY' | 'ACTIVE' | 'PAUSED' | 'ENDING' | 'COMPLETED';
    elapsedSeconds: number;
    completedReps: number;
    activeRep: number;
  };

  /** 2. Biomechanical Exercise State */
  exerciseState: {
    exerciseId: string;
    exerciseName: string;
    laterality: 'left' | 'right' | 'bilateral';
    currentAngle: number | null;
    targetAngle: number;
    romPercentage: number;
    movementPhase: MovementState;
    deviation: number;
  };

  /** 3. Movement Quality & Kinetic Stability */
  movementQuality: {
    score: number; // 0 - 100
    stability: number; // 0 - 100
    symmetry: number; // 0 - 100
    velocityQuality: AIVelocityQuality;
  };

  /** 4. Kinetic Chain Postural State */
  postureState: {
    integrityScore: number; // 0 - 100
    isOptimal: boolean;
    activeFaultsCount: number;
    primaryFault: string | null;
  };

  /** 5. Compensation State & Biomechanical Deviations */
  compensationState: {
    detected: boolean;
    compensations: Array<{
      type: string;
      name: string;
      severity: 'MILD' | 'MODERATE' | 'SEVERE';
      jointKeys: string[];
      measuredValue: number;
      unit: string;
      clinicalCue: string;
    }>;
    activeCompensatingJoints: string[];
  };

  /** 6. Patient Longitudinal Baseline Comparison & Personalization */
  patientProgress: {
    baselineStatus: 'BASELINE_AVAILABLE' | 'INSUFFICIENT_HISTORY';
    baselineROM: number | null;
    typicalROM: number | null;
    medianROM: number | null;
    historicalBestROM: number | null;
    sessionDeltaVsBaseline: number | null;
    repConsistency: number | null;
    compensationFrequency: number | null;
    comparisonStatement: string;
    trend: 'improving' | 'stable' | 'declining' | 'insufficient data';
    personalization?: import('./baseline/PatientBaselineTypes').PersonalizedRecommendations | null;
  };


  /** 7. Multimodal Real-Time Guidance */
  guidance: {
    primaryInstruction: string; // One sentence immediate action
    actionInstruction: string; // Actionable execution cue
    directionalCue: string; // Vector/direction cue
    correctionDrill: {
      id: string;
      title: string;
      targetArea: string;
    } | null;
    voiceCue: string;
  };

  /** 8. Protocol & Progression Recommendation */
  recommendedProtocol: {
    nextExerciseId: string | null;
    progressionStage: AIProgressionStage;
    dosageRecommendation: string;
    recommendationSource: AIRecommendationSource;
    recommendation?: import('../recommendation/RecommendationTypes').RehabilitationRecommendation | null;
  };


  /** 9. Safety & Protective Constraints (Patch 6: RehabilitationSafetyEngine) */
  safetyState: {
    level: AISafetyLevel;
    rehabilitationSafetyState: RehabilitationSafetyState;
    isSafe: boolean;
    isCoachingAllowed: boolean;
    isProgressionAllowed: boolean;
    isGamificationAllowed: boolean;
    isVoiceCoachingAllowed: boolean;
    statusMessage: string;
    action: string;
    escalationNotice?: string;
    auditEvent?: SafetyAuditEvent;
    flaggedHazards: string[];
    disclaimer: string;
  };

  /** 10. Sensor Tracking Reliability & Confidence */
  confidence: {
    trackingConfidence: number; // 0 - 100
    biomechanicalConfidence: number; // 0 - 100
    isReliable: boolean;
    degradationReason: string | null;
  };

  /** 11. Clinical Escalation Telemetry */
  escalation: {
    requiresClinicianReview: boolean;
    urgency: AIEscalationUrgency;
    reason: string | null;
    consultationPrompt: string;
  };

  /** 12. Temporal Movement Intelligence Telemetry (AI CORE PATCH 2) */
  temporalIntelligence?: TemporalPredictionOutput | null;

  /** 13. Authoritative Explainable AI Coaching Explanation (Patch 8) */
  explanation: AIExplanation;

  /** 14. Authoritative Multimodal Patient Rehabilitation State (Patch 9) */
  patientState: PatientRehabilitationState;

  /** 15. Safe Adaptive Difficulty Progression (Patch 10) */
  adaptiveProgression?: AdaptiveProgressionResult | null;
}
