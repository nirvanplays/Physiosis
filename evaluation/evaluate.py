"""
evaluate.py
Rigorous Unseen-Subject Evaluation and Latency Benchmarking (ML Training Patch 3).

Evaluates models on completely held-out test subjects:
  - Accuracy
  - Macro F1 & Weighted F1
  - 9x9 Confusion Matrix
  - Per-Class Precision, Recall, F1, and Support
  - GPU Inference Latency (Mean, Median, P95 on RTX 4070 Laptop GPU)
  - Exports structured evaluation/report.json
"""

import os
import time
import json
import argparse
import numpy as np
import sys
import torch
from sklearn.metrics import (
    accuracy_score,
    f1_score,
    precision_score,
    recall_score,
    confusion_matrix,
    classification_report,
)

project_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if project_root not in sys.path:
    sys.path.insert(0, project_root)

from training.dataset import create_subject_aware_dataloaders
from training.models import build_model



def measure_inference_latency(model, input_dim, sequence_length=64, device='cuda:0', iterations=200):
    """
    Measures GPU inference latency for single-sample production execution (batch_size=1).
    """
    model.eval()
    dummy = torch.randn(1, sequence_length, input_dim, device=device)

    # Warmup
    for _ in range(25):
        with torch.no_grad():
            _ = model(dummy)
    if 'cuda' in device:
        torch.cuda.synchronize()

    timings = []
    for _ in range(iterations):
        t0 = time.perf_counter()
        with torch.no_grad():
            _ = model(dummy)
        if 'cuda' in device:
            torch.cuda.synchronize()
        timings.append((time.perf_counter() - t0) * 1000)

    timings = np.array(timings)
    return {
        'median_ms': float(np.median(timings)),
        'mean_ms': float(np.mean(timings)),
        'p95_ms': float(np.percentile(timings, 95)),
        'min_ms': float(np.min(timings)),
        'max_ms': float(np.max(timings)),
    }


def evaluate_model(checkpoint_path: str, test_loader, classes: list, device: str = 'cuda:0'):
    """
    Runs full evaluation on unseen test subjects and measures latency.
    """
    ckpt = torch.load(checkpoint_path, map_location=device)
    arch = ckpt['architecture']
    input_dim = ckpt['input_dim']
    num_classes = ckpt['num_classes']

    model = build_model(arch, input_dim=input_dim, num_classes=num_classes)
    model.load_state_dict(ckpt['state_dict'])
    model.to(device)
    model.eval()

    all_preds = []
    all_targets = []
    all_probs = []

    with torch.no_grad():
        for batch_x, batch_y in test_loader:
            batch_x = batch_x.to(device)
            logits = model(batch_x)
            probs = torch.softmax(logits, dim=-1).cpu().numpy()
            preds = logits.argmax(dim=-1).cpu().numpy()

            all_preds.extend(preds)
            all_targets.extend(batch_y.numpy())
            all_probs.extend(probs)

    all_preds = np.array(all_preds)
    all_targets = np.array(all_targets)

    # Core Metrics
    acc = float(accuracy_score(all_targets, all_preds))
    macro_f1 = float(f1_score(all_targets, all_preds, average='macro'))
    weighted_f1 = float(f1_score(all_targets, all_preds, average='weighted'))
    macro_prec = float(precision_score(all_targets, all_preds, average='macro', zero_division=0))
    macro_rec = float(recall_score(all_targets, all_preds, average='macro', zero_division=0))

    # Confusion Matrix
    cm = confusion_matrix(all_targets, all_preds, labels=list(range(num_classes)))

    # Per-Class Metrics
    clf_rep = classification_report(all_targets, all_preds, target_names=classes, output_dict=True, zero_division=0)
    per_class = {
        cls: {
            'precision': float(clf_rep[cls]['precision']),
            'recall': float(clf_rep[cls]['recall']),
            'f1_score': float(clf_rep[cls]['f1-score']),
            'support': int(clf_rep[cls]['support']),
        }
        for cls in classes if cls in clf_rep
    }

    # Model Size & Parameter Count
    total_params = sum(p.numel() for p in model.parameters())
    file_size_mb = os.path.getsize(checkpoint_path) / (1024 * 1024)

    # Latency Benchmark
    latency = measure_inference_latency(model, input_dim=input_dim, device=device)

    return {
        'architecture': arch,
        'checkpoint_path': checkpoint_path,
        'accuracy': acc,
        'macro_f1': macro_f1,
        'weighted_f1': weighted_f1,
        'macro_precision': macro_prec,
        'macro_recall': macro_rec,
        'latency': latency,
        'parameters': total_params,
        'file_size_mb': file_size_mb,
        'confusion_matrix': cm.tolist(),
        'per_class': per_class,
    }


def main():
    parser = argparse.ArgumentParser(description='Evaluate trained models on unseen test subjects.')
    parser.add_argument('--npz-path', type=str, default=r'c:\Physiosis\data\processed_features\physio_windows_dataset.npz')
    parser.add_argument('--models-dir', type=str, default=r'c:\Physiosis\models')
    parser.add_argument('--output-dir', type=str, default=r'c:\Physiosis\evaluation')
    args = parser.parse_args()

    device = 'cuda:0' if torch.cuda.is_available() else 'cpu'
    os.makedirs(args.output_dir, exist_ok=True)

    print('[Evaluation] Loading dataset for unseen test evaluation...')
    train_loader, val_loader, test_loader, split_info = create_subject_aware_dataloaders(args.npz_path)

    classes = split_info['classes']
    checkpoints = [
        os.path.join(args.models_dir, 'tcn_best.pt'),
        os.path.join(args.models_dir, 'lstm_best.pt'),
        os.path.join(args.models_dir, 'transformer_best.pt'),
    ]

    report = {
        'split_info': {
            'classes': classes,
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

    for ckpt_path in checkpoints:
        if not os.path.exists(ckpt_path):
            print(f'[Evaluation] Skipping {ckpt_path} (not found).')
            continue

        arch_name = os.path.basename(ckpt_path).replace('_best.pt', '').upper()
        print(f"\n{'=' * 65}")
        print(f"  EVALUATING {arch_name} on Unseen Test Subjects {split_info['test_subjects']}")
        print(f"{'=' * 65}")

        res = evaluate_model(ckpt_path, test_loader, classes, device=device)
        report['models'][arch_name] = res

        print(f"Accuracy:        {res['accuracy']*100:.2f}%")
        print(f"Macro F1:        {res['macro_f1']:.4f}")
        print(f"Median Latency:  {res['latency']['median_ms']:.2f} ms (P95: {res['latency']['p95_ms']:.2f} ms)")
        print(f"Parameters:      {res['parameters']:,}")
        print(f"Model Size:      {res['file_size_mb']:.2f} MB")

        # Composite selection criterion: Balanced Accuracy & Macro F1
        composite_score = res['accuracy'] * 0.5 + res['macro_f1'] * 0.5
        if composite_score > best_score:
            best_score = composite_score
            best_arch = arch_name

    report['best_model'] = best_arch
    print(f"\n[Evaluation] Champion Architecture Selected: {best_arch} (Composite Score: {best_score:.4f})")

    report_path = os.path.join(args.output_dir, 'report.json')
    with open(report_path, 'w') as f:
        json.dump(report, f, indent=2, default=str)

    print(f'[Evaluation] Report saved to {report_path}')


if __name__ == '__main__':
    main()
