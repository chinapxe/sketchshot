"""
Utilities for splitting a three-view sheet into standalone assets.
"""
from __future__ import annotations

from pathlib import Path
from statistics import fmean
from urllib.parse import quote, unquote
from uuid import uuid4

from PIL import Image


THREE_VIEW_SLOT_ORDER = ("front", "side", "back")


class ThreeViewSplitService:
    """Split a three-view sheet image into front / side / back assets."""

    def __init__(self, *, upload_dir: str | Path, output_dir: str | Path):
        self._upload_dir = Path(upload_dir)
        self._output_dir = Path(output_dir)
        self._upload_dir.mkdir(parents=True, exist_ok=True)
        self._output_dir.mkdir(parents=True, exist_ok=True)

    def split_sheet(self, asset_url: str) -> dict[str, str]:
        source_path = self._resolve_local_asset_path(asset_url)
        if source_path is None or not source_path.exists():
            raise FileNotFoundError(f"Three-view source asset not found: {asset_url}")

        with Image.open(source_path) as source_image:
            image = source_image.convert("RGBA")
            panel_boxes = self._detect_panel_boxes(image)
            return {
                slot: self._save_panel_crop(image.crop(panel_boxes[index]), slot)
                for index, slot in enumerate(THREE_VIEW_SLOT_ORDER)
            }

    def _save_panel_crop(self, image: Image.Image, slot: str) -> str:
        file_name = f"three-view-{slot}-{uuid4().hex[:12]}.png"
        target_path = self._output_dir / file_name
        image.save(target_path, format="PNG")
        return f"/outputs/{quote(file_name)}"

    def _resolve_local_asset_path(self, asset_url: str) -> Path | None:
        clean_url = asset_url.split("#", 1)[0]

        if clean_url.startswith("/uploads/"):
            return self._upload_dir / Path(unquote(clean_url.removeprefix("/uploads/"))).name

        if clean_url.startswith("/outputs/"):
            return self._output_dir / Path(unquote(clean_url.removeprefix("/outputs/"))).name

        candidate = Path(clean_url)
        if candidate.exists():
            return candidate

        return None

    def _detect_panel_boxes(self, image: Image.Image) -> list[tuple[int, int, int, int]]:
        width, height = image.size
        pixels = image.load()
        background_rgb = self._estimate_background_rgb(image)

        def is_foreground(x: int, y: int) -> bool:
            r, g, b, alpha = pixels[x, y]
            if alpha <= 16:
                return False

            return max(abs(r - background_rgb[0]), abs(g - background_rgb[1]), abs(b - background_rgb[2])) > 18

        column_scores = []
        for x in range(width):
            foreground_count = 0
            for y in range(height):
                if is_foreground(x, y):
                    foreground_count += 1
            column_scores.append(foreground_count)

        column_threshold = max(10, int(height * 0.01))
        runs = self._find_runs(column_scores, column_threshold, min_width=max(24, int(width * 0.08)))
        if len(runs) != 3:
            raise ValueError("Could not detect exactly three view panels from generated sheet")

        panel_boxes: list[tuple[int, int, int, int]] = []
        horizontal_margin = max(8, int(width * 0.02))
        vertical_margin = max(8, int(height * 0.02))

        for left, right in runs:
            row_scores = []
            for y in range(height):
                foreground_count = 0
                for x in range(left, right + 1):
                    if is_foreground(x, y):
                        foreground_count += 1
                row_scores.append(foreground_count)

            row_threshold = max(8, int((right - left + 1) * 0.02))
            row_runs = self._find_runs(row_scores, row_threshold, min_width=max(24, int(height * 0.08)))
            if not row_runs:
                raise ValueError("Could not detect foreground rows for three-view panel")

            top = row_runs[0][0]
            bottom = row_runs[-1][1]
            crop_box = (
                max(0, left - horizontal_margin),
                max(0, top - vertical_margin),
                min(width, right + horizontal_margin + 1),
                min(height, bottom + vertical_margin + 1),
            )
            panel_boxes.append(crop_box)

        return panel_boxes

    def _estimate_background_rgb(self, image: Image.Image) -> tuple[float, float, float]:
        width, height = image.size
        pixels = image.load()
        sample_points = [
          (0, 0),
          (max(0, width - 1), 0),
          (0, max(0, height - 1)),
          (max(0, width - 1), max(0, height - 1)),
        ]
        samples = [pixels[x, y] for x, y in sample_points]
        return (
            fmean(sample[0] for sample in samples),
            fmean(sample[1] for sample in samples),
            fmean(sample[2] for sample in samples),
        )

    def _find_runs(self, values: list[int], threshold: int, *, min_width: int) -> list[tuple[int, int]]:
        runs: list[tuple[int, int]] = []
        start_index: int | None = None

        for index, value in enumerate(values):
            if value > threshold:
                if start_index is None:
                    start_index = index
                continue

            if start_index is not None:
                if index - start_index >= min_width:
                    runs.append((start_index, index - 1))
                start_index = None

        if start_index is not None and len(values) - start_index >= min_width:
            runs.append((start_index, len(values) - 1))

        return runs
