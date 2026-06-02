"""
Adapter base contracts.
"""
from abc import ABC, abstractmethod
from dataclasses import dataclass
from typing import AsyncIterator


@dataclass
class GenerateParams:
    """Common generation parameters shared by all adapters.

    task_type: "image" | "video" | "t2v" | "i2v" | "r2v" | "vedit"
    """

    task_type: str = "image"
    prompt: str = ""
    aspect_ratio: str = "1:1"
    resolution: str = "2K"
    reference_images: list[str] | None = None
    source_images: list[str] | None = None
    source_video: str | None = None
    identity_lock: bool = False
    identity_strength: float = 0.7
    duration_seconds: float = 4.0
    motion_strength: float = 0.6
    video_version: str = ""
    vedit_model: str = ""
    voice: str = ""
    source_audio: str = ""
    s2v_style: str = "speech"
    s2v_resolution: str = "480P"
    generate_audio: bool = True
    with_audio: bool = True
    happyhorse_mode: str = "pro"
    video_resolution: str = "720p"
    negative_prompt: str = ""
    seed: int = -1
    camera_fixed: bool = False
    video_model_tier: str = "standard"
    return_last_frame: bool = False
    reference_videos: list[str] | None = None
    reference_audios: list[str] | None = None
    multi_image_role: str = "transition"


@dataclass
class ProgressUpdate:
    """Streaming progress event emitted by an adapter."""

    progress: int
    status: str
    message: str = ""
    output_image: str | None = None
    output_image_original_url: str | None = None
    output_video: str | None = None
    output_last_frame: str | None = None


class BaseAdapter(ABC):
    """Abstract adapter interface for all generation backends."""

    @property
    @abstractmethod
    def name(self) -> str:
        ...

    @abstractmethod
    async def generate(self, params: GenerateParams) -> AsyncIterator[ProgressUpdate]:
        ...

    async def health_check(self) -> bool:
        return True
