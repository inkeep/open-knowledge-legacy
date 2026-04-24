# Evidence: D14 — Prior Art: HTML Paste Handling

**Dimension:** D14 (source-level prior art across 10+ markdown-adjacent editors)
**Date:** 2026-04-15
**Sources:** Local OSS clones under `/Users/edwingomezcuellar/.claude/oss-repos/`, GitHub raw URLs for remote repos, vendor docs for closed source.

---

## Summary table

| Editor | Hook | Strategy | Source detection | Pre-cleanup | Conversion lib | Citation |
|---|---|---|---|---|---|---|
| **Obsidian** | closed (CodeMirror 6 paste dispatcher + settings toggle) | HTML → Turndown → MD → insert into CM6 source | MIME priority (text/html preferred when toggle on) | unknown | **Turndown** (via public `htmlToMarkdown(html)` API) | obsidian.d.ts |
| **Outline** | `transformPastedHTML` + `handlePaste` | passthrough PM-origin; else isMarkdown(text) branch; else PM default DOMParser | `data-pm-slice`, `isDropboxPaper`, `isContainingImage`, `isMarkdown(text)` | Strip Dropbox Paper `<div><br></div>` | Own markdown-it-based `pasteParser` | PasteHandler.tsx:49-313 |
| **BlockNote** | `handleDOMEvents.paste` (DOM-level, preventDefault) | MIME priority cascade; **markdown-first if isMarkdown(plain)**; HTML → schema parseDOM with pre-walks | `vscode-editor-data`, `blocknote/html`, `text/markdown`, Notion (`notionvc:` comment) | `nestedListsToBlockNoteStructure`, `normalizeTextNodeWhitespace` (skipped for Notion) | remark for MD→HTML, then schema parseDOM | pasteExtension.ts:18-104 |
| **Milkdown** | `transformPastedHTML` + `handlePaste` | reuse PM pre-processed Slice when HTML present; else parse text as MD | Google Docs, VS Code | Unwrap `<b id="docs-internal-guid…">` + `<div>` around tables | own markdown parser + PM DOMParser | plugin-clipboard/src/index.ts:45-147 |
| **tiptap-markdown** (community) | `clipboardTextParser` (text only) | text → MD parser (inline) → HTML → parseSlice | none (plain flag only) | none | markdown-it | clipboard.js:19-29 |
| **TipTap core** | `transformPastedHTML` (priority-ordered, composable) | no-op default; pure PM DOMParser via schema | none | none | none | paste.ts + tests |
| **`@tiptap/markdown`** (official) | — | exposes `getMarkdown()`; NOT clipboard-wired | — | — | — | Extension.ts (no hooks) |
| **Plate** (Slate) | plugin `parser: { format, deserialize }` | HTML wins over markdown (markdown parser query returns false if HTML present) | none | none | remark (md leg); `DOMParser.parseFromString` (html leg) | MarkdownPlugin.ts:107-128 |
| **Keystatic** | `clipboardTextParser` + `handlePaste` | text → Markdoc parser → PM slice; VS Code detect falls through to text | VS Code via structural HTML shape | none | Markdoc parser | clipboard.tsx:56-97 |
| **BlockSuite / AFFiNE** | custom async `paste()` API (not PM) | **adapter registry priority**: BLOCKSUITE/SNAPSHOT > notion-text > text/html > image/* > text/plain > */* | per-MIME via adapter registration | DOMPurify on snapshot path | rehype-parse + hast walker + block matchers | clipboard.ts:166-263 |
| **CKEditor 5 paste-from-office** | `inputTransformation` event priority:'high' | normalizer registry first-match-wins; per-source filter pipelines | Word regex, GDocs regex | per-source filter pipelines (hundreds of lines for Word lists) | custom view writers | pastefromoffice.ts:73-90 |
| **Typora** | closed | HTML > plain; HTML → internal MD converter | unknown | unknown | proprietary | support.typora.io |
| **HedgeDoc** | CodeMirror 6 `EditorView.domEventHandlers` (table-paste only) | source-canonical; only tables converted to MD opt-in | `isTable()` helper | none | custom `convertClipboardTableToMarkdown` | use-code-mirror-table-paste-extension.ts |

