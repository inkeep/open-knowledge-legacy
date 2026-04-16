/**
 * Per-stage parse-pipeline profile harness (SPEC §6 R3a).
 *
 * STATUS. One-off diagnostic. This file is NOT a unit test and is NOT promoted
 * to `packages/core/tests/` — running it is opt-in via
 * `bun run specs/2026-04-16-markdown-pipeline-engineering-health/evidence/perf-profile-harness.ts`.
 * Rationale: attributing parse-time cost to individual stages requires
 * rebuilding partial `unified()` processors and applying transformers
 * one at a time, which is structurally unlike the production code path.
 * Keeping this as an evidence artifact, not a test, avoids implying the
 * decomposition is canonical.
 *
 * WHAT IT MEASURES. The production parse path, per `pipeline.ts`, is:
 *
 *   source
 *   ├─ (a) protectFromMdx            — custom pre-parse string transform
 *   ├─ (b) processor.parse(file)     — remarkParse + all syntax extensions
 *   │                                  (frontmatter, mdx, gfm, wiki-link) fused
 *   ├─ (c) transformers (runSync):
 *   │     • restoreFromMdx           — PUA sentinel restoration
 *   │     • autolinkPromotionPlugin  — `<scheme:uri>` → link nodes
 *   │     • docStartThematicFixPlugin — NG10 empty-yaml → thematicBreak
 *   │     • positionSlicePlugin       — source-form attrs
 *   │     • unknownMdastGuardPlugin   — unknown-type → rawMdxFallback
 *   │     • ensureNonEmptyDoc         — empty-doc guard
 *   └─ (d) stringify                  — remarkProseMirror (mdast → PM doc)
 *
 * Each stage is timed independently by constructing the pipeline prefix
 * required, running the upstream stages once to produce the tree, then
 * timing the target stage in isolation over N measured iterations.
 *
 * Parse-stage decomposition. `processor.parse()` fuses all syntax
 * extensions contributed by remarkFrontmatter / remarkMdxAgnostic /
 * remarkGfm / remarkWikiLink (they register micromark extensions that
 * remarkParse consumes in a single pass). Marginal cost per extension
 * is approximated via subset-processor timings (only at 1K and 10K
 * blocks for signal-to-noise) — deltas between adjacent subsets are
 * attributed to the newly-added extension.
 *
 * METHODOLOGY. Same as R1: 5 warm-ups + 5 measured runs per (stage,
 * blockCount), `Bun.gc(true)` between runs, `performance.now()` timing,
 * runner metadata captured.
 *
 * OUTPUT. Machine-readable `perf-profile.json` + human-readable
 * `perf-profile.md` (authored alongside this harness; do not regenerate
 * the markdown mechanically — update it by hand when re-measuring).
 */

import { writeFileSync } from 'node:fs';
import { cpus, hostname, totalmem } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Root as MdastRoot } from 'mdast';
import remarkFrontmatter from 'remark-frontmatter';
import remarkGfm from 'remark-gfm';
import remarkParse from 'remark-parse';
import { unified } from 'unified';
import { VFile } from 'vfile';

// Extensions list drives the schema for the PM stringify stage.
import { sharedExtensions } from '../../../packages/core/src/extensions/shared.ts';
// Explicit dispatch of every pipeline stage — mirrors pipeline.ts:95-108.
import { autolinkPromotionPlugin } from '../../../packages/core/src/markdown/autolink-promotion.ts';
import {
  protectFromMdx,
  restoreFromMdx,
} from '../../../packages/core/src/markdown/autolink-void-html-guard.ts';
import { docStartThematicFixPlugin } from '../../../packages/core/src/markdown/doc-start-thematic-fix.ts';
import {
  PERF_BLOCK_COUNTS,
  loadPerfFixture,
  type PerfBlockCount,
} from '../../../packages/core/src/markdown/fixtures/index.ts';
import { MarkdownManager } from '../../../packages/core/src/markdown/index.ts';
import { positionSlicePlugin } from '../../../packages/core/src/markdown/position-slice.ts';
import { remarkMdxAgnostic } from '../../../packages/core/src/markdown/remark-mdx-agnostic.ts';
import { unknownMdastGuardPlugin } from '../../../packages/core/src/markdown/unknown-mdast-guard.ts';
import { remarkWikiLink } from '../../../packages/core/src/markdown/wiki-link-micromark.ts';
import '../../../packages/core/src/markdown/mdast-augmentation.ts';

