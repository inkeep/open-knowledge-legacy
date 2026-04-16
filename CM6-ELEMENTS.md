---
title: CM6 Source-View Elements
description: Every markdown element the editor supports, with each decoration labeled by layer.
tags: [reference, source-view, codemirror]
---
# CM6 Source-View Elements

Reference for the source-mode editor. Every supported markdown element appears below. For each one, this doc labels which decoration (if any) applies and which layer it comes from.

**How to read this file:** open it in **Markdown source** mode. Every section is a live demo of the construct it describes — inspect each with DevTools to see the actual classes.

## Styling layers

The source editor renders through five superimposed layers. When you see a class, it belongs to exactly one of them:

| Layer | Owner                                | Example class(es)                                                                                    | What it does                                                                                                                                                       |
| ----- | ------------------------------------ | ---------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1     | CM6 base                             | `.cm-editor`, `.cm-content`, `.cm-line`, `.cm-gutters`, `.cm-cursor`, `.cm-selectionLayer`           | Editor chrome — gutter, line numbers, cursor, selection                                                                                                            |
| 2     | CM6 markdown language                | `.ͼ<hash>`                                                                                           | Default syntax highlighting for `#`, `*`, `**`, `~~`, `>`, ` `` `, etc. Token-colored per theme.                                                                   |
| 3     | `codeLanguages` allowlist            | `.ͼ<hash>` (per-language)                                                                            | Nested syntax highlighting inside fenced code for \~12 languages (js, ts, tsx, json, yaml, css, html, bash, python, rust, go, md). Unknown languages render plain. |
| 4     | `source-polish/`\*\* (this spec)\*\* | `.cm-del`, `.cm-list-item`, `.cm-fenced-code-line`, `.cm-table-row`, `.cm-table-header`, `.cm-link-ref-broken` | The minimal decorations added by this feature.                                                                                                                     |
| 5     | Existing plugins                     | `.cm-wiki-link`, `.cm-wiki-link-broken`, `.cm-md-*`, `.cm-agent-flash-source-*`                      | Wiki-link detection + navigation, markdown-link chip, agent-write line flash.                                                                                      |

**Rule of thumb:** if a class starts with a letter-hash like `ͼ4z`, it's CM6 layer 2/3. If it starts with `cm-` (no hash), it's layer 1, 4, or 5 — grep `globals.css` to find which.

## Quick map — what decoration applies to each construct

