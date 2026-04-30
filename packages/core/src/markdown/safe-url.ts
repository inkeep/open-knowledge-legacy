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
 * The canonical set of safe URL schemes — protocol prefix WITHOUT the
 * trailing colon (so consumers can compose either form). All three
 * sanitizers in the repo derive from this single array:
 *
 * - `SAFE_URL_SCHEME_RE` below — the regex form used by `isSafeUrl` and
 *   the clipboard walker's `isSafeWalkerUrl`.
 * - `URL_SCHEME_ALLOWLIST` in `packages/app/src/editor/utils/sanitize-url.ts`
 *   — the Set form used by the JSX-prop render-layer sanitizer; derived
 *   directly from `SAFE_URL_SCHEMES.map(s => \`${s}:\`)` so adding /
 *   removing a scheme HERE updates all three sites by construction.
 */
export const SAFE_URL_SCHEMES = ['https', 'http', 'mailto', 'tel', 'ftp', 'sms'] as const;

const SCHEME_ALT = SAFE_URL_SCHEMES.map((s) => `${s}:`).join('|');
// Path-prefix delimiters that indicate a relative URL (no scheme component).
const PATH_PREFIX_ALT = '\\/|#|\\?|\\.\\/|\\.\\.\\/';

/**
 * Allowlist regex: head-anchored match against the scheme set above OR a
 * relative-URL path prefix. Case-insensitive — browsers normalize scheme
 * to lowercase per WHATWG URL §3.1, so `JAVASCRIPT:alert(1)` must hit the
 * same rejection path as `javascript:alert(1)`.
 */
export const SAFE_URL_SCHEME_RE = new RegExp(`^(?:${SCHEME_ALT}|${PATH_PREFIX_ALT})`, 'i');

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

/**
 * Classify a URL value as a relative URL — meaning it has no scheme
 * component at all, OR a path / query / fragment delimiter appears before
 * any colon (so `path:colon` style filenames are still relative because
 * the `/` before the colon disqualifies the colon as a scheme separator).
 *
 * Mirrors WHATWG URL relative-reference parsing for the tail end of the
 * scheme decision. Used by:
 * - clipboard-walker `isSafeWalkerUrl` — walker operates on already-resolved
 *   live DOM, so bare relative paths (`one.png`, `path/file.jpg`) appear and
 *   must pass the safety check.
 * - sanitize-url `sanitizeUrlValue` — JSX-prop sanitizer running before
 *   resolution; same logic applies.
 *
 * Both consumers compose `isSafeUrl(url) || isRelativeUrl(url)` rather
 * than reimplementing the colon / separator scan.
 */
export function isRelativeUrl(url: string): boolean {
  const trimmed = url.trim();
  if (trimmed === '') return true;
  const colonIdx = trimmed.indexOf(':');
  if (colonIdx === -1) return true;
  const slashIdx = trimmed.indexOf('/');
  const questionIdx = trimmed.indexOf('?');
  const hashIdx = trimmed.indexOf('#');
  const firstSep = Math.min(
    slashIdx === -1 ? Number.POSITIVE_INFINITY : slashIdx,
    questionIdx === -1 ? Number.POSITIVE_INFINITY : questionIdx,
    hashIdx === -1 ? Number.POSITIVE_INFINITY : hashIdx,
  );
  return colonIdx > firstSep;
}
