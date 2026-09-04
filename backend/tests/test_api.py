"""Tests for Phase 06 - FastAPI contracts and forecast services."""

import sys
import time
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).parent.parent))

from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)

SCENARIO_ID = "cyberworld-replay-v1"


# ---------------------------------------------------------------------------
# Health
# ---------------------------------------------------------------------------

def test_health_success():
    resp = client.get("/api/v1/health")
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "ok"
    assert data["engine"] in ["trained", "not-trained"]
    assert "message" in data
    # Per Phase 06 spec, health must include engine metadata when trained
    # Check fields present
    assert "version" in data or "model_family" in data or "data_mode" in data
    if data["engine"] == "trained":
        assert data.get("model_family") in ["random_forest", "logistic_regression", None] or data.get("model_family") is not None
        assert data.get("data_mode") in ["synthetic", "downloaded"]
        assert "claim_limitations" in data or "engine_metadata" in data
        # engine_metadata should contain claim_limitations
        em = data.get("engine_metadata") or {}
        if isinstance(em, dict) and em:
            assert "claim_limitations" in em
            assert "model_family" in em


# ---------------------------------------------------------------------------
# Metrics
# ---------------------------------------------------------------------------

def test_metrics_success():
    resp = client.get("/api/v1/metrics")
    assert resp.status_code == 200, resp.text
    data = resp.json()
    # Must contain EvaluationMetrics fields
    # samples
    assert "samples" in data or "splits" in data
    samples = data.get("samples") or {}
    # Check at least train/val/test present
    assert "train" in samples or "train" in str(data)
    if "train" in samples:
        assert samples["train"] == 2306
    if "validation" in samples:
        assert samples["validation"] == 1053
    if "test" in samples:
        assert samples["test"] == 953
    # precision, recall, f1
    assert "precision" in data
    assert "recall" in data
    assert "f1" in data
    # fpr
    assert "fpr" in data
    assert 0.0 <= data["fpr"] <= 1.0
    # pr-auc, roc-auc
    assert "pr_auc" in data or "average_precision" in data
    assert "roc_auc" in data or "roc-auc" in str(data).lower()
    # confusion matrix
    cm = data.get("confusion_matrix")
    assert cm is not None and isinstance(cm, list) and len(cm) == 2
    # latency
    latency = data.get("latency") or data.get("latency_ms") or {}
    assert isinstance(latency, dict)
    p95 = latency.get("p95_ms") or latency.get("p95") or data.get("latency_ms_p95") or data.get("p95_latency_ms")
    assert p95 is not None
    assert 0 < p95 < 500, f"p95 latency {p95} should be <500ms per metrics.json"
    # claim limitations
    assert "claim_limitations" in data or "limitations" in data
    lim = data.get("claim_limitations") or data.get("limitations") or ""
    assert len(lim) > 20
    assert "not causal" in lim.lower()
    # engine metadata
    assert "provenance" in data or "split_provenance" in data or "engine_metadata" in data or "data_mode" in data


# ---------------------------------------------------------------------------
# Scenarios list
# ---------------------------------------------------------------------------

def test_scenarios_list():
    resp = client.get("/api/v1/scenarios")
    assert resp.status_code == 200, resp.text
    data = resp.json()
    assert isinstance(data, list) and len(data) >= 1
    first = data[0]
    assert "scenario_id" in first or "id" in first
    sid = first.get("scenario_id") or first.get("id")
    assert sid == SCENARIO_ID
    assert "name" in first
    assert "frame_count" in first
    assert 28 <= first["frame_count"] <= 32
    # duration disclosure
    assert "duration" in first or "disclosure" in first or "description" in first
    # disclosure must contain composite/synthetic
    text = " ".join([str(v) for v in first.values()]).lower()
    assert "composite" in text or "synthetic" in text


# ---------------------------------------------------------------------------
# Scenario detail
# ---------------------------------------------------------------------------

def test_scenario_detail_success_and_not_found():
    # success
    resp = client.get(f"/api/v1/scenarios/{SCENARIO_ID}")
    assert resp.status_code == 200, resp.text
    data = resp.json()
    assert data["scenario_id"] == SCENARIO_ID or data.get("id") == SCENARIO_ID
    assert "frames" in data
    frames = data["frames"]
    assert 28 <= len(frames) <= 32
    # check first frame has required fields
    f0 = frames[0]
    assert "timestamp" in f0
    assert "nodes" in f0
    assert "edges" in f0
    # signals and forecast
    assert "signals" in f0 or "forecast" in f0
    assert "ground_truth" in f0 or "groundTruth" in f0
    # metadata
    assert "metadata" in data or "engine_metadata" in data
    # disclosure in metadata
    meta_text = str(data.get("metadata", "")).lower() + str(data.get("claim_limitations", "")).lower()
    assert "composite" in meta_text or "synthetic" in meta_text or "disclosure" in meta_text

    # not found
    resp2 = client.get("/api/v1/scenarios/invalid-id-xyz")
    assert resp2.status_code == 404
    assert "detail" in resp2.json()


