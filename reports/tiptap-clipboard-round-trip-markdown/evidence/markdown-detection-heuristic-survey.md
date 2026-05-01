# Evidence: Markdown-detection heuristic survey

**Dimension:** Per-editor "is text/plain markdown?" heuristics in clipboard paste dispatchers
**Date:** 2026-04-30
**Sources:** Locally-cloned OSS repos (Outline, BlockNote, Milkdown, Keystatic, Lexical, Plate, BlockSuite, AFFiNE, tiptap-markdown), npm registry searches, vendor documentation, primary-source code in `~/.claude/oss-repos/`

---

## Key files / pages referenced

- `~/.claude/oss-repos/outline/shared/editor/lib/isMarkdown.ts` — Outline's signal-count heuristic (origin of OK's pattern)
- `~/.claude/oss-repos/outline/shared/editor/lib/isMarkdown.test.ts` — test fixtures, edge cases
- `~/.claude/oss-repos/outline/app/editor/extensions/PasteHandler.tsx` — call site, gating logic
- `~/.claude/oss-repos/blocknote/packages/core/src/api/parsers/markdown/detectMarkdown.ts` — BlockNote's 13-regex any-match
- `~/.claude/oss-repos/blocknote/packages/core/src/api/parsers/markdown/detectMarkdown.test.ts` — BlockNote's full test corpus
- `~/.claude/oss-repos/blocknote/packages/core/src/api/clipboard/fromClipboard/pasteExtension.ts` — `prioritizeMarkdownOverHTML` cascade
- `~/.claude/oss-repos/milkdown/packages/plugins/plugin-clipboard/src/index.ts` — Milkdown handlePaste (no is-markdown)
- `~/.claude/oss-repos/keystatic/packages/keystatic/src/form/fields/markdoc/editor/markdoc/clipboard.tsx` — Keystatic try-parse pattern
- `~/.claude/oss-repos/lexical/packages/lexical-clipboard/src/clipboard.ts` — Lexical insertDataTransferForRichText (no detection)
- `~/.claude/oss-repos/blocksuite/packages/affine/foundation/src/clipboard.ts` — BlockSuite adapter registry
- `~/.claude/oss-repos/blocksuite/packages/affine/shared/src/adapters/mix-text.ts` — MixTextAdapter (always-parse)
- `~/.claude/oss-repos/tiptap-markdown/src/extensions/tiptap/clipboard.js` — tiptap-markdown's unconditional clipboardTextParser
- `~/.claude/oss-repos/blocksuite/packages/framework/std/src/clipboard/clipboard.ts` — BlockSuite priority-based dispatcher
- `https://github.com/github/paste-markdown/blob/main/src/paste-markdown-text.ts` — `@github/paste-markdown` MIME-only detection
- `packages/app/src/editor/clipboard/is-markdown.ts:31-45` — OK's current heuristic (subject of this survey)

---

## Findings

### Finding: Only two editors implement a content-scanning is-markdown heuristic

**Confidence:** CONFIRMED
**Evidence:** Searched 9 OSS editor codebases (Outline, BlockNote, Milkdown, Keystatic, Lexical, Plate, BlockSuite, AFFiNE, tiptap-markdown). Two have content-scanning detection: Outline (`shared/editor/lib/isMarkdown.ts`) and BlockNote (`packages/core/src/api/parsers/markdown/detectMarkdown.ts`). The remaining seven use one of three structurally-different approaches (try-parse, MIME-only, no detection).

```
Search command: grep -rln "isMarkdown\|detectMarkdown\|looksLikeMarkdown" <each-repo>
Hit count: Outline=2 files (impl + test), BlockNote=2 files (impl + test), all others=0 files in clipboard/paste paths
```

**Implications:** Content-scanning is-markdown detection is **not** a universal pattern. Two of the three structural alternatives (try-parse and MIME-only) are equally well-represented in the ecosystem. OK's choice to adopt Outline's pattern is one of three reasonable design responses; it is not the consensus pattern.

