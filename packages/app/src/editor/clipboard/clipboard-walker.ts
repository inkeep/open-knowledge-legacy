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
import { paletteFor } from './clipboard-walker-fallback-palette.ts';
import { logWalkerFallback } from './instrument.ts';

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
 * Marker the descriptor sets on a subtree to opt out of clipboard capture.
 * Set on a React render root or descendant element as `data-clipboard-omit="true"`
 * to make the walker skip the subtree at copy time. Exported so descriptors
 * reference the constant rather than hardcoding the literal string.
 */
const OPT_OUT_ATTR = 'data-clipboard-omit';

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

  // Strip blocklisted attributes.
  for (const attr of Array.from(clone.attributes)) {
    if (ATTR_BLOCKLIST.has(attr.name)) clone.removeAttribute(attr.name);
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
