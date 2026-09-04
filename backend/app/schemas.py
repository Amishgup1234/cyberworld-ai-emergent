"""Pydantic contracts for CyberWorld AI Phase 06.

Defines NetworkNode, NetworkEdge, ScenarioFrame, Forecast,
SimulationRequest/Result, EvaluationMetrics, EngineMetadata,
and error models with proper types, Field descriptions, and examples.
Generated OpenAPI is used to produce frontend/src/api/generated.ts.
"""

from __future__ import annotations

from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field, ConfigDict


# ---------------------------------------------------------------------------
# EngineMetadata
# ---------------------------------------------------------------------------

class EngineMetadata(BaseModel):
    """Metadata about the model engine, data mode, and claim limitations."""

    model_config = ConfigDict(extra="allow", protected_namespaces=())

    model_family: str = Field(
        default="random_forest",
        description="Model family - learned component (random_forest or logistic_regression)",
        examples=["random_forest"],
    )
    model_version: str = Field(
        default="phase04-v1",
        description="Model version identifier",
        examples=["phase04-v1"],
    )
    data_mode: str = Field(
        default="synthetic",
        description="Data mode - synthetic or downloaded",
        examples=["synthetic"],
    )
    feature_schema_version: str = Field(
        default="phase03-v1-sealed",
        description="Feature schema version",
        examples=["phase03-v1-sealed"],
    )
    feature_count: int = Field(
        default=80,
        description="Number of model features (ordered)",
        examples=[80],
    )
    claim_limitations: str = Field(
        default="Binary benign-versus-malicious risk only (learned); stage estimate is rule-derived evidence score; target ranking is NetworkX graph-ranked; isolation is simulated estimate - not causal proof",
        description="Claim limitations - distinguishes learned, rule-derived, graph-ranked, simulated, and measured",
        examples=["Binary benign-versus-malicious risk only (learned); stage estimate is rule-derived evidence score; target ranking is NetworkX graph-ranked; isolation is simulated estimate - not causal proof"],
    )
    threshold: Optional[float] = Field(
        default=0.45,
        description="Warning threshold chosen on Thursday validation (frozen)",
        examples=[0.45],
    )
    mitre_version: Optional[str] = Field(
        default="13.1",
        description="Pinned MITRE ATT&CK version",
        examples=["13.1"],
    )
    version: Optional[str] = Field(
        default="0.1.0",
        description="Application version",
        examples=["0.1.0"],
    )
    data_source_url: Optional[str] = Field(
        default="https://www.unb.ca/cic/datasets/ids-2017.html",
        description="Dataset source URL",
        examples=["https://www.unb.ca/cic/datasets/ids-2017.html"],
    )


# ---------------------------------------------------------------------------
# Health
# ---------------------------------------------------------------------------

class HealthResponse(BaseModel):
    model_config = ConfigDict(extra="allow", protected_namespaces=())
    status: str = Field(description="Health status ok", examples=["ok"])
    engine: str = Field(description="Engine state - trained or not-trained", examples=["trained"])
    model_family: Optional[str] = Field(default=None, description="Model family when trained", examples=["random_forest"])
    data_mode: Optional[str] = Field(default=None, description="Data mode", examples=["synthetic"])
    version: Optional[str] = Field(default=None, description="App version", examples=["0.1.0"])
    message: Optional[str] = Field(default=None, description="Human readable message", examples=["Backend is running. Model trained."])
    feature_count: Optional[int] = Field(default=None, description="Feature count when trained", examples=[80])
    threshold: Optional[float] = Field(default=None, description="Warning threshold", examples=[0.45])
    claim_limitations: Optional[str] = Field(default=None, description="Claim limitations", examples=["Binary benign-versus-malicious risk only (learned); ..."])
    engine_metadata: Optional[EngineMetadata] = Field(default=None, description="Full engine metadata")


# ---------------------------------------------------------------------------
# NetworkNode / NetworkEdge
# ---------------------------------------------------------------------------

