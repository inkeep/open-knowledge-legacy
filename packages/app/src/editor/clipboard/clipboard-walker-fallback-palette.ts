/**
 * Per-descriptor static palette for the live-DOM clipboard walker.
 *
 * Used only when `view.nodeDOM(pos)` returns `null` — the slice originates
 * inside an `<Activity mode="hidden">` subtree whose live DOM was unmounted.
 * The walker's primary path captures whatever React rendered + whatever CSS
 * resolved; this fallback emits a hand-built palette for each canonical /
 * compat descriptor so the Activity-hidden case isn't silently empty.
 *
 * Output shape per descriptor mirrors what the React render produces (post
 * walker filter), so cross-app destinations see the same shape regardless of
 * whether the live DOM was available.
 */

import type { Node as PmNode } from '@tiptap/pm/model';
import { isSafeWalkerUrl } from './clipboard-walker.ts';

/**
 * Callout type → cross-app tone mapping. Exported so the registry-coverage
 * test in `clipboard-walker-fallback-palette.test.ts` can pin the supported
 * type set without invoking the DOM-creating palette functions (bun-test
 * has no DOM; full palette DOM behavior is covered in Playwright E2E).
 */
export const TYPE_TO_TONE: Record<string, { color: string; bg: string }> = {
  note: { color: '#0969da', bg: '#dbeafe' },
  tip: { color: '#1f883d', bg: '#dcfce7' },
  important: { color: '#8250df', bg: '#f3e8ff' },
  warning: { color: '#9a6700', bg: '#fef3c7' },
  caution: { color: '#cf222e', bg: '#fee2e2' },
};

/**
 * Lookup the tone for a callout `type` value, with prototype-pollution
 * guard via `Object.hasOwn`. Falls back to the `note` tone when the type
 * is unknown OR when it resolves to an Object.prototype method via the
 * prototype chain (`__proto__`, `constructor`, `toString`, `hasOwnProperty`).
 *
 * Mirrors the same guard pattern used in `Callout.tsx` and `Accordion.tsx`
 * (co-editor DoS vector — without the guard, an adversarial document with
 * `type="__proto__"` would yield `border-left: 3px solid undefined`).
 */
export function toneForType(type: string): { color: string; bg: string } {
  return Object.hasOwn(TYPE_TO_TONE, type) ? TYPE_TO_TONE[type] : TYPE_TO_TONE.note;
}

/**
 * The descriptor names the palette switch covers. Exported so the
 * registry-coverage test can mechanically assert that every v1 canonical /
 * compat descriptor has a palette entry — adding a descriptor to the
 * registry without adding a case here would make the test fail loudly
 * rather than silently produce `null` in Activity-hidden cross-app paste.
 */
export const PALETTE_DESCRIPTOR_NAMES = [
  // Canonical 5-pack
  'Callout',
  'img',
  'video',
  'audio',
  'Accordion',
  // Compat 3-pack
  'GFMCallout',
  'CommonMarkImage',
  'HtmlDetailsAccordion',
] as const;

function calloutPalette(props: Record<string, unknown>): Element {
  const type = typeof props.type === 'string' ? props.type : 'note';
  const tone = toneForType(type);
  const aside = document.createElement('aside');
  aside.setAttribute('class', `callout callout-${type}`);
  aside.setAttribute('data-callout-type', type);
  aside.setAttribute(
    'style',
    `border-left: 3px solid ${tone.color}; background-color: ${tone.bg}; padding: 0.5rem 0.75rem; border-radius: 0.25rem;`,
  );
  if (typeof props.title === 'string' && props.title) {
    const title = document.createElement('strong');
    title.textContent = props.title;
    aside.appendChild(title);
  }
  return aside;
}

function accordionPalette(props: Record<string, unknown>): Element {
  const details = document.createElement('details');
  if (props.defaultOpen === true) details.setAttribute('open', '');
  details.setAttribute('class', 'accordion');
  const summary = document.createElement('summary');
  summary.textContent = typeof props.title === 'string' ? props.title : 'Accordion';
  details.appendChild(summary);
  return details;
}

// PM node attrs carry unsanitized storage-layer values per the NG4 contract
// ("storage never sanitizes; render-time layers do"). The live walker path
// runs URL-scheme sanitization in `walkPair`, but the palette path is
// appended directly without going through `walkPair` — so the FR-20
// allowlist filter must run here too. An adversarial document containing
// `<img src="data:text/html,..." />` MDX would otherwise emit that
// dangerous scheme verbatim into the cross-app clipboard payload when the
// source slice is Activity-hidden.
function imagePalette(props: Record<string, unknown>): Element {
  const img = document.createElement('img');
  if (typeof props.src === 'string' && isSafeWalkerUrl(props.src)) {
    img.setAttribute('src', props.src);
  }
  if (typeof props.alt === 'string') img.setAttribute('alt', props.alt);
  return img;
}

function videoPalette(props: Record<string, unknown>): Element {
  const video = document.createElement('video');
  if (typeof props.src === 'string' && isSafeWalkerUrl(props.src)) {
    video.setAttribute('src', props.src);
  }
  // Mirror the descriptor's `controls.defaultValue: true` so cross-app
  // destinations preserving the element verbatim render a usable player.
  // The live walker captures `controls` automatically via cloneNode; this
  // path fires only for Activity-hidden subtrees.
  if (props.controls !== false) video.setAttribute('controls', '');
  return video;
}

function audioPalette(props: Record<string, unknown>): Element {
  const audio = document.createElement('audio');
  if (typeof props.src === 'string' && isSafeWalkerUrl(props.src)) {
    audio.setAttribute('src', props.src);
  }
  if (props.controls !== false) audio.setAttribute('controls', '');
  return audio;
}

/**
 * Return a palette element for a PM node, or `null` when the node type isn't
 * a registered descriptor we have a palette for. The walker appends `null`
 * results as no-ops.
 */
export function paletteFor(node: PmNode): Element | null {
  if (node.type.name !== 'jsxComponent') return null;
  const componentName = node.attrs.componentName as string | undefined;
  const props = (node.attrs.props as Record<string, unknown>) ?? {};
  switch (componentName) {
    case 'Callout':
    case 'GFMCallout':
      return calloutPalette(props);
    case 'Accordion':
    case 'HtmlDetailsAccordion':
      return accordionPalette(props);
    case 'img':
    case 'CommonMarkImage':
      return imagePalette(props);
    case 'video':
      return videoPalette(props);
    case 'audio':
      return audioPalette(props);
    default:
      return null;
  }
}
