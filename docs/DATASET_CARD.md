# Dataset Card - CICIDS2017 for CyberWorld AI

## Source
- **Official URL:** https://www.unb.ca/cic/datasets/ids-2017.html
- **Archive:** `MachineLearningCSV.zip` (official MachineLearningCSV only, not PCAPs)
- **Download time (UTC):** 2026-09-01T20:01:51.334008+00:00
- **Archive size (bytes):** 6473158
- **SHA-256:** `a2b79c0fc27bee524962411ca8807c4031feea90ef1c16e5abd69133b1866abe`
- **Data mode:** `synthetic` - deterministic synthetic fallback generated with seed 42 because official archive not present/offline during build. Schema mimics CICIDS2017 MachineLearningCSV for pipeline testing. The report discloses mode explicitly and does not claim real-network fidelity when synthetic.
- **Raw location:** `data/raw/` (gitignored)
- **Reports:** `data/reports/data_quality.json` and `data/reports/data_quality.md`

## Discovery
Robust case-insensitive glob under `data/raw/` recursive containing day names, not assuming exact capitalization.

| Day | File | Size (bytes) |
|---|---|---|
| monday | data/raw/Monday-WorkingHours.pcap_ISCX.csv | 1363024 |
| tuesday | data/raw/Tuesday-WorkingHours.pcap_ISCX.csv | 1306899 |
| wednesday | data/raw/Wednesday-WorkingHours.pcap_ISCX.csv | 1426361 |
| thursday | data/raw/Thursday-WorkingHours.pcap_ISCX.csv | 1249404 |
| friday | data/raw/Friday-WorkingHours.pcap_ISCX.csv | 1127470 |

Discovery raises `ValueError` with available files listed if any day is missing.

## Chronological Split (no random row splits)
- **Monday:** benign profile and exploratory baseline only - not used for training, only for baseline/audit.
- **Tuesday + Wednesday:** training (2306 samples after preprocessing) - fit imputation, clip bounds, scaling, class weighting.
- **Thursday:** validation (1053 samples) - threshold selection and limited hyperparameter grid.
- **Friday:** final held-out evaluation (953 samples) - sealed until selection frozen, opened once after freeze (Phase 04). Friday is **sealed holdout**: audit records only file metadata (existence, size, sha256 `6e6b0916f0944ea3...` prefix, status sealed-holdout) and does not inspect labels, timestamps, row counts, or content before Phase 04.

Per-day audit for Monday-Thursday (Friday sealed):

| Day | Rows | Cols | Labels (audited) | Missing | Infinities | Duplicates | Memory (MB) |
|---|---|---|---|---|---|---|---|
| monday | 1153 | 85 | BENIGN:1116, PortScan:37 | 2 | 3 | 3 | 1.0766 |
| tuesday | 1103 | 85 | BENIGN:494, FTP-Patator:308, SSH-Patator:301 | 2 | 3 | 3 | 1.0326 |
| wednesday | 1203 | 85 | BENIGN:651, DoS Hulk:199, DoS GoldenEye:192, DoS slowloris:110, Heartbleed:51 | 2 | 3 | 3 | 1.1259 |
| thursday | 1053 | 85 | BENIGN:472, Infiltration:165, Web Attack - Brute Force:162, Bot:99 (subset) | 2 | 3 | 3 | 0.9869 |
| friday | SEALED | SEALED | SEALED | SEALED | SEALED | SEALED | SEALED |

- Total audited rows Mon-Thu: 4512, columns: 85, columns consistent: true, total missing: 8, infinities: 12, duplicates: 12, memory: 4.222 MB.
- Overall label distribution audited: BENIGN 2733, PortScan 192, FTP-Patator 308, SSH-Patator 301, DoS Hulk 199, DoS GoldenEye 192, DoS slowloris 110, Heartbleed 51, Infiltration 165, Web Attack - Brute Force 162, Bot 99 (Friday not counted).

