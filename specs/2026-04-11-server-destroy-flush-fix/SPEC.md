# `createServer().destroy()` Graceful Shutdown Data-Loss Fix

**Status:** Finalized (ready for implementation)
**Owner(s):** Nick Gomez
**Last updated:** 2026-04-11
**Baseline commit:** `8801bd3`
**Links:**
- Evidence: [./evidence/](./evidence/)
- Changelog: [./meta/_changelog.md](./meta/_changelog.md)
- Related research:
  - [reports/hocuspocus-flush-and-reconnect-semantics/REPORT.md](../../reports/hocuspocus-flush-and-reconnect-semantics/REPORT.md) §OQ-08 — primary source-read that surfaced the bug and designed the fix
- Related specs:
  - [specs/2026-04-11-electron-desktop-app/SPEC.md](../2026-04-11-electron-desktop-app/SPEC.md) §8.3.1, D17, R1-a — the Electron spec that surfaced this bug and documented the canonical fix. **This spec exists to pull that fix into its own focused work item so the desktop spec doesn't have to expand to include pre-existing-bug scope.**

---

## 1) Problem statement

**Situation.** Open Knowledge's Hocuspocus server uses a two-layer debounced persistence pipeline (`packages/server/src/persistence.ts`): **L1** serializes the Y.Doc to markdown on disk after a 2-second / 10-second-max debounce, and **L2** commits those disk writes to the shadow git repo after a 30-second idle debounce. Both timers are fire-and-reset on every change. Graceful shutdown of the server must drain both layers before the process exits. `createServer().destroy()` in `packages/server/src/standalone.ts:399-424` is the single choke point for this — called from the CLI's SIGINT/SIGTERM handler today (`packages/cli/src/commands/start.ts`) and from every Electron desktop window lifecycle event in the near-future (per [2026-04-11-electron-desktop-app](../2026-04-11-electron-desktop-app/SPEC.md)).

**Complication.** The current destroy() sequence has **two compounding defects**, confirmed by direct source reading of `@hocuspocus/server@4.0.0-rc.1`:

1. **`hocuspocus.flushPendingStores()` is implemented as fire-and-forget.** Source at `@hocuspocus/server/src/Hocuspocus.ts:165-177` iterates documents and calls the internal `debouncer.executeNow(id)` for each, but **discards the returned Promises**. The method signature is `flushPendingStores(): void` — no `async`, no return. Callers that `await` it are awaiting nothing. The only built-in path that makes Hocuspocus drain awaitably is `Server.destroy()` (the `@hocuspocus/server` `Server` wrapper at `Server.ts:200-225`), which installs a one-shot `afterUnloadDocument` extension hook. **OK uses the bare `Hocuspocus` class, not `Server`, so it doesn't inherit that path.**

2. **The L2 git-commit flush is called before the L1 markdown flush.** In `standalone.ts:404-418`, `persistence.flushPendingGitCommit()` runs at line 405, *before* `hocuspocus.flushPendingStores()` at line 417. But L1 is what schedules the L2 timer (via `persistence.ts:388` inside `onStoreDocument`), so running L2 before L1 drains an empty queue. Any L1 writes that complete after L2 returns are stranded — they write to disk but are never committed to the shadow repo within the destroy() window. The trailing `waitForPendingCommits()` at line 418 catches only L1 stores that happened to complete synchronously within the same microtask — which is none, because L1 stores involve disk I/O.

**Observable consequences:**

- **CLI users today** hit this on every Ctrl+C / SIGTERM. Silent — no error, no log, the file on disk just omits the last 1–10 seconds of edits. Most users haven't noticed because most edits are already flushed during normal idle periods; only content typed within the active debounce window before shutdown is at risk.
- **Desktop users tomorrow** would hit this on every project switch (potentially several times per day for an active user), every window close, every app quit, and every auto-update install-on-quit. For a docs-authoring tool whose core value proposition is local-first data ownership, "I switched projects and lost my last sentence" is brand-damaging.

**Actual data-loss window.** The spec's initial framing of "up to 2 seconds" understated the worst case. L1's debouncer uses `configuration.debounce` (2000ms default) as the per-reset interval and `configuration.maxDebounce` (10000ms default) as the hard ceiling when the debounce keeps resetting (`@hocuspocus/server/src/Hocuspocus.ts:499-500`). Under sustained typing, a keystroke arriving every sub-2-second interval keeps resetting the debounce until maxDebounce forces a store. If `destroy()` lands just before the maxDebounce fire, **up to 10 seconds of writes can be stranded**. See [evidence/destroy-investigation-findings.md Finding 7](./evidence/destroy-investigation-findings.md).

We have no telemetry (per D9 of the desktop spec — Obsidian model, zero telemetry) and no user reports. The bug was surfaced by source-reading during the desktop spec's research phase, not by production incidents. We do not and will not know the historical blast radius. The fix is cheap; the debate about "how bad was it really" isn't worth having.

**Resolution.** Apply the two-part fix designed in [R2 report §OQ-08-C](../../reports/hocuspocus-flush-and-reconnect-semantics/REPORT.md) and mirrored in the desktop spec §8.3.1:

1. **Server-side patch.** Add a `flushAllStoresAndWait()` helper inside `createServer()` that (a) pushes a one-shot `afterUnloadDocument` extension hook to the Hocuspocus extensions array, (b) closes Hocuspocus connections, (c) calls `flushPendingStores()`, and (d) awaits a Promise that resolves when `hocuspocus.getDocumentsCount() === 0`. Wrap in a 10-second timeout to guard against misbehaving `onStoreDocument` hooks. Reorder `destroy()` phases: stop watchers first → drain agent sessions → L1 flush via helper → L2 flush → shadow repo release.

2. **Regression test.** Add an integration test at `packages/server/src/standalone.test.ts` (new file) that spins up `createServer()` against a tmp dir, writes into a Y.Doc via `DirectConnection` within the L1 debounce window, calls `destroy()` immediately, and asserts the on-disk markdown contains every write. Without this, the bug would silently regress on any future refactor of the shutdown sequence.

Ship either as a standalone CLI patch release (low risk, high value — fixes the silent data-loss bug in the existing CLI) or bundled as prerequisite work to the Electron desktop app launch, whichever gates first. Per R1-a in the desktop spec, the desktop app launch is blocked on this fix landing.

## 2) Goals

- **G1 — Zero data loss from `createServer().destroy()` in the happy path *for writes that have reached the server's Y.Doc*.** Graceful shutdown flushes all pending L1 markdown writes to disk and all pending L2 git commits to the shadow repo before `destroy()` resolves. This scope is intentional: client-side transmission buffers (e.g., the ~16ms between a keystroke and its WebSocket flush) are a separate, smaller concern addressed by the Electron desktop spec's client-side drain barrier (see [2026-04-11-electron-desktop-app §8.4.1 / D19](../2026-04-11-electron-desktop-app/SPEC.md)). For CLI users, a residual ~16ms client-buffering loss window remains — an order-of-magnitude smaller than the 2–10 second server-side window this fix closes, and cross-package scope to address it is not worth the architectural cost (see NG3).
- **G2 — Bounded data loss budget under pathological conditions.** If `onStoreDocument` throws or hangs during flush, `destroy()` times out at `destroyTimeoutMs` (default 10s) and dumps each still-loaded document's in-memory Y.Doc to `<shadow-gitDir>/rescue/<docName>.md` (D15 / OQ-P2-02) before continuing to Phase 4, so pending edits remain recoverable via the existing `/api/rescue` endpoints.
- **G3 — Regression test that asserts zero-loss.** An integration test exercises the exact scenario (rapid writes → immediate shutdown) and fails if the bug re-appears on any future destroy() refactor.
- **G4 — Minimal blast radius.** The fix is isolated to `packages/server/src/standalone.ts` and the new `packages/server/src/standalone.test.ts`. No changes to `persistence.ts`, no changes to the Hocuspocus extension contract, no changes to the CLI, no changes to the React app, no changes to `.open-knowledge/` on-disk format.
- **G5 — Use public Hocuspocus API only.** No monkey-patching, no access to private internals, no fork of the `@hocuspocus/server` package. The fix uses the same `afterUnloadDocument` extension hook that Hocuspocus's own `Server.destroy()` uses internally.

## 3) Non-goals

- **[NEVER] NG1: Fork of `@hocuspocus/server`.** We use the public extension API; no vendored code.
- **[NOT NOW] NG2: Upstream PR to Hocuspocus for an awaitable `flushPendingStores()`.** R2 noted the upstream fix is mechanically trivial, but it doesn't couple to our local fix (we're using public API, not monkey-patching), so there's no blocker. Filed as Future Work.
- **[NOT NOW] NG3: Renderer-side `ProviderPool.flushAllProviders()` drain barrier.** This is the client-side mirror of `flushAllStoresAndWait()`. Already owned by the [2026-04-11-electron-desktop-app SPEC §8.4.1 / D19](../2026-04-11-electron-desktop-app/SPEC.md) because its only caller is the Electron main process. The web app has no current caller for graceful pool teardown. Moving it here would cross package boundaries (`packages/server` → `packages/app`) without a corresponding consumer.
- **[NEVER] NG4: Instrumentation / telemetry for "how often did the bug fire historically."** Physically impossible — you cannot retroactively measure a bug that's being fixed in this spec. Separately, ongoing production telemetry is bound by D9 of the desktop spec (zero telemetry, Obsidian model). We accept we will never know the historical blast radius. The new shutdown log (D14) gives us forward observability starting with the next release.
- **~~[NOT NOW] NG5: Rescue-buffer dump UX on flush timeout~~ ✅ PROMOTED TO IN SCOPE 2026-04-12 → D15.** When `flushAllStoresAndWait()` hits `destroyTimeoutMs`, each still-loaded document's in-memory Y.Doc is dumped to `<shadow-gitDir>/rescue/<docName>.md` before the timeout error propagates to Phase 3's `phaseErrors`. Reuses `safeRescuePath`, `serializeDoc`, and `incrementRescueBuffer` helpers already in scope from the reconcile-path and branch-switch rescue sites. See §8.1, §10 D15, §11 OQ-P2-02.
- **[NOT NOW] NG6: Performance optimization of the shutdown path.** The fix adds up to ~500ms per pending doc to shutdown *flush latency* in the worst case (L1 markdown serialize + file write + L2 git commit), but only when there are pending writes. This is *flush latency* — how long `destroy()` blocks — and is distinct from the *stranded-write window* of up to 10s mentioned in §1 (how much user input could have accumulated before `destroy()` was called). The upper bound on flush latency is `destroyTimeoutMs` (10s default, configurable via `ServerOptions` per D11) — slow-disk / NFS environments can raise it if legitimate flushes exceed the default. Acceptable — the alternative is silent data loss. Future work could parallelize L1 and L2 drains if measured latency becomes a complaint.
  > **Footnote — "stranded-write window" vs "flush latency".** These are different concepts and should not be conflated. The **stranded-write window** (§1: up to 2–10 seconds) is how much user typing accumulates in the debouncer between the last flushed store and the shutdown signal. The **flush latency** (NG6/J2/J3: ~500ms per pending doc) is how long `destroy()` takes to write that stranded content out. A longer stranded window → more work for flush latency to drain → longer shutdown. Both are bounded by `maxDebounce=10_000ms` for the window and the `flushAllStoresAndWait` 10s timeout for the flush. In the happy path, flush latency is sub-second regardless of window size.
