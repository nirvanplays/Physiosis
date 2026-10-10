/**
 * AdaptiveProgressionVerification.ts
 * PHYSIOSIS — ADAPTIVE REHABILITATION PATCH 10
 * SAFE DIFFICULTY PROGRESSION VERIFICATION TEST SUITE
 *
 * Verifies:
 *   1. Safety state absolute override:
 *      - CAUTION: Progression frozen (no SLIGHTLY_ADVANCED).
 *      - STOP: Progression halted (REST/REVIEW).
 *      - ESCALATE: Automated progression stopped (REST/REVIEW).
 *   2. Exercise-specific boundary enforcement:
 *      - Clamping at maxTargetAngle, minTargetAngle, maxRepetitions, minRepetitions, maxHold.
 *      - Zero arbitrary targets invented.
 *   3. Difficulty tier outcomes:
 *      - SLIGHTLY_ADVANCED, EASIER, SAME, REST/REVIEW.
 *   4. Patient-facing communication standards:
 *      - "Your next exercise session can continue at the current reference level."
 *      - Zero treatment claims ("Treatment increased").
 *   5. Explainable AI structure & developer trace:
 *      - Observation, evidence, contributing factors, patient view, developer audit trace.
 */

import { AdaptiveProgressionEngine, EXERCISE_PROGRESSION_BOUNDARIES } from '../AdaptiveProgressionEngine';
import type { AdaptiveProgressionInput } from '../ProgressionTypes';

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

function test(name: string, fn: () => void) {
  console.log(`\n--- Test: ${name} ---`);
  try {
    fn();
  } catch (err: any) {
    console.error(`Test failed with error: ${err.message}`);
  }
}

// ── FIXTURES ────────────────────────────────────────────────────────────────
const BASE_NOMINAL_INPUT: AdaptiveProgressionInput = {
  exerciseId: 'shoulder_flexion',
  exerciseName: 'Shoulder Flexion',
  recentPerformance: {
    completedReps: 10,
    targetReps: 10,
    currentAngle: 165,
    peakAngle: 165,
    averageAngle: 162,
    targetAngle: 165,
    romPercentage: 100,
    isSessionComplete: true,
  },
  historicalBaseline: {
    status: 'BASELINE_AVAILABLE',
    typicalROM: 163,
    medianROM: 164,
    bestROM: 168,
    repConsistency: 88,
    compensationFrequency: 5,
    qualifyingSessionsCount: 4,
  },
  quality: {
    score: 88,
    stability: 85,
    symmetry: 92,
    velocityQuality: 'OPTIMAL',
  },
  consistency: 88,
  compensationRate: {
    frequency: 5,
    detected: false,
    activeFaultsCount: 0,
    severity: 'NONE',
  },
  confidence: {
    trackingConfidence: 94,
    biomechanicalConfidence: 92,
    isReliable: true,
  },
  safetyState: {
    level: 'SAFE',
    isProgressionAllowed: true,
    flaggedHazards: [],
  },
  currentDosage: {
    targetAngle: 165,
    repetitions: 10,
    sets: 3,
    holdDuration: 2,
    rest: 60,
  },
};

// ============================================================================
// TEST SUITE 1: SAFETY STATE OVERRIDES PROGRESSION (RULE 1)
// ============================================================================
test('1a. Safety State ESCALATE stops automated progression and sets REST/REVIEW', () => {
  const input: AdaptiveProgressionInput = {
    ...BASE_NOMINAL_INPUT,
    safetyState: {
      level: 'ESCALATE',
      isProgressionAllowed: false,
      flaggedHazards: ['USER_REPORTED_SEVERE_PAIN'],
      triggerDetail: 'Patient reported acute shoulder pain (NRS 8/10)',
    },
  };

  const res = AdaptiveProgressionEngine.evaluate(input);

  assert(res.nextSessionDifficulty === 'REST/REVIEW', 'ESCALATE must set difficulty to REST/REVIEW');
  assert(res.safetyOverrideApplied === true, 'Safety override must be marked as true');
  assert(res.patientMessage.includes('clinical review'), 'Patient message must recommend clinical review');
  assert(!res.patientMessage.includes('Treatment increased'), 'Forbidden message "Treatment increased" must not appear');
  assert(res.adaptedParameters.targetAngle === 165, 'Target angle must not advance during ESCALATE');
});

