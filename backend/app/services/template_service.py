"""
用户模板服务 - 画布模板 JSON 持久化（文件存储）
"""
import json
import logging
from datetime import datetime, timezone
from pathlib import Path
from uuid import uuid4

from ..config import settings
from ..models.schemas import UserTemplateListItem, UserTemplateResponse, UserTemplateSaveRequest

logger = logging.getLogger(__name__)


class TemplateService:
    """用户模板 CRUD 服务"""

    def __init__(self):
        self._storage_dir = Path(settings.TEMPLATE_STORAGE_DIR)
        self._storage_dir.mkdir(parents=True, exist_ok=True)
        logger.info(f"[TemplateService] 存储目录: {self._storage_dir}")

    def _get_file_path(self, template_id: str) -> Path:
        return self._storage_dir / f"{template_id}.json"

    def _now_iso(self) -> str:
        return datetime.now(timezone.utc).isoformat()

    def save(self, req: UserTemplateSaveRequest, template_id: str | None = None) -> UserTemplateResponse:
        """保存用户模板（新建或更新）"""
        is_new = template_id is None
        if is_new:
            template_id = uuid4().hex[:12]

        file_path = self._get_file_path(template_id)
        now = self._now_iso()

        created_at = now
        if file_path.exists():
            try:
                existing = json.loads(file_path.read_text(encoding="utf-8"))
                created_at = existing.get("created_at", now)
            except Exception:
                pass

        data = {
            "id": template_id,
            "name": req.name,
            "nodes": [node.model_dump() for node in req.nodes],
            "edges": [edge.model_dump() for edge in req.edges],
            "created_at": created_at,
            "updated_at": now,
        }

        file_path.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
        action = "新建" if is_new else "更新"
        logger.info(f"[TemplateService] {action}用户模板: id={template_id}, name={req.name}")

        return UserTemplateResponse(**data)

    def get(self, template_id: str) -> UserTemplateResponse | None:
        """获取单个用户模板"""
        file_path = self._get_file_path(template_id)
        if not file_path.exists():
            return None

        try:
            data = json.loads(file_path.read_text(encoding="utf-8"))
            return UserTemplateResponse(**data)
        except Exception as error:
            logger.error(f"[TemplateService] 读取用户模板失败: {error}")
            return None

    def list_all(self) -> list[UserTemplateListItem]:
        """列出所有用户模板"""
        items = []
        for file_path in sorted(self._storage_dir.glob("*.json"), key=lambda path: path.stat().st_mtime, reverse=True):
            try:
                data = json.loads(file_path.read_text(encoding="utf-8"))
                items.append(
                    UserTemplateListItem(
                        id=data["id"],
                        name=data["name"],
                        node_count=len(data.get("nodes", [])),
                        created_at=data["created_at"],
                        updated_at=data["updated_at"],
                    )
                )
            except Exception as error:
                logger.warning(f"[TemplateService] 解析模板文件失败 {file_path}: {error}")

        return items

    def delete(self, template_id: str) -> bool:
        """删除用户模板"""
        file_path = self._get_file_path(template_id)
        if file_path.exists():
            file_path.unlink()
            logger.info(f"[TemplateService] 删除用户模板: {template_id}")
            return True

        return False


template_service = TemplateService()
