/**
 * PatientRehabilitationStateVerification.ts
 * PHYSIOSIS — MULTIMODAL PATIENT STATE PATCH 9 VERIFICATION TEST SUITE
 *
 * Verifies:
 *   1. PatientRehabilitationState contains all 13 required top-level properties:
 *      currentExercise, laterality, currentROM, targetROM, quality, compensation,
 *      symptoms, confidence, baseline, trend, safety, recommendation, nextAction.
 *   2. Universal Attributed Envelope: EVERY value identifies source, timestamp, confidence (0.0 - 1.0).
 *   3. Explicit User Specification:
 *      currentROM: { value: 122, source: "YOLO+Kinematics", confidence: 0.94, timestamp: ... }
 *   4. Multimodal Aggregation of 9 Dimensions:
 *      (1) Pose, (2) Kinematics, (3) Posture Compensation, (4) Temporal Movement,
 *      (5) Patient Symptoms, (6) Session History, (7) Exercise Metadata,
 *      (8) Safety State, (9) Voice/Text Interaction.
 *   5. PhysiosisAIOrchestrator integration: orchestrator outputs authoritative patientState.
 *   6. Dedicated Consumer Adapters:
 *      - 3D Viewer (extract3DViewerInput)
 *      - Guidance (extractGuidanceInput)
 *      - Report (extractReportSummary)
 *      - Assistant (extractAssistantContext)
 *      - Recommendation Engine (extractRecommendationEngineInput & evaluatePatientState)
 *      - Progress Engine (extractProgressEngineInput)
 */

declare const process: any;

import {
  createAttributedValue,
  extract3DViewerInput,
  extractGuidanceInput,
  extractReportSummary,
  extractAssistantContext,
  extractRecommendationEngineInput,
  extractProgressEngineInput,
  type AttributedValue,
} from '../PatientRehabilitationState';
import { PhysiosisAIOrchestrator } from '../../ai/PhysiosisAIOrchestrator';
import { RehabilitationRecommendationEngine } from '../../recommendation/RehabilitationRecommendationEngine';
import { getDefaultExercise } from '../../exercise/ExerciseRegistry';
import type { AIOrchestratorInput } from '../../ai/AIOrchestratorTypes';
import type { ExerciseDefinition, Landmark3D } from '../../exercise/ExerciseTypes';
import {
  type LiveSessionState,
  type PhysiosisSession,
  INITIAL_LIVE_SESSION_STATE,
  INITIAL_LIVE_SESSION_METRICS,
} from '../../session/SessionTypes';

let testsPassed = 0;
let testsFailed = 0;

function assert(condition: boolean, testName: string, detail?: string) {
  if (condition) {
    console.log(`  ✓ PASS: ${testName}`);
    testsPassed++;
  } else {
    console.error(`  ✗ FAIL: ${testName}${detail ? ` — ${detail}` : ''}`);
    testsFailed++;
  }
}

console.log('================================================================');
console.log('PHYSIOSIS MULTIMODAL PATIENT STATE (PATCH 9) VERIFICATION SUITE');
console.log('================================================================\n');

// ── Mock Setup ───────────────────────────────────────────────────────────────
const defaultEx = getDefaultExercise();
const mockExercise: ExerciseDefinition = {
  ...defaultEx,
  id: 'shoulder-flexion',
  name: 'Standing Shoulder Flexion',
  targetAngle: 165,
  limitedAngle: 120,
  startAngle: 15,
  highlightJoint: 'shoulder',
  postureMode: 'standing',
  metricName: 'Shoulder Flexion',
  side: 'right',
  plane: 'Sagittal',
};

const mockLandmarks: Landmark3D[] = Array.from({ length: 33 }, () => ({
  x: 0.5,
  y: 0.5,
  z: 0.0,
  visibility: 0.94,
}));

const mockSessionState: LiveSessionState = {
  ...INITIAL_LIVE_SESSION_STATE,
  isActive: true,
  sessionState: 'ACTIVE',
  currentRepNumber: 3,
  metrics: {
    ...INITIAL_LIVE_SESSION_METRICS,
    completedReps: 2,
    elapsedMs: 45000,
    bestROM: 122,
    averageROM: 118,
    averageQuality: 85,
  },
  latestRep: {
    repNumber: 2,
    peakAngle: 122,
    targetAngle: 165,
    romPercentage: 74,
    deviation: 43,
    qualityScore: 88,
    limitationDetected: true,
    severity: 20,
    statusLabel: 'Near target',
    improvementFromPrevious: 4,
    improvementPercentage: 3.4,
    improvementStatus: 'IMPROVING',
    timestampMs: Date.now() - 5000,
    durationMs: 3800,
  },
  repHistory: [],
};

