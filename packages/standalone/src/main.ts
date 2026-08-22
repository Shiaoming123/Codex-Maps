import process from "node:process";

import {
  createFilesystemCompatRuntimeReader,
  createRuntimeReader,
} from "./runtime-reader.js";

function portFromEnvironment(): number {
  const raw = process.env.CODEX_MAPS_PORT;
  if (!raw) {
    return 41761;
  }
  const port = Number(raw);
  if (!Number.isInteger(port) || port < 1024 || port > 65535) {
    throw new Error("CODEX_MAPS_PORT must be an integer between 1024 and 65535");
  }
  return port;
}

async function main(): Promise<void> {
  const sourceMode = process.env.CODEX_MAPS_SOURCE ?? "filesystem-compat";
  const reader = sourceMode === "app-server"
    ? await createRuntimeReader({
      command: process.env.CODEX_MAPS_CODEX_PATH ?? "codex",
      port: portFromEnvironment(),
      sourceId: `standalone-${process.pid}`,
    })
    : await createFilesystemCompatRuntimeReader({
      port: portFromEnvironment(),
      sourceId: `filesystem-compat-${process.pid}`,
      sessionsDirectory: process.env.CODEX_MAPS_SESSIONS_DIR,
    });

  process.stdout.write(`Codex Maps 独立只读地图：${reader.url}\n`);
  process.stdout.write(sourceMode === "app-server"
    ? "数据源由 Codex Maps 持有，未与当前 Codex Desktop 共享连接。\n"
    : "数据源为本机 Codex session 文件的只读兼容模式；非官方接口，未共享 Desktop 进程连接。\n");

  let closing = false;
  const close = async () => {
    if (closing) {
      return;
    }
    closing = true;
    await reader.close();
  };
  process.once("SIGINT", () => void close());
  process.once("SIGTERM", () => void close());
}

void main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
