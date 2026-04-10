# Evidence: CM6 Decoration Ceiling — Can It Deliver Notion-Grade WYSIWYG?

**Dimension:** D7 — CM6 + decorations ceiling vs Notion-like block editing
**Date:** 2026-04-07
**Sources:** CodeMirror forum discussions, Obsidian forum, codemirror-rich-markdoc, obsidian-block-drag-drop plugin, Ixora extension pack, Joplin Rich Tables plugin

---

## Key files / pages referenced

- https://discuss.codemirror.net/t/rendering-react-components-or-similar-in-decoration-todom/3492 — CM6 forum discussion on React inside widgets
- https://codemirror.net/examples/decoration/ — Official CM6 decoration documentation
- https://github.com/segphault/codemirror-rich-markdoc — Rich markdown editing via CM6 decorations
- https://github.com/wepee/obsidian-block-drag-drop — Notion-style drag-and-drop for Obsidian Live Preview
- https://codeberg.org/retronav/ixora — CM6 extension pack for interactive markdown editing
- https://forum.obsidian.md/t/the-fourth-editing-mode-full-wysiwyg-mode/64015 — User requests for full WYSIWYG beyond Live Preview
- https://codemirror.net/examples/autocompletion/ — CM6 autocompletion (slash command basis)
- https://discourse.joplinapp.org/t/plugin-rich-tables-v1-6-2-table-editing-rendering-in-markdown-editor/48101/22 — Rich Tables plugin for CM6-based editor

---

## Findings

### Finding: React components CAN be rendered inside CM6 widget decorations, but via escape hatches, not native support
**Confidence:** CONFIRMED
**Evidence:** https://discuss.codemirror.net/t/rendering-react-components-or-similar-in-decoration-todom/3492

Two approaches documented in the CM6 forum:
1. **React Portals:** Create an empty DOM container in `toDOM()`, pass a reference back to React code, render via portal into that container.
2. **ReactDOM.createRoot:** Create a div in `toDOM()`, call `ReactDOM.createRoot(dom)`, then `root.render(<Component />)`, return the container.

The CM6 maintainer (Marijn Haverbeke) cautioned this introduces "extra indirection and inefficiency." One developer reported React Portal content getting deleted due to DOM reconciliation conflicts between CM6 and React.

**Implications:** React components inside CM6 decorations are technically possible but fragile. Each widget creates a separate React root or portal, unlike TipTap's ReactNodeViewRenderer which integrates React into ProseMirror's update cycle. This matters for rendering our Callout void nodes — they'd work, but with caveats around React lifecycle management, cleanup on decoration disposal, and potential DOM ownership conflicts.

### Finding: CM6 decorations can hide markdown syntax and render rich output (proven by multiple projects)
**Confidence:** CONFIRMED
**Evidence:** https://github.com/segphault/codemirror-rich-markdoc, https://codeberg.org/retronav/ixora

codemirror-rich-markdoc demonstrates:
- Mark decorations apply CSS classes (heading sizes, bold, italic)
- Replace decorations swap source ranges with rendered HTML widgets
- Widget decorations insert rendered content (images, embeds)
- Cursor-aware reveal: when cursor enters a region, decorations are removed, source is shown

Ixora provides: hidden decoration marks (asterisks hidden, styled text shown), heading font sizes, auto link detection, frontmatter support. Described as "under heavy development but quite usable."

**Implications:** The Obsidian Live Preview pattern is reproducible in CM6. For standard markdown (headings, bold, links, images), the ceiling is proven. The question is what happens beyond standard markdown.

### Finding: Block-level drag-and-drop IS achievable on CM6, proven by Obsidian plugin
**Confidence:** CONFIRMED
**Evidence:** https://github.com/wepee/obsidian-block-drag-drop

The obsidian-block-drag-drop plugin (MIT licensed) implements:
- Grip handles on hover for every block type
- Drag with ghost preview and drop position indicator
- Multi-block selection (Shift-click for ranges, Ctrl/Cmd-click for toggle)
- Keyboard shortcuts for up/down movement
- Landing animations
- Single undo operation

Supported blocks: paragraphs, headings, lists, code blocks, tables, callouts, blockquotes, embeds, math blocks, thematic breaks. Frontmatter is non-draggable.

**Implications:** This is strong evidence that Notion-style block drag-and-drop works on CM6. It's a community plugin (not built into Obsidian core), demonstrating it can be built on top of CM6's API. The implementation is TypeScript (89.1%) + CSS (9.1%).

### Finding: Slash commands are achievable via CM6's built-in autocompletion system
**Confidence:** CONFIRMED
**Evidence:** https://codemirror.net/examples/autocompletion/

CM6's autocompletion extension:
- Triggers on character input (configurable to "/" trigger)
- Supports custom completion sources (functions returning completions based on context)
- Provides fuzzy matching, filtering, ranking
- Supports `displayLabel` for custom rendering
- Supports `tooltipClass` for styling
- Included in `basicSetup`

Building slash commands requires a custom completion source that activates on "/" and provides block-type insertions. This is a well-documented pattern.

**Implications:** Slash commands are the easiest Notion-like feature to build on CM6. The autocompletion API is designed for exactly this kind of contextual command palette.

### Finding: Rich table editing exists for CM6-based editors but is not a standard extension
**Confidence:** CONFIRMED
**Evidence:** Joplin Rich Tables plugin (v1.7.10, Dec 2025), codemirror-rich-markdoc

Joplin's Rich Tables plugin provides table editing/rendering in their CM6-based markdown editor. codemirror-rich-markdoc replaces table source with rendered HTML block widgets. Neither is a generic npm package — they're application-specific implementations.

**Implications:** Table editing on CM6 is achievable but requires custom engineering. There's no `@codemirror/table` equivalent of TipTap's TableKit. Each project builds its own.

### Finding: The ceiling of CM6 decoration-based WYSIWYG is "good for inline/standard markdown, medium for simple components, hard for complex interactive blocks"
**Confidence:** INFERRED
**Evidence:** Obsidian forum feature request for "fourth editing mode" (full WYSIWYG), codemirror-rich-markdoc limitations

Obsidian users explicitly request a full WYSIWYG mode beyond Live Preview. Key complaints:
- "Expanding and collapsing markups like **bold** is disrupting" during cursor movement
- Live Preview doesn't offer "the seamless, fully-rendered editing experience that dedicated WYSIWYG editors provide"
- Interactive editing of "headings, quotes, unordered lists, tables" is not fully visual

The fundamental limitation: CM6 decorations operate on a text buffer. The cursor model is character-by-character through text. There is no concept of "selecting a block" the way ProseMirror selects nodes. You can overlay visual rendering, but the editing model remains text-based.

**Implications:** CM6 decorations can approach Notion-level visuals for reading, but the editing experience has an inherent ceiling. Typing into a heading that looks rendered requires the decoration to temporarily reveal syntax. Drag-and-drop works (proven by plugin) but is a layer on top of text manipulation, not native block operations. Complex components with editable children (like TipTap's nested editor in a callout) are the hardest — they'd need nested CM6 instances or escape to React, both adding complexity.

---

## Gaps / follow-ups

- Performance benchmarks for CM6 with many widget decorations (100+ rendered components in a long document)
- Obsidian's internal implementation of Live Preview is proprietary — exact decoration management strategy is not publicly documented
- No production example of MDX components rendered as CM6 widget decorations (Markdoc exists, MDX does not)
