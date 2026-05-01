import type { Node as PmNode } from '@tiptap/pm/model';
import { isSafeWalkerUrl } from './clipboard-sanitize.ts';

export const TYPE_TO_TONE: Record<string, { color: string; bg: string }> = {
  note: { color: '#0969da', bg: '#dbeafe' },
  tip: { color: '#1f883d', bg: '#dcfce7' },
  important: { color: '#8250df', bg: '#f3e8ff' },
  warning: { color: '#9a6700', bg: '#fef3c7' },
  caution: { color: '#cf222e', bg: '#fee2e2' },
};

export function toneForType(type: string): { color: string; bg: string } {
  return Object.hasOwn(TYPE_TO_TONE, type) ? TYPE_TO_TONE[type] : TYPE_TO_TONE.note;
}

export const PALETTE_DESCRIPTOR_NAMES = [
  'Callout',
  'img',
  'video',
  'audio',
  'Accordion',
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
