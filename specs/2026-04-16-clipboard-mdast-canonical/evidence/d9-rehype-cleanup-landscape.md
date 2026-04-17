# Evidence: D9 — rehype cleanup plugin landscape (standard vs DIY)

**Date:** 2026-04-16
**Sources:** Web search for published npm packages + GitHub survey of rich editors' paste-cleanup implementations.

---

## Finding D9-1: No standard OSS rehype plugin exists for vendor-specific HTML cleanup (CONFIRMED)

Surveyed candidates across 9 vendor sources. Every vendor has a known HTML shape, documented detection fingerprint in research Part 2 §D13, and reference implementations inside production editor monoliths — but **none is published as a unified/rehype ecosystem plugin on npm**.

| Vendor | Fingerprint | Reference implementation | npm package? |
|---|---|---|---|
| Google Docs | `id="docs-internal-guid-…"` | Milkdown `packages/plugins/plugin-clipboard/src/index.ts:45-64`; CKEditor 5 `normalizers/googledocsnormalizer.ts` | NOT FOUND |
| Word / Office HTML | `xmlns:o="urn:schemas-microsoft-com"` OR Generator meta | CKEditor 5 `normalizers/mswordnormalizer.ts` + `filters/removemsattributes.ts` | NOT FOUND |
| Apple Cocoa (Notes/Mail/TextEdit/Pages) | `Cocoa HTML Writer` meta OR `Apple-tab-span`/`Apple-converted-space` | No public implementation found; pattern observed | NOT FOUND |
| Gmail | `class="gmail_(quote\|default\|extra\|signature\|attr)"` | No public implementation found; pattern observed | NOT FOUND |
| Notion whitespace | `<!-- notionvc:` comment | BlockNote `api/parsers/html/util/normalizeWhitespace.ts:9-24` | NOT FOUND |
| VS Code structural | single monospace `<div>` with per-line `<div><span>` | Keystatic `clipboard.tsx:77-97` (structural fingerprint) | NOT FOUND |
| Google Sheets | `<google-sheets-html-origin>` wrapper | CKEditor 5 `normalizers/googlesheetsnormalizer.ts` | NOT FOUND |
| Slack message | `c-message_kit__*` class | slackfmt package (Electron-only, unmaintained as unified plugin) | NOT FOUND |
| GitHub rendered comment | `.commit-link` / `[data-hovercard-type]` | `@github/paste-markdown` (different scope — adds to textarea paste, not rehype cleanup) | NOT FOUND |

## Finding D9-2: Adjacent tools exist but don't solve our problem (CONFIRMED)

