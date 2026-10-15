"""Train a PyTorch MLP (Deep Learning) for Risk_Level."""

from __future__ import annotations

import json
import sys
from pathlib import Path

import joblib
import numpy as np
import pandas as pd
import torch
import torch.nn as nn
from sklearn.model_selection import train_test_split
from sklearn.preprocessing import LabelEncoder
from torch.utils.data import DataLoader, TensorDataset

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from ai.pipeline.preprocess import fit_transform, load_preprocessor, save_preprocessor


class RiskMLP(nn.Module):
    def __init__(self, in_dim: int, n_classes: int):
        super().__init__()
        self.net = nn.Sequential(
            nn.Linear(in_dim, 128),
            nn.ReLU(),
            nn.Dropout(0.2),
            nn.Linear(128, 64),
            nn.ReLU(),
            nn.Dropout(0.1),
            nn.Linear(64, n_classes),
        )

    def forward(self, x):
        return self.net(x)


def train_dl(epochs: int = 20, batch_size: int = 256, lr: float = 1e-3) -> dict:
    out_dir = ROOT / "ai" / "artifacts"
    out_dir.mkdir(parents=True, exist_ok=True)
    fused = ROOT / "data" / "processed" / "fused_risk_dataset.csv"
    if not fused.exists():
        from ai.pipeline.prepare_datasets import prepare

        prepare(ROOT / "data" / "raw", ROOT / "data" / "processed")

    df = pd.read_csv(fused)
    if len(df) > 80_000:
        parts = [
            g.sample(n=min(len(g), 28_000), random_state=42)
            for _, g in df.groupby("Risk_Level")
        ]
        df = pd.concat(parts, ignore_index=True)
    prep_path = out_dir / "preprocessor.joblib"
    if prep_path.exists():
        from ai.pipeline.preprocess import transform

        preprocessor = load_preprocessor(str(prep_path))
        result = transform(df, preprocessor)
        # ensure y
        from ai.pipeline.preprocess import fit_transform as ft

        # refit if needed for y alignment
        result = ft(df)
        save_preprocessor(result.preprocessor, str(prep_path))
    else:
        result = fit_transform(df)
        save_preprocessor(result.preprocessor, str(prep_path))

    le = LabelEncoder()
    y = le.fit_transform(result.y)
    X = result.X.astype(np.float32)

    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.2, random_state=42, stratify=y
    )

    train_loader = DataLoader(
        TensorDataset(torch.from_numpy(X_train), torch.from_numpy(y_train.astype(np.int64))),
        batch_size=batch_size,
        shuffle=True,
    )

    model = RiskMLP(X.shape[1], len(le.classes_))
    opt = torch.optim.Adam(model.parameters(), lr=lr)
    loss_fn = nn.CrossEntropyLoss()

    model.train()
    for epoch in range(epochs):
        total = 0.0
        for xb, yb in train_loader:
            opt.zero_grad()
            logits = model(xb)
            loss = loss_fn(logits, yb)
            loss.backward()
            opt.step()
            total += float(loss.item()) * len(xb)
        if (epoch + 1) % 10 == 0:
            print(f"[dl] epoch {epoch+1}/{epochs} loss={total/len(X_train):.4f}")

    model.eval()
    with torch.no_grad():
        logits = model(torch.from_numpy(X_test))
        pred = logits.argmax(dim=1).numpy()
    acc = float((pred == y_test).mean())

    ckpt = {
        "state_dict": model.state_dict(),
        "in_dim": X.shape[1],
        "classes": list(le.classes_),
        "label_encoder": le,
    }
    torch.save(ckpt, out_dir / "dl_model.pt")
    joblib.dump({"label_encoder": le, "classes": list(le.classes_)}, out_dir / "dl_labels.joblib")

    meta = {
        "engine": "pytorch.MLP",
        "accuracy": acc,
        "epochs": epochs,
        "classes": list(le.classes_),
        "in_dim": int(X.shape[1]),
        "path": str(out_dir / "dl_model.pt"),
    }
    (out_dir / "dl_meta.json").write_text(json.dumps(meta, indent=2), encoding="utf-8")
    print(json.dumps(meta, indent=2))
    return meta


def main() -> None:
    train_dl()


if __name__ == "__main__":
    main()
