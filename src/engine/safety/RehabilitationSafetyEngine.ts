/**
 * =====================================================================
 * PHYSIOSIS — REAL-TIME REHABILITATION SAFETY ENGINE (PATCH 6)
 * =====================================================================
 * Authoritative clinical safety engine executing BEFORE AI recommendations,
 * protocol progression, gamification, and voice coaching.
 *
 * Core Clinical Principles:
 * 1. Precedence: Safety checks execute prior to all biomechanics recommendations.
 * 2. Non-Certitude Invariant: Never declares "You are safe." Instead declares:
 *    "No safety concern detected from the signals available to Physiosis."
 * 3. Observable Signals Only: Evaluates strictly physical, kinematic, and
 *    application-reported signals. Zero medical diagnosis inference.
 * 4. Clinical Interventions:
 *    - STOP: "Please stop this exercise and follow your clinician's instructions."
 *    - ESCALATE: "Contact your physiotherapist"
 * 5. Full Auditability: Records detailed timestamped safety events for session reports.
 */

import {
  RehabilitationSafetyState,
  SafetyTriggerType,
  SafetyAuditEvent,
  SafetyEvaluationInput,
  SafetyEvaluationResult,
} from './SafetyTypes';

export class RehabilitationSafetyEngine {
  // Session-scoped safety audit trail
  private static sessionAuditTrail: SafetyAuditEvent[] = [];

  // Invariant constant messages
  public static readonly NOMINAL_SAFE_MESSAGE =
    'No safety concern detected from the signals available to Physiosis.';
  public static readonly STOP_CLINICAL_PROMPT =
    "Please stop this exercise and follow your clinician's instructions.";
  public static readonly ESCALATION_PROMPT =
    'Contact your physiotherapist';

