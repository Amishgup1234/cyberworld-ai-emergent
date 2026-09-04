# Model Card - CyberWorld AI Risk Model

## Overview
Binary benign-versus-malicious risk model for chronological CICIDS2017 flows. Outputs malicious-risk probability per flow window, aggregated to per-frame raw risk (mean probability), with five-frame EWMA smoothing and slope-based early warning. No temporal world model is claimed; smoothing/slope are rule-derived.

- **Model family:** Random Forest (selected) after small grid search; Logistic Regression baseline evaluated.
- **Model version:** phase04-v1
- **Feature count:** 80 (ordered schema phase03-v1-sealed)
- **Data mode:** synthetic (deterministic seed 42, fallback when official ZIP absent)
- **Threshold:** 0.45 (frozen on Thursday validation, not tuned on Friday)
- **Seed:** 42 deterministic, repeatable training
- **Artifacts:** `artifacts/risk_model.joblib`, `artifacts/metrics.json`, `artifacts/feature_schema.json`, `artifacts/model_metadata.json`

## Intended Use
Decision-support only: replay chronological flows, detect rising malicious activity, build host-and-connection view, estimate next stage evidentially, explain evidence, simulate isolation effect. Not a production IDS, not causal proof, not proof of real-world generalization.

## Training Data
- **Split:** Chronological Mon-Fri, not random rows.
  - Train: Tuesday + Wednesday (2306 samples)
  - Validation: Thursday (1053 samples) - threshold and hyperparameter choice
  - Test: Friday sealed holdout (953 samples) - evaluated once after freeze
  - Monday: benign baseline only, not for training
- **Leakage safety:** Flow ID, Source IP, Destination IP, Timestamp, Label never fed to estimator (separated in replay table). Median imputation and clip bounds (q01/q99) learned on train only. RobustScaler fitted on train only. Constant columns removed (none). Friday not consulted for preprocessing or selection.
- **Imbalance handling:** Preserve original test prevalence; use balanced class weights (`balanced_subsample` for RF, `balanced` for LR); no SMOTE.

## Baseline and Candidates
- **Logistic Regression baseline:** median imputation, RobustScaler, balanced weights, seed 42, outputs malicious probability.
- **Random Forest grid (small, validation only):**
  - Trees: 100 or 200
  - Max depth: 16 or unrestricted (None)
  - Min leaf size: 1 or 5
  - Class weight: balanced_subsample
  - n_jobs: -1 (all cores)
- **Selection score:** `validation macro-F1 - 0.5 * validation false-positive rate` on Thursday. Test partition did not influence selection.

## Selected Hyperparameters
```json
{
  "class_weight": "balanced_subsample",
  "max_depth": null,
  "min_samples_leaf": 1,
  "n_estimators": 100,
  "n_jobs": -1,
  "random_state": 42
}
```
- **Selection score:** 0.7977373026324825 (validation)
- **Saved pipeline:** end-to-end sklearn pipeline (impute -> clip -> RobustScaler -> RF) in `artifacts/risk_model.joblib` reproduces predictions deterministically.

## Threshold
- Chosen on Thursday validation: **0.45**
- Applied to mean malicious probability for predicted counts: `predicted_malicious_count = sum(proba > 0.45)`, `predicted_malicious_ratio = predicted_count / window_size`, source labeled model-predicted.
- Frozen for test evaluation and replay.

## Held-Out Evaluation (Friday sealed, opened once after freeze)
Measured on 953 Friday samples (honest, not inflated). Values from `artifacts/metrics.json` and displayed in UI Metrics panel.

| Metric | Measured | Target | Gate |
|---|---|---|---|
| Binary F1 macro | 0.8445 | >=0.90 | MISS - measured shown, claim not inflated |
| F1 malicious | 0.8499 | - | reported |
| F1 benign | 0.8391 | - | reported |
| Attack recall (malicious) | 0.7456 | >=0.90 | MISS |
| Recall benign | 0.9872 | - | reported |
| Precision malicious | 0.9882 | - | per-class |
| False-positive rate | 0.0128 | <=0.05 | PASS |
| PR-AUC (average_precision) | 0.8988 | - | measured |
| ROC-AUC | 0.7840 | - | measured |
| Accuracy | 0.8447 | - | measured |
| Latency p95 | 13.9 ms (14.3 ms in latest rerun) | <500 ms | PASS |
| Latency mean | 12.75 ms | - | measured |
| Samples | train 2306, val 1053, test 953, monday 1153 | - | provenance |

Confusion matrix `[[TN,FP],[FN,TP]]`:
```
[[386, 5],
 [143, 419]]
```

Per-class details (macro averages):
- Macro precision 0.8589, macro recall 0.8664.
- Per-class precision malicious 0.9882, benign 0.7297 (from metrics).
- Recall malicious 0.7456, benign 0.9872.

If a target is missed, UI displays measured value and removes any claim that target was achieved (honest target_gates with measured fields).

## Temporal Warning (not learned world model)
- **Current risk:** mean malicious probability per frame.
- **Five-frame EWMA smoothed risk:** alpha 0.4, `smoothed = EWMA over last 5 raw`.
- **Five-frame risk slope:** polyfit over last 5 smoothed values.
- **Warning:** `smoothed > 0.45 and slope > 1e-9` (both must cross frozen thresholds). Early warning at frame 8 before ground truth frame 20 (lead 12 frames, satisfies before-ground-truth gate).

