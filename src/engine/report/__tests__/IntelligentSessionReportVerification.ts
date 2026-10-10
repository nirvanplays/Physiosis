/**
 * IntelligentSessionReportVerification.ts
 * PHYSIOSIS — AI REPORT PATCH 12
 * INTELLIGENT SESSION REPORT GENERATION & TELEMETRY VERIFICATION TEST SUITE
 *
 * Verifies:
 *   1. 7-Section Clinical Report Structure:
 *      - 1. Session Summary (exercise, duration, repetitions, best ROM, average ROM)
 *      - 2. Movement Quality (quality score, consistency, symmetry, velocity quality)
 *      - 3. Compensation Analysis (trunk lean, shoulder hike, knee valgus, other detected compensations)
 *      - 4. Progress (current vs baseline, current vs reference, trend)
 *      - 5. Guidance (what to focus on next, actionable cues, corrective drill)
 *      - 6. Safety (any safety events, hazards, status message)
 *      - 7. Escalation (whether clinician review is recommended, urgency, reason, prompt)
 *   2. Strict Non-Diagnostic & Objective Biomechanical Terminology:
 *      - Zero claims of "diagnosis", "medical prognosis", "recovery certainty", "cured".
 *   3. Automated Telemetry Number Verifier:
 *      - Compares report against raw session telemetry.
 *      - Asserts 0 discrepancies on grounded narrative.
 *      - Catches and flags injected numerical hallucinations.
 *   4. Specific Compensation Fault Detection:
 *      - Trunk lean, shoulder hike, knee valgus detection and measured values.
 *   5. Clinical Escalation Rules:
 *      - Safety STOP / ESCALATE triggers prompt escalation.
 *      - Declining trend triggers routine review recommendation.
 *      - Nominal safe performance triggers routine home rehabilitation.
 */

import { IntelligentReportEngine } from '../IntelligentReportEngine';
import type { PhysiosisSession, RepResult } from '../../session/SessionTypes';
import type { PatientRehabilitationState } from '../../state/PatientRehabilitationState';
import type { ExerciseBaseline } from '../../ai/baseline/PatientBaselineTypes';

declare const process: any;

let testsPassed = 0;
let testsFailed = 0;

function assert(condition: boolean, message: string) {
  if (!condition) {
    testsFailed++;
    console.error(`  FAIL: ${message}`);
    throw new Error(message);
  }
  testsPassed++;
  console.log(`  PASS: ${message}`);
}

async function test(name: string, fn: () => void | Promise<void>) {
  console.log(`\n--- Test: ${name} ---`);
  try {
    const result = fn();
    if (result instanceof Promise) {
      await result;
    }
  } catch (err: any) {
    console.error(`Test failed with error: ${err.message}`);
  }
}

// ── FIXTURES ────────────────────────────────────────────────────────────────
function createRep(repNumber: number, peakAngle: number, qualityScore = 88, compensations: string[] = []): RepResult {
  return {
    repNumber,
    peakAngle,
    targetAngle: 165,
    romPercentage: Math.round((peakAngle / 165) * 100),
    deviation: Math.max(0, 165 - peakAngle),
    qualityScore,
    limitationDetected: peakAngle < 165,
    severity: peakAngle < 165 ? 20 : 0,
    statusLabel: peakAngle >= 165 ? 'Target reached' : peakAngle >= 140 ? 'Near target' : 'Limited',
    detectedCompensations: compensations,
    improvementFromPrevious: null,
    improvementPercentage: null,
    improvementStatus: 'none',
    timestampMs: Date.now(),
  } as unknown as RepResult;
}

function createSampleSession(overrides: Partial<PhysiosisSession> = {}): PhysiosisSession {
  const reps = [
    createRep(1, 120, 82),
    createRep(2, 128, 85),
    createRep(3, 134, 88),
    createRep(4, 136, 90),
  ];

  return {
    id: 'test-session-12',
    patientId: 'patient-402',
    startedAt: 1726000000000,
    endedAt: 1726000180000,
    durationSeconds: 180,
    totalReps: 4,
    bestROM: 136,
    averageROM: 130,
    firstRepROM: 120,
    lastRepROM: 136,
    improvementDegrees: 16,
    averageScore: 86,
    bestScore: 90,
    averageDeviation: 0,
    limitationsDetected: 4,
    exercise: 'Shoulder Flexion',
    exerciseId: 'shoulder-flexion',
    endedReason: 'manual',
    isUnsaved: false,
    reps,
    compensationsCount: 0,
    averagePosturalScore: 92,
    safetyAuditEvents: [],
    ...overrides,
  } as unknown as PhysiosisSession;
}

