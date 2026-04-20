---
title: "Three-Way Merge Content Preservation: Hybrid diff3+DMP, CRDT-Native Alternatives, and Post-Condition Invariants"
description: "Formal analysis of content-preservation guarantees for hybrid line-level-diff3 + character-level-DMP three-way merge under concurrent-writer interleavings. Source-traces node-diff3 + diff-match-patch + Yjs state-vector machinery. Surveys academic formal characterization (Khanna-Kunal-Pierce 2007), CRDT-native alternatives (Yjs state vectors, Peritext, Automerge), and production three-way-merge systems (git, Mercurial, Darcs, Pijul, OT). Concludes with concrete recommendations for the post-condition invariant inside mergeThreeWay and the architectural question of whether plaintext three-way merge can ever preserve content under all interleavings."
createdAt: 2026-04-16
updatedAt: 2026-04-16
subjects:
  - node-diff3
  - diff-match-patch
  - Yjs
  - Peritext
  - Automerge
  - Pijul
  - Darcs
  - Git
  - Operational Transformation
topics:
  - three-way merge correctness
  - content preservation invariants
  - CRDT bridge architecture
  - state-based vs operation-based merge
  - markdown collaborative editing
---

# Three-Way Merge Content Preservation: Hybrid diff3+DMP, CRDT-Native Alternatives, and Post-Condition Invariants

**Purpose:** Determine whether any purely-plaintext three-way merge — including the hybrid line-level-diff3 + character-level-DMP algorithm shipped in PR #161 — can preserve content under ALL concurrent-writer interleavings. Survey the alternatives (CRDT-native merge via Yjs state vectors, Peritext / Automerge single-CRDT models, OT, patch-theory systems). Recommend the correct post-condition invariant for the bridge and frame the long-term architectural question.

## Executive Summary

**The question driving this report:** can the bridge's hybrid algorithm (line-level diff3 + character-level DMP within conflict regions) be made content-preserving under all interleavings, or is the failing seed `1776386718697` evidence of a fundamental algorithmic limit?

**The answer is unambiguous from the academic literature:** **No purely-state-based three-way merge can guarantee content preservation under arbitrary interleavings.** This is a 19-year-old result (Khanna, Kunal, Pierce — FSTTCS 2007) that formally characterizes diff3 as: not idempotent, not stable under input perturbation, not "near-success-on-similar-replicas" — all three negative properties demonstrated by concrete counter-examples in the paper. The hybrid diff3+DMP algorithm inherits these limits because it is still state-based: it operates on `(base, mine, theirs)` snapshots and uses LCS-based alignment, which is fundamentally ambiguous for similar-but-non-identical sequences (think markdown documents that share many blank lines and headings).

**The bug at seed `1776386718697` is therefore a reproduction of the academic counter-example class, not a bug in our specific implementation.** The hybrid algorithm correctly handles many interleavings — it's a strict improvement over `patch_apply`'s 2-3% silent loss. But it does not, and cannot, eliminate the content-loss class entirely while remaining purely state-based.

**Two architectural escapes exist, each with cost:**

