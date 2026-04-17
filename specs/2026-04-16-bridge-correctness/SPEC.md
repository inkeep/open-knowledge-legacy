# Bridge Correctness & Settlement

**Status:** Scaffold — iterating through `/spec` phases
**Baseline commit:** 432a834b
**Branch:** `spec/bridge-correctness`
**Worktree:** `.claude/worktrees/bridge-correctness`
**Related:**
- `evidence/seed-1776386718697-characterization.md` (flake reproduction + op sequence + root-cause mechanism — inlined from the hand-off `CONSIDER.md` artifact)
- `evidence/bridge-surface-map.md` (authoritative current-state module map)
- `specs/2026-04-15-server-authoritative-observer-bridge/SPEC.md` (precedent #14 origin)
- `specs/2026-04-14-bridge-convergence-under-concurrent-writes/SPEC.md` (precedent #11/12 origin)
- `reports/yjs-transaction-settlement-hooks/REPORT.md` (Bucket B grounding)
- `reports/three-way-merge-content-preservation/REPORT.md` (Bucket A invariant choice + SS-1 framing)
- `reports/collab-editor-silent-loss-ux-patterns/REPORT.md` (Bucket A R7 UX grounding)

---

## 1) Problem statement (SCR)

**Situation.** Open Knowledge runs a dual-CRDT model (Y.XmlFragment + Y.Text) with a
server-authoritative bidirectional observer bridge (precedent #14). PR #161 shipped a
hybrid diff3+DMP `mergeThreeWay` for Path B (when Y.Text has diverged from the
baseline), replacing DMP `patch_apply` which silently dropped 2-3% of content.
PR #161's QA sampled 100 seeds at zero tolerance and saw zero drops.

**Complication.** A post-ship investigation reproduced a fuzz-convergence flake
at seed `1776386718697` (40-60% failure rate locally, also observed in CI at
seed `1776368799815`, run `24530510201`). Bisect exonerated PR #172. Deep
source-trace of Yjs RGA (`evidence/seed-1776386718697-characterization.md`;
verified via Opus /explore against `node_modules/yjs/src/structs/Item.js`)
identified the proximate mechanism — and the architectural limit.

**The mechanism (verified):** A paused client's outbound CRDT insert encodes
its position as a reference to an Item that, by the time the update reaches
the server, has been **tombstoned by a paired write** (e.g., `FILE_WATCHER_ORIGIN`
replacing Y.Text via `applyFastDiff` — character-level DMP, wholesale-equivalent
when content is wholly different as in the characterized op-sequence). Yjs
RGA's conflict-resolution loop at `Item.integrate`:429-482 places the insert
relative to that tombstoned anchor — which now sits **between live items
written by the paired write**. The visible result is the paired-write content
split in half with the paused client's bytes wedged in. Subsequent Observer A Path B firings run
`mergeThreeWay` against the corrupted Y.Text and preserve the corruption
rather than healing it.

**The architectural limit (verified):** Per Khanna-Kunal-Pierce 2007 (cited
in `reports/three-way-merge-content-preservation/REPORT.md` §D3), no
purely-state-based three-way merge — diff3, DMP, or any composition — can
preserve content under arbitrary concurrent interleavings. The hybrid
diff3+DMP algorithm inherits this limit by construction. **No amount of
observer-layer refinement closes this class structurally** — only a
single-CRDT collapse (Peritext, explored in a separate parallel spec)
provides structural content-preservation.

**What this spec can do:** **Maximize correctness within the dual-CRDT
observer-bridge architecture.** Specifically: (i) close every application-layer
amplification of the RGA mechanism (paired-write asymmetries, debounce-window
races, silent-drop algorithm limits); (ii) establish a loud-signal
post-condition that turns the unreachable residual into observable telemetry;
(iii) provide a silent in-product recovery artifact that matches Notion-esque
user expectations; (iv) feed telemetry to the parallel single-CRDT-collapse
exploration as the urgency-calibration signal.

**Resolution.** Ship four coordinated buckets of work:

- **Bucket 0 — Paired-write symmetry (harm reduction, not proximate fix).**
  Add typed `paired: boolean` marker to `LocalTransactionOrigin.context`
  (precedent #1 aligned), mark all 4 paired origins (`AGENT_WRITE_ORIGIN`,
  `FILE_WATCHER_ORIGIN`, `ROLLBACK_ORIGIN`, `MANAGED_RENAME_ORIGIN`; the
  latter two also identified by Opus /explore as paired writers — same
  failure class reproducible with different seeds). Symmetric short-circuit
  in BOTH Observer A AND Observer B. Add `MANAGED_RENAME_ORIGIN` to
  `BRIDGE_ENFORCING_ORIGINS`. **Explicit framing: this prevents downstream
  amplification of the RGA corruption, not the primary placement. The primary
  is RGA-level and architecturally unfixable within the dual-CRDT bridge.**
- **Bucket A — Correctness guardrail + silent recovery.** Add content-preservation
  post-condition in `mergeThreeWay` (invariant c: maximal-unique-substring +
  order-preservation side-check). Throw in dev/test, structured log + metrics
  in prod, never throw upward in prod. **On violation, also create a silent
  named version-history checkpoint** via new generic `saveInMemoryCheckpoint`
  primitive — no toast, no banner, Notion-esque recoverable artifact in
  existing TimelinePanel. Elevate fuzz to 1000/PR + 10000/nightly. Every
  failing seed becomes a named regression (T8, T9, …).
- **Bucket B — Debounce-window race closure (correctness work, not cleanup).**
  Migrate Observer A/B from `setTimeout` debounce to
  `doc.on('afterAllTransactions', ...)`. Extract client typing-defer into
  dedicated module so precedent #13(b) enforcement grep is unambiguous.
  Replace fuzz-harness `pauseInbound`/`resumeInbound` surrounding `wait(ms)`
  calls with structural `awaitDocQuiescence(doc)` gate.
- **Bucket C — Honest residual characterization + telemetry.** Characterize
  any seed that survives Buckets 0/A/B as T8+ named regressions. Emit
  structured telemetry (`bridge-merge-content-loss` event + silent-checkpoint
  rate per doc) as the urgency signal for the parallel single-CRDT-collapse
  exploration. No attempt to "fix" the algorithm to be fully correct — the
  academic literature rules that out. Signal infrastructure is the in-scope
  deliverable.

---

## 2) Goals

1. **No silent content loss at the bridge.** Every merge produces output that
   contains `(mine \ base) ∪ (theirs \ base)` at the character-set level, or
   fails loudly with `BridgeMergeContentLossError`.
2. **No wall-clock primitives in the bridge.** Observer A/B propagate on Yjs
   transaction-settlement hooks. Fuzz tests use structural quiescence gates, not
   `wait(ms)`.
3. **Zero fuzz flakes across 10,000 seeds.** The zero-tolerance gate is backed
   by evidence at 10,000-seed sample count, not 100.
4. **Every failing seed is a named regression fixture.** T8, T9, … in
   `evidence/algorithm-comparison-experiment.md`.
5. **Precedent #13(b) fully enforced.** No `setTimeout` debounce in
   `server-observers.ts` or `observers.ts` bridge code. No `wait(ms)` in new
   bridge tests. CLAUDE.md updated to reflect the settlement-based bridge.

---

## 3) Non-goals

- **Collapse to single CRDT** (D4-LOCKED, evidence-strengthened 2026-04-16 —
  see Decision Log §D4 update citing `reports/yjs-14-ecosystem-adoption/REPORT.md`:
  Yjs 14 + Hocuspocus structurally incompatible today; TipTap + Hocuspocus
  not migrating; BlockNote "design partner" has zero public code progress;
  dual-view binding gap is ecosystem-universal across Yjs 14 + Loro).
  Moving Y.XmlFragment + Y.Text into a single Yjs type (Peritext via Yjs 14,
  Automerge `Text`, Loro, or the
  Rust-spec direction) is the only structurally-correct long-term answer
  per `reports/three-way-merge-content-preservation/REPORT.md` §D3
  (impossibility) + §D5 (single-CRDT as escape mechanism) + Recommendation 4.
  **Being explored in a parallel spec** (user-driven; not a subsequent
  spec from this one's completion — they progress independently). This
  spec's post-condition (R1) + silent-checkpoint rate (R7) generate the
  telemetry the parallel exploration uses for urgency calibration. See also
  `reports/single-crdt-collapse-alternatives/REPORT.md` for candidate
  comparison (Automerge 2.2+ ranked first on production-readiness + cost;
  Loro ranks first on greenfield alignment but blocked by open data-loss
  issue #77; Peritext-on-Yjs-14 ecosystem immature as of 2026-04-16 —
  `@y/y@14.0.0-rc.13` one day old, every ecosystem peer still pins
  `yjs@^13`).
- **Server-side rebase of pending inbound updates.** Investigated
  (`/explore` Investigation 3): not supported by Hocuspocus today (no
  `beforeApplyUpdate` hook; issue `ueberdosis/hocuspocus#346` tracks).
  Implementation would be an OT-on-CRDT layer with no ecosystem precedent
  — architecturally heaviest option. Out of scope.
- **V0-14 agent-undo.** Spec-called out by precedent but its own workstream.
  This spec preserves all V0-14 constraints (STOP rules in CLAUDE.md).
- **Persistence debounce.** The 2000 ms persistence debounce on Y.Doc → disk is
  unrelated to the bridge. Out of scope.
- **CodeMirror / TipTap user-facing debounces.** This spec is server-side
  observer code only.

---

## 4) Personas / consumers

- **P1 — Concurrent collaborators (users).** Two users, one in WYSIWYG, one in
  source mode, typing simultaneously in overlapping regions. They expect all
  edits to land. Current: sparse-seed-rate content loss. Target: zero loss.
- **P2 — Agent writers.** `applyAgentMarkdownWrite` is adjacent but unaffected
  by bridge Path B (precedent #12). This spec preserves the XmlFragment-authoritative
  composition pattern.
- **P3 — V0-14 (future agent-undo).** Future write surface that depends on
  a correct bridge. This spec tightens the invariants V0-14 will inherit.
- **P4 — Developers (us).** Fuzz test signals. Precedent-compliant code. No
  wall-clock tests.

---

## 5) User journeys

### J1. Two concurrent collaborators (P1) — happy path

Alice edits a paragraph in WYSIWYG. Bob simultaneously edits the same
paragraph in source mode. Both edits land. Both see each other's content
within the CRDT-sync round-trip (~100-200 ms). **No visible signal.**
No toast, no banner, no "merging" indicator. Content is preserved.

**Expected product feel:** identical to Google Docs / Notion / Figma
multiplayer. Users who are unaware their edit coincided with another's
don't find out; users who watch each other's cursors see both edits weave in.

### J2. Concurrent edit hits the algorithm's fundamental limit (P1, rare, <1% of Path B firings post-Bucket-0/A/B)

Same setup as J1, but the specific interleaving reproduces the academic
counter-example class. Post-condition (R1) fires inside `mergeThreeWay`.
**User sees:** still no visible signal. Content may be visibly affected if
they happen to watch the exact paragraph at merge time.
**System response:**
- Structured log event emitted (`bridge-merge-content-loss`).
- Metrics counter incremented.
- **Silent named checkpoint created** via `saveInMemoryCheckpoint` —
  labeled `"Before concurrent merge @ <timestamp>"` in TimelinePanel.
- Bridge returns the merged result as computed; editor remains responsive.

**If the user notices loss** (hours or days later, depending on whether
they re-open the doc): they open TimelinePanel via the existing version
history UI, see a distinctively-labeled checkpoint from the moment of the
merge, click "restore" or view diff. Standard Notion-esque recovery muscle
memory. **No new UI concept to learn.**

### J3. Agent writer (P2)

Agent posts to `/api/agent-write-md` while Alice is typing. Server-side
`applyAgentMarkdownWrite` composes at markdown-level (precedent #12) then
mirrors via `applyFastDiff`. `AGENT_WRITE_ORIGIN` is marked `paired: true`
(R0), Observer A + B both take the short-circuit branch. No debounce
window. Content from both writers preserved.

### J4. External file-watcher change during active editing (P1)

A file on disk changes (user edits with `vim` while connected, or CI rewrites).
`applyExternalChange` fires under `FILE_WATCHER_ORIGIN` (`paired: true`).
Observer A + B both short-circuit symmetrically. If a paused client's
outbound CRDT insert races (the seed-`1776386718697` class): corruption
may still occur at RGA layer, but R1 post-condition catches downstream
effect → silent checkpoint → J2-style recovery path.

### J5. Developer (P4)

Runs `bun run check`. Lint passes (no `setTimeout` in bridge code per R6).
Tests pass. `bridge-convergence.fuzz.test.ts` runs 200 seeds in PR tier
(`STRESS_FUZZ_PR=1`, calibrated to fit the 15-min Tier 1 budget per D11)
and 10 000 seeds nightly (`STRESS_FUZZ_NIGHTLY=1`); any failure produces
an op-sequence snapshot + a pinned regression test stub in
`merge-three-way.test.ts`. Post-condition assertion in
`mergeThreeWay` fires loudly with a `BridgeMergeContentLossError` naming
the lost substring.

---

## 6) Requirements

### Bucket 0 — Paired-write symmetry (harm reduction)

- **R0. Typed paired-write marker.** Extend `LocalTransactionOrigin.context`
  with `paired?: boolean` (drop-in — `context: any` already permits it per
  `/explore` Investigation 4). `isPairedWriteOrigin(origin)` = `origin?.context?.paired === true`.
  Greenfield posture: new origins declare paired-write semantics at the
  origin-literal definition site rather than in a hardcoded enforcement set.
- **R0b. Mark all 4 paired origins.** Add `paired: true` to:
  - `AGENT_WRITE_ORIGIN` (`packages/server/src/agent-sessions.ts:52-56`)
  - `FILE_WATCHER_ORIGIN` (`packages/server/src/external-change.ts:27-31`)
  - `ROLLBACK_ORIGIN` (`packages/server/src/api-extension.ts:104-108`) —
    writes both `updateYFragment` + `ytext.delete/insert` in single
    transact (`/explore` Investigation 2)
  - `MANAGED_RENAME_ORIGIN` (`packages/server/src/api-extension.ts:110-114`) —
    writes `updateYFragment` + `applyFastDiff` in single transact (same source)
- **R0c. Symmetric short-circuit in BOTH Observer A AND Observer B.**
  Observer A already has the branch at `server-observers.ts:214-237`.
  Add the symmetric branch to Observer B at `:378-388` (currently omitted —
  comment at `:382-384` acknowledges this asymmetry). On paired origin:
  synchronously refresh baseline from post-paired-write state, cancel any
  pending debounce, return.
- **R0d. Add `MANAGED_RENAME_ORIGIN` to `BRIDGE_ENFORCING_ORIGINS`**
  (`test-harness.ts:526-533`). Currently the 6-entry set omits it
  (`bridge-surface-map.md` flagged this gap; `/explore` Investigation 2
  confirmed paired-write semantics).
- **R0e. T8 regression test — FILE_WATCHER paired-write race.** Hand-written
  integration test reproducing the seed-`1776386718697` failure class,
  using the `packages/server/src/server-observers.test.ts`
  seed-1776325179241 pattern. Note: full determinism may require a new
  `pauseOutbound` primitive on `ControllableWebSocket` (Challenge F7) —
  decide via spike during implementation; accept probabilistic (100-run
  rate-based) if deterministic not feasible.
- **R0f. T9 regression test — ROLLBACK paired-write race.** Same shape as
  T8 with rollback op replacing file-watcher. Analogous in structure per
  Investigation 2's test-scenario sketch.
- **R0g. T10 regression test — MANAGED_RENAME paired-write race.**
  Same shape with managed-rename op.
- **R0h. Seed `1776386718697` empirical gate.** Run 100× in a row
  post-Bucket-0 (locally + CI). **Honest pre-registered hypothesis:**
  Bucket 0 is harm reduction against Observer B re-propagation. The
  primary RGA-level placement is NOT prevented. We therefore **expect**
  residual rate at this seed; we do NOT gate on 100/100. We gate on
  "no seed fails BY A NEW MECHANISM post-Bucket-0 that wasn't already
  present." Telemetry (R9) captures the residual rate as the signal.

### Bucket A — Correctness guardrail + silent recovery

- **R1. Content-preservation post-condition in `mergeThreeWay`** (D2-LOCKED).
  After merge returns, compute maximal-unique-substrings of `(mine \ base)`
  and `(theirs \ base)` via suffix-array diff (invariant c); **PLUS**
  weak order-preservation side-check: for each pair of maximal-unique
  substrings (s1, s2) from mine both contained in result, if s1 precedes
  s2 in mine, then s1 precedes s2 in result; same for theirs (per Challenge
  F6 to close the reordering gap). On violation:
  - **Dev/test**: throw `BridgeMergeContentLossError` with full inputs
    (base, mine, theirs, result), lost substrings, and which invariant
    fired (c or order).
  - **Prod** (D3-LOCKED): `console.warn(JSON.stringify({event: 'bridge-merge-content-loss', ...}))`
    with structured payload; increment metrics counter; return merge result
    as-computed. Also fire R7 silent-checkpoint (see below).
  - Implementation: `packages/core/src/bridge/merge-three-way.ts`. O(n log n)
    for (c), O(k²) for order-preservation (k = substring count, typically ≤ 10).
    Sub-millisecond for typical markdown.
- **R2. Elevate fuzz sampling.** `bridge-convergence.fuzz.test.ts` runs 1000
  seeds per CI invocation (up from 25). Separate nightly CI job runs 10000
  seeds. Failing seeds reported per-seed with full op sequence for
  reproduction.
- **R3. Pinned regression fixtures.** Every failing seed surfaced during or
  after this spec becomes a named test case (T8, T9, …) in
  `evidence/algorithm-comparison-experiment.md` and a pinned regression test
  in `merge-three-way.test.ts`.
- **R7. Silent in-memory checkpoint on post-condition violation.** When R1
  fires in prod, the server creates a version-history checkpoint labeled
  `"Before concurrent merge @ <timestamp>"` containing the pre-merge
  `lastSyncedXmlMd` string. Via new generic primitive (R7a) + Observer A
  integration (R7b). **Silent** — no toast, no banner, no awareness event.
  Visible only when the user opens TimelinePanel; labeled distinctively so
  it's recognizable as a merge-conflict recovery artifact.
  - **R7a.** New primitive in `packages/server/src/shadow-repo.ts`:
    `saveInMemoryCheckpoint(shadow, contentRoot, params)` where `params` is
    a discriminated union (R10-compliant — no `Record<string, unknown>`):
    ```ts
    type InMemoryCheckpointParams =
      | { kind: 'bridge-merge-loss';       docName: string; contents: string;
          label: string; branch?: string;  metadata: { lostSubstrings: string[] } }
      | { kind: 'external-change-rescue';  docName: string; contents: string;
          label: string; branch?: string;  metadata: { incomingDiskSha: string } };
    ```
    Writes to `refs/checkpoints/<branch>/<sha>` via `parkBranch`-style
    blob staging (`shadow-repo.ts:294-319` template). Does NOT touch
    `refs/wip/*` (unlike `saveVersion`). Commit-body metadata via namespaced
    line `ok-checkpoint-v1: {kind, metadata}`. Async; callers fire-and-forget
    with `.catch(e => console.warn(...))`.
  - **R7b.** Observer A Path B integration: on
    `BridgeMergeContentLossError`, capture `lastSyncedXmlMd` from the
    closure (in scope at the call site — see `evidence/bridge-surface-map.md`
    "Path A vs Path B selection" section), schedule
    `queueMicrotask(() => saveInMemoryCheckpoint(...).catch(...))`.
    Never throw upward in prod (D3-LOCKED). Requires threading
    `shadow: ShadowHandle`, `contentRoot: string`, `docName: string`,
    `branch: string` into `SetupServerObserversOpts`.
  - **R7c.** `packages/app/src/components/TimelinePanel.tsx`: read commit
    message prefix after `checkpoint:`; render rows whose message begins
    `checkpoint: Before concurrent merge` with a distinguishing label +
    icon. ~10-15 LOC change.
  - **R7d.** New parser `parseCheckpoint(body: string)` (parallel to
    `parseContributors`) reading the `ok-checkpoint-v1:` line. Returns a
    discriminated-union typed result.
  - **R7e. Rescue-buffer WRITE-site consolidation** (the generic primitive's
    second concrete caller): migrate rescue-buffer write sites at
    `packages/server/src/standalone.ts:411` (reconcile-delete path) and
    `:962` (branch-switch path) from flat-file writes to
    `saveInMemoryCheckpoint({kind: 'external-change-rescue', ...})`.
    Shutdown-flush site (`:565-604`) stays as flat-file (timeline-noise
    tradeoff rejected).
  - **R7f. Rescue-buffer READ-path migration** (closes the read-write
    asymmetry R7e would otherwise create). Update `/api/rescue` +
    `/api/rescue/<docName>` handlers in `packages/server/src/api-extension.ts:2246, 2296`
    to read from timeline refs (`refs/checkpoints/<branch>/<sha>` filtered
    to `kind: 'external-change-rescue'`) in addition to the existing
    flat-file read path. Transitional: both sources merged in the response
    during migration; flat-file read path retained for the shutdown-flush
    site (which remains flat-file). Post-ship, `/api/rescue` surfaces all
    three rescue classes. **Greenfield posture: scoped in to prevent the
    product regression that a writer-only migration would create.**
- **R8. Oracle-check relationship table** (per Challenge F9). Add to §9 a
  short table mapping: fuzz oracle (d), fuzz oracle (e), `attachBridgeInvariantWatcher`,
  new post-condition (c) → what each catches / fires on what surface /
  relationship to others. Retire oracle (d) if post-condition (c) subsumes
  it (verified during Bucket A implementation).

### Bucket B — Debounce-window race closure (correctness work, reframed from "cleanup")

- **R4. Observer A/B on `afterAllTransactions`** (D5-LOCKED). Replace the
  50 ms `setTimeout` debounce in `server-observers.ts` with a
  `doc.on('afterAllTransactions', (doc, transactions) => { ... })` handler.
  Batch-aware origin handling: inspect `transactions` for paired-write
  origins (via new R0 typed marker) and observer-self origins before
  dispatching. Remove injected `Scheduler`'s role from the bridge (retain
  only where still needed elsewhere — see R5b). Deterministic event-ordered
  propagation.
- **R5. Structural quiescence gate in fuzz harness.** Replace surrounding
  `wait(ms)` calls in `bridge-convergence.fuzz.test.ts` around
  `pauseSync`/`resumeSync` usage with `awaitDocQuiescence(doc)`.
  (`pauseInbound`/`resumeInbound` primitives themselves are already
  structural per `network-control.ts:48-58` — boolean flag + FIFO queue,
  no wall-clock — per audit F3; the wall-clock coupling lives in the
  surrounding test code.) New primitive in `test-harness.ts`:
  ```ts
  export async function awaitDocQuiescence(doc: Y.Doc, opts?: { timeoutMs?: number }): Promise<void>;
  ```
- **R5b. Client observer debounce audit + simplification.** Under
  precedent #14, client observers are **baseline-only** — they no longer
  write the derived CRDT, just track `lastSyncedXmlMd` / `lastSyncedYText`
  for origin-guard reasoning. All 4 current `sched.setTimeout` sites in
  `packages/app/src/editor/observers.ts` (lines 292 main A-debounce, 315
  typing-defer, 321 remote-tree grace, 410 main B-debounce) exist to
  coalesce **baseline refresh**, not writes. Baseline refresh is a cheap
  operation (string assignment + `setReconciledBase` call).
  - **Spike first**: profile `serialize(fragment)` + baseline-refresh cost
    per transaction on a representative large doc; verify the Bug-B
    conditional-refresh gate (lines 275-288, uses `!debounceA` as proxy
    for "local edit in flight") is moot under precedent #14 (client has
    no cross-CRDT write-in-flight to protect).
  - **If spike confirms**: delete all 4 `setTimeout` sites; client observer
    callbacks refresh baseline synchronously per transaction. `observers.ts`
    becomes setTimeout-free by deletion, not relocation. ~200 LOC of
    debounce machinery retires.
  - **Fallback if spike fails** (perf or correctness reason): extract all
    4 setTimeouts into dedicated module
    `packages/app/src/editor/client-observer-timing.ts` (not
    `typing-defer.ts` — misleading since only 2 of 4 sites are
    typing-defer; lines 315 + 321 are typing-defer/grace-window, 292 +
    410 are main observer debounce). `observers.ts` becomes
    setTimeout-free by relocation. R6 grep then works cleanly.
- **R6. Precedent #13(b) enforcement test.** A `check` test that greps
  `packages/server/src/server-observers.ts` and
  `packages/app/src/editor/observers.ts` (post-R5b extraction) for
  `setTimeout` / `setInterval` / `sched.setTimeout` / `Scheduler` and
  fails CI if found. Allow-list: `packages/app/src/editor/typing-defer.ts`
  (client-side typing-defer is retained, not a bridge primitive).

### Bucket C — Honest residual characterization + telemetry

- **R9. Structured telemetry for bridge-merge-content-loss.** Emit
  `{event: 'bridge-merge-content-loss', docName, lostSubstrings, which: 'c'|'order', ...}`
  structured JSON log on every R1 violation. Emit `{event: 'bridge-merge-checkpoint-created', docName, sha, kind}`
  on every R7a checkpoint write. Metrics counter for both. Rate feeds the
  parallel single-CRDT-collapse exploration as urgency-calibration signal.
- **R11. Characterize residual failing seeds.** Every seed that fails R2's
  post-condition becomes a T8+ case in
  `evidence/algorithm-comparison-experiment.md` with op-sequence snapshot,
  hypothesized mechanism (RGA-level vs observer-level vs algorithm-level),
  and whether any dual-CRDT fix could close it.

### Cross-cutting

- **R10. Strict typing, no `any`/`unknown`.** Derive types from Yjs,
  diff-match-patch, node-diff3, or internal types. Discriminated unions
  over `Record<string, unknown>`. Applies to all files this spec touches.
- **R12. CLAUDE.md updates.** Target texts:
  - **Precedent #11(b)** (`CLAUDE.md:87`) — replace current text with:
    > (b) **Hybrid diff3+DMP merge for divergent paths, loud on content loss** — line-level diff3 handles structural merge and deduplication (D8/T3); character-level DMP within conflict regions handles sub-line edits. `applyFastDiff` (DMP `diff_main`) applies the merged result to Y.Text with character-level precision, preserving CRDT Items for unchanged content. **Post-condition (maximal-unique-substring + order-preservation) asserts content preservation; violation throws `BridgeMergeContentLossError` in dev/test and emits structured `bridge-merge-content-loss` log + silent checkpoint in prod.** The algorithm has academic-proven limits (no state-based three-way merge preserves content under arbitrary interleavings per Khanna-Kunal-Pierce 2007); the post-condition + telemetry + silent checkpoint make residual loss observable and recoverable.
  - **Precedent #13(b)** (`CLAUDE.md:93`) — replace with:
    > (b) **Settlement-based propagation, not wall-clock debounce.** Server observer bridge dispatches on `doc.on('afterAllTransactions', ...)` — deterministic, event-ordered, one-fire-per-outermost-transact. No `setTimeout` in bridge code (`server-observers.ts`, `observers.ts`). CI gate greps for this. `wait(ms)` in new bridge tests requires justification; prefer `awaitDocQuiescence(doc)`.
  - **Propagation matrix** (CLAUDE.md "Propagation matrix (4 write surfaces…)" table): update W1/W2 rows to reference `afterAllTransactions` dispatch instead of debounce.
  - **Origin-guard truth table**: update entries for paired-write origins to show `isPairedWriteOrigin` matches via `context.paired === true` and fires symmetrically in BOTH Observer A and Observer B (not just A).
  - **STOP rules**: add "STOP: don't reintroduce wall-clock `setTimeout` debounce in bridge observers. Settlement-based dispatch is the precedent." Remove any references to the old `Scheduler`-debounced bridge if present.
- **R13. No deferred tech debt within this spec's scope.** §15 lists
  subsequent specs (relabeled SS-, not FW-; per audit F5), not deferred
  debt. Every in-scope requirement lands before ship.

---

## 7) Success metrics

- **M1.** `bridge-convergence.fuzz.test.ts` passes 1000 consecutive seeds at
  zero tolerance in CI, post-spec (R2).
- **M2.** Nightly 10000-seed run: any failures are named regressions (T8+
  fixtures exist), not surprise flakes (R3).
- **M3.** Seed `1776386718697` failure-rate signal captured via telemetry
  — NOT gated on 100/100 pass (R0h honest framing). Residual rate feeds
  SS-1 urgency signal.
- **M4.** Telemetry visible: `bridge-merge-content-loss` event rate per
  doc per day measurable in post-ship observation window (R9).
- **M5.** Silent checkpoints for users who notice loss: manually test the
  J2 recovery path — loss event → TimelinePanel shows distinctively-labeled
  checkpoint → user restores (R7, R7c).
- **M6.** No `setTimeout` in `server-observers.ts` or `observers.ts`
  (post-R5b extraction); allow-listed only `typing-defer.ts` (R6 gate).
- **M7.** `bun run check` + `bun run check:full:parallel` green.
- **M8.** CLAUDE.md precedent #11(b) + #13(b) + propagation matrix +
  origin-guard truth table + STOP rules match shipped code (R12 target texts).
- **M9.** All 4 paired origins carry `paired: true` in their `context`
  (R0b). `isPairedWriteOrigin` matches semantically, not by identity (R0).
- **M10.** BOTH Observer A and Observer B short-circuit symmetrically on
  paired-origin transactions (R0c).

---

## 8) Current state

Authoritative: `evidence/bridge-surface-map.md` (module structure, debounce
sites, origin objects, Path A/B selection, baseline refresh semantics).

Key observations (summarized; see evidence file for file:line citations):

**Bridge module** (`packages/core/src/bridge/`): merge-three-way.ts (hybrid
diff3+DMP Path B), apply-diff.ts (applyIncrementalDiff Path A + applyFastDiff
character-level Y.Text materializer), diff-lines.ts, frontmatter-y.ts,
normalize.ts, scheduler.ts (`Scheduler` interface + `defaultScheduler`
passthrough), index.ts.

**Bridge consumers** (server): `server-observers.ts` (Observer A + Observer B,
50 ms debounce via injected `Scheduler`, origin guards, baseline tracking),
`server-observer-extension.ts` (Hocuspocus lifecycle), `agent-sessions.ts`
(`applyAgentMarkdownWrite`, XmlFragment-authoritative), `external-change.ts`
(`applyExternalChange`, file-watcher), `api-extension.ts` (rollback,
managed-rename).

**Bridge consumers** (client): `packages/app/src/editor/observers.ts` —
baseline tracker ONLY (cross-CRDT write paths deleted per precedent #14).

**Debounce sites**: 10 total `sched.setTimeout` / `setTimeout` calls across
bridge surfaces. Of these:
- 4 are the server-observer bridge debounce we're replacing via
  `afterAllTransactions` (R4) — at `server-observers.ts:234, 240, 286, 387`
- 4 are in client `observers.ts` — **per R5b audit**: lines 292 + 410 are
  main Observer A/B debounce (on XmlFragment/Y.Text transactions); lines
  315 + 321 are typing-defer / remote-tree grace window. R5b spikes
  whether client observers need any debounce at all under precedent #14
  (baseline-only); if not, deletes all 4. If spike fails, extracts all 4
  into dedicated module `client-observer-timing.ts`.
- 1 is `scheduler.ts:38` defaultScheduler passthrough
- 1 is `server-observer-extension.ts:77` 5-second observer-attach retry
  (escape hatch, not a bridge debounce — retained).

**`afterAllTransactions` listeners in repo today**: ZERO. `afterTransaction`
has 11 occurrences — sole production listener is
`attachBridgeInvariantWatcher` (the existing precedent for transaction-hook
bridge code).

**Origin objects** (7 total): `OBSERVER_SYNC_ORIGIN`, `AGENT_WRITE_ORIGIN`,
`FILE_WATCHER_ORIGIN`, `ROLLBACK_ORIGIN`, `MANAGED_RENAME_ORIGIN`,
`ORIGIN_TREE_TO_TEXT`, `ORIGIN_TEXT_TO_TREE`. All structured as
`{source:'local', skipStoreHooks, context:{origin:<label>}}` —
`context` is typed `any`, so R0's `paired: boolean` is drop-in.

**Path A/B selection** (`server-observers.ts:166-175`): strict string
equality `currentText === lastSyncedXmlMd` selects Path A
(`applyIncrementalDiff`) vs Path B (`mergeThreeWay` → `applyFastDiff`).
Pre-branch normalized gate at `:161` catches trivial in-sync case.

**Observer A/B early-exit asymmetry** (the Bucket 0 target):
- Observer A (`:204-241`): `isPairedWriteOrigin` branch at `:214-237`
  with synchronous baseline refresh + pending-debounce cancel.
- Observer B (`:378-388`): NO `isPairedWriteOrigin` branch. Comment at
  `:381-384` explicitly acknowledges the asymmetry.

**Shadow-repo + timeline surfaces** (for R7):
`packages/server/src/shadow-repo.ts` — `commitWip`, `saveVersion`,
`safetyCheckpoint`, `parkBranch` (the blob-staging template for R7a).
`refs/checkpoints/<branch>/*` (timeline-visible, retained forever per
`shadow-branch-gc.ts:8`). `refs/wip/<branch>/<writer-id>` (per-writer WIP;
GC'd after 24h orphan).
`packages/app/src/components/TimelinePanel.tsx` reads `/api/history`
→ `timeline-query.ts:108-380`; walks both ref namespaces.
Current label for ALL `type: 'checkpoint'` rows is hardcoded `"Save Version"`
at `TimelinePanel.tsx:168` — R7c changes this to read commit message.

**Related references**:
- `specs/2026-04-15-lossless-bridge-merge/` — #161 spec + evidence (T1-T7 test matrix)
- `specs/2026-04-15-lossless-bridge-merge/evidence/algorithm-comparison-experiment.md` — T1-T7 where new T8+ land

---

## 9) Proposed solution

### Bucket 0 shape — typed paired marker + symmetric short-circuit

```ts
// agent-sessions.ts (and analogous for external-change, api-extension)
export const AGENT_WRITE_ORIGIN = {
  source: 'local' as const,
  skipStoreHooks: false,
  context: { origin: 'agent-write', paired: true },   // ← new: paired marker
} satisfies LocalTransactionOrigin;

// server-observers.ts
const isPairedWriteOrigin = (origin: unknown): boolean =>
  origin != null && typeof origin === 'object'
    && 'context' in origin && (origin as {context?: {paired?: boolean}}).context?.paired === true;

// Observer B — add symmetric branch to match Observer A at :214-237:
if (isPairedWriteOrigin(transaction.origin)) {
  lastSyncedYText = ytext.toString();                 // refresh baseline
  if (debounceB) { sched.clearTimeout(debounceB); debounceB = null; }
  return;
}
```

### Bucket A shape — post-condition + silent checkpoint

```ts
// merge-three-way.ts
export function mergeThreeWay(base: string, mine: string, theirs: string): string {
  const result = mergeThreeWayImpl(base, mine, theirs);
  assertContentPreservation(base, mine, theirs, result); // throws BridgeMergeContentLossError on violation
  return result;
}

// server-observers.ts Path B — integrate R7 silent checkpoint
doc.transact(() => {
  if (currentText === lastSyncedXmlMd) {
    applyIncrementalDiff(ytext, currentText, md);
  } else {
    const preMergeBaseline = lastSyncedXmlMd;           // ← snapshot for R7b
    try {
      const mergedText = mergeThreeWay(lastSyncedXmlMd, md, currentText);
      applyFastDiff(ytext, currentText, mergedText);
    } catch (err) {
      if (err instanceof BridgeMergeContentLossError) {
        // Structured log (D3-LOCKED) + silent checkpoint (R7) + metrics (R9)
        console.warn(JSON.stringify({ event: 'bridge-merge-content-loss', ...err.toLog() }));
        metrics.incrementBridgeMergeLoss();
        queueMicrotask(() => {
          saveInMemoryCheckpoint(shadow, contentRoot, {
            kind: 'bridge-merge-loss',
            docName, contents: preMergeBaseline,
            label: `Before concurrent merge @ ${new Date().toISOString()}`,
            metadata: { lostSubstrings: err.lostSubstrings },
          }).catch(e => console.warn('[bridge-rescue] checkpoint failed:', e));
        });
        // PROD: swallow error; return as-computed (D3-LOCKED keep-typing)
        // DEV/TEST: re-throw so tests fail loudly
        if (process.env.NODE_ENV !== 'production') throw err;
      } else { throw err; }
    }
  }
}, OBSERVER_SYNC_ORIGIN);
```

### Bucket A R7a shape — generic in-memory checkpoint primitive

```ts
// shadow-repo.ts — new export, modeled on parkBranch's blob-staging pattern
export type InMemoryCheckpointParams =
  | { kind: 'bridge-merge-loss';      docName: string; contents: string;
      label: string; branch?: string; metadata: { lostSubstrings: string[] } }
  | { kind: 'external-change-rescue'; docName: string; contents: string;
      label: string; branch?: string; metadata: { incomingDiskSha: string } };

export async function saveInMemoryCheckpoint(
  shadow: ShadowHandle, contentRoot: string, params: InMemoryCheckpointParams,
): Promise<string> {
  // 1. hash-object -w → blobSha (contents)
  // 2. git update-index --cacheinfo 100644,blobSha,<docName>.md (in isolated index)
  // 3. write-tree → treeSha
  // 4. commit-tree treeSha -m `checkpoint: ${label}\n\nok-checkpoint-v1: ${JSON.stringify({kind, metadata})}`
  // 5. update-ref refs/checkpoints/<branch>/<sha> → sha
  // Does NOT reset refs/wip/* (unlike saveVersion).
}
```

### Bucket B shape — settlement-based propagation

```ts
// server-observers.ts — BEFORE (4 sched.setTimeout sites)
fragment.observeDeep(() => sched.setTimeout(runObserverASync, 50));
ytext.observe(() => sched.setTimeout(runObserverBSync, 50));

// server-observers.ts — AFTER
let xmlDirty = false;
let textDirty = false;
fragment.observeDeep(() => { xmlDirty = true; });
ytext.observe(() => { textDirty = true; });
doc.on('afterAllTransactions', (doc: Y.Doc, transactions: Y.Transaction[]): void => {
  // Batch-aware origin handling: skip if all transactions are self-origin or paired-write-handled
  if (transactions.every(tr => tr.origin === OBSERVER_SYNC_ORIGIN)) return;
  if (transactions.some(tr => isPairedWriteOrigin(tr.origin))) {
    // Baseline refresh was already synchronous in R0 path; nothing to settle here
    xmlDirty = false; textDirty = false; return;
  }
  if (xmlDirty) { xmlDirty = false; runObserverASync(); }
  if (textDirty) { textDirty = false; runObserverBSync(); }
});

// test-harness.ts — NEW PRIMITIVE
export async function awaitDocQuiescence(doc: Y.Doc, opts?: { timeoutMs?: number }): Promise<void>;
```

### Oracle-check relationship table (R8)

| Check | Catches | Surface | Relationship |
|---|---|---|---|
| Fuzz oracle (d) prefix-match | marker-prefix missing from final ytext | test: fuzz-end | **subsumed by post-condition (c)** — retire if fuzz runs invoke mergeThreeWay which always asserts; keep for harness-level safety signal until verified |
| Fuzz oracle (e) content-set | full-body line membership w/ patch-chain reachable forms | test: fuzz-end | complementary to (c); catches multi-agent-patch interactions (c) may miss |
| `attachBridgeInvariantWatcher` | Y.Text ↔ XmlFragment serialization divergence | test: per-transaction | catches STATE divergence; does NOT catch CONTENT loss (loss that converges both sides passes this watcher) |
| Post-condition (c) + order | mergeThreeWay output loses content unique to either side | prod + test: every merge call | primary correctness gate. Raises `BridgeMergeContentLossError`. |

---

## 10) Decision Log

### Locked

- **D1 (LOCKED, 1-way door, HIGH confidence)** — Add Bucket 0: Observer B
  paired-write symmetry. Rationale: **addresses the observer-layer
  amplification of seed-`1776386718697`'s RGA-level corruption (harm
  reduction, not primary fix — see D7 for the full mechanism).** Observer
  A has `isPairedWriteOrigin` branch at
  `packages/server/src/server-observers.ts:214`; Observer B has no
  equivalent. Without it, Observer B's debounced `runObserverBSync` fires
  against a state mutated by a concurrent paused-client outbound — the
  asymmetry is a real bug regardless of whether the primary RGA mechanism
  is closed elsewhere. Evidence: `evidence/seed-1776386718697-characterization.md`.
  Greenfield directive: ships first so Bucket A/B/C have a known-good
  observer-layer baseline.

- **D2 (LOCKED, 1-way door, HIGH confidence)** — Post-condition invariant
  inside `mergeThreeWay`: **invariant (c) maximal-unique-substring subset**.
  For every maximal contiguous substring unique to `(mine \ base)` or
  `(theirs \ base)`, that substring must appear as a substring in result.
  O(n log n) via suffix-array diff; sub-millisecond for typical markdown.
  Evidence: `reports/three-way-merge-content-preservation/REPORT.md` §D8.

- **D3 (LOCKED, 1-way door, MEDIUM-HIGH confidence)** — Production fallback
  policy on post-condition violation: **log + return result-as-computed**.
  Dev/test: throw `BridgeMergeContentLossError` with full inputs and lost
  substring. Prod: structured JSON log (event `bridge-merge-content-loss`
  with base, mine, theirs, result, lostSubstrings) + metrics counter + return
  merge result unchanged. Rationale: collaborative editors (Google Docs,
  Notion, Figma, Linear) prioritize "keep typing" over surfacing errors;
  version-history + shadow-git primitives provide user-facing recovery if
  loss is noticed; telemetry gives us the signal to keep iterating on
  Buckets 0/A/B until the failure class is eliminated.

- **D4 (LOCKED, scope boundary, HIGH confidence)** — Single-CRDT collapse
  (Peritext via Yjs 14 or Automerge) is **OUT OF SCOPE** for this spec.
  Subsequent spec to follow once this one ships. Rationale: per research
  (`reports/three-way-merge-content-preservation/REPORT.md` §D3), only
  single-CRDT collapse provides STRUCTURAL content-preservation under
  arbitrary interleavings; everything in Buckets 0/A/B/C is a refinement
  within the dual-CRDT model with academic-proven limits. Ship the 4
  buckets first; the post-condition (R1) + elevated fuzz (R2) generate
  production data that calibrates urgency of the collapse. Not "deferred
  debt" — it's the next spec, separable by design.

  **D4 evidence update (2026-04-16):** Deep source-traced research published
  at `reports/yjs-14-ecosystem-adoption/REPORT.md` materially strengthens the
  LOCKED posture. Key findings that shift the calculus AWAY from near-term
  collapse:

  - **Yjs 14 + Hocuspocus is structurally incompatible at the import layer.**
    `lib0` major version split (Hocuspocus ^0.2.x vs @y/* ^1.0.0-rc.x) +
    different npm package identifiers (`yjs` vs `@y/y`) cannot be resolved
    via `npm overrides`. Either stay on Hocuspocus + force `yjs@14` via
    unsupported overrides, OR swap Hocuspocus entirely (~2,000-LOC framework
    rewrite on `@y/websocket-server@0.1.5`'s 281-LOC starter, which is
    missing 13 of 17 Hocuspocus features we use).
  - **TipTap + Hocuspocus are not migrating.** `@tiptap/y-tiptap@3.0.3`
    shipped 2026-04-08 STILL pinning `yjs ^13.5.38`; `@hocuspocus/server@4.0.0-rc.5`
    shipped 2026-04-16 STILL pinning `yjs ^13.6.8`. Hocuspocus v4 invented
    its own typed-origin solution (parallel-implementation signal — they
    don't plan to wait for v14). Production migration would require forking
    5 packages (`@tiptap/y-tiptap`, `@tiptap/extension-collaboration`,
    `@tiptap/extension-collaboration-cursor`, `@tiptap/extension-drag-handle`,
    `@hocuspocus/server`).
  - **BlockNote "design partner" has zero public code progress.** Sharpened
    from the prior "committed design partner" framing via Path C update:
    `@blocknote/core@0.48.1` published 2026-04-16 still pins `yjs@^13.6.27`,
    imports no `@y/*` packages, has zero branches named v14/yjs-14/attribution/
    track-changes/versioning, and zero commits in the last 30 days mention
    Yjs 14. 2.5 months after the FOSDEM 2026 talk, public code progress = zero.
    Consequence: "wait 6 months for BlockNote to ship and the ecosystem follows"
    is no longer a defensible near-term bet.
  - **Dual-view binding gap is ecosystem-universal, not Yjs-specific.** Both
    `@y/codemirror@0.0.0-3` (`y-sync.js:209` string cast) AND
    `loro-codemirror@0.3.3` (`sync.ts:64` non-text filter) bind flat-text
    only. `loro-prosemirror@0.4.3` requires disjoint `LoroMap<{nodeName,
    attrs, children}>` shape. SchoolAI/loro-extended has no CM adapter.
    **Choosing Loro instead of Yjs 14 does NOT unlock single-YType dual-view
    — it relocates the bridge to different primitives.** Swapping CRDTs
    doesn't eliminate the architectural work Buckets 0/A/B/C are doing.
  - **Wire-format interop empirically CONFIRMED** (reduces one migration
    risk). Harness at `reports/yjs-14-ecosystem-adoption/evidence/wire-format-interop-harness.md`
    exercised 28 cross-version decode directions (yjs@13.6.30 ↔ @y/y@14.0.0-rc.13),
    all passed with byte-for-byte round-trip equivalence. Persistence-migration
    (481-byte doc) loads identical. Sync protocol interop both ways.
    When collapse time comes, user data on disk is NOT a blocker.
  - **Maintainer himself flags v14 as broken alpha.** dmonad on issue #751
    (2025-11-30): "please don't open bug reports against alpha software
    (x.x.x-*) yet. I know that these releases are broken." `@y/y` at 9,822
    weekly downloads vs `yjs` at 3.566M (0.275%). Zero of ~60 surveyed
    production users are on Yjs 14.

  **Net implication for D4:** The collapse is even more clearly a SEPARATE
  SPEC that should wait until (a) Yjs 14 stable ships (best-guess Q3-Q4 2026),
  (b) Hocuspocus or a structural equivalent publishes `yjs ^14` peer-dep,
  (c) BlockNote or another production user ships to npm with `@y/*` deps.
  Bucket A's post-condition + telemetry remain the right calibration signal.
  Tactical surprise: an unrelated production bug surfaced during this
  research — `patches/y-prosemirror@1.3.7.patch` only patches the y-prosemirror
  node_modules, but our production code imports from `@tiptap/y-tiptap` (a
  vendored fork, 2250 LOC, unpatched) — the destructive-delete safety net is
  currently bypassed. Worth a separate story to fix on Yjs 13 today,
  independent of any migration decision. See
  `reports/yjs-14-ecosystem-adoption/evidence/y-prosemirror-v1-vs-y-prosemirror-v2-source-diff.md`
  "patch coverage gap" finding.

- **D5 (LOCKED, evidence-based, HIGH confidence)** — Bucket B Yjs hook:
  **`doc.on('afterAllTransactions', ...)`** (per-drain), not `afterTransaction`
  (per-transaction). Rationale: one Hocuspocus WebSocket message = one
  outermost `transact()` = one `afterAllTransactions` fire; ecosystem precedent
  (y-prosemirror production use at `sync-plugin.js:666-667`); research-exhaustive
  source-trace across Transaction.js + Doc.js + encoding.js + Hocuspocus
  MessageReceiver. Evidence: `reports/yjs-transaction-settlement-hooks/REPORT.md`
  §D1, §D2, §D3, §D4.

- **D6 (LOCKED, 1-way door, HIGH confidence)** — Bucket 0 expanded scope.
  (a) Typed `paired: boolean` marker on `LocalTransactionOrigin.context`,
  not hardcoded `isPairedWriteOrigin` set. (b) All 4 paired origins marked
  (AGENT_WRITE, FILE_WATCHER, ROLLBACK, MANAGED_RENAME — Investigation 2
  source-verified that ROLLBACK + MANAGED_RENAME atomically write both
  CRDTs in their transacts). (c) Symmetric short-circuit in BOTH Observer
  A AND Observer B (currently Observer B lacks the branch). (d) Add
  MANAGED_RENAME to `BRIDGE_ENFORCING_ORIGINS`. **Precedent #1 alignment**:
  typed markers over hardcoded enforcement sets. See R0-R0h.

- **D7 (LOCKED, HIGH confidence, honest framing)** — **Bucket 0 is harm
  reduction, not primary fix.** The seed-`1776386718697` corruption is
  placed into Y.Text by Yjs's RGA protocol at `Item.integrate`:429-482
  BEFORE any observer fires — a paused client's stale-anchored insert
  lands at a tombstoned origin reference, which after a paired write
  falls INSIDE the freshly-written content. Bucket 0 prevents Observer
  B from later re-propagating the corruption; it does NOT prevent the
  initial RGA placement. Server-side rebase of pending inbound updates
  (the only path that would fix the RGA mechanism) is out of scope per
  §3 Non-goals (no Hocuspocus hook, OT-on-CRDT architectural cost).
  **This framing is load-bearing for R0h's empirical gate** — we do NOT
  gate on seed-1776386718697 passing 100/100 post-Bucket-0. We gate on
  R9 telemetry showing the rate is bounded and characterized.

- **D8 (LOCKED, MEDIUM-HIGH confidence)** — Silent named-checkpoint on
  post-condition violation via new generic `saveInMemoryCheckpoint`
  primitive. Replaces the initially-proposed toast approach. Rationale:
  Notion-esque user expectations — users do NOT want toasts that say
  "your edit may have been affected" (trust erosion). They DO want a
  version-history-based recovery path when they notice loss. Pattern
  matches Notion's duplicate-page-on-offline-merge shape: silent in the
  moment, predictable recoverable artifact, no new UI surface. Generic
  primitive (precedent #2) with initial callers: R7 bridge-merge-loss +
  R7e external-change-rescue consolidation. Evidence:
  `reports/collab-editor-silent-loss-ux-patterns/REPORT.md` Part 2;
  `/explore` checkpoint architecture trace.

- **D9 (LOCKED, evidence-based, HIGH confidence)** — Invariant (c) needs
  order-preservation side-check. Invariant (c) maximal-unique-substring
  alone passes when
  merge reorders substrings but preserves their chars. For markdown with
  many similar blank lines and headings (Khanna-Pierce counter-example
  shape), reordering is a real failure mode. O(k²) side-check (k ≤ 10
  typically) closes the gap. Evidence: Challenge F6.

### DELEGATED (implementer decides via spike/evidence during implementation — all reversible)

- **D14 (DELEGATED).** R5b client observer debounce audit outcome. Spike measures
  `serialize(fragment)` + baseline-refresh cost per transaction on
  representative large doc + verifies Bug-B gate moot under precedent #14.
  (a) If cost ≤ ~5 ms p99 AND Bug-B gate moot → delete all 4 client
  `setTimeout` sites; baseline refreshes synchronously per transaction.
  (b) If cost too high OR Bug-B gate still load-bearing → extract all 4
  sites into `packages/app/src/editor/client-observer-timing.ts` and
  retain debounce. Decide during Bucket B implementation.
- **D10 (DELEGATED).** Quiescence gate implementation in fuzz harness (`awaitDocQuiescence(doc)`):
  (a) `beforeAllTransactions` / `afterAllTransactions` bracket counter → resolve
  when counter returns to zero for N consecutive microtasks, or (b) promise
  resolved inside a one-shot `afterAllTransactions` listener. Decide via
  spike during Bucket B implementation.
- **D11 (LOCKED, review iteration 5).** Fuzz sample count CI time budget. Split
  by tier: PR tier (`STRESS_FUZZ_PR=1`) runs 200 seeds, calibrated for the
  15-min Tier 1 budget under turbo parallel contention + 60 s convergence
  tail. Nightly (`STRESS_FUZZ_NIGHTLY=1`) runs 10 000 seeds. Weekly
  (`STRESS_FIDELITY=1`) runs the fidelity PBTs at 10 K fast-check samples.
  Not sharded via `matrix.seed-shard` — split-by-tier is simpler and
  avoids shard-timing variance. Env declared in `turbo.json`'s
  `test:fuzz:bridge` task so the cache key is correct; `ci.yml` exports
  `STRESS_FUZZ_PR=1` on the PR matrix entry. The fuzz harness logs
  `[bridge-convergence fuzzer] mode=<pr|nightly|default|custom> seeds=<n>`
  at startup so reviewers can verify coverage in CI logs.
- **D12 (DELEGATED).** R0e determinism approach: full deterministic via scheduler DI +
  new `pauseOutbound` primitive on `ControllableWebSocket` (Challenge F7),
  OR probabilistic (run-many-times, rate-based acceptance). Spike during
  Bucket 0 implementation.
- **D13 (DELEGATED).** `saveInMemoryCheckpoint` metadata channel: `ok-checkpoint-v1:`
  body line (piggyback on existing `ok-contributors:` convention), OR
  `git notes` (isolated), OR separate `refs/rescue/*` namespace. Decide
  once B1 (parseContributors tolerance) is verified.

---

## 11) Open Questions

### Resolved via research

- **Q1 (RESOLVED).** Yes — `afterAllTransactions` fires once per outermost
  `doc.transact()` drain; one Hocuspocus WebSocket message = one transaction =
  one fire. Evidence: `reports/yjs-transaction-settlement-hooks/REPORT.md` §D1, §D3.
- **Q2 (RESOLVED).** `Y.encodeStateAsUpdate(doc, baseSV)` operates at Y.Doc
  granularity, not Y-type granularity — cannot directly replace diff3+DMP in
  our bridge since both Y.XmlFragment + Y.Text share one Y.Doc. State-vector
  sync is the right primitive for peer-to-peer (already done by WebSocket
  layer), not for bridge type-boundary translation. Evidence:
  `reports/three-way-merge-content-preservation/REPORT.md` §D4.
- **Q3 (RESOLVED).** No adverse coalescing impact. Yjs transaction-boundary
  batching naturally coalesces bursty updates; current code paths issue
  exactly one `transact()` per logical operation, so no real-world coalescing
  is lost. Evidence: `reports/yjs-transaction-settlement-hooks/REPORT.md`
  §D1 (per-drain firing semantics) + "Correctness Equivalence Summary"
  table (single-edit + inbound-merge scenarios).
- **Q5 (RESOLVED).** Yes — Khanna-Kunal-Pierce 2007 formally proves diff3 is
  not idempotent (Fact 4.2.2), not near-success-on-similar-replicas
  (Fact 4.3.2), not stable (Fact 4.4.2). No purely-state-based three-way
  merge can preserve content under arbitrary interleavings. Hybrid
  diff3+DMP inherits this.
  Bucket C reframed as "characterize + pin residuals + emit telemetry"
  rather than "fix the algorithm to be fully correct." Structural fix
  = single-CRDT collapse (FW-1). Evidence:
  `reports/three-way-merge-content-preservation/REPORT.md` §D3.

### Resolved during implementation

- **Q4 (PARTIALLY RESOLVED).** US-014 committed the empirical reproduction
  command + D7 framing preservation to
  `evidence/seed-1776386718697-post-bucket-0-rate.md`. The full 100× rate
  characterization is a post-merge observation the user collects from the
  R9 telemetry feed; D7's residual-framing prediction stands. If
  post-merge residual is unexpectedly zero, update D7 framing.
- **Q7 (RESOLVED).** US-004 verified empirically: `parseContributors`
  (`packages/core/src/shadow-repo-layout.ts`) silently skips unknown
  body-line prefixes, so `ok-contributors:` and `ok-checkpoint-v1:` coexist
  on the same commit body. Regression test asserts this in
  `shadow-repo-layout.test.ts`. Body-line metadata channel locked (D13).
- **Q8 (RESOLVED).** US-004 verified empirically: 5 concurrent
  `saveInMemoryCheckpoint` calls each produce a distinct ref. Per-call
  `randomUUID`-suffixed tmp-index files (`shadow-repo.ts`) isolate index
  builds; git's ref-update CAS on `update-ref` handles the ref write under
  contention. No in-process mutex needed.
- **Q9 (RESOLVED).** Ref namespace locked to `refs/checkpoints/<branch>/<sha>`
  per US-004 / US-007 — reuses the existing timeline enumeration. R7c's
  kind-aware TimelinePanel rendering (US-006) provides the visual
  distinction between `'save'`, `'bridge-merge-loss'`, and
  `'external-change-rescue'` entries.

### Active

- **Q6.** Production rate of `bridge-merge-content-loss` +
  `bridge-merge-checkpoint-created` post-ship. Answers SS-1 urgency.
  Resolved by 30-day post-launch observation window against the US-013
  counters (`GET /api/metrics/reconciliation`).

---

## 12) Assumptions

- **A1 (CONFIRMED)** — `doc.on('afterAllTransactions', ...)` is stable in
  yjs 13.6.30, production-used by y-prosemirror, fires synchronously after
  outermost `transact()` drains. Source-verified at
  `node_modules/yjs/src/utils/Transaction.js:391-396`. Evidence:
  `reports/yjs-transaction-settlement-hooks/REPORT.md` §D1.
- **A2 (CONFIRMED)** — Reentrancy: handler calling `doc.transact()` inside
  `afterAllTransactions` starts a new outermost drain. Batch-skip
  predicate correctly excludes the observer's own writes. Evidence: same
  report §D5.
- **A3** — `applyFastDiff`'s character-level DMP is content-preserving for
  its contract (two-way diff round-trip), but the Path B call-site wraps
  it around `mergeThreeWay`'s output — the loss class is in `mergeThreeWay`
  itself (`mergeConflictRegion` using `diff_main` as a 3-way resolver;
  per `reports/three-way-merge-content-preservation/REPORT.md` §D2).
  R1 post-condition catches this.
- **A4** — Fuzz oracle (d)'s "marker prefix" check may be subsumable by
  post-condition (c). Verify during Bucket A implementation (R8).

---

## 13) Risks & mitigations

- **Risk K1.** Removing debounce causes thrashing (observer fires on every
  keystroke instead of coalesced batches).
  - **Mitigation.** `afterAllTransactions` coalesces by transaction boundary.
    One user keystroke = one transaction = one settlement tick. Verified
    via research: `reports/yjs-transaction-settlement-hooks/REPORT.md` §D4.
    Profile before/after during Bucket B implementation as smoke-check.
- **Risk K2.** Invariant (c) reordering miss (per Challenge F6). A merge
  that reorders but preserves chars passes (c).
  - **Mitigation.** D9 adds weak order-preservation side-check to R1.
    Reordering caught; state-based ceiling (Pijul-grade order preservation)
    is unattainable for this architecture per research §D3.
- **Risk K3.** Post-condition false-positives on legitimate merges.
  - **Mitigation.** Fuzz at 10k seeds exposes false positives; pin as T*+
    regressions; calibrate invariant if needed.
- **Risk K4.** R0e (T8 regression test) non-determinism — network arrival
  timing may not be controllable via scheduler DI alone (per Challenge F7).
  - **Mitigation.** D12: spike to decide between adding `pauseOutbound`
    primitive vs probabilistic rate-based acceptance.
- **Risk K5.** `commitWip` concurrent-safety under same-process
  invocation (Q8). If unsafe under contention, R7a git-commits could
  corrupt.
  - **Mitigation.** Verify during R7a implementation; add in-process
    mutex if needed. Fire-and-forget pattern isolates failures from the
    hot path.
- **Risk K6.** `parseContributors` intolerance of sibling `ok-checkpoint-v1:`
  lines (Q7) — could regress contributor parsing.
  - **Mitigation.** D13: verify during R7a; fallback to `git notes`.
- **Risk K7.** User-visible surprise if silent checkpoints accumulate
  noisily in TimelinePanel (high loss rate → cluttered history).
  - **Mitigation.** R9 telemetry bounds expected rate; if post-ship rate
    is high, R7c can add coalescing ("N checkpoints in the last hour"
    summarization). Anticipated rate per research: 1-2% of Path B firings
    → ≪ 1 checkpoint per doc per day for typical use.

---

## 14) In Scope

Enumerated from §6:

**Bucket 0 — Paired-write symmetry** (harm reduction per D7):
R0 (typed marker), R0b (mark 4 paired origins), R0c (symmetric short-circuit A+B),
R0d (MANAGED_RENAME → BRIDGE_ENFORCING_ORIGINS), R0e (T8 FILE_WATCHER),
R0f (T9 ROLLBACK), R0g (T10 MANAGED_RENAME), R0h (seed-1776386718697 empirical gate, honest framing).

**Bucket A — Correctness guardrail + silent recovery**:
R1 (post-condition c + order-preservation side-check), R2 (elevated fuzz sampling),
R3 (pinned regression fixtures), R7 (silent in-memory checkpoint on violation),
R7a (saveInMemoryCheckpoint primitive), R7b (Observer A Path B integration),
R7c (TimelinePanel kind-aware rendering), R7d (parseCheckpoint helper),
R7e (rescue-buffer WRITE-site consolidation — external-change + branch-switch),
R7f (rescue-buffer READ-path migration — `/api/rescue` reads timeline refs),
R8 (oracle-check relationship table).

**Bucket B — Debounce-window race closure**:
R4 (afterAllTransactions migration), R5 (awaitDocQuiescence in fuzz harness),
R5b (extract client typing-defer to dedicated module),
R6 (precedent #13(b) enforcement grep test).

**Bucket C — Honest residual characterization + telemetry**:
R9 (structured telemetry for bridge-merge-content-loss + checkpoint-created),
R11 (characterize residual failing seeds as T8+).

**Cross-cutting**:
R10 (strict typing, no `any`/`unknown`), R12 (CLAUDE.md updates with target texts),
R13 (no deferred debt in this spec's scope).

---

## 15) Subsequent Specs

(Relabeled from "Future Work" per audit F5 — these are separable successor
specs, not deferred debt. The greenfield directive rejects "defer to future";
it does not reject "next spec.")

- **SS-1: Single-CRDT collapse.** Per research §D3 + §D5 + Recommendation 4,
  the only structurally-correct long-term answer. **Being actively explored
  in a parallel spec** (user-driven; D4-LOCKED). Candidates per
  `reports/single-crdt-collapse-alternatives/REPORT.md` three-axis ranking:
  Automerge 2.2+ (first on production-readiness + cost, realistic 14-18 wk),
  Loro (first on greenfield alignment but blocked by open data-loss issue
  #77), Peritext-on-Yjs-14 (ecosystem immature as of 2026-04-16, not
  production-viable in current window). This spec's R9 telemetry + R7
  checkpoint creation rate feed urgency calibration for SS-1's
  effort-vs-harm trade-off.
- **SS-2: V0-14 agent-undo handler.** Will inherit the bridge invariants
  this spec establishes (typed paired marker, symmetric Observer A/B
  short-circuit, post-condition, settlement). STOP rules in CLAUDE.md
  already enumerate V0-14 constraints.
- **SS-3: Shutdown-flush rescue consolidation.** R7f migrates the two
  content-loss rescue-buffer paths (reconcile-delete, branch-switch) to
  timeline refs, and `/api/rescue` reads merged from both sources. The
  shutdown-flush path (`standalone.ts:565-604`) remains flat-file in this
  spec (timeline-noise tradeoff rejected — every shutdown × N dirty docs
  would create timeline rows). A subsequent spec could migrate shutdown-flush
  to timeline refs if operational value justifies it; unclear today.

**Not tracked here** (outside our ownership):
- Upstream `remarkParse` super-linearity — tracked by sister
  `markdown-pipeline-engineering-health` spec.

---

## 16) Agent Constraints

**SCOPE** (files, directories, systems implementation SHOULD touch):
- `packages/core/src/bridge/merge-three-way.ts` — post-condition + error
  class (R1)
- `packages/core/src/bridge/` — potentially add post-condition helper
  utilities
- `packages/server/src/server-observers.ts` — symmetric short-circuit +
  settlement migration (R0c, R4) + R7b integration
- `packages/server/src/server-observer-extension.ts` — thread shadow/
  contentRoot/docName/branch into `SetupServerObserversOpts`
- `packages/server/src/agent-sessions.ts` — `AGENT_WRITE_ORIGIN.context.paired = true` (R0b)
- `packages/server/src/external-change.ts` — `FILE_WATCHER_ORIGIN.context.paired = true` (R0b) + rescue-buffer consolidation (R7e)
- `packages/server/src/api-extension.ts` — `ROLLBACK_ORIGIN.context.paired = true` + `MANAGED_RENAME_ORIGIN.context.paired = true` (R0b); `/api/rescue` + `/api/rescue/<docName>` handlers at `:2246, 2296` read from timeline refs (R7f)
- `packages/server/src/shadow-repo.ts` — new `saveInMemoryCheckpoint` primitive (R7a)
- `packages/server/src/standalone.ts` — rescue-buffer write-site migration (R7e)
- `packages/core/src/shadow-repo-layout.ts` — new `parseCheckpoint` helper (R7d)
- `packages/app/src/editor/observers.ts` — extract typing-defer (R5b);
  post-extraction must be `setTimeout`-free
- `packages/app/src/editor/typing-defer.ts` — NEW module extracted from observers.ts (R5b)
- `packages/app/src/components/TimelinePanel.tsx` — kind-aware row rendering (R7c)
- `packages/app/tests/integration/test-harness.ts` — `awaitDocQuiescence` primitive (R5) + `BRIDGE_ENFORCING_ORIGINS` update (R0d)
- `packages/app/tests/integration/network-control.ts` — potentially `pauseOutbound` primitive if D12 spike requires (R0e)
- `packages/app/tests/integration/*.test.ts` — T8/T9/T10 regression tests (R0e-g); R5 wait-cleanup
- `packages/app/tests/stress/bridge-convergence.fuzz.test.ts` — sample count + reporting (R2); `awaitDocQuiescence` adoption (R5)
- `packages/server/src/server-observers.test.ts` — symmetric Observer A/B tests
- `packages/core/src/bridge/merge-three-way.test.ts` — pinned T8+ regressions (R3)
- `CLAUDE.md` — precedent + STOP rule updates (R12)
- `specs/2026-04-15-lossless-bridge-merge/evidence/algorithm-comparison-experiment.md` — append T8+ (R3)

**EXCLUDE** (areas explicitly out of bounds):
- Single-CRDT collapse code paths (SS-1 is a parallel spec).
- V0-14 `applyAgentUndo` handler (SS-2).
- Automerge / Peritext / Loro / Yjs 14 migration code.
- Client-side TipTap / CodeMirror user-facing debounce semantics
  (not bridge primitives).
- Server-side rebase / OT-layer / Hocuspocus hook extensions (§3 Non-goals).
- Persistence 2000ms debounce on Y.Doc → disk (§3 Non-goals).
- (none — R7f now scopes in reader migration, so this item is removed)

**STOP_IF** (conditions requiring review before proceeding):
- R4 settlement migration causes a regression in the existing C1-C10
  integration test suite → STOP and diagnose before proceeding.
- R0e T8 regression test cannot be made deterministic via R5 primitives
  alone → STOP and escalate D12 decision (pauseOutbound primitive vs
  probabilistic acceptance).
- `parseContributors` (Q7) is intolerant of sibling body lines → STOP
  and revisit R7a metadata channel (D13).
- `commitWip` concurrent safety (Q8) reveals contention bugs → STOP
  and add mutex before rollout.
- Post-condition invariant (c + order-preservation) produces false
  positives under 10k-seed fuzz → STOP and recalibrate before ship.
- Any change would widen `LocalTransactionOrigin` semantics beyond
  `context.paired?: boolean` addition → STOP (scope creep into origin
  schema redesign; out of this spec).

**ASK_FIRST** (require confirmation):
- Any change to `BRIDGE_ENFORCING_ORIGINS` membership beyond adding
  MANAGED_RENAME (R0d).
- Any change to the set of paired origins beyond the 4 enumerated in R0b.
- Any change to the precedent #11(b) / #13(b) CLAUDE.md target text
  beyond R12's enumeration.
- Any introduction of new wall-clock `setTimeout` in bridge code (even
  temporarily during debugging).

---

## Changelog

- **2026-04-16** — Scaffold created. Three-bucket scope defined. `/spec` iteration begins.
- **2026-04-16** — Worldmodel + 4 parallel Opus investigations complete. Bridge explore, Yjs settlement research, three-way-merge research, fuzz harness reproduction (seed `1776386718697` reproduced 2/5).
- **2026-04-16** — D1-D5 LOCKED (Bucket 0 add, invariant c, log+keep-typing fallback, single-CRDT out-of-scope, afterAllTransactions hook).
- **2026-04-16** — Audit + challenger Opus subprocesses complete. Audit: 15 findings (2H/7M/6L). Challenger: 11 findings (4H/5M/2L).
- **2026-04-16** — /assess-findings complete. Four deep follow-up Opus investigations: Yjs RGA mechanism verified (Bucket 0 is harm reduction, not primary fix); ROLLBACK + MANAGED_RENAME confirmed paired writers; server-side rebase ruled out (no Hocuspocus hook); typed paired marker confirmed trivial.
- **2026-04-16** — Notion-esque UX reframing: R7 silent-checkpoint replaces toast approach. Users expect Google-Docs-grade "edits always land" — toasts erode trust. Silent + named version-history artifact matches Notion's duplicate-on-merge pattern.
- **2026-04-16** — D6-D9 LOCKED (Bucket 0 scope expansion, harm-reduction framing, silent-checkpoint approach, order-preservation side-check). Refined R7 /assess-findings pass: use `saveInMemoryCheckpoint` generic primitive over specific name; discriminated union metadata (R10-aligned); 2 concrete initial callers (R7 + rescue-buffer consolidation R7e), not 5 speculative uses.
- **2026-04-16** — All locked decisions cascaded to SPEC: §1 Complication (mechanism honest), §1 Resolution (4 buckets + framing), §3 Non-goals (SS-1 parallel + rebase out), §5 User journeys populated (J1-J5), §6 Requirements restructured (Bucket 0 expanded with R0-R0h, Bucket A with R1+R7a-e+R8, Bucket B with R4-R6+R5b, Bucket C with R9+R11), §7 Metrics updated (M1-M10), §8 Current state populated, §9 Proposed solution (Bucket 0 + Bucket A + R7a + Bucket B + oracle table), §10 Decision Log (D1-D9 LOCKED, D10-D13 implementation-pending), §11 OQ (Q1/Q2/Q3/Q5 RESOLVED, Q4/Q6/Q7/Q8/Q9 active), §12 Assumptions (A1/A2 CONFIRMED), §13 Risks (K1-K7), §14 In Scope enumerated, §15 relabeled SS-1/2/3, §16 Agent Constraints populated.
