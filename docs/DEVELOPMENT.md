# Développement local

## Prérequis

- Python 3.11+
- Node.js 20+
- Docker (optionnel, recommandé pour Postgres)

## Pipeline données + modèle

```bash
# Depuis la racine du projet
set PYTHONPATH=.
python -m ai.pipeline.prepare_datasets --raw-dir data/raw --out-dir data/processed
python -m ai.training.train --data-dir data --out-dir ai/artifacts --algo random_forest
# Alternatives: --algo xgboost | --algo lightgbm
```

## Backend (SQLite local)

Le fichier `.env` pointe par défaut sur SQLite pour un démarrage rapide.

```bash
set PYTHONPATH=.;backend
cd backend
python -m uvicorn app.main:app --reload --port 8000
```

## Frontend

```bash
cd frontend
npm install
npm run dev
```

Ouvrir http://localhost:5173

## Docker Compose (PostgreSQL + full stack)

```bash
# Adapter DATABASE_URL dans .env pour Postgres avant compose
docker compose up --build
```

- UI : http://localhost:3000
- API : http://localhost:8000/docs
