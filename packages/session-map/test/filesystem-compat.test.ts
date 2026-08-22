import { describe, expect, it } from "vitest";
import { appendFile, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  createFilesystemCompatSessionMapModule,
  projectFilesystemCompatJsonl,
} from "../src/index.js";

describe("projectFilesystemCompatJsonl", () => {
  it("projects a synthetic task start as running", () => {
    const projection = projectFilesystemCompatJsonl([
      '{"type":"event_msg","timestamp":"2026-08-22T10:00:00.000Z","payload":{"type":"task_started"}}',
    ]);

    expect(projection.executionState).toBe("running");
  });

  it("projects a synthetic completion as completed", () => {
    const projection = projectFilesystemCompatJsonl([
      '{"type":"event_msg","timestamp":"2026-08-22T10:00:00.000Z","payload":{"type":"task_started"}}',
      '{"type":"event_msg","timestamp":"2026-08-22T10:01:00.000Z","payload":{"type":"task_complete"}}',
    ]);

    expect(projection.executionState).toBe("completed");
  });

  it("projects a synthetic abort as interrupted", () => {
    const projection = projectFilesystemCompatJsonl([
      '{"type":"event_msg","timestamp":"2026-08-22T10:00:00.000Z","payload":{"type":"task_started"}}',
      '{"type":"event_msg","timestamp":"2026-08-22T10:01:00.000Z","payload":{"type":"turn_aborted"}}',
    ]);

    expect(projection.executionState).toBe("interrupted");
  });

  it("safely ignores malformed and truncated synthetic JSONL lines", () => {
    const projection = projectFilesystemCompatJsonl([
      '{"type":"event_msg","timestamp":"2026-08-22T10:00:00.000Z","payload":{"type":"task_started"}}',
      '{"type":"event_msg","payload":',
      'not-json',
    ]);

    expect(projection.executionState).toBe("running");
  });

  it("publishes a local compatibility snapshot when a session file receives a completion", async () => {
    const directory = await mkdtemp(join(tmpdir(), "codex-maps-compat-"));
    const sessionFile = join(directory, "rollout-test.jsonl");
    await writeFile(
      sessionFile,
      [
        '{"type":"session_meta","timestamp":"2026-08-22T10:00:00.000Z","payload":{"session_id":"session-a","cwd":"D:\\\\Project\\\\Example","timestamp":"2026-08-22T10:00:00.000Z"}}',
        '{"type":"event_msg","timestamp":"2026-08-22T10:00:00.000Z","payload":{"type":"task_started"}}',
      ].join("\n"),
    );
    const module = await createFilesystemCompatSessionMapModule({
      sessionsDirectory: directory,
      sourceId: "filesystem-test",
      refreshIntervalMs: 250,
    });

    try {
      const source = module.observe({ kind: "overview" });
      await expect.poll(() => source.getSnapshot().sessions[0]?.executionState, { timeout: 1_000 })
        .toBe("running");
      expect(source.getSnapshot().sessions).toMatchObject([
        { id: "session-a", cwd: "D:\\Project\\Example" },
      ]);

      await appendFile(
        sessionFile,
        '\n{"type":"event_msg","timestamp":"2026-08-22T10:01:00.000Z","payload":{"type":"task_complete"}}',
      );

      await expect.poll(() => source.getSnapshot().sessions[0]?.executionState, { timeout: 1_000 })
        .toBe("completed");
    } finally {
      await module.dispose();
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("publishes loading before the initial historical index becomes ready", async () => {
    const directory = await mkdtemp(join(tmpdir(), "codex-maps-loading-"));
    await writeFile(
      join(directory, "rollout-loading.jsonl"),
      '{"type":"session_meta","timestamp":"2026-08-22T10:00:00.000Z","payload":{"session_id":"session-loading","cwd":"D:\\\\Project\\\\Example"}}\n' +
        '{"type":"event_msg","timestamp":"2026-08-22T10:00:00.000Z","payload":{"type":"task_started"}}',
    );
    const module = await createFilesystemCompatSessionMapModule({
      sessionsDirectory: directory,
      sourceId: "filesystem-loading-test",
      refreshIntervalMs: 250,
    });

    try {
      const source = module.observe({ kind: "overview" });
      expect(source.getSnapshot().sync.phase).toBe("loading");
      await expect.poll(() => source.getSnapshot().sessions[0]?.id, { timeout: 1_000 })
        .toBe("session-loading");
      expect(source.getSnapshot().sync).toEqual({ phase: "ready", stale: false });
    } finally {
      await module.dispose();
      await rm(directory, { recursive: true, force: true });
    }
  });
});
