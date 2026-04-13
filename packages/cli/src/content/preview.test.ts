import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { previewContent } from './preview.ts';

describe('previewContent', () => {
  let testDir: string;

  beforeEach(() => {
    testDir = resolve(
      tmpdir(),
      `preview-test-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    );
    mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  it('counts seeded markdown files and returns samples', () => {
    writeFileSync(join(testDir, 'a.md'), '# A');
    writeFileSync(join(testDir, 'b.md'), '# B');
    mkdirSync(join(testDir, 'docs'));
    writeFileSync(join(testDir, 'docs', 'c.md'), '# C');

    const result = previewContent({
      projectDir: testDir,
      contentDir: testDir,
      include: ['**/*.md'],
      exclude: [],
    });

    expect(result.totalCount).toBe(3);
    expect(result.sample.length).toBe(3);
    expect(result.warnings).toEqual([]);
  });

  it('respects exclude patterns', () => {
    writeFileSync(join(testDir, 'keep.md'), '# Keep');
    mkdirSync(join(testDir, 'vendored'));
    writeFileSync(join(testDir, 'vendored', 'drop.md'), '# Drop');

    const result = previewContent({
      projectDir: testDir,
      contentDir: testDir,
      include: ['**/*.md'],
      exclude: ['vendored/**'],
    });

    expect(result.totalCount).toBe(1);
    expect(result.sample).toEqual(['keep.md']);
  });

  it('respects .gitignore', () => {
    writeFileSync(join(testDir, '.gitignore'), 'ignored/\n');
    writeFileSync(join(testDir, 'visible.md'), '# Visible');
    mkdirSync(join(testDir, 'ignored'));
    writeFileSync(join(testDir, 'ignored', 'hidden.md'), '# Hidden');

    const result = previewContent({
      projectDir: testDir,
      contentDir: testDir,
      include: ['**/*.md'],
      exclude: [],
    });

    expect(result.totalCount).toBe(1);
    expect(result.sample).toEqual(['visible.md']);
  });

  it('returns warning and zero count when contentDir does not exist', () => {
    const missing = join(testDir, 'nonexistent');

    const result = previewContent({
      projectDir: testDir,
      contentDir: missing,
      include: ['**/*.md'],
      exclude: [],
    });

    expect(result.totalCount).toBe(0);
    expect(result.sample).toEqual([]);
    expect(result.warnings.length).toBe(1);
    expect(result.warnings[0]).toContain('content directory not found');
  });

  it('caps sample at sampleCap', () => {
    for (let i = 0; i < 20; i++) {
      writeFileSync(join(testDir, `file-${i}.md`), `# ${i}`);
    }

    const result = previewContent({
      projectDir: testDir,
      contentDir: testDir,
      include: ['**/*.md'],
      exclude: [],
      sampleCap: 5,
    });

    expect(result.totalCount).toBe(20);
    expect(result.sample.length).toBe(5);
  });

  it('uses default sampleCap of 5', () => {
    for (let i = 0; i < 10; i++) {
      writeFileSync(join(testDir, `file-${i}.md`), `# ${i}`);
    }

    const result = previewContent({
      projectDir: testDir,
      contentDir: testDir,
      include: ['**/*.md'],
      exclude: [],
    });

    expect(result.totalCount).toBe(10);
    expect(result.sample.length).toBe(5);
  });

  it('respects nested .gitignore (D8: .open-knowledge/cache/ excluded)', () => {
    const okDir = join(testDir, '.open-knowledge');
    mkdirSync(okDir, { recursive: true });
    writeFileSync(join(okDir, '.gitignore'), 'cache/\n');
    writeFileSync(join(okDir, 'AGENTS.md'), '# Agents');
    mkdirSync(join(okDir, 'cache'));
    writeFileSync(join(okDir, 'cache', 'cached.md'), '# Cached');

    const result = previewContent({
      projectDir: testDir,
      contentDir: testDir,
      include: ['**/*.md'],
      exclude: [],
    });

    expect(result.totalCount).toBe(1);
    expect(result.sample).toEqual(['.open-knowledge/AGENTS.md']);
  });

  it('returns zero count for empty directory (no .md files)', () => {
    mkdirSync(join(testDir, 'empty-sub'));

    const result = previewContent({
      projectDir: testDir,
      contentDir: testDir,
      include: ['**/*.md'],
      exclude: [],
    });

    expect(result.totalCount).toBe(0);
    expect(result.sample).toEqual([]);
    expect(result.warnings).toEqual([]);
  });

  it('ignores non-.md files', () => {
    writeFileSync(join(testDir, 'readme.md'), '# Readme');
    writeFileSync(join(testDir, 'script.ts'), 'export {}');
    writeFileSync(join(testDir, 'data.json'), '{}');

    const result = previewContent({
      projectDir: testDir,
      contentDir: testDir,
      include: ['**/*.md'],
      exclude: [],
    });

    expect(result.totalCount).toBe(1);
    expect(result.sample).toEqual(['readme.md']);
  });
});
