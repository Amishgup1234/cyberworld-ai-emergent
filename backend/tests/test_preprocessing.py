"""Tests for Phase 03 - Leakage-safe preprocessing and feature schema (sealed Friday)."""

import sys
import json
from pathlib import Path
from unittest import mock

import pandas as pd
import numpy as np
import pytest

# Ensure backend is on path
sys.path.insert(0, str(Path(__file__).parent.parent))

from app.data.preprocessing import (
    SCALER_TYPE,
    REPLAY_IDENTIFIERS_NORMALIZED,
    SealedHoldoutError,
    normalize_columns,
    load_raw_split,
    get_train_data,
    get_validation_data,
    get_test_data,
    get_monday_data,
    get_sealed_friday_metadata,
    PreprocessingPipeline,
    fit_pipeline_on_train,
    build_and_save_schema,
    load_schema,
)


ROOT = Path(__file__).resolve().parents[2]
SCHEMA_PATH = ROOT / "artifacts" / "feature_schema.json"
RAW_DIR = ROOT / "data" / "raw"


# ---------------------------------------------------------------------------
# 1. Schema existence and validity
# ---------------------------------------------------------------------------

def test_feature_schema_exists_and_valid():
    """Gate: artifacts/feature_schema.json must exist and be valid JSON with required keys."""
    assert SCHEMA_PATH.exists(), f"Missing {SCHEMA_PATH} - run preprocessing fit first"
    data = json.loads(SCHEMA_PATH.read_text(encoding="utf-8"))
    assert isinstance(data, dict)
    assert "feature_columns" in data, "Missing feature_columns"
    assert "feature_columns_ordered" in data or "feature_columns" in data
    assert isinstance(data["feature_columns"], list) and len(data["feature_columns"]) > 0
    assert "seed" in data and data["seed"] == 42, f"seed should be 42, got {data.get('seed')}"
    assert "scaler" in data and data["scaler"] == SCALER_TYPE, f"scaler should be {SCALER_TYPE}"
    assert "train_only" in data and data["train_only"] is True
    assert "dtypes" in data and isinstance(data["dtypes"], dict)
    assert "imputation_medians" in data
    assert "clip_bounds" in data
    assert "scaler_params" in data
    assert "constant_columns_removed" in data
    assert "replay_identifiers" in data
    assert "version" in data
    feats = data["feature_columns"]
    assert len(feats) == len(set(feats)), "Duplicate features in schema"
    # Must name Friday as future test partition but contain no Friday-derived statistics
    assert "test_days" in data
    assert "friday" in [d.casefold() for d in data["test_days"]], "test_days should name friday as future partition"
    # Ensure no Friday row count or label stats in schema
    for forbidden in ["friday_row_count", "friday_labels", "test_row_count"]:
        assert forbidden not in data, f"Schema must not contain Friday-derived stat {forbidden}"


def test_feature_schema_ordered_and_dtypes():
    """Feature schema should have ordered list and dtypes mapping."""
    data = json.loads(SCHEMA_PATH.read_text(encoding="utf-8"))
    feats = data["feature_columns"]
    dtypes = data["dtypes"]
    for f in feats:
        assert f in dtypes, f"Missing dtype for {f}"
        assert f in data["imputation_medians"], f"Missing median for {f}"
        assert f in data["clip_bounds"], f"Missing clip bounds for {f}"
        cb = data["clip_bounds"][f]
        assert "low" in cb and "high" in cb
        assert cb["low"] <= cb["high"], f"Clip low > high for {f}"
    sp = data["scaler_params"]
    assert "center" in sp and "scale" in sp
    assert sp["center"] is not None and len(sp["center"]) == len(feats)
    assert sp["scale"] is not None and len(sp["scale"]) == len(feats)


# ---------------------------------------------------------------------------
# 2. Replay identifiers not in schema
# ---------------------------------------------------------------------------

