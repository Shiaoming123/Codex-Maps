import type {
  JsonlConnection,
  ProtocolThread,
  SessionMapModule,
  SessionMapModuleOptions,
  SessionMapSnapshot,
  SessionSummary,
  SnapshotSource,
} from "./types.js";

interface ResponseEnvelope {
  id: number;
  result?: unknown;
  error?: { code?: number; message?: string };
}

interface ThreadListResponse {
  data: ProtocolThread[];
  nextCursor: string | null;
}

class AppServerRequestError extends Error {
  constructor(method: string, error: ResponseEnvelope["error"]) {
    super(`${method} failed: ${error?.message ?? "unknown error"}`);
    this.name = "AppServerRequestError";
  }
}

class StableSnapshotSource implements SnapshotSource<SessionMapSnapshot> {
  readonly #snapshot: SessionMapSnapshot;

  constructor(snapshot: SessionMapSnapshot) {
    this.#snapshot = snapshot;
  }

  getSnapshot = (): SessionMapSnapshot => this.#snapshot;

  subscribe = (_listener: () => void): (() => void) => () => undefined;
}

class RequestChannel {
  readonly #connection: JsonlConnection;
  readonly #iterator: AsyncIterator<string>;
  #nextId = 1;

  constructor(connection: JsonlConnection) {
    this.#connection = connection;
    this.#iterator = connection.lines[Symbol.asyncIterator]();
  }

  async notify(method: string, params: unknown): Promise<void> {
    await this.#connection.send(JSON.stringify({ method, params }));
  }

  async request<T>(method: string, params: unknown): Promise<T> {
    const id = this.#nextId++;
    await this.#connection.send(JSON.stringify({ id, method, params }));

    while (true) {
      const next = await this.#iterator.next();
      if (next.done) {
        throw new Error(`app-server disconnected while waiting for ${method}`);
      }

      let message: ResponseEnvelope;
      try {
        message = JSON.parse(next.value) as ResponseEnvelope;
      } catch {
        throw new Error("app-server returned malformed JSON");
      }

      if (message.id !== id) {
        continue;
      }
      if (message.error) {
        throw new AppServerRequestError(method, message.error);
      }
      return message.result as T;
    }
  }
}

function executionState(thread: ProtocolThread): SessionSummary["executionState"] {
  if (thread.status.type === "systemError") {
    return "failed";
  }
  if (thread.status.type === "active") {
    return thread.status.activeFlags.length > 0 ? "waiting" : "running";
  }
  if (thread.status.type === "idle") {
    return "idle";
  }
  return "unknown";
}

function normalizeThread(thread: ProtocolThread): SessionSummary {
  return {
    id: thread.id,
    sessionId: thread.sessionId,
    title: thread.name?.trim() || thread.preview.split("\n", 1)[0]?.trim() || "(untitled)",
    preview: thread.preview,
    cwd: thread.cwd,
    createdAt: thread.createdAt,
    updatedAt: thread.updatedAt,
    executionState: executionState(thread),
    goalState: "unknown",
    forkedFromId: thread.forkedFromId,
    agentNickname: thread.agentNickname,
    agentRole: thread.agentRole,
  };
}

async function loadAllThreads(channel: RequestChannel): Promise<ProtocolThread[]> {
  const byId = new Map<string, ProtocolThread>();
  const seenCursors = new Set<string>();
  let cursor: string | null = null;

  while (true) {
    const page: ThreadListResponse = await channel.request<ThreadListResponse>("thread/list", {
      cursor,
      limit: 100,
      sortKey: "updated_at",
      sortDirection: "desc",
      archived: false,
    });

    for (const thread of page.data) {
      const existing = byId.get(thread.id);
      if (existing && JSON.stringify(existing) !== JSON.stringify(thread)) {
        throw new Error(`conflicting duplicate thread ${thread.id} during pagination`);
      }
      byId.set(thread.id, thread);
    }

    if (page.nextCursor === null) {
      break;
    }
    if (seenCursors.has(page.nextCursor)) {
      throw new Error(`thread/list repeated cursor ${page.nextCursor}`);
    }
    seenCursors.add(page.nextCursor);
    cursor = page.nextCursor;
  }

  return [...byId.values()].sort((left, right) => right.updatedAt - left.updatedAt);
}

export async function createSessionMapModule(
  options: SessionMapModuleOptions,
): Promise<SessionMapModule> {
  const connection = await options.adapter.acquire();
  const channel = new RequestChannel(connection);

  try {
    await channel.request("initialize", {
      clientInfo: options.clientInfo,
      capabilities: null,
    });
    await channel.notify("initialized", {});

    const sessions = (await loadAllThreads(channel)).map(normalizeThread);
    const snapshot: SessionMapSnapshot = Object.freeze({
      schemaVersion: 1,
      version: Object.freeze({
        sourceId: options.sourceId,
        epoch: 1,
        revision: 1,
      }),
      sync: Object.freeze({ phase: "ready", stale: false }),
      sessions: Object.freeze(sessions),
    });
    const source = new StableSnapshotSource(snapshot);

    return {
      observe(query) {
        if (query.kind !== "overview") {
          throw new Error("unsupported Session query");
        }
        return source;
      },
      async dispose() {
        await connection.release();
      },
    };
  } catch (error) {
    await connection.release();
    throw error;
  }
}
