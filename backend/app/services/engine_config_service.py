"""
Engine configuration persistence and runtime adapter refresh helpers.
"""
from __future__ import annotations

import json
import logging
from dataclasses import asdict, dataclass
from pathlib import Path

from ..adapters import VolcengineAdapter, adapter_registry
from ..config import settings
from .volcengine_client import VolcengineClient

logger = logging.getLogger(__name__)


@dataclass(slots=True)
class VolcengineConfigSnapshot:
    ark_base_url: str
    ark_api_key: str
    prompt_model: str
    image_model: str
    image_edit_model: str
    video_model: str


@dataclass(slots=True)
class VolcengineRuntimeConfig(VolcengineConfigSnapshot):
    request_timeout: float
    video_timeout: float
    poll_interval: float
    output_format: str
    watermark: bool
    upload_dir: str
    output_dir: str
    public_base_url: str


class EngineConfigService:
    """Stores editable engine configuration in a local JSON file."""

    def __init__(self, storage_path: str | Path):
        self._storage_path = Path(storage_path)

    def get_volcengine_config(self) -> VolcengineConfigSnapshot:
        payload = asdict(self._default_volcengine_config())

        if self._storage_path.exists():
            try:
                raw = json.loads(self._storage_path.read_text(encoding="utf-8"))
            except (OSError, json.JSONDecodeError) as exc:
                logger.warning("[EngineConfig] failed to read %s: %s", self._storage_path, exc)
                raw = {}

            if isinstance(raw, dict):
                for key in payload:
                    value = raw.get(key)
                    if isinstance(value, str):
                        payload[key] = value.strip()

        return VolcengineConfigSnapshot(**payload)

    def get_runtime_volcengine_config(self) -> VolcengineRuntimeConfig:
        current = self.get_volcengine_config()
        return VolcengineRuntimeConfig(
            **asdict(current),
            request_timeout=settings.VOLCENGINE_REQUEST_TIMEOUT,
            video_timeout=settings.VOLCENGINE_VIDEO_TIMEOUT,
            poll_interval=settings.VOLCENGINE_POLL_INTERVAL,
            output_format=settings.VOLCENGINE_IMAGE_OUTPUT_FORMAT,
            watermark=settings.VOLCENGINE_WATERMARK,
            upload_dir=settings.UPLOAD_DIR,
            output_dir=settings.OUTPUT_DIR,
            public_base_url=settings.PUBLIC_BASE_URL,
        )

    def save_volcengine_config(self, snapshot: VolcengineConfigSnapshot) -> VolcengineConfigSnapshot:
        normalized = VolcengineConfigSnapshot(
            ark_base_url=snapshot.ark_base_url.strip().rstrip("/") or settings.ARK_BASE_URL.strip().rstrip("/"),
            ark_api_key=snapshot.ark_api_key.strip(),
            prompt_model=snapshot.prompt_model.strip() or settings.VOLCENGINE_PROMPT_MODEL.strip(),
            image_model=snapshot.image_model.strip() or settings.VOLCENGINE_IMAGE_MODEL.strip(),
            image_edit_model=snapshot.image_edit_model.strip() or settings.VOLCENGINE_IMAGE_EDIT_MODEL.strip(),
            video_model=snapshot.video_model.strip() or settings.VOLCENGINE_VIDEO_MODEL.strip(),
        )

        self._storage_path.parent.mkdir(parents=True, exist_ok=True)
        self._storage_path.write_text(
            json.dumps(asdict(normalized), ensure_ascii=False, indent=2),
            encoding="utf-8",
        )
        logger.info("[EngineConfig] saved Volcengine config to %s", self._storage_path)
        return normalized

    def is_volcengine_configured(self) -> bool:
        return bool(self.get_volcengine_config().ark_api_key.strip())

    def refresh_volcengine_adapter(self) -> bool:
        runtime = self.get_runtime_volcengine_config()
        adapter_registry.unregister("volcengine")

        if not runtime.ark_api_key.strip():
            logger.warning("[EngineConfig] Volcengine API key is empty; adapter not registered")
            return False

        adapter_registry.register(
            VolcengineAdapter(
                client=VolcengineClient(
                    base_url=runtime.ark_base_url,
                    api_key=runtime.ark_api_key,
                    timeout=runtime.request_timeout,
                ),
                upload_dir=runtime.upload_dir,
                output_dir=runtime.output_dir,
                image_model=runtime.image_model,
                image_edit_model=runtime.image_edit_model,
                video_model=runtime.video_model,
                poll_interval=runtime.poll_interval,
                video_timeout=runtime.video_timeout,
                public_base_url=runtime.public_base_url,
                output_format=runtime.output_format,
                watermark=runtime.watermark,
            )
        )
        logger.info("[EngineConfig] Volcengine adapter refreshed")
        return True

    def _default_volcengine_config(self) -> VolcengineConfigSnapshot:
        return VolcengineConfigSnapshot(
            ark_base_url=settings.ARK_BASE_URL.strip().rstrip("/"),
            ark_api_key=settings.ARK_API_KEY.strip(),
            prompt_model=settings.VOLCENGINE_PROMPT_MODEL.strip(),
            image_model=settings.VOLCENGINE_IMAGE_MODEL.strip(),
            image_edit_model=settings.VOLCENGINE_IMAGE_EDIT_MODEL.strip(),
            video_model=settings.VOLCENGINE_VIDEO_MODEL.strip(),
        )


engine_config_service = EngineConfigService(
    Path(settings.WORKFLOW_STORAGE_DIR).parent / "engine_config.json"
)
