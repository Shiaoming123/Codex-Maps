import { randomUUID } from "node:crypto";

import { describe, expect, it } from "vitest";

import { StdioAppServerAdapter } from "../src/stdio.js";

const codexPath = process.env.CODEX_MAPS_CODEX_PATH;
const smoke = codexPath ? it : it.skip;

describe("local Codex App Server smoke", () => {
  smoke(
    "handshakes and performs a content-free thread query",
    async () => {
      const adapter = new StdioAppServerAdapter({
        command: codexPath!,
        args: ["app-server"],
      });
      const connection = await adapter.acquire();
      const lines = connection.lines[Symbol.asyncIterator]();

      try {
        await connection.send(
          JSON.stringify({
            id: 1,
            method: "initialize",
            params: {
              clientInfo: {
                name: "codex-maps-smoke",
                title: "Codex Maps Smoke",
                version: "0.1.0",
              },
              capabilities: null,
            },
          }),
        );
        const initialized = await responseFor(lines, 1);
        expect(initialized.error).toBeUndefined();

        await connection.send(JSON.stringify({ method: "initialized", params: {} }));
        await connection.send(
          JSON.stringify({
            id: 2,
            method: "thread/list",
            params: {
              cursor: null,
              limit: 1,
              sortKey: "updated_at",
              sortDirection: "desc",
              archived: false,
              searchTerm: `codex-maps-smoke-no-match-${randomUUID()}`,
            },
          }),
        );

        const listed = await responseFor(lines, 2);
        expect(listed.error).toBeUndefined();
        const data = (listed.result as { data?: unknown[] } | undefined)?.data;
        if (!Array.isArray(data)) {
          throw new Error("thread/list did not return a data array");
        }
        if (data.length !== 0) {
          throw new Error(`content-free smoke query unexpectedly matched ${data.length} thread(s)`);
        }
      } finally {
        await connection.release();
      }
    },
    20_000,
  );
});

interface ResponseEnvelope {
  id?: number;
  result?: unknown;
  error?: unknown;
}

async function responseFor(
  lines: AsyncIterator<string>,
  id: number,
): Promise<ResponseEnvelope> {
  while (true) {
    const line = await lines.next();
    if (line.done) {
      throw new Error(`App Server disconnected while waiting for response ${id}`);
    }
    const message = JSON.parse(line.value) as ResponseEnvelope;
    if (message.id === id) {
      return message;
    }
  }
}