- **`rehype-sanitize`** (https://github.com/rehypejs/rehype-sanitize, actively maintained, follows GitHub sanitation schema) — general-purpose XSS sanitizer built on `hast-util-sanitize`. Strips disallowed elements/attrs across the board. **Not fit for our use case** because it would strip our legitimate custom-node detection attrs (`data-wiki-link`, `data-jsx-component`, etc.) and the wikiLink anchor class unless we configured a custom schema allowlist — at which point we've essentially written the cleanup logic ourselves.
- **`docsSoap`** — unmaintained; not unified-ecosystem; written before hast existed.
- **`turndown`** — HTML → markdown; not a cleanup plugin. Rejected for the pivot role (Part 2 §D10).

## Finding D9-3: Greenfield decision — ship the full 9-plugin panel day-one (DECISION)

Given:
- All 9 cleanup plugins are DIY regardless of scope narrowing
- Each plugin is small (~30-100 LoC) + small test file + real-sample HTML fixture (captured once, checked in)
- Patterns are well-documented (CKEditor + Milkdown + Keystatic + BlockNote have battle-tested implementations we port)
- **User's stated greenfield posture: no deferred tech debt, ship the architectural scope day-one**
- Cross-view pipeline is identical — both WYSIWYG and Source paste benefit simultaneously from each plugin
- 9 is the full count of vendor fingerprints in research Part 2 §D13's detection heuristics table

Decision: **ship all 9 as part of v1** (expanded from the original 6 after the audit surfaced that 3 fingerprints — GSheets, Slack, GitHub-rendered — from the D13 detection table lacked dedicated plugins). Total new code ~900-1200 LoC including tests + fixtures. The narrow alternative ("ship 2, defer 7 plugins to 'when user pain surfaces'") explicitly contradicts the stated greenfield posture.

**Real-sample fixture capture protocol** (day-one):
1. Copy representative content from each vendor (a paragraph from Google Docs, a message from Slack, etc.)
2. Save raw `text/html` as a fixture file under `packages/core/src/markdown/rehype-plugins/fixtures/<vendor>-sample.html`
3. Write test case: `given(fixture) → pipeline(htmlToMdast) → markdownToString → assertEqual(expected_markdown)`
4. On later vendor HTML drift, tests fail → update fixtures + verify → ship

Package layout: `packages/core/src/markdown/rehype-plugins/` directory with one `.ts` per plugin + colocated `.test.ts` + `fixtures/*.html`.

---

## The 9 plugins (day-one ship list)

1. **`rehypeStripGoogleDocsWrapper`** — unwrap `<b id="docs-internal-guid-…">` outer wrapper; unwrap `<div dir="ltr">` around tables. Based on Milkdown `plugin-clipboard/src/index.ts:45-64` double-regex pattern.
2. **`rehypeStripMsoStyles`** — remove `<!--[if gte mso 9]>` conditional comments; strip `<o:*>/<w:*>/<m:*>` namespaced elements; strip `mso-*` inline styles; strip `MsoNormal`/`MsoListParagraph*` classes; strip `<meta name="Generator" content="Microsoft Word…">`. Based on CKEditor 5 `removemsattributes.ts`. Handles LibreOffice's Office-HTML export as a bonus.
3. **`rehypeStripCocoaMeta`** — strip `<meta name="Generator" content="Cocoa HTML Writer">`; strip `Apple-tab-span`, `Apple-converted-space` classes (keeping their text content). Handles Notes/Mail/TextEdit/Pages uniformly.
4. **`rehypeStripGmailClasses`** — strip `gmail_default`, `gmail_quote`, `gmail_extra`, `gmail_signature`, `gmail_attr` classes (keeping content); unwrap trivial `<div dir="ltr">`.
5. **`rehypeSkipNotionWhitespace`** — detect `<!-- notionvc:` comment via tree walker; mark the tree to SKIP whitespace normalization downstream (Notion uses literal `\n` as hard breaks; normalizing eats them). Based on BlockNote `normalizeWhitespace.ts:9-24`.
6. **`rehypeStripVscodeSpans`** — structural fallback for non-Chromium browsers where `vscode-editor-data` MIME isn't present: detect single monospace `<div>` with per-line `<div><span>` children → convert to `<pre><code>`. Based on Keystatic `clipboard.tsx:77-97`.
7. **`rehypeStripGsheetsWrapper`** — strip `<google-sheets-html-origin>` custom element; preserve `<table data-sheets-*>` inner structure for GFM table conversion; drop inline `<style>` block. Based on CKEditor 5 `googlesheetsnormalizer.ts`.
8. **`rehypeStripSlackClasses`** — strip `c-message_kit__*` and `c-message__*` Slack compose/message CSS classes (keeping text content); drop timestamp spans.
9. **`rehypeStripGithubHovercard`** — strip `.commit-link` class, `data-hovercard-*` attrs on anchors (keeping `href` + text content).

---

## Sources

- https://github.com/rehypejs/rehype-sanitize (general-purpose XSS sanitizer; adjacent not fit)
- https://laptrinhx.com/library-to-clean-up-the-clipboard-contents-generated-by-google-docs-1508496779/ (docsSoap; not adoptable)
- https://discuss.prosemirror.net/t/library-to-cleanup-microsoft-word-html/3161 (Word cleanup discussion)
- https://gist.github.com/ronanguilloux/2915995 (2 JS solutions for MS Word HTML cleanup)
- https://demos.telerik.com/aspnet-ajax/editor/examples/cleaningwordformatting/defaultcs.aspx (Telerik in-house)
- https://www.tiny.cloud/docs/tinymce/5/paste-from-word/ (TinyMCE in-house)
- Research report Part 2 §D13 (CKEditor normalizer registry reference)
- Milkdown `packages/plugins/plugin-clipboard/src/index.ts` (Google Docs regex unwrap reference)
- Keystatic `packages/keystatic/src/form/fields/markdoc/editor/markdoc/clipboard.tsx` (VS Code structural detect reference)
- BlockNote `packages/core/src/api/parsers/html/util/normalizeWhitespace.ts` (Notion comment detection reference)
- CKEditor 5 `packages/ckeditor5-paste-from-office/src/normalizers/*.ts` (all vendor normalizers — reference for porting)
- @github/paste-markdown (different scope but confirms GitHub hovercard attr pattern)
