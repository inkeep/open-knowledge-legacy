# Evidence: D8 — thematicBreak

**Dimension:** D8 — Source-view rendering of thematic breaks (`---`, `***`, `___`)
**Date:** 2026-04-14

---

## Key references

- `@lezer/markdown` grammar — `HorizontalRule` node (T1)
- Prior report `codemirror-markdown-source-view-rendering/evidence/d5-silverbullet.md` — SilverBullet pattern (T2)

---

## Node

`HorizontalRule` (one-line block). Matches `---`, `***`, `___` (and 4+-char variants) alone on a line.

Open Knowledge schema name: `thematicBreak` (per CLAUDE.md D17: `horizontalRule → thematicBreak` name convention). Lezer's `HorizontalRule` maps to mdast `thematicBreak`, then to PM `thematicBreak` via the bridge.

---

## Treatment options

1. **Plain text** (no visual change) — baseline
2. **Styled line with color/letter-spacing** (`Decoration.mark` on the `---` chars) — subtle presentation cue
3. **Line-level `border-bottom`** — the line itself shows as a horizontal rule via CSS
4. **Widget-replace with rendered `<hr>`** — full visual rule; cursor entry reveals source

---

## CM6 primitive fit

### Line decoration with bottom border (most common observed)

```css
.cm-thematic-break {
  /* Draw a divider across the bottom of this logical line */
  border-bottom: 1px solid var(--border);
  margin-bottom: 0.5em;
  color: transparent;   /* optionally hide the --- chars */
  height: 0.5em;
  line-height: 0.5em;
}
```

Attach `Decoration.line({ attributes: { class: 'cm-thematic-break' } })` to each `HorizontalRule` line.

### Widget replace with `<hr>`

```ts
class HrWidget extends WidgetType {
  toDOM() {
    const hr = document.createElement('hr');
    hr.className = 'cm-thematic-break-widget';
    return hr;
  }
  ignoreEvent() { return false; }
}
// In StateField (since block-level replace):
Decoration.replace({ widget: new HrWidget(), block: true }).range(node.from, node.to);
```

With cursor-reveal guard (skip when cursor is inside the `---` range).

---

## Per-product findings

### Obsidian

**Source Mode:** `---` visible as text; no visual rule
**Confidence:** INFERRED (T2)

**Live Preview:** renders as an `<hr>` element; cursor entry reveals source. Some themes apply additional styling (wider margin, fancier divider).
**Confidence:** CONFIRMED (T2)

### SilverBullet

Prior report mentioned `horizontal rules: invisibility + CSS class styling` — suggests line-level decoration with the `---` characters potentially color-transparent and a CSS border-bottom providing the divider.
**Confidence:** CONFIRMED (T2 via prior report)

### codemirror-rich-markdoc

`HorizontalRule` is NOT in the block-replace list (`['Table', 'Blockquote', 'MarkdocTag']`) nor in `tokenElement` or `tokenHidden`. Treated as plain text with no decoration.
**Confidence:** CONFIRMED (T1 — source-verified)

### VS Code / Typora / HedgeDoc / MDXEditor / Marktext

Baseline: plain text with syntax coloring (the `---` chars may be a distinct token). No widget-replace observed.
**Confidence:** INFERRED (T2/T3)

---

## Unclaimed territory

No surveyed product uses `Decoration.replace` with a rendered `<hr>` widget in source view. The pattern is trivially implementable; adoption is zero. Likely reason: `---` is already unambiguous as a divider in source; the value-add of a widget is marginal.

---

## Gaps / follow-ups

- SilverBullet's exact CSS for horizontal rules — inferred, not source-verified
- Whether any product differentiates `---` vs `***` vs `___` visually (the three-char sequence choice is author preservation territory — a fidelity concern more than rendering)
