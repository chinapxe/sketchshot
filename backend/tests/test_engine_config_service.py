import json
import tempfile
import unittest
from pathlib import Path

from backend.app.services.engine_config_service import EngineConfigService, VolcengineConfigSnapshot


class EngineConfigServiceTests(unittest.TestCase):
    def test_reads_env_defaults_when_config_file_is_missing(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            service = EngineConfigService(Path(temp_dir) / "engine_config.json")

            config = service.get_volcengine_config()

            self.assertTrue(config.ark_base_url.startswith("https://"))
            self.assertTrue(config.prompt_model)
            self.assertTrue(config.image_model)
            self.assertTrue(config.video_model)

    def test_save_persists_and_reload_returns_latest_values(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            config_path = Path(temp_dir) / "engine_config.json"
            service = EngineConfigService(config_path)

            saved = service.save_volcengine_config(
                VolcengineConfigSnapshot(
                    ark_base_url="https://example.com/api/v3/",
                    ark_api_key="  test-key  ",
                    prompt_model="prompt-model",
                    image_model="image-model",
                    image_edit_model="image-edit-model",
                    video_model="video-model",
                )
            )

            self.assertEqual(saved.ark_base_url, "https://example.com/api/v3")
            self.assertEqual(saved.ark_api_key, "test-key")
            self.assertTrue(config_path.exists())

            raw = json.loads(config_path.read_text(encoding="utf-8"))
            self.assertEqual(raw["video_model"], "video-model")

            loaded = service.get_volcengine_config()
            self.assertEqual(loaded.ark_base_url, "https://example.com/api/v3")
            self.assertEqual(loaded.ark_api_key, "test-key")


if __name__ == "__main__":
    unittest.main()
