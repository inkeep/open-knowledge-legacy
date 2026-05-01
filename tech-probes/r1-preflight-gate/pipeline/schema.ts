/**
 * ProseMirror schema for R1 probe. Includes nodes/marks matching the spec's
 * fidelity extension surface — enough to round-trip the 118 catalog + P0 cases.
 */

import type { MarkSpec, NodeSpec } from 'prosemirror-model';
import { Schema } from 'prosemirror-model';

const nodes: Record<string, NodeSpec> = {
  doc: { content: 'block*' },

  paragraph: {
    content: 'inline*',
    group: 'block',
    attrs: { sourceDelimiter: { default: null } },
  },

  heading: {
    content: 'inline*',
    group: 'block',
    defining: true,
    attrs: {
      level: { default: 1 },
      sourceStyle: { default: null }, // 'atx' | 'setext'
    },
  },

  blockquote: {
    content: 'block+',
    group: 'block',
  },

  thematicBreak: {
    group: 'block',
    atom: true,
    attrs: { sourceRaw: { default: null } },
  },

  codeBlock: {
    content: 'text*',
    group: 'block',
    code: true,
    defining: true,
    attrs: {
      language: { default: null },
      sourceFenceChar: { default: '`' }, // '`' | '~'
      sourceFenceLength: { default: 3 },
      meta: { default: null },
    },
  },

  list: {
    content: 'listItem+',
    group: 'block',
    attrs: {
      ordered: { default: false },
      start: { default: 1 },
      spread: { default: false },
      bulletMarker: { default: null }, // '-' | '*' | '+'
      listMarkerDelimiter: { default: null }, // '.' | ')'
    },
  },

  listItem: {
    content: 'paragraph block*',
    attrs: {
      checked: { default: null }, // null | true | false
      spread: { default: false },
    },
  },

  table: { content: 'tableRow+', group: 'block', isolating: true },
  tableRow: { content: 'tableCell+' },
  tableCell: { content: 'inline*', attrs: { align: { default: null } } },

  htmlBlock: {
    group: 'block',
    atom: true,
    attrs: { value: { default: '' } },
  },

  yaml: {
    group: 'block',
    atom: true,
    attrs: { value: { default: '' } },
  },

  linkDefinition: {
    group: 'block',
    atom: true,
    attrs: {
      identifier: { default: '' },
      label: { default: null },
      url: { default: '' },
      title: { default: null },
    },
  },

  // MDX
  mdxJsxFlowElement: {
    group: 'block',
    atom: true,
    attrs: {
      name: { default: null },
      attributes: { default: null },
      value: { default: '' }, // raw source
    },
  },
  mdxFlowExpression: {
    group: 'block',
    atom: true,
    attrs: { value: { default: '' } },
  },
  mdxjsEsm: {
    group: 'block',
    atom: true,
    attrs: { value: { default: '' } },
  },

  // Directives
  containerDirective: {
    content: 'block+',
    group: 'block',
    attrs: {
      name: { default: '' },
      attributes: { default: null },
      label: { default: null },
    },
  },
  leafDirective: {
    group: 'block',
    atom: true,
    attrs: { name: { default: '' }, attributes: { default: null }, label: { default: null } },
  },

  text: { group: 'inline' },

  image: {
    group: 'inline',
    inline: true,
    atom: true,
    attrs: {
      src: { default: '' },
      alt: { default: null },
      title: { default: null },
    },
  },

  hardBreak: {
    inline: true,
    group: 'inline',
    selectable: false,
    atom: true,
    attrs: { sourceStyle: { default: 'spaces' } }, // 'spaces' | 'backslash'
  },

  // MDX inline
  mdxJsxTextElement: {
    inline: true,
    group: 'inline',
    atom: true,
    attrs: { name: { default: null }, attributes: { default: null }, value: { default: '' } },
  },
  mdxTextExpression: {
    inline: true,
    group: 'inline',
    atom: true,
    attrs: { value: { default: '' } },
  },

  textDirective: {
    inline: true,
    group: 'inline',
    atom: true,
    attrs: { name: { default: '' }, attributes: { default: null }, label: { default: null } },
  },
};

const marks: Record<string, MarkSpec> = {
  emphasis: {
    attrs: { sourceDelimiter: { default: '*' } }, // '*' | '_'
  },
  strong: {
    attrs: { sourceDelimiter: { default: '**' } }, // '**' | '__'
  },
  code: {},
  delete: {}, // GFM strikethrough
  link: {
    attrs: {
      href: { default: '' },
      title: { default: null },
      sourceStyle: { default: 'inline' }, // inline | full | collapsed | shortcut
      sourceRefLabel: { default: null },
    },
  },
  wikiLink: {
    attrs: {
      target: { default: '' },
      alias: { default: null },
      section: { default: null },
    },
  },
};

export const schema = new Schema({ nodes, marks });
