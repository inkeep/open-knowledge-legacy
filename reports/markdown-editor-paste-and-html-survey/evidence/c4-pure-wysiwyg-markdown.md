# Cluster: C4 — Pure WYSIWYG Markdown Editors

## Editor: Typora

### D1 — Paste handling

**Detection strategy:** HTML-first MIME-type detection. Typora prioritizes `text/html` from the clipboard and converts it to markdown. If HTML is unavailable, falls back to plain text. No markdown-syntax heuristic needed — the strategy is MIME-based. **CONFIRMED** — [Typora Copy and Paste docs](https://support.typora.io/Copy-and-Paste/): "firstly, Typora chooses HTML format in clipboard and converts it into Markdown."

**Default behavior:** Silent auto-convert. HTML clipboard content is silently converted to markdown-formatted content in the WYSIWYG view. No confirmation prompt. **CONFIRMED** — same source.

**Syntax coverage:** All markdown constructs that can be represented in HTML — headings, bold/italic, lists, tables, code blocks, blockquotes, links, images. The conversion is from HTML semantics, not from markdown syntax detection. **CONFIRMED** — Typora renders `<h1>HEADING</h1>` as a first-level heading when pasted.

**HTML paste:** HTML from web pages is converted to the closest markdown equivalent. Formatting is preserved (headings, bold, italics, lists). Pasting from Google Docs has known issues with code formatting preservation. **CONFIRMED** — [GitHub issue #5978](https://github.com/typora/typora-issues/issues/5978) documents code formatting loss from Google Docs.

**Sanitization:** Typora is an Electron app. Scripts are blocked: "no scripts are supported, no matter if you use `<script>` or `onload` attributes." Iframes run sandboxed. Chromium's built-in clipboard sanitization applies as a first layer. A historical vulnerability (v0.9.9.21.1) allowed RCE via unsanitized `file://` URIs in HTML attributes — [GitHub issue #2166](https://github.com/typora/typora-issues/issues/2166). No evidence of DOMPurify specifically; security is via attribute stripping + script blocking + Electron sandbox. **CONFIRMED** (script blocking) / **INFERRED** (Chromium clipboard sanitization as base layer).

**Escape hatches:** `Cmd+Shift+V` (macOS) / `Ctrl+Shift+V` (Windows/Linux) = "Paste as Plain Text" which is equivalent to "Paste as Markdown Source" — pastes raw markdown syntax without HTML conversion. `Cmd+Option+Shift+V` also available on macOS. **CONFIRMED** — [Typora Copy and Paste docs](https://support.typora.io/Copy-and-Paste/).

### D2 — HTML-in-markdown rendering

**Rendering approach:** Common HTML tags are rendered inline as actual HTML in the WYSIWYG view. Inline tags (`<span>`, `<sup>`, `<kbd>`, `<ruby>`) render immediately after closing tag. Block-level tags (`<details>`, `<video>`, `<audio>`, `<iframe>`) render in separate blocks with edit/preview toggle. HTML entities (e.g. `&frac14;`) are rendered. **CONFIRMED** — [Typora HTML Support](https://support.typora.io/HTML/).

**Editing:** HTML blocks enter edit mode via cursor placement, clicking non-interactive areas, or Cmd/Ctrl+click. Inline HTML is directly editable. Empty tags and `display:none` elements remain visible for editing. **CONFIRMED** — same source.

**Round-trip:** HTML is preserved in the markdown source file. On export to HTML/PDF/EPub, all HTML including unsupported attributes (`id`, `class`, `data-*`) is included. However, these attributes are stripped during rendering (visual asymmetry between editor and export). Custom tags like `<my-component>` are ignored in rendering but preserved on export. **CONFIRMED** — [Typora HTML Support](https://support.typora.io/HTML/): "id, class, data-* and unknown attributes...will not be included when rendering (They will be included when exporting/printing)."

**Security:** Scripts fully blocked. `<style>` and `<meta>` show raw source only, not applied. `<iframe>` sandboxed without document access. Custom tags ignored in rendering. **CONFIRMED** — same source.

**Known issues:** Historical RCE via `file://` URI in HTML attributes (fixed). Attribute rendering asymmetry between editor and export. Pandoc-based export may lose exact formatting due to AST conversion. **CONFIRMED** — [GitHub issue #2166](https://github.com/typora/typora-issues/issues/2166); [Typora Export docs](https://support.typora.io/Export/).

---

## Editor: Bear

### D1 — Paste handling

**Detection strategy:** Rich-text MIME-type based. Bear reads the `text/html` / RTF clipboard format and converts to its internal markdown representation. Bear does NOT parse markdown syntax from the clipboard — it converts rich-text formatting. **CONFIRMED** — [Bear Community thread](https://community.bear.app/t/copy-existing-markdown-and-paste-into-bear-is-losing-some-formatting/18764): "Bear uses the rich-text clipboard entry and converts it to Markdown."

**Default behavior:** Silent auto-convert. Standard `Cmd+V` preserves formatting from source (bold, italics) by converting rich text to markdown syntax. No confirmation prompt. **CONFIRMED** — [Bear Community paste discussion](https://community.bear.app/t/paste-and-match-style/6009).

**Syntax coverage:** Formatting that maps to Bear's supported markdown subset: headings, bold, italic, underline, lists, links. However, heading levels frequently get mangled — H2 pastes as H1, or headings drop entirely. Code blocks and inline code intermittently lose backticks. Blank lines between paragraphs may collapse. **CONFIRMED** — [Bear Community formatting loss thread](https://community.bear.app/t/copy-existing-markdown-and-paste-into-bear-is-losing-some-formatting/18764).

**HTML paste:** HTML from web pages is converted to markdown via rich-text intermediary. URLs are auto-expanded into markdown links with titles (sometimes unwanted). Results vary by source — pasting from AI assistants (ChatGPT, Claude) and markdown generators produces inconsistent formatting. **CONFIRMED** — [Bear Community URL paste thread](https://community.bear.app/t/paste-url-as-text-not-markdown/13005); community reports.

**Sanitization:** Not documented. Bear is a native macOS/iOS app (not Electron), so it uses Apple's NSPasteboard APIs. No evidence of explicit HTML sanitizer — Bear doesn't render HTML, so the attack surface is limited to rich-text parsing. **INFERRED**.

**Escape hatches:** `Opt+Shift+Cmd+V` = "Paste From > Plain Text" (strips all formatting). `Edit > Paste From > Rich Text` preserves and converts formatting. Note: Bear 2.0 reversed the semantics from Bear 1.0 — the meaning of "Paste From Rich Text" changed between versions. **CONFIRMED** — [Bear Community paste discussion](https://community.bear.app/t/paste-and-match-style/6009).

### D2 — HTML-in-markdown rendering

**Rendering approach:** HTML is NOT rendered in Bear's editor. Raw HTML tags typed or pasted into a note appear as literal text. Bear stores notes as plain text with markdown syntax; HTML tags are treated as inert characters. **CONFIRMED** — [Markdown Guide: Bear](https://www.markdownguide.org/tools/bear/): "HTML is not rendered in Bear notes."

**Export behavior:** HTML tags are rendered when notes are exported to HTML format (Bear Pro feature). The tags pass through to the HTML export as-is. **CONFIRMED** — same source.

**Editability:** HTML tags are always visible and editable as plain text in the editor. No source mode toggle needed — the editor is always showing the raw text (with markdown rendering overlay). **CONFIRMED** — Bear uses a hybrid live-editor that shows markdown syntax.

**Round-trip:** HTML tags survive as literal text through Bear's save/load cycle since Bear stores everything as plain text. However, they will never render visually in the editor itself. **INFERRED** — follows from plain-text storage model.

**Security:** Non-applicable for editor rendering (HTML is never interpreted). Export to HTML passes tags through without documented sanitization. **INFERRED**.

**Known issues:** No specific HTML-handling issues found in GitHub or community forums, because HTML simply isn't a feature Bear supports in its editor. The main known issues are with markdown paste fidelity (heading level munging, formatting loss). **CONFIRMED** — community threads focus on markdown formatting, not HTML.

---

## Editor: iA Writer

### D1 — Paste handling

**Detection strategy:** No markdown detection. iA Writer is a plain-text editor — pasted content arrives as plain text. The editor does not inspect clipboard content for markdown syntax or attempt to auto-format pasted text. **INFERRED** — iA Writer documentation focuses on "Smart Copy/Paste" (auto-spacing) only; no markdown detection feature documented. [iA Writer Smart Automation](https://ia.net/writer/support/editor/smart-automation).

**Default behavior:** Plain-text passthrough. Content pasted from web pages or rich-text sources loses formatting and arrives as unformatted plain text. iA Writer's philosophy: "Markdown-formatted document should be publishable as-is, as plain text." **INFERRED** — [iA Writer Markdown Guide](https://ia.net/writer/support/basics/markdown-guide); no rich-text-to-markdown conversion documented.

**Syntax coverage:** N/A — iA Writer does not detect or convert markdown constructs on paste. If you paste markdown source text, it appears verbatim (which is correct behavior since the editor IS a markdown source editor). **INFERRED**.

**HTML paste:** Rich text from web pages is pasted as plain text (formatting lost). To get markdown from HTML, users must use external tools like clipboard-to-markdown converters. **INFERRED** — [iA Writer Multichannel Text Processing](https://ia.net/topics/multichannel-text-processing) discusses plain-text as the foundation; no HTML-to-markdown conversion documented.

**Sanitization:** Not applicable — no HTML conversion occurs on paste. **INFERRED**.

**Escape hatches:** "Smart Copy/Paste" toggle in Settings > Editor adds/removes automatic spacing around pasted content. Standard macOS `Cmd+Shift+V` / `Opt+Shift+Cmd+V` for paste-and-match-style applies. No iA Writer-specific paste mode. **CONFIRMED** (Smart Copy/Paste) — [iA Writer Smart Automation](https://ia.net/writer/support/editor/smart-automation). **INFERRED** (macOS shortcuts).

### D2 — HTML-in-markdown rendering

**Rendering approach:** Raw HTML is supported in iA Writer's markdown processing. In the **editor view**, HTML appears as raw markup text (not rendered). In **Preview mode**, HTML is parsed and rendered by the MultiMarkdown processor — HTML tags render as actual HTML elements. **CONFIRMED** — [Peer Reviewed: Using Inline HTML in iA Writer](https://www.peerreviewed.io/blog/using-in-line-html-to-preview-images-in-ia-writer): HTML code visible in editor, rendered in preview. [Markdown Guide: iA Writer](https://www.markdownguide.org/tools/ia-writer/) lists HTML as supported.

**Supported elements:** The Markdown Guide entry marks iA Writer as supporting HTML ("Yes"). The editor supports `<figure>`, `<figcaption>`, `<br>` (via Shift+Enter), and inline HTML generally. iA Writer also supports `<sub>`, `<sup>`, subscript, and superscript. **CONFIRMED** — [Markdown Guide tool entry](https://github.com/mattcone/markdown-guide/blob/master/_tools/ia-writer.md); [Peer Reviewed article](https://www.peerreviewed.io/blog/using-in-line-html-to-preview-images-in-ia-writer).

**Editability:** HTML is only editable in the text editor view (always visible as raw markup). Preview mode shows rendered output but is read-only. No WYSIWYG editing of HTML. **CONFIRMED** — iA Writer's editing model is always source-text; preview is separate.

**Round-trip:** HTML survives round-trip because iA Writer stores files as plain markdown text. HTML tags are preserved verbatim in the `.md` file. On export to HTML/PDF/Word via templates, HTML is rendered by the MultiMarkdown processor. **CONFIRMED** — [iA Writer Templates](https://github.com/iainc/iA-Writer-Templates).

**Security:** Not documented. Preview rendering uses MultiMarkdown's HTML output piped through custom templates (HTML/CSS/JS). No explicit sanitization documented for inline HTML. The editor itself doesn't execute HTML (it's plain text). Preview presumably runs in a constrained WebView. **UNCERTAIN** — no documentation found on HTML sanitization in preview.

**Known issues:** No specific HTML rendering issues found. The main community discussion is around iA Writer's "annotations" feature (iA Writer 7) which is a proprietary markdown extension, not HTML-related. A MacPowerUsers forum thread reports a "perplexing Markdown problem" but it relates to markdown parsing, not HTML. **NOT FOUND** — searched GitHub, MacPowerUsers, Obsidian forums for iA Writer HTML issues; none specific to HTML rendering.
