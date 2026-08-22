import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";

const sessionsDirectory = await mkdtemp(join(tmpdir(), "codex-maps-standalone-smoke-"));
const sessionFile = join(sessionsDirectory, "rollout-smoke.jsonl");
const port = 45000 + (Date.now() % 1000);
const child = spawn(process.execPath, ["build/standalone/src/main.js"], {
  env: {
    ...process.env,
    CODEX_MAPS_PORT: String(port),
    CODEX_MAPS_SESSIONS_DIR: sessionsDirectory,
  },
  stdio: ["ignore", "pipe", "pipe"],
});

async function waitForExit() {
  if (child.exitCode !== null) return;
  await new Promise((resolve) => child.once("exit", resolve));
}

try {
  await writeFile(
    sessionFile,
    [
      JSON.stringify({
        type: "session_meta",
        timestamp: "2026-08-22T10:00:00.000Z",
        payload: {
          session_id: "standalone-smoke-session",
          cwd: sessionsDirectory,
        },
      }),
      JSON.stringify({
        type: "event_msg",
        timestamp: "2026-08-22T10:00:01.000Z",
        payload: { type: "task_started" },
      }),
    ].join("\n"),
  );

  let response;
  for (let attempt = 0; attempt < 40; attempt += 1) {
    try {
      response = await fetch(`http://127.0.0.1:${port}/api/snapshot`);
      break;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }
  assert.equal(response?.status, 200, "standalone Reader did not become ready");
  const payload = await response.json();
  assert.equal(payload.source.kind, "filesystem-compat");
  assert.equal(payload.source.readOnly, true);
  assert.equal(payload.snapshot.sync.phase, "ready");
  assert.equal(payload.snapshot.sessions.length, 1);
  assert.equal(payload.relationships.relationships.length, 0);
  console.log(JSON.stringify({ page: "ready", phase: payload.snapshot.sync.phase, sessions: payload.snapshot.sessions.length }));
} finally {
  child.kill();
  await waitForExit();
  await rm(sessionsDirectory, { recursive: true, force: true });
}
