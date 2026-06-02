"""
Minimal Volcengine OpenAPI client with HMAC-SHA256 Signature V4.

Used for management-plane APIs (e.g. ListMediaAssetGroup) that require
IAM Access Key / Secret Key instead of Ark inference API Key.
"""
from __future__ import annotations

import hashlib
import hmac
import json
import logging
from datetime import datetime, timezone
from typing import Any
from urllib import error, request
from urllib.parse import quote

logger = logging.getLogger(__name__)

OPENAPI_HOST = "open.volcengineapi.com"


def _sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def _hmac_sha256(key: bytes, msg: str | bytes) -> bytes:
    if isinstance(msg, str):
        msg = msg.encode("utf-8")
    return hmac.new(key, msg, hashlib.sha256).digest()


def _sign_request(
    *,
    access_key: str,
    secret_key: str,
    method: str,
    path: str,
    query: str,
    headers: dict[str, str],
    body: bytes,
    region: str,
    service: str,
) -> dict[str, str]:
    """Add Volcengine HMAC-SHA256 Signature V4 headers."""
    now = datetime.now(timezone.utc)
    date_stamp = now.strftime("%Y%m%d")
    timestamp = now.strftime("%Y%m%dT%H%M%SZ")
    credential_scope = f"{date_stamp}/{region}/{service}/request"

    headers["Host"] = OPENAPI_HOST
    headers["X-Date"] = timestamp
    if body:
        headers["X-Content-Sha256"] = _sha256(body)

    # Build signed headers list (lowercase, sorted)
    signed_header_names = sorted(k.lower() for k in headers)
    signed_headers_str = ";".join(signed_header_names)

    # Canonical headers
    canonical_headers = "".join(
        f"{k.lower()}:{headers[k].strip()}\n" for k in sorted(headers, key=str.lower)
    )

    # Canonical query string (already sorted by caller)
    canonical_query = query

    hashed_payload = _sha256(body) if body else _sha256(b"")
    canonical_request = (
        f"{method}\n{path}\n{canonical_query}\n{canonical_headers}\n"
        f"{signed_headers_str}\n{hashed_payload}"
    )

    string_to_sign = (
        f"HMAC-SHA256\n{timestamp}\n{credential_scope}\n"
        f"{_sha256(canonical_request.encode('utf-8'))}"
    )

    # Derive signing key
    k_date = _hmac_sha256(secret_key.encode("utf-8"), date_stamp)
    k_region = _hmac_sha256(k_date, region)
    k_service = _hmac_sha256(k_region, service)
    k_signing = _hmac_sha256(k_service, "request")
    signature = hmac.new(k_signing, string_to_sign.encode("utf-8"), hashlib.sha256).hexdigest()

    headers["Authorization"] = (
        f"HMAC-SHA256 Credential={access_key}/{credential_scope}, "
        f"SignedHeaders={signed_headers_str}, Signature={signature}"
    )

    logger.debug(
        "[volcengine-openapi] signed %s %s, headers=%s",
        method, path, signed_headers_str,
    )
    return headers


class VolcengineOpenApiClient:
    """Minimal client for Volcengine management-plane OpenAPI."""

    def __init__(
        self,
        *,
        access_key: str,
        secret_key: str,
        region: str = "cn-beijing",
        timeout: float = 30.0,
    ):
        self._access_key = access_key
        self._secret_key = secret_key
        self._region = region
        self._timeout = timeout

    @property
    def is_configured(self) -> bool:
        return bool(self._access_key.strip() and self._secret_key.strip())

    def call(
        self,
        *,
        action: str,
        version: str = "2024-01-01",
        service: str = "ark",
        body: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        """Make a signed OpenAPI call."""
        if not self.is_configured:
            raise RuntimeError("Volcengine IAM credentials not configured")

        method = "POST"
        path = "/"
        query = f"Action={quote(action)}&Version={quote(version)}"

        payload_bytes = json.dumps(body or {}, ensure_ascii=False).encode("utf-8")

        headers = {
            "Content-Type": "application/json",
        }
        headers = _sign_request(
            access_key=self._access_key,
            secret_key=self._secret_key,
            method=method,
            path=path,
            query=query,
            headers=headers,
            body=payload_bytes,
            region=self._region,
            service=service,
        )

        url = f"https://{OPENAPI_HOST}/?{query}"
        req = request.Request(url, data=payload_bytes, method=method, headers=headers)

        try:
            with request.urlopen(req, timeout=self._timeout) as resp:
                raw = resp.read().decode("utf-8")
                result = json.loads(raw) if raw else {}
        except error.HTTPError as exc:
            err_body = exc.read().decode("utf-8", errors="ignore")
            raise RuntimeError(
                f"Volcengine OpenAPI error: HTTP {exc.code} {err_body}"
            ) from exc
        except error.URLError as exc:
            raise RuntimeError(
                f"Volcengine OpenAPI connection error: {exc.reason}"
            ) from exc

        response_meta = result.get("ResponseMetadata", {})
        error_info = response_meta.get("Error", {})
        if error_info:
            raise RuntimeError(
                f"Volcengine OpenAPI {action} failed: "
                f"{error_info.get('Code', '')} - {error_info.get('Message', '')}"
            )

        return result