---

## Detailed findings

### Finding D14-1: Obsidian — Turndown via public API (CONFIRMED API / INFERRED pipeline)

Public API (`obsidianmd/obsidian-api/obsidian.d.ts`):
```ts
/** Converts HTML to a Markdown string. */
export function htmlToMarkdown(html: string | HTMLElement | Document | DocumentFragment): string;
```

Settings: "Convert pasted HTML to Markdown" (on by default since v0.10.1, ~Sep 2020). Off → HTML inserted as source text. Cmd+Shift+V bypasses.

Turndown usage confirmed via Obsidian Forum: https://forum.obsidian.md/t/converts-html-content-to-markdown/37200

Pre-cleanup / post-processing: Turndown defaults.

### Finding D14-2: Outline — cascade with source detection (CONFIRMED)

File: `outline/app/editor/extensions/PasteHandler.tsx:49-313, 611-623`.

```ts
function isDropboxPaper(html: string): boolean {
  return html?.includes("usually-unique-id");
}

// transformPastedHTML — strip Dropbox Paper's <div><br></div> wrappers
// handlePaste — cascade:
if (html?.includes("data-pm-slice")) return false;  // PM passthrough
if (isUrl(text)) { /* insert as link or doc mention */ }
if (vscodeMode && vscodeMode !== "markdown" && text.includes("\n")) { /* code block */ }
if (isMarkdown(text) && !isDropboxPaper(html) && !isContainingImage(html)) { /* markdown path */ }
return false;  // PM default HTML parser
```

`isMarkdown()` (`shared/editor/lib/isMarkdown.ts:1-48`): signal-counting with threshold `min(3, floor(lineCount/5))`. Checks fences, latex, links (×2 weight), relative links (×2), ATX headings, bullet markers, table separators.

### Finding D14-3: BlockNote — MIME priority cascade with markdown-first (CONFIRMED)

File: `blocknote/packages/core/src/api/clipboard/fromClipboard/pasteExtension.ts:18-104`.

MIME priority (`acceptedMIMETypes.ts`):
```ts
const acceptedMIMETypes = [
  "vscode-editor-data",
  "blocknote/html",
  "text/markdown",
  "text/html",
  "text/plain",
  "Files",
] as const;
```

Full dispatch pseudocode:
```ts
if (isInCodeBlock) → pasteText(text/plain), done
if (format === "vscode-editor-data") → handleVSCodePaste (wrap in <pre><code class="language-{mode}">)
if (format === "Files") → handleFileInsertion
if (format === "blocknote/html") → pasteHTML(data, /*raw*/ true)  // skip re-conversion
if (format === "text/markdown") → pasteMarkdown(data)
if (prioritizeMarkdownOverHTML && isMarkdown(text/plain)) → pasteMarkdown(plainText)  // cascade break
if (format === "text/html") → pasteHTML(data)
if (plainTextAsMarkdown) → pasteMarkdown(data)
→ pasteText(data)
```

**Notion detection** (`api/parsers/html/util/normalizeWhitespace.ts:9-24`):
```ts
function isNotionHTML(element) {
  const walker = element.ownerDocument.createTreeWalker(element, 128 /* comments */);
  let node;
  while ((node = walker.nextNode())) {
    if (/^\s*notionvc:/.test(node.nodeValue || "")) return true;
  }
  return false;
}
```
Used to SKIP whitespace normalization — Notion uses `\n` in text nodes as hard breaks; normalizing would eat them.

**isMarkdown heuristic** (`detectMarkdown.ts`): 13 regexes, any-match returns true. H1-H6, bold/italic/strike/highlight, inline+relative links, inline code, UL/OL (requires 2 items), HR, fences, Setext, blockquote, table row/divider.

**Configurable knobs:** `prioritizeMarkdownOverHTML` (default true), `plainTextAsMarkdown` (default true). Per-paste override via `pasteHandler({event, editor, defaultPasteHandler})`.

