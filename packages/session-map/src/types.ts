export interface ClientInfo {
  name: string;
  title: string | null;
  version: string;
}

export interface ProtocolThread {
  id: string;
  sessionId: string;
  forkedFromId: string | null;
  parentThreadId?: string | null;
  preview: string;
  createdAt: number;
  updatedAt: number;
  status:
    | { type: "notLoaded" }
    | { type: "idle" }
    | { type: "systemError" }
    | {
        type: "active";
        activeFlags: string[];
      };
  cwd: string;
  agentNickname: string | null;
  agentRole: string | null;
  name: string | null;
  [key: string]: unknown;
}

export type ExecutionState =
  | "running"
  | "waiting"
  | "idle"
  | "completed"
  | "interrupted"
  | "failed"
  | "unknown";

export interface SessionSummary {
  id: string;
  sessionId: string;
  title: string;
  preview: string;
  cwd: string;
  createdAt: number;
  updatedAt: number;
  executionState: ExecutionState;
  goalState: "unknown";
  forkedFromId: string | null;
  parentThreadId: string | null;
  agentNickname: string | null;
  agentRole: string | null;
  tokenUsage?: TokenUsage | null;
  contextWindow?: number | null;
}

export interface TokenUsage {
  inputTokens: number | null;
  outputTokens: number | null;
  reasoningOutputTokens: number | null;
  totalTokens: number | null;
  cachedInputTokens: number | null;
  cacheWriteInputTokens: number | null;
}

export interface SourceVersion {
  sourceId: string;
  epoch: number;
  revision: number;
}

export type SessionMapSync =
  | { phase: "loading"; stale: false }
  | { phase: "ready"; stale: false }
  | { phase: "stale"; stale: true }
  | { phase: "disconnected"; stale: true; reason: "transport-closed" };

export interface SessionMapSnapshot {
  schemaVersion: 1;
  version: SourceVersion;
  sync: SessionMapSync;
  sessions: readonly SessionSummary[];
}

export interface SessionRelationship {
  source: "app-server";
  kind: "fork" | "child-agent";
  parentSessionId: string;
  childSessionId: string;
  confidence: "confirmed";
}

export interface SessionRelationshipGap {
  source: "app-server";
  kind: "fork" | "child-agent";
  parentSessionId: string;
  childSessionId: string;
}

export interface SessionRelationshipConflict {
  source: "app-server";
  childSessionId: string;
  parentSessionIds: readonly string[];
}

export interface SessionRelationshipGraph {
  relationships: SessionRelationship[];
  unresolved: SessionRelationshipGap[];
  conflicts: SessionRelationshipConflict[];
}

export interface SnapshotSource<T> {
  getSnapshot(): T;
  subscribe(listener: () => void): () => void;
}

export type SessionQuery = { kind: "overview" };

export interface SessionMapModule {
  observe(query: SessionQuery): SnapshotSource<SessionMapSnapshot>;
  dispose(): Promise<void>;
}

export interface JsonlConnection {
  readonly lines: AsyncIterable<string>;
  send(line: string): Promise<void>;
  release(): Promise<void>;
}

export interface AppServerNotification {
  method: string;
  params?: unknown;
}

export interface AppServerRequestOptions {
  timeoutMs?: number;
}

export interface AppServerClient {
  request<T>(method: string, params: unknown, options?: AppServerRequestOptions): Promise<T>;
  notify(method: string, params: unknown): Promise<void>;
  subscribeNotifications(listener: (notification: AppServerNotification) => void): () => void;
  subscribeClosed(listener: (error: Error) => void): () => void;
  dispose(): Promise<void>;
}

export interface AppServerClientOptions {
  defaultTimeoutMs: number;
}

export interface AppServerAdapter {
  acquire(): Promise<JsonlConnection>;
}

export interface SessionMapModuleOptions {
  adapter: AppServerAdapter;
  sourceId: string;
  clientInfo: ClientInfo;
}

export interface FilesystemCompatProjection {
  sessionId: string | null;
  cwd: string | null;
  createdAt: number | null;
  updatedAt: number | null;
  executionState: ExecutionState;
  tokenUsage: TokenUsage | null;
  contextWindow: number | null;
}

export interface FilesystemCompatSessionMapModuleOptions {
  sessionsDirectory: string;
  sessionIndexPath?: string;
  sourceId: string;
  refreshIntervalMs?: number;
}

export type HostCapability = "session.read" | "thread.navigate";

export interface HostProbe {
  hostId: string;
  fingerprint: string;
  capabilities: readonly HostCapability[];
}

export interface HostBridgeConnection {
  source: SnapshotSource<SessionMapSnapshot>;
  openThread(threadId: string): Promise<HostNavigationReceipt>;
  release(): Promise<void>;
}

export interface HostNavigationReceipt {
  requestedThreadId: string;
  openedThreadId: string;
}

export interface HostBridgeAdapter {
  probe(): Promise<HostProbe>;
  attach(): Promise<HostBridgeConnection>;
}

export interface HostBridgeClient {
  id: string;
  surface: "embedded" | "secondary-window";
}

export interface HostBridgeLease {
  readonly source: SnapshotSource<SessionMapSnapshot>;
  openThread(threadId: string): Promise<void>;
  dispose(): void;
}

export interface HostBridgeModule {
  connect(client: HostBridgeClient): HostBridgeLease;
  dispose(): Promise<void>;
}

export interface HostBridgeModuleOptions {
  adapter: HostBridgeAdapter;
  supportedFingerprints: readonly string[];
}
