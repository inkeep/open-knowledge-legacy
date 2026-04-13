# SPEC: Server Process Safety — Lock File, Hardened Shutdown, MCP Port Auto-Discovery

**Status:** Draft
**Created:** 2026-04-13
**Baseline commit:** f8915cd (origin/main)
**Implementer:** AI coding agent (Claude Code)
**Location:** `packages/server/src/`, `packages/cli/src/commands/`, `packages/cli/src/mcp/`, `packages/app/src/server/`
**Nature:** Platform primitive. Adds per-project exclusive server ownership via a PID-based lock file at `<contentDir>/.open-knowledge/server.lock`, hardens `destroy()` to release the lock as the final shutdown step (CC8), and teaches the MCP stdio server to read that lock file to discover a running instance's port — eliminating the `--port` flag requirement from agent harness configuration.
**Target PR:** Direct to main. Small-medium — three additive modules + wiring at four call sites + tests.
**Project / Story:** V0-1 in `projects/v0-launch/PROJECT.md` (Andrew — Platform / Ops). Resolves TQ1 (lock schema — Decided) and CC8 (shutdown ordering — Decided). Unblocks V0-7 (session persistence / `state.json` needs lock-coordinated writes) and V0-20 (Electron multi-window lock collision dialog).

**Pace:** Fast. No novel design — extends the existing `shadow-lock.ts` pattern. The risks are wiring mistakes (ordering in `destroy()`, contentDir resolution mismatch between start + mcp), not primitive design.

---

## 1. Problem Statement (SCR)

**Situation.** Open Knowledge ships a Hocuspocus server that owns a project's content directory: file watcher, shadow git repo, CRDT persistence pipeline, HTTP API. Each project directory is meant to have exactly one server process at a time. The MCP stdio server, when run by an agent harness (Claude Desktop, Cursor, Codex), may either run disk-only or connect to a live Hocuspocus instance for live-CRDT reads.

**Complication.**

1. **No per-project mutual exclusion.** Running `open-knowledge start` twice in the same directory silently starts two servers. Two file watchers race on disk events, two git pipelines both write `.git/openknowledge/refs/wip/*`, two HTTP servers try to bind overlapping ports. This is an active data-corruption bug listed as a top-2 v0 release blocker (`projects/v0-launch/PROJECT.md:31`). Compare `shadow-lock.ts` which already enforces this at the shadow-repo level — the server lacks the equivalent at the process level.

2. **`destroy()` doesn't release a lock because there is no lock.** `standalone.ts:566-694` already sequences shutdown correctly (watchers → sessions → L1 → L2/git → shadow lock). The missing final step — release server lock — is the lynchpin: without it, a second `open-knowledge start` can acquire before the first finishes flushing, corrupting `.git/index-wip`.

3. **MCP port coupling is brittle.** `packages/cli/src/commands/mcp.ts:16` unconditionally builds `ws://${config.server.host}:${config.server.port}`. If the running server chose a different port (kernel-assigned via `Server.listen(0)`, or a second worktree running on a non-default port), MCP tries the config port, fails the `fetch('/api/agent-undo-status')` probe, and silently degrades to disk-only. There is no way for an agent harness to "just connect to whatever's running" without a user-supplied port.

4. **Electron multi-window will duplicate the problem.** `specs/2026-04-11-electron-desktop-app/` opens multiple windows onto the same project. Without a lock, each window's renderer would spin up its own Hocuspocus and race. The lock pattern from `shadow-lock.ts` is the exact primitive Electron needs — build it once at the server level and Electron reuses it.

**Resolution.** Introduce a server-level lock file — schema already Decided in TQ1 — at `<contentDir>/.open-knowledge/server.lock` containing `{ pid, hostname, port, startedAt, worktreeRoot }`. Acquire in `createServer()` before any side effects; release LAST in `destroy()`. The MCP stdio server reads the lock before falling back to config, using its port for discovery. The whole system becomes: "one process per project, discoverable by its peers, cleaned up on exit."

---

## 2. Success Criteria

### Primary: Per-project exclusive server ownership

