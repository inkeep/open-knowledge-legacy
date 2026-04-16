/**
 * R17 — 2-phase merged post-parse walker (Phase B).
 *
 * Phase A (`restoreFromMdx` in `autolink-void-html-guard.ts`) runs first as
 * its own visitor pass; it restores PUA sentinels to literal `<`, `>`, `:`,
 * `@`, `{` inside text/URL/title/alt fields. That phase stays standalone
 * because Phase B's pass 2 (autolink promotion) regex-matches on the
 * literal `<` and `>` characters Phase A restores — a single same-node
 * visitor cannot satisfy that ordering (see
 * `specs/2026-04-16-markdown-pipeline-engineering-health/evidence/pipeline-refactor-audit.md`
 * §R17).
 *
 * Phase B — this module — merges the four previously-separate post-parse
 * transformers into a single `unist-util-visit` traversal:
 *
 *   Pass 2: `autolinkPromotionPlugin`  — `<scheme:uri>` text → semantic link
 *   Pass 3: `docStartThematicFixPlugin` — root-position empty yaml → thematicBreak
 *   Pass 4: `positionSlicePlugin`      — attach source-form data to node.data
 *   Pass 5: `unknownMdastGuardPlugin`  — unknown type → rawMdxFallbackMdast
 *
 * ### Dispatch strategy
 *
 * 1. Pass 3 runs once outside the visit, as a tree-level pre-step. Only fires
 *    when `tree.children[0]` is a root-position empty yaml node; the mutation
 *    replaces that yaml node with one-or-more synthesized `thematicBreak`s.
 *    Handling it as a pre-step keeps the inner visit callback simple and
 *    preserves the exact byte-sequence of the pre-merge pipeline — when the
 *    visit subsequently descends into the new thematicBreak(s), pass 4's
 *    position-slice logic overwrites `data.sourceRaw` with an identical
 *    value sliced from `source` for the first thematicBreak (position
 *    attached) and leaves it untouched for later ones (position absent →
 *    pass 4 early-returns, preserving the pre-set value).
 *
 * 2. For every other node the merged visit callback runs in this order:
 *
 *    a. **Pass 5 first, with `SKIP`.** If `node.type` is not in
 *       `KNOWN_MDAST_TYPES`, replace `parent.children[index]` with a
 *       fallback and return `SKIP` so the visitor does not descend into
 *       the removed node's children. Correctness: the pre-merge pipeline
 *       runs passes 2 and 4 on unknown nodes too, but their mutations are
 *       either (a) discarded when pass 5 substitutes (data attachment)
 *       or (b) preserved only on sibling nodes at the parent level
 *       (promotion of autolinks in OTHER text siblings of the parent
 *       happens during the PARENT's callback, not the unknown child's).
 *       Running pass 5 first and SKIP-ping is byte-identically equivalent
 *       and measurably faster on unknown-heavy inputs.
 *
 *    b. **Pass 2** — autolink promotion. Fires on any node with a
 *       `children` array containing at least one text child. Mutates
 *       `node.children` in place via `promoteInParent`. Newly-synthesized
 *       children lack positions and are visited normally on descent;
 *       pass 4 will early-exit on missing-position nodes.
 *
 *    c. **Pass 4** — position slice. Attaches `data.sourceDelimiter`,
 *       `data.sourceRaw`, `data.escapedChars`, etc. Reads the ORIGINAL
 *       source (swapped back into `file.value` by `parseMd` before the
 *       transformer runs) so authoring-form chars are preserved.
 *
 * ### Why `unist-util-visit` as the outer loop
 *
 * Pass 2 reassigns `parent.children` mid-visit. `unist-util-visit`'s
 * index-based iteration handles this correctly — adding/removing later
 * siblings is picked up without an index return, removing earlier siblings
 * requires returning a new index. A custom tree-walker would re-introduce
 * the class of bug this refactor is eliminating.
 *
 * ### Acceptance
 *
 * Byte-for-byte mdast equivalence across the full fixture corpus is the
 * only correctness proof — see `evidence/r17-mdast-equivalence.ts` (US-007)
 * and the `merged-walker.equivalence.test.ts` gate alongside this file.
 */

import type { Nodes, Parent, Root } from 'mdast';
import { SKIP, visit } from 'unist-util-visit';
import type { VFile } from 'vfile';
import { promoteInParent } from './autolink-promotion.ts';
import { applyDocStartThematicFix } from './doc-start-thematic-fix.ts';
import { applyPositionSliceToNode } from './position-slice.ts';
import { KNOWN_MDAST_TYPES, toRawMdxFallbackMdast } from './unknown-mdast-guard.ts';

/**
 * Unified plugin: runs Phase B of the R17 2-phase post-parse walker.
 *
 * Wire into a unified pipeline immediately after `restoreFromMdx` (Phase A):
 *
 * ```ts
 * .use(restoreFromMdx)           // Phase A
 * .use(mergedPostParseWalkerPlugin) // Phase B (this module)
 * ```
 */
export function mergedPostParseWalkerPlugin() {
  return (tree: Root, file: VFile) => {
    const source = typeof file.value === 'string' ? file.value : '';

    // Pass 3 — tree-level pre-step. Mutates `tree.children[0]` if the first
    // node is a root-position empty yaml (the NG10 doc-start ambiguity).
    applyDocStartThematicFix(tree, file);

    // Debug observability — opt-in via env var; same flag as the standalone
    // positionSlicePlugin so both paths print identical warnings.
    const debug = typeof process !== 'undefined' && process.env?.OK_DEBUG_POSITION_SLICE === '1';

    // Single visit call dispatches passes 2, 4, and 5 per node.
    visit(tree, (node, index, parent) => {
      // Pass 5 — short-circuit. Unknown type: replace at parent, SKIP descent
      // so we do not recurse into children of the removed node.
      if (
        parent !== undefined &&
        typeof index === 'number' &&
        typeof node.type === 'string' &&
        !KNOWN_MDAST_TYPES.has(node.type)
      ) {
        const replacement = toRawMdxFallbackMdast(node, source);
        (parent.children as unknown[])[index] = replacement;
        return SKIP;
      }

      // Pass 2 — autolink promotion for any parent-like node carrying a text
      // child. `promoteInParent` is a no-op if no text child matches the
      // autolink regex, so this check is cheap.
      if ('children' in node && Array.isArray((node as Parent).children)) {
        const parentLike = node as Parent;
        if (parentLike.children.some((c) => c.type === 'text')) {
          promoteInParent(parentLike);
        }
      }

      // Pass 4 — position slice. Attaches source-form data to node.data.
      // No-op on missing/out-of-bounds positions (matches the standalone
      // positionSlicePlugin's behavior).
      applyPositionSliceToNode(node as Nodes, source, debug);
    });
  };
}