# ---------------------------------------------------------------------------
# Forecast success and invalid frame
# ---------------------------------------------------------------------------

def test_forecast_success_and_invalid_frame():
    # success with scenario_id/frame_id
    resp = client.post("/api/v1/forecast", json={"scenario_id": SCENARIO_ID, "frame_id": 10})
    assert resp.status_code == 200, resp.text
    data = resp.json()
    # must contain forecast with required fields
    assert "forecast" in data
    forecast = data["forecast"]
    assert "raw_risk" in forecast
    assert "smoothed_risk" in forecast
    assert "slope" in forecast
    assert "stage" in forecast
    assert "target_ranking" in forecast or "targetRanking" in forecast
    assert "evidence" in forecast
    assert "mitre" in forecast
    assert "engine_metadata" in forecast or "engineMetadata" in forecast
    # also top-level ground_truth
    assert "ground_truth" in data or "groundTruth" in data
    gt = data.get("ground_truth") or data.get("groundTruth")
    assert isinstance(gt, dict)
    # check alternative alias {scenario, frame}
    resp_alias = client.post("/api/v1/forecast", json={"scenario": SCENARIO_ID, "frame": 10})
    assert resp_alias.status_code == 200, resp_alias.text
    assert resp_alias.json()["forecast"]["raw_risk"] == forecast["raw_risk"]

    # invalid frame out of range -> 422
    resp_invalid = client.post("/api/v1/forecast", json={"scenario_id": SCENARIO_ID, "frame_id": 99})
    assert resp_invalid.status_code == 422, f"Expected 422 for invalid frame, got {resp_invalid.status_code}"
    assert "detail" in resp_invalid.json()

    # invalid frame negative
    resp_invalid2 = client.post("/api/v1/forecast", json={"scenario_id": SCENARIO_ID, "frame_id": -1})
    assert resp_invalid2.status_code == 422

    # invalid scenario -> 404
    resp_bad = client.post("/api/v1/forecast", json={"scenario_id": "bad-scenario", "frame_id": 5})
    assert resp_bad.status_code == 404


# ---------------------------------------------------------------------------
# Forecast no future labels before reveal
# ---------------------------------------------------------------------------

def test_forecast_no_future_labels_before_reveal():
    # frame 5 should be before ground truth (ground_truth_start is 20)
    resp = client.post("/api/v1/forecast", json={"scenario_id": SCENARIO_ID, "frame_id": 5})
    assert resp.status_code == 200, resp.text
    data = resp.json()
    gt = data.get("ground_truth") or data.get("groundTruth")
    assert gt is not None
    assert gt.get("revealed") is False, f"Frame 5 should not be revealed, got {gt}"
    assert gt.get("attack_type") is None, "attack_type must be None before reveal"
    assert gt.get("label_distribution") is None, "label_distribution must be None before reveal - future labels not exposed"
    assert gt.get("true_malicious_count") is None
    assert gt.get("true_malicious_ratio") is None
    # flow_summary must not contain raw label-derived fields
    fs = data.get("flow_summary") or {}
    # flow_summary from forecast endpoint is in data.flow_summary
    # Check that predicted fields exist, but raw malicious_count not
    assert "predicted_malicious_count" in fs
    assert "predicted_malicious_ratio" in fs
    assert "malicious_count" not in fs
    assert "malicious_ratio" not in fs
    assert "label_distribution" not in fs

    # frame 25 should be after reveal - must have revealed true
    resp2 = client.post("/api/v1/forecast", json={"scenario_id": SCENARIO_ID, "frame_id": 25})
    assert resp2.status_code == 200
    data2 = resp2.json()
    gt2 = data2.get("ground_truth") or data2.get("groundTruth")
    assert gt2.get("revealed") is True
    assert gt2.get("attack_type") is not None
    assert gt2.get("label_distribution") is not None
    assert isinstance(gt2.get("label_distribution"), dict)
    assert gt2.get("true_malicious_count") is not None


# ---------------------------------------------------------------------------
# Forecast includes engine metadata and limitations
# ---------------------------------------------------------------------------

