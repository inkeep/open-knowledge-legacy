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
 * narrow (NG26 defers enum extension).
 *
 * ## Alias map (Q-MF3 LOCKED)
 *
 * Folds Obsidian / Mintlify / Pandoc type aliases into the GFM 5-type
 * subset. Lossy for some migrated content (`success` → `tip`, `danger` →
 * `caution`, `idea` → `tip`); the strict GFM 5-type enum will extend
 * additively under NG26 when broader Obsidian authoring demand surfaces.
 *
 * ## Why not path (b) (custom ~150-LoC blockquote visitor)
 *
 * Per Q-MF1 LOCKED on path (a): `remark-github-alerts` handles the
 * error-prone opener-line tokenization (case-insensitivity, marker
 * validation, title extraction, body-stripping) with a maintained upstream.
 * The ~60-LoC transformer here is strictly additive on top of that output.
 * Path (b) is the escape hatch if the upstream proves problematic; one
 * file changes.
 */

import type { Blockquote, Paragraph, Root } from 'mdast';
import type { MdxJsxAttribute, MdxJsxFlowElement } from 'mdast-util-mdx';
import { visit } from 'unist-util-visit';
import type { VFile } from 'vfile';

/** GFM-canonical callout types (D-MF11). */
type CalloutType = 'note' | 'tip' | 'important' | 'warning' | 'caution';

const GFM_TYPES: ReadonlySet<string> = new Set<CalloutType>([
  'note',
  'tip',
  'important',
  'warning',
  'caution',
]);

/**
 * Alias map folding broader Obsidian / Mintlify / Pandoc / Fumadocs type
 * tokens into the GFM 5-type subset (Q-MF3 LOCKED). ~23 entries. Lossy for
 * some migrated content (see NG26 for the un-deferral framework).
 *
 * Keys are normalized to lowercase before lookup.
 */
const TYPE_ALIAS_MAP: Readonly<Record<string, CalloutType>> = {
  // GFM identity
  note: 'note',
  tip: 'tip',
  important: 'important',
  warning: 'warning',
  caution: 'caution',
  // → note
  info: 'note',
  question: 'note',
  faq: 'note',
  abstract: 'note',
  summary: 'note',
  tldr: 'note',
  todo: 'note',
  // → tip
  success: 'tip',
  idea: 'tip',
  check: 'tip',
  hint: 'tip',
  example: 'tip',
  // → warning
  warn: 'warning',
  attention: 'warning',
  // → caution
  danger: 'caution',
  error: 'caution',
  bug: 'caution',
  failure: 'caution',
  // → important
  quote: 'important',
};

/** Distinctive classPrefix so our detection is unambiguous. Matches `ok-alert-<type>`. */
const CALLOUT_CLASS_PREFIX = 'ok-alert';

const CLASS_TYPE_RE = new RegExp(`(?:^|\\s)${CALLOUT_CLASS_PREFIX}-(\\w+)(?:\\s|$)`);

/**
 * Re-inspect original source at a blockquote opener offset to detect (a) the
 * raw type token as authored (for alias mapping) and (b) the Obsidian
 * foldable marker (`+`/`-`).
 *
 * Regex: `^>\s*\[!(\w+)\]([+-])?(?:\s+(.*))?`
 *   - match[1] = raw type token (case-insensitive)
 *   - match[2] = foldable marker (`+` / `-` / undefined)
 *   - match[3] = trailing title text (optional)
 *
 * Scope note (D-MF17): foldable marker recognition is scoped to the 5 GFM
 * types via `GFM_TYPES` membership check AFTER alias normalization. If the
 * source type aliases INTO a GFM type (e.g., `> [!SUCCESS]-\nBody` →
 * `tip` via alias map), foldable is NOT honored — the authoring-side
 * Obsidian syntax maps to a GFM type but foldable + non-GFM type combos
 * are part of NG26. This is conservative: the alias map is about
 * type-token normalization, not runtime-semantic expansion.
 */
