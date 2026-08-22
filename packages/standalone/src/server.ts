import { createServer, type Server, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";

import { deriveSessionRelationships } from "../../session-map/src/relationships.js";
import type { SessionMapModule, SessionMapSnapshot } from "../../session-map/src/types.js";
import { standaloneClientScript } from "./page-client.js";
import { standalonePage } from "./page.js";

export interface StandaloneMapReaderOptions {
  accessToken?: string;
  createModule(): Promise<SessionMapModule>;
  host?: string;
  port?: number;
  source?: StandaloneMapReaderSource;
}

export interface StandaloneMapReaderSource {
  kind: "standalone-app-server" | "filesystem-compat";
  desktopShared: false;
  readOnly: true;
  capabilities: readonly ReaderCapability[];
}

export type ReaderCapability =
  | "session.read"
  | "session.title.read"
  | "session.status.read"
  | "session.token.read"
  | "session.project.read"
  | "session.relationship.read"
  | "session.rename"
  | "session.pin"
  | "session.archive"
  | "session.unarchive"
  | "session.delete"
  | "thread.navigate";

export interface StandaloneMapReader {
  readonly browserUrl: string;
  readonly url: string;
  close(): Promise<void>;
}

const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "connect-src 'self'",
  "img-src 'self' data:",
  "object-src 'none'",
  "base-uri 'none'",
  "frame-ancestors 'none'",
].join("; ");

function snapshotEnvelope(snapshot: SessionMapSnapshot, source: StandaloneMapReaderSource): object {
  return {
    source,
    snapshot,
    relationships: deriveSessionRelationships(snapshot.sessions),
  };
}

function closeServer(server: Server): Promise<void> {
  return new Promise((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });
}

export async function createStandaloneMapReader(
  options: StandaloneMapReaderOptions,
): Promise<StandaloneMapReader> {
  const module = await options.createModule();
  const source = module.observe({ kind: "overview" });
  const readerSource: StandaloneMapReaderSource = options.source ?? {
    kind: "standalone-app-server",
    desktopShared: false,
    readOnly: true,
    capabilities: [
      "session.read",
      "session.title.read",
      "session.status.read",
      "session.relationship.read",
    ],
  };
  const eventClients = new Set<ServerResponse>();
  const publishSnapshot = () => {
    const event = `event: snapshot\ndata: ${JSON.stringify(snapshotEnvelope(source.getSnapshot(), readerSource))}\n\n`;
    for (const client of eventClients) {
      client.write(event);
    }
  };
  const unsubscribe = source.subscribe(publishSnapshot);
  const server = createServer((request, response) => {
    const requestUrl = new URL(request.url ?? "/", `http://${request.headers.host ?? "localhost"}`);
    if (options.accessToken && requestUrl.searchParams.get("token") !== options.accessToken) {
      response.writeHead(403, { "content-type": "application/json; charset=utf-8" });
      response.end(JSON.stringify({ error: "forbidden" }));
      return;
    }
    if (request.method === "GET" && requestUrl.pathname === "/") {
      response.writeHead(200, {
        "content-security-policy": CONTENT_SECURITY_POLICY,
        "content-type": "text/html; charset=utf-8",
      });
      response.end(standalonePage(options.accessToken));
      return;
    }
    if (request.method === "GET" && requestUrl.pathname === "/assets/app.js") {
      response.writeHead(200, {
        "content-security-policy": CONTENT_SECURITY_POLICY,
        "content-type": "application/javascript; charset=utf-8",
      });
      response.end(standaloneClientScript());
      return;
    }
    if (request.method === "GET" && requestUrl.pathname === "/api/snapshot") {
      response.writeHead(200, { "content-type": "application/json; charset=utf-8" });
      response.end(JSON.stringify(snapshotEnvelope(source.getSnapshot(), readerSource)));
      return;
    }
    if (request.method === "GET" && requestUrl.pathname === "/api/events") {
      response.writeHead(200, {
        "cache-control": "no-cache",
        connection: "keep-alive",
        "content-type": "text/event-stream; charset=utf-8",
      });
      eventClients.add(response);
      publishSnapshot();
      request.once("close", () => eventClients.delete(response));
      return;
    }
    response.writeHead(404, { "content-type": "application/json; charset=utf-8" });
    response.end(JSON.stringify({ error: "not-found" }));
  });
  const host = options.host ?? "127.0.0.1";
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(options.port ?? 0, host, () => {
      server.removeListener("error", reject);
      resolve();
    });
  });
  const address = server.address() as AddressInfo;
  const url = `http://${host}:${address.port}`;
  let closePromise: Promise<void> | null = null;

  return {
    browserUrl: options.accessToken ? `${url}/?token=${encodeURIComponent(options.accessToken)}` : url,
    url,
    close() {
      if (!closePromise) {
        unsubscribe();
        for (const client of eventClients) {
          client.end();
        }
        eventClients.clear();
        closePromise = closeServer(server).then(() => module.dispose());
      }
      return closePromise;
    },
  };
}
