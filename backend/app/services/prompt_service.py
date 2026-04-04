"""
Prompt generation service backed by Volcengine Ark chat completions.
"""
from __future__ import annotations

from ..models.schemas import PromptGenerateRequest, PromptGenerateResponse
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


class PromptGenerationService:
    """Service wrapper around Ark chat completions."""

    def __init__(self, client: VolcengineClient | None = None, model: str | None = None):
        self._client = client
        self._model = model

    @property
    def is_available(self) -> bool:
        client, _ = self._resolve_runtime()
        return client.is_configured

    async def generate_prompt(self, req: PromptGenerateRequest) -> PromptGenerateResponse:
        client, model = self._resolve_runtime()
        system_prompt = {
            "image": IMAGE_SYSTEM_PROMPT,
            "video": VIDEO_SYSTEM_PROMPT,
            "general": GENERAL_SYSTEM_PROMPT,
        }[req.task_type]

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

        response = await client.request_json(
            path="/chat/completions",
            method="POST",
            payload={
                "model": model,
                "messages": [
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": "\n".join(user_lines)},
                ],
                "thinking": {"type": "disabled"},
            },
        )

        prompt = self._extract_prompt_text(response)
        return PromptGenerateResponse(
            prompt=prompt,
            task_type=req.task_type,
            model=model,
        )

    def _resolve_runtime(self) -> tuple[VolcengineClient, str]:
        if self._client is not None and self._model is not None:
            return self._client, self._model

        runtime = engine_config_service.get_runtime_volcengine_config()
        return (
            VolcengineClient(
                base_url=runtime.ark_base_url,
                api_key=runtime.ark_api_key,
                timeout=runtime.request_timeout,
            ),
            runtime.prompt_model,
        )

    def _extract_prompt_text(self, payload: dict) -> str:
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

prompt_service = PromptGenerationService()
