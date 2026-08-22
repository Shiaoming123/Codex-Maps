import { describe, expect, it } from "vitest";

import { createSessionMapModule } from "../src/index.js";
import { MemoryAppServerAdapter } from "../src/testing.js";

const thread = (id: string, updatedAt: number) => ({
  id,
  sessionId: `session-${id}`,
  forkedFromId: null,
  parentThreadId: null,
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

  it("preserves validated parent and Agent metadata for the relationship view", async () => {
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
          data: [
            thread("root", 30),
            {
              ...thread("agent", 20),
              parentThreadId: "root",
              agentNickname: "Atlas",
              agentRole: "research",
            },
          ],
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

    const agent = module.observe({ kind: "overview" }).getSnapshot().sessions.find((session) => session.id === "agent");
    expect(agent).toMatchObject({
      parentThreadId: "root",
      agentNickname: "Atlas",
      agentRole: "research",
    });

    await module.dispose();
  });

  it("publishes a new revision when a thread status notification arrives", async () => {
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
          data: [thread("a", 30)],
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
    let notifications = 0;
    const unsubscribe = source.subscribe(() => {
      notifications += 1;
    });

    adapter.emitNotification("thread/status/changed", {
      threadId: "a",
      status: { type: "active", activeFlags: [] },
    });

    await expect
      .poll(() => source.getSnapshot().sessions[0]?.executionState, { timeout: 250 })
      .toBe("running");
    expect(source.getSnapshot().version.revision).toBe(2);
    expect(notifications).toBe(1);

    unsubscribe();
    await module.dispose();
  });

  it("keeps a status notification that arrives before the list response", async () => {
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
          data: [thread("a", 30)],
          nextCursor: null,
          notificationsBeforeResponse: [
            {
              method: "thread/status/changed",
              params: {
                threadId: "a",
                status: { type: "active", activeFlags: ["waitingOnUserInput"] },
              },
            },
          ],
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
    const snapshot = module.observe({ kind: "overview" }).getSnapshot();

    expect(snapshot.sessions[0]?.executionState).toBe("waiting");
    expect(snapshot.version.revision).toBe(2);

    await module.dispose();
  });

  it("preserves the last complete snapshot as stale when the transport disconnects", async () => {
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
          data: [thread("a", 30)],
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
    const completeSnapshot = source.getSnapshot();

    adapter.disconnect();

    await expect.poll(() => source.getSnapshot().sync.phase, { timeout: 250 }).toBe("disconnected");
    const staleSnapshot = source.getSnapshot();
    expect(staleSnapshot.sync).toEqual({
      phase: "disconnected",
      stale: true,
      reason: "transport-closed",
    });
    expect(staleSnapshot.sessions).toBe(completeSnapshot.sessions);
    expect(staleSnapshot.version.revision).toBe(2);

    await module.dispose();
  });

  it("rejects an unsupported App Server request instead of swallowing it", async () => {
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
          data: [],
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

    adapter.emitServerRequest(91, "item/commandExecution/requestApproval", {
      threadId: "thread-a",
    });

    await expect
      .poll(
        () => adapter.sent.find((message) => message.id === 91 && message.error !== undefined),
        { timeout: 250 },
      )
      .toEqual({
        id: 91,
        error: {
          code: -32601,
          message: "unsupported server request: item/commandExecution/requestApproval",
        },
      });

    await module.dispose();
  });

  it("does not create or publish a partial Session for an unknown notification id", async () => {
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
          data: [thread("a", 30)],
          nextCursor: null,
          notificationsBeforeResponse: [
            {
              method: "thread/status/changed",
              params: {
                threadId: "unknown-thread",
                status: { type: "active", activeFlags: [] },
              },
            },
          ],
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
    const snapshot = module.observe({ kind: "overview" }).getSnapshot();

    expect(snapshot.sessions.map((session) => session.id)).toEqual(["a"]);
    expect(snapshot.version.revision).toBe(1);

    await module.dispose();
  });

  it("ignores a malformed status notification without disconnecting the reader", async () => {
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
          data: [thread("a", 30)],
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

    adapter.emitNotification("thread/status/changed", {
      threadId: "a",
      status: { type: "active" },
    });
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(source.getSnapshot().sync).toEqual({ phase: "ready", stale: false });
    expect(source.getSnapshot().version.revision).toBe(1);

    await module.dispose();
  });
});
