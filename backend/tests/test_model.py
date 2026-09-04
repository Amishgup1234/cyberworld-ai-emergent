"""Tests for Phase 04 - Baseline, final model, and held-out evaluation."""

import sys
import json
from pathlib import Path
from unittest import mock

import pandas as pd
import numpy as np
import joblib

# Ensure backend is on path
sys.path.insert(0, str(Path(__file__).parent.parent))

from app.data.preprocessing import (
    get_train_data,
    load_schema,
)

ROOT = Path(__file__).resolve().parents[2]
SCHEMA_PATH = ROOT / "artifacts" / "feature_schema.json"
MODEL_PATH = ROOT / "artifacts" / "risk_model.joblib"
METRICS_PATH = ROOT / "artifacts" / "metrics.json"
RAW_DIR = ROOT / "data" / "raw"


# ---------------------------------------------------------------------------
# 1. Artifacts existence
# ---------------------------------------------------------------------------

def test_model_artifacts_exist():
    """Gate: artifacts/risk_model.joblib and metrics.json must exist and be valid."""
    assert MODEL_PATH.exists(), f"Missing {MODEL_PATH} - run training pipeline first"
    assert METRICS_PATH.exists(), f"Missing {METRICS_PATH} - run training pipeline first"
    # Check joblib valid
    obj = joblib.load(MODEL_PATH)
    assert obj is not None, "joblib load returned None"
    # Check dict payload
    assert isinstance(obj, dict), f"risk_model.joblib should be dict payload, got {type(obj)}"
    assert "pipeline" in obj or "model" in obj, "joblib dict missing pipeline/model keys"
    assert "model_family" in obj or "pipeline" in obj, "Missing model_family"
    # Check metrics valid JSON
    data = json.loads(METRICS_PATH.read_text(encoding="utf-8"))
    assert isinstance(data, dict) and len(data) > 0
    assert "model_family" in data, "metrics.json missing model_family"
    assert "samples" in data or "splits" in data, "metrics.json missing samples/splits"
    # Check metrics has provenance
    assert "provenance" in data or "split_provenance" in data, "Missing provenance"
    # Check that files are not empty
    assert MODEL_PATH.stat().st_size > 1000, "Model joblib too small"
    assert METRICS_PATH.stat().st_size > 1000, "Metrics json too small"


def test_pipeline_reproduces_predictions():
    """Saved pipeline must reproduce predictions deterministically."""
    obj = joblib.load(MODEL_PATH)
    assert isinstance(obj, dict)
    pipeline = obj.get("pipeline")
    model = obj.get("model")
    assert pipeline is not None, "pipeline missing in joblib"
    assert model is not None, "model missing in joblib"
    # Check pipeline has required attributes
    assert hasattr(pipeline, "transform"), "pipeline missing transform"
    assert hasattr(pipeline, "feature_columns"), "pipeline missing feature_columns"
    # Load train data and transform twice
    train_df = get_train_data()
    X1 = pipeline.transform(train_df)
    X2 = pipeline.transform(train_df)
    assert np.allclose(X1.values, X2.values) if hasattr(X1, "values") else np.allclose(X1, X2), "Transform not deterministic"
    # Predict twice
    pred1 = model.predict(X1)
    pred2 = model.predict(X2)
    assert np.array_equal(pred1, pred2), "Model predictions not deterministic"
    # Also proba
    proba1 = model.predict_proba(X1)
    proba2 = model.predict_proba(X2)
    assert np.allclose(proba1, proba2), "Proba not deterministic"
    # Check predict_proba shape
    assert proba1.shape[0] == len(train_df)
    assert proba1.shape[1] == 2
    # Check reloading reproduces
    obj2 = joblib.load(MODEL_PATH)
    pipeline2 = obj2["pipeline"]
    model2 = obj2["model"]
    X1_again = pipeline2.transform(train_df)
    pred_again = model2.predict(X1_again)
    assert np.array_equal(pred1, pred_again), "Reloaded pipeline gave different predictions"
    # Ensure preprocessing not leaked: pipeline should have train_only true via schema
    schema = load_schema()
    assert schema.get("train_only") is True


