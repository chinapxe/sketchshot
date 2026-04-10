import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from backend.app.services.engine_config_service import (
    DashScopeConfigSnapshot,
    EngineConfigService,
    EngineConfigSnapshot,
    VolcengineConfigSnapshot,
)


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
            self.assertEqual(raw["volcengine"]["video_model"], "video-model")

            loaded = service.get_volcengine_config()
            self.assertEqual(loaded.ark_base_url, "https://example.com/api/v3")
            self.assertEqual(loaded.ark_api_key, "test-key")

    def test_engine_config_supports_nested_dashscope_provider_settings(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            config_path = Path(temp_dir) / "engine_config.json"
            service = EngineConfigService(config_path)

            saved = service.save_engine_config(
                EngineConfigSnapshot(
                    prompt_provider="qwen",
                    generate_provider="wanx",
                    volcengine=service.get_volcengine_config(),
                    dashscope=DashScopeConfigSnapshot(
                        base_url="https://dashscope.aliyuncs.com/",
                        api_key="  dash-key  ",
                        qwen_text_model="qwen-plus",
                        qwen_multimodal_model="qwen-vl-plus",
                        wanx_image_model="wan2.7-image-pro",
                        wanx_video_model="wan2.7-i2v",
                        wanx_video_resolution="720P",
                        wanx_watermark=True,
                        oss_region=" cn-shanghai ",
                        oss_endpoint="https://oss-cn-shanghai.aliyuncs.com/",
                        oss_access_key_id="  oss-ak  ",
                        oss_access_key_secret="  oss-sk  ",
                        oss_bucket="  sketchshot-temp  ",
                        oss_key_prefix="  wanx/frames  ",
                    ),
                )
            )

            self.assertEqual(saved.prompt_provider, "qwen")
            self.assertEqual(saved.generate_provider, "wanx")
            self.assertEqual(saved.dashscope.base_url, "https://dashscope.aliyuncs.com")
            self.assertEqual(saved.dashscope.api_key, "dash-key")
            self.assertTrue(saved.dashscope.wanx_watermark)
            self.assertEqual(saved.dashscope.oss_region, "cn-shanghai")
            self.assertEqual(saved.dashscope.oss_endpoint, "https://oss-cn-shanghai.aliyuncs.com")
            self.assertEqual(saved.dashscope.oss_bucket, "sketchshot-temp")
            self.assertEqual(saved.dashscope.oss_key_prefix, "wanx/frames")

            loaded = service.get_engine_config()
            self.assertEqual(loaded.prompt_provider, "qwen")
            self.assertEqual(loaded.generate_provider, "wanx")
            self.assertEqual(loaded.dashscope.wanx_video_model, "wan2.7-i2v")
            self.assertEqual(loaded.dashscope.oss_access_key_id, "oss-ak")

    def test_dashscope_oss_region_can_build_endpoint_when_endpoint_is_empty(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            service = EngineConfigService(Path(temp_dir) / "engine_config.json")

            saved = service.save_dashscope_config(
                DashScopeConfigSnapshot(
                    base_url="https://dashscope.aliyuncs.com",
                    api_key="dash-key",
                    qwen_text_model="qwen-plus",
                    qwen_multimodal_model="qwen-vl-plus",
                    wanx_image_model="wan2.7-image-pro",
                    wanx_video_model="wan2.7-i2v",
                    wanx_video_resolution="720P",
                    wanx_watermark=False,
                    oss_region="cn-hangzhou",
                    oss_endpoint="",
                    oss_access_key_id="oss-ak",
                    oss_access_key_secret="oss-sk",
                    oss_bucket="demo-bucket",
                    oss_key_prefix="temp",
                )
            )

            self.assertEqual(saved.oss_region, "cn-hangzhou")
            self.assertEqual(saved.oss_endpoint, "https://oss-cn-hangzhou.aliyuncs.com")

    def test_dashscope_oss_region_is_inferred_from_endpoint_when_loading_old_config(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            config_path = Path(temp_dir) / "engine_config.json"
            config_path.write_text(
                json.dumps(
                    {
                        "prompt_provider": "qwen",
                        "generate_provider": "wanx",
                        "volcengine": {
                            "ark_base_url": "https://example.com/api/v3",
                            "ark_api_key": "",
                            "prompt_model": "prompt-model",
                            "image_model": "image-model",
                            "image_edit_model": "image-edit-model",
                            "video_model": "video-model",
                        },
                        "dashscope": {
                            "base_url": "https://dashscope.aliyuncs.com",
                            "api_key": "dash-key",
                            "qwen_text_model": "qwen-plus",
                            "qwen_multimodal_model": "qwen-vl-plus",
                            "wanx_image_model": "wan2.7-image-pro",
                            "wanx_video_model": "wan2.7-i2v",
                            "wanx_video_resolution": "720P",
                            "wanx_watermark": False,
                            "oss_region": "",
                            "oss_endpoint": "https://oss-cn-beijing.aliyuncs.com",
                            "oss_access_key_id": "oss-ak",
                            "oss_access_key_secret": "oss-sk",
                            "oss_bucket": "demo-bucket",
                            "oss_key_prefix": "temp",
                        },
                    },
                    ensure_ascii=False,
                ),
                encoding="utf-8",
            )

            service = EngineConfigService(config_path)
            loaded = service.get_dashscope_config()

            self.assertEqual(loaded.oss_region, "cn-beijing")
            self.assertEqual(loaded.oss_endpoint, "https://oss-cn-beijing.aliyuncs.com")

    def test_placeholder_secrets_are_sanitized_when_saving_engine_config(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            config_path = Path(temp_dir) / "engine_config.json"
            service = EngineConfigService(config_path)

            with patch("backend.app.services.engine_config_service.settings.ARK_API_KEY", ""), patch(
                "backend.app.services.engine_config_service.settings.DASHSCOPE_API_KEY", ""
            ), patch("backend.app.services.engine_config_service.settings.ALIYUN_OSS_ACCESS_KEY_ID", ""), patch(
                "backend.app.services.engine_config_service.settings.ALIYUN_OSS_ACCESS_KEY_SECRET", ""
            ):
                saved = service.save_engine_config(
                    EngineConfigSnapshot(
                        prompt_provider="volcengine",
                        generate_provider="mock",
                        volcengine=VolcengineConfigSnapshot(
                            ark_base_url="https://example.com/api/v3",
                            ark_api_key="YOUR_ARK_API_KEY",
                            prompt_model="prompt-model",
                            image_model="image-model",
                            image_edit_model="image-edit-model",
                            video_model="video-model",
                        ),
                        dashscope=DashScopeConfigSnapshot(
                            base_url="https://dashscope.aliyuncs.com",
                            api_key="REPLACE_WITH_REAL_KEY",
                            qwen_text_model="qwen-plus",
                            qwen_multimodal_model="qwen-vl-plus",
                            wanx_image_model="wan2.7-image-pro",
                            wanx_video_model="wan2.7-i2v",
                            wanx_video_resolution="720P",
                            wanx_watermark=False,
                            oss_region="cn-shanghai",
                            oss_endpoint="https://oss-cn-shanghai.aliyuncs.com",
                            oss_access_key_id="<fill-me>",
                            oss_access_key_secret="",
                            oss_bucket="demo-bucket",
                            oss_key_prefix="temp",
                        ),
                    )
                )

            self.assertEqual(saved.volcengine.ark_api_key, "")
            self.assertEqual(saved.dashscope.api_key, "")
            self.assertEqual(saved.dashscope.oss_access_key_id, "")
            self.assertEqual(saved.dashscope.oss_access_key_secret, "")


if __name__ == "__main__":
    unittest.main()
