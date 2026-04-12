# Server-bridge hardening (Now phase) — Spec

**Status:** Approved (ready for implementation)
**Owner(s):** engineering (TBD at implementation time)
**Last updated:** 2026-04-11 (post-audit finalization + post-migration drift audit)
**Baseline commit:** 48d8f04 (rebased from original 2d35736; drift audited against PR #56 + PR #57 on 2026-04-11)
**Links:**
- Project: [projects/server-bridge-hardening/PROJECT.md](../../projects/server-bridge-hardening/PROJECT.md)
- Upstream spec: [specs/2026-04-10-test-isolation-parallelism/SPEC.md](../2026-04-10-test-isolation-parallelism/SPEC.md)
- Evidence: [evidence/](./evidence/)

---

## 1) Problem statement

**Situation.** PR #38 (`test-isolation-parallelism`) shipped 2026-04-11 and surfaced ~20 deferred items through its review loop. The 2026-04-11 audit against `3a5ee59` (origin/main) confirmed 16 items still fully valid on a clean tree, including one **Major-severity finding** (server silent-degradation-on-init-failure) that has been sitting in the backlog since Andrew/Miles's PR #13. During spec intake, two separate investigations reshaped the scope:

1. **Dual-copy discovery (`external-change.ts` + `standalone.ts applyToDoc`).** The extraction that `external-change.ts` was supposed to complete is half-done. `standalone.ts` still has its own inline `applyToDoc` copy (lines 177-205). The two have drifted (try/catch, log line). Bridge-matrix tests exercise the CLI copy, not `external-change.ts`. See `evidence/external-change-dual-copy.md`.

2. **PR #39 conflict surface analysis.** The PROJECT.md PQ3 premise ("Heavy conflict-avoidance weight for Miles's PR #39") was empirically wrong. Miles's actual change to `standalone.ts` is **+1 line at line 138**, far from where any of our edits would land. His `hocuspocus-plugin.ts` additions partially address S8. And his branch hasn't been rebased since PR #38, so he's already going to rebase regardless. See `evidence/pr39-conflict-surface-analysis.md`.

**Complication.** With the conflict-avoidance premise falsified and the dual-copy drift surfaced, the original "narrow wedge = S1 + S4 + S7" framing is strictly worse than the architecturally right path. The architecturally right path fits in the same wall-clock budget (~2.5-3 days) but adds:

- Unifying the drifted disk→CRDT bridge (fixes an active half-done refactor)
- Closing the only Major-severity finding in the entire backlog (S3 — server degraded signal)
- Simplifying S1's test surface (one handler to test instead of two drifted copies)

The cost side is near-zero: textual conflicts with PR #39 are effectively zero across all our edits, and Miles's rebase burden doesn't change whether we ship these or not. The user has explicitly authorized making that trade: *"I'm ok with making Miles rebase if we fix the correct bugs/issues and do what's architecturally right if it's evidence-based."*

**Resolution.** A single branch with **five atomic commits** (S7 → unify → S1 → S3 → S4, by increasing code risk) that ships the evidence-driven hardening increment:

1. **S7 — codify PR #38 lessons** in CLAUDE.md + observers JSDoc. Docs only.
2. **Unification (throwing-helper variant)** — extract `applyExternalChange(hocuspocus, docName, content): void` as a **throwing** export from `external-change.ts` (no try/catch wrapper). Wrap it inside the existing `createExternalChangeHandler` for the dev plugin's error-swallowing contract. Replace `standalone.ts applyToDoc` (lines 177-205) with a thin wrapper that calls `applyExternalChange` directly, **preserving the caller-side error propagation** that 6 call sites depend on to gate `setReconciledBase`. This is the variant B alternative from §9 — originally rejected as "more invasive, same end state" but corrected during spec audit: the end states DIFFER on the error path, and the direct-replacement approach would cause reconciliation-state corruption.
3. **S1 — test the unified handler** directly via a fake Hocuspocus fixture. Covers the 4 branches (document-missing early return, frontmatter asymmetry, Y.Text no-op, transaction origin). Tests target the throwing helper `applyExternalChange`, so both consumers (CLI + dev plugin) share the same oracle.
4. **S3 — expose `readonly degraded: readonly string[]`** from `ServerInstance`. Populated in `initAsync()` by push-on-catch in the **four** existing catch blocks (shadow repo init, shadow repo reinit, file watcher, HEAD watcher). Backwards compatible with existing `await srv.ready` consumers. The `readonly` modifier prevents consumer mutation of a 1-way-door public type.
5. **S4 — guard `provider-pool.ts setupObservers()` init-time throws** with try/catch + destroy-and-evict via the existing `destroyEntry` pattern.

### Budget decomposition

| Commit | Story | Estimate |
|---|---|---|
| 1 | S7 — docs + JSDoc sharpening | ~2 hours |
| 2 | Unify — extract throwing helper, wire two consumers | ~4 hours |
| 3 | S1 — direct unit tests for applyExternalChange | ~4 hours |
| 4 | S3 — readonly degraded signal + tests | ~4-6 hours (per evidence/s3-degraded-signal-design.md) |
| 5 | S4 — provider-pool init-throw guard + test | ~2-4 hours |
| — | Total | ~2.25-2.75 days of focused work |

Estimate excludes PR preparation, review response time, and unexpected rabbit holes. Budget target **~2.5-3 days** wall clock.

**Still deferred on their own merits** (not conflict-blocked): S5 (module-level state refactor — no forcing function), S6 (`createServer` god-function split — speculative), S8 (dev plugin reconciliation — partially addressed by Miles's PR). These stay in PROJECT.md Later with promotion triggers.

## 2) Goals

- **G1.** `external-change.ts` exports a throwing helper `applyExternalChange(hocuspocus, docName, content): void` that has direct unit tests locking the 4 internal branches. Because both the CLI and the dev plugin delegate to the same helper post-unification, a single test file covers both code paths.
- **G2.** `standalone.ts applyToDoc` no longer exists as an inline 29-line duplicate. It's replaced by a thin wrapper that calls `applyExternalChange` directly, preserving the throwing contract so caller-side try/catch at 6 reconciliation call sites still gates `setReconciledBase` correctly.
- **G3.** `ServerInstance` exposes `readonly degraded: readonly string[]`. After `await srv.ready`, consumers can read the list of subsystems (`'shadow-repo'`, `'file-watcher'`, `'head-watcher'`) that failed to initialize. Empty array means healthy boot. The `readonly` modifier prevents consumer mutation of the 1-way-door public type.
- **G4.** `provider-pool.ts setupObservers()` init-time throws are caught, the broken provider is destroyed and evicted, and a test exercises the recovery path.
- **G5.** `CLAUDE.md` documents the "multi-client coverage is required for observer bridge changes" and "Playwright runs on every PR" policies so the next contributor inherits the PR #38 lesson.
- **G6.** `observers.ts` and `observers.test.ts` JSDoc name the specific peer-WYSIWYG multi-client trigger observed during PR #43's matrix merge.
- **G7.** All five changes ship in a single PR with five atomic commits, reviewable independently but packaged as one hardening increment against `main`. Each commit passes `bun run check` on its own.

## 3) Non-goals

- **[NOT NOW] NG1:** Wiring `server.degraded` into CLI user-facing output (banner at `bun start` / `open-knowledge start`). **Revisit if:** a user report surfaces about silent degradation in production. The signal exists post-S3; the CLI-side consumer is a separate story.
- **[NOT NOW] NG2:** Refactoring `file-watcher.ts` / `persistence.ts` module-level mutable state to closure-scoped state. **Revisit if:** multi-instance server work lands on the roadmap. No forcing function today.
- **[NOT NOW] NG3:** Splitting `standalone.ts createServer()` into subsystem init helpers (`initShadowSubsystem`, `initWatcherSubsystem`, `initHeadWatcherSubsystem`). **Revisit if:** an independent reason surfaces to read the whole file. Speculative refactor; Miles's +1 line shows the file is still maintainable despite size.
- **[NOT NOW] NG4:** Wiring shadow repo + HEAD watcher + reconciliation into `hocuspocus-plugin.ts`. **Revisit after:** Miles's PR #39 merges — his changes partially address this surface. Re-audit what remains.
- **[NOT NOW] NG5:** Adding exhaustive encoding / concurrency / edge-case tests to `external-change.ts` beyond the 4 named branches. **Revisit if:** a concrete regression surfaces.
- **[NEVER] NG6:** Refactoring the `applyUserDelta` implementation itself. S7 is docstring-only. Any change to the function body opens the multi-client coverage question at a code-behavior level, which belongs in a separate spec.
- **[NEVER] NG7:** Adding new Playwright E2E tests to verify S1/S3/S4/S7. All five changes are unit + integration level concerns — Playwright is for DOM-binding and user interaction regressions, not bridge correctness.
- **[NOT NOW] NG8:** Adding a new `'error'` value to `ProviderPool.SyncState`. **Revisit if:** React consumers need to distinguish init-failure from disconnect. Current destroy-and-evict recovery already surfaces the failure via `onChange` (same pattern as LRU eviction).
- **[NEVER] NG9:** Rejecting `server.ready` on subsystem init failure. Changes existing contract; breaks `test-harness.ts` and any other consumer that assumes `ready` = "the server is usable." Degraded boot is a legitimate operational state, not a failure.

## 4) Personas / consumers

**P1 — The engineer implementing a future `external-change.ts` refactor.** Needs: direct tests that lock the 4 branches. Today they'd be editing a file with zero direct coverage. After S1 + unification, a branch edit that breaks the no-op check fails a fast unit test, and the CLI path is automatically tested because it uses the same handler.

**P2 — The operator running `open-knowledge start` in production (or the developer running `bun run dev`).** Needs: when `setupObservers` in the client fails, the editor shows a user-visible error instead of a silently-broken cached provider. AND: when a server subsystem fails to initialize (shadow repo corrupted, file watcher can't start, HEAD watcher unreachable), there's a programmatic signal to detect it. **After S3 + S4:** server exposes `degraded: string[]`, provider pool evicts broken entries.

**P3 — The next AI agent (or engineer) who modifies `observers.ts`.** Needs: explicit guidance that single-client test coverage is insufficient for observer bridge changes, and JSDoc that names the specific production trigger. **After S7:** the lesson is codified.

**P4 — Reviewers of the resulting PR.** Needs: atomic commits that can be reviewed independently. Ordered by increasing risk (docs → refactor → tests → new feature → fix) so that each commit's blast radius is clear from its position.

**P5 — Miles (upstream PR #39 author).** Needs: our edits don't create unnecessary rebase burden. Evidence (`evidence/pr39-conflict-surface-analysis.md`) shows zero textual conflict on our target file regions. Miles's rebase is already locked-in regardless.

## 5) User journeys

**Engineer modifying `external-change.ts` (post-unification).**
1. Edit `external-change.ts`.
2. Run `bun test packages/server/src/external-change.test.ts` — direct unit tests fail fast on branch regressions.
3. Run `bun run check` — bridge-matrix integration tests exercise the full chain because `standalone.ts` now delegates to the same handler.
4. Green → merge. No risk of the CLI path regressing independently.

**Engineer modifying `external-change.ts` (pre-unification, hypothetical fail path).** [Described for contrast — this path no longer exists after unification.]
1. Edit `external-change.ts`, not the `standalone.ts` copy.
2. Unit tests pass, integration tests pass (because they test the OTHER copy).
3. Dev mode silently regresses. Nobody notices until a user hits the bug.

**Operator encountering degraded boot.**
1. `open-knowledge start` runs.
2. Shadow repo dir is corrupted. `initShadowRepo` throws; caught at line 434.
3. **Before S3:** error logged to stderr, `server.ready` resolves, server runs without version history. No programmatic way to detect the degraded state.
4. **After S3:** error logged to stderr, `server.ready` resolves, `server.degraded === ['shadow-repo']`. A future CLI change (NG1) can warn the user. Tests can assert clean init.

**End user encountering `setupObservers` init failure.**
1. User opens a document via `openDocument(docName)`.
2. `HocuspocusProvider` connects and fires `synced`.
3. `setupObservers` throws (e.g., schema mismatch from persisted state).
4. **Before S4:** editor shows `syncState: 'synced'`, but WYSIWYG↔source sync is dead. Only page reload recovers.
5. **After S4:** caught, provider destroyed, entry evicted. React `onChange` fires. Editor shows disconnected state. Next `openDocument` creates a fresh provider.

**Next observer-touching agent session.**
1. Agent opens `observers.ts` to make a change.
2. **Before S7:** JSDoc mentions "other sources (agent, peer, file watcher)" abstractly. Writes single-client tests. Review flags insufficient coverage.
3. **After S7:** JSDoc names the peer-WYSIWYG trigger concretely, CLAUDE.md requires multi-client coverage. Writes correct tests up front.

### Interaction state matrix

| Surface | Loading | Empty | Error | Success | Partial |
|---|---|---|---|---|---|
| Unified `createExternalChangeHandler` invocation | N/A | Document not in `hocuspocus.documents` → early no-op return | Parse failure → outer try/catch logs, swallows. Same path for both CLI and dev plugin post-unification. | Transaction commits, XmlFragment + Y.Text + metadata updated | N/A |
| `ServerInstance.degraded` after `await server.ready` | Undefined (read before `ready` resolves) | `[]` (clean boot) | N/A — degraded is an observation, not a failure mode | `['shadow-repo']`, `['file-watcher']`, combinations | Possible mid-init read returns partial list — callers must await `ready` first |
| `provider-pool` entry after `setupObservers` throw | `connecting` (pre-synced) | Empty pool post-eviction | **Post-S4:** entry destroyed + removed; `onChange` fires; `getActive()` returns null | `observerCleanup` set; `syncState: 'synced'` | **Pre-S4:** `syncState: 'synced'` but `observerCleanup: null` — the silently-broken state |
| `observers.ts` divergence path | N/A | `oldXmlMd === newXmlMd` → early return | `diffLines` failure → propagates (unhandled — out of scope for S7) | Delta applied, divergent content preserved | Partial line match — documented as "user's change wins" |

## 6) Requirements

### Functional requirements

| Priority | Requirement | Acceptance criteria | Notes |
|---|---|---|---|
| **Must** | U.R1 — Extract `applyExternalChange` throwing helper from `external-change.ts` | `packages/server/src/external-change.ts` exports a new function `applyExternalChange(hocuspocus: Hocuspocus, docName: string, content: string): void` containing the current transact body with NO try/catch wrapper — errors throw to the caller. The existing `createExternalChangeHandler(hocuspocus)` factory wraps `applyExternalChange` in a try/catch preserving its current error-swallowing contract for the dev plugin consumer. `hocuspocus-plugin.ts:196` continues to use `createExternalChangeHandler` unchanged. `bun run check` passes. | This is the throwing-helper variant (originally rejected as variant B in §9, corrected during spec audit). |
| **Must** | U.R2 — `standalone.ts applyToDoc` is replaced with a throwing wrapper around `applyExternalChange` | `packages/server/src/standalone.ts:177-205` is deleted. Replacement at the same location: `const applyToDoc = (docName: string, content: string): void => applyExternalChange(hocuspocus, docName, content);` (or an equivalent minimal wrapper). The `void` return type is preserved — callers do not `await`. Error propagation is preserved — `applyExternalChange` throws, `applyToDoc` throws, caller-side try/catch at lines 245, 258, 271, 554, 594, 599 catches as today. `bun run check` passes. | Preserves the 6 caller-side try/catch gates on `setReconciledBase`. |
| **Must** | U.R3 — Behavioral equivalence verified (happy path AND error path) | Test before/after that `bridge-matrix.test.ts`, `conversion-fidelity.test.ts`, and `file-watcher.test.ts` pass without modification. Additionally, manually verify that when `applyToDoc` throws (e.g., inject a malformed-markdown disk event), the caller-side catch at each of the 6 sites prevents `setReconciledBase` from being called — i.e., `reconciledBase` retains its previous value. This is the test that would have caught the naive-unification reconciliation-state corruption. | Happy path via existing integration tests; error path via manual injection or a targeted new test during implementation. |
| **Must** | S1.R1 — Unit tests for `createExternalChangeHandler` cover the 4 internal branches | New file `packages/server/src/external-change.test.ts` with ≥ 4 test cases: (a) document-missing early return (no throw, no-op), (b) frontmatter asymmetry — XmlFragment gets parsed `body`, Y.Text gets full `content` including frontmatter, (c) Y.Text no-op when `currentText === content` (verify delete/insert NOT called), (d) transaction origin is `{ source: 'local', skipStoreHooks: true, context: { origin: 'file-watcher' } }`. All tests use a fake or real Hocuspocus fixture. Pass via `bun test packages/server/src/external-change.test.ts`. | Frontmatter asymmetry (b) is the hidden invariant locked by this test. |
| **Should** | S1.R2 — Additional test for the outer try/catch swallows errors | Test case: pass malformed markdown input. Handler logs via `console.error` (capture or spy) and returns without throwing. The document is unchanged. | Locks the swallow-on-error contract. |
| **Must** | S3.R1 — `ServerInstance` type gains `readonly degraded: readonly string[]` field | `packages/server/src/standalone.ts:82-88` adds `readonly degraded: readonly string[]` to the interface with a JSDoc comment explaining post-ready semantics. No changes to `ready: Promise<void>` signature. The `readonly` modifier prevents consumers from mutating the array (`.push()`, `.length = 0`) or reassigning the field. | Backwards compatible. `readonly` is compile-time protection for a 1-way-door public type. |
| **Must** | S3.R2 — `initAsync()` populates `degraded` on subsystem init failures | Four edits inside `initAsync`: push `'shadow-repo'` on the line 434 catch, `'shadow-repo'` on the line 450 catch (only if not already present), `'file-watcher'` on the line 462 catch, `'head-watcher'` on the line 680 catch. No behavioral change beyond the push — console.error and existing logic preserved. **Head-watcher catch only fires on real errors:** `startHeadWatcher` returns a no-op handle when `.git` is absent (verified at `head-watcher.ts:141-144`), so the catch is unreachable in standalone mode — no spurious push. | See `evidence/s3-degraded-signal-design.md` for line-level plan. |
| **Must** | S3.R3 — `createServer()` returns `degraded` from the factory | `packages/server/src/standalone.ts:685-687` extends the return object to include `degraded`. Internally the array is mutable (`const degraded: string[] = []`), but the `ServerInstance` public type widens it to `readonly string[]`. | Trivial. |
| **Must** | S3.R4 — Tests verify clean and failing boot paths | New or extended test in `packages/server/src/standalone.test.ts` (or co-located with an existing server test file) with ≥ 3 cases: (a) clean init → `srv.degraded` deep-equals `[]`, (b) forced shadow-repo failure → `srv.degraded.includes('shadow-repo')`, (c) forced file-watcher failure → `srv.degraded.includes('file-watcher')`. Force failures by passing invalid paths (non-existent, unwritable, or a file-path-as-dir). | If no server-side test file exists, create `standalone.test.ts`. |
| **Must** | S4.R1 — `setupObservers` init-time throws are caught, provider destroyed, entry evicted | `packages/app/src/editor/provider-pool.ts:97-116` (post-PR-56, was 92-111 at baseline 2d35736) wraps the `setupObservers` call in try/catch. On throw: call `this.destroyEntry(entry)` (which now automatically sets `entry.tearingDown = true` per PR #56, suppressing any late-firing status/synced/disconnect events on this entry via the new event-handler guards), remove from `this.entries` and `this.lruOrder`, reset `activeDocName` if active, call `this.notify()`, then re-throw with `[ProviderPool] setupObservers init failed for <docName>: <original>`. | Destroy-and-evict matches existing pool lifecycle. Clean integration with PR #56's `tearingDown` mechanism — the guard at the top of each event handler (`if (entry.tearingDown \|\| this.entries.get(docName) !== entry) return;`) means any spurious re-fires during/after teardown are harmless no-ops. |
| **Must** | S4.R2 — Test exercises the init-throw recovery path | `provider-pool.test.ts` adds a test case that stubs `setupObservers` to throw synchronously, triggers `onSynced` manually on a test entry, and asserts the entry is absent from `pool.entries`, `pool.getActive()` returns null, `onChange` was called. | Existing tests use `DUMMY_WS` so `onSynced` never fires; manual fire is required. |
| **Must** | S7.R1 — `observers.ts` `applyUserDelta` JSDoc names the peer-WYSIWYG trigger | Edit `observers.ts:170-183`. Replace "(agent, peer, file watcher)" parenthetical with a full paragraph naming: the remote peer's WYSIWYG edit as a Y.Text-only transaction during local user's mid-sync on XmlFragment, observed during PR #43's multi-client test matrix. Preserve existing "Strategy" section verbatim. | No behavioral change. |
| **Must** | S7.R2 — `observers.test.ts` divergence describe header names PR #43 lineage | Edit `observers.test.ts:1236-1260`. Add the "Assumption sharpening from PR #38" paragraph explaining tests were originally "simulated scenarios" and PR #43 proved they're a real multi-client production trigger. Preserve existing "Mechanism" paragraph. | No test body changes — comment only. |
| **Must** | S7.R3 — `CLAUDE.md` adds observer-coverage and Playwright policies | Add new subsection to existing "Testing — per-test docName isolation" section (or adjacent): "Observer bridge coverage" (multi-client requirement) + "Playwright policy" (runs on every PR). Total addition ≤ 20 lines. | Codification of 2 previously-unwritten lessons. |
| **Must** | All.R1 — PR packaged as one branch, five atomic commits | Git log shows 5 commits in order: `[docs] codify observer coverage + playwright policies (S7)`, `[refactor] unify standalone.ts applyToDoc with createExternalChangeHandler`, `[test] add direct tests for createExternalChangeHandler (S1)`, `[feat] expose server.degraded signal from initAsync (S3)`, `[fix] guard provider-pool setupObservers init-throws (S4)`. Each commit passes `bun run check` independently. | Order: docs first (lowest risk), then pure refactor (behavioral equivalence), then tests (additive), then new feature (S3), then fix (S4). |
| **Should** | All.R2 — PR body cross-references PROJECT.md, SPEC.md, and the reframe | PR description includes: link to PROJECT.md, link to SPEC.md, the PQ3 reframe rationale (PR #39 conflict surface analysis), which commit addresses which story, and the deferred scope (S5/S6/NG4). | Aids future archaeology. |

### Non-functional requirements

- **Performance.** Zero happy-path runtime impact. Unification: same instructions execute, different entry point. S3: one extra Array.push per subsystem catch (at boot, unmeasurable). S4: one try/catch entry (zero cost on happy path). S7: docs. Test suite wall clock: S1 ~1s, S3 ~2-4s (tmpdir setup), S4 < 500ms.
- **Reliability.** S3 closes the Major-severity finding. S4 closes the silent-broken-editor failure mode. Unification closes the drift that could cause dev/prod divergence.
- **Security/privacy.** No auth, schema, or permission surface touched.
- **Operability.** `server.degraded: string[]` is the new operability signal for server init. Format-standardized values (`'shadow-repo'`, `'file-watcher'`, `'head-watcher'`) so future consumers can branch on them reliably. S4's re-thrown error includes docName and original message.
- **Cost.** Zero infra cost. Developer time: ~2.5-3 days per revised PROJECT.md scope.

## 7) Success metrics & instrumentation

- **Metric 1 — Dual-copy drift eliminated.** `standalone.ts` no longer contains an inline `applyToDoc` copy. Verified by grep: `grep -n "function applyToDoc" packages/server/src/standalone.ts` returns nothing.
- **Metric 2 — Coverage of the 4 `external-change.ts` branches.** 0/4 direct → 4/4 direct.
- **Metric 3 — `server.degraded` signal presence.** `srv.degraded` is accessible and has type `string[]` in `ServerInstance`. Unit test asserts `[]` on clean init.
- **Metric 4 — `provider-pool.ts` recovery path test.** 0 tests exercise `onSynced` → 1 test exercises the init-throw recovery.
- **Metric 5 — CLAUDE.md + JSDoc contain PR #43 lineage.** Abstract framing → concrete trigger named + PR #43 referenced.

## 8) Current state (how it works today)

### Dual-copy: `external-change.ts` + `standalone.ts applyToDoc`

`external-change.ts` (69 lines) is a factory `createExternalChangeHandler(hocuspocus)`. Only called from `hocuspocus-plugin.ts:196` (Vite dev plugin).

`standalone.ts` (lines 177-205) has `applyToDoc` as a closure-scoped function inside `createServer()`. The logic is near-identical to `external-change.ts` but differs in:
- No outer try/catch (throws propagate to `handleDiskEvent`'s outer try/catch at line 214)
- No success log line
- `void` return instead of `Promise<void>`

Every bridge-matrix, conversion-fidelity, and file-watcher integration test exercises the `standalone.ts` copy via `createTestServer → createServer`. **Zero tests exercise `external-change.ts`.**

The extraction's stated purpose (per its own JSDoc) was to "prevent drift between copies" — but only one caller (the dev plugin) was updated. The drift the extraction was meant to prevent is already present.

### `ServerInstance` init error handling (silent degradation)

`standalone.ts:428-464` contains three try/catch blocks for subsystem init:
- Shadow repo init → catches, logs, leaves `shadowRef.current = undefined`
- Shadow repo integrity check → catches, attempts reinit, may set `shadowRef.current = undefined`
- File watcher startup → catches, logs, leaves `watcher = undefined`

And `standalone.ts:466-682` has a fourth try/catch for HEAD watcher, same pattern.

**In all four failure paths, `server.ready` still resolves successfully.** No signal to callers about which subsystems failed. Originally flagged as Major severity in PR #38's review loop.

### `provider-pool.ts setupObservers` call site

`packages/app/src/editor/provider-pool.ts:97-116` (baseline 48d8f04; was 92-111 at 2d35736, shifted +5 by PR #56). The `onSynced` event handler calls `setupObservers` synchronously. On throw, the error propagates into HocuspocusProvider's internal event emitter (silently swallowed or re-emitted as `'error'`). `entry.syncState` is already `'synced'`, `entry.hasSynced = true` (new in PR #56), `entry.observerCleanup` stays `null`, entry remains cached. Subsequent `open()` calls return the broken entry forever.

**PR #56 integration:** the file now has `hasSynced: boolean` and `tearingDown: boolean` fields on `PoolEntry`, and all event handlers (`onStatus`, `onSynced`, `onDisconnect`) have a guard at the top: `if (entry.tearingDown || this.entries.get(docName) !== entry) return;`. `destroyEntry()` at lines 209-220 (was 193-198) now sets `entry.tearingDown = true` as its first action and wraps `provider.destroy()` in try/catch with a `console.warn` fallback. These additions make S4's destroy+evict flow substantially cleaner than under the old baseline — after S4's catch calls `destroyEntry(entry)`, any late-firing event handlers are automatically suppressed. S4's explicit `entries.delete` / `lruOrder` cleanup remains necessary (destroyEntry alone doesn't remove from the pool's index; that's the `close()` path).

**Interaction with PR #56's `recycleDisconnectedEntry`:** if `onDisconnect` fires while `entry.hasSynced === true` and `provider.unsyncedChanges === 0`, PR #56's path recycles the entry. S4's init-throw catch path fires during `onSynced` BEFORE onDisconnect — so the two don't race in practice, and even if they did, both go through `destroyEntry → tearingDown=true` → the other path's guard no-ops. No conflict.

Test coverage: `provider-pool.test.ts` uses `DUMMY_WS` so `onSynced` never fires naturally — the setup path is dark at the unit level. PR #56 added 47 lines of new test cases to this file (primarily covering `recycleDisconnectedEntry` and reconnect semantics) plus a new integration test file at `packages/app/tests/integration/provider-pool-reconnect.test.ts`. S4's stubbed-setupObservers unit test must coexist with this new structure (add a new describe block, do not interfere with existing test state).

### `observers.ts applyUserDelta` JSDoc

Current (lines 169-183, where line 169 is the `/**` opener and 183 is `*/`): "race-condition path where another source (agent, peer, file watcher) wrote to Y.Text between Observer A syncs." Common-case example is single-client (user + agent). Peer case listed but not elaborated.

### `observers.test.ts` divergence describe (lines 1236-1260)

Docstring mentions "agent, file watcher, peer" as sources and frames tests as "simulated scenarios" using `agent-write` origin as a stand-in. No reference to PR #43.

### `CLAUDE.md` Testing section (lines 172-182)

Documents per-test docName isolation and `test.concurrent()` discipline. Does NOT contain observer-bridge coverage policy or Playwright policy.

### PR #39 conflict surface

Verified via `gh pr view 39 --json files` + `gh pr diff 39`:
- `standalone.ts`: +1 line at line 138 (inside `createApiExtension({...})` call object)
- `hocuspocus-plugin.ts`: +25 lines in the imports + shadow repo init area (pre-PR-38 version)
- Our edits land at lines 177-205 (unification) and 82-88, 426-687 (S3) — no textual overlap

### Known gaps/bugs discovered during spec intake

1. **`external-change.ts` + `standalone.ts applyToDoc` are drifted duplicates** — the extraction was never completed (evidence/external-change-dual-copy.md).
2. **`provider-pool.test.ts` does not exercise `onSynced`** — all tests use `DUMMY_WS` (evidence/provider-pool-setupobservers-path.md).
3. **Frontmatter asymmetry in the disk→CRDT bridge is an untested invariant** — a "cleanup" that makes Y.Text and XmlFragment symmetric would break source-mode frontmatter display.
4. **`server.ready` silently resolves on degraded init** — the original Major-severity finding (evidence/s3-degraded-signal-design.md).
5. **Head-watcher "attempted vs absent-by-design"** — unclear whether `startHeadWatcher` returns cleanly or throws when `.git` is missing. Resolve during S3 implementation.

## 9) Proposed solution (vertical slice)

### User experience / surfaces

- **Dashboard / admin UI:** N/A.
- **API endpoints:** N/A.
- **SDK:** `@inkeep/open-knowledge-server` exports an updated `ServerInstance` type with `degraded: string[]`. Backwards-compatible additive change.
- **CLI:** No user-facing change in this spec. Future NG1 follow-up may add a degraded-boot warning banner.
- **Docs / onboarding:** S7 adds ≤ 20 lines to `CLAUDE.md`. No docs-site change.
- **Error messages:** S4 re-throws with `[ProviderPool] setupObservers init failed for <docName>: <original>`. Format matches existing pool errors.
- **Billing / limits:** N/A.

#### Affected routes / pages

| Route / Page | Surface | What to verify |
|---|---|---|
| Any editor route (active document view) | React editor | **After S4:** `setupObservers` throws → editor shows disconnected state. Verified via unit test. |
| CLI `open-knowledge start` (and its derivatives) | Server init | **After S3:** `srv.degraded` is populated when subsystems fail. Verified via unit test. No user-visible CLI change until NG1. |

### System design

**Architecture overview.** Five independent patches. Four files modified (`standalone.ts`, `external-change.test.ts` [new], `provider-pool.ts`, `observers.ts`/`observers.test.ts`, `CLAUDE.md`), plus a new test file for S3 if none exists. No new dependencies, no new cross-package contracts beyond the `ServerInstance.degraded` additive field.

**Data model.** No Y.Doc schema changes. `SyncState` unchanged. `ServerInstance` gains `degraded: string[]` (additive).

**API / transport.** No changes to Hocuspocus protocol, HTTP API, or WebSocket contracts.

**Auth / permissions.** No auth surface touched.

**Enforcement points.**
- Unification: compile-time — the inline function is removed. Impossible to regress via drift.
- S1: test-level — regressions in the unified handler fail fast.
- S3: type-level — consumers get an expanded return type.
- S4: runtime — try/catch + destroy-evict pattern.
- S7: editorial — docs inform, no mechanical enforcement.

**Observability.** S3 adds `server.degraded: string[]` as the new structured health signal. No new metrics or logs beyond what already exists.

#### Data flow diagram

**Unification flow (happy path):**

```
CLI onDiskEvent event → handleDiskEvent(event)
  → event.kind switch → case 'update'/'create'/'rename':
  → applyToDoc(docName, content)     // unified entry point
  → createExternalChangeHandler's returned fn
  → stripFrontmatter → parse → updateYFragment → metaMap.set → ytext replace if diff
  → transact with { source: 'local', skipStoreHooks: true, context: { origin: 'file-watcher' } }
```

**S3 flow (degraded init):**

```
createServer(options)
  → const ready = initAsync()   // non-blocking
  → initAsync:
    → try initShadowRepo → SUCCESS: shadowRef.current = handle
                         → THROW:   degraded.push('shadow-repo'); log
    → try shadow integrity check → SUCCESS/THROW (see full logic)
    → try startWatcher     → SUCCESS: watcher = handle
                           → THROW:   degraded.push('file-watcher'); log
    → try startHeadWatcher → SUCCESS: headWatcher = handle
                           → THROW:   degraded.push('head-watcher'); log
    → resolve()
  → return { hocuspocus, sessionManager, destroy, ready, degraded }

Consumer:
  → await srv.ready
  → if (srv.degraded.length > 0) { /* warn */ }
```

**S4 flow (post-fix):**

```
pool.open(docName) → new HocuspocusProvider → provider.on('synced', onSynced)
  → onSynced fires
    → entry.syncState = 'synced'
    → try { setupObservers(...) }
      → SUCCESS: entry.observerCleanup = cleanup fn
      → THROW:
        → destroyEntry(entry)
        → entries.delete(docName)
        → lruOrder.filter out
        → if active, activeDocName = null
        → notify()
        → re-throw with [ProviderPool] prefix
```

- **Shadow paths to test:**
  - **nil / missing:** `hocuspocus.documents.get(docName)` undefined → early no-op (S1 branch 1). Clean init → `degraded: []` (S3 test a).
  - **empty:** empty markdown → stripFrontmatter returns empties → implicit coverage.
  - **wrong type:** malformed markdown → S1.R2 (outer try/catch swallows). Invalid tmpdir for server → S3 test (b/c/d).
  - **timeout:** N/A.
  - **conflict:** concurrent CRDT + external edit. Explicitly NG5.
  - **partial failure:** partial transact → Y.Doc transact atomicity handles. Partial init: S3 handles — each subsystem tracked independently.

#### Failure modes and handling

| Component | Failure | Detection | Recovery | User Impact |
|---|---|---|---|---|
| Unified `createExternalChangeHandler` | Malformed markdown parse throws | Outer try/catch (`external-change.ts:65`) | Log + swallow; document unchanged | None — silent drop (dev and CLI paths identical post-unification) |
| `standalone.ts` + shadow repo init | initShadowRepo throws | try/catch at line 434 | Push `'shadow-repo'` to `degraded`, log, continue boot | **After S3:** operator sees `srv.degraded` populated. **Before NG1:** no CLI surface yet |
| `standalone.ts` + file watcher init | startWatcher throws | try/catch at line 462 | Push `'file-watcher'` to `degraded`, log, continue boot | **After S3:** operator sees it. Disk bridge dead; CRDT still works |
| `standalone.ts` + HEAD watcher init | startHeadWatcher throws | try/catch at line 680 | Push `'head-watcher'` to `degraded`, log, continue boot | **After S3:** operator sees it. Branch-switch protection dead; rest works |
| `provider-pool` | `setupObservers` init throws (post-S4) | New try/catch in onSynced | destroyEntry + evict + re-throw | User sees disconnected state; next open creates fresh provider |
| `observers.ts` | `diffLines` throws during divergence | Unhandled | Propagates to Observer A's callback | Out of scope (NG6) |

### Alternatives considered

**Unification (the big one) — REVISED during spec audit:**
- **A) Replace `applyToDoc` with `createExternalChangeHandler(hocuspocus)` call (originally chosen, NOW REJECTED).** Collapses drift but silently swallows errors via `createExternalChangeHandler`'s inner try/catch. **Breaks caller-side error propagation at 6 reconciliation call sites in `standalone.ts`** (lines 245, 258, 271, 554, 594, 599), each of which depends on a synchronous throw from `applyToDoc` to skip the follow-up `setReconciledBase(...)` call. Post-A-unification, `setReconciledBase` would record content that was never applied to the Y.Doc, corrupting the reconciliation base and causing the next disk event to compute a three-way merge against a phantom base. Discovered during spec audit (audit-findings.md H1 + design-challenge.md Finding 1).
- **B) Extract throwing helper into `external-change.ts`, import directly in `standalone.ts` (NOW CHOSEN).** `applyExternalChange(hocuspocus, docName, content): void` is the raw transact body with no try/catch. `createExternalChangeHandler` wraps it for the dev plugin (preserving error-swallowing contract). `standalone.ts applyToDoc` becomes a thin wrapper that calls `applyExternalChange` directly, preserving throw semantics for caller-side try/catch. ~25-30 line net change (slightly more than A, but error semantics preserved exactly).
- **C) Reverse the extraction — delete `external-change.ts`, inline in both.** Cheapest but abandons the extraction intent. Doesn't serve PR #39 or future maintainability. Rejected.
- **D) Test both copies separately, don't unify.** Previous spec plan (pre-PQ3-reframe). Higher test surface, preserves drift. Rejected — PQ3 reframe removed the constraint that forced this option.

**S3 signal shape:**
- **A) `degraded: string[]` field on `ServerInstance` (chosen).** Additive, backwards compatible, simple.
- **B) Reject `ready` on any failure.** Breaks existing `test-harness.ts` usage. NG9.
- **C) `getHealth()` method.** Unnecessary abstraction for static post-init state.
- **D) Event emitter on degradation.** Overkill for a one-shot init signal.
- **E) `degraded: boolean` flag.** Loses granularity — consumers want to know which subsystem failed.