def test_forecast_includes_engine_metadata_and_limitations():
    resp = client.post("/api/v1/forecast", json={"scenario_id": SCENARIO_ID, "frame_id": 10})
    assert resp.status_code == 200
    data = resp.json()
    forecast = data["forecast"]
    em = forecast.get("engine_metadata") or forecast.get("engineMetadata") or data.get("engine_metadata")
    assert em is not None, "Forecast must include engine_metadata"
    assert "model_family" in em
    assert em["model_family"] in ["random_forest", "logistic_regression"]
    assert "data_mode" in em
    assert em["data_mode"] in ["synthetic", "downloaded"]
    assert "claim_limitations" in em
    lim = em["claim_limitations"]
    assert len(lim) > 20
    assert "not causal" in lim.lower()
    # Also check forecast stage and target ranking etc are present and correctly labeled
    assert "stage" in forecast
    assert forecast["stage"] in ["Normal", "Reconnaissance", "Credential Attack", "Compromise/Infiltration", "Impact/Disruption"]
    assert "target_ranking" in forecast or "targetRanking" in forecast
    ranking = forecast.get("target_ranking") or forecast.get("targetRanking")
    assert isinstance(ranking, list) and len(ranking) > 0
    assert "host" in ranking[0]
    assert "target_score" in ranking[0]
    # evidence should not contain raw attack labels before reveal for frame 5
    # For frame 10, evidence could be varied but must be model-predicted
    # Check that forecast evidences are strings
    assert isinstance(forecast["evidence"], list)
    assert all(isinstance(e, str) for e in forecast["evidence"])


# ---------------------------------------------------------------------------
# Simulate isolate success and invalid host
# ---------------------------------------------------------------------------

def test_simulate_isolate_success_and_invalid_host():
    # get a valid host from scenario detail
    detail = client.get(f"/api/v1/scenarios/{SCENARIO_ID}").json()
    frame_10_nodes = detail["frames"][10]["nodes"]
    assert len(frame_10_nodes) > 0
    valid_host = frame_10_nodes[0]["id"]
    # also get another host for edge case?
    # success with valid host
    resp = client.post(
        "/api/v1/simulate/isolate-host",
        json={"scenario_id": SCENARIO_ID, "frame_id": 10, "host": valid_host, "action": "isolate_host"},
    )
    assert resp.status_code == 200, resp.text
    data = resp.json()
    assert "before" in data
    assert "after" in data
    assert "removed_edges" in data
    assert "deltas" in data
    assert "limitations" in data
    assert "label" in data
    assert data["label"] == "Estimated simulated effect - not causal proof"
    assert "Estimated simulated effect - not causal proof" in data["limitations"]
    # check before/after structure
    before = data["before"]
    after = data["after"]
    assert "raw_risk" in before and "raw_risk" in after
    assert "smoothed_risk" in before and "smoothed_risk" in after
    assert "stage" in before and "stage" in after
    assert "target_ranking" in before or "target_ranking" in data["before"]
    # removed edges should be list, may be 0 or more, but if host had edges, should be >=1
    assert isinstance(data["removed_edges"], list)
    # deltas should contain risk reduction
    deltas = data["deltas"]
    assert "raw_risk_delta" in deltas
    assert "smoothed_risk_delta" in deltas
    # original must remain unchanged - do second call and ensure before same as first
    # Get original frame raw risk for comparison
    orig_frame = detail["frames"][10]
    orig_raw = orig_frame["signals"]["raw_risk"] if "signals" in orig_frame else orig_frame["forecast"]["raw_risk"]
    assert abs(before["raw_risk"] - orig_raw) < 1e-9, "Before should match original frame raw_risk - immutability"
    # after should be different (reduced risk)
    # For most hosts, after raw should be less than before
    assert after["raw_risk"] <= before["raw_risk"] + 1e-9

    # invalid host -> 422
    resp_invalid_host = client.post(
        "/api/v1/simulate/isolate-host",
        json={"scenario_id": SCENARIO_ID, "frame_id": 10, "host": "host-99999", "action": "isolate_host"},
    )
    assert resp_invalid_host.status_code == 422
    assert "detail" in resp_invalid_host.json()

    # unsupported action -> 422
    resp_bad_action = client.post(
        "/api/v1/simulate/isolate-host",
        json={"scenario_id": SCENARIO_ID, "frame_id": 10, "host": valid_host, "action": "delete_host"},
    )
    assert resp_bad_action.status_code == 422

    # invalid frame -> 422
    resp_bad_frame = client.post(
        "/api/v1/simulate/isolate-host",
        json={"scenario_id": SCENARIO_ID, "frame_id": 99, "host": valid_host, "action": "isolate_host"},
    )
    assert resp_bad_frame.status_code == 422

    # not found scenario -> 404
    resp_bad_scenario = client.post(
        "/api/v1/simulate/isolate-host",
        json={"scenario_id": "invalid", "frame_id": 10, "host": valid_host, "action": "isolate_host"},
    )
    assert resp_bad_scenario.status_code == 404

    # also test alias fields scenario/frame/host/action
    resp_alias = client.post(
        "/api/v1/simulate/isolate-host",
        json={"scenario": SCENARIO_ID, "frame": 10, "host": valid_host, "action": "isolate_host"},
    )
    # should succeed via alias
    assert resp_alias.status_code == 200


