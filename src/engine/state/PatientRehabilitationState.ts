/**
 * PatientRehabilitationState.ts
 * PHYSIOSIS — MULTIMODAL PATIENT STATE (PATCH 9)
 *
 * Single structured patient rehabilitation state combining 9 multimodal telemetry dimensions:
 *   1. Pose (Landmarks 3D, YOLO11n-Pose CUDA / MediaPipe fallback)
 *   2. Kinematics (Joint angles, angular velocity, angular acceleration, ROM %)
 *   3. Posture compensation (Kinematic faults, trunk lean, shoulder hiking, pelvic tilt)
 *   4. Temporal movement (TCN/LSTM predictions, cadence, stability, phase)
 *   5. Patient-reported symptoms (Pain score, dizziness, balance loss count, interruptions)
 *   6. Session history (Longitudinal baselines, qualifying reps/sessions, previous peaks)
 *   7. Exercise metadata (Curated registry definitions, plane, laterality, target angle)
 *   8. Safety state (SAFE / CAUTION / STOP / ESCALATE, flagged hazards, audit trail)
 *   9. Voice/text interaction (Conversational assistant context, STT cues, RAG citations)
 *
 * MANDATORY ATTRIBUTION INVARIANT:
 * Every single value in PatientRehabilitationState strictly identifies:
 *   - value: T
 *   - source: string (e.g. "YOLO+Kinematics", "SafetyEngine", "TemporalTCN", "PatientReport")
 *   - confidence: number (0.0 - 1.0 normalized)
 *   - timestamp: number (epoch ms)
 *
 * Example:
 *   currentROM: {
 *     value: 122,
 *     source: "YOLO+Kinematics",
 *     confidence: 0.94,
 *     timestamp: 1726999999999
 *   }
 *
 * Single structured input fed to:
 *   - 3D Viewer (Three.js skeleton & reference canvas)
 *   - Guidance (Analysis card & corrective drill registry)
 *   - Report (Final session report & clinical summaries)
 *   - Assistant (Local Ollama RAG & conversational assistant)
 *   - Recommendation Engine (Constrained protocol matrix)
 *   - Progress Engine (Longitudinal baseline & statistical trend)
 */

import type { Landmark3D } from '../exercise/ExerciseTypes';
import { getExercise, getDefaultExercise } from '../exercise/ExerciseRegistry';
import type { MovementState } from '../biomechanics/biomechanicsTypes';
import type { TemporalPredictionOutput } from '../ai/temporal/TemporalTypes';
import type { AISafetyLevel, AIProgressionStage, AIRecommendationSource, AIVelocityQuality, PhysiosisAIState, AIOrchestratorInput } from '../ai/AIOrchestratorTypes';
import type { RehabilitationSafetyState, SafetyAuditEvent } from '../safety/SafetyTypes';
import type { AIExplanation } from '../recommendation/RecommendationTypes';
import type { PersonalizedRecommendations } from '../ai/baseline/PatientBaselineTypes';
import type { PhysioAssistantContext } from '../../types/assistant';
import type { AdaptiveProgressionResult } from '../progression/ProgressionTypes';

// ============================================================================
// 1. UNIVERSAL ATTRIBUTED ENVELOPE
// ============================================================================

export interface AttributedValue<T> {
  value: T;
  source: string;
  confidence: number; // 0.0 - 1.0 (normalized)
  timestamp: number;  // epoch ms
  metadata?: Record<string, any>;
}

export function createAttributedValue<T>(
  value: T,
  source: string,
  confidence: number,
  timestamp: number = Date.now(),
  metadata?: Record<string, any>
): AttributedValue<T> {
  // Clamp confidence to 0.0 - 1.0 range
  const normalizedConfidence = Math.max(0, Math.min(1, confidence > 1 ? confidence / 100 : confidence));
  return {
    value,
    source,
    confidence: Number(normalizedConfidence.toFixed(4)),
    timestamp,
    ...(metadata ? { metadata } : {}),
  };
}

