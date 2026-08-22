import io
import json
import unittest

from scripts.codex_maps import (
    DEFAULT_THREAD_SORT_KEY,
    build_app_server_command,
    write_message,
)


class ProtocolTests(unittest.TestCase):
    def test_default_sort_key_uses_cross_version_baseline(self):
        self.assertEqual(DEFAULT_THREAD_SORT_KEY, "updated_at")

    def test_app_server_uses_default_stdio_transport(self):
        self.assertEqual(build_app_server_command("codex"), ["codex", "app-server"])

    def test_write_message_is_newline_delimited_json_without_jsonrpc_header(self):
        stream = io.StringIO()

        write_message(stream, {"id": 1, "method": "thread/list", "params": {}})

        self.assertTrue(stream.getvalue().endswith("\n"))
        self.assertEqual(
            json.loads(stream.getvalue()),
            {"id": 1, "method": "thread/list", "params": {}},
        )


if __name__ == "__main__":
    unittest.main()
