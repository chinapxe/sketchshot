"""
工作流服务 - 画布 JSON 持久化（文件存储）
后续可无缝切换到数据库存储
"""
import json
import logging
from pathlib import Path
from datetime import datetime, timezone
from uuid import uuid4

from ..config import settings
from ..models.schemas import WorkflowSaveRequest, WorkflowResponse, WorkflowListItem

logger = logging.getLogger(__name__)


class WorkflowService:
    """工作流 CRUD 服务"""

    def __init__(self):
        self._storage_dir = Path(settings.WORKFLOW_STORAGE_DIR)
        self._storage_dir.mkdir(parents=True, exist_ok=True)
        logger.info(f"[WorkflowService] 存储目录: {self._storage_dir}")

    def _get_file_path(self, workflow_id: str) -> Path:
        return self._storage_dir / f"{workflow_id}.json"

    def _now_iso(self) -> str:
        return datetime.now(timezone.utc).isoformat()

    def save(self, req: WorkflowSaveRequest, workflow_id: str | None = None) -> WorkflowResponse:
        """保存工作流（新建或更新）"""
        is_new = workflow_id is None
        if is_new:
            workflow_id = uuid4().hex[:12]

        file_path = self._get_file_path(workflow_id)
        now = self._now_iso()

        # 如果是更新，保留 created_at
        created_at = now
        if file_path.exists():
            try:
                existing = json.loads(file_path.read_text(encoding="utf-8"))
                created_at = existing.get("created_at", now)
            except Exception:
                pass

        data = {
            "id": workflow_id,
            "name": req.name,
            "nodes": [n.model_dump() for n in req.nodes],
            "edges": [e.model_dump() for e in req.edges],
            "created_at": created_at,
            "updated_at": now,
        }

        file_path.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
        action = "新建" if is_new else "更新"
        logger.info(f"[WorkflowService] {action}工作流: id={workflow_id}, name={req.name}")

        return WorkflowResponse(**data)

    def get(self, workflow_id: str) -> WorkflowResponse | None:
        """获取单个工作流"""
        file_path = self._get_file_path(workflow_id)
        if not file_path.exists():
            return None
        try:
            data = json.loads(file_path.read_text(encoding="utf-8"))
            return WorkflowResponse(**data)
        except Exception as e:
            logger.error(f"[WorkflowService] 读取工作流失败: {e}")
            return None

    def list_all(self) -> list[WorkflowListItem]:
        """列出所有工作流"""
        items = []
        for fp in sorted(self._storage_dir.glob("*.json"), key=lambda p: p.stat().st_mtime, reverse=True):
            try:
                data = json.loads(fp.read_text(encoding="utf-8"))
                items.append(WorkflowListItem(
                    id=data["id"],
                    name=data["name"],
                    node_count=len(data.get("nodes", [])),
                    created_at=data["created_at"],
                    updated_at=data["updated_at"],
                ))
            except Exception as e:
                logger.warning(f"[WorkflowService] 解析文件失败 {fp}: {e}")
        return items

    def delete(self, workflow_id: str) -> bool:
        """删除工作流"""
        file_path = self._get_file_path(workflow_id)
        if file_path.exists():
            file_path.unlink()
            logger.info(f"[WorkflowService] 删除工作流: {workflow_id}")
            return True
        return False


# 全局单例
workflow_service = WorkflowService()

