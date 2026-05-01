# Evidence: D2 / D3 / D5 — Notion, Slack, Google Docs paste sanitizers

**Dimensions:** Cross-app paste handling for the non-email destinations.
**Date:** 2026-05-01

## Notion (D2)

### Sources
- [GoInsight — Using Markdown in Notion Without Losing Formatting (2025)](https://www.goinsight.ai/blog/markdown-to-notion/)
- [Super.so — Notion Markdown Cheat Sheet (2026)](https://super.so/blog/notion-markdown-guide-the-complete-cheat-sheet-2024)
- [Markdown Guide — Notion](https://www.markdownguide.org/tools/notion/)
- [Latenode — Animated SVG in Notion](https://community.latenode.com/t/can-you-actually-use-animated-svg-graphics-in-notion-this-is-amazing/39157)

### Findings

**D2-1 (CONFIRMED):** Notion's clipboard-paste handler converts pasted HTML to its block model, preserving basic formatting and dropping anything that doesn't map to a Notion block:
- Preserved: headers, lists, bold/italic, links, inline code.
- Stripped/flattened: footnotes, nested tables, LaTeX, custom elements.
- Code blocks: may be converted to plain text or inline code unless reformatted.

**D2-2 (INFERRED):** Notion does NOT preserve inline `<svg>` elements in pasted rich text. Notion supports SVG only via:
- File upload as a page icon
- Embed block (full URL embedding, not inline)
- `Data URL` for icons specifically

There is no path for paste-time inline `<svg>` to survive — Notion converts paste content to its block schema, which has no `svg` block type.

**D2-3 (CONFIRMED):** Notion accepts `<img src>` tags in pasted HTML and converts them to image blocks. From the prior research (`tiptap-clipboard-round-trip-markdown/d12-d13`), Notion has no reliable HTML fingerprint and prefers `text/plain` over `text/html` on paste. When it does take HTML, only mapped block-types survive.

### Gaps
- UNCERTAIN whether Notion preserves inline `<img src="https://...">` as inline image vs converting to a block (likely the latter).

---

## Slack (D3)

### Sources
- [Slack Developer Docs — Formatting with rich text](https://docs.slack.dev/block-kit/formatting-with-rich-text/)
- [Slack Developer Docs — Rich text block](https://docs.slack.dev/reference/block-kit/blocks/rich-text-block/)
- [Slack: send a HTML message — n8n Community](https://community.n8n.io/t/slack-send-a-html-message/12829)
- [GitHub — slackdown (data desk)](https://github.com/datadesk/slackdown)
- Hacker News — Slack rich text editor discussion
- [Vice — Slack's New Rich Text Editor Shows That Markdown Still Scares People](https://www.vice.com/en/article/slacks-new-rich-text-editor-shows-why-markdown-still-scares-people/)
- [Quill 2.0 release notes](https://quilljs.com/docs/upgrading-to-2-0)

### Findings

**D3-1 (CONFIRMED):** Slack's compose box uses Quill (not Tiptap as initially assumed). Slack's rich text format is Block Kit's `rich_text_block`, which has **no `svg` element type** in its schema. Permitted inline elements: `text`, `link`, `emoji`, `user`, `user_group`, `channel`. (Per Slack Developer Docs.)

**D3-2 (CONFIRMED):** Slack reads a custom `slack/texty` MIME type in `org.chromium.web-custom-data` for cross-Slack pastes; for cross-app pastes from web, Slack reads `text/html` and runs its own ProseMirror-style transform that maps to its `rich_text_block` schema. The transform preserves bold/italic/strikethrough/code/links/lists/blockquote and drops other elements. Inline `<svg>` is not in the supported set.

**D3-3 (CONFIRMED):** Slack does NOT support arbitrary HTML in messages. Per Quora / n8n threads — Slack does not natively render `<svg>`, `<style>`, `<script>`, etc. Custom emojis (`:slackmoji:`) are workspace-installed, not pasted-as-image.

**D3-4 (INFERRED):** `<img src="https://...">` in pasted HTML is treated as a link / file upload on Slack, depending on the paste shape. It is not preserved as an inline image inside the message. Inline images in Slack are workspace-managed emoji or uploaded attachments, not paste-time image elements.

### Gaps
- UNCERTAIN whether Slack converts pasted `<img src="https://...">` to a unfurled link or extracts the image as an upload. Empirical testing required.

---

## Google Docs (D5)

### Sources
- [Google Docs Editors Help — How to insert SVG into Google Doc](https://support.google.com/docs/thread/234538787/how-can-i-insert-an-svg-into-a-google-doc)
- [Google Docs Editors Help — Not able to insert SVG image in Google Docs](https://support.google.com/docs/thread/79758249/not-able-to-insert-svg-image-in-google-docs)
- [TinyMCE — Google Docs to HTML](https://www.tiny.cloud/blog/google-docs-powerpaste-rich-text-editor/)
- [Numerous — How to Paste with Formatting in Google Docs](https://numerous.ai/blog/how-to-paste-with-formatting-google-docs)

### Findings

**D5-1 (CONFIRMED):** Google Docs preserves common HTML formatting on paste:
- Headings, bold, italics, lists, links, basic colors.
- Sometimes inline code fonts.

**D5-2 (CONFIRMED):** Google Docs does NOT support inline `<svg>` in pasted HTML. Per multiple Google Docs Editors Help threads — directly pasting SVG files into Google Docs/Slides is not supported. The recommended workaround is to convert SVG → EMF (Enhanced Metafile) and insert as image.

**D5-3 (INFERRED):** `<img src="https://...">` in pasted HTML is preserved by Google Docs and inserted as an inline image (becomes a Google Docs image block with the URL fetched at paste time).

### Gaps
- UNCERTAIN behavior on Google Docs for pasted `<img src="data:image/svg+xml;base64,...">` — likely also unsupported given the broader SVG limitation.

---

## Cross-destination summary

| Destination       | Inline `<svg>` paste | Hosted `<img src>` paste | data: URI paste |
|-------------------|---------------------|--------------------------|-----------------|
| **Gmail**         | Blocked entirely    | Proxied through googleusercontent.com (works for PNG/JPG, fails for SVG) | Blocked → attachment |
| **Notion**        | Stripped (no svg block type) | Converted to image block | Likely stripped |
| **Slack**         | Not in `rich_text_block` schema → stripped | Likely treated as link/upload | Not supported |
| **Google Docs**   | Not supported (need EMF) | Preserved as inline image | Likely not supported |
| **Outlook 365 / new** | Retired Sept 2025 (XSS risk) | Works | Likely blocked |
| **Outlook Classic desktop** | Already blocked | Works | Likely blocked |

The pattern is consistent: **inline `<svg>` is not preserved by any of the 5 major destinations.** Hosted `<img>` (HTTPS URL) is the only image-shape that consistently survives.
