# Evidence: D1 — Construct catalog (118 cases, classified)

**Dimension:** D1 — Exhaustive construct enumeration
**Date:** 2026-04-11
**Sources:** CommonMark 0.31.2, GFM spec, our `sharedExtensions` config, our custom extensions (wiki-link, jsx-component)
**Library versions:** `@tiptap/markdown@^3.22.3`, `@tiptap/core@^3.22.3`, `@tiptap/y-tiptap@^3.0.3`, `yjs@^13.6.30`
**Baseline commit:** 2d35736

---

## Methodology

A single bun script (`probe-script.ts`) enumerates 118 markdown constructs across 7 categories, runs each through two round-trip pipelines, and classifies the output. The raw TSV is in `probe-results.tsv`.

**Layer A — `mdManager` only:**
```
input → mdManager.parse → mdManager.serialize → output
```

**Layer B — Full Y.Doc observer path (production):**
```
input → mdManager.parse → schema.nodeFromJSON → updateYFragment
      → yXmlFragmentToProsemirrorJSON → mdManager.serialize → output
```

**Classification scheme:**

| Label | Meaning |
|---|---|
| `BYTE_IDENTICAL` | `input === output` (no transformation) |
| `WHITESPACE_DIFF` | Only trailing-newline / trailing-space differences |
| `COSMETIC_NORMALIZATION` | Equivalent rendering, different bytes (e.g., `-` ↔ `*` bullet) |
| `STRUCTURE_CHANGE` | Markdown syntax characters changed (e.g., `***` HR → `---`) |
| `SEMANTIC_LOSS` | Character-level content dropped or inserted beyond normalization |
| `ENTITY_CORRUPTION` | Literal `&`, `<`, or `>` escaped to `&amp;`, `&lt;`, `&gt;` |

---

## Categories enumerated

| Category | Count | What it covers |
|---|---|---|
| `commonmark-block` | 42 | Headings (ATX+setext), thematic breaks, paragraphs, blockquotes, lists (bullet+ordered+tight+loose+nested), code blocks (fenced+indented), HTML blocks |
| `commonmark-inline` | 17 | Inline code, emphasis (asterisk+underscore+combined+nested), links (inline+reference+collapsed+shortcut+autolink), images, raw inline HTML |
| `gfm-extension` | 7 | Tables (simple+aligned), task lists (checked+unchecked), strikethrough, bare-URL autolink |
| `char-content` | 28 | Literal `&`/`<`/`>`, already-encoded entities, numeric entities, named entities, backslash escapes, punctuation, single/two-char words, numbers, math operators, Unicode (emoji+CJK+RTL+accented+combining+ZWJ) |
| `custom-extension` | 7 | Our wiki-link variants (bare, alias, section, section+alias, inside list), our JSX component fenced-code pattern, YAML frontmatter |
| `structural` | 7 | Heading+paragraph pairs, list-containing-code, list-containing-heading, paragraph with multiple inline marks, heading with nested marks, heading with inline code, heading with link |
| `edge-case` | 10 | Empty doc, only-whitespace, single character, very-long paragraph, trailing newlines, no trailing newline, whitespace handling (tabs, leading spaces, NBSP) |

**Total:** 118 constructs.

---

## Layer A vs Layer B — fully equivalent

**CONFIRMED:** 118/118 cases produce byte-identical output through Layer A and Layer B. The Y.Doc observer bridge (`updateYFragment` + `yXmlFragmentToProsemirrorJSON`) introduces **zero additional corruption** on top of what `mdManager.parse/serialize` already does.

**Implication:** All fidelity bugs live at the `@tiptap/markdown` layer, not at the CRDT layer. Testing at the `mdManager` level is sufficient to catch this entire class of bugs — the CRDT bridge is a pass-through.

---

## Aggregate classification (Layer A; Layer B is identical)

| Class | Count | % |
|---|---|---|
| `WHITESPACE_DIFF` | 77 | 65% |
| `STRUCTURE_CHANGE` | 18 | 15% |
| `ENTITY_CORRUPTION` | 10 | 8% |
| `SEMANTIC_LOSS` | 8 | 7% |
| `COSMETIC_NORMALIZATION` | 3 | 3% |
| `BYTE_IDENTICAL` | 2 | 2% |

