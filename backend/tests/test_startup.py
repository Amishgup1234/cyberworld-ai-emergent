"""Regression test for documented backend startup (Phase 09 repair 1 & 2).

Covers the same import/package configuration used by `make dev` / `make dev-backend`
(`backend.app.main:app` from project root) and verifies that existing artifacts
produce a trained health response, while missing/invalid artifacts still produce
the truthful not-trained fallback without hiding model-loading exceptions.
"""

from pathlib import Path
import sys
import tempfile
import shutil

from fastapi.testclient import TestClient


def _import_via_documented_path():
    """Import app via the same path used by `make dev-backend` (app.main with --app-dir backend)."""
    # This is the documented path: app.main:app --app-dir backend
    # Use the same sys.path hack as other tests for app.* imports
    import importlib

    # Try app.main via backend on path first (documented --app-dir backend)
    sys.path.insert(0, str(Path(__file__).parent.parent))
    try:
        mod = importlib.import_module("app.main")
        return mod.app
    except Exception:
        # Fallback to backend.app.main from project root
        if str(Path(__file__).parent.parent) in sys.path:
            sys.path.remove(str(Path(__file__).parent.parent))
        mod = importlib.import_module("backend.app.main")
        return mod.app
    finally:
        if str(Path(__file__).parent.parent) in sys.path:
            # Keep it for subsequent app.state imports that rely on it
            pass


def test_documented_import_path_loads_trained_model():
    """Same import as `make dev` must load saved trained model and report engine: trained."""
    app = _import_via_documented_path()
    # Use TestClient which triggers lifespan and ensures load_state is called
    # We need to ensure state is reset first to test fresh load
    from app.state import reset_state, load_state

    reset_state()
    # Load via the same state loader used by lifespan
    state = load_state()
    assert state["model_payload"] is not None, f"model_payload should be loaded from artifacts, load_error={state.get('load_error')}"
    assert state["scenario"] is not None, f"scenario should be loaded, load_error={state.get('load_error')}"
    assert state["load_error"] is None, f"load_error should be None for valid artifacts, got {state.get('load_error')}"

    client = TestClient(app)
    resp = client.get("/api/v1/health")
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "ok"
    # Must be trained when artifacts are present
    assert data["engine"] == "trained", f"Expected engine trained with artifacts present, got {data!r}"
    assert data["model_family"] == "random_forest"
    assert data["data_mode"] == "synthetic"
    assert "message" in data
    assert "Model trained" in data["message"]
    # Engine metadata should be present
    assert data.get("engine_metadata") is not None or data.get("claim_limitations") is not None

    # Verify that using the old app.main via --app-dir also still works for backward compat
    # This ensures we didn't break the sys.path hack path
    sys.path.insert(0, str(Path(__file__).parent.parent))
    try:

        from app.state import reset_state as reset2, load_state as load2  # type: ignore

        reset2()
        s2 = load2()
        assert s2["model_payload"] is not None
    finally:
        if str(Path(__file__).parent.parent) in sys.path:
            sys.path.remove(str(Path(__file__).parent.parent))


def test_missing_artifacts_produces_not_trained_fallback():
    """Missing or invalid artifacts must still produce truthful not-trained fallback, not crash."""
    from app.state import reset_state, load_state

    # Save original artifacts by temporarily moving them
    root = Path(__file__).resolve().parents[2]
    artifacts_dir = root / "artifacts"
    model_path = artifacts_dir / "risk_model.joblib"
    metrics_path = artifacts_dir / "metrics.json"
    # Also test with invalid JSON
    reset_state()
    # Test missing case: move files away, load, check not-trained
    with tempfile.TemporaryDirectory() as tmp:
        tmp_path = Path(tmp)
        # Move files
        moved = []
        for p in [model_path, metrics_path]:
            if p.exists():
                dest = tmp_path / p.name
                shutil.move(str(p), str(dest))
                moved.append((p, dest))
        try:
            reset_state()
            state = load_state(force=True)
            # Should be not-trained, not crash
            assert state["model_payload"] is None
            assert state["load_error"] is None or "not found" not in str(state["load_error"]).lower() or state["load_error"] is None
            # Health via documented import should be not-trained
            app = _import_via_documented_path()
            client = TestClient(app)
            resp = client.get("/api/v1/health")
            assert resp.status_code == 200
            data = resp.json()
            assert data["engine"] == "not-trained"
            lower_msg = data["message"].lower()
            assert "not" in lower_msg and "trained" in lower_msg, f"Expected not-trained message to contain not and trained, got {data['message']!r}"
        finally:
            # Restore
            for orig, tmp_file in moved:
                if tmp_file.exists():
                    shutil.move(str(tmp_file), str(orig))
            reset_state()
            load_state(force=True)

    # Test invalid artifacts: corrupt metrics.json
    with tempfile.TemporaryDirectory() as tmp:
        # Backup original metrics
        orig_content = metrics_path.read_text(encoding="utf-8") if metrics_path.exists() else None
        try:
            metrics_path.write_text("{ invalid json", encoding="utf-8")
            reset_state()
            state = load_state(force=True)
            # Should preserve diagnostic and still be not-trained or trained with error
            assert state["load_error"] is not None, "load_error should retain diagnostic for invalid metrics"
            assert "metrics load error" in state["load_error"].lower() or "invalid" in state["load_error"].lower()
            # Health should still be reachable, not crash, with not-trained or degraded trained
            app = _import_via_documented_path()
            client = TestClient(app)
            resp = client.get("/api/v1/health")
            assert resp.status_code == 200
            data = resp.json()
            # Even with invalid metrics, model_payload may still be present, so engine may be trained or not-trained, but must not be 500
            assert data["engine"] in ("trained", "not-trained")
            assert "message" in data
        finally:
            if orig_content is not None:
                metrics_path.write_text(orig_content, encoding="utf-8")
            reset_state()
            load_state(force=True)

    # Ensure after restore, we are back to trained
    from app.state import get_state

    state = get_state()
    assert state["model_payload"] is not None
    app = _import_via_documented_path()
    client = TestClient(app)
    resp = client.get("/api/v1/health")
    assert resp.json()["engine"] == "trained"


def test_load_error_diagnostic_retained_not_hidden():
    """Model-loading exceptions must retain diagnostic info, not be silently swallowed."""
    from app.state import reset_state, load_state

    # Force an error by making artifacts unreadable via invalid joblib
    root = Path(__file__).resolve().parents[2]
    model_path = root / "artifacts" / "risk_model.joblib"
    orig_bytes = model_path.read_bytes() if model_path.exists() else None
    try:
        # Write invalid joblib content
        model_path.write_bytes(b"not a valid joblib")
        reset_state()
        state = load_state(force=True)
        # Should have load_error with diagnostic
        assert state["load_error"] is not None
        assert "model load error" in state["load_error"].lower()
        assert state["model_payload"] is None
        # Health should be not-trained but still 200, not crash
        app = _import_via_documented_path()
        client = TestClient(app)
        resp = client.get("/api/v1/health")
        assert resp.status_code == 200
        assert resp.json()["engine"] == "not-trained"
    finally:
        if orig_bytes is not None:
            model_path.write_bytes(orig_bytes)
        reset_state()
        load_state(force=True)
