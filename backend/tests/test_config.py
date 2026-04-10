import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from backend.app.config import Settings


class SettingsTests(unittest.TestCase):
    def test_aliyun_oss_region_builds_endpoint_and_supports_generic_ak_sk_names(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            env_path = Path(temp_dir) / ".env"
            env_path.write_text(
                "\n".join(
                    [
                        "ALIYUN_ACCESS_KEY_ID=test-ak",
                        "ALIYUN_ACCESS_KEY_SECRET=test-sk",
                        "ALIYUN_OSS_BUCKET=test-bucket",
                        "ALIYUN_OSS_REGION=cn-shanghai",
                    ]
                ),
                encoding="utf-8",
            )

            with patch.dict(os.environ, {}, clear=True):
                settings = Settings(_env_file=env_path)

        self.assertEqual(settings.ALIYUN_OSS_ACCESS_KEY_ID, "test-ak")
        self.assertEqual(settings.ALIYUN_OSS_ACCESS_KEY_SECRET, "test-sk")
        self.assertEqual(settings.ALIYUN_OSS_BUCKET, "test-bucket")
        self.assertEqual(settings.ALIYUN_OSS_REGION, "cn-shanghai")
        self.assertEqual(settings.ALIYUN_OSS_ENDPOINT, "https://oss-cn-shanghai.aliyuncs.com")

    def test_placeholder_secret_values_are_normalized_to_empty_strings(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            env_path = Path(temp_dir) / ".env"
            env_path.write_text(
                "\n".join(
                    [
                        "ARK_API_KEY=YOUR_ARK_API_KEY",
                        "DASHSCOPE_API_KEY=REPLACE_WITH_REAL_KEY",
                        "ALIYUN_ACCESS_KEY_ID=<fill-me>",
                        "ALIYUN_ACCESS_KEY_SECRET=",
                    ]
                ),
                encoding="utf-8",
            )

            with patch.dict(os.environ, {}, clear=True):
                settings = Settings(_env_file=env_path)

        self.assertEqual(settings.ARK_API_KEY, "")
        self.assertEqual(settings.DASHSCOPE_API_KEY, "")
        self.assertEqual(settings.ALIYUN_OSS_ACCESS_KEY_ID, "")
        self.assertEqual(settings.ALIYUN_OSS_ACCESS_KEY_SECRET, "")


if __name__ == "__main__":
    unittest.main()
