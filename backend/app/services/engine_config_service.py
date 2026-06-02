"""
Engine configuration persistence and runtime adapter refresh helpers.
"""
from __future__ import annotations

import json
import logging
import re
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Any

from ..adapters import (
    HappyHorseAdapter,
    VolcengineAdapter,
    WanxAdapter,
    adapter_registry,
)
from ..config import settings
from .aliyun_oss_service import AliyunOssAssetHostingService
from .dashscope_client import DashScopeClient
from .volcengine_client import VolcengineClient

logger = logging.getLogger(__name__)

PROMPT_PROVIDERS = {"volcengine", "qwen"}
GENERATE_PROVIDERS = {"volcengine", "wanx", "happyhorse", "mock"}


@dataclass(slots=True)
class VolcengineConfigSnapshot:
    ark_base_url: str
    ark_api_key: str
    prompt_model: str
    image_model: str
    image_edit_model: str
    video_model: str
    video_v2_model: str
    video_version: str


@dataclass(slots=True)
class DashScopeConfigSnapshot:
    base_url: str
    api_key: str
    qwen_text_model: str
    qwen_multimodal_model: str
    wanx_image_model: str
    wanx_video_model: str
    wanx_video_resolution: str
    wanx_watermark: bool
    happyhorse_t2v_model: str
    happyhorse_i2v_model: str
    happyhorse_r2v_model: str
    happyhorse_vedit_model: str
    happyhorse_video_resolution: str
    animate_mix_model: str
    s2v_model: str
    voice_enrollment_model: str
    tts_vc_model: str
    oss_region: str
    oss_endpoint: str
    oss_access_key_id: str
    oss_access_key_secret: str
    oss_bucket: str
    oss_key_prefix: str


@dataclass(slots=True)
class EngineConfigSnapshot:
    prompt_provider: str
    generate_provider: str
    volcengine: VolcengineConfigSnapshot
    dashscope: DashScopeConfigSnapshot


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
    oss_endpoint: str
    oss_access_key_id: str
    oss_access_key_secret: str
    oss_bucket: str
    oss_key_prefix: str
    oss_signed_url_expire_seconds: int


@dataclass(slots=True)
class DashScopeRuntimeConfig(DashScopeConfigSnapshot):
    request_timeout: float
    video_timeout: float
    poll_interval: float
    upload_dir: str
    output_dir: str
    public_base_url: str
    oss_signed_url_expire_seconds: int


