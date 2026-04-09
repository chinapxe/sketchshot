"""
Pydantic schemas for API requests and responses.
"""
from enum import Enum
from typing import Literal, Optional

from pydantic import BaseModel, Field


class TaskStatus(str, Enum):
    """Generation task status."""

    PENDING = "pending"
    PROCESSING = "processing"
    SUCCESS = "success"
    ERROR = "error"


class PromptProvider(str, Enum):
    """Prompt provider selection."""

    VOLCENGINE = "volcengine"
    QWEN = "qwen"


class GenerateProvider(str, Enum):
    """Generation provider selection."""

    VOLCENGINE = "volcengine"
    WANX = "wanx"
    MOCK = "mock"


class WorkflowNode(BaseModel):
    """Workflow node on the canvas."""

    id: str
    type: str
    position: dict = Field(default_factory=dict)
    data: dict = Field(default_factory=dict)


class WorkflowEdge(BaseModel):
    """Workflow edge on the canvas."""

    id: str
    source: str
    target: str
    sourceHandle: Optional[str] = None
    targetHandle: Optional[str] = None


class WorkflowSaveRequest(BaseModel):
    """Save workflow request payload."""

    name: str = Field(default="Untitled Workflow", max_length=100)
    nodes: list[WorkflowNode] = Field(default_factory=list)
    edges: list[WorkflowEdge] = Field(default_factory=list)


class WorkflowResponse(BaseModel):
    """Workflow response payload."""

    id: str
    name: str
    nodes: list[WorkflowNode]
    edges: list[WorkflowEdge]
    created_at: str
    updated_at: str


class WorkflowListItem(BaseModel):
    """Workflow list item."""

    id: str
    name: str
    node_count: int
    created_at: str
    updated_at: str


class UserTemplateSaveRequest(BaseModel):
    """Save user template request payload."""

    name: str = Field(default="Untitled Template", max_length=100)
    nodes: list[WorkflowNode] = Field(default_factory=list)
    edges: list[WorkflowEdge] = Field(default_factory=list)


class UserTemplateResponse(BaseModel):
    """User template response payload."""

    id: str
    name: str
    nodes: list[WorkflowNode]
    edges: list[WorkflowEdge]
    created_at: str
    updated_at: str


class UserTemplateListItem(BaseModel):
    """User template list item."""

    id: str
    name: str
    node_count: int
    created_at: str
    updated_at: str


class GenerateRequest(BaseModel):
    """Image generation request payload."""

    node_id: str = Field(..., description="Node ID that triggered the request")
    prompt: str = Field(default="", description="Prompt text")
    aspect_ratio: str = Field(default="1:1", description="Image aspect ratio")
    resolution: str = Field(default="2K", description="Target resolution")
    reference_images: list[str] = Field(default_factory=list, description="Reference image URLs")
    adapter: str = Field(default="auto", description="Adapter name")
    identity_lock: bool = Field(default=False, description="Enable character consistency lock")
    identity_strength: float = Field(default=0.7, ge=0.0, le=1.0, description="Identity lock strength")


class VideoGenerateRequest(BaseModel):
    """Video generation request payload."""

    node_id: str = Field(..., description="Node ID that triggered the request")
    prompt: str = Field(default="", description="Motion prompt")
    aspect_ratio: str = Field(default="16:9", description="Video aspect ratio")
    duration_seconds: float = Field(default=4.0, gt=0.0, le=12.0, description="Output duration in seconds")
    motion_strength: float = Field(default=0.6, ge=0.0, le=1.0, description="Motion intensity")
    source_images: list[str] = Field(default_factory=list, description="Source image URLs")
    adapter: str = Field(default="auto", description="Adapter name")


class PromptGenerateRequest(BaseModel):
    """Prompt generation request payload."""

    task_type: Literal["image", "video", "general"] = Field(default="image", description="Prompt target type")
    user_input: str = Field(..., min_length=1, description="Raw user idea or notes")
    style: str = Field(default="", description="Desired style or tone")
    aspect_ratio: str = Field(default="", description="Optional aspect ratio hint")
    extra_requirements: list[str] = Field(default_factory=list, description="Additional constraints")
    reference_images: list[str] = Field(default_factory=list, description="Optional reference image URLs")
    language: Literal["zh", "en"] = Field(default="zh", description="Output language")