import {
  type FromProseMirrorOptions,
  type RemarkProseMirrorOptions,
  remarkProseMirror,
} from '@handlewithcare/remark-prosemirror';
import { getSchema } from '@tiptap/core';
import type { Schema } from '@tiptap/pm/model';

// ───────────────────────── Methodology ────────────────────────────────────

const WARMUP_ITERS = 5;
const MEASURED_ITERS = 5;

// Parse-subset attribution runs a separate processor build per subset —
// restrict to two block counts to keep the harness runtime tractable
// (processor construction + parse is expensive).
const SUBSET_BLOCK_COUNTS: PerfBlockCount[] = [1000, 10000];

// ───────────────────────── Stats helpers ──────────────────────────────────

interface Stats {
  mean: number;
  min: number;
  max: number;
  p50: number;
  p95: number;
  p99: number;
}

function stats(samples: number[]): Stats {
  const sorted = [...samples].sort((a, b) => a - b);
  const pct = (p: number) => {
    const idx = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length));
    return sorted[idx];
  };
  const sum = samples.reduce((a, b) => a + b, 0);
  return {
    mean: sum / samples.length,
    min: sorted[0],
    max: sorted[sorted.length - 1],
    p50: pct(50),
    p95: pct(95),
    p99: pct(99),
  };
}

function measure<T>(op: () => T, n: number, warmup: number): number[] {
  for (let i = 0; i < warmup; i++) op();
  const samples: number[] = [];
  for (let i = 0; i < n; i++) {
    if (typeof (Bun as { gc?: (force: boolean) => void }).gc === 'function') {
      (Bun as unknown as { gc: (force: boolean) => void }).gc(true);
    }
    const t0 = performance.now();
    op();
    samples.push(performance.now() - t0);
  }
  return samples;
}

// ───────────────────────── Pipeline shims ─────────────────────────────────
//
// Each helper builds exactly the part of the pipeline its stage needs. We do
// NOT reuse a full processor across stages — doing so would hide per-stage
// cost behind unified's internal fused execution.

function buildFullParseProcessor() {
  return (
    unified()
      .use(remarkParse)
      .use(remarkFrontmatter, ['yaml'])
      .use(remarkMdxAgnostic)
      .use(remarkGfm)
      .use(remarkWikiLink)
      // Transformer stages intentionally NOT added here — we time them
      // individually against the fresh mdast output of processor.parse().
  );
}

/**
 * Parse-subset processors (for marginal-cost attribution). `parse()` on
 * these returns a tree produced by the syntax-extension set up to the
 * named stage. Deltas between adjacent subsets ≈ that extension's cost.
 *
 * Each subset builds a fresh processor in one fluent chain — unified's
 * Processor type narrows per `.use()` call, so reassigning a single
 * local `p` tripped the discriminated-union checker. A function per
 * subset is cleaner and avoids the type dance.
 */
function buildParseOnly() {
  return unified().use(remarkParse);
}
function buildParseWithFrontmatter() {
  return unified().use(remarkParse).use(remarkFrontmatter, ['yaml']);
}
function buildParseWithMdx() {
  return unified().use(remarkParse).use(remarkFrontmatter, ['yaml']).use(remarkMdxAgnostic);
}
function buildParseWithGfm() {
  return unified()
    .use(remarkParse)
    .use(remarkFrontmatter, ['yaml'])
    .use(remarkMdxAgnostic)
    .use(remarkGfm);
}
function buildParseWithWikilink() {
  return unified()
    .use(remarkParse)
    .use(remarkFrontmatter, ['yaml'])
    .use(remarkMdxAgnostic)
    .use(remarkGfm)
    .use(remarkWikiLink);
}

function cloneTree(tree: MdastRoot): MdastRoot {
  // Transformers (restoreFromMdx, autolink promotion, etc.) mutate in place.
  // Clone per measured iteration so every run starts from the same tree
  // — otherwise run 2..N operate on the post-run-1 tree and time nothing.
  return structuredClone(tree);
}

interface StringifyDeps {
  schema: Schema;
  handlers: RemarkProseMirrorOptions['handlers'];
  pmNodeHandlers: FromProseMirrorOptions<string, string>['nodeHandlers'];
  pmMarkHandlers: FromProseMirrorOptions<string, string>['markHandlers'];
}

