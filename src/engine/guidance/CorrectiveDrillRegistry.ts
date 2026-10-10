/**
 * CorrectiveDrillRegistry.ts
 * Curated Clinical Corrective Drills & Biomechanical Demonstrations.
 *
 * Each entry provides evidence-based corrective exercise protocols, step-by-step
 * neuromuscular cues, comparative "Fault vs. Fix" visual instructions, and procedural
 * animation configurations to guide patients when abnormal postures are detected.
 */

import type { AbnormalPostureType } from '../biomechanics/biomechanicsTypes';

export interface CorrectiveDrill {
  id: string;
  faultType: AbnormalPostureType;
  title: string;
  targetArea: string;
  clinicalRationale: string;
  faultDescription: string;
  fixDescription: string;
  cues: string[];
  recommendedDose: string;
  drillCategory: 'STABILIZATION' | 'MOBILITY' | 'NEUROMUSCULAR';
  animationType:
    | 'spine_lateral_reset'
    | 'scapular_depression_reset'
    | 'pelvis_level_reset'
    | 'knee_tracking_reset'
    | 'chin_tuck_reset';
}

export const CORRECTIVE_DRILL_REGISTRY: Record<string, CorrectiveDrill> = {
  drill_trunk_stabilization: {
    id: 'drill_trunk_stabilization',
    faultType: 'TRUNK_LATERAL_LEAN',
    title: 'Neutral Spine Wall-Isolation Drill',
    targetArea: 'Thoracolumbar Core & Obliques',
    clinicalRationale:
      'Compensatory trunk lateral flexion falsely inflates active arm range of motion while loading the contralateral lumbar facet joints. This drill restores coronal plane stability.',
    faultDescription:
      'Torso tilts away from the elevated arm (>7° tilt), substituting spine motion for true glenohumeral elevation.',
    fixDescription:
      'Torso remains strictly vertical and stationary like a column, allowing only the shoulder joint to rotate.',
    cues: [
      '1. Stand or sit tall — imagine your spine is cemented between two glass walls.',
      '2. Engage your lower abdominal core gently before beginning arm elevation.',
      '3. Stop arm elevation 10° earlier if you feel your ribcage drifting sideways.',
      '4. Keep both feet firmly planted with equal bodyweight distribution.',
    ],
    recommendedDose: '2 sets of 8 controlled repetitions with 3s hold',
    drillCategory: 'STABILIZATION',
    animationType: 'spine_lateral_reset',
  },

  drill_scapular_depression: {
    id: 'drill_scapular_depression',
    faultType: 'SHOULDER_HIKE',
    title: 'Scapular Depression & Setting Protocol',
    targetArea: 'Lower Trapezius & Serratus Anterior',
    clinicalRationale:
      'Upper trapezius dominance causes premature elevation (shoulder hiking) before 90° abduction, risking subacromial impingement. This drill activates inferior scapular rotators.',
    faultDescription:
      'Shoulder blade rides upward toward the ear as the arm lifts, crowding the subacromial space.',
    fixDescription:
      'Shoulder blade stays anchored downward ("in your back pocket") while the arm moves independently.',
    cues: [
      '1. Before moving, consciously slide your shoulder blades down toward your back pockets.',
      '2. Keep space between your earlobe and shoulder top throughout the movement.',
      '3. Exhale smoothly as you raise the arm to maintain diaphragmatic relaxation.',
      '4. If your shoulder hikes, pause, lower 5°, set the shoulder blade, and resume.',
    ],
    recommendedDose: '2 sets of 10 repetitions with slow eccentric return',
    drillCategory: 'NEUROMUSCULAR',
    animationType: 'scapular_depression_reset',
  },

  drill_pelvic_leveling: {
    id: 'drill_pelvic_leveling',
    faultType: 'PELVIC_TILT',
    title: 'Pelvic Leveling & Gluteus Medius Reset',
    targetArea: 'Pelvic Girdle & Hip Abductors',
    clinicalRationale:
      'Lateral pelvic tilt or hip hiking indicates weak hip abductor stabilization on the stance side, causing uncoordinated kinematic chain transfer.',
    faultDescription:
      'Pelvis tilts or hikes on one side (>5.5° tilt) during leg elevation or single-leg balance.',
    fixDescription:
      'Anterior Superior Iliac Spines (ASIS) remain horizontal and level throughout the entire movement.',
    cues: [
      '1. Place hands on your pelvic crests to self-monitor hip levelness.',
      '2. Squeeze the gluteal muscle of your supporting leg to lock pelvic stability.',
      '3. Only elevate the moving limb as high as you can without tilting the hips.',
    ],
    recommendedDose: '3 sets of 8 repetitions per side',
    drillCategory: 'STABILIZATION',
    animationType: 'pelvis_level_reset',
  },

  drill_knee_valgus_alignment: {
    id: 'drill_knee_valgus_alignment',
    faultType: 'KNEE_VALGUS',
    title: 'Knee-Foot Vector Tracking Alignment',
    targetArea: 'Vastus Medialis & Hip External Rotators',
    clinicalRationale:
      'Medial knee collapse (valgus deviation) places abnormal valgus strain on the ACL and medial collateral complex while stressing patellofemoral tracking.',
    faultDescription:
      'Patella caves inward toward the midline relative to the second toe during extension or squatting.',
    fixDescription:
      'Knee tracks directly over the center of the foot, maintaining alignment from hip to ankle.',
    cues: [
      '1. Focus on spreading the floor with your feet to engage the hip stabilizers.',
      '2. Ensure your patella points directly over your second toe at all times.',
      '3. Avoid letting the arch of your foot collapse inward.',
    ],
    recommendedDose: '2 sets of 10 controlled alignment repetitions',
    drillCategory: 'NEUROMUSCULAR',
    animationType: 'knee_tracking_reset',
  },

  drill_chin_tuck_retraction: {
    id: 'drill_chin_tuck_retraction',
    faultType: 'FORWARD_HEAD',
    title: 'Axial Cervical Retraction Drill',
    targetArea: 'Deep Neck Flexors & Suboccipitals',
    clinicalRationale:
      'Forward head posture alters thoracic kinematics, restricts full overhead shoulder mobility, and increases compressive stress on the cervical spine.',
    faultDescription:
      'Head juts forward past the plumb line of the shoulders (>18° forward displacement).',
    fixDescription:
      'Ear sits directly in vertical plumb-line alignment over the acromion tip.',
    cues: [
      '1. Gently draw your chin straight back as if making a subtle double chin.',
      '2. Lengthen the back of your neck toward the ceiling without tilting head down.',
      '3. Maintain this tall neck posture throughout your rehabilitation exercises.',
    ],
    recommendedDose: '3 sets of 5 repetitions with 5-second hold',
    drillCategory: 'MOBILITY',
    animationType: 'chin_tuck_reset',
  },
};

/**
 * Retrieves the appropriate corrective drill for a given abnormal posture type.
 */
export function getDrillForAbnormalPosture(type?: AbnormalPostureType | null): CorrectiveDrill {
  if (!type) {
    return CORRECTIVE_DRILL_REGISTRY.drill_trunk_stabilization;
  }

  const drillMap: Record<AbnormalPostureType, string> = {
    TRUNK_LATERAL_LEAN: 'drill_trunk_stabilization',
    SHOULDER_HIKE: 'drill_scapular_depression',
    PELVIC_TILT: 'drill_pelvic_leveling',
    KNEE_VALGUS: 'drill_knee_valgus_alignment',
    FORWARD_HEAD: 'drill_chin_tuck_retraction',
    THORACIC_KYPHOSIS: 'drill_trunk_stabilization',
    TRUNK_HYPEREXTENSION: 'drill_trunk_stabilization',
  };

  const drillId = drillMap[type] ?? 'drill_trunk_stabilization';
  return CORRECTIVE_DRILL_REGISTRY[drillId] || CORRECTIVE_DRILL_REGISTRY.drill_trunk_stabilization;
}
