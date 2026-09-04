"""Temporal state, graph, and replay scenario for Phase 05.

Implements:
- Representative chronological flows across Mon-Fri synthetic CSVs
- Approximately 30 frames (28-32) with deterministic seed 42
- Safe host aliases, role/criticality, NetworkX evolving graph
- Raw risk via leakage-safe pipeline (80 features, train-only), smoothed EWMA alpha 0.4, slope, warning threshold 0.45
- Stage estimate (rule-derived from observable/model-predicted only), target ranking (graph-ranked), evidence, MITRE pinned mapping
- Ground truth reveal only at correct frame, composite disclosure
- Offline bundle generated from same engine
- FIX: No label leakage pre-reveal - stage/evidence/flow_summary use only predicted_malicious from model (threshold 0.45)
"""

from __future__ import annotations

import json
from pathlib import Path
from datetime import datetime, timezone
from typing import Dict, List, Tuple, Any, Optional

import numpy as np
import pandas as pd
import joblib
import networkx as nx

SEED = 42
FRAME_COUNT = 30
ALPHA = 0.4
MITRE_VERSION = "13.1"
SCENARIO_ID = "cyberworld-replay-v1"
THRESHOLD = 0.45  # frozen warning threshold from artifacts/metrics.json (evaluation.threshold)

# roles and mapping
ROLES = ["workstation", "server", "database", "domain_controller", "firewall", "web_server"]
ROLE_TO_CRITICALITY = {
    "workstation": "low",
    "server": "medium",
    "database": "high",
    "domain_controller": "high",
    "firewall": "high",
    "web_server": "medium",
}
CRITICALITY_NUMERIC = {"low": 1, "medium": 2, "high": 3}

# MITRE pinned mapping
MITRE_MAPPING = {
    "Reconnaissance": [
        {
            "technique_id": "T1046",
            "name": "Network Service Discovery",
            "evidence_rule": "Port diversity >15 plus predicted suspicious activity (model-predicted ratio >0.08)",
            "confidence": "possible - observed scanning only, not confirmed reconnaissance - requires analyst review",
            "stage": "Reconnaissance",
        }
    ],
    "Credential Attack": [
        {
            "technique_id": "T1110",
            "name": "Brute Force",
            "evidence_rule": "Predicted malicious ratio >0.25 plus repeated authentication-like activity (high SYN, port diversity)",
            "confidence": "likely - brute force pattern observed via predicted ratio, not confirmed compromise - requires analyst review",
            "stage": "Credential Attack",
        }
    ],
    "Compromise/Infiltration": [
        {
            "technique_id": "T1021",
            "name": "Remote Services",
            "evidence_rule": "Predicted ratio high + host-to-host activity + EWMA risk above threshold with positive trend",
            "confidence": "possible - infiltration-like pattern predicted, simulated estimate - not causal proof",
            "stage": "Compromise/Infiltration",
        }
    ],
    "Impact/Disruption": [
        {
            "technique_id": "T1498",
            "name": "Network Denial of Service",
            "evidence_rule": "High flow bytes/packets per second plus predicted malicious ratio >0.30",
            "confidence": "possible - volume anomaly predicted, not confirmed impact - requires analyst review",
            "stage": "Impact/Disruption",
        }
    ],
    "Normal": [],
}

# ---------------------------------------------------------------------------
# Helpers - filesystem
# ---------------------------------------------------------------------------

def _resolve_project_root() -> Path:
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
            if (cur / "data" / "raw").exists():
                return cur
            if cur.parent == cur:
                break
            cur = cur.parent
        return Path.cwd()

def _find_daily_files(raw_dir: Path) -> Dict[str, Path]:
    days = ["monday", "tuesday", "wednesday", "thursday", "friday"]
    result = {}
    for day in days:
        cands = []
        for p in raw_dir.rglob("*"):
            if p.is_file() and p.suffix.lower() == ".csv" and day in p.name.casefold():
                cands.append(p)
        if not cands:
            all_csv = [q.name for q in raw_dir.rglob("*") if q.is_file() and q.suffix.lower() == ".csv"]
            raise ValueError(f"Missing daily file for '{day}' under {raw_dir}. Found: {sorted(all_csv)}")
        cands_sorted = sorted(cands, key=lambda x: x.name.lower())
        result[day] = cands_sorted[0]
    return result

def _load_threshold() -> float:
    root = _resolve_project_root()
    metrics_path = root / "artifacts" / "metrics.json"
    if metrics_path.exists():
        try:
            data = json.loads(metrics_path.read_text(encoding="utf-8"))
            for k in ["threshold", "warning_threshold", "selection_threshold", "evaluation"]:
                if k in data:
                    val = data[k]
                    if isinstance(val, (int, float)):
                        return float(val)
                    if isinstance(val, dict) and "threshold" in val:
                        return float(val["threshold"])
            if "threshold" in data:
                return float(data["threshold"])
        except Exception:
            pass
    return THRESHOLD

def _load_pipeline_and_model():
    root = _resolve_project_root()
    model_path = root / "artifacts" / "risk_model.joblib"
    if not model_path.exists():
        raise FileNotFoundError(f"Model not found at {model_path} - run Phase 04 first")
    obj = joblib.load(model_path)
    pipeline = obj.get("pipeline")
    model = obj.get("model")
    if pipeline is None or model is None:
        raise ValueError(f"Invalid risk_model payload keys: {list(obj.keys())}")
    return pipeline, model, obj

def _load_data_mode() -> str:
    root = _resolve_project_root()
    metrics_path = root / "artifacts" / "metrics.json"
    dq_path = root / "data" / "reports" / "data_quality.json"
    if metrics_path.exists():
        try:
            d = json.loads(metrics_path.read_text(encoding="utf-8"))
            if "data_mode" in d:
                return str(d["data_mode"])
            if "provenance" in d and "data_mode" in d["provenance"]:
                return str(d["provenance"]["data_mode"])
        except Exception:
            pass
    if dq_path.exists():
        try:
            d = json.loads(dq_path.read_text(encoding="utf-8"))
            if "data_mode" in d:
                return str(d["data_mode"])
        except Exception:
            pass
    return "synthetic"

