/**
 * URL-scheme allowlist for prop values that reach the DOM as URL attributes.
 *
 * The editor renders live React components authored as MDX. User-authored
 * `<Card href="javascript:...">` would otherwise reach fumadocs `Card` (which
 * forwards `href` to `<a>`) and create a clickable XSS gadget in the editor
 * origin. Storage-layer fidelity is unchanged (NG4 — raw bytes pass through);
 * this helper is the render-layer mitigation per CLAUDE.md "Storage never
 * sanitizes; render-time layers do."
 *
 * Rules:
 *   - Empty / falsy strings pass through unchanged.
 *   - Relative paths (`/docs/foo`, `./sibling`, `../`) and fragments (`#id`)
 *     pass through — they resolve against the current origin.
 *   - Schemes in URL_SCHEME_ALLOWLIST pass through unchanged.
 *   - Protocol-relative URLs (`//evil.example`) pass through.
 *   - Everything else (javascript:, vbscript:, data:text/html, custom
 *     schemes) is replaced with `#` — visually preserving the "link" shape
 *     but inert on click.
 *
 * Matches the shape shipped by React itself for `href` in development
 * builds (see reactjs/rfcs#186 + createSanitizeURL) and by DOMPurify's
 * `ALLOWED_URI_REGEXP` default.
 *
 * URL-typed prop names are enumerated in URL_PROP_NAMES. New components
 * authoring URL attrs must extend that set — unknown names pass through
 * unfiltered (non-URL string props are arbitrary content, not a scheme
 * surface).
 */

const URL_SCHEME_ALLOWLIST = new Set(['http:', 'https:', 'mailto:', 'tel:', 'ftp:', 'sms:']);

/**
 * Prop names whose string value is rendered as a DOM URL attribute.
 * Covers the fumadocs surface (Card.href, ImageZoom.src, Audio.src) and
 * the full HTML URL-attribute set so future components inherit the
 * mitigation by naming their prop conventionally.
 */
export const URL_PROP_NAMES = new Set([
  'href',
  'src',
  'action',
  'formaction',
  'poster',
  'cite',
  'data',
  'manifest',
  'background',
  'ping',
]);

/**
 * Return a safe value for a URL-typed prop. Non-strings pass through so
 * this can be applied blindly across the prop set (callers check
 * `URL_PROP_NAMES.has(key)` first to avoid rewriting non-URL string props).
 *
 * Exported for unit tests; callers should prefer `sanitizeComponentProps`
 * for the whole-props-object shape.
 */
export function sanitizeUrlValue(raw: unknown): unknown {
  if (typeof raw !== 'string') return raw;
  const value = raw.trim();
  if (!value) return raw;

  // Fragment-only (`#id`) — same-document anchor.
  if (value.startsWith('#')) return raw;

  // Protocol-relative (`//host/path`) — resolves against the current origin's
  // protocol; browsers reject the combination with `javascript:`, so this
  // can't be used as a scheme-smuggling path.
  if (value.startsWith('//')) return raw;

  // Relative paths (no scheme, no leading `//`) — anything up to the first
  // `:` that isn't `/`, `?`, `#`, or `.` is a potential scheme.
  const colonIdx = value.indexOf(':');
  if (colonIdx === -1) return raw;
  // Path or query separator comes before a colon → treat as relative path.
  const slashIdx = value.indexOf('/');
  const questionIdx = value.indexOf('?');
  const hashIdx = value.indexOf('#');
  const firstSep = [slashIdx, questionIdx, hashIdx]
    .filter((i) => i !== -1)
    .reduce((a, b) => Math.min(a, b), Number.POSITIVE_INFINITY);
  if (colonIdx > firstSep) return raw;

  const scheme = value.slice(0, colonIdx + 1).toLowerCase();
  if (URL_SCHEME_ALLOWLIST.has(scheme)) return raw;
  return '#';
}

/**
 * Filter URL-typed props in a flat props object. Returns a new object when
 * any prop was rewritten; returns the input unchanged if nothing needed
 * filtering (avoids unnecessary re-renders in React Compiler's equality
 * memo). Non-URL props pass through as-is.
 */
export function sanitizeComponentProps(props: Record<string, unknown>): Record<string, unknown> {
  let changed = false;
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(props)) {
    if (URL_PROP_NAMES.has(key)) {
      const safe = sanitizeUrlValue(value);
      if (safe !== value) changed = true;
      result[key] = safe;
    } else {
      result[key] = value;
    }
  }
  return changed ? result : props;
}
