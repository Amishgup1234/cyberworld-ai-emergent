#!/usr/bin/env python3
"""Acquisition helper for CICIDS2017 - wraps backend.app.data.audit.

Tries to download the official MachineLearningCSV.zip source
(https://www.unb.ca/cic/datasets/ids-2017.html) to data/raw/ if not present,
but is idempotent — rerun without re-downloading if already present.

If offline or archive not present, generates deterministic synthetic CSVs
under data/raw/ so audit can still run.

Usage:
    python scripts/download_dataset.py
    python -m backend.app.data.audit
"""

import sys
from pathlib import Path

# Ensure backend is importable
ROOT = Path(__file__).resolve().parents[1]
if str(ROOT / "backend") not in sys.path:
    sys.path.insert(0, str(ROOT / "backend"))

from app.data.audit import run_audit

if __name__ == "__main__":
    print("=== CyberWorld AI - Dataset Acquisition ===")
    print(f"Official source: https://www.unb.ca/cic/datasets/ids-2017.html")
    result = run_audit()
    print(f"\nDone. Data mode: {result['data_mode']}")
    print(f"Reports: data/reports/data_quality.json")
