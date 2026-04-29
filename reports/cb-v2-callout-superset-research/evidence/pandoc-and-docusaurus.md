# Evidence: Pandoc Fenced Divs + Docusaurus Admonitions

**Date:** 2026-04-22
**Sources:** `https://pandoc.org/demo/example33/8.18-divs-and-spans.html` (Pandoc section 8.18); `https://docusaurus.io/docs/markdown-features/admonitions`.

---

## Findings

### Finding: Pandoc fenced_divs is a generic div, NOT an admonition primitive
**Confidence:** CONFIRMED
**Evidence:** Pandoc manual §8.18.

> "A Div starts with a fence containing at least three consecutive colons plus some attributes."

- Class shorthand: `::: Warning` → `<div class="Warning">…</div>`
- Full attribute syntax: `::::: {#special .sidebar}` (same as fenced code blocks)
- Closing fence: at least 3 colons; "the number of colons in the closing fence need not match the number in the opening fence" — convention is more colons for outer nesting
- "Fences without attributes are always closing fences"

Pandoc has **no built-in admonition taxonomy**. The semantics (note/warning/tip) are layered on by the rendering pipeline (LaTeX templates, HTML CSS, or the Quarto `.callout-*` convention).

### Finding: Docusaurus admonitions: 5 types, `:::type[Title]` syntax
**Confidence:** CONFIRMED
**Evidence:** Docusaurus admonitions docs page.

| Type | Semantic |
|---|---|
| `note` | neutral |
| `tip` | positive |
| `info` | informational |
| `warning` | caution |
| `danger` | destructive |

Syntax:

```
:::warning[Title here]

Body content. You can use **markdown** and <MDXComponents />.

:::
```

- Title is a directive label `[Title]` — optional.
- `extendDefaults: true` + `keywords: [...]` allows custom types.
- Nesting: "Use more colons for each parent admonition level" — i.e., `::::` wraps `:::`.

### Finding: Quarto builds on Pandoc with `.callout-*` classes
**Confidence:** INFERRED
**Evidence:** Not directly fetched; widely documented convention layered on Pandoc's fenced_divs.

Quarto's syntax: `::: {.callout-note}` / `.callout-tip` / `.callout-warning` / `.callout-caution` / `.callout-important`. Same 5 types as GFM (with `important` and `caution` swapped in semantic), just using Pandoc's attribute syntax.

---

## Gaps / follow-ups

- Quarto-specific callout API (`title`, `icon`, `collapse`, `appearance`) not enumerated here — only noted as a convention layered on Pandoc.
