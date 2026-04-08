"""
ComfyUI adapter.

Supports both plain text-to-image and reference-guided generation. When
identity lock is enabled and a reference image is available, the adapter uploads
the first reference image to ComfyUI and switches to a reference-image workflow
template to keep character features more stable.
"""
from __future__ import annotations

import asyncio
import json
import logging
import mimetypes
from pathlib import Path
from random import SystemRandom
from time import monotonic
from typing import Any, AsyncIterator
from urllib import error, parse, request
from uuid import uuid4

from .base import BaseAdapter, GenerateParams, ProgressUpdate

logger = logging.getLogger(__name__)

DIMENSION_MAP: dict[str, dict[str, tuple[int, int]]] = {
    "1K": {
        "1:1": (768, 768),
        "16:9": (1024, 576),
        "9:16": (576, 1024),
        "4:3": (960, 704),
        "3:4": (704, 960),
    },
    "2K": {
        "1:1": (1024, 1024),
        "16:9": (1344, 768),
        "9:16": (768, 1344),
        "4:3": (1152, 896),
        "3:4": (896, 1152),
    },
    "4K": {
        "1:1": (1536, 1536),
        "16:9": (1920, 1088),
        "9:16": (1088, 1920),
        "4:3": (1664, 1216),
        "3:4": (1216, 1664),
    },
}


