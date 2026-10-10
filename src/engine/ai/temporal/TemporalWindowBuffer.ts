/**
 * TemporalWindowBuffer.ts
 * Time-indexed sliding window buffer managing 2–5 second kinematic sequences with overlap.
 *
 * Provides:
 *   - Continuous ingestion of per-frame TemporalFrameSample objects
 *   - Automatic eviction of samples older than window duration
 *   - Overlap stride tracking (e.g. 250ms hop = ~80-90% overlap)
 *   - Temporal sequence normalization and linear interpolation resampling into
 *     fixed tensor sequences [timeSteps, featureCount] for neural models (TCN, LSTM, Transformer).
 */

import type { TemporalFrameSample, TemporalWindowConfig } from './TemporalTypes';
import { clamp, lerp } from '../../../utils/math';

export const DEFAULT_TEMPORAL_WINDOW_CONFIG: TemporalWindowConfig = {
  windowDurationSec: 3.0, // 3.0-second sliding window
  hopIntervalMs: 250,     // Evaluate every 250ms with 85-90% overlap
  resampleTimeSteps: 64,  // Resample sequence to 64 discrete time steps
  minSamplesRequired: 15, // Minimum samples to perform inference (~500ms)
};

export class TemporalWindowBuffer {
  private config: TemporalWindowConfig;
  private buffer: TemporalFrameSample[] = [];
  private lastInferenceTimestamp: number = 0;

  constructor(config: Partial<TemporalWindowConfig> = {}) {
    this.config = {
      ...DEFAULT_TEMPORAL_WINDOW_CONFIG,
      ...config,
      // Clamp window duration to 2.0 - 5.0 seconds as specified by prompt
      windowDurationSec: clamp(config.windowDurationSec ?? 3.0, 2.0, 5.0),
    };
  }

  /**
   * Configures window duration (clamped to 2.0 - 5.0s).
   */
  public setWindowDuration(seconds: number): void {
    this.config.windowDurationSec = clamp(seconds, 2.0, 5.0);
  }

  /**
   * Pushes a new frame sample into the circular sliding window and purges expired samples.
   */
  public pushSample(sample: TemporalFrameSample): void {
    this.buffer.push(sample);

    // Evict samples outside the window duration (timestamp < now - windowDurationMs)
    const windowDurationMs = this.config.windowDurationSec * 1000;
    const cutoffTimestamp = sample.timestamp - windowDurationMs;

    while (this.buffer.length > 0 && this.buffer[0].timestamp < cutoffTimestamp) {
      this.buffer.shift();
    }
  }

  /**
   * Checks if enough temporal context has been accumulated to execute inference.
   */
  public isReady(): boolean {
    if (this.buffer.length < this.config.minSamplesRequired) {
      return false;
    }
    const spanMs = this.buffer[this.buffer.length - 1].timestamp - this.buffer[0].timestamp;
    // Ready when we have at least 1.5 seconds of recorded kinematics
    return spanMs >= 1500;
  }

  /**
   * Determines if a new inference hop is due based on hop interval and timestamps.
   */
  public shouldTriggerInference(currentTimestamp: number): boolean {
    if (!this.isReady()) return false;
    return currentTimestamp - this.lastInferenceTimestamp >= this.config.hopIntervalMs;
  }

  /**
   * Marks that inference has been triggered at this timestamp.
   */
  public markInferenceTriggered(timestamp: number): void {
    this.lastInferenceTimestamp = timestamp;
  }

  /**
   * Returns a copy of the current window samples.
   */
  public getSamples(): TemporalFrameSample[] {
    return [...this.buffer];
  }

  /**
   * Returns current buffer size and time span in seconds.
   */
  public getStats(): { sampleCount: number; durationSeconds: number; windowCapacitySec: number } {
    if (this.buffer.length === 0) {
      return { sampleCount: 0, durationSeconds: 0, windowCapacitySec: this.config.windowDurationSec };
    }
    const durationSeconds =
      (this.buffer[this.buffer.length - 1].timestamp - this.buffer[0].timestamp) / 1000;
    return {
      sampleCount: this.buffer.length,
      durationSeconds: Math.round(durationSeconds * 10) / 10,
      windowCapacitySec: this.config.windowDurationSec,
    };
  }

