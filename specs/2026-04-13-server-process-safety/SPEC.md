# SPEC: Server Process Safety — Lock File, Hardened Shutdown, MCP Port Auto-Discovery

**Status:** Final (slim, ship-today)
**Created:** 2026-04-13
**Baseline commit:** b822fb2 (origin/main)
**Location:** `packages/server/src/`, `packages/cli/src/commands/`, `packages/cli/src/mcp/`, `packages/app/src/server/`
**Nature:** Ships V0-1 as defined in `projects/v0-launch/PROJECT.md`. Per-project lock file, `destroy()` releases last, MCP discovers running server's port via the lock file. No cloud abstractions, no registry, no tenancy seams — those are explicit non-goals. Future cloud adopters will face known breakages; that is acceptable per the v0 shipping constraint.
**Pace:** Fast. Single-PR implementation.

---

## 1. Problem

Running `open-knowledge start` twice in the same directory silently produces competing file watchers + competing git pipelines writing to `.git/openknowledge/refs/wip/*`. Listed as a top-2 v0 data-corruption blocker (`PROJECT.md:31`). Separately, MCP stdio servers invoked by agent harnesses (Claude Desktop, Cursor) unconditionally build `ws://${config.server.host}:${config.server.port}` and have no way to "just connect to whatever's running" — so users must manually configure `--port` per project.

Both problems share one answer: a small lock file at `<contentDir>/.open-knowledge/server.lock` that the server writes on start and clears on shutdown. It enforces exclusivity and advertises the real port for MCP discovery.

---

## 2. What to Build

### 2.1 Extract `isProcessAlive`

**New file:** `packages/server/src/process-alive.ts`

```ts
export function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err: unknown) {
    if (err && typeof err === 'object' && 'code' in err && err.code === 'EPERM') return true;
    return false;
  }
}
```

**Modify `shadow-lock.ts`** to import this instead of its inline copy. No behavior change.

### 2.2 Server-level lock module

**New file:** `packages/server/src/server-lock.ts`

```ts
import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { hostname } from 'node:os';
import { resolve } from 'node:path';
import { isProcessAlive } from './process-alive.ts';

export interface ServerLockMetadata {
  pid: number;
  hostname: string;
  /** HTTP/WebSocket port. 0 = server starting, port not yet bound. */
  port: number;
  startedAt: string;
  worktreeRoot: string;
}

export class ServerLockCollisionError extends Error {
  constructor(public existing: ServerLockMetadata, public lockPath: string) {
    super(
      `Open Knowledge server already running on port ${existing.port} ` +
      `(pid ${existing.pid}, started ${existing.startedAt}). Stop it first.`,
    );
    this.name = 'ServerLockCollisionError';
  }
}

const lockPath = (dir: string) => resolve(dir, 'server.lock');

export function acquireServerLock(
  lockDir: string,
  init: { port: number; worktreeRoot: string },
): string {
  mkdirSync(lockDir, { recursive: true });
  const path = lockPath(lockDir);

  if (existsSync(path)) {
    let existing: ServerLockMetadata | null = null;
    try {
      existing = JSON.parse(readFileSync(path, 'utf-8'));
    } catch {
      console.warn(`[server-lock] Corrupt lock at ${path} — replacing`);
    }
    if (existing) {
      const sameHost = existing.hostname === hostname();
      if (sameHost && existing.pid === process.pid) {
        // Idempotent re-acquire
      } else if (sameHost && isProcessAlive(existing.pid)) {
        throw new ServerLockCollisionError(existing, path);
      } else {
        console.warn(`[server-lock] Stale lock (pid=${existing.pid}) — replacing`);
      }
    }
  }

  writeFileSync(path, JSON.stringify({
    pid: process.pid,
    hostname: hostname(),
    port: init.port,
    startedAt: new Date().toISOString(),
    worktreeRoot: init.worktreeRoot,
  } satisfies ServerLockMetadata, null, 2), 'utf-8');
  return path;
}

/** Rewrite just the port — call after `Server.listen()` resolves. */
export function updateServerLockPort(lockDir: string, port: number): void {
  const path = lockPath(lockDir);
  if (!existsSync(path)) return;
  try {
    const existing = JSON.parse(readFileSync(path, 'utf-8')) as ServerLockMetadata;
    if (existing.pid !== process.pid) return;
    existing.port = port;
    writeFileSync(path, JSON.stringify(existing, null, 2), 'utf-8');
  } catch { /* ignore */ }
}

/** Returns metadata if a live same-host server holds the lock. Cleans stale locks. */
export function readServerLock(lockDir: string): ServerLockMetadata | null {
  const path = lockPath(lockDir);
  if (!existsSync(path)) return null;
  let existing: ServerLockMetadata;
  try {
    existing = JSON.parse(readFileSync(path, 'utf-8'));
  } catch { return null; }
  if (existing.hostname !== hostname()) return null;
  if (!isProcessAlive(existing.pid)) {
    try { unlinkSync(path); } catch { /* raced */ }
    return null;
  }
  return existing;
}

/** Safe to call many times. Only removes if we own the lock. */
export function releaseServerLock(lockDir: string): void {
  const path = lockPath(lockDir);
  if (!existsSync(path)) return;
  try {
    const existing = JSON.parse(readFileSync(path, 'utf-8')) as ServerLockMetadata;
    if (existing.pid !== process.pid) return;
    unlinkSync(path);
  } catch { /* ignore */ }
}
```

### 2.3 Acquire in `createServer()`, release LAST in `destroy()`

**Modify** `packages/server/src/standalone.ts`:

- Add `port?: number` to `ServerOptions` (default 0).
- At the very top of `createServer()`, before any side effects:
  ```ts
  const lockDir = resolve(options.contentDir, '.open-knowledge');
  acquireServerLock(lockDir, { port: options.port ?? 0, worktreeRoot: options.contentDir });
  ```
- Expose `lockDir` on the returned `ServerInstance`.
- Wrap `destroy()` body in `try { /* existing 5 phases */ } finally { releaseServerLock(lockDir); }`. Release MUST be final — per CC8 (`PROJECT.md:1013`): stop watchers → drain sessions → flush L1 → flush L2 → release shadow lock → release server lock.

### 2.4 Wire port update + signal handlers (CLI `start`)

**Modify** `packages/cli/src/commands/start.ts`:

- After `http.listen()` resolves: `updateServerLockPort(server.lockDir, http.address().port)`.
- Wire `SIGINT`/`SIGTERM` → idempotent `destroy()` → `process.exit`.

**Modify** `packages/app/src/server/hocuspocus-plugin.ts` (Vite dev plugin):

- Route through the same `createServer` entry so `bun run dev` also acquires the lock. Update port post-listen. `dev` and `start` in the same contentDir become mutually exclusive.

### 2.5 MCP port auto-discovery

**Modify** `packages/cli/src/commands/mcp.ts` and `packages/cli/src/mcp/server.ts`:

```ts
const contentDir = resolve(process.cwd(), config.content.dir);
const lock = readServerLock(resolve(contentDir, '.open-knowledge'));

let serverUrl: string | undefined;
if (cliPortOverride) {
  serverUrl = `ws://${config.server.host}:${cliPortOverride}`;
} else if (lock && lock.port > 0) {
  serverUrl = `ws://127.0.0.1:${lock.port}`;
  process.stderr.write(`[mcp] connected to ${serverUrl} (pid ${lock.pid})\n`);
} else {
  process.stderr.write(`[mcp] no running instance — disk-only mode\n`);
}

await startMcpServer({ projectDir: process.cwd(), contentDir, serverUrl, config });
```

`serverUrl` becomes optional in `startMcpServer`. The existing `detectHocuspocus` HTTP probe stays as a second-line check — lock says "a server claims to be here," probe confirms it answers.

`contentDir` resolution MUST use the same logic as `start.ts` — extract one `resolveContentDir(config, cwd)` helper in `packages/cli/src/config/paths.ts` and call it from both sites so they can't drift.

---

## 3. Acceptance Criteria

1. Start server → `server.lock` exists with live PID + real port.
2. Start second server in same dir → `ServerLockCollisionError` with port + pid; first server unaffected.
3. `kill -9 <pid>` → next `start` logs "Stale lock detected" and succeeds.
4. Clean `SIGINT` → `server.lock` removed; exit 0.
5. Mid-`destroy()` throw → lock still released (try/finally).
6. `open-knowledge mcp` with live server → connects to real port, reads live CRDT state.
7. `open-knowledge mcp` with no server → `disk-only mode` log, tools work against disk.
8. `open-knowledge mcp` with stale lock → stale lock removed, disk-only.
9. `bun run dev` + `open-knowledge start` in same dir → second fails fast.
10. `bun run check` passes (lint, typecheck, unit, integration, fidelity).

---

## 4. Non-Goals

- **Multi-project / multi-tenant server.** One process still owns one project.
- **Global registry of running projects.** Out of scope — each project's lock is self-contained.
- **Cloud storage / hosted deployment.** This spec is local-filesystem-native. Future cloud adopters will face known breakages in the shadow-repo, file-watcher, and lock mechanisms; that is acceptable per the v0 constraint.
- **Distributed lock / TTL-based lock refresh.** Stale detection uses local `process.kill(pid, 0)`.
- **Authentication / authorization.** No `AuthContext` primitive. Local trust model = OS user.
- **Standalone mode (no `.git/`).** Integrated mode only.
- **Retry-on-collision UX.** Fail fast; operator resolves.
- **Observability endpoint.** No `/api/lock-status`.

---

## 5. Test Plan

**Unit — `packages/server/src/server-lock.test.ts`** (mirror `shadow-lock.test.ts`):
- Acquire with no existing lock.
- Collision with live foreign PID → throws.
- Stale PID → replaces with warning.
- Foreign hostname → replaces.
- Own PID → idempotent.
- Corrupt JSON → treated as stale.
- `updateServerLockPort`: no-op if missing, refuses foreign-pid.
- `readServerLock`: live → returns; dead → returns null + unlinks; missing → null.
- `releaseServerLock`: removes own; refuses foreign; no-op if missing.

**Integration — add to `packages/server/src/standalone.test.ts`:**
- Two `createServer({contentDir: X})` → second rejects.
- Clean `destroy()` → lock gone.
- Inject throw in a mid-shutdown phase → lock still gone.
- Start with `port: 0`, call `updateServerLockPort` → lock reflects real port.

**MCP — `packages/cli/src/mcp/discovery.test.ts`:**
- Live lock (use `process.pid`) → discovery returns matching `serverUrl`.
- Dead-PID lock → null + unlinked, disk-only.
- No lock → disk-only.
- `port === 0` → disk-only (don't try to connect).
- `--port` override → bypasses discovery.

---

## 6. References

- `projects/v0-launch/PROJECT.md:458` — V0-1 scope.
- `projects/v0-launch/PROJECT.md:967` — TQ1 (lock schema, Decided).
- `projects/v0-launch/PROJECT.md:1013` — CC8 (shutdown ordering, Decided).
- `packages/server/src/shadow-lock.ts` — pattern source.
