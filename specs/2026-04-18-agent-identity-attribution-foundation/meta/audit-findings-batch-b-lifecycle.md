---
title: Audit findings — batch B (session lifecycle + persistence + remote-origin)
scope: Decisions D27-D32, FR-2, FR-14, FR-16
artifact: specs/2026-04-18-agent-identity-attribution-foundation/SPEC.md
evidence_reviewed:
  - specs/2026-04-18-agent-identity-attribution-foundation/evidence/session-lifecycle.md
  - specs/2026-04-18-agent-identity-attribution-foundation/evidence/history-and-sweep.md
code_reviewed:
  - packages/cli/src/mcp/server.ts
  - packages/cli/src/mcp/keepalive.ts
  - packages/cli/src/commands/start.ts
  - packages/server/src/agent-sessions.ts
  - packages/server/src/persistence.ts
  - packages/server/src/agent-focus.ts
  - ~/.claude/oss-repos/hocuspocus/packages/server/src/{MessageReceiver,Hocuspocus,DirectConnection,types}.ts
  - ~/.claude/oss-repos/hocuspocus/packages/provider/src/HocuspocusProviderWebsocket.ts
audit_date: 2026-04-18
directive: Greenfield — no deferred tech debt; correctness/clean-codebase over expediency
total_findings: 6 (1 HIGH, 2 MEDIUM, 2 PRAGMATISM, 1 LOW)
---

# Audit findings — batch B (session lifecycle)

## D27 — Keepalive correlation via URL query

### Summary

Simplest workable option for correlating keepalive WS to connectionId. Same-channel-as-liveness eliminates two-channel desync. All code-trace claims verified.

### Claims verified

| Claim | File:Line | Status |
|---|---|---|
| Client opens `/collab/keepalive?pid=${process.pid}` with only `pid` today | `packages/cli/src/mcp/keepalive.ts:137` | CONFIRMED — `const url = \`${baseUrl}/collab/keepalive?pid=${process.pid}\`;` |
| Server at upgrade handler ignores pid query | `packages/cli/src/commands/start.ts:434-456` | CONFIRMED — handler intercepts `/collab/keepalive` with no `req.url` parsing; just calls `wss.handleUpgrade` + a ping timer |
| connectionId known at MCP subprocess startup | `packages/cli/src/mcp/server.ts:290` | CONFIRMED — `const connectionId = randomUUID();` |
| `clearFocus(agentId)` ready for wiring | `packages/server/src/agent-focus.ts:41-47` | CONFIRMED — `clearFocus` function exists, documented "No Path A caller uses it today; Path B session-end logic will" |

### Severity: LOW (with PRAGMATISM flag on "Keep `pid` for idle-shutdown logging compat")

### Notes

**PRAGMATISM.** After the connectionId query lands, `pid` is redundant — the server can log whatever the upgrade handler stashes; any log line that needs a pid can read from Pino's auto-contextualization or from the connectionId-indexed session map. The "keep pid for compat" language preserves dead weight without acknowledging it. Under the greenfield directive ("clean codebase"), the correct move is to drop `pid` or explicitly document its unique-purpose-beyond-connectionId. Currently the evidence says "Keep `pid` for idle-shutdown logging compat" which is thin justification.

**Forward-compat concern.** Plaintext `connectionId` in WS URL query is fine for localhost stdio MCP today (no trust boundary crossed — the subprocess spawned the server or shares the machine). If MCP transport evolves to HTTP/SSE across untrusted network, this connectionId becomes a linkable identifier across logs + git-log author emails (`agent-<connectionId>@openknowledge.local`). D15 correctly defers attestation, but the spec should note that the query-param mechanism is transport-correctness-dependent.

### Suggested resolution

- Drop `pid` from the URL once connectionId lands, OR document its orthogonal purpose (process-level tracking distinct from session-level tracking) and explain why two IDs are needed.
- Add a sentence to D27 or D15 noting that URL-query correlation is a localhost-transport assumption; revisit under HTTP/SSE MCP transport.

---

## D28 — 30s cancellable grace on WS close

### Summary

Grace window matches HocuspocusProvider's `messageReconnectTimeout` default. Mechanism (pending timer + upgrade-cancels) is sound. Claims verified.

