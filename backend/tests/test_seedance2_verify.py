"""
Seedance 2.0 端到端验证脚本

用于：
1. 验证 API schema 正确接收全部 2.0 参数（P0-7/P1-1~4/P2-1/P3-1）
2. 验证 payload 构建逻辑（P0-2~4/P1-3/P2-2/P3-1）
3. 验证响应解析逻辑（末帧提取 P3-2）
4. 可选：向真实火山 API 提交验证（需配置 ARK_API_KEY）

用法：
  python -m pytest tests/test_seedance2_verify.py -v          # 仅单元测试
  python tests/test_seedance2_verify.py --live                 # 真实 API 验证
"""
from __future__ import annotations

import json
import os
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Any

# Adjust path to import from app
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import pytest


# ============================================================
# Section 1: Schema verification
# ============================================================

class TestSchema:
    """Verify VideoGenerateRequest accepts all Seedance 2.0 fields (P0-7)."""

    def test_basic_v2_request(self):
        """Basic request with seedance_version=2.0 is accepted."""
        from app.models.schemas import VideoGenerateRequest

        req = VideoGenerateRequest(
            node_id="n1",
            prompt="test",
            seedance_version="2.0",
            adapter="volcengine",
        )
        assert req.seedance_version == "2.0"

    def test_full_v2_parameters(self):
        """All 17 Seedance 2.0 fields are accepted."""
        from app.models.schemas import VideoGenerateRequest

        req = VideoGenerateRequest(
            node_id="n1",
            prompt="a robot dancing",
            seedance_version="2.0",
            generate_audio=True,
            video_resolution="1080p",
            negative_prompt="blurry, low quality",
            seed=42,
            camera_fixed=True,
            video_model_tier="standard",
            return_last_frame=True,
            duration_seconds=10,
            source_images=["/img1.png", "/img2.png"],
            reference_videos=["/vid1.mp4"],
            reference_audios=["/aud1.mp3"],
            multi_image_role="transition",
            adapter="volcengine",
            task_type="video",
        )
        assert req.seedance_version == "2.0"
        assert req.generate_audio is True
        assert req.video_resolution == "1080p"
        assert req.negative_prompt == "blurry, low quality"
        assert req.seed == 42
        assert req.camera_fixed is True
        assert req.video_model_tier == "standard"
        assert req.return_last_frame is True
        assert req.reference_videos == ["/vid1.mp4"]
        assert req.reference_audios == ["/aud1.mp3"]
        assert req.multi_image_role == "transition"

    def test_v2_defaults_backward_compatible(self):
        """Old requests without 2.0 fields use defaults, not crash."""
        from app.models.schemas import VideoGenerateRequest

        req = VideoGenerateRequest(
            node_id="n1",
            prompt="test",
        )
        assert req.seedance_version == ""
        assert req.generate_audio is True
        assert req.video_resolution == "720p"
        assert req.negative_prompt == ""
        assert req.seed == -1
        assert req.camera_fixed is False
        assert req.video_model_tier == "standard"
        assert req.return_last_frame is False
        assert req.reference_videos == []
        assert req.reference_audios == []
        assert req.multi_image_role == "transition"

    def test_seedance_version_json_key(self):
        """The JSON key sent from frontend is 'seedance_version'."""
        from app.models.schemas import VideoGenerateRequest

        # Simulate what the frontend sends
        raw = json.dumps({
            "node_id": "n1",
            "prompt": "test",
            "seedance_version": "2.0",
        })
        req = VideoGenerateRequest.model_validate_json(raw)
        assert req.seedance_version == "2.0"

    def test_video_edit_schema_has_seedance_version(self):
        """VideoEditGenerateRequest accepts seedance_version (P4-3)."""
        from app.models.schemas import VideoEditGenerateRequest

        req = VideoEditGenerateRequest(
            node_id="n1",
            prompt="make it night",
            source_video="/vid.mp4",
            seedance_version="2.0",
        )
        assert req.seedance_version == "2.0"


