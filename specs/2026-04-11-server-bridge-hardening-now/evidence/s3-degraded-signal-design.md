---
title: "S3 — server.degraded signal design"
type: synthesis
sources:
  - packages/server/src/standalone.ts
  - packages/app/tests/integration/test-harness.ts
created: 2026-04-11
baseline-commit: 2d35736
---

## TLDR

Add `degraded: string[]` to `ServerInstance`. Populated by `initAsync()` via push-on-catch in the three existing try/catch blocks (shadow repo init, file watcher, HEAD watcher). Consumers read AFTER awaiting `server.ready`. Backwards compatible — no existing consumer is affected; `test-harness.ts`'s existing `await srv.ready` pattern continues to work unchanged.

## Detail

### Current state of `ServerInstance`

```typescript
// packages/server/src/standalone.ts:82-88
export interface ServerInstance {
  hocuspocus: Hocuspocus;
  sessionManager: AgentSessionManager;
  destroy: () => Promise<void>;
  /** Resolves when async init (shadow repo, file watcher subscription) is complete. */
  ready: Promise<void>;
}
```

And the factory construction:

```typescript
// packages/server/src/standalone.ts:685-687
const ready = initAsync();
return { hocuspocus, sessionManager, destroy, ready };
```

### Current state of `initAsync()`

Three subsystems with try/catch blocks that log and swallow on failure:

1. **Shadow repo init** (`packages/server/src/standalone.ts:428-436`)
   ```typescript
   if (!shadowRef.current) {
     try {
       shadowRef.current = await initShadowRepo(projectDir);
       console.log(`[server] Shadow repo initialized at ${shadowRef.current.gitDir}`);
     } catch (e) {
       console.error('[server] Shadow repo init failed:', e);
     }
   }
   ```

2. **Shadow repo integrity check + reinit** (lines 439-457) — may set `shadowRef.current = undefined` if reinit fails after corruption detected.

3. **File watcher** (lines 459-464):
   ```typescript
   try {
     watcher = await startWatcher(contentDir, onDiskEvent, contentFilter);
   } catch (err) {
     console.error('[server] Disk bridge watcher failed to start:', err);
   }
   ```

4. **HEAD watcher** (lines 466-682):
   ```typescript
   try {
     headWatcher = await startHeadWatcher(
       projectDir,
       async ({ trigger }) => { /* onBatchBegin */ },
       async (info) => { /* onBatchEnd */ },
     );
   } catch (err) {
     console.error('[server] HEAD watcher failed to start:', err);
   }
   ```

### Proposed design

**Additive change to `ServerInstance` (with `readonly` modifier per design-challenge Finding 3):**

```typescript
export interface ServerInstance {
  hocuspocus: Hocuspocus;
  sessionManager: AgentSessionManager;
  destroy: () => Promise<void>;
  /** Resolves when async init is complete. After this resolves, `degraded` is populated. */
  ready: Promise<void>;
  /**
   * Subsystem names that failed to initialize during async init.
   * Populated after `ready` resolves. Empty array means all subsystems healthy.
   * Possible values: 'shadow-repo', 'file-watcher', 'head-watcher'.
   *
   * Note: read this AFTER awaiting `ready`. Reading before `ready` resolves
   * returns an incomplete list (typically []).
   *
   * Marked `readonly` to prevent consumer mutation. The underlying array is
   * mutable internally for initAsync population but the public contract is frozen.
   */
  readonly degraded: readonly string[];
}
```

The `readonly` modifier is compile-time protection: `srv.degraded.push(...)` is a type error, `srv.degraded.length = 0` is a type error, `srv.degraded = ['x']` is a type error. Zero runtime cost. The implementation still uses `const degraded: string[] = []` internally; TypeScript's structural widening makes this safe.

**Implementation inside `createServer`:**

```typescript
// Near the top of createServer, after shadowRef/watcher/headWatcher declarations
const degraded: string[] = [];

// Inside initAsync, inside each catch block:
// Shadow repo init catch (line 434):
catch (e) {
  degraded.push('shadow-repo');
  console.error('[server] Shadow repo init failed:', e);
}

// Shadow repo reinit catch (line 450) — same condition, but only push if not already there:
catch (e2) {
  console.error('[server] Shadow repo reinit failed:', e2);
  shadowRef.current = undefined;
  if (!degraded.includes('shadow-repo')) degraded.push('shadow-repo');
}

// File watcher catch (line 462):
catch (err) {
  degraded.push('file-watcher');
  console.error('[server] Disk bridge watcher failed to start:', err);
}

// HEAD watcher catch (line 680):
catch (err) {
  degraded.push('head-watcher');
  console.error('[server] HEAD watcher failed to start:', err);
}

// At the factory return:
return { hocuspocus, sessionManager, destroy, ready, degraded };
```

### Why this shape over alternatives

