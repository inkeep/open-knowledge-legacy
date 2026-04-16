/**
 * THROWAWAY — one-shot driver for the R20 mdast diff validator.
 *
 * Runs the pre-merge 5-pass pipeline against the post-merge 2-phase
 * pipeline (restoreFromMdx + mergedPostParseWalkerPlugin) over the full
 * fixture corpus and prints the validation report. Deletes with the rest
 * of the R17 scaffolding once US-008 ships green.
 *
 * Usage:
 *   bun run specs/2026-04-16-markdown-pipeline-engineering-health/evidence/r17-run-diff.ts
 *   R17_PERF_ALL=1 bun run .../r17-run-diff.ts  (include 2.5K/5K/10K/20K perf fixtures)
 */

import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import remarkFrontmatter from 'remark-frontmatter';
import remarkGfm from 'remark-gfm';
import remarkParse from 'remark-parse';
import { type Processor, unified } from 'unified';
import {
  buildPreMergeFactory,
  formatReport,
  loadCorpus,
  type ProcessorFactory,
  validate,
} from './r17-mdast-equivalence.ts';

const WORKTREE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const MARKDOWN_DIR = resolve(WORKTREE_ROOT, 'packages/core/src/markdown');

const [mdxAgnostic, wikiLink, autolinkGuard, mergedWalker] = await Promise.all([
  import(`${MARKDOWN_DIR}/remark-mdx-agnostic.ts`),
  import(`${MARKDOWN_DIR}/wiki-link-micromark.ts`),
  import(`${MARKDOWN_DIR}/autolink-void-html-guard.ts`),
  import(`${MARKDOWN_DIR}/merged-walker.ts`),
]);

const { remarkMdxAgnostic } = mdxAgnostic;
const { remarkWikiLink } = wikiLink;
const { restoreFromMdx } = autolinkGuard;
const { mergedPostParseWalkerPlugin } = mergedWalker;

/**
 * Post-merge factory mirrors `createParseProcessor`'s Phase A + Phase B shape
 * but stops before `ensureNonEmptyDoc` + `remarkProseMirror` (outside R17).
 */
function buildPostMergeFactory(): ProcessorFactory {
  return () => {
    const p = unified()
      .use(remarkParse)
      .use(remarkFrontmatter, ['yaml'])
      .use(remarkMdxAgnostic)
      .use(remarkGfm)
      .use(remarkWikiLink)
      .use(restoreFromMdx) // Phase A
      .use(mergedPostParseWalkerPlugin); // Phase B
    p.freeze();
    return p as unknown as Processor;
  };
}

const fixtures = await loadCorpus();
console.error(`[r17-run-diff] loaded ${fixtures.length} fixtures`);
const result = validate(buildPreMergeFactory(), buildPostMergeFactory(), fixtures);
console.log(formatReport(result));
if (result.mismatches > 0 || result.threwDifferently > 0) {
  process.exit(1);
}
