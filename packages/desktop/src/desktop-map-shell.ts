import type { StandaloneMapReader } from "../../standalone/src/server.js";

export interface DesktopWindowOptions {
  width: number;
  height: number;
  minWidth: number;
  minHeight: number;
  title: string;
  webPreferences: {
    contextIsolation: true;
    nodeIntegration: false;
    sandbox: true;
    webSecurity: true;
    allowRunningInsecureContent: false;
    webviewTag: false;
  };
}

interface NavigationEvent {
  preventDefault(): void;
}

export interface DesktopWindow {
  isDestroyed(): boolean;
  focus(): void;
  loadURL(url: string): Promise<void>;
  on(event: "closed", listener: () => void): void;
  webContents: {
    on(event: "will-navigate", listener: (event: NavigationEvent, url: string) => void): void;
    setWindowOpenHandler(listener: () => { action: "deny" }): void;
  };
}

export interface DesktopMapShellOptions {
  createReader(): Promise<StandaloneMapReader>;
  createWindow(options: DesktopWindowOptions): DesktopWindow;
}

export interface DesktopMapShell {
  openMainWindow(): Promise<void>;
  close(): Promise<void>;
}

const MAIN_WINDOW_OPTIONS: DesktopWindowOptions = {
  width: 1440,
  height: 940,
  minWidth: 1024,
  minHeight: 720,
  title: "Codex Maps",
  webPreferences: {
    contextIsolation: true,
    nodeIntegration: false,
    sandbox: true,
    webSecurity: true,
    allowRunningInsecureContent: false,
    webviewTag: false,
  },
};

export async function createDesktopMapShell(
  options: DesktopMapShellOptions,
): Promise<DesktopMapShell> {
  const reader = await options.createReader();
  let mainWindow: DesktopWindow | null = null;
  let closePromise: Promise<void> | null = null;

  const openMainWindow = async (): Promise<void> => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.focus();
      return;
    }
    const window = options.createWindow(MAIN_WINDOW_OPTIONS);
    mainWindow = window;
    const readerPageUrl = reader.browserUrl;
    const readerOrigin = new URL(readerPageUrl).origin;
    window.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
    window.webContents.on("will-navigate", (event, targetUrl) => {
      let targetOrigin: string;
      try {
        targetOrigin = new URL(targetUrl).origin;
      } catch {
        event.preventDefault();
        return;
      }
      if (targetOrigin !== readerOrigin) {
        event.preventDefault();
      }
    });
    window.on("closed", () => {
      if (mainWindow === window) {
        mainWindow = null;
      }
    });
    await window.loadURL(readerPageUrl);
  };

  await openMainWindow();

  return {
    openMainWindow,
    close() {
      if (!closePromise) {
        closePromise = reader.close();
      }
      return closePromise;
    },
  };
}
