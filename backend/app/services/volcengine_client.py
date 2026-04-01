"""
Thin Ark API client used by the Volcengine adapter and prompt service.
"""
from __future__ import annotations

import asyncio
import json
from typing import Any
from urllib import error, request


class VolcengineClient:
    """Minimal JSON client for Volcengine Ark APIs."""

    def __init__(self, *, base_url: str, api_key: str, timeout: float):
        self._base_url = base_url.rstrip("/")
        self._api_key = api_key
        self._timeout = timeout

    @property
    def is_configured(self) -> bool:
        return bool(self._api_key.strip())

    async def request_json(
        self,
        *,
        path: str,
        method: str = "GET",
        payload: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        def _do_request() -> dict[str, Any]:
            headers = {
                "Accept": "application/json",
                "Authorization": f"Bearer {self._api_key}",
            }
            body: bytes | None = None
            if payload is not None:
                headers["Content-Type"] = "application/json"
                body = json.dumps(payload, ensure_ascii=False).encode("utf-8")

            req = request.Request(
                f"{self._base_url}{path}",
                data=body,
                method=method,
                headers=headers,
            )

            try:
                with request.urlopen(req, timeout=self._timeout) as response:
                    raw = response.read().decode("utf-8")
            except error.HTTPError as exc:
                error_body = exc.read().decode("utf-8", errors="ignore")
                raise RuntimeError(
                    f"Volcengine request failed: HTTP {exc.code} {error_body or exc.reason}"
                ) from exc
            except error.URLError as exc:
                raise RuntimeError(f"Cannot reach Volcengine Ark: {exc.reason}") from exc

            return json.loads(raw) if raw else {}

        return await asyncio.to_thread(_do_request)

    async def download_asset(self, url: str) -> tuple[bytes, str | None]:
        def _do_download() -> tuple[bytes, str | None]:
            req = request.Request(url, method="GET")
            try:
                with request.urlopen(req, timeout=self._timeout) as response:
                    content_type = response.headers.get("Content-Type")
                    return response.read(), content_type
            except error.HTTPError as exc:
                error_body = exc.read().decode("utf-8", errors="ignore")
                raise RuntimeError(
                    f"Volcengine asset download failed: HTTP {exc.code} {error_body or exc.reason}"
                ) from exc
            except error.URLError as exc:
                raise RuntimeError(f"Cannot download Volcengine asset: {exc.reason}") from exc

        return await asyncio.to_thread(_do_download)
