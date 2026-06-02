"""
Generation API routes.
"""
import asyncio
import logging
from pathlib import Path

from fastapi import APIRouter, HTTPException

from ..adapters.base import GenerateParams
from ..models.schemas import (
    AnimateMixGenerateRequest,
    ClonedVoiceItem,
    ClonedVoiceListResponse,
    DigitalHumanGenerateRequest,
    GenerateRequest,
    GenerateResponse,
    TaskStatus,
    TaskStatusResponse,
    TTSGenerateRequest,
    VideoEditGenerateRequest,
    VideoGenerateRequest,
    VoiceCloneRequest,
    VoiceCloneResponse,
)
from ..services.task_service import task_service
from ..services.engine_config_service import engine_config_service

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/generate", tags=["generation"])


@router.post("", response_model=GenerateResponse)
async def create_generate_task(req: GenerateRequest):
    """Create an image generation task."""

    logger.info("[API] POST /api/generate node_id=%s adapter=%s", req.node_id, req.adapter)
    info = task_service.create_task(req.node_id)

    params = GenerateParams(
        task_type="image",
        prompt=req.prompt,
        aspect_ratio=req.aspect_ratio,
        resolution=req.resolution,
        reference_images=req.reference_images or [],
        identity_lock=req.identity_lock,
        identity_strength=req.identity_strength,
        negative_prompt=req.negative_prompt,
    )

    asyncio.create_task(task_service.run_task(info.task_id, req.adapter, params))

    return GenerateResponse(
        task_id=info.task_id,
        node_id=req.node_id,
        status=TaskStatus.PENDING,
        message="Image generation task accepted",
    )


@router.post("/video", response_model=GenerateResponse)
async def create_video_generate_task(req: VideoGenerateRequest):
    """Create a video generation task."""

    logger.info(
        "[API] POST /api/generate/video node_id=%s adapter=%s task_type=%s version=%s "
        "source_images=%d ref_images=%d ref_videos=%d ref_audios=%d "
        "with_audio=%s happyhorse_mode=%s seed=%s resolution=%s duration=%s",
        req.node_id,
        req.adapter,
        req.task_type,
        req.seedance_version,
        len(req.source_images or []),
        len(req.reference_images or []),
        len(req.reference_videos or []),
        len(req.reference_audios or []),
        req.with_audio,
        req.happyhorse_mode,
        req.seed,
        req.video_resolution,
        req.duration_seconds,
    )
    info = task_service.create_task(req.node_id)

    params = GenerateParams(
        task_type=req.task_type,
        prompt=req.prompt,
        aspect_ratio=req.aspect_ratio,
        source_images=req.source_images or [],
        reference_images=req.reference_images or [],
        duration_seconds=req.duration_seconds,
        motion_strength=req.motion_strength,
        video_version=req.seedance_version,
        generate_audio=req.generate_audio,
        with_audio=req.with_audio,
        happyhorse_mode=req.happyhorse_mode,
        video_resolution=req.video_resolution,
        negative_prompt=req.negative_prompt,
        seed=req.seed,
        camera_fixed=req.camera_fixed,
        video_model_tier=req.video_model_tier,
        return_last_frame=req.return_last_frame,
        reference_videos=req.reference_videos or [],
        reference_audios=req.reference_audios or [],
        multi_image_role=req.multi_image_role or "transition",
    )

    asyncio.create_task(task_service.run_task(info.task_id, req.adapter, params))

    return GenerateResponse(
        task_id=info.task_id,
        node_id=req.node_id,
        status=TaskStatus.PENDING,
        message="Video generation task accepted",
    )




@router.post("/video/edit", response_model=GenerateResponse)
async def create_video_edit_task(req: VideoEditGenerateRequest):
    """Create a video editing task."""

    logger.info(
        "[API] POST /api/generate/video/edit node_id=%s adapter=%s seedance_version=%s has_source_video=%s ref_images=%d",
        req.node_id,
        req.adapter,
        req.seedance_version,
        bool(req.source_video),
        len(req.reference_images or []),
    )
    info = task_service.create_task(req.node_id)

    params = GenerateParams(
        task_type="vedit",
        prompt=req.prompt,
        source_video=req.source_video or None,
        reference_images=req.reference_images or [],
        resolution=req.resolution,
        vedit_model=req.vedit_model or "",
        video_version=req.seedance_version or "1.5",
        generate_audio=req.generate_audio,
        video_resolution=req.video_resolution,
        negative_prompt=req.negative_prompt,
        seed=req.seed,
        camera_fixed=req.camera_fixed,
        return_last_frame=req.return_last_frame,
        duration_seconds=req.duration_seconds,
    )

    asyncio.create_task(task_service.run_task(info.task_id, req.adapter, params))

    return GenerateResponse(
        task_id=info.task_id,
        node_id=req.node_id,
        status=TaskStatus.PENDING,
        message="Video editing task accepted",
    )