class NetworkNode(BaseModel):
    model_config = ConfigDict(extra="allow")
    id: str = Field(description="Safe alias for host - e.g., host-1, never raw IP", examples=["host-1"])
    alias: str = Field(description="Alias identical to id for safe display", examples=["host-1"])
    safe_alias: Optional[str] = Field(default=None, description="Safe alias duplicate", examples=["host-1"])
    role: str = Field(description="Host role - observed", examples=["workstation"])
    criticality: str = Field(description="Asset criticality low|medium|high", examples=["high"])
    criticality_numeric: Optional[int] = Field(default=None, description="Numeric criticality 1|2|3", examples=[3])
    observed_state: str = Field(description="Observed state - observed or suspicious", examples=["observed"])
    risk: float = Field(description="Host risk score observed/predicted", examples=[0.42])
    status: str = Field(description="Status - observed for real topology, predicted for forecast path, simulated for isolation", examples=["observed"])
    first_seen: Optional[int] = Field(default=None, description="Frame first seen", examples=[0])


class NetworkEdge(BaseModel):
    model_config = ConfigDict(extra="allow")
    source: str = Field(description="Source host alias (observed)", examples=["host-1"])
    target: str = Field(description="Target host alias (observed)", examples=["host-2"])
    protocol: str = Field(description="Protocol TCP|UDP|ICMP", examples=["TCP"])
    protocols: Optional[List[str]] = Field(default=None, description="Protocols list", examples=[["TCP"]])
    activity: int = Field(description="Observed activity count in frame (observed)", examples=[3])
    novelty: float = Field(description="Edge novelty 0..1 graph-derived", examples=[0.8])
    status: str = Field(description="Status - observed for real, predicted for dashed predicted path, simulated/removed for isolation", examples=["observed"])
    first_seen: Optional[int] = Field(default=None, description="Frame first seen", examples=[0])
    last_seen: Optional[int] = Field(default=None, description="Frame last seen", examples=[5])


# ---------------------------------------------------------------------------
# FlowSummary
# ---------------------------------------------------------------------------

class FlowSummary(BaseModel):
    model_config = ConfigDict(extra="allow")
    total_flows: int = Field(description="Total flows in frame (observed)", examples=[190])
    flow_count: Optional[int] = Field(default=None, description="Alias for total_flows", examples=[190])
    distinct_dest_ips: int = Field(description="Distinct destination hosts observed", examples=[42])
    distinct_ports: int = Field(description="Distinct destination ports observed", examples=[18])
    avg_bytes_per_sec: Optional[float] = Field(default=None, description="Mean Flow Bytes/s observed", examples=[5120.0])
    avg_packets_per_sec: Optional[float] = Field(default=None, description="Mean Flow Packets/s observed", examples=[48.0])
    predicted_malicious_count: int = Field(description="Predicted malicious count model-predicted (threshold 0.45, 80 features) - not label-derived", examples=[12])
    predicted_malicious_ratio: float = Field(description="Predicted malicious ratio model-predicted - not label-derived", examples=[0.06])
    predicted_source: Optional[str] = Field(default=None, description="Source label for predicted fields", examples=["model-predicted (Random Forest, threshold 0.45, 80 features, train-only)"])
    threshold: Optional[float] = Field(default=None, description="Threshold used", examples=[0.45])
    timestamp: Optional[str] = Field(default=None, description="Timestamp observed", examples=["2017-07-03 09:15:23"])
    timestamp_iso: Optional[str] = Field(default=None, description="ISO timestamp", examples=["2017-07-03T09:15:23"])


# ---------------------------------------------------------------------------
# Signals
# ---------------------------------------------------------------------------

class Signals(BaseModel):
    model_config = ConfigDict(extra="allow")
    raw_risk: float = Field(description="Raw risk probability - learned (Random Forest)", examples=[0.22])
    smoothed_risk: float = Field(description="Five-frame EWMA smoothed risk (alpha 0.4) - rule-derived", examples=[0.25])
    slope: float = Field(description="Five-frame risk slope - rule-derived", examples=[0.015])
    warning: bool = Field(description="Early warning requires smoothed>threshold and positive slope", examples=[False])
    threshold: float = Field(description="Frozen warning threshold from validation", examples=[0.45])
    alpha: Optional[float] = Field(default=0.4, description="EWMA alpha", examples=[0.4])


