# Evidence: Void Node Trade-off Revisited

**Dimension:** D6 — Does Y.Text canonical reframe the void node decision?
**Date:** 2026-04-07
**Sources:** mdx-crdt-roundtrip-fidelity report, jsx-component.ts, ytext-canonical-prosemirror-binding report, mdx-text-editor-preview-approach report

---

## Key files referenced

- `~/reports/mdx-crdt-roundtrip-fidelity/REPORT.md` — original 6-failure-vector analysis
- `~/reports/mdx-text-editor-preview-approach/REPORT.md` — CodeMirror decoration model
- `~/reports/ytext-canonical-prosemirror-binding/REPORT.md` — Y.Text architecture
- `init_spike/src/editor/extensions/jsx-component.ts` — current void node implementation

---

## Findings

### Finding: The void node concept transforms under Y.Text canonical
**Confidence:** CONFIRMED
**Evidence:** Architecture comparison

**Under Y.XmlFragment (current):**
- JSX is a string attribute on an atom node
- The atom node is a ProseMirror node in the document tree
- Y.XmlElement stores the node with its attributes
- The JSX string is opaque to the CRDT — it's just an attribute value
- Editing the JSX requires editing the string attribute (last-writer-wins)

**Under Y.Text canonical:**
- JSX IS the text — it's characters in the Y.Text sequence
- There is no atom node in the CRDT layer
- The ProseMirror binding INFERS where JSX begins and ends from the text
- The JSX characters participate in character-level CRDT operations
- Editing the JSX means editing characters in the text stream

The void node becomes a VIEW concept, not a DATA concept. In the ProseMirror document model, the binding can still create atom nodes for rendering purposes, but the canonical data is the text in Y.Text.

### Finding: This is closer to CodeMirror's widget decoration model
**Confidence:** CONFIRMED
**Evidence:** mdx-text-editor-preview-approach report, CodeMirror API docs

CodeMirror's decoration system works on ranges of text:
1. A `ViewPlugin` detects JSX regions in the text
2. It creates a `Decoration.replace()` or `Decoration.widget()` for that range
3. The decoration renders a React component (or DOM element) in place of the text
4. On focus/click, the decoration can reveal the source text

This is the Obsidian Live Preview pattern: text is canonical, visual rendering is decorative.

ProseMirror has a similar concept: `Decoration.node()` can add visual decorations to node ranges. But ProseMirror's document model is tree-structured, not flat text. To make this work:
1. The ProseMirror binding parses Y.Text → ProseMirror tree
2. JSX regions become atom nodes in the tree
3. But the canonical Y.Text content is the source

### Finding: Y.Text canonical opens partially editable JSX children
**Confidence:** INFERRED
**Evidence:** Architecture analysis

Under Y.XmlFragment with atom nodes, JSX children are part of the opaque string attribute. A user cannot place their cursor inside the children and type — the entire component is an indivisible atom.

Under Y.Text canonical, JSX children are character ranges in Y.Text:
```
<Callout type="warning">
  This is editable text that participates in CRDT merges.
</Callout>
```

The ProseMirror binding COULD:
1. Detect `<Callout type="warning">` as a component opener
2. Render the Callout component visually
3. Make the children region (`This is editable text...`) editable as rich text
4. Detect `</Callout>` as a component closer
5. Protect the opening/closing tags from casual editing

This is the "components with markdown children" pattern from MDX interleaving. It was explicitly ruled out in the mdx-crdt-roundtrip-fidelity report under Y.XmlFragment because:
- Failure Vector 2: MDAST-to-editor conversion destroys component structure
- Failure Vector 3: nested nodes require deep schema registration

Under Y.Text canonical, these failure vectors change:
- FV2 is bypassed: the editor shows the text, not a converted tree
- FV3 is replaced by: the ProseMirror binding needs region-aware parsing

The new failure vector is **concurrent safety of component boundaries**: if a user deletes `</Callout>` while another user edits the children, the component structure breaks.

### Finding: 5 of the 6 original failure vectors are reframed under Y.Text canonical
**Confidence:** INFERRED
**Evidence:** Cross-referencing mdx-crdt-roundtrip-fidelity failure vectors with Y.Text architecture

Original 6 failure vectors (from mdx-crdt-roundtrip-fidelity):

1. **remark-mdx multiline expression indentation drift** — Still relevant if remark-mdx is used for parsing, but less critical because Y.Text stores the exact text (no round-trip through MDAST→editor→MDAST needed for save)

2. **MDAST-to-editor conversion destroys JSX structure** — **Eliminated.** No MDAST-to-editor conversion for JSX. JSX is text in Y.Text. The ProseMirror binding shows it as an atom node for rendering only.

3. **Nested object props get LWW** — **Eliminated.** Under Y.Text, props are character sequences. Concurrent edits to different props are character-level operations, not attribute-level. (But character-level corruption replaces attribute-level LWW — different problem, not necessarily better.)

4. **slate-yjs abandoned with critical bugs** — **Eliminated.** Y.Text canonical doesn't use y-prosemirror for JSX handling. The custom binding handles the Y.Text → ProseMirror mapping.

5. **Session boundary tension** — **Significantly reduced.** Y.Text stores the file text directly. Loading a file into Y.Text is a text replacement, not a MDAST → editor → Yjs conversion chain. Tombstone history mismatches are still possible but the normalization surface is much smaller (no tree conversion).

6. **Nobody has done this before** — **Still true.** No production system uses Y.Text canonical with MDX-aware ProseMirror rendering. But the components are more proven: Y.Text + CodeMirror is proven (HackMD, Obsidian, HedgeDoc). The novel work is narrower: "ProseMirror renders regions of Y.Text as components."

### Finding: The void node trade-off becomes a rendering strategy choice, not a data architecture choice
**Confidence:** INFERRED
**Evidence:** Architecture analysis

Under Y.XmlFragment, the void node decision is a DATA decision: "JSX is stored as an opaque string in an atom node's attribute." This determines CRDT semantics (LWW on the whole component), agent write patterns (must construct atom nodes), and collaboration boundaries (no concurrent editing within a component).

Under Y.Text canonical, the void node decision becomes a RENDERING decision: "How does ProseMirror display JSX regions?" Options:
1. **Full atom node** — same as today, entire JSX region is a non-editable block (simplest)
2. **Atom wrapper + editable children** — component tags are atoms, children are editable rich text (medium complexity)
3. **Decoration only** — text is always the canonical view, visual preview is a floating decoration (like Obsidian) (simplest implementation, worst UX for non-developers)

All three rendering strategies share the same underlying data model (characters in Y.Text). The choice can be made independently and even changed later without data migration.

---

## Gaps / follow-ups

* The "region locking" concept (protect component boundaries from concurrent edits) doesn't exist in Yjs — would need application-level enforcement
* Performance of re-parsing the entire Y.Text on each change vs. incremental parsing needs investigation
* The partially editable children pattern needs a prototype to validate UX assumptions
