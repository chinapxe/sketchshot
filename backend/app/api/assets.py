"""
Asset upload API.
"""
import asyncio
import logging
import shutil
import subprocess
import sys
from pathlib import Path
from uuid import uuid4

import aiofiles
from fastapi import APIRouter, File, HTTPException, UploadFile
from pydantic import BaseModel

from ..config import settings
from ..models.schemas import (
    CharacterItem,
    CharacterListResponse,
    CharacterSaveRequest,
    OfficialCharacterItem,
    OfficialCharacterListResponse,
    SplitThreeViewSheetRequest,
    SplitThreeViewSheetResponse,
    UploadedAssetResponse,
)
from ..services.media_asset_service import MediaAssetService
from ..services.three_view_split_service import ThreeViewSplitService
from ..services.volcengine_openapi_client import VolcengineOpenApiClient

CHARACTERS_FILE = Path(settings.OUTPUT_DIR).parent / "characters.json"
OFFICIAL_CHARACTERS_FILE = Path(settings.OUTPUT_DIR).parent / "official_characters.json"

_media_asset_service: MediaAssetService | None = None


def _get_media_asset_service() -> MediaAssetService:
    global _media_asset_service
    if _media_asset_service is None:
        client = VolcengineOpenApiClient(
            access_key=settings.VOLCENGINE_ACCESS_KEY_ID,
            secret_key=settings.VOLCENGINE_SECRET_ACCESS_KEY,
        )
        _media_asset_service = MediaAssetService(client=client)
    return _media_asset_service

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/assets", tags=["assets"])

ALLOWED_UPLOAD_TYPES = {
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
    "image/gif": ".gif",
    "video/mp4": ".mp4",
    "video/webm": ".webm",
    "video/quicktime": ".mov",
    "video/x-msvideo": ".avi",
    "audio/mpeg": ".mp3",
    "audio/wav": ".wav",
    "audio/ogg": ".ogg",
    "audio/mp4": ".mp4",
}

ALLOWED_UPLOAD_TYPE_NAMES = ", ".join(sorted(ALLOWED_UPLOAD_TYPES))

three_view_split_service = ThreeViewSplitService(
    upload_dir=settings.UPLOAD_DIR,
    output_dir=settings.OUTPUT_DIR,
)


@router.post("/upload", response_model=UploadedAssetResponse)
async def upload_image_asset(file: UploadFile = File(...)):
    """Upload an image or video asset into backend-managed storage."""
    if file.content_type not in ALLOWED_UPLOAD_TYPES:
        raise HTTPException(status_code=400, detail=f"不支持的文件类型 {file.content_type}，仅支持 {ALLOWED_UPLOAD_TYPE_NAMES}")

    content = await file.read()
    if not content:
        raise HTTPException(status_code=400, detail="上传文件为空")

    suffix = Path(file.filename or "").suffix.lower() or ALLOWED_UPLOAD_TYPES.get(file.content_type, "")
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


@router.post("/split-three-view", response_model=SplitThreeViewSheetResponse)
async def split_three_view_sheet(payload: SplitThreeViewSheetRequest):
    """Split a three-view sheet image into front / side / back assets."""
    try:
        outputs = three_view_split_service.split_sheet(payload.asset_url)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    return SplitThreeViewSheetResponse(
        front=outputs["front"],
        side=outputs["side"],
        back=outputs["back"],
    )


class ConcatVideosRequest(BaseModel):
    video_urls: list[str]


class ConcatVideosResponse(BaseModel):
    output_video: str


def _resolve_local_path(url: str) -> Path:
    """Resolve an internal asset URL to a local file path."""
    if url.startswith("/uploads/"):
        return Path(settings.UPLOAD_DIR) / url[len("/uploads/"):]
    if url.startswith("/outputs/"):
        return Path(settings.OUTPUT_DIR) / url[len("/outputs/"):]
    raise ValueError(f"Cannot resolve asset URL to local path: {url}")


