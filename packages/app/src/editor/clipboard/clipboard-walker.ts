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

export const CLASS_BLOCKLIST: ReadonlySet<string> = new Set([
  'jsx-component-wrapper',
  'selectedCell',
  'is-empty',
  'ProseMirror-selectednode',
  'ProseMirror-trailingBreak',
]);

export const ATTR_BLOCKLIST: ReadonlySet<string> = new Set([
  'data-selected',
  'data-has-child-selected',
  'data-dragging',
  'contenteditable',
  'data-pm-slice',
]);

export interface ComputedStyleLike {
  getPropertyValue(prop: string): string;
}

interface WalkerEnv {
  getComputedStyle: (el: Element) => ComputedStyleLike;
}

const DEFAULT_ENV: WalkerEnv = {
  getComputedStyle: (el) => window.getComputedStyle(el),
};

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
    if (parent !== view.state.doc) return false;

    const liveDom = view.nodeDOM(pos);
    if (liveDom == null) {
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
  replaceLucideIconsWithGlyphs(clone);
  return clone;
}

export const LUCIDE_GLYPH_MAP: Record<string, string> = {
  'lucide-chevron-right': '›', // SINGLE RIGHT-POINTING ANGLE QUOTATION MARK
  'lucide-info': 'ℹ', // INFORMATION SOURCE
  'lucide-lightbulb': '\u{1F4A1}', // ELECTRIC LIGHT BULB (renders monochrome on legacy)
  'lucide-message-square-warning': '❗', // HEAVY EXCLAMATION MARK SYMBOL
  'lucide-alert-triangle': '⚠', // WARNING SIGN
  'lucide-alert-octagon': '⛔', // NO ENTRY (octagonal stop semantics)
};

const LUCIDE_CLASS_RE = /(?:^|\s)(lucide-[a-z0-9-]+)(?:\s|$)/;

export function glyphForLucide(className: string): string | null {
  const match = className.match(LUCIDE_CLASS_RE);
  if (!match) return null;
  return LUCIDE_GLYPH_MAP[match[1]] ?? null;
}

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
  const styleStr = buildInlineStyleFrom(env.getComputedStyle(live));
  if (styleStr) {
    const existing = clone.getAttribute('style');
    clone.setAttribute('style', existing ? `${existing}; ${styleStr}` : styleStr);
  }

  const className = clone.getAttribute('class');
  if (className !== null) {
    const filtered = stripBlocklistedClasses(className);
    if (filtered) clone.setAttribute('class', filtered);
    else clone.removeAttribute('class');
  }

  for (const attr of Array.from(clone.attributes)) {
    if (ATTR_BLOCKLIST.has(attr.name)) {
      clone.removeAttribute(attr.name);
      continue;
    }
    if (isDangerousEventHandlerAttr(attr.name)) {
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
      const sanitized = sanitizeEmbeddedUrlValue(attr.value, { reportNoChange: true });
      if (sanitized !== null) {
        clone.setAttribute(attr.name, sanitized);
        logWalkerUrlBlocked({ attr: attr.name, reason: 'embedded-url', view: 'wysiwyg' });
      }
    }
  }

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
