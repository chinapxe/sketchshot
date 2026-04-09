import io
import os
import shutil
import tempfile
import unittest
from pathlib import Path

from PIL import Image

os.environ["DEBUG"] = "false"

from backend.app.adapters.base import GenerateParams
from backend.app.adapters.wanx_adapter import WanxAdapter


class FakeDashScopeClient:
    def __init__(self):
        self.requests = []
        self.downloads = []
        self._video_poll_count = 0

    @property
    def is_configured(self) -> bool:
        return True

    async def request_json(self, *, path: str, method: str = "GET", payload=None, headers=None):
        self.requests.append({"path": path, "method": method, "payload": payload, "headers": headers})

        if path == "/api/v1/services/aigc/multimodal-generation/generation":
            return {
                "output": {
                    "choices": [
                        {
                            "message": {
                                "content": [
                                    {"type": "image", "image": "https://example.com/generated-image.png"}
                                ]
                            }
                        }
                    ]
                }
            }

        if path == "/api/v1/services/aigc/video-generation/video-synthesis" and method == "POST":
            return {"output": {"task_id": "wanx-task-123", "task_status": "PENDING"}}

        if path == "/api/v1/tasks/wanx-task-123" and method == "GET":
            self._video_poll_count += 1
            if self._video_poll_count == 1:
                return {"output": {"task_id": "wanx-task-123", "task_status": "PENDING"}}
            if self._video_poll_count == 2:
                return {"output": {"task_id": "wanx-task-123", "task_status": "RUNNING"}}
            return {
                "output": {
                    "task_id": "wanx-task-123",
                    "task_status": "SUCCEEDED",
                    "video_url": "https://example.com/generated-video.mp4",
                }
            }

        raise AssertionError(f"Unexpected request: {method} {path}")

    async def download_asset(self, url: str):
        self.downloads.append(url)
        if url.endswith(".png"):
            image = Image.new("RGB", (16, 16), color=(30, 60, 90))
            buffer = io.BytesIO()
            image.save(buffer, format="PNG")
            return buffer.getvalue(), "image/png"

        return b"fake-video-bytes", "video/mp4"


class FakeAssetHostingService:
    def __init__(self, hosted_url: str = "https://oss-example.com/wanx-frame.png"):
        self.hosted_url = hosted_url
        self.upload_calls: list[Path] = []

    @property
    def is_configured(self) -> bool:
        return True

    async def upload_local_file(self, local_path: str | Path, *, purpose: str) -> str:
        self.upload_calls.append(Path(local_path))
        return self.hosted_url


class WanxAdapterTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self._temp_dir = Path(tempfile.mkdtemp(prefix="wxhb-wanx-"))
        self.upload_dir = self._temp_dir / "uploads"
        self.output_dir = self._temp_dir / "outputs"
        self.upload_dir.mkdir(parents=True, exist_ok=True)
        self.output_dir.mkdir(parents=True, exist_ok=True)

        source = Image.new("RGB", (12, 12), color=(120, 50, 80))
        self.local_upload = self.upload_dir / "source.png"
        source.save(self.local_upload, format="PNG")

        self.client = FakeDashScopeClient()
        self.adapter = WanxAdapter(
            client=self.client,
            upload_dir=self.upload_dir,
            output_dir=self.output_dir,
            image_model="wan2.7-image-pro",
            video_model="wan2.7-i2v",
            poll_interval=0.01,
            video_timeout=2.0,
            public_base_url="https://example.com",
            video_resolution="720P",
            watermark=False,
        )

    def tearDown(self):
        shutil.rmtree(self._temp_dir, ignore_errors=True)

    async def test_image_generation_encodes_local_inputs_and_downloads_result(self):
        updates = []
        async for update in self.adapter.generate(
            GenerateParams(
                task_type="image",
                prompt="hero portrait",
                aspect_ratio="3:4",
                resolution="2K",
                reference_images=["/uploads/source.png"],
            )
        ):
            updates.append(update)

        final_update = updates[-1]
        self.assertEqual(final_update.status, "success")
        self.assertTrue(final_update.output_image.startswith("/outputs/"))

        image_request = self.client.requests[0]
        content = image_request["payload"]["input"]["messages"][0]["content"]
        self.assertEqual(image_request["payload"]["parameters"]["size"], "1536*2048")
        self.assertTrue(any(isinstance(item, dict) and str(item.get("image", "")).startswith("data:image/png;base64,") for item in content))

    async def test_video_generation_uses_public_urls_for_local_frames(self):
        updates = []
        async for update in self.adapter.generate(
            GenerateParams(
                task_type="video",
                prompt="slow camera push in",
                aspect_ratio="16:9",
                duration_seconds=4,
                source_images=["/uploads/source.png"],
            )
        ):
            updates.append(update)

        final_update = updates[-1]
        self.assertEqual(final_update.status, "success")
        self.assertTrue(final_update.output_video.startswith("/outputs/"))

        create_request = self.client.requests[0]
        media = create_request["payload"]["input"]["media"]
        self.assertEqual(media[0]["type"], "first_frame")
        self.assertEqual(media[0]["url"], "https://example.com/uploads/source.png")
        self.assertEqual(create_request["headers"], {"X-DashScope-Async": "enable"})

    async def test_video_generation_reuses_preserved_remote_url_from_wanx_image_output(self):
        adapter = WanxAdapter(
            client=self.client,
            upload_dir=self.upload_dir,
            output_dir=self.output_dir,
            image_model="wan2.7-image-pro",
            video_model="wan2.7-i2v",
            poll_interval=0.01,
            video_timeout=2.0,
            public_base_url="",
            video_resolution="720P",
            watermark=False,
        )

        image_updates = []
        async for update in adapter.generate(
            GenerateParams(
                task_type="image",
                prompt="hero portrait",
                aspect_ratio="3:4",
                resolution="2K",
                reference_images=["/uploads/source.png"],
            )
        ):
            image_updates.append(update)

        generated_image_url = image_updates[-1].output_image
        self.assertIsNotNone(generated_image_url)

        video_updates = []
        async for update in adapter.generate(
            GenerateParams(
                task_type="video",
                prompt="slow camera push in",
                aspect_ratio="16:9",
                duration_seconds=4,
                source_images=[generated_image_url],
            )
        ):
            video_updates.append(update)

        final_update = video_updates[-1]
        self.assertEqual(final_update.status, "success")

        create_request = self.client.requests[1]
        media = create_request["payload"]["input"]["media"]
        self.assertEqual(media[0]["url"], "https://example.com/generated-image.png")

    async def test_video_generation_without_public_base_url_raises_clear_error(self):
        adapter = WanxAdapter(
            client=self.client,
            upload_dir=self.upload_dir,
            output_dir=self.output_dir,
            image_model="wan2.7-image-pro",
            video_model="wan2.7-i2v",
            poll_interval=0.01,
            video_timeout=2.0,
            public_base_url="",
            video_resolution="720P",
            watermark=False,
        )

        with self.assertRaises(RuntimeError) as context:
            async for _ in adapter.generate(
                GenerateParams(
                    task_type="video",
                    prompt="slow camera push in",
                    aspect_ratio="16:9",
                    duration_seconds=4,
                    source_images=["/uploads/source.png"],
                )
            ):
                pass

        self.assertIn("PUBLIC_BASE_URL", str(context.exception))
        self.assertIn("ALIYUN_OSS_ENDPOINT", str(context.exception))

    async def test_video_generation_uploads_local_frames_to_oss_when_configured(self):
        hosting_service = FakeAssetHostingService()
        adapter = WanxAdapter(
            client=self.client,
            upload_dir=self.upload_dir,
            output_dir=self.output_dir,
            image_model="wan2.7-image-pro",
            video_model="wan2.7-i2v",
            poll_interval=0.01,
            video_timeout=2.0,
            public_base_url="",
            video_resolution="720P",
            watermark=False,
            asset_hosting_service=hosting_service,
        )

        updates = []
        async for update in adapter.generate(
            GenerateParams(
                task_type="video",
                prompt="slow camera push in",
                aspect_ratio="16:9",
                duration_seconds=4,
                source_images=["/uploads/source.png"],
            )
        ):
            updates.append(update)

        self.assertEqual(updates[-1].status, "success")
        self.assertEqual(hosting_service.upload_calls, [self.local_upload])

        create_request = self.client.requests[0]
        media = create_request["payload"]["input"]["media"]
        self.assertEqual(media[0]["url"], "https://oss-example.com/wanx-frame.png")


if __name__ == "__main__":
    unittest.main()