- `open-knowledge start` in a directory where a live server already runs **fails fast** with a human-readable error: `Open Knowledge server already running on port <P> (pid <X>, started <ISO>). Stop it first or use a different directory.`
- `bun run dev` (Vite plugin path) participates in the same lock — running `start` and `dev` in the same contentDir is mutually exclusive. Whichever acquires first wins; the second fails fast with the same error.
- After a clean shutdown (`destroy()`), a subsequent `open-knowledge start` succeeds immediately — no stale lock left behind.
- After a crash (`SIGKILL` / power loss), a subsequent `open-knowledge start` detects the stale lock (PID dead or host mismatch), removes it with a warning log, and proceeds.
- `destroy()` releases the server lock as the **final** step (after shadow lock release, per CC8). A failure mid-`destroy()` still releases the lock (wrapped in `try/finally`).
- Process signals (`SIGINT`, `SIGTERM`) trigger `destroy()` exactly once; `destroy()` itself is idempotent.

### Primary: Zero-config MCP port discovery

- `open-knowledge mcp` run from a project directory where a live server exists connects to that server's WebSocket automatically — no `--port` flag, no config edit. Discovery reads `<contentDir>/.open-knowledge/server.lock`.
- If no live lock exists (or lock holder is dead), MCP falls back to disk-only mode exactly as it does today — no regression for users who run MCP against a cold project.
- An explicit `--port` flag or `config.server.port` override is still honored (operator escape hatch; skips discovery).
- Discovery logs once to stderr (`[mcp] connected to running instance at ws://127.0.0.1:<port> (pid <X>)` or `[mcp] no running instance — disk-only mode`).

### Secondary: Reusable primitive

- The lock primitive lives in `packages/server/src/server-lock.ts` and exports `acquireServerLock` / `releaseServerLock` / `readServerLock` / `ServerLockMetadata`.
- `isProcessAlive` is extracted from `shadow-lock.ts` into `process-alive.ts` and shared by both locks. No duplication.
- The spec does **not** alter `shadow-lock.ts`'s public surface — only the internal `isProcessAlive` is hoisted.

---

## 3. What to Build

### 3.1 Extract shared process-liveness helper

**New file:** `packages/server/src/process-alive.ts`

```ts
/**
 * Check whether a process with the given pid is still alive on this host.
 * `process.kill(pid, 0)` returns without sending a signal but throws if the
 * pid does not exist. EPERM means the process exists but we lack permission
 * to signal it — still alive.
 */
export function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err: unknown) {
    if (err && typeof err === 'object' && 'code' in err && err.code === 'EPERM') {
      return true;
    }
    return false;
  }
}
```

**Modify:** `packages/server/src/shadow-lock.ts` — replace the inline `isProcessAlive` (lines 20-32) with `import { isProcessAlive } from './process-alive.ts';`. No behavior change.

### 3.2 Server-level lock module

**New file:** `packages/server/src/server-lock.ts`

