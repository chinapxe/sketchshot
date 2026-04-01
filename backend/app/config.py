"""
Application settings loaded from environment variables or backend/.env.
"""
from pathlib import Path

from pydantic import field_validator
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    """Global application settings."""

    APP_NAME: str = "WXHB-AI-Workflow"
    DEBUG: bool = True
    PORT: int = 8000
    CORS_ORIGINS: list[str] = [
        "http://localhost:3000",
        "http://localhost:3001",
        "http://localhost:3002",
    ]

    WORKFLOW_STORAGE_DIR: str = str(Path(__file__).parent.parent / "data" / "workflows")
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

    model_config = {
        "env_file": str(Path(__file__).parent.parent / ".env"),
        "case_sensitive": True,
    }

    @field_validator("DEBUG", "COMFYUI_ENABLED", "VOLCENGINE_ENABLED", "VOLCENGINE_WATERMARK", mode="before")
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


settings = Settings()