test('1b. Safety State STOP halts progression and sets REST/REVIEW', () => {
  const input: AdaptiveProgressionInput = {
    ...BASE_NOMINAL_INPUT,
    safetyState: {
      level: 'STOP',
      isProgressionAllowed: false,
      flaggedHazards: ['REPEATED_LOSS_OF_BALANCE'],
      triggerDetail: 'Repeated balance loss detected',
    },
  };

  const res = AdaptiveProgressionEngine.evaluate(input);

  assert(res.nextSessionDifficulty === 'REST/REVIEW', 'STOP must set difficulty to REST/REVIEW');
  assert(res.safetyOverrideApplied === true, 'Safety override must be true');
  assert(res.adaptedParameters.targetAngle <= 165, 'Target angle cannot advance under STOP');
});

test('1c. Safety State CAUTION prevents SLIGHTLY_ADVANCED progression', () => {
  // Even with 100% quality, mastery, and max completion:
  const input: AdaptiveProgressionInput = {
    ...BASE_NOMINAL_INPUT,
    quality: { score: 98, stability: 95, symmetry: 96, velocityQuality: 'OPTIMAL' },
    safetyState: {
      level: 'CAUTION',
      isProgressionAllowed: false,
      flaggedHazards: ['UNUSUAL_ASYMMETRY'],
      triggerDetail: 'Contralateral shoulder asymmetry exceeds 20°',
    },
  };

  const res = AdaptiveProgressionEngine.evaluate(input);

  assert(res.nextSessionDifficulty !== 'SLIGHTLY_ADVANCED', 'CAUTION must prohibit SLIGHTLY_ADVANCED');
  assert(res.nextSessionDifficulty === 'SAME', 'CAUTION should clamp nominal performance to SAME');
  assert(res.safetyOverrideApplied === true, 'Safety override must be true');
  assert(
    res.patientMessage === 'Your next exercise session can continue at the current reference level.',
    'Must use approved reference level patient message'
  );
  assert(res.adaptedParameters.targetAngle === 165, 'Target angle must remain frozen at current level');
});

test('1d. Safety State CAUTION with severe compensation regresses to EASIER', () => {
  const input: AdaptiveProgressionInput = {
    ...BASE_NOMINAL_INPUT,
    quality: { score: 62, stability: 55, symmetry: 60, velocityQuality: 'JERKY' },
    compensationRate: {
      frequency: 50,
      detected: true,
      activeFaultsCount: 2,
      severity: 'SEVERE',
      primaryFaultName: 'Trunk lateral flexion',
    },
    safetyState: {
      level: 'CAUTION',
      isProgressionAllowed: false,
      flaggedHazards: ['SEVERE_POSTURAL_COMPENSATION'],
      triggerDetail: 'Trunk lean > 25°',
    },
  };

  const res = AdaptiveProgressionEngine.evaluate(input);

  assert(res.nextSessionDifficulty === 'EASIER', 'CAUTION with severe compensation should step down to EASIER');
  assert(res.adaptedParameters.targetAngle < 165, 'Target angle must regress to support safe movement');
  assert(res.adaptedParameters.targetAngle >= 90, 'Target angle must respect minTargetAngle bound (90°)');
  assert(res.patientMessage.includes('lighter target'), 'Patient message must describe lighter target');
});

