# Audit Findings — Round 2

**Artifact:** `specs/2026-04-16-bridge-correctness/SPEC.md`
**Audit date:** 2026-04-16
**Baseline commit:** `432a834b` (worktree), `bb655f7b` (parent repo main)
**Total findings:** 14 (3 High, 6 Medium, 5 Low)

**Scope verified:**
- Every `file:line` citation in SPEC.md (§6 requirements, §8 current state, §9 proposed solution, §10 decision log, §11 open questions, §16 agent constraints) against source at baseline `432a834b`.
- Every `§Dx` citation against `reports/yjs-transaction-settlement-hooks/REPORT.md` and `reports/three-way-merge-content-preservation/REPORT.md`.
- Every numbered requirement (R0-R13 including R0b-h, R5b, R7a-e) for resolution completeness.
- Internal coherence between §1 Complication, §6 R0/R0h, §10 D1/D7 (RGA mechanism / harm-reduction framing).
- Existence and shape of cited reports (`single-crdt-collapse-alternatives/REPORT.md`, `collab-editor-silent-loss-ux-patterns/REPORT.md`).
- Round-1 findings (15) for correct resolution status — 5 still open (1 M, 4 L).
- Typed `paired: boolean` marker feasibility against `@hocuspocus/server/dist/index.d.ts:418-422`.
- `parkBranch` template at `shadow-repo.ts:282-367` for R7a.
- Rescue-buffer sites at `standalone.ts:411, 962, 565-604` for R7e.
- Yjs RGA mechanism at `node_modules/yjs/src/structs/Item.js:420-485`.

---

## High Severity

### [H] Finding 1: Two cited reports do not exist — `collab-editor-silent-loss-ux-patterns/REPORT.md` and `single-crdt-collapse-alternatives/REPORT.md`

**Category:** FACTUAL (DECISION-IMPLICATING for D8)
**Source:** T1 (own filesystem)
**Location:** SPEC.md line 14 (header "Related"); line 127 (§3 Non-goals); line 713-714 (D8 rationale); line 901-905 (§15 SS-1)
**Issue:** The SPEC cites two reports that do not exist at the claimed paths.

1. **`reports/collab-editor-silent-loss-ux-patterns/REPORT.md`** — does NOT exist in the worktree OR the parent repo. Only `evidence/` subdirectory exists (6 files: `production-editor-survey.md`, `silent-failure-rationale.md`, `notification-patterns-catalog.md`, etc.). Cited at:
   - Line 14: `reports/collab-editor-silent-loss-ux-patterns/REPORT.md (Bucket A R7 UX grounding)`
   - Line 713-714 (D8 rationale): `Evidence: reports/collab-editor-silent-loss-ux-patterns/REPORT.md Part 2`

2. **`reports/single-crdt-collapse-alternatives/REPORT.md`** — does NOT exist in the worktree OR the parent repo. Only `evidence/` exists (`c1-peritext-on-yjs-14.md`, `c2-automerge.md`, `c3-loro.md`, `c4-custom-pm-native-crdt.md`, `synthesis-comparison.md`). Cited at:
   - Line 127: `reports/single-crdt-collapse-alternatives/REPORT.md for candidate comparison (Automerge 2.2+ ranked first...)`
   - Line 900-904 (§15 SS-1): `candidates: Automerge 2.2+ (ranked first per reports/single-crdt-collapse-alternatives/REPORT.md)...`

**Current text (line 14):**
> `reports/collab-editor-silent-loss-ux-patterns/REPORT.md` (Bucket A R7 UX grounding)

**Current text (line 713-714):**
> Evidence: `reports/collab-editor-silent-loss-ux-patterns/REPORT.md` Part 2; `/explore` checkpoint architecture trace.

**Evidence:**
```
$ ls /Users/edwingomezcuellar/projects/open-knowledge/reports/collab-editor-silent-loss-ux-patterns/
ls: no such file or directory
$ ls /Users/edwingomezcuellar/projects/open-knowledge/.claude/worktrees/bridge-correctness/reports/collab-editor-silent-loss-ux-patterns/
evidence
$ ls /Users/edwingomezcuellar/projects/open-knowledge/reports/single-crdt-collapse-alternatives/
evidence
```

**Status:** CONTRADICTED
**Why DECISION-IMPLICATING for D8:** D8 is LOCKED (silent-checkpoint approach). Its rationale cites `collab-editor-silent-loss-ux-patterns/REPORT.md Part 2` as evidence. If that report doesn't exist, D8's evidence anchor is a dangling reference — the cited rationale cannot be verified by a reader. The underlying evidence (the `evidence/` files) exists, but the SPEC doesn't cite those directly.
**Suggested resolution:**
- For `collab-editor-silent-loss-ux-patterns`: Either (a) produce a `REPORT.md` synthesizing the evidence, or (b) change all citations to reference the specific evidence files (e.g., `evidence/production-editor-survey.md`, `evidence/silent-failure-rationale.md`). Option (b) is faster; option (a) is cleaner for the `reports/` catalog.
- For `single-crdt-collapse-alternatives`: Same pattern — cite `evidence/synthesis-comparison.md` directly, which contains the four-candidate ranking.

---

### [H] Finding 2: D1 rationale ("proximate fix") contradicts D7 rationale ("not primary fix") for the same decision subject