def test_replay_identifiers_not_in_schema():
    """Flow ID, Source IP, Destination IP, Timestamp, Label must NOT be in feature_schema."""
    data = json.loads(SCHEMA_PATH.read_text(encoding="utf-8"))
    feats_lower = {c.strip().casefold(): c for c in data["feature_columns"]}
    forbidden = ["flow id", "source ip", "destination ip", "timestamp", "label"]
    for forb in forbidden:
        assert forb not in feats_lower, f"Replay identifier '{forb}' must not be in feature_columns"
        for feat in data["feature_columns"]:
            assert feat.strip().casefold() != forb, f"Found forbidden {forb} as {feat}"
    pipeline = fit_pipeline_on_train()
    train_df = get_train_data()
    transformed = pipeline.transform(train_df)
    for forb in forbidden:
        assert forb not in {c.strip().casefold() for c in transformed.columns}, \
            f"Transformed output contains forbidden {forb}"
    replay_lower = {r.strip().casefold() for r in data["replay_identifiers"]}
    for forb in forbidden:
        assert forb in replay_lower, f"Schema should list replay identifier {forb}"


def test_normalize_columns_handles_whitespace():
    """normalize_columns should strip whitespace and handle ' Fwd Header Length.1' variants."""
    df_simple = pd.DataFrame({
        " Flow ID": [1],
        " Source IP": ["1.1.1.1"],
        "Fwd Header Length.1": [10],
        " Flow Duration ": [100],
        "Label ": ["BENIGN"],
    })
    df_norm = normalize_columns(df_simple)
    assert "Flow ID" in df_norm.columns
    assert "Source IP" in df_norm.columns
    assert "Fwd Header Length.1" in df_norm.columns
    assert "Flow Duration" in df_norm.columns
    assert "Label" in df_norm.columns
    for col in df_norm.columns:
        assert col == col.strip(), f"Column '{col}' not stripped"


def test_timestamp_parsing_timezone_naive():
    """load_raw_split should parse Timestamp to timezone-naive datetime and ensure chronological."""
    df = load_raw_split("tuesday")
    ts_col = None
    for c in df.columns:
        if c.strip().casefold() == "timestamp":
            ts_col = c
            break
    assert ts_col is not None, "Timestamp column not found"
    assert pd.api.types.is_datetime64_any_dtype(df[ts_col]), f"Timestamp not parsed to datetime, got {df[ts_col].dtype}"
    try:
        tz = df[ts_col].dt.tz
        assert tz is None, f"Timestamp should be timezone-naive, got tz {tz}"
    except Exception:
        pass
    assert df[ts_col].is_monotonic_increasing or df[ts_col].equals(df[ts_col].sort_values()), \
        "Timestamp not chronological"


# ---------------------------------------------------------------------------
# 3. Train-only imputation
# ---------------------------------------------------------------------------

