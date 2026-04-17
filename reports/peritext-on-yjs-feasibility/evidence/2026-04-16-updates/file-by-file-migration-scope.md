# Evidence: File-by-File Migration Scope (2026-04-16 Update)

**Dimension:** Pull-in assessment — Q3 (concrete migration scope)
**Date:** 2026-04-16
**Sources:** `specs/2026-04-16-bridge-correctness/evidence/bridge-surface-map.md`, local package.json + lockfile, `patches/y-prosemirror@1.3.7.patch`, CLAUDE.md precedent #9

---

## Files this spec's Option B would touch

### A. Deleted under Peritext (no dual-CRDT, no bridge)

| File | LOC | What it does | Replacement |
|---|---|---|---|
| `packages/core/src/bridge/merge-three-way.ts` | ~200 | Hybrid diff3+DMP Path B merge | DELETED — no type-boundary |
| `packages/core/src/bridge/diff-lines.ts` | ~50 | Line-level diff helper for apply-diff | DELETED — not needed without bridge |
| `packages/core/src/bridge/normalize.ts` | ~80 | `normalizeBridge` (trailing ws) | DELETED — no bridge to normalize across |
| `packages/core/src/bridge/scheduler.ts` | ~40 | Debounce abstraction | DELETED — no debounce in single-CRDT path |
| `packages/server/src/server-observers.ts` | ~440 | Observer A/B bridge + origin guards | DELETED — no cross-CRDT sync |
| `packages/server/src/server-observer-extension.ts` | ~110 | Hocuspocus wiring | DELETED |
| `packages/app/src/editor/observers.ts` | ~460 | Client-side baseline tracker (post-precedent-14) | DELETED |
| `packages/app/tests/integration/test-harness.ts` `attachBridgeInvariantWatcher` | ~100 | Per-tx bridge invariant check | DELETED — no invariant to enforce |
| `packages/app/tests/integration/bridge-matrix.test.ts` | entire | Tier-1 4-surface matrix | DELETED — collapsed to WYSIWYG/source same doc |
| `packages/app/tests/integration/c1-*.test.ts` ... `c10-*.test.ts` | entire | Server-auth bridge tests | DELETED |
| `packages/app/tests/stress/bridge-convergence.fuzz.test.ts` | ~400 | Fuzz (the whole point of FR-17) | REPURPOSED |
| `packages/app/tests/integration/network-control.ts` pauseInbound/resumeInbound | ~70 | Race harness | DELETED or repurposed |

**Total deleted LOC: ~2,400** (rough order of magnitude, not counting test removal).

### B. New work: single-CRDT editor integration