**S4 alternatives:** (unchanged from prior draft)
- **A) Destroy-and-evict via existing `destroyEntry` (chosen).** Matches pool lifecycle.
- **B) Add `'error'` to `SyncState`.** NG8 — invasive consumer changes for marginal benefit.
- **C) Catch + log + leave entry.** Defeats the fix.
- **D) Catch + retry.** Reconnect storm risk.

**S7 alternatives:** (unchanged)
- **A) Integrate into existing Testing section (chosen).**
- **B) New top-level CLAUDE.md section.** Bloats per-session agent context.
- **C) Put in AGENTS.md instead.** Testing philosophy belongs in CLAUDE.md.
- **D) New `TESTING.md` file.** Overkill.

## 10) Decision log

| ID | Decision | Type (P/T/X) | Resolution | 1-way door? | Rationale | Evidence / links | Implications |
|---|---|---|---|---|---|---|---|
| D1 | Package S1+S3+S4+S7+unification as one PR, five atomic commits | P | LOCKED | No | User's explicit ask for ONE spec → ONE PR. Commit order by increasing risk: docs → refactor → tests → feature → fix. Each commit independently passes `bun run check`. | User confirmation 2026-04-11 | All.R1 |
| D2 | Relax PQ3 heavy conflict-avoidance → evidence-based | P | LOCKED | No | PR #39 textual conflict surface is effectively zero (evidence). User explicit authorization to "make Miles rebase if architecturally right and evidence-based." | evidence/pr39-conflict-surface-analysis.md; user confirmation 2026-04-11 | Unlocks unification, S3, potentially S5/S6/S8 |
| D3 | Unify the drifted copies via **throwing-helper variant** (extract `applyExternalChange` from external-change.ts, standalone.ts imports it directly) | T | LOCKED | No | Closes dual-copy drift AND preserves caller-side error propagation at 6 reconciliation call sites. Spec audit found that the direct-factory-call variant would silently swallow errors that `setReconciledBase` depends on gating. Throwing helper = variant B, originally rejected in §9 as "same end state" — the rejection was wrong because the end states differ on the error path. | evidence/external-change-dual-copy.md; evidence/pr39-conflict-surface-analysis.md; audit-findings.md H1; design-challenge.md Finding 1 | Promotes the Unification story from deferred (was PROJECT.md NG1) to In Scope; redefines S1 to test the extracted throwing helper; replaces U.R1/U.R2/U.R3 with the throwing-helper shape |
| D4 | S1 tests the unified handler directly; drops dual-file test plan | T | LOCKED | No | Post-unification, one handler covers both CLI and dev paths. Direct unit tests are sufficient; integration coverage comes from existing bridge-matrix. | D3 cascade | Simplifies S1 from ~1.5 days → ~0.5 day |
| D5 | S3 exposes `readonly degraded: readonly string[]` on `ServerInstance` (additive, no `ready` contract break, `readonly` modifier) | T | LOCKED | Yes (public type) | Backwards compatible. NG9 forecloses the alternative. The `readonly` modifier was added during spec audit per design-challenge Finding 3 — prevents consumer mutation (`.push()`, `.length = 0`) at compile time, zero runtime cost. | evidence/s3-degraded-signal-design.md; design-challenge.md Finding 3 | S3.R1, S3.R3. `ServerInstance` type is a published export, so this IS a 1-way door — `readonly` is the correct strictness for the 1-way-door classification. |
| D6 | S3 degraded values are fixed strings: `'shadow-repo'`, `'file-watcher'`, `'head-watcher'` | T | DIRECTED | Yes (public contract) | Structured values let consumers branch reliably. Stable strings act as an enum without adding union type ceremony. | evidence/s3-degraded-signal-design.md | S3.R2, S3.R4. Values are load-bearing for future CLI/dashboard consumers. |
| D7 | S3 signal is read AFTER `await ready` — reading before returns partial (typically empty) list | T | DIRECTED | No | Mid-init reads aren't erroring, but they're incomplete. Documented in JSDoc. Type-level enforcement via `\| undefined` was considered in design-challenge Finding 6 and rejected as overkill — `readonly` + JSDoc is sufficient for a first-ship; tighten later if misuse observed. | evidence/s3-degraded-signal-design.md; design-challenge.md Finding 6 (dismissed) | S3.R1 JSDoc |
| D8 | `startHeadWatcher` returns a no-op handle on missing `.git` — head-watcher catch only fires on real errors | T | LOCKED | No | `packages/server/src/head-watcher.ts:141-144` has explicit `if (!resolvedGitDir)` guard returning `{ unsubscribe, getLastKnownBranch }` as no-ops. Catch at `standalone.ts:680` is unreachable in standalone/no-git mode — no spurious `'head-watcher'` push. Previously DEFERRED; audit-findings M3 + design-challenge Finding 2 resolved it from code during spec phase. | packages/server/src/head-watcher.ts:136-145; audit-findings.md M3; design-challenge.md Finding 2 | S3.R2, S3.R4. Removes prior S3.R5 head-watcher-wrinkle verification requirement. |
| D9 | S4 uses destroy-and-evict via existing `destroyEntry` | T | LOCKED | No | Matches `close()/dispose()/evictLru()` pattern. No new SyncState (NG8). | evidence/provider-pool-setupobservers-path.md | S4.R1, S4.R2 |
| D10 | S4 test stubs `setupObservers` to force throw, fires `onSynced` manually | T | DIRECTED | No | Existing tests use DUMMY_WS → no `onSynced`. Stub is cleanest. | evidence/provider-pool-setupobservers-path.md | S4.R2 |
| D11 | S4 re-throws with `[ProviderPool] setupObservers init failed for <docName>: <original>` | T | DIRECTED | No | Matches existing pool error format (line 147). | provider-pool.ts:147 | S4.R1 |
| D12 | S7 integrates into existing CLAUDE.md Testing section | T | LOCKED | No | Preserves CLAUDE.md structure. | evidence/observers-applyuserdelta-current-state.md §"CLAUDE.md existing..." | S7.R3 |
| D13 | S7 is docstring-only — no applyUserDelta behavior change (NG6) | P | LOCKED | No | Changing implementation opens multi-client coverage at a code level. | — | S7.R1, S7.R2 |
| D14 | S5 (module-level state), S6 (god-function split), S8 (dev reconciliation) still deferred | P | LOCKED | No | Not conflict-blocked anymore, but lack forcing functions. S8 partially handled by Miles's PR. | evidence/pr39-conflict-surface-analysis.md | NG2, NG3, NG4 |
| D15 | Commit order: S7 → unify → S1 → S3 → S4 | T | DIRECTED | No | Increasing risk: docs (no code) → pure refactor (behavioral equivalence) → tests (additive) → new feature (S3) → fix (S4). Each earlier commit lowers the risk of any breakage being attributable to the next. | — | All.R1 |

