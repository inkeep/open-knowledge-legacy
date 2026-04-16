/**
 * Unified pipeline factory.
 *
 * Parse direction:
 *   remark-parse → remark-frontmatter → remarkMdxAgnostic →
 *   remark-gfm → [position-slice walker slot] → remarkProseMirror
 *
 * Serialize direction:
 *   fromProseMirror → remark-stringify (with custom mdast-util-to-markdown handlers)
 *
 * Plugin order for parser extensions is empirically commutative (see
 * tech-probes/plugin-ordering/REPORT.md), but transformer ordering matters:
 * position-slice walker runs AFTER all syntax extensions produce their mdast
 * (so positions are final) and BEFORE remarkProseMirror (so handlers read
 * node.data.*).
 *
 * R16 caching (spec 2026-04-16 markdown-pipeline-engineering-health):
 * processors are built once per MarkdownManager instance via
 * `createParseProcessor` / `createSerializeProcessor`, then reused across
 * every `parse()` / `serialize()` call. `parseMd` / `serializeMd` accept
 * the pre-built processor and run the stateless per-document work
 * (protectFromMdx, VFile binding, PM↔mdast conversion). The attacher for
 * `remarkMdxAgnostic` and `remarkWikiLink` is made idempotent under
 * re-entry via module-level singleton extension values, which means
 * pathological re-attach would not duplicate entries in `data()` arrays.
 */

import {
  type FromProseMirrorOptions,
  fromProseMirror,
  type RemarkProseMirrorOptions,
  remarkProseMirror,
} from '@handlewithcare/remark-prosemirror';
import type { Node as PmNode, Schema } from '@tiptap/pm/model';
import type { Root as MdastRoot } from 'mdast';
import remarkFrontmatter from 'remark-frontmatter';
import remarkGfm from 'remark-gfm';
import remarkParse from 'remark-parse';
import remarkStringify from 'remark-stringify';
import { type Processor, unified } from 'unified';
import { VFile } from 'vfile';

// Ensure mdast type augmentations are loaded
import './mdast-augmentation.ts';
import { autolinkPromotionPlugin } from './autolink-promotion.ts';
import { protectFromMdx, restoreFromMdx } from './autolink-void-html-guard.ts';
import { docStartThematicFixPlugin } from './doc-start-thematic-fix.ts';
import { positionSlicePlugin } from './position-slice.ts';
import { remarkMdxAgnostic } from './remark-mdx-agnostic.ts';
import { unknownMdastGuardPlugin } from './unknown-mdast-guard.ts';
import { remarkWikiLink } from './wiki-link-micromark.ts';

export interface PipelineOptions {
  schema: Schema;
  /** mdast → PM handlers (keyed by mdast node type) */
  handlers: RemarkProseMirrorOptions['handlers'];
  /** PM → mdast node handlers (keyed by PM node type name) */
  pmNodeHandlers: FromProseMirrorOptions<string, string>['nodeHandlers'];
  /** PM → mdast mark handlers (keyed by PM mark type name) */
  pmMarkHandlers: FromProseMirrorOptions<string, string>['markHandlers'];
  /** Custom mdast-util-to-markdown handlers for fidelity (wired in US-005) */
  toMarkdownHandlers?: Record<string, unknown>;
}

/** Options needed by `serializeMd` for the PM→mdast pre-pass. Kept separate
 * from the (pre-baked) processor so one cached serialize processor can serve
 * calls that share schema/handler registrations. */
export interface SerializeMdOptions {
  schema: Schema;
  pmNodeHandlers: FromProseMirrorOptions<string, string>['nodeHandlers'];
  pmMarkHandlers: FromProseMirrorOptions<string, string>['markHandlers'];
}

/**
 * Ensure the mdast tree has at least one renderable block. remark-prosemirror
 * maps certain mdast types to `ignore` by default (yaml, toml, definition,
 * footnoteDefinition — see §19.1) or via our registered handlers. When the
 * source consists solely of ignore-typed nodes (e.g., `---\n\n---` parses as
 * empty YAML frontmatter; `[a]: url` is only a link definition), the PM doc
 * would have zero children and `doc.content: 'block+'` validation would throw
 * `Invalid content for node doc: <>`. Inject an empty paragraph so parse()
 * always returns a valid PM doc — a real user document with only definitions
 * would still editable as a blank page with those definitions preserved on
 * serialize via the `linkDefinition` PM atom handler (R12) and frontmatter
 * Y.Map bridge.
 *
 * mdast types that remark-prosemirror's `toProseMirror` filters out (either
 * via default ignore or via user-registered ignore mappings):
 *   - yaml, toml (frontmatter — handled via Y.Map on observer sync path)
 *   - definition, footnoteDefinition (linkDefinition PM atom is registered
 *     but not every caller uses it; default is ignore)
 *
 * This guard runs on the mdast tree BEFORE remark-prosemirror dispatch, so
 * we never encounter the `createAndFill` failure.
 */
