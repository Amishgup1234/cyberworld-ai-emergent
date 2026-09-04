"""Health check endpoints - includes engine metadata per Phase 06."""

from fastapi import APIRouter
from ..state import get_state, load_state
from ..schemas import HealthResponse, EngineMetadata

router = APIRouter()


@router.get("/health", response_model=HealthResponse, summary="Health check with engine metadata")
async def health_check():
    """Health check endpoint - returns engine metadata.

    Returns status ok, engine not-trained or trained, model_family, data_mode, version,
    and claim limitations. Handles missing files gracefully (engine not-trained if model missing).
    """
    state = get_state()
    # ensure loaded
    if not state.get("loaded"):
        state = load_state()

    engine = "trained" if state.get("model_payload") is not None and state.get("scenario") is not None else "not-trained"
    # If model missing but scenario exists? considered not-trained per spec
    if state.get("model_payload") is None:
        engine = "not-trained"

    engine_meta = state.get("engine_metadata") or {}
    model_family = engine_meta.get("model_family") if engine == "trained" else None
    # ensure data_mode always present
    data_mode = engine_meta.get("data_mode", "synthetic")
    version = engine_meta.get("version", "0.1.0") or engine_meta.get("model_version", "0.1.0")
    threshold = engine_meta.get("threshold", 0.45)
    claim_limitations = engine_meta.get("claim_limitations")
    feature_count = engine_meta.get("feature_count", 80)

    # message per spec
    if engine == "trained":
        message = f"Backend is running. Model trained ({model_family}). Data mode {data_mode}."
    else:
        message = "Backend is running. Model not yet trained."

    # Build EngineMetadata object if trained for extra context
    engine_metadata_obj = None
    if engine == "trained":
        try:
            engine_metadata_obj = EngineMetadata(
                model_family=model_family or "random_forest",
                model_version=version,
                data_mode=data_mode,
                feature_schema_version=engine_meta.get("feature_schema_version", "phase03-v1-sealed"),
                feature_count=feature_count,
                claim_limitations=claim_limitations or "Binary benign-versus-malicious risk only (learned); stage estimate is rule-derived evidence score; target ranking is NetworkX graph-ranked; isolation is simulated estimate - not causal proof",
                threshold=threshold,
                mitre_version=engine_meta.get("mitre_version", "13.1"),
                version=version,
                data_source_url=engine_meta.get("data_source_url", "https://www.unb.ca/cic/datasets/ids-2017.html"),
            )
        except Exception:
            engine_metadata_obj = None

    response = {
        "status": "ok",
        "engine": engine,
        "model_family": model_family,
        "data_mode": data_mode,
        "version": version,
        "message": message,
        "feature_count": feature_count if engine == "trained" else None,
        "threshold": threshold if engine == "trained" else None,
        "claim_limitations": claim_limitations if engine == "trained" else None,
        "engine_metadata": engine_metadata_obj.model_dump() if engine_metadata_obj else engine_meta if engine == "trained" else None,
    }
    # Filter None for not-trained to keep backwards compat with test_health that expects not-trained minimal?
    # But we want to include fields even when not-trained? We'll return as per above and allow frontend to handle.
    return response
