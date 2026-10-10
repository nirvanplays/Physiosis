/**
 * =====================================================================
 * PHYSIOSIS — REAL-TIME REHABILITATION SAFETY TYPES (PATCH 6)
 * =====================================================================
 * Authoritative safety type system governing runtime biomechanics,
 * clinical safety escalation, audit logging, and coaching suppression.
 *
 * Enforces strict clinical non-certitude and non-diagnostic principles:
 * - Never declares "You are safe."
 * - Evaluates strictly observable physical and application signals.
 * - Zero medical diagnosis inference.
 */

export type RehabilitationSafetyState = 'SAFE' | 'CAUTION' | 'STOP' | 'ESCALATE';

export type SafetyTriggerType =
  | 'NOMINAL'
  | 'TRACKING_CONFIDENCE_DEGRADED'
  | 'SUDDEN_MOVEMENT_CHANGE'
  | 'UNUSUAL_ASYMMETRY'
  | 'REPEATED_LOSS_OF_BALANCE'
  | 'USER_REPORTED_PAIN'
  | 'USER_REPORTED_DIZZINESS'
  | 'SESSION_INTERRUPTION'
  | 'EXTREME_DEVIATION';

export interface SafetyAuditEvent {
  timestamp: string;
  exercise: string;
  trigger: SafetyTriggerType;
  triggerDetail: string;
  state: RehabilitationSafetyState;
  action: string;
  confidence: number;
}

export interface SafetyEvaluationInput {
  exerciseId: string;
  trackingConfidence: number; // 0.0 - 1.0
  currentAngle: number;
  targetAngle: number;
  angularVelocity: number; // degrees / second
  angularAcceleration?: number; // degrees / second^2
  asymmetryAngle?: number; // degrees asymmetry between contralateral limbs
  balanceLossCount?: number; // cumulative or windowed count of balance losses
  userReportedPain?: number; // 0 - 10 scale (NRS / VAS)
  userReportedDizziness?: boolean; // patient reported dizziness / vertigo
  sessionInterrupted?: boolean; // sudden exit / distress dropout
  severeCompensation?: boolean; // trunk leaning or substitute motion detected
}

export interface SafetyEvaluationResult {
  state: RehabilitationSafetyState;
  isCoachingAllowed: boolean;
  isProgressionAllowed: boolean;
  isGamificationAllowed: boolean;
  isVoiceCoachingAllowed: boolean;
  statusMessage: string;
  action: string;
  trigger: SafetyTriggerType;
  triggerDetail: string;
  escalationNotice?: string;
  auditEvent?: SafetyAuditEvent;
  flaggedHazards: string[];
}