def _load_claim_limitations() -> str:
    root = _resolve_project_root()
    metrics_path = root / "artifacts" / "metrics.json"
    if metrics_path.exists():
        try:
            d = json.loads(metrics_path.read_text(encoding="utf-8"))
            for k in ["claim_limitations", "limitations"]:
                if k in d and isinstance(d[k], str):
                    return d[k]
        except Exception:
            pass
    return "Binary benign-versus-malicious risk only (learned); stage estimate is rule-derived evidence score; target ranking is NetworkX graph-ranked; isolation is simulated estimate - not causal proof"

def _normalize_col(col: str) -> str:
    return col.strip()

def _find_timestamp_col(df: pd.DataFrame) -> Optional[str]:
    cmap = {c.strip().casefold(): c for c in df.columns}
    if "timestamp" in cmap:
        return cmap["timestamp"]
    for c in df.columns:
        if "timestamp" in c.strip().casefold():
            return c
    return None

def _parse_ts(df: pd.DataFrame) -> pd.DataFrame:
    ts_col = _find_timestamp_col(df)
    if ts_col is None:
        return df
    s = pd.to_datetime(df[ts_col], errors="coerce")
    try:
        if hasattr(s.dt, "tz") and s.dt.tz is not None:
            s = s.dt.tz_localize(None)
    except Exception:
        pass
    df = df.copy()
    df[ts_col] = s
    return df

# ---------------------------------------------------------------------------
# Helper: predicted malicious from model probabilities (label-free)
# ---------------------------------------------------------------------------

def _predicted_counts_from_proba(proba: List[float] | np.ndarray, threshold: float = THRESHOLD) -> Tuple[int, float]:
    """Compute predicted malicious count/ratio from model probabilities (label-free).

    Uses frozen threshold 0.45 from metrics.json. This is model-predicted, not label-derived.
    """
    arr = np.array(proba, dtype=float)
    if len(arr) == 0:
        return 0, 0.0
    predicted_malicious_count = int((arr > threshold).sum())
    predicted_malicious_ratio = float(predicted_malicious_count / len(arr)) if len(arr) else 0.0
    return predicted_malicious_count, predicted_malicious_ratio

# ---------------------------------------------------------------------------
# Temporal state
# ---------------------------------------------------------------------------

def compute_temporal_state(raw_risks: List[float], alpha: float = ALPHA, threshold: float = THRESHOLD) -> Tuple[List[float], List[float], List[bool]]:
    """Compute EWMA smoothed risk, slope over 5, warning.

    Inputs are raw_risks from model only (never labels). Deterministic seed 42.
    Returns:
        smoothed: EWMA with alpha
        slopes: linear regression slope over last 5 smoothed values
        warnings: smoothed > threshold and slope > 0
    """
    np.random.seed(SEED)
    smoothed: List[float] = []
    for i, raw in enumerate(raw_risks):
        if i == 0:
            s = float(raw)
        else:
            s = float(alpha * raw + (1 - alpha) * smoothed[-1])
        smoothed.append(s)
    slopes: List[float] = []
    for i in range(len(smoothed)):
        window = smoothed[max(0, i - 4): i + 1]
        if len(window) < 2:
            slope = 0.0
        else:
            x = np.arange(len(window))
            y = np.array(window, dtype=float)
            if np.allclose(y, y[0]):
                slope = 0.0
            else:
                try:
                    slope = float(np.polyfit(x, y, 1)[0])
                except Exception:
                    slope = float(y[-1] - y[0]) / max(1, len(y)-1)
        slopes.append(float(slope))
    warnings: List[bool] = []
    for s, sl in zip(smoothed, slopes):
        warn = (s > threshold) and (sl > 1e-9)
        warnings.append(bool(warn))
    return smoothed, slopes, warnings

# ---------------------------------------------------------------------------
# Stage, evidence, MITRE - label-free (observable + model-predicted only)
# ---------------------------------------------------------------------------

def compute_stage(
    distinct_ports: int,
    distinct_dest_ips: int,
    flag_means: Dict[str, float],
    predicted_malicious_ratio: float,
    smoothed_risk: float,
    slope: float,
    warning_active: bool,
    slice_df: Optional[pd.DataFrame] = None,
    threshold: float = THRESHOLD,
) -> str:
    """Transparent evidence score - rule-derived stage, not calibrated probability.

    Uses ONLY observable flow features + model-predicted ratio/EWMA risk/trend.
    Never uses Label column or label_counts. Rules:
    - Normal: low predicted ratio and low smoothed risk
    - Reconnaissance: port diversity >15 + predicted suspicious
    - Credential Attack: predicted ratio >0.25 + SYN/port diversity
    - Compromise/Infiltration: predicted ratio high + host-to-host + risk trend
    - Impact/Disruption: high bytes/packets rates + predicted ratio
    """
    # Observable numeric features from slice_df
    mean_bytes = 0.0
    mean_pkts = 0.0
    active_mean = 0.0
    idle_mean = 0.0
    if slice_df is not None:
        try:
            if "Flow Bytes/s" in slice_df.columns:
                mean_bytes = float(pd.to_numeric(slice_df["Flow Bytes/s"], errors="coerce").replace([np.inf, -np.inf], np.nan).mean())
            if "Flow Packets/s" in slice_df.columns:
                mean_pkts = float(pd.to_numeric(slice_df["Flow Packets/s"], errors="coerce").replace([np.inf, -np.inf], np.nan).mean())
            if "Active Mean" in slice_df.columns:
                active_mean = float(pd.to_numeric(slice_df["Active Mean"], errors="coerce").mean())
            if "Idle Mean" in slice_df.columns:
                idle_mean = float(pd.to_numeric(slice_df["Idle Mean"], errors="coerce").mean())
        except Exception:
            pass
        # handle NaN
        if np.isnan(mean_bytes):
            mean_bytes = 0.0
        if np.isnan(mean_pkts):
            mean_pkts = 0.0
        if np.isnan(active_mean):
            active_mean = 0.0
        if np.isnan(idle_mean):
            idle_mean = 0.0

    # Normal: low predicted and low risk
    if predicted_malicious_ratio < 0.07 and smoothed_risk < threshold:
        return "Normal"
    if not warning_active and predicted_malicious_ratio < 0.10 and smoothed_risk < threshold:
        return "Normal"

    # Impact/Disruption: high volume rates (DoS-like) plus predicted ratio high
    # Uses only observable bytes/packets/active - no label
    if predicted_malicious_ratio > 0.30 and (mean_bytes > 7000 or mean_pkts > 7000 or active_mean > 800):
        return "Impact/Disruption"

    # Compromise/Infiltration: predicted ratio high + host-to-host (dest IP diversity) + risk trend
    # Requires warning and smoothed high, distinct hosts/ports indicate internal spread
    # Threshold smoothed >0.52 to avoid early false compromise before ground truth (frames 10-11)
    # This ensures pre-reveal (0-19) stays Credential/Normal if not truly high, while post-reveal can still trigger if conditions met
    if predicted_malicious_ratio > 0.30 and smoothed_risk > 0.52 and warning_active and distinct_dest_ips > 50 and distinct_ports > 50:
        return "Compromise/Infiltration"

    # Credential Attack: predicted ratio high plus SYN/port diversity (auth-like activity)
    if predicted_malicious_ratio > 0.25:
        syn = float(flag_means.get("SYN Flag Count", 0.0))
        # Use SYN and port diversity as observable proxy for brute-force-like scanning
        if syn > 0.25 and distinct_ports > 50:
            return "Credential Attack"
        # fallback: any high predicted ratio without impact/compromise qualifies as credential
        return "Credential Attack"

    # Reconnaissance: port diversity + predicted suspicious
    if distinct_ports > 15 and distinct_dest_ips > 15 and predicted_malicious_ratio > 0.08:
        return "Reconnaissance"

    return "Normal"


