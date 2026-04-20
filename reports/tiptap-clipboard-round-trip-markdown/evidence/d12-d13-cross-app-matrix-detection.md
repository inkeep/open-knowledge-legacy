# Evidence: D12 + D13 — Cross-App Paste Matrix + Source Detection Heuristics

**Dimensions:** D12 (what's on the clipboard from each source), D13 (detection heuristics per source)
**Date:** 2026-04-15
**Sources:** W3C / MDN, vendor help docs, source-code inspection (CKEditor 5, Milkdown, Keystatic, Outline, BlockNote, @github/paste-markdown, ProseMirror), technical deep-dives, community observations.

---

## Compact summary

| Source | MIMEs (priority) | HTML shape | Garbage to strip | Detection | FP risk |
|---|---|---|---|---|---|
| **Google Docs** | text/plain, text/html, sometimes text/rtf | `<b id="docs-internal-guid-…">…<p dir="ltr">…<span style="font-size:…">` | guid `<b>` wrapper, per-char style spans, `<div dir="ltr">` around tables, `<meta charset>` | `/id=("\|')docs-internal-guid-[-0-9a-f]+/i` | Low |
| **Google Sheets** | text/plain (TSV), text/html | `<google-sheets-html-origin><table data-sheets-value=…>` | `<google-sheets-html-origin>` wrapper, inline `<style>` | `/<google-sheets-html-origin/i` | Low |
| **Notion** | text/plain (Notion markdown), text/html | block divs; `<!-- notionvc: UUID -->` comment present | minimal HTML cruft; text/plain is the canonical path | `notionvc:` comment OR prefer text/plain | Medium (on HTML) |
| **Slack (message)** | text/plain, text/html, `org.chromium.web-custom-data` | `c-message_kit__*` classes | Slack CSS classes, timestamps | substring `c-message_kit__` | Low |
| **Linear / BlockNote / Outline / Our editor / any TipTap** | text/plain, text/html with `data-pm-slice` | `<div data-pm-slice="openStart openEnd [ctx]">…</div>` | Chrome `<meta>` prefix | `[data-pm-slice]` attr exists | Very low |
| **Gmail (compose/message)** | text/plain, text/html | `<div dir="ltr" class="gmail_default">`, `gmail_quote`, `gmail_signature`, `gmail_extra` | `gmail_*` classes, inline styles | `/class="gmail_(quote\|default\|extra\|signature\|attr)"/` | Low |
| **Microsoft Word** | text/plain, text/html, text/rtf, CF_HTML (Win) | `<html xmlns:o="…"><meta name="Generator" content="Microsoft Word…">`, `MsoNormal`, `mso-*`, `<o:p>`, `<!--[if gte mso 9]>` | conditional comments, `<o:*>/<w:*>/<m:*>` tags, `mso-*` styles, `Mso*` classes, SmartTag | `/xmlns:o="urn:schemas-microsoft-com/i` OR `/<meta[^>]+generator[^>]+microsoft word/i` | Very low (also catches LibreOffice Office-HTML — fine) |
| **Apple Pages** | text/plain, text/rtf, text/html (secondary), iWork UTIs | standard HTML + Pages inline styles | Pages style attrs | sometimes `<meta name="Generator" content="Cocoa HTML Writer">` | Medium (shared w/ Notes/Mail) |
| **Apple Notes** | text/html, text/rtf, webarchive, text/plain | `<meta…Cocoa HTML Writer>`, `Apple-tab-span`, `Apple-converted-space` spans | Apple-* spans, Cocoa meta | `Cocoa HTML Writer` generator OR `Apple-tab-span`/`Apple-converted-space` classes | Medium (shared) |
| **VS Code** | text/plain, text/html, `vscode-editor-data` | single `<div style="font-family:monospace">` with per-line `<div>` of `<span>`s | all color spans if converting to code block | MIME `vscode-editor-data` (Chromium) OR structural (Keystatic pattern) | Very low (MIME) / Low (structural) |
| **GitHub (rendered comment)** | text/plain, text/html | `<a class="commit-link" data-hovercard-type=…>` | GitHub hovercard attrs | `.commit-link` or `[data-hovercard-type]` | Low |
| **GitHub (textarea)** | text/plain, `text/x-gfm` (sync-event custom) | n/a (textarea is markdown source) | n/a | `types.includes('text/x-gfm')` | Low |
| **ChatGPT / Claude web (copy button)** | text/plain only (markdown) | — | none | no text/html + isMarkdown(text/plain) | High (no fingerprint) |
| **ChatGPT / Claude web (select-and-copy)** | text/plain (rendered), text/html (framework) | Tailwind-class wrappers | framework classes | no reliable marker | High |
| **Typora** | text/plain (MD if pref) / rendered, text/html, text/rtf | clean rendered HTML | none | none needed | N/A |
| **BlockNote** | text/plain=MD, text/html, `blocknote/html` | round-trippable HTML | none for round-trip path | `types.includes('blocknote/html')` | Very low |
| **Anytype** | text/plain, text/html | standard HTML | none documented | none reliable | High |

---

## Detailed per-source findings

### Google Docs (CONFIRMED)

**MIMEs:** text/plain, text/html, sometimes text/rtf. macOS pasteboard may carry `application/x-vnd.google-docs-document-slice-clip+wrapped`.

**HTML sample shape:**
```html
<meta charset="utf-8">
<b id="docs-internal-guid-7d347fee-7fff-afd7-ca79-41b3a53d7fad" style="font-weight:normal;">
  <p dir="ltr" style="…">
    <span style="font-size:11pt;font-family:Arial…">Hello </span>
    <span style="…font-weight:700">World</span>
  </p>
</b>
```

Tables: double-wrapped `<div dir="ltr"><table>…</table></div>`.

**Garbage patterns:**
- Top-level `<b id="docs-internal-guid-…" style="font-weight:normal;">` — the bold is semantically null (font-weight:normal overrides); purely a GUID carrier.
- Per-character `<span style="…">` with font-family, font-size, line-height, color, background-color, font-weight:400 on every run.
- `<meta charset="utf-8">` prefix.
- `<div dir="ltr">` around tables.
- Opaque GUIDs on headings tied to Google's local storage.

**Preserved content:** Heading structure (h1-h6 or styled `<p>`), lists, links, tables, images (googleusercontent URLs), semantic formatting as inline styles (font-weight:700 = bold, font-style:italic = italic).

**Detection:** `/id=("|')docs-internal-guid-[-0-9a-f]+("|')/i` — CKEditor's canonical regex. Zero known non-GDocs sources use this string.

**Citations:** CKEditor 5 `googledocsnormalizer.ts` `isActive`; Milkdown `plugin-clipboard/src/index.ts:45-64`; iter.ca/post/docs-html/ (mechanism explanation).

### Google Sheets (CONFIRMED)

**MIMEs:** text/plain (TSV), text/html.

**Sample:**
```html
<meta name="generator" content="Sheets"/>
<google-sheets-html-origin>
  <style type="text/css">…</style>
  <table cellspacing="0" cellpadding="0">
    <tr><td data-sheets-value='{"1":3,"3":42}' data-sheets-formula="=2*R[0]C[-1]">42</td></tr>
  </table>
</google-sheets-html-origin>
```

**Garbage:** `<google-sheets-html-origin>` wrapper, `<style>` block.
**Preserve:** Table structure, data-sheets-value JSON (for type conversion), data-sheets-formula.
**Detection:** `/<google-sheets-html-origin/i` — unique custom element.
**Citations:** CKEditor 5 `googlesheetsnormalizer.ts`; iter.ca/post/docs-html/.

### Notion (CONFIRMED behavior / UNCERTAIN HTML marker)

**MIMEs:** text/plain (Notion-flavored markdown with `#`, `**`, lists), text/html (block-structured).

**HTML shape:** Not strongly characteristic. Notion emits `<!-- notionvc: UUID -->` comments in the HTML body.

**Detection:**
- Prefer text/plain as markdown (Notion's own convention).
- If detecting text/html source: scan for `<!-- notionvc:` comment (BlockNote's heuristic in `api/parsers/html/util/normalizeWhitespace.ts:9-24`).

**False-positive risk:** High for any HTML-fingerprint. Use generic HTML→MD for Notion without vendor-specific cleanup.

**Citations:** notion.com/help; zirkelc.dev/posts/html-to-notion-blocks; BlockNote `isNotionHTML`.

### Slack (message, CONFIRMED)

**MIMEs:** text/plain, text/html, `org.chromium.web-custom-data` with `slack/texty` (Quill Delta JSON).

**HTML shape (from rendered Slack message):**
```html
<div class="c-message_kit__message">
  <span class="c-message__sender_link">user</span>
  <div class="c-message_kit__text">…text with <b>/<i>/<code> spans…</div>
</div>
```

**Garbage:** `c-message_*` classes, timestamps, reaction emoji spans.
**Detection:** Substring `c-message_kit__` OR `c-message__`.
**Citations:** slackfmt README (`slack/texty` format); Detectify Labs `org.chromium.web-custom-data` writeup; Quill docs.

### ProseMirror-origin / TipTap editors / Linear / BlockNote / Outline / Our own (CONFIRMED)

**MIMEs:** text/plain (via clipboardTextSerializer or textBetween), text/html with `data-pm-slice` attr.

**HTML format** (`prosemirror-view/src/clipboard.ts`):
```html
<div data-pm-slice="0 0 [{"type":"doc"}]">
  <p>paragraph text</p>
</div>
```

Attribute format: `"${openStart} ${openEnd}${wrappers ? ` -${wrappers}` : ""} ${JSON.stringify(context)}"` parsed by `/^(\d+) (\d+)(?: -(\d+))? (.*)/`.

**Garbage:** Chrome's `<meta http-equiv="content-type" content="text/html; charset=utf-8">` prefix. ProseMirror `readHTML` strips via `/^(\s*<meta [^>]*>)*/`.

**Preserved:** Full schema-valid structure — CANONICAL for editor-to-editor round-trip.

**Detection:** `parsed.querySelector('[data-pm-slice]') !== null`.

**Special case:** Cross-schema paste (Outline → us) has `data-pm-slice` but context may name nodes absent in our schema. PM's `parseFromClipboard` handles gracefully.

**BlockNote addition:** writes `blocknote/html` custom MIME for higher-fidelity round-trip of block types. Higher priority than generic text/html in their read path.

**Citations:** ProseMirror `prosemirror-view/src/clipboard.ts:~220`; Tiptap issue #2514.

### Gmail (CONFIRMED)

**HTML shape:**
```html
<div dir="ltr">
  <div class="gmail_default" style="font-family:arial,sans-serif;font-size:small">…</div>
  <blockquote class="gmail_quote" style="margin:0 0 0 .8ex;border-left:1px #ccc solid;padding-left:1ex">…</blockquote>
</div>
```

**Garbage:** `gmail_default`, `gmail_quote`, `gmail_extra`, `gmail_signature`, `gmail_attr` classes; per-paragraph inline font-family/font-size; `<div dir="ltr">` wrappers.

**Preserved:** quote structure, bold/italic/underline, links, images (cid: or download-gated), lists.

**Detection:** `/class="gmail_(quote|default|extra|signature|attr)"/`.

### Microsoft Word (CONFIRMED)

**MIMEs:** text/plain, text/html, text/rtf, CF_HTML on Windows.

**HTML shape:**
```html
<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="…" xmlns:m="…">
<head>
<meta http-equiv="Content-Type" content="text/html; charset=utf-8">
<meta name="Generator" content="Microsoft Word 15 (filtered medium)">
<!--[if gte mso 9]><xml>…</xml><![endif]-->
<style>p.MsoNormal {…} </style>
</head>
<body lang=EN-US>
<p class=MsoListParagraphCxSpFirst style='text-indent:-.25in;mso-list:l0 level1 lfo1'>
  <![if !supportLists]><span style='…mso-list:Ignore'>·<span>&nbsp;&nbsp;</span></span><![endif]>
  Item one<o:p></o:p>
</p>
</body></html>
```

**Garbage:**
- `<!--[if gte vml 1]>` / `<!--[if gte mso 9]>` conditional comments.
- `<o:*>`, `<w:*>`, `<m:*>` namespaced tags (especially `<o:p></o:p>`).
- `mso-*` inline styles.
- `MsoNormal`, `MsoListParagraph*` CSS classes.
- Large `<style>` blocks.
- VML-wrapped images.

**Preserved:** Paragraphs, bold/italic/underline (as inline styles), rough list intent (mso-list), tables, images.

**List reconstruction:** CKEditor's `transformListItemLikeElementsIntoLists` — hundreds of lines — reads `mso-list:l0 level1 lfo1` hints, extracts levels from `<style>` block, reconstructs nested `<ol>/<ul>` from flat paragraphs.

**Detection (CKEditor canonical):**
- `/<meta\s*name="?generator"?\s*content="?microsoft\s*word\s*\d+"?\/?>/i`
- OR `/xmlns:o="urn:schemas-microsoft-com/i`

**False-positive risk:** Very low. LibreOffice "Office HTML" exports also match `xmlns:o` — practically fine since it benefits from the same cleanup.

**Citations:** CKEditor 5 `mswordnormalizer.ts`, `filters/list.ts`, `filters/removemsattributes.ts`; Microsoft Community Hub; learn.microsoft.com "HTML Clipboard Format".

### Apple Pages / Notes / TextEdit / Mail (CONFIRMED macOS pasteboard; UNCERTAIN specific markers)

**MIMEs (macOS UTIs):** `public.html`, `public.rtf`, `com.apple.webarchive`, `com.apple.flat-rtfd`, `public.utf8-plain-text`.

**HTML shape:** Often `<meta name="Generator" content="Cocoa HTML Writer">` + body with inline-styled spans. Notes includes `<span class="Apple-tab-span" style="white-space:pre">` for tabs, `class="Apple-converted-space"` for whitespace.

**Garbage:** Cocoa-wrapper spans, inline styles, Apple-* classes.

**Detection:**
- `<meta name="Generator" content="Cocoa HTML Writer">` — shared across Cocoa text-system apps (Notes, Mail, TextEdit, Pages).
- OR presence of `class="Apple-tab-span"` / `class="Apple-converted-space"`.

**False-positive risk:** Medium for source identification (shared marker), but CLEANUP is identical — strip Apple-* spans, drop Cocoa meta. A "false positive" is harmless.

**Citations:** Apple developer docs on NSPasteboard; Apple discussions threads on Pages; macos-pasteboard GitHub tool.

### VS Code (CONFIRMED)

**MIMEs:** text/plain, text/html, `vscode-editor-data` (JSON `{version, isFromEmptySelection, multicursorText, mode}`).

**HTML shape:**
```html
<div style="color:#d4d4d4;background-color:#1f1f1f;font-family:'Droid Sans Mono','monospace',monospace;font-weight:normal;font-size:14px;line-height:19px;white-space:pre;">
  <div><span style="color:#569cd6;">const</span><span> </span><span style="color:#9cdcfe;">x</span></div>
  <div><span style="color:#d4d4d4;">…</span></div>
</div>
```

**Preserved content:** Exact per-line text. Right strategy: convert to fenced code block using `mode` from vscode-editor-data as language.

**Detection (two paths):**
1. **Preferred (Chromium only):** `types.includes('vscode-editor-data')` — definitive; carries `mode` directly.
2. **Fallback cross-browser (Keystatic pattern):** structural — root single `<div>` with `style.fontFamily.includes('monospace')`; children `<div>` or `<br>`; each `<div>` contains only `<span>`s.

**Citations:** Milkdown `plugin-clipboard/src/index.ts`; Keystatic `clipboard.tsx:77-97`; ProseMirror discuss #4108.

### GitHub (CONFIRMED)

**Rendered comment copy:** text/plain, text/html with GitHub classes.

**HTML shape:**
```html
<p>See <a class="commit-link" data-hovercard-type="commit" href="/owner/repo/commit/abc">commit abc</a> from <a data-hovercard-type="user" href="/user">@user</a>.</p>
```

**Garbage:** `data-hovercard-*` attrs, `commit-link` class, GitHub-signed hrefs.

**Textarea copy:** `types.includes('text/x-gfm')` (via `@github/paste-markdown`) contains markdown source.

**Detection:**
- Read-side: `types.includes('text/x-gfm')` (textarea)
- HTML-side: `.commit-link` OR `[data-hovercard-type]` (rendered comment)

**Citations:** @github/paste-markdown; github.blog/changelog/2022-05-19; community discussion 65235 (triple-MIME duplication bug).

### ChatGPT / Claude (CONFIRMED behavior / UNCERTAIN markers)

**Copy button:** text/plain ONLY (markdown source). No text/html.
**Select-and-copy:** text/plain (rendered plaintext), text/html (framework classes — Tailwind prose).

**Detection:** None reliable. Pragmatic: if no text/html AND text/plain looks like markdown → treat as markdown. (Inverts normal text/html-first priority.)

**Citations:** unmarkdown.com/blog/how-to-copy-from-claude; OpenAI community thread 357931.

### Typora / BlockNote / Anytype

- **Typora:** text/plain (MD if "Copy Markdown source" pref), text/html, text/rtf. Clean HTML. No vendor-specific cleanup needed.
- **BlockNote:** text/plain=MD, text/html, `blocknote/html` custom MIME. Detection: `types.includes('blocknote/html')`.
- **Anytype:** standard HTML, no documented fingerprint.

---

## Consolidated detection heuristics (in evaluation order)

| Priority | Heuristic | Source | Confidence | False-positive risk |
|---|---|---|---|---|
| 1 | `types.includes('vscode-editor-data')` | VS Code | High | Very low |
| 2 | `types.includes('blocknote/html')` | BlockNote | High | Very low |
| 3 | `types.includes('text/x-gfm')` | GitHub textarea | High | Low |
| 4 | `parsed.querySelector('[data-pm-slice]')` ≠ null | ProseMirror-origin (incl. us, Linear, Outline, BlockNote visual paste, any TipTap) | High | Very low |
| 5 | `/id=("\|')docs-internal-guid-[-0-9a-f]+/i` | Google Docs | High | Low |
| 6 | `/<google-sheets-html-origin/i` | Google Sheets | High | Very low |
| 7 | `/<meta[^>]+generator[^>]+microsoft word/i` OR `/xmlns:o="urn:schemas-microsoft-com/i` | Word / Office HTML | High | Very low |
| 8 | `/class="gmail_(quote\|default\|extra\|signature\|attr)"/` | Gmail | Medium-High | Low |
| 9 | `<!-- notionvc:` comment | Notion | Medium-High | Low |
| 10 | Structural VS Code (single monospace div → div > span) | VS Code (cross-browser) | Medium | Low |
| 11 | `Cocoa HTML Writer` generator OR `Apple-tab-span`/`Apple-converted-space` class | Apple Cocoa family | Medium | Medium (shared marker, harmless cleanup) |
| 12 | `c-message_kit__` substring | Slack | Medium-High | Low |
| 13 | `.commit-link` OR `[data-hovercard-type]` | GitHub rendered comment | Medium | Low |
| 14 | `isMarkdown(text/plain)` signal count | Copy-button from AI chat, markdown editors | Low-Medium | Medium |

**`isMarkdown(text)` heuristic (Outline's `isMarkdown.ts`):** signal-count scoring, threshold `min(3, floor(lineCount/5))`. Weighted signals: fences (1), inline latex (1), links (2), relative links (2), ATX headings (1), bullet markers (1), table separators (1).

---

## Routing pipeline implications

From the heuristics above, a **5-branch paste handler** emerges. Order matters; earlier branches are higher-fidelity.

### Branch 1 — PM-origin / custom MIME with known contract
`[data-pm-slice]` present → route to PM's native `parseFromClipboard` (preserves structure).
`vscode-editor-data` present → wrap text/plain in fenced code block with `mode` as language; skip text/html.
`text/x-gfm` present → read directly as markdown.
`blocknote/html` present → high-fidelity HTML path.

### Branch 2 — Known-garbage sources
Test against regex panel:
- GDocs → unwrap `<b id="docs-internal-guid">`, unwrap `<div dir="ltr">` around tables.
- GSheets → preserve `<table data-sheets-*>`, strip outer `<google-sheets-html-origin>`, inner `<style>`.
- Word → strip conditional comments, `<o:*>/<w:*>/<m:*>` tags, `mso-*` styles, `Mso*` classes, SmartTag, `<meta Generator>`, inline `<style>`. Reconstruct lists from `mso-list` hints. Strip VML or convert.
- Gmail → strip `gmail_*` classes (keep content), unwrap trivial `<div dir="ltr">`.
- Apple Cocoa → strip Apple-* classes, drop Cocoa meta.
- Slack → strip `c-message_*` wrappers, extract content.

Then generic HTML→markdown conversion.

### Branch 3 — Generic rich HTML
Notion, AI chat select-and-copy, Anytype, Typora, generic web. Generic HTML→MD without source-specific cleanup.

### Branch 4 — text/plain only (or text/html absent)
Apply `isMarkdown()` signal-count. Above threshold → parse as markdown. Below → insert as plain text. This is the AI-chat copy-button path.

### Branch 5 — Cross-branch cleanup (all HTML paths)
Pre-process before passing to HTML→MD:
- Strip leading `<meta>` (Chrome prefix).
- Unwrap nested single-child `<div>` chains.
- Collapse runs of `<span>` with identical inline styles.

---

## Gaps / follow-ups

- **Live empirical samples from each app** — some evidence is third-party. Small test matrix post-implementation (paste from each app, capture clipboard via Playwright `evaluate` or devtools, compare) would upgrade several entries from INFERRED/UNCERTAIN → CONFIRMED.
- **Linear / Notion / Slack exact paste code** — closed-source; documented externally. Impossible to CONFIRM without live testing.
- **CKEditor's Word-list-reconstruction** is the depth reference we haven't matched. If we encounter a gap in our Word handling, CKEditor's `filters/list.ts` is the place to learn from.

---

## Sources

All accessed 2026-04-15.

Primary detection-string references:
- https://github.com/ckeditor/ckeditor5/blob/master/packages/ckeditor5-paste-from-office/src/normalizers/googledocsnormalizer.ts
- https://github.com/ckeditor/ckeditor5/blob/master/packages/ckeditor5-paste-from-office/src/normalizers/googlesheetsnormalizer.ts
- https://github.com/ckeditor/ckeditor5/blob/master/packages/ckeditor5-paste-from-office/src/normalizers/mswordnormalizer.ts
- https://github.com/ckeditor/ckeditor5/blob/master/packages/ckeditor5-paste-from-office/src/filters/parse.ts
- https://github.com/ckeditor/ckeditor5/blob/master/packages/ckeditor5-paste-from-office/src/filters/list.ts
- https://github.com/ckeditor/ckeditor5/blob/master/packages/ckeditor5-paste-from-office/src/filters/removemsattributes.ts
- https://github.com/ProseMirror/prosemirror-view/blob/master/src/clipboard.ts
- https://github.com/Milkdown/milkdown/blob/main/packages/plugins/plugin-clipboard/src/index.ts
- https://github.com/Thinkmill/keystatic/blob/main/packages/keystatic/src/form/fields/markdoc/editor/markdoc/clipboard.tsx
- https://github.com/outline/outline/blob/main/shared/editor/lib/isMarkdown.ts
- https://github.com/github/paste-markdown/blob/main/src/paste-markdown-html.ts
- https://github.com/TypeCellOS/BlockNote/blob/main/packages/core/src/api/parsers/html/util/normalizeWhitespace.ts

Vendor + platform:
- https://www.w3.org/TR/clipboard-apis/
- https://developer.mozilla.org/en-US/docs/Web/API/ClipboardItem
- https://developer.apple.com/documentation/appkit/nspasteboard/pasteboardtype/html
- https://learn.microsoft.com/en-us/windows/win32/dataxchg/html-clipboard-format
- https://techcommunity.microsoft.com/t5/word/clipboard-text-html-formats-of-ms-editors/td-p/1870692
- https://www.notion.com/help/writing-and-editing-basics
- https://support.typora.io/Copy-and-Paste/
- https://www.blocknotejs.org/docs/reference/editor/paste-handling
- https://slack.com/help/articles/202288908-Format-your-messages
- https://github.com/cauethenorio/slackfmt
- https://labs.detectify.com/writeups/using-chromes-web-custom-data-uti-to-inject-a-stored-xss-in-slack/
- https://iter.ca/post/docs-html/
- https://unmarkdown.com/blog/how-to-copy-from-claude-without-losing-formatting
- https://discuss.prosemirror.net/t/how-to-decide-whether-text-or-html-is-pasted-vs-code-paste-support/4108
- https://discuss.prosemirror.net/t/clipboard-with-custom-mime/8542

Internal cross-references:
- /Users/edwingomezcuellar/projects/open-knowledge/reports/markdown-editor-paste-and-html-survey/REPORT.md (R18, 15-editor landscape)
- /Users/edwingomezcuellar/projects/open-knowledge/reports/tiptap-clipboard-round-trip-markdown/evidence/d2-d8-mime-strategy-browser-vendor.md