@router.post("/concat-videos", response_model=ConcatVideosResponse)
async def concat_videos(payload: ConcatVideosRequest):
    """Concatenate multiple videos into a single video using ffmpeg."""
    if not payload.video_urls:
        raise HTTPException(status_code=400, detail="video_urls must not be empty")

    if len(payload.video_urls) == 1:
        return ConcatVideosResponse(output_video=payload.video_urls[0])

    ffmpeg_path = shutil.which("ffmpeg")
    if not ffmpeg_path:
        # also check common locations
        for candidate in (
            Path(sys.executable).parent / "ffmpeg.exe",
            Path(sys.executable).parent / "Scripts" / "ffmpeg.exe",
        ):
            if candidate.exists():
                ffmpeg_path = str(candidate)
                break
    if not ffmpeg_path:
        try:
            import imageio_ffmpeg
            ffmpeg_path = imageio_ffmpeg.get_ffmpeg_exe()
        except Exception as exc:
            logger.error("[concat-videos] ffmpeg not found: %s", exc)
            raise HTTPException(status_code=500, detail="ffmpeg is not installed on the server")

    temp_dir = Path(settings.OUTPUT_DIR) / ".concat-temp"
    temp_dir.mkdir(parents=True, exist_ok=True)

    concat_id = uuid4().hex[:12]
    filelist_path = temp_dir / f"filelist-{concat_id}.txt"
    output_filename = f"concat-{concat_id}.mp4"
    output_path = Path(settings.OUTPUT_DIR) / output_filename

    try:
        resolved_paths: list[Path] = []
        for url in payload.video_urls:
            try:
                local_path = _resolve_local_path(url)
            except ValueError as exc:
                raise HTTPException(status_code=400, detail=str(exc)) from exc

            if not local_path.exists():
                raise HTTPException(status_code=400, detail=f"Video file not found: {url}")
            resolved_paths.append(local_path)

        filelist_lines = [f"file '{path.as_posix()}'" for path in resolved_paths]
        await asyncio.to_thread(filelist_path.write_text, "\n".join(filelist_lines), encoding="utf-8")

        cmd = [
            ffmpeg_path,
            "-f", "concat",
            "-safe", "0",
            "-i", str(filelist_path),
            "-c", "copy",
            "-y",
            str(output_path),
        ]
        proc = await asyncio.to_thread(
            subprocess.run, cmd, capture_output=True,
        )
        if proc.returncode != 0:
            stderr_text = proc.stderr.decode("utf-8", errors="replace") if proc.stderr else ""
            logger.error("[concat-videos] ffmpeg failed: %s", stderr_text[-500:])
            raise HTTPException(
                status_code=500,
                detail=f"ffmpeg concat failed with exit code {proc.returncode}",
            )

        output_url = f"/outputs/{output_filename}"
        logger.info("[concat-videos] created %s from %d videos", output_url, len(resolved_paths))

        return ConcatVideosResponse(output_video=output_url)

    except HTTPException:
        raise
    finally:
        if filelist_path.exists():
            try:
                filelist_path.unlink()
            except OSError:
                pass


# ────────────────────────────────────────────────────────────
# Character library endpoints
# ────────────────────────────────────────────────────────────

import json as _json
import time as _time


def _read_characters() -> dict:
    if not CHARACTERS_FILE.exists():
        return {}
    try:
        return _json.loads(CHARACTERS_FILE.read_text(encoding="utf-8"))
    except _json.JSONDecodeError:
        return {}


def _write_characters(data: dict) -> None:
    CHARACTERS_FILE.parent.mkdir(parents=True, exist_ok=True)
    CHARACTERS_FILE.write_text(_json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")


@router.get("/characters", response_model=CharacterListResponse)
async def list_characters():
    """List all saved characters."""
    chars = _read_characters()
    items = [
        CharacterItem(**item)
        for item in sorted(chars.values(), key=lambda x: x.get("created_at", 0), reverse=True)
    ]
    return CharacterListResponse(characters=items)


@router.post("/characters", response_model=CharacterItem)
async def save_character(req: CharacterSaveRequest):
    """Save a character to the library."""
    chars = _read_characters()
    char_id = uuid4().hex[:12]
    now = _time.time()

    item = {
        "id": char_id,
        "name": req.name,
        "cdn_url": req.cdn_url,
        "thumbnail_url": req.thumbnail_url,
        "prompt": req.prompt,
        "created_at": now,
        "expires_at": now + 30 * 24 * 3600,  # 30 days
    }
    chars[char_id] = item
    _write_characters(chars)
    logger.info("[characters] saved character: id=%s name=%s", char_id, req.name)
    return CharacterItem(**item)


@router.delete("/characters/{character_id}")
async def delete_character(character_id: str):
    """Delete a character from the library."""
    chars = _read_characters()
    if character_id not in chars:
        raise HTTPException(status_code=404, detail="Character not found")
    del chars[character_id]
    _write_characters(chars)
    logger.info("[characters] deleted character: id=%s", character_id)
    return {"detail": "deleted"}


# ────────────────────────────────────────────────────────────
# Official virtual human portrait library (preset)
# ────────────────────────────────────────────────────────────


@router.get("/official-characters", response_model=OfficialCharacterListResponse)
async def list_official_characters():
    """List official virtual human portrait presets (read-only)."""
    if not OFFICIAL_CHARACTERS_FILE.exists():
        return OfficialCharacterListResponse(characters=[], total=0)

    try:
        data = _json.loads(OFFICIAL_CHARACTERS_FILE.read_text(encoding="utf-8"))
    except _json.JSONDecodeError:
        return OfficialCharacterListResponse(characters=[], total=0)

    items = [OfficialCharacterItem(**item) for item in data]
    return OfficialCharacterListResponse(characters=items, total=len(items))


class ThumbnailRefreshResponse(BaseModel):
    thumbnails: dict[str, str]  # asset_id → thumbnail_url


@router.post("/official-characters/thumbnails", response_model=ThumbnailRefreshResponse)
async def refresh_official_thumbnails():
    """Resolve fresh presigned thumbnail URLs for all preset assets."""
    service = _get_media_asset_service()
    if not service.is_configured:
        return ThumbnailRefreshResponse(thumbnails={})

    if not OFFICIAL_CHARACTERS_FILE.exists():
        return ThumbnailRefreshResponse(thumbnails={})

    data = _json.loads(OFFICIAL_CHARACTERS_FILE.read_text(encoding="utf-8"))
    asset_ids = [item["asset_id"] for item in data]
    thumbnails = await service.get_thumbnails(asset_ids)
    return ThumbnailRefreshResponse(thumbnails=thumbnails)
