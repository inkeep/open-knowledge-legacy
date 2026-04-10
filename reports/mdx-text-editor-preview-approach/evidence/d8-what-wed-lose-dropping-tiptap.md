# Evidence: What We'd Lose Dropping TipTap

**Dimension:** D8 — TipTap ecosystem, ProseMirror block model, and features that would need rebuilding
**Date:** 2026-04-07
**Sources:** TipTap documentation, TipTap extension overview, y-tiptap/y-prosemirror repos, BlockNote, Liveblocks comparison article

---

## Key files / pages referenced

- https://tiptap.dev/docs/editor/extensions/overview — Full TipTap extension list (~70+ extensions)
- https://tiptap.dev/docs/editor/extensions/functionality/starterkit — StarterKit contents
- https://tiptap.dev/docs/editor/extensions/functionality/drag-handle-react — Drag Handle React extension
- https://tiptap.dev/docs/editor/extensions/functionality/table-kit — TableKit extension
- https://tiptap.dev/docs/editor/extensions/functionality/collaboration — Collaboration extension
- https://tiptap.dev/docs/editor/extensions/custom-extensions/node-views/react — ReactNodeViewRenderer docs
- https://github.com/ueberdosis/y-tiptap — y-tiptap Yjs binding
- https://liveblocks.io/blog/which-rich-text-editor-framework-should-you-choose-in-2025 — Framework comparison

---

## Findings

### Finding: TipTap provides ~70+ extensions across nodes, marks, and functionality categories
**Confidence:** CONFIRMED
**Evidence:** https://tiptap.dev/docs/editor/extensions/overview

Organized into three categories:
- **Node extensions (27):** Audio, Blockquote, BulletList, CodeBlock, Heading, HorizontalRule, Image, ListItem, OrderedList, Paragraph, Table, TaskItem, TaskList, YouTube, Twitch, etc.
- **Mark extensions (10):** Bold, Code, Highlight, Italic, Link, Strike, Subscript, Superscript, TextStyle, Underline
- **Functionality extensions (33+):** AI Generation, BubbleMenu, CharacterCount, Collaboration, CollaborationCursor, DragHandle, FloatingMenu, FontFamily, FontSize, History, Placeholder, StarterKit, TableKit, TextAlign, Typography, UniqueID, etc.

Several are tiered (Start, Team, Add-on) — some require paid TipTap plans.

**Implications:** Dropping TipTap means losing access to all of these as ready-made extensions. The critical ones for our product: Collaboration, CollaborationCursor, DragHandle, TableKit, BubbleMenu, FloatingMenu, Placeholder, Link, and all the StarterKit basics.

### Finding: ProseMirror's block model provides structured document tree, node types, marks, and schema enforcement
**Confidence:** CONFIRMED
**Evidence:** https://tiptap.dev/docs/editor/extensions/custom-extensions/node-views, ProseMirror documentation

ProseMirror models documents as a tree of typed nodes with marks. This provides:
- **Schema enforcement:** Invalid document states are structurally prevented
- **Node types:** Each block (heading, paragraph, code block, table) is a typed node with defined attributes
- **Marks:** Inline formatting (bold, italic, link) as typed annotations on text ranges
- **Block-level selection:** Can select entire nodes, not just text ranges
- **Node views:** Custom rendering for specific node types (ReactNodeViewRenderer)
- **Transactions:** Atomic document transformations with undo/redo
- **Commands:** Typed operations (toggleBold, setHeading, etc.) that respect schema

In CM6, the document is a flat text buffer with a syntax tree overlay. There's no schema enforcement at the document model level — the text can be any string, and validity is determined by parsing.

**Implications:** ProseMirror's block model is the foundation for Notion-like editing. Blocks are first-class entities that can be selected, moved, transformed. In CM6, "blocks" are text regions identified by parsing, not structural entities. This is the fundamental architectural difference.

### Finding: ReactNodeViewRenderer enables rendering React components as atom/void nodes inside the editor
**Confidence:** CONFIRMED
**Evidence:** https://tiptap.dev/docs/editor/extensions/custom-extensions/node-views/react

