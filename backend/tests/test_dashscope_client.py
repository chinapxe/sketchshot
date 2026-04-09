import json
import io
import unittest
from unittest.mock import patch
from urllib import error

from backend.app.services.dashscope_client import (
    DashScopeClient,
    format_dashscope_connection_error,
)


class _FakeResponse:
    def __init__(self, body: bytes, headers: dict[str, str] | None = None):
        self._body = body
        self.headers = headers or {}

    def read(self) -> bytes:
        return self._body

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc, tb):
        return False


class DashScopeClientErrorMessageTests(unittest.TestCase):
    def test_formats_tls_handshake_error(self):
        message = format_dashscope_connection_error(
            "https://dashscope.aliyuncs.com",
            "[SSL: UNEXPECTED_EOF_WHILE_READING] EOF occurred in violation of protocol (_ssl.c:1006)",
        )

        self.assertIn("TLS", message)
        self.assertIn("dashscope.aliyuncs.com", message)


class DashScopeClientRetryTests(unittest.IsolatedAsyncioTestCase):
    async def test_request_json_retries_transient_tls_error(self):
        attempts = {"count": 0}

        def fake_urlopen(req, timeout):
            attempts["count"] += 1
            if attempts["count"] < 3:
                raise error.URLError(
                    "[SSL: UNEXPECTED_EOF_WHILE_READING] EOF occurred in violation of protocol (_ssl.c:1006)"
                )
            return _FakeResponse(json.dumps({"output": {"task_id": "ok"}}).encode("utf-8"))

        client = DashScopeClient(
            base_url="https://dashscope.aliyuncs.com",
            api_key="test-key",
            timeout=5,
            max_retries=3,
            retry_delay_seconds=0,
        )

        with patch("backend.app.services.dashscope_client.request.urlopen", side_effect=fake_urlopen):
            response = await client.request_json(
                path="/api/v1/tasks/demo-task",
                method="GET",
            )

        self.assertEqual(attempts["count"], 3)
        self.assertEqual(response["output"]["task_id"], "ok")

    async def test_download_asset_retries_transient_tls_error(self):
        attempts = {"count": 0}

        def fake_urlopen(req, timeout):
            attempts["count"] += 1
            if attempts["count"] < 2:
                raise error.URLError(
                    "[SSL: UNEXPECTED_EOF_WHILE_READING] EOF occurred in violation of protocol (_ssl.c:1006)"
                )
            return _FakeResponse(b"video-bytes", headers={"Content-Type": "video/mp4"})

        client = DashScopeClient(
            base_url="https://dashscope.aliyuncs.com",
            api_key="test-key",
            timeout=5,
            max_retries=2,
            retry_delay_seconds=0,
        )

        with patch("backend.app.services.dashscope_client.request.urlopen", side_effect=fake_urlopen):
            payload, content_type = await client.download_asset("https://example.com/video.mp4")

        self.assertEqual(attempts["count"], 2)
        self.assertEqual(payload, b"video-bytes")
        self.assertEqual(content_type, "video/mp4")

    async def test_request_json_does_not_retry_http_error(self):
        attempts = {"count": 0}

        def fake_urlopen(req, timeout):
            attempts["count"] += 1
            raise error.HTTPError(
                url="https://dashscope.aliyuncs.com/api/v1/tasks/demo-task",
                code=400,
                msg="Bad Request",
                hdrs=None,
                fp=io.BytesIO(b'{"message":"bad request"}'),
            )

        client = DashScopeClient(
            base_url="https://dashscope.aliyuncs.com",
            api_key="test-key",
            timeout=5,
            max_retries=3,
            retry_delay_seconds=0,
        )

        with patch("backend.app.services.dashscope_client.request.urlopen", side_effect=fake_urlopen):
            with self.assertRaises(RuntimeError) as context:
                await client.request_json(path="/api/v1/tasks/demo-task", method="GET")

        self.assertEqual(attempts["count"], 1)
        self.assertIn("HTTP 400", str(context.exception))


if __name__ == "__main__":
    unittest.main()
