"""
========================================================================================
PHYSIOSIS REAL-TIME 3D POSE MIRROR & BIOMECHANICAL SKELETON TRACKER
========================================================================================
Author: Google DeepMind Advanced Agentic Coding Pair
Stack:  Python 3.10+ | OpenCV | Google MediaPipe Pose | Ursina Engine (Panda3D)

Core Architecture:
1. Threaded MediaPipe Pose Pipeline (Background Thread):
   - Captures high-framerate webcam frames.
   - Computes 3D joint landmark coordinates (X, Y, Z).
   - Calculates 3D arm elevation angles (Hip-Shoulder-Elbow) and elbow flexion.
   - Renders annotated 2D telemetry HUD in an OpenCV window.
   - Safely passes thread-locked telemetry packets to the 3D engine.

2. Real-Time 3D Articulated Skeleton (Ursina Engine - Main Thread):
   - Renders an interactive 3D scene with ground grid, directional lighting, and shadows.
   - Assembles a full anatomical upper-body skeleton using joint spheres and bone cylinders.
   - Dynamically tracks and rotates arm joints with EMA smoothing and forward kinematics.
   - Supports 3D camera orbital controls (Right Mouse Button drag / Scroll).

Requirements:
   pip install opencv-python mediapipe ursina numpy
========================================================================================
"""

import sys
import time
import math
import threading
from dataclasses import dataclass, field
from typing import Optional, Tuple, Dict

import cv2
import numpy as np

# Suppress MediaPipe protobuf / absl verbose logs
import os
os.environ['TF_CPP_MIN_LOG_LEVEL'] = '3'

import mediapipe as mp
from ursina import (
    Ursina, Entity, color, Vec3, camera, window, Text,
    EditorCamera, DirectionalLight, AmbientLight, destroy, application
)


# ======================================================================================
# 1. SHARED THREAD-SAFE POSE TELEMETRY STATE
# ======================================================================================

@dataclass
class JointState3D:
    """Stores normalized 3D position (centered around mid-spine) for a joint."""
    x: float = 0.0
    y: float = 0.0
    z: float = 0.0
    visibility: float = 0.0


@dataclass
class PoseTelemetryPacket:
    """Thread-safe snapshot passed from OpenCV/MediaPipe to 3D Ursina engine."""
    timestamp: float = 0.0
    is_tracking: bool = False
    fps: float = 0.0
    
    # Measured Kinematic Angles (Degrees)
    right_arm_elevation: float = 0.0      # Hip-Shoulder-Elbow angle
    left_arm_elevation: float = 0.0
    right_elbow_flexion: float = 0.0      # Shoulder-Elbow-Wrist angle
    left_elbow_flexion: float = 0.0
    
    # 3D Normalized Joint World Positions (Local 3D coordinate space)
    joints: Dict[str, JointState3D] = field(default_factory=dict)
    
    # Warning or diagnostic message
    status_message: str = "Initializing..."


class PoseStateHub:
    """Thread-safe container with mutex locking for inter-thread communication."""
    def __init__(self):
        self._lock = threading.Lock()
        self._packet = PoseTelemetryPacket()
        self._is_running = True

    def update(self, packet: PoseTelemetryPacket):
        with self._lock:
            self._packet = packet

    def get_snapshot(self) -> PoseTelemetryPacket:
        with self._lock:
            # Return shallow copy with copy of dict
            return PoseTelemetryPacket(
                timestamp=self._packet.timestamp,
                is_tracking=self._packet.is_tracking,
                fps=self._packet.fps,
                right_arm_elevation=self._packet.right_arm_elevation,
                left_arm_elevation=self._packet.left_arm_elevation,
                right_elbow_flexion=self._packet.right_elbow_flexion,
                left_elbow_flexion=self._packet.left_elbow_flexion,
                joints=dict(self._packet.joints),
                status_message=self._packet.status_message,
            )

    def stop(self):
        with self._lock:
            self._is_running = False

    def is_running(self) -> bool:
        with self._lock:
            return self._is_running


# ======================================================================================
# 2. 3D VECTOR MATH & BIOMECHANICAL CALCULATIONS
# ======================================================================================

