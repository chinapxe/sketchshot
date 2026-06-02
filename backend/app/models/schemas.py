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
    HAPPYHORSE = "happyhorse"
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
    negative_prompt: str = Field(default="", description="Negative prompt for quality control")


class VideoGenerateRequest(BaseModel):
    """Video generation request payload."""

    node_id: str = Field(..., description="Node ID that triggered the request")
    prompt: str = Field(default="", description="Motion prompt")
    aspect_ratio: str = Field(default="16:9", description="Video aspect ratio")
    duration_seconds: float = Field(default=4.0, gt=0.0, le=15.0, description="Output duration in seconds (Seedance 2.0 supports up to 15s)")
    motion_strength: float = Field(default=0.6, ge=0.0, le=1.0, description="Motion intensity")
    source_images: list[str] = Field(default_factory=list, description="Source image URLs")
    reference_images: list[str] = Field(default_factory=list, description="Reference image URLs (for HappyHorse r2v)")
    adapter: str = Field(default="auto", description="Adapter name")
    task_type: str = Field(default="video", description="Task type: video|t2v|i2v|r2v")
    seedance_version: str = Field(default="", description="Per-node Seedance version override (\"1.5\" / \"2.0\")")
    generate_audio: bool = Field(default=True, description="Seedance 2.0: generate synchronized audio")
    with_audio: bool = Field(default=True, description="HappyHorse: native audio-video joint generation (auto lip-sync)")
    happyhorse_mode: str = Field(default="pro", description="HappyHorse: quality mode 'pro' / 'std'")
    video_resolution: str = Field(default="720p", description="Seedance 2.0: 480p|720p|1080p")
    negative_prompt: str = Field(default="", description="Seedance 2.0: negative prompt")
    seed: int = Field(default=-1, description="Seedance 2.0: random seed (-1 = random)")
    camera_fixed: bool = Field(default=False, description="Seedance 2.0: lock camera (no auto camera moves)")
    video_model_tier: str = Field(default="standard", description="Seedance 2.0: standard|fast")
    return_last_frame: bool = Field(default=False, description="Seedance 2.0: also return last frame image for chaining")
    reference_videos: list[str] = Field(default_factory=list, description="Seedance 2.0: reference video URLs (r2v)")
    reference_audios: list[str] = Field(default_factory=list, description="Seedance 2.0: reference audio URLs (r2v)")
    multi_image_role: str = Field(default="transition", description="Seedance 2.0: 'transition' = first/last frame; 'reference' = all as reference_image")


class VideoEditGenerateRequest(BaseModel):
    """Video edit generation request payload."""

    node_id: str = Field(..., description="Node ID that triggered the request")
    prompt: str = Field(default="", description="Edit instruction prompt")
    source_video: str = Field(default="", description="Source video URL")
    reference_images: list[str] = Field(default_factory=list, description="Reference image URLs")
    adapter: str = Field(default="auto", description="Adapter name")
    resolution: str = Field(default="720P", description="Output resolution")
    vedit_model: str = Field(default="", description="Video edit model name override (e.g. wan2.7-videoedit)")
    seedance_version: str = Field(default="1.5", description="Seedance version for volcengine adapter: '1.5' or '2.0'")
    # Seedance 2.0 editable parameters (previously hardcoded)
    generate_audio: bool = Field(default=True, description="Seedance 2.0: generate synchronized audio")
    video_resolution: str = Field(default="720p", description="Seedance 2.0: 480p|720p|1080p")
    negative_prompt: str = Field(default="", description="Seedance 2.0: negative prompt")
    seed: int = Field(default=-1, description="Seedance 2.0: random seed (-1 = random)")
    camera_fixed: bool = Field(default=False, description="Seedance 2.0: lock camera")
    return_last_frame: bool = Field(default=False, description="Seedance 2.0: also return last frame image")
    duration_seconds: float = Field(default=5.0, gt=0.0, le=15.0, description="Seedance 2.0: output duration")


class AnimateMixGenerateRequest(BaseModel):
    """AnimateMix (video face swap) generation request payload."""

    node_id: str = Field(..., description="Node ID that triggered the request")
    source_video: str = Field(..., min_length=1, description="Source video URL")
    source_image: str = Field(..., min_length=1, description="Person image URL to swap in")
    mode: str = Field(default="wan-std", description="wan-std or wan-pro")
    adapter: str = Field(default="auto", description="Adapter name")


class DigitalHumanGenerateRequest(BaseModel):
    """Digital Human (S2V) generation request payload."""

    node_id: str = Field(..., description="Node ID that triggered the request")
    text: str = Field(default="", description="Speech text for TTS (optional if audio_url is provided)")
    source_image: str = Field(..., min_length=1, description="Character image URL")
    audio_url: str = Field(default="", description="Pre-generated audio URL (bypasses TTS if provided)")
    voice: str = Field(default="zh_female_xiaohe_uranus_bigtts", description="TTS speaker ID")
    style: Literal["speech", "singing", "performance"] = Field(default="speech", description="S2V style")
    resolution: Literal["480P", "720P"] = Field(default="480P", description="S2V output resolution")
    adapter: str = Field(default="auto", description="Adapter name")


