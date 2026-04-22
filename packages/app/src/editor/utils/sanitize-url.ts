/**
 * Render-layer XSS mitigation for MDX-authored component props.
 *
 * The editor renders live React components authored as MDX. User-authored
 * MDX expression-attrs can land arbitrary values on every live-rendered
 * component (fumadocs Card forwards `{...props}` to a DOM `<a>`/`<div>`).
 * Storage-layer fidelity is unchanged (NG4 — raw bytes pass through); this
 * helper is the render-layer mitigation per CLAUDE.md "Storage never
 * sanitizes; render-time layers do."
 *
 * Three surfaces are policed here:
 *   1. URL-typed props (`href`, `src`, `action`, …) — strip
 *      javascript:/vbscript:/data: schemes (replace with `#`).
 *   2. Dangerous prop names (`dangerouslySetInnerHTML`, `on*`, `ref`, `key`,
 *      React internals) — DROP. These are XSS gadgets regardless of value.
 *   3. `style` prop — reject non-string *and* filter `url(javascript:…)` /
 *      `expression(…)` / `javascript:` from string values.
 *
 * URL rules:
 *   - Empty / falsy strings pass through unchanged.
 *   - Relative paths (`/docs/foo`, `./sibling`, `../`) and fragments (`#id`)
 *     pass through — they resolve against the current origin.
 *   - Schemes in URL_SCHEME_ALLOWLIST pass through unchanged.
 *   - Protocol-relative URLs (`//evil.example`) pass through.
 *   - Everything else is replaced with `#` — visually preserving the "link"
 *     shape but inert on click.
 *
 * URL props are matched case-insensitively against URL_PROP_NAMES so the
 * React camelCase form (`formAction`, `xlinkHref`) and the HTML lowercase
 * form (`formaction`, `action`) both hit the filter.
 *
 * Nested URL traversal: arrays + plain objects are walked one level deep
 * for URL-shaped keys so patterns like
 * `<InlineTOC items={[{url:"javascript:…"}]} />` cannot bypass. Depth is
 * bounded by `MAX_NESTED_DEPTH` to protect against cyclic / pathological
 * shapes from MDX expression literals.
 *
 * Matches the shape shipped by React itself for `href` in development
 * builds (see reactjs/rfcs#186 + createSanitizeURL) and by DOMPurify's
 * `ALLOWED_URI_REGEXP` default.
 */

const URL_SCHEME_ALLOWLIST = new Set(['http:', 'https:', 'mailto:', 'tel:', 'ftp:', 'sms:']);

/**
 * Prop names whose string value is rendered as a DOM URL attribute.
 * Stored lowercased; callers compare via `key.toLowerCase()` so both the
 * React camelCase form (`formAction`) and the HTML lowercase form
 * (`formaction`) route through the filter.
 *
 * Covers the fumadocs surface (Card.href, ImageZoom.src, Audio.src), the
 * full HTML URL-attribute set, and SVG xlink:* (xlinkHref on <use>/<image>
 * is an under-documented XSS vector).
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
  'xlinkhref',
  'xlinkactuate',
  'xlinkrole',
  'xlinkarcrole',
  'xlinkshow',
  // Non-HTML-attr conventions common in component prop shapes. Nested
  // traversal reaches these inside arrays / objects (e.g.
  // `InlineTOC items={[{url: ...}]}` flows to `<a href={item.url}>`).
  // Also included at the top level so a hypothetical `url` prop on any
  // future descriptor inherits the filter.
  'url',
  'link',
]);

/**
 * React-special / security-sensitive prop names that must never flow from
 * user-authored MDX to a live-rendered component. Stored lowercased; `on*`
 * handlers matched via prefix check in `isDangerousPropName`.
 *
 *   - `dangerouslysetinnerhtml` — direct HTML injection → arbitrary JS.
 *   - `ref` / `key` — React internals (object `ref` object from MDX is
 *     meaningless and could pierce component isolation).
 *   - `defaultvalue` / `defaultchecked` — React form uncontrolled-component
 *     seeding; harmless in isolation but not something MDX authors need.
 *   - `on*` — every DOM event handler. A string `onClick="alert(1)"` is
 *     ignored by React (requires a function), but an MDX expression-attr
 *     CAN carry a function via complex serialization paths. Drop all.
 *   - `__html` — any prop whose shape includes this key is a DIY-dangerous-
 *     HTML gadget.
 */
const DANGEROUS_PROP_NAMES = new Set([
  'dangerouslysetinnerhtml',
  'ref',
  'key',
  'defaultvalue',
  'defaultchecked',
]);

/**
 * Max depth the nested-URL traversal will descend. Keeps the sanitizer
 * O(total-entries) regardless of user-authored MDX expression shape and
 * short-circuits pathological / cyclic inputs.
 */
const MAX_NESTED_DEPTH = 4;

/**
 * Max CSS `style` string length that is scanned. Longer values are
 * preserved (no-op — the scanner would be quadratic on adversarial
 * input). Typical inline-style values are < 500 chars; 10 KB is
 * a generous ceiling before falling back to "pass through as plain
 * string, no parse."
 */
const MAX_STYLE_SCAN_LEN = 10_000;

/** Lowercase + rule check — pure, exported for unit tests. */
export function isDangerousPropName(rawName: string): boolean {
  const name = rawName.toLowerCase();
  if (DANGEROUS_PROP_NAMES.has(name)) return true;
  // `onClick`, `onMouseDown`, `onError`, … — every DOM event handler.
  // React requires `on` + uppercase letter; but we normalize to lowercase
  // first, so check any prop starting with `on` followed by another char.
  if (name.length >= 3 && name.startsWith('on')) return true;
  return false;
}

