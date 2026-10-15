# Mapping des datasets EUROGATE

Entraînement = **uniquement** tes deux fichiers, sans colonnes inventées.

## Yard (`yard_units_positions`)

| Source | Utilisé comme |
|--------|----------------|
| `hdhand` | `Container_ID` |
| `park` | `Block` |
| `bay` | `Bay` |
| `row` | `Row` |
| `Tier` | `Tier` |
| `CheckIn` | `Entry_Date` |
| `isFull` | `Is_Full` |
| `isReefer` | `Is_Reefer` |
| `isIMDG` | `Is_IMDG` |

Dérivé des positions TOS (pas inventé) : hauteur de pile, rang, voisins gauche/droite.

## Climat (`tanger_windspeed_2027`)

| Source | Utilisé comme |
|--------|----------------|
| `Date` | `Weather_DateTime` |
| `Predicted_WindSpeed_kmh` | `Wind_Speed_kmh` |

**Rien d’autre** : pas de rafales, température, pluie, visibilité, etc.

## Fusion entraînement

Chaque conteneur du yard est croisé avec **chaque jour de vent** (`fused_risk_dataset.csv`).
Les labels `Risk_Level` (Low / Medium / High) viennent des règles métier : pile + voisinage + vent + IMDG.
