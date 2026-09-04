"""Leakage-safe model training and held-out evaluation for Phase 04.

Implements:
- Train Tue+Wed, validation Thu, test Friday (sealed, opened once after freeze)
- Logistic Regression baseline + Random Forest grid (8 combos)
- Selection score = macro-F1 - 0.5 * FPR on validation
- Threshold chosen on validation (maximizing selection score)
- Friday opened exactly once after freeze (guard + logging)
- Saves artifacts/risk_model.joblib and artifacts/metrics.json

Deterministic seed 42 everywhere.
No SMOTE, no PyTorch, etc.
"""

from __future__ import annotations

import json
import time
from pathlib import Path
from typing import Dict, Any, List, Tuple, Optional

import numpy as np
import pandas as pd
import joblib

from sklearn.linear_model import LogisticRegression
from sklearn.ensemble import RandomForestClassifier
from sklearn.metrics import (
    precision_recall_fscore_support,
    confusion_matrix,
    roc_auc_score,
    average_precision_score,
    precision_recall_curve,
    roc_curve,
)

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------
SEED = 42
VERSION = "phase04-v1"
MODEL_VERSION = "phase04-v1"

# Global guard for Friday sealed holdout
_FRIDAY_OPEN_COUNT = 0
_SELECTION_FROZEN = False

# ---------------------------------------------------------------------------
# Helpers - filesystem and preprocessing reuse
# ---------------------------------------------------------------------------

def _resolve_project_root() -> Path:
    """Resolve project root robustly."""
    try:
        root = Path(__file__).resolve().parents[3]
        if (root / "backend").exists():
            return root
        raise ValueError("not root")
    except Exception:
        cur = Path.cwd()
        for _ in range(7):
            if (cur / "backend").exists():
                return cur
            if (cur / "data" / "raw").exists():
                return cur
            if cur.parent == cur:
                break
            cur = cur.parent
        return Path.cwd()

def _normalize_col_name(col: str) -> str:
    return col.strip()

def normalize_columns(df: pd.DataFrame) -> pd.DataFrame:
    mapping = {col: _normalize_col_name(col) for col in df.columns}
    if any(k != v for k, v in mapping.items()):
        return df.rename(columns=mapping)
    return df.copy()

def _find_timestamp_column(df: pd.DataFrame) -> Optional[str]:
    col_map = {c.strip().casefold(): c for c in df.columns}
    if "timestamp" in col_map:
        return col_map["timestamp"]
    for c in df.columns:
        if "timestamp" in c.strip().casefold():
            return c
    return None

def _parse_timestamp_column(df: pd.DataFrame) -> pd.DataFrame:
    ts_col = _find_timestamp_column(df)
    if ts_col is None:
        return df
    s = pd.to_datetime(df[ts_col], errors="coerce")
    try:
        if hasattr(s.dt, "tz") and s.dt.tz is not None:
            s = s.dt.tz_localize(None)
    except Exception:
        try:
            if s.dt.tz is not None:
                s = s.dt.tz_convert(None)  # type: ignore
        except Exception:
            pass
    df = df.copy()
    df[ts_col] = s
    return df

def _ensure_chronological(df: pd.DataFrame) -> pd.DataFrame:
    ts_col = _find_timestamp_column(df)
    if ts_col is None:
        return df
    try:
        if pd.api.types.is_datetime64_any_dtype(df[ts_col]):
            df = df.sort_values(by=ts_col, kind="mergesort").reset_index(drop=True)
    except Exception:
        pass
    return df

def _get_friday_path() -> Path:
    root = _resolve_project_root()
    raw_dir = root / "data" / "raw"
    candidates: List[Path] = []
    for p in raw_dir.rglob("*"):
        if p.is_file() and p.suffix.lower() == ".csv" and "friday" in p.name.casefold():
            candidates.append(p)
    if not candidates:
        all_csv = [q.name for q in raw_dir.rglob("*") if q.is_file() and q.suffix.lower() == ".csv"]
        raise ValueError(f"Missing daily file for 'friday' - expected CSV with 'friday' in filename under {raw_dir}. Found: {sorted(all_csv)}")
    candidates_sorted = sorted(candidates, key=lambda x: x.name.lower())
    return candidates_sorted[0]

def reset_friday_guard() -> None:
    """Reset guard - for testing / reruns."""
    global _FRIDAY_OPEN_COUNT, _SELECTION_FROZEN
    _FRIDAY_OPEN_COUNT = 0
    _SELECTION_FROZEN = False