function ensureNonEmptyDoc(tree: MdastRoot): MdastRoot {
  const renderable = tree.children.some((n) => {
    const type = (n as { type: string }).type;
    // Known ignore-only mdast types — list must stay in sync with
    // remark-prosemirror's default ignores + any explicit ignores we register.
    return type !== 'yaml' && type !== 'toml' && type !== 'footnoteDefinition';
  });
  if (renderable) return tree;
  // Synthesize an empty paragraph alongside existing ignore-typed nodes.
  return {
    ...tree,
    children: [...tree.children, { type: 'paragraph', children: [] } as never],
  };
}

/**
 * Build the cached parse processor. Called once per MarkdownManager instance;
 * the result is reused across every `parseMd` call.
 *
 * `processor.freeze()` runs all attachers and locks in the pipeline config —
 * subsequent calls to `.parse()`/`.runSync()`/`.stringify()` are stateless
 * with respect to the processor.
 */
export function createParseProcessor(opts: PipelineOptions): Processor {
  const processor = unified()
    .use(remarkParse)
    .use(remarkFrontmatter, ['yaml'])
    .use(remarkMdxAgnostic)
    .use(remarkGfm)
    .use(remarkWikiLink)
    .use(restoreFromMdx) // R23: Restore protected patterns after MDX parsing
    .use(autolinkPromotionPlugin) // Promote <scheme:uri> text → semantic link nodes
    .use(docStartThematicFixPlugin) // NG10: empty yaml at doc-start → thematicBreak
    .use(positionSlicePlugin)
    // R8 wildcard catch-all: replace any mdast node whose type is unknown to
    // our handler table with `rawMdxFallbackMdast` so remark-prosemirror's
    // throwing `unknown()` handler never fires. Runs AFTER positionSlice so
    // node.data.sourceRaw is final, BEFORE ensureNonEmptyDoc + remarkProseMirror.
    .use(unknownMdastGuardPlugin)
    .use(() => ensureNonEmptyDoc) // Guard empty-doc edge case (see fn docs)
    .use(remarkProseMirror, {
      schema: opts.schema,
      handlers: opts.handlers,
    } as RemarkProseMirrorOptions);
  processor.freeze();
  return processor as unknown as Processor;
}

/**
 * Build the cached serialize processor. Called once per MarkdownManager
 * instance; reused across every `serializeMd` call.
 *
 * The `fromProseMirror` step runs per-document (needs the PM doc) and is not
 * part of the cached processor — see `serializeMd`.
 */
export function createSerializeProcessor(opts: PipelineOptions): Processor {
  // Note: `remarkWikiLink` is intentionally absent here. The PM → mdast
  // handler for the `wikiLink` PM atom emits `{ type: 'html', value: '[[…]]' }`
  // (see index.ts), so by the time the mdast reaches stringify there are no
  // wikiLink nodes to dispatch — the HTML stringifier carries the bytes.
  const processor = unified()
    .use(remarkFrontmatter, ['yaml'])
    .use(remarkGfm)
    .use(remarkMdxAgnostic)
    .use(remarkStringify, {
      bullet: '-',
      fences: true,
      rule: '-',
      ...(opts.toMarkdownHandlers ? { handlers: opts.toMarkdownHandlers } : {}),
    });
  processor.freeze();
  return processor as unknown as Processor;
}

/**
 * Parse a markdown string to a ProseMirror document node.
 *
 * Stateless with respect to the processor: the caller owns processor lifetime.
 * Per-call work is the R23 protect pass, VFile binding, parse/runSync/stringify
 * against the pre-built processor. The VFile's `.value` is swapped post-parse
 * back to the ORIGINAL source so the position-slice walker can slice by offset
 * against authoring-form text.
 */
export function parseMd(source: string, processor: Processor): PmNode {
  // R23: Protect autolinks, void HTML, bare <, unmatched {, and other
  // crash-triggering patterns from remark-mdx claiming.
  const protected_ = protectFromMdx(source);

  // Create VFile so the position-slice walker can access the ORIGINAL source text
  // (not the protected version) for accurate position slicing.
  const file = new VFile(protected_);
  const tree = processor.parse(file);
  file.value = source;
  const transformed = processor.runSync(tree, file);
  return (processor as unknown as { stringify(tree: unknown): PmNode }).stringify(transformed);
}

/**
 * Serialize a ProseMirror document node to a markdown string.
 *
 * Stateless with respect to the processor. The PM→mdast pre-pass uses the
 * schema + handlers passed in `opts`, then the cached processor's
 * `.stringify(mdast)` produces the final string.
 */
export function serializeMd(doc: PmNode, processor: Processor, opts: SerializeMdOptions): string {
  const mdast: MdastRoot = fromProseMirror(doc, {
    schema: opts.schema,
    nodeHandlers: opts.pmNodeHandlers,
    markHandlers: opts.pmMarkHandlers,
  });

  return String(processor.stringify(mdast));
}
