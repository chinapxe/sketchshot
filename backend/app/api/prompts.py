"""
Prompt generation API routes.
"""
from fastapi import APIRouter, HTTPException

from ..models.schemas import (
    ContinuityFramesGenerateRequest,
    ContinuityFramesGenerateResponse,
    ImageUnderstandPromptRequest,
    ImageUnderstandPromptResponse,
    ImageUnderstandRequest,
    ImageUnderstandResponse,
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


@router.post("/image-understand", response_model=ImageUnderstandResponse)
async def create_image_understand_prompt(req: ImageUnderstandRequest):
    """Analyze an image and return a scene description."""

    if not prompt_service.is_available:
        raise HTTPException(
            status_code=503,
            detail=f"Prompt provider '{prompt_service.provider_name}' is not configured",
        )

    try:
        return await prompt_service.generate_image_understand_prompt(image_url=req.image_url)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc


@router.post("/image-understand/prompt", response_model=ImageUnderstandPromptResponse)
async def create_understand_prompt(req: ImageUnderstandPromptRequest):
    """Generate a targeted generation prompt from a scene description."""

    if not prompt_service.is_available:
        raise HTTPException(
            status_code=503,
            detail=f"Prompt provider '{prompt_service.provider_name}' is not configured",
        )

    try:
        result = await prompt_service.generate_understand_prompt(description=req.description)
        return ImageUnderstandPromptResponse(prompt=result, model=prompt_service.provider_name)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
