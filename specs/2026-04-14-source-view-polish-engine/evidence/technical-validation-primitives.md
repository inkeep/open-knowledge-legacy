# Technical validation: primitives

**Date:** 2026-04-14
**Verification level:** CONFIRMED from source (node_modules) + community-vetted forum threads
**Verified against:** `@lezer/markdown` (in `node_modules/@lezer/markdown/src/`), `@codemirror/lang-markdown@6.5.0` (in `node_modules`), `@codemirror/view` types, `discuss.codemirror.net` threads.

---

## 1. @lezer/markdown node inventory

All node names below are taken from the `Type` enum at `node_modules/@lezer/markdown/src/markdown.ts:41-91` (lines for the standard parser) and from `node_modules/@lezer/markdown/src/extension.ts` (GFM extensions). Source repo: https://github.com/lezer-parser/markdown/blob/main/src/markdown.ts and `.../extension.ts`.

### Standard (built-in to @lezer/markdown core)

| Node name | Status | Source line |
|---|---|---|
| `Document` | CONFIRMED | `markdown.ts:42` |
| `Paragraph` | CONFIRMED | `markdown.ts:61` |
| `Blockquote` | CONFIRMED | `markdown.ts:46` |
| `QuoteMark` | CONFIRMED | `markdown.ts:81` |
| `BulletList` | CONFIRMED | `markdown.ts:48` |
| `OrderedList` | CONFIRMED | `markdown.ts:49` |
| `ListItem` | CONFIRMED | `markdown.ts:50` |
| `ListMark` | CONFIRMED | `markdown.ts:82` |
| `FencedCode` | CONFIRMED | `markdown.ts:45` |
| `CodeBlock` (indented) | CONFIRMED | `markdown.ts:44` |
| `CodeMark` | CONFIRMED | `markdown.ts:85` |
| `CodeInfo` | CONFIRMED | `markdown.ts:87` |
| `CodeText` | CONFIRMED | `markdown.ts:86` |
| `InlineCode` | CONFIRMED | `markdown.ts:73` |
| `HTMLBlock` | CONFIRMED | `markdown.ts:59` |
| `HTMLTag` (inline) | CONFIRMED | `markdown.ts:74` |
| `ATXHeading1` … `ATXHeading6` | CONFIRMED | `markdown.ts:51-56` |
| `HeaderMark` | CONFIRMED | `markdown.ts:80` |
| `SetextHeading1`, `SetextHeading2` | CONFIRMED | `markdown.ts:57-58` |
| `HorizontalRule` | CONFIRMED | `markdown.ts:47` |
| `Emphasis` | CONFIRMED | `markdown.ts:69` |
| `StrongEmphasis` | CONFIRMED | `markdown.ts:70` |
| `EmphasisMark` | CONFIRMED | `markdown.ts:84` |
| `StrongMark` | **NOT FOUND** | — only `EmphasisMark` exists; both `*` and `**` use `EmphasisMark` |
| `Link` | CONFIRMED | `markdown.ts:71` |
| `Image` | CONFIRMED | `markdown.ts:72` |
| `LinkReference` | **CONFIRMED — exact name is `LinkReference`** (NOT `LinkReferenceDefinition`) | `markdown.ts:60`, used at `522`, `548`, `621` |
| `ImageReference` | **NOT FOUND** | No separate node in the enum; image references reuse `Image` |
| `LinkMark` | CONFIRMED | `markdown.ts:83` |
| `URL` | CONFIRMED | `markdown.ts:90` |
| `LinkLabel` | CONFIRMED | `markdown.ts:89` |
| `LinkTitle` | CONFIRMED | `markdown.ts:88` |
| `Autolink` | CONFIRMED (built-in CommonMark `<…>` syntax) | `markdown.ts:77`. **Note:** GFM autolink extension (`www.`/`http://`/email) emits `URL`, not `Autolink` — see `extension.ts:234`. |
| `HardBreak` | CONFIRMED | `markdown.ts:68`, used at `1494-1501` |
| `Escape` | CONFIRMED | `markdown.ts:66`, used at `1432`, `extension.ts:254` |
| `EscapeMark` | **NOT FOUND** | The escape sequence is a single `Escape` node — no separate mark sub-node |
| `Entity` | CONFIRMED (bonus, in enum) | `markdown.ts:67` |
| `CommentBlock`, `ProcessingInstructionBlock`, `Comment`, `ProcessingInstruction` | CONFIRMED (bonus) | `markdown.ts:62-63, 75-76` |

