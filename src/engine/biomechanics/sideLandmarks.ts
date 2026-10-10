/**
 * sideLandmarks.ts
 * Unified side-aware landmark extraction for all Physiosis rehabilitation exercises.
 *
 * Provides a clean abstraction mapping anatomical landmark roles to their exact
 * MediaPipe BlazePose (33 landmarks) index based on the active laterality:
 *   - 'left': Left arm / leg / torso landmarks
 *   - 'right': Right arm / leg / torso landmarks
 *   - 'bilateral': Symmetrical bilateral landmarks
 */

import type { Landmark3D } from '../exercise/ExerciseTypes';

export interface SideLandmarkBundle {
  side: 'left' | 'right' | 'bilateral';

  // Primary active limb landmarks
  shoulder?: Landmark3D;
  elbow?: Landmark3D;
  wrist?: Landmark3D;
  pinky?: Landmark3D;
  index?: Landmark3D;
  thumb?: Landmark3D;
  hip?: Landmark3D;
  knee?: Landmark3D;
  ankle?: Landmark3D;
  heel?: Landmark3D;
  footIndex?: Landmark3D;

  // Contralateral reference landmarks
  oppositeShoulder?: Landmark3D;
  oppositeElbow?: Landmark3D;
  oppositeWrist?: Landmark3D;
  oppositeHip?: Landmark3D;
  oppositeKnee?: Landmark3D;
  oppositeAnkle?: Landmark3D;
  oppositeHeel?: Landmark3D;
  oppositeFootIndex?: Landmark3D;

  // Explicit bilateral left/right landmarks
  leftShoulder?: Landmark3D;
  rightShoulder?: Landmark3D;
  leftElbow?: Landmark3D;
  rightElbow?: Landmark3D;
  leftWrist?: Landmark3D;
  rightWrist?: Landmark3D;
  leftHip?: Landmark3D;
  rightHip?: Landmark3D;
  leftKnee?: Landmark3D;
  rightKnee?: Landmark3D;
  leftAnkle?: Landmark3D;
  rightAnkle?: Landmark3D;
  leftHeel?: Landmark3D;
  rightHeel?: Landmark3D;
  leftFootIndex?: Landmark3D;
  rightFootIndex?: Landmark3D;

  // Virtual central reference points
  midShoulder?: Landmark3D;
  midHip?: Landmark3D;
}

/**
 * Extracts side-specific landmarks from MediaPipe 33-landmark array.
 * Guarantees that selecting 'left' analyzes the physical left limb,
 * and selecting 'right' analyzes the physical right limb.
 */
export function getLandmarksForSide(
  landmarks: Landmark3D[],
  side: 'left' | 'right' | 'bilateral' = 'right'
): SideLandmarkBundle {
  const isLeft = side === 'left';

  // MediaPipe BlazePose Landmark Indices:
  // Left:  11 (shoulder), 13 (elbow), 15 (wrist), 17 (pinky), 19 (index), 21 (thumb), 23 (hip), 25 (knee), 27 (ankle), 29 (heel), 31 (foot_index)
  // Right: 12 (shoulder), 14 (elbow), 16 (wrist), 18 (pinky), 20 (index), 22 (thumb), 24 (hip), 26 (knee), 28 (ankle), 30 (heel), 32 (foot_index)

  const lShoulder = landmarks[11];
  const rShoulder = landmarks[12];
  const lElbow = landmarks[13];
  const rElbow = landmarks[14];
  const lWrist = landmarks[15];
  const rWrist = landmarks[16];
  const lPinky = landmarks[17];
  const rPinky = landmarks[18];
  const lIndex = landmarks[19];
  const rIndex = landmarks[20];
  const lThumb = landmarks[21];
  const rThumb = landmarks[22];
  const lHip = landmarks[23];
  const rHip = landmarks[24];
  const lKnee = landmarks[25];
  const rKnee = landmarks[26];
  const lAnkle = landmarks[27];
  const rAnkle = landmarks[28];
  const lHeel = landmarks[29];
  const rHeel = landmarks[30];
  const lFootIndex = landmarks[31];
  const rFootIndex = landmarks[32];

  // Compute virtual midpoints
  let midShoulder: Landmark3D | undefined;
  if (lShoulder && rShoulder) {
    midShoulder = {
      x: (lShoulder.x + rShoulder.x) / 2,
      y: (lShoulder.y + rShoulder.y) / 2,
      z: ((lShoulder.z ?? 0) + (rShoulder.z ?? 0)) / 2,
      visibility: Math.min(lShoulder.visibility ?? 1, rShoulder.visibility ?? 1),
    };
  }

  let midHip: Landmark3D | undefined;
  if (lHip && rHip) {
    midHip = {
      x: (lHip.x + rHip.x) / 2,
      y: (lHip.y + rHip.y) / 2,
      z: ((lHip.z ?? 0) + (rHip.z ?? 0)) / 2,
      visibility: Math.min(lHip.visibility ?? 1, rHip.visibility ?? 1),
    };
  }

  return {
    side,

    // Primary active limb
    shoulder: isLeft ? lShoulder : rShoulder,
    elbow: isLeft ? lElbow : rElbow,
    wrist: isLeft ? lWrist : rWrist,
    pinky: isLeft ? lPinky : rPinky,
    index: isLeft ? lIndex : rIndex,
    thumb: isLeft ? lThumb : rThumb,
    hip: isLeft ? lHip : rHip,
    knee: isLeft ? lKnee : rKnee,
    ankle: isLeft ? lAnkle : rAnkle,
    heel: isLeft ? lHeel : rHeel,
    footIndex: isLeft ? lFootIndex : rFootIndex,

    // Contralateral reference limb
    oppositeShoulder: isLeft ? rShoulder : lShoulder,
    oppositeElbow: isLeft ? rElbow : lElbow,
    oppositeWrist: isLeft ? rWrist : lWrist,
    oppositeHip: isLeft ? rHip : lHip,
    oppositeKnee: isLeft ? rKnee : lKnee,
    oppositeAnkle: isLeft ? rAnkle : lAnkle,
    oppositeHeel: isLeft ? rHeel : lHeel,
    oppositeFootIndex: isLeft ? rFootIndex : lFootIndex,

    // Explicit bilateral points
    leftShoulder: lShoulder,
    rightShoulder: rShoulder,
    leftElbow: lElbow,
    rightElbow: rElbow,
    leftWrist: lWrist,
    rightWrist: rWrist,
    leftHip: lHip,
    rightHip: rHip,
    leftKnee: lKnee,
    rightKnee: rKnee,
    leftAnkle: lAnkle,
    rightAnkle: rAnkle,
    leftHeel: lHeel,
    rightHeel: rHeel,
    leftFootIndex: lFootIndex,
    rightFootIndex: rFootIndex,

    midShoulder,
    midHip,
  };
}
