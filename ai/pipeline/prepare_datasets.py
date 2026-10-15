"""Prepare training data from the two real EUROGATE files only.

Yard columns used: hdhand, isFull, isReefer, isIMDG, park, bay, row, Tier, CheckIn
Climate columns used: Date, Predicted_WindSpeed_kmh

No synthetic weather (gust, rain, temperature, …) and no fake cargo fields.
"""

from __future__ import annotations

import argparse
from datetime import datetime
from pathlib import Path

import numpy as np
import pandas as pd


def _parse_dt(value) -> datetime | None:
    if value is None or (isinstance(value, float) and np.isnan(value)):
        return None
    if isinstance(value, datetime):
        return value
    text = str(value).strip()
    if not text or text.lower() in {"nan", "none", "nat"}:
        return None
    for fmt in (
        "%Y-%m-%d %H:%M:%S",
        "%Y-%m-%dT%H:%M:%S",
        "%Y-%m-%d",
        "%d/%m/%Y %H:%M:%S",
        "%d/%m/%Y",
    ):
        try:
            return datetime.strptime(text[:19], fmt) if " " in fmt or "T" in fmt else datetime.strptime(text[:10], fmt)
        except ValueError:
            continue
    try:
        return datetime.fromisoformat(text.replace("Z", ""))
    except ValueError:
        return None


def _yn_to_bool(series: pd.Series) -> pd.Series:
    return series.astype(str).str.strip().str.upper().isin(["Y", "YES", "1", "TRUE"])


def enrich_yard(raw: pd.DataFrame, rng=None) -> pd.DataFrame:
    """Map TOS columns only — nothing invented."""
    _ = rng
    df = raw.copy()
    colmap = {
        "hdhand": "Container_ID",
        "park": "Block",
        "bay": "Bay",
        "row": "Row",
        "Tier": "Tier",
        "CheckIn": "Entry_Date",
        "isFull": "Is_Full",
        "isReefer": "Is_Reefer",
        "isIMDG": "Is_IMDG",
    }
    df = df.rename(columns={k: v for k, v in colmap.items() if k in df.columns})

    df["Block"] = df["Block"].astype(str).str.strip()
    df["Bay"] = df["Bay"].astype(str).str.strip()
    df["Row"] = df["Row"].astype(str).str.strip()
    df["Tier"] = pd.to_numeric(df["Tier"], errors="coerce").fillna(1).astype(int)
    df["Container_ID"] = df["Container_ID"].astype(str)
    parsed = [_parse_dt(v) for v in df["Entry_Date"].tolist()]
    df["Entry_Date"] = [d.isoformat(sep=" ") if d else None for d in parsed]
    df["Is_Full"] = _yn_to_bool(df["Is_Full"]) if "Is_Full" in df.columns else False
    df["Is_Reefer"] = _yn_to_bool(df["Is_Reefer"]) if "Is_Reefer" in df.columns else False
    df["Is_IMDG"] = _yn_to_bool(df["Is_IMDG"]) if "Is_IMDG" in df.columns else False

    return df[
        [
            "Container_ID",
            "Block",
            "Bay",
            "Row",
            "Tier",
            "Is_Full",
            "Is_Reefer",
            "Is_IMDG",
            "Entry_Date",
        ]
    ]


def enrich_climate(raw: pd.DataFrame, rng=None) -> pd.DataFrame:
    """Keep Date + wind speed only."""
    _ = rng
    df = raw.copy()
    if "Predicted_WindSpeed_kmh" in df.columns:
        df = df.rename(columns={"Predicted_WindSpeed_kmh": "Wind_Speed_kmh", "Date": "DateTime"})
    parsed = [_parse_dt(v) for v in df["DateTime"].tolist()]
    df["DateTime"] = [d.isoformat(sep=" ") if d else None for d in parsed]
    df["Wind_Speed_kmh"] = pd.to_numeric(df["Wind_Speed_kmh"], errors="coerce").fillna(20.0).round(1)
    df = df.dropna(subset=["DateTime"]).drop_duplicates(subset=["DateTime"], keep="last")
    return df[["DateTime", "Wind_Speed_kmh"]].reset_index(drop=True)


def merge_yard_climate(yard: pd.DataFrame, climate: pd.DataFrame, rng=None) -> pd.DataFrame:
    """Cross-join containers with unique wind speeds from the climate file.

    Dates are not a model feature. Using each distinct wind value covers the
    whole Tanger series without writing 500k+ duplicate yard rows.
    """
    _ = rng
    y = yard.copy()
    c = climate[["Wind_Speed_kmh"]].copy()
    c["Wind_Speed_kmh"] = c["Wind_Speed_kmh"].round(0)
    c = c.drop_duplicates(subset=["Wind_Speed_kmh"]).sort_values("Wind_Speed_kmh")
    y["_k"] = 1
    c["_k"] = 1
    return y.merge(c, on="_k").drop(columns="_k")


def _load_table(path_xlsx: Path, path_csv: Path) -> pd.DataFrame:
    if path_csv.exists():
        return pd.read_csv(path_csv)
    if path_xlsx.exists():
        import openpyxl

        wb = openpyxl.load_workbook(path_xlsx, read_only=True, data_only=True)
        ws = wb.active
        rows = list(ws.iter_rows(values_only=True))
        wb.close()
        header, *body = rows
        return pd.DataFrame(body, columns=header)
    raise FileNotFoundError(f"Missing dataset: {path_xlsx} / {path_csv}")


def prepare(raw_dir: Path, out_dir: Path, seed: int = 42) -> dict[str, Path]:
    _ = seed
    out_dir.mkdir(parents=True, exist_ok=True)

    yard_raw = _load_table(raw_dir / "yard_units_positions.xlsx", raw_dir / "yard_units_positions.csv")
    climate_raw = _load_table(raw_dir / "tanger_windspeed_2027.xlsx", raw_dir / "tanger_windspeed_2027.csv")

    from ai.pipeline.labeling import apply_business_labels
    from ai.pipeline.neighbor_gaps import compute_yard_topology

    yard = compute_yard_topology(enrich_yard(yard_raw))
    climate = enrich_climate(climate_raw)
    fused = apply_business_labels(merge_yard_climate(yard, climate), with_explanations=False)

    paths = {
        "yard": out_dir / "yard_enriched.csv",
        "climate": out_dir / "climate_enriched.csv",
        "fused": out_dir / "fused_risk_dataset.csv",
    }
    yard.to_csv(paths["yard"], index=False)
    climate.to_csv(paths["climate"], index=False)
    drop_cols = [c for c in ("Explanation", "Risk_Factors", "Entry_Date") if c in fused.columns]
    fused.drop(columns=drop_cols).to_csv(paths["fused"], index=False)
    print(f"[prepare] yard={len(yard)} climate={len(climate)} fused={len(fused)}")
    print(f"[prepare] risk dist: {fused['Risk_Level'].value_counts().to_dict()}")
    return paths


def main() -> None:
    parser = argparse.ArgumentParser(description="Prepare EUROGATE Yard + Wind datasets")
    parser.add_argument("--raw-dir", type=Path, default=Path("data/raw"))
    parser.add_argument("--out-dir", type=Path, default=Path("data/processed"))
    parser.add_argument("--seed", type=int, default=42)
    args = parser.parse_args()
    paths = prepare(args.raw_dir, args.out_dir, args.seed)
    for name, path in paths.items():
        print(f"[ok] {name}: {path}")


if __name__ == "__main__":
    main()