// ============================================================================
// TEST SUITE 2: EXERCISE-SPECIFIC CONFIGURED BOUNDARIES ENFORCEMENT
// ============================================================================
test('2a. Target angle cannot exceed maxTargetAngle under progression', () => {
  const boundaries = EXERCISE_PROGRESSION_BOUNDARIES['shoulder_flexion'];
  assert(boundaries.maxTargetAngle === 175, 'Shoulder flexion max target angle should be 175°');

  // Input already at 175° with perfect performance
  const input: AdaptiveProgressionInput = {
    ...BASE_NOMINAL_INPUT,
    recentPerformance: {
      ...BASE_NOMINAL_INPUT.recentPerformance,
      targetAngle: 175,
      currentAngle: 175,
      peakAngle: 175,
    },
    currentDosage: {
      ...BASE_NOMINAL_INPUT.currentDosage,
      targetAngle: 175,
      repetitions: 10,
    },
  };

  const res = AdaptiveProgressionEngine.evaluate(input);

  // Angle cannot exceed 175°, so engine advances repetitions instead
  assert(res.adaptedParameters.targetAngle === 175, 'Target angle must be clamped at 175°');
  assert(res.adaptedParameters.repetitions === 12, 'Repetitions advance when target angle is maxed out');
  assert(res.adaptedParameters.targetAngle <= boundaries.maxTargetAngle, 'Target angle <= maxTargetAngle');
});

test('2b. Repetitions cannot exceed maxRepetitions boundary', () => {
  const boundaries = EXERCISE_PROGRESSION_BOUNDARIES['shoulder_flexion'];
  assert(boundaries.maxRepetitions === 15, 'Shoulder flexion max repetitions should be 15');

  const input: AdaptiveProgressionInput = {
    ...BASE_NOMINAL_INPUT,
    currentDosage: {
      targetAngle: 175,
      repetitions: 15, // Already at max reps
      sets: 3,
      holdDuration: 2,
      rest: 60,
    },
    recentPerformance: {
      ...BASE_NOMINAL_INPUT.recentPerformance,
      targetAngle: 175,
      targetReps: 15,
      completedReps: 15,
      currentAngle: 175,
      peakAngle: 175,
    },
  };

  const res = AdaptiveProgressionEngine.evaluate(input);

  assert(res.adaptedParameters.repetitions === 15, 'Repetitions must not exceed maxRepetitions (15)');
  assert(res.adaptedParameters.holdDuration === 3, 'Advances hold duration when reps and angle are at max');
});

test('2c. When all boundaries are maxed out, difficulty stays at SAME with pattern consolidation', () => {
  const input: AdaptiveProgressionInput = {
    ...BASE_NOMINAL_INPUT,
    currentDosage: {
      targetAngle: 175,
      repetitions: 15,
      sets: 4,
      holdDuration: 5, // max hold is 5
      rest: 60,
    },
    recentPerformance: {
      ...BASE_NOMINAL_INPUT.recentPerformance,
      targetAngle: 175,
      targetReps: 15,
      completedReps: 15,
      currentAngle: 175,
      peakAngle: 175,
    },
  };

  const res = AdaptiveProgressionEngine.evaluate(input);

  assert(res.nextSessionDifficulty === 'SAME', 'When all boundaries are maxed, stays at SAME');
  assert(res.adaptedParameters.targetAngle === 175, 'Target angle capped at 175°');
  assert(res.adaptedParameters.repetitions === 15, 'Reps capped at 15');
  assert(res.adaptedParameters.holdDuration === 5, 'Hold duration capped at 5');
  assert(
    res.patientMessage === 'Your next exercise session can continue at the current reference level.',
    'Must use standard reference level patient message'
  );
});

test('2d. Regressed parameters cannot fall below minTargetAngle or minRepetitions', () => {
  const boundaries = EXERCISE_PROGRESSION_BOUNDARIES['shoulder_flexion'];
  assert(boundaries.minTargetAngle === 90, 'Shoulder flexion min target angle should be 90°');
  assert(boundaries.minRepetitions === 5, 'Shoulder flexion min repetitions should be 5');

  const input: AdaptiveProgressionInput = {
    ...BASE_NOMINAL_INPUT,
    currentDosage: {
      targetAngle: 90, // already at min
      repetitions: 5,  // already at min
      sets: 2,
      holdDuration: 2,
      rest: 60,
    },
    recentPerformance: {
      completedReps: 2,
      targetReps: 5,
      currentAngle: 75,
      peakAngle: 75,
      targetAngle: 90,
      romPercentage: 83,
    },
    quality: { score: 50, stability: 40, symmetry: 60 },
    compensationRate: { frequency: 45, detected: true, activeFaultsCount: 1, severity: 'MODERATE' },
  };

  const res = AdaptiveProgressionEngine.evaluate(input);

  assert(res.nextSessionDifficulty === 'EASIER', 'Poor completion triggers EASIER');
  assert(res.adaptedParameters.targetAngle >= 90, 'Target angle cannot drop below minTargetAngle (90°)');
  assert(res.adaptedParameters.repetitions >= 5, 'Reps cannot drop below minRepetitions (5)');
});

