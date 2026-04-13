/**
 * New MarkdownManager wrapping a unified + remark pipeline.
 *
 * Preserves the public API: parse(markdown) → JSONContent, serialize(json) → string.
 * Constructed with { extensions } (same as @tiptap/markdown's MarkdownManager).
 *
 * Handler table starts with Tier A passthrough + basic Tier B coverage.
 * US-003 adds position-slice walker, US-004 fills full handler table,
 * US-005 adds serialize-side fidelity handlers.
 */

import {
  type FromProseMirrorOptions,
  fromPmMark,
  fromPmNode,
  type RemarkProseMirrorOptions,
  toPmMark,
  toPmNode,
} from '@handlewithcare/remark-prosemirror';
import type { Extensions, JSONContent } from '@tiptap/core';
import { getSchema } from '@tiptap/core';
import { Node as PmNode, type Schema } from 'prosemirror-model';
import { parseMd, serializeMd } from './pipeline.ts';

// Ensure mdast type augmentations are loaded
import './mdast-augmentation.ts';

export interface MarkdownManagerOptions {
  extensions: Extensions;
}

export class MarkdownManager {
  private schema: Schema;
  private handlers: RemarkProseMirrorOptions['handlers'];
  private pmNodeHandlers: FromProseMirrorOptions<string, string>['nodeHandlers'];
  private pmMarkHandlers: FromProseMirrorOptions<string, string>['markHandlers'];

  constructor(options: MarkdownManagerOptions) {
    this.schema = getSchema(options.extensions);
    this.handlers = buildMdastToPmHandlers(this.schema);
    const { nodeHandlers, markHandlers } = buildPmToMdastHandlers(this.schema);
    this.pmNodeHandlers = nodeHandlers;
    this.pmMarkHandlers = markHandlers;
  }

  /**
   * Parse a markdown string to TipTap JSONContent.
   */
  parse(markdown: string): JSONContent {
    const doc = parseMd(markdown, {
      schema: this.schema,
      handlers: this.handlers,
      pmNodeHandlers: this.pmNodeHandlers,
      pmMarkHandlers: this.pmMarkHandlers,
    });
    return doc.toJSON() as JSONContent;
  }

  /**
   * Serialize TipTap JSONContent to a markdown string.
   */
  serialize(json: JSONContent): string {
    const doc = PmNode.fromJSON(this.schema, json);
    return serializeMd(doc, {
      schema: this.schema,
      handlers: this.handlers,
      pmNodeHandlers: this.pmNodeHandlers,
      pmMarkHandlers: this.pmMarkHandlers,
    });
  }
}

// ──────────────────────────── mdast → PM handlers ────────────────────────────
//
// Tier A passthrough + basic Tier B (enough for plain markdown).
// Full handler table populated in US-004.

