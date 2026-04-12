# Evidence: Block-Level Editing Capabilities — ProseMirror Tree Model vs CM6 Decoration Model

**Dimension:** D8 — What editing capabilities structurally require ProseMirror's tree model and cannot be achieved with CM6 decorations?
**Date:** 2026-04-12
**Sources:** prosemirror.net, tiptap.dev, codemirror.net, discuss.codemirror.net, forum.obsidian.md, Marijn Haverbeke's writings

---

## Architectural foundation

### CM6's document model is a flat string — confirmed
**Confidence:** CONFIRMED
**Source:** [codemirror.net/docs/guide](https://codemirror.net/docs/guide/#doc)

> "CodeMirror, being a *text* editor, treats the document as a flat string. It stores this string split by line in a tree-shaped data structure to allow cheap updates anywhere in the document (and efficient indexing by line number)."

The internal B-tree is a performance structure — not a semantic tree of typed, nested nodes.

### ProseMirror's document model is a typed tree — confirmed
**Confidence:** CONFIRMED
**Source:** [prosemirror.net/docs/guide/#doc](https://prosemirror.net/docs/guide/#doc)

> "A ProseMirror document is a node, which holds a fragment containing zero or more child nodes."

Nodes have types (`paragraph`, `table`, `heading`, etc.), attributes, and content expressions governing what children are valid.

### CM6 decorations are view-layer only — confirmed
**Confidence:** CONFIRMED
**Source:** [codemirror.net/examples/decoration](https://codemirror.net/examples/decoration/)

Widget decorations "insert a DOM element in the editor content"; replace decorations "hide a stretch of content." Neither creates model-level structure. The document (`EditorState.doc`) remains a plain `Text`.

### CM6 widgets are `contenteditable=false` islands — confirmed
**Confidence:** CONFIRMED
**Source:** [discuss.codemirror.net/t/focusing-inputs-within-widgets/5178](https://discuss.codemirror.net/t/focusing-inputs-within-widgets/5178)

Marijn Haverbeke: widgets "are intentionally set to `contenteditable=false`." You can introduce `contenteditable=true` children, but these are islands outside CM6's editing model — input, selection, undo, and collaboration do not flow into them.

### Marijn's own framing: ProseMirror = rich text, CM6 = code/text
**Confidence:** CONFIRMED
**Source:** [marijnhaverbeke.nl/blog/extensibility.html](https://marijnhaverbeke.nl/blog/extensibility.html)

ProseMirror is "a rich text editor system"; CodeMirror 6 is "a rewrite of the code editor by that name."

---

## Capability-by-capability evidence

### 1. Table editing — cell-level cursor, tab navigation, column ops, merge/split, CellSelection

**ProseMirror:** `prosemirror-tables` provides `table > table_row > table_cell` node types, `CellSelection` (rectangular selection), `TableMap` (2D grid geometry resolving colspan/rowspan), `goToNextCell` (tab navigation), `mergeCells`, `splitCell`, column/row add/delete commands. TipTap wraps this as `@tiptap/extension-table`.
**Source:** [prosemirror-tables README](https://github.com/ProseMirror/prosemirror-tables/blob/master/README.md)

**CM6:** No table editing model exists at the document level. Obsidian v1.5 shipped a table editor as a widget overlay, but it cannot do column resize, cell merge, multi-line cells, or rectangular cell selection — these require tree-level node manipulation.
**Source (Obsidian):** [Forum — Table cell-by-cell editing](https://forum.obsidian.md/t/live-preview-support-editing-a-table-cell-by-cell/34110), [Forum — Column width resize](https://forum.obsidian.md/t/tables-adjust-resize-column-width/38902) (unresolved, no staff response)

**Why tree required:** Column/row operations walk a three-level node hierarchy (`table > row > cell`). Cell merge restructures child nodes and their colspan/rowspan attributes. CellSelection selects across tree boundaries. A flat buffer has no node boundaries to operate on.

---

### 2. NodeViews — arbitrary interactive blocks with editable regions

**ProseMirror:** `NodeView` interface binds custom DOM (including React/Vue components) to a specific node in the tree. `contentDOM` defines an editable region *inside* the custom block. The user types into the node's content and PM transactions flow normally — selection, undo, collaboration all work within that region. TipTap's `ReactNodeViewRenderer` wraps this with `NodeViewWrapper` + `NodeViewContent`.
**Source:** [prosemirror.net/docs/ref/#view.NodeView](https://prosemirror.net/docs/ref/#view.NodeView), [tiptap.dev/docs/editor/extensions/custom-extensions/node-views](https://tiptap.dev/docs/editor/extensions/custom-extensions/node-views)

**CM6:** Widget decorations render arbitrary DOM but are `contenteditable=false`. You cannot create a block where typing inside the widget flows into CM6's document model. Obsidian plugin developers confirm: "does not give the ability to completely prevent or override Obsidian's default way of rendering and which rendering actions happen on certain user input events."
**Source (Obsidian):** [Forum — Make HTML renderings editable](https://forum.obsidian.md/t/live-preview-make-html-renderings-editable/84107), [Forum — Custom CodeMirror block widget](https://forum.obsidian.md/t/how-to-create-custom-codemirror-block-widget/36132)

**Why tree required:** NodeViews are anchored to nodes via `getPos()`. The editor dispatches transactions targeting that node's tree position. `contentDOM` enables inline editing within the node's schema-declared content. Without node identity and position in a tree, there is nothing to anchor the view to.

---

### 3. Block drag-and-drop

**ProseMirror:** `draggable: true` on node extension config + `data-drag-handle` DOM attribute. On dragstart, PM serializes the selected `Slice` (subtree); on drop, it resolves the target position and applies a move transaction. TipTap exposes this through node extension configuration.
**Source:** [prosemirror-view/src/input.ts (drag handlers)](https://github.com/ProseMirror/prosemirror-view/blob/master/src/input.ts), [tiptap.dev React NodeViews — dragging](https://tiptap.dev/docs/editor/extensions/custom-extensions/node-views/react)

**CM6:** Not supported. Obsidian users request Notion/Roam-style block dragging; the workaround (Alt+Up/Down) only swaps single lines, not multi-line blocks or paragraphs. No staff response on feature requests.
**Source (Obsidian):** [Forum — Reorder text blocks with drag and drop](https://forum.obsidian.md/t/reorder-text-blocks-paragraphs-with-mouse-drag-and-drop/5049) (40 upvotes), [Forum — Drag and drop blocks within a note](https://forum.obsidian.md/t/drag-and-drop-functionality-for-blocks-within-a-note/92007)

**Why tree required:** Dragging operates on whole nodes at known tree positions. The system identifies the node boundary, serializes its subtree as a `Slice`, removes it from one position, and inserts at another while maintaining schema validity. A flat buffer cannot identify "this contiguous region is a single draggable unit with children."

---

### 4. Selection types beyond text

**ProseMirror:** Four selection types: `TextSelection` (cursor/range in textblocks), `NodeSelection` (whole node), `AllSelection` (entire doc), `GapCursor` (between non-text leaf blocks). prosemirror-tables adds `CellSelection` (rectangular multi-cell).
**Source:** [prosemirror.net/docs/ref/#state.Selection](https://prosemirror.net/docs/ref/#state.Selection), [prosemirror-tables CellSelection](https://github.com/ProseMirror/prosemirror-tables/blob/master/src/cellselection.ts), [prosemirror-gapcursor](https://github.com/ProseMirror/prosemirror-gapcursor)

**CM6:** Selection is character ranges over flat text. Widget boundaries are opaque: `atomicRanges` makes the cursor skip over entire widgets. You cannot select text that spans from prose through a rendered widget into subsequent prose.
**Source:** [codemirror.net/examples/decoration](https://codemirror.net/examples/decoration/)
**Source (Obsidian):** [Forum — Selection across callouts breaks rendering](https://forum.obsidian.md/t/have-live-preview-while-editing-a-callout-edit-callouts-progressively-and-maintain-live-preview-of-items-not-being-edited/84231)

**Why tree required:** `NodeSelection` resolves to a node boundary in the tree. `CellSelection` navigates the table hierarchy via `TableMap`. `GapCursor` identifies gaps between block nodes. All require typed node boundaries absent from a flat offset model.

---

### 5. Schema-enforced document structure

**ProseMirror:** `Schema` declares node types with content expressions (e.g., `"table_row+"`, `"block+"`, `"(paragraph | blockquote)+"`). `Node.check()` validates children match. `ContentMatch` enforces the grammar on every edit.
**Source:** [prosemirror.net/docs/guide/#schema](https://prosemirror.net/docs/guide/#schema)

**CM6:** No structural validation model. The document is a string; any character sequence is valid. A decoration can make text *look* like a table, but the model has no constraint preventing `| col1` on one line and a Mermaid fence on the next from being adjacent — the text is structurally formless.

**Why tree required:** Content expressions define valid parent-child relationships — a recursive tree grammar. `table` requires `table_row` children, which require `table_cell` children, which require block content. This is definitionally a tree structure.

---

### 6. Structural transforms (wrap, lift, join, split)

**ProseMirror:** `ReplaceAroundStep` replaces around a range while preserving inner content (used for wrap/lift). `Transform.lift()` removes a tree ancestor; `Transform.wrap()` inserts one; `Transform.join()` and `split()` manipulate nesting depth.
**Source:** [prosemirror.net/docs/guide/#transform](https://prosemirror.net/docs/guide/#transform), [prosemirror-transform/src/replace_step.ts](https://github.com/ProseMirror/prosemirror-transform/blob/master/src/replace_step.ts)

**CM6:** Indent/dedent via text manipulation. No concept of "wrapping in a blockquote" or "lifting out of a list" at the model level — only character insertion/deletion.

**Why tree required:** `lift()` removes a tree ancestor; `wrap()` inserts one. These change nesting depth — they are nonsensical without a model where nodes have parents and children.

---

### 7. Collaborative editing within blocks

**ProseMirror + y-prosemirror:** Maps `Y.XmlFragment` (tree CRDT) to PM's node tree. Concurrent edits to different cells of the same table resolve correctly because each cell is a distinct subtree in both Yjs and PM. `yCursorPlugin` renders remote cursors; `yUndoPlugin` provides client-scoped undo.
**Source:** [y-prosemirror README](https://github.com/yjs/y-prosemirror/blob/master/README.md)

**CM6 + @codemirror/collab:** Synchronizes document text changes only. Two users CANNOT collaboratively edit inside the same widget.
**Source:** [codemirror.net/examples/collab](https://codemirror.net/examples/collab/)
> "By default, the only thing that is shared through such a collaborative-editing channel is document changes."

**Source (Obsidian):** [Forum — Obsidian Sync collaborative editing](https://forum.obsidian.md/t/obsidian-sync-live-team-collaborative-editing/6058) — 43+ likes, no staff response. The architecture is file-level sync, not character-level CRDT. Community plugins (Relay, PeerDraft) are third-party workarounds.

**Why tree required:** Tree CRDT maps structural boundaries. Concurrent edits to different table cells resolve correctly because they are independent subtrees. A flat buffer would interleave concurrent edits to different "cells" into a single character stream.

---

### 8. Clipboard with schema awareness (paste from Excel → table)

**ProseMirror:** `DOMParser` parses pasted HTML (`<table>`, `<tr>`, `<td>`) into schema-conformant table/row/cell nodes. `clipboardParser` + `transformPastedHTML` hooks allow preprocessing.
**Source:** [prosemirror.net/docs/ref/#model.DOMParser](https://prosemirror.net/docs/ref/#model.DOMParser)

**CM6/Obsidian:** "Auto convert HTML" toggle converts pasted HTML tables to markdown pipe syntax. Pasting from Excel historically pasted as plain text. Multiline cell content flattens because markdown tables require single-line cells. Users describe paste as inferior to Typora.
**Source (Obsidian):** [Forum — Excel/CSV paste](https://forum.obsidian.md/t/excel-and-csv-to-md-conversion-on-pasting/9312), [Forum — Google Sheets paste issues](https://forum.obsidian.md/t/cant-paste-a-single-column-from-google-sheets-or-excel-anymore-without-a-table/61164)

**Why tree required:** The parser matches DOM elements to node types in the schema, recursively building a valid tree. A flat buffer receives raw text with no mechanism to reconstruct block types.

---

### 9. History with structural awareness

**ProseMirror:** `prosemirror-history` records inverted `Step` objects (not text diffs). `Step.invert(doc)` with position remapping. Undoing "merge cells" restores the original cell structure.
**Source:** [prosemirror-history/src/history.ts](https://github.com/ProseMirror/prosemirror-history/blob/master/src/history.ts)

**CM6:** History tracks `ChangeSet` objects on `EditorState.doc` — character insertions/deletions. Widget-internal mutations never become transactions and are invisible to history.
**Source:** [codemirror.net/docs/guide/#data-model](https://codemirror.net/docs/guide/#data-model)

**Why tree required:** Structural operations like cell merge produce `ReplaceAroundStep`s that restructure the node tree. Their inverses must restore the original tree shape. Text-diff undo could restore characters but not node boundaries, attributes, or nesting.

---

### 10. Nested block structures

**ProseMirror:** Content expressions enable arbitrary nesting: `blockquote` with `content: "block+"` can contain paragraphs, lists, code blocks, or other blockquotes. Schema validates each level independently.
**Source:** [prosemirror.net/docs/guide/#schema](https://prosemirror.net/docs/guide/#schema)

**CM6:** No model-level nesting. Decorations can visually style indented text, but the document has no concept of "this blockquote contains a list that contains a code block." Nested decorations (replace inside replace) do not compose.
**Source:** [discuss.codemirror.net/t/need-to-create-decoration-of-mixed-type-sort-of/3762](https://discuss.codemirror.net/t/need-to-create-decoration-of-mixed-type-sort-of/3762) — Marijn recommends combining separate mark and widget decorations rather than nesting.

**Why tree required:** Three levels of nesting = three levels of parent-child in a tree. Schema validates each level's children independently. `lift()` and `wrap()` change nesting depth.

---

## Gaps / follow-ups

- Whether any CM6-based editor has ever achieved collaborative editing inside widgets via `sharedEffects` — no production evidence found, but the escape hatch exists
- Obsidian's v1.5 table editor implementation details are not public (closed source); the specific CM6 techniques used are inferred from behavior, not confirmed from code
- Performance implications of ProseMirror's tree model at scale (100+ nested nodes, large tables) — not covered here; see existing performance evidence
