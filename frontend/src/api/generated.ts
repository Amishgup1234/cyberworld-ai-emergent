// Auto-generated from FastAPI OpenAPI - do not edit manually
// Generated at 2026-09-01T18:38:31.822630+00:00 from backend Pydantic contracts
// Source: FastAPI app.openapi() - single source of truth
// Distinguishes observed/predicted/simulated states with different labels and styles

/* eslint-disable */
// @ts-nocheck - auto-generated

// Utility helper for nullable
export type Nullable<T> = T | null;

/** Metadata about the model engine, data mode, and claim limitations. */
export interface EngineMetadata {
  /** Model family - learned component (random_forest or logistic_regression) */
  model_family?: string;
  /** Model version identifier */
  model_version?: string;
  /** Data mode - synthetic or downloaded */
  data_mode?: string;
  /** Feature schema version */
  feature_schema_version?: string;
  /** Number of model features (ordered) */
  feature_count?: number;
  /** Claim limitations - distinguishes learned, rule-derived, graph-ranked, simulated, and measured */
  claim_limitations?: string;
  /** Warning threshold chosen on Thursday validation (frozen) */
  threshold?: number | any;
  /** Pinned MITRE ATT&CK version */
  mitre_version?: string | any;
  /** Application version */
  version?: string | any;
  /** Dataset source URL */
  data_source_url?: string | any;
  [key: string]: any;
}

export interface EvaluationMetrics {
  /** Model family random_forest|logistic_regression */
  model_family: string;
  /** Model version */
  model_version?: string | any;
  /** Alias version */
  version?: string | any;
  /** Seed 42 deterministic */
  seed?: number | any;
  /** Feature count */
  feature_count?: number | any;
  /** Feature schema version */
  feature_schema_version?: string | any;
  /** Samples split provenance - chronological Mon baseline, Tue-Wed train, Thu val, Fri test */
  samples: Samples;
  /** Splits detail */
  splits?: Record<string, any> | any;
  /** Alias splits */
  split?: Record<string, any> | any;
  /** Split provenance text */
  split_provenance?: string | any;
  /** Hyperparameters */
  hyperparameters?: Record<string, any> | any;
  /** Frozen warning threshold */
  threshold: number;
  /** Selection score = validation macro-F1 - 0.5*FPR */
  selection_score?: number | any;
  /** Validation metrics */
  validation_metrics?: Record<string, any> | any;
  /** Test metrics */
  test_metrics?: Record<string, any> | any;
  /** Precision per-class and macro */
  precision: Record<string, any>;
  /** Recall per-class and macro, attack_recall */
  recall: Record<string, any>;
  /** F1 per-class and macro, benign vs malicious */
  f1: Record<string, any>;
  /** False positive rate must be <=0.05 */
  fpr: number;
  /** ROC-AUC measured */
  roc_auc: number;
  /** PR-AUC measured */
  pr_auc: number;
  /** Alias PR-AUC */
  average_precision?: number | any;
  /** Accuracy */
  accuracy?: number | any;
  /** Confusion matrix 2x2 [[TN,FP],[FN,TP]] */
  confusion_matrix: number[][];
  /** PR curve points */
  pr_curve?: Record<string, any> | any;
  /** ROC curve points */
  roc_curve?: Record<string, any> | any;
  /** Global feature importance Random Forest not causal */
  importance?: Record<string, any> | any;
  /** Alias importance */
  feature_importance?: Record<string, any> | any;
  /** Latency measured p95 <500ms */
  latency: Latency;
  /** Alias latency */
  latency_ms?: Latency | any;
  /** Provenance data_mode, source_url, seed */
  provenance?: Record<string, any> | any;
  /** Data mode synthetic */
  data_mode?: string | any;
  /** Claim limitations measured, predicted, rule-derived, graph-ranked, simulated with different labels */
  claim_limitations: string;
  /** Alias claim_limitations */
  limitations?: string | any;
  /** Target gates honest reporting measured values shown; claims not inflated */
  target_gates?: Record<string, any> | any;
  /** Honest metrics true values */
  honest_metrics?: Record<string, any> | any;
  /** Engine metadata embedded */
  engine_metadata?: EngineMetadata | any;
  [key: string]: any;
}

