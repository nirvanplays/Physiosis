/**
 * TemporalFeatureExtractor.ts
 * Extracts frame-by-frame kinematic features and derivatives for temporal window processing.
 *
 * Computes:
 *   - Joint angles (primary, elbow, trunk, hip, knee)
 *   - Angular velocity (°/s) with finite difference filtering
 *   - Angular acceleration (°/s²)
 *   - ROM percentage
 *   - Bilateral kinetic chain symmetry index
 *   - Trunk lateral lean and shoulder hike compensation metrics
 *   - Visibility confidence
 */

import type { Landmark } from '../../../types/pose';
import type { MovementState, PostureCompensationResult } from '../../biomechanics/biomechanicsTypes';
import type { ExerciseDefinition } from '../../exercise/ExerciseTypes';
import type { TemporalFrameSample, TemporalCompensationPattern } from './TemporalTypes';
import { clamp } from '../../../utils/math';

export class TemporalFeatureExtractor {
  private prevAngle: number | null = null;
  private prevVelocity: number = 0;
  private prevTimestamp: number = 0;

  /**
   * Resets temporal derivative states.
   */
  public reset(): void {
    this.prevAngle = null;
    this.prevVelocity = 0;
    this.prevTimestamp = 0;
  }

  /**
   * Extracts a structured TemporalFrameSample from the current frame.
   */
  public extractSample(params: {
    timestamp: number;
    currentAngle: number | null;
    landmarks: Landmark[] | null;
    activeExercise: ExerciseDefinition;
    movementPhase: MovementState;
    postureResult?: PostureCompensationResult | null;
  }): TemporalFrameSample {
    const {
      timestamp,
      currentAngle,
      landmarks,
      activeExercise,
      movementPhase,
      postureResult,
    } = params;

    const angle = currentAngle ?? activeExercise.startAngle;
    const targetAngle = activeExercise.targetAngle;

    // Time difference in seconds (safe guard against dt = 0)
    const dt = this.prevTimestamp > 0 ? Math.max(0.005, (timestamp - this.prevTimestamp) / 1000) : 0.033;

    // Angular velocity (°/s)
    let angularVelocity = 0;
    if (this.prevAngle !== null && currentAngle !== null) {
      angularVelocity = (currentAngle - this.prevAngle) / dt;
    }

    // Angular acceleration (°/s²)
    let angularAcceleration = 0;
    if (this.prevTimestamp > 0) {
      angularAcceleration = (angularVelocity - this.prevVelocity) / dt;
    }

    // Update historical state
    this.prevAngle = currentAngle;
    this.prevVelocity = angularVelocity;
    this.prevTimestamp = timestamp;

    // Range of motion percentage
    const romPercentage = clamp(
      Math.round(((angle - activeExercise.startAngle) / (targetAngle - activeExercise.startAngle)) * 100),
      0,
      120
    );

    // Compute bilateral kinetic chain symmetry (0.0 - 1.0)
    const symmetry = this.calculateSymmetry(landmarks);

    // Trunk and posture compensation extraction
    const trunkCompensation = this.extractCompensationMetrics(postureResult, landmarks);

    // Average tracking confidence
    let confidence = 0.5;
    if (landmarks && landmarks.length > 0) {
      const sum = landmarks.reduce((acc, l) => acc + (l.visibility ?? 1), 0);
      confidence = Math.round((sum / landmarks.length) * 100) / 100;
    }

    // Extract auxiliary joint angles
    const jointAngles = this.extractJointAngles(landmarks, angle);

    return {
      timestamp,
      jointAngles,
      angularVelocity: Math.round(angularVelocity * 10) / 10,
      angularAcceleration: Math.round(angularAcceleration * 10) / 10,
      romPercentage,
      symmetry: Math.round(symmetry * 100) / 100,
      trunkCompensation,
      confidence,
      movementPhase,
      landmarks,
    };
  }

  /**
   * Calculates bilateral kinetic chain symmetry between left and right landmarks.
   */
  private calculateSymmetry(landmarks: Landmark[] | null): number {
    if (!landmarks || landmarks.length < 25) return 0.85;

    // Compare left shoulder (11) & right shoulder (12)
    const leftShoulder = landmarks[11];
    const rightShoulder = landmarks[12];
    // Compare left hip (23) & right hip (24)
    const leftHip = landmarks[23];
    const rightHip = landmarks[24];
    // Compare left wrist (15) & right wrist (16)
    const leftWrist = landmarks[15];
    const rightWrist = landmarks[16];

    if (!leftShoulder || !rightShoulder || !leftHip || !rightHip) return 0.85;

    const shoulderTilt = Math.abs(leftShoulder.y - rightShoulder.y);
    const hipTilt = Math.abs(leftHip.y - rightHip.y);
    const armElevDiff = leftWrist && rightWrist ? Math.abs(leftWrist.y - rightWrist.y) : 0;

    // Normalized asymmetry penalty
    const asymmetryPenalty = (shoulderTilt * 2.5 + hipTilt * 2.0 + armElevDiff * 0.5);
    return clamp(1.0 - asymmetryPenalty, 0.2, 1.0);
  }

