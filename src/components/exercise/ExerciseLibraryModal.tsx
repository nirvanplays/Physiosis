/**
 * ExerciseLibraryModal.tsx
 * Premium 3D Anatomical Body Map Exercise Selection Experience.
 *
 * Core Interactions:
 *   1. 3D Body Model Browser: Direct Raycast hover/click on the 3D human skeleton.
 *   2. Anatomical Region Hot-Spots: Head/Neck, Shoulders, Arms, Wrists, Spine, Hips, Knees, Ankles.
 *   3. Instant Kinematic Retargeting: Selecting any exercise immediately updates 3D skeletal animation.
 *   4. Laterality Highlighting: Left/Right/Bilateral switching directly on 3D model.
 *   5. Robust WebGL Fallback: Compact grouped list if WebGL is unavailable.
 */

import React, { useState, useEffect, useMemo } from 'react';
import {
  X,
  Layers,
  Search,
  CheckCircle2,
  Play,
  Database,
  User,
  ChevronRight,
} from 'lucide-react';
import type { ExerciseDefinition } from '../../engine/exercise/ExerciseTypes';
import { getAllExercises, getExercise } from '../../engine/exercise/ExerciseRegistry';
import { getExerciseMotion } from '../../three/exercises/ExerciseMotionRegistry';
import type { BodyRegionId } from '../../three/skeleton/SkeletonRig';
import { Physiosis3DViewer } from '../three/Physiosis3DViewer';

interface ExerciseLibraryModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedExerciseId: string;
  selectedSide?: 'left' | 'right' | 'bilateral';
  onSelectExercise: (exerciseId: string, side: 'left' | 'right' | 'bilateral') => void;
  onStartPractice?: (exerciseId: string, side: 'left' | 'right' | 'bilateral') => void;
}

interface RegionMeta {
  id: BodyRegionId | 'ALL';
  label: string;
  exerciseIds: string[];
}

const BODY_REGIONS: RegionMeta[] = [
  {
    id: 'ALL',
    label: 'All Protocols',
    exerciseIds: [
      'shoulder-flexion',
      'shoulder_flexion',
      'shoulder-abduction',
      'shoulder_abduction',
      'arm-circumduction',
      'arm_circumduction',
      'ball-press',
      'ball_press',
      'cross-body-shoulder-stretch',
      'cross_body_shoulder_stretch',
      'isometric-rotation',
      'isometric_rotation',
      'isometric-side-bending',
      'isometric_side_bending',
      'wrist-extension-stretch',
      'wrist_extension_stretch',
      'ankle-plantar-flexion',
      'ankle_plantar_flexion',
      'knee-extension',
      'knee_extension',
      'straight-leg-raise',
      'straight_leg_raise',
    ],
  },
  {
    id: 'shoulders',
    label: 'Shoulders',
    exerciseIds: [
      'shoulder-flexion',
      'shoulder_flexion',
      'shoulder-abduction',
      'shoulder_abduction',
      'arm-circumduction',
      'arm_circumduction',
      'cross-body-shoulder-stretch',
      'cross_body_shoulder_stretch',
      'ball-press',
      'ball_press',
      'isometric-rotation',
      'isometric_rotation',
    ],
  },
  {
    id: 'arms',
    label: 'Arms & Elbows',
    exerciseIds: [
      'shoulder-flexion',
      'shoulder_flexion',
      'shoulder-abduction',
      'shoulder_abduction',
      'arm-circumduction',
      'arm_circumduction',
      'ball-press',
      'ball_press',
    ],
  },
  {
    id: 'wrists',
    label: 'Wrists',
    exerciseIds: ['wrist-extension-stretch', 'wrist_extension_stretch'],
  },
  {
    id: 'spine',
    label: 'Spine & Trunk',
    exerciseIds: ['isometric-side-bending', 'isometric_side_bending'],
  },
  {
    id: 'head',
    label: 'Head / Neck',
    exerciseIds: ['isometric-side-bending', 'isometric_side_bending'],
  },
  {
    id: 'hips',
    label: 'Pelvis & Hips',
    exerciseIds: ['straight-leg-raise', 'straight_leg_raise', 'knee-extension', 'knee_extension'],
  },
  {
    id: 'knees',
    label: 'Knees',
    exerciseIds: ['knee-extension', 'knee_extension', 'straight-leg-raise', 'straight_leg_raise'],
  },
  {
    id: 'ankles',
    label: 'Ankles & Feet',
    exerciseIds: ['ankle-plantar-flexion', 'ankle_plantar_flexion'],
  },
];

