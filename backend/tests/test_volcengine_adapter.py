import io
import os
import shutil
import tempfile
import unittest
from pathlib import Path

from PIL import Image

os.environ["DEBUG"] = "false"

from backend.app.adapters.base import GenerateParams
from backend.app.adapters.volcengine_adapter import VolcengineAdapter


class FakeVolcengineClient:
    def __init__(self):
        self.requests = []
        self.downloads = []
        self._video_poll_count = 0

    @property
    def is_configured(self) -> bool:
        return True

    async def request_json(self, *, path: str, method: str = "GET", payload=None):
        self.requests.append({"path": path, "method": method, "payload": payload})

        if path == "/images/generations":
            return {"data": [{"url": "https://example.com/generated-image.png"}]}

        if path == "/contents/generations/tasks" and method == "POST":
            return {"id": "task-123", "status": "queued"}

        if path == "/contents/generations/tasks/task-123" and method == "GET":
            self._video_poll_count += 1
            if self._video_poll_count == 1:
                return {"id": "task-123", "status": "queued"}
            if self._video_poll_count == 2:
                return {"id": "task-123", "status": "running"}
            return {
                "id": "task-123",
                "status": "succeeded",
                "content": {
                    "video_url": "https://example.com/generated-video.mp4",
                },
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


class VolcengineAdapterTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self._temp_dir = Path(tempfile.mkdtemp(prefix="wxhb-volc-"))
        self.upload_dir = self._temp_dir / "uploads"
        self.output_dir = self._temp_dir / "outputs"
        self.upload_dir.mkdir(parents=True, exist_ok=True)
        self.output_dir.mkdir(parents=True, exist_ok=True)

        source = Image.new("RGB", (12, 12), color=(120, 50, 80))
        self.local_upload = self.upload_dir / "source.png"
        source.save(self.local_upload, format="PNG")

        self.client = FakeVolcengineClient()
        self.adapter = VolcengineAdapter(
            client=self.client,
            upload_dir=self.upload_dir,
            output_dir=self.output_dir,
            image_model="seedream",
            image_edit_model="seedream-edit",
            video_model="seedance",
            poll_interval=0.01,
            video_timeout=2.0,
            public_base_url="",
            output_format="png",
            watermark=False,
        )

    def tearDown(self):
        shutil.rmtree(self._temp_dir, ignore_errors=True)

    async def test_image_generation_uses_data_url_for_local_inputs_and_downloads_result(self):
        updates = []
        async for update in self.adapter.generate(
            GenerateParams(
                task_type="image",
                prompt="hero portrait",
                resolution="2K",
                reference_images=["/uploads/source.png"],
            )
        ):
            updates.append(update)

        final_update = updates[-1]
        self.assertEqual(final_update.status, "success")
        self.assertTrue(final_update.output_image.startswith("/outputs/"))

        image_request = self.client.requests[0]
        self.assertEqual(image_request["path"], "/images/generations")
        self.assertEqual(image_request["payload"]["model"], "seedream-edit")
        encoded_input = image_request["payload"]["image"]
        self.assertTrue(encoded_input.startswith("data:image/png;base64,"))

        saved_path = self.output_dir / Path(final_update.output_image.removeprefix("/outputs/")).name
        self.assertTrue(saved_path.exists())

    async def test_video_generation_polls_until_success_and_stores_local_file(self):
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
        self.assertEqual(create_request["path"], "/contents/generations/tasks")
        content = create_request["payload"]["content"]
        self.assertEqual(content[0]["type"], "text")
        self.assertEqual(content[1]["type"], "image_url")
        self.assertTrue(content[1]["image_url"]["url"].startswith("data:image/png;base64,"))

        saved_path = self.output_dir / Path(final_update.output_video.removeprefix("/outputs/")).name
        self.assertTrue(saved_path.exists())

    async def test_video_generation_timeout_contains_remote_task_id(self):
        self.client._video_poll_count = -999

        async def always_running_request_json(*, path: str, method: str = "GET", payload=None):
            self.client.requests.append({"path": path, "method": method, "payload": payload})
            if path == "/contents/generations/tasks" and method == "POST":
                return {"id": "task-timeout", "status": "queued"}
            if path == "/contents/generations/tasks/task-timeout" and method == "GET":
                return {"id": "task-timeout", "status": "running"}
            raise AssertionError(f"Unexpected request: {method} {path}")

        self.client.request_json = always_running_request_json

        timeout_adapter = VolcengineAdapter(
            client=self.client,
            upload_dir=self.upload_dir,
            output_dir=self.output_dir,
            image_model="seedream",
            image_edit_model="seedream-edit",
            video_model="seedance",
            poll_interval=0.01,
            video_timeout=0.03,
            public_base_url="",
            output_format="png",
            watermark=False,
        )

        with self.assertRaises(TimeoutError) as context:
            async for _ in timeout_adapter.generate(
                GenerateParams(
                    task_type="video",
                    prompt="slow camera push in",
                    aspect_ratio="16:9",
                    duration_seconds=4,
                    source_images=["/uploads/source.png"],
                )
            ):
                pass

        self.assertIn("task-timeout", str(context.exception))


if __name__ == "__main__":
    unittest.main()
