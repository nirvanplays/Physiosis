/**
 * =====================================================================
 * PHYSIOSIS — EXPLAINABLE AI VERIFICATION TEST BENCH (PATCH 8)
 * =====================================================================
 * Automated verification suite for Explainable AI (XAI) coaching explanations.
 *
 * Validates:
 *   1. Internal explanation object structure on all AI recommendations.
 *   2. Canonical fit with user specification:
 *      - observation: "Shoulder elevation remains below target"
 *      - evidence: "Current ROM = 122°, target = 165°"
 *      - contributingFactors: ["reduced elevation"]
 *      - recommendation: "Continue gradual shoulder elevation"
 *      - confidence: 0.91
 *      - source: ["biomechanics", "protocol"]
 *      - patientView: "Your current shoulder elevation is below the selected reference range, so continue gradually raising the arm."
 *      - developerView: metric, threshold, confidence, source, timestamp.
 *   3. Authoritative Decision Traceability: Every decision is traceable to at least one of:
 *      sensor data, protocol rule, knowledge source, or model output.
 *   4. Zero private chain-of-thought exposure (concise evidence-based rationale only).
 *   5. Dual projection integrity (patient view vs developer trace view).
 *   6. Comprehensive coverage across all 7 evaluation tiers.
 *   7. Integration into PhysiosisAIOrchestrator (aiState.explanation).
 *   8. Determinism and reproducibility across 100 identical executions.
 */

declare const process: any;

import { RehabilitationRecommendationEngine } from '../RehabilitationRecommendationEngine';
import type { RehabilitationRecommendationInput, ExplanationSourceCategory } from '../RecommendationTypes';
import { getExercise, getDefaultExercise } from '../../exercise/ExerciseRegistry';
import { PhysiosisAIOrchestrator } from '../../ai/PhysiosisAIOrchestrator';
import { INITIAL_LIVE_SESSION_STATE } from '../../session/SessionTypes';

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

// Authoritative root sources for clinical traceability
const VALID_TRACEABILITY_ROOTS: ExplanationSourceCategory[] = [
  'sensor_data',
  'protocol',
  'knowledge_source',
  'model_output',
];

function verifyTraceability(sources: ExplanationSourceCategory[]): boolean {
  return sources.some((s) => VALID_TRACEABILITY_ROOTS.includes(s));
}

// ─────────────────────────────────────────────────────────────────────
// 1. CANONICAL USER SPECIFICATION FIT (TIER 7: SHOULDER FLEXION AT 122°)
// ─────────────────────────────────────────────────────────────────────
test('1. Canonical Spec: Exact match for shoulder elevation deficit at 122°', () => {
  const shoulderExercise = getExercise('shoulder-flexion');
  const input: RehabilitationRecommendationInput = {
    exercise: shoulderExercise,
    rom: {
      currentAngle: 122,
      targetAngle: 165,
      romPercentage: Math.round((122 / 165) * 100),
      bestROM: 122,
    },
    movementQuality: {
      score: 85,
      stability: 88,
      symmetry: 92,
      velocityQuality: 'OPTIMAL',
    },
    compensation: {
      detected: false,
      primaryFault: null,
      activeFaultsCount: 0,
      activeCompensatingJoints: [],
    },
    patientBaseline: null,
    recentSessionTrend: null,
    confidence: {
      trackingConfidence: 95,
      biomechanicalConfidence: 92,
      isReliable: true,
      degradationReason: null,
    },
    safetyState: {
      level: 'SAFE',
      flaggedHazards: [],
    },
    temporalPrediction: null,
  };

  const rec = RehabilitationRecommendationEngine.evaluate(input);
  const exp = rec.explanation;

  assert(exp !== undefined, 'Explanation object must be defined');

  // Verify exact specification fields
  assert(
    exp.observation === 'Shoulder elevation remains below target',
    `Expected observation "Shoulder elevation remains below target", got "${exp.observation}"`
  );
  assert(
    exp.evidence === 'Current ROM = 122°, target = 165°',
    `Expected evidence "Current ROM = 122°, target = 165°", got "${exp.evidence}"`
  );
  assert(
    exp.contributingFactors.length === 1 && exp.contributingFactors[0] === 'reduced elevation',
    `Expected contributingFactors ["reduced elevation"], got ${JSON.stringify(exp.contributingFactors)}`
  );
  assert(
    exp.recommendation === 'Continue gradual shoulder elevation',
    `Expected recommendation "Continue gradual shoulder elevation", got "${exp.recommendation}"`
  );
  assert(exp.confidence === 0.91, `Expected confidence 0.91, got ${exp.confidence}`);
  assert(
    exp.source.length === 2 && exp.source.includes('biomechanics') && exp.source.includes('protocol'),
    `Expected source ["biomechanics", "protocol"], got ${JSON.stringify(exp.source)}`
  );

  // Verify Patient View
  assert(
    exp.patientView ===
      'Your current shoulder elevation is below the selected reference range, so continue gradually raising the arm.',
    `Expected exact patientView string, got "${exp.patientView}"`
  );

  // Verify Developer Trace View
  const dev = exp.developerView;
  assert(dev !== undefined, 'Developer view must be defined');
  assert(dev.metric === 'currentAngle', `Expected dev.metric "currentAngle", got "${dev.metric}"`);
  assert(dev.threshold === 'target = 165°', `Expected dev.threshold "target = 165°", got "${dev.threshold}"`);
  assert(dev.confidence === 0.91, `Expected dev.confidence 0.91, got ${dev.confidence}`);
  assert(
    dev.source.includes('biomechanics') && dev.source.includes('protocol'),
    `Expected dev.source to include biomechanics and protocol`
  );
  assert(typeof dev.timestamp === 'number' && dev.timestamp > 0, 'dev.timestamp must be valid epoch ms');
});