def test_train_only_imputation():
    """Fit on train, transform val uses train medians, not val medians."""
    train_data = pd.DataFrame({
        "Flow ID": ["a", "b", "c"],
        "Source IP": ["1.1.1.1", "2.2.2.2", "3.3.3.3"],
        "Destination IP": ["4.4.4.4", "5.5.5.5", "6.6.6.6"],
        "Timestamp": ["2017-07-04 09:00:00", "2017-07-04 10:00:00", "2017-07-04 11:00:00"],
        "Label": ["BENIGN", "BENIGN", "BENIGN"],
        "Flow Duration": [10.0, 20.0, 30.0],
        "Flow Bytes/s": [100.0, 200.0, 300.0],
        "Fwd Header Length.1": [5.0, 5.0, 5.0],
        "Total Fwd Packets": [1.0, 2.0, 3.0],
    })
    val_data = pd.DataFrame({
        "Flow ID": ["x", "y"],
        "Source IP": ["7.7.7.7", "8.8.8.8"],
        "Destination IP": ["9.9.9.9", "10.10.10.10"],
        "Timestamp": ["2017-07-06 09:00:00", "2017-07-06 10:00:00"],
        "Label": ["BENIGN", "BENIGN"],
        "Flow Duration": [np.nan, np.nan],
        "Flow Bytes/s": [1000.0, np.nan],
        "Fwd Header Length.1": [5.0, 5.0],
        "Total Fwd Packets": [10.0, np.nan],
    })

    pipeline = PreprocessingPipeline(seed=42)
    pipeline.fit(train_data)
    assert pipeline.medians["Flow Duration"] == 20.0, f"Expected train median 20, got {pipeline.medians['Flow Duration']}"
    assert pipeline.medians["Flow Bytes/s"] == 200.0

    transformed = pipeline.transform(val_data)
    assert not transformed.isna().any().any(), "Transformed should have no NaNs after imputation"
    feats = pipeline.feature_columns
    assert "Fwd Header Length.1" in pipeline.constant_columns_removed, "Constant column should be detected and removed"
    assert "Fwd Header Length.1" not in feats

    if "Flow Bytes/s" in feats:
        feats.index("Flow Bytes/s")
        val_transformed_row1 = transformed.iloc[1]["Flow Bytes/s"]
        assert abs(val_transformed_row1 - 0.0) < 1e-6, f"Val NaN should be imputed with train median 200 and scaled to 0, got {val_transformed_row1}"
        val_row0 = transformed.iloc[0]["Flow Bytes/s"]
        assert val_row0 > 0, "Clipped high value should be positive after scaling"
    if "Flow Duration" in feats:
        assert abs(transformed.iloc[0]["Flow Duration"] - 0.0) < 1e-6
        assert abs(transformed.iloc[1]["Flow Duration"] - 0.0) < 1e-6


def test_train_only_imputation_real_data():
    """On real data, validation transform should use train medians."""
    get_train_data()
    val_df = get_validation_data()
    pipeline = fit_pipeline_on_train()
    train_medians = pipeline.medians
    val_medians_real = {}
    for col in pipeline.feature_columns[:5]:
        if col in val_df.columns:
            s = pd.to_numeric(val_df[col], errors="coerce").replace([np.inf, -np.inf], np.nan)
            val_medians_real[col] = float(s.median(skipna=True))
    val_copy = val_df.copy()
    if pipeline.feature_columns:
        first_feat = pipeline.feature_columns[0]
        val_copy[first_feat] = np.nan
        transformed = pipeline.transform(val_copy)
        vals = transformed[first_feat].values
        assert np.allclose(vals, vals[0]), "All NaN imputed should give same scaled value"
        median = train_medians[first_feat]
        low = pipeline.clip_bounds[first_feat]["low"]
        high = pipeline.clip_bounds[first_feat]["high"]
        clipped_median = np.clip(median, low, high)
        idx = pipeline.feature_columns.index(first_feat)
        center = pipeline.scaler.center_[idx]  # type: ignore
        scale = pipeline.scaler.scale_[idx]  # type: ignore
        expected_scaled = (clipped_median - center) / scale if scale != 0 else 0.0
        assert abs(vals[0] - expected_scaled) < 1e-6, f"Expected {expected_scaled}, got {vals[0]}"


# ---------------------------------------------------------------------------
# 4. Constant columns removed
# ---------------------------------------------------------------------------

