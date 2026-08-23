import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { once } from "node:events";
import { createInterface } from "node:readline";

import type {
  AppServerAdapter,
  JsonlConnection,
} from "./types.js";

export interface StdioAppServerAdapterOptions {
  command: string;
  args?: readonly string[];
  cwd?: string;
  shutdownTimeoutMs?: number;
}

export class StdioAppServerAdapter implements AppServerAdapter {
  readonly #options: StdioAppServerAdapterOptions;
  #active = false;

  constructor(options: StdioAppServerAdapterOptions) {
    this.#options = options;
  }

  async acquire(): Promise<JsonlConnection> {
    if (this.#active) {
      throw new Error("StdioAppServerAdapter already has an active owner");
    }

    const child = spawn(this.#options.command, [...(this.#options.args ?? [])], {
      cwd: this.#options.cwd,
      stdio: "pipe",
      windowsHide: true,
    });

    await waitForSpawn(child);
    this.#active = true;

    const reader = createInterface({
      input: child.stdout,
      crlfDelay: Infinity,
    });
    child.stderr.resume();

    let released = false;
    let transportError: Error | null = null;
    const markInactive = () => {
      this.#active = false;
    };
    const markTransportError = (error: Error) => {
      transportError = error;
      markInactive();
    };
    child.on("error", markTransportError);
    child.stdin.on("error", markTransportError);
    child.once("exit", markInactive);

    return {
      lines: {
        async *[Symbol.asyncIterator]() {
          for await (const line of reader) {
            yield line;
          }
        },
      },
      send: async (line) => {
        if (transportError) {
          throw transportError;
        }
        if (released || child.stdin.destroyed || !child.stdin.writable) {
          throw new Error("Cannot write to a released App Server connection");
        }

        await writeLine(child, line);
      },
      release: async () => {
        if (released) {
          return;
        }
        released = true;
        reader.close();

        if (!child.stdin.destroyed) {
          child.stdin.end();
        }

        await stopChild(
          child,
          this.#options.shutdownTimeoutMs ?? 2_000,
        );
        child.removeListener("error", markTransportError);
        child.stdin.removeListener("error", markTransportError);
        child.removeListener("exit", markInactive);
        this.#active = false;
      },
    };
  }
}

async function waitForSpawn(
  child: ChildProcessWithoutNullStreams,
): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const onSpawn = () => {
      child.removeListener("error", onError);
      resolve();
    };
    const onError = (error: Error) => {
      child.removeListener("spawn", onSpawn);
      reject(error);
    };

    child.once("spawn", onSpawn);
    child.once("error", onError);
  });
}

async function writeLine(
  child: ChildProcessWithoutNullStreams,
  line: string,
): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    child.stdin.write(`${line}\n`, "utf8", (error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });
}

async function stopChild(
  child: ChildProcessWithoutNullStreams,
  timeoutMs: number,
): Promise<void> {
  if (child.exitCode !== null || child.signalCode !== null) {
    return;
  }

  const exited = once(child, "exit").then(() => undefined);
  const timedOut = await Promise.race([
    exited.then(() => false),
    delay(timeoutMs).then(() => true),
  ]);

  if (!timedOut || child.exitCode !== null || child.signalCode !== null) {
    return;
  }

  child.kill();
  await once(child, "exit");
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}