# ---------------------------------------------------------------------------
# MITRE
# ---------------------------------------------------------------------------

class MitreTechnique(BaseModel):
    model_config = ConfigDict(extra="allow")
    technique_id: str = Field(description="MITRE technique ID pinned local mapping", examples=["T1046"])
    name: str = Field(description="Technique name", examples=["Network Service Discovery"])
    evidence_rule: str = Field(description="Evidence rule - cautious wording", examples=["Port diversity >15 plus predicted suspicious activity"])
    confidence: str = Field(description="Cautious confidence wording - not causal proof", examples=["possible - observed scanning only, not confirmed reconnaissance - requires analyst review"])
    stage: Optional[str] = Field(default=None, description="Stage mapping", examples=["Reconnaissance"])


# ---------------------------------------------------------------------------
# Target ranking
# ---------------------------------------------------------------------------

class TargetRankingEntry(BaseModel):
    model_config = ConfigDict(extra="allow")
    host: str = Field(description="Target host alias graph-ranked", examples=["host-42"])
    alias: Optional[str] = Field(default=None, description="Alias duplicate", examples=["host-42"])
    target_score: float = Field(description="Graph-ranked score = suspicious incoming * edge novelty * recent risk trend * asset criticality", examples=[12.4])
    incoming_activity: int = Field(description="Suspicious incoming activity observed", examples=[5])
    edge_novelty: float = Field(description="Average edge novelty graph-derived", examples=[0.8])
    recent_risk_trend: float = Field(description="Recent risk trend from EWMA", examples=[0.75])
    asset_criticality: str = Field(description="Asset criticality low|medium|high", examples=["high"])
    criticality_numeric: Optional[int] = Field(default=None, description="Numeric criticality", examples=[3])
    role: Optional[str] = Field(default=None, description="Role", examples=["database"])
    rank: Optional[int] = Field(default=None, description="Rank 1 is most suspicious", examples=[1])


# ---------------------------------------------------------------------------
# GroundTruth (gated)
# ---------------------------------------------------------------------------

class GroundTruth(BaseModel):
    model_config = ConfigDict(extra="allow")
    revealed: bool = Field(description="Whether ground truth is revealed at this frame - false before ground_truth_start", examples=[False])
    event: str = Field(description="Event Normal before reveal, attack name after", examples=["Normal"])
    attack_type: Optional[str] = Field(default=None, description="Attack type only when revealed, else None - future labels not exposed", examples=["Infiltration"])
    label_distribution: Optional[Dict[str, int]] = Field(default=None, description="Label distribution only when revealed, else None - gated to prevent leakage", examples=[{"BENIGN": 120, "Infiltration": 30}])
    label_distribution_current_frame: Optional[Dict[str, int]] = Field(default=None, description="Alias for label_distribution gated", examples=[None])
    true_malicious_count: Optional[int] = Field(default=None, description="True malicious count only when revealed, else None", examples=[30])
    true_malicious_ratio: Optional[float] = Field(default=None, description="True malicious ratio only when revealed, else None", examples=[0.2])
    frame: Optional[int] = Field(default=None, description="Frame index", examples=[5])
    timestamp: Optional[str] = Field(default=None, description="Timestamp", examples=["2017-07-03 16:40:57"])
    details: Optional[str] = Field(default=None, description="Details", examples=["No attack revealed yet - benign profile"])
    attack_started: Optional[bool] = Field(default=None, description="Whether attack has started", examples=[False])
    ground_truth_frame: Optional[int] = Field(default=None, description="Ground truth start frame", examples=[20])
    visible: Optional[bool] = Field(default=None, description="Visible alias for revealed", examples=[False])


# ---------------------------------------------------------------------------
# Forecast
# ---------------------------------------------------------------------------

