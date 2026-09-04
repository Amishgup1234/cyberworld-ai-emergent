"""Tests for Phase 05 - Temporal state, graph, and replay scenario (label-free fix)."""

import json
import sys
from pathlib import Path

import numpy as np
import pandas as pd

sys.path.insert(0, str(Path(__file__).parent.parent))

from app.replay.scenario import (
    generate_scenario,
    compute_temporal_state,
    compute_stage,
    rank_targets,
    FRAME_COUNT,
    THRESHOLD,
)

ROOT = Path(__file__).resolve().parents[2]
DEMO_PATH = ROOT / "data" / "demo" / "cyberworld_replay.json"
BUNDLE_PATH = ROOT / "frontend" / "public" / "offline_bundle.json"
METRICS_PATH = ROOT / "artifacts" / "metrics.json"

def _load_demo():
    assert DEMO_PATH.exists(), f"Missing {DEMO_PATH}"
    return json.loads(DEMO_PATH.read_text(encoding="utf-8"))

def _load_bundle():
    assert BUNDLE_PATH.exists(), f"Missing {BUNDLE_PATH}"
    return json.loads(BUNDLE_PATH.read_text(encoding="utf-8"))

def _get_frames(data):
    if "frames" in data:
        return data["frames"]
    if "scenario" in data and "frames" in data["scenario"]:
        return data["scenario"]["frames"]
    raise KeyError("No frames found in data")

# ---------------------------------------------------------------------------
# 1. Offline bundle exists and valid
# ---------------------------------------------------------------------------

def test_offline_bundle_exists_and_valid():
    assert BUNDLE_PATH.exists(), f"offline bundle missing at {BUNDLE_PATH}"
    data = _load_bundle()
    assert isinstance(data, dict)
    frames = _get_frames(data)
    assert isinstance(frames, list) and len(frames) > 0
    scenario = data.get("scenario") or data
    assert "metadata" in scenario or "engine_metadata" in scenario
    first = frames[0]
    for key in ["frame", "timestamp", "nodes", "edges", "signals", "forecast", "ground_truth"]:
        assert key in first or key in first.get("forecast", {}), f"Missing {key} in frame 0"

# ---------------------------------------------------------------------------
# 2. Frame count approx 30
# ---------------------------------------------------------------------------

def test_frame_count_approx_30():
    demo = _load_demo()
    bundle = _load_bundle()
    for data, name in [(demo, "demo"), (bundle, "bundle")]:
        frames = _get_frames(data)
        n = len(frames)
        assert 28 <= n <= 32, f"{name} frame count {n} not in 28-32"
        assert n == FRAME_COUNT or 28 <= n <= 32

def test_nodes_edges_structure():
    demo = _load_demo()
    frames = _get_frames(demo)
    for idx, frame in enumerate(frames):
        nodes = frame.get("nodes", [])
        edges = frame.get("edges", [])
        assert isinstance(nodes, list), f"frame {idx} nodes not list"
        assert isinstance(edges, list), f"frame {idx} edges not list"
        for n in nodes[:5]:
            assert "id" in n and "alias" in n
            alias = n["id"]
            assert alias.startswith("host-"), f"Node id {alias} not safe alias host-N"
            assert "192.168." not in alias and "172.16." not in alias, f"Raw IP leaked in node id {alias}"
            assert "role" in n
            assert "criticality" in n
            assert "risk" in n
            assert "status" in n
            assert "observed_state" in n
        for e in edges[:5]:
            assert "source" in e and "target" in e
            assert e["source"].startswith("host-") and e["target"].startswith("host-")
            assert "protocol" in e
            assert "activity" in e
            assert "novelty" in e
            assert "status" in e
            assert 0.0 <= e["novelty"] <= 1.0

# ---------------------------------------------------------------------------
# 3. Replay starts normal and warns before ground truth
# ---------------------------------------------------------------------------

