# Evidence: Pipeline Refactor Audit (R16 + R17)

**Dimension:** Pre-implementation audit of plugin idempotency (R16) and visitor-merge ordering constraints (R17)
**Date:** 2026-04-16
**Sources:** Direct code reads of `packages/core/src/markdown/` plugins on current main @ 2de299b
**Method:** Explore agent subagent enumerated every first-party plugin's attacher + transformer, characterized mutation surface and ordering dependencies.

---

## R16 — plugin idempotency audit

R16's acceptance criterion ("Cache unified processor in MarkdownManager ... Ensure `remarkWikiLink` attacher is idempotent") is incomplete. Full audit across all 7 first-party plugins in `pipeline.ts:110-133`:

| Plugin | Attacher mutates shared state? | Transformer holds closure state? | Verdict |
|--------|-------------------------------|----------------------------------|---------|
| `remarkMdxAgnostic` (`remark-mdx-agnostic.ts:25`) | **YES** — `this.data().micromarkExtensions.push(...)` | No | **MUTATING** |
| `remarkWikiLink` (`wiki-link-micromark.ts:239`) | **YES** — `data.micromarkExtensions.push(...)` | No | **MUTATING** |
| `restoreFromMdx` (`autolink-void-html-guard.ts:270`) | No | No | Idempotent |
| `autolinkPromotionPlugin` (`autolink-promotion.ts:36`) | No | No | Idempotent |
| `docStartThematicFixPlugin` (`doc-start-thematic-fix.ts:21`) | No | No | Idempotent |
| `positionSlicePlugin` (`position-slice.ts:47`) | No | Read-only closure over `file` and env var | Idempotent |
| `unknownMdastGuardPlugin` (`unknown-mdast-guard.ts:134`) | No | Read-only closure over `source` | Idempotent |

### Mechanism of the MUTATING bug

Both `remarkMdxAgnostic` and `remarkWikiLink` push micromark extensions onto the shared `data().micromarkExtensions` array on every attacher invocation. Unified's standard pattern is: `.use(plugin)` calls `plugin.call(processor)` and freezes the processor on first parse. If we cache the processor and reuse it, `.use(plugin)` is not re-called and the extension array doesn't grow. **So the naive cache IS safe for the standard unified flow.**

However, the spec's R16 target is stronger: ensure attacher idempotency so that even pathological re-entry is safe. This matters for test harnesses that clone processors, for any future dynamic plugin reload, and for defense-in-depth.

**Safe refactor pattern** (both plugins):
```ts
const existing = data.micromarkExtensions as unknown[];
const alreadyAttached = existing.some(e => e === EXPECTED_EXTENSION);
if (!alreadyAttached) existing.push(EXPECTED_EXTENSION);
```

### Memory footprint

Cached processor is per-MarkdownManager-instance (not global). Call sites (grep-verified):
- `packages/server/src/md-manager.ts:27` — 1 server-side singleton
- `packages/app/src/editor/TiptapEditor.tsx:92` — per-TipTap-editor ref
- `packages/app/src/editor/provider-pool.ts:139` — per-provider
- `packages/app/src/server/hocuspocus-plugin.ts:225` — dev-time Vite plugin
- ~25 test files each construct their own (short-lived)

Runtime footprint scales with concurrent document editors, not with doc count. Measurement during R16 validation confirms actual heap impact; expected to be modest (single-digit MB per cached processor).

---

## R17 — visitor-merge ordering constraints

R17's acceptance criterion ("Single walker dispatches to case handlers ... Preserves identical mdast output") is load-bearing. Audit of the 5 passes' ordering dependencies:

### Pass 1: `restoreFromMdx` (autolink-void-html-guard.ts:270-290)

- **Visits:** all nodes
- **Mutates:** `.value`, `.url`, `.title`, `.alt` string fields (restores PUA sentinels → `<`, `>`, `:`, `@`, `{`)
- **Tree structure:** unchanged
- **Ordering:** must run BEFORE any pass that inspects text values for literal syntax (e.g., regex for `<scheme:uri>`)

### Pass 2: `autolinkPromotionPlugin` (autolink-promotion.ts:36-111)

