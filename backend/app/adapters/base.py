"""
Adapter base contracts.
"""
from abc import ABC, abstractmethod
from dataclasses import dataclass
from typing import AsyncIterator


@dataclass
class GenerateParams:
    """Common generation parameters shared by all adapters."""

    task_type: str = "image"
    prompt: str = ""
    aspect_ratio: str = "1:1"
    resolution: str = "2K"
    reference_images: list[str] | None = None
    source_images: list[str] | None = None
    identity_lock: bool = False
    identity_strength: float = 0.7
    duration_seconds: float = 4.0
    motion_strength: float = 0.6


@dataclass
class ProgressUpdate:
    """Streaming progress event emitted by an adapter."""

    progress: int
    status: str
    message: str = ""
    output_image: str | None = None
    output_video: str | None = None


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
