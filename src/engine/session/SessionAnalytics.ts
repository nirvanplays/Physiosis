/**
 * SessionAnalytics.ts
 * Analytics computation, session finalization, and advisory recommendation generation.
 */

import type { LiveSessionState, PhysiosisSession, RecordedLimitation, SessionEndReason } from './SessionTypes';
import { getExerciseSuggestion } from '../feedback/SuggestionLibrary';
import { calculateMovementProgress } from './SessionProgress';
import { RehabilitationSafetyEngine } from '../safety/RehabilitationSafetyEngine';

/**
 * Construct a finalized PhysiosisSession from a live session state snapshot.
 * Returns null if the session contains no completed repetitions.
 */
export function buildPhysiosisSession(
  state: LiveSessionState,
  exerciseName: string = 'Shoulder Flexion',
  exerciseId: string = 'shoulder-flexion',
  endedReason: SessionEndReason = 'manual',
  targetAngle: number = 165,
  patientId?: string,
  laterality: 'left' | 'right' | 'bilateral' = 'right'
): PhysiosisSession | null {
  const reps = state.repHistory;
  if (!reps || reps.length === 0) return null;

  const count = reps.length;
  const startedAt = state.startTimeMs ?? Date.now() - state.metrics.elapsedMs;
  const endedAt = Date.now();
  const durationSeconds = Math.max(1, Math.round(state.metrics.elapsedMs / 1000));

  let bestROM = 0;
  let sumROM = 0;
  let bestScore = 0;
  let sumScore = 0;
  let sumDeviation = 0;
  let sumSeverity = 0;
  let limitationsDetected = 0;

  for (const r of reps) {
    if (r.peakAngle > bestROM) bestROM = r.peakAngle;
    sumROM += r.peakAngle;

    if (r.qualityScore > bestScore) bestScore = r.qualityScore;
    sumScore += r.qualityScore;

    sumDeviation += r.deviation;
    sumSeverity += r.severity;
    if (r.limitationDetected) limitationsDetected++;
  }

  const averageROM = Math.round(sumROM / count);
  const averageScore = Math.round(sumScore / count);
  const averageDeviation = Math.round(sumDeviation / count);
  const averageSeverity = Math.round(sumSeverity / count);

  const firstRepROM = reps[0]?.peakAngle ?? null;
  const lastRepROM = reps[count - 1]?.peakAngle ?? null;
  const firstRepPeak = firstRepROM;
  const lastRepPeak = lastRepROM;
  const netROMChange =
    firstRepROM !== null && lastRepROM !== null && count > 1
      ? lastRepROM - firstRepROM
      : null;
  const improvementDegrees = netROMChange;

  let sumImprovements = 0;
  let improvementCount = 0;
  for (let i = 1; i < count; i++) {
    if (reps[i].improvementFromPrevious !== null) {
      sumImprovements += reps[i].improvementFromPrevious!;
      improvementCount++;
    }
  }
  const averageRepImprovement =
    improvementCount > 0 ? Math.round((sumImprovements / improvementCount) * 10) / 10 : null;

  // Build limitations array mapped to curated SuggestionLibrary
  const limitations: RecordedLimitation[] = [];
  if (limitationsDetected > 0) {
    const suggestion = getExerciseSuggestion(exerciseId);
    limitations.push({
      limitationId: exerciseId,
      observedValue: bestROM,
      targetValue: targetAngle,
      suggestionId: suggestion?.id ?? 'shoulder_rom',
    });
  }

  // Calculate estimated movement progress and trend across reps
  const baselineROM = firstRepROM ?? bestROM;
  const latestROM = lastRepROM ?? bestROM;
  const progressResult = calculateMovementProgress(baselineROM, latestROM, targetAngle);

  let sumPosturalScore = 0;
  let posturalScoreCount = 0;
  let compensationsCount = 0;
  const distinctCompensations = new Set<string>();

  for (const r of reps) {
    if (r.posturalScore !== undefined && r.posturalScore !== null) {
      sumPosturalScore += r.posturalScore;
      posturalScoreCount++;
    }
    if (r.detectedCompensations && r.detectedCompensations.length > 0) {
      compensationsCount++;
      r.detectedCompensations.forEach((c) => distinctCompensations.add(c));
    }
  }

  const averagePosturalScore =
    posturalScoreCount > 0 ? Math.round(sumPosturalScore / posturalScoreCount) : 94;

  const safetyAuditEvents = RehabilitationSafetyEngine.getSessionSafetyAudit();
  const hasEscalation = safetyAuditEvents.some((e) => e.state === 'ESCALATE');
  const hasStop = safetyAuditEvents.some((e) => e.state === 'STOP');
  const safetyNotice = hasEscalation
    ? 'Clinical escalation triggered: Contact your physiotherapist.'
    : hasStop
    ? "Exercise safety stop recorded: Please stop this exercise and follow your clinician's instructions."
    : undefined;

  return {
    id: `session-${startedAt}-${Math.random().toString(36).slice(2, 7)}`,
    startedAt,
    endedAt,
    durationSeconds,
    exercise: exerciseName,
    exerciseId,
    laterality,
    side: laterality,
    patientId,
    endedReason,
    totalReps: count,
    bestROM,
    averageROM,
    bestScore,
    averageScore,
    limitationsDetected,
    limitations,
    averageDeviation,
    averageSeverity,
    firstRepROM,
    lastRepROM,
    firstRepPeak,
    lastRepPeak,
    improvementDegrees,
    netROMChange,
    averageRepImprovement,
    movementProgress: progressResult.progressPercentage,
    trend: progressResult.trend,
    averagePosturalScore,
    compensationsCount,
    detectedCompensationsSummary: Array.from(distinctCompensations),
    safetyAuditEvents: safetyAuditEvents.length > 0 ? safetyAuditEvents : undefined,
    safetyNotice,
    reps,
  };
}

/**
 * Generate advisory guidance text for the Session Summary.
 * Strictly non-diagnostic and encouraging.
 */
export function generateAdvisoryGuidance(session: PhysiosisSession): string {
  const { limitationsDetected, totalReps, improvementDegrees, bestROM } = session;

  if (bestROM >= 155 && limitationsDetected === 0) {
    return 'Excellent session! You achieved the reference range of motion consistently across your repetitions with smooth control. Maintain this form in future sessions.';
  }

  if (improvementDegrees !== null && improvementDegrees >= 10) {
    return `Great progress during this session! Your shoulder range improved by +${improvementDegrees}° from Rep 1 to Rep ${totalReps}. Continue practicing with controlled movement and follow guidance from your physiotherapist.`;
  }

  if (limitationsDetected > 0) {
    return `During this session, your shoulder elevation remained below the selected reference target (165°). Continue practicing with steady, pain-free elevation and consult your physiotherapist for personalized range goals.`;
  }

  return 'Session completed. Continue practicing the prescribed rehabilitation exercise with controlled elevation and proper posture.';
}

/**
 * Format a timestamp into a human-readable date label.
 */
export function formatSessionDate(timestamp: number): string {
  const date = new Date(timestamp);
  const now = new Date();

  const isToday =
    date.getDate() === now.getDate() &&
    date.getMonth() === now.getMonth() &&
    date.getFullYear() === now.getFullYear();

  const isYesterday =
    new Date(now.setDate(now.getDate() - 1)).toDateString() === date.toDateString();

  const timeStr = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  if (isToday) return `Today at ${timeStr}`;
  if (isYesterday) return `Yesterday at ${timeStr}`;

  return `${date.toLocaleDateString([], { month: 'short', day: 'numeric' })} at ${timeStr}`;
}