@router.post("/video/animate-mix", response_model=GenerateResponse)
async def create_animate_mix_task(req: AnimateMixGenerateRequest):
    """Create an AnimateMix (video face swap) task."""

    logger.info("[API] POST /api/generate/video/animate-mix node_id=%s adapter=%s", req.node_id, req.adapter)
    info = task_service.create_task(req.node_id)

    params = GenerateParams(
        task_type="animate_mix",
        prompt="",
        source_video=req.source_video or None,
        reference_images=[req.source_image] if req.source_image else [],
        video_version=req.mode or "wan-std",
    )

    asyncio.create_task(task_service.run_task(info.task_id, req.adapter, params))

    return GenerateResponse(
        task_id=info.task_id,
        node_id=req.node_id,
        status=TaskStatus.PENDING,
        message="AnimateMix task accepted",
    )


@router.post("/video/digital-human", response_model=GenerateResponse)
async def create_digital_human_task(req: DigitalHumanGenerateRequest):
    """Create a Digital Human (S2V) task — supports two modes:
    1. TTS mode: ``text`` is converted to speech, then S2V generates video.
    2. Audio upload mode: ``audio_url`` is used directly, TTS is skipped.
    """

    logger.info("[API] POST /api/generate/video/digital-human node_id=%s", req.node_id)
    info = task_service.create_task(req.node_id)

    params = GenerateParams(
        task_type="digital_human",
        prompt=req.text,
        source_images=[req.source_image] if req.source_image else [],
        source_audio=req.audio_url or "",
        voice=req.voice,
        s2v_style=req.style,
        s2v_resolution=req.resolution,
    )

    asyncio.create_task(task_service.run_task(info.task_id, req.adapter, params))

    return GenerateResponse(
        task_id=info.task_id,
        node_id=req.node_id,
        status=TaskStatus.PENDING,
        message="数字人任务已接受",
    )


def _is_cloned_voice_id(voice_id: str) -> bool:
    """Check whether a voice ID is a cloned (DashScope) voice."""
    service = _get_voice_cloning_service()
    return service.is_cloned_voice(voice_id)


@router.post("/tts")
async def generate_tts_audio(req: TTSGenerateRequest):
    """Standalone TTS generation — synthesize text to speech and return audio URL.

    Auto-routing: cloned voice IDs → DashScope TTS; everything else → Volcengine TTS.
    Set ``tts_provider`` to ``dashscope`` or ``volcengine`` for manual override.
    """
    from ..config import settings
    from ..services.tts_service import TtsService

    output_dir = Path(settings.OUTPUT_DIR)

    # Determine which provider to use
    use_dashscope = False
    if req.tts_provider == "dashscope":
        use_dashscope = True
    elif req.tts_provider in ("auto", ""):
        use_dashscope = req.voice and _is_cloned_voice_id(req.voice)

    try:
        if use_dashscope:
            from ..services.dashscope_tts_service import DashScopeTtsService

            dashscope_cfg = engine_config_service.get_dashscope_config()
            from ..services.dashscope_client import DashScopeClient

            client = DashScopeClient(
                base_url=dashscope_cfg.base_url or settings.DASHSCOPE_BASE_URL,
                api_key=dashscope_cfg.api_key or settings.DASHSCOPE_API_KEY,
                timeout=settings.DASHSCOPE_REQUEST_TIMEOUT,
            )
            ds_tts = DashScopeTtsService(
                client=client,
                output_dir=settings.OUTPUT_DIR,
                tts_vc_model=dashscope_cfg.tts_vc_model or settings.DASHSCOPE_TTS_VC_MODEL,
            )
            result = await ds_tts.generate_speech(req.text, req.voice)
        else:
            tts = TtsService(
                app_id=settings.VOLCENGINE_TTS_APP_ID,
                access_key=settings.VOLCENGINE_TTS_ACCESS_KEY,
                resource_id=settings.VOLCENGINE_TTS_RESOURCE_ID,
                base_url=settings.VOLCENGINE_TTS_BASE_URL,
                default_speaker=settings.VOLCENGINE_TTS_DEFAULT_SPEAKER,
                timeout=settings.VOLCENGINE_TTS_TIMEOUT,
                output_dir=settings.OUTPUT_DIR,
            )
            result = await tts.generate_speech(
                req.text,
                req.voice,
                speech_rate=req.speech_rate,
                loudness_rate=req.loudness_rate,
            )

        try:
            relative = Path(result).relative_to(output_dir)
            audio_url = f"/outputs/{relative.as_posix()}"
        except ValueError:
            audio_url = result
        return {"success": True, "audio_url": audio_url}
    except Exception as exc:
        return {"success": False, "error": str(exc)}


