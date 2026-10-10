/**
 * =====================================================================
 * PHYSIOSIS — REAL-TIME REHABILITATION SAFETY ENGINE QA TEST BENCH
 * =====================================================================
 * Automated verification suite for RehabilitationSafetyEngine (Patch 6).
 *
 * Validates:
 *   1. SAFE state & strict non-certitude text invariant ("No safety concern detected...", NEVER "You are safe.")
 *   2. CAUTION state: tracking degradation, severe compensation, asymmetry > 35°, balance wobble
 *   3. STOP state: velocity > 200°/s, angle overrun > target + 35°, moderate pain (4-6)
 *   4. ESCALATE state: user dizziness, acute pain (>= 7), repeated balance loss (>= 2), distress dropout
 *   5. Priority hierarchy: ESCALATE > STOP > CAUTION > SAFE
 *   6. Orchestrator precedence: Safety overrides AI recommendations, progression & coaching
 *   7. Audit trail integrity & session report preservation
 *   8. Zero medical diagnosis inference across all messages
 */

declare const process: any;

import { RehabilitationSafetyEngine } from '../RehabilitationSafetyEngine';
import { physiosisAIOrchestrator } from '../../ai/PhysiosisAIOrchestrator';
import { buildPhysiosisSession } from '../../session/SessionAnalytics';
import { getDefaultExercise } from '../../exercise/ExerciseRegistry';
import { INITIAL_LIVE_SESSION_STATE } from '../../session/SessionTypes';
import type { LiveSessionState, RepResult } from '../../session/SessionTypes';

interface TestCase {
  name: string;
  fn: () => void;
}

const tests: TestCase[] = [];
let passCount = 0;
let failCount = 0;

function test(name: string, fn: () => void) {
  tests.push({ name, fn });
}

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(`Assertion Failed: ${message}`);
  }
}

// ─────────────────────────────────────────────────────────────────────
// 1. SAFE STATE & STRICT NON-CERTITUDE INVARIANT
// ─────────────────────────────────────────────────────────────────────
test('1. SAFE State: Nominal kinematics output strict non-certitude text', () => {
  RehabilitationSafetyEngine.clearSessionSafetyAudit();
  const res = RehabilitationSafetyEngine.evaluate({
    exerciseId: 'shoulder-flexion',
    trackingConfidence: 0.95,
    currentAngle: 85,
    targetAngle: 165,
    angularVelocity: 25,
    userReportedPain: 0,
    userReportedDizziness: false,
    balanceLossCount: 0,
    severeCompensation: false,
  });

  assert(res.state === 'SAFE', `Expected SAFE, got ${res.state}`);
  assert(
    res.statusMessage === 'No safety concern detected from the signals available to Physiosis.',
    `Expected exact non-certitude string, got: "${res.statusMessage}"`
  );
  // Strictly enforce that "You are safe." is NEVER declared
  assert(
    !res.statusMessage.toLowerCase().includes('you are safe'),
    'Clinical Invariant Violated: System must never say "You are safe."'
  );
  assert(res.isCoachingAllowed === true, 'Coaching should be allowed in SAFE');
  assert(res.isProgressionAllowed === true, 'Progression should be allowed in SAFE');
  assert(res.isGamificationAllowed === true, 'Gamification should be allowed in SAFE');
  assert(res.isVoiceCoachingAllowed === true, 'Voice coaching should be allowed in SAFE');
  assert(res.flaggedHazards.length === 0, 'Zero hazards should be flagged');
});

// ─────────────────────────────────────────────────────────────────────
// 2. CAUTION STATE: DEGRADATION, ASYMMETRY, COMPENSATION & WOBBLE
// ─────────────────────────────────────────────────────────────────────
test('2a. CAUTION State: Tracking confidence < 50% freezes progression', () => {
  const res = RehabilitationSafetyEngine.evaluate({
    exerciseId: 'shoulder-flexion',
    trackingConfidence: 0.38,
    currentAngle: 85,
    targetAngle: 165,
    angularVelocity: 20,
  });

  assert(res.state === 'CAUTION', `Expected CAUTION, got ${res.state}`);
  assert(res.trigger === 'TRACKING_CONFIDENCE_DEGRADED', 'Trigger must be TRACKING_CONFIDENCE_DEGRADED');
  assert(res.isProgressionAllowed === false, 'Progression must be frozen');
  assert(res.isCoachingAllowed === true, 'Coaching must be allowed to help user position in camera');
});