// ============================================================================
// TEST SUITE 3: SAFE ADVANCEMENT UNDER NOMINAL CONDITIONS
// ============================================================================
test('3a. High performance under SAFE triggers SLIGHTLY_ADVANCED with bounded increment', () => {
  const input: AdaptiveProgressionInput = {
    ...BASE_NOMINAL_INPUT,
    currentDosage: {
      targetAngle: 150,
      repetitions: 10,
      sets: 3,
      holdDuration: 2,
      rest: 60,
    },
    recentPerformance: {
      ...BASE_NOMINAL_INPUT.recentPerformance,
      targetAngle: 150,
      currentAngle: 150,
      peakAngle: 152,
    },
  };

  const res = AdaptiveProgressionEngine.evaluate(input);

  assert(res.nextSessionDifficulty === 'SLIGHTLY_ADVANCED', 'Optimal performance triggers SLIGHTLY_ADVANCED');
  assert(res.adaptedParameters.targetAngle === 155, 'Target angle increases by exactly 5° step increment (150° -> 155°)');
  assert(
    res.patientMessage === 'Your next exercise session can introduce a gentle progression within your recommended reference range.',
    'Patient message must describe gentle progression'
  );
  assert(!res.patientMessage.includes('Treatment increased'), 'Forbidden phrase "Treatment increased" must not appear');
});

test('3b. Steady performance without full mastery maintains SAME difficulty', () => {
  const input: AdaptiveProgressionInput = {
    ...BASE_NOMINAL_INPUT,
    currentDosage: {
      targetAngle: 150,
      repetitions: 10,
      sets: 3,
      holdDuration: 2,
      rest: 60,
    },
    recentPerformance: {
      completedReps: 7, // 70% completion
      targetReps: 10,
      currentAngle: 142,
      peakAngle: 145,
      targetAngle: 150,
      romPercentage: 96,
    },
    quality: { score: 76, stability: 72, symmetry: 80 },
    compensationRate: { frequency: 12, detected: false, activeFaultsCount: 0, severity: 'NONE' },
  };

  const res = AdaptiveProgressionEngine.evaluate(input);

  assert(res.nextSessionDifficulty === 'SAME', 'Moderate completion maintains SAME level');
  assert(res.adaptedParameters.targetAngle === 150, 'Target angle maintained at 150°');
  assert(
    res.patientMessage === 'Your next exercise session can continue at the current reference level.',
    'Message must confirm continuing at current reference level'
  );
});

// ============================================================================
// TEST SUITE 4: SENSOR RELIABILITY & TRACKING FILTER
// ============================================================================
test('4a. Degraded camera tracking freezes difficulty at SAME', () => {
  const input: AdaptiveProgressionInput = {
    ...BASE_NOMINAL_INPUT,
    confidence: {
      trackingConfidence: 45, // below 60% threshold
      biomechanicalConfidence: 50,
      isReliable: false,
      degradationReason: 'Camera occlusion or poor lighting',
    },
  };

  const res = AdaptiveProgressionEngine.evaluate(input);

  assert(res.nextSessionDifficulty === 'SAME', 'Degraded tracking must freeze progression at SAME');
  assert(res.adaptedParameters.targetAngle === 165, 'Target angle must not change');
  assert(res.rationale.includes('degraded'), 'Rationale must cite degraded tracking');
});

