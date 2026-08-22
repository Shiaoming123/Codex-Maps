import { createServer, type Server, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";

import type { SessionMapModule, SessionMapSnapshot } from "../../session-map/src/types.js";
import { standalonePage } from "./page.js";

export interface StandaloneMapReaderOptions {
  createModule(): Promise<SessionMapModule>;
  host?: string;
  port?: number;
}

export interface StandaloneMapReader {
  readonly url: string;
  close(): Promise<void>;
}

function snapshotEnvelope(snapshot: SessionMapSnapshot): object {
  return {
    source: {
      kind: "standalone-app-server",
      desktopShared: false,
    },
    snapshot,
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
  const eventClients = new Set<ServerResponse>();
  const publishSnapshot = () => {
    const event = `event: snapshot\ndata: ${JSON.stringify(snapshotEnvelope(source.getSnapshot()))}\n\n`;
    for (const client of eventClients) {
      client.write(event);
    }
  };
  const unsubscribe = source.subscribe(publishSnapshot);
  const server = createServer((request, response) => {
    if (request.method === "GET" && request.url === "/") {
      response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      response.end(standalonePage());
      return;
    }
    if (request.method === "GET" && request.url === "/api/snapshot") {
      response.writeHead(200, { "content-type": "application/json; charset=utf-8" });
      response.end(JSON.stringify(snapshotEnvelope(source.getSnapshot())));
      return;
    }
    if (request.method === "GET" && request.url === "/api/events") {
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
  let closePromise: Promise<void> | null = null;

  return {
    url: `http://${host}:${address.port}`,
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
