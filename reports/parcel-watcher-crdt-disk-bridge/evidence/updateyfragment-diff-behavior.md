# Evidence: updateYFragment Diff Behavior and Minimal Edit Preservation

**Dimension:** updateYFragment diff behavior for minimal external edits, v1 vs v2 approach
**Date:** 2026-04-07
**Sources:** y-prosemirror v2.0.0-2 source (sync-plugin.js, sync-utils.js), @tiptap/y-tiptap (updateYFragment wrapper), prior report evidence

---

## Key files referenced

- `y-prosemirror/src/sync-plugin.js` (v2) -- delta-based sync, no updateYFragment export
- `y-prosemirror/src/sync-utils.js` (v2) -- nodeToDelta, deltaToPSteps
- `open-knowledge/init_spike/src/server/persistence.ts:16` -- imports updateYFragment from @tiptap/y-tiptap
- Prior report: `crdt-mcp-filesystem-bridge/evidence/updateyfragment-concurrent-mutations.md`

---

## Findings

### Finding: The project uses updateYFragment from @tiptap/y-tiptap, which is the v1 algorithm (not y-prosemirror v2)
**Confidence:** CONFIRMED
**Evidence:** persistence.ts:16

```typescript
import { updateYFragment, yXmlFragmentToProsemirrorJSON } from '@tiptap/y-tiptap';
```

The locally cloned y-prosemirror is v2.0.0-2 (`@y/prosemirror`), which has replaced updateYFragment entirely with a delta-based approach. But the project imports from `@tiptap/y-tiptap`, which bundles the v1 implementation.

This means the prior report's analysis of updateYFragment (two-way diff, left/right scan, middle resolution) applies to the current codebase.

---

### Finding: updateYFragment (v1) produces minimal CRDT operations for single-paragraph edits but NOT for structural changes
**Confidence:** CONFIRMED
**Evidence:** Prior report analysis of the v1 algorithm, confirmed by source code pattern

The v1 algorithm works in three phases:
1. **Left scan:** Match children from left until mismatch
2. **Right scan:** Match children from right until mismatch
3. **Middle resolution:** For unmatched middle, update in-place if same node type, else delete+insert

For a single-paragraph text edit (e.g., changing one word in paragraph 3 of 10):
```
yChildren = [P1, P2, P3, P4, P5, P6, P7, P8, P9, P10]  (CRDT state)
pChildren = [P1, P2, P3', P4, P5, P6, P7, P8, P9, P10]  (new ProseMirror node from disk)

Left scan: P1 match, P2 match, P3 != P3' -> left = 2
Right scan: P10 match, P9 match, ... P4 match -> right = 7
Middle: yChildren[2] (P3) vs pChildren[2] (P3')
  -> Same node type (paragraph) -> update P3 IN-PLACE with P3' content
```

This produces a MINIMAL CRDT operation: only the text content of P3 is modified. P1-P2 and P4-P10 are untouched. The CRDT ops are approximately equivalent to what a human typing the same change would produce.

For structural changes (adding/removing paragraphs):
```
yChildren = [P1, P2, P3, P4, P5]
pChildren = [P1, P2, NEW_P, P3, P4, P5]

Left scan: P1 match, P2 match, P3 != NEW_P -> left = 2
Right scan: P5 match, P4 match, P3 match -> right = 3
Middle: yChildren has nothing (left+right >= count), pChildren has [NEW_P]
  -> Insert NEW_P at position 2
```

This is also minimal -- one insert operation. The algorithm handles insertions and deletions efficiently when the surrounding structure is unchanged.

**Implications:** For typical external editor changes (single-paragraph edits, adding/removing paragraphs), updateYFragment produces near-minimal CRDT operations. This means concurrent edits to OTHER paragraphs are preserved.

---

### Finding: The clobber problem only manifests when CRDT and disk BOTH changed since the last sync
**Confidence:** CONFIRMED
**Evidence:** Prior report analysis, re-confirmed

The clobber scenario requires TWO concurrent changes:
1. Agent (or browser user) modified the CRDT since the last disk write
2. External editor modified the disk since the last CRDT -> disk write

