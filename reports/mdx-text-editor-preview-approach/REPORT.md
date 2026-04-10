---
title: "MDX Text Editor + Live Preview: Architecture, Prior Art, and Comparison to WYSIWYG"
description: "Investigation of the 'text editor + live preview' approach to MDX editing as an alternative to WYSIWYG visual editing. Covers prior art, CodeMirror 6 for MDX, browser-side MDX compilation, the Obsidian Live Preview pattern, CRDT collaboration via y-codemirror.next, and comparison against TipTap/WYSIWYG. Extended with Path C analysis: CM6 decoration ceiling for Notion-grade WYSIWYG, what we'd lose dropping TipTap, what we'd gain going CM6-only, effort estimates, and a hybrid CM6+TipTap shared Y.Text option."
createdAt: 2026-04-03
updatedAt: 2026-04-07
subjects:
  - CodeMirror 6
  - MDX
  - Yjs
  - y-codemirror.next
  - Obsidian
  - HackMD
  - Liveblocks
  - MDXEditor
  - Mintlify
  - Vrite
  - TipTap
  - ProseMirror
  - BlockNote
  - Peritext
  - Gravity UI
topics:
  - MDX editing
  - live preview architecture
  - text CRDT collaboration
  - CodeMirror extensions
  - browser-side compilation
  - block editor architecture
  - editor migration tradeoffs
---

# MDX Text Editor + Live Preview: Architecture, Prior Art, and Comparison to WYSIWYG

**Purpose:** Evaluate whether a "text editor + live preview" approach is a viable and superior alternative to WYSIWYG for collaborative MDX editing. This report investigates the building blocks (CodeMirror 6, @mdx-js/mdx evaluate(), y-codemirror.next), existing implementations, the Obsidian-like inline rendering pattern, and how the architecture compares to the WYSIWYG approach investigated in the companion report (`mdx-crdt-roundtrip-fidelity`).

---

## Executive Summary

The text editor + live preview approach to MDX editing is not only viable but architecturally superior to the WYSIWYG approach for the near term. Where the WYSIWYG investigation found zero working implementations of the full MDX + CRDT chain and identified six blocking failure vectors across four conversion boundaries, the text editor approach reduces the problem to a single, well-solved boundary: MDX text stored as a Y.Text CRDT, compiled one-way for preview via `evaluate()`.

The building blocks are proven and actively maintained. CodeMirror 6 provides the text editing surface with markdown syntax support, extensible mixed-language parsing, and excellent mobile support. The `evaluate()` function from @mdx-js/mdx compiles and renders MDX entirely in the browser, enabling real-time preview with debouncing. y-codemirror.next (v0.3.5, maintained by the Yjs author) binds Y.Text to CodeMirror with remote cursors and per-user undo/redo. Liveblocks provides managed infrastructure for the Yjs transport layer.

The pattern has been demonstrated in the MDX.js playground (CodeMirror + evaluate()) and at scale for markdown by HackMD/HedgeDoc (CodeMirror + Socket.IO collaboration + split-pane preview). No production-grade, collaborative MDX text editor with live preview exists today, but building one requires assembling proven components rather than solving unsolved problems.

The primary gap is that CodeMirror 6 has no MDX language mode — JSX syntax inside markdown gets no highlighting. Building a custom MDX mode via CodeMirror's `parseMixed()` API is achievable but requires custom work. The Obsidian-like inline rendering pattern (render markdown visually while editing source, reveal source on cursor focus) has been demonstrated for Markdoc in CodeMirror 6 but not for MDX components.

The UX tradeoff is explicit: users must understand MDX syntax to edit, which is acceptable for developers and technical writers but not for non-technical knowledge workers. A four-stage progression path exists from pure text+preview through enhanced editing to Obsidian-like inline rendering to a full hybrid editor, allowing the product to ship immediately and evolve toward richer editing over time.

**Key Findings (original D1-D6):**

- **The MDX.js playground proves the pattern:** CodeMirror + `evaluate()` + preview panel works today, with the official MDX project as prior art.
- **y-codemirror.next eliminates all CRDT complexity from the WYSIWYG approach:** Text CRDT on MDX source has one conversion boundary (text to Y.Text) versus four in the WYSIWYG chain, with zero data loss risk.
- **CodeMirror 6 lacks an MDX language mode, but the building blocks exist:** `@codemirror/lang-markdown` + `@codemirror/lang-javascript` + `parseMixed()` can compose an MDX mode with moderate custom work.
- **Browser MDX compilation has known performance patterns:** `evaluate()` creates unstable component references requiring a function-call workaround, and debouncing is essential (200-500ms).
- **The Obsidian Live Preview pattern extends to MDX in principle, but no prior art exists:** Rendering React components as CodeMirror widget decorations inside an MDX document would be novel engineering.
- **A working prototype is days-to-weeks of effort, not months:** Assembling CodeMirror + evaluate() + y-codemirror.next + Liveblocks into a collaborative MDX editor uses proven, documented integration patterns.

**Key Findings (Path C extension: D7-D11 — "burn the boats" analysis):**

