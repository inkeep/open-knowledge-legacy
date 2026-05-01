# Worldmodel snapshot — cross-app clipboard icon rendering

**Date:** 2026-05-01
**Depth:** Light (sufficient for this scope)

## Topic

How do major paste destinations (Gmail, Notion, Slack, Outlook, Google Docs) handle inline `<svg>` and other icon-delivery shapes in pasted HTML? Which delivery shape is most portable across the matrix?

## Entities & Terminology

- **Destination sanitizer / allowlist**: HTML filter applied to pasted content (e.g., DOMPurify, sanitize-html, custom regex pipelines, server-side bleach).
- **Inline SVG**: `<svg>` element with child `<path>`/`<rect>`/etc., often with `stroke="currentColor"` to inherit text color.
- **Lucide icons**: open-source icon library used by OK. Icon set as inline SVGs with `lucide-<name>` class.
- **`currentColor`**: CSS keyword that resolves to the inherited `color` property.
- **GFM alerts**: GitHub Flavored Markdown's `[!NOTE]`/`[!WARNING]`/etc. blockquote syntax, rendered with built-in icons.
- **Data URI**: `data:image/<mime>;base64,<payload>` inline image embedding.
- **Email-client HTML**: stripped-down subset preserved across MUAs (mailto User Agents) — see Caniemail.com.

## Surfaces

- **Outbound walker** (OK): emits text/html with React-rendered DOM cloned + computed styles inlined.
- **Destination paste handler**: receives `text/html` MIME, applies its own sanitizer, renders.
- **Render layers** (in destinations): inline SVG → DOM rendering, `<img src="data:...">` → decoded as image, Unicode glyph → font rendering.

## Patterns observed

**From the existing report (`tiptap-clipboard-round-trip-markdown/`)**:
- Gmail uses `gmail_*` classes + per-paragraph inline styles. Confirmed it preserves bold/italic/underline, links, images. Does not say what it does with SVG specifically.
- Email clients strip `<style>` blocks and reject CSS variables (per "react-email needs this complexity" finding).
- Notion has no reliable HTML fingerprint; prefers text/plain over text/html on paste.

## Prior research

- `reports/tiptap-clipboard-round-trip-markdown/` — covers cross-app HTML emission strategy + source detection. Has Gmail/Slack/Notion fingerprint notes but does not directly answer "do they sanitize inline SVG?"
- `reports/markdown-editor-paste-and-html-survey/` — historical paste survey (likely 2026-04-ish).
- `reports/markdown-roundtrip-fidelity-tiptap/` — markdown roundtrip fidelity (orthogonal).

## 3P Landscape (OSS sources to consult)

- **Caniemail.com** — definitive support matrix for HTML/CSS features in email clients (Gmail, Outlook, Apple Mail, Yahoo, etc.). Cite for D1 (Gmail) + D4 (Outlook).
- **DOMPurify** — most-used HTML sanitizer. SVG profile + `FORBID_TAGS` defaults relevant for D2/D3.
- **sanitize-html** (npm) — Slack-class default config.
- **GitHub markdown rendering** — `[!NOTE]` alerts, public CSS. Cite for D8.
- **Notion engineering blog / community forum** — paste behavior.
- **Slack paste behavior** — Slack engineering blog (rich-text-input).
- **Google Workspace docs** — paste behavior in Gmail/Docs (limited; Google rarely documents internals).

## Connections & Dependencies

The walker emits → destination receives → destination sanitizer runs → final DOM rendered. Failure modes:
1. Sanitizer drops `<svg>` entirely → 0×0 element, invisible.
2. Sanitizer keeps `<svg>` but drops `stroke`/`fill` attrs → black/no-color icon.
3. Sanitizer keeps SVG but child `<path>` is dropped → empty box.
4. `stroke="currentColor"` resolves to default text color (may be black, may be invisible if parent forces white).
5. Width/height attrs stripped → element collapses.

Each destination's failure mode is independent — the recommended icon shape may differ per destination.

## Unresolved at survey depth

- Exact 2026-current Gmail sanitizer ruleset (Google doesn't publish; we'll rely on Caniemail + recent SO/blog).
- Outlook web vs desktop divergence — likely significant; need to disambiguate.
- Slack's ProseMirror schema — open-source? — does it have SVG nodes?
- Whether destinations apply the sanitizer on paste-in OR on subsequent render (matters for "the SVG is in the DOM but not rendered" case).
