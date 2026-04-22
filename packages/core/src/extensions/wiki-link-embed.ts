/**
 * WikiLinkEmbed PM node — client-insert-only intermediate for the
 * `![[file.ext]]` asset-embed construct (SPEC §6 FR-3c / D-I / D-F).
 *
 * **Lifecycle:**
 *   1. User drops a file. `pickInsertShape(filename)` decides whether to
 *      emit a PM `wikiLinkEmbed` node (renderable extension in the
 *      `wikiEmbedExtensions` allowlist + `emitFormat='wikiembed'`).
 *   2. TipTap renders this node via the `renderHTML` below — image
 *      extensions become `<img>`, non-image wikiembed extensions become
 *      clickable `<a>` (P0 plain-link fallback; Phase 2 typed-component-
 *      nodes spec will promote to Video/Audio/PDFViewer per D-F read-time
 *      promotion).
 *   3. On save, `nodeHandlers.wikiLinkEmbed` (in `markdown/index.ts`)
 *      serializes the node back to `![[name.ext]]` mdast.
 *   4. On next doc reload, server-side Observer B parses Y.Text through
 *      `mdManager.parseWithFallback` — `handlers.wikiLinkEmbed` dispatches
 *      by extension to PM `image` (image-ext) or PM link-marked text
 *      (non-image wikiembed). Server-side mdast→PM NEVER emits a PM
 *      `wikiLinkEmbed` node post-round-trip (US-013).
 *
 * So this node is transient — it exists between drop and next round-trip.
 * Without it, the client would need to synthesize a PM image / link-
 * marked text at drop time, duplicating the handler dispatch logic.
 *
 * Attrs are serialized into DOM via `data-*` so TipTap's `parseHTML` can
 * round-trip through a re-mount. No `resolved` flag — the render path
 * dispatches on extension alone.
 */
import { Node } from '@tiptap/core';
import { normalizeNullableString } from './wiki-link.ts';

export interface WikiLinkEmbedAttrs {
  target: string;
  alias: string | null;
  anchor: string | null;
}

const WIKI_LINK_EMBED_IMAGE_EXTS = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'avif', 'svg']);

function extensionOf(target: string): string {
  const basename = target.split('/').pop() ?? target;
  const idx = basename.lastIndexOf('.');
  if (idx < 0 || idx === basename.length - 1) return '';
  return basename.slice(idx + 1).toLowerCase();
}

function labelFor(attrs: Pick<WikiLinkEmbedAttrs, 'target' | 'alias' | 'anchor'>): string {
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
          };
        },
      },
    ];
  },

  renderHTML({ node, HTMLAttributes }) {
    const target = String(node.attrs.target ?? '');
    const alias = normalizeNullableString(node.attrs.alias);
    const anchor = normalizeNullableString(node.attrs.anchor);
    const ext = extensionOf(target);

    // Image extension → inline <img>. sirv serves the asset via relative
    // path resolution against the current doc's URL.
    if (WIKI_LINK_EMBED_IMAGE_EXTS.has(ext)) {
      return [
        'img',
        {
          ...HTMLAttributes,
          'data-wiki-embed': '',
          'data-target': target,
          'data-alias': alias ?? '',
          'data-anchor': anchor ?? '',
          src: target,
          alt: alias ?? target,
        },
      ];
    }

    // Non-image or opaque → clickable link. Phase 2 will promote the
    // non-image typed extensions (pdf/mp4/mp3/…) to dedicated NodeViews
    // (Video/Audio/PDFViewer) at render time — storage shape unchanged.
    return [
      'a',
      {
        ...HTMLAttributes,
        'data-wiki-embed': '',
        'data-target': target,
        'data-alias': alias ?? '',
        'data-anchor': anchor ?? '',
        href: anchor ? `${target}#${anchor}` : target,
      },
      labelFor({ target, alias, anchor }),
    ];
  },
});
