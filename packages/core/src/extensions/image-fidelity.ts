/**
 * Image node override for source-text fidelity + wiki-embed round-trip.
 *
 * Extends @tiptap/extension-image with three rendered:false attributes that
 * round-trip through the mdast↔PM pipeline without touching the rendered
 * DOM surface:
 *
 *   - `sourceForm`: null | 'wikiembed'
 *       When mdast→PM handlers.wikiLinkEmbed dispatches an image-extension
 *       embed to a PM image node (US-013 FR-3c), it tags the node with
 *       `sourceForm='wikiembed'`. PM→mdast nodeHandlers.image reads this
 *       tag to re-emit the node as a mdast wikiLinkEmbed (round-trip), so
 *       `![[photo.png]]` stays byte-identical through every edge.
 *   - `target`: original embed target string (e.g. `photo.png`), kept
 *       separate from `src` (which is the resolver-resolved path). Needed
 *       because the resolver may map `photo.png` → `attachments/photo.png`
 *       and the reverse path needs the original target.
 *   - `anchor`: optional `#page=3`-style anchor from `![[file#anchor]]`.
 *
 * All three attrs default null and `rendered: false` so non-wikiembed image
 * nodes (plain markdown images, pasted images) remain schema-identical.
 */

import Image from '@tiptap/extension-image';

export const ImageFidelity = Image.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      sourceForm: { default: null, rendered: false },
      target: { default: null, rendered: false },
      anchor: { default: null, rendered: false },
    };
  },
});