const mockSavedSessions: PhysiosisSession[] = [
  {
    id: 'sess-001',
    exerciseId: 'shoulder-flexion',
    exercise: 'Standing Shoulder Flexion',
    startedAt: Date.now() - 86400000 * 2,
    endedAt: Date.now() - 86400000 * 2 + 120000,
    durationSeconds: 120,
    totalReps: 8,
    bestROM: 120,
    averageROM: 115,
    bestScore: 88,
    averageScore: 82,
    limitationsDetected: 1,
    averageDeviation: 45,
    averageSeverity: 20,
    firstRepROM: 115,
    lastRepROM: 118,
    improvementDegrees: 3,
    reps: Array.from({ length: 8 }, (_, i) => ({
      repNumber: i + 1,
      peakAngle: 115 + (i % 3),
      targetAngle: 165,
      romPercentage: Math.round(((115 + (i % 3)) / 165) * 100),
      deviation: 165 - (115 + (i % 3)),
      qualityScore: 82,
      limitationDetected: true,
      severity: 20,
      statusLabel: 'Limited' as const,
      improvementFromPrevious: i > 0 ? 1 : null,
      improvementPercentage: i > 0 ? 1 : null,
      improvementStatus: 'MAINTAINING' as const,
      timestampMs: Date.now() - 86400000 * 2 + i * 5000,
      durationMs: 3500,
    })),
  },
  {
    id: 'sess-002',
    exerciseId: 'shoulder-flexion',
    exercise: 'Standing Shoulder Flexion',
    startedAt: Date.now() - 86400000,
    endedAt: Date.now() - 86400000 + 120000,
    durationSeconds: 120,
    totalReps: 8,
    bestROM: 124,
    averageROM: 120,
    bestScore: 90,
    averageScore: 85,
    limitationsDetected: 1,
    averageDeviation: 40,
    averageSeverity: 15,
    firstRepROM: 120,
    lastRepROM: 123,
    improvementDegrees: 3,
    reps: Array.from({ length: 8 }, (_, i) => ({
      repNumber: i + 1,
      peakAngle: 120 + (i % 4),
      targetAngle: 165,
      romPercentage: Math.round(((120 + (i % 4)) / 165) * 100),
      deviation: 165 - (120 + (i % 4)),
      qualityScore: 85,
      limitationDetected: true,
      severity: 15,
      statusLabel: 'Near target' as const,
      improvementFromPrevious: i > 0 ? 1 : null,
      improvementPercentage: i > 0 ? 1 : null,
      improvementStatus: 'IMPROVING' as const,
      timestampMs: Date.now() - 86400000 + i * 5000,
      durationMs: 3600,
    })),
  },
];

const mockInput: AIOrchestratorInput = {
  landmarks: mockLandmarks,
  activeExercise: mockExercise,
  sessionState: mockSessionState,
  isStreaming: true,
  selectedSide: 'right',
  currentAngle: 122,
  userReportedPain: 2,
  userReportedDizziness: false,
  balanceLossCount: 0,
  sessionInterrupted: false,
  savedSessions: mockSavedSessions,
  temporalPrediction: {
    phase: 'ASCENT',
    phaseProbabilities: { ASCENT: 0.93, PEAK: 0.05, DESCENT: 0.02, REST: 0.0, HOLD: 0.0 },
    quality: 0.88,
    compensation: 'NONE',
    compensationProbabilities: {
      TRUNK_LEAN: 0.01,
      SHOULDER_HIKE: 0.01,
      KNEE_VALGUS: 0.0,
      PELVIC_TILT: 0.0,
      FORWARD_HEAD: 0.0,
      NONE: 0.98,
    },
    repPhase: 'EARLY_CONCENTRIC',
    stability: 0.91,
    confidence: 0.93,
    architectureUsed: 'TCN',
    timestamp: Date.now(),
    latencyMs: 12,
  },
  voiceTextContext: {
    lastUserQuery: 'How is my elevation form?',
    lastAssistantReply: 'Your elevation is smooth at 122 degrees.',
    language: 'en',
    ragCitationsCount: 2,
    conversationTimestamp: Date.now(),
  },
};

// ── TEST 1: Orchestrator produces PatientRehabilitationState ─────────────────
console.log('--- TEST 1: Orchestrator Integration & Attribution ---');
const orchestrator = new PhysiosisAIOrchestrator();
const aiState = orchestrator.orchestrate(mockInput);

assert(aiState.patientState !== undefined && aiState.patientState !== null, 'Orchestrator attaches patientState to PhysiosisAIState');
const pState = aiState.patientState;

// ── TEST 2: Verify all 13 top-level properties exist ─────────────────────────
console.log('\n--- TEST 2: All 13 Required Top-Level Properties Exist ---');
const REQUIRED_PROPERTIES = [
  'currentExercise',
  'laterality',
  'currentROM',
  'targetROM',
  'quality',
  'compensation',
  'symptoms',
  'confidence',
  'baseline',
  'trend',
  'safety',
  'recommendation',
  'nextAction',
] as const;

