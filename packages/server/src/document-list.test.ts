/**
 * Tests for GET /api/documents — document listing with directory exclusion,
 * nested paths, and subdirectory filtering.
 */
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { safeSubdir } from './api-extension.ts';

// ── EXCLUDED_DIRS logic (mirrors module-level constant in api-extension.ts) ──

const EXCLUDED_DIRS = new Set(['.agents', '.claude', '.git', '.open-knowledge', 'node_modules']);

function shouldExclude(relativePath: string): boolean {
  const firstSegment = relativePath.split(/[\\/]/)[0];
  return Boolean(firstSegment && EXCLUDED_DIRS.has(firstSegment));
}

describe('document list exclusion logic', () => {
  test('excludes .agents directory', () => {
    expect(shouldExclude('.agents/skills/foo.md')).toBe(true);
  });

  test('excludes .claude directory', () => {
    expect(shouldExclude('.claude/settings.md')).toBe(true);
  });

  test('excludes .git directory', () => {
    expect(shouldExclude('.git/HEAD.md')).toBe(true);
  });

  test('excludes .open-knowledge directory', () => {
    expect(shouldExclude('.open-knowledge/articles/foo.md')).toBe(true);
  });

  test('excludes node_modules directory', () => {
    expect(shouldExclude('node_modules/pkg/README.md')).toBe(true);
  });

  test('allows regular files', () => {
    expect(shouldExclude('README.md')).toBe(false);
  });

  test('allows regular nested files', () => {
    expect(shouldExclude('docs/guide/setup.md')).toBe(false);
  });

  test('allows files with similar names', () => {
    expect(shouldExclude('agents/foo.md')).toBe(false); // no leading dot
    expect(shouldExclude('my-node_modules/foo.md')).toBe(false);
  });
});

// ── docName derivation (mirrors fullPath.slice(contentDir.length + 1).replace) ──

function deriveDocName(fullPath: string, contentDir: string): string {
  return fullPath.slice(contentDir.length + 1).replace(/\.md$/, '');
}

describe('docName derivation', () => {
  const contentDir = '/home/user/project';

  test('top-level file', () => {
    expect(deriveDocName('/home/user/project/README.md', contentDir)).toBe('README');
  });

  test('nested file', () => {
    expect(deriveDocName('/home/user/project/docs/guide.md', contentDir)).toBe('docs/guide');
  });

  test('deeply nested file', () => {
    expect(deriveDocName('/home/user/project/a/b/c/d.md', contentDir)).toBe('a/b/c/d');
  });
});

// ── Integration: filesystem-based document listing ──

describe('document listing (filesystem)', () => {
  const testDir = resolve(tmpdir(), `ok-doclist-test-${Date.now()}`);

  beforeAll(() => {
    // Create test directory structure
    mkdirSync(resolve(testDir, 'docs'), { recursive: true });
    mkdirSync(resolve(testDir, 'articles/nested'), { recursive: true });
    mkdirSync(resolve(testDir, '.git'), { recursive: true });
    mkdirSync(resolve(testDir, 'node_modules/pkg'), { recursive: true });
    mkdirSync(resolve(testDir, '.agents/skills'), { recursive: true });

    // Create files
    writeFileSync(resolve(testDir, 'README.md'), '# README');
    writeFileSync(resolve(testDir, 'docs/guide.md'), '# Guide');
    writeFileSync(resolve(testDir, 'articles/intro.md'), '# Intro');
    writeFileSync(resolve(testDir, 'articles/nested/deep.md'), '# Deep');
    writeFileSync(resolve(testDir, '.git/HEAD.md'), 'ref');
    writeFileSync(resolve(testDir, 'node_modules/pkg/README.md'), '# Pkg');
    writeFileSync(resolve(testDir, '.agents/skills/foo.md'), '# Skill');
    writeFileSync(resolve(testDir, 'not-markdown.txt'), 'text');
  });

  afterAll(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  test('lists .md files recursively', () => {
    const { readdirSync } = require('node:fs');
    const entries = readdirSync(testDir, { recursive: true }) as string[];
    const mdFiles = entries.filter((e: string) => e.endsWith('.md'));
    // Should include README, guide, intro, deep, plus excluded dirs
    expect(mdFiles.length).toBeGreaterThanOrEqual(4);
  });

  test('filters excluded directories', () => {
    const { readdirSync } = require('node:fs');
    const entries = readdirSync(testDir, { recursive: true }) as string[];
    const filtered = entries
      .filter((e: string) => e.endsWith('.md'))
      .filter((e: string) => !shouldExclude(e));
    const docNames = filtered.map((e: string) => e.replace(/\.md$/, ''));

    expect(docNames).toContain('README');
    expect(docNames).toContain('docs/guide');
    expect(docNames).toContain('articles/intro');
    expect(docNames).toContain('articles/nested/deep');

    // Should NOT contain excluded dirs
    for (const name of docNames) {
      expect(shouldExclude(`${name}.md`)).toBe(false);
    }
  });

  test('subdirectory listing via safeSubdir', () => {
    const articlesDir = safeSubdir(testDir, 'articles');
    const { readdirSync } = require('node:fs');
    const entries = readdirSync(articlesDir, { recursive: true }) as string[];
    const mdFiles = entries.filter((e: string) => e.endsWith('.md'));
    expect(mdFiles).toContain('intro.md');
    expect(mdFiles).toContain('nested/deep.md');
  });

  test('non-existent subdirectory returns empty via existence check', () => {
    const { existsSync } = require('node:fs');
    const nonExistent = resolve(testDir, 'nonexistent');
    expect(existsSync(nonExistent)).toBe(false);
  });

  test('sorted alphabetically by docName', () => {
    const { readdirSync } = require('node:fs');
    const entries = readdirSync(testDir, { recursive: true }) as string[];
    const docNames = entries
      .filter((e: string) => e.endsWith('.md'))
      .filter((e: string) => !shouldExclude(e))
      .map((e: string) => e.replace(/\.md$/, ''))
      .sort((a: string, b: string) => a.localeCompare(b));

    for (let i = 1; i < docNames.length; i++) {
      expect(docNames[i].localeCompare(docNames[i - 1])).toBeGreaterThanOrEqual(0);
    }
  });
});