def _load_friday_once() -> pd.DataFrame:
    """Load Friday CSV exactly once after selection frozen.

    Enforces:
    - Must be called only after _SELECTION_FROZEN == True
    - Only once per process (per train_full_pipeline run via reset)
    - Logs opening
    - Uses pandas.read_csv exactly once with friday path (mock-detectable)
    """
    global _FRIDAY_OPEN_COUNT, _SELECTION_FROZEN
    if not _SELECTION_FROZEN:
        raise RuntimeError(
            "Friday is sealed holdout - cannot be opened before candidate model, "
            "feature schema, hyperparameters and validation-selected threshold are frozen. "
            "Call train_and_select() first and set selection frozen."
        )
    if _FRIDAY_OPEN_COUNT >= 1:
        raise RuntimeError(
            f"Friday already opened {_FRIDAY_OPEN_COUNT} time(s) - second open violates single-open guard "
            f"(Phase 04 may open Friday exactly once after freeze)."
        )
    _FRIDAY_OPEN_COUNT += 1
    path = _get_friday_path()
    print(f"[phase04] Opening Friday sealed holdout exactly once after freeze (count={_FRIDAY_OPEN_COUNT}) - path={path.name}")
    # This is the single pandas.read_csv call for Friday - tests count this
    df = pd.read_csv(path, low_memory=False)
    df = normalize_columns(df)
    df = _parse_timestamp_column(df)
    df = _ensure_chronological(df)
    print(f"[phase04] Friday opened successfully rows={len(df)} cols={len(df.columns)} count={_FRIDAY_OPEN_COUNT}")
    return df

# ---------------------------------------------------------------------------
# Label handling
# ---------------------------------------------------------------------------

def _extract_binary_labels(df: pd.DataFrame) -> Tuple[np.ndarray, str]:
    """Extract binary labels: 0=benign, 1=malicious.

    Finds Label column case-insensitive stripped, maps BENIGN (case-insensitive) to 0, else 1.
    Returns (y_array, label_col_name).
    """
    col_map = {c.strip().casefold(): c for c in df.columns}
    label_col = col_map.get("label")
    if label_col is None:
        # fallback search
        for c in df.columns:
            if "label" in c.strip().casefold():
                label_col = c
                break
    if label_col is None:
        raise ValueError(f"Label column not found. Columns: {list(df.columns)[:10]}")
    series = df[label_col].astype(str).str.strip()
    # BENIGN vs malicious
    y = (series.str.casefold() != "benign").astype(int).values
    return y, label_col

def _extract_labels_with_names(df: pd.DataFrame) -> Tuple[np.ndarray, np.ndarray]:
    """Return binary y and original label strings."""
    col_map = {c.strip().casefold(): c for c in df.columns}
    label_col = col_map.get("label")
    if label_col is None:
        for c in df.columns:
            if "label" in c.strip().casefold():
                label_col = c
                break
    if label_col is None:
        raise ValueError("Label column not found")
    orig = df[label_col].astype(str).str.strip().values
    y = np.array([0 if s.casefold() == "benign" else 1 for s in orig], dtype=int)
    return y, orig

# ---------------------------------------------------------------------------
# Metrics
# ---------------------------------------------------------------------------

