---
name: Plugin lifecycle — module-load vs configureServer for createServer() invocation
description: Resolves Q2. Investigates where in the Vite plugin lifecycle `createServer()` should be invoked. Recommends module-load with module-scope ServerInstance storage and configureServer as the HTTP-wiring attach point.
sources:
  - packages/app/src/server/hocuspocus-plugin.ts
  - packages/server/src/standalone.ts
  - packages/server/src/server-lock.ts
  - packages/server/src/process-lock.ts
gathered: 2026-04-23
confidence: HIGH (code-traced)
---

# Plugin lifecycle decision

## Options

**(a) Module-load** — invoke `createServer()` at plugin module scope; store returned `ServerInstance` in `let srv: ServerInstance`. `configureServer(server)` attaches Vite's `server.httpServer` upgrade handler + `server.middlewares.use(...)` to the already-built `srv.hocuspocus`.

**(b) Inside `configureServer`** — invoke `createServer()` when Vite calls `configureServer(server)`. No module-scope state beyond a singleton gate.

## Fact-finding

### The current plugin uses pattern (a)

At module-scope (`hocuspocus-plugin.ts:100-285`) the plugin runs:

- Content config resolution (sync)
- `acquireServerLock(LOCK_DIR, ...)` (sync)
- `new Hocuspocus(...)` + all extensions (sync)
- `void runDevShadowInit(PROJECT_ROOT, ...)` (async fire-and-forget)
- `void loadPrincipal(CONTENT_DIR)` (async fire-and-forget)

All happens once per Node/Bun process. `configureServer(server)` at line 287+ attaches:

- Upgrade listener via `server.httpServer?.prependListener('upgrade', ...)`
- Middleware via `server.middlewares.use(...)`
- `startWatcher` inside an IIFE `(async () => {...})()` so the async work doesn't block configureServer's return

### Same-pid lock behavior is idempotent

`packages/server/src/process-lock.ts:138-143`:

```ts
if (sameHost && existing.pid === process.pid) {
  // Idempotent rewrite — our own lock. Safe to overwrite in place.
  writeFileSync(lockPath, payload, { encoding: 'utf-8', mode: 0o600 });
  return buildHandle({ lockName, lockDir, lockPath });
}
```

So `createServer()` called twice from the same process (e.g., double HMR) does NOT throw on the lock — the second call is a no-op rewrite. But `createServer()` does much more than lock: it creates Hocuspocus, starts watchers, etc. A second invocation would produce a duplicate Hocuspocus, leaking resources and desyncing clients.

### Vite `configureServer` is called once per dev-server lifetime

Comment at `hocuspocus-plugin.ts:48-52`:

> "`configureServer` is expected to run exactly once per dev-server lifetime. Counting invocations lets us detect (via log) any unexpected re-run that would orphan the previous `wss`/upgrade-listener."

In normal operation, Vite fires `configureServer` once. HMR reloads of user code DO NOT re-fire `configureServer` — they reload only the affected modules. `configureServer` would re-fire only if the plugin module itself were invalidated (rare; typically only on vite.config.ts edit → Vite restart).

### The real HMR scenario

When Vite restarts after a `vite.config.ts` edit, the ENTIRE Node/Bun process tears down and a new one starts. Module state is reset. So the scenario is:

- Normal dev: `configureServer` fires once; no HMR re-invocation concern.
- Full restart: new process, fresh module-load, fresh `configureServer` — not HMR, just sequential boots.
- Unexpected `configureServer` re-invocation (if it happens): the current plugin logs a warning and keeps going — the second call attaches a second upgrade listener, which is a leak but not a crash.

## Decision

**Option (a) — module-load.** Reasons:

1. **Matches current plugin shape.** Zero behavior change in the `configureServer` lifecycle.
2. **No singleton-gate complexity.** Module-scope `let srv: ServerInstance` is naturally singleton because Node/Bun caches modules.
3. **No top-level `await` required.** `createServer()` is synchronous (returns immediately; kicks off async init); `srv.ready` is the promise for async-init completion. Waiting for readiness is the plugin's choice, not the module-load's.
4. **HMR re-invocation preserved.** Second `configureServer` still gets the same `srv` reference; today's warn-and-continue logic applies.

## ensureProjectGit ordering: why it must come before createServer()

`createServer()` does NOT call `ensureProjectGit` internally. Every existing consumer calls it upstream:

- `bootServer()` — via injected `ensureProjectGitFn` hook (`boot.ts:157-160`). CLI + Electron utility pass it through.
- Integration test harness — explicit call at `test-harness.ts:119`: `await ensureProjectGit(contentDir);`.
- Vite plugin today — via `runDevShadowInit`, which does `ensureProjectGit(PROJECT_ROOT)` before `initShadowRepo(PROJECT_ROOT)`.

