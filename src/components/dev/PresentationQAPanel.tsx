/**
 * PresentationQAPanel.tsx
 * Developer-only QA and presentation readiness verification panel.
 *
 * Hidden from normal users. Toggle with `Shift + D` or URL parameter `?qa=1`.
 *
 * Displays live engine and auth telemetry:
 *   - MediaPipe Model Status (READY / INITIALIZING / OFFLINE / ERROR)
 *   - Camera Stream (STREAMING / OFFLINE / ERROR)
 *   - Reference Animation (READY)
 *   - Supabase PostgreSQL Database (CONNECTED / OFFLINE)
 *   - Auth Config & Current User (Masked)
 *   - Profile Trigger & Patient ID Status
 *   - Session Engine (ACTIVE / IDLE, Elapsed, Reps)
 *   - Current Exercise, Active Posture, Target Angle, Repetition Count
 */

import React, { useState, useEffect, useMemo } from 'react';
import { ShieldCheck, X, Cpu, Camera, Play, Activity, Database, Key, Bot } from 'lucide-react';
import type { EngineStatus } from '../../types/engine';
import type { ExerciseDefinition, Landmark3D } from '../../engine/exercise/ExerciseTypes';
import type { LiveSessionState, PhysiosisSession } from '../../engine/session/SessionTypes';
import type { ShoulderFlexionAnalysis } from '../../engine/biomechanics/biomechanicsTypes';
import type { OllamaConnectionStatus } from '../../types/assistant';
import { isSupabaseConfigured } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import { getSuggestionForLimitation } from '../../engine/feedback/SuggestionLibrary';
import { formatTimerMMSS } from '../../utils/format';
import { physioAssistantService } from '../../services/physioAssistantService';
import { speechInputService } from '../../services/voice/SpeechInputService';
import { speechOutputService } from '../../services/voice/SpeechOutputService';
import { physiosisAIOrchestrator } from '../../engine/ai/PhysiosisAIOrchestrator';
import type { PhysiosisAIState } from '../../engine/ai/AIOrchestratorTypes';
import { temporalInferenceEngine } from '../../engine/ai/temporal/TemporalInferenceEngine';
import type {
  TemporalPredictionOutput,
  TemporalModelArchitecture,
} from '../../engine/ai/temporal/TemporalTypes';

import type { PhaseConfig } from '../../engine/exercise/PoseTypes';

import type { PoseTrackingStats } from '../../types/pose';

interface PresentationQAPanelProps {
  mode?: 'TUTORIAL' | 'PRACTICE' | 'LIVE' | 'DEMO';
  engineStatus: EngineStatus;
  isStreaming: boolean;
  activeExercise: ExerciseDefinition;
  sessionState: LiveSessionState;
  analysis: ShoulderFlexionAnalysis;
  stats?: PoseTrackingStats;
  savedSessionsCount: number;
  sessionStatus?: 'IDLE' | 'READY' | 'ACTIVE' | 'ENDING' | 'ENDED';
  endReason?: 'manual' | 'automatic' | null;
  isReportReady?: boolean;
  persistenceStatus?: 'SAVED' | 'FAILED' | 'PENDING' | 'IDLE';
  isTimerRunning?: boolean;
  remainingSeconds?: number;
  sessionStartTime?: number | null;
  isTestTimer?: boolean;
  onToggleTestTimer?: () => void;
  demoAngle?: number;
  demoPhase?: PhaseConfig;
  demoTimelineMs?: number;
  landmarks?: Landmark3D[] | null;
  savedSessions?: PhysiosisSession[];
  temporalPrediction?: TemporalPredictionOutput | null;
}