export interface FlowSummary {
  /** Total flows in frame (observed) */
  total_flows: number;
  /** Alias for total_flows */
  flow_count?: number | any;
  /** Distinct destination hosts observed */
  distinct_dest_ips: number;
  /** Distinct destination ports observed */
  distinct_ports: number;
  /** Mean Flow Bytes/s observed */
  avg_bytes_per_sec?: number | any;
  /** Mean Flow Packets/s observed */
  avg_packets_per_sec?: number | any;
  /** Predicted malicious count model-predicted (threshold 0.45, 80 features) - not label-derived */
  predicted_malicious_count: number;
  /** Predicted malicious ratio model-predicted - not label-derived */
  predicted_malicious_ratio: number;
  /** Source label for predicted fields */
  predicted_source?: string | any;
  /** Threshold used */
  threshold?: number | any;
  /** Timestamp observed */
  timestamp?: string | any;
  /** ISO timestamp */
  timestamp_iso?: string | any;
  [key: string]: any;
}

export interface Forecast {
  /** Raw risk - learned malicious-risk probability */
  raw_risk: number;
  /** Five-frame EWMA smoothed risk - not learned temporal world model */
  smoothed_risk: number;
  /** Five-frame risk slope - positive trend required for warning */
  slope: number;
  /** Warning threshold crossed before ground truth requires both smoothed risk and positive slope to cross frozen thresholds */
  warning: boolean;
  /** Frozen warning threshold chosen on Thursday validation 0.45 */
  threshold: number;
  /** Stage estimate transparent evidence score - not calibrated model probability */
  stage: string;
  /** Stage evidence score details with model-predicted ratio */
  stage_evidence_score?: string | any;
  /** NetworkX target-host ranking graph-ranked - not learned classifier */
  target_ranking: TargetRankingEntry[];
  /** Predicted dashed edge for top target - purple for model prediction */
  predicted_path?: Record<string, any> | any;
  /** Deterministic observed evidence for active warning - model-predicted and observable only, never raw Label */
  evidence: string[];
  /** Pinned local MITRE ATT&CK mapping with cautious confidence - version 13.1 */
  mitre: MitreTechnique[];
  /** Engine metadata including claim limitations */
  engine_metadata: EngineMetadata;
  /** Alias camelCase */
  engineMetadata?: EngineMetadata | any;
  /** Alias camelCase */
  targetRanking?: TargetRankingEntry[] | any;
  /** Alias for stage */
  stage_estimate?: string | any;
  /** EWMA alpha */
  alpha?: number | any;
  [key: string]: any;
}

export interface ForecastRequest {
  /** Scenario ID - must exist (404 if not) */
  scenario_id?: string | any;
  /** Frame ID 0..29 inclusive (422 if out of range) */
  frame_id?: number | any;
  /** Alternative alias for scenario_id */
  scenario?: string | any;
  /** Alternative alias for frame_id */
  frame?: number | any;
  [key: string]: any;
}

export interface ForecastResponse {
  /** Scenario ID */
  scenario_id: string;
  /** Frame ID */
  frame_id: number;
  /** Forecast with raw/smoothed/slope/stage/ranking/evidence/MITRE/engine metadata */
  forecast: Forecast;
  /** Gated ground truth - revealed false hides label_distribution before correct frame */
  ground_truth: GroundTruth;
  /** Alias camelCase */
  groundTruth?: GroundTruth | any;
  /** Signals raw/smoothed/slope/warning */
  signals?: Signals | any;
  /** Flow summary observed + model-predicted */
  flow_summary?: FlowSummary | any;
  /** Nodes observed */
  nodes?: NetworkNode[] | any;
  /** Edges observed */
  edges?: NetworkEdge[] | any;
  /** Engine metadata */
  engine_metadata?: EngineMetadata | any;
  /** Timestamp */
  timestamp?: string | any;
  [key: string]: any;
}