**Only 2/118 constructs are byte-identical.** 65% of cases normalize trailing whitespace (cosmetic). **33% (39 cases) involve material differences beyond whitespace.** Clean partition: 2 byte-identical + 77 whitespace-only + 39 material = 118.

---

## ENTITY_CORRUPTION — 10 cases

**CONFIRMED** — the `@tiptap/core` `encodeHtmlEntities` function HTML-escapes every literal `&`, `<`, `>` in non-code text nodes during serialization. Parse correctly decodes `&amp;` back, so the round-trip converges after 1 cycle. But the disk representation changes on first save, and author-written entities get doubled.

| # | Construct | Input | Output (Layer A) |
|---|---|---|---|
| 1 | `ampersand-literal-in-heading` | `# H&M Store\n` | `# H&amp;M Store` |
| 2 | `ampersand-literal-in-paragraph` | `Foo & Bar & Baz.\n` | `Foo &amp; Bar &amp; Baz.` |
| 3 | `lt-gt-in-paragraph` | `If a < b and b > c then a < c.\n` | `If a &lt; b and b &gt; c then a &lt; c.` |
| 4 | `link-with-ampersand-in-text` | `See [A & B](https://example.com).\n` | `See [A &amp; B](https://example.com).` |
| 5 | `gfm-table-with-ampersand` | `\| A & B \| test \|\n` (in table cell) | `\| A &amp; B \| test \|` |
| 6 | `html-block-div` | `<div class="box">HTML block</div>\n` | `&lt;div class="box"&gt;HTML block&lt;/div&gt;` |
| 7 | `html-inline-span` | `Text with <span>inline</span> HTML.\n` | `Text with &lt;span&gt;inline&lt;/span&gt; HTML.` |
| 8 | `html-br` | `Line one<br>Line two.\n` | `Line one&lt;br&gt;Line two.` |
| 9 | `named-entity-copy` | `&copy; 2026 Example Inc.\n` | `&amp;copy; 2026 Example Inc.` |
| 10 | `named-entity-mdash` | `She said &mdash; wait, no.\n` | `She said &amp;mdash; wait, no.` |

**Sub-case A (literal character encoding):** Cases 1, 2, 3, 4, 5. Author types `&` in body text. Serialize outputs `&amp;`. On disk, git diffs show noise on every save. Grep for `& ` fails to find the content. Rendered HTML is visually identical so end-users don't see the regression.

**Sub-case B (double-encoding of named entities):** Cases 9, 10. Author types `&copy;` or `&mdash;`. Marked tokenizer treats this as a text token. `decodeHtmlEntities` does NOT decode named entities beyond `&amp;`/`&lt;`/`&gt;`/`&quot;`, so `&copy;` parses as literal `&copy;`. On serialize, `encodeHtmlEntities` escapes the `&` first → `&amp;copy;`. On next parse/serialize cycle, this is stable (`&amp;copy;` parses to literal `&amp;copy;`, serializes to `&amp;amp;copy;`... wait, let me verify). Actually since parse decodes `&amp;` → `&`, the next cycle would be `&amp;copy;` → parse → `&copy;` text → serialize → `&amp;copy;` (stable). OK, stable after 1 cycle.

**Sub-case C (HTML block → inline text):** Cases 6, 7, 8. Raw HTML (`<div>`, `<span>`, `<br>`) is parsed as text (not as HTML blocks in our schema), then serialized with entity encoding. The HTML semantics are lost entirely — these become literal text strings containing escape sequences.

**Sub-case D (numeric entities):** Classified as `COSMETIC_NORMALIZATION` (not `ENTITY_CORRUPTION`) because marked parses `&#169;` as literal `&#169;` text:
- `numeric-entity-decimal`: `Copyright &#169; 2026.` → `Copyright &amp;#169; 2026.`
- `numeric-entity-hex`: `Bullet &#x2022; item.` → `Bullet &amp;#x2022; item.`

The author's intent (display `©`) is preserved in the rendered HTML because browsers parse `&amp;#169;` back through both decode steps... actually no, they'd render `&#169;` as literal text. **This is data corruption** — numeric entities are broken on round-trip. Reclassifying in hit list.

