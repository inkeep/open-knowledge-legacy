# Evidence: Effort Estimate — CM6-Only vs TipTap for Full Product

**Dimension:** D10 — Engineering effort to build Notion-like features on CM6 vs using TipTap
**Date:** 2026-04-07
**Sources:** TipTap extension docs, CM6 ecosystem analysis, BlockNote, Obsidian plugin ecosystem, Gravity UI editor, Liveblocks comparison, ink-mde

---

## Key files / pages referenced

- https://liveblocks.io/blog/which-rich-text-editor-framework-should-you-choose-in-2025 — Framework comparison with effort discussion
- https://github.com/wepee/obsidian-block-drag-drop — Block drag-and-drop on CM6 (MIT, TypeScript)
- https://github.com/davidmyersdev/ink-mde — ink-mde: CM6 markdown editor
- https://github.com/segphault/codemirror-rich-markdoc — Rich markdown via CM6 decorations
- https://github.com/gravity-ui/markdown-editor — Yandex Gravity UI dual-mode editor
- https://www.blocknotejs.org/ — BlockNote (ProseMirror-based Notion-like editor)
- https://codemirror.net/examples/autocompletion/ — CM6 autocompletion API
- https://codeberg.org/retronav/ixora — CM6 markdown enhancement extensions

---

## Findings

### Finding: Building Notion-like features on CM6 requires substantial custom engineering for each feature
**Confidence:** CONFIRMED
**Evidence:** Feature-by-feature analysis across CM6 ecosystem

| Feature | TipTap | CM6 | CM6 effort estimate |
|---------|--------|-----|---------------------|
| **Slash commands** | Built-in (FloatingMenu + suggestion API) | Custom completion source on "/" trigger | 1-2 weeks |
| **Block drag-and-drop** | DragHandle extension | Custom (obsidian-block-drag-drop proves feasibility, ~2.5K LOC TypeScript + CSS) | 3-6 weeks |
| **Table editing** | TableKit extension (create, resize, merge/split, column/row ops) | Custom (Joplin Rich Tables as reference, no reusable package) | 4-8 weeks |
| **Component previews** | ReactNodeViewRenderer (built-in) | Widget decoration + React portal/createRoot (fragile, custom lifecycle) | 2-4 weeks per component type |
| **Inline formatting toolbar** | BubbleMenu extension | Custom panel positioned on selection (CM6 has tooltip primitives) | 2-3 weeks |
| **Collaboration** | @tiptap/extension-collaboration + y-tiptap | y-codemirror.next (well-maintained, simpler) | 1 week (easier than TipTap) |
| **Collaboration cursors** | @tiptap/extension-collaboration-cursor | y-codemirror.next awareness (built-in) | 1 week (easier than TipTap) |
| **Placeholder text** | Placeholder extension | CM6 placeholder extension exists | < 1 day |
| **Character count** | CharacterCount extension | Trivial (text.length) | < 1 day |
| **Undo/redo** | History extension | CM6 history or y-codemirror.next undo manager | < 1 day |
| **Link editing UI** | Link extension + BubbleMenu | Custom (CM6 has no link-editing UI) | 1-2 weeks |
| **Image upload + preview** | Image extension | Custom widget decoration + upload handler | 2-3 weeks |
| **Block-level selection** | Native ProseMirror node selection | Custom (text selection only is native; block selection requires overlay) | 3-4 weeks |
| **Markdown inline rendering** | N/A (TipTap IS the WYSIWYG) | Ixora + custom decorations (proven pattern) | 4-8 weeks for full coverage |
| **Source mode** | Custom (serialize to text, separate editor) | Native (it IS the editor) | 0 (free) |

**Implications:** Total CM6 custom build for full Notion-like feature set: ~6-12 months of engineering. Source mode is free (the primary advantage). Collaboration is easier. Everything visual/interactive is harder.

### Finding: No prior art exists for Notion-grade block editing on CM6
**Confidence:** CONFIRMED
**Evidence:** Survey of CM6-based editors

