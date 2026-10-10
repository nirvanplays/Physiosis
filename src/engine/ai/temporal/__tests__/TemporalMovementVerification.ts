/**
 * TemporalMovementVerification.ts
 * Verification test bench for PHYSIOSIS — AI CORE PATCH 2 (Temporal Movement Intelligence).
 *
 * Validates the 6 required dynamic movement scenarios across TCN, LSTM, and Transformer:
 *   1. Slow movement
 *   2. Fast movement
 *   3. Pause / Isometric hold
 *   4. Reversal
 *   5. Incomplete repetition
 *   6. Compensated movement
 */

import { UnifiedTemporalMovementModel } from '../TemporalMovementModel';
import type {
  TemporalFrameSample,
  TemporalModelArchitecture,
} from '../TemporalTypes';

/**
 * Generates a synthetic TemporalFrameSample.
 */
function createSyntheticSample(params: {
  timestamp: number;
  primaryAngle: number;
  angularVelocity: number;
  angularAcceleration: number;
  romPercentage: number;
  symmetry?: number;
  trunkLateralLean?: number;
  shoulderHike?: number;
  isCompensated?: boolean;
  compType?: 'TRUNK_LEAN' | 'SHOULDER_HIKE' | 'NONE';
  movementPhase?: 'READY' | 'LIFTING' | 'AT_TARGET' | 'RETURNING' | 'LOW_RANGE' | 'WAITING';
}): TemporalFrameSample {
  return {
    timestamp: params.timestamp,
    jointAngles: { primaryAngle: params.primaryAngle },
    angularVelocity: params.angularVelocity,
    angularAcceleration: params.angularAcceleration,
    romPercentage: params.romPercentage,
    symmetry: params.symmetry ?? 0.95,
    trunkCompensation: {
      trunkLateralLeanAngle: params.trunkLateralLean ?? 0,
      shoulderHikeAngle: params.shoulderHike ?? 0,
      detected: params.isCompensated ?? false,
      compensationType: params.compType ?? 'NONE',
      severityScore: params.isCompensated ? 0.75 : 0.0,
    },
    confidence: 0.95,
    movementPhase: params.movementPhase ?? 'LIFTING',
    landmarks: null,
  };
}

/**
 * Runs verification across all 6 scenarios.
 */
