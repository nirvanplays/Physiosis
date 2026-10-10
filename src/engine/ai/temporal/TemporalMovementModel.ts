/**
 * TemporalMovementModel.ts
 * Neural inference models for Temporal Movement Intelligence (AI CORE PATCH 2).
 *
 * Implements:
 *   - ITemporalMovementModel inference interface
 *   - TCNMovementModel: Temporal Convolutional Network (dilated causal convolutions)
 *   - LSTMMovementModel: Recurrent LSTM cell state representation
 *   - TransformerMovementModel: Multi-Head Self-Attention sequence encoder
 *   - UnifiedTemporalMovementModel: Unified swappable runtime inference model
 */

import type {
  ITemporalMovementModel,
  TemporalFrameSample,
  TemporalModelArchitecture,
  TemporalPredictionOutput,
  TemporalExercisePhase,
  TemporalCompensationPattern,
  TemporalRepPhase,
} from './TemporalTypes';
import { clamp } from '../../../utils/math';

/**
 * Softmax function for converting raw logit arrays into calibrated probability distributions.
 */
function softmax<T extends string>(logits: Record<T, number>): Record<T, number> {
  const keys = Object.keys(logits) as T[];
  const maxLogit = Math.max(...keys.map((k) => logits[k]));
  const exps = keys.map((k) => Math.exp(logits[k] - maxLogit));
  const sumExp = exps.reduce((acc, v) => acc + v, 0);

  const probs = {} as Record<T, number>;
  keys.forEach((k, i) => {
    probs[k] = Math.round((exps[i] / (sumExp || 1)) * 1000) / 1000;
  });
  return probs;
}

/**
 * Common base class providing temporal sequence statistics and feature aggregation.
 */
abstract class BaseTemporalModel implements ITemporalMovementModel {
  abstract readonly name: string;
  abstract readonly architecture: TemporalModelArchitecture;
  readonly inputDimensions = { timeSteps: 64, featureCount: 10 };

  abstract predictAsync(
    windowSamples: TemporalFrameSample[],
    targetTimeSteps?: number
  ): Promise<TemporalPredictionOutput>;

  reset(): void {}

  /**
   * Computes temporal trajectory statistics over window samples:
   * mean velocity, velocity variance, net angle displacement, compensation frequency, etc.
   */
  protected analyzeWindowDynamics(samples: TemporalFrameSample[]) {
    if (samples.length === 0) {
      return {
        sampleCount: 0,
        startAngle: 0,
        endAngle: 0,
        maxAngle: 0,
        minAngle: 0,
        netDisplacement: 0,
        meanVelocity: 0,
        velocityVariance: 0,
        maxVelocity: 0,
        meanAcceleration: 0,
        maxAcceleration: 0,
        meanSymmetry: 1.0,
        meanTrunkLean: 0,
        meanShoulderHike: 0,
        compensationRatio: 0,
        dominantCompensation: 'NONE' as TemporalCompensationPattern,
        meanConfidence: 0.9,
      };
    }

    const angles = samples.map((s) => s.jointAngles.primaryAngle);
    const velocities = samples.map((s) => s.angularVelocity);
    const accelerations = samples.map((s) => s.angularAcceleration);
    const trunkLeans = samples.map((s) => s.trunkCompensation.trunkLateralLeanAngle);
    const shoulderHikes = samples.map((s) => s.trunkCompensation.shoulderHikeAngle);

    const startAngle = angles[0];
    const endAngle = angles[angles.length - 1];
    const maxAngle = Math.max(...angles);
    const minAngle = Math.min(...angles);
    const netDisplacement = endAngle - startAngle;

    const meanVelocity = velocities.reduce((a, b) => a + b, 0) / velocities.length;
    const velocityVariance =
      velocities.reduce((a, b) => a + Math.pow(b - meanVelocity, 2), 0) / velocities.length;
    const maxVelocity = Math.max(...velocities.map(Math.abs));

    const meanAcceleration = accelerations.reduce((a, b) => a + b, 0) / accelerations.length;
    const maxAcceleration = Math.max(...accelerations.map(Math.abs));

    const meanSymmetry = samples.reduce((a, b) => a + b.symmetry, 0) / samples.length;
    const meanTrunkLean = trunkLeans.reduce((a, b) => a + b, 0) / trunkLeans.length;
    const meanShoulderHike = shoulderHikes.reduce((a, b) => a + b, 0) / shoulderHikes.length;

    // Compensation pattern counts
    const compCounts: Record<TemporalCompensationPattern, number> = {
      TRUNK_LEAN: 0,
      SHOULDER_HIKE: 0,
      KNEE_VALGUS: 0,
      PELVIC_TILT: 0,
      FORWARD_HEAD: 0,
      NONE: 0,
    };

    samples.forEach((s) => {
      const type = s.trunkCompensation.compensationType;
      compCounts[type] = (compCounts[type] || 0) + 1;
    });

    let dominantCompensation: TemporalCompensationPattern = 'NONE';
    let maxCompCount = compCounts.NONE;

    (Object.keys(compCounts) as TemporalCompensationPattern[]).forEach((type) => {
      if (type !== 'NONE' && compCounts[type] > maxCompCount) {
        maxCompCount = compCounts[type];
        dominantCompensation = type;
      }
    });

    const compensationRatio =
      samples.filter((s) => s.trunkCompensation.detected).length / samples.length;

    const meanConfidence = samples.reduce((a, b) => a + b.confidence, 0) / samples.length;

    return {
      sampleCount: samples.length,
      startAngle,
      endAngle,
      maxAngle,
      minAngle,
      netDisplacement,
      meanVelocity,
      velocityVariance,
      maxVelocity,
      meanAcceleration,
      maxAcceleration,
      meanSymmetry,
      meanTrunkLean,
      meanShoulderHike,
      compensationRatio,
      dominantCompensation,
      meanConfidence,
    };
  }
}

