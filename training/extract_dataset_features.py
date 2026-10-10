"""
extract_dataset_features.py
High-Throughput YOLO11n-Pose CUDA Dataset Extraction Pipeline (ML Training Patch 3).

Processes videos from PHYSIO-DATASET:
  - 9 Exercise Classes
  - 31 Unique Subjects
  - Batch inference on RTX 4070 Laptop GPU (cuda:0)
  - Scale & translation body-normalized kinematics (76 dimensions per frame)
  - 64-step sliding windows (~3.2 - 4.2s temporal window) with 75% overlap
  - Strict subject metadata preservation for leak-free train/val/test splits
"""

import os
import re
import time
import argparse
import numpy as np
import sys

project_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if project_root not in sys.path:
    sys.path.insert(0, project_root)

import cv2
import torch
from ultralytics import YOLO
from training.features import extract_frame_features, extract_temporal_features

# Canonical 9 PHYSIO-DATASET Exercise Classes
EXERCISE_CLASSES = [
    'ankle',
    'Arm_Circumduction',
    'ballpress',
    'cross-body_shoulder_stretch',
    'isoetric_rotation',
    'isoetric_side_bending',
    'Shoulder_Abduction',
    'Shoulder_Flexion',
    'Wrist-extension-stretch',
]

CLASS_TO_IDX = {cls: idx for idx, cls in enumerate(EXERCISE_CLASSES)}
IDX_TO_CLASS = {idx: cls for idx, cls in enumerate(EXERCISE_CLASSES)}


def parse_video_metadata(video_path: str, dataset_root: str):
    """
    Extracts class name, subject ID, side, and augmentation tag from video path.
    """
    rel_path = os.path.relpath(video_path, dataset_root)
    parts = rel_path.replace('\\', '/').split('/')
    cls_name = parts[0]
    filename = os.path.basename(video_path)

    # Subject ID matching: _(\d{3})
    m_subj = re.search(r'_(\d{3})', filename)
    subject_id = m_subj.group(1) if m_subj else '000'

    # Side matching
    side = 'BILATERAL'
    if 'LEFT' in filename or (len(parts) > 1 and parts[1].upper() == 'LEFT'):
        side = 'LEFT'
    elif 'RIGHT' in filename or (len(parts) > 1 and parts[1].upper() == 'RIGHT'):
        side = 'RIGHT'

    # Augmentation check
    is_augmented = any(
        aug in filename
        for aug in [
            'low_light',
            'extreme_low_light',
            'high_jitter',
            'low_jitter',
            'low_resolution',
            'motion_blur',
            'synthetic_shadows',
        ]
    )

    return {
        'class_name': cls_name,
        'class_idx': CLASS_TO_IDX.get(cls_name, -1),
        'subject_id': subject_id,
        'side': side,
        'is_augmented': is_augmented,
        'filename': filename,
        'video_path': video_path,
    }


def process_single_video(
    video_path: str,
    model: YOLO,
    device: str = 'cuda:0',
    frame_stride: int = 2,
    batch_size: int = 32,
):
    """
    Reads a video file with frame_stride, runs batched YOLO11n-Pose CUDA,
    and returns array of keypoints (N_frames, 17, 3).
    """
    cap = cv2.VideoCapture(video_path)
    frames = []
    frame_idx = 0
    while cap.isOpened():
        ret, frame = cap.read()
        if not ret:
            break
        if frame_idx % frame_stride == 0:
            frames.append(frame)
        frame_idx += 1
    cap.release()

    if len(frames) == 0:
        return None

    # Batched inference on RTX 4070
    all_kps = []
    for i in range(0, len(frames), batch_size):
        batch = frames[i : i + batch_size]
        results = model(batch, device=device, verbose=False)
        for res in results:
            if res.keypoints is not None and len(res.keypoints.data) > 0:
                kp = res.keypoints.data[0].cpu().numpy()  # (17, 3)
                all_kps.append(kp)
            else:
                all_kps.append(np.zeros((17, 3), dtype=np.float32))

    return np.array(all_kps, dtype=np.float32)


def slice_into_windows(
    sequence: np.ndarray,
    window_size: int = 64,
    stride: int = 16,
):
    """
    Slices a continuous (N, D) feature array into overlapping windows (W, window_size, D).
    """
    N, D = sequence.shape
    if N < window_size:
        # Repeat/pad sequence to minimum window size
        repeats = int(np.ceil(window_size / max(1, N)))
        tiled = np.tile(sequence, (repeats, 1))[:window_size]
        return tiled[np.newaxis, ...]

    windows = []
    for start in range(0, N - window_size + 1, stride):
        windows.append(sequence[start : start + window_size])

    return np.array(windows, dtype=np.float32)


