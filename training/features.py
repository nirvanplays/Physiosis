"""
features.py
Feature Extraction Library for Temporal Movement Intelligence (ML Training Patch 3).

Computes scale-invariant, body-normalized spatial and temporal kinematic features
from 17 COCO pose keypoints (x, y, confidence):
  1. Body-normalized coordinates (centered at mid-hip, scaled by torso length)
  2. Anatomical joint angles (shoulders, elbows, hips, knees, trunk, clavicle)
  3. Angular velocities (first temporal derivative of joint angles)
  4. Relative joint distances (wrist-wrist, wrist-shoulder, cross-body, ankle-ankle)
  5. Bilateral kinetic chain symmetry features
  6. Landmark confidence summaries
  7. Key joint displacement velocities
"""

import numpy as np

# COCO Keypoint Indices
NOSE = 0
LEFT_EYE, RIGHT_EYE = 1, 2
LEFT_EAR, RIGHT_EAR = 3, 4
LEFT_SHOULDER, RIGHT_SHOULDER = 5, 6
LEFT_ELBOW, RIGHT_ELBOW = 7, 8
LEFT_WRIST, RIGHT_WRIST = 9, 10
LEFT_HIP, RIGHT_HIP = 11, 12
LEFT_KNEE, RIGHT_KNEE = 13, 14
LEFT_ANKLE, RIGHT_ANKLE = 15, 16


def compute_angle(p1: np.ndarray, p2: np.ndarray, p3: np.ndarray) -> float:
    """
    Computes angle at vertex p2 formed by vectors (p1 - p2) and (p3 - p2).
    Returns angle in degrees [0, 180].
    """
    v1 = p1 - p2
    v2 = p3 - p2
    norm1 = np.linalg.norm(v1)
    norm2 = np.linalg.norm(v2)
    if norm1 < 1e-5 or norm2 < 1e-5:
        return 0.0
    cosine = np.dot(v1, v2) / (norm1 * norm2)
    cosine = np.clip(cosine, -1.0, 1.0)
    return float(np.degrees(np.arccos(cosine)))