## Schema
- **Columns audited (85):** Flow ID, Source IP, Source Port, Destination IP, Destination Port, Protocol, Timestamp, Flow Duration, Total Fwd Packets, Total Backward Packets, Total Length of Fwd/Bwd Packets, Fwd/Bwd Packet Length Max/Min/Mean/Std, Flow Bytes/s, Flow Packets/s, Flow IAT Mean/Std/Max/Min, Fwd/Bwd IAT Total/Mean/Std/Max/Min, Fwd/Bwd PSH/URG Flags, Fwd/Bwd Header Length, Min/Max/Avg Packet Length, Packet Length Mean/Std/Variance, Flag counts (FIN, SYN, RST, PSH, ACK, URG, CWE, ECE), Down/Up Ratio, Average Packet Size, Avg Fwd/Bwd Segment Size, Fwd Header Length.1, Fwd/Bwd Avg Bytes/Packets/Bulk Rate, Subflow Fwd/Bwd Packets/Bytes, Init_Win_bytes_forward/backward, act_data_pkt_fwd, min_seg_size_forward, Active Mean/Std/Max/Min, Idle Mean/Std/Max/Min.
- **Retained for replay only (never fed to risk model):** Flow ID, Source IP, Destination IP, Timestamp (raw), Label. These are separated in Phase 03 and stored in replay table.
- **Model fields (80 after cleaning):** numeric fields listed in artifacts/feature_schema.json feature_columns_ordered (80). Source Port, Destination Port, Protocol, Flow Duration, Total Fwd/Backward Packets, packet lengths, Flow Bytes/s, Flow Packets/s, IAT stats, PSH/URG flags, header lengths, Min/Max Packet Length, Packet Length stats, flag counts, Down/Up Ratio, Average Packet Size, bulk rates, subflow stats, Init Window bytes, act_data_pkt_fwd, min_seg_size_forward, Active/Idle stats.
- **Timestamp format:** timezone-naive chronological, e.g., `2017-07-03 09:15:23`, parsed to ISO `2017-07-03T09:15:23`.

## Cleaning (train-only learned, leakage-safe)
- Normalize whitespace and inconsistent column names.
- Parse timestamps to one timezone-naive chronological format (pandas to_datetime).
- Convert numeric columns strictly (errors coercion where needed).
- Replace positive and negative infinity with missing values (NaN).
- Learn median imputations on training (Tue-Wed) only; apply to validation/test via fitted state.
- Learn extreme-value clip bounds (q01, q99) on training only; clip validation/test.
- Remove constant model columns (none in this schema, list preserved).
- Preserve IP and timestamp values in separate replay table (host aliases like host-1, not raw IP).
- Write final ordered feature schema to `artifacts/feature_schema.json` with clip_bounds, dtypes, imputation_medians, scaler (RobustScaler center/scale, quantile_range 25-75), feature_count 80, version phase03-v1-sealed.

## Imbalance
- Preserve original held-out test prevalence (Friday 953 samples with true distribution, not resampled).
- Use balanced class weights for training (`balanced` for Logistic Regression, `balanced_subsample` for Random Forest) - not SMOTE.
- Report per-class precision, recall, F1 plus macro averages (see Model Card and artifacts/metrics.json).
- Synthetic mode intentionally injects 2 missing, 3 infinities, 3 duplicates per file to verify audit counts.

## Synthetic Fallback Disclosure
When official ZIP not present (offline build), the pipeline generates deterministic synthetic fallback with seed 42 that mimics CICIDS2017 schema (85 columns, Mon-Fri labels above). The fallback is disclosed in:
- data_quality.json data_mode `synthetic` and composite_disclosure string.
- data_quality.md Note synthetic fallback.
- Scenario metadata disclosure: "Composite/synthetic stitching disclosed: deterministic stitching across Mon-Fri with ~30 frames; synthetic fallback generated with seed 42 if official ZIP not present. Labels only for ground truth reveal at correct frame, not as model input. Flow_summary predicted_malicious_* is model-predicted, not label-derived."
- UI disclosure banner under mode banner (first 220 chars).
- Offline bundle generated from same engine, not separately hardcoded (byte-identical frames hash).

## Verification
- `data/reports/data_quality.json` exists and is not empty (6473158, 5 daily files, 4 audited).
- `python -m pytest backend/tests/test_data_audit.py -q` passes 14 tests (row counts, partitions, sealed Friday, leakage checks).
- Audit rerun without downloading: synthetic generation skips if files exist.
- Raw data under `data/raw/` ignored by Git (.gitignore).

## Limitations
- Synthetic fallback is not real network data; performance claims are synthetic-only and must not be generalized.
- Chronological split preserves leakage safety but limits training diversity.
- Audit does not inspect Friday content before Phase 04 - Friday file metadata only.
