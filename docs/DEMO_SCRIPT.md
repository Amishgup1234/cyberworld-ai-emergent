# Demo Script - CyberWorld AI Two-Minute Demo

## Prerequisites
- Hardware: Apple M5 or 8-core CPU, 16GB RAM, 10GB free, macOS/Linux, modern Chrome/Edge, Node 20+, Python 3.12, pnpm 11+.
- Clean state: artifacts and scenario built via Phase 05 engine; offline bundle at frontend/public/offline_bundle.json byte-identical to data/demo/cyberworld_replay.json (seed 42).
- No internet required during demo (offline_bundle fallback). Backend failure still allows offline replay.

## Clean Startup Commands (twice before demo)

### 1) Install (once)
```bash
make setup            # creates .venv + pip install + pnpm install
```

### 2) Build and verify (recommended before each demo)
```bash
make test             # backend 93 + frontend 11 vi tests, must PASS
make build            # pnpm build tsc && vite build, 2519 modules, 753kB gzip 216kB
pnpm --dir frontend exec playwright test --reporter=list   # 7 E2E tests covering 11 steps + reliability, must PASS with screenshots in frontend/test-results
```

### 3) Start (separately demonstrate both modes)
```bash
# Mode A - API mode (with backend):
make dev              # starts backend :8000 and frontend :5173, or:
# terminal 1: .venv/bin/uvicorn app.main:app --host 0.0.0.0 --port 8000 --app-dir backend
# terminal 2: pnpm --dir frontend dev
# Open http://localhost:5173 -> banner should say API Mode - Backend healthy - using live API, dataset Synthetic Fallback, health ok engine trained

# Mode B - Offline fallback (backend down) - stop backend or block port 8000, then:
pnpm --dir frontend preview --port 4173 --host 127.0.0.1  # serves built offline_bundle.json
# Or: pnpm --dir frontend exec vite preview --port 4173
# Open http://localhost:4173 -> banner must say Offline Mode - Offline fallback - using offline_bundle.json (same engine, not hardcoded)
```

Requirement: demo must succeed twice from clean startup and once offline. Execute Mode A twice, then kill backend and show Mode B.

## Two-Minute Demo Steps (11-step story) - ~10 seconds per step

**Pre-checked mapping (honest metrics):**
- Seed 42, threshold 0.45, first warning frame 8, ground truth frame 20 (lead 12), Infiltration, Infiltration label_distribution BENIGN 77 Bot 24 Infiltration 31 PortScan 26 WebAttackBruteForce 24, predicted vs observed separated, stage rule-derived, target graph-ranked, isolation simulated not causal, metrics F1 0.844 miss / FPR 0.012 pass / p95 13.9ms pass.

### Step 1 - Normal network (0:00-0:10)
- Show dashboard header "CyberWorld AI - SOC Dashboard" with mode banner (cyan API or orange Offline) and dataset badge Synthetic Fallback.
- Replay controls at frame 0 / 29, timestamp 2017-07-03T... , stage panel shows Normal, risk card Normal (cyan), ground truth panel shows Hidden - gated, No attack revealed, flow summary shows predicted_malicious_ratio model-predicted low (0.005).
- Narrative: "We start on normal network - benign profile, no suspicious observed evidence yet."

### Step 2 - Chronological replay begins (0:10-0:20)
- Click Play, show frame advancing 0->1->2->3, pause button changes to Pause, progress bar fills, speed buttons 0.5x/1x/2x keyboard accessible (Space to toggle, R to restart, arrows). Click Pause.
- Narrative: "Replay begins chronologically - client-side timing, no WebSocket, 30 frames stitched Mon-Fri."

### Step 3 - Observed behavior changes (0:20-0:35)
- Drag slider to frame 5 (or click Play to 5). Show flow summary distinct_ports rising, RiskChart climbing, trajectory dots changing from Normal cyan to Reconnaissance yellow, Evidence panel observed section lists port diversity, SYN, predicted malicious ratio model-predicted, bytes/s.
- Narrative: "Observed behavior changes - port diversity rises, SYN flag rate increases, model-predicted malicious ratio becomes observable - yet still below threshold."

### Step 4 - Model risk rises (0:35-0:50)
- Move to frame 8. Show RiskCard raw risk 0.569, smoothed 0.453 (>0.45) with slope +0.062 positive, RiskChart smoothed crosses orange dashed threshold line, warning marker appears red.
- Narrative: "Learned raw risk probability rises - five-frame EWMA smoothed risk crosses frozen threshold 0.45 chosen Thursday, slope positive - both required for warning (not learned world model)."

### Step 5 - Early warning appears before ground truth (0:50-1:00)
- Keep at frame 8, show coral warning alert "Early warning active - before ground truth" in RiskCard, ground truth panel still Hidden gated, not revealed until 20.
- Narrative: "Early warning active at frame 8 - before ground truth at frame 20 - lead 12 frames; threshold crossed before selected replay ground-truth event gate PASS."