// ============================================================================
// 2. VALUE PAYLOAD INTERFACES
// ============================================================================

export interface ExerciseMetadataSummary {
  id: string;
  name: string;
  targetAngle: number;
  plane?: string;
  primaryJoint?: string;
  prescribedReps?: number;
  prescribedSets?: number;
}

export interface MovementQualitySummary {
  score: number;       // 0 - 100
  stability: number;   // 0 - 100
  symmetry: number;    // 0 - 100
  velocityQuality: AIVelocityQuality;
  angularVelocity: number;      // °/s
  angularAcceleration?: number; // °/s²
  movementPhase: MovementState;
}

export interface CompensationSummary {
  detected: boolean;
  activeFaultsCount: number;
  primaryFault: string | null;
  severity: 'NONE' | 'MILD' | 'MODERATE' | 'SEVERE';
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
}

export interface PatientSymptomsSummary {
  painScore: number;           // 0 - 10
  dizzinessReported: boolean;
  balanceLossCount: number;
  sessionInterrupted: boolean;
  lastReportedTimestamp?: number;
}

export interface TrackingConfidenceSummary {
  trackingConfidence: number;        // 0 - 100
  biomechanicalConfidence: number;   // 0 - 100
  isReliable: boolean;
  degradationReason: string | null;
  pipelineSource: 'YOLO11n-Pose CUDA' | 'MediaPipe' | 'Synthetic' | 'Standby';
}

export interface BaselineComparisonSummary {
  status: 'BASELINE_AVAILABLE' | 'INSUFFICIENT_HISTORY';
  typicalROM: number | null;
  medianROM: number | null;
  bestROM: number | null;
  deltaVsBaseline: number | null;
  repConsistency: number | null;
  compensationFrequency: number | null;
  comparisonStatement: string;
  personalization?: PersonalizedRecommendations | null;
}

export interface SessionTrendSummary {
  trend: 'improving' | 'stable' | 'declining' | 'insufficient data';
  slopeDegreesPerSession?: number;
  qualifyingSessionCount: number;
}

export interface SafetyEvaluationSummary {
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
}

export interface RecommendationSummary {
  recommendedExerciseId: string;
  recommendedExerciseName: string;
  reason: string;
  difficulty: string;
  sets: number;
  repetitions: number;
  holdDuration: number;
  rest: number;
  progressionStage: AIProgressionStage;
  recommendationSource: AIRecommendationSource;
  explanation: AIExplanation;
}

export interface NextActionSummary {
  cue: string;
  primaryInstruction: string;
  actionInstruction: string;
  directionalCue: string;
  voiceCue: string;
  correctionDrill?: {
    id: string;
    title: string;
    targetArea: string;
  } | null;
}

export interface VoiceTextInteractionContext {
  lastUserQuery?: string;
  lastAssistantReply?: string;
  lastSpokenCue?: string;
  language?: string;
  ragCitationsCount?: number;
  conversationTimestamp?: number;
}

export interface MultimodalStreamsContext {
  landmarks3D?: Landmark3D[] | null;
  temporalPrediction?: TemporalPredictionOutput | null;
  voiceTextInteraction?: VoiceTextInteractionContext | null;
  rawStats?: Record<string, any> | null;
}

// ============================================================================
// 3. TOP-LEVEL STRUCTURED PATIENT REHABILITATION STATE
// ============================================================================

export interface PatientRehabilitationState {
  /** 1. Current exercise identity and protocol parameters */
  currentExercise: AttributedValue<ExerciseMetadataSummary>;

  /** 2. Laterality / active limb */
  laterality: AttributedValue<'left' | 'right' | 'bilateral'>;

  /** 3. Current live ROM angle in degrees */
  currentROM: AttributedValue<number | null>;

  /** 4. Clinical protocol target ROM in degrees */
  targetROM: AttributedValue<number>;

