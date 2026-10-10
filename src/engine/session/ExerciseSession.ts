/**
 * ExerciseSession.ts
 * Stateful session engine for live patient exercise tracking.
 *
 * Runs outside React's render loop, maintaining:
 *   - Active session lifecycle (IDLE -> READY -> ACTIVE -> PAUSED -> ENDING -> COMPLETED)
 *   - Strict 180-second (3-minute) countdown timer with drift-free synchronization
 *   - Repetition gating: reps are ONLY counted during ACTIVE session state
 *   - Consecutive rep-to-rep improvement analytics
 *   - Limitation tracking & aggregate session metrics
 */

import type { ShoulderFlexionAnalysis } from '../biomechanics/biomechanicsTypes';
import type { LiveSessionState, RepResult, SessionLifecycleState } from './SessionTypes';
import { INITIAL_LIVE_SESSION_STATE } from './SessionTypes';
import { analyzeRepetition } from './RepAnalyzer';
import { calculateSessionMetrics } from './SessionMetrics';

export class ExerciseSessionEngine {
  private state: LiveSessionState = { ...INITIAL_LIVE_SESSION_STATE };
  private lastKnownRepCount = 0;
  private timerInterval: ReturnType<typeof setInterval> | null = null;
  private elapsedMs = 0;
  private sessionDurationSeconds = 180; // 3-minute session
  private onAutoEndCallback: (() => void) | null = null;

  private currentRepStartTime: number | null = null;
  private currentRepPeakTime: number | null = null;

  constructor(durationSeconds = 180) {
    this.sessionDurationSeconds = durationSeconds;
  }

  get currentState(): Readonly<LiveSessionState> {
    return this.state;
  }

  get sessionState(): SessionLifecycleState {
    return this.state.sessionState;
  }

  get isSessionActive(): boolean {
    return this.state.sessionState === 'ACTIVE';
  }

  public setOnAutoEnd(callback: () => void): void {
    this.onAutoEndCallback = callback;
  }

  /** Set session state to READY (camera preview / preparing to exercise). */
  setReady(): void {
    if (this.state.sessionState === 'ACTIVE') return;
    this.state = {
      ...this.state,
      sessionState: 'READY',
    };
  }

  /**
   * Explicitly start a new 3-minute live rehabilitation session.
   * Resets transient session telemetry while preserving clean state.
   */
  start(durationSeconds = 180): void {
    this.stopTimer();
    this.sessionDurationSeconds = durationSeconds;
    this.elapsedMs = 0;
    this.lastKnownRepCount = 0;
    this.currentRepStartTime = null;
    this.currentRepPeakTime = null;

    const initialMetrics = calculateSessionMetrics([], 0, this.sessionDurationSeconds);

    this.state = {
      ...INITIAL_LIVE_SESSION_STATE,
      isActive: true,
      sessionState: 'ACTIVE',
      startTimeMs: Date.now(),
      metrics: initialMetrics,
    };
    this.startTimer();
  }

  /** Pause the active session timer and repetition recording. */
  pause(): void {
    if (this.state.sessionState !== 'ACTIVE') return;
    this.stopTimer();
    this.state = {
      ...this.state,
      sessionState: 'PAUSED',
    };
  }

  /** Resume the paused session timer and repetition recording. */
  resume(): void {
    if (this.state.sessionState !== 'PAUSED') return;
    this.state = {
      ...this.state,
      sessionState: 'ACTIVE',
    };
    this.startTimer();
  }

  /** Stop and finalize the session. */
  stop(finalState: 'COMPLETED' | 'IDLE' = 'COMPLETED'): void {
    this.stopTimer();
    this.state = {
      ...this.state,
      isActive: false,
      sessionState: finalState,
    };
  }

  /** Reset all session data to pristine Standby. */
  reset(): void {
    this.stopTimer();
    this.elapsedMs = 0;
    this.lastKnownRepCount = 0;
    this.currentRepStartTime = null;
    this.currentRepPeakTime = null;
    this.state = {
      ...INITIAL_LIVE_SESSION_STATE,
      sessionState: 'IDLE',
    };
  }

