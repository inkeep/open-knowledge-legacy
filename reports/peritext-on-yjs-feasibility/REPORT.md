---
title: "Peritext-on-Yjs Feasibility: Can the Peritext Rich Text Model Be Implemented on Y.Text with a ProseMirror Binding?"
description: "Deep source-code-level assessment of whether the Peritext rich text model (flat text + formatting annotations) can be implemented on top of Yjs's Y.Text type with a ProseMirror binding. Covers Y.Text formatting internals, block-level encoding, boundary semantics, void nodes, existing bindings, TipTap/Hocuspocus blast radius, and three implementation architectures with effort estimates."
createdAt: 2026-04-07
updatedAt: 2026-04-07
subjects:
  - Yjs
  - Peritext
  - ProseMirror
  - TipTap
  - Hocuspocus
  - Automerge
  - Loro
  - BlockSuite
  - AFFiNE
  - y-prosemirror
  - y-quill
topics:
  - Peritext CRDT rich text
  - Y.Text formatting internals
  - dual-view editor architecture
  - CRDT block-level structure
  - ProseMirror binding architecture
---

# Peritext-on-Yjs Feasibility: Can the Peritext Rich Text Model Be Implemented on Y.Text with a ProseMirror Binding?

**Purpose:** Determine whether the Peritext rich text model (flat text + formatting annotations) can be implemented on top of Yjs's Y.Text type, with a ProseMirror binding, enabling both WYSIWYG and raw markdown views on the same CRDT. The reader cares about: is this feasible, what are the specific technical barriers, and is the effort weeks or months?

---

## Executive Summary

The Peritext model on Yjs is feasible but splits into two distinct questions with different answers:

**Can you get the Peritext _behavior_ (dual WYSIWYG + source views on the same CRDT)? Yes, in weeks.** Yjs 14's refactored y-prosemirror operates through a generic delta protocol (toDeltaDeep() / applyDelta()) on a unified YType class -- the old hard boundary between Y.Text and Y.XmlFragment no longer exists at the type level. The entire sync stack (Hocuspocus, providers, cursors, undo) is type-agnostic. The blast radius for switching CRDT representations is limited to the editor binding layer alone.

**Can you get the Peritext _semantics_ (correct mark boundary expansion)? Not on Yjs today.** Yjs stores formatting as marker items (ContentFormat) in the CRDT sequence with no per-mark "expand before/after" flag. The Peritext paper explicitly identifies this as producing anomalous results during concurrent overlapping format operations. Neither Yjs 13 nor Yjs 14 implements Peritext's BoundaryPosition semantics. No peritext-yjs library exists. Kevin Jahns has not publicly committed to adding this.

**The practical verdict:** The boundary anomaly matters only for concurrent overlapping format operations (User A bolds chars 0-10 while User B bolds chars 5-15 simultaneously). For typical editing patterns -- including the AI agent co-editing use case where the agent writes to a different region -- the current Y.Text formatting works correctly. The dual-view architecture can be built in 2-4 weeks without full Peritext boundary semantics, and the product can ship while the edge cases remain a known limitation.

**Key Findings:**

- **Yjs 14 unified YType is the game-changer.** There is no longer a separate Y.Text class -- all types are YType<DeltaConf>. y-prosemirror operates through the generic delta interface. The type-system incompatibility that made the source-toggle problem intractable in Yjs 13 is architecturally resolved. **npm availability (verified 2026-04-07):** `yjs@14.0.0-16` (beta tag), `yjs@14.0.0-8` (next tag), `y-prosemirror@2.0.0-2` (pre-release). Stable latest remains `yjs@13.6.30`. **Ecosystem readiness caveat:** `@tiptap/y-tiptap` v3.0.2 and `@hocuspocus/server` v3.4.4 likely pin `yjs@^13` — peer dependency conflicts are expected when attempting to use v14 alongside the current TipTap/Hocuspocus stack. This is the primary practical barrier.
- **Three implementation architectures exist, ranging from 2 weeks to 10 weeks.** Architecture C (delta-protocol dual view) is 2-4 weeks and gives you dual-view behavior immediately. Architecture A (full Peritext with block markers) is 6-10 weeks and gives you the complete model.
- **Hocuspocus, providers, cursors, undo -- zero blast radius.** All sync infrastructure operates at the Y.Doc level, not the type level.
- **No one has built a Y.Text-to-ProseMirror binding.** The closest prior art is automerge-prosemirror (3,272 lines) which maps flat text + spans to ProseMirror's tree. y-quill (363 lines) maps Y.Text to Quill including block-level formatting via newline attributes.
- **BlockSuite/AFFiNE validates Y.Text for inline rich text in production.** Their @blocksuite/inline editor binds directly to Y.Text for inline formatting within blocks.

