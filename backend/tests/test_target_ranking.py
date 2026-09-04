"""Tests for Phase 05 - Target ranking via NetworkX."""

import sys
from pathlib import Path

import networkx as nx
sys.path.insert(0, str(Path(__file__).parent.parent))

from app.replay.scenario import rank_targets, generate_scenario

def test_target_ranking_uses_networkx_and_is_deterministic():
    g = nx.DiGraph()
    # Add nodes with criticality
    g.add_node("host-1", criticality="high", criticality_numeric=3, role="database")
    g.add_node("host-2", criticality="low", criticality_numeric=1, role="workstation")
    g.add_node("host-3", criticality="medium", criticality_numeric=2, role="server")
    # Edges
    g.add_edge("host-2", "host-1", activity=10, first_seen=0, protocol="TCP", protocols={"TCP"})
    g.add_edge("host-3", "host-1", activity=5, first_seen=1, protocol="TCP", protocols={"TCP"})
    g.add_edge("host-2", "host-3", activity=2, first_seen=2, protocol="UDP", protocols={"UDP"})

    # Rank at frame 5 with risk
    r1 = rank_targets(g, 5, 0.6, 0.05)
    r2 = rank_targets(g, 5, 0.6, 0.05)
    assert r1 == r2, "Ranking not deterministic"
    # Check host-1 should be top due to high incoming activity and high criticality
    assert r1[0]["host"] == "host-1", f"Expected host-1 top, got {r1[0]['host']}"
    assert "target_score" in r1[0]
    assert "incoming_activity" in r1[0]
    assert "edge_novelty" in r1[0]
    assert "recent_risk_trend" in r1[0]
    assert "asset_criticality" in r1[0]

def test_target_score_formula():
    g = nx.DiGraph()
    g.add_node("host-1", criticality="high", criticality_numeric=3, role="database")
    g.add_node("host-2", criticality="low", criticality_numeric=1, role="workstation")
    g.add_edge("host-2", "host-1", activity=10, first_seen=0, protocol="TCP", protocols={"TCP"})
    # Different risk trends should affect score
    r_low = rank_targets(g, 0, 0.2, 0.01)
    r_high = rank_targets(g, 0, 0.8, 0.05)
    # higher risk should increase target_score for host-1
    score_low = next(x for x in r_low if x["host"] == "host-1")["target_score"]
    score_high = next(x for x in r_high if x["host"] == "host-1")["target_score"]
    assert score_high > score_low, "Higher risk trend should increase target score"

def test_ranking_reproducible_across_scenario():
    s1 = generate_scenario()
    s2 = generate_scenario()
    for f1, f2 in zip(s1["frames"], s2["frames"]):
        r1 = f1["target_ranking"]
        r2 = f2["target_ranking"]
        assert len(r1) == len(r2)
        for a, b in zip(r1, r2):
            assert a["host"] == b["host"]
            assert abs(a["target_score"] - b["target_score"]) < 1e-9

def test_networkx_graph_ranking_not_learned():
    # Ensure ranking is graph-based, not learned classifier
    import inspect
    src = inspect.getsource(rank_targets)
    # Should mention networkx or graph
    assert "DiGraph" in src or "networkx" in src.lower() or "graph" in src.lower()
    # Should use formula components
    assert "incoming" in src.lower() or "activity" in src.lower()
    assert "novelty" in src.lower()
    assert "criticality" in src.lower()