  /**
   * Process a frame from the live biomechanics analysis pipeline.
   * Gated: Repetitions are ONLY counted and recorded when sessionState === 'ACTIVE'.
   *
   * @param analysis Live snapshot from ExerciseKinematicsTracker.
   */
  update(analysis: ShoulderFlexionAnalysis): LiveSessionState {
    // If session is NOT active, do not accumulate repetitions or session history
    if (this.state.sessionState !== 'ACTIVE') {
      return this.state;
    }

    // Track active movement phase timestamps
    if (analysis.state === 'LIFTING' && this.currentRepStartTime === null) {
      this.currentRepStartTime = Date.now();
    }
    if (analysis.state === 'AT_TARGET' || analysis.state === 'LIFTING') {
      this.currentRepPeakTime = Date.now();
    }

    // Check if a new repetition was completed in this cycle
    if (analysis.repCount > this.lastKnownRepCount && analysis.lastRepPeak !== null) {
      const repNumber = analysis.repCount;
      this.lastKnownRepCount = repNumber;

      const previousRep =
        this.state.repHistory.length > 0
          ? this.state.repHistory[this.state.repHistory.length - 1]
          : null;

      const newRepResult = analyzeRepetition(
        repNumber,
        analysis.lastRepPeak,
        analysis.targetAngle,
        Date.now(),
        previousRep,
        this.currentRepStartTime ?? Date.now() - 3000,
        this.currentRepPeakTime ?? Date.now() - 1500
      );

      if (analysis.postureResult) {
        newRepResult.posturalScore = analysis.postureResult.overallPosturalScore;
        if (analysis.postureResult.compensations.length > 0) {
          newRepResult.detectedCompensations = analysis.postureResult.compensations.map(
            (c) => c.name
          );
        }
      }

      this.currentRepStartTime = null;
      this.currentRepPeakTime = null;

      const updatedHistory: RepResult[] = [...this.state.repHistory, newRepResult];

      let lastLimitationPeak = this.state.lastLimitationPeakAngle;
      if (newRepResult.limitationDetected) {
        lastLimitationPeak = newRepResult.peakAngle;
      }

      const updatedMetrics = calculateSessionMetrics(
        updatedHistory,
        this.elapsedMs,
        this.sessionDurationSeconds
      );

      this.state = {
        ...this.state,
        currentRepNumber: analysis.currentRep,
        repHistory: updatedHistory,
        latestRep: newRepResult,
        metrics: updatedMetrics,
        lastLimitationPeakAngle: lastLimitationPeak,
      };
    } else {
      // Just update current active rep index
      if (this.state.currentRepNumber !== analysis.currentRep) {
        this.state = {
          ...this.state,
          currentRepNumber: analysis.currentRep,
        };
      }
    }

    return this.state;
  }

  /** Get a readonly snapshot for React UI updates. */
  getSnapshot(): LiveSessionState {
    const timeRemainingSeconds = Math.max(
      0,
      this.sessionDurationSeconds - Math.floor(this.elapsedMs / 1000)
    );

    return {
      ...this.state,
      metrics: {
        ...this.state.metrics,
        elapsedMs: this.elapsedMs,
        timeRemainingSeconds,
      },
    };
  }

  private startTimer(): void {
    if (this.timerInterval !== null) return;

    this.timerInterval = setInterval(() => {
      if (this.state.sessionState === 'ACTIVE') {
        this.elapsedMs += 1000;
        const remaining = Math.max(0, this.sessionDurationSeconds - Math.floor(this.elapsedMs / 1000));

        this.state = {
          ...this.state,
          metrics: {
            ...this.state.metrics,
            elapsedMs: this.elapsedMs,
            timeRemainingSeconds: remaining,
          },
        };

        if (remaining <= 0) {
          this.stop('COMPLETED');
          if (this.onAutoEndCallback) {
            this.onAutoEndCallback();
          }
        }
      }
    }, 1000);
  }

  private stopTimer(): void {
    if (this.timerInterval !== null) {
      clearInterval(this.timerInterval);
      this.timerInterval = null;
    }
  }
}
