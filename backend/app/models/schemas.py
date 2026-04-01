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


class GenerateRequest(BaseModel):
    """Image generation request payload."""

    node_id: str = Field(..., description="Node ID that triggered the request")
    prompt: str = Field(default="", description="Prompt text")
    aspect_ratio: str = Field(default="1:1", description="Image aspect ratio")
    resolution: str = Field(default="2K", description="Target resolution")
    reference_images: list[str] = Field(default_factory=list, description="Reference image URLs")
    adapter: str = Field(default="volcengine", description="Adapter name")
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
    adapter: str = Field(default="volcengine", description="Adapter name")


class PromptGenerateRequest(BaseModel):
    """Prompt generation request payload."""

    task_type: Literal["image", "video", "general"] = Field(default="image", description="Prompt target type")
    user_input: str = Field(..., min_length=1, description="Raw user idea or notes")
    style: str = Field(default="", description="Desired style or tone")
    aspect_ratio: str = Field(default="", description="Optional aspect ratio hint")
    extra_requirements: list[str] = Field(default_factory=list, description="Additional constraints")
    language: Literal["zh", "en"] = Field(default="zh", description="Output language")


class PromptGenerateResponse(BaseModel):
    """Prompt generation response payload."""

    prompt: str
    task_type: Literal["image", "video", "general"]
    model: str


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
