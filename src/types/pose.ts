/**
 * pose.ts
 * Types for pose detection landmarks, results, and tracking metrics.
 */

/** Normalized 3D landmark in [0,1] space (x, y) + depth (z). */
export interface Landmark {
  x: number;
  y: number;
  z: number;
  /** Visibility score [0,1]. */
  visibility?: number;
}

/** Named indices for the 33 MediaPipe Pose landmarks. */
export enum LandmarkIndex {
  NOSE = 0,
  LEFT_EYE_INNER = 1,
  LEFT_EYE = 2,
  LEFT_EYE_OUTER = 3,
  RIGHT_EYE_INNER = 4,
  RIGHT_EYE = 5,
  RIGHT_EYE_OUTER = 6,
  LEFT_EAR = 7,
  RIGHT_EAR = 8,
  MOUTH_LEFT = 9,
  MOUTH_RIGHT = 10,
  LEFT_SHOULDER = 11,
  RIGHT_SHOULDER = 12,
  LEFT_ELBOW = 13,
  RIGHT_ELBOW = 14,
  LEFT_WRIST = 15,
  RIGHT_WRIST = 16,
  LEFT_PINKY = 17,
  RIGHT_PINKY = 18,
  LEFT_INDEX = 19,
  RIGHT_INDEX = 20,
  LEFT_THUMB = 21,
  RIGHT_THUMB = 22,
  LEFT_HIP = 23,
  RIGHT_HIP = 24,
  LEFT_KNEE = 25,
  RIGHT_KNEE = 26,
  LEFT_ANKLE = 27,
  RIGHT_ANKLE = 28,
  LEFT_HEEL = 29,
  RIGHT_HEEL = 30,
  LEFT_FOOT_INDEX = 31,
  RIGHT_FOOT_INDEX = 32,
}

/** The primary 13-15 landmarks used for rehabilitation kinematics */
export const KEY_REHAB_LANDMARKS: LandmarkIndex[] = [
  LandmarkIndex.NOSE,
  LandmarkIndex.LEFT_SHOULDER,
  LandmarkIndex.RIGHT_SHOULDER,
  LandmarkIndex.LEFT_ELBOW,
  LandmarkIndex.RIGHT_ELBOW,
  LandmarkIndex.LEFT_WRIST,
  LandmarkIndex.RIGHT_WRIST,
  LandmarkIndex.LEFT_HIP,
  LandmarkIndex.RIGHT_HIP,
  LandmarkIndex.LEFT_KNEE,
  LandmarkIndex.RIGHT_KNEE,
  LandmarkIndex.LEFT_ANKLE,
  LandmarkIndex.RIGHT_ANKLE,
];

/** Skeleton connection pairs [from, to] */
export const POSE_CONNECTIONS: [LandmarkIndex, LandmarkIndex][] = [
  // Shoulders & Torso
  [LandmarkIndex.LEFT_SHOULDER, LandmarkIndex.RIGHT_SHOULDER],
  [LandmarkIndex.LEFT_SHOULDER, LandmarkIndex.LEFT_HIP],
  [LandmarkIndex.RIGHT_SHOULDER, LandmarkIndex.RIGHT_HIP],
  [LandmarkIndex.LEFT_HIP, LandmarkIndex.RIGHT_HIP],
  // Left Arm
  [LandmarkIndex.LEFT_SHOULDER, LandmarkIndex.LEFT_ELBOW],
  [LandmarkIndex.LEFT_ELBOW, LandmarkIndex.LEFT_WRIST],
  // Right Arm
  [LandmarkIndex.RIGHT_SHOULDER, LandmarkIndex.RIGHT_ELBOW],
  [LandmarkIndex.RIGHT_ELBOW, LandmarkIndex.RIGHT_WRIST],
  // Left Leg
  [LandmarkIndex.LEFT_HIP, LandmarkIndex.LEFT_KNEE],
  [LandmarkIndex.LEFT_KNEE, LandmarkIndex.LEFT_ANKLE],
  // Right Leg
  [LandmarkIndex.RIGHT_HIP, LandmarkIndex.RIGHT_KNEE],
  [LandmarkIndex.RIGHT_KNEE, LandmarkIndex.RIGHT_ANKLE],
];

/** A full pose result from a single detection frame. */
export interface PoseResult {
  landmarks: Landmark[];
  /** World-space landmarks (metric, hip-centered). */
  worldLandmarks?: Landmark[];
  /** Timestamp of the frame in milliseconds. */
  timestampMs: number;
}

/** Represents the absence of a pose (no person detected). */
export type PoseFrame = PoseResult | null;

/** Live tracking metrics for UI display. */
export interface PoseTrackingStats {
  fps: number;
  landmarkCount: number;
  confidence: number;
  poseDetected: boolean;
  providerType?: 'yolo' | 'mediapipe';
  inferenceMs?: number;
  endToEndMs?: number;
  device?: string;
  modelName?: string;
  isCuda?: boolean;
  isFallback?: boolean;
}