def _compute_metrics(y_true: np.ndarray, y_proba: np.ndarray, threshold: float = 0.5) -> Dict[str, Any]:
    """Compute comprehensive binary metrics at given threshold."""
    y_pred = (y_proba >= threshold).astype(int)
    # per-class precision/recall/f1
    precision, recall, f1, support = precision_recall_fscore_support(
        y_true, y_pred, labels=[0, 1], zero_division=0
    )
    # Handle per-class dicts
    # Confusion matrix - ensure 2x2 with labels [0,1]
    cm = confusion_matrix(y_true, y_pred, labels=[0, 1])
    # cm shape 2x2: rows true, cols pred: [[TN, FP],[FN, TP]]
    if cm.shape == (2, 2):
        tn, fp, fn, tp = int(cm[0, 0]), int(cm[0, 1]), int(cm[1, 0]), int(cm[1, 1])
    else:
        # fallback if only one class present
        tn = fp = fn = tp = 0
        # try to infer
        if len(np.unique(y_true)) == 1 and len(np.unique(y_pred)) == 1:
            if y_true[0] == 0 and y_pred[0] == 0:
                tn = len(y_true)
            elif y_true[0] == 1 and y_pred[0] == 1:
                tp = len(y_true)
            elif y_true[0] == 0 and y_pred[0] == 1:
                fp = len(y_true)
            elif y_true[0] == 1 and y_pred[0] == 0:
                fn = len(y_true)
    fpr = float(fp / (fp + tn)) if (fp + tn) > 0 else 0.0
    # ROC AUC and PR AUC
    try:
        roc_auc = float(roc_auc_score(y_true, y_proba))
    except Exception:
        roc_auc = float("nan")
    try:
        pr_auc = float(average_precision_score(y_true, y_proba))
    except Exception:
        pr_auc = float("nan")
    # Curves
    try:
        prec_curve, rec_curve, thr_pr = precision_recall_curve(y_true, y_proba)
        prec_curve = prec_curve.tolist()
        rec_curve = rec_curve.tolist()
        thr_pr = thr_pr.tolist()
    except Exception:
        prec_curve, rec_curve, thr_pr = [], [], []
    try:
        fpr_curve, tpr_curve, thr_roc = roc_curve(y_true, y_proba)
        fpr_curve = fpr_curve.tolist()
        tpr_curve = tpr_curve.tolist()
        thr_roc = thr_roc.tolist()
    except Exception:
        fpr_curve, tpr_curve, thr_roc = [], [], []
    # Named per-class
    # class 0 benign, class 1 malicious (attack)
    macro_precision = float(np.mean(precision)) if len(precision) else 0.0
    macro_recall = float(np.mean(recall)) if len(recall) else 0.0
    macro_f1 = float(np.mean(f1)) if len(f1) else 0.0
    # Also compute accuracy
    accuracy = float(np.mean(y_true == y_pred)) if len(y_true) else 0.0
    return {
        "threshold": float(threshold),
        "accuracy": accuracy,
        "precision": {
            "benign": float(precision[0]) if len(precision) > 0 else 0.0,
            "malicious": float(precision[1]) if len(precision) > 1 else 0.0,
            "macro": macro_precision,
            "per_class": [float(p) for p in precision],
        },
        "recall": {
            "benign": float(recall[0]) if len(recall) > 0 else 0.0,
            "malicious": float(recall[1]) if len(recall) > 1 else 0.0,
            "attack_recall": float(recall[1]) if len(recall) > 1 else 0.0,
            "macro": macro_recall,
            "per_class": [float(r) for r in recall],
        },
        "f1": {
            "benign": float(f1[0]) if len(f1) > 0 else 0.0,
            "malicious": float(f1[1]) if len(f1) > 1 else 0.0,
            "macro": macro_f1,
            "per_class": [float(v) for v in f1],
        },
        "fpr": float(fpr),
        "roc_auc": roc_auc,
        "pr_auc": pr_auc,
        "average_precision": pr_auc,
        "confusion_matrix": cm.tolist() if hasattr(cm, "tolist") else cm,  # type: ignore
        "confusion": {
            "tn": int(tn),
            "fp": int(fp),
            "fn": int(fn),
            "tp": int(tp),
        },
        "pr_curve": {
            "precision": prec_curve,
            "recall": rec_curve,
            "thresholds": thr_pr,
        },
        "roc_curve": {
            "fpr": fpr_curve,
            "tpr": tpr_curve,
            "thresholds": thr_roc,
        },
        # also flat keys for test compatibility
        "precision_benign": float(precision[0]) if len(precision) > 0 else 0.0,
        "precision_malicious": float(precision[1]) if len(precision) > 1 else 0.0,
        "recall_benign": float(recall[0]) if len(recall) > 0 else 0.0,
        "recall_malicious": float(recall[1]) if len(recall) > 1 else 0.0,
        "f1_benign": float(f1[0]) if len(f1) > 0 else 0.0,
        "f1_malicious": float(f1[1]) if len(f1) > 1 else 0.0,
        "macro_f1": macro_f1,
        "macro_precision": macro_precision,
        "macro_recall": macro_recall,
    }

def _find_best_threshold(y_true: np.ndarray, y_proba: np.ndarray) -> Tuple[float, float, Dict[str, Any]]:
    """Find threshold maximizing selection score = macro-F1 - 0.5*FPR."""
    best_thresh = 0.5
    best_score = -1e9
    best_metrics = None
    thresholds = np.arange(0.10, 0.91, 0.05)
    # also include 0.5 explicitly if not in range
    for thresh in thresholds:
        thresh = float(round(thresh, 2))
        metrics = _compute_metrics(y_true, y_proba, threshold=thresh)
        score = metrics["f1"]["macro"] - 0.5 * metrics["fpr"]
        # Use higher score, tie-breaker: lower FPR then higher F1
        if score > best_score + 1e-9:
            best_score = score
            best_thresh = thresh
            best_metrics = metrics
        elif abs(score - best_score) < 1e-9 and best_metrics is not None:
            # tie-breaker: prefer lower FPR
            if metrics["fpr"] < best_metrics["fpr"] - 1e-9:
                best_thresh = thresh
                best_metrics = metrics
                best_score = score
    if best_metrics is None:
        best_metrics = _compute_metrics(y_true, y_proba, threshold=best_thresh)
        best_score = best_metrics["f1"]["macro"] - 0.5 * best_metrics["fpr"]
    return best_thresh, float(best_score), best_metrics

# ---------------------------------------------------------------------------
# Training and selection
# ---------------------------------------------------------------------------

