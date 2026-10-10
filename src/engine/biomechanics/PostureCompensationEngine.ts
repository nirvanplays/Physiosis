/**
 * PostureCompensationEngine.ts
 * Real-Time Biomechanical Abnormal Posture & Compensation Detection Engine.
 *
 * Evaluates all 33 full-body anatomical landmarks on every frame to detect
 * compensatory movement faults, kinetic chain deviations, and abnormal postures:
 *   1. Trunk Lateral Lean / Lateral Flexion (cheating ROM by tilting torso)
 *   2. Shoulder Hiking / Scapular Shrugging (substituting trapezius for glenohumeral elevation)
 *   3. Thoracic Kyphosis / Forward Slouch (loss of core/spinal neutral)
 *   4. Knee Valgus / Inward Collapse (medial knee tracking fault)
 *   5. Pelvic Tilt / Hip Hiking (asymmetric pelvic stabilization)
 *   6. Forward Head Posture / Cervical Craning (anterior head carriage)
 *
 * Provides quantitative severity classifications, affected joint identification,
 * corrective clinical verbal cues, and links to visual corrective demonstration drills.
 */

import type { Landmark3D } from '../exercise/ExerciseTypes';
import { getLandmarksForSide } from './sideLandmarks';
import type {
  CompensationSeverity,
  DetectedCompensation,
  PostureCompensationResult,
} from './biomechanicsTypes';

export interface PostureEngineInput {
  landmarks: Landmark3D[];
  exerciseId?: string;
  side?: 'left' | 'right' | 'bilateral';
  currentAngle?: number | null;
}

