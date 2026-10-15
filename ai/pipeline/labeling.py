"""Risk labels from real yard topology + real wind speed + IMDG flag."""

from __future__ import annotations

from dataclasses import dataclass, field

import numpy as np
import pandas as pd

IMDG_POINTS = 16.0


@dataclass
class RiskBreakdown:
    score: float
    stability: float
    container: float
    factors: list[str] = field(default_factory=list)


def _is_imdg(row: pd.Series) -> bool:
    flag = row.get("Is_IMDG")
    return flag in (True, 1, "1", "Y", "true", "True", "TRUE", "yes", "YES")


def _truthy(v) -> bool:
    return v in (True, 1, "1", "true", "True", "TRUE", "Y", "yes", "YES")


def _wind_boost(wind: float, gust: float = 0) -> float:
    _ = gust
    return max(0.0, min(36.0, float(wind or 0) * 0.38))


def _rank_and_occ(row: pd.Series) -> tuple[int, int]:
    occ = int(float(row.get("Occupied_Count") or row.get("Stack_Height") or 1))
    occ = max(1, occ)
    if "Stack_Rank" in row.index and pd.notna(row.get("Stack_Rank")):
        rank = int(float(row.get("Stack_Rank") or 1))
    else:
        tier = int(float(row.get("Tier") or 1))
        rank = min(max(1, tier), occ)
    return rank, occ


def score_stability(row: pd.Series) -> tuple[float, list[str]]:
    score = 0.0
    factors: list[str] = []
    rank, occ = _rank_and_occ(row)

    if "Neighborhood_Height" in row.index and pd.notna(row.get("Neighborhood_Height")):
        neighborhood = int(float(row.get("Neighborhood_Height") or 0))
    elif "Has_Left_Neighbor" in row.index:
        has_left = _truthy(row.get("Has_Left_Neighbor"))
        has_right = _truthy(row.get("Has_Right_Neighbor"))
        neighborhood = occ if (has_left or has_right) else 0
    else:
        neighborhood = 0 if _truthy(row.get("Laterally_Exposed")) else occ

    if occ <= 2 or rank < 3:
        factors.append(f"Pile de {occ} CTR · rang {rank} : hauteur trop petite, pas de risque de stabilité")
        return 0.0, factors

    if rank <= neighborhood:
        factors.append(f"Rang {rank}/{occ} protégé (voisinage hauteur {neighborhood})")
        return 0.0, factors

    has_voisinage = _truthy(row.get("Has_Any_Neighbor")) or neighborhood > 0
    if not has_voisinage and "Has_Left_Neighbor" in row.index:
        has_voisinage = _truthy(row.get("Has_Left_Neighbor")) or _truthy(row.get("Has_Right_Neighbor"))

    factors.append(f"Rang {rank}/{occ} plus haut que le voisinage ({neighborhood})")
    wind = float(row.get("Wind_Speed_kmh") or 0)
    boost = _wind_boost(wind)

    if rank == 3:
        score = max(0.0, min(38.0, 18.0 + boost * 0.45))
        factors.append("3e conteneur : risque faible")
    elif has_voisinage:
        extra = rank - neighborhood
        score = max(40.0, min(69.0, 42.0 + extra * 3 + boost * 0.35))
        factors.append(f"{rank}e : risque modéré (il y a du voisinage)")
    else:
        score = 72.0
        factors.append(f"{rank}e isolé : même règle pour toute pile ≥ 4 sans voisin")

    if wind > 0:
        factors.append(f"vent {wind:.0f} km/h")
    return max(0.0, min(80.0, score)), factors


def score_container(row: pd.Series) -> tuple[float, list[str]]:
    if _is_imdg(row):
        return IMDG_POINTS, ["marchandises dangereuses (IMDG)"]
    return 0.0, []


def score_breakdown(row: pd.Series) -> RiskBreakdown:
    stability, stab_f = score_stability(row)
    cargo, cargo_f = score_container(row)
    extra = 0.0
    extra_f: list[str] = []
    wind = float(row.get("Wind_Speed_kmh") or 0)
    imdg = _is_imdg(row)
    if imdg and stability >= 40:
        extra += 10
        extra_f.append("IMDG sur unité exposée")
    if imdg and wind >= 50:
        extra += 8
        extra_f.append("combinaison IMDG + vent")

    total = max(0.0, min(100.0, stability + cargo + extra))
    has_voisinage = (
        _truthy(row.get("Has_Any_Neighbor"))
        or _truthy(row.get("Has_Left_Neighbor"))
        or _truthy(row.get("Has_Right_Neighbor"))
    )
    if "Neighborhood_Height" in row.index:
        has_voisinage = has_voisinage or float(row.get("Neighborhood_Height") or 0) > 0
    if has_voisinage and total >= 70:
        total = 69.0
        extra_f.append("voisinage : pas de rouge")
    return RiskBreakdown(
        score=total,
        stability=round(stability, 1),
        container=round(cargo, 1),
        factors=stab_f + cargo_f + extra_f,
    )


def score_row(row: pd.Series) -> tuple[float, list[str]]:
    b = score_breakdown(row)
    return b.score, b.factors


def risk_level_from_score(score: float) -> str:
    if score >= 70:
        return "High"
    if score >= 40:
        return "Medium"
    return "Low"


