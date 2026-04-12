# Cluster C3: Block-based WYSIWYG Editors

## Editor: Notion

### D1 — Paste handling

**Detection strategy:** Silent auto-detect + parse. Notion checks the clipboard for `text/html` first (rich text from web pages), then falls back to `text/plain`. When `text/plain` contains markdown syntax, Notion auto-converts recognized constructs to native blocks. No confirmation prompt or opt-in menu — conversion is automatic on Cmd+V. **CONFIRMED** — [Markdown Guide: Notion Reference](https://www.markdownguide.org/tools/notion/): "Copying and pasting Markdown-formatted text into Notion generally works the way you'd expect." Also [goinsight.ai 2025 guide](https://www.goinsight.ai/blog/markdown-to-notion/): "Notion parses basic formatting, including headers, lists, bold/italic, links, and inline code."

**Default behavior:** Silent detect + parse. Cmd+V auto-converts markdown to native blocks. No toast or confirmation. **CONFIRMED** — [Notion Help Center: Writing and Editing Basics](https://www.notion.com/help/writing-and-editing-basics).

**Syntax coverage:** Headers (#), bold (**), italic (*), strikethrough (~~), inline code, code blocks (```), ordered/unordered lists, task lists (- [ ]), links (copy-paste only, not live typing), tables (copy-paste only), horizontal rules. **NOT supported on paste:** footnotes, heading IDs, definition lists, highlight, subscript, superscript. **CONFIRMED** — [Markdown Guide: Notion Reference](https://www.markdownguide.org/tools/notion/) provides full support matrix.

**HTML paste:** When clipboard contains `text/html` (e.g., pasting from a web page), Notion converts common HTML elements (h1-h6, p, ul, ol, table, code, a, strong, em) to native Notion blocks. Tables become editable Notion tables. Links stay clickable. Headers map to H1/H2/H3 headings. **CONFIRMED** — [ShowMeMyMD: Paste Markdown into Notion](https://www.showmemymd.com/blog/paste-markdown-into-notion); [Notion Jan 2022 Release Notes](https://www.notion.com/releases/2022-01-19) documents improved cross-block text selection and paste.

**Sanitization:** Notion strips unsupported HTML like `<script>` tags and iframes during import. The API documentation shows unsupported blocks become `<unknown>` tags. Internal sanitization — no evidence of using DOMPurify or similar library (closed source). **INFERRED** — [Notion Developer Docs: Working with Markdown](https://developers.notion.com/guides/data-apis/working-with-markdown-content): "unsupported block types appear as `<unknown>` tags."

**Escape hatches:** Cmd+Shift+V pastes as plain text (strips all formatting, including markdown conversion). No explicit "paste as markdown" menu — markdown conversion happens automatically via Cmd+V. There exists a third-party Chrome extension "Markdown -> Notion Paste" for improved markdown paste. **CONFIRMED** — [Notion Keyboard Shortcuts](https://www.notion.com/help/keyboard-shortcuts); [Chrome Web Store: Markdown -> Notion Paste](https://chromewebstore.google.com/detail/markdown-%E2%86%92-notion-paste/celjlmkeccnaaomennclndlfmoanfikd).

### D2 — HTML rendering

**How raw HTML is rendered:** Notion does **not** support raw HTML input in WYSIWYG mode. HTML tags typed into a page are treated as literal text, not rendered. The Markdown Guide explicitly lists HTML support as "No." **CONFIRMED** — [Markdown Guide: Notion Reference](https://www.markdownguide.org/tools/notion/): HTML listed as "No" under supported elements.

**Rendering approach:** Entity-escaped / shown as plain text. No inline HTML rendering, no sandboxing. When HTML is pasted from clipboard (`text/html` MIME), it's converted to native blocks — but raw HTML syntax typed or pasted as plain text is not interpreted. **CONFIRMED** — [Zeroqode Forum](https://forum.zeroqode.com/t/raw-html-in-notion-rich-text-editor/15948): "If I paste raw HTML it just displays as text."

**Editable in WYSIWYG:** N/A — raw HTML is not rendered, so there is no WYSIWYG editing of HTML. HTML content can only be embedded via `/embed` block with an external URL (iframe to a hosted page). **CONFIRMED** — [bullet.so: Embed HTML in Notion](https://bullet.so/docs/embed-html-inside-notion/).

**Round-trip survival:** Notion's API export uses a controlled set of HTML tags for specific block types (`<details>`, `<callout>`, `<table>`, etc.) that are Notion-specific. Arbitrary raw HTML does not survive round-trip. **CONFIRMED** — [Notion Developer Docs: Enhanced Markdown](https://developers.notion.com/guides/data-apis/enhanced-markdown).

**Security approach:** No raw HTML execution. External embeds via `/embed` use iframes to hosted URLs (requires HTTPS). Internal content uses Notion's proprietary block model — no arbitrary HTML rendering path. **INFERRED** — closed source; behavior observed via docs.

**Known issues:** Notion export to markdown includes raw HTML for proprietary blocks (callouts, toggles, columns) which most markdown renderers ignore. [Unmarkdown blog](https://unmarkdown.com/blog/notion-export-broken): "callout blocks export as raw HTML with inline styles, and most markdown renderers ignore them entirely."

---

## Editor: AFFiNE (BlockSuite)

### D1 — Paste handling

**Detection strategy:** MIME-type priority cascade. BlockSuite's clipboard system checks for a custom MIME type (`BLOCKS_CLIP_WRAPPED` — internal BlockSuite format) first, then `text/html`, then `text/plain`. The paste manager (`packages/editor/src/managers/clipboard/paste-manager.ts`) uses `HtmlAdapter` and `MarkdownAdapter` to convert clipboard content to BlockSuite snapshots. **CONFIRMED** — [GitHub: toeverything/blocksuite paste-manager.ts](https://github.com/toeverything/blocksuite/blob/master/packages/editor/src/managers/clipboard/paste-manager.ts); [BlockSuite Adapter docs](https://blocksuite.io/guide/adapter.html): adapters can return `null` to signal incompatibility, triggering fallback to the next adapter.

**Default behavior:** Silent detect + parse. When `text/html` is present (e.g., pasting from a web page), the `HtmlAdapter` converts it to BlockSuite blocks. When only `text/plain` is available and contains markdown syntax, the `MarkdownAdapter` converts it. No confirmation dialog. **INFERRED** — based on adapter architecture documentation: [BlockSuite Adapter Guide](https://blocksuite.io/guide/adapter.html) describes the priority fallback chain. Also [AFFiNE Transformer docs](https://docs.affine.pro/blocksuite-wip/store/transformer-and-adapter).

**Syntax coverage:** The `MarkdownAdapter` uses AST walker (`ASTWalker`) to parse markdown into BlockSuite snapshot format. Supports standard CommonMark constructs (headings, lists, code blocks, emphasis, links, images, tables). Specific GFM extensions coverage not fully documented. **INFERRED** — [BlockSuite Adapter docs](https://blocksuite.io/guide/adapter.html) describes ASTWalker for markdown-to-snapshot conversion.

**HTML paste:** The `HtmlAdapter` converts `text/html` clipboard content to BlockSuite blocks. Tables, headings, lists, links, code blocks are mapped to corresponding block types. Known issue: formatting loss when pasting from external apps like Apple Numbers. **CONFIRMED** — [GitHub Issue #7901](https://github.com/toeverything/blocksuite/issues/7901): user reports "loss of formatting when copying and pasting content between BlockSuite and external applications."

**Sanitization:** No evidence of DOMPurify usage found in search results. The adapter system converts HTML to block snapshots (structured data), which provides implicit sanitization by only mapping recognized HTML elements to known block types. Unrecognized elements are likely dropped. **UNCERTAIN** — no direct evidence of sanitization library; architecture suggests structural safety through adapter mapping.

**Escape hatches:** No documented "paste as plain text" shortcut specific to AFFiNE/BlockSuite. Issue #7901 requests "multiple copy options, each with a dedicated shortcut key" (citing Capacities as example). **CONFIRMED** — [GitHub Issue #7901](https://github.com/toeverything/blocksuite/issues/7901) — feature requested but not yet implemented as of May 2024.

### D2 — HTML rendering

**How raw HTML is rendered:** AFFiNE has an "HTML code block" with live preview since v0.22. Users write HTML in a code block, and AFFiNE renders a live preview in a sandboxed iframe below it. This is NOT inline HTML rendering — it's a dedicated code block type. **CONFIRMED** — [GitHub Issue #13659](https://github.com/toeverything/AFFiNE/issues/13659): "HTML code block preview uses iframe container."

**Rendering approach:** Sandboxed iframe. The HTML preview loads content in an iframe with `allow-same-origin` sandbox attribute. Content is passed via `postMessage()`. The iframe `src` was originally hardcoded to `https://affine.run/static/container.html` (later flagged as a bug for self-hosted instances). **CONFIRMED** — [GitHub Issue #13659](https://github.com/toeverything/AFFiNE/issues/13659): details iframe implementation and `allow-same-origin` sandbox.

**Editable in WYSIWYG:** The HTML is edited as source code in the code block, not as WYSIWYG. The preview is read-only. No inline HTML rendering in the document flow. **INFERRED** — based on the code block + preview architecture described in issue #13659.

**Round-trip survival:** HTML stored in code blocks survives round-trip as source text. However, arbitrary inline HTML in markdown content (e.g., `<sub>`, `<kbd>`) is not supported as native blocks — the block model does not include generic HTML block types. **INFERRED** — BlockSuite's block model is defined by block specs ([BlockSuite Components Overview](https://block-suite.com/components/overview.html)); no generic HTML block spec exists.

**Security approach:** Iframe sandboxing with `allow-same-origin`. A proposal to use `srcdoc` instead of external URL and remove `allow-same-origin` was discussed but rejected due to website compatibility concerns. **CONFIRMED** — [GitHub Issue #13659](https://github.com/toeverything/AFFiNE/issues/13659).

**Known issues:** Full iframe/embed support for external content is still a feature request. [GitHub Discussion #10977](https://github.com/toeverything/AFFiNE/discussions/10977): "this is really the big 'missing piece' for me with AFFiNE at the moment." Status: WIP as of Jan 2026.

---

## Editor: Anytype

### D1 — Paste handling

**Detection strategy:** Partial auto-detect. Anytype attempts to parse markdown syntax from pasted plain text, but detection is inconsistent. It recognizes some inline markdown (bold, italic, links) but historically failed on constructs like checkboxes, unspaced inline formatting, and non-standard protocol links. **CONFIRMED** — [Community: Recognize partial word markdown formatting](https://community.anytype.io/t/recognize-partial-word-markdown-formatting-from-pasted-text/2320): "When I paste some text with markdown, if the markdown is not spaced, it wont be recognized." Status: later marked "Implemented."

**Default behavior:** Silent partial parse. Anytype auto-converts some markdown constructs on paste but with significant gaps. No confirmation prompt. Cmd+Shift+V for paste without formatting was not originally implemented on macOS — team member Razor: "It's not implemented, we can add it though." Later targeted for v0.43.0. **CONFIRMED** — [Community: Paste text without formatting](https://community.anytype.io/t/paste-text-without-its-formatting/8810); [GitHub Issue #2201](https://github.com/anyproto/anytype-heart/issues/2201).

**Syntax coverage:** Bold, italic, inline code, links (auto-parsed but breaks non-standard protocols like `zotero://`), headings. Checkboxes (`- [ ]`) historically pasted as plain text, not converted to checkbox blocks. Tables: paste from Excel/ChatGPT works (implemented), but HTML tables do NOT paste. Code blocks (```) requested but not confirmed as supported on paste. **CONFIRMED** — [Community: Checkbox paste bug](https://community.anytype.io/t/keep-format-of-checkbox-when-pasting-markdown-into-anytype/1314); [Community: Table paste](https://community.anytype.io/t/copy-and-paste-from-html-or-markdown-tables-or-excel-into-simple-tables/6927); [Community: Markdown URL parsing](https://community.anytype.io/t/markdown-url-parsing-when-pasted-into-anytype/10688).

**HTML paste:** Limited. HTML table paste does NOT work (confirmed Sep 2025). When pasting from web pages, Anytype converts basic rich text (text + links) but strips most HTML structure. A user confirmed: "HTML tables still don't work. I asked chatgpt to generate a table with example data which I was able to copy and paste fine into Anytype, but generating the same template in HTML fails to paste." **CONFIRMED** — [Community: Table paste](https://community.anytype.io/t/copy-and-paste-from-html-or-markdown-tables-or-excel-into-simple-tables/6927).

**Sanitization:** No evidence of specific sanitization library. Anytype is an Electron app (anyproto/anytype-ts). The paste handling appears to go through a custom parser that converts recognized constructs to Anytype blocks. **UNCERTAIN** — no source code for paste handler found in searches. Negative search: searched `anyproto/anytype-ts` repo for "onPaste", "clipboard", "paste" — no handler source returned.

**Escape hatches:** Cmd+Shift+V (paste without formatting) available on Windows; macOS support was added later (~v0.43.0). No explicit "paste as markdown" menu. **CONFIRMED** — [GitHub Issue #2201](https://github.com/anyproto/anytype-heart/issues/2201); [Community: Paste without formatting](https://community.anytype.io/t/paste-text-without-its-formatting/8810).

### D2 — HTML rendering

**How raw HTML is rendered:** Anytype does NOT render raw HTML. HTML tags typed into the editor are displayed as literal text, not interpreted. **CONFIRMED** — [Community: HTML writing support](https://community.anytype.io/t/view-source-of-a-document-html-writing-support/3389): "If I write HTML tags in Anytype, they are not recognized."

**Rendering approach:** Shown as raw text. No inline rendering, no sandboxing, no entity-escaping — HTML tags are simply treated as plain text characters. **CONFIRMED** — same source as above.

**Editable in WYSIWYG:** N/A — HTML is not rendered, so no WYSIWYG editing of HTML content. No source/code view for documents exists. Users have requested "view source" as a feature. **CONFIRMED** — [Community: HTML writing support](https://community.anytype.io/t/view-source-of-a-document-html-writing-support/3389): user requests "option to view the raw source of text files."

**Round-trip survival:** Anytype supports markdown and HTML import/export, but raw HTML in documents is treated as plain text. HTML tags in exported content may be lost or treated as literal strings. Import from Notion loses color properties and formatting during HTML-to-markdown conversion. **INFERRED** — [Community: HTML writing support](https://community.anytype.io/t/view-source-of-a-document-html-writing-support/3389).

**Security approach:** Implicit safety — no HTML rendering path exists, so no XSS vector. All content is treated as plain text or converted to Anytype's internal block model. **INFERRED** — consequence of no HTML rendering support.

**Known issues:** (1) HTML table paste doesn't work despite being marked "Implemented" ([Community: Table paste](https://community.anytype.io/t/copy-and-paste-from-html-or-markdown-tables-or-excel-into-simple-tables/6927), Sep 2025). (2) Markdown link paste breaks non-standard protocols like `zotero://` and `obsidian://` ([Community: Markdown URL parsing](https://community.anytype.io/t/markdown-url-parsing-when-pasted-into-anytype/10688)). (3) Pasting markdown code inserts spurious empty lines ([Community: Empty lines bug](https://community.anytype.io/t/pasting-markdown-code-is-inserting-empty-lines/6024)). (4) No source view / no HTML writing support — open feature request.