def calculate_angle_3d(p_proximal: np.ndarray, p_joint: np.ndarray, p_distal: np.ndarray) -> float:
    """
    Computes the 3D angle (in degrees) at p_joint between (p_proximal - p_joint)
    and (p_distal - p_joint).
    """
    v1 = p_proximal - p_joint
    v2 = p_distal - p_joint
    
    norm1 = np.linalg.norm(v1)
    norm2 = np.linalg.norm(v2)
    
    if norm1 < 1e-6 or norm2 < 1e-6:
        return 0.0
        
    dot = np.dot(v1, v2)
    cos_angle = np.clip(dot / (norm1 * norm2), -1.0, 1.0)
    angle_rad = np.arccos(cos_angle)
    return float(np.degrees(angle_rad))


# ======================================================================================
# 3. BACKGROUND MEDIAPIPE & OPENCV THREAD
# ======================================================================================

class MediaPipePoseWorker(threading.Thread):
    """
    Captures webcam frames, runs Google MediaPipe BlazePose, extracts 3D joints,
    calculates kinematics, and renders annotated 2D telemetry window.
    """
    def __init__(self, state_hub: PoseStateHub, camera_index: int = 0):
        super().__init__(name="MediaPipePoseWorker", daemon=True)
        self.state_hub = state_hub
        self.camera_index = camera_index
        self.cap: Optional[cv2.VideoCapture] = None
        self.simulated_mode = False

    def _init_camera(self) -> bool:
        """Attempts to open default camera, testing fallback indices if needed."""
        for idx in [self.camera_index, 0, 1, 2]:
            cap = cv2.VideoCapture(idx, cv2.CAP_DSHOW if os.name == 'nt' else cv2.CAP_ANY)
            if cap.isOpened():
                ret, frame = cap.read()
                if ret and frame is not None:
                    cap.set(cv2.CAP_PROP_FRAME_WIDTH, 640)
                    cap.set(cv2.CAP_PROP_FRAME_HEIGHT, 480)
                    self.cap = cap
                    print(f"[MediaPipePoseWorker] Connected to Webcam device index {idx} (640x480)")
                    return True
                cap.release()

        print("[MediaPipePoseWorker] Warning: No physical webcam detected. Engaging Diagnostic Synthetic Motion Mode.")
        self.simulated_mode = True
        return True

    def run(self):
        self._init_camera()

        mp_pose = mp.solutions.pose
        mp_drawing = mp.solutions.drawing_utils
        mp_drawing_styles = mp.solutions.drawing_styles

        pose_detector = mp_pose.Pose(
            static_image_mode=False,
            model_complexity=1,
            smooth_landmarks=True,
            enable_segmentation=False,
            min_detection_confidence=0.55,
            min_tracking_confidence=0.55,
        )

        prev_time = time.time()
        fps = 0.0
        frame_counter = 0

        cv2.namedWindow("MediaPipe Pose Tracker - Camera Feed", cv2.WINDOW_AUTOSIZE)

        while self.state_hub.is_running():
            now = time.time()
            dt = now - prev_time
            if dt > 0:
                fps = 0.9 * fps + 0.1 * (1.0 / dt)
            prev_time = now

            frame_counter += 1

            if not self.simulated_mode and self.cap is not None:
                ret, frame = self.cap.read()
                if not ret or frame is None:
                    time.sleep(0.01)
                    continue
                # Flip horizontally for selfie mirror effect
                frame = cv2.flip(frame, 1)
            else:
                # Generate synthetic frame with diagnostic prompt
                frame = np.zeros((480, 640, 3), dtype=np.uint8)
                cv2.putText(
                    frame, "SYNTHETIC TEST MODE (NO WEBCAM)", (20, 50),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 165, 255), 2
                )
                cv2.putText(
                    frame, "Auto-generating sinusoidal arm wave...", (20, 80),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.5, (180, 180, 180), 1
                )

            h, w, _ = frame.shape
            packet = PoseTelemetryPacket(timestamp=now, fps=fps)

            if not self.simulated_mode:
                rgb_frame = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
                results = pose_detector.process(rgb_frame)

                if results.pose_landmarks and results.pose_world_landmarks:
                    packet.is_tracking = True
                    packet.status_message = "Tracking Active"

                    # 1. Draw MediaPipe landmarks on frame
                    mp_drawing.draw_landmarks(
                        frame,
                        results.pose_landmarks,
                        mp_pose.POSE_CONNECTIONS,
                        landmark_drawing_spec=mp_drawing_styles.get_default_pose_landmarks_style(),
                    )

                    lm_world = results.pose_world_landmarks.landmark
                    lm_2d = results.pose_landmarks.landmark

                    # Helper to get 3D numpy coordinate (world landmarks in meters)
                    def get_pt3d(idx):
                        lm = lm_world[idx]
                        return np.array([lm.x, -lm.y, -lm.z])  # Invert Y to match 3D standard up-vector

                    # Key landmark indices (BlazePose)
                    # 11: left_shoulder, 12: right_shoulder
                    # 13: left_elbow, 14: right_elbow
                    # 15: left_wrist, 16: right_wrist
                    # 23: left_hip, 24: right_hip
                    # Note: Because frame is flipped horizontally for mirror view:
                    # MediaPipe's Left is the user's physical Left (appears on user's left).
                    
                    p_l_shoulder = get_pt3d(11)
                    p_r_shoulder = get_pt3d(12)
                    p_l_elbow = get_pt3d(13)
                    p_r_elbow = get_pt3d(14)
                    p_l_wrist = get_pt3d(15)
                    p_r_wrist = get_pt3d(16)
                    p_l_hip = get_pt3d(23)
                    p_r_hip = get_pt3d(24)

                    # Compute Spine & Pelvis Centers
                    mid_shoulder = (p_l_shoulder + p_r_shoulder) / 2.0
                    mid_hip = (p_l_hip + p_r_hip) / 2.0

                    # 2. Kinematic Angles
                    # Right Arm Elevation: Angle between Hip->Shoulder and Shoulder->Elbow
                    r_elevation = calculate_angle_3d(p_r_hip, p_r_shoulder, p_r_elbow)
                    l_elevation = calculate_angle_3d(p_l_hip, p_l_shoulder, p_l_elbow)
                    
                    # Elbow Flexion: Angle between Shoulder->Elbow and Elbow->Wrist
                    r_elbow_ang = calculate_angle_3d(p_r_shoulder, p_r_elbow, p_r_wrist)
                    l_elbow_ang = calculate_angle_3d(p_l_shoulder, p_l_elbow, p_l_wrist)

                    packet.right_arm_elevation = r_elevation
                    packet.left_arm_elevation = l_elevation
                    packet.right_elbow_flexion = r_elbow_ang
                    packet.left_elbow_flexion = l_elbow_ang

                    # 3. Store Normalized Centered 3D Positions for 3D Skeleton
                    # Scale factor: roughly map human meters to Ursina units
                    scale = 2.5
                    def make_joint(pt, vis):
                        # Center relative to mid_shoulder
                        rel = (pt - mid_shoulder) * scale
                        return JointState3D(x=float(rel[0]), y=float(rel[1]), z=float(rel[2]), visibility=vis)

                    packet.joints = {
                        "mid_shoulder": JointState3D(x=0.0, y=0.0, z=0.0, visibility=1.0),
                        "left_shoulder": make_joint(p_l_shoulder, lm_2d[11].visibility),
                        "right_shoulder": make_joint(p_r_shoulder, lm_2d[12].visibility),
                        "left_elbow": make_joint(p_l_elbow, lm_2d[13].visibility),
                        "right_elbow": make_joint(p_r_elbow, lm_2d[14].visibility),
                        "left_wrist": make_joint(p_l_wrist, lm_2d[15].visibility),
                        "right_wrist": make_joint(p_r_wrist, lm_2d[16].visibility),
                        "left_hip": make_joint(p_l_hip, lm_2d[23].visibility),
                        "right_hip": make_joint(p_r_hip, lm_2d[24].visibility),
                        "mid_hip": make_joint(mid_hip, 1.0),
                        "head": JointState3D(x=0.0, y=0.45 * scale, z=0.0, visibility=1.0),
                    }
                else:
                    packet.is_tracking = False
                    packet.status_message = "Looking for person in frame..."
            else:
                # Synthetic Kinematic Motion Generator (Diagnostic mode)
                t = now * 1.5
                r_ang = float(85.0 + 75.0 * math.sin(t))
                l_ang = float(85.0 + 75.0 * math.sin(t + math.pi))
                packet.is_tracking = True
                packet.right_arm_elevation = r_ang
                packet.left_arm_elevation = l_ang
                packet.right_elbow_flexion = float(140.0 + 30.0 * math.cos(t))
                packet.left_elbow_flexion = float(140.0 + 30.0 * math.cos(t + math.pi))
                packet.status_message = "Diagnostic Simulation Active"

                # Generate synthetic 3D joints
                arm_len = 0.7
                r_rad = math.radians(r_ang - 90.0)
                l_rad = math.radians(l_ang - 90.0)

                packet.joints = {
                    "mid_shoulder": JointState3D(0.0, 0.0, 0.0, 1.0),
                    "right_shoulder": JointState3D(0.5, 0.0, 0.0, 1.0),
                    "left_shoulder": JointState3D(-0.5, 0.0, 0.0, 1.0),
                    "right_elbow": JointState3D(0.5 + arm_len * math.cos(r_rad), arm_len * math.sin(r_rad), 0.0, 1.0),
                    "left_elbow": JointState3D(-0.5 - arm_len * math.cos(l_rad), arm_len * math.sin(l_rad), 0.0, 1.0),
                    "right_wrist": JointState3D(0.5 + 2 * arm_len * math.cos(r_rad), 2 * arm_len * math.sin(r_rad), 0.0, 1.0),
                    "left_wrist": JointState3D(-0.5 - 2 * arm_len * math.cos(l_rad), 2 * arm_len * math.sin(l_rad), 0.0, 1.0),
                    "mid_hip": JointState3D(0.0, -1.2, 0.0, 1.0),
                    "right_hip": JointState3D(0.35, -1.2, 0.0, 1.0),
                    "left_hip": JointState3D(-0.35, -1.2, 0.0, 1.0),
                    "head": JointState3D(0.0, 0.6, 0.0, 1.0),
                }

            # 4. Render OpenCV HUD Telemetry Box
            # Top Banner
            cv2.rectangle(frame, (0, 0), (w, 85), (20, 24, 30), -1)
            cv2.line(frame, (0, 85), (w, 85), (0, 229, 255), 2)

            status_col = (0, 255, 120) if packet.is_tracking else (0, 165, 255)
            cv2.circle(frame, (20, 25), 7, status_col, -1)
            cv2.putText(
                frame, f"STATUS: {packet.status_message.upper()}", (35, 30),
                cv2.FONT_HERSHEY_DUPLEX, 0.55, (255, 255, 255), 1
            )
            cv2.putText(
                frame, f"FPS: {fps:.1f}", (w - 110, 30),
                cv2.FONT_HERSHEY_DUPLEX, 0.55, (0, 229, 255), 1
            )

            # Arm Angles Telemetry
            cv2.putText(
                frame, f"R ARM ELEVATION: {packet.right_arm_elevation:.1f} DEG", (20, 60),
                cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 229, 255), 1
            )
            cv2.putText(
                frame, f"L ARM ELEVATION: {packet.left_arm_elevation:.1f} DEG", (w - 300, 60),
                cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 170, 255), 1
            )

            # Bottom info strip
            cv2.rectangle(frame, (0, h - 30), (w, h), (15, 18, 22), -1)
            cv2.putText(
                frame, "Real-Time 3D Mirror Active | Press 'Q' or 'ESC' to Quit", (15, h - 10),
                cv2.FONT_HERSHEY_SIMPLEX, 0.42, (160, 170, 180), 1
            )

            cv2.imshow("MediaPipe Pose Tracker - Camera Feed", frame)

            # Update thread-safe state packet
            self.state_hub.update(packet)

            # Handle OpenCV window quit key
            key = cv2.waitKey(1) & 0xFF
            if key in [ord('q'), ord('Q'), 27]:
                print("[MediaPipePoseWorker] Quit key received.")
                self.state_hub.stop()
                break

        # Cleanup
        if self.cap is not None:
            self.cap.release()
        cv2.destroyAllWindows()
        pose_detector.close()
        print("[MediaPipePoseWorker] Terminated safely.")