/** URL prop match — case-insensitive. Exported for unit tests. */
export function isUrlPropName(rawName: string): boolean {
  return URL_PROP_NAMES.has(rawName.toLowerCase());
}

/**
 * Return a safe value for a URL-typed prop. Non-strings pass through so
 * this can be applied blindly across the prop set (callers check
 * `isUrlPropName(key)` first to avoid rewriting non-URL string props).
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
 * Sanitize a CSS `style` STRING value. Drops the whole value if it contains
 * a `javascript:` / `vbscript:` scheme inside `url(…)` (covers background /
 * content / list-style-image etc.) or a CSS `expression(…)` call (legacy IE,
 * still a gadget class). We do not attempt a full CSS parser; the filter
 * is a coarse denylist matching DOMPurify's CSS-hook behavior.
 *
 * Returns the input string unchanged when safe. Returns `''` when unsafe.
 * Non-string input is rejected at the caller before reaching this helper.
 */
function sanitizeStyleString(value: string): string {
  if (value.length > MAX_STYLE_SCAN_LEN) return '';
  const lower = value.toLowerCase();
  // url(…) with javascript:/vbscript:/data: scheme
  if (/url\s*\(\s*['"]?\s*(?:javascript|vbscript|data)\s*:/.test(lower)) return '';
  // IE legacy expression() — still used in phishing payloads.
  if (/\bexpression\s*\(/.test(lower)) return '';
  return value;
}

/**
 * Walk a prop value, sanitizing URL-shaped keys in nested arrays/objects.
 * Returns a structurally-equivalent value; non-plain objects (class
 * instances, functions, DOM nodes) pass through untouched — MDX expression
 * attributes can only produce primitives, plain objects, and arrays, so
 * this catches every realistic attack shape without interfering with
 * descriptor-provided React.ReactNode values.
 */
function sanitizeNested(value: unknown, depth: number): unknown {
  if (depth >= MAX_NESTED_DEPTH) return value;
  if (value === null || value === undefined) return value;
  if (Array.isArray(value)) {
    let changed = false;
    const next: unknown[] = new Array(value.length);
    for (let i = 0; i < value.length; i++) {
      const sanitized = sanitizeNested(value[i], depth + 1);
      next[i] = sanitized;
      if (sanitized !== value[i]) changed = true;
    }
    return changed ? next : value;
  }
  if (typeof value !== 'object') return value;
  // Guard against non-plain objects (Map, Set, Date, DOM nodes, React
  // elements, class instances). JSON.parse always produces plain objects,
  // so MDX-derived props won't hit this, but defensive belt-and-braces.
  const proto = Object.getPrototypeOf(value);
  if (proto !== Object.prototype && proto !== null) return value;

  const obj = value as Record<string, unknown>;
  let changed = false;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (isUrlPropName(k) && typeof v === 'string') {
      const safe = sanitizeUrlValue(v);
      if (safe !== v) changed = true;
      out[k] = safe;
    } else {
      const safe = sanitizeNested(v, depth + 1);
      if (safe !== v) changed = true;
      out[k] = safe;
    }
  }
  return changed ? out : value;
}

/**
 * Policy pass over a whole props object. Applies (in order):
 *   - Drops dangerous prop names outright (`dangerouslySetInnerHTML`, `on*`,
 *     React internals). Logs a structured debug event per drop.
 *   - Rewrites URL-typed props with `sanitizeUrlValue`.
 *   - Rewrites `style` string values with `sanitizeStyleString`; drops
 *     non-string `style` entirely (React accepts objects, but an MDX
 *     expression-authored style object can smuggle `background:"url(js:)"`
 *     values that bypass the string scanner; the safer default is to
 *     require descriptor-declared style props if a component needs them).
 *   - Recursively sanitizes nested URL-shaped keys (arrays + plain objects,
 *     one-level; bounded by `MAX_NESTED_DEPTH`).
 *
 * Returns a new object when anything was rewritten; returns the input
 * unchanged otherwise (avoids unnecessary re-renders in React Compiler's
 * equality memo).
 */
export function sanitizeComponentProps(props: Record<string, unknown>): Record<string, unknown> {
  let changed = false;
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(props)) {
    if (isDangerousPropName(key)) {
      // DROP. Structured debug event lets operators grep for attacks;
      // console.debug keeps the signal below default log level so legitimate
      // debugging isn't flooded when MDX authors happen to misuse a prop.
      if (typeof console !== 'undefined' && typeof console.debug === 'function') {
        console.debug(
          JSON.stringify({
            event: 'jsx-prop-dropped',
            reason: 'dangerous-prop-name',
            prop: key,
          }),
        );
      }
      changed = true;
      continue;
    }
    if (isUrlPropName(key)) {
      const safe = sanitizeUrlValue(value);
      if (safe !== value) changed = true;
      result[key] = safe;
      continue;
    }
    if (key === 'style') {
      if (typeof value === 'string') {
        const safe = sanitizeStyleString(value);
        if (safe !== value) changed = true;
        result[key] = safe;
      } else {
        // Object / non-string styles are dropped. Descriptor-declared style
        // props should be modeled as explicit typed fields.
        changed = true;
      }
      continue;
    }
    const safe = sanitizeNested(value, 0);
    if (safe !== value) changed = true;
    result[key] = safe;
  }
  return changed ? result : props;
}
