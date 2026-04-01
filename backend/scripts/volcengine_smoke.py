"""
Reusable live smoke test for Volcengine prompt, image, and video flows.

Usage:
    set ARK_API_KEY=...
    python scripts/volcengine_smoke.py
"""
from __future__ import annotations

import asyncio
import json
import os
import sys
from pathlib import Path

CURRENT_FILE = Path(__file__).resolve()
BACKEND_ROOT = CURRENT_FILE.parent.parent
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from app.adapters.base import GenerateParams
from app.adapters.volcengine_adapter import VolcengineAdapter
from app.config import settings
from app.models.schemas import PromptGenerateRequest
from app.services.prompt_service import PromptGenerationService
from app.services.volcengine_client import VolcengineClient

REMOTE_REFERENCE_IMAGE = "https://ark-project.tos-cn-beijing.volces.com/doc_image/seedream4_5_imageToimage.png"
REMOTE_VIDEO_IMAGE = "https://ark-project.tos-cn-beijing.volces.com/doc_image/seepro_i2v.png"


async def collect_final_output(adapter: VolcengineAdapter, params: GenerateParams) -> dict[str, str]:
    output: dict[str, str] = {}
    async for update in adapter.generate(params):
        print(f"[{params.task_type}] {update.progress}% {update.message}")
        if update.output_image:
            output["output_image"] = update.output_image
        if update.output_video:
            output["output_video"] = update.output_video
    return output


async def main():
    api_key = os.getenv("ARK_API_KEY", "").strip()
    if not api_key:
        raise RuntimeError("ARK_API_KEY is required")

    client = VolcengineClient(
        base_url=settings.ARK_BASE_URL,
        api_key=api_key,
        timeout=settings.VOLCENGINE_REQUEST_TIMEOUT,
    )

    prompt_service = PromptGenerationService(client, settings.VOLCENGINE_PROMPT_MODEL)
    adapter = VolcengineAdapter(
        client=client,
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

    prompt_response = await prompt_service.generate_prompt(
        PromptGenerateRequest(
            task_type="image",
            user_input="生成一条电影感的人像海报提示词，主体明确，光影高级，适合文生图。",
            style="cinematic portrait",
            aspect_ratio="3:4",
            extra_requirements=["subject in focus", "premium lighting", "detailed texture"],
            language="en",
        )
    )
    print("[prompt] generated prompt:")
    print(prompt_response.prompt)

    text_to_image = await collect_final_output(
        adapter,
        GenerateParams(
            task_type="image",
            prompt=prompt_response.prompt,
            aspect_ratio="3:4",
            resolution="2K",
            reference_images=[],
        ),
    )

    image_to_image = await collect_final_output(
        adapter,
        GenerateParams(
            task_type="image",
            prompt="transform the reference into a clean watercolor travel poster, preserve the main composition, bright daylight, elegant details",
            aspect_ratio="3:4",
            resolution="2K",
            reference_images=[REMOTE_REFERENCE_IMAGE],
        ),
    )

    image_to_video = await collect_final_output(
        adapter,
        GenerateParams(
            task_type="video",
            prompt="cinematic push-in, subtle wind movement, immersive depth, elegant motion",
            aspect_ratio="16:9",
            duration_seconds=5,
            source_images=[REMOTE_VIDEO_IMAGE],
        ),
    )

    print(json.dumps(
        {
            "prompt_model": prompt_response.model,
            "text_to_image": text_to_image,
            "image_to_image": image_to_image,
            "image_to_video": image_to_video,
            "output_dir": str(Path(settings.OUTPUT_DIR).resolve()),
        },
        ensure_ascii=False,
        indent=2,
    ))


if __name__ == "__main__":
    asyncio.run(main())