## Stage Estimate (transparent evidence score, not calibrated probability)
Rule-derived only from observable and model-predicted ratio (never Label):
- BENIGN -> Normal
- PortScan + high destination/port diversity -> Reconnaissance (T1046)
- FTP-Patator / SSH-Patator + repeated auth (predicted ratio + SYN, port diversity) -> Credential Attack (T1110)
- Predicted ratio high + host-to-host + smoothed >0.52 -> Compromise/Infiltration (T1021)
- DoS/DDoS pattern high bytes/packets + predicted ratio >0.30 -> Impact/Disruption (T1498)
- Lateral Movement used only when replay contains explicit internal host-to-host spreading evidence (not in current synthetic).

## Target Ranking (NetworkX graph-ranked, not learned classifier)
```
target score = (suspicious incoming activity +1) * edge novelty * recent risk trend * asset criticality
```
- Built via NetworkX DiGraph from observed nodes/edges per frame, with incoming_activity, avg novelty (recency-weighted: delta 0 ->1.0, <=2 ->0.8, <=5 ->0.5, else 0.2), risk_trend = (0.5 + smoothed) * (1 + slope*5 if slope>0), criticality numeric (low 1, medium 2, high 3). Ranking deterministic, reproducible, sorted descending, rank 1 most suspicious. Predicted path is top target incoming edge, purple dashed.

## Explainability
- Deterministic observed evidence per active warning (port diversity, SYN, predicted ratio model-predicted, bytes/packets rates, EWMA). Section labeled Observed Evidence (cyan), never causal.
- Global Random Forest importance if RF selected: feature_importances_ array, top 15 listed, values map, description "Global Random Forest feature_importances_ - not causal". Top features: Total Backward Packets 0.1000, Down/Up Ratio 0.0798, Bwd Avg Bulk Rate 0.0740, Fwd Avg Bulk Rate 0.0737, Subflow Fwd Packets 0.0734, etc. Disclaimer: importance is associative, not causal proof. Local standardized coefficients if LR selected (not this run). Never describe importance as causality.

## MITRE ATT&CK
Pinned local mapping version **13.1** with technique ID, name, evidence rule, cautious confidence wording (always requires analyst review, not causal):
- T1046 Network Service Discovery - evidence: Port diversity >15 plus predicted suspicious activity (model-predicted ratio >0.08) - confidence: possible - observed scanning only, not confirmed reconnaissance - requires analyst review.
- T1110 Brute Force - evidence: Predicted malicious ratio >0.25 plus repeated authentication-like activity (high SYN, port diversity) - confidence: likely - brute force pattern observed via predicted ratio, not confirmed compromise - requires analyst review.
- T1021 Remote Services (only when supported) - evidence: Predicted ratio high + host-to-host activity + EWMA risk above threshold with positive trend - confidence: possible - infiltration-like pattern predicted, simulated estimate - not causal proof.
- T1498 Network Denial of Service - evidence: High flow bytes/packets per second plus predicted malicious ratio >0.30 - confidence: possible - volume anomaly predicted, not confirmed impact - requires analyst review.

## Latency
Local forecast API p95 measured via 100 sampled pipeline predictions (no network):
- p95 13.9 ms, p50 ~12.2 ms, mean ~12.7 ms, samples 100, unit ms - well under 500 ms target, gate PASS. Stored in metrics.json latency and displayed in Metrics panel. Same engine used for replay frames.

## Claim Limitations (visible in UI)
"Binary benign-versus-malicious risk only (learned); stage estimate is rule-derived evidence score; target ranking is NetworkX graph-ranked; isolation is simulated estimate - not causal proof; Friday held-out evaluated once after freeze; no SMOTE, no train/validation/test leakage; preprocessing fitted on train only. Target gates not all achieved - see target_gates.measured; model limitations visible in UI."

Displayed in MetricsPanel orange box, engine_metadata claim_limitations, and App header limitation text. Honest metrics separate from inflated claims.

## Reproducibility
- Seed 42 deterministic across preprocessing, model, replay generation, bundle generation.
- Artifacts include feature_schema.json clip_bounds, dtypes, imputation medians, scaler params (center/scale, quantile_range 25/75).
- Replay scenario generation uses threshold 0.45, alpha 0.4, 30 frames, ~182 flows/frame avg, total 5465 flows.

## Limitations and Risks
- Synthetic fallback not real CICIDS2017 capture; performance not generalizable.
- F1 and recall miss 0.90 gates (0.844 and 0.745) - ROI must not claim target achieved.
- Early warning gate passes only for selected replay (frame 8 vs 20); not guaranteed across all windows.
- Importance is associational - do not use for causal forensic proof.

## Verification
- Saved pipeline reproduces predictions (test_model).
- metrics.json describes samples and split provenance (train Tue+Wed Mon baseline only, val Thu, test Fri sealed).
- Honest metrics matching UI (MetricsPanel reads same JSON via /api/v1/metrics or offline_bundle).
- Failure to meet targets recorded honestly, not hidden (gates.measured).

## Ethics
No raw IP, timestamp, Flow ID, or Label exposed to risk model. Host IDs are safe aliases (host-1). Raw data never committed to Git.
