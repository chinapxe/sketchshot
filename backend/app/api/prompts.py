"""
Prompt generation API routes.
"""
from fastapi import APIRouter, HTTPException

from ..models.schemas import PromptGenerateRequest, PromptGenerateResponse
from ..services.prompt_service import prompt_service

router = APIRouter(prefix="/api/prompts", tags=["prompts"])


@router.post("/generate", response_model=PromptGenerateResponse)
async def generate_prompt(req: PromptGenerateRequest):
    """Generate a refined image/video prompt using Volcengine Ark."""

    if not prompt_service.is_available:
        raise HTTPException(status_code=503, detail="Volcengine prompt service is not configured")

    return await prompt_service.generate_prompt(req)
