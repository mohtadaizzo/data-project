# Lancement MERN + MongoDB Compass + AI



Trois terminaux + MongoDB local.



## 1. MongoDB



Démarrer MongoDB Community. Dans Compass :



- URI : `mongodb://127.0.0.1:27017/eurogate_risk`

- Après seed : collections `containers`, `weather`, `risk_assessments`, `alerts`, `models_meta`



## 2. AI (ETL + train) — une fois



```bat

cd C:\stage\eurogate-risk-platform

pip install -r ai\requirements.txt

set PYTHONPATH=.

set JAVA_HOME=C:\Program Files\Microsoft\jdk-11.0.31.11-hotspot

set PYSPARK_PYTHON=C:\Python313\python.exe

set PYSPARK_DRIVER_PYTHON=%PYSPARK_PYTHON%

python -m ai.pipeline.run_spark_etl

python -m ai.training.train_all

```



Ou : `run.bat etl` puis `run.bat train`



## 3. Seed + Express (:5000)



```bat

cd server

npm install

npm run seed

npm run dev

```



- Health : http://localhost:5000/api/v1/health

- Dashboard : http://localhost:5000/api/v1/dashboard/summary



## 4. AI inference (:8001)



```bat

cd C:\stage\eurogate-risk-platform

set PYTHONPATH=.

uvicorn ai.serving.app:app --host 127.0.0.1 --port 8001

```



Ou : `run.bat ai`



## 5. React client (:5173)



```bat

cd client

npm install

npm run dev

```



→ http://localhost:5173  

`VITE_API_URL` pointe vers Express `http://localhost:5000`



## Ordre recommandé au quotidien



1. `mongod` (si pas en service Windows)

2. Terminal A — Express (`run.bat server`) après seed si besoin

3. Terminal B — AI (`run.bat ai`)

4. Terminal C — Client (`run.bat client`)

