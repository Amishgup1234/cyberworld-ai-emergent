"""Tests for the health endpoint."""

import sys
from pathlib import Path

# Add backend to path
sys.path.insert(0, str(Path(__file__).parent.parent))

from fastapi.testclient import TestClient

from app.main import app


def test_health_endpoint():
    """Test that health endpoint returns status ok and engine metadata."""
    client = TestClient(app)
    response = client.get("/api/v1/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "ok"
    assert data["engine"] in ["trained", "not-trained"]
    assert "message" in data
    # Phase 06 adds engine metadata when trained
    if data["engine"] == "trained":
        assert "model_family" in data
        assert "data_mode" in data
        assert "version" in data
        # engine_metadata should be present
        assert "engine_metadata" in data or "claim_limitations" in data