### Claims verified

| Claim | File:Line | Status |
|---|---|---|
| HocuspocusProvider `messageReconnectTimeout` default = 30s | `~/.claude/oss-repos/hocuspocus/packages/provider/src/HocuspocusProviderWebsocket.ts:123` | CONFIRMED — `messageReconnectTimeout: 30000` |
| ConnectionChecker runs every `messageReconnectTimeout / 10` | `HocuspocusProviderWebsocket.ts:200` | CONFIRMED |
| Reconnecting keepalive keeps same `connectionId` (closure capture) | `keepalive.ts:121-158` + `server.ts:290-349` | CONFIRMED — `connectionId` lives in the MCP subprocess's `run()` closure; reconnect loop at keepalive.ts:121 reuses `opts.resolveWsUrl` but the caller's `connectionId` is constant for the subprocess lifetime |

### Severity: LOW

### Notes

**Clear design.** Reconnect keeps same connectionId → grace timer cancels on upgrade → session continuity preserved. Restart spawns new subprocess → new connectionId → no cancel-match → grace timer fires → old session cleaned.

**One edge the spec doesn't enumerate.** If the keepalive WS drops but the MCP subprocess stays alive (e.g. server restarts, server-side upgrade handler throws, reverse-proxy hiccup), the grace timer runs to completion because the server hasn't seen the new upgrade yet. If the MCP subprocess's reconnect backoff (1s → 2s → 4s → … 30s) lands its reconnect **after** the 30s grace window, the session is torn down and the next tool call recreates fresh state with a different writer-ID → split attribution. This is a narrow race. Under 30s default grace + 1-30s backoff, the race window is dominated by whether the first reconnect attempt lands in ≤30s; with initial backoff 1s + exponential, it lands well before. Only pathological server-side downtime >30s hits this. Worth noting as an observation, not a blocker.

---

## D29 — Subprocess restart = always new session

### Summary

Fresh `connectionId = randomUUID()` per subprocess start produces fresh session. No resume-by-label mechanism. Verified.

### Claims verified

| Claim | File:Line | Status |
|---|---|---|
| `connectionId` regenerated each MCP subprocess start | `packages/cli/src/mcp/server.ts:290` | CONFIRMED — `const connectionId = randomUUID();` fires once per `run()` invocation, which is once per subprocess lifetime |
| No persistence of connectionId across restarts | (none) | CONFIRMED by absence — no `readConnectionIdFromDisk()` or similar. `principal.json` persists principal, NOT connectionId |

### Severity: LOW

### Notes

**Not pragmatism.** Deferring resume-by-label ("user research surfaces pain") is a legitimate product-scope boundary — the feature doesn't exist, not broken. Greenfield directive applies to tech debt (shipping broken), not to product-scope choices (shipping fewer features with clean architecture).

**Implication the spec doesn't elaborate.** Every subprocess restart creates a new `refs/wip/<branch>/agent-<newUUID>` ref. Under FR-18's 30d GC, these refs accumulate on active projects. A user who restarts MCP 20× in a development session produces 20 refs in 24 hours. The GC won't reap them for 30d. Not a bug (disk + ref-storage cost is trivial), but the P4 journey's mental model of "one agent = one ref" becomes "one session = one ref" in practice. Worth a `(ref count grows per restart; GC at 30d keeps it bounded)` footnote in §8.6 or D29.

---

## D30 — `AgentSessionManager.getSession` in-flight promise dedup

### Summary

Latent race exists in current code exactly as described. Proposed fix is correct and F1-load-bearing (not just defensive).

### Claims verified

