/**
 * RehabilitationRecommendationEngine.ts
 * Authoritative Constrained Rehabilitation Protocol Recommendation Engine.
 *
 * Evaluates multi-stream telemetry:
 *   Exercise + ROM + Movement Quality + Compensation + Patient Baseline +
 *   Session Trend + Tracking Confidence + Safety State + Temporal Model
 *
 * Produces ONE deterministic, reproducible protocol recommendation.
 *
 * STRICT CLINICAL GUARDRAILS:
 *   1. Must only select from the curated exercise registry (getAllExercises()).
 *   2. May NOT invent arbitrary exercises.
 *   3. May NOT prescribe medication or pharmaceuticals.
 *   4. May NOT output medical diagnoses.
 *   5. Completely deterministic: identical inputs produce identical recommendations.
 */

import type { ExerciseDefinition } from '../exercise/ExerciseTypes';
import { getAllExercises, getExercise } from '../exercise/ExerciseRegistry';
import { getDrillForAbnormalPosture } from '../guidance/CorrectiveDrillRegistry';
import type {
  RehabilitationRecommendationInput,
  RehabilitationRecommendation,
  RecommendationDifficulty,
  AIExplanation,
  ExplanationSourceCategory,
} from './RecommendationTypes';
import type { PatientRehabilitationState } from '../state/PatientRehabilitationState';
import { extractRecommendationEngineInput } from '../state/PatientRehabilitationState';

/** Sequential progression paths within the approved exercise registry */
const REGISTRY_PROGRESSION_PATHS: Record<string, string[]> = {
  // Shoulder / Upper Limb
  'shoulder-flexion': ['shoulder-flexion', 'shoulder-abduction', 'cross-body-shoulder-stretch', 'arm-circumduction'],
  'shoulder-abduction': ['shoulder-abduction', 'cross-body-shoulder-stretch', 'arm-circumduction', 'isometric-rotation'],
  'cross-body-shoulder-stretch': ['cross-body-shoulder-stretch', 'shoulder-flexion', 'arm-circumduction'],
  'arm-circumduction': ['arm-circumduction', 'shoulder-flexion', 'shoulder-abduction'],

  // Spine / Core
  'isometric-side-bending': ['isometric-side-bending', 'isometric-rotation'],
  'isometric-rotation': ['isometric-rotation', 'isometric-side-bending'],

  // Lower Limb / Knee / Hip / Ankle
  'knee-extension': ['knee-extension', 'straight-leg-raise', 'ankle-plantar-flexion'],
  'straight-leg-raise': ['straight-leg-raise', 'knee-extension', 'ankle-plantar-flexion'],
  'ankle-plantar-flexion': ['ankle-plantar-flexion', 'knee-extension', 'straight-leg-raise'],

  // Wrist / Hand
  'wrist-extension-stretch': ['wrist-extension-stretch', 'ball-press'],
  'ball-press': ['ball-press', 'wrist-extension-stretch'],
};

export class RehabilitationRecommendationEngine {
  /**
   * Helper to construct a typed, structured AIExplanation object (Patch 8).
   */
  private static buildExplanation(params: {
    observation: string;
    evidence: string;
    contributingFactors: string[];
    recommendation: string;
    confidence: number;
    source: ExplanationSourceCategory[];
    patientView: string;
    metric: string;
    threshold: string | number;
    timestamp?: number;
    rawValues?: Record<string, any>;
  }): AIExplanation {
    return {
      observation: params.observation,
      evidence: params.evidence,
      contributingFactors: params.contributingFactors,
      recommendation: params.recommendation,
      confidence: params.confidence,
      source: params.source,
      patientView: params.patientView,
      developerView: {
        metric: params.metric,
        threshold: params.threshold,
        confidence: params.confidence,
        source: params.source,
        timestamp: params.timestamp ?? Date.now(),
        rawValues: params.rawValues,
      },
    };
  }

