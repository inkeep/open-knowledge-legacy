# Evidence: Yjs Shared Type Internals

**Dimension:** D1 — Yjs shared type system internals
**Date:** 2026-04-07
**Sources:** yjs/yjs (source code), yjs/y-prosemirror (source code), discuss.yjs.dev

---

## Key files referenced
- `yjs/src/ytype.js` — unified YType class (refactored from separate classes)
- `yjs/src/UndoManager.js` — undo tracking with typeScope and trackedOrigins
- `yjs/src/structs/ContentDoc.js` — subdocument support
- `y-prosemirror/src/sync-utils.js` — pmToFragment, fragmentToTr, trToDelta
- `y-prosemirror/src/sync-plugin.js` — updateYFragment (diff-based, line 1145-1298)
- `y-prosemirror/src/commands.js` — configureYProsemirror (runtime Y.Type switching, line 38-66)

---

## Findings

### Finding: Yjs has been refactored to a unified YType
**Confidence:** CONFIRMED
**Evidence:** yjs/src/ytype.js

There is no longer a separate YXmlFragment, YText, YMap hierarchy. There is a single `YType` class parameterized by a `DeltaConf`. The old class names are wrappers/aliases. `observeDeep` (line 753) fires YEvents with `getDelta(am, {deep})` returning structured deltas.

**Implications:** The type system is more flexible internally than the API suggests, but the delta configurations for text vs XML are still fundamentally different structures.

### Finding: Dual keys in same Y.Doc are fully supported
**Confidence:** CONFIRMED
**Evidence:** Doc.js line 204, `Doc.get(key, name)` stores types in `this.share` (a Map)

You can have `doc.get('prosemirror')` (tree type) and `doc.get('source')` (text type) as completely independent CRDT structures sharing the same Y.Doc, sync infrastructure, and update stream.

**Implications:** Options B (dual keys + observer sync) and D (server-side mirror) are architecturally possible at the Yjs level. The blocking issue is the conversion layer, not the CRDT infrastructure.

### Finding: No computed/derived type mechanism exists
**Confidence:** CONFIRMED (NOT FOUND)
**Evidence:** Searched yjs/yjs issues, discussions, Kevin Jahns' blog, discuss.yjs.dev

No RFC, no roadmap item, no discussion about computed types, derived shared types, or automatic conversion between type configurations.

### Finding: UndoManager cannot cleanly span type conversions
**Confidence:** CONFIRMED
**Evidence:** UndoManager.js lines 137, 162-164

UndoManager takes a `typeScope` and tracks via `trackedOrigins`. If writing to type A triggers a sync to type B, the write to B has a different transaction. `addToScope` can cover both types, but "redo" of a markdown edit converted to a tree edit would redo the tree edit, not the original markdown edit.

### Finding: y-prosemirror has runtime Y.Type switching via configureYProsemirror
**Confidence:** CONFIRMED
**Evidence:** y-prosemirror/src/commands.js line 38-66

The `configureYProsemirror` command supports pausing sync and switching the bound Y.Type at runtime. This is designed for document switching but could serve toggle-with-lock patterns.

### Finding: updateYFragment is diff-based, not wholesale replace
**Confidence:** CONFIRMED
**Evidence:** y-prosemirror/src/sync-plugin.js lines 1145-1298

Matches children from left and right until mismatch, then computes equality factors for the unmatched middle. Only changed paragraphs generate Yjs operations. Preserves collaboration state.

**Implications:** Toggle-back from source view can use this function to apply only the diff, not destroy the entire CRDT state. Critical for preserving other clients' cursors and undo history.

### Finding: prosemirrorJSONToYDoc creates a NEW Y.Doc — destructive for collaboration
**Confidence:** CONFIRMED
**Evidence:** y-prosemirror/src/lib.js lines 299-302, JSDoc warning

The function creates a brand-new Y.Doc. Its own docs warn: "should not be used to rehydrate a Y.Doc from a database once collaboration has begun as all history will be lost." The correct path for toggle-back is: parse markdown → PM Node → call updateYFragment on the existing Y.XmlFragment.

---

## Negative searches
- Searched for "computed type" in yjs repo → NOT FOUND
- Searched for "derived" shared type → NOT FOUND
- Searched for dual binding / dual editor in y-prosemirror → NOT FOUND
- Searched for Y.XmlFragment to Y.Text conversion → NOT FOUND