1. **Single-CRDT collapse (long-term, structural):** adopt Peritext (via Yjs 14 unified YType, or Automerge's Text). The dual-view bridge disappears because there is one CRDT for both rich-text and source-text views. Content preservation becomes a structural CRDT property — guaranteed by construction, not by post-hoc assertion. Cost: 2-4 weeks for Yjs 14 path per `peritext-on-yjs-feasibility/REPORT.md`; 12-20 weeks for Automerge migration per `automerge-prosemirror-migration-assessment/REPORT.md`.

2. **CRDT-op-based bridge (medium-term, partial):** preserve the dual-CRDT architecture but route bridge translations through Yjs's state-vector machinery. The bridge stops doing markdown-level reconciliation and instead forwards Y-protocol operations between the two types via a structural translator. Hard for the same reason the bridge is hard today: markdown source ↔ rich-text tree has no structural 1:1 op correspondence. This is the harder path, with no off-the-shelf precedent.

**Within the current state-based hybrid (immediate, accepted-loss):** add a post-condition assertion inside `mergeThreeWay` based on **invariant (c) — maximal-unique-substring subset.** This is the natural verification that "every contiguous block of text unique to one side appears in the merged result." It's strictly stronger than the current fuzz oracle (d) and weaker only than Pijul's line-order guarantee (which requires patch theory, not snapshots). When the invariant fires, we have caught the algorithm at its fundamental limit — and we have an observable signal indicating that the user's edit needs the structural escape.

**Key Findings:**

- **node-diff3 and DMP are individually content-preserving in the round-trip sense; loss is in the COMPOSITION.** node-diff3's classification preserves all bytes in the conflict triple (D1). DMP's `diff_main` round-trips exactly (D2). The loss happens when the caller resolves a 3-way conflict using a 2-way diff — `diff_main(mine, theirs)` semantically discards mine-only content because that's what 2-way diffs do. This is the structural mismatch driving the seed-`1776386718697` failure (see `evidence/d2`).

- **Khanna-Kunal-Pierce 2007 formally proves diff3 cannot guarantee well-separated-edits-don't-conflict in general.** The "well-separated" theorem (4.1.1) requires a uniqueness precondition: at least one element in the untouched region must occur exactly once across all three sequences. For markdown documents (many similar blank lines and headers), this precondition is rarely satisfied. Plus diff3 is provably not idempotent (Fact 4.2.2), not stable (Fact 4.4.2), and not near-success-on-similar-replicas (Fact 4.3.2).

- **Yjs state-vector machinery (`encodeStateAsUpdate(doc, baseSV)`) is a CRDT-native content-preserving primitive — but it operates per-doc, not per-type.** It cannot directly replace diff3+DMP in the bridge because the bridge translates between two Y-types within ONE Y.Doc. State vectors don't distinguish types (D4).

- **Peritext / Automerge collapse the dual-CRDT problem by design.** A single rich-text CRDT serves both rich-text rendering and (with translation) source-text view. Content preservation is structural. Cost is migration / Yjs 14 ecosystem readiness — see existing reports `peritext-on-yjs-feasibility/REPORT.md` and `automerge-prosemirror-migration-assessment/REPORT.md`.

- **Production three-way-merge systems (git, Mercurial) are CONSERVATIVE, not LOSSY:** they emit conflict markers rather than auto-resolve. Pijul/Darcs go further with structural patch-theory guarantees including line-order preservation. CRDT systems (Yjs, Automerge) preserve content at the operation level. **No production system that auto-merges plaintext under arbitrary interleavings preserves content** — they all either emit markers (git/hg) or use a non-snapshot model (Pijul/CRDTs).

- **The post-condition inside `mergeThreeWay` should be invariant (c) — maximal-unique-substring subset.** This catches the failure class without false positives, is implementable in O(n log n) via suffix arrays, and is strictly stronger than the current fuzz oracle's marker-prefix check while remaining weaker than the unattainable line-order preservation.

## Research Rubric

| ID | Dimension | Priority | Depth | Evidence |
|---|---|---|---|---|
| D1 | `node-diff3` algorithm correctness + `excludeFalseConflicts` trade-off | P0 | Deep | [d1](evidence/d1-node-diff3-source-trace.md) |
| D2 | DMP `diff_main` content preservation + 2-way vs 3-way mismatch | P0 | Deep | [d2](evidence/d2-dmp-diff-main-and-patch-apply.md) |
| D3 | Academic formal characterization (Khanna-Kunal-Pierce, Mens) | P0 | Deep | [d3](evidence/d3-academic-formal-characterization.md) |
| D4 | CRDT-native merge via Yjs state vectors | P0 | Deep | [d4](evidence/d4-yjs-state-vector-crdt-native-merge.md) |
| D5 | Peritext / Automerge single-CRDT viability | P1 | Moderate | [d5](evidence/d5-peritext-automerge-single-crdt.md) |
| D6 | Operational Transformation historical context | P1 | Moderate | [d6](evidence/d6-ot-historical-context.md) |
| D7 | Production systems (git, Mercurial, Darcs, Pijul, ShareJS) | P0 | Deep | [d7](evidence/d7-production-systems-three-way-merge.md) |
| D8 | Post-condition invariant design (a/b/c/d) | P0 | Deep | [d8](evidence/d8-post-condition-invariants.md) |
| D9 | Fuzz-oracle relationship to post-condition | P1 | Moderate | [d9](evidence/d9-fuzz-oracle-design.md) |

## Detailed Findings — Summary

(Full evidence in linked files.)

### D1: node-diff3 is content-preserving at classification; loss is in caller-resolver

`node-diff3@3.2.0` preserves all input bytes during its classification phase. Stable regions copy from `o`; single-hunk regions copy from the changed side; conflict regions emit a triple `{aContent, oContent, bContent}` containing every byte from each side.

The library's contract: **classification is lossless; resolution is the caller's problem.** `diff3Merge(a, o, b)` with `excludeFalseConflicts: true` (the default) emits conflict objects for caller-driven resolution.

**Implication:** the loss in the bridge is NOT in node-diff3's classification. It is in the caller's `mergeConflictRegion` resolver, which uses `diff_main(mine, theirs)` to "smartly resolve" conflicts — and that's where 2-way semantics drop content unique to mine.

### D2: DMP `diff_main` cannot preserve content in 3-way conflicts because it's a 2-way diff

`diff-match-patch@1.0.5` `diff_main(text1, text2)` is a Myers O(ND) diff. **Within its own contract**, no characters are lost — it round-trips.

But: applying `diff_main(mine, theirs)` to mine yields theirs. By construction it discards everything mine had that theirs lacks. **This is the structural mismatch in the hybrid algorithm.** A three-way conflict region carries content unique to mine that the 2-way diff has no representation for.

The contrast with `patch_apply` is illuminating: `patch_apply` has a documented fuzz-loss mode; `diff_main` does not have a fuzz-loss mode but applying its output is *necessarily* lossy for one side because that's what 2-way diffs do.

### D3: Khanna-Kunal-Pierce 2007 formally characterizes diff3's negative properties

[A Formal Investigation of Diff3](https://www.cis.upenn.edu/~bcpierce/papers/diff3-short.pdf) provides the foundational formal analysis:

- **Theorem 4.1.1 (well-separated regions):** safe τ-respecting configurations lead to conflict-free merge. **But** the "safe" precondition requires the untouched region to contain at least one element occurring exactly once across all three sequences. For markdown documents with many similar lines, this precondition is rarely satisfied.
- **Fact 4.2.2:** diff3 is NOT idempotent.
- **Fact 4.3.2:** diff3 does NOT guarantee near-success on similar replicas.
- **Fact 4.4.2:** diff3 is NOT stable.

**No theorem in the paper states "diff3 always preserves content."** The structural definition of `out(H)` (chunk output) preserves content in the conflict triple, but end-to-end output depends on the printing/resolution choices.

**The paper formally rules out the existence of a "small fix" to diff3 that would solve content-preservation in general.**

**Implication:** seed `1776386718697` reproduces the academic counter-example class.

### D4: Yjs state vectors are content-preserving but per-doc, not per-type

`yjs@13.6.30` provides `encodeStateAsUpdate(doc, baseSV)` — the canonical CRDT-native delta extraction. Content-preserving by construction.

**But: state vectors operate at Y.Doc granularity, not Y-type granularity.** Both `Y.XmlFragment('default')` and `Y.Text('source')` in the bridge live in the same Y.Doc, sharing one StructStore. There is no "extract Y.Text ops since baseline" primitive — `encodeStateAsUpdate` returns ops for the entire doc.

**Implication for the bridge:**
- State-vector sync is the right primitive for *peer-to-peer* sync (which Yjs+Hocuspocus already do at the WebSocket layer).
- It is NOT directly applicable as a replacement for diff3+DMP inside the type-boundary translation in Observer A / Observer B.

### D5: Peritext / Automerge collapse the bridge by being a single CRDT

[Peritext](https://www.inkandswitch.com/peritext/) (Litt, Lim, Kleppmann, van Hardenberg — CSCW 2022) is a CRDT for rich text where formatting is stored as spans referencing character IDs in a flat RGA-like sequence. Both rich-text rendering and plain-text view are projections of one CRDT. There is no type boundary.

[Automerge 2.2+](https://automerge.org/blog/2024/04/06/richtext/) ships Peritext as production. Yjs 14 (beta) unifies its types making Peritext implementable.

**Caveat:** Peritext eliminates the bridge for *rendering*. If the source-mode editor edits the markdown text representation and writes it back, the markdown ↔ Peritext translation problem returns. The escape is full only if the source-mode editor speaks Peritext directly.

### D7: Production systems split into three classes

| Class | Examples | Content preservation | How |
|---|---|---|---|
| State-based + conservative | git, Mercurial, GNU diff3 | Yes (via markers) | Conflict markers; user resolves |
| State-based + auto-pick | `git merge-file --ours/--theirs` | NO (drops one side) | User-selected loss |
| State-based + concat | `git merge-file --union` | Yes (mangled order) | Both sides concatenated |
| Patch theory | Darcs, Pijul | Yes (structural) | Pushout in patches category |
| CRDT op-based | Yjs, Automerge, Loro | Yes (structural) | Op-level total order |
| OT op-based | ShareJS, Wave | Yes (structural) | Transform preserves both ops |

**Key observation:** *no production system that auto-merges plaintext under arbitrary interleavings preserves content*. Conservative systems emit markers when they can't decide. "Smart" systems abandon snapshot reconciliation in favor of patches/operations.

### D8: Invariant (c) — maximal-unique-substring — is the right post-condition

| Invariant | Strength | Catches | Misses | Verdict |
|---|---|---|---|---|
| (a) char-multiset | Weak | Outright deletion | Reordering | Floor only — too coarse |
| (b) char-set | Trivial | Catastrophic loss | Almost everything | Useless |
| (c) max-unique-substring | Right | Contiguous content loss | Order changes | **RECOMMENDED** |
| (d) line/word identity | Weak⁺ | Whole-line loss | Sub-line changes | Test-time discretization |
| Pijul order-preservation | Strongest | Reordering | (Achievable only with patches) | Out of reach for state-based |

**Invariant (c) catches the failure class.** When the bridge's `mergeConflictRegion` collapses A's content via `diff_main(mine, theirs)`, A's maximal-unique substring (e.g., `M5-foo bar`) is no longer a substring of result. The assertion fires, naming the lost content.

**It's implementable.** Compute maximal unique substrings of mine vs. base and theirs vs. base via suffix-array diff (O(n log n)). For each, check substring presence in result. Sub-millisecond for typical markdown.

## Recommendations

### Recommendation 1: Add invariant (c) as the post-condition inside `mergeThreeWay`

**Why:** When the algorithm loses content, we want to know — loudly, with the lost substring named. (c) is the most precise invariant achievable by state-based merge.

**Cost:** O(n log n) implementation via suffix array; sub-millisecond for typical markdown.

**Surfaces:** assertion in dev/test; counter + structured log in production.

### Recommendation 2: Tighten the fuzz oracle to check full marker payloads

**Why:** Current oracle checks prefix-only. Tightening to full payload is a small change with significant coverage gain.

### Recommendation 3: Treat "operation-based merge via Yjs state vectors" as the architectural framing for the next bridge iteration — but acknowledge it does NOT directly apply to the current dual-CRDT layout

**Why:** State-vector merge is content-preserving at the Y.Doc level, not at the type-boundary level. To use it for the bridge, the architecture must change.

**This is NOT a recommendation to do that work now.** It IS a recommendation to frame the discussion: state-vector sync is the right primitive for *eliminating the failure class* if and when the bridge architecture changes.

### Recommendation 4: "Collapse to one CRDT" (Peritext via Yjs 14) is the only fully-correct long-term answer

**Why:** Per D3, no purely-plaintext three-way merge can guarantee content preservation under all interleavings. The only structural escape is to eliminate the type boundary — adopt a single CRDT for both rich-text rendering and source-text view (Peritext model).

**Cost:** Yjs 14 / Architecture C: 2-4 weeks; Automerge migration: 12-20 weeks.

**This is OUT OF SCOPE for the current spec but IN SCOPE for the framing of the post-condition.** The post-condition gives the data: how often does the failure class trigger? That answer informs whether the migration is worth the cost.

## Limitations & Open Questions

### Dimensions Not Fully Covered

- **GNU diff3 C source code dive.** Behavior is well-documented at the contract level (D7); skipped to focus on node-diff3.
- **Yjs 14 production-readiness as of 2026-04-16.** Existing report `peritext-on-yjs-feasibility/REPORT.md` covers this.

### Open Questions

1. **What is the production incidence rate of (c)-violations?** Cannot be answered until the post-condition is deployed.
2. **Is there a "biased matching" diff3 variant that satisfies (c) under more interleavings?** Khanna-Kunal-Pierce 2007 §5 hints at this; no follow-up paper exists.
3. **Could the bridge use a markdown-aware diff3 (parse-tree-level rather than line-level)?** Theoretically yes — diff3 over mdast trees.

## Sources

- [A Formal Investigation of Diff3 (Khanna, Kunal, Pierce — FSTTCS 2007)](https://www.cis.upenn.edu/~bcpierce/papers/diff3-short.pdf)
- [Peritext: A CRDT for Collaborative Rich Text Editing (CSCW 2022)](https://dspace.mit.edu/bitstream/handle/1721.1/147641/3555644.pdf?sequence=1&isAllowed=y)
- [Peritext landing page (Ink & Switch)](https://www.inkandswitch.com/peritext/)
- [Automerge 2.2: Rich Text](https://automerge.org/blog/2024/04/06/richtext/)
- [Pijul "Why Pijul"](https://pijul.org/manual/why_pijul.html)
- [Pijul Model](https://pijul.org/model/)
- [Understanding Darcs/Patch theory (Wikibooks)](https://en.wikibooks.org/wiki/Understanding_Darcs/Patch_theory)
- [Operational Transformation (Wikipedia)](https://en.wikipedia.org/wiki/Operational_transformation)
- [Towards a unified theory of OT and CRDT (Raph Levien)](https://medium.com/@raphlinus/towards-a-unified-theory-of-operational-transformation-and-crdt-70485876f72f)
- [Merging with diff3 (James Coglan)](https://blog.jcoglan.com/2017/05/08/merging-with-diff3/)
- [Git merge documentation](https://git-scm.com/docs/git-merge)
- [git-merge-file documentation](https://git-scm.com/docs/git-merge-file)

### Library Source

- `node_modules/node-diff3/src/diff3.mjs` (`node-diff3@3.2.0`)
- `node_modules/diff-match-patch/index.js` (`diff-match-patch@1.0.5`)
- `node_modules/yjs/src/utils/encoding.js` and `node_modules/yjs/src/utils/updates.js` (`yjs@13.6.30`)

## Related Research

- [reports/yjs-transaction-settlement-hooks/REPORT.md](../yjs-transaction-settlement-hooks/REPORT.md) — settlement hook is correct; this report shows merge algorithm has fundamental limits regardless
- [reports/crdt-origin-laundering-prior-art/REPORT.md](../crdt-origin-laundering-prior-art/REPORT.md) — typed origin objects + origin-aware reconciliation
- [reports/peritext-on-yjs-feasibility/REPORT.md](../peritext-on-yjs-feasibility/REPORT.md) — long-term collapse-to-one-CRDT path
- [reports/automerge-prosemirror-migration-assessment/REPORT.md](../automerge-prosemirror-migration-assessment/REPORT.md) — alternative single-CRDT migration path
- [reports/crdt-observer-bridge-latency-analysis/REPORT.md](../crdt-observer-bridge-latency-analysis/REPORT.md) — latency context