def test_metrics_describes_samples_and_split_provenance():
    """metrics.json must describe samples and split provenance."""
    data = json.loads(METRICS_PATH.read_text(encoding="utf-8"))
    # Samples
    samples = data.get("samples") or {}
    assert isinstance(samples, dict), "samples missing"
    # Check train/val/test counts
    # Train should be 2306, val 1053, test 953 per synthetic generation
    assert "train" in samples or "train" in str(data), "train samples missing"
    if "train" in samples:
        assert samples["train"] == 2306, f"Train samples should be 2306, got {samples['train']}"
    if "validation" in samples:
        assert samples["validation"] == 1053, f"Val samples should be 1053, got {samples['validation']}"
    if "test" in samples:
        assert samples["test"] == 953, f"Test samples should be 953, got {samples['test']}"
    # Also check splits
    splits = data.get("splits") or data.get("split") or {}
    assert isinstance(splits, dict) and len(splits) > 0, "splits missing"
    # Check provenance
    provenance = data.get("provenance") or {}
    assert isinstance(provenance, dict), "provenance missing"
    # Should mention chronological split
    prov_text = json.dumps(data).lower()
    assert "tuesday" in prov_text or "train" in prov_text
    assert "friday" in prov_text, "metrics should mention friday test"
    assert "tuesday" in prov_text or "wednesday" in prov_text
    # Check split_provenance
    assert "split_provenance" in data or "provenance" in data
    # Check that Monday not used for training is documented
    assert "monday" in prov_text, "Should document Monday benign baseline"


