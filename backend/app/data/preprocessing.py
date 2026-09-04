"""Leakage-safe preprocessing for CyberWorld AI Phase 03.

Implements:
- Column normalization (strip whitespace, handle inconsistent names)
- Timestamp parsing to timezone-naive chronological format
- Separation of replay identifiers (Flow ID, Source IP, Destination IP, Timestamp, Label)
- Chronological split loaders: train Tuesday+Wednesday, validation Thursday, test Friday (sealed)
- Train-only fitting: median imputation, 1st/99th clip bounds, RobustScaler, constant removal
- Persisted feature_schema.json with deterministic seed 42

Friday is sealed holdout - fitting path must NEVER read Friday.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Dict, List, Optional, Any

import numpy as np
import pandas as pd
from sklearn.preprocessing import RobustScaler

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

SEED = 42
SCALER_TYPE = "RobustScaler"
VERSION = "phase03-v1-sealed"

# Replay identifiers - case-insensitive stripped matching, never fed to estimator
REPLAY_IDENTIFIERS_NORMALIZED = {"flow id", "source ip", "destination ip", "timestamp", "label"}
REPLAY_IDENTIFIERS_CANONICAL = ["Flow ID", "Source IP", "Destination IP", "Timestamp", "Label"]

# Chronological split mapping
VALID_DAYS = ["monday", "tuesday", "wednesday", "thursday", "friday"]
TRAIN_DAYS = ["tuesday", "wednesday"]  # Monday is benign baseline only, not used for training
VAL_DAYS = ["thursday"]
TEST_DAYS = ["friday"]
AUDITABLE_DAYS = ["monday", "tuesday", "wednesday", "thursday"]
SEALED_DAYS = ["friday"]

# For clipping
CLIP_Q_LOW = 0.01
CLIP_Q_HIGH = 0.99
ROBUST_QUANTILE_RANGE = (25.0, 75.0)


# ---------------------------------------------------------------------------
# Helpers - filesystem
# ---------------------------------------------------------------------------

def _resolve_project_root() -> Path:
    """Resolve project root robustly (similar to audit.py)."""
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
            # also check for data/raw
            if (cur / "data" / "raw").exists() and (cur / "backend" / "app" / "data" / "preprocessing.py").exists():
                return cur
            if cur.parent == cur:
                break
            cur = cur.parent
        # fallback to cwd
        return Path.cwd()


def _find_file_for_day(raw_dir: Path, day: str) -> Path:
    """Find CSV file for a single day case-insensitive, deterministic.

    Does NOT enumerate all days or read content - only filesystem scan for that day.
    """
    day_lower = day.strip().casefold()
    if day_lower not in VALID_DAYS:
        raise ValueError(f"Invalid day '{day}' - expected one of {VALID_DAYS}")
    if not raw_dir.exists():
        raise ValueError(f"Raw data directory not found: {raw_dir}")
    candidates: List[Path] = []
    for p in raw_dir.rglob("*"):
        if p.is_file() and p.suffix.lower() == ".csv" and day_lower in p.name.casefold():
            candidates.append(p)
    if not candidates:
        # Provide detailed listing for error clarity
        all_csv = [q.name for q in raw_dir.rglob("*") if q.is_file() and q.suffix.lower() == ".csv"]
        raise ValueError(
            f"Missing daily file for '{day}' - expected CSV with '{day}' in filename (case-insensitive) under {raw_dir}. Found: {sorted(all_csv)}"
        )
    candidates_sorted = sorted(candidates, key=lambda x: x.name.lower())
    return candidates_sorted[0]


def _normalize_col_name(col: str) -> str:
    """Strip whitespace from column name, preserving case but removing surrounding spaces."""
    return col.strip()


def _is_replay_identifier(col: str) -> bool:
    """Check if column is a replay identifier via case-insensitive stripped matching."""
    return col.strip().casefold() in REPLAY_IDENTIFIERS_NORMALIZED


def normalize_columns(df: pd.DataFrame) -> pd.DataFrame:
    """Normalize column names: strip whitespace.

    Handles inconsistent names like " Flow ID" vs "Flow ID" and "Fwd Header Length.1".
    Returns a copy with renamed columns.
    """
    mapping = {col: _normalize_col_name(col) for col in df.columns}
    # Only rename if needed
    if any(k != v for k, v in mapping.items()):
        return df.rename(columns=mapping)
    return df.copy()


def _find_timestamp_column(df: pd.DataFrame) -> Optional[str]:
    """Find timestamp column via case-insensitive stripped matching."""
    col_map = {c.strip().casefold(): c for c in df.columns}
    if "timestamp" in col_map:
        return col_map["timestamp"]
    for c in df.columns:
        if "timestamp" in c.strip().casefold():
            return c
    return None


def _parse_timestamp_column(df: pd.DataFrame) -> pd.DataFrame:
    """Parse Timestamp column to timezone-naive chronological format.

    Uses pd.to_datetime(errors='coerce'), ensures tz_localize(None) if tz-aware.
    Returns df with parsed timestamp column (if found) as datetime64[ns] naive.
    """
    ts_col = _find_timestamp_column(df)
    if ts_col is None:
        return df
    # Parse with coercion
    s = pd.to_datetime(df[ts_col], errors="coerce")
    # Ensure timezone-naive: if tz-aware, remove tz
    try:
        # In pandas, s.dt.tz is None if naive, else timezone
        if hasattr(s.dt, "tz") and s.dt.tz is not None:
            # Remove timezone -> naive
            s = s.dt.tz_localize(None)
    except Exception:
        # Fallback try alternative
        try:
            if s.dt.tz is not None:
                s = s.dt.tz_convert(None)  # type: ignore
        except Exception:
            pass
    df = df.copy()
    df[ts_col] = s
    return df


def _ensure_chronological(df: pd.DataFrame) -> pd.DataFrame:
    """Ensure DataFrame is sorted chronologically by Timestamp if present and parsable."""
    ts_col = _find_timestamp_column(df)
    if ts_col is None:
        return df
    try:
        if pd.api.types.is_datetime64_any_dtype(df[ts_col]):
            # Check if already sorted? Sort anyway to ensure chronological
            # Use stable sort for determinism
            df = df.sort_values(by=ts_col, kind="mergesort").reset_index(drop=True)
    except Exception:
        pass
    return df


# ---------------------------------------------------------------------------
# Loaders - chronological split
# ---------------------------------------------------------------------------

class SealedHoldoutError(RuntimeError):
    """Raised when attempting to access the sealed Friday holdout before evaluation."""


def load_raw_split(day: str) -> pd.DataFrame:
    """Load raw CSV for a single day with normalization and timestamp parsing.

    Case-insensitive day handling. Returns normalized DataFrame sorted chronologically
    if Timestamp present. Does NOT apply preprocessing transforms (inf->NaN, scaling).

    Friday is sealed holdout and will raise SealedHoldoutError without calling pandas.read_csv.
    """
    day_norm = day.strip().casefold()
    if day_norm not in VALID_DAYS:
        raise ValueError(f"Invalid day '{day}' - expected one of {VALID_DAYS}")
    if day_norm in SEALED_DAYS:
        raise SealedHoldoutError(
            "Friday is the sealed holdout - content is not inspected until final evaluation "
            "after the candidate model, "
            "feature schema, hyperparameters and validation-selected threshold are frozen. "
            "Use only the file metadata recorded in data/reports/data_quality.json."
        )
    root = _resolve_project_root()
    raw_dir = root / "data" / "raw"
    path = _find_file_for_day(raw_dir, day_norm)
    # Direct read - this is the only place that reads CSV for that day (never for Friday)
    df = pd.read_csv(path, low_memory=False)
    df = normalize_columns(df)
    df = _parse_timestamp_column(df)
    df = _ensure_chronological(df)
    return df


def get_sealed_friday_metadata() -> dict:
    """Return Friday file metadata without reading content, using Phase 02 audit.

    Returns dict with file, path, size_bytes, sha256, exists, sealed True, as recorded in
    data/reports/data_quality.json sealed_holdout. No pandas.read_csv is called.
    """
    root = _resolve_project_root()
    json_path = root / "data" / "reports" / "data_quality.json"
    if not json_path.exists():
        # Fallback to filesystem metadata only (no content read)
        raw_dir = root / "data" / "raw"
        try:
            path = _find_file_for_day(raw_dir, "friday")
            size = path.stat().st_size
            return {
                "file": path.name,
                "path": str(path),
                "size_bytes": size,
                "exists": True,
                "sealed": True,
                "status": "sealed-holdout",
                "sha256": None,
                "reason": "Friday sealed holdout - use Phase 02 metadata",
            }
        except Exception as e:
            raise SealedHoldoutError(f"Friday sealed holdout metadata unavailable: {e}") from e
    import json as _json
    data = _json.loads(json_path.read_text(encoding="utf-8"))
    sealed = data.get("sealed_holdout", {}).get("friday")
    if sealed:
        return dict(sealed)
    # Fallback: construct from discovery
    discovery = data.get("discovery", {}).get("friday") or data.get("daily_files", {}).get("friday")
    if discovery:
        # Use filesystem size
        raw_dir = root / "data" / "raw"
        try:
            path = _find_file_for_day(raw_dir, "friday")
            size = path.stat().st_size
        except Exception:
            size = 0
        return {
            "file": Path(discovery).name,
            "path": discovery,
            "size_bytes": size,
            "exists": True,
            "sealed": True,
            "status": "sealed-holdout",
            "sha256": None,
            "reason": "Friday sealed holdout - use Phase 02 metadata",
        }
    raise SealedHoldoutError("Friday sealed holdout metadata not found in Phase 02 report")


def get_train_data() -> pd.DataFrame:
    """Load and concatenate Tuesday+Wednesday as training set, chronologically sorted.

    Does NOT use Monday (benign baseline only) and does NOT touch Friday.
    """
    df_tue = load_raw_split("tuesday")
    df_wed = load_raw_split("wednesday")
    df = pd.concat([df_tue, df_wed], ignore_index=True)
    df = _ensure_chronological(df)
    return df


def get_validation_data() -> pd.DataFrame:
    """Load Thursday as validation set."""
    return load_raw_split("thursday")


def get_test_data() -> pd.DataFrame:
    """Load Friday as test set (sealed holdout).

    While sealed, this raises SealedHoldoutError without calling pandas.read_csv.
    Evaluation may open Friday exactly once only after the candidate model, feature schema,
    hyperparameters and validation-selected threshold are frozen.
    """
    raise SealedHoldoutError(
        "Friday is the sealed holdout - get_test_data() is unavailable before final evaluation. "
        "Only the Friday path and non-content metadata in data/reports/data_quality.json may be registered. "
        "Evaluation may open Friday exactly once only after the candidate model, feature schema, "
        "hyperparameters and validation-selected threshold are frozen."
    )


def get_monday_data() -> pd.DataFrame:
    """Load Monday (benign baseline only, not for training)."""
    return load_raw_split("monday")


# ---------------------------------------------------------------------------
# Preprocessing pipeline - train-only fitting
# ---------------------------------------------------------------------------

class PreprocessingPipeline:
    """Leakage-safe preprocessing pipeline with train-only fitting.

    Steps (deterministic, seed 42):
    1. Normalize columns (strip)
    2. Identify replay identifiers vs model features (case-insensitive)
    3. For model features: strict numeric conversion (pd.to_numeric errors='coerce')
    4. Replace inf/-inf with NaN
    5. Learn median imputations on training data ONLY
    6. Learn extreme-value clip bounds (1st and 99th percentiles) on training ONLY
    7. Remove constant model columns (zero variance on train after imputation+clipping)
    8. Fit RobustScaler on remaining features (center median, scale IQR)
    9. Transform uses fitted training state only
    """

    def __init__(self, seed: int = SEED):
        self.seed = seed
        self.feature_columns: List[str] = []  # ordered after constant removal
        self.feature_columns_candidate: List[str] = []  # before removal
        self.medians: Dict[str, float] = {}
        self.clip_bounds: Dict[str, Dict[str, float]] = {}  # col -> {low, high, q01, q99}
        self.scaler: Optional[RobustScaler] = None
        self.scaler_params: Dict[str, Any] = {}
        self.constant_columns_removed: List[str] = []
        self.dtypes: Dict[str, str] = {}
        self.replay_identifiers: List[str] = []
        self.fitted: bool = False
        self._scaler_center: Optional[np.ndarray] = None
        self._scaler_scale: Optional[np.ndarray] = None

    # -----------------------------------------------------------------------
    # Fitting
    # -----------------------------------------------------------------------

    def fit(self, df_train: pd.DataFrame) -> "PreprocessingPipeline":
        """Fit preprocessing on training DataFrame (Tuesday+Wednesday).

        Must NOT be called with data containing Friday, and must NOT internally
        load Friday. Caller ensures df_train is Tue+Wed only.
        """
        np.random.seed(self.seed)
        df = normalize_columns(df_train.copy())
        df = _parse_timestamp_column(df)

        # Identify replay vs features
        replay_cols = [c for c in df.columns if _is_replay_identifier(c)]
        candidate_cols = [c for c in df.columns if not _is_replay_identifier(c)]
        self.replay_identifiers = replay_cols
        self.feature_columns_candidate = candidate_cols.copy()

        if not candidate_cols:
            raise ValueError("No candidate model features found after filtering replay identifiers")

        # Prepare working numeric matrix for candidate features
        # Strict numeric conversion and inf handling
        work = pd.DataFrame(index=df.index)
        for col in candidate_cols:
            # Strict conversion
            s = pd.to_numeric(df[col], errors="coerce")
            # Replace infinities with NaN (pd.to_numeric already may have inf as float inf; also handle object inf)
            s = s.replace([np.inf, -np.inf], np.nan)
            # Also explicitly mask infinities remaining
            try:
                mask_inf = np.isinf(s.astype(float))
                s = s.mask(mask_inf, np.nan)
            except Exception:
                pass
            work[col] = s

        # Learn medians on train ONLY
        medians: Dict[str, float] = {}
        for col in candidate_cols:
            med = work[col].median(skipna=True)
            # If all NaN, fallback to 0
            if pd.isna(med):
                med = 0.0
            medians[col] = float(med)
        self.medians = medians

        # Learn clip bounds on train ONLY - 1st and 99th percentiles
        clip_bounds: Dict[str, Dict[str, float]] = {}
        for col in candidate_cols:
            valid = work[col].dropna()
            if valid.empty:
                # No valid data, bounds are median
                low = high = float(medians[col])
            else:
                # Quantiles deterministic
                q01 = float(valid.quantile(CLIP_Q_LOW))
                q99 = float(valid.quantile(CLIP_Q_HIGH))
                # Handle NaN quantiles
                if pd.isna(q01):
                    q01 = float(valid.min())
                if pd.isna(q99):
                    q99 = float(valid.max())
                # Ensure low <= high
                if q01 > q99:
                    q01, q99 = q99, q01
                low = q01
                high = q99
            clip_bounds[col] = {"low": float(low), "high": float(high), "q01": float(low), "q99": float(high)}
        self.clip_bounds = clip_bounds

        # Create imputed + clipped training matrix to detect constant columns
        imputed = work.copy()
        for col in candidate_cols:
            imputed[col] = imputed[col].fillna(medians[col])
            # Clip
            low = clip_bounds[col]["low"]
            high = clip_bounds[col]["high"]
            # Use clip bounds
            imputed[col] = imputed[col].clip(lower=low, upper=high)

        # Detect constant columns (zero variance on train after imputation+clipping)
        constant_removed: List[str] = []
        remaining: List[str] = []
        for col in candidate_cols:
            vals = imputed[col]
            # Use nunique and std for robustness
            try:
                n_unique = vals.nunique(dropna=False)
                std = vals.std(skipna=True)
                # Constant if n_unique <=1 or std ==0 or pd.isna(std) (all same)
                is_constant = (n_unique <= 1) or (std == 0) or (pd.isna(std) and n_unique <= 1)
                # Also treat as constant if all values identical within float tolerance
                if not is_constant:
                    # Check variance very small
                    # Use np.allclose to first value?
                    first = vals.iloc[0] if len(vals) else np.nan
                    if len(vals) > 0 and np.all(vals == first):
                        is_constant = True
            except Exception:
                is_constant = False
            if is_constant:
                constant_removed.append(col)
            else:
                remaining.append(col)
        self.constant_columns_removed = constant_removed
        self.feature_columns = remaining

        # Record dtypes before scaling (ordered)
        dtypes: Dict[str, str] = {}
        for col in self.feature_columns:
            # dtype after numeric conversion, should be float64
            dtypes[col] = str(imputed[col].dtype)
        self.dtypes = dtypes

        # Fit RobustScaler on remaining features (train imputed+clipped matrix)
        if not self.feature_columns:
            raise ValueError("All candidate features were constant - no features remain after filtering")
        train_matrix = imputed[self.feature_columns].values.astype(float)
        # Deterministic scaler
        scaler = RobustScaler(with_centering=True, with_scaling=True, quantile_range=ROBUST_QUANTILE_RANGE)
        scaler.fit(train_matrix)
        self.scaler = scaler
        # Save scaler params for schema
        try:
            center = scaler.center_.tolist() if hasattr(scaler, "center_") and scaler.center_ is not None else None
            scale = scaler.scale_.tolist() if hasattr(scaler, "scale_") and scaler.scale_ is not None else None
        except Exception:
            center = None
            scale = None
        self._scaler_center = scaler.center_ if hasattr(scaler, "center_") else None
        self._scaler_scale = scaler.scale_ if hasattr(scaler, "scale_") else None
        self.scaler_params = {
            "center": center,
            "scale": scale,
            "quantile_range": list(ROBUST_QUANTILE_RANGE),
            "with_centering": True,
            "with_scaling": True,
        }
        self.fitted = True
        return self

    # -----------------------------------------------------------------------
    # Transform
    # -----------------------------------------------------------------------

    def transform(self, df: pd.DataFrame) -> pd.DataFrame:
        """Transform DataFrame using fitted training state.

        Drops replay identifiers, applies train medians, clip bounds, and scaler.
        Returns DataFrame with only feature_columns (ordered) scaled.
        """
        if not self.fitted or self.scaler is None:
            raise RuntimeError("Pipeline not fitted - call fit() first")
        df_norm = normalize_columns(df.copy())
        df_norm = _parse_timestamp_column(df_norm)
        # Build output for feature_columns only
        n_rows = len(df_norm)
        # Prepare imputed+clipped matrix
        interim = pd.DataFrame(index=df_norm.index)
        for col in self.feature_columns:
            if col in df_norm.columns:
                s = pd.to_numeric(df_norm[col], errors="coerce")
                s = s.replace([np.inf, -np.inf], np.nan)
                try:
                    mask_inf = np.isinf(s.astype(float))
                    s = s.mask(mask_inf, np.nan)
                except Exception:
                    pass
            else:
                # Missing column - fill with NaN then median
                s = pd.Series([np.nan] * n_rows, index=df_norm.index, dtype=float)
            # Impute with train median
            median = self.medians.get(col, 0.0)
            s = s.fillna(median)
            # Clip with train bounds
            bounds = self.clip_bounds.get(col, {"low": -np.inf, "high": np.inf})
            low = bounds.get("low", -np.inf)
            high = bounds.get("high", np.inf)
            s = s.clip(lower=low, upper=high)
            interim[col] = s
        # Scale via fitted scaler
        matrix = interim[self.feature_columns].values.astype(float)
        scaled = self.scaler.transform(matrix)
        # Return as DataFrame with same index, ordered columns
        result = pd.DataFrame(scaled, columns=self.feature_columns, index=df_norm.index)
        return result

    def fit_transform(self, df_train: pd.DataFrame) -> pd.DataFrame:
        """Fit on train and transform it."""
        self.fit(df_train)
        return self.transform(df_train)

    # -----------------------------------------------------------------------
    # Schema serialization
    # -----------------------------------------------------------------------

    def get_schema(self) -> Dict[str, Any]:
        """Return schema dict for persistence."""
        if not self.fitted:
            raise RuntimeError("Pipeline not fitted")
        schema: Dict[str, Any] = {
            "seed": self.seed,
            "version": VERSION,
            "scaler": SCALER_TYPE,
            "train_only": True,
            "train_days": TRAIN_DAYS,
            "validation_days": VAL_DAYS,
            "test_days": TEST_DAYS,
            "feature_columns": self.feature_columns,
            "feature_columns_ordered": self.feature_columns,
            "feature_count": len(self.feature_columns),
            "dtypes": self.dtypes,
            "imputation_medians": self.medians,
            "clip_bounds": self.clip_bounds,
            "scaler_params": self.scaler_params,
            "constant_columns_removed": self.constant_columns_removed,
            "replay_identifiers": self.replay_identifiers,
            "replay_identifiers_normalized": list(REPLAY_IDENTIFIERS_NORMALIZED),
            "split": {
                "train": "Tuesday+Wednesday (Mon is benign baseline only, not for training)",
                "validation": "Thursday",
                "test": "Friday (sealed holdout)",
            },
            "notes": "Train-only imputation, clipping, scaling; Friday sealed",
        }
        return schema


# ---------------------------------------------------------------------------
# Top-level helpers for schema persistence
# ---------------------------------------------------------------------------

def fit_pipeline_on_train(seed: int = SEED) -> PreprocessingPipeline:
    """Fit pipeline strictly on training data (Tue+Wed) without touching Friday or Monday.

    This is the sole fitting entrypoint that test_friday_not_used_for_fitting will check.
    Must NOT read Friday.
    """
    df_train = get_train_data()  # only Tue+Wed
    pipeline = PreprocessingPipeline(seed=seed)
    pipeline.fit(df_train)
    return pipeline


def build_and_save_schema(output_path: Optional[Path] = None, seed: int = SEED) -> Dict[str, Any]:
    """Fit on train and persist artifacts/feature_schema.json.

    Does NOT read Friday. Idempotent and deterministic with same seed.
    Returns schema dict.
    """
    root = _resolve_project_root()
    if output_path is None:
        output_path = root / "artifacts" / "feature_schema.json"
    output_path = Path(output_path)
    output_path.parent.mkdir(parents=True, exist_ok=True)

    pipeline = fit_pipeline_on_train(seed=seed)
    schema = pipeline.get_schema()
    # Note: no volatile timestamp - schema is deterministic with same seed
    # If needed, caller can add generated_at separately but not persisted for determinism
    # Write deterministic JSON (sorted keys, indent 2)
    with output_path.open("w", encoding="utf-8") as f:
        json.dump(schema, f, indent=2, sort_keys=True)
    return schema


def load_schema(path: Optional[Path] = None) -> Dict[str, Any]:
    """Load feature_schema.json."""
    root = _resolve_project_root()
    if path is None:
        path = root / "artifacts" / "feature_schema.json"
    path = Path(path)
    if not path.exists():
        raise FileNotFoundError(f"Feature schema not found at {path} - run build_and_save_schema() first")
    with path.open("r", encoding="utf-8") as f:
        data = json.load(f)
    return data


# Legacy alias for compatibility if tests expect different names
def fit_and_save_schema(*args, **kwargs):
    return build_and_save_schema(*args, **kwargs)


# Convenience: support calling as script
if __name__ == "__main__":
    schema = build_and_save_schema()
    print(f"[preprocessing] Saved schema to artifacts/feature_schema.json with {len(schema['feature_columns'])} features")
    print(f"  Constant removed: {schema['constant_columns_removed']}")
    print(f"  Replay identifiers excluded: {schema['replay_identifiers']}")