```ts
import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { hostname } from 'node:os';
import { resolve } from 'node:path';
import { isProcessAlive } from './process-alive.ts';

export interface ServerLockMetadata {
  pid: number;
  hostname: string;
  /** HTTP/WebSocket port the server listens on. 0 means "starting, port not yet assigned". */
  port: number;
  startedAt: string;
  worktreeRoot: string;
}

export class ServerLockCollisionError extends Error {
  constructor(public existing: ServerLockMetadata, public lockPath: string) {
    super(
      `Open Knowledge server already running on port ${existing.port} ` +
      `(pid ${existing.pid}, started ${existing.startedAt}). ` +
      `Stop it first or use a different directory. Lock: ${lockPath}`,
    );
    this.name = 'ServerLockCollisionError';
  }
}

function lockPathFor(lockDir: string): string {
  return resolve(lockDir, 'server.lock');
}

/**
 * Acquire an exclusive server lock for a project's contentDir.
 *
 * `lockDir` is `<contentDir>/.open-knowledge`. Created if missing.
 *
 * - No existing lock → write ours, return path.
 * - Stale lock (dead pid OR foreign host) → replace with warning.
 * - Our own pid → idempotent update (refreshes port/startedAt).
 * - Live foreign pid on same host → throw ServerLockCollisionError.
 * - Corrupt lock file → treat as stale.
 */
export function acquireServerLock(
  lockDir: string,
  init: { port: number; worktreeRoot: string },
): string {
  mkdirSync(lockDir, { recursive: true });
  const lockPath = lockPathFor(lockDir);

  if (existsSync(lockPath)) {
    let existing: ServerLockMetadata | null = null;
    try {
      existing = JSON.parse(readFileSync(lockPath, 'utf-8')) as ServerLockMetadata;
    } catch {
      console.warn(`[server-lock] Corrupt lock file at ${lockPath} — replacing`);
    }

    if (existing) {
      const sameHost = existing.hostname === hostname();
      if (sameHost && existing.pid === process.pid) {
        // Idempotent re-acquire — fall through to rewrite
      } else if (sameHost && isProcessAlive(existing.pid)) {
        throw new ServerLockCollisionError(existing, lockPath);
      } else {
        console.warn(
          `[server-lock] Stale lock detected (pid=${existing.pid}, host=${existing.hostname}) — replacing`,
        );
      }
    }
  }

  const metadata: ServerLockMetadata = {
    pid: process.pid,
    hostname: hostname(),
    port: init.port,
    startedAt: new Date().toISOString(),
    worktreeRoot: init.worktreeRoot,
  };

  writeFileSync(lockPath, JSON.stringify(metadata, null, 2), 'utf-8');
  return lockPath;
}

/**
 * Update only the port field in an already-acquired lock — called after
 * `Server.listen()` resolves with a kernel-assigned port. Preserves all
 * other fields. No-op if the lock file is missing (caller never acquired
 * or release raced ahead).
 */
export function updateServerLockPort(lockDir: string, port: number): void {
  const lockPath = lockPathFor(lockDir);
  if (!existsSync(lockPath)) return;
  try {
    const existing = JSON.parse(readFileSync(lockPath, 'utf-8')) as ServerLockMetadata;
    if (existing.pid !== process.pid) return; // Not ours — refuse to overwrite
    existing.port = port;
    writeFileSync(lockPath, JSON.stringify(existing, null, 2), 'utf-8');
  } catch {
    // Corrupt or concurrent removal — ignore
  }
}

/**
 * Read a lock file if it exists and the holder is alive on this host.
 * Returns null for missing, stale, or cross-host locks.
 * Cleans up a stale lock as a side effect.
 */
export function readServerLock(lockDir: string): ServerLockMetadata | null {
  const lockPath = lockPathFor(lockDir);
  if (!existsSync(lockPath)) return null;

  let existing: ServerLockMetadata;
  try {
    existing = JSON.parse(readFileSync(lockPath, 'utf-8')) as ServerLockMetadata;
  } catch {
    return null; // Corrupt — caller may choose to unlink; we don't, to avoid racing a writer
  }

  const sameHost = existing.hostname === hostname();
  if (!sameHost) return null;
  if (!isProcessAlive(existing.pid)) {
    try {
      unlinkSync(lockPath);
    } catch {
      // Raced another cleanup — fine
    }
    return null;
  }

  return existing;
}

/** Safe to call multiple times. Only removes the lock if we own it. */
export function releaseServerLock(lockDir: string): void {
  const lockPath = lockPathFor(lockDir);
  if (!existsSync(lockPath)) return;
  try {
    const existing = JSON.parse(readFileSync(lockPath, 'utf-8')) as ServerLockMetadata;
    if (existing.pid !== process.pid) return; // Not ours — refuse to remove
    unlinkSync(lockPath);
  } catch {
    // Corrupt, already removed, or concurrent writer — ignore
  }
}
```

**Rationale for `port: 0` sentinel (OQ3 resolution).** The server acquires the lock *before* it knows its real port: Hocuspocus's `Server.listen(0)` is async, and the collision window we need to protect against starts the moment `createServer()` begins side effects (shadow repo init, file watcher, etc.), long before `listen` resolves. Solution: acquire with `port: 0` as "starting — port not yet assigned", then call `updateServerLockPort(dir, realPort)` as soon as `listen` resolves. MCP discovery treats `port: 0` as "server still starting — fall back to disk-only" (safer than trying to connect to port 0, which is a wildcard).