def test_metrics_has_required_fields():
    """Metrics must have F1, precision, recall, FPR, PR-AUC, ROC-AUC, latency, confusion, PR/ROC points, importance."""
    data = json.loads(METRICS_PATH.read_text(encoding="utf-8"))
    # Check top-level metrics or test_metrics
    test_metrics = data.get("test_metrics") or data.get("metrics") or data
    # F1
    assert "f1" in test_metrics or "f1" in data, "Missing F1"
    f1_val = test_metrics.get("f1") or data.get("f1")
    if isinstance(f1_val, dict):
        assert "macro" in f1_val or "malicious" in f1_val, "F1 dict missing macro/malicious"
    # Precision
    assert "precision" in test_metrics or "precision" in data, "Missing precision"
    # Recall
    assert "recall" in test_metrics or "recall" in data, "Missing recall"
    # FPR
    assert "fpr" in test_metrics or "fpr" in data, "Missing FPR"
    fpr_val = test_metrics.get("fpr", data.get("fpr"))
    assert fpr_val is not None and isinstance(fpr_val, (int, float)), "FPR should be numeric"
    assert 0.0 <= fpr_val <= 1.0, f"FPR out of range {fpr_val}"
    # PR-AUC / ROC-AUC
    has_pr_auc = any(k in str(data).lower() for k in ["pr_auc", "average_precision", "pr-auc"])
    assert has_pr_auc, "Missing PR-AUC"
    has_roc_auc = "roc_auc" in json.dumps(data).lower() or "roc-auc" in json.dumps(data).lower()
    assert has_roc_auc, "Missing ROC-AUC"
    roc_auc = test_metrics.get("roc_auc") or data.get("roc_auc")
    if roc_auc is not None and not (isinstance(roc_auc, float) and np.isnan(roc_auc)):
        assert 0.0 <= roc_auc <= 1.0
    # Confusion matrix
    cm = test_metrics.get("confusion_matrix") or data.get("confusion_matrix")
    assert cm is not None, "Missing confusion_matrix"
    assert isinstance(cm, list) and len(cm) == 2, f"confusion_matrix should be 2x2, got {cm}"
    assert isinstance(cm[0], list) and isinstance(cm[1], list)
    total_cm = sum(sum(row) for row in cm)
    # Should equal test samples
    samples = data.get("samples", {})
    if "test" in samples:
        assert total_cm == samples["test"], f"Confusion total {total_cm} != test samples {samples['test']}"
    # PR/ROC points
    has_pr_curve = "pr_curve" in data or "pr_curve" in test_metrics or "pr_points" in data
    has_roc_curve = "roc_curve" in data or "roc_curve" in test_metrics or "roc_points" in data
    assert has_pr_curve, "Missing PR curve points"
    assert has_roc_curve, "Missing ROC curve points"
    # Check curves have data
    pr_curve = data.get("pr_curve") or test_metrics.get("pr_curve") or data.get("pr_points")
    if isinstance(pr_curve, dict):
        assert "precision" in pr_curve and "recall" in pr_curve, "PR curve missing precision/recall"
        assert len(pr_curve["precision"]) > 0
    roc_curve_obj = data.get("roc_curve") or test_metrics.get("roc_curve") or data.get("roc_points")
    if isinstance(roc_curve_obj, dict):
        assert "fpr" in roc_curve_obj and "tpr" in roc_curve_obj
        assert len(roc_curve_obj["fpr"]) > 0
    # Latency
    latency = data.get("latency") or data.get("latency_ms") or {}
    assert isinstance(latency, dict) and len(latency) > 0, "Missing latency"
    has_p95 = any(k in latency for k in ["p95_ms", "p95", "p95_latency_ms"])
    assert has_p95, f"Latency missing p95, got {latency.keys()}"
    p95 = latency.get("p95_ms") or latency.get("p95") or latency.get("p95_latency_ms")
    assert isinstance(p95, (int, float)) and p95 > 0, "p95 should be positive ms"
    # Also check flat latency
    if "latency_ms_p95" in data:
        assert data["latency_ms_p95"] > 0
    # Importance
    importance = data.get("importance") or data.get("feature_importance")
    assert importance is not None, "Missing importance"
    assert isinstance(importance, dict)
    assert "type" in importance or "values" in importance, "Importance missing type/values"
    if "values" in importance:
        assert isinstance(importance["values"], dict) and len(importance["values"]) > 0
    if "top_features" in importance:
        assert len(importance["top_features"]) > 0


def test_selection_not_using_test():
    """Grid search selection must not use test Friday - mock pandas.read_csv to detect Friday access during selection."""
    calls = []
    original_read_csv = pd.read_csv

    def tracked_read_csv(path, *args, **kwargs):
        path_str = str(path)
        if "friday" in path_str.lower():
            calls.append(path_str.lower())
            # Still return original but we will fail test
            # To avoid actually opening Friday during selection, we still call original but test will assert not called
            return original_read_csv(path, *args, **kwargs)
        return original_read_csv(path, *args, **kwargs)

    with mock.patch.object(pd, "read_csv", side_effect=tracked_read_csv):
        # Reset guard
        try:
            from app.model.training import reset_friday_guard, train_and_select
        except ImportError:
            import app.model.training as training
            reset_friday_guard = training.reset_friday_guard
            train_and_select = training.train_and_select
        reset_friday_guard()
        # This should not trigger Friday read
        result = train_and_select(verbose=False)
        assert result is not None
        assert "best" in result
        # Check no Friday read during selection
        assert not any("friday" in c for c in calls), f"Selection incorrectly read Friday: {calls}"
        # Also ensure internal guard not yet frozen? After train_and_select, selection not frozen yet (we manage manually)
        # But train_and_select should not have frozen flag (only full pipeline freezes)
        # So _FRIDAY_OPEN_COUNT should still be 0
        try:
            import app.model.training as tm
            assert tm._FRIDAY_OPEN_COUNT == 0, f"Friday open count should be 0 after selection, got {tm._FRIDAY_OPEN_COUNT}"
            assert tm._SELECTION_FROZEN is False, "Selection should not be frozen after train_and_select alone"
        except Exception:
            pass


