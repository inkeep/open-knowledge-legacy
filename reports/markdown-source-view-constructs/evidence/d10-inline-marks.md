# Evidence: D10 — inline marks

**Dimension:** D10 — Source-view rendering of inline marks: `emphasis`, `strong`, `delete`, `highlight`, `inlineCode`, `wikiLink`, `hardBreak`
**Date:** 2026-04-14

---

## Key references

- `@lezer/markdown` grammar — inline nodes (T1)
- `/tmp/cm-rich-markdoc/src/richEdit.ts` — reference inline-mark hiding (T1)
- Prior report `codemirror-markdown-source-view-rendering/evidence/d4-codemirror-rich-markdoc.md` (T1)

---

## The dominant pattern: cursor-reveal marker hiding

**Finding D10-1:** Across surveyed S3 products, the canonical treatment for inline markdown markers is to **hide them (via CSS) when the cursor is NOT inside the enclosing node, and reveal them when the cursor enters**.

The guard is one line:

```ts
if (cursor.from >= node.from && cursor.to <= node.to) return false;  // skip hide
```

**Confidence:** CONFIRMED (T1)
**Evidence:** `/tmp/cm-rich-markdoc/src/richEdit.ts:42-57` — the iterator either returns `false` (skip decoration for this node's descendants) when cursor is inside, or emits `decorationHidden` for tokens in the `tokenHidden` list.

---

## Reference implementation (codemirror-rich-markdoc)

Node lists verbatim from `richEdit.ts`:

```ts
const tokenElement = [
  'InlineCode',
  'Emphasis',
  'StrongEmphasis',
  'FencedCode',
  'Link',
];

const tokenHidden = [
  'HardBreak',
  'LinkMark',
  'EmphasisMark',
  'CodeMark',
  'CodeInfo',
  'URL',
];
```

Tokens in `tokenHidden` get the `cm-markdoc-hidden` mark class (hiding the markers).
Nodes in `tokenElement` are the "enclosing" containers used by the cursor-reveal guard — if cursor is inside any of these, descendant hide-decorations are skipped.

**Absent from both lists:**
- `Strikethrough` (GFM `~~text~~`) and its `StrikethroughMark`
- `Highlight` (`==text==`) — note: may not parse in standard `@lezer/markdown`; typically requires custom extension
- `WikiLink` — not a standard `@lezer/markdown` node; requires custom extension

---

## Per-mark treatment

### `emphasis` / `strong` (italic / bold markers)

Pattern: hide `EmphasisMark` / `StrongMark` tokens on cursor-outside; apply italic/bold to content text.

```css
.cm-markdoc-hidden { font-size: 1px; letter-spacing: -1ch; color: transparent; }
em, strong { /* markdown-native rendering */ }
```

**Obsidian Live Preview:** same pattern
**codemirror-rich-markdoc:** hides `EmphasisMark` + applies italics via browser default for the `em` element (the parser wraps content in `em`/`strong` DOM)
**Confidence:** CONFIRMED (T1 for rich-markdoc, T2 for Obsidian)

### `delete` / strikethrough (GFM `~~text~~`)

Not in codemirror-rich-markdoc's hide list. Treatment varies:
- Some products apply `text-decoration: line-through` via mark decoration + keep markers visible
- Some treat as plain text (no decoration)
- Obsidian Live Preview: applies strikethrough visually, hides `~~` on cursor-outside
**Confidence:** INFERRED (T2 — not directly verified)

### `highlight` (`==text==`)

Standard `@lezer/markdown` does NOT parse `==...==` natively. Products that support it extend the grammar (custom micromark/lezer extension) or handle at the mdast level via remark plugins.
- Obsidian: supports; renders with yellow background in Live Preview
- Most other products: treat as plain text since parser doesn't recognize
**Confidence:** INFERRED (T2/T3)

### `inlineCode` (`` `code` ``)

Standard treatment: `Decoration.mark` with monospace + subtle background. Markers (backticks) typically **not hidden** — they're already visually minimal, and users rely on seeing them during editing.
**Confidence:** CONFIRMED (T1 via rich-markdoc — `CodeMark` IS in `tokenHidden`, so this is product-specific; Obsidian notably DOES hide backticks in Live Preview per community observation)

### `link` (short) — `[text](url)`

Already covered in D9 evidence file. Summary: `LinkMark` + `URL` hidden on cursor-outside; link text displayed as styled accent-colored underlined text.

### `wikiLink` (`[[page]]`)

Not a standard `@lezer/markdown` node. Products supporting wikilinks (Obsidian, Foam, Dendron, some community CM6 extensions) implement via custom parser extensions.

- **Obsidian Source Mode:** `[[page]]` shown as plain text
- **Obsidian Live Preview:** replaced with a clickable chip widget (colored pill)
- **Foam / Dendron in VS Code:** TextMate grammar coloring; no widget in source

**Implementation options for CM6:**
1. Custom `Decoration.mark` styling with `cm-wiki-link` class + cursor-reveal for `[[` `]]` brackets
2. `Decoration.replace` with a pill widget (loses source-visible property)
**Confidence:** INFERRED (T2/T3)

### `hardBreak` (trailing `  \n` or `\\\n`)

`HardBreak` IS in rich-markdoc's `tokenHidden` list — the two trailing spaces (or backslash) get hidden. Some products show a visible `↵` hint character via `Decoration.widget` after the break point.
**Confidence:** CONFIRMED for rich-markdoc (T1)

---

## Per-product summary table

| Mark type | Obsidian LP | rich-markdoc | SilverBullet | Baseline (HedgeDoc/VS Code/Marktext) |
|---|---|---|---|---|
| `*italic*` markers | Hidden | Hidden | Likely hidden | Visible |
| `**bold**` markers | Hidden | Hidden | Likely hidden | Visible |
| `~~delete~~` markers | Hidden | NOT in hide list | Unclear | Visible |
| `==highlight==` markers | Hidden | Parser may skip | Unclear | Often unparsed (plain text) |
| `` `code` `` markers | Hidden | Hidden | Likely hidden | Visible |
| `[text](url)` brackets + URL | Hidden | Hidden | Likely hidden | Visible |
| `[[wiki]]` brackets | Hidden (chip widget) | Custom extension (not in this repo) | Custom extension | Visible or not parsed |
| HardBreak trailing spaces | Hidden | Hidden | Likely hidden | Visible / invisible but undistinguished |

---

## Trade-off

**Always-visible markers (baseline):**
- Simpler — no cursor tracking
- Users see exact markdown at all times
- No mode-switching friction
- Preferred by developer-source identity editors (VS Code, HedgeDoc default)

**Cursor-reveal markers (S3 inline variant):**
- Prettier visual output while reading
- Matches rendered-doc feel more closely
- Cursor-position-dependent presentation adds visual mode friction
- Preferred by Obsidian-feel editors (Obsidian LP, SilverBullet, rich-markdoc)

---

## Gaps / follow-ups

- **Strikethrough coverage:** rich-markdoc reference omits `~~`; intentional or gap?
- **Highlight marker parsing:** requires custom parser extension in standard `@lezer/markdown`; no canonical grammar-level support
- **WikiLink widget vs mark trade-off:** no surveyed product examines both and documents the choice
- **HardBreak visible hint:** some users appreciate seeing `↵` to recognize explicit breaks; not universally done