class ComfyUIAdapter(BaseAdapter):
    """Adapter that talks to ComfyUI's HTTP API."""

    def __init__(
        self,
        base_url: str,
        poll_interval: float,
        timeout: float,
        negative_prompt: str,
        workflow_template: str | Path,
        reference_workflow_template: str | Path,
        upload_dir: str | Path,
        output_dir: str | Path,
    ):
        self._base_url = base_url.rstrip("/")
        self._poll_interval = poll_interval
        self._timeout = timeout
        self._negative_prompt = negative_prompt
        self._workflow_template = Path(workflow_template)
        self._reference_workflow_template = Path(reference_workflow_template)
        self._upload_dir = Path(upload_dir)
        self._output_dir = Path(output_dir)
        self._upload_dir.mkdir(parents=True, exist_ok=True)
        self._output_dir.mkdir(parents=True, exist_ok=True)
        self._random = SystemRandom()

    @property
    def name(self) -> str:
        return "comfyui"

    async def generate(self, params: GenerateParams) -> AsyncIterator[ProgressUpdate]:
        if params.task_type != "image":
            raise ValueError("ComfyUI adapter currently supports image tasks only")

        prompt = params.prompt.strip()
        if not prompt:
            raise ValueError("提示词不能为空")

        width, height = self._resolve_dimensions(params.aspect_ratio, params.resolution)
        filename_prefix = f"wxhb-{uuid4().hex[:12]}"
        client_id = f"wxhb-{uuid4().hex}"

        logger.info(
            "[ComfyUIAdapter] start prompt=%r aspect_ratio=%s resolution=%s width=%s height=%s refs=%s identity_lock=%s identity_strength=%.2f",
            prompt,
            params.aspect_ratio,
            params.resolution,
            width,
            height,
            len(params.reference_images or []),
            params.identity_lock,
            params.identity_strength,
        )

        yield ProgressUpdate(progress=5, status="processing", message="Preparing ComfyUI workflow")

        reference_name = None
        if params.identity_lock and params.reference_images:
            yield ProgressUpdate(progress=10, status="processing", message="Preparing reference image")
            reference_name = await self._prepare_reference_image(params.reference_images[0], filename_prefix)

        workflow_path = self._select_workflow_template(params, reference_name)
        if not workflow_path.exists():
            raise FileNotFoundError(f"ComfyUI workflow template not found: {workflow_path}")

        workflow = self._build_workflow(
            template_path=workflow_path,
            prompt=prompt,
            width=width,
            height=height,
            filename_prefix=filename_prefix,
            reference_name=reference_name,
            denoise=self._map_identity_strength_to_denoise(params.identity_strength),
        )

        response = await self._request_json(
            path="/prompt",
            method="POST",
            payload={"prompt": workflow, "client_id": client_id},
        )
        prompt_id = response.get("prompt_id")
        if not prompt_id:
            raise RuntimeError(f"ComfyUI did not return prompt_id: {response}")

        yield ProgressUpdate(progress=15, status="processing", message="Submitted to ComfyUI")

        started_at = monotonic()
        last_progress = -1

        while monotonic() - started_at < self._timeout:
            history = await self._request_json(path=f"/history/{parse.quote(str(prompt_id))}")
            history_entry = history.get(prompt_id) if isinstance(history, dict) else None

            if history_entry:
                error_message = self._extract_history_error(history_entry)
                if error_message:
                    raise RuntimeError(f"ComfyUI execution failed: {error_message}")

                output_image = self._extract_output_image(history_entry)
                if output_image:
                    yield ProgressUpdate(progress=92, status="processing", message="Downloading result image")
                    public_url = await self._download_output_image(output_image, filename_prefix)
                    logger.info("[ComfyUIAdapter] finished prompt_id=%s public_url=%s", prompt_id, public_url)
                    yield ProgressUpdate(
                        progress=100,
                        status="success",
                        message="Image generation completed",
                        output_image=public_url,
                    )
                    return

            elapsed = monotonic() - started_at
            progress = min(85, 20 + int((elapsed / self._timeout) * 65))
            if progress > last_progress:
                last_progress = progress
                yield ProgressUpdate(progress=progress, status="processing", message="ComfyUI is generating")

            await asyncio.sleep(self._poll_interval)

        raise TimeoutError(f"ComfyUI generation timed out (>{self._timeout:.0f}s)")

    async def health_check(self) -> bool:
        for path in ("/system_stats", "/queue"):
            try:
                await self._request_json(path=path)
                return True
            except Exception:
                continue
        return False

    def _resolve_dimensions(self, aspect_ratio: str, resolution: str) -> tuple[int, int]:
        resolution_map = DIMENSION_MAP.get(resolution, DIMENSION_MAP["2K"])
        return resolution_map.get(aspect_ratio, resolution_map["1:1"])

    def _select_workflow_template(self, params: GenerateParams, reference_name: str | None) -> Path:
        if params.identity_lock and reference_name and self._reference_workflow_template.exists():
            return self._reference_workflow_template
        return self._workflow_template

    def _build_workflow(
        self,
        *,
        template_path: Path,
        prompt: str,
        width: int,
        height: int,
        filename_prefix: str,
        reference_name: str | None,
        denoise: float,
    ) -> dict[str, Any]:
        template = json.loads(template_path.read_text(encoding="utf-8"))
        replacements: dict[str, Any] = {
            "__PROMPT__": prompt,
            "__NEGATIVE_PROMPT__": self._negative_prompt,
            "__WIDTH__": width,
            "__HEIGHT__": height,
            "__SEED__": self._random.randint(1, 2**31 - 1),
            "__FILENAME_PREFIX__": filename_prefix,
            "__REFERENCE_IMAGE__": reference_name or "",
            "__DENOISE__": denoise,
        }
        return self._replace_placeholders(template, replacements)

    def _replace_placeholders(self, value: Any, replacements: dict[str, Any]) -> Any:
        if isinstance(value, dict):
            return {key: self._replace_placeholders(item, replacements) for key, item in value.items()}
        if isinstance(value, list):
            return [self._replace_placeholders(item, replacements) for item in value]
        if isinstance(value, str):
            if value in replacements:
                return replacements[value]

            output = value
            for placeholder, replacement in replacements.items():
                if isinstance(replacement, str):
                    output = output.replace(placeholder, replacement)
            return output
        return value

    def _extract_output_image(self, history_entry: dict[str, Any]) -> dict[str, Any] | None:
        outputs = history_entry.get("outputs") or {}
        for node_output in outputs.values():
            if not isinstance(node_output, dict):
                continue
            images = node_output.get("images") or []
            for image in images:
                if isinstance(image, dict) and image.get("filename"):
                    return image
        return None

    def _extract_history_error(self, history_entry: dict[str, Any]) -> str | None:
        status = history_entry.get("status") or {}
        if not isinstance(status, dict):
            return None

        status_str = str(status.get("status_str") or "").lower()
        if status_str not in {"error", "failed"}:
            return None

        messages = status.get("messages") or []
        for message in reversed(messages):
            payload: Any
            if isinstance(message, (list, tuple)) and len(message) >= 2:
                payload = message[1]
            else:
                payload = message

            if isinstance(payload, dict):
                exception_message = payload.get("exception_message")
                if exception_message:
                    return str(exception_message)

                node_errors = payload.get("node_errors")
                if node_errors:
                    return json.dumps(node_errors, ensure_ascii=False)

                error_message = payload.get("error")
                if error_message:
                    return str(error_message)

            if isinstance(payload, str) and payload:
                return payload

        return status.get("status_str") or "unknown error"

    async def _prepare_reference_image(self, reference_url: str, filename_prefix: str) -> str:
        content, suffix = await self._load_reference_content(reference_url)
        uploaded_name = f"{self._sanitize_file_part(filename_prefix)}-reference{suffix}"
        upload_result = await self._upload_image_to_comfyui(uploaded_name, content, suffix)

        subfolder = str(upload_result.get("subfolder") or "").strip("/")
        filename = str(upload_result.get("name") or uploaded_name)
        return f"{subfolder}/{filename}" if subfolder else filename

    async def _load_reference_content(self, reference_url: str) -> tuple[bytes, str]:
        if reference_url.startswith("/uploads/"):
            local_path = self._upload_dir / Path(parse.unquote(reference_url.removeprefix("/uploads/"))).name
            return await self._read_local_bytes(local_path)

        if reference_url.startswith("/outputs/"):
            local_path = self._output_dir / Path(parse.unquote(reference_url.removeprefix("/outputs/"))).name
            return await self._read_local_bytes(local_path)

        if reference_url.startswith("http://") or reference_url.startswith("https://"):
            content = await self._download_bytes(reference_url)
            suffix = Path(parse.urlparse(reference_url).path).suffix or ".png"
            return content, suffix.lower()

        raise RuntimeError(f"Unsupported reference image URL: {reference_url}")

    async def _read_local_bytes(self, local_path: Path) -> tuple[bytes, str]:
        if not local_path.exists():
            raise FileNotFoundError(f"Reference image not found: {local_path}")
        content = await asyncio.to_thread(local_path.read_bytes)
        return content, local_path.suffix.lower() or ".png"

    async def _upload_image_to_comfyui(self, file_name: str, content: bytes, suffix: str) -> dict[str, Any]:
        mime_type = mimetypes.guess_type(file_name)[0] or "application/octet-stream"
        boundary = uuid4().hex
        body = bytearray()

        for field_name, field_value in {"type": "input", "overwrite": "true"}.items():
            body.extend(f"--{boundary}\r\n".encode("utf-8"))
            body.extend(f'Content-Disposition: form-data; name="{field_name}"\r\n\r\n'.encode("utf-8"))
            body.extend(str(field_value).encode("utf-8"))
            body.extend(b"\r\n")

        safe_file_name = Path(file_name).with_suffix(suffix).name
        body.extend(f"--{boundary}\r\n".encode("utf-8"))
        body.extend(
            f'Content-Disposition: form-data; name="image"; filename="{safe_file_name}"\r\n'.encode("utf-8")
        )
        body.extend(f"Content-Type: {mime_type}\r\n\r\n".encode("utf-8"))
        body.extend(content)
        body.extend(b"\r\n")
        body.extend(f"--{boundary}--\r\n".encode("utf-8"))

        return await self._request_json(
            path="/upload/image",
            method="POST",
            payload=bytes(body),
            headers={"Content-Type": f"multipart/form-data; boundary={boundary}"},
        )

    def _map_identity_strength_to_denoise(self, strength: float) -> float:
        clamped_strength = max(0.0, min(1.0, strength))
        denoise = 0.9 - clamped_strength * 0.6
        return round(max(0.2, min(0.85, denoise)), 2)

    async def _download_output_image(self, image_meta: dict[str, Any], filename_prefix: str) -> str:
        query = {
            "filename": str(image_meta.get("filename", "")),
            "type": str(image_meta.get("type", "output")),
        }
        subfolder = image_meta.get("subfolder")
        if subfolder:
            query["subfolder"] = str(subfolder)

        download_url = f"{self._base_url}/view?{parse.urlencode(query)}"
        content = await self._download_bytes(download_url)

        original_name = Path(str(image_meta.get("filename") or "output.png"))
        stem = self._sanitize_file_part(original_name.stem)
        suffix = original_name.suffix or ".png"
        local_name = f"{self._sanitize_file_part(filename_prefix)}-{stem}{suffix}"
        local_path = self._output_dir / local_name

        await asyncio.to_thread(local_path.write_bytes, content)
        return f"/outputs/{parse.quote(local_name)}"

    async def _request_json(
        self,
        *,
        path: str,
        method: str = "GET",
        payload: dict[str, Any] | bytes | None = None,
        headers: dict[str, str] | None = None,
    ) -> dict[str, Any]:
        def _do_request() -> dict[str, Any]:
            url = f"{self._base_url}{path}"
            data: bytes | None = None
            request_headers = {"Accept": "application/json"}
            if headers:
                request_headers.update(headers)

            if payload is not None:
                if isinstance(payload, bytes):
                    data = payload
                else:
                    data = json.dumps(payload).encode("utf-8")
                    request_headers.setdefault("Content-Type", "application/json")

            req = request.Request(url, data=data, method=method, headers=request_headers)
            try:
                with request.urlopen(req, timeout=self._timeout) as response:
                    body = response.read().decode("utf-8")
            except error.HTTPError as exc:
                error_body = exc.read().decode("utf-8", errors="ignore")
                raise RuntimeError(
                    f"ComfyUI request failed: HTTP {exc.code} {error_body or exc.reason}"
                ) from exc
            except error.URLError as exc:
                raise RuntimeError(f"Cannot reach ComfyUI: {exc.reason}") from exc

            if not body:
                return {}
            return json.loads(body)

        return await asyncio.to_thread(_do_request)

    async def _download_bytes(self, url: str) -> bytes:
        def _do_download() -> bytes:
            req = request.Request(url, method="GET")
            try:
                with request.urlopen(req, timeout=self._timeout) as response:
                    return response.read()
            except error.HTTPError as exc:
                error_body = exc.read().decode("utf-8", errors="ignore")
                raise RuntimeError(
                    f"ComfyUI download failed: HTTP {exc.code} {error_body or exc.reason}"
                ) from exc
            except error.URLError as exc:
                raise RuntimeError(f"Cannot download ComfyUI result: {exc.reason}") from exc

        return await asyncio.to_thread(_do_download)

    def _sanitize_file_part(self, value: str) -> str:
        sanitized = "".join(char if char.isalnum() or char in {"-", "_"} else "-" for char in value)
        sanitized = sanitized.strip("-_")
        return sanitized[:80] or "output"
