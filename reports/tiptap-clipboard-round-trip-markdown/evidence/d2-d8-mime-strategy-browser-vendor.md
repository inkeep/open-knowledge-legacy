# Evidence: D2 + D8 — MIME Strategy, Browser Compat, Vendor Behavior

**Dimensions:** D2 (MIME type strategy), D8 (browser compat + mobile)
**Date:** 2026-04-15
**Sources:** W3C Clipboard API spec, MDN, WebKit blog, Chrome blog, Bugzilla, vendor help pages, technical deep-dives.

---

## Executive summary of findings

**The web clipboard is effectively a two-MIME-type world** (`text/plain` + `text/html`) for anything destination apps will actually read. `text/markdown` is a dead letter — no browser specially recognizes it, no major destination reads it, Safari's WebKit allowlist rejects it outright from `ClipboardItem.write()`. Chrome's `web ` prefix (pickling) opens an escape hatch for lossless same-app round-trips in Chromium 104+, but **not** in Safari, **not** in Firefox's async API.

Dominant pattern in the ecosystem: **write both `text/plain` (as markdown source) and `text/html` (rendered HTML)**, plus optionally a custom format via sync clipboard events for lossless self-paste. Notion, Slack, Google Docs, Gmail, Apple Notes, GitHub, Outline, Linear, Obsidian all converge on this.

---

## D2: MIME types — what each does + who reads it

### `text/plain` (CONFIRMED — universal)

- One of three mandatory MIME types per W3C Clipboard API spec (`text/plain`, `text/html`, `image/png`). `ClipboardItem.supports('text/plain')` always returns `true`.
- Every OS pasteboard has a UTF-8 text slot; every destination has a fallback reader.
- Writing markdown source to `text/plain` **renders literally** in rich-text destinations that prefer the `text/plain` slot when `text/html` is absent. Example: Google Docs shows `## Project Status` as literal chars.
- In markdown-aware destinations (Obsidian, Discord, GitHub textareas, VS Code `.md` files), markdown in `text/plain` round-trips perfectly.
- **INFERRED:** right content from a markdown-canonical editor is the markdown source — that's what GitHub/Obsidian/VS Code/Discord expect, and a readable fallback elsewhere.

### `text/html` (CONFIRMED — universal with sanitization)

