-- ============================================================================
-- PHYSIOSIS SUPABASE MIGRATION: EXPAND REHABILITATION EXERCISE CATALOG
-- ============================================================================
-- Migration: 20260902_expand_exercise_catalog.sql
-- Description:
--   1. Extends public.exercises table with dataset metadata columns:
--      - dataset_source (e.g. 'PHYSIO-DATASET' vs 'PHYSIOSIS_PROTOTYPE')
--      - dataset_exercise_code (e.g. 'Shoulder_Flexion')
--      - laterality_type ('BILATERAL' vs 'LEFT_RIGHT')
--      - body_region (e.g. 'Shoulder / Upper Limb', 'Spine / Neck', 'Wrist', 'Ankle', 'Knee / Lower Limb')
--      - reference_available (BOOLEAN)
--   2. Idempotently seeds all 9 PHYSIO-DATASET benchmark exercises.
--   3. Idempotently seeds the 2 Physiosis active calibrated prototype exercises.
--   4. Guarantees zero duplicate exercise_code entries using ON CONFLICT DO UPDATE.
-- ============================================================================

-- ─── 1. SAFE SCHEMA EXPANSION ON PUBLIC.EXERCISES ────────────────────────────

DO $$
BEGIN
  -- 1.1 Add dataset_source column if missing
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'exercises' AND column_name = 'dataset_source'
  ) THEN
    ALTER TABLE public.exercises ADD COLUMN dataset_source TEXT NOT NULL DEFAULT 'PHYSIO-DATASET';
  END IF;

  -- 1.2 Add dataset_exercise_code column if missing
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'exercises' AND column_name = 'dataset_exercise_code'
  ) THEN
    ALTER TABLE public.exercises ADD COLUMN dataset_exercise_code TEXT;
  END IF;

  -- 1.3 Add laterality_type column if missing
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'exercises' AND column_name = 'laterality_type'
  ) THEN
    ALTER TABLE public.exercises ADD COLUMN laterality_type TEXT NOT NULL DEFAULT 'LEFT_RIGHT'
      CHECK (laterality_type IN ('BILATERAL', 'LEFT_RIGHT'));
  END IF;

  -- 1.4 Add body_region column if missing
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'exercises' AND column_name = 'body_region'
  ) THEN
    ALTER TABLE public.exercises ADD COLUMN body_region TEXT;
  END IF;

  -- 1.5 Add reference_available column if missing
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'exercises' AND column_name = 'reference_available'
  ) THEN
    ALTER TABLE public.exercises ADD COLUMN reference_available BOOLEAN NOT NULL DEFAULT TRUE;
  END IF;
END $$;

-- ─── 2. SEED ALL 9 PHYSIO-DATASET BENCHMARK EXERCISES ────────────────────────

-- 2.1 Ankle Plantar Flexion (Bilateral)
INSERT INTO public.exercises (
  exercise_code,
  name,
  description,
  target_angle,
  category,
  plane,
  difficulty,
  dataset_source,
  dataset_exercise_code,
  laterality_type,
  body_region,
  reference_available
) VALUES (
  'ANKLE_PLANTAR_FLEXION',
  'Ankle Plantar Flexion',
  'Bilateral ankle plantarflexion (heel raises) assessing gastrocnemius-soleus strength, bilateral symmetry, and ankle mobility.',
  45.0,
  'Lower Extremity',
  'Sagittal Plane',
  'beginner',
  'PHYSIO-DATASET',
  'Ankle_Plantar_Flexion',
  'BILATERAL',
  'Ankle',
  TRUE
)
ON CONFLICT (exercise_code) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  target_angle = EXCLUDED.target_angle,
  category = EXCLUDED.category,
  plane = EXCLUDED.plane,
  difficulty = EXCLUDED.difficulty,
  dataset_source = EXCLUDED.dataset_source,
  dataset_exercise_code = EXCLUDED.dataset_exercise_code,
  laterality_type = EXCLUDED.laterality_type,
  body_region = EXCLUDED.body_region,
  reference_available = EXCLUDED.reference_available;

