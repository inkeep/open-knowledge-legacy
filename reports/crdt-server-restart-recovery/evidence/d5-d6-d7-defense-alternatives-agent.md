# Evidence: D5 + D6 + D7 — Defense-in-Depth, Alternatives Pressure-Test, Agent Semantics

**Dimensions:** D5 (defense-in-depth), D6 (alternatives), D7 (agent-write-during-restart)
**Date:** 2026-04-23
**Sources:** Synthesis of D1-D4 findings + Open Knowledge monorepo analysis

---

## D5 — Defense-in-depth: instance ID + unsynced-edit preservation

### Finding D5.1: Binary sidecar is NOT infallible — a secondary check is load-bearing

**Confidence:** CONFIRMED (from D2 Finding 4)

**Evidence:** Three failure modes for `applyUpdate` on corrupt input: infinite loop (unfixed Yjs #479), thrown error, silent partial-apply. The silent partial-apply is the dangerous failure mode — the Y.Doc appears loaded but is missing content. If the binary sidecar suffers ANY of these, the fallback is markdown reconstruction — which re-exposes the original bug class.

**Implication:** A defense-in-depth check catches the residual case where binary-sidecar failed silently or fell through to markdown reconstruction.

### Finding D5.2: Server instance ID via `__system__` + auth token is the minimal defense

**Confidence:** INFERRED (architecture design)

**Evidence:** Two complementary mechanisms:

1. **Server publishes instance ID on `__system__` CC1 channel at startup.** Clients cache it on first receipt.
2. **Client claims cached instance ID in Hocuspocus auth token on every connect.** Server's `onAuthenticate` rejects connection if the claim doesn't match current. Client catches rejection via `authenticationFailed` handler, calls `pool.recycle(docName)` for all open docs, reconnects with null claim.

Combined, these give:
- **Primary defense:** Binary sidecar preserves CRDT identity across restart when available.
- **Secondary defense:** If sidecar fails (corrupt, missing, format-mismatch) and server rebuilds Y.Doc from markdown, instance-ID check catches the mismatch and forces clean recycle BEFORE Yjs sync merges.

The `onAuthenticate` gate runs before any sync-step exchange, eliminating the race window.

**Implication:** Defense-in-depth requires ~30 LOC across three files (server instance ID gen + broadcast + auth check; client cache + claim + recycle handler).

### Finding D5.3: Unsynced-edit preservation requires explicit buffer-and-replay

**Confidence:** INFERRED (from test T4 behavior)

**Evidence:** T4 test demonstrated: with unsynced local changes, the pool does NOT recycle (by design, `provider-pool.ts:260`). Under the instance-ID fix, client would recycle anyway on auth rejection — destroying the Y.Doc and the unsynced edit.

Preservation approach: before calling `pool.recycle(docName)` on instance-ID mismatch, serialize the client's unsynced XmlFragment state to a recovery buffer (e.g., localStorage keyed by docName). After reconnect and sync settles, check the buffer and replay the content as an agent-write-style paired transaction (preserving server clientID domain this time).

Alternative: accept the small UX regression (unsynced local edits lost on restart). Justify as:
- Unsynced edits are "in flight" by definition — the server hasn't acknowledged them.
- Server restart within the flight window is rare in production.
- The alternative (buffer+replay) adds meaningful complexity for an edge case.
- Users DO get an indicator (reconnect banner per D4) so they know to verify.

**Implication:** Buffer-and-replay is the proper fix but is meaningful additional work. Accept the regression for v1; spec a follow-up for v2 if production frequency warrants.

---

## D6 — Alternative approaches pressure-tested

### Alternative A: Always-recycle on disconnect (no binary sidecar)

**Confidence:** CONFIRMED (from debug report + test infrastructure)

**Evaluation:**
- **Pros:** Simple. No new storage format. Uses existing pool recycle mechanism. Zero risk of binary format migration.
- **Cons:** Recycles on EVERY disconnect including transient network blips (hotel WiFi, laptop sleep, momentary server hiccup). Every recycle destroys unsynced edits. UX regression for the 90% case (brief disconnect) to fix the 10% case (server restart).
- **When it would dominate:** If binary sidecar turned out to have frequent corruption issues, Alternative A becomes competitive because its failure mode is benign (lose in-flight UX) vs Alternative C's failure mode (silent partial-apply).
- **Verdict:** Insufficient as primary fix. The "invisible when fast" product bar (D4) demands brief disconnects NOT force recycle.

### Alternative C (recommended): Yjs binary sidecar as cache + markdown as truth

**Confidence:** CONFIRMED (this is the recommendation; detailed in other evidence files)

**Evaluation:**
- **Pros:** Preserves CRDT identity across restart. No data loss (including unsynced edits, because the binary captures them). Composes cleanly with existing primitives (per D3). Validated by Jupyter RTC precedent (per D1). Aligns with markdown-first precedent (per D3 Finding 10).
- **Cons:** Adds a second storage format. Yjs binary format is not self-describing, requiring external header (per D2 Finding 1). Corruption handling is non-trivial (per D2 Finding 4). Sidecar GC policy needs design thought.
- **Verdict:** Recommended primary fix.

### Alternative C': Yjs binary via Hocuspocus's SQLite extension (instead of sidecar file)

**Confidence:** INFERRED

**Evaluation:**
- **Pros:** Uses existing Hocuspocus extension (@hocuspocus/extension-sqlite). Less custom code. Battle-tested in the Hocuspocus ecosystem.
- **Cons:** 
  - The SQLite extension writes its own blob table; coordination with markdown-first persistence requires either running SQLite PLUS current markdown persistence (double-write complexity) or replacing markdown persistence entirely (violates precedent #1).
  - SQLite dependency adds ~1MB bundled size, a native dependency (requires rebuild per platform for Electron), and its own lifecycle concerns.
  - Less transparent for debugging (blob in a DB vs. a file you can inspect).
- **Verdict:** Operationally heavier than sidecar files. Jupyter RTC's `.jupyter_ystore.db` precedent does use SQLite, but Jupyter's use case involves delta-log history which sidecar files don't preserve. For OK's "restart recovery" use case, a single-blob-per-doc sidecar file is sufficient and simpler.

### Alternative D: Delta-log sidecar (mimic y-leveldb / jupyter-collaboration)

**Confidence:** INFERRED

**Evaluation:**
- **Pros:** Preserves undo history across restart (user-visible UX win if the editor has undo beyond the session). Standard pattern in the Yjs ecosystem.
- **Cons:**
  - OK already persists undo history via the shadow repo's per-writer WIP refs (per CLAUDE.md §Shadow repo). The Yjs UndoManager's in-process stack is lost on restart anyway — delta log doesn't fully restore it.
  - Delta logs grow unbounded until compacted, requiring a separate compaction mechanism.
  - More complex storage format; more corruption surface area.
- **Verdict:** Over-engineered for OK's needs. The single-blob snapshot sidecar handles the restart-recovery case; shadow repo handles durable history.

### Alternative E: Move Yjs to client-only, server is stateless merge point

**Confidence:** INFERRED (would be a massive rearchitecture)

**Evaluation:**
- **Pros:** Server restart becomes truly stateless. No CRDT state to preserve.
- **Cons:** Would require removing Hocuspocus entirely. Server-side agent writes (a core feature) rely on server-side Y.Doc for coordination. Would break the entire agent-write surface.
- **Verdict:** Not viable without rewriting the agent-write surface.

### Summary pressure-test

| Alternative | Preserves unsynced edits | Preserves CRDT identity | Composes with OK primitives | Implementation effort | Verdict |
|---|---|---|---|---|---|
| A: Always-recycle | NO | N/A | Yes | Small | Insufficient |
| C: Sidecar file (recommended) | Yes | Yes | Yes | Moderate | **Recommended** |
| C': SQLite extension | Yes | Yes | Partial (coordinates awkwardly) | Moderate + deps | Viable but heavier |
| D: Delta-log sidecar | Yes | Yes + undo | Yes | Large | Over-engineered |
| E: Stateless server | Yes (via client IndexedDB) | Yes | No (rewrites agent-write) | Massive | Not viable |

---

## D7 — Agent-write-during-restart semantics

### Finding D7.1: MCP tool currently returns error on server-unreachable

**Confidence:** CONFIRMED

**Evidence:** `packages/cli/src/mcp/tools/shared.ts:180-200` `httpPost` implementation: `AbortSignal.timeout(30_000)`, network failure → `{ ok: false, error: "Server unreachable: <msg>" }`. The MCP tool returns `isError: true` to the calling AI agent (Claude).

**Implication:** Today's MCP contract is "tool fails; client retries at its own layer." This aligns with stateless RPC semantics.

### Finding D7.2: Agent-retry-at-tool is the industry pattern for stateless REST APIs

**Confidence:** INFERRED

**Evidence:** REST APIs (Stripe, GitHub, Linear) return 5xx on transient server unavailability; clients are expected to implement exponential backoff with idempotency keys. MCP follows this shape — the tool is the API, the agent is the client, retries are the agent's responsibility.

**Implication:** No queue-locally-and-replay is needed at the MCP layer. Claude Code (the caller) has its own retry semantics via prompt-level error handling. If an agent write fails with "Server unreachable", Claude typically waits or asks the user.

### Finding D7.3: Post-restart agent writes are safe under the sidecar fix

**Confidence:** CONFIRMED (from T6 test observation)

**Evidence:** T6 test showed: "pre-restart marker duplicated, post-restart marker appears once." This is because post-restart, the server's Y.Doc is loaded from markdown (fresh clientID, bug manifests) but the agent-write path itself (`applyAgentMarkdownWrite` → `updateYFragment`) does NOT create additional duplication — it just lands on the already-bugged state.

Under the sidecar fix, the Y.Doc is loaded from binary (preserving clientID). Agent-write post-restart lands on a clean Y.Doc. No duplication from either the pre-restart content (sidecar preserved it correctly) or the post-restart write (agent-write is not a bug-class variant).

**Implication:** No special MCP-level handling needed. The sidecar fix at the server level transparently resolves the agent-write-during-restart scenario.

### Finding D7.4: MCP keepalive already handles reconnect gracefully

**Confidence:** CONFIRMED

**Evidence:** `packages/cli/src/mcp/keepalive.ts` reconnects with exponential backoff (1s → 2s → 4s → … capped at 30s). `resolveWsUrl()` is re-called on each attempt, so server-restart-on-new-port is picked up automatically. The MCP `connectionId` UUID is stable across reconnects.

**Implication:** The keepalive WS is robust to server restart. The only gap is: agent writes in the narrow window between "server dies" and "MCP keepalive detects + flags connection as unavailable" might return "Server unreachable" to Claude. Claude's retry handling covers this.

### Summary for D7

No changes required to MCP-side agent write semantics. The sidecar fix at the server level handles the bug class; MCP already uses stateless retry with reconnecting keepalive. Agent writes are "safe" in the sense that post-fix, a failed write returns an error to Claude, and a successful write never duplicates content.

---

## Gaps / follow-ups

- Buffer-and-replay for unsynced edits (D5) deferred — not empirically measured how often users have unsynced edits at server-restart time. Production telemetry would inform priority.
- SQLite extension path (Alternative C') not benchmarked — if Electron desktop packaging complexity turns out to matter more than assumed, revisit.
- Delta-log sidecar's undo-history preservation (Alternative D) may become attractive if OK adds long-undo (beyond session) as a product feature.