function stringifyDeps(): StringifyDeps {
  // Use MarkdownManager to populate the full handler tables — instead of
  // re-deriving them here, we tap into the same private state via a single
  // instantiation (the handlers are stable per-schema).
  const mm = new MarkdownManager({ extensions: sharedExtensions }) as unknown as {
    schema: Schema;
    handlers: RemarkProseMirrorOptions['handlers'];
    pmNodeHandlers: FromProseMirrorOptions<string, string>['nodeHandlers'];
    pmMarkHandlers: FromProseMirrorOptions<string, string>['markHandlers'];
  };
  return {
    schema: mm.schema,
    handlers: mm.handlers,
    pmNodeHandlers: mm.pmNodeHandlers,
    pmMarkHandlers: mm.pmMarkHandlers,
  };
}

function buildStringifyProcessor(deps: StringifyDeps) {
  return unified().use(remarkProseMirror, {
    schema: deps.schema,
    handlers: deps.handlers,
  } as RemarkProseMirrorOptions);
}

// ───────────────────────── Per-stage profile ──────────────────────────────

interface StageRow {
  blockCount: PerfBlockCount;
  docSizeChars: number;
  protectFromMdxMs: Stats;
  parseFullMs: Stats;
  restoreFromMdxMs: Stats;
  autolinkPromotionMs: Stats;
  docStartThematicFixMs: Stats;
  positionSliceMs: Stats;
  unknownMdastGuardMs: Stats;
  ensureNonEmptyDocMs: Stats;
  stringifyMs: Stats;
  totalMs: number; // sum of p50s — informational
}