-- 2.2 Arm Circumduction (Left / Right)
INSERT INTO public.exercises (
  exercise_code,
  name,
  description,
  target_angle,
  category,
  plane,
  difficulty,
  dataset_source,
  dataset_exercise_code,
  laterality_type,
  body_region,
  reference_available
) VALUES (
  'ARM_CIRCUMDUCTION',
  'Arm Circumduction',
  'Multi-planar circular motion of the upper limb about the glenohumeral joint to assess rotational mobility and coordination.',
  360.0,
  'Upper Extremity',
  'Multi-Planar',
  'intermediate',
  'PHYSIO-DATASET',
  'Arm_Circumduction',
  'LEFT_RIGHT',
  'Shoulder / Upper Limb',
  TRUE
)
ON CONFLICT (exercise_code) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  target_angle = EXCLUDED.target_angle,
  category = EXCLUDED.category,
  plane = EXCLUDED.plane,
  difficulty = EXCLUDED.difficulty,
  dataset_source = EXCLUDED.dataset_source,
  dataset_exercise_code = EXCLUDED.dataset_exercise_code,
  laterality_type = EXCLUDED.laterality_type,
  body_region = EXCLUDED.body_region,
  reference_available = EXCLUDED.reference_available;

-- 2.3 Ball Press (Left / Right)
INSERT INTO public.exercises (
  exercise_code,
  name,
  description,
  target_angle,
  category,
  plane,
  difficulty,
  dataset_source,
  dataset_exercise_code,
  laterality_type,
  body_region,
  reference_available
) VALUES (
  'BALL_PRESS',
  'Ball Press',
  'Sustained isometric compression against a physical therapy ball assessing distal neuromuscular force and joint stability.',
  0.0,
  'Distal Upper Extremity',
  'Transverse Plane',
  'beginner',
  'PHYSIO-DATASET',
  'Ball_Press',
  'LEFT_RIGHT',
  'Shoulder / Upper Limb',
  TRUE
)
ON CONFLICT (exercise_code) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  target_angle = EXCLUDED.target_angle,
  category = EXCLUDED.category,
  plane = EXCLUDED.plane,
  difficulty = EXCLUDED.difficulty,
  dataset_source = EXCLUDED.dataset_source,
  dataset_exercise_code = EXCLUDED.dataset_exercise_code,
  laterality_type = EXCLUDED.laterality_type,
  body_region = EXCLUDED.body_region,
  reference_available = EXCLUDED.reference_available;

-- 2.4 Cross-Body Shoulder Stretch (Left / Right)
INSERT INTO public.exercises (
  exercise_code,
  name,
  description,
  target_angle,
  category,
  plane,
  difficulty,
  dataset_source,
  dataset_exercise_code,
  laterality_type,
  body_region,
  reference_available
) VALUES (
  'CROSS_BODY_SHOULDER_STRETCH',
  'Cross-Body Shoulder Stretch',
  'Horizontal adduction stretch of the arm across the thorax to elongate the posterior shoulder capsule and rotator cuff.',
  90.0,
  'Shoulder Rehabilitation',
  'Transverse Plane',
  'beginner',
  'PHYSIO-DATASET',
  'Cross_Body_Shoulder_Stretch',
  'LEFT_RIGHT',
  'Shoulder / Upper Limb',
  TRUE
)
ON CONFLICT (exercise_code) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  target_angle = EXCLUDED.target_angle,
  category = EXCLUDED.category,
  plane = EXCLUDED.plane,
  difficulty = EXCLUDED.difficulty,
  dataset_source = EXCLUDED.dataset_source,
  dataset_exercise_code = EXCLUDED.dataset_exercise_code,
  laterality_type = EXCLUDED.laterality_type,
  body_region = EXCLUDED.body_region,
  reference_available = EXCLUDED.reference_available;

