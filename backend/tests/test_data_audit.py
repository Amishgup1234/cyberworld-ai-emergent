"""Tests for Phase 02 - CICIDS2017 acquisition and data audit (sealed-Friday holdout)."""

import sys
import json
import tempfile
from pathlib import Path
from unittest import mock

# Add backend to path (mirrors test_health.py)
sys.path.insert(0, str(Path(__file__).parent.parent))

import pytest  # type: ignore
import pandas as pd  # type: ignore

from app.data.audit import discover_daily_files, run_audit, _audit_single_file


ROOT = Path(__file__).resolve().parents[2]
REPORT_JSON = ROOT / "data" / "reports" / "data_quality.json"
RAW_DIR = ROOT / "data" / "raw"


def test_data_quality_json_exists_and_valid():
    """Gate: data/reports/data_quality.json must exist and be valid JSON."""
    assert REPORT_JSON.exists(), f"Missing {REPORT_JSON} - run audit first"
    data = json.loads(REPORT_JSON.read_text(encoding="utf-8"))
    assert isinstance(data, dict)
    assert len(data) > 0
    assert "data_mode" in data or "provenance" in data or "source_url" in data


def test_has_provenance_fields():
    """Check provenance fields: source_url, download_time, archive_size, sha256."""
    assert REPORT_JSON.exists(), f"Missing {REPORT_JSON}"
    data = json.loads(REPORT_JSON.read_text(encoding="utf-8"))
    provenance = data.get("provenance", data)
    source_url = data.get("source_url") or provenance.get("source_url")
    assert source_url is not None, "Missing source_url in report"
    assert "https://www.unb.ca/cic/datasets/ids-2017.html" in str(source_url), f"source_url should be official CIC URL, got {source_url}"
    download_time = data.get("download_time") or provenance.get("download_time")
    assert download_time is not None, "Missing download_time"
    assert isinstance(download_time, str) and len(download_time) >= 10
    archive_size = (
        data.get("archive_size_bytes")
        or data.get("archive_size")
        or provenance.get("archive_size_bytes")
        or provenance.get("archive_size")
    )
    assert archive_size is not None, "Missing archive_size / archive_size_bytes"
    assert isinstance(archive_size, int) and archive_size > 0
    sha256 = data.get("sha256") or provenance.get("sha256")
    assert sha256 is not None, "Missing sha256"
    assert isinstance(sha256, str) and len(sha256) == 64, f"sha256 should be 64 hex chars, got {sha256!r}"
    int(sha256, 16)
    data_mode = data.get("data_mode") or provenance.get("data_mode")
    assert data_mode in ("downloaded", "synthetic"), f"data_mode should be downloaded|synthetic, got {data_mode!r}"


def test_monday_friday_partitions_identifiable():
    """Monday-Friday partitions must be identifiable (Friday discovered but sealed)."""
    assert REPORT_JSON.exists()
    data = json.loads(REPORT_JSON.read_text(encoding="utf-8"))
    # Discovery must contain all 5 days (file listing)
    discovery = data.get("discovery", {}) or data.get("daily_files", {})
    assert discovery, "Missing discovery/daily_files in JSON"
    for day in ["monday", "tuesday", "wednesday", "thursday", "friday"]:
        assert day in discovery, f"Missing discovery for '{day}' - daily files should be discovered case-insensitive"
    # Partitions (auditable) must contain Monday-Thursday only
    partitions = data.get("partitions", {}) or data.get("daily_stats", {})
    for day in ["monday", "tuesday", "wednesday", "thursday"]:
        assert day in partitions, f"Missing audited partition for '{day}'"
    # Friday must NOT be in audited partitions with row_count, but must be in sealed_holdout
    sealed = data.get("sealed_holdout", {})
    assert "friday" in sealed or "friday" in data, "Friday must be recorded as sealed holdout"
    # Verify raw files exist on disk via discover function
    discovered = discover_daily_files(RAW_DIR)
    for day in ["monday", "tuesday", "wednesday", "thursday", "friday"]:
        assert day in discovered, f"discover_daily_files missing {day}"
        assert discovered[day].exists(), f"Discovered file for {day} does not exist: {discovered[day]}"
        assert discovered[day].suffix.lower() == ".csv"


