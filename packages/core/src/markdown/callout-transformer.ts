/**
 * GFM-alerts → Callout mdxJsxFlowElement transformer (US-010 / FR-7).
 *
 * Runs AFTER `remark-github-alerts` (Q-MF1 path (a) LOCKED). The upstream
 * plugin mutates blockquote nodes whose first text-line matches
 * `[!TYPE]` — setting `data.hName = 'div'`, attaching a type-tagged class,
 * and PREPENDING a title paragraph. This transformer consumes that output
 * and emits a `mdxJsxFlowElement(Callout, ...)` in the blockquote's place,
 * so downstream tooling (the γ pipeline, the PropPanel, the DIY Callout
 * renderer) sees the same mdast shape as MDX-authored `<Callout ...>...</Callout>`.
 *
 * ## Form preservation (γ, D-MF17)
 *
 * The transformer COPIES the blockquote's `.position` onto the emitted
 * `mdxJsxFlowElement`. Phase B's position-slice walker runs AFTER this
 * transformer and attaches `data.sourceRaw = source.slice(start, end)` to
 * every `mdxJsxFlowElement` node. So the resulting node carries the
 * ORIGINAL blockquote markdown (`> [!NOTE]\nBody`) as its sourceRaw —
 * pristine round-trip emits that verbatim per the to-markdown handler's
 * sourceRaw-first dispatch.
 *
 * ## Foldable detection (D-MF17)
 *
 * `remark-github-alerts` is not foldable-aware — its opener regex is
 * `^\[!TYPE\]([^\n\r]*)` which greedily captures everything after the
 * marker on the opener line (including `+`/`-`). Re-inspecting the
 * original source at `blockquote.position.start.offset` is the single
 * reliable place to detect the foldable marker. Scope is the 5 GFM types
 * only — broader Obsidian types (`[!success]+`, `[!idea]-`) still flow
 * through the alias map but foldable-marker detection is inside the GFM
 * narrow.
 *
 * ## Alias map
 *
 * Folds Obsidian / Mintlify / Pandoc type aliases into the GFM 5-type
 * subset. Lossy for some migrated content (`success` → `tip`, `danger` →
 * `caution`, `idea` → `tip`); the strict GFM 5-type enum will extend
 * additively when broader Obsidian authoring demand surfaces.
 *
 * ## Why not a custom ~150-LoC blockquote visitor
 *
 * `remark-github-alerts` handles the error-prone opener-line tokenization
 * (case-insensitivity, marker validation, title extraction,
 * body-stripping) with a maintained upstream. The ~60-LoC transformer
 * here is strictly additive on top of that output. A custom visitor stays
 * as an escape hatch if the upstream proves problematic; one file changes.
 */

import type { Blockquote, Paragraph, Root } from 'mdast';
import type { MdxJsxAttribute, MdxJsxFlowElement } from 'mdast-util-mdx';
import { visit } from 'unist-util-visit';
import type { VFile } from 'vfile';

type CalloutType = 'note' | 'tip' | 'important' | 'warning' | 'caution';

const GFM_TYPES: ReadonlySet<string> = new Set<CalloutType>([
  'note',
  'tip',
  'important',
  'warning',
  'caution',
]);

const TYPE_ALIAS_MAP: Readonly<Record<string, CalloutType>> = {
  note: 'note',
  tip: 'tip',
  important: 'important',
  warning: 'warning',
  caution: 'caution',
  info: 'note',
  question: 'note',
  faq: 'note',
  abstract: 'note',
  summary: 'note',
  tldr: 'note',
  todo: 'note',
  success: 'tip',
  idea: 'tip',
  check: 'tip',
  hint: 'tip',
  example: 'tip',
  warn: 'warning',
  attention: 'warning',
  danger: 'caution',
  error: 'caution',
  bug: 'caution',
  failure: 'caution',
  quote: 'important',
};

const CALLOUT_CLASS_PREFIX = 'ok-alert';

const CLASS_TYPE_RE = new RegExp(`(?:^|\\s)${CALLOUT_CLASS_PREFIX}-(\\w+)(?:\\s|$)`);

interface OpenerInspection {
  rawType: string;
  foldableMarker: '+' | '-' | null;
  title: string | null;
}

const OPENER_RE = /^>\s*\[!(\w+)\]([+-])?(?:\s+(.*?))?\s*$/i;

function inspectOpenerLine(source: string, offset: number): OpenerInspection | null {
  if (offset < 0 || offset >= source.length) return null;
  const nl = source.indexOf('\n', offset);
  const line = nl === -1 ? source.slice(offset) : source.slice(offset, nl);
  const m = line.match(OPENER_RE);
  if (!m) return null;
  const rawType = m[1];
  const foldableMarker = m[2] === '+' || m[2] === '-' ? m[2] : null;
  const title = m[3]?.trim() || null;
  return { rawType, foldableMarker, title };
}

