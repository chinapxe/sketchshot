"""
Volcengine Ark adapter for prompt-backed image and video generation.
"""
from __future__ import annotations

import asyncio
import base64
import binascii
import logging
import math
import mimetypes
from pathlib import Path
from typing import Any, AsyncIterator
from urllib.parse import quote, unquote, urljoin, urlparse
from uuid import uuid4

from .base import BaseAdapter, GenerateParams, ProgressUpdate
from ..services.aliyun_oss_service import AliyunOssAssetHostingService
from ..services.volcengine_client import VolcengineClient

logger = logging.getLogger(__name__)

VIDEO_EXTENSIONS = {".mp4", ".mov", ".webm", ".m4v", ".gif"}
MIN_IMAGE_PIXELS = 3_686_400
IMAGE_SIZE_STEP = 16
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


class VolcengineAdapter(BaseAdapter):
    """Ark-based adapter for text/image generation and image-to-video tasks."""

    def __init__(
        self,
        *,
        client: VolcengineClient,
        upload_dir: str | Path,
        output_dir: str | Path,
        image_model: str,
        image_edit_model: str,
        video_model: str,
        video_v2_model: str = "",
        video_v2_fast_model: str = "",
        video_version: str = "1.5",
        poll_interval: float,
        video_timeout: float,
        public_base_url: str = "",
        output_format: str = "png",
        watermark: bool = False,
        asset_hosting_service: AliyunOssAssetHostingService | None = None,
    ):
        self._client = client
        self._upload_dir = Path(upload_dir)
        self._output_dir = Path(output_dir)
        self._image_model = image_model
        self._image_edit_model = image_edit_model
        self._video_model = video_model
        self._video_v2_model = video_v2_model
        self._video_v2_fast_model = video_v2_fast_model
        self._video_version = video_version
        self._poll_interval = poll_interval
        self._video_timeout = video_timeout
        self._public_base_url = public_base_url.rstrip("/")
        self._output_format = output_format
        self._watermark = watermark
        self._asset_hosting_service = asset_hosting_service
        self._upload_dir.mkdir(parents=True, exist_ok=True)
        self._output_dir.mkdir(parents=True, exist_ok=True)

    @property
    def name(self) -> str:
        return "volcengine"

    async def generate(self, params: GenerateParams) -> AsyncIterator[ProgressUpdate]:
        if params.task_type == "video":
            async for update in self._generate_video(params):
                yield update
            return

        if params.task_type == "vedit":
            async for update in self._generate_video_edit(params):
                yield update
            return

        if params.task_type != "image":
            raise ValueError(f"Volcengine adapter does not support task type: {params.task_type}")

        async for update in self._generate_image(params):
            yield update

    async def health_check(self) -> bool:
        return self._client.is_configured

    async def _generate_image(self, params: GenerateParams) -> AsyncIterator[ProgressUpdate]:
        prompt = params.prompt.strip()
        if not prompt:
            raise ValueError("Prompt is required for image generation")

        yield ProgressUpdate(progress=5, status="processing", message="Preparing Volcengine image request")
        image_inputs = [self._resolve_asset_input(item) for item in (params.reference_images or [])]
        image_size = self._resolve_image_size(params.aspect_ratio, params.resolution)

        payload: dict[str, Any] = {
            "model": self._image_edit_model if image_inputs else self._image_model,
            "prompt": prompt,
            "size": image_size,
            "output_format": self._output_format,
            "response_format": "url",
            "watermark": self._watermark,
        }
        negative = (params.negative_prompt or "").strip()
        if negative:
            payload["negative_prompt"] = negative
        if image_inputs:
            payload["image"] = image_inputs[0] if len(image_inputs) == 1 else image_inputs

        yield ProgressUpdate(progress=35, status="processing", message="Calling Volcengine image API")
        response = await self._client.request_json(
            path="/images/generations",
            method="POST",
            payload=payload,
        )

        remote_url = self._extract_image_url(response)
        yield ProgressUpdate(progress=80, status="processing", message="Downloading generated image")
        local_url = await self._download_result_asset(
            remote_url,
            filename_prefix="volc-image",
            default_extension=f".{self._output_format.lower().lstrip('.')}",
        )

        yield ProgressUpdate(
            progress=100,
            status="success",
            message="Volcengine image generation completed",
            output_image=local_url,
            output_image_original_url=remote_url,
        )

    def _resolve_image_size(self, aspect_ratio: str, resolution: str) -> str:
        resolution_map = IMAGE_SIZE_MAP.get(resolution, IMAGE_SIZE_MAP["2K"])
        requested_size = resolution_map.get(aspect_ratio, resolution_map["1:1"])
        width, height = self._parse_image_size(requested_size)

        if width * height >= MIN_IMAGE_PIXELS:
            return requested_size

        ratio = width / height
        normalized_width = max(width, self._round_up_to_step(math.sqrt(MIN_IMAGE_PIXELS * ratio)))
        normalized_height = max(height, self._round_up_to_step(normalized_width / ratio))

        if normalized_width * normalized_height < MIN_IMAGE_PIXELS:
            normalized_height = self._round_up_to_step(MIN_IMAGE_PIXELS / normalized_width)

        normalized_size = f"{normalized_width}x{normalized_height}"
        logger.info(
            "[VolcengineAdapter] normalized image size from %s to %s to satisfy minimum pixels",
            requested_size,
            normalized_size,
        )
        return normalized_size

    def _parse_image_size(self, value: str) -> tuple[int, int]:
        width_text, height_text = value.lower().split("x", 1)
        return int(width_text), int(height_text)

    def _round_up_to_step(self, value: float) -> int:
        return int(math.ceil(value / IMAGE_SIZE_STEP) * IMAGE_SIZE_STEP)

    async def _generate_video(self, params: GenerateParams) -> AsyncIterator[ProgressUpdate]:
        prompt = params.prompt.strip()
        if not prompt:
            raise ValueError("Prompt is required for video generation")

        source_images = [self._resolve_asset_input(item) for item in (params.source_images or []) if item]
        if not source_images:
            raise ValueError("At least one source image is required for image-to-video generation")

        effective_version = params.video_version or self._video_version
        is_v2 = effective_version == "2.0"

        if is_v2:
            payload = self._build_v2_video_payload(prompt, source_images, params)
        else:
            content: list[dict[str, Any]] = [{"type": "text", "text": prompt}]
            if len(source_images) == 1:
                content.append({"type": "image_url", "image_url": {"url": source_images[0]}})
            else:
                content.append(
                    {
                        "type": "image_url",
                        "image_url": {"url": source_images[0]},
                        "role": "first_frame",
                    }
                )
                content.append(
                    {
                        "type": "image_url",
                        "image_url": {"url": source_images[-1]},
                        "role": "last_frame",
                    }
                )

            payload = {
                "model": self._video_model,
                "content": content,
                "ratio": params.aspect_ratio or "adaptive",
                "duration": max(1, int(round(params.duration_seconds or 4))),
                "watermark": self._watermark,
            }

        yield ProgressUpdate(progress=5, status="processing", message="Preparing Volcengine video task")
        create_response = await self._client.request_json(
            path="/contents/generations/tasks",
            method="POST",
            payload=payload,
        )

        task_id = self._extract_task_id(create_response)
        logger.info("[VolcengineAdapter] created video task: %s", task_id)

        started_at = asyncio.get_running_loop().time()
        last_progress = 10
        yield ProgressUpdate(progress=10, status="processing", message="Video task created")

        while asyncio.get_running_loop().time() - started_at < self._video_timeout:
            task_response = await self._client.request_json(
                path=f"/contents/generations/tasks/{quote(task_id)}",
                method="GET",
            )
            status = self._extract_remote_status(task_response)

            if status == "succeeded":
                remote_url = self._extract_video_url(task_response)
                yield ProgressUpdate(progress=90, status="processing", message="Downloading generated video")
                local_url = await self._download_result_asset(
                    remote_url,
                    filename_prefix="volc-video",
                    default_extension=".mp4",
                )

                last_frame_local: str | None = None
                if params.return_last_frame:
                    last_frame_remote = self._extract_last_frame_url(task_response)
                    if last_frame_remote:
                        try:
                            last_frame_local = await self._download_result_asset(
                                last_frame_remote,
                                filename_prefix="volc-lastframe",
                                default_extension=".png",
                            )
                        except Exception as exc:
                            logger.warning("[VolcengineAdapter] Failed to download last frame: %s", exc)
                    else:
                        logger.warning("[VolcengineAdapter] return_last_frame=true but no last_frame URL in response")

                yield ProgressUpdate(
                    progress=100,
                    status="success",
                    message="Volcengine video generation completed",
                    output_video=local_url,
                    output_last_frame=last_frame_local,
                )
                return

            if status in {"failed", "expired", "cancelled"}:
                raise RuntimeError(self._extract_task_error(task_response, fallback_status=status))

            if status == "queued":
                progress = 18
                message = "Volcengine video task queued"
            else:
                elapsed_ratio = min(1.0, (asyncio.get_running_loop().time() - started_at) / self._video_timeout)
                progress = min(85, max(last_progress, 25 + int(elapsed_ratio * 55)))
                message = "Volcengine video generation in progress"

            last_progress = progress
            yield ProgressUpdate(progress=progress, status="processing", message=message)
            await asyncio.sleep(self._poll_interval)

        raise TimeoutError(
            f"Volcengine video generation timed out after {self._video_timeout:.0f}s (task_id={task_id})"
        )

    async def _generate_video_edit(self, params: GenerateParams) -> AsyncIterator[ProgressUpdate]:
        """Seedance 2.0 视频编辑通道（r2v 端点）。

        本质：源视频作 reference_video + 编辑提示词，调 Seedance 2.0 r2v 端点。
        参数（分辨率/时长/音频/seed/negative_prompt/camera_fixed/末帧）全部取自 GenerateParams。
        """
        prompt = params.prompt.strip()
        if not prompt:
            raise ValueError("Prompt is required for video edit")

        if not params.source_video:
            raise ValueError("Source video is required for video edit")

        effective_version = params.video_version or self._video_version
        if effective_version != "2.0":
            raise ValueError(
                f"Volcengine video edit currently only supports Seedance 2.0 (got version={effective_version!r})"
            )

        source_video_url = await self._resolve_video_asset_input(params.source_video)
        reference_images = [self._resolve_asset_input(item) for item in (params.reference_images or []) if item]
        logger.info(
            "[VolcengineAdapter] vedit source_video resolved kind=%s",
            "http" if source_video_url.startswith(("http://", "https://")) else (
                "data-url" if source_video_url.startswith("data:") else "other"
            ),
        )

        model_id = self._video_v2_model
        if not model_id:
            raise ValueError("VOLCENGINE_VIDEO_V2_MODEL is not configured")

        content: list[dict[str, Any]] = [{"type": "text", "text": prompt}]
        content.append({
            "type": "video_url",
            "video_url": {"url": source_video_url},
            "role": "reference_video",
        })
        for url in reference_images:
            content.append({
                "type": "image_url",
                "image_url": {"url": url},
                "role": "reference_image",
            })

        validated_resolution = (params.video_resolution or "720p").lower()
        if validated_resolution not in ("480p", "720p", "1080p"):
            validated_resolution = "720p"

        payload: dict[str, Any] = {
            "model": model_id,
            "content": content,
            "ratio": "adaptive",
            "resolution": validated_resolution,
            "duration": max(4, min(15, int(params.duration_seconds or 5))),
            "generate_audio": params.generate_audio,
            "watermark": self._watermark,
        }

        if params.seed is not None and params.seed >= 0:
            payload["seed"] = params.seed
        if params.negative_prompt:
            payload["negative_prompt"] = params.negative_prompt
        if params.return_last_frame:
            payload["metadata"] = {"return_last_frame": True}

        logger.info(
            "[VolcengineAdapter] vedit payload: model=%s ratio=%s resolution=%s duration=%s generate_audio=%s seed=%s prompt_len=%d ref_images=%d",
            model_id,
            payload["ratio"],
            payload["resolution"],
            payload["duration"],
            payload["generate_audio"],
            payload.get("seed", "N/A"),
            len(prompt),
            len(reference_images),
        )

        yield ProgressUpdate(progress=5, status="processing", message="Preparing Volcengine video edit task")
        create_response = await self._client.request_json(
            path="/contents/generations/tasks",
            method="POST",
            payload=payload,
        )

        task_id = self._extract_task_id(create_response)
        logger.info("[VolcengineAdapter] created video edit task: %s", task_id)

        started_at = asyncio.get_running_loop().time()
        last_progress = 10
        yield ProgressUpdate(progress=10, status="processing", message="Video edit task created")

        while asyncio.get_running_loop().time() - started_at < self._video_timeout:
            task_response = await self._client.request_json(
                path=f"/contents/generations/tasks/{quote(task_id)}",
                method="GET",
            )
            status = self._extract_remote_status(task_response)

            if status == "succeeded":
                remote_url = self._extract_video_url(task_response)
                yield ProgressUpdate(progress=90, status="processing", message="Downloading edited video")
                local_url = await self._download_result_asset(
                    remote_url,
                    filename_prefix="volc-vedit",
                    default_extension=".mp4",
                )
                yield ProgressUpdate(
                    progress=100,
                    status="success",
                    message="Volcengine video edit completed",
                    output_video=local_url,
                )
                return

            if status in {"failed", "expired", "cancelled"}:
                raise RuntimeError(self._extract_task_error(task_response, fallback_status=status))

            if status == "queued":
                progress = 18
                message = "Volcengine video edit task queued"
            else:
                elapsed_ratio = min(1.0, (asyncio.get_running_loop().time() - started_at) / self._video_timeout)
                progress = min(85, max(last_progress, 25 + int(elapsed_ratio * 55)))
                message = "Volcengine video edit in progress"

            last_progress = progress
            yield ProgressUpdate(progress=progress, status="processing", message=message)
            await asyncio.sleep(self._poll_interval)

        raise TimeoutError(
            f"Volcengine video edit timed out after {self._video_timeout:.0f}s (task_id={task_id})"
        )

    def _build_v2_video_payload(
        self,
        prompt: str,
        source_images: list[str],
        params: GenerateParams,
    ) -> dict[str, Any]:
        """Build Seedance 2.0 payload.

        图像角色策略：
        - 无参考视频 / 音频时（基础 i2v 模式）：
            - 1 张图  -> reference_image
            - 2+ 张图 + multi_image_role='transition'（默认） -> first_frame + last_frame + 中间 reference_image
            - 2+ 张图 + multi_image_role='reference' -> 全部 reference_image
        - 一旦带参考视频或参考音频（r2v 模式，C1 策略）：
            - 所有图统一为 reference_image，不再拆首尾帧（与官方 r2v 示例对齐）

        参考视频 / 音频按 B1 策略：各最多取 1 段，多余的丢弃并打日志。
        """
        content: list[dict[str, Any]] = [{"type": "text", "text": prompt}]

        reference_videos = [self._resolve_asset_input(url) for url in (params.reference_videos or []) if url]
        reference_audios = [self._resolve_asset_input(url) for url in (params.reference_audios or []) if url]

        if len(reference_videos) > 1:
            logger.warning(
                "[VolcengineAdapter] received %d reference videos, only the first will be sent (B1 policy)",
                len(reference_videos),
            )
            reference_videos = reference_videos[:1]
        if len(reference_audios) > 1:
            logger.warning(
                "[VolcengineAdapter] received %d reference audios, only the first will be sent (B1 policy)",
                len(reference_audios),
            )
            reference_audios = reference_audios[:1]

        for idx, url in enumerate(reference_videos):
            kind = "data-url" if url.startswith("data:") else ("https" if url.startswith("https://") else "other")
            logger.info("[VolcengineAdapter] reference_video[%d] kind=%s len=%d", idx, kind, len(url))
        for idx, url in enumerate(reference_audios):
            kind = "data-url" if url.startswith("data:") else ("https" if url.startswith("https://") else "other")
            logger.info("[VolcengineAdapter] reference_audio[%d] kind=%s len=%d", idx, kind, len(url))

        is_r2v_mode = bool(reference_videos) or bool(reference_audios)

        multi_image_role = (params.multi_image_role or "transition").lower()
        force_reference = is_r2v_mode or multi_image_role == "reference"

        if force_reference:
            for url in source_images:
                content.append({
                    "type": "image_url",
                    "image_url": {"url": url},
                    "role": "reference_image",
                })
        elif len(source_images) == 1:
            content.append({
                "type": "image_url",
                "image_url": {"url": source_images[0]},
                "role": "reference_image",
            })
        elif len(source_images) >= 2:
            content.append({
                "type": "image_url",
                "image_url": {"url": source_images[0]},
                "role": "first_frame",
            })
            for url in source_images[1:-1]:
                content.append({
                    "type": "image_url",
                    "image_url": {"url": url},
                    "role": "reference_image",
                })
            content.append({
                "type": "image_url",
                "image_url": {"url": source_images[-1]},
                "role": "last_frame",
            })

        for url in reference_videos:
            content.append({
                "type": "video_url",
                "video_url": {"url": url},
                "role": "reference_video",
            })

        for url in reference_audios:
            content.append({
                "type": "audio_url",
                "audio_url": {"url": url},
                "role": "reference_audio",
            })

        resolution = (params.video_resolution or "720p").lower()
        if resolution not in {"480p", "720p", "1080p"}:
            resolution = "720p"

        tier = (params.video_model_tier or "standard").lower()
        if tier == "fast":
            model_id = self._video_v2_fast_model or self._video_v2_model
            if resolution == "1080p":
                resolution = "720p"
        else:
            tier = "standard"
            model_id = self._video_v2_model

        payload: dict[str, Any] = {
            "model": model_id,
            "content": content,
            "generate_audio": bool(params.generate_audio),
            "ratio": params.aspect_ratio or "adaptive",
            "resolution": resolution,
            "duration": max(4, min(15, int(round(params.duration_seconds or 5)))),
            "watermark": self._watermark,
        }

        if params.seed is not None and params.seed >= 0:
            payload["seed"] = int(params.seed)

        negative_prompt = (params.negative_prompt or "").strip()
        if negative_prompt:
            payload["negative_prompt"] = negative_prompt

        if params.return_last_frame:
            payload["return_last_frame"] = True

        logger.info(
            "[VolcengineAdapter] seedance 2.0 payload: model=%s tier=%s ratio=%s resolution=%s duration=%s generate_audio=%s camera_fixed=%s seed=%s neg_len=%d return_last_frame=%s mode=%s multi_image_role=%s images=%d ref_videos=%d ref_audios=%d",
            payload["model"],
            tier,
            payload["ratio"],
            payload["resolution"],
            payload["duration"],
            payload["generate_audio"],
            payload.get("camera_fixed", "N/A"),
            payload.get("seed", "random"),
            len(negative_prompt),
            bool(params.return_last_frame),
            "r2v" if is_r2v_mode else "i2v",
            "reference" if force_reference else multi_image_role,
            len(source_images),
            len(reference_videos),
            len(reference_audios),
        )

        for idx, item in enumerate(content):
            item_type = item.get("type")
            item_role = item.get("role", "<no-role>")
            if item_type == "text":
                preview = (item.get("text") or "")[:30]
                logger.info("[VolcengineAdapter] content[%d] type=text role=%s preview=%r", idx, item_role, preview)
            elif item_type == "image_url":
                url = (item.get("image_url") or {}).get("url", "")
                kind = "data-url" if url.startswith("data:") else ("https" if url.startswith("https://") else ("http" if url.startswith("http://") else "other"))
                logger.info("[VolcengineAdapter] content[%d] type=image_url role=%s kind=%s len=%d", idx, item_role, kind, len(url))
            elif item_type == "video_url":
                url = (item.get("video_url") or {}).get("url", "")
                kind = "data-url" if url.startswith("data:") else ("https" if url.startswith("https://") else ("http" if url.startswith("http://") else "other"))
                logger.info("[VolcengineAdapter] content[%d] type=video_url role=%s kind=%s len=%d", idx, item_role, kind, len(url))
            elif item_type == "audio_url":
                url = (item.get("audio_url") or {}).get("url", "")
                kind = "data-url" if url.startswith("data:") else ("https" if url.startswith("https://") else ("http" if url.startswith("http://") else "other"))
                logger.info("[VolcengineAdapter] content[%d] type=audio_url role=%s kind=%s len=%d", idx, item_role, kind, len(url))
        return payload

    def _resolve_asset_input(self, asset_url: str) -> str:
        if not asset_url:
            raise ValueError("Asset URL is empty")

        if asset_url.startswith(("http://", "https://", "data:", "asset://")):
            return asset_url

        local_path = self._resolve_local_asset_path(asset_url)
        if not local_path or not local_path.exists():
            raise FileNotFoundError(f"Asset not found for Volcengine request: {asset_url}")

        if self._public_base_url and asset_url.startswith("/"):
            return urljoin(f"{self._public_base_url}/", asset_url.lstrip("/"))

        return self._encode_local_asset_as_data_url(local_path)

    async def _resolve_video_asset_input(self, asset_url: str) -> str:
        """解析视频资产为公网可访问 URL（火山 vedit/r2v 通道要求）。

        优先级：远程 URL → PUBLIC_BASE_URL 公网拼接 → OSS 临时上传。
        与 _resolve_asset_input 的差异：禁止降级到 data URL（火山不接受视频 data URL）。
        """
        if not asset_url:
            raise ValueError("Asset URL is empty")

        if asset_url.startswith(("http://", "https://", "asset://")):
            return asset_url

        local_path = self._resolve_local_asset_path(asset_url)
        if not local_path or not local_path.exists():
            raise FileNotFoundError(f"Asset not found for Volcengine request: {asset_url}")

        if self._public_base_url and asset_url.startswith("/"):
            return urljoin(f"{self._public_base_url}/", asset_url.lstrip("/"))

        if self._asset_hosting_service and self._asset_hosting_service.is_configured:
            return await self._asset_hosting_service.upload_local_file(
                local_path,
                purpose="volcengine-video-source",
            )

        raise RuntimeError(
            "Volcengine 视频编辑/参考视频通道需要公网可访问的 URL。"
            "请在 backend/.env 配置 PUBLIC_BASE_URL，或填写 ALIYUN_OSS_* 启用 OSS 临时上传。"
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
        return f"/outputs/{quote(file_name)}"

    def _extract_image_url(self, payload: dict[str, Any]) -> str:
        data = payload.get("data")
        if isinstance(data, list):
            for item in data:
                if isinstance(item, dict):
                    url = item.get("url") or item.get("image_url")
                    if isinstance(url, str) and url:
                        return url

        for key in ("url", "image_url"):
            value = payload.get(key)
            if isinstance(value, str) and value:
                return value

        raise RuntimeError(f"Volcengine image response does not contain a downloadable URL: {payload}")

    def _extract_task_id(self, payload: dict[str, Any]) -> str:
        for key in ("id", "task_id"):
            value = payload.get(key)
            if isinstance(value, str) and value:
                return value

        raise RuntimeError(f"Volcengine video task response does not contain a task id: {payload}")

    def _extract_remote_status(self, payload: dict[str, Any]) -> str:
        status = payload.get("status")
        if isinstance(status, str) and status:
            return status.lower()

        raise RuntimeError(f"Volcengine task response does not contain a status: {payload}")

    def _extract_task_error(self, payload: dict[str, Any], fallback_status: str) -> str:
        for key in ("error", "message", "detail"):
            value = payload.get(key)
            if isinstance(value, str) and value.strip():
                return value.strip()

        error_obj = payload.get("error")
        if isinstance(error_obj, dict):
            for key in ("message", "detail", "code"):
                value = error_obj.get(key)
                if isinstance(value, str) and value.strip():
                    return value.strip()

        return f"Volcengine video task ended with status: {fallback_status}"

    def _extract_video_url(self, payload: dict[str, Any]) -> str:
        preferred = self._find_preferred_url(payload, {"video_url", "download_url"})
        if preferred:
            return preferred

        generic = self._find_any_url(payload)
        if generic:
            return generic

        raise RuntimeError(f"Volcengine video task response does not contain a video URL: {payload}")

    def _extract_last_frame_url(self, payload: dict[str, Any]) -> str | None:
        """Locate the last_frame image URL in a Seedance 2.0 task response.

        优先匹配键名 last_frame_url / last_frame / image_url（位于响应根或 content 列表内），
        若未命中则回退到任何 image_url 字段。
        """
        preferred = self._find_preferred_url(
            payload,
            {"last_frame_url", "last_frame", "tail_frame_url", "tail_frame"},
        )
        if preferred:
            return preferred

        content = payload.get("content") if isinstance(payload, dict) else None
        if isinstance(content, list):
            for item in content:
                if not isinstance(item, dict):
                    continue
                item_type = item.get("type")
                role = item.get("role")
                if item_type == "image_url" or role in {"last_frame", "tail_frame"}:
                    url = self._value_to_url(item.get("image_url"))
                    if url:
                        return url

        return self._find_preferred_url(payload, {"image_url"})

    def _find_preferred_url(self, payload: Any, preferred_keys: set[str]) -> str | None:
        if isinstance(payload, dict):
            for key, value in payload.items():
                if key in preferred_keys:
                    url = self._value_to_url(value)
                    if url:
                        return url
            for value in payload.values():
                found = self._find_preferred_url(value, preferred_keys)
                if found:
                    return found

        if isinstance(payload, list):
            for item in payload:
                found = self._find_preferred_url(item, preferred_keys)
                if found:
                    return found

        return None

    def _find_any_url(self, payload: Any) -> str | None:
        if isinstance(payload, dict):
            for key, value in payload.items():
                if key.endswith("url"):
                    url = self._value_to_url(value)
                    if url:
                        return url
            for value in payload.values():
                found = self._find_any_url(value)
                if found:
                    return found

        if isinstance(payload, list):
            for item in payload:
                found = self._find_any_url(item)
                if found:
                    return found

        return None

    def _value_to_url(self, value: Any) -> str | None:
        if isinstance(value, str) and value:
            if value.startswith(("http://", "https://", "data:")):
                return value
        if isinstance(value, list):
            for item in value:
                url = self._value_to_url(item)
                if url:
                    return url
        if isinstance(value, dict):
            for nested_key in ("url", "video_url", "download_url"):
                nested = value.get(nested_key)
                url = self._value_to_url(nested)
                if url:
                    return url
        return None

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
            raise RuntimeError("Invalid data URL returned by Volcengine") from exc