def test_audited_row_counts_positive():
    """Audited partitions (Monday-Thursday) must have positive row counts."""
    assert REPORT_JSON.exists()
    data = json.loads(REPORT_JSON.read_text(encoding="utf-8"))
    partitions = data.get("partitions") or data.get("daily_stats") or {}
    # Check only audited days have row_count
    for day in ["monday", "tuesday", "wednesday", "thursday"]:
        stats = partitions.get(day)
        assert stats is not None, f"Missing stats for audited day {day}"
        assert isinstance(stats, dict) and "row_count" in stats, f"{day} missing row_count"
        assert stats["row_count"] > 0, f"{day} row_count should be >0, got {stats['row_count']}"
        assert stats.get("column_count", 0) > 0 or len(stats.get("columns", [])) > 0
    # Friday must NOT have row_count / content stats
    friday_top = data.get("friday", {})
    assert "row_count" not in friday_top, "Friday top-level must not have row_count (sealed)"
    assert "label_distribution" not in friday_top, "Friday must not have label_distribution (sealed)"
    sealed = data.get("sealed_holdout", {}).get("friday", {})
    assert "row_count" not in sealed, "Sealed Friday metadata must not contain row_count"
    # Cross-check global total_rows positive and equals sum of audited
    total_rows = data.get("total_rows") or (data.get("global", {}) or {}).get("total_rows")
    assert total_rows is not None and total_rows > 0
    audited_sum = sum(partitions[d]["row_count"] for d in ["monday", "tuesday", "wednesday", "thursday"] if d in partitions)
    assert total_rows == audited_sum, f"Global total_rows {total_rows} should equal sum of audited Mon-Thu {audited_sum}, Friday excluded"


def test_friday_is_sealed_holdout_and_not_audited():
    """Friday must be sealed holdout - only file metadata, no content inspection."""
    assert REPORT_JSON.exists()
    data = json.loads(REPORT_JSON.read_text(encoding="utf-8"))
    # Check that Friday content fields are NOT reported anywhere
    json.dumps(data)
    # We allow "friday" string in discovery/file names, but must not have Friday labels/timestamps in global stats
    # Check partitions does NOT contain friday audit stats
    partitions = data.get("partitions", {})
    assert "friday" not in partitions, "partitions must not contain friday (sealed)"
    # Check daily_stats similarly
    daily_stats = data.get("daily_stats", {})
    assert "friday" not in daily_stats, "daily_stats must not contain friday"
    # Check sealed_holdout contains friday with correct keys
    sealed = data.get("sealed_holdout", {})
    assert "friday" in sealed, "sealed_holdout must contain friday"
    friday_meta = sealed["friday"]
    assert friday_meta.get("sealed") is True
    assert friday_meta.get("status") == "sealed-holdout"
    assert friday_meta.get("audited") is False
    assert friday_meta.get("exists") is True
    assert "size_bytes" in friday_meta and isinstance(friday_meta["size_bytes"], int) and friday_meta["size_bytes"] > 0
    # Optional checksum if present must be 64 hex
    if friday_meta.get("sha256"):
        assert len(friday_meta["sha256"]) == 64
        int(friday_meta["sha256"], 16)
    # Must NOT have content fields
    for forbidden in ["label_distribution", "timestamp_range", "total_missing", "total_infinities", "duplicate_rows", "row_count", "missing_values_per_column"]:
        assert forbidden not in friday_meta, f"Sealed Friday metadata must not contain {forbidden}"


def test_friday_metadata_only():
    """Only non-content file metadata may be recorded for Friday: existence, filename, byte size, optional checksum."""
    assert REPORT_JSON.exists()
    data = json.loads(REPORT_JSON.read_text(encoding="utf-8"))
    # Top-level friday should be sealed metadata only
    friday_entry = data.get("friday")
    assert isinstance(friday_entry, dict), "Top-level friday should be sealed metadata dict"
    allowed_keys = {"file", "path", "sealed", "status", "reason", "exists", "size_bytes", "sha256", "audited"}
    # Allow only those keys (plus maybe case variations)
    for k in friday_entry.keys():
        assert k in allowed_keys, f"Friday top-level contains forbidden content key {k!r} - only metadata allowed"
    assert friday_entry.get("file") is not None
    assert friday_entry.get("size_bytes") is not None and friday_entry["size_bytes"] > 0
    assert friday_entry.get("exists") is True
    # Ensure no label/timestamp content
    assert "label_distribution" not in friday_entry
    assert "timestamp_range" not in friday_entry
    # Also check discovery has Friday filename
    discovery = data.get("discovery", {})
    assert "friday" in discovery
    assert discovery["friday"].lower().endswith(".csv")
    # Check that markdown does not contain Friday label stats
    md_text = (ROOT / "data" / "reports" / "data_quality.md").read_text(encoding="utf-8")
    # The markdown per-day audit for Friday should show SEALED, not label counts
    assert "SEALED" in md_text
    # Should not have Friday label distribution like "DDoS" in per-day table for Friday? The sealed row should be "SEALED"
    # Count that markdown contains sealed holdout section
    assert "Sealed Holdout" in md_text or "sealed holdout" in md_text.lower()