**Category:** COHERENCE (INCOHERENT)
**Source:** L1 (cross-finding contradictions)
**Location:** SPEC.md lines 635 (D1 rationale) vs lines 690-691 (D7 rationale)
**Issue:** D1 and D7 describe Bucket 0's effect on seed `1776386718697` with language that a cold reader perceives as contradictory.

- **D1 (line 635):** "Rationale: **proximate fix for characterized seed-`1776386718697` race**; evidence in `evidence/seed-1776386718697-characterization.md`"
- **D7 (line 690-691):** "**Bucket 0 is harm reduction, not primary fix.** The seed-`1776386718697` corruption is placed into Y.Text by Yjs's RGA protocol ... BEFORE any observer fires"

A reader encountering D1 first reasonably concludes "Bucket 0 is the fix." A reader encountering D7 first reasonably concludes "Bucket 0 does not fix the seed." The two framings are reconcilable only via a subtle reading of "proximate" (meaning "closest to the observer layer" rather than "closest to the primary cause"), which is not the natural interpretation of the word.

This contradicts the spec's own documented intent — R0h (line 258-264) is explicit: "Bucket 0 is harm reduction against Observer B re-propagation. The primary RGA-level placement is NOT prevented. We therefore **expect** residual rate at this seed; we do NOT gate on 100/100."

**Current text (D1, line 633-642):**
> **D1 (LOCKED, 1-way door, HIGH confidence)** — Add Bucket 0: Observer B paired-write symmetry. Rationale: proximate fix for characterized seed-`1776386718697` race; evidence in `evidence/seed-1776386718697-characterization.md` ...

**Status:** INCOHERENT
**Suggested resolution:** Update D1's rationale to use the same honest framing as D7. Replace "proximate fix for characterized seed-`1776386718697` race" with something like "addresses the observer-layer amplification of seed-`1776386718697`'s RGA-level corruption (harm reduction, not primary fix — see D7)". This makes D1 consistent with D7 and R0h. The decision to ADD Bucket 0 is unchanged; only the framing is clarified.

Evidence file (`seed-1776386718697-characterization.md` line 124-125) also introduces ambiguity: "(1) alone may resolve seed `1776386718697`." This should be updated to match D7's framing as well ("Bucket 0 prevents downstream amplification; whether it closes the seed fully depends on whether RGA-level corruption alone reproduces the oracle failure").

---

### [H] Finding 3: R5b's typing-defer extraction plan mis-identifies which `observers.ts` lines are typing-defer

**Category:** FACTUAL (DECISION-IMPLICATING for R5b scope)
**Source:** T1 (own codebase)
**Location:** SPEC.md lines 363-367 (R5b); also §8 current state line 458-459
**Issue:** R5b proposes extracting "the client `observers.ts` typing-defer timing logic (lines ~292, 315, 321, 410) into `packages/app/src/editor/typing-defer.ts`." Of the 4 lines cited, only 2 are typing-defer:

- **Line 292:** `debounceA = sched.setTimeout(runObserverASync, DEBOUNCE_MS);` — This is **Observer A's main debounce scheduling** (inside the `observerA` callback at lines 254-293). It debounces the `runObserverASync` baseline-tracking function. Under precedent #14, `runObserverASync` is baseline-update only, but this setTimeout is NOT typing-defer — it's the observer's main coalescing debounce. (See source lines 291-292.)
- **Line 315:** `debounceB = sched.setTimeout(runObserverBSync, waitMs);` — This IS typing-defer. Inside `runObserverBSync` body: `if (elapsedSinceTyping < TYPING_DEFER_MS) { ... debounceB = sched.setTimeout(runObserverBSync, waitMs); ...}`. ✓ typing-defer.
- **Line 321:** `debounceB = sched.setTimeout(runObserverBSync, REMOTE_TREE_SYNC_GRACE_MS - elapsedSinceRemoteTree);` — This is `REMOTE_TREE_SYNC_GRACE_MS` defer, a related-but-distinct mechanism (grace window after a remote XmlFragment change). Arguably related to typing-defer in that it defers Observer B, but it's not the canonical "user is typing" defer — it's a remote-edit grace window.
- **Line 410:** `debounceB = sched.setTimeout(runObserverBSync, DEBOUNCE_MS);` — This is **Observer B's main debounce scheduling** (inside the `observerB` callback at lines 393-411). Same shape as line 292 for Observer A. NOT typing-defer.

If R5b's extraction moves all 4 lines, it extracts the Observer A/B main callbacks' debounce scheduling — which would make `observers.ts` a near-empty shell. That's a significantly different refactor than "extract typing-defer," with implications for R6's grep gate (the newly-extracted module would be named `typing-defer.ts` but contain the main observer debounce logic).

§8 Current state line 458-459 inherits this error: "4 are client typing-defer in `observers.ts` (R5b-extracted)" — actual: 2 typing-defer (lines 315, 321 if we include grace-window), 2 main observer debounces (lines 292, 410).

**Current text (R5b, lines 363-367):**
> **R5b. Extract client typing-defer into dedicated module** (per Challenge F8). Move the client `observers.ts` typing-defer timing logic (lines ~292, 315, 321, 410) into `packages/app/src/editor/typing-defer.ts`. Makes R6's grep enforcement unambiguous — `observers.ts` becomes `setTimeout`-free, typing-defer module has a distinct name the grep can allow-list.