@router.post("/tts/test")
async def test_tts():
    """Test the Volcengine TTS connection directly."""
    from ..adapters import adapter_registry
    from ..config import settings
    from ..services.tts_service import TtsService

    adapter = adapter_registry.get("happyhorse")
    tts = getattr(adapter, "_tts_service", None) if adapter else None

    if not tts:
        tts = TtsService(
            app_id=settings.VOLCENGINE_TTS_APP_ID,
            access_key=settings.VOLCENGINE_TTS_ACCESS_KEY,
            resource_id=settings.VOLCENGINE_TTS_RESOURCE_ID,
            base_url=settings.VOLCENGINE_TTS_BASE_URL,
            default_speaker=settings.VOLCENGINE_TTS_DEFAULT_SPEAKER,
            output_dir=settings.OUTPUT_DIR,
        )

    try:
        result = await tts.generate_speech("你好世界，这是一个测试。")
        return {"success": True, "path": result}
    except Exception as exc:
        return {"success": False, "error": str(exc), "type": type(exc).__name__}


@router.get("/{task_id}/status", response_model=TaskStatusResponse)
async def get_task_status(task_id: str):
    """Query a task by task ID."""

    info = task_service.get_task(task_id)
    if not info:
        raise HTTPException(status_code=404, detail="Task not found")

    return TaskStatusResponse(
        task_id=info.task_id,
        node_id=info.node_id,
        status=info.status,
        progress=info.progress,
        output_image=info.output_image,
        output_image_original_url=info.output_image_original_url,
        output_video=info.output_video,
        output_last_frame=info.output_last_frame,
        error_message=info.error_message,
    )


# ------------------------------------------------------------------
# Voice cloning endpoints
# ------------------------------------------------------------------

_voice_cloning_service: "VoiceCloningService | None" = None


def _get_voice_cloning_service():
    """Lazily create a VoiceCloningService from current engine config."""
    global _voice_cloning_service
    if _voice_cloning_service is None:
        from ..config import settings
        from ..services.dashscope_client import DashScopeClient
        from ..services.voice_cloning_service import VoiceCloningService

        dashscope_cfg = engine_config_service.get_dashscope_config()
        client = DashScopeClient(
            base_url=dashscope_cfg.base_url or settings.DASHSCOPE_BASE_URL,
            api_key=dashscope_cfg.api_key or settings.DASHSCOPE_API_KEY,
            timeout=settings.DASHSCOPE_REQUEST_TIMEOUT,
        )
        _voice_cloning_service = VoiceCloningService(
            client=client,
            data_dir=Path(settings.OUTPUT_DIR).parent / "data",
            enrollment_model=dashscope_cfg.voice_enrollment_model
            or settings.DASHSCOPE_VOICE_ENROLLMENT_MODEL,
            tts_vc_model=dashscope_cfg.tts_vc_model or settings.DASHSCOPE_TTS_VC_MODEL,
        )
    return _voice_cloning_service


@router.post("/voice-clone", response_model=VoiceCloneResponse)
async def create_cloned_voice(req: VoiceCloneRequest):
    """Create a cloned voice from base64 audio."""
    service = _get_voice_cloning_service()
    try:
        result = await service.create_voice(
            audio_base64=req.audio_base64,
            name=req.name,
            audio_mime_type=req.audio_mime_type,
        )
        return VoiceCloneResponse(**result)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"声音复刻失败: {exc}") from exc


@router.get("/voice-clone", response_model=ClonedVoiceListResponse)
async def list_cloned_voices():
    """List all locally stored cloned voices."""
    service = _get_voice_cloning_service()
    try:
        voices = await service.list_voices()
        return ClonedVoiceListResponse(
            voices=[ClonedVoiceItem(**v) for v in voices],
        )
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"获取声音列表失败: {exc}") from exc


@router.delete("/voice-clone/{voice_id}")
async def delete_cloned_voice(voice_id: str):
    """Delete a cloned voice from local storage."""
    service = _get_voice_cloning_service()
    deleted = await service.delete_voice(voice_id)
    if not deleted:
        raise HTTPException(status_code=404, detail=f"声音 {voice_id} 不存在")
    return {"success": True, "voice_id": voice_id}
