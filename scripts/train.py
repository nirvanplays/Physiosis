"""
train.py
PyTorch CUDA Mixed-Precision Training Pipeline (ML Training Patch 3).

Trains and benchmarks:
  - TCN
  - LSTM
  - Lightweight Transformer

Features:
  - Automatic Mixed Precision (torch.amp.autocast) on NVIDIA RTX 4070 Laptop GPU
  - VRAM tracking and GPU timing
  - Subject-aware validation monitoring
  - Cosine annealing learning rate schedule
  - Checkpoint serialization
"""

import os
import time
import argparse
import json
import torch
import torch.nn as nn
from torch.optim import AdamW
from torch.optim.lr_scheduler import CosineAnnealingLR
import sys

project_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if project_root not in sys.path:
    sys.path.insert(0, project_root)

from training.dataset import create_subject_aware_dataloaders
from training.models import build_model


def train_single_model(
    architecture: str,
    train_loader,
    val_loader,
    input_dim: int,
    num_classes: int,
    device: str = 'cuda:0',
    epochs: int = 25,
    lr: float = 1e-3,
    weight_decay: float = 1e-4,
    save_path: str = None,
):
    """
    Trains one architecture with PyTorch AMP and returns benchmark telemetry.
    """
    print(f"\n{'=' * 65}")
    print(f"  TRAINING ARCHITECTURE: {architecture.upper()} on {device}")
    print(f"{'=' * 65}")

    model = build_model(architecture, input_dim=input_dim, num_classes=num_classes)
    model.to(device)

    # Count parameters
    total_params = sum(p.numel() for p in model.parameters() if p.requires_grad)
    model_size_mb = sum(p.numel() * p.element_size() for p in model.parameters()) / (1024 * 1024)
    print(f"[{architecture}] Trainable Parameters: {total_params:,} ({model_size_mb:.2f} MB)")

    optimizer = AdamW(model.parameters(), lr=lr, weight_decay=weight_decay)
    scheduler = CosineAnnealingLR(optimizer, T_max=epochs, eta_min=1e-5)
    criterion = nn.CrossEntropyLoss(label_smoothing=0.05)
    scaler = torch.amp.GradScaler('cuda') if 'cuda' in device else None

    best_val_acc = 0.0
    best_epoch = 0
    history = {'train_loss': [], 'val_loss': [], 'val_acc': []}

    torch.cuda.reset_peak_memory_stats(device)
    t_start = time.perf_counter()

    for epoch in range(1, epochs + 1):
        # ── Train Step ──
        model.train()
        train_loss = 0.0
        train_correct = 0
        train_total = 0

        for batch_x, batch_y in train_loader:
            batch_x, batch_y = batch_x.to(device), batch_y.to(device)
            optimizer.zero_grad(set_to_none=True)

            if scaler is not None:
                with torch.amp.autocast('cuda'):
                    logits = model(batch_x)
                    loss = criterion(logits, batch_y)
                scaler.scale(loss).backward()
                scaler.unscale_(optimizer)
                torch.nn.utils.clip_grad_norm_(model.parameters(), max_norm=1.5)
                scaler.step(optimizer)
                scaler.update()
            else:
                logits = model(batch_x)
                loss = criterion(logits, batch_y)
                loss.backward()
                torch.nn.utils.clip_grad_norm_(model.parameters(), max_norm=1.5)
                optimizer.step()

            train_loss += loss.item() * batch_x.size(0)
            preds = logits.argmax(dim=-1)
            train_correct += (preds == batch_y).sum().item()
            train_total += batch_y.size(0)

        scheduler.step()

        # ── Validation Step ──
        model.eval()
        val_loss = 0.0
        val_correct = 0
        val_total = 0

        with torch.no_grad():
            for batch_x, batch_y in val_loader:
                batch_x, batch_y = batch_x.to(device), batch_y.to(device)
                if scaler is not None:
                    with torch.amp.autocast('cuda'):
                        logits = model(batch_x)
                        loss = criterion(logits, batch_y)
                else:
                    logits = model(batch_x)
                    loss = criterion(logits, batch_y)

                val_loss += loss.item() * batch_x.size(0)
                preds = logits.argmax(dim=-1)
                val_correct += (preds == batch_y).sum().item()
                val_total += batch_y.size(0)

        epoch_train_loss = train_loss / train_total
        epoch_train_acc = train_correct / train_total
        epoch_val_loss = val_loss / val_total
        epoch_val_acc = val_correct / val_total

        history['train_loss'].append(epoch_train_loss)
        history['val_loss'].append(epoch_val_loss)
        history['val_acc'].append(epoch_val_acc)

        if epoch_val_acc > best_val_acc:
            best_val_acc = epoch_val_acc
            best_epoch = epoch
            if save_path:
                torch.save(
                    {
                        'epoch': epoch,
                        'architecture': architecture,
                        'state_dict': model.state_dict(),
                        'input_dim': input_dim,
                        'num_classes': num_classes,
                        'val_acc': best_val_acc,
                    },
                    save_path,
                )

        if epoch % 5 == 0 or epoch == epochs:
            print(
                f"[{architecture:11s}] Epoch {epoch:2d}/{epochs:2d} | "
                f"Train Loss: {epoch_train_loss:.4f} Acc: {epoch_train_acc*100:5.1f}% | "
                f"Val Loss: {epoch_val_loss:.4f} Acc: {epoch_val_acc*100:5.1f}% | "
                f"Best Val: {best_val_acc*100:5.1f}% (ep {best_epoch})"
            )

    train_time = time.perf_counter() - t_start
    peak_vram_mb = torch.cuda.max_memory_allocated(device) / (1024 * 1024) if 'cuda' in device else 0.0

    print(f"[{architecture}] Finished in {train_time:.1f}s | Peak VRAM: {peak_vram_mb:.1f} MB | Best Val Acc: {best_val_acc*100:.2f}%")

    return {
        'architecture': architecture,
        'best_epoch': best_epoch,
        'best_val_acc': best_val_acc,
        'train_time_sec': train_time,
        'peak_vram_mb': peak_vram_mb,
        'total_params': total_params,
        'model_size_mb': model_size_mb,
        'history': history,
        'save_path': save_path,
    }


