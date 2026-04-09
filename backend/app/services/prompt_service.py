"""
Prompt generation service with pluggable providers.
"""
from __future__ import annotations

import base64
import json
import logging
import mimetypes
import re
from abc import ABC, abstractmethod
from pathlib import Path
from urllib.parse import unquote

from ..config import settings
from ..models.schemas import (
    ContinuityFramesGenerateRequest,
    ContinuityFramesGenerateResponse,
    PromptGenerateRequest,
    PromptGenerateResponse,
)
from .dashscope_client import DashScopeClient
from .engine_config_service import engine_config_service
from .volcengine_client import VolcengineClient

IMAGE_SYSTEM_PROMPT = (
    "You are a senior prompt engineer for image generation. "
    "Return exactly one polished production-ready prompt. "
    "Do not explain your reasoning. Do not add numbering or markdown."
)

VIDEO_SYSTEM_PROMPT = (
    "You are a senior prompt engineer for image-to-video generation. "
    "Return exactly one polished motion prompt focused on action, camera movement, mood, and detail. "
    "Do not explain your reasoning. Do not add numbering or markdown."
)

GENERAL_SYSTEM_PROMPT = (
    "You are a senior creative prompt engineer. "
    "Return exactly one concise, production-ready prompt. "
    "Do not explain your reasoning. Do not add numbering or markdown."
)

CONTINUITY_FRAMES_SYSTEM_PROMPT = (
    "You are a senior storyboard director. "
    "Break the user's idea into exactly 9 continuous storyboard frame descriptions for a 3x3 grid. "
    "Return valid JSON only in the shape {\"frames\":[\"...\", \"...\"]}. "
    "Each frame must be concise, visually specific, and continue naturally from the previous frame. "
    "Do not include numbering, markdown, or any extra explanation."
)

logger = logging.getLogger(__name__)


class BasePromptProvider(ABC):
    """Abstract prompt provider contract."""

    def __init__(self, *, upload_dir: str | Path, output_dir: str | Path):
        self._upload_dir = Path(upload_dir)
        self._output_dir = Path(output_dir)

    @property
    @abstractmethod
    def provider_name(self) -> str:
        ...

    @property
    @abstractmethod
    def is_available(self) -> bool:
        ...

    @abstractmethod
    async def generate_prompt(self, req: PromptGenerateRequest) -> PromptGenerateResponse:
        ...

    @abstractmethod
    async def generate_continuity_frames(
        self, req: ContinuityFramesGenerateRequest
    ) -> ContinuityFramesGenerateResponse:
        ...

    def _extract_continuity_frames(self, content: str) -> list[str]:
        cleaned = self._strip_code_fences(content)

        parsed: object
        try:
            parsed = json.loads(cleaned)
        except json.JSONDecodeError:
            parsed = None

        frames: list[str] = []
        if isinstance(parsed, dict) and isinstance(parsed.get("frames"), list):
            frames = [str(item).strip() for item in parsed["frames"] if str(item).strip()]
        elif isinstance(parsed, list):
            frames = [str(item).strip() for item in parsed if str(item).strip()]

        if not frames:
            fallback_lines = [
                re.sub(r"^\s*(?:\d+[\.\)]|[-*])\s*", "", line).strip()
                for line in cleaned.splitlines()
                if line.strip()
            ]
            frames = [line for line in fallback_lines if line]

        normalized = (frames + [""] * 9)[:9]
        if not any(item.strip() for item in normalized):
            raise RuntimeError(f"{self.provider_name} continuity response does not contain usable frame descriptions")

        return normalized

    def _strip_code_fences(self, value: str) -> str:
        stripped = value.strip()
        if stripped.startswith("```"):
            stripped = re.sub(r"^```(?:json)?\s*", "", stripped)
            stripped = re.sub(r"\s*```$", "", stripped)
        return stripped.strip()

    def _normalize_reference_images(self, reference_images: list[str]) -> list[str]:
        normalized_urls: list[str] = []

        for raw_url in reference_images:
            if not isinstance(raw_url, str):
                continue

            asset_url = raw_url.strip()
            if not asset_url:
                continue

            if asset_url.startswith(("http://", "https://", "data:")):
                normalized_urls.append(asset_url)
                continue

            local_path = self._resolve_local_asset_path(asset_url)
            if local_path and local_path.exists():
                normalized_urls.append(self._encode_local_asset_as_data_url(local_path))
                continue

            logger.warning("[%s] skip unresolved reference image: %s", self.provider_name, asset_url)

        return normalized_urls

    def _resolve_local_asset_path(self, asset_url: str) -> Path | None:
        clean_url = asset_url.split("#", 1)[0]

        if clean_url.startswith("/uploads/"):
            return self._upload_dir / Path(unquote(clean_url.removeprefix("/uploads/"))).name

        if clean_url.startswith("/outputs/"):
            return self._output_dir / Path(unquote(clean_url.removeprefix("/outputs/"))).name

        candidate = Path(clean_url)
        if candidate.exists():
            return candidate

        return None

    def _encode_local_asset_as_data_url(self, local_path: Path) -> str:
        mime_type = mimetypes.guess_type(local_path.name)[0] or "application/octet-stream"
        encoded = base64.b64encode(local_path.read_bytes()).decode("ascii")
        return f"data:{mime_type};base64,{encoded}"


