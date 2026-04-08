"""
WebSocket routes for task progress.
"""
import json
import logging

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from ..services.task_service import task_service

logger = logging.getLogger(__name__)
router = APIRouter()


@router.websocket("/ws/progress/{node_id}")
async def ws_progress(websocket: WebSocket, node_id: str):
    """Stream progress updates for a canvas node."""

    await websocket.accept()
    logger.info("[WebSocket] client connected node_id=%s", node_id)

    queue = task_service.register_progress_queue(node_id)

    try:
        while True:
            update = await queue.get()
            payload = {
                "progress": update.progress,
                "status": update.status,
                "message": update.message,
                "output_image": update.output_image,
                "output_video": update.output_video,
            }
            await websocket.send_text(json.dumps(payload, ensure_ascii=False))

            if update.status in ("success", "error"):
                logger.info("[WebSocket] task finished node_id=%s status=%s", node_id, update.status)
                break

    except WebSocketDisconnect:
        logger.info("[WebSocket] client disconnected node_id=%s", node_id)
    except Exception as exc:
        logger.error("[WebSocket] error node_id=%s error=%s", node_id, exc)
    finally:
        task_service.unregister_progress_queue(node_id)
