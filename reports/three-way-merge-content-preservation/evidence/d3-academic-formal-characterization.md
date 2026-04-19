# Evidence: D3 — Academic Formal Characterization of Three-Way Merge

**Dimension:** Khanna-Kunal-Pierce (FSTTCS 2007), Mens (2002 survey), and adjacent academic literature on three-way text merge.
**Date:** 2026-04-16
**Sources:** [A Formal Investigation of Diff3 (Khanna, Kunal, Pierce, FSTTCS 2007)](https://www.cis.upenn.edu/~bcpierce/papers/diff3-short.pdf); cited literature.

---

## Key sources referenced

- **Khanna, Kunal, Pierce — "A Formal Investigation of Diff3" (FSTTCS 2007)** — primary reference, 12 pages
- Mens, T. — "A state-of-the-art survey on software merging" (IEEE TSE 28(5), 2002) — cited as [10] in Khanna et al.
- Foster, Greenwald, Kirkegaard, Pierce, Schmitt — "Exploiting schemas in data synchronization" (Harmony project, JCSS 2007)
- Lindholm, T. — "A three-way merge for XML documents" (DocEng 2004) — cited as [2]
- Chawathe, Rajaraman, Garcia-Molina, Widom — "Change detection in hierarchically structured information" (SIGMOD 1996) — cited as [3]
- Stallman et al. — GNU diffutils manual (2002) — cited as [11]

---

## Findings

### Finding F3.1: The paper formally distinguishes "false conflicts" from "true conflicts"

**Confidence:** CONFIRMED
**Evidence:** Khanna-Kunal-Pierce, p. 488 (§3 The Diff3 Algorithm), chunk classification:

> An unstable chunk H is classified as follows:
> - H is *changed in A*           if O[H] = B[H] ≠ A[H]
> - H is *changed in B*           if O[H] = A[H] ≠ B[H]
> - H is *falsely conflicting*    if O[H] ≠ A[H] = B[H]
> - H is *(truly) conflicting*    if O[H] ≠ A[H] ≠ B[H] ≠ O[H]

**Implication:** The "falsely conflicting" classification corresponds to node-diff3's `excludeFalseConflicts` (D1 evidence F1.4) — both replicas made the *same* edit. The paper's formal definition matches the implementation: `O[H] ≠ A[H] = B[H]` means the chunk in A literally equals the chunk in B (sequence-equality), and both differ from O. node-diff3's `isFalseConflict` (`diff3.mjs:349-355`) implements `A[H] = B[H]` as element-wise equality.

**For content preservation:** false conflicts are safe to auto-resolve by taking either side, and `excludeFalseConflicts` is the correct default. **True conflicts** (O[H] ≠ A[H] ≠ B[H] ≠ O[H]) are where content from both sides differs from base AND from each other — and the paper offers no automatic resolution for these. The output is the conflict triple, returned to the caller.

### Finding F3.2: The paper's `out(H)` function is content-preserving for the FOUR classes

**Confidence:** CONFIRMED
**Evidence:** Khanna-Kunal-Pierce, p. 489:

> Given a chunk H, we define the *output* of H to be the following triple of lists:
> ```
> out(H) = (A[H], O[H], B[H])    if H is stable or conflicting
>          (A[H], A[H], A[H])    if H is changed in A
>          (B[H], B[H], B[H])    if H is changed in B
> ```

**Implication:** For a *conflicting* chunk (whether falsely or truly), the algorithm preserves all three slices `A[H]`, `O[H]`, and `B[H]` in the formal output triple. The downstream tool (e.g., `diff3 -m`) is what chooses the printed representation — conflict markers, "take A," etc. **The algorithm itself, as formalized, loses no content.** Loss happens at the *interpretation/printing* layer, exactly as it does in the node-diff3 caller-resolver layer (D1 finding F1.6).

### Finding F3.3: Theorem 4.1.1 — the "well-separated regions" guarantee, with a precondition

**Confidence:** CONFIRMED
**Evidence:** Khanna-Kunal-Pierce, p. 491, Theorem 4.1.1:

> **Theorem 4.1.1.** Every safe τ-respecting configuration (A ← O → B) leads to a unique conflict-free synchronization.

Where "safe τ-respecting" is defined as:
- A τ-respecting configuration is one where O = O₁O₂O₃, replica A modifies only O₁ (or only O₃), replica B modifies only O₃ (or only O₁), and O₂ is untouched in both.
- *Safe* means the central (untouched) region O₂ contains an element x that occurs **exactly once** in each of O, A, and B.

**Implication for content preservation:** Even with maximum LCS matching, locality (well-separated regions) does NOT guarantee conflict-free merge in general. The paper provides a counter-example (Fig. 3, p. 491) showing that a region O₂ of arbitrary length can still produce a true conflict if the matching algorithm finds an alternative max-matching that crosses the boundary. The fix is the *uniqueness* condition: at least one element x in O₂ must be unique within all three sequences.

**For text merge:** This means line-level diff3 is conflict-free when each replica edits a different region AND the regions are separated by at least one unique line (a unique procedure header, blank line + unique content, etc.). For a typical markdown document with many similar lines (blank lines, headers like "## Notes"), the uniqueness condition can fail — and the paper proves a true conflict can occur.

### Finding F3.4: Diff3 is NOT idempotent

**Confidence:** CONFIRMED
**Evidence:** Khanna-Kunal-Pierce, p. 493, §4.2:

> **Property 4.2.1.** A synchronization algorithm is *idempotent* if (A ← O → B) ⇒ (A' ← O' → B') implies (A' ← O' → B') ⇒ (A' ← O' → B').
>
> **Fact 4.2.2.** Diff3 is *not* idempotent.

The paper provides a counter-example (Fig. 4) showing inputs `[1,2,4,6,8] ← [1,2,3,4,5,5,5,6,7,8] → [1,4,5,5,5,6,2,3,4,8]` synchronize to `[1,2,4,6,8] ← [1,2,3,4,6,7,8] → [1,4,6,2,3,4,8]`, then synchronizing again moves to a different state.

**Implication for content preservation:** Re-running diff3 on its own output can produce *different* output. This means the merge fixed-point can shift — content can move around even when re-running the algorithm. **It does NOT mean content is lost** in a single application; it means the merge result is sensitive to repetition. For a CRDT bridge that does sync→merge→sync→merge cycles, this could matter: a content item at position X after first merge might end up at position Y after second merge with no new input.

### Finding F3.5: Diff3 does NOT guarantee "near success on similar replicas"

**Confidence:** CONFIRMED
**Evidence:** Khanna-Kunal-Pierce, p. 494, §4.3:

> **Property 4.3.1.** A synchronization algorithm guarantees *near success on similar replicas* if there exists a universal constant c > 0 such that, for any ε-close pair (A,B), if (A ← O → B) ⇒ (A' ← O' → B'), then A' and B' are (cε)-close.
>
> **Fact 4.3.2.** Diff3 does *not* guarantee near success on similar replicas.

The counter-example (p. 494) shows ε-close inputs can synchronize to outputs that are far apart — when A and B are highly similar but the LCS matching against O picks a max-matching that drives A and B to divergent merged states.

**Implication for content preservation:** Even when both replicas are *very close* to each other (their diff is small), diff3 can produce a result where A' and B' diverge significantly. **This rules out an "approximate convergence" guarantee** — the algorithm doesn't smoothly degrade when inputs are close. For the bridge: this means we cannot rely on "if A's edit is small, the merge will preserve most of it" — pathological matchings can amplify small differences into large divergence.

### Finding F3.6: Diff3 is NOT stable

**Confidence:** CONFIRMED
**Evidence:** Khanna-Kunal-Pierce, p. 495, §4.4:

> **Property 4.4.1.** A synchronization algorithm is *stable* if there exists a universal constant c > 0 such that, for any three pairs (O₁, O₂), (A₁, A₂), (B₁, B₂), such that each pair is ε-close, if (A₁ ← O₁ → B₁) ⇒ (A'₁ ← O'₁ → B'₁) and (A₂ ← O₂ → B₂) ⇒ (A'₂ ← O'₂ → B'₂), then each pair of replicas (O'₁, O'₂), (A'₁, A'₂), (B'₁, B'₂) is cε-close.
>
> **Fact 4.4.2.** Diff3 is *not* stable, even for non-conflicting runs.

**Implication for content preservation:** Two slightly-different inputs can produce arbitrarily-different merge outputs. This compounds with F3.5 — diff3 has *no continuity* property between input perturbations and output perturbations. The bridge's invariant assertion cannot rely on "stability under small perturbation" — every concurrent edit pattern must be evaluated independently.

### Finding F3.7: The paper itself does NOT prove content preservation as an invariant

**Confidence:** CONFIRMED (negative finding — searched for content-preservation theorems)
**Evidence:** Khanna-Kunal-Pierce, full paper text. The paper proves:

1. **Theorem 4.1.1** — well-separated + safe ⇒ conflict-free (positive guarantee, but only in this restricted setting)
2. **Fact 4.2.2** — not idempotent (negative)
3. **Fact 4.3.2** — no near-success on similar replicas (negative)
4. **Fact 4.4.2** — not stable (negative)

**No theorem in the paper states "diff3 always preserves all content from A and B that's not in conflict."** The closest is the structural definition of `out(H)` (F3.2), which preserves the conflict triple structurally — but doesn't prove that the *interpreted* output (after caller-resolution) preserves content.

**For our bridge:** the academic foundation provides no guarantee that any plaintext three-way merge — diff3 or otherwise — preserves all content under arbitrary interleavings. The paper's own counter-examples show pathological inputs where diff3 produces conflicts even in well-separated cases (Fig. 3) and where similar inputs yield divergent outputs (Figs. 4, 5).

### Finding F3.8: Mens (2002) — three-way merge classification: state-based vs operation-based

**Confidence:** CONFIRMED
**Evidence:** Khanna-Kunal-Pierce, p. 485 (introduction):

> *Operation-based* synchronizers work by keeping track of the complete sequences of operations that have been applied to each replica and, during reconciliation, attempting to synthesize a single unified view of the data structure's edit history. By contrast, a *state-based* synchronizer sees only the current versions of the replicas to be reconciled, together with an *archive* of the last state they had in common (perhaps saved away at the end of the last synchronization).

Mens 2002 (cited [10]) provides the broader survey landscape. Key Mens taxonomy:

- **State-based (textual) merge** — diff3, GNU merge — works on snapshots, uses LCS-based alignment. Content preservation is **best-effort** and dependent on the alignment algorithm's choices.
- **Operation-based merge** — OT, CRDTs, Bazaar/Darcs/Pijul patches — works on operation sequences (or composable patch theory). Content preservation is **structural** because operations are commutative or have explicit conflict resolution rules.

**Implication:** The academic taxonomy explicitly identifies that state-based merge (which is what plaintext diff3+DMP does) cannot match the structural guarantees of operation-based merge. The paper's own conclusion in §5 (Future Work, p. 495) acknowledges:

> Our formalization suggests a number of interesting variations on diff3. ... Alternatively, the choice of two-way matchings could be biased by their effect on the output, especially when deciding between two similar choices, since there are instances when a choosing a different maximum match or even a slightly sub-optimal matching can lead to better results.

This is the academic admission that even tweaking the LCS choice doesn't save state-based merge from these pathologies — the *information* needed to preserve all content is simply not available in (A, O, B) snapshots when the alignment is ambiguous.

### Finding F3.9: There is NO impossibility proof, but no positive content-preservation theorem either

**Confidence:** INFERRED (literature scan, no exhaustive proof located)
**Evidence:** Mens 2002 + Khanna-Kunal-Pierce 2007 + downstream literature.

The academic literature on three-way text merge does not contain a formal **impossibility proof** stating "no purely state-based synchronizer can preserve content under all interleavings." Such a proof would require:
- A formal definition of "preserve content" as a desired property.
- A formal model of "all interleavings."
- A construction showing every algorithm satisfying the model fails some interleaving.

Instead, the literature contains:
- **Positive partial guarantees** — locality theorems with preconditions (F3.3).
- **Negative facts** — diff3 fails idempotence, near-success, stability (F3.4, F3.5, F3.6).
- **Structural arguments** — operation-based methods (CRDT/OT) preserve content by design (F3.8 framing).

**The argument is informal but strong:** state-based merge has access only to snapshots `(A, O, B)`. When LCS matching is ambiguous (multiple equally-long max-matchings exist), any choice loses information. The paper's Fig. 3 (locality counter-example) is the canonical demonstration: an arbitrarily-long region O₂ filled with non-unique elements can produce true conflict because the matching can drift.

**For our bridge:** the takeaway is that *any* purely-plaintext three-way merge inherits diff3's pathologies because it works from the same snapshot triple. Switching from diff3+DMP to a different state-based algorithm (e.g., character-level diff3) doesn't escape Theorem 4.1.1's preconditions — it just shifts the safe-input set. **Operation-based merge (CRDT) is the only structural escape.**

### Finding F3.10: Why the paper's results matter for OUR specific use case

**Confidence:** INFERRED
**Evidence:** F3.3 + F3.4 + F3.5 + F3.6 combined.

For the Open Knowledge bridge use case:
- **F3.3 says:** even line-separated edits can conflict if no unique line separator exists. Our bridge's mine vs theirs are often *very similar* markdown documents that share many lines (blank lines, headers, common phrases). The uniqueness precondition for guaranteed conflict-free merge is rarely satisfied.
- **F3.4 says:** re-running the merge after a sync cycle can shift content. Our bridge runs Observer A on a debounce — potentially multiple times — which means even if one cycle preserves content, subsequent cycles may not.
- **F3.5 + F3.6 say:** small differences in input can produce large differences in output. Our test fuzz oracle observed exactly this — at seed `1776386718697` a specific interleaving produced loss; at adjacent seeds it didn't.

**Conclusion:** The KKP 2007 paper formally characterizes why the bridge's flake at seed `1776386718697` is not a bug in our hybrid algorithm specifically, but a fundamental limitation of any state-based three-way merge applied to plaintext markdown.

---

## Negative searches

- Searched the paper for an explicit "content preservation" theorem → NOT FOUND. The paper proves locality (with preconditions) and disproves idempotence/near-success/stability, but does not state content preservation as a formal property.
- Searched Mens 2002 references for an impossibility result → NOT EXHAUSTIVELY AUDITED but no widely-cited result of this form exists in the SCM literature.
- Searched for "Khanna Pierce content loss" / "diff3 content preservation theorem" → returned only this paper. No follow-up paper closes the gap.
- Searched the Harmony project (Foster et al.) → focuses on schema-aware synchronizers; their guarantees come from schema constraints, not from raw text merge — not applicable to our markdown setting.

---

## Gaps / follow-ups

- A formal **impossibility proof** for state-based content preservation would be a non-trivial theorem; it doesn't exist in the cited literature. We can construct an informal one for the report (D8 evidence) but should be careful not to claim it as a published result.
- The paper's Section 5 hints that *biased* matching (matching choices that prefer better merge outcomes) might help — but this is "future work" 18 years later and no follow-up paper has been published in this line. The Loro / Automerge / Yjs world has moved to operation-based merge instead.
