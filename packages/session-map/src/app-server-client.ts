import type {
  AppServerClient,
  AppServerClientOptions,
  AppServerNotification,
  AppServerRequestOptions,
  JsonlConnection,
} from "./types.js";

interface ResponseEnvelope {
  id: number;
  result?: unknown;
  error?: { code?: number; message?: string };
}

interface PendingRequest {
  method: string;
  resolve(value: unknown): void;
  reject(reason: Error): void;
  timeout: ReturnType<typeof setTimeout>;
}

export class AppServerRequestError extends Error {
  constructor(method: string, error: ResponseEnvelope["error"]) {
    super(`${method} failed: ${error?.message ?? "unknown error"}`);
    this.name = "AppServerRequestError";
  }
}

export class AppServerRequestTimeoutError extends Error {
  constructor(method: string, timeoutMs: number) {
    super(`${method} timed out after ${timeoutMs}ms`);
    this.name = "AppServerRequestTimeoutError";
  }
}

class JsonlAppServerClient implements AppServerClient {
  readonly #connection: JsonlConnection;
  readonly #defaultTimeoutMs: number;
  readonly #pending = new Map<number, PendingRequest>();
  readonly #notificationListeners = new Set<(notification: AppServerNotification) => void>();
  readonly #closeListeners = new Set<(error: Error) => void>();
  #closedError: Error | null = null;
  #nextId = 1;
  #writer: Promise<void> = Promise.resolve();
  #releasePromise: Promise<void> | null = null;

  constructor(connection: JsonlConnection, options: AppServerClientOptions) {
    if (!Number.isFinite(options.defaultTimeoutMs) || options.defaultTimeoutMs <= 0) {
      throw new Error("defaultTimeoutMs must be a positive finite number");
    }
    this.#connection = connection;
    this.#defaultTimeoutMs = options.defaultTimeoutMs;
    void this.#readLoop();
  }

  request<T>(method: string, params: unknown, options?: AppServerRequestOptions): Promise<T> {
    if (this.#closedError) {
      return Promise.reject(this.#closedError);
    }
    const timeoutMs = options?.timeoutMs ?? this.#defaultTimeoutMs;
    if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
      return Promise.reject(new Error("timeoutMs must be a positive finite number"));
    }

    const id = this.#nextId++;
    const response = new Promise<T>((resolve, reject) => {
      const timeout = setTimeout(() => {
        const pending = this.#pending.get(id);
        if (!pending) {
          return;
        }
        this.#pending.delete(id);
        pending.reject(new AppServerRequestTimeoutError(method, timeoutMs));
      }, timeoutMs);
      this.#pending.set(id, {
        method,
        resolve: (value) => resolve(value as T),
        reject,
        timeout,
      });
    });

    void this.#write(JSON.stringify({ id, method, params })).catch((error) => {
      this.#rejectPending(id, error instanceof Error ? error : new Error(String(error)));
    });
    return response;
  }

  notify(method: string, params: unknown): Promise<void> {
    return this.#write(JSON.stringify({ method, params }));
  }

  subscribeNotifications(listener: (notification: AppServerNotification) => void): () => void {
    this.#notificationListeners.add(listener);
    return () => this.#notificationListeners.delete(listener);
  }

  subscribeClosed(listener: (error: Error) => void): () => void {
    this.#closeListeners.add(listener);
    return () => this.#closeListeners.delete(listener);
  }

  async dispose(): Promise<void> {
    if (this.#releasePromise) {
      return this.#releasePromise;
    }
    this.#notificationListeners.clear();
    this.#closeListeners.clear();
    this.#close(new Error("app-server client disposed"));
    return this.#release();
  }

  async #readLoop(): Promise<void> {
    try {
      for await (const line of this.#connection.lines) {
        const message = this.#parse(line);
        if (!message) {
          return;
        }
        await this.#dispatch(message);
      }
      this.#close(new Error("app-server disconnected"));
    } catch (error) {
      this.#close(error instanceof Error ? error : new Error(String(error)));
    }
  }

  #parse(line: string): unknown | null {
    try {
      const message = JSON.parse(line) as unknown;
      if (typeof message !== "object" || message === null || Array.isArray(message)) {
        this.#close(new Error("app-server returned malformed envelope"));
        return null;
      }
      return message;
    } catch {
      this.#close(new Error("app-server returned malformed JSON"));
      return null;
    }
  }

  async #dispatch(message: object): Promise<void> {
    const envelope = message as Record<string, unknown>;
    const hasId = Object.hasOwn(envelope, "id");

    if (typeof envelope.method === "string") {
      if (!hasId) {
        for (const listener of [...this.#notificationListeners]) {
          try {
            listener({ method: envelope.method, params: envelope.params });
          } catch {
            // A consumer cannot be allowed to terminate the shared reader.
          }
        }
        return;
      }
      if (typeof envelope.id !== "number" && typeof envelope.id !== "string") {
        this.#close(new Error("app-server returned malformed server request"));
        return;
      }
      await this.#write(
        JSON.stringify({
          id: envelope.id,
          error: {
            code: -32601,
            message: `unsupported server request: ${envelope.method}`,
          },
        }),
      );
      return;
    }

    if (!hasId || typeof envelope.id !== "number") {
      this.#close(new Error("app-server returned malformed response"));
      return;
    }
    const hasResult = Object.hasOwn(envelope, "result");
    const hasError = Object.hasOwn(envelope, "error");
    if (hasResult === hasError) {
      this.#close(new Error("app-server returned ambiguous response"));
      return;
    }

    const pending = this.#pending.get(envelope.id);
    if (!pending) {
      return;
    }
    this.#pending.delete(envelope.id);
    clearTimeout(pending.timeout);
    if (hasError) {
      pending.reject(new AppServerRequestError(pending.method, envelope.error as ResponseEnvelope["error"]));
      return;
    }
    pending.resolve(envelope.result);
  }

  #write(line: string): Promise<void> {
    const write = this.#writer.then(async () => {
      if (this.#closedError) {
        throw this.#closedError;
      }
      await this.#connection.send(line);
    });
    this.#writer = write.catch((error) => {
      this.#close(error instanceof Error ? error : new Error(String(error)));
    });
    return write;
  }

  #rejectPending(id: number, error: Error): void {
    const pending = this.#pending.get(id);
    if (!pending) {
      return;
    }
    this.#pending.delete(id);
    clearTimeout(pending.timeout);
    pending.reject(error);
  }

  #release(): Promise<void> {
    if (!this.#releasePromise) {
      this.#releasePromise = this.#connection.release();
    }
    return this.#releasePromise;
  }

  #close(error: Error): void {
    if (this.#closedError) {
      return;
    }
    this.#closedError = error;
    for (const [id, pending] of this.#pending) {
      this.#pending.delete(id);
      clearTimeout(pending.timeout);
      pending.reject(error);
    }
    for (const listener of [...this.#closeListeners]) {
      try {
        listener(error);
      } catch {
        // A consumer cannot be allowed to terminate the shared reader.
      }
    }
    void this.#release().catch(() => {
      // The terminal transport error remains the primary failure signal.
    });
  }
}

export function createAppServerClient(
  connection: JsonlConnection,
  options: AppServerClientOptions,
): AppServerClient {
  return new JsonlAppServerClient(connection, options);
}