class VolcenginePromptProvider(BasePromptProvider):
    """Prompt provider backed by Volcengine Ark chat completions."""

    def __init__(
        self,
        client: VolcengineClient,
        model: str,
        *,
        upload_dir: str | Path,
        output_dir: str | Path,
    ):
        super().__init__(upload_dir=upload_dir, output_dir=output_dir)
        self._client = client
        self._model = model

    @property
    def provider_name(self) -> str:
        return "volcengine"

    @property
    def is_available(self) -> bool:
        return self._client.is_configured

    async def generate_prompt(self, req: PromptGenerateRequest) -> PromptGenerateResponse:
        system_prompt = {
            "image": IMAGE_SYSTEM_PROMPT,
            "video": VIDEO_SYSTEM_PROMPT,
            "general": GENERAL_SYSTEM_PROMPT,
        }[req.task_type]

        response = await self._client.request_json(
            path="/chat/completions",
            method="POST",
            payload={
                "model": self._model,
                "messages": [
                    {"role": "system", "content": system_prompt},
                    {
                        "role": "user",
                        "content": self._build_user_content(self._build_prompt_input(req), req.reference_images),
                    },
                ],
                "thinking": {"type": "disabled"},
            },
        )

        return PromptGenerateResponse(
            prompt=self._extract_text_content(response),
            task_type=req.task_type,
            model=self._model,
        )

    async def generate_continuity_frames(
        self, req: ContinuityFramesGenerateRequest
    ) -> ContinuityFramesGenerateResponse:
        response = await self._client.request_json(
            path="/chat/completions",
            method="POST",
            payload={
                "model": self._model,
                "messages": [
                    {"role": "system", "content": CONTINUITY_FRAMES_SYSTEM_PROMPT},
                    {
                        "role": "user",
                        "content": self._build_user_content(self._build_continuity_input(req), req.reference_images),
                    },
                ],
                "thinking": {"type": "disabled"},
            },
        )

        return ContinuityFramesGenerateResponse(
            frames=self._extract_continuity_frames(self._extract_text_content(response)),
            model=self._model,
        )

    def _extract_text_content(self, payload: dict) -> str:
        choices = payload.get("choices")
        if not isinstance(choices, list) or not choices:
            raise RuntimeError("Volcengine prompt response does not contain choices")

        message = choices[0].get("message") if isinstance(choices[0], dict) else None
        content = message.get("content") if isinstance(message, dict) else None
        if isinstance(content, str) and content.strip():
            return content.strip()

        if isinstance(content, list):
            text_parts: list[str] = []
            for item in content:
                if isinstance(item, dict) and item.get("type") == "text" and isinstance(item.get("text"), str):
                    text_parts.append(item["text"].strip())
            if text_parts:
                return "\n".join(part for part in text_parts if part)

        raise RuntimeError("Volcengine prompt response does not contain text content")

    def _build_user_content(self, text: str, reference_images: list[str]) -> str | list[dict]:
        image_urls = self._normalize_reference_images(reference_images)
        if not image_urls:
            return text

        return [
            {"type": "text", "text": text},
            *[
                {
                    "type": "image_url",
                    "image_url": {"url": url},
                }
                for url in image_urls
            ],
        ]

    def _build_prompt_input(self, req: PromptGenerateRequest) -> str:
        user_lines = [
            f"Task type: {req.task_type}",
            f"Language: {'Chinese' if req.language == 'zh' else 'English'}",
            f"User idea: {req.user_input.strip()}",
        ]
        if req.style.strip():
            user_lines.append(f"Style: {req.style.strip()}")
        if req.aspect_ratio.strip():
            user_lines.append(f"Aspect ratio: {req.aspect_ratio.strip()}")
        if req.extra_requirements:
            user_lines.append("Extra requirements:")
            user_lines.extend(f"- {item.strip()}" for item in req.extra_requirements if item.strip())
        return "\n".join(user_lines)

    def _build_continuity_input(self, req: ContinuityFramesGenerateRequest) -> str:
        return "\n".join(
            [
                f"Language: {'Chinese' if req.language == 'zh' else 'English'}",
                "Task: Create 9 sequential storyboard frame descriptions for a nine-panel continuity grid.",
                f"Context:\n{req.user_input.strip()}",
            ]
        )