## 11) Open questions

| ID | Question | Type (P/T/X) | Priority | Blocking? | Plan to resolve / next action | Status |
|---|---|---|---|---|---|---|
| Q1 | Can `setupObservers()` actually throw synchronously on any realistic input? | T | P0 | No | Trace `observers.ts setupObservers` entry points during S4 implementation. If unreachable, document S4 as defensive code. | Open |
| Q2 | Should S7's `applyUserDelta` JSDoc include a pointer to the specific test cases in `observers.test.ts:1261+`? | P | P2 | No | Implementation-time judgment. Include if natural; skip if forced. | Parked |
| Q3 | Where does S3's server-side test file live — new `standalone.test.ts` or extend existing? | T | P0 | No | Check for existing standalone-oriented test files during implementation. Default to new `packages/server/src/standalone.test.ts`. | Open |
| Q4 | ~~Does `startHeadWatcher` throw on missing `.git` or return cleanly?~~ | T | — | — | **RESOLVED during spec audit:** `head-watcher.ts:141-144` returns a no-op `HeadWatcherHandle` on missing `.git` — does NOT throw. Catch in `initAsync` only fires on real errors. No guard needed in S3.R2. | Resolved (locked into D8) |
| Q5 | Does unification preserve caller-side error propagation at the 6 reconciliation call sites? | T | P0 | Yes (unification) | U.R3 acceptance criteria verifies this. Throwing-helper variant preserves throw semantics by design; U.R3 test injection confirms. | Open — resolved by U.R3 implementation |

