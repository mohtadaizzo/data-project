# EUROGATE Risk Platform — MERN + MongoDB + PySpark (ML/DL)

Plateforme de gestion des risques terminal portuaire (EUROGATE Tanger).

## Stack

| Couche | Techno |
|--------|--------|
| Client | React + Vite + Tailwind (`client/`) |
| Server | Express + Mongoose + Socket.io (`server/`) |
| Database | MongoDB local (Compass) |
| AI | PySpark ETL + Spark MLlib (ML) + PyTorch MLP (DL) (`ai/`) |

## Prérequis

- Node.js 20+
- MongoDB Community (service démarré) + Compass
- Python 3.10+ et **Java 11+** (requis par PySpark)
- pip packages : voir `ai/requirements.txt`

## Démarrage rapide (Windows)

Détail : [`docs/RUN.md`](docs/RUN.md) · IA : [`docs/AI.md`](docs/AI.md)

### 1. MongoDB

URI Compass : `mongodb://127.0.0.1:27017/eurogate_risk`

### 2. Données + modèles IA

```bat
cd eurogate-risk-platform
pip install -r ai\requirements.txt
set PYTHONPATH=.
set JAVA_HOME=C:\Program Files\Microsoft\jdk-11.0.31.11-hotspot
python -m ai.pipeline.run_spark_etl
python -m ai.training.train_all
```

### 3. Seed Mongo + API Express (:5000)

```bat
cd server
copy .env.example .env
npm install
npm run seed
npm run dev
```

### 4. Service IA (:8001)

```bat
set PYTHONPATH=.
uvicorn ai.serving.app:app --host 127.0.0.1 --port 8001
```

### 5. Frontend (:5173)

```bat
cd client
npm install
npm run dev
```

Helpers : `run.bat etl|train|seed|server|ai|client`

## Architecture

```
client/   → React dashboard + Yard 2D TOS
server/   → Express REST + Socket.io + MongoDB
ai/       → PySpark + ML + DL + FastAPI :8001
data/     → raw + processed
```

## Collections MongoDB (Compass)

- `containers` — inventaire yard
- `weather` — climat
- `risk_assessments` — scores / niveaux
- `alerts` — alertes vertes / oranges / rouges
- `models_meta` — versions ML/DL + métriques
"# data-project" 