class QwenPromptProvider(BasePromptProvider):
    """Prompt provider backed by DashScope Qwen endpoints."""

    def __init__(
        self,
        client: DashScopeClient,
        text_model: str,
        multimodal_model: str,
        *,
        upload_dir: str | Path,
        output_dir: str | Path,
    ):
        super().__init__(upload_dir=upload_dir, output_dir=output_dir)
        self._client = client
        self._text_model = text_model
        self._multimodal_model = multimodal_model

    @property
    def provider_name(self) -> str:
        return "qwen"

    @property
    def is_available(self) -> bool:
        return self._client.is_configured

    async def generate_prompt(self, req: PromptGenerateRequest) -> PromptGenerateResponse:
        system_prompt = {
            "image": IMAGE_SYSTEM_PROMPT,
            "video": VIDEO_SYSTEM_PROMPT,
            "general": GENERAL_SYSTEM_PROMPT,
        }[req.task_type]

        model, response = await self._request_prompt(
            system_prompt=system_prompt,
            user_text=self._build_prompt_input(req),
            reference_images=req.reference_images,
        )

        return PromptGenerateResponse(
            prompt=self._extract_text_content(response),
            task_type=req.task_type,
            model=model,
        )

    async def generate_continuity_frames(
        self, req: ContinuityFramesGenerateRequest
    ) -> ContinuityFramesGenerateResponse:
        model, response = await self._request_prompt(
            system_prompt=CONTINUITY_FRAMES_SYSTEM_PROMPT,
            user_text=self._build_continuity_input(req),
            reference_images=req.reference_images,
        )

        return ContinuityFramesGenerateResponse(
            frames=self._extract_continuity_frames(self._extract_text_content(response)),
            model=model,
        )

    async def _request_prompt(
        self,
        *,
        system_prompt: str,
        user_text: str,
        reference_images: list[str],
    ) -> tuple[str, dict]:
        image_urls = self._normalize_reference_images(reference_images)

        if image_urls:
            model = self._multimodal_model
            response = await self._client.request_json(
                path="/api/v1/services/aigc/multimodal-generation/generation",
                method="POST",
                payload={
                    "model": model,
                    "input": {
                        "messages": [
                            {"role": "system", "content": system_prompt},
                            {
                                "role": "user",
                                "content": [
                                    *({"image": url} for url in image_urls),
                                    {"text": user_text},
                                ],
                            },
                        ]
                    },
                    "parameters": {
                        "result_format": "message",
                    },
                },
            )
            return model, response

        model = self._text_model
        response = await self._client.request_json(
            path="/api/v1/services/aigc/text-generation/generation",
            method="POST",
            payload={
                "model": model,
                "input": {
                    "messages": [
                        {"role": "system", "content": system_prompt},
                        {"role": "user", "content": user_text},
                    ]
                },
                "parameters": {
                    "result_format": "message",
                },
            },
        )
        return model, response

    def _extract_text_content(self, payload: dict) -> str:
        output = payload.get("output")
        if not isinstance(output, dict):
            raise RuntimeError("Qwen prompt response does not contain output")

        choices = output.get("choices")
        if isinstance(choices, list) and choices:
            message = choices[0].get("message") if isinstance(choices[0], dict) else None
            content = message.get("content") if isinstance(message, dict) else None

            if isinstance(content, str) and content.strip():
                return content.strip()

            if isinstance(content, list):
                text_parts: list[str] = []
                for item in content:
                    if isinstance(item, dict) and isinstance(item.get("text"), str):
                        text_parts.append(item["text"].strip())
                if text_parts:
                    return "\n".join(part for part in text_parts if part)

        text = output.get("text")
        if isinstance(text, str) and text.strip():
            return text.strip()

        raise RuntimeError("Qwen prompt response does not contain text content")

    def _build_prompt_input(self, req: PromptGenerateRequest) -> str:
        user_lines = [
            f"Task type: {req.task_type}",
            f"Language: {'Chinese' if req.language == 'zh' else 'English'}",
            f"User idea: {req.user_input.strip()}",
        ]
        if req.style.strip():
            user_lines.append(f"Style: {req.style.strip()}")
        if req.aspect_ratio.strip():
            user_lines.append(f"Aspect ratio: {req.aspect_ratio.strip()}")
        if req.extra_requirements:
            user_lines.append("Extra requirements:")
            user_lines.extend(f"- {item.strip()}" for item in req.extra_requirements if item.strip())
        return "\n".join(user_lines)

    def _build_continuity_input(self, req: ContinuityFramesGenerateRequest) -> str:
        return "\n".join(
            [
                f"Language: {'Chinese' if req.language == 'zh' else 'English'}",
                "Task: Create 9 sequential storyboard frame descriptions for a nine-panel continuity grid.",
                f"Context:\n{req.user_input.strip()}",
            ]
        )


