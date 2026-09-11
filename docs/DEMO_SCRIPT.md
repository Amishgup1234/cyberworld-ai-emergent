# Demo Script - CyberWorld AI Final Product Experience - Two-Minute Presentation

## Prerequisites
- Hardware: Apple M5 or 8-core CPU, 16GB RAM, 10GB free, macOS/Linux, modern Chrome/Edge, Node 20+, Python 3.12, pnpm 11+.
- Clean state: artifacts and scenario built via Phase 05 engine; offline bundle at frontend/public/offline_bundle.json byte-identical to data/demo/cyberworld_replay.json (seed 42, 30 frames).
- No internet required during demo (offline_bundle fallback). Backend failure still allows offline analysis. No WebSocket.

## Clean Startup Commands (twice before demo + once offline)
### 1) Install (once)
```bash
make setup            # creates .venv + pip install + pnpm install
```
### 2) Build and verify (recommended before each demo - run twice)
```bash
make test             # backend 96 + frontend 62 vitest, must PASS twice
make build            # tsc && vite build, 2526 modules
make lint             # ruff + eslint, must PASS
make typecheck        # mypy + tsc --noEmit, must PASS
pnpm --dir frontend exec playwright test --reporter=list   # 73 E2E tests covering analysis session, threat, preventive, demo, UI, accessibility and reliability, must PASS twice
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
# Open http://localhost:4173 -> banner must say Offline Mode - Offline fallback - using offline_bundle.json (same engine, not hardcoded)
```
Requirement: demo must succeed twice from clean startup (API) and once offline. Execute Mode A twice, then kill backend and show Mode B. Early warning must appear automatically within 10 seconds and pause for review.

## Two-Minute Speaking Script - Analyze, Explain, and Respond (no raw replay/video language, no unsupported claims)

**Total time: 2:00 - practice with Analysis Progress at 1x (800ms/frame) or 2x (400ms/frame) for timing.**

**0:00-0:10 - Baseline and Analysis Session auto-start**
"Welcome to CyberWorld AI - a predictive cybersecurity decision-support prototype. This is an automated analysis session on chronological network flows. At baseline frame 0, the network shows normal activity - risk below threshold, stage Normal, no warning, ground truth still gated until frame 20. The analysis session auto-starts after scenario load and will pause automatically at early warning for your review."

**0:10-0:20 - Analysis Progress and Milestones**
"At the top you see Analysis Session and Analysis Progress - Pause, Continue, Restart Analysis, and milestone navigation for Baseline, Emerging risk, Early warning, and Confirmation - all derived from the scenario data, not hardcoded frame numbers. Client-side timing drives progress, no WebSocket, with 0.5x, 1x and 2x controls and Space, R and Arrow keys."

**0:20-0:40 - Observed Behavior Changes and Threat Explanation Begins**
"As analysis progresses, observed behavior changes - port diversity rises, SYN activity increases, and the threat explanation begins to show emerging risk. The threat explanation consolidates learned risk, rule-derived stage, graph-ranked target, observed evidence and MITRE - each with distinct badges so you can see what is learned, what is rule-derived, and what is graph-ranked."

**0:40-0:55 - Model Risk Rises**
"Learned raw risk - the binary benign-versus-malicious probability - rises. The five-frame smoothed risk with EWMA and slope are rule-derived. When both smoothed risk crosses the frozen 0.45 threshold and slope is positive, the early warning condition is met."

**0:55-1:05 - Early Warning Pauses Automatically Within 10 Seconds**
"At frame 8 - about six seconds at 1x, three seconds at 2x - early warning appears automatically before ground truth at frame 20. The analysis pauses for review, showing a lead of 12 frames. Warning banner, risk card, and topology warning pulse all use text plus icon and color, with reduced-motion support. Ground truth remains hidden - gated - so there is no leakage."

**1:05-1:20 - Threat Explanation and Technical Proof**
"The threat explanation now shows stage Credential Attack with evidence score - rule-derived, not a calibrated probability - and the top graph-ranked host, host-238, with its NetworkX score and predicted purple dashed path. You can open the Technical Proof drawer in the same interface for detailed evidence versus global importance, MITRE pinned at v13.1 with four techniques and cautious wording, honest measured metrics, and method and limitations - all expandable without leaving the analysis."

**1:20-1:35 - Preventive Action With One Analyst Action**
"The preventive-action panel recommends that same top host - host-238 - as the containment target. With one analyst action, click the prominent Simulate Preventive Action control. It uses the existing API or offline isolation pipeline - it clones the current frame, removes that host's active edges, recalculates graph features and risk inputs, and re-runs the same pipeline. The original analysis remains unchanged - immutable - and the result is labeled Estimated simulated effect - not causal proof."

