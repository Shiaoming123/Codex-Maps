import { describe, expect, it } from "vitest";

import { deriveSessionRelationships } from "../src/relationships.js";
import type { SessionSummary } from "../src/types.js";

function session(
  id: string,
  overrides: Partial<SessionSummary> = {},
): SessionSummary {
  return {
    id,
    sessionId: `session-${id}`,
    title: `Session ${id}`,
    preview: "Synthetic preview",
    cwd: "D:\\Project\\Example",
    createdAt: 10,
    updatedAt: 20,
    executionState: "idle",
    goalState: "unknown",
    forkedFromId: null,
    parentThreadId: null,
    agentNickname: null,
    agentRole: null,
    ...overrides,
  };
}

describe("deriveSessionRelationships", () => {
  it("returns a confirmed fork edge when the parent is present", () => {
    expect(
      deriveSessionRelationships([
        session("root"),
        session("fork", { forkedFromId: "root" }),
      ]),
    ).toEqual({
      relationships: [
        {
          source: "app-server",
          kind: "fork",
          parentSessionId: "root",
          childSessionId: "fork",
          confidence: "confirmed",
        },
      ],
      unresolved: [],
      conflicts: [],
    });
  });

  it("returns a confirmed child-agent edge from parentThreadId", () => {
    expect(
      deriveSessionRelationships([
        session("root"),
        session("agent", {
          parentThreadId: "root",
          agentNickname: "Atlas",
          agentRole: "research",
        }),
      ]),
    ).toEqual({
      relationships: [
        {
          source: "app-server",
          kind: "child-agent",
          parentSessionId: "root",
          childSessionId: "agent",
          confidence: "confirmed",
        },
      ],
      unresolved: [],
      conflicts: [],
    });
  });

  it("keeps a missing parent as an explicit unresolved relationship", () => {
    expect(
      deriveSessionRelationships([
        session("agent", { parentThreadId: "missing", agentNickname: "Atlas" }),
      ]),
    ).toEqual({
      relationships: [],
      unresolved: [
        {
          source: "app-server",
          kind: "child-agent",
          parentSessionId: "missing",
          childSessionId: "agent",
        },
      ],
      conflicts: [],
    });
  });

  it("suppresses edges when fork and parent records disagree", () => {
    expect(
      deriveSessionRelationships([
        session("root-a"),
        session("root-b"),
        session("child", {
          forkedFromId: "root-a",
          parentThreadId: "root-b",
          agentNickname: "Atlas",
        }),
      ]),
    ).toEqual({
      relationships: [],
      unresolved: [],
      conflicts: [
        {
          source: "app-server",
          childSessionId: "child",
          parentSessionIds: ["root-a", "root-b"],
        },
      ],
    });
  });
});