  /** 5. Movement quality, stability, and speed dynamics */
  quality: AttributedValue<MovementQualitySummary>;

  /** 6. Posture compensation and kinetic faults */
  compensation: AttributedValue<CompensationSummary>;

  /** 7. Patient-reported symptoms and interruptions */
  symptoms: AttributedValue<PatientSymptomsSummary>;

  /** 8. Sensor tracking reliability and hardware confidence */
  confidence: AttributedValue<TrackingConfidenceSummary>;

  /** 9. Patient longitudinal baseline and personalization */
  baseline: AttributedValue<BaselineComparisonSummary>;

  /** 10. Statistical multi-session trend */
  trend: AttributedValue<SessionTrendSummary>;

  /** 11. Authoritative clinical safety state */
  safety: AttributedValue<SafetyEvaluationSummary>;

  /** 12. Constrained clinical protocol recommendation */
  recommendation: AttributedValue<RecommendationSummary>;

  /** 13. Immediate next coaching action and execution cue */
  nextAction: AttributedValue<NextActionSummary>;

  /** 14. Safe Adaptive Difficulty Progression (Patch 10) */
  progression?: AttributedValue<AdaptiveProgressionResult>;

  /** 9 Multimodal telemetry raw streams context */
  multimodalStreams?: MultimodalStreamsContext;
}

// ============================================================================
// 4. MULTIMODAL STATE BUILDER / AGGREGATOR
// ============================================================================

export interface BuildPatientStateOptions {
  pipelineSource?: 'YOLO11n-Pose CUDA' | 'MediaPipe' | 'Synthetic' | 'Standby';
  voiceTextContext?: VoiceTextInteractionContext;
  customTimestamp?: number;
}

