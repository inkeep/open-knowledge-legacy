/**
 * Live-DOM clipboard walker — captures whatever React rendered + whatever CSS
 * resolved into a DocumentFragment suitable for cross-app text/html outbound.
 *
 * Design summary:
 *   1. Iterate top-level nodes in `view.state.selection`.
 *   2. For each, call `view.nodeDOM(pos)` to retrieve the LIVE styled DOM
 *      element from the editor.
 *   3. `cloneNode(true)` to detach a copy.
 *   4. Walk live + clone trees pairwise; on every element copy allowlisted
 *      computed styles inline and strip editor-only classes / attributes.
 *
 * This replaces a per-descriptor `toClipboardHast` contract for the v1 5-pack:
 * the React render IS the cross-app HTML shape. Future descriptors with hidden
 * state (Tabs / Carousel / Canvas) opt in to a `descriptor.toClipboardHast`
 * override.
 *
 * Activity-hidden edge: `view.nodeDOM(pos)` returns null when the slice is in
 * an `<Activity mode="hidden">` subtree whose DOM was unmounted. The walker
 * delegates to the per-descriptor static palette in
 * `clipboard-walker-fallback-palette.ts`.
 *
 * Opt-out: a descriptor can mark a subtree with `data-clipboard-omit="true"`
 * on its React render root. The walker drops that subtree from the output.
 *
 * Cardinality discipline: the style allowlist is hand-curated to email-safe
 * properties (Notion / Slack / Gmail rich-paste profiles all preserve them).
 * The class blocklist strips selection halo / drag chrome / ProseMirror
 * internals. The attribute blocklist strips `contenteditable` and PM-internal
 * markers so destinations don't see editor-only state.
 */

import { SAFE_URL_SCHEME_RE } from '@inkeep/open-knowledge-core';
import type { Slice } from '@tiptap/pm/model';
import type { EditorView } from '@tiptap/pm/view';
import { paletteFor } from './clipboard-walker-fallback-palette.ts';
import { logWalkerFallback, logWalkerUrlBlocked } from './instrument.ts';

/**
 * CSS properties copied inline from the live element to the clone. Curated for
 * the Slack / Notion / Gmail / GitHub rich-paste profiles — everything in this
 * list survives at least one of the four. Layout / transform / animation
 * properties are intentionally excluded: destinations rebuild layout, and
 * inlining them across an arbitrary snippet would yield broken visuals.
 */
export const STYLE_ALLOWLIST = [
  'color',
  'background-color',
  'background-image',
  'border',
  'border-top',
  'border-right',
  'border-bottom',
  'border-left',
  'border-color',
  'border-width',
  'border-style',
  'border-radius',
  'padding',
  'padding-top',
  'padding-right',
  'padding-bottom',
  'padding-left',
  'margin',
  'margin-top',
  'margin-right',
  'margin-bottom',
  'margin-left',
  'font-family',
  'font-size',
  'font-weight',
  'font-style',
  'text-decoration',
  'text-align',
  'line-height',
  'list-style',
  'list-style-type',
  'list-style-position',
  'vertical-align',
  'white-space',
] as const;

/**
 * Editor-only chrome classes stripped from the clone. Selection halo
 * (`ProseMirror-selectednode`), trailing-break placeholder
 * (`ProseMirror-trailingBreak`), the JSX wrapper chrome, and table cell
 * selection markers all leak editor state if not stripped.
 */
export const CLASS_BLOCKLIST: ReadonlySet<string> = new Set([
  'jsx-component-wrapper',
  'selectedCell',
  'is-empty',
  'ProseMirror-selectednode',
  'ProseMirror-trailingBreak',
]);

/**
 * Editor-only attributes stripped from the clone. `contenteditable` would
 * make the pasted block accidentally editable in destinations that respect
 * it (Notion). `data-pm-slice` is PM's wire-format marker. The `data-selected`
 * / `data-has-child-selected` / `data-dragging` markers are interaction-state
 * leaks emitted by `JsxComponentView`.
 */