### 3.3 Wire into `createServer()` — acquire before side effects

**Modify:** `packages/server/src/standalone.ts`

Add `port` (initial, possibly `0`) to `ServerOptions`. At the top of `createServer()`, before `initShadowRepo`, before watcher creation, before any `mkdir` that could race:

```ts
const lockDir = resolve(options.contentDir, '.open-knowledge');
acquireServerLock(lockDir, {
  port: options.port ?? 0,
  worktreeRoot: options.contentDir,
});
```

Expose a `lockDir` handle on the returned `ServerInstance` so callers can invoke `updateServerLockPort` once they know the real port.

**Modify:** `packages/cli/src/commands/start.ts` — after `http.listen()` resolves, call `updateServerLockPort(server.lockDir, http.address().port)`.

**Modify:** `packages/app/src/server/hocuspocus-plugin.ts` (Vite dev plugin) — same: acquire via `createServer`, update port in `configureServer`'s `listening` hook. Dev plugin and CLI start both route through the same `createServer` entry, so the acquire site is one place.

### 3.4 Release LAST in `destroy()` — CC8 invariant

**Modify:** `packages/server/src/standalone.ts:566-694` (`destroy()`).

The current 5-phase shutdown (stop watchers → drain sessions → flush L1 → flush L2/git → release shadow lock) becomes a 6-phase shutdown with **server lock release as the final step**:

```ts
destroy: async () => {
  try {
    // Phase 1-5 unchanged (watchers, sessions, L1, L2, shadow lock)
    // ...
  } finally {
    // Phase 6: release server lock LAST — even if any earlier phase threw.
    // Invariant: no other process may acquire this lock until every prior
    // phase has run, because a new acquire will corrupt git index-wip.
    releaseServerLock(lockDir);
  }
}
```

The `try/finally` is load-bearing: if, say, shadow-repo flush throws, we still release so a later restart can succeed. The cost is that a mid-shutdown failure might leave disk state inconsistent while allowing a restart — but **this is the correct tradeoff** because the alternative (holding the lock after a failed shutdown) bricks the project until someone manually deletes the lock file.

### 3.5 Signal handlers — `destroy()` on SIGINT / SIGTERM

**Modify:** `packages/cli/src/commands/start.ts`

```ts
let shuttingDown = false;
async function shutdown(signal: NodeJS.Signals) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`\n[start] received ${signal}, shutting down...`);
  try {
    await server.destroy();
  } catch (err) {
    console.error('[start] destroy() failed:', err);
    process.exitCode = 1;
  } finally {
    process.exit(process.exitCode ?? 0);
  }
}
process.once('SIGINT', () => { void shutdown('SIGINT'); });
process.once('SIGTERM', () => { void shutdown('SIGTERM'); });
```

Vite plugin path: Vite's own shutdown hook calls `destroy()`; no separate signal handler needed there. (If Vite doesn't, wire the same pattern in `configureServer`'s `close` hook.)

### 3.6 MCP port auto-discovery

**Modify:** `packages/cli/src/commands/mcp.ts` and `packages/cli/src/mcp/server.ts`

```ts
// mcp.ts
const projectDir = process.cwd();
const contentDir = resolve(projectDir, config.content.dir); // SAME resolution as start.ts
const lockDir = resolve(contentDir, '.open-knowledge');
const lock = readServerLock(lockDir);

let serverUrl: string | undefined;
if (config.server.portOverride) {
  // Explicit operator override — honor it, skip discovery
  serverUrl = `ws://${config.server.host}:${config.server.portOverride}`;
} else if (lock && lock.port > 0) {
  serverUrl = `ws://127.0.0.1:${lock.port}`;
  process.stderr.write(
    `[mcp] connected to running instance at ${serverUrl} (pid ${lock.pid})\n`,
  );
} else {
  process.stderr.write(`[mcp] no running instance — disk-only mode\n`);
}