export interface GroundTruth {
  /** Whether ground truth is revealed at this frame - false before ground_truth_start */
  revealed: boolean;
  /** Event Normal before reveal, attack name after */
  event: string;
  /** Attack type only when revealed, else None - future labels not exposed */
  attack_type?: string | any;
  /** Label distribution only when revealed, else None - gated to prevent leakage */
  label_distribution?: Record<string, number> | any;
  /** Alias for label_distribution gated */
  label_distribution_current_frame?: Record<string, number> | any;
  /** True malicious count only when revealed, else None */
  true_malicious_count?: number | any;
  /** True malicious ratio only when revealed, else None */
  true_malicious_ratio?: number | any;
  /** Frame index */
  frame?: number | any;
  /** Timestamp */
  timestamp?: string | any;
  /** Details */
  details?: string | any;
  /** Whether attack has started */
  attack_started?: boolean | any;
  /** Ground truth start frame */
  ground_truth_frame?: number | any;
  /** Visible alias for revealed */
  visible?: boolean | any;
  [key: string]: any;
}

export interface HTTPValidationError {
  detail?: ValidationError[];
}

export interface HealthResponse {
  /** Health status ok */
  status: string;
  /** Engine state - trained or not-trained */
  engine: string;
  /** Model family when trained */
  model_family?: string | any;
  /** Data mode */
  data_mode?: string | any;
  /** App version */
  version?: string | any;
  /** Human readable message */
  message?: string | any;
  /** Feature count when trained */
  feature_count?: number | any;
  /** Warning threshold */
  threshold?: number | any;
  /** Claim limitations */
  claim_limitations?: string | any;
  /** Full engine metadata */
  engine_metadata?: EngineMetadata | any;
  [key: string]: any;
}

export interface Latency {
  /** p50 latency ms */
  p50_ms?: number | any;
  /** p95 latency ms must be <500ms */
  p95_ms: number;
  /** Mean latency ms */
  mean_ms?: number | any;
  /** Alias p50 */
  p50?: number | any;
  /** Alias p95 */
  p95?: number | any;
  /** Alias mean */
  mean?: number | any;
  /** Latency samples */
  samples?: number | any;
  /** Unit ms */
  unit?: string | any;
  [key: string]: any;
}

export interface MitreTechnique {
  /** MITRE technique ID pinned local mapping */
  technique_id: string;
  /** Technique name */
  name: string;
  /** Evidence rule - cautious wording */
  evidence_rule: string;
  /** Cautious confidence wording - not causal proof */
  confidence: string;
  /** Stage mapping */
  stage?: string | any;
  [key: string]: any;
}

export interface NetworkEdge {
  /** Source host alias (observed) */
  source: string;
  /** Target host alias (observed) */
  target: string;
  /** Protocol TCP|UDP|ICMP */
  protocol: string;
  /** Protocols list */
  protocols?: string[] | any;
  /** Observed activity count in frame (observed) */
  activity: number;
  /** Edge novelty 0..1 graph-derived */
  novelty: number;
  /** Status - observed for real, predicted for dashed predicted path, simulated/removed for isolation */
  status: string;
  /** Frame first seen */
  first_seen?: number | any;
  /** Frame last seen */
  last_seen?: number | any;
  [key: string]: any;
}

export interface NetworkNode {
  /** Safe alias for host - e.g., host-1, never raw IP */
  id: string;
  /** Alias identical to id for safe display */
  alias: string;
  /** Safe alias duplicate */
  safe_alias?: string | any;
  /** Host role - observed */
  role: string;
  /** Asset criticality low|medium|high */
  criticality: string;
  /** Numeric criticality 1|2|3 */
  criticality_numeric?: number | any;
  /** Observed state - observed or suspicious */
  observed_state: string;
  /** Host risk score observed/predicted */
  risk: number;
  /** Status - observed for real topology, predicted for forecast path, simulated for isolation */
  status: string;
  /** Frame first seen */
  first_seen?: number | any;
  [key: string]: any;
}

export interface Samples {
  /** Train samples Tue+Wed */
  train: number;
  /** Validation samples Thu */
  validation: number;
  /** Test samples Fri sealed holdout */
  test: number;
  /** Monday benign baseline */
  monday?: number | any;
  [key: string]: any;
}