// ─────────────────────────────────────────────────────────────────────
// 2. DECISION TRACEABILITY ACROSS ALL 7 TIERS
// ─────────────────────────────────────────────────────────────────────
test('2a. Tier 1 Traceability: Safety Stop Movement traces to sensor_data and safety_rule', () => {
  const input: RehabilitationRecommendationInput = {
    exercise: getDefaultExercise(),
    rom: { currentAngle: 140, targetAngle: 165, romPercentage: 85 },
    movementQuality: { score: 40, stability: 30, symmetry: 50 },
    compensation: { detected: false },
    confidence: { trackingConfidence: 90, biomechanicalConfidence: 90, isReliable: true },
    safetyState: {
      level: 'STOP_MOVEMENT',
      flaggedHazards: ['Kinematic jerk spike: angular velocity exceeded 215°/s'],
    },
  };

  const rec = RehabilitationRecommendationEngine.evaluate(input);
  const exp = rec.explanation;

  assert(exp.source.includes('sensor_data'), 'Must trace to sensor_data');
  assert(exp.source.includes('safety_rule'), 'Must trace to safety_rule');
  assert(verifyTraceability(exp.source), 'Must satisfy traceability invariant');
  assert(exp.confidence >= 0.95, 'High confidence for safety stop');
  assert(exp.developerView.metric === 'safetyLevel', 'Metric should be safetyLevel');
});

test('2b. Tier 2 Traceability: Tracking Confidence Degradation traces to sensor_data and safety_rule', () => {
  const input: RehabilitationRecommendationInput = {
    exercise: getDefaultExercise(),
    rom: { currentAngle: 90, targetAngle: 165, romPercentage: 55 },
    movementQuality: { score: 50, stability: 50, symmetry: 50 },
    compensation: { detected: false },
    confidence: {
      trackingConfidence: 35,
      biomechanicalConfidence: 35,
      isReliable: false,
      degradationReason: 'Camera silhouette partially occluded',
    },
    safetyState: { level: 'SAFE', flaggedHazards: [] },
  };

  const rec = RehabilitationRecommendationEngine.evaluate(input);
  const exp = rec.explanation;

  assert(exp.source.includes('sensor_data'), 'Must trace to sensor_data');
  assert(exp.source.includes('safety_rule'), 'Must trace to safety_rule');
  assert(verifyTraceability(exp.source), 'Must satisfy traceability invariant');
  assert(exp.developerView.metric === 'trackingConfidence', 'Metric should be trackingConfidence');
  assert(exp.developerView.threshold === 'min = 50%', 'Threshold should reflect min = 50%');
});

