# Bridge Convergence Under Concurrent Writes — Spec

**Status:** Ready for Implementation
**Owner(s):** Nick Gomez
**Baseline commit:** `08c20f1`
**Builds on:** `specs/2026-04-13-observer-a-origin-aware-diff/SPEC.md` (PR #128 — origin-laundering fix). D1–D16 LOCKED; do not re-litigate.
**Downstream consumer:** V0-14 (Miles's per-agent `Y.UndoManager({ trackedOrigins: new Set([AGENT_WRITE_ORIGIN]) })` architecture — object reference per precedent #1, not string)
**Links:**
- Reproducer: `packages/app/tests/integration/observer-a-baseline-absorption-repro.test.ts` (uncommitted diagnostic artifact; 4 failing tests that become the acceptance harness)
- V0-14 project entry: `projects/v0-launch/PROJECT.md:107-148`
- Evidence: `./evidence/`

---

## 1) Problem statement (SCR)

**Situation.** The Open Knowledge editor maintains two Y.js CRDT representations that must stay in sync: `Y.XmlFragment('default')` (WYSIWYG via TipTap) and `Y.Text('source')` (CodeMirror source mode). A bidirectional observer pair (`observers.ts`) syncs client-side; `syncTextToFragment` (`agent-sessions.ts`) syncs server-side after agent writes. PR #128 (origin-aware diff) ensured Observer A preserves CRDT Item origins so `Y.UndoManager({ trackedOrigins })` consumers — notably V0-14's per-agent UMs — see correct provenance.

**Complication.** Two bridge-convergence bugs remain, both verified reachable at the Tier 1 integration layer:

- **Bug-A — Server `syncTextToFragment` destroys concurrent client XmlFragment content.** On `/api/agent-write*` and `/api/agent-patch`, the server uses Y.Text as the authoritative input for rebuilding XmlFragment. But server Y.Text lags server XmlFragment for client-originated WYSIWYG typing (client Observer A has a 50ms debounce; CRDT propagates XmlFragment and Y.Text independently). `updateYFragment(xmlFragment, parse(Y.Text))` then structurally diffs user-content-rich XmlFragment down to user-content-poor Y.Text — deleting user paragraphs. 100% deterministic on any agent write overlapping user typing. Evidence: `P0` + `P0-stress` tests show 10/10 user-typing markers lost. (See `evidence/bug-a-mechanism.md` and `evidence/updateYFragment-is-structural-diff.md` — the diff is not destructive; using the wrong side as authority is.)

- **Bug-B — Observer A's remote-tx baseline refresh absorbs local changes.** `observers.ts` refreshes `lastSyncedXmlMd` on every remote XmlFragment transaction. If the refreshed baseline equals the XmlFragment state the debounce later serializes, the early-exit at `observers.ts:324` fires and the drift between Y.Text and XmlFragment goes unreconciled. Reachable under synchronous peer+peer same-line typing (Tier 1 `CONTROL` reproducer — both peers' Y.Text stuck at seed while XmlFragments converged). Self-heals on next local edit in asynchronous human typing; persists under scripted sources. (See `evidence/bug-b-mechanism.md`.)

Both violate the bridge invariant (`stripTrailingWhitespace(ytext) === stripTrailingWhitespace(serialize(fragment))`). Both are distinct from PR #128's origin-laundering fix: Bug-A is upstream of Observer A (server-side); Bug-B is "Observer A skips a sync it should do" (vs. PR #128's "Observer A replaces Items it shouldn't"). **V0-14 ships with silent data loss regardless of PR #128** because per-agent UMs attach to Y.Text and Bug-A leaves Y.Text desynchronized from XmlFragment on every concurrent agent+user flow.

**Additional finding (Bug-D — handed off to V0-14).** Empirical reproduction during this spec's analysis surfaced a third bug: the post-undo rebuild path (`syncTextToFragment` called after `um.undo()` per the current CLAUDE.md STOP rule) has the same XmlFragment-stomp shape as Bug-A. It cannot fire today (V0-16 removed the undo scaffold per TQ13 — zero `um.undo()` callers exist), but would fire the moment V0-14 wires the per-agent UM. Its fix is design-coupled to V0-14's undo contract (snapshot-restore vs. contribution-scoped semantics, UM topology, rebuild origin) — not a pure bridge invariant. This spec does not implement Bug-D's fix but hands it off with: (1) `syncTextToFragment` deleted (dead code after Bug-A migration — see §9 D9), (2) CLAUDE.md STOP rule rewritten to point at the XmlFragment-authoritative pattern (FR-9), (3) the empirical regression test `bug-d-v0-14-agent-undo-under-concurrent-typing.test.ts` (renamed from the diagnostic artifact `bug-d-isolation-repro.test.ts`) committed skip-guarded for V0-14 to unskip (FR-10), (4) documented fix shape (`evidence/bug-d-mechanism.md`).

**Resolution.** Close both convergence gaps. Server-side: invert `syncTextToFragment`-style flow so agent writes compose their delta against server XmlFragment (not Y.Text), then mirror Y.Text with minimal mutation — preserving user content via `updateYFragment`'s structural diff and Y.Text-level prefix/suffix matching. Client-side: extend Observer A's early-exit to detect Y.Text drift and reconcile via `applyByPrefixSuffix`. Both operate without touching Observer B or the file-watcher path (confirmed unaffected via `P1` reproducer). Preserve PR #128's Item-origin invariant. Make V0-14 safe by design for forward agent writes and hand off Bug-D (agent undo under concurrent typing) to V0-14 with a documented fix template + failing gated test.

## 2) Goals

- **G1. Server-side agent writes are non-destructive to concurrent client XmlFragment content.** After any `/api/agent-write*` or `/api/agent-patch`, any client XmlFragment content propagated to the server at the moment of agent write is preserved in the post-convergence state. Measured via `P0` + `P0-stress` reproducer passing: all user markers AND all agent markers present in Y.Text.
- **G2. Observer A reconciles Y.Text drift on remote transactions.** If Y.Text has drifted from the serialized XmlFragment at the moment of a remote XmlFragment transaction, the next `runObserverASync` tick brings Y.Text current via `applyByPrefixSuffix` (minimal mutation, origin-preserving for prefix/suffix). Measured via `CONTROL` reproducer passing: both peers' Y.Text contains both peers' edits.
- **G3. Bridge invariant holds after every settle point — enforced automatically.** `stripTrailingWhitespace(ytext) === stripTrailingWhitespace(serialize(fragment))` on every client after debounces drain. Automatically asserted via the bridge invariant watcher (FR-11) attached by default in every integration/stress/fuzz test. Manual `assertBridgeInvariant` calls become opt-in reinforcement, not the primary guarantee.
- **G4. PR #128's Item-origin invariant preserved (no new origin-laundering surface) — probed, not assumed.** Agent-origin Items remain `AGENT_WRITE_ORIGIN` through the server path; user-content Items in both XmlFragment and Y.Text retain their prior origins. V0-14's per-agent UM retains tracked Items through the bridge cycle. Asserted via the origin-preservation probe helpers (FR-12) at every test that touches a tracked origin.
- **G5. V0-14's agent-WRITE product flow is safe by design; agent-UNDO flow is handed off with documented template + failing gated test.** Under this spec's fixes, a V0-14 server-side per-agent UM (`Y.UndoManager(ytext, { trackedOrigins: new Set([AGENT_WRITE_ORIGIN]) })`) captures the correct Items during forward writes without exposing user's concurrent typing to drift or laundering. Validated via FR-4 test using **server-side UM topology** (via `getServerState` — FR-13): agent write + user concurrent XmlFragment typing → server UM captures only `AGENT_WRITE_ORIGIN` Items (user's `ORIGIN_TREE_TO_TEXT` Items correctly untracked), `serverUm.undo()` reverts agent content only, user content intact on both sides, bridge invariant holds. Client-side UM topology cannot validate this claim (remote WebSocket sync strips origin identity) — FR-4 uses server-side by design. The **undo** side is Bug-D: the fix shape is the same XmlFragment-authoritative pattern (`applyAgentUndo` mirroring `applyAgentMarkdownWrite`), but the undo contract itself (snapshot vs. contribution-scoped, UM topology, rebuild origin) is V0-14's design call. See §7e, FR-10, and `evidence/bug-d-mechanism.md`.
- **G6. No regression.** `bun run check` 13/13 and `bun run check:full:parallel` 18/18 remain green. All existing server, app, stress, fuzz, integration, and fidelity tests pass unchanged.
- **G7. Bridge convergence is invariant-enforced + property-verified — no more ad-hoc reproducer-rebuilding per bug.** The testing harness codifies the three bridge invariants (bridge, baseline, item-preservation per CLAUDE.md) as first-class watchers and probes (FR-11, FR-12). Observer debounces are dependency-injected for deterministic testing (FR-15). CRDT network races are reproduced via message-ordering control rather than wall-clock waits (FR-16). A property-based convergence fuzzer (FR-17) samples the multi-client race space that example-based tests cannot enumerate. AGENTS.md precedent #11 codifies this discipline for all future bridge work. Acceptance: the 4 bugs this spec found + the V0-14 Bug-D gate (FR-10) are all expressible using harness primitives without per-test scaffolding rebuilding.

## 3) Non-goals