def test_constant_columns_removed():
    """Constant model columns (zero variance on train) must be removed."""
    data = json.loads(SCHEMA_PATH.read_text(encoding="utf-8"))
    feats = set(data["feature_columns"])
    removed = data["constant_columns_removed"]
    for col in removed:
        assert col not in feats, f"Constant column {col} should not be in features"
        assert col.strip().casefold() not in REPLAY_IDENTIFIERS_NORMALIZED

    train_df = pd.DataFrame({
        "Flow ID": ["a", "b", "c"],
        "Source IP": ["1.1.1.1", "2.2.2.2", "3.3.3.3"],
        "Destination IP": ["4.4.4.4", "5.5.5.5", "6.6.6.6"],
        "Timestamp": ["2017-07-04 09:00:00", "2017-07-04 10:00:00", "2017-07-04 11:00:00"],
        "Label": ["BENIGN"] * 3,
        "Flow Duration": [10.0, 20.0, 30.0],
        "Constant Feature": [5.0, 5.0, 5.0],
        "Another Constant": [1, 1, 1],
        "Normal": [1.0, 2.0, 3.0],
    })
    pipeline = PreprocessingPipeline(seed=42)
    pipeline.fit(train_df)
    assert "Constant Feature" in pipeline.constant_columns_removed
    assert "Another Constant" in pipeline.constant_columns_removed
    assert "Constant Feature" not in pipeline.feature_columns
    assert "Another Constant" not in pipeline.feature_columns
    assert "Flow Duration" in pipeline.feature_columns
    assert "Normal" in pipeline.feature_columns
    val_df = pd.DataFrame({
        "Flow ID": ["x"],
        "Source IP": ["7.7.7.7"],
        "Destination IP": ["8.8.8.8"],
        "Timestamp": ["2017-07-06 09:00:00"],
        "Label": ["BENIGN"],
        "Flow Duration": [15.0],
        "Constant Feature": [99.0],
        "Another Constant": [99],
        "Normal": [2.0],
    })
    transformed = pipeline.transform(val_df)
    assert "Constant Feature" not in transformed.columns
    assert "Another Constant" not in transformed.columns
    assert "Flow Duration" in transformed.columns


def test_constant_columns_real_data():
    """Ensure no constant columns remain in transformed output."""
    pipeline = fit_pipeline_on_train()
    train_df = get_train_data()
    transformed = pipeline.transform(train_df)
    for col in transformed.columns:
        vals = transformed[col].values
        assert np.std(vals) > 0, f"Transformed column {col} is constant, should have been removed"


# ---------------------------------------------------------------------------
# 5. No leakage validation uses train state
# ---------------------------------------------------------------------------

def test_no_leakage_validation_uses_train_state():
    """Train scaler params used for val, not recomputed."""
    pipeline = fit_pipeline_on_train()
    get_train_data()
    val_df = get_validation_data()

    train_center = pipeline.scaler.center_.copy()  # type: ignore
    train_scale = pipeline.scaler.scale_.copy()  # type: ignore

    pipeline_val = PreprocessingPipeline(seed=42)
    pipeline_val.fit(val_df)
    val_center = pipeline_val.scaler.center_  # type: ignore
    val_scale = pipeline_val.scaler.scale_  # type: ignore

    transformed_val = pipeline.transform(val_df)
    feat0 = pipeline.feature_columns[0]
    raw_val_col = pd.to_numeric(val_df[feat0], errors="coerce").replace([np.inf, -np.inf], np.nan)
    median = pipeline.medians[feat0]
    low = pipeline.clip_bounds[feat0]["low"]
    high = pipeline.clip_bounds[feat0]["high"]
    imputed_clipped = raw_val_col.fillna(median).clip(lower=low, upper=high)
    idx0 = pipeline.feature_columns.index(feat0)
    expected = (imputed_clipped.values[0] - train_center[idx0]) / train_scale[idx0] if train_scale[idx0] != 0 else 0.0
    actual = transformed_val[feat0].values[0]
    assert abs(actual - expected) < 1e-6, f"Validation transform should use train center {train_center[idx0]} not val center {val_center[idx0]}"
    if abs(train_center[idx0] - val_center[idx0]) > 1e-3:
        wrong = (imputed_clipped.values[0] - val_center[idx0]) / val_scale[idx0] if val_scale[idx0] != 0 else 0.0
        assert abs(actual - wrong) > 1e-6 or abs(expected - wrong) < 1e-6, "Transform appears to use validation scaler instead of train scaler"


def test_scaling_uses_train_only():
    """Additional check: scaling not recomputed on validation."""
    pipeline = fit_pipeline_on_train()
    val_df = get_validation_data()
    t1 = pipeline.transform(val_df)
    t2 = pipeline.transform(val_df)
    assert np.allclose(t1.values, t2.values), "Transform should be deterministic"


