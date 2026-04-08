"""
Offline mock adapter for local development.
"""
from __future__ import annotations

import asyncio
import hashlib
import logging
from pathlib import Path
from typing import AsyncIterator
from urllib.parse import quote, unquote
from uuid import uuid4

from PIL import Image, ImageDraw, ImageFont, ImageOps

from .base import BaseAdapter, GenerateParams, ProgressUpdate

logger = logging.getLogger(__name__)

IMAGE_DIMENSIONS: dict[str, dict[str, tuple[int, int]]] = {
    "1K": {
        "1:1": (768, 768),
        "16:9": (1024, 576),
        "9:16": (576, 1024),
        "4:3": (896, 672),
        "3:4": (672, 896),
    },
    "2K": {
        "1:1": (1024, 1024),
        "16:9": (1280, 720),
        "9:16": (720, 1280),
        "4:3": (1200, 900),
        "3:4": (900, 1200),
    },
    "4K": {
        "1:1": (1280, 1280),
        "16:9": (1536, 864),
        "9:16": (864, 1536),
        "4:3": (1440, 1080),
        "3:4": (1080, 1440),
    },
}

VIDEO_DIMENSIONS: dict[str, tuple[int, int]] = {
    "1:1": (720, 720),
    "16:9": (960, 540),
    "9:16": (540, 960),
    "4:3": (800, 600),
    "3:4": (600, 800),
}


