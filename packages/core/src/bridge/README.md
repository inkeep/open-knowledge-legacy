# `@inkeep/open-knowledge-core/bridge`

Shared primitives for the dual-CRDT bridge between `Y.XmlFragment` (TipTap) and `Y.Text` (CodeMirror). Consumed by the server-authoritative observer (`packages/server/src/server-observers.ts`) and by the client observer shell (`packages/app/src/editor/observers.ts` — read-only). Client cross-CRDT write paths are deleted per precedent #14; the server is the sole writer.

Architectural governance:

- `CLAUDE.md` precedents #11 (minimize CRDT mutation), #12 (XmlFragment authoritative), #13 (auto-enforced invariants), #14 (single-writer server-side)
- `specs/2026-04-16-bridge-correctness/SPEC.md` (post-condition, settlement dispatch, paired-write marker)
- `specs/2026-04-15-lossless-bridge-merge/SPEC.md` (hybrid diff3+DMP algorithm)
- `specs/2026-04-15-server-authoritative-observer-bridge/SPEC.md` (single-writer rationale)

## Public API

| Export | Purpose |
|---|---|
| `applyIncrementalDiff(ytext, oldText, newText)` | Path A write — line-level `diffLines` with a content-comparison gate that skips paired delete+insert when Y.Text already contains the added content at the target offset. Preserves CRDT Items for unchanged lines (precedent #11(a)). |
| `applyFastDiff(ytext, oldText, newText)` | Character-level DMP write. Used to materialize Path B's merged text and to canonicalize `Y.Text` after Observer B's `updateYFragment` so the bridge invariant holds at every settlement point. |
| `mergeThreeWay(baseline, userText, agentText)` | Path B merge — line-level `diff3Merge` (conflict detection + D8 dedup) with character-level DMP inside conflict regions. Always runs `assertContentPreservation` on its result and throws `BridgeMergeContentLossError` on violation. |
| `assertContentPreservation(baseline, userText, agentText, result)` | Post-condition: every maximal unique non-whitespace line from `(userText \ baseline)` and `(agentText \ baseline)` appears in `result`, and each side's lines retain their relative order. O(n log n) per side plus greedy order walk; sub-millisecond on ~10 KB markdown in practice. |
| `BridgeMergeContentLossError` | Thrown error carrying `{ baseline, userText, agentText, result, lostSubstrings, which: 'substring' \| 'order', side: 'user' \| 'agent' }`. Call `err.toLog()` for the `BridgeMergeContentLossLogPayload` shape consumed by the `bridge-merge-content-loss` structured log. |
| `diffLinesFast(a, b)` | Line-level diff helper used by `applyIncrementalDiff`. |
| `getFrontmatter(doc)` | Return the fenced YAML string for body composition. Synthesized from per-key `Y.Map('metadata')` entries when any exist; falls back to the legacy single-string slot otherwise. Used by both observers to compose `prependFrontmatter(getFrontmatter(doc), body)` against the same canonical prefix. |
| `getFrontmatterMap(doc)` | Return the structured per-key map (`Record<string, FrontmatterValue>`). Unwraps `Y.Text` → string, `Y.Array<Y.Text>` → `string[]`, primitives as-is. Empty object when the doc is in legacy single-string shape. |
| `setFrontmatterFromYaml(doc, yaml)` | Apply a YAML body as per-key entries via per-key diff (delete missing, insert new, set changed). Used by `onLoadDocument`'s eager-on-load migration, `applyExternalChange` (file watcher), and Observer B reconciliation. Per-key (not bulk `clear()+setAll()`) preserves `Y.UndoManager` attribution so undoing one property reverts only that property. Returns `false` on malformed YAML — caller keeps last valid state. Caller wraps in `doc.transact(fn, origin)`. |
| `setFrontmatterProperty(doc, key, value)` | Set or delete a single property (`null` deletes). The atomic write helper called by `bindFrontmatterDoc.patch()` for each key in a Merge Patch. Caller wraps in `doc.transact(fn, origin)`. |
| `bindFrontmatterDoc(provider)` | Browser-side binding analogous to `bindConfigDoc`. Returns `{ current, patch, subscribe, dispose }`. Validates `FrontmatterPatch` against the shared schema BEFORE any Y.Map mutation; on success writes per-key entries inside `doc.transact(fn, FORM_WRITE_ORIGIN)`. The property panel calls `binding.patch(...)` instead of POSTing to a server endpoint. |
| `composeFrontmatterForStore(doc)` | Compose the fenced YAML for `onStoreDocument` to write to disk. Prefers the legacy single-string slot verbatim when its parsed value still matches the per-key map — keeps comments, blank lines, and scalar styles intact for `doc-load → no-op-form-edit → doc-save` round-trips. Falls back to canonical synthesis from the per-key map when the two have diverged. |
| `normalizeBridge(text)` | Strip bridge-internal whitespace variance (trailing newline, etc.) when comparing raw Y.Text bytes to serialized XmlFragment markdown. The bridge invariant is stated against `normalizeBridge`, not raw equality. |

## Frontmatter storage shape

`Y.Map('metadata')` carries one Y entry per frontmatter property — `Y.Text` for editable strings (`title`, `description`), `Y.Array<Y.Text>` for lists (`tags`, `topics`), primitives for atomics (`Number` / `Boolean` / ISO-date strings). Field-level CRDT merge: concurrent writes to different keys (a human form edit + an agent body write, two agents on different fields) merge cleanly; same-key concurrent writes resolve last-writer-wins per key.

A legacy single-string slot at `metaMap.get('frontmatter')` is kept transitionally as a byte-identical mirror so `composeFrontmatterForStore` can preserve YAML comments, blank lines, and scalar styles on `doc-load → no-op-edit → doc-save` round-trips. Don't read it directly — `getFrontmatter(doc)` already prefers per-key entries when present.

The companion module `packages/core/src/frontmatter/` exports the boundary schemas (`FrontmatterValueSchema`, `FrontmatterPatchSchema`, `FRONTMATTER_TYPES`) and the YAML codec (`parseFrontmatterYaml` + `serializeFrontmatterMap` over `yaml@2.x`'s `parseDocument` so comments survive round-trip). All boundaries that produce per-key writes — `bindFrontmatterDoc.patch()` (browser form), Observer B per-key diff, file-watcher `applyExternalChange`, agent-session helpers — share these schemas (Zod-at-boundaries, repo convention).

## Post-condition policy

`mergeThreeWay` always calls `assertContentPreservation`. Callers choose what to do with the throw:

- **Dev / test (default).** Let it propagate. `bun run check` and integration tests fail loudly — this is the signal that a merge dropped content. See SPEC §6 R1. Conversion-class regressions are additionally caught at PR tier via the fidelity PBT at `packages/app/tests/fidelity/bridge-observer-conversion.test.ts` (deterministic, CI-enforced). The bridge-convergence fuzz harness is preserved at `packages/app/tests/stress/bridge-convergence.fuzz.test.ts` but is no longer CI-automated — sample it ad-hoc via `bun run measure:fuzz` per `specs/2026-04-19-ci-signal-quality/` (FR-2 / D-Q1 LOCKED); results append to `specs/2026-04-16-bridge-correctness/evidence/residual-measurements.jsonl`.
- **Production Observer A Path B (single authorized catch site).** `packages/server/src/server-observers.ts` catches the error, emits a structured `bridge-merge-content-loss` log (via `err.toLog()`), queues a silent `saveInMemoryCheckpoint` with `kind: 'bridge-merge-loss'` via `queueMicrotask`, and applies the merged result as-computed (`applyFastDiff(ytext, currentText, err.info.result)`) so the editor stays responsive. Dev/test re-throws after the log so tests still fail.

**STOP.** Do not introduce a second catch site. Mutation H in `specs/2026-04-16-bridge-correctness/meta/mutation-validation.md` validates this is load-bearing — a second catch silently swallows the observability signal and breaks the Notion-style recovery UX.

## Why a hybrid merge

The Khanna-Kunal-Pierce 2007 result proves no purely-state-based three-way merge preserves content under arbitrary interleavings (diff3 is not idempotent, not near-success-on-similar-replicas, not stable). The hybrid diff3+DMP algorithm inherits that ceiling, but `assertContentPreservation` + silent recovery turn any residual drop into an observable, recoverable event rather than silent corruption. The structural fix is single-CRDT collapse (SS-1), tracked in parallel. See `specs/2026-04-16-bridge-correctness/SPEC.md` §10 D2 for the in-PR decision rationale citing KKP, and `reports/tree-level-three-way-merge-prior-art/` for the adjacent prior-art survey that grounds the same impossibility result.

## No wall-clock timers in bridge code (precedent #13(b))

Under the settlement-based dispatch model (`doc.on('afterAllTransactions', ...)` in `server-observers.ts`) the bridge observer files have no wall-clock timers. `server-observers.ts` and `packages/app/src/editor/observers.ts` do not call `setTimeout`, `setInterval`, `sched.*`, or consume the `Scheduler` type. The grep gate at `packages/server/src/bridge-no-wallclock.test.ts` fails CI on any reintroduction in those two files.

The `Scheduler` / `defaultScheduler` primitive itself remains exported from `@inkeep/open-knowledge-core` (defined at `packages/core/src/bridge/scheduler.ts`) for non-bridge consumers that legitimately need test-deterministic DI around `setTimeout` — `packages/server/src/idle-shutdown.ts` and `packages/cli/src/commands/ui.ts` both use it. Its presence in the package is compatible with the bridge invariant because the gate enforces by path, not by symbol presence.
