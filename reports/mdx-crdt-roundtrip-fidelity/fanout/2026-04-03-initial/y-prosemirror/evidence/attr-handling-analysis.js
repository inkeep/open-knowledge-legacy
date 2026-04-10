// ANALYSIS: How ProseMirror node attributes are handled in Yjs
//
// === V2 (@y/prosemirror 2.0.0-2) ===
//
// In the delta-based v2, node attributes are stored as individual entries
// in the delta's attrs array:
//
// SOURCE: sync-utils.js line 183
//   d.setAttrs(n.attrs)
//
// And when converting back (deltaToPSteps, line 208):
//   for (const attr of d.attrs) {
//     tr.setNodeAttribute(currPos.i - 1, attr.key, attr.value)
//   }
//
// And when handling AttrStep (lines 371-373):
//   .if(AttrStep, (step, { beforeDoc }) =>
//     deltaModifyNodeAt(beforeDoc, step.pos, d => { d.modify(delta.create().setAttr(step.attr, step.value)) })
//   )
//
// INTERPRETATION:
// Each attribute is a SEPARATE delta attr operation.
// This means:
//
// CONCURRENT EDIT SCENARIO 1: Two users edit DIFFERENT attrs on same node
//   User A: setAttr("level", 3)  ->  delta: modify(setAttr("level", 3))
//   User B: setAttr("color", "red")  ->  delta: modify(setAttr("color", "red"))
//   Result: CLEAN MERGE. Both attrs applied. No conflict.
//   Reason: lib0/delta treats each attr key independently.
//
// CONCURRENT EDIT SCENARIO 2: Two users edit SAME attr on same node
//   User A: setAttr("level", 2)
//   User B: setAttr("level", 3)
//   Result: LAST WRITE WINS (by Yjs CRDT ordering -- higher clientID or later clock)
//   The delta system uses Yjs's internal conflict resolution for same-key overwrites.
//
// CONCURRENT EDIT SCENARIO 3: Content edit + attr edit on same node
//   User A: inserts text "hello" inside a paragraph
//   User B: setNodeAttribute(paragraphPos, "alignment", "center")
//   Result: CLEAN MERGE. Content operations and attribute operations are
//   orthogonal in the delta model -- they target different parts of the delta.
//
// === V1 (y-prosemirror 1.3.7) ===
//
// In v1, node attrs were stored via Y.XmlElement.setAttribute():
//   type.setAttribute(key, val)
//
// Each setAttribute call creates a separate Y.Map entry on the XmlElement,
// so the same concurrent merge semantics apply:
//   - Different attrs: clean merge
//   - Same attr: last-write-wins by Yjs ordering
//   - Content + attr: clean merge (different Y types)
//
// === CUSTOM NODE TYPES (MDX Components) ===
//
// For a ProseMirror node like:
//   {
//     type: 'callout',
//     attrs: { componentName: 'Callout', type: 'warning', children: '...' }
//   }
//
// V2: Becomes a delta with name="callout", attrs=[
//   {key: "componentName", value: "Callout"},
//   {key: "type", value: "warning"},
//   {key: "children", value: "..."}
// ]
//
// V1: Becomes Y.XmlElement("callout") with attributes:
//   componentName="Callout", type="warning", children="..."
//
// CRITICAL WARNING: If "children" is stored as a string attr (serialized),
// concurrent edits to the children content will be LAST-WRITE-WINS on the
// entire string. To get character-level merging, children MUST be
// ProseMirror child nodes (not a string attr), which get mapped to nested
// deltas (v2) or child Y.XmlText/Y.XmlElement (v1).
