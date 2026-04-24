---
title: Console.log Call Inventory for Pino Migration
type: codebase-trace
sources:
  - packages/server/src/persistence.ts
  - packages/server/src/file-watcher.ts
  - packages/server/src/agent-sessions.ts
  - packages/server/src/api-extension.ts
  - packages/server/src/standalone.ts
---

## Console calls to migrate (by module)

### persistence.ts (8 calls)
1. L73: `console.log('[persistence] Empty repo — starting with empty index')` → `log.info('empty repo, starting with empty index')`
2. L75: `console.error('[persistence] Failed to read HEAD tree...')` → `log.error({ err: e }, 'failed to read HEAD tree, falling back to empty index')`
3. L98: `console.log('[persistence] Git commit: ...')` → `log.info({ commitSha, wipRef }, 'git commit')`
4. L101: `console.error('[persistence] Git commit failed...')` → `log.error({ err: e, attempt: consecutiveGitFailures }, 'git commit failed')`
5. L158-159: `console.log('[persistence] Loaded ...')` → `log.info({ filePath, children: xmlFragment.length }, 'loaded document')`
6. L192: `console.log('[persistence] Wrote ...')` → `log.info({ filePath, bytes: markdown.length }, 'wrote document')`
7. L103-105: `console.error('[persistence] CRITICAL...')` → `log.fatal({ consecutiveFailures: consecutiveGitFailures }, 'git auto-save has failed 3+ times')`
8. L189: `console.error('[persistence] Failed to save...')` → `log.error({ err: e, documentName }, 'failed to save document')`

### file-watcher.ts (4 calls)
1. L76: `console.error('[file-watcher]', err)` → `log.error({ err }, 'watcher error')`
2. L85: `console.warn('[file-watcher] File deleted...')` → `log.warn({ path: event.path }, 'file deleted, ignoring')`
3. L107: `console.error('[file-watcher] Failed to read...')` → `log.error({ err: readErr, path: event.path }, 'failed to read file')`
4. L119: `console.log('[file-watcher] Watching...')` → `log.info({ contentDir }, 'watching for external changes')`

### agent-sessions.ts (4 calls)
1. L84: `console.log('[agent-undo] Created UndoManager...')` → `log.debug({ docName }, 'created UndoManager')`
2. L108: `console.log('[agent-session] Created persistent session...')` → `log.info({ docName }, 'created agent session')`
3. L134: `console.log('[agent-undo] Destroyed UndoManager...')` → `log.debug({ docName }, 'destroyed UndoManager')`
4. L138: `console.log('[agent-session] Closed session...')` → `log.info({ docName }, 'closed agent session')`

### api-extension.ts (6 calls)
1. L95: `console.error('[agent-write]', e)` → `log.error({ err: e }, 'agent write failed')`
2. L178: `console.error('[agent-write-md]', e)` → `log.error({ err: e }, 'agent write-md failed')`
3. L231: `console.log('[agent-undo] Undo performed')` → `log.info({ docName }, 'undo performed')`
4. L236: `console.error('[agent-undo]', e)` → `log.error({ err: e }, 'undo failed')`
5. L263: `console.log('[agent-redo] Redo performed')` → `log.info({ docName }, 'redo performed')`
6. L268: `console.error('[agent-redo]', e)` → `log.error({ err: e }, 'redo failed')`

### standalone.ts (2 calls)
1. L103: `console.log('[file-watcher] Applied external change...')` → `log.info({ docName }, 'applied external change')`
2. L105: `console.error('[file-watcher] Failed to apply...')` → `log.error({ err, docName }, 'failed to apply external change')`
3. L125: `console.error('[server] Disk bridge watcher failed...')` → `log.error({ err }, 'file watcher failed to start')`

## Migration pattern

Each module creates a logger at module scope:
```typescript
import { getLogger } from './logger.ts';
const log = getLogger('persistence'); // or 'file-watcher', 'agent-session', etc.
```

The pino mixin in logger.ts auto-injects trace context (traceId, spanId) into every log record when OTel is active.

## Total: ~25 console calls across 5 files