export interface ScenarioDetail {
  /** Scenario ID */
  scenario_id: string;
  /** Alias */
  id?: string | any;
  /** Human readable name */
  name: string;
  /** Description */
  description?: string | any;
  /** Created at */
  created_at?: string | any;
  /** Deterministic seed */
  seed?: number | any;
  /** Frame count approx 30 */
  frame_count: number;
  /** Replay frames with gated groundTruth - future labels not exposed */
  frames: ScenarioFrame[];
  /** Scenario metadata with disclosure, chronological, claim limitations */
  metadata: Record<string, any>;
  /** Engine metadata */
  engine_metadata?: EngineMetadata | any;
  /** Alias camelCase */
  engineMetadata?: EngineMetadata | any;
  /** Claim limitations */
  claim_limitations?: string | any;
  /** Provenance source_url, data_mode, seed, threshold */
  provenance?: Record<string, any> | any;
  [key: string]: any;
}

export interface ScenarioFrame {
  /** Frame index 0..29 */
  frame: number;
  /** Alias for frame */
  frame_id?: number | any;
  /** Frame timestamp observed - chronological */
  timestamp: string;
  /** ISO timestamp */
  timestamp_iso?: string | any;
  /** Flow summary observed + model-predicted fields - no raw label counts before reveal */
  flow_summary: FlowSummary;
  /** Observed host-and-edge topology nodes - cyan for observed/healthy */
  nodes: NetworkNode[];
  /** Observed edges - dashed for predicted path, muted for removed simulated path */
  edges: NetworkEdge[];
  /** Temporal signals raw/smoothed/slope/warning - learned raw, rule-derived smoothed/slope */
  signals: Signals;
  /** Forecast with stage, ranking, evidence, MITRE, engine metadata */
  forecast: Forecast;
  /** Alias stage estimate */
  stage?: string | any;
  /** Alias stage */
  stage_estimate?: string | any;
  /** Alias target ranking graph-ranked */
  target_ranking?: TargetRankingEntry[] | any;
  /** Predicted dashed path for top target */
  predicted_path?: Record<string, any> | any;
  /** Observed evidence */
  evidence?: string[] | any;
  /** MITRE mapping */
  mitre?: MitreTechnique[] | any;
  /** Alias MITRE */
  mitre_mapping?: MitreTechnique[] | any;
  /** Gated ground truth - revealed false before ground_truth_start hides label_distribution and attack_type */
  ground_truth: GroundTruth;
  /** Alias camelCase */
  groundTruth?: GroundTruth | any;
  [key: string]: any;
}

export interface ScenarioSummary {
  /** Scenario ID */
  scenario_id: string;
  /** Alias for scenario_id */
  id?: string | any;
  /** Human readable name */
  name: string;
  /** Number of frames approx 30 */
  frame_count: number;
  /** Alias frame_count */
  frames_count?: number | any;
  /** Duration description */
  duration?: string | any;
  /** Composite/synthetic stitching disclosure */
  disclosure?: string | any;
  /** Description */
  description?: string | any;
  /** Data mode synthetic|downloaded */
  data_mode?: string | any;
  /** Created at ISO */
  created_at?: string | any;
  [key: string]: any;
}

export interface Signals {
  /** Raw risk probability - learned (Random Forest) */
  raw_risk: number;
  /** Five-frame EWMA smoothed risk (alpha 0.4) - rule-derived */
  smoothed_risk: number;
  /** Five-frame risk slope - rule-derived */
  slope: number;
  /** Early warning requires smoothed>threshold and positive slope */
  warning: boolean;
  /** Frozen warning threshold from validation */
  threshold: number;
  /** EWMA alpha */
  alpha?: number | any;
  [key: string]: any;
}

export interface SimulationBeforeAfter {
  /** Raw risk learned */
  raw_risk: number;
  /** Smoothed risk rule-derived */
  smoothed_risk: number;
  /** Slope */
  slope: number;
  /** Warning flag */
  warning: boolean;
  /** Stage estimate */
  stage: string;
  /** Target ranking graph-ranked */
  target_ranking?: TargetRankingEntry[] | any;
  /** Evidence */
  evidence?: string[] | any;
  /** MITRE */
  mitre?: MitreTechnique[] | any;
  [key: string]: any;
}

