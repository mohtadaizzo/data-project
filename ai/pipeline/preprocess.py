"""Preprocessing: real yard features + wind speed only."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

import joblib
import numpy as np
import pandas as pd
from sklearn.compose import ColumnTransformer
from sklearn.impute import SimpleImputer
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder, StandardScaler


NUMERIC_FEATURES = [
    "Tier",
    "Stack_Height",
    "Stack_Rank",
    "Occupied_Count",
    "Height_Gap",
    "Neighbor_Min_Height",
    "Neighbor_Count",
    "Neighbor_Container_Count",
    "Neighborhood_Height",
    "Wind_Speed_kmh",
]

CATEGORICAL_FEATURES = [
    "Block",
    "Stack_Exposure",
]

BOOLEAN_FEATURES = [
    "Is_Full",
    "Is_Reefer",
    "Is_IMDG",
    "Has_Left_Neighbor",
    "Has_Right_Neighbor",
    "Laterally_Exposed",
]

TARGET = "Risk_Level"
SCORE_TARGET = "Risk_Score"


@dataclass
class PreprocessResult:
    X: np.ndarray
    y: np.ndarray | None
    feature_names: list[str]
    preprocessor: ColumnTransformer
    meta: pd.DataFrame


def build_preprocessor() -> ColumnTransformer:
    numeric_pipe = Pipeline(
        steps=[
            ("imputer", SimpleImputer(strategy="median")),
            ("scaler", StandardScaler()),
        ]
    )
    categorical_pipe = Pipeline(
        steps=[
            ("imputer", SimpleImputer(strategy="most_frequent")),
            ("encoder", OneHotEncoder(handle_unknown="ignore", sparse_output=False)),
        ]
    )
    boolean_pipe = Pipeline(
        steps=[
            ("imputer", SimpleImputer(strategy="most_frequent")),
        ]
    )
    return ColumnTransformer(
        transformers=[
            ("num", numeric_pipe, NUMERIC_FEATURES),
            ("cat", categorical_pipe, CATEGORICAL_FEATURES),
            ("bool", boolean_pipe, BOOLEAN_FEATURES),
        ]
    )


def _ensure_columns(df: pd.DataFrame) -> pd.DataFrame:
    out = df.copy()
    for col in NUMERIC_FEATURES:
        if col not in out.columns:
            out[col] = np.nan
        out[col] = pd.to_numeric(out[col], errors="coerce")
    for col in CATEGORICAL_FEATURES:
        if col not in out.columns:
            out[col] = "UNK"
        out[col] = out[col].astype(str).replace({"nan": "UNK", "None": "UNK"})
    for col in BOOLEAN_FEATURES:
        if col not in out.columns:
            out[col] = False
        out[col] = out[col].isin([True, 1, "1", "Y", "true", "True", "TRUE", "yes", "YES"]).astype(int)
    return out


def fit_transform(df: pd.DataFrame) -> PreprocessResult:
    data = _ensure_columns(df)
    y = data[TARGET].to_numpy() if TARGET in data.columns else None
    meta_cols = [
        c
        for c in ["Container_ID", "Block", "Bay", "Row", "Risk_Score", "Explanation", "Alert_Color", "Wind_Speed_kmh"]
        if c in data.columns
    ]
    meta = data[meta_cols].copy() if meta_cols else pd.DataFrame(index=data.index)

    preprocessor = build_preprocessor()
    X = preprocessor.fit_transform(data)
    feature_names = _feature_names(preprocessor)
    return PreprocessResult(X=X, y=y, feature_names=feature_names, preprocessor=preprocessor, meta=meta)


def transform(df: pd.DataFrame, preprocessor: ColumnTransformer) -> PreprocessResult:
    data = _ensure_columns(df)
    y = data[TARGET].to_numpy() if TARGET in data.columns else None
    meta_cols = [
        c
        for c in ["Container_ID", "Block", "Bay", "Row", "Risk_Score", "Explanation", "Alert_Color", "Wind_Speed_kmh"]
        if c in data.columns
    ]
    meta = data[meta_cols].copy() if meta_cols else pd.DataFrame(index=data.index)
    X = preprocessor.transform(data)
    feature_names = _feature_names(preprocessor)
    return PreprocessResult(X=X, y=y, feature_names=feature_names, preprocessor=preprocessor, meta=meta)


def _feature_names(preprocessor: ColumnTransformer) -> list[str]:
    names: list[str] = []
    for name, trans, cols in preprocessor.transformers_:
        if name == "remainder":
            continue
        if hasattr(trans, "named_steps") and "encoder" in trans.named_steps:
            enc = trans.named_steps["encoder"]
            names.extend(list(enc.get_feature_names_out(cols)))
        else:
            names.extend(list(cols))
    return names


def save_preprocessor(preprocessor: ColumnTransformer, path: str) -> None:
    joblib.dump(preprocessor, path)


def load_preprocessor(path: str) -> ColumnTransformer:
    return joblib.load(path)


def dataframe_from_payload(payload: dict[str, Any]) -> pd.DataFrame:
    return pd.DataFrame([payload])
