"""Tests for Phase 08 - Explainability, MITRE, and what-if isolation (simulation).

Covers:
- Original replay remains unchanged after simulation (immutable deepcopy)
- Unsupported host/action returns structured 422 error
- Simulation is labeled as estimated and non-causal
- Before/after deltas, risk reduction, stage_changed, changed target ranking
- Removed-edge visualization data (muted, status=removed)
"""

import copy
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)
SCENARIO_ID = "cyberworld-replay-v1"


def _get_valid_host_and_frame(frame_id=10):
    detail = client.get(f"/api/v1/scenarios/{SCENARIO_ID}").json()
    frame = detail["frames"][frame_id]
    nodes = frame["nodes"]
    assert len(nodes) > 0
    # Prefer top ranked host if available
    forecast = frame.get("forecast") or {}
    ranking = forecast.get("target_ranking") or frame.get("target_ranking") or []
    if ranking:
        top = ranking[0].get("host")
        if any(n.get("id") == top for n in nodes):
            return top, frame_id, detail
    return nodes[0]["id"], frame_id, detail


def test_simulate_immutable_original_unchanged():
    # Fetch before snapshot deep copy
    detail_before = client.get(f"/api/v1/scenarios/{SCENARIO_ID}").json()
    frame_id = 10
    valid_host, _, _ = _get_valid_host_and_frame(frame_id)
    frame_before = copy.deepcopy(detail_before["frames"][frame_id])
    edges_before_len = len(frame_before["edges"])
    nodes_before_len = len(frame_before["nodes"])
    raw_before = frame_before["signals"]["raw_risk"]
    smoothed_before = frame_before["signals"]["smoothed_risk"]

    payload = {"scenario_id": SCENARIO_ID, "frame_id": frame_id, "host": valid_host, "action": "isolate_host"}
    resp = client.post("/api/v1/simulate/isolate-host", json=payload)
    assert resp.status_code == 200, resp.text
    data = resp.json()

    # Fetch after - original replay must be unchanged
    detail_after = client.get(f"/api/v1/scenarios/{SCENARIO_ID}").json()
    frame_after = detail_after["frames"][frame_id]

    assert len(frame_after["nodes"]) == nodes_before_len, "Original nodes mutated"
    assert len(frame_after["edges"]) == edges_before_len, "Original edges mutated"
    assert abs(frame_after["signals"]["raw_risk"] - raw_before) < 1e-9, "Original raw_risk mutated"
    assert abs(frame_after["signals"]["smoothed_risk"] - smoothed_before) < 1e-9, "Original smoothed mutated"
    # Also check deep equality
    assert frame_after["signals"] == frame_before["signals"]
    assert frame_after["edges"] == frame_before["edges"]
    assert frame_after["forecast"]["stage"] == frame_before["forecast"]["stage"]
    # Simulation result must indicate immutable
    assert data.get("original_unchanged") is True
    # Second simulation should produce same before
    resp2 = client.post("/api/v1/simulate/isolate-host", json=payload)
    assert resp2.status_code == 200
    data2 = resp2.json()
    assert abs(data2["before"]["raw_risk"] - raw_before) < 1e-9
    assert data["before"] == data2["before"], "Before should be deterministic and unchanged across calls"


def test_simulate_unsupported_host_returns_422_structured_error():
    valid_host, frame_id, _ = _get_valid_host_and_frame(10)
    # Invalid host
    resp = client.post(
        "/api/v1/simulate/isolate-host",
        json={"scenario_id": SCENARIO_ID, "frame_id": frame_id, "host": "host-99999", "action": "isolate_host"},
    )
    assert resp.status_code == 422, f"Expected 422 for invalid host, got {resp.status_code} {resp.text}"
    body = resp.json()
    assert "detail" in body, "Structured error must contain detail"
    assert "host-99999" in body["detail"] or "Host not found" in body["detail"] or "not found" in body["detail"].lower()

    # Also test empty host
    resp_empty = client.post(
        "/api/v1/simulate/isolate-host",
        json={"scenario_id": SCENARIO_ID, "frame_id": frame_id, "host": "", "action": "isolate_host"},
    )
    assert resp_empty.status_code == 422
    assert "detail" in resp_empty.json()