function createSampleBaseline(): ExerciseBaseline {
  return {
    exerciseId: 'shoulder-flexion',
    typicalROM: 125,
    repConsistency: 85,
    symmetry: 90,
  } as unknown as ExerciseBaseline;
}

function createSamplePatientState(safetyState: 'SAFE' | 'CAUTION' | 'STOP' | 'ESCALATE' = 'SAFE'): PatientRehabilitationState {
  return {
    currentExercise: {
      value: { id: 'shoulder-flexion', name: 'Shoulder Flexion', targetAngle: 165, minTargetAngle: 90, maxTargetAngle: 175, holdDuration: 2 } as any,
      source: 'registry',
      confidence: 1.0,
      timestamp: Date.now(),
    },
    laterality: { value: 'right', source: 'protocol', confidence: 1.0, timestamp: Date.now() },
    currentROM: { value: 136, source: 'Kinematics', confidence: 0.95, timestamp: Date.now() },
    targetROM: { value: 165, source: 'protocol', confidence: 1.0, timestamp: Date.now() },
    quality: {
      value: { score: 86, stability: 85, symmetry: 90, velocityQuality: 'OPTIMAL', angularVelocity: 22, movementPhase: 'active' } as any,
      source: 'Temporal',
      confidence: 0.9,
      timestamp: Date.now(),
    },
    compensation: {
      value: {
        detected: false,
        activeFaultsCount: 0,
        primaryFault: null,
        severity: 'NONE',
        compensations: [],
        activeCompensatingJoints: [],
      },
      source: 'Pose',
      confidence: 0.9,
      timestamp: Date.now(),
    },
    symptoms: {
      value: { painScore: 1, dizzinessReported: false, balanceLossCount: 0, sessionInterrupted: false },
      source: 'Self-Report',
      confidence: 1.0,
      timestamp: Date.now(),
    },
    confidence: {
      value: { trackingConfidence: 94, biomechanicalConfidence: 92, isReliable: true, degradationReason: null, pipelineSource: 'MediaPipe' },
      source: 'Ensemble',
      confidence: 0.94,
      timestamp: Date.now(),
    },
    baseline: {
      value: {
        status: 'BASELINE_AVAILABLE',
        typicalROM: 125,
        medianROM: 124,
        bestROM: 130,
        deltaVsBaseline: 11,
        repConsistency: 85,
        compensationFrequency: 0,
        comparisonStatement: 'Progressing well',
      },
      source: 'History',
      confidence: 0.88,
      timestamp: Date.now(),
    },
    trend: {
      value: { trend: 'improving', slopeDegreesPerSession: 1.2, qualifyingSessionCount: 5 },
      source: 'Statistical',
      confidence: 0.9,
      timestamp: Date.now(),
    },
    safety: {
      value: {
        level: safetyState === 'SAFE' ? 'SAFE' : 'CAUTION',
        rehabilitationSafetyState: safetyState,
        isSafe: safetyState === 'SAFE',
        isCoachingAllowed: safetyState !== 'STOP',
        isProgressionAllowed: safetyState === 'SAFE',
        isGamificationAllowed: true,
        isVoiceCoachingAllowed: true,
        statusMessage: safetyState === 'SAFE' ? 'Safe movement parameters maintained.' : 'Safety limitation active.',
        action: 'CONTINUE',
        flaggedHazards: safetyState !== 'SAFE' ? ['Excessive compensatory strain'] : [],
        disclaimer: 'Clinical safety monitoring',
      } as any,
      source: 'SafetyGuard',
      confidence: 0.98,
      timestamp: Date.now(),
    },
    recommendation: {
      value: {
        recommendedExerciseId: 'shoulder-flexion',
        recommendedExerciseName: 'Shoulder Flexion',
        reason: 'Target progression',
        difficulty: 'SAME',
        progressionStage: 'SAME',
        recommendationSource: 'BIOMECHANICAL',
        explanation: {} as any,
        sets: 3,
        repetitions: 10,
        holdDuration: 2,
        rest: 30,
      } as any,
      source: 'ClinicalRules',
      confidence: 0.92,
      timestamp: Date.now(),
    },
    nextAction: {
      value: { action: 'CONTINUE', targetRep: 5, message: 'Repeat rep' } as any,
      source: 'SessionController',
      confidence: 1.0,
      timestamp: Date.now(),
    },
  };
}