export const ATTR_BLOCKLIST: ReadonlySet<string> = new Set([
  'data-selected',
  'data-has-child-selected',
  'data-dragging',
  'contenteditable',
  'data-pm-slice',
]);

/**
 * URL-scheme attributes filtered through `SAFE_URL_SCHEME_RE` (imported from
 * `@inkeep/open-knowledge-core` — single source of truth shared with the
 * markdown pipeline's `isSafeUrl` and the JSX-prop sanitizer).
 *
 * The pre-walker mdast-to-hast pipeline ran `rehypeSanitizeUrls` downstream of
 * the markdown→HTML chain; the walker bypasses that pipeline and copies the
 * live DOM verbatim. Without this filter, an attacker-controlled
 * `<a href="javascript:...">` (e.g., from a markdown autolink that survived
 * upstream parsing) would land in the cross-app clipboard payload.
 *
 * Allowlist posture (not denylist) eliminates the leading-whitespace bypass
 * (browsers strip leading ASCII whitespace per WHATWG URL §4 preprocessing;
 * we trim before classifying) and the novel-scheme fail-open class. Schemes
 * accepted: `http(s):`, `mailto:`, `tel:`, `ftp:`, `sms:`, plus relative URL
 * path-prefix forms (`/`, `#`, `?`, `./`, `../`). Everything else — including
 * `javascript:` / `vbscript:` / `file:` / browser-extension schemes / all
 * `data:` URIs — is rejected.
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
 * any unsafe-scheme URL appearing inside these values; safe schemes pass
 * through unchanged. Substitution preserves the wrapping label
 * ("Link: [blocked]") rather than dropping the attribute, so assistive tech
 * still surfaces the descriptor's role.
 */
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
export const URL_BEARING_TEXT_ATTRS: ReadonlySet<string> = new Set([
  'aria-label',
  'aria-description',
  'title',
]);

/**
 * Dangerous CSS-in-`style` patterns. The pre-walker pipeline ran
 * `sanitizeStyleString` on JSX-component props, but mark-rendered DOM
 * (TipTap built-ins, raw HTML inline) bypasses that gate. Walker mirrors
 * the same coarse denylist (DOMPurify CSS-hook parity) at the FR-20
 * boundary: `url(javascript:...)` / `url(data:...)` payloads in
 * `background-image` / `content` / `list-style-image` / `cursor`, plus
 * legacy IE `expression(...)`.
 */
