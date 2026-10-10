/**
 * LiveFeedCard.tsx
 * The primary dashboard card hosting the live webcam feed and real-time skeleton overlay.
 *
 * Includes graceful error handling and instant fallback to Demo Mode if camera is unavailable.
 */

import React from 'react';
import { Camera, CameraOff, Loader2, AlertCircle, PlayCircle, Clock, RotateCcw, ShieldAlert } from 'lucide-react';
import type { EngineStatus } from '../../types/engine';
import type { PoseTrackingStats } from '../../types/pose';
import type { RehabilitationSafetyState } from '../../engine/safety/SafetyTypes';
import { formatTimerMMSS } from '../../utils/format';

interface LiveFeedCardProps {
  mode?: 'TUTORIAL' | 'PRACTICE' | 'LIVE' | 'DEMO';
  engineStatus: EngineStatus;
  isStreaming: boolean;
  isInitializing: boolean;
  errorMessage: string | null;
  stats: PoseTrackingStats;
  videoRef: React.RefObject<HTMLVideoElement>;
  canvasRef: React.RefObject<HTMLCanvasElement>;
  onToggleCamera: () => void;
  onEnterDemoMode?: () => void;
  onExitDemoMode?: () => void;
  remainingSeconds?: number;
  isTimerRunning?: boolean;
  safetyState?: {
    state: RehabilitationSafetyState;
    statusMessage?: string;
    action?: string;
    escalationNotice?: string;
  };
}