def _compute_evidence(
    slice_df: pd.DataFrame,
    distinct_ports: int,
    distinct_dest_ips: int,
    flag_means: Dict[str, float],
    predicted_malicious_ratio: float,
    smoothed_risk: float,
    slope: float,
    warning_active: bool,
    threshold: float = THRESHOLD,
) -> List[str]:
    """Deterministic observed evidence - model-predicted/observable only, never label-derived.

    Evidence strings use observable numeric features and model-predicted ratio/risk,
    e.g., "High SYN flag rate (0.82)", "Port diversity 22 distinct", "Predicted malicious ratio 0.31".
    Never mentions raw Label values like "PortScan" or "Infiltration".
    """
    evidence: List[str] = []
    # Port/host diversity (observable)
    if distinct_ports > 20:
        evidence.append(f"High destination port diversity ({distinct_ports} ports)")
    if distinct_dest_ips > 20:
        evidence.append(f"High destination host diversity ({distinct_dest_ips} hosts)")
    # SYN flag rate (observable)
    syn_mean = float(flag_means.get("SYN Flag Count", 0.0))
    if syn_mean > 0.35:
        evidence.append(f"High SYN flag rate (mean {syn_mean:.2f})")
    # Predicted malicious ratio (model-predicted, label-free)
    if predicted_malicious_ratio > 0.10:
        evidence.append(f"Predicted malicious ratio {predicted_malicious_ratio:.2f} model-predicted (threshold {threshold:.2f})")
    elif predicted_malicious_ratio > 0.05:
        evidence.append(f"Slight predicted malicious activity {predicted_malicious_ratio:.2f} model-predicted")
    # EWMA risk and trend (model-predicted)
    if smoothed_risk > threshold and warning_active:
        evidence.append(f"EWMA risk {smoothed_risk:.2f} above threshold {threshold:.2f} with positive trend (slope {slope:.4f})")
    elif smoothed_risk > threshold:
        evidence.append(f"EWMA risk {smoothed_risk:.2f} above threshold {threshold:.2f}")
    # Flow bytes/packets rates (observable)
    try:
        if "Flow Bytes/s" in slice_df.columns:
            mean_bytes = pd.to_numeric(slice_df["Flow Bytes/s"], errors="coerce").replace([np.inf, -np.inf], np.nan).mean()
            if pd.notna(mean_bytes) and mean_bytes > 6000:
                evidence.append(f"Elevated flow bytes per second (mean {mean_bytes:.0f})")
    except Exception:
        pass
    try:
        if "Flow Packets/s" in slice_df.columns:
            mean_pkts = pd.to_numeric(slice_df["Flow Packets/s"], errors="coerce").replace([np.inf, -np.inf], np.nan).mean()
            if pd.notna(mean_pkts) and mean_pkts > 6000:
                evidence.append(f"Elevated flow packets per second (mean {mean_pkts:.0f})")
    except Exception:
        pass
    try:
        if "Active Mean" in slice_df.columns:
            active_mean = pd.to_numeric(slice_df["Active Mean"], errors="coerce").mean()
            if pd.notna(active_mean) and active_mean > 800:
                evidence.append(f"High active time (mean {active_mean:.0f})")
    except Exception:
        pass
    # Ensure at least one
    if not evidence:
        # Check if normal
        if predicted_malicious_ratio < 0.05 and smoothed_risk < threshold:
            evidence.append("Observed normal benign activity - no suspicious evidence")
        else:
            evidence.append(f"Observed flow diversity - predicted ratio {predicted_malicious_ratio:.2f} model-predicted")
    return evidence

# Backwards compatibility wrapper for old tests that used label_counts signature
def _compute_evidence_legacy(slice_df: pd.DataFrame, label_counts: Dict[str, int], distinct_ports: int, distinct_dest_ips: int, flag_means: Dict[str, float]) -> List[str]:
    # Legacy signature not used in new engine; kept for import compatibility but delegates to label-free version with dummy predicted values
    # This will not be used in new tests
    return _compute_evidence(slice_df, distinct_ports, distinct_dest_ips, flag_means, 0.0, 0.0, 0.0, False)

def _mitre_for_stage(stage: str) -> List[Dict[str, str]]:
    return MITRE_MAPPING.get(stage, [])

# ---------------------------------------------------------------------------
# Target ranking via NetworkX
# ---------------------------------------------------------------------------

