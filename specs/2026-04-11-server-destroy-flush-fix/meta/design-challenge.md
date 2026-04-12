# Design Challenge Findings

**Artifact:** `specs/2026-04-11-server-destroy-flush-fix/SPEC.md`
**Challenge date:** 2026-04-11
**Challenger context:** Cold reader; read spec, evidence, Hocuspocus v4.0.0-rc.1 source (`Server.ts`, `Hocuspocus.ts`), current `standalone.ts`, `persistence.ts`, `start.ts`, and related R2 report.

---

## 1. Is the root-cause framing right? Should OK switch to Hocuspocus's `Server` class?

**Question.** The spec frames the bug as "fire-and-forget `flushPendingStores()` + wrong L1/L2 ordering." A potentially simpler framing: the real bug is that OK uses the bare `Hocuspocus` class instead of `Server`, which already implements `destroy()` correctly. Did the spec consider just switching?

**What I found.** The spec and its evidence have the right framing, and switching to `Server` is *not* a viable alternative for structural reasons — though this is nowhere stated in the spec or Decision Log.

Reading `Server.ts` directly:

- `Server` constructs **its own** `httpServer` via `createServer(this.requestHandler)` (`Server.ts:57`).
- It installs its **own** `crossws` WebSocket adapter with hardcoded `open`/`message`/`close`/`error` hooks (`Server.ts:58-83`).
- `Server.listen()` calls `this.httpServer.listen(...)` itself (`Server.ts:162`) — it *owns* the HTTP server.
- `Server.listen()` also binds SIGINT/SIGQUIT/SIGTERM unconditionally (unless `stopOnSignals: false`, `Server.ts:150-159`).

But OK's CLI (`packages/cli/src/commands/start.ts:77-99`) needs:

- A **shared** HTTP server for `/api/*` routes (via `hocuspocus.hooks('onRequest', ...)`) + static asset serving (`sirv`) + WebSocket upgrade for `/collab` only.
- Its **own** `new WebSocketServer({ noServer: true })` instance, because it manually routes upgrade requests and wants to ignore non-`/collab` upgrades (Vite HMR could be on the same port in dev).
- **Control** over signal handlers — the CLI currently owns SIGINT/SIGTERM + calls `process.exit(0)` after destroy.

`Server` cannot do any of these things without code that the Hocuspocus package doesn't expose. Migrating would require either (a) forking `Server.ts` anyway (violates G5 and NG1), or (b) a non-trivial refactor that adopts Hocuspocus's `crossws`-based WebSocket path (which would change the wire-level behavior, affect the Vite dev plugin too, and re-open the "who owns the HTTP server" question).

So the answer — the spec's framing is correct — is right, but the justification isn't in the spec. The Decision Log should document this as D13: "Use bare `Hocuspocus` class + write our own `destroy()` helper. Rejected: switch to `Server.destroy()`. Rationale: `Server` owns its own `httpServer` + `crossws` adapter + signal binding, which conflicts with OK's shared HTTP server + `/api/*` + static assets + `/collab`-only upgrade handling in `start.ts`. The structural incompatibility is load-bearing."

Without that rationale documented, a future refactor that simplifies `start.ts` (e.g., to give the HTTP server over to Hocuspocus) could rediscover this question and re-litigate it.

**Verdict: Worth surfacing (Low).** The framing is right but the rejection of the "use `Server`" alternative is undocumented. This is a decision-log gap, not a design gap. Consider adding D13.

**Counter-proposal:** Add a one-line D13 to §10 documenting why `Server.destroy()` isn't reachable for OK today.

---

## 2. Is the proposed helper the right shape? Are simpler alternatives underexplored?

**Question.** `flushAllStoresAndWait()` uses a one-shot `afterUnloadDocument` extension hook. Alternatives:

- (A) Monkey-patch `hocuspocus.flushPendingStores` to return a Promise.
- (B) Track the Promise chain inside `persistence.ts` so persistence exposes a "drain" API.
- (C) Call `hocuspocus.unloadDocument()` directly per document.
- (D) Fork `@hocuspocus/server`.

**What I found.**

- **(A) Monkey-patch `flushPendingStores`.** In principle, you could reassign the method to capture the Promises from `debouncer.executeNow`. BUT: `debouncer` is a private field on `Hocuspocus`, and `flushPendingStores`'s internal logic (skip loading docs, skip already-unloading) needs to be duplicated. The fix would be more code than the helper, less readable, and would break on any upstream refactor. Not simpler.

- **(B) Drain API inside `persistence.ts`.** This is interesting but has a subtle problem: `persistence.ts` is one of possibly many extensions on `hocuspocus.configuration.extensions`. Its `onStoreDocument` runs inside `saveMutex.runExclusive`, but the `afterStoreDocument → setTimeout(0) → unloadDocument → afterUnloadDocument` chain is orchestrated by `Hocuspocus`, not by `persistence`. Even if persistence tracks which docs have been written to disk, it has no way to know whether `unloadDocument` has completed — the doc is still in `hocuspocus.documents` until then, and `getDocumentsCount()` is the actual drain signal. So (B) cannot replace the `afterUnloadDocument` hook; at best it could *augment* it, which adds complexity for no benefit. Not simpler.

