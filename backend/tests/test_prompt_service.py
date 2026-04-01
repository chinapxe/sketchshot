import os
import unittest

os.environ["DEBUG"] = "false"

from backend.app.models.schemas import PromptGenerateRequest
from backend.app.services.prompt_service import PromptGenerationService


class FakePromptClient:
    def __init__(self):
        self.last_request = None
        self.is_configured = True

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
                        "content": "cinematic portrait, soft rim light, rich texture, dramatic depth"
                    }
                }
            ]
        }


class PromptGenerationServiceTests(unittest.IsolatedAsyncioTestCase):
    async def test_generate_prompt_returns_trimmed_text(self):
        client = FakePromptClient()
        service = PromptGenerationService(client, "doubao-seed-1-6-251015")

        response = await service.generate_prompt(
            PromptGenerateRequest(
                task_type="image",
                user_input="一个角色海报",
                style="电影感",
                aspect_ratio="3:4",
                extra_requirements=["主体清晰", "高级感"],
            )
        )

        self.assertEqual(response.model, "doubao-seed-1-6-251015")
        self.assertEqual(response.task_type, "image")
        self.assertIn("cinematic portrait", response.prompt)
        self.assertEqual(client.last_request["path"], "/chat/completions")
        self.assertEqual(client.last_request["method"], "POST")


if __name__ == "__main__":
    unittest.main()