for (const prop of REQUIRED_PROPERTIES) {
  assert(prop in pState, `Top-level property "${prop}" exists on patientState`);
}

// ── TEST 3: Universal Attributed Envelope Format ─────────────────────────────
console.log('\n--- TEST 3: Universal Attributed Envelope Validation ---');
function isAttributedEnvelope(obj: any): obj is AttributedValue<any> {
  return (
    obj !== null &&
    typeof obj === 'object' &&
    'value' in obj &&
    typeof obj.source === 'string' &&
    obj.source.trim().length > 0 &&
    typeof obj.confidence === 'number' &&
    obj.confidence >= 0 &&
    obj.confidence <= 1 &&
    typeof obj.timestamp === 'number' &&
    obj.timestamp > 0
  );
}

for (const prop of REQUIRED_PROPERTIES) {
  const envelope = pState[prop];
  const valid = isAttributedEnvelope(envelope);
  assert(
    valid,
    `Property "${prop}" has valid AttributedValue envelope`,
    `source: "${envelope?.source}", confidence: ${envelope?.confidence}, timestamp: ${envelope?.timestamp}`
  );
}

// ── TEST 4: Prompt-Specified Example (currentROM) ---
console.log('\n--- TEST 4: Prompt-Specified Example (currentROM) ---');
// Prompt Example:
// currentROM: {
//   value: 122,
//   source: "YOLO+Kinematics",
//   confidence: 0.94,
//   timestamp: ...
// }
assert(pState.currentROM.value === 122, 'currentROM.value is 122');
assert(pState.currentROM.source.includes('YOLO+Kinematics'), `currentROM.source is "${pState.currentROM.source}"`);
assert(pState.currentROM.confidence >= 0.9, `currentROM.confidence is ${pState.currentROM.confidence} (>= 0.90)`);
assert(pState.currentROM.timestamp > 0, `currentROM.timestamp is valid timestamp (${pState.currentROM.timestamp})`);

// ── TEST 5: 9 Multimodal Dimensions Integration ──────────────────────────────
console.log('\n--- TEST 5: Integration of 9 Multimodal Telemetry Dimensions ---');
assert(pState.multimodalStreams?.landmarks3D !== null, 'Dimension 1 (Pose): Landmarks 3D captured');
assert(pState.quality.value.angularVelocity !== undefined, 'Dimension 2 (Kinematics): Angular velocity captured');
assert(typeof pState.compensation.value.detected === 'boolean', 'Dimension 3 (Posture Compensation): Compensation detected flag captured');
assert(pState.multimodalStreams?.temporalPrediction?.architectureUsed === 'TCN', 'Dimension 4 (Temporal Movement): TCN prediction captured');
assert(pState.symptoms.value.painScore === 2, 'Dimension 5 (Patient Symptoms): User-reported pain score (2/10) captured');
assert(pState.baseline.value.status === 'BASELINE_AVAILABLE', 'Dimension 6 (Session History): Patient baseline status available');
assert(pState.currentExercise.value.id === 'shoulder-flexion', 'Dimension 7 (Exercise Metadata): Curated exercise definition captured');
assert(pState.safety.value.rehabilitationSafetyState === 'SAFE', 'Dimension 8 (Safety State): Authoritative safety state captured');
assert(pState.multimodalStreams?.voiceTextInteraction?.lastUserQuery === 'How is my elevation form?', 'Dimension 9 (Voice/Text Interaction): Assistant conversation captured');

// ── TEST 6: Consumer Adapter 1 — 3D Viewer ───────────────────────────────────
console.log('\n--- TEST 6: Consumer Adapter 1 — 3D Viewer (Three.js Skeleton) ---');
const viewerInput = extract3DViewerInput(pState);
assert(viewerInput.currentAngle === 122, '3D Viewer receives currentAngle = 122');
assert(viewerInput.targetAngle === 165, '3D Viewer receives targetAngle = 165');
assert(viewerInput.laterality === 'right', '3D Viewer receives laterality = "right"');
assert(Array.isArray(viewerInput.highlightJoints), '3D Viewer receives highlightJoints array');
assert(typeof viewerInput.statusColour === 'string', '3D Viewer receives statusColour CSS variable');

// ── TEST 7: Consumer Adapter 2 — Guidance ────────────────────────────────────
console.log('\n--- TEST 7: Consumer Adapter 2 — Guidance (Analysis Card) ---');
const guidanceInput = extractGuidanceInput(pState);
assert(typeof guidanceInput.primaryInstruction === 'string' && guidanceInput.primaryInstruction.length > 0, 'Guidance receives non-empty primaryInstruction');
assert(typeof guidanceInput.actionInstruction === 'string', 'Guidance receives actionInstruction');
assert(typeof guidanceInput.directionalCue === 'string', 'Guidance receives directionalCue');
assert(guidanceInput.isSafe === true, 'Guidance receives isSafe flag');
assert(guidanceInput.qualityScore > 0, 'Guidance receives qualityScore');

