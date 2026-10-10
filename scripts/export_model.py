"""
export_model.py
Production Model Exporter for Temporal Movement Intelligence (ML Training Patch 3).

Exports:
  - Champion model weights (models/physiosis_temporal_classifier.pt)
  - Production metadata & normalizer parameters (models/model_metadata.json)
  - TorchScript trace for production deployment (models/physiosis_temporal_classifier.torchscript.pt)
"""

import os
import json
import argparse
import sys
import torch
import numpy as np

project_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if project_root not in sys.path:
    sys.path.insert(0, project_root)

from training.dataset import create_subject_aware_dataloaders
from training.models import build_model



def export_champion_model(
    report_path: str = r'c:\Physiosis\evaluation\report.json',
    models_dir: str = r'c:\Physiosis\models',
    npz_path: str = r'c:\Physiosis\data\processed_features\physio_windows_dataset.npz',
):
    if not os.path.exists(report_path):
        raise FileNotFoundError(f"Report not found at {report_path}. Run evaluation first.")

    with open(report_path, 'r') as f:
        report = json.load(f)

    champion_arch = report.get('best_model') or 'TCN'
    print(f"[Export] Champion architecture: {champion_arch}")

    ckpt_path = os.path.join(models_dir, f"{champion_arch.lower()}_best.pt")
    ckpt = torch.load(ckpt_path, map_location='cpu')

    input_dim = ckpt['input_dim']
    num_classes = ckpt['num_classes']

    model = build_model(champion_arch, input_dim=input_dim, num_classes=num_classes)
    model.load_state_dict(ckpt['state_dict'])
    model.eval()

    # Load normalization statistics
    data = np.load(npz_path, allow_pickle=True)
    classes = [str(c) for c in data['classes']]

    # Compute train normalization parameters

    _, _, _, split_info = create_subject_aware_dataloaders(npz_path)
    norm_mean = split_info['norm_mean'].tolist()
    norm_std = split_info['norm_std'].tolist()

    # 1. Export production PyTorch model package
    prod_model_path = os.path.join(models_dir, 'physiosis_temporal_classifier.pt')
    torch.save(
        {
            'architecture': champion_arch,
            'state_dict': model.state_dict(),
            'input_dim': input_dim,
            'sequence_length': 64,
            'num_classes': num_classes,
            'classes': classes,
            'norm_mean': norm_mean,
            'norm_std': norm_std,
            'evaluation_metrics': report['models'].get(champion_arch, {}),
        },
        prod_model_path,
    )
    print(f"[Export] Production weights saved: {prod_model_path}")

    # 2. Export TorchScript trace for production C++/sidecar deployment
    try:
        dummy_input = torch.randn(1, 64, input_dim)
        traced_model = torch.jit.trace(model, dummy_input)
        ts_path = os.path.join(models_dir, 'physiosis_temporal_classifier.torchscript.pt')
        traced_model.save(ts_path)
        print(f"[Export] TorchScript model saved: {ts_path}")
    except Exception as e:
        print(f"[Export] TorchScript tracing skipped: {e}")

    # 3. Export JSON Metadata for Web/Client/Orchestrator
    meta = {
        'model_name': f'Physiosis-Temporal-{champion_arch}',
        'architecture': champion_arch,
        'input_dimensions': {
            'time_steps': 64,
            'feature_count': input_dim,
        },
        'num_classes': num_classes,
        'classes': classes,
        'class_to_idx': {cls: i for i, cls in enumerate(classes)},
        'performance': {
            'test_accuracy': report['models'].get(champion_arch, {}).get('accuracy'),
            'macro_f1': report['models'].get(champion_arch, {}).get('macro_f1'),
            'median_latency_ms': report['models'].get(champion_arch, {}).get('latency', {}).get('median_ms'),
            'p95_latency_ms': report['models'].get(champion_arch, {}).get('latency', {}).get('p95_ms'),
        },
        'normalization': {
            'mean': norm_mean[0],
            'std': norm_std[0],
        },
        'disclaimer': report.get('disclaimer', ''),
    }

    meta_path = os.path.join(models_dir, 'model_metadata.json')
    with open(meta_path, 'w') as f:
        json.dump(meta, f, indent=2, default=str)
    print(f"[Export] Model metadata written to: {meta_path}")

    print("\n[Export] SUCCESS: Champion model successfully prepared for production.")


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description='Export champion model.')
    parser.add_argument('--report-path', type=str, default=r'c:\Physiosis\evaluation\report.json')
    parser.add_argument('--models-dir', type=str, default=r'c:\Physiosis\models')
    parser.add_argument('--npz-path', type=str, default=r'c:\Physiosis\data\processed_features\physio_windows_dataset.npz')
    args = parser.parse_args()

    export_champion_model(args.report_path, args.models_dir, args.npz_path)
