"""
Generation API routes.
"""
import asyncio
import logging

from fastapi import APIRouter, HTTPException

from ..adapters.base import GenerateParams
from ..models.schemas import (
    GenerateRequest,
    GenerateResponse,
    TaskStatus,
    TaskStatusResponse,
    VideoGenerateRequest,
)
from ..services.task_service import task_service

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

    logger.info("[API] POST /api/generate/video node_id=%s adapter=%s", req.node_id, req.adapter)
    info = task_service.create_task(req.node_id)

    params = GenerateParams(
        task_type="video",
        prompt=req.prompt,
        aspect_ratio=req.aspect_ratio,
        source_images=req.source_images or [],
        duration_seconds=req.duration_seconds,
        motion_strength=req.motion_strength,
    )

    asyncio.create_task(task_service.run_task(info.task_id, req.adapter, params))

    return GenerateResponse(
        task_id=info.task_id,
        node_id=req.node_id,
        status=TaskStatus.PENDING,
        message="Video generation task accepted",
    )


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
        output_video=info.output_video,
        error_message=info.error_message,
    )
