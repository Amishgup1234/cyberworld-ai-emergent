"""Alias for leakage-safe preprocessing - re-exports from data.preprocessing.

Phase 03 deliverable allows either backend/app/data/preprocessing.py or backend/app/preprocessing.py.
This alias ensures both import paths work.
"""

from .data.preprocessing import *  # noqa: F401,F403
from .data.preprocessing import (
    SEED,
    SCALER_TYPE,
    REPLAY_IDENTIFIERS_NORMALIZED,
    PreprocessingPipeline,
    normalize_columns,
    load_raw_split,
    get_train_data,
    get_validation_data,
    get_test_data,
    get_monday_data,
    get_sealed_friday_metadata,
    SealedHoldoutError,
    fit_pipeline_on_train,
    build_and_save_schema,
    load_schema,
)

__all__ = [
    "SEED",
    "SCALER_TYPE",
    "REPLAY_IDENTIFIERS_NORMALIZED",
    "PreprocessingPipeline",
    "normalize_columns",
    "load_raw_split",
    "get_train_data",
    "get_validation_data",
    "get_test_data",
    "get_monday_data",
    "get_sealed_friday_metadata",
    "SealedHoldoutError",
    "fit_pipeline_on_train",
    "build_and_save_schema",
    "load_schema",
]