function profileOneBlockCount(blockCount: PerfBlockCount): StageRow {
  const source = loadPerfFixture(blockCount);
  const docSizeChars = source.length;

  // Stage (a): protectFromMdx — pure string transform.
  const protectSamples = measure(
    () => {
      protectFromMdx(source);
    },
    MEASURED_ITERS,
    WARMUP_ITERS,
  );

  // Precompute the protected source once — downstream stages don't need
  // to re-pay the guard cost.
  const protected_ = protectFromMdx(source);

  // Stage (b): full parse (all syntax extensions).
  const parseProcessor = buildFullParseProcessor();
  const parseSamples = measure(
    () => {
      const file = new VFile(protected_);
      parseProcessor.parse(file);
    },
    MEASURED_ITERS,
    WARMUP_ITERS,
  );

  // Build a "template" mdast tree from the protected source so transformer
  // stages can be measured against a realistic post-parse tree. We clone
  // per run because transformers mutate in place.
  const templateFile = new VFile(protected_);
  const templateTree = parseProcessor.parse(templateFile) as MdastRoot;
  // Keep the ORIGINAL source available for positionSlice + unknownMdastGuard —
  // they read file.value.
  templateFile.value = source;

  // Stage (c1): restoreFromMdx
  const restoreTransformer = restoreFromMdx();
  const restoreSamples = measure(
    () => {
      const t = cloneTree(templateTree);
      (restoreTransformer as (tree: MdastRoot, file: VFile) => void)(t, templateFile);
    },
    MEASURED_ITERS,
    WARMUP_ITERS,
  );

  // Pre-apply restoreFromMdx once — downstream transformers assume PUA is
  // already restored (autolink promotion needs literal `<`/`>`).
  const postRestoreTree: MdastRoot = (() => {
    const t = cloneTree(templateTree);
    (restoreTransformer as (tree: MdastRoot, file: VFile) => void)(t, templateFile);
    return t;
  })();

  // Stage (c2): autolinkPromotionPlugin
  const autolinkTransformer = autolinkPromotionPlugin();
  const autolinkSamples = measure(
    () => {
      const t = cloneTree(postRestoreTree);
      (autolinkTransformer as (tree: MdastRoot) => void)(t);
    },
    MEASURED_ITERS,
    WARMUP_ITERS,
  );

  // Stage (c3): docStartThematicFixPlugin
  const docStartTransformer = docStartThematicFixPlugin();
  const docStartSamples = measure(
    () => {
      const t = cloneTree(postRestoreTree);
      (docStartTransformer as (tree: MdastRoot, file: VFile) => void)(t, templateFile);
    },
    MEASURED_ITERS,
    WARMUP_ITERS,
  );

  // Stage (c4): positionSlicePlugin
  const positionSliceTransformer = positionSlicePlugin();
  const positionSliceSamples = measure(
    () => {
      const t = cloneTree(postRestoreTree);
      (positionSliceTransformer as (tree: MdastRoot, file: VFile) => void)(t, templateFile);
    },
    MEASURED_ITERS,
    WARMUP_ITERS,
  );

  // Stage (c5): unknownMdastGuardPlugin
  const unknownGuardTransformer = unknownMdastGuardPlugin();
  const unknownGuardSamples = measure(
    () => {
      const t = cloneTree(postRestoreTree);
      (unknownGuardTransformer as (tree: MdastRoot, file: VFile) => void)(t, templateFile);
    },
    MEASURED_ITERS,
    WARMUP_ITERS,
  );

  // Stage (c6): ensureNonEmptyDoc (inlined fn in pipeline.ts — we measure
  // the semantically-equivalent walk.
  const ensureNonEmptySamples = measure(
    () => {
      const t = cloneTree(postRestoreTree);
      // Semantically equivalent to the private fn in pipeline.ts. This is
      // an O(children.length) check, not a deep traversal.
      const renderable = t.children.some((n) => {
        const type = (n as { type: string }).type;
        return type !== 'yaml' && type !== 'toml' && type !== 'footnoteDefinition';
      });
      if (!renderable) {
        t.children.push({ type: 'paragraph', children: [] } as never);
      }
    },
    MEASURED_ITERS,
    WARMUP_ITERS,
  );

  // Stage (d): stringify (remarkProseMirror). Apply all upstream transformers
  // first so we're stringifying a realistic fully-processed tree.
  const deps = stringifyDeps();
  const stringifyProcessor = buildStringifyProcessor(deps);
  // Build a fully-processed tree to stringify.
  const fullyProcessedTree = (() => {
    const t = cloneTree(templateTree);
    (restoreTransformer as (tree: MdastRoot, file: VFile) => void)(t, templateFile);
    (autolinkTransformer as (tree: MdastRoot) => void)(t);
    (docStartTransformer as (tree: MdastRoot, file: VFile) => void)(t, templateFile);
    (positionSliceTransformer as (tree: MdastRoot, file: VFile) => void)(t, templateFile);
    (unknownGuardTransformer as (tree: MdastRoot, file: VFile) => void)(t, templateFile);
    return t;
  })();
  const stringifySamples = measure(
    () => {
      // runSync applies any remaining transformers — here, none; stringify
      // is wired through remarkProseMirror which sets a stringify fn on the
      // processor. We use the processor's stringify directly.
      (stringifyProcessor as unknown as { stringify: (t: MdastRoot) => unknown }).stringify(
        cloneTree(fullyProcessedTree),
      );
    },
    MEASURED_ITERS,
    WARMUP_ITERS,
  );

  const s = {
    protectFromMdxMs: stats(protectSamples),
    parseFullMs: stats(parseSamples),
    restoreFromMdxMs: stats(restoreSamples),
    autolinkPromotionMs: stats(autolinkSamples),
    docStartThematicFixMs: stats(docStartSamples),
    positionSliceMs: stats(positionSliceSamples),
    unknownMdastGuardMs: stats(unknownGuardSamples),
    ensureNonEmptyDocMs: stats(ensureNonEmptySamples),
    stringifyMs: stats(stringifySamples),
  };
  const totalMs =
    s.protectFromMdxMs.p50 +
    s.parseFullMs.p50 +
    s.restoreFromMdxMs.p50 +
    s.autolinkPromotionMs.p50 +
    s.docStartThematicFixMs.p50 +
    s.positionSliceMs.p50 +
    s.unknownMdastGuardMs.p50 +
    s.ensureNonEmptyDocMs.p50 +
    s.stringifyMs.p50;
  return { blockCount, docSizeChars, ...s, totalMs };
}

// ───────────────────────── Subset-processor attribution ───────────────────

interface SubsetRow {
  blockCount: PerfBlockCount;
  parseOnly: Stats;
  withFrontmatter: Stats;
  withMdx: Stats;
  withGfm: Stats;
  withWikilink: Stats;
}