export function buildPatientRehabilitationState(
  input: AIOrchestratorInput,
  aiState: PhysiosisAIState,
  options: BuildPatientStateOptions = {}
): PatientRehabilitationState {
  const ts = options.customTimestamp ?? Date.now();
  const pipeline = options.pipelineSource ?? (input.isStreaming ? 'YOLO11n-Pose CUDA' : 'Standby');

  // Normalized tracking confidence
  const trackingConfNorm = aiState.confidence.trackingConfidence / 100;
  const biomechConfNorm = aiState.confidence.biomechanicalConfidence / 100;

  // 1. Current Exercise
  const currentExercise = createAttributedValue<ExerciseMetadataSummary>(
    {
      id: input.activeExercise.id,
      name: input.activeExercise.name,
      targetAngle: input.activeExercise.targetAngle,
      plane: input.activeExercise.plane,
      primaryJoint: input.activeExercise.highlightJoint,
      prescribedReps: (input.activeExercise as any).targetReps ?? 10,
      prescribedSets: (input.activeExercise as any).targetSets ?? 3,
    },
    'PhysiosisExerciseRegistry',
    1.0,
    ts
  );

  // 2. Laterality
  const laterality = createAttributedValue<'left' | 'right' | 'bilateral'>(
    input.selectedSide ?? 'right',
    'SessionSelection',
    1.0,
    ts
  );

  // 3. Current ROM (Attributed exactly as requested in Patch 9)
  const currentROM = createAttributedValue<number | null>(
    aiState.exerciseState.currentAngle,
    `${pipeline.startsWith('YOLO') ? 'YOLO+Kinematics' : 'MediaPipe+Kinematics'}`,
    Math.max(0.1, trackingConfNorm),
    ts,
    {
      romPercentage: aiState.exerciseState.romPercentage,
      deviation: aiState.exerciseState.deviation,
    }
  );

  // 4. Target ROM
  const targetROM = createAttributedValue<number>(
    aiState.exerciseState.targetAngle,
    'ClinicalProtocolMatrix',
    1.0,
    ts
  );

  // 5. Movement Quality
  const quality = createAttributedValue<MovementQualitySummary>(
    {
      score: aiState.movementQuality.score,
      stability: aiState.movementQuality.stability,
      symmetry: aiState.movementQuality.symmetry,
      velocityQuality: aiState.movementQuality.velocityQuality,
      angularVelocity: input.angularVelocity ?? 0,
      angularAcceleration: input.angularAcceleration,
      movementPhase: aiState.exerciseState.movementPhase,
    },
    aiState.temporalIntelligence ? 'KinematicsTracker+TemporalModel' : 'KinematicsTracker',
    Math.min(1.0, (trackingConfNorm + biomechConfNorm) / 2),
    ts
  );

  // 6. Posture Compensation
  const compSeverity: 'NONE' | 'MILD' | 'MODERATE' | 'SEVERE' = !aiState.compensationState.detected
    ? 'NONE'
    : (aiState.compensationState.compensations[0]?.severity as any) || 'MILD';

  const compensation = createAttributedValue<CompensationSummary>(
    {
      detected: aiState.compensationState.detected,
      activeFaultsCount: aiState.compensationState.compensations.length,
      primaryFault: aiState.postureState.primaryFault,
      severity: compSeverity,
      compensations: aiState.compensationState.compensations,
      activeCompensatingJoints: aiState.compensationState.activeCompensatingJoints,
    },
    'PostureCompensationEngine',
    trackingConfNorm,
    ts
  );

  // 7. Patient-Reported Symptoms
  const symptoms = createAttributedValue<PatientSymptomsSummary>(
    {
      painScore: input.userReportedPain ?? 0,
      dizzinessReported: input.userReportedDizziness ?? false,
      balanceLossCount: input.balanceLossCount ?? 0,
      sessionInterrupted: input.sessionInterrupted ?? false,
      lastReportedTimestamp: ts,
    },
    'PatientTelemetryReport',
    1.0, // Patient-reported is self-affirmed
    ts
  );

  // 8. Tracking Confidence
  const confidence = createAttributedValue<TrackingConfidenceSummary>(
    {
      trackingConfidence: aiState.confidence.trackingConfidence,
      biomechanicalConfidence: aiState.confidence.biomechanicalConfidence,
      isReliable: aiState.confidence.isReliable,
      degradationReason: aiState.confidence.degradationReason,
      pipelineSource: pipeline,
    },
    pipeline,
    trackingConfNorm,
    ts
  );

  // 9. Patient Baseline
  const baseline = createAttributedValue<BaselineComparisonSummary>(
    {
      status: aiState.patientProgress.baselineStatus,
      typicalROM: aiState.patientProgress.typicalROM,
      medianROM: aiState.patientProgress.medianROM,
      bestROM: aiState.patientProgress.historicalBestROM,
      deltaVsBaseline: aiState.patientProgress.sessionDeltaVsBaseline,
      repConsistency: aiState.patientProgress.repConsistency,
      compensationFrequency: aiState.patientProgress.compensationFrequency,
      comparisonStatement: aiState.patientProgress.comparisonStatement,
      personalization: aiState.patientProgress.personalization,
    },
    'PatientBaselineEngine',
    aiState.patientProgress.baselineStatus === 'BASELINE_AVAILABLE' ? 0.95 : 0.4,
    ts
  );

  // 10. Statistical Trend
  const qualifyingSessionsCount = input.savedSessions
    ? input.savedSessions.filter(
        (s) =>
          (s.exerciseId || s.exercise || '').toLowerCase().replace(/[\s-_]+/g, '') ===
          input.activeExercise.id.toLowerCase().replace(/[\s-_]+/g, '')
      ).length
    : 0;

  const trend = createAttributedValue<SessionTrendSummary>(
    {
      trend: aiState.patientProgress.trend,
      qualifyingSessionCount: qualifyingSessionsCount,
    },
    'SessionAnalyticsEngine',
    qualifyingSessionsCount >= 3 ? 0.9 : 0.5,
    ts
  );

  // 11. Safety State
  const safety = createAttributedValue<SafetyEvaluationSummary>(
    {
      level: aiState.safetyState.level,
      rehabilitationSafetyState: aiState.safetyState.rehabilitationSafetyState,
      isSafe: aiState.safetyState.isSafe,
      isCoachingAllowed: aiState.safetyState.isCoachingAllowed,
      isProgressionAllowed: aiState.safetyState.isProgressionAllowed,
      isGamificationAllowed: aiState.safetyState.isGamificationAllowed,
      isVoiceCoachingAllowed: aiState.safetyState.isVoiceCoachingAllowed,
      statusMessage: aiState.safetyState.statusMessage,
      action: aiState.safetyState.action,
      escalationNotice: aiState.safetyState.escalationNotice,
      auditEvent: aiState.safetyState.auditEvent,
      flaggedHazards: aiState.safetyState.flaggedHazards,
      disclaimer: aiState.safetyState.disclaimer,
    },
    'RehabilitationSafetyEngine',
    1.0, // Safety engine executes authoritatively
    ts
  );

  // 12. Recommendation
  const recObj = aiState.recommendedProtocol.recommendation;
  const recommendation = createAttributedValue<RecommendationSummary>(
    {
      recommendedExerciseId: recObj?.recommendedExercise.id ?? input.activeExercise.id,
      recommendedExerciseName: recObj?.recommendedExercise.name ?? input.activeExercise.name,
      reason: recObj?.reason ?? aiState.recommendedProtocol.dosageRecommendation,
      difficulty: recObj?.difficulty ?? 'STANDARD',
      sets: recObj?.sets ?? (input.activeExercise as any).targetSets ?? 3,
      repetitions: recObj?.repetitions ?? (input.activeExercise as any).targetReps ?? 10,
      holdDuration: recObj?.holdDuration ?? 2,
      rest: recObj?.rest ?? 60,
      progressionStage: aiState.recommendedProtocol.progressionStage,
      recommendationSource: aiState.recommendedProtocol.recommendationSource,
      explanation: aiState.explanation,
    },
    'RehabilitationRecommendationEngine',
    recObj?.confidence ?? 0.9,
    ts
  );

  // 13. Next Action
  const nextAction = createAttributedValue<NextActionSummary>(
    {
      cue: aiState.guidance.directionalCue,
      primaryInstruction: aiState.guidance.primaryInstruction,
      actionInstruction: aiState.guidance.actionInstruction,
      directionalCue: aiState.guidance.directionalCue,
      voiceCue: aiState.guidance.voiceCue,
      correctionDrill: aiState.guidance.correctionDrill,
    },
    'AIOrchestratorGuidance',
    0.95,
    ts
  );

  // 14. Safe Adaptive Difficulty Progression (Patch 10)
  const progression = aiState.adaptiveProgression
    ? createAttributedValue<AdaptiveProgressionResult>(
        aiState.adaptiveProgression,
        'AdaptiveProgressionEngine',
        aiState.adaptiveProgression.explanation.confidence,
        ts,
        {
          nextDifficulty: aiState.adaptiveProgression.nextSessionDifficulty,
          patientMessage: aiState.adaptiveProgression.patientMessage,
          boundaries: aiState.adaptiveProgression.boundariesEnforced,
        }
      )
    : undefined;

  // Multimodal Raw/Stream Context
  const multimodalStreams: MultimodalStreamsContext = {
    landmarks3D: input.landmarks,
    temporalPrediction: aiState.temporalIntelligence ?? input.temporalPrediction,
    voiceTextInteraction: options.voiceTextContext ?? null,
    rawStats: input.stats ? { ...input.stats } : null,
  };

  return {
    currentExercise,
    laterality,
    currentROM,
    targetROM,
    quality,
    compensation,
    symptoms,
    confidence,
    baseline,
    trend,
    safety,
    recommendation,
    nextAction,
    ...(progression ? { progression } : {}),
    multimodalStreams,
  };
}