test('2c. Tier 3 Traceability: Severe Compensation traces to sensor_data, biomechanics and safety_rule', () => {
  const input: RehabilitationRecommendationInput = {
    exercise: getDefaultExercise(),
    rom: { currentAngle: 110, targetAngle: 165, romPercentage: 67 },
    movementQuality: { score: 60, stability: 55, symmetry: 60 },
    compensation: {
      detected: true,
      primaryFault: {
        type: 'TRUNK_LATERAL_LEAN',
        name: 'Trunk Lateral Lean',
        severity: 'SEVERE',
        measuredValue: 18.5,
        unit: '°',
      },
    },
    confidence: { trackingConfidence: 92, biomechanicalConfidence: 90, isReliable: true },
    safetyState: { level: 'SAFE', flaggedHazards: [] },
  };

  const rec = RehabilitationRecommendationEngine.evaluate(input);
  const exp = rec.explanation;

  assert(exp.source.includes('sensor_data'), 'Must trace to sensor_data');
  assert(exp.source.includes('biomechanics'), 'Must trace to biomechanics');
  assert(exp.source.includes('safety_rule'), 'Must trace to safety_rule');
  assert(verifyTraceability(exp.source), 'Must satisfy traceability invariant');
  assert(exp.observation.includes('Severe compensatory movement'), 'Observation must state severe compensation');
  assert(exp.contributingFactors.includes('trunk lateral lean'), 'Contributing factors must cite trunk lean');
});

test('2d. Tier 4 Traceability: Moderate Compensation traces to biomechanics and protocol', () => {
  const input: RehabilitationRecommendationInput = {
    exercise: getDefaultExercise(),
    rom: { currentAngle: 125, targetAngle: 165, romPercentage: 76 },
    movementQuality: { score: 75, stability: 70, symmetry: 80 },
    compensation: {
      detected: true,
      primaryFault: {
        type: 'SHOULDER_HIKE',
        name: 'Shoulder Hike',
        severity: 'MODERATE',
        measuredValue: 8.0,
        unit: '°',
      },
    },
    confidence: { trackingConfidence: 94, biomechanicalConfidence: 92, isReliable: true },
    safetyState: { level: 'SAFE', flaggedHazards: [] },
  };

  const rec = RehabilitationRecommendationEngine.evaluate(input);
  const exp = rec.explanation;

  assert(exp.source.includes('biomechanics'), 'Must trace to biomechanics');
  assert(exp.source.includes('protocol'), 'Must trace to protocol');
  assert(verifyTraceability(exp.source), 'Must satisfy traceability invariant');
  assert(exp.evidence.includes('reducing progression target'), 'Evidence must cite target reduction');
});

test('2e. Tier 5 Traceability: Temporal Anomaly traces to model_output and protocol', () => {
  const input: RehabilitationRecommendationInput = {
    exercise: getDefaultExercise(),
    rom: { currentAngle: 130, targetAngle: 165, romPercentage: 79 },
    movementQuality: { score: 78, stability: 75, symmetry: 85 },
    compensation: { detected: false },
    confidence: { trackingConfidence: 95, biomechanicalConfidence: 92, isReliable: true },
    safetyState: { level: 'SAFE', flaggedHazards: [] },
    temporalPrediction: {
      phase: 'ASCENT',
      phaseProbabilities: { ASCENT: 0.85, PEAK: 0.05, DESCENT: 0.05, REST: 0.03, HOLD: 0.02 },
      repPhase: 'EARLY_CONCENTRIC',
      compensation: 'TRUNK_LEAN',
      compensationProbabilities: { TRUNK_LEAN: 0.80, SHOULDER_HIKE: 0.10, KNEE_VALGUS: 0.0, PELVIC_TILT: 0.05, FORWARD_HEAD: 0.0, NONE: 0.05 },
      quality: 0.65,
      stability: 0.70,
      confidence: 0.88,
      architectureUsed: 'TCN',
      timestamp: Date.now(),
      latencyMs: 12,
    },
  };

  const rec = RehabilitationRecommendationEngine.evaluate(input);
  const exp = rec.explanation;

  assert(exp.source.includes('model_output'), 'Must trace to model_output');
  assert(exp.source.includes('protocol'), 'Must trace to protocol');
  assert(verifyTraceability(exp.source), 'Must satisfy traceability invariant');
  assert(exp.observation.includes('Temporal neural model'), 'Observation must state temporal model');
  assert(exp.patientView.includes('movement timing is fluctuating'), 'Patient view explains cadence timing');
});