class Forecast(BaseModel):
    model_config = ConfigDict(extra="allow")
    raw_risk: float = Field(description="Raw risk - learned malicious-risk probability", examples=[0.22])
    smoothed_risk: float = Field(description="Five-frame EWMA smoothed risk - not learned temporal world model", examples=[0.25])
    slope: float = Field(description="Five-frame risk slope - positive trend required for warning", examples=[0.015])
    warning: bool = Field(description="Warning threshold crossed before ground truth requires both smoothed risk and positive slope to cross frozen thresholds", examples=[False])
    threshold: float = Field(description="Frozen warning threshold chosen on Thursday validation 0.45", examples=[0.45])
    stage: str = Field(description="Stage estimate transparent evidence score - not calibrated model probability", examples=["Normal"])
    stage_evidence_score: Optional[str] = Field(default=None, description="Stage evidence score details with model-predicted ratio", examples=["Normal - observed evidence in frame (model-predicted ratio 0.03)"])
    target_ranking: List[TargetRankingEntry] = Field(description="NetworkX target-host ranking graph-ranked - not learned classifier", examples=[[{"host": "host-42", "target_score": 12.4}]])
    predicted_path: Optional[Dict[str, Any]] = Field(default=None, description="Predicted dashed edge for top target - purple for model prediction", examples=[{"source": "host-10", "target": "host-42", "status": "predicted", "style": "dashed"}])
    evidence: List[str] = Field(description="Deterministic observed evidence for active warning - model-predicted and observable only, never raw Label", examples=[["High SYN flag rate (mean 0.42)", "Predicted malicious ratio 0.06 model-predicted (threshold 0.45)"]])
    mitre: List[MitreTechnique] = Field(description="Pinned local MITRE ATT&CK mapping with cautious confidence - version 13.1", examples=[[{"technique_id": "T1046", "name": "Network Service Discovery"}]])
    engine_metadata: EngineMetadata = Field(description="Engine metadata including claim limitations")
    engineMetadata: Optional[EngineMetadata] = Field(default=None, description="Alias camelCase")
    targetRanking: Optional[List[TargetRankingEntry]] = Field(default=None, description="Alias camelCase")
    stage_estimate: Optional[str] = Field(default=None, description="Alias for stage")
    alpha: Optional[float] = Field(default=None, description="EWMA alpha", examples=[0.4])


# ---------------------------------------------------------------------------
# ScenarioFrame
# ---------------------------------------------------------------------------

class ScenarioFrame(BaseModel):
    model_config = ConfigDict(extra="allow")
    frame: int = Field(description="Frame index 0..29", examples=[5])
    frame_id: Optional[int] = Field(default=None, description="Alias for frame", examples=[5])
    timestamp: str = Field(description="Frame timestamp observed - chronological", examples=["2017-07-03 16:40:57"])
    timestamp_iso: Optional[str] = Field(default=None, description="ISO timestamp", examples=["2017-07-03T16:40:57"])
    flow_summary: FlowSummary = Field(description="Flow summary observed + model-predicted fields - no raw label counts before reveal")
    nodes: List[NetworkNode] = Field(description="Observed host-and-edge topology nodes - cyan for observed/healthy", examples=[[{"id": "host-1", "role": "workstation", "criticality": "low", "risk": 0.2, "status": "observed"}]])
    edges: List[NetworkEdge] = Field(description="Observed edges - dashed for predicted path, muted for removed simulated path")
    signals: Signals = Field(description="Temporal signals raw/smoothed/slope/warning - learned raw, rule-derived smoothed/slope")
    forecast: Forecast = Field(description="Forecast with stage, ranking, evidence, MITRE, engine metadata")
    stage: Optional[str] = Field(default=None, description="Alias stage estimate", examples=["Normal"])
    stage_estimate: Optional[str] = Field(default=None, description="Alias stage", examples=["Normal"])
    target_ranking: Optional[List[TargetRankingEntry]] = Field(default=None, description="Alias target ranking graph-ranked")
    predicted_path: Optional[Dict[str, Any]] = Field(default=None, description="Predicted dashed path for top target")
    evidence: Optional[List[str]] = Field(default=None, description="Observed evidence")
    mitre: Optional[List[MitreTechnique]] = Field(default=None, description="MITRE mapping")
    mitre_mapping: Optional[List[MitreTechnique]] = Field(default=None, description="Alias MITRE")
    ground_truth: GroundTruth = Field(description="Gated ground truth - revealed false before ground_truth_start hides label_distribution and attack_type")
    groundTruth: Optional[GroundTruth] = Field(default=None, description="Alias camelCase")