---

### Finding: Outline's heuristic — weighted signal-count with line-scaled threshold

**Confidence:** CONFIRMED
**Evidence:** `~/.claude/oss-repos/outline/shared/editor/lib/isMarkdown.ts:1-48`

```typescript
export default function isMarkdown(text: string): boolean {
  let signals = 0;
  const lines = text.split("\n").length;
  const minConfidence = Math.min(3, Math.floor(lines / 5));

  // code-ish
  const fences = text.match(/^```/gm);
  if (fences && fences.length > 1) {
    signals += fences.length;
  }
  // latex-ish
  const latex = text.match(/\$(.+)\$/g);
  if (latex && latex.length > 0) {
    signals += latex.length;
  }
  // link-ish (absolute)
  const links = text.match(/\[[^]+\]\(https?:\/\/\S+\)/gm);
  if (links) {
    signals += links.length * 2;  // 2x weight
  }
  // link-ish (relative)
  const relativeLinks = text.match(/\[[^]+\]\(\/\S+\)/gm);
  if (relativeLinks) {
    signals += relativeLinks.length * 2;  // 2x weight
  }
  // heading-ish
  const headings = text.match(/^#{1,6}\s+\S+/gm);
  if (headings) {
    signals += headings.length;
  }
  // list-ish (only - and *, not + or numbered)
  const listItems = text.match(/^[-*]\s\S+/gm);
  if (listItems) {
    signals += listItems.length;
  }
  // table separator (only — not header/row alone)
  const tables = text.match(/\|\s?[:-]+\s?\|/gm);
  if (tables) {
    signals += tables.length;
  }
  return signals > minConfidence;
}
```

**Key properties:**
1. **Weighted** — links (absolute + relative) score 2 per match; everything else scores 1 per match. Multi-match scoring (every fence counts, not just one).
2. **Threshold** — `min(3, floor(lineCount / 5))`. 0 lines → 0, 5 lines → 1, 10 lines → 2, 15+ lines → 3 (capped). On a 1-line snippet, threshold is 0, so 1 signal wins.
3. **Strict comparison** — `signals > minConfidence` (NOT `>=`). So on a 1-line snippet with threshold 0, 1 signal passes; on a 16-line snippet with threshold 3, 4 signals are required.
4. **Code fence requires PAIRED fences** — `fences.length > 1`. A single ` ``` ` doesn't count as a signal. (See test "returns false for non-closed fence", line 36-42.)
5. **Tables require the SEPARATOR row** — header-only or row-only doesn't trigger; the `|---|---|` shape does.

**Call site:** `~/.claude/oss-repos/outline/app/editor/extensions/PasteHandler.tsx:263-269`

```typescript
if (
  (isMarkdown(text) &&
    !isDropboxPaper(html) &&
    !isContainingImage(html)) ||
  pasteCodeLanguage === "markdown" ||
  this.shiftKey ||
  !html
) {
  // ... markdown parse path
}
```

**False-positive defenses:** (a) Dropbox Paper exclusion (its HTML emits markdown-like text), (b) image-containing HTML exclusion (Slack screenshots etc.), (c) shift-key opt-out always wins, (d) `pasteCodeLanguage === "markdown"` bypass for VS Code .md file copy.

---

### Finding: BlockNote's heuristic — 13-regex any-match (no scoring, no threshold)

**Confidence:** CONFIRMED
**Evidence:** `~/.claude/oss-repos/blocknote/packages/core/src/api/parsers/markdown/detectMarkdown.ts:1-62`