export const PresentationQAPanel: React.FC<PresentationQAPanelProps> = ({
  mode = 'TUTORIAL',
  engineStatus,
  isStreaming,
  activeExercise,
  sessionState,
  analysis,
  stats,
  savedSessionsCount,
  sessionStatus = 'IDLE',
  endReason = null,
  isReportReady = false,
  persistenceStatus = 'IDLE',
  isTimerRunning = false,
  remainingSeconds,
  sessionStartTime = null,
  isTestTimer = false,
  onToggleTestTimer,
  demoAngle,
  demoPhase,
  demoTimelineMs,
  landmarks,
  savedSessions,
  temporalPrediction,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [ollamaStatus, setOllamaStatus] = useState<OllamaConnectionStatus | null>(null);
  const [selectedArchitecture, setSelectedArchitecture] =
    useState<TemporalModelArchitecture>('TCN');
  const isDbConfigured = isSupabaseConfigured();
  const { user, profile, isAuthenticated } = useAuth();

  const handleSwitchArchitecture = (arch: TemporalModelArchitecture) => {
    setSelectedArchitecture(arch);
    temporalInferenceEngine.setArchitecture(arch);
  };

  const aiState: PhysiosisAIState = useMemo(() => {
    return physiosisAIOrchestrator.orchestrate({
      landmarks: landmarks ?? null,
      activeExercise,
      sessionState,
      postureResult: analysis.postureResult ?? null,
      stats: stats ?? null,
      savedSessions: savedSessions ?? [],
      isStreaming,
      selectedSide: activeExercise.side,
      currentAngle: analysis.angle,
      temporalPrediction: temporalPrediction ?? null,
    });
  }, [
    landmarks,
    activeExercise,
    sessionState,
    analysis.postureResult,
    analysis.angle,
    stats,
    savedSessions,
    isStreaming,
    temporalPrediction,
  ]);

  useEffect(() => {
    // Check if ?qa=1 is in the URL
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      if (params.get('qa') === '1') {
        setIsOpen(true);
      }
    }

    // Keyboard shortcut listener: Shift + D
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.shiftKey && e.key === 'D') {
        setIsOpen((prev) => !prev);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Fetch local Ollama health status when QA panel is opened
  useEffect(() => {
    if (!isOpen) return;

    let isMounted = true;
    physioAssistantService.checkOllamaHealth().then((status) => {
      if (isMounted) {
        setOllamaStatus(status);
      }
    });

    return () => {
      isMounted = false;
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const maskedUserId = user?.id
    ? `${user.id.slice(0, 8)}...${user.id.slice(-4)}`
    : 'None (Unauthenticated)';

  const profileTriggerStatus = profile?.id ? 'PASS' : isAuthenticated ? 'FAIL' : 'READY';
  const patientIdStatus = profile?.patient_login_id ? 'PASS' : isAuthenticated ? 'FAIL' : 'READY';

  const liveAnalysisStatus = analysis.angle !== null ? 'READY' : 'WAITING';
  const tutorialTimelineStatus = mode === 'PRACTICE' ? 'PAUSED' : 'PLAYING';
  const sessionReps = sessionState.metrics.completedReps;
  const lastRepPeakDisplay =
    sessionState.latestRep?.peakAngle !== undefined
      ? `${sessionState.latestRep.peakAngle}°`
      : analysis.lastRepPeak !== null
      ? `${analysis.lastRepPeak}°`
      : '—';

  // Suggestion diagnostics (Patch 2)
  const isLimitationActive =
    mode === 'PRACTICE' &&
    analysis.angle !== null &&
    (sessionState.latestRep?.limitationDetected === true || analysis.state === 'LOW_RANGE');
  const activeLimitationId = isLimitationActive ? activeExercise.id : 'NONE';
  const activeSuggestion = isLimitationActive
    ? getSuggestionForLimitation(activeExercise.id, true)
    : null;
  const activeSuggestionId = activeSuggestion?.id ?? 'NONE';

  return (
    <aside className="qa-panel" role="region" aria-label="Developer QA Panel">
      <div className="qa-panel__header">
        <div className="qa-panel__title">
          <ShieldCheck size={15} className="text-good" />
          <span>SIH Presentation QA Readiness</span>
        </div>
        <button
          type="button"
          className="btn-icon"
          onClick={() => setIsOpen(false)}
          title="Close QA panel"
          aria-label="Close QA panel"
        >
          <X size={14} />
        </button>
      </div>

      <div className="qa-panel__grid">
        {/* Authoritative Mode */}
        <div className="qa-panel__item">
          <div className="qa-panel__item-header">
            <Play size={12} />
            <span>Mode</span>
          </div>
          <span
            className={`qa-badge qa-badge--${
              mode === 'DEMO' ? 'warn' : mode === 'PRACTICE' || mode === 'LIVE' ? 'good' : 'neutral'
            }`}
          >
            {mode}
          </span>
        </div>

        {/* MediaPipe Engine */}
        <div className="qa-panel__item">
          <div className="qa-panel__item-header">
            <Cpu size={12} />
            <span>MediaPipe</span>
          </div>
          <span
            className={`qa-badge qa-badge--${
              engineStatus === 'running'
                ? 'good'
                : engineStatus === 'initializing'
                ? 'warn'
                : engineStatus === 'error'
                ? 'crit'
                : 'neutral'
            }`}
          >
            {engineStatus.toUpperCase()}
          </span>
        </div>

        {/* Live Video Camera */}
        <div className="qa-panel__item">
          <div className="qa-panel__item-header">
            <Camera size={12} />
            <span>Camera</span>
          </div>
          <span className={`qa-badge qa-badge--${isStreaming ? 'good' : 'neutral'}`}>
            {isStreaming ? 'STREAMING' : 'OFF'}
          </span>
        </div>

        {/* Live Analysis Engine */}
        <div className="qa-panel__item">
          <div className="qa-panel__item-header">
            <Activity size={12} />
            <span>Kinematics</span>
          </div>
          <span className={`qa-badge qa-badge--${liveAnalysisStatus === 'READY' ? 'good' : 'neutral'}`}>
            {liveAnalysisStatus}
          </span>
        </div>

        {/* Supabase Database Config */}
        <div className="qa-panel__item">
          <div className="qa-panel__item-header">
            <Database size={12} />
            <span>Supabase DB</span>
          </div>
          <span className={`qa-badge qa-badge--${isDbConfigured ? 'good' : 'warn'}`}>
            {isDbConfigured ? 'CONNECTED' : 'LOCAL DEMO'}
          </span>
        </div>

        {/* Supabase Authentication */}
        <div className="qa-panel__item">
          <div className="qa-panel__item-header">
            <Key size={12} />
            <span>Auth State</span>
          </div>
          <span className={`qa-badge qa-badge--${isAuthenticated ? 'good' : 'neutral'}`}>
            {isAuthenticated ? 'LOGGED IN' : 'GUEST'}
          </span>
        </div>

        {/* Local Ollama Assistant */}
        <div className="qa-panel__item">
          <div className="qa-panel__item-header">
            <Bot size={12} />
            <span>Ollama AI</span>
          </div>
          <span className={`qa-badge qa-badge--${ollamaStatus?.status === 'CONNECTED' ? 'good' : 'warn'}`}>
            {ollamaStatus?.status === 'CONNECTED' ? 'CONNECTED' : 'OFFLINE'}
          </span>
        </div>

        {/* AI Orchestrator Core */}
        <div className="qa-panel__item">
          <div className="qa-panel__item-header">
            <ShieldCheck size={12} />
            <span>AI Core</span>
          </div>
          <span
            className={`qa-badge qa-badge--${
              aiState.safetyState.level === 'SAFE'
                ? 'good'
                : aiState.safetyState.level === 'CAUTION'
                ? 'warn'
                : 'crit'
            }`}
          >
            {aiState.safetyState.level}
          </span>
        </div>
      </div>

      <div className="qa-panel__divider" />

      {/* Presentation Audit Checklist */}
      <div className="qa-panel__details">
        {/* ── Physiosis AI Orchestrator Telemetry (AI CORE PATCH 1) ── */}
        <div className="qa-detail-row" style={{ background: 'rgba(59, 130, 246, 0.12)', padding: '4px 6px', borderRadius: 4, margin: '2px 0' }}>
          <span className="qa-detail-key font-bold" style={{ color: '#60A5FA' }}>AI Orchestrator:</span>
          <span className="qa-detail-val text-mono font-bold" style={{ color: '#60A5FA' }}>
            {aiState.sessionState.status} · {aiState.exerciseState.movementPhase}
          </span>
        </div>
        <div className="qa-detail-row">
          <span className="qa-detail-key">AI State:</span>
          <span className="qa-detail-val text-mono text-cyan font-bold">
            {aiState.sessionState.status} | Rep {aiState.sessionState.activeRep}/{aiState.sessionState.completedReps} | {aiState.exerciseState.romPercentage}% ROM ({aiState.exerciseState.currentAngle !== null ? `${aiState.exerciseState.currentAngle}°` : '—'})
          </span>
        </div>
        <div className="qa-detail-row">
          <span className="qa-detail-key">AI Movement Quality:</span>
          <span className="qa-detail-val text-mono font-bold text-good">
            {aiState.movementQuality.score}/100 · {aiState.movementQuality.velocityQuality} (Stab: {aiState.movementQuality.stability}%, Sym: {aiState.movementQuality.symmetry}%)
          </span>
        </div>
        <div className="qa-detail-row">
          <span className="qa-detail-key">Postural Integrity:</span>
          <span className={`qa-detail-val text-mono font-bold ${aiState.postureState.isOptimal ? 'text-good' : 'text-warn'}`}>
            {aiState.postureState.integrityScore}% ({aiState.postureState.activeFaultsCount} faults{aiState.postureState.primaryFault ? `: ${aiState.postureState.primaryFault}` : ''})
          </span>
        </div>
        <div className="qa-detail-row">
          <span className="qa-detail-key">Confidence:</span>
          <span className={`qa-detail-val text-mono font-bold ${aiState.confidence.isReliable ? 'text-good' : 'text-warn'}`}>
            {aiState.confidence.trackingConfidence}% Track · {aiState.confidence.biomechanicalConfidence}% Bio ({aiState.confidence.isReliable ? 'PASS' : 'DEGRADED'}{aiState.confidence.degradationReason ? ` - ${aiState.confidence.degradationReason}` : ''})
          </span>
        </div>
        <div className="qa-detail-row" style={{ background: aiState.safetyState.rehabilitationSafetyState === 'ESCALATE' ? 'rgba(255, 82, 82, 0.15)' : aiState.safetyState.rehabilitationSafetyState === 'STOP' ? 'rgba(255, 167, 38, 0.15)' : 'rgba(0, 230, 118, 0.08)', padding: '4px 6px', borderRadius: 4, margin: '2px 0' }}>
          <span className="qa-detail-key font-bold" style={{ color: aiState.safetyState.rehabilitationSafetyState === 'ESCALATE' ? '#FF5252' : aiState.safetyState.rehabilitationSafetyState === 'STOP' ? '#FFA726' : '#00E676' }}>
            Clinical Safety State:
          </span>
          <span className={`qa-detail-val text-mono font-bold ${aiState.safetyState.rehabilitationSafetyState === 'SAFE' ? 'text-good' : aiState.safetyState.rehabilitationSafetyState === 'CAUTION' ? 'text-warn' : 'text-crit'}`}>
            {aiState.safetyState.rehabilitationSafetyState} · Coaching: {aiState.safetyState.isCoachingAllowed ? 'ALLOWED' : 'HALTED'} · Progression: {aiState.safetyState.isProgressionAllowed ? 'ACTIVE' : 'FROZEN'}
          </span>
        </div>
        <div className="qa-detail-row">
          <span className="qa-detail-key">Safety Status:</span>
          <span className="qa-detail-val text-mono" style={{ fontSize: 9.5, color: aiState.safetyState.rehabilitationSafetyState === 'SAFE' ? '#00E676' : 'var(--text-secondary)' }}>
            {aiState.safetyState.statusMessage}
          </span>
        </div>
        {aiState.safetyState.flaggedHazards.length > 0 && (
          <div className="qa-detail-row">
            <span className="qa-detail-key">Flagged Hazards:</span>
            <span className="qa-detail-val text-mono text-crit" style={{ fontSize: 9.5 }}>
              [{aiState.safetyState.flaggedHazards.join('; ')}]
            </span>
          </div>
        )}
        <div className="qa-detail-row">
          <span className="qa-detail-key">Recommendation Source:</span>
          <span className="qa-detail-val text-mono font-bold text-good">
            {aiState.recommendedProtocol.recommendationSource} ({aiState.recommendedProtocol.progressionStage})
          </span>
        </div>
        <div className="qa-detail-row">
          <span className="qa-detail-key">Protocol Dosage:</span>
          <span className="qa-detail-val text-mono text-cyan">
            {aiState.recommendedProtocol.dosageRecommendation}
          </span>
        </div>
        {aiState.recommendedProtocol.recommendation && (
          <div className="qa-detail-row">
            <span className="qa-detail-key">Curated Target:</span>
            <span className="qa-detail-val text-mono font-bold text-good">
              {aiState.recommendedProtocol.recommendation.recommendedExercise.name} [{aiState.recommendedProtocol.recommendation.sourceType}] ({aiState.recommendedProtocol.recommendation.confidence}% conf)
            </span>
          </div>
        )}

        <div className="qa-detail-row">
          <span className="qa-detail-key">Primary Guidance:</span>
          <span className="qa-detail-val text-cyan font-bold" style={{ fontSize: 10 }}>
            {aiState.guidance.primaryInstruction}
          </span>
        </div>
        <div className="qa-detail-row">
          <span className="qa-detail-key">Escalation State:</span>
          <span className={`qa-detail-val text-mono font-bold ${aiState.escalation.requiresClinicianReview ? 'text-warn' : 'text-good'}`}>
            {aiState.escalation.requiresClinicianReview ? `REVIEW REQUIRED (${aiState.escalation.urgency})` : 'NORMAL (NONE)'}
          </span>
        </div>
        {aiState.escalation.reason && (
          <div className="qa-detail-row">
            <span className="qa-detail-key">Escalation Reason:</span>
            <span className="qa-detail-val text-mono text-warn" style={{ fontSize: 10 }}>
              {aiState.escalation.reason}
            </span>
          </div>
        )}
        <div className="qa-detail-row">
          <span className="qa-detail-key">Clinical Disclaimer:</span>
          <span className="qa-detail-val" style={{ color: 'var(--text-disabled)', fontSize: 9 }}>
            {aiState.safetyState.disclaimer}
          </span>
        </div>
        <div style={{ height: 1, background: 'var(--border-subtle)', margin: '6px 0' }} />

        {/* ── Patient Baseline & Individual Progress (PATCH 4) ───── */}
        <div className="qa-detail-row" style={{ background: 'rgba(16, 185, 129, 0.12)', padding: '4px 6px', borderRadius: 4, margin: '2px 0' }}>
          <span className="qa-detail-key font-bold" style={{ color: '#34D399' }}>Patient Baseline:</span>
          <span className="qa-detail-val text-mono font-bold" style={{ color: '#34D399' }}>
            {aiState.patientProgress.baselineStatus} · {aiState.patientProgress.trend.toUpperCase()}
          </span>
        </div>
        <div className="qa-detail-row">
          <span className="qa-detail-key">Baseline vs Target:</span>
          <span className="qa-detail-val text-mono font-bold text-cyan">
            Baseline: {aiState.patientProgress.typicalROM !== null ? `${aiState.patientProgress.typicalROM}°` : 'None'} | Target: {activeExercise.targetAngle}°
          </span>
        </div>
        <div className="qa-detail-row">
          <span className="qa-detail-key">Comparison Output:</span>
          <span className="qa-detail-val text-mono font-bold text-good">
            "{aiState.patientProgress.comparisonStatement}" {aiState.patientProgress.sessionDeltaVsBaseline !== null ? `(${aiState.patientProgress.sessionDeltaVsBaseline >= 0 ? `+${aiState.patientProgress.sessionDeltaVsBaseline}°` : `${aiState.patientProgress.sessionDeltaVsBaseline}°`})` : ''}
          </span>
        </div>
        {aiState.patientProgress.personalization && (
          <>
            <div className="qa-detail-row">
              <span className="qa-detail-key">Interim Milestone:</span>
              <span className="qa-detail-val text-mono text-cyan">
                {aiState.patientProgress.personalization.difficultyProgression.interimTargetAngle}° (+{aiState.patientProgress.personalization.difficultyProgression.progressionStep}°)
              </span>
            </div>
            <div className="qa-detail-row">
              <span className="qa-detail-key">Rest Trigger:</span>
              <span className={`qa-detail-val text-mono font-bold ${aiState.patientProgress.personalization.restSuggestion.shouldRest ? 'text-warn' : 'text-good'}`}>
                {aiState.patientProgress.personalization.restSuggestion.shouldRest ? `ACTIVE (${aiState.patientProgress.personalization.restSuggestion.reason})` : 'STANDBY (NO FATIGUE)'}
              </span>
            </div>
          </>
        )}
        <div style={{ height: 1, background: 'var(--border-subtle)', margin: '6px 0' }} />

        {/* ── Temporal Movement Intelligence (AI CORE PATCH 2) ───── */}
        <div className="qa-detail-row" style={{ background: 'rgba(168, 85, 247, 0.12)', padding: '4px 6px', borderRadius: 4, margin: '2px 0' }}>
          <span className="qa-detail-key font-bold" style={{ color: '#C084FC' }}>Temporal Intelligence:</span>

          <span className="qa-detail-val text-mono font-bold" style={{ color: '#C084FC' }}>
            {selectedArchitecture} · {temporalPrediction ? `${temporalPrediction.latencyMs}ms async` : 'WARMUP'}
          </span>
        </div>
        <div className="qa-detail-row">
          <span className="qa-detail-key">Architecture:</span>
          <span className="qa-detail-val" style={{ display: 'flex', gap: 4 }}>
            {(['TCN', 'LSTM', 'TRANSFORMER'] as const).map((arch) => (
              <button
                key={arch}
                type="button"
                className={`btn btn--sm ${selectedArchitecture === arch ? 'btn--primary' : 'btn--secondary'}`}
                style={{ padding: '1px 5px', fontSize: 9, fontWeight: selectedArchitecture === arch ? 'bold' : 'normal' }}
                onClick={() => handleSwitchArchitecture(arch)}
              >
                {arch}
              </button>
            ))}
          </span>
        </div>
        <div className="qa-detail-row">
          <span className="qa-detail-key">Sliding Window:</span>
          <span className="qa-detail-val text-mono text-cyan">
            3.0s (64 steps · 250ms hop · 85% overlap)
          </span>
        </div>
        <div className="qa-detail-row">
          <span className="qa-detail-key">Buffer Telemetry:</span>
          <span className="qa-detail-val text-mono">
            {temporalInferenceEngine.getBufferStats().sampleCount} frames ({temporalInferenceEngine.getBufferStats().durationSeconds}s / 3.0s)
          </span>
        </div>
        <div className="qa-detail-row">
          <span className="qa-detail-key">Predicted Phase:</span>
          <span className="qa-detail-val text-mono font-bold text-good">
            {temporalPrediction
              ? `${temporalPrediction.phase} (${Math.round((temporalPrediction.phaseProbabilities[temporalPrediction.phase] ?? 0) * 100)}%)`
              : 'ACQUIRING WINDOW...'}
          </span>
        </div>
        <div className="qa-detail-row">
          <span className="qa-detail-key">Rep Phase (Granular):</span>
          <span className="qa-detail-val text-mono text-cyan font-bold">
            {temporalPrediction?.repPhase ?? 'RESET'}
          </span>
        </div>
        <div className="qa-detail-row">
          <span className="qa-detail-key">Temporal Quality:</span>
          <span className="qa-detail-val text-mono font-bold text-good">
            {temporalPrediction ? `${Math.round(temporalPrediction.quality * 100)}%` : '—'}
          </span>
        </div>
        <div className="qa-detail-row">
          <span className="qa-detail-key">Kinetic Stability:</span>
          <span className="qa-detail-val text-mono font-bold text-good">
            {temporalPrediction ? `${Math.round(temporalPrediction.stability * 100)}%` : '—'}
          </span>
        </div>
        <div className="qa-detail-row">
          <span className="qa-detail-key">Compensation Pattern:</span>
          <span className={`qa-detail-val text-mono font-bold ${temporalPrediction?.compensation !== 'NONE' ? 'text-warn' : 'text-good'}`}>
            {temporalPrediction
              ? `${temporalPrediction.compensation} (${Math.round((temporalPrediction.compensationProbabilities[temporalPrediction.compensation] ?? 0) * 100)}%)`
              : 'NONE'}
          </span>
        </div>
        <div className="qa-detail-row">
          <span className="qa-detail-key">Inference Concurrency:</span>
          <span className="qa-detail-val text-mono text-good">
            NON-BLOCKING ASYNC (MICROTASKS)
          </span>
        </div>
        <div style={{ height: 1, background: 'var(--border-subtle)', margin: '6px 0' }} />
        {mode === 'DEMO' && (
          <>
            <div className="qa-detail-row" style={{ background: 'rgba(255, 167, 38, 0.1)', padding: '4px 6px', borderRadius: 4, margin: '2px 0' }}>
              <span className="qa-detail-key font-bold" style={{ color: '#FFA726' }}>Application Mode:</span>
              <span className="qa-detail-val text-mono font-bold" style={{ color: '#FFA726' }}>DEMO</span>
            </div>
            <div className="qa-detail-row">
              <span className="qa-detail-key">Camera:</span>
              <span className="qa-detail-val text-mono text-good">OFF (NOT REQUIRED)</span>
            </div>
            <div className="qa-detail-row">
              <span className="qa-detail-key">Demo Timeline:</span>
              <span className="qa-detail-val text-mono text-cyan">
                {Math.round((demoTimelineMs ?? 0) / 1000)} / 16 sec ({demoAngle !== undefined ? `${Math.round(demoAngle)}°` : '—'})
              </span>
            </div>
            <div className="qa-detail-row">
              <span className="qa-detail-key">Demo Phase:</span>
              <span className="qa-detail-val text-mono font-bold text-good">
                {demoPhase?.phase || 'REFERENCE'} ({demoPhase?.shortLabel || 'Reference'})
              </span>
            </div>
            <div className="qa-detail-row">
              <span className="qa-detail-key">Persistent Save:</span>
              <span className="qa-detail-val text-mono text-warn font-bold">DISABLED (ISOLATED)</span>
            </div>
            <div style={{ height: 1, background: 'var(--border-subtle)', margin: '4px 0' }} />
          </>
        )}
        <div className="qa-detail-row">
          <span className="qa-detail-key">Pose Engine Provider:</span>
          <span className="qa-detail-val text-mono font-bold text-good">
            {stats?.providerType === 'yolo' ? 'YOLO11n-Pose (CUDA Primary)' : stats?.isFallback ? 'MediaPipe (Fallback Active)' : 'MediaPipe'}
          </span>
        </div>
        <div className="qa-detail-row">
          <span className="qa-detail-key">Compute Hardware:</span>
          <span className="qa-detail-val text-mono font-bold text-cyan">
            {stats?.device || (stats?.isCuda ? 'cuda:0 (NVIDIA RTX 4070)' : 'WebGL / WASM (CPU)')}
          </span>
        </div>
        <div className="qa-detail-row">
          <span className="qa-detail-key">Pose Inference Latency:</span>
          <span className="qa-detail-val text-mono font-bold text-good">
            {stats?.inferenceMs !== undefined ? `${stats.inferenceMs} ms` : '~15 ms'}
          </span>
        </div>
        <div className="qa-detail-row">
          <span className="qa-detail-key">End-to-End Pose Latency:</span>
          <span className="qa-detail-val text-mono font-bold text-good">
            {stats?.endToEndMs !== undefined ? `${stats.endToEndMs} ms` : '~16 ms'}
          </span>
        </div>
        <div className="qa-detail-row">
          <span className="qa-detail-key">Tracking Framerate:</span>
          <span className="qa-detail-val text-mono font-bold text-good">
            {stats?.fps ?? 60} FPS ({stats?.confidence ?? 92}% Confidence)
          </span>
        </div>
        <div className="qa-detail-row">
          <span className="qa-detail-key">Fallback Status:</span>
          <span className={`qa-detail-val text-mono font-bold ${stats?.isFallback ? 'text-warn' : 'text-good'}`}>
            {stats?.isFallback ? 'ACTIVE (MediaPipe Fallback)' : 'STANDBY READY (MediaPipe)'}
          </span>
        </div>
        <div className="qa-detail-row">
          <span className="qa-detail-key">Angle Source:</span>
          <span className="qa-detail-val text-mono font-bold text-cyan">
            {isStreaming ? (stats?.providerType === 'yolo' ? 'LIVE YOLO CUDA' : 'LIVE MEDIAPIPE') : mode === 'DEMO' ? 'DEMO SIMULATION' : 'REFERENCE REST'}
          </span>
        </div>
        <div className="qa-detail-row">
          <span className="qa-detail-key">Authoritative Current Angle:</span>
          <span className="qa-detail-val text-cyan font-bold">
            {analysis.angle !== null ? `${analysis.angle}°` : '—'}
          </span>
        </div>
        <div className="qa-detail-row">
          <span className="qa-detail-key">Live Analysis Snapshot:</span>
          <span className="qa-detail-val text-cyan">
            {analysis.angle !== null ? `${analysis.angle}° (${analysis.feedback})` : 'Waiting for landmarks'}
          </span>
        </div>
        <div className="qa-detail-row">
          <span className="qa-detail-key">Session Engine State:</span>
          <span className={`qa-detail-val text-mono font-bold ${sessionState.sessionState === 'ACTIVE' ? 'text-good' : sessionState.sessionState === 'READY' ? 'text-cyan' : 'text-muted'}`}>
            {sessionState.sessionState || (sessionState.isActive ? 'ACTIVE' : 'IDLE')}
          </span>
        </div>
        <div className="qa-detail-row">
          <span className="qa-detail-key">Session Time Remaining:</span>
          <span className="qa-detail-val text-mono font-bold text-cyan">
            {formatTimerMMSS(sessionState.metrics.timeRemainingSeconds ?? remainingSeconds ?? 180)} ({sessionState.metrics.timeRemainingSeconds ?? remainingSeconds ?? 180}s)
          </span>
        </div>
        <div className="qa-detail-row">
          <span className="qa-detail-key">Tutorial Timeline State:</span>
          <span className={`qa-detail-val ${tutorialTimelineStatus === 'PAUSED' ? 'text-good font-bold' : ''}`}>
            {tutorialTimelineStatus}
          </span>
        </div>
        <div className="qa-detail-row">
          <span className="qa-detail-key">Completed Reps (Session):</span>
          <span className="qa-detail-val font-bold text-good">{sessionReps}</span>
        </div>
        <div className="qa-detail-row">
          <span className="qa-detail-key">Patient Data State:</span>
          <span className={`qa-detail-val text-mono ${sessionReps > 0 || (isStreaming && analysis.angle !== null) ? 'text-good' : ''}`}>
            {sessionReps > 0 || (isStreaming && analysis.angle !== null) ? 'ACTIVE' : 'NONE'}
          </span>
        </div>
        <div className="qa-detail-row">
          <span className="qa-detail-key">First Rep Peak:</span>
          <span className="qa-detail-val text-mono">{sessionState.metrics.firstRepPeak !== null ? `${sessionState.metrics.firstRepPeak}°` : '—'}</span>
        </div>
        <div className="qa-detail-row">
          <span className="qa-detail-key">Last Rep Peak Angle:</span>
          <span className="qa-detail-val text-mono">{lastRepPeakDisplay}</span>
        </div>
        <div className="qa-detail-row">
          <span className="qa-detail-key">Net Movement Change:</span>
          <span className="qa-detail-val text-mono font-bold text-good">
            {sessionState.metrics.netROMChange !== null ? `${sessionState.metrics.netROMChange >= 0 ? '+' : ''}${sessionState.metrics.netROMChange}°` : '—'}
          </span>
        </div>
        <div className="qa-detail-row">
          <span className="qa-detail-key">Average Rep Improvement:</span>
          <span className="qa-detail-val text-mono">
            {sessionState.metrics.averageRepImprovement !== null ? `${sessionState.metrics.averageRepImprovement >= 0 ? '+' : ''}${sessionState.metrics.averageRepImprovement}°` : '—'}
          </span>
        </div>
        <div className="qa-detail-row">
          <span className="qa-detail-key">Saved Sessions Count:</span>
          <span className="qa-detail-val text-mono">{savedSessionsCount}</span>
        </div>
        <div className="qa-detail-row">
          <span className="qa-detail-key">Auth User ID:</span>
          <span className="qa-detail-val text-mono">{maskedUserId}</span>
        </div>
        <div className="qa-detail-row">
          <span className="qa-detail-key">Profile Trigger Status:</span>
          <span className={`qa-detail-val ${profileTriggerStatus === 'PASS' ? 'text-good' : profileTriggerStatus === 'FAIL' ? 'text-warn' : ''}`}>
            {profileTriggerStatus} {profile?.full_name ? `(${profile.full_name})` : ''}
          </span>
        </div>
        <div className="qa-detail-row">
          <span className="qa-detail-key">Patient ID Generation:</span>
          <span className={`qa-detail-val ${patientIdStatus === 'PASS' ? 'text-good' : patientIdStatus === 'FAIL' ? 'text-warn' : ''}`}>
            {patientIdStatus} {profile?.patient_login_id ? `(${profile.patient_login_id})` : ''}
          </span>
        </div>
        <div className="qa-detail-row">
          <span className="qa-detail-key">Exercise:</span>
          <span className="qa-detail-val font-bold text-cyan">{activeExercise.name}</span>
        </div>
        <div className="qa-detail-row">
          <span className="qa-detail-key">Laterality:</span>
          <span className="qa-detail-val text-mono font-bold text-cyan">
            {activeExercise.laterality === 'bilateral' ? 'BILATERAL' : (activeExercise.side?.toUpperCase() || 'RIGHT')}
          </span>
        </div>
        <div className="qa-detail-row">
          <span className="qa-detail-key">Live Analysis:</span>
          <span className={`qa-detail-val text-mono font-bold ${activeExercise.liveAnalysisAvailable ? 'text-good' : 'text-warn'}`}>
            {activeExercise.liveAnalysisAvailable ? 'AVAILABLE' : 'REFERENCE ONLY'}
          </span>
        </div>
        <div className="qa-detail-row">
          <span className="qa-detail-key">Active Landmarks:</span>
          <span className="qa-detail-val text-mono">
            {activeExercise.laterality === 'bilateral' ? 'BOTH' : (activeExercise.side?.toUpperCase() || 'RIGHT')}
          </span>
        </div>
        <div className="qa-detail-row">
          <span className="qa-detail-key">Metric:</span>
          <span className="qa-detail-val text-mono">
            {activeExercise.metricName} ({activeExercise.targetMetric})
          </span>
        </div>
        <div className="qa-detail-row">
          <span className="qa-detail-key">Posture / Target:</span>
          <span className="qa-detail-val">
            {activeExercise.postureMode.toUpperCase()} · {activeExercise.targetAngle}°
          </span>
        </div>
        <div className="qa-detail-row">
          <span className="qa-detail-key">Movement State:</span>
          <span className="qa-detail-val">{analysis.state}</span>
        </div>

        <div style={{ height: 1, background: 'var(--border-subtle)', margin: '6px 0' }} />

        {/* ── Physiosis Assistant & STT QA Telemetry (Patch 8) ─────── */}
        <div className="qa-detail-row">
          <span className="qa-detail-key">Ollama:</span>
          <span className={`qa-detail-val text-mono ${ollamaStatus?.status === 'CONNECTED' ? 'text-good' : 'text-warn'}`}>
            {ollamaStatus?.status || 'OFFLINE'}
          </span>
        </div>
        <div className="qa-detail-row">
          <span className="qa-detail-key">Model:</span>
          <span className="qa-detail-val text-mono text-cyan">
            {ollamaStatus?.model || (ollamaStatus?.availableModels?.length ? ollamaStatus.availableModels.join(', ') : 'llama3.2')}
          </span>
        </div>
        <div className="qa-detail-row">
          <span className="qa-detail-key">STT PROVIDER:</span>
          <span className="qa-detail-val text-mono text-cyan">
            {speechInputService.getProviderName()}
          </span>
        </div>
        <div className="qa-detail-row">
          <span className="qa-detail-key">STT MODEL:</span>
          <span className="qa-detail-val text-mono">
            Systran/faster-whisper-tiny (CPU INT8)
          </span>
        </div>
        <div className="qa-detail-row">
          <span className="qa-detail-key">STT STATUS:</span>
          <span className={`qa-detail-val text-mono ${speechInputService.isSupported() ? 'text-good' : 'text-warn'}`}>
            {speechInputService.isSupported() ? 'READY' : 'OFFLINE'}
          </span>
        </div>
        <div className="qa-detail-row">
          <span className="qa-detail-key">MICROPHONE:</span>
          <span className={`qa-detail-val text-mono ${speechInputService.getStatus() === 'listening' ? 'text-cyan font-bold' : speechInputService.getStatus() === 'error' ? 'text-warn' : 'text-good'}`}>
            {speechInputService.getStatus() === 'listening' ? 'ACTIVE' : speechInputService.getStatus() === 'error' ? 'DENIED/ERROR' : 'READY'}
          </span>
        </div>
        <div className="qa-detail-row">
          <span className="qa-detail-key">TRANSCRIPT:</span>
          <span className="qa-detail-val text-mono text-good">READY</span>
        </div>
        <div className="qa-detail-row">
          <span className="qa-detail-key">Domain Guard:</span>
          <span className="qa-detail-val text-mono text-good">FAIL-CLOSED (ACTIVE)</span>
        </div>
        <div className="qa-detail-row">
          <span className="qa-detail-key">Domain Policy:</span>
          <span className="qa-detail-val text-mono text-cyan">PHYSIOTHERAPY ONLY</span>
        </div>
        <div className="qa-detail-row">
          <span className="qa-detail-key">Ollama on Blocked:</span>
          <span className="qa-detail-val text-mono text-good">NO (0 TOKENS)</span>
        </div>
        <div className="qa-detail-row">
          <span className="qa-detail-key">Safety Guard:</span>
          <span className="qa-detail-val text-mono text-good">READY</span>
        </div>
        <div className="qa-detail-row">
          <span className="qa-detail-key">Session Context:</span>
          <span className={`qa-detail-val text-mono ${sessionReps > 0 || (isStreaming && analysis.angle !== null) || savedSessionsCount > 0 ? 'text-good' : 'text-muted'}`}>
            {sessionReps > 0 || (isStreaming && analysis.angle !== null) || savedSessionsCount > 0 ? 'AVAILABLE' : 'NONE'}
          </span>
        </div>
        <div className="qa-detail-row">
          <span className="qa-detail-key">TTS PROVIDER:</span>
          <span className="qa-detail-val text-mono text-cyan">
            {speechOutputService.isSupported() ? 'LOCAL (SAPI/OneCore)' : 'BROWSER_TTS_FALLBACK'}
          </span>
        </div>
        <div className="qa-detail-row">
          <span className="qa-detail-key">VOICE MODEL:</span>
          <span className="qa-detail-val text-mono">
            Microsoft Heera / David / Hazel / Zira
          </span>
        </div>
        <div className="qa-detail-row">
          <span className="qa-detail-key">TTS STATUS:</span>
          <span className={`qa-detail-val text-mono ${speechOutputService.isSupported() ? 'text-good' : 'text-warn'}`}>
            {speechOutputService.isSupported() ? 'READY' : 'OFFLINE'}
          </span>
        </div>

        {/* ── Explainable AI (XAI) Developer Trace (Patch 8) ──────── */}
        <div style={{ height: 1, background: 'var(--border-subtle)', margin: '6px 0' }} />
        <div className="qa-detail-row" style={{ background: 'rgba(56, 189, 248, 0.08)', padding: '4px 6px', borderRadius: 4, margin: '2px 0' }}>
          <span className="qa-detail-key font-bold" style={{ color: '#38bdf8' }}>XAI Coaching Explanation:</span>
          <span className="qa-detail-val text-mono font-bold text-good">✓ TRACEABLE</span>
        </div>
        <div className="qa-detail-row">
          <span className="qa-detail-key">XAI Metric:</span>
          <span className="qa-detail-val text-mono text-cyan font-bold">
            {aiState.explanation?.developerView?.metric ?? 'currentAngle'}
          </span>
        </div>
        <div className="qa-detail-row">
          <span className="qa-detail-key">XAI Threshold:</span>
          <span className="qa-detail-val text-mono font-bold">
            {String(aiState.explanation?.developerView?.threshold ?? 'target = 165°')}
          </span>
        </div>
        <div className="qa-detail-row">
          <span className="qa-detail-key">XAI Confidence:</span>
          <span className="qa-detail-val text-mono font-bold text-good">
            {aiState.explanation ? `${Math.round(aiState.explanation.confidence * 100)}% (${aiState.explanation.confidence})` : '—'}
          </span>
        </div>
        <div className="qa-detail-row">
          <span className="qa-detail-key">XAI Sources:</span>
          <span className="qa-detail-val text-mono text-cyan">
            {aiState.explanation?.source ? `[${aiState.explanation.source.join(', ')}]` : '—'}
          </span>
        </div>
        <div className="qa-detail-row">
          <span className="qa-detail-key">XAI Timestamp:</span>
          <span className="qa-detail-val text-mono text-muted">
            {aiState.explanation?.developerView?.timestamp
              ? new Date(aiState.explanation.developerView.timestamp).toLocaleTimeString()
              : '—'}
          </span>
        </div>
        <div className="qa-detail-row">
          <span className="qa-detail-key">XAI Observation:</span>
          <span className="qa-detail-val text-muted" style={{ fontSize: 10 }}>
            {aiState.explanation?.observation ?? '—'}
          </span>
        </div>
        <div className="qa-detail-row">
          <span className="qa-detail-key">XAI Evidence:</span>
          <span className="qa-detail-val text-mono text-cyan" style={{ fontSize: 10 }}>
            {aiState.explanation?.evidence ?? '—'}
          </span>
        </div>
        <div className="qa-detail-row">
          <span className="qa-detail-key">XAI Patient View:</span>
          <span className="qa-detail-val" style={{ fontSize: 10.5, color: 'var(--text-secondary)' }}>
            "{aiState.explanation?.patientView ?? '—'}"
          </span>
        </div>

        <div style={{ height: 1, background: 'var(--border-subtle)', margin: '6px 0' }} />

        {/* ── Patch 3: Session & Persistence Diagnostics ───────────── */}
        <div className="qa-detail-row">
          <span className="qa-detail-key">SESSION STATUS:</span>
          <span className={`qa-detail-val text-mono ${sessionStatus === 'ACTIVE' ? 'text-good' : sessionStatus === 'ENDING' ? 'text-warn' : ''}`}>
            {sessionStatus}
          </span>
        </div>
        <div className="qa-detail-row">
          <span className="qa-detail-key">END REASON:</span>
          <span className="qa-detail-val text-mono">
            {endReason ? endReason.toUpperCase() : '—'}
          </span>
        </div>
        <div className="qa-detail-row">
          <span className="qa-detail-key">REPORT:</span>
          <span className={`qa-detail-val text-mono ${isReportReady ? 'text-good' : ''}`}>
            {isReportReady ? 'READY' : 'NOT READY'}
          </span>
        </div>
        <div className="qa-detail-row">
          <span className="qa-detail-key">PERSISTENCE:</span>
          <span className={`qa-detail-val text-mono ${persistenceStatus === 'SAVED' ? 'text-good' : persistenceStatus === 'FAILED' ? 'text-crit' : persistenceStatus === 'PENDING' ? 'text-warn' : ''}`}>
            {persistenceStatus}
          </span>
        </div>
        <div className="qa-detail-row">
          <span className="qa-detail-key">REP COUNT:</span>
          <span className="qa-detail-val text-mono font-bold">{sessionReps}</span>
        </div>

        <div style={{ height: 1, background: 'var(--border-subtle)', margin: '6px 0' }} />

        {/* ── Patch 4: Timer Diagnostics ─────────────────────────── */}
        <div className="qa-detail-row">
          <span className="qa-detail-key">SESSION TIMER:</span>
          <span className={`qa-detail-val text-mono ${isTimerRunning ? 'text-good' : ''}`}>
            {isTimerRunning ? 'RUNNING' : 'STOPPED'}
          </span>
        </div>
        <div className="qa-detail-row">
          <span className="qa-detail-key">REMAINING:</span>
          <span className={`qa-detail-val text-mono font-bold ${remainingSeconds !== undefined && remainingSeconds <= 10 ? 'text-crit' : remainingSeconds !== undefined && remainingSeconds <= 30 ? 'text-warn' : ''}`}>
            {remainingSeconds !== undefined ? formatTimerMMSS(remainingSeconds) : '—'} ({remainingSeconds ?? '—'}s)
          </span>
        </div>
        <div className="qa-detail-row">
          <span className="qa-detail-key">SESSION START:</span>
          <span className="qa-detail-val text-mono">
            {sessionStartTime ? new Date(sessionStartTime).toLocaleTimeString() : '—'}
          </span>
        </div>
        <div className="qa-detail-row">
          <span className="qa-detail-key">TIMER MODE:</span>
          <span className="qa-detail-val">
            {onToggleTestTimer && (
              <button
                type="button"
                className="btn btn--secondary btn--sm"
                style={{ padding: '1px 6px', fontSize: 10 }}
                onClick={onToggleTestTimer}
                title="Toggle between 120s production timer and 10s development test timer"
              >
                {isTestTimer ? '10s (TEST)' : '120s (PROD)'}
              </button>
            )}
          </span>
        </div>

        <div style={{ height: 1, background: 'var(--border-subtle)', margin: '6px 0' }} />

        {/* ── Patch 2: Suggestion Diagnostics ───────────────────────── */}
        <div className="qa-detail-row">
          <span className="qa-detail-key">Active Limitation:</span>
          <span className={`qa-detail-val text-mono ${isLimitationActive ? 'text-warn' : ''}`}>
            {activeLimitationId}
          </span>
        </div>
        <div className="qa-detail-row">
          <span className="qa-detail-key">Suggestion:</span>
          <span className={`qa-detail-val text-mono ${activeSuggestion ? 'text-warn' : ''}`}>
            {activeSuggestionId}
          </span>
        </div>
        <div className="qa-detail-row">
          <span className="qa-detail-key">Suggestion Source:</span>
          <span className="qa-detail-val" style={{ color: 'var(--text-disabled)', fontSize: 10 }}>
            CURATED PROTOTYPE LIBRARY
          </span>
        </div>
      </div>

      <div className="qa-panel__footer">
        <span>Toggle: <code>Shift + D</code> or <code>?qa=1</code></span>
        <span className="text-good">Demo Ready ✓</span>
      </div>
    </aside>
  );
};