export const ExerciseLibraryModal: React.FC<ExerciseLibraryModalProps> = ({
  isOpen,
  onClose,
  selectedExerciseId,
  selectedSide = 'right',
  onSelectExercise,
  onStartPractice,
}) => {
  const allExercises = useMemo(() => getAllExercises(), []);

  // Active state in 3D Body Map
  const [activePreviewId, setActivePreviewId] = useState<string>(selectedExerciseId);
  const [activePreviewSide, setActivePreviewSide] = useState<'left' | 'right' | 'bilateral'>(selectedSide);
  const [activeRegion, setActiveRegion] = useState<BodyRegionId | 'ALL'>('ALL');
  const [searchQuery, setSearchQuery] = useState('');

  // Sync state on modal open
  useEffect(() => {
    if (isOpen) {
      setActivePreviewId(selectedExerciseId);
      const ex = getExercise(selectedExerciseId);
      if (ex.laterality === 'bilateral') {
        setActivePreviewSide('bilateral');
      } else {
        setActivePreviewSide(selectedSide === 'left' ? 'left' : 'right');
      }

      // Auto-detect region of current exercise
      const regionMatch = BODY_REGIONS.find(
        (r) => r.id !== 'ALL' && r.exerciseIds.some((id) => id.replace(/_/g, '-') === selectedExerciseId.replace(/_/g, '-'))
      );
      if (regionMatch) {
        setActiveRegion(regionMatch.id);
      }
    }
  }, [isOpen, selectedExerciseId, selectedSide]);

  // Filter exercises by region and search query
  const filteredExercises = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    const regionObj = BODY_REGIONS.find((r) => r.id === activeRegion) || BODY_REGIONS[0];

    return allExercises.filter((ex) => {
      const normId = ex.id.replace(/_/g, '-');
      if (activeRegion !== 'ALL' && !regionObj.exerciseIds.some((id) => id.replace(/_/g, '-') === normId)) {
        return false;
      }
      if (!q) return true;
      return (
        ex.name.toLowerCase().includes(q) ||
        ex.category.toLowerCase().includes(q) ||
        ex.bodyRegion.toLowerCase().includes(q) ||
        ex.metricName.toLowerCase().includes(q) ||
        ex.description.toLowerCase().includes(q)
      );
    });
  }, [allExercises, searchQuery, activeRegion]);

  const activeExercise = useMemo(() => {
    return getExercise(activePreviewId);
  }, [activePreviewId]);

  const activeMotion = useMemo(() => {
    return getExerciseMotion(activePreviewId);
  }, [activePreviewId]);

  // Direct 3D Raycast click on a body region
  const handleSelectBodyRegion = (region: BodyRegionId) => {
    setActiveRegion(region);

    // Auto-select the first exercise belonging to this region if current exercise doesn't belong to it
    const regionObj = BODY_REGIONS.find((r) => r.id === region);
    if (regionObj) {
      const currentNorm = activePreviewId.replace(/_/g, '-');
      const isAlreadyInRegion = regionObj.exerciseIds.some((id) => id.replace(/_/g, '-') === currentNorm);
      if (!isAlreadyInRegion && regionObj.exerciseIds.length > 0) {
        const firstMatchId = regionObj.exerciseIds[0];
        const ex = allExercises.find((e) => e.id.replace(/_/g, '-') === firstMatchId.replace(/_/g, '-'));
        if (ex) {
          setActivePreviewId(ex.id);
          if (ex.laterality === 'bilateral') {
            setActivePreviewSide('bilateral');
          }
        }
      }
    }
  };

  const handleSelectProtocol = (ex: ExerciseDefinition) => {
    setActivePreviewId(ex.id);
    if (ex.laterality === 'bilateral') {
      setActivePreviewSide('bilateral');
    } else if (activePreviewSide === 'bilateral') {
      setActivePreviewSide('right');
    }
  };

  const handleApplySelection = () => {
    onSelectExercise(activePreviewId, activePreviewSide);
    onClose();
  };

  const handleStartPracticeDirect = () => {
    onSelectExercise(activePreviewId, activePreviewSide);
    onClose();
    if (onStartPractice) {
      onStartPractice(activePreviewId, activePreviewSide);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="modal-overlay" role="dialog" aria-modal="true" aria-labelledby="bodymap-title">
      <div className="modal-container bodymap-explorer-modal">
        {/* ── Header Bar ────────────────────────────────────────────────── */}
        <div className="explorer-header">
          <div className="explorer-header__title-group">
            <div className="explorer-header__icon">
              <User size={18} className="text-cyan" />
            </div>
            <div>
              <h2 id="bodymap-title" className="explorer-header__title">
                3D Interactive Body Map · Protocol Browser
              </h2>
              <span className="explorer-header__subtitle">
                Click any anatomical region on the 3D human skeleton to explore tailored rehabilitation protocols
              </span>
            </div>
          </div>

          <button
            type="button"
            className="btn btn--icon explorer-header__close-btn"
            onClick={onClose}
            title="Close Protocol Explorer"
          >
            <X size={18} />
          </button>
        </div>

        {/* ── Main Interactive Stage ────────────────────────────────────── */}
        <div className="bodymap-main-area">
          {/* 3D Human Skeleton Viewport */}
          <div className="bodymap-3d-viewport">
            {/* Quick-Jump Region Pills Overlay */}
            <div className="bodymap-hotspots-bar" role="group" aria-label="Body Regions">
              {BODY_REGIONS.map((region) => {
                const count =
                  region.id === 'ALL'
                    ? allExercises.length
                    : allExercises.filter((e) =>
                        region.exerciseIds.some((id) => id.replace(/_/g, '-') === e.id.replace(/_/g, '-'))
                      ).length;

                return (
                  <button
                    key={region.id}
                    type="button"
                    className={`bodymap-hotspot-pill ${activeRegion === region.id ? 'bodymap-hotspot-pill--active' : ''}`}
                    onClick={() => setActiveRegion(region.id)}
                    title={`Filter by ${region.label}`}
                  >
                    <span>{region.label}</span>
                    <span className="bodymap-hotspot-badge">{count}</span>
                  </button>
                );
              })}
            </div>

            {/* Central 3D Three.js Skeletal Canvas with Raycast Click/Hover */}
            <Physiosis3DViewer
              exerciseId={activeExercise.id}
              exerciseName={activeExercise.name}
              mode="TUTORIAL"
              initialSide={activePreviewSide}
              targetAngle={activeExercise.targetAngle || activeMotion.targetMetricValue}
              showCameraPip={false}
              showControls={true}
              enableBodyMapInteraction={true}
              onSelectBodyRegion={handleSelectBodyRegion}
              className="explorer-3d-canvas"
            />
          </div>

          {/* Right Protocol Selector Drawer */}
          <div className="bodymap-drawer">
            <div className="bodymap-drawer__header">
              <div className="bodymap-drawer__title-row">
                <Layers size={15} className="text-cyan" />
                <span className="bodymap-drawer__title">
                  {BODY_REGIONS.find((r) => r.id === activeRegion)?.label || 'Protocols'}
                </span>
              </div>
              <span className="bodymap-drawer__count">{filteredExercises.length} Protocols</span>
            </div>

            {/* Quick Search Input */}
            <div style={{ padding: '8px 10px', borderBottom: '1px solid var(--border-subtle)' }}>
              <div className="search-input-wrap">
                <Search size={13} className="search-icon" />
                <input
                  type="text"
                  placeholder="Filter protocols…"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="search-input"
                  style={{ fontSize: '11px', padding: '5px 8px 5px 28px' }}
                />
              </div>
            </div>

            {/* Protocol Items List */}
            <div className="bodymap-drawer__protocols">
              {filteredExercises.map((ex) => {
                const isSelected = ex.id.replace(/_/g, '-') === activePreviewId.replace(/_/g, '-');
                const exMotion = getExerciseMotion(ex.id);

                return (
                  <div
                    key={ex.id}
                    className={`bodymap-protocol-card ${isSelected ? 'bodymap-protocol-card--active' : ''}`}
                    onClick={() => handleSelectProtocol(ex)}
                    role="button"
                    tabIndex={0}
                  >
                    <div className="bodymap-protocol-card__title">
                      <span>{ex.name}</span>
                      {isSelected ? (
                        <CheckCircle2 size={13} className="text-cyan" />
                      ) : (
                        <ChevronRight size={13} className="text-muted" />
                      )}
                    </div>

                    <div className="bodymap-protocol-card__meta">
                      <span className="bodymap-protocol-card__target">
                        {ex.targetAngle > 0 ? `${ex.targetAngle}°` : ex.targetMetric}
                      </span>
                      <span>•</span>
                      <span className="capitalize">{exMotion.plane} Plane</span>
                      <span>•</span>
                      <span className="uppercase text-cyan" style={{ fontSize: '9.5px', fontWeight: 600 }}>
                        {exMotion.analysisType.replace('_', ' ')}
                      </span>
                    </div>
                  </div>
                );
              })}

              {filteredExercises.length === 0 && (
                <div style={{ padding: '24px 12px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '11.5px' }}>
                  No protocols match the selected body region.
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ── Bottom Telemetry & Action Bar ─────────────────────────────── */}
        <div className="bodymap-bottom-bar">
          <div className="bodymap-bottom-grid">
            <div className="bodymap-bottom-item">
              <span className="bodymap-bottom-label">SELECTED PROTOCOL</span>
              <span className="bodymap-bottom-val">{activeExercise.name}</span>
            </div>

            <div className="bodymap-bottom-item">
              <span className="bodymap-bottom-label">TARGET METRIC</span>
              <span className="bodymap-bottom-val text-cyan mono">
                {activeExercise.targetAngle > 0 ? `${activeExercise.targetAngle}°` : activeExercise.targetMetric}
              </span>
            </div>

            <div className="bodymap-bottom-item">
              <span className="bodymap-bottom-label">PLANE & MODALITY</span>
              <span className="bodymap-bottom-val capitalize">
                {activeMotion.plane} ({activeMotion.analysisType.replace('_', ' ')})
              </span>
            </div>

            <div className="bodymap-bottom-item">
              <span className="bodymap-bottom-label">PHYSIO-DATASET</span>
              <span className="bodymap-bottom-val text-good flex items-center gap-1">
                <Database size={11} style={{ display: 'inline' }} />
                {activeExercise.isDatasetBacked ? 'Available' : 'Standard Protocol'}
              </span>
            </div>

            {/* Unilateral Side Selector */}
            {activeExercise.laterality !== 'bilateral' && (
              <div className="bodymap-bottom-item">
                <span className="bodymap-bottom-label">LIMB SIDE</span>
                <div className="bodymap-side-toggle">
                  <button
                    type="button"
                    className={`bodymap-side-btn ${activePreviewSide === 'left' ? 'bodymap-side-btn--active' : ''}`}
                    onClick={() => setActivePreviewSide('left')}
                  >
                    Left
                  </button>
                  <button
                    type="button"
                    className={`bodymap-side-btn ${activePreviewSide === 'right' ? 'bodymap-side-btn--active' : ''}`}
                    onClick={() => setActivePreviewSide('right')}
                  >
                    Right
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Action Buttons */}
          <div className="explorer-actions">
            <button
              type="button"
              className="btn btn--secondary"
              onClick={handleApplySelection}
              title="Select Protocol & Return to Dashboard"
            >
              <CheckCircle2 size={14} />
              <span>Select Protocol</span>
            </button>

            <button
              type="button"
              className="btn btn--primary explorer-start-btn"
              onClick={handleStartPracticeDirect}
              title="Select Protocol & Start Optical Camera Practice"
            >
              <Play size={14} fill="currentColor" />
              <span>Start Practice</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
