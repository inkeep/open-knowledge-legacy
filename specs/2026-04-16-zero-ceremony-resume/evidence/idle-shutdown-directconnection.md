---
title: "Idle-shutdown primitive MUST bypass Hocuspocus connection count"
description: "Evidence for D-017 revision: Hocuspocus `getConnectionsCount()` includes DirectConnections; CC1 broadcaster (standalone.ts:861) and AgentSessionManager hold persistent ones. Counting total would prevent idle-shutdown from ever firing. Solution: intercept `httpServer.on('upgrade')` at `/collab` and maintain own WebSocket client counter."
sources: packages/server/src/standalone.ts, packages/server/src/agent-sessions.ts, ~/.claude/oss-repos/hocuspocus (conceptual), auditor F-006, challenger H1
created: 2026-04-16
last-updated: 2026-04-16
baseline-commit: 5dab8683
type: synthesis
tags:
  - evidence
  - idle-shutdown
  - directconnection
  - hocuspocus
---

# Idle-shutdown primitive MUST bypass Hocuspocus connection count

**TLDR.** `Hocuspocus.getConnectionsCount()` returns `directConnectionsCount + webSocketConnectionsCount`. Because `standalone.ts:861` holds a permanent DirectConnection for the `__system__` CC1 broadcaster, the count **never reaches zero** — a naive `attachIdleShutdown({hocuspocus, threshold})` would never fire. Additionally, `AgentSessionManager` holds persistent DirectConnections per agent session, further inflating the count. Solution: intercept WebSocket upgrade events at `/collab` in the Node HTTP server and maintain an independent counter. DirectConnections (CC1 + agent sessions) become invisible to idle-shutdown — exactly the intended behavior.

## Detail

### The failure mode

`Hocuspocus.getConnectionsCount()` (and internal `Document` bookkeeping) increments a single counter on any connection — WebSocket clients AND `openDirectConnection()` consumers. Two known permanent/persistent DirectConnections in this codebase:

1. **CC1 broadcaster** — `packages/server/src/standalone.ts:861` calls `hocuspocus.openDirectConnection(SYSTEM_DOC_NAME)` and holds the reference in `systemDocConnection` for the server's lifetime. Closed only on full server shutdown via `destroy()`. This is a one-time, process-wide connection.
2. **AgentSessionManager** — `packages/server/src/agent-sessions.ts` (per auditor F-006 and challenger H1 cross-verification) keeps persistent DirectConnections per agent session. Connections persist across client reconnects; closed on `destroy()` (process shutdown).

**Implication:** An idle-shutdown primitive that reads `hocuspocus.getConnectionsCount()` will see at least 1 (CC1) plus N (agent sessions) connections *at all times*, even when zero WebSocket clients are connected. The timer never transitions to "firing" state.

### The correct primitive

Use the Node HTTP server's `'upgrade'` event to intercept WebSocket handshakes at the `/collab` path. Maintain an independent counter that increments on upgrade and decrements on `ws.close`. This counter is **the WebSocket client count** — exactly what idle-shutdown should react to.

```typescript
// packages/server/src/idle-shutdown.ts
export function attachIdleShutdown(opts: {
  httpServer: http.Server;
  thresholdMs: number;
  onShutdown: () => Promise<void>;
  log?: Logger;
}): { detach: () => void };
```

Implementation sketch in §9 of SPEC.md.

### What gets counted (and doesn't)

| Event | Counted? | Why |
|---|---|---|
| Browser tab connecting to `/collab` via WebSocket | YES | It's a WebSocket upgrade |
| Agent calling `hocuspocus.openDirectConnection(docName)` | NO | No WebSocket upgrade; internal API |
| CC1 broadcaster holding `__system__` connection | NO | DirectConnection, not WebSocket |
| `AgentSessionManager` session | NO | DirectConnection |
| Vite dev plugin WebSocket (HMR) | NO (not on `/collab`) | Different path |
| Agent sim tool WebSocket | YES if it upgrades on `/collab` | It does, per agent-sim.ts |

### Known edge cases

1. **`ok start` starts with 0 WebSocket clients.** Timer starts immediately; fires in 30 min if nothing connects. Correct behavior — a server with no users should idle down.
2. **Multiple WebSocket connections from one browser tab.** Each counts independently (Hocuspocus per-doc provider model). When all close, count → 0.
3. **WebSocket dropped without graceful close.** `close` event still fires eventually (ping timeout). If not, the timer may extend slightly past 30 min. Not a correctness bug.
4. **Agent-only workloads (no human UI).** An MCP agent using `openDirectConnection` with zero browser clients: WebSocket count = 0 → idle-shutdown fires at 30 min → agent session terminates. This is documented as **NG10** (accepted) — agents are expected to work within user sessions; long-running unattended agentic work is out of scope for this iteration.

### Relationship to NG10 (agent-session cleanup)

NG10 (H4 finding) acknowledges that AgentSessionManager sessions accumulate across reconnects — even ignoring idle-shutdown. The WebSocket-count idle-shutdown means DirectConnections from agent sessions **do not block** idle-shutdown. So:

- If the user has a browser tab open: agent sessions survive as long as the user is active. Idle-shutdown doesn't fire.
- If the user closes their browser and 30 min pass: idle-shutdown fires; agent session state is lost. Acceptable per product priority.
- If agent sessions accumulate memory during a long session: addressable via NG10 follow-up, not this spec.

### Alternatives rejected

- **Count WebSocket via `hocuspocus.server.webSocketServer.clients.size`.** Would work (the ws library's internal set). But that bypasses our test seam — we'd be reaching into Hocuspocus internals. Using the HTTP server's `upgrade` event is our own control point.
- **Track with Hocuspocus `onConnect/onDisconnect` hooks.** Per grep at `packages/server/src/`, these hooks are not currently wired (F-005 audit correction). They could be, but the upgrade-event approach is zero-touch on Hocuspocus and easier to test.
- **Poll WebSocket client count every 60s.** Polling-based idle would still work with the correct source of truth — the counter — but event-driven is more responsive and cheaper.

## Pointers

- `packages/server/src/standalone.ts:861` — permanent CC1 DirectConnection.
- `packages/server/src/agent-sessions.ts` — persistent per-session DirectConnections.
- [meta/audit-findings.md](../meta/audit-findings.md) F-006 — auditor verification.
- [meta/design-challenge.md](../meta/design-challenge.md) H1 — challenger verification from Hocuspocus source.
- Node.js HTTP server docs — `'upgrade'` event semantics.

## Gaps / follow-ups

- Verify the idle-shutdown test that simulates "30 min with 0 WebSocket clients but CC1 active" actually fires (may need a synthetic clock in tests). If not, primitive needs dependency injection of a clock.
- Test that `ws.close` event reliably fires on abrupt disconnect (network drop). May need ping timeout tuning.
- Confirm AgentSessionManager's DirectConnection count actually doesn't matter for any observable behavior besides idle-shutdown — no log spam, no resource leaks in-scope.
