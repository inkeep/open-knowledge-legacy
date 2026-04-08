# @inkeep/open-knowledge-server

Hocuspocus CRDT server library — persistence, file-watcher, agent sessions, and HTTP API.

## Commands

```bash
bun test           # Run unit tests (17 tests)
bunx tsc --noEmit  # Typecheck
```

## Architecture

```
Hocuspocus Server
├── Persistence Extension (CRDT → markdown → disk → git)
├── API Extension (onRequest hook for HTTP endpoints)
├── Agent Sessions (DirectConnection + UndoManager per agent)
└── File Watcher (@parcel/watcher disk bridge)
```

### Persistence Pipeline

Layer 1 (CRDT → disk): `onStoreDocument` serializes Y.Doc → markdown → .md file (atomic write via temp + rename)
Layer 2 (disk → git): Debounced git commit to `refs/wip/main` via git plumbing (isolated index)

### File Watcher (Disk Bridge)

Two-layer feedback prevention:
1. Content hash tracker — persistence writes register hashes, watcher skips matching events
2. `skipStoreHooks` — external changes applied with LocalTransactionOrigin to prevent re-write

### Agent Sessions

- `AgentSessionManager` — manages persistent DirectConnections per document
- Each session has agent awareness (presence bar shows "Claude") and a server-side UndoManager
- UndoManager tracks `'agent-write'` origin with `captureTimeout: 0` (each write = separate undo entry)

### API Endpoints

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/api/agent-write` | Agent write via Y.Text (simple text append) |
| POST | `/api/agent-write-md` | Agent markdown write via Y.Text |
| POST | `/api/agent-undo` | Undo last agent edit |
| POST | `/api/agent-redo` | Redo last undone agent edit |
| GET | `/api/agent-undo-status` | Check canUndo/canRedo |
| POST | `/api/test-reset` | Reset document (E2E test isolation) |

## Key Files

- `src/standalone.ts` — `createServer()` factory
- `src/persistence.ts` — `createPersistenceExtension()` with configurable contentDir/projectDir
- `src/file-watcher.ts` — `startWatcher()` + writeTracker
- `src/agent-sessions.ts` — `AgentSessionManager` class
- `src/api-extension.ts` — HTTP API as Hocuspocus onRequest extension
- `src/index.ts` — barrel export
