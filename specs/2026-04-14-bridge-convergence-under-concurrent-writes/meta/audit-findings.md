# Audit Findings (second pass)

**Artifact:** `specs/2026-04-14-bridge-convergence-under-concurrent-writes/SPEC.md`
**Audit date:** 2026-04-14
**Total findings:** 9 (3 high, 4 medium, 2 low)

Scope: delta since first audit (FR-9..FR-17, §7e, §7f, D9/D12–D17, §13 SCOPE expansion). Prior-audit findings that regressed or persist are re-flagged.

---

## High Severity

### [H] Finding 1: FR-11 enforcing-origins set uses raw string `'file-watcher'` but the production tx.origin is a `LocalTransactionOrigin` object — watcher will never fire on file-watcher transactions

**Category:** FACTUAL
**Source:** T1 (own codebase)
**Location:** §7f.1 lines 437–444, FR-11 acceptance text (spec line 109), §13 ASK_FIRST note (line 886)
**Issue:** `BRIDGE_ENFORCING_ORIGINS` is defined as `new Set<unknown>([ORIGIN_TREE_TO_TEXT, ORIGIN_TEXT_TO_TREE, AGENT_WRITE_ORIGIN, 'file-watcher'])`. The actual file-watcher transaction origin is the full object produced in `external-change.ts:57-61`:

```ts
{ source: 'local', skipStoreHooks: true, context: { origin: 'file-watcher' } } satisfies LocalTransactionOrigin
```

`external-change.test.ts:102-129` explicitly asserts this shape. `Set.has(tx.origin)` uses reference identity for objects — the literal string `'file-watcher'` will never equal that object. Result: the per-tx invariant check fires for agent writes and observer syncs, but silently skips every file-watcher transaction. This is exactly the kind of "silent miss" that D14's motivation cited as unacceptable.

**Current text:** `const BRIDGE_ENFORCING_ORIGINS = new Set<unknown>([ORIGIN_TREE_TO_TEXT, ORIGIN_TEXT_TO_TREE, AGENT_WRITE_ORIGIN, 'file-watcher', ...])`
**Evidence:**
- `packages/server/src/external-change.ts:57-61` — file-watcher origin is a LocalTransactionOrigin object, not a string.
- `packages/server/src/external-change.test.ts:122-126` — confirms origin shape via `.toEqual({ source: 'local', skipStoreHooks: true, context: { origin: 'file-watcher' } })`.
- `packages/yjs/src/utils/UndoManager.js:216` — Y.js origin-matching uses `trackedOrigins.has(transaction.origin)` (reference equality for objects).

**Status:** CONTRADICTED
**Suggested resolution:** Export the file-watcher `LocalTransactionOrigin` constant from `external-change.ts` (or `core/src/constants/origins.ts`), import it in the watcher, and include the object reference in the enforcing set. Same treatment for `ROLLBACK_ORIGIN` (see Finding 2). Additionally, if the watcher wants to match by `context.origin` string instead of identity, it needs a custom matcher — not `Set.has`.

---

### [H] Finding 2: FR-11 enforcing-origins set omits `ROLLBACK_ORIGIN` — V0-16 rollback bypasses the invariant check entirely