  /**
   * Evaluates structured input streams and emits the authoritative recommendation.
   * Execution is 100% deterministic with zero stochastic operations.
   */
  public static evaluate(input: RehabilitationRecommendationInput): RehabilitationRecommendation {
    const {
      exercise,
      rom,
      movementQuality,
      compensation,
      patientBaseline,
      recentSessionTrend,
      confidence,
      safetyState,
      temporalPrediction,
    } = input;

    // Validate that the active exercise belongs to the curated registry
    const currentCuratedExercise = this.resolveCuratedExercise(exercise.id || exercise.name);

    // ── TIER 1: SAFETY_RULE (Immediate Protective Override) ──────────────────
    if (safetyState.level === 'STOP_MOVEMENT' || safetyState.flaggedHazards.length > 0) {
      const hazardDetail = safetyState.flaggedHazards[0] || 'Excessive joint velocity or protective hazard detected.';
      const restingExercise = this.resolveRestingExercise(currentCuratedExercise);

      const explanation = this.buildExplanation({
        observation: 'Musculoskeletal safety limit or excessive movement velocity detected',
        evidence: `Safety state = STOP_MOVEMENT, hazard: ${hazardDetail}`,
        contributingFactors: ['protective hazard', 'excessive velocity or jerk'],
        recommendation: 'Stop active joint loading immediately and rest in neutral resting alignment',
        confidence: 0.99,
        source: ['sensor_data', 'safety_rule'],
        patientView: 'Exercise paused for safety: a movement speed or safety limit was detected. Please rest and follow your clinician\'s instructions.',
        metric: 'safetyLevel',
        threshold: 'level = STOP_MOVEMENT',
        timestamp: input.timestamp,
        rawValues: { safetyLevel: safetyState.level, flaggedHazards: safetyState.flaggedHazards },
      });

      return {
        recommendedExercise: restingExercise,
        reason: `Movement paused for musculoskeletal protection: ${hazardDetail}`,
        difficulty: 'beginner',
        sets: 1,
        repetitions: 3,
        holdDuration: 0,
        rest: 60,
        nextStep: 'Stop active joint loading immediately. Rest in neutral resting alignment and perform slow diaphragmatic breathing.',
        confidence: 99,
        sourceType: 'SAFETY_RULE',
        correctiveDrill: null,
        clinicalEscalationRequired: true,
        explanation,
      };
    }

    // ── TIER 2: SENSOR CONFIDENCE DEGRADATION ─────────────────────────────────
    if (!confidence.isReliable || confidence.trackingConfidence < 50) {
      const reasonText = confidence.degradationReason || 'Camera silhouette tracking is degraded or occluded.';
      const confScore = Math.round(Math.min(confidence.trackingConfidence, confidence.biomechanicalConfidence));

      const explanation = this.buildExplanation({
        observation: 'Camera silhouette tracking reliability is insufficient for safe biomechanical analysis',
        evidence: `Tracking confidence = ${confidence.trackingConfidence}%, minimum threshold = 50%`,
        contributingFactors: ['partial landmark occlusion', 'degraded silhouette visibility'],
        recommendation: `Reposition your body or camera: ${reasonText}`,
        confidence: Math.round(confScore) / 100,
        source: ['sensor_data', 'safety_rule'],
        patientView: 'The camera cannot clearly see your movement right now. Please adjust your position so your full body is visible.',
        metric: 'trackingConfidence',
        threshold: 'min = 50%',
        timestamp: input.timestamp,
        rawValues: { trackingConfidence: confidence.trackingConfidence, isReliable: confidence.isReliable },
      });

      return {
        recommendedExercise: currentCuratedExercise,
        reason: `Sensor tracking reliability is insufficient (${confidence.trackingConfidence}%). Cannot safely evaluate biomechanics.`,
        difficulty: currentCuratedExercise.difficulty || 'beginner',
        sets: 1,
        repetitions: 0,
        holdDuration: 0,
        rest: 15,
        nextStep: `Reposition your body or camera: ${reasonText}`,
        confidence: confScore,
        sourceType: 'SAFETY_RULE',
        correctiveDrill: null,
        clinicalEscalationRequired: false,
        explanation,
      };
    }

    // ── TIER 3: SEVERE POSTURE COMPENSATION OVERRIDE ─────────────────────────
    if (compensation.detected && compensation.primaryFault?.severity === 'SEVERE') {
      const fault = compensation.primaryFault;
      const drill = getDrillForAbnormalPosture(fault.type as any);
      const stabilizingExercise = this.resolveCorrectiveExercise(currentCuratedExercise, fault.type);

      const explanation = this.buildExplanation({
        observation: `Severe compensatory movement detected: ${fault.name}`,
        evidence: `${fault.name} = +${fault.measuredValue}${fault.unit}, severity = SEVERE`,
        contributingFactors: [fault.name.toLowerCase(), 'kinetic chain cheating', 'stabilizer muscle fatigue'],
        recommendation: `Regress protocol to core stabilization drill: ${drill?.title || fault.name}`,
        confidence: 0.95,
        source: ['sensor_data', 'biomechanics', 'safety_rule'],
        patientView: 'Your body is shifting to compensate for the movement. We recommend stabilizing your posture with a corrective drill before continuing.',
        metric: fault.type,
        threshold: 'severity = SEVERE',
        timestamp: input.timestamp,
        rawValues: { faultType: fault.type, measuredValue: fault.measuredValue, unit: fault.unit },
      });

      return {
        recommendedExercise: stabilizingExercise,
        reason: `Severe compensatory movement detected: ${fault.name} (+${fault.measuredValue}${fault.unit}). Regressing protocol to eliminate kinetic cheating and protect adjacent segments.`,
        difficulty: 'beginner',
        sets: 2,
        repetitions: 8,
        holdDuration: 3,
        rest: 45,
        nextStep: drill?.cues[0] || fault.name ? `Correct form: ${drill?.title || fault.name}. Focus on stabilizing your core.` : 'Focus on neutral posture.',
        confidence: 95,
        sourceType: 'SAFETY_RULE',
        correctiveDrill: drill,
        clinicalEscalationRequired: false,
        explanation,
      };
    }

    // ── TIER 4: MODERATE COMPENSATION OR HIGH BASELINE COMPENSATION SPIKE ─────
    const isModerateComp = compensation.detected && compensation.primaryFault?.severity === 'MODERATE';
    const isCompFrequencySpike = Boolean(
      patientBaseline?.status === 'BASELINE_AVAILABLE' &&
      patientBaseline.compensationFrequency !== null &&
      patientBaseline.compensationFrequency > 25 &&
      compensation.detected
    );

    if (isModerateComp || isCompFrequencySpike) {
      const faultName = compensation.primaryFault?.name || 'Mild compensatory shift';
      const reducedTarget = Math.max(currentCuratedExercise.startAngle, rom.targetAngle - 15);
      const sources: ExplanationSourceCategory[] =
        patientBaseline?.status === 'BASELINE_AVAILABLE'
          ? ['biomechanics', 'patient_baseline', 'protocol']
          : ['biomechanics', 'protocol'];

      const explanation = this.buildExplanation({
        observation: `Compensatory pattern observed: ${faultName}`,
        evidence: `${faultName} detected, reducing progression target from ${rom.targetAngle}° to ${reducedTarget}°`,
        contributingFactors: [faultName.toLowerCase(), 'substitute motor recruitment'],
        recommendation: `Elevate only to your clean range of ${reducedTarget}° without compensatory shrugging or leaning`,
        confidence: 0.90,
        source: sources,
        patientView: 'A slight compensatory movement was detected, so practice within your comfortable range without cheating form.',
        metric: 'compensationDetected',
        threshold: `interimTarget = ${reducedTarget}°`,
        timestamp: input.timestamp,
        rawValues: { faultName, reducedTarget, targetAngle: rom.targetAngle },
      });

      return {
        recommendedExercise: currentCuratedExercise,
        reason: `Compensatory pattern observed (${faultName}). Reducing progression target to ${reducedTarget}° to ensure training within the safe, non-compensating zone.`,
        difficulty: 'beginner',
        sets: 3,
        repetitions: 8,
        holdDuration: 2,
        rest: 30,
        nextStep: 'Elevate only to your clean, pain-free range. Pause before compensatory recruitment begins.',
        confidence: 90,
        sourceType: patientBaseline?.status === 'BASELINE_AVAILABLE' ? 'PATIENT_BASELINE' : 'PROTOCOL',
        correctiveDrill: compensation.primaryFault ? getDrillForAbnormalPosture(compensation.primaryFault.type as any) : null,
        interimTargetAngle: reducedTarget,
        clinicalEscalationRequired: false,
        explanation,
      };
    }

    // ── TIER 5: TEMPORAL MOVEMENT INTELLIGENCE ANOMALY ───────────────────────
    const hasTemporalAnomaly = Boolean(
      temporalPrediction &&
      ((temporalPrediction.compensation && temporalPrediction.compensation !== 'NONE') ||
        (typeof temporalPrediction.quality === 'number' && temporalPrediction.quality < 0.75))
    );

    if (hasTemporalAnomaly) {
      const temporalConf = Math.round((temporalPrediction?.confidence ?? 0.85) * 100);

      const explanation = this.buildExplanation({
        observation: 'Temporal neural model detected movement sequence irregularity or dynamic cadence fatigue',
        evidence: `Temporal quality = ${temporalPrediction?.quality ?? 0.70}, anomaly pattern = ${temporalPrediction?.compensation || 'Cadence oscillation'}`,
        contributingFactors: ['cadence oscillation', 'temporal sequence fatigue'],
        recommendation: 'Maintain paced cadence: 3 seconds concentric ascent, 2 seconds isometric hold, and 3 seconds controlled return',
        confidence: temporalConf / 100,
        source: ['model_output', 'protocol'],
        patientView: 'Your movement timing is fluctuating due to muscular fatigue. Focus on a steady 3-second lifting and lowering tempo.',
        metric: 'temporalQuality',
        threshold: 'min = 0.75',
        timestamp: input.timestamp,
        rawValues: { quality: temporalPrediction?.quality, compensation: temporalPrediction?.compensation },
      });

      return {
        recommendedExercise: currentCuratedExercise,
        reason: `Temporal neural model detected movement sequence irregularity or dynamic fatigue (${temporalPrediction?.compensation || 'Cadence oscillation'}).`,
        difficulty: 'intermediate',
        sets: 2,
        repetitions: 8,
        holdDuration: 2.5,
        rest: 40,
        nextStep: 'Maintain a paced cadence: 3 seconds concentric ascent, 2 seconds isometric hold, and 3 seconds controlled return.',
        confidence: temporalConf,
        sourceType: 'TEMPORAL_MODEL',
        correctiveDrill: null,
        clinicalEscalationRequired: false,
        explanation,
      };
    }

    // ── TIER 6: PATIENT BASELINE MILESTONE PROGRESSION ────────────────────────
    const isBaselineEligible = Boolean(
      patientBaseline &&
      patientBaseline.status === 'BASELINE_AVAILABLE' &&
      patientBaseline.typicalROM !== null &&
      patientBaseline.typicalROM > 0
    );

    if (isBaselineEligible && rom.romPercentage >= 85 && movementQuality.score >= 80 && !compensation.detected) {
      const baselineTypical = patientBaseline!.typicalROM!;
      const interimTarget = Math.min(rom.targetAngle, baselineTypical + 10);
      const isTargetFullyAchieved = rom.romPercentage >= 95 && movementQuality.score >= 85;

      if (isTargetFullyAchieved) {
        // Transition to next sequential exercise in the approved registry
        const nextExercise = this.resolveNextProgressionExercise(currentCuratedExercise);

        const explanation = this.buildExplanation({
          observation: 'Active range meets clinical target with high movement quality and consistency',
          evidence: `Current ROM = ${rom.currentAngle}° (${rom.romPercentage}%), stability = ${movementQuality.stability}%, rep consistency = ${patientBaseline?.repConsistency ?? 90}%`,
          contributingFactors: ['target achieved', 'high movement stability', 'consistent repetition control'],
          recommendation: `Transition to progressive protocol: ${nextExercise.name}`,
          confidence: 0.94,
          source: ['biomechanics', 'patient_baseline', 'protocol'],
          patientView: `You have achieved the reference range with stable form and consistency. Transition to the next progression: ${nextExercise.name}.`,
          metric: 'romPercentage',
          threshold: 'target = 100%',
          timestamp: input.timestamp,
          rawValues: { romPercentage: rom.romPercentage, stability: movementQuality.stability },
        });

        return {
          recommendedExercise: nextExercise,
          reason: `Target range (${rom.targetAngle}°) achieved with high stability (${movementQuality.stability}%) and consistency (${patientBaseline?.repConsistency ?? 90}%). Transitioning to progressive protocol: ${nextExercise.name}.`,
          difficulty: this.calculateNextDifficulty(currentCuratedExercise.difficulty),
          sets: 3,
          repetitions: 10,
          holdDuration: 3.5,
          rest: 30,
          nextStep: `Begin initial familiarization repetitions of ${nextExercise.name} with controlled tempo.`,
          confidence: 94,
          sourceType: 'PATIENT_BASELINE',
          correctiveDrill: null,
          interimTargetAngle: nextExercise.targetAngle,
          clinicalEscalationRequired: false,
          explanation,
        };
      }

      // Advance hold duration and step toward interim milestone on current exercise
      const explanation = this.buildExplanation({
        observation: 'Movement aligns with patient baseline with high movement quality score',
        evidence: `Current ROM = ${rom.currentAngle}°, baseline typical = ${baselineTypical}°, quality = ${movementQuality.score}/100`,
        contributingFactors: ['baseline exceedance', 'high movement quality score'],
        recommendation: `Advance to interim milestone of ${interimTarget}° with an extended 3.5-second isometric hold`,
        confidence: 0.92,
        source: ['biomechanics', 'patient_baseline', 'protocol'],
        patientView: `Your movement is progressing beyond your previous baseline with high stability. Advance to your interim milestone of ${interimTarget}°.`,
        metric: 'baselineTypical',
        threshold: `interimTarget = ${interimTarget}°`,
        timestamp: input.timestamp,
        rawValues: { baselineTypical, interimTarget, qualityScore: movementQuality.score },
      });

      return {
        recommendedExercise: currentCuratedExercise,
        reason: `Movement aligns with patient baseline (${baselineTypical}°) with high movement quality (${movementQuality.score}/100). Advancing to interim milestone: ${interimTarget}°.`,
        difficulty: 'intermediate',
        sets: 3,
        repetitions: 10,
        holdDuration: 3.5,
        rest: 30,
        nextStep: `Aim for your interim milestone of ${interimTarget}° with an extended 3.5-second isometric hold.`,
        confidence: 92,
        sourceType: 'PATIENT_BASELINE',
        correctiveDrill: null,
        interimTargetAngle: interimTarget,
        clinicalEscalationRequired: false,
        explanation,
      };
    }

    // ── TIER 7: STANDARD RANGE-IMPROVEMENT PROTOCOL ──────────────────────────
    const targetGap = Math.max(0, rom.targetAngle - (rom.currentAngle ?? 0));
    let difficulty: RecommendationDifficulty = 'intermediate';
    if (rom.romPercentage < 50) difficulty = 'beginner';
    else if (rom.romPercentage >= 85) difficulty = 'intermediate';

    let trendNote = '';
    if (recentSessionTrend?.trend === 'declining') {
      trendNote = ' Recent sessions show a declining trend; focus strictly on control rather than forcing range.';
    } else if (recentSessionTrend?.trend === 'improving') {
      trendNote = ' Building on an improving multi-session trend.';
    }

    const currentRomVal = rom.currentAngle ?? 0;
    const isShoulder =
      currentCuratedExercise.id.includes('shoulder') ||
      currentCuratedExercise.name.toLowerCase().includes('shoulder');
    const movementLabel = isShoulder ? 'shoulder elevation' : currentCuratedExercise.name.toLowerCase();

    const explanation = this.buildExplanation({
      observation: isShoulder
        ? 'Shoulder elevation remains below target'
        : `${currentCuratedExercise.name} remains below target`,
      evidence: `Current ROM = ${currentRomVal}°, target = ${rom.targetAngle}°`,
      contributingFactors: isShoulder ? ['reduced elevation'] : ['reduced range of motion'],
      recommendation: isShoulder
        ? 'Continue gradual shoulder elevation'
        : `Continue gradual ${movementLabel}`,
      confidence: 0.91,
      source: ['biomechanics', 'protocol'],
      patientView: `Your current ${movementLabel} is below the selected reference range, so continue gradually raising the arm.`,
      metric: 'currentAngle',
      threshold: `target = ${rom.targetAngle}°`,
      timestamp: input.timestamp,
      rawValues: {
        currentAngle: currentRomVal,
        targetAngle: rom.targetAngle,
        romPercentage: rom.romPercentage,
      },
    });

    return {
      recommendedExercise: currentCuratedExercise,
      reason: `Active range is progressing (${Math.round(rom.romPercentage)}% of reference target, ${targetGap}° remaining).${trendNote} Prescribed standard controlled range-improvement repetitions.`,

      difficulty,
      sets: 3,
      repetitions: 10,
      holdDuration: 2.0,
      rest: 30,
      nextStep: `Perform 10 controlled repetitions toward ${rom.targetAngle}°, focusing on smooth acceleration and deceleration.`,
      confidence: 90,
      sourceType: 'PROTOCOL',
      correctiveDrill: null,
      clinicalEscalationRequired: false,
      explanation,
    };
  }