```typescript
const h1 = /(^|\n) {0,3}#{1,6} {1,8}[^\n]{1,64}\r?\n\r?\n\s{0,32}\S/;
const bold = /(_|__|\*|\*\*|~~|==|\+\+)(?!\s)(?:[^\s](?:.{0,62}[^\s])?|\S)(?=\1)/;
const link = /\[[^\]]{1,128}\]\(https?:\/\/\S{1,999}\)/;
const code = /(?:\s|^)`(?!\s)(?:[^\s`](?:[^`]{0,46}[^\s`])?|[^\s`])`([^\w]|$)/;
const ul = /(?:^|\n)\s{0,5}-\s{1}[^\n]+\n\s{0,15}-\s/;          // requires 2 items
const ol = /(?:^|\n)\s{0,5}\d+\.\s{1}[^\n]+\n\s{0,15}\d+\.\s/;  // requires 2 items
const hr = /\n{2} {0,3}-{2,48}\n{2}/;
const fences = /(?:\n|^)(```|~~~|\$\$)(?!`|~)[^\s]{0,64} {0,64}[^\n]{0,64}\n[\s\S]{0,9999}?\s*\1 {0,64}(?:\n+|$)/;
const title = /(?:\n|^)(?!\s)\w[^\n]{0,64}\r?\n(-|=)\1{0,64}\n\n\s{0,64}(\w|$)/;  // SETEXT
const blockquote = /(?:^|(\r?\n\r?\n))( {0,3}>[^\n]{1,333}\n){1,999}($|(\r?\n))/;
const tableHeader = /^\s*\|(.+\|)+\s*$/m;
const tableDivider = /^\s*\|(\s*[-:]+[-:]\s*\|)+\s*$/m;
const tableRow = /^\s*\|(.+\|)+\s*$/m;

export const isMarkdown = (src: string): boolean =>
  h1.test(src) || bold.test(src) || link.test(src) || code.test(src) ||
  ul.test(src) || ol.test(src) || hr.test(src) || fences.test(src) ||
  title.test(src) || blockquote.test(src) || tableHeader.test(src) ||
  tableDivider.test(src) || tableRow.test(src);
```

**Key properties:**
1. **No scoring or threshold** — first regex match returns `true`.
2. **Stricter regexes per signal** — each pattern bounds character counts (`{1,64}`, `{1,128}`, etc.) and requires structural neighbors (e.g., `h1` requires the heading to be followed by `\n\n\s{0,32}\S` — a blank line then content).
3. **Lists require 2 items** — single bullet/numbered item doesn't trigger (vs. Outline's any single bullet that scores 1).
4. **Inline code is detected** — `` `code` `` triggers a `true` return. Outline does NOT detect inline code.
5. **Setext headings detected** — `Heading\n===\n` triggers (`title` regex). Outline does NOT detect setext.
6. **Blockquote detected** — `> blockquote` triggers. Outline does NOT detect blockquote.
7. **Bold/italic via 6 markers** — `*`, `_`, `**`, `__`, `~~`, `==`, `++` (highlight + insert). Outline does NOT detect emphasis.

**Call site:** `~/.claude/oss-repos/blocknote/packages/core/src/api/clipboard/fromClipboard/pasteExtension.ts:82-90`

```typescript
if (prioritizeMarkdownOverHTML) {  // default: true
  // Use plain text instead of HTML if it looks like Markdown
  const plainText = event.clipboardData!.getData("text/plain");
  if (isMarkdown(plainText)) {
    editor.pasteMarkdown(plainText);
    return true;
  }
}
```

**False-positive vulnerability:** A single `**bold**`, `*italic*`, `[link](url)`, or `` `code` `` in plain prose triggers `true`. The "Tom's *favorite* movie" case mentioned in OK's source comment IS a false positive in BlockNote's heuristic (the `bold` regex matches `*favorite*`).

**Defense:** Run `isMarkdown` only when `prioritizeMarkdownOverHTML: true` AND `text/html` is present. So in BlockNote, the heuristic is a tiebreaker between `text/plain` and `text/html` from the same clipboard event — not a primary classifier of arbitrary text. False-positives are bounded by the additional gating: a plain text-only paste with no HTML falls through to `plainTextAsMarkdown: true` (the default), where every plain text paste is parsed as markdown unconditionally.