- **Visits:** parents with text children
- **Matches:** `text` nodes containing `<scheme:uri>` regex
- **Mutates:** splices `parent.children` array (line 109) — tree structure modified
- **Ordering:** **CRITICAL DEPENDENCY ON PASS 1.** Pass 1 restores `<` and `>` from PUA sentinels; pass 2's regex match requires those literal chars. If pass 2 ran before pass 1, matches never occur.

### Pass 3: `docStartThematicFixPlugin` (doc-start-thematic-fix.ts:21-72)

- **Matches:** `yaml` node at root position 0
- **Mutates:** splices `tree.children[0]` with synthesized `thematicBreak` nodes
- **Tree structure:** modified at root level only
- **Ordering:** synthesizes nodes with pre-set `position` (only first synthesized node gets position; subsequent ones have undefined position). Pass 4 gracefully handles missing position.

### Pass 4: `positionSlicePlugin` (position-slice.ts:47-208)

- **Visits:** specific types via switch — text, emphasis, strong, heading, list, code, thematicBreak, mdxJsx*, break
- **Mutates:** `.data.sourceDelimiter`, `.data.sourceStyle`, `.data.sourceRaw`, `.data.escapedChars`, `.data.bulletMarker`, `.data.listMarkerDelimiter`, `.data.sourceFenceChar`, `.data.sourceFenceLength`
- **Tree structure:** unchanged
- **Ordering:** must run AFTER passes 2 and 3 so synthesized/restructured nodes are visible. Must run BEFORE pass 5.

### Pass 5: `unknownMdastGuardPlugin` (unknown-mdast-guard.ts:134-178)

- **Matches:** nodes whose `.type` not in `KNOWN_TYPES`
- **Mutates:** replaces with `rawMdxFallbackMdast` synthetic node; reads `.position` to extract source slice; reads `.data.sourceRaw` written by pass 4
- **Tree structure:** replaces nodes in-place
- **Ordering:** **DEPENDENCY ON PASS 4.** Requires `.data.sourceRaw` written by pass 4 for certain node types.

### Merge feasibility verdict

**R17's "merge 5 into 1" is overstated.** A single same-node visitor cannot satisfy the pass-1 → pass-2 ordering because pass 2 needs pass 1's restoration of ALL nodes completed first. Merged walker must be structured as:

- **Phase A:** Pass 1 alone — independent visitor. All nodes, value-field restoration only.
- **Phase B:** Passes 2-5 merged into a single dispatcher visitor. Per-node callback dispatches:
  1. Pass 2 (autolink promotion) — if match, splice parent.children
  2. Pass 3 (doc-start thematic fix) — if root-level yaml at [0], splice tree.children
  3. Pass 4 (position slice) — attach `.data.*` fields
  4. Pass 5 (unknown mdast guard) — if type unknown, replace with fallback

Net: 2 visitor phases (down from 5). Still a major win versus current 5-phase pipeline, but the spec wording needs correction.

### Critical invariant for R17 implementation

**Byte-for-byte mdast output equivalence** (R20 in the rewrite) is the only safe acceptance criterion. The ordering dependencies above are subtle enough that silent divergences are plausible; a diff gate against the pre-merge pipeline's output on the full fixture corpus is the correctness proof.

### Pass-2 mid-visit mutation concern

`autolinkPromotionPlugin` reconstructs `parent.children` at line 109 while the parent is being visited. `unist-util-visit` (used by each current pass) handles this correctly via index-based iteration callbacks. A custom merged dispatcher must preserve this — using `unist-util-visit` as the outer loop and treating passes 2-5 as dispatch branches inside the callback is the simplest safe design. Writing a custom tree-walker from scratch re-introduces the class of bug this refactor is trying to eliminate.

## Implication for SPEC rewrite

R16's AC should include both `remarkMdxAgnostic` AND `remarkWikiLink` in the idempotency refactor. R17's AC should be reframed as "2-phase visitor (Phase A: restore values; Phase B: merged dispatch for passes 2-5), byte-identical mdast output verified via diff gate on full fixture corpus." The "5 into 1" claim moves to the Decision Log with the correction rationale.
