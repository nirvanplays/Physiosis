/**
 * PhysiosisAIOrchestrator.ts
 * Unified Rehabilitation AI Orchestration Engine.
 *
 * Combines:
 *   Pose Estimation + Biomechanics + Posture Compensation + Exercise Protocol +
 *   Patient History + Tracking Confidence + Safety Telemetry
 *
 * Produces ONE authoritative structured rehabilitation state (PhysiosisAIState).
 *
 * Strict Decision Hierarchy Order:
 *   1. Safety Verification
 *   2. Tracking Confidence
 *   3. Exercise Recognition & Protocol Matching
 *   4. Kinematics & Movement Analysis
 *   5. Compensation & Fault Detection
 *   6. Patient Baseline & Longitudinal Progress Comparison
 *   7. Multimodal Protocol Guidance
 *   8. Progression / Regression Recommendation
 *   9. Escalation & Clinician Consultation Telemetry
 *
 * STRICT NON-DIAGNOSTIC COMPLIANCE:
 *   - NEVER outputs medical diagnoses ("No ACL tear", "No frozen shoulder", "No scoliosis").
 *   - Uses objective, descriptive biomechanical terms ("Movement is below reference target",
 *     "Observed compensatory movement", "Consider discussing this finding with your physiotherapist").
 *   - NO free-form LLM decision making: all thresholds, progressions, and safety bounds
 *     are deterministically evaluated via clinical rule matrices.
 */

import type {
  AIOrchestratorInput,
  PhysiosisAIState,
  AISafetyLevel,
  AIProgressionStage,
  AIRecommendationSource,
  AIVelocityQuality,
  AIEscalationUrgency,
} from './AIOrchestratorTypes';
import { getDrillForAbnormalPosture } from '../guidance/CorrectiveDrillRegistry';
import { PatientBaselineEngine } from './baseline/PatientBaselineEngine';
import { RehabilitationRecommendationEngine } from '../recommendation/RehabilitationRecommendationEngine';
import { RehabilitationSafetyEngine } from '../safety/RehabilitationSafetyEngine';
import { AdaptiveProgressionEngine } from '../progression/AdaptiveProgressionEngine';
import {
  buildPatientRehabilitationState,
  type PatientRehabilitationState,
} from '../state/PatientRehabilitationState';



export class PhysiosisAIOrchestrator {
  private prevAngle: number | null = null;
  private prevTimestamp: number = Date.now();
  private angleVelocityHistory: number[] = [];

