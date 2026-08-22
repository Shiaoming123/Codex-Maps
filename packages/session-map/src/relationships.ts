import type { SessionRelationshipGraph, SessionSummary } from "./types.js";

type CandidateRelationship = {
  source: "app-server";
  kind: "fork" | "child-agent";
  parentSessionId: string;
  childSessionId: string;
};

export function deriveSessionRelationships(
  sessions: readonly SessionSummary[],
): SessionRelationshipGraph {
  const knownIds = new Set(sessions.map((session) => session.id));
  const relationships: SessionRelationshipGraph["relationships"] = [];
  const unresolved: SessionRelationshipGraph["unresolved"] = [];
  const conflicts: SessionRelationshipGraph["conflicts"] = [];

  for (const session of sessions) {
    const candidates: CandidateRelationship[] = [];
    if (session.forkedFromId) {
      candidates.push({
        source: "app-server",
        kind: "fork",
        parentSessionId: session.forkedFromId,
        childSessionId: session.id,
      });
    }
    if (session.parentThreadId) {
      candidates.push({
        source: "app-server",
        kind: "child-agent",
        parentSessionId: session.parentThreadId,
        childSessionId: session.id,
      });
    }

    const parentIds = [...new Set(candidates.map((candidate) => candidate.parentSessionId))];
    if (parentIds.length > 1) {
      conflicts.push({
        source: "app-server",
        childSessionId: session.id,
        parentSessionIds: parentIds,
      });
      continue;
    }

    for (const candidate of candidates) {
      if (!knownIds.has(candidate.parentSessionId)) {
        unresolved.push(candidate);
        continue;
      }
      relationships.push({ ...candidate, confidence: "confirmed" });
    }
  }

  return { relationships, unresolved, conflicts };
}