---

## Research Rubric

| # | Dimension | Depth | Priority |
|---|-----------|-------|----------|
| D1 | Y.Text formatting API as Peritext substrate | Deep | P0 |
| D2 | Block-level structure in Y.Text (y-quill prior art) | Deep | P0 |
| D3 | Existing Y.Text-to-ProseMirror bindings | Deep | P0 |
| D4 | Peritext reference implementation analysis | Deep | P0 |
| D5 | TipTap/Hocuspocus blast radius | Deep | P0 |
| D6 | Void node representation in Y.Text | Deep | P0 |
| D7 | Implementation effort estimate | Deep | P0 |

**Stance:** Factual with conclusions.
**Non-goals:** Implementing the binding, designing the ProseMirror schema, optimizing Hocuspocus performance, general TipTap architecture (covered by existing reports).

---

## Detailed Findings

### D1: Y.Text Formatting API as Peritext Substrate

**Finding: Y.Text formatting is structurally compatible with Peritext's mark model but lacks boundary semantics.**

**Evidence:** [evidence/ytext-formatting-api.md](evidence/ytext-formatting-api.md)

Yjs stores formatting as ContentFormat marker items in the CRDT sequence -- zero-length items with a key (e.g., "bold") and value (e.g., true or null). The format(index, length, attributes) method inserts markers before and after the target range. Two users bolding overlapping ranges produces correct results in the common case (non-concurrent or non-overlapping operations).

However, Yjs does not implement Peritext's per-mark boundary expansion semantics. In Peritext, each mark carries a flag specifying whether new text inserted at the boundary should inherit the mark (bold: yes at end, no at start; hyperlink: no at either end). Yjs's simpler model always inherits formatting from adjacent markers, which the Peritext paper explicitly identifies as producing anomalous results -- in extreme cases, causing the entire rest of the document to become bold after certain concurrent edit patterns.

Yjs 14 refactored all types to a unified YType<DeltaConf> class. The old hard distinction between Y.Text and Y.XmlFragment exists only in the delta configuration parameter, not as separate classes. This opens the door to a unified formatting model but does not itself add Peritext boundary semantics.

**Implications:**
- Y.Text formatting works correctly for all non-concurrent and most concurrent editing scenarios.
- The Peritext boundary anomaly is a known theoretical limitation, not a practical blocker for typical editing patterns.
- Adding ExpandMark semantics would require changes to Yjs's core CRDT (ContentFormat would need to encode boundary behavior). This is not on any public roadmap.

**Decision triggers:**
- If concurrent overlapping format operations are frequent, this anomaly becomes product-visible.
- If the product moves to Automerge or Loro, both have production Peritext implementations.

---

### D2: Block-Level Structure in Y.Text

**Finding: Block structure can be encoded in Y.Text via two proven approaches -- newline attributes (Quill model) or block markers (Automerge model).**

**Evidence:** [evidence/block-level-structure.md](evidence/block-level-structure.md)

**Quill/Delta approach (proven in production via y-quill):** Block formatting is encoded as attributes on the newline character that terminates each line. A heading is { insert: "Title\n", attributes: { header: 1 } }. This model is flat and simple but cannot represent arbitrary nesting.

**Automerge block marker approach (proven in production via automerge-prosemirror):** Block structure is encoded by inserting special marker objects into the text sequence. A marker { type: "ordered-list-item", parents: ["blockquote"], attrs: {} } establishes block structure with the parents array enabling unlimited nesting depth.

y-quill (363 lines) demonstrates the Quill approach in production. BlockSuite (AFFiNE) uses a hybrid: Y.Map tree for block hierarchy, Y.Text for inline content within each block.