# ======================================================================================
# 4. 3D VISUAL SKELETON RIG & URSINA SCENE
# ======================================================================================

class BoneCylinder(Entity):
    """
    Primitive 3D cylinder that connects two joint positions (P1 -> P2).
    Dynamically positions, scales, and aims between the endpoints.
    """
    def __init__(self, color_val=color.cyan, radius=0.045):
        super().__init__(
            model='cylinder',
            color=color_val,
            scale=(radius, 1.0, radius),
            shader=None
        )

    def connect(self, p1: Vec3, p2: Vec3):
        """Aligns and scales the cylinder between 3D vectors p1 and p2."""
        diff = p2 - p1
        dist = diff.length()
        if dist < 1e-4:
            self.scale_y = 0.001
            return

        self.position = (p1 + p2) / 2.0
        self.scale_y = dist
        # Point the cylinder towards p2 (Ursina cylinders are aligned along Y axis)
        self.look_at(p2, axis='up')


class SkeletonRig3D:
    """
    Constructs and animates the 3D anatomical upper-body skeleton.
    Uses spheres for joints and dynamically orienting cylinders for bones.
    """
    def __init__(self):
        # Joint Colors
        self.col_right = color.cyan
        self.col_left = color.orange
        self.col_core = color.azure
        self.col_joint = color.white

        # 1. Joint Spheres
        self.joints: Dict[str, Entity] = {}
        joint_names = [
            ("head", 0.16, color.white),
            ("mid_shoulder", 0.08, self.col_core),
            ("right_shoulder", 0.10, self.col_right),
            ("left_shoulder", 0.10, self.col_left),
            ("right_elbow", 0.08, self.col_right),
            ("left_elbow", 0.08, self.col_left),
            ("right_wrist", 0.07, self.col_right),
            ("left_wrist", 0.07, self.col_left),
            ("mid_hip", 0.09, self.col_core),
            ("right_hip", 0.08, self.col_right),
            ("left_hip", 0.08, self.col_left),
        ]

        for name, r, col in joint_names:
            self.joints[name] = Entity(
                model='sphere',
                color=col,
                scale=r * 2.0,
                position=(0, 0, 0)
            )

        # 2. Bone Cylinders
        self.bones: Dict[str, BoneCylinder] = {
            "neck": BoneCylinder(self.col_core, radius=0.04),
            "clavicle_r": BoneCylinder(self.col_right, radius=0.04),
            "clavicle_l": BoneCylinder(self.col_left, radius=0.04),
            "humerus_r": BoneCylinder(self.col_right, radius=0.05),
            "humerus_l": BoneCylinder(self.col_left, radius=0.05),
            "forearm_r": BoneCylinder(self.col_right, radius=0.038),
            "forearm_l": BoneCylinder(self.col_left, radius=0.038),
            "spine": BoneCylinder(self.col_core, radius=0.055),
            "pelvis_r": BoneCylinder(self.col_right, radius=0.04),
            "pelvis_l": BoneCylinder(self.col_left, radius=0.04),
        }

        # Smoothed joint vector cache for EMA jitter reduction
        self.smoothed_positions: Dict[str, Vec3] = {
            name: Vec3(0, 0, 0) for name, _, _ in joint_names
        }
        self.alpha = 0.35  # EMA smoothing factor

    def update(self, packet: PoseTelemetryPacket):
        if not packet.joints:
            return

        # 1. Update and smooth 3D joint positions
        for name, joint_ent in self.joints.items():
            if name in packet.joints:
                data = packet.joints[name]
                raw_pos = Vec3(data.x, data.y, data.z)
                # Exponential Moving Average (EMA) smoothing
                curr = self.smoothed_positions[name]
                smoothed = curr + (raw_pos - curr) * self.alpha
                self.smoothed_positions[name] = smoothed
                joint_ent.position = smoothed

        pos = self.smoothed_positions

        # 2. Update bone cylinder linkages
        self.bones["neck"].connect(pos["mid_shoulder"], pos["head"])
        self.bones["clavicle_r"].connect(pos["mid_shoulder"], pos["right_shoulder"])
        self.bones["clavicle_l"].connect(pos["mid_shoulder"], pos["left_shoulder"])
        self.bones["humerus_r"].connect(pos["right_shoulder"], pos["right_elbow"])
        self.bones["humerus_l"].connect(pos["left_shoulder"], pos["left_elbow"])
        self.bones["forearm_r"].connect(pos["right_elbow"], pos["right_wrist"])
        self.bones["forearm_l"].connect(pos["left_elbow"], pos["left_wrist"])
        self.bones["spine"].connect(pos["mid_shoulder"], pos["mid_hip"])
        self.bones["pelvis_r"].connect(pos["mid_hip"], pos["right_hip"])
        self.bones["pelvis_l"].connect(pos["mid_hip"], pos["left_hip"])


