"""
Runtime engine configuration API routes.
"""
from dataclasses import asdict

from fastapi import APIRouter

from ..models.schemas import (
    DashScopeConfigResponse,
    DashScopeConfigUpdateRequest,
    EngineSettingsResponse,
    EngineSettingsUpdateRequest,
    GenerateProvider,
    PromptProvider,
    VolcengineConfigResponse,
    VolcengineConfigUpdateRequest,
)
from ..services.engine_config_service import (
    DashScopeConfigSnapshot,
    EngineConfigSnapshot,
    VolcengineConfigSnapshot,
    engine_config_service,
)

router = APIRouter(prefix="/api/settings/engines", tags=["engine-settings"])


def _build_volcengine_response() -> VolcengineConfigResponse:
    current = engine_config_service.get_volcengine_config()
    return VolcengineConfigResponse(
        **asdict(current),
        configured=bool(current.ark_api_key.strip()),
    )


def _build_dashscope_response() -> DashScopeConfigResponse:
    current = engine_config_service.get_dashscope_config()
    return DashScopeConfigResponse(
        **asdict(current),
        configured=bool(current.api_key.strip()),
        oss_configured=engine_config_service.is_aliyun_oss_configured(),
    )


@router.get("", response_model=EngineSettingsResponse)
async def get_engine_settings():
    """Return the current editable engine settings."""

    current = engine_config_service.get_engine_config()
    return EngineSettingsResponse(
        prompt_provider=PromptProvider(current.prompt_provider),
        generate_provider=GenerateProvider(current.generate_provider),
        volcengine=_build_volcengine_response(),
        dashscope=_build_dashscope_response(),
    )


@router.put("", response_model=EngineSettingsResponse)
async def update_engine_settings(req: EngineSettingsUpdateRequest):
    """Persist engine settings and refresh runtime adapters."""

    saved = engine_config_service.save_engine_config(
        EngineConfigSnapshot(
            prompt_provider=req.prompt_provider.value,
            generate_provider=req.generate_provider.value,
            volcengine=VolcengineConfigSnapshot(
                ark_base_url=req.volcengine.ark_base_url,
                ark_api_key=req.volcengine.ark_api_key,
                prompt_model=req.volcengine.prompt_model,
                image_model=req.volcengine.image_model,
                image_edit_model=req.volcengine.image_edit_model,
                video_model=req.volcengine.video_model,
            ),
            dashscope=DashScopeConfigSnapshot(
                base_url=req.dashscope.base_url,
                api_key=req.dashscope.api_key,
                qwen_text_model=req.dashscope.qwen_text_model,
                qwen_multimodal_model=req.dashscope.qwen_multimodal_model,
                wanx_image_model=req.dashscope.wanx_image_model,
                wanx_video_model=req.dashscope.wanx_video_model,
                wanx_video_resolution=req.dashscope.wanx_video_resolution,
                wanx_watermark=req.dashscope.wanx_watermark,
                oss_region=req.dashscope.oss_region,
                oss_endpoint=req.dashscope.oss_endpoint,
                oss_access_key_id=req.dashscope.oss_access_key_id,
                oss_access_key_secret=req.dashscope.oss_access_key_secret,
                oss_bucket=req.dashscope.oss_bucket,
                oss_key_prefix=req.dashscope.oss_key_prefix,
            ),
        )
    )
    engine_config_service.refresh_runtime_adapters()

    return EngineSettingsResponse(
        prompt_provider=PromptProvider(saved.prompt_provider),
        generate_provider=GenerateProvider(saved.generate_provider),
        volcengine=VolcengineConfigResponse(
            **asdict(saved.volcengine),
            configured=bool(saved.volcengine.ark_api_key.strip()),
        ),
        dashscope=DashScopeConfigResponse(
            **asdict(saved.dashscope),
            configured=bool(saved.dashscope.api_key.strip()),
            oss_configured=engine_config_service.is_aliyun_oss_configured(),
        ),
    )


@router.get("/volcengine", response_model=VolcengineConfigResponse)
async def get_volcengine_config():
    """Return the current editable Volcengine configuration."""

    return _build_volcengine_response()


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


@router.get("/dashscope", response_model=DashScopeConfigResponse)
async def get_dashscope_config():
    """Return the current editable DashScope configuration."""

    return _build_dashscope_response()


@router.put("/dashscope", response_model=DashScopeConfigResponse)
async def update_dashscope_config(req: DashScopeConfigUpdateRequest):
    """Persist DashScope configuration and refresh the Wanx runtime adapter."""

    saved = engine_config_service.save_dashscope_config(
        DashScopeConfigSnapshot(
            base_url=req.base_url,
            api_key=req.api_key,
            qwen_text_model=req.qwen_text_model,
            qwen_multimodal_model=req.qwen_multimodal_model,
            wanx_image_model=req.wanx_image_model,
            wanx_video_model=req.wanx_video_model,
            wanx_video_resolution=req.wanx_video_resolution,
            wanx_watermark=req.wanx_watermark,
            oss_region=req.oss_region,
            oss_endpoint=req.oss_endpoint,
            oss_access_key_id=req.oss_access_key_id,
            oss_access_key_secret=req.oss_access_key_secret,
            oss_bucket=req.oss_bucket,
            oss_key_prefix=req.oss_key_prefix,
        )
    )
    engine_config_service.refresh_wanx_adapter()

    return DashScopeConfigResponse(
        **asdict(saved),
        configured=bool(saved.api_key.strip()),
        oss_configured=engine_config_service.is_aliyun_oss_configured(),
    )
