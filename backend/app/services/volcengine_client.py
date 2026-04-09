"""
Thin Ark API client used by the Volcengine adapter and prompt service.
"""
from __future__ import annotations

import asyncio
import json
from typing import Any
from urllib import error, request
from urllib.parse import urlparse


def _stringify_connection_reason(reason: object) -> str:
    if isinstance(reason, str):
        return reason.strip()

    strerror = getattr(reason, "strerror", None)
    if isinstance(strerror, str) and strerror.strip():
        return strerror.strip()

    return str(reason).strip()


def format_volcengine_connection_error(base_url: str, reason: object, *, action: str = "connect") -> str:
    reason_text = _stringify_connection_reason(reason)
    endpoint = urlparse(base_url).netloc or base_url
    target_label = "火山引擎 Ark" if action == "connect" else "火山引擎资源地址"
    common_hint = (
        f"请检查当前机器到 {endpoint} 的网络连通性，以及代理/VPN、防火墙、公司安全软件或 TLS 拦截设置。"
    )
    normalized_upper = reason_text.upper()
    normalized_lower = reason_text.lower()

    if (
        "UNEXPECTED_EOF_WHILE_READING" in normalized_upper
        or "EOF OCCURRED IN VIOLATION OF PROTOCOL" in normalized_upper
        or "SSL:" in normalized_upper
        or "TLS" in normalized_upper
    ):
        return f"无法连接{target_label}（TLS 握手失败）。{common_hint} 原始错误：{reason_text}"

    if (
        "TIMED OUT" in normalized_upper
        or "TIMEOUT" in normalized_upper
        or "超时" in reason_text
    ):
        return f"连接{target_label}超时。{common_hint} 原始错误：{reason_text}"

    if (
        "REFUSED" in normalized_upper
        or "10061" in normalized_lower
        or "ACTIVELY REFUSED" in normalized_upper
        or "无法连接到远程服务器" in reason_text
    ):
        return f"当前机器无法与{target_label}建立 TCP 连接。{common_hint} 原始错误：{reason_text}"

    if (
        "NAME OR SERVICE NOT KNOWN" in normalized_upper
        or "TEMPORARY FAILURE IN NAME RESOLUTION" in normalized_upper
        or "NODENAME NOR SERVNAME" in normalized_upper
        or "GETADDRINFO FAILED" in normalized_upper
    ):
        return f"无法解析{target_label}地址。请检查 DNS、代理或网络出口配置。原始错误：{reason_text}"

    return f"无法连接{target_label}。{common_hint} 原始错误：{reason_text}"


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
                raise RuntimeError(
                    format_volcengine_connection_error(self._base_url, exc.reason, action="connect")
                ) from exc

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
                raise RuntimeError(
                    format_volcengine_connection_error(self._base_url, exc.reason, action="download")
                ) from exc

        return await asyncio.to_thread(_do_download)
