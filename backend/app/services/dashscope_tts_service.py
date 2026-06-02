"""
DashScope TTS service — text-to-speech using cloned voices via Qwen TTS VC.
"""
from __future__ import annotations

import logging
from pathlib import Path
from uuid import uuid4

from .dashscope_client import DashScopeClient

logger = logging.getLogger(__name__)


class DashScopeTtsService:
    """TTS synthesis using DashScope multimodal-generation with cloned voices."""

    def __init__(
        self,
        client: DashScopeClient,
        output_dir: str | Path,
        *,
        tts_vc_model: str = "qwen3-tts-vc-2026-01-22",
    ):
        self._client = client
        self._output_dir = Path(output_dir)
        self._output_dir.mkdir(parents=True, exist_ok=True)
        self._tts_vc_model = tts_vc_model

    @property
    def is_configured(self) -> bool:
        return self._client.is_configured

    async def generate_speech(self, text: str, voice_id: str) -> str:
        """Synthesize speech using a cloned voice.

        Returns the local filesystem path to the downloaded audio file.
        """
        payload = {
            "model": self._tts_vc_model,
            "input": {
                "text": text,
                "voice": voice_id,
            },
        }

        response = await self._client.request_json(
            path="/api/v1/services/aigc/multimodal-generation/generation",
            method="POST",
            payload=payload,
        )

        audio_url = response["output"]["audio"]["url"]
        logger.info(
            "[DashScopeTtsService] synthesis done: voice=%s text_len=%d",
            voice_id,
            len(text),
        )

        data, content_type = await self._client.download_asset(audio_url)

        ext = ".mp3"
        if content_type:
            ct_lower = content_type.lower()
            if "wav" in ct_lower or "wave" in ct_lower:
                ext = ".wav"
            elif "ogg" in ct_lower:
                ext = ".ogg"

        filename = f"ds-tts-{uuid4().hex}{ext}"
        dest = self._output_dir / filename
        dest.write_bytes(data)

        logger.info("[DashScopeTtsService] downloaded audio: %s (%d bytes)", dest, len(data))
        return str(dest)
