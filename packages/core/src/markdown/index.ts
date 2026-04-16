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
  Paragraph,
  Strong,
  Text,
  ThematicBreak,
} from 'mdast';
import type {
  MdxFlowExpression,
  MdxJsxFlowElement,
  MdxJsxTextElement,
  MdxTextExpression,
} from 'mdast-util-mdx';
import type { Processor } from 'unified';
import type { WikiLinkMdast } from './mdast-augmentation.ts';
import { parseWithFallback } from './parse-with-fallback.ts';
import {
  createParseProcessor,
  createSerializeProcessor,
  parseMd,
  serializeMd,
} from './pipeline.ts';
import { toMarkdownHandlers } from './to-markdown-handlers.ts';

// Structural shape of the state object passed to mdast→PM handlers
// (remark-prosemirror's internal `State` type is not publicly exported).
interface MdastToPmState {
  all: (node: MdastNodes) => PmNode[];
  one: (node: MdastNodes, parent: MdastParent | undefined) => PmNode | PmNode[] | null;
}

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
  // R16: processors are built once per MarkdownManager instance and reused
  // across every parse()/serialize() call. Eliminates the Docusaurus #4978
  // anti-pattern (per-parse processor reconstruction).
  private parseProcessor: Processor;
  private serializeProcessor: Processor;

  constructor(options: MarkdownManagerOptions) {
    this.schema = getSchema(options.extensions);
    this.handlers = buildMdastToPmHandlers(this.schema);
    const { nodeHandlers, markHandlers } = buildPmToMdastHandlers(this.schema);
    this.pmNodeHandlers = nodeHandlers;
    this.pmMarkHandlers = markHandlers;

    // Pre-build and freeze both processors. After freeze, .parse/.runSync/
    // .stringify are stateless with respect to the processor, so the cached
    // instances are safely reusable across concurrent parse/serialize calls.
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

  /**
   * Parse a markdown string to TipTap JSONContent.
   *
   * May throw for structurally invalid MDX (e.g., mismatched open/close tags
   * like `<Foo>...</Bar>`). This is expected — Observer B catches errors and
   * keeps last valid XmlFragment state during live editing. The R23 guard
   * prevents the more severe class of crash (bare unmatched `<` and `{` that
   * cause "Unexpected end of file" errors).
   */
  parse(markdown: string): JSONContent {
    if (!markdown.trim()) {
      return {
        type: 'doc',
        content: [{ type: 'paragraph', content: [] }],
      };
    }
    const doc = parseMd(markdown, this.parseProcessor);
    return doc.toJSON() as JSONContent;
  }

  /**
   * Parse with block-level fallback (R6). Never throws.
   *
   * On parse failure with position info, splits source at the enclosing block
   * boundary, replaces the failing block with rawMdxFallback, parses the
   * halves recursively, and merges. On position-less error (e.g., PM-
   * construction RangeError), splits at blank-line boundaries and dispatches
   * each block independently. On MAX_SPLIT_DEPTH exhaustion or when every
   * block fails, falls through to whole-doc raw text. The `never throws`
   * contract is preserved across all paths.
   *
   * Use for all server-side R6 callers where throwing = user-visible data
   * loss: server persistence (onLoadDocument), agent-sessions, rollback
   * endpoint, external-change disk→CRDT bridge. NOT for Observer B, which
   * uses freeze-on-failure for live-typing UX (retains the last-valid
   * XmlFragment while the user is mid-type).
   *
   * Supersedes the prior `parseSafe` API (removed as a redundant alias —
   * one name per function, per greenfield precedent).
   */
  parseWithFallback(markdown: string): JSONContent {
    if (!markdown.trim()) {
      return { type: 'doc', content: [{ type: 'paragraph', content: [] }] };
    }
    return parseWithFallback(markdown, { parse: (md) => this.parse(md) });
  }

  /**
   * Serialize TipTap JSONContent to a markdown string.
   */
  serialize(json: JSONContent): string {
    let doc: PmNode;
    try {
      // Use schema.nodeFromJSON() instead of PmNode.fromJSON(schema, json):
      // in monorepos with multiple physical copies of prosemirror-model, the
      // static PmNode import can disagree with the Schema instance from
      // getSchema() ("multiple versions loaded"). schema.nodeFromJSON() uses
      // the schema's own Node/Fragment constructors — always consistent.
      // Credit: Mike (PR #105)
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

/**
 * True when an mdast node is a `paragraph` with no rendered text content —
 * either no children at all, or only `text` children with empty `value`.
 *
 * Used by the `listItem` PM→mdast handler to strip a leading empty paragraph
 * that PM's `nodeType.createAndFill` synthesized to satisfy `paragraph block*`
 * when the source mdast had a non-paragraph first child. See R6d / US-011.
 */
function isEmptyMdastParagraph(node: MdastNodes): boolean {
  if (node.type !== 'paragraph') return false;
  const children = node.children ?? [];
  if (children.length === 0) return true;
  return children.every((c) => c.type === 'text' && (c as Text).value === '');
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
  if (n.paragraph) {
    // Custom paragraph handler: lift block-level children (e.g., inline JSX components
    // that map to a block-only PM node like jsxComponent) out of their paragraph wrapper
    // so they produce valid PM doc content instead of crashing the schema.
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

  // Table
  if (n.table) handlers.table = toPmNode(n.table);
  if (n.tableRow) handlers.tableRow = toPmNode(n.tableRow);
  // tableCell + tableHeader: mdast has only tableCell, PM may have both.
  // mdast cells contain phrasing (inline) content, but PM cells require block content.
  // Wrap inline children in a paragraph.
  if (n.tableCell) {
    const cellHandler =
      (nodeType: (typeof n)[string]) =>
      (node: MdastNodes, _: MdastParent, state: MdastToPmState) => {
        const children = state.all(node).flat();
        // Wrap inline content in paragraph for PM cell content spec
        if (children.length > 0 && n.paragraph) {
          const para = n.paragraph.create(null, children);
          return nodeType.createAndFill(null, [para]);
        }
        return nodeType.createAndFill(null, null);
      };
    handlers.tableCell = cellHandler(n.tableCell);
    if (n.tableHeader) {
      // First row uses tableHeader; remark-prosemirror will call the tableCell
      // handler for all cells. We handle header detection in the row handler or
      // via a post-process. For now, all cells are tableCell.
    }
  }

  // Image
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

  // D20: text handler — apply escapeMark to chars that had backslash escapes in source
  if (m.escapeMark) {
    handlers.text = (node: Text) => {
      const value: string = node.value ?? '';
      const escapedChars: Array<{ offset: number; char: string }> | undefined =
        node.data?.escapedChars;
      if (!escapedChars?.length || !value) {
        return schema.text(value.replaceAll('\u00A0', ' '));
      }
      // Build PM Fragment: split text at escape boundaries, apply escapeMark to escaped chars
      const fragments: PmNode[] = [];
      let lastIdx = 0;
      for (const { offset } of escapedChars) {
        // Adjust offset: in mdast, the value has the backslash consumed,
        // so the char at `offset` in the value corresponds to the escaped char
        if (offset > lastIdx) {
          const segment = value.slice(lastIdx, offset).replaceAll('\u00A0', ' ');
          if (segment) fragments.push(schema.text(segment));
        }
        // The escaped char itself gets the escapeMark
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

  // Inline code → code mark on text
  if (m.code) {
    handlers.inlineCode = (node: InlineCode) => schema.text(node.value, [m.code.create()]);
  }

  // GFM strikethrough
  const strikeMark = m.strike ?? m.delete;
  if (strikeMark) handlers.delete = toPmMark(strikeMark);

  // ── Tier B fidelity handlers — read node.data.* from position-slice walker ──

  // emphasis — sourceDelimiter attr (EmphasisFidelity extension)
  if (m.emphasis) {
    handlers.emphasis = toPmMark(m.emphasis, (node: Emphasis) => ({
      sourceDelimiter: node.data?.sourceDelimiter ?? '*',
    }));
  }

  // strong — sourceDelimiter attr (StrongFidelity extension)
  if (m.strong) {
    handlers.strong = toPmMark(m.strong, (node: Strong) => ({
      sourceDelimiter: node.data?.sourceDelimiter ?? '**',
    }));
  }

  // heading — headingStyle attr (HeadingFidelity extension)
  if (n.heading) {
    handlers.heading = toPmNode(n.heading, (node: Heading) => ({
      level: node.depth,
      headingStyle: node.data?.sourceStyle ?? 'atx',
    }));
  }

  // code block — fenceDelimiter + fenceLength attrs (CodeBlockFidelity extension)
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

  // thematicBreak — sourceRaw attr (ThematicBreakFidelity extension)
  if (n.thematicBreak) {
    handlers.thematicBreak = (node: ThematicBreak) =>
      n.thematicBreak.createAndFill({
        sourceRaw: node.data?.sourceRaw ?? '---',
      });
  }

  // hardBreak / break — hardBreakStyle attr (HardBreakFidelity extension)
  if (n.hardBreak) {
    handlers.break = (node: Break) =>
      n.hardBreak.createAndFill({
        hardBreakStyle: node.data?.sourceStyle ?? 'spaces',
      });
  }

  // Lists — read bulletMarker + listMarkerDelimiter (unified list node, D15)
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

  // ── Tier C custom handlers ──

  // Link mark — linkStyle + refLabel attrs (LinkFidelity extension)
  if (m.link) {
    handlers.link = toPmMark(m.link, (node: Link) => ({
      href: node.url ?? '',
      title: node.title ?? null,
      linkStyle: node.data?.sourceStyle ?? 'inline',
      refLabel: null,
    }));

    // linkReference → same link mark but with reference style info
    handlers.linkReference = toPmMark(m.link, (node: LinkReference) => ({
      href: '',
      title: null,
      linkStyle: node.referenceType ?? 'shortcut',
      refLabel: node.label ?? node.identifier ?? null,
    }));
  }

  // HTML block — content attr (HtmlBlockFidelity extension)
  if (n.htmlBlock) {
    handlers.html = (node: Html) => n.htmlBlock.createAndFill({ content: node.value ?? '' });
  }

  // Definition → linkRefDef/linkDefinition atom (R12 CRITICAL override)
  // Library pre-ignores `definition` — must register explicit handler.
  // PM linkRefDef attrs: { label, href, title } (no identifier/url).
  // PM linkDefinition attrs (if renamed): { identifier, label, url, title }.
  const linkDefNode = n.linkDefinition ?? n.linkRefDef;
  if (linkDefNode) {
    const hasUrlAttr = !!linkDefNode.spec.attrs?.url;
    const hasHrefAttr = !!linkDefNode.spec.attrs?.href;
    const hasIdentifierAttr = !!linkDefNode.spec.attrs?.identifier;
    handlers.definition = (node: Definition) => {
      const attrs: Record<string, unknown> = {
        title: node.title ?? null,
      };
      // Map mdast label/identifier → PM attr names
      if (hasIdentifierAttr) {
        attrs.identifier = node.identifier ?? '';
        attrs.label = node.label ?? node.identifier ?? '';
      } else {
        attrs.label = node.label ?? node.identifier ?? '';
      }
      // Map mdast url → PM attr name (href or url)
      if (hasUrlAttr) attrs.url = node.url ?? '';
      else if (hasHrefAttr) attrs.href = node.url ?? '';
      return linkDefNode.createAndFill(attrs);
    };
  }

  // MDX + expression + directive nodes — all stored as jsxComponent atoms
  // with raw source for byte-identical round-trip (US-008, D12)
  if (n.jsxComponent) {
    // MDX JSX elements — `data.sourceRaw` is attached by the position-slice walker
    const rawFromData = (data: unknown): string | undefined => {
      if (data && typeof data === 'object' && 'sourceRaw' in data) {
        const raw = (data as { sourceRaw?: unknown }).sourceRaw;
        if (typeof raw === 'string') return raw;
      }
      return undefined;
    };

    handlers.mdxJsxFlowElement = (node: MdxJsxFlowElement) =>
      n.jsxComponent.createAndFill({
        content: rawFromData(node.data) ?? '',
      });
    // Inline JSX → jsxInline (R3) if available; block-lift fallback otherwise
    if (n.jsxInline) {
      handlers.mdxJsxTextElement = (
        node: MdxJsxTextElement,
        _: MdastParent,
        state: MdastToPmState,
      ) => {
        const children = state.all(node as unknown as MdastNodes).flat();
        const attrs = {
          sourceRaw: rawFromData(node.data) ?? '',
          attributes: (node.attributes ?? []).map((a) =>
            'type' in a && a.type === 'mdxJsxExpressionAttribute'
              ? { type: 'spread', value: a.value }
              : {
                  type: 'attr',
                  name: (a as { name: string }).name,
                  value: (a as { value: unknown }).value,
                },
          ),
        };
        return n.jsxInline.createAndFill(attrs, children.length > 0 ? children : null);
      };
    } else {
      // Fallback: map to block jsxComponent if jsxInline not in schema
      handlers.mdxJsxTextElement = (node: MdxJsxTextElement) =>
        n.jsxComponent.createAndFill({
          content: rawFromData(node.data) ?? '',
        });
    }

    // MDX expressions
    //
    // - mdxFlowExpression (block-level `{expr}` on its own line) → jsxComponent
    //   (block node, `atom: true`, raw source in `content` attr).
    //
    // - mdxTextExpression (inline `{expr}` in prose) → plain `text` node
    //   carrying the raw expression verbatim. This is the correct level per
    //   NG1 + agnostic-mode intent: "balanced-brace prose like `{ noServer: true }`
    //   preserves the braces on parse → serialize round-trip." Mapping to
    //   jsxComponent (block) would violate paragraph's `inline*` content
    //   expression when the expression appears mid-prose (e.g., inside a
    //   table cell that wraps content in a paragraph). The spec §8 matrix
    //   showed mdxTextExpression → jsxComponent; that's an inherited
    //   inconsistency from the pre-agnostic schema. Under agnostic mode,
    //   inline expressions ARE just prose — emit them as text.
    //
    // Under agnostic MDX (R1), both text and flow expressions only tokenize
    // on BALANCED braces. Unmatched `{` is preserved as prose by the R23
    // guard. So `{ noServer: true }` round-trips: text → serialize → `{ noServer: true }`
    // → parse → mdxTextExpression → text → ...
    handlers.mdxFlowExpression = (node: MdxFlowExpression) =>
      n.jsxComponent.createAndFill({
        content: rawFromData(node.data) ?? `{${node.value ?? ''}}`,
      });
    handlers.mdxTextExpression = (node: MdxTextExpression) => {
      const source = rawFromData(node.data) ?? `{${node.value ?? ''}}`;
      return schema.text(source);
    };
    // mdxjsEsm handler removed (R4): agnostic mode never produces mdxjsEsm
    // nodes — ESM import/export re-parses as prose per NG1.
    // Directive handlers removed (D14): remark-directive removed from pipeline.
  }

  // Wiki-link → inline atom node
  if (n.wikiLink) {
    handlers.wikiLink = (node: WikiLinkMdast) =>
      n.wikiLink.createAndFill({
        target: node.data?.target ?? '',
        alias: node.data?.alias ?? null,
        anchor: node.data?.anchor ?? null,
      });
  }

  // Frontmatter: keep ignored (handled via Y.Map, not PM schema)
  // yaml + toml are pre-ignored by the library — correct behavior

  // R8: Unknown-mdast-type catch-all for types that remark plugins may produce
  // but our handler table doesn't cover. Block unknowns → rawMdxFallback;
  // inline unknowns → plain text node with source slice.
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

  // Known-possible block types that may appear from remark-gfm or other extensions
  if (!handlers.math) handlers.math = blockUnknownHandler;
  // Known-possible inline types
  if (!handlers.inlineMath) handlers.inlineMath = inlineUnknownHandler;
  if (!handlers.footnoteReference) handlers.footnoteReference = inlineUnknownHandler;

  // R8 wildcard: `unknownMdastGuardPlugin` in pipeline.ts substitutes any
  // unknown-type mdast node with this synthetic type. We route it through
  // blockUnknownHandler to produce a block-level rawMdxFallback — preserves
  // surrounding structure instead of whole-doc fallback.
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

// ──────────────────────────── PM → mdast handlers ────────────────────────────

function buildPmToMdastHandlers(schema: Schema): {
  nodeHandlers: FromProseMirrorOptions<string, string>['nodeHandlers'];
  markHandlers: FromProseMirrorOptions<string, string>['markHandlers'];
} {
  const nodeHandlers: NonNullable<FromProseMirrorOptions<string, string>['nodeHandlers']> = {};
  const markHandlers: NonNullable<FromProseMirrorOptions<string, string>['markHandlers']> = {};
  const n = schema.nodes;
  const m = schema.marks;

  // Nodes
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

  // Lists (unified list node, D15)
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
    // Custom listItem handler: strip a leading empty paragraph that PM's
    // `createAndFill` synthesized to satisfy the schema's `paragraph block*`
    // content expression. When the source mdast has a non-paragraph first
    // child (e.g. `code`, nested `list`, `blockquote`), `toPmNode` calls
    // `nodeType.createAndFill(attrs, children)` which prepends an empty
    // paragraph so the PM document validates. On the way back to mdast,
    // that synthetic paragraph would render as `""` between the marker
    // and the first real block, and the loose-list separator (`\n\n`)
    // around it produces "1. \n\n   ```..." — an empty marker line followed
    // by a blank line, which CommonMark refuses to interpret as list
    // continuation, so the first real block escapes the listItem on
    // re-parse (Lists CommonMark example 277 — formerly Lists 25/26).
    //
    // Strip when: (1) listItem has more than one child AND (2) the first
    // child is an empty paragraph (no children OR only empty text nodes).
    // Don't strip when the listItem is genuinely empty (single empty
    // paragraph child), because that represents a deliberately empty list
    // item from input like "1.\n".
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

  // Table
  if (n.table) nodeHandlers.table = fromPmNode('table');
  if (n.tableRow) nodeHandlers.tableRow = fromPmNode('tableRow');
  if (n.tableCell) nodeHandlers.tableCell = fromPmNode('tableCell');
  if (n.tableHeader) nodeHandlers.tableHeader = fromPmNode('tableCell');

  // Image
  if (n.image) {
    nodeHandlers.image = (pmNode: PmNode) => ({
      type: 'image' as const,
      url: pmNode.attrs.src,
      alt: pmNode.attrs.alt,
      title: pmNode.attrs.title,
    });
  }

  // HTML block — content attr (HtmlBlockFidelity extension)
  if (n.htmlBlock) {
    nodeHandlers.htmlBlock = (pmNode: PmNode) => ({
      type: 'html' as const,
      value: pmNode.attrs.content,
    });
  }

  // Link definition (linkDefinition or linkRefDef schema name)
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

  // JSX component → emit raw source as HTML for byte-identical MDX round-trip
  if (n.jsxComponent) {
    nodeHandlers.jsxComponent = (pmNode: PmNode) => ({
      type: 'html' as const,
      value: pmNode.attrs.content ?? '',
    });
  }

  // rawMdxFallback → emit inner text as html mdast node (preserves raw bytes)
  if (n.rawMdxFallback) {
    nodeHandlers.rawMdxFallback = (pmNode: PmNode) => ({
      type: 'html' as const,
      value: pmNode.textContent ?? '',
    });
  }

  // jsxInline → prefer sourceRaw for byte-identical round-trip; fallback to
  // reconstructing from structured attributes
  if (n.jsxInline) {
    nodeHandlers.jsxInline = (pmNode: PmNode) => ({
      type: 'html' as const,
      value: pmNode.attrs.sourceRaw || pmNode.textContent || '',
    });
  }

  // Wiki-link → emit as raw HTML to preserve [[...]] syntax on serialize
  if (n.wikiLink) {
    nodeHandlers.wikiLink = (pmNode: PmNode) => {
      const target = pmNode.attrs.target ?? '';
      const anchor = pmNode.attrs.anchor;
      const alias = pmNode.attrs.alias;
      let text = `[[${target}`;
      if (anchor) text += `#${anchor}`;
      if (alias) text += `|${alias}`;
      text += ']]';
      return { type: 'html' as const, value: text };
    };
  }

  // Marks — carry fidelity data back to mdast
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
      const val = children.map((c) => (c.type === 'text' ? c.value : '')).join('');
      return { type: 'inlineCode' as const, value: val };
    };
  }

  const strikeMark = m.strike ?? m.delete;
  if (strikeMark) {
    const name = m.strike ? 'strike' : 'delete';
    markHandlers[name] = fromPmMark('delete');
  }

  if (m.link) {
    markHandlers.link = (mark: PmMark, _parent: PmNode, children: MdastNodes[]) => {
      const style = mark.attrs.linkStyle;
      // Autolink form: serialize as <url>
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
      // Reference link
      return {
        type: 'linkReference' as const,
        identifier: (mark.attrs.refLabel ?? '').toLowerCase(),
        label: mark.attrs.refLabel,
        referenceType: style,
        children,
      } as LinkReference;
    };
  }

  // D20: escapeMark → tag the text node with escapedChars so the serialize
  // handler can re-emit backslash sequences
  if (m.escapeMark) {
    markHandlers.escapeMark = (_mark: PmMark, _parent: PmNode, children: MdastNodes[]) => {
      // Each child text node under this mark was an escaped char — tag it
      for (const child of children) {
        if (child.type === 'text' && child.value) {
          const textChild = child as Text;
          textChild.data = textChild.data ?? {};
          textChild.data.escapedChars = textChild.data.escapedChars ?? [];
          // The entire text value is escaped chars (mark is applied per-char)
          for (let i = 0; i < textChild.value.length; i++) {
            textChild.data.escapedChars.push({ offset: i, char: textChild.value[i] });
          }
        }
      }
      // Return children unwrapped (escapeMark doesn't correspond to an mdast node)
      return children.length === 1 ? children[0] : children;
    };
  }

  return { nodeHandlers, markHandlers };
}
