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

  // Tier B basic (no fidelity attrs yet — those come in US-004)
  // emphasis / italic
  const emphMark = m.emphasis ?? m.italic;
  if (emphMark) handlers.emphasis = toPmMark(emphMark);

  // strong / bold
  const strongMark = m.strong ?? m.bold;
  if (strongMark) handlers.strong = toPmMark(strongMark);

  // heading
  if (n.heading) {
    handlers.heading = toPmNode(n.heading, (node: any) => ({
      level: node.depth,
    }));
  }

  // code block
  if (n.codeBlock) {
    handlers.code = (node: any) => {
      const textContent = node.value ? [schema.text(node.value)] : [];
      return n.codeBlock.createAndFill(
        { language: node.lang ?? null, meta: node.meta ?? null },
        textContent,
      );
    };
  }

  // thematicBreak / horizontalRule
  const hrNode = n.thematicBreak ?? n.horizontalRule;
  if (hrNode) {
    handlers.thematicBreak = () => hrNode.createAndFill();
  }

  // hardBreak / break
  if (n.hardBreak) {
    handlers.break = () => n.hardBreak.createAndFill();
  }

  // Lists
  const listNode = n.list ?? n.bulletList;
  const listItemNode = n.listItem;
  if (listNode) {
    handlers.list = toPmNode(listNode, (node: any) => ({
      ordered: !!node.ordered,
      start: node.start ?? 1,
      spread: !!node.spread,
    }));
  }
  if (listItemNode) {
    handlers.listItem = toPmNode(listItemNode, (node: any) => ({
      checked: node.checked ?? null,
      spread: !!node.spread,
    }));
  }

  // Link mark
  if (m.link) {
    handlers.link = toPmMark(m.link, (node: any) => ({
      href: node.url ?? '',
      title: node.title ?? null,
    }));
  }

  // HTML block
  if (n.htmlBlock) {
    handlers.html = (node: any) => n.htmlBlock.createAndFill({ value: node.value ?? '' });
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
    nodeHandlers.heading = fromPmNode('heading', (pmNode: any) => ({
      depth: pmNode.attrs.level,
    }));
  }

  if (n.codeBlock) {
    nodeHandlers.codeBlock = (pmNode: any) => ({
      type: 'code' as const,
      lang: pmNode.attrs.language ?? null,
      meta: pmNode.attrs.meta ?? null,
      value: pmNode.textContent ?? '',
    });
  }

  const hrNode = n.thematicBreak ?? n.horizontalRule;
  if (hrNode) {
    const name = n.thematicBreak ? 'thematicBreak' : 'horizontalRule';
    nodeHandlers[name] = () => ({ type: 'thematicBreak' as const });
  }

  if (n.hardBreak) {
    nodeHandlers.hardBreak = () => ({ type: 'break' as const });
  }

  // Lists
  const listNode = n.list ?? n.bulletList;
  if (listNode) {
    const listName = n.list ? 'list' : 'bulletList';
    nodeHandlers[listName] = fromPmNode('list', (pmNode: any) => ({
      ordered: pmNode.attrs.ordered ?? false,
      start: pmNode.attrs.ordered ? (pmNode.attrs.start ?? 1) : null,
      spread: pmNode.attrs.spread ?? false,
    }));
  }

  // orderedList → list with ordered: true (for pre-rename schema)
  if (n.orderedList && !n.list) {
    nodeHandlers.orderedList = fromPmNode('list', (pmNode: any) => ({
      ordered: true,
      start: pmNode.attrs.start ?? 1,
      spread: pmNode.attrs.spread ?? false,
    }));
  }

  if (n.listItem) {
    nodeHandlers.listItem = fromPmNode('listItem', (pmNode: any) => ({
      checked: pmNode.attrs.checked ?? null,
      spread: pmNode.attrs.spread ?? false,
    }));
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
    nodeHandlers.htmlBlock = (pmNode: any) => ({
      type: 'html' as const,
      value: pmNode.attrs.value,
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

  // Marks
  const emphMark = m.emphasis ?? m.italic;
  if (emphMark) {
    const name = m.emphasis ? 'emphasis' : 'italic';
    markHandlers[name] = fromPmMark('emphasis');
  }

  const strongMark = m.strong ?? m.bold;
  if (strongMark) {
    const name = m.strong ? 'strong' : 'bold';
    markHandlers[name] = fromPmMark('strong');
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
    markHandlers.link = (mark: any, _parent: any, children: any[]) => ({
      type: 'link' as const,
      url: mark.attrs.href ?? '',
      title: mark.attrs.title ?? null,
      children,
    });
  }

  return { nodeHandlers, markHandlers };
}