def test_friday_blocked_via_audit_single_file():
    """Tests explicitly fail if Friday is passed to _audit_single_file (pandas guard)."""
    # Find Friday file path via discovery
    discovered = discover_daily_files(RAW_DIR)
    friday_path = discovered["friday"]
    assert "friday" in friday_path.name.casefold()
    # _audit_single_file must raise ValueError with sealed message
    with pytest.raises(ValueError) as excinfo:
        _audit_single_file(friday_path)
    msg = str(excinfo.value).lower()
    assert "sealed" in msg and "friday" in msg
    # Also test with uppercase variant
    with tempfile.TemporaryDirectory() as tmp:
        tmp_path = Path(tmp)
        # Create a fake Friday CSV
        fake_friday = tmp_path / "FRIDAY-test.csv"
        fake_friday.write_text("Flow ID,Source IP,Destination IP,Timestamp,Label\n1,1.1.1.1,2.2.2.2,2017-07-07 09:00:00,BENIGN\n", encoding="utf-8")
        with pytest.raises(ValueError) as excinfo2:
            _audit_single_file(fake_friday)
        assert "sealed" in str(excinfo2.value).lower()


def test_friday_never_loaded_with_pandas(monkeypatch=None):
    """Tests explicitly fail if Friday is passed to pandas.read_csv or any CSV-content reader."""
    # Patch pandas.read_csv to detect Friday access
    calls = []

    original_read_csv = pd.read_csv

    def tracked_read_csv(path, *args, **kwargs):
        # Check if path contains friday
        path_str = str(path).lower()
        if "friday" in path_str:
            calls.append(path_str)
            pytest.fail(f"Friday content was loaded via pandas.read_csv: {path} - violates sealed holdout")
        return original_read_csv(path, *args, **kwargs)

    with mock.patch.object(pd, "read_csv", side_effect=tracked_read_csv):
        # Run audit - should not trigger Friday read
        data = run_audit()
        # Ensure no Friday calls were made
        assert not calls, f"pandas.read_csv was called with Friday path: {calls}"
        # Also ensure returned data does not contain Friday audit stats
        assert "friday" not in data.get("partitions", {})
        # Ensure sealed holdout still exists
        assert "friday" in data.get("sealed_holdout", {})


def test_no_unexpected_missing_day_fails():
    """Auditor must fail clearly if any day is missing (unit test of discovery)."""
    with tempfile.TemporaryDirectory() as tmp:
        tmp_path = Path(tmp)
        (tmp_path / "Monday-WorkingHours.csv").write_text("a,b\n1,2\n", encoding="utf-8")
        (tmp_path / "Tuesday-WorkingHours.csv").write_text("a,b\n1,2\n", encoding="utf-8")
        with pytest.raises(ValueError) as excinfo:
            discover_daily_files(tmp_path)
        msg = str(excinfo.value)
        assert "missing" in msg.lower() or "wednesday" in msg.lower() or "thursday" in msg.lower()
        assert "monday" in msg.lower() or "wednesday" in msg.lower() or "tuesday" in msg.lower()
    with tempfile.TemporaryDirectory() as tmp:
        tmp_path = Path(tmp)
        for day in ["monday", "tuesday", "wednesday", "thursday", "friday"]:
            name = day.upper() + "-TEST.csv" if day == "monday" else day.capitalize() + "-test.csv"
            (tmp_path / name).write_text("Flow ID,Source IP,Destination IP,Timestamp,Label\n1,1.1.1.1,2.2.2.2,2017-07-03 09:00:00,BENIGN\n", encoding="utf-8")
        discovered = discover_daily_files(tmp_path)
        for day in ["monday", "tuesday", "wednesday", "thursday", "friday"]:
            assert day in discovered