test('2b. CAUTION State: Bilateral asymmetry > 35°', () => {
  const res = RehabilitationSafetyEngine.evaluate({
    exerciseId: 'shoulder-flexion',
    trackingConfidence: 0.92,
    currentAngle: 90,
    targetAngle: 165,
    angularVelocity: 25,
    asymmetryAngle: 42,
  });

  assert(res.state === 'CAUTION', `Expected CAUTION, got ${res.state}`);
  assert(res.trigger === 'UNUSUAL_ASYMMETRY', 'Trigger must be UNUSUAL_ASYMMETRY');
  assert(res.isProgressionAllowed === false, 'Progression must be frozen');
});

test('2c. CAUTION State: Severe trunk compensation detected', () => {
  const res = RehabilitationSafetyEngine.evaluate({
    exerciseId: 'shoulder-flexion',
    trackingConfidence: 0.90,
    currentAngle: 110,
    targetAngle: 165,
    angularVelocity: 30,
    severeCompensation: true,
  });

  assert(res.state === 'CAUTION', `Expected CAUTION, got ${res.state}`);
  assert(res.isProgressionAllowed === false, 'Progression must be frozen');
});

test('2d. CAUTION State: Single balance wobble (loss count = 1)', () => {
  const res = RehabilitationSafetyEngine.evaluate({
    exerciseId: 'squat',
    trackingConfidence: 0.88,
    currentAngle: 60,
    targetAngle: 90,
    angularVelocity: 20,
    balanceLossCount: 1,
  });

  assert(res.state === 'CAUTION', `Expected CAUTION, got ${res.state}`);
  assert(res.isProgressionAllowed === false, 'Progression must be frozen');
});

// ─────────────────────────────────────────────────────────────────────
// 3. STOP STATE: HIGH-RISK VELOCITY, OVERRUN & MODERATE PAIN
// ─────────────────────────────────────────────────────────────────────
test('3a. STOP State: Velocity jerk > 200°/s halts movement', () => {
  RehabilitationSafetyEngine.clearSessionSafetyAudit();
  const res = RehabilitationSafetyEngine.evaluate({
    exerciseId: 'shoulder-flexion',
    trackingConfidence: 0.92,
    currentAngle: 100,
    targetAngle: 165,
    angularVelocity: 245,
  });

  assert(res.state === 'STOP', `Expected STOP, got ${res.state}`);
  assert(res.trigger === 'SUDDEN_MOVEMENT_CHANGE', 'Trigger must be SUDDEN_MOVEMENT_CHANGE');
  assert(
    res.statusMessage === "Please stop this exercise and follow your clinician's instructions.",
    `Expected exact clinical stop message, got "${res.statusMessage}"`
  );
  assert(res.isCoachingAllowed === false, 'Active coaching must be halted');
  assert(res.isProgressionAllowed === false, 'Progression must be halted');
  assert(res.isVoiceCoachingAllowed === false, 'Voice coaching must be halted');
  assert(RehabilitationSafetyEngine.getSessionSafetyAudit().length >= 1, 'STOP event must be recorded in session audit');
});

test('3b. STOP State: Range overrun > target + 35°', () => {
  const res = RehabilitationSafetyEngine.evaluate({
    exerciseId: 'shoulder-flexion',
    trackingConfidence: 0.90,
    currentAngle: 205, // 165 + 40
    targetAngle: 165,
    angularVelocity: 25,
  });

  assert(res.state === 'STOP', `Expected STOP, got ${res.state}`);
  assert(res.trigger === 'EXTREME_DEVIATION', 'Trigger must be EXTREME_DEVIATION');
  assert(
    res.statusMessage === "Please stop this exercise and follow your clinician's instructions.",
    'Expected clinical stop prompt'
  );
  assert(res.isCoachingAllowed === false, 'Coaching must be halted');
});

test('3c. STOP State: Moderate user-reported pain (4 to 6)', () => {
  const res = RehabilitationSafetyEngine.evaluate({
    exerciseId: 'shoulder-flexion',
    trackingConfidence: 0.90,
    currentAngle: 100,
    targetAngle: 165,
    angularVelocity: 20,
    userReportedPain: 5,
  });

  assert(res.state === 'STOP', `Expected STOP, got ${res.state}`);
  assert(res.trigger === 'USER_REPORTED_PAIN', 'Trigger must be USER_REPORTED_PAIN');
  assert(
    res.statusMessage === "Please stop this exercise and follow your clinician's instructions.",
    'Expected clinical stop prompt'
  );
});