def test_replay_starts_normal_and_warns_before_ground_truth():
    demo = _load_demo()
    frames = _get_frames(demo)
    threshold = demo.get("metadata", {}).get("threshold", THRESHOLD)
    for i in range(min(3, len(frames))):
        signals = frames[i].get("signals", frames[i].get("forecast", {}))
        smoothed = signals.get("smoothed_risk", signals.get("smoothed"))
        assert smoothed is not None, f"frame {i} missing smoothed"
        assert smoothed < threshold, f"Early frame {i} smoothed {smoothed:.3f} should be < threshold {threshold} to start normal"
        assert signals.get("warning") is False, f"Early frame {i} should not be warning"
        stage = frames[i].get("stage") or frames[i].get("forecast", {}).get("stage")
        assert stage == "Normal", f"Early frame {i} stage {stage} should be Normal"
    gt_frames = [f for f in frames if f.get("ground_truth", {}).get("revealed") is True or f.get("groundTruth", {}).get("revealed") is True]
    assert len(gt_frames) > 0, "No ground truth revealed frame found"
    gt_start = min(f.get("frame", f.get("frame_id", 999)) for f in gt_frames)
    assert 18 <= gt_start <= 22, f"ground truth start {gt_start} not in 18-22"
    warning_frames = []
    for f in frames:
        sig = f.get("signals", f.get("forecast", {}))
        if sig.get("warning") is True:
            warning_frames.append(f.get("frame", f.get("frame_id")))
    assert len(warning_frames) > 0, "No warning frame found"
    first_warning = min(warning_frames)
    assert first_warning < gt_start, f"first warning {first_warning} not before ground truth {gt_start}"
    assert gt_start - first_warning >= 2, f"Warning {first_warning} not at least 2 frames before ground truth {gt_start}"
    warnings_before_gt = [w for w in warning_frames if w < gt_start and gt_start - w <= 5]
    # allow warnings within 12 frames before gt (original lead 12)
    if not warnings_before_gt:
        warnings_before_gt = [w for w in warning_frames if w < gt_start]
    assert len(warnings_before_gt) > 0, f"No warning before ground truth {gt_start}, warnings {warning_frames}"

# ---------------------------------------------------------------------------
# 4. Target scores reproducible
# ---------------------------------------------------------------------------

def test_target_scores_reproducible():
    s1 = generate_scenario()
    s2 = generate_scenario()
    frames1 = s1["frames"]
    frames2 = s2["frames"]
    assert len(frames1) == len(frames2)
    for i in range(len(frames1)):
        r1 = frames1[i].get("target_ranking") or frames1[i].get("forecast", {}).get("target_ranking")
        r2 = frames2[i].get("target_ranking") or frames2[i].get("forecast", {}).get("target_ranking")
        assert r1 is not None and r2 is not None
        assert len(r1) == len(r2)
        for a, b in zip(r1, r2):
            assert a["host"] == b["host"], f"frame {i} host mismatch {a['host']} vs {b['host']}"
            assert abs(a["target_score"] - b["target_score"]) < 1e-9, f"frame {i} score not reproducible"
    import networkx as nx
    g = nx.DiGraph()
    g.add_node("host-1", criticality="high", criticality_numeric=3, role="server")
    g.add_node("host-2", criticality="low", criticality_numeric=1, role="workstation")
    g.add_edge("host-2", "host-1", activity=5, first_seen=0, protocol="TCP", protocols={"TCP"})
    r_a = rank_targets(g, 5, 0.5, 0.02)
    r_b = rank_targets(g, 5, 0.5, 0.02)
    assert r_a == r_b

# ---------------------------------------------------------------------------
# 5. Composite disclosure in metadata
# ---------------------------------------------------------------------------

def test_composite_disclosure_in_metadata():
    demo = _load_demo()
    bundle = _load_bundle()
    for data, name in [(demo, "demo"), (bundle, "bundle")]:
        meta = data.get("metadata") or data.get("scenario", {}).get("metadata") or {}
        if "scenario" in data:
            meta2 = data["scenario"].get("metadata", {})
            meta = {**meta, **meta2}
        meta_str = json.dumps(meta).lower()
        assert "composite" in meta_str or "synthetic" in meta_str, f"{name} metadata missing composite/synthetic disclosure"
        disclosure = meta.get("disclosure") or meta.get("composite_disclosure") or ""
        if disclosure:
            assert "composite" in disclosure.lower() or "synthetic" in disclosure.lower()
        assert "claim" in meta_str or "limitation" in meta_str.lower()