  /**
   * Evaluates input telemetry against clinical safety bounds.
   * Priority hierarchy: ESCALATE -> STOP -> CAUTION -> SAFE
   */
  public static evaluate(input: SafetyEvaluationInput): SafetyEvaluationResult {
    const hazards: string[] = [];
    const timestamp = new Date().toISOString();

    // -------------------------------------------------------------
    // TIER 1: ESCALATE (Immediate Clinical Attention Required)
    // -------------------------------------------------------------
    if (input.userReportedDizziness) {
      hazards.push('User reported acute dizziness / vertigo');
      return this.buildResult({
        state: 'ESCALATE',
        trigger: 'USER_REPORTED_DIZZINESS',
        triggerDetail: 'Patient reported dizziness/vertigo during session.',
        statusMessage: 'Dizziness reported. Session halted for safety.',
        action: this.ESCALATION_PROMPT,
        escalationNotice: `${this.ESCALATION_PROMPT} immediately if dizziness persists. Exercise paused.`,
        isCoachingAllowed: false,
        isProgressionAllowed: false,
        isGamificationAllowed: false,
        isVoiceCoachingAllowed: false,
        input,
        hazards,
        timestamp,
      });
    }

    if (input.userReportedPain !== undefined && input.userReportedPain >= 7) {
      hazards.push(`Acute pain rating reported: ${input.userReportedPain}/10`);
      return this.buildResult({
        state: 'ESCALATE',
        trigger: 'USER_REPORTED_PAIN',
        triggerDetail: `Acute pain score of ${input.userReportedPain}/10 reported by patient.`,
        statusMessage: 'Acute pain threshold exceeded. Session halted for safety.',
        action: this.ESCALATION_PROMPT,
        escalationNotice: `Acute pain reported (${input.userReportedPain}/10). ${this.ESCALATION_PROMPT}.`,
        isCoachingAllowed: false,
        isProgressionAllowed: false,
        isGamificationAllowed: false,
        isVoiceCoachingAllowed: false,
        input,
        hazards,
        timestamp,
      });
    }

    if ((input.balanceLossCount ?? 0) >= 2) {
      hazards.push(`Repeated loss of balance detected (${input.balanceLossCount} events)`);
      return this.buildResult({
        state: 'ESCALATE',
        trigger: 'REPEATED_LOSS_OF_BALANCE',
        triggerDetail: `Repeated loss of balance (${input.balanceLossCount} occurrences) indicates high fall hazard.`,
        statusMessage: 'Multiple balance instabilities detected. Exercise stopped for fall prevention.',
        action: this.ESCALATION_PROMPT,
        escalationNotice: `Repeated balance loss detected. ${this.ESCALATION_PROMPT} to adjust physical support protocols.`,
        isCoachingAllowed: false,
        isProgressionAllowed: false,
        isGamificationAllowed: false,
        isVoiceCoachingAllowed: false,
        input,
        hazards,
        timestamp,
      });
    }

    if (input.sessionInterrupted) {
      hazards.push('Distress exit or unexpected session disruption');
      return this.buildResult({
        state: 'ESCALATE',
        trigger: 'SESSION_INTERRUPTION',
        triggerDetail: 'Abrupt session interruption or distress flag triggered.',
        statusMessage: 'Session interrupted unexpectedly.',
        action: this.ESCALATION_PROMPT,
        escalationNotice: `Session interrupted. ${this.ESCALATION_PROMPT} if you experienced physical discomfort.`,
        isCoachingAllowed: false,
        isProgressionAllowed: false,
        isGamificationAllowed: false,
        isVoiceCoachingAllowed: false,
        input,
        hazards,
        timestamp,
      });
    }

    // -------------------------------------------------------------
    // TIER 2: STOP (High Risk Kinematic / Overrun Conditions)
    // -------------------------------------------------------------
    const absVelocity = Math.abs(input.angularVelocity);
    const absAccel = Math.abs(input.angularAcceleration ?? 0);

    if (absVelocity > 200 || absAccel > 1200) {
      hazards.push(`Sudden rapid velocity/jerk: ${absVelocity.toFixed(1)}°/s, accel ${absAccel.toFixed(1)}°/s²`);
      return this.buildResult({
        state: 'STOP',
        trigger: 'SUDDEN_MOVEMENT_CHANGE',
        triggerDetail: `Kinematic jerk exceeding safe threshold: ${absVelocity.toFixed(1)}°/s (threshold: 200°/s).`,
        statusMessage: this.STOP_CLINICAL_PROMPT,
        action: 'Halt current movement. Rest in neutral position before continuing.',
        isCoachingAllowed: false,
        isProgressionAllowed: false,
        isGamificationAllowed: false,
        isVoiceCoachingAllowed: false,
        input,
        hazards,
        timestamp,
      });
    }

    if (input.currentAngle > input.targetAngle + 35) {
      const overrun = (input.currentAngle - input.targetAngle).toFixed(1);
      hazards.push(`Extreme range overrun: +${overrun}° beyond safe target`);
      return this.buildResult({
        state: 'STOP',
        trigger: 'EXTREME_DEVIATION',
        triggerDetail: `Joint angle (${input.currentAngle.toFixed(1)}°) exceeded target (${input.targetAngle.toFixed(1)}°) by +${overrun}°.`,
        statusMessage: this.STOP_CLINICAL_PROMPT,
        action: 'Immediate cessation of extension/flexion beyond prescribed target.',
        isCoachingAllowed: false,
        isProgressionAllowed: false,
        isGamificationAllowed: false,
        isVoiceCoachingAllowed: false,
        input,
        hazards,
        timestamp,
      });
    }

    if (input.userReportedPain !== undefined && input.userReportedPain >= 4 && input.userReportedPain < 7) {
      hazards.push(`Moderate pain level reported: ${input.userReportedPain}/10`);
      return this.buildResult({
        state: 'STOP',
        trigger: 'USER_REPORTED_PAIN',
        triggerDetail: `Moderate pain reported (${input.userReportedPain}/10).`,
        statusMessage: this.STOP_CLINICAL_PROMPT,
        action: 'Cease repetition and rest. Avoid pushing into moderate pain.',
        isCoachingAllowed: false,
        isProgressionAllowed: false,
        isGamificationAllowed: false,
        isVoiceCoachingAllowed: false,
        input,
        hazards,
        timestamp,
      });
    }

    // -------------------------------------------------------------
    // TIER 3: CAUTION (Degradation / Non-Critical Biomechanics)
    // -------------------------------------------------------------
    if (input.trackingConfidence < 0.50) {
      hazards.push(`Tracking confidence degraded: ${(input.trackingConfidence * 100).toFixed(0)}%`);
      return this.buildResult({
        state: 'CAUTION',
        trigger: 'TRACKING_CONFIDENCE_DEGRADED',
        triggerDetail: `Tracking confidence (${(input.trackingConfidence * 100).toFixed(0)}%) dropped below 50% threshold.`,
        statusMessage: 'Caution: Pose tracking confidence degraded. Please adjust camera framing and lighting.',
        action: 'Reposition within camera view.',
        isCoachingAllowed: true, // Coaching permitted to guide positioning
        isProgressionAllowed: false, // Protocol progression frozen
        isGamificationAllowed: true,
        isVoiceCoachingAllowed: true,
        input,
        hazards,
        timestamp,
      });
    }

    if ((input.asymmetryAngle ?? 0) > 35) {
      hazards.push(`High bilateral asymmetry: ${(input.asymmetryAngle ?? 0).toFixed(1)}°`);
      return this.buildResult({
        state: 'CAUTION',
        trigger: 'UNUSUAL_ASYMMETRY',
        triggerDetail: `Bilateral joint asymmetry of ${(input.asymmetryAngle ?? 0).toFixed(1)}° detected.`,
        statusMessage: 'Caution: Marked bilateral asymmetry detected. Focus on balanced alignment.',
        action: 'Re-align contralateral limb posture evenly.',
        isCoachingAllowed: true,
        isProgressionAllowed: false,
        isGamificationAllowed: true,
        isVoiceCoachingAllowed: true,
        input,
        hazards,
        timestamp,
      });
    }

    if (input.severeCompensation) {
      hazards.push('Significant trunk compensation detected');
      return this.buildResult({
        state: 'CAUTION',
        trigger: 'SUDDEN_MOVEMENT_CHANGE',
        triggerDetail: 'Substantial compensatory posture / trunk sway detected.',
        statusMessage: 'Caution: Compensatory movement detected. Reduce range to maintain proper posture.',
        action: 'Correct trunk posture and reduce movement velocity.',
        isCoachingAllowed: true,
        isProgressionAllowed: false,
        isGamificationAllowed: true,
        isVoiceCoachingAllowed: true,
        input,
        hazards,
        timestamp,
      });
    }

    if ((input.balanceLossCount ?? 0) === 1) {
      hazards.push('Single balance instability event observed');
      return this.buildResult({
        state: 'CAUTION',
        trigger: 'REPEATED_LOSS_OF_BALANCE',
        triggerDetail: 'Isolated balance wobble detected. Monitoring stability.',
        statusMessage: 'Caution: Transient balance instability detected. Exercise near stable support if necessary.',
        action: 'Stabilize foot stance before proceeding.',
        isCoachingAllowed: true,
        isProgressionAllowed: false,
        isGamificationAllowed: true,
        isVoiceCoachingAllowed: true,
        input,
        hazards,
        timestamp,
      });
    }

    // -------------------------------------------------------------
    // TIER 4: SAFE (Nominal Operation)
    // -------------------------------------------------------------
    // NOTE: NEVER output "You are safe." Output strict non-certitude text.
    return {
      state: 'SAFE',
      trigger: 'NOMINAL',
      triggerDetail: 'Kinematics and observable signals remain within nominal bounds.',
      statusMessage: this.NOMINAL_SAFE_MESSAGE,
      action: 'Continue nominal exercise execution.',
      isCoachingAllowed: true,
      isProgressionAllowed: true,
      isGamificationAllowed: true,
      isVoiceCoachingAllowed: true,
      flaggedHazards: [],
    };
  }

