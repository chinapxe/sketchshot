import unittest

from backend.app.services.volcengine_client import format_volcengine_connection_error


class VolcengineClientErrorMessageTests(unittest.TestCase):
    def test_formats_tls_handshake_error(self):
        message = format_volcengine_connection_error(
            "https://ark.cn-beijing.volces.com/api/v3",
            "[SSL: UNEXPECTED_EOF_WHILE_READING] EOF occurred in violation of protocol (_ssl.c:1006)",
        )

        self.assertIn("TLS 握手失败", message)
        self.assertIn("ark.cn-beijing.volces.com", message)

    def test_formats_tcp_connection_error(self):
        message = format_volcengine_connection_error(
            "https://ark.cn-beijing.volces.com/api/v3",
            "无法连接到远程服务器",
        )

        self.assertIn("建立 TCP 连接", message)
        self.assertIn("ark.cn-beijing.volces.com", message)

    def test_formats_dns_error(self):
        message = format_volcengine_connection_error(
            "https://ark.cn-beijing.volces.com/api/v3",
            "[Errno -2] Name or service not known",
        )

        self.assertIn("无法解析", message)
        self.assertIn("DNS", message)


if __name__ == "__main__":
    unittest.main()