| Construct               | Source-polish class (Layer 4)             | Plugin class (Layer 5)                                 | CM6 default (Layer 2) | Notes                                             |
| ----------------------- | ----------------------------------------- | ------------------------------------------------------ | --------------------- | ------------------------------------------------- |
| Heading (H1–H6)         | —                                         | —                                                      | ✓                     | `#` markers recede via theme; no size hierarchy   |
| Paragraph / text        | —                                         | —                                                      | ✓                     | Baseline                                          |
| Emphasis `*em*`         | —                                         | —                                                      | ✓ italic              | Markers stay visible                              |
| Strong `**bold**`       | —                                         | —                                                      | ✓ bold                | Markers stay visible                              |
| Strikethrough `~~del~~` | `.cm-del` on content                      | —                                                      | ✓ on markers          | GFM-only; delimiters stay plain                   |
| Inline code `` `x` ``   | —                                         | —                                                      | ✓ mono                | Backticks visible                                 |
| Blockquote `>`          | —                                         | —                                                      | ✓                     | No border, no tint, no depth ramp                 |
| Unordered list `-`      | `.cm-list-item`                           | —                                                      | ✓                     | Hanging indent on wrap                            |
| Ordered list `1.`       | `.cm-list-item`                           | —                                                      | ✓                     | Same hanging indent                               |
| Task marker `[ ]` `[x]` | —                                         | —                                                      | ✓                     | Plain text — no pill, no checkbox                 |
| Fenced code lines       | `.cm-fenced-code-line`                    | —                                                      | ✓ fence               | Preserve source indent via `padding-inline-start` |
| Fenced code content     | —                                         | —                                                      | ✓ nested              | Syntax highlighting per `codeLanguages` (Layer 3) |
| Inline link `[t](u)`    | —                                         | `.cm-md-*`                                             | ✓                     | Click handling via plugin                         |
| Reference link `[t][l]` | —                                         | —                                                      | ✓                     | —                                                 |
| Broken `[t][missing]`   | `.cm-link-ref-broken`                     | —                                                      | —                     | Wavy red; StateField doc-wide scan                |
| Link ref def `[l]: url` | —                                         | —                                                      | ✓                     | —                                                 |
| Autolink `<url>`        | —                                         | —                                                      | ✓                     | —                                                 |
| Image `![a](u)`         | —                                         | —                                                      | ✓                     | —                                                 |
| Wikilink `[[Page]]`     | —                                         | `.cm-wiki-link`                                        | —                     | Valid/uncached: sky-blue mark                     |
| Broken `[[Missing]]`    | —                                         | `.cm-wiki-link-broken`                                 | —                     | Wavy red after 5s pagesCache TTL                  |
| Thematic break `---`    | —                                         | —                                                      | —                     | Plain three dashes                                |
| HTML block              | —                                         | —                                                      | ✓ tags                | No tint, no border                                |
| YAML frontmatter        | —                                         | —                                                      | —                     | Renders plain                                     |
| GFM table header        | `.cm-table-header` (structure only)       | —                                                      | ✓ delimiters          | Hanging indent + compactness. No bg / border / accent bar |
| GFM table row           | `.cm-table-row` (structure only)          | —                                                      | ✓ delimiters          | Same — structure/layout only; no cell bands              |
| Table `\|---\|---\|` row  | `.cm-table-row`                           | —                                                      | ✓ delimiters          | Delimiter-row = `TableDelimiter` whose parent is `Table` |
| Agent write             | —                                         | `.cm-agent-flash-source-{create,update,delete,append}` | —                     | Transient flash during MCP writes                 |

## Live examples — what this spec DOES decorate

### 1. Strikethrough — `.cm-del`

Written `~~deprecated~~` in source. The text "deprecated" gets `.cm-del` (`text-decoration: line-through`); the two `~~` delimiters stay plain.

Examples to inspect: ~~deprecated~~ · ~~one two three~~ · a ~~mid-sentence~~ strike.

- **Source file:** `packages/app/src/editor/source-polish/view-plugin.ts`
- **Prereq:** GFM extension enabled on `markdown()` (US-001)

### 2. List hanging-indent on wrap — `.cm-list-item`

Every list item (unordered, ordered, task) gets `.cm-list-item`. Effect via CSS:

```css
.cm-list-item {
  padding-inline-start: var(--list-hang, 2ch);
  text-indent: calc(-1 * var(--list-hang, 2ch));
}
```

The marker stays at its natural source x (where plain CM6 would put it). Wrapped continuation aligns under the item's first text character.

- Short bullet — no wrap, no visual difference from plain CM6.
- A longer bullet that explains something at length and keeps going until it genuinely wraps across more than one visual line at a normal viewport width, so the continuation aligns under the "A".
- [ ] Unchecked task — brackets stay as plain text.
- [x] Checked task — same, still plain text. No pill, no checkbox, no interactivity.

Ordered:

1. One
2. Two that wraps the same way a long unordered item does — continuation under "Two", marker at natural x.

Nested:

- Depth 1
  - Depth 2 — longer text that wraps; continuation aligns under "longer".
    - Depth 3 — same rule applies per depth.

### 3. Fenced code — `.cm-fenced-code-line`

One line decoration on fenced-code content lines:

- **Line decoration:** `.cm-fenced-code-line` on each content line, with inline `--line-indent` set to the source leading-whitespace count. CSS uses `padding-inline-start: calc(var(--line-indent, 0) * 1ch)` — **no negative text-indent** (D6 LOCKED: that was the prior spec's flattening bug).

The language name is the literal `typescript` / `python` / `bash` text on the opening fence line — it's just source text, not a rendered badge. Nested syntax highlighting for the code content comes from the `codeLanguages` allowlist (Layer 3).

Indented content stays indented:

```typescript
function resolveDecorations(view: EditorView, registry: Registry): DecorationSet {
  if (!syntaxTreeAvailable(view.state, view.viewport.to)) {
    return Decoration.none;
  }
  const builder = new RangeSetBuilder<Decoration>();
  for (const { from, to } of view.visibleRanges) {
    syntaxTree(view.state).iterate({
      from,
      to,
      enter(nodeRef) {
        // per-construct dispatch
      },
    });
  }
  return builder.finish();
}
```

Python:

```python
def preserve_source_indent(line: str) -> int:
    """Count leading whitespace (tabs count as 4 spaces)."""
    count = 0
    for ch in line:
        if ch == ' ':
            count += 1
        elif ch == '\t':
            count += 4
        else:
            break
    return count
```

Bash:

```bash
bun run dev                 # Start dev server
VITE_PORT=9000 bun run dev  # Custom port (strict)
bun run check               # Quality gate
```

Empty-language fence (renders plain, no nested highlighting):

```
plain fenced block — no language declared
indent is still visible
    like this
```

Unknown language (no nested highlight — plain, no error):

```haskell
map :: (a -> b) -> [a] -> [b]
map _ [] = []
map f (x:xs) = f x : map f xs
```

- **Source files:** `source-polish/view-plugin.ts`, `markdown-code-languages.ts`
- **CSS:** `.cm-fenced-code-line` in `globals.css` (bottom)

### 4. Broken link-reference — `.cm-link-ref-broken`

The `source-polish/broken-ref-field.ts` `StateField` runs a doc-wide regex scan on every `docChanged` transaction. It collects every block-level `[label]: url` definition, then marks every inline `[text][label]` whose label isn't in the collected set.

Valid: [click here][exists] resolves to the definition below, so no broken class.

Broken: `[click here][no-such-label]` — **wavy red underline** when you type this directly in source mode.

**Gotcha:** seeding this pattern via `agent-write-md` goes through the CRDT bridge (Y.Text → XmlFragment → Y.Text), and `remark-stringify` escapes the brackets (`\[click here\]\[no-such-label\]`) to prevent re-parsing. The escaped version doesn't trigger the detector. To see the decoration from a test or demo, type the broken ref directly in source mode.

[exists]: https://example.com "Example"

- **Source file:** `packages/app/src/editor/source-polish/broken-ref-field.ts`
- **Unit tests:** `broken-ref-field.test.ts` (9 cases covering add/remove, case-insensitive matching, collapsed refs)

### 5. Broken wikilink — `.cm-wiki-link-broken` (in the existing plugin)

Lives in `packages/app/src/editor/plugins/wiki-link-source.ts` (not `source-polish/`). The plugin reuses its own `pagesCache` (populated by `getPages()`, 5s TTL) to check each `[[Target]]` against the indexed pages. If absent, it applies `.cm-wiki-link-broken` alongside the existing `.cm-wiki-link`.

Valid (cache-hit → no broken): [[CM6 Source-View Elements]] — self-reference, indexed.

Broken (cache-miss → wavy red after ≤5s): [[ThisPageDoesNotExist12345]].

**Cache-cold behavior:** on first paint with an empty cache, NO broken marks appear (avoids false-positive flash). The plugin dispatches a decoration rebuild once `getPages()` resolves and `pageNameSet` populates.

- **Source file:** `packages/app/src/editor/plugins/wiki-link-source.ts`
- **CSS:** `.cm-wiki-link` + `.cm-wiki-link-broken` in `globals.css`

### 6. Tables — structure + wrapping (no styling)

`TableHeader` lines get `.cm-table-header`. `TableRow` lines get `.cm-table-row`. The `|---|---|` separator row gets `.cm-table-row` too (detected as a `TableDelimiter` whose parent is the `Table` container — distinguishes the separator line from the inline `|` characters inside rows).

CSS (in `globals.css`) is deliberately structure-only:

```css
.cm-table-row,
.cm-table-header {
  padding-inline-start: calc(8px + 2ch);
  text-indent: -2ch;
  font-size: 0.9em;
  line-height: 1.4;
}
```

**No background tint. No border. No accent bar. No cell color bands.** Those were the prior polish-engine's Tier 1/2 styling and are deliberately not here.

#### Demo A — single long cell (hanging indent on wrap)

The third cell is long enough to force wrap at normal viewport widths. When it wraps, the continuation line starts at `padding-inline-start` (roughly `8px + 2ch` from the line's left edge) — **under the first cell's content**, not at column 0 under the `|`. The first visual line is pulled back by `text-indent: -2ch` so the opening `|` sits at its natural source position.

Narrow the browser window (or drag the file panel wider) until the table wraps. The wrapped continuation should read "under the a" alignment rather than falling back to flush-left.

| id | label  | long content that wraps                                                                                                                                                                                                                                                                                                                  |
|----|--------|----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| 1  | short  | Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla. |
| 2  | medium | Short enough that it probably won't wrap unless the panel is quite narrow.                                                                                                                                                                                                                                                               |
| 3  | —      | Plain.                                                                                                                                                                                                                                                                                                                                   |

**What to verify in DevTools:**
- Header line carries `cm-table-header`; body lines carry `cm-table-row`; the delimiter `|---|` line carries `cm-table-row`.
- Computed `padding-inline-start` on any table line ≈ 40-50px (varies by font metrics).
- `background-color` is **NOT** set by us — it inherits the editor background (or `transparent`).
- `border-left-width` / `border-top-width` / `border-bottom-width` are all `0px`.

#### Demo B — many columns (compactness buys horizontal budget)

`font-size: 0.9em` shrinks table text ~10% vs. paragraph text. Combined with `line-height: 1.4`, more columns fit per visual line before wrapping kicks in. Compare this dense 8-column table against a body paragraph:

| col1 | col2 | col3 | col4 | col5 | col6 | col7 | col8 |
|------|------|------|------|------|------|------|------|
| a1   | b1   | c1   | d1   | e1   | f1   | g1   | h1   |
| a2   | b2   | c2   | d2   | e2   | f2   | g2   | h2   |
| a3   | b3   | c3   | d3   | e3   | f3   | g3   | h3   |

The same 8-column layout at full body-text size would force wrap earlier. Lower the viewport width gradually — this table holds all 8 cols longer than a paragraph of equivalent character count would.

**Verify in DevTools:** computed `font-size` on a table line should be ~12.6px when the body font is 14px (0.9 × 14), and `line-height` should be `19.6px` (14px × 1.4).

#### Demo C — the pathology the prior spec aimed at (PROJECT.md)

`PROJECT.md` in this repo has table rows up to ~3000 characters. Open it in source mode for a heavier stress test — each row wraps across many visual lines, and you can see both the hanging indent (wrapped lines under cell content, not column 0) and the compactness (more content per visual line than paragraph text).

- **Source file:** `packages/app/src/editor/source-polish/view-plugin.ts`
- **CSS:** `.cm-table-row` + `.cm-table-header` in `globals.css`
- **Kept from prior polish-engine:** hanging indent + compactness (Tier 3 D18).
- **Deliberately cut from prior:** row tint, left accent bar, header top border, per-cell color bands, `box-decoration-break: clone`.

## Live examples — what this spec does NOT decorate

These constructs appear verbatim below. Inspect any of them — no `.cm-*` class from this spec is applied. Styling comes from Layer 2 (CM6 default) only.

### Headings

# Heading 1

## Heading 2

### Heading 3

#### Heading 4

##### Heading 5

###### Heading 6

All heading lines render at the same size. The `#` markers get a theme color via CM6's default highlight, but no `.cm-heading-*` class, no size hierarchy, no margin tweaks.

### Paragraph and inline marks

Plain paragraph with *emphasis*, **strong**, ***both***, `inline code`, and ~~strikethrough~~. The strikethrough content carries `.cm-del` (above); everything else relies on CM6 default styling for `*`, `**`, `` ` ``.

### Blockquotes (no border, no tint)

> Depth 1 — plain line. No `.cm-blockquote-*` class.
>
> Wrapped continuation of a long quoted line. The `>` marker stays at source-natural x. The continuation does NOT hang under text — this spec explicitly excludes blockquote hanging indent.

> > Depth 2 — still plain. No depth ramp.

> > > Depth 3 — still plain.

### YAML frontmatter (the block at the top of this file)

The opening `---`, the `title:` / `description:` / `tags:` lines, and the closing `---` all render as plain text. No `.cm-frontmatter-*` class, no top/bottom borders, no line tint.

### Task markers

The brackets `[ ]` and `[x]` inside list items are plain text. No pill, no border, no fill.

- [ ] Unchecked — the `[ ]` is three literal characters.
- [x] Checked — the `[x]` is three literal characters.

Use the WYSIWYG editor if you want an interactive checkbox.

### Thematic breaks

Before:

---

After. The `---` characters are plain — no border-bottom rule, no fade, no `.cm-thematic-break` class. (The prior spec faded them to `color: transparent`, this spec explicitly doesn't.)

### HTML block

<div class="demo" id="x" data-kind="html-block">
<p>HTML tags and attrs get Layer 2 highlight tokens via the nested parser, but NO <code>.cm-html-block</code> line tint or left border.</p>
</div>

### Links / images / ref definitions

Inline: [docs home](/) · External: [example](https://example.com) · Autolink: <https://codemirror.net>

Reference: [the docs][docs-ref] · Image: ![alt](https://via.placeholder.com/50)

[docs-ref]: https://codemirror.net/docs/ref/

No `.cm-link-*` / `.cm-url-*` classes from this spec. The `md-link-source` plugin adds click navigation for internal links, but that's Layer 5 and unchanged.

### GFM tables

Tables are now **partially** decorated — structure/layout/wrapping only, no styling. See the "Tables — structure + wrapping (no styling)" section above for live demos and the class mapping. The split is: hanging indent + compactness are in (structural); row tint / cell bands / accent bar / header top-border / `box-decoration-break` are explicitly out (stylistic).

## Composition — nested constructs

Things compose without extra rules:

> Strikethrough inside a blockquote: ~~this is struck~~ and gets `.cm-del` on the content. The quote line stays unadorned.

- List item containing ~~strikethrough~~ gets `.cm-list-item` on the line and `.cm-del` on the content range.
- List item with `inline code` and [a link](https://example.com).
- Nested list item that wraps and has a broken \[reference link]\[missing-here] → `.cm-list-item` on the line plus `.cm-link-ref-broken` on the ref (when you type it in source; see gotcha above).

A fenced code block inside a list item preserves its outer indent by default:

- Item containing:
  ```bash
  # Leading whitespace from being "inside the list item" stays visible —
  # preserve-source-indent rule applies to every fenced line.
  echo "hello"
  ```
- Next item.

## Addressability invariant

Every source character must be cursor-reachable, `Cmd+A → Cmd+C` byte-identical, and find/replace-compatible with plain CM6. This spec uses only `Decoration.line`, `Decoration.mark`, and `Decoration.widget({ side: 1 })` — no `Decoration.replace({ block: true })`, no `atomicRanges`.

**Quick verification:**

- Press `ArrowRight` across a thematic break line → cursor visits every position of the three `-` chars.
- `Cmd+A` → `Cmd+C` → paste into a diff tool → compare to the raw file. Bytes match.
- `Cmd+F` "deprecated" (from a `~~deprecated~~` span) → finds the plain text, not stopped by `.cm-del`.

## How to inspect decorations in DevTools

1. Open **Markdown source** mode on this file.
2. DevTools → Elements → find `.cm-content`.
3. Hover any line or span — the class list names the layer:
   - `cm-line` alone → pure Layer 1.
   - `cm-line cm-list-item` or `cm-fenced-code-line` → Layer 4 (this spec).
   - Span with `ͼ6m ͼ6q` or similar → Layer 2/3 (CM6 highlight theme).
   - Span with `cm-wiki-link` / `cm-wiki-link-broken` → Layer 5 (wiki-link-source plugin).
4. To check computed styles for a decoration, right-click the element → "Inspect" → Styles panel.

## Gotchas worth knowing

1. **Broken link-ref via API seed gets escaped.** The CRDT bridge (`agent-write-md` → Y.Text → XmlFragment → Y.Text) round-trips through `remark-stringify`, which escapes `[x][label]` to `\[x\]\[label\]` when no matching definition exists — breaking the detector pattern. To test manually or write E2E tests: seed a *valid* ref pair, then type the broken one directly in source mode.
2. **Wikilink cache is async.** On cold cache (first paint), `.cm-wiki-link-broken` is suppressed to avoid flash. After `getPages()` resolves (≤5s), the plugin triggers a decoration rebuild and broken wikilinks appear.
3. **No negative **`text-indent`** on code lines.** The prior polish-engine spec used `text-indent: calc(-1 * var(--line-indent) * 1ch)` and pulled leading whitespace off-screen, flattening all code lines to the same starting x. This spec uses `padding-inline-start` only (D6 LOCKED).
4. **Shadcn **`--color-accent`** is a background token.** In light theme it resolves to `oklch(0.97 0 0)` — nearly white. Never use it for visible foregrounds. Use `var(--color-primary)` or a specific `oklch()` value. (D7 LOCKED.)
5. **Markdown round-trip normalizes some things.** Blank-line counts between blocks normalize (`## A\nP` → `## A\n\nP`). Table column widths normalize. HTML entities decode to literals. See `CLAUDE.md` → "Storage-layer fidelity contract" for the full list (NG1–NG11).
6. `syntaxTreeAvailable()`\*\* is a footgun.\*\* Do NOT gate syntax-tree reads on it — it reflects the deepest pending sublanguage (lazy-loaded fenced-code language), not the outer markdown tree. ViewPlugin uses tree-mutation detection (`syntaxTree(update.startState) !== syntaxTree(update.state)`); StateField early-returns on `!tr.docChanged`. See CLAUDE.md footgun note.

## Source map

| File                                                              | What's in it                                                          |
| ----------------------------------------------------------------- | --------------------------------------------------------------------- |
| `specs/2026-04-15-source-view-minimal-polish/SPEC.md`             | The spec — problem, goals, non-goals, AC, decisions                   |
| `packages/app/src/editor/source-polish/view-plugin.ts`            | ViewPlugin for strikethrough + list + fenced-code + table structure   |
| `packages/app/src/editor/source-polish/broken-ref-field.ts`       | StateField for broken link-ref cross-scan                             |
| `packages/app/src/editor/source-polish/broken-ref-field.test.ts`  | Unit tests for broken-ref logic                                       |
| `packages/app/src/editor/source-polish/engine-invariants.test.ts` | Grep guard: no `Decoration.replace` / `atomicRanges` in the submodule |
| `packages/app/src/editor/source-polish/index.ts`                  | Public `createSourcePolishExtension()` factory                        |
| `packages/app/src/editor/markdown-code-languages.ts`              | \~12-entry `codeLanguages` allowlist (no `@codemirror/language-data`) |
| `packages/app/src/editor/plugins/wiki-link-source.ts`             | Wikilink detection + `.cm-wiki-link-broken` extension                 |
| `packages/app/src/globals.css`                                    | CSS (bottom, "Source-view minimal polish" block)                      |
| `packages/app/tests/stress/source-polish.e2e.ts`                  | Playwright E2E (9 tests covering §6.1–§6.7)                           |

## Out-of-scope per §3 of the spec

For completeness — the things we *could* have built but deliberately didn't:

- Blockquote line tint / left border / depth ramp
- Heading size hierarchy (H1 1.25×, etc.)
- YAML frontmatter line tint + fence borders
- Emphasis / strong / inline-code tinting
- Link / URL / ref-def-label coloring
- Task marker pills (bordered checkbox rendering)
- Thematic break fade-to-transparent
- HTML block purple tint
- Code block background tint and borders
- Table row tint / cell bands / accent bar / header top border (the table's *structural* layout — hanging indent + compactness — was added back; the styling parts stay out)
- Gutter contrast overrides
- A generic "polish engine" registry, Compartment, or auto-bail

If any of these surfaces a real need later, they ship as their own spec — not by retrofitting this one.
