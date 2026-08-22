#!/usr/bin/env python3
"""Read-only Codex Maps diagnostic client.

The first slice intentionally exposes only thread/list. It keeps all session
state in codex app-server and does not read or rewrite Codex storage directly.
"""

from __future__ import annotations

import argparse
import json
import subprocess
import sys
from typing import Any, TextIO

DEFAULT_THREAD_SORT_KEY = "updated_at"


class AppServerError(RuntimeError):
    """A JSON-RPC error returned by codex app-server."""


def build_app_server_command(codex_path: str) -> list[str]:
    """Build the stable stdio command; stdio is the app-server default."""
    return [codex_path, "app-server"]


def write_message(stream: TextIO, message: dict[str, Any]) -> None:
    stream.write(json.dumps(message, ensure_ascii=False, separators=(",", ":")) + "\n")
    stream.flush()


def read_response(
    process: subprocess.Popen[str], request_id: int
) -> dict[str, Any]:
    if process.stdout is None:
        raise AppServerError("codex app-server stdout is unavailable")

    for line in process.stdout:
        line = line.strip()
        if not line:
            continue
        try:
            message = json.loads(line)
        except json.JSONDecodeError as error:
            raise AppServerError(f"invalid app-server JSON: {line}") from error

        if message.get("id") != request_id:
            # Notifications are expected during normal operation. A server
            # request needs a real client policy and is rejected explicitly.
            if "id" in message:
                write_message(
                    process.stdin,  # type: ignore[arg-type]
                    {
                        "id": message["id"],
                        "error": {
                            "code": -32601,
                            "message": "This read-only client does not handle server requests.",
                        },
                    },
                )
            continue

        if "error" in message:
            error = message["error"]
            raise AppServerError(
                f"{error.get('message', 'app-server request failed')} "
                f"(code {error.get('code', 'unknown')})"
            )
        return message.get("result", {})

    stderr = ""
    if process.stderr is not None:
        stderr = process.stderr.read().strip()
    detail = f": {stderr}" if stderr else ""
    raise AppServerError(f"codex app-server exited before responding{detail}")


def request(
    process: subprocess.Popen[str], request_id: int, method: str, params: dict[str, Any]
) -> dict[str, Any]:
    if process.stdin is None:
        raise AppServerError("codex app-server stdin is unavailable")
    write_message(process.stdin, {"id": request_id, "method": method, "params": params})
    return read_response(process, request_id)


def list_threads(args: argparse.Namespace) -> dict[str, Any]:
    try:
        process = subprocess.Popen(
            build_app_server_command(args.codex_path),
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            encoding="utf-8",
        )
    except FileNotFoundError as error:
        raise AppServerError(
            f"Could not find '{args.codex_path}'. Install Codex or pass --codex-path."
        ) from error
    except PermissionError as error:
        raise AppServerError(
            f"Could not execute '{args.codex_path}' because the operating system denied access. "
            "Pass an executable path that this shell can run with --codex-path."
        ) from error

    try:
        request(
            process,
            1,
            "initialize",
            {
                "clientInfo": {
                    "name": "codex_maps",
                    "title": "Codex Maps",
                    "version": "0.1.0",
                }
            },
        )
        if process.stdin is None:
            raise AppServerError("codex app-server stdin is unavailable")
        write_message(process.stdin, {"method": "initialized"})

        params: dict[str, Any] = {
            "limit": args.limit,
            "sortKey": DEFAULT_THREAD_SORT_KEY,
            "sortDirection": "desc",
            "archived": args.archived,
        }
        if args.search:
            params["searchTerm"] = args.search
        if args.cwd:
            params["cwd"] = args.cwd
        return request(process, 2, "thread/list", params)
    finally:
        if process.stdin is not None:
            process.stdin.close()
        try:
            process.wait(timeout=2)
        except subprocess.TimeoutExpired:
            process.terminate()
            process.wait(timeout=2)


def print_threads(result: dict[str, Any], as_json: bool) -> None:
    if as_json:
        print(json.dumps(result, ensure_ascii=False, indent=2))
        return

    threads = result.get("data", [])
    if not threads:
        print("No Codex sessions found.")
        return

    for thread in threads:
        status = (thread.get("status") or {}).get("type", "unknown")
        preview = (thread.get("preview") or "(untitled)").replace("\n", " ")
        print(f"{thread.get('id', '?')}\t{status}\t{preview}")
    if result.get("nextCursor"):
        print("More sessions are available; pagination will be added in the next slice.")


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Read-only Codex Maps diagnostic CLI")
    subparsers = parser.add_subparsers(dest="command", required=True)
    list_parser = subparsers.add_parser("list", help="List stored Codex sessions")
    list_parser.add_argument("--limit", type=int, default=25)
    list_parser.add_argument("--search", help="Case-sensitive title substring")
    list_parser.add_argument("--cwd", action="append", help="Exact session cwd filter")
    list_parser.add_argument("--archived", action="store_true")
    list_parser.add_argument("--json", action="store_true", dest="as_json")
    list_parser.add_argument("--codex-path", default="codex")
    return parser


def main() -> int:
    args = build_parser().parse_args()
    try:
        if args.command == "list":
            print_threads(list_threads(args), args.as_json)
        return 0
    except AppServerError as error:
        print(f"error: {error}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
