# CyberWorld AI

Predictive cybersecurity decision-support prototype - final product experience: Analyze, explain, and respond.
Analysis Session -> Risk model -> Temporal state -> Stage estimate -> Target ranking -> Threat Explanation (Evidence and MITRE) -> Preventive Action (Simulated) -> Before/after comparison -> Confirmation

**Live demo:** [cyberworld-ai-mvp.vercel.app](https://cyberworld-ai-mvp.vercel.app)

## Overview
CyberWorld AI analyzes chronological network flows via an automated analysis session, detects rising malicious activity, builds an evolving host-and-connection view, estimates what may happen next, consolidates a data-derived threat explanation, and lets an analyst simulate a preventive action on the top graph-ranked host before held-out confirmation. The complete analysis story (baseline -> emerging risk -> early warning -> response -> confirmation) must work twice from clean startup and once in offline fallback mode with no internet. The system automatically pauses at early warning for analyst review and uses prominent Preventive Action controls, not raw replay/video language.

## Quick Start

### Prerequisites
- Python 3.12, Node.js 20+, pnpm 11+
- macOS/Linux, Apple M5 or 8-core CPU, 16GB RAM, 10GB free
- Browser: current Chrome or Edge
- Ports: backend 8000, frontend 5173 (dev) or 4173 (preview)

### Installation
```bash
make setup            # creates .venv, pip install backend/requirements.txt, pnpm install frontend
```

### Development
```bash
make dev              # starts backend http://localhost:8000 and frontend http://localhost:5173
make dev-backend      # .venv/bin/uvicorn app.main:app --reload --host 0.0.0.0 --port 8000 --app-dir backend
make dev-frontend     # pnpm --dir frontend dev
```

### Testing
```bash
make test             # backend: 96 pytest tests + frontend: 52 Vitest tests
make test-backend     # backend only
make test-frontend    # frontend only
pnpm --dir frontend exec playwright test --reporter=list  # 55 Playwright tests covering demo, UI, accessibility and reliability
pnpm --dir frontend exec playwright test --reporter=html # with HTML report trace/screenshots in frontend/test-results
```

### Building
```bash
make build            # frontend tsc && Vite build; React Flow and Recharts are split below the 500kB chunk limit
pnpm --dir frontend preview --port 4173 --host 127.0.0.1  # serves built bundle for offline demo verification
make lint             # ruff + eslint
make typecheck        # mypy + tsc --noEmit
```

### Clean Startup for Demo (twice before demo + once offline)
```bash
make setup && make test && make build && pnpm --dir frontend exec playwright test --reporter=list
make dev              # starts backend (backend.app.main) and frontend; verify banner reflects actual health:
                      # - if artifacts present and health is trained -> API Mode banner: Backend healthy - using live API
                      # - if backend reachable but model not trained -> Offline Mode banner: Backend reachable, model not trained - using offline replay.
                      # - if backend down -> Offline Mode banner: Offline fallback - using offline_bundle.json
curl http://localhost:8000/api/v1/health | python3 -m json.tool  # must show "engine": "trained" when artifacts present
# then kill backend and:
pnpm --dir frontend preview --port 4173 --host 127.0.0.1
# visit http://localhost:4173 -> Offline Mode - Offline fallback - using offline_bundle.json (same engine, not hardcoded)
```

### Vercel deployment

The supported Vercel release is the static frontend in `frontend/`. It uses the
deterministic offline replay bundle, so the complete analyst workflow remains
interactive without publishing the trained model binary or raw CICIDS data.
The deployed banner truthfully reports **Offline Mode**. Run the FastAPI backend
locally when you need **API Mode** with the trained model.

Current production deployment: [cyberworld-ai-mvp.vercel.app](https://cyberworld-ai-mvp.vercel.app)

From the Vercel dashboard, import the GitHub repository with these settings:

- Root Directory: `frontend`
- Framework Preset: Vite
- Install Command: `pnpm install --frozen-lockfile`
- Build Command: `pnpm build`
- Output Directory: `dist`
- Environment variables: none required

CLI deployment is also supported:

```bash
cd frontend
npx vercel --prod
```

## Project Structure
```
cyberworld-ai/
├── backend/
│   ├── app/
│   │   ├── api/ (health, metrics, scenarios, forecast, simulate)
│   │   ├── replay/scenario.py (temporal, ranking, gatings, same engine for bundles)
│   │   ├── state.py (load_state once)
│   │   ├── schemas/ (Pydantic, single source for generated.ts)
│   │   └── main.py (FastAPI lifespan)
│   ├── tests/ (96 tests: data audit, preprocessing, model, replay, ranking, API, simulation, MITRE, startup)
│   └── requirements.txt
├── frontend/
│   ├── src/
│   │   ├── App.tsx (health/mode/scenario orchestrator with analysis session, 65/35 command centre, threat explanation, preventive action, loading/empty/invalid-data/backend-down states)
│   │   ├── components/ (CommandBar, AnalysisProgress, AnalysisStatus, ThreatExplanation, TechnicalProofDrawer, PreventiveActionPanel, Topology with motion, RiskCard, RiskChart, StagePanel, TargetPanel, WorkspaceTabs, Evidence/MITRE/Metrics/Simulation panels)
│   │   ├── hooks/ (useHealthCheck, useScenarioData, useAnalysisSession with milestones, useReplayController retained for timing)
│   │   ├── api/ (client with offline fallback, generated.ts from OpenAPI)
│   │   ├── utils/simulation.ts (offline isolation fallback, same factor table)
│   │   └── __tests__/ (62 Vitest tests: App, Simulation, AnalysisSession, Topology, WorkspaceTabs)
│   ├── e2e/ (73 Playwright tests: demo 7, shell 13, topology 14, workspace 13, visual-regression 14, analysis 7, threat 6, preventive 5 + shell overlap)
│   ├── public/offline_bundle.json (generated from same engine, not hardcoded, 30 frames, seed 42)
│   ├── playwright.config.ts (webServer build+preview on 4173)
│   ├── vite.config.ts (proxy /api to :8000)
│   ├── vercel.json (Vite build and SPA routing)
│   └── package.json
├── data/
│   ├── raw/ (MachineLearningCSV per day, gitignored, case-insensitive discovery)
│   ├── reports/data_quality.json + .md
│   └── demo/cyberworld_replay.json (30 frames, 5465 flows)
├── artifacts/ (feature_schema.json 80, risk_model.joblib, metrics.json, model_metadata.json) gitignored
├── docs/
│   ├── DATASET_CARD.md (source, split, cleaning, synthetic disclosure)
│   ├── MODEL_CARD.md (RF 100 trees, threshold 0.45, honest gates F1 0.844 miss etc)
│   ├── ARCHITECTURE.md (diagram, data flow 11 steps, offline fallback, claim boundaries)
│   └── DEMO_SCRIPT.md (2-min commands + per-second narrative)
├── scripts/ (dataset acquisition and generated API-type tooling)
├── Makefile (setup, dev, test, build, lint, typecheck)
├── LICENSE
└── .env.example
```

## API Endpoints (all /api/v1)
- GET /health - {status ok, engine trained|not-trained, model_family, data_mode, version, threshold, claim_limitations, engine_metadata}
- GET /metrics - EvaluationMetrics with samples, precision/recall/F1 macro, FPR, PR-AUC/ROC-AUC, confusion_matrix, latency p95, honest gates, feature_importance not causal
- GET /scenarios - list
- GET /scenarios/{scenario_id} - detail with frames (gated ground_truth)
- POST /forecast - {scenario_id, frame_id 0..29} -> forecast + gated ground_truth + signals + flow_summary (predicted_* model-predicted)
- POST /simulate/isolate-host - {scenario_id, frame_id, host, action isolate_host} -> before/after, removed_edges muted, deltas risk_reduction, label Estimated simulated effect - not causal proof, 422 for bad host/action/frame/scenario, 503 if not loaded

Generate TypeScript API types: `python -m scripts.generate_types` (auto wrt OpenAPI -> frontend/src/api/generated.ts + openapi.json). Do not hand-maintain wire types.

## Core Types (visual language in parentheses)
- NetworkNode: id alias safe host-*, role, criticality low/medium/high (cyan/orange/coral), observed_state, risk, status (observed/cyan).
- NetworkEdge: source target protocol TCP/UDP/ICMP, activity, novelty, status (observed cyan solid, predicted purple dashed, removed orange muted).
- ScenarioFrame: timestamp chronological, flow_summary (total_flows observed, predicted_malicious_* model-predicted), nodes/edges, signals raw/smoothed/slope/warning/threshold/alpha, forecast, gated ground_truth.
- Forecast: raw_risk learned, smoothed 5-frame EWMA alpha0.4 rule-derived, slope 5-frame, warning (both), threshold 0.45 frozen, stage rule-derived evidence score, target_ranking NetworkX graph-ranked, evidence deterministic, mitre pinned 13.1 cautious, engine_metadata.
- SimulationResult: scenario frame host action, before/after, removed_edges, deltas (raw/smoothed/slope stage_changed risk_reduction_percent), limitations + label Estimated simulated effect - not causal proof, original_unchanged true, engine_metadata.

## Dataset (see DATASET_CARD.md)
- Source https://www.unb.ca/cic/datasets/ids-2017.html MachineLearningCSV.zip only.
- Record URL, download time 2026-09-01T20:01:51.334008Z, size 6473158, SHA-256 a2b79c0fc27..., under data/raw.
- Robust discovery case-insensitive.
- Chronological: Mon baseline 1153, Tue-Wed train 2306, Thu val 1053, Fri sealed 953.
- Cleaning train-only: median imput, q01/q99 clip, RobustScaler, constant removal, schema to artifacts/feature_schema.json.
- Imbalance: preserve test prevalence, balanced weights, no SMOTE.
- Synthetic fallback disclosed when official ZIP absent (seed 42, same schema, disclosure in reports/metrics/banner).

## Model (see MODEL_CARD.md)
- Logistic Regression baseline + Random Forest grid (trees 100/200, max_depth 16/None, min_leaf 1/5, balanced_subsample, n_jobs -1), selection score val macro-F1 -0.5*FPR on Thu.
- Selected RF 100 trees unlimited depth min_leaf 1, threshold 0.45 frozen.
- Held-out Friday 953: F1 macro 0.844 (miss >=0.90), malicious 0.849, recall malicious 0.745 (miss), benign 0.987, FPR 0.012 (pass <=0.05), PR-AUC 0.898 ROC-AUC 0.784, p95 13.9ms (pass <500ms), confusion [[386,5],[143,419]], honest gates visible, claim limitations always shown.
- Temporal: raw mean proba, smoothed 5 EWMA alpha0.4, slope 5, warning smoothed>0.45 && slope>0 (frame 8 before ground truth 20).
- Stage rule-derived (Normal/Recon/Credential/Compromise/Impact), target graph-ranked (incoming+1)*novelty*risk_trend*criticality, evidence deterministic, importance global RF not causal, MITRE local 13.1 T1046/T1110/T1021/T1498 cautious.

## Architecture (see ARCHITECTURE.md)
Analysis Session (auto-start, pause at warning 8 and confirmation 20, milestone navigation) -> Risk (RF 80 feats, learned binary) -> Temporal (5 EWMA+slope, rule-derived) -> Stage (evidence score, rule-derived) -> Target (NetworkX graph-ranked) -> Threat Explanation (consolidated risk/stage/target/evidence/MITRE, distinct labels) -> Technical Proof Drawer (expandable detailed evidence/MITRE/measured metrics/method/limitations, same interface) -> Preventive Action (one prominent Simulate Preventive Action, before/after risk, changed ranking, stage change, risk reduction, removed muted edges, Estimated simulated effect - not causal proof) -> Confirmation (gated ground truth at 20, coral pulse) -> Measured Metrics (honest F1 0.844 etc). Offline fallback from same engine, health-check at startup, mode banner visible, no WebSocket, deterministic seed 42, motion for analysis/observed/predicted/warning/confirmation with reduced-motion support.

## Visual Language
- Navy #0f172a background, cyan observed/healthy, purple prediction, orange simulation, coral critical/ground truth, dashed predicted, muted removed, text+icon never color alone.
- Motion for analysis (analysis pulse when running), observed activity (high-activity edges dash when activity >4), predicted path (purple dashed animated), warning target pulse (top host when warning), confirmation pulse (coral when ground truth revealed) - all data-derived, never invents nodes/edges/paths, disabled via prefers-reduced-motion: reduce.
- Threat Explanation consolidates learned/rule-derived/graph-ranked/measured/simulated with distinct badges and colors, not color alone.
- Technical Proof drawer expandable with focus ring and Escape, keyboard accessible, reduced-motion disables transition.

## Final Acceptance Story - Analyze, Explain, and Respond (see DEMO_SCRIPT.md for per-second script, no raw replay/video language)
1 Baseline (frame 0 Normal, no warning, ground truth hidden gated, analysis session auto-starts)
2 Analysis Session begins automatically (Analysis Progress Pause/Continue/Restart Analysis 0.5x/1x/2x, Space/R/Arrow, milestone navigation Baseline/Emerging/Warning/Confirmation, client timing, no WebSocket)
3 Observed behavior changes (port diversity, SYN, predicted ratio, threat explanation shows emerging risk)
4 Model risk rises (learned raw risk, smoothed 5-frame EWMA, slope positive, risk card shows threshold)
5 Early warning appears automatically within 10 seconds before ground truth and pauses (frame 8 before 20 lead 12, smoothed >0.45 and slope >0, warning banner orange, risk card warning, topology warning pulse and predicted purple dashed)
6 Threat explanation consolidates stage evidence and graph-ranked host (rule-derived stage with evidence score, top host Rank #1 graph-ranked score 14.5 host-238, predicted path, observed evidence and MITRE kept separate, pinned 13.1)
7 Technical proof is available via expandable drawer (observed vs global importance not causal, MITRE 4 cards, honest measured metrics 0.844 F1 miss, method and limitations, same interface)
8 Preventive action is simulated with one analyst action (recommended top host host-238 pre-selected, prominent Simulate Preventive Action orange gradient, clones frame, removes host edges muted orange, recalculates, same pipeline, original unchanged - Estimated simulated effect - not causal proof)
9 Containment result is compared in one card (before/after raw 0.62 vs 0.34, smoothed, warning, stage changed, ranking changed host-238 vs host-X, risk reduction percent, removed edges list 2-8 edges muted orange dashed, ranking re-computed)
10 Confirmation arrives (frame 20 revealed Infiltration, label distribution, true_malicious_ratio 0.576, topology coral pulse, ground truth panel revealed)
11 Actual held-out confirmation and measured metrics are shown (honest F1 macro 0.844 miss, recall 0.745 miss, FPR 0.012 pass, PR-AUC 0.898 ROC-AUC 0.784, p95 13.9ms pass, limitations visible, provenance synthetic disclosed)
Must work twice clean API (backend healthy) and once offline (backend down, offline_bundle.json same engine, not hardcoded) within two minutes. Usable at 1280x720 and 1440x900, keyboard-accessible, color never alone, reduced-motion supported.

## Reliability States
- Loading: Starting CyberWorld AI... with spinner + Health-checking backend - fallback to offline_bundle.json if unavailable (data-testid loading-state)
- Empty: No Replay Data Available when scenario.frames.length 0 (empty-state)
- Invalid-data: Invalid Scenario Data when missing timestamp/nodes/edges/signals/forecast/ground_truth/flow_summary or signals subfields (invalid-data-state)
- Backend-down: Failed to Load Scenario when error/!scenario/!current or both API+offline fail, with offline hint (backend-down-state)
- Reset: Restart button to 0 + Clear simulation button to remove comparison (original unchanged banner)

## Claim Boundaries
Learned = benign-vs-malicious risk only; rule-derived = smoothed/slope/stage evidence score; graph-ranked = target score; simulated = isolation estimated not causal proof; measured = metrics.json honest values with gates MISS shown. All panels label accordingly with different colors/text/icons.

## License

Released under the [MIT License](LICENSE). This is a demonstration prototype: it does not provide live telemetry or perform real host isolation.
