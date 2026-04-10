"""
Backend application entrypoint.
"""
import logging
import mimetypes
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from starlette.exceptions import HTTPException as StarletteHTTPException

from .adapters import ComfyUIAdapter, MockAdapter, adapter_registry
from .api import assets, engine_settings, generate, prompts, templates, workflows, ws
from .config import settings
from .services.engine_config_service import engine_config_service

logging.basicConfig(
    level=logging.DEBUG if settings.DEBUG else logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
logger = logging.getLogger(__name__)

# Some Windows environments map .js to text/plain, which makes module scripts fail to load.
mimetypes.add_type("text/javascript", ".js")
mimetypes.add_type("text/javascript", ".mjs")

for directory in (settings.UPLOAD_DIR, settings.OUTPUT_DIR):
    Path(directory).mkdir(parents=True, exist_ok=True)


class SpaStaticFiles(StaticFiles):
    """Static file handler that falls back to index.html for SPA routes."""

    _excluded_prefixes = (
        "api/",
        "docs",
        "redoc",
        "openapi.json",
        "uploads/",
        "outputs/",
        "ws/",
    )

    def _should_fallback(self, path: str) -> bool:
        normalized = path.lstrip("/")
        if not normalized:
            return True

        if any(normalized == prefix.rstrip("/") or normalized.startswith(prefix) for prefix in self._excluded_prefixes):
            return False

        return "." not in Path(normalized).name

    async def get_response(self, path: str, scope):
        try:
            response = await super().get_response(path, scope)
        except StarletteHTTPException as exc:
            if exc.status_code == 404 and self._should_fallback(path):
                return await super().get_response("index.html", scope)
            raise

        if response.status_code == 404 and self._should_fallback(path):
            return await super().get_response("index.html", scope)

        return response


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application startup and shutdown hooks."""

    logger.info("[Startup] %s backend starting", settings.APP_NAME)

    adapter_registry.register(
        MockAdapter(
            delay=settings.MOCK_DELAY,
            upload_dir=settings.UPLOAD_DIR,
            output_dir=settings.OUTPUT_DIR,
        )
    )

    refreshed = engine_config_service.refresh_runtime_adapters()

    if refreshed.get("volcengine"):
        logger.info("[Startup] Volcengine adapter ready")
    if refreshed.get("wanx"):
        logger.info("[Startup] Wanx adapter ready")

    if settings.COMFYUI_ENABLED:
        comfyui_adapter = ComfyUIAdapter(
            base_url=settings.COMFYUI_BASE_URL,
            poll_interval=settings.COMFYUI_POLL_INTERVAL,
            timeout=settings.COMFYUI_TIMEOUT,
            negative_prompt=settings.COMFYUI_NEGATIVE_PROMPT,
            workflow_template=settings.COMFYUI_WORKFLOW_TEMPLATE,
            reference_workflow_template=settings.COMFYUI_REFERENCE_WORKFLOW_TEMPLATE,
            upload_dir=settings.UPLOAD_DIR,
            output_dir=settings.OUTPUT_DIR,
        )
        adapter_registry.register(comfyui_adapter)

        if await comfyui_adapter.health_check():
            logger.info("[Startup] ComfyUI health check passed: %s", settings.COMFYUI_BASE_URL)
        else:
            logger.warning("[Startup] ComfyUI enabled but not reachable: %s", settings.COMFYUI_BASE_URL)

    logger.info("[Startup] registered adapters: %s", adapter_registry.list_adapters())
    frontend_dist_dir = Path(settings.FRONTEND_DIST_DIR)
    if settings.SERVE_FRONTEND and frontend_dist_dir.exists():
        logger.info("[Startup] serving frontend dist from %s", frontend_dist_dir)
    elif settings.SERVE_FRONTEND:
        logger.info("[Startup] frontend dist not found, API-only mode: %s", frontend_dist_dir)
    logger.info("[Startup] backend ready on port %s", settings.PORT)

    yield

    logger.info("[Shutdown] backend stopped")


app = FastAPI(
    title=settings.APP_NAME,
    description="SketchShot AI Storyboard Canvas backend API",
    version="0.5.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.mount("/uploads", StaticFiles(directory=settings.UPLOAD_DIR), name="uploads")
app.mount("/outputs", StaticFiles(directory=settings.OUTPUT_DIR), name="outputs")

app.include_router(workflows.router)
app.include_router(templates.router)
app.include_router(assets.router)
app.include_router(prompts.router)
app.include_router(generate.router)
app.include_router(engine_settings.router)
app.include_router(ws.router)


@app.get("/api/health")
async def health_check():
    """Health check endpoint."""

    return {
        "status": "ok",
        "app": settings.APP_NAME,
        "adapters": adapter_registry.list_adapters(),
        "default_adapter": settings.DEFAULT_ADAPTER,
        "prompt_provider": engine_config_service.get_prompt_provider(),
        "generate_provider": engine_config_service.get_generate_provider(),
        "comfyui_enabled": settings.COMFYUI_ENABLED,
        "volcengine_enabled": adapter_registry.get("volcengine") is not None,
        "volcengine_configured": engine_config_service.is_volcengine_configured(),
        "wanx_enabled": adapter_registry.get("wanx") is not None,
        "dashscope_configured": engine_config_service.is_dashscope_configured(),
    }


frontend_dist_dir = Path(settings.FRONTEND_DIST_DIR)
if settings.SERVE_FRONTEND and frontend_dist_dir.exists():
    app.mount("/", SpaStaticFiles(directory=str(frontend_dist_dir), html=True), name="frontend")
