# Evidence: D7 / D8 — Prior art + GitHub alert behavior

**Date:** 2026-05-01

## D7 — Lucide / heroicon-in-clipboard prior art

### Sources
- [Tiptap UI — Copy to Clipboard Button](https://tiptap.dev/docs/ui-components/components/copy-to-clipboard-button)
- [Quill 2.0 — Upgrading to 2.0](https://quilljs.com/docs/upgrading-to-2-0)
- [tldraw — Custom paste behavior](https://tldraw.dev/examples/custom-paste)
- [Excalidraw — Support copying SVG to clipboard #860](https://github.com/excalidraw/excalidraw/issues/860)
- [Slack canvas docs](https://slack.com/help/articles/203950418-Use-a-canvas-in-Slack)

### Findings

**D7-1 (CONFIRMED):** No mainstream prosemirror/slate/codemirror editor surveyed has a per-icon-class clipboard rewrite. Editors that ship icon-rich content fall into three patterns:

1. **Default-walker pattern (the current OK approach):** copy whatever DOM React rendered. Inline SVGs go out as-is. Destinations that strip them lose the icon. Examples: Notion (canonical), Linear, most Tiptap-based editors.

2. **Custom-paste pattern (no custom-copy):** override clipboard-paste handlers but emit default DOM on copy. Examples: Outline, BlockNote, Milkdown — all override `transformPastedHTML` for inbound but use default `clipboardSerializer` for outbound. Same icon failure mode as OK.

3. **Vector-export pattern:** dedicated copy-as-image path. Examples: tldraw + Excalidraw — they have explicit "Copy as PNG" and "Copy as SVG" actions for diagram export, but this is a different API than rich-text clipboard. Excalidraw's #860 issue covers adding "copy SVG to clipboard" as a feature for diagram export, not for inline icons in rich text.

**D7-2 (INFERRED):** The clipboard-icon-survival problem is not unique to OK and has not been solved by any major editor. The pattern of "lose the icon at destination" is universal. Most editors accept the loss because their primary use case isn't cross-app paste — Notion users paste between Notion docs, Slack users paste between Slack messages, etc. OK's spec G2 ("OK→external paste renders semantically in cross-app destinations") is more demanding than the typical editor's clipboard contract.

**D7-3 (CONFIRMED):** The closest prior art is **react-email** ([resend/react-email](https://github.com/resend/react-email)) — an outbound-email-rendering library that converts React components + Tailwind classes to inline-styled HTML that survives Gmail/Outlook/Apple Mail. React-email runs at *server-side render time*, not at clipboard-copy time, so it ships a Tailwind compiler in Node. The same philosophy could in principle drive a clipboard walker, but the runtime constraint differs (browser vs. Node).

### Implications

- OK's walker is one of the more advanced clipboard pipelines surveyed; the icon-delivery problem is genuinely a frontier issue, not a solved one.
- Solutions must be self-built; there's no off-the-shelf icon-survival library.
- The simplest viable approach is the same one react-email implies: convert SVG icons to a destination-portable form *at emission time*. For react-email it's inline-styled `<img>` from SSR; for OK it'd be `<span>{unicode-glyph}</span>` or `<img src=hosted-png>` from the clipboard walker.

---

## D8 — GitHub `[!NOTE]` alert behavior in cross-app paste

### Sources
- [Markdown for info panel/warning box · GitHub gist](https://gist.github.com/cseeman/8f3bfaec084c5c4259626ddd9e516c61)
- [Experimenting with GitHub's "alert" markdown syntax — Jake Lee](https://blog.jakelee.co.uk/github-alert-experiments/)
- [GitHub Markdown syntax for alerts considered harmful — Mehdi's Notes](https://blog.mehdi.cc/articles/github-alerts-markdown-syntax)
- [github/markup#887 — notifications in markup](https://github.com/github/markup/issues/887)
- [markdown-it-github-alerts — antfu](https://github.com/antfu/markdown-it-github-alerts)

### Findings

**D8-1 (CONFIRMED):** GitHub renders `[!NOTE]` / `[!WARNING]` / `[!IMPORTANT]` / `[!TIP]` / `[!CAUTION]` blockquotes via a CSS class scheme:
- Outer: `<div class="markdown-alert markdown-alert-note">` (or `-warning`, etc.)
- Heading: `<p class="markdown-alert-title">` with an inline `<svg class="octicon">` icon followed by text label.
- Body: standard blockquote contents.

The icons are inline `<svg>` elements (Octicon, GitHub's icon library — analogous to lucide).

**D8-2 (INFERRED):** When you copy text from a rendered GitHub alert and paste into Gmail, the icon `<svg>` is stripped (per D1). The result in Gmail is:
- The class names survive (or don't, depending on Gmail's class-rewrite). The visible structure is the alert text without the icon.
- Color: the GitHub alert's CSS uses class-based colors, which Gmail strips. The result is a default-styled blockquote.
- Net: the alert is identifiable as a quoted text block but the icon AND the type-color visual cue both vanish.

This matches OK's empirical observation: colors fixed via inline-style `convertCssColors` (better than GitHub's class-based approach), but icons still vanish (same fate as GitHub's Octicon SVGs).

**D8-3 (CONFIRMED):** Multiple community threads (Mehdi's "considered harmful" post; antfu's markdown-it-github-alerts) note that GitHub's alert syntax has poor portability outside of GitHub's own renderer. Consumers (other markdown renderers, paste destinations) lose the icon and often the styling.

### Implications

- GitHub-style alerts confirm the broader pattern: inline SVG icons don't survive cross-app paste, regardless of who emits them.
- OK is at parity with GitHub on this front (icons lost in Gmail-class destinations) but ahead on color (because OK's walker inlines `rgb()` values; GitHub relies on class-based CSS that Gmail strips).
- **Switching OK's walker to Unicode glyphs would put OK ahead of GitHub** for cross-app fidelity — color survives AND icons survive.

---

## Cross-cutting summary

The picture: **inline SVG never survives cross-app paste in any major destination.** This is a universal problem across the editor and renderer ecosystem, not a bug specific to OK. The two practical solutions are:
1. **Unicode glyph replacement** — works everywhere, color via parent inline-style.
2. **Hosted PNG replacement** — works everywhere, requires CDN hosting infrastructure.

Both can be implemented at walker emit time without changing the in-app rendering. The walker maps lucide class → portable form on serialize.