| Claim | File:Line | Status |
|---|---|---|
| Race pattern `sessions.has(key)` → `await openDirectConnection` → `sessions.set(key)` at agent-sessions.ts:188-219 | `packages/server/src/agent-sessions.ts:188-219` | CONFIRMED — `getSession` method spans 188-219. `let dc = this.sessions.get(key); if (!dc) { dc = (await this.hocuspocus.openDirectConnection(docName)) as AgentDirectConnection; ... this.sessions.set(key, dc); }` |
| Side effects (awareness.setLocalState) happen BEFORE `sessions.set` | `agent-sessions.ts:202-212` | CONFIRMED — `awareness.setLocalState` at line 202, `this.sessions.set` at 212. Two concurrent calls both set awareness twice, create two DirectConnections |
| Under F1, race produces double UM registration | — | LOGICAL-CONFIRMED: F1 spec §8.2 creates per-session UM at `getSession` birth; if birth runs twice for same key, two UMs register on same Y.Text → duplicate undo recording |
| Proposed dedup fix (Map<sessionKey, Promise>) is correct | — | CONFIRMED — standard in-flight promise dedup pattern; `finally { sessionsInFlight.delete(key); }` runs AFTER `sessions.set(key, dc)` inside the promise body, so subsequent callers hit `sessions.get(key)` before `sessionsInFlight.delete`; no race |

### Severity: MEDIUM

### Notes

**Wording concern.** Evidence file (`session-lifecycle.md:53-54`) calls this a "LATENT BUG." SPEC D30 says "latent race fix." The race is latent TODAY because:
1. It produces an orphaned DirectConnection that leaks `directConnectionsCount` (observable but not loud).
2. It sets awareness twice (second wins; no UX damage).
3. No per-session UM exists today.

Under F1 (shipping in this spec), the race becomes **active**: two UMs on one Y.Text is silent data-corruption (undo behavior depends on stack-capture order). Spec language should be elevated from "latent race fix" to "F1-prerequisite race fix" or "load-bearing under F1" so future readers don't de-prioritize it as nice-to-have.

**Implementation footgun.** The proposed fix creates the Promise synchronously, then awaits. If the promise body throws BEFORE the `finally` block captures the cleanup, the `sessionsInFlight` Map leaks a rejected promise. Future callers await that rejected promise and get the same error forever. Recommended shape in implementation: wrap the IIFE body in try/catch with the reject path also deleting from `sessionsInFlight` (not just the `finally` on the outer `try { return await p; }`). This is a known pattern with in-flight promise dedup. Worth calling out in FR-2 acceptance criteria or D30 rationale.

### Suggested resolution

Rewrite D30 "Rationale" column to:

> Current code has **F1-blocking race**: `sessions.has(key)` → `await openDirectConnection` → `sessions.set(key)` is not async-safe. Under single-UM today the race produces an orphaned DirectConnection (observable leak, not data-corruption). Under F1 per-session UM, the race produces **double UM registration on same Y.Text → silent duplicate-undo-recording**. Fix is load-bearing, not defensive.

Add to FR-2 acceptance: "In-flight promise cleanup runs on both resolve and reject paths; a failed first-call does not leak a rejected promise in `sessionsInFlight`."

---

## D31 — `onStoreDocument` signature threading = one-file change

### Summary

Claim verified cleanly. Hocuspocus payload type is additive; `persistence.ts:405` is indeed the only repo consumer.

### Claims verified

| Claim | File:Line | Status |
|---|---|---|
| `persistence.ts:405` is the sole runtime consumer of `onStoreDocumentPayload` in the repo | `packages/server/src/persistence.ts:405` + grep of repo | CONFIRMED via Grep — only `persistence.ts:405` destructures the payload in `@inkeep/*` packages. Test files reference type but don't implement the hook |
| `onStoreDocumentPayload` already includes `lastTransactionOrigin: unknown` and `lastContext: Context` | `~/.claude/oss-repos/hocuspocus/packages/server/src/types.ts:357-362` | CONFIRMED — `interface onStoreDocumentPayload<Context = any> { ... lastContext: Context; lastTransactionOrigin: unknown; ... }` |
| No other Hocuspocus extension in `standalone.ts:173-232` hooks `onStoreDocument` | `packages/server/src/standalone.ts` | CONFIRMED — persistence extension is the only `onStoreDocument` producer in standalone wiring |

### Severity: LOW

### Notes

Clean decision. Destructure extension is type-additive, no upstream dep change. Forward-compat fine under Hocuspocus minor bumps (additive payload fields are a v4-era convention — see `RELEASE_NOTES_V4.md:159-174` renaming `context` → `lastContext` and `transactionOrigin` → `lastTransactionOrigin`).

**Forward-compat caveat.** If Hocuspocus v5 ships and renames `lastTransactionOrigin` again, D31's "one-file change" becomes "two-file change" only if a type alias is extracted. Not a spec-level issue; implementation detail.

