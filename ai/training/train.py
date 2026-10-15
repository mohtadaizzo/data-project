"""Train risk classification model (RandomForest / XGBoost / LightGBM)."""

from __future__ import annotations

import argparse
import json
from pathlib import Path

import joblib
import numpy as np
import pandas as pd
from sklearn.ensemble import RandomForestClassifier
from sklearn.metrics import classification_report, f1_score
from sklearn.model_selection import train_test_split
from sklearn.preprocessing import LabelEncoder

from ai.pipeline.labeling import apply_business_labels
from ai.pipeline.prepare_datasets import prepare
from ai.pipeline.preprocess import fit_transform, save_preprocessor


def _build_model(algo: str):
    algo = algo.lower()
    if algo == "xgboost":
        from xgboost import XGBClassifier

        return XGBClassifier(
            n_estimators=200,
            max_depth=6,
            learning_rate=0.08,
            subsample=0.9,
            colsample_bytree=0.9,
            objective="multi:softprob",
            eval_metric="mlogloss",
            random_state=42,
        )
    if algo == "lightgbm":
        from lightgbm import LGBMClassifier

        return LGBMClassifier(
            n_estimators=250,
            max_depth=-1,
            learning_rate=0.07,
            subsample=0.9,
            colsample_bytree=0.9,
            random_state=42,
        )
    return RandomForestClassifier(
        n_estimators=120,
        max_depth=12,
        min_samples_leaf=2,
        class_weight="balanced_subsample",
        random_state=42,
        n_jobs=-1,
    )


def train(data_dir: Path, out_dir: Path, algo: str = "random_forest") -> dict:
    raw_dir = data_dir / "raw"
    processed_dir = data_dir / "processed"
    fused_path = processed_dir / "fused_risk_dataset.csv"
    prepare(raw_dir, processed_dir)
    df = pd.read_csv(fused_path)
    if "Risk_Level" not in df.columns:
        df = apply_business_labels(df, with_explanations=False)
    if len(df) > 150_000:
        parts = [
            g.sample(n=min(len(g), 50_000), random_state=42)
            for _, g in df.groupby("Risk_Level")
        ]
        df = pd.concat(parts, ignore_index=True)

    result = fit_transform(df)
    le = LabelEncoder()
    y = le.fit_transform(result.y)

    X_train, X_test, y_train, y_test = train_test_split(
        result.X, y, test_size=0.2, random_state=42, stratify=y
    )

    model = _build_model(algo)
    model.fit(X_train, y_train)
    preds = model.predict(X_test)
    f1 = f1_score(y_test, preds, average="weighted")
    report = classification_report(y_test, preds, target_names=list(le.classes_), output_dict=True)

    out_dir.mkdir(parents=True, exist_ok=True)
    model_path = out_dir / "risk_model.joblib"
    prep_path = out_dir / "preprocessor.joblib"
    meta_path = out_dir / "model_meta.json"

    bundle = {
        "model": model,
        "label_encoder": le,
        "algo": algo,
        "feature_names": result.feature_names,
    }
    joblib.dump(bundle, model_path)
    save_preprocessor(result.preprocessor, str(prep_path))

    meta = {
        "algo": algo,
        "f1_weighted": float(f1),
        "classes": list(le.classes_),
        "n_samples": int(len(df)),
        "feature_count": len(result.feature_names),
        "report": report,
        "risk_distribution": df["Risk_Level"].value_counts().to_dict(),
    }
    meta_path.write_text(json.dumps(meta, indent=2), encoding="utf-8")

    # Export training-ready matrix sample
    sample = df.head(50)
    sample.to_csv(processed_dir / "training_sample.csv", index=False)

    print(json.dumps({"status": "ok", "f1_weighted": f1, "algo": algo, "model": str(model_path)}, indent=2))
    return meta


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--data-dir", type=Path, default=Path("data"))
    parser.add_argument("--out-dir", type=Path, default=Path("ai/artifacts"))
    parser.add_argument("--algo", choices=["random_forest", "xgboost", "lightgbm"], default="random_forest")
    args = parser.parse_args()
    train(args.data_dir, args.out_dir, args.algo)


if __name__ == "__main__":
    main()