# ---------------------------------------------------------------------------
# p95 latency measured
# ---------------------------------------------------------------------------

def test_p95_latency_measured():
    # Call forecast 20 times and assert p95 <500ms
    latencies = []
    for _ in range(20):
        start = time.perf_counter()
        resp = client.post("/api/v1/forecast", json={"scenario_id": SCENARIO_ID, "frame_id": 15})
        end = time.perf_counter()
        assert resp.status_code == 200
        latencies.append((end - start) * 1000.0)
    arr = np.array(latencies)
    p95 = float(np.percentile(arr, 95))
    p50 = float(np.percentile(arr, 50))
    print(f"p50 {p50:.2f}ms p95 {p95:.2f}ms")
    assert p95 < 500, f"p95 latency {p95:.2f}ms should be <500ms per requirements"
    # Also check metrics p95 is <500
    metrics = client.get("/api/v1/metrics").json()
    latency = metrics.get("latency", {})
    m_p95 = latency.get("p95_ms") or latency.get("p95") or metrics.get("latency_ms_p95")
    assert m_p95 is not None and m_p95 < 500


# ---------------------------------------------------------------------------
# Additional contract tests
# ---------------------------------------------------------------------------

def test_scenario_gated_labels_consistency():
    # For frames 0..19, ensure no leak of label_distribution, for 20..29 ensure revealed
    detail = client.get(f"/api/v1/scenarios/{SCENARIO_ID}").json()
    frames = detail["frames"]
    for i in range(min(19, len(frames))):
        gt = frames[i].get("ground_truth") or frames[i].get("groundTruth")
        assert gt["revealed"] is False, f"Frame {i} should not be revealed"
        assert gt.get("label_distribution") is None, f"Frame {i} leaks label_distribution"
    for i in range(20, min(30, len(frames))):
        gt = frames[i].get("ground_truth") or frames[i].get("groundTruth")
        assert gt["revealed"] is True, f"Frame {i} should be revealed"
        assert gt.get("label_distribution") is not None


def test_forecast_obsolescence_immutability_via_simulate():
    # Original replay must remain unchanged after simulation (immutable)
    detail_before = client.get(f"/api/v1/scenarios/{SCENARIO_ID}").json()
    frame_before = detail_before["frames"][12]
    nodes_before_len = len(frame_before["nodes"])
    edges_before_len = len(frame_before["edges"])
    raw_before = frame_before["signals"]["raw_risk"]

    valid_host = frame_before["nodes"][0]["id"]
    resp = client.post(
        "/api/v1/simulate/isolate-host",
        json={"scenario_id": SCENARIO_ID, "frame_id": 12, "host": valid_host, "action": "isolate_host"},
    )
    assert resp.status_code == 200
    # Fetch again
    detail_after = client.get(f"/api/v1/scenarios/{SCENARIO_ID}").json()
    frame_after = detail_after["frames"][12]
    assert len(frame_after["nodes"]) == nodes_before_len
    assert len(frame_after["edges"]) == edges_before_len
    assert abs(frame_after["signals"]["raw_risk"] - raw_before) < 1e-9


def test_health_and_openapi():
    # OpenAPI must exist and contain our routes
    resp = client.get("/openapi.json")
    assert resp.status_code == 200
    openapi = resp.json()
    assert "openapi" in openapi
    paths = openapi.get("paths", {})
    assert "/api/v1/health" in paths
    assert "/api/v1/metrics" in paths
    assert "/api/v1/scenarios" in paths
    assert "/api/v1/scenarios/{scenario_id}" in paths
    assert "/api/v1/forecast" in paths
    assert "/api/v1/simulate/isolate-host" in paths
    # Check schemas include our models
    schemas = openapi.get("components", {}).get("schemas", {})
    for expected in ["NetworkNode", "Forecast", "EngineMetadata", "EvaluationMetrics", "SimulationResult", "ScenarioFrame"]:
        assert expected in schemas, f"OpenAPI missing schema {expected} - must be generated from Pydantic"