await startMcpServer({ projectDir, contentDir, serverUrl, config });
```

**Critical:** the contentDir resolution in mcp.ts MUST exactly match start.ts. If start.ts resolves from `process.cwd()` and mcp.ts resolves from some different base, discovery looks in the wrong directory and silently degrades. Extract a shared `resolveContentDir(config, cwd)` helper in `packages/cli/src/config/paths.ts` and use it from both call sites.

**`startMcpServer` changes:** `serverUrl` becomes optional. The existing `detectHocuspocus(serverUrl)` probe still runs (as a second-line liveness check) — lock file says "a server claims to be here"; probe confirms it answers HTTP. If probe fails despite live lock, log a warning and fall back to disk-only (the lock is real but the server is unresponsive).

---

## 4. Invariants

- **I-LOCK-1 (exclusive):** At most one process holds `<contentDir>/.open-knowledge/server.lock` with a live PID at any time.
- **I-LOCK-2 (last-release):** `releaseServerLock` is the final step of `destroy()`. No earlier phase may fail in a way that skips the release. (Enforced by `try/finally`.)
- **I-LOCK-3 (port truthfulness):** If `lock.port > 0`, a server is listening on that port. If `lock.port === 0`, a server is starting and the port is not yet bound.
- **I-LOCK-4 (contentDir agreement):** `mcp` and `start` resolve `contentDir` identically. Lock discovery is deterministic for any given cwd.
- **I-LOCK-5 (ownership):** `releaseServerLock` and `updateServerLockPort` refuse to mutate a lock whose `pid` is not `process.pid`. Prevents a rogue MCP process from corrupting a real server's lock file.

---

## 5. Acceptance Criteria

1. Start server → `server.lock` exists with `{pid: <ours>, port: <real-port>, hostname, startedAt, worktreeRoot}`.
2. Start second server in same contentDir → fails with `ServerLockCollisionError` naming port + pid; first server keeps running unaffected.
3. `kill -9 <server-pid>` → `server.lock` remains on disk; subsequent `start` detects stale lock (dead PID), logs `Stale lock detected`, replaces it, starts normally.
4. `open-knowledge start` on machine A + open-knowledge lock file from machine B present (sync'd via network drive) → machine A detects cross-host lock, replaces it (same-host rule).
5. Clean `SIGINT` → server runs full 6-phase shutdown, `server.lock` removed, exit code 0.
6. Mid-shutdown exception (e.g., inject a throw into L2 flush) → lock still released, error logged, exit code 1.
7. `open-knowledge mcp` with live server in same dir → connects to real port (log: `connected to running instance`), read_document tool returns live CRDT state (not disk-only).
8. `open-knowledge mcp` with no server running → `[mcp] no running instance — disk-only mode`, tools return disk-only results.
9. `open-knowledge mcp` with stale lock (PID dead) → `readServerLock` returns `null` after unlinking stale lock → disk-only mode; lock file is gone afterward.
10. `open-knowledge mcp` with `--port 1234` override → skips discovery, connects to `ws://localhost:1234`.
11. `bun run dev` + `open-knowledge start` in same contentDir → whichever ran first keeps running; second fails fast.
12. Run `bun run check` — lint, typecheck, unit, integration, fidelity all pass.

---

## 6. Non-Goals

- **Cross-machine coordination.** Lock is strictly local-host. Cross-host locks (machine A, machine B) are replaced on sight. No distributed locking protocol.
- **Standalone mode (no project `.git/`).** This spec covers integrated mode only. Standalone-mode lock location will be handled when the Electron work lands (OQ1 deferred).
- **Windows-specific PID semantics.** `process.kill(pid, 0)` on Windows works via `signal === 0` — covered by Node. Tested behaviorally but no Windows-specific branching.
- **Retry on collision.** If the lock is held, we fail fast. No backoff loop, no "wait N seconds then try again". Operator restarts the holder or runs in a different directory.
- **Lock file versioning / schema migration.** If schema changes later, corrupt-lock handling treats unknown-shape files as stale and replaces them.
- **Electron multi-window UX.** Electron window B showing "Already open in window A — bring to front?" dialog is deferred to the Electron spec. This spec provides the primitive.

---

## 7. Test Plan

### 7.1 Unit tests

**New file:** `packages/server/src/server-lock.test.ts` — mirror `shadow-lock.test.ts` coverage:

- No existing lock → acquire succeeds, metadata fields match.
- Existing lock with live foreign PID → throws `ServerLockCollisionError` with human-readable message.
- Existing lock with dead PID → replaces with warning, acquire succeeds.
- Existing lock with foreign hostname → replaces with warning, acquire succeeds.
- Existing lock with our own PID → idempotent re-acquire (port/startedAt update).
- Corrupt JSON → treated as stale, replaces silently (with warning).
- `updateServerLockPort` with no lock → no-op, no throw.
- `updateServerLockPort` with foreign-pid lock → refuses to overwrite.
- `readServerLock` with live lock → returns metadata.
- `readServerLock` with dead-PID lock → returns null, lock file removed.
- `readServerLock` with missing lock → returns null, no throw.
- `releaseServerLock` with our lock → removes.
- `releaseServerLock` with foreign lock → does NOT remove (ownership rule).
- `releaseServerLock` with no lock → no-op.

### 7.2 Server integration tests

**Modify:** `packages/server/src/standalone.test.ts` — add cases:

- Start two servers with same `contentDir` → second rejects with `ServerLockCollisionError`.
- Start → `destroy()` → lock file is absent.
- Simulate mid-`destroy()` failure (inject throw in L2 flush step) → lock file still absent (try/finally working).
- Start with `port: 0` → lock file has `port: 0` → after `updateServerLockPort`, lock file has real port.

### 7.3 MCP discovery tests

**New file:** `packages/cli/src/mcp/discovery.test.ts`:

- Write a `server.lock` with live PID (use `process.pid`) + port → `readServerLock` returns it, `startMcpServer` receives matching `serverUrl`.
- Write a `server.lock` with a dead PID (use a known-unused PID via `fork` + immediate exit) → `readServerLock` returns null, `startMcpServer` goes disk-only.
- No lock file → disk-only.
- Lock with `port: 0` → treat as "starting", disk-only (don't try to connect).
- Explicit `--port` override → bypasses lock entirely.

### 7.4 Dual-path test

Add one integration test that exercises the real start → mcp path:
1. Start Hocuspocus via `createServer` on kernel-assigned port.
2. Spawn `open-knowledge mcp` subprocess pointed at the same contentDir.
3. Send `read_document` MCP call → assert it came from live CRDT (not disk).
4. `destroy()` server.
5. Spawn MCP again → assert it reports disk-only.

---

## 8. Resolved Open Questions (from plan)

- **OQ1 (standalone mode lock location):** Deferred. This spec covers integrated mode only.
- **OQ2 (Vite plugin acquires lock too?):** YES. `bun run dev` and `open-knowledge start` in the same contentDir must be mutually exclusive.
- **OQ3 (port race between acquire and listen):** Resolved via `port: 0` sentinel + `updateServerLockPort` post-listen. MCP treats `port === 0` as "starting, disk-only."

---

## 9. Out of Scope / Follow-Ups

- **V0-7 (session persistence).** `state.json` writes will be lock-coordinated once V0-1 ships (CC6). V0-7 is a separate spec.
- **V0-20 (Electron build prep).** The lock file becomes the "already open in window X" discovery mechanism for Electron, but renderer-side UX is V0-20's concern.
- **Observability.** A `/api/lock-status` endpoint showing current holder could help debugging but isn't required for v0. Add if operator support need materializes.
- **Lock file location under non-content `.open-knowledge/` layouts.** If `.open-knowledge/` ever moves (e.g., to XDG state dir on Linux), the resolveContentDir helper is the single choke point to update.

---

## 10. References

- `projects/v0-launch/PROJECT.md:458` — V0-1 scope statement.
- `projects/v0-launch/PROJECT.md:967` — TQ1 (lock schema, Decided).
- `projects/v0-launch/PROJECT.md:1013` — CC8 (shutdown ordering, Decided).
- `packages/server/src/shadow-lock.ts` — pattern source.
- `packages/server/src/standalone.ts:566-694` — existing `destroy()` sequencing.
- `packages/cli/src/commands/mcp.ts` — MCP entry point to modify.
- `specs/2026-04-11-server-destroy-flush-fix/SPEC.md` — precedent for shutdown-ordering work.
- `specs/2026-04-11-electron-desktop-app/SPEC.md` — downstream consumer of this primitive.