  /**
   * Evaluates all telemetry streams and returns the single authoritative AI state.
   */
  public orchestrate(input: AIOrchestratorInput): PhysiosisAIState {
    const {
      landmarks,
      activeExercise,
      sessionState,
      postureResult,
      stats,
      savedSessions = [],
      isStreaming,
      selectedSide = 'right',
      currentAngle = null,
      temporalPrediction = null,
    } = input;

    const now = Date.now();
    const dt = Math.max(0.016, (now - this.prevTimestamp) / 1000);

    // ── STAGE 1: OBSERVABLE SIGNAL PREPARATION & SAFETY VERIFICATION ────────
    // Compute angular velocity (°/s)
    let angularVelocity = input.angularVelocity ?? 0;
    if (currentAngle !== null && this.prevAngle !== null && input.angularVelocity === undefined) {
      angularVelocity = Math.abs((currentAngle - this.prevAngle) / dt);
      this.angleVelocityHistory.push(angularVelocity);
      if (this.angleVelocityHistory.length > 15) {
        this.angleVelocityHistory.shift();
      }
    }

    // Determine normalized tracking confidence (0.0 to 1.0)
    let rawTrackingConfidence = 0;
    if (!isStreaming) {
      rawTrackingConfidence = 0;
    } else if (!landmarks || landmarks.length < 25) {
      rawTrackingConfidence = 0.2;
    } else {
      const avgVis =
        landmarks.reduce((acc, curr) => acc + (curr.visibility ?? 1), 0) / landmarks.length;
      rawTrackingConfidence = avgVis;
    }

    // Run authoritative RehabilitationSafetyEngine BEFORE AI recommendations
    const safetyResult = RehabilitationSafetyEngine.evaluate({
      exerciseId: activeExercise.id,
      trackingConfidence: rawTrackingConfidence,
      currentAngle: currentAngle ?? 0,
      targetAngle: activeExercise.targetAngle,
      angularVelocity,
      angularAcceleration: input.angularAcceleration,
      asymmetryAngle: input.asymmetryAngle,
      balanceLossCount: input.balanceLossCount,
      userReportedPain: input.userReportedPain,
      userReportedDizziness: input.userReportedDizziness,
      sessionInterrupted: input.sessionInterrupted,
      severeCompensation: postureResult?.isAbnormalDetected && postureResult.primaryFault?.severity === 'SEVERE',
    });

    let safetyLevel: AISafetyLevel = 'SAFE';
    if (safetyResult.state === 'STOP' || safetyResult.state === 'ESCALATE') {
      safetyLevel = 'STOP_MOVEMENT';
    } else if (safetyResult.state === 'CAUTION') {
      safetyLevel = 'CAUTION';
    }

    const isSafe = safetyResult.state === 'SAFE';
    const flaggedHazards: string[] = safetyResult.flaggedHazards;
    const safetyDisclaimer =
      'Advisory rehabilitation guidance only. Not medical diagnosis. Stop immediately if movement causes discomfort and consult your physiotherapist.';

    // ── STAGE 2: TRACKING CONFIDENCE ─────────────────────────────────────────
    let trackingConfidence = Math.round(rawTrackingConfidence * 100);
    let biomechanicalConfidence = stats ? Math.round(stats.confidence) : trackingConfidence;
    let isReliable = trackingConfidence >= 45 && isStreaming;
    let degradationReason: string | null = null;

    if (!isStreaming) {
      degradationReason = 'Camera feed is standby or inactive.';
    } else if (!landmarks || landmarks.length < 25) {
      degradationReason = 'Partial landmark occlusion. Ensure your full torso and limbs are visible.';
    } else if (trackingConfidence < 45) {
      degradationReason = 'Low landmark visibility. Check lighting and step back from the camera.';
    }

    // ── STAGE 3: EXERCISE RECOGNITION & PROTOCOL MATCHING ───────────────────
    const effectiveAngle = currentAngle !== null ? Math.round(currentAngle) : null;
    const targetAngle = activeExercise.targetAngle;
    const romPercentage =
      effectiveAngle !== null
        ? Math.min(100, Math.max(0, Math.round((effectiveAngle / targetAngle) * 100)))
        : 0;
    const deviation = effectiveAngle !== null ? Math.max(0, targetAngle - effectiveAngle) : targetAngle;
    const movementPhase = sessionState.latestRep ? 'LIFTING' : 'READY';

    // ── STAGE 4: KINEMATICS & MOVEMENT ANALYSIS ─────────────────────────────
    let velocityQuality: AIVelocityQuality = 'OPTIMAL';
    if (angularVelocity > 160) {
      velocityQuality = 'TOO_FAST';
    } else if (angularVelocity > 100) {
      velocityQuality = 'JERKY';
    } else if (angularVelocity < 4 && movementPhase === 'LIFTING') {
      velocityQuality = 'TOO_SLOW';
    }

    let stabilityScore = Math.max(
      20,
      Math.min(100, Math.round(100 - (angularVelocity > 80 ? 25 : angularVelocity > 40 ? 10 : 0)))
    );

    let movementScore = Math.round(
      Math.min(100, Math.max(0, Math.sqrt(romPercentage / 100) * 100))
    );

    // Supplement with temporal intelligence model without replacing deterministic safety checks
    if (temporalPrediction) {
      const temporalQualityScore = Math.round(temporalPrediction.quality * 100);
      const temporalStabilityScore = Math.round(temporalPrediction.stability * 100);
      movementScore = Math.round(movementScore * 0.7 + temporalQualityScore * 0.3);
      stabilityScore = Math.round(stabilityScore * 0.65 + temporalStabilityScore * 0.35);
    }

    // ── STAGE 5: COMPENSATION & FAULT DETECTION ─────────────────────────────
    const compDetected = postureResult?.isAbnormalDetected ?? false;
    const compensationsList = (postureResult?.compensations ?? []).map((c) => ({
      type: c.type,
      name: c.name,
      severity: c.severity,
      jointKeys: c.compensatingJoints,
      measuredValue: c.measuredValue,
      unit: c.unit,
      clinicalCue: c.clinicalCue,
    }));

    const activeCompensatingJoints = postureResult?.compensatingJoints ?? [];
    const postureIntegrity = postureResult?.overallPosturalScore ?? 100;
    const isPostureOptimal = postureIntegrity >= 85 && !compDetected;

    // ── STAGE 6: PATIENT BASELINE & LONGITUDINAL COMPARISON (PATCH 4) ────────
    const exerciseKey = activeExercise.id || activeExercise.name;
    const baseline = PatientBaselineEngine.computeExerciseBaseline(
      savedSessions,
      exerciseKey,
      activeExercise.name
    );
    const comparison = PatientBaselineEngine.compareWithBaseline(
      effectiveAngle ?? 0,
      baseline,
      targetAngle
    );
    const trendResult = PatientBaselineEngine.calculateStatisticalTrend(savedSessions, exerciseKey);
    const personalization = PatientBaselineEngine.generatePersonalization(
      baseline,
      sessionState,
      activeExercise
    );

    // ── STAGE 7: PROTOCOL GUIDANCE GENERATION ────────────────────────────────
    let primaryInstruction = `Elevate ${selectedSide} limb smoothly toward ${targetAngle}° reference target.`;
    let actionInstruction = 'Maintain steady tempo with neutral core.';
    let directionalCue = '↗ Raise arm forward & upward';
    let voiceCue = `Move toward ${targetAngle} degrees.`;
    let correctionDrillObj: { id: string; title: string; targetArea: string } | null = null;

    if (safetyResult.state === 'ESCALATE') {
      primaryInstruction = safetyResult.escalationNotice || RehabilitationSafetyEngine.ESCALATION_PROMPT;
      actionInstruction = 'Contact your physiotherapist immediately. Movement paused.';
      directionalCue = '🛑 Clinical Escalation';
      voiceCue = 'Please stop and contact your physiotherapist.';
    } else if (safetyResult.state === 'STOP') {
      primaryInstruction = RehabilitationSafetyEngine.STOP_CLINICAL_PROMPT;
      actionInstruction = safetyResult.action;
      directionalCue = '⏹ Stop Movement';
      voiceCue = RehabilitationSafetyEngine.STOP_CLINICAL_PROMPT;
    } else if (!isReliable) {
      primaryInstruction = 'Adjust camera position to show full body.';
      actionInstruction = degradationReason || 'Step into clear view of the camera.';
      directionalCue = '↔ Reposition';
      voiceCue = 'Please step back into full camera view.';
    } else if (compDetected && postureResult?.primaryFault) {
      const fault = postureResult.primaryFault;
      primaryInstruction = `Observed compensatory movement: ${fault.name}.`;
      actionInstruction = fault.clinicalCue;
      directionalCue = '⚠️ Align Form';
      voiceCue = fault.clinicalCue;

      const drill = getDrillForAbnormalPosture(fault.type);
      correctionDrillObj = {
        id: drill.id,
        title: drill.title,
        targetArea: drill.targetArea,
      };
    } else if (effectiveAngle !== null && effectiveAngle >= targetAngle - 8) {
      primaryInstruction = 'Reference target range achieved!';
      actionInstruction = 'Hold steady for isometric stabilization, then return smoothly.';
      directionalCue = '✓ Target Met';
      voiceCue = 'Target reached! Hold steady.';
    } else if (comparison.comparisonStatus === 'ABOVE_BASELINE' && isPostureOptimal) {
      primaryInstruction = comparison.detailedNote;
      actionInstruction = personalization.encouragement;
      directionalCue = '▲ Above Baseline';
      voiceCue = 'Above your recent baseline! Keep it up.';
    }

    if (safetyResult.isCoachingAllowed && personalization.restSuggestion.shouldRest) {
      actionInstruction = personalization.restSuggestion.reason || actionInstruction;
    }

    // ── STAGE 8: CONSTRAINED REHABILITATION PROTOCOL ENGINE (PATCH 5) ────────
    const recommendation = RehabilitationRecommendationEngine.evaluate({
      exercise: activeExercise,
      rom: {
        currentAngle: effectiveAngle,
        targetAngle,
        romPercentage,
        bestROM: sessionState.metrics.bestROM,
      },
      movementQuality: {
        score: movementScore,
        stability: stabilityScore,
        symmetry: isPostureOptimal ? 96 : 78,
        velocityQuality,
      },
      compensation: {
        detected: compDetected,
        primaryFault: postureResult?.primaryFault
          ? {
              type: postureResult.primaryFault.type,
              name: postureResult.primaryFault.name,
              severity: postureResult.primaryFault.severity,
              measuredValue: postureResult.primaryFault.measuredValue,
              unit: postureResult.primaryFault.unit,
            }
          : null,
        activeFaultsCount: compensationsList.length,
        activeCompensatingJoints,
      },
      patientBaseline: {
        status: baseline.status,
        typicalROM: baseline.typicalROM,
        medianROM: baseline.medianROM,
        bestROM: baseline.bestROM,
        repConsistency: baseline.repConsistency,
        compensationFrequency: baseline.compensationFrequency,
      },
      recentSessionTrend: {
        trend: trendResult.trend,
        slopeDegreesPerSession: trendResult.slopeDegreesPerSession,
      },
      confidence: {
        trackingConfidence,
        biomechanicalConfidence,
        isReliable,
        degradationReason,
      },
      safetyState: {
        level: safetyLevel,
        flaggedHazards,
      },
      temporalPrediction,
    });

    let progressionStage: AIProgressionStage = 'MAINTAIN';
    let dosageRecommendation = '';
    let recommendationSource: AIRecommendationSource = 'CLINICAL_PROTOCOL_MATRIX';

    if (safetyResult.state === 'STOP' || safetyResult.state === 'ESCALATE') {
      progressionStage = 'REGRESSION';
      dosageRecommendation = 'Active protocol progression frozen due to clinical safety hold.';
      recommendationSource = 'SAFETY_OVERRIDE';
    } else if (!safetyResult.isProgressionAllowed) {
      progressionStage = 'MAINTAIN';
      dosageRecommendation = `${recommendation.sets} sets × ${recommendation.repetitions} reps. Protocol progression frozen under cautionary state.`;
      recommendationSource = 'SAFETY_OVERRIDE';
    } else {
      if (recommendation.sourceType === 'SAFETY_RULE') {
        progressionStage = 'REGRESSION';
      } else if (recommendation.interimTargetAngle && recommendation.interimTargetAngle > (baseline.typicalROM || 0)) {
        progressionStage = 'PROGRESSION';
      }

      dosageRecommendation = `${recommendation.sets} sets × ${recommendation.repetitions} reps (${recommendation.holdDuration}s hold, ${recommendation.rest}s rest). ${recommendation.reason}`;

      recommendationSource =
        recommendation.sourceType === 'SAFETY_RULE'
          ? 'SAFETY_OVERRIDE'
          : recommendation.sourceType === 'PATIENT_BASELINE'
          ? 'BASELINE_RULES'
          : 'CLINICAL_PROTOCOL_MATRIX';
    }

    // ── STAGE 9: ESCALATION TELEMETRY (NON-DIAGNOSTIC) ──────────────────────
    let requiresClinicianReview = false;
    let urgency: AIEscalationUrgency = 'NONE';
    let escalationReason: string | null = null;
    let consultationPrompt =
      'Routine rehabilitation progress. Continue prescribed protocol as advised by your physiotherapist.';

    if (safetyResult.state === 'ESCALATE') {
      requiresClinicianReview = true;
      urgency = 'PROMPT';
      escalationReason = safetyResult.triggerDetail;
      consultationPrompt = safetyResult.escalationNotice || 'Contact your physiotherapist';
    } else if (safetyResult.state === 'STOP') {
      requiresClinicianReview = true;
      urgency = 'PROMPT';
      escalationReason = safetyResult.triggerDetail;
      consultationPrompt = RehabilitationSafetyEngine.STOP_CLINICAL_PROMPT;
    } else if (trendResult.trend === 'declining') {
      requiresClinicianReview = true;
      urgency = 'ROUTINE';
      escalationReason = 'Statistically declining movement range detected across recent sessions.';
      consultationPrompt =
        'A declining movement range trend was observed over recent sessions. Consider scheduling a review with your physiotherapist.';
    }

    const { qualifyingSessions } = PatientBaselineEngine.filterValidSessionsAndReps(
      savedSessions,
      exerciseKey
    );

    if (qualifyingSessions.length >= 3 && !requiresClinicianReview) {
      const recentAverages = qualifyingSessions.slice(-3).map((s) => s.averageROM || s.bestROM || 0);
      const isPersistentDeficit = recentAverages.every((rom) => rom < targetAngle * 0.65);
      if (isPersistentDeficit) {
        requiresClinicianReview = true;
        urgency = 'ROUTINE';
        escalationReason =
          'Movement has remained below reference target range across 3 consecutive sessions.';
        consultationPrompt =
          'Observed movement has remained below the clinical reference target across multiple sessions. Consider requesting clinical guidance.';
      }
    }

    // ── STAGE 10: SAFE DIFFICULTY PROGRESSION (PATCH 10) ────────────────────
    const adaptiveProgression = AdaptiveProgressionEngine.evaluate({
      exerciseId: activeExercise.id,
      exerciseName: activeExercise.name,
      recentPerformance: {
        completedReps: sessionState.metrics.completedReps,
        targetReps: recommendation.repetitions ?? 10,
        currentAngle: effectiveAngle,
        peakAngle: sessionState.metrics.bestROM > 0 ? sessionState.metrics.bestROM : effectiveAngle,
        averageAngle: sessionState.metrics.averageROM > 0 ? sessionState.metrics.averageROM : effectiveAngle,
        targetAngle,
        romPercentage,
        isSessionComplete: sessionState.sessionState === 'COMPLETED',
      },
      historicalBaseline: {
        status: baseline.status,
        typicalROM: baseline.typicalROM,
        medianROM: baseline.medianROM,
        bestROM: baseline.bestROM,
        repConsistency: baseline.repConsistency,
        compensationFrequency: baseline.compensationFrequency,
        qualifyingSessionsCount: qualifyingSessions.length,
      },
      quality: {
        score: movementScore,
        stability: stabilityScore,
        symmetry: isPostureOptimal ? 96 : 78,
        velocityQuality,
      },
      consistency: baseline.repConsistency ?? 80,
      compensationRate: {
        frequency: baseline.compensationFrequency ?? (compDetected ? 25 : 0),
        detected: compDetected,
        activeFaultsCount: compensationsList.length,
        severity: compDetected ? (compensationsList[0]?.severity ?? 'MILD') : 'NONE',
        primaryFaultName: postureResult?.primaryFault?.name ?? null,
      },
      confidence: {
        trackingConfidence,
        biomechanicalConfidence,
        isReliable,
        degradationReason,
      },
      safetyState: {
        level: safetyResult.state,
        isProgressionAllowed: safetyResult.isProgressionAllowed,
        flaggedHazards,
        triggerDetail: safetyResult.triggerDetail,
      },
      currentDosage: {
        targetAngle,
        repetitions: recommendation.repetitions,
        sets: recommendation.sets,
        holdDuration: recommendation.holdDuration,
        rest: recommendation.rest,
      },
      timestamp: now,
    });

    // Update state cache for next tick
    this.prevAngle = currentAngle;
    this.prevTimestamp = now;

    const baseState: Omit<PhysiosisAIState, 'patientState'> = {
      sessionState: {
        status: sessionState.sessionState,
        elapsedSeconds: Math.floor(sessionState.metrics.elapsedMs / 1000),
        completedReps: sessionState.metrics.completedReps,
        activeRep: sessionState.currentRepNumber,
      },
      exerciseState: {
        exerciseId: activeExercise.id,
        exerciseName: activeExercise.name,
        laterality: selectedSide,
        currentAngle: effectiveAngle,
        targetAngle,
        romPercentage,
        movementPhase,
        deviation,
      },
      movementQuality: {
        score: movementScore,
        stability: stabilityScore,
        symmetry: isPostureOptimal ? 96 : 78,
        velocityQuality,
      },
      postureState: {
        integrityScore: postureIntegrity,
        isOptimal: isPostureOptimal,
        activeFaultsCount: compensationsList.length,
        primaryFault: postureResult?.primaryFault?.name ?? null,
      },
      compensationState: {
        detected: compDetected,
        compensations: compensationsList,
        activeCompensatingJoints,
      },
      patientProgress: {
        baselineStatus: baseline.status,
        baselineROM: baseline.status === 'BASELINE_AVAILABLE' ? baseline.typicalROM : null,
        typicalROM: baseline.status === 'BASELINE_AVAILABLE' ? baseline.typicalROM : null,
        medianROM: baseline.status === 'BASELINE_AVAILABLE' ? baseline.medianROM : null,
        historicalBestROM: baseline.bestROM > 0 ? baseline.bestROM : null,
        sessionDeltaVsBaseline: comparison.deltaVsBaseline,
        repConsistency: baseline.status === 'BASELINE_AVAILABLE' ? baseline.repConsistency : null,
        compensationFrequency: baseline.status === 'BASELINE_AVAILABLE' ? baseline.compensationFrequency : null,
        comparisonStatement: comparison.comparisonStatement,
        trend: trendResult.trend,
        personalization,
      },
      guidance: {
        primaryInstruction,
        actionInstruction,
        directionalCue,
        correctionDrill: correctionDrillObj,
        voiceCue,
      },
      recommendedProtocol: {
        nextExerciseId: recommendation.recommendedExercise.id,
        progressionStage,
        dosageRecommendation,
        recommendationSource,
        recommendation,
      },

      safetyState: {
        level: safetyLevel,
        rehabilitationSafetyState: safetyResult.state,
        isSafe,
        isCoachingAllowed: safetyResult.isCoachingAllowed,
        isProgressionAllowed: safetyResult.isProgressionAllowed,
        isGamificationAllowed: safetyResult.isGamificationAllowed,
        isVoiceCoachingAllowed: safetyResult.isVoiceCoachingAllowed,
        statusMessage: safetyResult.statusMessage,
        action: safetyResult.action,
        escalationNotice: safetyResult.escalationNotice,
        auditEvent: safetyResult.auditEvent,
        flaggedHazards,
        disclaimer: safetyDisclaimer,
      },
      confidence: {
        trackingConfidence,
        biomechanicalConfidence,
        isReliable,
        degradationReason,
      },
      escalation: {
        requiresClinicianReview,
        urgency,
        reason: escalationReason,
        consultationPrompt,
      },
      temporalIntelligence: temporalPrediction ?? null,
      explanation: recommendation.explanation,
      adaptiveProgression,
    };

    const patientState = buildPatientRehabilitationState(
      input,
      baseState as PhysiosisAIState,
      { voiceTextContext: input.voiceTextContext }
    );

    return {
      ...baseState,
      patientState,
    };
  }

  /**
   * Directly extracts the single authoritative structured multimodal patient state.
   */
  public getPatientState(input: AIOrchestratorInput): PatientRehabilitationState {
    return this.orchestrate(input).patientState;
  }
}

export const physiosisAIOrchestrator = new PhysiosisAIOrchestrator();
