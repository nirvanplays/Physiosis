/**
 * PatientMovementProfileVerification.ts
 * PHYSIOSIS — PERSONAL MOVEMENT PROFILE PATCH 11
 * LONGITUDINAL MOVEMENT PROFILE & MULTI-METRIC TREND VERIFICATION
 *
 * Verifies:
 *   1. Track per exercise:
 *      - ROM, quality, symmetry, movement speed, rep consistency,
 *        compensation frequency, confidence, session duration, adherence.
 *   2. Output MovementProfile matching Patch 11 contract:
 *      - exercise, baselineROM, recentROM, bestROM, qualityTrend,
 *        symmetryTrend, compensationTrend, consistency, confidence.
 *   3. Strict non-diagnostic invariant:
 *      - Zero mentions of "diagnosis", "medical prognosis", "recovery certainty", "cured".
 *      - Enforces approved terms: "movement profile", "performance trend", "observed progress".
 *   4. Separately selectable trends:
 *      - ROM trend, quality trend, compensation trend, consistency trend.
 *      - Inverted polarity for compensation (declining compensation rate = improving!).
 *   5. Adherence and duration tracking across historical sessions.
 */

import { PatientMovementProfileEngine } from '../PatientMovementProfileEngine';
import type { PhysiosisSession, RepResult } from '../../session/SessionTypes';

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
function createRep(repNumber: number, peakAngle: number, qualityScore = 85, limitation = false): RepResult {
  return {
    repNumber,
    peakAngle,
    targetAngle: 165,
    romPercentage: Math.round((peakAngle / 165) * 100),
    deviation: Math.max(0, 165 - peakAngle),
    qualityScore,
    limitationDetected: limitation,
    severity: limitation ? 30 : 0,
    statusLabel: peakAngle >= 165 ? 'Target reached' : peakAngle >= 140 ? 'Near target' : 'Limited',
    improvementFromPrevious: null,
    improvementPercentage: null,
    improvementStatus: 'MAINTAINING',
    timestampMs: Date.now(),
  };
}

function createSession(
  id: string,
  startedAt: number,
  bestROM: number,
  avgQuality: number,
  compensationsCount: number,
  repsCount = 10,
  durationSeconds = 180
): PhysiosisSession {
  const reps = Array.from({ length: repsCount }, (_, i) =>
    createRep(i + 1, bestROM - (i % 2) * 2, avgQuality, compensationsCount > 0 && i < compensationsCount)
  );

  return {
    id,
    exerciseId: 'shoulder_flexion',
    exercise: 'Shoulder Flexion',
    startedAt,
    endedAt: startedAt + durationSeconds * 1000,
    durationSeconds,
    totalReps: repsCount,
    validReps: repsCount,
    bestROM,
    averageROM: bestROM - 2,
    targetAngle: 165,
    averagePosturalScore: avgQuality,
    averageQuality: avgQuality,
    averageSymmetry: 92,
    averageSpeed: 24,
    compensationsCount,
    limitationsDetected: compensationsCount,
    reps,
    completedWithoutDistress: true,
  } as any;
}

const NOW = Date.now();
const ONE_DAY = 24 * 60 * 60 * 1000;

// Five ascending sessions over 5 days (improving ROM, improving quality, declining compensation)
const FIVE_SESSIONS: PhysiosisSession[] = [
  createSession('s1', NOW - 5 * ONE_DAY, 130, 75, 4), // 4/10 = 40% comp
  createSession('s2', NOW - 4 * ONE_DAY, 136, 78, 3), // 30% comp
  createSession('s3', NOW - 3 * ONE_DAY, 142, 82, 2), // 20% comp
  createSession('s4', NOW - 2 * ONE_DAY, 148, 86, 1), // 10% comp
  createSession('s5', NOW - 1 * ONE_DAY, 155, 90, 0), // 0% comp
];

