# Cluster: C5 — Newer Frameworks + Misc

## Editor: Lexical (Meta)

### D1 — Paste handling

1. **Detection strategy** — No built-in markdown paste detection. Lexical's `@lexical/markdown` package provides `$convertFromMarkdownString()` for import but does **not** register a `PASTE_COMMAND` handler by default. Consumers must write a custom plugin that listens to `PASTE_COMMAND` and calls the conversion function. **CONFIRMED** — [lexical-markdown docs](https://lexical.dev/docs/packages/lexical-markdown); [StackBlitz example of custom MarkdownPastePlugin](https://stackblitz.com/edit/facebook-lexical-ho6jetcr?file=src/plugins/MarkdownPastePlugin.tsx); clipboard.ts in `@lexical/clipboard` has no markdown-specific logic.

2. **Default behavior** — Paste is processed by `$insertDataTransferForRichText()` in `@lexical/clipboard/src/clipboard.ts`. Priority: (1) `application/x-lexical-editor` JSON, (2) `text/html` via DOMParser + `$generateNodesFromDOM`, (3) `text/plain` as raw text. Markdown in plain text is inserted verbatim — no auto-conversion. **CONFIRMED** — [clipboard.ts source](https://github.com/facebook/lexical/blob/main/packages/lexical-clipboard/src/clipboard.ts).

3. **Syntax coverage** — When explicitly invoked via `$convertFromMarkdownString()`, the built-in TRANSFORMERS cover: headings (H1-H6), unordered/ordered lists, checklists, blockquotes, fenced code blocks, bold (`**`/`__`), italic (`*`/`_`), strikethrough (`~~`), inline code, links, images. No table support in built-in transformers. Custom transformers can be registered. **CONFIRMED** — [transformer exports](https://lexical.dev/docs/packages/lexical-markdown); [DeepWiki Lexical markdown](https://deepwiki.com/facebook/lexical/4.4-markdown-importexport-and-shortcuts).

4. **HTML paste** — HTML is parsed via `DOMParser().parseFromString()` wrapped in `trustHTML()` (Trusted Types API integration). The DOM is then walked by `$generateNodesFromDOM()` from `@lexical/html`, which looks up registered node conversions by tag name. Unregistered tags are skipped but their children are hoisted. **CONFIRMED** — clipboard.ts source + [@lexical/html source](https://github.com/facebook/lexical/blob/main/packages/lexical-html/src/index.ts).

5. **Sanitization** — Minimal. Only `<style>` and `<script>` tags are in the `IGNORE_TAGS` set in `$generateNodesFromDOM`. No DOMPurify, no sanitize-html. Security relies on the node conversion allowlist — unrecognized tags have children hoisted, attributes are not preserved unless a converter explicitly handles them. `trustHTML()` passes content through to Trusted Types without modification. **CONFIRMED** — @lexical/html source code.

6. **Escape hatches** — `$insertDataTransferForPlainText()` exists for plain-text-only paste. Consumers can register `PASTE_COMMAND` at different priorities to override. The `SELECTION_INSERT_CLIPBOARD_NODES_COMMAND` is dispatched before insertion, allowing plugins to intercept. **CONFIRMED** — clipboard.ts source.

### D2 — HTML-in-markdown rendering

1. **Raw HTML rendering** — Lexical's `@lexical/markdown` does **not** handle raw HTML within markdown. `$convertFromMarkdownString()` uses regex-based transformers only. HTML tags (`<div>`, `<span>`, `<sub>`, etc.) embedded in markdown are treated as literal text. **CONFIRMED** — [MarkdownImport.ts source](https://github.com/facebook/lexical/blob/main/packages/lexical-markdown/src/MarkdownImport.ts) — no HTML parsing in the import pipeline.

2. **Rendering mode** — N/A by default. If a consumer builds a custom HTML node (using `DecoratorNode`), raw HTML can be rendered, but this requires explicit implementation. Lexical itself provides no built-in raw-HTML-in-markdown node. **CONFIRMED** — [Lexical DecoratorNode discussions](https://github.com/facebook/lexical/discussions/3161).

3. **Editability** — No WYSIWYG editing of raw HTML. DecoratorNodes are "black boxes" — Lexical delegates rendering to React inside them, but text selection/editing doesn't cross the boundary. **CONFIRMED** — [Discussion #2562](https://github.com/facebook/lexical/discussions/2562).

4. **Round-trip survival** — Raw HTML in markdown does not survive import via `$convertFromMarkdownString()` — it becomes literal text or is lost. Export via `$convertToMarkdownString()` only outputs constructs with registered transformers. **INFERRED** — based on confirmed absence of HTML handling in import/export code.

5. **Security approach** — The conversion allowlist approach means only explicitly registered node types render. Unrecognized HTML becomes text. For custom DecoratorNodes rendering HTML, security is the consumer's responsibility. **CONFIRMED**.

6. **Known issues** — [Issue #7663](https://github.com/facebook/lexical/issues/7663) — `$convertFromMarkdownString` can't insert nodes at arbitrary positions. No built-in support for nested lists in markdown import. MDXEditor (built on Lexical) documents markdown processing as "fairly limited." **CONFIRMED**.

---

## Editor: Logseq

### D1 — Paste handling

1. **Detection strategy** — Logseq uses a multi-path detection in `paste.cljs`. It reads both `text/html` and `text/plain` from clipboard. For markdown detection, `markdown-blocks?` uses the regex `(?m)^\s*(?:[-+*]|#+)\s+` to identify lines starting with list markers (`-`, `+`, `*`) or headings (`#`). **CONFIRMED** — [paste.cljs source](https://github.com/logseq/logseq/blob/master/src/main/frontend/handler/paste.cljs).

2. **Default behavior** — Routes by context: (a) if editing a "display-type" block or markdown source, pastes as plain text in one block; (b) if clipboard has HTML, converts via `html-parser/convert` (silent, auto); (c) if plain text matches `markdown-blocks?`, parses into structured blocks via `paste-text-parseable`; (d) otherwise, segments text into bullet blocks. URL detection triggers special behavior (video/Twitter wrapping). **CONFIRMED** — paste.cljs source.

3. **Syntax coverage** — The `markdown-blocks?` regex detects headings and list markers only. The full parsing via `paste-text-parseable` feeds through mldoc which handles standard CommonMark + GFM constructs. HTML paste goes through Hickory parser with broader coverage. **CONFIRMED** — paste.cljs + [html_parser.cljs source](https://github.com/logseq/logseq/blob/master/src/main/frontend/extensions/html_parser.cljs).

4. **HTML paste** — Logseq uses Hickory (ClojureScript HTML parser) to convert HTML to Hiccup format, then transforms to markdown/org-mode via `hiccup->doc`. Handles 40+ HTML tags with format-aware conversion (bold → `**`, italic → `*`, etc.). Falls back gracefully on parse errors. **CONFIRMED** — html_parser.cljs source.

5. **Sanitization** — Custom `denied-tags` set blocks: `script`, `base`, `head`, `link`, `meta`, `style`, `title`, `comment`, `xml`, `svg`, `frame`, `frameset`, `embed`, `object`, `canvas`, `applet`. Strips inline `style` and `data-*` attributes. Blocks unsafe data URIs (non-base64). HTML entity decoding via `goog.string.unescapeEntities`. **CONFIRMED** — html_parser.cljs source.

6. **Escape hatches** — `editor/paste-text-in-one-block-at-point` command pastes as plain text in a single block (accessible via shortcut config). Ctrl+Shift+V behavior differs from Ctrl+V. **CONFIRMED** — [shortcut/config.cljs](https://github.com/logseq/logseq/blob/master/src/main/frontend/modules/shortcut/config.cljs).

### D2 — HTML-in-markdown rendering

1. **Raw HTML rendering** — Logseq does **not** honor inline HTML in its visual/block mode. The mldoc parser has a known open issue (#100) for `Inline_raw_html` support. HTML tags at line start are incorrectly treated as block-level, fragmenting inline content. **CONFIRMED** — [mldoc issue #100](https://github.com/logseq/mldoc/issues/100); [community discussion](https://discuss.logseq.com/t/how-to-mark-up-acronyms-in-logseq-markdown-html-including-the-abbr-tag-seems-unsupported/28205).

2. **Rendering mode** — Raw HTML in markdown files is generally shown as raw text in the block editor. Some tags (`<b>`, `<i>`, `<u>`) may render partially through mldoc's inline formatting detection, but `<sub>`, `<kbd>`, `<details>`, `<abbr>` do not render. **INFERRED** — based on mldoc issue #100 discussion + community reports.

3. **Editability** — No WYSIWYG editing of raw HTML. Users must edit the markdown source directly. Logseq is an outliner, not a true WYSIWYG editor. **CONFIRMED** — [WYSIWYG feature request](https://discuss.logseq.com/t/wysiwyg-editing-mode/2216) remains open.

4. **Round-trip survival** — HTML in `.md` files is preserved on disk (Logseq stores markdown files directly). However, rendering in the UI is limited/broken. The HTML is not stripped — it survives the file round-trip but may not display correctly. **INFERRED** — Logseq's outliner writes directly to markdown files; mldoc parses but doesn't remove unrecognized HTML.

5. **Security approach** — The `denied-tags` blocklist in html_parser.cljs applies to paste operations. For rendering markdown files with HTML, mldoc's limited HTML support means most raw HTML is shown as text, providing implicit security through non-rendering. **INFERRED**.

6. **Known issues** — [mldoc #100](https://github.com/logseq/mldoc/issues/100) — inline HTML at line start breaks into block fragments (OPEN since 2021). [logseq #8760](https://github.com/logseq/logseq/issues/8760) — pasting markdown with code blocks creates formatting issues. [logseq #10226](https://github.com/logseq/logseq/issues/10226) — pasting HTML from web creates incorrect org syntax (Unicode NBSP issue). **CONFIRMED**.

---

## Editor: StackEdit

### D1 — Paste handling

1. **Detection strategy** — StackEdit's cledit core (`cleditCore.js`) intercepts paste events and checks for both `text/plain` and `text/html` clipboard data. It prioritizes HTML: if `text/html` is present AND a TurndownService instance is configured, it converts HTML→markdown. There is no heuristic to detect whether plain text *is* markdown — it's always treated as raw text. The HTML→markdown path is the detection mechanism. **CONFIRMED** — [cleditCore.js source](https://github.com/benweet/stackedit/blob/d2af43ac1cbbffb216f5ffac1c32e8b5aeee4ebd/src/services/editor/cledit/cleditCore.js).

2. **Default behavior** — `evt.preventDefault()` blocks native paste. If HTML is available: sanitize → TurndownService → insert as markdown. If only plain text: insert directly. This means pasting from a web page auto-converts HTML to markdown syntax. Pasting raw markdown from a text editor inserts verbatim (correct behavior for a source editor). **CONFIRMED** — cleditCore.js source.

3. **Syntax coverage** — Coverage depends on TurndownService configuration. TurndownService (from `turndown` npm package) handles: headings, paragraphs, links, images, bold, italic, code, blockquotes, lists, horizontal rules, line breaks. Extended rules can add tables, strikethrough, etc. **INFERRED** — based on TurndownService defaults; exact StackEdit configuration not confirmed in source.

4. **HTML paste** — HTML is sanitized via custom `htmlSanitizer` then converted to markdown by TurndownService. The `&#160;` entities are replaced with spaces before conversion. Errors in conversion are silently caught. **CONFIRMED** — cleditCore.js source.

5. **Sanitization** — Custom regex-based HTML sanitizer (`src/libs/htmlSanitizer.js`) with explicit allowlists. Allowed block tags: `div`, `p`, `h1`-`h6`, `blockquote`, `pre`, `table`, `ul`, `ol`, `dl`, `figure`, `iframe`, etc. Allowed inline: `a`, `b`, `em`, `strong`, `code`, `kbd`, `sub`, `sup`, `img`, `span`, `abbr`, `mark`, etc. Sanitizes URIs (only http/https/ftp/mailto/tel/file/data protocols). Blocks `<script>`/`<style>` content entirely. Encodes dangerous characters. SVG tags partially allowed (no animation elements). **CONFIRMED** — [htmlSanitizer.js source](https://github.com/benweet/stackedit/blob/master/src/libs/htmlSanitizer.js).

6. **Escape hatches** — No explicit "paste as plain text" shortcut found in the source. The paste handler always runs. Since StackEdit is a source editor (you edit markdown text directly), pasting plain text is already the default for non-HTML clipboard content. **INFERRED** — no alternative paste mode found in codebase search.

### D2 — HTML-in-markdown rendering

1. **Raw HTML rendering** — StackEdit is a split-pane editor: left pane shows markdown source (with syntax highlighting), right pane shows rendered HTML preview. Raw HTML in markdown (`<div>`, `<span>`, `<kbd>`, `<details>`, etc.) is rendered in the **preview pane** via markdown-it, which has `html: true` by default for CommonMark compatibility. The source pane shows raw HTML as syntax-highlighted markup. **CONFIRMED** — [StackEdit architecture (DeepWiki)](https://deepwiki.com/benweet/stackedit/1-overview); grammar service shows `markup.tag` pattern for HTML.

2. **Rendering mode** — Preview pane renders actual HTML (not sandboxed, not escaped). The preview is a rendered DOM. The source pane shows raw text. This is the standard split-pane markdown editor approach. **INFERRED** — standard markdown-it `html: true` behavior; confirmed by architecture docs showing section-based DOM rendering.

3. **Editability** — Raw HTML is edited in the source pane as text. The preview is read-only. No WYSIWYG editing of HTML elements. **CONFIRMED** — StackEdit is a source editor with preview, not a WYSIWYG editor.

4. **Round-trip survival** — Yes. Since StackEdit edits markdown source directly, raw HTML in the document is preserved byte-for-byte. The preview rendering doesn't modify the source. **CONFIRMED** — source editor architecture means no lossy transformation.

5. **Security approach** — The preview pane uses the same custom `htmlSanitizer` for any HTML that passes through the rendering pipeline. The sanitizer's allowlist blocks `<script>`, `<style>`, and SVG animation elements. `<iframe>` is explicitly allowed (for YouTube embeds), with `allowfullscreen` attribute permitted. URI sanitization limits protocols. **CONFIRMED** — htmlSanitizer.js source.

6. **Known issues** — [Issue #1000](https://github.com/benweet/stackedit/issues/1000) — custom HTML rendering limitations during export/publish (resolved in v5 with Handlebars templates). [Issue #883](https://github.com/benweet/stackedit/issues/883) — clipboard image paste not supported. No major open issues about raw HTML rendering in preview. **CONFIRMED**.

---

## Editor: Ghost (Koenig/Lexical)

### D1 — Paste handling

1. **Detection strategy** — Ghost uses a dedicated `MarkdownPastePlugin.jsx` that responds to `PASTE_MARKDOWN_COMMAND`. This is **not** a heuristic detector — it's a command explicitly dispatched when markdown content is identified upstream. The plugin itself does not auto-detect markdown from `text/plain`. The `DragDropPastePlugin.jsx` handles HTML detection via `event.dataTransfer.getData('text/html')`. **CONFIRMED** — [MarkdownPastePlugin.jsx](https://github.com/TryGhost/Koenig/blob/main/packages/koenig-lexical/src/plugins/MarkdownPastePlugin.jsx); [DragDropPastePlugin.jsx](https://github.com/TryGhost/Koenig/blob/main/packages/koenig-lexical/src/plugins/DragDropPastePlugin.jsx).

2. **Default behavior** — When `PASTE_MARKDOWN_COMMAND` fires: markdown → HTML via `@tryghost/kg-markdown-html-renderer`, then sanitized via DOMPurify wrapper, then inserted as rich text via Lexical's `$insertDataTransferForRichText`. Shift held during paste → plain text insertion (bypass formatting). For regular paste (non-markdown), Lexical's default HTML→nodes pipeline handles it. **CONFIRMED** — MarkdownPastePlugin.jsx source.

3. **Syntax coverage** — The `@tryghost/kg-markdown-html-renderer` handles standard markdown conversion. Ghost's overall WYSIWYG approach means pasting formatted content from web pages uses Lexical's HTML parsing with Ghost's registered node converters for: headings, lists, quotes, links, images, code blocks, horizontal rules, and Ghost-specific "cards" (gallery, video, audio, bookmark, etc.). **INFERRED** — based on plugin list and Koenig node registrations.

4. **HTML paste** — `DragDropPastePlugin` detects `text/html` and delegates to Lexical's `$insertDataTransferForRichText`. Ghost registers extensive custom node converters via `@tryghost/kg-parser-plugins` to map HTML elements to Ghost card nodes. The conversion prioritizes Ghost's card system (e.g., `<figure>` → image card, `<iframe>` → embed card). **CONFIRMED** — DragDropPastePlugin source + [kg-parser-plugins](https://github.com/TryGhost/Koenig/blob/main/packages/kg-parser-plugins/README.md).

5. **Sanitization** — Ghost wraps DOMPurify in `src/utils/sanitize-html.js`. The `replaceJS` option (default true) pre-processes: `<script>` → `<pre class="js-embed-placeholder">`, `<iframe>` → `<pre class="iframe-embed-placeholder">`. Then DOMPurify runs with: allowed URIs (https, http, /, blob:), `id` attribute added, `<style>` forbidden. **CONFIRMED** — [sanitize-html.js source](https://github.com/TryGhost/Koenig/blob/main/packages/koenig-lexical/src/utils/sanitize-html.js).

6. **Escape hatches** — Shift+paste inserts as plain text (tracked via document-level keydown/keyup in MarkdownPastePlugin). Ghost also supports explicit "Paste as markdown" via the Koenig slash menu or card menu. **CONFIRMED** — MarkdownPastePlugin source.

### D2 — HTML-in-markdown rendering

1. **Raw HTML rendering** — Ghost has a dedicated `HtmlCard` that renders raw HTML in the editor. The `HtmlNode.jsx` extends `@tryghost/kg-default-nodes` base class. In display mode, `HtmlCard.jsx` renders via `dangerouslySetInnerHTML` after sanitization. In edit mode, a `HtmlEditor` component provides a code editing interface. **CONFIRMED** — [HtmlCard.jsx source](https://github.com/TryGhost/Koenig/blob/main/packages/koenig-lexical/src/components/ui/cards/HtmlCard.jsx); [HtmlNode.jsx source](https://github.com/TryGhost/Koenig/blob/main/packages/koenig-lexical/src/nodes/HtmlNode.jsx).

2. **Rendering mode** — Rendered inline (actual HTML) via `dangerouslySetInnerHTML` in a `<div>`. **Not sandboxed** (no iframe). Not escaped. Sanitization is the security layer. `<script>` and `<iframe>` tags are replaced with placeholder `<pre>` elements. **CONFIRMED** — HtmlCard.jsx source.

3. **Editability** — Yes, via the `HtmlEditor` component when the card is in edit mode. Users click to toggle into a code editing interface. The edit mode is a source code view, not visual manipulation of the rendered HTML. **CONFIRMED** — HtmlCard.jsx structure: `isEditing ? <HtmlEditor /> : <HtmlDisplay />`.

4. **Round-trip survival** — HTML cards store raw HTML in the Lexical state as a string property (`this.__html`). On save, the HTML string is preserved. Ghost publishes the raw HTML to the rendered post. The HTML card is explicitly designed for embedding arbitrary HTML. **INFERRED** — based on HtmlNode architecture and Ghost's card-based content model.

5. **Security approach** — DOMPurify wrapper with `replaceJS: true`. Script tags → placeholder pre. Iframe tags → placeholder pre. Style tags forbidden. URI allowlist (https, http, /, blob:). The `id` attribute is explicitly allowed. This is layered defense: regex pre-processing + DOMPurify. **CONFIRMED** — sanitize-html.js source.

6. **Known issues** — [Ghost #18448](https://github.com/TryGhost/Ghost/issues/18448) — importing HTML with Lexical editor loses images (regression from Mobiledoc era). The HTML card is a deliberate design choice (not "inline HTML in markdown" but a first-class card type). Ghost moved from Mobiledoc to Lexical, and some HTML handling regressions were reported during migration. **CONFIRMED**.
