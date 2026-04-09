"""
Wanx adapter for DashScope image generation and image-to-video tasks.
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

logger = logging.getLogger(__name__)

IMAGE_SIZE_MAP: dict[str, dict[str, str]] = {
    "1K": {
        "1:1": "1024x1024",
        "16:9": "1280x720",
        "9:16": "720x1280",
        "4:3": "1152x864",
        "3:4": "864x1152",
    },
    "2K": {
        "1:1": "2048x2048",
        "16:9": "2048x1152",
        "9:16": "1152x2048",
        "4:3": "2048x1536",
        "3:4": "1536x2048",
    },
    "4K": {
        "1:1": "4096x4096",
        "16:9": "4096x2304",
        "9:16": "2304x4096",
        "4:3": "4096x3072",
        "3:4": "3072x4096",
    },
}


class WanxAdapter(BaseAdapter):
    """DashScope-based adapter for Wanx image generation and image-to-video."""

    def __init__(
        self,
        *,
        client: DashScopeClient,
        upload_dir: str | Path,
        output_dir: str | Path,
        image_model: str,
        video_model: str,
        poll_interval: float,
        video_timeout: float,
        public_base_url: str = "",
        video_resolution: str = "720P",
        watermark: bool = False,
        asset_hosting_service: AliyunOssAssetHostingService | None = None,
    ):
        self._client = client
        self._upload_dir = Path(upload_dir)
        self._output_dir = Path(output_dir)
        self._image_model = image_model
        self._video_model = video_model
        self._poll_interval = poll_interval
        self._video_timeout = video_timeout
        self._public_base_url = public_base_url.rstrip("/")
        self._video_resolution = video_resolution
        self._watermark = watermark
        self._asset_hosting_service = asset_hosting_service
        self._upload_dir.mkdir(parents=True, exist_ok=True)
        self._output_dir.mkdir(parents=True, exist_ok=True)

    @property
    def name(self) -> str:
        return "wanx"

    async def generate(self, params: GenerateParams) -> AsyncIterator[ProgressUpdate]:
        if params.task_type == "video":
            async for update in self._generate_video(params):
                yield update
            return

        if params.task_type != "image":
            raise ValueError(f"Wanx adapter does not support task type: {params.task_type}")

        async for update in self._generate_image(params):
            yield update

    async def health_check(self) -> bool:
        return self._client.is_configured

    async def _generate_image(self, params: GenerateParams) -> AsyncIterator[ProgressUpdate]:
        prompt = params.prompt.strip()
        if not prompt:
            raise ValueError("Prompt is required for image generation")

        image_inputs = [self._resolve_image_asset_input(item) for item in (params.reference_images or []) if item]
        image_size = self._resolve_image_size(params.aspect_ratio, params.resolution, has_inputs=bool(image_inputs))

        yield ProgressUpdate(progress=5, status="processing", message="Preparing Wanx image request")
        response = await self._client.request_json(
            path="/api/v1/services/aigc/multimodal-generation/generation",
            method="POST",
            payload={
                "model": self._image_model,
                "input": {
                    "messages": [
                        {
                            "role": "user",
                            "content": [
                                *({"image": image_url} for image_url in image_inputs),
                                {"text": prompt},
                            ],
                        }
                    ]
                },
                "parameters": {
                    "size": image_size,
                    "n": 1,
                    "watermark": self._watermark,
                    "thinking_mode": not image_inputs,
                },
            },
        )

        remote_url = self._extract_image_url(response)
        yield ProgressUpdate(progress=80, status="processing", message="Downloading generated image")
        local_url = await self._download_result_asset(
            remote_url,
            filename_prefix="wanx-image",
            default_extension=".png",
        )

        yield ProgressUpdate(
            progress=100,
            status="success",
            message="Wanx image generation completed",
            output_image=local_url,
        )

    async def _generate_video(self, params: GenerateParams) -> AsyncIterator[ProgressUpdate]:
        prompt = params.prompt.strip()
        if not prompt:
            raise ValueError("Prompt is required for video generation")

        source_images = [
            await self._resolve_video_asset_input(item)
            for item in (params.source_images or [])
            if item
        ]
        if not source_images:
            raise ValueError("At least one source image is required for image-to-video generation")

        media: list[dict[str, str]] = [{"type": "first_frame", "url": source_images[0]}]
        if len(source_images) > 1:
            media.append({"type": "last_frame", "url": source_images[-1]})

        duration = max(2, min(15, int(round(params.duration_seconds or 5))))
        yield ProgressUpdate(progress=5, status="processing", message="Preparing Wanx video task")

        create_response = await self._client.request_json(
            path="/api/v1/services/aigc/video-generation/video-synthesis",
            method="POST",
            headers={"X-DashScope-Async": "enable"},
            payload={
                "model": self._video_model,
                "input": {
                    "prompt": prompt,
                    "media": media,
                },
                "parameters": {
                    "resolution": self._video_resolution,
                    "duration": duration,
                    "prompt_extend": False,
                    "watermark": self._watermark,
                },
            },
        )

        task_id = self._extract_task_id(create_response)
        logger.info("[WanxAdapter] created video task: %s", task_id)

        started_at = asyncio.get_running_loop().time()
        last_progress = 10
        yield ProgressUpdate(progress=10, status="processing", message="Video task created")

        while asyncio.get_running_loop().time() - started_at < self._video_timeout:
            task_response = await self._client.request_json(
                path=f"/api/v1/tasks/{quote(task_id)}",
                method="GET",
            )
            status = self._extract_remote_status(task_response)

            if status == "succeeded":
                remote_url = self._extract_video_url(task_response)
                yield ProgressUpdate(progress=90, status="processing", message="Downloading generated video")
                local_url = await self._download_result_asset(
                    remote_url,
                    filename_prefix="wanx-video",
                    default_extension=".mp4",
                )
                yield ProgressUpdate(
                    progress=100,
                    status="success",
                    message="Wanx video generation completed",
                    output_video=local_url,
                )
                return

            if status in {"failed", "canceled", "unknown"}:
                raise RuntimeError(self._extract_task_error(task_response, fallback_status=status))

            if status == "pending":
                progress = 18
                message = "Wanx video task queued"
            else:
                elapsed_ratio = min(1.0, (asyncio.get_running_loop().time() - started_at) / self._video_timeout)
                progress = min(85, max(last_progress, 25 + int(elapsed_ratio * 55)))
                message = "Wanx video generation in progress"

            last_progress = progress
            yield ProgressUpdate(progress=progress, status="processing", message=message)
            await asyncio.sleep(self._poll_interval)

        raise TimeoutError(f"Wanx video generation timed out after {self._video_timeout:.0f}s (task_id={task_id})")

    def _resolve_image_size(self, aspect_ratio: str, resolution: str, *, has_inputs: bool) -> str:
        safe_resolution = resolution if resolution in IMAGE_SIZE_MAP else "2K"
        if has_inputs and safe_resolution == "4K":
            logger.info("[WanxAdapter] fallback image edit size from 4K to 2K")
            safe_resolution = "2K"

        resolution_map = IMAGE_SIZE_MAP.get(safe_resolution, IMAGE_SIZE_MAP["2K"])
        raw_size = resolution_map.get(aspect_ratio, resolution_map["1:1"])
        # DashScope Wanx expects `width*height`, while other adapters in the codebase use `widthxheight`.
        return raw_size.replace("x", "*")

    def _resolve_image_asset_input(self, asset_url: str) -> str:
        if asset_url.startswith(("http://", "https://", "data:")):
            return asset_url

        local_path = self._resolve_local_asset_path(asset_url)
        if not local_path or not local_path.exists():
            raise FileNotFoundError(f"Asset not found for Wanx image request: {asset_url}")

        return self._encode_local_asset_as_data_url(local_path)

    async def _resolve_video_asset_input(self, asset_url: str) -> str:
        if asset_url.startswith(("http://", "https://")):
            return asset_url

        local_path = self._resolve_local_asset_path(asset_url)
        if not local_path or not local_path.exists():
            raise FileNotFoundError(f"Asset not found for Wanx video request: {asset_url}")

        remote_url = self._read_preserved_remote_url(local_path)
        if remote_url:
            return remote_url

        if self._public_base_url and asset_url.startswith("/"):
            return urljoin(f"{self._public_base_url}/", asset_url.lstrip("/"))

        if self._asset_hosting_service and self._asset_hosting_service.is_configured:
            return await self._asset_hosting_service.upload_local_file(
                local_path,
                purpose="wanx-video-frame",
            )

        raise RuntimeError(
            "Wanx 图生视频要求首尾帧使用公网可访问 URL。请配置 PUBLIC_BASE_URL，"
            "或在 backend/.env 中填写 ALIYUN_OSS_ENDPOINT / ALIYUN_OSS_ACCESS_KEY_ID / "
            "ALIYUN_OSS_ACCESS_KEY_SECRET / ALIYUN_OSS_BUCKET，用于临时上传首尾帧后再重试。"
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

    def _encode_local_asset_as_data_url(self, local_path: Path) -> str:
        mime_type = mimetypes.guess_type(local_path.name)[0] or "application/octet-stream"
        encoded = base64.b64encode(local_path.read_bytes()).decode("ascii")
        return f"data:{mime_type};base64,{encoded}"

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
            logger.warning("[WanxAdapter] failed to read asset metadata for %s: %s", asset_path, exc)
            return None

        remote_url = payload.get("remote_url")
        if isinstance(remote_url, str) and remote_url.startswith(("http://", "https://")):
            return remote_url

        return None

    def _extract_image_url(self, payload: dict[str, Any]) -> str:
        output = payload.get("output")
        if isinstance(output, dict):
            choices = output.get("choices")
            if isinstance(choices, list):
                for item in choices:
                    if not isinstance(item, dict):
                        continue
                    message = item.get("message")
                    if not isinstance(message, dict):
                        continue
                    content = message.get("content")
                    if isinstance(content, list):
                        for content_item in content:
                            if isinstance(content_item, dict):
                                image_url = content_item.get("image")
                                if isinstance(image_url, str) and image_url:
                                    return image_url

        raise RuntimeError(f"Wanx image response does not contain a downloadable URL: {payload}")

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

        raise RuntimeError(f"Wanx video task response does not contain a task id: {payload}")

    def _extract_remote_status(self, payload: dict[str, Any]) -> str:
        output = payload.get("output")
        if isinstance(output, dict):
            status = output.get("task_status")
            if isinstance(status, str) and status:
                return status.lower()

        raise RuntimeError(f"Wanx task response does not contain a status: {payload}")

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

        return f"Wanx video task ended with status: {fallback_status}"

    def _extract_video_url(self, payload: dict[str, Any]) -> str:
        output = payload.get("output")
        if isinstance(output, dict):
            video_url = output.get("video_url")
            if isinstance(video_url, str) and video_url:
                return video_url

        raise RuntimeError(f"Wanx video task response does not contain a video URL: {payload}")

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
            raise RuntimeError("Invalid data URL returned by Wanx") from exc
