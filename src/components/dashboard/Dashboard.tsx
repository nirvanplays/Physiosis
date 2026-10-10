/**
 * Dashboard.tsx
 * Unified root rehabilitation dashboard.
 *
 * Information Architecture:
 * 1. Top Header: Logo, Exercise Selection Switcher, Patient ID & Profile, Engine Status, Session Controls.
 * 2. Main Workspace: Live Engine Feed, Real-Time Analysis, Reference Exercise (Avatar Demo/Live).
 * 3. Lower Workspace: Session Health (Metrics & Rep Trend), Movement Progress Card, Recovery Trend (Multi-Session Progress).
 * 4. Supporting Overlays: Final Session Report Modal, Previous Sessions History Modal, Patient Profile Modal, Developer QA Panel.
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Header } from './Header';
import { LiveFeedCard } from './LiveFeedCard';
import { AnalysisCard } from './AnalysisCard';
import { ReferenceExerciseCard } from './ReferenceExerciseCard';
import { SessionHealthCard } from './SessionHealthCard';
import { MovementProgressCard } from '../session/MovementProgressCard';
import { MovementProfileCard } from '../session/MovementProfileCard';
import { SessionHistory } from '../session/SessionHistory';
import { FinalSessionReport } from '../session/FinalSessionReport';
import { PatientProfileModal } from '../profile/PatientProfileModal';
import { PresentationQAPanel } from '../dev/PresentationQAPanel';
import { PhysioAssistant } from '../assistant/PhysioAssistant';
import { ExerciseLibraryModal } from '../exercise/ExerciseLibraryModal';
import { Physiosis3DViewer } from '../three/Physiosis3DViewer';
import { usePoseTracking } from '../../hooks/usePoseTracking';
import { useAuth } from '../../context/AuthContext';
import { sessionService } from '../../services/sessionService';
import { getSessions, saveSession } from '../../engine/session/SessionStorage';
import { buildPhysiosisSession } from '../../engine/session/SessionAnalytics';
import { getExercise, getDefaultExercise } from '../../engine/exercise/ExerciseRegistry';
import type { PhysiosisSession, SessionEndReason } from '../../engine/session/SessionTypes';
import type { PhaseConfig } from '../../engine/exercise/PoseTypes';
import { AlertCircle, AlertTriangle, RefreshCw, X, FileText } from 'lucide-react';

export const Dashboard: React.FC = () => {
  const { profile, isAuthenticated, isBackendConfigured } = useAuth();

  // ── Authoritative Mode State (Single Source of Truth) ─────────────────────
  const [mode, setMode] = useState<'TUTORIAL' | 'PRACTICE' | 'LIVE' | 'DEMO'>('TUTORIAL');

  // Active exercise selection & Laterality state
  const [selectedExerciseId, setSelectedExerciseId] = useState<string>('shoulder-flexion');
  const [selectedSide, setSelectedSide] = useState<'left' | 'right' | 'bilateral'>('right');
  const [isLibraryModalOpen, setIsLibraryModalOpen] = useState<boolean>(false);
  const [dimensionMode, setDimensionMode] = useState<'3D' | '2D'>('3D');

  const baseExercise = getExercise(selectedExerciseId) ?? getDefaultExercise();
  const activeExercise = React.useMemo(() => {
    const effectiveSide = baseExercise.laterality === 'bilateral' ? 'bilateral' : selectedSide;
    return { ...baseExercise, side: effectiveSide };
  }, [baseExercise, selectedSide]);

  // Demo mode telemetry state
  const [demoAngle, setDemoAngle] = useState<number>(activeExercise.startAngle);
  const [demoPhase, setDemoPhase] = useState<PhaseConfig>(activeExercise.demoPhases[0]);
  const [demoTimelineMs, setDemoTimelineMs] = useState<number>(0);

  const {
    videoRef,
    canvasRef,
    engineStatus,
    isStreaming,
    isInitializing,
    errorMessage,
    stats,
    shoulderFlexion,
    sessionState,
    latestLandmarks,
    temporalPrediction,
    startCamera,
    stopCamera,
    toggleCamera,
    startExerciseSession,
    stopExerciseSession,
    resetExerciseSession,
    setOnAutoEnd,
  } = usePoseTracking(activeExercise);

  // Persistent session history state & modals
  const [savedSessions, setSavedSessions] = useState<PhysiosisSession[]>([]);
  const [activeSummarySession, setActiveSummarySession] = useState<PhysiosisSession | null>(null);
  const [isHistoryModalOpen, setIsHistoryModalOpen] = useState(false);
  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);

  // ── End-Session Lifecycle & Diagnostic States (Patch 3) ───────────────────
  const isEndingRef = useRef(false);
  const [sessionStatus, setSessionStatus] = useState<'IDLE' | 'READY' | 'ACTIVE' | 'ENDING' | 'ENDED'>('IDLE');
  const [endReason, setEndReason] = useState<SessionEndReason | null>(null);
  const [persistenceStatus, setPersistenceStatus] = useState<'SAVED' | 'FAILED' | 'PENDING' | 'IDLE'>('IDLE');
  const [endSessionNotice, setEndSessionNotice] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [pendingSessionForRetry, setPendingSessionForRetry] = useState<PhysiosisSession | null>(null);

  // ── Session Countdown Timer (3-Minute Rehabilitation Session) ─────────────
  const SESSION_DURATION_SECONDS = 180;
  const TEST_SESSION_DURATION_SECONDS = 10;

  const [isTestTimer, setIsTestTimer] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      return params.get('testTimer') === '1';
    }
    return false;
  });

  const activeDuration = isTestTimer ? TEST_SESSION_DURATION_SECONDS : SESSION_DURATION_SECONDS;
  const [sessionStartTime, setSessionStartTime] = useState<number | null>(null);
  const [remainingSeconds, setRemainingSeconds] = useState<number>(activeDuration);
  const [isTimerRunning, setIsTimerRunning] = useState<boolean>(false);
  const timerIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Sync camera preview and session lifecycle
  useEffect(() => {
    if (!isStreaming) {
      if (isTimerRunning) {
        setIsTimerRunning(false);
      }
      if (mode === 'LIVE' || mode === 'PRACTICE') {
        setMode('TUTORIAL');
        setSessionStatus('IDLE');
      }
    } else if (isStreaming && !sessionState.isActive && mode === 'TUTORIAL') {
      setMode('PRACTICE');
      setSessionStatus('READY');
    }
  }, [isStreaming, sessionState.isActive, isTimerRunning, mode]);

  // Load saved sessions from Supabase for the authenticated patient
  const refreshSessions = useCallback(async () => {
    if (isBackendConfigured && isAuthenticated && profile?.id && profile.id !== 'demo-patient-001') {
      const { sessions, error } = await sessionService.getCurrentPatientSessions();
      if (!error && sessions) {
        setSavedSessions(sessions);
        return;
      }
    }
    // Fallback to local storage cache in unconfigured or demo mode
    setSavedSessions(getSessions());
  }, [isBackendConfigured, isAuthenticated, profile?.id]);

  useEffect(() => {
    refreshSessions();
  }, [refreshSessions]);

  // ── DEMO MODE HANDLERS ─────────────────────────────────────────────────────
  const handleEnterDemoMode = useCallback(() => {
    if (isStreaming) {
      stopCamera();
    }
    setMode('DEMO');
    resetExerciseSession();
    setIsTimerRunning(false);
    setSessionStartTime(null);
    setSessionStatus('ENDED');
    setPersistenceStatus('IDLE');
    setEndSessionNotice(null);
    setSaveError(null);
    setDemoAngle(activeExercise.startAngle);
    setDemoPhase(activeExercise.demoPhases[0]);
    setDemoTimelineMs(0);
  }, [isStreaming, stopCamera, resetExerciseSession, activeExercise]);

  const handleExitDemoMode = useCallback(() => {
    setMode('TUTORIAL');
    setDemoAngle(activeExercise.startAngle);
    setDemoPhase(activeExercise.demoPhases[0]);
    setDemoTimelineMs(0);
  }, [activeExercise]);

  const handleDemoFrame = useCallback((angle: number, phase: PhaseConfig, elapsedMs: number) => {
    setDemoAngle(angle);
    setDemoPhase(phase);
    setDemoTimelineMs(elapsedMs);
  }, []);

  // Handle exercise selection change
  const handleSelectExercise = useCallback(
    (exerciseId: string, side?: 'left' | 'right' | 'bilateral') => {
      const newEx = getExercise(exerciseId) ?? getDefaultExercise();
      setSelectedExerciseId(exerciseId);
      if (side) {
        setSelectedSide(side);
      } else if (newEx.laterality === 'bilateral') {
        setSelectedSide('bilateral');
      }
      setEndSessionNotice(null);
      setSaveError(null);
      setPendingSessionForRetry(null);
      setIsTimerRunning(false);
      setSessionStartTime(null);
      setRemainingSeconds(activeDuration);
      resetExerciseSession();
      setDemoAngle(newEx.startAngle);
      setDemoPhase(newEx.demoPhases[0]);
      setDemoTimelineMs(0);
      setMode((prev) => (prev === 'DEMO' ? 'DEMO' : 'TUTORIAL'));
    },
    [resetExerciseSession, activeDuration]
  );

  // Handle laterality (side) change with clean state reset
  const handleSelectSide = useCallback(
    (side: 'left' | 'right' | 'bilateral') => {
      setSelectedSide(side);
      resetExerciseSession();
    },
    [resetExerciseSession]
  );

  // Practice mode transition triggers
  const handleStartPractice = useCallback(async () => {
    setMode('PRACTICE');
    if (!isStreaming) {
      await startCamera();
    }
  }, [isStreaming, startCamera]);

  const handleStartLiveSession = useCallback(async () => {
    if (!isStreaming) {
      await startCamera();
    }
    setMode('LIVE');
    setSessionStatus('ACTIVE');
    setEndSessionNotice(null);
    setSaveError(null);
    setPendingSessionForRetry(null);
    const now = Date.now();
    setSessionStartTime(now);
    setRemainingSeconds(activeDuration);
    setIsTimerRunning(true);
    startExerciseSession(activeDuration);
  }, [isStreaming, startCamera, activeDuration, startExerciseSession]);

  const handleBackToTutorial = useCallback(() => {
    setMode('TUTORIAL');
  }, []);

  // ── ONE AUTHORITATIVE END SESSION FUNCTION ─────────────────────────────────
  const endSession = useCallback(
    async (reason: SessionEndReason = 'manual') => {
      // 1. Guard against duplicate invocation / rapid clicks
      if (isEndingRef.current) return;
      isEndingRef.current = true;
      setSessionStatus('ENDING');
      setEndReason(reason);
      setEndSessionNotice(null);
      setSaveError(null);

      // In DEMO mode, never create persistent database records
      if (mode === 'DEMO') {
        isEndingRef.current = false;
        setSessionStatus('ENDED');
        setPersistenceStatus('IDLE');
        setEndSessionNotice('Demonstration mode. No patient session was created.');
        return;
      }

      // Stop countdown timer immediately
      if (timerIntervalRef.current) {
        clearInterval(timerIntervalRef.current);
        timerIntervalRef.current = null;
      }
      setIsTimerRunning(false);
      stopExerciseSession('COMPLETED');

      try {
        // 2. Stop active camera recording and tracking loop immediately
        stopCamera();

        // 3. Check for valid completed repetitions
        const reps = sessionState.repHistory;
        if (!reps || reps.length === 0) {
          if (!sessionState.isActive && !isStreaming) {
            setEndSessionNotice('No tracking session is active.');
          } else {
            setEndSessionNotice('No valid repetitions were completed.');
          }
          setSessionStatus('ENDED');
          setPersistenceStatus('IDLE');
          isEndingRef.current = false;
          return;
        }

        // 4. Aggregate whole-session metrics into authoritative PhysiosisSession
        const patientId = profile?.patient_login_id || (isAuthenticated ? profile?.id : undefined);
        const effectiveSide = activeExercise.laterality === 'bilateral' ? 'bilateral' : (activeExercise.side || selectedSide);
        const finalSession = buildPhysiosisSession(
          sessionState,
          activeExercise.name,
          activeExercise.id,
          reason,
          activeExercise.targetAngle,
          patientId,
          effectiveSide
        );

        if (!finalSession) {
          setEndSessionNotice('No valid movement data was collected during this session.');
          setSessionStatus('ENDED');
          setPersistenceStatus('IDLE');
          isEndingRef.current = false;
          return;
        }

        // 5. Persist LIVE session data to Supabase (or localStorage in DEMO mode)
        if (isBackendConfigured && isAuthenticated && profile?.id && profile.id !== 'demo-patient-001') {
          setPersistenceStatus('PENDING');
          const { error } = await sessionService.saveRehabSessionWithRepsAndReport(
            finalSession,
            profile.id
          );

          if (error) {
            console.error('[Dashboard] Supabase save error:', error);
            setPersistenceStatus('FAILED');
            setSaveError(error.message || 'Session could not be saved.');
            setPendingSessionForRetry(finalSession);
            setSessionStatus('ENDED');
            isEndingRef.current = false;
            return;
          }

          // Persistence succeeded
          setPersistenceStatus('SAVED');
          saveSession(finalSession); // Local backup
          await refreshSessions();
          setActiveSummarySession(finalSession);
        } else {
          // DEMO mode: non-persistent to cloud, cache locally for presentation
          setPersistenceStatus('SAVED');
          saveSession(finalSession);
          await refreshSessions();
          setActiveSummarySession(finalSession);
        }

        setSessionStatus('ENDED');
      } catch (err: unknown) {
        console.error('[Dashboard] Unexpected error in endSession:', err);
        setPersistenceStatus('FAILED');
        setSaveError(err instanceof Error ? err.message : 'Unexpected error ending session.');
      } finally {
        isEndingRef.current = false;
      }
    },
    [
      isStreaming,
      sessionState,
      activeExercise.name,
      activeExercise.id,
      activeExercise.targetAngle,
      isBackendConfigured,
      isAuthenticated,
      profile?.id,
      profile?.patient_login_id,
      refreshSessions,
      stopCamera,
      stopExerciseSession,
    ]
  );

  // Hook up automatic end session notification from ExerciseSessionEngine
  useEffect(() => {
    setOnAutoEnd(() => {
      endSession('automatic');
    });
  }, [setOnAutoEnd, endSession]);

  // ── Countdown Timer Tick & Tab Visibility Sync (Drift-Free) ───────────────
  useEffect(() => {
    if (!isTimerRunning || !sessionStartTime) {
      if (timerIntervalRef.current) {
        clearInterval(timerIntervalRef.current);
        timerIntervalRef.current = null;
      }
      return;
    }

    const updateCountdown = () => {
      const elapsedSec = Math.floor((Date.now() - sessionStartTime) / 1000);
      const remaining = Math.max(0, activeDuration - elapsedSec);
      setRemainingSeconds(remaining);

      if (remaining <= 0) {
        if (timerIntervalRef.current) {
          clearInterval(timerIntervalRef.current);
          timerIntervalRef.current = null;
        }
        setIsTimerRunning(false);
        endSession('automatic');
      }
    };

    updateCountdown();
    timerIntervalRef.current = setInterval(updateCountdown, 1000);

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        updateCountdown();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      if (timerIntervalRef.current) {
        clearInterval(timerIntervalRef.current);
        timerIntervalRef.current = null;
      }
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [isTimerRunning, sessionStartTime, activeDuration, endSession]);

  // ── Retry Save Flow on Database Failure ─────────────────────────────────────
  const handleRetrySave = useCallback(async () => {
    if (!pendingSessionForRetry || !profile?.id) return;
    setPersistenceStatus('PENDING');
    setSaveError(null);

    try {
      const { error } = await sessionService.saveRehabSessionWithRepsAndReport(
        pendingSessionForRetry,
        profile.id
      );

      if (error) {
        setPersistenceStatus('FAILED');
        setSaveError(error.message || 'Session could not be saved.');
      } else {
        setPersistenceStatus('SAVED');
        saveSession(pendingSessionForRetry);
        await refreshSessions();
        setActiveSummarySession(pendingSessionForRetry);
        setPendingSessionForRetry(null);
      }
    } catch (err: unknown) {
      setPersistenceStatus('FAILED');
      setSaveError(err instanceof Error ? err.message : 'Retry save failed.');
    }
  }, [pendingSessionForRetry, profile?.id, refreshSessions]);

  // View local unsaved report on persistence failure
  const handleViewUnsavedReport = useCallback(() => {
    if (pendingSessionForRetry) {
      setActiveSummarySession({ ...pendingSessionForRetry, isUnsaved: true });
      setSaveError(null);
      setPendingSessionForRetry(null);
    }
  }, [pendingSessionForRetry]);

  // ── Start New Session Flow ──────────────────────────────────────────────────
  const handleStartNewSession = useCallback(async () => {
    setActiveSummarySession(null);
    setIsHistoryModalOpen(false);
    setEndSessionNotice(null);
    setSaveError(null);
    setPendingSessionForRetry(null);
    setPersistenceStatus('IDLE');
    setEndReason(null);
    resetExerciseSession();
    setMode('TUTORIAL');
    setSessionStatus('ACTIVE');
    setSessionStartTime(null);
    setRemainingSeconds(activeDuration);
    setIsTimerRunning(false);
    await startCamera();
  }, [resetExerciseSession, startCamera, activeDuration]);

  // Open the latest session report for the active exercise
  const handleOpenLatestReport = useCallback(() => {
    const matching = savedSessions.filter(
      (s) =>
        s.exercise.toLowerCase() === activeExercise.name.toLowerCase() ||
        (activeExercise.name === 'Shoulder Flexion' && !s.exercise)
    );
    if (matching.length > 0) {
      setActiveSummarySession(matching[0]);
    }
  }, [savedSessions, activeExercise.name]);

  const hasActiveSession = sessionState.isActive && sessionState.repHistory.length > 0;

  return (
    <div className="app">
      {/* ── Top Header Navigation Bar ──────────────────────────────────── */}
      <Header
        mode={mode}
        engineStatus={engineStatus}
        isStreaming={isStreaming}
        isInitializing={isInitializing}
        onToggleCamera={toggleCamera}
        selectedExerciseId={selectedExerciseId}
        selectedSide={selectedSide}
        onSelectExercise={handleSelectExercise}
        onSelectSide={handleSelectSide}
        onOpenLibrary={() => setIsLibraryModalOpen(true)}
        onEndSession={() => endSession('manual')}
        hasActiveSession={hasActiveSession}
        savedSessionsCount={savedSessions.length}
        onOpenHistory={() => setIsHistoryModalOpen(true)}
        onOpenProfile={() => setIsProfileModalOpen(true)}
        dimensionMode={dimensionMode}
        onToggleDimension={setDimensionMode}
      />

      {/* ── Optional Notification / Save Error Banners ──────────────────── */}
      {endSessionNotice && (
        <div className="dashboard-notice-banner" role="alert">
          <AlertCircle size={15} className="text-warn flex-shrink-0" />
          <span className="dashboard-notice-banner__text">{endSessionNotice}</span>
          <button
            type="button"
            className="btn-icon"
            onClick={() => setEndSessionNotice(null)}
            title="Dismiss notice"
            aria-label="Dismiss notice"
          >
            <X size={14} />
          </button>
        </div>
      )}

      {saveError && (
        <div className="dashboard-error-banner" role="alert">
          <div className="dashboard-error-banner__left">
            <AlertTriangle size={16} className="text-crit flex-shrink-0" />
            <div>
              <strong>Session could not be saved.</strong>
              <span className="dashboard-error-banner__sub">{saveError}</span>
            </div>
          </div>
          <div className="dashboard-error-banner__actions">
            <button
              type="button"
              className="btn btn--secondary btn--sm"
              onClick={handleRetrySave}
            >
              <RefreshCw size={12} />
              <span>Retry Save</span>
            </button>
            <button
              type="button"
              className="btn btn--secondary btn--sm"
              onClick={handleViewUnsavedReport}
            >
              <FileText size={12} />
              <span>View Unsaved Report</span>
            </button>
            <button
              type="button"
              className="btn-icon"
              onClick={() => {
                setSaveError(null);
                setPendingSessionForRetry(null);
              }}
              title="Cancel"
              aria-label="Cancel"
            >
              <X size={14} />
            </button>
          </div>
        </div>
      )}

      <main className="dashboard-container" id="main-content" role="main">
        {/* ── 1. Main Workspace: 3D Biomechanics Centerpiece (60%) + Real-Time Analysis (40%) ── */}
        {dimensionMode === '3D' ? (
          <section className="workspace-main" aria-label="3D Rehabilitation Biomechanics Workspace">
            {/* Column A: 3D Skeletal Biomechanics Centerpiece */}
            <div className="workspace-main__hero">
              <Physiosis3DViewer
                exerciseId={activeExercise.id}
                exerciseName={activeExercise.name}
                mode={mode}
                initialSide={selectedSide}
                targetAngle={activeExercise.targetAngle || 165}
                liveLandmarks={latestLandmarks}
                isStreaming={isStreaming}
                isInitializing={isInitializing}
                errorMessage={errorMessage}
                liveAngle={shoulderFlexion.angle}
                liveAnalysis={shoulderFlexion}
                stats={stats}
                isSessionActive={sessionState.isActive}
                sessionRemainingSeconds={sessionState.isActive ? sessionState.metrics.timeRemainingSeconds : remainingSeconds}
                completedReps={sessionState.metrics.completedReps}
                onStartSession={handleStartLiveSession}
                onEndSession={() => endSession('manual')}
                videoRef={videoRef}
                canvasRef={canvasRef}
                onToggleCamera={toggleCamera}
                onSwitchTo2D={() => setDimensionMode('2D')}
                onAngleChange={(ang) => {
                  if (mode === 'DEMO') {
                    setDemoAngle(ang);
                  }
                }}
              />
            </div>

            {/* Column B: Real-Time Movement Analysis */}
            <div className="workspace-main__analysis">
              <AnalysisCard
                exercise={activeExercise}
                mode={mode}
                engineStatus={engineStatus}
                isStreaming={isStreaming}
                stats={stats}
                shoulderFlexion={shoulderFlexion}
                sessionState={sessionState}
                demoAngle={demoAngle}
                demoPhase={demoPhase}
                demoTimelineMs={demoTimelineMs}
              />
            </div>
          </section>
        ) : (
          <section className="workspace-main workspace-main--2d" aria-label="2D Planar Avatar Workspace">
            {/* Column A: Live Camera Engine Feed */}
            <div className="workspace-main__feed">
              <LiveFeedCard
                mode={mode}
                engineStatus={engineStatus}
                isStreaming={isStreaming}
                isInitializing={isInitializing}
                errorMessage={errorMessage}
                stats={stats}
                videoRef={videoRef}
                canvasRef={canvasRef}
                onToggleCamera={toggleCamera}
                onEnterDemoMode={handleEnterDemoMode}
                onExitDemoMode={handleExitDemoMode}
                remainingSeconds={remainingSeconds}
                isTimerRunning={isTimerRunning}
              />
            </div>

            {/* Column B: Real-Time Movement Analysis */}
            <div className="workspace-main__analysis">
              <AnalysisCard
                exercise={activeExercise}
                mode={mode}
                engineStatus={engineStatus}
                isStreaming={isStreaming}
                stats={stats}
                shoulderFlexion={shoulderFlexion}
                sessionState={sessionState}
                demoAngle={demoAngle}
                demoPhase={demoPhase}
                demoTimelineMs={demoTimelineMs}
              />
            </div>

            {/* Column C: Reference Exercise Demonstration / Live Practice Panel */}
            <div className="workspace-main__reference">
              <ReferenceExerciseCard
                mode={mode}
                onStartPractice={handleStartPractice}
                onBackToTutorial={handleBackToTutorial}
                onExitDemoMode={handleExitDemoMode}
                exercise={activeExercise}
                selectedSide={selectedSide}
                onSelectSide={handleSelectSide}
                liveLandmarks={latestLandmarks}
                isStreaming={isStreaming}
                liveAngle={shoulderFlexion.angle}
                lastLimitationPeak={sessionState.lastLimitationPeakAngle}
                latestRep={sessionState.latestRep}
                liveAnalysis={shoulderFlexion}
                onDemoFrame={handleDemoFrame}
              />
            </div>
          </section>
        )}

        {/* ── 2. Lower Workspace: Session Health + Progress + Recovery Trends ── */}
        <section className="workspace-lower" aria-label="Rehabilitation session and progress analytics">
          {/* Panel A: Live Session Health & Rep Trend */}
          <div className="workspace-lower__health">
            <SessionHealthCard
              mode={mode}
              activeExercise={activeExercise}
              sessionState={sessionState}
              currentAngle={shoulderFlexion.angle}
              onEndSession={() => endSession('manual')}
            />
          </div>

          {/* Panel B: Movement Progress & Recovery Trend */}
          <div className="workspace-lower__trend-col">
            <MovementProgressCard
              sessions={savedSessions}
              activeExercise={activeExercise}
              onOpenLatestReport={handleOpenLatestReport}
              currentAngle={shoulderFlexion.angle}
            />
            <MovementProfileCard
              sessions={savedSessions}
              activeExerciseId={selectedExerciseId}
              activeExercise={activeExercise}
              onSelectExercise={(id) => setSelectedExerciseId(id)}
            />
          </div>

        </section>
      </main>

      {/* ── Supporting Overlay: Final Patient Session Report Modal ────── */}
      {activeSummarySession && (
        <FinalSessionReport
          session={activeSummarySession}
          onClose={() => setActiveSummarySession(null)}
          onStartNewSession={handleStartNewSession}
        />
      )}

      {/* ── Supporting Overlay: Previous Sessions History Modal ──────── */}
      {isHistoryModalOpen && (
        <SessionHistory
          sessions={savedSessions}
          isModal={true}
          onClose={() => setIsHistoryModalOpen(false)}
          onSelectSession={async (s) => {
            setIsHistoryModalOpen(false);
            if (isBackendConfigured && isAuthenticated && s.id && !s.isUnsaved) {
              const { session: detailedSession } = await sessionService.getCurrentPatientSessionReport(s.id);
              setActiveSummarySession(detailedSession || s);
            } else {
              setActiveSummarySession(s);
            }
          }}
          onRefreshSessions={refreshSessions}
        />
      )}

      {/* ── Supporting Overlay: Patient Account Profile Modal ────────── */}
      {isProfileModalOpen && (
        <PatientProfileModal
          onClose={() => setIsProfileModalOpen(false)}
          onOpenHistory={() => {
            setIsProfileModalOpen(false);
            setIsHistoryModalOpen(true);
          }}
        />
      )}

      {/* ── Developer QA Readiness Panel (Shift + D / ?qa=1) ─────────── */}
      <PresentationQAPanel
        mode={mode}
        engineStatus={engineStatus}
        isStreaming={isStreaming}
        activeExercise={activeExercise}
        sessionState={sessionState}
        analysis={shoulderFlexion}
        stats={stats}
        savedSessionsCount={savedSessions.length}
        savedSessions={savedSessions}
        landmarks={latestLandmarks}
        temporalPrediction={temporalPrediction}
        sessionStatus={sessionStatus}
        endReason={endReason}
        isReportReady={activeSummarySession !== null}
        persistenceStatus={persistenceStatus}
        isTimerRunning={isTimerRunning}
        remainingSeconds={remainingSeconds}
        sessionStartTime={sessionStartTime}
        isTestTimer={isTestTimer}
        demoAngle={demoAngle}
        demoPhase={demoPhase}
        demoTimelineMs={demoTimelineMs}
        onToggleTestTimer={() => {
          const next = !isTestTimer;
          setIsTestTimer(next);
          setRemainingSeconds(next ? TEST_SESSION_DURATION_SECONDS : SESSION_DURATION_SECONDS);
        }}
      />

      {/* ── Floating Physiotherapy Assistant Helpbox (Patch 4) ──────── */}
      <PhysioAssistant
        activeExercise={activeExercise}
        sessionState={sessionState}
        shoulderFlexion={shoulderFlexion}
        lastSavedSession={savedSessions[0] ?? null}
        savedSessions={savedSessions}
        patientId={profile?.patient_login_id}
      />

      {/* ── Rehabilitation Protocol Exercise Library Modal (Patch 2) ─── */}
      <ExerciseLibraryModal
        isOpen={isLibraryModalOpen}
        onClose={() => setIsLibraryModalOpen(false)}
        selectedExerciseId={selectedExerciseId}
        selectedSide={selectedSide}
        onSelectExercise={handleSelectExercise}
        onStartPractice={async (exId, side) => {
          handleSelectExercise(exId, side);
          await handleStartPractice();
        }}
      />
    </div>
  );
};
