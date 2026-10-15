"""FastAPI AI serving — rules + ML (sklearn) + DL (PyTorch)."""

from __future__ import annotations

import sys
from functools import lru_cache
from pathlib import Path
from typing import Any

import joblib
import numpy as np
import pandas as pd
import torch
from fastapi import FastAPI, Query
from pydantic import BaseModel, Field

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from ai.pipeline.labeling import (
    alert_color_from_score,
    build_explanation,
    risk_level_from_score,
    score_breakdown,
)
from ai.pipeline.preprocess import load_preprocessor, transform
from ai.training.train_dl import RiskMLP

ART = ROOT / "ai" / "artifacts"
app = FastAPI(title="EUROGATE AI Service", version="2.0.0")


class PredictIn(BaseModel):
    container_id: str | None = None
    Block: str = "A1"
    Bay: str = "001"
    Row: str = "00A"
    Tier: int = 1
    Stack_Height: int = 3
    Stack_Rank: int = 1
    Occupied_Count: int = 3
    Height_Gap: float = 0
    Neighbor_Min_Height: float = 1
    Neighbor_Count: int = 0
    Neighbor_Container_Count: int = 0
    Has_Left_Neighbor: bool = False
    Has_Right_Neighbor: bool = False
    Laterally_Exposed: bool = False
    Stack_Exposure: str = "isolated"
    Is_Full: bool = True
    Is_Reefer: bool = False
    Is_IMDG: bool = False
    Wind_Speed_kmh: float = 35


class PredictOut(BaseModel):
    risk_level: str
    risk_score: float
    alert_color: str
    explanation: str
    factors: list[str] = Field(default_factory=list)
    shap: list[dict[str, Any]] = Field(default_factory=list)
    model_version: str | None = None
    ml_level: str | None = None
    dl_level: str | None = None
    stability_score: float | None = None
    container_score: float | None = None


@lru_cache
def _load_ml():
    path = ART / "ml_model.joblib"
    prep = ART / "preprocessor.joblib"
    if not path.exists() or not prep.exists():
        return None, None
    return joblib.load(path), load_preprocessor(str(prep))


@lru_cache
def _load_dl():
    path = ART / "dl_model.pt"
    prep = ART / "preprocessor.joblib"
    if not path.exists() or not prep.exists():
        return None, None, None
    ckpt = torch.load(path, map_location="cpu", weights_only=False)
    model = RiskMLP(ckpt["in_dim"], len(ckpt["classes"]))
    model.load_state_dict(ckpt["state_dict"])
    model.eval()
    return model, ckpt["classes"], load_preprocessor(str(prep))


def _ml_predict(payload: dict) -> str | None:
    bundle, prep = _load_ml()
    if bundle is None:
        return None
    df = pd.DataFrame([payload])
    X = transform(df, prep).X
    idx = int(bundle["model"].predict(X)[0])
    return str(bundle["label_encoder"].inverse_transform([idx])[0])


def _dl_predict(payload: dict) -> str | None:
    model, classes, prep = _load_dl()
    if model is None:
        return None
    df = pd.DataFrame([payload])
    X = transform(df, prep).X.astype(np.float32)
    with torch.no_grad():
        logits = model(torch.from_numpy(X))
        idx = int(logits.argmax(dim=1).item())
    return str(classes[idx])


def _level_to_score(level: str) -> float:
    return {"Low": 22.0, "Medium": 55.0, "High": 85.0}.get(level, 50.0)


@app.get("/health")
def health():
    ml, _ = _load_ml()
    dl, _, _ = _load_dl()
    return {
        "status": "ok",
        "service": "eurogate-ai",
        "ml_loaded": ml is not None,
        "dl_loaded": dl is not None,
    }


@app.post("/predict", response_model=PredictOut)
def predict(body: PredictIn, model: str = Query("ensemble")):
    payload = body.model_dump()
    row = pd.Series(payload)
    breakdown = score_breakdown(row)
    rule_score, factors = breakdown.score, breakdown.factors
    rule_level = risk_level_from_score(rule_score)

    ml_level = _ml_predict(payload)
    dl_level = _dl_predict(payload)

    if model == "ml" and ml_level:
        level = ml_level
        score = 0.6 * _level_to_score(ml_level) + 0.4 * rule_score
        version = "ml-sklearn"
    elif model == "dl" and dl_level:
        level = dl_level
        score = 0.6 * _level_to_score(dl_level) + 0.4 * rule_score
        version = "dl-pytorch"
    elif model == "rules":
        level = rule_level
        score = rule_score
        version = "rules-v1"
    else:
        # ensemble
        scores = [rule_score]
        levels = [rule_level]
        if ml_level:
            scores.append(_level_to_score(ml_level))
            levels.append(ml_level)
        if dl_level:
            scores.append(_level_to_score(dl_level))
            levels.append(dl_level)
        score = float(np.mean(scores))
        # majority vote with rule tie-break
        from collections import Counter

        level = Counter(levels).most_common(1)[0][0]
        version = "ensemble-ml-dl-rules"

    score = max(0.0, min(100.0, score))
    level = risk_level_from_score(score) if abs(score - rule_score) < 30 else level
    color = alert_color_from_score(score)
    explanation = build_explanation(score, factors, risk_level_from_score(score))

    shap = []
    bundle, _ = _load_ml()
    if bundle and hasattr(bundle["model"], "feature_importances_"):
        names = bundle.get("feature_names") or []
        imp = bundle["model"].feature_importances_
        pairs = sorted(zip(names, imp.tolist()), key=lambda x: x[1], reverse=True)[:8]
        shap = [{"feature": f, "shap_value": float(v)} for f, v in pairs]

    return PredictOut(
        risk_level=risk_level_from_score(score),
        risk_score=round(score, 1),
        alert_color=color,
        explanation=explanation,
        factors=factors,
        shap=shap,
        model_version=version,
        ml_level=ml_level,
        dl_level=dl_level,
        stability_score=breakdown.stability,
        container_score=breakdown.container,
    )


@app.get("/train/status")
def train_status():
    meta = ART / "train_meta.json"
    if meta.exists():
        return json_load(meta)
    return {"status": "no_train_meta"}


def json_load(path: Path):
    import json

    return json.loads(path.read_text(encoding="utf-8"))
