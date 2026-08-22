import { randomBytes } from "node:crypto";
import process from "node:process";

import { app, BrowserWindow, Menu, session } from "electron";

import { startElectronDesktopApp } from "./electron-main.js";
import { createDesktopMapShell } from "./desktop-map-shell.js";
import { createRuntimeReader } from "../../standalone/src/runtime-reader.js";

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

async function start(): Promise<void> {
  await startElectronDesktopApp({
    application: app,
    platform: process.platform,
    createShell: async () => {
      app.setAppUserModelId("com.codexmaps.desktop");
      if (process.platform !== "darwin") {
        Menu.setApplicationMenu(null);
      }
      session.defaultSession.setPermissionRequestHandler((_contents, _permission, callback) => {
        callback(false);
      });
      const command = process.env.CODEX_MAPS_CODEX_PATH ?? "codex";
      return createDesktopMapShell({
        createReader: () =>
          createRuntimeReader({
            accessToken: randomBytes(32).toString("base64url"),
            command,
            port: portFromEnvironment(),
            sourceId: `desktop-${process.pid}`,
          }),
        createWindow: (options) => new BrowserWindow(options),
      });
    },
  });
}

void start().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
  app.quit();
});
