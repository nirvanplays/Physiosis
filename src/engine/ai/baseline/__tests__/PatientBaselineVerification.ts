/**
 * PatientBaselineVerification.ts
 * Verification Test Bench for PHYSIOSIS AI PERSONALIZATION PATCH 4.
 *
 * Verifies:
 *   1. Minimum data requirements & noise rejection ("Baseline available" vs "Insufficient history")
 *   2. Comprehensive empirical baseline kinematics calculation
 *   3. 3-Way Multi-Target Comparison (Reference Target vs Baseline vs Current)
 *   4. Strict compliance: "Above your recent baseline." (Never "Recovered.")
 *   5. Statistical trend classification (improving | stable | declining | insufficient data) without invented recovery percentages
 *   6. Personalization: safe interim difficulty progression, rest suggestions, and sequencing
 */

declare const process: any;

import { PatientBaselineEngine } from '../PatientBaselineEngine';
import type { PhysiosisSession, RepResult, LiveSessionState } from '../../../session/SessionTypes';
import type { ExerciseDefinition } from '../../../exercise/ExerciseTypes';
import { getDefaultExercise } from '../../../exercise/ExerciseRegistry';



function makeMockRep(peakAngle: number, repNumber: number, durationMs = 3000, limitation = false): RepResult {
  return {
    repNumber,
    peakAngle,
    targetAngle: 165,
    romPercentage: Math.round((peakAngle / 165) * 100),
    deviation: 165 - peakAngle,
    qualityScore: 85,
    limitationDetected: limitation,
    severity: limitation ? 25 : 0,
    statusLabel: peakAngle >= 140 ? 'Near target' : 'Limited',
    improvementFromPrevious: 0,
    improvementPercentage: 0,
    improvementStatus: 'MAINTAINING',
    timestampMs: Date.now() + repNumber * 4000,
    durationMs,
  };
}

function makeMockSession(
  id: string,
  startedAt: number,
  durationSeconds: number,
  peakAngles: number[],
  exercise = 'Shoulder Flexion'
): PhysiosisSession {
  const reps = peakAngles.map((angle, idx) => makeMockRep(angle, idx + 1));
  const bestROM = peakAngles.length > 0 ? Math.max(...peakAngles) : 0;
  const averageROM =
    peakAngles.length > 0 ? peakAngles.reduce((a, b) => a + b, 0) / peakAngles.length : 0;

  return {
    id,
    startedAt,
    endedAt: startedAt + durationSeconds * 1000,
    durationSeconds,
    exercise,
    exerciseId: 'shoulder-flexion',
    totalReps: peakAngles.length,
    bestROM,
    averageROM,
    bestScore: 90,
    averageScore: 85,
    limitationsDetected: peakAngles.filter((a) => a < 140).length,
    averageDeviation: 165 - averageROM,
    averageSeverity: 10,
    firstRepROM: peakAngles[0] ?? null,
    lastRepROM: peakAngles[peakAngles.length - 1] ?? null,
    improvementDegrees: null,
    averagePosturalScore: 92,
    reps,
  };
}

