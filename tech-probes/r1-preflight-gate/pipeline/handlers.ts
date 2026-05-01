/**
 * Handler tables: mdast → PM (for toProseMirror) and PM → mdast (for fromProseMirror).
 *
 * Tier A passthrough handlers, Tier B fidelity handlers reading node.data, and
 * Tier C custom/simplified handlers including the critical `definition` override.
 */
import { fromPmMark, fromPmNode, toPmMark, toPmNode } from '@handlewithcare/remark-prosemirror';
import { schema } from './schema';

// ──────────────────────────── mdast → PM ────────────────────────────

export const mdastToPmHandlers: Record<string, any> = {
  // Tier A passthrough
  paragraph: toPmNode(schema.nodes.paragraph),
  blockquote: toPmNode(schema.nodes.blockquote),
  table: toPmNode(schema.nodes.table),
  tableRow: toPmNode(schema.nodes.tableRow),
  tableCell: toPmNode(schema.nodes.tableCell, (n: any) => ({ align: n.align ?? null })),
  image: (node: any) =>
    schema.nodes.image.createAndFill({
      src: node.url ?? '',
      alt: node.alt ?? null,
      title: node.title ?? null,
    }),
  imageReference: (node: any) =>
    schema.nodes.image.createAndFill({
      src: '',
      alt: node.alt ?? null,
      title: null,
    }),
  inlineCode: (node: any) => schema.text(node.value, [schema.marks.code.create()]),

  // GFM delete mark
  delete: toPmMark(schema.marks.delete),

  // Directives — containerDirective nests block children
  containerDirective: toPmNode(schema.nodes.containerDirective, (n: any) => ({
    name: n.name,
    attributes: n.attributes ?? null,
    label: null,
  })),
  leafDirective: (node: any) =>
    schema.nodes.leafDirective.createAndFill({
      name: node.name,
      attributes: node.attributes ?? null,
      label: null,
    }),
  textDirective: (node: any) =>
    schema.nodes.textDirective.createAndFill({
      name: node.name,
      attributes: node.attributes ?? null,
      label: null,
    }),

  // Tier B fidelity
  emphasis: toPmMark(schema.marks.emphasis, (n: any) => ({
    sourceDelimiter: n.data?.sourceDelimiter ?? '*',
  })),
  strong: toPmMark(schema.marks.strong, (n: any) => ({
    sourceDelimiter: n.data?.sourceDelimiter ?? '**',
  })),
  heading: toPmNode(schema.nodes.heading, (n: any) => ({
    level: n.depth,
    sourceStyle: n.data?.sourceStyle ?? 'atx',
  })),
  code: (node: any) => {
    // Code block (fenced or indented)
    const attrs = {
      language: node.lang ?? null,
      sourceFenceChar: node.data?.sourceFenceChar ?? '`',
      sourceFenceLength: node.data?.sourceFenceLength ?? 3,
      meta: node.meta ?? null,
    };
    const textContent = node.value ? [schema.text(node.value)] : [];
    return schema.nodes.codeBlock.createAndFill(attrs, textContent);
  },
  thematicBreak: (node: any) =>
    schema.nodes.thematicBreak.createAndFill({
      sourceRaw: node.data?.sourceRaw ?? '---',
    }),
  break: (node: any) =>
    schema.nodes.hardBreak.createAndFill({
      sourceStyle: node.data?.sourceStyle ?? 'spaces',
    }),
  list: toPmNode(schema.nodes.list, (n: any) => ({
    ordered: !!n.ordered,
    start: n.start ?? 1,
    spread: !!n.spread,
    bulletMarker: n.data?.bulletMarker ?? null,
    listMarkerDelimiter: n.data?.listMarkerDelimiter ?? null,
  })),
  listItem: toPmNode(schema.nodes.listItem, (n: any) => ({
    checked: n.checked ?? null,
    spread: !!n.spread,
  })),

  // Tier C custom
  link: toPmMark(schema.marks.link, (n: any) => ({
    href: n.url ?? '',
    title: n.title ?? null,
    sourceStyle: 'inline',
    sourceRefLabel: null,
  })),
  linkReference: toPmMark(schema.marks.link, (n: any) => ({
    href: '',
    title: null,
    sourceStyle: n.referenceType ?? 'shortcut',
    sourceRefLabel: n.label ?? n.identifier ?? null,
  })),
  // Override library's built-in yaml ignore — preserve frontmatter in-tree
  yaml: (node: any) => schema.nodes.yaml.createAndFill({ value: node.value ?? '' }),

  // CRITICAL: override library's built-in ignore
  definition: (node: any) =>
    schema.nodes.linkDefinition.createAndFill({
      identifier: node.identifier ?? '',
      label: node.label ?? null,
      url: node.url ?? '',
      title: node.title ?? null,
    }),
  html: (node: any) => schema.nodes.htmlBlock.createAndFill({ value: node.value ?? '' }),

  // MDX
  mdxJsxFlowElement: (node: any) => {
    // Stringify back for fidelity
    return schema.nodes.mdxJsxFlowElement.createAndFill({
      name: node.name,
      attributes: node.attributes ?? null,
      value: node.__raw ?? '',
    });
  },
  mdxJsxTextElement: (node: any) =>
    schema.nodes.mdxJsxTextElement.createAndFill({
      name: node.name,
      attributes: node.attributes ?? null,
      value: node.__raw ?? '',
    }),
  mdxFlowExpression: (node: any) =>
    schema.nodes.mdxFlowExpression.createAndFill({ value: node.value ?? '' }),
  mdxTextExpression: (node: any) =>
    schema.nodes.mdxTextExpression.createAndFill({ value: node.value ?? '' }),
  mdxjsEsm: (node: any) => schema.nodes.mdxjsEsm.createAndFill({ value: node.value ?? '' }),

  wikiLink: (node: any) => {
    const labelText = node.alias ?? node.target + (node.section ? `#${node.section}` : '');
    const mark = schema.marks.wikiLink.create({
      target: node.target,
      alias: node.alias ?? null,
      section: node.section ?? null,
    });
    return schema.text(labelText, [mark]);
  },
};

