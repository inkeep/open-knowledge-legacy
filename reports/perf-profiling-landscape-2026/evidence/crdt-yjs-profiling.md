# Evidence: D5 — CRDT / Yjs / Hocuspocus profiling

**Dimension:** D5 — Tools, benchmarks, datasets, and techniques that exist specifically for profiling a Yjs + Hocuspocus + TipTap/ProseMirror collaborative editor in 2025/2026.
**Date:** 2026-04-19
**Sources:** `~/.claude/oss-repos/yjs/`, `~/.claude/oss-repos/hocuspocus/`, `~/.claude/oss-repos/tiptap/`, dmonad/crdt-benchmarks, automerge/automerge-perf, yjs/yjs-inspector, HocuspocusProvider source, CodeMirror discuss forum, ProseMirror issues

---

## Key files / pages referenced

- https://github.com/dmonad/crdt-benchmarks
- https://github.com/automerge/automerge-perf
- https://github.com/yjs/yjs-inspector (hosted at https://inspector.yjs.dev/)
- `~/.claude/oss-repos/yjs/README.md:19-20` (pointer to crdt-benchmarks)
- `~/.claude/oss-repos/yjs/src/utils/Transaction.js:616,635-644` (afterAllTransactions hook)
- `~/.claude/oss-repos/yjs/INTERNALS.md:125-130` (B4 benchmark stats)
- `~/.claude/oss-repos/hocuspocus/packages/server/src/Document.ts:238-249` (broadcastStateless)
- `~/.claude/oss-repos/hocuspocus/packages/provider/src/HocuspocusProvider.ts:90-127` (forceSyncInterval)
- https://tiptap.dev/docs/hocuspocus/guides/scalability
- https://discuss.codemirror.net/t/cm6-performance-benchmarks/2471
- https://codemirror.net/examples/million/
- https://github.com/ProseMirror/prosemirror/issues/364
- https://discuss.yjs.dev/t/yjs-vs-loro-new-crdt-lib/2567

---

## Findings

### Finding: `dmonad/crdt-benchmarks` is the canonical CRDT performance suite; compares Yjs, ywasm, Loro, Automerge across 4 scenarios

**Confidence:** CONFIRMED

**Evidence:**
- `~/.claude/oss-repos/yjs/README.md:19-20` — Yjs README points directly to it:
  ```
  Benchmark Yjs vs. Automerge:
  [https://github.com/dmonad/crdt-benchmarks](https://github.com/dmonad/crdt-benchmarks)
  ```
- https://github.com/dmonad/crdt-benchmarks — scenarios B1 (no conflicts, two clients), B2 (two users, concurrent conflicts), B3 (many conflicts, √N concurrent actions), B4 (real-world LaTeX-paper edit trace, 259,778 ops). Output columns: `time`, `avgUpdateSize`, `docSize`, `parseTime`, `memUsed`. Run with `npm start` or `npm start:bun`; per-library via `cd benchmarks/<name> && npm start`; results table via `npm run table`. Pinned versions at time of README fetch: Yjs 13.6.11, ywasm 0.9.3, Loro 0.10.1, Automerge 2.1.10.

**Implications:** The industry-standard external benchmark. Version-conditional numbers (every new release shifts the board). The `b4-editing-trace.js` file is checked into the repo itself.

---

### Finding: `automerge/automerge-perf` is the canonical character-by-character edit-trace dataset shared across CRDT projects

**Confidence:** CONFIRMED

**Evidence:**
- https://github.com/automerge/automerge-perf — 332,702 total changes (182,315 insertions, 77,463 deletions, 102,049 cursor movements), final document 104,852 ASCII chars. Primary format: `edit-history/paper.json.gz` ("Automerge's JSON change format"). Alternative: `edit-by-index/editing-trace.js` (~4.5 MB, Array.splice operations). License: CC-BY-4.0 via Kleppmann.
- `~/.claude/oss-repos/yjs/INTERNALS.md:129-130`:
  > "the B4 benchmark document contains 182k inserts and 77k deleted characters. The deleted set size in a snapshot is only 4.5Kb"

**Implications:** Every major CRDT project benchmarks against this trace — it's the editor-perf lingua franca. Subsets are testable: the trace is small enough (~4.5 MB JS) to vendor into a test suite directly.

---