- One of three mandatory MIME types. Writable across Chrome, Firefox, Safari async.
- **All browsers sanitize `text/html` by default before putting it on the OS pasteboard** (strip script tags, resolve remote URLs). Chrome allows opt-out via `unsanitized: ['text/html']` on `read()`; not symmetrically on `write()` in stable API. Source: [WebKit Async Clipboard API](https://webkit.org/blog/10855/async-clipboard-api/), [Chrome pickling explainer](https://github.com/w3c/editing/blob/gh-pages/docs/clipboard-pickling/explainer.md), [W3C PR #175](https://github.com/w3c/clipboard-apis/pull/175).
- **Rich-text destinations prefer `text/html` when present** (CONFIRMED for Google Docs, Gmail, Notion, Slack, Apple Notes, TextEdit rich mode, Outlook). [alexharri.com/blog/clipboard](https://alexharri.com/blog/clipboard), [Notion help](https://www.notion.com/help/writing-and-editing-basics), [Markdown Guide Slack](https://www.markdownguide.org/tools/slack/).
- **Slack's compose is Quill** — prefers `text/html` + a Slack-custom Chromium web-custom-data entry. Markdown via `text/plain` alone does NOT auto-render. Source: [jvt.me Mac/Slack](https://www.jvt.me/posts/2026/01/13/mac-slack-external-markdown/).
- **Google Docs' "Paste from Markdown"** is an explicit right-click menu — opt-in only; default Cmd+V reads `text/html`. [Google support](https://support.google.com/docs/answer/12014036).
- **UNCERTAIN:** how much TipTap HTML fidelity survives vendor sanitizers — every rich-text destination re-normalizes pasted HTML. The HTML we write is a lowest-common-denominator "formatted text" signal, not a structural carrier.

### `text/markdown` (CONFIRMED — dead on arrival)

- NOT in W3C mandatory MIME list (only `text/plain`, `text/html`, `image/png`).
- NOT on WebKit's async-clipboard allowlist (Safari allows `text/plain`, `text/html`, `text/uri-list`, `image/png`). Passing `text/markdown` to `ClipboardItem` in Safari throws / writes nothing.
- Chromium non-allowlisted MIME types without `web ` prefix cause `NotAllowedError`. Chromium allowlist: `text/plain`, `text/html`, `image/png`, `image/svg+xml` (limited), plus `web `-prefixed custom.
- **No major destination app reads `text/markdown`** as of 2026-04. Zero documented consumers. Obsidian, Discord, GitHub, Linear, Notion, Slack, Apple Notes, Gmail, Google Docs, VS Code — all read `text/plain` and/or `text/html`. GitHub historically used `text/x-gfm`, not `text/markdown`.
- **NOT FOUND:** any public Chromium or WebKit roadmap to add `text/markdown` to the allowlist.
- **Bottom line:** writing `text/markdown` errors in Safari, has no consumer in Chrome. Zero vendor value.

### Custom `web …` types — Chromium pickling (CONFIRMED partial)

- **Chrome 104+ (Aug 2022):** any MIME prefixed with literal `"web "` (trailing space required) is written unsanitized to the OS pasteboard. Applies desktop + mobile Chromium. Source: [Chrome blog](https://developer.chrome.com/blog/web-custom-formats-for-the-async-clipboard-api), [chromestatus](https://chromestatus.com/feature/5649558757441536).
- **Platform transformation:** macOS `custom/format` → `com.web.custom.format`; Windows → `Web Custom Format`; Linux/ChromeOS/Android → `application/web;type="custom/format"`.
- **Safari/WebKit:** does NOT implement as of 2026-04. `ClipboardItem.supports('web text/markdown')` returns `false`.
- **Firefox async:** does NOT implement. `ClipboardItem` is behind pref `dom.events.asyncClipboard.clipboardItem`.
- **Sync clipboard events path is different:** `ClipboardEvent.clipboardData.setData('text/x-anything', ...)` supports arbitrary MIME types in Firefox (since v48, 2016), Safari, and Chromium. This is the path GitHub uses for `text/x-gfm`. Firefox stores custom-MIME data in an internal "special format" that may not survive cross-browser paste. [Bugzilla 860857](https://bugzilla.mozilla.org/show_bug.cgi?id=860857).
- **Two APIs, different allowlists:**
  - Sync `copy` event + `clipboardData.setData` — Firefox 48+, Chromium, Safari accept arbitrary MIME strings.
  - Async `navigator.clipboard.write` + `ClipboardItem` — Chromium requires `web ` prefix; Safari rejects unknown; Firefox flagged-off.

---

## D2: Vendor receive-side behavior

Legend: "Reads markdown from `text/plain`?" = will the app interpret raw markdown chars as formatting on paste?

| App | Prefers | MD from text/plain? | MD from text/html? | Notes |
|-----|---------|---------------------|--------------------|-------|
| **Google Docs** | text/html | No — renders literally | Yes | CONFIRMED: `## H` → literal `## H`. Opt-in "Paste from Markdown" menu. [support](https://support.google.com/docs/answer/12014036) |
| **Gmail** | text/html | No | Yes | INFERRED — same Workspace pipeline as Docs |
| **Notion** | text/html / own MD parser | **Yes — aggressively** | Yes | CONFIRMED: parses `#`, `**`, `-`, links, tables. Complex (footnotes, nested tables, LaTeX) flattens. [help](https://www.notion.com/help/writing-and-editing-basics), [Markdown Guide Notion](https://www.markdownguide.org/tools/notion/) |
| **Slack** | text/html (Quill) + own custom MIME | **No** by default | Yes | CONFIRMED: compose is Quill; does not parse raw MD on paste. Users type Slack micro-markdown at type-time. Cmd+Shift+V forces plain. [jvt.me](https://www.jvt.me/posts/2026/01/13/mac-slack-external-markdown/) |
| **Linear** | text/html (TipTap) + MD parser on text/plain | Yes — tiptap-markdown style | Yes | INFERRED from TipTap base + common pattern. UNCERTAIN exact impl |
| **GitHub** (textarea) | `text/x-gfm` → text/plain | Yes — text/plain is already markdown | No — textarea ignores text/html by default (`@github/paste-markdown` converts HTML→GFM) | CONFIRMED [paste-markdown](https://github.com/github/paste-markdown) + [changelog 2022-05-19](https://github.blog/changelog/2022-05-19-updates-to-markdown-pasting-on-github/). Bug: triple-MIME can double-paste [discussion 65235](https://github.com/orgs/community/discussions/65235) |
| **VS Code** | text/plain | In `.md` file: markdown source renders natively; `.txt`: literal | Ignored | CONFIRMED [docs](https://code.visualstudio.com/docs/languages/markdown), [issue 57577](https://github.com/microsoft/vscode/issues/57577) |
| **Obsidian** | text/html → MD / text/plain as MD | Yes (native) | Yes (HTML→MD converter since v0.10.1) | CONFIRMED [forum](https://forum.obsidian.md/t/convert-copy-and-pasted-rich-text-italic-bold-etc-to-markdown-instead-of-or-in-addition-to-html/2069) |
| **Discord** | text/plain | Yes (subset CommonMark: inline *italic*/**bold**/code/blockquote) | Ignored | CONFIRMED [support](https://support.discord.com/hc/en-us/articles/210298617). Block elements (headings, tables) don't render |
| **Apple Notes** | text/html / RTF | No (default) | Yes — HTML/RTF → Notes HTML | CONFIRMED [macrumors](https://www.macrumors.com/how-to/ios-import-export-markdown-apple-notes/). iOS 26 adds MD file I/O, not clipboard |
| **macOS TextEdit** (rich) | text/html / RTF | No | Yes | CONFIRMED [user guide](https://support.apple.com/guide/textedit/welcome/mac). Plain mode strips to text/plain |
| **Outline** (wiki) | text/html | Some MD detection on paste | Yes | INFERRED TipTap base. UNCERTAIN exact impl |

### Cross-vendor generalizations (CONFIRMED)

1. Every rich-text WYSIWYG destination prefers `text/html` when present.
2. Every markdown-canonical destination (Obsidian, Discord, GitHub, VS Code `.md`) reads `text/plain` as markdown source.
3. **Notion is the only major destination that aggressively parses markdown from `text/plain`** even when `text/html` is also present. Slack, Google Docs, Gmail, Apple Notes do NOT.
4. **Writing `text/plain` (markdown) + `text/html` (rendered) satisfies all 11 destinations above.** Rich destinations use the HTML; markdown-canonical destinations use the text.

---

## D8: Browser compat matrix

### Async Clipboard API (`navigator.clipboard.write` + `ClipboardItem`)

| Browser | text/plain | text/html | text/markdown | `web …` custom | `supports()` | Notes |
|---------|------------|-----------|---------------|----------------|--------------|-------|
| **Chrome/Edge (Chromium 104+)** | ✓ | ✓ (sanitized) | **NotAllowedError on write** | ✓ | Baseline 2025 | `image/png`, `image/svg+xml` (partial). User activation required. |
| **Safari (WebKit)** | ✓ | ✓ (sanitized strict) | **Rejected from allowlist** | **Not supported** | Shipped | Allowlist: text/plain, text/html, text/uri-list, image/png. User activation stricter — any `await` between user gesture and write invalidates gesture. [WebKit](https://webkit.org/blog/10855/async-clipboard-api/), [kian.org.uk](https://kian.org.uk/writing-to-clipboard-in-safari-transient-activation/) |
| **Firefox** | ✓ (`writeText`/`readText`) | `ClipboardItem` flagged pre-126; enabled 127+ | **Not supported** | **Not supported** | Partial | [MDN](https://developer.mozilla.org/en-US/docs/Web/API/ClipboardItem) |

### Sync clipboard events (`oncopy` + `clipboardData.setData`/`getData`)

| Browser | text/plain | text/html | Custom MIME (text/x-gfm, etc.) |
|---------|------------|-----------|--------------------------------|
| **Chrome/Edge** | ✓ | ✓ | ✓ — stored in Chromium's `org.chromium.web-custom-data` on macOS [alexharri](https://alexharri.com/blog/clipboard) |
| **Safari** | ✓ | ✓ | ✓ within-Safari — `com.apple.WebKit.custom-pasteboard-data`. Cross-origin restricted |
| **Firefox** | ✓ | ✓ | ✓ since Firefox 48 (2016) — `org.mozilla.custom-clipdata` on macOS. No feature detection. [Bugzilla 860857](https://bugzilla.mozilla.org/show_bug.cgi?id=860857) |

**Critical:** `ClipboardEvent.clipboardData.setData()` is the most permissive path for custom MIME types cross-browser. This is the API GitHub uses (`@github/paste-markdown`) for `text/x-gfm`.

### Size caps

- No W3C spec cap. Chromium: no hard cap (platform limits apply). Safari: historical practical limits ~few MB for HTML (UNCERTAIN — empirical Stack Overflow only). Firefox: no documented cap.

### Permissions API

- `navigator.clipboard.write` requires transient user activation + secure context (HTTPS or localhost). [MDN](https://developer.mozilla.org/en-US/docs/Web/API/Clipboard/write).
- Chromium: additional `clipboard-write` permission descriptor (auto-granted during user gesture).
- Safari: no clipboard permissions API; user-gesture-only.
- Firefox: async `ClipboardItem.write` requires pref flip or sync-event path.

---

## D8: Mobile + edge cases

- **iOS Safari:** same allowlist as desktop Safari. User-gesture rules even stricter — any `await` in the chain between `click`/`touchend` and `clipboard.write` invalidates the gesture. Workaround: construct `ClipboardItem` with `Promise<Blob>` payloads rather than awaiting before write. [kian.org.uk](https://kian.org.uk/writing-to-clipboard-in-safari-transient-activation/), [wolfgangrittner.dev](https://wolfgangrittner.dev/how-to-use-clipboard-api-in-safari/).
- **Chrome Android:** supports web custom formats same as desktop Chromium 104+.
- **Firefox Android:** INFERRED same feature set as desktop Firefox with pref gate.
- **Safari iPad multitasking:** UNCERTAIN — cross-app clipboard uses iOS universal pasteboard with same allowlist.
- **Cross-device Universal Clipboard (macOS ↔ iOS):** only syncs standard UTI types (`public.plain-text`, `public.html`, `public.utf8-plain-text`, `public.image`, `public.url`). Chromium `web `-prefixed custom formats on macOS become `com.web.*` UTIs which do NOT sync via Universal Clipboard. [alexharri.com/blog/clipboard](https://alexharri.com/blog/clipboard) — INFERRED for custom-format behavior.
- **Linux Chromium X11 PRIMARY vs CLIPBOARD:** Async Clipboard API does NOT write to PRIMARY (middle-click paste). INFERRED minor impact.
- **Feature detection gap:** sync-event custom MIME has no JS-visible detect. Pattern: write it, don't assert, fall back at read-time to `text/plain`.

---

## Practical takeaways

1. **Two-format default (`text/plain` markdown + `text/html` rendered) covers all 11 audited destinations.** Adding `text/markdown` is harmless but unclaimed.
2. **`web application/x-open-knowledge-md` via Chromium pickling is a Chromium-only progressive enhancement** for lossless self-paste. Not portable to Safari/Firefox async.
3. **GitHub's `text/x-gfm` via sync-event path sets a precedent** for cross-browser custom MIME (Firefox 48+, Safari, Chromium). Ride a user-triggered `copy` event via `transformCopied` or `handleDOMEvents.copy`.
4. **Triple-MIME interop hazard (GitHub community #65235):** shipping text/plain + text/html + custom can cause double-paste bugs in sibling apps. Mitigation: don't ship custom MIME if the sibling-paste path can't authoritatively prefer it. Our clipboardTextParser is markdown-canonical, so text/plain as markdown is self-consistent.
5. **Safari is the binding constraint on async-path MIME choice.** Design to the WebKit allowlist; Chromium pickling is progressive.
6. **User-activation rules differ:** any async work must be wrapped in `new ClipboardItem({ 'text/plain': Promise<Blob> })` form (not `await`-then-`write`) for iOS/macOS Safari.

---

## Sources

All accessed 2026-04-15.

Primary specs + vendor docs:
- https://www.w3.org/TR/clipboard-apis/ — W3C spec, mandatory MIME, sanitization rules
- https://developer.mozilla.org/en-US/docs/Web/API/ClipboardItem
- https://developer.mozilla.org/en-US/docs/Web/API/ClipboardItem/supports_static — Baseline 2025
- https://developer.mozilla.org/en-US/docs/Web/API/Clipboard/write
- https://developer.mozilla.org/en-US/docs/Web/API/ClipboardItem/ClipboardItem

Browser-specific:
- https://developer.chrome.com/blog/web-custom-formats-for-the-async-clipboard-api — `web ` prefix, Chromium 104
- https://chromestatus.com/feature/5649558757441536
- https://github.com/w3c/editing/blob/gh-pages/docs/clipboard-pickling/explainer.md — platform MIME transformation
- https://webkit.org/blog/10855/async-clipboard-api/ — Safari allowlist
- https://webkit.org/blog/8170/clipboard-api-improvements/
- https://bugzilla.mozilla.org/show_bug.cgi?id=860857 — Firefox custom MIME for sync events (resolved 2016)
- https://web.dev/articles/async-clipboard
- https://web.dev/blog/baseline-clipboard-item-supports
- https://groups.google.com/a/chromium.org/g/blink-dev/c/k2rgX-4Cigc — Intent to Ship: Pickling

Technical deep-dives:
- https://alexharri.com/blog/clipboard — pasteboard UTI analysis across Chromium/Firefox/Safari on macOS
- https://www.stefanjudis.com/notes/a-clipboard-magic-trick-how-to-use-different-mime-types-with-the-clipboard/
- https://kian.org.uk/writing-to-clipboard-in-safari-transient-activation/
- https://wolfgangrittner.dev/how-to-use-clipboard-api-in-safari/
- https://developer.apple.com/forums/thread/691873
- https://www.purplesquirrels.com.au/2025/07/custom-clipboard-data-formats/

Vendor references:
- https://github.com/github/paste-markdown — `text/x-gfm` MIME
- https://github.blog/changelog/2022-05-19-updates-to-markdown-pasting-on-github/
- https://github.com/orgs/community/discussions/65235 — triple-MIME duplication bug
- https://support.google.com/docs/answer/12014036
- https://support.google.com/docs/thread/229827866/pasted-markdown-not-working
- https://www.reproof.app/blog/google-docs-markdown
- https://unmarkdown.com/blog/how-to-copy-from-claude-without-losing-formatting
- https://www.showmemymd.com/blog/paste-markdown-into-google-docs
- https://www.notion.com/help/writing-and-editing-basics
- https://www.markdownguide.org/tools/notion/
- https://slack.com/help/articles/360039953113-Format-your-messages-in-Slack-with-markup
- https://www.markdownguide.org/tools/slack/
- https://www.jvt.me/posts/2026/01/13/mac-slack-external-markdown/
- https://github.com/cauethenorio/slackfmt
- https://forum.obsidian.md/t/convert-copy-and-pasted-rich-text-italic-bold-etc-to-markdown-instead-of-or-in-addition-to-html/2069
- https://code.visualstudio.com/docs/languages/markdown
- https://github.com/microsoft/vscode/issues/57577
- https://support.discord.com/hc/en-us/articles/210298617-Markdown-Text-101-Chat-Formatting-Bold-Italic-Underline
- https://www.macrumors.com/how-to/ios-import-export-markdown-apple-notes/
- https://support.apple.com/guide/textedit/welcome/mac

ProseMirror / TipTap community:
- https://discuss.prosemirror.net/t/clipboard-with-custom-mime/8542
- https://discuss.prosemirror.net/t/how-to-copy-text-in-markdown-format-from-marks/4054
- https://discuss.prosemirror.net/t/customize-how-content-is-copied-text-html-text-plain/407
- https://tiptap.dev/docs/editor/markdown/examples
- https://tiptap.dev/docs/guides/faq