export const LiveFeedCard: React.FC<LiveFeedCardProps> = ({
  mode,
  engineStatus,
  isStreaming,
  isInitializing,
  errorMessage,
  stats,
  videoRef,
  canvasRef,
  onToggleCamera,
  onEnterDemoMode,
  onExitDemoMode,
  remainingSeconds,
  isTimerRunning = false,
  safetyState,
}) => {
  const isDemo = mode === 'DEMO';
  const isLive = engineStatus === 'running' && isStreaming && !isDemo;

  const scrollToDemo = () => {
    if (onEnterDemoMode) {
      onEnterDemoMode();
      return;
    }
    const el = document.querySelector('.reference-exercise-card');
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  };

  return (
    <div className={`card live-feed-card ${isDemo ? 'live-feed-card--demo' : ''}`}>
      {/* Card header */}
      <div className="card__header">
        <div className="card__header-left">
          <Camera size={16} />
          <span className="card__title">Live Engine Feed</span>
        </div>

        <div className="card__header-right">
          {isDemo && (
            <span className="engine-badge engine-badge--amber" style={{ padding: '2px 8px', fontSize: 11, fontWeight: 600 }}>
              DEMO MODE
            </span>
          )}
          {isLive && (
            <div className="live-timer-group">
              <span className="live-indicator">
                <span className="live-indicator__dot" />
                LIVE
              </span>
              {isTimerRunning && remainingSeconds !== undefined && (
                <span
                  className={`live-timer-countdown ${
                    remainingSeconds <= 10
                      ? 'live-timer-countdown--crit'
                      : remainingSeconds <= 30
                      ? 'live-timer-countdown--warn'
                      : ''
                  }`}
                  title="Session Countdown Timer (Auto-ends at 00:00)"
                >
                  <Clock size={11} />
                  <span>{formatTimerMMSS(remainingSeconds)}</span>
                </span>
              )}
            </div>
          )}
          {!isLive && !isInitializing && !isDemo && (
            <span className="card__status-text">Engine Offline</span>
          )}
          {isInitializing && (
            <span className="card__status-text card__status-text--init">
              Initializing MediaPipe...
            </span>
          )}

          {!isDemo ? (
            <button
              className={`btn-camera-toggle ${isStreaming ? 'btn-camera-toggle--active' : ''}`}
              onClick={onToggleCamera}
              disabled={isInitializing}
              type="button"
              aria-label={isStreaming ? 'Stop Camera' : 'Start Camera'}
            >
              {isInitializing ? (
                <>
                  <Loader2 size={14} className="spin-icon" />
                  <span>Loading Engine</span>
                </>
              ) : isStreaming ? (
                <>
                  <CameraOff size={14} />
                  <span>Stop Camera</span>
                </>
              ) : (
                <>
                  <Camera size={14} />
                  <span>Start Camera</span>
                </>
              )}
            </button>
          ) : (
            <button
              className="btn-camera-toggle"
              onClick={onExitDemoMode}
              type="button"
              aria-label="Exit Demo Mode"
              style={{ background: 'var(--bg-elevated)', borderColor: 'var(--border-default)' }}
            >
              <RotateCcw size={13} />
              <span>Exit Demo</span>
            </button>
          )}
        </div>
      </div>

      {/* Feed viewport */}
      <div className="live-feed-card__viewport">
        {/* DEMO MODE Active Viewport State */}
        {isDemo && (
          <div className="live-feed-card__placeholder live-feed-card__placeholder--demo">
            <div className="live-feed-card__placeholder-icon" style={{ color: '#FFA726' }}>
              <PlayCircle size={46} strokeWidth={1.4} />
            </div>
            <p className="live-feed-card__placeholder-title text-warn">DEMONSTRATION ACTIVE</p>
            <p className="live-feed-card__placeholder-subtitle">
              Camera not required — Running deterministic rehabilitation demonstration.
            </p>
            <div className="live-feed-card__placeholder-actions">
              <button
                className="btn btn--secondary"
                onClick={onExitDemoMode}
                type="button"
                style={{ gap: '6px' }}
              >
                <RotateCcw size={13} />
                <span>Exit Demo Mode</span>
              </button>
            </div>
          </div>
        )}

        {/* Error message banner with fallback to demo mode */}
        {!isDemo && errorMessage && (
          <div className="feed-error-banner" role="alert">
            <AlertCircle size={16} className="feed-error-banner__icon" />
            <div className="feed-error-banner__content">
              <div className="feed-error-banner__text">
                <strong>Camera Unavailable: </strong> {errorMessage}
              </div>
              <button
                type="button"
                className="btn-demo-fallback"
                onClick={onEnterDemoMode || scrollToDemo}
                title="Proceed with deterministic demonstration mode"
              >
                <PlayCircle size={13} />
                <span>Use Demo Mode</span>
              </button>
            </div>
          </div>
        )}

        {/* Video feed element */}
        {!isDemo && (
          <video
            ref={videoRef}
            className={`live-feed-card__video ${isStreaming ? 'live-feed-card__video--visible' : ''}`}
            playsInline
            muted
            autoPlay
          />
        )}

        {/* Skeleton canvas overlay */}
        {!isDemo && (
          <canvas
            ref={canvasRef}
            className={`live-feed-card__canvas ${isStreaming ? 'live-feed-card__canvas--visible' : ''}`}
          />
        )}

        {/* Placeholder when offline */}
        {!isDemo && !isStreaming && !isInitializing && (
          <div className="live-feed-card__placeholder">
            <div className="live-feed-card__placeholder-icon">
              <Camera size={44} strokeWidth={1.2} />
            </div>
            <p className="live-feed-card__placeholder-title">Webcam Feed Inactive</p>
            <p className="live-feed-card__placeholder-subtitle">
              Press <strong>Start Camera</strong> to initialize MediaPipe Pose Landmarker or explore the deterministic reference demonstration.
            </p>
            <div className="live-feed-card__placeholder-actions">
              <button
                className="btn-primary-start"
                onClick={onToggleCamera}
                type="button"
              >
                <Camera size={16} />
                <span>Start Camera</span>
              </button>
              <button
                className="btn-secondary-demo"
                onClick={onEnterDemoMode || scrollToDemo}
                type="button"
              >
                <PlayCircle size={15} />
                <span>Use Demo Mode</span>
              </button>
            </div>
          </div>
        )}

        {/* Initializing state */}
        {isInitializing && (
          <div className="live-feed-card__placeholder">
            <Loader2 size={40} className="spin-icon init-spinner" />
            <p className="live-feed-card__placeholder-title">Loading MediaPipe Models</p>
            <p className="live-feed-card__placeholder-subtitle">
              Acquiring camera stream and warming up GPU delegate...
            </p>
          </div>
        )}

        {/* Pose tracking helper overlay when streaming */}
        {isStreaming && !stats.poseDetected && (
          <div className="pose-searching-badge">
            <span className="pose-searching-dot" />
            <span>Position body in camera view</span>
          </div>
        )}

        {/* Safety Intervention Overlay (Patch 6) */}
        {safetyState && (safetyState.state === 'STOP' || safetyState.state === 'ESCALATE') && (
          <div
            style={{
              position: 'absolute',
              top: '16px',
              left: '16px',
              right: '16px',
              zIndex: 30,
              background: safetyState.state === 'ESCALATE' ? 'rgba(183, 28, 28, 0.94)' : 'rgba(230, 81, 0, 0.94)',
              border: `1.5px solid ${safetyState.state === 'ESCALATE' ? '#FF5252' : '#FFB74D'}`,
              borderRadius: '8px',
              padding: '12px 16px',
              color: '#fff',
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
              backdropFilter: 'blur(6px)',
              boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
            }}
          >
            {safetyState.state === 'ESCALATE' ? (
              <ShieldAlert size={24} style={{ color: '#FFD7D7', flexShrink: 0 }} />
            ) : (
              <AlertCircle size={24} style={{ color: '#FFE0B2', flexShrink: 0 }} />
            )}
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 800, fontSize: '13px', letterSpacing: '0.04em' }}>
                {safetyState.state === 'ESCALATE' ? 'CLINICAL SAFETY ESCALATION' : 'EXERCISE SAFETY STOP'}
              </div>
              <div style={{ fontSize: '12px', marginTop: '2px', opacity: 0.95 }}>
                {safetyState.state === 'ESCALATE'
                  ? (safetyState.escalationNotice || 'Contact your physiotherapist immediately.')
                  : "Please stop this exercise and follow your clinician's instructions."}
              </div>
            </div>
          </div>
        )}

        {/* Corner frame markers */}
        <span className="corner corner--tl" aria-hidden="true" />
        <span className="corner corner--tr" aria-hidden="true" />
        <span className="corner corner--bl" aria-hidden="true" />
        <span className="corner corner--br" aria-hidden="true" />
      </div>

      {/* Footer metrics row */}
      <div className="live-feed-card__footer">
        <div className="metric-chip">
          <span className="metric-chip__label">FPS</span>
          <span className="metric-chip__value">
            {isStreaming ? (stats.fps > 0 ? stats.fps : '—') : '—'}
          </span>
        </div>
        <div className="metric-chip">
          <span className="metric-chip__label">Confidence</span>
          <span className="metric-chip__value">
            {isStreaming && stats.poseDetected ? `${stats.confidence}%` : '—'}
          </span>
        </div>
        <div className="metric-chip">
          <span className="metric-chip__label">Landmarks</span>
          <span className="metric-chip__value">
            {isStreaming && stats.poseDetected
              ? `${stats.landmarkCount} / 13`
              : '—'}
          </span>
        </div>
      </div>
    </div>
  );
};
