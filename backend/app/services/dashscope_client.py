"""
Minimal DashScope HTTP client used by Qwen prompt generation and Wanx adapters.
"""
from __future__ import annotations

import asyncio
import json
import socket
import ssl
from typing import Any
from urllib import error, request
from urllib.parse import urlparse


DEFAULT_MAX_RETRIES = 3
DEFAULT_RETRY_DELAY_SECONDS = 1.0


def _stringify_connection_reason(reason: object) -> str:
    if isinstance(reason, str):
        return reason.strip()

    strerror = getattr(reason, "strerror", None)
    if isinstance(strerror, str) and strerror.strip():
        return strerror.strip()

    return str(reason).strip()


def format_dashscope_connection_error(base_url: str, reason: object, *, action: str = "connect") -> str:
    reason_text = _stringify_connection_reason(reason)
    endpoint = urlparse(base_url).netloc or base_url
    target_label = "DashScope" if action == "connect" else "DashScope 资源地址"
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

    if "TIMED OUT" in normalized_upper or "TIMEOUT" in normalized_upper or "超时" in reason_text:
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
def _is_retryable_dashscope_error(reason: object) -> bool:
    reason_text = _stringify_connection_reason(reason)
    normalized_upper = reason_text.upper()
    normalized_lower = reason_text.lower()

    transient_markers = (
        "UNEXPECTED_EOF_WHILE_READING",
        "EOF OCCURRED IN VIOLATION OF PROTOCOL",
        "TLSV1_ALERT_INTERNAL_ERROR",
        "DECRYPTION FAILED OR BAD RECORD MAC",
        "CONNECTION RESET",
        "CONNECTION ABORTED",
        "REMOTE END CLOSED CONNECTION",
        "TIMED OUT",
        "TIMEOUT",
        "TRY AGAIN",
        "TEMPORARY FAILURE",
        "10053",
        "10054",
        "104",
    )
    if any(marker in normalized_upper for marker in transient_markers):
        return True

    if any(marker in normalized_lower for marker in ("reset by peer", "connection reset", "connection aborted")):
        return True

    return isinstance(
        reason,
        (
            TimeoutError,
            socket.timeout,
            ConnectionResetError,
            ConnectionAbortedError,
            ssl.SSLError,
        ),
    )


class DashScopeClient:
    """Minimal JSON client for DashScope APIs."""

    def __init__(
        self,
        *,
        base_url: str,
        api_key: str,
        timeout: float,
        max_retries: int = DEFAULT_MAX_RETRIES,
        retry_delay_seconds: float = DEFAULT_RETRY_DELAY_SECONDS,
    ):
        self._base_url = base_url.rstrip("/")
        self._api_key = api_key
        self._timeout = timeout
        self._max_retries = max(1, int(max_retries))
        self._retry_delay_seconds = max(0.0, float(retry_delay_seconds))

    @property
    def is_configured(self) -> bool:
        return bool(self._api_key.strip())

    async def request_json(
        self,
        *,
        path: str,
        method: str = "GET",
        payload: dict[str, Any] | None = None,
        headers: dict[str, str] | None = None,
    ) -> dict[str, Any]:
        def _do_request() -> dict[str, Any]:
            request_headers = {
                "Accept": "application/json",
                "Authorization": f"Bearer {self._api_key}",
                "Connection": "close",
            }
            if headers:
                request_headers.update(headers)

            body: bytes | None = None
            if payload is not None:
                request_headers.setdefault("Content-Type", "application/json")
                body = json.dumps(payload, ensure_ascii=False).encode("utf-8")

            req = request.Request(
                f"{self._base_url}{path}",
                data=body,
                method=method,
                headers=request_headers,
            )

            with request.urlopen(req, timeout=self._timeout) as response:
                raw = response.read().decode("utf-8")

            return json.loads(raw) if raw else {}

        last_error: RuntimeError | None = None
        for attempt in range(1, self._max_retries + 1):
            try:
                return await asyncio.to_thread(_do_request)
            except error.HTTPError as exc:
                error_body = exc.read().decode("utf-8", errors="ignore")
                raise RuntimeError(
                    f"DashScope request failed: HTTP {exc.code} {error_body or exc.reason}"
                ) from exc
            except error.URLError as exc:
                last_error = RuntimeError(
                    format_dashscope_connection_error(self._base_url, exc.reason, action="connect")
                )
                if attempt >= self._max_retries or not _is_retryable_dashscope_error(exc.reason):
                    raise last_error from exc
            except (ssl.SSLError, TimeoutError, socket.timeout, ConnectionResetError, ConnectionAbortedError) as exc:
                last_error = RuntimeError(
                    format_dashscope_connection_error(self._base_url, exc, action="connect")
                )
                if attempt >= self._max_retries or not _is_retryable_dashscope_error(exc):
                    raise last_error from exc

            await asyncio.sleep(self._retry_delay_seconds * attempt)

        if last_error is not None:
            raise last_error

        return {}

    async def download_asset(self, url: str) -> tuple[bytes, str | None]:
        def _do_download() -> tuple[bytes, str | None]:
            req = request.Request(url, method="GET", headers={"Connection": "close"})
            with request.urlopen(req, timeout=self._timeout) as response:
                content_type = response.headers.get("Content-Type")
                return response.read(), content_type

        last_error: RuntimeError | None = None
        for attempt in range(1, self._max_retries + 1):
            try:
                return await asyncio.to_thread(_do_download)
            except error.HTTPError as exc:
                error_body = exc.read().decode("utf-8", errors="ignore")
                raise RuntimeError(
                    f"DashScope asset download failed: HTTP {exc.code} {error_body or exc.reason}"
                ) from exc
            except error.URLError as exc:
                last_error = RuntimeError(
                    format_dashscope_connection_error(self._base_url, exc.reason, action="download")
                )
                if attempt >= self._max_retries or not _is_retryable_dashscope_error(exc.reason):
                    raise last_error from exc
            except (ssl.SSLError, TimeoutError, socket.timeout, ConnectionResetError, ConnectionAbortedError) as exc:
                last_error = RuntimeError(
                    format_dashscope_connection_error(self._base_url, exc, action="download")
                )
                if attempt >= self._max_retries or not _is_retryable_dashscope_error(exc):
                    raise last_error from exc

            await asyncio.sleep(self._retry_delay_seconds * attempt)

        if last_error is not None:
            raise last_error

        return b"", None