class MockAdapter(BaseAdapter):
    """Create local mock images and animated GIF clips."""

    def __init__(self, delay: float = 3.0, upload_dir: str | Path = "", output_dir: str | Path = ""):
        self._delay = delay
        self._upload_dir = Path(upload_dir)
        self._output_dir = Path(output_dir)
        self._upload_dir.mkdir(parents=True, exist_ok=True)
        self._output_dir.mkdir(parents=True, exist_ok=True)
        self._font = ImageFont.load_default()

    @property
    def name(self) -> str:
        return "mock"

    async def generate(self, params: GenerateParams) -> AsyncIterator[ProgressUpdate]:
        logger.info(
            "[MockAdapter] start type=%s prompt=%r ratio=%s resolution=%s duration=%.2fs motion=%.2f",
            params.task_type,
            params.prompt,
            params.aspect_ratio,
            params.resolution,
            params.duration_seconds,
            params.motion_strength,
        )

        step_delay = max(self._delay / 5, 0.05)
        for progress in (0, 20, 40, 60, 80):
            yield ProgressUpdate(
                progress=progress,
                status="processing",
                message=f"Mock {params.task_type} generation in progress ({progress}%)",
            )
            await asyncio.sleep(step_delay)

        if params.task_type == "video":
            output_video = await asyncio.to_thread(self._generate_video_output, params)
            yield ProgressUpdate(
                progress=100,
                status="success",
                message="Mock video generation completed",
                output_video=output_video,
            )
            return

        if params.task_type != "image":
            raise ValueError(f"Unsupported mock task type: {params.task_type}")

        output_image = await asyncio.to_thread(self._generate_image_output, params)
        yield ProgressUpdate(
            progress=100,
            status="success",
            message="Mock image generation completed",
            output_image=output_image,
        )

    def _generate_image_output(self, params: GenerateParams) -> str:
        size = self._resolve_image_size(params.aspect_ratio, params.resolution)
        base = self._load_source_image((params.reference_images or [None])[0], size)
        if base is None:
            base = self._build_gradient_canvas(size, params.prompt or "mock-image")

        canvas = base.copy()
        self._draw_info_panel(
            canvas,
            title="Mock Image",
            subtitle=f"{params.aspect_ratio} | {params.resolution} | refs {len(params.reference_images or [])}",
        )

        file_name = f"mock-image-{uuid4().hex[:12]}.png"
        output_path = self._output_dir / file_name
        canvas.save(output_path, format="PNG")
        return f"/outputs/{quote(file_name)}"

    def _generate_video_output(self, params: GenerateParams) -> str:
        size = VIDEO_DIMENSIONS.get(params.aspect_ratio, VIDEO_DIMENSIONS["16:9"])
        source_url = (params.source_images or params.reference_images or [None])[0]
        base = self._load_source_image(source_url, size)
        if base is None:
            base = self._build_gradient_canvas(size, params.prompt or "mock-video")

        frame_count = max(10, min(24, int(round((params.duration_seconds or 4.0) * 4))))
        frame_duration_ms = max(80, int((params.duration_seconds or 4.0) * 1000 / frame_count))
        frames: list[Image.Image] = []

        for index in range(frame_count):
            progress = index / max(frame_count - 1, 1)
            zoom = 1 + max(0.0, min(1.0, params.motion_strength)) * 0.12 * progress
            shift_x = 0.5 * progress
            shift_y = 0.25 * (1 - progress)
            frame = self._render_motion_frame(base, size, zoom, shift_x, shift_y)
            self._draw_info_panel(
                frame,
                title="Mock Motion",
                subtitle=f"{params.aspect_ratio} | {params.duration_seconds:.1f}s | motion {params.motion_strength:.2f}",
            )
            frames.append(frame)

        file_name = f"mock-video-{uuid4().hex[:12]}.gif"
        output_path = self._output_dir / file_name
        frames[0].save(
            output_path,
            format="GIF",
            save_all=True,
            append_images=frames[1:],
            duration=frame_duration_ms,
            loop=0,
            disposal=2,
        )
        return f"/outputs/{quote(file_name)}"

    def _resolve_image_size(self, aspect_ratio: str, resolution: str) -> tuple[int, int]:
        resolution_map = IMAGE_DIMENSIONS.get(resolution, IMAGE_DIMENSIONS["2K"])
        return resolution_map.get(aspect_ratio, resolution_map["1:1"])

    def _load_source_image(self, asset_url: str | None, size: tuple[int, int]) -> Image.Image | None:
        asset_path = self._resolve_asset_path(asset_url)
        if not asset_path or not asset_path.exists():
            return None

        with Image.open(asset_path) as image:
            source = image.convert("RGB")
            return ImageOps.fit(source, size, method=Image.Resampling.LANCZOS)

    def _resolve_asset_path(self, asset_url: str | None) -> Path | None:
        if not asset_url:
            return None

        clean_url = asset_url.split("#", 1)[0]
        if clean_url.startswith("/uploads/"):
            return self._upload_dir / Path(unquote(clean_url.removeprefix("/uploads/"))).name

        if clean_url.startswith("/outputs/"):
            return self._output_dir / Path(unquote(clean_url.removeprefix("/outputs/"))).name

        return None

    def _build_gradient_canvas(self, size: tuple[int, int], seed: str) -> Image.Image:
        width, height = size
        digest = hashlib.sha256(seed.encode("utf-8", errors="ignore")).digest()
        start = self._color_from_digest(digest[0:3], offset=48)
        end = self._color_from_digest(digest[3:6], offset=24)
        accent = self._color_from_digest(digest[6:9], offset=72)

        image = Image.new("RGB", size)
        draw = ImageDraw.Draw(image)

        for y in range(height):
            ratio = y / max(height - 1, 1)
            color = tuple(int(start[idx] * (1 - ratio) + end[idx] * ratio) for idx in range(3))
            draw.line((0, y, width, y), fill=color)

        overlay = Image.new("RGBA", size, (0, 0, 0, 0))
        overlay_draw = ImageDraw.Draw(overlay)
        overlay_draw.ellipse(
            (width * 0.08, height * 0.12, width * 0.82, height * 0.92),
            fill=(*accent, 70),
        )
        overlay_draw.ellipse(
            (width * 0.38, height * 0.02, width * 0.98, height * 0.54),
            fill=(255, 255, 255, 36),
        )

        return Image.alpha_composite(image.convert("RGBA"), overlay).convert("RGB")

    def _render_motion_frame(
        self,
        base: Image.Image,
        size: tuple[int, int],
        zoom: float,
        shift_x: float,
        shift_y: float,
    ) -> Image.Image:
        width, height = size
        resized = base.resize(
            (max(width, int(width * zoom)), max(height, int(height * zoom))),
            Image.Resampling.LANCZOS,
        )

        max_left = max(0, resized.width - width)
        max_top = max(0, resized.height - height)
        left = min(max_left, max(0, int(max_left * shift_x)))
        top = min(max_top, max(0, int(max_top * shift_y)))
        return resized.crop((left, top, left + width, top + height))

    def _draw_info_panel(self, image: Image.Image, title: str, subtitle: str) -> None:
        width, height = image.size
        draw = ImageDraw.Draw(image)
        panel_height = 68
        left = 18
        right = width - 18
        bottom = height - 18
        top = bottom - panel_height

        draw.rounded_rectangle((left, top, right, bottom), radius=18, fill=(12, 18, 28))
        draw.text((left + 16, top + 14), title, fill=(255, 255, 255), font=self._font)
        draw.text((left + 16, top + 34), subtitle[:72], fill=(185, 198, 216), font=self._font)

    def _color_from_digest(self, data: bytes, offset: int = 0) -> tuple[int, int, int]:
        return tuple(min(255, offset + value) for value in data[:3])