// ============================================================================
// 5. CONSUMER EXTRACTION ADAPTERS
// ============================================================================

/**
 * 1. 3D Viewer Consumer Adapter (Three.js Skeleton & Reference Canvas)
 */
export interface ThreeJSViewerInput {
  landmarks: Landmark3D[] | null;
  currentAngle: number | null;
  targetAngle: number;
  laterality: 'left' | 'right' | 'bilateral';
  highlightJoints: string[];
  isAbnormalDetected: boolean;
  statusColour: string;
}

export function extract3DViewerInput(state: PatientRehabilitationState): ThreeJSViewerInput {
  const isAbnormal = state.compensation.value.detected;
  const isSafe = state.safety.value.isSafe;

  let statusColour = 'var(--accent-cyan)';
  if (!isSafe) {
    statusColour = 'var(--color-crit)';
  } else if (isAbnormal) {
    statusColour = 'var(--color-warn)';
  } else if (
    state.currentROM.value !== null &&
    state.currentROM.value >= state.targetROM.value - 8
  ) {
    statusColour = 'var(--color-good)';
  }

  return {
    landmarks: state.multimodalStreams?.landmarks3D ?? null,
    currentAngle: state.currentROM.value,
    targetAngle: state.targetROM.value,
    laterality: state.laterality.value,
    highlightJoints: state.compensation.value.activeCompensatingJoints,
    isAbnormalDetected: isAbnormal,
    statusColour,
  };
}