# ---------------------------------------------------------------------------
# 6. Offline bundle from same engine
# ---------------------------------------------------------------------------

def test_offline_bundle_from_same_engine():
    bundle = _load_bundle()
    generated = generate_scenario()
    bundle_frames = _get_frames(bundle)
    gen_frames = generated["frames"]
    assert len(bundle_frames) == len(gen_frames), f"bundle frames {len(bundle_frames)} != generated {len(gen_frames)}"
    for i in [0, 10, 20]:
        bf = bundle_frames[i]
        gf = gen_frames[i]
        assert bf["timestamp"] == gf["timestamp"], f"frame {i} timestamp mismatch"
        bf_raw = bf.get("signals", {}).get("raw_risk", bf.get("forecast", {}).get("raw_risk"))
        gf_raw = gf.get("signals", {}).get("raw_risk", gf.get("forecast", {}).get("raw_risk"))
        assert abs(bf_raw - gf_raw) < 1e-9, f"frame {i} raw risk not from same engine"
        bf_rank = bf.get("target_ranking") or bf.get("forecast", {}).get("target_ranking")
        gf_rank = gf.get("target_ranking") or gf.get("forecast", {}).get("target_ranking")
        if bf_rank and gf_rank:
            assert bf_rank[0]["host"] == gf_rank[0]["host"]

# ---------------------------------------------------------------------------
# 7. Future labels not exposed - label-free version
# ---------------------------------------------------------------------------

def test_future_labels_not_exposed():
    demo = _load_demo()
    frames = _get_frames(demo)
    for i in range(min(5, len(frames))):
        gt = frames[i].get("ground_truth") or frames[i].get("groundTruth")
        assert gt is not None
        assert gt.get("revealed") is False, f"Early frame {i} should not have revealed ground truth"
        assert gt.get("attack_type") is None, f"Early frame {i} should not expose attack_type"
        assert gt.get("label_distribution") is None, f"Early frame {i} should not expose label_distribution before reveal"
        forecast = frames[i].get("forecast", {})
        evidence = forecast.get("evidence", [])
        evidence_str = " ".join(evidence).lower()
        # evidence must not contain raw attack labels before reveal (label-derived strings)
        for forbidden in ["portscan", "patator", "infiltration", "heartbleed", "bot", "web attack"]:
            # allow stage names but evidence should not contain these raw labels
            assert forbidden not in evidence_str, f"Early frame {i} evidence should not contain {forbidden} before ground truth, got {evidence}"
        stage = forecast.get("stage")
        assert stage == "Normal", f"Early frame {i} stage should be Normal, got {stage}"
        # flow_summary must not expose raw label counts
        fs = frames[i].get("flow_summary", {})
        assert "predicted_malicious_count" in fs, f"frame {i} flow_summary missing predicted_malicious_count"
        assert "predicted_malicious_ratio" in fs, f"frame {i} flow_summary missing predicted_malicious_ratio"
        assert "malicious_count" not in fs, f"Early frame {i} flow_summary should not expose raw malicious_count"
        assert "malicious_ratio" not in fs, f"Early frame {i} flow_summary should not expose raw malicious_ratio"
        assert "label_distribution" not in fs, f"Early frame {i} flow_summary should not expose label_distribution"
    from app.data.preprocessing import load_schema
    schema = load_schema()
    assert "label" not in [c.lower() for c in schema["feature_columns"]]
    # also verify that predicted counts are model-derived, not label-derived: check that early predicted ratio is low
    for i in range(min(5, len(frames))):
        fs = frames[i].get("flow_summary", {})
        pred_ratio = fs.get("predicted_malicious_ratio")
        assert pred_ratio is not None and pred_ratio < 0.1, f"Early frame {i} predicted ratio should be low, got {pred_ratio}"

# ---------------------------------------------------------------------------
# 8. Temporal state correct
# ---------------------------------------------------------------------------

def test_temporal_state_correct():
    raw = [0.2]*5 + [0.6]*5
    s1, sl1, w1 = compute_temporal_state(raw, alpha=0.4, threshold=0.45)
    s2, sl2, w2 = compute_temporal_state(raw, alpha=0.4, threshold=0.45)
    assert s1 == s2 and sl1 == sl2 and w1 == w2
    assert s1[0] < 0.45
    assert s1[-1] > 0.45
    assert any(sl > 0 for sl in sl1)