If only the external editor changed the file (the common case for the watcher), the CRDT hasn't been modified, and updateYFragment's two-way diff produces the correct result -- it applies the external changes cleanly.

The danger zone is:
```
T=0: CRDT and disk are in sync (content A)
T=1: Browser user types in CRDT -> CRDT becomes A'
T=2: Cursor saves file with changes -> disk becomes A''
T=3: Watcher fires -> updateYFragment(doc, fragment, parse(disk)) 
     -> Makes CRDT match A'' -> User's changes (A -> A') are LOST
```

**Mitigation via content-hash gate:** If the content-hash gate detects that disk content differs from the last-written content, AND the CRDT has been modified since the last persistence (checkable via the document's `lastChangeTime` or Yjs state vector), then we have a concurrent edit scenario. At this point:
- Option A: Skip the watcher update (let the next persistence cycle write the CRDT state to disk, overwriting Cursor's changes)
- Option B: Apply a three-way merge
- Option C: Enqueue both versions for user resolution

---

### Finding: y-prosemirror v2 uses a fundamentally different delta-based approach that would be better for bidirectional sync
**Confidence:** CONFIRMED
**Evidence:** y-prosemirror/src/sync-plugin.js (v2):283-294

```javascript
// v2 sync-plugin.js view.update():
if (ytype != null) {
  mutex(() => {
    const ycontent = ytype.toDeltaDeep(attributionManager || Y.noAttributionsManager)
    const pcontent = nodeToDelta(view.state.doc)
    const diff = d.diff(ycontent.done(), pcontent.done())
    ytype.applyDelta(diff, attributionManager || Y.noAttributionsManager)
  })
}
```

The v2 approach:
1. Convert Y type to a delta representation (`toDeltaDeep`)
2. Convert ProseMirror node to a delta representation (`nodeToDelta`)
3. Diff the two deltas (`d.diff`)
4. Apply only the diff (`applyDelta`)

This is still a two-way diff (no ancestor), but operating at the delta level rather than the tree level. The delta diff is more granular -- it can detect changes within text nodes, not just at the node-boundary level.

For the file watcher use case, v2's approach would:
1. Parse markdown from disk -> ProseMirror node
2. Convert to delta: `nodeToDelta(pmNode)`
3. Get current CRDT delta: `ytype.toDeltaDeep()`
4. Compute diff: `d.diff(ycontent, pcontent)`
5. Apply: `ytype.applyDelta(diff)`

The advantage: if both CRDT and disk changed the same paragraph but different words, v2's character-level delta diff might preserve both changes. v1's paragraph-level diff would overwrite the entire paragraph.

**Implications:** Migrating from `@tiptap/y-tiptap` updateYFragment (v1) to `@y/prosemirror` v2's delta-based API would significantly reduce clobber risk. However, this is a non-trivial migration and v2 is still in pre-release (2.0.0-2).

---

### Finding: For server-side (no EditorView) application of disk content, updateYFragment is the standard approach
**Confidence:** CONFIRMED
**Evidence:** Outline's DocumentHelper.tsx:553, current persistence.ts:162

Both Outline and the current OpenKnowledge codebase use updateYFragment for server-side document loading. The v2 sync plugin's delta approach is designed for the editor view lifecycle (it runs in `view.update()`), not for server-side headless sync.

A server-side implementation using v2's primitives would need to:
1. Get the XmlFragment from the Y.Doc
2. Convert to delta: this requires calling `toDeltaDeep()` on the Y type (available in @y/y)
3. Convert ProseMirror node to delta: `nodeToDelta()` from sync-utils.js
4. Diff and apply

This is possible but requires accessing internal APIs that aren't designed for server-side use.

---

## Gaps / follow-ups

* The v2 delta-based approach needs investigation for server-side headless use. The API surface (`toDeltaDeep`, `nodeToDelta`, `d.diff`, `applyDelta`) is exported but may have undocumented requirements around schema registration and mutation context.
* The `computeChildEqualityFactor` heuristic in v1 updateYFragment may partially mitigate clobbering in some structural scenarios -- deeper analysis of edge cases warranted.
