"""
Service for fetching official virtual human portrait thumbnails from Volcengine.

Uses the Volcengine OpenAPI (ListMediaAssetGroup) to get fresh presigned
thumbnail URLs, which expire after ~12 hours. Results are cached in-memory.
"""
from __future__ import annotations

import asyncio
import logging
import time
from pathlib import Path
from typing import Any

from .volcengine_openapi_client import VolcengineOpenApiClient

logger = logging.getLogger(__name__)

CACHE_TTL_SECONDS = 3600  # Refresh thumbnails every hour


class MediaAssetService:
    """Fetch and cache official virtual human portrait thumbnails."""

    def __init__(self, *, client: VolcengineOpenApiClient):
        self._client = client
        self._cache: dict[str, str] = {}
        self._cache_time: float = 0.0

    @property
    def is_configured(self) -> bool:
        return self._client.is_configured

    async def get_thumbnails(self, asset_ids: list[str]) -> dict[str, str]:
        """Return a mapping of asset_id → thumbnail URL for the given IDs.

        Calls ListMediaAssetGroup if cache is stale, then filters by asset_ids.
        """
        if not self.is_configured:
            return {}

        now = time.time()
        if self._cache and (now - self._cache_time) < CACHE_TTL_SECONDS:
            return {k: v for k, v in self._cache.items() if k in asset_ids}

        try:
            fresh = await self._fetch_thumbnails(asset_ids)
            self._cache.update(fresh)
            self._cache_time = now
            return {k: v for k, v in self._cache.items() if k in asset_ids}
        except Exception:
            logger.exception("[media-asset] Failed to refresh thumbnails")
            # Return stale cache if available
            return {k: v for k, v in self._cache.items() if k in asset_ids}

    async def _fetch_thumbnails(self, asset_ids: list[str]) -> dict[str, str]:
        """Call ListMediaAssetGroup and extract thumbnail URLs."""
        result: dict[str, str] = {}

        response = await asyncio.to_thread(
            self._client.call,
            action="ListMediaAssetGroup",
            version="2024-01-01",
            service="ark",
            body={"PageSize": 100, "PageNum": 1},
        )

        items: list[dict[str, Any]] = response.get("Result", {}).get("Items", [])
        logger.info("[media-asset] ListMediaAssetGroup returned %d items", len(items))

        for item in items:
            group = item.get("AssetGroup", {})
            content = group.get("Content", {})
            images = content.get("Image", [])
            if images:
                asset_id = images[0].get("AssetID", "")
                url = images[0].get("URL", "")
                if asset_id and url:
                    result[asset_id] = url

        logger.info("[media-asset] Resolved %d/%d thumbnails", len(result), len(asset_ids))
        return result