**Implications:**
- For ProseMirror, the block marker approach is more suitable because ProseMirror natively supports arbitrary nesting.
- The binding layer must reconstruct ProseMirror's block tree from flat markers -- the same problem automerge-prosemirror's traversal.ts (1,016 lines) solves.

---

### D3: Existing Y.Text-to-ProseMirror Bindings

**Finding: No Y.Text-to-ProseMirror binding exists, but y-prosemirror v14's delta protocol makes the binding layer type-agnostic.**

**Evidence:** [evidence/existing-bindings.md](evidence/existing-bindings.md)

No library on npm, GitHub, or in academic literature binds ProseMirror to Y.Text. All existing ProseMirror bindings use Y.XmlFragment.

However, y-prosemirror v14 has been fundamentally refactored. The sync plugin now operates exclusively through toDeltaDeep(), applyDelta(), and observeDeep() -- all methods on the base YType class. The delta format supports named children, attributes, text content, and formatting.

The closest architectural reference is automerge-prosemirror (3,272 lines), which solves the exact problem of mapping flat text + spans + block markers to ProseMirror's nested node tree.

**Implications:**
- y-prosemirror v14 may already work with a non-XmlFragment YType. This needs empirical validation.
- If the delta protocol is truly type-agnostic, the effort drops to modifications rather than a rewrite.

---

### D4: Peritext Reference Implementation

**Finding: The Peritext reference implementation uses a custom CRDT (Micromerge), not Yjs. No peritext-yjs library exists.**

**Evidence:** [evidence/peritext-reference.md](evidence/peritext-reference.md)

The inkandswitch/peritext reference implementation is built on Micromerge -- a simplified, purpose-built CRDT. It includes a proof-of-concept ProseMirror bridge. Automerge 2.2 adopted Peritext with an ExpandMark enum. Loro also implements Peritext+Fugue. Neither is built on Yjs.

No one has ported Peritext boundary semantics to Yjs. Kevin Jahns has not publicly commented on adding this capability.

---

### D5: TipTap/Hocuspocus Blast Radius

**Finding: Zero blast radius to the sync stack. Only the editor binding layer is affected.**

**Evidence:** [evidence/tiptap-hocuspocus-blast-radius.md](evidence/tiptap-hocuspocus-blast-radius.md)

| Component | Impact | Changes needed |
|-----------|--------|----------------|
| Hocuspocus server | None | None -- syncs Y.Doc, not types |
| @hocuspocus/provider | None | Transport only |
| y-websocket protocol | None | Binary protocol on Y.Doc |
| y-prosemirror sync plugin | Low | Already uses generic YType delta |
| y-prosemirror cursor plugin | None | Uses RelativePosition (type-agnostic) |
| y-prosemirror undo | None | UndoManager accepts any YType |
| @tiptap/extension-collaboration | Low | One line: type creation |
| ProseMirror schema | Medium | Block-from-flat reconstruction |
| **Editor binding layer** | **High** | **Core of new work** |

---

### D6: Void Node Representation in Y.Text

**Finding: Y.Text supports embedded objects (ContentEmbed) for void nodes, with two mechanisms.**

**Evidence:** [evidence/void-nodes.md](evidence/void-nodes.md)

ContentEmbed stores an arbitrary JSON object occupying 1 position. ContentType (Y.XmlElement inside Y.Text) provides a full sub-CRDT for complex embeds. For JSX void nodes, ContentEmbed with JSON payload is sufficient.

---

### D7: Implementation Effort Estimate

**Finding: Three architectures exist -- 2-4 weeks (pragmatic), 2-4 weeks (hybrid), or 6-10 weeks (full Peritext).**

**Evidence:** [evidence/implementation-effort.md](evidence/implementation-effort.md)

#### Architecture A: Full Peritext Model (6-10 weeks)
Single flat Y.Text with formatting marks and block markers. ProseMirror tree reconstructed from spans. Estimated 2,000-3,300 lines. This is a rewrite of y-prosemirror. Reference: automerge-prosemirror is 3,272 lines.

Milestones: M1: Inline formatting (weeks 1-3) -> M2: Block structure (weeks 3-6) -> M3: Void nodes (weeks 6-7) -> M4: Tables (weeks 7-9) -> M5: Dual-view integration (weeks 9-10).

