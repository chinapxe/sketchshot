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

logger = logging.getLogger(__name__)


class TaskInfo:
    """Runtime task information."""

    __slots__ = (
        "task_id",
        "node_id",
        "status",
        "progress",
        "output_image",
        "output_video",
        "error_message",
    )

    def __init__(self, task_id: str, node_id: str):
        self.task_id = task_id
        self.node_id = node_id
        self.status = TaskStatus.PENDING
        self.progress = 0
        self.output_image: Optional[str] = None
        self.output_video: Optional[str] = None
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
        if adapter_name and adapter_name != "auto":
            return adapter_name

        configured_default = (settings.DEFAULT_ADAPTER or "auto").strip().lower()
        if configured_default and configured_default != "auto":
            return configured_default

        for fallback_name in ("volcengine", "comfyui", "mock"):
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

        try:
            async for update in adapter.generate(params):
                info.progress = update.progress

                if update.status == "success":
                    info.status = TaskStatus.SUCCESS
                elif update.status == "error":
                    info.status = TaskStatus.ERROR
                    info.error_message = update.message
                else:
                    info.status = TaskStatus.PROCESSING

                if update.output_image:
                    info.output_image = update.output_image
                if update.output_video:
                    info.output_video = update.output_video

                await self._push_progress(info.node_id, update)

                if update.status == "error":
                    logger.error("[TaskService] task reported error: task_id=%s message=%s", task_id, update.message)
                    return

            if info.status != TaskStatus.SUCCESS:
                info.status = TaskStatus.SUCCESS

            logger.info("[TaskService] task completed: task_id=%s", task_id)

        except Exception as exc:
            info.status = TaskStatus.ERROR
            info.error_message = str(exc)
            logger.error("[TaskService] task failed: task_id=%s error=%s", task_id, exc)
            await self._push_progress(
                info.node_id,
                ProgressUpdate(progress=info.progress, status="error", message=str(exc)),
            )

    async def _push_progress(self, node_id: str, update: ProgressUpdate):
        queue = self._progress_callbacks.get(node_id)
        if queue:
            await queue.put(update)


task_service = TaskService()