def test_rerunnable():
    """Running audit again without re-downloading must succeed and produce same JSON (deterministic)."""
    assert REPORT_JSON.exists()
    first_content = REPORT_JSON.read_text(encoding="utf-8")
    first_data = json.loads(first_content)
    second_data = run_audit()
    second_content = REPORT_JSON.read_text(encoding="utf-8")
    second_data_from_file = json.loads(second_content)

    def strip_volatile(d: dict) -> dict:
        copy_data = json.loads(json.dumps(d))
        for k in ["download_time", "generated_at"]:
            if k in copy_data:
                copy_data.pop(k, None)
            if "provenance" in copy_data and isinstance(copy_data["provenance"], dict):
                copy_data["provenance"].pop(k, None)
            if "metadata" in copy_data and isinstance(copy_data["metadata"], dict):
                copy_data["metadata"].pop("generated_at", None)
                copy_data["metadata"].pop("download_time", None)
        if "provenance" in copy_data and "download_time" in copy_data["provenance"]:
            del copy_data["provenance"]["download_time"]
        if "download_time" in copy_data:
            del copy_data["download_time"]
        return copy_data

    first_stripped = strip_volatile(first_data)
    second_stripped = strip_volatile(second_data_from_file)
    second_return_stripped = strip_volatile(second_data)
    assert first_stripped == second_return_stripped or first_stripped == second_stripped, (
        "Rerun produced different JSON (excluding volatile timestamps) - should be idempotent"
    )
    for day in ["monday", "tuesday", "wednesday", "thursday"]:
        part_first = (first_data.get("partitions") or {}).get(day) or first_data.get(day) or {}
        part_second = (second_data_from_file.get("partitions") or {}).get(day) or second_data_from_file.get(day) or {}
        if isinstance(part_first, dict) and "row_count" in part_first:
            assert part_first["row_count"] == part_second["row_count"], f"Row count for {day} changed on rerun"
    # Check sealed Friday size stable
    first_friday_size = first_data.get("sealed_holdout", {}).get("friday", {}).get("size_bytes")
    second_friday_size = second_data_from_file.get("sealed_holdout", {}).get("friday", {}).get("size_bytes")
    if first_friday_size and second_friday_size:
        assert first_friday_size == second_friday_size, "Friday size should be stable across reruns"
    assert first_data.get("data_mode") == second_data_from_file.get("data_mode") or \
           first_data.get("provenance", {}).get("data_mode") == second_data_from_file.get("provenance", {}).get("data_mode")


def test_raw_data_remains_ignored_and_reports_exist():
    """Raw data must remain under data/raw/ and reports under data/reports/."""
    assert RAW_DIR.exists(), "data/raw should exist"
    gitignore = ROOT / ".gitignore"
    assert gitignore.exists()
    git_content = gitignore.read_text(encoding="utf-8")
    assert "data/raw/" in git_content or "data/raw" in git_content, ".gitignore should ignore data/raw/"
    assert (ROOT / "data" / "reports" / "data_quality.json").exists()
    assert (ROOT / "data" / "reports" / "data_quality.md").exists()
    md_text = (ROOT / "data" / "reports" / "data_quality.md").read_text(encoding="utf-8")
    assert "Data Quality Report" in md_text or "data_quality" in md_text.lower()
    assert "monday" in md_text.lower() and "friday" in md_text.lower()
    assert "synthetic" in md_text.lower() or "downloaded" in md_text.lower()
    # Markdown must mention sealed holdout
    assert "sealed" in md_text.lower()