## 12) Assumptions

| ID | Assumption | Confidence | Verification plan | Expiry | Status |
|---|---|---|---|---|---|
| A1 | Miles's PR #39 will eventually merge and may create follow-up reassessment | MEDIUM | Check `gh pr view 39` before next audit | Before next audit | Active |
| A2 | `setupObservers()` synchronous throws are possible in realistic failure modes | MEDIUM | Q1 — verify during S4 implementation | S4 implementation | Active |
| A3 | Frontmatter asymmetry (XmlFragment body vs Y.Text full content) is intentional and must be preserved | HIGH | Verified by code read — CodeMirror source mode shows raw file. S1.R1 test (b) locks this. | S1 implementation | Active |
| A4 | `provider.on('synced', onSynced)` fires once per connection lifecycle in common case | MEDIUM | Verify during S4 implementation by reading HocuspocusProvider source. **Post-PR-56 strengthening:** even if onSynced re-fires, the new `tearingDown` flag + entry-key identity check at the top of `onSynced` (lines 97-98) prevents re-entry into the setupObservers call site after S4's destroy+evict — so the fix is safe regardless of re-fire frequency. | S4 implementation | Active |
| A5 | `bun run check` passes on each of the 5 commits individually | HIGH | Verify locally per commit + CI will verify | At PR creation | Active |
| A6 | The extracted throwing helper `applyExternalChange` has body-level equivalence with `standalone.ts applyToDoc` (every line of the transact body matches) | HIGH | Verified by code read — diff table in evidence/external-change-dual-copy.md shows happy-path equivalence. Error path intentionally differs: helper throws, caller's try/catch catches. | Unification commit | Active |
| A7 | Miles's PR #39 will not add additional edits to `standalone.ts` inside the `createApiExtension` region (lines 143-153) before merging | MEDIUM | Check PR status mid-implementation. If Miles pushes new commits, re-verify conflict surface. Our edits are at 82-88, 177-205, 428-683 — no overlap with 143-153. | Before merge | Active |
| A8 | Section 1's reference to "four catches" matches S3.R2's line-level plan (shadow init, shadow reinit, file watcher, HEAD watcher) | HIGH | Verified by code read at standalone.ts:428-464, 466-682. Previously said "three" in an earlier draft — corrected per audit M4. | — | Active |
| A9 | Parallel spec `server-destroy-flush-fix` edits `standalone.ts` in regions disjoint from this spec's edits (its regions: 55-80 ServerOptions, ~106-175 helper/state addition, 399-424 destroy() rewrite, import block) | HIGH — verified 2026-04-11 via full read of Spec B §8.0-§8.3 + region-level collision check in cross-spec analysis | No further action — merge-time rebase handles line-shift fuzz | When Spec B merges (whichever order) | Active |
| A10 | Both specs can ship in either order; neither has functional dependency on the other | HIGH — verified via semantic dependency trace in cross-spec analysis (Spec A's tests never call destroy() except for teardown; Spec B's destroy() never reads `degraded`) | Re-verify if either spec drifts to add destroy()-related code (Spec A) or degraded-related code (Spec B) during implementation | Implementation complete | Active |