-- 2.5 Isometric Rotation (Left / Right)
INSERT INTO public.exercises (
  exercise_code,
  name,
  description,
  target_angle,
  category,
  plane,
  difficulty,
  dataset_source,
  dataset_exercise_code,
  laterality_type,
  body_region,
  reference_available
) VALUES (
  'ISOMETRIC_ROTATION',
  'Isometric Rotation',
  'Static isometric rotational hold of the upper limb / torso to condition rotator cuff stabilizers and resist torque.',
  0.0,
  'Shoulder & Core Stability',
  'Transverse Plane',
  'intermediate',
  'PHYSIO-DATASET',
  'Isometric_Rotation',
  'LEFT_RIGHT',
  'Shoulder / Upper Limb',
  TRUE
)
ON CONFLICT (exercise_code) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  target_angle = EXCLUDED.target_angle,
  category = EXCLUDED.category,
  plane = EXCLUDED.plane,
  difficulty = EXCLUDED.difficulty,
  dataset_source = EXCLUDED.dataset_source,
  dataset_exercise_code = EXCLUDED.dataset_exercise_code,
  laterality_type = EXCLUDED.laterality_type,
  body_region = EXCLUDED.body_region,
  reference_available = EXCLUDED.reference_available;

-- 2.6 Isometric Side Bending (Left / Right)
INSERT INTO public.exercises (
  exercise_code,
  name,
  description,
  target_angle,
  category,
  plane,
  difficulty,
  dataset_source,
  dataset_exercise_code,
  laterality_type,
  body_region,
  reference_available
) VALUES (
  'ISOMETRIC_SIDE_BENDING',
  'Isometric Side Bending',
  'Static lateral trunk flexion hold assessing lateral spinal stabilizer compliance and abdominal oblique isometric endurance.',
  30.0,
  'Spinal / Trunk Stability',
  'Frontal Plane',
  'intermediate',
  'PHYSIO-DATASET',
  'Isometric_Side_Bending',
  'LEFT_RIGHT',
  'Spine / Neck',
  TRUE
)
ON CONFLICT (exercise_code) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  target_angle = EXCLUDED.target_angle,
  category = EXCLUDED.category,
  plane = EXCLUDED.plane,
  difficulty = EXCLUDED.difficulty,
  dataset_source = EXCLUDED.dataset_source,
  dataset_exercise_code = EXCLUDED.dataset_exercise_code,
  laterality_type = EXCLUDED.laterality_type,
  body_region = EXCLUDED.body_region,
  reference_available = EXCLUDED.reference_available;

-- 2.7 Shoulder Abduction (Left / Right)
INSERT INTO public.exercises (
  exercise_code,
  name,
  description,
  target_angle,
  category,
  plane,
  difficulty,
  dataset_source,
  dataset_exercise_code,
  laterality_type,
  body_region,
  reference_available
) VALUES (
  'SHOULDER_ABDUCTION',
  'Shoulder Abduction',
  'Coronal plane elevation of the arm away from the anatomical midline to evaluate middle deltoid and supraspinatus range.',
  160.0,
  'Upper Extremity',
  'Frontal Plane',
  'beginner',
  'PHYSIO-DATASET',
  'Shoulder_Abduction',
  'LEFT_RIGHT',
  'Shoulder / Upper Limb',
  TRUE
)
ON CONFLICT (exercise_code) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  target_angle = EXCLUDED.target_angle,
  category = EXCLUDED.category,
  plane = EXCLUDED.plane,
  difficulty = EXCLUDED.difficulty,
  dataset_source = EXCLUDED.dataset_source,
  dataset_exercise_code = EXCLUDED.dataset_exercise_code,
  laterality_type = EXCLUDED.laterality_type,
  body_region = EXCLUDED.body_region,
  reference_available = EXCLUDED.reference_available;

-- 2.8 Shoulder Flexion (Left / Right) — Preserves existing row if present
INSERT INTO public.exercises (
  exercise_code,
  name,
  description,
  target_angle,
  category,
  plane,
  difficulty,
  dataset_source,
  dataset_exercise_code,
  laterality_type,
  body_region,
  reference_available
) VALUES (
  'SHOULDER_FLEXION',
  'Shoulder Flexion',
  'Controlled forward elevation of the arm through the sagittal plane to assess shoulder range of motion.',
  165.0,
  'Upper Body',
  'Sagittal Plane',
  'beginner',
  'PHYSIO-DATASET',
  'Shoulder_Flexion',
  'LEFT_RIGHT',
  'Shoulder / Upper Limb',
  TRUE
)
ON CONFLICT (exercise_code) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  target_angle = EXCLUDED.target_angle,
  category = EXCLUDED.category,
  plane = EXCLUDED.plane,
  difficulty = EXCLUDED.difficulty,
  dataset_source = EXCLUDED.dataset_source,
  dataset_exercise_code = EXCLUDED.dataset_exercise_code,
  laterality_type = EXCLUDED.laterality_type,
  body_region = EXCLUDED.body_region,
  reference_available = EXCLUDED.reference_available;