// ============================================================================
// TEST SUITE 1: OUTPUT MOVEMENT PROFILE SCHEMA
// ============================================================================
test('1a. Generates complete MovementProfile with all required fields', () => {
  const profile = PatientMovementProfileEngine.computeMovementProfile(FIVE_SESSIONS, 'shoulder_flexion');

  assert(profile.exercise === 'Shoulder Flexion', 'Exercise name matches');
  assert(profile.exerciseId === 'shoulder_flexion', 'Exercise ID matches');
  assert(typeof profile.baselineROM === 'number' && profile.baselineROM > 0, 'baselineROM is valid number');
  assert(profile.recentROM === 155, 'recentROM reflects latest session peak (155°)');
  assert(profile.bestROM === 155, 'bestROM reflects highest peak achieved');
  assert(profile.qualityTrend !== undefined, 'qualityTrend exists');
  assert(profile.symmetryTrend !== undefined, 'symmetryTrend exists');
  assert(profile.compensationTrend !== undefined, 'compensationTrend exists');
  assert(profile.consistencyTrend !== undefined, 'consistencyTrend exists');
  assert(typeof profile.consistency === 'number', 'consistency is a number');
  assert(typeof profile.confidence === 'number' && profile.confidence >= 70, 'confidence is valid');
  assert(typeof profile.movementSpeed === 'number', 'movementSpeed is tracked');
  assert(typeof profile.sessionDuration.averageSeconds === 'number', 'sessionDuration is tracked');
  assert(profile.adherence !== undefined, 'adherence is tracked');
});

// ============================================================================
// TEST SUITE 2: MULTI-METRIC SELECTABLE TRENDS & DIRECTION LOGIC
// ============================================================================
test('2a. ROM Trend exhibits upward progression (improving)', () => {
  const profile = PatientMovementProfileEngine.computeMovementProfile(FIVE_SESSIONS, 'shoulder_flexion');

  assert(profile.romTrend.metric === 'ROM', 'Metric is ROM');
  assert(profile.romTrend.direction === 'improving', 'ROM direction is improving (130° -> 155°)');
  assert(profile.romTrend.slopePerSession > 0, 'ROM slope is positive');
  assert(profile.romTrend.currentValue === 155, 'Current value is 155°');
  assert(profile.romTrend.interpretation.includes('trending upwards'), 'Interpretation cites upward trend');
});

test('2b. Quality Trend exhibits positive gains (improving)', () => {
  const profile = PatientMovementProfileEngine.computeMovementProfile(FIVE_SESSIONS, 'shoulder_flexion');

  assert(profile.qualityTrend.metric === 'QUALITY', 'Metric is QUALITY');
  assert(profile.qualityTrend.direction === 'improving', 'Quality direction is improving (75 -> 90)');
  assert(profile.qualityTrend.slopePerSession > 0, 'Quality slope is positive');
  assert(profile.qualityTrend.currentValue === 90, 'Current quality is 90');
});

test('2c. Compensation Trend exhibits declining rate as IMPROVING (Inverted Polarity)', () => {
  const profile = PatientMovementProfileEngine.computeMovementProfile(FIVE_SESSIONS, 'shoulder_flexion');

  assert(profile.compensationTrend.metric === 'COMPENSATION', 'Metric is COMPENSATION');
  // Decreasing compensation frequency (40% -> 0%) is an IMPROVEMENT in motor control
  assert(
    profile.compensationTrend.direction === 'improving',
    'Declining compensation frequency is classified as improving motor control'
  );
  assert(profile.compensationTrend.slopePerSession < 0, 'Compensation slope is negative (-X%/session)');
  assert(profile.compensationTrend.currentValue === 0, 'Current compensation is 0%');
  assert(profile.compensationTrend.interpretation.includes('decreasing'), 'Interpretation notes decreasing compensations');
});

test('2d. Consistency Trend tracks control stability', () => {
  const profile = PatientMovementProfileEngine.computeMovementProfile(FIVE_SESSIONS, 'shoulder_flexion');

  assert(profile.consistencyTrend.metric === 'CONSISTENCY', 'Metric is CONSISTENCY');
  assert(typeof profile.consistencyTrend.direction === 'string', 'Direction is defined string');
  assert(profile.consistency >= 70, 'Repetition consistency score is strong');
});

