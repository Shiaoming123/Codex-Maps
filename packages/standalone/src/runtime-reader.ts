import { homedir } from "node:os";
import { join } from "node:path";

import {
  createFilesystemCompatSessionMapModule,
  createSessionMapModule,
  StdioAppServerAdapter,
} from "../../session-map/src/index.js";
import { createStandaloneMapReader, type StandaloneMapReader } from "./server.js";

export interface RuntimeReaderOptions {
  accessToken?: string;
  command: string;
  port: number;
  sourceId: string;
}

export function createRuntimeReader(options: RuntimeReaderOptions): Promise<StandaloneMapReader> {
  return createStandaloneMapReader({
    accessToken: options.accessToken,
    host: "127.0.0.1",
    port: options.port,
    createModule: async () =>
      createSessionMapModule({
        adapter: new StdioAppServerAdapter({ command: options.command, args: ["app-server"] }),
        sourceId: options.sourceId,
        clientInfo: {
          name: "codex_maps_standalone",
          title: "Codex Maps Standalone Reader",
          version: "0.1.0",
        },
      }),
  });
}

export interface FilesystemCompatRuntimeReaderOptions {
  accessToken?: string;
  port: number;
  sourceId: string;
  sessionsDirectory?: string;
}

export function createFilesystemCompatRuntimeReader(
  options: FilesystemCompatRuntimeReaderOptions,
): Promise<StandaloneMapReader> {
  return createStandaloneMapReader({
    accessToken: options.accessToken,
    host: "127.0.0.1",
    port: options.port,
    source: { kind: "filesystem-compat", desktopShared: false },
    createModule: async () =>
      createFilesystemCompatSessionMapModule({
        sessionsDirectory: options.sessionsDirectory ?? join(homedir(), ".codex", "sessions"),
        sessionIndexPath: join(homedir(), ".codex", "session_index.jsonl"),
        sourceId: options.sourceId,
      }),
  });
}