### GFM extension (`@lezer/markdown` exports `GFM`)

Source: `node_modules/@lezer/markdown/src/extension.ts`. The `GFM` export at line 243 bundles `[Table, TaskList, Strikethrough, Autolink]`.

| Node name | Status | Source line |
|---|---|---|
| `Table` | CONFIRMED (block) | `extension.ts:119, 117-135` |
| `TableHeader` | CONFIRMED | `extension.ts:120` |
| `TableRow` | CONFIRMED | `extension.ts:121` |
| `TableCell` | CONFIRMED | `extension.ts:122` |
| `TableDelimiter` | CONFIRMED | `extension.ts:123` |
| `TableMarker` | **NOT FOUND** | The pipe character is tokenized as `TableDelimiter`, not `TableMarker`. Spec must use `TableDelimiter`. |
| `Strikethrough` | CONFIRMED | `extension.ts:12` |
| `StrikethroughMark` | CONFIRMED | `extension.ts:15` |
| `Task` (block wrapping a checkbox list item) | CONFIRMED | `extension.ts:155` |
| `TaskMarker` | CONFIRMED | `extension.ts:156` |

### GFM enablement (exact code)

GFM is enabled by configuring the markdown parser with the `GFM` bundle. Two equivalent paths:

**Path 1 — use `markdownLanguage` (already extended).** From `node_modules/@codemirror/lang-markdown/dist/index.js:62-74`:
```js
import { GFM, Subscript, Superscript, Emoji } from '@lezer/markdown';
const extended = commonmark.configure([GFM, Subscript, Superscript, Emoji, { /* extra */ }]);
const markdownLanguage = mkLang(extended);
```
Then in the editor:
```ts
import { markdown, markdownLanguage } from '@codemirror/lang-markdown';
markdown({ base: markdownLanguage })
```

**Path 2 — pass `extensions` to `markdown()`.** From `dist/index.d.ts:91`:
```ts
import { markdown } from '@codemirror/lang-markdown';
import { GFM } from '@lezer/markdown';
markdown({ extensions: GFM })
```
Both result in `parser.configure(extensions)` at `dist/index.js:423`.

### Nodes NOT in @lezer/markdown — would need a custom extension

| Asked node | Status | What's actually needed |
|---|---|---|
| `FrontMatter` | NOT IN BASE OR GFM | A custom `MarkdownConfig` with `parseBlock` parser registering a node named `FrontMatter` (and a `FrontMatterMark` for the `---` fences). No upstream package provides one for `@lezer/markdown` — would be ~30 SLOC modeled on `extension.ts`'s block parsers. |
| `Highlight` / `HighlightMark` (`==text==`) | NOT IN BASE OR GFM | Custom `parseInline` extension modeled on the `Strikethrough` extension at `extension.ts:10-31`, swapping `~~` for `==`. ~25 SLOC. |
| `WikiLink` (`[[Page]]`) | NOT IN @lezer/markdown | Open Knowledge has `packages/core/src/markdown/wiki-link-micromark.ts` — but that is a **micromark/remark extension**, NOT a `@lezer/markdown` extension. Token names produced (micromark): `wikiLink`, `wikiLinkMarker`, `wikiLinkTarget`, `wikiLinkAnchor`, `wikiLinkAlias`, `wikiLinkSeparator` (file lines 17-24). The mdast node type is `wikiLink` with `data.{target, anchor, alias}` (line 5). For the source-view CodeMirror, this micromark code does NOT apply; a parallel `@lezer/markdown` extension would have to be written. |

---

## 2. `markdown()` API signature — `@codemirror/lang-markdown`

Source: `node_modules/@codemirror/lang-markdown/dist/index.d.ts:66-116` (full type declaration) and `dist/index.js:404-426` (implementation). Public source at https://github.com/codemirror/lang-markdown/blob/main/src/markdown.ts.

```ts
declare function markdown(config?: {
  defaultCodeLanguage?: Language | LanguageSupport;
  codeLanguages?:
    | readonly LanguageDescription[]
    | ((info: string) => Language | LanguageDescription | null);
  addKeymap?: boolean;
  extensions?: MarkdownExtension;          // <-- accepts @lezer/markdown extensions
  base?: Language;                          // commonmarkLanguage | markdownLanguage
  completeHTMLTags?: boolean;
  pasteURLAsLink?: boolean;
  htmlTagLanguage?: LanguageSupport;        // <-- the public way to wire HTML
}): LanguageSupport;
```

### Field-by-field findings

