# Cluster: C1 — ProseMirror-based WYSIWYG Editors

## Editor: TipTap (@tiptap/core + @tiptap/markdown / tiptap-markdown)

### D1 — Paste Handling

**Detection strategy:** No auto-detection by default. The legacy community extension `tiptap-markdown` (aguingand) provides `transformPastedText: false` by default — opt-in only. The official `@tiptap/markdown` (v3.7.0+) provides a docs example showing a custom ProseMirror plugin with `handlePaste` that runs regex heuristics (`^#{1,6}\s`, `\*\*[^*]+\*\*`, `\[.+\]\(.+\)`, `^[-*+]\s`) to detect markdown-looking text, then parses via the Markdown manager. This is example code, not built-in behavior.
**Confidence:** CONFIRMED — [TipTap Markdown Examples](https://tiptap.dev/docs/editor/markdown/examples), [tiptap-markdown README](https://github.com/aguingand/tiptap-markdown/blob/main/README.md)

**Default behavior:** Plain text passthrough. Pasted `text/plain` is inserted as-is unless `transformPastedText: true` is set (tiptap-markdown) or a custom `handlePaste` plugin is registered (official). No confirmation prompt or toast.
**Confidence:** CONFIRMED — [tiptap-markdown README defaults table](https://github.com/aguingand/tiptap-markdown/blob/main/README.md): `transformPastedText` defaults to `false`.

**Syntax coverage (when enabled):** Individual extensions register `addPasteRules()` that use regex matchers. Built-in paste rules cover bold (`**`), italic (`*`), strikethrough (`~~`), code (backtick), links, images. Headings, lists, tables, code blocks depend on which extensions are loaded and whether their paste rules are defined.
**Confidence:** CONFIRMED — [TipTap Paste Rules docs](https://tiptap.dev/docs/editor/api/paste-rules)

**HTML paste:** ProseMirror's built-in `DOMParser.fromSchema()` handles `text/html` clipboard data. HTML is parsed through each extension's `parseHTML` rules — only tags/attributes matching the registered schema nodes and marks are retained. Unmatched HTML is dropped. This is implicit schema-based filtering, not explicit sanitization.
**Confidence:** CONFIRMED — [TipTap Schema docs](https://tiptap.dev/docs/editor/core-concepts/schema): "Content which doesn't fit the schema is thrown away"; [ProseMirror Reference](https://prosemirror.net/docs/ref/)

**Sanitization:** No built-in DOMPurify or sanitize-html. TipTap relies on ProseMirror's schema-based DOMParser which only creates nodes/marks matching registered extensions. However, this is not defense-in-depth sanitization — the official stance is "always validate what is sent to the server." Historical XSS vulnerability existed (SNYK-JS-TIPTAP-575143). Server-side sanitization (e.g., sanitize-html) is recommended.
**Confidence:** CONFIRMED — [GitHub Discussion #2845](https://github.com/ueberdosis/tiptap/discussions/2845), [Snyk XSS advisory](https://security.snyk.io/vuln/SNYK-JS-TIPTAP-575143)

**Escape hatches:** Standard OS `Cmd/Ctrl+Shift+V` for plain-text paste (browser-level, not TipTap-specific). No built-in "Paste as Markdown" menu. The `transformPastedText` toggle is the developer-facing escape hatch.
**Confidence:** CONFIRMED — no TipTap-specific paste menu found in docs.

### D2 — HTML-in-Markdown Rendering

**How raw HTML is rendered:** TipTap does not natively represent arbitrary raw HTML in its ProseMirror schema. Raw HTML tags (`<div>`, `<span>`, `<sub>`, `<kbd>`, `<details>`, `<br>`) are only rendered if a matching TipTap extension with `parseHTML` rules exists. Without a matching extension, the HTML is dropped during parse. The `tiptap-markdown` `html: true` option (default: `true`) allows HTML round-trip through marked.js, but only tags matching registered extensions survive the ProseMirror schema gate.
**Confidence:** CONFIRMED — [tiptap-markdown README](https://github.com/aguingand/tiptap-markdown): `html` defaults to `true`; [TipTap Markdown Integration guide](https://tiptap.dev/docs/editor/markdown/guides/integrate-markdown-in-your-extension)

**Rendering mode:** Rendered inline (actual DOM elements) for recognized extensions. Not sandboxed. Not shown as raw text. Unrecognized HTML is silently dropped — not escaped to entities.
**Confidence:** CONFIRMED — ProseMirror schema architecture; [TipTap Schema docs](https://tiptap.dev/docs/editor/core-concepts/schema)

**Editable in WYSIWYG:** Yes, if a matching extension exists (e.g., Subscript extension for `<sub>`). Otherwise the content is lost. Custom Node Views can be built for arbitrary HTML blocks.
**Confidence:** CONFIRMED — [TipTap Node Views docs](https://tiptap.dev/docs/editor/extensions/custom-extensions/node-views), [Discussion #3440](https://github.com/ueberdosis/tiptap/discussions/3440)

**Round-trip survival:** Only HTML matching registered extensions survives. Arbitrary raw HTML (`<div class="custom">`) is stripped on load unless a custom extension captures it. No generic "raw HTML" passthrough node ships with TipTap.
**Confidence:** CONFIRMED — schema-based filtering is lossy by design.

**Security approach:** Schema-based allowlist (implicit). Only registered extension nodes/marks can exist in the document. No DOMPurify. No iframe sandbox. Server-side sanitization recommended.
**Confidence:** CONFIRMED — [Discussion #2845](https://github.com/ueberdosis/tiptap/discussions/2845)

**Known issues:** [Discussion #2272](https://github.com/ueberdosis/tiptap/discussions/2272) — `renderHTML` escapes HTML characters, making raw HTML embedding difficult without Node Views. [Discussion #3440](https://github.com/ueberdosis/tiptap/discussions/3440) — community request for easier raw HTML support, largely unanswered. Historical XSS via `getHTML()` stored output (SNYK-JS-TIPTAP-575143, patched).

---

## Editor: Milkdown (@milkdown/core + @milkdown/plugin-clipboard)

### D1 — Paste Handling

**Detection strategy:** The `@milkdown/plugin-clipboard` provides a ProseMirror plugin with `handlePaste`. It reads `text/plain` from `clipboardData`, parses it through the remark-based parser (`ctx.get(parserCtx)`), and inserts the resulting ProseMirror slice. There is no "detection heuristic" — ALL pasted plain text is treated as markdown and parsed through the remark pipeline.
**Confidence:** CONFIRMED — [Milkdown clipboard plugin docs](https://milkdown.dev/docs/api/plugin-clipboard), [GitHub Issue #155](https://github.com/Milkdown/milkdown/issues/155) (the fix ensured the editable check works so paste parsing fires)

**Default behavior:** Silent parse as markdown. Plain text paste is always run through the remark parser and converted to structured ProseMirror nodes. No confirmation prompt, no detection heuristic — markdown-first by design.
**Confidence:** CONFIRMED — Milkdown is architecturally a "markdown editor" that happens to use WYSIWYG; all text input is markdown.

**Syntax coverage:** Depends on which remark plugins are loaded. The default `@milkdown/preset-commonmark` covers: headings, paragraphs, blockquotes, lists (ordered/unordered), code blocks (fenced + indented), emphasis, strong, inline code, links, images, thematic breaks, hard breaks. GFM constructs (tables, strikethrough, task lists, autolinks) require `@milkdown/preset-gfm`.
**Confidence:** CONFIRMED — [Milkdown Getting Started](https://milkdown.dev/docs/guide/getting-started)

**HTML paste:** The clipboard plugin's `handlePaste` checks `clipboardData` for `text/plain` first. HTML content from `text/html` is handled by ProseMirror's default DOMParser behavior (schema-based filtering). There is no special HTML-to-markdown conversion path — if HTML is pasted, ProseMirror's schema gate applies.
**Confidence:** INFERRED — based on plugin architecture reading clipboard data as text/plain primarily; HTML path is default ProseMirror.

**Sanitization:** No explicit DOMPurify or sanitize-html. Relies on ProseMirror schema filtering for HTML paste and remark parser constraints for text paste. The remark parser naturally drops constructs not supported by the loaded presets.
**Confidence:** INFERRED — no sanitization library found in Milkdown dependencies or documentation.

**Escape hatches:** No built-in "paste as plain text" menu. Standard OS `Cmd/Ctrl+Shift+V` applies at browser level. Since all text is parsed as markdown, there is no opt-out at the Milkdown level without disabling the clipboard plugin.
**Confidence:** CONFIRMED — no escape hatch documented.

### D2 — HTML-in-Markdown Rendering

**How raw HTML is rendered:** Raw HTML in markdown is NOT supported. Milkdown uses a `Markdown -> Remark AST -> ProseMirror Node` pipeline. Remark's default behavior treats raw HTML as `html` nodes in the AST, but Milkdown has no ProseMirror node type to represent arbitrary HTML. Raw HTML tags are dropped during the remark-to-ProseMirror conversion.
**Confidence:** CONFIRMED — [GitHub Issue #639](https://github.com/Milkdown/milkdown/issues/639): maintainer Saul-Mirone explicitly stated HTML support is "not planned" and closed the issue as `wontfix`.

**Rendering mode:** Raw HTML is silently dropped. Not rendered, not shown as text, not escaped. It simply disappears from the document.
**Confidence:** CONFIRMED — [Issue #639](https://github.com/Milkdown/milkdown/issues/639)

**Editable in WYSIWYG:** No — raw HTML does not survive loading into the editor, so there is nothing to edit.
**Confidence:** CONFIRMED

**Round-trip survival:** Raw HTML does NOT survive. Loading markdown with `<div>`, `<span>`, `<details>`, etc. into Milkdown and then serializing back to markdown will strip those HTML blocks entirely.
**Confidence:** CONFIRMED — architectural limitation; remark -> ProseMirror pipeline has no HTML node mapping.

**Security approach:** Implicit safety through omission — raw HTML is simply not supported, so there is no attack surface for HTML injection in the WYSIWYG layer. The remark parser's `html` AST nodes are discarded before reaching ProseMirror.
**Confidence:** CONFIRMED

**Known issues:** [Issue #639](https://github.com/Milkdown/milkdown/issues/639) — feature request for `rehype-raw` integration, closed as `wontfix`. Maintainer explained that adding rehype would require changing the pipeline to `Markdown -> Remark AST -> Rehype DOM -> ProseMirror Node`, which was deemed "not a good option." [Issue #1366](https://github.com/Milkdown/milkdown/issues/1366) — related request for HTML output support.

---

## Editor: Plate (@udecode/plate + @platejs/markdown)

### D1 — Paste Handling

**Detection strategy:** The `MarkdownPlugin` treats ALL `text/plain` clipboard data as markdown by default. No heuristic detection — if content arrives as `text/plain`, it is deserialized through the remark-based markdown pipeline. The `parser` config option controls this; setting `parser: null` disables markdown paste entirely. For `text/html` clipboard data, Plate uses its HTML deserializer instead (separate plugin path).
**Confidence:** CONFIRMED — [Plate Markdown docs](https://platejs.org/docs/markdown): "Disable Markdown paste handling" via `parser: null`.

**Default behavior:** Silent parse as markdown for `text/plain`. No confirmation prompt, no detection heuristic. HTML paste (`text/html`) is handled separately by the HTML deserializer. `application/x-slate-fragment` (internal Slate copy) takes highest priority.
**Confidence:** CONFIRMED — [Plate Markdown docs](https://platejs.org/docs/markdown)

**Syntax coverage:** Depends on loaded plugins and `remarkPlugins` config. Default remark pipeline supports CommonMark: headings, paragraphs, blockquotes, lists, code blocks, emphasis, strong, inline code, links, images. GFM (tables, strikethrough, task lists) requires additional remark-gfm plugin. Custom constructs can be added via `rules` configuration mapping remark AST nodes to Plate elements.
**Confidence:** CONFIRMED — [Plate Markdown docs](https://platejs.org/docs/markdown)

**HTML paste:** Handled by Plate's HTML deserializer (separate from markdown plugin). Each Plate plugin defines `parsers.html.deserializer` rules with `validNodeName`, `validAttribute`, `validClassName`, `validStyle` matchers. HTML elements are matched against these rules and converted to Plate nodes. Unmatched HTML is dropped — implicit plugin-based allowlist.
**Confidence:** CONFIRMED — [Plate HTML docs](https://platejs.org/docs/html)

**Sanitization:** No built-in DOMPurify. Sanitization is structural — only HTML matching plugin deserializer rules survives conversion to Plate JSON. For raw HTML processing via `rehype-raw`, the docs explicitly recommend `rehype-sanitize` for untrusted sources. Plate's architecture (markdown -> Plate JSON, not markdown -> raw HTML rendering) inherently limits injection surface.
**Confidence:** CONFIRMED — [Plate Markdown docs](https://platejs.org/docs/markdown): "always sanitize with rehype-sanitize if the source is untrusted"

**Escape hatches:** `parser: null` in MarkdownPlugin config disables markdown paste entirely. No built-in "Paste as Markdown" menu or toggle. Standard OS plain-text paste shortcut applies at browser level.
**Confidence:** CONFIRMED — [Plate Markdown docs](https://platejs.org/docs/markdown)

### D2 — HTML-in-Markdown Rendering

**How raw HTML is rendered:** By default, raw HTML in markdown is stripped during deserialization. Plate's markdown processor "does not process raw HTML tags for security." To enable raw HTML, developers must add `rehype-raw` to `remarkPlugins` AND define custom `rules` mapping parsed HTML hast nodes to Plate node structures.
**Confidence:** CONFIRMED — [Plate Markdown docs](https://platejs.org/docs/markdown): "does not process raw HTML tags for security"

**Rendering mode:** When raw HTML support is enabled (via rehype-raw + custom rules), HTML is converted to Plate's Slate nodes and rendered as actual DOM elements via React components — not sandboxed, not shown as raw text. Without rehype-raw, raw HTML is silently stripped.
**Confidence:** CONFIRMED — Plate renders all content as Slate nodes via React components.

**Editable in WYSIWYG:** If a matching Plate plugin and component exist for the HTML element, yes. Otherwise, the content is lost during deserialization. There is no generic "raw HTML block" plugin shipping with Plate by default.
**Confidence:** INFERRED — based on Plate's plugin architecture; no built-in raw HTML node found in docs.

**Round-trip survival:** Raw HTML does NOT survive by default. With rehype-raw + custom rules + matching serialization rules, specific HTML elements can be round-tripped. But arbitrary `<div>`, `<span>`, `<details>` blocks are stripped unless explicitly handled.
**Confidence:** CONFIRMED — structural conversion means only mapped elements survive.

**Security approach:** Defense by omission (raw HTML stripped by default) + explicit opt-in for HTML processing with strong recommendation for `rehype-sanitize`. When HTML paste occurs, plugin-based allowlist filtering applies (each plugin declares what HTML it accepts). URL validation recommended for LinkPlugin and MediaEmbedPlugin. Third-party remarkPlugins require vetting.
**Confidence:** CONFIRMED — [Plate Markdown docs](https://platejs.org/docs/markdown)

**Known issues:** [Discussion #186](https://github.com/udecode/plate/discussions/186) — early discussion on markdown-to-Slate conversion challenges. [Discussion #739](https://github.com/udecode/plate/discussions/739) — improving deserialization pipeline. [Issue #2858](https://github.com/udecode/plate/issues/2858) — markdown underline deserialization sometimes produces bold instead. [Discussion #1872](https://github.com/udecode/plate/discussions/1872) — HTML serialization support gaps. No major open issues specifically about raw-HTML-in-markdown loss, likely because the "strip by default" behavior is well-documented.