function buildMdastToPmHandlers(schema: Schema): RemarkProseMirrorOptions['handlers'] {
  const n = schema.nodes;
  const m = schema.marks;

  const handlers: Record<string, unknown> = {};

  // Tier A passthrough
  if (n.paragraph) handlers.paragraph = toPmNode(n.paragraph);
  if (n.blockquote) handlers.blockquote = toPmNode(n.blockquote);

  // Table
  if (n.table) handlers.table = toPmNode(n.table);
  if (n.tableRow) handlers.tableRow = toPmNode(n.tableRow);
  // tableCell + tableHeader: mdast has only tableCell, PM may have both
  if (n.tableCell) {
    handlers.tableCell = (node: any, _: any, state: any) => {
      const children = state.all(node);
      // First row cells → tableHeader if the schema has it, otherwise tableCell
      const nodeType = n.tableHeader ?? n.tableCell;
      // We'll refine header detection in US-004; for now use tableCell
      return n.tableCell.createAndFill(null, children);
    };
  }

  // Image
  if (n.image) {
    handlers.image = (node: any) =>
      n.image.createAndFill({
        src: node.url ?? '',
        alt: node.alt ?? null,
        title: node.title ?? null,
      });
    handlers.imageReference = (node: any) =>
      n.image.createAndFill({
        src: '',
        alt: node.alt ?? null,
        title: null,
      });
  }

  // Inline code → code mark on text
  if (m.code) {
    handlers.inlineCode = (node: any) => schema.text(node.value, [m.code.create()]);
  }

  // GFM strikethrough
  const strikeMark = m.strike ?? m.delete;
  if (strikeMark) handlers.delete = toPmMark(strikeMark);

  // ── Tier B fidelity handlers — read node.data.* from position-slice walker ──

  // emphasis / italic — read sourceDelimiter → map to schema attr name
  const emphMark = m.emphasis ?? m.italic;
  if (emphMark) {
    // Detect attr name: 'sourceDelimiter' (post-rename) or 'emphDelimiter' (pre-rename)
    const emphAttr = emphMark.spec.attrs?.sourceDelimiter ? 'sourceDelimiter' : 'emphDelimiter';
    handlers.emphasis = toPmMark(emphMark, (node: any) => ({
      [emphAttr]: node.data?.sourceDelimiter ?? '*',
    }));
  }

  // strong / bold — read sourceDelimiter → map to schema attr name
  const strongMark = m.strong ?? m.bold;
  if (strongMark) {
    const strongAttr = strongMark.spec.attrs?.sourceDelimiter
      ? 'sourceDelimiter'
      : 'strongDelimiter';
    handlers.strong = toPmMark(strongMark, (node: any) => ({
      [strongAttr]: node.data?.sourceDelimiter ?? '**',
    }));
  }

  // heading — read sourceStyle → map to schema attr name
  if (n.heading) {
    const headingStyleAttr = n.heading.spec.attrs?.sourceStyle ? 'sourceStyle' : 'headingStyle';
    handlers.heading = toPmNode(n.heading, (node: any) => ({
      level: node.depth,
      [headingStyleAttr]: node.data?.sourceStyle ?? 'atx',
    }));
  }

  // code block — read sourceFenceChar + sourceFenceLength → map to schema attr names
  if (n.codeBlock) {
    const fenceCharAttr = n.codeBlock.spec.attrs?.sourceFenceChar
      ? 'sourceFenceChar'
      : 'fenceDelimiter';
    const fenceLenAttr = n.codeBlock.spec.attrs?.sourceFenceLength
      ? 'sourceFenceLength'
      : 'fenceLength';
    handlers.code = (node: any) => {
      const textContent = node.value ? [schema.text(node.value)] : [];
      return n.codeBlock.createAndFill(
        {
          language: node.lang ?? null,
          meta: node.meta ?? null,
          [fenceCharAttr]: node.data?.sourceFenceChar ?? '`',
          [fenceLenAttr]: node.data?.sourceFenceLength ?? 3,
        },
        textContent,
      );
    };
  }

  // thematicBreak / horizontalRule — read sourceRaw → map to schema attr name
  const hrNode = n.thematicBreak ?? n.horizontalRule;
  if (hrNode) {
    const hrAttr = hrNode.spec.attrs?.sourceRaw ? 'sourceRaw' : 'horizontalRuleRaw';
    handlers.thematicBreak = (node: any) =>
      hrNode.createAndFill({
        [hrAttr]: node.data?.sourceRaw ?? '---',
      });
  }

  // hardBreak / break — read sourceStyle → map to schema attr name
  if (n.hardBreak) {
    const breakAttr = n.hardBreak.spec.attrs?.sourceStyle ? 'sourceStyle' : 'hardBreakStyle';
    handlers.break = (node: any) =>
      n.hardBreak.createAndFill({
        [breakAttr]: node.data?.sourceStyle ?? 'spaces',
      });
  }

  // Lists — read bulletMarker + listMarkerDelimiter
  // Pre-rename: separate bulletList + orderedList; Post-rename: unified list
  const listItemNode = n.listItem;
  if (n.list) {
    // Unified list node (post D15)
    handlers.list = toPmNode(n.list, (node: any) => ({
      ordered: !!node.ordered,
      start: node.start ?? 1,
      spread: !!node.spread,
      bulletMarker: node.data?.bulletMarker ?? null,
      listMarkerDelimiter: node.data?.listMarkerDelimiter ?? null,
    }));
  } else {
    // Pre-rename: route mdast list to bulletList or orderedList based on node.ordered
    handlers.list = (node: any, _: any, state: any) => {
      const children = state.all(node);
      if (node.ordered && n.orderedList) {
        return n.orderedList.createAndFill(
          {
            start: node.start ?? 1,
            listMarkerDelimiter: node.data?.listMarkerDelimiter ?? '.',
            ...(n.orderedList.spec.attrs?.loose != null ? { loose: !!node.spread } : {}),
          },
          children,
        );
      }
      if (n.bulletList) {
        return n.bulletList.createAndFill(
          {
            bulletMarker: node.data?.bulletMarker ?? '-',
            ...(n.bulletList.spec.attrs?.loose != null ? { loose: !!node.spread } : {}),
          },
          children,
        );
      }
      return null;
    };
  }
  if (listItemNode) {
    handlers.listItem = toPmNode(listItemNode);
  }

  // ── Tier C custom handlers ──

  // Link mark — inline style
  if (m.link) {
    const styleAttr = m.link.spec.attrs?.sourceStyle ? 'sourceStyle' : 'linkStyle';
    const refAttr = m.link.spec.attrs?.sourceRefLabel ? 'sourceRefLabel' : 'refLabel';
    handlers.link = toPmMark(m.link, (node: any) => ({
      href: node.url ?? '',
      title: node.title ?? null,
      [styleAttr]: 'inline',
      [refAttr]: null,
    }));

    // linkReference → same link mark but with reference style info
    handlers.linkReference = toPmMark(m.link, (node: any) => ({
      href: '',
      title: null,
      [styleAttr]: node.referenceType ?? 'shortcut',
      [refAttr]: node.label ?? node.identifier ?? null,
    }));
  }

  // HTML block
  if (n.htmlBlock) {
    const htmlAttr = n.htmlBlock.spec.attrs?.value ? 'value' : 'content';
    handlers.html = (node: any) => n.htmlBlock.createAndFill({ [htmlAttr]: node.value ?? '' });
  }

  // Definition → linkDefinition atom (R12 CRITICAL override)
  if (n.linkDefinition) {
    handlers.definition = (node: any) =>
      n.linkDefinition.createAndFill({
        identifier: node.identifier ?? '',
        label: node.label ?? null,
        url: node.url ?? '',
        title: node.title ?? null,
      });
  }

  // MDX nodes — minimal passthrough (full coverage in US-008)
  // These need to exist to prevent "unknown markdown node" errors
  if (n.jsxComponent) {
    handlers.mdxJsxFlowElement = (node: any) =>
      n.jsxComponent.createAndFill({
        name: node.name,
        attributes: node.attributes ?? null,
        value: '',
      });
  }
  if (n.jsxInline) {
    handlers.mdxJsxTextElement = (node: any) =>
      n.jsxInline.createAndFill({
        name: node.name,
        attributes: node.attributes ?? null,
        value: '',
      });
  }
  // For MDX expressions and ESM, only register if schema has the node type
  if (n.mdxExpression) {
    handlers.mdxFlowExpression = (node: any) =>
      n.mdxExpression.createAndFill({ value: node.value ?? '' });
  }
  if (n.mdxInlineExpression) {
    handlers.mdxTextExpression = (node: any) =>
      n.mdxInlineExpression.createAndFill({ value: node.value ?? '' });
  }
  if (n.mdxEsm) {
    handlers.mdxjsEsm = (node: any) => n.mdxEsm.createAndFill({ value: node.value ?? '' });
  }

  // Frontmatter: keep ignored (handled via Y.Map, not PM schema)
  // yaml + toml are pre-ignored by the library — correct behavior

  return handlers as RemarkProseMirrorOptions['handlers'];
}