### Finding D14-4: Milkdown — reuse PM's preProcessedSlice (CONFIRMED, subtle)

File: `milkdown/packages/plugins/plugin-clipboard/src/index.ts:45-64, 70-132`.

```ts
transformPastedHTML: (html: string, view) => {
  if (html.includes('docs-internal-guid')) {
    html = html.replace(/<b[^>]*id="docs-internal-guid[^"]*"[^>]*>([\s\S]*)<\/b>/, '$1');
    html = html.replace(/<div[^>]*>(<table[\s\S]*?<\/table>)<\/div>/g, '$1');
  }
  return html;
},
handlePaste: (view, event, preProcessedSlice) => {
  // ... vscode-editor-data → code_block branch ...
  const html = clipboardData.getData('text/html');
  if (html.length > 0 && preProcessedSlice) {
    return dispatchPasteSlice(view, preProcessedSlice);  // ← reuse PM's work
  }
  const slice = parser(text);
  // ...
}
```

**Key insight:** PM's `parseFromClipboard` has already run `transformPastedHTML` + `transformPasted` on the slice by the time `handlePaste` fires. Milkdown consumes the `preProcessedSlice` argument instead of re-parsing — zero duplicate work.

### Finding D14-5: Plate — HTML wins over markdown (CONFIRMED)

Files: `plate/packages/markdown/src/lib/MarkdownPlugin.ts:107-128`, `plate/packages/core/src/lib/plugins/html/HtmlPlugin.ts`.

```ts
parser: {
  format: 'text/plain',
  deserialize: ({ data }) => api.markdown.deserialize(data),
  query: ({ data, dataTransfer }) => {
    const htmlData = dataTransfer.getData('text/html');
    if (htmlData) return false;       // ← HTML present → disable markdown parser
    if (!files?.length && isUrl(data)) return false;
    return true;
  },
}
```

**Opposite of BlockNote's `prioritizeMarkdownOverHTML: true` default.** Same data → different results. A design choice, not a bug.

### Finding D14-6: Keystatic — structural VS Code detection (CONFIRMED, cross-browser)

File: `keystatic/packages/keystatic/src/form/fields/markdoc/editor/markdoc/clipboard.tsx:77-97`:

```ts
function isProbablyHtmlFromVscode(html: string): boolean {
  const parser = new globalThis.DOMParser();
  const parsed = parser.parseFromString(html, 'text/html');
  const firstDiv = parsed.body.firstElementChild;
  if (
    parsed.body.childElementCount !== 1 ||
    firstDiv?.tagName !== 'DIV' ||
    !(firstDiv instanceof HTMLElement) ||
    !firstDiv.style.fontFamily.includes('monospace')
  ) return false;
  for (const line of firstDiv.children) {
    if (line.tagName === 'BR') continue;
    if (line.tagName !== 'DIV') return false;
    for (const span of line.children) {
      if (span.tagName !== 'SPAN') return false;
    }
  }
  return true;
}
```

Comment: `// vscode adds extra data to the DataTransfer but those only exist when pasted into a chromium browser — this works across browser`.

If detected: `view.pasteText(plainText)`.

### Finding D14-7: BlockSuite / AFFiNE — adapter registry (CONFIRMED)

File: `blocksuite/packages/affine/foundation/src/clipboard.ts:12-65`.

```ts
const SnapshotClipboardConfig = ClipboardAdapterConfigExtension({
  mimeType: 'BLOCKSUITE/SNAPSHOT', adapter: ClipboardAdapter, priority: 100
});
const NotionClipboardConfig = ClipboardAdapterConfigExtension({
  mimeType: 'text/_notion-text-production', adapter: NotionTextAdapter, priority: 95
});
const HtmlClipboardConfig = ClipboardAdapterConfigExtension({
  mimeType: 'text/html', adapter: HtmlAdapter, priority: 90
});
// + image/*, text/plain MixTextAdapter, */* AttachmentAdapter
```

