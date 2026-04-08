import os
import shutil
import tempfile
import unittest
from pathlib import Path

from PIL import Image

os.environ["DEBUG"] = "false"

from backend.app.models.schemas import ContinuityFramesGenerateRequest, PromptGenerateRequest
from backend.app.services.prompt_service import PromptGenerationService


class FakePromptClient:
    def __init__(self, response_content: str = "cinematic portrait, soft rim light, rich texture, dramatic depth"):
        self.last_request = None
        self.is_configured = True
        self.response_content = response_content

    async def request_json(self, *, path: str, method: str = "GET", payload=None):
        self.last_request = {
            "path": path,
            "method": method,
            "payload": payload,
        }
        return {
            "choices": [
                {
                    "message": {
                        "content": self.response_content
                    }
                }
            ]
        }


class PromptGenerationServiceTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self._temp_dir = Path(tempfile.mkdtemp(prefix="wxhb-prompt-"))
        self.upload_dir = self._temp_dir / "uploads"
        self.output_dir = self._temp_dir / "outputs"
        self.upload_dir.mkdir(parents=True, exist_ok=True)
        self.output_dir.mkdir(parents=True, exist_ok=True)

        local_image = Image.new("RGB", (8, 8), color=(90, 40, 120))
        self.local_upload = self.upload_dir / "prompt-ref.png"
        local_image.save(self.local_upload, format="PNG")

    def tearDown(self):
        shutil.rmtree(self._temp_dir, ignore_errors=True)

    async def test_generate_prompt_returns_trimmed_text(self):
        client = FakePromptClient()
        service = PromptGenerationService(
            client,
            "doubao-seed-1-6-251015",
            upload_dir=self.upload_dir,
            output_dir=self.output_dir,
        )

        response = await service.generate_prompt(
            PromptGenerateRequest(
                task_type="image",
                user_input="一个角色海报",
                style="电影感",
                aspect_ratio="3:4",
                extra_requirements=["主体清晰", "高级感"],
                reference_images=["/uploads/prompt-ref.png"],
            )
        )

        self.assertEqual(response.model, "doubao-seed-1-6-251015")
        self.assertEqual(response.task_type, "image")
        self.assertIn("cinematic portrait", response.prompt)
        self.assertEqual(client.last_request["path"], "/chat/completions")
        self.assertEqual(client.last_request["method"], "POST")
        self.assertIsInstance(client.last_request["payload"]["messages"][1]["content"], list)
        self.assertTrue(
            client.last_request["payload"]["messages"][1]["content"][1]["image_url"]["url"].startswith(
                "data:image/png;base64,"
            )
        )

    async def test_generate_continuity_frames_returns_nine_frames(self):
        client = FakePromptClient('{"frames":["起势","逼近","试探","停顿","转折","发力","失衡","回稳","收束"]}')
        service = PromptGenerationService(
            client,
            "doubao-seed-1-6-251015",
            upload_dir=self.upload_dir,
            output_dir=self.output_dir,
        )

        response = await service.generate_continuity_frames(
            ContinuityFramesGenerateRequest(
                user_input="角色在走廊中奔跑后停下，再回头看向身后。",
                reference_images=["https://example.com/ref-1.png", "https://example.com/ref-2.png"],
                language="zh",
            )
        )

        self.assertEqual(response.model, "doubao-seed-1-6-251015")
        self.assertEqual(len(response.frames), 9)
        self.assertEqual(response.frames[0], "起势")
        self.assertEqual(response.frames[-1], "收束")
        self.assertIsInstance(client.last_request["payload"]["messages"][1]["content"], list)


if __name__ == "__main__":
    unittest.main()
