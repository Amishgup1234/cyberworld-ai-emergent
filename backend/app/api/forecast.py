"""Forecast endpoint - validates scenario/frame and returns Forecast without future labels."""

from fastapi import APIRouter, HTTPException
from ..state import get_state
from ..schemas import ForecastRequest, ForecastResponse

router = APIRouter()


def _resolve_request_ids(req: ForecastRequest) -> tuple[str, int]:
    """Resolve effective scenario_id and frame_id from alias fields."""
    effective_id = req.scenario_id or req.scenario
    effective_frame = req.frame_id if req.frame_id is not None else req.frame
    # If still none, maybe they sent extra fields via model_config extra=allow and raw dict? But Pydantic will have captured.
    if effective_id is None:
        raise HTTPException(status_code=422, detail="scenario_id or scenario is required")
    if effective_frame is None:
        raise HTTPException(status_code=422, detail="frame_id or frame is required")
    # frame range validation already done via ge/le, but ensure int
    if not isinstance(effective_frame, int):
        raise HTTPException(status_code=422, detail="frame_id must be integer 0..29")
    if effective_frame < 0 or effective_frame > 29:
        raise HTTPException(status_code=422, detail="frame_id must be within 0..29 inclusive")
    return effective_id, effective_frame


@router.post("/forecast", response_model=ForecastResponse, summary="Get forecast for a frame")
async def post_forecast(payload: ForecastRequest):
    """POST /forecast - input {scenario_id, frame_id} or {scenario, frame}.

    Returns Forecast with raw risk, smoothed risk, slope, stage estimate,
    target ranking, evidence, MITRE, engine metadata.

    Enforces:
    - scenario_id must exist (404 if not)
    - frame_id must be within 0..29 (422 if out of range, handled by Pydantic)
    - Test labels are not returned before their frame: ground_truth.revealed false with no label_distribution
      (ensured via stored scenario gating, and we double-check to strip any leaked fields)
    - Future labels must not be exposed to forecasting pipeline (already handled in scenario.py)
    """
    scenario_id, frame_id = _resolve_request_ids(payload)

    state = get_state()
    scenario = state.get("scenario")
    if scenario is None:
        raise HTTPException(status_code=503, detail="Scenario not loaded - run Phase 05 first")

    expected_id = scenario.get("scenario_id") or scenario.get("id")
    if scenario_id != expected_id:
        raise HTTPException(status_code=404, detail=f"Scenario not found: {scenario_id}")

    frames = scenario.get("frames", [])
    if not frames:
        raise HTTPException(status_code=500, detail="Scenario has no frames")

    # frame range check (Pydantic already validates 0..29, but scenario frame_count might be 30 and we should also check vs actual length)
    if frame_id < 0 or frame_id >= len(frames):
        raise HTTPException(status_code=422, detail=f"frame_id {frame_id} out of range 0..{len(frames)-1}")

    frame = frames[frame_id]

    # Build forecast response - frame already contains gated ground_truth (revealed false before correct frame hides label_distribution)
    # We ensure we don't leak future labels: if revealed false, ensure label_distribution is None even if stored incorrectly
    ground_truth = frame.get("ground_truth") or frame.get("groundTruth") or {}
    # Defensive: if revealed false but label_distribution present, strip it
    if ground_truth.get("revealed") is False:
        # ensure no label_distribution leak
        gt_copy = dict(ground_truth)
        if gt_copy.get("label_distribution") is not None:
            gt_copy["label_distribution"] = None
        if gt_copy.get("label_distribution_current_frame") is not None:
            gt_copy["label_distribution_current_frame"] = None
        if gt_copy.get("true_malicious_count") is not None:
            gt_copy["true_malicious_count"] = None
        if gt_copy.get("true_malicious_ratio") is not None:
            gt_copy["true_malicious_ratio"] = None
        if gt_copy.get("attack_type") is not None:
            gt_copy["attack_type"] = None
        ground_truth = gt_copy
    # also need to ensure groundTruth alias same
    groundTruth_alias = ground_truth

    # Extract forecast fields from frame
    forecast = frame.get("forecast") or {}
    signals = frame.get("signals") or {}

    # Ensure forecast contains engine_metadata
    engine_meta = state.get("engine_metadata") or forecast.get("engine_metadata") or forecast.get("engineMetadata") or {}
    if "engine_metadata" not in forecast and engine_meta:
        forecast["engine_metadata"] = engine_meta
    if "engineMetadata" not in forecast and engine_meta:
        forecast["engineMetadata"] = engine_meta

    # Build response
    response = {
        "scenario_id": scenario_id,
        "frame_id": frame_id,
        "forecast": forecast,
        "ground_truth": ground_truth,
        "groundTruth": groundTruth_alias,
        "signals": signals,
        "flow_summary": frame.get("flow_summary"),
        "nodes": frame.get("nodes"),
        "edges": frame.get("edges"),
        "engine_metadata": engine_meta,
        "timestamp": frame.get("timestamp") or frame.get("timestamp_iso"),
    }
    return response