export function runPatientBaselineVerification(): {
  totalTests: number;
  passed: number;
  failed: number;
  results: Array<{ name: string; status: 'PASS' | 'FAIL'; details: string }>;
} {
  const results: Array<{ name: string; status: 'PASS' | 'FAIL'; details: string }> = [];

  const assert = (name: string, condition: boolean, details: string) => {
    if (condition) {
      results.push({ name, status: 'PASS', details });
    } else {
      results.push({ name, status: 'FAIL', details: `FAILED: ${details}` });
    }
  };

  const exerciseDef: ExerciseDefinition = getDefaultExercise();



  // ── TEST 1: Minimum Data Eligibility & Noise Filtering ───────────────────────
  {
    // Test 1a: Zero sessions
    const b0 = PatientBaselineEngine.computeExerciseBaseline([], 'shoulder-flexion');
    assert(
      'T1a: Zero sessions returns INSUFFICIENT_HISTORY',
      b0.status === 'INSUFFICIENT_HISTORY' && b0.totalCompletedSessions === 0,
      `Expected INSUFFICIENT_HISTORY, got ${b0.status}`
    );

    // Test 1b: Corrupted / too short session (< 30s)
    const shortSession = makeMockSession('s-short', Date.now(), 15, [120, 125, 128]);
    const bShort = PatientBaselineEngine.computeExerciseBaseline([shortSession], 'shoulder-flexion');
    assert(
      'T1b: Rejects session under 30 seconds',
      bShort.status === 'INSUFFICIENT_HISTORY' && bShort.totalCompletedSessions === 0,
      'Short duration sessions must be rejected from baseline computation'
    );

    // Test 1c: Only 1 session with 3 reps (< 2 sessions, < 6 reps threshold)
    const oneSession = makeMockSession('s-one', Date.now(), 60, [120, 125, 128]);
    const bOne = PatientBaselineEngine.computeExerciseBaseline([oneSession], 'shoulder-flexion');
    assert(
      'T1c: 1 session below minimum threshold returns INSUFFICIENT_HISTORY',
      bOne.status === 'INSUFFICIENT_HISTORY' && bOne.totalCompletedSessions === 1,
      `Requires at least 2 completed sessions. Got: ${bOne.totalCompletedSessions}`
    );
  }

  // ── TEST 2: Valid Empirical Baseline Calculation ─────────────────────────────
  {
    const s1 = makeMockSession('s-1', 1000000, 120, [120, 125, 128, 126, 130]);
    const s2 = makeMockSession('s-2', 2000000, 120, [125, 130, 132, 128, 135]);

    const b = PatientBaselineEngine.computeExerciseBaseline([s1, s2], 'shoulder-flexion');

    assert(
      'T2a: Baseline Available with 2 sessions & 10 reps',
      b.status === 'BASELINE_AVAILABLE' && b.totalCompletedSessions === 2 && b.totalCompletedReps === 10,
      `Got status: ${b.status}, reps: ${b.totalCompletedReps}`
    );

    assert(
      'T2b: Best ROM matches peak valid repetition',
      b.bestROM === 135,
      `Expected bestROM 135, got ${b.bestROM}`
    );

    assert(
      'T2c: Typical ROM (trimmed mean) is calculated safely',
      b.typicalROM >= 126 && b.typicalROM <= 130,
      `Expected typicalROM ~128°, got ${b.typicalROM}°`
    );

    assert(
      'T2d: Rep Consistency is high for steady reps',
      b.repConsistency >= 85,
      `Expected consistency >= 85%, got ${b.repConsistency}%`
    );
  }

  // ── TEST 3: Three-Way Comparison (The Exact Prompt Example) ──────────────────
  {
    // Mock baseline: Typical ROM = 128°, Target = 165°, Current = 139°
    const mockBaseline = {
      exerciseId: 'shoulder-flexion',
      exerciseName: 'Shoulder Flexion',
      status: 'BASELINE_AVAILABLE' as const,
      eligibilityReason: 'Verified across qualifying sessions.',
      totalCompletedSessions: 3,
      totalCompletedReps: 15,
      bestROM: 142,
      typicalROM: 128,
      medianROM: 128,
      quality: 88,
      symmetry: 94,
      movementSpeed: 45,
      repConsistency: 92,
      compensationFrequency: 10,
      lastSessionDate: Date.now(),
    };

    const comp = PatientBaselineEngine.compareWithBaseline(139, mockBaseline, 165);

    assert(
      'T3a: Exact Prompt Output: "Above your recent baseline."',
      comp.comparisonStatement === 'Above your recent baseline.',
      `Expected "Above your recent baseline.", got "${comp.comparisonStatement}"`
    );

    assert(
      'T3b: Strict Non-Diagnostic Check: Statement NEVER says "Recovered."',
      !comp.comparisonStatement.toLowerCase().includes('recovered'),
      'Output must never claim patient is recovered'
    );

    assert(
      'T3c: Correct Delta vs Baseline (+11°)',
      comp.deltaVsBaseline === 11,
      `Expected delta +11°, got ${comp.deltaVsBaseline}°`
    );

    assert(
      'T3d: Correct Deviation from Clinical Reference Target (26°)',
      comp.deviationFromReference === 26,
      `Expected 26° remaining to target, got ${comp.deviationFromReference}°`
    );
  }

  // ── TEST 4: Statistical Trend Logic (No Invented Percentages) ─────────────────
  {
    // 4a: Ascending trajectory across 4 sessions
    const sInc = [
      makeMockSession('t-1', 1000, 120, [120, 122, 121]),
      makeMockSession('t-2', 2000, 120, [126, 128, 127]),
      makeMockSession('t-3', 3000, 120, [132, 134, 133]),
      makeMockSession('t-4', 4000, 120, [138, 140, 139]),
    ];
    const trendInc = PatientBaselineEngine.calculateStatisticalTrend(sInc, 'shoulder-flexion');
    assert(
      'T4a: Ascending sessions classified as "improving"',
      trendInc.trend === 'improving' && trendInc.slopeDegreesPerSession > 0,
      `Expected "improving", got "${trendInc.trend}" (slope: ${trendInc.slopeDegreesPerSession})`
    );

    // 4b: Consistent flat trajectory
    const sStable = [
      makeMockSession('ts-1', 1000, 120, [128, 127, 128]),
      makeMockSession('ts-2', 2000, 120, [128, 129, 128]),
      makeMockSession('ts-3', 3000, 120, [127, 128, 128]),
    ];
    const trendStable = PatientBaselineEngine.calculateStatisticalTrend(sStable, 'shoulder-flexion');
    assert(
      'T4b: Stable sessions classified as "stable"',
      trendStable.trend === 'stable',
      `Expected "stable", got "${trendStable.trend}"`
    );

    // 4c: Declining trajectory
    const sDec = [
      makeMockSession('td-1', 1000, 120, [140, 142, 140]),
      makeMockSession('td-2', 2000, 120, [134, 132, 133]),
      makeMockSession('td-3', 3000, 120, [126, 125, 126]),
      makeMockSession('td-4', 4000, 120, [118, 119, 117]),
    ];
    const trendDec = PatientBaselineEngine.calculateStatisticalTrend(sDec, 'shoulder-flexion');
    assert(
      'T4c: Declining sessions classified as "declining"',
      trendDec.trend === 'declining' && trendDec.slopeDegreesPerSession < 0,
      `Expected "declining", got "${trendDec.trend}" (slope: ${trendDec.slopeDegreesPerSession})`
    );

    // 4d: Insufficient sessions (< 2)
    const trendNone = PatientBaselineEngine.calculateStatisticalTrend([sDec[0]], 'shoulder-flexion');
    assert(
      'T4d: Single session classified as "insufficient data"',
      trendNone.trend === 'insufficient data',
      `Expected "insufficient data", got "${trendNone.trend}"`
    );
  }

  // ── TEST 5: Personalization & Clinical Safety Boundaries ─────────────────────
  {
    const mockBaseline = {
      exerciseId: 'shoulder-flexion',
      exerciseName: 'Shoulder Flexion',
      status: 'BASELINE_AVAILABLE' as const,
      eligibilityReason: 'Verified.',
      totalCompletedSessions: 3,
      totalCompletedReps: 15,
      bestROM: 142,
      typicalROM: 128,
      medianROM: 128,
      quality: 90,
      symmetry: 95,
      movementSpeed: 45,
      repConsistency: 92,
      compensationFrequency: 10,
      lastSessionDate: Date.now(),
    };

    const p = PatientBaselineEngine.generatePersonalization(mockBaseline, null, exerciseDef);

    // 5a: Progressive interim difficulty milestone
    assert(
      'T5a: Generates safe interim milestone (128° + 10° = 138°)',
      p.difficultyProgression.interimTargetAngle === 138,
      `Expected interim target 138°, got ${p.difficultyProgression.interimTargetAngle}°`
    );

    assert(
      'T5b: Milestone never exceeds clinical reference target (165°)',
      p.difficultyProgression.interimTargetAngle <= exerciseDef.targetAngle,
      'Interim target must not exceed clinical reference target'
    );

    // 5c: Exercise sequencing
    assert(
      'T5c: High consistency/low compensation sequenced as WARM_UP',
      p.exerciseSequencing.recommendedPhase === 'WARM_UP',
      `Expected WARM_UP, got ${p.exerciseSequencing.recommendedPhase}`
    );

    // 5d: Intra-session fatigue detection triggers rest suggestion
    const fatigueSessionState: LiveSessionState = {
      isActive: true,
      sessionState: 'ACTIVE',
      startTimeMs: Date.now() - 60000,
      currentRepNumber: 4,
      repHistory: [
        makeMockRep(135, 1),
        makeMockRep(130, 2),
        makeMockRep(124, 3), // Declining rep
        makeMockRep(116, 4), // Further declining rep
      ],
      latestRep: makeMockRep(116, 4),
      metrics: {
        completedReps: 4,
        bestROM: 135,
        averageROM: 126,
        averageQuality: 80,
        limitationsCount: 2,
        currentSeverity: 20,
        firstRepPeak: 135,
        lastRepPeak: 116,
        improvementFromFirstRep: -19,
        netROMChange: -19,
        averageRepImprovement: -6,
        elapsedMs: 60000,
        timeRemainingSeconds: 120,
        trendFeedback: 'Declining',
      },
      lastLimitationPeakAngle: 116,
    };

    const pFatigue = PatientBaselineEngine.generatePersonalization(
      mockBaseline,
      fatigueSessionState,
      exerciseDef
    );

    assert(
      'T5d: Intra-session consecutive drop triggers rest recommendation',
      pFatigue.restSuggestion.shouldRest === true && pFatigue.restSuggestion.recommendedRestSeconds === 30,
      'Fatigue pattern must trigger rest suggestion'
    );
  }

  const passed = results.filter((r) => r.status === 'PASS').length;
  const failed = results.filter((r) => r.status === 'FAIL').length;

  return {
    totalTests: results.length,
    passed,
    failed,
    results,
  };
}

// Auto-run when executed directly in Node
if (typeof process !== 'undefined' && process.argv && process.argv[1]?.includes('PatientBaselineVerification')) {
  console.log('======================================================================');
  console.log('  PHYSIOSIS — AI PERSONALIZATION PATCH 4: PATIENT BASELINE VERIFICATION');
  console.log('======================================================================');
  const res = runPatientBaselineVerification();
  for (const r of res.results) {
    console.log(`[${r.status}] ${r.name}`);
    if (r.status === 'FAIL') console.log(`       ${r.details}`);
  }
  console.log('----------------------------------------------------------------------');
  console.log(`Total: ${res.totalTests} | Passed: ${res.passed} | Failed: ${res.failed}`);
  if (res.failed > 0) {
    process.exit(1);
  } else {
    console.log('All verification checks passed successfully!');
  }
}
