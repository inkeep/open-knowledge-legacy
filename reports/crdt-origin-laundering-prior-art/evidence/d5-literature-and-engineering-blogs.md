# Evidence: Literature + engineering blogs on origin preservation in CRDTs

**Dimension:** D5 — Academic/blog literature on "undo in the presence of sync bridges" or "origin preservation during CRDT reconciliation"
**D6:** Named-pattern check — are our proposed patterns documented elsewhere?
**Date:** 2026-04-13

---

## Findings

### Finding 1: Peritext addresses intent preservation for formatting, not attribution
**Confidence:** CONFIRMED

Peritext focuses on intent preservation for formatting spans, NOT author attribution. Key properties:
- Formatting spans anchored to stable per-character identifiers
- Per-mark `expand` flags (`before`/`after`/`both`/`none`) to preserve concurrent format op intent at span boundaries

**Peritext does NOT address:**
- Author attribution of individual characters at the CRDT layer (characters carry opIDs at the Automerge/Micromerge level, not a Peritext contribution)
- Undo semantics in the presence of sync — explicitly out of scope in the paper
- "Skip unnecessary mutations" patterns — Peritext is about merging concurrent format ops, not avoiding them in the first place

Existing internal report `reports/peritext-on-yjs-feasibility/REPORT.md` confirms: Peritext's applicability to Yjs is about the merge algorithm, not provenance handling.

**Applicability to our fix: LOW.**

### Finding 2: Academic CRDT-undo work stores actor ON THE CHARACTER (Automerge model)
**Confidence:** CONFIRMED

- **Yi/Imine/Ignat, "A CRDT Supporting Selective Undo for Collaborative Text Editing"** (Springer 2015). Extends RGA with a per-character undo counter; each user undoes their own ops selectively.
- **"An optimized RGA supporting selective undo for collaborative text editing systems"** (ScienceDirect follow-up).

**Irony:** The academic per-user-undo literature stores the actor on the character itself — this is the **Automerge model, not the Yjs model**. Yjs's origin-on-transaction is a weaker primitive that academic work bypasses. This is the structural reason our problem exists: we inherited the weaker primitive.

### Finding 3: Figma sidesteps origin-laundering via client-local undo buffers
**Confidence:** CONFIRMED

[Figma blog](https://www.figma.com/blog/how-figmas-multiplayer-technology-works/):
- Last-writer-wins with **client-local undo buffers**
- Deleted properties stored in the deleting client's undo buffer — NOT on the server
- Core undo principle: "if you undo a lot, copy something, and redo back to the present, the document should not change"

They sidestep origin-laundering entirely by making undo a pure client-side restore-from-buffer operation, not a CRDT-layer inverse op.

### Finding 4: Linear, Contentsquare, Notion
**Confidence:** CONFIRMED

- **Linear:** SyncAction model, not CRDT-based. Undo is action-inverse replay, server-mediated.
- **Contentsquare engineering blog** ("Rewriting History: Adding Undo/Redo"): generic patterns, not CRDT-specific.
- **Notion:** No authoritative public write-up on undo architecture.

### Finding 5: Yjs community has documented related bugs, no general fix
**Confidence:** CONFIRMED

- [Yjs #273](https://github.com/yjs/yjs/issues/273) — y-codemirror + y-websocket concurrent-peer undo blurs origin boundaries. Workaround: `captureTimeout: 0`.
- [Yjs #736](https://github.com/yjs/yjs/issues/736) — wrong states on undo.
- [TipTap #4978](https://github.com/ueberdosis/tiptap/discussions/4978) — collab + local history double-history bugs.
- [Yjs discussion 454](https://discuss.yjs.dev/t/undomanager-with-external-updates/454) — `trackedOrigins` is THE primitive; does not address sync-bridge-hop origin loss.

### Finding 6: Named-pattern audit — three candidates, all undocumented
**Confidence:** HIGH — audit exhaustive for surveyed sources

| Pattern | Documented? | Closest prior art |
|---|---|---|
| "Content-comparison gate before delete+insert" in CRDT bridges | **NO — not named anywhere found.** Yjs INTERNALS discusses diffing state vectors for *transport*, not a *write-side gate*. Automerge-prosemirror's `prosemirror-changeset` reconciliation (`syncPlugin.ts:89-105`) is a structural analog but applied between two representations of the same local write. | automerge-prosemirror syncPlugin reconciliation step |
| "Character-level diff preserves more Items than line-level" | **NO — not documented as a CRDT pattern.** Yjs INTERNALS notes single-char left-to-right inserts merge into one Item, which implies diff granularity affects Item preservation — but the specific claim is not named. | Inferred from Yjs INTERNALS |
| "Origin-aware reconciliation" in sync bridges | **NO — not documented as a named pattern.** Closest: Yjs `trackedOrigins` (ingress filter, not bridge primitive); automerge-prosemirror #19's `addToHistory: false` meta (one-bit workaround). | automerge-prosemirror#19 |

### Finding 7: Novelty implication
**Confidence:** MEDIUM — depends on completeness of survey

All three patterns appear **unclaimed** in both academic and engineering literature as of April 2026. If Open Knowledge ships them as named primitives (e.g., `safetyCheckpoint` + content-comparison gate + char-diff bridge), there is a defensible novelty claim.

Strongest adjacent prior art:
- Academic: Yi et al. 2015 selective-undo CRDTs
- Engineering: automerge-prosemirror's change-set reconciliation

Neither NAMES or isolates these specific patterns.

---

## Sources

- [Peritext — Ink & Switch](https://www.inkandswitch.com/peritext/)
- [Peritext CSCW paper PDF](https://www.inkandswitch.com/peritext/static/cscw-publication.pdf)
- [Yi et al., A CRDT Supporting Selective Undo for Collaborative Text Editing](https://members.loria.fr/CIgnat/files/pdf/YuDAIS15.pdf)
- [Y.UndoManager docs](https://docs.yjs.dev/api/undo-manager)
- [Yjs INTERNALS.md](https://github.com/yjs/yjs/blob/main/INTERNALS.md)
- [Yjs issue #273](https://github.com/yjs/yjs/issues/273)
- [Yjs issue #736](https://github.com/yjs/yjs/issues/736)
- [Yjs discussion 454](https://discuss.yjs.dev/t/undomanager-with-external-updates/454)
- [TipTap discussion #4978](https://github.com/ueberdosis/tiptap/discussions/4978)
- [Figma — multiplayer tech](https://www.figma.com/blog/how-figmas-multiplayer-technology-works/)
- [Figma — making multiplayer more reliable](https://www.figma.com/blog/making-multiplayer-more-reliable/)
- [Linear sync reverse-engineering](https://marknotfound.com/posts/reverse-engineering-linears-sync-magic/)
- [Contentsquare — Rewriting History](https://engineering.contentsquare.com/2023/history-undo-redo/)
- Internal: `reports/peritext-on-yjs-feasibility/REPORT.md`