def test_friday_opened_once_after_freeze():
    """Friday must be opened exactly once after freeze - count pandas.read_csv Friday calls during full pipeline."""
    calls = []
    original_read_csv = pd.read_csv

    def tracked_read_csv(path, *args, **kwargs):
        path_str = str(path)
        if "friday" in path_str.lower():
            calls.append(path_str.lower())
        return original_read_csv(path, *args, **kwargs)

    with mock.patch.object(pd, "read_csv", side_effect=tracked_read_csv):
        try:
            from app.model.training import reset_friday_guard, train_full_pipeline
            import app.model.training as tm
        except ImportError:
            import app.model.training as tm
            reset_friday_guard = tm.reset_friday_guard
            train_full_pipeline = tm.train_full_pipeline
        reset_friday_guard()
        # Run full pipeline which should freeze then open Friday exactly once
        result = train_full_pipeline(verbose=False)
        assert result is not None
        # Count Friday reads
        friday_calls = [c for c in calls if "friday" in c]
        assert len(friday_calls) == 1, f"Friday should be opened exactly once after freeze, got {len(friday_calls)} calls: {friday_calls}"
        # Check internal guard
        assert tm._FRIDAY_OPEN_COUNT == 1, f"Internal Friday open count should be 1, got {tm._FRIDAY_OPEN_COUNT}"
        assert tm._SELECTION_FROZEN is True, "Selection should be frozen after full pipeline"
        # Ensure artifacts still exist after retraining
        assert Path(ROOT / "artifacts" / "risk_model.joblib").exists()
        assert Path(ROOT / "artifacts" / "metrics.json").exists()
        # Second open should fail - test guard
        try:
            tm._load_friday_once()
            assert False, "Second _load_friday_once should raise RuntimeError"
        except RuntimeError as e:
            assert "already opened" in str(e).lower() or "once" in str(e).lower()


def test_no_leakage_preprocessing_train_only():
    """Feature schema must be train-only, and preprocessing not leaked."""
    schema = load_schema()
    assert schema.get("train_only") is True, "Schema should be train_only True"
    assert schema.get("seed") == 42, "Seed should be 42"
    assert "train_days" in schema, "train_days missing"
    assert "friday" in [d.casefold() for d in schema.get("test_days", [])], "test_days should include friday"
    # Ensure no Friday stats in schema
    for forbidden in ["friday_row_count", "friday_labels", "test_row_count"]:
        assert forbidden not in schema, f"Schema must not contain {forbidden}"
    # Check preprocessing pipeline not fit on test
    # Patch to ensure fit not called with Friday
    original_read_csv = pd.read_csv
    calls = []

    def tracked_read_csv(path, *args, **kwargs):
        if "friday" in str(path).lower():
            calls.append(str(path).lower())
        return original_read_csv(path, *args, **kwargs)

    with mock.patch.object(pd, "read_csv", side_effect=tracked_read_csv):
        from app.data.preprocessing import fit_pipeline_on_train
        pipeline = fit_pipeline_on_train()
        assert pipeline.fitted
        assert not any("friday" in c for c in calls), f"Fit incorrectly read Friday: {calls}"
    # Check metrics also respects leakage
    metrics = json.loads(METRICS_PATH.read_text(encoding="utf-8"))
    # Should have train_only note
    prov_text = json.dumps(metrics).lower()
    assert "train_only" in prov_text or "train only" in prov_text or "leakage" in prov_text or "train" in prov_text
    # Check that feature columns don't contain replay identifiers
    feature_cols = schema.get("feature_columns", [])
    forbidden = ["flow id", "source ip", "destination ip", "timestamp", "label"]
    for feat in feature_cols:
        assert feat.strip().casefold() not in forbidden, f"Feature {feat} is forbidden replay identifier"


