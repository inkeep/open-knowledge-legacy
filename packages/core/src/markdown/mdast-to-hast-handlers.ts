import type { Comment, Element, ElementContent, Properties } from 'hast';
import type { MdxJsxFlowElement, MdxJsxTextElement } from 'mdast-util-mdx';
import type { Handler, Handlers } from 'mdast-util-to-hast';
import { toWikiLinkSlug } from '../utils/slug.ts';
import type {
  PromotedMdastType,
  RawMdxFallbackMdast,
  WikiLinkEmbedMdast,
  WikiLinkMdast,
} from './mdast-augmentation.ts';

const HTML_PRIMITIVE_TAGS = new Set(['img', 'video', 'audio']);

function tryNativeHtmlPrimitive(node: MdxJsxFlowElement | MdxJsxTextElement): Element | null {
  const name = node.name;
  if (!name || !HTML_PRIMITIVE_TAGS.has(name)) return null;
  const properties: Properties = {};
  for (const attr of node.attributes) {
    if (attr.type !== 'mdxJsxAttribute') return null;
    const lowerName = attr.name.toLowerCase();
    if (lowerName.length >= 3 && lowerName.startsWith('on')) continue;
    if (attr.value === null) {
      properties[attr.name] = true;
    } else if (typeof attr.value === 'string') {
      properties[attr.name] = attr.value;
    } else {
      return null;
    }
  }
  return { type: 'element', tagName: name, properties, children: [] };
}

function wikiLinkHref(target: string, anchor: string | null): string {
  const slug = toWikiLinkSlug(target);
  return anchor ? `#${slug}-${toWikiLinkSlug(anchor)}` : `#${slug}`;
}

const wikiLinkHandler: Handler = (state, node) => {
  const wiki = node as WikiLinkMdast;
  const { target, anchor, alias } = wiki.data;
  const result: Element = {
    type: 'element',
    tagName: 'a',
    properties: {
      className: ['wiki-link'],
      dataTarget: target,
      dataAnchor: anchor ?? '',
      dataAlias: alias ?? '',
      href: wikiLinkHref(target, anchor),
    },
    children: wiki.children.length > 0 ? state.all(wiki) : [{ type: 'text', value: wiki.value }],
  };
  state.patch(node, result);
  return state.applyData(node, result);
};

const wikiLinkEmbedHandler: Handler = (state, node) => {
  const embed = node as WikiLinkEmbedMdast;
  const { target, anchor, alias } = embed.data;
  const result: Element = {
    type: 'element',
    tagName: 'a',
    properties: {
      className: ['wiki-embed'],
      dataTarget: target,
      dataAnchor: anchor ?? '',
      dataAlias: alias ?? '',
      href: wikiLinkHref(target, anchor),
    },
    children: embed.children.length > 0 ? state.all(embed) : [{ type: 'text', value: embed.value }],
  };
  state.patch(node, result);
  return state.applyData(node, result);
};

const mdxJsxFlowHandler: Handler = (state, node) => {
  const jsx = node as MdxJsxFlowElement;
  const native = tryNativeHtmlPrimitive(jsx);
  if (native) {
    state.patch(node, native);
    return state.applyData(node, native);
  }
  const raw = typeof jsx.data?.sourceRaw === 'string' ? jsx.data.sourceRaw : '';
  const code: Element = {
    type: 'element',
    tagName: 'code',
    properties: {},
    children: [{ type: 'text', value: raw }],
  };
  const pre: Element = {
    type: 'element',
    tagName: 'pre',
    properties: { className: ['mdx-component'] },
    children: [code],
  };
  state.patch(node, pre);
  return state.applyData(node, pre);
};

const mdxJsxTextHandler: Handler = (state, node) => {
  const jsx = node as MdxJsxTextElement;
  const native = tryNativeHtmlPrimitive(jsx);
  if (native) {
    state.patch(node, native);
    return state.applyData(node, native);
  }
  const raw = typeof jsx.data?.sourceRaw === 'string' ? jsx.data.sourceRaw : '';
  const span: Element = {
    type: 'element',
    tagName: 'span',
    properties: { className: ['mdx-inline'], dataJsxInline: '' },
    children: [{ type: 'text', value: raw }],
  };
  state.patch(node, span);
  return state.applyData(node, span);
};

const rawMdxFallbackHandler: Handler = (state, node) => {
  const fb = node as RawMdxFallbackMdast;
  const reason = fb.data.reason || 'unknown';
  const raw = fb.value || '';
  const safeReason = reason.replace(/--/g, '\u2014');
  const comment: Comment = {
    type: 'comment',
    value: ` Parse error: ${safeReason} `,
  };
  const code: Element = {
    type: 'element',
    tagName: 'code',
    properties: {},
    children: [{ type: 'text', value: raw }],
  };
  const pre: Element = {
    type: 'element',
    tagName: 'pre',
    properties: {
      className: ['mdx-fallback'],
      dataRawMdxFallback: '',
      dataReason: safeReason,
    },
    children: [code],
  };
  state.patch(node, pre);
  const children: ElementContent[] = [comment, state.applyData(node, pre) as Element];
  return children;
};

const promotedHandlers: Record<PromotedMdastType, Handler> = {
  wikiLink: wikiLinkHandler,
  wikiLinkEmbed: wikiLinkEmbedHandler,
  mdxJsxFlowElement: mdxJsxFlowHandler,
  mdxJsxTextElement: mdxJsxTextHandler,
  rawMdxFallback: rawMdxFallbackHandler,
};

export const customNodeHandlers: Handlers = promotedHandlers;
