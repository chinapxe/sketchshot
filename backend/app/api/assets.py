"""
Asset upload API.
"""
from pathlib import Path
from uuid import uuid4

import aiofiles
from fastapi import APIRouter, File, HTTPException, UploadFile

from ..config import settings
from ..models.schemas import UploadedAssetResponse

router = APIRouter(prefix="/api/assets", tags=["assets"])

ALLOWED_IMAGE_TYPES = {
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
    "image/gif": ".gif",
}


@router.post("/upload", response_model=UploadedAssetResponse)
async def upload_image_asset(file: UploadFile = File(...)):
    """Upload a reference image into backend-managed storage."""
    if file.content_type not in ALLOWED_IMAGE_TYPES:
        raise HTTPException(status_code=400, detail="仅支持 jpg/png/webp/gif 图片上传")

    content = await file.read()
    if not content:
        raise HTTPException(status_code=400, detail="上传文件为空")

    suffix = Path(file.filename or "").suffix.lower() or ALLOWED_IMAGE_TYPES[file.content_type]
    stored_name = f"{uuid4().hex[:16]}{suffix}"
    target_path = Path(settings.UPLOAD_DIR) / stored_name
    target_path.parent.mkdir(parents=True, exist_ok=True)

    async with aiofiles.open(target_path, "wb") as output_file:
        await output_file.write(content)

    return UploadedAssetResponse(
        file_name=file.filename or stored_name,
        content_type=file.content_type,
        size=len(content),
        url=f"/uploads/{stored_name}",
    )
