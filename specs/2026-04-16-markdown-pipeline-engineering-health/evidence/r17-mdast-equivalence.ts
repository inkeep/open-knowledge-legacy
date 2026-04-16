/**
 * R20 byte-for-byte mdast diff validator for R17 (merged-walker) refactor.
 *
 * THROWAWAY — delete after US-008 (R17) ships green.
 *
 * Purpose:
 *   R17 merges 5 post-parse transformer passes into 2 phases (Phase A:
 *   restoreFromMdx alone; Phase B: merged dispatcher for passes 2-5). The
 *   only safe acceptance criterion is byte-for-byte mdast equivalence
 *   against the full fixture corpus. Subtle ordering bugs are invisible
 *   to example-based tests and hand-crafted scenarios — a full-corpus
 *   diff is the correctness proof (SPEC R20 / MH-D18).
 *
 * Design:
 *   Accepts two processor factories:
 *     beforeFactory: builds a processor that runs the current 5-pass pipeline
 *     afterFactory:  builds a processor that runs the candidate R17 pipeline
 *
 *   Both factories must return an already-frozen processor whose
 *   `.parse(file).then(.runSync)` produces mdast AFTER the 5 passes but
 *   BEFORE `ensureNonEmptyDoc` and `remarkProseMirror` (which R17 does not
 *   touch). The factory in this file (`buildPreMergeFactory`) is the
 *   authoritative reference.
 *
 * Landing mode (US-007):
 *   Invoking this file directly runs the self-check: pre-merge factory vs
 *   itself across the full corpus. Expected result: 0 divergences. Any
 *   divergence indicates a nondeterminism bug somewhere in the pre-merge
 *   pipeline — blocking for R17 because the target of comparison would
 *   not be stable.
 *
 * US-008 use:
 *   ```ts
 *   import { validate, buildPreMergeFactory } from './r17-mdast-equivalence.ts';
 *   import { buildMergedWalkerFactory } from '<r17-impl>';
 *   const result = validate(buildPreMergeFactory(), buildMergedWalkerFactory());
 *   if (result.failed > 0) process.exit(1);
 *   ```
 */

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Root as MdastRoot } from 'mdast';
import remarkFrontmatter from 'remark-frontmatter';
import remarkGfm from 'remark-gfm';
import remarkParse from 'remark-parse';
import { type Processor, unified } from 'unified';
import { VFile } from 'vfile';

// Import the 5 passes + the syntax extensions they depend on.
// Relative path: from specs/…/evidence/ up to the worktree root, then into packages/core.
const WORKTREE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const MARKDOWN_DIR = resolve(WORKTREE_ROOT, 'packages/core/src/markdown');
const FIXTURES_DIR = resolve(MARKDOWN_DIR, 'fixtures');

// NOTE: dynamic relative imports so this script lives in specs/ but reaches
// code under packages/core/. Using `await import()` keeps type resolution
// simple when tsc doesn't have the fixture aliases configured.
const pluginMods = {
  mdxAgnostic: await import(`${MARKDOWN_DIR}/remark-mdx-agnostic.ts`),
  wikiLink: await import(`${MARKDOWN_DIR}/wiki-link-micromark.ts`),
  autolinkGuard: await import(`${MARKDOWN_DIR}/autolink-void-html-guard.ts`),
  autolinkPromotion: await import(`${MARKDOWN_DIR}/autolink-promotion.ts`),
  docStartThematicFix: await import(`${MARKDOWN_DIR}/doc-start-thematic-fix.ts`),
  positionSlice: await import(`${MARKDOWN_DIR}/position-slice.ts`),
  unknownMdastGuard: await import(`${MARKDOWN_DIR}/unknown-mdast-guard.ts`),
  fixtures: await import(`${FIXTURES_DIR}/index.ts`),
};

const { remarkMdxAgnostic } = pluginMods.mdxAgnostic as {
  remarkMdxAgnostic: () => (tree: MdastRoot) => void;
};
const { remarkWikiLink } = pluginMods.wikiLink as {
  remarkWikiLink: () => (tree: MdastRoot) => void;
};
const { protectFromMdx, restoreFromMdx } = pluginMods.autolinkGuard as {
  protectFromMdx: (src: string) => string;
  restoreFromMdx: () => (tree: MdastRoot) => void;
};
const { autolinkPromotionPlugin } = pluginMods.autolinkPromotion as {
  autolinkPromotionPlugin: () => (tree: MdastRoot) => void;
};
const { docStartThematicFixPlugin } = pluginMods.docStartThematicFix as {
  docStartThematicFixPlugin: () => (tree: MdastRoot) => void;
};
const { positionSlicePlugin } = pluginMods.positionSlice as {
  positionSlicePlugin: () => (tree: MdastRoot, file: VFile) => void;
};
const { unknownMdastGuardPlugin } = pluginMods.unknownMdastGuard as {
  unknownMdastGuardPlugin: () => (tree: MdastRoot, file: VFile) => void;
};
const { loadGfmExamples, loadMdxCrashTaxonomy, loadPerfFixture, PERF_BLOCK_COUNTS } =
  pluginMods.fixtures as {
    loadGfmExamples: () => Array<{ section: string; markdown: string }>;
    loadMdxCrashTaxonomy: () => Array<{
      id: string;
      input: string;
      class: string;
      expectedOutcome: string;
    }>;
    loadPerfFixture: (count: number) => string;
    PERF_BLOCK_COUNTS: readonly number[];
  };

