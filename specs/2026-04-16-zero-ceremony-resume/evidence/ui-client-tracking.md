---
title: "UI client-tracking for idle-shutdown — investigation"
description: "Investigation of OQ-1.1: what mechanism should `ok ui` use to know when to idle-shutdown? Result: UI has no WebSocket/SSE of its own today; tying UI lifetime to collab is simpler and avoids new infra."
sources: packages/app/src/server/hocuspocus-plugin.ts, packages/app/src/editor/provider-pool.ts, packages/cli/src/commands/start.ts
created: 2026-04-16
last-updated: 2026-04-16
baseline-commit: 5dab8683
type: synthesis
tags:
  - evidence
  - idle-shutdown
  - investigation
---

# UI client-tracking for idle-shutdown — investigation

**TLDR.** The React UI today has no WebSocket or SSE path served by the UI's HTTP layer itself — the only client↔server WebSocket is Hocuspocus' (the collab path). Post-split, `ok ui` will serve ONLY static assets. The simplest design is to **tie UI lifetime to collab lifetime**: collab tracks clients (existing Hocuspocus hooks), idle-shuts-down after 30 min, and when collab's `destroy()` fires, it also sends SIGTERM to `ui.lock.pid`. No new client-tracking infra in `ok ui` itself.

## Detail

### Current architecture (pre-split)

- `packages/cli/src/commands/start.ts` assembles ONE HTTP server.
- Hocuspocus WebSocket (`/collab`) handles CRDT sync. `onConnect`/`onDisconnect` hooks are available from Hocuspocus but NOT currently wired in `packages/server/src/` (grep: zero matches; F-005 audit correction). Idle-shutdown instead uses the Node HTTP server's `'upgrade'` event directly — see [idle-shutdown-directconnection.md](./idle-shutdown-directconnection.md).
- Static React assets are served by `sirv` on the same HTTP server — sirv does NOT expose a client-connection count (it's stateless HTTP).
- The React app connects to Hocuspocus via `HocuspocusProvider` in `packages/app/src/editor/provider-pool.ts`. The WebSocket is the SOLE bidirectional channel between browser and backend.

### What "UI-client-tracked idle-shutdown" would require

To track clients at the UI-server level, we'd need one of:

- **(a) WebSocket on `ok ui`:** new channel from React app → ok ui server. React app would need to open a dedicated WebSocket (separate from Hocuspocus). New infra. **Rejected: duplicate infrastructure.**
- **(b) HTTP keepalive from React app → ok ui:** client-side `setInterval(fetch('/keepalive'), 30_000)`. Counts live browser tabs. Simple, but chatty (persistent polling). **Workable but wasteful.**
- **(c) SSE from ok ui → React app:** server-sent events channel. React app subscribes on mount; ok ui counts subscribers. Reuses `ok ui`'s HTTP server for state tracking. **Workable.**
- **(d) Tie UI lifetime to collab:** `ok ui` has no own tracking; when `ok start` idle-shuts-down, it sends SIGTERM to `ui.lock.pid` as its final step. UI "borrows" collab's client count. **Cleanest: zero new infra.**

### Why (d) — "UI lifetime tied to collab" — is the right choice

1. **No new infrastructure.** The Node HTTP server's `'upgrade'` event at `/collab` is the authoritative WebSocket-client-count signal. All real clients go through it. (Note: `Hocuspocus.getConnectionsCount()` would ALSO count DirectConnections — CC1 broadcaster + agent sessions — which is NOT what we want. See [idle-shutdown-directconnection.md](./idle-shutdown-directconnection.md) for why.)
2. **Load-bearing semantics match.** If collab has no clients for 30 min, UI is by definition also idle — every live UI session implies an active Hocuspocus WebSocket (that's how CRDT sync works). Tracking UI separately would double-count the same signal.
3. **Symmetric shutdown, asymmetric tracking.** User's answer was "same 30-min idle-shutdown, symmetric for UI and collab" (PQ5). Symmetry of outcome is preserved; we just don't need a separate tracking mechanism for UI. The end-state (both processes exit at the same time) matches user intent.
4. **Greenfield-speed preference.** User-stated PQ9 ("speed > rigor"). Option (d) ships fastest; (a)/(c) add ~1 day for a duplicate infrastructure with no value delta.

### Edge case: browser-only without agent session

If a user opens the UI in their browser (e.g., navigates manually to `http://localhost:<ui-port>`) without an MCP-connected agent, they have a UI session but NO Hocuspocus WebSocket active (no doc open → no provider → no WebSocket). Under design (d), this user's browser tab would be closed by collab's idle shutdown after 30 min.

Counter-argument: this is fine. A user with OK's UI open in a browser but no documents loaded is not doing collaborative work. If they open a document, Hocuspocus connects → collab's idle-timer resets → UI stays up.

**Rule of thumb:** "UI active without collab active" is a degraded state — the UI has nothing to display. Shutting it down is correct.

### Implementation sketch

```typescript
// packages/server/src/idle-shutdown.ts
export function attachIdleShutdown(opts: {
  hocuspocus: Hocuspocus;                // source of client count via onConnect/onDisconnect
  thresholdMs: number;
  onShutdown: () => Promise<void>;
  log?: Logger;
}): { detach: () => void };

// ok start wiring:
attachIdleShutdown({
  hocuspocus,
  thresholdMs: 30 * 60 * 1000,
  onShutdown: async () => {
    // Idle: shut down collab + send SIGTERM to UI lock's pid
    const uiLock = readUiLock(lockDir);
    if (uiLock && isProcessAlive(uiLock.pid)) {
      process.kill(uiLock.pid, 'SIGTERM');
    }
    await destroy();
  },
});

// ok ui needs NO idle-shutdown wiring — relies on collab's SIGTERM.
// Safety net: ok ui self-shutdown after N hours (e.g., 12h) if SIGTERM never arrives (collab crash).
```

**Safety net on `ok ui`:** a long-horizon timeout (e.g., 12h) in case collab crashes and can't SIGTERM the UI. Catches the "UI running forever after collab crash" edge case. This is a defensive backstop, not the primary mechanism.

## Implications for spec

- **FR-1.6 simplifies**: The shared `attachIdleShutdown` helper only needs to wrap Hocuspocus; doesn't need to cover UI-side tracking.
- **FR-1.1 (`ok ui`)** gets a defensive 12h self-shutdown as a safety net, not a primary idle mechanism.
- **OQ-1.1 is resolved** with design (d) — awaiting user confirmation.
- **Symmetry with user's PQ5 answer**: both processes exit on 30-min idle; the tracking signal is shared (collab-side).

## Pointers

- `packages/cli/src/commands/start.ts:76-88` — `createServer()` returns `{hocuspocus, destroy, ...}`.
- `packages/server/src/standalone.ts` — wires Hocuspocus hooks to existing subsystems (reconciliation, shadow repo).
- `packages/app/src/editor/provider-pool.ts` — React app's Hocuspocus WebSocket client; single channel for browser↔collab.
- `packages/app/src/server/hocuspocus-plugin.ts` — Vite plugin for `bun run dev` (not used at runtime for `ok start`).

## Gaps / follow-ups

- Verify safety-net 12h self-shutdown doesn't interfere with long agentic sessions (e.g., 8-hour research run). If 12h is too short, push to 24h.
- Confirm Hocuspocus `onConnect`/`onDisconnect` hooks fire for every provider — including those using `openDirectConnection` (server-side, not WebSocket-bound). If `openDirectConnection` doesn't trigger hooks, we need to count it separately.
