import { describe, expect, it } from "vitest";

import { createSessionMapModule } from "../src/index.js";
import { MemoryAppServerAdapter } from "../src/testing.js";

const thread = (id: string, updatedAt: number) => ({
  id,
  sessionId: `session-${id}`,
  forkedFromId: null,
  preview: `Preview ${id}`,
  ephemeral: false,
  modelProvider: "openai",
  createdAt: updatedAt - 10,
  updatedAt,
  status: { type: "idle" as const },
  path: null,
  cwd: "D:\\Project\\Example",
  cliVersion: "0.130.0-alpha.5",
  source: "appServer",
  threadSource: null,
  agentNickname: null,
  agentRole: null,
  gitInfo: null,
  name: `Thread ${id}`,
  turns: [],
});

describe("SessionMapModule overview snapshot", () => {
  it("publishes one complete snapshot after handshake and all list pages", async () => {
    const adapter = new MemoryAppServerAdapter({
      initializeResult: {
        userAgent: "codex-test",
        codexHome: "C:\\CodexHome",
        platformFamily: "windows",
        platformOs: "windows",
      },
      threadPages: [
        {
          cursor: null,
          data: [thread("a", 30), thread("b", 20)],
          nextCursor: "page-2",
        },
        {
          cursor: "page-2",
          data: [thread("b", 20), thread("c", 10)],
          nextCursor: null,
        },
      ],
    });

    const module = await createSessionMapModule({
      adapter,
      sourceId: "source-test",
      clientInfo: {
        name: "codex_maps",
        title: "Codex Maps",
        version: "0.1.0",
      },
    });

    const source = module.observe({ kind: "overview" });
    const snapshot = source.getSnapshot();

    expect(source.getSnapshot()).toBe(snapshot);
    expect(snapshot.version).toEqual({
      sourceId: "source-test",
      epoch: 1,
      revision: 1,
    });
    expect(snapshot.sync).toEqual({ phase: "ready", stale: false });
    expect(snapshot.sessions.map((session) => session.id)).toEqual(["a", "b", "c"]);
    expect(adapter.sent.map(({ method, params }) => ({ method, params }))).toEqual([
      {
        method: "initialize",
        params: {
          clientInfo: {
            name: "codex_maps",
            title: "Codex Maps",
            version: "0.1.0",
          },
          capabilities: null,
        },
      },
      { method: "initialized", params: {} },
      {
        method: "thread/list",
        params: {
          cursor: null,
          limit: 100,
          sortKey: "updated_at",
          sortDirection: "desc",
          archived: false,
        },
      },
      {
        method: "thread/list",
        params: {
          cursor: "page-2",
          limit: 100,
          sortKey: "updated_at",
          sortDirection: "desc",
          archived: false,
        },
      },
    ]);

    await module.dispose();
  });
});