# ---------------------------------------------------------------------------
# Scenario summary / detail
# ---------------------------------------------------------------------------

class ScenarioSummary(BaseModel):
    model_config = ConfigDict(extra="allow")
    scenario_id: str = Field(description="Scenario ID", examples=["cyberworld-replay-v1"])
    id: Optional[str] = Field(default=None, description="Alias for scenario_id", examples=["cyberworld-replay-v1"])
    name: str = Field(description="Human readable name", examples=["CyberWorld Replay - Chronological CICIDS2017 Composite"])
    frame_count: int = Field(description="Number of frames approx 30", examples=[30])
    frames_count: Optional[int] = Field(default=None, description="Alias frame_count", examples=[30])
    duration: Optional[str] = Field(default=None, description="Duration description", examples=["~30 frames from 2017-07-03 to 2017-07-07"])
    disclosure: Optional[str] = Field(default=None, description="Composite/synthetic stitching disclosure", examples=["Composite/synthetic stitching disclosed: replay is deterministic composite..."])
    description: Optional[str] = Field(default=None, description="Description", examples=["Approximately 30-frame replay ..."])
    data_mode: Optional[str] = Field(default=None, description="Data mode synthetic|downloaded", examples=["synthetic"])
    created_at: Optional[str] = Field(default=None, description="Created at ISO", examples=["2026-09-01T14:57:44.637626+00:00"])


class ScenarioDetail(BaseModel):
    model_config = ConfigDict(extra="allow")
    scenario_id: str = Field(description="Scenario ID", examples=["cyberworld-replay-v1"])
    id: Optional[str] = Field(default=None, description="Alias", examples=["cyberworld-replay-v1"])
    name: str = Field(description="Human readable name", examples=["CyberWorld Replay - Chronological CICIDS2017 Composite"])
    description: Optional[str] = Field(default=None, description="Description", examples=["Approximately 30-frame replay ..."])
    created_at: Optional[str] = Field(default=None, description="Created at", examples=["2026-09-01T14:57:44.637626+00:00"])
    seed: Optional[int] = Field(default=None, description="Deterministic seed", examples=[42])
    frame_count: int = Field(description="Frame count approx 30", examples=[30])
    frames: List[ScenarioFrame] = Field(description="Replay frames with gated groundTruth - future labels not exposed")
    metadata: Dict[str, Any] = Field(description="Scenario metadata with disclosure, chronological, claim limitations", examples=[{"threshold": 0.45, "disclosure": "Composite/synthetic stitching disclosed..."}])
    engine_metadata: Optional[EngineMetadata] = Field(default=None, description="Engine metadata")
    engineMetadata: Optional[EngineMetadata] = Field(default=None, description="Alias camelCase")
    claim_limitations: Optional[str] = Field(default=None, description="Claim limitations", examples=["Binary benign-versus-malicious risk only..."])
    provenance: Optional[Dict[str, Any]] = Field(default=None, description="Provenance source_url, data_mode, seed, threshold")


# ---------------------------------------------------------------------------
# EvaluationMetrics
# ---------------------------------------------------------------------------

class Samples(BaseModel):
    model_config = ConfigDict(extra="allow")
    train: int = Field(description="Train samples Tue+Wed", examples=[2306])
    validation: int = Field(description="Validation samples Thu", examples=[1053])
    test: int = Field(description="Test samples Fri sealed holdout", examples=[953])
    monday: Optional[int] = Field(default=None, description="Monday benign baseline", examples=[1153])


