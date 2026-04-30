/**
 * Clipboard FR-20 sanitization helpers — leaf module with no intra-clipboard
 * imports.
 *
 * Both the walker (`clipboard-walker.ts` — DOM traversal) and the fallback
 * palette (`clipboard-walker-fallback-palette.ts` — static element
 * construction) need URL / event-handler / style sanitization at the
 * cross-app re-emit boundary. Hosting these helpers inside the walker
 * created a circular dependency (palette imported `isSafeWalkerUrl` from
 * walker; walker imported `paletteFor` from palette). ESM resolved the
 * cycle correctly via deferred binding, but the cycle reflected a
 * conflated concern: the security helpers are a distinct responsibility
 * from DOM walking.
 *
 * This file is a leaf — it imports only from `@inkeep/open-knowledge-core`
 * (`SAFE_URL_SCHEME_RE`, `isRelativeUrl`). Both walker and palette import
 * from here, eliminating the cycle.
 *
 * Filter contract (FR-20 escape boundary, mirrors PRECEDENTS.md #19(f)):
 *   - URL-scheme allowlist for href / src / srcset / poster / formaction /
 *     xlink:href via `isSafeWalkerUrl` + `isSrcsetSafe`.
 *   - Embedded-URL substitution for aria-label / aria-description / title
 *     via `sanitizeEmbeddedUrlValue`.
 *   - Style-payload filter for `style` via `sanitizeStyleAttrValue`.
 *   - Event-handler attribute classifier via `isDangerousEventHandlerAttr`.
 */

import { isRelativeUrl, SAFE_URL_SCHEME_RE } from '@inkeep/open-knowledge-core';

/**
 * URL-scheme attributes that the walker filters through `isSafeWalkerUrl`.
 * Includes `srcset` as a special case — see `isSrcsetSafe` for the
 * comma-separated candidate parser.
 */
export const URL_SCHEME_ATTRS: ReadonlySet<string> = new Set([
  'href',
  'src',
  'srcset',
  'poster',
  'formaction',
  'xlink:href',
]);

/**
 * Human-readable attributes that may carry an embedded URL — internal-link's
 * `aria-label="Link: <href>"` is the canonical OK shape. The walker scrubs
 * unsafe-scheme URLs appearing inside these values; safe schemes pass
 * through unchanged.
 */
export const URL_BEARING_TEXT_ATTRS: ReadonlySet<string> = new Set([
  'aria-label',
  'aria-description',
  'title',
]);