// ─── Factories ────────────────────────────────────────────────────────────

/**
 * Factory for the current (pre-merge) pipeline — 5 separate visit() passes.
 * Mirrors `createParseProcessor` in pipeline.ts up through unknownMdastGuard,
 * stopping short of `ensureNonEmptyDoc` + `remarkProseMirror` (those are
 * outside R17's scope).
 */
export function buildPreMergeFactory(): ProcessorFactory {
  return () => {
    const p = unified()
      .use(remarkParse)
      .use(remarkFrontmatter, ['yaml'])
      .use(remarkMdxAgnostic)
      .use(remarkGfm)
      .use(remarkWikiLink)
      // 5 transformer passes — R17's scope:
      .use(restoreFromMdx) // Pass 1
      .use(autolinkPromotionPlugin) // Pass 2
      .use(docStartThematicFixPlugin) // Pass 3
      .use(positionSlicePlugin) // Pass 4
      .use(unknownMdastGuardPlugin); // Pass 5
    p.freeze();
    return p as unknown as Processor;
  };
}

export type ProcessorFactory = () => Processor;

// ─── Fixture enumeration ──────────────────────────────────────────────────

export interface Fixture {
  /** Stable label for diff reports (fixture corpus + sub-label). */
  label: string;
  source: string;
}

/**
 * Load the full fixture corpus across all 7 subdirectories. Deterministic
 * ordering so diff reports are stable across runs.
 *
 * Opt-in knobs (env vars):
 *   R17_SKIP_PERF=1   — skip the large perf/*.md fixtures (useful for quick
 *                       local iteration; default is to include perf 100 +
 *                       500 + 1000, which take ~1s combined).
 *   R17_PERF_ALL=1    — also include 2.5K / 5K / 10K / 20K perf fixtures
 *                       (default skipped — they add ~30s per pipeline run).
 */
export async function loadCorpus(): Promise<Fixture[]> {
  const fixtures: Fixture[] = [];

  // commonmark/ — 652 examples from the commonmark.json package
  const { commonmark } = (await import('commonmark.json')) as unknown as {
    commonmark: Array<{ section: string; markdown: string }>;
  };
  commonmark.forEach((ex, i) => {
    fixtures.push({
      label: `commonmark[${i}] ${ex.section}`,
      source: ex.markdown,
    });
  });

  // gfm/ — 20 examples
  const gfm = loadGfmExamples();
  gfm.forEach((ex, i) => {
    fixtures.push({ label: `gfm[${i}] ${ex.section}`, source: ex.markdown });
  });

  // mdx/ — 26-class crash taxonomy. Some inputs are deliberately malformed
  // (C02, C15, etc.) — the validator must tolerate parse errors and count
  // them as "equivalently broken" rather than fail.
  const mdx = loadMdxCrashTaxonomy();
  mdx.forEach((entry) => {
    fixtures.push({
      label: `mdx[${entry.id}] ${entry.class}`,
      source: entry.input,
    });
  });

  // wiki-links/ — no on-disk fixtures yet; synthesize inline coverage of
  // the wikiLink micromark extension's shapes: target-only, alias, anchor,
  // combined, and redlink (empty target is valid per the extension).
  for (const [label, source] of WIKI_LINK_INLINE_FIXTURES) {
    fixtures.push({ label: `wiki-links[${label}]`, source });
  }

  // frontmatter/ — no on-disk fixtures yet; synthesize yaml + yaml-alone
  // + yaml-with-content shapes. Exercises NG11 (empty-doc paragraph
  // synthesis) and the yaml frontmatter interaction with doc-start
  // thematicBreak logic (pass 3).
  for (const [label, source] of FRONTMATTER_INLINE_FIXTURES) {
    fixtures.push({ label: `frontmatter[${label}]`, source });
  }

  // ng-pinned/ — no on-disk fixtures yet; synthesize the canonical NG1 +
  // NG10 + NG11 inputs documented in evidence/ng-pinned-canonicals.md.
  for (const [label, source] of NG_PINNED_INLINE_FIXTURES) {
    fixtures.push({ label: `ng-pinned[${label}]`, source });
  }

  // perf/ — opt-in by env var. These are large, but they exercise exactly
  // the O(n) per-pass behavior that R17 consolidates.
  if (process.env.R17_SKIP_PERF !== '1') {
    const included = process.env.R17_PERF_ALL === '1'
      ? PERF_BLOCK_COUNTS
      : PERF_BLOCK_COUNTS.filter((n) => n <= 1000);
    for (const count of included) {
      fixtures.push({
        label: `perf[${count}]`,
        source: loadPerfFixture(count as 100 | 500 | 1000 | 5000 | 10000 | 20000),
      });
    }
  }

  return fixtures;
}

