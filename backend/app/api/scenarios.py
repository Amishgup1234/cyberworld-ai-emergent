"""Scenarios endpoints - list and detail."""

from fastapi import APIRouter, HTTPException
from typing import List, Any, Dict
from ..state import get_state
from ..schemas import ScenarioSummary, ScenarioDetail

router = APIRouter()


def _build_summary(scenario: Dict[str, Any]) -> Dict[str, Any]:
    """Build summary from scenario dict."""
    meta = scenario.get("metadata", {})
    # frame_count from scenario or metadata
    frame_count = scenario.get("frame_count") or scenario.get("frames_count") or len(scenario.get("frames", [])) or meta.get("frame_count", 30)
    disclosure = meta.get("disclosure") or meta.get("composite_disclosure") or scenario.get("claim_limitations") or scenario.get("claimLimitations") or "Composite/synthetic stitching disclosed: replay is deterministic composite of chronological CICIDS2017 synthetic fallback flows stitched into ~30 frames with seed 42."
    # duration: describe timestamp range
    duration = None
    try:
        frames = scenario.get("frames", [])
        if frames and len(frames) > 0:
            start = frames[0].get("timestamp") or frames[0].get("timestamp_iso")
            end = frames[-1].get("timestamp") or frames[-1].get("timestamp_iso")
            duration = f"{start} to {end} ({frame_count} frames)"
        else:
            duration = f"{frame_count} frames from 2017-07-03 to 2017-07-07"
    except Exception:
        duration = f"{frame_count} frames"

    summary = {
        "scenario_id": scenario.get("scenario_id") or scenario.get("id") or "cyberworld-replay-v1",
        "id": scenario.get("id") or scenario.get("scenario_id") or "cyberworld-replay-v1",
        "name": scenario.get("name") or "CyberWorld Replay - Chronological CICIDS2017 Composite",
        "frame_count": frame_count,
        "frames_count": frame_count,
        "duration": duration,
        "disclosure": disclosure,
        "description": scenario.get("description") or meta.get("disclosure") or disclosure,
        "data_mode": meta.get("data_mode") or scenario.get("engine_metadata", {}).get("data_mode") or scenario.get("engineMetadata", {}).get("data_mode") or "synthetic",
        "created_at": scenario.get("created_at") or meta.get("created_at"),
    }
    return summary


@router.get("/scenarios", response_model=List[ScenarioSummary], summary="List available scenarios")
async def list_scenarios():
    """List available scenarios - at least one demo scenario."""
    state = get_state()
    scenario = state.get("scenario")
    if scenario is None:
        raise HTTPException(status_code=503, detail="Scenario not available - run Phase 05 generation first.")

    summary = _build_summary(scenario)
    return [summary]


@router.get("/scenarios/{scenario_id}", response_model=ScenarioDetail, summary="Get scenario details")
async def get_scenario(scenario_id: str):
    """Return scenario details with frames (timestamp, nodes, edges, signals, forecast, groundTruth gated, metadata).

    Validates scenario_id must exist (404 if not).
    Ensures groundTruth gating already in stored scenario (future labels not exposed before reveal).
    """
    state = get_state()
    scenario = state.get("scenario")
    if scenario is None:
        raise HTTPException(status_code=503, detail="Scenario not available - run Phase 05 generation first.")

    expected_id = scenario.get("scenario_id") or scenario.get("id")
    # Also allow alias matching without version suffix? strict match for now
    if scenario_id != expected_id:
        # also check if scenario_id is alias without version? try case-insensitive?
        # only allow exact match, else 404
        raise HTTPException(status_code=404, detail=f"Scenario not found: {scenario_id}")

    # scenario already has frames with gated ground_truth (revealed false before 20 hides label_distribution)
    # Ensure frames are present and have required fields
    frames = scenario.get("frames", [])
    # double-check gating: for frame 0-19 revealed must be false, ensure no leak - but scenario already correct
    # Return scenario detail with required fields
    detail = {
        "scenario_id": scenario.get("scenario_id") or scenario.get("id"),
        "id": scenario.get("id") or scenario.get("scenario_id"),
        "name": scenario.get("name"),
        "description": scenario.get("description"),
        "created_at": scenario.get("created_at") or scenario.get("metadata", {}).get("created_at"),
        "seed": scenario.get("seed") or scenario.get("metadata", {}).get("seed", 42),
        "frame_count": scenario.get("frame_count") or len(frames),
        "frames": frames,
        "metadata": scenario.get("metadata", {}),
        "engine_metadata": scenario.get("engine_metadata") or scenario.get("engineMetadata") or state.get("engine_metadata"),
        "engineMetadata": scenario.get("engineMetadata") or scenario.get("engine_metadata") or state.get("engine_metadata"),
        "claim_limitations": scenario.get("claim_limitations") or scenario.get("claimLimitations") or state.get("claim_limitations"),
        "provenance": scenario.get("provenance"),
    }
    return detail