// ============================================================================
// TEST SUITE 3: ADHERENCE & DURATION TRACKING
// ============================================================================
test('3a. Protocol adherence and session duration metrics are accurately derived', () => {
  const profile = PatientMovementProfileEngine.computeMovementProfile(FIVE_SESSIONS, 'shoulder_flexion');

  assert(profile.adherence.totalCompletedSessions === 5, 'Total completed sessions is 5');
  assert(profile.adherence.totalCompletedReps === 50, 'Total completed reps is 50 (5 * 10)');
  assert(profile.adherence.averageSessionDurationSeconds === 180, 'Average session duration is 180s');
  assert(profile.adherence.sessionsLast7Days === 5, 'Sessions in last 7 days is 5');
  assert(profile.adherence.adherenceScore >= 80, 'Adherence score is high for 5 sessions in 7 days');
  assert(profile.adherence.adherenceLevel === 'OPTIMAL', 'Adherence level is OPTIMAL');
});

// ============================================================================
// TEST SUITE 4: STRICT NON-DIAGNOSTIC TERMINOLOGY INVARIANT
// ============================================================================
test('4a. Output strictly forbids diagnostic and curative claims', () => {
  const profile = PatientMovementProfileEngine.computeMovementProfile(FIVE_SESSIONS, 'shoulder_flexion');

  const allText = JSON.stringify(profile).toLowerCase();

  assert(!allText.includes('diagnosis'), 'Output must NEVER contain "diagnosis"');
  assert(!allText.includes('medical prognosis'), 'Output must NEVER contain "medical prognosis"');
  assert(!allText.includes('recovery certainty'), 'Output must NEVER contain "recovery certainty"');
  assert(!allText.includes('cured'), 'Output must NEVER contain "cured"');
  assert(!allText.includes('healed'), 'Output must NEVER contain "healed"');
  assert(!allText.includes('recovery percentage'), 'Output must NEVER claim "recovery percentage"');

  // Enforces approved non-diagnostic terminology
  const statementLower = profile.observedProgressStatement.toLowerCase();
  assert(
    statementLower.includes('movement profile') ||
    statementLower.includes('observed progress') ||
    statementLower.includes('performance trend'),
    'Statement must use approved terminology: movement profile, observed progress, or performance trend'
  );
});

// ============================================================================
// TEST SUITE 5: EDGE CASES & EMPTY / SINGLE SESSION HANDLING
// ============================================================================
test('5a. Zero sessions returns initial calibration profile without throwing', () => {
  const profile = PatientMovementProfileEngine.computeMovementProfile([], 'shoulder_flexion');

  assert(profile.baselineROM === null, 'Baseline is null for 0 sessions');
  assert(profile.recentROM === null, 'Recent ROM is null for 0 sessions');
  assert(profile.bestROM === null, 'Best ROM is null for 0 sessions');
  assert(profile.romTrend.direction === 'insufficient data', 'Trend is insufficient data');
  assert(profile.adherence.totalCompletedSessions === 0, 'Completed sessions is 0');
  assert(profile.observedProgressStatement.includes('initial calibration phase'), 'Statement explains calibration phase');
});

test('5b. Single session returns single data point with insufficient data for regression', () => {
  const singleSession = [FIVE_SESSIONS[0]];
  const profile = PatientMovementProfileEngine.computeMovementProfile(singleSession, 'shoulder_flexion');

  assert(profile.recentROM === 130, 'Recent ROM is 130°');
  assert(profile.romTrend.direction === 'insufficient data', 'Single session cannot compute regression');
  assert(profile.chronologicalSessions.length === 1, 'Chronological count is 1');
  assert(profile.observedProgressStatement.includes('reference target'), 'Cites reference target');
});

console.log('\n==================================================');
console.log(`VERIFICATION SUMMARY: ${testsPassed} passed, ${testsFailed} failed`);
console.log('==================================================');

if (testsFailed > 0) {
  process.exit(1);
} else {
  console.log('ALL PERSONAL MOVEMENT PROFILE VERIFICATION TESTS PASSED.');
}
