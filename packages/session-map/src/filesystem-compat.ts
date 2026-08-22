import { readdir, readFile, stat } from "node:fs/promises";
import { join } from "node:path";

import type {
  ExecutionState,
  FilesystemCompatProjection,
  FilesystemCompatSessionMapModuleOptions,
  SessionMapModule,
  SessionMapSnapshot,
  SessionSummary,
  SnapshotSource,
} from "./types.js";

type JsonRecord = Record<string, unknown>;

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
    if (Object.is(snapshot, this.#snapshot)) return;
    this.#snapshot = snapshot;
    for (const listener of [...this.#listeners]) listener();
  }
}

function record(value: unknown): JsonRecord | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as JsonRecord)
    : null;
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function epochSeconds(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value > 1_000_000_000_000 ? Math.floor(value / 1_000) : Math.floor(value);
  }
  if (typeof value === "string") {
    const parsed = Date.parse(value);
    return Number.isNaN(parsed) ? null : Math.floor(parsed / 1_000);
  }
  return null;
}

function nextExecutionState(eventType: string): ExecutionState | null {
  if (eventType === "task_started") return "running";
  if (eventType === "task_complete") return "completed";
  if (eventType === "turn_aborted") return "interrupted";
  return null;
}

export function projectFilesystemCompatJsonl(lines: Iterable<string>): FilesystemCompatProjection {
  let sessionId: string | null = null;
  let cwd: string | null = null;
  let createdAt: number | null = null;
  let updatedAt: number | null = null;
  let executionState: ExecutionState = "unknown";

  for (const line of lines) {
    let entry: JsonRecord;
    try {
      const candidate = record(JSON.parse(line) as unknown);
      if (!candidate) continue;
      entry = candidate;
    } catch {
      continue;
    }
    const timestamp = epochSeconds(entry.timestamp);
    const payload = record(entry.payload);
    if (!payload) continue;
    if (entry.type === "session_meta") {
      sessionId ??= stringValue(payload.session_id) ?? stringValue(payload.id);
      cwd ??= stringValue(payload.cwd);
      createdAt ??= epochSeconds(payload.timestamp) ?? timestamp;
      updatedAt ??= createdAt;
      continue;
    }
    if (entry.type !== "event_msg") continue;
    const state = nextExecutionState(stringValue(payload.type) ?? "");
    if (!state) continue;
    if (timestamp !== null && (updatedAt === null || timestamp >= updatedAt)) {
      executionState = state;
      updatedAt = timestamp;
    } else if (timestamp === null && updatedAt === null) {
      executionState = state;
    }
  }
  return { sessionId, cwd, createdAt, updatedAt, executionState };
}

async function jsonlFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.map(async (entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return jsonlFiles(path);
    return entry.isFile() && entry.name.endsWith(".jsonl") ? [path] : [];
  }));
  return nested.flat();
}

interface CachedSession {
  modifiedAtMs: number;
  size: number;
  session: SessionSummary | null;
}

async function loadSessions(
  directory: string,
  cache: Map<string, CachedSession>,
): Promise<readonly SessionSummary[]> {
  const paths = await jsonlFiles(directory);
  const sessions = await Promise.all(paths.map(async (path) => {
    const metadata = await stat(path);
    const cached = cache.get(path);
    if (cached && cached.modifiedAtMs === metadata.mtimeMs && cached.size === metadata.size) {
      return cached.session;
    }
    const projection = projectFilesystemCompatJsonl((await readFile(path, "utf8")).split(/\r?\n/));
    if (!projection.sessionId) {
      cache.set(path, { modifiedAtMs: metadata.mtimeMs, size: metadata.size, session: null });
      return null;
    }
    const updatedAt = projection.updatedAt ?? projection.createdAt ?? 0;
    const session: SessionSummary = {
      id: projection.sessionId,
      sessionId: projection.sessionId,
      title: `Session ${projection.sessionId.slice(0, 8)}`,
      preview: "本地兼容模式：仅展示状态和元数据，不呈现对话正文。",
      cwd: projection.cwd ?? "(未提供工作目录)",
      createdAt: projection.createdAt ?? updatedAt,
      updatedAt,
      executionState: projection.executionState,
      goalState: "unknown" as const,
      forkedFromId: null,
      agentNickname: null,
      agentRole: null,
    };
    const frozen = Object.freeze(session);
    cache.set(path, { modifiedAtMs: metadata.mtimeMs, size: metadata.size, session: frozen });
    return frozen;
  }));
  const currentPaths = new Set(paths);
  for (const path of cache.keys()) {
    if (!currentPaths.has(path)) cache.delete(path);
  }
  return Object.freeze(sessions.filter((session): session is SessionSummary => session !== null)
    .sort((left, right) => right.updatedAt - left.updatedAt || left.id.localeCompare(right.id)));
}

function sameSessions(left: readonly SessionSummary[], right: readonly SessionSummary[]): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

export async function createFilesystemCompatSessionMapModule(
  options: FilesystemCompatSessionMapModuleOptions,
): Promise<SessionMapModule> {
  const refreshIntervalMs = options.refreshIntervalMs ?? 1_000;
  if (!Number.isInteger(refreshIntervalMs) || refreshIntervalMs < 250) {
    throw new Error("refreshIntervalMs must be an integer of at least 250ms");
  }
  const cache = new Map<string, CachedSession>();
  const source = new MutableSnapshotSource(Object.freeze({
    schemaVersion: 1,
    version: Object.freeze({ sourceId: options.sourceId, epoch: 1, revision: 1 }),
    sync: Object.freeze({ phase: "loading" as const, stale: false as const }),
    sessions: Object.freeze([]) as readonly SessionSummary[],
  }));
  let refreshing = false;
  const refresh = async () => {
    if (refreshing) return;
    refreshing = true;
    try {
      const nextSessions = await loadSessions(options.sessionsDirectory, cache);
      const previous = source.getSnapshot();
      if (sameSessions(previous.sessions, nextSessions) && previous.sync.phase === "ready") return;
      source.publish(Object.freeze({
        ...previous,
        version: Object.freeze({ ...previous.version, revision: previous.version.revision + 1 }),
        sync: Object.freeze({ phase: "ready" as const, stale: false as const }),
        sessions: nextSessions,
      }));
    } catch {
      const previous = source.getSnapshot();
      if (previous.sync.phase !== "stale") {
        source.publish(Object.freeze({
          ...previous,
          version: Object.freeze({ ...previous.version, revision: previous.version.revision + 1 }),
          sync: Object.freeze({ phase: "stale" as const, stale: true as const }),
        }));
      }
    } finally {
      refreshing = false;
    }
  };
  void refresh();
  const timer = setInterval(() => void refresh(), refreshIntervalMs);
  return {
    observe(query) {
      if (query.kind !== "overview") throw new Error("unsupported Session query");
      return source;
    },
    async dispose() {
      clearInterval(timer);
    },
  };
}