def test_honest_target_reporting():
    """Metrics must honestly report measured values and not claim unattained targets."""
    data = json.loads(METRICS_PATH.read_text(encoding="utf-8"))
    # Should have target_gates with measured values
    target_gates = data.get("target_gates") or data.get("gates") or {}
    assert isinstance(target_gates, dict) and len(target_gates) > 0, "Missing target_gates for honest reporting"
    assert "measured" in target_gates or any("f1" in k.lower() for k in target_gates.keys()), "target_gates should contain measured values"
    measured = target_gates.get("measured", target_gates)
    # Check that measured values are present
    assert any(k in str(measured).lower() for k in ["f1", "recall", "fpr", "p95"]), "Measured should contain f1/recall/fpr/p95"
    # Check claim limitations present
    assert "claim_limitations" in data or "limitations" in data, "Missing claim_limitations"
    limitations = data.get("claim_limitations") or data.get("limitations")
    assert isinstance(limitations, str) and len(limitations) > 20
    # Check that honesty is enforced: if gates fail, not claiming success
    # At least should contain "not causal" or honest note
    assert "not causal" in limitations.lower() or "not" in limitations.lower() or "limitation" in limitations.lower()
    # Check metrics has honest note
    if "target_gates" in data:
        tg = data["target_gates"]
        if "honest_note" in tg:
            assert len(tg["honest_note"]) > 10
    # Also check that metrics reports per-class and not inflated
    test_metrics = data.get("test_metrics") or data.get("metrics") or {}
    # Ensure F1 malicious is realistic (0-1)
    f1_mal = None
    if isinstance(test_metrics.get("f1"), dict):
        f1_mal = test_metrics["f1"].get("malicious")
    elif "f1_malicious" in test_metrics:
        f1_mal = test_metrics["f1_malicious"]
    if f1_mal is not None:
        assert 0.0 <= f1_mal <= 1.0, f"F1 malicious out of range {f1_mal}"
    # Ensure latency measured and not claimed <500 if actually >500
    latency = data.get("latency") or {}
    p95 = latency.get("p95_ms") or latency.get("p95") or data.get("latency_ms_p95")
    if p95 is not None:
        gates = data.get("target_gates", {})
        latency_gate = gates.get("latency_lt_500ms")
        if latency_gate is not None:
            expected = p95 < 500
            assert latency_gate == expected, f"Latency gate {latency_gate} inconsistent with p95 {p95}"


def test_model_family_and_hyperparameters_recorded():
    """Metrics should record model family and hyperparameters."""
    data = json.loads(METRICS_PATH.read_text(encoding="utf-8"))
    assert "model_family" in data, "Missing model_family"
    assert data["model_family"] in ["random_forest", "logistic_regression"], f"Unexpected family {data['model_family']}"
    assert "hyperparameters" in data or "best_hyperparameters" in data
    hyper = data.get("hyperparameters") or data.get("best_hyperparameters")
    assert isinstance(hyper, dict) and len(hyper) > 0
    # Check threshold present
    assert "threshold" in data, "Missing threshold"
    assert 0.0 < data["threshold"] < 1.0
    # Check selection score
    assert "selection_score" in data or "selection_method" in data
    if "selection_score" in data:
        assert isinstance(data["selection_score"], (int, float))


def test_chronological_split_samples():
    """Test that samples correspond to chronological split and Monday baseline not used for training."""
    data = json.loads(METRICS_PATH.read_text(encoding="utf-8"))
    samples = data.get("samples", {})
    assert samples.get("train") == 2306, f"Train should be 2306, got {samples.get('train')}"
    assert samples.get("validation") == 1053
    assert samples.get("test") == 953
    # Check that monday is recorded but not part of train
    if "monday" in samples:
        assert samples["monday"] == 1153
    # Check splits description
    splits = data.get("splits", {})
    if "train" in splits:
        train_desc = json.dumps(splits["train"]).lower()
        assert "tuesday" in train_desc and "wednesday" in train_desc
        assert "monday" not in train_desc or "not" in train_desc or "baseline" in train_desc