def main():
    parser = argparse.ArgumentParser(description='Train and benchmark temporal models.')
    parser.add_argument('--npz-path', type=str, default=r'c:\Physiosis\data\processed_features\physio_windows_dataset.npz')
    parser.add_argument('--output-dir', type=str, default=r'c:\Physiosis\models')
    parser.add_argument('--batch-size', type=int, default=64)
    parser.add_argument('--epochs', type=int, default=25)
    parser.add_argument('--lr', type=float, default=1e-3)
    args = parser.parse_args()

    device = 'cuda:0' if torch.cuda.is_available() else 'cpu'
    os.makedirs(args.output_dir, exist_ok=True)

    print('[Training] Loading dataset and constructing leak-free subject loaders...')
    train_loader, val_loader, test_loader, split_info = create_subject_aware_dataloaders(
        args.npz_path, batch_size=args.batch_size
    )

    print(f"[Training] Dataset loaded:")
    print(f"  Train: {split_info['train_samples']} samples across {len(split_info['train_subjects'])} subjects")
    print(f"  Val:   {split_info['val_samples']} samples across {len(split_info['val_subjects'])} subjects")
    print(f"  Test:  {split_info['test_samples']} samples across {len(split_info['test_subjects'])} subjects")
    print(f"  Classes: {split_info['num_classes']} {split_info['classes']}")

    results = {}
    architectures = ['TCN', 'LSTM', 'TRANSFORMER']

    for arch in architectures:
        save_path = os.path.join(args.output_dir, f"{arch.lower()}_best.pt")
        res = train_single_model(
            architecture=arch,
            train_loader=train_loader,
            val_loader=val_loader,
            input_dim=split_info['input_dim'],
            num_classes=split_info['num_classes'],
            device=device,
            epochs=args.epochs,
            lr=args.lr,
            save_path=save_path,
        )
        results[arch] = res

    # Save summary metadata
    summary_path = os.path.join(args.output_dir, 'training_summary.json')
    serializable = {
        k: {sk: sv for sk, sv in v.items() if sk != 'history'} for k, v in results.items()
    }
    with open(summary_path, 'w') as f:
        json.dump(serializable, f, indent=2)

    print(f"\n[Training] Complete. Summary written to {summary_path}")


if __name__ == '__main__':
    main()