- **CM6 decorations have a structural ceiling for Notion-grade WYSIWYG:** Drag-and-drop blocks are achievable (proven by Obsidian community plugin), slash commands are straightforward (CM6 autocompletion API), but block-level selection and complex component editing remain fundamentally limited by CM6's text-buffer cursor model. React components can be rendered in CM6 widgets via `createRoot`/portals, but the integration is fragile compared to TipTap's ReactNodeViewRenderer.
- **Dropping TipTap loses ~70+ extensions and the entire block editing paradigm:** The critical losses are ProseMirror's structured document model (typed nodes, schema enforcement, block-level selection), ReactNodeViewRenderer for void nodes, DragHandle, TableKit, BubbleMenu, and the maintained y-tiptap Yjs binding. Every shipping Notion-like editor (BlockNote, Notion, Confluence) uses ProseMirror or equivalent — none uses CM6.
- **The primary gain is architectural: zero-conversion source toggle:** Y.Text as canonical CRDT means source mode and Live Preview are views of the same buffer (exactly Obsidian's architecture). File = CRDT content. Collaboration is simpler. Bundle is smaller. Mobile support is better. But these gains address the source toggle problem, not the WYSIWYG problem.
- **Full Notion-like features on CM6 would cost 6-12 months of custom engineering:** No prior art exists for Notion-grade block editing on CM6. Each feature (tables, drag-and-drop, component previews, formatting toolbar) requires building from scratch. Source mode is free, collaboration is easier, but everything visual/interactive is harder.
- **A hybrid option (CM6 source + TipTap WYSIWYG, shared Y.Text) is the most balanced path:** Y.Text canonical with CM6 for native source mode, TipTap for WYSIWYG via mode-switch conversion. Prior art exists (Yandex Gravity UI ships ProseMirror + CodeMirror dual-mode in production). The hard part is real-time cross-mode collaboration (one user in source, another in WYSIWYG).

---

## Research Rubric

**Report Type:** Technology Deep-Dive
**Primary Question:** Is "text editor + live preview" a viable and superior alternative to WYSIWYG for collaborative MDX editing, and what does the architecture look like?
**Audience:** Engineering team evaluating MDX editing approaches
**Stance:** Factual with conclusions

| # | Dimension | Facets | Depth | Priority |
|---|-----------|--------|-------|----------|
| D1 | Prior art — who has built MDX text editor + live preview | MDX Playground, Mintlify, Fumadocs, Docusaurus, HackMD/HedgeDoc, VS Code extensions, Storybook, Vrite, Dhub | Deep, Practical | P0 |
| D2 | CodeMirror for MDX editing | lang-markdown, mixed-language parsing, JSX support, React wrapper, MDX mode feasibility, CM vs Monaco | Deep, Primary source | P0 |
| D3 | Live preview rendering of MDX | evaluate() browser API, debounce strategy, component registry, error handling, incremental compilation | Deep, Mechanical | P0 |
| D4 | The Obsidian Live Preview pattern | CM6 decorations, cursor-aware rendering, applicability to MDX components | Moderate, Mechanical | P0 |
| D5 | CodeMirror + Yjs for CRDT collaboration | y-codemirror.next maturity, text vs block CRDT merge semantics, conversion boundary elimination | Deep, Comparative | P0 |
| D6 | Text editor + preview vs WYSIWYG comparison | Feature comparison, UX tradeoffs, architecture simplification, progression path | Synthesis | P0 |
| D7 | CM6 decoration ceiling: Notion-grade WYSIWYG? | React in widgets, block drag-drop, slash commands, table editing, inline component previews, cursor model limits | Deep | P0 |
| D8 | What we'd lose dropping TipTap | Extension ecosystem inventory, ProseMirror block model, ReactNodeViewRenderer, y-tiptap binding, rebuild cost | Deep | P0 |
| D9 | What we'd gain going CM6-only | Y.Text canonical, zero-conversion toggle, simpler CRDT, file=content, CM6 ecosystem | Deep | P0 |
| D10 | Effort estimate: CM6-only vs TipTap for full product | Feature-by-feature effort, prior art for Notion on CM6, CM6 markdown ecosystem maturity | Deep | P0 |
| D11 | Hybrid: CM6 source + TipTap WYSIWYG, shared Y.Text | Dual binding feasibility, Gravity UI prior art, Peritext/Loro, cross-mode collaboration | Moderate | P0 |

**Non-goals:** Implementing a working editor, designing UI/UX, choosing specific hosting infrastructure, evaluating non-CodeMirror editor options (Ace, Prism) in depth.

---

## Detailed Findings

### D1: Prior Art — Who Has Built MDX Text Editor + Live Preview

**Finding:** The text editor + live preview pattern for MDX exists in playground/demo form but not as a production-grade collaborative editor. The pattern is proven at scale for markdown by HackMD/HedgeDoc.

**Evidence:** [evidence/d1-prior-art.md](evidence/d1-prior-art.md)

The landscape splits into three categories:

**Pure text + preview (the target pattern):**
- The [MDX.js Playground](https://mdxjs.com/playground/) is the canonical implementation — CodeMirror editor on the left, rendered preview plus generated code and ASTs on the right. It compiles MDX in the browser via `evaluate()`. Known stability issue: the CodeMirror instance crashes sporadically (GitHub issue #1791).
- A [detailed tutorial](https://www.mdxblog.io/blog/building-a-live-mdx-playground-with-codemirror-and-nextjs) documents building the pattern with @uiw/react-codemirror + @codemirror/lang-markdown + @mdx-js/mdx in Next.js.
- [HackMD](https://hackmd.io) / [HedgeDoc](https://hedgedoc.org/) implement the split-pane pattern at scale for markdown with real-time collaboration via CodeMirror + Socket.IO. They do NOT support MDX.

**WYSIWYG with source escape hatch:**
- [MDXEditor](https://mdxeditor.dev/) provides WYSIWYG editing with a [@mdxeditor/source-preview-plugin](https://www.npmjs.com/package/@mdxeditor/source-preview-plugin) for toggling to a split-pane view. The source editor accepts a custom component (e.g., Monaco).
- [Mintlify](https://www.mintlify.com/docs/editor) offers visual and Markdown editing modes with AI-assisted MDX error correction.
- [Vrite](https://vrite.io/blog/wysiwyg-for-mdx-introducing-vrite-s-hybrid-editor/) built a ProseMirror/TipTap-based hybrid with "Element" blocks for JSX components — partial MDX support with limitations (no expression props, no inline elements).
- [Dhub](https://dhub.dev/) provides Notion-like WYSIWYG for MDX with two-way GitHub sync.

**IDE + dev server preview (code-only):**
- Fumadocs and Docusaurus: edit MDX in VS Code, preview via `npm run dev` + HMR. No web-based editor.
- VS Code extensions: [MDX Preview](https://marketplace.visualstudio.com/items?itemName=xyc.vscode-mdx-preview) provides side-by-side preview. [Docusaurus MDX Previewer](https://github.com/mileskies/Docusaurus-MDX-VSCode-Previewer) targets Docusaurus files specifically.

**Implications:** The gap is clear — nobody has built a production-grade, collaborative MDX text editor with live preview. The building blocks exist (MDX Playground proves the compile + preview, HackMD proves collaborative text editing at scale), but the combination has not been assembled.

### D2: CodeMirror for MDX Editing

**Finding:** CodeMirror 6 is the right editor for MDX, but it lacks a dedicated MDX language mode. Building one is achievable via the `parseMixed()` mixed-language API, composing existing markdown and JavaScript/JSX parsers.

**Evidence:** [evidence/d2-codemirror-mdx.md](evidence/d2-codemirror-mdx.md)

**What exists today:**
- `@codemirror/lang-markdown` provides CommonMark syntax highlighting with `codeLanguages` option for nested syntax in fenced code blocks (```jsx, ```typescript etc.)
- `@codemirror/lang-javascript` supports JSX through configuration options
- `parseMixed()` API enables composite languages where an outer parser delegates to inner parsers for specific regions (documented for HTML + JavaScript, applicable to markdown + JSX)
- `@uiw/react-codemirror` provides the React wrapper (14.2k GitHub stars)

**What does NOT exist:**
- No `@codemirror/lang-mdx` package
- No community MDX language mode published to npm
- The CodeMirror forum has an unanswered December 2024 post asking about MDX highlighting

**Building an MDX language mode:**
The approach would compose existing parsers via `parseMixed()`:
1. Use `@codemirror/lang-markdown` as the outer parser
2. Identify JSX block regions (lines starting with `<ComponentName`) and delegate to the JavaScript/JSX parser
3. Handle import/export statements at the top of the file as JavaScript regions
4. Handle `{expression}` syntax as JavaScript regions

This is conceptually similar to how HTML+JavaScript mixed parsing works. The parser boundaries are well-defined. Estimated complexity: moderate — a few hundred lines of custom integration code.

**CodeMirror vs Monaco for MDX:**

| Dimension | CodeMirror 6 | Monaco |
|-----------|-------------|--------|
| Bundle size | ~300KB core (modular) | 5-10MB |
| Mobile support | Excellent (primary CM6 motivation) | Poor |
| Markdown support | @codemirror/lang-markdown | None built-in |
| Yjs integration | y-codemirror.next (maintained) | y-monaco (less mature) |
| Customization | Modular extension architecture | Full IDE, less modular |

CodeMirror is the clear choice for MDX: smaller bundle, markdown support, better Yjs integration, superior mobile support.

**The codemirror-rich-markdoc proof-of-concept:** [This plugin](https://github.com/segphault/codemirror-rich-markdoc) demonstrates the Obsidian-like inline rendering pattern in CodeMirror 6 for Markdoc (a markdown variant with custom tags). It uses CM6's decoration system to hide markdown syntax and render rich output, revealing source on cursor focus. Only 3 commits and minimally maintained, but it validates the pattern is possible for markup languages with custom components.

### D3: Live Preview Rendering of MDX

**Finding:** Browser-side MDX compilation via `evaluate()` is proven and workable for live preview, with well-documented performance patterns and error handling strategies. The key optimization is debouncing + calling MDXContent as a function rather than a component.

**Evidence:** [evidence/d3-live-preview-rendering.md](evidence/d3-live-preview-rendering.md)

**The compilation pipeline:**

```
User types in CodeMirror
         |
         v
   Debounce (200-500ms)
         |
         v
  evaluate(source, { runtime, components })
         |
    ┌────┴────┐
    |         |
  Success   Error
    |         |
    v         v
 MDXContent()  Show error + keep last render
    |
    v
 React renders preview panel
```

**Critical performance detail:** Each call to `evaluate()` creates a new function definition for `MDXContent`. React treats different function types as different component trees, causing full unmount + remount on every compilation. The [documented workaround](https://mdxjs.com/packages/mdx/): call `MDXContent(props)` as a function instead of rendering `<MDXContent />` as a component. The returned React elements (div, p, h1 etc.) are stable types and CAN be diffed by React's reconciler.

**No incremental compilation:** MDX compilation is all-or-nothing — the entire document is recompiled on every change. The unified pipeline (parse, transform, stringify) processes the full document. For live preview, this means debounce + full recompile. Performance depends on document size and plugin count.

**Custom component rendering:** The preview panel must know about custom components. Two approaches: pass via `components` prop on MDXContent, or use MDXProvider context. Components imported via `import` statements in MDX cannot be resolved in browser compilation (no module resolution), but components in a pre-registered registry work. For documentation systems, the component set is known at build time and can be bundled into the preview panel.

**Error handling strategy:**
1. Wrap `evaluate()` in try/catch — MDX compiler throws on syntax errors with line/column positions
2. Use React error boundaries for runtime errors (undefined components, etc.)
3. Show last successfully rendered preview while the document has errors
4. Display error messages in a status bar or overlay

**Browser compilation limitations:**
- No `import` resolution (components must be pre-registered)
- No bundler plugins (image optimization, CSS modules)
- Bundle size overhead: @mdx-js/mdx brings unified/remark/rehype/acorn to the client
- Sub-second compilation for typical documents, but scales with document size and plugin count

### D4: The Obsidian Live Preview Pattern

**Finding:** The Obsidian Live Preview pattern (inline rendering of markdown while editing source, with cursor-aware reveal of syntax) is built on CodeMirror 6 decorations and is applicable to MDX in principle. For standard markdown elements, it is well-understood. For MDX components, it is theoretically possible but would be novel engineering with no prior art.

**Evidence:** [evidence/d4-obsidian-live-preview.md](evidence/d4-obsidian-live-preview.md)

**How Obsidian does it:**
1. The source text is always the document model — users edit raw markdown
2. CodeMirror 6 decorations (mark, widget, replace) overlay visual rendering on top of source text
3. When the cursor is NOT on a syntax region (e.g., `##` for headings), decorations hide the syntax and style the text as rendered
4. When the cursor enters a region, decorations are removed, revealing source

Three CM6 decoration types power this:
- **Mark decorations:** Apply CSS classes to ranges (heading sizes, bold, italic)
- **Widget decorations:** Insert arbitrary DOM at positions (image previews, embeds)
- **Replace decorations:** Swap source text ranges with rendered widgets

**Applicability to MDX:**

| Content type | Inline rendering feasibility | Complexity |
|---|---|---|
| Standard markdown (headings, bold, links) | Proven (Obsidian, HyperMD, codemirror-rich-markdoc) | Low |
| Images | Proven (Obsidian renders images inline) | Low |
| Self-closing components (`<Alert type="warning" />`) | Possible — render a compact preview widget | Moderate |
| Wrapper components with children | Hard — need to render children as markdown inside a component frame | High |
| Components with expression props | Hard — need to evaluate expressions for preview | High |
| Import/export statements | Simple — just syntax highlighting, no visual preview needed | Low |

**A practical hybrid for MDX:**
Rather than attempting full inline rendering of all MDX constructs, a staged approach:
- Standard markdown: full Obsidian-like rendering
- Simple self-closing components: icon + name + key props as compact preview
- Complex components with children: source with syntax highlighting, render only in the side-by-side panel

The [codemirror-rich-markdoc](https://github.com/segphault/codemirror-rich-markdoc) plugin proves this hybrid pattern for Markdoc custom tags (similar to MDX components). When the cursor enters a rendered block, the widget disappears and source is revealed. Limitations include cursor positioning bugs and performance (recomputes on every operation).

**Key insight:** The inline rendering pattern is an enhancement layer on top of the text editor, not a replacement for the side-by-side preview. The progression is: start with text+preview (Stage 1), add markdown inline rendering (Stage 3), add component preview widgets (Stage 4).

### D5: CodeMirror + Yjs for CRDT Collaboration

**Finding:** y-codemirror.next is actively maintained, production-grade, and eliminates ALL the CRDT complexity identified in the WYSIWYG investigation. Text-level CRDT on MDX source operates at a single conversion boundary (text to Y.Text) versus four in the WYSIWYG chain, with zero data loss risk and well-understood merge semantics.

**Evidence:** [evidence/d5-codemirror-yjs-crdt.md](evidence/d5-codemirror-yjs-crdt.md)

**y-codemirror.next status:**
- Version 0.3.5 (June 2024), 17 releases, 198 GitHub stars
- Maintained by Kevin Jahns (Yjs creator)
- 8 open issues (compare: slate-yjs has 20+ open issues including crashes)
- MIT licensed
- Provides: editor sync, remote cursor rendering, per-user undo/redo

The integration is straightforward:
```javascript
import { yCollab } from 'y-codemirror.next'
const ytext = ydoc.getText('codemirror')
const extensions = [yCollab(ytext, awareness)]
```

**Text CRDT eliminates conversion boundaries:**

The WYSIWYG approach required four boundaries:
```
MDX text ↔ MDAST ↔ Editor blocks ↔ Yjs types
```

The text editor approach has one:
```
MDX text ↔ Y.Text
```

Y.Text IS the MDX source text. No conversion occurs at the CRDT layer. This eliminates:
- MDAST conversion failures
- Editor block conversion (JSX destruction at B2)
- The session boundary tension (Yjs state vs MDX file)
- Indentation drift through serialize/deserialize
- Expression prop loss
- Component registration requirements for the editor (only needed for preview)

**Text CRDT merge semantics are simple and developer-friendly:**
- Character-level operations with stable position identifiers
- Concurrent edits at different positions: both preserved, no conflict
- Concurrent edits at the same position: characters interleave
- Delete + edit on same region: delete wins (edit lost) — same as Git

The tradeoff: concurrent edits can produce temporarily invalid MDX syntax (e.g., two users editing the same JSX tag simultaneously). The preview panel handles this gracefully — show the last valid render, display compilation error, update when the syntax becomes valid again.

**Production infrastructure via Liveblocks:**
[Liveblocks](https://liveblocks.io/docs/guides/how-to-create-a-collaborative-code-editor-with-codemirror-yjs-nextjs-and-liveblocks) provides managed Yjs backend with WebSocket infrastructure, dashboard, webhooks, REST API, and DevTools. Works directly with y-codemirror.next. Supports React, Vue, Svelte, vanilla JS. This eliminates the need to build sync infrastructure.

### D6: Text Editor + Preview vs WYSIWYG — Comprehensive Comparison

**Finding:** The text editor approach is architecturally simpler, immediately buildable, preserves full source fidelity, and supports collaboration via proven components. The WYSIWYG approach offers a more accessible UX for non-technical users but requires solving multiple unsolved engineering problems. A progression path from text+preview to hybrid editing bridges the gap over time.

**Evidence:** [evidence/d6-text-editor-vs-wysiwyg.md](evidence/d6-text-editor-vs-wysiwyg.md)

**Architecture comparison:**

```
WYSIWYG Approach (4 conversion boundaries, 3-6 months):

  MDX File ──B1──► MDAST ──B2──► Editor Blocks ──B3──► Yjs
                                       ↕
                                  Visual Editor
                                       ↕
  MDX File ◄──B1── MDAST ◄──B2── Editor Blocks ◄──B3── Yjs

  Failure vectors: B2 destroys JSX, B3 binding abandoned,
  B1 has drift bug, session boundary tension, no prior art


Text Editor + Preview Approach (1 boundary, days-weeks):

  MDX File ──────► Y.Text (CRDT) ──────► CodeMirror Editor
                       |
                       ├── evaluate() ──► Preview Panel
                       |
                       └── toText() ──► Git / File System

  Zero conversion boundaries for editing.
  One-way compilation for preview (well-solved).
```

**Feature comparison:**

| Capability | WYSIWYG | Text + Preview |
|---|---|---|
| Non-technical users can edit | Yes | No |
| Expression props preserved | No | Yes |
| Import statements preserved | No | Yes |
| Source fidelity (round-trip) | Unproven | Perfect |
| Time to working prototype | 3-6 months | Days-weeks |
| CRDT collaboration | Novel engineering | Proven stack |
| Mobile editing | Complex | Excellent (CM6) |
| Git diff readability | Depends on serializer | Perfect |
| Error recovery | Silent data loss | Syntax error shown |
| Find and replace | Block-level | Text-level (exact) |

**The progression path:**

| Stage | Description | Effort | Value |
|---|---|---|---|
| 1 | Pure text + side-by-side preview | Days-weeks | Collaborative MDX editing ships |
| 2 | Enhanced text editing (MDX highlighting, autocomplete, error markers) | Weeks-months | Developer experience improves significantly |
| 3 | Obsidian-like inline rendering for standard markdown | Months | Markdown looks rendered while editing |
| 4 | Component preview widgets + property panel + slash commands | Months+ | Approaches hybrid editing |

Each stage is independently valuable and shippable. Stage 1 solves the immediate problem. Stage 3-4 progressively addresses the non-technical user gap without requiring the WYSIWYG architecture.

**Audience fit:**
- **Developers (primary docs audience):** Text+preview is the norm (VS Code, terminals, markdown editors). No UX barrier.
- **Technical writers:** Already use markdown-based tools. Text+preview is familiar from HackMD, Notion markdown mode, etc.
- **Non-technical knowledge workers:** Need WYSIWYG. The progression path addresses this over time, but Stage 1-2 will not serve them.

### D7: CM6 Decoration Ceiling — Can It Deliver Notion-Grade WYSIWYG?

**Finding:** CM6 decorations can deliver Obsidian-grade Live Preview (rich rendering with cursor-aware syntax reveal) and basic block operations (drag-and-drop, slash commands), but they cannot deliver Notion-grade WYSIWYG due to a fundamental architectural constraint: CM6's document model is a flat text buffer with a character cursor, not a tree of typed blocks.

**Evidence:** [evidence/d7-cm6-decoration-ceiling.md](evidence/d7-cm6-decoration-ceiling.md)

**What CM6 decorations CAN do (proven):**
- Hide markdown syntax and render styled output (Obsidian Live Preview, Ixora, codemirror-rich-markdoc)
- Render React components inside widget decorations via `ReactDOM.createRoot()` or React Portals (CM6 forum, multiple implementations)
- Block-level drag-and-drop with grip handles, ghost preview, and multi-block selection ([obsidian-block-drag-drop](https://github.com/wepee/obsidian-block-drag-drop) plugin — supports paragraphs, headings, lists, code blocks, tables, callouts, blockquotes)
- Slash commands via CM6's built-in autocompletion API (custom completion source on "/" trigger)
- Table rendering as block widgets (Joplin Rich Tables plugin, codemirror-rich-markdoc)

**What CM6 decorations CANNOT do natively:**
- **Block-level selection:** CM6 selects text ranges, not structural nodes. You can overlay a visual "block selection" but the underlying model remains character-based.
- **Seamless WYSIWYG editing without syntax reveal:** The cursor entering a decorated region reveals source syntax. Obsidian users explicitly complain about "expanding and collapsing markups like \*\*bold\*\* is disrupting" during cursor movement.
- **Nested editable content inside components:** TipTap's NodeViewContent creates a nested ProseMirror editor inside a component frame. CM6 would require nested editor instances inside widget decorations — possible but significantly more complex.
- **Schema enforcement:** CM6 cannot prevent users from typing structurally invalid content. ProseMirror rejects operations that would violate the document schema.

**React components in CM6 widgets:** Technically achievable via two approaches — (1) create an empty DOM container in `toDOM()`, render via React Portal, or (2) use `ReactDOM.createRoot(dom)` inside `toDOM()`. The CM6 maintainer (Marijn Haverbeke) cautioned this introduces "extra indirection and inefficiency." DOM reconciliation conflicts between CM6 and React have been reported. This contrasts with TipTap's ReactNodeViewRenderer, which integrates React into ProseMirror's update cycle.

**Implications:** The ceiling is "very good markdown editing with visual enhancements," not "Notion." For a product that needs both Cursor-grade source editing and Notion-grade WYSIWYG in one editor, CM6-only can deliver the Cursor side natively but reaches diminishing returns on the Notion side.

**Decision triggers:**
- If the product prioritizes source editing and treats WYSIWYG as "nice to have," CM6-only is viable
- If the product requires Notion-grade block editing for non-technical users, CM6-only will fall short

### D8: What We'd Lose Dropping TipTap

**Finding:** Dropping TipTap means losing ~70+ extensions, the entire ProseMirror block editing paradigm, and alignment with the industry standard for Notion-like editors. Every shipping Notion-style block editor (BlockNote, Notion, Confluence, Google Docs) uses ProseMirror, Slate, or a custom engine — none uses CM6.

**Evidence:** [evidence/d8-what-wed-lose-dropping-tiptap.md](evidence/d8-what-wed-lose-dropping-tiptap.md)

**Critical losses for our product:**

| Lost capability | Impact | CM6 replacement cost |
|---|---|---|
| ProseMirror block model (typed nodes, schema, block selection) | Fundamental — changes how the editor thinks about content | Not replaceable; CM6 is text-based by design |
| ReactNodeViewRenderer (void/atom nodes as React components) | Our Callout node, embeds, custom blocks | Widget decorations + React portals (fragile) |
| ~70+ TipTap extensions | Months of saved engineering | Rebuild each feature individually |
| DragHandle + DragContextMenu | Block reordering, block type transformation | 3-6 weeks custom (obsidian-block-drag-drop as reference) |
| TableKit | Table create, resize, merge/split, column/row ops | 4-8 weeks custom (no reusable CM6 package) |
| BubbleMenu + FloatingMenu | Context-aware floating UIs on selection | 2-3 weeks custom |
| @tiptap/y-tiptap | Maintained Y.XmlFragment Yjs binding | y-codemirror.next (Y.Text) — different type but well-maintained |
| @tiptap/extension-collaboration-cursor | Remote cursor rendering | y-codemirror.next awareness (built-in, simpler) |
| Link extension with editing UI | Click-to-edit links, paste detection | 1-2 weeks custom |
| Placeholder extension | Empty editor hint text | CM6 placeholder exists (trivial) |

**Industry alignment:** [Liveblocks' 2025 editor comparison](https://liveblocks.io/blog/which-rich-text-editor-framework-should-you-choose-in-2025) recommends ProseMirror/TipTap or Slate for content editors and does not discuss CM6 as an option for WYSIWYG editing. BlockNote (the leading open-source Notion-style editor) is built on ProseMirror + TipTap.

### D9: What We'd Gain Going CM6-Only

**Finding:** The primary gain is architectural: zero-conversion source toggle, Y.Text as canonical CRDT, and file = CRDT content. These gains directly solve the source toggle problem that motivates the investigation but do not help with WYSIWYG quality.

**Evidence:** [evidence/d9-what-wed-gain-cm6-only.md](evidence/d9-what-wed-gain-cm6-only.md)

**Architectural gains:**

1. **Zero-conversion source toggle:** Source and Live Preview are views of the same Y.Text buffer. Toggle = swap decoration set. Instant, lossless, cursor-preserving. This is exactly Obsidian's architecture.

2. **Y.Text canonical CRDT:** One shared type, character-level operations. Compare: Y.XmlFragment requires tree operations, schema-aware merging. Debugging collaborative editing is simpler — "characters interleave" versus "tree merge with schema validation."

3. **File = CRDT content:** `ytext.toString()` produces the markdown file. `ytext.insert(0, fileContent)` loads it. No prosemirrorJSONToYDoc() / yDocToProsemirrorJSON() conversion. Git diffs, MCP file tools, and file system operations work directly.

4. **Native source editing:** All text editor features (find-and-replace, regex, vim mode, multi-cursor, line numbers) work natively because the document IS text. In TipTap, these features require either dropping to a source view (conversion cost) or reimplementing on the block model.

5. **Smaller bundle:** CM6 core ~300KB (modular). TipTap + ProseMirror + extensions is larger (varies by extension set).

6. **Better mobile support:** CM6 was designed mobile-first (primary motivation for the v5 to v6 rewrite). TipTap/ProseMirror mobile support has known limitations.

7. **Proven at scale:** Obsidian uses exactly this architecture with millions of users.

**The tradeoff is explicit:** These gains solve the "Cursor" half of "Notion + Cursor." They do not help with the "Notion" half.

### D10: Effort Estimate — CM6-Only vs TipTap for Full Product

**Finding:** Building full Notion-like features on CM6 would cost an estimated 6-12 months of custom engineering, with no prior art for Notion-grade block editing on CM6. Source mode is free (the primary advantage), collaboration is easier, but every visual/interactive feature requires building from scratch.

**Evidence:** [evidence/d10-effort-estimate-cm6-vs-tiptap.md](evidence/d10-effort-estimate-cm6-vs-tiptap.md)

**Feature-by-feature effort comparison:**

| Feature | With TipTap | CM6-only effort |
|---------|------------|-----------------|
| Slash commands | Built-in | 1-2 weeks |
| Block drag-and-drop | DragHandle extension | 3-6 weeks |
| Table editing | TableKit | 4-8 weeks |
| React component blocks | ReactNodeViewRenderer | 2-4 weeks per type |
| Inline formatting toolbar | BubbleMenu | 2-3 weeks |
| Link editing UI | Link extension | 1-2 weeks |
| Image upload + preview | Image extension | 2-3 weeks |
| Block-level selection | Native | 3-4 weeks |
| Markdown inline rendering | N/A (is WYSIWYG) | 4-8 weeks |
| Source mode | Hard (conversion) | Free (native) |
| Collaboration + cursors | y-tiptap + CollabCursor | y-codemirror.next (easier) |

**Path comparison:**

| Path | To MVP | To full product | Source mode | WYSIWYG grade |
|------|--------|----------------|-------------|---------------|
| TipTap (current) | 2-4 weeks | 2-4 months | Hard | Notion-grade |
| CM6-only text+preview | 1-2 weeks | N/A (no WYSIWYG) | Free | None (preview panel only) |
| CM6 + Live Preview decorations | 2-4 months | 8-14 months | Free | Approaching Notion |
| Hybrid CM6+TipTap (D11) | 3-6 weeks | 4-6 months | Native | Notion-grade |

**CM6 markdown ecosystem maturity:** Growing but incomplete. Available: [@lezer/markdown](https://www.npmjs.com/package/@lezer/markdown) (extensible parser), @codemirror/lang-markdown, [Ixora](https://codeberg.org/retronav/ixora) (decoration enhancements), [ink-mde](https://github.com/davidmyersdev/ink-mde) (full editor). Missing: table editing package, block drag-and-drop package, slash command package, bubble menu package, MDX language mode.

**Prior art assessment:** No production Notion-grade block editor exists on CM6. All are on ProseMirror (BlockNote, Confluence), Slate (Yoopta), or custom engines (Notion, Google Docs).

### D11: Hybrid Option — CM6 Source + TipTap WYSIWYG, Shared Y.Text

**Finding:** A hybrid architecture with Y.Text as canonical, CM6 for source mode (native binding), and TipTap for WYSIWYG mode (via markdown-to-ProseMirror conversion at mode switch) is the most balanced option. Direct prior art exists: Yandex's [Gravity UI markdown editor](https://github.com/gravity-ui/markdown-editor) ships ProseMirror + CodeMirror dual-mode in production. The hard engineering challenge is real-time cross-mode collaboration.

**Evidence:** [evidence/d11-hybrid-cm6-tiptap-shared-ytext.md](evidence/d11-hybrid-cm6-tiptap-shared-ytext.md)

**The fundamental constraint:** y-prosemirror binds to Y.XmlFragment (tree). y-codemirror.next binds to Y.Text (flat string). These are different Yjs shared types. They cannot share the same key in a Y.Doc. A hybrid requires either a synchronization layer between the two types, or a custom Y.Text-to-ProseMirror binding.

**Practical hybrid architecture:**

```
Y.Text (canonical CRDT)
    |
    ├── Source mode: CM6 + y-codemirror.next (direct binding, zero conversion)
    |
    └── WYSIWYG mode: Parse Y.Text → ProseMirror doc (on mode switch)
                       ProseMirror edits → serialize to markdown → Y.Text ops
```

**Mode-switch conversion:** Each element needs three specs (Gravity UI pattern): ProseMirror node/mark spec, fromMd (markdown-it parser rule), toMd (serializer). This is the same bidirectional conversion as the WYSIWYG-only approach, but with a critical difference: Y.Text is canonical, so conversion errors affect WYSIWYG display, not data integrity.

**Collaboration scenarios:**

| Scenario | Feasibility | Complexity |
|----------|------------|------------|
| All users in source mode | Proven (y-codemirror.next) | Minimal |
| All users in WYSIWYG mode | Feasible (custom Y.Text-to-PM sync) | Moderate |
| Mixed: some source, some WYSIWYG | Possible (real-time bidirectional sync pipeline) | High |
| Pragmatic: lock to single mode during collab | Simple | Minimal |

**Relation to Peritext:** Y.Text already supports inline formatting via `format(index, length, attributes)`. This is a Peritext-like mechanism for storing marks alongside text. A custom Y.Text-to-ProseMirror binding could use Y.Text formatting attributes for marks and parse text structure for blocks. This would eliminate the mode-switch conversion for inline formatting (bold, italic, links) while still requiring structural conversion for blocks. No production implementation of this approach exists.

**Implications:**
- The hybrid gets source mode for free (CM6 + Y.Text — native, proven)
- The hybrid gets WYSIWYG at "manageable cost" (TipTap + mode-switch conversion — Gravity UI proves the pattern)
- The hard part is simultaneous cross-mode collaboration — pragmatically solvable by locking to a single mode during collaboration sessions
- This preserves the option to evolve: start with mode-switch, add real-time cross-mode sync later

**Decision triggers:**
- If cross-mode collaboration (one user in source, another in WYSIWYG, same document) is required from day one, the hybrid is hard
- If mode-switch with "all users see same mode" is acceptable, the hybrid is pragmatic and delivers both Cursor and Notion grade editing

---

## Limitations & Open Questions

### Dimensions Not Fully Covered

- **MDX compilation benchmarks:** Specific millisecond-per-KB timing for browser-side evaluate() was not found in public sources. Performance is described qualitatively as "sub-second for typical documents" with debouncing as the primary mitigation.
- **MDX.js playground source code:** The exact editor component source was not accessible (file path has changed in the repository). The implementation was characterized from the tutorial and MDX documentation, not from direct code review.
- **Obsidian Live Preview internals:** The Obsidian source is proprietary. Implementation details are inferred from plugin development patterns and community documentation.
- **CM6 widget decoration performance at scale:** No benchmarks were found for rendering 100+ React components via widget decorations in a single CM6 document. Performance implications for long documents with many component blocks remain uncertain.
- **Y.Text-to-ProseMirror custom binding:** The hybrid option (D11) proposes a binding that does not exist. Effort estimates for building it are inferred from the Gravity UI pattern, not from direct implementation experience.
- **Cross-mode collaboration specifics:** The real-time bidirectional sync pipeline for simultaneous source and WYSIWYG editing is described at architecture level. Implementation complexity details (conflict resolution, cursor mapping across modes) were not investigated in depth.

### Out of Scope (per Rubric)

- UI/UX design for the editor and preview panel
- Hosting infrastructure selection (Liveblocks vs self-hosted Hocuspocus vs other)
- Non-CodeMirror editors (Ace, Prism) — CodeMirror 6 was assessed as the clear choice and alternatives were not evaluated in depth
- Build-time MDX compilation performance (only browser-side compilation was investigated)

---

## References

### Evidence Files
- [evidence/d1-prior-art.md](evidence/d1-prior-art.md) — Landscape of existing MDX editing tools and patterns
- [evidence/d2-codemirror-mdx.md](evidence/d2-codemirror-mdx.md) — CodeMirror 6 MDX editing capabilities and gaps
- [evidence/d3-live-preview-rendering.md](evidence/d3-live-preview-rendering.md) — Browser-side MDX compilation and rendering pipeline
- [evidence/d4-obsidian-live-preview.md](evidence/d4-obsidian-live-preview.md) — Obsidian's inline rendering pattern and MDX applicability
- [evidence/d5-codemirror-yjs-crdt.md](evidence/d5-codemirror-yjs-crdt.md) — y-codemirror.next maturity and text CRDT advantages
- [evidence/d6-text-editor-vs-wysiwyg.md](evidence/d6-text-editor-vs-wysiwyg.md) — Structured comparison of both approaches
- [evidence/d7-cm6-decoration-ceiling.md](evidence/d7-cm6-decoration-ceiling.md) — CM6 decoration ceiling for Notion-grade WYSIWYG
- [evidence/d8-what-wed-lose-dropping-tiptap.md](evidence/d8-what-wed-lose-dropping-tiptap.md) — TipTap ecosystem inventory and rebuild cost
- [evidence/d9-what-wed-gain-cm6-only.md](evidence/d9-what-wed-gain-cm6-only.md) — Architectural advantages of text-canonical CM6-only
- [evidence/d10-effort-estimate-cm6-vs-tiptap.md](evidence/d10-effort-estimate-cm6-vs-tiptap.md) — Feature-by-feature effort comparison
- [evidence/d11-hybrid-cm6-tiptap-shared-ytext.md](evidence/d11-hybrid-cm6-tiptap-shared-ytext.md) — Hybrid dual-editor architecture with shared Y.Text

### External Sources
- [MDX.js Playground](https://mdxjs.com/playground/) — Official MDX text editor + preview
- [@mdx-js/mdx](https://mdxjs.com/packages/mdx/) — MDX compiler with evaluate() API
- [y-codemirror.next](https://github.com/yjs/y-codemirror.next) — CodeMirror 6 + Yjs binding
- [@codemirror/lang-markdown](https://github.com/codemirror/lang-markdown) — CodeMirror 6 markdown support
- [CodeMirror mixed-language parsing](https://codemirror.net/examples/mixed-language/) — parseMixed() API documentation
- [Liveblocks CodeMirror guide](https://liveblocks.io/docs/guides/how-to-create-a-collaborative-code-editor-with-codemirror-yjs-nextjs-and-liveblocks) — Production collaborative CodeMirror setup
- [codemirror-rich-markdoc](https://github.com/segphault/codemirror-rich-markdoc) — Obsidian-like inline rendering for CM6
- [HedgeDoc](https://hedgedoc.org/) — Open-source collaborative markdown with split-pane preview
- [Vrite hybrid editor](https://vrite.io/blog/wysiwyg-for-mdx-introducing-vrite-s-hybrid-editor/) — ProseMirror-based MDX hybrid
- [@mdxeditor/source-preview-plugin](https://www.npmjs.com/package/@mdxeditor/source-preview-plugin) — MDXEditor split-pane source view
- [MDX evaluate() performance discussion](https://github.com/mdx-js/mdx/issues/1655) — React reconciliation issue with evaluate()
- [CM6 forum: React in decorations](https://discuss.codemirror.net/t/rendering-react-components-or-similar-in-decoration-todom/3492) — Approaches for rendering React components in CM6 widget decorations
- [obsidian-block-drag-drop](https://github.com/wepee/obsidian-block-drag-drop) — Notion-style block drag-and-drop on CM6 (MIT, TypeScript)
- [TipTap Extensions Overview](https://tiptap.dev/docs/editor/extensions/overview) — Full catalogue of ~70+ TipTap extensions
- [Gravity UI Markdown Editor](https://github.com/gravity-ui/markdown-editor) — Yandex dual-mode editor (ProseMirror + CodeMirror) in production
- [Liveblocks editor comparison 2025](https://liveblocks.io/blog/which-rich-text-editor-framework-should-you-choose-in-2025) — Framework comparison for rich text editors
- [BlockNote](https://www.blocknotejs.org/) — Notion-style block editor on ProseMirror + TipTap
- [Ixora](https://codeberg.org/retronav/ixora) — CM6 extension pack for interactive markdown editing
- [ink-mde](https://github.com/davidmyersdev/ink-mde) — CM6-powered markdown editor (TypeScript)
- [Peritext](https://www.inkandswitch.com/peritext/) — CRDT for collaborative rich text editing (Ink & Switch)
- [Loro Rich Text CRDT](https://loro.dev/blog/loro-richtext) — Peritext implementation with style anchors
- [Obsidian full WYSIWYG request](https://forum.obsidian.md/t/the-fourth-editing-mode-full-wysiwyg-mode/64015) — User discussion on Live Preview limitations vs full WYSIWYG
- [y-prosemirror](https://github.com/yjs/y-prosemirror) — ProseMirror + Yjs binding (Y.XmlFragment)
- [@tiptap/y-tiptap](https://github.com/ueberdosis/y-tiptap) — TipTap-specific Yjs binding

### Related Research
- [mdx-crdt-roundtrip-fidelity](../mdx-crdt-roundtrip-fidelity/) — Companion report investigating the WYSIWYG approach. Found zero working implementations of the full MDX + CRDT chain and six blocking failure vectors.
- [crdt-mcp-filesystem-bridge](../crdt-mcp-filesystem-bridge/) — MCP filesystem translation layer design for CRDT-backed editing.
- [rich-inline-text-editing](../rich-inline-text-editing/) — How visual editors handle inline text editing with round-trip to JSX.
- [fumadocs-vs-mintlify-architecture](../fumadocs-vs-mintlify-architecture/) — Comparative analysis including editor experience and MDX parsing pipelines.