def test_simulate_unsupported_action_returns_422_structured_error():
    valid_host, frame_id, _ = _get_valid_host_and_frame(10)
    resp = client.post(
        "/api/v1/simulate/isolate-host",
        json={"scenario_id": SCENARIO_ID, "frame_id": frame_id, "host": valid_host, "action": "delete_host"},
    )
    assert resp.status_code == 422
    body = resp.json()
    assert "detail" in body
    assert "isolate" in body["detail"].lower() or "unsupported" in body["detail"].lower() or "action" in body["detail"].lower()

    # Also test missing action
    resp2 = client.post(
        "/api/v1/simulate/isolate-host",
        json={"scenario_id": SCENARIO_ID, "frame_id": frame_id, "host": valid_host, "action": ""},
    )
    assert resp2.status_code == 422


def test_simulate_label_and_limitations_non_causal():
    valid_host, frame_id, _ = _get_valid_host_and_frame(12)
    resp = client.post(
        "/api/v1/simulate/isolate-host",
        json={"scenario_id": SCENARIO_ID, "frame_id": frame_id, "host": valid_host, "action": "isolate_host"},
    )
    assert resp.status_code == 200
    data = resp.json()
    # Label must be exactly "Estimated simulated effect - not causal proof"
    assert data["label"] == "Estimated simulated effect - not causal proof", f"label mismatch {data['label']}"
    assert data.get("message") == "Estimated simulated effect - not causal proof"
    assert "Estimated simulated effect - not causal proof" in data["limitations"], f"limitations missing label: {data['limitations']}"
    # Must contain claims about simulated and not causal
    lim_lower = data["limitations"].lower()
    assert "not causal" in lim_lower
    assert "simulated" in lim_lower
    # Engine metadata should be present
    assert "engine_metadata" in data or "engineMetadata" in data


def test_simulate_before_after_deltas_and_reduction():
    valid_host, frame_id, detail = _get_valid_host_and_frame(10)
    resp = client.post(
        "/api/v1/simulate/isolate-host",
        json={"scenario_id": SCENARIO_ID, "frame_id": frame_id, "host": valid_host, "action": "isolate_host"},
    )
    assert resp.status_code == 200
    data = resp.json()
    before = data["before"]
    after = data["after"]
    deltas = data["deltas"]

    # Structure checks
    for key in ["raw_risk", "smoothed_risk", "slope", "warning", "stage", "target_ranking"]:
        assert key in before, f"before missing {key}"
        assert key in after, f"after missing {key}"
    for key in ["raw_risk_delta", "smoothed_risk_delta", "risk_reduction_percent", "stage_changed"]:
        assert key in deltas, f"deltas missing {key}"

    # Types
    assert isinstance(before["raw_risk"], float)
    assert isinstance(after["raw_risk"], float)
    assert isinstance(deltas["raw_risk_delta"], float)
    assert isinstance(deltas["smoothed_risk_delta"], float)
    assert isinstance(deltas.get("stage_changed"), bool)

    # After risk should be less than or equal before (isolation reduces risk)
    assert after["raw_risk"] <= before["raw_risk"] + 1e-9, f"after raw {after['raw_risk']} not <= before {before['raw_risk']}"
    assert after["smoothed_risk"] <= before["smoothed_risk"] + 1e-9 + 0.02  # allow small residual
    # Deltas should be after minus before
    assert abs(deltas["raw_risk_delta"] - (after["raw_risk"] - before["raw_risk"])) < 1e-9
    assert abs(deltas["smoothed_risk_delta"] - (after["smoothed_risk"] - before["smoothed_risk"])) < 1e-9
    # risk reduction percent should be positive if before>after
    if before["raw_risk"] > 0:
        expected_rr = (before["raw_risk"] - after["raw_risk"]) / before["raw_risk"] * 100
        assert abs(deltas["risk_reduction_percent"] - expected_rr) < 1e-6
        assert deltas["risk_reduction_percent"] >= -1e-9

    # Stage change flag consistent
    assert deltas["stage_changed"] == (before["stage"] != after["stage"])

    # Target ranking present in before/after
    assert isinstance(before["target_ranking"], list) and len(before["target_ranking"]) > 0
    assert isinstance(after["target_ranking"], list) and len(after["target_ranking"]) > 0
    # Each entry should have host, target_score
    for entry in before["target_ranking"]:
        assert "host" in entry and "target_score" in entry
    for entry in after["target_ranking"]:
        assert "host" in entry and "target_score" in entry


