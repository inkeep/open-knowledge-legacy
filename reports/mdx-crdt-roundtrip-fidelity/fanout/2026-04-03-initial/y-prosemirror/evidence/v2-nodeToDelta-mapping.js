// SOURCE: y-prosemirror v2.0.0-2, src/sync-utils.js lines 181-188
// KEY FUNCTION: Converts a ProseMirror Node into a lib0/delta (the universal
// intermediate format used by Yjs v14+ / @y/y).
//
// This is the CORE of the v2 mapping. Instead of Y.XmlElement/Y.XmlText,
// v2 uses lib0/delta as the interchange format, and the Y.Type stores deltas
// natively.

export const nodeToDelta = (n, nodeName = n.type.name) => {
  const d = delta.create(nodeName, $prosemirrorDelta)
  d.setAttrs(n.attrs)                            // <-- ALL attrs go as delta attrs
  n.content.content.forEach(c => {
    d.insert(
      c.isText ? (c.text ?? []) : [nodeToDelta(c)],  // text = string, element = recursive delta
      marksToFormattingAttributes(c.marks)             // marks = formatting attributes
    )
  })
  return d.done(false)
}

// INTERPRETATION:
// 1. Node type name -> delta.name (e.g., "heading", "callout", "mdx_component")
// 2. Node attrs -> delta.attrs (key-value pairs, e.g., {level: 2, componentName: "Callout"})
//    - Each attr is an INDIVIDUAL entry in the delta's attrs array
//    - This means concurrent edits to DIFFERENT attrs on the same node CAN merge cleanly
// 3. Text children -> string inserts with formatting attributes (marks)
// 4. Element children -> recursive nested deltas
// 5. Marks -> formatting attributes on inserts (keyed by mark type name)

// SOURCE: marksToFormattingAttributes (lines 93-103)
const marksToFormattingAttributes = marks => {
  if (marks.length === 0) return null
  const formatting = {}
  marks.forEach(mark => {
    formatting[mark.type.name] = mark.attrs  // mark name -> mark attrs
  })
  return formatting
}

// INTERPRETATION:
// Marks become Y.Text-style formatting attributes:
// bold -> { bold: {} }
// link -> { link: { href: "https://..." } }
// This uses Yjs's native formatting attribute merge semantics.