- **[NOT NOW] NG7: Agent-session shutdown semantics refactor.** `sessionManager.closeAll()` is called before L1 flush in the patched sequence. If agent sessions hold pending writes, those are drained through the regular document update path, not via an explicit "agent flush." If this proves insufficient, revisit — but not in this spec.
- **[NOT UNLESS] NG8: Fix beyond `destroy()`.** The current fix targets graceful shutdown only. `onLoadDocument` error paths, reconciliation conflicts, and partial-write crash recovery are out of scope — each has its own existing tests and this spec doesn't touch them.

## 4) Personas / consumers

- **P1 — CLI user running `open-knowledge start` (existing):** SIGINT / SIGTERM path. Silent data-loss today on every shutdown.
- **P2 — Electron desktop app (imminent):** Every project switch, window close, app quit, and install-on-quit auto-update invokes `destroy()`. Multiple times per day per active user.
- **P3 — Integration test author (new):** Needs a repeatable, deterministic test that exercises the full `createServer()` lifecycle. The regression test in this spec also becomes the reference pattern for future tests of server-lifecycle behavior.

## 5) Constraints

### Locked

- **`@hocuspocus/server@4.0.0-rc.1`** — already pinned in `packages/server/package.json`. The `afterUnloadDocument` hook is public API on the `Extension` interface; we're using it as designed.
- **Public extension API only** — no internal access, no monkey-patching, no vendoring.
- **No changes to the persistence layer's public surface** — `persistence.flushPendingGitCommit()` and `persistence.waitForPendingCommits()` stay as they are. We just call them in the right order.
- **No changes to the CLI's SIGINT handler** — `packages/cli/src/commands/start.ts` already awaits `serverInstance.destroy()`; once destroy() is fixed internally, the CLI benefits automatically.
- **ESM TypeScript** — the server package is `"type": "module"` throughout.
- **Bun test runner** — existing tests in `packages/server/src/*.test.ts` use `bun:test`. The new integration test follows that pattern.

### Inherited / non-negotiable

- **Debounce defaults** — L1 2s / 10s-max, L2 30s idle. These are config-driven via ServerOptions but their defaults don't change.
- **Shadow repo semantics** — `persistence.ts` / `shadow-repo.ts` invariants (reconciledBaseByBranch, self-write detection, rescue buffer) stay untouched.

## 6) User journeys

Silent bug fix — there are no user-facing UX changes. The journeys describe the invisible behavioral delta.

### J1 — CLI graceful shutdown (P1, today)

**Before:**
1. User runs `open-knowledge start` in a project folder.
2. Types rapidly in the browser editor.
3. Presses Ctrl+C.
4. Server process exits.
5. Some number of characters typed in the last ~2 seconds are **missing** from the on-disk markdown. Silent.

**After:**
1-3. Same.
4. `destroy()` awaits the L1 flush, which triggers `onStoreDocument` → markdown write → `afterUnloadDocument` hook fires → helper resolves. Then `persistence.flushPendingGitCommit()` sees a populated L2 queue and drains it. Server exits.
5. All characters typed through the Ctrl+C moment are present on disk. Shadow git has a commit for them.

### J2 — Electron project switch (P2, imminent)

**Before (if desktop shipped without this fix):**
1. User types a sentence, clicks a different project in the Project Navigator.
2. Main sends `shutdown` IPC to utilityProcess.
3. utilityProcess's `destroy()` returns quickly (fire-and-forget flush).
4. Main loads the new project's URL.
5. User returns to the original project later and finds the last sentence missing.

**After:**
1-2. Same.
3. utilityProcess's `destroy()` awaits the L1 drain. Flush latency is ~500ms per pending doc — usually sub-second in total, and <100ms if there were no pending writes. (The stranded-write *window* could be as long as 10s, but flushing that much content is still bounded by disk write throughput; see NG6 footnote.)
4-5. All content preserved on return.

### J3 — Desktop app quit with install-on-quit auto-update (P2)

**Before:**
1. User presses Cmd+Q. `app.on('before-quit')` fires.
2. Main tells utilityProcess to destroy. Returns quickly.
3. electron-updater runs the pending installer. Old binary replaced with new.
4. User launches the new version → missing last edits from before the quit.

**After:**
1-2. Same, except destroy() awaits L1+L2 drain. Flush latency is ~500ms per pending doc — acceptable for a once-per-release event. (If the user was typing heavily up to the Cmd+Q moment, up to 10s of content may be in the stranded window per §1, but that content still flushes at disk throughput.)
3-4. All content preserved through the upgrade.

### J4 — Shutdown with `onStoreDocument` hung (failure mode)

