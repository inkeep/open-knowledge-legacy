---
name: Tree-level three-way merge — prior art survey
description: Survey of production CRDT editors, academic literature, and version-control systems on tree-level three-way merge against external non-CRDT state. Finding: not a solved production pattern; serialize-merge-parse is the universal fallback.
type: research
date: 2026-04-17
depth: medium-deep
status: complete
---

# Tree-Level Three-Way Merge: Prior Art

## Reader guide

This report answers: **is tree-level three-way merge against external non-CRDT state a solved production pattern, or does everyone fall back to serialize-merge-parse / avoid the problem / require manual resolution?**

3P-factual research. Does not contain 1P recommendations. Consuming artifacts (e.g., `stories/2026-04-17-text-only-crdt-pm-projection/STORY.md` A11) make decisions from these findings.

Ten dimensions investigated: Git tree merge, Automerge, y-prosemirror's `updateYFragment`, Loro, the broader Yjs ecosystem, Milkdown, academic literature (Chawathe, Lindholm, Apel, Ignat, Kleppmann), industry editors (Notion, Figma, SemanticMerge), git-backed markdown editors (Obsidian, Dendron, Foam), and the KKP 2007 formal diff3 impossibility.

Evidence files (10) at `evidence/d1-*.md` through `evidence/d10-*.md` with primary-source citations.

---

## Executive summary

**1. Tree-level three-way merge against external non-CRDT state is NOT a solved production pattern.** Across 10 dimensions, every shipping CRDT editor handles external reconciliation via serialize-merge-parse (text-layer diff3), discards local state, or surfaces manual conflict UI. Zero production CRDT editors expose a native tree-level three-way merge API.

**2. `updateYFragment` in y-prosemirror is explicitly 2-way — confirmed by direct source read.** Signature at `sync-plugin.js:1145` is `updateYFragment(y, yDomFragment, pNode, meta)` — four arguments, no common-ancestor parameter. The algorithm is a left-right matching walk (prefix/suffix skip, update-left-vs-update-right in middle range via `computeChildEqualityFactor`). Yjs maintainer `dmonad` publicly states diffing fragments without shared history is an unsupported use case.

**3. Automerge, Loro, and Yjs merges are ALL CRDT-op-history only.** Their "merge" means "combine op-logs of two replicas sharing common history." None provides a three-way merge against external non-CRDT state. Automerge's marketing "no merge conflicts" applies only within the CRDT domain. Loro's git-like `fork()`/`merge()`/`checkout()` operates exclusively between Loro versions.

**4. Production tree-merge that exists is code-specific and always hybrid.** SemanticMerge (Plastic SCM) is the industry's most advanced structured three-way merge — but its documentation explicitly states it "stops at method, property or field level, and the merge of the bodies of methods or properties is run in a text-based way." Matches academic research (Apel JDime 2012, Mastery 2023): tree merge at structural layer, line merge at leaves, NP-hard matching in general, manual resolution on unmergeable nodes.

**5. KKP 2007 impossibility is list-specific; tree structure raises the theoretical ceiling but not the production ceiling.** Khanna-Kunal-Pierce 2007 formally analyzes diff3 on list-structured data; the paper does not prove a general tree-level impossibility. Tree structure (node identity, hierarchical locality) provides more information that SHOULD enable more conflict-free merges in principle. In practice, tree matching is NP-hard (Mastery 2023), production tools degrade to heuristics + line-level fallback at leaves, and no published system dominates serialize-merge-parse on realistic WYSIWYG corpora.

---

## Per-dimension findings

### D1 — Git's tree merge

Path-aware at filesystem tree level; **content inside blobs is opaque** — merged via line-level diff3. ORT/recursive strategies add ancestor-graph sophistication (virtual merge base for criss-cross) but do NOT add structural merge inside blobs.

Git is the canonical "solved" reference for three-way merge, but its tree is filesystem, not document AST. Evidence: `git-scm.com/docs/merge-strategies`, `git-merge-tree` docs, `github.com/git/git/merge-recursive.c`.

See `evidence/d1-git-tree-merge.md`.

### D2 — Automerge

CRDT-op-history merge only. Direct investigation of `automerge.org/docs/reference/under-the-hood/merge-rules` confirmed no external-state reconciliation primitive.

Upwelling and Patchwork (Ink & Switch) do branching — but branches are themselves Automerge documents, not reconciliations against non-CRDT state. Tiny Essay Editor README confirms "no discussion of importing external markdown changes or reconciling against non-CRDT state."

See `evidence/d2-automerge-merge-semantics.md`.

### D3 — y-prosemirror `updateYFragment`

