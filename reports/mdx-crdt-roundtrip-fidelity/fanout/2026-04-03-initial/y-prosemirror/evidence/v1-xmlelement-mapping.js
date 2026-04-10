// SOURCE: y-prosemirror v1.3.7, src/plugins/sync-plugin.js
// KEY FUNCTIONS: The v1 mapping used Y.XmlElement and Y.XmlText directly.
// This is the mapping that TipTap's @tiptap/y-tiptap (v3.0.2) still uses
// (it's a fork of y-prosemirror v1.x).

// Node -> Y.XmlElement (lines 875-895)
const createTypeFromElementNode = (node, meta) => {
  const type = new Y.XmlElement(node.type.name)  // <-- node type = XML element name
  for (const key in node.attrs) {
    const val = node.attrs[key]
    if (val !== null && key !== 'ychange') {
      type.setAttribute(key, val)               // <-- each attr = individual Y.Map entry
    }
  }
  type.insert(0, normalizePNodeContent(node).map(n =>
    createTypeFromTextOrElementNode(n, meta)     // <-- recursive children
  ))
  meta.mapping.set(type, node)
  return type
}

// Text nodes -> Y.XmlText (lines 857-868)
const createTypeFromTextNodes = (nodes, meta) => {
  const type = new Y.XmlText()                   // <-- text nodes = Y.XmlText
  const delta = nodes.map(node => ({
    insert: node.text,
    attributes: marksToAttributes(node.marks, meta)  // marks = formatting attrs
  }))
  type.applyDelta(delta)
  meta.mapping.set(type, nodes)
  return type
}

// Marks -> formatting attributes on Y.XmlText (lines 1121-1133)
const marksToAttributes = (marks, meta) => {
  const pattrs = {}
  marks.forEach(mark => {
    if (mark.type.name !== 'ychange') {
      // If mark can overlap with itself (e.g., comments), hash is appended
      const isOverlapping = !mark.type.excludes(mark.type)
      pattrs[isOverlapping
        ? `${mark.type.name}--${hashOfJSON(mark.toJSON())}`
        : mark.type.name
      ] = mark.attrs
    }
  })
  return pattrs
}

// INTERPRETATION:
// v1 mapping:
//   ProseMirror doc node     -> Y.XmlFragment (top-level)
//   ProseMirror element node -> Y.XmlElement(nodeName)
//   ProseMirror text nodes   -> Y.XmlText (with formatting attrs for marks)
//   Node attrs               -> Y.XmlElement.setAttribute() (individual entries)
//   Marks                    -> Y.XmlText formatting attributes
//   Overlapping marks        -> Hash-suffixed attribute names (e.g., "comment--abc123")