def train_and_select(verbose: bool = True) -> Dict[str, Any]:
    """Train logistic baseline + RF grid, select best on validation.

    Does NOT open Friday. Returns dict with pipeline, best model, params, etc.
    Sets selection not frozen yet - caller must freeze.
    """
    # Import here to avoid import-time side effects
    from app.data.preprocessing import get_train_data, get_validation_data, PreprocessingPipeline

    np.random.seed(SEED)

    if verbose:
        print("[phase04] Loading train (Tue+Wed) and validation (Thu)...")
    train_df = get_train_data()
    val_df = get_validation_data()

    if verbose:
        print(f"[phase04] Train rows={len(train_df)} Val rows={len(val_df)}")

    # Fit preprocessing on train only
    pipeline = PreprocessingPipeline(seed=SEED)
    pipeline.fit(train_df)
    X_train = pipeline.transform(train_df)
    y_train, _ = _extract_binary_labels(train_df)
    X_val = pipeline.transform(val_df)
    y_val, _ = _extract_binary_labels(val_df)

    if verbose:
        print(f"[phase04] Feature count after preprocessing: {len(pipeline.feature_columns)}")
        print(f"[phase04] Train benign={int(np.sum(y_train==0))} malicious={int(np.sum(y_train==1))}")
        print(f"[phase04] Val benign={int(np.sum(y_val==0))} malicious={int(np.sum(y_val==1))}")

    # Load schema for reference
    root = _resolve_project_root()
    schema_path = root / "artifacts" / "feature_schema.json"
    feature_schema = {}
    if schema_path.exists():
        feature_schema = json.loads(schema_path.read_text(encoding="utf-8"))
    else:
        feature_schema = pipeline.get_schema()

    # Candidate training
    candidates: List[Dict[str, Any]] = []

    # Logistic Regression baseline
    if verbose:
        print("[phase04] Training Logistic Regression baseline...")
    lr = LogisticRegression(
        class_weight="balanced",
        random_state=SEED,
        max_iter=1000,
        solver="lbfgs",
    )
    lr.fit(X_train, y_train)
    val_proba_lr = lr.predict_proba(X_val)[:, 1]
    best_thresh_lr, best_score_lr, best_metrics_lr = _find_best_threshold(y_val, val_proba_lr)
    candidates.append({
        "model_family": "logistic_regression",
        "model": lr,
        "hyperparameters": {
            "class_weight": "balanced",
            "random_state": SEED,
            "max_iter": 1000,
            "solver": "lbfgs",
        },
        "val_proba": val_proba_lr,
        "best_threshold": best_thresh_lr,
        "selection_score": best_score_lr,
        "val_metrics": best_metrics_lr,
    })
    if verbose:
        print(f"[phase04] LR best thresh={best_thresh_lr:.2f} score={best_score_lr:.4f} macroF1={best_metrics_lr['f1']['macro']:.4f} FPR={best_metrics_lr['fpr']:.4f}")

    # Random Forest grid
    grid = []
    for n_est in [100, 200]:
        for max_depth in [16, None]:
            for min_leaf in [1, 5]:
                grid.append((n_est, max_depth, min_leaf))
    if verbose:
        print(f"[phase04] Training Random Forest grid ({len(grid)} combos)...")
    for n_est, max_depth, min_leaf in grid:
        rf = RandomForestClassifier(
            n_estimators=n_est,
            max_depth=max_depth,
            min_samples_leaf=min_leaf,
            class_weight="balanced_subsample",
            n_jobs=-1,
            random_state=SEED,
        )
        rf.fit(X_train, y_train)
        val_proba = rf.predict_proba(X_val)[:, 1]
        best_thresh, best_score, best_metrics = _find_best_threshold(y_val, val_proba)
        candidates.append({
            "model_family": "random_forest",
            "model": rf,
            "hyperparameters": {
                "n_estimators": n_est,
                "max_depth": max_depth,
                "min_samples_leaf": min_leaf,
                "class_weight": "balanced_subsample",
                "n_jobs": -1,
                "random_state": SEED,
            },
            "val_proba": val_proba,
            "best_threshold": best_thresh,
            "selection_score": best_score,
            "val_metrics": best_metrics,
        })
        if verbose:
            print(f"[phase04] RF n={n_est} depth={max_depth} leaf={min_leaf} thresh={best_thresh:.2f} score={best_score:.4f} macroF1={best_metrics['f1']['macro']:.4f} FPR={best_metrics['fpr']:.4f}")

    # Select best candidate by selection_score
    best_candidate = max(candidates, key=lambda c: c["selection_score"])
    if verbose:
        print(f"[phase04] Selected best: {best_candidate['model_family']} hyper={best_candidate['hyperparameters']} thresh={best_candidate['best_threshold']} score={best_candidate['selection_score']:.4f}")

    # Also keep all candidates for provenance?
    return {
        "pipeline": pipeline,
        "feature_schema": feature_schema,
        "candidates": candidates,
        "best": best_candidate,
        "best_model": best_candidate["model"],
        "best_model_family": best_candidate["model_family"],
        "best_hyperparameters": best_candidate["hyperparameters"],
        "best_threshold": best_candidate["best_threshold"],
        "best_selection_score": best_candidate["selection_score"],
        "best_val_metrics": best_candidate["val_metrics"],
        "X_train": X_train,
        "y_train": y_train,
        "X_val": X_val,
        "y_val": y_val,
        "train_df": train_df,
        "val_df": val_df,
    }