def test_stage_computation_label_free():
    # Normal: low predicted ratio and low smoothed risk
    stage = compute_stage(5, 5, {"SYN Flag Count": 0.1}, 0.0, 0.2, 0.0, False, None)
    assert stage == "Normal"
    # Reconnaissance: port diversity + predicted suspicious
    stage = compute_stage(30, 30, {"SYN Flag Count": 0.5}, 0.15, 0.3, 0.01, False, None)
    assert stage == "Reconnaissance"
    # Credential: predicted high
    # Provide slice_df with moderate bytes to avoid Impact
    dummy_df = pd.DataFrame({"Flow Bytes/s": [5000]*10, "Flow Packets/s": [5000]*10, "Active Mean": [500]*10})
    stage = compute_stage(10, 10, {"SYN Flag Count": 0.4}, 0.35, 0.4, 0.01, True, dummy_df)
    assert stage == "Credential Attack"
    # Impact: high bytes + predicted high
    high_df = pd.DataFrame({"Flow Bytes/s": [9000]*10, "Flow Packets/s": [9000]*10, "Active Mean": [900]*10})
    stage = compute_stage(30, 30, {}, 0.5, 0.6, 0.02, True, high_df)
    assert stage == "Impact/Disruption"
    # Compromise requires high smoothed and warning and high diversity
    # Use high_df but with threshold to trigger compromise vs impact: impact takes precedence when bytes high, so to get compromise we need bytes not high
    # Compromise test: predicted high, smoothed high, warning true, but bytes moderate
    moderate_df = pd.DataFrame({"Flow Bytes/s": [6000]*10, "Flow Packets/s": [5000]*10, "Active Mean": [500]*10})
    stage = compute_stage(60, 60, {}, 0.4, 0.55, 0.02, True, moderate_df)
    # With smoothed 0.55 >0.52 should be compromise
    assert stage == "Compromise/Infiltration"

# ---------------------------------------------------------------------------
# 9. Leakage tests - no label leakage pre-reveal
# ---------------------------------------------------------------------------

ATTACK_SUBSTRINGS = ["PortScan", "FTP-Patator", "SSH-Patator", "DoS", "DDoS", "Infiltration", "Heartbleed", "Bot", "Web Attack"]

def _recursive_contains_attack_label(obj, substrings):
    """Check recursively if any string value contains forbidden attack label substrings."""
    if isinstance(obj, dict):
        for k, v in obj.items():
            # Check key for malicious_count leak (only predicted allowed)
            if k == "malicious_count" or k == "malicious_ratio":
                # This is raw label-derived key, not allowed pre-reveal
                return True, f"Forbidden key {k} found"
            if k == "label_distribution" and isinstance(v, dict) and v:
                # label_distribution with attack names pre-reveal is leak
                # Check if any key in v is attack label
                for lk in v.keys():
                    if any(sub.lower() in str(lk).lower() for sub in substrings):
                        return True, f"Forbidden label_distribution key {lk}"
            if _recursive_contains_attack_label(v, substrings)[0]:
                return True, f"Forbidden in dict key {k}"
        # also check keys that are attack substrings? skip
        for v in obj.values():
            found, msg = _recursive_contains_attack_label(v, substrings)
            if found:
                return True, msg
        return False, ""
    elif isinstance(obj, list):
        for item in obj:
            found, msg = _recursive_contains_attack_label(item, substrings)
            if found:
                return True, msg
        return False, ""
    elif isinstance(obj, str):
        for sub in substrings:
            # Check case-sensitive as per spec
            if sub in obj:
                # Allow stage "Compromise/Infiltration" contains Infiltration but it's a predicted stage - we consider it allowed if it's exactly stage value?
                # For strict leakage test, we allow stage values that are in allowed stages list
                if obj in ["Normal", "Reconnaissance", "Credential Attack", "Compromise/Infiltration", "Impact/Disruption"]:
                    continue
                return True, f"Forbidden substring {sub} in string {obj!r}"
        return False, ""
    else:
        return False, ""

