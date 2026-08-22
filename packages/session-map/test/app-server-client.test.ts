import { describe, expect, it, vi } from "vitest";

import { AppServerRequestTimeoutError, createAppServerClient } from "../src/index.js";
import { MemoryJsonlConnection } from "../src/testing.js";

describe("AppServerClient", () => {
  it("matches concurrent requests when responses arrive in reverse order", async () => {
    const connection = new MemoryJsonlConnection();
    const client = createAppServerClient(connection, { defaultTimeoutMs: 1_000 });

    const first = client.request<{ value: string }>("first", { value: "one" });
    const second = client.request<{ value: string }>("second", { value: "two" });

    await expect.poll(() => connection.sentRequests()).toHaveLength(2);
    connection.respond(2, { value: "second-response" });
    connection.respond(1, { value: "first-response" });

    await expect(second).resolves.toEqual({ value: "second-response" });
    await expect(first).resolves.toEqual({ value: "first-response" });

    await client.dispose();
  });

  it("releases the owned connection exactly once when dispose is repeated", async () => {
    const connection = new MemoryJsonlConnection();
    const client = createAppServerClient(connection, { defaultTimeoutMs: 1_000 });

    await client.dispose();
    await client.dispose();

    expect(connection.releaseCalls).toBe(1);
  });

  it("times out only the missing response and keeps the client usable", async () => {
    vi.useFakeTimers();
    const connection = new MemoryJsonlConnection();
    const client = createAppServerClient(connection, { defaultTimeoutMs: 1_000 });

    try {
      const timedOut = client.request("slow", {}, { timeoutMs: 20 });
      const timeoutAssertion = expect(timedOut).rejects.toBeInstanceOf(AppServerRequestTimeoutError);
      const later = client.request<{ ok: boolean }>("later", {});

      await vi.advanceTimersByTimeAsync(20);
      await timeoutAssertion;

      connection.respond(2, { ok: true });
      await expect(later).resolves.toEqual({ ok: true });
      await client.dispose();
    } finally {
      vi.useRealTimers();
    }
  });

  it("releases its connection after a transport EOF", async () => {
    const connection = new MemoryJsonlConnection();
    const client = createAppServerClient(connection, { defaultTimeoutMs: 1_000 });
    const pending = client.request("first", {});
    const pendingAssertion = expect(pending).rejects.toThrow("app-server disconnected");

    connection.disconnect();

    await pendingAssertion;
    await expect.poll(() => connection.releaseCalls).toBe(1);
    await client.dispose();
    expect(connection.releaseCalls).toBe(1);
  });
});
