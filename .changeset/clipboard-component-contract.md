---
"@inkeep/open-knowledge-core": minor
"@inkeep/open-knowledge-app": minor
---

feat(clipboard): component contract + byte preservation across the paste matrix

Restores byte-preservation across the OK→OK / OK→external / external→OK / cross-machine clipboard paste matrix. Three independent additive layers on the existing pipeline:

1. **FR-13-first dispatcher reorder + heuristic extension.** The markdown-first ambiguity tiebreak now runs ahead of the `data-pm-slice` Branch C in both WYSIWYG and Source dispatchers — OK-canonical bytes route through `mdManager.parse` before PM-native parseFromClipboard can fight TipTap parseDOM rules. The `is-markdown.ts` heuristic gains six new signals (blockquote, inline code, paired emphasis, capitalized JSX, lowercase JSX-with-attr, raw-HTML-inline) so cross-machine markdown-text transport (raw `<Callout>` from email/Slack/file) recovers descriptor identity. The previous dispatcher order silently flipped `<img/>` JSX to `![alt](src)` (PR #310's lowercase pivot regression) and converted capitalized `<Callout>` to a `<pre class="mdx-component">` codeblock.

2. **Live-DOM walker as default outbound text/html mechanism.** `clipboardSerializer.serializeFragment` walks the live editor DOM via `view.nodeDOM(pos)`, clones each top-level slice node, and inlines allowlisted computed styles via `getComputedStyle`. The React render IS the cross-app HTML shape — `<aside class="callout">` for Callout, native `<img>` / `<video>` / `<audio>` for media, real `<details><summary>` for Accordion. Per-descriptor `JsxComponentMetaBase.toClipboardHast` is an OPTIONAL override for descriptors with hidden state (Tabs with conditionally-rendered children, Canvas with bitmap state); the v1 5-pack uses zero overrides. Activity-hidden subtrees (`view.nodeDOM(pos) === null`) fall through to a per-descriptor static palette so the case isn't silently empty.

3. **FR-20 escape contract at the walker boundary + build hygiene + chevron-as-real-DOM refactor.** The walker enforces four filter classes during the pairwise walk: computed-style allowlist, class blocklist, attribute blocklist, and URL-scheme allowlist via `isSafeWalkerUrl` for href/src/srcset/poster/formaction/xlink:href + `sanitizeEmbeddedUrlValue` for aria-label/aria-description/title + `sanitizeStyleAttrValue` for `style` payloads + `isDangerousEventHandlerAttr` for `on*`. Allowlist posture (not denylist) closes leading-whitespace bypass, srcset multi-URL bypass, novel-scheme fail-open, and `data:image/svg+xml` SVG-XSS host. `Callout.tsx` collapsible + `Accordion.tsx` chevron refactored from `::before` pseudo-element to real `<ChevronRight>` lucide icon (pseudo-elements don't survive `cloneNode`). `--conditions=development` dropped from per-package test scripts in `app`/`core`/`server`/`cli` so tests resolve to the same `dist/` artifact production consumers use.

New public exports from `@inkeep/open-knowledge-core`:

- `SAFE_URL_SCHEMES` — canonical scheme array (`['https', 'http', 'mailto', 'tel', 'ftp', 'sms']`); single source of truth for the URL allowlist used by the markdown pipeline (`isSafeUrl`), the clipboard walker (`isSafeWalkerUrl`), and the JSX-prop sanitizer (`URL_SCHEME_ALLOWLIST`).
- `SAFE_URL_SCHEME_RE` — regex form derived from `SAFE_URL_SCHEMES`, with relative-URL path-prefix alternates (`/`, `#`, `?`, `./`, `../`).
- `isSafeUrl(url)` — boolean classifier; trims leading whitespace before testing; treats empty strings as benign.
- `ClipboardHastContext` — type for the optional `descriptor.toClipboardHast` override signature.

Internal: `JsxComponentMetaBase` gains an OPTIONAL `toClipboardHast?` method. The clipboard module gains `clipboard-walker-fallback-fired`, `clipboard-walker-url-blocked`, and `clipboard-hast-override-invoked` (reserved) telemetry events. `RawMdxFallback.parseHTML` widens (additive per precedent #9) to accept both `div[data-raw-mdx-fallback]` (in-app NodeView) and `pre[data-raw-mdx-fallback]` (outbound walker shape) so OK→OK Branch C round-trip can reconstruct the rawMdxFallback node.

No breaking changes — every change is additive or behavior-preserving. Pre-existing `paste-fidelity.e2e.ts` wiki-link assertions updated to match the new walker chip shape (`data-wiki-link` parseDOM marker is preserved; cross-app destinations strip class/data attrs and surface the alias text consistent with NG-S6 destination-stripping).

**Cross-app render fidelity follow-up (post-Pass-5):**

- **`oklch()` / `oklab()` / `lab()` / `lch()` → `rgb()` conversion at copy time.** Modern Chrome's `getComputedStyle()` returns CSS Color 4 function literals; destination HTML renderers (Gmail, Notion, Slack-class) cannot parse these and fall back to default colors — invisible chevrons, missing accent borders. The walker's `buildInlineStyleFrom` now passes every value through `convertCssColors` (new export from `@inkeep/open-knowledge-core` clipboard-sanitize leaf) before emitting. Pure regex + math implementation; no dep added.
- **`OPT_OUT_ATTR` (`data-clipboard-omit`) promoted to public export.** First consumers wired: `JsxComponentView`'s chrome bar, stuck-state row, and add-child pill mark themselves so the walker drops the entire chrome subtree. `drag-handle.ts` opts out defensively. Editor toolbar SVGs (`lucide-trash2`, `lucide-settings2`, `lucide-arrow-up/down`) no longer leak into cross-app paste.
- **Inline lucide SVG → Unicode glyph at walker emit.** No major paste destination preserves inline `<svg>` (Gmail's image proxy refuses, Outlook retired SVG support in Sept 2025, Notion / Slack / Google Docs strip on paste). The walker now substitutes a `<span aria-hidden="true">{glyph}</span>` for each mapped `lucide-*` SVG via `replaceLucideIconsWithGlyphs` (new export). Color survives via the parent's already-inlined `style="color: rgb(...)"`. Six icons mapped (chevron-right, info, lightbulb, message-square-warning, alert-triangle, alert-octagon) covering the v1 5-pack. Unmapped lucide-* classes surface a once-per-process `clipboard-walker-unmapped-lucide-icon` telemetry event so future descriptors don't silently regress. In-app render is unchanged — walker-localized.