// ── TEST 8: Consumer Adapter 3 — Report ──────────────────────────────────────
console.log('\n--- TEST 8: Consumer Adapter 3 — Report (Final Session Report) ---');
const reportSummary = extractReportSummary(pState);
assert(reportSummary.exerciseName === 'Standing Shoulder Flexion', 'Report receives exerciseName');
assert(reportSummary.targetROM === 165, 'Report receives targetROM = 165');
assert(reportSummary.currentROM === 122, 'Report receives currentROM = 122');
assert(typeof reportSummary.baselineComparison === 'string', 'Report receives baselineComparison string');
assert(typeof reportSummary.recommendationDosage === 'string', 'Report receives recommendationDosage');
assert(typeof reportSummary.rationale === 'string', 'Report receives patient rationale');

// ── TEST 9: Consumer Adapter 4 — Assistant ───────────────────────────────────
console.log('\n--- TEST 9: Consumer Adapter 4 — Assistant (Local Ollama RAG) ---');
const assistantContext = extractAssistantContext(pState);
assert(assistantContext.exercise === 'Standing Shoulder Flexion', 'Assistant receives exercise name');
assert(assistantContext.currentROM === 122, 'Assistant receives currentROM');
assert(assistantContext.targetROM === 165, 'Assistant receives targetROM');
assert(assistantContext.limitations?.some((l) => l.includes('pain')) ?? false, 'Assistant context captures pain limitation');
assert(assistantContext.patientState === pState, 'Assistant context carries full structured patientState');

// ── TEST 10: Consumer Adapter 5 — Recommendation Engine ──────────────────────
console.log('\n--- TEST 10: Consumer Adapter 5 — Recommendation Engine ---');
const recEngineInput = extractRecommendationEngineInput(pState);
assert(recEngineInput.rom.currentAngle === 122, 'Recommendation input has currentAngle = 122');
assert(recEngineInput.rom.targetAngle === 165, 'Recommendation input has targetAngle = 165');

const directRecommendation = RehabilitationRecommendationEngine.evaluatePatientState(pState);
assert(directRecommendation.recommendedExercise.id.length > 0, 'evaluatePatientState returns valid recommendation from registry');
assert(directRecommendation.sets > 0 && directRecommendation.repetitions > 0, 'Recommendation contains valid dosage');
assert(directRecommendation.explanation !== undefined, 'Recommendation contains explainable AI explanation');

// ── TEST 11: Consumer Adapter 6 — Progress Engine ────────────────────────────
console.log('\n--- TEST 11: Consumer Adapter 6 — Progress Engine ---');
const progressInput = extractProgressEngineInput(pState);
assert(progressInput.exerciseKey === 'shoulder-flexion', 'Progress engine receives exerciseKey');
assert(progressInput.baselineStatus === 'BASELINE_AVAILABLE', 'Progress engine receives baseline status');
assert(progressInput.typicalROM !== null && progressInput.typicalROM > 0, 'Progress engine receives typicalROM');
assert(progressInput.trend === 'improving' || progressInput.trend === 'stable', 'Progress engine receives trend');

// ── TEST 12: Confidence Normalization Guardrail ──────────────────────────────
console.log('\n--- TEST 12: Confidence Normalization Guardrail ---');
const c1 = createAttributedValue(100, 'Test', 95);    // 95% passed as percentage -> 0.95
const c2 = createAttributedValue(100, 'Test', 0.85);  // 0.85 passed as decimal -> 0.85
const c3 = createAttributedValue(100, 'Test', 150);   // Clamped to 1.0
const c4 = createAttributedValue(100, 'Test', -0.5);  // Clamped to 0.0

assert(c1.confidence === 0.95, 'createAttributedValue converts 95 to 0.95');
assert(c2.confidence === 0.85, 'createAttributedValue preserves 0.85');
assert(c3.confidence === 1.0, 'createAttributedValue clamps upper bound to 1.0');
assert(c4.confidence === 0.0, 'createAttributedValue clamps lower bound to 0.0');

// ── SUMMARY ──────────────────────────────────────────────────────────────────
console.log('\n================================================================');
console.log(`TOTAL TESTS: ${testsPassed + testsFailed}`);
console.log(`PASSED:      ${testsPassed}`);
console.log(`FAILED:      ${testsFailed}`);
console.log('================================================================');

if (testsFailed > 0) {
  process.exit(1);
} else {
  console.log('\n🎉 ALL MULTIMODAL PATIENT STATE VERIFICATION TESTS PASSED CLEANLY!\n');
}
