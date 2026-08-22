import { describe, expect, it } from "vitest";

import { createHostBridgeModule } from "../src/index.js";
import { MemoryHostBridgeAdapter } from "../src/testing.js";
import type { SessionMapSnapshot } from "../src/index.js";

const snapshot: SessionMapSnapshot = {
  schemaVersion: 1,
  version: { sourceId: "desktop-source", epoch: 1, revision: 7 },
  sync: { phase: "ready", stale: false },
  sessions: [],
};

describe("HostBridgeModule", () => {
  it("gives embedded and secondary-window clients one host source and one revision", async () => {
    const adapter = new MemoryHostBridgeAdapter({
      probe: {
        hostId: "desktop-host",
        fingerprint: "known-build",
        capabilities: ["session.read", "thread.navigate"],
      },
      snapshot,
    });
    const bridge = await createHostBridgeModule({
      adapter,
      supportedFingerprints: ["known-build"],
    });

    const embedded = bridge.connect({ id: "embedded", surface: "embedded" });
    const secondary = bridge.connect({ id: "secondary", surface: "secondary-window" });

    expect(adapter.attachCount).toBe(1);
    expect(embedded.source).toBe(secondary.source);
    expect(embedded.source.getSnapshot().version).toEqual({
      sourceId: "desktop-source",
      epoch: 1,
      revision: 7,
    });

    await secondary.openThread("thread-a");
    expect(adapter.openedThreadIds).toEqual(["thread-a"]);

    embedded.dispose();
    expect(secondary.source.getSnapshot()).toBe(snapshot);
    expect(adapter.releaseCount).toBe(0);

    secondary.dispose();
    await bridge.dispose();
    expect(adapter.releaseCount).toBe(1);
  });

  it("fails closed before attaching to an unknown Desktop build", async () => {
    const adapter = new MemoryHostBridgeAdapter({
      probe: {
        hostId: "desktop-host",
        fingerprint: "unknown-build",
        capabilities: ["session.read", "thread.navigate"],
      },
      snapshot,
    });

    await expect(
      createHostBridgeModule({
        adapter,
        supportedFingerprints: ["known-build"],
      }),
    ).rejects.toThrow("unsupported host fingerprint: unknown-build");
    expect(adapter.attachCount).toBe(0);
  });

  it("rejects navigation when the host cannot confirm the exact thread id", async () => {
    const adapter = new MemoryHostBridgeAdapter({
      probe: {
        hostId: "desktop-host",
        fingerprint: "known-build",
        capabilities: ["session.read", "thread.navigate"],
      },
      snapshot,
      openedThreadId: "different-thread",
    });
    const bridge = await createHostBridgeModule({
      adapter,
      supportedFingerprints: ["known-build"],
    });
    const lease = bridge.connect({ id: "embedded", surface: "embedded" });

    await expect(lease.openThread("thread-a")).rejects.toThrow(
      "host opened different-thread instead of thread-a",
    );

    await bridge.dispose();
  });
});