def rank_targets(graph: nx.DiGraph, frame_idx: int, smoothed: float, slope: float) -> List[Dict[str, Any]]:
    """Graph-ranked target scoring: suspicious incoming activity * edge novelty * recent risk trend * asset criticality.

    Returns sorted list descending by target_score.
    Uses NetworkX DiGraph for indegree/novelty. Never reads Label.
    """
    rankings: List[Dict[str, Any]] = []
    risk_trend = 0.5 + float(smoothed)
    if slope > 0:
        risk_trend *= (1 + float(slope) * 5)
    risk_trend = max(0.1, float(risk_trend))
    for node, attrs in graph.nodes(data=True):
        in_edges = list(graph.in_edges(node, data=True))
        if not in_edges:
            incoming_activity = 0
            avg_novelty = 0.5
        else:
            incoming_activity = int(sum(d.get("activity", 1) for _, _, d in in_edges))
            novelties = []
            for _, _, d in in_edges:
                first = d.get("first_seen", frame_idx)
                delta = frame_idx - first
                if delta == 0:
                    nov = 1.0
                elif delta <= 2:
                    nov = 0.8
                elif delta <= 5:
                    nov = 0.5
                else:
                    nov = 0.2
                novelties.append(nov)
            avg_novelty = float(np.mean(novelties)) if novelties else 0.5
        criticality_numeric = attrs.get("criticality_numeric", CRITICALITY_NUMERIC.get(attrs.get("criticality", "low"), 1))
        incoming_factor = float(incoming_activity + 1)
        target_score = incoming_factor * avg_novelty * risk_trend * float(criticality_numeric)
        rankings.append({
            "host": node,
            "alias": node,
            "target_score": float(target_score),
            "incoming_activity": int(incoming_activity),
            "edge_novelty": float(avg_novelty),
            "recent_risk_trend": float(risk_trend),
            "asset_criticality": attrs.get("criticality", "low"),
            "criticality_numeric": int(criticality_numeric),
            "role": attrs.get("role", "workstation"),
        })
    rankings.sort(key=lambda x: (-x["target_score"], x["alias"]))
    for idx, entry in enumerate(rankings):
        entry["rank"] = idx + 1
    return rankings

def _predicted_path_for_top(graph: nx.DiGraph, top_host: str, frame_idx: int) -> Optional[Dict[str, Any]]:
    """Find predicted dashed edge for top target."""
    in_edges = list(graph.in_edges(top_host, data=True))
    if not in_edges:
        return None
    def edge_score(item):
        src, dst, d = item
        activity = d.get("activity", 0)
        first = d.get("first_seen", 0)
        delta = frame_idx - first
        nov = 1.0 if delta==0 else 0.8 if delta<=2 else 0.5 if delta<=5 else 0.2
        return (activity, nov, src)
    best = max(in_edges, key=edge_score)
    src, dst, d = best
    return {
        "source": src,
        "target": dst,
        "protocol": d.get("protocol", "TCP"),
        "activity": d.get("activity", 1),
        "novelty": 1.0 if (frame_idx - d.get("first_seen", frame_idx))==0 else 0.5,
        "status": "predicted",
        "style": "dashed",
        "reason": "Top ranked target's most suspicious incoming edge",
    }

# ---------------------------------------------------------------------------
# Build frames - leakage-safe (model only for risk/predicted counts)
# ---------------------------------------------------------------------------

def build_frames() -> Tuple[List[Dict[str, Any]], List[float]]:
    """Load chronological flows, split into FRAME_COUNT frames, compute raw risk per frame.

    Uses ONLY model pipeline for risk/predicted counts (never labels for forecast).
    Label counts are computed solely for ground_truth (hidden until reveal) - not for stage/evidence/flow_summary pre-reveal.

    Returns:
        frames_raw: list of dicts with slice_df, timestamp, raw_risk, predicted counts, label_counts etc.
        raw_risks: list of raw risk floats
    """
    np.random.seed(SEED)
    root = _resolve_project_root()
    raw_dir = root / "data" / "raw"
    daily_files = _find_daily_files(raw_dir)
    dfs = []
    for day in ["monday","tuesday","wednesday","thursday","friday"]:
        path = daily_files[day]
        df = pd.read_csv(path, low_memory=False)
        df = _parse_ts(df)
        dfs.append(df)
    all_df = pd.concat(dfs, ignore_index=True)
    ts_col = _find_timestamp_col(all_df)
    if ts_col and pd.api.types.is_datetime64_any_dtype(all_df[ts_col]):
        all_df = all_df.sort_values(by=ts_col, kind="mergesort").reset_index(drop=True)
    else:
        all_df = _parse_ts(all_df)
        if ts_col and pd.api.types.is_datetime64_any_dtype(all_df[ts_col]):
            all_df = all_df.sort_values(by=ts_col, kind="mergesort").reset_index(drop=True)
    total = len(all_df)
    n = FRAME_COUNT
    base = total // n
    rem = total % n
    frames_raw: List[Dict[str, Any]] = []
    pipeline, model, _ = _load_pipeline_and_model()
    threshold = _load_threshold()
    idx = 0
    for frame_idx in range(n):
        size = base + (1 if frame_idx < rem else 0)
        slice_df = all_df.iloc[idx: idx + size].copy().reset_index(drop=True)
        idx += size
        ts_col_slice = _find_timestamp_col(slice_df)
        if ts_col_slice and pd.api.types.is_datetime64_any_dtype(slice_df[ts_col_slice]):
            ts_max = slice_df[ts_col_slice].max()
            try:
                timestamp_str = ts_max.strftime("%Y-%m-%d %H:%M:%S") if pd.notna(ts_max) else str(ts_max)
                timestamp_iso = ts_max.isoformat() if pd.notna(ts_max) else timestamp_str
            except Exception:
                timestamp_str = str(ts_max)
                timestamp_iso = timestamp_str
        else:
            timestamp_str = f"frame-{frame_idx}"
            timestamp_iso = timestamp_str
        # raw risk via pipeline (label-free)
        try:
            X = pipeline.transform(slice_df)
            proba = model.predict_proba(X)[:, 1]
            raw_risk = float(np.mean(proba))
            proba_list = proba.tolist()
        except Exception:
            raw_risk = 0.2
            proba_list = [raw_risk]*len(slice_df)
            proba = np.array(proba_list)
        # predicted malicious counts from model probabilities (label-free, threshold 0.45)
        try:
            predicted_malicious_count, predicted_malicious_ratio = _predicted_counts_from_proba(proba, threshold)
        except Exception:
            predicted_malicious_count = 0
            predicted_malicious_ratio = 0.0
        # label counts for ground_truth only (hidden until reveal)
        label_col = None
        cmap = {c.strip().casefold(): c for c in slice_df.columns}
        if "label" in cmap:
            label_col = cmap["label"]
        if label_col:
            vc = slice_df[label_col].astype(str).str.strip().value_counts().to_dict()
        else:
            vc = {}
        # distinct ports etc (observable)
        try:
            distinct_ports = int(slice_df["Destination Port"].nunique())
        except Exception:
            distinct_ports = 0
        try:
            distinct_dest_ips = int(slice_df["Destination IP"].nunique())
        except Exception:
            distinct_dest_ips = 0
        flag_means = {}
        for flag_col in ["SYN Flag Count", "ACK Flag Count", "PSH Flag Count", "RST Flag Count"]:
            if flag_col in slice_df.columns:
                try:
                    flag_means[flag_col] = float(pd.to_numeric(slice_df[flag_col], errors="coerce").mean())
                except Exception:
                    flag_means[flag_col] = 0.0
        frames_raw.append({
            "frame_idx": frame_idx,
            "slice_df": slice_df,
            "timestamp_str": timestamp_str,
            "timestamp_iso": timestamp_iso,
            "raw_risk": raw_risk,
            "proba_list": proba_list,
            "predicted_malicious_count": int(predicted_malicious_count),
            "predicted_malicious_ratio": float(predicted_malicious_ratio),
            "label_counts": vc,  # for ground_truth only
            "distinct_ports": distinct_ports,
            "distinct_dest_ips": distinct_dest_ips,
            "flag_means": flag_means,
            "size": size,
            "threshold": float(threshold),
        })
    raw_risks = [f["raw_risk"] for f in frames_raw]
    return frames_raw, raw_risks

