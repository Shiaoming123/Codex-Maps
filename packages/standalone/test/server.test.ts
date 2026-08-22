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
        },
        snapshot: snapshot(),
      });
    } finally {
      await reader.close();
    }
  });

  it("serves the standalone Map Reader page on the local root route", async () => {
    const reader = await createTestReader(sourceFor(snapshot()));

    try {
      const response = await fetch(`${reader.url}/`);

      expect(response.status).toBe(200);
      await expect(response.text()).resolves.toContain("Codex Maps · 独立只读地图");
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
});
