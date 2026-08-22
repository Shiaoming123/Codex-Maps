import process from "node:process";

import { createRuntimeReader } from "./runtime-reader.js";

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
  const command = process.env.CODEX_MAPS_CODEX_PATH ?? "codex";
  const reader = await createRuntimeReader({
    command,
    port: portFromEnvironment(),
    sourceId: `standalone-${process.pid}`,
  });

  process.stdout.write(`Codex Maps 独立只读地图：${reader.url}\n`);
  process.stdout.write("数据源由 Codex Maps 持有，未与当前 Codex Desktop 共享连接。\n");

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
