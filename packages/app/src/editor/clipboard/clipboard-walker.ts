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

import type { Slice } from '@tiptap/pm/model';
import type { EditorView } from '@tiptap/pm/view';
import {
  convertCssColors,
  isDangerousEventHandlerAttr,
  isSafeWalkerUrl,
  isSrcsetSafe,
  OPT_OUT_ATTR,
  sanitizeEmbeddedUrlValue,
  sanitizeStyleAttrValue,
  URL_BEARING_TEXT_ATTRS,
  URL_SCHEME_ATTRS,
} from './clipboard-sanitize.ts';
import { paletteFor } from './clipboard-walker-fallback-palette.ts';
import { logUnmappedLucideIcon, logWalkerFallback, logWalkerUrlBlocked } from './instrument.ts';

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

// `OPT_OUT_ATTR` lives in `./clipboard-sanitize.ts` — descriptor authors
// import it directly from the leaf module to mark elements that must not
// reach the clipboard payload.

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
 *
 * Each value passes through `convertCssColors` to downgrade CSS Color 4
 * functions (`oklch`, `oklab`, `lab`, `lch`) to `rgb()` / `rgba()` —
 * destination HTML renderers (Gmail, Notion, Slack-class) don't parse
 * the modern color functions and would render the color as default
 * (invisible chevrons, missing accent borders) without this conversion.
 * Pass-through is a no-op for already-`rgb()` / hex / hsl / named values.
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
    style += `${prop}: ${convertCssColors(value)}; `;
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
  // Post-walk replacement so the URL/event-handler/style filters above run
  // unconditionally on every SVG before it can be discarded — defense-in-
  // depth at the FR-20 escape boundary. A future non-lucide SVG that
  // shares the `lucide-` prefix could otherwise bypass sanitization.
  replaceLucideIconsWithGlyphs(clone);
  return clone;
}

/**
 * Lucide icon class → Unicode glyph for cross-app paste fidelity.
 *
 * No mainstream paste destination preserves inline `<svg>`: Gmail's image
 * proxy refuses SVG, Outlook retired SVG support in September 2025, and
 * Notion / Slack / Google Docs strip on paste (their schemas have no
 * `<svg>` block type). At the walker emit boundary we substitute a
 * Unicode glyph that inherits the parent's already-inlined
 * `color: rgb(...)` (set by `convertCssColors`) so the icon survives with
 * the correct destination-renderable color.
 *
 * In-app render is unaffected — the React lucide-react components continue
 * to render real `<svg>` elements inside the editor. Only the clipboard
 * walker output is rewritten.
 *
 * Glyph choices favor BMP characters without U+FE0F variation selectors
 * so legacy Outlook desktop (pre-2019) renders them correctly. The single
 * supplementary-plane character (`💡` for `lightbulb`) renders monochrome
 * on legacy clients without misrendering — no FE0F is attached.
 *
 * Adding a new icon: when a descriptor ships a new lucide icon, add the
 * `lucide-<kebab-name>` class (matches the `lucide` class lucide-react
 * renders) and a glyph. The dev-time `clipboard-walker-unmapped-lucide-
 * icon` telemetry event surfaces icons that lack a mapping so they don't
 * silently degrade in cross-app paste.
 */
export const LUCIDE_GLYPH_MAP: Record<string, string> = {
  'lucide-chevron-right': '›', // SINGLE RIGHT-POINTING ANGLE QUOTATION MARK
  'lucide-info': 'ℹ', // INFORMATION SOURCE
  'lucide-lightbulb': '\u{1F4A1}', // ELECTRIC LIGHT BULB (renders monochrome on legacy)
  'lucide-message-square-warning': '❗', // HEAVY EXCLAMATION MARK SYMBOL
  'lucide-alert-triangle': '⚠', // WARNING SIGN
  'lucide-alert-octagon': '⛔', // NO ENTRY (octagonal stop semantics)
};

const LUCIDE_CLASS_RE = /(?:^|\s)(lucide-[a-z0-9-]+)(?:\s|$)/;

/**
 * Pure: extract a `lucide-<name>` token from a class string and return its
 * mapped glyph, or `null` if no lucide class is present or the class has
 * no glyph mapping. Anchors are tight on whitespace boundaries so
 * `lucide-info-darker` does NOT match `lucide-info`.
 */
export function glyphForLucide(className: string): string | null {
  const match = className.match(LUCIDE_CLASS_RE);
  if (!match) return null;
  return LUCIDE_GLYPH_MAP[match[1]] ?? null;
}

/**
 * In-place: replace each mapped `<svg.lucide-*>` descendant of `root` with
 * a `<span aria-hidden="true">{glyph}</span>`. Unmapped lucide-* SVGs stay
 * in place (graceful degradation — destinations strip them, but a wrong
 * glyph is worse than no glyph) and emit a dev-tier telemetry signal.
 *
 * Idempotent: replacing an SVG removes it from `root.querySelectorAll('svg')`'s
 * snapshot, so repeated invocations are no-ops on already-substituted trees.
 */
function replaceLucideIconsWithGlyphs(root: Element): void {
  const svgs = root.querySelectorAll('svg');
  for (const svg of Array.from(svgs)) {
    const className = svg.getAttribute('class') ?? '';
    const lucideMatch = className.match(LUCIDE_CLASS_RE);
    if (!lucideMatch) continue;
    const lucideClass = lucideMatch[1];
    const glyph = LUCIDE_GLYPH_MAP[lucideClass];
    if (!glyph) {
      logUnmappedLucideIcon({ lucideClass, view: 'wysiwyg' });
      continue;
    }
    const span = svg.ownerDocument.createElement('span');
    span.setAttribute('aria-hidden', 'true');
    span.textContent = glyph;
    svg.replaceWith(span);
  }
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
      logWalkerUrlBlocked({ attr: 'on*', reason: 'event-handler', view: 'wysiwyg' });
      continue;
    }
    if (attr.name === 'style') {
      const safeStyle = sanitizeStyleAttrValue(attr.value);
      if (safeStyle === '') {
        clone.removeAttribute('style');
        logWalkerUrlBlocked({
          attr: 'style',
          reason: 'unsafe-url-or-expression',
          view: 'wysiwyg',
        });
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
          view: 'wysiwyg',
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
        logWalkerUrlBlocked({ attr: attr.name, reason: 'embedded-url', view: 'wysiwyg' });
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
