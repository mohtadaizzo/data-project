"""Train Spark MLlib RandomForest + sklearn twin for fast serving."""

from __future__ import annotations

import json
import os
import sys
from pathlib import Path

import joblib
import pandas as pd
from sklearn.ensemble import RandomForestClassifier
from sklearn.metrics import classification_report, f1_score
from sklearn.model_selection import train_test_split
from sklearn.preprocessing import LabelEncoder

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from ai.pipeline.preprocess import fit_transform, save_preprocessor


FEATURE_HINT = [
    "Tier",
    "Stack_Height",
    "Stack_Rank",
    "Occupied_Count",
    "Height_Gap",
    "Neighbor_Count",
    "Neighbor_Container_Count",
    "Neighborhood_Height",
    "Wind_Speed_kmh",
]


def train_spark_mllib(df: pd.DataFrame, out_dir: Path) -> dict:
    if len(df) > 80_000:
        parts = [
            g.sample(n=min(len(g), 25_000), random_state=42)
            for _, g in df.groupby("Risk_Level")
        ]
        df = pd.concat(parts, ignore_index=True)
    import os
    import sys

    os.environ.setdefault("PYSPARK_PYTHON", sys.executable)
    os.environ.setdefault("PYSPARK_DRIVER_PYTHON", sys.executable)

    from pyspark.sql import SparkSession
    from pyspark.sql import functions as F
    from pyspark.ml import Pipeline
    from pyspark.ml.classification import RandomForestClassifier as SparkRF
    from pyspark.ml.feature import StringIndexer, VectorAssembler, IndexToString
    from pyspark.ml.evaluation import MulticlassClassificationEvaluator
    from pyspark.sql.types import DoubleType, IntegerType, StringType, StructField, StructType

    spark = (
        SparkSession.builder.master("local[2]")
        .appName("eurogate-ml")
        .config("spark.ui.enabled", "false")
        .config("spark.pyspark.python", sys.executable)
        .config("spark.pyspark.driver.python", sys.executable)
        .getOrCreate()
    )
    spark.sparkContext.setLogLevel("ERROR")

    use_cols = [c for c in FEATURE_HINT if c in df.columns] + ["Risk_Level", "Is_IMDG"]
    pdf = df[use_cols].copy()
    pdf["Is_IMDG"] = pdf["Is_IMDG"].astype(int)
    for c in FEATURE_HINT:
        if c in pdf.columns:
            pdf[c] = pd.to_numeric(pdf[c], errors="coerce").fillna(0)

    tmp = out_dir / "ml_train.csv"
    pdf.to_csv(tmp, index=False)
    fields = []
    for c in pdf.columns:
        if c == "Risk_Level":
            fields.append(StructField(c, StringType(), True))
        elif c == "Is_IMDG":
            fields.append(StructField(c, IntegerType(), True))
        else:
            fields.append(StructField(c, DoubleType(), True))
    schema = StructType(fields)
    sdf = spark.read.schema(schema).option("header", True).csv(tmp.as_posix()).na.drop()
    # Ensure labels are valid strings
    sdf = sdf.filter(F.col("Risk_Level").isin("Low", "Medium", "High"))

    label_indexer = StringIndexer(
        inputCol="Risk_Level", outputCol="label", handleInvalid="skip"
    ).fit(sdf)
    assembler = VectorAssembler(
        inputCols=[c for c in FEATURE_HINT if c in pdf.columns] + ["Is_IMDG"],
        outputCol="features",
    )
    rf = SparkRF(labelCol="label", featuresCol="features", numTrees=80, maxDepth=8, seed=42)
    converter = IndexToString(
        inputCol="prediction", outputCol="predicted_label", labels=label_indexer.labels
    )
    pipeline = Pipeline(stages=[label_indexer, assembler, rf, converter])

    train_df, test_df = sdf.randomSplit([0.8, 0.2], seed=42)
    model = pipeline.fit(train_df)
    preds = model.transform(test_df)
    evaluator = MulticlassClassificationEvaluator(
        labelCol="label", predictionCol="prediction", metricName="f1"
    )
    f1 = float(evaluator.evaluate(preds))
    acc = float(
        MulticlassClassificationEvaluator(
            labelCol="label", predictionCol="prediction", metricName="accuracy"
        ).evaluate(preds)
    )

    ml_dir = out_dir / "ml_spark_model"
    try:
        if ml_dir.exists():
            import shutil

            shutil.rmtree(ml_dir)
        model.write().overwrite().save(str(ml_dir))
        path = str(ml_dir)
    except Exception as exc:
        print(f"[ml] spark model save skipped (Windows/Hadoop): {exc}")
        path = ""
    tmp.unlink(missing_ok=True)
    spark.stop()
    return {
        "f1": f1,
        "accuracy": acc,
        "engine": "pyspark.ml.RandomForestClassifier",
        "path": path,
        "trained": True,
    }


def train_sklearn_twin(df: pd.DataFrame, out_dir: Path) -> dict:
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
    clf = RandomForestClassifier(
        n_estimators=120,
        max_depth=12,
        class_weight="balanced_subsample",
        random_state=42,
        n_jobs=-1,
    )
    clf.fit(X_train, y_train)
    preds = clf.predict(X_test)
    f1 = float(f1_score(y_test, preds, average="weighted"))
    report = classification_report(y_test, preds, target_names=list(le.classes_), output_dict=True)

    bundle = {"model": clf, "label_encoder": le, "feature_names": result.feature_names, "algo": "random_forest"}
    joblib.dump(bundle, out_dir / "ml_model.joblib")
    save_preprocessor(result.preprocessor, str(out_dir / "preprocessor.joblib"))
    return {
        "f1_weighted": f1,
        "engine": "sklearn.RandomForestClassifier",
        "classes": list(le.classes_),
        "report": report,
        "serve_path": str(out_dir / "ml_model.joblib"),
    }


def main() -> None:
    out_dir = ROOT / "ai" / "artifacts"
    out_dir.mkdir(parents=True, exist_ok=True)
    fused = ROOT / "data" / "processed" / "fused_risk_dataset.csv"
    if not fused.exists():
        from ai.pipeline.prepare_datasets import prepare

        prepare(ROOT / "data" / "raw", ROOT / "data" / "processed")

    df = pd.read_csv(fused)
    spark_meta = {"trained": False, "skipped": "pandas-only (yard × wind)"}
    if os.environ.get("EUROGATE_SPARK") == "1":
        try:
            spark_meta = train_spark_mllib(df, out_dir)
            print("[ml] spark", spark_meta)
        except Exception as exc:
            print(f"[ml] spark training skipped: {exc}")
            spark_meta = {"trained": False, "error": str(exc)}
    else:
        print("[ml] spark skipped (set EUROGATE_SPARK=1 to enable)")

    sk_meta = train_sklearn_twin(df, out_dir)
    print("[ml] sklearn serve twin", {"f1_weighted": sk_meta["f1_weighted"]})

    meta = {"spark": spark_meta, "sklearn_serve": sk_meta}
    (out_dir / "ml_meta.json").write_text(json.dumps(meta, indent=2), encoding="utf-8")


if __name__ == "__main__":
    main()