def alert_color_from_score(score: float) -> str:
    if score >= 70:
        return "red"
    if score >= 40:
        return "orange"
    return "green"


def build_explanation(score: float, factors: list[str], level: str) -> str:
    if not factors:
        return f"Risque {level} (score {score:.0f}/100) — conditions nominales."
    joined = " + ".join(factors)
    if level == "High":
        suffix = " = Risque critique."
    elif level == "Medium":
        suffix = " = Risque modéré."
    else:
        suffix = " = Risque faible."
    return f"{joined}{suffix}"


def _as_bool_mask(series: pd.Series | None, n: int) -> np.ndarray:
    if series is None:
        return np.zeros(n, dtype=bool)
    return series.isin([True, 1, "1", "Y", "true", "True", "TRUE", "yes", "YES"]).to_numpy()


def apply_business_labels(df: pd.DataFrame, with_explanations: bool = True) -> pd.DataFrame:
    """Vectorized labels so yard × climate (500k+ rows) stays fast."""
    out = df.copy()
    n = len(out)
    if n == 0:
        out["Stability_Score"] = []
        out["Container_Score"] = []
        out["Risk_Score"] = []
        out["Risk_Level"] = []
        out["Alert_Color"] = []
        out["Explanation"] = []
        out["Risk_Factors"] = []
        return out

    occ_src = out["Occupied_Count"] if "Occupied_Count" in out.columns else out["Stack_Height"]
    occ = np.maximum(pd.to_numeric(occ_src, errors="coerce").fillna(1).to_numpy(dtype=float), 1.0)
    if "Stack_Rank" in out.columns:
        rank = pd.to_numeric(out["Stack_Rank"], errors="coerce").fillna(1).to_numpy(dtype=float)
    else:
        tier = pd.to_numeric(out.get("Tier", 1), errors="coerce").fillna(1).to_numpy(dtype=float)
        rank = np.minimum(np.maximum(tier, 1), occ)

    if "Neighborhood_Height" in out.columns:
        neighborhood = pd.to_numeric(out["Neighborhood_Height"], errors="coerce").fillna(0).to_numpy(dtype=float)
    else:
        neighborhood = np.zeros(n, dtype=float)

    wind = (
        pd.to_numeric(out["Wind_Speed_kmh"], errors="coerce").fillna(0).to_numpy(dtype=float)
        if "Wind_Speed_kmh" in out.columns
        else np.zeros(n, dtype=float)
    )
    boost = np.clip(wind * 0.38, 0.0, 36.0)
    imdg = _as_bool_mask(out["Is_IMDG"] if "Is_IMDG" in out.columns else None, n)
    has_voisinage = neighborhood > 0
    if "Has_Any_Neighbor" in out.columns:
        has_voisinage = has_voisinage | _as_bool_mask(out["Has_Any_Neighbor"], n)
    if "Has_Left_Neighbor" in out.columns:
        has_voisinage = has_voisinage | _as_bool_mask(out["Has_Left_Neighbor"], n) | _as_bool_mask(
            out["Has_Right_Neighbor"] if "Has_Right_Neighbor" in out.columns else None, n
        )

    extra_rank = rank - neighborhood
    stability = np.zeros(n, dtype=float)
    mask_risk = (occ > 2) & (rank >= 3) & (rank > neighborhood)
    mask_r3 = mask_risk & (rank == 3)
    mask_mod = mask_risk & (rank > 3) & has_voisinage
    mask_iso = mask_risk & (rank > 3) & (~has_voisinage)
    stability[mask_r3] = np.clip(18.0 + boost[mask_r3] * 0.45, 0.0, 38.0)
    stability[mask_mod] = np.clip(42.0 + extra_rank[mask_mod] * 3.0 + boost[mask_mod] * 0.35, 40.0, 69.0)
    stability[mask_iso] = 72.0
    stability = np.clip(stability, 0.0, 80.0)

    cargo = np.where(imdg, IMDG_POINTS, 0.0)
    extra = np.zeros(n, dtype=float)
    extra[(imdg) & (stability >= 40)] += 10.0
    extra[(imdg) & (wind >= 50)] += 8.0
    total = np.clip(stability + cargo + extra, 0.0, 100.0)
    total = np.where(has_voisinage & (total >= 70), 69.0, total)

    levels = np.where(total >= 70, "High", np.where(total >= 40, "Medium", "Low"))
    colors = np.where(total >= 70, "red", np.where(total >= 40, "orange", "green"))

    out["Stability_Score"] = np.round(stability, 1)
    out["Container_Score"] = np.round(cargo, 1)
    out["Risk_Score"] = np.round(total, 1)
    out["Risk_Level"] = levels
    out["Alert_Color"] = colors

    if with_explanations and n <= 5000:
        explanations = []
        factors_joined = []
        for _, row in out.iterrows():
            b = score_breakdown(row)
            level = risk_level_from_score(b.score)
            explanations.append(build_explanation(b.score, b.factors, level))
            factors_joined.append("; ".join(b.factors))
        out["Explanation"] = explanations
        out["Risk_Factors"] = factors_joined
    else:
        out["Explanation"] = ""
        out["Risk_Factors"] = ""
    return out
