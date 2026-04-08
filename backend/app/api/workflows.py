"""
工作流 API 路由 - CRUD 操作
"""
import logging
from fastapi import APIRouter, HTTPException

from ..models.schemas import (
    WorkflowSaveRequest, WorkflowResponse, WorkflowListItem, ApiResponse
)
from ..services.workflow_service import workflow_service

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/workflows", tags=["工作流"])


@router.get("", response_model=list[WorkflowListItem])
async def list_workflows():
    """获取工作流列表"""
    logger.debug("[API] GET /api/workflows")
    return workflow_service.list_all()


@router.get("/{workflow_id}", response_model=WorkflowResponse)
async def get_workflow(workflow_id: str):
    """获取单个工作流详情"""
    logger.debug(f"[API] GET /api/workflows/{workflow_id}")
    wf = workflow_service.get(workflow_id)
    if not wf:
        raise HTTPException(status_code=404, detail="工作流不存在")
    return wf


@router.post("", response_model=WorkflowResponse)
async def create_workflow(req: WorkflowSaveRequest):
    """新建工作流"""
    logger.info(f"[API] POST /api/workflows, name={req.name}")
    return workflow_service.save(req)


@router.put("/{workflow_id}", response_model=WorkflowResponse)
async def update_workflow(workflow_id: str, req: WorkflowSaveRequest):
    """更新工作流"""
    logger.info(f"[API] PUT /api/workflows/{workflow_id}")
    existing = workflow_service.get(workflow_id)
    if not existing:
        raise HTTPException(status_code=404, detail="工作流不存在")
    return workflow_service.save(req, workflow_id=workflow_id)


@router.delete("/{workflow_id}", response_model=ApiResponse)
async def delete_workflow(workflow_id: str):
    """删除工作流"""
    logger.info(f"[API] DELETE /api/workflows/{workflow_id}")
    ok = workflow_service.delete(workflow_id)
    if not ok:
        raise HTTPException(status_code=404, detail="工作流不存在")
    return ApiResponse(message="删除成功")