### Finding: Y.Doc exposes a transaction-level `afterAllTransactions` hook suitable for custom timing instrumentation

**Confidence:** CONFIRMED

**Evidence:**
- `~/.claude/oss-repos/yjs/src/utils/Transaction.js:616`:
  ```js
  doc.emit('afterAllTransactions', [doc, transactionCleanups])
  ```
- `~/.claude/oss-repos/yjs/src/utils/Transaction.js:635-644` — `transact(doc, f, origin, local)` entry point that starts new Transactions with origin tracking:
  ```js
  export const transact = (doc, f, origin = null, local = true) => {
    const transactionCleanups = doc._transactionCleanups
    ...
    if (doc._transaction === null) {
      initialCall = true
      doc._transaction = new Transaction(doc, origin, local)
  ```

**Implications:** There's no out-of-the-box "transaction profiler" shipped with yjs — but the hook exists. Custom instrumentation is the expected path (the community has no published `yjs-profiler` npm package; the Yjs Inspector is an inspection playground, not a profiler).

---

### Finding: `yjs/yjs-inspector` (hosted at inspector.yjs.dev) is the official Y.Doc inspection playground but does NOT display perf/size metrics

**Confidence:** CONFIRMED

**Evidence:**
- Repo: https://github.com/yjs/yjs-inspector. README: "The playground of Yjs… Connect to Yjs demo instances, inspect internal structure of Yjs document models, apply advanced filtering, modify the document model directly, export YDoc snapshots, dark mode"

**Implications:** For mutation/structure debugging it's canonical; it's NOT a profiler. Teams wanting perf metrics must instrument themselves via `afterAllTransactions` / `update` events.

---

### Finding: Hocuspocus ships NO benchmark suite and NO load-testing harness

**Confidence:** CONFIRMED

**Evidence:**
- `~/.claude/oss-repos/hocuspocus/` directory listing shows NO `perf/`, `benchmark/`, `bench/` directory. `package.json` contains no `bench` script. `CHANGELOG.md` grep for "benchmark|perf|scale" returns nothing.
- https://tiptap.dev/docs/hocuspocus/guides/scalability — the entire "scalability" doc recommends only (1) Redis extension for HA, (2) horizontal sharding by document identifier. Content ends with a "TODO" note. Zero mention of profiling tools or metrics.
- `~/.claude/oss-repos/hocuspocus/packages/server/src/Document.ts:238-249` — the only public "observability" surface is `broadcastStateless(payload, filter)`, i.e. what Open Knowledge's CC1 push rides on. No server metrics emitted natively.

**Implications:** This is a clean absence, not something hidden. Any Hocuspocus perf testing is custom-rolled.

---

### Finding: HocuspocusProvider exposes `forceSyncInterval` — a client-side knob documented as a secondary timeout defense

**Confidence:** CONFIRMED

**Evidence:**
- `~/.claude/oss-repos/hocuspocus/packages/provider/src/HocuspocusProvider.ts:90-127`:
  ```ts
  /**
   * Force syncing the document in the defined interval.
   */
  forceSyncInterval: false | number;
  ...
  forceSyncInterval: false,  // default
  ```

**Implications:** Direct callout as the only timing-sensitive public knob in the provider. Useful for "synced never fires" latency diagnosis via forced re-sync.

---

### Finding: TipTap repository ships NO performance tests or benchmarks

**Confidence:** CONFIRMED

**Evidence:**
- `~/.claude/oss-repos/tiptap/` top-level listing has `tests/` (cypress) but no `bench/` or `perf/`. `package.json` has no perf/bench script (grep returns empty). Directory tree searches for `*.bench.*` / `*perf*` / `*bench*` return zero matches.
- `~/.claude/oss-repos/tiptap/tests/` contains only `cypress/` + `cypress.config.js` + `package.json` — pure E2E, no perf fixtures.

**Implications:** Typing-latency / large-document perf stories are absent from tiptap. Shops building on TipTap must assemble their own harness.

---

### Finding: CodeMirror 6 has no published benchmarks — explicit maintainer statement

**Confidence:** CONFIRMED