// ─────────────────────────────────────────────────────────────────────
// 4. ESCALATE STATE: DIZZINESS, ACUTE PAIN, REPEATED BALANCE LOSS
// ─────────────────────────────────────────────────────────────────────
test('4a. ESCALATE State: User-reported dizziness triggers immediate escalation', () => {
  RehabilitationSafetyEngine.clearSessionSafetyAudit();
  const res = RehabilitationSafetyEngine.evaluate({
    exerciseId: 'shoulder-flexion',
    trackingConfidence: 0.95,
    currentAngle: 80,
    targetAngle: 165,
    angularVelocity: 20,
    userReportedDizziness: true,
  });

  assert(res.state === 'ESCALATE', `Expected ESCALATE, got ${res.state}`);
  assert(res.trigger === 'USER_REPORTED_DIZZINESS', 'Trigger must be USER_REPORTED_DIZZINESS');
  assert(
    res.action.includes('Contact your physiotherapist'),
    `Action must include "Contact your physiotherapist", got: "${res.action}"`
  );
  assert(res.isCoachingAllowed === false, 'Coaching must be suppressed');
  assert(res.isProgressionAllowed === false, 'Progression must be suppressed');
  assert(RehabilitationSafetyEngine.getSessionSafetyAudit().length >= 1, 'ESCALATE event must be recorded in session audit');
});

test('4b. ESCALATE State: Acute pain >= 7/10', () => {
  const res = RehabilitationSafetyEngine.evaluate({
    exerciseId: 'shoulder-flexion',
    trackingConfidence: 0.90,
    currentAngle: 80,
    targetAngle: 165,
    angularVelocity: 20,
    userReportedPain: 8,
  });

  assert(res.state === 'ESCALATE', `Expected ESCALATE, got ${res.state}`);
  assert(res.trigger === 'USER_REPORTED_PAIN', 'Trigger must be USER_REPORTED_PAIN');
  assert(res.action.includes('Contact your physiotherapist'), 'Action must prompt clinician contact');
});

test('4c. ESCALATE State: Repeated loss of balance (>= 2 events)', () => {
  const res = RehabilitationSafetyEngine.evaluate({
    exerciseId: 'single-leg-stance',
    trackingConfidence: 0.90,
    currentAngle: 75,
    targetAngle: 90,
    angularVelocity: 20,
    balanceLossCount: 2,
  });

  assert(res.state === 'ESCALATE', `Expected ESCALATE, got ${res.state}`);
  assert(res.trigger === 'REPEATED_LOSS_OF_BALANCE', 'Trigger must be REPEATED_LOSS_OF_BALANCE');
  assert(res.action.includes('Contact your physiotherapist'), 'Action must prompt clinician contact');
});

test('4d. ESCALATE State: Distress session interruption', () => {
  const res = RehabilitationSafetyEngine.evaluate({
    exerciseId: 'shoulder-flexion',
    trackingConfidence: 0.85,
    currentAngle: 80,
    targetAngle: 165,
    angularVelocity: 15,
    sessionInterrupted: true,
  });

  assert(res.state === 'ESCALATE', `Expected ESCALATE, got ${res.state}`);
  assert(res.trigger === 'SESSION_INTERRUPTION', 'Trigger must be SESSION_INTERRUPTION');
});

// ─────────────────────────────────────────────────────────────────────
// 5. PRIORITY HIERARCHY OVERRIDE
// ─────────────────────────────────────────────────────────────────────
test('5. Clinical Priority Override: ESCALATE > STOP > CAUTION > SAFE', () => {
  // ESCALATE overrides STOP (e.g. user dizzy AND moving at 250°/s)
  const dizzyAndJerky = RehabilitationSafetyEngine.evaluate({
    exerciseId: 'shoulder-flexion',
    trackingConfidence: 0.90,
    currentAngle: 90,
    targetAngle: 165,
    angularVelocity: 250,
    userReportedDizziness: true,
  });
  assert(dizzyAndJerky.state === 'ESCALATE', `Expected ESCALATE to override STOP, got ${dizzyAndJerky.state}`);

  // STOP overrides CAUTION (e.g. degraded tracking AND velocity jerk)
  const degradedAndJerky = RehabilitationSafetyEngine.evaluate({
    exerciseId: 'shoulder-flexion',
    trackingConfidence: 0.30, // would be CAUTION
    currentAngle: 90,
    targetAngle: 165,
    angularVelocity: 230, // STOP
  });
  assert(degradedAndJerky.state === 'STOP', `Expected STOP to override CAUTION, got ${degradedAndJerky.state}`);

  // CAUTION overrides SAFE
  const degradedNominal = RehabilitationSafetyEngine.evaluate({
    exerciseId: 'shoulder-flexion',
    trackingConfidence: 0.40, // CAUTION
    currentAngle: 80,
    targetAngle: 165,
    angularVelocity: 20,
  });
  assert(degradedNominal.state === 'CAUTION', `Expected CAUTION to override SAFE, got ${degradedNominal.state}`);
});

