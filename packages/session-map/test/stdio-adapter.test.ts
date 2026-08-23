import process from "node:process";

import { describe, expect, it } from "vitest";

import { StdioAppServerAdapter } from "../src/stdio.js";

describe("StdioAppServerAdapter", () => {
  it("frames one UTF-8 JSON object per line across a child process", async () => {
    const echoProgram = [
      "const readline = require('node:readline');",
      "const lines = readline.createInterface({ input: process.stdin });",
      "lines.on('line', (line) => process.stdout.write(line + '\\n'));",
    ].join("");
    const adapter = new StdioAppServerAdapter({
      command: process.execPath,
      args: ["-e", echoProgram],
    });

    const connection = await adapter.acquire();
    const lines = connection.lines[Symbol.asyncIterator]();

    await connection.send('{"id":1,"method":"thread/list"}');

    await expect(lines.next()).resolves.toEqual({
      value: '{"id":1,"method":"thread/list"}',
      done: false,
    });

    await connection.release();
  });

  it("turns a closed child input pipe into a rejected send instead of an uncaught EPIPE", async () => {
    const closingProgram = [
      "process.stdin.resume();",
      "process.stdin.destroy();",
      "setTimeout(() => {}, 1_000);",
    ].join("");
    const adapter = new StdioAppServerAdapter({
      command: process.execPath,
      args: ["-e", closingProgram],
    });

    const connection = await adapter.acquire();
    try {
      await new Promise((resolve) => setTimeout(resolve, 250));
      await expect(connection.send("x".repeat(32 * 1024 * 1024))).rejects.toThrow();
    } finally {
      await connection.release();
    }
  });
});