  /**
   * Resamples variable-framerate window samples into a fixed-length normalized tensor sequence
   * [timeSteps, featureCount] using linear interpolation.
   *
   * Features per step (10 dimensions):
   *   0: Normalized primary angle [0, 1]
   *   1: Normalized angular velocity [-1, 1]
   *   2: Normalized angular acceleration [-1, 1]
   *   3: ROM % [0, 1]
   *   4: Bilateral symmetry [0, 1]
   *   5: Trunk lateral lean [0, 1]
   *   6: Shoulder hike angle [0, 1]
   *   7: Posture compensation detected flag [0 or 1]
   *   8: Tracking confidence [0, 1]
   *   9: Movement state one-hot / index [0, 1]
   */
  public getResampledTensor(
    timeSteps: number = this.config.resampleTimeSteps
  ): Float32Array[] {
    if (this.buffer.length === 0) return [];
    if (this.buffer.length === 1) {
      const vec = this.sampleToVector(this.buffer[0]);
      return Array.from({ length: timeSteps }, () => new Float32Array(vec));
    }

    const tStart = this.buffer[0].timestamp;
    const tEnd = this.buffer[this.buffer.length - 1].timestamp;
    const totalDuration = Math.max(1, tEnd - tStart);

    const tensor: Float32Array[] = [];
    let bufferIdx = 0;

    for (let step = 0; step < timeSteps; step++) {
      const targetTime = tStart + (step / (timeSteps - 1)) * totalDuration;

      // Advance buffer index
      while (
        bufferIdx < this.buffer.length - 2 &&
        this.buffer[bufferIdx + 1].timestamp <= targetTime
      ) {
        bufferIdx++;
      }

      const s0 = this.buffer[bufferIdx];
      const s1 = this.buffer[Math.min(bufferIdx + 1, this.buffer.length - 1)];

      const dt = Math.max(1, s1.timestamp - s0.timestamp);
      const alpha = clamp((targetTime - s0.timestamp) / dt, 0, 1);

      const v0 = this.sampleToVector(s0);
      const v1 = this.sampleToVector(s1);

      const interpolated = new Float32Array(v0.length);
      for (let f = 0; f < v0.length; f++) {
        interpolated[f] = lerp(v0[f], v1[f], alpha);
      }

      tensor.push(interpolated);
    }

    return tensor;
  }

  /**
   * Encodes a single TemporalFrameSample into a normalized feature vector.
   */
  private sampleToVector(sample: TemporalFrameSample): number[] {
    const normAngle = clamp(sample.jointAngles.primaryAngle / 180, 0, 1);
    const normVel = clamp(sample.angularVelocity / 150, -1, 1);
    const normAcc = clamp(sample.angularAcceleration / 300, -1, 1);
    const normRom = clamp(sample.romPercentage / 100, 0, 1.2);
    const normSym = sample.symmetry;
    const normTrunk = clamp(sample.trunkCompensation.trunkLateralLeanAngle / 25, 0, 1);
    const normHike = clamp(sample.trunkCompensation.shoulderHikeAngle / 20, 0, 1);
    const compFlag = sample.trunkCompensation.detected ? 1.0 : 0.0;
    const conf = sample.confidence;

    // Movement phase index
    let phaseIdx = 0.0;
    if (sample.movementPhase === 'LIFTING') phaseIdx = 0.25;
    else if (sample.movementPhase === 'AT_TARGET') phaseIdx = 0.5;
    else if (sample.movementPhase === 'RETURNING') phaseIdx = 0.75;
    else if (sample.movementPhase === 'LOW_RANGE') phaseIdx = 1.0;

    return [
      normAngle,
      normVel,
      normAcc,
      normRom,
      normSym,
      normTrunk,
      normHike,
      compFlag,
      conf,
      phaseIdx,
    ];
  }

  /**
   * Clears all samples and resets state.
   */
  public clear(): void {
    this.buffer = [];
    this.lastInferenceTimestamp = 0;
  }
}