**Category:** FACTUAL (coherence-relevant)
**Source:** T1 + L3
**Location:** §7f.1 lines 437–444, FR-11 acceptance text
**Issue:** `ROLLBACK_ORIGIN` is declared in `api-extension.ts:50-54` and used in `document.transact(..., ROLLBACK_ORIGIN)` at line 1446 to apply a Timeline rollback. Rollback is a live, shipped primitive (per V0-16 / PR #39) that mutates both XmlFragment and Y.Text in a single transaction — exactly the kind of paired mutation the bridge watcher is supposed to cover. The enforcing set (`{ ORIGIN_TREE_TO_TEXT, ORIGIN_TEXT_TO_TREE, AGENT_WRITE_ORIGIN, 'file-watcher' }`) does not include it.
**Current text:** enforcing set definition §7f.1; FR-11 text omits rollback entirely.
**Evidence:**
- `packages/server/src/api-extension.ts:50-54` — `ROLLBACK_ORIGIN` object.
- `packages/server/src/api-extension.ts:1446` — `document.transact(..., ROLLBACK_ORIGIN)`.
- §1 spec header references V0-16 Timeline / rollback as shipped context.
**Status:** INCOHERENT
**Suggested resolution:** Add `ROLLBACK_ORIGIN` to the enforcing set and export it from `api-extension.ts` (or move the constant to a shared origin-constants module). Update the §13 ASK_FIRST list to include rollback when expanding the set.

---

### [H] Finding 3: FR-4 test (and P1 persona, and v0-14-interaction evidence) uses the string `'agent-write'` in `trackedOrigins` — test cannot capture agent items as written

**Category:** FACTUAL
**Source:** T1 + L1 + prior audit regression
**Location:** §7d FR-4 test (spec line 337–338), §4 P1 (line 55), §1 line 7, §3 NG2 references, `evidence/v0-14-interaction.md:14`
**Issue:** The FR-4 acceptance test constructs `new Y.UndoManager(client.ytext, { trackedOrigins: new Set(['agent-write']), captureTimeout: 0 })`. But `AGENT_WRITE_ORIGIN` (`agent-sessions.ts:39-43`) is the object `{ source: 'local', skipStoreHooks: false, context: { origin: 'agent-write' } }`. `Y.UndoManager` matches via `trackedOrigins.has(transaction.origin)` at `UndoManager.js:216` — `Set(['agent-write']).has(AGENT_WRITE_ORIGIN_OBJECT)` is always `false`. The UM captures nothing; `um.undoStack.length > 0` assertion fails; the test does not validate what it claims.

This was flagged as [H1] in the prior audit and `meta/_changelog.md` records it as "addressed — clarified test-local UM uses AGENT_WRITE_ORIGIN object" (commit `542b7b1`). The spec text still contains the string form in at least §1 line 7, §4 P1, §7b line 275, §7d line 338, and the evidence file. The probe in FR-17 (line 722) uses the object correctly, creating an internal contradiction.

**Current text (§7d):** `trackedOrigins: new Set(['agent-write']),`
**Evidence:**
- `packages/server/src/agent-sessions.ts:39-43`
- `node_modules/yjs/src/utils/UndoManager.js:216` — `!this.trackedOrigins.has(transaction.origin)`
- CLAUDE.md architectural precedent #1: "All Y.Doc transaction origins use `LocalTransactionOrigin` objects, never raw strings."
- Compare SPEC.md line 722 (`trackedOrigins: [AGENT_WRITE_ORIGIN]`, correct) vs line 338 (`new Set(['agent-write'])`, incorrect) — internal contradiction.

**Status:** CONTRADICTED (regressed from prior audit)
**Suggested resolution:** Replace every literal `'agent-write'` used as a trackedOrigin with `AGENT_WRITE_ORIGIN` (the object constant exported from `agent-sessions.ts`). Update §1, §4 P1, §6 FR-4 acceptance, §7b note, §7d test body, §8 OQ-5, §10 A4, `evidence/v0-14-interaction.md`. Also, the FR-4 test attaches the UM to the **client** Y.Text; server-originated transactions arrive on the client with `provider`-level origin (typically undefined for remote WebSocket syncs), not `AGENT_WRITE_ORIGIN`. Either rewrite FR-4 against the server's Y.Doc (via `getServerState(...)`, FR-13) or use a single shared Y.Doc without network to preserve the origin. As-written, FR-4 is doubly broken.

---

## Medium Severity

### [M] Finding 4: §7c / FR-2 / §13 still reference stale `applyByPrefixSuffix` location `148-167` — actual is `192-211` (prior-audit regression)

**Category:** FACTUAL
**Source:** T1 + prior audit regression
**Location:** §6 FR-2 (line 100), §7c heading (line 279), §13 SCOPE (line 821)
**Issue:** All three call sites still cite `observers.ts:148-167` for `applyByPrefixSuffix`. The function is at **192-211** in the current codebase; lines 148-167 are the middle of `applyIncrementalDiff`'s change-walker loop. `meta/_changelog.md` claims this was "corrected in §7c / §13" by commit 542b7b1 — the correction did not land. An implementer following the SPEC.md literally will look at the wrong code.
**Current text (§7c):** "Move from `packages/app/src/editor/observers.ts:148-167` to `packages/core/src/utils/apply-by-prefix-suffix.ts`"
**Evidence:**
- `packages/app/src/editor/observers.ts:192` — `function applyByPrefixSuffix(ytext: Y.Text, currentText: string, newText: string): void {`
- `packages/app/src/editor/observers.ts:211` — closing brace.
**Status:** STALE
**Suggested resolution:** Replace `148-167` with `192-211` in FR-2 acceptance, §7c heading, §13 SCOPE (line 821). Also re-verify any other line references against `08c20f1` before finalization.

---

### [M] Finding 5: `createTestClient` signature is inconsistent across FR-11, FR-14, FR-16 — reader cannot tell the actual proposed API

**Category:** COHERENCE (L5)
**Source:** L1
**Location:** §7f.1 line 497, §7f.4 line 572, §7f.6 line 686, FR-16 acceptance, FR-14 acceptance
**Issue:** The spec uses three mutually incompatible call shapes for `createTestClient`:

- §7f.1: `createTestClient(port, { skipInvariantWatcher: true })` — opts object as arg 2, no docName.
- §7f.4: `createTestClient(port, docName, { ...opts.perClientOptions, clientIndex: i })` — 3 positional args, opts last.
- §7f.6: `createTestClient(port, docName, { syncControl: true })` — 3 positional args.

Existing harness signature is `createTestClient(port: number, docName?: string)`. A reader cannot determine from the spec whether the new shape is `(port, opts)` or `(port, docName, opts)`. This affects implementation of the (now growing) options set: `skipInvariantWatcher`, `syncControl`, `clientIndex`, and the existing optional `docName`.

**Current text:** See three differing examples above.
**Evidence:** `packages/app/tests/integration/test-harness.ts:161` — current signature.
**Status:** INCOHERENT
**Suggested resolution:** Pick one overload (recommendation: `createTestClient(port: number, docName?: string, opts?: CreateTestClientOptions)` to preserve existing callers), and unify §7f.1, §7f.4, §7f.6 examples. Or switch fully to `(port, opts)` and migrate the one positional-docName call.

---

### [M] Finding 6: FR-15 scheduler-DI claim of "zero behavior change for production" glosses over behavior difference when `sched.setTimeout` is invoked as a method on a plain object

**Category:** COHERENCE (L3)
**Source:** T3 (Node/browser WebAPI semantics)
**Location:** §7f.5 lines 618–624, D15 rationale (line 775), §11 risk row (line 801)
**Issue:** Spec claims "Default: global `setTimeout`/`clearTimeout` passthrough (zero behavior change for production)." The proposed implementation captures `{ setTimeout: globalThis.setTimeout, clearTimeout: globalThis.clearTimeout }` and invokes `sched.setTimeout(cb, ms)`. For Node's and the browser's built-in `setTimeout`, this is safe in practice, but the default implementation still swaps **eager binding to globalThis** for **late binding through a property access on a plain object**. If `deps.scheduler` ever provides a method with its own `this` expectation (e.g., a class-based scheduler, or a `vi.fakeTimers`-style wrapper), the behavior diverges.

More importantly, the current code calls `setTimeout(runObserverASync, DEBOUNCE_MS)` bare — the typecheck just returns `ReturnType<typeof setTimeout>`. The proposed scheduler returns `unknown` (§7f.5: `setTimeout: (cb: () => void, ms: number) => unknown`). Storing the handle in `debounceA: ReturnType<typeof setTimeout> | null` (current) now requires an `unknown`-to-Timeout cast or relaxing the type. This is a semantic change beyond "passthrough."

**Current text:** "Default: global `setTimeout`/`clearTimeout` passthrough (zero behavior change for production)."
**Evidence:**
- `packages/app/src/editor/observers.ts:300`: `let debounceA: ReturnType<typeof setTimeout> | null = null;`
- Proposed `Scheduler` interface returns `unknown`.
**Status:** INCOHERENT
**Suggested resolution:** Either (a) narrow Scheduler's return type to `ReturnType<typeof setTimeout>` (keeps existing types; loses generality of "any scheduler"), or (b) widen `debounceA` to `unknown | null` everywhere and justify the cast boundary. Mention explicitly in §11 that the passthrough default is "identical semantics but different static type" so the downstream Finding Re: FR-15 STOP_IF (line 875) is interpretable — "behavioral difference" has to be defined operationally, not typologically.

---

### [M] Finding 7: §1 SCR's Bug-D handoff paragraph refers to `bug-d-isolation-repro.test.ts` but FR-10 renames it to `bug-d-v0-14-agent-undo-under-concurrent-typing.test.ts` — reader traces two filenames

**Category:** COHERENCE (L5)
**Source:** L1
**Location:** §1 line 27, §7e line 390, FR-10 (line 108), §12 line 807, §13 SCOPE line 841, evidence/bug-d-mechanism.md:19,41,51
**Issue:** The spec both (a) cites `bug-d-isolation-repro.test.ts` as the empirical reproducer and (b) mandates renaming it to `bug-d-v0-14-agent-undo-under-concurrent-typing.test.ts`. Multiple sections (§1 SCR, §7e, §12) refer to the old filename; §13 and FR-10 refer to the new name. After the rename, references to the old filename are stale. evidence/bug-d-mechanism.md is all pre-rename. An agent unskipping "the Bug-D regression test" later will have to reconcile two names.

Also: FR-10 says "Rename to `bug-d-v0-14-agent-undo-under-concurrent-typing.test.ts`" but then `test(...)` → `test.skip(...)` and "Test content itself unchanged from diagnostic artifact (same mechanism, same flow)." This is fine, but §13 line 841 says "will be rewritten using new harness primitives when V0-14 unskips" — contradicts FR-10's "test content itself unchanged."
**Current text:**
- §1: "commits a skip-guarded regression test (`bug-d-isolation-repro.test.ts`)"
- FR-10: "Rename to `bug-d-v0-14-agent-undo-under-concurrent-typing.test.ts`"
- §13 line 841: "Test content (mechanism, flow) unchanged — will be rewritten using new harness primitives when V0-14 unskips."
- FR-10: "Test content itself unchanged from diagnostic artifact (same mechanism, same flow)."
**Evidence:** cross-reference within SPEC.md.
**Status:** INCOHERENT
**Suggested resolution:** Pick one filename and use it throughout (prefer the rename target since it encodes the V0-14 handoff semantics). Update `evidence/bug-d-mechanism.md` filename references. Reconcile FR-10's "unchanged" claim with §13's "rewritten using new harness primitives" — they can both be true if sequenced ("committed unchanged now; V0-14 unskips and optionally refactors to new primitives as part of their PR"), but say that explicitly.

---

## Low Severity

### [L] Finding 8: G6 claims "225+ app tests" — actual app test count is ~516 (>2x stale); "358+ server tests" is ~356

**Category:** FACTUAL
**Source:** T1
**Location:** §2 G6 (line 38), FR-1 acceptance ("Server tests (358+) all pass", line 99), NFR section (line 120)
**Issue:** A quick count in the current worktree: `grep -rcE "^\s*(test|it)\(" packages/server/src` → **356**; `grep -rcE "^\s*(test|it)\(" packages/app/src packages/app/tests` → **516**. Spec says 358+ and 225+. Server is within 2 and trivially stale; app is off by more than 2×. This won't affect implementation, but it does affect credibility — a reviewer spot-checking the counts will notice.
**Current text:** "All existing 358+ server tests and 225+ app tests pass unchanged."
**Evidence:** grep counts above.
**Status:** STALE
**Suggested resolution:** Either remove the counts (they are not acceptance-critical) or refresh to the current order of magnitude.

---

### [L] Finding 9: D17 claim "Y.js core, Automerge, and Riak DT use PBT for convergence" is half-verified — Riak DT confirmed, Y.js uses random/statistical tests, Automerge not clearly verified

**Category:** FACTUAL
**Source:** T4/T5 (web search)
**Location:** §9 D17 rationale (line 777)
**Issue:** Spec cites three exemplars for PBT of CRDT convergence:
- **Riak DT:** confirmed — `basho/riak_dt` README explicitly says "QuickCheck-tested implementations" with `eqc_statem`; use of `gen_op()` per data type.
- **Y.js:** `yjs/tests/testHelper.js` contains `random/Random/fuzz` helpers and a generator-style test driver; it is randomized but not a pure fast-check / proptest shape. Accurate enough for the argument.
- **Automerge:** web search did not return a primary citation. The argument survives without this one, but stating it as a matched trio when only two are clearly matched overstates evidence.
**Current text:** "Every serious CRDT library (Y.js core, Automerge, Riak DT) verifies convergence by property-based testing"
**Evidence:**
- Riak DT: GitHub README, Basho QuickCheck usage confirmed (web search).
- Y.js: `node_modules/yjs/tests/testHelper.js` has randomized test driver.
- Automerge: not found in quick search.
**Status:** UNVERIFIABLE (for Automerge)
**Suggested resolution:** Either cite a direct Automerge reference (e.g., their test suite README) or soften to "Y.js and Riak DT use randomized / property-based convergence testing; most serious CRDT libraries follow this discipline."

---

## Confirmed Claims (summary)

The following load-bearing claims were verified against the current codebase and did not produce findings:

- `AGENT_WRITE_ORIGIN` location (`agent-sessions.ts:39-43`) — correct.
- `syncTextToFragment` location (`agent-sessions.ts:53-86`) — spec cites 53-82 in evidence files and §7a line 126; actual is 53-86 (4-line undershoot, already documented, harmless).
- `handleAgentWrite/WriteMd/Patch` transact lines 572/652/965 — spec cites 573/652/965; 573 off by one, the others correct. Non-load-bearing (surrounding context makes the target unambiguous) — not a finding.
- `external-change.ts:30-63` as Bug-A precedent — verified; function body spans 30-63 exactly. D7 citation correct.
- `@tiptap/y-tiptap` exports `updateYFragment` and `yXmlFragmentToProsemirrorJSON` — verified in `node_modules/@tiptap/y-tiptap/dist/src/y-tiptap.d.ts`.
- `mdManager.parseSafe` — verified in `packages/core/src/markdown/index.ts:122`.
- `@hocuspocus/provider`'s `WebSocketPolyfill: any` option — verified in `node_modules/@hocuspocus/provider/dist/index.d.ts:345`.
- `Y.Doc#on('afterTransaction', …)` event — verified in `node_modules/yjs/src/utils/Transaction.js:313`.
- `Y.UndoManager` `trackedOrigins: Set<any>` — verified in `node_modules/yjs/dist/src/utils/UndoManager.d.ts:166`.
- PR #134 (Miles): touches the same 3 agent-write handlers for identity threading, preserves `syncTextToFragment` unchanged — D13 coordination claim confirmed via `gh pr diff 134`.
- `ROLLBACK_ORIGIN` exists at `api-extension.ts:50-54` and is used at line 1446 — confirms Finding 2's missing-origin claim.
- Observer A setup and early-exit lines: Observer A setup at `observers.ts:286` (CLAUDE.md claims 301 — CLAUDE.md stale, not SPEC.md); runObserverASync at 315; early-exit at 324 (SPEC matches); Observer B at 410 (CLAUDE.md says 396 — stale); Observer B early-exit at 442 (SPEC matches); baseline refresh at 455 (SPEC matches).
- FR-15 scheduler DI touchpoints: setTimeout/clearTimeout at `observers.ts` lines 393-394, 417, 423, 547-548, 590-591 — covered by the "all setTimeout/clearTimeout calls" phrasing.

## Unverifiable Claims

- D16 ("CRDT races are structural, not temporal"): accurate for CRDT-network layer, but overstated given this repo's observer debounces (DEBOUNCE_MS=50, TYPING_DEFER_MS=300) are literally wall-clock timers. The claim is directionally correct; a charitable read fits. Low severity, not worth a finding on its own — the practical consequence (prefer pauseSync/resumeSync over `wait(ms)`) is sound.
- "Two staff engineers would agree that the correct architectural precedent is …" (§7f line 423): rhetorical, unverifiable in principle, harmless.
