/**
 * MarkdownManager — wraps the unified + remark pipeline with a stable
 * parse/serialize API (`parse(markdown) → JSONContent`, `serialize(json) → string`).
 *
 * Constructed with `{ extensions }`, the TipTap extension list used to derive
 * the target ProseMirror schema.
 *
 * Handler organization:
 *   - Tier A passthrough + Tier B basic coverage: this file.
 *   - Position-slice walker for source-form recovery: `position-slice.ts`.
 *   - Full PM↔mdast handler table: `handlers.ts`.
 *   - Serialize-side fidelity overrides: `to-markdown-handlers.ts`.
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
import type { Mark as PmMark, Node as PmNode, Schema } from '@tiptap/pm/model';
import type {
  Break,
  Code,
  Definition,
  Emphasis,
  Heading,
  Html,
  Image,
  ImageReference,
  InlineCode,
  Link,
  LinkReference,
  List,
  ListItem,
  Nodes as MdastNodes,
  Parent as MdastParent,
  Root as MdastRoot,
  Paragraph,
  Strong,
  Text,
  ThematicBreak,
} from 'mdast';
import type {
  MdxFlowExpression,
  MdxJsxAttribute,
  MdxJsxExpressionAttribute,
  MdxJsxFlowElement,
  MdxJsxTextElement,
  MdxTextExpression,
} from 'mdast-util-mdx';
import type { Processor } from 'unified';
import { createRegistry } from '../registry/index.ts';
import type { PropDef } from '../registry/types.ts';
import type { WikiLinkEmbedMdast, WikiLinkMdast } from './mdast-augmentation.ts';
import { parseWithFallback } from './parse-with-fallback.ts';
import {
  createParseProcessor,
  createSerializeProcessor,
  parseMd,
  parseMdToMdast,
  serializeMd,
} from './pipeline.ts';
import { toMarkdownHandlers } from './to-markdown-handlers.ts';

interface MdastToPmState {
  all: (node: MdastNodes) => PmNode[];
  one: (node: MdastNodes, parent: MdastParent | undefined) => PmNode | PmNode[] | null;
}

import './mdast-augmentation.ts';

interface MarkdownManagerOptions {
  extensions: Extensions;
}

interface ParseContext {
  resolveEmbed?: (target: string, sourcePath: string) => string | null;
  sourcePath?: string;
}

type ParseContextHolder = { current: ParseContext };

export class MarkdownManager {
  private schema: Schema;
  private handlers: RemarkProseMirrorOptions['handlers'];
  private pmNodeHandlers: FromProseMirrorOptions<string, string>['nodeHandlers'];
  private pmMarkHandlers: FromProseMirrorOptions<string, string>['markHandlers'];
  private parseProcessor: Processor;
  private serializeProcessor: Processor;
  private parseCtx: ParseContextHolder = { current: {} };

  constructor(options: MarkdownManagerOptions) {
    this.schema = getSchema(options.extensions);
    this.handlers = buildMdastToPmHandlers(this.schema, this.parseCtx);
    const { nodeHandlers, markHandlers } = buildPmToMdastHandlers(this.schema);
    this.pmNodeHandlers = nodeHandlers;
    this.pmMarkHandlers = markHandlers;

    this.parseProcessor = createParseProcessor({
      schema: this.schema,
      handlers: this.handlers,
      pmNodeHandlers: this.pmNodeHandlers,
      pmMarkHandlers: this.pmMarkHandlers,
    });
    this.serializeProcessor = createSerializeProcessor({
      schema: this.schema,
      handlers: this.handlers,
      pmNodeHandlers: this.pmNodeHandlers,
      pmMarkHandlers: this.pmMarkHandlers,
      toMarkdownHandlers,
    });
  }

  parse(markdown: string, opts?: ParseContext): JSONContent {
    if (!markdown.trim()) {
      return {
        type: 'doc',
        content: [{ type: 'paragraph', content: [] }],
      };
    }
    this.parseCtx.current = opts ?? {};
    try {
      const doc = parseMd(markdown, this.parseProcessor);
      return doc.toJSON() as JSONContent;
    } finally {
      this.parseCtx.current = {};
    }
  }

  parseToMdast(markdown: string): MdastRoot {
    if (!markdown.trim()) {
      return { type: 'root', children: [] };
    }
    return parseMdToMdast(markdown, this.parseProcessor);
  }

  parseWithFallback(markdown: string, opts?: ParseContext): JSONContent {
    if (!markdown.trim()) {
      return { type: 'doc', content: [{ type: 'paragraph', content: [] }] };
    }
    return parseWithFallback(markdown, { parse: (md) => this.parse(md, opts) });
  }

  serialize(json: JSONContent): string {
    let doc: PmNode;
    try {
      doc = this.schema.nodeFromJSON(json) as PmNode;
    } catch (err) {
      const msg = `MarkdownManager.serialize() failed: schema rejected JSONContent (type=${json.type}, childCount=${json.content?.length ?? 0})`;
      throw new Error(msg, { cause: err });
    }
    return serializeMd(doc, this.serializeProcessor, {
      schema: this.schema,
      pmNodeHandlers: this.pmNodeHandlers,
      pmMarkHandlers: this.pmMarkHandlers,
    });
  }
}

const registry = createRegistry();

function destructureAttrs(
  attributes: Array<MdxJsxAttribute | MdxJsxExpressionAttribute>,
  props: PropDef[],
): Record<string, unknown> {
  const propMap = new Map<string, PropDef>();
  for (const p of props) {
    propMap.set(p.name, p);
  }

  const result: Record<string, unknown> = {};

  for (const attr of attributes) {
    if (attr.type === 'mdxJsxExpressionAttribute') continue;

    const name = attr.name;
    const propDef = propMap.get(name);

    if (attr.value === null || attr.value === undefined) {
      result[name] = true;
      continue;
    }

    if (typeof attr.value === 'string') {
      if (propDef?.type === 'number') {
        const num = Number(attr.value);
        result[name] = Number.isNaN(num) ? attr.value : num;
      } else if (propDef?.type === 'boolean') {
        result[name] = attr.value === 'true';
      } else {
        result[name] = attr.value;
      }
      continue;
    }

    const exprValue = attr.value.value;
    try {
      const parsed = JSON.parse(exprValue);
      result[name] = parsed;
    } catch {
      result[name] = exprValue;
    }
  }

  return result;
}

function hasDirtyDescendant(node: PmNode): boolean {
  let found = false;
  node.descendants((child) => {
    if (found) return false; // short-circuit
    if (child.type.name === 'jsxInline') return false; // skip jsxInline subtrees
    if (child.type.name === 'jsxComponent' && child.attrs.sourceDirty) {
      found = true;
      return false;
    }
    return true;
  });
  return found;
}

function effectiveDirty(node: PmNode): boolean {
  return node.attrs.sourceDirty || hasDirtyDescendant(node);
}

function isEmptyMdastParagraph(node: MdastNodes): boolean {
  if (node.type !== 'paragraph') return false;
  const children = node.children ?? [];
  if (children.length === 0) return true;
  return children.every((c) => c.type === 'text' && (c as Text).value === '');
}

export function wrapAsInlineCode(children: MdastNodes[]): MdastNodes {
  if (children.length === 0) {
    return { type: 'inlineCode', value: '' } as unknown as MdastNodes;
  }
  if (children.every((c) => c.type === 'text')) {
    const val = children.map((c) => (c as Text).value).join('');
    return { type: 'inlineCode', value: val } as unknown as MdastNodes;
  }
  if (children.length === 1 && 'children' in children[0]) {
    const wrapper = children[0] as MdastNodes & { children: MdastNodes[] };
    return {
      ...wrapper,
      children: [wrapAsInlineCode(wrapper.children)],
    } as MdastNodes;
  }
  return {
    type: 'inlineCode',
    value: extractTextFromMdastNodes(children),
  } as unknown as MdastNodes;
}

function extractTextFromMdastNodes(nodes: MdastNodes[]): string {
  let out = '';
  for (const node of nodes) {
    if (node.type === 'text') {
      out += (node as Text).value;
    } else if ('children' in node && Array.isArray((node as { children?: unknown }).children)) {
      out += extractTextFromMdastNodes((node as { children: MdastNodes[] }).children);
    } else if ('value' in node && typeof (node as { value?: unknown }).value === 'string') {
      out += (node as { value: string }).value;
    }
  }
  return out;
}

import {
  AUDIO_EXTENSIONS,
  IMAGE_EXTENSIONS,
  PDF_EXTENSIONS,
  VIDEO_EXTENSIONS,
  WIKI_EMBED_EXTENSIONS,
} from '../constants/upload.ts';

const WIKI_EMBED_IMAGE_EXTS = IMAGE_EXTENSIONS;

import { extensionOf } from '../utils/extension.ts';

function buildMdastToPmHandlers(
  schema: Schema,
  parseCtx: ParseContextHolder,
): RemarkProseMirrorOptions['handlers'] {
  const n = schema.nodes;
  const m = schema.marks;

  const handlers: Record<string, unknown> = {};

  if (n.paragraph) {
    handlers.paragraph = (node: Paragraph, _: MdastParent, state: MdastToPmState) => {
      const flatChildren = state.all(node).flat();
      const hasBlockChildren = flatChildren.some((c) => c?.isBlock && !c?.isInline);
      const hasInlineChildren = flatChildren.some(
        (c) => c?.isInline || c?.isText || c?.isTextblock,
      );
      if (hasBlockChildren && !hasInlineChildren) {
        return flatChildren.length === 1 ? flatChildren[0] : flatChildren;
      }
      if (hasBlockChildren && hasInlineChildren) {
        const inlineOnly = flatChildren.filter((c) => !c?.isBlock || c?.isInline);
        const blockOnly = flatChildren.filter((c) => c?.isBlock && !c?.isInline);
        const result: PmNode[] = [];
        const para = n.paragraph.createAndFill(null, inlineOnly.length > 0 ? inlineOnly : null);
        if (para) result.push(para);
        result.push(...blockOnly);
        return result.length === 1 ? result[0] : result;
      }
      return n.paragraph.createAndFill(null, flatChildren.length > 0 ? flatChildren : null);
    };
  }
  if (n.blockquote) handlers.blockquote = toPmNode(n.blockquote);

  if (n.table) handlers.table = toPmNode(n.table);
  if (n.tableRow) handlers.tableRow = toPmNode(n.tableRow);
  if (n.tableCell) {
    const cellHandler =
      (nodeType: (typeof n)[string]) =>
      (node: MdastNodes, _: MdastParent, state: MdastToPmState) => {
        const children = state.all(node).flat();
        if (children.length > 0 && n.paragraph) {
          const para = n.paragraph.create(null, children);
          return nodeType.createAndFill(null, [para]);
        }
        return nodeType.createAndFill(null, null);
      };
    handlers.tableCell = cellHandler(n.tableCell);
    if (n.tableHeader) {
    }
  }

  if (n.image) {
    handlers.image = (node: Image) =>
      n.image.createAndFill({
        src: node.url ?? '',
        alt: node.alt ?? null,
        title: node.title ?? null,
      });
    handlers.imageReference = (node: ImageReference) =>
      n.image.createAndFill({
        src: '',
        alt: node.alt ?? null,
        title: null,
      });
  }

  if (m.escapeMark) {
    handlers.text = (node: Text) => {
      const value: string = node.value ?? '';
      const sourceRaw = typeof node.data?.sourceRaw === 'string' ? node.data.sourceRaw : null;
      if (!value && !sourceRaw) return null;
      if (sourceRaw) {
        const normalized = value.replaceAll('\u00A0', ' ');
        return m.sourceLiteral
          ? schema.text(normalized, [m.sourceLiteral.create({ sourceRaw })])
          : schema.text(normalized);
      }
      const escapedChars: Array<{ offset: number; char: string }> | undefined =
        node.data?.escapedChars;
      if (!escapedChars?.length) {
        return schema.text(value.replaceAll('\u00A0', ' '));
      }
      const fragments: PmNode[] = [];
      let lastIdx = 0;
      for (const { offset } of escapedChars) {
        if (offset > lastIdx) {
          const segment = value.slice(lastIdx, offset).replaceAll('\u00A0', ' ');
          if (segment) fragments.push(schema.text(segment));
        }
        if (offset < value.length) {
          const escapedChar = value[offset].replaceAll('\u00A0', ' ');
          fragments.push(schema.text(escapedChar, [m.escapeMark.create()]));
          lastIdx = offset + 1;
        }
      }
      if (lastIdx < value.length) {
        const remaining = value.slice(lastIdx).replaceAll('\u00A0', ' ');
        if (remaining) fragments.push(schema.text(remaining));
      }
      return fragments.length === 1 ? fragments[0] : fragments;
    };
  }

  if (m.code) {
    handlers.inlineCode = (node: InlineCode) => schema.text(node.value, [m.code.create()]);
  }

  const strikeMark = m.strike ?? m.delete;
  if (strikeMark) handlers.delete = toPmMark(strikeMark);

  if (m.highlight) handlers.mark = toPmMark(m.highlight);

  if (m.emphasis) {
    handlers.emphasis = toPmMark(m.emphasis, (node: Emphasis) => ({
      sourceDelimiter: node.data?.sourceDelimiter ?? '*',
    }));
  }

  if (m.strong) {
    handlers.strong = toPmMark(m.strong, (node: Strong) => ({
      sourceDelimiter: node.data?.sourceDelimiter ?? '**',
    }));
  }

  if (n.heading) {
    handlers.heading = toPmNode(n.heading, (node: Heading) => ({
      level: node.depth,
      headingStyle: node.data?.sourceStyle ?? 'atx',
    }));
  }

  if (n.codeBlock) {
    handlers.code = (node: Code) => {
      const textContent = node.value ? [schema.text(node.value)] : [];
      return n.codeBlock.createAndFill(
        {
          language: node.lang ?? null,
          meta: node.meta ?? null,
          fenceDelimiter: node.data?.sourceFenceChar ?? '`',
          fenceLength: node.data?.sourceFenceLength ?? 3,
        },
        textContent,
      );
    };
  }

  if (n.thematicBreak) {
    handlers.thematicBreak = (node: ThematicBreak) =>
      n.thematicBreak.createAndFill({
        sourceRaw: node.data?.sourceRaw ?? '---',
      });
  }

  if (n.hardBreak) {
    handlers.break = (node: Break) =>
      n.hardBreak.createAndFill({
        hardBreakStyle: node.data?.sourceStyle ?? 'spaces',
      });
  }

  if (n.list) {
    handlers.list = toPmNode(n.list, (node: List) => ({
      ordered: !!node.ordered,
      start: node.start ?? 1,
      spread: !!node.spread,
      bulletMarker: node.data?.bulletMarker ?? null,
      listMarkerDelimiter: node.data?.listMarkerDelimiter ?? null,
    }));
  }
  if (n.listItem) {
    handlers.listItem = toPmNode(n.listItem, (node: ListItem) => ({
      checked: node.checked ?? null,
      spread: !!node.spread,
    }));
  }

  if (m.link) {
    const sourceLiteralMark = m.sourceLiteral;
    handlers.link = (node: Link, _parent: MdastParent, state: MdastToPmState) => {
      if ((node.children ?? []).length === 0) {
        const raw =
          typeof node.data?.sourceRaw === 'string' ? node.data.sourceRaw : `[](${node.url ?? ''})`;
        return raw
          ? sourceLiteralMark
            ? schema.text(raw, [sourceLiteralMark.create({ sourceRaw: raw })])
            : schema.text(raw)
          : null;
      }
      const children = state.all(node).flat();
      const mark = m.link.create({
        href: node.url ?? '',
        title: node.title ?? null,
        linkStyle: node.data?.sourceStyle ?? 'inline',
        refLabel: null,
      });
      return children.map((child) => child.mark(mark.addToSet(child.marks)));
    };

    handlers.linkReference = (node: LinkReference, _parent: MdastParent, state: MdastToPmState) => {
      if ((node.children ?? []).length === 0) {
        const raw =
          typeof node.data?.sourceRaw === 'string'
            ? node.data.sourceRaw
            : `[${node.label ?? ''}][${node.identifier ?? ''}]`;
        return raw
          ? sourceLiteralMark
            ? schema.text(raw, [sourceLiteralMark.create({ sourceRaw: raw })])
            : schema.text(raw)
          : null;
      }
      const children = state.all(node).flat();
      const mark = m.link.create({
        href: '',
        title: null,
        linkStyle: node.referenceType ?? 'shortcut',
        refLabel: node.label ?? node.identifier ?? null,
      });
      return children.map((child) => child.mark(mark.addToSet(child.marks)));
    };
  }

  if (n.htmlBlock) {
    handlers.html = (node: Html) => n.htmlBlock.createAndFill({ content: node.value ?? '' });
  }

  const linkDefNode = n.linkDefinition ?? n.linkRefDef;
  if (linkDefNode) {
    const hasUrlAttr = !!linkDefNode.spec.attrs?.url;
    const hasHrefAttr = !!linkDefNode.spec.attrs?.href;
    const hasIdentifierAttr = !!linkDefNode.spec.attrs?.identifier;
    handlers.definition = (node: Definition) => {
      const attrs: Record<string, unknown> = {
        title: node.title ?? null,
      };
      if (hasIdentifierAttr) {
        attrs.identifier = node.identifier ?? '';
        attrs.label = node.label ?? node.identifier ?? '';
      } else {
        attrs.label = node.label ?? node.identifier ?? '';
      }
      if (hasUrlAttr) attrs.url = node.url ?? '';
      else if (hasHrefAttr) attrs.href = node.url ?? '';
      return linkDefNode.createAndFill(attrs);
    };
  }

  if (n.jsxComponent) {
    const rawFromData = (data: unknown): string | undefined => {
      if (data && typeof data === 'object' && 'sourceRaw' in data) {
        const raw = (data as { sourceRaw?: unknown }).sourceRaw;
        if (typeof raw === 'string') return raw;
      }
      return undefined;
    };

    handlers.mdxJsxFlowElement = (
      node: MdxJsxFlowElement,
      _: MdastParent,
      state: MdastToPmState,
    ) => {
      const name = node.name ?? '';
      const descriptor = registry.getOrWildcard(name);
      const structuredAttrs = destructureAttrs(node.attributes, descriptor.props);
      const children = state.all(node).flat();

      return n.jsxComponent.createAndFill(
        {
          componentName: name,
          kind: 'element',
          attributes: node.attributes,
          sourceRaw: rawFromData(node.data) ?? '',
          sourceDirty: false,
          props: structuredAttrs,
        },
        children.length ? children : undefined,
      );
    };
    const extractStringAttr = (node: MdxJsxTextElement, attrName: string): string | null => {
      const attr = node.attributes?.find(
        (a): a is MdxJsxAttribute => a.type === 'mdxJsxAttribute' && a.name === attrName,
      );
      if (!attr) return null;
      if (typeof attr.value === 'string') return attr.value;
      return null;
    };

    handlers.mdxJsxTextElement = (node: MdxJsxTextElement) => {
      if (node.name === 'InlineMath' && n.mathInline) {
        const formula = extractStringAttr(node, 'formula') ?? '';
        const id = extractStringAttr(node, 'id');
        return n.mathInline.create({ formula, id: id ?? null });
      }
      if (node.name === 'Tag' && n.tag) {
        const value = extractStringAttr(node, 'value') ?? '';
        return n.tag.create({ value });
      }
      if (n.jsxInline) {
        const raw = rawFromData(node.data) ?? '';
        return n.jsxInline.createAndFill({}, raw ? [schema.text(raw)] : null);
      }
      return n.jsxComponent.createAndFill({
        sourceRaw: rawFromData(node.data) ?? '',
      });
    };

    handlers.mdxFlowExpression = (node: MdxFlowExpression) => {
      const raw = rawFromData(node.data) ?? `{${node.value ?? ''}}`;
      return n.jsxComponent.createAndFill({
        kind: 'expression',
        sourceRaw: raw,
        sourceDirty: false,
      });
    };
    handlers.mdxTextExpression = (node: MdxTextExpression) => {
      const source = rawFromData(node.data) ?? `{${node.value ?? ''}}`;
      return schema.text(source);
    };
  }

  if (n.wikiLink) {
    handlers.wikiLink = (node: WikiLinkMdast) =>
      n.wikiLink.createAndFill({
        target: node.data?.target ?? '',
        alias: node.data?.alias ?? null,
        anchor: node.data?.anchor ?? null,
      });
  }

  if (n.tag) {
    handlers.tag = (node: { type: 'tag'; value: string }) =>
      n.tag.createAndFill({ value: node.value });
  }

  if (n.wikiLinkEmbed) {
    handlers.wikiLinkEmbed = (node: WikiLinkEmbedMdast, parent?: MdastParent) => {
      const target = node.data?.target ?? '';
      const alias = node.data?.alias ?? null;
      const anchor = node.data?.anchor ?? null;
      const ext = extensionOf(target);
      const { resolveEmbed, sourcePath } = parseCtx.current;
      const resolved =
        resolveEmbed && sourcePath ? (resolveEmbed(target, sourcePath) ?? null) : null;

      const srcOrTarget = resolved ? `/${resolved}` : target;

      const isBlockContext =
        parent?.type === 'paragraph' &&
        Array.isArray(parent.children) &&
        parent.children.length === 1;

      if (
        isBlockContext &&
        WIKI_EMBED_IMAGE_EXTS.has(ext) &&
        n.jsxComponent &&
        registry.has('WikiEmbedImage')
      ) {
        return n.jsxComponent.createAndFill({
          componentName: 'WikiEmbedImage',
          kind: 'element',
          attributes: [],
          sourceRaw: '',
          sourceDirty: false,
          props: { src: srcOrTarget, alt: alias ?? target, target, anchor, alias },
        });
      }
      if (
        isBlockContext &&
        VIDEO_EXTENSIONS.has(ext) &&
        n.jsxComponent &&
        registry.has('WikiEmbedVideo')
      ) {
        return n.jsxComponent.createAndFill({
          componentName: 'WikiEmbedVideo',
          kind: 'element',
          attributes: [],
          sourceRaw: '',
          sourceDirty: false,
          props: { src: srcOrTarget, title: alias ?? target, target, anchor, alias },
        });
      }
      if (
        isBlockContext &&
        AUDIO_EXTENSIONS.has(ext) &&
        n.jsxComponent &&
        registry.has('WikiEmbedAudio')
      ) {
        return n.jsxComponent.createAndFill({
          componentName: 'WikiEmbedAudio',
          kind: 'element',
          attributes: [],
          sourceRaw: '',
          sourceDirty: false,
          props: { src: srcOrTarget, title: alias ?? target, target, anchor, alias },
        });
      }
      if (
        isBlockContext &&
        PDF_EXTENSIONS.has(ext) &&
        n.jsxComponent &&
        registry.has('WikiEmbedPdf')
      ) {
        return n.jsxComponent.createAndFill({
          componentName: 'WikiEmbedPdf',
          kind: 'element',
          attributes: [],
          sourceRaw: '',
          sourceDirty: false,
          props: { src: srcOrTarget, title: alias ?? target, target, anchor, alias },
        });
      }

      const label = alias || (anchor ? `${target}#${anchor}` : target);
      if (WIKI_EMBED_EXTENSIONS.has(ext) && m.link) {
        const linkMark = m.link.create({
          href: srcOrTarget,
          title: null,
          linkStyle: 'inline',
          refLabel: null,
          sourceForm: 'wikiembed',
          target,
          anchor,
          alias,
        });
        return schema.text(label, [linkMark]);
      }

      if (m.link) {
        const linkMark = m.link.create({
          href: target,
          title: null,
          linkStyle: 'inline',
          refLabel: null,
        });
        return schema.text(label, [linkMark]);
      }

      throw new Error(
        '[wikiLinkEmbed handler] schema lacks `link` mark — cannot dispatch ' +
          'without violating the STOP rule against emitting PM wikiLinkEmbed server-side',
      );
    };
  }

  const blockUnknownHandler = (node: {
    type: string;
    position?: { start: { offset: number }; end: { offset: number } };
    value?: string;
  }) => {
    const sourceRaw = node.value ?? node.type;
    if (n.rawMdxFallback) {
      console.warn(
        JSON.stringify({
          event: 'unknown-mdast-type',
          type: node.type,
          reason: `Unhandled block mdast: ${node.type}`,
        }),
      );
      return n.rawMdxFallback.createAndFill(
        { reason: `Unhandled block mdast: ${node.type}` },
        sourceRaw ? [schema.text(sourceRaw)] : null,
      );
    }
    return null;
  };
  const inlineUnknownHandler = (node: { type: string; value?: string }) => {
    console.warn(
      JSON.stringify({
        event: 'unknown-mdast-type',
        type: node.type,
        reason: `Unhandled inline mdast: ${node.type}`,
      }),
    );
    return schema.text(node.value ?? node.type);
  };

  if (n.mathInline) {
    handlers.inlineMath = (node: { type: 'inlineMath'; value?: string }) =>
      n.mathInline.create({ formula: node.value ?? '' });
  }

  if (!handlers.math) handlers.math = blockUnknownHandler;
  if (!handlers.inlineMath) handlers.inlineMath = inlineUnknownHandler;
  if (!handlers.footnoteReference) handlers.footnoteReference = inlineUnknownHandler;

  handlers.rawMdxFallbackMdast = (node: {
    type: 'rawMdxFallbackMdast';
    originalType: string;
    value: string;
    position?: { start: { offset: number }; end: { offset: number } };
  }) => {
    if (!n.rawMdxFallback) return null;
    const span = node.position
      ? {
          start: node.position.start?.offset ?? 0,
          end: node.position.end?.offset ?? 0,
        }
      : { start: 0, end: 0 };
    console.warn(
      JSON.stringify({
        event: 'unknown-mdast-type',
        type: node.originalType,
        reason: `Unhandled mdast: ${node.originalType}`,
      }),
    );
    return n.rawMdxFallback.createAndFill(
      {
        reason: `Unhandled mdast: ${node.originalType}`,
        originalSpan: span,
      },
      node.value ? [schema.text(node.value)] : null,
    );
  };

  return handlers as RemarkProseMirrorOptions['handlers'];
}

function buildPmToMdastHandlers(schema: Schema): {
  nodeHandlers: FromProseMirrorOptions<string, string>['nodeHandlers'];
  markHandlers: FromProseMirrorOptions<string, string>['markHandlers'];
} {
  const nodeHandlers: NonNullable<FromProseMirrorOptions<string, string>['nodeHandlers']> = {};
  const markHandlers: NonNullable<FromProseMirrorOptions<string, string>['markHandlers']> = {};
  const n = schema.nodes;
  const m = schema.marks;

  if (n.paragraph) nodeHandlers.paragraph = fromPmNode('paragraph');
  if (n.blockquote) nodeHandlers.blockquote = fromPmNode('blockquote');

  if (n.heading) {
    nodeHandlers.heading = fromPmNode('heading', (pmNode: PmNode) => ({
      depth: pmNode.attrs.level,
      data: { sourceStyle: pmNode.attrs.headingStyle },
    }));
  }

  if (n.codeBlock) {
    nodeHandlers.codeBlock = (pmNode: PmNode) => ({
      type: 'code' as const,
      lang: pmNode.attrs.language ?? null,
      meta: pmNode.attrs.meta ?? null,
      value: pmNode.textContent ?? '',
      data: {
        sourceFenceChar: pmNode.attrs.fenceDelimiter,
        sourceFenceLength: pmNode.attrs.fenceLength,
      },
    });
  }

  if (n.thematicBreak) {
    nodeHandlers.thematicBreak = (pmNode: PmNode) => ({
      type: 'thematicBreak' as const,
      data: { sourceRaw: pmNode.attrs.sourceRaw },
    });
  }

  if (n.hardBreak) {
    nodeHandlers.hardBreak = (pmNode: PmNode) => ({
      type: 'break' as const,
      data: { sourceStyle: pmNode.attrs.hardBreakStyle },
    });
  }

  if (n.list) {
    nodeHandlers.list = fromPmNode('list', (pmNode: PmNode) => ({
      ordered: pmNode.attrs.ordered ?? false,
      start: pmNode.attrs.ordered ? (pmNode.attrs.start ?? 1) : null,
      spread: pmNode.attrs.spread ?? false,
      data: {
        bulletMarker: pmNode.attrs.bulletMarker,
        listMarkerDelimiter: pmNode.attrs.listMarkerDelimiter,
      },
    }));
  }

  if (n.listItem) {
    nodeHandlers.listItem = (pmNode: PmNode, _parent, state) => {
      const children = state.all(pmNode);
      const stripped =
        children.length > 1 && isEmptyMdastParagraph(children[0]) ? children.slice(1) : children;
      return {
        type: 'listItem' as const,
        checked: pmNode.attrs.checked ?? null,
        spread: pmNode.attrs.spread ?? false,
        children: stripped,
      } as ListItem;
    };
  }

  if (n.table) nodeHandlers.table = fromPmNode('table');
  if (n.tableRow) nodeHandlers.tableRow = fromPmNode('tableRow');
  if (n.tableCell) nodeHandlers.tableCell = fromPmNode('tableCell');
  if (n.tableHeader) nodeHandlers.tableHeader = fromPmNode('tableCell');

  if (n.image) {
    nodeHandlers.image = (pmNode: PmNode) => ({
      type: 'image' as const,
      url: pmNode.attrs.src,
      alt: pmNode.attrs.alt,
      title: pmNode.attrs.title,
    });
  }

  if (n.htmlBlock) {
    nodeHandlers.htmlBlock = (pmNode: PmNode) => ({
      type: 'html' as const,
      value: pmNode.attrs.content,
    });
  }

  const linkDefNodeSer = n.linkDefinition ?? n.linkRefDef;
  if (linkDefNodeSer) {
    const linkDefName = n.linkDefinition ? 'linkDefinition' : 'linkRefDef';
    nodeHandlers[linkDefName] = (pmNode: PmNode) => ({
      type: 'definition' as const,
      identifier: pmNode.attrs.identifier ?? pmNode.attrs.label ?? '',
      label: pmNode.attrs.label ?? pmNode.attrs.identifier ?? '',
      url: pmNode.attrs.url ?? pmNode.attrs.href ?? '',
      title: pmNode.attrs.title,
    });
  }

  if (n.jsxComponent) {
    nodeHandlers.jsxComponent = (pmNode: PmNode, _parent: PmNode | undefined, state) => {
      if (pmNode.attrs.kind === 'expression') {
        return {
          type: 'html' as const,
          value: (pmNode.attrs.sourceRaw as string) ?? '',
        };
      }
      const componentName = (pmNode.attrs.componentName as string) || null;
      const preservedAttrs = Array.isArray(pmNode.attrs.attributes)
        ? (pmNode.attrs.attributes as Array<MdxJsxAttribute | MdxJsxExpressionAttribute>)
        : [];

      if (!effectiveDirty(pmNode) && pmNode.attrs.sourceRaw) {
        return {
          type: 'mdxJsxFlowElement' as const,
          name: componentName,
          attributes: preservedAttrs,
          children: [],
          data: { sourceRaw: String(pmNode.attrs.sourceRaw) },
        } as MdxJsxFlowElement;
      }

      const meta = registry.getOrWildcard(componentName ?? '*');
      return meta.serialize(pmNode, {
        all: (node) => state.all(node) as MdastNodes[],
        registry,
        serializeChildren: () => {
          throw new Error(
            'SerializeContext.serializeChildren is not available in the PM→mdast handler. ' +
              'Compat descriptors that need markdown-byte body rendering must emit a marker ' +
              'mdast node and let the to-markdown handler render the body via state.containerFlow.',
          );
        },
      });
    };
  }

  if (n.rawMdxFallback) {
    nodeHandlers.rawMdxFallback = (pmNode: PmNode) => {
      const raw = pmNode.textContent ?? '';
      const reason = typeof pmNode.attrs.reason === 'string' ? pmNode.attrs.reason : '';
      const span = pmNode.attrs.originalSpan;
      const originalSpan =
        span && typeof span === 'object' && 'start' in span && 'end' in span
          ? {
              start: Number((span as { start: unknown }).start) || 0,
              end: Number((span as { end: unknown }).end) || 0,
            }
          : { start: 0, end: 0 };
      return {
        type: 'rawMdxFallback' as const,
        value: raw,
        data: { reason, originalSpan },
      } as unknown as MdastNodes;
    };
  }

  if (n.jsxInline) {
    nodeHandlers.jsxInline = (pmNode: PmNode) => {
      const raw = pmNode.attrs.sourceRaw || pmNode.textContent || '';
      return {
        type: 'mdxJsxTextElement' as const,
        name: null,
        attributes: [],
        children: [],
        data: { sourceRaw: String(raw) },
      };
    };
  }

  if (n.mathInline) {
    nodeHandlers.mathInline = (pmNode: PmNode) => {
      const formula = (pmNode.attrs.formula as string) ?? '';
      const id = pmNode.attrs.id;
      if (typeof id === 'string' && id.length > 0) {
        return {
          type: 'mdxJsxTextElement' as const,
          name: 'InlineMath',
          attributes: [
            { type: 'mdxJsxAttribute' as const, name: 'formula', value: formula },
            { type: 'mdxJsxAttribute' as const, name: 'id', value: id },
          ],
          children: [],
        } as unknown as MdastNodes;
      }
      return {
        type: 'inlineMath' as const,
        value: formula,
      } as unknown as MdastNodes;
    };
  }

  if (n.wikiLink) {
    nodeHandlers.wikiLink = (pmNode: PmNode) => {
      const target: string = pmNode.attrs.target ?? '';
      const anchor: string | null = pmNode.attrs.anchor ?? null;
      const alias: string | null = pmNode.attrs.alias ?? null;
      const label = alias ? alias : anchor ? `${target}#${anchor}` : target;
      return {
        type: 'wikiLink' as const,
        value: label,
        data: { target, anchor, alias },
        children: [{ type: 'text' as const, value: label }],
      } as unknown as MdastNodes;
    };
  }

  if (n.tag) {
    nodeHandlers.tag = (pmNode: PmNode) =>
      ({
        type: 'tag' as const,
        value: String(pmNode.attrs.value ?? ''),
      }) as unknown as MdastNodes;
  }

  if (n.wikiLinkEmbed) {
    nodeHandlers.wikiLinkEmbed = (pmNode: PmNode) => {
      const target: string = pmNode.attrs.target ?? '';
      const anchor: string | null = pmNode.attrs.anchor ?? null;
      const alias: string | null = pmNode.attrs.alias ?? null;
      const label = alias ? alias : anchor ? `${target}#${anchor}` : target;
      return {
        type: 'wikiLinkEmbed' as const,
        value: label,
        data: { target, anchor, alias },
        children: [{ type: 'text' as const, value: label }],
      } as unknown as MdastNodes;
    };
  }

  if (m.emphasis) {
    markHandlers.emphasis = fromPmMark('emphasis', (mark: PmMark) => ({
      data: { sourceDelimiter: mark.attrs.sourceDelimiter },
    }));
  }

  if (m.strong) {
    markHandlers.strong = fromPmMark('strong', (mark: PmMark) => ({
      data: { sourceDelimiter: mark.attrs.sourceDelimiter },
    }));
  }

  if (m.code) {
    markHandlers.code = (_mark: PmMark, _parent: PmNode, children: MdastNodes[]) => {
      return wrapAsInlineCode(children);
    };
  }

  const strikeMark = m.strike ?? m.delete;
  if (strikeMark) {
    const name = m.strike ? 'strike' : 'delete';
    markHandlers[name] = fromPmMark('delete');
  }

  if (m.highlight) {
    markHandlers.highlight = fromPmMark('mark');
  }

  if (m.link) {
    markHandlers.link = (mark: PmMark, _parent: PmNode, children: MdastNodes[]) => {
      if (mark.attrs.sourceForm === 'wikiembed') {
        const target =
          typeof mark.attrs.target === 'string' && mark.attrs.target.length > 0
            ? mark.attrs.target
            : (mark.attrs.href ?? '');
        const anchor: string | null =
          typeof mark.attrs.anchor === 'string' && mark.attrs.anchor.length > 0
            ? mark.attrs.anchor
            : null;
        const alias: string | null =
          typeof mark.attrs.alias === 'string' && mark.attrs.alias.length > 0
            ? mark.attrs.alias
            : null;
        const label = alias ? alias : anchor ? `${target}#${anchor}` : target;
        return {
          type: 'wikiLinkEmbed' as const,
          value: label,
          data: { target, anchor, alias },
          children: [{ type: 'text' as const, value: label }],
        } as unknown as MdastNodes;
      }
      const style = mark.attrs.linkStyle;
      if (style === 'autolink') {
        return {
          type: 'link' as const,
          url: mark.attrs.href ?? '',
          title: null,
          children,
          data: { sourceStyle: 'autolink' },
        } as Link;
      }
      if (style === 'inline' || !style) {
        return {
          type: 'link' as const,
          url: mark.attrs.href ?? '',
          title: mark.attrs.title ?? null,
          children,
        } as Link;
      }
      return {
        type: 'linkReference' as const,
        identifier: (mark.attrs.refLabel ?? '').toLowerCase(),
        label: mark.attrs.refLabel,
        referenceType: style,
        children,
      } as LinkReference;
    };
  }

  if (m.escapeMark) {
    markHandlers.escapeMark = (_mark: PmMark, _parent: PmNode, children: MdastNodes[]) => {
      for (const child of children) {
        if (child.type === 'text' && child.value) {
          const textChild = child as Text;
          textChild.data = textChild.data ?? {};
          textChild.data.escapedChars = textChild.data.escapedChars ?? [];
          for (let i = 0; i < textChild.value.length; i++) {
            textChild.data.escapedChars.push({ offset: i, char: textChild.value[i] });
          }
        }
      }
      return children.length === 1 ? children[0] : children;
    };
  }

  if (m.sourceLiteral) {
    markHandlers.sourceLiteral = (mark: PmMark, _parent: PmNode, children: MdastNodes[]) => {
      const raw = typeof mark.attrs.sourceRaw === 'string' ? mark.attrs.sourceRaw : '';
      if (children.length === 1 && children[0]?.type === 'text') {
        const textChild = children[0] as Text;
        textChild.data = textChild.data ?? {};
        textChild.data.sourceRaw = raw || textChild.value;
        return textChild;
      }
      return {
        type: 'text' as const,
        value: raw,
        data: { sourceRaw: raw },
      } as Text;
    };
  }

  return { nodeHandlers, markHandlers };
}
