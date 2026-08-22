import type {
  ProtocolThread,
  SessionMapModule,
  SessionMapModuleOptions,
  SessionMapSnapshot,
  SessionSummary,
  SnapshotSource,
} from "./types.js";
import { createAppServerClient } from "./app-server-client.js";

interface ThreadListResponse {
  data: ProtocolThread[];
  nextCursor: string | null;
}

class MutableSnapshotSource implements SnapshotSource<SessionMapSnapshot> {
  #snapshot: SessionMapSnapshot;
  readonly #listeners = new Set<() => void>();

  constructor(snapshot: SessionMapSnapshot) {
    this.#snapshot = snapshot;
  }

  getSnapshot = (): SessionMapSnapshot => this.#snapshot;

  subscribe = (listener: () => void): (() => void) => {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  };

  publish(snapshot: SessionMapSnapshot): void {
    if (Object.is(snapshot, this.#snapshot)) {
      return;
    }
    this.#snapshot = snapshot;
    for (const listener of [...this.#listeners]) {
      listener();
    }
  }
}

function executionState(thread: ProtocolThread): SessionSummary["executionState"] {
  return executionStateFromStatus(thread.status);
}

function executionStateFromStatus(
  status: ProtocolThread["status"],
): SessionSummary["executionState"] {
  if (status.type === "systemError") {
    return "failed";
  }
  if (status.type === "active") {
    return status.activeFlags.length > 0 ? "waiting" : "running";
  }
  if (status.type === "idle") {
    return "idle";
  }
  return "unknown";
}

function decodeThreadStatus(value: unknown): ProtocolThread["status"] | null {
  if (typeof value !== "object" || value === null) {
    return null;
  }
  const candidate = value as { type?: unknown; activeFlags?: unknown };
  if (
    candidate.type === "notLoaded" ||
    candidate.type === "idle" ||
    candidate.type === "systemError"
  ) {
    return { type: candidate.type };
  }
  if (
    candidate.type === "active" &&
    Array.isArray(candidate.activeFlags) &&
    candidate.activeFlags.every((flag) => typeof flag === "string")
  ) {
    return { type: "active", activeFlags: candidate.activeFlags };
  }
  return null;
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
    parentThreadId: thread.parentThreadId ?? null,
    agentNickname: thread.agentNickname,
    agentRole: thread.agentRole,
  };
}

async function loadAllThreads(channel: { request<T>(method: string, params: unknown): Promise<T> }): Promise<ProtocolThread[]> {
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
  const channel = createAppServerClient(connection, { defaultTimeoutMs: 10_000 });
  let source: MutableSnapshotSource | null = null;
  const pendingStatuses = new Map<string, ProtocolThread["status"]>();
  const unsubscribeNotifications = channel.subscribeNotifications((notification) => {
    if (notification.method !== "thread/status/changed") {
      return;
    }
    const params = notification.params as { threadId?: unknown; status?: unknown } | undefined;
    const status = decodeThreadStatus(params?.status);
    if (typeof params?.threadId !== "string" || !status) {
      return;
    }
    if (!source) {
      pendingStatuses.set(params.threadId, status);
      return;
    }

    const previous = source.getSnapshot();
    let changed = false;
    const sessions = previous.sessions.map((session) => {
      if (session.id !== params.threadId) {
        return session;
      }
      changed = true;
      return Object.freeze({
        ...session,
        executionState: executionStateFromStatus(status),
      });
    });
    if (!changed) {
      return;
    }
    source.publish(
      Object.freeze({
        ...previous,
        version: Object.freeze({
          ...previous.version,
          revision: previous.version.revision + 1,
        }),
        sessions: Object.freeze(sessions),
      }),
    );
  });
  const unsubscribeClosed = channel.subscribeClosed(() => {
    if (!source) {
      return;
    }
    const previous = source.getSnapshot();
    if (previous.sync.phase === "disconnected") {
      return;
    }
    source.publish(
      Object.freeze({
        ...previous,
        version: Object.freeze({
          ...previous.version,
          revision: previous.version.revision + 1,
        }),
        sync: Object.freeze({
          phase: "disconnected" as const,
          stale: true as const,
          reason: "transport-closed" as const,
        }),
      }),
    );
  });

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
    source = new MutableSnapshotSource(snapshot);
    for (const [threadId, status] of pendingStatuses) {
      const previous = source.getSnapshot();
      let changed = false;
      const sessions = previous.sessions.map((session) => {
        if (session.id !== threadId) {
          return session;
        }
        changed = true;
        return Object.freeze({ ...session, executionState: executionStateFromStatus(status) });
      });
      if (!changed) {
        continue;
      }
      source.publish(
        Object.freeze({
          ...previous,
          version: Object.freeze({
            ...previous.version,
            revision: previous.version.revision + 1,
          }),
          sessions: Object.freeze(sessions),
        }),
      );
    }
    pendingStatuses.clear();
    const observedSource = source;

    return {
      observe(query) {
        if (query.kind !== "overview") {
          throw new Error("unsupported Session query");
        }
        return observedSource;
      },
      async dispose() {
        unsubscribeNotifications();
        unsubscribeClosed();
        await channel.dispose();
      },
    };
  } catch (error) {
    unsubscribeNotifications();
    unsubscribeClosed();
    await channel.dispose();
    throw error;
  }
}