- **`codeLanguages`** — Confirmed two accepted shapes:
  1. `readonly LanguageDescription[]` (e.g. import `languages` from `@codemirror/language-data`)
  2. Function `(info: string) => Language | LanguageDescription | null` for dynamic resolution.
  Both verified at `dist/index.d.ts:80` and used at `dist/index.js:419` via `getCodeParser(codeLanguages, defaultCode)`.

- **`htmlParser`** — **NOT a public option.** The README of `@lezer/markdown` and the `dist/index.d.ts` of `@codemirror/lang-markdown` do not expose this name. Internally, `dist/index.js:420` calls `parseCode({ codeParser, htmlParser: htmlTagLanguage.language.parser })` — `parseCode` is from `@lezer/markdown`. The **public** option is `htmlTagLanguage` (line 405): `htmlTagLanguage = htmlNoMatch` defaults to `html({ matchClosingTags: false })` from `@codemirror/lang-html`. Override by passing a `LanguageSupport`.
  > **Spec correction:** the spec talks about `htmlParser` — that's an internal name. Pass `htmlTagLanguage: html({ matchClosingTags: false })` or omit it (default already does this).

- **`extensions`** — Type is `MarkdownExtension` (re-exported from `@lezer/markdown`). Used at `dist/index.js:408`: `let extensions = config.extensions ? [config.extensions] : []`. This is how to add `GFM`, `Subscript`, custom `MarkdownConfig` objects, etc. without changing `base`.

### Nested HTML highlighting

Confirmed: `@codemirror/lang-markdown` automatically wires `@codemirror/lang-html`'s parser via `parseCode` (from `@lezer/markdown`) — `dist/index.js:420`. **No manual `parseMixed` wiring required.** The default `htmlTagLanguage = html({ matchClosingTags: false })` is applied at `dist/index.js:400, 405`. To customize (e.g., turn matching on, swap a different parser), pass `htmlTagLanguage`.

---

## 3. `Decoration.line` inline-style for CSS variables

Source: `node_modules/@codemirror/view/dist/index.d.ts:182-197, 346`. Public repo: https://github.com/codemirror/view/blob/main/src/decoration.ts.

```ts
interface LineDecorationSpec {
  attributes?: { [key: string]: string };  // <-- arbitrary string attributes
  class?: string;
  [other: string]: any;
}
static line(spec: LineDecorationSpec): Decoration;
```

### Findings

- **CSS variables in `style` work.** `attributes` is typed as `{[key: string]: string}` — no validation or filtering. CodeMirror writes these directly to the line wrapper's DOM via `setAttribute('style', ...)`. Custom CSS properties (`--line-indent`) are valid CSS syntax and browsers accept them in any inline `style` attribute.

- **The `text-indent` + `padding-inline-start` pattern is the same one in dralletje's reference gist** (https://gist.github.com/dralletje/058fe51415fe7dbac4709a65c615b52e):
  ```css
  --idented: ${offset}px;
  text-indent: calc(-1 * var(--idented) - 1px);
  padding-left: calc(var(--idented) + var(--cm-left-padding, 4px));
  ```
  This is essentially what the spec proposes (with `padding-inline-start` for logical-property correctness — equivalent to `padding-left` in LTR).