**1:35-1:50 - Containment Result in One Card and Confirmation**
"The result appears in one containment card - before and after raw and smoothed risk, warning status, stage change, changed ranking, estimated risk reduction percent, and the removed edges as muted orange dashed. Topology now shows those removed edges muted. Then at frame 20, confirmation arrives - ground truth revealed as Infiltration with label distribution and true malicious ratio, and the analysis status moves to Confirmation."

**1:50-2:00 - Measured Confirmation**
"Finally, the measured confirmation shows honest held-out Friday metrics - F1 macro 0.844 and recall 0.745 miss the 0.90 targets, but false-positive rate 0.012 and p95 latency 13.9 milliseconds pass - displayed with PASS and MISS, never inflated. Provenance is synthetic fallback with seed 42, same engine. This complete story works twice from clean startup and once offline, at 1280 by 720 and 1440 by 900, keyboard accessible."

## Detailed Two-Minute Demo Steps (11-step final acceptance story)

**Pre-checked mapping (honest metrics):**
- Seed 42, threshold 0.45, first warning frame 8, ground truth frame 20 (lead 12), Infiltration, Infiltration label_distribution BENIGN 77 Bot 24 Infiltration 31 PortScan 26 WebAttackBruteForce 24, predicted vs observed separated, stage rule-derived, target graph-ranked, isolation simulated not causal, metrics F1 0.844 miss / FPR 0.012 pass / p95 13.9ms pass.

### Step 1 - Baseline (0:00-0:10) - analysis session auto-starts
- Show analysis command centre header "CYBERWORLD AI" with mode banner (cyan API or orange Offline) and dataset badge, Analysis Session and Analysis Progress with Pause/Continue/Restart Analysis and milestone Baseline active, Analysis Status Baseline, threat explanation shows baseline, topology 20 hosts, stage Normal, risk card Normal (cyan), ground truth Hidden - gated.

### Step 2 - Analysis Session Progress (0:10-0:20)
- Analysis progresses automatically 0->1->2->3; Pause button shows Pause when running, Continue when paused, progress bar fills, speed 0.5x/1x/2x, milestone navigation, Space to toggle, R to restart, ArrowRight advances analysis frame. Use Pause to hold at baseline if desired.

### Step 3 - Observed Behavior Changes (0:20-0:35)
- Continue to frame 5 or use milestone Emerging risk. Show flow summary distinct_ports rising, RiskChart climbing, threat explanation emerging risk, evidence observed section lists port diversity, SYN, predicted malicious ratio model-predicted, bytes/s. Topology observed activity motion on high-activity edges when running.

### Step 4 - Model Risk Rises (0:35-0:50)
- Continue to frame 8. Show RiskCard raw risk 0.569, smoothed 0.453 (>0.45) with slope +0.062 positive, RiskChart smoothed crosses threshold, threat explanation risk section shows Learned raw and smoothed, stage evidence score.

### Step 5 - Early Warning Pauses Automatically Within 10 Seconds (0:50-1:00)
- At frame 8, warning banner EARLY WARNING ACTIVE appears, risk card Warning, topology warning target pulse on host-238, predicted path purple dashed animated, ground truth still Hidden gated until 20, analysis status Early warning and pauses for review. Lead 12 frames.

### Step 6 - Threat Explanation Consolidates (1:00-1:15)
- Show ThreatExplanation card with Learned Risk (binary), Rule-derived Stage (Credential Attack with evidence score), NetworkX graph-ranked Target host-238 Rank #1 score 14.5, Observed Evidence list, MITRE v13.1 four cards, distinct badges, and Why this matters paragraph. Topology legend shows observed cyan solid, predicted purple dashed, ground truth coral, simulated orange muted, with text+icon.

### Step 7 - Technical Proof Drawer (1:15-1:25)
- Expand Technical Proof drawer (aria-expanded, focus ring, Escape to close, reduced-motion). Show detailed evidence Observed vs Global Importance, MITRE pinned 13.1, honest measured metrics with PASS/MISS, method and limitations, and the wrapped WorkspaceTabs with Evidence/MITRE/Simulation/Metrics/Trajectory tabs (keyboard ArrowRight/Left, aria-selected, focus ring).

### Step 8 - Preventive Action With One Click (1:25-1:35)
- In decision rail PreventiveActionPanel, show recommended top host host-238 Rank #1 pre-selected in dropdown, click the prominent Simulate Preventive Action button (orange gradient, focus ring). Show loading then containment result card appears with Estimated simulated effect - not causal proof, preserved from SimulationResult.

### Step 9 - Containment Result in One Card (1:35-1:45)
- Show preventive result card with before raw 0.62 vs after 0.34, smoothed, warning, stage changed, top target before host-238 vs after host-X Ranking changed, risk reduction percent, removed edges list 2-8 edges muted orange dashed, topology muted edges. Original frame 8 unchanged - immutable banner.