// Match URL-shaped tokens that are unambiguously URLs:
//   - `<scheme>://...` (authority-bearing — covers https/http/ftp/blob/intent/etc.)
//   - One of the explicit code-execution schemes that browsers and
//     destinations may attempt to navigate (no authority component).
//
// Intentionally narrower than `isSafeWalkerUrl`'s allowlist (which fail-closes
// on novel schemes for href/src). Embedded URL scanning runs against
// human-readable label content (`aria-label` / `title`), which is read by
// assistive tech as text — it does NOT navigate. The trade is: novel safe
// schemes in labels (e.g., `Visit magnet:?xt=...`) survive unblocked, in
// exchange for label fidelity ("Item:value", "Status:active", "Type:warning"
// no longer get rewritten to `[blocked]`).
const URL_LIKE_TOKEN_RE =
  /(?:[a-zA-Z][a-zA-Z0-9+.-]*:\/\/[^\s"'<>]+|(?:javascript|vbscript|data|file|chrome-extension|moz-extension):[^\s"'<>]*)/gi;

/**
 * Dangerous CSS-in-`style` patterns. The pre-walker pipeline ran
 * `sanitizeStyleString` on JSX-component props, but mark-rendered DOM
 * (TipTap built-ins, raw HTML inline) bypasses that gate. Walker mirrors
 * the same coarse denylist (DOMPurify CSS-hook parity) at the FR-20
 * boundary: `url(javascript:...)` / `url(data:...)` payloads in
 * `background-image` / `content` / `list-style-image` / `cursor`, plus
 * legacy IE `expression(...)`.
 *
 * `MAX_STYLE_SCAN_LEN` mirrors the sibling guard in
 * `sanitize-url.ts:sanitizeStyleString` — defense-in-depth ceiling on
 * regex-scan cost for adversarial mega-payloads. A 10KB inline `style`
 * value is already two orders of magnitude above any legitimate use; the
 * sanitizer drops the value entirely above the threshold (no regex scan,
 * no opportunity for ReDoS-style amplification).
 */
const DANGEROUS_STYLE_URL_RE = /url\s*\(\s*['"]?\s*(?:javascript|vbscript|data)\s*:/i;
const DANGEROUS_STYLE_EXPRESSION_RE = /\bexpression\s*\(/i;
export const MAX_STYLE_SCAN_LEN = 10_000;

/**
 * Allowlist URL classifier — accepts `http(s):` / `mailto:` / `tel:` /
 * `ftp:` / `sms:` and any relative URL form (bare filenames, root-relative
 * paths, fragments, queries); rejects everything else. Trims leading and
 * trailing ASCII whitespace per WHATWG URL preprocessing so a leading-space
 * bypass (`" javascript:..."`) cannot evade the regex.
 *
 * Relative-URL detection delegated to the canonical `isRelativeUrl` helper
 * in `@inkeep/open-knowledge-core` — `sanitize-url.ts` reuses the same
 * helper, so a future refinement of relative-URL semantics propagates to
 * both sites by construction.
 *
 * Empty / whitespace-only values are treated as benign no-op hrefs and
 * pass through.
 */
export function isSafeWalkerUrl(url: string): boolean {
  const trimmed = url.trim();
  if (trimmed === '') return true;
  if (SAFE_URL_SCHEME_RE.test(trimmed)) return true;
  return isRelativeUrl(trimmed);
}

/**
 * Per-candidate `srcset` validator. WHATWG HTML §4.8.4.3.2 defines
 * `srcset` as a comma-separated list of image-candidate strings, each with
 * a URL plus optional density / width descriptor. A head-anchored regex on
 * the entire attribute value misses dangerous URLs after the first comma
 * (`safe.jpg 1x, javascript:alert(1) 2x`).
 *
 * Returns `true` only if every non-empty candidate's URL is safe. Empty
 * candidates (between consecutive commas) are skipped.
 */
export function isSrcsetSafe(srcset: string): boolean {
  const candidates = srcset.split(',');
  for (const raw of candidates) {
    const candidate = raw.trim();
    if (candidate === '') continue;
    const url = candidate.split(/\s+/)[0] ?? '';
    if (!isSafeWalkerUrl(url)) return false;
  }
  return true;
}

/**
 * Substitute unsafe-scheme URLs inside a human-readable attribute value
 * (aria-label / aria-description / title) with `[blocked]`. Wrapping
 * label text is preserved so screen readers still surface the descriptor's
 * role ("Link: [blocked]").
 *
 * Returns the rewritten string when something was substituted. With
 * `reportNoChange: true`, returns `null` when the input is already safe so
 * the caller can avoid an unnecessary `setAttribute` write.
 */
export function sanitizeEmbeddedUrlValue(value: string): string;
export function sanitizeEmbeddedUrlValue(
  value: string,
  options: { reportNoChange: true },
): string | null;
export function sanitizeEmbeddedUrlValue(
  value: string,
  options?: { reportNoChange: boolean },
): string | null {
  let changed = false;
  const sanitized = value.replace(URL_LIKE_TOKEN_RE, (token) => {
    if (isSafeWalkerUrl(token)) return token;
    changed = true;
    return '[blocked]';
  });
  if (options?.reportNoChange && !changed) return null;
  return sanitized;
}

/**
 * Match DOM event-handler attributes (`onclick`, `onerror`, `onload`, etc.).
 * Mirrors `isDangerousPropName`'s `on*` rule at
 * `packages/app/src/editor/utils/sanitize-url.ts`, but operates on
 * attribute names (already lowercased by the DOM API on `Attr.name`).
 * Length discriminator avoids matching the bare `on` prefix.
 */
export function isDangerousEventHandlerAttr(name: string): boolean {
  const lower = name.toLowerCase();
  return lower.length >= 3 && lower.startsWith('on');
}

/**
 * Coarse CSS-in-style filter. Drops the entire value when it carries a
 * `url(javascript:...)` / `url(vbscript:...)` / `url(data:...)` payload or
 * a legacy IE `expression(...)` call. Returns the input unchanged when
 * safe, or `''` when unsafe.
 *
 * Mirrors `sanitizeStyleString` in `packages/app/src/editor/utils/sanitize-url.ts`
 * but operates on the walker's `style` attribute boundary. We do not parse
 * CSS — DOMPurify uses the same denylist shape because the false-positive
 * class on legitimate inline styles is empty (no benign use of
 * `expression(...)` or `url(javascript:...)` exists in modern web content).
 */
export function sanitizeStyleAttrValue(value: string): string {
  if (value.length > MAX_STYLE_SCAN_LEN) return '';
  if (DANGEROUS_STYLE_URL_RE.test(value)) return '';
  if (DANGEROUS_STYLE_EXPRESSION_RE.test(value)) return '';
  return value;
}