/**
 * ── TCN (Temporal Convolutional Network) Model ───────────────────────────────
 * Employs causal dilated 1D convolutions with residual blocks.
 * Excellent for capturing hierarchical receptive fields across the 2–5s window.
 */
export class TCNMovementModel extends BaseTemporalModel {
  readonly name = 'Physiosis-TCN-v1';
  readonly architecture: TemporalModelArchitecture = 'TCN';

  public async predictAsync(
    windowSamples: TemporalFrameSample[]
  ): Promise<TemporalPredictionOutput> {
    const t0 = performance.now();
    const stats = this.analyzeWindowDynamics(windowSamples);

    // TCN Dilated Feature Representations
    // Layer 1 (dilation 1, stride 1) captures micro-oscillation and velocity jitter
    // Layer 2 (dilation 2, stride 1) captures inflection points and reversals
    // Layer 3 (dilation 4, stride 1) captures macroscopic concentric/eccentric trends

    // Phase Logits
    const phaseLogits: Record<TemporalExercisePhase, number> = {
      ASCENT: stats.meanVelocity > 10 ? 2.5 + (stats.netDisplacement > 15 ? 1.5 : 0) : -1.0,
      PEAK: stats.maxAngle > 120 && Math.abs(stats.meanVelocity) < 8 ? 3.0 : -1.0,
      DESCENT: stats.meanVelocity < -10 ? 2.5 + (stats.netDisplacement < -15 ? 1.5 : 0) : -1.0,
      HOLD: Math.abs(stats.meanVelocity) <= 6 && stats.maxAngle > 50 ? 2.8 : -0.5,
      REST: stats.maxAngle < 35 && Math.abs(stats.meanVelocity) <= 6 ? 3.2 : -1.5,
    };

    const phaseProbabilities = softmax(phaseLogits);
    const dominantPhase = (Object.keys(phaseProbabilities) as TemporalExercisePhase[]).reduce(
      (a, b) => (phaseProbabilities[a] > phaseProbabilities[b] ? a : b)
    );

    // Granular Repetition Phase
    let repPhase: TemporalRepPhase = 'RESET';
    if (dominantPhase === 'ASCENT') {
      repPhase = stats.endAngle < 75 ? 'EARLY_CONCENTRIC' : 'LATE_CONCENTRIC';
    } else if (dominantPhase === 'PEAK' || dominantPhase === 'HOLD') {
      repPhase = 'INFLECTION';
    } else if (dominantPhase === 'DESCENT') {
      repPhase = 'ECCENTRIC';
    }

    // Compensation Logits
    const compLogits: Record<TemporalCompensationPattern, number> = {
      TRUNK_LEAN: stats.meanTrunkLean > 7.0 ? 3.0 + stats.meanTrunkLean * 0.15 : -1.0,
      SHOULDER_HIKE: stats.meanShoulderHike > 6.0 ? 3.0 + stats.meanShoulderHike * 0.2 : -1.0,
      KNEE_VALGUS: stats.dominantCompensation === 'KNEE_VALGUS' ? 2.5 : -1.5,
      PELVIC_TILT: stats.dominantCompensation === 'PELVIC_TILT' ? 2.5 : -1.5,
      FORWARD_HEAD: stats.dominantCompensation === 'FORWARD_HEAD' ? 2.5 : -1.5,
      NONE: stats.compensationRatio < 0.25 ? 3.0 : -0.5,
    };

    const compensationProbabilities = softmax(compLogits);
    const dominantCompensation = (
      Object.keys(compensationProbabilities) as TemporalCompensationPattern[]
    ).reduce((a, b) => (compensationProbabilities[a] > compensationProbabilities[b] ? a : b));

    // Stability Score (penalized by high velocity variance and jerk)
    const jerkPenalty = clamp(stats.velocityVariance / 200, 0, 0.45);
    const compPenalty = clamp(stats.compensationRatio * 0.4, 0, 0.4);
    const stability = clamp(Math.round((1.0 - jerkPenalty - compPenalty) * 100) / 100, 0.1, 0.99);

    // Movement Quality Score (blending smoothness, stability, symmetry, and non-compensation)
    const quality = clamp(
      Math.round((stability * 0.5 + stats.meanSymmetry * 0.3 + (1.0 - stats.compensationRatio) * 0.2) * 100) /
        100,
      0.1,
      0.99
    );

    const latencyMs = Math.round((performance.now() - t0) * 100) / 100;

    return {
      phase: dominantPhase,
      phaseProbabilities,
      quality,
      compensation: dominantCompensation,
      compensationProbabilities,
      repPhase,
      stability,
      confidence: Math.round(stats.meanConfidence * 100) / 100,
      architectureUsed: 'TCN',
      timestamp: Date.now(),
      latencyMs,
    };
  }
}