class ConfusionMatrix(BaseModel):
    model_config = ConfigDict(extra="allow")
    tn: Optional[int] = Field(default=None, description="True negatives", examples=[386])
    fp: Optional[int] = Field(default=None, description="False positives", examples=[5])
    fn: Optional[int] = Field(default=None, description="False negatives", examples=[143])
    tp: Optional[int] = Field(default=None, description="True positives", examples=[419])


class Latency(BaseModel):
    model_config = ConfigDict(extra="allow")
    p50_ms: Optional[float] = Field(default=None, description="p50 latency ms", examples=[12.2])
    p95_ms: float = Field(description="p95 latency ms must be <500ms", examples=[13.8])
    mean_ms: Optional[float] = Field(default=None, description="Mean latency ms", examples=[12.7])
    p50: Optional[float] = Field(default=None, description="Alias p50", examples=[12.2])
    p95: Optional[float] = Field(default=None, description="Alias p95", examples=[13.8])
    mean: Optional[float] = Field(default=None, description="Alias mean", examples=[12.7])
    samples: Optional[int] = Field(default=None, description="Latency samples", examples=[100])
    unit: Optional[str] = Field(default=None, description="Unit ms", examples=["ms"])


class EvaluationMetrics(BaseModel):
    model_config = ConfigDict(extra="allow", protected_namespaces=())
    model_family: str = Field(description="Model family random_forest|logistic_regression", examples=["random_forest"])
    model_version: Optional[str] = Field(default=None, description="Model version", examples=["phase04-v1"])
    version: Optional[str] = Field(default=None, description="Alias version", examples=["phase04-v1"])
    seed: Optional[int] = Field(default=None, description="Seed 42 deterministic", examples=[42])
    feature_count: Optional[int] = Field(default=None, description="Feature count", examples=[80])
    feature_schema_version: Optional[str] = Field(default=None, description="Feature schema version", examples=["phase03-v1-sealed"])
    samples: Samples = Field(description="Samples split provenance - chronological Mon baseline, Tue-Wed train, Thu val, Fri test")
    splits: Optional[Dict[str, Any]] = Field(default=None, description="Splits detail", examples=[{"train": {"days": ["tuesday", "wednesday"]}}])
    split: Optional[Dict[str, Any]] = Field(default=None, description="Alias splits")
    split_provenance: Optional[str] = Field(default=None, description="Split provenance text", examples=["Monday benign baseline only, Tuesday+Wednesday train, ..."])
    hyperparameters: Optional[Dict[str, Any]] = Field(default=None, description="Hyperparameters", examples=[{"n_estimators": 100}])
    threshold: float = Field(description="Frozen warning threshold", examples=[0.45])
    selection_score: Optional[float] = Field(default=None, description="Selection score = validation macro-F1 - 0.5*FPR", examples=[0.84])
    validation_metrics: Optional[Dict[str, Any]] = Field(default=None, description="Validation metrics")
    test_metrics: Optional[Dict[str, Any]] = Field(default=None, description="Test metrics")
    precision: Dict[str, Any] = Field(description="Precision per-class and macro", examples=[{"benign": 0.93, "malicious": 0.98, "macro": 0.95}])
    recall: Dict[str, Any] = Field(description="Recall per-class and macro, attack_recall", examples=[{"benign": 0.98, "malicious": 0.74, "macro": 0.86}])
    f1: Dict[str, Any] = Field(description="F1 per-class and macro, benign vs malicious", examples=[{"benign": 0.83, "malicious": 0.84, "macro": 0.84}])
    fpr: float = Field(description="False positive rate must be <=0.05", examples=[0.012])
    roc_auc: float = Field(description="ROC-AUC measured", examples=[0.78])
    pr_auc: float = Field(description="PR-AUC measured", examples=[0.89])
    average_precision: Optional[float] = Field(default=None, description="Alias PR-AUC", examples=[0.89])
    accuracy: Optional[float] = Field(default=None, description="Accuracy", examples=[0.84])
    confusion_matrix: List[List[int]] = Field(description="Confusion matrix 2x2 [[TN,FP],[FN,TP]]", examples=[[[386, 5], [143, 419]]])
    pr_curve: Optional[Dict[str, Any]] = Field(default=None, description="PR curve points", examples=[{"precision": [0.5], "recall": [0.5]}])
    roc_curve: Optional[Dict[str, Any]] = Field(default=None, description="ROC curve points")
    importance: Optional[Dict[str, Any]] = Field(default=None, description="Global feature importance Random Forest not causal")
    feature_importance: Optional[Dict[str, Any]] = Field(default=None, description="Alias importance")
    latency: Latency = Field(description="Latency measured p95 <500ms")
    latency_ms: Optional[Latency] = Field(default=None, description="Alias latency")
    provenance: Optional[Dict[str, Any]] = Field(default=None, description="Provenance data_mode, source_url, seed")
    data_mode: Optional[str] = Field(default=None, description="Data mode synthetic", examples=["synthetic"])
    claim_limitations: str = Field(description="Claim limitations measured, predicted, rule-derived, graph-ranked, simulated with different labels", examples=["Binary benign-versus-malicious risk only (learned); ..."])
    limitations: Optional[str] = Field(default=None, description="Alias claim_limitations")
    target_gates: Optional[Dict[str, Any]] = Field(default=None, description="Target gates honest reporting measured values shown; claims not inflated", examples=[{"f1_ge_0.90": False}])
    honest_metrics: Optional[Dict[str, Any]] = Field(default=None, description="Honest metrics true values")
    engine_metadata: Optional[EngineMetadata] = Field(default=None, description="Engine metadata embedded")


