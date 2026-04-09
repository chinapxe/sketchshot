"""
Application settings loaded from environment variables or backend/.env.
"""
from pathlib import Path

from pydantic import AliasChoices, Field, field_validator, model_validator
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    """Global application settings."""

    APP_NAME: str = "SketchShot - AI Storyboard Canvas"
    DEBUG: bool = True
    PORT: int = 8000
    CORS_ORIGINS: list[str] = [
        "http://localhost:3000",
        "http://localhost:3001",
        "http://localhost:3002",
    ]

    WORKFLOW_STORAGE_DIR: str = str(Path(__file__).parent.parent / "data" / "workflows")
    TEMPLATE_STORAGE_DIR: str = str(Path(__file__).parent.parent / "data" / "templates")
    UPLOAD_DIR: str = str(Path(__file__).parent.parent / "data" / "uploads")
    OUTPUT_DIR: str = str(Path(__file__).parent.parent / "data" / "outputs")

    MOCK_DELAY: float = 3.0
    DEFAULT_ADAPTER: str = "auto"
    PUBLIC_BASE_URL: str = ""

    COMFYUI_ENABLED: bool = False
    COMFYUI_BASE_URL: str = "http://127.0.0.1:8188"
    COMFYUI_POLL_INTERVAL: float = 1.0
    COMFYUI_TIMEOUT: float = 180.0
    COMFYUI_NEGATIVE_PROMPT: str = "low quality, blurry, distorted"
    COMFYUI_WORKFLOW_TEMPLATE: str = str(
        Path(__file__).parent / "adapters" / "templates" / "comfyui_text_to_image.json"
    )
    COMFYUI_REFERENCE_WORKFLOW_TEMPLATE: str = str(
        Path(__file__).parent / "adapters" / "templates" / "comfyui_reference_image.json"
    )

    VOLCENGINE_ENABLED: bool = False
    ARK_BASE_URL: str = "https://ark.cn-beijing.volces.com/api/v3"
    ARK_API_KEY: str = ""
    VOLCENGINE_TIMEOUT: float = 180.0
    VOLCENGINE_REQUEST_TIMEOUT: float = 180.0
    VOLCENGINE_VIDEO_TIMEOUT: float = 900.0
    VOLCENGINE_POLL_INTERVAL: float = 3.0
    VOLCENGINE_PROMPT_MODEL: str = "doubao-seed-1-6-251015"
    VOLCENGINE_IMAGE_MODEL: str = "doubao-seedream-5-0-260128"
    VOLCENGINE_IMAGE_EDIT_MODEL: str = "doubao-seedream-5-0-260128"
    VOLCENGINE_VIDEO_MODEL: str = "doubao-seedance-1-5-pro-251215"
    VOLCENGINE_IMAGE_OUTPUT_FORMAT: str = "png"
    VOLCENGINE_WATERMARK: bool = False

    DASHSCOPE_BASE_URL: str = "https://dashscope.aliyuncs.com"
    DASHSCOPE_API_KEY: str = ""
    DASHSCOPE_REQUEST_TIMEOUT: float = 180.0
    DASHSCOPE_VIDEO_TIMEOUT: float = 900.0
    DASHSCOPE_POLL_INTERVAL: float = 3.0
    ENGINE_PROMPT_PROVIDER: str = "volcengine"
    ENGINE_GENERATE_PROVIDER: str = "volcengine"
    QWEN_TEXT_MODEL: str = "qwen-plus"
    QWEN_MULTIMODAL_MODEL: str = "qwen-vl-plus"
    WANX_IMAGE_MODEL: str = "wan2.7-image-pro"
    WANX_VIDEO_MODEL: str = "wan2.7-i2v"
    WANX_VIDEO_RESOLUTION: str = "720P"
    WANX_WATERMARK: bool = False
    ALIYUN_OSS_ENDPOINT: str = ""
    ALIYUN_OSS_REGION: str = ""
    ALIYUN_OSS_ACCESS_KEY_ID: str = Field(
        default="",
        validation_alias=AliasChoices("ALIYUN_OSS_ACCESS_KEY_ID", "ALIYUN_ACCESS_KEY_ID"),
    )
    ALIYUN_OSS_ACCESS_KEY_SECRET: str = Field(
        default="",
        validation_alias=AliasChoices("ALIYUN_OSS_ACCESS_KEY_SECRET", "ALIYUN_ACCESS_KEY_SECRET"),
    )
    ALIYUN_OSS_BUCKET: str = ""
    ALIYUN_OSS_KEY_PREFIX: str = "sketchshot-temp"
    ALIYUN_OSS_SIGNED_URL_EXPIRE_SECONDS: int = 7200

    model_config = {
        "env_file": str(Path(__file__).parent.parent / ".env"),
        "case_sensitive": True,
    }

    @field_validator(
        "DEBUG",
        "COMFYUI_ENABLED",
        "VOLCENGINE_ENABLED",
        "VOLCENGINE_WATERMARK",
        "WANX_WATERMARK",
        mode="before",
    )
    @classmethod
    def parse_bool_like_values(cls, value: object) -> object:
        if isinstance(value, bool):
            return value

        if isinstance(value, str):
            normalized = value.strip().lower()
            if normalized in {"1", "true", "yes", "on", "debug"}:
                return True
            if normalized in {"0", "false", "no", "off", "release", "prod", "production"}:
                return False

        return value

    @model_validator(mode="after")
    def normalize_aliyun_oss_settings(self) -> "Settings":
        self.ALIYUN_OSS_REGION = self.ALIYUN_OSS_REGION.strip()
        self.ALIYUN_OSS_ENDPOINT = self.ALIYUN_OSS_ENDPOINT.strip().rstrip("/")

        if not self.ALIYUN_OSS_ENDPOINT and self.ALIYUN_OSS_REGION:
            self.ALIYUN_OSS_ENDPOINT = f"https://oss-{self.ALIYUN_OSS_REGION}.aliyuncs.com"

        return self


settings = Settings()