---

## SEMANTIC_LOSS — 8 cases

**CONFIRMED** — character-level content actually lost, not just normalized.

| # | Construct | Input | Output | Lost |
|---|---|---|---|---|
| 1 | `setext-heading-h1` | `Heading 1\n=========\n` | `# Heading 1` | The setext syntax (converted to ATX — recoverable) |
| 2 | `setext-heading-h2` | `Heading 2\n---------\n` | `## Heading 2` | Same |
| 3 | `code-block-indented` | `    indented code\n    second line\n` | `` ```\nindented code\nsecond line\n``` `` | Indented→fenced conversion (recoverable) |
| 4 | `link-reference` | `See [docs][ref].\n\n[ref]: https://example.com\n` | `See [docs](https://example.com).` | The label `[ref]` is unrecoverable — future edits to the same text can't share a reference definition |
| 5 | `link-autolink` | `Visit <https://example.com>.\n` | `Visit [https://example.com](https://example.com).` | Autolink syntax; now text and URL must be kept in sync manually |
| 6 | `gfm-autolink-bare-url` | `Visit https://example.com directly.\n` | `Visit [https://example.com](https://example.com) directly.` | Bare URL autolink becomes explicit inline link |
| 7 | `backslash-escape-bracket` | `Literal \[not link\].\n` | `Literal not link.` | **The brackets AND backslashes are dropped entirely** |
| 8 | `trailing-newlines` | `Text.\n\n\n\n` | `Text.\n\n\n\n&nbsp;` | `&nbsp;` appended at the end |

**Items 1-3, 5, 6:** Cosmetic syntax normalization. The rendered HTML is identical; semantic meaning preserved. These would typically count as `STRUCTURE_CHANGE` but my classifier flagged them because the character-level content differs by >20%. Reclassifying in the hit list.

**Item 4 (link reference definition):** Genuine semantic loss. The `[ref]: https://example.com` definition block is eliminated on round-trip. If multiple links shared the same reference label, they'd all become separate inline links with duplicated URLs. If a document style guide relied on reference-style links, every save would destroy that convention.

**Item 7 (backslash escapes):** **CRITICAL.** When the author writes `\[not link\]` to display literal square brackets, marked consumes the backslashes correctly — but our renderer drops the brackets along with the escapes. This is a round-trip that **silently removes author content**. The same pattern affects `\*`, `\_`, `\#` (see STRUCTURE_CHANGE section).

**Item 8 (trailing newlines):** Weird edge case — the serializer appends `&nbsp;` as an empty-paragraph marker when the document ends with multiple blank lines. This is a known TipTap behavior to preserve empty paragraphs; `isEmptyOutput()` in `MarkdownManager.ts:283-294` handles the opposite direction.

---

## STRUCTURE_CHANGE — 18 cases

| # | Construct | Change |
|---|---|---|
| 1 | `atx-heading-trailing-hashes` | `## Heading ##\n` → `## Heading` (trailing hashes stripped) |
| 2 | `hr-asterisks` | `***\n` → `---` |
| 3 | `hr-underscores` | `___\n` → `---` |
| 4 | `list-bullet-asterisk` | `* Item\n` → `- Item` |
| 5 | `list-bullet-plus` | `+ Item\n` → `- Item` |
| 6 | `list-ordered-paren` | `1)` → `1.` |
| 7 | `code-block-fenced-tildes` | `~~~\n…\n~~~` → `` ```\n…\n``` `` |
| 8 | `inline-code-with-backticks` | `` Use `` `backtick` `` here.` `` → `Use ``backtick`` here.` **(and non-idempotent — changes shape again on next cycle)** |
| 9 | `emphasis-bold-underscores` | `__bold__` → `**bold**` |
| 10 | `emphasis-italic-underscores` | `_italic_` → `*italic*` |
| 11 | `link-collapsed-reference` | `[docs][]` + definition → `[docs](url)` (inline) |
| 12 | `link-shortcut-reference` | `[docs]` + definition → `[docs](url)` (inline) |
| 13 | `gfm-table-aligned` | Column-width normalization |
| 14 | `backslash-escape-asterisk` | `\*not italic\*` → `not italic` **(backslashes AND asterisks consumed)** |
| 15 | `backslash-escape-underscore` | `\_not italic\_` → `not italic` **(same)** |
| 16 | `backslash-escape-hash` | `\# Not a heading.` → ` Not a heading.` **(hash consumed, leading space preserved)** |
| 17 | `frontmatter-yaml` | `---\ntitle: My Doc\n---\n` → `---\n\n## title: My Doc\n\n` **(frontmatter parsed as HR + setext heading — destroyed)** |
| 18 | `paragraph-with-bold-italic-code` | `**bold** _italic_ `code`` → `**bold** *italic* `code`` (italic underscore normalized) |