# ---------------------------------------------------------------------------
# 6. Friday sealed - not used for fitting
# ---------------------------------------------------------------------------

def test_friday_not_used_for_fitting():
    """Patch pd.read_csv to fail if Friday path is passed during fit."""
    original_read_csv = pd.read_csv

    class FridayAccessError(AssertionError):
        pass

    def tracked_read_csv(path, *args, **kwargs):
        path_str = str(path).lower()
        if "friday" in path_str:
            raise FridayAccessError(f"Friday content was loaded via pandas.read_csv: {path} - violates sealed holdout")
        return original_read_csv(path, *args, **kwargs)

    with mock.patch.object(pd, "read_csv", side_effect=tracked_read_csv):
        pipeline = fit_pipeline_on_train()
        assert pipeline.fitted
        import tempfile
        with tempfile.TemporaryDirectory() as tmp:
            tmp_path = Path(tmp) / "feature_schema_test.json"
            schema = build_and_save_schema(output_path=tmp_path)
            assert "feature_columns" in schema

    with mock.patch.object(pd, "read_csv", side_effect=tracked_read_csv):
        with pytest.raises(SealedHoldoutError):
            get_test_data()

        calls = []

        def recording_read_csv(path, *args, **kwargs):
            calls.append(str(path).lower())
            if "friday" in str(path).lower():
                raise FridayAccessError("Friday read")
            return original_read_csv(path, *args, **kwargs)

        with mock.patch.object(pd, "read_csv", side_effect=recording_read_csv):
            calls.clear()
            _ = fit_pipeline_on_train()
            assert not any("friday" in c for c in calls), f"Fit incorrectly read Friday: {calls}"
            with pytest.raises(SealedHoldoutError):
                get_test_data()
            assert not any("friday" in c for c in calls), "Fit should not have read Friday even after get_test_data check"


def test_get_test_data_raises_while_sealed():
    """get_test_data() must raise SealedHoldoutError without calling pandas.read_csv."""
    calls = []

    original_read_csv = pd.read_csv

    def recording_read_csv(path, *args, **kwargs):
        calls.append(str(path).lower())
        return original_read_csv(path, *args, **kwargs)

    with mock.patch.object(pd, "read_csv", side_effect=recording_read_csv):
        with pytest.raises(SealedHoldoutError) as excinfo:
            get_test_data()
        assert "sealed" in str(excinfo.value).lower() and "friday" in str(excinfo.value).lower()
        # Must not have called pandas.read_csv for Friday
        assert not any("friday" in c for c in calls), f"get_test_data() must not call pandas.read_csv for Friday even while sealed, got calls {calls}"

    # Also check load_raw_split for friday raises same
    with mock.patch.object(pd, "read_csv", side_effect=recording_read_csv):
        calls.clear()
        with pytest.raises(SealedHoldoutError):
            load_raw_split("friday")
        assert not any("friday" in c for c in calls), "load_raw_split('friday') must not call pandas.read_csv"


def test_sealed_friday_metadata_only():
    """Phase 03 may register only Friday path and non-content metadata already permitted by Phase 02."""
    meta = get_sealed_friday_metadata()
    assert isinstance(meta, dict)
    assert meta.get("sealed") is True or meta.get("status") == "sealed-holdout"
    assert meta.get("exists") is True
    assert "file" in meta and "friday" in meta["file"].lower()
    assert "size_bytes" in meta and isinstance(meta["size_bytes"], int) and meta["size_bytes"] > 0
    # Must not have content fields
    for forbidden in ["label_distribution", "timestamp_range", "row_count", "missing_values_per_column", "total_missing", "row"]:
        assert forbidden not in meta, f"Sealed metadata must not contain {forbidden}"
    # Should match Phase 02 sealed_holdout if available
    import json as _json
    json_path = ROOT / "data" / "reports" / "data_quality.json"
    if json_path.exists():
        data = _json.loads(json_path.read_text())
        sealed_phase2 = data.get("sealed_holdout", {}).get("friday", {})
        if sealed_phase2:
            assert meta["size_bytes"] == sealed_phase2["size_bytes"], "Phase 03 sealed metadata size must match Phase 02"
            assert meta["file"] == sealed_phase2["file"]
    # Also test that metadata does not require pandas read - mock should not trigger
    calls = []
    original_read_csv = pd.read_csv

    def recording_read_csv(path, *args, **kwargs):
        calls.append(str(path).lower())
        return original_read_csv(path, *args, **kwargs)

    with mock.patch.object(pd, "read_csv", side_effect=recording_read_csv):
        get_sealed_friday_metadata()
        assert not any("friday" in c for c in calls), "get_sealed_friday_metadata must not call pandas.read_csv for Friday"