---

### Finding: Milkdown — try-parse-and-validate (no is-markdown heuristic)

**Confidence:** CONFIRMED
**Evidence:** `~/.claude/oss-repos/milkdown/packages/plugins/plugin-clipboard/src/index.ts:114-131`

```typescript
const domParser = DOMParser.fromSchema(schema)
let dom: Node
if (html.length === 0) {
  const slice = parser(text)              // remark parser
  if (!slice || typeof slice === 'string') return false  // graceful fail
  dom = DOMSerializer.fromSchema(schema).serializeFragment(slice.content)
} else {
  // ... HTML branch
}
const slice = domParser.parseSlice(dom)
return dispatchPasteSlice(view, slice)
```

**Pattern:** When `text/html` is absent, Milkdown unconditionally feeds `text/plain` to its remark parser. If parsing yields no slice, returns `false` and falls through to the default PM text-paste handler. No content inspection — the parser's own success/failure is the discriminator.

**Subtle property:** Milkdown's parser is **markdown-first by default** for plain-text pastes. There is no false-positive class because there is no classifier — every plain-text paste goes through the markdown parser; the only failure mode is "parse produces no slice," which is rare for any non-empty text (the parser will always emit at least a paragraph node).

---

### Finding: Keystatic — try-parse-and-validate via try/catch (no is-markdown heuristic)

**Confidence:** CONFIRMED
**Evidence:** `~/.claude/oss-repos/keystatic/packages/keystatic/src/form/fields/markdoc/editor/markdoc/clipboard.tsx:40-55`

```typescript
clipboardTextParser(text, $context, plain, view) {
  try {
    return Slice.maxOpen(
      markdocToProseMirror(
        parse(text),
        getEditorSchema(view.state.schema),
        undefined, undefined, undefined,
      ).content
    );
  } catch (err) {
    console.log('failed to parse clipboard text as markdoc', err);
    return defaultClipboardTextParser(text, $context, plain, view);
  }
},
```

**Pattern:** Try the Markdoc parser first; on exception, fall back to PM's default text-paste. No content inspection. Markdoc's parser is more permissive than markdown-it (it accepts arbitrary text and treats it as a single paragraph), so the catch-block almost never fires — making this functionally equivalent to "always parse text as Markdoc."

**Cross-browser VS Code defense:** Keystatic's only content inspection is for VS Code (`isProbablyHtmlFromVscode`, lines 77-97) — a structural HTML check (single monospace `div` wrapping `div > span` lines). When the heuristic matches, the text is pasted plain to preserve indentation. This is structurally equivalent to OK's existing VS Code branch.

---

### Finding: BlockSuite — adapter registry with priority order (no is-markdown heuristic)

**Confidence:** CONFIRMED
**Evidence:** `~/.claude/oss-repos/blocksuite/packages/affine/foundation/src/clipboard.ts:46-63` (registry), `~/.claude/oss-repos/blocksuite/packages/affine/shared/src/adapters/mix-text.ts:261-310` (`MixTextAdapter.toSliceSnapshot`)

```typescript
// foundation/src/clipboard.ts — priority registry
export const PlainTextClipboardConfig = ClipboardAdapterConfigExtension({
  mimeType: 'text/plain',
  adapter: MixTextAdapter,
  priority: 70,  // below: snapshot=100, notion=95, html=90, image=80
});

// mix-text.ts — paste path
async toSliceSnapshot(payload: MixTextToSliceSnapshotPayload): Promise<SliceSnapshot | null> {
  if (payload.file.trim().length === 0) return null;
  payload.file = payload.file.replaceAll('\r', '');
  const sliceSnapshot = await this._markdownAdapter.toSliceSnapshot({...});
  // ... always delegates to markdown adapter
}
```

