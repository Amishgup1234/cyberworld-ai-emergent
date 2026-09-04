"""Global state loader for Phase 06 - loads model and scenario once at startup.

Caches risk_model.joblib, metrics.json, scenario.json, feature_schema.json.
Handles missing files gracefully (health returns engine not-trained).
Deterministic seed 42, same engine as scenario.py.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any, Dict, Optional
import joblib

# Global cached state
_state: Dict[str, Any] = {
    "loaded": False,
    "model_payload": None,  # dict from risk_model.joblib
    "metrics": None,
    "scenario": None,
    "feature_schema": None,
    "engine_metadata": None,
    "threshold": 0.45,
    "model_family": None,
    "data_mode": "synthetic",
    "version": "0.1.0",
    "load_error": None,
}


def _resolve_project_root() -> Path:
    try:
        root = Path(__file__).resolve().parents[2]
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


def load_state(force: bool = False) -> Dict[str, Any]:
    """Load model, metrics, scenario once. Idempotent unless force=True."""
    global _state
    if _state["loaded"] and not force:
        return _state

    root = _resolve_project_root()
    artifacts_model = root / "artifacts" / "risk_model.joblib"
    artifacts_metrics = root / "artifacts" / "metrics.json"
    artifacts_schema = root / "artifacts" / "feature_schema.json"
    demo_scenario = root / "data" / "demo" / "cyberworld_replay.json"
    frontend_bundle = root / "frontend" / "public" / "offline_bundle.json"

    # Load model payload
    model_payload = None
    metrics = None
    scenario = None
    feature_schema = None
    threshold = 0.45
    model_family = None
    data_mode = "synthetic"
    version = "0.1.0"
    claim_limitations = "Binary benign-versus-malicious risk only (learned); stage estimate is rule-derived evidence score; target ranking is NetworkX graph-ranked; isolation is simulated estimate - not causal proof; Friday held-out evaluated once after freeze; no SMOTE, no train/validation/test leakage; preprocessing fitted on train only. Target gates not all achieved - see target_gates.measured; model limitations visible in UI."

    # metrics first for threshold/model_family
    if artifacts_metrics.exists():
        try:
            metrics = json.loads(artifacts_metrics.read_text(encoding="utf-8"))
            # threshold
            if "threshold" in metrics and isinstance(metrics["threshold"], (int, float)):
                threshold = float(metrics["threshold"])
            elif "selection_threshold" in metrics:
                threshold = float(metrics["selection_threshold"])
            elif "warning_threshold" in metrics:
                threshold = float(metrics["warning_threshold"])
            elif "evaluation" in metrics and isinstance(metrics["evaluation"], dict) and "threshold" in metrics["evaluation"]:
                threshold = float(metrics["evaluation"]["threshold"])
            if "model_family" in metrics:
                model_family = str(metrics["model_family"])
            if "data_mode" in metrics:
                data_mode = str(metrics["data_mode"])
            elif "provenance" in metrics and isinstance(metrics["provenance"], dict) and "data_mode" in metrics["provenance"]:
                data_mode = str(metrics["provenance"]["data_mode"])
            if "claim_limitations" in metrics and isinstance(metrics["claim_limitations"], str):
                claim_limitations = metrics["claim_limitations"]
            elif "limitations" in metrics and isinstance(metrics["limitations"], str):
                claim_limitations = metrics["limitations"]
            if "model_version" in metrics:
                version = str(metrics["model_version"])
            elif "version" in metrics and isinstance(metrics["version"], str):
                version = metrics["version"]
        except Exception as e:
            # don't fail, just keep defaults
            _state["load_error"] = f"metrics load error: {e}"

    # model payload - handle both app.* and backend.app.* pickle paths
    if artifacts_model.exists():
        try:
            # Ensure both import paths are aliases for unpickling (critical for app.main vs backend.app.main mismatch)
            import sys as _sys
            import importlib as _importlib
            import types as _types

            # Ensure backend package exists as alias for app when using --app-dir (app is top-level)
            # and app exists as alias for backend.app when using backend.app import from project root
            try:
                # If app is loaded but backend is not, create backend alias
                if "app" in _sys.modules and "backend" not in _sys.modules:
                    _backend_mod = _types.ModuleType("backend")
                    _backend_mod.__path__ = []  # type: ignore
                    _sys.modules["backend"] = _backend_mod
                    # Alias backend.app to app
                    _sys.modules["backend.app"] = _sys.modules["app"]
                    for _key in list(_sys.modules.keys()):
                        if _key.startswith("app."):
                            _backend_key = "backend." + _key
                            if _backend_key not in _sys.modules:
                                _sys.modules[_backend_key] = _sys.modules[_key]
                # If backend.app is loaded but app is not, alias app to backend.app
                if "backend.app" in _sys.modules and "app" not in _sys.modules:
                    _sys.modules["app"] = _sys.modules["backend.app"]
                    for _key in list(_sys.modules.keys()):
                        if _key.startswith("backend.app."):
                            _app_key = _key[len("backend.") :]
                            if _app_key not in _sys.modules:
                                _sys.modules[_app_key] = _sys.modules[_key]
                    if "backend" in _sys.modules and "app" not in _sys.modules:
                        # Also ensure backend alias exists
                        pass
                # Also try to import both to ensure they are loaded
                for _mod in ["app.data.preprocessing", "backend.app.data.preprocessing", "app.replay.scenario", "backend.app.replay.scenario"]:
                    if _mod not in _sys.modules:
                        try:
                            _importlib.import_module(_mod)
                        except Exception:
                            pass
                # Final alias pass for all app <-> backend.app
                for _key in list(_sys.modules.keys()):
                    if _key.startswith("app."):
                        _backend_key = "backend." + _key
                        if _backend_key not in _sys.modules:
                            _sys.modules[_backend_key] = _sys.modules[_key]
                    if _key.startswith("backend.app."):
                        _app_key = _key[len("backend.") :]
                        if _app_key not in _sys.modules:
                            _sys.modules[_app_key] = _sys.modules[_key]
            except Exception as _alias_e:
                print(f"[state] alias setup failed: {_alias_e}", file=_sys.stderr)

            # Try normal joblib first (should now succeed with aliases)
            try:
                model_payload = joblib.load(artifacts_model)
            except ModuleNotFoundError as _e:
                print(f"[state] joblib load failed with {_e}, trying direct alias", file=_sys.stderr)
                raise
            if model_payload and isinstance(model_payload, dict):
                if model_family is None:
                    model_family = model_payload.get("model_family") or model_payload.get("model", {}).get("model_family")
                if model_family is None and metrics and "model_family" in metrics:
                    model_family = metrics["model_family"]
                # threshold from payload if not from metrics
                if model_payload.get("threshold") is not None and metrics is None:
                    threshold = float(model_payload["threshold"])
                # version from payload
                if model_payload.get("model_version"):
                    version = str(model_payload["model_version"])
                elif model_payload.get("version"):
                    version = str(model_payload["version"])
            # Debug removed for production - keep silent unless error
            pass
        except Exception as e:
            import traceback as _traceback
            import sys as _sys2

            print(f"[state] model load exception: {e}", file=_sys2.stderr)
            _traceback.print_exc(file=_sys2.stderr)
            _state["load_error"] = f"model load error: {e}"
            model_payload = None
    else:
        pass

    # feature schema
    if artifacts_schema.exists():
        try:
            feature_schema = json.loads(artifacts_schema.read_text(encoding="utf-8"))
        except Exception:
            feature_schema = None

    # scenario - try demo first, then frontend bundle fallback, then generate via replay engine (if offline fallback same engine)
    scenario_path = None
    if demo_scenario.exists():
        scenario_path = demo_scenario
    elif frontend_bundle.exists():
        scenario_path = frontend_bundle  # bundle contains scenario inside

    if scenario_path and scenario_path.exists():
        try:
            data = json.loads(scenario_path.read_text(encoding="utf-8"))
            # if bundle, scenario is inside data["scenario"]
            if "scenario" in data and isinstance(data["scenario"], dict) and "frames" in data["scenario"]:
                scenario = data["scenario"]
            elif "frames" in data:
                scenario = data
            else:
                scenario = data
            # ensure scenario_id exists
            if scenario and "scenario_id" not in scenario and "id" in scenario:
                scenario["scenario_id"] = scenario["id"]
        except Exception as e:
            _state["load_error"] = f"scenario load error: {e}"
            scenario = None

    # Fallback: generate via replay engine if files missing but we want deterministic offline fallback behavior?
    # We won't auto-generate here to keep startup fast; health will return not-trained if missing.
    # But if we have model_payload yet no scenario, try to generate via scenario.py generate_scenario
    # Handle both import paths: app.replay.scenario (when using --app-dir backend) and backend.app.replay.scenario (when using backend package)
    if scenario is None and model_payload is not None:
        generate_scenario = None
        for import_path in ("app.replay.scenario", "backend.app.replay.scenario"):
            try:
                mod = __import__(import_path, fromlist=["generate_scenario"])
                generate_scenario = getattr(mod, "generate_scenario", None)
                if generate_scenario:
                    break
            except Exception:
                continue
        if generate_scenario:
            try:
                scenario = generate_scenario()
            except Exception as e:
                _state["load_error"] = f"scenario generate error: {e}"
                scenario = None

    # data_mode fallback from scenario
    if scenario and isinstance(scenario, dict):
        # check metadata data_mode
        meta = scenario.get("metadata") or {}
        if isinstance(meta, dict) and "data_mode" in meta:
            data_mode = str(meta["data_mode"])
        elif "engine_metadata" in scenario and isinstance(scenario["engine_metadata"], dict) and "data_mode" in scenario["engine_metadata"]:
            data_mode = str(scenario["engine_metadata"]["data_mode"])

    # Build engine_metadata dict
    engine_metadata = {
        "model_family": model_family or ("random_forest" if model_payload else "not-trained"),
        "model_version": version,
        "data_mode": data_mode,
        "feature_schema_version": (feature_schema.get("version") if feature_schema else "phase03-v1-sealed"),
        "feature_count": (feature_schema.get("feature_count") if feature_schema else (len(feature_schema.get("feature_columns")) if feature_schema and "feature_columns" in feature_schema else 80)),
        "claim_limitations": claim_limitations,
        "threshold": threshold,
        "mitre_version": "13.1",
        "version": version,
        "data_source_url": "https://www.unb.ca/cic/datasets/ids-2017.html",
    }
    # fallback feature_count to 80 if not found
    if not engine_metadata.get("feature_count") or engine_metadata["feature_count"] == 0:
        engine_metadata["feature_count"] = 80

    # handle case where feature_schema is None but we have metrics feature_count
    if feature_schema is None and metrics and "feature_count" in metrics:
        engine_metadata["feature_count"] = int(metrics["feature_count"])
        engine_metadata["feature_schema_version"] = metrics.get("feature_schema_version", "phase03-v1-sealed")

    _state.update(
        {
            "loaded": True,
            "model_payload": model_payload,
            "metrics": metrics,
            "scenario": scenario,
            "feature_schema": feature_schema,
            "engine_metadata": engine_metadata,
            "threshold": threshold,
            "model_family": model_family,
            "data_mode": data_mode,
            "version": version,
            "claim_limitations": claim_limitations,
        }
    )
    return _state


def get_state() -> Dict[str, Any]:
    if not _state["loaded"]:
        return load_state()
    return _state


def get_model_payload() -> Optional[Dict[str, Any]]:
    return get_state().get("model_payload")


def get_metrics() -> Optional[Dict[str, Any]]:
    return get_state().get("metrics")


def get_scenario() -> Optional[Dict[str, Any]]:
    return get_state().get("scenario")


def get_feature_schema() -> Optional[Dict[str, Any]]:
    return get_state().get("feature_schema")


def get_engine_metadata() -> Dict[str, Any]:
    return get_state().get("engine_metadata", {})


def get_threshold() -> float:
    return float(get_state().get("threshold", 0.45))


def is_trained() -> bool:
    s = get_state()
    return s.get("model_payload") is not None and s.get("scenario") is not None


def reset_state() -> None:
    """For testing - reset loaded flag."""
    global _state
    _state = {
        "loaded": False,
        "model_payload": None,
        "metrics": None,
        "scenario": None,
        "feature_schema": None,
        "engine_metadata": None,
        "threshold": 0.45,
        "model_family": None,
        "data_mode": "synthetic",
        "version": "0.1.0",
        "load_error": None,
    }


# Pre-load at import for TestClient convenience (but lifespan will also call)
# Do not auto-load heavy scenario at import time if not needed? We'll lazy load on first get_state
# For deterministic offline fallback, we ensure load_state is called at startup lifespan