# ============================================================
# Section 2: GenerateParams construction (API → adapter boundary)
# ============================================================

class TestGenerateParamsMapping:
    """Verify generate.py maps schema fields to GenerateParams correctly."""

    def test_api_route_maps_seedance_version(self):
        """The /api/generate/video handler passes seedance_version to GenerateParams."""
        from app.adapters.base import GenerateParams
        from app.models.schemas import VideoGenerateRequest

        req = VideoGenerateRequest(
            node_id="n1", prompt="test", seedance_version="2.0",
            adapter="volcengine",
        )
        # This mirrors what generate.py:69-88 does
        params = GenerateParams(
            task_type=req.task_type,
            prompt=req.prompt,
            aspect_ratio=req.aspect_ratio,
            source_images=req.source_images or [],
            reference_images=req.reference_images or [],
            duration_seconds=req.duration_seconds,
            motion_strength=req.motion_strength,
            video_version=req.seedance_version,
            generate_audio=req.generate_audio,
            video_resolution=req.video_resolution,
            negative_prompt=req.negative_prompt,
            seed=req.seed,
            camera_fixed=req.camera_fixed,
            video_model_tier=req.video_model_tier,
            return_last_frame=req.return_last_frame,
            reference_videos=req.reference_videos or [],
            reference_audios=req.reference_audios or [],
            multi_image_role=req.multi_image_role or "transition",
        )
        assert params.video_version == "2.0"
        assert params.generate_audio is True


# ============================================================
# Section 3: Payload building logic
# ============================================================

