# Evidence: Yjs Ecosystem Trajectory for Dual Representations

**Dimension:** D6 — Yjs roadmap, community direction, alternative CRDTs
**Date:** 2026-04-07
**Sources:** discuss.yjs.dev, Ink & Switch, Automerge blog, Loro blog, arxiv

---

## Key sources referenced
- Yjs Y.Text vs Y.XmlFragment: https://discuss.yjs.dev/t/structure-design-y-text-vs-y-xmlfragment/1662
- Peritext (Ink & Switch, Nov 2022): https://www.inkandswitch.com/peritext/
- Automerge 2.2 Rich Text: https://automerge.org/blog/2024/04/06/richtext/
- Loro Rich Text: https://loro.dev/blog/loro-richtext
- CRDT Representation Independence: https://arxiv.org/abs/2504.05398
- Yjs vs Loro discussion: https://discuss.yjs.dev/t/yjs-vs-loro-new-crdt-lib/2567
- Upwelling (Ink & Switch): https://www.inkandswitch.com/upwelling/

---

## Findings

### Finding: The industry is converging on "flat text + annotation metadata" (Peritext model) for dual views
**Confidence:** INFERRED
**Evidence:** Peritext (Ink & Switch), Automerge 2.2, Loro all adopt flat text with formatting annotations

Peritext formalized the model: formatting annotations stored outside the text, attached to characters via unique IDs. Automerge productionized it — rich text is a view layer over a flat text sequence. Loro adopted the same architecture. This model naturally supports both plain-text and rich-text views of the same CRDT.

**Implications:** This is the "ideal" architecture for dual-view editors. But it requires choosing flat text as canonical from the start. Yjs's Y.XmlFragment stores structure IN the CRDT, making it incompatible with this model. There is no migration path from Y.XmlFragment to Peritext-model without rebuilding the data layer.

### Finding: Kevin Jahns has NOT commented on the source toggle problem
**Confidence:** CONFIRMED (NOT FOUND)
**Evidence:** Searched blog.kevinjahns.de, discuss.yjs.dev, discuss.prosemirror.net, GitHub activity

No blog post, talk, forum post, or GitHub comment by dmonad directly addresses dual editor bindings, ProseMirror + CodeMirror on the same CRDT, or the source toggle problem.

### Finding: No Yjs RFC or roadmap item for computed/derived types
**Confidence:** CONFIRMED (NOT FOUND)
**Evidence:** Searched yjs/yjs issues, discussions, wiki

Y.Text vs Y.XmlFragment discussion (Jan 2023) frames these as a one-time architectural choice. No proposal for runtime conversion, computed types, or bridge mechanisms.

### Finding: Loro's fork/merge operates on the SAME data type — no dual representation
**Confidence:** CONFIRMED
**Evidence:** Loro docs, Yjs vs Loro discussion (Nov 2025)

Loro's fork/import are for branching/merging the same document, not for maintaining dual views of different types. No mention of dual representations as a differentiator.

### Finding: "Wait for Yjs" is NOT a viable option
**Confidence:** INFERRED
**Evidence:** Absence of any roadmap signal + Automerge/Loro going a different architectural direction

The Yjs ecosystem shows no trajectory toward solving this problem. The broader CRDT community is solving it via a different canonical representation (flat text + annotations). For Yjs users who chose Y.XmlFragment, serialize-on-toggle is the foreseeable approach.

---

## Gaps / follow-ups
- Monitor Yjs v14+ for any YType refactoring that might enable cross-type observation
- Monitor TipTap's @tiptap/y-tiptap for any dual-binding work
- Automerge's ProseMirror binding is worth deeper investigation if we ever consider switching CRDT libraries