// NOTE: `loadCorpus` is implemented with top-level-await-style dynamic imports
// above — this file is ESM-only and Bun/Node both support it in a run script.

const WIKI_LINK_INLINE_FIXTURES: Array<[string, string]> = [
  ['target-only', 'See [[Home]] for more.\n'],
  ['alias', 'Visit [[Architecture|the arch page]].\n'],
  ['anchor', 'See [[Specs#decisions]].\n'],
  ['combined', '[[Docs#intro|the docs intro]]\n'],
  ['redlink', 'Broken: [[DoesNotExist]].\n'],
];

const FRONTMATTER_INLINE_FIXTURES: Array<[string, string]> = [
  ['yaml-alone', '---\ntitle: X\n---\n'],
  ['yaml-plus-content', '---\ntitle: Hello\n---\n\n# Body\n\nParagraph.\n'],
  ['empty-frontmatter', '---\n---\n'],
];

const NG_PINNED_INLINE_FIXTURES: Array<[string, string]> = [
  ['ng1-blank-lines', '# H\n\n\n\nP\n'],
  ['ng10-dashes-only', '---\n\n---\n'],
  ['ng11-yaml-only', '---\ntitle: X\n---\n'],
];

// ─── Stable serialization ────────────────────────────────────────────────

/**
 * Stable JSON stringify with deterministic key order. Drops nothing — every
 * mdast field (including `position`) is part of the byte-identical contract.
 *
 * Why not JSON.stringify with a replacer? Object property order in V8/JSC is
 * insertion-order by spec, so two runs through the same transformer chain
 * produce identical iteration order — but a refactored visitor may set
 * properties in a different order on synthesized nodes. Forcing lexicographic
 * key order makes the byte-identity check robust to property-assignment
 * order changes that are semantically irrelevant.
 */
export function stableStringify(node: unknown): string {
  return JSON.stringify(sortKeys(node));
}

function sortKeys(node: unknown): unknown {
  if (node === null || typeof node !== 'object') return node;
  if (Array.isArray(node)) return node.map(sortKeys);
  const sorted: Record<string, unknown> = {};
  for (const key of Object.keys(node as Record<string, unknown>).sort()) {
    sorted[key] = sortKeys((node as Record<string, unknown>)[key]);
  }
  return sorted;
}

// ─── Per-fixture comparison ──────────────────────────────────────────────

/**
 * Run `source` through `factory()`. Mirrors parseMd's pre-pass (protectFromMdx)
 * + VFile bind + parse + runSync, but stops before the final stringify (we
 * want the mdast, not the PM doc). Returns the transformed mdast tree.
 *
 * Catches parse errors and returns them as strings — the validator classifies
 * two errors with identical messages as equivalent (both pipelines fail the
 * same way on the same input).
 */
function runToMdast(factory: ProcessorFactory, source: string): MdastRoot | { error: string } {
  try {
    const processor = factory();
    const protectedSrc = protectFromMdx(source);
    const file = new VFile(protectedSrc);
    const tree = processor.parse(file) as MdastRoot;
    // Match parseMd: swap VFile.value back to the ORIGINAL source before
    // transformers run, so positionSlice reads authoring-form chars.
    file.value = source;
    processor.runSync(tree, file);
    return tree;
  } catch (err) {
    const msg = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
    return { error: msg };
  }
}

export interface FixtureResult {
  label: string;
  /** 'match' | 'mismatch' | 'both-threw-same' | 'threw-differently' */
  status: 'match' | 'mismatch' | 'both-threw-same' | 'threw-differently';
  /** When status !== match/both-threw-same, describes first divergence. */
  diff?: string;
  /** Length of each side's serialized mdast, for quick scan of the report. */
  beforeSize?: number;
  afterSize?: number;
}

export interface ValidationResult {
  total: number;
  matches: number;
  mismatches: number;
  bothThrewSame: number;
  threwDifferently: number;
  failures: FixtureResult[];
  durationMs: number;
}