class TestV2PayloadBuilding:
    """Verify _build_v2_video_payload constructs correct payload (P0-2~4, P1-3, P2-2, P3-1)."""

    @pytest.fixture
    def params(self):
        from app.adapters.base import GenerateParams
        return GenerateParams(
            task_type="video",
            prompt="test prompt",
            source_images=["/img1.png", "/img2.png", "/img3.png"],
            video_version="2.0",
            generate_audio=True,
            video_resolution="720p",
            negative_prompt="bad quality",
            seed=42,
            camera_fixed=True,
            video_model_tier="standard",
            return_last_frame=True,
            duration_seconds=5,
            aspect_ratio="16:9",
            reference_videos=["/vid1.mp4"],
            reference_audios=["/aud1.mp3"],
            multi_image_role="transition",
        )

    def test_model_id_standard(self):
        """standard tier uses _video_v2_model."""
        from app.adapters.volcengine_adapter import VolcengineAdapter
        adapter = VolcengineAdapter(
            client=self._mock_client(),
            upload_dir="/tmp", output_dir="/tmp",
            image_model="", image_edit_model="",
            video_model="",
            video_v2_model="doubao-seedance-2-0-260128",
            video_v2_fast_model="doubao-seedance-2-0-fast-260128",
            video_version="2.0",
            poll_interval=1, video_timeout=60,
        )
        payload = adapter._build_v2_video_payload("test", ["/img.png"], self._params("standard"))
        assert payload["model"] == "doubao-seedance-2-0-260128"

    def test_model_id_fast(self):
        """fast tier uses _video_v2_fast_model."""
        from app.adapters.volcengine_adapter import VolcengineAdapter
        adapter = VolcengineAdapter(
            client=self._mock_client(),
            upload_dir="/tmp", output_dir="/tmp",
            image_model="", image_edit_model="",
            video_model="",
            video_v2_model="doubao-seedance-2-0-260128",
            video_v2_fast_model="doubao-seedance-2-0-fast-260128",
            video_version="2.0",
            poll_interval=1, video_timeout=60,
        )
        payload = adapter._build_v2_video_payload("test", ["/img.png"], self._params("fast"))
        assert payload["model"] == "doubao-seedance-2-0-fast-260128"

    def test_fast_1080p_downgrades_to_720p(self):
        """fast tier with 1080p automatically downgrades to 720p."""
        from app.adapters.volcengine_adapter import VolcengineAdapter
        adapter = VolcengineAdapter(
            client=self._mock_client(),
            upload_dir="/tmp", output_dir="/tmp",
            image_model="", image_edit_model="",
            video_model="",
            video_v2_model="x", video_v2_fast_model="y",
            video_version="2.0",
            poll_interval=1, video_timeout=60,
        )
        params = self._params("fast")
        params.video_resolution = "1080p"
        payload = adapter._build_v2_video_payload("test", ["/img.png"], params)
        assert payload["resolution"] == "720p", "fast tier must downgrade 1080p to 720p"

    def test_image_role_single(self):
        """1 image → reference_image."""
        from app.adapters.volcengine_adapter import VolcengineAdapter
        adapter = VolcengineAdapter(
            client=self._mock_client(),
            upload_dir="/tmp", output_dir="/tmp",
            image_model="", image_edit_model="",
            video_model="",
            video_v2_model="x", video_v2_fast_model="y",
            video_version="2.0",
            poll_interval=1, video_timeout=60,
        )
        payload = adapter._build_v2_video_payload("test", ["/img.png"], self._params("standard"))
        roles = [c.get("role") for c in payload["content"] if c.get("type") == "image_url"]
        assert roles == ["reference_image"]

    def test_image_role_two_images(self):
        """2 images → first_frame + last_frame (P0-2)."""
        from app.adapters.volcengine_adapter import VolcengineAdapter
        adapter = VolcengineAdapter(
            client=self._mock_client(),
            upload_dir="/tmp", output_dir="/tmp",
            image_model="", image_edit_model="",
            video_model="",
            video_v2_model="x", video_v2_fast_model="y",
            video_version="2.0",
            poll_interval=1, video_timeout=60,
        )
        payload = adapter._build_v2_video_payload("test", ["/a.png", "/b.png"], self._params("standard"))
        roles = [c.get("role") for c in payload["content"] if c.get("type") == "image_url"]
        assert roles == ["first_frame", "last_frame"]

    def test_image_role_three_images(self):
        """3 images → first_frame + reference_image + last_frame."""
        from app.adapters.volcengine_adapter import VolcengineAdapter
        adapter = VolcengineAdapter(
            client=self._mock_client(),
            upload_dir="/tmp", output_dir="/tmp",
            image_model="", image_edit_model="",
            video_model="",
            video_v2_model="x", video_v2_fast_model="y",
            video_version="2.0",
            poll_interval=1, video_timeout=60,
        )
        payload = adapter._build_v2_video_payload("test", ["/a.png", "/b.png", "/c.png"], self._params("standard"))
        roles = [c.get("role") for c in payload["content"] if c.get("type") == "image_url"]
        assert roles == ["first_frame", "reference_image", "last_frame"]

    def test_r2v_mode_all_images_reference(self):
        """reference_video present → all images become reference_image (C1)."""
        from app.adapters.volcengine_adapter import VolcengineAdapter
        adapter = VolcengineAdapter(
            client=self._mock_client(),
            upload_dir="/tmp", output_dir="/tmp",
            image_model="", image_edit_model="",
            video_model="",
            video_v2_model="x", video_v2_fast_model="y",
            video_version="2.0",
            poll_interval=1, video_timeout=60,
        )
        params = self._params("standard")
        params.reference_videos = ["https://example.com/vid.mp4"]  # triggers r2v mode
        payload = adapter._build_v2_video_payload("test", ["/a.png", "/b.png"], params)
        roles = [c.get("role") for c in payload["content"] if c.get("type") == "image_url"]
        assert all(r == "reference_image" for r in roles), "r2v mode: all images must be reference_image"

    def test_reference_video_role(self):
        """reference_video adds video_url with role reference_video (P2-2)."""
        from app.adapters.volcengine_adapter import VolcengineAdapter
        adapter = VolcengineAdapter(
            client=self._mock_client(),
            upload_dir="/tmp", output_dir="/tmp",
            image_model="", image_edit_model="",
            video_model="",
            video_v2_model="x", video_v2_fast_model="y",
            video_version="2.0",
            poll_interval=1, video_timeout=60,
        )
        params = self._params("standard")
        params.reference_videos = ["https://example.com/vid.mp4"]
        payload = adapter._build_v2_video_payload("test", ["/img.png"], params)
        videos = [c for c in payload["content"] if c.get("type") == "video_url"]
        assert len(videos) == 1
        assert videos[0]["role"] == "reference_video"

    def test_reference_audio_role(self):
        """reference_audio adds audio_url with role reference_audio."""
        from app.adapters.volcengine_adapter import VolcengineAdapter
        adapter = VolcengineAdapter(
            client=self._mock_client(),
            upload_dir="/tmp", output_dir="/tmp",
            image_model="", image_edit_model="",
            video_model="",
            video_v2_model="x", video_v2_fast_model="y",
            video_version="2.0",
            poll_interval=1, video_timeout=60,
        )
        params = self._params("standard")
        params.reference_audios = ["https://example.com/aud.mp3"]
        payload = adapter._build_v2_video_payload("test", ["/img.png"], params)
        audios = [c for c in payload["content"] if c.get("type") == "audio_url"]
        assert len(audios) == 1
        assert audios[0]["role"] == "reference_audio"

    def test_generate_audio_true(self):
        """generate_audio=True → payload has generate_audio: true (P0-3)."""
        from app.adapters.volcengine_adapter import VolcengineAdapter
        adapter = VolcengineAdapter(
            client=self._mock_client(),
            upload_dir="/tmp", output_dir="/tmp",
            image_model="", image_edit_model="",
            video_model="",
            video_v2_model="x", video_v2_fast_model="y",
            video_version="2.0",
            poll_interval=1, video_timeout=60,
        )
        params = self._params("standard")
        params.generate_audio = True
        payload = adapter._build_v2_video_payload("test", ["/img.png"], params)
        assert payload["generate_audio"] is True

    def test_generate_audio_false(self):
        """generate_audio=False → payload has generate_audio: false."""
        from app.adapters.volcengine_adapter import VolcengineAdapter
        adapter = VolcengineAdapter(
            client=self._mock_client(),
            upload_dir="/tmp", output_dir="/tmp",
            image_model="", image_edit_model="",
            video_model="",
            video_v2_model="x", video_v2_fast_model="y",
            video_version="2.0",
            poll_interval=1, video_timeout=60,
        )
        params = self._params("standard")
        params.generate_audio = False
        payload = adapter._build_v2_video_payload("test", ["/img.png"], params)
        assert payload["generate_audio"] is False

    def test_video_resolution_in_payload(self):
        """video_resolution appears in payload as resolution (P0-4)."""
        from app.adapters.volcengine_adapter import VolcengineAdapter
        adapter = VolcengineAdapter(
            client=self._mock_client(),
            upload_dir="/tmp", output_dir="/tmp",
            image_model="", image_edit_model="",
            video_model="",
            video_v2_model="x", video_v2_fast_model="y",
            video_version="2.0",
            poll_interval=1, video_timeout=60,
        )
        params = self._params("standard")
        params.video_resolution = "1080p"
        payload = adapter._build_v2_video_payload("test", ["/img.png"], params)
        assert payload["resolution"] == "1080p"

    def test_negative_prompt_in_payload(self):
        """non-empty negative_prompt adds field to payload (P1-1)."""
        from app.adapters.volcengine_adapter import VolcengineAdapter
        adapter = VolcengineAdapter(
            client=self._mock_client(),
            upload_dir="/tmp", output_dir="/tmp",
            image_model="", image_edit_model="",
            video_model="",
            video_v2_model="x", video_v2_fast_model="y",
            video_version="2.0",
            poll_interval=1, video_timeout=60,
        )
        params = self._params("standard")
        params.negative_prompt = "blurry, low quality"
        payload = adapter._build_v2_video_payload("test", ["/img.png"], params)
        assert payload["negative_prompt"] == "blurry, low quality"

    def test_seed_in_payload(self):
        """seed >= 0 adds seed field to payload (P1-2)."""
        from app.adapters.volcengine_adapter import VolcengineAdapter
        adapter = VolcengineAdapter(
            client=self._mock_client(),
            upload_dir="/tmp", output_dir="/tmp",
            image_model="", image_edit_model="",
            video_model="",
            video_v2_model="x", video_v2_fast_model="y",
            video_version="2.0",
            poll_interval=1, video_timeout=60,
        )
        params = self._params("standard")
        params.seed = 42
        payload = adapter._build_v2_video_payload("test", ["/img.png"], params)
        assert payload["seed"] == 42

    def test_seed_negative_omitted(self):
        """seed == -1 omits seed field (random)."""
        from app.adapters.volcengine_adapter import VolcengineAdapter
        adapter = VolcengineAdapter(
            client=self._mock_client(),
            upload_dir="/tmp", output_dir="/tmp",
            image_model="", image_edit_model="",
            video_model="",
            video_v2_model="x", video_v2_fast_model="y",
            video_version="2.0",
            poll_interval=1, video_timeout=60,
        )
        params = self._params("standard")
        params.seed = -1
        payload = adapter._build_v2_video_payload("test", ["/img.png"], params)
        assert "seed" not in payload

    def test_camera_fixed_excluded_for_i2v(self):
        """camera_fixed is NOT included in i2v/r2v payload — API rejects it for r2v mode."""
        from app.adapters.volcengine_adapter import VolcengineAdapter
        adapter = VolcengineAdapter(
            client=self._mock_client(),
            upload_dir="/tmp", output_dir="/tmp",
            image_model="", image_edit_model="",
            video_model="",
            video_v2_model="x", video_v2_fast_model="y",
            video_version="2.0",
            poll_interval=1, video_timeout=60,
        )
        params = self._params("standard")
        params.camera_fixed = True
        payload = adapter._build_v2_video_payload("test", ["/img.png"], params)
        assert "camera_fixed" not in payload, "r2v mode does not support camera_fixed"
        assert "--camerafixed" not in (payload["content"][0].get("text") or ""), "must not inject into prompt string"

    def test_return_last_frame_in_payload(self):
        """return_last_frame adds field to payload (P3-1)."""
        from app.adapters.volcengine_adapter import VolcengineAdapter
        adapter = VolcengineAdapter(
            client=self._mock_client(),
            upload_dir="/tmp", output_dir="/tmp",
            image_model="", image_edit_model="",
            video_model="",
            video_v2_model="x", video_v2_fast_model="y",
            video_version="2.0",
            poll_interval=1, video_timeout=60,
        )
        params = self._params("standard")
        params.return_last_frame = True
        payload = adapter._build_v2_video_payload("test", ["/img.png"], params)
        assert payload["return_last_frame"] is True

    def test_b1_policy_video(self):
        """B1 policy: only first reference_video is sent when >1 provided (P2-2)."""
        from app.adapters.volcengine_adapter import VolcengineAdapter
        adapter = VolcengineAdapter(
            client=self._mock_client(),
            upload_dir="/tmp", output_dir="/tmp",
            image_model="", image_edit_model="",
            video_model="",
            video_v2_model="x", video_v2_fast_model="y",
            video_version="2.0",
            poll_interval=1, video_timeout=60,
        )
        params = self._params("standard")
        params.reference_videos = ["https://example.com/v1.mp4", "https://example.com/v2.mp4", "https://example.com/v3.mp4"]
        payload = adapter._build_v2_video_payload("test", ["/img.png"], params)
        videos = [c for c in payload["content"] if c.get("type") == "video_url"]
        assert len(videos) == 1, "B1 policy: at most 1 reference_video"

    def test_b1_policy_audio(self):
        """B1 policy: only first reference_audio is sent when >1 provided."""
        from app.adapters.volcengine_adapter import VolcengineAdapter
        adapter = VolcengineAdapter(
            client=self._mock_client(),
            upload_dir="/tmp", output_dir="/tmp",
            image_model="", image_edit_model="",
            video_model="",
            video_v2_model="x", video_v2_fast_model="y",
            video_version="2.0",
            poll_interval=1, video_timeout=60,
        )
        params = self._params("standard")
        params.reference_audios = ["https://example.com/a1.mp3", "https://example.com/a2.mp3"]
        payload = adapter._build_v2_video_payload("test", ["/img.png"], params)
        audios = [c for c in payload["content"] if c.get("type") == "audio_url"]
        assert len(audios) == 1, "B1 policy: at most 1 reference_audio"

    def _params(self, tier: str):
        from app.adapters.base import GenerateParams
        return GenerateParams(
            task_type="video", prompt="test",
            generate_audio=True, video_version="2.0",
            video_model_tier=tier,
            duration_seconds=5, aspect_ratio="16:9",
        )

    def _mock_client(self):
        class MockClient:
            is_configured = True
        return MockClient()


