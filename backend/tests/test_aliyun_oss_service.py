import tempfile
import unittest
from pathlib import Path

from backend.app.services.aliyun_oss_service import AliyunOssAssetHostingService


class FakeBucket:
    def __init__(self):
        self.put_calls = []
        self.sign_calls = []

    def put_object(self, key, payload, headers=None):
        self.put_calls.append({"key": key, "payload": payload, "headers": headers})

    def sign_url(self, method, key, expires, slash_safe=True):
        self.sign_calls.append(
            {
                "method": method,
                "key": key,
                "expires": expires,
                "slash_safe": slash_safe,
            }
        )
        return f"https://example-bucket.oss-cn-shanghai.aliyuncs.com/{key}?signed=1"


class AliyunOssAssetHostingServiceTests(unittest.IsolatedAsyncioTestCase):
    async def test_upload_local_file_returns_signed_url(self):
        fake_bucket = FakeBucket()
        service = AliyunOssAssetHostingService(
            endpoint="https://oss-cn-shanghai.aliyuncs.com",
            access_key_id="ak",
            access_key_secret="sk",
            bucket="demo-bucket",
            key_prefix="sketchshot-temp",
            signed_url_expire_seconds=1800,
            bucket_factory=lambda endpoint, access_key_id, access_key_secret, bucket: fake_bucket,
        )

        with tempfile.TemporaryDirectory() as temp_dir:
            source = Path(temp_dir) / "frame image.png"
            source.write_bytes(b"fake-image-bytes")

            signed_url = await service.upload_local_file(source, purpose="wanx-video-frame")

        self.assertTrue(signed_url.startswith("https://example-bucket.oss-cn-shanghai.aliyuncs.com/"))
        self.assertEqual(len(fake_bucket.put_calls), 1)
        self.assertEqual(fake_bucket.put_calls[0]["headers"], {"Content-Type": "image/png"})
        self.assertEqual(fake_bucket.sign_calls[0]["method"], "GET")
        self.assertEqual(fake_bucket.sign_calls[0]["expires"], 1800)
        self.assertIn("sketchshot-temp/wanx-video-frame/", fake_bucket.put_calls[0]["key"])


if __name__ == "__main__":
    unittest.main()