/**
 * 2. Guidance Consumer Adapter (Analysis Card & Corrective Drills)
 */
export interface GuidanceConsumerInput {
  primaryInstruction: string;
  actionInstruction: string;
  directionalCue: string;
  voiceCue: string;
  drillTitle: string | null;
  drillArea: string | null;
  safetyMessage: string;
  isSafe: boolean;
  qualityScore: number;
}

export function extractGuidanceInput(state: PatientRehabilitationState): GuidanceConsumerInput {
  const action = state.nextAction.value;
  return {
    primaryInstruction: action.primaryInstruction,
    actionInstruction: action.actionInstruction,
    directionalCue: action.directionalCue,
    voiceCue: action.voiceCue,
    drillTitle: action.correctionDrill?.title ?? null,
    drillArea: action.correctionDrill?.targetArea ?? null,
    safetyMessage: state.safety.value.statusMessage,
    isSafe: state.safety.value.isSafe,
    qualityScore: state.quality.value.score,
  };
}

/**
 * 3. Report Consumer Adapter (Final Session Report)
 */
export interface ReportSummaryInput {
  exerciseName: string;
  targetROM: number;
  currentROM: number | null;
  qualityScore: number;
  safetyStatus: string;
  baselineComparison: string;
  trend: string;
  recommendationDosage: string;
  rationale: string;
  flaggedHazards: string[];
}

export function extractReportSummary(state: PatientRehabilitationState): ReportSummaryInput {
  const rec = state.recommendation.value;
  return {
    exerciseName: state.currentExercise.value.name,
    targetROM: state.targetROM.value,
    currentROM: state.currentROM.value,
    qualityScore: state.quality.value.score,
    safetyStatus: state.safety.value.rehabilitationSafetyState,
    baselineComparison: state.baseline.value.comparisonStatement,
    trend: state.trend.value.trend,
    recommendationDosage: `${rec.sets} sets × ${rec.repetitions} reps (${rec.holdDuration}s hold, ${rec.rest}s rest)`,
    rationale: rec.explanation.patientView,
    flaggedHazards: state.safety.value.flaggedHazards,
  };
}

/**
 * 4. Assistant Consumer Adapter (Local Ollama RAG & Conversational Assistant)
 */
