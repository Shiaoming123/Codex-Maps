import io
import json
import unittest

from scripts.codex_session_organizer import write_message


class ProtocolTests(unittest.TestCase):
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