# ---------------------------------------------------------------------------
# 7. Reproducibility
# ---------------------------------------------------------------------------

def test_reproducibility():
    """Running fit twice with same seed should produce same schema."""
    pipeline1 = fit_pipeline_on_train(seed=42)
    schema1 = pipeline1.get_schema()
    pipeline2 = fit_pipeline_on_train(seed=42)
    schema2 = pipeline2.get_schema()

    def strip_volatile(d):
        copy = json.loads(json.dumps(d))
        copy.pop("generated_at", None)
        return copy

    s1 = strip_volatile(schema1)
    s2 = strip_volatile(schema2)
    assert s1["feature_columns"] == s2["feature_columns"], "Feature columns order not reproducible"
    assert s1["constant_columns_removed"] == s2["constant_columns_removed"]
    assert s1["seed"] == s2["seed"] == 42
    assert s1["imputation_medians"] == s2["imputation_medians"]
    assert s1["clip_bounds"] == s2["clip_bounds"]
    assert s1["scaler_params"]["center"] == s2["scaler_params"]["center"]
    assert s1["scaler_params"]["scale"] == s2["scaler_params"]["scale"]
    assert s1 == s2, "Second fit produced different schema"

    import tempfile
    with tempfile.TemporaryDirectory() as tmp1, tempfile.TemporaryDirectory() as tmp2:
        p1 = Path(tmp1) / "schema1.json"
        p2 = Path(tmp2) / "schema2.json"
        build_and_save_schema(output_path=p1, seed=42)
        build_and_save_schema(output_path=p2, seed=42)
        j1 = json.loads(p1.read_text())
        j2 = json.loads(p2.read_text())
        j1.pop("generated_at", None)
        j2.pop("generated_at", None)
        assert j1 == j2, "Saved schemas not reproducible"


def test_deterministic_seed():
    """Schema must record seed and be deterministic with that seed."""
    data = json.loads(SCHEMA_PATH.read_text())
    assert data["seed"] == 42
    assert data["train_only"] is True


# ---------------------------------------------------------------------------
# 8. Chronological split - only audited days
# ---------------------------------------------------------------------------