**Evidence:**
- `packages/app/src/editor/observers.ts:254-293` (observerA callback — line 292 is debounceA scheduling)
- `packages/app/src/editor/observers.ts:308-330` (runObserverBSync body — lines 315, 321 are typing-defer / grace-window)
- `packages/app/src/editor/observers.ts:393-411` (observerB callback — line 410 is debounceB scheduling)

**Status:** CONTRADICTED
**Why DECISION-IMPLICATING for R5b scope:** R5b's locked R6 premise ("`observers.ts` becomes `setTimeout`-free") depends on ALL 4 setTimeouts being extracted. But only 2 are genuinely typing-defer. To achieve `setTimeout`-free `observers.ts`, the extraction must include the main observer debounces — which means `typing-defer.ts` is actually "client-observer-debounce-and-typing-defer.ts" (a combined module), OR `observers.ts` retains its own main debounce setTimeouts (which R6 would then have to allow-list).
**Suggested resolution:** Resolve ambiguity before implementation:
- Option (a) Extract only the true typing-defer logic (lines 315, 321). Keep `observers.ts` owning its main debounce at 292, 410. R6's grep must then allow these 2 lines (with clear markers).
- Option (b) Extract more broadly: rename R5b to "Extract client observer timing primitives into dedicated module" and include main debounces. Module name `client-observer-timing.ts` or similar is more accurate than `typing-defer.ts`.
- Option (c) After migrating to `afterAllTransactions` (R4) on the server, evaluate whether the CLIENT observers — which are baseline-only under precedent #14 — still need any debounce at all. They might be reducible to direct synchronous baseline updates on transactions, eliminating most/all client setTimeouts. This is worth a spike during Bucket B implementation.

---

## Medium Severity

### [M] Finding 4: D5 evidence citation omits §D4 despite the rationale explicitly invoking "ecosystem precedent (y-prosemirror production use)" (round-1 Finding 4 not fixed)

**Category:** FACTUAL
**Source:** T4 (report cross-reference)
**Location:** SPEC.md line 673-678 (D5)
**Issue:** D5's rationale claims "ecosystem precedent (y-prosemirror production use)" but cites only `§D1, §D2, §D3`. §D4 is the report section about y-prosemirror's production use of `afterAllTransactions` (`sync-plugin.js:666-667`). Round-1 Finding 4 flagged this; it remains uncorrected.

**Current text (D5, line 673-678):**
> **D5 (LOCKED, evidence-based, MEDIUM confidence)** — Bucket B Yjs hook: **`doc.on('afterAllTransactions', ...)`** (per-drain), not `afterTransaction` (per-transaction). Rationale: one Hocuspocus WebSocket message = one outermost `transact()` = one `afterAllTransactions` fire; ecosystem precedent (y-prosemirror production use). Evidence: `reports/yjs-transaction-settlement-hooks/REPORT.md §D1, §D2, §D3`.

**Evidence:** `reports/yjs-transaction-settlement-hooks/REPORT.md:119-140` — "### D4. Observer composition pattern (ecosystem prior art)" with the `y-prosemirror/src/plugins/sync-plugin.js:666-667` production-use citation.

**Status:** STALE (unfixed round-1 finding)
**Suggested resolution:** Update D5's evidence citation to `§D1, §D2, §D3, §D4`.

---

### [M] Finding 5: R7e is ambiguous about the rescue-buffer reader path; creates a potential broken read-write asymmetry

**Category:** COHERENCE
**Source:** L1 (cross-finding contradictions), L3 (missing conditionality)
**Location:** SPEC.md lines 328-336 (R7e) + lines 960-961 (§16 EXCLUDE "Rescue-buffer READ path (SS-3 follow-on spec)") + §15 SS-3 (line 912-915)
**Issue:** R7e's text presents two options for backward compatibility and does NOT resolve which is chosen:

> Backward-compat: keep `/api/rescue` endpoints functional by reading from timeline refs instead of flat files, OR keep flat-files co-existing until a follow-on spec migrates the reader.

Reading §16 EXCLUDE and §15 SS-3, it's clear the reader migration is deferred to SS-3. But that choice creates a broken path:

- Migrated write sites (lines 411, 962 → `saveInMemoryCheckpoint`) store rescue content in timeline refs (`refs/checkpoints/<branch>/<sha>`)
- Non-migrated write site (lines 565-604 shutdown-flush) stores rescue content as flat files
- `/api/rescue` readers (unchanged in this spec) read ONLY flat files

Result: after this spec ships, rescue content from the reconcile-delete path and branch-switch path (the 2 migrated sites) will be INVISIBLE to `/api/rescue` endpoints — only the shutdown-flush rescue content will surface. A user trying to recover a file deleted upstream or lost during branch switch would get an empty rescue buffer, despite the content being safely stored in a timeline ref.

If D8 locks this behavior without SS-3 shipping concurrently, the product regresses for the migrated paths. If SS-3 must be shipped concurrently, it's effectively in-scope for this spec but labeled out-of-scope.

