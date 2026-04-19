# Evidence: D7 — Production Systems Three-Way Text Merge

**Dimension:** How git, Mercurial, Darcs, Pijul, ShareJS handle three-way text merge and content loss.
**Date:** 2026-04-16
**Sources:** Pijul/Darcs documentation, Git documentation, Coglan blog post on diff3, GNU diffutils.

---

## Key sources referenced

- [Pijul "Why Pijul"](https://pijul.org/manual/why_pijul.html)
- [Pijul Model](https://pijul.org/model/)
- [Understanding Darcs/Patch theory (Wikibooks)](https://en.wikibooks.org/wiki/Understanding_Darcs/Patch_theory)
- [Git merge documentation](https://git-scm.com/docs/git-merge)
- [Merging with diff3 — James Coglan](https://blog.jcoglan.com/2017/05/08/merging-with-diff3/)
- [git-merge-file documentation](https://git-scm.com/docs/git-merge-file)

---

## Findings

### Finding F7.1: Git's diff3 merge does NOT silently drop content

**Confidence:** CONFIRMED
**Evidence:** [Coglan blog post](https://blog.jcoglan.com/2017/05/08/merging-with-diff3/):

> For chunks where both Alice and Bob differ from the original, we have a conflict; the merge algorithm, having no understanding of the meaning of the text, cannot decide how to resolve this and the conflict is emitted for the user to resolve by hand.

Git's three outcomes:
1. **Stable region** → preserved verbatim from base.
2. **One-sided change** → changed version is taken automatically.
3. **Both-sided change** → conflict markers emitted; **no auto-resolution**, no content loss; user must resolve.

**Implication:** Git's choice is to **fail loudly** (emit conflict markers) rather than silently merge. Content from both sides is preserved in the conflict markers — the user's resolution may lose content, but git itself doesn't.

This is the same "loudness" property as node-diff3's `excludeFalseConflicts: false` mode (D1 finding F1.6) — emit conflict markers, let the user/caller decide. Content is preserved in the marker form.

### Finding F7.2: Git acknowledges merge sensitivity to diff algorithm choice

**Confidence:** CONFIRMED
**Evidence:** Coglan blog + Git's `diff.algorithm` documentation:

> While the diff3 algorithm is relatively simple, it is highly sensitive to the output of the underlying diff algorithm...they can lead to changes in the conflicts you get, in some cases leading to conflicts that are deeply misleading and surprising to the user.

Git supports `myers` (default), `minimal`, `patience`, `histogram` diff algorithms. Different algorithms produce different LCS choices, leading to different conflict regions. The Khanna-Kunal-Pierce 2007 paper (D3 evidence) formally explains this — diff3 is not stable under input perturbation (F3.6).

**Implication:** Git's content preservation is not algorithm-loss but algorithm-*choice* sensitive. Switching `diff.algorithm` can change which lines get classified as conflicts vs auto-merged. This matches our bridge's experience: different LCS choices produce different conflict regions, and the resolver's behavior on each region determines whether content is lost.

### Finding F7.3: Pijul claims line-order preservation that git does NOT guarantee

**Confidence:** CONFIRMED
**Evidence:** [Pijul Why Pijul](https://pijul.org/manual/why_pijul.html):

> Git, SVN, and Mercurial will merge this example… into the file shown on the left, with the relative positions of G and X swapped, whereas Pijul (and Darcs) yield the file on the right, preserving the order between the lines.

Pijul provides a concrete counter-example where Alice adds line G + duplicates lines A,B above original content, while Bob inserts line X between original A and B. Git's three-way merge produces a result with *swapped line order*; Pijul preserves both edits in their intended order.

**Implication:** Git's three-way merge can produce **structurally incorrect** merges — content isn't lost (lines G, X are both present) but their order is wrong. This is a content-*ordering* failure, not a content-*loss* failure. Per the Khanna-Kunal-Pierce paper (D3 finding F3.4 — diff3 is not idempotent) and (F3.6 — diff3 is not stable), this is expected behavior of state-based merge.

For our bridge: even if we satisfy a character-multiset content invariant, *ordering* can still go wrong. The post-condition design (D8) needs to consider whether ordering is part of "content preservation" or a separate property.

### Finding F7.4: Pijul's patch theory guarantees content preservation by construction

**Confidence:** CONFIRMED
**Evidence:** [Pijul page](https://pijul.org/manual/why_pijul.html):

> Pijul guarantees a number of strong properties on merges, with the most important one being that the order between lines is always preserved. This is unlike 3-way merge, which may sometimes shuffle lines around.

> edits from both sides of a conflict get applied without resolving the conflict. This guarantees no information ever gets lost.

**Implication:** Pijul's patch theory model treats each edit as a categorical morphism. Merging is a *pushout* in the category of files-and-patches. Content preservation is a structural property of the pushout — both sides' patches are applied in a way that yields a unique result. Conflicts are *flagged*, not *resolved* — both edits remain in the document.

This is structurally similar to CRDTs: both sides' operations survive; conflict resolution is a separate UI concern, not a merge-time concern. For the bridge: Pijul's pushout model is theoretically appealing but requires a fundamentally different data model (patches, not snapshots) that Yjs/our-bridge doesn't have.

### Finding F7.5: Darcs patch theory — primitive operations and inverses

**Confidence:** CONFIRMED
**Evidence:** [Darcs Patch Theory wikibook](https://en.wikibooks.org/wiki/Understanding_Darcs/Patch_theory):

Darcs patch theory has two primitive operations: **commutation** and **inversion**. Every patch must have an inverse (P · P⁻¹ = identity). Two patches A, B can be commuted iff there exist B', A' such that A · B = B' · A' and they start/end in the same context.

**Implication:** Darcs's content preservation comes from the algebraic property that patches compose deterministically. When two patches conflict (cannot be commuted), Darcs flags the conflict but preserves both. Like Pijul, this is structural content preservation — the algorithm does not need to "decide" what to keep.

The wikibook explicitly notes: conflicts are not the focus of basic patch theory; the focus is on ensuring non-conflicting merges always work. Darcs/Pijul handle conflicts by *preservation + flagging*, not auto-resolution.

### Finding F7.6: Git's `git merge-file` is a textual merge driver — also conservative

**Confidence:** CONFIRMED
**Evidence:** [git-merge-file docs](https://git-scm.com/docs/git-merge-file):

`git merge-file` is the low-level RCS-style three-way merge driver. It has options `--ours`, `--theirs`, `--union`:
- Default: emit conflict markers for true conflicts.
- `--ours` / `--theirs`: take one side without conflict marker (content from the other side is dropped).
- `--union`: include both sides' content concatenated, no markers (lossy in *order* but preserving in *content*).

**Implication:** Git provides *user-selectable* trade-offs. Default is conservative (preserve via markers). `--ours` / `--theirs` is the typical "agent automatic merge" pattern — and it explicitly drops content. `--union` preserves content but mangles order.

For the bridge: our DMP-based `mergeConflictRegion` is morally a custom union-style resolver. The fuzz oracle checks for marker preservation (substrings) — which corresponds to a `--union`-style invariant. Git's standard library offers no "smart preserve both sides cleanly" option — because state-based merge cannot do it (D3).

### Finding F7.7: Mercurial uses similar three-way merge — same content-preservation properties

**Confidence:** INFERRED (not exhaustively audited; see Pijul's claim)
**Evidence:** Pijul's Why-Pijul cites Mercurial alongside Git for the same line-reordering pathology.

Mercurial's `internal:merge3` and `kdiff3` drivers are equivalent to Git's diff3. Same conflict markers, same algorithm sensitivity, same "preserve via markers, may shuffle lines" behavior.

### Finding F7.8: ShareJS / OT-based collab editors don't use three-way merge

**Confidence:** CONFIRMED
**Evidence:** D6 evidence + ShareJS architecture docs.

ShareJS uses OT — operations are applied in linear order with transforms. There's no "base / mine / theirs" snapshot triple. Content is preserved at the operation level (every insert survives). This is structurally different from git's three-way merge and is not directly comparable as a "production system that does three-way merge."

**Implication:** The set of "production systems doing three-way text merge" is narrower than expected: it's git/Mercurial/SVN (state-based, conservative-with-markers, line-shuffle pathology), Darcs/Pijul (patch theory, structural preservation, line-order guarantee), and CRDT systems (op-based, structural preservation, byte-level convergence).

### Finding F7.9: GNU diff3 (the original) — content preservation classification

**Confidence:** CONFIRMED
**Evidence:** GNU diffutils manual cited by Khanna et al. (D3 reference [11]):

GNU diff3 produces hunks classified as "matching all three," "matching A," "matching B," "matching neither" (the conflicting hunk). Output options:
- `-m` / `--merge`: emit merged file with conflict markers.
- `-A`: similar with marker for ancestor.
- `-e`: ed script for "easy" changes only (changes from O to A and O to B that don't overlap).

Like git, GNU diff3 is conservative — emits markers for conflicts, never auto-resolves with content loss. The pathologies (line-shuffle, etc.) come from the same diff3 algorithm class.

### Finding F7.10: Summary table — content preservation properties

**Confidence:** CONFIRMED
**Evidence:** Synthesis of F7.1-F7.9.

| System | Algorithm class | Content-loss mode | Order-preservation | Failure mode |
|---|---|---|---|---|
| GNU diff3 / git default | State-based three-way | None (markers) | Not guaranteed (Pijul example) | Wide conflict markers |
| `git merge-file --ours` | State-based + auto-pick | DROPS theirs | Whichever side's | Content loss by design |
| `git merge-file --union` | State-based + concat | None | Order may be wrong | Mangled order |
| Mercurial | State-based three-way | None (markers) | Not guaranteed | Same as git |
| Darcs / Pijul | Patch theory pushout | None | Guaranteed | More conflicts surfaced |
| OT (Wave / ShareJS) | Op-based stream | None | Op-stream order | Requires central server |
| CRDT (Yjs / Automerge) | Op-based RGA + total order | None | Tiebreak by opId | Type-boundary (our problem) |

---

## Negative searches

- Searched for production three-way text merge that auto-resolves AND preserves content from both sides → NOT FOUND. Every "smart" merge (Darcs, Pijul, CRDT) achieves this by abandoning state-based snapshot reconciliation in favor of operation-tracked patches. No state-based system promises both auto-merge and content preservation under arbitrary interleavings.
- Searched for git "experimental" three-way merge that handles concurrent insert better → NOT FOUND. `git merge-tree`, `merge.zealousAlnum`, `merge.recursive` etc. address adjacent concerns but do not change the underlying conflict-emission contract.

---

## Gaps / follow-ups

- A specific git source-code dive (`merge.c` / `xdiff/xmerge.c`) was not undertaken — but the production behavior is well-documented (F7.1-F7.6) and the key claim (no silent content loss; markers for conflicts) is consistent across sources.
- Pijul's pushout-based merge mathematically converges content; it might be a useful reference for designing the bridge's invariant assertion. Not in our toolkit, but the model is well-publicized.