class EngineConfigService:
    """Stores editable engine configuration in a local JSON file."""

    def __init__(self, storage_path: str | Path):
        self._storage_path = Path(storage_path)

    @staticmethod
    def _normalize_secret_value(value: str) -> str:
        stripped = value.strip()
        if not stripped:
            return ""

        upper = stripped.upper()
        if upper.startswith("YOUR_") or upper.startswith("REPLACE_") or stripped.startswith("<"):
            return ""

        return stripped

    def get_engine_config(self) -> EngineConfigSnapshot:
        defaults = self._default_engine_config()
        payload = {
            "prompt_provider": defaults.prompt_provider,
            "generate_provider": defaults.generate_provider,
            "volcengine": asdict(defaults.volcengine),
            "dashscope": asdict(defaults.dashscope),
        }

        raw = self._read_storage_payload()
        if isinstance(raw, dict):
            payload["prompt_provider"] = self._normalize_prompt_provider(
                raw.get("prompt_provider"),
                payload["prompt_provider"],
            )
            payload["generate_provider"] = self._normalize_generate_provider(
                raw.get("generate_provider"),
                payload["generate_provider"],
            )

            self._merge_string_values(payload["volcengine"], raw.get("volcengine"))
            self._merge_string_values(payload["dashscope"], raw.get("dashscope"))
            self._merge_boolean_values(payload["dashscope"], raw.get("dashscope"), {"wanx_watermark"})

            # Backward compatibility for the old flat Volcengine-only config file.
            self._merge_string_values(payload["volcengine"], raw)

        return EngineConfigSnapshot(
            prompt_provider=payload["prompt_provider"],
            generate_provider=payload["generate_provider"],
            volcengine=self._normalize_volcengine_config(VolcengineConfigSnapshot(**payload["volcengine"])),
            dashscope=self._normalize_dashscope_config(DashScopeConfigSnapshot(**payload["dashscope"])),
        )

    def save_engine_config(self, snapshot: EngineConfigSnapshot) -> EngineConfigSnapshot:
        normalized = EngineConfigSnapshot(
            prompt_provider=self._normalize_prompt_provider(
                snapshot.prompt_provider,
                settings.ENGINE_PROMPT_PROVIDER,
            ),
            generate_provider=self._normalize_generate_provider(
                snapshot.generate_provider,
                settings.ENGINE_GENERATE_PROVIDER,
            ),
            volcengine=self._normalize_volcengine_config(snapshot.volcengine),
            dashscope=self._normalize_dashscope_config(snapshot.dashscope),
        )

        self._storage_path.parent.mkdir(parents=True, exist_ok=True)
        self._storage_path.write_text(
            json.dumps(
                {
                    "prompt_provider": normalized.prompt_provider,
                    "generate_provider": normalized.generate_provider,
                    "volcengine": asdict(normalized.volcengine),
                    "dashscope": asdict(normalized.dashscope),
                },
                ensure_ascii=False,
                indent=2,
            ),
            encoding="utf-8",
        )
        logger.info("[EngineConfig] saved engine config to %s", self._storage_path)
        return normalized

    def get_prompt_provider(self) -> str:
        return self.get_engine_config().prompt_provider

    def get_generate_provider(self) -> str:
        return self.get_engine_config().generate_provider

    def get_volcengine_config(self) -> VolcengineConfigSnapshot:
        return self.get_engine_config().volcengine

    def get_dashscope_config(self) -> DashScopeConfigSnapshot:
        return self.get_engine_config().dashscope

    def get_runtime_volcengine_config(self) -> VolcengineRuntimeConfig:
        current = self.get_volcengine_config()
        oss_region = self._resolve_oss_region(
            "", "", settings.ALIYUN_OSS_REGION, settings.ALIYUN_OSS_ENDPOINT
        )
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
            oss_endpoint=(
                self._resolve_oss_endpoint(
                    "", "", settings.ALIYUN_OSS_ENDPOINT, settings.ALIYUN_OSS_REGION
                )
                or self._build_oss_endpoint_from_region(oss_region)
            ),
            oss_access_key_id=self._normalize_secret_value(settings.ALIYUN_OSS_ACCESS_KEY_ID),
            oss_access_key_secret=self._normalize_secret_value(settings.ALIYUN_OSS_ACCESS_KEY_SECRET),
            oss_bucket=settings.ALIYUN_OSS_BUCKET.strip(),
            oss_key_prefix=settings.ALIYUN_OSS_KEY_PREFIX.strip(),
            oss_signed_url_expire_seconds=settings.ALIYUN_OSS_SIGNED_URL_EXPIRE_SECONDS,
        )

    def get_runtime_dashscope_config(self) -> DashScopeRuntimeConfig:
        current = self.get_dashscope_config()
        return DashScopeRuntimeConfig(
            **asdict(current),
            request_timeout=settings.DASHSCOPE_REQUEST_TIMEOUT,
            video_timeout=settings.DASHSCOPE_VIDEO_TIMEOUT,
            poll_interval=settings.DASHSCOPE_POLL_INTERVAL,
            upload_dir=settings.UPLOAD_DIR,
            output_dir=settings.OUTPUT_DIR,
            public_base_url=settings.PUBLIC_BASE_URL,
            oss_signed_url_expire_seconds=settings.ALIYUN_OSS_SIGNED_URL_EXPIRE_SECONDS,
        )

    def save_volcengine_config(self, snapshot: VolcengineConfigSnapshot) -> VolcengineConfigSnapshot:
        current = self.get_engine_config()
        saved = self.save_engine_config(
            EngineConfigSnapshot(
                prompt_provider=current.prompt_provider,
                generate_provider=current.generate_provider,
                volcengine=snapshot,
                dashscope=current.dashscope,
            )
        )
        return saved.volcengine

    def save_dashscope_config(self, snapshot: DashScopeConfigSnapshot) -> DashScopeConfigSnapshot:
        current = self.get_engine_config()
        saved = self.save_engine_config(
            EngineConfigSnapshot(
                prompt_provider=current.prompt_provider,
                generate_provider=current.generate_provider,
                volcengine=current.volcengine,
                dashscope=snapshot,
            )
        )
        return saved.dashscope

    def is_volcengine_configured(self) -> bool:
        return bool(self.get_volcengine_config().ark_api_key.strip())

    def is_dashscope_configured(self) -> bool:
        return bool(self.get_dashscope_config().api_key.strip())

    def is_aliyun_oss_configured(self) -> bool:
        current = self.get_dashscope_config()
        return bool(
            current.oss_endpoint.strip()
            and current.oss_access_key_id.strip()
            and current.oss_access_key_secret.strip()
            and current.oss_bucket.strip()
        )

    def is_prompt_provider_configured(self, provider: str | None = None) -> bool:
        resolved = self._normalize_prompt_provider(provider, self.get_prompt_provider())
        if resolved == "qwen":
            return self.is_dashscope_configured()
        return self.is_volcengine_configured()

    def is_generate_provider_configured(self, provider: str | None = None) -> bool:
        resolved = self._normalize_generate_provider(provider, self.get_generate_provider())
        if resolved == "wanx" or resolved == "happyhorse":
            return self.is_dashscope_configured()
        if resolved == "mock":
            return True
        return self.is_volcengine_configured()

    def refresh_runtime_adapters(self) -> dict[str, bool]:
        return {
            "volcengine": self.refresh_volcengine_adapter(),
            "wanx": self.refresh_wanx_adapter(),
            "happyhorse": self.refresh_happyhorse_adapter(),
        }

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
                video_v2_model=runtime.video_v2_model,
                video_v2_fast_model=settings.VOLCENGINE_VIDEO_V2_FAST_MODEL.strip(),
                video_version=runtime.video_version,
                poll_interval=runtime.poll_interval,
                video_timeout=runtime.video_timeout,
                public_base_url=runtime.public_base_url,
                output_format=runtime.output_format,
                watermark=runtime.watermark,
                asset_hosting_service=AliyunOssAssetHostingService(
                    endpoint=runtime.oss_endpoint,
                    access_key_id=runtime.oss_access_key_id,
                    access_key_secret=runtime.oss_access_key_secret,
                    bucket=runtime.oss_bucket,
                    key_prefix=runtime.oss_key_prefix,
                    signed_url_expire_seconds=runtime.oss_signed_url_expire_seconds,
                ),
            )
        )
        logger.info("[EngineConfig] Volcengine adapter refreshed")
        return True

    def refresh_wanx_adapter(self) -> bool:
        runtime = self.get_runtime_dashscope_config()
        adapter_registry.unregister("wanx")

        if not runtime.api_key.strip():
            logger.warning("[EngineConfig] DashScope API key is empty; Wanx adapter not registered")
            return False

        adapter_registry.register(
            WanxAdapter(
                client=DashScopeClient(
                    base_url=runtime.base_url,
                    api_key=runtime.api_key,
                    timeout=runtime.request_timeout,
                ),
                upload_dir=runtime.upload_dir,
                output_dir=runtime.output_dir,
                image_model=runtime.wanx_image_model,
                video_model=runtime.wanx_video_model,
                poll_interval=runtime.poll_interval,
                video_timeout=runtime.video_timeout,
                public_base_url=runtime.public_base_url,
                video_resolution=runtime.wanx_video_resolution,
                watermark=runtime.wanx_watermark,
                asset_hosting_service=AliyunOssAssetHostingService(
                    endpoint=runtime.oss_endpoint,
                    access_key_id=runtime.oss_access_key_id,
                    access_key_secret=runtime.oss_access_key_secret,
                    bucket=runtime.oss_bucket,
                    key_prefix=runtime.oss_key_prefix,
                    signed_url_expire_seconds=runtime.oss_signed_url_expire_seconds,
                ),
            )
        )
        logger.info("[EngineConfig] Wanx adapter refreshed")
        return True

    def refresh_happyhorse_adapter(self) -> bool:
        runtime = self.get_runtime_dashscope_config()
        adapter_registry.unregister("happyhorse")

        logger.info(
            "[EngineConfig] refresh_happyhorse_adapter: api_key=%s t2v=%s i2v=%s r2v=%s vedit=%s s2v=%s oss=%s",
            "***" if runtime.api_key.strip() else "(empty)",
            runtime.happyhorse_t2v_model,
            runtime.happyhorse_i2v_model,
            runtime.happyhorse_r2v_model,
            runtime.happyhorse_vedit_model,
            runtime.s2v_model,
            "yes" if (runtime.oss_endpoint.strip() and runtime.oss_access_key_id.strip()) else "no",
        )

        if not runtime.api_key.strip():
            logger.warning("[EngineConfig] DashScope API key is empty; HappyHorse adapter not registered")
            return False

        from ..services.tts_service import TtsService
        from ..services.dashscope_tts_service import DashScopeTtsService
        from ..services.voice_cloning_service import VoiceCloningService

        tts_service = None
        if settings.VOLCENGINE_TTS_ENABLED and settings.VOLCENGINE_TTS_APP_ID.strip():
            tts_service = TtsService(
                app_id=settings.VOLCENGINE_TTS_APP_ID,
                access_key=settings.VOLCENGINE_TTS_ACCESS_KEY,
                resource_id=settings.VOLCENGINE_TTS_RESOURCE_ID,
                base_url=settings.VOLCENGINE_TTS_BASE_URL,
                timeout=settings.VOLCENGINE_TTS_TIMEOUT,
                poll_interval=settings.VOLCENGINE_TTS_POLL_INTERVAL,
                default_speaker=settings.VOLCENGINE_TTS_DEFAULT_SPEAKER,
                default_format=settings.VOLCENGINE_TTS_DEFAULT_FORMAT,
                sample_rate=settings.VOLCENGINE_TTS_SAMPLE_RATE,
                speech_rate=settings.VOLCENGINE_TTS_SPEECH_RATE,
                output_dir=runtime.output_dir,
            )

        dashscope_client = DashScopeClient(
            base_url=runtime.base_url,
            api_key=runtime.api_key,
            timeout=runtime.request_timeout,
        )

        voice_cloning_service = VoiceCloningService(
            client=dashscope_client,
            data_dir=Path(settings.OUTPUT_DIR).parent / "data",
            enrollment_model=runtime.voice_enrollment_model
            or settings.DASHSCOPE_VOICE_ENROLLMENT_MODEL,
            tts_vc_model=runtime.tts_vc_model or settings.DASHSCOPE_TTS_VC_MODEL,
        )

        dashscope_tts_service = DashScopeTtsService(
            client=dashscope_client,
            output_dir=runtime.output_dir,
            tts_vc_model=runtime.tts_vc_model or settings.DASHSCOPE_TTS_VC_MODEL,
        )

        adapter_registry.register(
            HappyHorseAdapter(
                client=dashscope_client,
                upload_dir=runtime.upload_dir,
                output_dir=runtime.output_dir,
                t2v_model=runtime.happyhorse_t2v_model,
                i2v_model=runtime.happyhorse_i2v_model,
                r2v_model=runtime.happyhorse_r2v_model,
                vedit_model=runtime.happyhorse_vedit_model,
                s2v_model=runtime.s2v_model,
                poll_interval=runtime.poll_interval,
                video_timeout=runtime.video_timeout,
                public_base_url=runtime.public_base_url,
                video_resolution=runtime.happyhorse_video_resolution,
                asset_hosting_service=AliyunOssAssetHostingService(
                    endpoint=runtime.oss_endpoint,
                    access_key_id=runtime.oss_access_key_id,
                    access_key_secret=runtime.oss_access_key_secret,
                    bucket=runtime.oss_bucket,
                    key_prefix=runtime.oss_key_prefix,
                    signed_url_expire_seconds=runtime.oss_signed_url_expire_seconds,
                ),
                tts_service=tts_service,
                voice_cloning_service=voice_cloning_service,
                dashscope_tts_service=dashscope_tts_service,
            )
        )
        logger.info("[EngineConfig] HappyHorse adapter refreshed")
        return True

    def _read_storage_payload(self) -> dict[str, Any]:
        if not self._storage_path.exists():
            return {}

        try:
            raw = json.loads(self._storage_path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError) as exc:
            logger.warning("[EngineConfig] failed to read %s: %s", self._storage_path, exc)
            return {}

        return raw if isinstance(raw, dict) else {}

    def _merge_string_values(self, target: dict[str, Any], source: object) -> None:
        if not isinstance(source, dict):
            return

        for key, current_value in target.items():
            if isinstance(current_value, str):
                value = source.get(key)
                if isinstance(value, str):
                    target[key] = value.strip()

    def _merge_boolean_values(self, target: dict[str, Any], source: object, keys: set[str]) -> None:
        if not isinstance(source, dict):
            return

        for key in keys:
            value = source.get(key)
            if isinstance(value, bool):
                target[key] = value

    def _normalize_volcengine_config(self, snapshot: VolcengineConfigSnapshot) -> VolcengineConfigSnapshot:
        video_version = snapshot.video_version.strip()
        if video_version not in {"1.5", "2.0"}:
            video_version = settings.VOLCENGINE_VIDEO_VERSION.strip() or "1.5"

        return VolcengineConfigSnapshot(
            ark_base_url=snapshot.ark_base_url.strip().rstrip("/") or settings.ARK_BASE_URL.strip().rstrip("/"),
            ark_api_key=self._normalize_secret_value(snapshot.ark_api_key),
            prompt_model=snapshot.prompt_model.strip() or settings.VOLCENGINE_PROMPT_MODEL.strip(),
            image_model=snapshot.image_model.strip() or settings.VOLCENGINE_IMAGE_MODEL.strip(),
            image_edit_model=snapshot.image_edit_model.strip() or settings.VOLCENGINE_IMAGE_EDIT_MODEL.strip(),
            video_model=snapshot.video_model.strip() or settings.VOLCENGINE_VIDEO_MODEL.strip(),
            video_v2_model=snapshot.video_v2_model.strip(),
            video_version=video_version,
        )

    def _normalize_dashscope_config(self, snapshot: DashScopeConfigSnapshot) -> DashScopeConfigSnapshot:
        video_resolution = snapshot.wanx_video_resolution.strip().upper() or settings.WANX_VIDEO_RESOLUTION.strip()
        if video_resolution not in {"720P", "1080P"}:
            video_resolution = settings.WANX_VIDEO_RESOLUTION.strip()

        return DashScopeConfigSnapshot(
            base_url=snapshot.base_url.strip().rstrip("/") or settings.DASHSCOPE_BASE_URL.strip().rstrip("/"),
            api_key=self._normalize_secret_value(snapshot.api_key),
            qwen_text_model=snapshot.qwen_text_model.strip() or settings.QWEN_TEXT_MODEL.strip(),
            qwen_multimodal_model=snapshot.qwen_multimodal_model.strip()
            or settings.QWEN_MULTIMODAL_MODEL.strip(),
            wanx_image_model=snapshot.wanx_image_model.strip() or settings.WANX_IMAGE_MODEL.strip(),
            wanx_video_model=snapshot.wanx_video_model.strip() or settings.WANX_VIDEO_MODEL.strip(),
            wanx_video_resolution=video_resolution,
            wanx_watermark=bool(snapshot.wanx_watermark),
            happyhorse_t2v_model=snapshot.happyhorse_t2v_model.strip()
            or settings.HAPPYHORSE_T2V_MODEL.strip(),
            happyhorse_i2v_model=snapshot.happyhorse_i2v_model.strip()
            or settings.HAPPYHORSE_I2V_MODEL.strip(),
            happyhorse_r2v_model=snapshot.happyhorse_r2v_model.strip()
            or settings.HAPPYHORSE_R2V_MODEL.strip(),
            happyhorse_vedit_model=snapshot.happyhorse_vedit_model.strip()
            or settings.HAPPYHORSE_VIDEO_EDIT_MODEL.strip(),
            happyhorse_video_resolution=(
                snapshot.happyhorse_video_resolution.strip().upper()
                or settings.HAPPYHORSE_VIDEO_RESOLUTION.strip()
            ),
            animate_mix_model=snapshot.animate_mix_model.strip()
            or settings.ANIMATE_MIX_MODEL.strip(),
            s2v_model=snapshot.s2v_model.strip()
            or settings.S2V_MODEL.strip(),
            voice_enrollment_model=snapshot.voice_enrollment_model.strip()
            or settings.DASHSCOPE_VOICE_ENROLLMENT_MODEL.strip(),
            tts_vc_model=snapshot.tts_vc_model.strip()
            or settings.DASHSCOPE_TTS_VC_MODEL.strip(),
            oss_region=self._resolve_oss_region(
                snapshot.oss_region,
                snapshot.oss_endpoint,
                settings.ALIYUN_OSS_REGION,
                settings.ALIYUN_OSS_ENDPOINT,
            ),
            oss_endpoint=self._resolve_oss_endpoint(
                snapshot.oss_endpoint,
                snapshot.oss_region,
                settings.ALIYUN_OSS_ENDPOINT,
                settings.ALIYUN_OSS_REGION,
            ),
            oss_access_key_id=self._normalize_secret_value(snapshot.oss_access_key_id)
            or self._normalize_secret_value(settings.ALIYUN_OSS_ACCESS_KEY_ID),
            oss_access_key_secret=self._normalize_secret_value(snapshot.oss_access_key_secret)
            or self._normalize_secret_value(settings.ALIYUN_OSS_ACCESS_KEY_SECRET),
            oss_bucket=snapshot.oss_bucket.strip() or settings.ALIYUN_OSS_BUCKET.strip(),
            oss_key_prefix=snapshot.oss_key_prefix.strip() or settings.ALIYUN_OSS_KEY_PREFIX.strip(),
        )

    def _default_volcengine_config(self) -> VolcengineConfigSnapshot:
        return VolcengineConfigSnapshot(
            ark_base_url=settings.ARK_BASE_URL.strip().rstrip("/"),
            ark_api_key=self._normalize_secret_value(settings.ARK_API_KEY),
            prompt_model=settings.VOLCENGINE_PROMPT_MODEL.strip(),
            image_model=settings.VOLCENGINE_IMAGE_MODEL.strip(),
            image_edit_model=settings.VOLCENGINE_IMAGE_EDIT_MODEL.strip(),
            video_model=settings.VOLCENGINE_VIDEO_MODEL.strip(),
            video_v2_model=settings.VOLCENGINE_VIDEO_V2_MODEL.strip(),
            video_version=settings.VOLCENGINE_VIDEO_VERSION.strip() or "1.5",
        )

    def _default_dashscope_config(self) -> DashScopeConfigSnapshot:
        return DashScopeConfigSnapshot(
            base_url=settings.DASHSCOPE_BASE_URL.strip().rstrip("/"),
            api_key=self._normalize_secret_value(settings.DASHSCOPE_API_KEY),
            qwen_text_model=settings.QWEN_TEXT_MODEL.strip(),
            qwen_multimodal_model=settings.QWEN_MULTIMODAL_MODEL.strip(),
            wanx_image_model=settings.WANX_IMAGE_MODEL.strip(),
            wanx_video_model=settings.WANX_VIDEO_MODEL.strip(),
            wanx_video_resolution=settings.WANX_VIDEO_RESOLUTION.strip(),
            wanx_watermark=settings.WANX_WATERMARK,
            happyhorse_t2v_model=settings.HAPPYHORSE_T2V_MODEL.strip(),
            happyhorse_i2v_model=settings.HAPPYHORSE_I2V_MODEL.strip(),
            happyhorse_r2v_model=settings.HAPPYHORSE_R2V_MODEL.strip(),
            happyhorse_vedit_model=settings.HAPPYHORSE_VIDEO_EDIT_MODEL.strip(),
            happyhorse_video_resolution=settings.HAPPYHORSE_VIDEO_RESOLUTION.strip(),
            animate_mix_model=settings.ANIMATE_MIX_MODEL.strip(),
            s2v_model=settings.S2V_MODEL.strip(),
            voice_enrollment_model=settings.DASHSCOPE_VOICE_ENROLLMENT_MODEL.strip(),
            tts_vc_model=settings.DASHSCOPE_TTS_VC_MODEL.strip(),
            oss_region=self._resolve_oss_region(
                settings.ALIYUN_OSS_REGION,
                settings.ALIYUN_OSS_ENDPOINT,
            ),
            oss_endpoint=self._resolve_oss_endpoint(
                settings.ALIYUN_OSS_ENDPOINT,
                settings.ALIYUN_OSS_REGION,
            ),
            oss_access_key_id=self._normalize_secret_value(settings.ALIYUN_OSS_ACCESS_KEY_ID),
            oss_access_key_secret=self._normalize_secret_value(settings.ALIYUN_OSS_ACCESS_KEY_SECRET),
            oss_bucket=settings.ALIYUN_OSS_BUCKET.strip(),
            oss_key_prefix=settings.ALIYUN_OSS_KEY_PREFIX.strip(),
        )

    def _default_engine_config(self) -> EngineConfigSnapshot:
        return EngineConfigSnapshot(
            prompt_provider=self._normalize_prompt_provider(
                settings.ENGINE_PROMPT_PROVIDER,
                "volcengine",
            ),
            generate_provider=self._normalize_generate_provider(
                settings.ENGINE_GENERATE_PROVIDER,
                "volcengine",
            ),
            volcengine=self._default_volcengine_config(),
            dashscope=self._default_dashscope_config(),
        )

    def _normalize_prompt_provider(self, value: object, fallback: str) -> str:
        normalized = str(value or fallback).strip().lower()
        return normalized if normalized in PROMPT_PROVIDERS else fallback

    def _normalize_generate_provider(self, value: object, fallback: str) -> str:
        normalized = str(value or fallback).strip().lower()
        return normalized if normalized in GENERATE_PROVIDERS else fallback

    def _resolve_oss_region(
        self,
        preferred_region: str | None,
        preferred_endpoint: str | None,
        fallback_region: str | None = "",
        fallback_endpoint: str | None = "",
    ) -> str:
        region = str(preferred_region or "").strip()
        if region:
            return region

        region = self._infer_oss_region_from_endpoint(preferred_endpoint)
        if region:
            return region

        region = str(fallback_region or "").strip()
        if region:
            return region

        return self._infer_oss_region_from_endpoint(fallback_endpoint)

    def _resolve_oss_endpoint(
        self,
        preferred_endpoint: str | None,
        preferred_region: str | None,
        fallback_endpoint: str | None = "",
        fallback_region: str | None = "",
    ) -> str:
        endpoint = str(preferred_endpoint or "").strip().rstrip("/")
        if endpoint:
            return endpoint

        region = self._resolve_oss_region(preferred_region, preferred_endpoint, fallback_region, fallback_endpoint)
        if region:
            return self._build_oss_endpoint_from_region(region)

        return str(fallback_endpoint or "").strip().rstrip("/")

    def _build_oss_endpoint_from_region(self, region: str) -> str:
        return f"https://oss-{region.strip()}.aliyuncs.com"

    def _infer_oss_region_from_endpoint(self, endpoint: str | None) -> str:
        value = str(endpoint or "").strip().rstrip("/")
        if not value:
            return ""

        match = re.search(r"oss-([A-Za-z0-9-]+)\.aliyuncs\.com$", value)
        if match:
            return match.group(1)

        match = re.search(r"oss-([A-Za-z0-9-]+)\.aliyuncs\.com/", value)
        if match:
            return match.group(1)

        return ""


engine_config_service = EngineConfigService(
    Path(settings.WORKFLOW_STORAGE_DIR).parent / "engine_config.json"
)