// ─────────────────────────────────────────────────────────────────────
// 6. ORCHESTRATOR PRECEDENCE & RECOMMENDATION OVERRIDE
// ─────────────────────────────────────────────────────────────────────
test('6. AI Orchestrator: Safety executes first & overrides coaching, recommendations and progression', () => {
  const exercise = getDefaultExercise();
  const session: LiveSessionState = {
    ...INITIAL_LIVE_SESSION_STATE,
    isActive: true,
    sessionState: 'ACTIVE',
  };

  // Case A: High velocity jerk in orchestrator input
  const aiStateStop = physiosisAIOrchestrator.orchestrate({
    landmarks: Array.from({ length: 33 }, () => ({ x: 0.5, y: 0.5, z: 0, visibility: 0.9 })),
    activeExercise: exercise,
    sessionState: session,
    isStreaming: true,
    currentAngle: 90,
    angularVelocity: 260, // Excessive velocity
  });

  assert(aiStateStop.safetyState.rehabilitationSafetyState === 'STOP', 'Safety state must be STOP');
  assert(aiStateStop.safetyState.isCoachingAllowed === false, 'Coaching must not be allowed');
  assert(aiStateStop.safetyState.isProgressionAllowed === false, 'Progression must not be allowed');
  assert(aiStateStop.recommendedProtocol.recommendationSource === 'SAFETY_OVERRIDE', 'Recommendation must be overridden by safety');
  assert(
    aiStateStop.guidance.primaryInstruction === "Please stop this exercise and follow your clinician's instructions.",
    `Guidance must be clinical stop prompt, got: "${aiStateStop.guidance.primaryInstruction}"`
  );
  assert(
    aiStateStop.guidance.voiceCue === "Please stop this exercise and follow your clinician's instructions.",
    'Voice cue must be clinical stop prompt'
  );

  // Case B: Escalation (Dizziness) in orchestrator input
  const aiStateEscalate = physiosisAIOrchestrator.orchestrate({
    landmarks: Array.from({ length: 33 }, () => ({ x: 0.5, y: 0.5, z: 0, visibility: 0.9 })),
    activeExercise: exercise,
    sessionState: session,
    isStreaming: true,
    currentAngle: 90,
    userReportedDizziness: true,
  });

  assert(aiStateEscalate.safetyState.rehabilitationSafetyState === 'ESCALATE', 'Safety state must be ESCALATE');
  assert(aiStateEscalate.escalation.requiresClinicianReview === true, 'Escalation requires clinician review');
  assert(
    aiStateEscalate.guidance.primaryInstruction.includes('Contact your physiotherapist'),
    'Guidance must include Contact your physiotherapist'
  );
});