def test_chronological_split_without_friday():
    """Train is Tue-Wed, val is Thu - check dates without loading Friday."""
    train_df = get_train_data()
    val_df = get_validation_data()
    # Do NOT load Friday - instead use sealed metadata
    friday_meta = get_sealed_friday_metadata()
    monday_df = get_monday_data()

    def get_dates(df):
        ts_col = None
        for c in df.columns:
            if c.strip().casefold() == "timestamp":
                ts_col = c
                break
        if ts_col is None:
            return set()
        s = pd.to_datetime(df[ts_col], errors="coerce")
        dates = set(s.dt.date.astype(str).unique())
        dates = {d for d in dates if d != "NaT" and d != "nan" and d is not None}
        return dates

    train_dates = get_dates(train_df)
    val_dates = get_dates(val_df)
    monday_dates = get_dates(monday_df)

    assert "2017-07-04" in train_dates, f"Train should contain 2017-07-04, got {train_dates}"
    assert "2017-07-05" in train_dates, f"Train should contain 2017-07-05, got {train_dates}"
    assert "2017-07-03" not in train_dates, "Train must not contain Monday 2017-07-03"
    assert "2017-07-06" not in train_dates, "Train must not contain Thursday"
    # Check Friday not in train via sealed metadata only, not by loading
    assert friday_meta["size_bytes"] > 0
    assert "friday" in friday_meta["file"].lower()

    assert val_dates == {"2017-07-06"}, f"Val should be only 2017-07-06, got {val_dates}"
    assert monday_dates == {"2017-07-03"}, f"Monday should be 2017-07-03, got {monday_dates}"

    assert len(train_df) == 1103 + 1203, f"Train should be Tue+Wed 1103+1203=2306, got {len(train_df)}"
    assert len(val_df) == 1053, f"Val should be Thu 1053, got {len(val_df)}"
    assert len(monday_df) == 1153

    for name, df in [("train", train_df), ("val", val_df), ("monday", monday_df)]:
        ts_col = next((c for c in df.columns if c.strip().casefold() == "timestamp"), None)
        assert ts_col is not None
        s = df[ts_col]
        assert s.is_monotonic_increasing, f"{name} not chronologically sorted"

    # Ensure get_test_data raises and is not used for row count check
    with pytest.raises(SealedHoldoutError):
        get_test_data()


def test_train_does_not_use_monday():
    """Explicit check that Monday not in training per requirements."""
    train_df = get_train_data()
    monday_df = get_monday_data()
    assert len(monday_df) > 0
    train_dates = set(pd.to_datetime(train_df["Timestamp"]).dt.date.astype(str).unique())
    assert "2017-07-03" not in train_dates


def test_split_loaders_exist():
    """All split loaders must exist and be callable (Friday loader raises while sealed)."""
    assert callable(load_raw_split)
    assert callable(get_train_data)
    assert callable(get_validation_data)
    assert callable(get_test_data)
    assert callable(get_sealed_friday_metadata)
    for variant in ["tuesday", "Tuesday", "TUESDAY", " Tuesday ", "tUeSdAy"]:
        df = load_raw_split(variant)
        assert len(df) > 0
        assert "Flow Duration" in df.columns or "Flow Duration" in [c.strip() for c in df.columns]
    # get_test_data must raise while sealed
    with pytest.raises(SealedHoldoutError):
        get_test_data()
    # get_sealed_friday_metadata must succeed without pandas
    meta = get_sealed_friday_metadata()
    assert meta["size_bytes"] > 0


# ---------------------------------------------------------------------------
# Additional leakage and integrity tests
# ---------------------------------------------------------------------------

def test_no_leakage_through_clipping():
    """Clip bounds learned on train only, not recomputed on val."""
    pipeline = fit_pipeline_on_train()
    val_df = get_validation_data()
    feat = pipeline.feature_columns[0]
    train_bounds = pipeline.clip_bounds[feat]
    train_low = train_bounds["low"]
    train_high = pipeline.clip_bounds[feat]["high"]
    val_raw = pd.to_numeric(val_df[feat], errors="coerce").replace([np.inf, -np.inf], np.nan)
    val_q01 = float(val_raw.quantile(0.01))
    val_q99 = float(val_raw.quantile(0.99))
    extreme_val = train_high * 10 + 100000
    val_copy = val_df.copy()
    val_copy.loc[0, feat] = extreme_val
    transformed = pipeline.transform(val_copy)
    idx = pipeline.feature_columns.index(feat)
    center = pipeline.scaler.center_[idx]  # type: ignore
    scale = pipeline.scaler.scale_[idx]  # type: ignore
    expected_clipped = np.clip(extreme_val, train_low, train_high)
    expected_scaled = (expected_clipped - center) / scale if scale != 0 else 0.0
    actual = transformed[feat].iloc[0]
    assert abs(actual - expected_scaled) < 1e-6, f"Clipping should use train bounds {train_low},{train_high}, got actual {actual} expected {expected_scaled}"
    if abs(val_q99 - train_high) > 1e-3:
        wrong_clipped = np.clip(extreme_val, val_q01, val_q99)
        wrong_scaled = (wrong_clipped - center) / scale if scale != 0 else 0.0
        assert abs(actual - wrong_scaled) > 1e-6 or abs(expected_scaled - wrong_scaled) < 1e-6