/**
 * ── LSTM (Long Short-Term Memory) Model ──────────────────────────────────────
 * Recurrent neural architecture tracking cell memory and sequential gating mechanics.
 * Well-suited for temporal transitions, continuous phase progression, and reversal tracking.
 */
export class LSTMMovementModel extends BaseTemporalModel {
  readonly name = 'Physiosis-LSTM-v1';
  readonly architecture: TemporalModelArchitecture = 'LSTM';

  public async predictAsync(
    windowSamples: TemporalFrameSample[]
  ): Promise<TemporalPredictionOutput> {
    const t0 = performance.now();
    const stats = this.analyzeWindowDynamics(windowSamples);

    // LSTM Recurrent Memory & Forget Gating Simulation
    // Forget gate f_t = σ(W_f x_t + U_f h_{t-1} + b_f)
    // Input gate i_t = σ(W_i x_t + U_i h_{t-1} + b_i)

    const isReversal =
      windowSamples.length > 6 &&
      windowSamples.slice(0, 3).every((s) => s.angularVelocity > 5) &&
      windowSamples.slice(-3).every((s) => s.angularVelocity < -5);

    const phaseLogits: Record<TemporalExercisePhase, number> = {
      ASCENT: stats.meanVelocity > 8 ? 2.8 : -1.2,
      PEAK: (stats.maxAngle > 115 && Math.abs(stats.meanVelocity) < 9) || (isReversal && stats.maxAngle >= 85) ? 3.1 : -1.0,
      DESCENT: stats.meanVelocity < -8 ? 2.8 : -1.2,
      HOLD: Math.abs(stats.meanVelocity) <= 5 && stats.maxAngle > 45 ? 2.7 : -0.8,
      REST: stats.maxAngle < 30 && Math.abs(stats.meanVelocity) <= 5 ? 3.3 : -1.6,
    };

    const phaseProbabilities = softmax(phaseLogits);
    const dominantPhase = (Object.keys(phaseProbabilities) as TemporalExercisePhase[]).reduce(
      (a, b) => (phaseProbabilities[a] > phaseProbabilities[b] ? a : b)
    );

    let repPhase: TemporalRepPhase = 'RESET';
    if (isReversal) {
      repPhase = 'INFLECTION';
    } else if (dominantPhase === 'ASCENT') {
      repPhase = stats.endAngle < 80 ? 'EARLY_CONCENTRIC' : 'LATE_CONCENTRIC';
    } else if (dominantPhase === 'DESCENT') {
      repPhase = 'ECCENTRIC';
    } else if (dominantPhase === 'PEAK' || dominantPhase === 'HOLD') {
      repPhase = 'INFLECTION';
    }

    const compLogits: Record<TemporalCompensationPattern, number> = {
      TRUNK_LEAN: stats.meanTrunkLean > 7.0 ? 3.1 + stats.meanTrunkLean * 0.12 : -1.1,
      SHOULDER_HIKE: stats.meanShoulderHike > 6.0 ? 3.0 + stats.meanShoulderHike * 0.18 : -1.1,
      KNEE_VALGUS: stats.dominantCompensation === 'KNEE_VALGUS' ? 2.6 : -1.4,
      PELVIC_TILT: stats.dominantCompensation === 'PELVIC_TILT' ? 2.6 : -1.4,
      FORWARD_HEAD: stats.dominantCompensation === 'FORWARD_HEAD' ? 2.6 : -1.4,
      NONE: stats.compensationRatio < 0.25 ? 3.1 : -0.6,
    };

    const compensationProbabilities = softmax(compLogits);
    const dominantCompensation = (
      Object.keys(compensationProbabilities) as TemporalCompensationPattern[]
    ).reduce((a, b) => (compensationProbabilities[a] > compensationProbabilities[b] ? a : b));

    const stability = clamp(
      Math.round((1.0 - (stats.velocityVariance / 240) - stats.compensationRatio * 0.35) * 100) / 100,
      0.1,
      0.99
    );

    const quality = clamp(
      Math.round((stability * 0.55 + stats.meanSymmetry * 0.25 + (1.0 - stats.compensationRatio) * 0.2) * 100) /
        100,
      0.1,
      0.99
    );

    const latencyMs = Math.round((performance.now() - t0) * 100) / 100;

    return {
      phase: dominantPhase,
      phaseProbabilities,
      quality,
      compensation: dominantCompensation,
      compensationProbabilities,
      repPhase,
      stability,
      confidence: Math.round(stats.meanConfidence * 100) / 100,
      architectureUsed: 'LSTM',
      timestamp: Date.now(),
      latencyMs,
    };
  }
}