// ─────────────────────────────────────────────────────────────────────
// 7. AUDIT TRAIL INTEGRITY & SESSION REPORT PRESERVATION
// ─────────────────────────────────────────────────────────────────────
test('7. Audit Trail Integrity: Preserves events in finalized session report', () => {
  RehabilitationSafetyEngine.clearSessionSafetyAudit();
  assert(RehabilitationSafetyEngine.getSessionSafetyAudit().length === 0, 'Audit should be empty initially');

  // Trigger a STOP event
  RehabilitationSafetyEngine.evaluate({
    exerciseId: 'shoulder-flexion',
    trackingConfidence: 0.95,
    currentAngle: 90,
    targetAngle: 165,
    angularVelocity: 220,
  });

  const auditEvents = RehabilitationSafetyEngine.getSessionSafetyAudit();
  assert(auditEvents.length === 1, `Expected 1 audit event, got ${auditEvents.length}`);
  assert(auditEvents[0].state === 'STOP', 'Event state must be STOP');
  assert(auditEvents[0].trigger === 'SUDDEN_MOVEMENT_CHANGE', 'Event trigger must be SUDDEN_MOVEMENT_CHANGE');
  assert(auditEvents[0].action.length > 0, 'Event action must be recorded');
  assert(auditEvents[0].timestamp.length > 0, 'Event timestamp must be recorded');
  assert(RehabilitationSafetyEngine.hasSafetyAlerts() === true, 'hasSafetyAlerts must be true');

  // Construct a finalized session report and verify audit attachment
  const dummyRep: RepResult = {
    repNumber: 1,
    peakAngle: 110,
    targetAngle: 165,
    romPercentage: 66,
    deviation: 55,
    qualityScore: 70,
    limitationDetected: true,
    severity: 30,
    statusLabel: 'Limited',
    improvementFromPrevious: null,
    improvementPercentage: null,
    improvementStatus: 'FIRST_REP',
    timestampMs: Date.now(),
  };

  const dummyLiveState: LiveSessionState = {
    ...INITIAL_LIVE_SESSION_STATE,
    isActive: false,
    sessionState: 'COMPLETED',
    repHistory: [dummyRep],
    metrics: {
      ...INITIAL_LIVE_SESSION_STATE.metrics,
      completedReps: 1,
      bestROM: 110,
      averageROM: 110,
    },
  };

  const finalSession = buildPhysiosisSession(dummyLiveState, 'Shoulder Flexion', 'shoulder-flexion');
  assert(finalSession !== null, 'Session must build successfully');
  assert(finalSession!.safetyAuditEvents !== undefined, 'Final session must preserve safetyAuditEvents');
  assert(finalSession!.safetyAuditEvents!.length === 1, 'Final session must contain 1 safety audit event');
  assert(
    finalSession!.safetyNotice?.includes("clinician's instructions") === true,
    'Final session must include safetyNotice'
  );
});

// ─────────────────────────────────────────────────────────────────────
// 8. STRICT NON-DIAGNOSTIC COMPLIANCE
// ─────────────────────────────────────────────────────────────────────
test('8. Non-Diagnostic Invariant: Zero medical diagnoses inferred across safety engine', () => {
  const disallowedTerms = [
    'acl tear',
    'rotator cuff tear',
    'frozen shoulder',
    'impingement syndrome',
    'scoliosis',
    'herniated disc',
    'bursitis',
    'tendonitis',
    'fracture',
    'diagnosed',
  ];

  const inputs = [
    { exerciseId: 'shoulder-flexion', trackingConfidence: 0.95, currentAngle: 85, targetAngle: 165, angularVelocity: 25 },
    { exerciseId: 'shoulder-flexion', trackingConfidence: 0.35, currentAngle: 85, targetAngle: 165, angularVelocity: 25 },
    { exerciseId: 'shoulder-flexion', trackingConfidence: 0.95, currentAngle: 100, targetAngle: 165, angularVelocity: 220 },
    { exerciseId: 'shoulder-flexion', trackingConfidence: 0.95, currentAngle: 80, targetAngle: 165, angularVelocity: 20, userReportedDizziness: true },
    { exerciseId: 'shoulder-flexion', trackingConfidence: 0.95, currentAngle: 80, targetAngle: 165, angularVelocity: 20, userReportedPain: 8 },
  ];

  for (const inp of inputs) {
    const res = RehabilitationSafetyEngine.evaluate(inp);
    const corpus = `${res.statusMessage} ${res.action} ${res.triggerDetail} ${res.escalationNotice || ''}`.toLowerCase();
    for (const term of disallowedTerms) {
      assert(
        !corpus.includes(term),
        `Non-Diagnostic Invariant Violated: Found medical diagnosis term "${term}" in output: "${corpus}"`
      );
    }
  }
});

// ─────────────────────────────────────────────────────────────────────
// EXECUTE TEST BENCH
// ─────────────────────────────────────────────────────────────────────
console.log('=====================================================================');
console.log('  PHYSIOSIS REHABILITATION SAFETY ENGINE VERIFICATION (PATCH 6)');
console.log('=====================================================================\n');

for (const t of tests) {
  try {
    t.fn();
    console.log(`  [PASS] ${t.name}`);
    passCount++;
  } catch (err: any) {
    console.error(`  [FAIL] ${t.name}`);
    console.error(`         ${err.message}`);
    failCount++;
  }
}

console.log('\n=====================================================================');
console.log(`  TEST RESULTS: ${passCount} Passed, ${failCount} Failed (Total: ${tests.length})`);
console.log('=====================================================================\n');

if (failCount > 0) {
  process.exit(1);
} else {
  console.log('>>> All Real-Time Rehabilitation Safety QA tests passed successfully! <<<\n');
}
