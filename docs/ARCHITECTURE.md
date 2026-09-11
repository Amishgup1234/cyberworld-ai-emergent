# Architecture - CyberWorld AI - Final Product Experience

## System Diagram (text)
```
[ CICIDS2017 MachineLearningCSV ] --audit--> [data/reports/data_quality.json/.md]
         | (Tue-Wed train, Thu val, Fri sealed test, Mon baseline)
         v
[ Phase03 Preprocessing ] --train-only state--> [artifacts/feature_schema.json] (RobustScaler, medians, clip_bounds q01/q99)
         | (80 ordered features, leakage-safe)
         v
[ Phase04 Model Training ] --grid + validation macro-F1 -0.5*FPR--> [artifacts/risk_model.joblib + metrics.json]
         | (RF 100 trees, balanced_subsample, threshold 0.45 frozen)
         v
[ Phase05 Replay Engine (scenario.py) ] --seed 42, same pipeline-->
    +-- chronological stitching ~30 frames (182 flows/frame avg, 5465 total, 2017-07-03..07-07)
    +-- per-frame: timestamp | observed nodes/edges (safe host-N) | flow_summary (predicted_* model-predicted) | signals raw/smoothed/slope/warning (EWMA alpha0.4, 5-frame) | forecast stage/evidence/target_ranking/predicted_path/mitre/engine_metadata | gated ground_truth (hidden until frame20)
    +-- NetworkX target ranking: (incoming+1)*novelty*risk_trend*criticality
    +-- disclosure + claim_limitations
         |
         +--> [data/demo/cyberworld_replay.json] (API fixture, 30 frames)
         +--> [frontend/public/offline_bundle.json] (same engine, bundle_type offline, 30 frames byte-identical)
                 |
[ FastAPI Backend (app/main.py) ] --lifespan load_state once--+
    |                                                          |
    GET /api/v1/health (engine not-trained/trained)            |
    GET /api/v1/metrics (metrics.json)                         |
    GET /api/v1/scenarios + /{id} (scenario)                   |
    POST /api/v1/forecast (frame_id, gated ground_truth)        |
    POST /api/v1/simulate/isolate-host (deepcopy, mutate edges, re-rank, deltas) --validation 422-->
    |                                                          |
[ Frontend React (Vite) ] <---- fetch /api/v1/* ---------------+-- fallback to offline_bundle.json
    |  health-check @ startup (2s timeout, isBackendHealthy checks status ok && engine trained)
    |  API mode -> live calls; Offline Mode -> offline_bundle + offlineSimulateIsolation (same formula, factor table)
    |  visible banner: API Mode (cyan) vs Offline Mode (orange, with truthful reason)
    |
    Full-screen Analysis Command Centre (1280x720 and 1440x900 responsive, Tailwind, 65/35)
    +-- CommandBar: title CYBERWORLD AI, SOC-v3.1, API/Offline badges, dataset badge, help
    +-- AnalysisProgress: Analysis Session, Analysis Progress Pause/Continue/Restart Analysis, speed 0.5x/1x/2x (Space/R/Arrow, milestone nav Baseline/Emerging/Warning/Confirmation), slider 0..29, progress, chronological no WebSocket, auto-start and pause at warning 8 and confirmation 20 via useAnalysisSession
    +-- AnalysisStatus: Baseline/Emerging risk/Early warning/Response/Confirmation phases with icons/colors, reduced-motion
    +-- Grid 65/35: Topology left (React Flow, motion for analysis/observed/predicted/warning/confirmation, reduced-motion, safe host-N) + Decision Rail right (RiskCard learned, StagePanel rule-derived, TargetPanel graph-ranked, PreventiveActionPanel with recommended host and prominent Simulate Preventive Action)
    +-- ThreatExplanation: consolidated risk/stage/target/evidence/MITRE with distinct Learned/Rule-derived/Graph-ranked/Measured/Simulated badges, data-derived, not hardcoded
    +-- RiskChart (Recharts, raw cyan, smoothed purple, threshold orange dashed, warning coral) + TrajectoryPanel
    +-- TechnicalProofDrawer: expandable (aria-expanded, focus ring, Escape, reduced-motion) wrapping WorkspaceTabs (Evidence/MITRE/Simulation/Metrics/Trajectory) + detailed evidence vs importance, MITRE 13.1, honest metrics, method/limitations, same interface
    +-- GroundTruth (gated reveal at 20, attack_type Infiltration, coral) + Flow Summary (observed + predicted separate) + EngineMetadata + Footer legend (color never alone, motion, reduced-motion)
```

Reliability states: Loading (spinner Starting CyberWorld AI... + health message) | Empty (0 frames) | Invalid-data (missing fields validation) | Backend-down (Failed to Load Scenario, offline_bundle hint) | Reset (Restart Analysis + Clear simulation).

