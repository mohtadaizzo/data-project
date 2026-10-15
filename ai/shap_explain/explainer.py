"""SHAP explanations for risk predictions."""

from __future__ import annotations

from typing import Any

import numpy as np


def explain_prediction(
    model,
    X_row: np.ndarray,
    feature_names: list[str],
    top_k: int = 8,
) -> list[dict[str, Any]]:
    """Return top contributing features. Falls back to feature_importances_ if SHAP fails."""
    try:
        import shap

        # TreeExplainer works for RF / XGB / LGBM
        explainer = shap.TreeExplainer(model)
        values = explainer.shap_values(X_row)
        if isinstance(values, list):
            # multiclass: take predicted class
            pred = int(model.predict(X_row)[0])
            shap_vec = np.array(values[pred][0])
        else:
            shap_vec = np.array(values[0])
        pairs = sorted(
            zip(feature_names, shap_vec.tolist()),
            key=lambda x: abs(x[1]),
            reverse=True,
        )[:top_k]
        return [{"feature": f, "shap_value": float(v)} for f, v in pairs]
    except Exception:
        if hasattr(model, "feature_importances_"):
            imp = model.feature_importances_
            pairs = sorted(zip(feature_names, imp.tolist()), key=lambda x: x[1], reverse=True)[:top_k]
            return [{"feature": f, "shap_value": float(v)} for f, v in pairs]
        return []