**Critical group (14, 15, 16):** Backslash-escape consumption. Marked correctly decodes `\*` → `*` during parse. But the rendered markdown output then re-escapes problematic characters selectively — and for `\*`, `\_`, `\#` the re-escape is missing, so the escaped character is LOST entirely on round-trip.

**Frontmatter (17):** Destroyed on every cycle if it's NOT pre-stripped before hitting mdManager. The production path does strip frontmatter via `stripFrontmatter` in `@inkeep/open-knowledge-core/extensions/frontmatter.ts` before calling `mdManager.parse`, so this failure mode is only observable at the `mdManager` test level, not in the full production pipeline. The fix is already in place — this test case documents that `mdManager` alone does not handle frontmatter.

---

## Non-idempotent cases — 3 constructs don't converge after 1 cycle

A well-behaved round-trip satisfies `serialize(parse(serialize(parse(x)))) === serialize(parse(x))` for all `x`. Constructs that don't converge are dangerous because each save further deforms the output.

| Construct | Why non-idempotent |
|---|---|
| `inline-code-with-backticks` | Double-backtick wrapping `` `` `backtick` `` `` is collapsed inconsistently — first cycle produces ``` ``backtick`` ```, second cycle may produce different shape |
| `html-block-div` | HTML escaped to entities on first cycle; but the entities themselves are treated as text on the next parse, producing further nested encoding |
| `frontmatter-yaml` | Frontmatter parsed as HR + setext heading — this doesn't stabilize because the heading re-renders differently each cycle |

All other 115 constructs converge after exactly 1 cycle (Cycle 2 = Cycle 1 bit-exact).

---

## Unicode and custom extensions — all passing

**GOOD NEWS:**

- **Unicode (6/6):** emoji (including ZWJ family emoji), CJK, RTL Arabic, accented Latin, combining characters — all round-trip cleanly (whitespace-only diff).
- **Wiki-links (5/5):** bare, aliased, sectioned, section+alias, inside list — all round-trip cleanly.
- **JSX component (1/1):** fenced-code with custom info string round-trips cleanly.
- **Task lists (2/2):** checked and unchecked both round-trip cleanly.
- **Strikethrough (1/1):** `~~struck~~` round-trips cleanly.
- **NBSP (U+00A0):** preserved as literal.
- **Emoji with ZWJ joiners** (`👨‍👩‍👧‍👦`): preserved byte-exact.

These are the constructs we DON'T need to worry about — the integration with our custom extensions works.

---

## Pointers

- `probe-script.ts` — the reproduction (run via `bun probe-script.ts`)
- `probe-results.tsv` — complete row-level data for all 118 constructs
- `probe-summary.txt` — aggregate class counts
- `d2-root-cause-entities.md` — source-code trace of `encodeHtmlEntities` in `@tiptap/core`

## Gaps / follow-ups

- Did not test the full persistence path (disk → file watcher → observer → server → disk). Only tested the `mdManager.parse/serialize` and CRDT-bridge layer. Persistence adds `stripFrontmatter`/`prependFrontmatter` wrapping which fixes the frontmatter case (#17) but not the others.
- Did not test with 2+ clients editing the same construct concurrently (out of scope — multi-client is a different test class).
- Did not test marked's extension hooks for adding custom inline parsers. The `@tiptap/markdown` v3 API surface for overriding `encodeTextForMarkdown` is not explored here.