## 13) In Scope (implement now)

- **Goal:** Ship unification + S1 + S3 + S4 + S7 as one PR with five atomic commits.
- **Non-goals:** See §3. Notably: no CLI-side wiring of `degraded` signal (NG1), no module-level state refactor (NG2), no god-function split (NG3), no dev plugin reconciliation (NG4), no exhaustive encoding tests (NG5), no applyUserDelta behavior change (NG6), no new Playwright tests (NG7), no new `SyncState` value (NG8), no `ready` contract break (NG9).
- **Requirements with acceptance criteria:** See §6.
- **Proposed solution:** See §9.
- **Owner(s) / DRI:** TBD. One engineer should hold all five commits.
- **Next actions:**
  1. Create branch off `main` (e.g., `spec/server-bridge-hardening-now`).
  2. **Commit 1 (S7):** edit CLAUDE.md, observers.ts, observers.test.ts docstrings. `bun run check`.
  3. **Commit 2 (unify — throwing-helper variant):** (a) add `applyExternalChange(hocuspocus, docName, content): void` export to `packages/server/src/external-change.ts` with the current transact body and NO try/catch; (b) refactor `createExternalChangeHandler` to call it wrapped in the existing try/catch; (c) delete `standalone.ts:177-205` and replace with a thin wrapper `const applyToDoc = (docName: string, content: string): void => applyExternalChange(hocuspocus, docName, content);`; (d) verify U.R3 by running `bun run check` (existing integration tests MUST pass unchanged) and by manually injecting a malformed-markdown disk event to confirm caller-side catch prevents `setReconciledBase`. If integration tests fail, STOP — the copies weren't equivalent.
  4. **Commit 3 (S1):** add `packages/server/src/external-change.test.ts` testing `applyExternalChange` directly with 4+ branch cases + optional S1.R3 error-swallow test via the factory wrapper. `bun run check`.
  5. **Commit 4 (S3):** edit `ServerInstance` type to add `readonly degraded: readonly string[]` + `initAsync` four-catch pushes + factory return. Add test file `packages/server/src/standalone.test.ts` (resolve Q3 during this commit — default to new file). `bun run check`.
  6. **Commit 5 (S4):** edit `provider-pool.ts` try/catch + destroy-evict. Add `provider-pool.test.ts` case with stubbed setupObservers. `bun run check`.
  7. Open PR against `main`. Body cross-references PROJECT.md + SPEC.md + PQ3 reframe rationale + audit findings H1 resolution.
