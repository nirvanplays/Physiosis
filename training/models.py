"""
models.py
PyTorch Temporal Neural Architectures for Exercise Recognition (ML Training Patch 3).

Implements:
  1. TCNClassifier: Dilated 1D Residual Temporal Convolutional Network
  2. LSTMClassifier: Recurrent Long Short-Term Memory Network with temporal pooling
  3. TransformerClassifier: Lightweight Multi-Head Self-Attention Sequence Encoder
"""

import math
import torch
import torch.nn as nn
import torch.nn.functional as F


# ── 1. TEMPORAL CONVOLUTIONAL NETWORK (TCN) ───────────────────────────────────

class TemporalBlock(nn.Module):
    """
    Dilated causal 1D convolution block with weight normalization and residual connection.
    """

    def __init__(self, in_channels, out_channels, kernel_size, stride, dilation, padding, dropout=0.2):
        super().__init__()
        self.conv1 = nn.Conv1d(
            in_channels, out_channels, kernel_size, stride=stride, padding=padding, dilation=dilation
        )
        self.bn1 = nn.BatchNorm1d(out_channels)
        self.relu1 = nn.ReLU()
        self.dropout1 = nn.Dropout(dropout)

        self.conv2 = nn.Conv1d(
            out_channels, out_channels, kernel_size, stride=stride, padding=padding, dilation=dilation
        )
        self.bn2 = nn.BatchNorm1d(out_channels)
        self.relu2 = nn.ReLU()
        self.dropout2 = nn.Dropout(dropout)

        self.downsample = nn.Conv1d(in_channels, out_channels, 1) if in_channels != out_channels else None
        self.relu = nn.ReLU()

    def forward(self, x):
        res = x if self.downsample is None else self.downsample(x)

        out = self.conv1(x)
        out = self.bn1(out)
        out = self.relu1(out)
        out = self.dropout1(out)

        out = self.conv2(out)
        out = self.bn2(out)
        out = self.relu2(out)
        out = self.dropout2(out)

        # Slice to match residual length if causal padding produced extra step
        if out.shape[-1] != res.shape[-1]:
            out = out[..., :res.shape[-1]]

        return self.relu(out + res)


class TCNClassifier(nn.Module):
    """
    TCN sequence classifier for temporal exercise recognition.
    Input: (B, T, D) -> (B, num_classes)
    """

    def __init__(self, input_dim: int = 76, num_classes: int = 9, num_channels: list = None, kernel_size: int = 3, dropout: float = 0.2):
        super().__init__()
        num_channels = num_channels or [64, 128, 128, 64]
        layers = []
        in_ch = input_dim

        for i, out_ch in enumerate(num_channels):
            dilation = 2 ** i
            padding = (kernel_size - 1) * dilation // 2
            layers.append(
                TemporalBlock(in_ch, out_ch, kernel_size, stride=1, dilation=dilation, padding=padding, dropout=dropout)
            )
            in_ch = out_ch

        self.network = nn.Sequential(*layers)
        self.global_pool = nn.AdaptiveAvgPool1d(1)
        self.fc = nn.Sequential(
            nn.Linear(num_channels[-1], 64),
            nn.ReLU(),
            nn.Dropout(dropout),
            nn.Linear(64, num_classes)
        )

    def forward(self, x):
        # x: (B, T, D) -> transpose to (B, D, T)
        x = x.transpose(1, 2)
        feats = self.network(x)          # (B, out_ch, T)
        pooled = self.global_pool(feats).squeeze(-1)  # (B, out_ch)
        return self.fc(pooled)           # (B, num_classes)


# ── 2. LONG SHORT-TERM MEMORY (LSTM) ─────────────────────────────────────────