ReactNodeViewRenderer provides:
- Render any React component as a ProseMirror node view
- NodeViewContent for editable content areas within the component
- NodeViewWrapper for integration with ProseMirror's view lifecycle
- Props passed: node (attrs, type), editor instance, getPos, updateAttributes, deleteNode
- Atom nodes (void nodes): non-editable blocks rendered as React components

Limitations noted:
- Performance degrades with many ReactNodeViewRenderer instances (GitHub issue #4492)
- Cannot pass additional props downstream (GitHub issue #2986)

**Implications:** This is how our Callout void nodes work. Replacing this with CM6 widget decorations + React portals is possible but architecturally different: TipTap manages the React lifecycle through ProseMirror's update cycle; CM6 widgets manage React lifecycle independently, creating potential synchronization issues.

### Finding: @tiptap/y-tiptap is actively maintained as of 2025-2026
**Confidence:** CONFIRMED
**Evidence:** https://github.com/ueberdosis/y-tiptap, https://tiptap.dev/docs/editor/extensions/functionality/collaboration

y-tiptap is TipTap's fork/wrapper of y-prosemirror, packaged for the TipTap extension system. It binds Y.XmlFragment to ProseMirror state. Installation: `@tiptap/extension-collaboration @tiptap/y-tiptap yjs y-websocket`. Documentation updated within the last week (as of April 2026).

**Implications:** The current Yjs binding works and is maintained. Dropping it means either using y-codemirror.next (Y.Text, different CRDT type) or building a custom Y.Text-to-ProseMirror bridge (the hybrid option in D11).

### Finding: TipTap's DragHandle provides block-level drag with context menus
**Confidence:** CONFIRMED
**Evidence:** https://tiptap.dev/docs/editor/extensions/functionality/drag-handle-react

The DragHandle extension:
- Handles appearing on hover for every block
- Supports nested content (list items, blockquotes)
- DragContextMenu provides block transformation (heading, list, blockquote, etc.)
- Works with collaboration extensions
- Part of the TipTap extension ecosystem (not a community hack)

**Implications:** This is a polished, integrated feature. Building equivalent functionality on CM6 is proven possible (obsidian-block-drag-drop) but requires custom engineering rather than installing an extension.

### Finding: Building a "Notion-like" editor from scratch requires significant engineering investment
**Confidence:** CONFIRMED
**Evidence:** https://liveblocks.io/blog/which-rich-text-editor-framework-should-you-choose-in-2025

Liveblocks analysis (2025): "Setting up a full editor 'from scratch', using only the core libraries, requires quite a lot of code." They recommend BlockNote for Notion-style editors, which itself is built on ProseMirror + TipTap.

**Implications:** The ecosystem consensus is that Notion-like block editing is built on ProseMirror, not CM6. Every major block editor (BlockNote, Yoopta, TipTap itself) uses ProseMirror. CM6 is used for code editing and plain-text/markdown editing. Going CM6-only for Notion-grade WYSIWYG would be counter to the industry direction.

---

## Summary: What we'd lose

1. **~70+ TipTap extensions** — each representing saved engineering weeks
2. **ProseMirror's structured document model** — schema, typed nodes, block-level selection
3. **ReactNodeViewRenderer** — first-class React component rendering inside the editor
4. **@tiptap/y-tiptap** — maintained Yjs binding (Y.XmlFragment)
5. **DragHandle + DragContextMenu** — polished block drag-and-drop
6. **TableKit** — table creation, editing, column/row operations
7. **BubbleMenu + FloatingMenu** — context-aware floating UIs
8. **Collaboration + CollaborationCursor** — real-time collaboration with cursor awareness
9. **@tiptap/pm (ProseMirror)** — the entire block editing paradigm
10. **Community ecosystem** — tutorials, examples, Stack Overflow answers for TipTap >> CM6 WYSIWYG

---

## Gaps / follow-ups

- Specific performance comparison of ReactNodeViewRenderer vs CM6 widget + React portal for rendering custom components
- Whether TipTap's paid extensions (AI, some DragHandle features) are essential for our use case