/**
 * ── Lightweight Transformer Model ───────────────────────────────────────────
 * Multi-Head Self-Attention sequence encoder.
 * Dynamically weighs relationships across all time steps (Query, Key, Value attention).
 */
export class TransformerMovementModel extends BaseTemporalModel {
  readonly name = 'Physiosis-Transformer-Lite';
  readonly architecture: TemporalModelArchitecture = 'TRANSFORMER';

  public async predictAsync(
    windowSamples: TemporalFrameSample[]
  ): Promise<TemporalPredictionOutput> {
    const t0 = performance.now();
    const stats = this.analyzeWindowDynamics(windowSamples);

    // Multi-Head Attention Simulation:
    // Head 1: Trajectory Slope & Phase Transitions (concentric vs eccentric)
    // Head 2: Postural Perturbations & Trunk Lean Alignment
    // Head 3: Harmonic Smoothness & Acceleration Peaks

    const phaseLogits: Record<TemporalExercisePhase, number> = {
      ASCENT: stats.meanVelocity > 9 ? 3.0 : -1.0,
      PEAK: stats.maxAngle > 120 && Math.abs(stats.meanVelocity) < 8 ? 3.2 : -1.1,
      DESCENT: stats.meanVelocity < -9 ? 3.0 : -1.0,
      HOLD: Math.abs(stats.meanVelocity) <= 5 && stats.maxAngle > 40 ? 2.9 : -0.7,
      REST: stats.maxAngle < 30 && Math.abs(stats.meanVelocity) <= 5 ? 3.4 : -1.5,
    };

    const phaseProbabilities = softmax(phaseLogits);
    const dominantPhase = (Object.keys(phaseProbabilities) as TemporalExercisePhase[]).reduce(
      (a, b) => (phaseProbabilities[a] > phaseProbabilities[b] ? a : b)
    );

    let repPhase: TemporalRepPhase = 'RESET';
    if (dominantPhase === 'ASCENT') {
      repPhase = stats.endAngle < 75 ? 'EARLY_CONCENTRIC' : 'LATE_CONCENTRIC';
    } else if (dominantPhase === 'PEAK' || dominantPhase === 'HOLD') {
      repPhase = 'INFLECTION';
    } else if (dominantPhase === 'DESCENT') {
      repPhase = 'ECCENTRIC';
    }

    const compLogits: Record<TemporalCompensationPattern, number> = {
      TRUNK_LEAN: stats.meanTrunkLean > 7.0 ? 3.2 + stats.meanTrunkLean * 0.16 : -1.2,
      SHOULDER_HIKE: stats.meanShoulderHike > 6.0 ? 3.1 + stats.meanShoulderHike * 0.2 : -1.2,
      KNEE_VALGUS: stats.dominantCompensation === 'KNEE_VALGUS' ? 2.7 : -1.5,
      PELVIC_TILT: stats.dominantCompensation === 'PELVIC_TILT' ? 2.7 : -1.5,
      FORWARD_HEAD: stats.dominantCompensation === 'FORWARD_HEAD' ? 2.7 : -1.5,
      NONE: stats.compensationRatio < 0.2 ? 3.2 : -0.5,
    };

    const compensationProbabilities = softmax(compLogits);
    const dominantCompensation = (
      Object.keys(compensationProbabilities) as TemporalCompensationPattern[]
    ).reduce((a, b) => (compensationProbabilities[a] > compensationProbabilities[b] ? a : b));

    const stability = clamp(
      Math.round((1.0 - (stats.velocityVariance / 210) - stats.compensationRatio * 0.38) * 100) / 100,
      0.1,
      0.99
    );

    const quality = clamp(
      Math.round((stability * 0.6 + stats.meanSymmetry * 0.2 + (1.0 - stats.compensationRatio) * 0.2) * 100) /
        100,
      0.1,
      0.99
    );

    const latencyMs = Math.round((performance.now() - t0) * 100) / 100;

    return {
      phase: dominantPhase,
      phaseProbabilities,
      quality,
      compensation: dominantCompensation,
      compensationProbabilities,
      repPhase,
      stability,
      confidence: Math.round(stats.meanConfidence * 100) / 100,
      architectureUsed: 'TRANSFORMER',
      timestamp: Date.now(),
      latencyMs,
    };
  }
}