Paste flow (`framework/std/src/clipboard/clipboard.ts:166-201`):
1. `readFromClipboard(data)` — DOMPurify text/html, look for `[data-blocksuite-snapshot]` attr with LZ-compressed JSON.
2. Fallback: iterate adapters by priority, `adapter.toSlice(item)`, first non-null wins.

`HtmlAdapter`: rehype-parse → hast → rehypeInlineToBlock + rehypeWrapInlineElements → ASTWalker → per-tag `BlockHtmlAdapterMatcher`.

`NotionHtmlAdapter`: separate class with its own delta converter + block matchers — Notion's HTML export is distinct enough to warrant dedicated path.

### Finding D14-8: CKEditor 5 paste-from-office — the depth reference (CONFIRMED)

`ckeditor5-paste-from-office/src/pastefromoffice.ts:73-90`:
```ts
clipboardPipeline.on('inputTransformation', (evt, data) => {
  const htmlString = data.dataTransfer.getData('text/html');
  const activeNormalizer = normalizers.find(n => n.isActive(htmlString));
  if (!activeNormalizer) return;
  data._parsedData = parsePasteOfficeHtml(htmlString, viewDocument.stylesProcessor);
  activeNormalizer.execute(data);
  data.content = data._parsedData.body;
}, { priority: 'high' });
```

Normalizers: MSWord, GoogleDocs, GoogleSheets.

**MSWord filter pipeline** (in execute):
1. `transformBookmarks` — convert Word bookmarks
2. `transformListItemLikeElementsIntoLists(stylesString, hasMultiLevelListPlugin)` — the heart of Word paste; extracts `mso-list:l1 level1 lfo1` from `<style>` block, reconstructs nested `<ol>/<ul>` from flat paragraphs with indent/counter tracking
3. `replaceImagesSourceWithBase64(rtfData)` — pull images from RTF payload
4. `transformTables(hasTablePropertiesPlugin)`
5. `removeInvalidTableWidth`
6. `replaceMSFootnotes`
7. `removeMSAttributes` — strip `mso-*` classes/styles, unwrap `w:sdt`, `o:p`, SmartTag

**GoogleDocs filter pipeline:**
1. `removeBoldWrapper` — strip `<b id="docs-internal-guid-…">`
2. `unwrapParagraphInListItem` — `<li><p>…</p></li>` → `<li>…</li>`
3. `transformBlockBrsToParagraphs`
4. `replaceTabsWithinPreWithSpaces` (width 8)

**Stability signal:** Word list reconstruction alone is hundreds of lines. CKEditor has iterated this since 2018. Most battle-tested in the browser ecosystem.

### Finding D14-9: HedgeDoc — table-paste-only (CONFIRMED)

File: `hedgedoc/frontend/src/components/editor-page/editor-pane/hooks/table-paste/`.

Source-canonical arch: HTML paste lands in CM6 as text. ONE HTML-smart behavior: if clipboard HTML contains a `<table>` and `smartPaste` is enabled, convert to markdown table before insert.

**No Turndown, no generic HTML→MD.** Pasting rich HTML gets HTML markup as literal text in source — correct for a source-canonical editor.

### Finding D14-10: TipTap core + `@tiptap/markdown` — gap (CONFIRMED NOT FOUND)

TipTap core `Paste` extension: emits `paste` event, zero transformation.

`@tiptap/markdown` official: exposes `editor.getMarkdown()`, `editor.markdown.parse/serialize`, `contentType: 'markdown'` for `setContent` — but zero clipboard hooks (confirmed via grep of `tiptap/packages/markdown/src/*`).

Default behavior: pure PM DOMParser via schema `parseDOM` rules.

### Finding D14-11: tiptap-markdown (community) — text-only path (CONFIRMED)

File: `tiptap-markdown/src/extensions/tiptap/clipboard.js:19-29`.

```js
clipboardTextParser: (text, context, plainText) => {
  if (plainText || !this.options.transformPastedText) return null;
  const parsed = this.editor.storage.markdown.parser.parse(text, { inline: true });
  return DOMParser.fromSchema(this.editor.schema)
    .parseSlice(elementFromString(parsed), { preserveWhitespace: true, context });
},
```

