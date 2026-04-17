# Evidence: D7 Academic literature — structured merge, tree-edit, tree-OT, tree CRDTs

**Dimension:** What has the academic literature produced on three-way tree-structured merge?
**Date:** 2026-04-17
**Sources:** Chawathe 1996, Apel 2011-2012, Lindholm 2001/2004, Ignat 2003-2004, Kleppmann et al. 2022, multiple XML-diff tool papers, Apel 2023 Mastery

---

## Key files / pages referenced

- [Chawathe 1996: Change detection in hierarchically structured information](https://pubs.dbs.uni-leipzig.de/se/files/Sudarshan1996Changedetectionin.pdf) — foundational tree-edit-script paper
- [Lindholm 2001 MSc thesis: 3DM](https://docplayer.net/50389383-A-3-way-merging-algorithm-for-synchronizing-ordered-trees-the-3dm-merging-and-differencing-tool-for-XML.html)
- [Lindholm 2004: A three-way merge for XML documents (ACM DocEng)](https://dl.acm.org/doi/10.1145/1030397.1030399) — published XML 3-way merge
- [Apel et al. 2011: FSTMerge](https://www.se.cs.uni-saarland.de/projects/jdime/)
- [Apel et al. 2012: Structured merge with auto-tuning (JDime)](https://www.researchgate.net/publication/232682365_Structured_merge_with_auto-tuning_Balancing_precision_and_performance)
- [Apel et al. 2023: Mastery — shifted-code-aware](https://paulz.me/files/mastery-preprint.pdf)
- [Ignat & Norrie 2003: treeOPT (ECSCW)](https://members.loria.fr/CIgnat/files/pdf/IgnatECSCW03.pdf)
- [Khanna, Kunal, Pierce 2007: A Formal Investigation of Diff3 (FSTTCS)](https://www.cis.upenn.edu/~bcpierce/papers/diff3-short.pdf)
- [Kleppmann et al. 2022: A highly-available move operation for replicated trees](https://martin.kleppmann.com/papers/move-op.pdf) — basis for Loro's tree CRDT
- [Semi-structured merge with language-specific syntactic separators (arXiv 2024)](https://arxiv.org/html/2407.18888v1)
- [On the Methodology of Three-Way Structured Merge (JSA 2023)](https://people.cs.vt.edu/~nm8247/publications/jsa23.pdf)

---

## Findings

### Finding: Chawathe 1996 formalized tree-edit-distance for hierarchically structured data — but for DIFFING, not merging

**Confidence:** CONFIRMED
**Evidence:** [Chawathe et al. SIGMOD 1996](https://pubs.dbs.uni-leipzig.de/se/files/Sudarshan1996Changedetectionin.pdf)

From the paper and summaries:
> "The work defines the hierarchical change detection problem as the problem of finding a 'minimum-cost edit script' that transforms one data tree to another, and presents efficient algorithms for computing such an edit script."
> "Detecting and representing changes to data is important for active databases, data warehousing, view maintenance, and version and configuration management."

This is a **2-way diff** algorithm (source tree → target tree), producing an edit script of node inserts, deletes, moves, updates. It's the foundational paper for tree-diffing but it's not a merge algorithm. Three-way merge needs additional structure: reconcile edit-script-A (base→left) with edit-script-B (base→right).

### Finding: Lindholm's 3DM (2001 thesis, 2004 ACM paper) is the canonical three-way XML merge — and reveals the depth of the problem

**Confidence:** CONFIRMED
**Evidence:** [Lindholm 2004 ACM DocEng paper](https://dl.acm.org/doi/10.1145/1030397.1030399), [Lindholm 2001 thesis](https://aaltodoc.aalto.fi/server/api/core/bitstreams/cd83234f-72c9-443d-b9f4-3ab58db341c9/content)

3DM targets "merging of XML formats that model human-authored documents as ordered trees, and derives merge rules from use cases involving collaborative editing and propagating changes across document variants."

Algorithm highlights:
- Element matching via content hashing and Q-gram distance
- Copy detection for subtrees replicated to multiple locations
- Move operations within or between parents
- Conflict resolution at the attribute level

**Crucially:** 3DM works best when nodes have **stable identity** (explicit IDs, or content-hash stability). For identity-less ordered trees, matching becomes a heuristic optimization problem. The paper's own evaluation discusses where matching succeeds vs fails. This is 2001 research — now 23 years old — and has **not been absorbed into production CRDT editors** (no major WYSIWYG editor today uses 3DM for bridge reconciliation).

### Finding: Apel et al.'s structured-merge line (FSTMerge 2011, JDime 2012, Mastery 2023) proves precision gains — and exposes the formatting problem

**Confidence:** CONFIRMED
**Evidence:** [Apel 2012 JDime paper](https://www.researchgate.net/publication/232682365_Structured_merge_with_auto-tuning_Balancing_precision_and_performance), [Mastery preprint](https://paulz.me/files/mastery-preprint.pdf)

JDime synthesis:
- Switches between unstructured (line) and structured (AST) merge based on conflict presence
- "Ensures the syntactic integrity of the merged code by merging on AST"
- Conflicts on unmergeable AST nodes "requiring manual intervention"

From the Mastery paper's limits discussion:
> "Tree matching for AST merging is NP-hard and difficult to approximate for general cases. A more scalable approach employs syntax-aware looking ahead matching, but looking ahead is only enabled for a few types of AST nodes and the maximum looking-ahead distance is short for efficiency considerations, and how to correctly merge shifted code remains an issue."
> "As the AST abstracts away formatting, the conversion back from AST to source code through pretty-printing may impose a completely different formatting style on the merged files."

This is key. Even the state-of-the-art code-aware merger **doesn't solve tree merge as a clean algorithm** — it:
1. Falls back to unstructured merge when AST doesn't help
2. Has fundamental matching complexity (NP-hard)
3. Loses formatting during the AST round-trip (a form of information loss that IS equivalent to the serialize-merge-parse information loss we see in CRDT editor contexts)

### Finding: Ignat's treeOPT (2003-2004) produces hierarchy-aware OT — but is not a three-way state merge

**Confidence:** CONFIRMED
**Evidence:** [Ignat & Norrie 2003 ECSCW](https://members.loria.fr/CIgnat/files/pdf/IgnatECSCW03.pdf)

From the abstract:
> "The treeOPT (tree Operational Transformation) algorithm relies on a tree representation of the document to achieve better efficiency, the possibility of working at different granularity levels and improvements in the semantic consistency. The algorithm applies the operational transformation mechanism recursively over the different document levels."

treeOPT is **operational** (op-transformation with hierarchical levels), not state-based. It solves concurrent editing of the same document when both editors are tracking ops. **It does not address reconciliation against a non-CRDT / non-OT external state.** This is the same shape as Loro's movable-tree CRDT: op-based convergence by construction, not state-based three-way merge.

### Finding: Khanna-Kunal-Pierce 2007 formal diff3 analysis — list-structured; the paper's claims do not trivially extend to trees

**Confidence:** INFERRED (the paper's full text could not be fetched; claims are derived from abstracts + summary)
**Evidence:** [KKP 2007 via Springer / arxiv abstracts](https://link.springer.com/chapter/10.1007/978-3-540-77050-3_40)

The paper's canonical claim from abstract:
> "The diff3 algorithm is widely considered the gold standard for merging uncoordinated changes to list-structured data such as text files, and surprisingly, its fundamental properties have never been studied in depth... The main result is a careful analysis of the intuition that edits to 'well-separated' regions of the same document are guaranteed never to conflict."

From the summary that surfaced in search:
> "Despite abundant anecdotal evidence that people find diff3's behavior intuitive and predictable in practice, characterizing its good properties turns out to be rather delicate: a number of seemingly natural intuitions are incorrect in general."

**Scope:** The paper is explicitly about **list-structured** data. It does not claim a general impossibility for tree-structured data. However:
- A tree IS encodable as a list (by serialization); the list-level impossibility of "content preservation under arbitrary interleavings" transfers to any serialize-merge-parse pattern
- Tree structure could in principle provide additional information (node identity, parent-child invariants, hierarchical locality) to make more merges conflict-free — but only insofar as the application preserves that identity across edits
- In practice, research papers (Lindholm, Apel) show that even with tree structure, matching is heuristic and conflict-free-ness is conditional on stable identity + bounded restructuring

**Key conclusion:** KKP 2007's impossibility is list-shape-specific, but the tree-level research literature (D7's Lindholm, Apel papers) independently demonstrates that tree-level merge is conditionally-correct only, not unconditionally-correct. The impossibility doesn't trivially carry over, but the ACHIEVABILITY doesn't improve in practice — tree-level merge is bounded by matching quality and by formatting-loss on AST round-trip.

### Finding: Kleppmann et al. 2022 movable-tree CRDT solves ONE specific problem — concurrent move-create-delete convergence — and is the basis of Loro's tree

**Confidence:** CONFIRMED
**Evidence:** [Kleppmann et al. 2022 "A highly-available move operation for replicated trees"](https://martin.kleppmann.com/papers/move-op.pdf) (referenced in Loro blog)

The Kleppmann et al. paper proves convergence for a specific CRDT tree with move/create/delete operations. This is **CRDT convergence**, which is a different problem than three-way merge against external non-CRDT state. The paper doesn't claim to solve external-state reconciliation.

---

## Implications for the central research question

Academic literature on tree-structured three-way merge goes back to 1996 (Chawathe) and has an active research line to 2023 (Apel's Mastery). Key takeaways:

1. **Tree diffing is solved (Chawathe 1996).** 2-way tree-edit-distance is well-understood for ordered trees.
2. **Tree merging is partially solved (Lindholm 2001/2004, Apel 2011-2023).** 3-way merge works well for documents with stable identity (XML with IDs, code ASTs with named declarations) and under bounded restructuring. It falls back to line-level merge on unmergeable fragments.
3. **Tree-OT (Ignat 2003) and tree-CRDT (Kleppmann 2022) solve CRDT convergence for tree-shape state — a different problem from state-based three-way merge.**
4. **Khanna-Kunal-Pierce 2007 formal diff3 analysis is list-specific but the matching-heuristic-dependence of tree-level merge means tree-level doesn't escape to a "fully solved" regime.**

**None of this academic work has been adopted into production CRDT collaborative editors.** The research exists as Java source-merge tools (JDime, Mastery), as XML-specific commercial tools (DeltaXML, Oxygen, Altova DiffDog), and as OT research prototypes — none as a Y.XmlFragment / Automerge tree / LoroTree three-way merge primitive.

---

## Negative searches

- Searched for "three-way merge" + "production editor" + "tree" → only SemanticMerge (Plastic SCM, for code) — not a CRDT editor
- Searched for "prosemirror three-way merge" / "tiptap three-way merge" → no production implementation
- Searched for "y.js tree merge library" → no hits
- Searched for "KKP 2007 tree applicability" / "diff3 tree extension" → the paper is explicitly list-shape; no formal tree generalization found in reasonable search scope

---

## Gaps / follow-ups

- A deep read of KKP 2007 full PDF (fetch failed due to PDF encoding) would clarify whether they make any generalization claims; abstracts suggest list-only
- Apel 2023 Mastery's "shifted-code-aware" is the most recent advance and claims improvement over JDime — but it's a code-merge tool, not a general tree-merge library
