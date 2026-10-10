/**
 * ReferenceExerciseCard.tsx
 * Shows the currently loaded reference exercise with animated skeleton demonstration,
 * body-region classification, laterality controls, and mode navigation (Reference, Practice, Analysis).
 *
 * Passes the full live analysis snapshot to ReferenceSkeletonCanvas so that
 * PRACTICE mode can read movement state and feedback from the existing pipeline.
 */

import React, { useState } from 'react';
import { BookOpen, Database, Sparkles } from 'lucide-react';
import { ExerciseRegistry, getDefaultExercise } from '../../engine/exercise/ExerciseRegistry';
import { ReferenceSkeletonCanvas } from '../skeleton/ReferenceSkeletonCanvas';
import { Physiosis3DViewer } from '../three/Physiosis3DViewer';
import type { ExerciseDefinition } from '../../engine/exercise/ExerciseTypes';
import type { RepResult } from '../../engine/session/SessionTypes';
import type { ShoulderFlexionAnalysis } from '../../engine/biomechanics/biomechanicsTypes';
import type { PhaseConfig } from '../../engine/exercise/PoseTypes';
import type { Landmark } from '../../types/pose';

const DIFFICULTY_LABELS: Record<ExerciseDefinition['difficulty'], string> = {
  beginner: 'Beginner',
  intermediate: 'Intermediate',
  advanced: 'Advanced',
};

interface ReferenceExerciseCardProps {
  mode?: 'TUTORIAL' | 'PRACTICE' | 'LIVE' | 'DEMO';
  onStartPractice?: () => void;
  onBackToTutorial?: () => void;
  onExitDemoMode?: () => void;
  exercise?: ExerciseDefinition;
  exerciseId?: string;
  selectedSide?: 'left' | 'right' | 'bilateral';
  onSelectSide?: (side: 'left' | 'right' | 'bilateral') => void;
  liveLandmarks?: Landmark[] | null;
  isStreaming?: boolean;
  liveAngle?: number | null;
  lastLimitationPeak?: number | null;
  latestRep?: RepResult | null;
  /** Full live analysis — forwarded to practice mode for state + feedback */
  liveAnalysis?: ShoulderFlexionAnalysis | null;
  onDemoFrame?: (angleDeg: number, phaseConfig: PhaseConfig, elapsedMs: number) => void;
}