class LSTMClassifier(nn.Module):
    """
    Bidirectional/unidirectional LSTM classifier with temporal attention pooling.
    Input: (B, T, D) -> (B, num_classes)
    """

    def __init__(self, input_dim: int = 76, hidden_dim: int = 128, num_layers: int = 2, num_classes: int = 9, bidirectional: bool = True, dropout: float = 0.25):
        super().__init__()
        self.lstm = nn.LSTM(
            input_size=input_dim,
            hidden_size=hidden_dim,
            num_layers=num_layers,
            batch_first=True,
            bidirectional=bidirectional,
            dropout=dropout if num_layers > 1 else 0.0,
        )
        lstm_out_dim = hidden_dim * 2 if bidirectional else hidden_dim
        self.attn = nn.Sequential(
            nn.Linear(lstm_out_dim, 64),
            nn.Tanh(),
            nn.Linear(64, 1)
        )
        self.fc = nn.Sequential(
            nn.Linear(lstm_out_dim, 64),
            nn.ReLU(),
            nn.Dropout(dropout),
            nn.Linear(64, num_classes)
        )

    def forward(self, x):
        # x: (B, T, D)
        out, _ = self.lstm(x)  # out: (B, T, lstm_out_dim)

        # Attention pooling across time
        attn_weights = F.softmax(self.attn(out), dim=1)  # (B, T, 1)
        context = torch.sum(out * attn_weights, dim=1)   # (B, lstm_out_dim)

        return self.fc(context)


# ── 3. LIGHTWEIGHT TRANSFORMER CLASSIFIER ─────────────────────────────────────

class PositionalEncoding(nn.Module):
    """
    Sinusoidal positional encoding for sequence tokens.
    """

    def __init__(self, d_model: int, max_len: int = 256):
        super().__init__()
        pe = torch.zeros(max_len, d_model)
        position = torch.arange(0, max_len, dtype=torch.float).unsqueeze(1)
        div_term = torch.exp(torch.arange(0, d_model, 2).float() * (-math.log(10000.0) / d_model))
        pe[:, 0::2] = torch.sin(position * div_term)
        pe[:, 1::2] = torch.cos(position * div_term)
        self.register_buffer('pe', pe.unsqueeze(0))

    def forward(self, x):
        return x + self.pe[:, :x.size(1), :]


class TransformerClassifier(nn.Module):
    """
    Lightweight Multi-Head Self-Attention sequence classifier.
    Input: (B, T, D) -> (B, num_classes)
    """

    def __init__(self, input_dim: int = 76, d_model: int = 128, nhead: int = 4, num_layers: int = 2, dim_feedforward: int = 256, num_classes: int = 9, dropout: float = 0.15):
        super().__init__()
        self.input_proj = nn.Linear(input_dim, d_model)
        self.pos_encoder = PositionalEncoding(d_model, max_len=128)

        encoder_layer = nn.TransformerEncoderLayer(
            d_model=d_model,
            nhead=nhead,
            dim_feedforward=dim_feedforward,
            dropout=dropout,
            activation='gelu',
            batch_first=True,
            norm_first=True,
        )
        self.transformer_encoder = nn.TransformerEncoder(encoder_layer, num_layers=num_layers)
        self.norm = nn.LayerNorm(d_model)
        self.fc = nn.Sequential(
            nn.Linear(d_model, 64),
            nn.GELU(),
            nn.Dropout(dropout),
            nn.Linear(64, num_classes)
        )

    def forward(self, x):
        # x: (B, T, D)
        h = self.input_proj(x)
        h = self.pos_encoder(h)
        encoded = self.transformer_encoder(h)  # (B, T, d_model)
        encoded = self.norm(encoded)
        # Mean temporal pooling
        pooled = torch.mean(encoded, dim=1)    # (B, d_model)
        return self.fc(pooled)


def build_model(architecture: str, input_dim: int = 76, num_classes: int = 9) -> nn.Module:
    """
    Factory function instantiating requested temporal architecture.
    """
    arch = architecture.upper()
    if arch == 'TCN':
        return TCNClassifier(input_dim=input_dim, num_classes=num_classes)
    elif arch == 'LSTM':
        return LSTMClassifier(input_dim=input_dim, num_classes=num_classes)
    elif arch in ['TRANSFORMER', 'XFORMER']:
        return TransformerClassifier(input_dim=input_dim, num_classes=num_classes)
    else:
        raise ValueError(f"Unknown architecture '{architecture}'. Choose from: 'TCN', 'LSTM', 'TRANSFORMER'")