def test_label_distribution_and_schema():
    """Verify label distribution visible and schema has expected columns (audited days only)."""
    data = json.loads(REPORT_JSON.read_text(encoding="utf-8"))
    partitions = data.get("partitions") or {}
    mon = partitions.get("monday") or data.get("monday", {})
    if isinstance(mon, dict) and "label_distribution" in mon:
        labels = mon["label_distribution"]
        if "BENIGN" in labels:
            total = sum(labels.values())
            benign_ratio = labels["BENIGN"] / total if total else 0
            assert benign_ratio >= 0.90, f"Monday should be mostly BENIGN, got ratio {benign_ratio:.2f} with {labels}"
    any_partition = next(iter([v for v in partitions.values() if isinstance(v, dict) and "columns" in v]), None)
    if any_partition:
        cols = [c.lower().strip() for c in any_partition["columns"]]
        assert any("flow id" in c for c in cols), "Missing Flow ID column"
        assert any("source ip" in c for c in cols), "Missing Source IP"
        assert any("destination ip" in c for c in cols), "Missing Destination IP"
        assert any("timestamp" in c for c in cols), "Missing Timestamp"
        assert any("label" == c for c in cols), "Missing Label"
        assert len(cols) >= 30, f"Expected at least 30 columns, got {len(cols)}"
    global_stats = data.get("global") or {}
    total_inf = global_stats.get("total_infinities") if global_stats else None
    if total_inf is None:
        total_inf = data.get("total_infinities")
    if total_inf is not None:
        # Now only 4 audited files, each has 3 infinities => 12 total
        assert total_inf > 0, "Expected at least some infinities injected for audit"
        assert total_inf == 12, f"Expected 12 infinities (3 per audited file *4), got {total_inf}"
    total_dup = global_stats.get("total_duplicates") if global_stats else None
    if total_dup is None:
        total_dup = data.get("total_duplicates") or (global_stats.get("duplicate_rows") if global_stats else None)
    if total_dup is not None:
        # 3 duplicates per audited file *4 = 12
        assert total_dup == 12, f"Expected 12 duplicates (3 per audited file *4), got {total_dup}"


def test_timestamp_range_chronological():
    """Audited partitions (Monday-Thursday) should have parseable timestamp range; Friday must be sealed without timestamps."""
    data = json.loads(REPORT_JSON.read_text(encoding="utf-8"))
    partitions = data.get("partitions") or {}
    for day in ["monday", "tuesday", "wednesday", "thursday"]:
        stats = partitions.get(day)
        assert stats is not None, f"Missing audited stats for {day}"
        ts_range = stats.get("timestamp_range") or {}
        ts_min = ts_range.get("min")
        ts_max = ts_range.get("max")
        assert ts_min and ts_max, f"{day} missing timestamp range"
        from datetime import datetime
        try:
            min_dt = datetime.fromisoformat(ts_min)
            max_dt = datetime.fromisoformat(ts_max)
            assert min_dt <= max_dt, f"{day} timestamp min > max: {ts_min} > {ts_max}"
            day_to_date = {
                "monday": "2017-07-03",
                "tuesday": "2017-07-04",
                "wednesday": "2017-07-05",
                "thursday": "2017-07-06",
            }
            expected = day_to_date[day]
            assert expected in ts_min or expected in ts_max or min_dt.date().isoformat() == expected or max_dt.date().isoformat() == expected
        except ValueError:
            import pandas as pd
            min_dt = pd.to_datetime(ts_min)
            max_dt = pd.to_datetime(ts_max)
            assert min_dt <= max_dt
    # Friday must be sealed and must NOT have timestamp_range content
    friday_meta = data.get("sealed_holdout", {}).get("friday", {}) or data.get("friday", {})
    assert "timestamp_range" not in friday_meta, "Sealed Friday must not have timestamp_range"
    assert "label_distribution" not in friday_meta


def test_global_totals_exclude_friday():
    """Global totals must exclude Friday (sealed holdout)."""
    data = json.loads(REPORT_JSON.read_text(encoding="utf-8"))
    partitions = data.get("partitions", {})
    # Compute expected audited sum
    expected_rows = sum(partitions[d]["row_count"] for d in ["monday", "tuesday", "wednesday", "thursday"] if d in partitions)
    global_rows = data.get("global", {}).get("total_rows") or data.get("total_rows")
    assert global_rows == expected_rows, f"Global rows {global_rows} should equal audited sum {expected_rows}"
    # Ensure Friday size not counted in total_rows
    friday_size = data.get("sealed_holdout", {}).get("friday", {}).get("size_bytes")
    assert friday_size is not None and friday_size > 0
    # total_rows should be 4512 (1153+1103+1203+1053) not 5465
    assert global_rows == 4512, f"Expected audited total 4512 (Mon-Thu), got {global_rows}"
    # Ensure Friday's 953 rows not included
    assert global_rows != 5465, "Global rows must not include sealed Friday 953 rows"
