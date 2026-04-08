"""
Runtime engine configuration API routes.
"""
from dataclasses import asdict

from fastapi import APIRouter

from ..models.schemas import VolcengineConfigResponse, VolcengineConfigUpdateRequest
from ..services.engine_config_service import VolcengineConfigSnapshot, engine_config_service

router = APIRouter(prefix="/api/settings/engines", tags=["engine-settings"])


@router.get("/volcengine", response_model=VolcengineConfigResponse)
async def get_volcengine_config():
    """Return the current editable Volcengine configuration."""

    current = engine_config_service.get_volcengine_config()
    return VolcengineConfigResponse(
        **asdict(current),
        configured=bool(current.ark_api_key.strip()),
    )


@router.put("/volcengine", response_model=VolcengineConfigResponse)
async def update_volcengine_config(req: VolcengineConfigUpdateRequest):
    """Persist Volcengine configuration and refresh the runtime adapter."""

    saved = engine_config_service.save_volcengine_config(
        VolcengineConfigSnapshot(
            ark_base_url=req.ark_base_url,
            ark_api_key=req.ark_api_key,
            prompt_model=req.prompt_model,
            image_model=req.image_model,
            image_edit_model=req.image_edit_model,
            video_model=req.video_model,
        )
    )
    engine_config_service.refresh_volcengine_adapter()

    return VolcengineConfigResponse(
        **asdict(saved),
        configured=bool(saved.ark_api_key.strip()),
    )
