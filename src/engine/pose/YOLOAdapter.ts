/**
 * YOLOAdapter.ts
 * High-performance adapter converting YOLO COCO 17 Keypoints to Physiosis 33 Landmark format.
 *
 * COCO 17 Format:
 *   0: Nose
 *   1: Left Eye, 2: Right Eye
 *   3: Left Ear, 4: Right Ear
 *   5: Left Shoulder, 6: Right Shoulder
 *   7: Left Elbow, 8: Right Elbow
 *   9: Left Wrist, 10: Right Wrist
 *   11: Left Hip, 12: Right Hip
 *   13: Left Knee, 14: Right Knee
 *   15: Left Ankle, 16: Right Ankle
 *
 * Preserves exact anatomical laterality:
 *   COCO 5 (Left Shoulder) -> MediaPipe 11 (LEFT_SHOULDER)
 *   COCO 6 (Right Shoulder) -> MediaPipe 12 (RIGHT_SHOULDER)
 */

import type { Landmark } from '../../types/pose';
import { LandmarkIndex } from '../../types/pose';

/** Mapping lookup table from COCO 17 index to MediaPipe 33 LandmarkIndex */
const COCO_TO_MEDIAPIPE_MAP: readonly (number | null)[] = [
  LandmarkIndex.NOSE,           // 0 -> 0 (Nose)
  LandmarkIndex.LEFT_EYE,       // 1 -> 2 (Left Eye)
  LandmarkIndex.RIGHT_EYE,      // 2 -> 5 (Right Eye)
  LandmarkIndex.LEFT_EAR,       // 3 -> 7 (Left Ear)
  LandmarkIndex.RIGHT_EAR,      // 4 -> 8 (Right Ear)
  LandmarkIndex.LEFT_SHOULDER,  // 5 -> 11 (Left Shoulder)
  LandmarkIndex.RIGHT_SHOULDER, // 6 -> 12 (Right Shoulder)
  LandmarkIndex.LEFT_ELBOW,     // 7 -> 13 (Left Elbow)
  LandmarkIndex.RIGHT_ELBOW,    // 8 -> 14 (Right Elbow)
  LandmarkIndex.LEFT_WRIST,     // 9 -> 15 (Left Wrist)
  LandmarkIndex.RIGHT_WRIST,    // 10 -> 16 (Right Wrist)
  LandmarkIndex.LEFT_HIP,       // 11 -> 23 (Left Hip)
  LandmarkIndex.RIGHT_HIP,      // 12 -> 24 (Right Hip)
  LandmarkIndex.LEFT_KNEE,      // 13 -> 25 (Left Knee)
  LandmarkIndex.RIGHT_KNEE,     // 14 -> 26 (Right Knee)
  LandmarkIndex.LEFT_ANKLE,     // 15 -> 27 (Left Ankle)
  LandmarkIndex.RIGHT_ANKLE,    // 16 -> 28 (Right Ankle)
];

/** Pre-allocated landmark buffer with 33 default slots to prevent GC thrashing */
function createEmptyLandmarkBuffer(): Landmark[] {
  const buf: Landmark[] = new Array(33);
  for (let i = 0; i < 33; i++) {
    buf[i] = { x: 0.5, y: 0.5, z: 0, visibility: 0 };
  }
  return buf;
}

/**
 * Adapts raw YOLO normalized keypoints array [[x, y, conf], ...] to 33 Landmark format.
 *
 * @param yoloKeypoints - 17-element array of [x, y, conf] tuples (normalized to [0, 1]).
 * @returns Landmark[] - 33 normalized landmarks compatible with Physiosis Biomechanics.
 */
export function adaptYoloToPhysiosisLandmarks(
  yoloKeypoints: Array<[number, number, number]>
): Landmark[] {
  const landmarks = createEmptyLandmarkBuffer();

  const len = Math.min(yoloKeypoints.length, 17);
  for (let i = 0; i < len; i++) {
    const mpIdx = COCO_TO_MEDIAPIPE_MAP[i];
    if (mpIdx !== null && mpIdx !== undefined) {
      const kp = yoloKeypoints[i];
      if (kp) {
        landmarks[mpIdx] = {
          x: kp[0],
          y: kp[1],
          z: 0,
          visibility: kp[2] ?? 0.85,
        };
      }
    }
  }

  // Populate synthetic Inner/Outer eye coordinates for face stability
  if (landmarks[LandmarkIndex.LEFT_EYE].visibility && landmarks[LandmarkIndex.LEFT_EYE].visibility! > 0.2) {
    const le = landmarks[LandmarkIndex.LEFT_EYE];
    landmarks[LandmarkIndex.LEFT_EYE_INNER] = { x: le.x - 0.01, y: le.y, z: 0, visibility: le.visibility };
    landmarks[LandmarkIndex.LEFT_EYE_OUTER] = { x: le.x + 0.01, y: le.y, z: 0, visibility: le.visibility };
  }

  if (landmarks[LandmarkIndex.RIGHT_EYE].visibility && landmarks[LandmarkIndex.RIGHT_EYE].visibility! > 0.2) {
    const re = landmarks[LandmarkIndex.RIGHT_EYE];
    landmarks[LandmarkIndex.RIGHT_EYE_INNER] = { x: re.x + 0.01, y: re.y, z: 0, visibility: re.visibility };
    landmarks[LandmarkIndex.RIGHT_EYE_OUTER] = { x: re.x - 0.01, y: re.y, z: 0, visibility: re.visibility };
  }

  // Synthesize Foot/Toe indices from Ankle & Knee vector for lower limb protocols
  const lAnkle = landmarks[LandmarkIndex.LEFT_ANKLE];
  const lKnee = landmarks[LandmarkIndex.LEFT_KNEE];
  if (lAnkle.visibility && lAnkle.visibility > 0.2 && lKnee.visibility && lKnee.visibility > 0.2) {
    landmarks[LandmarkIndex.LEFT_HEEL] = { x: lAnkle.x, y: lAnkle.y + 0.02, z: 0, visibility: lAnkle.visibility };
    landmarks[LandmarkIndex.LEFT_FOOT_INDEX] = { x: lAnkle.x + 0.04, y: lAnkle.y + 0.02, z: 0, visibility: lAnkle.visibility };
  }

  const rAnkle = landmarks[LandmarkIndex.RIGHT_ANKLE];
  const rKnee = landmarks[LandmarkIndex.RIGHT_KNEE];
  if (rAnkle.visibility && rAnkle.visibility > 0.2 && rKnee.visibility && rKnee.visibility > 0.2) {
    landmarks[LandmarkIndex.RIGHT_HEEL] = { x: rAnkle.x, y: rAnkle.y + 0.02, z: 0, visibility: rAnkle.visibility };
    landmarks[LandmarkIndex.RIGHT_FOOT_INDEX] = { x: rAnkle.x - 0.04, y: rAnkle.y + 0.02, z: 0, visibility: rAnkle.visibility };
  }

  return landmarks;
}