test('2f. Tier 6 Traceability: Baseline Progression traces to biomechanics, patient_baseline, and protocol', () => {
  const input: RehabilitationRecommendationInput = {
    exercise: getDefaultExercise(),
    rom: { currentAngle: 140, targetAngle: 165, romPercentage: 88 },
    movementQuality: { score: 86, stability: 89, symmetry: 93 },
    compensation: { detected: false },
    patientBaseline: {
      status: 'BASELINE_AVAILABLE',
      typicalROM: 132,
      medianROM: 132,
      bestROM: 140,
      repConsistency: 92,
      compensationFrequency: 5,
    },
    confidence: { trackingConfidence: 96, biomechanicalConfidence: 94, isReliable: true },
    safetyState: { level: 'SAFE', flaggedHazards: [] },
  };

  const rec = RehabilitationRecommendationEngine.evaluate(input);
  const exp = rec.explanation;

  assert(exp.source.includes('biomechanics'), 'Must trace to biomechanics');
  assert(exp.source.includes('patient_baseline'), 'Must trace to patient_baseline');
  assert(exp.source.includes('protocol'), 'Must trace to protocol');
  assert(verifyTraceability(exp.source), 'Must satisfy traceability invariant');
  assert(exp.evidence.includes('baseline typical = 132°'), 'Evidence must cite baseline typical ROM');
});

// ─────────────────────────────────────────────────────────────────────
// 3. ZERO PRIVATE CHAIN-OF-THOUGHT EXPOSURE
// ─────────────────────────────────────────────────────────────────────
test('3. Zero Chain-of-Thought Exposure: No internal scratchpads or hidden reasoning tokens', () => {
  const disallowedTokens = [
    'thinking',
    'chain-of-thought',
    'scratchpad',
    '<thought>',
    'system prompt',
    'internal reasoning',
    'evaluating tier',
  ];

  const exercises = ['shoulder-flexion', 'knee-extension', 'straight-leg-raise'];
  for (const exId of exercises) {
    const ex = getExercise(exId);
    const rec = RehabilitationRecommendationEngine.evaluate({
      exercise: ex,
      rom: { currentAngle: 75, targetAngle: ex.targetAngle, romPercentage: 60 },
      movementQuality: { score: 80, stability: 80, symmetry: 85 },
      compensation: { detected: false },
      confidence: { trackingConfidence: 90, biomechanicalConfidence: 90, isReliable: true },
      safetyState: { level: 'SAFE', flaggedHazards: [] },
    });

    const combinedText = `
      ${rec.explanation.observation}
      ${rec.explanation.evidence}
      ${rec.explanation.contributingFactors.join(' ')}
      ${rec.explanation.recommendation}
      ${rec.explanation.patientView}
    `.toLowerCase();

    for (const token of disallowedTokens) {
      assert(
        !combinedText.includes(token),
        `Privacy Violation: Found disallowed chain-of-thought token "${token}" in explanation`
      );
    }
  }
});

// ─────────────────────────────────────────────────────────────────────
// 4. DUAL-PROJECTION VIEW VALIDATION
// ─────────────────────────────────────────────────────────────────────
test('4. Dual-Projection: Patient View is human-readable and Developer View is machine-auditable', () => {
  const kneeExercise = getExercise('knee-extension');
  const rec = RehabilitationRecommendationEngine.evaluate({
    exercise: kneeExercise,
    rom: { currentAngle: 60, targetAngle: 90, romPercentage: 67 },
    movementQuality: { score: 82, stability: 80, symmetry: 88 },
    compensation: { detected: false },
    confidence: { trackingConfidence: 95, biomechanicalConfidence: 92, isReliable: true },
    safetyState: { level: 'SAFE', flaggedHazards: [] },
  });

  const { patientView, developerView } = rec.explanation;

  // Patient view should be a complete sentence with punctuation
  assert(patientView.length > 20, 'Patient view must be descriptive');
  assert(patientView.endsWith('.'), 'Patient view must end with punctuation');
  assert(!patientView.includes('metric:'), 'Patient view must not contain raw code properties');

  // Developer view must contain exact telemetry keys
  assert(typeof developerView.metric === 'string' && developerView.metric.length > 0, 'Metric must be string');
  assert(developerView.threshold !== undefined, 'Threshold must be defined');
  assert(typeof developerView.confidence === 'number' && developerView.confidence <= 1.0, 'Confidence must be <= 1.0');
  assert(Array.isArray(developerView.source) && developerView.source.length > 0, 'Source must be array');
  assert(typeof developerView.timestamp === 'number' && developerView.timestamp > 0, 'Timestamp must be positive integer');
});

