"""Metrics endpoint - returns EvaluationMetrics from artifacts/metrics.json."""

from fastapi import APIRouter, HTTPException
from ..state import get_state
from ..schemas import EvaluationMetrics

router = APIRouter()


@router.get("/metrics", summary="Get evaluation metrics with engine metadata", response_model=EvaluationMetrics)
async def get_metrics():
    """Return EvaluationMetrics from artifacts/metrics.json.

    Includes samples, precision, recall, F1, FPR, PR-AUC, ROC-AUC,
    confusion matrix, latency, claim limitations with engine metadata.
    """
    state = get_state()
    metrics = state.get("metrics")
    if metrics is None:
        raise HTTPException(status_code=503, detail="Metrics not available - model not yet trained. Run Phase 04 pipeline first.")

    # Ensure required fields are present; metrics.json already matches EvaluationMetrics structure
    # Inject engine_metadata if not present for completeness
    engine_meta = state.get("engine_metadata") or {}
    if "engine_metadata" not in metrics and engine_meta:
        metrics["engine_metadata"] = engine_meta
    # Also ensure claim_limitations alias
    if "claim_limitations" not in metrics and "limitations" in metrics:
        metrics["claim_limitations"] = metrics["limitations"]
    if "limitations" not in metrics and "claim_limitations" in metrics:
        metrics["limitations"] = metrics["claim_limitations"]

    # The metrics dict is large and already contains all needed fields, returning it directly
    # FastAPI will validate against EvaluationMetrics but allow extra fields via model_config extra=allow
    return metrics


@router.get("/metrics/health", include_in_schema=False)
async def metrics_health():
    """Lightweight metrics health check."""
    state = get_state()
    if state.get("metrics") is None:
        raise HTTPException(status_code=503, detail="Metrics not available")
    return {"status": "ok"}