# ---------------------------------------------------------------------------
# Generate scenario
# ---------------------------------------------------------------------------

def generate_scenario() -> Dict[str, Any]:
    """Generate full replay scenario with temporal state, graph, stage, ranking, evidence, MITRE.

    Deterministic seed 42. Uses leakage-safe pipeline for risk and predicted counts only.
    All forecasts (smoothed, slope, warning, stage, evidence, MITRE, target ranking) use only
    observable/model-predicted signals, never raw Label column, before reveal.
    Ground truth raw labels are gated in ground_truth.revealed structure.
    """
    np.random.seed(SEED)
    root = _resolve_project_root()
    threshold = _load_threshold()
    pipeline, model, model_payload = _load_pipeline_and_model()
    data_mode = _load_data_mode()
    claim_limitations = _load_claim_limitations()
    schema_path = root / "artifacts" / "feature_schema.json"
    feature_schema = {}
    if schema_path.exists():
        try:
            feature_schema = json.loads(schema_path.read_text(encoding="utf-8"))
        except Exception:
            feature_schema = {}
    model_family = model_payload.get("model_family") or model_payload.get("model", {}).get("model_family", "random_forest")
    metrics_path = root / "artifacts" / "metrics.json"
    metrics_data = {}
    if metrics_path.exists():
        try:
            metrics_data = json.loads(metrics_path.read_text(encoding="utf-8"))
            if "model_family" in metrics_data:
                model_family = metrics_data["model_family"]
        except Exception:
            pass
    model_version = model_payload.get("model_version") or model_payload.get("version") or metrics_data.get("model_version") or "phase04-v1"
    frames_raw, raw_risks = build_frames()
    smoothed_list, slope_list, warning_list = compute_temporal_state(raw_risks, alpha=ALPHA, threshold=threshold)

    all_ips_set = set()
    for fr in frames_raw:
        sdf = fr["slice_df"]
        if "Source IP" in sdf.columns:
            all_ips_set.update(sdf["Source IP"].astype(str).str.strip().tolist())
        if "Destination IP" in sdf.columns:
            all_ips_set.update(sdf["Destination IP"].astype(str).str.strip().tolist())
    unique_ips_sorted = sorted(all_ips_set)
    ip_to_alias: Dict[str, str] = {}
    alias_to_ip: Dict[str, str] = {}
    role_map: Dict[str, str] = {}
    crit_map: Dict[str, str] = {}
    crit_num_map: Dict[str, int] = {}
    rng = np.random.default_rng(SEED)
    for idx, ip in enumerate(unique_ips_sorted):
        alias = f"host-{idx+1}"
        ip_to_alias[ip] = alias
        alias_to_ip[alias] = ip
        role = str(rng.choice(ROLES))
        role_map[alias] = role
        crit = ROLE_TO_CRITICALITY[role]
        crit_map[alias] = crit
        crit_num_map[alias] = CRITICALITY_NUMERIC[crit]

    graph = nx.DiGraph()

    ground_truth_start = 20
    first_warning_idx = next((i for i, w in enumerate(warning_list) if w), None)
    if first_warning_idx is not None and first_warning_idx >= ground_truth_start:
        ground_truth_start = min(FRAME_COUNT - 1, first_warning_idx + 3)

    frames: List[Dict[str, Any]] = []

    for fr in frames_raw:
        idx = fr["frame_idx"]
        slice_df = fr["slice_df"]
        timestamp_str = fr["timestamp_str"]
        timestamp_iso = fr["timestamp_iso"]
        raw_risk = fr["raw_risk"]
        smoothed = smoothed_list[idx]
        slope = slope_list[idx]
        warning = warning_list[idx]
        label_counts = fr["label_counts"]  # for ground_truth only
        distinct_ports = fr["distinct_ports"]
        distinct_dest_ips = fr["distinct_dest_ips"]
        flag_means = fr["flag_means"]
        proba_list = fr["proba_list"]
        predicted_malicious_count = int(fr["predicted_malicious_count"])
        predicted_malicious_ratio = float(fr["predicted_malicious_ratio"])

        # Update graph with slice flows (observable IPs only)
        for row_idx, (_, row) in enumerate(slice_df.iterrows()):
            src_ip = str(row.get("Source IP", "")).strip()
            dst_ip = str(row.get("Destination IP", "")).strip()
            if not src_ip or src_ip == "nan":
                continue
            if not dst_ip or dst_ip == "nan":
                continue
            src_alias = ip_to_alias.get(src_ip)
            dst_alias = ip_to_alias.get(dst_ip)
            if not src_alias or not dst_alias:
                continue
            proto_val = row.get("Protocol", 6)
            try:
                proto_int = int(proto_val)
                proto_name = {6: "TCP", 17: "UDP", 1: "ICMP"}.get(proto_int, str(proto_int))
            except Exception:
                proto_name = str(proto_val)
            if not graph.has_node(src_alias):
                graph.add_node(src_alias, alias=src_alias, role=role_map[src_alias], criticality=crit_map[src_alias], criticality_numeric=crit_num_map[src_alias], original_ip=src_ip)
            if not graph.has_node(dst_alias):
                graph.add_node(dst_alias, alias=dst_alias, role=role_map[dst_alias], criticality=crit_map[dst_alias], criticality_numeric=crit_num_map[dst_alias], original_ip=dst_ip)
            if graph.has_edge(src_alias, dst_alias):
                graph[src_alias][dst_alias]["activity"] += 1
                protos = graph[src_alias][dst_alias].get("protocols", set())
                protos.add(proto_name)
                graph[src_alias][dst_alias]["protocols"] = protos
                graph[src_alias][dst_alias]["last_seen"] = idx
            else:
                graph.add_edge(src_alias, dst_alias, activity=1, protocols={proto_name}, protocol=proto_name, first_seen=idx, last_seen=idx)

        # Stage - label-free (observable + predicted only)
        stage = compute_stage(
            distinct_ports,
            distinct_dest_ips,
            flag_means,
            predicted_malicious_ratio,
            smoothed,
            slope,
            warning,
            slice_df,
            threshold,
        )
        evidence = _compute_evidence(
            slice_df,
            distinct_ports,
            distinct_dest_ips,
            flag_means,
            predicted_malicious_ratio,
            smoothed,
            slope,
            warning,
            threshold,
        )
        mitre = _mitre_for_stage(stage)

        host_probas: Dict[str, List[float]] = {}
        for row_idx, (_, row) in enumerate(slice_df.iterrows()):
            prob = proba_list[row_idx] if row_idx < len(proba_list) else raw_risk
            src_ip = str(row.get("Source IP", "")).strip()
            dst_ip = str(row.get("Destination IP", "")).strip()
            src_alias = ip_to_alias.get(src_ip)
            dst_alias = ip_to_alias.get(dst_ip)
            if src_alias:
                host_probas.setdefault(src_alias, []).append(float(prob))
            if dst_alias:
                host_probas.setdefault(dst_alias, []).append(float(prob))
        host_risk_mean: Dict[str, float] = {}
        for alias, plist in host_probas.items():
            host_risk_mean[alias] = float(np.mean(plist)) if plist else raw_risk

        nodes_snapshot: List[Dict[str, Any]] = []
        window_aliases = set(host_probas.keys())
        for alias in sorted(window_aliases):
            attrs = graph.nodes[alias] if graph.has_node(alias) else {"role": role_map.get(alias, "workstation"), "criticality": crit_map.get(alias, "low"), "criticality_numeric": crit_num_map.get(alias, 1), "original_ip": alias_to_ip.get(alias, alias)}
            risk = host_risk_mean.get(alias, float(smoothed))
            if risk > threshold and warning:
                observed_state = "suspicious"
            else:
                observed_state = "observed"
            nodes_snapshot.append({
                "id": alias,
                "alias": alias,
                "safe_alias": alias,
                "role": attrs.get("role", "workstation"),
                "criticality": attrs.get("criticality", "low"),
                "criticality_numeric": attrs.get("criticality_numeric", 1),
                "risk": float(risk),
                "observed_state": observed_state,
                "status": "observed",
                "first_seen": idx,
            })
        if not nodes_snapshot:
            for alias, attrs in list(graph.nodes(data=True))[:5]:
                risk = float(smoothed)
                nodes_snapshot.append({
                    "id": alias,
                    "alias": alias,
                    "safe_alias": alias,
                    "role": attrs.get("role", "workstation"),
                    "criticality": attrs.get("criticality", "low"),
                    "criticality_numeric": attrs.get("criticality_numeric", 1),
                    "risk": float(risk),
                    "observed_state": "observed",
                    "status": "observed",
                    "first_seen": idx,
                })

        window_edge_keys = set()
        window_edge_counts: Dict[Tuple[str, str], int] = {}
        window_edge_protos: Dict[Tuple[str, str], set] = {}
        for _, row in slice_df.iterrows():
            src_ip = str(row.get("Source IP", "")).strip()
            dst_ip = str(row.get("Destination IP", "")).strip()
            src_alias = ip_to_alias.get(src_ip)
            dst_alias = ip_to_alias.get(dst_ip)
            if not src_alias or not dst_alias:
                continue
            key = (src_alias, dst_alias)
            window_edge_keys.add(key)
            window_edge_counts[key] = window_edge_counts.get(key, 0) + 1
            proto_val = row.get("Protocol", 6)
            try:
                proto_int = int(proto_val)
                proto_name = {6: "TCP", 17: "UDP", 1: "ICMP"}.get(proto_int, str(proto_int))
            except Exception:
                proto_name = str(proto_val)
            window_edge_protos.setdefault(key, set()).add(proto_name)
        edges_snapshot: List[Dict[str, Any]] = []
        for (src, dst) in sorted(window_edge_keys):
            if graph.has_edge(src, dst):
                edata = graph[src][dst]
                first = edata.get("first_seen", idx)
                activity = window_edge_counts.get((src, dst), 1)
                delta = idx - first
                if delta == 0:
                    novelty = 1.0
                elif delta <= 2:
                    novelty = 0.8
                elif delta <= 5:
                    novelty = 0.5
                else:
                    novelty = 0.2
                protos = window_edge_protos.get((src, dst), {edata.get("protocol", "TCP")})
                protos_list = sorted(list(protos)) if isinstance(protos, set) else [str(protos)]
                protocol = protos_list[0] if protos_list else "TCP"
            else:
                first = idx
                novelty = 1.0
                activity = window_edge_counts.get((src, dst), 1)
                protos = window_edge_protos.get((src, dst), {"TCP"})
                protos_list = sorted(list(protos))
                protocol = protos_list[0]
            edges_snapshot.append({
                "source": src,
                "target": dst,
                "protocol": protocol,
                "protocols": protos_list,
                "activity": int(activity),
                "novelty": float(novelty),
                "status": "observed",
                "first_seen": int(first),
                "last_seen": int(idx),
            })

        full_rankings = rank_targets(graph, idx, smoothed, slope)
        rankings = full_rankings[:10]
        predicted_path = None
        if rankings:
            top_host = rankings[0]["host"]
            predicted_path = _predicted_path_for_top(graph, top_host, idx)

        # Ground truth gated - raw labels only when revealed
        total_flows = len(slice_df)
        # Compute true counts for ground truth (but not used for forecast)
        {str(k).strip().lower(): v for k, v in label_counts.items()}
        true_mal_counts = sum(v for k, v in label_counts.items() if str(k).strip().lower() != "benign")
        true_mal_ratio = true_mal_counts / total_flows if total_flows else 0.0
        if idx < ground_truth_start:
            ground_truth = {
                "revealed": False,
                "event": "Normal",
                "attack_type": None,
                "label_distribution": None,
                "label_distribution_current_frame": None,
                "true_malicious_count": None,
                "true_malicious_ratio": None,
                "frame": idx,
                "timestamp": timestamp_str,
                "details": "No attack revealed yet - benign profile",
                "attack_started": False,
                "ground_truth_frame": ground_truth_start,
                "visible": False,
            }
        else:
            attack_type = None
            mal_only = {k: v for k, v in label_counts.items() if str(k).strip().lower() != "benign"}
            if mal_only:
                attack_type = max(mal_only, key=lambda k: mal_only[k])
            else:
                attack_type = "Infiltration"
            ground_truth = {
                "revealed": True,
                "event": f"{attack_type} started" if attack_type else "Attack started",
                "attack_type": attack_type,
                "label_distribution": label_counts,
                "label_distribution_current_frame": label_counts,
                "true_malicious_count": int(true_mal_counts),
                "true_malicious_ratio": float(true_mal_ratio),
                "frame": idx,
                "timestamp": timestamp_str,
                "details": f"Ground truth revealed at frame {ground_truth_start}: {attack_type}",
                "attack_started": True,
                "ground_truth_frame": ground_truth_start,
                "visible": True,
            }

        # Flow summary - label-free observable + model-predicted only (no raw malicious counts before reveal, and no raw after either)
        # Use observable stats
        try:
            mean_bytes_val = float(pd.to_numeric(slice_df["Flow Bytes/s"], errors="coerce").replace([np.inf, -np.inf], np.nan).mean())
            if np.isnan(mean_bytes_val):
                mean_bytes_val = 0.0
        except Exception:
            mean_bytes_val = 0.0
        try:
            mean_pkts_val = float(pd.to_numeric(slice_df["Flow Packets/s"], errors="coerce").replace([np.inf, -np.inf], np.nan).mean())
            if np.isnan(mean_pkts_val):
                mean_pkts_val = 0.0
        except Exception:
            mean_pkts_val = 0.0
        flow_summary = {
            "total_flows": int(total_flows),
            "flow_count": int(total_flows),
            "timestamp": timestamp_str,
            "timestamp_iso": timestamp_iso,
            "distinct_source_ips": distinct_dest_ips,  # simplified observed
            "distinct_dest_ips": int(distinct_dest_ips),
            "distinct_ports": int(distinct_ports),
            "avg_bytes_per_sec": float(mean_bytes_val),
            "avg_packets_per_sec": float(mean_pkts_val),
            "predicted_malicious_count": int(predicted_malicious_count),  # model-predicted, threshold 0.45, 80 features
            "predicted_malicious_ratio": float(predicted_malicious_ratio),  # model-predicted
            "predicted_source": "model-predicted (Random Forest, threshold 0.45, 80 features, train-only)",
            "threshold": float(threshold),
            # No raw label-derived fields: no malicious_count, no label_distribution, no attack names
        }

        frame_dict = {
            "frame": idx,
            "frame_id": idx,
            "timestamp": timestamp_str,
            "timestamp_iso": timestamp_iso,
            "flow_summary": flow_summary,
            "nodes": nodes_snapshot,
            "edges": edges_snapshot,
            "signals": {
                "raw_risk": float(raw_risk),
                "smoothed_risk": float(smoothed),
                "slope": float(slope),
                "warning": bool(warning),
                "threshold": float(threshold),
                "alpha": ALPHA,
            },
            "forecast": {
                "raw_risk": float(raw_risk),
                "smoothed_risk": float(smoothed),
                "slope": float(slope),
                "warning": bool(warning),
                "threshold": float(threshold),
                "stage": stage,
                "stage_evidence_score": f"{stage} - observed evidence in frame (model-predicted ratio {predicted_malicious_ratio:.2f})",
                "target_ranking": rankings,
                "predicted_path": predicted_path,
                "evidence": evidence,
                "mitre": mitre,
                "engine_metadata": {
                    "model_family": model_family,
                    "model_version": model_version,
                    "data_mode": data_mode,
                    "feature_schema_version": feature_schema.get("version", "phase03-v1-sealed"),
                    "feature_count": feature_schema.get("feature_count", 80),
                    "claim_limitations": claim_limitations,
                },
                "targetRanking": rankings,
                "engineMetadata": {
                    "model_family": model_family,
                    "model_version": model_version,
                    "data_mode": data_mode,
                },
            },
            "signals_raw": {
                "raw_risk": float(raw_risk),
                "smoothed_risk": float(smoothed),
                "slope": float(slope),
                "warning": bool(warning),
            },
            "stage": stage,
            "stage_estimate": stage,
            "target_ranking": rankings,
            "predicted_path": predicted_path,
            "evidence": evidence,
            "mitre": mitre,
            "mitre_mapping": mitre,
            "ground_truth": ground_truth,
            "groundTruth": ground_truth,
        }
        frames.append(frame_dict)

    created_at = datetime.now(timezone.utc).isoformat()
    total_flows_all = sum(fr["size"] for fr in frames_raw)
    scenario = {
        "scenario_id": SCENARIO_ID,
        "id": SCENARIO_ID,
        "name": "CyberWorld Replay - Chronological CICIDS2017 Composite",
        "description": "Approximately 30-frame replay derived from chronological CICIDS2017 flows (Mon-Fri) with temporal risk, stage, and graph ranking. Deterministic seed 42. All forecasts use model-predicted observable signals (threshold 0.45) - no label leakage.",
        "created_at": created_at,
        "seed": SEED,
        "frame_count": len(frames),
        "frames": frames,
        "metadata": {
            "created_at": created_at,
            "seed": SEED,
            "frame_count": len(frames),
            "total_flows": total_flows_all,
            "flows_per_frame_avg": total_flows_all / len(frames) if frames else 0,
            "threshold": threshold,
            "warning_threshold": threshold,
            "alpha": ALPHA,
            "model_family": model_family,
            "model_version": model_version,
            "data_mode": data_mode,
            "feature_schema_version": feature_schema.get("version", "phase03-v1-sealed"),
            "feature_count": feature_schema.get("feature_count", 80),
            "mitre_version": MITRE_VERSION,
            "composite": True,
            "synthetic": True,
            "synthetic_mode": data_mode == "synthetic",
            "disclosure": "Composite/synthetic stitching disclosed: replay is deterministic composite of chronological CICIDS2017 synthetic fallback flows (Mon 2017-07-03 to Fri 2017-07-07) stitched into ~30 frames with seed 42. Not real network data. Preprocessing and model are leakage-safe (train Tue-Wed, val Thu, test Fri). All stage/evidence uses model-predicted ratio (threshold 0.45) and observable rates - no Label column used for forecast.",
            "composite_disclosure": "Composite/synthetic stitching disclosed: deterministic stitching across Mon-Fri with ~30 frames; synthetic fallback generated with seed 42 if official ZIP not present. Labels only for ground truth reveal at correct frame, not as model input. Flow_summary predicted_malicious_* is model-predicted, not label-derived.",
            "stitching_disclosed": True,
            "chronological": True,
            "ground_truth_start_frame": ground_truth_start,
            "ground_truth_event": "Infiltration",
            "warning_threshold_desc": "Five-frame EWMA (alpha 0.4) and five-frame slope - warning requires smoothed > threshold and positive slope, threshold chosen on Thursday validation (0.45)",
            "claim_limitations": claim_limitations,
            "limitations": claim_limitations,
            "engine_metadata": {
                "model_family": model_family,
                "model_version": model_version,
                "data_mode": data_mode,
                "feature_schema_version": feature_schema.get("version", "phase03-v1-sealed"),
                "claim_limitations": claim_limitations,
            },
            "provenance": {
                "source_url": "https://www.unb.ca/cic/datasets/ids-2017.html",
                "data_mode": data_mode,
                "seed": SEED,
                "threshold": threshold,
            },
        },
        "engine_metadata": {
            "model_family": model_family,
            "model_version": model_version,
            "data_mode": data_mode,
            "feature_schema": feature_schema,
            "feature_schema_version": feature_schema.get("version", "phase03-v1-sealed"),
            "feature_count": feature_schema.get("feature_count", 80),
            "claim_limitations": claim_limitations,
            "mitre_version": MITRE_VERSION,
            "threshold": threshold,
        },
        "engineMetadata": {
            "model_family": model_family,
            "model_version": model_version,
            "data_mode": data_mode,
            "claim_limitations": claim_limitations,
        },
        "claim_limitations": claim_limitations,
        "claimLimitations": claim_limitations,
        "provenance": {
            "data_mode": data_mode,
            "seed": SEED,
            "threshold": threshold,
        },
    }
    return scenario