# ============================================================
# Section 4: Response parsing logic
# ============================================================

class TestLastFrameExtraction:
    """Verify _extract_last_frame_url handles various response formats (P3-2)."""

    @pytest.fixture
    def adapter(self):
        from app.adapters.volcengine_adapter import VolcengineAdapter
        adapter = VolcengineAdapter(
            client=type("MC", (), {"is_configured": True})(),
            upload_dir="/tmp", output_dir="/tmp",
            image_model="", image_edit_model="",
            video_model="",
            video_v2_model="x", video_v2_fast_model="y",
            video_version="2.0",
            poll_interval=1, video_timeout=60,
        )
        return adapter

    def test_last_frame_at_root(self, adapter):
        """last_frame_url at response root."""
        resp = {"last_frame_url": "https://example.com/frame.png"}
        assert adapter._extract_last_frame_url(resp) == "https://example.com/frame.png"

    def test_last_frame_in_results(self, adapter):
        """last_frame nested in output.results."""
        resp = {"output": {"results": {"last_frame_url": "https://example.com/f.png"}}}
        assert adapter._extract_last_frame_url(resp) == "https://example.com/f.png"

    def test_last_frame_in_content(self, adapter):
        """last_frame as content item with role."""
        resp = {"content": [{"type": "image_url", "role": "last_frame", "image_url": "https://ex.com/f.png"}]}
        assert adapter._extract_last_frame_url(resp) == "https://ex.com/f.png"

    def test_no_last_frame(self, adapter):
        """No last_frame → returns None."""
        resp = {"video_url": "https://example.com/vid.mp4"}
        assert adapter._extract_last_frame_url(resp) is None