interface OpenerInspection {
  /** Raw type token as it appears in source (preserves case until alias normalization). */
  rawType: string;
  /** Foldable marker if present in source opener. */
  foldableMarker: '+' | '-' | null;
  /** Explicit title text from source (trimmed) — not the plugin's `capitalize(type)` synthetic. */
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

/**
 * Detect whether a blockquote has been tagged by `remark-github-alerts`
 * with our configured classPrefix. Returns the normalized GFM type or
 * null.
 *
 * Two-step read: (1) match against the tagged class for type recovery;
 * (2) fall back to source re-inspection for types whose class name lives
 * outside the alias map's known set.
 */
function extractTaggedType(node: Blockquote): string | null {
  const hName = (node.data as { hName?: string } | undefined)?.hName;
  if (hName !== 'div') return null;
  const hProps = (node.data as { hProperties?: { class?: string } } | undefined)?.hProperties;
  const klass = hProps?.class;
  if (typeof klass !== 'string') return null;
  const m = klass.match(CLASS_TYPE_RE);
  return m ? m[1].toLowerCase() : null;
}

/**
 * Normalize a raw type token to the GFM 5-type subset via the alias map.
 * Returns `null` for types that cannot be folded (should never happen
 * when `remark-github-alerts` is configured with `markers: '*'`, but
 * defensive for forward-compat).
 */
function normalizeType(rawType: string): CalloutType | null {
  const lower = rawType.toLowerCase();
  return TYPE_ALIAS_MAP[lower] ?? null;
}

/**
 * Build an `mdxJsxFlowElement` representing a Callout from a tagged
 * blockquote, copying the blockquote's position so Phase B's
 * position-slice walker can attach `data.sourceRaw` with the original
 * markdown bytes.
 */
function buildCalloutElement(
  blockquote: Blockquote,
  type: CalloutType,
  title: string | null,
  foldableMarker: '+' | '-' | null,
): MdxJsxFlowElement {
  const attrs: MdxJsxAttribute[] = [{ type: 'mdxJsxAttribute', name: 'type', value: type }];
  if (title) {
    attrs.push({ type: 'mdxJsxAttribute', name: 'title', value: title });
  }
  if (foldableMarker !== null) {
    // collapsible: always true when a foldable marker was authored.
    attrs.push({ type: 'mdxJsxAttribute', name: 'collapsible', value: null });
    // defaultOpen: '+' → start open, '-' → start closed.
    if (foldableMarker === '+') {
      attrs.push({ type: 'mdxJsxAttribute', name: 'defaultOpen', value: null });
    } else {
      // Explicit `defaultOpen={false}` so the authored `-` round-trips
      // through the dirty-path reconstruction if the node later edits.
      // Pristine path does not rely on this (sourceRaw wins).
      attrs.push({
        type: 'mdxJsxAttribute',
        name: 'defaultOpen',
        value: { type: 'mdxJsxAttributeValueExpression', value: 'false' },
      });
    }
  }

  // Body children: strip the plugin-injected title paragraph (first child).
  // The plugin always prepends a paragraph with class `ok-alert-title`;
  // everything after is the original blockquote body with the opener line
  // already consumed from the first text child.
  const body = blockquote.children.slice(1);

  const element: MdxJsxFlowElement = {
    type: 'mdxJsxFlowElement',
    name: 'Callout',
    attributes: attrs,
    children: body,
    // Copy position verbatim so `applyPositionSliceToNode` captures the
    // original blockquote source as sourceRaw.
    position: blockquote.position,
  };

  return element;
}

/**
 * Check that the first child of a tagged blockquote is the plugin-injected
 * title paragraph (class `ok-alert-title`) — guards against surgically
 * stripping a pre-existing body paragraph if the shape diverges.
 */
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

/**
 * Unified plugin: walks the mdast tree and replaces every blockquote tagged
 * by `remark-github-alerts` (classPrefix `ok-alert`) with an
 * `mdxJsxFlowElement(Callout, ...)`.
 *
 * Wire into the parse pipeline AFTER `remarkGithubAlerts` and BEFORE Phase
 * A (`restoreFromMdx`) / Phase B (`mergedPostParseWalkerPlugin`) so the
 * Phase-B position-slice walker attaches `data.sourceRaw` with the
 * original blockquote bytes to the emitted mdxJsxFlowElement.
 */
export function calloutTransformerPlugin() {
  return (tree: Root, file: VFile) => {
    const source = typeof file.value === 'string' ? file.value : '';

    visit(tree, 'blockquote', (node, index, parent) => {
      if (parent === undefined || typeof index !== 'number') return;

      const taggedType = extractTaggedType(node);
      if (!taggedType) return;

      // Normalize: first try alias map on the plugin-resolved type. If the
      // plugin's tagged type is e.g. `ok-alert-success`, alias → `tip`.
      let type = normalizeType(taggedType);

      // Re-inspect the original source for (a) foldable marker, (b) explicit
      // title, (c) authoritative raw-type token when alias lookup on the
      // plugin-tagged type didn't resolve. Source re-inspection is truth.
      let title: string | null = null;
      let foldableMarker: '+' | '-' | null = null;
      if (node.position?.start?.offset !== undefined) {
        const opener = inspectOpenerLine(source, node.position.start.offset);
        if (opener) {
          title = opener.title;
          // Fall-back type normalization from source — covers cases where
          // plugin-tagged type diverged (shouldn't happen, but defensive).
          if (!type) type = normalizeType(opener.rawType);
          // D-MF17: foldable recognition scoped to GFM 5 types only. If
          // alias mapped `success` → `tip`, we DO honor the foldable marker
          // because the normalized type IS in GFM_TYPES. This is consistent
          // with the rest of the narrow: the alias map is about token
          // normalization, foldable scope follows the normalized type.
          if (type && GFM_TYPES.has(type)) {
            foldableMarker = opener.foldableMarker;
          }
        }
      }

      if (!type) return; // unknown type; leave blockquote untouched (rare)

      // Safety: only strip the first child if it's the plugin's synthetic
      // title paragraph. If the shape diverges (e.g. plugin disabled / a
      // different attacher), leave the tree as-is and the default blockquote
      // handler will render it.
      if (!isPluginTitleParagraph(node.children[0])) return;

      const element = buildCalloutElement(node, type, title, foldableMarker);
      (parent.children as unknown[])[index] = element;
    });
  };
}

/**
 * Trivial placeholder SVG that keeps the upstream plugin's `encodeSvg`
 * call from throwing when it encounters an alias marker (e.g. `success`,
 * `danger`) that has no entry in its built-in `DEFAULT_GITHUB_ICONS`. Our
 * downstream transformer discards the plugin-injected title paragraph
 * (including its `<span style="--oct-icon: url(data:image/svg+xml;utf8,...)">`)
 * when it emits `mdxJsxFlowElement(Callout, ...)` — the icon never surfaces
 * in the final mdast. The DIY Callout renderer has its own typeIconMap.
 */
const PLACEHOLDER_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" width="16" height="16"></svg>';

/**
 * Icon map covering every alias token recognized by `TYPE_ALIAS_MAP` plus
 * the GFM 5 base types. Every entry points to the same placeholder SVG —
 * the plugin requires a non-undefined icon value for each marker it might
 * match, but our transformer strips the icon wrapper before it reaches
 * the React renderer.
 */
const PLUGIN_ICON_MAP: Readonly<Record<string, string>> = Object.fromEntries(
  Object.keys(TYPE_ALIAS_MAP).map((k) => [k, PLACEHOLDER_SVG]),
);

/**
 * Options tuple for the upstream `remark-github-alerts` plugin. Exported so
 * `pipeline.ts` can wire the plugin with our canonical options AND tests
 * can re-use the exact options shape.
 *
 * - `markers: Object.keys(TYPE_ALIAS_MAP)` — exactly the set our alias map
 *   recognizes. `'*'` (any word) would let stray `[!foo]` inside source
 *   hit the plugin but our transformer would fail to normalize → we'd
 *   leave a confusingly-tagged blockquote. Explicit allowlist keeps the
 *   plugin's match behavior aligned with our normalization behavior.
 *
 * - `classPrefix: CALLOUT_CLASS_PREFIX` — unambiguous signature for our
 *   transformer's detection. No collision with stray `markdown-alert` classes
 *   that might appear from other sources.
 *
 * - `icons: PLUGIN_ICON_MAP` — placeholder SVGs for every alias token so
 *   the plugin's `encodeSvg(icon)` call doesn't crash on non-GFM markers.
 */
export const REMARK_GITHUB_ALERTS_OPTIONS = {
  markers: Object.keys(TYPE_ALIAS_MAP),
  classPrefix: CALLOUT_CLASS_PREFIX,
  matchCaseSensitive: false,
  icons: PLUGIN_ICON_MAP,
};