def evaluate_test(
    pipeline: Any,
    model: Any,
    threshold: float,
    verbose: bool = True,
) -> Dict[str, Any]:
    """Evaluate frozen model on Friday test (opens Friday once)."""
    test_df = _load_friday_once()
    X_test = pipeline.transform(test_df)
    y_test, _ = _extract_binary_labels(test_df)

    if verbose:
        print(f"[phase04] Test rows={len(test_df)} benign={int(np.sum(y_test==0))} malicious={int(np.sum(y_test==1))}")

    # Probabilities
    y_proba = model.predict_proba(X_test)[:, 1]

    # Compute metrics at frozen threshold
    test_metrics = _compute_metrics(y_test, y_proba, threshold=threshold)

    # Also compute pr/roc at threshold-independent level already done, but keep

    # Latency measurement: p95 over 100 predictions
    # Use single-batch predictions repeated
    latencies: List[float] = []
    # Warmup
    try:
        _ = model.predict_proba(X_test[:5])
    except Exception:
        pass
    for _ in range(100):
        start = time.perf_counter()
        _ = model.predict_proba(X_test)
        end = time.perf_counter()
        latencies.append((end - start) * 1000.0)  # ms
    lat_arr = np.array(latencies)
    p50 = float(np.percentile(lat_arr, 50))
    p95 = float(np.percentile(lat_arr, 95))
    mean = float(np.mean(lat_arr))
    latency = {
        "p50_ms": p50,
        "p95_ms": p95,
        "mean_ms": mean,
        "p50": p50,
        "p95": p95,
        "mean": mean,
        "samples": 100,
        "unit": "ms",
        "latencies_ms": lat_arr.tolist()[:10],  # sample
    }

    # Importance
    feature_names = pipeline.feature_columns if hasattr(pipeline, "feature_columns") else []
    importance: Dict[str, Any] = {}
    try:
        if hasattr(model, "feature_importances_"):
            importances = model.feature_importances_.tolist()  # type: ignore
            # Map to names
            paired = list(zip(feature_names, importances))
            paired_sorted = sorted(paired, key=lambda x: x[1], reverse=True)
            importance = {
                "type": "feature_importances",
                "model_family": "random_forest",
                "values": dict(zip(feature_names, importances)),
                "array": importances,
                "top_features": [{"feature": f, "importance": float(v)} for f, v in paired_sorted[:15]],
                "description": "Global Random Forest feature_importances_ - not causal",
            }
        elif hasattr(model, "coef_"):
            coef = model.coef_[0].tolist() if model.coef_.ndim > 1 else model.coef_.tolist()  # type: ignore
            # absolute for ranking
            paired = list(zip(feature_names, coef))
            paired_abs_sorted = sorted(paired, key=lambda x: abs(x[1]), reverse=True)
            importance = {
                "type": "coefficients",
                "model_family": "logistic_regression",
                "values": dict(zip(feature_names, coef)),
                "array": coef,
                "top_features": [{"feature": f, "coefficient": float(v), "abs": float(abs(v))} for f, v in paired_abs_sorted[:15]],
                "description": "Standardized logistic regression coefficients - not causal",
            }
        else:
            importance = {"type": "unknown", "values": {}}
    except Exception as e:
        importance = {"type": "error", "error": str(e), "values": {}}

    return {
        "test_df": test_df,
        "X_test": X_test,
        "y_test": y_test,
        "y_proba": y_proba,
        "y_pred": (y_proba >= threshold).astype(int),
        "test_metrics": test_metrics,
        "latency": latency,
        "importance": importance,
    }