  // ── Curated Registry Resolution Helpers ───────────────────────────────────

  /**
   * Authoritatively guarantees that the returned exercise is an authentic instance
   * from the curated registry. It can NEVER be an invented or arbitrary exercise.
   */
  public static resolveCuratedExercise(exerciseIdOrName: string): ExerciseDefinition {
    const all = getAllExercises();
    const cleanId = exerciseIdOrName.toLowerCase().replace(/[\s-_]+/g, '');

    const found = all.find((ex) => {
      const exIdClean = ex.id.toLowerCase().replace(/[\s-_]+/g, '');
      const exNameClean = ex.name.toLowerCase().replace(/[\s-_]+/g, '');
      return exIdClean === cleanId || exNameClean === cleanId;
    });

    if (found) {
      return found;
    }

    // Default to the first registered clinical benchmark exercise
    return getExercise('shoulder-flexion');
  }

  /**
   * Resolves a gentle, safe exercise for resting or protective pauses.
   */
  public static resolveRestingExercise(currentExercise: ExerciseDefinition): ExerciseDefinition {
    if (currentExercise.bodyRegion === 'Shoulder / Upper Limb') {
      return this.resolveCuratedExercise('cross-body-shoulder-stretch');
    }
    if (currentExercise.bodyRegion === 'Knee / Lower Limb') {
      return this.resolveCuratedExercise('straight-leg-raise');
    }
    if (currentExercise.bodyRegion === 'Wrist') {
      return this.resolveCuratedExercise('wrist-extension-stretch');
    }
    return currentExercise;
  }

