# Evidence: D7 — TipTap ecosystem stance on source view

**Dimension:** D7 — Does TipTap publish guidance for dual-mode (WYSIWYG + source) editing with a CM companion?
**Date:** 2026-04-14
**Sources:** tiptap.dev docs, ueberdosis/tiptap GitHub

---

## Findings

### Finding D7-1: TipTap publishes no official "source mode" / "dual-mode" guidance
**Confidence:** CONFIRMED (negative finding after exhaustive search)
**Evidence:**
- https://tiptap.dev/docs/ — no page documenting source mode, dual-mode, or a CodeMirror companion editor
- https://github.com/ueberdosis/tiptap/discussions/5973 — user asked how to toggle between visual and source code views; answer was community-driven (conditionally render textarea or editor, `editor.getHTML()` / `editor.commands.setContent()` for sync); no maintainer guidance
- https://github.com/ueberdosis/tiptap/discussions/4564 — user asked whether TipTap uses CodeMirror for code blocks; thread unanswered by maintainers. One reference to `prosemirror-codemirror-block` (community plugin) exists, but TipTap itself ships no CodeMirror integration.
- https://github.com/ueberdosis/tiptap/discussions/850 — asking about disabling markdown; no source-view stance documented

### Finding D7-2: TipTap ships an `@tiptap/markdown` extension for markdown ↔ JSON serialization but no source editor
**Confidence:** CONFIRMED
**Evidence:** https://tiptap.dev/docs/editor/markdown — documents parsing/serializing Markdown to/from ProseMirror JSON via the Markdown extension. Nothing about a source-editing surface.

Implication: TipTap's "markdown support" is about **storage format**, not about a source-view editing experience. The team's product direction is WYSIWYG-first; dual-mode is explicitly consumer territory.

### Finding D7-3: Ecosystem wrappers that combine TipTap + CM6 are community-owned, not endorsed
**Confidence:** CONFIRMED
**Evidence:**
- Mantine UI's `RichTextEditor.SourceCode` component (https://mantine.dev/x/tiptap/) — conditionally renders a `<textarea>` alongside TipTap. Not a CM6 integration; not affiliated with TipTap team.
- No official `@tiptap/codemirror` or `@tiptap/source-mode` package on npm

### Finding D7-4: Source-toggle editors with TipTap + CM6 exist in production (e.g., Open Knowledge, Yandex Gravity UI) but each implements the bridge from scratch
**Confidence:** CONFIRMED (indirectly — via prior research)
**Evidence:** `source-toggle-architecture/REPORT.md` (related OK report) catalogs production implementations; no shared library or pattern ships from TipTap.

---

## Pattern extracted

**TipTap ecosystem stance: source view is your problem.** The team ships a WYSIWYG-focused editor; any companion source editor is the consumer's architectural choice. This is consistent with how the WYSIWYG table rendering report found TipTap's demo CSS was "here's an example, not a prescribed pattern."

---

## Gaps / follow-ups

- TipTap's private Discord may contain more nuanced community guidance not publicly searchable. Public-web findings are what they are: negative.
- A counterfactual: any recent TipTap v3 changelog or upcoming-features post that mentions source mode as on the roadmap. Not found as of 2026-04-14.