### Step 10 - Confirmation Arrives (1:45-1:55)
- Continue via milestone Confirmation or ArrowRight to frame 20. Show ground truth panel flips to Revealed - Infiltration, attack_type badge coral, details, label_distribution, true_malicious_ratio 0.576 count 105, topology coral pulse, analysis status Confirmation.

### Step 11 - Measured Confirmation (1:55-2:00)
- Show MetricsPanel via Technical Proof or Metrics tab: Binary F1 macro 0.844 MISS vs 0.90, Attack recall 0.745 MISS, FPR 0.012 PASS <=0.05, PR-AUC 0.898 ROC-AUC 0.784, latency p95 13.9ms PASS <500ms, confusion matrix, samples train 2306 val 1053 test 953, limitations orange box with learned/rule-derived/graph-ranked/simulated/measured labels distinguish, provenance synthetic disclosed. Check frontend/test-results and artifacts/metrics.json match UI.

## Offline Mode Demonstration (extra 30 seconds)
- Stop backend (kill uvicorn), refresh http://localhost:4173, show banner flips to Offline Mode - Offline fallback - using offline_bundle.json (same engine, not hardcoded) in orange, threat explanation and preventive action still work via offlineSimulateIsolation (same factor table rank 1->0.55 etc), simulate host again to show same containment flow without backend.

## Reset and Keyboard Access Check
- Show Reset flow: click Restart Analysis (R key) resets to Baseline frame 0 Normal, click Clear in preventive result card and Clear in simulation panel clears comparison. Show keyboard: Space toggles Pause/Continue when not on tab/select, ArrowRight advances analysis frame, ArrowLeft back, Tab through host-select and Simulate Preventive Action button (focus ring cyan), Enter/Space on host nodes opens drawer, Escape closes drawer and Technical Proof, reduced-motion disables motion via media query.

## Verification After Demo
```bash
make test && make build && make lint && make typecheck && pnpm --dir frontend exec playwright test --reporter=list
# All must PASS twice. Check frontend/test-results and design/output screenshots.
# Check artifacts/metrics.json gates measured match UI - honest PASS/MISS.
# Check early warning appears automatically within 10 seconds at 1x (6.4s to frame 8) and pauses.
# Check two-minute story completes without replay/video language - uses Analysis Session, Threat Explanation, Preventive Action, Confirmation.
```

## Troubleshooting
- If API mode banner says "Backend reachable, model not trained", ensure artifacts/risk_model.joblib exists; otherwise accepted offline demo mode is Offline.
- If offline_bundle.json missing, regenerate with python -m backend.app.replay.scenario.
- If loading forever: check vite proxy target and offline_bundle.json in frontend/public (6.1MB).
- If E2E fails on warning at 8: verify data/demo/cyberworld_replay.json warning frames 8,9... and threshold 0.45, and useAnalysisSession milestone derivation.
- If preventive simulation shows no ranking change: check target_ranking logic and that host has active edges at frame 8 (host-238 has incoming 4, novelty 0.77, trend 1.25).
- If reduced-motion not working: check @media (prefers-reduced-motion: reduce) in Topology and TechnicalProofDrawer.

## Acceptance Story Checklist - Analyze, Explain, and Respond
- [x] 1 Baseline at start (frame 0 Normal, no warning, analysis session auto-starts)
- [x] 2 Analysis Session progresses automatically (Pause/Continue/Restart Analysis, milestone nav, client timing, no WebSocket, pauses at warning)
- [x] 3 Observed behavior changes (port diversity, SYN, predicted ratio, threat explanation emerging risk, topology observed motion)
- [x] 4 Model risk rises (learned raw, smoothed EWMA, slope, distinct Learned badge)
- [x] 5 Early warning pauses automatically within 10 seconds before confirmation (8 before 20, lead 12, warning banner and topology pulse)
- [x] 6 Threat explanation consolidates stage evidence and graph-ranked host (rule-derived, graph-ranked, predicted path, distinct badges)
- [x] 7 Technical proof is available via expandable drawer (observed vs importance not causal, MITRE 13.1, honest metrics, method/limitations, same interface, keyboard and reduced-motion)
- [x] 8 Preventive action with one analyst action (recommended top host, prominent Simulate Preventive Action, same pipeline, immutable, not causal proof)
- [x] 9 Containment result in one card (removed edges, before/after risk, changed ranking, stage change, risk reduction, muted orange, ranking re-computed, topology muted edges)
- [x] 10 Confirmation arrives (frame 20 revealed Infiltration, gated until then, coral pulse)
- [x] 11 Measured confirmation with honest metrics (F1 0.844 miss, FPR 0.012 pass, p95 13.9ms pass, limitations visible)
- [x] Twice from clean startup (API) and once offline (fallback) within two minutes, no replay/video language, no unsupported claims
- [x] Usable at 1280x720 and 1440x900, keyboard-accessible, color never alone, motion respects reduced-motion, focus rings visible