---

## D32 — Remote-arrived origin structured dispatch

### Summary

Hocuspocus wraps remote WS transactions with `{source:'connection', connection}` — verified at BOTH call sites in `MessageReceiver.ts` (188 readSyncStep2, 215 readUpdate). Branch coverage of `resolveWriterId` handles known cases but has one significant footgun.

### Claims verified

| Claim | File:Line | Status |
|---|---|---|
| Remote transactions wrapped as `{source:'connection', connection}` | `~/.claude/oss-repos/hocuspocus/packages/server/src/MessageReceiver.ts:188-194` (readSyncStep2) AND `:215-221` (readUpdate) | CONFIRMED at BOTH sites. Evidence cites "188-220" which elides the readUpdate site at :215. Both are real code paths |
| TransactionOrigin union = `local | connection | redis` | `~/.claude/oss-repos/hocuspocus/packages/server/src/types.ts:7-25` | CONFIRMED — exactly three variants |
| `isTransactionOrigin` exported from Hocuspocus | `types.ts:27-38` | CONFIRMED |
| `connection.context` is populated by `onConnect`/`onAuthenticate` hooks | `~/.claude/oss-repos/hocuspocus/packages/server/src/Hocuspocus.ts` (broadcast — observed via import of Connection.ts) | CONFIRMED by Hocuspocus convention. Connection.context is load-bearing for server extensions |

### Severity: MEDIUM (footgun in branch coverage under DirectConnection non-override path)

### Notes

**Missing branch — DirectConnection.transact() override.** The `resolveWriterId` function in the evidence covers:
- `{source:'local'}` + `ctx.session_id` → agent writer
- `{source:'local'}` + no ctx.session_id → service fallback
- `{source:'connection'}` + principalId → human principal
- `{source:'connection'}` + no principalId → service fallback
- else (redis, etc.) → service fallback

But `DirectConnection.transact()` at `~/.claude/oss-repos/hocuspocus/packages/server/src/DirectConnection.ts:34-44` **hardcodes** `{source: 'local', context: this.context}` — where `this.context` defaults to `{}` if no context was passed to `openDirectConnection()`. The spec's `applyAgentMarkdownWrite` uses `dc.document.transact(fn, AGENT_WRITE_ORIGIN)` (raw `document.transact`, NOT `dc.transact`), so the override doesn't fire for agent writes today. HOWEVER:

1. If a future F1 implementer uses `dc.transact()` thinking it's equivalent (it's not — the name is tempting; the API is non-intuitive), the origin becomes `{source:'local', context: {}}` and `resolveWriterId` returns `openknowledge-service`. Silent misattribution.

2. `DirectConnection.disconnect()` at DirectConnection.ts:46-64 calls `storeDocumentHooks` with `lastTransactionOrigin: {source: 'local', context: this.context}`. Every agent session disconnect fires `onStoreDocument` with a `{source:'local'}` origin whose context MAY or MAY NOT have session_id depending on whether the DirectConnection was opened with context. Under current spec, `AgentSessionManager.getSession()` calls `hocuspocus.openDirectConnection(docName)` without context → `dc.context = {}` → the disconnect store-hook writes are attributed to `openknowledge-service`. Every session's final write gets dropped into the service writer.

**Suggested resolution.** Either:
- (a) Pass session context to `openDirectConnection(docName, sessionContext)` so `dc.context.session_id` is populated and `DirectConnection.transact()` + `DirectConnection.disconnect()` correctly route. This requires adding `openDirectConnection` to take a context arg — which Hocuspocus supports per `Hocuspocus.ts:593` signature.
- (b) Add an explicit FR / D32-extension noting that session-manager `openDirectConnection` call MUST pass the session's context with `session_id` populated, so the DirectConnection's override path stays correct.
- (c) Ban `dc.transact()` in an AGENTS.md STOP rule or inline comment, force all agent writes to `dc.document.transact(fn, session.origin)`.

The evidence file Q29 doesn't mention this. The spec's session-context population for DirectConnection is load-bearing but implicit.