class PromptGenerationService:
    """Service wrapper around runtime-configured prompt providers."""

    def __init__(
        self,
        client: VolcengineClient | None = None,
        model: str | None = None,
        *,
        upload_dir: str | Path | None = None,
        output_dir: str | Path | None = None,
        provider: BasePromptProvider | None = None,
    ):
        self._upload_dir = Path(upload_dir) if upload_dir is not None else Path(settings.UPLOAD_DIR)
        self._output_dir = Path(output_dir) if output_dir is not None else Path(settings.OUTPUT_DIR)

        if provider is not None:
            self._provider = provider
        elif client is not None and model is not None:
            self._provider = VolcenginePromptProvider(
                client,
                model,
                upload_dir=self._upload_dir,
                output_dir=self._output_dir,
            )
        else:
            self._provider = None

    @property
    def is_available(self) -> bool:
        return self._resolve_runtime_provider().is_available

    @property
    def provider_name(self) -> str:
        return self._resolve_runtime_provider().provider_name

    async def generate_prompt(self, req: PromptGenerateRequest) -> PromptGenerateResponse:
        return await self._resolve_runtime_provider().generate_prompt(req)

    async def generate_continuity_frames(
        self, req: ContinuityFramesGenerateRequest
    ) -> ContinuityFramesGenerateResponse:
        return await self._resolve_runtime_provider().generate_continuity_frames(req)

    def _resolve_runtime_provider(self) -> BasePromptProvider:
        if self._provider is not None:
            return self._provider

        provider_name = engine_config_service.get_prompt_provider()
        if provider_name == "qwen":
            runtime = engine_config_service.get_runtime_dashscope_config()
            return QwenPromptProvider(
                DashScopeClient(
                    base_url=runtime.base_url,
                    api_key=runtime.api_key,
                    timeout=runtime.request_timeout,
                ),
                runtime.qwen_text_model,
                runtime.qwen_multimodal_model,
                upload_dir=runtime.upload_dir,
                output_dir=runtime.output_dir,
            )

        runtime = engine_config_service.get_runtime_volcengine_config()
        return VolcenginePromptProvider(
            VolcengineClient(
                base_url=runtime.ark_base_url,
                api_key=runtime.ark_api_key,
                timeout=runtime.request_timeout,
            ),
            runtime.prompt_model,
            upload_dir=runtime.upload_dir,
            output_dir=runtime.output_dir,
        )


prompt_service = PromptGenerationService()
