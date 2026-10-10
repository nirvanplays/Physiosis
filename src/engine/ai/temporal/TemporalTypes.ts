/**
 * TemporalTypes.ts
 * Type definitions and contracts for Temporal Movement Intelligence (AI CORE PATCH 2).
 *
 * Defines temporal kinematic frame structures, sliding window configuration,
 * neural model interfaces (TCN, LSTM, Transformer), and prediction outputs.
 */

import type { MovementState } from '../../biomechanics/biomechanicsTypes';
import type { Landmark } from '../../../types/pose';

export type TemporalModelArchitecture = 'TCN' | 'LSTM' | 'TRANSFORMER';

export type TemporalExercisePhase = 'ASCENT' | 'PEAK' | 'DESCENT' | 'REST' | 'HOLD';

export type TemporalRepPhase =
  | 'EARLY_CONCENTRIC'
  | 'LATE_CONCENTRIC'
  | 'INFLECTION'
  | 'ECCENTRIC'
  | 'RESET';

export type TemporalCompensationPattern =
  | 'TRUNK_LEAN'
  | 'SHOULDER_HIKE'
  | 'KNEE_VALGUS'
  | 'PELVIC_TILT'
  | 'FORWARD_HEAD'
  | 'NONE';

/**
 * Single temporal frame kinematic snapshot extracted from normalized landmarks.
 */
export interface TemporalFrameSample {
  /** Timestamp of the frame in milliseconds */
  timestamp: number;

  /** Primary and auxiliary joint angles in degrees */
  jointAngles: {
    primaryAngle: number;
    elbowAngle?: number;
    trunkAngle?: number;
    hipAngle?: number;
    kneeAngle?: number;
  };

  /** First derivative: Angular velocity in degrees per second (°/s) */
  angularVelocity: number;

  /** Second derivative: Angular acceleration in degrees per second squared (°/s²) */
  angularAcceleration: number;

  /** Range of motion completion percentage (0 - 100) */
  romPercentage: number;

  /** Bilateral kinetic chain symmetry index (0.0 = completely asymmetric, 1.0 = perfectly symmetric) */
  symmetry: number;

  /** Postural compensation telemetry */
  trunkCompensation: {
    trunkLateralLeanAngle: number;
    shoulderHikeAngle: number;
    detected: boolean;
    compensationType: TemporalCompensationPattern;
    severityScore: number; // 0.0 - 1.0
  };

  /** Landmark visibility / tracking confidence (0.0 - 1.0) */
  confidence: number;

  /** Biomechanical movement state classification from rule-based engine */
  movementPhase: MovementState;

  /** Raw normalized landmarks for tensor sequence projections */
  landmarks?: Landmark[] | null;
}

/**
 * Configuration parameters for the sliding temporal window.
 */
export interface TemporalWindowConfig {
  /** Window duration in seconds (2.0 - 5.0 seconds). Default: 3.0s */
  windowDurationSec: number;

  /** Hop/stride interval between inference updates in milliseconds (e.g. 250ms = 75-90% overlap) */
  hopIntervalMs: number;

  /** Target resampled sequence length for tensor inputs (default: 64 time steps) */
  resampleTimeSteps: number;

  /** Minimum samples required before window is marked valid for inference */
  minSamplesRequired: number;
}

/**
 * Structured prediction output returned by the temporal intelligence model.
 */
export interface TemporalPredictionOutput {
  /** Predicted exercise movement phase */
  phase: TemporalExercisePhase;

  /** Probability distribution across all potential exercise phases */
  phaseProbabilities: Record<TemporalExercisePhase, number>;

  /** Overall movement quality probability score (0.0 - 1.0) */
  quality: number;

  /** Predicted dominant compensation pattern */
  compensation: TemporalCompensationPattern;

  /** Probability distribution across compensation patterns */
  compensationProbabilities: Record<TemporalCompensationPattern, number>;

  /** Granular repetition phase classification */
  repPhase: TemporalRepPhase;

  /** Biomechanical kinetic stability score (0.0 - 1.0) */
  stability: number;

  /** Model prediction confidence (0.0 - 1.0) */
  confidence: number;

  /** Neural architecture evaluated */
  architectureUsed: TemporalModelArchitecture;

  /** Inference timestamp (ms) */
  timestamp: number;

  /** Inference compute latency in milliseconds */
  latencyMs: number;
}

/**
 * Common interface for Temporal Movement Models (TCN, LSTM, Transformer).
 */
export interface ITemporalMovementModel {
  readonly name: string;
  readonly architecture: TemporalModelArchitecture;
  readonly inputDimensions: { timeSteps: number; featureCount: number };

  /**
   * Evaluates a temporal sequence of frame samples and asynchronously outputs movement intelligence.
   * Inference is non-blocking to prevent UI/tracking lag.
   */
  predictAsync(
    windowSamples: TemporalFrameSample[],
    targetTimeSteps?: number
  ): Promise<TemporalPredictionOutput>;

  /** Resets internal recurrent states or rolling memory */
  reset(): void;
}