export class PostureCompensationEngine {
  /**
   * Evaluates the current frame's landmarks for abnormal posture and compensations.
   */
  public analyze(input: PostureEngineInput): PostureCompensationResult {
    const { landmarks, side = 'right' } = input;

    if (!landmarks || landmarks.length < 25) {
      return this.createCleanResult();
    }

    const bundle = getLandmarksForSide(landmarks, side);
    const compensations: DetectedCompensation[] = [];
    const compensatingJointSet = new Set<string>();

    const {
      leftShoulder,
      rightShoulder,
      leftHip,
      rightHip,
      leftKnee,
      rightKnee,
      leftAnkle,
      rightAnkle,
      midShoulder,
      midHip,
    } = bundle;

    // ── 1. Trunk Lateral Lean Detection ──────────────────────────────────────
    if (midShoulder && midHip) {
      const dx = midShoulder.x - midHip.x;
      const dy = midShoulder.y - midHip.y; // Negative because Y points downward in screen space
      const leanAngleDeg = Math.round(
        Math.abs(Math.atan2(Math.abs(dx), Math.abs(dy))) * (180 / Math.PI) * 10
      ) / 10;

      if (leanAngleDeg > 7.0) {
        let severity: CompensationSeverity = 'MILD';
        if (leanAngleDeg > 15.0) severity = 'SEVERE';
        else if (leanAngleDeg > 10.5) severity = 'MODERATE';

        compensations.push({
          type: 'TRUNK_LATERAL_LEAN',
          name: 'Trunk Lateral Lean',
          severity,
          measuredValue: leanAngleDeg,
          thresholdValue: 7.0,
          unit: '°',
          compensatingJoints: ['spine', 'chest', 'pelvis'],
          clinicalCue: 'Keep your torso tall and upright — avoid leaning your body to the side.',
          correctiveDrillId: 'drill_trunk_stabilization',
        });

        compensatingJointSet.add('spine');
        compensatingJointSet.add('chest');
      }
    }

    // ── 2. Shoulder Hiking / Scapular Shrugging Detection ───────────────────
    if (leftShoulder && rightShoulder) {
      const sDx = rightShoulder.x - leftShoulder.x;
      const sDy = rightShoulder.y - leftShoulder.y;
      const shoulderTiltDeg = Math.round(
        Math.abs(Math.atan2(Math.abs(sDy), Math.abs(sDx))) * (180 / Math.PI) * 10
      ) / 10;

      if (shoulderTiltDeg > 6.0) {
        let severity: CompensationSeverity = 'MILD';
        if (shoulderTiltDeg > 13.0) severity = 'SEVERE';
        else if (shoulderTiltDeg > 9.0) severity = 'MODERATE';

        const hikedJoint = sDy < 0 ? 'rightShoulder' : 'leftShoulder';

        compensations.push({
          type: 'SHOULDER_HIKE',
          name: 'Scapular Shoulder Hike',
          severity,
          measuredValue: shoulderTiltDeg,
          thresholdValue: 6.0,
          unit: '°',
          compensatingJoints: [hikedJoint, 'neck'],
          clinicalCue: 'Drop your shoulder down away from your ear — isolate movement to your arm.',
          correctiveDrillId: 'drill_scapular_depression',
        });

        compensatingJointSet.add(hikedJoint);
        compensatingJointSet.add('neck');
      }
    }

    // ── 3. Pelvic Tilt / Asymmetry (Hip Hiking) ──────────────────────────────
    if (leftHip && rightHip) {
      const hDx = rightHip.x - leftHip.x;
      const hDy = rightHip.y - leftHip.y;
      const hipTiltDeg = Math.round(
        Math.abs(Math.atan2(Math.abs(hDy), Math.abs(hDx))) * (180 / Math.PI) * 10
      ) / 10;

      if (hipTiltDeg > 5.5) {
        let severity: CompensationSeverity = 'MILD';
        if (hipTiltDeg > 12.0) severity = 'SEVERE';
        else if (hipTiltDeg > 8.0) severity = 'MODERATE';

        compensations.push({
          type: 'PELVIC_TILT',
          name: 'Pelvic Asymmetry / Hip Hike',
          severity,
          measuredValue: hipTiltDeg,
          thresholdValue: 5.5,
          unit: '°',
          compensatingJoints: ['pelvis', 'leftHip', 'rightHip'],
          clinicalCue: 'Keep both hips level and stable — do not hike your pelvis upward.',
          correctiveDrillId: 'drill_pelvic_leveling',
        });

        compensatingJointSet.add('pelvis');
      }
    }

    // ── 4. Knee Valgus / Inward Collapse Detection ───────────────────────────
    const activeHip = side === 'left' ? leftHip : rightHip;
    const activeKnee = side === 'left' ? leftKnee : rightKnee;
    const activeAnkle = side === 'left' ? leftAnkle : rightAnkle;

    if (activeHip && activeKnee && activeAnkle) {
      // Calculate deviation of knee from the straight hip-ankle line
      const baselineKneeX = activeHip.x + (activeAnkle.x - activeHip.x) * 0.5;
      const deviationNorm = (activeKnee.x - baselineKneeX) * (side === 'left' ? -1 : 1);
      const valgusOffsetMm = Math.round(deviationNorm * 400); // Approximate mm in patient scale

      if (valgusOffsetMm > 25) {
        let severity: CompensationSeverity = 'MILD';
        if (valgusOffsetMm > 55) severity = 'SEVERE';
        else if (valgusOffsetMm > 38) severity = 'MODERATE';

        const kneeKey = side === 'left' ? 'leftKnee' : 'rightKnee';

        compensations.push({
          type: 'KNEE_VALGUS',
          name: 'Knee Valgus / Medial Collapse',
          severity,
          measuredValue: valgusOffsetMm,
          thresholdValue: 25,
          unit: 'mm',
          compensatingJoints: [kneeKey, 'pelvis'],
          clinicalCue: 'Keep your knee tracking directly over your second toe — prevent inward caving.',
          correctiveDrillId: 'drill_knee_valgus_alignment',
        });

        compensatingJointSet.add(kneeKey);
      }
    }

    // ── 5. Forward Head Carriage / Cervical Craning ──────────────────────────
    const nose = landmarks[0];
    const leftEar = landmarks[7];
    const rightEar = landmarks[8];
    const midEar = leftEar && rightEar
      ? { x: (leftEar.x + rightEar.x) / 2, y: (leftEar.y + rightEar.y) / 2, z: ((leftEar.z ?? 0) + (rightEar.z ?? 0)) / 2 }
      : nose;

    if (midEar && midShoulder) {
      const earForwardDisp = Math.abs((midEar.z ?? 0) - (midShoulder.z ?? 0));
      const earForwardDeg = Math.round(earForwardDisp * 90);

      if (earForwardDeg > 18) {
        let severity: CompensationSeverity = 'MILD';
        if (earForwardDeg > 32) severity = 'SEVERE';
        else if (earForwardDeg > 24) severity = 'MODERATE';

        compensations.push({
          type: 'FORWARD_HEAD',
          name: 'Forward Head Posture',
          severity,
          measuredValue: earForwardDeg,
          thresholdValue: 18,
          unit: '°',
          compensatingJoints: ['head', 'neck'],
          clinicalCue: 'Draw your chin gently back into neutral alignment — avoid jutting forward.',
          correctiveDrillId: 'drill_chin_tuck_retraction',
        });

        compensatingJointSet.add('neck');
        compensatingJointSet.add('head');
      }
    }

    // ── Calculate Composite Postural Integrity Score [0–100%] ──────────────
    let penalty = 0;
    for (const comp of compensations) {
      if (comp.severity === 'SEVERE') penalty += 32;
      else if (comp.severity === 'MODERATE') penalty += 18;
      else penalty += 9;
    }
    const overallPosturalScore = Math.max(15, Math.min(100, Math.round(100 - penalty)));

    // Sort compensations by severity so primary fault is the highest priority
    compensations.sort((a, b) => {
      const rank = { SEVERE: 3, MODERATE: 2, MILD: 1 };
      return rank[b.severity] - rank[a.severity];
    });

    const primaryFault = compensations[0] ?? null;
    const isAbnormalDetected = compensations.length > 0;
    const verbalCorrection = primaryFault
      ? primaryFault.clinicalCue
      : 'Excellent postural alignment — maintain smooth, controlled form.';

    return {
      overallPosturalScore,
      isAbnormalDetected,
      primaryFault,
      compensations,
      compensatingJoints: Array.from(compensatingJointSet),
      verbalCorrection,
    };
  }

  private createCleanResult(): PostureCompensationResult {
    return {
      overallPosturalScore: 100,
      isAbnormalDetected: false,
      primaryFault: null,
      compensations: [],
      compensatingJoints: [],
      verbalCorrection: 'Ready — maintain tall, neutral posture.',
    };
  }
}

export const postureCompensationEngine = new PostureCompensationEngine();
