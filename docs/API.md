# EUROGATE Risk Platform API

Base URL: `http://localhost:8000`

## Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/v1/health` | Santé API |
| GET | `/api/v1/dashboard/summary` | KPIs + blocs + séries |
| GET | `/api/v1/containers` | Inventaire yard |
| GET | `/api/v1/weather` | Observations météo |
| GET | `/api/v1/risks` | Évaluations de risque |
| GET | `/api/v1/alerts` | Historique alertes |
| POST | `/api/v1/alerts/{id}/ack` | Accuser réception |
| POST | `/api/v1/predict` | Prédiction + SHAP |
| POST | `/api/v1/yolo/detect` | Détection piles (bonus) |
| POST | `/api/v1/admin/seed` | Seed DB |
| WS | `/ws/alerts` | Stream alertes temps réel |

Interactive docs: `/docs` (Swagger) et `/redoc`.
