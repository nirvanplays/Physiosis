/**
 * ReportTypes.ts
 * PHYSIOSIS — AI REPORT PATCH 12
 * INTELLIGENT SESSION REPORT TYPE DEFINITIONS
 *
 * Enforces the 7-section clinical report structure:
 *   1. Session Summary (exercise, duration, repetitions, best ROM, average ROM)
 *   2. Movement Quality (quality score, consistency, symmetry)
 *   3. Compensation Analysis (trunk lean, shoulder hike, knee valgus, others)
 *   4. Progress (current vs baseline, current vs reference, trend)
 *   5. Guidance (what to focus on next)
 *   6. Safety (any safety events)
 *   7. Escalation (whether clinician review is recommended)
 *
 * STRICT NON-DIAGNOSTIC & NUMERICAL VERACITY INVARIANTS:
 *   - No free-form medical claims or diagnoses.
 *   - No invented numbers.
 *   - Automated verification asserts zero discrepancy between narrative and raw telemetry.
 */

import type { RehabilitationSafetyState, SafetyAuditEvent } from '../safety/SafetyTypes';
import type { StatisticalTrend } from '../ai/baseline/PatientBaselineTypes';

/**
 * 1. Session Summary
 */
export interface ReportSessionSummary {
  exercise: string;
  exerciseId: string;
  durationSeconds: number;
  durationFormatted: string;
  repetitions: number;
  bestROM: number;
  averageROM: number;
  targetAngle: number;
}

/**
 * 2. Movement Quality
 */
export interface ReportMovementQuality {
  qualityScore: number;       // 0 - 100
  consistency: number;        // 0 - 100
  symmetry: number;           // 0 - 100
  velocityQuality: string;    // 'OPTIMAL' | 'TOO_FAST' | 'TOO_SLOW' | 'JERKY'
}

/**
 * Single compensation fault detail.
 */
export interface CompensationFaultDetail {
  detected: boolean;
  name: string;
  measuredValue: number;
  unit: string;
  severity: 'NONE' | 'MILD' | 'MODERATE' | 'SEVERE';
  clinicalCue: string;
}

/**
 * 3. Compensation Analysis
 */
export interface ReportCompensationAnalysis {
  trunkLean: CompensationFaultDetail;
  shoulderHike: CompensationFaultDetail;
  kneeValgus: CompensationFaultDetail;
  otherDetectedCompensations: CompensationFaultDetail[];
  totalCompensationsCount: number;
  integrityScore: number;     // 0 - 100
}

/**
 * 4. Progress
 */
export interface ReportProgress {
  currentROM: number;
  baselineROM: number | null;
  deltaVsBaseline: number | null;
  referenceTarget: number;
  deviationFromReference: number;
  trend: StatisticalTrend;
  comparisonStatement: string;
}

/**
 * 5. Guidance
 */
export interface ReportGuidance {
  focusNext: string;
  actionableCues: string[];
  correctiveDrill: {
    id: string;
    title: string;
    targetArea: string;
  } | null;
}

/**
 * 6. Safety
 */
export interface ReportSafety {
  safetyLevel: RehabilitationSafetyState;
  isSafe: boolean;
  flaggedHazards: string[];
  safetyEvents: SafetyAuditEvent[];
  statusMessage: string;
}

/**
 * 7. Escalation
 */
export interface ReportEscalation {
  recommended: boolean;
  urgency: 'NONE' | 'ROUTINE' | 'PROMPT';
  reason: string | null;
  prompt: string;
}

/**
 * Complete Structured Session Report Data (Canonical Source of Truth).
 */
export interface StructuredSessionReportData {
  sessionId: string;
  dateStr: string;
  timeStr: string;
  timestamp: number;

  sessionSummary: ReportSessionSummary;
  movementQuality: ReportMovementQuality;
  compensationAnalysis: ReportCompensationAnalysis;
  progress: ReportProgress;
  guidance: ReportGuidance;
  safety: ReportSafety;
  escalation: ReportEscalation;
}

/**
 * Numerical Discrepancy Record from Verifier.
 */
export interface NumericalDiscrepancy {
  metric: string;
  expected: number;
  found: number | string;
  context: string;
}

/**
 * Automated Telemetry Verification Output.
 */
export interface ReportVerificationResult {
  isValid: boolean;
  discrepanciesCount: number;
  discrepancies: NumericalDiscrepancy[];
  extractedNumbers: number[];
  allowedNumbers: number[];
  verificationStatement: string;
}

/**
 * Intelligent Report Generation Output.
 */
export interface IntelligentReportResult {
  structuredData: StructuredSessionReportData;
  narrativeSummary: string;
  verification: ReportVerificationResult;
  source: 'OLLAMA_GROUNDED' | 'DETERMINISTIC_GROUNDED';
  generatedAt: number;
}