function extractTaggedType(node: Blockquote): string | null {
  const hName = (node.data as { hName?: string } | undefined)?.hName;
  if (hName !== 'div') return null;
  const hProps = (node.data as { hProperties?: { class?: string } } | undefined)?.hProperties;
  const klass = hProps?.class;
  if (typeof klass !== 'string') return null;
  const m = klass.match(CLASS_TYPE_RE);
  return m ? m[1].toLowerCase() : null;
}

function normalizeType(rawType: string): CalloutType | null {
  const lower = rawType.toLowerCase();
  return TYPE_ALIAS_MAP[lower] ?? null;
}

function buildCalloutElement(
  blockquote: Blockquote,
  type: CalloutType,
  title: string | null,
  foldableMarker: '+' | '-' | null,
  authoredAsAlias: string | null = null,
): MdxJsxFlowElement {
  const attrs: MdxJsxAttribute[] = [{ type: 'mdxJsxAttribute', name: 'type', value: type }];
  if (title) {
    attrs.push({ type: 'mdxJsxAttribute', name: 'title', value: title });
  }
  if (authoredAsAlias) {
    attrs.push({
      type: 'mdxJsxAttribute',
      name: 'data-authored-as',
      value: authoredAsAlias,
    });
  }
  if (foldableMarker !== null) {
    attrs.push({ type: 'mdxJsxAttribute', name: 'collapsible', value: null });
    if (foldableMarker === '+') {
      attrs.push({ type: 'mdxJsxAttribute', name: 'defaultOpen', value: null });
    } else {
      attrs.push({
        type: 'mdxJsxAttribute',
        name: 'defaultOpen',
        value: { type: 'mdxJsxAttributeValueExpression', value: 'false' },
      });
    }
  }

  const rawBody = blockquote.children.slice(1);
  const openerLineNumber = blockquote.position?.start.line;
  const body =
    title &&
    rawBody.length > 0 &&
    openerLineNumber !== undefined &&
    isResidualTitleParagraph(rawBody[0], openerLineNumber)
      ? rawBody.slice(1)
      : rawBody;

  const element: MdxJsxFlowElement = {
    type: 'mdxJsxFlowElement',
    name: 'GFMCallout',
    attributes: attrs,
    children: body,
    position: blockquote.position,
  };

  return element;
}

function isResidualTitleParagraph(node: unknown, openerLineNumber: number): boolean {
  if (!node || typeof node !== 'object') return false;
  const n = node as {
    type?: string;
    position?: { start?: { line?: number }; end?: { line?: number } };
  };
  if (n.type !== 'paragraph') return false;
  const start = n.position?.start?.line;
  const end = n.position?.end?.line;
  return start === openerLineNumber && end === openerLineNumber;
}

function isPluginTitleParagraph(paragraph: unknown): paragraph is Paragraph {
  if (
    !paragraph ||
    typeof paragraph !== 'object' ||
    (paragraph as { type?: string }).type !== 'paragraph'
  ) {
    return false;
  }
  const data = (paragraph as Paragraph).data as { hProperties?: { class?: string } } | undefined;
  const klass = data?.hProperties?.class;
  return typeof klass === 'string' && klass.includes(`${CALLOUT_CLASS_PREFIX}-title`);
}

export function calloutTransformerPlugin() {
  return (tree: Root, file: VFile) => {
    const source = typeof file.value === 'string' ? file.value : '';

    visit(tree, 'blockquote', (node, index, parent) => {
      if (parent === undefined || typeof index !== 'number') return;

      const taggedType = extractTaggedType(node);
      if (!taggedType) return;

      let type = normalizeType(taggedType);

      let title: string | null = null;
      let opener: ReturnType<typeof inspectOpenerLine> | null = null;
      if (node.position?.start?.offset !== undefined) {
        opener = inspectOpenerLine(source, node.position.start.offset);
        if (opener) {
          title = opener.title;
          if (!type) type = normalizeType(opener.rawType);
        }
      }

      const resolvedType: CalloutType = type ?? 'note';

      const foldableMarker: '+' | '-' | null =
        opener && GFM_TYPES.has(resolvedType) ? opener.foldableMarker : null;

      const sourceAuthoredToken = (() => {
        if (node.position?.start?.offset !== undefined) {
          const opener = inspectOpenerLine(source, node.position.start.offset);
          if (opener?.rawType) return opener.rawType;
        }
        return taggedType;
      })();
      const authoredAsAlias =
        sourceAuthoredToken.toLowerCase() !== resolvedType ? sourceAuthoredToken : null;

      if (!isPluginTitleParagraph(node.children[0])) return;

      const element = buildCalloutElement(
        node,
        resolvedType,
        title,
        foldableMarker,
        authoredAsAlias,
      );
      (parent.children as unknown[])[index] = element;
    });
  };
}

const PLACEHOLDER_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" width="16" height="16"></svg>';

const PLUGIN_ICON_MAP: Readonly<Record<string, string>> = new Proxy({} as Record<string, string>, {
  get: () => PLACEHOLDER_SVG,
});

export const REMARK_GITHUB_ALERTS_OPTIONS = {
  markers: '*' as const,
  classPrefix: CALLOUT_CLASS_PREFIX,
  matchCaseSensitive: false,
  icons: PLUGIN_ICON_MAP,
};