1. User's project has some pathological document that causes `onStoreDocument` to throw or hang (e.g., disk full, permission error).
2. User triggers shutdown.
3. `flushAllStoresAndWait()` waits on the `afterUnloadDocument` hook, which never fires because the store errored out or the document is still "loading."
4. After `destroyTimeoutMs` (default 10s), the `Promise.race` timeout wins. Before the error propagates, `flushAllStoresAndWait()` dumps each still-loaded document's in-memory Y.Doc to `<shadow-gitDir>/rescue/<docName>.md` (best-effort per doc; `[rescue]` log category). The timeout error names which docs were rescued versus lost. Phase 3 records the error in `phaseErrors`, the D14 warn-level shutdown log surfaces it, and `destroy()` continues to L2 flush → shadow repo release.
5. Server exits cleanly (no infinite hang). The user can recover the pathological document's last edits from `<shadow-gitDir>/rescue/<docName>.md` via the existing `GET /api/rescue` + `GET /api/rescue/:docName` endpoints (24h expiry). Other documents' writes are preserved either via normal flush (if they unloaded before the timeout) or via the same rescue buffer (if they didn't).

If the shadow repo failed to initialize earlier in `initAsync()`, the rescue loop is skipped and all still-loaded docs are reported as lost in the timeout error message. See §10 D15 and §11 OQ-P2-02.

## 7) Current state (the buggy code, verbatim)

From `packages/server/src/standalone.ts:399-424` at baseline `8801bd3`:

```typescript
async function destroy(): Promise<void> {
    // Wait for async init to complete before cleanup — prevents leaked watcher
    // subscriptions if destroy() is called during startup (e.g., Ctrl+C)
    await ready.catch(() => {});

    // Flush pending git commit before stopping watchers
    await persistence.flushPendingGitCommit();    // ← BUG #2: L2 before L1
    await persistence.waitForPendingCommits();

    if (headWatcher) {
      await headWatcher.unsubscribe();
      headWatcher = null;
    }
    if (watcher) {
      await watcher.unsubscribe();
      watcher = null;
    }
    await sessionManager.closeAll();
    hocuspocus.flushPendingStores();              // ← BUG #1: fire-and-forget
    await persistence.waitForPendingCommits();    // ← catches only synchronous stores (none)
    hocuspocus.closeConnections();
    // Release shadow-root writer lock
    if (shadowRef.current) {
      destroyShadowRepo(shadowRef.current);
    }
}
```

From `@hocuspocus/server@4.0.0-rc.1/src/Hocuspocus.ts:165-177` (confirming BUG #1):

```typescript
/**
 * Immediately execute all pending debounced onStoreDocument calls.
 * Useful during shutdown to ensure documents are persisted and unloaded
 * before the server exits, even when unloadImmediately is false.
 */
flushPendingStores() {
    this.documents.forEach((document: Document) => {
        const debounceId = `onStoreDocument-${document.name}`;
        if (!document.isLoading && this.debouncer.isDebounced(debounceId)) {
            this.debouncer.executeNow(debounceId);
            // ↑ executeNow returns Promise<void> — result discarded
        }
    });
    // ↑ No return value. No async. Method signature is ": void"
}
```

`persistence.ts:264-279` (showing L2 depends on L1 having run):

```typescript
async function flushPendingGitCommit(): Promise<void> {
    if (gitCommitTimer) {
        clearTimeout(gitCommitTimer);
        gitCommitTimer = null;
        // ← gitCommitTimer is only set inside onStoreDocument (persistence.ts:388)
        //   i.e. L1 must run before this has anything to flush
        if (!commitInFlight) {
            commitInFlight = commitToWipRef().finally(() => { ... });
        }
    }
    if (commitInFlight) await commitInFlight;
}
```

## 8) Proposed solution (vertical slice)

### 8.0.1 `ServerOptions` additions (per D11-revised)

Add one field to the `ServerOptions` interface at `packages/server/src/standalone.ts:55-80`:

```typescript
export interface ServerOptions {
  // ... existing fields ...

  /**
   * Maximum time (ms) `destroy()` waits for all pending stores to drain
   * before giving up and continuing with the rest of the shutdown sequence.
   * Defaults to 10_000. Tune lower in tests (e.g., 500) to reclaim CI wall-time
   * on the "flush timeout under failing onStoreDocument" regression case.
   * Tune higher on slow-disk / NFS production environments where a legitimate
   * L1 flush could take more than 10s (rare; most CLI installs should leave
   * this at default).
   */
  destroyTimeoutMs?: number;
}
```

And in the destructure at `standalone.ts:91-105`:

```typescript
const {
  // ... existing fields ...
  destroyTimeoutMs = 10_000,
} = options;
```

**Why a new field rather than deducing from `maxDebounce`?** The natural-debounce ceiling (`maxDebounce=10_000`) and the shutdown-drain ceiling are semantically independent: `maxDebounce` is "force-fire a pending store even if edits keep arriving," while `destroyTimeoutMs` is "give up waiting for a pathological `onStoreDocument` hook." Coupling them via `maxDebounce * 1.5` is clever but couples unrelated concerns, so explicit is better.

**Test harness precedent.** `packages/app/tests/integration/test-harness.ts:67-74` already overrides `debounce: 200, maxDebounce: 1000` for fast test runs. Adding `destroyTimeoutMs: 500` to that list fits the existing pattern — no API shape change, no new idiom.

### 8.1 New helper inside `createServer()` scope (per D9, D11-revised)

Add `flushAllStoresAndWait()` as a closed-over helper in `standalone.ts` (near `destroy()`, not exported). Also add `inflightDestroy: Promise<void> \| null` at the same scope for D9's idempotency guard. The helper receives `destroyTimeoutMs` as a parameter so tests can override it via `ServerOptions`:

```typescript
// This helper mirrors @hocuspocus/server's internal Server.destroy() pattern
// at node_modules/@hocuspocus/server/src/Server.ts:200-225. We can't use
// Server.destroy() directly because Server owns its own httpServer + crossws
// WebSocket adapter + signal binding, which conflicts with OK's shared HTTP
// server + /api/* routing + static asset serving + /collab-only upgrade. See D13.
//
// Timeout is parameterized (per D11 revision) so tests can pass 500ms to
// reclaim CI wall-time and slow-disk production environments can tune via
// ServerOptions.destroyTimeoutMs (defaults to 10_000).
async function flushAllStoresAndWait(timeoutMs: number): Promise<void> {
  if (hocuspocus.documents.size === 0) return;

  // `resolved` guards against the afterUnloadDocument hook firing AFTER
  // the Promise.race timeout wins — the hook stays on
  // hocuspocus.configuration.extensions for the rest of this server's
  // lifetime (we're about to exit anyway), but we don't want it to try
  // to resolve a stale Promise closure. Check-and-flip before calling resolve().
  let resolved = false;
  const allDone = new Promise<void>((resolve) => {
    hocuspocus.configuration.extensions.push({
      async afterUnloadDocument({ instance }) {
        if (!resolved && instance.getDocumentsCount() === 0) {
          resolved = true;
          resolve();
        }
      },
    });
  });

  // Capture doc names before the race so the timeout error can name docs that
  // failed to unload, and so the rescue loop below has the target list.
  const pendingDocNames = Array.from(hocuspocus.documents.keys());

  hocuspocus.closeConnections();   // force-close clients so docs can unload
  hocuspocus.flushPendingStores(); // trigger the debouncer.executeNow chain

  // NOTE: The timeout rejection is NOT caught inside the helper. It propagates
  // out to destroy()'s Phase 3 try/catch wrapper, where it gets captured in
  // the phaseErrors array as { phase: 'flush-all-stores', error: ... } and
  // emitted via the warn-level shutdown log (D14). An earlier draft of this
  // helper had an internal `.catch((err) => log.error(...))` but that swallowed
  // the error before Phase 3 could see it — breaking the behavioral contract
  // that Test 3 (D12) asserts (warn log's phaseErrors containing flush-all-stores).
  // Test-driven discovery during US-007 implementation corrected this.
  //
  // D15 / OQ-P2-02: before the timeout error propagates, dump each still-loaded
  // doc's in-memory Y.Doc to <shadow-gitDir>/rescue/<docName>.md (best-effort
  // per doc) so the user can recover via /api/rescue. Unconditional — timeout
  // means onStoreDocument did not complete, so in-memory state IS the record.
  await Promise.race([
    allDone,
    new Promise<void>((_, reject) =>
      setTimeout(() => {
        resolved = true; // neutralize any subsequent hook fire
        const stillLoaded = Array.from(hocuspocus.documents.keys());

        const rescued: string[] = [];
        const rescueFailed: string[] = [];
        if (shadowRef.current) {
          for (const docName of stillLoaded) {
            try {
              const ours = serializeDoc(docName);
              if (ours === null) { rescueFailed.push(docName); continue; }
              const rescuePath = safeRescuePath(shadowRef.current.gitDir, docName);
              if (!rescuePath) { rescueFailed.push(docName); continue; }
              mkdirSync(dirname(rescuePath), { recursive: true });
              writeFileSync(rescuePath, ours, 'utf-8');
              incrementRescueBuffer();
              rescued.push(docName);
              log.info({ docName }, `[rescue] rescue buffer saved on flush timeout: ${docName}`);
            } catch (e) {
              rescueFailed.push(docName);
              log.error({ err: e, docName }, `[rescue] failed to write rescue buffer for ${docName}`);
            }
          }
        } else {
          rescueFailed.push(...stillLoaded);
        }

        const rescueSummary =
          rescued.length > 0 || rescueFailed.length > 0
            ? ` — rescued [${rescued.join(', ')}]${rescueFailed.length > 0 ? `, lost [${rescueFailed.join(', ')}]` : ''}`
            : '';

        reject(
          new Error(
            `flushAllStoresAndWait timeout after ${timeoutMs}ms — ${stillLoaded.length}/${pendingDocNames.length} docs did not unload: [${stillLoaded.join(', ')}]${rescueSummary}`,
          ),
        );
      }, timeoutMs),
    ),
  ]);
}
```

Simplifications from the earlier draft (per audit + ship pass 2026-04-11/12):
- Removed the redundant `docNames = Array.from(...)` snapshot — `hocuspocus.documents.size === 0` is the equivalent check.
- Removed the inline race-guard check inside the Promise executor — the top-level early-exit serves the same purpose, and the two were back-to-back synchronous code (no race window between them in Node's single-threaded model).
- Added the `resolved` flag to cleanly handle the orphaned-hook-on-timeout case — the hook stays on `configuration.extensions` (cleanup would require more state tracking to splice it out), but `resolved` ensures it becomes a no-op once the timeout wins.
- **Timeout parameterized** (per D11 revision) via `destroyTimeoutMs` — default 10_000 matches the old hardcoded value for production, tests override to 500ms to avoid 10s+ CI wall-clock.
- **Error logs via `getLogger('server')`** (per D14 / Q2 synthesis) rather than `console.error` — consistent with the rest of the server package's pino-based logging. Zero new dependencies.
- **No internal `.catch()`** on the Promise.race (ship-pass correction, 2026-04-12). Earlier spec drafts included `.catch((err) => log.error('shutdown flush timed out'))` inside the helper, but this swallowed the timeout error before Phase 3's try/catch in `destroy()` could capture it in `phaseErrors`. The warn-level shutdown log (D14) must report `phase: 'flush-all-stores'` on timeout — that's the Test 3 behavioral contract. Letting the error propagate out of the helper achieves this correctly. The timeout is still logged — just once, by Phase 3's wrapper, via the structured shutdown-log mechanism rather than a separate error line.

**Why the one-shot extension hook works.** Hocuspocus's internal store path is:
```
flushPendingStores → debouncer.executeNow → run pending onStoreDocument
  → onStoreDocument hook (awaited inside saveMutex)
  → afterStoreDocument
  → setTimeout(0) → unloadDocument
  → afterUnloadDocument ← our hook fires here
  → getDocumentsCount() === 0 → resolve
```

This mirrors the exact pattern used by `@hocuspocus/server`'s own `Server.destroy()` in `Server.ts:200-225`. The `afterUnloadDocument` hook is part of Hocuspocus's public `Extension` interface, documented at [tiptap.dev/docs/hocuspocus/server/hooks](https://tiptap.dev/docs/hocuspocus/server/hooks) — no internal access.

**The 10-second timeout** guards against `onStoreDocument` throwing or hanging. Per `Hocuspocus.ts:486-490`, a store failure leaves the document in memory ("Document stays in memory to avoid data loss") — so without the timeout, `allDone` would never resolve and `destroy()` would hang forever. With it, we trade perfect correctness under pathology for bounded latency under success. Worth it.

### 8.2 Reordered `destroy()` phases (per D9, D10-revised-twice, D11-revised, D14)

Replace `standalone.ts:399-424` with the following. Note:
- **D9 — Cached-Promise idempotency guard** wrapping the full teardown.
- **D10 (REVISED TWICE)** — per-phase `try/catch` on Phases **1, 2, 3, 4** with log-and-continue. Originally D10 wrapped only Phase 5; then `/gtm:analyze` expanded to Phases 1, 3, 4 (leaving Phase 2 unwrapped because `sessionManager.closeAll()` has intrinsic per-session protection at `agent-sessions.ts:168-177`); finally the post-QA review (Phase 8 of ship) correctly pointed out that `closeAll()` itself can still throw from non-session causes (iterator errors, future refactors) — so completing D10's best-effort-drain philosophy means wrapping Phase 2 too, with its own `phase: 'agent-session-drain'` entry on `phaseErrors`. The per-session try/catch inside `closeAll()` handles session-level errors; the destroy-level try/catch handles method-level throws. Both are needed for true end-to-end best-effort. Phase 5 stays in the outer `finally`.
- **D11 (REVISED)** — flush timeout is now parameterized via `destroyTimeoutMs` option (default 10_000).
- **D14 (NEW)** — structured success/error log at the end of `destroy()` via `getLogger('server')`, making the shutdown path observable and providing a behavioral contract for the regression test.

```typescript
let inflightDestroy: Promise<void> | null = null;  // D9 idempotency guard

async function destroy(): Promise<void> {
  if (inflightDestroy) return inflightDestroy;   // D9: concurrent calls await same teardown

  inflightDestroy = (async () => {
    // D14: observability — capture start time and track what succeeded.
    // Enables the structured shutdown log and gives tests a behavioral contract.
    const t0 = Date.now();
    const phaseErrors: Array<{ phase: string; error: string }> = [];

    // Wait for async init to complete before cleanup — prevents leaked watcher
    // subscriptions if destroy() is called during startup (e.g., Ctrl+C)
    await ready.catch(() => {});

    // Capture document count AFTER await ready so it reflects documents
    // loaded during async init (shadow repo init, file watcher scan).
    // (Ship-pass correction 2026-04-12: the earlier draft captured this
    // before ready, which under-reported flushedCount in the destroy-during-init
    // edge case exercised by Test 5.)
    const flushedCountBefore = hocuspocus.documents.size;

    try {
      // Phase 1: stop watchers FIRST so L1 disk writes don't trigger reconcile
      //          loops. D10: per-phase try/catch — watcher.unsubscribe() throws
      //          are ~0.1% (@parcel/watcher native binding edge cases) but if
      //          uncaught they gate the high-value Phase 3-4 drains below.
      try {
        if (headWatcher) {
          await headWatcher.unsubscribe();
          headWatcher = null;
        }
        if (watcher) {
          await watcher.unsubscribe();
          watcher = null;
        }
      } catch (err) {
        phaseErrors.push({
          phase: 'watcher-unsubscribe',
          error: err instanceof Error ? err.message : String(err),
        });
        log.error({ err }, 'shutdown phase-1 watcher unsubscribe failed');
      }

      // Phase 2: drain agent sessions. sessionManager.closeAll() at
      //          agent-sessions.ts:168-177 has a per-session try/catch that
      //          handles session-level failures (one bad session doesn't stop
      //          the others). The destroy-level wrap here handles method-level
      //          throws that bypass that inner protection — iterator errors,
      //          future refactors that throw before the loop, etc. Without
      //          this wrap, a throw from closeAll() would skip Phases 3-5,
      //          losing the L1 drain. (Ship-pass correction 2026-04-12.)
      try {
        await sessionManager.closeAll();
      } catch (err) {
        phaseErrors.push({
          phase: 'agent-session-drain',
          error: err instanceof Error ? err.message : String(err),
        });
        log.error({ err }, 'shutdown phase-2 agent session drain failed');
      }

      // Phase 3: drain L1 (Y.Doc → markdown → disk) — awaitable via the one-shot
      //          afterUnloadDocument hook. D10: try/catch on the external
      //          boundary. flushAllStoresAndWait() intentionally does NOT catch
      //          its own timeout — the timeout Error propagates out of the
      //          helper and is captured here as { phase: 'flush-all-stores' },
      //          which Test 3 (D12) asserts on. See §8.1 helper comment for
      //          why the `.catch()` was removed from the helper.
      try {
        await flushAllStoresAndWait(destroyTimeoutMs);
      } catch (err) {
        phaseErrors.push({
          phase: 'flush-all-stores',
          error: err instanceof Error ? err.message : String(err),
        });
        log.error({ err }, 'shutdown phase-3 flush failed');
      }

      // Phase 4: drain L2 (disk → git) — only meaningful AFTER L1 has run,
      //          because L1 is what schedules the L2 timer. D10: per-phase
      //          try/catch — this is the HIGHEST-frequency throw surface in
      //          the shutdown path (git subprocess timeout on slow NFS,
      //          disk full mid-commit, stale .git refs, missing git binary).
      //          Without this guard, a git failure abandons Phase 5 and any
      //          subsequent cleanup.
      try {
        await persistence.flushPendingGitCommit();
        await persistence.waitForPendingCommits();
      } catch (err) {
        phaseErrors.push({
          phase: 'git-commit-flush',
          error: err instanceof Error ? err.message : String(err),
        });
        log.error({ err }, 'shutdown phase-4 git commit flush failed');
      }
    } finally {
      // D10: Phase 5 (shadow repo release) ALWAYS runs, even if Phases 1-4
      //      threw or if any phase's internal try/catch caught an error.
      //      Prevents writer-lock leak on disk.
      //
      //      Wrapped in try/catch so that a pathological shadowRef state
      //      (e.g., handle invalidated by a file-system race between init
      //      and destroy) doesn't escape as an uncaught throw from destroy().
      if (shadowRef.current) {
        try {
          destroyShadowRepo(shadowRef.current);
        } catch (err) {
          phaseErrors.push({
            phase: 'shadow-repo-release',
            error: err instanceof Error ? err.message : String(err),
          });
          log.error({ err }, 'shutdown phase-5 destroyShadowRepo failed');
        }
      }

      // D14: structured shutdown log — always emitted, success or partial failure.
      //      This is the only observability path for destroy() and becomes a
      //      behavioral contract in Test 1 (D12). At level `info` on clean exit,
      //      `warn` on partial failure — makes grep-able regression tripwires.
      const durationMs = Date.now() - t0;
      const flushedCount = flushedCountBefore; // documents drained by phase 3
      if (phaseErrors.length === 0) {
        log.info(
          { flushedCount, durationMs },
          `shutdown flushed ${flushedCount} documents in ${durationMs}ms`,
        );
      } else {
        log.warn(
          { flushedCount, durationMs, phaseErrors },
          `shutdown flushed ${flushedCount} documents in ${durationMs}ms with ${phaseErrors.length} phase error(s)`,
        );
      }
    }
  })();

  return inflightDestroy;
}
```

**Why Phase 2 IS wrapped at the destroy() level (post-QA review correction, 2026-04-12).** `sessionManager.closeAll()` at `agent-sessions.ts:168-177` already iterates sessions with a per-session `try/catch`, which handles session-level errors (one bad session doesn't stop the others). But `closeAll()` itself can still throw — for instance, if the session-iteration setup throws, or if a future refactor of `AgentSessionManager` introduces a throw outside the per-session loop. Wrapping `await sessionManager.closeAll()` in the destroy-level try/catch closes that second-order gap and ensures Phases 3–5 still run even in that case. Session-level failures are logged by `agent-sessions.ts` directly via its own `console.error` path and do NOT contribute to `phaseErrors` (intentional — per-item failures inside a phase are logged at their own layer; the destroy-level summary tracks phase-level outcomes). Only method-level throws from `closeAll()` itself get captured as `{phase: 'agent-session-drain'}` in `phaseErrors`.

**Phase ordering dependency note.** Even with per-phase `try/catch`, the order still matters:
- Phase 1 before Phase 3: stopping watchers first prevents L1 disk writes from triggering reconcile loops during the drain.
- Phase 3 before Phase 4: L1 (`onStoreDocument`) schedules the L2 git-commit timer; Phase 4 has nothing to drain if Phase 3 hasn't run.
- Phase 5 in `finally`: shadow repo lock release must happen regardless of earlier phase failures.

The per-phase `try/catch` changes error propagation (partial failures become logged warnings instead of aborting the destroy), but the logical dependencies between phases are preserved.

**Why phase ordering matters:**

| Phase | Why this order |
|---|---|
| 1. Watchers → first | L1 in phase 3 writes to disk. If watchers are still subscribed, they observe those writes as external events and trigger the 3-way merge path. Unsubscribing first is cheap and avoids that loop. |
| 2. Agent sessions → second | `DirectConnection` instances hold docs open, preventing unload. Closing them lets docs unload naturally in phase 3. |
| 3. L1 flush (via helper) → third | L1 is the debounced markdown write. Must run before L2 because L1 schedules L2. |
| 4. L2 flush → fourth | Only meaningful after L1 populates the commit queue. |
| 5. Shadow repo release → last | The shadow repo is the destination for L2 commits; must stay open until L2 finishes. |

### 8.3 Regression test — `packages/server/src/standalone.test.ts` (new file)

Target scenario: rapid writes within the L1 debounce window followed by immediate destroy(), then assertion that the on-disk markdown contains every write.

```typescript
import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import * as Y from 'yjs';
import { createServer } from './standalone';

describe('createServer().destroy() — graceful shutdown flush', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'ok-destroy-test-'));
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  test('flushes L1 markdown writes before destroy() resolves + emits shutdown log', async () => {
    // D14: assert the structured shutdown log was emitted — behavioral contract
    // for the flush path. A future refactor that silently skips the drain would
    // still produce correct file content via natural debounce but would NOT emit
    // the shutdown log with flushedCount > 0, catching the regression.
    const logSpy = spyOnLogger('server'); // helper — see §8.3.1 for implementation

    const server = createServer({
      contentDir: tmpDir,
      projectDir: tmpDir,
      port: 0,          // ephemeral
      quiet: true,
      debounce: 60_000, // 60s — prevents natural debounce from firing within test wall-clock
                        // so the test proves it exercised the destroy-time flush path,
                        // not the normal debounce (per R3).
    });
    await server.ready;

    // Write into a document via DirectConnection — stays in the 60s debounce window
    const conn = await server.hocuspocus.openDirectConnection('test-doc');
    await conn.transact((doc) => {
      const ytext = doc.getText('content');
      ytext.insert(0, 'hello world');
    });

    // Immediately destroy — BEFORE the debounce fires on its own.
    // The bug would leave the file missing on disk; the fix drains it synchronously.
    await server.destroy();

    const onDisk = await readFile(join(tmpDir, 'test-doc.md'), 'utf-8');
    expect(onDisk).toContain('hello world');

    // D14: behavioral contract — destroy() emitted the structured shutdown log
    // with flushedCount >= 1 and zero phase errors
    const shutdownLogs = logSpy.infoCalls.filter((c) => c.msg.includes('shutdown flushed'));
    expect(shutdownLogs).toHaveLength(1);
    expect(shutdownLogs[0].payload.flushedCount).toBeGreaterThanOrEqual(1);
    // No warn-level log means zero phaseErrors
    const warnShutdownLogs = logSpy.warnCalls.filter((c) => c.msg.includes('shutdown'));
    expect(warnShutdownLogs).toHaveLength(0);
  });

  test('flushes L2 git commit after L1 drain', async () => {
    const server = createServer({ /* ... same setup ... */ });
    await server.ready;

    const conn = await server.hocuspocus.openDirectConnection('test-doc-2');
    await conn.transact((doc) => {
      doc.getText('content').insert(0, 'commit me');
    });

    await server.destroy();

    // Shadow git should have the commit (verify via simple-git log against .open-knowledge/.git)
    // Exact assertion TBD during implementation — see OQ-02.
  });

  test('destroy() completes within destroyTimeoutMs when onStoreDocument throws', async () => {
    // D11 revised: destroyTimeoutMs is a ServerOption. Set it to 500ms in tests
    // so this assertion runs in ~1s instead of ~11s (reclaims ~10s of CI wall-time).
    // Pathological case: inject a failing onStoreDocument hook (generic Error,
    // not SkipFurtherHooksError — the former triggers the "Document stays in
    // memory to avoid data loss" branch at Hocuspocus.ts:486-490 which is what
    // prevents afterUnloadDocument from firing and triggers our timeout path).
    const logSpy = spyOnLogger('server');
    const server = createServer({
      contentDir: tmpDir,
      projectDir: tmpDir,
      port: 0,
      quiet: true,
      destroyTimeoutMs: 500,  // D11: 500ms timeout, not 10s default
    });
    await server.ready;

    // Inject failing onStoreDocument hook post-construction (same idiom as §8.1)
    server.hocuspocus.configuration.extensions.push({
      async onStoreDocument() {
        throw new Error('simulated store failure — generic Error, not SkipFurtherHooksError');
      },
    });

    const conn = await server.hocuspocus.openDirectConnection('pathological-doc');
    await conn.transact((doc) => {
      doc.getText('content').insert(0, 'will not be flushed');
    });

    const startedAt = Date.now();
    await server.destroy();
    const elapsed = Date.now() - startedAt;

    // Should have hit the 500ms timeout + a small amount of overhead
    expect(elapsed).toBeGreaterThanOrEqual(500);
    expect(elapsed).toBeLessThan(2_000);

    // D14: destroy() still completes and emits the warn-level log with
    // the timeout phase error (log reports partial failure, not clean success)
    const warnLogs = logSpy.warnCalls.filter((c) => c.msg.includes('shutdown flushed'));
    expect(warnLogs).toHaveLength(1);
    expect(warnLogs[0].payload.phaseErrors).toContainEqual(
      expect.objectContaining({ phase: 'flush-all-stores' }),
    );
  });

  test('destroy() is idempotent / safe to call twice concurrently', async () => {
    // Per D9: concurrent callers await the same inflightDestroy promise.
    // No duplicate afterUnloadDocument push, no double destroyShadowRepo.
    const server = createServer({ /* ... */ });
    await server.ready;
    // Fire two destroys in parallel, assert neither throws and both resolve.
    await Promise.all([server.destroy(), server.destroy()]);
    // TBD — see D9.
  });

  test('destroy() during async init — before `ready` resolves', async () => {
    // Current code handles this via `await ready.catch(() => {})`.
    // Regression coverage only.
    const server = createServer({ /* ... */ });
    // Don't await ready; call destroy() immediately.
    await server.destroy();
    // Should resolve cleanly without throwing.
  });

  test('destroy() with zero documents loaded (short-circuit path)', async () => {
    // Exercises the `if (hocuspocus.documents.size === 0) return;` early-exit
    // in flushAllStoresAndWait(). No DirectConnections opened.
    const server = createServer({ /* ... */ });
    await server.ready;
    await server.destroy();
    // Should resolve in <100ms — no hook installed, no docs to drain.
  });

  test('destroy() flushes multiple documents before resolving (multi-doc drain)', async () => {
    // Closes an off-by-one regression path where the afterUnloadDocument hook
    // might resolve on the first unload instead of the last. All other tests
    // degenerate to 1 doc and would silently pass such a regression.
    const server = createServer({ /* ... */ });
    await server.ready;

    const conn1 = await server.hocuspocus.openDirectConnection('doc-a');
    const conn2 = await server.hocuspocus.openDirectConnection('doc-b');
    const conn3 = await server.hocuspocus.openDirectConnection('doc-c');

    await conn1.transact((doc) => doc.getText('content').insert(0, 'content A'));
    await conn2.transact((doc) => doc.getText('content').insert(0, 'content B'));
    await conn3.transact((doc) => doc.getText('content').insert(0, 'content C'));

    await server.destroy();

    expect(await readFile(join(tmpDir, 'doc-a.md'), 'utf-8')).toContain('content A');
    expect(await readFile(join(tmpDir, 'doc-b.md'), 'utf-8')).toContain('content B');
    expect(await readFile(join(tmpDir, 'doc-c.md'), 'utf-8')).toContain('content C');
  });
});
```

**Coverage:** Test 1 is the core bug assertion + D14 behavioral contract for the shutdown log. Tests 2–4 cover L2 ordering, timeout behavior (Test 3 uses `destroyTimeoutMs: 500` per D11), and idempotency. Tests 5–6 are lightweight regression coverage for edge cases the fix creates (async-init race, zero-doc short-circuit). Test 7 (added per design-challenge Medium finding 2) is the off-by-one guard on the `getDocumentsCount() === 0` invariant.

#### 8.3.1 Test helper — `spyOnLogger`

Tests 1 and 3 assert on log output. To avoid coupling to pino's internals, add a small test helper at the top of `standalone.test.ts`:

```typescript
import { getLogger } from './logger.ts'; // or wherever getLogger lives

interface LogCall {
  msg: string;
  payload: Record<string, unknown>;
}

function spyOnLogger(loggerName: string): {
  infoCalls: LogCall[];
  warnCalls: LogCall[];
  errorCalls: LogCall[];
  restore: () => void;
} {
  const logger = getLogger(loggerName);
  const infoCalls: LogCall[] = [];
  const warnCalls: LogCall[] = [];
  const errorCalls: LogCall[] = [];

  const origInfo = logger.info.bind(logger);
  const origWarn = logger.warn.bind(logger);
  const origError = logger.error.bind(logger);

  // Pino's signature is `.info(obj, msg?)` or `.info(msg)`.
  // Tests care about the structured payload + message string, so normalize.
  logger.info = ((payload: unknown, msg?: string) => {
    if (typeof payload === 'string') {
      infoCalls.push({ msg: payload, payload: {} });
    } else {
      infoCalls.push({ msg: msg ?? '', payload: (payload as Record<string, unknown>) ?? {} });
    }
  }) as typeof logger.info;

  logger.warn = ((payload: unknown, msg?: string) => {
    if (typeof payload === 'string') {
      warnCalls.push({ msg: payload, payload: {} });
    } else {
      warnCalls.push({ msg: msg ?? '', payload: (payload as Record<string, unknown>) ?? {} });
    }
  }) as typeof logger.warn;

  logger.error = ((payload: unknown, msg?: string) => {
    if (typeof payload === 'string') {
      errorCalls.push({ msg: payload, payload: {} });
    } else {
      errorCalls.push({ msg: msg ?? '', payload: (payload as Record<string, unknown>) ?? {} });
    }
  }) as typeof logger.error;

  return {
    infoCalls,
    warnCalls,
    errorCalls,
    restore: () => {
      logger.info = origInfo;
      logger.warn = origWarn;
      logger.error = origError;
    },
  };
}
```

**Teardown.** Call `logSpy.restore()` in `afterEach` to prevent spy leakage between tests. Alternative: re-create the `'server'` logger via a test-only factory if `logger.ts` exposes one — cleaner but requires a minor refactor to `logger.ts`. Implementer's call during the implementation PR.

**Alternative if this gets flaky.** pino supports a custom transport / destination via `pino({ stream: ... })`. If the monkey-patch approach causes issues (bun test runner hoisting, parallel test interference), replace `spyOnLogger` with a captured pino stream per test. Not expected to be needed.

### 8.4 No changes elsewhere

- `packages/cli/src/commands/start.ts` — already awaits `serverInstance.destroy()`. Fix is transparent.
- `packages/server/src/persistence.ts` — no changes. Still exports `flushPendingGitCommit` and `waitForPendingCommits` with same signatures.
- `packages/app/src/**` — no changes. `ProviderPool.flushAllProviders()` stays owned by the desktop spec (NG3).
- `.open-knowledge/` on-disk format — no changes.
- Hocuspocus config — no changes.

### 8.5 Rollout

- Ship as a standard PR to the server package.
- Land via a normal `@inkeep/open-knowledge` changeset (patch bump for the CLI, since the data-loss fix is user-visible).
- No migration needed (the fix is internal-only).
- No feature flag needed (the fix is the only way the code can work correctly).

## 9) Risks / unknowns

- **R1 — `afterUnloadDocument` hook doesn't fire for all edge cases.** If Hocuspocus's internal unload path has a branch that skips `afterUnloadDocument` (e.g., on an error path), `allDone` never resolves and we rely on the 10s timeout. Mitigation: the timeout is the backstop, and R2 confirmed the hook fires via `Hocuspocus.ts:554-591` `unloadDocument` path. Low likelihood.
- **R2 — `hocuspocus.closeConnections()` called before `flushPendingStores()`.** The order matches Hocuspocus's internal `Server.destroy()`. If `closeConnections()` has side effects that stall pending stores, we'd see it — but `Server.destroy()` uses this order and works. Low likelihood.
- **R3 — Test flakiness from tmp-dir race conditions or debouncer timing.** The regression test uses `debounce: 60_000` (not the 2000ms default) and immediate `destroy()` so natural debounce can't fire within test wall-clock — this proves we're actually exercising the destroy-time flush, not the normal debounce. Additionally, Test 3 (timeout path) uses `destroyTimeoutMs: 500` per D11, so the full test suite wall-time is well under 30s even with 7 cases. Remaining flakiness surface is only the `spyOnLogger` monkey-patch (§8.3.1); the alternative pino-custom-stream approach is a documented fallback if bun:test parallelism causes interference.
- **R4 — New integration test adds CI wall time.** Each test spins up a real Hocuspocus + file watcher + shadow repo. Could be 1-5s per test. 4 tests ≈ 20s worst case. Acceptable for a server-package test suite that currently runs in seconds.
- **R5 — `destroyShadowRepo()` assumes L2 is drained.** The shadow repo teardown at phase 5 assumes no more commits are pending. If `persistence.waitForPendingCommits()` returns before in-flight commits actually finalize (async boundary), the teardown could race. Mitigation: verify `waitForPendingCommits()` actually waits for commit-in-flight — already does per `persistence.ts:264-279`.
- **R6 — Idempotency of `destroy()` under concurrent calls.** If something calls `destroy()` twice (e.g., SIGINT handler fires + before-quit hook), the second call may try to push a duplicate `afterUnloadDocument` hook or call `destroyShadowRepo()` on a null ref. Mitigation: add an `isDestroying` guard flag. Covered by OQ-04.
- **R7 — Desktop spec depends on this shipping first.** If desktop implementation starts before this lands, it either blocks or implements the fix inline with a "port-when-spec-lands" comment. Coordination risk, not a technical risk.
- **R8 — destroy() during in-flight `handleDiskEvent` reconciliation (safety invariant).** If a watcher event fires at T=0 and reconciliation is async work in progress when `destroy()` lands at T=50ms, Phase 1 unsubscribes the watcher but **does not cancel** the in-flight `handleDiskEvent` invocations. The analysis (per audit-pass design-challenge investigation): reconcile's `applyToDoc` writes transact with `skipStoreHooks: true` (see `standalone.ts` disk event handling), so reconcile writes **do not re-arm the L1 debouncer** — Phase 3's `flushAllStoresAndWait` won't wait for them. They race against `unloadDocument` during Phase 3. If reconcile fires first, the Y.XmlFragment is modified just before unload — the modification is lost (reconcile was bringing content *from disk*, which is already the source of truth). If unload fires first, reconcile writes to a doc removed from `hocuspocus.documents` — benign, garbage-collected. **Net: no new data-loss risk.** destroy()'s contract is "preserve user data from the server's Y.Doc," not "preserve in-flight reconciliation from disk." This invariant is captured here so future refactors that change `skipStoreHooks` semantics get a tripwire.

## 10) Decision Log

| ID | Status | Type | Description | Resolution | Confidence | Reversibility |
|----|--------|------|-------------|------------|------------|---------------|
| D1 | LOCKED | Cross-cutting | Fix scope = server package only. `ProviderPool.flushAllProviders()` stays in the desktop spec (per NG3). | §8.4 no-changes list. | HIGH | Reversible — can move `flushAllProviders` here in a follow-up. |
| D2 | LOCKED | Technical | Use the public `afterUnloadDocument` extension hook, not internal access. | §8.1 helper uses `configuration.extensions.push`. | **HIGH — primary-source verified** | 1-way door for the fix strategy; reversing means vendoring. |
| D3 | LOCKED | Technical | Regression test is an integration test in `packages/server/src/standalone.test.ts`, using `bun:test` + real `createServer()` + tmp dir + `DirectConnection`. Not a unit test with mocks (would pass while bug persists). | §8.3 test file. | HIGH | Reversible — can add more test layers later. |
| D4 | LOCKED | Technical | 10-second timeout on `flushAllStoresAndWait()`. Trade perfect correctness under pathology for bounded shutdown latency. | §8.1 `Promise.race`. | HIGH | Reversible — timeout can be tuned. |
| D5 | LOCKED | Technical | Reordered destroy() phases: watchers → agent sessions → L1 → L2 → shadow repo release. | §8.2 code. | **HIGH — primary-source verified** | Reversible, but reverting re-introduces the bug. |
| D6 | LOCKED | Cross-cutting | Upstream PR to Hocuspocus for awaitable `flushPendingStores()` is Future Work (NG2). | NG2. | HIGH | Reversible — PR can be filed anytime. |
| D7 | LOCKED | Technical | No changes to `packages/cli/src/commands/start.ts`. The SIGINT handler already awaits `destroy()`; fix is transparent. | §8.4. | HIGH | Reversible. |
| D8 | LOCKED | Technical | No telemetry for historical blast radius (per D9 of desktop spec). We accept we won't know how often the bug fired in production. | NG4. | HIGH | 1-way door — we can't retroactively gather signal. |
| D9 | LOCKED | Technical | **Idempotency guard for `destroy()` uses a cached Promise pattern.** Add `let inflightDestroy: Promise<void> \| null = null;` at `createServer()` scope. On entry to `destroy()`: if `inflightDestroy` is non-null, `return inflightDestroy`. Otherwise, wrap the full teardown in `inflightDestroy = (async () => { ... })()` and return it. Concurrent callers await the same promise — no duplicate `afterUnloadDocument` push, no double `destroyShadowRepo()`. Resolves OQ-04. | §8.1 / §8.2 code updated at implementation. | HIGH — motivated by verified CLI SIGINT + SIGTERM dual-binding at `packages/cli/src/commands/start.ts:56-57` per A7 / [Evidence Finding 5](./evidence/destroy-investigation-findings.md). | Reversible — can simplify to a boolean flag if the Promise pattern proves unnecessary. |
| D10 | **REVISED TWICE 2026-04-11 → 2026-04-12 → LOCKED** | Technical | **Per-phase `try/catch` on Phases 1, 2, 3, 4 with log-and-continue; Phase 5 in outer `finally`.** Three rounds of refinement: (1) Original D10 wrapped only Phase 5. (2) `/gtm:analyze` + three parallel `/explore` subagents (2026-04-11) found Phases 3+4 have high-frequency real-world throw modes (git subprocess timeout, disk full, stale `.git` refs) and Phase 1 gates them — so expanded to Phases 1, 3, 4. Left Phase 2 unwrapped on the reasoning that `sessionManager.closeAll()`'s per-session `try/catch` at `agent-sessions.ts:168-177` was intrinsic protection. (3) Post-QA review during `/ship` (2026-04-12) correctly caught that the per-session `try/catch` handles session-level errors but `closeAll()` itself can still throw from method-level causes (iterator failures, future refactors) — so completing the best-effort-drain philosophy means wrapping Phase 2 too. Final shape: **all four drain phases wrapped with log-and-continue, Phase 5 in outer finally**. Resolves OQ-06 with fully refined scope. | §8.2 code updated — four explicit `try/catch` wrappers (Phases 1, 2, 3, 4) feeding `phaseErrors` array consumed by the D14 shutdown log. | **HIGH — evidence-grounded** via explore findings + post-QA review. | Reversible — small shape change; error semantics change from "throw on first failure" to "log-and-continue, report via summary." |
| D11 | **REVISED 2026-04-11 → LOCKED** | Technical + API | **10-second flush timeout is the default, but configurable via `ServerOptions.destroyTimeoutMs`.** Original D11 hardcoded 10s. Analysis pass found two reasons to expose it as a `ServerOption`: (1) **test ergonomics** — Test 3 (failing `onStoreDocument` → timeout path) currently waits 10s+ in CI; passing `destroyTimeoutMs: 500` reclaims ~10s of CI wall-time per run. (2) **Production safety valve** — a CLI user on slow NFS or remote disk could have legitimate L1 writes taking >10s, which the hardcoded ceiling silently truncates. Existing test harness at `test-harness.ts:67-74` already overrides `debounce: 200, maxDebounce: 1000` — `destroyTimeoutMs` fits the same pattern. `ServerOptions` is internal-only (`packages/cli/src/commands/start.ts` + test harness are the only callers, confirmed via grep) — adding a 16th → 17th field is zero public API risk. Resolves OQ-07 with expanded scope. | §8.0.1 adds the field; §8.1 receives it as a helper parameter; §8.3 Test 3 passes `500`. | **HIGH — evidence-grounded** via explore of existing ServerOptions timing-field conventions. | Reversible — removing the field later is a 1-line breaking change, but only affects 2 internal callers. |
| D12 | **REVISED 2026-04-11 → LOCKED** | Technical | **Regression test suite has 7 cases, with two implementation refinements per analysis pass:** (1) rapid write + destroy asserts file content **AND asserts shutdown log was emitted** (log becomes behavioral contract for the flush path, closes regression where a future refactor could make destroy() silently skip the drain logic while file content still reaches disk via natural debounce), (2) L2 git commit after L1 drain, (3) failing onStoreDocument timeout — **uses `destroyTimeoutMs: 500`** to assert timeout within ~1s instead of 10+ seconds, reclaiming CI wall-time per the D11 revision, (4) idempotency under concurrent destroy() calls, (5) destroy() during async-init (before `ready` resolves), (6) destroy() with zero documents loaded, (7) multi-document drain — open 3 `DirectConnection`s to different doc names, write to each, call destroy(), assert all three files exist on disk. Test 7 closes an off-by-one regression path on `getDocumentsCount() === 0`. Resolves OQ-08. | §8.3 test file — Test 1 gets stdout/pino-spy assertion for the shutdown log; Test 3 passes `destroyTimeoutMs: 500`. | **HIGH — evidence-grounded** refinements. Test 7 added per audit pass design-challenge Medium finding 2; log assertion + timeout override added per analysis pass cascade. | Reversible — test cases or assertion granularity can be tuned. |
| D13 | LOCKED | Technical | **Use the bare `Hocuspocus` class, not the `@hocuspocus/server` `Server` wrapper — OK can't reach `Server.destroy()` structurally.** `Server` owns its own `httpServer` (`Server.ts:57`), its own `crossws` WebSocket adapter with hardcoded `open`/`message`/`close`/`error` hooks (`Server.ts:58-83`), binds SIGINT/SIGQUIT/SIGTERM unconditionally unless `stopOnSignals: false` (`Server.ts:150-159`), and expects to own `listen()` via `this.httpServer.listen()` (`Server.ts:162`). OK's CLI (`packages/cli/src/commands/start.ts:77-99`) needs a **shared** HTTP server for `/api/*` + `sirv` static asset serving + `/collab`-only WebSocket upgrade (ignoring non-`/collab` upgrades so Vite HMR can coexist on the same port in dev), **its own** `WebSocketServer({ noServer: true })` instance, and **control** over signal handlers (owns SIGINT/SIGTERM + `process.exit(0)`). Migrating to `Server` would require either (a) forking `Server.ts` (violates G5 + NG1) or (b) a non-trivial refactor adopting Hocuspocus's `crossws`-based WebSocket path, which affects the Vite dev plugin and re-opens "who owns the HTTP server." **Rejected: switch to `Server.destroy()`. Chosen: write our own `destroy()` helper that mirrors `Server.destroy()`'s internal pattern using the same public `afterUnloadDocument` hook.** | §8.1 code comment cites `Server.ts:200-225` as the template. | **HIGH — primary-source verified** via direct read of `Server.ts` during audit pass. | 1-way door for this spec — would only change if OK's HTTP/WebSocket/signal architecture is restructured separately. |
| D15 | **LOCKED 2026-04-12** | Technical | **Rescue-buffer dump on flush timeout (OQ-P2-02 promoted from Future Work → In Scope).** When `flushAllStoresAndWait()` hits `destroyTimeoutMs`, each still-loaded document's in-memory Y.Doc is serialized via `serializeDoc()` and written to `<shadow-gitDir>/rescue/<docName>.md` via `safeRescuePath()` + `writeFileSync()` + `incrementRescueBuffer()` before the timeout error propagates to Phase 3's `phaseErrors`. Reuses helpers already in scope inside `createServer()` from the reconcile-path (`standalone.ts:323-335`) and branch-switch (`standalone.ts:677-692`) rescue sites — destroy-timeout becomes the third and final call-site, completing the "rescue on any pathological save" invariant. Best-effort per doc (per-doc try/catch, one failure doesn't block others). Unconditional write — no `isDirty` check like the reconcile path uses — because a store-hook hang means the in-memory state IS the data-of-record, not a diff vs. reconciled base. The timeout error message names `rescued [...]` and `lost [...]` doc lists so operators can correlate on-disk rescue files with the D14 warn-level shutdown log. Logs under `[rescue]` category (consistent with `api-extension.ts:757` rescue-API logs). Recovery UX surfaces via the existing `GET /api/rescue` + `GET /api/rescue/:docName` endpoints with 24h expiry — no new API work required. If `shadowRef.current` is nullish (init failed earlier), the rescue loop is skipped and all docs are reported as lost. Closes NG5 (formerly [NOT NOW]) and OQ-P2-02. | §8.1 helper updated with rescue loop inside the Promise.race timeout branch; §8.3 Test 3 adds shadow-handle construction + rescue file existence assertion + rescue-log emission assertion. | **HIGH — evidence-grounded** via the two existing rescue-write call sites sharing the same helpers, plus verified availability of `/api/rescue` endpoints in `api-extension.ts:710-811`. | Reversible — removing the rescue loop is a ~30-line revert; the infrastructure used (safeRescuePath, serializeDoc, incrementRescueBuffer, `/api/rescue` API, 24h expiry) stays in place for the other two call-sites and would not be affected. |
| D14 | LOCKED | Technical | **Structured shutdown log via `getLogger('server')` at the end of `destroy()`, always emitted (success or partial failure).** Uses the existing pino-based logger that's already a dep and actively used across the server package (`standalone.ts:432`, `persistence.ts`, `api-extension.ts`). Emits `info` on clean shutdown (`[server] shutdown flushed N documents in Mms`) and `warn` with a `phaseErrors` payload on partial failure. Original framing in OQ-P2-07 treated this as "only observability we'll ever have" given NG4 (zero telemetry), but analysis pass surfaced a stronger rationale: **`destroy()` is currently the only unlogged lifecycle path in the server package** — every other event (shadow repo init, watcher start, file events, document store) uses structured logging. Silent `destroy()` is an outlier, not a policy choice. Promoting to in-scope is parity with the rest of the package, not scope creep. Under D10's best-effort drain, the log is also **load-bearing** — it's the only signal that distinguishes "fully clean shutdown" from "partial shutdown with phase errors." Test 1 (D12) additionally asserts the log was emitted via stdout capture, making it a behavioral contract for the regression test. Resolves OQ-P2-07 (promoted from Future Work → In Scope). | §8.2 destroy() adds stopwatch + `phaseErrors` tracking + structured log at end; §8.3 Test 1 adds log-emission assertion. | **HIGH — evidence-grounded** via /explore finding that pino is already in use. | Reversible — removing the log is ~10 lines. |

## 11) Open questions (backlog)

### P0 — Must resolve

- **~~OQ-01~~** ✅ **RESOLVED 2026-04-11.** `DirectConnection.transact()` sets `origin = {source: "local"}` without `skipStoreHooks`, which causes `Hocuspocus.handleDocumentUpdate` → `shouldSkipStoreHooks(origin)` → `false` → `storeDocumentHooks()` fires and arms the L1 debouncer. Regression test plan is valid. [Evidence Finding 1](./evidence/destroy-investigation-findings.md).
- **~~OQ-02~~** ✅ **RESOLVED 2026-04-11.** Reuse the pattern at `shadow-repo.test.ts:132-134`: call the exported `shadowGit(shadow)` helper (from `packages/server/src/shadow-repo.ts:41-49`, re-exported via `@inkeep/open-knowledge-server`) to construct a `simpleGit` instance with the correct `baseDir` + `GIT_DIR` + `GIT_WORK_TREE` env, then `sg.raw('rev-parse', 'refs/wip/<branch>/<writer-id>')`. Test should use a project dir without an existing `.git/` so shadow layout is predictable. The test needs access to a `ShadowHandle`, which `ServerInstance` does not expose — construct it independently via `initShadowRepo(projectDir)` before `createServer()` and pass it via `ServerOptions.shadowRepo`. [Evidence Finding 2](./evidence/destroy-investigation-findings.md).
- **~~OQ-03~~** ✅ **RESOLVED 2026-04-11.** Push a failing extension via `server.hocuspocus.configuration.extensions.push({ async onStoreDocument() { throw new Error(...) } })` post-construction. Same pattern `standalone.ts:153` uses for the API extension. The failure must throw a generic `Error` (not `SkipFurtherHooksError`) so it hits the `Hocuspocus.ts:486-490` "Document stays in memory" branch, which is what prevents `afterUnloadDocument` from firing and triggers the 10s timeout. [Evidence Finding 3](./evidence/destroy-investigation-findings.md).
- **~~OQ-04~~** ✅ **RESOLVED 2026-04-11 → D9.** Cached-Promise idempotency guard. Concurrent callers await the same in-flight teardown. Motivated by verified CLI SIGINT + SIGTERM dual-binding at `packages/cli/src/commands/start.ts:56-57`. [Evidence Finding 5](./evidence/destroy-investigation-findings.md).
- **~~OQ-05~~** ✅ **RESOLVED 2026-04-11.** Phase 2 (`sessionManager.closeAll()`) correctly runs before Phase 3 (`flushAllStoresAndWait`). `DirectConnection.disconnect()` calls `storeDocumentHooks(doc, payload, immediately=true)` which runs with `debounce=0` → synchronous store + unload — so agent-held documents are drained in phase 2, leaving only human-connection documents for phase 3. No race. [Evidence Finding 4](./evidence/destroy-investigation-findings.md).
- **~~OQ-06~~** ✅ **RESOLVED 2026-04-11 → D10.** Phase 5 moves into `try/finally` so shadow repo release always runs. Prevents writer-lock leak if Phase 4 throws.
- **~~OQ-07~~** ✅ **RESOLVED 2026-04-11 → D11.** 10-second timeout confirmed. Legitimate stores are 100–500ms per doc; 10s is a pathology-only ceiling.

### Tests — additional coverage surfaced by probes

- **~~OQ-08~~** ✅ **RESOLVED 2026-04-11 → D12 (revised).** Final suite = **7 tests** with two implementation refinements from the analysis pass: (1) rapid write + destroy + file-content check **+ shutdown log assertion** (D14 behavioral contract), (2) L2 commit after L1 drain, (3) timeout on failing onStoreDocument — **uses `destroyTimeoutMs: 500`** (D11 revision) so the test asserts timeout within ~1s, (4) idempotency under concurrent destroy() calls, (5) destroy during async-init (before `ready` resolves), (6) destroy with zero documents loaded, (7) **multi-document drain** — 3 concurrent `DirectConnection`s to different doc names, writes to each, asserts all 3 files exist on disk post-destroy. Closes an off-by-one regression path where a future refactor could make the hook resolve on the first unload instead of the last.

### P2 — Future Work / Noted

- **OQ-P2-01** — Upstream PR to Hocuspocus making `flushPendingStores()` return a Promise. Maturity: **Identified**. Trigger: capacity for an upstream contribution with review cycle.
- **~~OQ-P2-02~~** ✅ **PROMOTED TO IN SCOPE 2026-04-12 → D15.** Rescue-buffer dump UX on flush timeout. Implemented inline in `flushAllStoresAndWait()` at §8.1 — when the timeout fires, each still-loaded doc's in-memory Y.Doc is written to `<shadow-gitDir>/rescue/<docName>.md` via the existing `safeRescuePath` + `serializeDoc` + `incrementRescueBuffer` helpers (already used by the reconcile and branch-switch paths). Best-effort per doc, logged under `[rescue]`, timeout error message names `rescued` vs. `lost` docs. Recoverable via existing `GET /api/rescue` + `GET /api/rescue/:docName` endpoints with 24h expiry. Test 3 asserts the rescue file exists on disk with expected content.
- **OQ-P2-03** — Parallelize L1 and L2 drains for faster shutdown latency. Current sequence is strictly serial for correctness. Revisit if measured shutdown latency becomes a user complaint.
- **OQ-P2-04** — Extend the integration test pattern to cover other `createServer()` lifecycle transitions (startup race conditions, watcher-to-destroy handoff, shutdown-during-reconciliation). Maturity: **Noted**.
- **OQ-P2-05** — Apply the same fix pattern to `packages/app/src/server/hocuspocus-plugin.ts` (Vite dev plugin). The dev plugin uses raw `new Hocuspocus(...)` (line 88) and doesn't call `createServer()`, so it doesn't inherit this fix. HMR-only shutdown, low stakes, but the same bug shape applies. Maturity: **Identified**. Trigger: dev-mode data-loss complaint or if the plugin surface grows. [Evidence Finding 6](./evidence/destroy-investigation-findings.md).
- **OQ-P2-06** — **Hocuspocus version-bump risk (strengthened per audit pass).** The helper's correctness depends on **seven** internal Hocuspocus behaviors that are NOT documented contracts:
  1. `flushPendingStores()` calls `debouncer.executeNow()` per non-loading debounced doc (`Hocuspocus.ts:165-177`)
  2. `debouncer.executeNow()` fires the pending `onStoreDocument` callback (internal)
  3. `onStoreDocument` success path fires `setTimeout(0) → shouldUnloadDocument → unloadDocument` (`Hocuspocus.ts:461-502`, internal)
  4. `unloadDocument` fires the `afterUnloadDocument` hook (`Hocuspocus.ts:581`, internal)
  5. Hook iteration follows `configuration.extensions` push order (`Hocuspocus.ts:515-540`, internal)
  6. `getDocumentsCount()` reflects post-`documents.delete` state (`Hocuspocus.ts:579-581`, internal)
  7. `configuration.extensions.push()` at runtime actually takes effect (relies on live array mutation by hook iteration, internal)
  
  R2's finding: "[Hocuspocus] do not document graceful shutdown semantics at all. Source code is the only authoritative reference."
  
  **Required actions on any `@hocuspocus/server` version bump:**
  - **Pin the version exactly** in `packages/server/package.json` (no caret, no range) until 4.0.0 GA is explicitly validated. (Verified 2026-04-11: currently pinned at exactly `"4.0.0-rc.1"` — no action needed at baseline.)
  - **Run the full regression test suite** (`bun test packages/server/src/standalone.test.ts`) — Test 1 catches most breakages, Test 3 catches timeout-path drift, Test 7 catches off-by-one regressions in the unload chain.
  - **Re-read `Hocuspocus.ts` lines 165-177, 263-311, 461-502, 515-540, 554-591** to verify the 7 behaviors above are structurally unchanged.
  - **Dependabot-style automation MUST NOT auto-merge** `@hocuspocus/server` updates — silent data-loss pathway.
  
  Maturity: **Identified**. Trigger: `@hocuspocus/server` version bump. (Note: subtle breakage where `getDocumentsCount()` lags behind `documents.delete` would pass Test 1 but fail Test 3's timing assertion — worth tightening Test 3's `expect(elapsed).toBeLessThan(12_000)` once we have baseline wall-clock measurements.)
- **~~OQ-P2-07~~** ✅ **PROMOTED TO IN SCOPE 2026-04-11 → D14.** Structured shutdown log via `getLogger('server')` emitted at the end of `destroy()` — originally Future Work (Noted) but analysis pass found that (a) pino is already a dep and actively used across the server package, so adding a log line is parity not scope creep; (b) under D10's best-effort drain it's the only signal distinguishing clean shutdown from partial failure. Implemented in §8.2 destroy(), asserted by Test 1 in §8.3.

### Tensions

- **T1 — Zero loss (G1) vs zero telemetry (NG4).** Without telemetry, we can't monitor the fix's effectiveness in production. We rely on the regression test and user reports. Accepted trade-off; D9 of the desktop spec binds us.
- **T2 — Bounded shutdown latency (G2) vs data preservation under pathology.** The `destroyTimeoutMs` ceiling trades perfect correctness for bounded latency. As of D15 (2026-04-12), the rescue-buffer UX (OQ-P2-02) closes the data-preservation gap: when the timeout fires, each still-loaded doc's in-memory Y.Doc is dumped to `<shadow-gitDir>/rescue/<docName>.md` before the error propagates, so edits are recoverable even when `onStoreDocument` itself is hung. The bounded-latency property is preserved — the rescue loop runs synchronously inside the timeout callback before `reject` and completes in tens of milliseconds per doc (markdown serialize + file write, no git involvement).
- **T3 — Comprehensive test coverage vs minimal CI wall-time.** Each integration test spins up a real server + watcher + shadow repo. Six tests (after OQ-08 promotion) is probably ~30s of CI time. Acceptable.
- **T4 — Test with real shadow repo vs test with mocked persistence.** The proposed test uses real components because a mock would pass while the bug persists. This is slower but correct.

## 12) Assumptions

| # | Assumption | Confidence | Verification plan | Expires |
|---|-----------|------------|-------------------|---------|
| A1 | `afterUnloadDocument` hook fires exactly once per document unload in Hocuspocus 4.0.0-rc.1 | **HIGH** — confirmed by R2 source reading of `Hocuspocus.ts:554-591` `unloadDocument` path | No further spike needed | — |
| A2 | `configuration.extensions.push()` after server startup successfully registers the new hook | **HIGH** — confirmed by R2: this is exactly what `Server.destroy()` does internally at `Server.ts:200-225` | No further spike needed | — |
| A3 | `hocuspocus.closeConnections()` + `flushPendingStores()` together cause all pending stores to resolve through the unload chain | **HIGH** — confirmed by R2: this is the complete chain `flushPendingStores → debouncer.executeNow → onStoreDocument → afterStoreDocument → setTimeout(0) → unloadDocument → afterUnloadDocument` | No further spike needed | — |
| A4 | `DirectConnection.transact()` triggers the `onStoreDocument` debounce just like WebSocket-backed connections | **HIGH — VERIFIED 2026-04-11** via source read of DirectConnection.ts → Document.ts → Hocuspocus.ts → types.ts. Local origin without `skipStoreHooks` flag flows through `shouldSkipStoreHooks → false → storeDocumentHooks()`. [Evidence Finding 1](./evidence/destroy-investigation-findings.md). | — (resolved) |
| A5 | Setting `debounce: 60_000` in the test prevents natural debounce from firing within test wall-clock | HIGH | The Bun test default timeout is 5s; 60s debounce is 12× longer | — |
| A6 | The `persistence.flushPendingGitCommit()` API works correctly when called AFTER L1 stores have populated the commit queue | **HIGH** — this is the API's documented purpose; bug was only the ordering | Trace via the new test | Step 5 |
| A7 | No existing test or runtime code relies on the current (buggy) ordering of destroy() phases | **HIGH — VERIFIED 2026-04-11** via grep. Only production caller is `packages/cli/src/commands/start.ts:37-57`. Vite dev plugin uses raw `new Hocuspocus()`, bypasses `createServer()` entirely. No tests exercise the full destroy() path. Side finding: CLI binds SIGINT + SIGTERM to the same shutdown closure → concurrent-call risk → idempotency is load-bearing (OQ-04 promoted from LOW to HIGH). [Evidence Finding 5](./evidence/destroy-investigation-findings.md). | — (resolved) |
| A8 | The 10-second timeout is longer than any legitimate `onStoreDocument` execution time in practice | HIGH | L1 is a debounced markdown serialize + file write; realistic upper bound is 100-500ms per doc × doc count | — |

## 13) Future work (Out of Scope)

- **OQ-P2-01** — Upstream PR to Hocuspocus (Identified)
- **~~OQ-P2-02~~** ✅ Rescue-buffer dump on flush timeout — **Done** (2026-04-12 → D15)
- **OQ-P2-03** — Parallelize L1/L2 drains (Noted)
- **OQ-P2-04** — Integration test expansion for other server-lifecycle transitions (Noted)
- **NG3** — `ProviderPool.flushAllProviders()` client-side drain barrier (owned by [desktop spec D19](../2026-04-11-electron-desktop-app/SPEC.md))

## 14) References

- [R2 research report](../../reports/hocuspocus-flush-and-reconnect-semantics/REPORT.md) — primary evidence trail, source-line citations for both bugs
- [Desktop spec §8.3.1 + D17 + R1-a](../2026-04-11-electron-desktop-app/SPEC.md) — where the bug was first surfaced and the fix sketched
- [Hocuspocus server hooks documentation](https://tiptap.dev/docs/hocuspocus/server/hooks) — public `afterUnloadDocument` hook API

## 15) Agent Constraints

### SCOPE (files the implementer touches)

- **`packages/server/src/standalone.ts`** — primary fix target:
  - `ServerOptions` interface: add `destroyTimeoutMs?: number` field (per §8.0.1 / D11).
  - `createServer()` destructure: add `destroyTimeoutMs = 10_000` (per §8.0.1 / D11).
  - Add `flushAllStoresAndWait(timeoutMs: number)` closed-over helper (per §8.1 / D2, D14).
  - Add `inflightDestroy: Promise<void> | null = null;` closed-over state (per §8.1 / D9).
  - Replace lines 399–424 `destroy()` implementation with the §8.2 version (D5, D9, D10-revised, D11-revised, D14, D13's rationale captured in comment).
  - Import `getLogger` from `./logger.ts` at top of file.
  - Add `const log = getLogger('server');` at the top of `createServer()` so the helper and destroy() share a single logger binding.
- **`packages/server/src/standalone.test.ts`** — NEW file (per §8.3 / D3):
  - 7 test cases per D12.
  - `spyOnLogger` test helper at top of file (per §8.3.1).
  - `beforeEach` creates tmp dir via `mkdtemp`; `afterEach` cleans up via `rm` + `logSpy.restore()`.
  - Tests use `@inkeep/open-knowledge-server` exports (via relative path since it's the same package) for `createServer`, `initShadowRepo`, `shadowGit`, and the `ShadowHandle` type.

### EXCLUDE (do NOT touch in this PR)

- **`packages/cli/src/commands/start.ts`** — SIGINT handler and `await destroy()` call site are correct as-is. Fix is transparent per D7. Do NOT modify.
- **`packages/server/src/persistence.ts`** — `flushPendingGitCommit`, `waitForPendingCommits`, `onStoreDocument` stay unchanged. Do NOT refactor.
- **`packages/server/src/agent-sessions.ts`** — `closeAll()` has intrinsic per-session protection. Do NOT modify this file. Note: per D10's 2026-04-12 revision, Phase 2 IS wrapped at the destroy() level for method-level throw coverage — this does NOT require touching `agent-sessions.ts` itself, only the destroy() call site in `standalone.ts`.
- **`packages/server/src/file-watcher.ts`** — watcher / head-watcher code unchanged. Do NOT touch the `AsyncSubscription` interface or `unsubscribe` implementation.
- **`packages/server/src/shadow-repo.ts`** — `destroyShadowRepo`, `shadowGit`, `initShadowRepo` stay unchanged. Do NOT modify.
- **`packages/app/src/editor/provider-pool.ts`** — client-side drain barrier is owned by the [electron-desktop-app spec §8.4.1 / D19](../2026-04-11-electron-desktop-app/SPEC.md). Do NOT add `flushAllProviders()` here.
- **`packages/app/src/server/hocuspocus-plugin.ts`** — Vite dev plugin uses raw `new Hocuspocus()` and doesn't go through `createServer()`. It has the same bug shape but is out of scope (OQ-P2-05 Future Work). Do NOT touch.
- **`@hocuspocus/server` package source** — no monkey-patching, no vendoring, no fork. Use public `afterUnloadDocument` extension hook only (D2).

### STOP_IF (conditions that require a pause and review)

- **STOP if `@hocuspocus/server` version in `packages/server/package.json` is not exactly `"4.0.0-rc.1"`.** The fix depends on 7 specific internal behaviors documented in OQ-P2-06. A version bump invalidates the primary-source-verified assumptions and requires re-running the `Hocuspocus.ts` source re-read before proceeding.
- **STOP if the existing `packages/server/src/standalone.ts` `destroy()` function's line numbers have drifted significantly from 399–424 and the code structure no longer matches §7's verbatim reproduction.** A concurrent PR may have landed (e.g., PR #36 OTel spec rebased onto main) that changes the shutdown sequence. Rebase, re-read the current destroy(), and update §7 before continuing.
- **STOP if Test 1's `spyOnLogger` monkey-patch approach is flaky in bun:test** (intermittent failures under parallelism). Switch to the documented pino-custom-stream fallback (§8.3.1). Do not silence the assertion or widen the expected log shape.
- **STOP if `flushAllStoresAndWait` starts erroring unexpectedly** during the first implementation pass. The `resolved` flag + `Promise.race` pattern is subtle — verify against `Server.destroy()` at `@hocuspocus/server/src/Server.ts:200-225` which is the template being mirrored. A new throw mode inside the helper is a sign the mirroring got out of sync.

### ASK_FIRST (actions requiring explicit user confirmation before execution)

- **ASK before upstreaming a PR to ueberdosis/hocuspocus** to make `flushPendingStores()` return a Promise. This is NG2 Future Work — if discovered during implementation, surface the idea but do not file upstream without a separate decision.
- **ASK before renaming / removing / restructuring `destroyShadowRepo`, `initShadowRepo`, or `shadowGit` from `shadow-repo.ts`**. Those are consumed by both this fix and PR #39 (Timeline with rollbacks). Cross-PR coordination required.
- **ASK before modifying `packages/server/src/logger.ts`** (the `getLogger` factory). The spy helper assumes the current signature. If `logger.ts` needs changes to support the spy cleanly, surface that as a separate consideration rather than changing it silently.
- **ASK before changing the log message strings** (`shutdown flushed ${N} documents in ${M}ms`). Test 1 asserts on `includes('shutdown flushed')` — changing the phrasing breaks the behavioral contract.
- **ASK before adding any new field to `ServerOptions` beyond `destroyTimeoutMs`**. Scope-creep guard.
