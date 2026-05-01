# Evidence: D6 / D9 — Icon-delivery alternatives + walker mapping cost

**Date:** 2026-05-01
**Sources:** Caniemail.com, simpletoolshub.com (safe-emoji-for-email), Litmus, formbricks GH issue, multiple Stack Overflow / Medium posts cited inline.

## The 8 candidates evaluated

For each candidate, evaluate: (a) cross-destination support, (b) implementation cost in a walker-based clipboard pipeline, (c) accessibility/semantics, (d) practical caveats.

### A. Inline `<svg>` (current OK approach)

**Cross-destination support: 0/5**
- Gmail: Blocked entirely (D1-1).
- Outlook: Retired Sept 2025; Classic always blocked (D4-1, D4-2).
- Notion: No `svg` block type in schema → stripped (D2-1).
- Slack: Not in `rich_text_block` schema → stripped (D3-1).
- Google Docs: Not supported, requires EMF conversion (D5-2).

**Verdict:** **0/5 destinations preserve inline SVG.** This is the empirical failure case the user is observing.

### B. Inline `<img src="data:image/svg+xml;base64,...">`

**Cross-destination support: 0/5 (LOW confidence — possibly works in Notion/GDocs)**
- Gmail: Base64 data URIs blocked (D1-4) → image becomes attachment.
- Outlook: Inline SVG security policy retires SVG generally — data URI form likely blocked too (D4-1).
- Notion: No evidence either way. Likely stripped in rich-text paste path. Not investigated empirically.
- Slack: Data URIs not in supported set.
- Google Docs: SVG not supported regardless of delivery shape.

**Verdict:** **0/5 confirmed.** Khalil's Apr-2025 Medium article advocates this approach for Rails *outbound email rendering*, but the broader literature and the cross-app paste path suggest it doesn't survive. **Not viable.**

### C. Inline `<img src="data:image/png;base64,...">` (raster fallback)

**Cross-destination support: ~0/5**
- Gmail: Base64 data URIs blocked → attachment (D1-4).
- Outlook: Likely blocked (no documentation of allowance; consistent with strict allowlist posture).
- Notion: Not in supported paste path; would be dropped or converted to attachment block.
- Slack: Data URIs not allowed.
- Google Docs: Possibly supported (no negative evidence, but no positive either).

**Verdict:** **0/5 confirmed.** Raster doesn't fix the core delivery problem. **Not viable.**

### D. Hosted `<img src="https://your-cdn.com/icon.png">` (HTTPS-hosted PNG)

**Cross-destination support: 5/5**
- Gmail: Proxied through googleusercontent.com (D1-3) — works for PNG/JPG/GIF; SVG fails through proxy.
- Outlook: All variants — preserves `<img src>` (D4-4). Linked SVG works in some but not all; PNG works everywhere.
- Notion: Converts to image block (D2-3). Inline image preserved.
- Slack: Pasted `<img src>` likely treated as link or upload (D3-4) — content is preserved but may be a link card rather than inline image. **Empirical uncertain.**
- Google Docs: Preserves as inline image (D5-3).

**Verdict:** **5/5 (with one INFERRED on Slack).** This is the most reliable image-form. **Cost:** requires hosting the icons on a public CDN, with stable URLs that support cross-origin GETs. Open-knowledge has no static CDN today; could use:
- GitHub raw URLs (`https://raw.githubusercontent.com/lucide-icons/lucide/main/icons/info.svg`) — fragile, version-dependent, NOT PNG. Not viable for SVG.
- A dedicated PNG CDN (Cloudflare R2, Vercel, jsDelivr) — requires hosting + maintenance.
- Pre-generated PNGs from lucide source, hosted on docs.open-knowledge.io or equivalent — most production-grade option.

### E. Unicode glyph (text character)

**Cross-destination support: 5/5**
- Gmail: All BMP characters render in Gmail body. UTF-8 fully supported.
- Outlook: BMP chars render reliably; emoji variation selectors (U+FE0F) may misrender on legacy Outlook (D4-5).
- Notion: Full UTF-8 support; renders as text.
- Slack: Full UTF-8 support; renders as text.
- Google Docs: Full UTF-8 support; renders as text.