class TTSGenerateRequest(BaseModel):
    """Standalone TTS generation request payload."""

    node_id: str = Field(..., description="Node ID that triggered the request")
    text: str = Field(..., min_length=1, description="Speech text to synthesize")
    voice: str = Field(default="zh_female_xiaohe_uranus_bigtts", description="TTS speaker ID")
    tts_provider: str = Field(default="auto", description="TTS provider: auto / volcengine / dashscope")
    speech_rate: int | None = Field(
        default=None, ge=-50, le=100,
        description="Speech rate offset (-50 ~ +100, 0 = normal). Optional.",
    )
    loudness_rate: int | None = Field(
        default=None, ge=-50, le=100,
        description="Loudness rate offset (-50 ~ +100, 0 = normal). Optional.",
    )


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


class ImageUnderstandRequest(BaseModel):
    """Image understanding request payload."""

    image_url: str = Field(..., min_length=1, description="Input image URL to analyze")


class ImageUnderstandResponse(BaseModel):
    """Image understanding response payload — scene description only."""

    description: str
    model: str


class ImageUnderstandPromptRequest(BaseModel):
    """Request to generate a targeted prompt from a scene description."""

    description: str = Field(..., min_length=1, description="Scene description to base the prompt on")


class ImageUnderstandPromptResponse(BaseModel):
    """Response with a generated prompt based on a scene description."""

    prompt: str
    model: str


class VolcengineConfigResponse(BaseModel):
    """Editable Volcengine configuration returned to the frontend."""

    ark_base_url: str
    ark_api_key: str
    prompt_model: str
    image_model: str
    image_edit_model: str
    video_model: str
    video_v2_model: str = ""
    video_version: str = "1.5"
    configured: bool


class VolcengineConfigUpdateRequest(BaseModel):
    """Volcengine configuration submitted from the frontend."""

    ark_base_url: str = Field(..., min_length=1)
    ark_api_key: str = Field(default="")
    prompt_model: str = Field(..., min_length=1)
    image_model: str = Field(..., min_length=1)
    image_edit_model: str = Field(..., min_length=1)
    video_model: str = Field(..., min_length=1)
    video_v2_model: str = Field(default="")
    video_version: str = Field(default="1.5")


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
    happyhorse_t2v_model: str
    happyhorse_i2v_model: str
    happyhorse_r2v_model: str
    happyhorse_vedit_model: str
    happyhorse_video_resolution: str
    animate_mix_model: str
    s2v_model: str
    voice_enrollment_model: str = ""
    tts_vc_model: str = ""
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
    happyhorse_t2v_model: str = Field(..., min_length=1)
    happyhorse_i2v_model: str = Field(..., min_length=1)
    happyhorse_r2v_model: str = Field(..., min_length=1)
    happyhorse_vedit_model: str = Field(..., min_length=1)
    happyhorse_video_resolution: Literal["720P", "1080P"] = Field(default="720P")
    animate_mix_model: str = Field(default="wan2.2-animate-mix")
    s2v_model: str = Field(default="wan2.2-s2v")
    voice_enrollment_model: str = Field(default="qwen-voice-enrollment")
    tts_vc_model: str = Field(default="qwen3-tts-vc-2026-01-22")
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


class VoiceCloneRequest(BaseModel):
    """Request to create a cloned voice from audio."""

    audio_base64: str = Field(..., min_length=1)
    audio_mime_type: str = Field(default="audio/mpeg")
    name: str = Field(..., min_length=1)


class ClonedVoiceItem(BaseModel):
    """A single cloned voice entry."""

    voice_id: str
    name: str
    created_at: float


class VoiceCloneResponse(BaseModel):
    """Response after creating a cloned voice."""

    voice_id: str
    name: str
    created_at: float


class ClonedVoiceListResponse(BaseModel):
    """Response listing all cloned voices."""

    voices: list[ClonedVoiceItem]


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
    output_image_original_url: Optional[str] = None
    output_video: Optional[str] = None
    output_last_frame: Optional[str] = None
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


# ---------------------------------------------------------------------------
# Character library models
# ---------------------------------------------------------------------------

class CharacterSaveRequest(BaseModel):
    """Save a generated character to the library."""

    name: str = Field(..., min_length=1, max_length=64)
    cdn_url: str = Field(..., min_length=1)
    prompt: str = Field(default="")
    thumbnail_url: str = Field(default="")


class CharacterItem(BaseModel):
    """A saved character entry."""

    id: str
    name: str
    cdn_url: str
    thumbnail_url: str = ""
    prompt: str = ""
    created_at: float
    expires_at: float


class CharacterListResponse(BaseModel):
    """List of saved characters."""

    characters: list[CharacterItem]


# ---------------------------------------------------------------------------
# Official virtual human portrait library models
# ---------------------------------------------------------------------------

class OfficialCharacterItem(BaseModel):
    """An official virtual human portrait preset."""

    asset_id: str
    title: str
    description: str = ""
    metadata: dict = {}
    thumbnail: str = ""


class OfficialCharacterListResponse(BaseModel):
    """List of official virtual human portrait presets."""

    characters: list[OfficialCharacterItem]
    total: int
    console_url: str = "https://console.volcengine.com/ark/region:ark.cn-beijing/experience/portrait"
