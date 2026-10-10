/**
 * ExerciseSelector.tsx
 * Scalable, search-enabled rehabilitation exercise selector component.
 *
 * Supports real-time query filtering, body-region grouping, and laterality controls.
 */

import React, { useState, useMemo } from 'react';
import { Search, X, Sliders, Database, Sparkles } from 'lucide-react';
import type { ExerciseDefinition, BodyRegion } from '../../engine/exercise/ExerciseTypes';
import { getAllExercises } from '../../engine/exercise/ExerciseRegistry';

interface ExerciseSelectorProps {
  selectedExerciseId: string;
  selectedSide?: 'left' | 'right' | 'bilateral';
  onSelectExercise: (exerciseId: string, side?: 'left' | 'right' | 'bilateral') => void;
  disabled?: boolean;
}

const REGION_TABS = [
  'ALL',
  'Shoulder / Upper Limb',
  'Spine / Neck',
  'Wrist',
  'Ankle',
  'Knee / Lower Limb',
];

export const ExerciseSelector: React.FC<ExerciseSelectorProps> = ({
  selectedExerciseId,
  selectedSide = 'right',
  onSelectExercise,
  disabled = false,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState('ALL');

  const exercises: ExerciseDefinition[] = useMemo(() => getAllExercises(), []);

  const filteredExercises = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    return exercises.filter((ex) => {
      if (activeTab !== 'ALL' && ex.bodyRegion !== activeTab) return false;
      if (!q) return true;
      return (
        ex.name.toLowerCase().includes(q) ||
        ex.bodyRegion.toLowerCase().includes(q) ||
        ex.category.toLowerCase().includes(q) ||
        ex.metricName.toLowerCase().includes(q) ||
        ex.description.toLowerCase().includes(q)
      );
    });
  }, [exercises, searchQuery, activeTab]);

  // Group by body region
  const grouped = useMemo(() => {
    const map = new Map<BodyRegion, ExerciseDefinition[]>();
    for (const ex of filteredExercises) {
      const region = ex.bodyRegion || 'Shoulder / Upper Limb';
      if (!map.has(region)) map.set(region, []);
      map.get(region)!.push(ex);
    }
    return map;
  }, [filteredExercises]);

  return (
    <div className="exercise-selector-container">
      {/* ── Search & Filter Tabs ────────────────────────────────────────── */}
      <div className="exercise-selector__filter-bar">
        <div className="exercise-selector__search-box">
          <Search size={14} className="text-muted" />
          <input
            type="text"
            className="exercise-selector__search-input"
            placeholder="Search exercises..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            disabled={disabled}
          />
          {searchQuery && (
            <button
              type="button"
              className="btn-icon btn-icon--xs"
              onClick={() => setSearchQuery('')}
            >
              <X size={12} />
            </button>
          )}
        </div>

        <div className="exercise-selector__tabs" role="tablist">
          {REGION_TABS.map((tab) => (
            <button
              key={tab}
              type="button"
              role="tab"
              aria-selected={activeTab === tab}
              disabled={disabled}
              className={`filter-pill ${activeTab === tab ? 'filter-pill--active' : ''}`}
              onClick={() => setActiveTab(tab)}
            >
              {tab === 'ALL' ? 'All' : tab}
            </button>
          ))}
        </div>
      </div>

      {/* ── Exercise Grid Grouped by Region ─────────────────────────────── */}
      <div className="exercise-selector__groups">
        {filteredExercises.length === 0 ? (
          <div className="exercise-selector__empty">
            <Sliders size={24} className="text-muted" />
            <p>No matching exercises found</p>
          </div>
        ) : (
          Array.from(grouped.entries()).map(([region, groupItems]) => (
            <div key={region} className="exercise-selector__group-block">
              <span className="exercise-selector__group-header">{region}</span>
              <div className="exercise-selector__grid">
                {groupItems.map((ex) => {
                  const isSelected =
                    ex.id === selectedExerciseId ||
                    ex.id.replace(/_/g, '-') === selectedExerciseId.replace(/_/g, '-');

                  return (
                    <div
                      key={ex.id}
                      role="button"
                      tabIndex={0}
                      className={`exercise-selector__card ${
                        isSelected ? 'exercise-selector__card--active' : ''
                      } ${disabled ? 'disabled' : ''}`}
                      onClick={() => !disabled && onSelectExercise(ex.id, selectedSide)}
                      onKeyDown={(e) => {
                        if ((e.key === 'Enter' || e.key === ' ') && !disabled) {
                          onSelectExercise(ex.id, selectedSide);
                        }
                      }}
                    >
                      <div className="exercise-selector__card-top">
                        <span
                          className={`exercise-badge ${
                            ex.isDatasetBacked
                              ? 'exercise-badge--dataset'
                              : 'exercise-badge--prototype'
                          }`}
                        >
                          {ex.isDatasetBacked ? <Database size={9} /> : <Sparkles size={9} />}
                          <span>{ex.isDatasetBacked ? 'DATASET' : 'PROTOTYPE'}</span>
                        </span>
                        <span
                          className={`analysis-tier-badge ${
                            ex.liveAnalysisAvailable
                              ? 'analysis-tier-badge--live'
                              : 'analysis-tier-badge--demo'
                          }`}
                        >
                          {ex.liveAnalysisAvailable ? 'LIVE' : 'DEMO ONLY'}
                        </span>
                        {ex.laterality === 'bilateral' ? (
                          <span className="exercise-selector__side-tag">Bilateral</span>
                        ) : (
                          <div className="laterality-toggle-group" onClick={(e) => e.stopPropagation()}>
                            <button
                              type="button"
                              className={`laterality-btn ${isSelected && selectedSide === 'left' ? 'laterality-btn--active' : ''}`}
                              onClick={(e) => {
                                e.stopPropagation();
                                onSelectExercise(ex.id, 'left');
                              }}
                              title="Select Left Side"
                            >
                              L
                            </button>
                            <button
                              type="button"
                              className={`laterality-btn ${isSelected && selectedSide === 'right' ? 'laterality-btn--active' : ''}`}
                              onClick={(e) => {
                                e.stopPropagation();
                                onSelectExercise(ex.id, 'right');
                              }}
                              title="Select Right Side"
                            >
                              R
                            </button>
                          </div>
                        )}
                      </div>

                      <span className="exercise-selector__card-name">{ex.name}</span>
                      <p className="exercise-selector__card-desc">{ex.description}</p>

                      <div className="exercise-selector__card-footer">
                        <span className="exercise-selector__card-metric mono">
                          {ex.targetAngle > 0 ? `${ex.targetAngle}° Target` : ex.targetMetric}
                        </span>
                        <span className="exercise-selector__card-plane">{ex.plane}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};
