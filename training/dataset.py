"""
dataset.py
PyTorch Dataset and Subject-Aware DataLoaders (ML Training Patch 3).

Guarantees:
  - Zero subject leakage: Strict subject-level separation between train, val, and test.
  - Normalization parameters (mean, std) calculated strictly from training split only.
  - Runtime kinematic data augmentations for training split (temporal jitter, magnitude scaling).
"""

import os
import numpy as np
import torch
from torch.utils.data import Dataset, DataLoader

DEFAULT_VAL_SUBJECTS = ['012', '013', '014']
DEFAULT_TEST_SUBJECTS = ['015', '016', '017']


class PhysioTemporalDataset(Dataset):
    """
    PyTorch Dataset representing temporal kinematic sequences [T, D].
    """

    def __init__(
        self,
        X: np.ndarray,
        y: np.ndarray,
        subjects: np.ndarray,
        mean: np.ndarray = None,
        std: np.ndarray = None,
        augment: bool = False,
    ):
        self.X = X.copy()
        self.y = torch.tensor(y, dtype=torch.long)
        self.subjects = subjects
        self.augment = augment

        # Feature normalization
        if mean is not None and std is not None:
            self.mean = mean
            self.std = np.where(std < 1e-6, 1.0, std)
            self.X = (self.X - self.mean) / self.std
        else:
            self.mean = None
            self.std = None

    def __len__(self):
        return len(self.X)

    def __getitem__(self, idx):
        sample = self.X[idx].copy()

        # Training augmentation: subtle noise jitter and magnitude perturbation
        if self.augment:
            # Gaussian noise on features
            noise = np.random.normal(0.0, 0.015, sample.shape).astype(np.float32)
            sample += noise
            # Scale perturbation (0.96 to 1.04)
            scale = np.random.uniform(0.96, 1.04)
            sample *= scale

        return torch.tensor(sample, dtype=torch.float32), self.y[idx]


def create_subject_aware_dataloaders(
    npz_path: str,
    batch_size: int = 64,
    val_subjects: list = None,
    test_subjects: list = None,
    num_workers: int = 0,
):
    """
    Loads pre-extracted npz features, performs strict subject-level split,
    computes normalizers on train split, and returns train, val, test DataLoaders.
    """
    if not os.path.exists(npz_path):
        raise FileNotFoundError(f'Feature file {npz_path} does not exist. Run extraction first.')

    val_subjects = val_subjects or DEFAULT_VAL_SUBJECTS
    test_subjects = test_subjects or DEFAULT_TEST_SUBJECTS

    data = np.load(npz_path, allow_pickle=True)
    X = data['X']              # (N, 64, D)
    y = data['y']              # (N,)
    subjects = data['subjects']  # (N,)
    classes = list(data['classes'])

    all_subjects = set(np.unique(subjects))
    val_set = set(val_subjects)
    test_set = set(test_subjects)
    train_set = all_subjects - val_set - test_set

    # Assert strict zero leakage
    assert len(train_set & val_set) == 0, 'Train and Val subjects overlap!'
    assert len(train_set & test_set) == 0, 'Train and Test subjects overlap!'
    assert len(val_set & test_set) == 0, 'Val and Test subjects overlap!'

    train_mask = np.isin(subjects, list(train_set))
    val_mask = np.isin(subjects, list(val_set))
    test_mask = np.isin(subjects, list(test_set))

    X_train, y_train = X[train_mask], y[train_mask]
    X_val, y_val = X[val_mask], y[val_mask]
    X_test, y_test = X[test_mask], y[test_mask]

    # Compute normalization statistics STRICTLY from train set
    # Reshape (N_train, T, D) -> (-1, D)
    flat_train = X_train.reshape(-1, X_train.shape[-1])
    norm_mean = np.mean(flat_train, axis=0, keepdims=True)
    norm_std = np.std(flat_train, axis=0, keepdims=True)

    train_ds = PhysioTemporalDataset(
        X_train, y_train, subjects[train_mask], mean=norm_mean, std=norm_std, augment=True
    )
    val_ds = PhysioTemporalDataset(
        X_val, y_val, subjects[val_mask], mean=norm_mean, std=norm_std, augment=False
    )
    test_ds = PhysioTemporalDataset(
        X_test, y_test, subjects[test_mask], mean=norm_mean, std=norm_std, augment=False
    )

    train_loader = DataLoader(
        train_ds, batch_size=batch_size, shuffle=True, num_workers=num_workers, pin_memory=True
    )
    val_loader = DataLoader(
        val_ds, batch_size=batch_size, shuffle=False, num_workers=num_workers, pin_memory=True
    )
    test_loader = DataLoader(
        test_ds, batch_size=batch_size, shuffle=False, num_workers=num_workers, pin_memory=True
    )

    split_info = {
        'classes': classes,
        'num_classes': len(classes),
        'input_dim': X.shape[-1],
        'sequence_length': X.shape[1],
        'train_samples': len(train_ds),
        'val_samples': len(val_ds),
        'test_samples': len(test_ds),
        'train_subjects': sorted(list(train_set)),
        'val_subjects': sorted(list(val_set)),
        'test_subjects': sorted(list(test_set)),
        'norm_mean': norm_mean,
        'norm_std': norm_std,
    }

    return train_loader, val_loader, test_loader, split_info
