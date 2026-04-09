"""
Prompt generation API routes.
"""
from fastapi import APIRouter, HTTPException

from ..models.schemas import (
    ContinuityFramesGenerateRequest,
    ContinuityFramesGenerateResponse,
    PromptGenerateRequest,
    PromptGenerateResponse,
)
from ..services.prompt_service import prompt_service

router = APIRouter(prefix="/api/prompts", tags=["prompts"])


@router.post("/generate", response_model=PromptGenerateResponse)
async def generate_prompt(req: PromptGenerateRequest):
    """Generate a refined image/video prompt using the active prompt provider."""

    if not prompt_service.is_available:
        raise HTTPException(
            status_code=503,
            detail=f"Prompt provider '{prompt_service.provider_name}' is not configured",
        )

    try:
        return await prompt_service.generate_prompt(req)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc


@router.post("/continuity/frames", response_model=ContinuityFramesGenerateResponse)
async def generate_continuity_frames(req: ContinuityFramesGenerateRequest):
    """Generate nine continuity frame descriptions for a 3x3 storyboard grid."""

    if not prompt_service.is_available:
        raise HTTPException(
            status_code=503,
            detail=f"Prompt provider '{prompt_service.provider_name}' is not configured",
        )

    try:
        return await prompt_service.generate_continuity_frames(req)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
