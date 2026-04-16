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
export function fixturePath(...segments: string[]): string {
  return resolve(FIXTURES_DIR, ...segments);
}

// ─── gfm/ ─────────────────────────────────────────────────────────────────

export interface GfmExample {
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

export interface MdxCrashEntry {
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

// ─── perf/ ────────────────────────────────────────────────────────────────

/**
 * Large realistic markdown document (~2,000 lines) — used by stress and
 * Playwright e2e suites for scale testing.
 */
export function loadLargeRealistic(): string {
  return readFileSync(fixturePath('perf', 'large-realistic.md'), 'utf8');
}