def extract_frame_features(kps: np.ndarray) -> np.ndarray:
    """
    Extracts spatial kinematic features for a single frame of 17 keypoints.
    
    Args:
        kps: (17, 3) array of [x, y, confidence]

    Returns:
        1D numpy array of normalized features.
    """
    xy = kps[:, :2]
    conf = kps[:, 2]

    # Reference points: mid-shoulder & mid-hip
    mid_shoulder = (xy[LEFT_SHOULDER] + xy[RIGHT_SHOULDER]) / 2.0
    mid_hip = (xy[LEFT_HIP] + xy[RIGHT_HIP]) / 2.0

    # Torso length for scale normalization
    torso_len = np.linalg.norm(mid_shoulder - mid_hip)
    if torso_len < 1e-4:
        # Fallback: shoulder width
        torso_len = np.linalg.norm(xy[LEFT_SHOULDER] - xy[RIGHT_SHOULDER])
        if torso_len < 1e-4:
            torso_len = 1.0

    # 1. Body-normalized coordinates (17 * 2 = 34 features)
    norm_xy = (xy - mid_hip) / torso_len
    norm_xy_flat = norm_xy.flatten()

    # 2. Key joint angles (10 features, normalized to [0, 1])
    angle_l_shoulder = compute_angle(xy[LEFT_HIP], xy[LEFT_SHOULDER], xy[LEFT_ELBOW]) / 180.0
    angle_r_shoulder = compute_angle(xy[RIGHT_HIP], xy[RIGHT_SHOULDER], xy[RIGHT_ELBOW]) / 180.0
    angle_l_elbow = compute_angle(xy[LEFT_SHOULDER], xy[LEFT_ELBOW], xy[LEFT_WRIST]) / 180.0
    angle_r_elbow = compute_angle(xy[RIGHT_SHOULDER], xy[RIGHT_ELBOW], xy[RIGHT_WRIST]) / 180.0
    angle_l_hip = compute_angle(xy[LEFT_SHOULDER], xy[LEFT_HIP], xy[LEFT_KNEE]) / 180.0
    angle_r_hip = compute_angle(xy[RIGHT_SHOULDER], xy[RIGHT_HIP], xy[RIGHT_KNEE]) / 180.0
    angle_l_knee = compute_angle(xy[LEFT_HIP], xy[LEFT_KNEE], xy[LEFT_ANKLE]) / 180.0
    angle_r_knee = compute_angle(xy[RIGHT_HIP], xy[RIGHT_KNEE], xy[RIGHT_ANKLE]) / 180.0

    # Trunk tilt relative to vertical
    trunk_vec = mid_shoulder - mid_hip
    trunk_tilt = np.abs(np.degrees(np.arctan2(trunk_vec[0], -trunk_vec[1]))) / 90.0

    # Clavicle tilt relative to horizontal
    clav_vec = xy[LEFT_SHOULDER] - xy[RIGHT_SHOULDER]
    clav_tilt = np.abs(np.degrees(np.arctan2(clav_vec[1], clav_vec[0]))) / 90.0

    angles = np.array([
        angle_l_shoulder, angle_r_shoulder,
        angle_l_elbow, angle_r_elbow,
        angle_l_hip, angle_r_hip,
        angle_l_knee, angle_r_knee,
        trunk_tilt, clav_tilt
    ], dtype=np.float32)

    # 3. Relative joint distances (7 features, normalized by torso_len)
    dist_wrists = np.linalg.norm(xy[LEFT_WRIST] - xy[RIGHT_WRIST]) / torso_len
    dist_l_wrist_shoulder = np.linalg.norm(xy[LEFT_WRIST] - xy[LEFT_SHOULDER]) / torso_len
    dist_r_wrist_shoulder = np.linalg.norm(xy[RIGHT_WRIST] - xy[RIGHT_SHOULDER]) / torso_len
    # Cross-body distances (critical for cross-body stretch)
    dist_l_wrist_r_shoulder = np.linalg.norm(xy[LEFT_WRIST] - xy[RIGHT_SHOULDER]) / torso_len
    dist_r_wrist_l_shoulder = np.linalg.norm(xy[RIGHT_WRIST] - xy[LEFT_SHOULDER]) / torso_len
    # Lower limb distances
    dist_ankles = np.linalg.norm(xy[LEFT_ANKLE] - xy[RIGHT_ANKLE]) / torso_len
    dist_l_wrist_hip = np.linalg.norm(xy[LEFT_WRIST] - xy[LEFT_HIP]) / torso_len

    rel_dists = np.array([
        dist_wrists, dist_l_wrist_shoulder, dist_r_wrist_shoulder,
        dist_l_wrist_r_shoulder, dist_r_wrist_l_shoulder,
        dist_ankles, dist_l_wrist_hip
    ], dtype=np.float32)

    # 4. Bilateral symmetry features (4 features)
    sym_wrist_height = (norm_xy[LEFT_WRIST, 1] - norm_xy[RIGHT_WRIST, 1])
    sym_shoulder_height = (norm_xy[LEFT_SHOULDER, 1] - norm_xy[RIGHT_SHOULDER, 1])
    sym_elbow_angle = angle_l_elbow - angle_r_elbow
    sym_shoulder_angle = angle_l_shoulder - angle_r_shoulder

    symmetry = np.array([
        sym_wrist_height, sym_shoulder_height, sym_elbow_angle, sym_shoulder_angle
    ], dtype=np.float32)

    # 5. Keypoint confidence summary (3 features)
    upper_conf = np.mean(conf[[LEFT_SHOULDER, RIGHT_SHOULDER, LEFT_ELBOW, RIGHT_ELBOW, LEFT_WRIST, RIGHT_WRIST]])
    lower_conf = np.mean(conf[[LEFT_HIP, RIGHT_HIP, LEFT_KNEE, RIGHT_KNEE, LEFT_ANKLE, RIGHT_ANKLE]])
    total_conf = np.mean(conf)

    conf_summary = np.array([upper_conf, lower_conf, total_conf], dtype=np.float32)

    return np.concatenate([
        norm_xy_flat,    # 34
        angles,          # 10
        rel_dists,       # 7
        symmetry,        # 4
        conf_summary     # 3
    ]).astype(np.float32)  # Total base spatial features = 58


def extract_temporal_features(sequence_spatial: np.ndarray, fps: float = 20.0) -> np.ndarray:
    """
    Computes temporal derivatives (velocity and acceleration) across the sequence of frames.

    Args:
        sequence_spatial: (T, 58) array of frame spatial features
        fps: effective sampling framerate

    Returns:
        (T, D) array combining spatial features with temporal velocities.
    """
    T, D = sequence_spatial.shape
    dt = 1.0 / max(1.0, fps)

    # Velocity: first derivative (central difference with edge replication)
    vel = np.zeros_like(sequence_spatial)
    if T > 1:
        vel[1:-1] = (sequence_spatial[2:] - sequence_spatial[:-2]) / (2.0 * dt)
        vel[0] = (sequence_spatial[1] - sequence_spatial[0]) / dt
        vel[-1] = (sequence_spatial[-1] - sequence_spatial[-2]) / dt

    # Select key velocities (angles [34:44], keypoint coords [0:34], relative dists [44:51])
    # Velocity of joint angles (10 dimensions)
    angle_vel = vel[:, 34:44]
    # Velocity of wrist and elbow keypoints (left/right wrist [9, 10], left/right elbow [7, 8])
    # in norm_xy_flat: wrist_L=18,19; wrist_R=20,21; elbow_L=14,15; elbow_R=16,17
    limb_vel = vel[:, [14, 15, 16, 17, 18, 19, 20, 21]]

    # Combined feature vector per time step:
    # 58 (spatial) + 10 (angle velocity) + 8 (limb velocity) = 76 dimensions
    return np.concatenate([sequence_spatial, angle_vel, limb_vel], axis=-1).astype(np.float32)