- **(C) Call `hocuspocus.unloadDocument(doc)` directly.** Read `Hocuspocus.ts:545-591`: `shouldUnloadDocument(doc)` gates the call on `!debouncer.isDebounced() && !debouncer.isCurrentlyExecuting() && !saveMutex.isLocked() && connections === 0`. If you call `unloadDocument` when a store is still debounced, it returns early without unloading, and the debounced store still fires — but nothing now awaits its completion. This option **only works after** `flushPendingStores()` has already forced the debounced store to execute. So it's not an alternative; it's a step inside the same chain.

- **(D) Fork.** Explicitly rejected in NG1 with sound reasoning. Maintenance burden, divergence from upstream, and the public-API fix is cheap.

**However — there IS a credibly simpler alternative the spec and I independently arrive at: directly replicate `Server.destroy()` almost verbatim.**

Compare `Server.destroy()` (`Server.ts:200-225`):

```typescript
async destroy(): Promise<void> {
  await new Promise<void>((resolve) => {
    this.httpServer.close();
    try {
      this.configuration.extensions.push({
        async afterUnloadDocument({ instance }) {
          if (instance.getDocumentsCount() === 0) resolve();
        },
      });
      if (this.hocuspocus.getDocumentsCount() === 0) resolve();
      this.hocuspocus.closeConnections();
      this.hocuspocus.flushPendingStores();
    } catch (error) { console.error(error); }
  });
  await this.hocuspocus.hooks("onDestroy", { instance: this.hocuspocus });
}
```

vs. the spec's §8.1 `flushAllStoresAndWait()` — they're essentially the same pattern with two additions: (a) docNames early-return for empty case (minor), and (b) a 10s timeout (defensive).