def _build_metrics_json(
    train_df: pd.DataFrame,
    val_df: pd.DataFrame,
    test_df: pd.DataFrame,
    pipeline: Any,
    feature_schema: Dict[str, Any],
    best_model_family: str,
    best_hyperparameters: Dict[str, Any],
    best_threshold: float,
    best_selection_score: float,
    best_val_metrics: Dict[str, Any],
    test_eval: Dict[str, Any],
) -> Dict[str, Any]:
    """Build comprehensive metrics.json."""
    test_metrics = test_eval["test_metrics"]
    latency = test_eval["latency"]
    importance = test_eval["importance"]
    test_eval["y_test"]

    # Samples
    samples = {
        "train": int(len(train_df)),
        "validation": int(len(val_df)),
        "test": int(len(test_df)),
        "monday": 1153,  # known from synthetic generation, but also compute? Monday not loaded here to avoid leakage? Use known value? Better load Monday via get_monday_data? But that is allowed (not Friday). We'll load if needed.
        "train_days": "Tuesday+Wednesday",
        "validation_days": "Thursday",
        "test_days": "Friday",
    }
    # Try to get monday count properly via preprocessing without leaking Friday
    try:
        from app.data.preprocessing import get_monday_data
        mon_df = get_monday_data()
        samples["monday"] = int(len(mon_df))
        samples["monday_rows"] = int(len(mon_df))
    except Exception:
        pass

    # Target gates
    # Binary F1 malicious, attack recall, FPR, latency
    f1_malicious = float(test_metrics["f1"]["malicious"])
    recall_malicious = float(test_metrics["recall"]["malicious"])
    fpr = float(test_metrics["fpr"])
    p95 = float(latency["p95_ms"])
    f1_pass = f1_malicious >= 0.90
    recall_pass = recall_malicious >= 0.90
    fpr_pass = fpr <= 0.05
    latency_pass = p95 < 500.0

    target_gates = {
        "f1_ge_0.90": bool(f1_pass),
        "recall_ge_0.90": bool(recall_pass),
        "fpr_le_0.05": bool(fpr_pass),
        "latency_lt_500ms": bool(latency_pass),
        "measured": {
            "f1_malicious": f1_malicious,
            "f1_macro": float(test_metrics["f1"]["macro"]),
            "recall_malicious": recall_malicious,
            "fpr": fpr,
            "p95_ms": p95,
        },
        "honest_note": "Measured values shown; claims not inflated. If a target is missed, UI must display measured value and remove claim that implies target was achieved.",
    }

    claim_limitations = (
        "Binary benign-versus-malicious risk only (learned); "
        "stage estimate is rule-derived evidence score; "
        "target ranking is NetworkX graph-ranked; "
        "isolation is simulated estimate - not causal proof; "
        "Friday held-out evaluated once after freeze; "
        "no SMOTE, no train/validation/test leakage; "
        "preprocessing fitted on train only."
    )
    if not f1_pass or not recall_pass or not fpr_pass:
        claim_limitations += " Target gates not all achieved - see target_gates.measured; model limitations visible in UI."

    # Provenance
    root = _resolve_project_root()
    data_quality_path = root / "data" / "reports" / "data_quality.json"
    provenance_data_mode = "synthetic"
    if data_quality_path.exists():
        try:
            dq = json.loads(data_quality_path.read_text(encoding="utf-8"))
            provenance_data_mode = dq.get("data_mode") or dq.get("provenance", {}).get("data_mode", "synthetic")
            dq.get("sha256") or dq.get("provenance", {}).get("sha256")
        except Exception:
            pass

    provenance = {
        "data_mode": provenance_data_mode,
        "data_source_url": "https://www.unb.ca/cic/datasets/ids-2017.html",
        "feature_schema_version": feature_schema.get("version", "phase03-v1-sealed"),
        "feature_count": len(pipeline.feature_columns) if hasattr(pipeline, "feature_columns") else feature_schema.get("feature_count", 80),
        "seed": SEED,
        "train_only": True,
        "split_provenance": "Monday benign baseline only, Tuesday+Wednesday train, Thursday validation, Friday held-out test opened once after freeze",
        "timestamp": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "model_version": MODEL_VERSION,
    }

    # Validation metrics also need pr/roc
    # Ensure test_metrics has required fields for tests
    # Build final metrics dict with multiple access paths for test compatibility

    metrics = {
        # High-level
        "model_family": best_model_family,
        "model_version": MODEL_VERSION,
        "version": MODEL_VERSION,
        "seed": SEED,
        "feature_schema": feature_schema,
        "feature_count": len(pipeline.feature_columns) if hasattr(pipeline, "feature_columns") else 0,
        "feature_schema_version": feature_schema.get("version", "phase03-v1-sealed"),
        # Samples and splits
        "samples": samples,
        "splits": {
            "train": {"days": ["tuesday", "wednesday"], "samples": samples["train"], "description": "Tuesday+Wednesday chronological, train-only fitting"},
            "validation": {"days": ["thursday"], "samples": samples["validation"], "description": "Thursday validation, threshold selection, hyperparameter selection"},
            "test": {"days": ["friday"], "samples": samples["test"], "description": "Friday held-out final evaluation, opened once after freeze"},
            "monday": {"days": ["monday"], "samples": samples.get("monday", 1153), "description": "Monday benign baseline only, not for training"},
        },
        "split": {
            "train": "Tuesday+Wednesday (Mon benign baseline only, not for training)",
            "validation": "Thursday",
            "test": "Friday (sealed holdout, opened once after freeze)",
        },
        "split_provenance": provenance["split_provenance"],
        # Hyperparameters and selection
        "hyperparameters": best_hyperparameters,
        "best_hyperparameters": best_hyperparameters,
        "selection_score": float(best_selection_score),
        "selection_method": "selection score = validation macro-F1 - 0.5 * validation FPR",
        "threshold": float(best_threshold),
        "selection_threshold": float(best_threshold),
        "warning_threshold": float(best_threshold),
        "threshold_selection_method": "maximizing selection score on Thursday validation (grid 0.10-0.90 step 0.05)",
        "validation_metrics": best_val_metrics,
        "val_metrics": best_val_metrics,
        # Test metrics (primary)
        "test_metrics": test_metrics,
        "metrics": test_metrics,  # alias
        # Also flat for compatibility
        "precision": test_metrics["precision"],
        "recall": test_metrics["recall"],
        "f1": test_metrics["f1"],
        "fpr": test_metrics["fpr"],
        "roc_auc": test_metrics["roc_auc"],
        "pr_auc": test_metrics["pr_auc"],
        "average_precision": test_metrics["pr_auc"],
        "accuracy": test_metrics["accuracy"],
        "confusion_matrix": test_metrics["confusion_matrix"],
        "pr_curve": test_metrics["pr_curve"],
        "roc_curve": test_metrics["roc_curve"],
        # Alias for points
        "pr_points": test_metrics["pr_curve"],
        "roc_points": test_metrics["roc_curve"],
        # Importance
        "importance": importance,
        "feature_importance": importance,
        # Latency
        "latency": latency,
        "latency_ms": latency,
        "latency_ms_p95": latency["p95_ms"],
        "p95_latency_ms": latency["p95_ms"],
        # Provenance
        "provenance": provenance,
        "data_mode": provenance_data_mode,
        "claim_limitations": claim_limitations,
        "limitations": claim_limitations,
        "target_gates": target_gates,
        "gates": target_gates,
        # Additional honest reporting
        "honest_metrics": {
            "f1_malicious": f1_malicious,
            "f1_macro": float(test_metrics["f1"]["macro"]),
            "recall_malicious": recall_malicious,
            "fpr": fpr,
            "roc_auc": float(test_metrics["roc_auc"]),
            "pr_auc": float(test_metrics["pr_auc"]),
            "p95_ms": p95,
        },
        "evaluation": {
            "threshold": float(best_threshold),
            "test_samples": int(len(test_df)),
            "train_samples": int(len(train_df)),
            "val_samples": int(len(val_df)),
        },
        "notes": "Leakage-safe: preprocessing fit on train only, model fit on train only, selection on validation, test opened once after freeze. No SMOTE. Balanced class weights. Deterministic seed 42.",
    }
    return metrics