CM6-based editors in production:
- **Obsidian:** Rich markdown editing, Live Preview decorations. Does NOT have Notion-style block editing (no block selection, no block-level drag from core — community plugin adds basic drag).
- **ink-mde:** Basic markdown editing with toolbar. No block editing.
- **HedgeDoc:** Split-pane editor + preview. No block editing.
- **Zettlr:** Academic markdown. No block editing.
- **Joplin:** Rich Tables plugin adds visual table editing. No general block editing.

Notion-grade block editors in production:
- **BlockNote:** ProseMirror + TipTap
- **Yoopta:** Slate.js
- **Notion:** Custom engine
- **Confluence:** ProseMirror
- **Google Docs:** Custom engine

**Implications:** Every shipping Notion-like editor uses either ProseMirror, Slate, or a custom engine. None uses CM6. Building Notion-grade block editing on CM6 would be novel engineering without existing reference implementations.

### Finding: The Gravity UI editor demonstrates the dual-mode (ProseMirror + CodeMirror) hybrid approach in production
**Confidence:** CONFIRMED
**Evidence:** https://medium.com/yandex/markdown-editor-wysiwyg-and-markup-editor-based-on-gravity-ui-43e97183ac8d, https://github.com/gravity-ui/markdown-editor

Yandex's Gravity UI markdown editor:
- WYSIWYG mode: ProseMirror (rich editing)
- Markup mode: CodeMirror (source editing)
- Canonical format: Markdown (stored as .md files)
- Conversion: markdown-it parser bridges both editors
- Each element requires three configurations: ProseMirror spec, fromMd (parsing), toMd (serialization)
- "Seamless real-time switching between WYSIWYG and Markup approaches"

**Implications:** This is direct prior art for the D11 hybrid option. Yandex ships this in production. The conversion overhead is managed through a bidirectional spec system. However, they use markdown as the canonical format with bidirectional conversion (not Y.Text), and they don't appear to use Yjs/CRDT collaboration.

### Finding: The CM6 ecosystem has growing infrastructure for markdown editing
**Confidence:** CONFIRMED
**Evidence:** @lezer/markdown, Ixora, ink-mde, codemirror-rich-markdoc

Available CM6 markdown infrastructure:
- **@lezer/markdown:** Extensible markdown parser for CM6, supports custom block parsers
- **@codemirror/lang-markdown:** Official markdown language support
- **Ixora:** Extension pack — hidden marks, heading styles, link detection (active development)
- **ink-mde:** Full markdown editor with toolbar, themes, framework adapters (Vue, Svelte)
- **codemirror-rich-markdoc:** Rich editing via decorations (proof of concept, minimal maintenance)

What's missing:
- No @codemirror/table-editing
- No @codemirror/block-drag-and-drop
- No @codemirror/slash-commands
- No @codemirror/bubble-menu
- No @codemirror/lang-mdx

**Implications:** The CM6 markdown ecosystem is growing but doesn't match TipTap's extension breadth. The gap is widest for interactive/visual features (tables, drag-and-drop, floating menus). It's narrowest for text editing features (syntax highlighting, autocomplete, search).

---

## Summary: Effort comparison

| Path | Effort to MVP | Effort to full product | Source mode | WYSIWYG grade |
|------|--------------|----------------------|-------------|---------------|
| **TipTap (current)** | 2-4 weeks | 2-4 months | Hard (conversion problem) | Notion-grade |
| **CM6-only** | 1-2 weeks (text+preview) | 6-12 months (Notion-like) | Free (native) | Below Notion |
| **CM6 + decorations (Obsidian-like)** | 2-4 months (basic Live Preview) | 8-14 months (full) | Free (native) | Approaching Notion |
| **Hybrid (D11)** | 3-6 weeks | 4-6 months | Native | Notion-grade |

---

## Gaps / follow-ups

- Detailed LOC analysis of obsidian-block-drag-drop plugin to refine drag-and-drop effort estimate
- Whether Obsidian's internal CM6 extensions (proprietary) could be approximated by combining Ixora + ink-mde patterns
- Performance comparison: many CM6 widget decorations vs many TipTap ReactNodeViewRenderer instances
