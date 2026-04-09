# Evidence: Server Extraction from Vite

**Dimension:** Server extraction from Vite
**Date:** 2026-04-08
**Sources:** Hocuspocus v4 Server class source, crossws source, init_spike/src/server/ files, sirv documentation

---

## Key files / pages referenced

- `node_modules/@hocuspocus/server/src/Server.ts` — standalone HTTP+WS server class
- `node_modules/@hocuspocus/server/src/Hocuspocus.ts` — core CRDT server with hooks
- `init_spike/src/server/hocuspocus-plugin.ts` lines 38-43 — current Hocuspocus instantiation
- `init_spike/src/server/hocuspocus-plugin.ts` lines 143-166 — manual WS plumbing (to be replaced)
- `init_spike/src/server/hocuspocus-plugin.ts` lines 170-413 — API endpoint handlers (to be extracted)
- `init_spike/src/server/persistence.ts` — already cleanly separated
- `init_spike/src/server/file-watcher.ts` — already cleanly separated

---

## Findings

### Finding: Hocuspocus v4 ships a ready-made `Server` class that replaces ~25 lines of manual WS plumbing
**Confidence:** CONFIRMED
**Evidence:** `@hocuspocus/server/src/Server.ts`

The `Server` class creates a `node:http` server, handles WebSocket upgrades via `crossws`, and provides `listen(port)` + `destroy()`. The current Vite plugin manually creates `WebSocketServer({ noServer: true })` and wires `handleUpgrade` + `handleConnection` — all of this is built into `Server`.

```typescript
import { Server } from '@hocuspocus/server';
const server = new Server({
  port: 3000,
  debounce: 2000,
  maxDebounce: 10000,
  extensions: [persistenceExtension, apiExtension],
});
await server.listen();
```

### Finding: HTTP API endpoints can use Hocuspocus `onRequest` hook — zero new dependencies
**Confidence:** CONFIRMED
**Evidence:** `Server.ts` lines 111-133

The `Server` routes ALL HTTP requests through the `onRequest` extension hook before returning the default response. An extension throws an empty rejection to signal "I handled this request":

```typescript
async onRequest({ request, response, instance }) {
  const url = new URL(request.url!, `http://${request.headers.host}`);
  if (url.pathname === '/api/agent-write' && request.method === 'POST') {
    // ... handler logic (same as current Vite middleware) ...
    response.writeHead(200, { 'Content-Type': 'application/json' });
    response.end(JSON.stringify({ ok: true }));
    throw ''; // signal: request handled
  }
}
```

Current handlers already use raw `IncomingMessage`/`ServerResponse` — the migration is nearly copy-paste.

### Finding: HTTP + WebSocket on one port is built into the `Server` class
**Confidence:** CONFIRMED
**Evidence:** `Server.ts` — single `createServer()` with `setupHttpUpgrade()` for WS

No path filtering on upgrades by default. If needed, use `onUpgrade` hook to filter by path.

### Finding: Static file serving via `sirv` (2KB, zero deps) integrates through `onRequest` hook
**Confidence:** CONFIRMED
**Evidence:** sirv documentation

`sirv` produces a Connect-compatible middleware. For production mode: serve pre-built Vite assets with SPA fallback, gzip, and immutable caching.

### Finding: Dev/production split should follow the Next.js pattern — `dev` keeps Vite, `start` uses standalone Server
**Confidence:** INFERRED
**Evidence:** Next.js `dev` vs `start`, Vite `dev` vs `preview` patterns

Dev mode: Vite plugin (current architecture, HMR, TypeScript on-the-fly).
Production mode: `Server` class + pre-built assets + sirv.

### Finding: Extraction requires refactoring hocuspocus-plugin.ts into 3 shared modules
**Confidence:** CONFIRMED
**Evidence:** Code analysis of hocuspocus-plugin.ts

1. API handlers (lines 170-413) → `api-extension.ts`
2. Agent session management (getAgentSession, UndoManager) → `agent-sessions.ts`
3. File watcher integration (lines 416-454) → already in `file-watcher.ts`

Persistence and file-watcher modules require zero changes.

### Finding: `import.meta.dirname` is fragile in bundled builds — content dir must be configurable
**Confidence:** CONFIRMED
**Evidence:** Both persistence.ts and hocuspocus-plugin.ts use `import.meta.dirname` for relative paths

In a bundled CLI, `import.meta.dirname` points to the dist directory, not the source. Content directory must come from config/CLI args, not relative path resolution.

---

## Gaps / follow-ups

* Exact API for the extracted `createApiExtension()` depends on implementation decisions
