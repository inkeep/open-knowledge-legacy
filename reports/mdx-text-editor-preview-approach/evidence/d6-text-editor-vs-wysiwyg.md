# Evidence: D6 — Text Editor + Preview vs WYSIWYG for MDX

**Dimension:** Comparative analysis — what you gain and lose with each approach
**Date:** 2026-04-03
**Sources:** Synthesis across D1-D5 findings, mdx-crdt-roundtrip-fidelity report, prior visual editor research

---

## Key sources referenced

- /Users/edwingomezcuellar/reports/mdx-crdt-roundtrip-fidelity/REPORT.md — WYSIWYG investigation findings
- D1-D5 evidence files in this report
- https://vrite.io/blog/wysiwyg-for-mdx-introducing-vrite-s-hybrid-editor/ — Vrite hybrid approach
- https://mdxeditor.dev/ — MDXEditor WYSIWYG

---

## Findings

### Finding: The text editor approach eliminates the architectural complexity that makes WYSIWYG infeasible
**Confidence:** CONFIRMED
**Evidence:** Comparative analysis of conversion boundaries

WYSIWYG for MDX requires solving four conversion boundaries (MDX↔MDAST↔editor blocks↔Yjs), each with failure modes. The text editor approach requires solving zero conversion boundaries for editing and storage — the MDX text IS the data model. Compilation for preview is one-way (text → rendered), which is a well-solved problem (@mdx-js/mdx evaluate()).

What the text editor approach eliminates:
1. **MDAST-to-editor block conversion** — the primary failure point from WYSIWYG investigation
2. **JSX component registration requirement** — no schema needed for the editor, only for preview
3. **Expression prop handling** — text preserves everything; only preview needs to evaluate
4. **Indentation drift** — text stored as-is, no serialize/deserialize cycle for storage
5. **Abandoned CRDT bindings** — y-codemirror.next is maintained; slate-yjs is not
6. **Round-trip fidelity** — perfect by construction; the CRDT IS the file

### Finding: The UX tradeoff is real but acceptable for the target audience
**Confidence:** INFERRED
**Evidence:** HackMD/HedgeDoc adoption, developer tool patterns

The text editor + preview approach requires users to understand MDX syntax:
- They must know that `## Heading` creates a heading
- They must know that `<Card title="foo">` creates a Card component
- They must manually type props and attributes

This is NOT acceptable for knowledge workers who expect Google Docs-like editing. It IS acceptable for:
- **Developers** (primary audience for documentation tools) — they edit code all day
- **Technical writers** who know markdown — they already use text-based tools
- **Documentation teams** — they use VS Code, Git, and markdown natively

Evidence: HackMD has millions of users with its text editor + preview pattern for markdown. Developer-focused documentation tools (Fumadocs, Docusaurus) are code-only with dev server preview. The "text + preview" pattern is the default in the developer tools ecosystem.

### Finding: The text editor approach maps to the same architecture OpenDesign uses for code
**Confidence:** INFERRED
**Evidence:** Visual editor research context

OpenDesign already uses CodeMirror for code editing and renders the result visually. An MDX text editor + preview is the same architecture:
- Left panel: CodeMirror editing the source
- Right panel: rendered output
- Shared state: the source text (via Yjs Y.Text)

The difference from the WYSIWYG approach is philosophical: instead of hiding the source behind a visual abstraction, you SHOW the source and render the result alongside it.

### Finding: Feature comparison — what each approach enables
**Confidence:** INFERRED
**Evidence:** Synthesis across all dimensions

| Feature | WYSIWYG | Text + Preview |
|---------|---------|----------------|
| Edit without knowing markdown | Yes | No |
| Drag-and-drop content blocks | Yes | No |
| Inline image preview while editing | Yes | Side-by-side only |
| Perfect source fidelity | No (conversion loss) | Yes |
| Expression props (data={...}) | No (lost in conversion) | Yes |
| Import statements | No (rejected) | Yes |
| Custom component support | Schema-dependent | Syntax highlighting only |
| Collaboration (CRDT) | 3-6 months, novel engineering | Days-weeks, proven stack |
| Error recovery | Silent data loss | Syntax error shown, text preserved |
| Undo/redo | Complex (block-level) | Simple (text-level, per-user) |
| Find and replace | Block-level (lossy) | Text-level (exact) |
| Copy/paste from external | HTML→blocks conversion needed | Text paste works natively |
| Git diff readability | Depends on serialization | Perfect (source IS the file) |
| Mobile editing | Possible but complex | CodeMirror 6 has excellent mobile support |

### Finding: A progression path exists from text+preview to hybrid to inline rendering
**Confidence:** INFERRED
**Evidence:** codemirror-rich-markdoc, Obsidian Live Preview pattern

The text editor + preview approach doesn't preclude future enrichment. A progression:

**Stage 1: Pure text + side-by-side preview** (weeks to build)
- CodeMirror 6 with @codemirror/lang-markdown
- Live preview via evaluate() with debouncing
- Collaboration via y-codemirror.next + Liveblocks

**Stage 2: Enhanced text editing** (weeks to months)
- Custom MDX language mode (JSX highlighting inside markdown)
- Autocomplete for registered component names and props
- Inline error highlighting from MDX compiler
- Snippet insertion for common components

**Stage 3: Obsidian-like inline rendering** (months)
- Standard markdown rendered inline (headings, bold, images)
- Simple components show compact visual previews
- Cursor-aware: reveal source when editing, show rendered otherwise
- Side-by-side preview still available for complex components

**Stage 4: Full hybrid** (months+)
- Rich editing for markdown content (toolbar, shortcuts)
- Component insertion via slash commands
- Prop editing via property panel
- Source mode always available as escape hatch

This progression allows shipping something useful in Stage 1 and iterating toward Stage 3-4 over time, with each stage independently valuable.

### Finding: The key risk of the text editor approach is user adoption for non-developers
**Confidence:** INFERRED
**Evidence:** Market analysis of documentation tools

The risk: if the product targets non-technical users (marketing, support, product managers), a text editor with MDX syntax will be a barrier. These users expect visual editing like Notion, Mintlify's web editor, or Google Docs.

Mitigation options:
1. Stage the rollout: start with text+preview for developers, add visual editing later
2. The hybrid progression path (Stage 3-4) eventually delivers visual editing
3. The "Obsidian model": start as a developer tool, earn trust, then add visual modes
4. Accept the trade-off: developer tools succeed without WYSIWYG (VS Code, terminals, CLI tools)

---

## Summary

The text editor + preview approach is the pragmatic choice for MDX editing:
- **Architecturally simple:** No conversion boundaries, proven components
- **Immediately buildable:** Days-weeks to a working prototype vs months
- **Full fidelity:** MDX source preserved perfectly
- **Collaboration ready:** y-codemirror.next + Liveblocks is proven
- **Progressive enhancement:** Can evolve toward inline rendering and hybrid editing over time
- **Acceptable UX:** For the developer/technical writer audience, text+preview is the norm, not the exception

The WYSIWYG approach remains the aspirational goal for non-technical users, but the text editor approach can be shipped NOW and progressively enhanced.

---

## Gaps / follow-ups

* Market sizing: what percentage of documentation tool users are developers vs non-technical?
* Obsidian's journey from "text editor with preview" to "live preview" to current state would inform the progression timeline
* The hybrid approach (Stage 3-4) has no prior art for MDX specifically — it would be novel engineering
