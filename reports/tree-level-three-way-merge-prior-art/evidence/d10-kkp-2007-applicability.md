# Evidence: D10 Khanna-Kunal-Pierce 2007 applicability to trees

**Dimension:** Does the KKP 2007 diff3 impossibility extend to tree-level merges?
**Date:** 2026-04-17
**Sources:** KKP 2007 paper (Springer link + abstract), academic summaries of the paper's claims, follow-up citations

---

## Key files / pages referenced

- [KKP 2007 Springer](https://link.springer.com/chapter/10.1007/978-3-540-77050-3_40) — formal publication
- [KKP 2007 ACM](https://dl.acm.org/doi/10.1007/978-3-540-77050-3_40) — duplicate index
- [KKP 2007 short PDF at UPenn](https://www.cis.upenn.edu/~bcpierce/papers/diff3-short.pdf)
- [Harmony papers bibliography](https://alliance.seas.upenn.edu/~harmony/old/harmony-papers_bib.html) — Pierce's lab bibliography
- [Collaborative XML Document Versioning (ResearchGate)](https://www.researchgate.net/publication/221431762_Collaborative_XML_Document_Versioning) — cites KKP 2007

---

## Findings

### Finding: KKP 2007 is explicitly scoped to list-structured data (text files as line sequences)

**Confidence:** CONFIRMED
**Evidence:** [KKP 2007 Springer abstract](https://link.springer.com/chapter/10.1007/978-3-540-77050-3_40)

From the paper's abstract:
> "The diff3 algorithm is widely considered the gold standard for merging uncoordinated changes to list-structured data such as text files, and surprisingly, its fundamental properties have never been studied in depth."
> "We offer a simple, abstract presentation of the diff3 algorithm and investigate its behavior, which turns out to be rather subtle."
> "The main result is a careful analysis of the intuition that edits to 'well-separated' regions of the same document are guaranteed never to conflict, proving that this holds under a clear statement of what 'well-separated' must mean."

**Scope:** list-structured data. The paper's formal framework uses lists (ordered sequences with insert/delete operations). The main result is that diff3 has good properties under well-separatedness conditions, with the subtlety that multiple "intuitive" formulations of well-separatedness turn out to be false in general.

### Finding: The paper's main result is NOT a pure impossibility — it's a characterization of when diff3 behaves well

**Confidence:** CONFIRMED (from abstract reading)
**Evidence:** [KKP 2007 Springer abstract](https://link.springer.com/chapter/10.1007/978-3-540-77050-3_40)

The paper doesn't prove "you CANNOT merge under all interleavings." It proves:
- diff3 has **good behavior** under careful formulations of "well-separated edits"
- Several **naturally-stated** forms of well-separatedness turn out to be insufficient (naive intuitions fail)
- The paper gives formal conditions under which diff3 is guaranteed safe

The common phrasing "KKP proves you cannot preserve content under arbitrary interleavings" is a **derived claim** — it's the contrapositive of "diff3 preserves content only under specific conditions." The paper's actual contribution is the formal characterization of those conditions, not an outright impossibility theorem.

### Finding: Tree structure provides MORE information but doesn't escape the fundamental limits

**Confidence:** INFERRED (from synthesis of KKP + tree-merge research literature)
**Evidence:** Cross-reference D7 findings (Lindholm 2001, Apel 2012, Mastery 2023)

Trees add identity structure (parent-child, sibling-order) that lists lack. In principle this could:
- Make more edit pairs "well-separated" in a structural sense (edits in different subtrees are provably independent)
- Enable move-detection that line-level diff3 can't see
- Support richer conflict heuristics (renamed-class-with-body-changes, moved-method-plus-signature-change)

**In practice** (from D7 evidence):
- Tree matching is NP-hard in general (Mastery 2023); production tools use heuristics
- Tree merge still produces "unmergeable" nodes that require falling back to text/line merge (JDime)
- AST round-trip loses formatting (Mastery) — a form of information loss equivalent to the text-round-trip info loss KKP 2007 characterizes

So tree structure **raises the ceiling** of what's merge-able without conflict, but does **not** deliver unconditionally-correct state-based three-way merge. The achievable-correctness region is strictly larger than for lists but is still bounded.

### Finding: Research community cites KKP 2007 as foundational but extends it tree-specifically — no "general tree impossibility" paper exists

**Confidence:** CONFIRMED
**Evidence:** Citations in Lindholm 2004, Apel 2012, Apel 2023 Mastery, Collaborative XML Document Versioning

Tree-merge research papers typically cite KKP 2007 as:
- Motivation (state-based merge has fundamental limits even for lists)
- A reference for formal analysis methodology (rigor in characterizing merge behavior)

But they DON'T claim to extend KKP's results to trees. The tree-merge community's approach has been:
- Design tree-specific heuristics (3DM, JDime, Mastery)
- Evaluate on corpus of real merges (not prove formal impossibility)
- Accept that unmergeable cases will exist and provide fallbacks

**There is no "tree-merge impossibility theorem" in the published literature that we can find.** The absence of such a theorem (despite 25+ years of tree-merge research) itself is evidence that tree-merge is in a weaker epistemic state than list-merge: list-merge has formal characterization (KKP), tree-merge has empirical heuristics (3DM, Apel).

---

## Implications for the central research question

KKP 2007's applicability to trees is the main formal question behind this rubric dimension. The answer is nuanced:

1. **KKP's formal results are list-specific.** Their framework uses ordered sequences; they don't prove tree-level impossibility.
2. **The contrapositive of KKP's main result** (arbitrary interleavings lose content under list-level diff3) transfers to **any serialize-merge-parse path** — because serialize-merge-parse IS list-level diff3 on the serialized representation.
3. **Tree structure provides real additional information** (node identity, hierarchical locality) that should let more edits be conflict-free in principle.
4. **In practice, tree matching is NP-hard and tree-merge tools degrade to line-level at leaves** (SemanticMerge, JDime). So tree structure doesn't rescue the serialize-merge-parse pattern in production — it just trades "line conflicts at every edit boundary" for "structural conflicts on unmergeable nodes + line conflicts on leaf content."

**Bottom line:** KKP 2007 is not directly a "trees are impossible" theorem. But the gap between theoretical tree-merge-achievability and production-tree-merge-availability is wide. Tree structure helps in principle; in practice, no production system has delivered "tree three-way merge that dominates serialize-merge-parse across realistic corpora" for WYSIWYG editor state.

---

## Negative searches

- Searched for "tree merge impossibility theorem" / "impossibility three-way tree" → no formal tree analogue to KKP
- Searched for "diff3 tree extension formal" → only cites of KKP in tree-merge papers, no formal tree generalization
- Searched for "structured merge impossibility" → Apel's papers discuss complexity (NP-hard matching) but not impossibility

---

## Gaps / follow-ups

- The full KKP 2007 paper PDF could not be fetched cleanly (encoding issues) — a careful re-read would confirm the scope exactly matches the abstract claims. Based on the abstract + multiple secondary citations, the list-specific scope is highly likely.
- A follow-up question would be: if a tree CRDT's internal representation IS identity-preserving (every node has a stable ID across renders), does that provide enough structure to make tree-merge achievable where tree-diff fails? Kleppmann et al. 2022's movable-tree CRDT answers a related but different question (CRDT convergence, not state-merge).
