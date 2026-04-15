/**
 * Link / image / reference-definition constructs (Phase 3)
 *
 * Link text with dotted underline, URLs muted, brackets dim.
 * Block-level LinkReference definitions get a metadata-zone treatment.
 */

import type { ConstructConfig } from '../registry';

export const linkConstruct: ConstructConfig = {
  id: 'link',
  nodeName: 'Link',
  kind: 'mark',
  class: 'cm-link-text',
};

export const imageConstruct: ConstructConfig = {
  id: 'image',
  nodeName: 'Image',
  kind: 'mark',
  class: 'cm-link-text',
};

export const linkMarkConstruct: ConstructConfig = {
  id: 'link-mark',
  nodeName: 'LinkMark',
  kind: 'mark',
  class: 'cm-link-mark',
};

export const urlConstruct: ConstructConfig = {
  id: 'url',
  nodeName: 'URL',
  kind: 'mark',
  class: 'cm-link-url',
};

/**
 * LinkReference mark decoration. For block-level definitions
 * (parent is Document), applies `cm-link-ref-def-label`; for
 * inline reference-style links, applies `cm-link-text`.
 */
export const linkReferenceConstruct: ConstructConfig = {
  id: 'link-reference',
  nodeName: 'LinkReference',
  kind: 'mark',
  class(node) {
    // Check if this is a block-level definition (parent is Document)
    // vs inline reference (parent is Paragraph or similar)
    const parent = node.parent;
    if (parent && parent.name === 'Document') {
      return 'cm-link-ref-def-label';
    }
    return 'cm-link-text';
  },
};