## Data Flow - 11-step final acceptance story (analyze, explain, respond)
```
1 Baseline (frames 0-2 smoothed 0.21 <0.45, stage Normal, no warning, ground truth hidden, analysis session auto-starts, threat explanation shows baseline)
2 Analysis Session begins automatically (analysis progress Pause/Continue/Restart Analysis, milestone nav Baseline/Emerging/Warning/Confirmation, speed 0.5x/1x/2x, Space/R/Arrow, client timing, no WebSocket, auto-pauses at warning)
3 Observed behavior changes (port diversity, SYN, predicted ratio model-predicted, bytes/packets, topology observed activity motion)
4 Model risk rises (learned raw risk, smoothed 5-frame EWMA alpha0.4, slope positive, risk card threshold, threat explanation risk section)
5 Early warning appears automatically within 10 seconds before ground truth and pauses (warning at 8, ground truth at 20, lead 12, requires smoothed>0.45 && slope>0 frozen 0.45, warning banner orange, topology warning pulse and predicted purple dashed)
6 Threat explanation consolidates stage evidence and graph-ranked host (rule-derived stage with evidence score, top host Rank #1 graph-ranked host-238 score 14.5, predicted path, observed evidence and MITRE kept separate, pinned 13.1, distinct badges)
7 Technical proof is available via expandable drawer (observed vs global importance not causal, MITRE 4 cards, honest measured metrics, method and limitations, same interface, keyboard accessible, reduced-motion)
8 Preventive action is simulated with one analyst action (recommended top host host-238 pre-selected, prominent Simulate Preventive Action orange gradient, clones frame, removes host edges muted orange, recalculates, same pipeline, original unchanged - Estimated simulated effect - not causal proof)
9 Containment result is compared in one card (before/after raw 0.62 vs 0.34, smoothed, warning, stage changed, ranking changed host-238 vs host-X, risk reduction percent, removed edges list muted orange dashed, ranking re-computed, topology muted edges)
10 Confirmation arrives (frame 20 revealed Infiltration, label_distribution, true_malicious_ratio 0.576, topology coral pulse, ground truth panel revealed, analysis status Confirmation)
11 Actual held-out confirmation and measured metrics are shown (F1 macro 0.844 miss, recall 0.745 miss, FPR 0.012 pass, PR-AUC 0.898 ROC-AUC 0.784, p95 13.9ms pass, gates honest PASS/MISS, claim limitations visible, provenance synthetic disclosed)
```

## Offline Fallback
- Bundle generated from same backend engine (scenario.py), not hardcoded: generate_scenario() invoked in replay pipeline writes both data/demo/cyberworld_replay.json and frontend/public/offline_bundle.json with byte-identical frames (hash 4cb9fce8).
- Health-check at application startup: useHealthCheck fetches /api/v1/health with 2s timeout, isBackendHealthy requires status ok && engine trained; otherwise mode offline.
- useScenarioData: api mode tries fetchScenarioDetail + fetchMetrics, falls back to fetchOfflineBundle on catch; offline mode loads bundle directly.
- Active mode visibly displayed in banner + Header badge. Backend failure does not prevent offline replay (verified via App.test offline cases and Playwright offline intercept).
- Isolation in offline uses utils/simulation.ts offlineSimulateIsolation with same ranking formula and factor table (rank 1 ->0.55, <=3 ->0.65, <=5 ->0.75, else 0.85, minus 0.05 if host risk > threshold), recalculated warning/stage, same non-causal label.
- Analysis session works in both modes (client timing, no WebSocket), offline_bundle has same 30 frames, so early warning appears within 10 seconds in both.

## Claim Boundaries (visible everywhere, distinct)
- **Learned:** binary benign-versus-malicious risk only (Random Forest probability) - raw_risk, black-box, badge cyan.
- **Rule-derived:** five-frame EWMA, slope, threshold, warning logic, stage estimate evidence score - not calibrated probability, badge yellow.
- **Graph-ranked:** NetworkX target ranking/predicted path - not learned target classifier, badge purple.
- **Simulated:** host isolation is estimated simulated effect - not causal proof, immutable clone, original unchanged, badge orange.
- **Measured:** metrics.json honest values with gates (F1 0.844 miss, recall 0.745 miss, FPR 0.012 pass, p95 13.9ms pass) - UI shows PASS/MISS honestly, never implies missed gate passed, badge slate.
Labels use text alongside color per visual language, distinct in ThreatExplanation and TechnicalProofDrawer.