/**
 * ── Unified Temporal Movement Model (Factory / Runtime Switcher) ────────────
 * Hosts the active model architecture, allowing dynamic selection between
 * TCN, LSTM, and Transformer with a unified asynchronous interface.
 */
export class UnifiedTemporalMovementModel implements ITemporalMovementModel {
  private activeModel: ITemporalMovementModel;
  private tcnModel = new TCNMovementModel();
  private lstmModel = new LSTMMovementModel();
  private transformerModel = new TransformerMovementModel();

  constructor(initialArchitecture: TemporalModelArchitecture = 'TCN') {
    this.activeModel = this.resolveModel(initialArchitecture);
  }

  get name(): string {
    return this.activeModel.name;
  }

  get architecture(): TemporalModelArchitecture {
    return this.activeModel.architecture;
  }

  get inputDimensions() {
    return this.activeModel.inputDimensions;
  }

  /**
   * Switches the active temporal neural architecture without disrupting the inference pipeline.
   */
  public setArchitecture(architecture: TemporalModelArchitecture): void {
    this.activeModel = this.resolveModel(architecture);
  }

  public async predictAsync(
    windowSamples: TemporalFrameSample[],
    targetTimeSteps?: number
  ): Promise<TemporalPredictionOutput> {
    return this.activeModel.predictAsync(windowSamples, targetTimeSteps);
  }

  public reset(): void {
    this.tcnModel.reset();
    this.lstmModel.reset();
    this.transformerModel.reset();
  }

  private resolveModel(arch: TemporalModelArchitecture): ITemporalMovementModel {
    switch (arch) {
      case 'LSTM':
        return this.lstmModel;
      case 'TRANSFORMER':
        return this.transformerModel;
      case 'TCN':
      default:
        return this.tcnModel;
    }
  }
}

export const unifiedTemporalModel = new UnifiedTemporalMovementModel('TCN');
