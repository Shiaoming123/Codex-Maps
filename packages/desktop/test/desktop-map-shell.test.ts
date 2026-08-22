import { describe, expect, it } from "vitest";

import { createDesktopMapShell } from "../src/desktop-map-shell.js";

describe("Desktop Map shell", () => {
  it("loads the owned Reader into a sandboxed Electron window", async () => {
    const loadedUrls: string[] = [];
    const createdWindows: Array<{ options: unknown }> = [];
    let releaseCalls = 0;
    let openHandler: (() => unknown) | undefined;
    let navigateHandler: ((event: { preventDefault(): void }, url: string) => void) | undefined;

    const shell = await createDesktopMapShell({
      createReader: async () => ({
        browserUrl: "http://127.0.0.1:41761",
        url: "http://127.0.0.1:41761",
        close: async () => {
          releaseCalls += 1;
        },
      }),
      createWindow(options) {
        createdWindows.push({ options });
        return {
          isDestroyed: () => false,
          focus: () => {},
          loadURL: async (url) => {
            loadedUrls.push(url);
          },
          on: () => {},
          webContents: {
            on: (_event, listener) => {
              navigateHandler = listener;
            },
            setWindowOpenHandler: (listener) => {
              openHandler = listener;
            },
          },
        };
      },
    });

    expect(loadedUrls).toEqual(["http://127.0.0.1:41761"]);
    expect(createdWindows[0]?.options).toMatchObject({
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
        webSecurity: true,
        allowRunningInsecureContent: false,
        webviewTag: false,
      },
    });
    expect(openHandler?.()).toEqual({ action: "deny" });
    let prevented = false;
    navigateHandler?.({ preventDefault: () => { prevented = true; } }, "https://example.com/");
    expect(prevented).toBe(true);

    prevented = false;
    navigateHandler?.({ preventDefault: () => { prevented = true; } }, "not a URL");
    expect(prevented).toBe(true);

    await shell.close();
    await shell.close();
    expect(releaseCalls).toBe(1);
  });
});
