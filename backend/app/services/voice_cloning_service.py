"""
Voice cloning service — create/list/delete cloned voices via DashScope Qwen TTS.
"""
from __future__ import annotations

import json
import logging
import time
from pathlib import Path
from typing import Any

from .dashscope_client import DashScopeClient

logger = logging.getLogger(__name__)

CLONED_VOICES_FILENAME = "cloned_voices.json"


class VoiceCloningService:
    """Manage voice clones via DashScope voice-enrollment API."""

    def __init__(
        self,
        client: DashScopeClient,
        data_dir: str | Path,
        *,
        enrollment_model: str = "qwen-voice-enrollment",
        tts_vc_model: str = "qwen3-tts-vc-2026-01-22",
    ):
        self._client = client
        self._data_dir = Path(data_dir)
        self._data_dir.mkdir(parents=True, exist_ok=True)
        self._voices_path = self._data_dir / CLONED_VOICES_FILENAME
        self._enrollment_model = enrollment_model
        self._tts_vc_model = tts_vc_model

    @property
    def is_configured(self) -> bool:
        return self._client.is_configured

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    async def create_voice(
        self,
        audio_base64: str,
        name: str,
        *,
        audio_mime_type: str = "audio/mpeg",
    ) -> dict[str, Any]:
        """Create a cloned voice from base64 audio data.

        Returns dict with keys: voice_id, name, created_at.
        """
        data_uri = f"data:{audio_mime_type};base64,{audio_base64}"

        payload = {
            "model": self._enrollment_model,
            "input": {
                "action": "create",
                "target_model": self._tts_vc_model,
                "preferred_name": name,
                "audio": {"data": data_uri},
            },
        }

        response = await self._client.request_json(
            path="/api/v1/services/audio/tts/customization",
            method="POST",
            payload=payload,
        )

        voice_id = response["output"]["voice"]
        logger.info(
            "[VoiceCloningService] created voice: voice_id=%s name=%s", voice_id, name,
        )

        created_at = time.time()
        voices = self._load_voices()
        voices[voice_id] = {
            "voice_id": voice_id,
            "name": name,
            "created_at": created_at,
        }
        self._save_voices(voices)

        return {"voice_id": voice_id, "name": name, "created_at": created_at}

    async def list_voices(self) -> list[dict[str, Any]]:
        """Return all locally stored cloned voices."""
        voices = self._load_voices()
        return sorted(voices.values(), key=lambda v: v.get("created_at", 0), reverse=True)

    async def delete_voice(self, voice_id: str) -> bool:
        """Delete a cloned voice from local storage.

        Note: DashScope Qwen TTS VC does not expose a delete API.
        Returns True if the voice was found and removed.
        """
        voices = self._load_voices()
        if voice_id not in voices:
            return False

        del voices[voice_id]
        self._save_voices(voices)
        logger.info("[VoiceCloningService] deleted voice: voice_id=%s", voice_id)
        return True

    def is_cloned_voice(self, voice_id: str) -> bool:
        """Check if a voice ID belongs to a locally cloned voice."""
        voices = self._load_voices()
        return voice_id in voices

    # ------------------------------------------------------------------
    # Internal: persistence
    # ------------------------------------------------------------------

    def _load_voices(self) -> dict[str, dict[str, Any]]:
        if not self._voices_path.exists():
            return {}
        try:
            data = json.loads(self._voices_path.read_text(encoding="utf-8"))
            return data if isinstance(data, dict) else {}
        except (json.JSONDecodeError, OSError) as exc:
            logger.warning("[VoiceCloningService] failed to load voices: %s", exc)
            return {}

    def _save_voices(self, voices: dict[str, dict[str, Any]]) -> None:
        self._voices_path.write_text(
            json.dumps(voices, ensure_ascii=False, indent=2),
            encoding="utf-8",
        )
