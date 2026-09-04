"""CyberWorld AI FastAPI Application."""

from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .api.health import router as health_router
from .api.metrics import router as metrics_router
from .api.scenarios import router as scenarios_router
from .api.forecast import router as forecast_router
from .api.simulate import router as simulate_router


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan manager - loads model and scenario once at startup."""
    # Startup: load state once, handles missing files gracefully but preserves diagnostics
    try:
        from .state import load_state

        load_state()
    except Exception as e:
        # Preserve diagnostic information for health check and logs, still allow graceful not-trained fallback
        try:
            from .state import _state

            _state["load_error"] = f"lifespan load_state failed: {e}"
            # Mark as loaded to avoid repeated attempts, but keep model_payload None so health is not-trained
            _state["loaded"] = True
        except Exception:
            pass
        import traceback
        import sys

        print(f"Warning: load_state failed in lifespan: {e}", file=sys.stderr)
        traceback.print_exc(file=sys.stderr)
    yield
    # Shutdown: nothing special


app = FastAPI(
    title="CyberWorld AI",
    description="Predictive cybersecurity decision-support prototype - Replay -> Risk model -> Temporal state -> Stage estimate -> Target ranking -> Evidence and MITRE -> Simulated isolation -> Before/after comparison",
    version="0.1.0",
    lifespan=lifespan,
)

# CORS for frontend development
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Version all public API routes under /api/v1.
app.include_router(health_router, prefix="/api/v1", tags=["health"])
app.include_router(metrics_router, prefix="/api/v1", tags=["metrics"])
app.include_router(scenarios_router, prefix="/api/v1", tags=["scenarios"])
app.include_router(forecast_router, prefix="/api/v1", tags=["forecast"])
app.include_router(simulate_router, prefix="/api/v1", tags=["simulation"])
