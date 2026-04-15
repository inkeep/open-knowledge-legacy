# Evidence: D9 — link / image / linkReference / definition

**Dimension:** D9 — Source-view rendering of inline links, reference-style links, images, and link-reference-definition blocks
**Date:** 2026-04-14

---

## Key references

- `@lezer/markdown` grammar — `Link`, `Image`, `LinkReference`, `ImageReference`, `URL`, `Autolink`, `LinkMark`, `LinkLabel`, `LinkTitle` (T1)
- `/tmp/cm-rich-markdoc/src/richEdit.ts` — reference `LinkMark` + `URL` hiding (T1)

---

## Nodes

Inline:
- `Link` — `[text](url)` form; contains `LinkMark` (brackets/parens), `URL`, optional `LinkTitle`
- `Image` — `![alt](url)` — same inner structure as Link with a leading `!`
- `LinkReference` — `[text][label]` reference form
- `ImageReference` — `![alt][label]`
- `Autolink` — `<url>` explicit autolink; plus `URL` nodes for GFM autolink-literal detection
- `LinkMark` — the `[`, `]`, `(`, `)` characters

Block:
- `LinkReference` (definition block) — `[label]: url "optional title"` at document bottom (or anywhere)

---

## Pathologies

1. **Long URL inline:** `[text](https://very-long-signed-url-with-600-chars...)` — the URL wraps at browser-chosen positions, separating `text` from its `(url)` visually
2. **Long URL in link-ref definition:** `[label]: https://very-long-url "optional title"` — the URL dominates the line; wrapping happens mid-URL
3. **Broken `linkReference`:** `[text][missing-label]` with no matching `[missing-label]: ...` definition — silent failure on render, no source-view flag
4. **Autolinks in prose:** `Visit https://example.com today.` — auto-detected (GFM autolink-literal); styling depends on product
5. **Image handling:** `![alt](url)` typically just text in source view; some products render inline thumbnails

---

## CM6 primitive fit

### Inline link styling

`Decoration.mark` on the link's text range with an accent color + underline; `Decoration.mark` on the URL range with a muted color. Hide `LinkMark` characters (`[`, `]`, `(`, `)`) on cursor-outside — same pattern as inline marks.

```css
.cm-link-text { color: var(--accent); text-decoration: underline; }
.cm-link-url { color: var(--muted-foreground); word-break: break-all; }
.cm-markdoc-hidden { font-size: 1px; letter-spacing: -1ch; color: transparent; }
```

### Long-URL wrap

`word-break: break-all` on the URL range allows mid-URL wrap at any character (rather than only at whitespace, which URLs don't have). Keeps the URL inside its containing line.

### Broken-reference detection

`StateField` that:

1. First pass (on doc load / change): scan `LinkReferenceDefinition` nodes; build a label → url map
2. Second pass: scan `LinkReference` / `ImageReference` nodes; if their label is not in the map, add a decoration with warning class

```ts
const brokenRefField = StateField.define<DecorationSet>({
  create(state) { return computeBrokenRefs(state); },
  update(decs, tr) { return tr.docChanged ? computeBrokenRefs(tr.state) : decs; },
  provide: f => EditorView.decorations.from(f),
});
```

### Image inline preview

`Decoration.widget` with side: 1 inserting an `<img>` preview after the `![alt](url)` text. Or full `Decoration.replace` widget (cursor-reveal). Tradeoff: inline preview always-visible adds noise; replace-widget adds cursor-mode friction.

---

## Per-product findings

### Obsidian

**Source Mode:**
- `[text](url)` shown as plain text with some coloring of the `[]()` characters
- Long URLs wrap as normal text (no `word-break: break-all` by default)
- Image `![]()` shown as text; no inline thumbnail
- Reference-style links: no visual distinction from inline links in source
- No broken-reference indicator
**Confidence:** INFERRED (T2)

**Live Preview:**
- Links rendered as clickable chips (text-only, URL hidden)
- Images rendered inline with thumbnail (size can be controlled via `![alt|200]` Obsidian-specific syntax)
- Cursor entry reveals source `[text](url)` / `![alt](url)`
- Broken wikilinks styled differently (red/italic); broken markdown-links less visibly flagged
**Confidence:** CONFIRMED (T2)

### codemirror-rich-markdoc

Handles `Link` inline via `tokenElement` (line 7-13) and `LinkMark` + `URL` via `tokenHidden` (line 15-22):

```ts
const tokenElement = ['InlineCode', 'Emphasis', 'StrongEmphasis', 'FencedCode', 'Link'];
const tokenHidden = ['HardBreak', 'LinkMark', 'EmphasisMark', 'CodeMark', 'CodeInfo', 'URL'];
```

When cursor is NOT inside the `Link` node, both `LinkMark` and `URL` get `decorationHidden` class. Effect: only the link text shows; `[` `]` `(` `url` `)` become invisible.

No special image handling. No reference-link detection. No broken-link indicator.
**Confidence:** CONFIRMED (T1 — source-verified)
**Evidence:** `/tmp/cm-rich-markdoc/src/richEdit.ts:7-22, 66-67`

### VS Code + Markdown extensions

- Syntax coloring on `[]()` tokens
- No URL hiding, no broken-link indicator
- Some extensions (e.g., "Markdown Preview Enhanced") render preview but only in separate preview pane
- Community "Markdown Link Suggestions" extension provides autocomplete; no visual decoration
**Confidence:** CONFIRMED (T1)

### SilverBullet

Link handling present; specific decoration details not confirmed at this pass.
**Confidence:** UNRESOLVED

### HedgeDoc / Typora / Marktext / MDXEditor

Baseline: syntax coloring on link tokens in source pane; rendered clickable links in preview. No broken-reference indicator observed.
**Confidence:** INFERRED (T2/T3)

---

## Image handling

No surveyed CM6-based product renders inline thumbnails in source view as default. Obsidian Live Preview does thumbnails (Obsidian-specific size syntax `![alt|size]`), but that's Live Preview (widget layer), not pure source.

MDXEditor's rich-text view shows images; source toggle reverts to text.

**Conclusion:** Inline image previews in source view = unclaimed territory among CM6 products.

---

## Link-reference definitions block

No surveyed product styles `[label]: url` definition blocks specifically. They appear as regular text lines at their document position. No auto-group-at-bottom, no fold-all, no separate visual zone.

Community convention is to place definitions at document bottom, but tooling doesn't enforce or assist.

---

## Broken-link indicator

**Observed:**
- Obsidian flags broken wikilinks (red/italic) — CONFIRMED (T2)
- Obsidian's markdown-link flagging is weaker; broken `[text](./nonexistent.md)` typically not highlighted

**Not observed anywhere:**
- Broken-reference flagging for `[text][missing-label]` when the definition doesn't exist in the document

**Implementation note:** CM6 `StateField` cross-scanning references against definitions is a viable pattern; no surveyed product ships it.

---

## Autolinks

GFM autolink-literal (`https://example.com` bare in prose auto-detected) is parsed by @lezer/markdown when the GFM extension is loaded. Styling in source view is typically a syntax-coloring affair (the URL range gets a distinct color), not a decoration overlay.

---

## Gaps / follow-ups

- **Broken-reference indicator:** technically straightforward via StateField cross-scan; no adoption
- **Image inline preview:** Obsidian Live Preview has it but Live Preview ≠ pure source; CM6 source-view products don't
- **Long-URL `word-break`:** unclaimed; products let URLs wrap naturally or overflow
- **Link-ref-definition auto-group / fold:** no UX for the trailing-definitions block pattern
