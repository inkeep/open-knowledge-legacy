/**
 * WikiLinkEmbed PM node — companion to wikiLink for the `![[file.ext]]`
 * asset-embed construct (SPEC §6 FR-3c / D-I / D-F).
 *
 * Storage is attrs-only: target + anchor + alias. The basename index
 * (server-side) resolves target → disk path at render time; the PM
 * layer never carries a pre-resolved `src`. That keeps parse/serialize
 * pure and defers extension-based dispatch (image vs video vs opaque)
 * to the renderer — Phase 2's typed component nodes (Video/Audio/
 * PDFViewer) swap in behind the same storage shape without any content
 * migration (D-F read-time promotion).
 */
import { Node } from '@tiptap/core';
import { normalizeNullableString } from './wiki-link.ts';

export interface WikiLinkEmbedAttrs {
  target: string;
  alias: string | null;
  anchor: string | null;
  /** Set by the server-side renderer when the basename index finds a match. */
  resolved: boolean;
}

const WIKI_LINK_EMBED_PATTERN = /^!\[\[([^[\]|#]+?)(?:#([^\]|]+?))?(?:\|([^\]]+?))?\]\]/;

export function parseWikiLinkEmbed(src: string): {
  type: 'wikilink-embed';
  raw: string;
  target: string;
  alias: string | null;
  anchor: string | null;
} | null {
  const match = src.match(WIKI_LINK_EMBED_PATTERN);
  if (!match) return null;
  const target = match[1]?.trim() ?? '';
  if (!target) return null;
  return {
    type: 'wikilink-embed',
    raw: match[0],
    target,
    anchor: normalizeNullableString(match[2]),
    alias: normalizeNullableString(match[3]),
  };
}

export function renderWikiLinkEmbed(
  attrs: Pick<WikiLinkEmbedAttrs, 'target' | 'alias' | 'anchor'>,
): string {
  let out = `![[${attrs.target}`;
  if (attrs.anchor) out += `#${attrs.anchor}`;
  if (attrs.alias) out += `|${attrs.alias}`;
  return `${out}]]`;
}

export function getWikiLinkEmbedLabel(
  attrs: Pick<WikiLinkEmbedAttrs, 'target' | 'alias' | 'anchor'>,
): string {
  if (attrs.alias) return attrs.alias;
  return attrs.anchor ? `${attrs.target}#${attrs.anchor}` : attrs.target;
}

export const WikiLinkEmbed = Node.create({
  name: 'wikiLinkEmbed',
  group: 'inline',
  inline: true,
  atom: true,
  priority: 60,

  addAttributes() {
    return {
      target: { default: '' },
      alias: { default: null },
      anchor: { default: null },
      resolved: { default: false },
    };
  },

  parseHTML() {
    return [
      {
        tag: 'span[data-wiki-embed]',
        getAttrs: (node) => {
          if (typeof node === 'string') return false;
          return {
            target: node.getAttribute('data-target') || '',
            alias: normalizeNullableString(node.getAttribute('data-alias')),
            anchor: normalizeNullableString(node.getAttribute('data-anchor')),
            resolved: node.getAttribute('data-resolved') === 'true',
          };
        },
      },
    ];
  },

  renderHTML({ node, HTMLAttributes }) {
    const target = String(node.attrs.target ?? '');
    const alias = normalizeNullableString(node.attrs.alias);
    const anchor = normalizeNullableString(node.attrs.anchor);
    const resolved = node.attrs.resolved === true;
    return [
      'span',
      {
        ...HTMLAttributes,
        'data-wiki-embed': '',
        'data-target': target,
        'data-alias': alias ?? '',
        'data-anchor': anchor ?? '',
        'data-resolved': resolved ? 'true' : 'false',
      },
      getWikiLinkEmbedLabel({ target, alias, anchor }),
    ];
  },
});
