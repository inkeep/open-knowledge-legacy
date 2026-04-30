/**
 * Canonical fixture corpus for the markdown pipeline.
 *
 * Physical location: `packages/core/src/markdown/fixtures/<subdir>/`.
 *
 * Subdirectories (one per feature surface):
 *   - commonmark/   — CommonMark spec examples (currently sourced from the
 *                     third-party `commonmark.json` package; directory is a
 *                     reserved slot for future inline fixtures)
 *   - gfm/          — GitHub-Flavored Markdown extension examples
 *   - mdx/          — MDX + crash-class taxonomy fixtures
 *   - wiki-links/   — reserved for wiki-link fixtures (future)
 *   - frontmatter/  — reserved for frontmatter fixtures (future)
 *   - ng-pinned/    — reserved for NG1-NG11 byte-identity fixtures (future)
 *   - perf/         — large synthetic documents for benchmark + stress
 *
 * Consumers:
 *   - `bun test` (unit, integration, fidelity, stress)
 *   - Playwright e2e (imports via relative path; no TS loader required)
 *   - Future Rust port (via symlink — out of scope for this spec)
 *
 * Keep this module Bun + Node compatible (no browser-only APIs).
 */

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const FIXTURES_DIR = dirname(fileURLToPath(import.meta.url));

/** Resolve a fixture path relative to the canonical fixtures root. */
function fixturePath(...segments: string[]): string {
  return resolve(FIXTURES_DIR, ...segments);
}

// ─── gfm/ ─────────────────────────────────────────────────────────────────

interface GfmExample {
  section: string;
  markdown: string;
}

/**
 * GFM spec examples (tables, strikethrough, task lists, autolinks).
 * Currently 20 examples; sourced from PR #83's hand-curated corpus.
 */
export function loadGfmExamples(): GfmExample[] {
  return JSON.parse(readFileSync(fixturePath('gfm', 'examples.json'), 'utf8')) as GfmExample[];
}

// ─── mdx/ ─────────────────────────────────────────────────────────────────

interface MdxCrashEntry {
  id: string;
  input: string;
  class: string;
  r23Covers: boolean;
  expectedOutcome: string;
  note: string;
}

/**
 * 26-class MDX crash-taxonomy corpus for the tolerant-parsing pre-merge gate.
 * See `specs/2026-04-13-mdx-tolerant-parsing/evidence/crash-taxonomy.md`.
 */
export function loadMdxCrashTaxonomy(): MdxCrashEntry[] {
  return JSON.parse(
    readFileSync(fixturePath('mdx', 'crash-taxonomy.json'), 'utf8'),
  ) as MdxCrashEntry[];
}

/**
 * A single built-in / jsxComponent fixture case. `blockForm` is the exact
 * MDX string that should round-trip byte-identical through `mdManager` when
 * pristine (sourceDirty=false). Some cases are inline-form (thin jsxInline
 * shape per NG14) — the `blockForm` field carries those too for uniformity.
 *
 * Used by Component Blocks v2 fidelity tests:
 *   - `jsx-pristine-byte-identity.test.ts` (I12)
 *   - `jsx-edited-idempotence.test.ts` (I13)
 *   - `jsx-cross-path-consistency.test.ts` (I15)
 */
export interface BuiltInFixture {
  /** Unique key for the case (component name or scenario identifier). */
  componentName: string;
  /** MDX source to round-trip. Block or inline — either shape works. */
  blockForm: string;
  /** Optional inline form, when the component supports both. */
  inlineForm?: string;
  /** Free-text context for the case — why it's interesting. */
  notes?: string;
}

/**
 * 18 P0 built-in JSX component fixtures + edge cases (unknown attrs, boolean
 * shorthand, expression attrs, spreads, unregistered components, inline thin-
 * shape). Lifted from the inline fixtures formerly embedded in
 * `packages/app/tests/fidelity/jsx-pristine-byte-identity.test.ts:22-85`.
 *
 * See `specs/2026-04-14-component-blocks-v2/SPEC.md:248` (I12 definition) and
 * `packages/core/src/registry/built-ins.ts` for the authoritative descriptor
 * list.
 */
export function loadBuiltInFixtures(): BuiltInFixture[] {
  return JSON.parse(readFileSync(fixturePath('mdx', 'built-ins.json'), 'utf8')) as BuiltInFixture[];
}

// ─── ng-pinned/ ────────────────────────────────────────────────────────────

/**
 * A single NG-pinned case. `input` is the source MDX; `expectedOutput` is the
 * exact byte-string that the canonical pipeline produces — or `null` when the
 * case is idempotence-only (the idempotence property is asserted unconditionally;
 * `expectedOutput` is an additional regression pin when populated).
 */
export interface NgPinnedCase {
  id: string;
  name: string;
  input: string;
  expectedOutput: string | null;
  idempotent: boolean;
  /** Cases where a library version bump could silently change the canonical. */
  highlighted: boolean;
  note: string;
}

/**
 * NG12 — edited-node quoting normalization. 10 probe cases lifted from
 * `specs/2026-04-14-component-blocks-v2/evidence/serialize-roundtrip-probe.md`.
 * 4 cases are `highlighted: true` — those have the highest drift-risk profile
 * (library-specific quoting, member-access shape, flush-left handler contract).
 *
 * Used by `ng-pinned.test.ts` NG12 section alongside NG1 and NG11 pins.
 */
export function loadNgPinnedCases(): NgPinnedCase[] {
  return JSON.parse(
    readFileSync(fixturePath('ng-pinned', 'component-blocks-v2.json'), 'utf8'),
  ) as NgPinnedCase[];
}

// ─── perf/ ────────────────────────────────────────────────────────────────

/**
 * Large realistic markdown document (~2,000 lines) — used by stress and
 * Playwright e2e suites for scale testing.
 */
export function loadLargeRealistic(): string {
  return readFileSync(fixturePath('perf', 'large-realistic.md'), 'utf8');
}

/**
 * Block counts pinned by SPEC §6 (R1/R18) for the perf benchmark harness.
 * Each count has a matching `<count>.md` fixture generated deterministically
 * by `fixtures/perf/generate.ts` — same seed ⇒ byte-identical corpus.
 */
export const PERF_BLOCK_COUNTS = [100, 1000, 5000, 10000, 20000] as const;
export type PerfBlockCount = (typeof PERF_BLOCK_COUNTS)[number];

/**
 * Load a pinned synthetic fixture for the benchmark harness. Block counts
 * are restricted at the type level so drift between the harness and the
 * on-disk corpus fails at compile time.
 */
export function loadPerfFixture(blockCount: PerfBlockCount): string {
  return readFileSync(fixturePath('perf', `${blockCount}.md`), 'utf8');
}
