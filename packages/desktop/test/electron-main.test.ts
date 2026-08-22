import { describe, expect, it, vi } from "vitest";

import { startElectronDesktopApp, type ElectronApplication } from "../src/electron-main.js";

class MemoryElectronApplication implements ElectronApplication {
  readonly #listeners = new Map<string, Array<() => void>>();
  quitCalls = 0;

  constructor(private readonly ownsSingleInstanceLock: boolean) {}

  async whenReady(): Promise<void> {}

  requestSingleInstanceLock(): boolean {
    return this.ownsSingleInstanceLock;
  }

  quit(): void {
    this.quitCalls += 1;
  }

  on(event: "activate" | "before-quit" | "second-instance" | "window-all-closed", listener: () => void): void {
    const listeners = this.#listeners.get(event) ?? [];
    listeners.push(listener);
    this.#listeners.set(event, listeners);
  }

  emit(event: "activate" | "before-quit" | "second-instance" | "window-all-closed"): void {
    for (const listener of this.#listeners.get(event) ?? []) {
      listener();
    }
  }
}

describe("Electron desktop lifecycle", () => {
  it("opens the owned Reader once and releases it when Windows closes the last window", async () => {
    const application = new MemoryElectronApplication(true);
    const openMainWindow = vi.fn(async () => {});
    const close = vi.fn(async () => {});

    const runtime = await startElectronDesktopApp({
      application,
      platform: "win32",
      createShell: async () => ({ openMainWindow, close }),
    });

    expect(runtime).not.toBeNull();
    expect(openMainWindow).toHaveBeenCalledTimes(1);

    application.emit("second-instance");
    await vi.waitFor(() => expect(openMainWindow).toHaveBeenCalledTimes(2));

    application.emit("window-all-closed");
    await vi.waitFor(() => expect(close).toHaveBeenCalledTimes(1));
    await vi.waitFor(() => expect(application.quitCalls).toBe(1));
  });

  it("quits without starting a Reader when another instance owns the lock", async () => {
    const application = new MemoryElectronApplication(false);
    const createShell = vi.fn();

    const runtime = await startElectronDesktopApp({
      application,
      platform: "win32",
      createShell,
    });

    expect(runtime).toBeNull();
    expect(createShell).not.toHaveBeenCalled();
    expect(application.quitCalls).toBe(1);
  });

  it("waits for the Reader to close before quitting Windows", async () => {
    const application = new MemoryElectronApplication(true);
    let releaseReader: (() => void) | undefined;
    const closed = new Promise<void>((resolve) => {
      releaseReader = resolve;
    });
    const close = vi.fn(async () => closed);

    await startElectronDesktopApp({
      application,
      platform: "win32",
      createShell: async () => ({ openMainWindow: async () => {}, close }),
    });

    application.emit("window-all-closed");
    await vi.waitFor(() => expect(close).toHaveBeenCalledTimes(1));
    expect(application.quitCalls).toBe(0);

    releaseReader?.();
    await vi.waitFor(() => expect(application.quitCalls).toBe(1));
  });

  it("keeps macOS alive after the last window closes and releases on quit", async () => {
    const application = new MemoryElectronApplication(true);
    const close = vi.fn(async () => {});

    await startElectronDesktopApp({
      application,
      platform: "darwin",
      createShell: async () => ({ openMainWindow: async () => {}, close }),
    });

    application.emit("window-all-closed");
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(close).not.toHaveBeenCalled();
    expect(application.quitCalls).toBe(0);

    application.emit("before-quit");
    await vi.waitFor(() => expect(close).toHaveBeenCalledTimes(1));
    expect(application.quitCalls).toBe(0);
  });
});
