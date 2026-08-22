# Codex Maps MVP Follow-up Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Continue Codex Maps from the verified read-only compatibility monitor toward a usable Windows MVP with fast startup, trustworthy session metrics, richer details, and explicit gates for features that still need an official host source.

**Architecture:** Keep `SessionMapModule.observe({ kind: "overview" }) -> SnapshotSource<SessionMapSnapshot>` as the only renderer seam. The local filesystem adapter remains read-only and opt-in by source labeling; it projects only stable metadata/events into the shared snapshot. Native Codex embedding, precise navigation, and mutations remain separate capability gates and are never simulated by the compatibility adapter.

**Tech Stack:** TypeScript, Node.js `fs/promises`, Electron, localhost HTTP/SSE, Vitest, pnpm, Windows Script Host launcher.

**Spec:** `docs/product-brief.md`, `docs/architecture.md`, `docs/adr/0001-session-map-module.md`, `docs/adr/0002-host-bridge-and-release-boundary.md`, `docs/adr/0003-filesystem-compat-monitor.md`, and `docs/issues.md`.

## Global Constraints

- The default current-Desktop source is local, read-only, explicitly labeled `filesystem-compat`, and never writes Codex session files, SQLite, or the installation directory.
- Renderer code consumes snapshots only; JSONL parsing, source capability, stale handling, and platform paths stay in the source/module layer.
- Raw transcript, reasoning, command output, credentials, and real session fixtures never enter the repository, logs, subagent prompts, or public UI payloads.
- `task_complete` ends an execution turn; it does not imply the user’s goal is complete.
- Unknown schema, unsupported Codex build, missing directories, and uncertain mutation results fail closed and remain visible as unknown/stale.
- Every vertical slice must add a synthetic test, run `pnpm verify`, run an appropriate local smoke, update the decision/issues log, and commit only its explicit files.

---

### Task 1: Make the initial compatibility snapshot non-blocking

**Files:**
- Modify: `packages/session-map/src/types.ts`
- Modify: `packages/session-map/src/filesystem-compat.ts`
- Test: `packages/session-map/test/filesystem-compat.test.ts`
- Modify: `packages/standalone/src/page-client.ts`
- Modify: `packages/standalone/src/page.ts`
- Modify: `docs/issues.md`

**Interfaces:**
- `SessionMapSync` gains `{ phase: "loading"; stale: false }`.
- `createFilesystemCompatSessionMapModule(options)` returns a module immediately with an empty loading snapshot, then publishes the first indexed snapshot through the existing source subscription.
- Existing `ready` and `stale` semantics remain unchanged.

- [x] Write a failing test that creates a temporary session directory, creates the module, immediately asserts `sync.phase === "loading"`, then polls until the synthetic session appears with `sync.phase === "ready"`.
- [x] Run `pnpm vitest run packages/session-map/test/filesystem-compat.test.ts`; confirm the new loading assertion fails before implementation.
- [x] Add the loading union member and move the initial `loadSessions` call into the guarded refresh path without allowing overlapping refreshes.
- [x] Render a visible “正在建立本地索引” state and keep the last complete snapshot if a later refresh fails.
- [x] Run the focused test, `pnpm verify`, and a localhost reader smoke that confirms the HTTP server is available before the historical scan finishes.
- [x] Record the initial-index behavior and measured startup improvement in `docs/development-log.md` and `docs/issues.md`, then commit `feat: make compatibility reader load asynchronously`.

### Task 2: Add trustworthy token and context-window metrics

**Files:**
- Modify: `packages/session-map/src/types.ts`
- Modify: `packages/session-map/src/filesystem-compat.ts`
- Test: `packages/session-map/test/filesystem-compat.test.ts`
- Modify: `packages/standalone/src/page-client.ts`
- Modify: `packages/standalone/src/page.ts`
- Modify: `docs/adr/0003-filesystem-compat-monitor.md`

**Interfaces:**
- Add optional `tokenUsage` and `contextWindow` fields to `SessionSummary`; absent values remain `null`/unknown and are never converted to zero.
- Accept only numeric fields from the verified `token_count` event shape; do not expose nested rate-limit/account data.
- The drawer shows “未提供” when the source does not contain a value.

- [x] Inspect only synthetic/metadata field names needed for `token_count`; do not print real event values.
- [x] Write failing tests for numeric token extraction, missing values, malformed objects, and the rule that unknown is not zero.
- [x] Implement the narrow projection and preserve the latest valid event by timestamp.
- [x] Add a compact detail row and one overview metric without adding token data to search or logs.
- [x] Run focused tests, `pnpm verify`, and a real smoke that reports only whether token fields are present and their type, not their values.
- [x] Record unsupported token fields and commit `feat: expose verified token metrics`.

### Task 3: Improve session identity and history usability

**Files:**
- Modify: `packages/session-map/src/filesystem-compat.ts`
- Modify: `packages/standalone/src/page-client.ts`
- Modify: `packages/standalone/src/page.ts`
- Test: `packages/session-map/test/filesystem-compat.test.ts`
- Modify: `docs/issues.md`

