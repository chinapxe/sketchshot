"""
用户模板 API 路由 - CRUD 操作
"""
import logging

from fastapi import APIRouter, HTTPException

from ..models.schemas import ApiResponse, UserTemplateListItem, UserTemplateResponse, UserTemplateSaveRequest
from ..services.template_service import template_service

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/templates", tags=["用户模板"])


@router.get("", response_model=list[UserTemplateListItem])
async def list_templates():
    """获取用户模板列表"""
    logger.debug("[API] GET /api/templates")
    return template_service.list_all()


@router.get("/{template_id}", response_model=UserTemplateResponse)
async def get_template(template_id: str):
    """获取单个用户模板详情"""
    logger.debug(f"[API] GET /api/templates/{template_id}")
    template = template_service.get(template_id)
    if not template:
        raise HTTPException(status_code=404, detail="模板不存在")
    return template


@router.post("", response_model=UserTemplateResponse)
async def create_template(req: UserTemplateSaveRequest):
    """新建用户模板"""
    logger.info(f"[API] POST /api/templates, name={req.name}")
    return template_service.save(req)


@router.put("/{template_id}", response_model=UserTemplateResponse)
async def update_template(template_id: str, req: UserTemplateSaveRequest):
    """更新用户模板"""
    logger.info(f"[API] PUT /api/templates/{template_id}")
    existing = template_service.get(template_id)
    if not existing:
        raise HTTPException(status_code=404, detail="模板不存在")
    return template_service.save(req, template_id=template_id)


@router.delete("/{template_id}", response_model=ApiResponse)
async def delete_template(template_id: str):
    """删除用户模板"""
    logger.info(f"[API] DELETE /api/templates/{template_id}")
    ok = template_service.delete(template_id)
    if not ok:
        raise HTTPException(status_code=404, detail="模板不存在")
    return ApiResponse(message="删除成功")