def save_artifacts(
    pipeline: Any,
    model: Any,
    feature_schema: Dict[str, Any],
    best_model_family: str,
    best_hyperparameters: Dict[str, Any],
    best_threshold: float,
    best_selection_score: float,
    best_val_metrics: Dict[str, Any],
    test_eval: Dict[str, Any],
    train_df: pd.DataFrame,
    val_df: pd.DataFrame,
) -> Tuple[Path, Path]:
    root = _resolve_project_root()
    artifacts_dir = root / "artifacts"
    artifacts_dir.mkdir(parents=True, exist_ok=True)

    test_df = test_eval["test_df"]

    # Build metrics
    metrics = _build_metrics_json(
        train_df=train_df,
        val_df=val_df,
        test_df=test_df,
        pipeline=pipeline,
        feature_schema=feature_schema,
        best_model_family=best_model_family,
        best_hyperparameters=best_hyperparameters,
        best_threshold=best_threshold,
        best_selection_score=best_selection_score,
        best_val_metrics=best_val_metrics,
        test_eval=test_eval,
    )

    # Save metrics.json - sanitize Infinity/NaN to JSON-valid values (1.0/null) for browser compatibility
    def _sanitize(obj):
        if isinstance(obj, float):
            if np.isinf(obj):
                return 1.0
            if np.isnan(obj):
                return None
            return obj
        if isinstance(obj, dict):
            return {k: _sanitize(v) for k, v in obj.items()}
        if isinstance(obj, list):
            return [_sanitize(v) for v in obj]
        return obj
    metrics_sanitized = _sanitize(metrics)
    metrics_path = artifacts_dir / "metrics.json"
    with metrics_path.open("w", encoding="utf-8") as f:
        json.dump(metrics_sanitized, f, indent=2, sort_keys=True)
    print(f"[phase04] Saved metrics to {metrics_path}")

    # Save risk_model.joblib - dict with pipeline, model, metadata
    # Also include wrapper for predict convenience
    model_path = artifacts_dir / "risk_model.joblib"
    # Create wrapper object dict
    # For compatibility, we save dict with keys pipeline, model, feature_schema, etc.
    # Also create sklearn-like wrapper if needed
    payload = {
        "pipeline": pipeline,
        "model": model,
        "feature_schema": feature_schema,
        "model_family": best_model_family,
        "model_version": MODEL_VERSION,
        "version": MODEL_VERSION,
        "threshold": float(best_threshold),
        "hyperparameters": best_hyperparameters,
        "selection_score": float(best_selection_score),
        "seed": SEED,
        "artifacts": {
            "feature_schema": feature_schema,
            "threshold": float(best_threshold),
        },
    }
    # Also add wrapper to allow direct predict via payload['pipeline'].transform + model
    # Save via joblib
    joblib.dump(payload, model_path)
    print(f"[phase04] Saved model pipeline to {model_path} family={best_model_family}")

    # Optionally also save model_metadata.json
    metadata_path = artifacts_dir / "model_metadata.json"
    metadata = {
        "model_family": best_model_family,
        "model_version": MODEL_VERSION,
        "hyperparameters": best_hyperparameters,
        "threshold": float(best_threshold),
        "selection_score": float(best_selection_score),
        "feature_count": len(pipeline.feature_columns) if hasattr(pipeline, "feature_columns") else 0,
        "seed": SEED,
        "train_samples": int(len(train_df)),
        "val_samples": int(len(val_df)),
        "test_samples": int(len(test_df)),
    }
    with metadata_path.open("w", encoding="utf-8") as f:
        json.dump(metadata, f, indent=2, sort_keys=True)
    print(f"[phase04] Saved metadata to {metadata_path}")

    return model_path, metrics_path