export const ReferenceExerciseCard: React.FC<ReferenceExerciseCardProps> = ({
  mode = 'TUTORIAL',
  onStartPractice,
  onBackToTutorial,
  onExitDemoMode,
  exercise: propExercise,
  exerciseId,
  selectedSide = 'right',
  onSelectSide,
  liveLandmarks,
  isStreaming = false,
  liveAngle,
  lastLimitationPeak,
  latestRep,
  liveAnalysis,
  onDemoFrame,
}) => {
  const [dimensionMode, setDimensionMode] = useState<'2D' | '3D'>('2D');

  const exercise =
    propExercise ??
    (exerciseId ? ExerciseRegistry.getById(exerciseId) : getDefaultExercise()) ??
    getDefaultExercise();

  const isPractice = mode === 'PRACTICE';
  const isDemo = mode === 'DEMO';
  const effectiveSide = exercise.laterality === 'bilateral' ? 'bilateral' : selectedSide;

  return (
    <div className="card reference-exercise-card">
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div className="card__header">
        <div className="card__header-left">
          <BookOpen size={16} />
          <div>
            <span className="card__title">
              {isPractice
                ? 'Live Practice'
                : isDemo
                ? 'Demonstration (Demo Mode)'
                : 'Reference Demonstration'}
            </span>
            {!isPractice && (
              <span
                style={{
                  fontSize: '10.5px',
                  color: 'var(--text-muted)',
                  display: 'block',
                  fontWeight: 500,
                }}
              >
                {isDemo
                  ? 'Deterministic 16s demonstration — not patient data'
                  : 'Reference tutorial — not patient data'}
              </span>
            )}
          </div>
        </div>
        <div className="card__header-right">
          {/* 2D / 3D Viewport Dimension Switcher */}
          <div className="laterality-toggle-group" style={{ marginRight: '6px' }} role="group" aria-label="Visualization Dimension">
            <button
              type="button"
              className={`laterality-btn ${dimensionMode === '2D' ? 'laterality-btn--active' : ''}`}
              onClick={() => setDimensionMode('2D')}
              title="2D Canvas View"
            >
              2D
            </button>
            <button
              type="button"
              className={`laterality-btn ${dimensionMode === '3D' ? 'laterality-btn--active' : ''}`}
              onClick={() => setDimensionMode('3D')}
              title="3D Three.js Skeletal View"
            >
              3D
            </button>
          </div>

          {isPractice ? (
            <span className="live-indicator">
              <span className="live-indicator__dot" />
              LIVE PRACTICE
            </span>
          ) : isDemo ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span
                className="engine-badge engine-badge--amber"
                style={{ padding: '2px 8px', fontSize: 11, fontWeight: 600 }}
              >
                DEMO
              </span>
              <span className={`difficulty-badge difficulty-badge--${exercise.difficulty}`}>
                {DIFFICULTY_LABELS[exercise.difficulty]}
              </span>
            </div>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span className="session-status-badge session-status-badge--idle">TUTORIAL</span>
              <span className={`difficulty-badge difficulty-badge--${exercise.difficulty}`}>
                {DIFFICULTY_LABELS[exercise.difficulty]}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* ── Exercise Name, Region, Laterality & Brief Description ─────── */}
      <div className="reference-exercise-card__info">
        <div className="reference-exercise-card__title-row">
          <div>
            <div className="reference-exercise-card__badges">
              <span
                className={`exercise-badge ${
                  exercise.isDatasetBacked
                    ? 'exercise-badge--dataset'
                    : 'exercise-badge--prototype'
                }`}
              >
                {exercise.isDatasetBacked ? (
                  <>
                    <Database size={9} />
                    <span>DATASET</span>
                  </>
                ) : (
                  <>
                    <Sparkles size={9} />
                    <span>PROTOTYPE</span>
                  </>
                )}
              </span>
              <span
                className={`analysis-tier-badge ${
                  exercise.liveAnalysisAvailable
                    ? 'analysis-tier-badge--live'
                    : 'analysis-tier-badge--demo'
                }`}
              >
                {exercise.liveAnalysisAvailable ? 'LIVE ANALYSIS' : 'REFERENCE DEMO ONLY'}
              </span>
              <span className="reference-exercise-card__region">{exercise.bodyRegion}</span>
            </div>
            <h3 className="reference-exercise-card__name">{exercise.name}</h3>
          </div>

          {/* Side Switcher Control */}
          <div className="reference-exercise-card__side-control">
            {exercise.laterality === 'bilateral' ? (
              <span className="laterality-pill laterality-pill--bilateral">Bilateral</span>
            ) : (
              <div className="laterality-toggle-group" role="group" aria-label="Select Side">
                <button
                  type="button"
                  className={`laterality-btn ${effectiveSide === 'left' ? 'laterality-btn--active' : ''}`}
                  onClick={() => onSelectSide && onSelectSide('left')}
                  title="Track Left Limb"
                >
                  Left
                </button>
                <button
                  type="button"
                  className={`laterality-btn ${effectiveSide === 'right' ? 'laterality-btn--active' : ''}`}
                  onClick={() => onSelectSide && onSelectSide('right')}
                  title="Track Right Limb"
                >
                  Right
                </button>
              </div>
            )}
          </div>
        </div>

        <p className="reference-exercise-card__description">{exercise.description}</p>

        <div className="reference-exercise-card__meta">
          <span className="meta-pill">{exercise.plane}</span>
          <span className="meta-pill">
            Target: {exercise.targetAngle > 0 ? `${exercise.targetAngle}°` : exercise.targetMetric}
          </span>
          <span className="meta-pill mono">{exercise.metricName}</span>
          {exercise.isDatasetBacked ? (
            <span className="meta-pill meta-pill--dataset-status" title="Benchmark reference dataset available in local index">
              Reference dataset: Available
            </span>
          ) : (
            <span className="meta-pill meta-pill--prototype-status">
              Physiosis Prototype
            </span>
          )}
        </div>
      </div>

      {/* ── Animated reference skeleton / Live practice panel ─────────── */}
      <div className="card__divider" />
      <div className="reference-exercise-card__skeleton">
        {dimensionMode === '3D' ? (
          <Physiosis3DViewer
            exerciseId={exercise.id}
            exerciseName={exercise.name}
            initialSide={effectiveSide === 'left' ? 'left' : 'right'}
            targetAngle={exercise.targetAngle || 165}
            liveLandmarks={liveLandmarks}
            isStreaming={isStreaming}
            liveAngle={liveAngle}
            liveAnalysis={liveAnalysis}
          />
        ) : (
          <ReferenceSkeletonCanvas
            mode={mode}
            onStartPractice={onStartPractice}
            onBackToTutorial={onBackToTutorial}
            onExitDemoMode={onExitDemoMode}
            exercise={exercise}
            liveAngle={liveAngle}
            lastLimitationPeak={lastLimitationPeak}
            latestRep={latestRep}
            liveAnalysis={liveAnalysis}
            onDemoFrame={onDemoFrame}
          />
        )}
      </div>
    </div>
  );
};