- **Risks + mitigations:** See §14.
- **What gets instrumented/measured:** The test suite + the new `server.degraded` field.

### Deployment / rollout considerations

| Concern | Approach | Verify |
|---|---|---|
| Unification breaks existing integration tests (copies weren't equivalent) | Run `bun run check` after commit 2 alone. Investigate any failure. | Local + cloud CI |
| S3's `degraded` field breaks type-level consumers | Additive only — existing consumers don't need to change. Verify via `bun tsc --noEmit`. | Local + cloud CI |
| S4 test is brittle (depends on module monkey-patch) | Use dependency injection if monkey-patching proves flaky during implementation. Decision at implementation. | Re-run test ≥ 3 times locally |
| Merge conflict with Miles's PR #39 at merge time | Zero textual overlap on our files (evidence verified). If Miles lands first, we `/resolve-conflicts`. | `gh pr diff` sanity check pre-push |
| CLAUDE.md bloat | ≤ 20 line addition to existing section | Line count diff at commit time |

## 14) Risks & mitigations

| Risk | Likelihood | Impact | Mitigation | Owner |
|---|---|---|---|---|
| Unification reveals the transact-body copies weren't actually behaviorally equivalent on the happy path | Low | Medium | U.R3 — existing integration tests pass unchanged. If they don't, investigate before proceeding. Evidence (diff table in external-change-dual-copy.md) shows happy-path equivalence. | Implementer |
| Unification breaks caller-side error propagation at one of the 6 `setReconciledBase` gates | **NEUTRALIZED by throwing-helper variant (D3)** | — | Variant A (direct factory call) would have caused this. Variant B (throwing helper) preserves throw semantics by design. U.R3 includes a manual injection test to verify. | — |
| ~~S3's head-watcher push spuriously fires on no-git setups~~ | — | — | **MOOT** — Q4 resolved during spec audit: `head-watcher.ts:141-144` returns a no-op handle on missing `.git`, never throws. The catch block is unreachable in standalone mode. No guard needed. | — |
| Miles pushes new commits to PR #39 mid-implementation, changing the conflict surface | Low | Low | A7 verification step before merge. `/resolve-conflicts` if needed. | Implementer |
| S4's stubbed `setupObservers` test is flaky in CI | Medium | Low | If the monkey-patch approach is flaky, refactor to dependency injection. Decision at implementation time. | Implementer |
| S1 test for frontmatter asymmetry (test b) accidentally asserts the WRONG thing (symmetric behavior) | Low | High | Review test assertions before commit. The test should verify `xmlFragment` contains `body` content but NOT frontmatter content, AND `ytext.toString()` contains BOTH. | Implementer + reviewer |
| The 5 commits hide a cross-concern bug that only surfaces when combined | Low | Medium | Run `bun run check` on the final tree after all 5 commits, not just each commit | Implementer |
| Parallel `server-destroy-flush-fix` spec lands first with its own `standalone.test.ts` creation, and this spec's S3 implementation tries to `git add` a pre-existing file | Medium | Low | Implementer checks for the file before creating; extends with a new `describe` block instead. A9/A10 document the coordination. §16 SCOPE note prescribes the extend-not-create path. Zero merge-conflict risk on `standalone.ts` itself (verified: disjoint line ranges throughout). | Implementer |
| Cross-spec implementer confusion about which `standalone.test.ts` describe block is authoritative or which spec's fixtures to use | Low | Low | Both specs' describe blocks are independent — one for `degraded`, one for `destroy()`. Shared `beforeEach`/`afterEach` for tmpdir lifecycle is a refactoring opportunity once both have landed, but not required at merge time. | Implementer |
| `server.degraded` type export causes a downstream breakage in unrelated packages | Low | Low | Additive change to an interface. Typecheck the whole monorepo before pushing. | Implementer |
| Docs-only S7 commit hits a Biome warning on CLAUDE.md | Very low | Very low | Biome doesn't lint markdown by default. `bun run lint` verifies. | — |

## 15) Future Work

### Explored

- **CLI wiring of `server.degraded` signal to user-visible warning** (NG1)
  - What we learned: S3 provides the signal; wiring it to CLI output is a one-liner in `packages/cli/src/commands/start.ts`:
    ```typescript
    await srv.ready;
    if (srv.degraded.length > 0) {
      console.warn(
        `[open-knowledge] Server started in DEGRADED mode. Failed: ${srv.degraded.join(', ')}`,
      );
    }
    ```
  - Recommended approach: Follow-up story that owns the CLI-side ergonomics (log format, exit codes, `--strict` flag?).
  - Why not in scope now: Scope containment. S3's value is in the signal; CLI consumer is a separate product decision.
  - Triggers to revisit: Anyone reports confusion about a degraded server running silently.

- **Module-level state refactor** (NG2 = S5 from PROJECT.md)
  - What we learned: `writeTracker`, `lastKnownHash`, `reconciledBaseByBranch`, `activeBranch`, `batchInProgress`, `consecutiveGitFailures` are module-scoped in `file-watcher.ts` and `persistence.ts`. Closure-scoping would require threading state through the `startWatcher` + `createPersistenceExtension` returns.
  - Recommended approach: Defer until multi-instance work is on the roadmap.
  - Why not in scope now: No forcing function. Clean in the abstract but speculative.
  - Triggers to revisit: Multi-instance server work, hot-reload dev experience, or a concrete bug caused by shared state.

- **`createServer()` god-function split** (NG3 = S6 from PROJECT.md)
  - What we learned: 688 lines is large but not concretely painful. Miles's +1 line proves maintainable despite size.
  - Recommended approach: Defer until someone has an independent reason to touch the file.
  - Why not in scope now: Speculative refactor, no forcing function.
  - Triggers to revisit: Reader-maintainer pain reports, or S5 promotion (the closures need owners).

- **Dev plugin reconciliation pipeline** (NG4 = S8 from PROJECT.md)
  - What we learned: **Miles's PR #39 partially addresses this** — his `hocuspocus-plugin.ts` changes add shadow repo init to the dev plugin. Need to re-audit after #39 merges to see what remains.
  - Recommended approach: Re-audit post-#39-merge, then decide.
  - Why not in scope now: Duplication risk with Miles's ongoing work.
  - Triggers to revisit: Miles's PR #39 merges.

### Identified

- **Exhaustive edge-case coverage for `external-change.ts`** (NG5)
  - What we know: Encoding (unicode, BOM, CRLF), concurrent CRDT + external edits, partial parse failures.
  - Why it matters: Deeper-tier failure modes the narrow wedge skips.
  - What investigation is needed: None — known additive to S1.

### Noted

- **Observer log noise gating** — `console.log('[Observer A]')` on every sync. Dev-mode noise.
- **Bubble-menu `markUserTyping`** — React button clicks don't call markUserTyping. Latent.
- **Multi-client `afterEach wait(300)`** — currently stable, latent flake.
- **Hocuspocus `disconnect()` TypeError** — upstream race, cosmetic.

## 16) Agent constraints

- **SCOPE:**
  - `packages/server/src/standalone.ts` — LINES 82-88 (ServerInstance type), 177-205 (delete `applyToDoc` inline body, replace with a thin wrapper that calls `applyExternalChange(hocuspocus, docName, content)`), 428-464 (add `degraded` pushes in shadow-repo-init, shadow-repo-reinit, and file-watcher catches), 680 (add `degraded` push in HEAD watcher catch), 685-687 (add `degraded` to return). DO NOT touch any other section of standalone.ts — particularly the `createApiExtension({...})` region at **lines 143-153**, where Miles's PR #39 adds a `flushGitCommit` property.
  - `packages/server/src/external-change.test.ts` (new file)
  - `packages/server/src/standalone.test.ts` — create the file if it doesn't exist; otherwise **extend it with a new `describe('createServer() degraded signal', ...)` block** without replacing existing content. A parallel spec [`specs/2026-04-11-server-destroy-flush-fix/SPEC.md`](../2026-04-11-server-destroy-flush-fix/SPEC.md) also creates this file with a `describe('createServer().destroy() — graceful shutdown flush', ...)` block (7 test cases for the graceful-shutdown flush bug). Whichever lands second extends instead of creates. No behavioral conflict; only a file-existence check at commit time. See §17 Evidence & References for the cross-spec analysis.
  - `packages/app/src/editor/provider-pool.ts` — **LINES 97-116 at baseline 48d8f04** (was 92-111 at 2d35736; shifted +5 after PR #56 added `hasSynced`/`tearingDown` fields and guards). Target: the `setupObservers({...})` call inside the `onSynced` event handler.
  - `packages/app/src/editor/provider-pool.test.ts` — new test case for S4.R2
  - `packages/app/src/editor/observers.ts` — LINES 170-183 (JSDoc only)
  - `packages/app/src/editor/observers.test.ts` — LINES 1236-1260 (describe header only)
  - `CLAUDE.md` — additions to or adjacent to "Testing — per-test docName isolation" section
- **EXCLUDE:**
  - `packages/server/src/standalone.ts` lines 143-153 — the `createApiExtension({...})` call region where Miles's PR #39 adds a `flushGitCommit` property. Do not touch even incidentally.
  - `packages/server/src/standalone.ts` — everything outside the line ranges listed in SCOPE. Particularly: do not split `createServer()` into helpers (NG3), do not touch `handleDiskEvent` dispatch logic, do not refactor the `onDiskEvent` or `serializeDoc` functions.
  - `packages/server/src/external-change.ts` — add a new export `applyExternalChange(hocuspocus: Hocuspocus, docName: string, content: string): void` containing the current transact body with NO try/catch wrapper. Refactor the existing `createExternalChangeHandler` factory to call `applyExternalChange` internally, preserving its error-swallowing contract for the dev plugin consumer. No changes to the exported factory's signature or behavior.
  - `packages/app/src/server/hocuspocus-plugin.ts` — Miles's PR #39 modifies this file.
  - `packages/server/src/api-extension.ts` — Miles's PR #39 modifies this file heavily.
  - `packages/server/src/file-watcher.ts` — NG2 deferred.
  - `packages/server/src/persistence.ts` — NG2 deferred.
  - Any behavioral change to `observers.ts applyUserDelta` or any other function body (JSDoc only — NG6).
  - `provider-pool.ts SyncState` union (do not add `'error'` — NG8).
  - Any CLI wiring of `server.degraded` (NG1).
  - Any file not listed in SCOPE.
- **STOP_IF:**
  - Q1 resolves that `setupObservers` cannot throw synchronously under any realistic path → stop and ask whether S4 is still worth shipping as defensive code.
  - U.R3 fails (unification breaks existing integration tests on the happy path, OR the manual error-injection test shows `setReconciledBase` is called when it shouldn't be) → stop and investigate. Do NOT paper over by editing the tests. Either the copies weren't equivalent or the throwing-helper wrapper was mis-wired.
  - The S1 frontmatter asymmetry test reveals that the current behavior is actually buggy (e.g., Y.Text should NOT hold frontmatter) → stop and surface as decision-implicating finding. Do not change the test to match "correct" behavior.
  - `bun run check` fails on any individual commit → stop and fix before moving to the next commit. Commits must pass `check` independently per All.R1.
  - Miles pushes new commits to PR #39 mid-implementation that land inside `standalone.ts` lines 143-153 → stop and re-verify the conflict surface. Our edits at 82-88, 177-205, and 428-687 should still be unaffected, but verify before continuing.
  - The extracted `applyExternalChange` helper fails typecheck or lint when imported in `standalone.ts` → stop and investigate the import cycle or type mismatch before proceeding.
- **ASK_FIRST:**
  - Adding any new dependency.
  - Modifying `SyncState` union type.
  - Adding any test file outside the SCOPE list.
  - Changing the commit structure from 5 atomic commits.
  - Touching any CLAUDE.md section other than "Testing — per-test docName isolation" or an immediately-adjacent new subsection.
  - Splitting any commit into two (e.g., S3 implementation + S3 tests as separate commits) — the 5-commit structure is load-bearing.
  - Adding a CLI-side consumer of `server.degraded` (that's NG1).

---

## 17) Evidence & References

### Evidence Files (spec-local)

- [evidence/external-change-dual-copy.md](./evidence/external-change-dual-copy.md) — proof that `standalone.ts applyToDoc` and `external-change.ts` are drifted duplicates; diff table; call-chain trace from test-harness to the CLI copy
- [evidence/provider-pool-setupobservers-path.md](./evidence/provider-pool-setupobservers-path.md) — S4 call site analysis at `provider-pool.ts:92-111`; failure mode trace; `destroyEntry` pattern; existing test gap
- [evidence/observers-applyuserdelta-current-state.md](./evidence/observers-applyuserdelta-current-state.md) — S7 current-state capture: exact JSDoc lines, exact test docstring lines, exact CLAUDE.md Testing section, proposed enrichments
- [evidence/pr39-conflict-surface-analysis.md](./evidence/pr39-conflict-surface-analysis.md) — PR #39 metadata and per-file diff analysis; verification that textual conflict surface with our target files is effectively zero; correction of stale "line 138" reference
- [evidence/s3-degraded-signal-design.md](./evidence/s3-degraded-signal-design.md) — S3 line-level implementation plan; `readonly` type derivation; head-watcher-wrinkle resolution (via `head-watcher.ts:141-144` code citation)

### Audit artifacts

- [meta/audit-findings.md](./meta/audit-findings.md) — spec auditor subprocess output (1 high, 4 medium, 1 low) — 9 of 10 unique findings applied to this spec, resolution documented in `meta/_changelog.md`
- [meta/design-challenge.md](./meta/design-challenge.md) — design-challenger subprocess output (1 high, 3 medium, 2 low) — converged with auditor on the H1 finding

### Code references (baseline `2d35736`)

- `packages/server/src/standalone.ts:82-88` — current `ServerInstance` type (S3.R1 target)
- `packages/server/src/standalone.ts:177-205` — inline `applyToDoc` (unification target)
- `packages/server/src/standalone.ts:245, 258, 271, 554, 594, 599` — caller-side try/catch gates on `setReconciledBase` (U.R3 preservation target)
- `packages/server/src/standalone.ts:428-464, 680, 685-687` — initAsync catches + factory return (S3.R2/R3 targets)
- `packages/server/src/external-change.ts:1-69` — factory to extend with throwing helper
- `packages/server/src/head-watcher.ts:141-144` — no-op handle on missing `.git` (D8 evidence)
- `packages/app/src/editor/provider-pool.ts:92-111` — `setupObservers` call site (S4.R1 target)
- `packages/app/src/editor/provider-pool.ts:193-198` — `destroyEntry` pattern to reuse
- `packages/app/src/editor/observers.ts:169-183` — `applyUserDelta` JSDoc (S7.R1 target)
- `packages/app/src/editor/observers.test.ts:1236-1260` — divergence describe header (S7.R2 target)
- `CLAUDE.md:172-182` — existing Testing section (S7.R3 target)

### Upstream artifacts

- [projects/server-bridge-hardening/PROJECT.md](../../projects/server-bridge-hardening/PROJECT.md) — parent project defining the Now phase scope and PQ3 reframe
- [specs/2026-04-10-test-isolation-parallelism/SPEC.md](../2026-04-10-test-isolation-parallelism/SPEC.md) — PR #38 spec that generated this deferred scope
- [tmp/ship/pr-future-work.md](../../tmp/ship/pr-future-work.md) — original enumeration of ~20 deferred items
- [tmp/ship/review-status.json](../../tmp/ship/review-status.json) — `deferredFindings[]` from PR #38 `/review-cloud` loop

### Parallel specs (coordination, not dependency)

- [specs/2026-04-11-server-destroy-flush-fix/SPEC.md](../2026-04-11-server-destroy-flush-fix/SPEC.md) — parallel spec owned by Nick Gomez addressing a silent data-loss bug in `createServer().destroy()` (fire-and-forget `hocuspocus.flushPendingStores()` + L2-before-L1 phase ordering).
  - **Interaction:** Both specs edit `packages/server/src/standalone.ts` in disjoint regions (verified 2026-04-11 — Spec B edits ServerOptions 55-80, new helper + state ~106-175, destroy() body 399-424, import block; this spec edits 82-88, 177-205, 428-680, 685-687). **Zero textual overlap.** Line-shift fuzz only at merge time.
  - **Collision:** Both specs create `packages/server/src/standalone.test.ts` as a new file. Resolution per §16 SCOPE — whichever lands second extends the existing file with a new `describe` block.
  - **No semantic dependency:** either can ship first. See §12 A9/A10.
  - **Synergy opportunity (optional, not required):** Spec B's D14 structured shutdown log could include `srv.degraded` for a complete lifecycle observability record. Add as a one-line enrichment to Spec B's log payload if Spec A lands first. Non-blocking either way.

### External references

- `gh pr view 39` — PR #39 metadata (open, 22 files changed, +3008/-184), captured 2026-04-11
- `/tmp/pr39-full.diff` — full PR #39 diff saved for the conflict surface analysis (not committed; re-fetch via `gh pr diff 39 > /tmp/pr39-full.diff`)