# ======================================================================================
# 5. MAIN 3D APPLICATION RUNNER
# ======================================================================================

def main():
    print("==========================================================================")
    print(" PHYSIOSIS: REAL-TIME 3D POSE MIRROR & BIOMECHANICAL SKELETON TRACKER")
    print("==========================================================================")
    print("[1] Initializing background MediaPipe vision thread...")

    state_hub = PoseStateHub()
    worker = MediaPipePoseWorker(state_hub, camera_index=0)
    worker.start()

    print("[2] Initializing Ursina 3D graphics canvas...")
    app = Ursina(
        title="Physiosis 3D Biomechanical Skeleton Mirror",
        borderless=False,
        fullscreen=False,
        vsync=True,
    )
    window.size = (1100, 750)
    window.color = color.rgb(14, 18, 24)

    # 3D Lighting & Atmosphere
    DirectionalLight(shadows=True, rotation=(45, -45, 45))
    AmbientLight(color=color.rgba(160, 170, 190, 120))

    # 3D Grid Floor
    Entity(
        model='plane',
        scale=(15, 1, 15),
        position=(0, -2.2, 0),
        color=color.rgb(22, 28, 38),
    )
    # Coordinate grid lines
    for i in range(-7, 8):
        Entity(model='cube', scale=(15, 0.01, 0.02), position=(0, -2.19, i), color=color.rgb(35, 45, 60))
        Entity(model='cube', scale=(0.02, 0.01, 15), position=(i, -2.19, 0), color=color.rgb(35, 45, 60))

    # Camera Setup & Interactive Orbit Controls
    camera.position = (0, 0, -5.5)
    camera.rotation = (0, 0, 0)
    EditorCamera(rotation_speed=120, pan_speed=(10, 10), zoom_speed=1.5)

    # Instantiate the Articulated Skeleton Rig
    skeleton_rig = SkeletonRig3D()

    # UI Overlay in 3D Window
    ui_title = Text(
        text="PHYSIOSIS 3D SKELETON MIRROR",
        position=(-0.85, 0.45),
        scale=1.4,
        color=color.cyan
    )
    ui_status = Text(
        text="STATUS: INITIALIZING",
        position=(-0.85, 0.40),
        scale=1.0,
        color=color.white
    )
    ui_telemetry = Text(
        text="R ARM ELEVATION: 0.0°  |  L ARM ELEVATION: 0.0°",
        position=(-0.85, 0.35),
        scale=1.1,
        color=color.rgb(255, 215, 0)
    )
    ui_hints = Text(
        text="[Orbit: Right Click + Drag  |  Pan: Middle Click  |  Zoom: Scroll  |  Quit: Q / ESC]",
        position=(-0.85, -0.45),
        scale=0.9,
        color=color.gray
    )

    # Per-frame Ursina Update Loop
    def update():
        if not state_hub.is_running():
            application.quit()
            return

        packet = state_hub.get_snapshot()

        # Update 3D skeleton joints and bone linkages
        skeleton_rig.update(packet)

        # Update UI text
        status_col = color.green if packet.is_tracking else color.orange
        ui_status.text = f"STATUS: {packet.status_message.upper()} ({packet.fps:.1f} FPS)"
        ui_status.color = status_col

        ui_telemetry.text = (
            f"RIGHT ARM ELEVATION: {packet.right_arm_elevation:5.1f}°  |  "
            f"LEFT ARM ELEVATION: {packet.left_arm_elevation:5.1f}°"
        )

    # Input listener for Ursina window
    def input(key):
        if key in ['q', 'escape', 'q down', 'escape down']:
            print("[Main3D] Exiting application...")
            state_hub.stop()
            application.quit()

    app.run()

    # Ensure worker stops on exit
    state_hub.stop()
    worker.join(timeout=1.5)
    print("[Main3D] Application closed cleanly.")


if __name__ == '__main__':
    main()
