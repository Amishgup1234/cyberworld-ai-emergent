# Architecture - CyberWorld AI

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
    Full-screen SOC Dashboard (1280x720 and 1440x900 responsive, Tailwind)
    +-- Header: title, API/Offline badge, dataset badge (Synthetic Fallback vs CICIDS2017), source URL
    +-- Mode banner: Active mode text + health
    +-- ReplayControls: Play/Pause/Restart, speed 0.5x/1x/2x (keyboard Space/R/arrows), slider 0..29, progress, chronological no WebSocket
    +-- Grid top: Topology (React Flow) + RiskCard | StagePanel | TargetPanel
    +-- SimulationPanel: host-select dropdown (top ranked pre-selected, keyboard accessible), orange Simulate button, before/after (cyan observed vs orange simulated), deltas, removed-edges muted, ranking change, non-causal label
    +-- Grid middle: RiskChart (Recharts, raw cyan, smoothed purple, threshold orange dashed, warning coral) + TrajectoryPanel (timeline dots) + EvidencePanel (Observed cyan vs Importance purple, not causal)
    +-- Grid bottom: MitrePanel (pinned 13.1, 4 cards T1046/T1110/T1021/T1498, evidence rule + confidence) + MetricsPanel (honest gated metrics) + GroundTruth (gated reveal at 20, attack_type Infiltration) + Flow Summary (observed + predicted separate) + EngineMetadata
    +-- Footer: visual language legend; color never alone (text+icon accompanies)