  /**
   * Helper to construct and record safety events in the session audit log
   */
  private static buildResult(params: {
    state: RehabilitationSafetyState;
    trigger: SafetyTriggerType;
    triggerDetail: string;
    statusMessage: string;
    action: string;
    escalationNotice?: string;
    isCoachingAllowed: boolean;
    isProgressionAllowed: boolean;
    isGamificationAllowed: boolean;
    isVoiceCoachingAllowed: boolean;
    input: SafetyEvaluationInput;
    hazards: string[];
    timestamp: string;
  }): SafetyEvaluationResult {
    const auditEvent: SafetyAuditEvent = {
      timestamp: params.timestamp,
      exercise: params.input.exerciseId,
      trigger: params.trigger,
      triggerDetail: params.triggerDetail,
      state: params.state,
      action: params.action,
      confidence: params.input.trackingConfidence,
    };

    // Automatically preserve STOP and ESCALATE events to the session audit trail
    if (params.state === 'STOP' || params.state === 'ESCALATE') {
      this.recordSafetyEvent(auditEvent);
    }

    return {
      state: params.state,
      trigger: params.trigger,
      triggerDetail: params.triggerDetail,
      statusMessage: params.statusMessage,
      action: params.action,
      escalationNotice: params.escalationNotice,
      isCoachingAllowed: params.isCoachingAllowed,
      isProgressionAllowed: params.isProgressionAllowed,
      isGamificationAllowed: params.isGamificationAllowed,
      isVoiceCoachingAllowed: params.isVoiceCoachingAllowed,
      auditEvent,
      flaggedHazards: params.hazards,
    };
  }

  /**
   * Record a safety audit event in the current active session
   */
  public static recordSafetyEvent(event: SafetyAuditEvent): void {
    // Avoid spamming identical consecutive events within 2 seconds
    const last = this.sessionAuditTrail[this.sessionAuditTrail.length - 1];
    if (
      last &&
      last.trigger === event.trigger &&
      last.state === event.state &&
      Math.abs(new Date(event.timestamp).getTime() - new Date(last.timestamp).getTime()) < 2000
    ) {
      return;
    }
    this.sessionAuditTrail.push(event);
  }

  /**
   * Retrieve all recorded safety events for the active session
   */
  public static getSessionSafetyAudit(): SafetyAuditEvent[] {
    return [...this.sessionAuditTrail];
  }

  /**
   * Clear session safety events upon session reset
   */
  public static clearSessionSafetyAudit(): void {
    this.sessionAuditTrail = [];
  }

  /**
   * Check if any high-risk (STOP or ESCALATE) events occurred during this session
   */
  public static hasSafetyAlerts(): boolean {
    return this.sessionAuditTrail.some((e) => e.state === 'STOP' || e.state === 'ESCALATE');
  }
}
