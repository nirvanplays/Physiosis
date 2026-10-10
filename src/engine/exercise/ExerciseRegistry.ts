/**
 * ExerciseRegistry.ts
 * Central registry of all supported rehabilitation exercises in Physiosis.
 *
 * Provides a unified registry encompassing:
 * 1. Reference PHYSIO-DATASET Benchmark Exercises (9 categories)
 * 2. Physiosis Prototype Active Kinematic Exercises
 *
 * Each exercise provides its biomechanical classification, laterality,
 * pose landmark definitions, reference datasets status, and kinematics calculators.
 */

import type { ExerciseDefinition } from './ExerciseTypes';
import {
  PHYSIO_DATASET_CONFIG,
  DATASET_EXERCISE_CATEGORIES,
  type PhysioDatasetConfig,
  type DatasetCategoryMeta,
} from '../../data/physioDataset';

// ── Verified High-Confidence Exercises ──────────────────────────────────────
import { shoulderFlexionExercise } from './exercises/shoulderFlexion';
import { shoulderAbductionExercise } from './exercises/shoulderAbduction';
import { isometricSideBendingExercise } from './exercises/isometricSideBending';
import { crossBodyShoulderStretchExercise } from './exercises/crossBodyShoulderStretch';
import { isometricRotationExercise } from './exercises/isometricRotation';
import { kneeExtensionExercise } from './exercises/kneeExtension';
import { straightLegRaiseExercise } from './exercises/straightLegRaise';

// ── Medium/Low Confidence Exercises (Reference Demo Only) ───────────────────
import {
  anklePlantarFlexionExercise,
  armCircumductionExercise,
  ballPressExercise,
  wristExtensionStretchExercise,
} from './exercises/datasetExercises';

export { PHYSIO_DATASET_CONFIG, DATASET_EXERCISE_CATEGORIES };
export type { PhysioDatasetConfig, DatasetCategoryMeta };

/** Complete list of registered exercises (Dataset-Backed + Prototypes). */
const EXERCISE_LIST: ExerciseDefinition[] = [
  // ── 9 PHYSIO-DATASET Benchmark Exercises ───────────────────────────────────
  shoulderFlexionExercise,
  shoulderAbductionExercise,
  crossBodyShoulderStretchExercise,
  isometricRotationExercise,
  isometricSideBendingExercise,
  anklePlantarFlexionExercise,
  armCircumductionExercise,
  ballPressExercise,
  wristExtensionStretchExercise,

  // ── Physiosis Prototype Kinematic Exercises ────────────────────────────────
  kneeExtensionExercise,
  straightLegRaiseExercise,
];

/**
 * Fast lookup map supporting both standard snake_case and legacy kebab-case IDs.
 */
const EXERCISE_MAP = new Map<string, ExerciseDefinition>();

// Register standard IDs
for (const ex of EXERCISE_LIST) {
  EXERCISE_MAP.set(ex.id, ex);
  // Also register kebab-case alias if id contains underscore
  if (ex.id.includes('_')) {
    EXERCISE_MAP.set(ex.id.replace(/_/g, '-'), ex);
  }
}

// Ensure explicit legacy aliases
EXERCISE_MAP.set('shoulder-flexion', shoulderFlexionExercise);
EXERCISE_MAP.set('shoulder-abduction', shoulderAbductionExercise);
EXERCISE_MAP.set('knee-extension', kneeExtensionExercise);
EXERCISE_MAP.set('straight-leg-raise', straightLegRaiseExercise);

/** Return all registered exercises. */
export function getAllExercises(): ExerciseDefinition[] {
  return EXERCISE_LIST;
}

/** Return only exercises verified in the PHYSIO-DATASET benchmark. */
export function getDatasetBackedExercises(): ExerciseDefinition[] {
  return EXERCISE_LIST.filter((ex) => ex.isDatasetBacked);
}

/** Return prototype exercises developed specifically for Physiosis. */
export function getPrototypeExercises(): ExerciseDefinition[] {
  return EXERCISE_LIST.filter((ex) => !ex.isDatasetBacked);
}

/**
 * Lookup an exercise definition by its ID or alias.
 * Falls back safely to shoulderFlexionExercise if not found.
 */
export function getExercise(id: string): ExerciseDefinition {
  const normalized = id.toLowerCase().trim();
  return EXERCISE_MAP.get(normalized) ?? shoulderFlexionExercise;
}

/** Return default starting exercise. */
export function getDefaultExercise(): ExerciseDefinition {
  return shoulderFlexionExercise;
}

/**
 * Object-oriented registry interface for backwards compatibility.
 */
export class ExerciseRegistry {
  static getAll(): ExerciseDefinition[] {
    return EXERCISE_LIST;
  }

  static getDatasetBacked(): ExerciseDefinition[] {
    return getDatasetBackedExercises();
  }

  static getPrototypes(): ExerciseDefinition[] {
    return getPrototypeExercises();
  }

  static getById(id: string): ExerciseDefinition | undefined {
    const normalized = id.toLowerCase().trim();
    return EXERCISE_MAP.get(normalized);
  }

  static getDefault(): ExerciseDefinition {
    return shoulderFlexionExercise;
  }

  static getDatasetConfig(): PhysioDatasetConfig {
    return PHYSIO_DATASET_CONFIG;
  }

  static getDatasetCategories(): DatasetCategoryMeta[] {
    return DATASET_EXERCISE_CATEGORIES;
  }
}
