"""
HappyHorse adapter for DashScope video generation tasks (t2v, i2v, r2v, video-edit).
"""
from __future__ import annotations

import asyncio
import base64
import binascii
import json
import logging
import mimetypes
from pathlib import Path
from typing import Any, AsyncIterator
from urllib.parse import quote, unquote, urljoin, urlparse
from uuid import uuid4

from .base import BaseAdapter, GenerateParams, ProgressUpdate
from ..services.aliyun_oss_service import AliyunOssAssetHostingService
from ..services.dashscope_client import DashScopeClient
from ..services.tts_service import TtsService

logger = logging.getLogger(__name__)


class HappyHorseAdapter(BaseAdapter):
    """DashScope-based adapter for HappyHorse video generation models."""

    def __init__(
        self,
        *,
        client: DashScopeClient,
        upload_dir: str | Path,
        output_dir: str | Path,
        t2v_model: str,
        i2v_model: str,
        r2v_model: str,
        vedit_model: str,
        s2v_model: str = "",
        poll_interval: float,
        video_timeout: float,
        public_base_url: str = "",
        video_resolution: str = "720P",
        asset_hosting_service: AliyunOssAssetHostingService | None = None,
        tts_service: TtsService | None = None,
        voice_cloning_service: "VoiceCloningService | None" = None,
        dashscope_tts_service: "DashScopeTtsService | None" = None,
    ):
        self._client = client
        self._upload_dir = Path(upload_dir)
        self._output_dir = Path(output_dir)
        self._t2v_model = t2v_model
        self._i2v_model = i2v_model
        self._r2v_model = r2v_model
        self._vedit_model = vedit_model
        self._s2v_model = s2v_model
        self._poll_interval = poll_interval
        self._video_timeout = video_timeout
        self._public_base_url = public_base_url.rstrip("/")
        self._video_resolution = video_resolution
        self._asset_hosting_service = asset_hosting_service
        self._tts_service = tts_service
        self._voice_cloning_service = voice_cloning_service
        self._dashscope_tts_service = dashscope_tts_service
        self._upload_dir.mkdir(parents=True, exist_ok=True)
        self._output_dir.mkdir(parents=True, exist_ok=True)

    @property
    def name(self) -> str:
        return "happyhorse"

    async def generate(self, params: GenerateParams) -> AsyncIterator[ProgressUpdate]:
        logger.info(
            "[HappyHorseAdapter] generate() called: task_type=%s adapter_name=%s",
            params.task_type,
            self.name,
        )
        if params.task_type == "vedit":
            async for update in self._generate_video_edit(params):
                yield update
            return

        if params.task_type == "animate_mix":
            async for update in self._generate_animate_mix(params):
                yield update
            return

        if params.task_type in ("t2v", "i2v", "r2v"):
            async for update in self._generate_video(params):
                yield update
            return

        if params.task_type == "video":
            async for update in self._generate_video(params):
                yield update
            return

        if params.task_type == "digital_human":
            async for update in self._generate_digital_human(params):
                yield update
            return

        raise ValueError(f"HappyHorse adapter does not support task type: {params.task_type}")

    async def health_check(self) -> bool:
        return self._client.is_configured

    async def _generate_video(self, params: GenerateParams) -> AsyncIterator[ProgressUpdate]:
        """Handle t2v, i2v, and r2v generation."""
        prompt = params.prompt.strip()
        if not prompt:
            raise ValueError("Prompt is required for video generation")

        yield ProgressUpdate(progress=3, status="processing", message="Preparing HappyHorse video task")

        model, media, parameters = self._build_video_request(params)

        logger.info(
            "[HappyHorseAdapter] _generate_video: task_type=%s model=%s media_count=%d "
            "parameters=%s prompt_len=%d",
            params.task_type,
            model,
            len(media),
            {k: v for k, v in parameters.items() if k not in ("prompt",)},
            len(prompt),
        )

        # Resolve relative asset URLs to publicly accessible URLs
        if media:
            yield ProgressUpdate(progress=5, status="processing", message="Uploading reference media...")
            resolved_media: list[dict[str, str]] = []
            for item in media:
                logger.info("[HappyHorseAdapter] resolving media: %s", item["url"][:80])
                resolved_url = await self._resolve_video_asset_input(item["url"])
                resolved_media.append({**item, "url": resolved_url})
            media = resolved_media

        logger.info("[HappyHorseAdapter] creating DashScope task model=%s", model)
        create_response = await self._client.request_json(
            path="/api/v1/services/aigc/video-generation/video-synthesis",
            method="POST",
            headers={"X-DashScope-Async": "enable"},
            payload={
                "model": model,
                "input": {
                    "prompt": prompt,
                    **({"media": media} if media else {}),
                },
                "parameters": parameters,
            },
        )

        task_id = self._extract_task_id(create_response)
        logger.info("[HappyHorseAdapter] created video task: %s model=%s", task_id, model)

        started_at = asyncio.get_running_loop().time()
        last_progress = 10
        last_logged_status = ""
        yield ProgressUpdate(progress=10, status="processing", message="Video task created")

        while asyncio.get_running_loop().time() - started_at < self._video_timeout:
            task_response = await self._client.request_json(
                path=f"/api/v1/tasks/{quote(task_id)}",
                method="GET",
            )
            status = self._extract_remote_status(task_response)

            # Log status changes to track progress
            if status != last_logged_status:
                logger.info(
                    "[HappyHorseAdapter] task %s status: %s (elapsed=%.1fs)",
                    task_id,
                    status,
                    asyncio.get_running_loop().time() - started_at,
                )
                last_logged_status = status

            if status == "succeeded":
                remote_url = self._extract_video_url(task_response)
                yield ProgressUpdate(progress=90, status="processing", message="Downloading generated video")
                local_url = await self._download_result_asset(
                    remote_url,
                    filename_prefix="happyhorse-video",
                    default_extension=".mp4",
                )
                yield ProgressUpdate(
                    progress=100,
                    status="success",
                    message="HappyHorse video generation completed",
                    output_video=local_url,
                )
                return

            if status in {"failed", "canceled", "unknown"}:
                raise RuntimeError(self._extract_task_error(task_response, fallback_status=status))

            if status == "pending":
                progress = 18
                message = "HappyHorse video task queued"
            else:
                elapsed_ratio = min(1.0, (asyncio.get_running_loop().time() - started_at) / self._video_timeout)
                progress = min(85, max(last_progress, 25 + int(elapsed_ratio * 55)))
                message = "HappyHorse video generation in progress"

            last_progress = progress
            yield ProgressUpdate(progress=progress, status="processing", message=message)
            await asyncio.sleep(self._poll_interval)

        raise TimeoutError(
            f"HappyHorse video generation timed out after {self._video_timeout:.0f}s (task_id={task_id})"
        )

    async def _generate_video_edit(self, params: GenerateParams) -> AsyncIterator[ProgressUpdate]:
        """Handle video-edit generation."""
        prompt = params.prompt.strip()
        if not prompt:
            raise ValueError("Prompt is required for video editing")

        if not params.source_video and not params.source_images:
            raise ValueError("At least one source video or image is required for video editing")

        media: list[dict[str, str]] = []
        if params.source_video:
            resolved_video = await self._resolve_video_asset_input(params.source_video)
            media.append({"type": "video", "url": resolved_video})

        for item in (params.reference_images or []):
            if item:
                resolved = await self._resolve_video_asset_input(item)
                media.append({"type": "reference_image", "url": resolved})

        if not media:
            raise ValueError("No valid media inputs for video editing")

        yield ProgressUpdate(progress=5, status="processing", message="Preparing HappyHorse video edit task")

        vedit_model = params.vedit_model or self._vedit_model

        create_response = await self._client.request_json(
            path="/api/v1/services/aigc/video-generation/video-synthesis",
            method="POST",
            headers={"X-DashScope-Async": "enable"},
            payload={
                "model": vedit_model,
                "input": {
                    "prompt": prompt,
                    "media": media,
                },
                "parameters": {
                    "resolution": self._resolve_hh_resolution(params),
                    "duration": max(2, min(15, int(round(params.duration_seconds or 5)))),
                    **({"prompt_extend": True, "watermark": False} if "wan" in vedit_model else {}),
                },
            },
        )

        task_id = self._extract_task_id(create_response)
        logger.info("[HappyHorseAdapter] created video edit task: %s model=%s", task_id, vedit_model)

        started_at = asyncio.get_running_loop().time()
        last_progress = 10
        yield ProgressUpdate(progress=10, status="processing", message="Video edit task created")

        while asyncio.get_running_loop().time() - started_at < self._video_timeout:
            task_response = await self._client.request_json(
                path=f"/api/v1/tasks/{quote(task_id)}",
                method="GET",
            )
            status = self._extract_remote_status(task_response)

            if status == "succeeded":
                remote_url = self._extract_video_url(task_response)
                yield ProgressUpdate(progress=90, status="processing", message="Downloading edited video")
                local_url = await self._download_result_asset(
                    remote_url,
                    filename_prefix="happyhorse-vedit",
                    default_extension=".mp4",
                )
                yield ProgressUpdate(
                    progress=100,
                    status="success",
                    message="HappyHorse video editing completed",
                    output_video=local_url,
                )
                return

            if status in {"failed", "canceled", "unknown"}:
                raise RuntimeError(self._extract_task_error(task_response, fallback_status=status))

            if status == "pending":
                progress = 18
                message = "HappyHorse video edit task queued"
            else:
                elapsed_ratio = min(1.0, (asyncio.get_running_loop().time() - started_at) / self._video_timeout)
                progress = min(85, max(last_progress, 25 + int(elapsed_ratio * 55)))
                message = "HappyHorse video edit in progress"

            last_progress = progress
            yield ProgressUpdate(progress=progress, status="processing", message=message)
            await asyncio.sleep(self._poll_interval)

        raise TimeoutError(
            f"HappyHorse video edit timed out after {self._video_timeout:.0f}s (task_id={task_id})"
        )

    async def _generate_animate_mix(self, params: GenerateParams) -> AsyncIterator[ProgressUpdate]:
        """Handle AnimateMix (video face swap) generation via wan2.2-animate-mix."""
        source_video = params.source_video
        source_image = (params.reference_images or [None])[0]
        mode = params.video_version or "wan-std"

        if not source_video or not source_image:
            raise ValueError("Both source video and person image are required for animate mix")

        resolved_video = await self._resolve_video_asset_input(source_video)
        resolved_image = await self._resolve_video_asset_input(source_image)

        yield ProgressUpdate(progress=5, status="processing", message="Preparing AnimateMix request")

        create_response = await self._client.request_json(
            path="/api/v1/services/aigc/image2video/video-synthesis",
            method="POST",
            headers={"X-DashScope-Async": "enable"},
            payload={
                "model": "wan2.2-animate-mix",
                "input": {
                    "image_url": resolved_image,
                    "video_url": resolved_video,
                },
                "parameters": {
                    "mode": mode,
                },
            },
        )

        task_id = self._extract_task_id(create_response)
        logger.info("[HappyHorseAdapter] created animate mix task: %s mode=%s", task_id, mode)

        started_at = asyncio.get_running_loop().time()
        last_progress = 10
        yield ProgressUpdate(progress=10, status="processing", message="AnimateMix task created")

        while asyncio.get_running_loop().time() - started_at < self._video_timeout:
            task_response = await self._client.request_json(
                path=f"/api/v1/tasks/{quote(task_id)}",
                method="GET",
            )
            status = self._extract_remote_status(task_response)

            if status == "succeeded":
                remote_url = self._extract_video_url(task_response)
                yield ProgressUpdate(progress=90, status="processing", message="Downloading face swap result")
                local_url = await self._download_result_asset(
                    remote_url,
                    filename_prefix="animate-mix",
                    default_extension=".mp4",
                )
                yield ProgressUpdate(
                    progress=100,
                    status="success",
                    message="AnimateMix completed",
                    output_video=local_url,
                )
                return

            if status in {"failed", "canceled", "unknown"}:
                raise RuntimeError(self._extract_task_error(task_response, fallback_status=status))

            if status == "pending":
                progress = 18
                message = "AnimateMix task queued"
            else:
                elapsed_ratio = min(1.0, (asyncio.get_running_loop().time() - started_at) / self._video_timeout)
                progress = min(85, max(last_progress, 25 + int(elapsed_ratio * 55)))
                message = "AnimateMix in progress"

            last_progress = progress
            yield ProgressUpdate(progress=progress, status="processing", message=message)
            await asyncio.sleep(self._poll_interval)

        raise TimeoutError(
            f"AnimateMix timed out after {self._video_timeout:.0f}s (task_id={task_id})"
        )

    async def _generate_digital_human(self, params: GenerateParams) -> AsyncIterator[ProgressUpdate]:
        """Handle Digital Human (S2V) generation: TTS → S2V chain.

        Two input modes:
        1. Audio upload mode — ``params.source_audio`` is provided, TTS is skipped.
        2. TTS mode — ``params.prompt`` (text) is converted to speech via TTS.
        """
        text = params.prompt.strip()
        source_image = (params.source_images or [None])[0]
        source_audio = params.source_audio.strip() if params.source_audio else ""

        if not source_image:
            raise ValueError("Source image is required for digital human generation")
        if not source_audio and not text:
            raise ValueError("Either text or source audio is required for digital human generation")

        # Step 1: Obtain audio (from upload or TTS)
        if source_audio:
            audio_input_path = source_audio
            yield ProgressUpdate(progress=5, status="processing", message="使用上传的音频...")
        else:
            # Determine TTS provider: cloned voice → DashScope, otherwise → Volcengine
            use_dashscope_tts = (
                self._dashscope_tts_service
                and self._dashscope_tts_service.is_configured
                and self._voice_cloning_service
                and params.voice
                and self._voice_cloning_service.is_cloned_voice(params.voice)
            )
            if use_dashscope_tts:
                yield ProgressUpdate(progress=5, status="processing", message="正在合成语音（克隆音色）...")
                try:
                    audio_input_path = await self._dashscope_tts_service.generate_speech(text, params.voice)
                    logger.info("[HappyHorseAdapter] DashScope TTS completed (cloned voice): %s", audio_input_path)
                except Exception as exc:
                    raise RuntimeError(f"克隆音色 TTS 失败: {exc}") from exc
            else:
                if not self._tts_service or not self._tts_service.is_configured:
                    raise RuntimeError(
                        "TTS service is not configured. Please set VOLCENGINE_TTS_APP_ID "
                        "and VOLCENGINE_TTS_ACCESS_KEY in backend/.env"
                    )
                yield ProgressUpdate(progress=5, status="processing", message="正在合成语音...")
                try:
                    audio_input_path = await self._tts_service.generate_speech(text, params.voice)
                    logger.info("[HappyHorseAdapter] TTS completed: %s", audio_input_path)
                except Exception as exc:
                    raise RuntimeError(f"TTS failed: {exc}") from exc

        # Step 2: Resolve audio and image URLs for DashScope
        resolved_audio = await self._resolve_video_asset_input(audio_input_path)
        resolved_image = await self._resolve_video_asset_input(source_image)

        yield ProgressUpdate(progress=15, status="processing", message="语音合成完成，提交数字人任务...")

        # Step 3: Submit S2V task
        create_response = await self._client.request_json(
            path="/api/v1/services/aigc/image2video/video-synthesis",
            method="POST",
            headers={"X-DashScope-Async": "enable"},
            payload={
                "model": self._s2v_model,
                "input": {
                    "image_url": resolved_image,
                    "audio_url": resolved_audio,
                },
                "parameters": {
                    "resolution": params.s2v_resolution,
                    "style": params.s2v_style,
                },
            },
        )

        task_id = self._extract_task_id(create_response)
        logger.info("[HappyHorseAdapter] created digital human task: %s", task_id)

        started_at = asyncio.get_running_loop().time()
        last_progress = 15
        yield ProgressUpdate(progress=15, status="processing", message="数字人任务已提交")

        # Step 4: Poll for result
        while asyncio.get_running_loop().time() - started_at < self._video_timeout:
            task_response = await self._client.request_json(
                path=f"/api/v1/tasks/{quote(task_id)}",
                method="GET",
            )
            status = self._extract_remote_status(task_response)

            if status == "succeeded":
                remote_url = self._extract_video_url(task_response)
                yield ProgressUpdate(progress=90, status="processing", message="下载生成结果...")
                local_url = await self._download_result_asset(
                    remote_url,
                    filename_prefix="digital-human",
                    default_extension=".mp4",
                )
                yield ProgressUpdate(
                    progress=100,
                    status="success",
                    message="数字人生成完成",
                    output_video=local_url,
                )
                return

            if status in {"failed", "canceled", "unknown"}:
                raise RuntimeError(self._extract_task_error(task_response, fallback_status=status))

            if status == "pending":
                progress = 18
                message = "数字人任务排队中..."
            else:
                elapsed_ratio = min(1.0, (asyncio.get_running_loop().time() - started_at) / self._video_timeout)
                progress = min(85, max(last_progress, 25 + int(elapsed_ratio * 55)))
                message = "数字人生成中..."

            last_progress = progress
            yield ProgressUpdate(progress=progress, status="processing", message=message)
            await asyncio.sleep(self._poll_interval)

        raise TimeoutError(
            f"Digital human task timed out after {self._video_timeout:.0f}s (task_id={task_id})"
        )

    def _resolve_hh_resolution(self, params: GenerateParams) -> str:
        """Resolve resolution for HappyHorse: node-level preference, fallback to global config."""
        node_res = params.video_resolution.upper()  # "720p" → "720P"
        if node_res in ("480P", "720P", "1080P"):
            return node_res
        return self._video_resolution

    def _build_video_request(
        self, params: GenerateParams
    ) -> tuple[str, list[dict[str, str]], dict[str, Any]]:
        """Determine model, media, and parameters from task_type and params."""
        task_type = params.task_type
        resolution = self._resolve_hh_resolution(params)

        if task_type == "t2v":
            model = self._t2v_model
            media: list[dict[str, str]] = []
            parameters: dict[str, Any] = {
                "resolution": resolution,
                "ratio": params.aspect_ratio or "16:9",
                "duration": max(2, min(15, int(round(params.duration_seconds or 5)))),
            }

        elif task_type == "r2v":
            images = [item for item in (params.reference_images or []) if item]
            if not images:
                raise ValueError("At least one reference image is required for r2v generation")
            model = self._r2v_model
            media = [{"type": "reference_image", "url": url} for url in images]
            parameters = {
                "resolution": resolution,
                "ratio": params.aspect_ratio or "16:9",
                "duration": max(2, min(15, int(round(params.duration_seconds or 5)))),
            }

        else:
            # i2v or auto-detect (task_type == "video")
            source_images = [item for item in (params.source_images or []) if item]

            if not source_images and (params.reference_images or []):
                return self._build_video_request(
                    GenerateParams(
                        task_type="r2v",
                        prompt=params.prompt,
                        aspect_ratio=params.aspect_ratio,
                        reference_images=params.reference_images,
                        duration_seconds=params.duration_seconds,
                        seed=params.seed,
                        with_audio=params.with_audio,
                        happyhorse_mode=params.happyhorse_mode,
                        video_resolution=params.video_resolution,
                    )
                )

            if not source_images:
                return self._build_video_request(
                    GenerateParams(
                        task_type="t2v",
                        prompt=params.prompt,
                        aspect_ratio=params.aspect_ratio,
                        duration_seconds=params.duration_seconds,
                        seed=params.seed,
                        with_audio=params.with_audio,
                        happyhorse_mode=params.happyhorse_mode,
                        video_resolution=params.video_resolution,
                    )
                )

            model = self._i2v_model
            if len(source_images) > 1:
                logger.warning(
                    "[HappyHorseAdapter] i2v received %d source images, only the first will be used; "
                    "use r2v mode for multi-image generation",
                    len(source_images),
                )
            media = [{"type": "first_frame", "url": source_images[0]}]
            parameters = {
                "resolution": resolution,
                "duration": max(2, min(15, int(round(params.duration_seconds or 5)))),
            }

        # Common HappyHorse parameters (only include when non-default to
        # avoid sending unsupported fields to the API).
        if params.seed >= 0:
            parameters["seed"] = params.seed
        if not params.with_audio:
            parameters["with_audio"] = False
        if params.happyhorse_mode != "pro":
            parameters["mode"] = params.happyhorse_mode

        return model, media, parameters

    async def _resolve_video_asset_input(self, asset_url: str) -> str:
        """Resolve an asset URL to a publicly accessible URL for DashScope."""
        if asset_url.startswith(("http://", "https://")):
            return asset_url

        local_path = self._resolve_local_asset_path(asset_url)
        if not local_path or not local_path.exists():
            raise FileNotFoundError(f"Asset not found: {asset_url}")

        remote_url = self._read_preserved_remote_url(local_path)
        if remote_url:
            return remote_url

        if self._public_base_url and asset_url.startswith("/"):
            return urljoin(f"{self._public_base_url}/", asset_url.lstrip("/"))

        if self._asset_hosting_service and self._asset_hosting_service.is_configured:
            return await self._asset_hosting_service.upload_local_file(
                local_path,
                purpose="happyhorse-video-frame",
            )

        raise RuntimeError(
            "HappyHorse requires publicly accessible image/video URLs. "
            "Please configure PUBLIC_BASE_URL, or fill in OSS settings "
            "(ALIYUN_OSS_*) in backend/.env for temporary upload."
        )

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

    async def _download_result_asset(
        self,
        remote_url: str,
        *,
        filename_prefix: str,
        default_extension: str,
    ) -> str:
        if remote_url.startswith("data:"):
            raw_bytes, content_type = self._decode_data_url(remote_url)
        else:
            raw_bytes, content_type = await self._client.download_asset(remote_url)

        extension = self._guess_extension(remote_url, content_type, default_extension)
        file_name = f"{filename_prefix}-{uuid4().hex[:12]}{extension}"
        target_path = self._output_dir / file_name
        await asyncio.to_thread(target_path.write_bytes, raw_bytes)
        self._write_asset_metadata(target_path, remote_url, content_type)
        return f"/outputs/{quote(file_name)}"

    def _metadata_path_for_asset(self, asset_path: Path) -> Path:
        return asset_path.parent / f"{asset_path.name}.meta.json"

    def _write_asset_metadata(self, asset_path: Path, remote_url: str, content_type: str | None) -> None:
        if not remote_url.startswith(("http://", "https://")):
            return

        metadata_path = self._metadata_path_for_asset(asset_path)
        payload = {
            "remote_url": remote_url,
            "content_type": content_type,
        }
        metadata_path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")

    def _read_preserved_remote_url(self, asset_path: Path) -> str | None:
        metadata_path = self._metadata_path_for_asset(asset_path)
        if not metadata_path.exists():
            return None

        try:
            payload = json.loads(metadata_path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError) as exc:
            logger.warning("[HappyHorseAdapter] failed to read asset metadata for %s: %s", asset_path, exc)
            return None

        remote_url = payload.get("remote_url")
        if isinstance(remote_url, str) and remote_url.startswith(("http://", "https://")):
            return remote_url

        return None

    def _extract_task_id(self, payload: dict[str, Any]) -> str:
        output = payload.get("output")
        if isinstance(output, dict):
            for key in ("task_id", "id"):
                value = output.get(key)
                if isinstance(value, str) and value:
                    return value

        for key in ("task_id", "id"):
            value = payload.get(key)
            if isinstance(value, str) and value:
                return value

        raise RuntimeError(f"HappyHorse task response does not contain a task id: {payload}")

    def _extract_remote_status(self, payload: dict[str, Any]) -> str:
        output = payload.get("output")
        if isinstance(output, dict):
            status = output.get("task_status")
            if isinstance(status, str) and status:
                return status.lower()

        raise RuntimeError(f"HappyHorse task response does not contain a status: {payload}")

    def _extract_task_error(self, payload: dict[str, Any], fallback_status: str) -> str:
        output = payload.get("output")
        if isinstance(output, dict):
            for key in ("message", "code"):
                value = output.get(key)
                if isinstance(value, str) and value.strip():
                    return value.strip()

        for key in ("message", "code"):
            value = payload.get(key)
            if isinstance(value, str) and value.strip():
                return value.strip()

        return f"HappyHorse task ended with status: {fallback_status}"

    def _extract_video_url(self, payload: dict[str, Any]) -> str:
        output = payload.get("output")
        if isinstance(output, dict):
            video_url = output.get("video_url")
            if isinstance(video_url, str) and video_url:
                return video_url

            # Some tasks (e.g. animate-mix) nest the URL in output.results
            results = output.get("results")
            if isinstance(results, dict):
                video_url = results.get("video_url")
                if isinstance(video_url, str) and video_url:
                    return video_url

        raise RuntimeError(f"HappyHorse task response does not contain a video URL: {payload}")

    def _guess_extension(self, asset_url: str, content_type: str | None, default_extension: str) -> str:
        if content_type:
            guessed = mimetypes.guess_extension(content_type.split(";", 1)[0].strip())
            if guessed:
                return guessed

        parsed = urlparse(asset_url)
        suffix = Path(parsed.path).suffix.lower()
        if suffix:
            return suffix

        return default_extension

    def _decode_data_url(self, value: str) -> tuple[bytes, str | None]:
        header, encoded = value.split(",", 1)
        content_type = None
        if header.startswith("data:"):
            metadata = header[5:]
            content_type = metadata.split(";", 1)[0] or None

        try:
            return base64.b64decode(encoded), content_type
        except binascii.Error as exc:
            raise RuntimeError("Invalid data URL returned by HappyHorse") from exc