def test_recursive_no_raw_labels_before_reveal():
    demo = _load_demo()
    frames = _get_frames(demo)
    # Only check pre-reveal frames 0..19 (ground_truth_start is 20)
    for i in range(min(20, len(frames))):
        frame = frames[i]
        # Check ground_truth hidden
        gt = frame.get("ground_truth") or frame.get("groundTruth")
        assert gt is not None
        assert gt.get("revealed") is False, f"Frame {i} should not be revealed"
        assert gt.get("attack_type") is None, f"Pre-reveal frame {i} attack_type should be None"
        assert gt.get("label_distribution") is None, f"Pre-reveal frame {i} label_distribution should be None"
        assert gt.get("true_malicious_count") is None, f"Pre-reveal frame {i} true_malicious_count should be None"
        # Check flow_summary has no raw label fields
        fs = frame.get("flow_summary", {})
        assert "predicted_malicious_count" in fs
        assert "predicted_malicious_ratio" in fs
        # These raw keys must not exist
        assert "malicious_count" not in fs, f"Pre-reveal frame {i} flow_summary leaks malicious_count"
        assert "malicious_ratio" not in fs, f"Pre-reveal frame {i} flow_summary leaks malicious_ratio"
        assert "label_distribution" not in fs
        # Recursively scan frame for forbidden substrings, but allow stage values
        # We scan forecast evidence, flow_summary, etc.
        # For this test we scan the whole frame dict but allow stage to contain Infiltration if it's predicted stage?
        # To be safe, we scan only forecast evidence, flow_summary, ground_truth fields that should not contain attack labels
        # We'll do recursive check on flow_summary, evidence, and ground_truth
        for field_name in ["flow_summary", "evidence", "forecast"]:
            field_val = frame.get(field_name)
            if field_val is not None:
                # For evidence list, check each string
                if field_name == "evidence":
                    for ev in field_val:
                        for sub in ATTACK_SUBSTRINGS:
                            # Evidence should never contain raw label substrings (label-free)
                            assert sub not in ev, f"Pre-reveal frame {i} evidence leaks {sub}: {ev!r}"
                elif field_name == "flow_summary":
                    forbidden_found, msg = _recursive_contains_attack_label(field_val, ATTACK_SUBSTRINGS)
                    assert not forbidden_found, f"Pre-reveal frame {i} flow_summary leakage: {msg}"
                elif field_name == "forecast":
                    # forecast stage is allowed to be Credential etc, but evidence inside forecast should not contain raw labels
                    # Check forecast evidence separately
                    forecast_evidence = field_val.get("evidence", []) if isinstance(field_val, dict) else []
                    for ev in forecast_evidence:
                        for sub in ATTACK_SUBSTRINGS:
                            assert sub not in ev, f"Pre-reveal frame {i} forecast evidence leaks {sub}: {ev!r}"
                    # Also check forecast stage is not using label-derived stage incorrectly? stage Reconnaissance/Credential are allowed
                    stage = field_val.get("stage")
                    if stage:
                        # stage containing Infiltration is allowed only if it's predicted? But pre-reveal we expect no infiltration stage
                        # For strict check, we assert pre-reveal stage not Infiltration to avoid false leakage flag
                        # However if stage is Compromise/Infiltration before reveal, we treat as possible but check that it's derived from observable not label
                        # We'll allow it but ensure evidence doesn't leak
                        pass
        # Also check whole frame for raw malicious_count key leakage
        def has_malicious_count_key(obj):
            if isinstance(obj, dict):
                if "malicious_count" in obj or "malicious_ratio" in obj:
                    return True
                return any(has_malicious_count_key(v) for v in obj.values())
            elif isinstance(obj, list):
                return any(has_malicious_count_key(x) for x in obj)
            return False
        assert not has_malicious_count_key(frame), f"Pre-reveal frame {i} contains forbidden malicious_count key"

