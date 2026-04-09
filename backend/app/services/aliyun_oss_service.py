"""
Aliyun OSS helper for temporarily hosting local assets as public/signed URLs.
"""
from __future__ import annotations

import asyncio
import hashlib
import logging
import mimetypes
import re
from pathlib import Path
from typing import Any, Callable

logger = logging.getLogger(__name__)


class AliyunOssAssetHostingService:
    """Uploads local files to Aliyun OSS and returns a signed GET URL."""

    def __init__(
        self,
        *,
        endpoint: str,
        access_key_id: str,
        access_key_secret: str,
        bucket: str,
        key_prefix: str = "",
        signed_url_expire_seconds: int = 7200,
        bucket_factory: Callable[[str, str, str, str], Any] | None = None,
    ):
        normalized_endpoint = endpoint.strip().rstrip("/")
        if normalized_endpoint and not normalized_endpoint.startswith(("http://", "https://")):
            normalized_endpoint = f"https://{normalized_endpoint}"

        self._endpoint = normalized_endpoint
        self._access_key_id = access_key_id.strip()
        self._access_key_secret = access_key_secret.strip()
        self._bucket = bucket.strip()
        self._key_prefix = key_prefix.strip().strip("/")
        self._signed_url_expire_seconds = max(300, int(signed_url_expire_seconds))
        self._bucket_factory = bucket_factory
        self._bucket_client: Any | None = None

    @property
    def is_configured(self) -> bool:
        return bool(
            self._endpoint
            and self._access_key_id
            and self._access_key_secret
            and self._bucket
        )

    async def upload_local_file(self, local_path: str | Path, *, purpose: str) -> str:
        path = Path(local_path)
        if not path.exists():
            raise FileNotFoundError(f"OSS upload source file not found: {path}")

        if not self.is_configured:
            raise RuntimeError("Aliyun OSS is not configured for temporary asset hosting")

        return await asyncio.to_thread(self._upload_local_file_sync, path, purpose)

    def _upload_local_file_sync(self, local_path: Path, purpose: str) -> str:
        bucket = self._get_bucket_client()
        object_key = self._build_object_key(local_path, purpose=purpose)
        payload = local_path.read_bytes()
        mime_type = mimetypes.guess_type(local_path.name)[0] or "application/octet-stream"

        logger.info("[AliyunOSS] upload local asset: path=%s object_key=%s", local_path, object_key)
        bucket.put_object(object_key, payload, headers={"Content-Type": mime_type})

        try:
            signed_url = bucket.sign_url(
                "GET",
                object_key,
                self._signed_url_expire_seconds,
                slash_safe=True,
            )
        except TypeError:
            signed_url = bucket.sign_url("GET", object_key, self._signed_url_expire_seconds)

        if isinstance(signed_url, str) and signed_url.startswith("//"):
            return f"https:{signed_url}"

        return str(signed_url)

    def _get_bucket_client(self) -> Any:
        if self._bucket_client is not None:
            return self._bucket_client

        if self._bucket_factory is not None:
            self._bucket_client = self._bucket_factory(
                self._endpoint,
                self._access_key_id,
                self._access_key_secret,
                self._bucket,
            )
            return self._bucket_client

        try:
            import oss2
        except ImportError as exc:
            raise RuntimeError(
                "Aliyun OSS support requires the optional Python package 'oss2'. "
                "Please install backend dependencies again so Wanx can temporarily host local frames."
            ) from exc

        auth = oss2.Auth(self._access_key_id, self._access_key_secret)
        self._bucket_client = oss2.Bucket(auth, self._endpoint, self._bucket)
        return self._bucket_client

    def _build_object_key(self, local_path: Path, *, purpose: str) -> str:
        digest = hashlib.sha256(local_path.read_bytes()).hexdigest()[:16]
        safe_name = self._sanitize_filename(local_path.name)
        parts = [
            self._key_prefix,
            purpose.strip().strip("/"),
            f"{digest}-{safe_name}",
        ]
        return "/".join(part for part in parts if part)

    def _sanitize_filename(self, value: str) -> str:
        cleaned = re.sub(r"[^A-Za-z0-9._-]+", "-", value).strip("-")
        return cleaned or "asset.bin"
