/**
 * RehabilitationRecommendationVerification.ts
 * Verification Test Bench for PHYSIOSIS AI RECOMMENDATION PATCH 5.
 *
 * Verifies:
 *   1. Curated Registry Constraint: output is strictly from getAllExercises().
 *   2. Medical Guardrails: Zero medication, zero medical diagnoses.
 *   3. Decision Tree 1: ROM below target + high confidence -> PROTOCOL.
 *   4. Decision Tree 2: Compensation increase -> reduces progression + corrective drill.
 *   5. Decision Tree 3: Safety flag -> SAFETY_RULE + stops progression + escalates.
 *   6. Decision Tree 4: Temporal model trigger -> TEMPORAL_MODEL paced cadence.
 *   7. Decision Tree 5: Patient baseline advancement -> PATIENT_BASELINE interim milestone.
 *   8. Strict Determinism & Reproducibility across 100 identical executions.
 */

declare const process: any;

import { RehabilitationRecommendationEngine } from '../RehabilitationRecommendationEngine';
import type { RehabilitationRecommendationInput } from '../RecommendationTypes';
import { getDefaultExercise, getAllExercises } from '../../exercise/ExerciseRegistry';

export function runRehabilitationRecommendationVerification(): {
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

  const defaultExercise = getDefaultExercise();
  const allCurated = getAllExercises();
  const allCuratedIds = new Set(allCurated.map((e) => e.id));

  const baseInput: RehabilitationRecommendationInput = {
    exercise: defaultExercise,
    rom: {
      currentAngle: 120,
      targetAngle: 165,
      romPercentage: 72,
      bestROM: 125,
    },
    movementQuality: {
      score: 82,
      stability: 85,
      symmetry: 92,
      velocityQuality: 'OPTIMAL',
    },
    compensation: {
      detected: false,
      primaryFault: null,
      activeFaultsCount: 0,
      activeCompensatingJoints: [],
    },
    patientBaseline: {
      status: 'BASELINE_AVAILABLE',
      typicalROM: 128,
      medianROM: 128,
      bestROM: 135,
      repConsistency: 90,
      compensationFrequency: 10,
    },
    recentSessionTrend: {
      trend: 'improving',
      slopeDegreesPerSession: 2.1,
    },
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
    timestamp: 1725000000000,
  };

  // ── TEST 1: Decision Tree 1 — Standard Range Improvement (PROTOCOL) ──────────
  {
    const rec = RehabilitationRecommendationEngine.evaluate(baseInput);

    assert(
      'T1a: Standard range deficit with high confidence emits PROTOCOL',
      rec.sourceType === 'PROTOCOL',
      `Expected PROTOCOL, got ${rec.sourceType}`
    );

    assert(
      'T1b: Recommended exercise is from curated registry',
      allCuratedIds.has(rec.recommendedExercise.id),
      `Exercise ${rec.recommendedExercise.id} must be in curated registry`
    );

    assert(
      'T1c: Prescribes controlled range dosage (3 sets × 10 reps)',
      rec.sets === 3 && rec.repetitions === 10 && rec.holdDuration > 0,
      `Got ${rec.sets} sets, ${rec.repetitions} reps, ${rec.holdDuration}s hold`
    );
  }

  // ── TEST 2: Decision Tree 2 — Severe Compensation (Corrective Drill) ─────────
  {
    const severeInput: RehabilitationRecommendationInput = {
      ...baseInput,
      compensation: {
        detected: true,
        primaryFault: {
          type: 'TRUNK_LATERAL_LEAN',
          name: 'Trunk Lateral Lean',
          severity: 'SEVERE',
          measuredValue: 14.5,
          unit: '°',
        },
        activeFaultsCount: 1,
        activeCompensatingJoints: ['torso', 'spine'],
      },
    };

    const rec = RehabilitationRecommendationEngine.evaluate(severeInput);

    assert(
      'T2a: Severe compensation emits SAFETY_RULE',
      rec.sourceType === 'SAFETY_RULE',
      `Expected SAFETY_RULE, got ${rec.sourceType}`
    );

    assert(
      'T2b: Attaches corrective drill for trunk stabilization',
      rec.correctiveDrill !== null && rec.correctiveDrill?.id === 'drill_trunk_stabilization',
      `Expected drill_trunk_stabilization, got ${rec.correctiveDrill?.id}`
    );

    assert(
      'T2c: Regresses difficulty to beginner with safe dosage',
      rec.difficulty === 'beginner' && rec.sets === 2 && rec.repetitions === 8,
      `Expected beginner difficulty (2x8), got ${rec.difficulty} (${rec.sets}x${rec.repetitions})`
    );
  }

  // ── TEST 3: Decision Tree 3 — Moderate Compensation (Reduced Progression) ────
  {
    const modInput: RehabilitationRecommendationInput = {
      ...baseInput,
      compensation: {
        detected: true,
        primaryFault: {
          type: 'SHOULDER_HIKE',
          name: 'Shoulder Hike',
          severity: 'MODERATE',
          measuredValue: 6.2,
          unit: '°',
        },
        activeFaultsCount: 1,
        activeCompensatingJoints: ['shoulder'],
      },
    };

    const rec = RehabilitationRecommendationEngine.evaluate(modInput);

    assert(
      'T3a: Moderate compensation triggers progression reduction (interim target cut by 15°)',
      typeof rec.interimTargetAngle === 'number' && rec.interimTargetAngle === baseInput.rom.targetAngle - 15,
      `Expected target reduced to 150°, got ${rec.interimTargetAngle}°`
    );

    assert(
      'T3b: Source type reflects baseline/protocol adaptation',
      rec.sourceType === 'PATIENT_BASELINE' || rec.sourceType === 'PROTOCOL',
      `Got sourceType ${rec.sourceType}`
    );
  }

  // ── TEST 4: Decision Tree 4 — Safety Override & Escalation ──────────────────
  {
    const hazardInput: RehabilitationRecommendationInput = {
      ...baseInput,
      safetyState: {
        level: 'STOP_MOVEMENT',
        flaggedHazards: ['Excessive angular velocity (240°/s) exceeds tissue safety threshold.'],
      },
    };

    const rec = RehabilitationRecommendationEngine.evaluate(hazardInput);

    assert(
      'T4a: STOP_MOVEMENT forces immediate SAFETY_RULE override',
      rec.sourceType === 'SAFETY_RULE',
      `Expected SAFETY_RULE, got ${rec.sourceType}`
    );

    assert(
      'T4b: Flagged joint hazard sets clinicalEscalationRequired = true',
      rec.clinicalEscalationRequired === true,
      'Emergency safety stop must require clinical escalation'
    );

    assert(
      'T4c: Actionable step instructs immediate resting pause',
      rec.nextStep.toLowerCase().includes('stop active joint loading'),
      `Next step: ${rec.nextStep}`
    );
  }

  // ── TEST 5: Decision Tree 5 — Temporal Model Cadence Anomaly ─────────────────
  {
    const temporalInput: RehabilitationRecommendationInput = {
      ...baseInput,
      rom: {
        ...baseInput.rom,
        currentAngle: 100,
        romPercentage: 60,
      },
      temporalPrediction: {
        timestamp: Date.now(),
        phase: 'ASCENT',
        quality: 0.72,
        compensation: 'TRUNK_LEAN',
        confidence: 0.91,
        latencyMs: 0.04,
        stability: 0.75,
        architectureUsed: 'TCN',
        phaseProbabilities: {} as any,
        compensationProbabilities: {} as any,
        repPhase: 'EARLY_CONCENTRIC',
      },

    };

    const rec = RehabilitationRecommendationEngine.evaluate(temporalInput);

    assert(
      'T5a: Temporal anomaly triggers TEMPORAL_MODEL source',
      rec.sourceType === 'TEMPORAL_MODEL',
      `Expected TEMPORAL_MODEL, got ${rec.sourceType}`
    );

    assert(
      'T5b: Emits paced cadence pacing instruction',
      rec.nextStep.toLowerCase().includes('cadence') || rec.nextStep.toLowerCase().includes('3 seconds'),
      `Got nextStep: ${rec.nextStep}`
    );
  }

  // ── TEST 6: Decision Tree 6 — Patient Baseline Milestone Advancement ────────
  {
    const baselineInput: RehabilitationRecommendationInput = {
      ...baseInput,
      rom: {
        currentAngle: 145,
        targetAngle: 165,
        romPercentage: 88,
        bestROM: 145,
      },
      movementQuality: {
        score: 92,
        stability: 94,
        symmetry: 96,
        velocityQuality: 'OPTIMAL',
      },
      patientBaseline: {
        status: 'BASELINE_AVAILABLE',
        typicalROM: 135,
        medianROM: 135,
        bestROM: 145,
        repConsistency: 95,
        compensationFrequency: 5,
      },
    };

    const rec = RehabilitationRecommendationEngine.evaluate(baselineInput);

    assert(
      'T6a: Strong baseline alignment advances milestone via PATIENT_BASELINE',
      rec.sourceType === 'PATIENT_BASELINE',
      `Expected PATIENT_BASELINE, got ${rec.sourceType}`
    );

    assert(
      'T6b: Safe interim milestone (+10° above typical baseline)',
      rec.interimTargetAngle === 145,
      `Expected interimTarget 145° (135° + 10°), got ${rec.interimTargetAngle}°`
    );

    assert(
      'T6c: Milestone does not exceed clinical reference target (165°)',
      (rec.interimTargetAngle ?? 0) <= baselineInput.rom.targetAngle,
      'Interim milestone must be <= reference target'
    );
  }

  // ── TEST 7: Curated Registry Integrity & Non-Fabrication Check ───────────────
  {
    const allRegisteredIds = new Set(allCurated.map((e) => e.id));
    const testExercises = [
      defaultExercise,
      ...allCurated.slice(0, 5),
    ];

    let allPassedRegistry = true;
    for (const ex of testExercises) {
      const rec = RehabilitationRecommendationEngine.evaluate({
        ...baseInput,
        exercise: ex,
      });

      if (!allRegisteredIds.has(rec.recommendedExercise.id)) {
        allPassedRegistry = false;
        break;
      }
    }

    assert(
      'T7: All recommendations strictly return registered ExerciseDefinitions (Zero Hallucination)',
      allPassedRegistry,
      'Engine must never return a non-registry exercise'
    );
  }

  // ── TEST 8: Strict Determinism & Reproducibility (100 Executions) ────────────
  {
    const initialRun = JSON.stringify(RehabilitationRecommendationEngine.evaluate(baseInput));
    let isReproducible = true;

    for (let i = 0; i < 100; i++) {
      const currentRun = JSON.stringify(RehabilitationRecommendationEngine.evaluate(baseInput));
      if (currentRun !== initialRun) {
        isReproducible = false;
        break;
      }
    }

    assert(
      'T8: Recommendation is 100% deterministic and reproducible across 100 identical inputs',
      isReproducible,
      'Deterministic output required for clinical consistency'
    );
  }

  // ── TEST 9: Medical Compliance — Zero Medication & Zero Medical Diagnoses ────
  {
    const testInputs = [baseInput];
    const prohibitedTerms = [
      'mg',
      'nsaid',
      'ibuprofen',
      'paracetamol',
      'prescription',
      'injection',
      'pill',
      'tear',
      'syndrome',
      'scoliosis',
      'bursitis',
      'impingement syndrome',
      'recovered',
    ];

    let violationFound = false;
    let foundTerm = '';

    for (const inp of testInputs) {
      const rec = RehabilitationRecommendationEngine.evaluate(inp);
      const text = `${rec.reason} ${rec.nextStep}`.toLowerCase();

      for (const term of prohibitedTerms) {
        if (text.includes(term)) {
          violationFound = true;
          foundTerm = term;
          break;
        }
      }
    }

    assert(
      'T9: Strict Medical Compliance: Zero medication, zero diagnoses, zero "Recovered" claims',
      !violationFound,
      `Prohibited medical term detected: "${foundTerm}"`
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
if (typeof process !== 'undefined' && process.argv && process.argv[1]?.includes('RehabilitationRecommendationVerification')) {
  console.log('======================================================================');
  console.log('  PHYSIOSIS — AI RECOMMENDATION PATCH 5: VERIFICATION TEST BENCH');
  console.log('======================================================================');
  const res = runRehabilitationRecommendationVerification();
  for (const r of res.results) {
    console.log(`[${r.status}] ${r.name}`);
    if (r.status === 'FAIL') console.log(`       ${r.details}`);
  }
  console.log('----------------------------------------------------------------------');
  console.log(`Total: ${res.totalTests} | Passed: ${res.passed} | Failed: ${res.failed}`);
  if (res.failed > 0) {
    process.exit(1);
  } else {
    console.log('All recommendation verification checks passed successfully!');
  }
}