class PromptGenerateResponse(BaseModel):
    """Prompt generation response payload."""

    prompt: str
    task_type: Literal["image", "video", "general"]
    model: str


class ContinuityFramesGenerateRequest(BaseModel):
    """Nine-grid continuity frame generation request payload."""

    user_input: str = Field(..., min_length=1, description="Combined continuity brief and upstream context")
    reference_images: list[str] = Field(default_factory=list, description="Optional reference image URLs")
    language: Literal["zh", "en"] = Field(default="zh", description="Desired response language")


class ContinuityFramesGenerateResponse(BaseModel):
    """Nine-grid continuity frame generation response payload."""

    frames: list[str] = Field(default_factory=list, min_length=9, max_length=9)
    model: str


class VolcengineConfigResponse(BaseModel):
    """Editable Volcengine configuration returned to the frontend."""

    ark_base_url: str
    ark_api_key: str
    prompt_model: str
    image_model: str
    image_edit_model: str
    video_model: str
    configured: bool


class VolcengineConfigUpdateRequest(BaseModel):
    """Volcengine configuration submitted from the frontend."""

    ark_base_url: str = Field(..., min_length=1)
    ark_api_key: str = Field(default="")
    prompt_model: str = Field(..., min_length=1)
    image_model: str = Field(..., min_length=1)
    image_edit_model: str = Field(..., min_length=1)
    video_model: str = Field(..., min_length=1)


class DashScopeConfigResponse(BaseModel):
    """Editable DashScope configuration returned to the frontend."""

    base_url: str
    api_key: str
    qwen_text_model: str
    qwen_multimodal_model: str
    wanx_image_model: str
    wanx_video_model: str
    wanx_video_resolution: str
    wanx_watermark: bool
    configured: bool
    oss_region: str
    oss_endpoint: str
    oss_access_key_id: str
    oss_access_key_secret: str
    oss_bucket: str
    oss_key_prefix: str
    oss_configured: bool


class DashScopeConfigUpdateRequest(BaseModel):
    """DashScope configuration submitted from the frontend."""

    base_url: str = Field(..., min_length=1)
    api_key: str = Field(default="")
    qwen_text_model: str = Field(..., min_length=1)
    qwen_multimodal_model: str = Field(..., min_length=1)
    wanx_image_model: str = Field(..., min_length=1)
    wanx_video_model: str = Field(..., min_length=1)
    wanx_video_resolution: Literal["720P", "1080P"] = Field(default="720P")
    wanx_watermark: bool = Field(default=False)
    oss_region: str = Field(default="")
    oss_endpoint: str = Field(default="")
    oss_access_key_id: str = Field(default="")
    oss_access_key_secret: str = Field(default="")
    oss_bucket: str = Field(default="")
    oss_key_prefix: str = Field(default="sketchshot-temp")


class EngineSettingsResponse(BaseModel):
    """Editable engine settings returned to the frontend."""

    prompt_provider: PromptProvider
    generate_provider: GenerateProvider
    volcengine: VolcengineConfigResponse
    dashscope: DashScopeConfigResponse


class EngineSettingsUpdateRequest(BaseModel):
    """Engine settings submitted from the frontend."""

    prompt_provider: PromptProvider
    generate_provider: GenerateProvider
    volcengine: VolcengineConfigUpdateRequest
    dashscope: DashScopeConfigUpdateRequest


class GenerateResponse(BaseModel):
    """Generic task creation response."""

    task_id: str
    node_id: str
    status: TaskStatus = TaskStatus.PENDING
    message: str = "Task accepted"


class TaskStatusResponse(BaseModel):
    """Task status response payload."""

    task_id: str
    node_id: str
    status: TaskStatus
    progress: int = Field(default=0, ge=0, le=100)
    output_image: Optional[str] = None
    output_video: Optional[str] = None
    error_message: Optional[str] = None


class ApiResponse(BaseModel):
    """Generic API response payload."""

    code: int = 0
    message: str = "success"
    data: Optional[dict] = None


class UploadedAssetResponse(BaseModel):
    """Uploaded asset response payload."""

    file_name: str
    content_type: str
    size: int
    url: str


class SplitThreeViewSheetRequest(BaseModel):
    """Split a three-view sheet into front / side / back outputs."""

    asset_url: str = Field(..., min_length=1)


class SplitThreeViewSheetResponse(BaseModel):
    """Split three-view sheet response payload."""

    front: str
    side: str
    back: str
