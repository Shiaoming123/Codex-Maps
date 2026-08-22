export interface ElectronApplication {
  whenReady(): Promise<void>;
  requestSingleInstanceLock(): boolean;
  quit(): void;
  on(
    event: "activate" | "before-quit" | "second-instance" | "window-all-closed",
    listener: () => void,
  ): void;
}

export interface ElectronDesktopShell {
  openMainWindow(): Promise<void>;
  close(): Promise<void>;
}

export interface StartElectronDesktopAppOptions {
  application: ElectronApplication;
  platform: NodeJS.Platform;
  createShell(): Promise<ElectronDesktopShell>;
}

export interface ElectronDesktopRuntime {
  close(): Promise<void>;
}

export async function startElectronDesktopApp(
  options: StartElectronDesktopAppOptions,
): Promise<ElectronDesktopRuntime | null> {
  if (!options.application.requestSingleInstanceLock()) {
    options.application.quit();
    return null;
  }

  await options.application.whenReady();
  const shell = await options.createShell();
  let closing = false;
  const close = async (): Promise<void> => {
    if (closing) {
      return;
    }
    closing = true;
    await shell.close();
  };
  const closeAndQuit = () => {
    void close().finally(() => options.application.quit());
  };

  await shell.openMainWindow();
  options.application.on("activate", () => void shell.openMainWindow());
  options.application.on("second-instance", () => void shell.openMainWindow());
  options.application.on("window-all-closed", () => {
    if (options.platform !== "darwin") {
      closeAndQuit();
    }
  });
  options.application.on("before-quit", () => void close());

  return { close };
}