| Area | LOC estimate | Notes |
|---|---|---|
| New Yjs 14 TipTap binding (via `@y/prosemirror` or roll-our-own) | ~300-1000 | The 1.3.7-patched behavior must be ported forward |
| New CodeMirror source-view integration | ~200-500 | See below — this is the live-editing problem |
| `applyAgentMarkdownWrite` refactor to single-CRDT | ~100-200 | Replace `applyFastDiff` + `updateYFragment` two-step with a single Y.ytype mutation |
| `applyExternalChange` refactor | ~100-200 | File → CRDT under new type |
| `applyManagedRenameToLoadedDocument` refactor | ~50 | Same |
| Frontmatter handling | ~50-100 | Still needs Y.Map coordination if metadata stays there; OR the CRDT absorbs frontmatter into its tree |
| Markdown pipeline adaptation | ~100-200 | remark-prosemirror stays as-is if schema stays consistent; adapters at TipTap binding |
| Port y-prosemirror@1.3.7 patch (R13 schema-throw substitution per precedent #9) | ~100 | CRITICAL; see below |
| Test harness rewrite | ~500-1000 | New multi-client convergence primitives on single CRDT |
| E2E + fidelity re-baseline | — | Known invariants I1-I7 re-verified under new storage layer |

### C. y-prosemirror@1.3.7 patch migration: non-trivial

Our current `patches/y-prosemirror@1.3.7.patch` is 100 lines and applies the precedent-#9 schema-throw safety net (R13 in `specs/2026-04-13-mdx-tolerant-parsing/evidence/y-prosemirror-failure-modes.md`).

Under Option B, we'd be replacing `y-prosemirror@1.3.7` with `@y/prosemirror@2.0.0-2` or a successor. The v2 architecture is a near-complete rewrite (see `reports/peritext-on-yjs-feasibility/evidence/existing-bindings.md`). The schema-throw handling path in v2 is architecturally different (delta-protocol based). Our patch would have to be **re-ported + re-verified**:

- **Re-port:** Find the equivalent destructive-delete path in `@y/prosemirror` v2's delta applier. Likely in the delta-to-node conversion.
- **Re-verify:** Re-run the Q6 verification test (`packages/core/src/schema-invariant.test.ts` snapshot) against v2's behavior.
- **Bigger risk:** `@y/prosemirror`'s PR was **rejected** (see `adjacent-library-compat.md`). Whatever we re-port to may be replaced AGAIN by dmonad's modular-refactor vision. We could be porting the patch twice.

## Two load-bearing questions the prior report didn't resolve

### Question 1: Does the source-mode editor speak Peritext?

From the prior `REPORT.md §D5`:
> "Peritext eliminates the bridge for rendering. If the source-mode editor edits the markdown text representation of the Peritext doc and writes it back, we re-introduce the markdown ↔ Peritext translation problem. The escape is full only if the source-mode editor speaks Peritext directly."

The prior report's **Architecture C** (2-4 week path) explicitly does NOT solve this:

> "Source view is non-collaborative."

Architecture C is **"serialize-on-toggle"** — the user switches WYSIWYG → source, gets a markdown rendering as a read-only projection, and either:
- (a) Source view is read-only (no editing).
- (b) Source view is editable but non-collaborative (user's local edits re-parse + replace on switch-back).

Both (a) and (b) are UX regressions from the current state. Open Knowledge today supports **concurrent WYSIWYG + source editing with CRDT convergence** — the exact thing C1-C10 integration tests verify.

If we pulled "Architecture C" in, we'd ship a REGRESSION to the source-editing UX that the C1-C10 tests have been defending.

### Question 2: Does CodeMirror have a Peritext binding?

`@y/codemirror@0.0.0-3` exists but is a Y.Text binding, not a Peritext-semantic binding. For CodeMirror to edit the Peritext YType's markdown projection live, we'd need EITHER:

- **C-a:** A new projection layer: CodeMirror ↔ markdown text ↔ Peritext YType. Every keystroke in source mode is a markdown-to-Peritext round-trip. This is literally the bridge problem we're trying to eliminate, just relocated to the client.
- **C-b:** CodeMirror binds to the raw Peritext tree (implausible — CodeMirror is a text editor, not a tree editor).
- **C-c:** Source mode becomes read-only; users can only edit in WYSIWYG. Regression.

None of these are quantified or prototyped in the prior report. The `2-4 weeks` estimate presumes one of (C-a/C-b/C-c) and doesn't price the tradeoff.

## The bridge-correctness spec already assumes Option A for W3/W4

The spec's propagation matrix (from CLAUDE.md) has 4 write surfaces. W3 (agent writes, applyAgentMarkdownWrite per precedent #12) and W4 (file-watcher / disk) are ALREADY markdown-authoritative flows — they take markdown strings from outside and coerce them into the CRDT. Under Peritext:

- **W3:** agent writes still start as markdown strings (agent API contract in `api-extension.ts`). Need a markdown → Peritext delta translator at the server. This is a NEW piece of code, roughly equivalent to half of `@y/prosemirror`'s functionality.
- **W4:** disk → Peritext translator, same. Today that's `applyExternalChange` calling `mdManager.parse` → `updateYFragment`. Under Peritext the composition target is different but the upstream is identical.

So the Peritext single-CRDT collapse doesn't eliminate markdown translation — it relocates it to the server-side ingest path. The bridge doesn't disappear; it moves to a place that's simpler (one-sided) but still requires the translation code.

## Findings

- **CONFIRMED:** The migration is not "delete ~2400 LOC + write ~500 LOC" (Architecture C's cited scope). It's "delete ~2400 LOC + write ~1,000-3,000 LOC" including new bindings, new CodeMirror integration, new ingest translators, and a re-ported schema-safety patch.
- **CONFIRMED:** Architecture C explicitly cannot deliver concurrent WYSIWYG + source editing — that's a REGRESSION from the current Open Knowledge behavior.
- **CONFIRMED:** The markdown-translation problem is relocated to the server-side ingest path (W3, W4) rather than eliminated. The size of that code isn't zero.
- **INFERRED:** "2-4 weeks for Architecture C" undercounts the CodeMirror source-editing regression fix AND the schema-safety patch re-port.

## Gaps / follow-ups

- Prototype a `@y/codemirror` + `@y/y` + `@y/prosemirror` setup locally and measure dual-view editing — time-box 1-2 days.
- Check whether the `@y/prosemirror` master branch still exports a stable API surface or whether dmonad's modular refactor has started breaking things.