No `transformPastedHTML`. No source detection. TipTap's default `parseDOM` handles HTML.

---

## Dominant patterns

### Pattern 1: HTML → markdown string → native parser (lossy round-trip)
- **Editors:** Obsidian, tiptap-markdown (text path)
- Pros: simple, single source of truth
- Cons: attributes lost on round-trip; MDX/custom types need custom rules

### Pattern 2: HTML → pre-walks → schema parseDOM (tree-first)
- **Editors:** BlockNote (nested lists + whitespace), Milkdown (Google Docs unwrap), Plate, CKEditor paste-from-office
- Pros: richer fidelity via schema attr extraction; per-source pre-walks
- Cons: every vendor quirk is a per-source branch; schema rules duplicate information

### Pattern 3: Source-aware branching (priority cascade)
- **Editors:** BlockNote (6-MIME cascade), Outline (VS Code mode + isMarkdown + PM passthrough)
- Pros: round-trip fidelity for own HTML; respects user intent
- Cons: priority order becomes a design contract; isMarkdown false-positives visible

### Pattern 4: Adapter registry (pluggable, per-MIME)
- **Editors:** BlockSuite/AFFiNE, CKEditor
- Pros: cleanest extensibility; per-source code isolated; one class = one source
- Cons: heavier infrastructure; MIME dispatch doesn't solve cases living inside text/html

### Pattern 5: Markdown-first with HTML fallback (always-parse)
- **Editors:** tiptap-markdown (opt-in), Plate (HTML-absent only)
- Pros: architecturally consistent with MD-canonical storage
- Cons: "looks like markdown + rich HTML available" forces choice

---

## Outlier patterns worth noting

1. **Structural VS Code detection (Keystatic)** — cross-browser, zero dependency on Chromium's custom MIME.
2. **Own-editor HTML passthrough (Outline, BlockNote)** — `data-pm-slice` / `blocknote/html` short-circuits cleanup entirely.
3. **Reuse PM's preProcessedSlice (Milkdown)** — consume `handlePaste`'s third argument instead of re-parsing. Most subtle pattern.
4. **Notion `<!-- notionvc: UUID -->` comment as semantic marker (BlockNote)** — defensively skips whitespace normalization because Notion uses literal `\n` as hard breaks.
5. **RTF sibling-data extraction (CKEditor)** — Word puts images in `text/rtf`, not `text/html`. `replaceImagesSourceWithBase64(documentFragment, rtfData)` joins MIMEs at paste time. Unique.
6. **Google Docs double-unwrap (Milkdown)** — TWO regexes needed: the outer `<b id="docs-internal-guid">` AND the per-table `<div dir="ltr">`. Either alone leaves multiple tables broken.

---

## What nobody does (CONFIRMED NOT FOUND)

1. **No surveyed editor runs HAST→MDAST→native conversion on paste.** BlockNote markdown *export* uses MDAST; on paste, even BlockNote goes MD → HTML → Blocks via HTMLToBlocks. Opportunity for us.
2. **No editor writes `text/markdown` MIME on copy AND reliably reads it from third-parties.** BlockNote reads `text/markdown` but writes `text/plain` for markdown.
3. **No editor preserves arbitrary HTML-block round-trip.** R18 Archetype Z (strip/literal) is the majority.
4. **No editor applies DOMPurify at paste time (except BlockSuite, snapshot-only path).** XSS is treated as render-layer. Matches our NG4.
5. **No community implementation replicates CKEditor-grade Word list reconstruction.** All others lean on schema `parseDOM`. Opportunity to port if Word paste matters.
6. **No shared `isMarkdown()` function across editors.** Outline (signal-scoring) vs BlockNote (13-regex any-match) are structurally independent.

---

## Code snippets worth stealing

### Snippet 1 — BlockNote's Notion comment detection
```ts
function isNotionHTML(element: HTMLElement): boolean {
  const walker = element.ownerDocument.createTreeWalker(element, 128);
  let node: Node | null;
  while ((node = walker.nextNode())) {
    if (/^\s*notionvc:/.test(node.nodeValue || "")) return true;
  }
  return false;
}
```