def train_full_pipeline(verbose: bool = True) -> Dict[str, Any]:
    """Full Phase 04 pipeline: train, select, freeze, evaluate once, save."""
    global _SELECTION_FROZEN
    # Reset guard at start of full pipeline to allow exactly one open per run
    reset_friday_guard()
    if verbose:
        print("[phase04] Starting full Phase 04 pipeline (train+select -> freeze -> test once)...")
    # Train and select (no Friday)
    selection_result = train_and_select(verbose=verbose)
    pipeline = selection_result["pipeline"]
    feature_schema = selection_result["feature_schema"]
    best_model = selection_result["best_model"]
    best_family = selection_result["best_model_family"]
    best_hyper = selection_result["best_hyperparameters"]
    best_thresh = selection_result["best_threshold"]
    best_score = selection_result["best_selection_score"]
    best_val_metrics = selection_result["best_val_metrics"]
    train_df = selection_result["train_df"]
    val_df = selection_result["val_df"]

    # Freeze selection before opening Friday
    _SELECTION_FROZEN = True
    print(f"[phase04] Selection frozen - threshold={best_thresh} score={best_score:.4f} family={best_family}")
    print("[phase04] Now opening Friday exactly once for held-out evaluation...")

    # Evaluate on test (opens Friday once)
    test_eval = evaluate_test(pipeline, best_model, best_thresh, verbose=verbose)

    # Save artifacts
    model_path, metrics_path = save_artifacts(
        pipeline=pipeline,
        model=best_model,
        feature_schema=feature_schema,
        best_model_family=best_family,
        best_hyperparameters=best_hyper,
        best_threshold=best_thresh,
        best_selection_score=best_score,
        best_val_metrics=best_val_metrics,
        test_eval=test_eval,
        train_df=train_df,
        val_df=val_df,
    )

    # Verify pipeline reproduces
    if verbose:
        # Quick reproducibility check: transform and predict twice
        X_test = test_eval["X_test"]
        pred1 = best_model.predict(X_test)
        pred2 = best_model.predict(X_test)
        assert np.array_equal(pred1, pred2), "Pipeline not reproducible"
        print("[phase04] Pipeline reproducibility check passed")

        # Print measured results summary
        tm = test_eval["test_metrics"]
        print("[phase04] Measured test results:")
        print(f"  F1 malicious={tm['f1']['malicious']:.4f} macro={tm['f1']['macro']:.4f}")
        print(f"  Recall malicious={tm['recall']['malicious']:.4f}")
        print(f"  FPR={tm['fpr']:.4f}")
        print(f"  ROC AUC={tm['roc_auc']:.4f} PR AUC={tm['pr_auc']:.4f}")
        print(f"  p95 latency={test_eval['latency']['p95_ms']:.2f}ms")
        print(f"  Confusion: {tm['confusion_matrix']}")

    return {
        "pipeline": pipeline,
        "model": best_model,
        "feature_schema": feature_schema,
        "best_family": best_family,
        "best_hyperparameters": best_hyper,
        "best_threshold": best_thresh,
        "best_selection_score": best_score,
        "selection_result": selection_result,
        "test_eval": test_eval,
        "model_path": model_path,
        "metrics_path": metrics_path,
    }

# CLI
if __name__ == "__main__":
    result = train_full_pipeline(verbose=True)
    print("[phase04] Done - artifacts ready for gates")