const DANGEROUS_STYLE_URL_RE = /url\s*\(\s*['"]?\s*(?:javascript|vbscript|data)\s*:/i;
const DANGEROUS_STYLE_EXPRESSION_RE = /\bexpression\s*\(/i;

/**
 * Marker the descriptor sets on a subtree to opt out of clipboard capture.
 * Set on a React render root or descendant element as `data-clipboard-omit="true"`
 * to make the walker skip the subtree at copy time.
 *
 * Module-internal: knip drops unused exports, so the constant is private until
 * the first descriptor wires `data-clipboard-omit` and imports it. At that
 * point promote to `export` and update consumers to reference the constant
 * rather than hardcoding the literal string — a typo
 * (`data-clipboard-ommit`) at a descriptor would silently fail to opt out.
 */
const OPT_OUT_ATTR = 'data-clipboard-omit' as const;

/**
 * Style-getter abstraction so the walker is testable without a real browser.
 * Returns an object with `getPropertyValue(name)` matching the standard
 * `CSSStyleDeclaration` interface. Defaults to `window.getComputedStyle`.
 */
export interface ComputedStyleLike {
  getPropertyValue(prop: string): string;
}

interface WalkerEnv {
  getComputedStyle: (el: Element) => ComputedStyleLike;
}

const DEFAULT_ENV: WalkerEnv = {
  getComputedStyle: (el) => window.getComputedStyle(el),
};

/**
 * Build an inline `style="..."` value from a computed-style declaration,
 * including only the allowlisted properties. Skips empty / `initial` /
 * `normal` values so the inline output stays small.
 */
export function buildInlineStyleFrom(
  computed: ComputedStyleLike,
  allowlist: readonly string[] = STYLE_ALLOWLIST,
): string {
  let style = '';
  for (const prop of allowlist) {
    const value = computed.getPropertyValue(prop);
    if (!value) continue;
    if (value === 'initial' || value === 'normal') continue;
    style += `${prop}: ${value}; `;
  }
  return style.trim();
}

/**
 * Drop blocklisted classes from a `class` attribute value. Returns the
 * filtered class list, or `null` if no classes survive.
 */
export function stripBlocklistedClasses(
  className: string,
  blocklist: ReadonlySet<string> = CLASS_BLOCKLIST,
): string | null {
  const kept = className
    .split(/\s+/)
    .filter((c) => c.length > 0 && !blocklist.has(c))
    .join(' ');
  return kept || null;
}

/**
 * Allowlist URL classifier — accepts `http(s):` / `mailto:` / `tel:` /
 * `ftp:` / `sms:` and any relative URL form (bare filenames, root-relative
 * paths, fragments, queries); rejects everything else. Trims leading and
 * trailing ASCII whitespace per WHATWG URL preprocessing so a leading-space
 * bypass (`" javascript:..."`) cannot evade the regex.
 *
 * Relative-URL detection mirrors `sanitizeUrlValue` in
 * `packages/app/src/editor/utils/sanitize-url.ts:195-224`: a value is
 * relative when it has no colon, OR when a `/`, `?`, or `#` appears before
 * the first colon (`one.png`, `path/file.jpg`, `?q=1`, `#hash` all pass).
 *
 * Empty / whitespace-only values are treated as benign no-op hrefs and
 * pass through.
 */
export function isSafeWalkerUrl(url: string): boolean {
  const trimmed = url.trim();
  if (trimmed === '') return true;
  if (SAFE_URL_SCHEME_RE.test(trimmed)) return true;
  // No allowlisted scheme matched. If the value has no scheme at all
  // (no colon, or path/query/fragment separator before any colon), it's a
  // relative URL — safe by construction.
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
 * Mirrors `isDangerousPropName`'s `on*` rule at sanitize-url.ts:175-180,
 * but operates on attribute names (already lowercased by the DOM API on
 * `Attr.name`). Length discriminator avoids matching the bare `on` prefix.
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
 * Mirrors `sanitizeStyleString` in sanitize-url.ts but operates on the
 * walker's `style` attribute boundary. We do not parse CSS — DOMPurify
 * uses the same denylist shape because the false-positive class on
 * legitimate inline styles is empty (no benign use of `expression(...)`
 * or `url(javascript:...)` exists in modern web content).
 */
export function sanitizeStyleAttrValue(value: string): string {
  if (DANGEROUS_STYLE_URL_RE.test(value)) return '';
  if (DANGEROUS_STYLE_EXPRESSION_RE.test(value)) return '';
  return value;
}

export function walkLiveDomToInlineStyledFragment(
  _slice: Slice,
  view: EditorView,
  env: WalkerEnv = DEFAULT_ENV,
): DocumentFragment {
  const fragment = document.createDocumentFragment();
  const { from, to } = view.state.selection;
  if (from === to) return fragment;

  view.state.doc.nodesBetween(from, to, (node, pos, parent) => {
    // Walk only the top-level children of the document root.
    if (parent !== view.state.doc) return false;

    const liveDom = view.nodeDOM(pos);
    if (liveDom == null) {
      // Activity-hidden subtree — defer to the per-descriptor static
      // palette. Emit telemetry so a non-Activity-hidden null (a real
      // bug per the walker STOP_IF rule) surfaces in production logs.
      logWalkerFallback({ descriptor: node.type.name, view: 'wysiwyg' });
      const fallback = paletteFor(node);
      if (fallback) fragment.appendChild(fallback);
      return false;
    }
    if (!(liveDom instanceof Element)) return false;
    if (liveDom.getAttribute(OPT_OUT_ATTR) === 'true') return false;

    fragment.appendChild(cloneAndStyle(liveDom, env));
    return false;
  });

  return fragment;
}

function cloneAndStyle(live: Element, env: WalkerEnv): Element {
  const clone = live.cloneNode(true) as Element;
  walkPair(live, clone, env);
  return clone;
}

function walkPair(live: Element, clone: Element, env: WalkerEnv): void {
  // Inline computed styles via the allowlist.
  const styleStr = buildInlineStyleFrom(env.getComputedStyle(live));
  if (styleStr) {
    const existing = clone.getAttribute('style');
    clone.setAttribute('style', existing ? `${existing}; ${styleStr}` : styleStr);
  }

  // Strip blocklisted classes.
  const className = clone.getAttribute('class');
  if (className !== null) {
    const filtered = stripBlocklistedClasses(className);
    if (filtered) clone.setAttribute('class', filtered);
    else clone.removeAttribute('class');
  }

  // FR-20 escape contract: the pre-walker pipeline ran rehypeSanitizeUrls
  // downstream of mdast-to-hast; the walker bypasses that pipeline so the
  // filter has to live here. Allowlist parity with `isSafeUrl` (mdast-to-html.ts)
  // and `URL_SCHEME_ALLOWLIST` (sanitize-url.ts) — see helpers above.
  for (const attr of Array.from(clone.attributes)) {
    if (ATTR_BLOCKLIST.has(attr.name)) {
      clone.removeAttribute(attr.name);
      continue;
    }
    if (isDangerousEventHandlerAttr(attr.name)) {
      // React strips `on*` from JSX before render, but the walker is a
      // re-emit boundary to untrusted destinations — defense-in-depth.
      clone.removeAttribute(attr.name);
      logWalkerUrlBlocked({ attr: 'on*', reason: 'event-handler' });
      continue;
    }
    if (attr.name === 'style') {
      const safeStyle = sanitizeStyleAttrValue(attr.value);
      if (safeStyle === '') {
        clone.removeAttribute('style');
        logWalkerUrlBlocked({ attr: 'style', reason: 'unsafe-url-or-expression' });
      } else if (safeStyle !== attr.value) {
        clone.setAttribute('style', safeStyle);
      }
      continue;
    }
    if (URL_SCHEME_ATTRS.has(attr.name)) {
      const valueIsSafe =
        attr.name === 'srcset' ? isSrcsetSafe(attr.value) : isSafeWalkerUrl(attr.value);
      if (!valueIsSafe) {
        // Drop the attribute rather than substitute `about:blank` — destinations
        // that strip the resulting unsafe-removed anchor surface clean text
        // instead of a clickable trap. For `srcset`, drop the entire attribute
        // when ANY candidate is unsafe (conservative; matches the walker's
        // existing remove-rather-than-rewrite policy).
        clone.removeAttribute(attr.name);
        logWalkerUrlBlocked({
          attr: attr.name,
          reason: attr.name === 'srcset' ? 'srcset-candidate' : 'scheme',
        });
      }
      continue;
    }
    if (URL_BEARING_TEXT_ATTRS.has(attr.name)) {
      // Internal-link mark renders `aria-label="Link: <href>"` (see
      // internal-link.ts); a dangerous-scheme href would land verbatim
      // in cross-app HTML. Replace the URL portion with `[blocked]` so
      // assistive tech sees clean text and the surrounding label stays
      // informative ("Link: [blocked]" vs. silent attribute drop).
      const sanitized = sanitizeEmbeddedUrlValue(attr.value, { reportNoChange: true });
      if (sanitized !== null) {
        clone.setAttribute(attr.name, sanitized);
        logWalkerUrlBlocked({ attr: attr.name, reason: 'embedded-url' });
      }
    }
  }

  // Recurse pairwise.
  const liveKids = Array.from(live.children);
  const cloneKids = Array.from(clone.children);
  const len = Math.min(liveKids.length, cloneKids.length);
  for (let i = 0; i < len; i++) {
    const liveKid = liveKids[i];
    const cloneKid = cloneKids[i];
    if (liveKid.getAttribute(OPT_OUT_ATTR) === 'true') {
      cloneKid.remove();
      continue;
    }
    walkPair(liveKid, cloneKid, env);
  }
}
