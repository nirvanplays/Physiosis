/**
 * SessionTypes.ts
 * Type definitions for the live patient exercise session engine,
 * repetition records, persistent PhysiosisSession records, and analytics.
 */

import type { SafetyAuditEvent } from '../safety/SafetyTypes';

export type RepStatusLabel = 'Limited' | 'Improving' | 'Near target' | 'Target reached';
export type ImprovementStatus = 'IMPROVING' | 'MAINTAINING' | 'DECLINING' | 'FIRST_REP';
export type SessionLifecycleState = 'IDLE' | 'READY' | 'ACTIVE' | 'PAUSED' | 'ENDING' | 'COMPLETED';

/** Complete analysis record for a single valid completed repetition. */
export interface RepResult {
  repNumber: number;
  /** Peak movement angle/metric achieved during the repetition (degrees). */
  peakAngle: number;
  /** Prescribed target angle (degrees, e.g. 165°). */
  targetAngle: number;
  /** Range of motion completion percentage [0, 100]. */
  romPercentage: number;
  /** Remaining deviation from target in degrees (targetAngle - peakAngle). */
  deviation: number;
  /** Normalized movement quality estimate [0, 100]. */
  qualityScore: number;
  /** True when peakAngle < 0.85 * targetAngle (below 140° for 165° target). */
  limitationDetected: boolean;
  /** Prototype movement-quality severity index [0, 100]. Not a medical score. */
  severity: number;
  /** Human-readable progress tag. */
  statusLabel: RepStatusLabel;
  /** Delta in peak ROM vs immediately preceding completed repetition (e.g. +16°, -15°, 0°). */
  improvementFromPrevious: number | null;
  /** Percentage improvement vs immediately preceding completed repetition. */
  improvementPercentage: number | null;
  /** Categorized improvement status. */
  improvementStatus: ImprovementStatus;
  /** Non-clinical coaching feedback for this repetition. */
  coachingMessage?: string;
  /** Timestamp when the repetition cycle finished (ms). */
  timestampMs: number;
  /** Timestamp when the repetition started moving up from rest (ms). */
  startTimestamp?: number;
  /** Timestamp when the repetition reached peak elevation (ms). */
  peakTimestamp?: number;
  /** Timestamp when the repetition returned to start position (ms). */
  endTimestamp?: number;
  /** Duration of the repetition cycle in milliseconds. */
  durationMs?: number;
  /** Postural integrity score [0–100] during this repetition. */
  posturalScore?: number;
  /** Names of any abnormal postures/compensations detected during this repetition. */
  detectedCompensations?: string[];
}

export interface RecordedLimitation {
  limitationId: string;
  observedValue: number;
  targetValue: number;
  suggestionId: string;
}

export type SessionEndReason = 'manual' | 'automatic';

/** Complete persistent rehabilitation exercise session. */
export interface PhysiosisSession {
  id: string;
  startedAt: number;
  endedAt: number;
  durationSeconds: number;
  exercise: string;
  exerciseId?: string;
  laterality?: 'left' | 'right' | 'bilateral';
  side?: 'left' | 'right' | 'bilateral';
  patientId?: string;
  endedReason?: SessionEndReason;

  totalReps: number;

  bestROM: number;
  averageROM: number;

  bestScore: number;
  averageScore: number;

  limitationsDetected: number;
  limitations?: RecordedLimitation[];

  averageDeviation: number;
  averageSeverity: number;

  firstRepROM: number | null;
  lastRepROM: number | null;
  firstRepPeak?: number | null;
  lastRepPeak?: number | null;
  improvementDegrees: number | null;
  netROMChange?: number | null;
  averageRepImprovement?: number | null;

  movementProgress?: number | null;
  trend?: string | null;
  isUnsaved?: boolean;

  /** Average kinetic chain postural score [0–100%] across all session reps. */
  averagePosturalScore?: number | null;
  /** Total count of repetitions exhibiting compensatory abnormal postures. */
  compensationsCount?: number;
  /** Summary of distinct abnormal posture types detected during session. */
  detectedCompensationsSummary?: string[];

  /** Preserved safety events from real-time RehabilitationSafetyEngine (Patch 6). */
  safetyAuditEvents?: SafetyAuditEvent[];
  /** Clinical safety notice or escalation advisory if safety alerts occurred. */
  safetyNotice?: string;

  reps: RepResult[];
}

export type PhysiosisSessionReport = PhysiosisSession;

/** Aggregate session-level health & movement telemetry. */
export interface LiveSessionMetrics {
  completedReps: number;
  /** Highest ROM reached in any repetition so far (degrees). */
  bestROM: number;
  /** Average peak ROM across all completed repetitions (degrees). */
  averageROM: number;
  /** Average prototype movement quality across all completed reps [0, 100]. */
  averageQuality: number;
  /** Total count of repetitions where a limitation was detected. */
  limitationsCount: number;
  /** Severity index of the latest repetition or overall session [0, 100]. */
  currentSeverity: number;
  /** Peak ROM achieved in the first completed repetition. */
  firstRepPeak: number | null;
  /** Peak ROM achieved in the latest completed repetition. */
  lastRepPeak: number | null;
  /** Net improvement in peak ROM from first rep to latest rep (+XX°), or 0. */
  improvementFromFirstRep: number;
  /** Net change across session (lastRepPeak - firstRepPeak). */
  netROMChange: number | null;
  /** Average improvement delta across consecutive repetitions. */
  averageRepImprovement: number | null;
  /** Elapsed active session duration in milliseconds. */
  elapsedMs: number;
  /** Remaining session countdown in seconds (e.g. 180 -> 0). */
  timeRemainingSeconds: number;
  /** Advisory trend message (e.g. "Range improving across repetitions"). */
  trendFeedback: string | null;
}

/** Live mutable session state snapshot published to React at ~4Hz. */
export interface LiveSessionState {
  isActive: boolean;
  sessionState: SessionLifecycleState;
  startTimeMs: number | null;
  currentRepNumber: number;
  repHistory: RepResult[];
  latestRep: RepResult | null;
  metrics: LiveSessionMetrics;
  /** Latest detected limitation peak angle for personalized correction morphing. */
  lastLimitationPeakAngle: number | null;
}

/** Initial empty session metrics. */
export const INITIAL_LIVE_SESSION_METRICS: LiveSessionMetrics = {
  completedReps: 0,
  bestROM: 0,
  averageROM: 0,
  averageQuality: 0,
  limitationsCount: 0,
  currentSeverity: 0,
  firstRepPeak: null,
  lastRepPeak: null,
  improvementFromFirstRep: 0,
  netROMChange: null,
  averageRepImprovement: null,
  elapsedMs: 0,
  timeRemainingSeconds: 180,
  trendFeedback: null,
};

/** Initial empty session state. */
export const INITIAL_LIVE_SESSION_STATE: LiveSessionState = {
  isActive: false,
  sessionState: 'IDLE',
  startTimeMs: null,
  currentRepNumber: 0,
  repHistory: [],
  latestRep: null,
  metrics: INITIAL_LIVE_SESSION_METRICS,
  lastLimitationPeakAngle: null,
};