**That's fine — but the spec doesn't explicitly cite `Server.destroy()` as the template it's following at the call site.** §8.1 says "mirrors the exact pattern" but only in a prose aside. A future reviewer reading `standalone.ts` will see novel-looking code. A code comment like `// This mirrors @hocuspocus/server's Server.destroy() at Server.ts:200-225` directly above `flushAllStoresAndWait()` would remove a common source of "why this shape?" questions and make upstream drift detectable in a single `grep`.

**One substantive question the spec does not address:** `Server.destroy()` does not have a timeout. OK's does. If the OK timeout fires, the `afterUnloadDocument` hook is **still installed on `hocuspocus.configuration.extensions`** — there's no cleanup path. On the next (idempotent-guarded) `destroy()` or any later unload, the orphaned hook still tries to call `resolve` on a Promise whose resolver captured variables are stale. This is a minor leak, not a correctness bug in practice (the hook is cheap and the server is about to exit), but it's a loose thread. Two fixes:

1. Remove the hook from `configuration.extensions` in the `finally` block of the `Promise.race`.
2. Use a `resolved` flag that the hook checks before calling `resolve`, so at least the hook is a no-op post-timeout.

**Verdict: Not a concern (Low).** The helper shape is right. The alternatives are worse or aren't actually alternatives.

**Counter-proposals:**

1. Add a source-pointer comment above `flushAllStoresAndWait()` noting it mirrors `Server.destroy()` — makes the upstream-drift dependency explicit and documents the design choice at the call site.
2. Consider `configuration.extensions.splice(-1, 1)` in a finally block so the orphaned hook is cleaned up when the timeout path fires. Tradeoff: more code to maintain vs. a marginal leak on a code path that only fires once per process lifetime.

---

## 3. Is the idempotency guard (D9) at the right layer? Should it live in the CLI instead?

**Question.** The spec justifies a promise-caching idempotency guard inside `createServer()` by citing the CLI's dual SIGINT+SIGTERM binding. But (a) does Node actually deliver both concurrently, (b) could the CLI's `shutdown` closure just guard re-entrance itself, and (c) is `createServer()` the right place for this?

**What I found.**

**(a) Do SIGINT + SIGTERM concurrently arrive in practice?** Yes, trivially. Three real paths:
- User presses Ctrl+C → SIGINT delivered. User, impatient that shutdown is slow (could be up to 10s in the worst case with the new helper!), presses Ctrl+C again. Node delivers a **second** SIGINT to the same handler, which calls `shutdown()` a second time. Not simultaneous — sequential event-loop ticks — but the first `destroy()` is still running because it's async.
- OS-level shutdown: macOS/Linux send SIGTERM first then SIGKILL after a grace period. If the user has `brew services stop`, systemd, or a process supervisor in the mix, SIGTERM can arrive while SIGINT was already in flight from a previous event.
- Programmatic double-call: future code (e.g., the Electron utility process in the desktop spec) might call `destroy()` directly from a message handler AND also have SIGTERM bound as a fallback. Both paths hit the same `destroy()`.

So the concern is real. Good. The spec's evidence (Finding 5) has this right.

**(b) Could the CLI guard re-entrance itself?** Yes — trivially, with one line:

```typescript
let shuttingDown = false;
const shutdown = async () => {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(dim('\nShutting down...'));
  await destroy();
  process.exit(0);
};
```

This guards against the CLI-specific concern without touching the server package.

**(c) Which layer should own the guard?**

The spec puts it in `createServer()`. This has a distinct advantage the spec doesn't articulate:

- **Future callers also need this guarantee.** The Electron utility process (per the desktop spec) will call `destroy()` from its own message handlers, and it may also need its own idempotency for different reasons (e.g., main process retries the shutdown IPC). If the guard is in `createServer()`, every caller is automatically protected. If the guard is in the CLI's `shutdown` closure, each new caller has to reimplement it.

- **The `destroyShadowRepo` double-call is a package-internal concern.** Whether `destroyShadowRepo(shadowRef.current)` is safe to call twice is not the CLI's business to know. Defense in depth belongs closer to the thing being defended.

- **Trade-off:** The spec's cached-Promise pattern is slightly more complex than a boolean flag. But it has a real advantage: **concurrent callers await the same teardown** instead of the second caller returning immediately while teardown is still in progress. A boolean flag at the CLI level would return immediately from the second call, then the `process.exit(0)` fires while the first `destroy()` is still running. The cached-Promise pattern naturally serializes this: both callers wait for the same finish.

**However:** the spec uses the cached-Promise pattern BUT the CLI still calls `process.exit(0)` unconditionally after `await destroy()`. If two SIGINT handlers both fire, both hit `await destroy()` (now awaiting the same promise), both fall through to `process.exit(0)`, and only the first one matters — which is fine, exits are idempotent. So the cached-Promise value is marginal over a boolean: the first caller's `process.exit` races ahead; the second caller's `process.exit` is a no-op. OK.

**The layering is defensible either way.** I lean slightly toward keeping the guard in `createServer()` (the spec's choice) because of the "future callers" argument and because it prevents `destroyShadowRepo` from being called twice regardless of the caller's discipline. The spec's reasoning covers the "why here" implicitly but not explicitly.

**Verdict: Not a concern.** The guard location is right. The cached-Promise vs boolean choice is close to a wash; the spec's preference is reasonable and reversible (noted in D9).

**Counter-proposal:** None. But consider adding to D9's rationale: "Guard lives in `createServer()` rather than the CLI shutdown closure so (1) future callers (Electron utility process, tests, dev scripts) inherit idempotency automatically, and (2) `destroyShadowRepo` is defended regardless of caller discipline."

---

## 4. Is the Phase 5 try/finally scope (D10) right? Should Phases 1–4 be individually fault-tolerant?

**Question.** Only Phase 5 is in `finally`. If Phase 1 (watcher unsubscribe) throws, Phases 2–4 are skipped but Phase 5 still runs. Is that right?

**What I found.** This is the most substantive finding in my challenge. **The current try/finally scope has a real gap the spec does not address.**

Consider the realistic failure modes:

**Phase 1 (watcher.unsubscribe) throws.**
- `@parcel/watcher` unsubscribe can throw if the native binding has been unloaded, or if there's an FS race. Unlikely but possible.
- **Consequence under D10:** Phases 2–4 never run. Agent sessions are not closed. L1 is never flushed. **Data is lost.** Then Phase 5 releases the shadow-repo lock. The CLI gets the thrown error, logs it, and exits — but the user has lost data in service of "cleanly releasing a lock."
- This is worse than the original bug! The original bug leaks pending writes; this new design, if Phase 1 throws, also leaks pending writes AND logs an error AND still presents a "clean" shadow-repo release.

**Phase 2 (sessionManager.closeAll) throws.**
- `closeAll()` iterates sessions and calls `close()` on each; if one agent's `DirectConnection.disconnect()` throws (e.g., network error posting an unload), the loop aborts.
- **Consequence:** Phases 3–4 skipped. Same data loss scenario.

**Phase 3 (flushAllStoresAndWait) throws.**
- The helper already swallows its own errors via `.catch(err => console.error(...))` at the `Promise.race` level. It should never throw at the `await` site. OK.
- BUT: if `hocuspocus.closeConnections()` (called inside the helper) throws for some reason, that throw escapes the `.catch`. Phase 4 skipped.

**Phase 4 (flushPendingGitCommit) throws.**
- Git I/O can fail. The commit is stranded in `.git/` objects but not pointed to by a ref. Shadow-repo lock is released in Phase 5. OK — any future `destroy()` or `commitToWipRef()` will reclaim the orphaned objects via GC.

**The right model depends on the goal.** There are two reasonable goals:

1. **"Best effort drain"** — run every phase you can, even if earlier phases failed, because each is independent and partial progress is better than none. This is what the spec **doesn't** do.
2. **"Fail fast and release locks"** — if an early phase fails, abort the rest and at least release system-level resources. This is what the spec **does** do.

The spec implicitly adopts goal (2) but doesn't state it. Goal (1) is arguably better for a graceful-shutdown path whose entire purpose is "preserve data on the way out."

**Proposal.** Put each phase in its own try/catch that logs and continues, with Phase 5 still in the outermost finally:

```typescript
try {
  try { if (headWatcher) { await headWatcher.unsubscribe(); headWatcher = null; } }
  catch (e) { console.error('[shutdown] headWatcher.unsubscribe failed:', e); }

  try { if (watcher) { await watcher.unsubscribe(); watcher = null; } }
  catch (e) { console.error('[shutdown] watcher.unsubscribe failed:', e); }

  try { await sessionManager.closeAll(); }
  catch (e) { console.error('[shutdown] sessionManager.closeAll failed:', e); }

  try { await flushAllStoresAndWait(); }
  catch (e) { console.error('[shutdown] flushAllStoresAndWait failed:', e); }

  try { await persistence.flushPendingGitCommit(); await persistence.waitForPendingCommits(); }
  catch (e) { console.error('[shutdown] flushPendingGitCommit failed:', e); }
} finally {
  if (shadowRef.current) destroyShadowRepo(shadowRef.current);
}
```

Trade-off: more verbose. But each phase is logically independent (they operate on different subsystems), and one phase's failure should not prevent the next phase's drain. For a graceful-shutdown path, "do as much as possible" is the right semantic.

**Verdict: Concern (Medium).** The current D10 design has a latent data-loss gap that only activates if Phase 1, 2, or 3 throws. The probability is low but the consequence is "lose data on shutdown" — the exact thing this spec is meant to prevent. The spec should either:

1. Adopt the per-phase try/catch above (recommended), OR
2. Explicitly document that "if Phase 1-3 throws, we drop data by design; the fix is the narrow case where Phase 4 throws" — and accept the trade-off on record.

**Counter-proposal:** Per-phase try/catch, spelled out in §8.2. Revise D10 to say "Each of Phases 1–4 runs in its own try/catch so one phase's failure does not prevent subsequent drains; Phase 5 still runs in an outer finally for lock release."

---

## 5. Is the 10-second timeout (D11) the right abstraction? Should it be a ServerOption?

**Question.** Should the timeout be configurable via `ServerOptions.destroyTimeoutMs`? CLI and Electron could set different values.

**What I found.**

**Argument for hardcoding (D11's current position):**
- Simpler. One knob less. Good default.
- CLI and desktop are the only two callers today; both have the same latency budget ("up to 10s is tolerable once per shutdown").
- "Legitimate stores are 100–500ms per doc" is accurate (verified by inspecting `persistence.onStoreDocument` — it's `writeFile` + `rename` + optional `git commit`, all cheap).
- A pathological timeout value (e.g., `destroyTimeoutMs: 100`) would be a foot-gun.

**Argument for making it a ServerOption:**
- **Tests need a different value.** Specifically, the test `'destroy() completes within 10s even if onStoreDocument throws'` asserts `elapsed < 12_000`, which adds 10+ seconds to CI. If the timeout were configurable, the test could set `destroyTimeoutMs: 500` and run in <1s.
- This isn't hypothetical — the spec flags R4 "4 tests ≈ 20s worst case" as a CI wall-time concern, and this test alone is half that budget.
- It also means Test 3 is flaky in cold-start CI environments: `elapsed` includes disk/FS warmup + extension-hook install + `closeConnections()` + `flushPendingStores()` + debouncer execution + mutex acquire + failed `writeFile` attempt. On a slow CI runner, 10s could be legitimate before the timeout even kicks in. The 2-second slack in the assertion (`< 12_000`) might not be enough.
- Electron desktop might want a **smaller** timeout to prioritize window-close responsiveness (e.g., 3s for project switch, 10s for app quit).

**Verdict: Concern (Low-Medium).** Hardcoding a test-unfriendly constant while simultaneously writing a test that exercises it is a design smell. The spec notes this tension (T3, "~30s of CI time") but D11 doesn't address it.

**Counter-proposal:** Add `destroyTimeoutMs?: number` to `ServerOptions` with a default of `10_000`. Plumbing: one extra destructured field in `createServer()`, one reference in `flushAllStoresAndWait()`. The test can then pass `destroyTimeoutMs: 500` and run in under a second. Zero downside for production (default unchanged); clear upside for test speed and future Electron tuning flexibility. This is the kind of knob that is much cheaper to add now (zero API churn) than later (new minor version).

If D11 stays hardcoded: at minimum, the regression test `'destroy() completes within 10s'` should be revised to assert something tighter than `< 12_000` or marked as potentially slow (`test.slow` in other runners — bun:test may not have an equivalent). And the regression test should be explicit about what it's actually measuring vs. what noise it tolerates.

---

## 6. Is the test coverage (D12 = 6 tests) enough?

**Question.** What about: destroy during an in-flight afterUnloadDocument fire; destroy with a corrupted shadow repo; destroy during reconciliation; property-based testing?

**What I found.**

**6(a) — destroy() while Phase 3's afterUnloadDocument hook is mid-fire.** This is actually not a race because `flushAllStoresAndWait` is awaited before Phase 4. However, **if two destroy() calls interleave** (and D9's cached-Promise guard protects against this), the concern collapses. The existing D9+D12 coverage is sufficient.

**6(b) — destroy() when the shadow repo is unhealthy (corrupted, missing HEAD).** This is a real gap. `destroyShadowRepo(shadowRef.current)` in Phase 5 assumes the handle is valid. If `initAsync` (`standalone.ts:438-456`) marked the shadow repo as corrupted and re-initialized, but a file-system race invalidated it again between init and destroy, `destroyShadowRepo` could throw. Current D10 doesn't handle this — Phase 5 is in `finally` but is *itself* uncaught, so a throw here escapes `destroy()`. The CLI's `shutdown` closure doesn't try/catch the `await destroy()` either, so the error propagates to the top-level process handler and prints to stderr. Not data loss — but messy.

Trivial fix: wrap `destroyShadowRepo` in try/catch inside the finally:

```typescript
} finally {
  if (shadowRef.current) {
    try { destroyShadowRepo(shadowRef.current); }
    catch (e) { console.error('[shutdown] destroyShadowRepo failed:', e); }
  }
}
```

This is a 3-line change and eliminates the last uncaught-throw path in `destroy()`. Probably worth doing, not worth a separate test.

**6(c) — destroy() during an in-flight 3-way reconcile.** This is the biggest gap in the test plan. `handleDiskEvent` (`standalone.ts:213-371`) does async reconcile work in response to watcher events. If a watcher event fires at T=0, reconcile starts, and destroy() lands at T=50ms, what happens?

Trace:
- Phase 1 unsubscribes the watcher. Ongoing `handleDiskEvent` invocations are **not** cancelled; they continue running in the background.
- Phase 2 closes agent sessions.
- Phase 3 flushes L1. Meanwhile, the background `handleDiskEvent` is still running. If it calls `applyToDoc(docName, newContent)` (lines 245, 258, 272, 594, 599), it **transacts on the Y.Doc with `skipStoreHooks: true`** (line 201) — so the `onStoreDocument` debouncer is NOT re-armed. Good.
- BUT: the `applyToDoc` transaction runs on a doc that Phase 3 is actively trying to unload. `unloadDocument` gates on `!saveMutex.isLocked() && connections === 0`. The `applyToDoc` transaction doesn't acquire `saveMutex`, so it races. If `unloadDocument` fires first, the in-flight reconcile writes to a doc that's been removed from `hocuspocus.documents` — benign, it's garbage-collected after the transaction completes. If reconcile fires first, it modifies the doc's Y.XmlFragment just before unload — benign, the unload happens anyway and the modification is lost (it's reconcile content *from disk*, which is the source of truth anyway).
- Phase 4 flushes L2 git commits. If reconcile's `setReconciledBase` call changed the commit staging state after `flushPendingGitCommit` ran, the stale content is stranded until next startup. Low-likelihood race.
- Phase 5 releases shadow lock.

**Net:** No new data loss risk. Some possible churn (reconcile writes that are discarded by unload), but the destroy() contract is "preserve user data from the server's Y.Doc," not "preserve in-flight reconciliation from disk." If the user's content is in the server's Y.Doc, it's flushed in Phase 3. If the reconciled content from disk was about to arrive, it's still on disk — not lost.

However, this analysis is load-bearing and not captured in the spec. The spec should at least note "destroy() during in-flight reconciliation is safe because reconcile writes use `skipStoreHooks: true` and don't re-arm the L1 debouncer; they race against unload but lose benignly."

**6(d) — Property-based test.** Not worth it here. The failure modes are discrete and well-understood; there's no continuous input space where property-based testing shines. Example-based is right.

**6(e) — One test the spec doesn't mention at all: happy-path destroy() with multiple documents.** Every proposed test uses exactly one doc. The core helper's correctness hinges on `getDocumentsCount() === 0` — meaning, specifically, **only the last unload resolves**. A test with 3 docs written in different orders that all need to drain would catch a regression where the resolve fires too early (e.g., after the first unload instead of the last). One extra test, ~15 lines.

**Verdict:**
- **6(a) Not a concern.** Covered by D9.
- **6(b) Concern (Low).** Add a 3-line try/catch around `destroyShadowRepo` in the finally block. No new test needed.
- **6(c) Worth surfacing (Low).** Not a data-loss risk but should be explicitly reasoned about in the spec as an invariant ("destroy() is safe during reconcile because..."). No new test needed, but write the reasoning into §8.2 or §9 (R8).
- **6(e) Concern (Medium).** Add a **7th test** for multi-document drain. The `getDocumentsCount() === 0` condition is the load-bearing invariant of the helper; all current tests degenerate to 1 document, which means any of them would pass even if the helper resolved on the first unload (a plausible off-by-one regression).

**Counter-proposal:** Add test 7: "flushes multiple documents before destroy() resolves" — open 3 `DirectConnection`s to different doc names, write to each, call destroy(), assert all three files exist on disk. Catches regressions where the resolve fires before all documents drain.

---

## 7. Scope boundary with the desktop spec — does the server-side fix alone prevent data loss?

**Question.** The spec scopes out `ProviderPool.flushAllProviders()` (NG3, D1) and puts it in the desktop spec. The desktop spec says the drain barrier is required *because* server-side flush can't catch client-buffered updates. **If this spec ships without a client-side counterpart, does the server-side fix actually prevent data loss in practice?**

**What I found.**

Reading desktop spec §8.4.1: "Server-side `flushAllStoresAndWait()` (§8.3.1) only persists what the server's Y.Doc *already has* — updates still buffered on the client (e.g., keystrokes from the last 16ms before the shutdown IPC arrived) would be lost without a client-side barrier."

This is correct. The server's Y.Doc has only the updates it has received over the websocket. If the client's `HocuspocusProvider` has a batched update in memory that hasn't been transmitted yet, `destroy()` has no way to know about it. It drains what it has, gets `getDocumentsCount() === 0`, and exits — leaving the client's in-memory buffer stranded.

**But now consider the CLI case (P1).** The CLI's data-loss path is:
- User is typing in the browser.
- User presses Ctrl+C in the terminal.
- CLI calls `destroy()`.
- Server drains what it has.
- The browser's `HocuspocusProvider` may still have queued updates from the last ~16ms (or more if the websocket was backlogged).
- Server exits before those updates arrive.
- User refreshes the page (new server), sees the missing characters.

**So the CLI has the same client-side loss window the desktop spec describes.** The server-side fix closes the 2–10 second L1 debounce window (the big win) but leaves open a 16–100ms client-buffering window.

**Is this a problem?**
- Quantitatively: 2–10 seconds → 16–100ms is a 20–600× reduction in loss window. This is a huge improvement and the spec is correct to ship it.
- Qualitatively: "we still might lose your last keystroke" is a much weaker failure than "we might lose your last sentence." Most CLI users will not notice.
- But the spec says "Zero data loss from `createServer().destroy()` in the happy path" (G1). That's literally not true for the CLI — it's "much-reduced, bounded data loss." The goal is overclaimed.

**There's a second subtlety:** For the CLI, the client is a **browser** that the user is not about to close. When the user presses Ctrl+C, the server exits, the browser's websocket dies, but the browser's `HocuspocusProvider` **retains its Y.Doc state**. If the user then refreshes, they lose their state (new server, new Y.Doc, fresh load from disk). But if the user instead does **nothing** — the browser still has the state, and when the server restarts (user runs `open-knowledge start` again), the provider reconnects and syncs the client's state back to the server. **So the CLI's client-buffering loss window is only realized if the user refreshes or closes the browser tab before the server comes back.** Which is exactly what most users do after Ctrl+C.

**For the desktop case:** The renderer is destroyed along with the utility process on project switch / app quit. The client's Y.Doc state is GONE unconditionally. So the client-side drain barrier (§8.4.1) is mandatory for desktop but merely defense-in-depth for CLI.

**The spec's scope split is defensible but overclaimed.**
- Putting `flushAllProviders` in the desktop spec is correct — it has no current consumer in the CLI path (the CLI's only "client" is the user's browser, which the CLI doesn't own). Moving the client-side barrier to this spec would cross package boundaries (NG3 reasoning is sound).
- BUT: the spec's G1 claim ("Zero data loss") is wrong. It should be "Zero data loss for writes that have reached the server." The client-side window is a separate, smaller problem that this spec leaves open by design.

**Verdict: Worth surfacing (Medium).** The scope boundary is defensible but G1 as written is too strong. Downgrading G1 to "Zero loss for server-side pending writes; client-side transmission loss is addressed separately in desktop spec §8.4.1 and is not in scope" would be more honest and prevents future confusion if someone reads this spec in isolation ("why didn't you fix the client buffer?").

**Counter-proposal:**
- Rewrite G1 to: "Zero data loss from `createServer().destroy()` for writes that have reached the server's Y.Doc. Client-side transmission buffers (e.g., the ~16ms between a keystroke and its websocket flush) are a separate, smaller concern addressed by the Electron desktop spec's client-side drain barrier (§8.4.1) and are out of scope for this fix."
- Add a note to §3 NG3 explicitly stating "This means CLI users retain a residual ~16ms client-buffering loss window. This is an order-of-magnitude smaller than the 2–10 second server-side bug and is acceptable per the cost/benefit ratio of cross-package scope."

---

## 8. "No telemetry, no observational data" tension — should there be a one-time log on successful drain?

**Question.** The spec accepts we'll never know how often the bug fired historically (NG4). But: should there be a one-time log ("flushed N documents during destroy, took M ms") so users have a signal their shutdown was clean?

**What I found.** This is a genuinely good suggestion that the spec doesn't explicitly consider.

Current CLI shutdown UX (from `start.ts:51-55`):

```
^C
Shutting down...
```

...and then silence. If `destroy()` takes 2–10 seconds (which it can, legitimately, with the fix), the user sees only "Shutting down..." with no further feedback. The spec flags this obliquely as OQ-P2-07 ("Progress logging during a potentially 2–10 second shutdown pause — CLI prints 'Shutting down...' but then silence. UX improvement. Maturity: Noted.") but doesn't propose anything concrete.

A one-line log at the end of `destroy()` — something like:

```
[shutdown] flushed 3 documents (l1: 240ms, l2: 120ms) — clean exit
```

— gives users a positive signal that their data was saved. It also makes the fix *self-observable*: if anyone ever hits the timeout path, the log makes it visible instead of silent. And if a future regression lands where `destroy()` returns without flushing (e.g., a phase-ordering mistake), a smoke test that grep's for this log becomes a lightweight regression check.

The cost is negligible: 3 lines in `destroy()` + a single stopwatch at the start. It doesn't require telemetry (doesn't phone home), it respects NG4 (no external data collection), and it's a pure UX improvement.

**The only reason to NOT do it:** it's outside the spec's minimal scope of "fix the data-loss bug." G4 says "Minimal blast radius." Adding a log line isn't really a blast-radius increase, but it is scope creep.

**Trade-off:** The spec's G4 value of "minimal blast radius" is legitimate, but a 3-line log statement at the end of the fix is arguably within blast radius, not outside it. Observability IS part of correctness for a fix that has no other way to be validated.

**Verdict: Worth surfacing (Medium).** Promote OQ-P2-07 from Noted to In Scope as a 3-line addition: a single stopwatch-bracketed log at the end of `destroy()`. This gives users a positive signal, makes the 10s timeout path visible if it ever fires, and is the only observability we'll ever have for this bug. The cost is tiny and the value is high given the "no telemetry" constraint.

**Counter-proposal:** At the end of `destroy()`:
```typescript
const t0 = Date.now();
// ... phases ...
console.log(`[shutdown] flushed ${flushedCount} documents in ${Date.now() - t0}ms`);
```
Update the regression test to not just check file content but also assert the log was emitted (via `bun:test` stdout capture). The log becomes a behavioral contract.

---

## 9. Is "ship before desktop" (R7) the right gating? Could desktop ship with its own inline fix?

**Question.** Could the desktop spec ship with its own inline fix (carbon copy of the helper) to remove the coupling?

**What I found.** Technically yes, but it's a bad idea for three reasons:

1. **This fix also matters for the CLI.** The CLI has been silently losing data "for months" (per the problem statement). Shipping the server fix unblocks the desktop spec AND fixes the CLI simultaneously. Inlining the fix into the desktop main process doesn't help CLI users. So the question isn't "can desktop ship without this spec?" but "should we do two fixes in parallel, duplicating the helper code, rather than fixing it once upstream?"

2. **The fix is inside `createServer().destroy()`.** The desktop spec's utility process calls `createServer().destroy()` — same call site as the CLI. The ONLY place to inline the fix is `packages/server/src/standalone.ts`. "Inline in the desktop spec" would mean the desktop spec imports from `packages/server`, calls `createServer()`, and then either (a) forks the server package, (b) monkey-patches the returned `destroy`, or (c) implements its own destroy that bypasses the server's. All three are worse than just fixing the bug in the server package.

3. **The coupling is intentional and correct.** Both specs touch the same code path. The desktop spec is the larger work; the destroy-flush fix is the smaller, more-orthogonal work. Splitting them is *good* spec hygiene (R7). But splitting doesn't eliminate the dependency; it just makes the dependency explicit and sequenceable. "Ship before desktop" is the dependency direction that makes physical sense.

**Verdict: Not a concern.** The gating is correct and R7 is an accurate characterization of a real dependency, not a blocker that could be side-stepped.

**Counter-proposal:** None. R7 is fine.

---

## 10. Is the fix load-bearing on Hocuspocus v4.0.0-rc.1 internal behavior? How would we know if GA breaks it?

**Question.** The spec cites `@hocuspocus/server@4.0.0-rc.1`. If the 4.0.0 GA release changes `afterUnloadDocument` semantics, does this fix break silently?

**What I found.** This is a real concern that OQ-P2-06 correctly flags but underweights. Let me trace the dependencies more precisely:

The helper's correctness depends on **all** of the following Hocuspocus internals continuing to behave as they do today:

1. `flushPendingStores()` calls `debouncer.executeNow(debounceId)` for each non-loading debounced doc (`Hocuspocus.ts:165-177`). ← public method.
2. `debouncer.executeNow()` fires the pending `onStoreDocument` callback. ← internal.
3. The `onStoreDocument` callback inside `storeDocumentHooks` runs the hooks chain inside `saveMutex.runExclusive`, and on success, fires `setTimeout(0) → shouldUnloadDocument → unloadDocument` (`Hocuspocus.ts:461-502`). ← internal.
4. `unloadDocument` fires `afterUnloadDocument` hook (`Hocuspocus.ts:581`). ← internal.
5. The hook is iterated through `configuration.extensions` in push order (`Hocuspocus.ts:515-540`). ← internal.
6. `getDocumentsCount()` returns the right value after `this.documents.delete(documentName)` (`Hocuspocus.ts:579-581`). ← internal.
7. `configuration.extensions.push(...)` at runtime actually takes effect — extensions are not snapshotted at construction. ← internal (relies on the array being live-mutated by the hook iteration).

All seven of these are internal implementation details, not documented contracts. **The Hocuspocus documentation (per R2's finding) "do not document graceful shutdown semantics at all. Source code is the only authoritative reference."**

This means every `@hocuspocus/server` version bump is a risk. The spec has OQ-P2-06 ("Maturity: Noted. Trigger: `@hocuspocus/server` version bump") but this is underweighting the risk:

- **A version bump must not auto-merge.** Dependabot-style automation for `@hocuspocus/server` would be a silent data-loss pathway.
- The regression test in D12 would catch a breakage IF it exercises the exact chain. Test 1 does — it asserts file content after destroy. Good.
- But: a subtle breakage where the hook fires BUT `getDocumentsCount()` lags (e.g., if upstream changed `documents.delete` ordering), Test 1 would pass (file written) but the 10s timeout would fire on an empty resolution. Only Test 3's timing assertion would catch it, and only if the test passed (which it would, since the file write happened).

**Proposed mitigations:**

1. **Pin the version.** `@hocuspocus/server: "4.0.0-rc.1"` should be an exact pin (not `^4.0.0-rc.1`) until GA is explicitly validated. Check `package.json` — if it's a caret or range, tighten it.
2. **Write an assertion test** that runs on every Hocuspocus version bump: verify `Server.destroy()` source exists and still pushes an `afterUnloadDocument` hook — a tiny integration smoke that the pattern we're mirroring hasn't moved upstream. Could be done via a snapshot-test of the import.
3. **Add a changelog entry in the spec's OQ-P2-06 resolution plan**: "When bumping `@hocuspocus/server`, run `bun test packages/server/src/standalone.test.ts` and manually re-verify `Hocuspocus.ts` lines 461-502 + 554-591 are structurally unchanged."

**Verdict: Worth surfacing (Low).** OQ-P2-06 is a real but acknowledged risk; the spec could strengthen it without significant effort. The key mitigation is making the version bump a conscious event (pinning + checklist) rather than an automatic one.

**Counter-proposal:**
- Verify `@hocuspocus/server` is pinned exactly in `packages/server/package.json`. If it isn't, pin it.
- Add to OQ-P2-06: "Before bumping `@hocuspocus/server`: (a) run regression test suite, (b) source-re-read `Hocuspocus.ts` `storeDocumentHooks`, `unloadDocument`, `hooks` to verify the fire chain and extension-push semantics are unchanged."

---

## Summary — Top 3 challenges to engage with before finalizing

### 1. [Medium] Per-phase fault tolerance in `destroy()` (§4 of this doc)

The current D10 design only wraps Phase 5 in `finally`. If Phase 1, 2, or 3 throws, Phases 2–5 are skipped, reintroducing data loss on the exact shutdown path this spec exists to protect. Proposal: wrap each of Phases 1–4 in its own try/catch, keep Phase 5 in the outer finally. Spelled out in §8.2. This is a small diff and a large correctness win.

### 2. [Medium] Multi-document regression test missing from D12 (§6 of this doc)

All six tests in D12 degenerate to one document. The helper's load-bearing invariant is `getDocumentsCount() === 0` — specifically the *last* unload resolves, not the first. A 7th test with 3 concurrent documents closes a plausible off-by-one regression path that the current tests would not catch. Cheap to add (~15 lines).

### 3. [Medium] G1's "zero data loss" claim is too strong without the client-side drain barrier (§7 of this doc)

The server-side fix closes the 2–10 second L1 window (the big win), but a residual client-buffering window (~16ms) remains for all CLI users, and by design stays owned by the desktop spec. G1 should be rewritten to scope "zero data loss" to "writes that have reached the server's Y.Doc." This is accurate framing, not a behavioral change — but leaving G1 as-is will cause confusion if someone reads this spec in isolation and asks "why didn't the fix catch keystrokes during the CLI shutdown?"

### Honorable mention — [Low] Observability-on-success log line (§8 of this doc)

A single 3-line log at the end of `destroy()` — "flushed N documents in Mms" — is the only observability we'll ever have for this bug (per NG4). It's within the spec's blast-radius budget, gives users positive feedback during a 2–10 second shutdown, and surfaces the 10s timeout path when it ever fires. Recommended as an in-scope addition, not a Future Work item.

---

## Confirmed Design Choices (summary)

Holding up under challenge:

- **DC1 (Simpler alternative) — `flushAllStoresAndWait()` helper shape.** Alternatives (monkey-patch, persistence drain API, direct `unloadDocument` calls, fork) are all worse or aren't actually alternatives. The helper directly mirrors `Server.destroy()`, which is the correct upstream template. Only nit: cite the template in a code comment.
- **DC1 — Use bare `Hocuspocus` not `Server`.** Structural incompatibility with OK's shared HTTP server + `/api/*` + static assets + `/collab`-only upgrade handling. Correct but undocumented; should be D13.
- **DC2 (Stakeholder gap) — Idempotency guard location (D9).** `createServer()` is the right layer for defense-in-depth; future callers inherit it. CLI-level guard alone is insufficient.
- **DC2 — Phase ordering (D5).** Watchers first, then agent sessions, L1, L2, shadow release. Rigorously justified in Evidence Finding 4 and §8.2 table.
- **DC2 — Test using `DirectConnection.transact` (D3).** Correctly proven in Evidence Finding 1 via source trace through `shouldSkipStoreHooks`. Test plan is sound.
- **DC3 (Framing validity) — SCR.** The Complication (silent data loss + imminent desktop app) and Resolution (helper + test) are tightly coupled. Both dimensions are load-bearing; neither is manufactured.
- **DC3 — Out-of-scope list (NG1–NG8).** Defensible. NG1 (fork) and NG3 (client-side flush) are particularly well-justified. Only NG4 (telemetry) is worth softening via the one-time log in Challenge 8.
