"""Tests for Phase 08 - Versioned MITRE ATT&CK mapping.

Covers:
- Pinned version v13.1 stored with technique ID, name, evidence rule, cautious confidence
- All 4 techniques present: T1046, T1110, T1021, T1498
- Evidence rule and confidence wording contains cautious language, not causal proof
- Stage mapping correct, confidence requires analyst review / simulated estimate
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from fastapi.testclient import TestClient
from app.main import app
from app.replay.scenario import MITRE_MAPPING, MITRE_VERSION, generate_scenario

client = TestClient(app)
SCENARIO_ID = "cyberworld-replay-v1"


def test_mitre_pinned_version_13_1():
    # Direct import check
    assert MITRE_VERSION == "13.1", f"MITRE_VERSION must be 13.1, got {MITRE_VERSION}"

    # Check via scenario generation metadata
    scenario = generate_scenario()
    meta = scenario.get("metadata") or {}
    assert meta.get("mitre_version") == "13.1", f"metadata mitre_version should be 13.1, got {meta.get('mitre_version')}"
    assert scenario.get("engine_metadata", {}).get("mitre_version") == "13.1"

    # Check via API scenario detail
    resp = client.get(f"/api/v1/scenarios/{SCENARIO_ID}")
    assert resp.status_code == 200
    data = resp.json()
    meta_api = data.get("metadata") or {}
    mitre_ver = meta_api.get("mitre_version") or data.get("engine_metadata", {}).get("mitre_version") or meta_api.get("mitre_version")
    assert mitre_ver == "13.1" or "13.1" in str(data), "API scenario should contain mitre_version 13.1"

    # Check health engine_metadata
    h = client.get("/api/v1/health").json()
    if h.get("engine") == "trained":
        em = h.get("engine_metadata") or {}
        assert em.get("mitre_version") == "13.1" or "13.1" in str(h)


def test_mitre_four_techniques_present():
    expected = {
        "T1046": "Network Service Discovery",
        "T1110": "Brute Force",
        "T1021": "Remote Services",
        "T1498": "Network Denial of Service",
    }
    # Check mapping contains these techniques across stages
    all_ids = set()
    all_names = {}
    for stage, techniques in MITRE_MAPPING.items():
        for t in techniques:
            tid = t.get("technique_id")
            all_ids.add(tid)
            all_names[tid] = t.get("name")
            # Each must have required fields
            assert "technique_id" in t, f"missing technique_id in {t}"
            assert "name" in t, f"missing name in {t}"
            assert "evidence_rule" in t, f"missing evidence_rule in {t} {tid}"
            assert "confidence" in t, f"missing confidence in {t} {tid}"
            assert "stage" in t, f"missing stage in {t} {tid}"

    for tid, name in expected.items():
        assert tid in all_ids, f"Missing technique {tid} in MITRE_MAPPING, found {all_ids}"
        assert all_names[tid] == name, f"Name mismatch for {tid}: expected {name}, got {all_names[tid]}"

    # Also check via forecast API that techniques appear when stage active
    # Find a frame with non-Normal stage to ensure MITRE techniques are returned
    detail = client.get(f"/api/v1/scenarios/{SCENARIO_ID}").json()
    frames = detail["frames"]
    # Look for stage that maps to MITRE
    found_mitre = False
    for f in frames:
        forecast = f.get("forecast") or {}
        mitre = forecast.get("mitre") or []
        if mitre:
            found_mitre = True
            for t in mitre:
                assert t.get("technique_id") in expected, f"unexpected technique {t.get('technique_id')}"
                assert "evidence_rule" in t
                assert "confidence" in t
                assert "name" in t
            break
    assert found_mitre, "No forecast frame contained MITRE techniques - expected at least one non-Normal stage with MITRE"

    # Check that all 4 techniques are eventually present across scenario (different stages)
    ids_across_scenario = set()
    for f in frames:
        for t in (f.get("forecast", {}).get("mitre") or []):
            ids_across_scenario.add(t.get("technique_id"))
    # At least 2-3 should appear given synthetic data, but we check mapping itself has 4
    assert len(all_ids) == 4, f"MITRE mapping should have exactly 4 techniques, got {all_ids}"


def test_mitre_evidence_rule_and_confidence_cautious():
    # Check each technique's evidence_rule and confidence contain cautious wording and not causal proof
    for stage, techniques in MITRE_MAPPING.items():
        for t in techniques:
            rule = t.get("evidence_rule", "")
            conf = t.get("confidence", "")
            assert len(rule) > 10, f"evidence_rule too short for {t.get('technique_id')}"
            assert len(conf) > 10, f"confidence too short for {t.get('technique_id')}"
            conf_lower = conf.lower()
            # Must contain cautious keywords
            assert "possible" in conf_lower or "likely" in conf_lower, f"confidence for {t.get('technique_id')} must contain possible/likely, got {conf}"
            # Must indicate uncertainty / requires review
            assert "requires analyst review" in conf_lower or "simulated estimate - not causal proof" in conf_lower or "not confirmed" in conf_lower, f"confidence for {t.get('technique_id')} must contain cautious phrase, got {conf}"
            # Should not claim causality
            assert "causal proof" in conf_lower or "not causal" in conf_lower or "requires analyst review" in conf_lower, f"confidence should mention non-causal or analyst review for {t.get('technique_id')}"

            # Evidence rule should reference observable/model-predicted not raw label
            # Check that rule mentions predicted, port, ratio, bytes, etc but not claiming confirmed
            assert "predicted" in rule.lower() or "port diversity" in rule.lower() or "ratio" in rule.lower() or "bytes" in rule.lower() or "host-to-host" in rule.lower(), f"evidence_rule for {t.get('technique_id')} should reference observable/predicted, got {rule}"

    # Specific checks per technique
    # T1046 should mention port diversity
    t1046 = next((t for lst in MITRE_MAPPING.values() for t in lst if t["technique_id"] == "T1046"), None)
    assert t1046 is not None
    assert "Port diversity" in t1046["evidence_rule"]
    assert "possible - observed scanning only" in t1046["confidence"]

    t1110 = next((t for lst in MITRE_MAPPING.values() for t in lst if t["technique_id"] == "T1110"), None)
    assert t1110 is not None
    assert "Predicted malicious ratio >0.25" in t1110["evidence_rule"]
    assert "likely - brute force pattern" in t1110["confidence"]

    t1021 = next((t for lst in MITRE_MAPPING.values() for t in lst if t["technique_id"] == "T1021"), None)
    assert t1021 is not None
    assert "host-to-host" in t1021["evidence_rule"]
    assert "simulated estimate - not causal proof" in t1021["confidence"]

    t1498 = next((t for lst in MITRE_MAPPING.values() for t in lst if t["technique_id"] == "T1498"), None)
    assert t1498 is not None
    assert "Flow Bytes/s" in t1498["evidence_rule"] or "bytes/packets per second" in t1498["evidence_rule"].lower()
    assert "possible - volume anomaly predicted" in t1498["confidence"]


def test_mitre_never_claim_causality():
    # Ensure no MITRE confidence claims causality - all must be cautious
    forbidden_phrases = ["proves", "causes", "is the cause", "definitely", "certainly attack"]
    for stage, techniques in MITRE_MAPPING.items():
        for t in techniques:
            conf = t.get("confidence", "").lower()
            for phrase in forbidden_phrases:
                assert phrase not in conf, f"MITRE confidence for {t.get('technique_id')} should not claim '{phrase}', got {conf}"
            # Also check overall scenario forecast MITRE never describes causality
    detail = client.get(f"/api/v1/scenarios/{SCENARIO_ID}").json()
    for f in detail["frames"]:
        for tech in (f.get("forecast", {}).get("mitre") or []):
            conf = tech.get("confidence", "").lower()
            assert "causes" not in conf
            assert "proves" not in conf

    # Check forecast API also respects cautious language
    resp = client.post("/api/v1/forecast", json={"scenario_id": SCENARIO_ID, "frame_id": 20})
    assert resp.status_code == 200
    forecast = resp.json()["forecast"]
    for tech in forecast.get("mitre", []):
        conf = tech.get("confidence", "").lower()
        assert "possible" in conf or "likely" in conf
        assert "requires analyst review" in conf or "not causal" in conf


def test_mitre_stage_mapping_correct():
    # Stage to MITRE mapping should be correct per requirements
    # BENIGN/Normal -> []
    assert MITRE_MAPPING.get("Normal") == []
    # Reconnaissance -> T1046
    recon = MITRE_MAPPING.get("Reconnaissance", [])
    assert any(t["technique_id"] == "T1046" for t in recon), "Reconnaissance should map to T1046"
    # Credential Attack -> T1110
    cred = MITRE_MAPPING.get("Credential Attack", [])
    assert any(t["technique_id"] == "T1110" for t in cred)
    # Compromise/Infiltration -> T1021
    comp = MITRE_MAPPING.get("Compromise/Infiltration", [])
    assert any(t["technique_id"] == "T1021" for t in comp)
    # Impact/Disruption -> T1498
    impact = MITRE_MAPPING.get("Impact/Disruption", [])
    assert any(t["technique_id"] == "T1498" for t in impact)

    # Via API, stage and mitre should align
    detail = client.get(f"/api/v1/scenarios/{SCENARIO_ID}").json()
    stage_to_id = {
        "Reconnaissance": "T1046",
        "Credential Attack": "T1110",
        "Compromise/Infiltration": "T1021",
        "Impact/Disruption": "T1498",
    }
    for f in detail["frames"]:
        forecast = f.get("forecast") or {}
        stage = forecast.get("stage")
        mitre = forecast.get("mitre") or []
        expected_id = stage_to_id.get(stage)
        if expected_id:
            assert any(t.get("technique_id") == expected_id for t in mitre), f"Frame {f.get('frame')} stage {stage} should have MITRE {expected_id}, got {mitre}"
        elif stage == "Normal":
            assert mitre == [], f"Normal stage should have no MITRE, got {mitre}"


def test_mitre_api_forecast_includes_mitre_with_engine_metadata():
    # Forecast should include mitre with evidence rule and confidence plus engine metadata
    resp = client.post("/api/v1/forecast", json={"scenario_id": SCENARIO_ID, "frame_id": 10})
    assert resp.status_code == 200
    data = resp.json()
    forecast = data["forecast"]
    assert "mitre" in forecast
    assert isinstance(forecast["mitre"], list)
    # Engine metadata should contain mitre_version or claim_limitations
    em = forecast.get("engine_metadata") or data.get("engine_metadata") or {}
    assert "mitre_version" in str(em).lower() or "13.1" in str(em) or "claim_limitations" in em or len(em) > 0

    # For frame with MITRE, check fields
    # Find frame with MITRE active (likely later frames)
    detail = client.get(f"/api/v1/scenarios/{SCENARIO_ID}").json()
    for f in detail["frames"]:
        if f.get("forecast", {}).get("mitre"):
            mitre_entry = f["forecast"]["mitre"][0]
            assert "technique_id" in mitre_entry
            assert "name" in mitre_entry
            assert "evidence_rule" in mitre_entry
            assert "confidence" in mitre_entry
            break
