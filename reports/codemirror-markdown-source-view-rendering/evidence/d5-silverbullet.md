# Evidence: D5 — SilverBullet

**Dimension:** D5 — SilverBullet's CM6 source-view table/long-line handling
**Date:** 2026-04-14
**Sources:** https://github.com/silverbulletmd/silverbullet (OSS)

---

## Key files (as reported by subagent)

- `client/codemirror/editor_state.ts` — editor state setup, includes `EditorView.lineWrapping` in extensions
- `client/codemirror/table.ts` — `TableViewWidget` implementation
- `client/codemirror/line_wrapper.ts` — utility applying CSS classes for per-construct wrapping behavior
- `client/codemirror/fenced_code.ts` — fenced code block rendering (`IFrameWidget` for custom renderers)
- `client/codemirror/frontmatter.ts` — YAML frontmatter decoration

---

## Findings

### Finding D5-1: SilverBullet uses CM6 with `EditorView.lineWrapping` ON, combined with per-construct block widgets
**Confidence:** CONFIRMED (per subagent source inspection)
**Evidence:** `editor_state.ts` includes `EditorView.lineWrapping` in the editor state extensions

### Finding D5-2: Tables render via a cursor-aware `TableViewWidget` that replaces source with interactive HTML
**Confidence:** CONFIRMED (per subagent source inspection)
**Evidence:** `client/codemirror/table.ts`

Pattern matches codemirror-rich-markdoc: widget hides source when cursor is outside the table region; when cursor enters, widget unmounts and reveals source. Interactive HTML (not static) suggests the widget may include click handlers, but it's not a full in-cell editor — edits still route through the revealed source.

### Finding D5-3: SilverBullet extends the same pattern to fenced code, frontmatter, horizontal rules, and heading/list styling
**Confidence:** CONFIRMED
**Evidence:** `fenced_code.ts`, `frontmatter.ts`, `line_wrapper.ts`

Fenced code can render via `IFrameWidget` for custom renderers (e.g., mermaid diagrams). Frontmatter gets styled lines + clickable link widgets. Line wrappers apply CSS classes for per-construct styling.

This confirms the **pattern generalizes across markdown constructs** — it's not table-specific. One coherent "live preview" system handles Table, FencedCode, YAML frontmatter, etc., each with its own widget shape.

### Finding D5-4: Pattern family = live-preview-hybrid (widget-block-replace + cursor-reveal + line-wrap-on-underlying-source)
**Confidence:** INFERRED from D5-1, D5-2, D5-3
**Evidence:** Composition of the individual findings

This is functionally the Obsidian Live Preview pattern, OSS and inspectable. SilverBullet is the single cleanest public reference implementation observed.

---

## Gaps / follow-ups

- Specific line numbers in `table.ts` were not captured — upgrading to line-level citations would strengthen the evidence.
- Behavior with very wide rendered tables (does the widget clip? overflow? scroll?) was not explicitly tested.
- Collaboration path (SilverBullet does not use y-codemirror.next; it has its own sync layer) — compatibility with widget patterns under CRDT sync is unspecified.