/**
 * Validate byte-identical mdast output between `beforeFactory` and
 * `afterFactory` across `fixtures`. Returns a structured report.
 *
 * A fresh processor instance is constructed per fixture call (not shared
 * across fixtures). This protects against any hypothetical per-processor
 * state bleed that R16's idempotency refactor already eliminated — cheap
 * insurance for the validator itself.
 */
export function validate(
  beforeFactory: ProcessorFactory,
  afterFactory: ProcessorFactory,
  fixtures: Fixture[],
): ValidationResult {
  const start = performance.now();
  const failures: FixtureResult[] = [];
  let matches = 0;
  let mismatches = 0;
  let bothThrewSame = 0;
  let threwDifferently = 0;

  for (const fx of fixtures) {
    const before = runToMdast(beforeFactory, fx.source);
    const after = runToMdast(afterFactory, fx.source);

    // Both threw — classify as equivalent iff messages match.
    if ('error' in before && 'error' in after) {
      if (before.error === after.error) {
        bothThrewSame++;
      } else {
        threwDifferently++;
        failures.push({
          label: fx.label,
          status: 'threw-differently',
          diff: `before: ${before.error}\nafter:  ${after.error}`,
        });
      }
      continue;
    }

    // One threw, the other didn't.
    if ('error' in before || 'error' in after) {
      threwDifferently++;
      failures.push({
        label: fx.label,
        status: 'threw-differently',
        diff:
          'error' in before
            ? `before threw: ${before.error}\nafter: produced mdast`
            : `before: produced mdast\nafter threw: ${(after as { error: string }).error}`,
      });
      continue;
    }

    // Both produced mdast — compare stable JSON.
    const beforeJson = stableStringify(before);
    const afterJson = stableStringify(after);
    if (beforeJson === afterJson) {
      matches++;
    } else {
      mismatches++;
      failures.push({
        label: fx.label,
        status: 'mismatch',
        diff: firstDivergence(beforeJson, afterJson),
        beforeSize: beforeJson.length,
        afterSize: afterJson.length,
      });
    }
  }

  return {
    total: fixtures.length,
    matches,
    mismatches,
    bothThrewSame,
    threwDifferently,
    failures,
    durationMs: performance.now() - start,
  };
}

/** Summarize the first byte divergence with ±40 chars of context. */
function firstDivergence(a: string, b: string): string {
  const len = Math.min(a.length, b.length);
  let i = 0;
  while (i < len && a[i] === b[i]) i++;
  if (i === a.length && i === b.length) return '(identical but stable-stringify disagreed??)';
  const contextStart = Math.max(0, i - 40);
  const aSnippet = a.slice(contextStart, i + 40);
  const bSnippet = b.slice(contextStart, i + 40);
  return `@offset ${i} (sizes ${a.length} vs ${b.length}):\n  before: ...${aSnippet}...\n  after:  ...${bSnippet}...`;
}

// ─── Report rendering ────────────────────────────────────────────────────

export function formatReport(result: ValidationResult): string {
  const lines: string[] = [];
  lines.push('## R17 mdast-equivalence validation');
  lines.push('');
  lines.push(`- fixtures:            ${result.total}`);
  lines.push(`- matches:             ${result.matches}`);
  lines.push(`- mismatches:          ${result.mismatches}`);
  lines.push(`- both threw (same):   ${result.bothThrewSame}`);
  lines.push(`- threw differently:   ${result.threwDifferently}`);
  lines.push(`- runtime:             ${result.durationMs.toFixed(1)}ms`);
  lines.push('');
  if (result.failures.length === 0) {
    lines.push('_All fixtures produced byte-identical mdast._');
    return lines.join('\n');
  }
  lines.push(`### Divergences (${result.failures.length})`);
  for (const f of result.failures.slice(0, 50)) {
    lines.push('');
    lines.push(`- **${f.label}** [${f.status}]`);
    if (f.diff) {
      for (const line of f.diff.split('\n')) lines.push(`    ${line}`);
    }
  }
  if (result.failures.length > 50) {
    lines.push('');
    lines.push(`_…${result.failures.length - 50} additional divergences truncated._`);
  }
  return lines.join('\n');
}

// ─── CLI entry ────────────────────────────────────────────────────────────

if (import.meta.main) {
  const fixtures = await loadCorpus();
  console.error(`[r17-validator] loaded ${fixtures.length} fixtures`);
  const result = validate(buildPreMergeFactory(), buildPreMergeFactory(), fixtures);
  const report = formatReport(result);
  console.log(report);
  if (
    result.mismatches > 0 ||
    result.threwDifferently > 0 ||
    (result.failures.length > 0 && result.failures.some((f) => f.status === 'mismatch'))
  ) {
    process.exit(1);
  }
}