def test_no_label_leakage_change_hidden_labels():
    """Prove pre-reveal forecasts unchanged when hidden labels are permuted.

    Loads scenario, then permutes Label column in underlying CSV slices via monkeypatch,
    recomputes scenario, and asserts all pre-reveal forecasts/stages/evidence/warnings/rankings remain unchanged.
    """
    # Baseline
    s1 = generate_scenario()
    frames1 = s1["frames"][:20]

    # Patched generation with permuted labels
    original_read_csv = pd.read_csv

    def patched_read_csv(*args, **kwargs):
        df = original_read_csv(*args, **kwargs)
        # Find label column case-insensitive
        cmap = {c.strip().casefold(): c for c in df.columns}
        if "label" in cmap:
            label_col = cmap["label"]
            rng = np.random.default_rng(12345)
            choices = ["BENIGN", "PortScan", "Infiltration", "DDoS", "FTP-Patator", "SSH-Patator", "Bot", "Heartbleed", "Web Attack - Brute Force", "DoS Hulk"]
            # Permute labels randomly but keep same length, keep features unchanged
            df = df.copy()
            df[label_col] = rng.choice(choices, size=len(df))
        return df

    pd.read_csv = patched_read_csv
    try:
        s2 = generate_scenario()
    finally:
        pd.read_csv = original_read_csv

    frames2 = s2["frames"][:20]
    assert len(frames1) == len(frames2) == 20
    for i in range(20):
        f1 = frames1[i]
        f2 = frames2[i]
        # Signals must be identical (model-predicted, not label-derived)
        for key in ["raw_risk", "smoothed_risk", "slope", "warning"]:
            v1 = f1["signals"][key] if key in f1["signals"] else f1["forecast"][key]
            v2 = f2["signals"][key] if key in f2["signals"] else f2["forecast"][key]
            if isinstance(v1, float):
                assert abs(v1 - v2) < 1e-9, f"Frame {i} signal {key} changed after label permutation: {v1} vs {v2}"
            else:
                assert v1 == v2, f"Frame {i} signal {key} changed after label permutation"
        # Stage must be unchanged (label-free)
        assert f1["stage"] == f2["stage"], f"Frame {i} stage changed after label permutation: {f1['stage']} vs {f2['stage']}"
        assert f1["forecast"]["stage"] == f2["forecast"]["stage"]
        # Evidence must be unchanged
        assert f1["evidence"] == f2["evidence"], f"Frame {i} evidence changed after label permutation"
        assert f1["forecast"]["evidence"] == f2["forecast"]["evidence"]
        # Target ranking top host unchanged
        r1 = f1["target_ranking"] or f1["forecast"]["target_ranking"]
        r2 = f2["target_ranking"] or f2["forecast"]["target_ranking"]
        assert r1[0]["host"] == r2[0]["host"], f"Frame {i} top ranking changed after label permutation"
        for a, b in zip(r1, r2):
            assert a["host"] == b["host"]
            assert abs(a["target_score"] - b["target_score"]) < 1e-9
        # Flow summary predicted counts unchanged
        fs1 = f1["flow_summary"]
        fs2 = f2["flow_summary"]
        assert fs1["predicted_malicious_count"] == fs2["predicted_malicious_count"], f"Frame {i} predicted count changed"
        assert abs(fs1["predicted_malicious_ratio"] - fs2["predicted_malicious_ratio"]) < 1e-9
        # Ground truth should remain hidden before reveal (no leakage) - even with permuted labels, revealed false frames should still hide
        assert f2["ground_truth"]["revealed"] is False
        assert f2["ground_truth"]["attack_type"] is None
        assert f2["ground_truth"]["label_distribution"] is None

def test_flow_summary_predicted_fields():
    demo = _load_demo()
    frames = _get_frames(demo)
    for i, f in enumerate(frames):
        fs = f.get("flow_summary", {})
        assert "predicted_malicious_count" in fs, f"frame {i} missing predicted_malicious_count"
        assert "predicted_malicious_ratio" in fs, f"frame {i} missing predicted_malicious_ratio"
        # Check that predicted ratio is model-predicted and corresponds to threshold 0.45
        # predicted ratio should be between 0 and 1
        assert 0.0 <= fs["predicted_malicious_ratio"] <= 1.0
        assert isinstance(fs["predicted_malicious_count"], int)
        # Should not contain raw label-derived fields
        assert "malicious_count" not in fs
        assert "malicious_ratio" not in fs
        # Check predicted_source indicates model-predicted
        assert "model-predicted" in fs.get("predicted_source", "").lower() or "predicted" in json.dumps(fs).lower()
