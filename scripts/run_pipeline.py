"""
run_pipeline.py
End-to-End Orchestrator for PHYSIOSIS ML TRAINING PATCH 3.

Executes:
  1. YOLO11n-Pose CUDA Video Feature Extraction
  2. Subject-Aware Leak-Free Dataset Partitioning
  3. PyTorch Mixed-Precision (AMP) Training of TCN, LSTM, and Transformer
  4. Unseen-Subject Evaluation and Latency Benchmarking
  5. Champion Model Selection & Export
"""

import os
import sys
import time

project_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if project_root not in sys.path:
    sys.path.insert(0, project_root)

from training.extract_dataset_features import run_extraction
from scripts.train import train_single_model
from training.dataset import create_subject_aware_dataloaders
from evaluation.evaluate import evaluate_model
from scripts.export_model import export_champion_model
import argparse
import json
import torch


def main():
    parser = argparse.ArgumentParser(description="Run Physiosis ML Training Pipeline")
    parser.add_argument("--max-aug", type=int, default=0, help="Max augmentations per take (0 = clean only, 1 = clean + 1 aug)")
    parser.add_argument("--epochs", type=int, default=15, help="Training epochs")
    parser.add_argument("--batch-size", type=int, default=64, help="Batch size")
    args = parser.parse_args()

    print("=" * 70)
    print("  PHYSIOSIS — ML TRAINING PATCH 3: END-TO-END PIPELINE")
    print("  NVIDIA RTX 4070 Laptop GPU (CUDA)")
    print("=" * 70)

    dataset_root = r"D:\PhysiosisData\PHYSIO-DATASET\PHYIO-DATASET_blur_augment"
    output_dir = r"c:\Physiosis\data\processed_features"
    npz_path = os.path.join(output_dir, "physio_windows_dataset.npz")
    models_dir = r"c:\Physiosis\models"
    eval_dir = r"c:\Physiosis\evaluation"
    report_path = os.path.join(eval_dir, "report.json")

    device = "cuda:0" if torch.cuda.is_available() else "cpu"
    print(f"[Pipeline] Compute Device: {device} ({torch.cuda.get_device_name(0) if torch.cuda.is_available() else 'None'})")

    # ── STAGE 1: FEATURE EXTRACTION ───────────────────────────────────────────
    if not os.path.exists(npz_path):
        print("\n>>> STAGE 1: Extracting YOLO11n-Pose CUDA features from videos...")
        run_extraction(
            dataset_root=dataset_root,
            output_dir=output_dir,
            max_aug_per_take=args.max_aug,
            window_size=64,
            window_stride=16,
        )
    else:
        print(f"\n>>> STAGE 1: Found existing feature cache at {npz_path}. Skipping re-extraction.")

    # ── STAGE 2: SUBJECT-AWARE DATA LOADERS ───────────────────────────────────
    print("\n>>> STAGE 2: Loading dataset with strict subject-level isolation...")
    train_loader, val_loader, test_loader, split_info = create_subject_aware_dataloaders(
        npz_path, batch_size=args.batch_size
    )
    print(f"  Train Set: {split_info['train_samples']} samples (Subjects: {split_info['train_subjects']})")
    print(f"  Val Set:   {split_info['val_samples']} samples (Subjects: {split_info['val_subjects']})")
    print(f"  Test Set:  {split_info['test_samples']} samples (Subjects: {split_info['test_subjects']})")
    print(f"  Classes:   {split_info['num_classes']} {split_info['classes']}")

    # ── STAGE 3: MODEL TRAINING & BENCHMARKING ────────────────────────────────
    print("\n>>> STAGE 3: Training TCN, LSTM, and Transformer with PyTorch AMP...")
    architectures = ['TCN', 'LSTM', 'TRANSFORMER']
    train_results = {}

    for arch in architectures:
        save_path = os.path.join(models_dir, f"{arch.lower()}_best.pt")
        res = train_single_model(
            architecture=arch,
            train_loader=train_loader,
            val_loader=val_loader,
            input_dim=split_info['input_dim'],
            num_classes=split_info['num_classes'],
            device=device,
            epochs=args.epochs,
            lr=1e-3,
            save_path=save_path,
        )
        train_results[arch] = res

    # ── STAGE 4: EVALUATION ON UNSEEN TEST SUBJECTS ───────────────────────────
    print("\n>>> STAGE 4: Evaluating on completely held-out test subjects...")
    os.makedirs(eval_dir, exist_ok=True)
    report = {
        'split_info': {
            'classes': split_info['classes'],
            'train_subjects': split_info['train_subjects'],
            'val_subjects': split_info['val_subjects'],
            'test_subjects': split_info['test_subjects'],
            'train_samples': split_info['train_samples'],
            'val_samples': split_info['val_samples'],
            'test_samples': split_info['test_samples'],
        },
        'models': {},
        'best_model': None,
        'disclaimer': 'Advisory research and engineering benchmark only. Do not claim clinical validity from dataset performance alone.',
    }

    best_score = -1.0
    best_arch = None

    for arch in architectures:
        ckpt_path = os.path.join(models_dir, f"{arch.lower()}_best.pt")
        res = evaluate_model(ckpt_path, test_loader, split_info['classes'], device=device)
        report['models'][arch] = res

        composite = res['accuracy'] * 0.5 + res['macro_f1'] * 0.5
        print(f"[{arch}] Test Accuracy: {res['accuracy']*100:.2f}% | Macro F1: {res['macro_f1']:.4f} | Latency: {res['latency']['median_ms']:.2f}ms")

        if composite > best_score:
            best_score = composite
            best_arch = arch

    report['best_model'] = best_arch
    with open(report_path, 'w') as f:
        json.dump(report, f, indent=2)
    print(f"\n[Pipeline] Champion Model: {best_arch} (Report saved to {report_path})")

    # ── STAGE 5: CHAMPION EXPORT ──────────────────────────────────────────────
    print("\n>>> STAGE 5: Exporting champion model for Physiosis production inference...")
    export_champion_model(report_path, models_dir, npz_path)

    print("\n" + "=" * 70)
    print("  PHYSIOSIS — ML TRAINING PATCH 3 PIPELINE COMPLETED SUCCESSFULLY")
    print("=" * 70)


if __name__ == '__main__':
    main()