# ---------------------------------------------------------------------------
# Forecast request/response
# ---------------------------------------------------------------------------

class ForecastRequest(BaseModel):
    model_config = ConfigDict(extra="allow", populate_by_name=True)
    scenario_id: Optional[str] = Field(
        default=None,
        description="Scenario ID - must exist (404 if not)",
        examples=["cyberworld-replay-v1"],
        validation_alias="scenario_id",
    )
    frame_id: Optional[int] = Field(
        default=None,
        ge=0,
        le=29,
        description="Frame ID 0..29 inclusive (422 if out of range)",
        examples=[5],
        validation_alias="frame_id",
    )
    scenario: Optional[str] = Field(
        default=None,
        description="Alternative alias for scenario_id",
        examples=["cyberworld-replay-v1"],
    )
    frame: Optional[int] = Field(
        default=None,
        ge=0,
        le=29,
        description="Alternative alias for frame_id",
        examples=[5],
    )


class ForecastResponse(BaseModel):
    model_config = ConfigDict(extra="allow")
    scenario_id: str = Field(description="Scenario ID", examples=["cyberworld-replay-v1"])
    frame_id: int = Field(description="Frame ID", examples=[5])
    forecast: Forecast = Field(description="Forecast with raw/smoothed/slope/stage/ranking/evidence/MITRE/engine metadata")
    ground_truth: GroundTruth = Field(description="Gated ground truth - revealed false hides label_distribution before correct frame")
    groundTruth: Optional[GroundTruth] = Field(default=None, description="Alias camelCase")
    signals: Optional[Signals] = Field(default=None, description="Signals raw/smoothed/slope/warning")
    flow_summary: Optional[FlowSummary] = Field(default=None, description="Flow summary observed + model-predicted")
    nodes: Optional[List[NetworkNode]] = Field(default=None, description="Nodes observed")
    edges: Optional[List[NetworkEdge]] = Field(default=None, description="Edges observed")
    engine_metadata: Optional[EngineMetadata] = Field(default=None, description="Engine metadata")
    timestamp: Optional[str] = Field(default=None, description="Timestamp")


# ---------------------------------------------------------------------------
# Simulation
# ---------------------------------------------------------------------------