  /**
   * Translates posture compensation result into structured temporal compensation metrics.
   */
  private extractCompensationMetrics(
    postureResult?: PostureCompensationResult | null,
    landmarks?: Landmark[] | null
  ): TemporalFrameSample['trunkCompensation'] {
    if (postureResult?.isAbnormalDetected && postureResult.primaryFault) {
      const fault = postureResult.primaryFault;
      let pattern: TemporalCompensationPattern = 'NONE';
      if (fault.type === 'TRUNK_LATERAL_LEAN') pattern = 'TRUNK_LEAN';
      else if (fault.type === 'SHOULDER_HIKE') pattern = 'SHOULDER_HIKE';
      else if (fault.type === 'KNEE_VALGUS') pattern = 'KNEE_VALGUS';
      else if (fault.type === 'PELVIC_TILT') pattern = 'PELVIC_TILT';
      else if (fault.type === 'FORWARD_HEAD') pattern = 'FORWARD_HEAD';

      const severityScore =
        fault.severity === 'SEVERE' ? 0.95 : fault.severity === 'MODERATE' ? 0.65 : 0.35;

      const trunkLateralLeanAngle = fault.type === 'TRUNK_LATERAL_LEAN' ? fault.measuredValue : 0;
      const shoulderHikeAngle = fault.type === 'SHOULDER_HIKE' ? fault.measuredValue : 0;

      return {
        trunkLateralLeanAngle,
        shoulderHikeAngle,
        detected: true,
        compensationType: pattern,
        severityScore,
      };
    }

    // Direct geometric extraction if postureResult not provided
    if (landmarks && landmarks.length >= 25) {
      const ls = landmarks[11];
      const rs = landmarks[12];
      const lh = landmarks[23];
      const rh = landmarks[24];

      if (ls && rs && lh && rh) {
        const midShoulderX = (ls.x + rs.x) / 2;
        const midShoulderY = (ls.y + rs.y) / 2;
        const midHipX = (lh.x + rh.x) / 2;
        const midHipY = (lh.y + rh.y) / 2;

        const dx = midShoulderX - midHipX;
        const dy = midShoulderY - midHipY;
        const trunkTiltDeg = Math.abs(Math.atan2(dx, -dy) * (180 / Math.PI));

        if (trunkTiltDeg > 7.0) {
          return {
            trunkLateralLeanAngle: Math.round(trunkTiltDeg * 10) / 10,
            shoulderHikeAngle: 0,
            detected: true,
            compensationType: 'TRUNK_LEAN',
            severityScore: clamp(trunkTiltDeg / 20, 0.3, 1.0),
          };
        }
      }
    }

    return {
      trunkLateralLeanAngle: 0,
      shoulderHikeAngle: 0,
      detected: false,
      compensationType: 'NONE',
      severityScore: 0.0,
    };
  }

  /**
   * Extracts joint angles for multi-joint temporal sequence representations.
   */
  private extractJointAngles(
    landmarks: Landmark[] | null,
    primaryAngle: number
  ): TemporalFrameSample['jointAngles'] {
    if (!landmarks || landmarks.length < 25) {
      return { primaryAngle };
    }

    // Extract right elbow angle (12-14-16) or left (11-13-15)
    let elbowAngle: number | undefined;
    const s = landmarks[12];
    const e = landmarks[14];
    const w = landmarks[16];
    if (s && e && w) {
      const v1x = s.x - e.x;
      const v1y = s.y - e.y;
      const v2x = w.x - e.x;
      const v2y = w.y - e.y;
      const dot = v1x * v2x + v1y * v2y;
      const mag1 = Math.sqrt(v1x * v1x + v1y * v1y);
      const mag2 = Math.sqrt(v2x * v2x + v2y * v2y);
      if (mag1 * mag2 > 0.0001) {
        elbowAngle = Math.round(Math.acos(clamp(dot / (mag1 * mag2), -1, 1)) * (180 / Math.PI));
      }
    }

    return {
      primaryAngle,
      elbowAngle,
    };
  }
}