- **Known caveats** (collected from `discuss.codemirror.net`):
  1. **Rectangular selection bug** with `text-indent`. Per the [Making CodeMirror 6 respect indent for wrapped lines thread](https://discuss.codemirror.net/t/making-codemirror-6-respect-indent-for-wrapped-lines/2881): "left boundary is calculated from probing the line element's text-indent" — rectangular selection becomes buggy when indented lines appear at viewport top. The community workaround uses `border-left: transparent` + `::before { margin-left: -var; content: '' }` instead of `text-indent` to dodge this.
  2. **Sub-pixel jitter** (dralletje's gist comment): "without the `- 1px` it behaves weirdly periodically" — small browser rounding artifacts at wrap boundaries.
  3. **No reported issues with cursor positioning** on standard cursor selection (only rectangular-selection box).

- **Geometry:** `.cm-line` is a flex-styled block element; `text-indent` and `padding-inline-start` are both honored. The pattern works on Chromium/Firefox/Safari per the gist's production use in Pluto.jl. Confirmed in `node_modules/@codemirror/view/dist/index.js` line styling — `.cm-line` accepts arbitrary inline style attributes from `LineDecoration` without filtering.

**Verdict:** The CSS-variable + inline-style pattern is mechanically supported by CodeMirror and matches a battle-tested community pattern. **Recommend adopting the `border-left` variant if rectangular selection matters.** If only standard caret selection is used (typical for prose source mode), `text-indent + padding-inline-start` is fine.

---

## 4. preserve-source-indent in CM6 — community evidence

Three independent CM6 implementations exist:

1. **dralletje's gist** — https://gist.github.com/dralletje/058fe51415fe7dbac4709a65c615b52e — `Decoration.line` + CSS variable with `text-indent` + `padding-left`. Uses `defaultCharacterWidth` from the editor view; passes via `StateEffect` into a `StateField`. Caps offset at 48 chars (`ARBITRARY_INDENT_LINE_WRAP_LIMIT`). In production use in Pluto.jl notebook editor.
2. **`codemirror-wrapped-line-indent` npm package** — https://www.npmjs.com/package/codemirror-wrapped-line-indent — packaged community implementation (could not fetch README directly, blocked by 403; presence of the package confirms the technique is standard).
3. **discuss.codemirror.net thread "Making CodeMirror 6 respect indent for wrapped lines"** — https://discuss.codemirror.net/t/making-codemirror-6-respect-indent-for-wrapped-lines/2881 — multi-year discussion (2021-onwards) with iterative refinements. The `border-left + ::before` variant emerged here to fix the rectangular-selection bug.

**Marijn Haverbeke's involvement:** No quoted Marijn solution found in the threads searched. The "Hanging Indent" thread (https://discuss.codemirror.net/t/hanging-indent/243) is older (CM5-era) and does not feature Marijn. The CM6 threads are community-driven; Marijn has not (as of this verification) shipped an official extension.

**Verdict:** The pattern is **battle-tested in production** (Pluto.jl, Replit per thread mentions, packaged on npm). Not "attempted-and-abandoned." The technique is genuinely "community-standard but not officially blessed." Two implementation variants exist; pick `text-indent` for simplicity or `border-left + ::before` for rectangular-selection robustness.

---

## 5. `htmlParser` / nested HTML highlighting

Source: `node_modules/@codemirror/lang-markdown/dist/index.js:5-6, 400, 405, 420`.

```js
import { parser, GFM, Subscript, Superscript, Emoji, MarkdownParser, parseCode } from '@lezer/markdown';
import { html, htmlCompletionSource } from '@codemirror/lang-html';
// ...
const htmlNoMatch = html({ matchClosingTags: false });
function markdown(config = {}) {
  let { /* ... */ htmlTagLanguage = htmlNoMatch } = config;
  // ...
  extensions.push(parseCode({ codeParser, htmlParser: htmlTagLanguage.language.parser }));
  // ...
}
```

### Findings

- **`htmlParser` is NOT a public option of `markdown()`.** The d.ts at `dist/index.d.ts:66-116` does not include `htmlParser`. The internal name appears only inside `parseCode()` (from `@lezer/markdown`).
- **`htmlTagLanguage` IS the public option** (defaults to `html({ matchClosingTags: false })`). It accepts a `LanguageSupport` object.
- **No manual `parseMixed` wiring needed** — `parseCode` from `@lezer/markdown` does the mixed-parsing internally.
- **Result:** HTML inside markdown is automatically highlighted using `@codemirror/lang-html` out of the box. To customize (e.g., enable closing-tag matching), pass `htmlTagLanguage: html()`.

---

## Summary of spec corrections required

1. **Replace `LinkReferenceDefinition` with `LinkReference`** throughout the spec — that's the actual node name in `@lezer/markdown`.
2. **Drop `ImageReference`, `StrongMark`, `EscapeMark`, `TableMarker`** — these names do NOT exist. Use:
   - For image refs: detect via `Image` node + structure (no separate type).
   - For strong-emphasis marker: `EmphasisMark` (same as italic).
   - For escape-sequence: `Escape` (single node, no sub-mark).
   - For table pipes: `TableDelimiter`.
3. **Replace `htmlParser` with `htmlTagLanguage`** in any `markdown({...})` call.
4. **`FrontMatter`, `Highlight`/`HighlightMark`, `WikiLink` require custom `@lezer/markdown` extensions** — none ship with the base or GFM bundle. Estimate ~30 SLOC each, modeled on `extension.ts`'s `Strikethrough` (inline) and block parsers. The Open Knowledge `wiki-link-micromark.ts` does NOT apply to the CodeMirror source view (different parser ecosystem).
5. **Wrap-line indent technique** is sound; consider the `border-left + ::before` variant if rectangular selection support is required.
