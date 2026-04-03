"""
Backend application entrypoint.
"""
import logging
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from .adapters import ComfyUIAdapter, MockAdapter, VolcengineAdapter, adapter_registry
from .api import assets, generate, prompts, workflows, ws
from .config import settings
from .services.volcengine_client import VolcengineClient

logging.basicConfig(
    level=logging.DEBUG if settings.DEBUG else logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
logger = logging.getLogger(__name__)

for directory in (settings.UPLOAD_DIR, settings.OUTPUT_DIR):
    Path(directory).mkdir(parents=True, exist_ok=True)


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

    if settings.VOLCENGINE_ENABLED and settings.ARK_API_KEY.strip():
        adapter_registry.register(
            VolcengineAdapter(
                client=VolcengineClient(
                    base_url=settings.ARK_BASE_URL,
                    api_key=settings.ARK_API_KEY,
                    timeout=settings.VOLCENGINE_REQUEST_TIMEOUT,
                ),
                upload_dir=settings.UPLOAD_DIR,
                output_dir=settings.OUTPUT_DIR,
                image_model=settings.VOLCENGINE_IMAGE_MODEL,
                image_edit_model=settings.VOLCENGINE_IMAGE_EDIT_MODEL,
                video_model=settings.VOLCENGINE_VIDEO_MODEL,
                poll_interval=settings.VOLCENGINE_POLL_INTERVAL,
                video_timeout=settings.VOLCENGINE_VIDEO_TIMEOUT,
                public_base_url=settings.PUBLIC_BASE_URL,
                output_format=settings.VOLCENGINE_IMAGE_OUTPUT_FORMAT,
                watermark=settings.VOLCENGINE_WATERMARK,
            )
        )
    elif settings.VOLCENGINE_ENABLED:
        logger.warning("[Startup] Volcengine enabled but ARK_API_KEY is empty; adapter not registered")

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
app.include_router(assets.router)
app.include_router(prompts.router)
app.include_router(generate.router)
app.include_router(ws.router)


@app.get("/api/health")
async def health_check():
    """Health check endpoint."""

    return {
        "status": "ok",
        "app": settings.APP_NAME,
        "adapters": adapter_registry.list_adapters(),
        "default_adapter": settings.DEFAULT_ADAPTER,
        "comfyui_enabled": settings.COMFYUI_ENABLED,
        "volcengine_enabled": settings.VOLCENGINE_ENABLED,
    }
