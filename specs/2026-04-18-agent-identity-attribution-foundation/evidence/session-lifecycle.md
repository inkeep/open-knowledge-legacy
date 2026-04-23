---
title: Session lifecycle, keepalive correlation, persistence origin threading
description: File:line-anchored answers to keepalive → connectionId correlation, false-positive WS close, reconnect semantics, getSession race, onStoreDocument blast radius, remote-arrived origin handling.
tags: [evidence, spec-input, mcp, keepalive, hocuspocus, session-lifecycle]
sources: [packages/cli/src/mcp/keepalive.ts, packages/cli/src/commands/start.ts, packages/server/src/agent-sessions.ts, packages/server/src/persistence.ts, ~/.claude/oss-repos/hocuspocus/packages/server/src/types.ts, ~/.claude/oss-repos/hocuspocus/packages/server/src/Hocuspocus.ts, ~/.claude/oss-repos/hocuspocus/packages/server/src/MessageReceiver.ts]
---

# Session lifecycle + persistence origin threading

## Q17 — Keepalive → connectionId correlation

**LOCK: Option (c) — URL query `?connectionId=<UUID>` on keepalive WS.**

Current plumbing: `keepalive.ts:137` opens `/collab/keepalive?pid=${process.pid}`. Server at `start.ts:434-456` ignores the pid (just counts `/collab*` upgrades for idle-shutdown). Both `connectionId` and `pid` are known at MCP subprocess startup (`server.ts:290`).

Option (c) is simplest and most reliable:
- Client: `/collab/keepalive?pid=${pid}&connectionId=${connectionId}` (one-line change).
- Server: parse via `new URL(req.url, ...)` in upgrade handler, stash on WS instance.
- Close handler: read connectionId from WS, fire `sessionManager.closeAllForAgent(connectionId)` + `agentFocusBroadcaster.clearFocus(connectionId)` (after 30s grace — see Q18).

Alternative (a) handshake-over-WS: more complex, pre-handshake window ambiguity. Alternative (b) HTTP registration: two-channel desync risk.

Keep `pid` for idle-shutdown logging compat.

## Q18 — Grace period on WS close

**LOCK: 30s cancellable grace.** Matches HocuspocusProvider's `messageReconnectTimeout` default (30s silence = presumed-dead). Matches y-protocols awareness-outdated default. Covers typical laptop-sleep + TCP retransmit windows.

Mechanism:
```ts
on ws.close:
  pendingCleanup[connectionId] = setTimeout(() => {
    sessionManager.closeAllForAgent(connectionId);
    agentFocusBroadcaster.clearFocus(connectionId);
    delete pendingCleanup[connectionId];
  }, 30_000);

on ws.upgrade with same connectionId:
  if (pendingCleanup[connectionId]) {
    clearTimeout(pendingCleanup[connectionId]);
    delete pendingCleanup[connectionId];
  }
  // existing session entry in `sessions` map still live — continuity preserved
```

First tool call post-reconnect finds existing `(docName, connectionId)` session — UM, awareness, activity-log all intact.

## Q19 — Subprocess restart semantics

**LOCK: Always new session.** Per-session distinctness (G2) is locked product. Subprocess restart = fresh connectionId = fresh session. Shadow-git history retained via per-writer refs (FR-7) + 30d GC (FR-18). Resume-by-label is deferred to a future opt-in flag if user research surfaces pain.

## Q20 — getSession race condition

**LATENT BUG CONFIRMED.** `agent-sessions.ts:188-219` has `sessions.has(key)` check → `await openDirectConnection()` → `sessions.set(key)`. Two concurrent first-calls race: both see `!dc`, both await, both set — second overwrites first. Orphaned DirectConnection leaks `directConnectionsCount`, double awareness.setLocalState, under F1 = double UM registration on same Y.Text (duplicate undo recording).

**LOCK: Add in-flight promise dedup:**
```ts
private sessionsInFlight = new Map<string, Promise<AgentDirectConnection>>();

async getSession(docName, agentId, identity) {
  const key = this.sessionKey(docName, agentId);
  const existing = this.sessions.get(key);
  if (existing) return existing;
  const inflight = this.sessionsInFlight.get(key);
  if (inflight) return inflight;
  const p = (async () => {
    const dc = await this.hocuspocus.openDirectConnection(docName);
    // awareness, origin, UM creation
    this.sessions.set(key, dc);
    return dc;
  })();
  this.sessionsInFlight.set(key, p);
  try { return await p; } finally { this.sessionsInFlight.delete(key); }
}
```

Test: two concurrent `getSession` calls → exactly one `openDirectConnection` invocation.

## Q28 — onStoreDocument blast radius

**LOCK: One-file change.** Grep-verified: `persistence.ts:405` is the only consumer of `onStoreDocumentPayload` in this repo. No other Hocuspocus extension hooks this event in `standalone.ts:173-232`. Destructure extension from `{document, documentName}` → `{document, documentName, lastTransactionOrigin, lastContext}` is additive (Hocuspocus payload type supports these fields).

## Q29 — Remote-arrived transaction origin shape

**Critical correction to prior assumption.** Remote transactions from Hocuspocus peers have a **structured Hocuspocus origin**, not a Yjs-internal sentinel.

Evidence: `hocuspocus/packages/server/src/MessageReceiver.ts:188-220`:
```ts
readSyncStep2(decoder, document,
  connection ? { source: "connection" as const, connection }
             : (this.defaultTransactionOrigin ?? { source: "local" as const }));
```

So `lastTransactionOrigin` for browser-peer transactions is `{ source: "connection", connection: Connection }`. The `connection.context` is populated by `onConnect`/`onAuthenticate` hooks.

**LOCK: Structured origin dispatch in persistence writer-ID resolver:**
```ts
function resolveWriterId(origin: unknown): WriterId {
  if (!isTransactionOrigin(origin)) return 'openknowledge-service';
  if (origin.source === "local") {
    const ctx = origin.context ?? {};
    if (ctx.session_id) return `agent-${ctx.session_id}`;  // F1 per-session agent
    return 'openknowledge-service';
  }
  if (origin.source === "connection") {
    const pid = origin.connection.context?.principalId;
    if (pid) return pid;  // starts with 'principal-<UUID>'
    return 'openknowledge-service';
  }
  return 'openknowledge-service';  // shouldn't reach (redis skipped)
}
```

Human browser-session attribution requires Q2's hoisting of `principalId` + `tabSessionId` into `connection.context` via `onAuthenticate` hook — tracked in SPEC §11.

## Design recommendations — LOCKED

| ID | Decision |
|---|---|
| DR-17 | Keepalive correlation via URL query `?connectionId=<UUID>` |
| DR-18 | 30s cancellable grace on WS close |
| DR-19 | Subprocess restart = always new session |
| DR-20 | In-flight promise dedup in `getSession` (fixes latent race) |
| DR-28 | onStoreDocument threading = one-file change |
| DR-29 | Structured origin dispatch with `openknowledge-service` fallback |