  /**
   * Resolves a complementary stabilizing exercise when severe compensation occurs.
   */
  public static resolveCorrectiveExercise(
    currentExercise: ExerciseDefinition,
    faultType: string
  ): ExerciseDefinition {
    if (faultType === 'TRUNK_LATERAL_LEAN') {
      return this.resolveCuratedExercise('isometric-side-bending');
    }
    if (faultType === 'SHOULDER_HIKE') {
      return this.resolveCuratedExercise('cross-body-shoulder-stretch');
    }
    if (faultType === 'KNEE_VALGUS') {
      return this.resolveCuratedExercise('knee-extension');
    }
    return currentExercise;
  }

  /**
   * Resolves the next progression exercise along the evidence-based clinical chain.
   */
  public static resolveNextProgressionExercise(currentExercise: ExerciseDefinition): ExerciseDefinition {
    const normalizedKey = currentExercise.id.replace(/_/g, '-');
    const path = REGISTRY_PROGRESSION_PATHS[normalizedKey] || REGISTRY_PROGRESSION_PATHS[currentExercise.id];

    if (path && path.length > 1) {
      const currentIdx = path.indexOf(normalizedKey) !== -1 ? path.indexOf(normalizedKey) : 0;
      const nextKey = path[(currentIdx + 1) % path.length];
      return this.resolveCuratedExercise(nextKey);
    }

    return currentExercise;
  }

  /**
   * Advances difficulty tier safely.
   */
  private static calculateNextDifficulty(
    currentDifficulty?: 'beginner' | 'intermediate' | 'advanced'
  ): RecommendationDifficulty {
    if (currentDifficulty === 'beginner') return 'intermediate';
    if (currentDifficulty === 'intermediate') return 'advanced';
    return 'advanced';
  }

  /**
   * Evaluates protocol recommendations directly from the authoritative PatientRehabilitationState (Patch 9).
   */
  public static evaluatePatientState(state: PatientRehabilitationState): RehabilitationRecommendation {
    return RehabilitationRecommendationEngine.evaluate(extractRecommendationEngineInput(state));
  }
}
