# Intelligence artificielle — PySpark + ML + DL

## Pipeline

1. **ETL PySpark** — `python -m ai.pipeline.run_spark_etl`
   - Ingestion Yard + Climat via Spark
   - Enrichissement, **topologie TOS réelle** (voisins 4-voies, isolation), labels
     `Stability_Score` (pile) + `Container_Score` (IMO) → `Risk_Score`
   - Pas de positions aléatoires : Block / Bay / Row / Tier du fichier yard
   - Un même snapshot vent pour tout le terminal
   - Sortie : `data/processed/fused_risk_dataset.csv` (+ parquet)

2. **ML** — `python -m ai.training.train_ml`
   - Spark MLlib RandomForest (métriques dans `ai/artifacts/ml_meta.json`)
   - Twin sklearn RandomForest (`ml_model.joblib`) pour l’API — utilisé en serving
   - Sur Windows, la sauvegarde du `PipelineModel` Spark peut échouer sans `HADOOP_HOME`/winutils ; l’entraînement et les métriques restent valides

3. **DL** — `python -m ai.training.train_dl`
   - MLP PyTorch (Low / Medium / High) → `ai/artifacts/dl_model.pt`

4. **Tout** — `python -m ai.training.train_all`

5. **Serving** — `uvicorn ai.serving.app:app --port 8001`
   - `GET /health`
   - `POST /predict?model=ensemble|ml|dl|rules`

## Prérequis Windows

```bat
set JAVA_HOME=C:\Program Files\Microsoft\jdk-11.0.31.11-hotspot
set PYSPARK_PYTHON=C:\Python313\python.exe
set PYSPARK_DRIVER_PYTHON=%PYSPARK_PYTHON%
set PYTHONPATH=.
pip install -r ai\requirements.txt
```

Java 11+ requis pour PySpark. Ajuster les chemins selon l’installation locale.