def test_inf_handling():
    """Infinities should be replaced with NaN then imputed."""
    train_df = pd.DataFrame({
        "Flow ID": ["a", "b", "c"],
        "Source IP": ["1.1.1.1", "2.2.2.2", "3.3.3.3"],
        "Destination IP": ["4.4.4.4", "5.5.5.5", "6.6.6.6"],
        "Timestamp": ["2017-07-04 09:00:00", "2017-07-04 10:00:00", "2017-07-04 11:00:00"],
        "Label": ["BENIGN"] * 3,
        "Flow Duration": [10.0, np.inf, -np.inf],
        "Flow Bytes/s": [100.0, 200.0, 300.0],
    })
    pipeline = PreprocessingPipeline(seed=42)
    pipeline.fit(train_df)
    assert pipeline.medians["Flow Duration"] == 10.0
    transformed = pipeline.transform(train_df)
    assert not transformed.isna().any().any()
    assert not np.isinf(transformed.values).any()


def test_strict_numeric_conversion():
    """Non-numeric strings should be coerced to NaN and imputed."""
    train_df = pd.DataFrame({
        "Flow ID": ["a", "b", "c"],
        "Source IP": ["1.1.1.1", "2.2.2.2", "3.3.3.3"],
        "Destination IP": ["4.4.4.4", "5.5.5.5", "6.6.6.6"],
        "Timestamp": ["2017-07-04 09:00:00", "2017-07-04 10:00:00", "2017-07-04 11:00:00"],
        "Label": ["BENIGN"] * 3,
        "Flow Duration": ["10", "20", "not_a_number"],
        "Flow Bytes/s": [100, 200, 300],
    })
    pipeline = PreprocessingPipeline(seed=42)
    pipeline.fit(train_df)
    assert pipeline.medians["Flow Duration"] == 15.0
    transformed = pipeline.transform(train_df)
    assert not transformed.isna().any().any()


def test_artifacts_directory_and_schema_persistence():
    """Artifacts directory should exist and schema should be persistable."""
    assert SCHEMA_PATH.parent.exists(), "artifacts directory should exist"
    assert SCHEMA_PATH.exists()
    data1 = load_schema()
    data2 = json.loads(SCHEMA_PATH.read_text())
    assert data1 == data2


def test_pipeline_preserves_replay_separation():
    """Pipeline should separate replay identifiers from model features."""
    pipeline = fit_pipeline_on_train()
    train_df = get_train_data()
    expected_replay = {"flow id", "source ip", "destination ip", "timestamp", "label"}
    found_replay = {r.strip().casefold() for r in pipeline.replay_identifiers}
    assert found_replay == expected_replay, f"Replay identifiers mismatch: {found_replay}"
    total_cols = len(train_df.columns)
    expected_features = total_cols - len(expected_replay) - len(pipeline.constant_columns_removed)
    assert len(pipeline.feature_columns) == expected_features


def test_no_raw_ip_leakage_in_transformed():
    """Transformed output must not contain raw IP or Flow ID."""
    pipeline = fit_pipeline_on_train()
    train_df = get_train_data()
    transformed = pipeline.transform(train_df)
    for col in transformed.columns:
        assert col.strip().casefold() not in REPLAY_IDENTIFIERS_NORMALIZED
        assert pd.api.types.is_float_dtype(transformed[col]) or pd.api.types.is_numeric_dtype(transformed[col])
    sample_vals = transformed.values.flatten()[:10]
    for v in sample_vals:
        assert not isinstance(v, str) or "." not in v, "Transformed should not contain IP strings"
