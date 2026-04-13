# I3: Paste Handler + Frontmatter Edge Cases

## Part A: Browser Rich-Text Paste

### Paste flow (TipTap → ProseMirror → Y.Doc)

The paste path is a 5-stage pipeline with **no custom Open Knowledge handling**:

1. **ClipboardEvent** — browser fires `paste` on EditorView DOM
2. **ProseMirror `input.ts`** — reads `getData("text/html")` and `getData("text/plain")` from `ClipboardData`
3. **`parseFromClipboard()`** (prosemirror-view `clipboard.ts:43`) — decides text vs HTML path:
   - If `text/html` is present AND not shift-pasted → HTML path
   - If only `text/plain` or shift-held → text path (splits on `\n`, wraps in `<p>`)
4. **HTML path**: calls `transformPastedHTML` (composable chain from TipTap extensions — **none registered in our codebase**), then `readHTML()` which sets `elt.innerHTML = html` on a detached DOM, then `DOMParser.fromSchema(schema).parseSlice(dom)` to produce a ProseMirror Slice
5. **TipTap Paste extension** (`@tiptap/core/src/extensions/paste.ts`) — only emits `editor.emit('paste', ...)` event. No interception, no transformation.

### Key findings

| Question | Answer |
|----------|--------|
| text/html vs text/plain priority | HTML wins unless shift-paste or `inCode` context |
| Entity handling (`&amp;`) | Decoded by browser's `innerHTML` setter → ProseMirror sees `&` in text node. Round-trip preserves decoded form. **PASS** |
| HTML sanitization | **None.** ProseMirror uses `elt.innerHTML = html` on a detached `<div>`. No DOMPurify, no sanitize-html. No sanitization dependency in any `package.json`. Attack surface: XSS via `<script>`, `onerror`, `<iframe>` in pasted HTML. Mitigated in practice because ProseMirror's `DOMParser.parseSlice()` only creates nodes matching the schema — `<script>` and event handlers are dropped. But `readHTML()` executes them momentarily in the detached doc. |
| Custom paste handler in codebase? | **No.** `TiptapEditor.tsx` and `SourceEditor.tsx` only register `paste` as a `markUserTyping()` trigger. No `handlePaste`, `transformPastedHTML`, or `clipboardTextParser` registered. |
| Markdown-as-plain-text paste | Treated as literal text, split on `\n`, wrapped in `<p>` nodes. No markdown detection or parsing. Pasting `# Heading` yields a paragraph containing "# Heading", not a heading node. |

### Fidelity gaps

1. **No markdown paste detection** — users copying markdown source from terminals/editors get literal text instead of parsed structure. This is a common TipTap gap; solutions exist (tiptap-markdown's `clipboardTextParser`).
2. **No `transformPastedHTML`** — pasting from Google Docs, Notion, etc. brings in their CSS class soup. ProseMirror strips unrecognized nodes but preserves recognized marks (bold, italic) heuristically.
3. **Momentary XSS in detached doc** — `readHTML()` sets `innerHTML` on a detached document element. In practice, scripts don't execute in detached contexts in modern browsers, but older browser behavior varies.

---

## Part B: Frontmatter Edge Cases

### Implementation analysis

`packages/core/src/extensions/frontmatter.ts` uses a single regex:

```
const FRONTMATTER_RE = /^---\n[\s\S]*?\n---\n?/;
```

- **No YAML parser** — purely regex-based. Treats frontmatter as an opaque string blob.
- **No library dependencies** — no gray-matter, no yaml, no remark-frontmatter.
- `stripFrontmatter()` extracts the matched region; `prependFrontmatter()` concatenates it back.

### Edge-case test results

Script: `evidence/frontmatter-edge-cases.ts` — 10 pathological inputs through `stripFrontmatter` + `prependFrontmatter`.

| # | Case | Result | Notes |
|---|------|--------|-------|
| 1 | Value containing `---` (quoted) | **PASS** | Regex non-greedy; indented/quoted `---` doesn't match `\n---\n` |
| 2 | Multi-line YAML literal block with `---` | **PASS** | Indented `  ---` doesn't match `\n---\n`. Full frontmatter correctly captured. |
| 3 | Nested YAML object | **PASS** | Normal case |
| 4 | Markdown syntax in YAML value | **PASS** | Opaque blob, no parsing interference |
| 5 | JSON frontmatter between `---` | **PASS** | Treated as opaque blob — works by accident |
| 6 | TOML frontmatter (`+++` delimiters) | **PASS** (not detected) | Correctly returns empty frontmatter. TOML unsupported by design. |
| 7 | Windows CRLF line endings | **FAIL** | Regex requires `\n`, CRLF (`\r\n`) doesn't match. Frontmatter lost. |
| 8 | Empty frontmatter block (`---\n---\n`) | **FAIL** | Regex requires `\n` before closing `---` via `[\s\S]*?\n---`. Empty block has no content newline. |
| 9 | Trailing whitespace on `---` delimiters | **PASS** (not detected) | `---  \n` doesn't match `---\n`. Strict but consistent. |
| 10 | Leading whitespace before `---` | **PASS** (not detected) | ` ---` doesn't match `^---`. Correct per YAML spec. |

### Classification

**True bugs (round-trip data loss):**
- **CRLF** (#7): Windows-origin files silently lose frontmatter. Fix: `\r?\n` in regex.
- **Empty frontmatter** (#8): Valid YAML (`---\n---\n`). Fix: change `[\s\S]*?\n---` to `[\s\S]*?\n?---` or `(?:[\s\S]*?\n)?---`.

**By-design limitations (documented, not bugs):**
- TOML (`+++`) not supported — no Hugo/TOML ecosystem need.
- Trailing whitespace on delimiters — strict but matches gray-matter behavior.

**Comparison with gray-matter:**
- gray-matter handles CRLF, empty blocks, custom delimiters, JSON/TOML, and returns parsed YAML objects.
- Our impl intentionally treats frontmatter as opaque blob (no parsing = no data loss from YAML re-serialization). This is correct for round-trip fidelity but means we can't validate or manipulate frontmatter programmatically.

### Jekyll/Hugo/Next.js/MDX frontmatter variants

| Platform | YAML `---` | TOML `+++` | JSON `{...}` | Notes |
|----------|:---:|:---:|:---:|-------|
| Jekyll | Yes | No | No | Original spec |
| Hugo | Yes | Yes | Yes | Most permissive |
| Next.js/MDX | Yes | No | No | gray-matter default |
| Remark ecosystem | Yes | Plugin | Plugin | remark-frontmatter supports YAML/TOML |
| **Open Knowledge** | **Yes** | **No** | **Partial** | JSON works inside `---` delimiters but isn't detected as JSON specifically |