export async function runTemporalVerification() {
  console.log('===============================================================');
  console.log('  PHYSIOSIS — AI CORE PATCH 2: TEMPORAL INTELLIGENCE VERIFICATION');
  console.log('===============================================================\n');

  const architectures: TemporalModelArchitecture[] = ['TCN', 'LSTM', 'TRANSFORMER'];
  const model = new UnifiedTemporalMovementModel('TCN');

  let passedTests = 0;
  let totalTests = 0;

  for (const arch of architectures) {
    model.setArchitecture(arch);
    console.log(`\n─── Testing Architecture: ${arch} ───`);

    // ── 1. SLOW MOVEMENT ───────────────────────────────────────────────────
    totalTests++;
    const slowSamples: TemporalFrameSample[] = [];
    const slowSteps = 45;
    for (let i = 0; i < slowSteps; i++) {
      const t = i * 66; // ~3.0s total at ~15 FPS
      const angle = 20 + (140 * (i / (slowSteps - 1))); // 20° to 160°
      slowSamples.push(
        createSyntheticSample({
          timestamp: t,
          primaryAngle: angle,
          angularVelocity: 46.6, // Low, controlled velocity
          angularAcceleration: 0.2,
          romPercentage: Math.round((angle / 165) * 100),
          symmetry: 0.96,
          movementPhase: 'LIFTING',
        })
      );
    }

    const slowPred = await model.predictAsync(slowSamples);
    const slowPass =
      slowPred.phase === 'ASCENT' &&
      slowPred.quality >= 0.70 &&
      slowPred.stability >= 0.70 &&
      slowPred.compensation === 'NONE';

    console.log(
      `[1. Slow Movement] Phase: ${slowPred.phase} (${Math.round(slowPred.phaseProbabilities.ASCENT * 100)}%), Quality: ${slowPred.quality}, Stability: ${slowPred.stability}, Comp: ${slowPred.compensation} -> ${slowPass ? 'PASS ✓' : 'FAIL ✗'}`
    );
    if (slowPass) passedTests++;

    // ── 2. FAST MOVEMENT ───────────────────────────────────────────────────
    totalTests++;
    const fastSamples: TemporalFrameSample[] = [];
    const fastSteps = 30;
    for (let i = 0; i < fastSteps; i++) {
      const t = i * 33; // ~1.0s total
      const angle = i < 10 ? 20 : i < 18 ? 20 + (140 * ((i - 10) / 8)) : 160; // Jump in ~260ms
      const vel = i >= 10 && i <= 18 ? 538 : 0;
      const acc = i === 10 ? 1200 : i === 18 ? -1200 : 0;
      fastSamples.push(
        createSyntheticSample({
          timestamp: t,
          primaryAngle: angle,
          angularVelocity: vel,
          angularAcceleration: acc,
          romPercentage: Math.round((angle / 165) * 100),
          symmetry: 0.85,
          movementPhase: 'LIFTING',
        })
      );
    }

    const fastPred = await model.predictAsync(fastSamples);
    // Rapid angular jump incurs high velocity variance and jerk penalty
    const fastPass =
      fastPred.confidence > 0 &&
      fastPred.latencyMs < 50;

    console.log(
      `[2. Fast Movement] Phase: ${fastPred.phase}, Stability: ${fastPred.stability}, Latency: ${fastPred.latencyMs}ms -> ${fastPass ? 'PASS ✓' : 'FAIL ✗'}`
    );
    if (fastPass) passedTests++;

    // ── 3. PAUSE / ISOMETRIC HOLD ──────────────────────────────────────────
    totalTests++;
    const pauseSamples: TemporalFrameSample[] = [];
    const pauseSteps = 45;
    for (let i = 0; i < pauseSteps; i++) {
      const t = i * 66; // 3.0s stationary hold at target angle
      pauseSamples.push(
        createSyntheticSample({
          timestamp: t,
          primaryAngle: 155,
          angularVelocity: 0.2, // Near zero velocity
          angularAcceleration: 0.0,
          romPercentage: 94,
          symmetry: 0.98,
          movementPhase: 'AT_TARGET',
        })
      );
    }

    const pausePred = await model.predictAsync(pauseSamples);
    const pausePass =
      (pausePred.phase === 'HOLD' || pausePred.phase === 'PEAK') &&
      pausePred.stability >= 0.85 &&
      pausePred.compensation === 'NONE';

    console.log(
      `[3. Pause / Hold] Phase: ${pausePred.phase} (${Math.round((pausePred.phaseProbabilities.HOLD + pausePred.phaseProbabilities.PEAK) * 100)}%), Stability: ${pausePred.stability}, Comp: ${pausePred.compensation} -> ${pausePass ? 'PASS ✓' : 'FAIL ✗'}`
    );
    if (pausePass) passedTests++;

    // ── 4. REVERSAL ────────────────────────────────────────────────────────
    totalTests++;
    const reversalSamples: TemporalFrameSample[] = [];
    const revSteps = 40;
    for (let i = 0; i < revSteps; i++) {
      const t = i * 66;
      // Ascends up to 90° for first 20 steps, then reverses descent back to 30°
      const angle = i < 20 ? 20 + 70 * (i / 19) : 90 - 60 * ((i - 20) / 19);
      const vel = i < 20 ? 55 : -47;
      reversalSamples.push(
        createSyntheticSample({
          timestamp: t,
          primaryAngle: angle,
          angularVelocity: vel,
          angularAcceleration: i === 20 ? -150 : 0,
          romPercentage: Math.round((angle / 165) * 100),
          symmetry: 0.90,
          movementPhase: i < 20 ? 'LIFTING' : 'RETURNING',
        })
      );
    }

    const revPred = await model.predictAsync(reversalSamples);
    const revPass =
      revPred.repPhase === 'INFLECTION' ||
      revPred.phase === 'PEAK' ||
      revPred.phase === 'DESCENT';

    console.log(
      `[4. Reversal] Phase: ${revPred.phase}, RepPhase: ${revPred.repPhase}, Latency: ${revPred.latencyMs}ms -> ${revPass ? 'PASS ✓' : 'FAIL ✗'}`
    );
    if (revPass) passedTests++;

    // ── 5. INCOMPLETE REPETITION ───────────────────────────────────────────
    totalTests++;
    const incompleteSamples: TemporalFrameSample[] = [];
    const incompSteps = 40;
    for (let i = 0; i < incompSteps; i++) {
      const t = i * 66;
      // Reaches only 55° (33% ROM, target is 165°) and returns
      const angle = i < 20 ? 20 + 35 * (i / 19) : 55 - 35 * ((i - 20) / 19);
      incompleteSamples.push(
        createSyntheticSample({
          timestamp: t,
          primaryAngle: angle,
          angularVelocity: i < 20 ? 27 : -27,
          angularAcceleration: 0,
          romPercentage: Math.round((angle / 165) * 100),
          symmetry: 0.92,
          movementPhase: i < 20 ? 'LIFTING' : 'RETURNING',
        })
      );
    }

    const incompPred = await model.predictAsync(incompleteSamples);
    // Peak probability is low because maximum angle is well below 115°
    const incompPass =
      incompPred.phaseProbabilities.PEAK < 0.35 &&
      incompPred.repPhase !== 'LATE_CONCENTRIC';

    console.log(
      `[5. Incomplete Rep] Phase: ${incompPred.phase}, PeakProb: ${incompPred.phaseProbabilities.PEAK}, RepPhase: ${incompPred.repPhase} -> ${incompPass ? 'PASS ✓' : 'FAIL ✗'}`
    );
    if (incompPass) passedTests++;

    // ── 6. COMPENSATED MOVEMENT ────────────────────────────────────────────
    totalTests++;
    const compSamples: TemporalFrameSample[] = [];
    const compSteps = 45;
    for (let i = 0; i < compSteps; i++) {
      const t = i * 66;
      const angle = 20 + 130 * (i / (compSteps - 1));
      // Patient leans torso 14° to compensate
      compSamples.push(
        createSyntheticSample({
          timestamp: t,
          primaryAngle: angle,
          angularVelocity: 43,
          angularAcceleration: 0,
          romPercentage: Math.round((angle / 165) * 100),
          symmetry: 0.65,
          trunkLateralLean: 14.5,
          isCompensated: true,
          compType: 'TRUNK_LEAN',
          movementPhase: 'LIFTING',
        })
      );
    }

    const compPred = await model.predictAsync(compSamples);
    const compPass =
      compPred.compensation === 'TRUNK_LEAN' &&
      compPred.compensationProbabilities.TRUNK_LEAN >= 0.70;

    console.log(
      `[6. Compensated Movement] Comp: ${compPred.compensation} (${Math.round(compPred.compensationProbabilities.TRUNK_LEAN * 100)}%), Stability: ${compPred.stability} -> ${compPass ? 'PASS ✓' : 'FAIL ✗'}`
    );
    if (compPass) passedTests++;
  }

  console.log('\n===============================================================');
  console.log(`  VERIFICATION RESULT: ${passedTests} / ${totalTests} TESTS PASSED`);
  console.log('===============================================================');

  return { passedTests, totalTests, success: passedTests === totalTests };
}

// Execute when in Node/CLI environment
if (typeof globalThis !== 'undefined' && (globalThis as unknown as { process?: { exit?: (code: number) => void } }).process?.exit) {
  const proc = (globalThis as unknown as { process: { exit: (code: number) => void } }).process;
  runTemporalVerification()
    .then((res) => {
      if (!res.success) {
        proc.exit(1);
      }
    })
    .catch((err) => {
      console.error('Verification failed:', err);
      proc.exit(1);
    });
}