Post-refactor, the plugin must preserve the fail-fast on missing git. Order of operations at module-load:

1. Resolve content config (sync).
2. Acquire server lock (inside `createServer()` — no explicit `acquireServerLock` needed).
3. *If* `!isTestIsolated`: `await ensureProjectGit(PROJECT_ROOT)` — top-level await. On `ProjectGitInitError`: module load throws → Vite plugin registration fails → `bun run dev` exits with error. Matches today's `exit(1)` behavior from `runDevShadowInit`'s error handler.
4. Call `createServer({...})` — its `initAsync` runs `initShadowRepo` against `projectDir`.

For `isTestIsolated` mode, step 3 is skipped — test tmpdirs don't have `.git/` and tests don't need shadow. `createServer()`'s internal `initShadowRepo` will fail and `degraded.push('shadow-repo')` will fire. Acceptable for tests (timeline features aren't exercised; test-harness shape already tolerates this via `gitEnabled: false` + its own contentDir `ensureProjectGit`).

Top-level await works natively in Bun + ESM; Vite's plugin module resolution supports async plugin modules. No config change required.

## Implementation sketch (post-refactor)

```ts
// Module scope
import { createServer, ensureProjectGit, type ServerInstance } from '@inkeep/open-knowledge-server';

const contentConfig = resolveContentConfig();
const CONTENT_DIR = /* ... existing resolution with OK_TEST_CONTENT_DIR branch ... */;
const isTestIsolated = Boolean(process.env.OK_TEST_CONTENT_DIR);

// Fail-fast on missing .git/ in production mode only (mirrors runDevShadowInit)
if (!isTestIsolated) {
  await ensureProjectGit(PROJECT_ROOT);
  // Throws ProjectGitInitError → Vite plugin registration fails → dev exits.
}

// Single createServer call — replaces ~150 LOC of manual wiring
const srv: ServerInstance = createServer({
  contentDir: CONTENT_DIR,
  projectDir: isTestIsolated ? CONTENT_DIR : PROJECT_ROOT,
  contentRoot: isTestIsolated ? '' : CONTENT_ROOT,
  gitEnabled: !isTestIsolated,
  includePatterns: contentConfig.include,
  excludePatterns: contentConfig.exclude,
  quiet: true,
});

// Plugin's fail-fast shutdown + release path — same shape as today
process.once('SIGINT', () => srv.destroy());
process.once('SIGTERM', () => srv.destroy());
process.once('exit', () => /* sync cleanup */);

export function hocuspocusPlugin(): Plugin {
  return {
    name: 'hocuspocus',
    configureServer(server) {
      // Update server-lock port once Vite binds
      server.httpServer?.once('listening', () => {
        const addr = server.httpServer?.address();
        if (typeof addr === 'object' && addr !== null) {
          updateServerLockPort(srv.lockDir, addr.port);
        }
      });

      // /api/config + /api/* middleware — unchanged from today
      server.middlewares.use(async (req, res, next) => {
        // ... same body as current, but calls srv.hocuspocus.hooks(...) ...
      });

      // sirv content serving — unchanged
      // ...

      // /collab + /collab/keepalive upgrade handler — copied from boot.ts
      // per D5, using srv.hocuspocus + srv.sessionManager + srv.agentFocusBroadcaster +
      // srv.agentPresenceBroadcaster
      server.httpServer?.prependListener('upgrade', (req, socket, head) => {
        // ... borrowed logic from boot.ts:255-396 ...
      });
    },
  };
}
```

## Implications for the refactor PR

- Module-load synchronous block shrinks by ~100 LOC (no manual extension wiring).
- `configureServer` body shrinks/simplifies (no second-party watcher startup IIFE; `srv.ready` handles that).
- `srv.destroy()` replaces three separate cleanup paths (watcher unsubscribe, cc1Broadcaster.destroy, systemDocConnection.disconnect).
- HMR warn-and-continue path preserved verbatim.
- Lock acquire happens inside `createServer()`, so the plugin's current explicit `acquireServerLock(...)` at line 121 + the try/catch rollback block at line 120-125 + the init-failure rollback at line 278-285 all compress into `createServer()`'s own try-catch on lock + `srv.destroy()` on shutdown.

## What would change the decision

- If `createServer()` ever acquired a global (non-idempotent) resource at its entry, module-load would be unsafe and Option (b) + singleton gate would be required. Not true today.
- If Vite introduced a lifecycle where `configureServer` legitimately fires multiple times *without* process restart, Option (b) would be safer. Not observed today.