| Alternative | Why not |
|---|---|
| `ready: Promise<{ degraded: string[] }>` | Breaks existing `await srv.ready` usage in `test-harness.ts`. The void contract is already consumed. |
| `getHealth()` method | Adds a function where a simple array suffices. Premature abstraction. |
| Reject `ready` on any init failure | Changes existing semantics (server currently initializes in degraded mode; callers expect it to boot). High breakage risk for minimal benefit. |
| Emit events on degradation | Adds event machinery for a static post-init state. Overkill. |
| Single `degraded: boolean` flag | Loses granularity — can't tell which subsystem failed. Callers want to know what's broken, not just that something is. |

### "Degraded" vs "absent-by-design" — the head-watcher wrinkle (RESOLVED 2026-04-11)

Earlier draft of this evidence file raised a concern: "startHeadWatcher may throw on missing `.git` and cause spurious 'head-watcher' pushes to degraded in standalone mode." This was **resolved during spec audit** (audit-findings.md M3 + design-challenge.md Finding 2).

`packages/server/src/head-watcher.ts:136-144`:

```typescript
export async function startHeadWatcher(
  projectRoot: string,
  onBatchBegin: OnBatchBegin,
  onBatchEnd: OnBatchEnd,
): Promise<HeadWatcherHandle> {
  const resolvedGitDir = resolveGitDir(projectRoot);
  if (!resolvedGitDir) {
    // Standalone mode — no .git to watch
    return { unsubscribe: async () => {}, getLastKnownBranch: () => null };
  }
  // ...
}
```

**`startHeadWatcher` returns a no-op handle when `.git` is absent. It does NOT throw.** The catch at `standalone.ts:680` is unreachable in standalone mode — it only fires on actual errors (e.g., `@parcel/watcher` subscribe failure on a valid `.git`).

**Implications for S3:**
- No guard needed around the `degraded.push('head-watcher')` statement
- No distinction between "attempted and failed" vs "absent by design" — the former is the only case that reaches the catch
- No implementation-time verification needed
- Q4 is RESOLVED (was Open, now locked via D8)

### Consumer impact

**Existing consumer (`test-harness.ts`):** unchanged. `await srv.ready` still works. Tests can optionally `expect(srv.degraded).toEqual([])` to assert clean init.

**Future consumer (CLI `start` command):** should log a warning banner if `server.degraded.length > 0` after `await srv.ready`. Example:

```typescript
await srv.ready;
if (srv.degraded.length > 0) {
  console.warn(
    `[open-knowledge] Server started in DEGRADED mode. Failed subsystems: ${srv.degraded.join(', ')}. Some features unavailable.`,
  );
}
```

The CLI-side consumer change is **out of scope for S3** — S3 only adds the signal. A follow-up story can wire it into `cli/src/commands/start.ts` for user visibility.

## Test strategy

New tests in `packages/server/src/standalone.test.ts` (new file) OR appended to an existing server test file if one exists for createServer lifecycle:

1. **Clean init → empty degraded.** Pass a valid config to a fresh tmpdir. After `await srv.ready`, expect `srv.degraded` to equal `[]`.
2. **Shadow repo failure → degraded includes 'shadow-repo'.** Force failure by passing a `projectDir` with no filesystem permissions (or a non-existent path). After `await srv.ready`, expect `srv.degraded` to include `'shadow-repo'`. Check that `srv.hocuspocus` is still usable for basic get/put.
3. **File watcher failure → degraded includes 'file-watcher'.** Force failure by passing an invalid `contentDir` (e.g., a file path, not a directory). After `await srv.ready`, expect `srv.degraded` to include `'file-watcher'`.
4. **Multiple failures → degraded lists all.** Trigger both shadow-repo and file-watcher failures. Expect `srv.degraded` to equal both entries.

Test mechanics: use `mkdtempSync` for isolated dirs. Use `chmod 000` or invalid paths to force specific failures. Clean up with `finally { await srv.destroy() }`.

### Why not integration-test via bridge-matrix

bridge-matrix.test.ts uses `createTestServer()` which hardcodes a clean tmpdir + valid config. Adding degraded-path tests would require forking that helper or adding opt-in failure injection, which bloats the shared harness. A dedicated unit-level test file is cleaner.

## Implications

- S3 is a localized, backwards-compatible change: a single new field on `ServerInstance`, four catch-block pushes, and one line in the return.
- Estimated wall clock: ~4-6 hours including tests. (The PROJECT.md estimate was ~1 day, which was generous.)
- No consumer changes required in this spec. CLI wiring is a separate story.
- The head-watcher "attempted vs absent-by-design" question needs resolution during implementation — not a spec-time blocker, but worth documenting.

## Pointers

- `packages/server/src/standalone.ts:82-88` — current ServerInstance type
- `packages/server/src/standalone.ts:426-683` — initAsync with existing catches
- `packages/server/src/standalone.ts:685-687` — factory return
- `packages/app/tests/integration/test-harness.ts:81` — existing `await srv.ready` usage pattern

## Gaps / follow-ups

- Verify `startHeadWatcher` behavior when `.git` is absent (throws vs returns quietly) during implementation.
- Consider whether a `'shadow-repo:corrupted'` variant is worth distinguishing from `'shadow-repo'` for the corruption-reinit failure path. Probably not — same consumer action (warn + proceed).