### Step 6 - Stage evidence and graph-ranked host appear (1:00-1:15)
- Show StagePanel now Reconnaissance or Credential Attack (rule-derived evidence score, not probability) with evidence score text, ranking panel top target host (e.g., host-XYZ Rank #1 graph-ranked score 12.5, criticality high, incoming activity, edge novelty, risk trend) and predicted path purple dashed edge in Topology (React Flow, cyan observed + purple dashed + legend).
- Narrative: "Stage estimate updates via transparent rule (port diversity etc) - graph-ranked target host via NetworkX appears with predicted dashed path - not a learned classifier."

### Step 7 - MITRE mapping and evidence are opened (1:15-1:25)
- Show EvidencePanel two separate sections: Observed Evidence (cyan deterministic) vs Global Model Importance (purple, top feature Total Backward Packets 0.100, disclaimer not causal). Show MitrePanel pinned v13.1 with 4 cards T1046/T1110/T1021/T1498, each with evidence rule and cautious confidence (possible/likely - requires analyst review, simulated estimate - not causal proof). Active card highlighted based on stage.
- Narrative: "Evidence kept separate from importance - importance labeled never causality - MITRE pinned v13.1 locally with cautious wording."

### Step 8 - Suspicious host is isolated in simulation (1:25-1:35)
- In SimulationPanel, show host-select dropdown pre-selected to top ranked suspicious host, click orange Isolate Host (Simulated) button (keyboard accessible). Show loading then comparison panel appears with Estimated simulated effect - not causal proof label (orange).
- Narrative: "Analyst selects suspicious host and simulates isolation - backend clones frame via deepcopy, removes host active edges (orange muted), recalculates graph and risk via same pipeline - original replay unchanged."

### Step 9 - Before/after risk is compared (1:35-1:45)
- Show before column (cyan observed) raw 0.62 smoothed 0.55 vs after column (orange simulated) raw 0.34 smoothed 0.32, deltas raw -0.28 smoothed -0.23 risk reduction 45.2% stage_changed yes, removed edges list (2 edges, muted orange dashed host-1->host-2 removed - simulated), changed ranking (before host-2 #1 12.5 vs after host-3 #1 5.2 Ranking changed badge).
- Narrative: "Before/after deltas shown - risk reduction percent and stage changed - muted orange indicates removed simulated path; ranking re-computed after isolation."

### Step 10 - Ground truth arrives (1:45-1:55)
- Move slider to frame 20. Show ground truth panel flips to Revealed - Infiltration started, attack_type Infiltration badge coral, details "Ground truth revealed at frame 20: Infiltration", label_distribution table, true_malicious_ratio 0.576 count 105, topology border switches to coral ground truth for suspicious nodes.
- Narrative: "Ground truth arrives at locked frame 20 - only now is label distribution exposed (gated before) - attack_type Infiltration matches our warning horizon."

### Step 11 - Actual held-out metrics are shown (1:55-2:00)
- Show MetricsPanel: Binary F1 macro 0.844 (MISS vs 0.90), Attack recall 0.745 (MISS), FPR 0.012 (PASS <=0.05), PR-AUC 0.898 ROC-AUC 0.784, latency p95 13.9ms (PASS <500ms), confusion matrix [[386,5],[143,419]], samples train 2306 val 1053 test 953 Monday 1153 deterministic seed, orange claim limitations box stating learned/rule-derived/graph-ranked/simulated/measured labels distinguish (gates honest, not inflated), provenance synthetic disclosed.
- Narrative: "Actual held-out Friday metrics shown honestly - measured values displayed, missed gates not claimed as passed - proof the demo is leakage-safe and not over-claimed."

## Offline Mode Demonstration (extra 30 seconds)
- Stop backend (kill uvicorn), refresh page http://localhost:4173 or keep preview, show banner flips to Offline Mode - Offline fallback - using offline_bundle.json (same engine, not hardcoded) in orange, header connection badge Offline Mode - Fallback active, disclosure composite stitching disclosed (seed 42), all panels still work (risk, stage, target, simulation via offlineSimulateIsolation). Simulate host again to show same before/after flow without backend.

## Reset and Keyboard Access Check
- Show Reset flow: click Restart (R key) resets to frame 0 Normal, click Clear in simulation panel clears comparison. Show keyboard: Space toggles Play/Pause, ArrowRight advances frame, ArrowLeft back, Tab through host-select and simulate button (focus ring orange).

## Verification After Demo
```bash
make test && make build && pnpm --dir frontend exec playwright test --reporter=list
```
- All must PASS.
- Check frontend/test-results/demo-step11-full.png screenshot exists.
- Check playwright-report/index.html has passed 7 tests with trace.
- Check artifacts/metrics.json gates measured match UI.

## Troubleshooting
- If API mode banner says "Backend reachable, model not trained", ensure `artifacts/risk_model.joblib` exists locally; otherwise use the accepted offline demo mode.
- If `offline_bundle.json` is missing, regenerate it with `python -m backend.app.replay.scenario`.
- If loading forever: check vite proxy target and offline_bundle.json in frontend/public (6.1MB).
- If E2E fails on warning at 8: verify data/demo/cyberworld_replay.json warning frames 8,9,10,11... and threshold 0.45.

## Acceptance Story Checklist
- [x] 1 Normal network at start (frame 0 Normal, no warning)
- [x] 2 Chronological replay begins (play/pause/restart/0.5x/1x/2x, client timing, no WebSocket)
- [x] 3 Observed behavior changes (port diversity, SYN, predicted ratio)
- [x] 4 Model risk rises (smoothed EWMA, slope)
- [x] 5 Early warning appears before ground truth (8 before 20)
- [x] 6 Stage evidence and graph-ranked host appear (stage + top target)
- [x] 7 MITRE mapping and evidence are opened (separate sections, pinned 13.1)
- [x] 8 Suspicious host is isolated in simulation (select + Simulate)
- [x] 9 Before/after risk is compared (deltas, risk_reduction, stage_changed, removed edges, ranking change)
- [x] 10 Ground truth arrives (frame 20 revealed Infiltration, gated)
- [x] 11 Actual held-out metrics are shown (honest measured, limitations visible)
- [x] Twice from clean startup (API) and once offline (fallback)
- [x] Usable at 1280x720 and 1440x900, keyboard-accessible, color never alone (text+icon)