**Current text (R7e, line 328-336):**
> **R7e. Rescue-buffer consolidation** (the generic primitive's second concrete caller): migrate existing rescue-buffer write sites (`standalone.ts:411, 962`) from flat-file writes to `saveInMemoryCheckpoint({kind: 'external-change-rescue', ...})`. Shutdown-flush site (`standalone.ts:565-604`) stays as flat-file (timeline-noise tradeoff rejected). Backward-compat: keep `/api/rescue` endpoints functional by reading from timeline refs instead of flat files, OR keep flat-files co-existing until a follow-on spec migrates the reader. **Decision D8 captures this.**

**Evidence:**
- `packages/server/src/standalone.ts:411-425` (reconcile-delete rescue write)
- `packages/server/src/standalone.ts:962-979` (branch-switch rescue write)
- `packages/server/src/standalone.ts:565-604` (shutdown-flush rescue write)
- D8 text (line 704-715) does not actually resolve the reader question — it only describes the write-side primitive.

**Status:** INCOHERENT (acceptance criteria not verifiable)
**Suggested resolution:** Pick one:
- (a) Scope-in the reader migration: add R7f "migrate `/api/rescue` readers to read from timeline refs". Unifies the read path in this spec. SS-3 becomes non-existent (deleted from §15).
- (b) Scope-out R7e's migration of lines 411 and 962: keep all rescue writes as flat-file for this spec; migrate the whole system (readers + writers) in SS-3 together. R7e becomes just the `saveInMemoryCheckpoint` primitive used solely by R7 (bridge-merge-loss).
- (c) Accept the temporary read-write asymmetry but document it clearly in R7e: "post-ship, `/api/rescue` returns empty for the reconcile-delete and branch-switch paths until SS-3 migrates readers" — and gate this on user approval (it IS a product regression).

---

### [M] Finding 6: §8 "4 are client typing-defer in `observers.ts`" mis-describes the debounce topology (follows from Finding 3)

**Category:** COHERENCE + FACTUAL
**Source:** L1 + T1
**Location:** SPEC.md lines 458-459 (§8 Current state)
**Issue:** §8 characterizes the client observers.ts setTimeout sites as "4 ... are client typing-defer in `observers.ts` (R5b-extracted)". Only 2 of the 4 cited lines (315, 321) are typing-defer / grace-window; lines 292 and 410 are main observer debounce scheduling. See Finding 3 for the full enumeration.

**Current text (line 457-459):**
> **Debounce sites**: 10 total `sched.setTimeout` / `setTimeout` calls across bridge surfaces. Of these, 4 are the server-observer bridge debounce we're replacing (R4); 4 are client typing-defer in `observers.ts` (R5b-extracted); 1 is `scheduler.ts:38` defaultScheduler passthrough; 1 is `server-observer-extension.ts:77` 5-second observer-attach retry (escape hatch, not a bridge debounce — retained).

**Status:** CONTRADICTED
**Suggested resolution:** Update to "2 are client typing-defer, 2 are client Observer A/B main debounce (all 4 R5b-extracted per the resolution of Finding 3)" — or whatever R5b resolves to.

---

### [M] Finding 7: R7b cites "evidence/bridge-surface-map.md §B3" — no such section label exists

**Category:** FACTUAL
**Source:** L7 (inline source attribution)
**Location:** SPEC.md lines 314-320 (R7b)
**Issue:** R7b claims the `lastSyncedXmlMd` closure variable is "in scope at the call site per `evidence/bridge-surface-map.md` §B3". The evidence file uses `## Heading` section structure without letter-coded IDs (§B3 doesn't exist). The closest relevant section is `## Path A vs Path B selection` (line 76). The underlying claim is CORRECT (lastSyncedXmlMd IS in scope inside `runObserverASync`, verified at `server-observers.ts:142-197`), but the citation label is fabricated.

**Current text (R7b):**
> **R7b.** Observer A Path B integration: on `BridgeMergeContentLossError`, capture `lastSyncedXmlMd` from the closure (in scope at the call site per `evidence/bridge-surface-map.md` §B3, schedule `queueMicrotask(...)`.

**Evidence:** `evidence/bridge-surface-map.md` has 8 sections — all numerically unlabeled (`## Module structure`, `## Debounce + scheduler topology (Bucket B target)`, `## Origin objects (precedent #1)`, `## Path A vs Path B selection`, etc.). No §B3 label.

**Status:** CONTRADICTED
**Suggested resolution:** Either (a) add letter-coded section labels to bridge-surface-map.md (A1/A2 for Debounce+scheduler, B1/B2/B3 for Path selection, etc.) and re-cite, or (b) replace `§B3` with a more specific citation like `evidence/bridge-surface-map.md "Path A vs Path B selection"`. Option (b) is faster.

---

### [M] Finding 8: Q3 cites `yjs-transaction-settlement-hooks §D4` for a claim better sourced from §D1 + "Correctness Equivalence Summary" section

**Category:** FACTUAL
**Source:** T4 (report cross-reference)
**Location:** SPEC.md line 758-761 (Q3)
**Issue:** Q3's claim is "Yjs transaction-boundary batching naturally coalesces bursty updates; current code paths issue exactly one `transact()` per logical operation, so no real-world coalescing is lost." Cited evidence: §D4.

But §D4 is "Observer composition pattern (ecosystem prior art)" — primarily about y-prosemirror/y-codemirror.next use. The coalescing claim is better supported by:
- §D1 (`afterAllTransactions` precise firing semantics) — fires per-drain, one fire per outermost `transact()`.
- The "Correctness Equivalence Summary" table at report lines 199-208 — scenarios like "Single client edit" → "1 sync at settlement" and "Inbound message merging N peer edits" → "1 sync".
- The "Implementation costs" bullet at line 217: "No implicit coalescing across distinct `transact()` calls. Today's code is one-transact-per-operation."

The underlying claim is correct. The citation is imprecise.

**Current text (Q3, line 758-761):**
> **Q3 (RESOLVED).** No adverse coalescing impact. Yjs transaction-boundary batching naturally coalesces bursty updates; current code paths issue exactly one `transact()` per logical operation, so no real-world coalescing is lost. Evidence: `reports/yjs-transaction-settlement-hooks/REPORT.md §D4`.

**Status:** CONTRADICTED (minor citation mismatch)
**Suggested resolution:** Change evidence to `§D1 + Correctness Equivalence Summary` or `§D1, §D4`. The former is more precise.

---

### [M] Finding 9: §1 "wholesale-replacing Y.Text" is imprecise — `applyExternalChange` uses character-level DMP, not wholesale replace

**Category:** FACTUAL
**Source:** T1 (own codebase)
**Location:** SPEC.md lines 33-37 (§1 Complication)
**Issue:** The SPEC's mechanism description says:
> A paused client's outbound CRDT insert encodes its position as a reference to an Item that, by the time the update reaches the server, has been **tombstoned by a paired write** (e.g., `FILE_WATCHER_ORIGIN` wholesale-replacing Y.Text).

`applyExternalChange` at `packages/server/src/external-change.ts:61-72` does NOT wholesale-replace Y.Text. It uses `applyFastDiff(ytext, currentText, content)` which performs character-level DMP (`apply-diff.ts:112-127`) — preserving unchanged characters. Only CHANGED regions are deleted and re-inserted.

For the specific seed-1776386718697 op-sequence, the external-change transition from M0 to M5 involves wholly different content, so DMP's output IS near-complete delete+insert. But in the general case, the phrase "wholesale-replacing Y.Text" is incorrect — and propagates into the evidence file at line 98 ("wholesale replace of M0-M3 → M5").

The narrative effect is that a reader expecting to find a wholesale-replace pattern in the code won't — they'll find DMP character-level updates. The actual RGA mechanism described is still correct (paused-client insert lands at a tombstoned anchor), but the characterization of the precipitating event understates DMP's behavior.

**Current text (§1, line 33-37):**
> **The mechanism (verified):** A paused client's outbound CRDT insert encodes its position as a reference to an Item that, by the time the update reaches the server, has been **tombstoned by a paired write** (e.g., `FILE_WATCHER_ORIGIN` wholesale-replacing Y.Text).

**Evidence:**
- `packages/server/src/external-change.ts:61-77` (transact block; uses `applyFastDiff`)
- `packages/core/src/bridge/apply-diff.ts:112-127` (applyFastDiff: DMP character-level diff, preserves unchanged chars)

**Status:** CONTRADICTED (imprecise)
**Suggested resolution:** Replace "wholesale-replacing Y.Text" with "replacing Y.Text content via character-level DMP (`applyFastDiff`) — which, when content is wholly different, tombstones most old Items and inserts new ones". Or, more concisely: "replacing Y.Text content (wholesale-equivalent when content is wholly different, as in op 10 of the characterized sequence)".

The evidence file at line 98 similarly should be softened.

---

## Low Severity

### [L] Finding 10: Q5 Facts-to-properties ordering still mismatched — round-1 Finding 10 not fixed

**Category:** FACTUAL
**Source:** L7 + T4
**Location:** SPEC.md line 762-765 (Q5)
**Issue:** Q5 states "not idempotent, not stable, not near-success-on-similar-replicas (Facts 4.2.2 / 4.3.2 / 4.4.2)". Actual facts in `three-way-merge-content-preservation/REPORT.md §D3 (lines 97-99)`:
- Fact 4.2.2 = NOT idempotent
- Fact 4.3.2 = does NOT guarantee near-success on similar replicas
- Fact 4.4.2 = NOT stable

SPEC's order has `stable → 4.3.2` (should be 4.4.2) and `near-success → 4.4.2` (should be 4.3.2). Round-1 Finding 10 flagged this; it remains uncorrected.

**Current text (Q5, line 762-765):**
> **Q5 (RESOLVED).** Yes — Khanna-Kunal-Pierce 2007 formally proves diff3 is not idempotent, not stable, not near-success-on-similar-replicas (Facts 4.2.2 / 4.3.2 / 4.4.2). No purely-state-based three-way merge can preserve content under arbitrary interleavings. Hybrid diff3+DMP inherits this.

**Status:** STALE (unfixed round-1 finding)
**Suggested resolution:** Either reorder the properties to `"not idempotent, not near-success-on-similar-replicas, not stable (Facts 4.2.2 / 4.3.2 / 4.4.2)"` OR reorder the Facts to `"(Facts 4.2.2 / 4.4.2 / 4.3.2)"`.

---

### [L] Finding 11: evidence/bridge-surface-map.md still contains stale counts (269/36) and line numbers (354/388) — round-1 Findings 12-13 not fixed

**Category:** FACTUAL
**Source:** T1 (own codebase re-count)
**Location:** `evidence/bridge-surface-map.md:57`
**Issue:** Round-1 Finding 12 flagged that the evidence file says "269 occurrences across 36 files" for `wait(ms)` in `packages/app/tests/`. Actual current count (re-verified at `432a834b`): **190 occurrences across 28 files**. Round-1 Finding 13 flagged that the evidence file cites fuzz harness lines 354 `wait(1500)` and 388 `wait(800)`. Actual lines: **353** and **387**.

Neither finding was addressed; the numbers in evidence remain stale.

**Current text (bridge-surface-map.md:57):**
> **Test-side `wait(ms)`:** 269 occurrences across 36 files in `packages/app/tests/`. Load-bearing in fuzz harness (lines 354 `wait(1500)` initial settle, 388 `wait(800)` per convergence-poll attempt).

**Evidence:**
```
$ cd /Users/edwingomezcuellar/projects/open-knowledge/.claude/worktrees/bridge-correctness
$ grep -rln "wait(" packages/app/tests/ | wc -l
28
$ grep -r "wait(" packages/app/tests/ | wc -l
190
$ grep -n "await wait(1500)\|await wait(800)" packages/app/tests/stress/bridge-convergence.fuzz.test.ts
353:  await wait(1500);
387:    await wait(800);
```

**Status:** STALE (unfixed round-1 finding)
**Suggested resolution:** Update evidence file to `"190 occurrences across 28 files"` and lines `353 / 387`.

---

### [L] Finding 12: evidence/seed-1776386718697-characterization.md still paraphrases the server-observers.ts:382-384 comment — round-1 Finding 14 not fixed

**Category:** FACTUAL
**Source:** T1 (source comparison)
**Location:** `evidence/seed-1776386718697-characterization.md:88-91`
**Issue:** The evidence file quotes the Observer B comment as:
> // We do NOT skip AGENT_WRITE_ORIGIN/FILE_WATCHER_ORIGIN here — instead, runObserverBSync's
> // already-in-sync gate handles the early-exit harmlessly.

Actual source at `server-observers.ts:382-384`:
> // Already-paired writes: agent-write and file-watcher both write both
> // sides atomically. runObserverBSync will early-exit at the already-in-sync
> // gate, but we skip scheduling entirely to avoid unnecessary work.

The paraphrased quote is NOT a verbatim excerpt. The substantive claim (Observer B does not special-case paired-write origins) is correct — both comments describe the same absence — but round-1 Finding 14 flagged this and it remains uncorrected.

**Status:** STALE (unfixed round-1 finding)
**Suggested resolution:** Replace the paraphrased quote with the actual source text at lines 382-384. Note also that the in-source comment's claim "we skip scheduling entirely to avoid unnecessary work" is itself misleading — the code at line 386-387 schedules `debounceB` unconditionally — worth flagging as a doc-bug to fix during implementation.

---

### [L] Finding 13: SPEC's line 381 citation includes a blank line (off-by-one on the comment range)

**Category:** FACTUAL
**Source:** T1
**Location:** SPEC.md line 238 (R0c citation "at `:381-384`")
**Issue:** R0c reads: "Observer A already has the branch at `server-observers.ts:214-237`. Add the symmetric branch to Observer B at `:378-388` (currently omitted — comment at `:381-384` acknowledges this asymmetry)." Line 381 is blank; the actual comment is at `:382-384`. Minor off-by-one in the citation. Same issue appears in `evidence/seed-1776386718697-characterization.md:88` and `evidence/bridge-surface-map.md:103`.

**Current text (R0c, line 238):**
> Add the symmetric branch to Observer B at `:378-388` (currently omitted — comment at `:381-384` acknowledges this asymmetry).

**Evidence:** `packages/server/src/server-observers.ts:381` is blank; `:382-384` contains the 3-line comment.

**Status:** CONTRADICTED (cosmetic)
**Suggested resolution:** Change `:381-384` to `:382-384` in SPEC.md R0c, `bridge-surface-map.md:103`, and `seed-1776386718697-characterization.md:88`.

---

### [L] Finding 14: "Automerge 2.2+ ranked first" is accurate for production-readiness + cost only; synthesis evidence ranks Loro first on greenfield alignment

**Category:** FACTUAL (minor nuance)
**Source:** T1 (evidence file cross-reference)
**Location:** SPEC.md line 127-129 (§3 Non-goals), line 904 (§15 SS-1)
**Issue:** The SPEC claims "Automerge 2.2+ ranked first per `reports/single-crdt-collapse-alternatives/REPORT.md`". Ignoring that `REPORT.md` doesn't exist (Finding 1), the available evidence at `reports/single-crdt-collapse-alternatives/evidence/synthesis-comparison.md` has three ranking axes:

1. **Production readiness:** C2 Automerge > C3 Loro > C1 Yjs 14 (Automerge first ✓)
2. **Greenfield alignment:** C3 Loro > C2 Automerge > C1 Yjs 14 (Loro first; Automerge second)
3. **Migration cost:** C1 Yjs 14 SPIKE > C2 Automerge > C3 Loro (Automerge second among viable)

"Ranked first" is axis-dependent. SPEC's one-word claim elides the nuance. Not a blocker for D4-LOCKED (single-CRDT is out of scope this spec regardless of which candidate wins), but an auditor cross-referencing the evidence will find the ranking is more nuanced than stated.

**Current text (§3 Non-goals, line 127-129):**
> See also `reports/single-crdt-collapse-alternatives/REPORT.md` for candidate comparison (Automerge 2.2+ ranked first; Peritext-on-Yjs-14 ecosystem immature as of 2026-04-16).

**Evidence:** `reports/single-crdt-collapse-alternatives/evidence/synthesis-comparison.md` (three-axis ranking summarized above).

**Status:** CONTRADICTED (minor nuance)
**Suggested resolution:** Soften the claim: "Automerge 2.2+ ranked first on production-readiness; Loro ranked first on greenfield alignment; see `evidence/synthesis-comparison.md` for the three-axis trade-off". Aligned with Finding 1's suggested resolution to cite evidence files directly.

---

## Round-1 Finding Status Summary

Of the 15 round-1 findings, **10 were correctly addressed** and **5 remain open**:

**Correctly addressed (10):**
- [F1] CONSIDER.md citation — replaced with evidence-file reference ✓
- [F2] §D3 vs §D5 citation for single-CRDT collapse — now cites §D3 + §D5 + Recommendation 4 ✓
- [F3] R5 pauseInbound wall-clock — now correctly notes primitives are structural ✓
- [F5] R12 "No future-work" vs §15 FW- — FW- relabeled to SS- ✓
- [F6] A1/A2 stale "To verify" — now marked CONFIRMED ✓
- [F7] §8 placeholder — populated ✓
- [F8] §5, §14, §16 placeholders — populated ✓
- [F9] R11 (now R12) missing CLAUDE.md target text — explicit target text added ✓
- [F11] R6 greppability test — R5b extraction + R6 allow-list for `typing-defer.ts` addresses this, though see Finding 3 for the separate concern that R5b misidentifies which lines are typing-defer ✓ (with caveat)
- [F15] FW- vs SS- label mismatch — resolved alongside F5 ✓

**Not addressed (5):**
- [F4] D5 missing §D4 citation — see Round-2 Finding 4 (M)
- [F10] Q5 Facts-to-properties ordering — see Round-2 Finding 10 (L)
- [F12] bridge-surface-map.md stale counts (269/36) — see Round-2 Finding 11 (L)
- [F13] bridge-surface-map.md stale line numbers (354/388) — see Round-2 Finding 11 (L)
- [F14] seed-1776386718697-characterization.md paraphrased quote — see Round-2 Finding 12 (L)

---

## New Concerns (surfaced in round 2, not present in round 1)

- **Finding 1 (H):** Two cited reports (`collab-editor-silent-loss-ux-patterns/REPORT.md`, `single-crdt-collapse-alternatives/REPORT.md`) do not exist — both locked decisions (D8, D4 supporting text) cite non-existent files. Round 1 didn't flag because these citations were added in the cascade after round-1 was written.
- **Finding 2 (H):** D1 "proximate fix" vs D7 "not primary fix" coherence issue — round 1 couldn't surface because D7 didn't exist yet (added in D6-D9 cascade).
- **Finding 3 (H):** R5b typing-defer extraction line mis-identification — new in round 2, introduced in the cascade that added R5b.
- **Finding 5 (M):** R7e rescue-buffer reader path ambiguity — new in round 2, introduced by R7a-e cascade.
- **Finding 6 (M):** §8 current-state 4-typing-defer characterization error — follows from Finding 3.
- **Finding 7 (M):** §B3 citation to evidence — new in round 2, introduced by R7b.
- **Finding 8 (M):** Q3 §D4 citation precision — present in round 1 scope but not flagged; re-surfaced.
- **Finding 9 (M):** "wholesale-replacing Y.Text" imprecision — new focus after D7 mechanism analysis.
- **Finding 14 (L):** "Automerge 2.2+ ranked first" axis-dependent — new in round 2 because the claim was added in the D4 rationale cascade.

---

## Confirmed Claims (summary)

The following were spot-checked and verified at baseline commit `432a834b`:

**File:line citations against source:**
- `server-observers.ts:56-60` = `OBSERVER_SYNC_ORIGIN` ✓
- `server-observers.ts:82-83` = `isPairedWriteOrigin` ✓
- `server-observers.ts:161` = normalized pre-branch gate ✓
- `server-observers.ts:166-175` = Path A/B transact block ✓
- `server-observers.ts:204-241` = Observer A callback ✓
- `server-observers.ts:214-237` = Observer A paired-write branch ✓
- `server-observers.ts:234, 240, 286, 387` = 4 DEBOUNCE_MS setTimeout sites ✓
- `server-observers.ts:378-388` = Observer B callback ✓
- `agent-sessions.ts:52-56` = `AGENT_WRITE_ORIGIN` ✓
- `external-change.ts:27-31` = `FILE_WATCHER_ORIGIN` ✓
- `api-extension.ts:104-108` = `ROLLBACK_ORIGIN` ✓
- `api-extension.ts:110-114` = `MANAGED_RENAME_ORIGIN` (not exported per SPEC claim) ✓
- `api-extension.ts:794-815` = managed-rename transact block (writes both XmlFragment + Y.Text) ✓
- `api-extension.ts:2105-2120` = rollback transact block (writes both XmlFragment + Y.Text) ✓
- `shadow-repo.ts:127` = `tmpIndex` per-writer filename ✓
- `shadow-repo.ts:294-319` = blob-staging loop body within `parkBranch` (which extends 282-367) ✓
- `shadow-branch-gc.ts:8` = "Checkpoint refs retained" ✓
- `standalone.ts:411, 962, 565-604` = three rescue-buffer write sites (411 + 962 migrated by R7e, 565-604 retained) ✓
- `network-control.ts:48-58` = `pauseInbound`/`resumeInbound` (structural, no wall-clock) ✓
- `ControllableWebSocket` has no `pauseOutbound` (R0e motivation) ✓
- `scheduler.ts:38` = `defaultScheduler` passthrough ✓
- `server-observer-extension.ts:77` = 5-second observer-attach retry ✓
- `TimelinePanel.tsx:168` = hardcoded "Save Version" label ✓
- `timeline-query.ts:108` = `getDocumentHistory` function ✓
- `test-harness.ts:526-533` = `BRIDGE_ENFORCING_ORIGINS` (6 entries, MANAGED_RENAME excluded) ✓
- `test-harness.ts:572-611` = `attachBridgeInvariantWatcher` (uses `afterTransaction`) ✓
- `server-observers.test.ts:449` = seed-1776325179241 regression test ✓
- `node_modules/yjs/src/structs/Item.js:429-482` = RGA conflict-resolution loop ✓
- `node_modules/@hocuspocus/server/dist/index.d.ts:418-422` = `LocalTransactionOrigin { context?: any }` — supports R0 drop-in typed marker ✓

**Research report §D citations:**
- `yjs-transaction-settlement-hooks/REPORT.md §D1, §D3, §D5` — correctly anchored for Q1, A1, A2 ✓
- `three-way-merge-content-preservation/REPORT.md §D3` — Khanna-Kunal-Pierce impossibility ✓
- `three-way-merge-content-preservation/REPORT.md §D4` — Yjs state vectors per-doc ✓ (matches Q2)
- `three-way-merge-content-preservation/REPORT.md §D5` — Peritext/Automerge collapse ✓
- `three-way-merge-content-preservation/REPORT.md §D8` — invariant (c) recommended ✓ (matches D2)
- `three-way-merge-content-preservation/REPORT.md Recommendation 4` — single-CRDT as escape ✓

**Internal coherence:**
- R-number enumeration: R0 → R0b-h, R1-R13 with R5b, R7a-e — no duplicates, no gaps ✓
- M1-M10 trace to requirements: M1↔R2, M2↔R3, M3↔R0h, M4↔R9, M5↔R7/R7c, M6↔R6, M8↔R12, M9↔R0b, M10↔R0c; M7 is a general quality gate ✓
- §14 In Scope enumeration matches §6 requirements ✓
- §16 SCOPE files match §6 implementation plans ✓
- §16 EXCLUDE consistent with §3 Non-goals ✓
- §16 ASK_FIRST consistent with R0b (4 paired origins), R0d (MANAGED_RENAME in enforcing set), R12 (CLAUDE.md target text) ✓

**Paired-write claim D6:**
- ROLLBACK_ORIGIN atomically writes both CRDTs in single `document.transact()` (api-extension.ts:2105-2120) ✓
- MANAGED_RENAME_ORIGIN atomically writes both CRDTs in single `document.transact()` (api-extension.ts:794-815) ✓

**D8 template claim:**
- `parkBranch` at `shadow-repo.ts:282-367` uses blob-staging pattern (lines 294-319 are the inner loop) ✓ Usable template for `saveInMemoryCheckpoint`, though the SPEC's citation to "lines 294-319" is more precisely the loop body than the full function.

**R0 typed marker feasibility:**
- `LocalTransactionOrigin.context?: any` at `@hocuspocus/server/dist/index.d.ts:421` ✓
- Runtime check `origin?.context?.paired === true` works against all 4 paired origins ✓
- R10 ("no `any`/`unknown`") compatible at boundary via type-guard function ✓

---

## Unverifiable Claims

- **Seed `1776368799815`, CI run `24530510201`** (SPEC §1 Complication line 27-28) — the originating CONSIDER.md artifact was inlined but these specific numbers are not anchored in any evidence file in the worktree. Not critical (they're illustrative of "seen in CI too") but non-reproducible by a cold reader.
- **40-60% failure rate** (SPEC §1 Complication line 26) — sampled at n=5 (evidence file line 18-24 shows 2/5 fail). The 40% lower bound is the observed rate; the 60% upper bound is not derivable from n=5. Minor overreach in reporting.
- **"1000 seeds/PR @ ~5s each local = ~80 min"** (D11 implementation decision) — napkin math: 1000 × 5s = 83min serial, consistent. D11 flagged for spike validation.
- **M4** (`bridge-merge-content-loss` event rate measurable in post-ship observation window) — by design, measurable only after ship.
- **Q4 outcome** (does Bucket 0 close seed-1776386718697?) — by design, empirical question for the implementation phase.

---

## Decision-Implicating vs Pure-Correction Classification

**Decision-implicating findings:**
- Finding 1 (H) — D8 rationale rests on a cited report that doesn't exist. D8 itself (silent-checkpoint via `saveInMemoryCheckpoint`) can still be held if rationale is rewired to cite the existing evidence files directly. Reopens D8 documentation/evidence track, not the substantive design.
- Finding 2 (H) — D1 vs D7 framing incoherence. Reopens D1's stated rationale; substantive decision (add Bucket 0) is sound.
- Finding 3 (H) — R5b implementation scope ambiguity. Reopens the implementation plan for R5b (and by extension R6's grep gate specification), not the Bucket B migration itself.
- Finding 5 (M) — R7e reader-path ambiguity. Reopens R7e's scope (may need to include reader migration in-spec or scope-out the writer migration to SS-3).

**Pure corrections:**
- Findings 4, 6, 7, 8, 9, 10, 11, 12, 13, 14 — factual corrections, no decision rationale is invalidated. Low friction to address.