### Snippet 2 — Milkdown's Google Docs transformPastedHTML
```ts
transformPastedHTML: (html: string, view: EditorView) => {
  if (html.includes('docs-internal-guid')) {
    html = html.replace(/<b[^>]*id="docs-internal-guid[^"]*"[^>]*>([\s\S]*)<\/b>/, '$1');
    html = html.replace(/<div[^>]*>(<table[\s\S]*?<\/table>)<\/div>/g, '$1');
  }
  return html;
},
```

### Snippet 3 — Keystatic's cross-browser VS Code detection
(see Finding D14-6 above)

### Snippet 4 — CKEditor's normalizer registry pattern
```ts
clipboardPipeline.on('inputTransformation', (evt, data) => {
  const html = data.dataTransfer.getData('text/html');
  const activeNormalizer = normalizers.find(n => n.isActive(html));
  if (!activeNormalizer) return;
  data._parsedData = parsePasteOfficeHtml(html, stylesProcessor);
  activeNormalizer.execute(data);
  data.content = data._parsedData.body;
}, { priority: 'high' });
```

---

## Sources

All accessed 2026-04-15.

Local OSS cache (`/Users/edwingomezcuellar/.claude/oss-repos/`):
- Outline: `app/editor/extensions/PasteHandler.tsx`, `shared/editor/lib/isMarkdown.ts`, `shared/editor/lib/markdown/normalize.ts`
- BlockNote: `packages/core/src/api/clipboard/fromClipboard/pasteExtension.ts`, `acceptedMIMETypes.ts`, `handleVSCodePaste.ts`, `api/parsers/html/parseHTML.ts`, `util/nestedLists.ts`, `util/normalizeWhitespace.ts`, `api/parsers/markdown/parseMarkdown.ts`, `api/parsers/markdown/detectMarkdown.ts`, `docs/content/docs/reference/editor/paste-handling.mdx`
- Milkdown: `packages/plugins/plugin-clipboard/src/index.ts`, `src/__internal__/is-pure-text.ts`
- tiptap-markdown: `src/extensions/tiptap/clipboard.js`
- TipTap: `packages/core/src/extensions/paste.ts`, `packages/markdown/src/Extension.ts`
- Plate: `packages/markdown/src/lib/MarkdownPlugin.ts`, `packages/core/src/lib/plugins/html/HtmlPlugin.ts`
- Keystatic: `packages/keystatic/src/form/fields/markdoc/editor/markdoc/clipboard.tsx`
- BlockSuite: `packages/framework/std/src/clipboard/clipboard.ts`, `packages/affine/foundation/src/clipboard.ts`, `packages/affine/shared/src/adapters/html/html.ts`, `adapters/notion-html/notion-html.ts`

WebFetch / WebSearch:
- https://raw.githubusercontent.com/ckeditor/ckeditor5/master/packages/ckeditor5-paste-from-office/src/{pastefromoffice.ts,normalizers/mswordnormalizer.ts,normalizers/googledocsnormalizer.ts,filters/list.ts,filters/parse.ts,filters/removemsattributes.ts}
- https://raw.githubusercontent.com/obsidianmd/obsidian-api/master/obsidian.d.ts
- https://forum.obsidian.md/t/converts-html-content-to-markdown/37200
- https://forum.obsidian.md/t/make-optional-turn-on-off-paste-that-converts-html-content-to-markdown-links/10096
- https://support.typora.io/Copy-and-Paste/
- https://github.com/hedgedoc/hedgedoc/blob/develop/frontend/src/components/editor-page/editor-pane/hooks/table-paste/use-code-mirror-table-paste-extension.ts

Cross-references:
- reports/tiptap-clipboard-round-trip-markdown/evidence/d3-prior-art-copy-to-markdown.md (companion — copy direction)
- reports/tiptap-clipboard-round-trip-markdown/evidence/d6-paste-symmetry-revisit.md
- reports/markdown-editor-paste-and-html-survey/REPORT.md (R18)
