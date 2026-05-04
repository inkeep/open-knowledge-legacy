import { describe, expect, test } from 'bun:test';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { sharedExtensions } from '../../../core/src/extensions/shared.ts';
import { MarkdownManager } from '../../../core/src/markdown/index.ts';
import { getParseHealth, resetParseHealth } from '../../../core/src/metrics/parse-health.ts';

const REPO_ROOT = resolve(__dirname, '..', '..', '..', '..');

const CANONICAL_DOCS = ['PROJECT.md', 'AGENTS.md', 'ARCHITECTURE.md', 'README.md'];

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
        continue;
      }
      resetParseHealth();
      const result = mgr.parseWithFallback(content);
      const health = getParseHealth();
      expect(health.parseFallback.wholeDoc).toBe(0);
      expect(result.content?.length).toBeGreaterThan(0);
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
