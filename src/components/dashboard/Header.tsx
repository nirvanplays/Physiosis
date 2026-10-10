/**
 * Header.tsx
 * Top navigation bar for Physiosis:
 *   - Brand logo & tagline
 *   - Scalable exercise library switcher & laterality controls (Left / Right / Bilateral)
 *   - Authenticated Patient ID & profile trigger
 *   - Session controls & history trigger
 *   - Engine status
 */

import React from 'react';
import { Activity, History, Square, User, LogOut, ChevronDown, Grid } from 'lucide-react';
import { EngineStatusBadge } from './EngineStatusBadge';
import type { EngineStatus } from '../../types/engine';
import { getExercise, getDefaultExercise } from '../../engine/exercise/ExerciseRegistry';
import { useAuth } from '../../context/AuthContext';

interface HeaderProps {
  mode?: 'TUTORIAL' | 'PRACTICE' | 'LIVE' | 'DEMO';
  engineStatus: EngineStatus;
  isStreaming: boolean;
  isInitializing: boolean;
  onToggleCamera: () => void;
  selectedExerciseId: string;
  selectedSide?: 'left' | 'right' | 'bilateral';
  onSelectExercise: (exerciseId: string, side?: 'left' | 'right' | 'bilateral') => void;
  onSelectSide?: (side: 'left' | 'right' | 'bilateral') => void;
  onOpenLibrary: () => void;
  onEndSession?: (reason?: 'manual' | 'automatic') => void;
  hasActiveSession?: boolean;
  savedSessionsCount: number;
  onOpenHistory: () => void;
  onOpenProfile?: () => void;
  dimensionMode?: '3D' | '2D';
  onToggleDimension?: (dim: '3D' | '2D') => void;
}

export const Header: React.FC<HeaderProps> = ({
  mode,
  engineStatus,
  selectedExerciseId,
  selectedSide = 'right',
  onSelectSide,
  onOpenLibrary,
  onEndSession,
  hasActiveSession = false,
  savedSessionsCount,
  onOpenHistory,
  onOpenProfile,
  dimensionMode = '3D',
  onToggleDimension,
}) => {
  const { profile, user, signOut } = useAuth();
  const activeExercise = getExercise(selectedExerciseId) ?? getDefaultExercise();

  const patientName = profile?.full_name || user?.user_metadata?.full_name || 'Patient';
  const patientId = profile?.patient_login_id || 'DEMO-001';

  const effectiveSide = activeExercise.laterality === 'bilateral' ? 'bilateral' : selectedSide;

  return (
    <header className="header" role="banner">
      {/* ── Brand Logo & App Identity ─────────────────────────────────── */}
      <div className="header__brand">
        <div className="header__logo-icon">
          <Activity size={18} />
        </div>
        <div className="header__logo-text">
          <span className="header__logo-name">PHYSIOSIS</span>
          <span className="header__logo-tagline">BioKinematic AI</span>
        </div>
      </div>

      {/* ── Center: Target Exercise Selector Switcher & Library Trigger ── */}
      <div className="header__exercise-control" role="group" aria-label="Selected Rehabilitation Protocol">
        <button
          type="button"
          className="header__exercise-selector-btn"
          onClick={onOpenLibrary}
          title="Browse full 11-exercise rehabilitation library (Search & Body Regions)"
        >
          <div className="header__exercise-meta">
            <span className="header__exercise-region">{activeExercise.bodyRegion}</span>
            <span className="header__exercise-name">{activeExercise.name}</span>
          </div>
          <ChevronDown size={14} className="text-muted flex-shrink-0" />
        </button>

        {/* Laterality Selector Switcher */}
        {activeExercise.laterality === 'bilateral' ? (
          <span className="header__laterality-pill header__laterality-pill--bilateral" title="Bilateral Symmetrical Movement">
            Bilateral
          </span>
        ) : (
          <div className="header__laterality-toggle" role="group" aria-label="Select Active Limb Side">
            <button
              type="button"
              className={`header__laterality-btn ${effectiveSide === 'left' ? 'header__laterality-btn--active' : ''}`}
              onClick={() => onSelectSide && onSelectSide('left')}
              title="Track Left Limb"
            >
              Left
            </button>
            <button
              type="button"
              className={`header__laterality-btn ${effectiveSide === 'right' ? 'header__laterality-btn--active' : ''}`}
              onClick={() => onSelectSide && onSelectSide('right')}
              title="Track Right Limb"
            >
              Right
            </button>
          </div>
        )}

        <button
          type="button"
          className="header__library-quick-btn"
          onClick={onOpenLibrary}
          title="Open Rehabilitation Protocol Library"
        >
          <Grid size={13} />
          <span>Library</span>
        </button>

        {/* 3D / 2D Dimension Switcher */}
        {onToggleDimension && (
          <div className="header__dimension-toggle" role="group" aria-label="Visualization Dimension">
            <button
              type="button"
              className={`header__dim-btn ${dimensionMode === '3D' ? 'header__dim-btn--active' : ''}`}
              onClick={() => onToggleDimension('3D')}
              title="Switch to 3D Biomechanical Skeleton View"
            >
              3D
            </button>
            <button
              type="button"
              className={`header__dim-btn ${dimensionMode === '2D' ? 'header__dim-btn--active' : ''}`}
              onClick={() => onToggleDimension('2D')}
              title="Switch to 2D Planar Avatar View"
            >
              2D
            </button>
          </div>
        )}
      </div>

      {/* ── Right Actions: Session Status, Patient ID, History, Logout ── */}
      <div className="header__actions">
        {/* Engine Status Badge */}
        <EngineStatusBadge status={engineStatus} mode={mode} />

        {/* Patient Profile Quick Pill */}
        <button
          type="button"
          className="header__patient-pill"
          onClick={onOpenProfile}
          title="View Patient Account Details"
        >
          <div className="patient-pill__icon">
            <User size={13} />
          </div>
          <div className="patient-pill__details">
            <span className="patient-pill__name">{patientName}</span>
            <span className="patient-pill__id mono">{patientId}</span>
          </div>
        </button>

        {/* End Active Session Quick Button */}
        {hasActiveSession && onEndSession && (
          <button
            type="button"
            className="btn-header-end"
            onClick={() => onEndSession('manual')}
            title="End current active session and generate report"
          >
            <Square size={11} fill="currentColor" />
            <span>End Session</span>
          </button>
        )}

        {/* Previous Sessions History Button */}
        <button
          type="button"
          className="btn-header-history"
          onClick={onOpenHistory}
          title="View previous rehabilitation sessions"
        >
          <History size={14} />
          <span>History</span>
          {savedSessionsCount > 0 && (
            <span className="btn-header-history__badge">{savedSessionsCount}</span>
          )}
        </button>

        {/* Logout Quick Button */}
        <button
          type="button"
          className="btn-header-logout"
          onClick={signOut}
          title="Sign Out"
        >
          <LogOut size={14} />
        </button>
      </div>
    </header>
  );
};
