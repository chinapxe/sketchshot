"""
Task service for generation jobs.
"""
import asyncio
import logging
from typing import Optional
from uuid import uuid4

from ..adapters import adapter_registry
from ..adapters.base import GenerateParams, ProgressUpdate
from ..config import settings
from ..models.schemas import TaskStatus
from .engine_config_service import engine_config_service

logger = logging.getLogger(__name__)

# Keywords that indicate a content-policy / safety-moderation rejection from the generation API.
_CONTENT_POLICY_KEYWORDS = [
    "真人", "真实人脸", "真实人物", "人像", "人脸", "人物肖像",
    "安全审核", "内容审核", "审核不通过", "审核未通过",
    "违规", "不合规", "敏感内容", "内容安全",
    "realistic human", "photorealistic", "real person",
    "human face", "portrait photo",
    "content policy", "content moderation", "sensitive content",
]

_CONTENT_POLICY_HINT = (
    "生成被平台安全审核拦截：提示词可能生成真人/真实人脸内容。"
    "建议开启节点中的「非真人风格」开关，或修改提示词使用动画、CG、卡通等非真人风格描述。"
)


def _translate_error_message(raw_message: str) -> str:
    """Translate raw API error messages into user-friendly Chinese hints.

    Detects content-policy / safety-moderation rejections and returns an
    actionable message; otherwise passes through the original error text.
    """
    if not raw_message:
        return raw_message

    lowered = raw_message.lower()
    for keyword in _CONTENT_POLICY_KEYWORDS:
        if keyword.lower() in lowered:
            return f"{_CONTENT_POLICY_HINT}\n\n原始错误：{raw_message}"

    return raw_message


class TaskInfo:
    """Runtime task information."""

    __slots__ = (
        "task_id",
        "node_id",
        "status",
        "progress",
        "output_image",
        "output_image_original_url",
        "output_video",
        "output_last_frame",
        "error_message",
    )

    def __init__(self, task_id: str, node_id: str):
        self.task_id = task_id
        self.node_id = node_id
        self.status = TaskStatus.PENDING
        self.progress = 0
        self.output_image: Optional[str] = None
        self.output_image_original_url: Optional[str] = None
        self.output_video: Optional[str] = None
        self.output_last_frame: Optional[str] = None
        self.error_message: Optional[str] = None


class TaskService:
    """Task scheduler and progress dispatcher."""

    def __init__(self):
        self._tasks: dict[str, TaskInfo] = {}
        self._progress_callbacks: dict[str, asyncio.Queue] = {}

    def create_task(self, node_id: str) -> TaskInfo:
        task_id = uuid4().hex[:16]
        info = TaskInfo(task_id=task_id, node_id=node_id)
        self._tasks[task_id] = info
        logger.info("[TaskService] created task: task_id=%s node_id=%s", task_id, node_id)
        return info

    def get_task(self, task_id: str) -> Optional[TaskInfo]:
        return self._tasks.get(task_id)

    def register_progress_queue(self, node_id: str) -> asyncio.Queue:
        queue: asyncio.Queue = asyncio.Queue()
        self._progress_callbacks[node_id] = queue
        return queue

    def unregister_progress_queue(self, node_id: str):
        self._progress_callbacks.pop(node_id, None)

    def _resolve_adapter_name(self, requested_name: str) -> str:
        adapter_name = (requested_name or settings.DEFAULT_ADAPTER or "auto").strip().lower()
        logger.info(
            "[TaskService] _resolve_adapter_name: requested=%r DEFAULT_ADAPTER=%r generate_provider=%r",
            requested_name,
            settings.DEFAULT_ADAPTER,
            engine_config_service.get_generate_provider(),
        )
        if adapter_name and adapter_name != "auto":
            logger.info("[TaskService] using explicit adapter: %s", adapter_name)
            return adapter_name

        configured_default = (settings.DEFAULT_ADAPTER or "auto").strip().lower()
        if configured_default and configured_default != "auto":
            return configured_default

        configured_provider = engine_config_service.get_generate_provider().strip().lower()
        if configured_provider and configured_provider != "auto":
            return configured_provider

        for fallback_name in ("wanx", "volcengine", "comfyui", "mock"):
            if adapter_registry.get(fallback_name):
                return fallback_name

        available_adapters = adapter_registry.list_adapters()
        return available_adapters[0] if available_adapters else adapter_name or "mock"

    async def run_task(self, task_id: str, adapter_name: str, params: GenerateParams):
        info = self._tasks.get(task_id)
        if not info:
            logger.error("[TaskService] task not found: %s", task_id)
            return

        resolved_adapter_name = self._resolve_adapter_name(adapter_name)
        adapter = adapter_registry.get(resolved_adapter_name)
        logger.info(
            "[TaskService] run_task: requested=%r resolved=%r available=%s found=%s",
            adapter_name,
            resolved_adapter_name,
            adapter_registry.list_adapters(),
            adapter is not None,
        )
        if not adapter:
            available_adapters = ", ".join(adapter_registry.list_adapters()) or "none"
            info.status = TaskStatus.ERROR
            info.error_message = (
                f"Adapter '{resolved_adapter_name}' is not registered. Available adapters: {available_adapters}"
            )
            logger.error("[TaskService] %s", info.error_message)
            await self._push_progress(
                info.node_id,
                ProgressUpdate(progress=0, status="error", message=info.error_message),
            )
            return

        info.status = TaskStatus.PROCESSING
        logger.info(
            "[TaskService] start task: task_id=%s requested_adapter=%s resolved_adapter=%s type=%s",
            task_id,
            adapter_name,
            resolved_adapter_name,
            params.task_type,
        )

        # Yield to the event loop so that pending WebSocket connections
        # have a chance to register their progress queues.
        await asyncio.sleep(0)

        try:
            async for update in adapter.generate(params):
                info.progress = update.progress

                if update.status == "success":
                    info.status = TaskStatus.SUCCESS
                elif update.status == "error":
                    info.status = TaskStatus.ERROR
                    info.error_message = _translate_error_message(update.message)
                else:
                    info.status = TaskStatus.PROCESSING

                if update.output_image:
                    info.output_image = update.output_image
                if update.output_image_original_url:
                    info.output_image_original_url = update.output_image_original_url
                if update.output_video:
                    info.output_video = update.output_video
                if update.output_last_frame:
                    info.output_last_frame = update.output_last_frame

                await self._push_progress(info.node_id, update)

                if update.status == "error":
                    logger.error("[TaskService] task reported error: task_id=%s message=%s", task_id, update.message)
                    return

            if info.status != TaskStatus.SUCCESS:
                info.status = TaskStatus.SUCCESS

            logger.info("[TaskService] task completed: task_id=%s", task_id)

        except Exception as exc:
            info.status = TaskStatus.ERROR
            info.error_message = _translate_error_message(str(exc))
            logger.error("[TaskService] task failed: task_id=%s error=%s", task_id, exc)
            await self._push_progress(
                info.node_id,
                ProgressUpdate(progress=info.progress, status="error", message=str(exc)),
            )

    async def _push_progress(self, node_id: str, update: ProgressUpdate):
        queue = self._progress_callbacks.get(node_id)
        if queue:
            await queue.put(update)
        else:
            logger.warning(
                "[TaskService] no progress queue for node_id=%s (WS not connected yet); "
                "update dropped: progress=%d status=%s",
                node_id,
                update.progress,
                update.status,
            )


task_service = TaskService()