**Interfaces:**
- Keep stable session IDs as identity; add a locally derived display label only when its source field is explicitly present.
- Preserve cwd grouping and short-ID fallback when no safe title is available.

- [x] Write tests for explicit safe metadata labels and deterministic short-ID fallback.
- [x] Implement label selection without extracting arbitrary user message text.
- [x] Add loading, empty, stale, and 500+ session interaction checks for search/filter/list fallback.
- [x] Run the browser/page contract tests and a 500-fixture performance smoke.
- [x] Update the MVP issues record and commit `feat: improve session identity display`.

### Task 4: Stabilize realtime freshness and reconnection behavior

**Files:**
- Modify: `packages/session-map/src/filesystem-compat.ts`
- Modify: `packages/session-map/src/types.ts`
- Test: `packages/session-map/test/filesystem-compat.test.ts`
- Modify: `packages/standalone/src/server.ts`
- Modify: `packages/standalone/src/page-client.ts`
- Modify: `docs/development-log.md`

**Interfaces:**
- Every compatible snapshot reports source freshness through existing `sync` plus a bounded `updatedAt`/last-observed timestamp.
- SSE reconnect always receives a complete latest snapshot; no event replay or raw JSONL transport is added.

- [x] Write tests for a refresh failure, recovery, truncated append, and duplicate unchanged refresh with no revision increment.
- [x] Implement failure/recovery transitions and preserve the last good sessions.
- [x] Show the last successful observation time and distinguish loading, ready, stale, and browser transport error.
- [x] Run `pnpm verify` and an SSE reconnect smoke.
- [x] Record the measured update latency and commit `feat: harden compatibility freshness`.

### Task 5: Keep official-data features behind explicit capability gates

**Files:**
- Modify: `packages/session-map/src/types.ts`
- Modify: `packages/session-map/src/module.ts`
- Modify: `packages/session-map/src/host-bridge.ts`
- Test: `packages/session-map/test/host-bridge.test.ts`
- Test: `packages/session-map/test/session-map.test.ts`
- Modify: `docs/capability-matrix.md`
- Modify: `docs/issues.md`

**Interfaces:**
- No UI control is enabled solely because a method name exists in a generated contract.
- `thread/read`, project/Section fields, precise navigation, and mutations require a source capability and an evidence-backed adapter.

- [ ] Add capability tests for unavailable project, navigation, pin, archive, delete, and title sources.
- [x] Keep compatibility mode read-only and make unsupported controls explain the missing source rather than silently failing.
- [ ] Run contract tests against synthetic generated-contract fixtures; do not use real session content.
- [x] Update the capability matrix and commit `chore: tighten unsupported capability gates`.

### Task 6: Build the relationship-map vertical slice when source evidence exists

**Files:**
- Modify: `packages/session-map/src/types.ts`
- Modify: `packages/session-map/src/module.ts`
- Test: `packages/session-map/test/session-map.test.ts`
- Modify: `packages/standalone/src/page-client.ts`
- Modify: `packages/standalone/src/page.ts`
- Modify: `docs/decision-log.md`

**Interfaces:**
- Relationships carry `source`, `kind`, and confidence; missing parent/agent data renders list fallback rather than an inferred edge.
- The first view is a bounded tree/branch detail, not an unrestricted force graph.

- [ ] Add reducer tests for a confirmed fork, a child agent, missing parent, and conflicting relationship records.
- [ ] Implement only fields present in the validated source contract.
- [ ] Add the second-level relationship view and a clear unavailable state.
- [ ] Run UI and source tests, then commit `feat: add evidence-backed relationship view`.

### Task 7: Package and verify supported desktop targets

**Files:**
- Modify: `packages/desktop/src/main.ts`
- Create/Modify: packaging configuration under `packages/desktop/`
- Test: `packages/desktop/test/`
- Modify: `docs/desktop-delivery-plan.md`
- Modify: `docs/issues.md`

**Interfaces:**
- Windows x64 is the first release target; macOS Apple Silicon is the next smoke target; Linux/WSL remain explicit compatibility matrices.
- Native Host Gate remains separate from standalone packaging and cannot be marked complete by an Electron window alone.

- [ ] Add deterministic build/start/close smoke for the supported target.
- [ ] Add installation/uninstallation and shortcut migration checks before any signed release claim.
- [ ] Verify no Codex installation path is modified and no session content enters artifacts.
- [ ] Record release provenance and commit only after artifact and live startup checks pass.

## Plan Review

- Covered: fast launch/loading, real execution status, token/context visibility, search/history usability, freshness, capability boundaries, relationship visualization, and platform delivery.
- Intentionally not promised: native Codex sidebar attachment, private IPC, DOM/ASAR injection, guessed navigation, destructive writes through private files, or fabricated completion percentages.
- Current execution point: Task 5.
