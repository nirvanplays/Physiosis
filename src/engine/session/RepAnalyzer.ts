import type { RepResult, RepStatusLabel, ImprovementStatus } from './SessionTypes';
import { clamp } from '../../utils/math';

/** Default limitation threshold ratio: peak < 85% of target (e.g. < 140.25° for 165°). */
export const LIMITATION_THRESHOLD_RATIO = 0.85;

/**
 * Analyze a completed repetition cycle with consecutive rep-to-rep comparison.
 *
 * @param repNumber Index of the repetition (1-based).
 * @param peakAngle Maximum movement metric achieved (degrees).
 * @param targetAngle Prescribed reference angle (degrees, e.g. 165°).
 * @param timestampMs Completion timestamp in milliseconds.
 * @param previousRep Previous repetition result for consecutive progress comparison.
 * @param startTimestamp Timestamp when the repetition began lifting.
 * @param peakTimestamp Timestamp when the peak was reached.
 */
export function analyzeRepetition(
  repNumber: number,
  peakAngle: number,
  targetAngle: number,
  timestampMs: number = Date.now(),
  previousRep?: RepResult | null,
  startTimestamp?: number,
  peakTimestamp?: number,
): RepResult {
  const safePeak = Math.max(0, Math.round(peakAngle));
  const deviation = Math.max(0, targetAngle - safePeak);
  const romPercentage = clamp(Math.round((safePeak / Math.max(1, targetAngle)) * 100), 0, 100);

  // Prototype movement quality score [0, 100]
  const qualityScore = clamp(
    Math.round(Math.sqrt(clamp(safePeak / Math.max(1, targetAngle), 0, 1)) * 100),
    0,
    100
  );

  // Limitation detected if peak is below 85% of target (e.g. 140° for 165°)
  const limitationThreshold = targetAngle * LIMITATION_THRESHOLD_RATIO;
  const limitationDetected = safePeak < limitationThreshold;

  // Prototype movement severity [0, 100] (0 = target achieved, 100 = 0° ROM)
  const severity = Math.round(clamp((targetAngle - safePeak) / Math.max(1, targetAngle), 0, 1) * 100);

  // Rep-to-Rep Improvement Delta
  let improvementFromPrevious: number | null = null;
  let improvementPercentage: number | null = null;
  let improvementStatus: ImprovementStatus = 'FIRST_REP';

  if (previousRep && typeof previousRep.peakAngle === 'number') {
    improvementFromPrevious = safePeak - previousRep.peakAngle;
    if (previousRep.peakAngle > 0) {
      improvementPercentage = Math.round(
        ((safePeak - previousRep.peakAngle) / previousRep.peakAngle) * 100
      );
    }
    if (improvementFromPrevious >= 3) {
      improvementStatus = 'IMPROVING';
    } else if (improvementFromPrevious <= -3) {
      improvementStatus = 'DECLINING';
    } else {
      improvementStatus = 'MAINTAINING';
    }
  }

  // Progress / Status label based on tolerance and target proximity
  let statusLabel: RepStatusLabel = 'Limited';
  if (safePeak >= targetAngle - 5) {
    statusLabel = 'Target reached';
  } else if (safePeak >= targetAngle - 25) {
    statusLabel = 'Near target';
  } else if (improvementStatus === 'IMPROVING') {
    statusLabel = 'Improving';
  } else {
    statusLabel = 'Limited';
  }

  // Patient-facing coaching feedback
  let coachingMessage = 'Good start — try reaching a little higher on the next repetition.';
  if (statusLabel === 'Target reached') {
    coachingMessage = 'Target reached — excellent range of motion!';
  } else if (statusLabel === 'Near target') {
    coachingMessage = 'Almost there — just a little more elevation to reach target.';
  } else if (improvementStatus === 'IMPROVING' && improvementFromPrevious !== null) {
    coachingMessage = `Nice improvement from the previous repetition (+${improvementFromPrevious}°).`;
  } else if (improvementStatus === 'MAINTAINING') {
    coachingMessage = 'Consistent movement height. Keep steady form.';
  } else if (improvementStatus === 'DECLINING' && improvementFromPrevious !== null) {
    coachingMessage = `Movement was ${Math.abs(improvementFromPrevious)}° lower on this repetition. Take your time.`;
  }

  const durationMs = startTimestamp ? Math.max(0, timestampMs - startTimestamp) : undefined;

  return {
    repNumber,
    peakAngle: safePeak,
    targetAngle,
    romPercentage,
    deviation,
    qualityScore,
    limitationDetected,
    severity,
    statusLabel,
    improvementFromPrevious,
    improvementPercentage,
    improvementStatus,
    coachingMessage,
    timestampMs,
    startTimestamp,
    peakTimestamp,
    endTimestamp: timestampMs,
    durationMs,
  };
}