## Visual Language
- Navy background #0f172a/#111827 and surfaces #1f2937.
- Cyan #22d3ee for observed/healthy state (solid edge, healthy risk).
- Purple #a855f7 for model prediction (smoothed EWMA, predicted path dashed, top target).
- Orange #fb923c for simulation (simulated after, removed edges muted 0.45 opacity dashed 4 4, badge, prominent Preventive Action gradient).
- Coral #f87171 for critical risk and ground truth (warning alert, high criticality, confirmation pulse).
- Dashed edge for predicted path (purple, 6 3, animated, respects reduced-motion).
- Muted edge for removed simulated path (orange, 4 4, opacity 0.45, label removed - simulated).
- Text labels and icons accompany every color state (lucide-react icons + status text).
- Motion for analysis (analysis pulse when running), observed activity (high-activity edges dash when activity >4), predicted path (purple dashed animated), warning target pulse (top host when warning), confirmation pulse (coral when ground truth revealed) - all data-derived, never invents nodes/edges/paths, disabled via prefers-reduced-motion: reduce.
- Threat Explanation consolidates with distinct badges, not color alone.
- Technical Proof drawer expandable with focus ring and Escape, reduced-motion disables transition.

## Tech Stack Boundaries
- Frontend: React 18/19, TypeScript strict, Vite 5, Tailwind 3, React Flow 11, Recharts 2, lucide-react, Vitest + Playwright, useAnalysisSession for milestones.
- Backend: Python 3.12, FastAPI + Uvicorn, Pydantic, Pandas, NumPy, scikit-learn 1.5, NetworkX 3.3, joblib, pytest.
- Excluded: PyTorch, LSTM/GRU/Transformer/GNN, SHAP, PCAP ingestion, WebSocket streaming, DB/auth/multi-user/Docker/cloud, real firewall/SOAR actions, SMOTE.

## Determinism and Reproducibility
- Seed 42 everywhere (preprocessing clip/impute, model random_state, replay stitching, synthetic fallback generation).
- Artifacts include full scaler params, imputation medians, clip bounds, feature order, train_only flags, version phase03-v1-sealed.
- Re-running generate_scenario twice produces identical frames within 1e-9 (verified replay tests).
- Analysis milestones derived from scenario data, not hardcoded frame numbers, verified via AnalysisSession.test.

## Reliability States
- **Loading:** "Starting CyberWorld AI..." with spinner (aria-hidden) and "Health-checking backend - fallback to offline_bundle.json if unavailable" - shown while !checked || loading. Data-testid loading-state.
- **Empty:** when scenario.frames.length ===0 - centered card "No Replay Data Available" explaining 30-frame requirement, data-testid empty-state, hints to regenerate demo/offline bundle.
- **Invalid-data:** when validation finds missing timestamp/nodes/edges/signals/forecast/ground_truth/flow_summary or signals subfields - card "Invalid Scenario Data" with Missing required field reason, remediation steps, data-testid invalid-data-state. Validated via validateScenario helper inspecting first frame shape.
- **Backend-down:** when error or !scenario or !current after health check - card "Failed to Load Scenario" with error text, offline hint, mode/health line, data-testid backend-down-state. Also shown when both API and offline fetch fail.
- **Reset:** Restart Analysis button (data-testid restart-analysis-btn, label Restart Analysis) + restart-btn legacy sets currentFrame 0 and status ready; Clear buttons in SimulationPanel and PreventiveActionPanel null simulationResult, restores banner to original replay unchanged. Trajectory + RiskChart reflect reset.

## Security and Repo Boundaries
- .gitignore excludes .venv, data/raw, artifacts/*.joblib, .env, datasets, model binaries.
- No secrets, raw dataset, or model binary committed to Git.
- Host aliases safe (host-N), never raw IP as node id.
- No destructive git operations or push in MVP.

## File Map
- `backend/app/replay/scenario.py` - temporal state, ranking, disclosure, gatings, same engine for bundles.
- `backend/app/api/*` - health/metrics/scenarios/forecast/simulate (Pydantic schemas, 422/404 structured errors).
- `backend/app/state.py` - load_state once.
- `artifacts/*` - feature_schema.json, risk_model.joblib, metrics.json.
- `data/demo/cyberworld_replay.json` + `frontend/public/offline_bundle.json` - same engine, 30 frames.
- `frontend/src/App.tsx` - health/mode/scenario orchestrator with analysis command centre 65/35, threat explanation, preventive action, reliability states.
- `frontend/src/components/AnalysisProgress`, `AnalysisStatus`, `ThreatExplanation`, `TechnicalProofDrawer`, `PreventiveActionPanel`, `Topology` (with motion), `RiskCard`, `RiskChart`, `StagePanel`, `TargetPanel`, `WorkspaceTabs`, `EvidencePanel`, `MitrePanel`, `MetricsPanel`, `SimulationPanel`, `HostDetailsDrawer` - each panel with data-testid for E2E.
- `frontend/src/hooks/useHealthCheck`, `useScenarioData`, `useAnalysisSession` (milestones, auto-start, pause at warning/confirmation, safe navigation), `useReplayController` (retained for timing).
- `frontend/src/utils/simulation.ts` - offline isolation fallback, same factor table.
- `frontend/e2e/demo.spec.ts`, `analysis.spec.ts`, `threat.spec.ts`, `preventive.spec.ts`, `shell.spec.ts`, `topology.spec.ts`, `workspace.spec.ts`, `visual-regression.spec.ts` + `playwright.config.ts` - full E2E (73 tests).