- **[NEVER] NG1:** Changing Observer B, the file-watcher path (`external-change.ts`), the persistence layer (`persistence.ts`), or shadow repo (`shadow-repo.ts`). Confirmed unaffected via `P1` reproducer.
- **[NEVER] NG2:** Re-litigating PR #128 LOCKED decisions D1–D16. This spec builds on them (Path A content gate, Path B DMP merge, origin preservation invariant, precedent #9).
- **[NEVER] NG3:** Changing the transaction-origin convention (`AGENT_WRITE_ORIGIN` string, `ORIGIN_TREE_TO_TEXT`, `ORIGIN_TEXT_TO_TREE`). Origin semantics stay; this spec only changes WHERE mutations happen.
- **[NEVER] NG4:** Accessing Y.js internal Item structures (`_start`, `_item`). Public API only, same discipline as PR #128.
- **[NEVER] NG5:** Introducing new CRDT types (e.g., `Y.Map('safety-events')`, new `Y.Array`). D14 precedent stands.
- **[NOT NOW] NG6:** Per-character attribution side-table (dmonad's option #1, carried over from PR #128 Future Work). Still not required post-fix.
- **[NOT NOW] NG7:** Coordination protocol requiring the agent-write handler to wait for pending client XmlFragment propagation before writing (Bug-A option-b). Evaluated and rejected as over-engineered (see §9 D3).
- **[NOT NOW] NG8:** Orthogonal drift-detector timer (Bug-B option-c). Evaluated and rejected (see §9 D5).
- **[NOT NOW] NG9:** Bug-D (post-undo XmlFragment-rebuild destroys concurrent user content) — design-coupled to V0-14's undo contract (snapshot vs. contribution-scoped semantics, UM topology, rebuild origin). Cannot fire today: zero `um.undo()` callers exist post-V0-16 TQ13 removal. This spec deletes `syncTextToFragment` (the broken mechanism), rewrites the CLAUDE.md STOP rule, and commits a skip-guarded regression gate (`bug-d-v0-14-agent-undo-under-concurrent-typing.test.ts`, renamed from the diagnostic `bug-d-isolation-repro.test.ts` per FR-10). V0-14 implements the fix. See §9 D12, §7e, `evidence/bug-d-mechanism.md`.

## 4) Personas / consumers

- **P1: V0-14 per-agent UndoManager (Miles's immediate consumer, downstream).** Server-side `Y.UndoManager(ytext, { trackedOrigins: new Set([AGENT_WRITE_ORIGIN]) })` per connected agent — the object reference per precedent #1, not a string. Requires that agent-origin Items in Y.Text are the only tracked Items (no user content mistakenly under `AGENT_WRITE_ORIGIN`), that agent Items are actually present on Y.Text (not lost to Bug-A), and that agent undo leaves user content intact in both XmlFragment and Y.Text.
- **P2: Human WYSIWYG user.** Types in WYSIWYG (XmlFragment). Expects: content never silently deleted by agent activity. Concurrent agent writes compose with user typing rather than overwriting it.
- **P3: AI agent via MCP/API.** Writes via `/api/agent-write*` or `/api/agent-patch`. Expects its write to be revertible by its own per-agent UM (V0-14) without affecting any other contributor's content.
- **P4: Observer pipeline developer.** Next person touching `observers.ts` or `agent-sessions.ts`. Inherits the architectural precedent: "XmlFragment is authoritative for markdown state; Y.Text mirrors it under minimal mutation" — codified in a new AGENTS.md precedent #10.
- **P5: Peer WYSIWYG user.** Two browser tabs on the same doc, typing concurrently. Expects both contributions to end up in both XmlFragment AND Y.Text on both clients. Observer A's drift-catcher ensures Y.Text catches up when baseline refresh absorbs a local change.

## 5) User journeys

### Primary happy path (FR-1 / FR-2 — user + agent same-line collaboration)

1. User types "Hello" in WYSIWYG at end of line 5.
2. Mid-typing (before Observer A's 50ms debounce fires), an MCP agent writes " World" to the same doc via `/api/agent-write`.
3. **Bug-A fix applies server-side:**
   - Server reads XmlFragment (already has "Hello" from CRDT propagation)
   - Composes: baseline + "Hello" + " World"
   - updateYFragment — structural diff preserves user's content paragraph Items, adds " World" text segment under `AGENT_WRITE_ORIGIN`
   - applyByPrefixSuffix on Y.Text — only the differing region (" World") is written under `AGENT_WRITE_ORIGIN`
4. Server broadcasts the combined transaction to all clients.
5. Client receives both XmlFragment and Y.Text updates. Client's Observer A remote-tx branch refreshes baseline; **Bug-B fix applies:** if local Y.Text had drifted from the refreshed baseline (user's local XmlFragment typing not yet synced to client Y.Text), drift-catcher runs `applyByPrefixSuffix(ytext, currentText, md)` → Y.Text converges.
6. V0-14's per-agent UM stack entry for the " World" insertion now exists on Y.Text under `AGENT_WRITE_ORIGIN`.
7. Agent invokes `undo_agent_edit` → server-side UM reverts the " World" Y.Text Item. User's "Hello" Items preserved. Subsequent `syncTextToFragment` (post-undo, per CLAUDE.md STOP rule) rebuilds XmlFragment from the reverted Y.Text → user content preserved on both sides.
8. **Zero data loss. Zero zombie content.** V0-14's contract holds.

### Secondary path (FR-3 — peer WYSIWYG concurrent typing)

1. Peer A and peer B are editing the same doc in different browser tabs.
2. Both type on line 5 simultaneously.
3. XmlFragments converge via CRDT tree sync (both have both contributions).
4. Both clients' Observer A remote-tx branches fire. Baselines refresh to the combined state.
5. **Bug-B fix applies:** local debounce fires on each client; drift-catcher detects `ytext.toString() !== md`; applies minimal Y.Text mutation.
6. Y.Text converges via client CRDT propagation. Both clients now have both contributions in both representations.
7. Bridge invariant holds. V0-14's UM sees coherent Y.Text state.

### Failure-path journeys (preserved for completeness — handled by existing behavior)

- **User typing + file watcher disk change:** Already works correctly (`P1` reproducer). Bug-A fix doesn't interact with this path.
- **Agent patch with find-not-found:** Existing 404 behavior unchanged; `agent-patch` pre-checks find before mutating.

## 6) Requirements

### Functional requirements

| Priority | ID | Requirement | Acceptance criteria |
|---|---|---|---|
| Must | FR-1 | `syncTextToFragment` replaced by an XmlFragment-authoritative composition flow in `agent-sessions.ts`. Agent-write handlers read server XmlFragment, compose agent's delta at the markdown level, run `updateYFragment`, and mirror Y.Text via `applyByPrefixSuffix`. | `P0` reproducer test: single user XmlFragment edit + single agent write → Y.Text contains both. `P0-stress` reproducer: 10 rounds of interleaved user typing + agent writes → all 10 user markers AND all 10 agent markers in Y.Text. Bridge invariant holds. All existing server tests pass. |
| Must | FR-2 | `applyByPrefixSuffix` extracted to `packages/core` as a shared utility (`core/src/utils/apply-by-prefix-suffix.ts`). Both `observers.ts` (client-side Path B) and the new server-side agent-write path consume it. | Function exported from `@inkeep/open-knowledge-core`. Identical behavior to current `observers.ts:192-211`. Unit tests for the utility in `packages/core`. Zero behavioral regression in existing Observer A Path B tests. |
| Must | FR-3 | `observers.ts` adds a drift-catcher branch at the `lastSyncedXmlMd === md` early-exit. If Y.Text has drifted from the current XmlFragment serialization, apply `applyByPrefixSuffix(ytext, currentText, md)` under `ORIGIN_TREE_TO_TEXT`. | `CONTROL` reproducer test: two peers concurrent same-line typing → both peers' Y.Text contains both edits. Bridge invariant holds on both peers. UM stack semantics unchanged (new Items created under `ORIGIN_TREE_TO_TEXT` are NOT tracked by `AGENT_WRITE_ORIGIN` UMs). |
| Must | FR-4 | Per-agent UM safety: agent undo preserves user content — validated against V0-14's **server-side UM topology**. | New integration test: agent write + user concurrent XmlFragment typing → UM attached server-side via `getServerState` (FR-13) with `trackedOrigins: new Set([AGENT_WRITE_ORIGIN])` (object ref per precedent #1) captures agent Items → `serverUm.undo()` reverts agent content only → user content intact in Y.Text AND XmlFragment on **both** server and client. Bridge invariant auto-asserted by FR-11 watcher at every step. Client-side UM topology was considered and rejected — server-originated transactions arrive on the client with HocuspocusProvider origin, not `AGENT_WRITE_ORIGIN`, so a client UM would capture nothing (audit H3 resolution). |
| Must | FR-5 | AGENTS.md precedent #10 documents the architectural pattern: "XmlFragment is authoritative for markdown state; Y.Text mirrors it under minimal mutation." Adjacent to precedent #9 (origin preservation patterns). | Added to AGENTS.md (and the symlinked CLAUDE.md). Cross-references precedent #9 and PR #128's D14 (no Y.Map for diagnostics). |
| Must | FR-6 | No origin laundering introduced. All existing origin-preservation tests pass. New test: agent write under the Bug-A fix preserves user Y.Text content's original origin (e.g., `'sync-from-tree'` from prior Observer A sync). | FR-4's UM probe test extended to also verify the user's Y.Text Items retain their original origin after the agent-write-fix transaction. |
| Must | FR-7 | `P1` (file-watcher) test unchanged — still passes. | `P1` stays green. `applyExternalChange` unchanged. |
| Must | FR-8 | The reproducer file `observer-a-baseline-absorption-repro.test.ts` becomes the regression harness: after the fixes, all 4 tests pass. | `bun test packages/app/tests/integration/observer-a-baseline-absorption-repro.test.ts` → 4 pass, 0 fail. |
| Must | FR-9 | Delete `syncTextToFragment` from `packages/server/src/agent-sessions.ts` (and its re-export from `packages/server/src/index.ts`). Rewrite the CLAUDE.md STOP rule that currently says "Always call `syncTextToFragment` after `um.undo()` / `um.redo()`" to instead point at the XmlFragment-authoritative pattern (`applyAgentMarkdownWrite` template) and warn that a naive rebuild-from-Y.Text destroys concurrent user content (Bug-D). | `grep -rn syncTextToFragment packages/` returns zero hits in non-test source files after migration. CLAUDE.md and AGENTS.md STOP rule reference the new pattern. `bun run check` passes. Transitive-dependency trace (spec §8 OQ-8) verified zero reachable consumers. |
| Must | FR-10 | Commit `packages/app/tests/integration/bug-d-isolation-repro.test.ts` (both D-iso-1 mechanism and D-iso-2 V0-14-flow tests) as a skip-guarded regression gate. Rename to `bug-d-v0-14-agent-undo-under-concurrent-typing.test.ts`. Each `test(...)` becomes `test.skip(...)` with a top-of-file comment: "UNSKIP when V0-14 wires per-agent UM + agent-undo handler. These tests assert that the post-undo rebuild preserves user's concurrent XmlFragment content. See `evidence/bug-d-mechanism.md` and spec §7e." | File committed. Tests are `.skip` but compile and typecheck. `bun run check` stays green. Test content itself unchanged from diagnostic artifact (same mechanism, same flow). |
| Must | FR-11 | **Bridge invariant watcher (per-transaction only — no quiescence mode).** `attachBridgeInvariantWatcher(doc, opts?)` installed by default in `createTestClient()`. One assertion mode: if `tx.origin` is a `LocalTransactionOrigin` in the enforcing set `{ ORIGIN_TREE_TO_TEXT, ORIGIN_TEXT_TO_TREE, AGENT_WRITE_ORIGIN, FILE_WATCHER_ORIGIN, ROLLBACK_ORIGIN }` (all object references per precedent #1 — string literals would not match production tx.origin objects, causing silent skip), assert invariant immediately after `afterTransaction`. Violation throws with `{ origin, ytextSnapshot, fragmentMdSnapshot, unifiedDiff, stack }`. Opt-out via `createTestClient(port, { skipInvariantWatcher: true })` for tests that deliberately drive divergence (e.g., Bug-D skip-guarded test). Settled-state assertion (catching "Observer A never reconciled") is the responsibility of `assertAllConverged` (FR-14) at test-author-chosen points — not of a quiescence timer. A quiescence mode was considered and rejected: 400ms magic numbers couple the watcher to implicit wall-clock timing (which D15/D16 explicitly reject) and would inject CI flakiness under variable runner latency. | Every existing passing integration test stays green with watcher attached — no false positives. Watcher catches each of the 4 diagnostic reproducers' pre-fix scenarios (Bug-A/B/C via origin-gated per-tx; Bug-D via the skip-guarded gate, not the watcher). `bun run test:integration` reports zero invariant violations post-fix. Explicit test: a synthetic file-watcher transaction that leaves the bridge invariant violated must fail the watcher (proves object-identity matching works for `FILE_WATCHER_ORIGIN` and `ROLLBACK_ORIGIN`, not just `AGENT_WRITE_ORIGIN`). |
| Must | FR-12 | **Origin-preservation probe helpers.** `createItemOriginProbe(ytext, { trackedOrigins: LocalTransactionOrigin[] })` wraps a `Y.UndoManager` probe. API: `probe.recordCapture(label?)` (snapshots current stack depth + entry content), `probe.assertCaptureIntact(label?)` (asserts the snapshotted entries are still in the undoStack — i.e., the Items have not been replaced by later operations), `probe.capturedContent()` (returns the content in the tracked origin). Replaces the inline `new Y.UndoManager(...)` pattern used in FR-4 and bridge-matrix tests. | FR-4 test rewritten using the probe helper. `observers.test.ts` Group D/E tests refactored to use it where currently they do manual UM creation. All origin-preservation tests still pass. |
| Must | FR-13 | **Server-side state inspector.** `getServerState(server: TestServer, docName: string): ServerDocState \| null` returning `{ ytext, fragment, md, fullMd, frontmatter, metaMap, activityMap, connectionCount }`. Encapsulates `(server.instance as any).hocuspocus.documents.get(docName)` behind a typed, documented surface. | All existing tests that reach into `server.instance.hocuspocus.documents` migrate to `getServerState()`. Zero direct `(server.instance as any).hocuspocus` accesses in test code post-refactor. |
| Must | FR-14 | **Multi-client factory + convergence assert.** `createTestClients(port, { count, docName? })` returns `TestClient[]` all joined to the same doc (auto-generates `docName` if not given). `assertAllConverged(clients, { timeout })` polls until every client has identical `ytext.toString()` AND identical `serialize(fragment)` AND bridge invariant holds on each; throws on timeout with per-client state diff. | `bridge-matrix.test.ts` M1 test + spec's FR-4 test rewritten using the multi-client factory. The bridge-convergence fuzzer (FR-17) uses this as its primary client-setup primitive. |
| Must | FR-15 | **Observer scheduler dependency injection.** Add `scheduler?: Scheduler` field to `ObserverDeps` (both observers' debounces + TYPING_DEFER_MS use it). `Scheduler` is an exported interface with `setTimeout: (cb, ms) => ReturnType<typeof setTimeout>` and `clearTimeout: (handle: ReturnType<typeof setTimeout>) => void` — return type is the concrete Node/browser timer handle, NOT `unknown` (audit M6 resolution — keeps `debounceA: ReturnType<typeof setTimeout> \| null` typing intact in observers.ts; no casts). Default: arrow-wrapped passthrough to `globalThis.setTimeout`/`globalThis.clearTimeout` so method-binding is unambiguous (no `this`-expectation mismatch). Test helper: `createManualScheduler()` returns `ManualScheduler extends Scheduler` with `.flush()` (fire all pending synchronously), `.advanceTime(ms)` (fire callbacks due within ms), `.pending()` (inspect queue). Internal handle-ID cast is at the scheduler-implementation boundary, not at call sites. | Production behavior unchanged: `bun run check` + `bun run check:full:parallel` green. `observers.ts`'s existing `debounceA`/`debounceB`/typing-defer timer types unchanged (still `ReturnType<typeof setTimeout> \| null`). New `observers.test.ts` group uses `createManualScheduler()` + `flush()` replacing `wait(100)` for debounce-firing assertions. |
| Must | FR-16 | **Network-layer sync control (minimal — pause/resume only).** New file `packages/app/tests/integration/network-control.ts`. Wraps the `WebSocketPolyfill` supplied to `HocuspocusProvider`; exposes on each `TestClient`: `pauseSync()` (queue inbound WebSocket messages without applying), `resumeSync()` (drain queue). `createTestClient(port, { syncControl: true })` opts into the wrapped socket; default is passthrough (existing test behavior preserved). Additional ops (`delaySync(ms)`, `dropInbound(predicate)`, `inspectSyncQueue()`) are **deliberately deferred** — all four Bug-C reproduction scenarios are expressible via `pauseSync` + `resumeSync` + `wait`; delay/drop/inspect are speculative for races we haven't yet encountered. Extensions land when a concrete test motivates them. | New `bridge-matrix.test.ts` tests replace ad-hoc observer disabling and `wait(50)` timing-race reconstructions with `pauseSync`/`resumeSync` deterministic races. Bug-C real-reachability reproducer rewritten against this API. |
| Must | FR-17 | **Randomized multi-client bridge-convergence stress test with invariant oracles.** (Not property-based testing in the CRDT-primitive sense — see D17 for the reframing rationale.) New file `packages/app/tests/stress/bridge-convergence.fuzz.test.ts`. Generator v1: 2-5 clients, 10-50 random operations per client drawn from `{ wysiwyg-type, source-type, agent-write, agent-patch, external-change, sync-pause, sync-resume, wait }` — all 8 ops backed by primitives this spec ships (no speculative `delay`/`drop`/`inspect`). Random timing via FR-15 scheduler + FR-16 pause/resume. Oracles (run after all ops drain + schedulers flush + sync queues drain): (a) bridge invariant holds on every client; (b) `assertAllConverged` passes; (c) origin probes on agent-origin Items report preserved. Seed snapshots to `/tmp/bridge-conv-fuzz-<seed>` on failure. Replay via `STRESS_FUZZ_SEED=<n> bun test`. **Validation (must pass before FR-17 is accepted as load-bearing):** running the fuzzer against the pre-fix codebase (Bug-A/B/C present) must produce seeds that reproduce the known bugs within ≤25 iterations. If it doesn't, either the op generator is under-sampling or the oracle is under-specified. CI behavior: 25 seeds on PR (fast feedback), 100 seeds on `main`/nightly, seed snapshot uploaded as CI artifact on failure. Coverage gate (D18): separate test asserts every named bridge write surface has a corresponding op kind — fails CI if V0-14 adds `agent-undo` without extending the generator. | Pre-fix validation: fuzzer catches Bug-A, Bug-B, Bug-C each within ≤25 seeds. Post-fix: 100 seeds × 2-5 clients × 50 ops run in `bun run check:full:parallel` nightly without failure. Coverage gate fails CI if a write surface lacks an op. |

### Non-functional requirements

- **Performance:** No regression on single-client or Path A baseline. Agent write path: two additional `serialize` calls (one for current baseline, one for canonical output) vs. current one — acceptable; the dominant cost is `updateYFragment`'s structural walk, unchanged. Client drift-catcher: one additional `ytext.toString()` comparison per remote tx when baseline matches — negligible.
- **Test coverage:** Reproducer file becomes formal regression tests. New multi-client integration test for FR-4. All existing server, app, integration, stress, fuzz, and fidelity tests unchanged.

## 7) Proposed solution

### 7a) Bug-A fix — XmlFragment-authoritative agent write (FR-1)

**Current state (broken):** `agent-sessions.ts:53-82`. Also the 3 agent-write handlers in `api-extension.ts` at lines 573, 652, 965 that wrap `ytext.insert(...)` + `syncTextToFragment(document)` in a single transaction.

**Proposed state:** Replace the `ytext.insert(...) + syncTextToFragment(...)` pattern with a single `applyAgentMarkdownWrite(document, markdown, position)` helper:

```ts
// packages/server/src/agent-sessions.ts
// Replaces syncTextToFragment for agent-write callers. syncTextToFragment itself
// is deleted (FR-9) — it has zero reachable callers after this migration
// (transitive-dependency trace verified no undo scaffold, no rollback path, no
// reconciliation path, no adjacent subsystem depends on it). V0-14's future
// agent-undo handler will follow this same XmlFragment-authoritative pattern
// (see §7e and evidence/bug-d-mechanism.md for the handoff).
export function applyAgentMarkdownWrite(
  document: Document,
  markdown: string,
  position: 'append' | 'prepend' | 'replace',
): void {
  const xmlFragment = document.getXmlFragment('default');
  const ytext = document.getText('source');
  const metaMap = document.getMap('metadata');

  // 1. Read current authoritative state from XmlFragment (reflects all CRDT-synced content).
  const currentJson = yXmlFragmentToProsemirrorJSON(xmlFragment);
  const currentBody = mdManager.serialize(currentJson);
  const frontmatter = (metaMap.get('frontmatter') as string | undefined) ?? '';

  // 2. Compose the agent's delta at the markdown-body level.
  let newBody: string;
  switch (position) {
    case 'replace':
      newBody = markdown.trim();
      break;
    case 'prepend':
      newBody = `${markdown.trim()}\n\n${currentBody}`;
      break;
    case 'append':
      newBody = currentBody.trim()
        ? `${currentBody}\n\n${markdown.trim()}\n`
        : `${markdown.trim()}\n`;
      break;
  }

  // 3. Apply composed state to XmlFragment via structural diff
  //    (preserves user-content Items at matching prefix/suffix positions).
  const parsedJson = mdManager.parseSafe(newBody);
  const pmNode = schema.nodeFromJSON(parsedJson);
  const meta = { mapping: new Map(), isOMark: new Map() };
  updateYFragment(document, xmlFragment, pmNode, meta);

  // 4. Mirror Y.Text with minimal mutation. Only the changed region is touched,
  //    so user-content Items in Y.Text (e.g. from prior Observer A sync under
  //    'sync-from-tree') retain their origin; agent's new content goes under
  //    AGENT_WRITE_ORIGIN (this transaction's origin).
  const canonicalBody = mdManager.serialize(yXmlFragmentToProsemirrorJSON(xmlFragment));
  const canonicalFull = prependFrontmatter(frontmatter, canonicalBody);
  applyByPrefixSuffix(ytext, ytext.toString(), canonicalFull);
}
```

**Caller-site changes** in `api-extension.ts` (3 sites):

```ts
// handleAgentWrite (line 573) — becomes:
dc.document.transact(() => {
  applyAgentMarkdownWrite(dc.document, content + '\n', 'append');
  const activityMap = dc.document.getMap('activity');
  activityMap.set(DEFAULT_AGENT_ID, { /* existing shape */ });
}, AGENT_WRITE_ORIGIN);

// handleAgentWriteMd (line 652) — becomes:
dc.document.transact(() => {
  applyAgentMarkdownWrite(dc.document, markdown, position);
  // ... activity map ...
}, AGENT_WRITE_ORIGIN);

// handleAgentPatch (line 965) — keeps find-check, then:
dc.document.transact(() => {
  const xmlFragment = dc.document.getXmlFragment('default');
  const currentBody = mdManager.serialize(yXmlFragmentToProsemirrorJSON(xmlFragment));
  const pos = currentBody.indexOf(find);
  if (pos === -1) { notFound = true; return; }
  const newBody = currentBody.slice(0, pos) + replace + currentBody.slice(pos + find.length);
  applyAgentMarkdownWrite(dc.document, newBody, 'replace');
  // ... activity map ...
}, AGENT_WRITE_ORIGIN);
```

`syncTextToFragment` is **deleted** along with its re-export from `packages/server/src/index.ts` (FR-9). After the 3 callers migrate to `applyAgentMarkdownWrite`, transitive-dependency trace confirms zero reachable consumers — no undo scaffold exists (V0-16 TQ13 removed it), no adjacent subsystem depends on it, no dynamic dispatch references it. Keeping it would actively mis-direct V0-14's implementer toward the known-buggy rebuild-from-Y.Text pattern (Bug-D). See §7e for the V0-14 handoff template.

### 7b) Bug-B fix — drift-catcher on Observer A early-exit (FR-3)

**Current state (broken):** `observers.ts:319-346`. Early-exit at line 324 returns when baseline matches serialized XmlFragment, without checking Y.Text.

**Proposed state:** Replace the early-exit block with a drift-aware version:

```ts
const runObserverASync = (): void => {
  debounceA = null;

  try {
    const json = yXmlFragmentToProsemirrorJSON(xmlFragment);
    const body = mdManager.serialize(json);
    const frontmatter = getFrontmatter(doc);
    const md = prependFrontmatter(frontmatter, body);

    const currentText = ytext.toString();

    // Early-exit path with drift detection.
    if (lastSyncedXmlMd === md) {
      // Baseline matches XmlFragment. Check if Y.Text has drifted (which happens
      // when a prior remote-tx baseline refresh captured a state that included
      // content the local Y.Text doesn't have — e.g., a remote peer's WYSIWYG
      // typing propagated via XmlFragment CRDT but not via Y.Text CRDT yet).
      if (currentText === md) {
        return;  // fully in sync
      }
      // Y.Text drifted. Reconcile via applyByPrefixSuffix — minimal mutation,
      // preserves Items in the matching prefix/suffix. Origin: ORIGIN_TREE_TO_TEXT
      // (correct — this is a tree-to-text sync).
      doc.transact(() => {
        applyByPrefixSuffix(ytext, currentText, md);
      }, ORIGIN_TREE_TO_TEXT);
      return;
    }

    // Unchanged early-exit: feedback-loop cover. Keep for the Observer-B
    // external-write propagation case (CLAUDE.md STOP rules).
    if (currentText === md) {
      lastSyncedXmlMd = md;
      return;
    }

    // Path A / Path B dispatch — unchanged from PR #128.
    doc.transact(() => {
      if (currentText === lastSyncedXmlMd) {
        applyIncrementalDiff(ytext, currentText, md);
      } else {
        applyUserDelta(deps, lastSyncedXmlMd, md);
      }
    }, ORIGIN_TREE_TO_TEXT);

    lastSyncedXmlMd = md;
  } catch (err) {
    console.error('[Observer A] Failed to sync tree→text:', err);
    deps.onSyncError?.('tree-to-text', err instanceof Error ? err : new Error(String(err)));
  }
};
```

The drift-catcher fires under `ORIGIN_TREE_TO_TEXT`, which is NOT in V0-14's `trackedOrigins: new Set([AGENT_WRITE_ORIGIN])` — so items added by the drift-catcher are correctly excluded from agent undo stacks.

### 7c) Shared utility extraction — `applyByPrefixSuffix` to core (FR-2)

Move from `packages/app/src/editor/observers.ts:192-211` to `packages/core/src/utils/apply-by-prefix-suffix.ts`:

```ts
// packages/core/src/utils/apply-by-prefix-suffix.ts
import type * as Y from 'yjs';

/**
 * Apply `newText` to `ytext` with minimal CRDT mutation: find matching prefix
 * and suffix, delete + insert only the differing middle region. Preserves
 * Y.Text Items in the prefix/suffix (and thus their transaction origins).
 *
 * Shared between client-side Observer A (Path B result application, drift catcher)
 * and server-side agent-write path (Bug-A fix). Same semantics, one implementation.
 */
export function applyByPrefixSuffix(
  ytext: Y.Text,
  currentText: string,
  newText: string,
): void {
  if (currentText === newText) return;

  let prefixLen = 0;
  const minLen = Math.min(currentText.length, newText.length);
  while (prefixLen < minLen && currentText[prefixLen] === newText[prefixLen]) prefixLen++;

  let suffixLen = 0;
  while (
    suffixLen < minLen - prefixLen &&
    currentText[currentText.length - 1 - suffixLen] === newText[newText.length - 1 - suffixLen]
  ) {
    suffixLen++;
  }

  const deleteLen = currentText.length - prefixLen - suffixLen;
  const insertStr = newText.slice(prefixLen, newText.length - suffixLen);
  if (deleteLen > 0) ytext.delete(prefixLen, deleteLen);
  if (insertStr.length > 0) ytext.insert(prefixLen, insertStr);
}
```

Both `observers.ts` and `agent-sessions.ts` import it from `@inkeep/open-knowledge-core`.

### 7d) Test plan

**Acceptance harness:** the reproducer file at `packages/app/tests/integration/observer-a-baseline-absorption-repro.test.ts`. Currently 4 failing tests encoding the bugs. After fixes, all 4 pass. **Keep this file** as the primary regression guard (rename from `-repro` to `-regression` at spec finalization).

**New integration test (FR-4 — V0-14 end-to-end safety, SERVER-SIDE UM topology):**

The test attaches the `Y.UndoManager` to the **server-side** Y.Text via `getServerState` (FR-13), not to the client's Y.Text. This mirrors V0-14's actual production topology (Miles's per-agent UM lives server-side) and solves the identity-matching problem: server-originated agent transactions originate locally on the server Doc under `AGENT_WRITE_ORIGIN`; a client-side UM would receive those transactions via HocuspocusProvider with the provider-level origin (not `AGENT_WRITE_ORIGIN`) and never capture anything. The bridge-invariant watcher (FR-11) is attached by default on both server-side and client-side docs via `createTestClient` — it auto-asserts pre-undo and post-undo without manual `assertBridgeInvariant` calls.

```ts
import * as Y from 'yjs';
import { randomUUID } from 'node:crypto';
import {
  createTestServer, createTestClient, agentWriteMd, applyMarkdownToFragment,
  getServerState, createItemOriginProbe, wait, testReset, pollUntil,
} from './test-harness';
import { AGENT_WRITE_ORIGIN } from '@inkeep/open-knowledge-server';

test('FR-4: server-side per-agent UM under bridge-convergence fixes preserves user content on undo', async () => {
  const docName = `test-fr4-${randomUUID()}`;
  await testReset(server.port, docName);
  const client = await createTestClient(server.port, docName);
  try {
    // 1. Seed with agent write (baseline content).
    await agentWriteMd(server.port, 'baseline paragraph.\n', { docName });
    await pollUntil(() => client.ytext.toString().includes('baseline'));

    // 2. Attach UM server-side via getServerState (FR-13). Mirrors V0-14's
    //    topology. trackedOrigins uses the AGENT_WRITE_ORIGIN object ref —
    //    Y.UndoManager's Set.has matches by identity for objects (precedent #1).
    const srv = getServerState(server, docName);
    expect(srv).not.toBeNull();
    const serverUm = new Y.UndoManager(srv!.ytext, {
      trackedOrigins: new Set([AGENT_WRITE_ORIGIN]),
      captureTimeout: 0,
    });

    // 3. User types locally in XmlFragment on the client (undefined origin).
    //    Observer A will later mirror this to client Y.Text under ORIGIN_TREE_TO_TEXT,
    //    which is NOT in the server UM's trackedOrigins — user Items stay untracked.
    applyMarkdownToFragment(client, 'baseline paragraph.\n\nuser typed here.\n');

    // 4. Agent writes concurrently via HTTP — server composes under AGENT_WRITE_ORIGIN,
    //    applies XmlFragment-authoritative pattern (FR-1), CRDT propagates to client.
    await agentWriteMd(server.port, 'agent wrote after.\n', { docName, position: 'append' });
    await wait(800);

    // 5. Both contributions present on both sides. Bridge invariant auto-asserted
    //    by FR-11 watcher on every enforcing-origin tx (ORIGIN_TREE_TO_TEXT from
    //    Observer A, AGENT_WRITE_ORIGIN from server write).
    expect(client.ytext.toString()).toContain('user typed here');
    expect(client.ytext.toString()).toContain('agent wrote after');
    expect(srv!.ytext.toString()).toContain('user typed here');
    expect(srv!.ytext.toString()).toContain('agent wrote after');

    // 6. Server UM captured the agent's AGENT_WRITE_ORIGIN Items (identity match).
    expect(serverUm.undoStack.length).toBeGreaterThan(0);

    // 7. Undo on server. Reverts only AGENT_WRITE_ORIGIN Items; user's
    //    ORIGIN_TREE_TO_TEXT-origin Items are untouched. Propagates to client.
    serverUm.undo();
    await wait(300);

    // 8. User content preserved, agent content reverted, bridge invariant holds
    //    on both sides (auto-asserted by FR-11 watcher after the undo tx).
    expect(client.ytext.toString()).toContain('user typed here');
    expect(client.ytext.toString()).not.toContain('agent wrote after');
    expect(srv!.ytext.toString()).toContain('user typed here');
    expect(srv!.ytext.toString()).not.toContain('agent wrote after');
  } finally {
    client.cleanup();
  }
});
```

**Why this shape is correct (resolves audit H3's deeper concern):**

| Concern | Client-side UM (rejected) | Server-side UM via FR-13 (adopted) |
|---|---|---|
| Origin identity match | Fails — client sees remote-sync origin, not `AGENT_WRITE_ORIGIN` | Works — server-side txs originate locally with `AGENT_WRITE_ORIGIN` |
| V0-14 topology match | No — V0-14 UM is server-side | Yes — direct analog |
| User content isolation | Would work in theory but UM never captures anything | Validated — `ORIGIN_TREE_TO_TEXT` items from client's user typing stay untracked server-side |
| Uses this spec's infrastructure | No | Yes — FR-13 `getServerState` + FR-11 auto-watcher + FR-4's own assertions |

**Unit tests for extracted `applyByPrefixSuffix`:** add in `packages/core/src/utils/apply-by-prefix-suffix.test.ts` — identity (no change), pure append, pure prepend, middle replacement, unicode boundary, empty-to-nonempty.

**Stress coverage:** existing `observers.stress.s4.test.ts` TQ6 scenarios remain; no changes needed. Existing fuzz covers randomized Path B.

### 7e) Bug-D handoff to V0-14 (documented pattern + gated test, no implementation)

**What Bug-D is.** The undo-side analog of Bug-A. The current CLAUDE.md STOP rule directs future undo implementers to call `syncTextToFragment` after `um.undo()`. That rebuild reads post-undo Y.Text as authoritative and destroys any user XmlFragment content that hasn't propagated to Y.Text yet — identical stomp shape to Bug-A, just on the undo side. Empirically confirmed via the committed skip-guarded regression gate `packages/app/tests/integration/bug-d-v0-14-agent-undo-under-concurrent-typing.test.ts` (FR-10; renamed from the diagnostic artifact `bug-d-isolation-repro.test.ts`) — two scenarios: D-iso-1 synthetic mechanism + D-iso-2 V0-14 flow. Not reachable today because no `um.undo()` caller exists (V0-16 TQ13 removed the scaffold).

**Why this spec does not implement the fix.** Bug-D's fix shape is known (XmlFragment-authoritative, mirror `applyAgentMarkdownWrite`'s structure). But the surrounding **contract** is V0-14's call:
- Undo semantics: snapshot-restore (revert entire edit region, absorbing user's concurrent typing — user can redo) vs. contribution-scoped (revert only agent's Items, preserve user's concurrent Items). Different products make different calls.
- UM topology: server-side per-agent UM (Miles's direction) vs. client-local vs. hybrid.
- Post-undo-rebuild origin: if `AGENT_WRITE_ORIGIN`, next undo captures it (infinite loop). A new origin is needed; its relationship to `trackedOrigins` is a V0-14 call.
- Broadcast model: server undoes and broadcasts, or each client undoes locally?

None of these are bridge invariants. Writing `applyAgentUndo` now is speculative infrastructure with no consumer (violates CLAUDE.md "don't design for hypothetical future requirements"). The honest answer is: specify the pattern, clear the dead code, gate V0-14 on the failing test.

**What this spec hands off.**

| Artifact | Deliverable |
|---|---|
| **Dead-code cleanup** | `syncTextToFragment` deleted (FR-9). V0-14 cannot inherit the buggy mechanism. |
| **STOP-rule rewrite** | CLAUDE.md + AGENTS.md point at `applyAgentMarkdownWrite` as the template; warn against rebuild-from-Y.Text (FR-9). |
| **Failing regression gate** | `bug-d-v0-14-agent-undo-under-concurrent-typing.test.ts` (renamed from `bug-d-isolation-repro.test.ts` per FR-10) committed skip-guarded. V0-14 unskips when wiring UM; test fails until the implementation is correct. |
| **Fix-shape documentation** | `evidence/bug-d-mechanism.md` — describes pattern, gives V0-14 pickup points, references `applyAgentMarkdownWrite`. |
| **Evidence artifacts** | `packages/app/tests/integration/bug-a-mechanism-isolation.test.ts`, `bug-c-real-reachability.test.ts`, and `bug-d-v0-14-agent-undo-under-concurrent-typing.test.ts` (the last renamed from `bug-d-isolation-repro.test.ts`, see FR-10) — empirical reproductions committed as diagnostic evidence. |

**V0-14 pickup template** (for Miles's future PR):

```ts
// packages/server/src/agent-sessions.ts (V0-14 addition — NOT in this spec)
// Mirrors applyAgentMarkdownWrite's structure. Replaces the deleted
// syncTextToFragment for the undo path. Fixes Bug-D.
export function applyAgentUndo(
  document: Document,
  um: Y.UndoManager,
  // V0-14 design choices: origin, topology, semantics all decided here
): void {
  document.transact(() => {
    um.undo();  // reverts Y.Text Items under AGENT_WRITE_ORIGIN
    // Rebuild XmlFragment using XmlFragment-authoritative composition:
    // 1. Read current XmlFragment (includes user's concurrent typing)
    // 2. Compute post-undo markdown from XmlFragment minus reverted-agent-region
    // 3. updateYFragment — structural diff preserves user Items
    // 4. applyByPrefixSuffix on Y.Text — minimal mutation, preserves Y.Text Items
  }, V0_14_UNDO_ORIGIN);  // NOT in trackedOrigins — avoids infinite capture
}
```

**Acceptance criteria for V0-14's Bug-D fix** (when Miles writes it):
- Unskip `bug-d-v0-14-agent-undo-under-concurrent-typing.test.ts` (the renamed, `.skip`-guarded file committed by this spec per FR-10); both tests pass.
- FR-4 test extends: agent write + user concurrent XmlFragment typing + agent undo → user content preserved, agent content reverted, bridge invariant holds.
- No regression on this spec's FR-1..FR-8.

### 7f) Harness hardening — bridge invariants as enforced precedent (FR-11 through FR-17)

**Why this is in scope under greenfield rules.** Finding these 4 bugs required rebuilding the same three scaffolding patterns each time: multi-client setup, server-side state inspection, timing-race reproduction. That's not "missing nice-to-haves" — it's the signature of missing infrastructure that forces ad-hoc re-invention per bug. Absence of this infrastructure IS tech debt (hidden in brittle test scaffolding) and will accumulate the same class of bugs into V0-14 and beyond. Two staff engineers would agree that the correct architectural precedent is: **bridge invariants are continuously enforced (watchers) and property-verified (PBT), not relied upon by convention and sampled by example.**

**Architectural principles codified here:**
1. Named invariants are enforced, not conventional. If it's in CLAUDE.md as an invariant (bridge, baseline, item-preservation), a watcher asserts it on every transaction.
2. Implicit time-coupling is a test smell. Observer debounces go through an injected scheduler so tests are deterministic; production gets `setTimeout` passthrough.
3. CRDT races are tested by message ordering, not wall-clock timing. We ship WebSocket-layer pause/resume primitives; `wait(ms)` becomes a code smell in new bridge tests.
4. Example-based coverage is a floor, not a ceiling. A multi-client convergence fuzzer samples the continuous race space that hand-written scenarios cannot enumerate.

#### 7f.1 — Bridge invariant watcher (FR-11)

**Mechanism (per-transaction only, origin-gated).** The watcher fires on every `doc.on('afterTransaction')` whose origin is a `LocalTransactionOrigin` in the enforcing set. Quiescence mode is deliberately not included — see FR-11 acceptance criteria and D14 rationale. Settled-state assertion is the responsibility of `assertAllConverged` (FR-14), where the test author knows at which point in the scenario "everything should have caught up."

```ts
// packages/app/tests/integration/test-harness.ts
//
// Enforcing origins are the production LocalTransactionOrigin OBJECT references,
// not strings. Y.js transaction matching (`Set.has(tx.origin)`) is identity-based
// for object origins; a string literal `'file-watcher'` would NEVER match the
// actual production transaction origin object from external-change.ts (verified
// audit-findings H1). Precedent #1 requires origins to be LocalTransactionOrigin
// objects; the watcher type reinforces this.
//
// This requires exporting FILE_WATCHER_ORIGIN from external-change.ts and
// exporting ROLLBACK_ORIGIN from api-extension.ts (or migrating both to a shared
// `packages/server/src/origins.ts` module) — SCOPE additions in §13.
const BRIDGE_ENFORCING_ORIGINS: Set<LocalTransactionOrigin> = new Set([
  ORIGIN_TREE_TO_TEXT,
  ORIGIN_TEXT_TO_TREE,
  AGENT_WRITE_ORIGIN,
  FILE_WATCHER_ORIGIN,     // object ref, not string — from external-change.ts:57-61
  ROLLBACK_ORIGIN,          // object ref — from api-extension.ts:50-54. V0-16 rollback
                            // is a live shipped surface; any rollback tx must leave the
                            // bridge invariant satisfied.
  // intentionally excludes undefined (local WYSIWYG typing — bridge transiently
  // violated until Observer A reconciles, which produces its own ORIGIN_TREE_TO_TEXT tx)
]);

export function attachBridgeInvariantWatcher(
  doc: Y.Doc,
  opts: {
    onViolation?: (info: InvariantViolation) => void;
    enforcingOrigins?: Set<LocalTransactionOrigin>;
  } = {},
): () => void {
  const fragment = doc.getXmlFragment('default');
  const ytext = doc.getText('source');
  const enforcing = opts.enforcingOrigins ?? BRIDGE_ENFORCING_ORIGINS;

  const checkInvariant = (origin: LocalTransactionOrigin): void => {
    const ytextNorm = stripTrailingWhitespace(ytext.toString());
    const fragMd = prependFrontmatter(
      getFrontmatter(doc) ?? '',
      mdManager.serialize(yXmlFragmentToProsemirrorJSON(fragment)),
    );
    const fragNorm = stripTrailingWhitespace(fragMd);
    if (ytextNorm === fragNorm) return;
    const info: InvariantViolation = {
      origin,
      ytextSnapshot: ytext.toString(),
      fragmentMdSnapshot: fragMd,
      unifiedDiff: diffLines(ytextNorm, fragNorm).map(/* ... */).join('\n'),
      stack: new Error().stack,
    };
    opts.onViolation?.(info);
    throw new BridgeInvariantViolationError(info);
  };

  const afterTx = (tx: Y.Transaction): void => {
    // Identity match: tx.origin must be the exact object ref from the enforcing set.
    // Undefined / provider / local-typing origins are deliberately not enforced here —
    // their invariant-satisfaction comes via a subsequent ORIGIN_TREE_TO_TEXT tx
    // from Observer A's reconciliation. Settled-state assertion for "Observer A
    // never fired" scenarios is covered by assertAllConverged (FR-14), not by a
    // quiescence timer in this watcher.
    if (enforcing.has(tx.origin as LocalTransactionOrigin)) {
      checkInvariant(tx.origin as LocalTransactionOrigin);
    }
  };

  doc.on('afterTransaction', afterTx);
  return () => {
    doc.off('afterTransaction', afterTx);
  };
}
```

**Integration:** `createTestClient()` calls `attachBridgeInvariantWatcher(doc)` by default. Client cleanup detaches. Tests that deliberately drive divergence (Bug-D skip-guarded; fuzzer mid-op) pass `skipInvariantWatcher: true`.

#### 7f.2 — Origin-preservation probe (FR-12)

```ts
export function createItemOriginProbe(
  ytext: Y.Text,
  opts: { trackedOrigins: Array<unknown>; captureTimeout?: number },
): ItemOriginProbe {
  const um = new Y.UndoManager(ytext, {
    trackedOrigins: new Set(opts.trackedOrigins),
    captureTimeout: opts.captureTimeout ?? 0,
  });
  const captures = new Map<string, { stackLength: number; content: string }>();
  return {
    recordCapture(label = 'default') {
      captures.set(label, {
        stackLength: um.undoStack.length,
        content: ytext.toString(),
      });
    },
    assertCaptureIntact(label = 'default') {
      const cap = captures.get(label);
      if (!cap) throw new Error(`No capture recorded for label: ${label}`);
      if (um.undoStack.length < cap.stackLength) {
        throw new Error(
          `Origin probe: tracked Items disappeared from UM stack. ` +
          `Expected >=${cap.stackLength}, got ${um.undoStack.length}.`,
        );
      }
    },
    capturedContent: () => ytext.toString(),
    undoStackLength: () => um.undoStack.length,
    cleanup: () => um.destroy(),
  };
}
```

**Usage precedent (V0-14-compatible):** trackedOrigins accepts `LocalTransactionOrigin` objects directly — same shape V0-14's server-side UM will use. Tests that use string origins are upgraded as a side effect.

#### 7f.3 — Server-side state inspector (FR-13)

```ts
export type ServerDocState = {
  ytext: Y.Text;
  fragment: Y.XmlFragment;
  md: string;         // body only (no frontmatter)
  fullMd: string;     // frontmatter + body
  frontmatter: string;
  metaMap: Y.Map<unknown>;
  activityMap: Y.Map<unknown>;
  connectionCount: number;
};

export function getServerState(
  server: TestServer,
  docName: string,
): ServerDocState | null {
  // Encapsulates (server.instance as any).hocuspocus.documents.get()
  // Typed, version-resilient, one place to update if Hocuspocus changes internals.
}
```

All existing `(server.instance as any).hocuspocus.documents.get(...)` direct accesses migrate to this helper (grep-verified zero direct accesses in tests post-refactor).

#### 7f.4 — Multi-client factory + convergence assert (FR-14)

```ts
export async function createTestClients(
  port: number,
  opts: { count: number; docName?: string; perClientOptions?: Partial<CreateTestClientOptions> },
): Promise<TestClient[]> {
  const docName = opts.docName ?? `test-${randomUUID()}`;
  return Promise.all(
    Array.from({ length: opts.count }, (_, i) =>
      createTestClient(port, docName, { ...opts.perClientOptions, clientIndex: i }),
    ),
  );
}

export async function assertAllConverged(
  clients: TestClient[],
  opts: { timeout?: number; pollIntervalMs?: number } = {},
): Promise<void> {
  const timeout = opts.timeout ?? 2000;
  const pollMs = opts.pollIntervalMs ?? 50;
  const start = Date.now();
  while (Date.now() - start < timeout) {
    const ytexts = clients.map(c => c.ytext.toString());
    const fragMds = clients.map(c => serializeFragment(c.fragment));
    if (ytexts.every(t => t === ytexts[0]) && fragMds.every(m => m === fragMds[0])) {
      // Also verify bridge invariant on each — no divergence between representations.
      clients.forEach(c => assertBridgeInvariantSync(c.ytext, c.fragment));
      return;
    }
    await wait(pollMs);
  }
  throw new ClientConvergenceError(buildPerClientDiff(clients));
}
```

Multi-client becomes the default shape. `createTestClient` remains for the single-client case.

#### 7f.5 — Observer scheduler DI (FR-15)

```ts
// packages/app/src/editor/observers.ts
//
// Scheduler interface — concrete Node/browser timer handle return type.
// NOT `unknown`: the existing `debounceA: ReturnType<typeof setTimeout> | null`
// declaration at observers.ts:300 stays intact, no cast at call sites (audit M6).
export interface Scheduler {
  setTimeout: (cb: () => void, ms: number) => ReturnType<typeof setTimeout>;
  clearTimeout: (handle: ReturnType<typeof setTimeout>) => void;
}

// Default scheduler: arrow-wrapped passthrough. Arrow wrapping avoids any
// method-binding ambiguity (plain `globalThis.setTimeout` captured by reference
// would rebind `this` depending on the caller; arrow preserves lexical behavior
// and Node/browser runtimes expect `setTimeout` called standalone).
const defaultScheduler: Scheduler = {
  setTimeout: (cb, ms) => globalThis.setTimeout(cb, ms),
  clearTimeout: (handle) => globalThis.clearTimeout(handle),
};

export interface ObserverDeps {
  // ... existing fields (doc, xmlFragment, ytext, mdManager, schema, onSyncError, onMergeFailed) ...
  /** Optional scheduler injection for deterministic testing.
   *  Default: arrow-wrapped passthrough to globalThis.setTimeout/clearTimeout.
   *  Production: no behavioral difference from today's bare `setTimeout` calls.
   *  Tests: inject createManualScheduler() for synchronous flush. */
  scheduler?: Scheduler;
}

// Inside setupObservers:
const sched: Scheduler = deps.scheduler ?? defaultScheduler;
// All setTimeout/clearTimeout calls in runObserverASync + Observer B's typing
// defer use sched.setTimeout / sched.clearTimeout.
```

Test helper:

```ts
export interface ManualScheduler extends Scheduler {
  flush(): void;                                     // fire all pending synchronously
  advanceTime(ms: number): void;                     // fire callbacks due within ms
  pending(): ReadonlyArray<{ id: number; dueAt: number }>;
}

export function createManualScheduler(): ManualScheduler {
  type Entry = { id: number; cb: () => void; dueAt: number };
  const queue: Entry[] = [];
  let now = 0;
  let nextId = 1;
  // Handle type alignment: we cast the numeric id at the scheduler-boundary
  // where we know we're in a test context. Call sites (observers.ts) see the
  // public `ReturnType<typeof setTimeout>` type without needing any cast.
  return {
    setTimeout: (cb, ms) => {
      const id = nextId++;
      queue.push({ id, cb, dueAt: now + ms });
      return id as unknown as ReturnType<typeof setTimeout>;
    },
    clearTimeout: (handle) => {
      const id = handle as unknown as number;
      const idx = queue.findIndex(e => e.id === id);
      if (idx >= 0) queue.splice(idx, 1);
    },
    advanceTime(ms) {
      now += ms;
      const due = queue.filter(e => e.dueAt <= now);
      due.forEach(e => { queue.splice(queue.indexOf(e), 1); e.cb(); });
    },
    flush() { while (queue.length) { const e = queue.shift()!; e.cb(); } },
    pending: () => queue.map(({ id, dueAt }) => ({ id, dueAt })),
  };
}
```

**Architectural precedent:** observers have a scheduler dependency, not a global `setTimeout` dependency. Extends existing DI discipline in `ObserverDeps` (`mdManager`, `schema`, `onSyncError`, `onMergeFailed` are already injected). Future time-sensitive subsystems (persistence debounce, CC1 broadcaster debounce, file-watcher debounce) adopt the same shape when next touched — the precedent propagates organically, not via blanket migration.

#### 7f.6 — Network-layer sync control (FR-16)

New file `packages/app/tests/integration/network-control.ts`. Minimal-surface WebSocket polyfill wrapper passed to `HocuspocusProvider`:

```ts
export class ControllableWebSocket implements WebSocket {
  private inner: WebSocket;
  private inboundQueue: MessageEvent[] = [];
  private paused = false;

  pauseInbound(): void { this.paused = true; }
  resumeInbound(): void {
    this.paused = false;
    while (this.inboundQueue.length) {
      const msg = this.inboundQueue.shift()!;
      this.deliverInbound(msg);
    }
  }

  // WebSocket interface implementation — proxy all operations to this.inner,
  // but intercept onmessage to funnel through inboundQueue when paused.
}
```

Exposed on TestClient:

```ts
client.pauseSync();
await doSomething();
client.resumeSync();
```

That's the entire API for v1. `delaySync(ms)`, `dropInbound(pred)`, `inspectSyncQueue()` land in follow-up specs when a concrete reproducer motivates them — see §12 "extend FR-16 sync control surface as new race scenarios appear."

Opt-in: `createTestClient(port, docName, { syncControl: true })` provides the wrapped WebSocket; default is passthrough (zero behavior change for tests that don't opt in).

#### 7f.7 — Randomized multi-client bridge-convergence stress test (FR-17)

New file `packages/app/tests/stress/bridge-convergence.fuzz.test.ts`. Per D17: this is randomized stress testing with invariant oracles, not PBT in the CRDT-primitive sense. The mechanism (random op interleavings + invariant checks) is what Y.js/Automerge test suites share; the theoretical framing is different (they verify state-machine convergence; we verify application-bridge convergence).

```ts
// Generator — v1 op set. Every kind is backed by a primitive this spec ships.
// delay/drop/inspect are deferred (FR-16 minimal surface).
type Op =
  | { kind: 'wysiwyg-type'; clientIdx: number; text: string; position: number }
  | { kind: 'source-type'; clientIdx: number; text: string; position: number }
  | { kind: 'agent-write'; text: string; position: 'append' | 'prepend' | 'replace' }
  | { kind: 'agent-patch'; find: string; replace: string }
  | { kind: 'external-change'; newContent: string }   // via applyExternalChange on server
  | { kind: 'sync-pause'; clientIdx: number }
  | { kind: 'sync-resume'; clientIdx: number }
  | { kind: 'wait'; ms: number };                      // random short waits to exercise debounce boundaries

function generateOps(rng: Rng, clientCount: number, opCount: number): Op[] {
  // Draws from the distribution biased toward sync-* ops (~30%) to exercise races.
  // Text is short to avoid roundtrip fidelity noise.
}

test.each(Array.from({ length: 100 }, (_, i) => i))('bridge-convergence seed %d', async (offset) => {
  const seed = Number(process.env.STRESS_FUZZ_SEED ?? (Date.now() + offset));
  const rng = createRng(seed);
  const port = await getFreePort();
  const server = await createTestServer({ port });
  try {
    const clientCount = 2 + (seed % 4);  // 2..5
    const clients = await createTestClients(port, {
      count: clientCount, perClientOptions: { syncControl: true },
    });
    const agentProbes = clients.map(c =>
      createItemOriginProbe(c.ytext, { trackedOrigins: [AGENT_WRITE_ORIGIN] }),
    );
    try {
      const ops = generateOps(rng, clientCount, 50);
      for (const op of ops) { await applyOp(op, clients, port, rng); }

      // Quiesce: resume any paused clients, flush schedulers, drain network, wait for CRDT.
      clients.forEach(c => c.resumeSync());
      await assertAllConverged(clients, { timeout: 5000 });
      agentProbes.forEach(p => p.assertCaptureIntact());
    } catch (err) {
      writeFuzzSnapshot(seed, { ops, error: err, clientStates: snapshotClients(clients) });
      throw err;
    } finally { clients.forEach(c => c.cleanup()); agentProbes.forEach(p => p.cleanup()); }
  } finally { await server.cleanup(); }
});

// Separate test — D18 coverage gate. Fails CI if a write surface has no op.
test('fuzzer op-set covers every bridge write surface', () => {
  const writeSurfaces = [
    'agent-write', 'agent-write-md', 'agent-patch',
    'observer-a-sync', 'observer-b-sync',
    'file-watcher', 'rollback',
    // V0-14 adds: 'agent-undo' — when Miles's spec lands, this entry must exist
    // and a matching op kind must exist in the generator.
  ];
  const opKinds = listOpKinds();  // enumerates Op type variants via the generator
  const missing = writeSurfaces.filter(s => !opKinds.some(k => isCoveredBy(s, k)));
  expect(missing).toEqual([]);
});
```

**CI behavior (D17):** 25 seeds on PR (fast feedback), 100 seeds on `main` / nightly. Seed snapshot on failure is uploaded as a CI artifact. Replay with `STRESS_FUZZ_SEED=<n> bun test packages/app/tests/stress/bridge-convergence.fuzz.test.ts`.

**Validation gate (D17):** FR-17 is only accepted as load-bearing once validated against the pre-fix codebase — running the fuzzer before FR-1/FR-3 land must reproduce Bug-A, Bug-B, Bug-C within ≤25 seeds each. If it doesn't, the op generator is under-sampling or the oracle is under-specified; in either case the claim "this fuzzer would have caught the 4 bugs" is wrong and needs fixing before finalization.

**Op-set growth discipline (D18 + precedent #11):** the coverage-gate test above ensures new bridge surfaces don't ship without a corresponding op. When V0-14 adds agent-undo, it extends the generator; the coverage gate makes the extension non-optional. This converts "extensible later" from a documented norm into a programmatic constraint.

## 8) Open Questions

| ID | Question | Type | Priority | Status |
|---|---|---|---|---|
| OQ-1 | Bug-A fix option | Technical | P0 | **RESOLVED → D1 LOCKED.** XmlFragment-authoritative composition (§7a). Options (b) propagation-wait and (c) Y.Text-only write rejected (see D2/D3). |
| OQ-2 | Bug-B fix option | Technical | P0 | **RESOLVED → D4 LOCKED.** Drift-catcher inside existing early-exit (§7b). Options (a) rearm-debounce and (c) orthogonal-detector rejected — simpler mechanism available (D5). |
| OQ-3 | Unified vs split | Architectural | P0 | **RESOLVED → D6 LOCKED.** Split. Shared utility (`applyByPrefixSuffix`) + shared precedent (#10), but two independent implementations. The bugs have different triggers (server agent write vs. client remote tx) and different fix sites. |
| OQ-4 | Observer B / file-watcher interaction | Technical | P0 | **RESOLVED.** `P1` reproducer confirms file-watcher unaffected. Observer B reads Y.Text to apply; under the fixes Y.Text stays consistent with XmlFragment, so Observer B's early-exit at `observers.ts:442` correctly fires in the expected cases. |
| OQ-5 | V0-14 compatibility | Cross-cutting | P0 | **RESOLVED — with Bug-D handoff.** Traced end-to-end in `evidence/v0-14-interaction.md` (updated). The **forward agent-write flow** is safe by design under Bug-A + Bug-B fixes (user+agent concurrent writes preserve both contributions, UM sees agent-origin Items only, bridge invariant holds). The **agent-undo flow** inherits Bug-D from the current `syncTextToFragment`-style rebuild pattern — this spec deletes that mechanism (D9, FR-9), rewrites the misleading STOP rule (FR-9), commits the regression test skip-guarded (FR-10), and documents the fix template (§7e). V0-14 implements the undo handler per the handoff; origin/topology/semantics are its design calls (D12). |
| OQ-6 | `applyExternalChange` as precedent | Technical | P0 | **RESOLVED → D7 LOCKED.** It IS the precedent. Same structural shape (authoritative input → updateYFragment → Y.Text mirror), but `applyExternalChange`'s mirror uses wholesale Y.Text replace (acceptable there because file-watcher origin isn't UM-tracked). Agent-write needs the `applyByPrefixSuffix` mirror to preserve user Y.Text Items that pre-existed the agent write. |
| OQ-7 | DMP on tree vs string | Technical | P0 | **RESOLVED.** Not needed. `updateYFragment`'s structural diff (see `evidence/updateYFragment-is-structural-diff.md`) is the tree-level analog of `applyByPrefixSuffix`. We don't need string-level DMP in `agent-sessions.ts` — composing the delta at the markdown level then relying on `updateYFragment`'s structural preservation is sufficient and cleaner. |
| OQ-8 | Should `syncTextToFragment` be deleted entirely? | Technical | P0 | **RESOLVED → D9 LOCKED (delete).** Transitive-dependency trace (§/explore) verified zero reachable consumers after this spec's Bug-A migration: no undo scaffold exists (V0-16 TQ13), no adjacent subsystem depends on it, no dynamic dispatch. The "semantic is correct for undo" argument doesn't survive scrutiny — Bug-D empirically shows the rebuild-from-Y.Text pattern destroys concurrent user content. Delete it (FR-9) and hand off the XmlFragment-authoritative pattern template to V0-14 (§7e). |

## 9) Decision Log

| ID | Decision | Type | Status | Rationale |
|---|---|---|---|---|
| D1 | Bug-A fix is "XmlFragment-authoritative composition" — agent-write handlers read current XmlFragment, compose agent's delta at the markdown level, updateYFragment, mirror Y.Text via applyByPrefixSuffix | Technical | LOCKED | `evidence/updateYFragment-is-structural-diff.md` shows updateYFragment preserves Items via structural diff; using XmlFragment as baseline closes the race. Cleanest mapping to existing `applyExternalChange` precedent (D7). Preserves PR #128's origin invariant. |
| D2 | REJECT Bug-A option-b (propagation-wait) | Technical | LOCKED | Requires coordination — server stalls agent write until client CRDT has propagated. Introduces latency and a new failure mode (WebSocket stall → agent timeout). Greenfield rejection: solve in pure CRDT mutation flow, not by adding synchronization. |
| D3 | REJECT Bug-A option-c (Y.Text-only server write, let Observer B rebuild) | Technical | LOCKED | Breaks server-side XmlFragment authoritative consumers (`persistence.ts` reads XmlFragment for disk writes — would write stale XmlFragment). Also requires every client to do the rebuild work; server's single rebuild is more efficient. |
| D4 | Bug-B fix is "drift-catcher inside existing early-exit" — when `lastSyncedXmlMd === md`, additionally check Y.Text drift and reconcile via applyByPrefixSuffix under ORIGIN_TREE_TO_TEXT | Technical | LOCKED | Minimal code change (~6 new lines). Same origin (`ORIGIN_TREE_TO_TEXT`) so V0-14's trackedOrigins semantics unchanged. applyByPrefixSuffix preserves Items for any matching prefix/suffix in Y.Text. |
| D5 | REJECT Bug-B option-c (orthogonal drift detector timer) | Technical | LOCKED | Timer-based side channel adds new architectural surface + race conditions with ongoing transactions. The drift-catcher inside the observer callback is synchronous and race-free. |
| D6 | Bugs A and B split into two fixes with one shared utility and one shared precedent — NOT unified into a single mechanism | Architectural | LOCKED | Different trigger contexts (server agent write vs. client remote tx). Different fix sites. Sharing `applyByPrefixSuffix` utility is the right level of reuse; sharing a mechanism would force them through a common abstraction that fits neither well. |
| D7 | `applyExternalChange` pattern (updateYFragment + Y.Text mirror) is the architectural precedent for Bug-A fix. Differs only in the Y.Text mirror strategy: `applyExternalChange` uses wholesale replace (acceptable for file-watcher origin); agent-write uses applyByPrefixSuffix (necessary to preserve non-agent Y.Text Items). | Technical | LOCKED | `external-change.ts:30-63` is the existing correct pattern. Bug-A fix is the same shape with a refined mirror step. |
| D8 | `applyByPrefixSuffix` extracted to `packages/core/src/utils/apply-by-prefix-suffix.ts` — shared between client (`observers.ts` Path B + drift-catcher) and server (`agent-sessions.ts` agent write) | Technical | LOCKED | One implementation, two consumers. `packages/core` already has "no Node.js server deps" constraint — this utility is browser + Node compatible (uses only Y.Text public API). Matches shared-logic precedent in CLAUDE.md (precedent #4). |
| D9 | `syncTextToFragment` deleted entirely (function + export). Not kept for undo/redo callers. | Technical | LOCKED | Transitive-dependency trace confirmed zero reachable consumers post-Bug-A migration: no undo scaffold exists (V0-16 TQ13 removed it), no adjacent subsystem calls it, no re-export outside this package is consumed, no dynamic dispatch. Additionally, empirical reproduction (Bug-D, see §7e) showed the rebuild-from-Y.Text pattern destroys concurrent user content — keeping the function would actively direct V0-14's implementer toward the known-buggy pattern. Deletion + STOP-rule rewrite (FR-9) + skip-guarded regression test (FR-10) + documented fix template (§7e) constitutes the correct handoff. |
| D10 | AGENTS.md precedent #10: "XmlFragment is authoritative for markdown state; Y.Text mirrors it under minimal mutation" | Documentation | LOCKED | Codifies the architectural discipline for this repo. Cross-refs precedent #9 (PR #128's origin-preservation patterns). Guides future server-side bridge work — including V0-14's agent-undo handler (§7e template). |
| D11 | No new Y.Map, no new CRDT types, no new side channels | Technical | LOCKED | Same discipline as PR #128 D14. All fixes use existing public API + existing origin strings + existing type shapes. |
| D12 | Bug-D (post-undo XmlFragment-rebuild destroys concurrent user content) deferred to V0-14 — not implemented in this spec, but handed off with dead-code-deleted + pattern-documented + regression-test-gated | Architectural | LOCKED | Bug-D empirically confirmed (both synthetic D-iso-1 and V0-14-flow D-iso-2). But its fix is design-coupled to V0-14's undo contract, not a pure bridge invariant: (a) undo semantics — snapshot-restore vs. contribution-scoped — is a product call; (b) UM topology (server-side per-agent, client-local, hybrid) is V0-14's design; (c) post-undo-rebuild origin must not be `AGENT_WRITE_ORIGIN` (infinite capture loop) — V0-14's call; (d) broadcast model is V0-14's call. Writing `applyAgentUndo` now is speculative infrastructure with no consumer. The contributions this spec makes: `syncTextToFragment` deleted so V0-14 cannot inherit the buggy mechanism; CLAUDE.md STOP rule rewritten to point at the XmlFragment-authoritative pattern (FR-9); `bug-d-v0-14-agent-undo-under-concurrent-typing.test.ts` (renamed from diagnostic `bug-d-isolation-repro.test.ts` per FR-10) committed skip-guarded so V0-14's delivery is gated on passing it; `evidence/bug-d-mechanism.md` documents the fix shape. Two reasonable staff engineers could disagree on Bug-D's fix (snapshot vs. contribution-scoped undo); the surfaces that WOULDN'T disagree (delete dead code, rewrite the misleading STOP rule, commit empirical evidence as a gated test) are all done now. |
| D13 | Miles's PR #134 (attribution/identity threading) has no architectural dependency on `syncTextToFragment`; either merge order works. | Coordination | LOCKED | PR #134 calls `syncTextToFragment` in the 3 agent-write handlers only because those calls exist on main — he's preserving the status quo while threading `agentId`/`agentName`. He does not add new callers, build anything that requires it to exist, or rely on its side effect. If this spec lands first, Miles rebases: the 3 raw `transact` blocks collapse into `applyAgentMarkdownWrite({ agentId, agentName, content, position })` — cleaner than threading identity around 3 separate blocks. If #134 lands first, this spec rebases: the identity args thread into the new `applyAgentMarkdownWrite` helper signature. No blocking dependency either direction. Miles's PR #134 D7 LOCKED: "Per-agent undo: OUT OF SCOPE. Deferred to V0-14" — aligns with this spec's D12. |
| D14 | Bridge invariant is auto-enforced via a per-transaction watcher (no quiescence mode) attached by default in test clients; settled-state assertion is the responsibility of `assertAllConverged` (FR-14) at test-author-chosen points; manual `assertBridgeInvariant` calls become opt-in reinforcement, not primary guarantee (FR-11) | Architectural | LOCKED | The bridge invariant is named in CLAUDE.md as an architectural invariant (#1). Leaving it to per-test manual assertions is fragile: all 4 bugs in this spec violated it silently because at least one test forgot to assert, or asserted at the wrong point. Auto-enforcement closes the loop: if an enforcing-origin transaction leaves the bridge invariant violated, the test fails loudly with origin + diff. **Per-tx only, no quiescence:** a quiescence mode was considered (400ms timer after last tx) but rejected — it introduces an implicit wall-clock coupling (exactly what D15/D16 reject) and would inject CI flakiness under runner-latency variance. The case quiescence would have covered ("Observer A never fired") is genuinely diagnostic but better addressed by `assertAllConverged(clients, { timeout })` (FR-14), where the test author controls the settled-state assertion point. Enforcing origins must be `LocalTransactionOrigin` objects per precedent #1 — string literals would silently fail to match production tx.origin objects (audit Finding 1). Sets the precedent: named invariants are enforced by watchers; settled-state is asserted at test-author-chosen points, not via implicit timers. |
| D15 | Observer debounces are dependency-injected via `ObserverDeps.scheduler`; production defaults to global `setTimeout`/`clearTimeout` passthrough; tests inject a manual scheduler for deterministic flush (FR-15) | Architectural | LOCKED | Implicit time-coupling is the most common source of test flakiness in bridge tests. Every timing-race test uses `wait(ms)` as a proxy for "debounce fires" — approximate, flaky, opaque. Scheduler DI converts implicit time dependency into an explicit dependency on an injected abstraction. Production behavior is unchanged (passthrough default). Tests become deterministic: `scheduler.flush()` replaces `wait(100)`. Sets the architectural precedent: subsystems with time-sensitivity depend on injected schedulers, not global `setTimeout`. Aligns with the broader DI discipline in `ObserverDeps` (mdManager, schema, onSyncError are already injected). |
| D16 | CRDT network races are tested via message-ordering control (WebSocket polyfill wrapper exposing `pauseSync`/`resumeSync` only for v1), not wall-clock timing (FR-16). `delaySync`/`dropInbound`/`inspectSyncQueue` deliberately deferred until a concrete reproducer motivates them. | Architectural | LOCKED | Production CRDT races live in "what order did messages arrive in" — not in absolute timing. The Bug-C real-reachability reproducer had to disable a function inside running code to simulate "Peer B's Observer A delayed," because there was no first-class way to control CRDT sync delivery. That's not a production-shape race. Message-ordering control (pause/resume queued inbound WebSocket messages) matches what Hocuspocus-equivalent test suites use. Minimal surface for v1: all 4 diagnostic reproducers need only pause/resume. Additional methods (delay/drop/inspect) are speculative and would create a circular dependency with FR-17's fuzzer op generator. Precedent: bridge tests reproduce races structurally (ordering) not temporally (waits). `wait(ms)` in new bridge-convergence tests becomes a smell; existing `wait()` usage in non-bridge tests is untouched. |
| D17 | Bridge convergence is **randomized stress tested with oracles** (multi-client random-operation fuzzer checking bridge invariant + client convergence + origin preservation) in addition to example-based integration tests (FR-17). Minimal initial op set — extensible as new bridge surfaces appear. AGENTS.md precedent #11 codifies this. | Architectural | LOCKED | Example-based testing enumerates scenarios we've thought of; the 4 bugs this spec found are 4 samples from a continuous race space. Randomized multi-client stress testing with invariant oracles samples the rest. **Not property-based testing in the theoretical CRDT-primitive sense** (Y.js core, Riak DT PBT-test their CRDT state machines — op-order convergence of AW-maps, RGA, etc. — which is a different discipline from testing application-layer bridges). The mechanism is the same (random op interleavings + invariant checks); the claim of theoretical-precedent alignment would be conflation. Initial op set is deliberately minimal — appending new op types when new bridge surfaces land is cheaper than designing the generator maximally up front, *provided* precedent #11 is enforced (see D18). Validation: fuzzer must catch all 4 known bugs against the pre-fix codebase within ≤25 seeds before being accepted as load-bearing. |
| D18 | Fuzzer op-set coverage is a CI-enforced invariant, not a documented norm. A coverage check in `bridge-convergence.fuzz.test.ts` enumerates every named bridge write surface (agent-write, agent-write-md, agent-patch, Observer A, Observer B, file-watcher, rollback, future V0-14 agent-undo) and fails CI if any surface has no corresponding generator op. | Architectural | LOCKED | D17's "extensible as new surfaces appear" is an "extensible later" precedent — a class known to ossify (engineers add the bug to the fuzzer when it fires in production, but rarely extend proactively). A programmatic coverage gate converts the norm into a constraint at ~30 lines of test code, cheap insurance. Comparable to the existing `sharedExtensions` drift-protection (CLAUDE.md constraint: drift causes silent corruption) — bridge surfaces without fuzzer ops are the analogous drift. |

## 10) Assumptions

| ID | Assumption | Confidence | Verification plan |
|---|---|---|---|
| A1 | Bug-A is deterministic | HIGH | Confirmed via `P0` + `P0-stress` (100% reproduction). |
| A2 | Bug-B is self-healing under asynchronous typing | MEDIUM | `evidence/bug-b-mechanism.md` argues self-heal via next local edit. Verified in `CONTROL` test that stuck state persists only without subsequent local edits. Production rate unmeasured. Mitigation: drift-catcher deterministically reconciles. |
| A3 | File-watcher path unaffected | HIGH | `P1` reproducer passes today. Bug-A fix doesn't modify `external-change.ts`. |
| A4 | V0-14 per-agent UM `trackedOrigins: new Set([AGENT_WRITE_ORIGIN])` (object ref) semantics preserved | HIGH | Traced in `evidence/v0-14-interaction.md`. All new Items under Bug-A fix go under `AGENT_WRITE_ORIGIN` object ref; drift-catcher Items under `ORIGIN_TREE_TO_TEXT` object ref. No new origin strings introduced — precedent #1 (typed transaction origins) holds throughout. Y.js UndoManager matches `trackedOrigins` via `Set.has(tx.origin)` which is identity-based for objects; string `'agent-write'` in the set would never match the `AGENT_WRITE_ORIGIN` object and the UM would silently capture nothing. |
| A5 | `updateYFragment`'s structural diff correctly preserves matching children | HIGH | Inspected y-tiptap source (`evidence/updateYFragment-is-structural-diff.md`). Left/right scan with equality check; unmatched middle gets recursive update or delete+insert. Matches behavior of `applyExternalChange` + all PM-tree consumers in the codebase. |
| A6 | Markdown composition via string concatenation + reparse is idempotent on roundtrip for supported constructs (FR-1 §7a position logic) | HIGH | Relies on PR #128's I1 identity invariant plus the markdown pipeline's existing roundtrip guarantees. Same roundtrip is already used in `applyExternalChange`. |
| A7 | Client Observer A's debounce fires reliably within 50-100ms of last local tx in production | HIGH | Existing debounce mechanism; no change to it. |

## 11) Risks

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| `updateYFragment` semantic edge case — a pathological PM node structure causes structural diff to mis-align, stomping adjacent content | Low | Medium | Reproducer file runs against all existing production flows. Fuzz (existing `observers.fuzz.test.ts`) additionally exercises randomized Path B — extend with the new drift-catcher scenario. |
| applyByPrefixSuffix edge case on unicode boundary (splits a multi-byte codepoint between prefix and insert) | Low | Low | Y.Text operates on UTF-16 code units; `applyByPrefixSuffix` uses JS string indexing (UTF-16 code unit indexing). All existing tests in `observers.test.ts` exercise ASCII + some multi-byte; add dedicated unit test for BMP + supplementary plane boundary in `packages/core/src/utils/apply-by-prefix-suffix.test.ts`. |
| Drift-catcher fires too aggressively (e.g., during an Observer-B-induced baseline refresh at line 455 where `lastSyncedXmlMd = prependFrontmatter(frontmatter, currentBody)`) causing a spurious sync round | Low | Low | Observer B's refresh at `observers.ts:455` fires only when XmlFragment already serializes to match Y.Text body — in that case the drift-catcher's `currentText === md` check early-exits without mutation. |
| V0-14 re-introduces the buggy rebuild-from-Y.Text pattern when wiring per-agent UM (Bug-D recurrence) | Low-Medium | High if it happens | `syncTextToFragment` deleted in this spec (FR-9, D9) so V0-14 cannot inherit the mechanism. CLAUDE.md + AGENTS.md STOP rule rewritten to point at the `applyAgentMarkdownWrite` template and explicitly warn against rebuild-from-Y.Text (FR-9). `bug-d-v0-14-agent-undo-under-concurrent-typing.test.ts` (renamed per FR-10) committed skip-guarded — V0-14 unskips and must pass it. `evidence/bug-d-mechanism.md` documents the fix shape with V0-14 pickup points. Miles coordination per D13 ensures alignment. |
| applyByPrefixSuffix extraction causes a breaking import in some unmentioned consumer | Low | Low | grep verifies current usage is only in `observers.ts`. Extraction is additive (new file in core); observers.ts imports from core; no other callers. |
| Bridge invariant watcher (FR-11) fires false positives on an enforcing-origin transaction that legitimately has not yet settled (e.g., Observer B's internal tx observed before a paired Observer A tx completes) | Low | Medium | Per-tx enforcement is origin-gated to `{ ORIGIN_TREE_TO_TEXT, ORIGIN_TEXT_TO_TREE, AGENT_WRITE_ORIGIN, FILE_WATCHER_ORIGIN, ROLLBACK_ORIGIN }` — all object refs per precedent #1. Each of these origins represents a **completed** sync operation that MUST leave the bridge invariant satisfied post-tx (that's the watcher's contract). Local WYSIWYG typing (undefined origin) is correctly excluded — Observer A reconciles later under ORIGIN_TREE_TO_TEXT, and that tx is the one asserted on. During rollout: run the full test suite with the watcher; any failing pre-existing test is either (a) a genuine violation (fix — root cause is the bug the watcher is designed to catch), or (b) a test that intentionally drives divergence (opt-out via `skipInvariantWatcher`). No quiescence timer means no tunable magic number; simplicity beats "belt + suspenders." |
| Observer scheduler DI (FR-15) introduces behavior differences between test (manual scheduler) and production (global setTimeout) — subtle ordering or timing dependency that only surfaces under one scheduler | Low | Medium | Default scheduler is an arrow-wrapped passthrough to `globalThis.setTimeout` / `clearTimeout` — zero behavioral difference from current code (no method-binding ambiguity; Node/browser runtimes see identical calls). Scheduler return type is `ReturnType<typeof setTimeout>` (concrete Timeout handle), not `unknown` — observers.ts's existing `debounceA: ReturnType<typeof setTimeout> \| null` typing is preserved with zero casts at call sites (audit M6 resolution). Manual scheduler implements the same typed contract; internal numeric-id cast is scoped to the scheduler implementation boundary. Existing integration tests (which use the default) must remain green with watcher attached. New unit/integration tests that inject the manual scheduler must also assert end-state invariants (bridge invariant, origin preservation) — any semantic divergence surfaces through oracles, not through test-only code paths. Playwright E2E stays on real `setTimeout` as ultimate cross-check for event-loop semantic gaps. |
| Network control middleware (FR-16) diverges from real WebSocket behavior in subtle ways (e.g., binary frame handling, ping/pong, close codes) causing false passes in tests | Low | Medium | Controllable WebSocket is a proxy — all unrecognized operations delegate to the inner real WebSocket. Intercepts only the inbound `onmessage` path (the minimum surface needed for pause/resume/delay/drop). Outbound is pure passthrough. Integration tests that don't opt in (`syncControl: false` default) use the real WebSocket directly — zero change in default coverage. Playwright E2E always uses real sockets — ultimate cross-check that the control middleware doesn't mask real-socket regressions. |
| PBT convergence fuzzer (FR-17) flakes on CI under runner load (Hocuspocus startup + 2-5 clients + 50 ops × 100 seeds is heavy) | Medium | Low | Fuzzer runs under `bun run check:full:parallel` which already handles heavyweight stress/fuzz suites with appropriate timeouts. Seed snapshots on failure enable deterministic replay — a flake can be re-run with the specific seed to verify (if it passes on replay, it's infra flakiness; if it still fails, it's a real bug). Initial seed count (100) is tunable via env var; start conservative (e.g., 25 seeds in CI, 100+ locally) and tighten as we calibrate. |

## 12) Future Work

- **[Specified — V0-14 scope]** **Bug-D: `applyAgentUndo` for post-undo XmlFragment-authoritative rebuild.** Empirically confirmed (the committed test `bug-d-v0-14-agent-undo-under-concurrent-typing.test.ts` — renamed from the diagnostic `bug-d-isolation-repro.test.ts` per FR-10 — contains both D-iso-1 and D-iso-2 scenarios). Not reachable today; fires the moment V0-14 wires per-agent UM + agent-undo endpoint. This spec has done all the groundwork: dead code deleted (FR-9), STOP rule rewritten (FR-9), regression test committed skip-guarded (FR-10), fix pattern documented (§7e + `evidence/bug-d-mechanism.md`). V0-14 implements the handler; origin/topology/semantics are V0-14's design calls. Acceptance for V0-14: unskip both tests in that file + extend FR-4 to cover agent-undo-with-concurrent-typing + all 3 tests pass. When V0-14 adds the `agent-undo` operation type, it extends FR-17's fuzzer generator to include it — the fuzzer will then sample Bug-D's race space continuously. **V0-14's own spec must list this unskip as a required FR with acceptance criteria** — the `.skip` is a soft gate; the hard gate is the spec-level handoff.
- **[Identified]** Per-character attribution side-table (carried over from PR #128 NG7). Still not required; both fixes here operate with the existing `trackedOrigins` approach.
- **[Identified]** Server-side observability for the bridge (production telemetry). The current `console.warn` diagnostic added in PR #128's FR-7 is client-side. For Bug-A / Bug-D class issues, server-side visibility would help debug any future regressions — e.g., a counter for "agent writes that modified >N lines outside the agent's composition region" as a canary. Test-side observability (FR-11 watcher) is in this spec; production observability is a separate concern.
- **[Identified]** Extend FR-17 fuzzer operation set as new bridge surfaces land. Minimal initial op set is a starting point; new write surfaces (V0-14 agent-undo, future MCP tools, future file-watcher hooks) extend the generator. Per precedent #11 (codified in this spec's AGENTS.md change).
- **[Explored]** XmlFragment event-driven sync (PR #128 NG6). Still out of scope. Current two-path observer architecture + the fixes in this spec are sufficient.

### Implementation ordering (recommended)

Implementation steps are independent where possible, but two dependencies are hard:

1. **FR-13 (`getServerState`) must land before FR-4 test** — FR-4 consumes `getServerState` to attach the UM server-side.
2. **FR-2 (`applyByPrefixSuffix` extraction to core) must land before FR-1 and FR-3** — both consume the extracted utility.

Cleanest bisection-friendly order, each step leaves `bun run check` green:

1. FR-13 `getServerState` (isolated harness addition; no production change)
2. FR-11 bridge invariant watcher (wire into `createTestClient`; verify every existing test stays green with watcher attached — catches any lurking invariant bugs immediately)
3. FR-15 scheduler DI with typed passthrough (production-passthrough change; low risk; enables deterministic FR-17 later)
4. FR-12 origin probe helper (isolated harness addition)
5. FR-14 multi-client factory (isolated harness addition)
6. FR-2 `applyByPrefixSuffix` → core (prerequisite for FR-1, FR-3)
7. FR-1 Bug-A fix + FR-9 `syncTextToFragment` deletion + FR-5 precedent #10 + CLAUDE.md STOP rule rewrite (the main event; all in one commit for coherence)
8. FR-3 Bug-B drift-catcher (small, depends on FR-2)
9. FR-16 network control middleware (minimal pause/resume)
10. FR-4, FR-6, FR-7, FR-8 test consolidation using the full harness (FR-4 uses FR-13 + FR-11 + FR-12 via the server-side UM pattern)
11. FR-10 + FR-17 + D18 coverage gate + AGENTS.md precedent #11 (final — fuzzer validation gate runs against pre-FR-1 codebase via `git stash` + `git stash pop` sanity check; Bug-D test committed `.skip`-guarded)

Each step ends with `bun run check` green. The full suite runs after step 11.

## 13) Agent Constraints

**SCOPE** (strict allowlist):

*Production code changes:*
- `packages/server/src/agent-sessions.ts` — Add `applyAgentMarkdownWrite`. **Delete `syncTextToFragment`** (FR-9) — function body + JSDoc. Import `applyByPrefixSuffix` from `@inkeep/open-knowledge-core`.
- `packages/server/src/api-extension.ts` — Migrate `handleAgentWrite` (line 573), `handleAgentWriteMd` (line 652), `handleAgentPatch` (line 965) from `syncTextToFragment` to `applyAgentMarkdownWrite`. Activity-map writes unchanged. Remove the `syncTextToFragment` import from `./agent-sessions.ts`. **Export `ROLLBACK_ORIGIN`** (currently at lines 50-54, module-private) so FR-11's watcher can include it in the enforcing set — alternatively, move both `ROLLBACK_ORIGIN` and the file-watcher origin into a shared `packages/server/src/origins.ts` module.
- `packages/server/src/external-change.ts` — **Export the file-watcher `LocalTransactionOrigin` object** (currently inline-constructed at lines 57-61) as `FILE_WATCHER_ORIGIN` so FR-11's watcher can reference it by identity. No behavior change; just hoisting the constant.
- `packages/server/src/index.ts` — **Remove `syncTextToFragment` re-export** (FR-9). Add `FILE_WATCHER_ORIGIN` and `ROLLBACK_ORIGIN` re-exports for harness consumption.
- `packages/app/src/editor/observers.ts` — Add drift-catcher to `runObserverASync` at the `lastSyncedXmlMd === md` early-exit per §7b. Import `applyByPrefixSuffix` from `@inkeep/open-knowledge-core` (remove local definition — module-private `applyByPrefixSuffix` at lines 192-211 is deleted). **Add `scheduler?: Scheduler` to `ObserverDeps`** per FR-15; route all `setTimeout`/`clearTimeout` calls (debounce + typing defer) through it; default to global passthrough.

*Shared utilities:*
- `packages/core/src/utils/apply-by-prefix-suffix.ts` — NEW file. `applyByPrefixSuffix` utility per §7c.
- `packages/core/src/utils/apply-by-prefix-suffix.test.ts` — NEW file. Unit tests for the utility.
- `packages/core/src/index.ts` — Export `applyByPrefixSuffix`.

*Test harness infrastructure (FR-11 through FR-17):*
- `packages/app/tests/integration/test-harness.ts` — **Expand** with:
  - `attachBridgeInvariantWatcher(doc, opts)` + `BridgeInvariantViolationError` type (FR-11). Wired by default into `createTestClient`. Opt-out via `{ skipInvariantWatcher: true }`.
  - `createItemOriginProbe(ytext, { trackedOrigins })` with `recordCapture` / `assertCaptureIntact` / `capturedContent` / `cleanup` (FR-12).
  - `getServerState(server, docName)` returning `ServerDocState` (FR-13).
  - `createTestClients(port, { count, docName?, perClientOptions? })` + `assertAllConverged(clients, { timeout })` (FR-14).
  - `createManualScheduler()` returning `ManualScheduler` with `flush` / `advanceTime` / `pending` (FR-15 test helper).
- `packages/app/tests/integration/network-control.ts` — NEW file. `ControllableWebSocket` wrapper + `TestClient` integration via `{ syncControl: true }` option (FR-16).
- `packages/app/tests/stress/bridge-convergence.fuzz.test.ts` — NEW file. Property-based multi-client convergence fuzzer (FR-17). Uses FR-11, FR-12, FR-14, FR-15, FR-16 primitives.

*Test file changes (consume the new harness):*
- `packages/app/tests/integration/observer-a-baseline-absorption-repro.test.ts` — Rename to `bridge-convergence-regression.test.ts`. All 4 tests must pass post-fix. Refactor to use new harness primitives (invariant watcher by default; origin probe where relevant).
- `packages/app/tests/integration/bridge-matrix.test.ts` — New FR-4 test per §7d (agent write + user concurrent typing preserves both + bridge invariant; uses `createItemOriginProbe`). New M1+ tests exercising `pauseSync`/`resumeSync` for deterministic peer race scenarios.
- `packages/app/tests/integration/bug-d-isolation-repro.test.ts` — **Rename to `bug-d-v0-14-agent-undo-under-concurrent-typing.test.ts`. Convert all `test(...)` to `test.skip(...)`** with top-of-file comment referencing §7e and `evidence/bug-d-mechanism.md` (FR-10). **Test content unchanged in this spec** — committed as-is as a skip-guarded regression gate. V0-14 owns the decision whether to refactor the test onto new harness primitives (FR-11..FR-14) when unskipping; this spec takes no position (latitude: DELEGATED to V0-14).
- `packages/app/tests/integration/bug-a-mechanism-isolation.test.ts` — Commit as-is. Passes post-fix; permanent regression gate. Use `getServerState` helper if trivial migration available.
- `packages/app/tests/integration/bug-c-real-reachability.test.ts` — Commit as-is. Empirical evidence artifact; new tests that cover the same scenario should use `pauseSync`/`resumeSync` going forward rather than ad-hoc observer disabling.
- `packages/app/src/editor/observers.test.ts` — Existing Group D/E origin-preservation tests refactored to use `createItemOriginProbe` where inline `new Y.UndoManager(...)` is currently used.

*Documentation:*
- `specs/2026-04-14-bridge-convergence-under-concurrent-writes/evidence/bug-d-mechanism.md` — NEW file. Already created. Documents Bug-D + V0-14 pickup points.
- `AGENTS.md` + `CLAUDE.md` (symlinked) — Add precedent #10 per FR-5. Add precedent #11 per FR-11/17 ("Bridge invariants are auto-enforced + property-verified"). **Rewrite the STOP rule** that currently says "Always call `syncTextToFragment` after `um.undo()` / `um.redo()`" to point at the XmlFragment-authoritative pattern (`applyAgentMarkdownWrite` template) and warn that rebuild-from-Y.Text destroys concurrent user content — see §7e (FR-9).

**NOT in scope:**
- `packages/app/src/editor/observers.ts` changes beyond the drift-catcher + scheduler DI (Observer B unchanged; Path A/B dispatch unchanged; baseline refresh on remote tx unchanged)
- `packages/server/src/persistence.ts`, `external-change.ts`, `shadow-repo.ts`, `reconciliation.ts`, `file-watcher.ts`
- `packages/cli/`, `docs/`, `packages/app/src/components/`
- Playwright tests (pure bridge-logic change; Tier 1 integration is sufficient; Playwright remains an ultimate cross-check for FR-15/FR-16 at the real-browser level — no changes this spec)
- V0-14's own implementation — per-agent `Y.UndoManager`, `/api/agent-undo`, `applyAgentUndo` handler, `AgentUndoButton` UI (Miles's territory per D13; this spec is the prerequisite)
- Bug-D fix itself (D12, §7e handoff — V0-14 owns the implementation)
- Identity threading (`agentId`/`agentName` parameters) in `applyAgentMarkdownWrite` signature — Miles's PR #134 scope (D13)
- Extending FR-17's fuzzer operation set beyond the initial minimal set (future extensions land with the bridge surfaces that motivate them, per §12 and precedent #11)
- Production observability / server-side metrics for the bridge — test-side observability (FR-11 watcher) is in this spec; production observability is §12 Future Work

**EXCLUDE:**
- Any file not listed in SCOPE
- Any new CRDT types or origins (D11)

**STOP_IF:**
- Bridge invariant fails on any existing integration test
- `bun run check` fails
- `bun run check:full:parallel` fails
- The reproducer file's 4 tests don't all pass post-fix
- Any existing origin-preservation test in `observers.test.ts` Group D or E fails
- `applyByPrefixSuffix` extraction breaks ANY existing Observer A Path B test
- `grep -rn "syncTextToFragment" packages/*/src/` returns any match after migration (FR-9 — must be fully removed from non-test source)
- The Bug-D regression test (`bug-d-v0-14-agent-undo-under-concurrent-typing.test.ts`) runs unskipped in CI (FR-10 — must stay skip-guarded until V0-14 enables it)
- **FR-11 watcher fires during any pre-existing passing test after integration** — indicates a real invariant violation that existed before this spec (root-cause and escalate before proceeding)
- **FR-15 scheduler DI produces any behavioral difference when production default (`globalThis.setTimeout` passthrough) is used** — indicates the wrapping broke semantics; revert and redesign
- **FR-16 network control middleware changes behavior when `syncControl: false` (default)** — indicates accidental coupling of the wrapper to the default path; opt-in must be a strict opt-in
- **FR-17 convergence fuzzer fails any seed within the first 25 CI iterations against the final spec implementation** — indicates the fixes are incomplete; debug the seed (deterministic replay) and either fix a real bug or adjust the generator if spurious

**ASK_FIRST:**
- Before changing `applyByPrefixSuffix`'s public signature — it is consumed by `observers.ts` (client) and `agent-sessions.ts` (server)
- Before modifying `updateYFragment` call shape (reserved for y-tiptap vendor)
- Before touching `AGENT_WRITE_ORIGIN` / `ORIGIN_TREE_TO_TEXT` origin strings
- Before changing `api-extension.ts` call patterns beyond the migration (activity-map writes, awareness.mode, error handling)
- Before adding new origins to any `trackedOrigins` set (affects V0-14 contract)
- Before changing the `Scheduler` interface shape (FR-15) — stable DI contract; tests and production depend on the same shape
- Before changing `attachBridgeInvariantWatcher`'s enforcing-origins set (FR-11) — architectural decision about which origins must leave the bridge in a valid state; expansion is safe, contraction needs justification
- Before tightening the FR-17 fuzzer's initial operation set beyond the minimal list (per D17, generator grows with new bridge surfaces, not preemptively)