// ─────────────────────────────────────────────────────────────────────
// 5. DETERMINISM & REPRODUCIBILITY (100 EXECUTIONS)
// ─────────────────────────────────────────────────────────────────────
test('5. Determinism: 100 identical executions produce 100 identical explanation objects', () => {
  const shoulderExercise = getExercise('shoulder-flexion');
  const input: RehabilitationRecommendationInput = {
    exercise: shoulderExercise,
    rom: { currentAngle: 122, targetAngle: 165, romPercentage: 74 },
    movementQuality: { score: 85, stability: 85, symmetry: 90 },
    compensation: { detected: false },
    confidence: { trackingConfidence: 95, biomechanicalConfidence: 92, isReliable: true },
    safetyState: { level: 'SAFE', flaggedHazards: [] },
  };

  const initial = RehabilitationRecommendationEngine.evaluate(input).explanation;

  for (let i = 0; i < 100; i++) {
    const current = RehabilitationRecommendationEngine.evaluate(input).explanation;
    assert(current.observation === initial.observation, `Run ${i}: observation mismatch`);
    assert(current.evidence === initial.evidence, `Run ${i}: evidence mismatch`);
    assert(current.recommendation === initial.recommendation, `Run ${i}: recommendation mismatch`);
    assert(current.confidence === initial.confidence, `Run ${i}: confidence mismatch`);
    assert(current.patientView === initial.patientView, `Run ${i}: patientView mismatch`);
    assert(current.developerView.metric === initial.developerView.metric, `Run ${i}: developerView.metric mismatch`);
    assert(current.developerView.threshold === initial.developerView.threshold, `Run ${i}: developerView.threshold mismatch`);
  }
});

// ─────────────────────────────────────────────────────────────────────
// 6. AI ORCHESTRATOR INTEGRATION
// ─────────────────────────────────────────────────────────────────────
test('6. AI Orchestrator: PhysiosisAIState surfaces explanation on aiState.explanation', () => {
  const orchestrator = new PhysiosisAIOrchestrator();
  const shoulderExercise = getExercise('shoulder-flexion');

  const aiState = orchestrator.orchestrate({
    landmarks: null,
    activeExercise: shoulderExercise,
    sessionState: {
      ...INITIAL_LIVE_SESSION_STATE,
      isActive: true,
      sessionState: 'ACTIVE',
      currentRepNumber: 3,
    },
    postureResult: null,
    stats: null,
    savedSessions: [],
    isStreaming: false,
    currentAngle: 122,
  });

  assert(aiState.explanation !== undefined, 'aiState.explanation must be defined');
  assert(aiState.explanation.observation.length > 0, 'aiState.explanation.observation must not be empty');
  assert(aiState.explanation.patientView.length > 0, 'aiState.explanation.patientView must not be empty');
  assert(aiState.explanation.developerView.metric.length > 0, 'aiState.explanation.developerView.metric must not be empty');
  assert(
    aiState.recommendedProtocol.recommendation?.explanation !== undefined,
    'recommendation.explanation must also be present'
  );
});

// ─────────────────────────────────────────────────────────────────────
// EXECUTE TEST BENCH
// ─────────────────────────────────────────────────────────────────────
console.log('=====================================================================');
console.log('  PHYSIOSIS EXPLAINABLE AI ENGINE VERIFICATION (PATCH 8)');
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
  console.log('>>> All Explainable AI QA tests passed successfully! <<<\n');
}