function profileSubsets(blockCount: PerfBlockCount): SubsetRow {
  const source = loadPerfFixture(blockCount);
  const protected_ = protectFromMdx(source);

  const configs: Array<[string, () => { parse: (file: VFile) => unknown }]> = [
    ['parse-only', buildParseOnly],
    ['+frontmatter', buildParseWithFrontmatter],
    ['+mdx', buildParseWithMdx],
    ['+gfm', buildParseWithGfm],
    ['+wikilink', buildParseWithWikilink],
  ];
  const samplesPerSubset: Stats[] = [];
  for (const [, build] of configs) {
    const p = build();
    const samples = measure(
      () => {
        const file = new VFile(protected_);
        p.parse(file);
      },
      MEASURED_ITERS,
      WARMUP_ITERS,
    );
    samplesPerSubset.push(stats(samples));
  }

  return {
    blockCount,
    parseOnly: samplesPerSubset[0],
    withFrontmatter: samplesPerSubset[1],
    withMdx: samplesPerSubset[2],
    withGfm: samplesPerSubset[3],
    withWikilink: samplesPerSubset[4],
  };
}

// ───────────────────────── Runner metadata ────────────────────────────────

interface RunnerInfo {
  bunVersion: string;
  hostname: string;
  cpuModel: string;
  cpuCores: number;
  ramGB: number;
  platform: string;
}

function runnerInfo(): RunnerInfo {
  const cpuList = cpus();
  return {
    bunVersion: process.versions.bun ?? 'unknown',
    hostname: hostname(),
    cpuModel: cpuList[0]?.model ?? 'unknown',
    cpuCores: cpuList.length,
    ramGB: Math.round(totalmem() / 1024 ** 3),
    platform: `${process.platform}-${process.arch}`,
  };
}

// ───────────────────────── Entry point ────────────────────────────────────

const HARNESS_DIR = dirname(fileURLToPath(import.meta.url));

async function main() {
  const startedAt = new Date().toISOString();
  console.log(`[profile] starting at ${startedAt}`);
  console.log(`[profile] per-stage @ ${PERF_BLOCK_COUNTS.join('/')}`);

  const stageRows: StageRow[] = [];
  for (const count of PERF_BLOCK_COUNTS) {
    const row = profileOneBlockCount(count);
    stageRows.push(row);
    console.log(
      `[profile]  ${count} blocks (${row.docSizeChars.toLocaleString()} chars): ` +
        `protect=${row.protectFromMdxMs.p50.toFixed(2)} ` +
        `parse=${row.parseFullMs.p50.toFixed(1)} ` +
        `restore=${row.restoreFromMdxMs.p50.toFixed(2)} ` +
        `autolink=${row.autolinkPromotionMs.p50.toFixed(2)} ` +
        `docStart=${row.docStartThematicFixMs.p50.toFixed(2)} ` +
        `posSlice=${row.positionSliceMs.p50.toFixed(2)} ` +
        `unkGuard=${row.unknownMdastGuardMs.p50.toFixed(2)} ` +
        `ensureNE=${row.ensureNonEmptyDocMs.p50.toFixed(2)} ` +
        `stringify=${row.stringifyMs.p50.toFixed(1)} ` +
        `(Σp50=${row.totalMs.toFixed(1)}ms)`,
    );
  }

  console.log(`[profile] subset attribution @ ${SUBSET_BLOCK_COUNTS.join('/')}`);
  const subsetRows: SubsetRow[] = [];
  for (const count of SUBSET_BLOCK_COUNTS) {
    const row = profileSubsets(count);
    subsetRows.push(row);
    console.log(
      `[profile]  ${count} blocks: ` +
        `parse-only=${row.parseOnly.p50.toFixed(1)} ` +
        `+fm=${row.withFrontmatter.p50.toFixed(1)} ` +
        `+mdx=${row.withMdx.p50.toFixed(1)} ` +
        `+gfm=${row.withGfm.p50.toFixed(1)} ` +
        `+wiki=${row.withWikilink.p50.toFixed(1)}`,
    );
  }

  const finishedAt = new Date().toISOString();

  const output = {
    schemaVersion: 1,
    harness: 'perf-profile-harness.ts',
    startedAt,
    finishedAt,
    methodology: {
      warmupIters: WARMUP_ITERS,
      measuredIters: MEASURED_ITERS,
      gcBetweenRuns: true,
      subsetBlockCounts: SUBSET_BLOCK_COUNTS,
    },
    runner: runnerInfo(),
    stages: stageRows,
    subsets: subsetRows,
  };

  const stamp = startedAt.replace(/[:.]/g, '-');
  const target = resolve(HARNESS_DIR, `perf-profile.${stamp}.json`);
  writeFileSync(target, `${JSON.stringify(output, null, 2)}\n`, 'utf8');
  console.log(`[profile] wrote ${target}`);
}

main().catch((err) => {
  console.error('[profile] failed:', err);
  process.exit(1);
});