export function extractAssistantContext(state: PatientRehabilitationState): PhysioAssistantContext {
  const symptoms = state.symptoms.value;
  const limitations: string[] = [];

  if (symptoms.painScore > 0) {
    limitations.push(`Reported pain level ${symptoms.painScore}/10`);
  }
  if (symptoms.dizzinessReported) {
    limitations.push('Dizziness reported');
  }
  if (state.compensation.value.detected && state.compensation.value.primaryFault) {
    limitations.push(`Observed compensation: ${state.compensation.value.primaryFault}`);
  }
  if (state.safety.value.flaggedHazards.length > 0) {
    limitations.push(...state.safety.value.flaggedHazards);
  }

  const suggestions: string[] = [
    state.nextAction.value.actionInstruction,
    state.recommendation.value.explanation.patientView,
  ];

  return {
    exercise: state.currentExercise.value.name,
    targetROM: state.targetROM.value,
    currentROM: state.currentROM.value ?? undefined,
    bestROM: state.baseline.value.bestROM ?? undefined,
    movementQuality: state.quality.value.score,
    limitations: limitations.length > 0 ? limitations : undefined,
    suggestions,
    trend: state.trend.value.trend,
    hasActiveSession: true,
    patientState: state,
  };
}

/**
 * 5. Recommendation Engine Consumer Adapter
 */
export function extractRecommendationEngineInput(state: PatientRehabilitationState) {
  const curatedExercise =
    getExercise(state.currentExercise.value.id) ||
    getDefaultExercise();

  return {
    exercise: curatedExercise,
    rom: {
      currentAngle: state.currentROM.value,
      targetAngle: state.targetROM.value,
      romPercentage: state.currentROM.metadata?.romPercentage ?? 0,
      bestROM: state.baseline.value.bestROM ?? 0,
    },
    movementQuality: {
      score: state.quality.value.score,
      stability: state.quality.value.stability,
      symmetry: state.quality.value.symmetry,
      velocityQuality: state.quality.value.velocityQuality,
    },
    compensation: {
      detected: state.compensation.value.detected,
      primaryFault: state.compensation.value.compensations[0]
        ? {
            type: state.compensation.value.compensations[0].type,
            name: state.compensation.value.compensations[0].name,
            severity: state.compensation.value.compensations[0].severity,
            measuredValue: state.compensation.value.compensations[0].measuredValue,
            unit: state.compensation.value.compensations[0].unit,
          }
        : null,
      activeFaultsCount: state.compensation.value.activeFaultsCount,
      activeCompensatingJoints: state.compensation.value.activeCompensatingJoints,
    },
    patientBaseline: {
      status: state.baseline.value.status,
      typicalROM: state.baseline.value.typicalROM,
      medianROM: state.baseline.value.medianROM,
      bestROM: state.baseline.value.bestROM ?? 0,
      repConsistency: state.baseline.value.repConsistency,
      compensationFrequency: state.baseline.value.compensationFrequency,
    },
    recentSessionTrend: {
      trend: state.trend.value.trend,
    },
    confidence: {
      trackingConfidence: state.confidence.value.trackingConfidence,
      biomechanicalConfidence: state.confidence.value.biomechanicalConfidence,
      isReliable: state.confidence.value.isReliable,
      degradationReason: state.confidence.value.degradationReason,
    },
    safetyState: {
      level: state.safety.value.level,
      flaggedHazards: state.safety.value.flaggedHazards,
    },
    temporalPrediction: state.multimodalStreams?.temporalPrediction ?? null,
  };
}

/**
 * 6. Progress Engine Consumer Adapter
 */
export function extractProgressEngineInput(state: PatientRehabilitationState) {
  return {
    exerciseKey: state.currentExercise.value.id,
    currentROM: state.currentROM.value,
    targetROM: state.targetROM.value,
    baselineStatus: state.baseline.value.status,
    typicalROM: state.baseline.value.typicalROM,
    medianROM: state.baseline.value.medianROM,
    bestROM: state.baseline.value.bestROM,
    deltaVsBaseline: state.baseline.value.deltaVsBaseline,
    trend: state.trend.value.trend,
    repConsistency: state.baseline.value.repConsistency,
    comparisonStatement: state.baseline.value.comparisonStatement,
  };
}
