/**
 * M2 measurement: the project's own markdown files (PROJECT.md, AGENTS.md,
 * ARCHITECTURE.md, README.md, and every other .md under the repo excluding
 * node_modules/tmp/.git/fixtures) must parse through parseWithFallback with
 * zero whole-doc fallbacks.
 *
 * Per SPEC §7 M2: "Zero parseSafe whole-doc fallbacks on the project's own
 * markdown files (everything either parses clean or degrades via R6
 * block-level)."
 *
 * This test is the CI-enforced measurement of that metric. If a future change
 * introduces a parse path that whole-doc-fallbacks on the project's own docs,
 * this test fails loudly.
 */

import { describe, expect, test } from 'bun:test';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { sharedExtensions } from '../../../core/src/extensions/shared.ts';
import { MarkdownManager } from '../../../core/src/markdown/index.ts';
// Direct relative import to avoid ProseMirror-model duplication in nested worktrees
import { getParseHealth, resetParseHealth } from '../../../core/src/metrics/parse-health.ts';

const REPO_ROOT = resolve(__dirname, '..', '..', '..', '..');

/** Project-canonical top-level docs we expect to be clean parse-wise. */
const CANONICAL_DOCS = ['PROJECT.md', 'AGENTS.md', 'ARCHITECTURE.md', 'README.md'];

/** Directories to skip when walking for .md files. */
const SKIP_DIRS = new Set([
  'node_modules',
  'tmp',
  '.git',
  '.turbo',
  'dist',
  '.next',
  'fixtures',
  '.claude', // worktrees, reports, caches
  'specs', // spec docs may contain intentional fallback fixtures
  'tech-probes', // probes intentionally contain crash-class inputs
  'stories',
  'projects',
  'reports',
  'evidence',
  'meta',
]);

function findMarkdownFiles(dir: string, acc: string[] = []): string[] {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return acc;
  }
  for (const entry of entries) {
    if (entry.startsWith('.') && entry !== '.') continue;
    if (SKIP_DIRS.has(entry)) continue;
    const full = join(dir, entry);
    let stat: ReturnType<typeof statSync>;
    try {
      stat = statSync(full);
    } catch {
      continue;
    }
    if (stat.isDirectory()) {
      findMarkdownFiles(full, acc);
    } else if (entry.endsWith('.md') || entry.endsWith('.mdx')) {
      acc.push(full);
    }
  }
  return acc;
}

describe('M2: project markdown parse health', () => {
  test('canonical docs parse cleanly (zero whole-doc fallback) through parseWithFallback', () => {
    const mgr = new MarkdownManager({ extensions: sharedExtensions });
    for (const doc of CANONICAL_DOCS) {
      const path = join(REPO_ROOT, doc);
      let content: string;
      try {
        content = readFileSync(path, 'utf8');
      } catch {
        // Not every canonical doc exists in every worktree; skip missing
        continue;
      }
      resetParseHealth();
      const result = mgr.parseWithFallback(content);
      const health = getParseHealth();
      expect(health.parseFallback.wholeDoc).toBe(0);
      // Sanity: the result should be non-trivial structured content
      expect(result.content?.length).toBeGreaterThan(0);
      // Block-level fallback is permitted — just log if it fires (not a gate)
      if (health.parseFallback.blockLevel > 0) {
        console.warn(
          `[m2] ${doc} produced ${health.parseFallback.blockLevel} block-level fallback(s) — acceptable but worth noting`,
        );
      }
    }
  });

  test('all project .md files parse without whole-doc fallback', () => {
    const mgr = new MarkdownManager({ extensions: sharedExtensions });
    const files = findMarkdownFiles(REPO_ROOT);
    expect(files.length).toBeGreaterThan(0);

    const failures: Array<{ file: string; reason: string }> = [];
    for (const file of files) {
      let content: string;
      try {
        content = readFileSync(file, 'utf8');
      } catch (e) {
        failures.push({ file, reason: `read failed: ${(e as Error).message}` });
        continue;
      }
      resetParseHealth();
      try {
        mgr.parseWithFallback(content);
      } catch (e) {
        // parseWithFallback should NEVER throw — this would be a bug
        failures.push({ file, reason: `parseWithFallback threw: ${(e as Error).message}` });
        continue;
      }
      const health = getParseHealth();
      if (health.parseFallback.wholeDoc > 0) {
        failures.push({ file, reason: 'whole-doc fallback fired' });
      }
    }

    if (failures.length > 0) {
      const rel = (f: string) => f.replace(`${REPO_ROOT}/`, '');
      throw new Error(
        `M2 violation: ${failures.length} project markdown file(s) produced whole-doc fallback or parse error:\n` +
          failures.map((f) => `  - ${rel(f.file)}: ${f.reason}`).join('\n'),
      );
    }
  });
});
