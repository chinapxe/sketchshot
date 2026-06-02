"""
Volcengine TTS service — text-to-speech via the v3 API.
"""
from __future__ import annotations

import asyncio
import json
import logging
import time
from pathlib import Path
from typing import Any
from urllib import error, request
from uuid import uuid4

logger = logging.getLogger(__name__)

DEFAULT_POLL_INTERVAL = 2.0
DEFAULT_TIMEOUT = 600.0


class TtsService:
    """Volcengine TTS client wrapping submit / query / download."""

    def __init__(
        self,
        *,
        app_id: str,
        access_key: str,
        resource_id: str = "seed-tts-2.0",
        base_url: str = "https://openspeech.bytedance.com/api/v3/tts",
        timeout: float = DEFAULT_TIMEOUT,
        poll_interval: float = DEFAULT_POLL_INTERVAL,
        default_speaker: str = "zh_female_xiaohe_uranus_bigtts",
        default_format: str = "mp3",
        sample_rate: int = 24000,
        speech_rate: float = 1.0,
        output_dir: str | Path = "",
    ):
        self._base_url = base_url.rstrip("/")
        self._app_id = app_id
        self._access_key = access_key
        self._resource_id = resource_id
        self._timeout = timeout
        self._poll_interval = poll_interval
        self._default_speaker = default_speaker
        self._default_format = default_format
        self._sample_rate = sample_rate
        self._speech_rate = speech_rate
        self._output_dir = Path(output_dir)

    @property
    def is_configured(self) -> bool:
        return bool(self._app_id.strip()) and bool(self._access_key.strip())

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    async def generate_speech(
        self,
        text: str,
        speaker: str = "",
        *,
        speech_rate: int | None = None,
        loudness_rate: int | None = None,
    ) -> str:
        """Orchestrate TTS: submit → poll → download → return local URL.

        ``speech_rate`` / ``loudness_rate`` are integer offsets in the range
        -50~100 (0 = normal). When ``None`` the instance-level defaults are used.
        """
        speaker = speaker or self._default_speaker
        task_id = str(uuid4())

        submit_response = await self._submit(
            text, speaker, task_id,
            speech_rate=speech_rate,
            loudness_rate=loudness_rate,
        )
        provider_task_id = submit_response["data"]["task_id"]
        logger.info(
            "[TtsService] submitted task: text_len=%d speaker=%s speech_rate=%s loudness_rate=%s provider_task=%s",
            len(text), speaker, speech_rate, loudness_rate, provider_task_id,
        )

        audio_url = await self._poll(provider_task_id)
        logger.info("[TtsService] task succeeded: provider_task=%s", provider_task_id)

        local_path = await self._download(audio_url)
        return local_path

    # ------------------------------------------------------------------
    # Internal: submit
    # ------------------------------------------------------------------

    async def _submit(
        self,
        text: str,
        speaker: str,
        task_id: str,
        *,
        speech_rate: int | None = None,
        loudness_rate: int | None = None,
    ) -> dict[str, Any]:
        # Resolve final integer offsets (Volcengine API expects -50~100 range).
        if speech_rate is None:
            sr_offset = round((max(0.5, min(2.0, self._speech_rate)) - 1.0) * 100)
        else:
            sr_offset = max(-50, min(100, int(speech_rate)))
        lr_offset = 0 if loudness_rate is None else max(-50, min(100, int(loudness_rate)))

        def _do() -> dict[str, Any]:
            body = json.dumps(
                {
                    "user": {"uid": "chongai-studio"},
                    "unique_id": task_id,
                    "namespace": "BidirectionalTTS",
                    "req_params": {
                        "text": text,
                        "speaker": speaker,
                        "audio_params": {
                            "format": self._default_format,
                            "sample_rate": self._sample_rate,
                            "speech_rate": sr_offset,
                            "loudness_rate": lr_offset,
                            "enable_timestamp": True,
                        },
                    },
                },
                ensure_ascii=False,
            ).encode("utf-8")

            req = request.Request(
                f"{self._base_url}/submit",
                data=body,
                method="POST",
                headers={
                    "Content-Type": "application/json",
                    "X-Api-App-Id": self._app_id,
                    "X-Api-Access-Key": self._access_key,
                    "X-Api-Resource-Id": self._resource_id,
                    "X-Api-Request-Id": task_id,
                },
            )

            try:
                logger.debug("[TtsService] submit request: url=%s headers=%s body=%s",
                             req.full_url, dict(req.headers), body)
                with request.urlopen(req, timeout=self._timeout) as resp:
                    raw = resp.read().decode("utf-8")
            except error.HTTPError as exc:
                body_raw = exc.read().decode("utf-8", errors="replace")
                logger.error("[TtsService] submit failed: HTTP %d request_body=%s response=%s",
                             exc.code, body, body_raw[:500])
                raise RuntimeError(
                    f"TTS submit failed: HTTP {exc.code} | {body_raw[:500]}"
                ) from exc

            data: dict[str, Any] = json.loads(raw) if raw else {}
            if data.get("code") != 20000000:
                raise RuntimeError(
                    f"TTS submit failed: code={data.get('code')} msg={data.get('message', '')}"
                )
            if "data" not in data or "task_id" not in data.get("data", {}):
                raise RuntimeError(f"TTS submit response missing task_id: {data}")
            return data

        return await asyncio.to_thread(_do)

    # ------------------------------------------------------------------
    # Internal: poll
    # ------------------------------------------------------------------

    async def _poll(self, provider_task_id: str) -> str:
        """Poll until success or timeout.  Returns audio_url on success."""
        started_at = time.monotonic()
        poll_count = 0

        while True:
            elapsed = time.monotonic() - started_at
            if elapsed >= self._timeout:
                raise TimeoutError(
                    f"TTS task timed out after {self._timeout:.0f}s (provider_task={provider_task_id})"
                )

            response = await self._query(provider_task_id)
            query_code = response.get("code")
            task_status = response.get("data", {}).get("task_status")
            poll_count += 1

            # If the query itself returned a non-success code, the task is dead
            if query_code != 20000000 and task_status is None:
                err_msg = response.get("message", f"query returned code {query_code}")
                raise RuntimeError(
                    f"TTS task failed: {err_msg} (provider_task={provider_task_id})"
                )

            logger.debug(
                "[TtsService] poll #%d elapsed=%.1fs provider_task=%s task_status=%s",
                poll_count, elapsed, provider_task_id, task_status,
            )

            if task_status == 2:
                audio_url = response.get("data", {}).get("audio_url")
                if not audio_url:
                    raise RuntimeError(f"TTS succeeded but no audio_url in response: {response}")
                return audio_url

            if task_status == 3:
                err_msg = response.get("data", {}).get("message", "unknown error")
                raise RuntimeError(f"TTS task failed: {err_msg}")

            await asyncio.sleep(self._poll_interval)

    async def _query(self, provider_task_id: str) -> dict[str, Any]:
        def _do() -> dict[str, Any]:
            request_id = str(uuid4())
            body = json.dumps({"task_id": provider_task_id}).encode("utf-8")
            req = request.Request(
                f"{self._base_url}/query",
                data=body,
                method="POST",
                headers={
                    "Content-Type": "application/json",
                    "X-Api-App-Id": self._app_id,
                    "X-Api-Access-Key": self._access_key,
                    "X-Api-Resource-Id": self._resource_id,
                    "X-Api-Request-Id": request_id,
                },
            )

            try:
                with request.urlopen(req, timeout=self._timeout) as resp:
                    raw = resp.read().decode("utf-8")
            except error.HTTPError as exc:
                body_raw = exc.read().decode("utf-8", errors="replace")
                raise RuntimeError(
                    f"TTS query failed: HTTP {exc.code} | {body_raw[:500]}"
                ) from exc
            except error.URLError as exc:
                raise RuntimeError(
                    f"TTS query connection failed: {exc.reason}"
                ) from exc

            data: dict[str, Any] = json.loads(raw) if raw else {}
            return data

        return await asyncio.to_thread(_do)

    # ------------------------------------------------------------------
    # Internal: download
    # ------------------------------------------------------------------

    async def _download(self, audio_url: str) -> str:
        """Download audio from url and save locally. Returns local file path."""

        def _do() -> tuple[bytes, str | None]:
            req = request.Request(audio_url, method="GET", headers={"Connection": "close"})
            try:
                with request.urlopen(req, timeout=self._timeout) as resp:
                    return resp.read(), resp.headers.get("Content-Type")
            except error.HTTPError as exc:
                body_raw = exc.read().decode("utf-8", errors="replace")
                raise RuntimeError(
                    f"TTS audio download failed: HTTP {exc.code} | {body_raw[:500]}"
                ) from exc

        data, content_type = await asyncio.to_thread(_do)

        ext = ".mp3"
        if content_type:
            if "wav" in content_type or "wave" in content_type:
                ext = ".wav"
            elif "ogg" in content_type:
                ext = ".ogg"

        filename = f"tts-{uuid4().hex}{ext}"
        dest = self._output_dir / filename
        dest.parent.mkdir(parents=True, exist_ok=True)
        dest.write_bytes(data)

        logger.info("[TtsService] downloaded audio: %s (%d bytes)", dest, len(data))
        return str(dest)
