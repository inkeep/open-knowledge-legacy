# Evidence: D7 — y-quill and Quill Delta mark merging

**Dimension:** D7
**Date:** 2026-04-17
**Sources:** y-quill source code, Quill Delta spec, quilljs.com docs

---

## Key pages referenced

- https://github.com/yjs/y-quill — y-quill binding
- https://github.com/yjs/y-quill/blob/main/src/y-quill.js — source code
- https://quilljs.com/docs/delta/ — Delta format reference
- https://quilljs.com/docs/guides/designing-the-delta-format — design rationale

---

## Findings

### Finding: y-quill binds Quill to Y.Text and applies Delta ops through Y.Text's applyDelta path

**Confidence:** CONFIRMED
**Evidence:** y-quill.js source: binding translates Quill Delta operations to `type.applyDelta(changes.ops)` inside a `doc.transact()`.

### Finding: Quill Delta represents marks as attributes on insert/retain ops — NOT as serialized markdown characters

**Confidence:** CONFIRMED
**Evidence:** https://quilljs.com/docs/delta/

Example from docs: `{ ops: [{ insert: "Gandalf", attributes: { bold: true } }, { insert: " the " }, { insert: "Grey", attributes: { color: "#cccccc" } }] }`.

Bold is an attribute-map on a span-typed op, not two `**` character inserts. The wire format is structured.

### Finding: Delta attribute merging is shallow-merge on the attribute map

**Confidence:** CONFIRMED
**Evidence:** https://quilljs.com/docs/guides/designing-the-delta-format

> "This merge is shallow to keep things simple. We have not found a use case that is compelling enough to require a deep merge and warrants the added complexity."

### Finding: Delta implements OT — compose, transform, invert — NOT a CRDT on its own

**Confidence:** CONFIRMED
**Evidence:** https://github.com/slab/delta:

> "Delta is suitable for Operational Transform and can be used in realtime, Google Docs like applications. Delta implements the OT algorithm including compose, transform and invert."

### Finding: y-quill's concurrent-merge semantics ride on Y.Text's ContentFormat markers — not on Delta's own OT transform

**Confidence:** CONFIRMED
**Evidence:** y-quill uses Y.Text's applyDelta which converts Delta ops into Y.Text insert/delete/format calls. Y.Text inserts ContentFormat markers. The final CRDT resolution is done by Yjs's marker-item algorithm, not Delta's OT.

`_negatedUsedFormats` in y-quill is used to prevent attribute inheritance assumptions during concurrent edits.

### Finding: y-quill performs "expected vs actual" delta diff reconciliation for concurrency drift

**Confidence:** CONFIRMED
**Evidence:** y-quill.js: if the applied delta differs from the expected delta, the code performs a diff and reapplies. This is a repair-loop for cases where the CRDT merge produced a different result than the local Quill expected.

---

## Implications

- Quill + y-quill is another point on the "structured marks on a text CRDT with marker items" design — not char-RGA on serialized source chars.
- Marks are attribute-maps on typed inserts/retains.
- Concurrent overlapping bold operations: resolved by Y.Text ContentFormat semantics (same as y-prosemirror's marks within text nodes).
- The reconciliation repair-loop in y-quill tacitly acknowledges that Y.Text's concurrent-format resolution sometimes produces unexpected results, which the binding needs to normalize.

---

## Gaps / follow-ups

- No Quill or y-quill issue tracker search performed for concrete user-reported concurrent-bold defects (could be a gap).
- Relationship between Quill Delta's OT transform and Y.Text's internal merge is complicated: Delta's OT algebra is NOT used for the cross-peer CRDT merge; it's used for Quill's own compose/invert history.
