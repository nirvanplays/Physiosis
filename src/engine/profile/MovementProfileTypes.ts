/**
 * MovementProfileTypes.ts
 * PHYSIOSIS — PERSONAL MOVEMENT PROFILE PATCH 11
 *
 * Authoritative contracts for the longitudinal patient movement profile.
 * Tracks multi-session movement characteristics per exercise:
 *   - ROM
 *   - Movement Quality
 *   - Bilateral Symmetry
 *   - Movement Speed
 *   - Rep Consistency
 *   - Compensation Frequency
 *   - Camera & Biomechanical Confidence
 *   - Session Duration
 *   - Protocol Adherence
 *
 * STRICT MEDICAL & CLINICAL GUARDRAILS:
 *   - NEVER call this:
 *       - diagnosis
 *       - medical prognosis
 *       - recovery certainty
 *       - recovery percentage
 *       - cured
 *   - ALWAYS use:
 *       - movement profile
 *       - performance trend
 *       - observed progress
 *       - baseline comparison
 */

/** Selectable trend metric views for patient and clinician visualization */
export type MovementMetricType =
  | 'ROM'
  | 'QUALITY'
  | 'COMPENSATION'
  | 'CONSISTENCY'
  | 'SYMMETRY';

/** Statistical direction of a specific kinematic metric across sessions */
export type TrendDirection =
  | 'improving'
  | 'stable'
  | 'declining'
  | 'insufficient data';

/**
 * Metric-specific regression and progress trend structure.
 */
export interface MetricTrend {
  metric: MovementMetricType;
  direction: TrendDirection;
  /** Rate of change per session (e.g. +2.4°/session or -1.5% compensation/session) */
  slopePerSession: number;
  /** Statistical fit strength R² [0–1] */
  rSquared: number;
  /** Most recent recorded value */
  currentValue: number;
  /** Historical baseline typical value */
  baselineValue: number | null;
  /** All-time best value achieved */
  bestValue: number | null;
  /** Objective, non-diagnostic interpretation */
  interpretation: string;
}

/**
 * Historical time-series data point for a single completed session.
 */
export interface SessionDataPoint {
  sessionId: string;
  timestamp: number;
  dateLabel: string;
  rom: number;                 // Peak ROM (degrees)
  quality: number;             // Quality score (0 - 100)
  compensation: number;         // Compensation rate (0 - 100%)
  consistency: number;          // Rep consistency (0 - 100)
  symmetry: number;             // Bilateral symmetry (0 - 100)
  movementSpeed: number;        // Average angular velocity (°/s)
  durationSeconds: number;      // Active duration (s)
  completedReps: number;        // Completed repetition count
  targetAngle: number;          // Prescribed target angle (degrees)
}

/**
 * Longitudinal protocol adherence metrics.
 */
export interface AdherenceMetrics {
  totalCompletedSessions: number;
  totalCompletedReps: number;
  averageSessionDurationSeconds: number;
  completionRate: number;       // Ratio of target reps achieved [0–100%]
  sessionsLast7Days: number;
  sessionsLast30Days: number;
  adherenceScore: number;       // Normalized adherence composite [0–100]
  adherenceLevel: 'OPTIMAL' | 'CONSISTENT' | 'INTERMITTENT' | 'INITIAL';
  interpretation: string;
}

/**
 * Authoritative Longitudinal Movement Profile for a specific exercise.
 * Exactly adheres to Patch 11 specification:
 * {
 *   exercise,
 *   baselineROM,
 *   recentROM,
 *   bestROM,
 *   qualityTrend,
 *   symmetryTrend,
 *   compensationTrend,
 *   consistency,
 *   confidence
 * }
 */
export interface MovementProfile {
  /** Exercise identifier / human-readable name */
  exercise: string;
  exerciseId: string;

  /** Historical baseline typical ROM (degrees) */
  baselineROM: number | null;

  /** Most recent session peak ROM (degrees) */
  recentROM: number | null;

  /** All-time highest valid ROM recorded (degrees) */
  bestROM: number | null;

  /** Longitudinal range of motion trend */
  romTrend: MetricTrend;

  /** Longitudinal movement quality trend */
  qualityTrend: MetricTrend;

  /** Longitudinal bilateral symmetry trend */
  symmetryTrend: MetricTrend;

  /** Longitudinal compensation frequency trend (declining = improving) */
  compensationTrend: MetricTrend;

  /** Longitudinal repetition consistency trend */
  consistencyTrend: MetricTrend;

  /** Normalized repetition consistency score [0–100] */
  consistency: number;

  /** Tracking & biomechanical confidence [0–100] */
  confidence: number;

  /** Average movement speed in degrees per second */
  movementSpeed: number;

  /** Active session duration metrics */
  sessionDuration: {
    averageSeconds: number;
    totalSeconds: number;
  };

  /** Protocol adherence metrics */
  adherence: AdherenceMetrics;

  /** Chronological session series for charting */
  chronologicalSessions: SessionDataPoint[];

  /** Non-diagnostic observed progress statement */
  observedProgressStatement: string;

  /** Profile generation timestamp (epoch ms) */
  timestamp: number;
}