// ──────────────────────────── PM → mdast handlers ────────────────────────────

function buildPmToMdastHandlers(schema: Schema): {
  nodeHandlers: FromProseMirrorOptions<string, string>['nodeHandlers'];
  markHandlers: FromProseMirrorOptions<string, string>['markHandlers'];
} {
  const nodeHandlers: Record<string, any> = {};
  const markHandlers: Record<string, any> = {};
  const n = schema.nodes;
  const m = schema.marks;

  // Nodes
  if (n.paragraph) nodeHandlers.paragraph = fromPmNode('paragraph');
  if (n.blockquote) nodeHandlers.blockquote = fromPmNode('blockquote');

  if (n.heading) {
    const headingStyleAttr = n.heading.spec.attrs?.sourceStyle ? 'sourceStyle' : 'headingStyle';
    nodeHandlers.heading = fromPmNode('heading', (pmNode: any) => ({
      depth: pmNode.attrs.level,
      data: { sourceStyle: pmNode.attrs[headingStyleAttr] },
    }));
  }

  if (n.codeBlock) {
    const fenceCharAttr = n.codeBlock.spec.attrs?.sourceFenceChar
      ? 'sourceFenceChar'
      : 'fenceDelimiter';
    const fenceLenAttr = n.codeBlock.spec.attrs?.sourceFenceLength
      ? 'sourceFenceLength'
      : 'fenceLength';
    nodeHandlers.codeBlock = (pmNode: any) => ({
      type: 'code' as const,
      lang: pmNode.attrs.language ?? null,
      meta: pmNode.attrs.meta ?? null,
      value: pmNode.textContent ?? '',
      data: {
        sourceFenceChar: pmNode.attrs[fenceCharAttr],
        sourceFenceLength: pmNode.attrs[fenceLenAttr],
      },
    });
  }

  const hrNodeSer = n.thematicBreak ?? n.horizontalRule;
  if (hrNodeSer) {
    const name = n.thematicBreak ? 'thematicBreak' : 'horizontalRule';
    const hrAttr = hrNodeSer.spec.attrs?.sourceRaw ? 'sourceRaw' : 'horizontalRuleRaw';
    nodeHandlers[name] = (pmNode: any) => ({
      type: 'thematicBreak' as const,
      data: { sourceRaw: pmNode.attrs[hrAttr] },
    });
  }

  if (n.hardBreak) {
    const breakAttr = n.hardBreak.spec.attrs?.sourceStyle ? 'sourceStyle' : 'hardBreakStyle';
    nodeHandlers.hardBreak = (pmNode: any) => ({
      type: 'break' as const,
      data: { sourceStyle: pmNode.attrs[breakAttr] },
    });
  }

  // Lists
  if (n.list) {
    nodeHandlers.list = fromPmNode('list', (pmNode: any) => ({
      ordered: pmNode.attrs.ordered ?? false,
      start: pmNode.attrs.ordered ? (pmNode.attrs.start ?? 1) : null,
      spread: pmNode.attrs.spread ?? false,
      data: {
        bulletMarker: pmNode.attrs.bulletMarker,
        listMarkerDelimiter: pmNode.attrs.listMarkerDelimiter,
      },
    }));
  } else {
    if (n.bulletList) {
      nodeHandlers.bulletList = fromPmNode('list', (pmNode: any) => ({
        ordered: false,
        spread: pmNode.attrs.loose ?? false,
        data: { bulletMarker: pmNode.attrs.bulletMarker },
      }));
    }
    if (n.orderedList) {
      nodeHandlers.orderedList = fromPmNode('list', (pmNode: any) => ({
        ordered: true,
        start: pmNode.attrs.start ?? 1,
        spread: pmNode.attrs.loose ?? false,
        data: { listMarkerDelimiter: pmNode.attrs.listMarkerDelimiter },
      }));
    }
  }

  if (n.listItem) {
    nodeHandlers.listItem = fromPmNode('listItem');
  }

  // Table
  if (n.table) nodeHandlers.table = fromPmNode('table');
  if (n.tableRow) nodeHandlers.tableRow = fromPmNode('tableRow');
  if (n.tableCell) nodeHandlers.tableCell = fromPmNode('tableCell');
  if (n.tableHeader) nodeHandlers.tableHeader = fromPmNode('tableCell');

  // Image
  if (n.image) {
    nodeHandlers.image = (pmNode: any) => ({
      type: 'image' as const,
      url: pmNode.attrs.src,
      alt: pmNode.attrs.alt,
      title: pmNode.attrs.title,
    });
  }

  // HTML block
  if (n.htmlBlock) {
    const htmlAttr = n.htmlBlock.spec.attrs?.value ? 'value' : 'content';
    nodeHandlers.htmlBlock = (pmNode: any) => ({
      type: 'html' as const,
      value: pmNode.attrs[htmlAttr],
    });
  }

  // Link definition
  if (n.linkDefinition) {
    nodeHandlers.linkDefinition = (pmNode: any) => ({
      type: 'definition' as const,
      identifier: pmNode.attrs.identifier,
      label: pmNode.attrs.label ?? pmNode.attrs.identifier,
      url: pmNode.attrs.url,
      title: pmNode.attrs.title,
    });
  }

  // Marks — carry fidelity data back to mdast
  const serEmphMark = m.emphasis ?? m.italic;
  if (serEmphMark) {
    const name = m.emphasis ? 'emphasis' : 'italic';
    const emphAttr = serEmphMark.spec.attrs?.sourceDelimiter ? 'sourceDelimiter' : 'emphDelimiter';
    markHandlers[name] = fromPmMark('emphasis', (mark: any) => ({
      data: { sourceDelimiter: mark.attrs[emphAttr] },
    }));
  }

  const serStrongMark = m.strong ?? m.bold;
  if (serStrongMark) {
    const name = m.strong ? 'strong' : 'bold';
    const strongAttr = serStrongMark.spec.attrs?.sourceDelimiter
      ? 'sourceDelimiter'
      : 'strongDelimiter';
    markHandlers[name] = fromPmMark('strong', (mark: any) => ({
      data: { sourceDelimiter: mark.attrs[strongAttr] },
    }));
  }

  if (m.code) {
    markHandlers.code = (_mark: any, _parent: any, children: any[]) => {
      const val = children.map((c: any) => (c.type === 'text' ? c.value : '')).join('');
      return { type: 'inlineCode' as const, value: val };
    };
  }

  const strikeMark = m.strike ?? m.delete;
  if (strikeMark) {
    const name = m.strike ? 'strike' : 'delete';
    markHandlers[name] = fromPmMark('delete');
  }

  if (m.link) {
    const linkStyleAttr = m.link.spec.attrs?.sourceStyle ? 'sourceStyle' : 'linkStyle';
    const linkRefAttr = m.link.spec.attrs?.sourceRefLabel ? 'sourceRefLabel' : 'refLabel';
    markHandlers.link = (mark: any, _parent: any, children: any[]) => {
      const style = mark.attrs[linkStyleAttr];
      if (style === 'inline' || !style) {
        return {
          type: 'link' as const,
          url: mark.attrs.href ?? '',
          title: mark.attrs.title ?? null,
          children,
        };
      }
      // Reference link
      return {
        type: 'linkReference' as const,
        identifier: (mark.attrs[linkRefAttr] ?? '').toLowerCase(),
        label: mark.attrs[linkRefAttr],
        referenceType: style,
        children,
      };
    };
  }

  return { nodeHandlers, markHandlers };
}