// ──────────────────────────── PM → mdast ────────────────────────────

export const pmToMdastNodeHandlers: Record<string, any> = {
  paragraph: fromPmNode('paragraph'),
  blockquote: fromPmNode('blockquote'),
  heading: fromPmNode('heading', (n: any) => ({
    depth: n.attrs.level,
    data: { sourceStyle: n.attrs.sourceStyle },
  })),
  codeBlock: (pmNode: any) => {
    const value = pmNode.textContent ?? '';
    return {
      type: 'code',
      lang: pmNode.attrs.language ?? null,
      meta: pmNode.attrs.meta ?? null,
      value,
      data: {
        sourceFenceChar: pmNode.attrs.sourceFenceChar,
        sourceFenceLength: pmNode.attrs.sourceFenceLength,
      },
    };
  },
  thematicBreak: (pmNode: any) => ({
    type: 'thematicBreak',
    data: { sourceRaw: pmNode.attrs.sourceRaw },
  }),
  hardBreak: (pmNode: any) => ({
    type: 'break',
    data: { sourceStyle: pmNode.attrs.sourceStyle },
  }),
  list: fromPmNode('list', (n: any) => ({
    ordered: n.attrs.ordered,
    start: n.attrs.ordered ? n.attrs.start : null,
    spread: n.attrs.spread,
    data: {
      bulletMarker: n.attrs.bulletMarker,
      listMarkerDelimiter: n.attrs.listMarkerDelimiter,
    },
  })),
  listItem: fromPmNode('listItem', (n: any) => ({
    checked: n.attrs.checked,
    spread: n.attrs.spread,
  })),
  table: fromPmNode('table'),
  tableRow: fromPmNode('tableRow'),
  tableCell: fromPmNode('tableCell', (n: any) => ({ align: n.attrs.align })),
  image: (pmNode: any) => ({
    type: 'image',
    url: pmNode.attrs.src,
    alt: pmNode.attrs.alt,
    title: pmNode.attrs.title,
  }),
  htmlBlock: (pmNode: any) => ({ type: 'html', value: pmNode.attrs.value }),
  yaml: (pmNode: any) => ({ type: 'yaml', value: pmNode.attrs.value }),
  linkDefinition: (pmNode: any) => ({
    type: 'definition',
    identifier: pmNode.attrs.identifier,
    label: pmNode.attrs.label ?? pmNode.attrs.identifier,
    url: pmNode.attrs.url,
    title: pmNode.attrs.title,
  }),
  containerDirective: fromPmNode('containerDirective', (n: any) => ({
    name: n.attrs.name,
    attributes: n.attrs.attributes,
  })),
  leafDirective: (n: any) => ({
    type: 'leafDirective',
    name: n.attrs.name,
    attributes: n.attrs.attributes ?? {},
    children: [],
  }),
  textDirective: (n: any) => ({
    type: 'textDirective',
    name: n.attrs.name,
    attributes: n.attrs.attributes ?? {},
    children: [],
  }),
  mdxJsxFlowElement: (n: any) => ({
    type: 'html',
    value: n.attrs.value || `<${n.attrs.name} />`,
  }),
  mdxJsxTextElement: (n: any) => ({
    type: 'html',
    value: n.attrs.value || `<${n.attrs.name} />`,
  }),
  mdxFlowExpression: (n: any) => ({
    type: 'mdxFlowExpression',
    value: n.attrs.value,
  }),
  mdxTextExpression: (n: any) => ({
    type: 'mdxTextExpression',
    value: n.attrs.value,
  }),
  mdxjsEsm: (n: any) => ({ type: 'mdxjsEsm', value: n.attrs.value }),
};

export const pmToMdastMarkHandlers: Record<string, any> = {
  emphasis: fromPmMark('emphasis', (m: any) => ({
    data: { sourceDelimiter: m.attrs.sourceDelimiter },
  })),
  strong: fromPmMark('strong', (m: any) => ({
    data: { sourceDelimiter: m.attrs.sourceDelimiter },
  })),
  code: (_mark: any, _parent: any, children: any[]) => {
    // inlineCode = code mark on text
    // children here is mdastChildren with text
    const val = children.map((c) => (c.type === 'text' ? c.value : '')).join('');
    return { type: 'inlineCode', value: val };
  },
  delete: fromPmMark('delete'),
  wikiLink: (mark: any, _parent: any, _children: any[]) => {
    const target = mark.attrs.target;
    const section = mark.attrs.section;
    const alias = mark.attrs.alias;
    let text = '[[' + target;
    if (section) text += '#' + section;
    if (alias) text += '|' + alias;
    text += ']]';
    // Emit as `html` (phrasing raw) so stringify doesn't escape brackets
    return [{ type: 'html', value: text }];
  },
  link: (mark: any, _parent: any, children: any[]) => {
    const style = mark.attrs.sourceStyle;
    if (style === 'inline' || !style) {
      return {
        type: 'link',
        url: mark.attrs.href ?? '',
        title: mark.attrs.title ?? null,
        children,
      };
    }
    // reference link
    return {
      type: 'linkReference',
      identifier: (mark.attrs.sourceRefLabel ?? '').toLowerCase(),
      label: mark.attrs.sourceRefLabel,
      referenceType: style,
      children,
    };
  },
};
