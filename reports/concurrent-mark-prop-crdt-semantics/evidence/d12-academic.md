# Evidence: D12 — Academic literature: Peritext, Fugue, Eg-walker, interleaving anomalies

**Dimension:** D12
**Date:** 2026-04-17
**Sources:** Peritext (Litt, Kleppmann 2022), Fugue (Weidner, Kleppmann 2023), Eg-walker (Gentle, Kleppmann 2024), Interleaving anomalies paper

---

## Key pages referenced

- https://www.inkandswitch.com/peritext/static/cscw-publication.pdf — Peritext CSCW 2022
- https://arxiv.org/abs/2305.00583 — "The Art of the Fugue" (Weidner & Kleppmann 2023)
- https://arxiv.org/abs/2409.14252 — "Collaborative Text Editing with Eg-walker" (Gentle & Kleppmann 2024)
- https://www.semanticscholar.org/paper/Interleaving-anomalies-in-collaborative-text-Kleppmann-Gomes/ — Kleppmann & Gomes interleaving paper
- https://mattweidner.com/2022/10/21/basic-list-crdt.html — Fugue blog
- https://loro.dev/blog/loro-richtext — Loro's Peritext/Fugue integration writeup

---

## Findings

### Finding: Peritext (Litt, Lim, Kleppmann, van Hardenberg 2022) — formalizes the "concurrent overlapping marks" problem and solves via anchor-based operation sets

**Confidence:** CONFIRMED
**Evidence:** ACM PACMHCI Vol 6 CSCW2 Article 531 (November 2022).

Key contribution: per-mark `expand` flags (before/after/both/none) deterministically controlling boundary insert behavior. Anchors (before/after each character) allow mark operations to attach without interleaving.

### Finding: Fugue (Weidner & Kleppmann 2023) — formalizes "maximal non-interleaving" as a correctness property for SEQUENCE CRDTs

**Confidence:** CONFIRMED
**Evidence:** arXiv:2305.00583

> "when two users concurrently insert text at the same position in the document, the merged outcome may interleave the inserted text passages, resulting in corrupted and potentially unreadable text. The problem has gone unnoticed for decades, and it affects both CRDTs and Operational Transformation."

Fugue defines:
- **Maximal non-interleaving** as a correctness property
- **Fugue** and **FugueMax** algorithms (semantically equivalent, tree-based and list-based)
- FugueMax proves maximal non-interleaving

**Key implication for this research:** Even for PLAIN TEXT (no marks at all), classic CRDTs (RGA, logoot, woot) can interleave concurrent inserts at the same position, producing corrupted prose. Examples: Alice types "hello" at position 0, Bob concurrently types "world" at position 0 → result can be "hwoerllod" in some RGA variants. Yjs uses YATA which is better than RGA but not maximal non-interleaving.

### Finding: Eg-walker (Gentle & Kleppmann 2024) — DAG-of-events algorithm bridging OT and CRDT strengths

**Confidence:** CONFIRMED
**Evidence:** arXiv:2409.14252

Eg-walker records edit history as a DAG and replays only the ancestors needed to merge — no persistent CRDT metadata on the list. Plain-text-only in the initial formulation; Loro is working on integrating Peritext-style rich-text semantics on top.

### Finding: Interleaving anomalies paper (Kleppmann & Gomes) — systematic catalog of anomalies in published text CRDTs

**Confidence:** CONFIRMED (paper exists at Semantic Scholar link)
**Evidence:** Title: "Interleaving anomalies in collaborative text editors". This paper predates Fugue and is the source of Fugue's motivation.

### Finding: The research community has UNIVERSALLY moved toward STRUCTURED marks (Peritext-style) for correct rich-text semantics — no paper proposes char-RGA-on-source as a valid approach

**Confidence:** CONFIRMED
**Evidence:** Peritext paper §"Comparison with CRDTs using inline control characters":

Peritext explicitly argues that inline-control-character approaches (Yjs's ContentFormat markers, EtherPad-style changesets on source text, or literal markdown chars) all share the same correctness flaw for concurrent overlapping mark operations.

The CSCW 2022 Peritext paper + the Kleppmann & Gomes interleaving anomalies paper + the 2023 Fugue paper form a coherent academic argument that:
- Sequence CRDTs can interleave at character level (Fugue's contribution is to minimize this)
- Mark semantics MUST be expressed at a higher level than sequence characters (Peritext's contribution)

No research output in 2022-2025 rebuts this — the position is effectively academic consensus.

### Finding: Loro ships Peritext + Fugue together in `crdt-richtext` — a production-usable implementation path

**Confidence:** CONFIRMED
**Evidence:** https://github.com/loro-dev/crdt-richtext

> "Rust implementation of Peritext and Fugue"

This is the closest thing to a turn-key production-grade Peritext implementation.

---

## Implications

- Academic consensus is that char-level CRDT merging on serialized rich-text source is incorrect.
- Peritext's "expand" flags are the accepted semantic foundation for mark merging.
- Fugue's "maximal non-interleaving" is the accepted correctness property for the underlying sequence CRDT.
- Production editors that ship char-RGA-on-markdown (HedgeDoc, Obsidian Relay) are in the "shipping what the research community calls broken" category.
- **The research literature does NOT propose char-RGA-on-source as a valid approach at any scale for rich text.** The academic position is unequivocal.

---

## Gaps / follow-ups

- No academic paper quantifies the PRACTICAL rate of Peritext-Example-3 artifacts in shipping editors — it's a correctness argument, not a reliability benchmark.
- No paper directly studies user tolerance for brief garbled-markdown states (e.g., self-healing via re-selection + re-toggle).