# ============================================================
# Section 5: Frontend generation signature
# ============================================================



# ============================================================
# Section 6: Live API verification (optional)
# ============================================================

# ============================================================
# Helper: generate a minimal PNG for testing
# ============================================================

def _make_test_png(size: int = 64) -> bytes:
    """Generate a minimal valid PNG."""
    import struct
    import zlib

    def _chunk(chunk_type: bytes, data: bytes) -> bytes:
        c = chunk_type + data
        return struct.pack(">I", len(data)) + c + struct.pack(">I", zlib.crc32(c) & 0xFFFFFFFF)

    sig = b"\x89PNG\r\n\x1a\n"
    ihdr = _chunk(b"IHDR", struct.pack(">IIBBBBB", size, size, 8, 2, 0, 0, 0))
    raw = b""
    for _ in range(size):
        raw += b"\x00" + b"\x80\x00\x00" * size  # filter-byte + red pixels
    idat = _chunk(b"IDAT", zlib.compress(raw))
    iend = _chunk(b"IEND", b"")
    return sig + ihdr + idat + iend


@pytest.mark.skipif(not os.environ.get("TEST_LIVE"), reason="set TEST_LIVE=1 to run real API tests")
class TestLiveAPI:
    """End-to-end verification against real Volcano Engine API."""

    @pytest.fixture(autouse=True)
    def setup(self, tmp_path: Path):
        from app.config import settings
        assert settings.ARK_API_KEY.strip(), "ARK_API_KEY must be set in .env"
        self.settings = settings
        self.upload_dir = tmp_path / "uploads"
        self.output_dir = tmp_path / "outputs"
        self.upload_dir.mkdir(parents=True, exist_ok=True)
        self.output_dir.mkdir(parents=True, exist_ok=True)
        self.test_image_path = self.upload_dir / "test.png"
        self.test_image_path.write_bytes(_make_test_png())
        self.test_image_rel = "/uploads/test.png"

    def _make_adapter(self, timeout: int | None = None, v2_model: str | None = None) -> "VolcengineAdapter":
        from app.adapters.volcengine_adapter import VolcengineAdapter
        from app.services.volcengine_client import VolcengineClient
        client = VolcengineClient(
            base_url=self.settings.ARK_BASE_URL,
            api_key=self.settings.ARK_API_KEY,
            timeout=self.settings.VOLCENGINE_REQUEST_TIMEOUT,
        )
        return VolcengineAdapter(
            client=client, upload_dir=str(self.upload_dir), output_dir=str(self.output_dir),
            image_model=self.settings.VOLCENGINE_IMAGE_MODEL,
            image_edit_model=self.settings.VOLCENGINE_IMAGE_EDIT_MODEL,
            video_model=self.settings.VOLCENGINE_VIDEO_MODEL,
            video_v2_model=v2_model or self.settings.VOLCENGINE_VIDEO_V2_MODEL,
            video_v2_fast_model=self.settings.VOLCENGINE_VIDEO_V2_FAST_MODEL.strip(),
            video_version="2.0", poll_interval=self.settings.VOLCENGINE_POLL_INTERVAL,
            video_timeout=timeout if timeout is not None else int(self.settings.VOLCENGINE_VIDEO_TIMEOUT), public_base_url="",
            output_format=self.settings.VOLCENGINE_IMAGE_OUTPUT_FORMAT,
            watermark=self.settings.VOLCENGINE_WATERMARK, asset_hosting_service=None,
        )

    def _run(self, results: list) -> str | None:
        for r in results:
            print(f"  [{r.status}] {r.progress}% — {r.message}")
        success = next((r for r in results if r.status == "success"), None)
        return success.output_video if success else None

    # ---- P0 ----

    @pytest.mark.asyncio
    async def test_p0_basic_i2v(self):
        """P0-2/3/4: 1 image + prompt → 720p + generate_audio=true."""
        from app.adapters.base import GenerateParams
        adapter = self._make_adapter(timeout=600)
        params = GenerateParams(
            task_type="video", prompt="一只猫在沙滩上散步，阳光明媚",
            source_images=[self.test_image_rel], video_version="2.0",
            generate_audio=True, video_resolution="720p", duration_seconds=5, aspect_ratio="16:9",
        )
        results: list = []
        async for update in adapter.generate(params):
            results.append(update)
        assert self._run(results), f"P0 basic i2v: no success (got {len(results)} updates)"

    @pytest.mark.asyncio
    async def test_p0_two_images(self):
        """P0-2: 2 images → first_frame + last_frame roles."""
        from app.adapters.base import GenerateParams
        (self.upload_dir / "test2.png").write_bytes(_make_test_png())
        adapter = self._make_adapter(timeout=600)
        params = GenerateParams(
            task_type="video", prompt="两幅画面平滑过渡",
            source_images=["/uploads/test.png", "/uploads/test2.png"], video_version="2.0",
            generate_audio=True, video_resolution="720p", duration_seconds=5, aspect_ratio="16:9",
        )
        results: list = []
        async for update in adapter.generate(params):
            results.append(update)
        assert self._run(results), "P0 two images: no success"

    # ---- P1 ----

    @pytest.mark.asyncio
    async def test_p1_negative_prompt_and_seed(self):
        """P1-1/2: negative_prompt + seed=12345."""
        from app.adapters.base import GenerateParams
        adapter = self._make_adapter(timeout=600)
        params = GenerateParams(
            task_type="video", prompt="一只猫在沙滩上散步",
            source_images=[self.test_image_rel], video_version="2.0",
            generate_audio=False, video_resolution="720p", duration_seconds=5, aspect_ratio="16:9",
            negative_prompt="模糊，画面抖动，色彩怪异", seed=12345,
        )
        results: list = []
        async for update in adapter.generate(params):
            results.append(update)
        assert self._run(results), "P1 negative_prompt+seed: no success"

    @pytest.mark.asyncio
    async def test_p1_camera_fixed(self):
        """P1-3: camera_fixed=true."""
        from app.adapters.base import GenerateParams
        adapter = self._make_adapter(timeout=600)
        params = GenerateParams(
            task_type="video", prompt="镜头固定，画面平稳",
            source_images=[self.test_image_rel], video_version="2.0",
            generate_audio=False, video_resolution="720p", duration_seconds=5, aspect_ratio="16:9",
            camera_fixed=True,
        )
        results: list = []
        async for update in adapter.generate(params):
            results.append(update)
        assert self._run(results), "P1 camera_fixed: no success"

    @pytest.mark.asyncio
    async def test_p1_fast_tier(self):
        """P1-4: doubao-seedance-2-0-fast."""
        from app.adapters.base import GenerateParams
        adapter = self._make_adapter(timeout=180, v2_model=self.settings.VOLCENGINE_VIDEO_V2_FAST_MODEL)
        params = GenerateParams(
            task_type="video", prompt="快速生成测试",
            source_images=[self.test_image_rel], video_version="2.0", video_model_tier="fast",
            generate_audio=False, video_resolution="1080p", duration_seconds=5, aspect_ratio="16:9",
        )
        results: list = []
        async for update in adapter.generate(params):
            results.append(update)
        assert self._run(results), "P1 fast tier: no success"

    # ---- P3 ----

    @pytest.mark.asyncio
    async def test_p3_return_last_frame(self):
        """P3-1/2: return_last_frame=true."""
        from app.adapters.base import GenerateParams
        adapter = self._make_adapter(timeout=600)
        params = GenerateParams(
            task_type="video", prompt="一只猫在沙滩上散步，最后定格在特写镜头",
            source_images=[self.test_image_rel], video_version="2.0",
            generate_audio=False, video_resolution="720p", duration_seconds=5, aspect_ratio="16:9",
            return_last_frame=True,
        )
        results: list = []
        async for update in adapter.generate(params):
            results.append(update)
        url = self._run(results)
        assert url, "P3 return_last_frame: missing output_video"
        last_frame = next((r.output_last_frame for r in results if r.output_last_frame), None)
        if last_frame:
            print(f"  [last_frame] {last_frame}")
        else:
            print("  [last_frame] (none)")

    # ---- P4 ----

    @pytest.mark.asyncio
    async def test_p4_video_edit_basic(self):
        """P4: Video edit (requires a real source_video URL to run)."""
        from app.adapters.base import GenerateParams
        adapter = self._make_adapter(timeout=600)
        params = GenerateParams(
            task_type="vedit", prompt="给视频增加夕阳暖色调效果",
            source_video=None,  # set a real video URL to test
            video_version="2.0", generate_audio=True,
            video_resolution="720p", duration_seconds=5, camera_fixed=False,
        )
        if not params.source_video:
            pytest.skip("P4: set source_video to a real video URL to test")
        results: list = []
        async for update in adapter.generate(params):
            results.append(update)
        assert self._run(results), "P4 video edit: no success"


# ============================================================
# Runner
# ============================================================

if __name__ == "__main__":
    if os.environ.get("TEST_LIVE"):
        print("Running LIVE tests against Volcano API...")
    pytest.main([__file__, "-v", *sys.argv[1:]])
