import { describe, expect, it } from "vitest";

import { createStandaloneMapReader } from "../src/server.js";
import type {
  SessionMapModule,
  SessionMapSnapshot,
  SnapshotSource,
} from "../../session-map/src/types.js";

function snapshot(): SessionMapSnapshot {
  return {
    schemaVersion: 1,
    version: { sourceId: "standalone-test", epoch: 1, revision: 1 },
    sync: { phase: "ready", stale: false },
    sessions: [],
  };
}

function sourceFor(value: SessionMapSnapshot): SnapshotSource<SessionMapSnapshot> & {
  publish(next: SessionMapSnapshot): void;
} {
  let current = value;
  const listeners = new Set<() => void>();
  return {
    getSnapshot: () => current,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    publish(next) {
      current = next;
      for (const listener of listeners) {
        listener();
      }
    },
  };
}

function moduleFor(source: SnapshotSource<SessionMapSnapshot>): SessionMapModule {
  return {
    observe: () => source,
    dispose: async () => {},
  };
}

let nextPort = 45261;

function createTestReader(source: SnapshotSource<SessionMapSnapshot>) {
  return createStandaloneMapReader({
    createModule: async () => moduleFor(source),
    port: nextPort++,
  });
}

describe("Standalone Map Reader HTTP boundary", () => {
  it("serves an honest standalone snapshot envelope", async () => {
    const reader = await createTestReader(sourceFor(snapshot()));

    try {
      const response = await fetch(`${reader.url}/api/snapshot`);

      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toEqual({
        source: {
          kind: "standalone-app-server",
          desktopShared: false,
          readOnly: true,
          capabilities: [
            "session.read",
            "session.title.read",
            "session.status.read",
            "session.relationship.read",
          ],
        },
        snapshot: snapshot(),
      });
    } finally {
      await reader.close();
    }
  });

  it("publishes explicit read-only capability gates for the filesystem compatibility source", async () => {
    const reader = await createStandaloneMapReader({
      createModule: async () => moduleFor(sourceFor(snapshot())),
      port: nextPort++,
      source: {
        kind: "filesystem-compat",
        desktopShared: false,
        readOnly: true,
        capabilities: [
          "session.read",
          "session.title.read",
          "session.status.read",
          "session.token.read",
        ],
      },
    });

    try {
      const payload = await fetch(`${reader.url}/api/snapshot`).then((response) => response.json());

      expect(payload.source).toEqual({
        kind: "filesystem-compat",
        desktopShared: false,
        readOnly: true,
        capabilities: [
          "session.read",
          "session.title.read",
          "session.status.read",
          "session.token.read",
        ],
      });
      expect(payload.source.capabilities).not.toContain("session.project.read");
      expect(payload.source.capabilities).not.toContain("session.rename");
      expect(payload.source.capabilities).not.toContain("session.pin");
      expect(payload.source.capabilities).not.toContain("session.archive");
      expect(payload.source.capabilities).not.toContain("session.delete");
      expect(payload.source.capabilities).not.toContain("thread.navigate");
    } finally {
      await reader.close();
    }
  });

  it("serves the standalone Map Reader page on the local root route", async () => {
    const reader = await createTestReader(sourceFor(snapshot()));

    try {
      const response = await fetch(`${reader.url}/`);

      expect(response.status).toBe(200);
      await expect(response.text()).resolves.toContain("Codex Maps / 独立只读地图");
    } finally {
      await reader.close();
    }
  });

  it("serves the map-first overview layout from the approved standalone flow", async () => {
    const reader = await createTestReader(sourceFor(snapshot()));

    try {
      const page = await fetch(`${reader.url}/`).then((response) => response.text());

      expect(page).toContain("工作区泳道地图");
      expect(page).toContain('id="view-map"');
      expect(page).toContain('id="session-drawer"');
    } finally {
      await reader.close();
    }
  });

  it("serves an explicit loading state for asynchronous compatibility indexing", async () => {
    const reader = await createTestReader(sourceFor(snapshot()));

    try {
      const script = await fetch(`${reader.url}/assets/app.js`).then((response) => response.text());

      expect(script).toContain("正在建立本机 Session 索引");
      expect(script).toContain("正在建立索引");
    } finally {
      await reader.close();
    }
  });

  it("serves token and context metrics in the session detail client", async () => {
    const reader = await createTestReader(sourceFor(snapshot()));

    try {
      const script = await fetch(`${reader.url}/assets/app.js`).then((response) => response.text());

      expect(script).toContain("Token 用量");
      expect(script).toContain("上下文窗口");
      expect(script).toContain("未提供");
    } finally {
      await reader.close();
    }
  });

  it("requires the per-launch capability token when one is configured", async () => {
    const reader = await createStandaloneMapReader({
      accessToken: "reader-secret",
      createModule: async () => moduleFor(sourceFor(snapshot())),
      port: nextPort++,
    });

    try {
      await expect(fetch(`${reader.url}/api/snapshot`)).resolves.toMatchObject({ status: 403 });
      await expect(fetch(`${reader.url}/api/snapshot?token=reader-secret`)).resolves.toMatchObject({
        status: 200,
      });
      const page = await fetch(reader.browserUrl);
      expect(page.headers.get("content-security-policy")).toContain("script-src 'self'");
    } finally {
      await reader.close();
    }
  });

  it("streams snapshot revisions to a local browser client", async () => {
    const source = sourceFor(snapshot());
    const reader = await createTestReader(source);

    try {
      const response = await fetch(`${reader.url}/api/events`);

      expect(response.headers.get("content-type")).toContain("text/event-stream");
      const stream = response.body?.getReader();
      expect(stream).toBeDefined();
      const first = await stream?.read();
      expect(new TextDecoder().decode(first?.value)).toContain('"revision":1');

      source.publish({
        ...snapshot(),
        version: { sourceId: "standalone-test", epoch: 1, revision: 2 },
      });
      const second = await stream?.read();
      expect(new TextDecoder().decode(second?.value)).toContain('"revision":2');

      await stream?.cancel();
    } finally {
      await reader.close();
    }
  });

  it("sends the latest complete snapshot to a newly connected SSE client", async () => {
    const source = sourceFor(snapshot());
    source.publish({
      ...snapshot(),
      version: { sourceId: "standalone-test", epoch: 1, revision: 4 },
      sessions: [],
    });
    const reader = await createTestReader(source);

    try {
      const response = await fetch(`${reader.url}/api/events`);
      const stream = response.body?.getReader();
      expect(stream).toBeDefined();
      const first = await stream?.read();
      expect(new TextDecoder().decode(first?.value)).toContain('"revision":4');
      await stream?.cancel();
    } finally {
      await reader.close();
    }
  });
});
