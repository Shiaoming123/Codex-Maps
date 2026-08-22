import process from "node:process";

import { createSessionMapModule, StdioAppServerAdapter } from "../../session-map/src/index.js";
import { createStandaloneMapReader } from "./server.js";

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
  const reader = await createStandaloneMapReader({
    host: "127.0.0.1",
    port: portFromEnvironment(),
    createModule: async () =>
      createSessionMapModule({
        adapter: new StdioAppServerAdapter({ command, args: ["app-server"] }),
        sourceId: `standalone-${process.pid}`,
        clientInfo: {
          name: "codex_maps_standalone",
          title: "Codex Maps Standalone Reader",
          version: "0.1.0",
        },
      }),
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