**Second missing branch — redis source.** TransactionOrigin can be `{source:'redis'}` per types.ts:12-14. The evidence's `resolveWriterId` falls through to `openknowledge-service` — which is correct (Open Knowledge doesn't use the redis extension today), but if a future deployment enables the Hocuspocus redis extension for multi-node, redis-sourced writes all attribute to service. Fine for now; worth a forward-compat note.

### Suggested resolution

Add to D32 (or a new D-EXT):

> **DirectConnection context requirement.** Any `openDirectConnection(docName)` call in the session-manager MUST pass a context object containing `session_id` (and principalId for human-hoisted sessions). The Hocuspocus `DirectConnection.transact()` and `DirectConnection.disconnect()` APIs hardcode the transaction origin to `{source:'local', context: this.context}` — if context is `{}` (current default), cross-CRDT observer writes and session-teardown writes misroute to `openknowledge-service` instead of the session's writer-ID. Spec impl at `agent-sessions.ts:199` changes from `hocuspocus.openDirectConnection(docName)` to `hocuspocus.openDirectConnection(docName, { session_id: agentId, principal: principalId })`.

Also add STOP rule: "Do not use `dc.transact()` for agent writes — always use `dc.document.transact(fn, session.origin)` to keep origin-identity guarantees."

---

## Cross-cutting: forward-compat under Hocuspocus major bumps

The evidence leans on Hocuspocus v4 payload shapes (`lastTransactionOrigin`, `lastContext` — renamed from v3). If Hocuspocus v5 changes these again:
- D31 becomes one-file change still (still a single consumer).
- D32 could break if `TransactionOrigin` union changes — `source === "connection"` check is structural; if v5 replaces `{source:'connection', connection}` with `{kind:'ws', peer}`, `resolveWriterId` silently falls through to `openknowledge-service` for ALL remote writes.

Recommendation: the `resolveWriterId` implementation should import Hocuspocus's `isTransactionOrigin` type guard directly (exported at types.ts:27) rather than duck-type the `source` field. This pins the behavior to Hocuspocus's own type contract.

---

## Confirmed claims (summary)

- D27 client/server keepalive wiring pattern (keepalive.ts:137, start.ts:434-456)
- D27 connectionId + pid both knowable at subprocess startup (server.ts:290)
- D28 30s HocuspocusProvider default (HocuspocusProviderWebsocket.ts:123)
- D29 randomUUID() per subprocess (server.ts:290)
- D30 race shape + fix correctness (agent-sessions.ts:188-219)
- D31 payload type already additive (types.ts:357-362); sole consumer at persistence.ts:405
- D32 remote-origin wrap at MessageReceiver.ts:188-194 + :215-221
- D32 TransactionOrigin union (types.ts:7-25)

## Unverifiable claims

- None at this scope. All cited file:line references resolved successfully.

## Pragmatism calls (directive reminder)

Under "No deferred tech debt on greenfield":
- **D27 "Keep `pid` for idle-shutdown logging compat"** — mild PRAGMATISM. Once connectionId lands, pid is duplicative; keeping it "for compat" preserves cognitive load for future readers. LOW severity, flag-and-decide.
- **D29 "Resume-by-label deferred"** — NOT pragmatism. Product-scope boundary, not tech-debt deferral. Clean.
- **D30 "Latent race fix"** — wording PRAGMATISM. The race is F1-active, not latent. Should elevate language per Resolution above.
- **D32 DirectConnection context gap** — architecture/coverage gap, MEDIUM. Not pragmatism; missing claim.

## Summary of severities

| Finding | Severity |
|---|---|
| D32 DirectConnection context gap (agent disconnect + future `dc.transact()` misattribution) | MEDIUM |
| D30 language should elevate "latent" to "F1-blocking" | MEDIUM |
| D27 "keep pid for compat" is mild duplication | PRAGMATISM (LOW severity) |
| D30 in-flight promise rejection-cleanup requires explicit handling | PRAGMATISM (LOW severity) |
| D27 plaintext connectionId in URL query — transport-correctness dependent (future HTTP/SSE) | LOW |
| D29 ref-count-per-restart implication | LOW (note-worthy, not actionable) |

No HIGH findings in this batch — decisions are materially correct; the one architecture gap (D32 DirectConnection context) is addressable without re-opening a locked decision.