def run_extraction(
    dataset_root: str = r'D:\PhysiosisData\PHYSIO-DATASET\PHYIO-DATASET_blur_augment',
    output_dir: str = r'c:\Physiosis\data\processed_features',
    model_path: str = 'yolo11n-pose.pt',
    device: str = 'cuda:0',
    include_augmentations: bool = True,
    max_aug_per_take: int = 2,
    window_size: int = 64,
    window_stride: int = 16,
):
    """
    Main extraction orchestrator across all dataset videos.
    """
    os.makedirs(output_dir, exist_ok=True)
    print(f'[Extraction] Initializing YOLO11n-Pose model on {device}...')
    model = YOLO(model_path)

    # 1. Discover all candidate videos
    all_video_files = []
    for root, dirs, files in os.walk(dataset_root):
        for f in files:
            if f.endswith('.mp4'):
                all_video_files.append(os.path.join(root, f))

    print(f'[Extraction] Discovered {len(all_video_files)} total video files in dataset.')

    # 2. Filter videos: all clean + up to max_aug_per_take augmentations
    selected_videos = []
    aug_counts_per_take = {}

    for vpath in all_video_files:
        meta = parse_video_metadata(vpath, dataset_root)
        if meta['class_idx'] == -1:
            continue

        take_key = f"{meta['class_name']}_{meta['side']}_{meta['subject_id']}"
        if not meta['is_augmented']:
            selected_videos.append(meta)
        elif include_augmentations:
            # Limit augmentations per take to maintain balance while gaining noise robustness
            current_aug = aug_counts_per_take.get(take_key, 0)
            if current_aug < max_aug_per_take:
                aug_counts_per_take[take_key] = current_aug + 1
                selected_videos.append(meta)

    print(f'[Extraction] Filtered to {len(selected_videos)} videos for extraction (all clean + sampled augmentations).')

    # 3. Process videos and slice into temporal windows
    collected_windows = []
    collected_labels = []
    collected_subjects = []
    collected_sides = []
    collected_augmented = []

    t_start = time.perf_counter()
    skipped_count = 0

    for idx, meta in enumerate(selected_videos):
        t0 = time.perf_counter()
        kps = process_single_video(meta['video_path'], model, device=device, frame_stride=2)

        if kps is None or len(kps) < 15:
            skipped_count += 1
            continue

        # Quality filtering: check mean confidence
        mean_conf = np.mean(kps[:, :, 2])
        if mean_conf < 0.25:
            skipped_count += 1
            continue

        # Extract spatial & temporal features
        spatial_feats = np.array([extract_frame_features(kp) for kp in kps], dtype=np.float32)
        temporal_feats = extract_temporal_features(spatial_feats, fps=15.0)

        # Slice into windows
        windows = slice_into_windows(temporal_feats, window_size=window_size, stride=window_stride)

        for w in windows:
            collected_windows.append(w)
            collected_labels.append(meta['class_idx'])
            collected_subjects.append(meta['subject_id'])
            collected_sides.append(meta['side'])
            collected_augmented.append(meta['is_augmented'])

        elapsed = time.perf_counter() - t0
        fps_equiv = len(kps) * 2 / max(0.001, elapsed)

        if (idx + 1) % 25 == 0 or (idx + 1) == len(selected_videos):
            total_elapsed = time.perf_counter() - t_start
            print(
                f'[{idx+1:4d}/{len(selected_videos)}] Windows: {len(collected_windows):5d} | '
                f'{meta["class_name"]:28s} subj={meta["subject_id"]} ({fps_equiv:.1f} FPS) | '
                f'Total Time: {total_elapsed:.1f}s'
            )

    X = np.array(collected_windows, dtype=np.float32)
    y = np.array(collected_labels, dtype=np.int64)
    subjects = np.array(collected_subjects)
    sides = np.array(collected_sides)
    is_augmented = np.array(collected_augmented, dtype=bool)

    output_file = os.path.join(output_dir, 'physio_windows_dataset.npz')
    print(f'\n[Extraction] Saving {len(X)} windows to {output_file}...')
    np.savez_compressed(
        output_file,
        X=X,
        y=y,
        subjects=subjects,
        sides=sides,
        is_augmented=is_augmented,
        classes=EXERCISE_CLASSES,
        feature_dim=X.shape[-1],
        window_size=X.shape[1],
    )

    print(f'[Extraction] COMPLETED in {time.perf_counter() - t_start:.1f}s!')
    print(f'  Dataset Tensor Shape: {X.shape} (Windows, TimeSteps, Features)')
    print(f'  Unique Subjects: {len(np.unique(subjects))} {np.unique(subjects)}')
    print(f'  Class Distribution: {np.bincount(y)}')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description='Extract features from PHYSIO-DATASET videos.')
    parser.add_argument('--dataset-root', type=str, default=r'D:\PhysiosisData\PHYSIO-DATASET\PHYIO-DATASET_blur_augment')
    parser.add_argument('--output-dir', type=str, default=r'c:\Physiosis\data\processed_features')
    parser.add_argument('--max-aug', type=int, default=2, help='Max augmentations per take to sample')
    parser.add_argument('--window-size', type=int, default=64)
    parser.add_argument('--window-stride', type=int, default=16)
    args = parser.parse_args()

    run_extraction(
        dataset_root=args.dataset_root,
        output_dir=args.output_dir,
        max_aug_per_take=args.max_aug,
        window_size=args.window_size,
        window_stride=args.window_stride,
    )