-- 2.9 Wrist Extension Stretch (Left / Right)
INSERT INTO public.exercises (
  exercise_code,
  name,
  description,
  target_angle,
  category,
  plane,
  difficulty,
  dataset_source,
  dataset_exercise_code,
  laterality_type,
  body_region,
  reference_available
) VALUES (
  'WRIST_EXTENSION_STRETCH',
  'Wrist Extension Stretch',
  'Assisted or active wrist extension stretch targeting the forearm flexor musculature and anterior wrist compliance.',
  70.0,
  'Distal Upper Extremity',
  'Sagittal Plane',
  'beginner',
  'PHYSIO-DATASET',
  'Wrist_Extension_Stretch',
  'LEFT_RIGHT',
  'Wrist',
  TRUE
)
ON CONFLICT (exercise_code) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  target_angle = EXCLUDED.target_angle,
  category = EXCLUDED.category,
  plane = EXCLUDED.plane,
  difficulty = EXCLUDED.difficulty,
  dataset_source = EXCLUDED.dataset_source,
  dataset_exercise_code = EXCLUDED.dataset_exercise_code,
  laterality_type = EXCLUDED.laterality_type,
  body_region = EXCLUDED.body_region,
  reference_available = EXCLUDED.reference_available;

-- ─── 3. SEED PHYSIOSIS ACTIVE PROTOTYPE EXERCISES ────────────────────────────

-- 3.1 Seated Knee Extension (Prototype)
INSERT INTO public.exercises (
  exercise_code,
  name,
  description,
  target_angle,
  category,
  plane,
  difficulty,
  dataset_source,
  dataset_exercise_code,
  laterality_type,
  body_region,
  reference_available
) VALUES (
  'KNEE_EXTENSION',
  'Seated Knee Extension',
  'Seated extension of the knee joint to assess quadriceps mobility and joint extension range.',
  170.0,
  'Lower Body',
  'Sagittal Plane',
  'beginner',
  'PHYSIOSIS_PROTOTYPE',
  NULL,
  'LEFT_RIGHT',
  'Knee / Lower Limb',
  FALSE
)
ON CONFLICT (exercise_code) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  target_angle = EXCLUDED.target_angle,
  category = EXCLUDED.category,
  plane = EXCLUDED.plane,
  difficulty = EXCLUDED.difficulty,
  dataset_source = EXCLUDED.dataset_source,
  dataset_exercise_code = EXCLUDED.dataset_exercise_code,
  laterality_type = EXCLUDED.laterality_type,
  body_region = EXCLUDED.body_region,
  reference_available = EXCLUDED.reference_available;

-- 3.2 Straight-Leg Raise (Prototype)
INSERT INTO public.exercises (
  exercise_code,
  name,
  description,
  target_angle,
  category,
  plane,
  difficulty,
  dataset_source,
  dataset_exercise_code,
  laterality_type,
  body_region,
  reference_available
) VALUES (
  'STRAIGHT_LEG_RAISE',
  'Straight-Leg Raise',
  'Supine elevation of the extended leg to assess hip flexor control and active hamstring range of motion.',
  45.0,
  'Lower Body',
  'Sagittal Plane',
  'intermediate',
  'PHYSIOSIS_PROTOTYPE',
  NULL,
  'LEFT_RIGHT',
  'Knee / Lower Limb',
  FALSE
)
ON CONFLICT (exercise_code) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  target_angle = EXCLUDED.target_angle,
  category = EXCLUDED.category,
  plane = EXCLUDED.plane,
  difficulty = EXCLUDED.difficulty,
  dataset_source = EXCLUDED.dataset_source,
  dataset_exercise_code = EXCLUDED.dataset_exercise_code,
  laterality_type = EXCLUDED.laterality_type,
  body_region = EXCLUDED.body_region,
  reference_available = EXCLUDED.reference_available;