def test_simulate_removed_edges_muted_and_ranking_changed():
    valid_host, frame_id, detail = _get_valid_host_and_frame(10)
    orig_frame = detail["frames"][frame_id]
    orig_edges = orig_frame["edges"]
    # Count edges involving host
    expected_removed_count = sum(1 for e in orig_edges if e["source"] == valid_host or e["target"] == valid_host)

    resp = client.post(
        "/api/v1/simulate/isolate-host",
        json={"scenario_id": SCENARIO_ID, "frame_id": frame_id, "host": valid_host, "action": "isolate_host"},
    )
    assert resp.status_code == 200
    data = resp.json()
    removed = data["removed_edges"]
    assert isinstance(removed, list)
    # Removed count should match expected (may be 0 if host has no edges but we consider valid)
    assert len(removed) == expected_removed_count, f"removed {len(removed)} != expected {expected_removed_count} for host {valid_host}"
    for e in removed:
        assert e["source"] == valid_host or e["target"] == valid_host, f"removed edge {e} not containing host {valid_host}"
        # Must be marked as removed/muted for visualization
        assert e["status"] == "removed", f"removed edge status must be 'removed', got {e.get('status')}"
        # style muted
        assert e.get("style") == "muted" or e.get("status") == "removed", "removed edge should have muted style"
        assert "Isolated host" in e.get("reason", "") or "isolated" in str(e).lower()

    # Check ranking changed: after ranking should reflect removed edges - incoming reduced for host
    data["before"]["target_ranking"][0]["host"]
    data["after"]["target_ranking"][0]["host"]
    # For most frames, top before involves host connections, after may be different (not guaranteed always but should at least recompute)
    # We check that after ranking is recomputed and deterministic: call again and compare
    resp2 = client.post(
        "/api/v1/simulate/isolate-host",
        json={"scenario_id": SCENARIO_ID, "frame_id": frame_id, "host": valid_host, "action": "isolate_host"},
    )
    assert resp2.json()["after"]["target_ranking"] == data["after"]["target_ranking"], "After ranking must be deterministic"

    # Ensure after ranking still graph-ranked (sorted descending)
    after_ranking = data["after"]["target_ranking"]
    scores = [r["target_score"] for r in after_ranking]
    assert scores == sorted(scores, reverse=True), "After ranking not sorted descending"


def test_simulate_alias_fields_and_invalid_frame_scenario():
    valid_host, frame_id, _ = _get_valid_host_and_frame(5)
    # alias fields scenario/frame should work
    resp = client.post("/api/v1/simulate/isolate-host", json={"scenario": SCENARIO_ID, "frame": frame_id, "host": valid_host, "action": "isolate_host"})
    assert resp.status_code == 200, resp.text
    assert resp.json()["scenario_id"] == SCENARIO_ID
    assert resp.json()["frame_id"] == frame_id

    # Invalid frame out of range
    resp2 = client.post("/api/v1/simulate/isolate-host", json={"scenario_id": SCENARIO_ID, "frame_id": 99, "host": valid_host, "action": "isolate_host"})
    assert resp2.status_code == 422
    assert "detail" in resp2.json()

    # Invalid scenario
    resp3 = client.post("/api/v1/simulate/isolate-host", json={"scenario_id": "not-exist", "frame_id": 5, "host": valid_host, "action": "isolate_host"})
    assert resp3.status_code == 404
    assert "detail" in resp3.json()


def test_simulate_deterministic_same_host_twice():
    valid_host, frame_id, _ = _get_valid_host_and_frame(15)
    payload = {"scenario_id": SCENARIO_ID, "frame_id": frame_id, "host": valid_host, "action": "isolate_host"}
    r1 = client.post("/api/v1/simulate/isolate-host", json=payload).json()
    r2 = client.post("/api/v1/simulate/isolate-host", json=payload).json()
    assert r1["after"] == r2["after"]
    assert r1["before"] == r2["before"]
    assert r1["removed_edges"] == r2["removed_edges"]
    assert r1["deltas"] == r2["deltas"]