**Two-way diff**, confirmed by direct source read of v1.3.7 `sync-plugin.js`. Function signature `updateYFragment(y, yDomFragment, pNode, meta)` — no base/ancestor arg. Internal algorithm: left-right matching walk using `equalYTypePNode` deep-equality.

Concurrent-edit correctness comes from Yjs's RGA CRDT below; `updateYFragment` is a local PM→Y reflection function.

Confirming quote from Yjs maintainer `dmonad`: "Yjs takes the approach of showing what the user actually changed." Source: `discuss.yjs.dev/t/y-prosemirror-updateyfragment-algorithm-accuracy/1273`.

See `evidence/d3-y-prosemirror-updateYFragment.md`.

### D4 — Loro

Based on Kleppmann et al. 2022's movable-tree CRDT (op-based, convergent by construction). Provides `fork()`/`merge()`/`checkout()` between Loro versions — strictly within the CRDT domain.

Investigation of `docs.rs/loro` confirmed: "Loro does not expose any API for three-way merge against external non-CRDT state." The capability gap matches Automerge and Yjs.

See `evidence/d4-loro-tree.md`.

### D5 — Yjs ecosystem

After 7+ years of production use and a large community forum, **no plugin or library for tree-level three-way merge on Y.XmlFragment exists.**

The pubpub/prosemirror-diff and hamflx/prosemirror-diff projects do 2-way visual diffs only (for review UX, not merge). Greg Wilson's 2017 "Diff and Merge for ProseMirror" post framed this as an unrealized opportunity; still unrealized 9 years later.

CollabMD community project does disk→CRDT reconciliation via serialize-merge-parse at the text layer.

See `evidence/d5-yjs-ecosystem.md`.

### D6 — Milkdown

Direct source read of Milkdown's `collab-service.ts` confirmed it imports `ySyncPlugin` from y-prosemirror as-is, with no custom merge logic.

**No disk/filesystem integration whatsoever** — markdown files are import/export endpoints; reconciliation is "destroy and recreate editor." Even an editor explicitly focused on markdown defers external-reconciliation to the application layer.

See `evidence/d6-milkdown-disk-reconciliation.md`.

### D7 — Academic literature

25+ years of research:
- **Chawathe et al. 1996** — tree-edit-distance "Change detection in hierarchically structured information"
- **Lindholm 3DM (2001/2004)** — XML three-way merge
- **Apel FSTMerge (2011), JDime (2012), Mastery (2023)** — structured merge
- **Ignat/Molli treeOPT (2003)** — hierarchy-aware OT
- **Kleppmann (2022)** — movable-tree CRDT

Collective verdict: **tree diffing is solved (2-way), tree merging is partially solved for code with NP-hard matching and leaf-level text fallback, none has been absorbed into production CRDT collaborative editors.**

Mastery (state-of-the-art): "conversion back from AST to source code through pretty-printing may impose a completely different formatting style on the merged files" — a form of information loss analogous to serialize-merge-parse.

See `evidence/d7-academic-literature.md`.

### D8 — Industry editors (Notion, Figma, SemanticMerge)