**Pattern:** BlockSuite's `text/plain` adapter is `MixTextAdapter`, which **unconditionally delegates** to its `MarkdownAdapter`. No content inspection. The priority cascade ensures `text/html` (priority 90) beats `text/plain` (priority 70) when both are present, so the markdown parse only fires when HTML is absent.

**Functionally equivalent to** Milkdown's "if no HTML, parse as markdown" — but expressed declaratively via priorities rather than imperatively in a paste handler.

---

### Finding: Lexical — no markdown detection on the clipboard layer

**Confidence:** CONFIRMED
**Evidence:** `~/.claude/oss-repos/lexical/packages/lexical-clipboard/src/clipboard.ts:140-208` (`$insertDataTransferForRichText`)

The Lexical clipboard handler does:
1. Try `application/x-lexical-editor` (own internal format)
2. Try `text/html` (parse via `DOMParser` + `$generateNodesFromDOM`)
3. Fall through to `text/plain` — split on `\r?\n` and tab, insert as paragraphs/text nodes

**No markdown detection.** Markdown is handled separately via `MarkdownShortcutPlugin`, which acts on **typing-time input rules** (e.g., `# ` followed by space → heading), not on clipboard content.

**Implication:** Lexical users who paste markdown source see literal `**bold**` as plain text — markdown is not recognized at the paste boundary by default. This is a deliberate design choice; the input rules handle interactive typing, not bulk paste.

---

### Finding: tiptap-markdown — unconditional parsing (no is-markdown heuristic)

**Confidence:** CONFIRMED
**Evidence:** `~/.claude/oss-repos/tiptap-markdown/src/extensions/tiptap/clipboard.js:19-29`

```javascript
clipboardTextParser: (text, context, plainText) => {
  if (plainText || !this.options.transformPastedText) {
    return null;  // shift-key opt-out, OR opt-in disabled
  }
  const parsed = this.editor.storage.markdown.parser.parse(text, { inline: true });
  return DOMParser.fromSchema(this.editor.schema)
    .parseSlice(elementFromString(parsed), {
      preserveWhitespace: true, context,
    });
},
```

**Pattern:** When `transformPastedText: true`, every `text/plain` paste is unconditionally fed to the markdown parser. No content inspection. The shift-key plain flag is the only opt-out.

**False-positive class:** Every plain-text paste becomes markdown-parsed. Pasting a quoted email body with `> Re: subject` would auto-convert to a blockquote. This is the cost of unconditional parsing; the package leaves it to consumers to gate the extension if they need a more conservative pattern.

---

### Finding: `@github/paste-markdown` — MIME-type-only detection

**Confidence:** CONFIRMED
**Evidence:** `https://github.com/github/paste-markdown/blob/main/src/paste-markdown-text.ts` (verified via WebFetch on 2026-04-30)

```typescript
function hasMarkdown(transfer: DataTransfer): boolean {
  return Array.from(transfer.types).indexOf('text/x-gfm') >= 0
}
// usage:
if (!transfer || !hasMarkdown(transfer)) return
const text = transfer.getData('text/x-gfm')
```

**Pattern:** No content inspection. GitHub itself emits `text/x-gfm` on copy from rendered markdown views, so its paste handler trusts the MIME tag. This is the **MIME-promotion** approach — the source declares "this is markdown" by MIME type, the consumer reads that declaration without re-validating.

**Implication for the survey:** GitHub solves the "is text/plain markdown?" problem by **never asking the question** — they emit a custom MIME type at the source and look for it at the destination. This is structurally different from any of the parse-based or heuristic-based approaches; it requires both ends to cooperate.

---

### Finding: No npm package exists for stand-alone is-markdown detection

