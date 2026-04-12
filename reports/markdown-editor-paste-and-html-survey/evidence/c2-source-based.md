# Cluster C2 — Source / text-based editors with markdown support

## Editor: Obsidian

### D1 — Paste handling

**Detection strategy:** MIME-type based. Obsidian checks the clipboard for `text/html` content. When HTML is present, it auto-converts to markdown. The community plugin "Advanced Paste" exposes this via `input.types.includes("text/html")`, confirming MIME-type inspection is the underlying mechanism. **Confidence: CONFIRMED** — [Advanced Paste plugin source](https://github.com/kxxt/obsidian-advanced-paste), [Forum: paste converts HTML](https://forum.obsidian.md/t/pasting-now-converts-html-and-pdf-markup-to-markdown/10506)

**Default behavior:** Silent detect + auto-convert. Since v0.10.1, the default Ctrl/Cmd+V silently converts HTML clipboard content to markdown. Users describe it as "constantly trying to smartly convert whatever I'm pasting into Markdown." No confirmation prompt — conversion is immediate and automatic. A toggle was added in v0.10.3 as "Auto convert HTML" in Editor settings. **Confidence: CONFIRMED** — [Forum: make optional](https://forum.obsidian.md/t/make-optional-turn-on-off-paste-that-converts-html-content-to-markdown-links/10096), [Forum: paste as plain text default](https://forum.obsidian.md/t/make-paste-as-plain-text-default/62691)

**Syntax coverage:** The HTML-to-markdown conversion handles headings, links, bold/italic, lists, and basic block structures. However, conversion is reported as "often wrong" and "inconsistent" — styled `<span>` elements with inline CSS (e.g., `font-weight: bold`) produce malformed output like `**<span style="font-weight: bold;">Title</span>**` instead of `**Title**`. Tables, code blocks, and complex nested HTML have mixed results. The conversion library is likely Turndown (used explicitly in the Advanced Paste plugin: "convert html to markdown using turndown and turndown-plugin-gfm"). **Confidence: INFERRED** (Turndown usage confirmed in plugin; core likely uses similar approach) — [Forum: autoconvert not behaving](https://forum.obsidian.md/t/autoconvert-html-to-markdown-not-behaving-as-expected/49565), [Advanced Paste repo](https://github.com/kxxt/obsidian-advanced-paste)

**HTML paste:** When pasting from a web page, HTML content is auto-detected via the `text/html` MIME type and converted to markdown. PDF content may also trigger conversion but results are inconsistent. **Confidence: CONFIRMED** — [Forum: paste converts HTML](https://forum.obsidian.md/t/pasting-now-converts-html-and-pdf-markup-to-markdown/10506)

**Sanitization:** Obsidian uses DOMPurify for HTML sanitization throughout the rendering pipeline. HTML tags are "passed through DOMPurify and then rendered inline." The sanitization is mandatory and cannot be disabled by users. Scripts, `onload` handlers, and dangerous attributes are stripped. **Confidence: CONFIRMED** — [Obsidian HTML plugin docs](https://github.com/nuthrash/obsidian-html-plugin), [Forum: disable HTML sanitization](https://forum.obsidian.md/t/s-there-any-way-to-disable-html-sanitization-i-really-wanna-use-the-script-tag-but-i-dont-know-how/105665), [DeepWiki: live preview mode](https://deepwiki.com/obsidianmd/obsidian-help/2.4-live-preview-mode)

**Escape hatches:** Cmd+Shift+V (macOS) / Ctrl+Shift+V (other) for plain-text paste. Shift+drag for drop without formatting. The "Auto convert HTML" toggle in Editor settings disables conversion globally. Community plugins (Smarter Paste, Advanced Paste, Paste Reformatter) provide additional granular control. **Confidence: CONFIRMED** — [Forum: make optional](https://forum.obsidian.md/t/make-optional-turn-on-off-paste-that-converts-html-content-to-markdown-links/10096)

### D2 — HTML-in-markdown rendering

**Rendering approach:** Obsidian has a split rendering model. **Reading View** renders most HTML inline (actual rendered HTML). **Live Preview (editor)** has limited HTML rendering — inline elements like `<span>` do NOT render correctly, though block-level elements have partial support. HTML tables render in Live Preview but not always in Reading View (inconsistency). **Confidence: CONFIRMED** — [Forum: Live Preview inline HTML](https://forum.obsidian.md/t/live-preview-support-inline-html-elements-like-span/62707), [Forum: HTML blocks in live preview](https://forum.obsidian.md/t/html-blocks-rendering-incorrectly-in-live-preview/32745)

**Rendering mode:** Rendered inline (actual HTML) in Reading View. In Live Preview, block HTML has partial rendering with rendering artifacts (extra margins, gaps). Inline HTML like `<span style="...">` shows as raw text or renders incorrectly. HTML entities are rendered in Reading View but NOT in Live Preview. No iframe sandboxing for inline HTML. **Confidence: CONFIRMED** — [Forum: HTML entities in Live Preview](https://forum.obsidian.md/t/live-preview-not-rendering-html-character-entities/76709)

**Editability:** HTML is always editable as source text in the editor (CodeMirror 6). In Live Preview, you edit the raw HTML markup directly. Reading View is non-editable. No separate "source mode" toggle needed since the editor IS the source. **Confidence: CONFIRMED**

**Round-trip fidelity:** Raw HTML survives round-trip because Obsidian stores plain markdown files on disk. The file IS the source of truth — HTML written in the file persists exactly. No lossy WYSIWYG-to-source conversion occurs because the editor operates on the source directly. **Confidence: CONFIRMED** — [Obsidian Help: HTML content](https://help.obsidian.md/Editing+and+formatting/HTML+content)

**Security approach:** DOMPurify sanitization is mandatory and non-configurable by users. `<script>` tags are blocked. `<iframe>` elements are sandboxed with `sandbox="allow-forms allow-presentation allow-same-origin allow-scripts allow-modals"`. Event handler attributes (`onload`, `onclick`, etc.) are stripped. Style attributes appear to be partially allowed. **Confidence: CONFIRMED** — [Forum: script tag](https://forum.obsidian.md/t/script-tag-in-obsidian/64750), [Forum: iframe sandbox](https://forum.obsidian.md/t/can-iframe-sandbox-restrictions-be-removed-via-a-plugin/27909)

**Known issues:** Live Preview inline HTML support is a long-standing gap (bug report open since 2022). HTML entities don't render in Live Preview. HTML block rendering has extra margins/gaps. The inconsistency between Live Preview and Reading View is a major pain point. **Confidence: CONFIRMED** — [Forum: Live Preview inline HTML support](https://forum.obsidian.md/t/live-preview-support-inline-html-elements-like-span/62707), [Forum: render HTML entities](https://forum.obsidian.md/t/render-html-entities-in-live-preview/30795)

---

## Editor: VS Code (built-in markdown support)

### D1 — Paste handling

**Detection strategy:** VS Code's built-in markdown extension detects URLs specifically. The `markdown.editor.pasteUrlAsFormattedLink.enabled` setting (values: `smart`, `always`, `never`) controls URL-to-link conversion. When set to `smart`, pasting a URL with text selected auto-creates a markdown link `[selected](url)`. No general markdown-content detection or HTML-to-markdown conversion exists in the built-in extension. **Confidence: CONFIRMED** — [VS Code Markdown docs](https://code.visualstudio.com/docs/languages/markdown), [Blog: paste URL as markdown link](https://www.brandonpugh.com/til/vscode/paste-markdown-url/)

**Default behavior:** Plain text passthrough. VS Code is fundamentally a text editor — pasting into the source editor inserts whatever plain text representation is on the clipboard. No auto-detection of markdown constructs or HTML-to-markdown conversion. The only "smart" behavior is URL detection for link creation (off by default, requires setting `smart` or `always`). Image paste support copies images to workspace and inserts `![](path)` syntax. **Confidence: CONFIRMED** — [VS Code Markdown docs](https://code.visualstudio.com/docs/languages/markdown), [GitHub issue #57577](https://github.com/microsoft/vscode/issues/57577)

**Syntax coverage:** Only URLs trigger smart paste behavior. No detection of headings, lists, emphasis, tables, code blocks, or any markdown constructs. Pasted markdown source is inserted verbatim as text. **Confidence: CONFIRMED**

**HTML paste:** The built-in editor does NOT convert HTML to markdown. Rich text/HTML on the clipboard is pasted as its plain text representation. Issue #57577 requested HTML paste support; it was eventually implemented (PR #200912 merged) to allow rich text paste in markdown files, but the scope was limited to URLs and file references, not general HTML-to-markdown conversion. Third-party extensions like "Paste Markdown" (telesoho) and "HTML to Markdown" (YangtangWu) provide this functionality. **Confidence: CONFIRMED** — [GitHub issue #57577](https://github.com/microsoft/vscode/issues/57577)

**Sanitization (preview):** The markdown preview uses markdown-it with a strict Content Security Policy (CSP). Default CSP: `default-src: 'none'`, scripts require a nonce, images/media from `self`/HTTPS/data URIs only. Three security levels: Strict (default, blocks HTTP resources), Allow Insecure Content, Disable. Scripts are fully blocked — even extension-contributed `previewScripts` need the auto-injected nonce. **Confidence: CONFIRMED** — [CSP analysis](https://kiesthardt.com/blog/hacking-vscode-csp/), [VS Code Markdown docs](https://code.visualstudio.com/docs/languages/markdown)

**Escape hatches:** No built-in "paste as markdown" command. No paste format toggle. Third-party extensions fill this gap. Standard OS-level paste-as-plain-text shortcuts work at the OS level but VS Code's editor always receives text. **Confidence: CONFIRMED**

### D2 — HTML-in-markdown rendering

**Rendering approach:** VS Code has a strict separation: the **editor** shows raw markdown source with syntax highlighting (Monaco editor, not CodeMirror). The **preview pane** renders markdown to HTML via markdown-it. Raw HTML in the markdown source IS rendered in the preview — markdown-it is configured with `html: true` (allowing HTML pass-through to the rendered output). **Confidence: INFERRED** — [Markdown Guide: VS Code reference](https://www.markdownguide.org/tools/vscode/) confirms "HTML: Yes" support. markdown-it's `html: true` is the standard mechanism. [markdown-it docs](https://markdown-it.github.io/markdown-it/)

**Rendering mode:** In the preview pane, raw HTML tags (`<div>`, `<span>`, `<details>`, `<kbd>`, `<sub>`, `<br>`) are rendered as actual HTML elements. The preview is essentially a webview that displays the rendered HTML output. In the editor pane, HTML appears as raw text with syntax highlighting. Note: for VS Code's *API* `MarkdownString` (used in hover popups, intellisense), raw HTML is stripped unless `supportHtml: true` is set, and even then only a safe subset is allowed. This is distinct from the markdown file preview. **Confidence: INFERRED** — [GitHub issue #40607](https://github.com/microsoft/vscode/issues/40607)

**Editability:** HTML is only editable in the source editor (as text). The preview pane is read-only. No WYSIWYG editing of rendered HTML. **Confidence: CONFIRMED**

**Round-trip fidelity:** Perfect round-trip. VS Code edits the file directly as text. The preview is a read-only rendering — no write-back from preview to source. HTML in the markdown file is preserved byte-for-byte. **Confidence: CONFIRMED**

**Security approach:** CSP-based sandboxing in the preview webview. No HTML element allowlist/blocklist at the markdown-it level — instead, the webview CSP prevents script execution, blocks non-HTTPS resources (in Strict mode), and restricts all resource loading. Scripts are blocked via nonce requirement. Iframes in the preview would be subject to CSP restrictions. **Confidence: CONFIRMED** — [CSP analysis](https://kiesthardt.com/blog/hacking-vscode-csp/), [Sonar security analysis](https://www.sonarsource.com/blog/vscode-security-markdown-vulnerabilities-in-extensions)

**Known issues:** Third-party markdown preview extensions have had XSS vulnerabilities (Sonar reported vulnerabilities in extensions that didn't properly sanitize). The built-in preview is considered secure. Extension-provided scripts get auto-nonce but can still expand the attack surface. **Confidence: CONFIRMED** — [Sonar: VS Code markdown vulnerabilities](https://www.sonarsource.com/blog/vscode-security-markdown-vulnerabilities-in-extensions), [Trail of Bits: extension escape](https://blog.trailofbits.com/2023/02/21/vscode-extension-escape-vulnerability/)

---

## Editor: HedgeDoc (formerly CodiMD / HackMD open-source fork)

### D1 — Paste handling

**Detection strategy:** No auto-detection of markdown vs plain text in clipboard. HedgeDoc is a source-mode CodeMirror editor — pasted text is inserted verbatim. The only smart paste behavior identified is **table paste**: a custom CodeMirror extension (`useCodeMirrorTablePasteExtension`) handles pasting tabular data (likely detecting tab-separated values and converting to markdown tables). Image paste from clipboard is supported (uploads the image and inserts markdown image syntax). **Confidence: INFERRED** — [HedgeDoc editor-pane.tsx](https://github.com/hedgedoc/hedgedoc/blob/develop/frontend/src/components/editor-page/editor-pane/editor-pane.tsx), [react-client issue #672](https://github.com/hedgedoc/react-client/issues/672)

**Default behavior:** Plain text passthrough for text content. Images pasted from clipboard are uploaded and inserted as markdown image links. No HTML-to-markdown conversion on paste. No confirmation prompt. The editor is source-mode by default. **Confidence: INFERRED** — no explicit paste handler for text/html found in codebase search. [DeepWiki: frontend architecture](https://deepwiki.com/hedgedoc/hedgedoc/2.2-frontend-architecture) mentions "Paste from clipboard" only for file uploads.

**Syntax coverage:** Table paste extension handles tabular data. No detection of headings, lists, emphasis, code blocks, or general markdown constructs from clipboard content. **Confidence: INFERRED**

**HTML paste:** No built-in HTML-to-markdown conversion on paste. HTML pasted from web pages appears as raw HTML text in the source editor. The HedgeDoc 1 (react-client) codebase shows no clipboard HTML conversion dependencies. **Confidence: INFERRED** — negative search: no turndown, rehype-raw, or HTML-to-markdown libraries in [react-client package.json](https://github.com/hedgedoc/react-client/blob/main/package.json)

**Sanitization:** DOMPurify v2.4.1 (in react-client) / v3.0.8+ (in HedgeDoc 2 main repo) is used for sanitizing rendered HTML output, not paste input. The sanitization occurs at render time, not paste time. **Confidence: CONFIRMED** — [react-client package.json](https://github.com/hedgedoc/react-client/blob/main/package.json) lists `"dompurify": "2.4.1"`

**Escape hatches:** N/A — paste is already plain-text by default. No need for escape hatch since there's no auto-conversion to escape from. **Confidence: CONFIRMED**

### D2 — HTML-in-markdown rendering

**Rendering approach:** HedgeDoc uses a multi-stage pipeline: markdown-it parses markdown to HTML, then `@hedgedoc/html-to-react` converts HTML to React components. The pipeline supports raw HTML in markdown — markdown-it is configured with html enabled (HedgeDoc Flavored Markdown spec lists specific HTML elements as supported). The rendered output appears in a split-pane preview alongside the CodeMirror source editor. **Confidence: CONFIRMED** — [DeepWiki: frontend architecture](https://deepwiki.com/hedgedoc/hedgedoc/2.2-frontend-architecture), [HedgeDoc Flavored Markdown](https://docs.hedgedoc.org/references/hfm/)

**Supported HTML elements:** HFM (HedgeDoc Flavored Markdown) v2 explicitly supports: `<textarea>`, `<style>`, `<iframe>`, `<noembed>`, `<noframes>`, and basic typography elements (`<p>`, `<a>`, `<b>`, `<ins>`, `<del>`). HFM v1 additionally supported `<title>`, `<script>`, `<plaintext>`, `<xmp>` — these were removed in v2 for security. General inline HTML (`<div>`, `<span>`, `<kbd>`, `<sub>`, `<details>`, `<br>`) is likely supported via markdown-it's html option, though the HFM spec only explicitly documents the above subset. **Confidence: INFERRED** — [HedgeDoc Flavored Markdown](https://docs.hedgedoc.org/references/hfm/)

**Rendering mode:** HTML is rendered as actual React components (via html-to-react conversion), not sandboxed in iframes. The `@hedgedoc/html-to-react` library parses HTML via `htmlparser2` into an AST, then recursively transforms nodes into React elements. This means HTML is rendered inline within the React component tree. **Confidence: CONFIRMED** — [hedgedoc/html-to-react](https://github.com/hedgedoc/html-to-react)

**Editability:** HTML is only editable in the source (CodeMirror) pane. The preview pane is read-only rendered output. No WYSIWYG editing of HTML elements. **Confidence: CONFIRMED**

**Round-trip fidelity:** Good round-trip. The source is stored as markdown text (in the database for collaborative editing). HTML in the markdown source is preserved as-is in the source text. The preview is a one-way rendering — no write-back from preview to source. **Confidence: CONFIRMED**

**Security approach:** DOMPurify is used for HTML sanitization before rendering. The `html-to-react` library explicitly does NOT include built-in sanitization — its README states "Including a sanitizer as part of the library means it is making decisions for you that may not be correct" and recommends using DOMPurify before passing HTML to the converter. HedgeDoc 2 removed `<script>` from supported elements (present in HFM v1, removed in HFM v2). Event handlers are stripped by DOMPurify. **Confidence: CONFIRMED** — [hedgedoc/html-to-react README](https://github.com/hedgedoc/html-to-react), [react-client package.json](https://github.com/hedgedoc/react-client/blob/main/package.json)

**Known issues:** The `html-to-react` library was archived in August 2023 and merged into the main HedgeDoc repo. HedgeDoc 2 is a major rewrite still in development. The react-client repo (HedgeDoc 2 frontend) was also archived (Nov 2022). Paste handling for text content has had bugs — [react-client issue #870](https://github.com/hedgedoc/react-client/issues/870) reported "Text paste doesn't work." CodeMirror 5 had issues where paste events didn't expose `clipboardData` properly — [codemirror5 issue #5764](https://github.com/codemirror/codemirror5/issues/5764). **Confidence: CONFIRMED**

---

## Cross-editor comparison matrix

| Aspect | Obsidian | VS Code | HedgeDoc |
|--------|----------|---------|----------|
| **Paste detection** | MIME-type (`text/html`) | URL only | None (plain text) |
| **Default paste** | Auto-convert HTML->MD | Plain text | Plain text |
| **HTML paste conversion** | Yes (Turndown-like) | No (built-in) | No |
| **Paste escape hatch** | Cmd+Shift+V | N/A | N/A |
| **HTML rendering (editor)** | Partial (Live Preview) | Raw text (Monaco) | Raw text (CodeMirror) |
| **HTML rendering (preview)** | Full (Reading View) | Full (webview) | Full (React components) |
| **HTML sanitizer** | DOMPurify | CSP-based | DOMPurify |
| **Script blocking** | DOMPurify strips | CSP nonce | DOMPurify + HFM v2 removal |
| **Round-trip fidelity** | Perfect (file = source) | Perfect (file = source) | Good (source = DB text) |
| **Inline HTML editable** | Source mode only | Source mode only | Source mode only |
