# Evidence: B5 — Consumer-side wrapper patterns for Hocuspocus broadcast lifecycle

**Dimension:** B5 — Patch feasibility + established consumer-side wrapper patterns
**Date:** 2026-04-18
**Sources:** `~/.claude/oss-repos/outline/`, `~/.claude/oss-repos/docmost/`, `ws` library issues

---

## Findings

### Finding B5-1: Two canonical consumer patterns exist — neither is "patch Hocuspocus"

**Confidence:** CONFIRMED (source-code reads in two production codebases)
**Evidence:** Outline + Docmost source

---

### Pattern A: Outline — Node-layer error listener at upgrade + observability filter

**File:** `~/.claude/oss-repos/outline/server/services/collaboration.ts:82-108`

```ts
socket.on("error", (error: NodeJS.ErrnoException) => {
  if (error.code === "ECONNRESET") return;  // silent
  Logger.error("Socket error during WebSocket upgrade", error, {documentId}, req);
});
wss.handleUpgrade(req, socket, head, (client) => {
  client.on("error", (error) => {
    Logger.error(`Websocket error`, error, {documentId}, req);
  });
  // ...
});
```

**Observability filter** at `~/.claude/oss-repos/outline/server/logging/sentry.ts:50`:
```ts
if (error.code === "EPIPE" || error.code === "ECONNRESET") return;
```

**Pattern:** Hocuspocus library untouched. Node-layer error listener on the raw TCP socket silently swallows expected transient errors. A separate observability-layer filter prevents EPIPE/ECONNRESET from reaching Sentry.

**Where it's strong:** Simple, minimal-change. Filters noise at the boundary.
**Where it's weak:** Doesn't pre-flush pending broadcast timers. Doesn't address the recursion vulnerability in #1017. Still logs EPIPE at the Node-listener layer before the filter.

---

### Pattern B: Docmost — `WebSocketLike` wrapper with readyState short-circuit

**File:** `~/.claude/oss-repos/docmost/apps/server/src/collaboration/extensions/redis-sync/ws-socket-wrapper.ts`

```ts
export class WsSocketWrapper extends EventEmitter {
  private ws: WebSocket;
  readyState = 1;

  constructor(ws: WebSocket) {
    super();
    this.ws = ws;
    this.once('close', () => {
      this.readyState = 3;
    });
  }

  send(message: Uint8Array) {
    if (this.readyState !== 1) return;   // guard
    try {
      this.ws.send(message);
    } catch (e) {
      /* Socket already closed */
    }
  }

  close(code?: number, reason?: string) { /* ... */ }
  ping() { /* ... */ }
}
```

Same pattern on `collab-proxy-socket.ts:41,52,62`. Docmost runs multi-instance with Redis pubsub — every socket Hocuspocus sees is a `WsSocketWrapper`.

**Pattern:** Wrap the `WebSocketLike` boundary. Hocuspocus sees a custom object that implements the `{ send, close, readyState }` contract but short-circuits `send` immediately if the wrapper knows the socket is closing. Errors in `ws.send()` are swallowed.

**Where it's strong:** Adapter-layer — matches v4's `WebSocketLike` design. Cleaner than Pattern A because it catches both the readyState race AND prevents any recursion (the wrapper's `send` is a no-op on `readyState !== 1`, so the downstream `onClose` → `awareness send` loop dies at the boundary).
**Where it's weak:** More invasive — requires injecting the wrapper at the upgrade-handler boundary. Adds an abstraction layer.

---

### Finding B5-2: `bun patch` / `pnpm patch` for @hocuspocus/server — zero public precedents

**Confidence:** CONFIRMED (zero-result search)
**Evidence:** npm search, GitHub code search `"patchedDependencies" @hocuspocus`

No published patchfiles target `@hocuspocus/server`. Patching infrastructure exists ([Bun patch docs](https://bun.com/docs/pm/cli/patch), [pnpm patch docs](https://pnpm.io/cli/patch)) but is unused in the Hocuspocus ecosystem.

**Why?** Two reasons visible from Pattern A + B:
1. The `broadcastStateless` `filter` parameter + `Connection.send` readyState check + `WebSocketLike` adapter layer provide enough extension points that consumer-side fixes don't require library modification.
2. v4's explicit `WebSocketLike` contract makes Pattern B the "blessed" path for anyone who wants pre-send guards stronger than the built-in `Connection.send` check.

---

### Finding B5-3: The Docmost pattern is stronger than the Outline pattern at the architectural level

**Confidence:** INFERRED (from comparing the two patterns against the race conditions listed in `b3-tcp-async-race.md`)

| Race condition | Outline Pattern A | Docmost Pattern B |
|---|---|---|
| Async EPIPE after write | Caught by Node-layer listener | Caught by internal try/catch |
| Sync throw from `ws.send` | Uncaught at upgrade-listener layer; may propagate | Caught by wrapper try/catch |
| `send() → close() → onDisconnect → awareness → send()` recursion (#1017) | Not prevented | Prevented — second `send` is a no-op |
| Observability noise | Filtered at Sentry boundary | Not visible in error stream at all |

Pattern B provides defense-in-depth: it wraps the library's attack surface. Pattern A catches what escapes.

**For Open Knowledge's `hocuspocus-plugin.ts:272` use case:** The current implementation is Pattern A without the error-code filter. Adding the filter (log `debug` instead of `error` for EPIPE/ECONNRESET) brings it to full Pattern A parity with Outline. Migrating to Pattern B would require refactoring the upgrade handler to pass a wrapper to `hocuspocus.handleConnection(wrapper, req)` instead of the raw `ws`.

---

### Finding B5-4: Neither pattern relies on Hocuspocus's `beforeBroadcastStateless` or filter callback

**Confidence:** CONFIRMED
**Evidence:** Grep of both codebases for these symbols

Neither Outline nor Docmost uses:
- `filter` parameter on `broadcastStateless` (for lifecycle filtering)
- `beforeBroadcastStateless` hook

The readyState concern is handled at the **send layer** (inside `Connection.send` or inside a wrapping `WebSocketLike.send`), not at the broadcast layer. This matches the worldmodel observation that readyState-filtering at the broadcast level is functionally redundant.

---

## Implications

- **Patching Hocuspocus is unnecessary and unprecedented.** The extension points already exist.
- **Outline's pattern is simpler; Docmost's pattern is stronger.** Both are valid.
- **Pattern B is v4-aligned.** Future-proof with `crossws` multi-runtime adapters.
