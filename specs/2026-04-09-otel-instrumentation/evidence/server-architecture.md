---
title: Server Package Architecture
type: codebase-trace
sources:
  - packages/server/src/standalone.ts
  - packages/server/src/persistence.ts
  - packages/server/src/api-extension.ts
  - packages/server/src/agent-sessions.ts
  - packages/server/src/file-watcher.ts
  - packages/server/src/logger.ts
---

## Server Module Map

### standalone.ts — Server factory
- `createServer(options)` → `{ hocuspocus, sessionManager, destroy }`
- Wires persistence extension, API extension, file watcher
- Entry point for all server lifecycle

### persistence.ts — 2-layer persistence pipeline
- **Layer 1 (CRDT → disk):** `onStoreDocument` — serialize Y.Doc → markdown → atomic file write
  - Debounced by Hocuspocus: 2000ms / 10000ms max
  - Registers write hash for file-watcher feedback prevention
- **Layer 2 (disk → git):** `commitToWipRef` — git plumbing to refs/wip/main
  - Separate 30s debounce
  - Tracks consecutive failures (CRITICAL at 3+)
- `onLoadDocument` — read .md file, parse frontmatter, populate Y.Doc

### api-extension.ts — HTTP API (6 endpoints)
- POST `/api/agent-write` — text insert at cursor
- POST `/api/agent-write-md` — markdown write (append/prepend/replace)
- GET `/api/agent-undo-status` — check undo/redo availability
- POST `/api/agent-undo` — undo agent writes
- POST `/api/agent-redo` — redo agent writes
- POST `/api/test-reset` — reset document (E2E test)

### agent-sessions.ts — Agent lifecycle
- `AgentSessionManager` — persistent DirectConnection + UndoManager per doc
- `syncTextToFragment()` — re-parse full content after Y.Text edit
- Tracks `AGENT_WRITE_ORIGIN` for per-agent undo

### file-watcher.ts — Disk bridge
- `startWatcher()` — @parcel/watcher for OS-level file monitoring
- `writeTracker` — SHA-256 hash queue for self-write detection (10s TTL)
- `evictStaleTrackerEntries()` — periodic cleanup

### logger.ts — Pino logger factory
- `PinoLogger` class with pretty-print, transport support
- `loggerFactory` singleton with named logger caching
- Test helpers: `createTestLogger()`, `installTestLoggers()`
- **Not wired into server code** — only CLI uses it

## Key Instrumentation Points

1. **API request handler** (`api-extension.ts:304`) — span per request with method, path, status
2. **Agent write transaction** (`api-extension.ts:73-88`) — span around `dc.document.transact()`
3. **syncTextToFragment** (`agent-sessions.ts:39-50`) — expensive full re-parse
4. **onLoadDocument** (`persistence.ts:136-163`) — document load from disk
5. **onStoreDocument** (`persistence.ts:165-195`) — disk write
6. **commitToWipRef** (`persistence.ts:63-113`) — git commit (multiple plumbing calls)
7. **File watcher event** (`file-watcher.ts:74-109`) — per-event processing
8. **Agent session creation** (`agent-sessions.ts:92-111`) — DirectConnection open

## Current Logging (25 console calls)
All use `console.log`/`console.error` with `[module]` prefix tags:
- `[persistence]` — 8 calls (load, write, git commit, failures)
- `[file-watcher]` — 4 calls (start, external change, delete, errors)
- `[agent-write]` / `[agent-write-md]` — 2 error handlers
- `[agent-session]` — 2 calls (create, close)
- `[agent-undo]` — 4 calls (create, destroy, undo, redo)
- `[server]` — 1 call (watcher start failure)

## Bun Compatibility
- OTel SDK (sdk-trace-base, sdk-metrics) works in Bun
- Auto-instrumentation via require hooks does NOT work — manual spans required
- OTLP/HTTP exporter works
- diagnostics_channel API available but not used by this codebase
- Pino transports use worker threads (Bun limitation) — current code safely defaults to direct stream