class SimulationRequest(BaseModel):
    model_config = ConfigDict(extra="allow", populate_by_name=True)
    scenario_id: Optional[str] = Field(default=None, description="Scenario ID must exist (404 if not)", examples=["cyberworld-replay-v1"])
    frame_id: Optional[int] = Field(default=None, ge=0, le=29, description="Frame ID 0..29 (422 if out of range)", examples=[10])
    scenario: Optional[str] = Field(default=None, description="Alias for scenario_id", examples=["cyberworld-replay-v1"])
    frame: Optional[int] = Field(default=None, ge=0, le=29, description="Alias for frame_id", examples=[10])
    host: str = Field(description="Host to isolate - must exist in frame nodes (422 if not)", examples=["host-42"])
    action: str = Field(description="Action must be isolate_host (422 if unsupported)", examples=["isolate_host"])


class SimulationBeforeAfter(BaseModel):
    model_config = ConfigDict(extra="allow")
    raw_risk: float = Field(description="Raw risk learned", examples=[0.55])
    smoothed_risk: float = Field(description="Smoothed risk rule-derived", examples=[0.5])
    slope: float = Field(description="Slope", examples=[0.02])
    warning: bool = Field(description="Warning flag", examples=[True])
    stage: str = Field(description="Stage estimate", examples=["Credential Attack"])
    target_ranking: Optional[List[TargetRankingEntry]] = Field(default=None, description="Target ranking graph-ranked")
    evidence: Optional[List[str]] = Field(default=None, description="Evidence")
    mitre: Optional[List[MitreTechnique]] = Field(default=None, description="MITRE")


class SimulationDeltas(BaseModel):
    model_config = ConfigDict(extra="allow")
    raw_risk_delta: float = Field(description="Delta after-before raw risk (after minus before)", examples=[-0.2])
    smoothed_risk_delta: float = Field(description="Delta smoothed risk", examples=[-0.15])
    slope_delta: Optional[float] = Field(default=None, description="Slope delta", examples=[-0.01])
    stage_changed: Optional[bool] = Field(default=None, description="Whether stage changed", examples=[True])
    risk_reduction_percent: Optional[float] = Field(default=None, description="Risk reduction percent", examples=[36.0])


class SimulationResult(BaseModel):
    model_config = ConfigDict(extra="allow")
    scenario_id: str = Field(description="Scenario ID", examples=["cyberworld-replay-v1"])
    frame_id: int = Field(description="Frame ID", examples=[10])
    host: str = Field(description="Host isolated (observed state) - host alias safe, never raw IP", examples=["host-42"])
    action: str = Field(description="Action performed isolate_host", examples=["isolate_host"])
    before: SimulationBeforeAfter = Field(description="Before isolation forecast - observed/predicted state")
    after: SimulationBeforeAfter = Field(description="After isolation forecast - simulated state orange for simulation, muted edge for removed simulated path")
    removed_edges: List[NetworkEdge] = Field(description="Removed or down-weighted suspicious host active edges - muted edge style")
    deltas: SimulationDeltas = Field(description="Deltas before/after")
    limitations: str = Field(description="Limitations must contain 'Estimated simulated effect - not causal proof'", examples=["Estimated simulated effect - not causal proof. Binary benign-versus-malicious risk only; isolation is simulated estimate - not causal proof; recalculated graph features and risk inputs via same pipeline. Original replay unchanged."])
    label: str = Field(description="Label must be 'Estimated simulated effect - not causal proof'", examples=["Estimated simulated effect - not causal proof"])
    message: Optional[str] = Field(default=None, description="Message alias for label", examples=["Estimated simulated effect - not causal proof"])
    engine_metadata: Optional[EngineMetadata] = Field(default=None, description="Engine metadata")
    original_unchanged: Optional[bool] = Field(default=True, description="Whether original replay remains unchanged after simulation (immutable)")


# ---------------------------------------------------------------------------
# Error models
# ---------------------------------------------------------------------------

class ErrorResponse(BaseModel):
    model_config = ConfigDict(extra="allow")
    detail: str = Field(description="Error detail - structured", examples=["Scenario not found: invalid-id"])
    code: Optional[str] = Field(default=None, description="Error code", examples=["not_found"])
    status_code: Optional[int] = Field(default=None, description="HTTP status", examples=[404])
