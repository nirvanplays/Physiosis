/**
 * TemporalInferenceEngine.ts
 * Real-Time Asynchronous Temporal Movement Intelligence Pipeline (AI CORE PATCH 2).
 *
 * Coordinates:
 *   1. Per-frame kinematic feature extraction (TemporalFeatureExtractor)
 *   2. Overlapping 2–5s sliding window management (TemporalWindowBuffer)
 *   3. Non-blocking asynchronous neural inference (UnifiedTemporalMovementModel)
 *
 * CRITICAL PERFORMANCE REQUIREMENT:
 *   Inference runs strictly asynchronously in the background. It NEVER blocks:
 *     - YOLO11n-Pose CUDA stream / MediaPipe
 *     - Three.js 60fps render loop
 *     - React DOM reconciliation
 */

import type { Landmark } from '../../../types/pose';
import type { MovementState, PostureCompensationResult } from '../../biomechanics/biomechanicsTypes';
import type { ExerciseDefinition } from '../../exercise/ExerciseTypes';
import { TemporalFeatureExtractor } from './TemporalFeatureExtractor';
import { TemporalWindowBuffer } from './TemporalWindowBuffer';
import {
  UnifiedTemporalMovementModel,
  unifiedTemporalModel,
} from './TemporalMovementModel';
import type {
  TemporalFrameSample,
  TemporalPredictionOutput,
  TemporalModelArchitecture,
  TemporalWindowConfig,
} from './TemporalTypes';

export class TemporalInferenceEngine {
  private featureExtractor: TemporalFeatureExtractor;
  private windowBuffer: TemporalWindowBuffer;
  private model: UnifiedTemporalMovementModel;

  private latestPrediction: TemporalPredictionOutput | null = null;
  private isInferring: boolean = false;
  private onPredictionListeners: Array<(pred: TemporalPredictionOutput) => void> = [];

  constructor(
    config: Partial<TemporalWindowConfig> = {},
    model: UnifiedTemporalMovementModel = unifiedTemporalModel
  ) {
    this.featureExtractor = new TemporalFeatureExtractor();
    this.windowBuffer = new TemporalWindowBuffer(config);
    this.model = model;
  }

  /**
   * Processes a single frame non-blockingly.
   * Extracts kinematics, updates sliding window, and triggers background inference if due.
   */
  public processFrame(params: {
    timestamp: number;
    currentAngle: number | null;
    landmarks: Landmark[] | null;
    activeExercise: ExerciseDefinition;
    movementPhase: MovementState;
    postureResult?: PostureCompensationResult | null;
  }): TemporalFrameSample {
    const sample = this.featureExtractor.extractSample(params);
    this.windowBuffer.pushSample(sample);

    // Check if a new inference hop is due and no inference is actively in-flight
    if (
      !this.isInferring &&
      this.windowBuffer.shouldTriggerInference(params.timestamp)
    ) {
      this.triggerAsyncInference(params.timestamp);
    }

    return sample;
  }

  /**
   * Triggers non-blocking background inference.
   */
  private triggerAsyncInference(timestamp: number): void {
    this.windowBuffer.markInferenceTriggered(timestamp);
    this.isInferring = true;

    const samplesSnapshot = this.windowBuffer.getSamples();

    // Use microtask / non-blocking promise resolution to yield immediately to the main thread
    Promise.resolve().then(async () => {
      try {
        const prediction = await this.model.predictAsync(samplesSnapshot);
        this.latestPrediction = prediction;
        this.notifyListeners(prediction);
      } catch (err) {
        console.warn('[TemporalInferenceEngine] Background inference error:', err);
      } finally {
        this.isInferring = false;
      }
    });
  }

  /**
   * Returns the most recent temporal prediction, or null if warm-up is in progress.
   */
  public getLatestPrediction(): TemporalPredictionOutput | null {
    return this.latestPrediction;
  }

  /**
   * Returns sliding window buffer statistics (sample count, time span, capacity).
   */
  public getBufferStats() {
    return this.windowBuffer.getStats();
  }

  /**
   * Switches active neural architecture (TCN, LSTM, Transformer).
   */
  public setArchitecture(architecture: TemporalModelArchitecture): void {
    this.model.setArchitecture(architecture);
  }

  /**
   * Adjusts the sliding window duration (clamped to 2.0 - 5.0 seconds).
   */
  public setWindowDuration(seconds: number): void {
    this.windowBuffer.setWindowDuration(seconds);
  }

  /**
   * Subscribes a listener to receive new temporal predictions.
   */
  public addPredictionListener(
    listener: (pred: TemporalPredictionOutput) => void
  ): () => void {
    this.onPredictionListeners.push(listener);
    return () => {
      this.onPredictionListeners = this.onPredictionListeners.filter(
        (l) => l !== listener
      );
    };
  }

  private notifyListeners(prediction: TemporalPredictionOutput): void {
    for (const listener of this.onPredictionListeners) {
      try {
        listener(prediction);
      } catch (e) {
        console.error('[TemporalInferenceEngine] Listener error:', e);
      }
    }
  }

  /**
   * Resets temporal feature history, sliding window, and internal model states.
   */
  public reset(): void {
    this.featureExtractor.reset();
    this.windowBuffer.clear();
    this.model.reset();
    this.latestPrediction = null;
    this.isInferring = false;
  }
}

export const temporalInferenceEngine = new TemporalInferenceEngine();