- **Notion** — hybrid OT-for-text + CRDT-for-structure, no external file representation to reconcile against.
- **Figma branching** — manual-conflict-resolution UI, no algorithmic three-way structural merge.
- **SemanticMerge (Plastic SCM)** — most advanced shipping tool, explicitly hybrid (tree at structural level, text at leaves, language-specific parsers required, only C#/Java/C/C++/PHP supported).

**No production system has both (a) tree-shaped live editing state AND (b) robust three-way merge against external tree state.**

See `evidence/d8-notion-figma-semanticmerge.md`.

### D9 — Git-backed markdown editors

Obsidian + git plugin falls back to standard git line-level diff3 with manual resolution ("open Source mode, resolve markers manually"). Custom git merge drivers in the Obsidian community handle JSON config files only, NOT markdown content. Dendron and Foam follow the same pattern. GitBook + mdBook + similar all use line-level git merge.

**No git-backed markdown editor surveyed implements tree-level merge for conflict resolution** despite obvious community appetite.

See `evidence/d9-git-markdown-editors.md`.

### D10 — KKP 2007 applicability

Paper's formal framework is list-specific (ordered sequences with insert/delete ops). Main result is a characterization of "well-separated edits" under which diff3 has good properties — not an outright impossibility, but demonstrates that multiple "natural" safety intuitions fail in general.

**The list-level results transfer to any serialize-merge-parse path** (because serialize-merge-parse IS list-level diff3 on serialized text). Tree structure raises the theoretical ceiling but production reality (NP-hard matching, leaf-level text fallback) means tree-merge doesn't rescue serialize-merge-parse in practice.

No analogous "general tree-merge impossibility theorem" exists in the literature; tree-merge research is empirical-heuristic, not formal-impossibility.

See `evidence/d10-kkp-2007-applicability.md`.

---

## Direct answers to key research questions

**Q: Is tree-level three-way merge a solved engineering pattern or an open research question?**

**A: Open in production.** 25+ years of research exists, but zero production CRDT editors implement it. The research that exists is code-specific (SemanticMerge, JDime, Mastery) and always hybrid (tree + text + manual). "Open research question" is the accurate framing; calling it "solved" would misrepresent the gap between academic work and shipping systems.

**Q: What's the closest production-shipping pattern?**

**A: Git's path-aware tree merge + line-level content merge.** Every CRDT editor that reconciles against external state follows this template at one level down: serialize to text, run git-style line-level diff3, re-parse into CRDT.

**Q: Do tree-CRDT editors handle branch-switch reconciliation natively?**

**A: No.** They handle CRDT-internal branching (Loro, Automerge fork/merge/checkout, Ink & Switch Upwelling/Patchwork). Reconciling against external non-CRDT state (e.g., git checkout of a markdown file) is application-layer work. Typical patterns: reload from disk / discard local state / surface as conflict UI to the user.

**Q: Cost of serialize-merge-parse vs native tree-level?**

**A:** Serialize-merge-parse works but has real costs:
- (a) The KKP 2007 list-level impossibility transfers
- (b) Parse + serialize is information-lossy whenever the representation isn't exactly canonical (whitespace normalization, entity decoding, reordering of equivalent forms)
- (c) CRDT Item identity is often destroyed and recreated, losing origin attribution

Native tree-level is theoretically more preserving but **no production implementation delivers clean domination over serialize-merge-parse on realistic WYSIWYG corpora.** The academic tree-merge tools (Apel, Lindholm) show tree-level gains for code merge but even they fall back to text at leaves.

**Q: Middle ground — dual representation?**

**A:** Not a formally named pattern in the literature. Implicit in several production architectures: dual-CRDT bridges, Milkdown's Y.XmlFragment + markdown export, Ink & Switch's Automerge-JSON + markdown-string round-trip. None exposes a native tree-level three-way merge; all use text at the reconciliation boundary.

---

## Confidence calibration

- **CONFIRMED** (primary-source verified): D1, D2, D3, D4, D5, D6, D8, D9
- **CONFIRMED via exhaustive negative search:** D5's "no community plugin after 7+ years" claim
- **INFERRED** (abstract + secondary citations): D10 KKP full paper claims (PDF encoding issue prevented deep read); D7 literature synthesis
- **INFERRED** (multiple secondary sources; not proprietary-internal confirmed): D8 Notion hybrid OT+CRDT architecture (Notion internals closed-source)

---

## Primary-source citations

- **y-prosemirror updateYFragment source:** https://github.com/yjs/y-prosemirror/blob/master/src/plugins/sync-plugin.js (function definition line 1145; `equalYTypePNode` line 976)
- **Automerge merge rules:** https://automerge.org/docs/reference/under-the-hood/merge-rules/
- **Loro movable-tree blog:** https://loro.dev/blog/movable-tree
- **Loro 1.0 announcement:** https://loro.dev/blog/v1.0
- **Milkdown collab source:** github.com/Milkdown/milkdown/blob/main/packages/plugins/plugin-collab/src/collab-service.ts
- **Git merge-strategies:** https://git-scm.com/docs/merge-strategies
- **SemanticMerge intro guide:** https://docs.plasticscm.com/semanticmerge/intro-guide/semanticmerge-intro-guide
- **KKP 2007 Springer:** https://link.springer.com/chapter/10.1007/978-3-540-77050-3_40
- **Lindholm 2004 ACM:** https://dl.acm.org/doi/10.1145/1030397.1030399
- **Apel Mastery 2023 preprint:** https://paulz.me/files/mastery-preprint.pdf
- **Ignat treeOPT 2003:** https://members.loria.fr/CIgnat/files/pdf/IgnatECSCW03.pdf
- **Kleppmann 2022 movable-tree:** https://martin.kleppmann.com/papers/move-op.pdf
- **Ink & Switch Upwelling:** https://www.inkandswitch.com/upwelling/
- **Third Bit 2017 ProseMirror diff:** https://third-bit.com/2017/11/22/prosemirror-diff-merge/
- **Yjs forum (dmonad on updateYFragment):** https://discuss.yjs.dev/t/y-prosemirror-updateyfragment-algorithm-accuracy/1273
- **Milkdown collab docs:** https://milkdown.dev/docs/guide/collaborative-editing
- **Obsidian forum on sync conflicts:** https://forum.obsidian.md/t/robust-sync-conflict-resolution/93544
