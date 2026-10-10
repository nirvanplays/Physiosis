/**
 * SessionMetrics.ts
 * Computes aggregate session telemetry and trend analytics over recorded repetitions.
 */

import type { RepResult, LiveSessionMetrics } from './SessionTypes';
import { INITIAL_LIVE_SESSION_METRICS } from './SessionTypes';

/**
 * Calculate aggregate session metrics from rep history.
 *
 * @param repHistory Array of completed RepResult objects.
 * @param elapsedMs Total active session elapsed time in milliseconds.
 * @param totalDurationSeconds Total duration configured for session (e.g. 180s).
 */
export function calculateSessionMetrics(
  repHistory: RepResult[],
  elapsedMs: number = 0,
  totalDurationSeconds: number = 180,
): LiveSessionMetrics {
  const timeRemainingSeconds = Math.max(0, totalDurationSeconds - Math.floor(elapsedMs / 1000));

  if (!repHistory || repHistory.length === 0) {
    return {
      ...INITIAL_LIVE_SESSION_METRICS,
      elapsedMs,
      timeRemainingSeconds,
    };
  }

  const count = repHistory.length;
  let bestROM = 0;
  let sumROM = 0;
  let sumQuality = 0;
  let limitationsCount = 0;
  let sumImprovements = 0;
  let improvementCount = 0;

  for (let i = 0; i < count; i++) {
    const rep = repHistory[i];
    if (rep.peakAngle > bestROM) bestROM = rep.peakAngle;
    sumROM += rep.peakAngle;
    sumQuality += rep.qualityScore;
    if (rep.limitationDetected) limitationsCount++;

    if (rep.improvementFromPrevious !== null && i > 0) {
      sumImprovements += rep.improvementFromPrevious;
      improvementCount++;
    }
  }

  const averageROM = Math.round(sumROM / count);
  const averageQuality = Math.round(sumQuality / count);

  const firstRep = repHistory[0];
  const latestRep = repHistory[count - 1];
  const firstRepPeak = firstRep.peakAngle;
  const lastRepPeak = latestRep.peakAngle;

  const netROMChange = count > 1 ? lastRepPeak - firstRepPeak : 0;
  const improvementFromFirstRep = netROMChange;
  const averageRepImprovement =
    improvementCount > 0 ? Math.round((sumImprovements / improvementCount) * 10) / 10 : null;
  const currentSeverity = latestRep ? latestRep.severity : 0;

  // Trend feedback message
  let trendFeedback: string | null = null;
  if (netROMChange >= 8) {
    trendFeedback = `Range improving across repetitions (+${netROMChange}° from Rep 1).`;
  } else if (latestRep.peakAngle >= latestRep.targetAngle - 5) {
    trendFeedback = 'Target reference range consistently achieved with good form.';
  } else if (limitationsCount >= 2) {
    trendFeedback = 'Observed range below reference. Follow visual coach guidance.';
  }

  return {
    completedReps: count,
    bestROM,
    averageROM,
    averageQuality,
    limitationsCount,
    currentSeverity,
    firstRepPeak,
    lastRepPeak,
    improvementFromFirstRep,
    netROMChange,
    averageRepImprovement,
    elapsedMs,
    timeRemainingSeconds,
    trendFeedback,
  };
}