**Evidence:**
- https://discuss.codemirror.net/t/cm6-performance-benchmarks/2471 — maintainer Marijn: "No benchmarks have been done" on CM6 vs. Atom/VS Code. Design prioritizes "avoiding performance cliffs and unresponsiveness rather than achieving impressive update times."
- https://codemirror.net/examples/million/ — the demo page ("CodeMirror Huge Doc Demo") loads "a document of a few million lines" as the anecdotal proof point rather than a reproducible benchmark.

**Implications:** CM6 perf story is "no cliffs" rather than numeric baselines. The "million lines" demo is the closest thing to a community reference — not a test.

---

### Finding: ProseMirror has a known non-linear perf cliff on large paste operations; no first-party benchmark suite

**Confidence:** CONFIRMED

**Evidence:**
- https://github.com/ProseMirror/prosemirror/issues/364 — "Non-linear performance when pasting content" (open issue).
- https://discuss.prosemirror.net/t/lazy-rendering-for-prosemirror/1486 — ongoing lazy-rendering discussion (vs. CM6's built-in viewport rendering), open.

**Implications:** For a TipTap-on-ProseMirror stack, paste perf and lazy rendering are the canonical ProseMirror issues to instrument against. No first-party harness exists to catch regressions.

---

### Finding: CRDT comparison numbers (Loro / Yjs / Automerge) are version-conditional and published in library-specific benchmark repos

**Confidence:** CONFIRMED

**Evidence:**
- https://loro.dev/docs/performance — Loro publishes JS/WASM numbers (page was 403 at fetch time but referenced in crdt.tech / Yjs community posts).
- https://discuss.yjs.dev/t/yjs-vs-loro-new-crdt-lib/2567 — official Yjs-community thread contrasts. Zxch3n (Loro author): "Yjs requires additional storage for a Version Vector + Delete Set for each version saved, which incurs significant extra overhead beyond the document size reported." Automerge: ~1s on B4 if all-changes-in-one-transaction.
- The independent fork https://github.com/zxch3n/crdt-benchmarks holds the currently-referenced Loro numbers.

**Implications:** Any numeric comparison is a snapshot against specific versions at a specific time. In 2026, Loro 0.10 vs. Yjs 13.6.x is one common reference frame but shifts every release.

---

## Terminology (D5)

- **B1 / B2 / B3 / B4 benchmarks** (dmonad): the four canonical CRDT scenarios — no-conflict, two-user-conflict, many-conflict, and real-world LaTeX edit trace.
- **automerge-perf edit trace**: Kleppmann's 332,702-op LaTeX-paper character-by-character trace used as the B4 fixture.
- **`afterAllTransactions`**: Y.Doc event emitted after a transaction's cleanup phase; the standard interception point for custom Y.js instrumentation.
- **`forceSyncInterval`** (HocuspocusProvider): client-side knob to force re-syncs; defaults to `false` (no forced sync).

## Gaps / follow-ups

- No out-of-the-box Y.Doc transaction profiler (`yjs-profiler` npm package) exists.
- TipTap/ProseMirror/CM6 have no first-party benchmark harnesses.
- Loro docs page returned 403 during fetch; numbers must be pulled from community thread summaries.

## Sources (de-duped)

- https://github.com/dmonad/crdt-benchmarks — canonical CRDT benchmark repo
- https://github.com/automerge/automerge-perf — LaTeX-paper edit trace dataset (332k ops)
- https://github.com/yjs/yjs-inspector — official Y.Doc inspection playground
- https://inspector.yjs.dev/ — hosted Yjs Inspector
- https://github.com/yjs/yjs — Yjs source (README.md:19, Transaction.js:616/635-644, INTERNALS.md:125-130)
- https://github.com/ueberdosis/hocuspocus — Hocuspocus source; no bench infra
- https://tiptap.dev/docs/hocuspocus/introduction — Hocuspocus docs, no perf guidance
- https://tiptap.dev/docs/hocuspocus/guides/scalability — Redis + sharding only
- https://discuss.codemirror.net/t/cm6-performance-benchmarks/2471 — CM6 maintainer confirms no benchmarks
- https://codemirror.net/examples/million/ — CM6 "huge doc" demo
- https://github.com/ProseMirror/prosemirror/issues/364 — non-linear paste perf issue
- https://discuss.prosemirror.net/t/lazy-rendering-for-prosemirror/1486 — lazy rendering discussion
- https://discuss.yjs.dev/t/yjs-vs-loro-new-crdt-lib/2567 — Yjs vs Loro benchmark thread
