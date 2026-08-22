import type {
  AppServerAdapter,
  HostBridgeAdapter,
  HostBridgeConnection,
  HostProbe,
  JsonlConnection,
  ProtocolThread,
  SessionMapSnapshot,
  SnapshotSource,
} from "./types.js";

interface InitializeResult {
  userAgent: string;
  codexHome: string;
  platformFamily: string;
  platformOs: string;
}

interface MemoryThreadPage {
  cursor: string | null;
  data: ProtocolThread[];
  nextCursor: string | null;
}

export interface MemoryAppServerScenario {
  initializeResult: InitializeResult;
  threadPages: MemoryThreadPage[];
}

interface SentMessage {
  id?: number;
  method: string;
  params: unknown;
}

class AsyncLineQueue implements AsyncIterable<string> {
  readonly #values: string[] = [];
  readonly #waiters: Array<(value: IteratorResult<string>) => void> = [];
  #closed = false;

  push(value: string): void {
    const waiter = this.#waiters.shift();
    if (waiter) {
      waiter({ value, done: false });
      return;
    }
    this.#values.push(value);
  }

  close(): void {
    this.#closed = true;
    for (const waiter of this.#waiters.splice(0)) {
      waiter({ value: undefined, done: true });
    }
  }

  [Symbol.asyncIterator](): AsyncIterator<string> {
    return {
      next: async () => {
        const value = this.#values.shift();
        if (value !== undefined) {
          return { value, done: false };
        }
        if (this.#closed) {
          return { value: undefined, done: true };
        }
        return new Promise<IteratorResult<string>>((resolve) => this.#waiters.push(resolve));
      },
    };
  }
}

export class MemoryAppServerAdapter implements AppServerAdapter {
  readonly sent: SentMessage[] = [];
  readonly #scenario: MemoryAppServerScenario;
  #acquired = false;

  constructor(scenario: MemoryAppServerScenario) {
    this.#scenario = scenario;
  }

  async acquire(): Promise<JsonlConnection> {
    if (this.#acquired) {
      throw new Error("MemoryAppServerAdapter already has an active owner");
    }
    this.#acquired = true;
    const queue = new AsyncLineQueue();

    return {
      lines: queue,
      send: async (line) => {
        const message = JSON.parse(line) as SentMessage;
        this.sent.push(message);

        if (message.method === "initialize" && message.id !== undefined) {
          queue.push(JSON.stringify({ id: message.id, result: this.#scenario.initializeResult }));
          return;
        }
        if (message.method === "thread/list" && message.id !== undefined) {
          const cursor = (message.params as { cursor?: string | null }).cursor ?? null;
          const page = this.#scenario.threadPages.find((candidate) => candidate.cursor === cursor);
          if (!page) {
            queue.push(
              JSON.stringify({
                id: message.id,
                error: { code: -32602, message: `No page for cursor ${cursor}` },
              }),
            );
            return;
          }
          queue.push(
            JSON.stringify({
              id: message.id,
              result: {
                data: page.data,
                nextCursor: page.nextCursor,
                backwardsCursor: null,
              },
            }),
          );
        }
      },
      release: async () => {
        queue.close();
        this.#acquired = false;
      },
    };
  }
}

export interface MemoryHostBridgeScenario {
  probe: HostProbe;
  snapshot: SessionMapSnapshot;
  openedThreadId?: string;
}

class MemorySnapshotSource implements SnapshotSource<SessionMapSnapshot> {
  readonly #snapshot: SessionMapSnapshot;

  constructor(snapshot: SessionMapSnapshot) {
    this.#snapshot = snapshot;
  }

  getSnapshot = (): SessionMapSnapshot => this.#snapshot;

  subscribe = (_listener: () => void): (() => void) => () => undefined;
}

export class MemoryHostBridgeAdapter implements HostBridgeAdapter {
  readonly openedThreadIds: string[] = [];
  attachCount = 0;
  releaseCount = 0;
  readonly #scenario: MemoryHostBridgeScenario;

  constructor(scenario: MemoryHostBridgeScenario) {
    this.#scenario = scenario;
  }

  async probe(): Promise<HostProbe> {
    return this.#scenario.probe;
  }

  async attach(): Promise<HostBridgeConnection> {
    this.attachCount += 1;
    const source = new MemorySnapshotSource(this.#scenario.snapshot);

    return {
      source,
      openThread: async (threadId) => {
        this.openedThreadIds.push(threadId);
        return {
          requestedThreadId: threadId,
          openedThreadId: this.#scenario.openedThreadId ?? threadId,
        };
      },
      release: async () => {
        this.releaseCount += 1;
      },
    };
  }
}