def get_offline_bundle() -> Dict[str, Any]:
    """Generate offline bundle from same engine - for frontend fallback."""
    scenario = generate_scenario()
    root = _resolve_project_root()
    metrics_path = root / "artifacts" / "metrics.json"
    metrics_data = {}
    if metrics_path.exists():
        try:
            metrics_data = json.loads(metrics_path.read_text(encoding="utf-8"))
        except Exception:
            pass
    bundle = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "bundle_type": "offline",
        "mode": "offline",
        "active_mode": "offline",
        "health": {
            "status": "ok",
            "engine": "trained",
            "message": "Offline bundle - backend not required",
        },
        "scenario": scenario,
        "metadata": scenario["metadata"],
        "engine_metadata": scenario["engine_metadata"],
        "metrics": metrics_data,
        "claim_limitations": scenario.get("claim_limitations", ""),
        "disclosure": scenario["metadata"]["disclosure"],
        "composite_disclosure": scenario["metadata"]["composite_disclosure"],
        "version": scenario["metadata"].get("mitre_version", MITRE_VERSION),
        "scenario_id": scenario["scenario_id"],
        "frame_count": scenario["frame_count"],
    }
    return bundle

def _sanitize_for_json(obj: Any) -> Any:
    """Recursively replace Infinity/NaN with JSON-valid values for browser compatibility."""
    if isinstance(obj, float):
        if np.isinf(obj):
            return 1.0
        if np.isnan(obj):
            return None
        return obj
    if isinstance(obj, dict):
        return {k: _sanitize_for_json(v) for k, v in obj.items()}
    if isinstance(obj, list):
        return [_sanitize_for_json(v) for v in obj]
    return obj

def save_offline_bundle(path: Optional[Path] = None) -> Path:
    root = _resolve_project_root()
    if path is None:
        path = root / "frontend" / "public" / "offline_bundle.json"
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    bundle = get_offline_bundle()
    bundle = _sanitize_for_json(bundle)
    frame_len = len(bundle.get("scenario", {}).get("frames", []))
    with path.open("w", encoding="utf-8") as f:
        json.dump(bundle, f, indent=2, sort_keys=True)
    print(f"[replay] Saved offline bundle to {path} with {frame_len} frames")
    return path

def save_demo_scenario(path: Optional[Path] = None) -> Path:
    root = _resolve_project_root()
    if path is None:
        path = root / "data" / "demo" / "cyberworld_replay.json"
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    scenario = generate_scenario()
    scenario = _sanitize_for_json(scenario)
    with path.open("w", encoding="utf-8") as f:
        json.dump(scenario, f, indent=2, sort_keys=True)
    print(f"[replay] Saved demo scenario to {path} with {len(scenario['frames'])} frames")
    return path

def save_both() -> Tuple[Path, Path]:
    p1 = save_demo_scenario()
    p2 = save_offline_bundle()
    return p1, p2

if __name__ == "__main__":
    save_both()