**Confidence:** CONFIRMED
**Evidence:** Searches on npm for `"is-markdown"`, `"detect-markdown"`, `"looks-like-markdown"`, `"markdown-detect"` — no relevant packages. The closest match is `marky-markdown` (npm's own README parser, not detection). `@github/paste-markdown` exists but uses MIME-only detection, not content scanning.

```
Search: "is-markdown" detect markdown text heuristic
Result: no detection-only library; results dominated by parsers (markdown-it, marked, simple-markdown)
```

**Implication:** The two content-scanning is-markdown implementations (Outline, BlockNote) are both **inlined into editor codebases**, not extracted to libraries. There's no convergence on a shared package, and no signal that the broader ecosystem treats this as a separable concern.

---

### Finding: Outline's heuristic is missing six signals that BlockNote checks

**Confidence:** CONFIRMED
**Evidence:** Cross-comparison of `outline/.../isMarkdown.ts` vs `blocknote/.../detectMarkdown.ts`:

| Signal | Outline | BlockNote | OK |
|---|---|---|---|
| ATX headings (`# `) | scores 1 each | matches | scores 1 |
| Code fences (\`\`\` paired) | scores N (count) | matches | scores 1 |
| Bullet markers (`-`/`*`) | scores 1 each | requires 2 items | scores 1 |
| Numbered lists (`1.`) | NOT checked | requires 2 items | scores 1 |
| Inline link `[a](url)` | scores 2 each | matches | scores 1 |
| Relative link `[a](/url)` | scores 2 each | (subset of `link`) | NOT checked |
| GFM table separator | scores 1 each | matches | scores 1 (paired with row) |
| Inline code `` `code` `` | NOT checked | matches | NOT checked |
| Bold/italic `**` `*` `_` | NOT checked | matches | NOT checked |
| Strikethrough `~~` | NOT checked | matches | NOT checked |
| Highlight `==` `++` | NOT checked | matches | NOT checked |
| Setext heading `===` `---` | NOT checked | matches | NOT checked |
| Blockquote `> ` | NOT checked | matches | NOT checked |
| Horizontal rule `---` | NOT checked | matches | NOT checked |
| LaTeX `$...$` inline | scores N (count) | NOT checked | NOT checked |
| LaTeX `$$...$$` block | (subset of inline) | NOT checked | scores 1 |

**Notable signals OK has that no peer has:** None — every signal OK checks is also checked by either Outline or BlockNote.

**Notable signals OK MISSES that BlockNote checks:** Setext headings, blockquotes, horizontal rules, inline code, emphasis (bold/italic/strike/highlight). Five of these are CommonMark-canonical block constructs (setext, blockquote, hr) or universal inline marks (code, emphasis).

**Notable signals OK has that Outline lacks:** Numbered lists (`\d+[.)]`), GFM table row check (paired with separator), block-level LaTeX (`$$...$$`).

**Why peer-divergence matters for OK's case:** OK's primary concern is OK→OK round-trip + AI-chat copy-buttons. AI chat outputs frequently use `> ` blockquotes (citations), inline `` `code` ``, and `**bold**` for emphasis — three signals OK currently misses. A medium-length AI-chat response with `## Heading` + `**emphasis**` + `> quote` + `` `code` `` currently triggers only on the heading; if the heading is absent (e.g., a plain paragraph with two bold phrases and a quoted line), OK fails to recognize it.

---

### Finding: Threshold formulas are uniformly weak — three structural choices

**Confidence:** CONFIRMED
**Evidence:** Cross-comparison of all three content-scanning implementations:

| Implementation | Formula | 1-line | 5-line | 10-line | 25-line |
|---|---|---|---|---|---|
| Outline | `signals > min(3, floor(lines/5))` | `>0` (1 wins) | `>1` | `>2` | `>3` (4 needed) |
| OK (current) | `signals >= max(1, min(3, floor(lines/5)))` | `>=1` (1 wins) | `>=1` | `>=2` | `>=3` |
| BlockNote | first match → true (no threshold) | 1 | 1 | 1 | 1 |

**Key divergence:** Outline uses `>` (strict), OK uses `>=` (inclusive). On a 1-line snippet, both require `signals >= 1` because:
- Outline: `1 > min(3, 0) = 1 > 0` → true
- OK: `1 >= max(1, 0) = 1 >= 1` → true

So the boundary case is identical. Where they differ: 5-line (Outline `signals > 1` requires 2; OK `signals >= 1` requires 1) and 25-line (Outline requires 4; OK requires 3). **OK's threshold is uniformly weaker than Outline's** — easier to trigger.

**No peer scales the threshold by byte count, by entropy, or by ML.** All three are simple line-count-or-flat-true patterns.

---

### Finding: OK's call-site gating does NOT yet match peer false-positive defenses

**Confidence:** CONFIRMED
**Evidence:** Comparison of dispatcher logic:

**Outline** (`PasteHandler.tsx:263-269`):
```typescript
if ((isMarkdown(text) && !isDropboxPaper(html) && !isContainingImage(html)) ||
    pasteCodeLanguage === "markdown" || this.shiftKey || !html) { /* MD parse */ }
```
- Defenses: Dropbox-Paper exclusion, image-HTML exclusion (Slack screenshots), shift-key opt-out, VS Code .md bypass.

**BlockNote** (`pasteExtension.ts:82-90`):
```typescript
if (prioritizeMarkdownOverHTML) {
  const plainText = event.clipboardData!.getData("text/plain");
  if (isMarkdown(plainText)) { editor.pasteMarkdown(plainText); return true; }
}
```
- Defenses: Only fires when `prioritizeMarkdownOverHTML: true` AND HTML is also present. So this path is a **tiebreaker**, not the primary classifier. Plain-text-only pastes fall through to `plainTextAsMarkdown: true` (default) which parses unconditionally.

**OK** (`packages/app/src/editor/clipboard/dispatch.ts`, per existing report D13):
- Position 9 of 10: `text/html absent, text/plain + isMarkdown() clears threshold` → MarkdownManager.parse
- Position 10: `text/plain only, no markdown signals` → plain text insert

OK's dispatcher already mirrors BlockNote's "tiebreaker" semantics (the heuristic runs only when HTML is absent or earlier branches don't fire), but lacks Outline's specific Dropbox/image-HTML negative defenses.

---

## Negative searches

- **Searched:** `~/.claude/oss-repos/{lexical,plate,payload}/**/*` for `isMarkdown|detectMarkdown|looksLikeMarkdown` → no matches in clipboard / paste paths. **CONFIRMED:** Lexical, Plate, Payload have no is-markdown heuristic.
- **Searched:** npm registry for `is-markdown`, `detect-markdown`, `looks-like-markdown`, `markdown-detect` → no relevant standalone detection package. **CONFIRMED:** No shared ecosystem library; both Outline and BlockNote inline their detector.
- **Searched:** `https://github.com/sindresorhus/is-markdown` → 404 (does not exist).
- **Searched:** ToastUI Editor's `pasteToTable.ts` → no content-scanning detector. **CONFIRMED:** ToastUI uses explicit Markdown-mode/WYSIWYG-mode toggle instead.

---

## Gaps / follow-ups

- **Iframe content / Notion outliers:** Not covered. Notion's clipboard emits both `text/html` and a `<!-- notionvc: -->`-tagged plain text; whether their plain text would trigger any of the heuristics is empirical and untested.
- **AI-chat copy-button false-negatives:** Anecdotally OK reports trouble with ChatGPT outputs that lack headings; the missing signals (blockquote, inline code, emphasis) suggest specific failure cases. A test fixture corpus from real AI-chat outputs would quantify the gap.
- **Setext-heading regex precision:** BlockNote's `title` regex requires `\n\n\s{0,64}(\w|$)` after the underline — catches valid setext, rejects "underlined-as-decoration" text. If OK adds setext, copying that precision matters; a naive `^=+$` would false-fire on horizontal rules.