**Verdict:** **5/5 across the matrix.** Render fidelity varies by font (e.g., the user's font choice in Gmail composer). Color is controlled by the parent `color: rgb(...)` style (which the walker now emits via convertCssColors).

**Mapping for OK's icon needs:**
| OK icon          | Lucide name        | Unicode replacement | Codepoint |
|------------------|--------------------|---------------------|-----------|
| Chevron right (collapsible closed) | `chevron-right`  | ▶                  | U+25B6   |
| Chevron down (collapsible open)    | `chevron-down`   | ▼                  | U+25BC   |
| Info icon                          | `info`           | ℹ                  | U+2139   |
| Warning icon                       | `triangle-alert` | ⚠                  | U+26A0   |
| Error icon                         | `circle-x`       | ⊘ or ✗             | U+2298 or U+2717 |
| Tip icon                           | `lightbulb`      | 💡 (emoji)          | U+1F4A1  |
| Success icon                       | `check`          | ✓                  | U+2713   |

**Note on color:** Plain BMP chars render in the parent text color. With the walker's `convertCssColors` already converting `oklch(...)` → `rgb(...)` on the parent's inline `style="color: ..."`, the glyph inherits the correct destination-renderable color.

**Note on accessibility:** Unicode glyphs are read by screen readers as their Unicode name (e.g., "Black right-pointing triangle" for ▶). For semantic correctness, wrap with `aria-label="Toggle"` or use only when the surrounding text provides context.

### F. Emoji (with U+FE0F variation selector — colored)

**Cross-destination support: 4/5**
- Gmail: Renders reliably (Google may overlay with Noto Color Emoji image).
- Outlook 365 web/new: Renders reliably (uses Segoe UI Emoji on Windows).
- Outlook Classic desktop: **Misrenders FE0F** (D4-5) — falls back to monochrome text glyph or shows as box.
- Notion: Full support.
- Slack: Full support; Slack has its own emoji renderer that overlays platform-native.
- Google Docs: Full support.

**Verdict:** **4/5 confirmed (Outlook Classic legacy is the outlier).** Color is OS-dependent — Apple emoji vs Microsoft emoji vs Google emoji. Identity preserved; visual consistency lost. For a "warning" or "info" icon where the *concept* matters more than the *appearance*, this is acceptable.

**Mapping:**
| OK icon | Emoji form | Codepoint |
|---------|------------|-----------|
| Info    | ℹ️         | U+2139 U+FE0F |
| Warning | ⚠️         | U+26A0 U+FE0F |
| Error   | ❌ or ⛔   | U+274C / U+26D4 |
| Tip     | 💡         | U+1F4A1 |
| Success | ✅         | U+2705 |

### G. HTTP-hosted `<img src="https://hosted.svg">` (linked SVG)

**Cross-destination support: 2-3/5**
- Gmail: Proxy refuses to serve SVG content (D1-3, D1-1). **Fails.**
- Outlook: Linked SVG works in some variants (D4-3) but Sept 2025 retirement may extend to linked too. **At risk.**
- Notion: Works as image block (linked SVG can be loaded from URL).
- Slack: Likely works as link card.
- Google Docs: Not supported (D5-2).

**Verdict:** **~2/5 reliable.** Hosting cost without the cross-app payoff. Not recommended.

### H. Font icon (FontAwesome-style)

**Cross-destination support: 0/5**
- All destinations strip `@font-face` (D1-5 covers Gmail; same pattern for others) and likely strip the icon-font's `<i class="fa-info">` element.
- Even if class survived, the destination wouldn't load the FontAwesome CSS or font files.

**Verdict:** **0/5.** Not viable. Mentioned for completeness only.

---

## Mapping cost (D9)

The OK Callout descriptor uses **3 type icons** (info, warning, success/tip — exact set per descriptor). Plus the **chevron** for collapsible state. **Plus** Accordion/HtmlDetailsAccordion's chevron (already real DOM after Pass-3 refactor).

**Total icons to map: 5–7.**

The mapping table is short enough to maintain inline as a `Record<string, string>` with the lucide class name as key:

```typescript
const LUCIDE_TO_UNICODE: Record<string, string> = {
  'lucide-chevron-right': '▶',  // U+25B6
  'lucide-chevron-down': '▼',   // U+25BC
  'lucide-info': 'ℹ️',           // U+2139 U+FE0F (or 'ℹ' for legacy Outlook safety)
  'lucide-triangle-alert': '⚠️', // U+26A0 U+FE0F
  'lucide-check': '✓',           // U+2713
  'lucide-circle-x': '✗',        // U+2717
  'lucide-lightbulb': '💡',      // U+1F4A1
};
```

Walker-time replacement adds ~30 lines: detect `<svg class="lucide-...">`, look up class in map, replace with `<span aria-hidden="true">{glyph}</span>` + the parent's color preserved.

**Cost:** Negligible — pure regex/DOM-walk replacement at the walker boundary, fits in `clipboard-walker.ts`. Adds 1 unit test fixture per icon. Total commit ~50-80 lines.