#### Architecture B: Hybrid (2-4 weeks)
Use Yjs 14's unified YType with recursive delta format. Block structure uses named child types, inline content uses formatting attributes. Estimated 400-900 lines of modifications.

#### Architecture C: Delta-Protocol Dual View (2-4 weeks)
Use y-prosemirror v14 as-is. Add serialization layer for source view. Estimated 500-1,000 lines. This is the serialize-on-toggle approach enabled by the delta protocol. Source view is non-collaborative.

---

## Recommendation

The three architectures form a progression, not a choice:

1. **Ship Architecture C now (2-4 weeks).** Dual-view toggle with non-collaborative source view. Same trade-off as Option I from the source-toggle report, but cleaner via the delta protocol.

2. **Spike Architecture B in parallel (1 week spike).** Test whether y-prosemirror v14 works with a flat YType. If yes, unlocks collaborative source editing with minimal code.

3. **Evaluate Architecture A only if boundary anomaly becomes product-visible.** Full Peritext semantics require modifying Yjs core. 6-10 week investment justified only by measured product pain.

**The answer: Peritext-style dual-view behavior on Yjs is feasible in weeks (2-4). Full Peritext boundary semantics are not feasible without modifying Yjs core -- but they are likely unnecessary for the product use case.**

---

## Limitations & Open Questions

### Not Fully Confirmed
- Whether y-prosemirror v14's delta protocol actually works when given a flat YType (no named children) -- requires empirical testing
- Whether Yjs 14's unified YType is stable enough for production (currently RC)
- Whether the boundary anomaly manifests in realistic editing patterns

### Out of Scope
- Designing the ProseMirror schema for the product
- MDX-specific round-trip fidelity (covered by mdx-crdt-roundtrip-fidelity report)
- Branch switching / context switching (covered by crdt-branching-namespacing-prior-art report)
- General TipTap/Hocuspocus architecture (covered by source-toggle-architecture report)

---

## References

### Evidence Files
- [evidence/ytext-formatting-api.md](evidence/ytext-formatting-api.md) -- Y.Text formatting internals, ContentFormat, boundary semantics
- [evidence/block-level-structure.md](evidence/block-level-structure.md) -- Quill Delta model, Automerge block markers, BlockSuite
- [evidence/existing-bindings.md](evidence/existing-bindings.md) -- y-prosemirror v14 delta protocol, automerge-prosemirror reference
- [evidence/peritext-reference.md](evidence/peritext-reference.md) -- Micromerge implementation, BoundaryPosition, ExpandMark
- [evidence/tiptap-hocuspocus-blast-radius.md](evidence/tiptap-hocuspocus-blast-radius.md) -- Component-by-component blast radius
- [evidence/void-nodes.md](evidence/void-nodes.md) -- ContentEmbed, ContentType, void nodes
- [evidence/implementation-effort.md](evidence/implementation-effort.md) -- Three architecture estimates

### External Sources
- [Peritext: A CRDT for Rich-Text Collaboration](https://www.inkandswitch.com/peritext/)
- [Automerge 2.2: Rich Text](https://automerge.org/blog/rich-text/)
- [Automerge Rich Text Schema](https://automerge.org/docs/reference/under-the-hood/rich-text-schema/)
- [Loro CRDT-richtext](https://loro.dev/blog/crdt-richtext)
- [Yjs GitHub (v14 RC)](https://github.com/yjs/yjs)
- [y-prosemirror GitHub](https://github.com/yjs/y-prosemirror)
- [y-quill GitHub](https://github.com/yjs/y-quill)
- [automerge-prosemirror GitHub](https://github.com/automerge/automerge-prosemirror)
- [inkandswitch/peritext GitHub](https://github.com/inkandswitch/peritext)
- [BlockSuite Document-Centric Architecture](https://block-suite.com/blog/document-centric.html)
- [Yjs Issue #291](https://github.com/yjs/yjs/issues/291)

### Related Research
- source-toggle-architecture -- 9 architectures for WYSIWYG/source toggle
- mdx-crdt-roundtrip-fidelity -- MDX round-trip through CRDT editors
- crdt-branching-namespacing-prior-art -- CRDT branching and document switching
- source-of-truth-persistence-collaboration -- collaboration architecture deep dive
