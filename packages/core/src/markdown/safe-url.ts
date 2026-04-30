/**
 * Canonical URL-scheme allowlist for the markdown + clipboard pipelines.
 *
 * Single source of truth for "which URL schemes can flow into outbound
 * HTML at the OK→external boundary?" Two consumers today:
 *
 * - `mdast-to-html.ts` `rehypeSanitizeUrls` runs against the hast tree
 *   produced by `remark-rehype`, blocking dangerous-scheme `href` / `src` /
 *   `action` attributes before stringification.
 * - `clipboard-walker.ts` runs against the live editor DOM at copy time,
 *   blocking dangerous-scheme attributes (and substituting embedded URLs in
 *   `aria-label` etc.) before the cross-app HTML payload leaves the editor.
 *
 * Both consumers MUST classify URLs identically. Drift between the two
 * surfaces is a known vulnerability source — a scheme accepted by one and
 * rejected by the other lets payloads through one path that the other
 * would have caught.
 *
 * Allowlist posture (not denylist): leading-whitespace bypass (`" javascript:..."`
 * per WHATWG URL §4 preprocessing) is closed by the `.trim()` step; novel
 * schemes (`intent:`, `blob:`, `view-source:`, future schemes) fail-closed
 * by construction. See `precedent #19(f)` in `PRECEDENTS.md`.
 */

/**
 * Schemes that pass the allowlist, plus path-prefix delimiters that
 * indicate a relative URL (no scheme component at all). Pinned to the
 * scheme set used by `URL_SCHEME_ALLOWLIST` in
 * `packages/app/src/editor/utils/sanitize-url.ts:58` so the JSX-prop
 * sanitizer and the markdown / clipboard sanitizers share a single
 * allowlist by intent.
 */
export const SAFE_URL_SCHEME_RE = /^(https?:|mailto:|tel:|ftp:|sms:|\/|#|\?|\.\/|\.\.\/)/i;

/**
 * Return whether a URL string is safe to emit to an outbound HTML attribute
 * boundary. Empty / whitespace-only values are treated as benign (an empty
 * `href` strips nothing the destination wouldn't have stripped anyway).
 *
 * Does NOT cover bare relative paths like `one.png` or `path/file.jpg` —
 * those have no scheme and no path-prefix delimiter, so the regex rejects
 * them. Consumers that operate on already-resolved live DOM (e.g., the
 * clipboard walker) layer an additional "no-scheme = relative URL = safe"
 * check on top of this helper.
 */
export function isSafeUrl(url: string): boolean {
  const trimmed = url.trim();
  if (trimmed === '') return true;
  return SAFE_URL_SCHEME_RE.test(trimmed);
}
