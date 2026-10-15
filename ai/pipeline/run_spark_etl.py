"""PySpark ETL: Yard + Climate → fused risk dataset.

On Windows/Python 3.13, Spark DataFrames are built via JVM CSV readers
(not createDataFrame from pandas) to avoid Python worker crashes.
Enrichment/labeling use shared pandas business rules, then results are
re-ingested into Spark for distributed aggregations / validation.
"""

from __future__ import annotations

import argparse
import os
import sys
from pathlib import Path

import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))


def _configure_python_for_spark() -> None:
    py = sys.executable
    os.environ.setdefault("PYSPARK_PYTHON", py)
    os.environ.setdefault("PYSPARK_DRIVER_PYTHON", py)


def _spark():
    _configure_python_for_spark()
    from pyspark.sql import SparkSession

    return (
        SparkSession.builder.master("local[2]")
        .appName("eurogate-etl")
        .config("spark.driver.memory", "2g")
        .config("spark.sql.shuffle.partitions", "2")
        .config("spark.ui.enabled", "false")
        .config("spark.pyspark.python", sys.executable)
        .config("spark.pyspark.driver.python", sys.executable)
        .getOrCreate()
    )


def run_etl(raw_dir: Path, out_dir: Path, seed: int = 42) -> dict[str, Path]:
    from pyspark.sql import functions as F
    from pyspark.sql.types import StringType, StructField, StructType

    from ai.pipeline.labeling import apply_business_labels
    from ai.pipeline.neighbor_gaps import compute_yard_topology
    from ai.pipeline.prepare_datasets import (
        _load_table,
        enrich_climate,
        enrich_yard,
        merge_yard_climate,
    )

    out_dir.mkdir(parents=True, exist_ok=True)
    spark = _spark()
    spark.sparkContext.setLogLevel("ERROR")

    yard_csv = raw_dir / "yard_units_positions.csv"
    climate_csv = raw_dir / "tanger_windspeed_2027.csv"
    yard_xlsx = raw_dir / "yard_units_positions.xlsx"
    climate_xlsx = raw_dir / "tanger_windspeed_2027.xlsx"

    yard_pdf = _load_table(yard_xlsx, yard_csv)
    climate_pdf = _load_table(climate_xlsx, climate_csv)

    tmp_yard = out_dir / "spark_yard_raw.csv"
    tmp_climate = out_dir / "spark_climate_raw.csv"
    yard_pdf.to_csv(tmp_yard, index=False)
    climate_pdf.to_csv(tmp_climate, index=False)

    yard_schema = StructType([StructField(c, StringType(), True) for c in yard_pdf.columns])
    climate_schema = StructType([StructField(c, StringType(), True) for c in climate_pdf.columns])

    yard_sdf = (
        spark.read.schema(yard_schema).option("header", True).csv(tmp_yard.as_posix())
    )
    climate_sdf = (
        spark.read.schema(climate_schema).option("header", True).csv(tmp_climate.as_posix())
    )

    yard_n = yard_sdf.count()
    climate_n = climate_sdf.count()
    print(f"[spark] yard rows={yard_n} climate rows={climate_n}")

    # Spark-side quick profile
    if "Tier" in yard_sdf.columns:
        yard_sdf.groupBy("park").agg(F.count("*").alias("n")).orderBy(F.desc("n")).show(5, truncate=False)

    yard = compute_yard_topology(enrich_yard(yard_pdf))
    climate = enrich_climate(climate_pdf)
    fused = apply_business_labels(merge_yard_climate(yard, climate), with_explanations=False)

    paths = {
        "yard": out_dir / "yard_enriched.csv",
        "climate": out_dir / "climate_enriched.csv",
        "fused": out_dir / "fused_risk_dataset.csv",
        "parquet": out_dir / "fused_risk_dataset.parquet",
    }
    yard.to_csv(paths["yard"], index=False)
    climate.to_csv(paths["climate"], index=False)
    fused.to_csv(paths["fused"], index=False)
    try:
        fused.to_parquet(paths["parquet"], index=False)
    except Exception as exc:
        print(f"[etl] parquet skip: {exc}")

    # Re-read fused with Spark for risk distribution (JVM CSV)
    fused_schema = StructType([StructField(c, StringType(), True) for c in fused.columns])
    fused_sdf = spark.read.schema(fused_schema).option("header", True).csv(paths["fused"].as_posix())
    print("[spark] risk distribution:")
    fused_sdf.groupBy("Risk_Level").count().orderBy("Risk_Level").show(truncate=False)

    tmp_yard.unlink(missing_ok=True)
    tmp_climate.unlink(missing_ok=True)
    spark.stop()
    return paths


def main() -> None:
    parser = argparse.ArgumentParser(description="EUROGATE PySpark ETL")
    parser.add_argument("--raw-dir", type=Path, default=ROOT / "data" / "raw")
    parser.add_argument("--out-dir", type=Path, default=ROOT / "data" / "processed")
    parser.add_argument("--seed", type=int, default=42)
    args = parser.parse_args()
    paths = run_etl(args.raw_dir, args.out_dir, args.seed)
    for k, v in paths.items():
        print(f"[ok] {k}: {v}")


if __name__ == "__main__":
    main()