// ============================================================================
// TEST SUITE 5: EXPLAINABLE AI AUDIT TRACE (PATCH 8 INTEGRATION)
// ============================================================================
test('5a. Result encapsulates complete Explainable AI explanation object', () => {
  const res = AdaptiveProgressionEngine.evaluate(BASE_NOMINAL_INPUT);

  assert(res.explanation !== undefined, 'Explanation must exist');
  assert(typeof res.explanation.observation === 'string', 'Observation must be string');
  assert(typeof res.explanation.evidence === 'string', 'Evidence must cite telemetry');
  assert(Array.isArray(res.explanation.contributingFactors), 'Contributing factors must be array');
  assert(typeof res.explanation.patientView === 'string', 'Patient view must be string');
  assert(res.explanation.patientView === res.patientMessage, 'Patient view must match patient message');
  assert(res.explanation.developerView !== undefined, 'Developer view must exist');
  assert(res.explanation.developerView.metric === 'nextSessionDifficulty', 'Developer metric check');
  assert(res.explanation.developerView.threshold === res.nextSessionDifficulty, 'Developer threshold check');
  assert(res.explanation.source.includes('biomechanics'), 'Sources must cite biomechanics');
  assert(res.explanation.source.includes('protocol'), 'Sources must cite protocol');
});

// ============================================================================
// TEST SUITE 6: MULTI-EXERCISE REGISTRY COVERAGE
// ============================================================================
test('6a. Knee Extension boundaries and progression work properly', () => {
  const input: AdaptiveProgressionInput = {
    exerciseId: 'knee_extension',
    recentPerformance: {
      completedReps: 10,
      targetReps: 10,
      currentAngle: 85,
      peakAngle: 88,
      targetAngle: 85,
      romPercentage: 100,
    },
    quality: { score: 85, stability: 82, symmetry: 90 },
    consistency: 85,
    compensationRate: { frequency: 5, detected: false, activeFaultsCount: 0, severity: 'NONE' },
    confidence: { trackingConfidence: 90, biomechanicalConfidence: 90, isReliable: true },
    safetyState: { level: 'SAFE', isProgressionAllowed: true, flaggedHazards: [] },
    currentDosage: { targetAngle: 85, repetitions: 10, sets: 3, holdDuration: 2, rest: 60 },
  };

  const res = AdaptiveProgressionEngine.evaluate(input);

  assert(res.boundariesEnforced.exerciseId === 'knee_extension', 'Must use knee_extension boundary');
  assert(res.boundariesEnforced.maxTargetAngle === 95, 'Knee extension maxTargetAngle is 95°');
  assert(res.nextSessionDifficulty === 'SLIGHTLY_ADVANCED', 'Knee extension progresses to SLIGHTLY_ADVANCED');
  assert(res.adaptedParameters.targetAngle === 90, 'Knee extension angle increments 85° -> 90°');
});

test('6b. Straight Leg Raise boundaries and progression work properly', () => {
  const input: AdaptiveProgressionInput = {
    exerciseId: 'straight_leg_raise',
    recentPerformance: {
      completedReps: 10,
      targetReps: 10,
      currentAngle: 60,
      peakAngle: 62,
      targetAngle: 60,
      romPercentage: 100,
    },
    quality: { score: 85, stability: 80, symmetry: 88 },
    consistency: 85,
    compensationRate: { frequency: 5, detected: false, activeFaultsCount: 0, severity: 'NONE' },
    confidence: { trackingConfidence: 90, biomechanicalConfidence: 90, isReliable: true },
    safetyState: { level: 'SAFE', isProgressionAllowed: true, flaggedHazards: [] },
    currentDosage: { targetAngle: 60, repetitions: 10, sets: 3, holdDuration: 2, rest: 60 },
  };

  const res = AdaptiveProgressionEngine.evaluate(input);

  assert(res.boundariesEnforced.exerciseId === 'straight_leg_raise', 'Must use straight_leg_raise boundary');
  assert(res.boundariesEnforced.maxTargetAngle === 75, 'Straight leg raise maxTargetAngle is 75°');
  assert(res.nextSessionDifficulty === 'SLIGHTLY_ADVANCED', 'SLR progresses to SLIGHTLY_ADVANCED');
  assert(res.adaptedParameters.targetAngle === 65, 'SLR angle increments 60° -> 65°');
});

console.log('\n==================================================');
console.log(`VERIFICATION SUMMARY: ${testsPassed} passed, ${testsFailed} failed`);
console.log('==================================================');

if (testsFailed > 0) {
  process.exit(1);
} else {
  console.log('ALL ADAPTIVE PROGRESSION VERIFICATION TESTS PASSED SUCCESSFULLY.');
}