async function runReportVerificationSuite() {
  console.log('===============================================================');
  console.log('PHYSIOSIS — PATCH 12: INTELLIGENT SESSION REPORT VERIFICATION');
  console.log('===============================================================');

  // ── TEST 1: 7-SECTION CLINICAL STRUCTURE ──────────────────────────────────
  await test('1. 7-Section Clinical Report Structure Completeness', () => {
    const session = createSampleSession();
    const baseline = createSampleBaseline();
    const patientState = createSamplePatientState();

    const report = IntelligentReportEngine.buildStructuredReportData(session, patientState, baseline);

    // 1. Session Summary
    assert(report.sessionSummary !== undefined, 'Section 1 (Session Summary) exists');
    assert(report.sessionSummary.exercise === 'Shoulder Flexion', 'Summary exercise is correct');
    assert(report.sessionSummary.durationSeconds === 180, 'Summary durationSeconds matches session');
    assert(report.sessionSummary.repetitions === 4, 'Summary repetitions match completed reps');
    assert(report.sessionSummary.bestROM === 136, 'Summary bestROM matches session peak');
    assert(report.sessionSummary.averageROM === 130, 'Summary averageROM matches session average');
    assert(report.sessionSummary.targetAngle === 165, 'Summary targetAngle matches reference target');

    // 2. Movement Quality
    assert(report.movementQuality !== undefined, 'Section 2 (Movement Quality) exists');
    assert(typeof report.movementQuality.qualityScore === 'number', 'Quality score is numeric');
    assert(report.movementQuality.consistency === 85, 'Consistency is tracked from baseline/state');
    assert(report.movementQuality.symmetry === 90, 'Symmetry index is tracked');
    assert(report.movementQuality.velocityQuality === 'OPTIMAL', 'Velocity quality is populated');

    // 3. Compensation Analysis
    assert(report.compensationAnalysis !== undefined, 'Section 3 (Compensation Analysis) exists');
    assert(report.compensationAnalysis.trunkLean !== undefined, 'Trunk lean fault analysis exists');
    assert(report.compensationAnalysis.shoulderHike !== undefined, 'Shoulder hike fault analysis exists');
    assert(report.compensationAnalysis.kneeValgus !== undefined, 'Knee valgus fault analysis exists');
    assert(Array.isArray(report.compensationAnalysis.otherDetectedCompensations), 'Other compensations array exists');
    assert(report.compensationAnalysis.integrityScore === 92, 'Postural integrity score matches session');

    // 4. Progress
    assert(report.progress !== undefined, 'Section 4 (Progress) exists');
    assert(report.progress.currentROM === 136, 'Progress currentROM matches bestROM');
    assert(report.progress.baselineROM === 125, 'Progress baselineROM matches baseline');
    assert(report.progress.deltaVsBaseline === 11, 'Progress deltaVsBaseline is calculated correctly (+11°)');
    assert(report.progress.referenceTarget === 165, 'Progress referenceTarget is correct');
    assert(report.progress.trend === 'improving', 'Progress trend matches patientState');

    // 5. Guidance
    assert(report.guidance !== undefined, 'Section 5 (Guidance) exists');
    assert(typeof report.guidance.focusNext === 'string' && report.guidance.focusNext.length > 10, 'Focus next guidance is provided');
    assert(Array.isArray(report.guidance.actionableCues) && report.guidance.actionableCues.length >= 3, 'At least 3 actionable form cues provided');

    // 6. Safety
    assert(report.safety !== undefined, 'Section 6 (Safety) exists');
    assert(report.safety.safetyLevel === 'SAFE', 'Safety level reflects SAFE state');
    assert(report.safety.isSafe === true, 'Safety isSafe is true');
    assert(typeof report.safety.statusMessage === 'string', 'Safety status message is provided');

    // 7. Escalation
    assert(report.escalation !== undefined, 'Section 7 (Escalation) exists');
    assert(report.escalation.recommended === false, 'Nominal session does not require clinical escalation');
    assert(report.escalation.urgency === 'NONE', 'Escalation urgency is NONE for nominal session');
    assert(typeof report.escalation.prompt === 'string', 'Escalation prompt guidance is provided');
  });

  // ── TEST 2: GROUNDED NARRATIVE & NON-DIAGNOSTIC INVARIANT ─────────────────
  await test('2. Grounded Narrative Generation & Non-Diagnostic Language Invariant', () => {
    const session = createSampleSession();
    const baseline = createSampleBaseline();
    const patientState = createSamplePatientState();

    const data = IntelligentReportEngine.buildStructuredReportData(session, patientState, baseline);
    const narrative = IntelligentReportEngine.generateGroundedNarrative(data);

    assert(typeof narrative === 'string' && narrative.length > 50, 'Narrative generated successfully');
    assert(narrative.includes('4 repetitions'), 'Narrative mentions exact repetitions count (4)');
    assert(narrative.includes('136°'), 'Narrative mentions exact best ROM (136°)');
    assert(narrative.includes('130°'), 'Narrative mentions exact average ROM (130°)');
    assert(narrative.includes('165°'), 'Narrative mentions exact reference target (165°)');
    assert(narrative.includes('125°'), 'Narrative mentions exact baseline (125°)');

    // Check non-diagnostic language rules
    const lower = narrative.toLowerCase();
    assert(!lower.includes('diagnosis') && !lower.includes('diagnose'), 'Narrative does not contain "diagnosis"');
    assert(!lower.includes('prognosis'), 'Narrative does not contain "prognosis"');
    assert(!lower.includes('recovery certainty'), 'Narrative does not claim recovery certainty');
    assert(!lower.includes('cured'), 'Narrative does not claim "cured"');
    assert(!lower.includes('torn') && !lower.includes('tear'), 'Narrative does not diagnose structural tears');
  });

  // ── TEST 3: TELEMETRY NUMBER VERIFICATION (GROUND TRUTH COMPLIANCE) ───────
  await test('3. Telemetry Number Verifier (Zero Discrepancies on Grounded Data)', () => {
    const session = createSampleSession();
    const baseline = createSampleBaseline();
    const patientState = createSamplePatientState();

    const data = IntelligentReportEngine.buildStructuredReportData(session, patientState, baseline);
    const narrative = IntelligentReportEngine.generateGroundedNarrative(data);

    const verification = IntelligentReportEngine.verifyReportNumbers(narrative, data);

    assert(verification.isValid === true, 'Verification passes on grounded narrative');
    assert(verification.discrepanciesCount === 0, 'Discrepancy count is exactly 0');
    assert(verification.discrepancies.length === 0, 'No discrepancies recorded');
    assert(verification.verificationStatement.includes('0 numerical discrepancies'), 'Verification statement confirms 0 discrepancies');
  });

  // ── TEST 4: DETECTION OF INJECTED NUMERICAL HALLUCINATIONS ────────────────
  await test('4. Automated Discrepancy Detection on Injected Hallucinated Numbers', () => {
    const session = createSampleSession();
    const baseline = createSampleBaseline();
    const patientState = createSamplePatientState();

    const data = IntelligentReportEngine.buildStructuredReportData(session, patientState, baseline);

    // Inject fake hallucinated numbers: 179° ROM (when best was 136°) and 499 seconds (when duration was 180s)
    const hallucinatedNarrative = 'During this 499s session, 4 repetitions of Shoulder Flexion were completed. Your best observed range of motion was 179° with average 130°.';

    const verification = IntelligentReportEngine.verifyReportNumbers(hallucinatedNarrative, data);

    assert(verification.isValid === false, 'Verifier successfully flags hallucinated narrative as invalid');
    assert(verification.discrepanciesCount > 0, 'Discrepancy count is greater than 0');
    assert(
      verification.discrepancies.some((d) => d.found === 179 || d.found === 499),
      'Verifier specifically caught the hallucinated numbers (179 or 499)'
    );
  });

  // ── TEST 5: SPECIFIC COMPENSATION FAULT TRACKING ───────────────────────────
  await test('5. Specific Compensation Fault Detection (Trunk Lean, Shoulder Hike, Knee Valgus)', () => {
    const sessionWithFaults = createSampleSession({
      compensationsCount: 2,
      reps: [
        createRep(1, 120, 75, ['Trunk lateral lean']),
        createRep(2, 125, 78, ['Shoulder hiking']),
      ],
    });

    const patientStateWithComp = createSamplePatientState();
    patientStateWithComp.compensation.value = {
      detected: true,
      activeFaultsCount: 2,
      primaryFault: 'Trunk Lateral Flexion',
      severity: 'MILD',
      compensations: [
        {
          type: 'TRUNK_LEAN',
          name: 'Trunk Lateral Flexion',
          severity: 'MILD',
          jointKeys: ['midHip', 'neck'],
          measuredValue: 14,
          unit: '°',
          clinicalCue: 'Maintain upright torso.',
        },
        {
          type: 'SHOULDER_HIKE',
          name: 'Shoulder Hiking',
          severity: 'MILD',
          jointKeys: ['leftShoulder', 'rightShoulder'],
          measuredValue: 22,
          unit: 'mm',
          clinicalCue: 'Keep shoulders depressed.',
        },
      ],
      activeCompensatingJoints: ['midHip', 'leftShoulder'],
    };

    const report = IntelligentReportEngine.buildStructuredReportData(sessionWithFaults, patientStateWithComp);

    // Trunk lean checks
    assert(report.compensationAnalysis.trunkLean.detected === true, 'Trunk lean was detected');
    assert(report.compensationAnalysis.trunkLean.measuredValue === 14, 'Trunk lean measured value is 14°');
    assert(report.compensationAnalysis.trunkLean.severity === 'MILD', 'Trunk lean severity is MILD');

    // Shoulder hike checks
    assert(report.compensationAnalysis.shoulderHike.detected === true, 'Shoulder hike was detected');
    assert(report.compensationAnalysis.shoulderHike.measuredValue === 22, 'Shoulder hike measured value is 22mm');
    assert(report.compensationAnalysis.shoulderHike.severity === 'MILD', 'Shoulder hike severity is MILD');

    // Knee valgus checks
    assert(report.compensationAnalysis.kneeValgus.detected === false, 'Knee valgus was not detected in shoulder exercise');
    assert(report.compensationAnalysis.totalCompensationsCount === 2, 'Total compensations count is 2');
    assert(report.guidance.correctiveDrill !== null, 'Corrective drill is recommended for detected compensation');
  });

  // ── TEST 6: CLINICAL ESCALATION RULES ──────────────────────────────────────
  await test('6. Clinical Escalation Decision Engine (Safe, Declining, and Protective Stop)', () => {
    const session = createSampleSession();

    // 1. Nominal SAFE session
    const safeState = createSamplePatientState('SAFE');
    const safeReport = IntelligentReportEngine.buildStructuredReportData(session, safeState);
    assert(safeReport.escalation.recommended === false, 'Safe session does not recommend escalation');
    assert(safeReport.escalation.urgency === 'NONE', 'Safe session urgency is NONE');

    // 2. Declining Trend session
    const decliningState = createSamplePatientState('SAFE');
    decliningState.trend.value.trend = 'declining';
    const decliningReport = IntelligentReportEngine.buildStructuredReportData(session, decliningState);
    assert(decliningReport.escalation.recommended === true, 'Declining trend recommends clinical review');
    assert(decliningReport.escalation.urgency === 'ROUTINE', 'Declining trend urgency is ROUTINE');
    assert(decliningReport.escalation.reason?.includes('downward trend') === true, 'Reason mentions downward trend');

    // 3. Safety ESCALATE trigger
    const escalateState = createSamplePatientState('ESCALATE');
    const escalateReport = IntelligentReportEngine.buildStructuredReportData(session, escalateState);
    assert(escalateReport.escalation.recommended === true, 'Safety ESCALATE state triggers clinical review');
    assert(escalateReport.escalation.urgency === 'PROMPT', 'Safety ESCALATE urgency is PROMPT');
    assert(escalateReport.escalation.reason?.includes('safety escalation') === true, 'Reason identifies safety escalation');
  });

  // ── TEST 7: GROUNDED REPORT GENERATION & TELEMETRY FALLBACK ───────────────
  await test('7. Grounded Report Generation & Discrepancy-Free Invariant', () => {
    const session = createSampleSession();
    const patientState = createSamplePatientState();

    const reportResult = IntelligentReportEngine.generateReport(session, patientState);

    assert(reportResult.structuredData !== undefined, 'Report structured data produced');
    assert(typeof reportResult.narrativeSummary === 'string' && reportResult.narrativeSummary.length > 30, 'Report narrative returned');
    assert(reportResult.verification !== undefined, 'Report verification result returned');
    assert(reportResult.verification.isValid === true, 'Returned narrative is verified with 0 discrepancies');
    assert(reportResult.verification.discrepanciesCount === 0, 'Zero numerical discrepancies allowed in served report');
    assert(reportResult.source === 'DETERMINISTIC_GROUNDED', 'Report source is deterministic grounded');
  });

  console.log('\n===============================================================');
  console.log(`SUMMARY: ${testsPassed} passed, ${testsFailed} failed`);
  console.log('===============================================================');

  if (testsFailed > 0) {
    process.exit(1);
  }
}

runReportVerificationSuite();
