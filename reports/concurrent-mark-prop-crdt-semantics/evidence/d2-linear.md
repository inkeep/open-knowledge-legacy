# Evidence: D2 — Linear Sync Engine, mark composition, issue-field merging

**Dimension:** D2
**Date:** 2026-04-17
**Sources:** Reverse-engineered Linear sync engine docs (endorsed by Linear CTO), Tuomas Artman talks, marknotfound.com reverse-engineering writeup

---

## Key pages referenced

- https://github.com/wzhudev/reverse-linear-sync-engine — reverse-engineered source docs, explicitly endorsed by Tuomas Artman (Linear CTO)
- https://linear.app/now/scaling-the-linear-sync-engine — Linear's own overview
- https://marknotfound.com/posts/reverse-engineering-linears-sync-magic/ — additional 3P reverse-engineering writeup
- https://www.localfirst.fm/15 — Tuomas Artman interview on localfirst.fm

---

## Findings

### Finding: Linear is OT-based, NOT CRDT-based, for structured data

**Confidence:** CONFIRMED
**Evidence:** wzhudev reverse-engineered docs:

> "Linear's collaboration model aligns more closely with OT, as it relies on a centralized server to establish the order of all transactions."

> "unlike most mainstream local-first applications that use CRDTs, Linear's collaboration model aligns more closely with OT."

### Finding: Non-text fields (title, status, assignee) use last-writer-wins with centralized total order via sync IDs

**Confidence:** CONFIRMED
**Evidence:** wzhudev reverse-engineered docs; Tuomas Artman interview:

"conflicts are actually not that common in Linear, which makes sense when you think about it - for certain systems, conflict resolution isn't an urgent issue."

Non-text fields resolve LWW. Linear's sync engine uses an object graph similar to typical modern applications with a normalized data store, leveraging MobX for in-memory layer and an event-driven system.

### Finding: Issue descriptions use CRDT (added later) — but Linear won't describe the mark-composition semantics publicly

**Confidence:** CONFIRMED (that CRDT is used for descriptions); UNCERTAIN (on exact mark-merge semantics)
**Evidence:**

Artman (quoted indirectly in multiple 3P sources): "Linear didn't use CRDTs until recently, and even now, it only uses them for issue descriptions."

The reverse-engineered docs stop short of the rich text description internals because those are not visible through browser inspection. Comments in Linear carry `bodyData` in a ProseMirror-like JSON shape (`{"type":"doc","content":[{"type":"paragraph"...}]}`), strongly suggesting ProseMirror-tree serialization, NOT character-level markdown.

### Finding: Linear's description editor is ProseMirror-tree-shaped; no char-RGA-on-markdown evidence

**Confidence:** INFERRED
**Evidence:** marknotfound.com writeup quotes comment bodyData in ProseMirror JSON shape. Most TipTap/ProseMirror + Yjs deployments use Y.XmlFragment (tree), not Y.Text.

---

## Implications

- Linear is a prominent shipping example of: **text CRDT for descriptions + LWW for structured fields**.
- Char-level resolution of marks is NOT what Linear ships for structured fields.
- For descriptions, they use a CRDT (most likely Yjs with Y.XmlFragment via y-prosemirror, given the ProseMirror JSON shape of comment bodies) — but the EXACT mark-composition semantics are not publicly described.

---

## Gaps / follow-ups

- Linear description editor exact CRDT type (Y.XmlFragment vs Y.Text) not publicly confirmed.
- No public statement on how Linear handles concurrent bold-toggle on overlapping span.
