"""Run ML (PySpark/sklearn) + DL (PyTorch) training."""

from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))


def main() -> None:
    from ai.training.train_ml import main as train_ml_main
    from ai.training import train_dl as train_dl_mod

    out = ROOT / "ai" / "artifacts"
    out.mkdir(parents=True, exist_ok=True)

    print("[train_all] preparing yard × wind…")
    from ai.pipeline.prepare_datasets import prepare

    prepare(ROOT / "data" / "raw", ROOT / "data" / "processed")

    print("[train_all] ML…")
    train_ml_main()
    print("[train_all] DL…")
    dl_meta = train_dl_mod.train_dl()

    ml_meta = {}
    ml_path = out / "ml_meta.json"
    if ml_path.exists():
        ml_meta = json.loads(ml_path.read_text(encoding="utf-8"))

    combined = {
        "ml": ml_meta,
        "dl": dl_meta,
    }
    (out / "train_meta.json").write_text(json.dumps(combined, indent=2), encoding="utf-8")
    print("[train_all] done -> ai/artifacts/train_meta.json")


if __name__ == "__main__":
    main()