Reliability states: Loading (spinner Starting CyberWorld AI... + health message) | Empty (0 frames) | Invalid-data (missing fields validation) | Backend-down (Failed to Load Scenario, offline_bundle hint) | Reset (Restart + Clear simulation).
```

## Data Flow - 11-step accepted story
```
1 Normal network (frames 0-2 smoothed 0.21 <0.45, stage Normal, no warning, ground truth hidden)
2 Chronological replay begins (client-side timing, play/pause/restart/0.5x/1x/2x, no WebSocket, frame slider)
3 Observed behavior changes (port diversity, SYN, predicted ratio model-predicted, bytes/packets)
4 Model risk rises (raw risk learned, smoothed EWMA alpha0.4, slope positive)
5 Early warning appears before ground truth (warning at 8, ground truth at 20, lead 12 frames, requires smoothed>thr && slope>0 frozen 0.45)
6 Stage evidence and graph-ranked host appear (stage rule-derived, target ranking NetworkX top host)
7 MITRE mapping and evidence are opened (observed evidence deterministic vs global importance not causal, pinned 13.1 four techniques)
8 Suspicious host is isolated in simulation (host-select, clone frame, remove/down-weight host active edges, recalc graph/risk)
9 Before/after risk is compared (raw/smoothed/slope/warning/stage/ranking deltas, risk_reduction %, stage_changed, muted removed edges)
10 Ground truth arrives (frame 20 revealed Infiltration, label_distribution, true_malicious_ratio 0.576)
11 Actual held-out metrics are shown (F1 macro 0.844, recall 0.745, FPR 0.012, PR-AUC 0.898, ROC-AUC 0.784, p95 13.9ms, gates honest PASS/MISS, claim limitations visible)
```

## Offline Fallback
- Bundle generated from same backend engine (scenario.py), not hardcoded: generate_scenario() invoked in replay pipeline writes both data/demo/cyberworld_replay.json and frontend/public/offline_bundle.json with byte-identical frames (hash 4cb9fce8).
- Health-check at application startup: useHealthCheck fetches /api/v1/health with 2s timeout, isBackendHealthy requires status ok && engine trained; otherwise mode offline.
- useScenarioData: api mode tries fetchScenarioDetail + fetchMetrics, falls back to fetchOfflineBundle on catch; offline mode loads bundle directly.
- Active mode visibly displayed in banner + Header badge. Backend failure does not prevent offline replay (verified via App.test offline cases and Playwright offline intercept).
- Isolation in offline uses utils/simulation.ts offlineSimulateIsolation with same ranking formula and factor table (rank 1 ->0.55, <=3 ->0.65, <=5 ->0.75, else 0.85, minus 0.05 if host risk > threshold), recalculated warning/stage, same non-causal label.

## Claim Boundaries (visible everywhere)
- **Learned:** binary benign-versus-malicious risk only (Random Forest probability) - raw_risk, black-box.
- **Rule-derived:** five-frame EWMA, slope, threshold, warning logic, stage estimate evidence score - not calibrated probability.
- **Graph-ranked:** NetworkX target ranking/predicted path - not learned target classifier.
- **Simulated:** host isolation is estimated simulated effect - not causal proof, immutable clone, original unchanged.
- **Measured:** metrics.json honest values with gates (F1 0.844 miss, recall 0.745 miss, FPR 0.012 pass, p95 13.9ms pass) - UI shows PASS/MISS honestly, never implies missed gate passed.
Labels use text alongside color per visual language.

## Visual Language
- Navy background #0f172a/#111827 and surfaces #1f2937.
- Cyan #22d3ee for observed/healthy state (solid edge, healthy risk).
- Purple #a855f7 for model prediction (smoothed EWMA, predicted path dashed, top target).
- Orange #fb923c for simulation (simulated after, removed edges muted 0.45 opacity dashed 4 4, badge).
- Coral #f87171 for critical risk and ground truth (warning alert, high criticality).
- Dashed edge for predicted path (purple, 6 3, animated).
- Muted edge for removed simulated path (orange, 4 4, opacity 0.45, label removed - simulated).
- Text labels and icons accompany every color state (lucide-react icons + status text).

## Tech Stack Boundaries
- Frontend: React 18/19, TypeScript strict, Vite 5, Tailwind 3, React Flow 11, Recharts 2, lucide-react, Vitest + Playwright.
- Backend: Python 3.12, FastAPI + Uvicorn, Pydantic, Pandas, NumPy, scikit-learn 1.5, NetworkX 3.3, joblib, pytest.
- Excluded: PyTorch, LSTM/GRU/Transformer/GNN, SHAP, PCAP ingestion, WebSocket streaming, DB/auth/multi-user/Docker/cloud, real firewall/SOAR actions, SMOTE.

## Determinism and Reproducibility
- Seed 42 everywhere (preprocessing clip/impute, model random_state, replay stitching, synthetic fallback generation).
- Artifacts include full scaler params, imputation medians, clip bounds, feature order, train_only flags, version phase03-v1-sealed.
- Re-running generate_scenario twice produces identical frames within 1e-9 (verified replay tests).

## Reliability States
- **Loading:** "Starting CyberWorld AI..." with spinner (aria-hidden) and "Health-checking backend - fallback to offline_bundle.json if unavailable" - shown while !checked || loading. Data-testid loading-state.
- **Empty:** when scenario.frames.length ===0 - centered card "No Replay Data Available" explaining 30-frame requirement, data-testid empty-state, hints to regenerate demo/offline bundle.
- **Invalid-data:** when validation finds missing timestamp/nodes/edges/signals/forecast/ground_truth/flow_summary or signals subfields - card "Invalid Scenario Data" with Missing required field reason, remediation steps, data-testid invalid-data-state. Validated via validateScenario helper inspecting first frame shape.
- **Backend-down:** when error or !scenario or !current after health check - card "Failed to Load Scenario" with error text, offline hint, mode/health line, data-testid backend-down-state. Also shown when both API and offline fetch fail.
- **Reset:** Restart button (data-testid restart-btn, label Restart replay from beginning) sets currentFrame 0 and isPlaying false; Clear button in SimulationPanel (aria-label Clear simulation) nulls simulationResult, restores banner to original replay unchanged. Trajectory + RiskChart reflect reset.

## Security and Repo Boundaries
- .gitignore excludes .venv, data/raw, artifacts/*.joblib, .env, datasets, model binaries.
- No secrets, raw dataset, or model binary committed to Git.
- Host aliases safe (host-N), never raw IP as node id.
- No destructive git operations or push in MVP.

## File Map
- `backend/app/replay/scenario.py` - temporal state, ranking, disclosure, gatings.
- `backend/app/api/*` - health/metrics/scenarios/forecast/simulate (Pydantic schemas, 422/404 structured errors).
- `backend/app/state.py` - load_state once.
- `artifacts/*` - feature_schema.json, risk_model.joblib, metrics.json.
- `data/demo/cyberworld_replay.json` + `frontend/public/offline_bundle.json` - same engine.
- `frontend/src/App.tsx` - health/mode/scenario orchestrator with reliability states.
- `frontend/src/components/*` - each panel with data-testid for E2E.
- `frontend/src/hooks/useHealthCheck`, `useScenarioData`, `useReplayController` - timing, fallback, keyboard accessible.
- `frontend/src/utils/simulation.ts` - offline isolation fallback.
- `frontend/e2e/demo.spec.ts` + `playwright.config.ts` - reliability E2E.
