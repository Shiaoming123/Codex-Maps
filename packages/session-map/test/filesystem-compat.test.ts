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

  it("projects only token usage and context-window fields from a token event", () => {
    const projection = projectFilesystemCompatJsonl([
      '{"type":"event_msg","timestamp":"2026-08-22T10:01:00.000Z","payload":{"type":"token_count","info":{"model_context_window":128000,"last_token_usage":{"input_tokens":100,"output_tokens":20,"reasoning_output_tokens":5,"total_tokens":120,"cached_input_tokens":40,"cache_write_input_tokens":3},"total_token_usage":{"input_tokens":1000,"output_tokens":200,"reasoning_output_tokens":50,"total_tokens":1200,"cached_input_tokens":400,"cache_write_input_tokens":30}},"rate_limits":{"plan_type":"private-test-only"}}}',
    ]);

    expect(projection.contextWindow).toBe(128000);
    expect(projection.tokenUsage).toEqual({
      inputTokens: 1000,
      outputTokens: 200,
      reasoningOutputTokens: 50,
      totalTokens: 1200,
      cachedInputTokens: 400,
      cacheWriteInputTokens: 30,
    });
  });

  it("keeps token usage unknown instead of converting malformed values to zero", () => {
    const projection = projectFilesystemCompatJsonl([
      '{"type":"event_msg","timestamp":"2026-08-22T10:01:00.000Z","payload":{"type":"token_count","info":{"model_context_window":"unknown","total_token_usage":{"input_tokens":"not-a-number"}}}}',
    ]);

    expect(projection.contextWindow).toBeNull();
    expect(projection.tokenUsage).toBeNull();
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

  it("uses a local session-index title and keeps the short-id fallback", async () => {
    const directory = await mkdtemp(join(tmpdir(), "codex-maps-title-"));
    const sessionIndexPath = join(directory, "session_index.jsonl");
    await writeFile(
      join(directory, "rollout-title.jsonl"),
      '{"type":"session_meta","timestamp":"2026-08-22T10:00:00.000Z","payload":{"session_id":"session-title","cwd":"D:\\\\Project\\\\Example"}}',
    );
    await writeFile(
      join(directory, "rollout-fallback.jsonl"),
      '{"type":"session_meta","timestamp":"2026-08-22T10:00:00.000Z","payload":{"session_id":"session-fallback","cwd":"D:\\\\Project\\\\Example"}}',
    );
    await writeFile(
      sessionIndexPath,
      '{"id":"session-title","thread_name":"Synthetic Design Session","updated_at":"2026-08-22T10:00:00.000Z"}',
    );
    const module = await createFilesystemCompatSessionMapModule({
      sessionsDirectory: directory,
      sessionIndexPath,
      sourceId: "filesystem-title-test",
      refreshIntervalMs: 250,
    });

    try {
      const source = module.observe({ kind: "overview" });
      await expect.poll(() => source.getSnapshot().sessions.find((session) => session.id === "session-title")?.title, { timeout: 1_000 })
        .toBe("Synthetic Design Session");
      expect(source.getSnapshot().sessions.find((session) => session.id === "session-fallback")?.title)
        .toBe("Session session-");
    } finally {
      await module.dispose();
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("indexes 500 synthetic sessions without dropping the complete snapshot", async () => {
    const directory = await mkdtemp(join(tmpdir(), "codex-maps-many-"));
    await Promise.all(Array.from({ length: 500 }, (_, index) => writeFile(
      join(directory, `rollout-${index}.jsonl`),
      `{"type":"session_meta","timestamp":"2026-08-22T10:00:00.000Z","payload":{"session_id":"session-${index}","cwd":"D:\\\\Project\\\\Example"}}`,
    )));
    const module = await createFilesystemCompatSessionMapModule({
      sessionsDirectory: directory,
      sourceId: "filesystem-many-test",
      refreshIntervalMs: 250,
    });

    try {
      const source = module.observe({ kind: "overview" });
      await expect.poll(() => source.getSnapshot().sessions.length, { timeout: 3_000 })
        .toBe(500);
      expect(source.getSnapshot().sync).toEqual({ phase: "ready", stale: false });
    } finally {
      await module.dispose();
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("distinguishes an empty directory from an unreadable directory", async () => {
    const emptyDirectory = await mkdtemp(join(tmpdir(), "codex-maps-empty-"));
    const unreadableDirectory = await mkdtemp(join(tmpdir(), "codex-maps-unreadable-"));
    await rm(unreadableDirectory, { recursive: true, force: true });
    const emptyModule = await createFilesystemCompatSessionMapModule({
      sessionsDirectory: emptyDirectory,
      sourceId: "filesystem-empty-test",
      refreshIntervalMs: 250,
    });
    const unreadableModule = await createFilesystemCompatSessionMapModule({
      sessionsDirectory: unreadableDirectory,
      sourceId: "filesystem-unreadable-test",
      refreshIntervalMs: 250,
    });

    try {
      const emptySource = emptyModule.observe({ kind: "overview" });
      const unreadableSource = unreadableModule.observe({ kind: "overview" });
      await expect.poll(() => emptySource.getSnapshot().sync.phase, { timeout: 1_000 })
        .toBe("ready");
      await expect.poll(() => unreadableSource.getSnapshot().sync.phase, { timeout: 1_000 })
        .toBe("stale");
      expect(emptySource.getSnapshot().sessions).toHaveLength(0);
      expect(unreadableSource.getSnapshot().sessions).toHaveLength(0);
    } finally {
      await emptyModule.dispose();
      await unreadableModule.dispose();
      await rm(emptyDirectory, { recursive: true, force: true });
    }
  });
});