export interface SimulationDeltas {
  /** Delta after-before raw risk (after minus before) */
  raw_risk_delta: number;
  /** Delta smoothed risk */
  smoothed_risk_delta: number;
  /** Slope delta */
  slope_delta?: number | any;
  /** Whether stage changed */
  stage_changed?: boolean | any;
  /** Risk reduction percent */
  risk_reduction_percent?: number | any;
  [key: string]: any;
}

export interface SimulationRequest {
  /** Scenario ID must exist (404 if not) */
  scenario_id?: string | any;
  /** Frame ID 0..29 (422 if out of range) */
  frame_id?: number | any;
  /** Alias for scenario_id */
  scenario?: string | any;
  /** Alias for frame_id */
  frame?: number | any;
  /** Host to isolate - must exist in frame nodes (422 if not) */
  host: string;
  /** Action must be isolate_host (422 if unsupported) */
  action: string;
  [key: string]: any;
}

export interface SimulationResult {
  /** Scenario ID */
  scenario_id: string;
  /** Frame ID */
  frame_id: number;
  /** Host isolated (observed state) - host alias safe, never raw IP */
  host: string;
  /** Action performed isolate_host */
  action: string;
  /** Before isolation forecast - observed/predicted state */
  before: SimulationBeforeAfter;
  /** After isolation forecast - simulated state orange for simulation, muted edge for removed simulated path */
  after: SimulationBeforeAfter;
  /** Removed or down-weighted suspicious host active edges - muted edge style */
  removed_edges: NetworkEdge[];
  /** Deltas before/after */
  deltas: SimulationDeltas;
  /** Limitations must contain 'Estimated simulated effect - not causal proof' */
  limitations: string;
  /** Label must be 'Estimated simulated effect - not causal proof' */
  label: string;
  /** Message alias for label */
  message?: string | any;
  /** Engine metadata */
  engine_metadata?: EngineMetadata | any;
  /** Whether original replay remains unchanged after simulation (immutable) */
  original_unchanged?: boolean | any;
  [key: string]: any;
}

export interface TargetRankingEntry {
  /** Target host alias graph-ranked */
  host: string;
  /** Alias duplicate */
  alias?: string | any;
  /** Graph-ranked score = suspicious incoming * edge novelty * recent risk trend * asset criticality */
  target_score: number;
  /** Suspicious incoming activity observed */
  incoming_activity: number;
  /** Average edge novelty graph-derived */
  edge_novelty: number;
  /** Recent risk trend from EWMA */
  recent_risk_trend: number;
  /** Asset criticality low|medium|high */
  asset_criticality: string;
  /** Numeric criticality */
  criticality_numeric?: number | any;
  /** Role */
  role?: string | any;
  /** Rank 1 is most suspicious */
  rank?: number | any;
  [key: string]: any;
}

export interface ValidationError {
  loc: string | number[];
  msg: string;
  type: string;
}

// ---------------------------------------------------------------------------
// API route helpers - generated from OpenAPI paths
// ---------------------------------------------------------------------------
// POST /api/v1/forecast [forecast] - Get forecast for a frame
// GET /api/v1/health [health] - Health check with engine metadata
// GET /api/v1/metrics [metrics] - Get evaluation metrics with engine metadata
// GET /api/v1/scenarios [scenarios] - List available scenarios
// GET /api/v1/scenarios/{scenario_id} [scenarios] - Get scenario details
// POST /api/v1/simulate/isolate-host [simulation] - Isolate suspicious host (simulated)

// Generated API paths for reference
export const API_PATHS = {
  API_V1_FORECAST: "/api/v1/forecast",
  API_V1_HEALTH: "/api/v1/health",
  API_V1_METRICS: "/api/v1/metrics",
  API_V1_SCENARIOS: "/api/v1/scenarios",
  API_V1_SCENARIOS_SCENARIO_ID: "/api/v1/scenarios/{scenario_id}",
  API_V1_SIMULATE_ISOLATE_HOST: "/api/v1/simulate/isolate-host",
} as const;

// Engine metadata type alias for convenience
export type EngineState = "observed" | "predicted" | "simulated" | "ground_truth";
