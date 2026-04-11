import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createContentFilter } from './content-filter.ts';

describe('ContentFilter', () => {
  let projectDir: string;

  beforeEach(async () => {
    projectDir = await mkdtemp(join(tmpdir(), 'content-filter-test-'));
  });

  afterEach(async () => {
    await rm(projectDir, { recursive: true, force: true });
  });

  describe('gitignore filtering', () => {
    test('excludes files matching .gitignore patterns', () => {
      writeFileSync(join(projectDir, '.gitignore'), 'dist/\ntmp/\n');

      const filter = createContentFilter({
        projectDir,
        contentDir: projectDir,
        includePatterns: ['**/*.md'],
        excludePatterns: [],
      });

      expect(filter.isExcluded('dist/output.md')).toBe(true);
      expect(filter.isExcluded('tmp/scratch.md')).toBe(true);
      expect(filter.isExcluded('docs/readme.md')).toBe(false);
    });

    test('excludes .git directory even without .gitignore', () => {
      const filter = createContentFilter({
        projectDir,
        contentDir: projectDir,
        includePatterns: ['**/*.md'],
        excludePatterns: [],
      });

      expect(filter.isExcluded('.git/objects/readme.md')).toBe(true);
    });

    test('respects gitignore negation patterns', () => {
      // Use logs/* (not logs/) so negation can un-ignore files within the dir.
      // This matches real git behavior: directory-level ignore blocks all negation.
      writeFileSync(join(projectDir, '.gitignore'), 'logs/*\n!logs/important.md\n');

      const filter = createContentFilter({
        projectDir,
        contentDir: projectDir,
        includePatterns: ['**/*.md'],
        excludePatterns: [],
      });

      expect(filter.isExcluded('logs/debug.md')).toBe(true);
      expect(filter.isExcluded('logs/important.md')).toBe(false);
    });

    test('handles wildcard patterns in .gitignore', () => {
      writeFileSync(join(projectDir, '.gitignore'), '*.log\nbuild-*\n');

      const filter = createContentFilter({
        projectDir,
        contentDir: projectDir,
        includePatterns: ['**/*.md', '**/*.log'],
        excludePatterns: [],
      });

      expect(filter.isExcluded('error.log')).toBe(true);
      expect(filter.isExcluded('docs/guide.md')).toBe(false);
    });
  });

  describe('config exclude filtering', () => {
    test('excludes files matching content.exclude patterns', () => {
      const filter = createContentFilter({
        projectDir,
        contentDir: projectDir,
        includePatterns: ['**/*.md'],
        excludePatterns: ['vendor/**', 'archive/**'],
      });

      expect(filter.isExcluded('vendor/lib.md')).toBe(true);
      expect(filter.isExcluded('archive/old.md')).toBe(true);
      expect(filter.isExcluded('docs/readme.md')).toBe(false);
    });

    test('config exclude patterns applied after gitignore', () => {
      // .gitignore negates a path, but config exclude re-excludes it
      writeFileSync(join(projectDir, '.gitignore'), 'logs/\n!logs/important.md\n');

      const filter = createContentFilter({
        projectDir,
        contentDir: projectDir,
        includePatterns: ['**/*.md'],
        excludePatterns: ['logs/**'],
      });

      // Config exclude overrides gitignore negation
      expect(filter.isExcluded('logs/important.md')).toBe(true);
      expect(filter.isExcluded('logs/debug.md')).toBe(true);
    });
  });

  describe('include pattern matching', () => {
    test('only includes files matching content.include patterns', () => {
      const filter = createContentFilter({
        projectDir,
        contentDir: projectDir,
        includePatterns: ['**/*.md'],
        excludePatterns: [],
      });

      expect(filter.isExcluded('readme.md')).toBe(false);
      expect(filter.isExcluded('docs/guide.md')).toBe(false);
      expect(filter.isExcluded('script.js')).toBe(true);
      expect(filter.isExcluded('data.json')).toBe(true);
    });

    test('supports multiple include patterns', () => {
      const filter = createContentFilter({
        projectDir,
        contentDir: projectDir,
        includePatterns: ['**/*.md', '**/*.txt'],
        excludePatterns: [],
      });

      expect(filter.isExcluded('readme.md')).toBe(false);
      expect(filter.isExcluded('notes.txt')).toBe(false);
      expect(filter.isExcluded('script.js')).toBe(true);
    });
  });

  describe('exclusion supersedes inclusion', () => {
    test('file matching both include and exclude is excluded', () => {
      writeFileSync(join(projectDir, '.gitignore'), 'dist/\n');

      const filter = createContentFilter({
        projectDir,
        contentDir: projectDir,
        includePatterns: ['**/*.md'],
        excludePatterns: ['vendor/**'],
      });

      // Matches include (**/*.md) AND gitignore exclude (dist/)
      expect(filter.isExcluded('dist/output.md')).toBe(true);

      // Matches include (**/*.md) AND config exclude (vendor/**)
      expect(filter.isExcluded('vendor/readme.md')).toBe(true);

      // Matches include only — not excluded
      expect(filter.isExcluded('docs/guide.md')).toBe(false);
    });
  });

  describe('non-git graceful degradation', () => {
    test('works with no .gitignore file', () => {
      // No .gitignore — only config patterns apply
      const filter = createContentFilter({
        projectDir,
        contentDir: projectDir,
        includePatterns: ['**/*.md'],
        excludePatterns: ['archive/**'],
      });

      expect(filter.isExcluded('docs/guide.md')).toBe(false);
      expect(filter.isExcluded('archive/old.md')).toBe(true);
    });

    test('works with no .gitignore and no exclude patterns', () => {
      const filter = createContentFilter({
        projectDir,
        contentDir: projectDir,
        includePatterns: ['**/*.md'],
        excludePatterns: [],
      });

      expect(filter.isExcluded('readme.md')).toBe(false);
      expect(filter.isExcluded('docs/guide.md')).toBe(false);
    });
  });

  describe('nested .gitignore support', () => {
    test('loads nested .gitignore files', () => {
      writeFileSync(join(projectDir, '.gitignore'), 'node_modules/\n');
      mkdirSync(join(projectDir, 'subdir'));
      writeFileSync(join(projectDir, 'subdir', '.gitignore'), 'build/\n');
      mkdirSync(join(projectDir, 'subdir', 'build'), { recursive: true });

      const filter = createContentFilter({
        projectDir,
        contentDir: projectDir,
        includePatterns: ['**/*.md'],
        excludePatterns: [],
      });

      expect(filter.isExcluded('subdir/build/output.md')).toBe(true);
      expect(filter.isExcluded('subdir/readme.md')).toBe(false);
    });

    test('skips already-excluded dirs during nested scan (avoids node_modules)', () => {
      writeFileSync(join(projectDir, '.gitignore'), 'node_modules/\n');
      mkdirSync(join(projectDir, 'node_modules', 'pkg'), { recursive: true });
      writeFileSync(join(projectDir, 'node_modules', 'pkg', '.gitignore'), 'test/\n');

      const filter = createContentFilter({
        projectDir,
        contentDir: projectDir,
        includePatterns: ['**/*.md'],
        excludePatterns: [],
      });

      // node_modules should be excluded by root .gitignore
      expect(filter.isExcluded('node_modules/pkg/readme.md')).toBe(true);
    });
  });

  describe('getWatcherIgnoreGlobs', () => {
    test('returns gitignore and config exclude patterns', () => {
      writeFileSync(join(projectDir, '.gitignore'), 'dist/\ntmp/\n# comment\n!keep\n');

      const filter = createContentFilter({
        projectDir,
        contentDir: projectDir,
        includePatterns: ['**/*.md'],
        excludePatterns: ['vendor/**'],
      });

      const globs = filter.getWatcherIgnoreGlobs();
      expect(globs).toContain('dist/');
      expect(globs).toContain('tmp/');
      expect(globs).toContain('vendor/**');
      // Should not include negation or comment patterns
      expect(globs).not.toContain('!keep');
      expect(globs).not.toContain('# comment');
    });

    test('returns empty array when no patterns', () => {
      const filter = createContentFilter({
        projectDir,
        contentDir: projectDir,
        includePatterns: ['**/*.md'],
        excludePatterns: [],
      });

      expect(filter.getWatcherIgnoreGlobs()).toEqual([]);
    });
  });

  describe('contentDir different from projectDir', () => {
    test('filter works when contentDir is a subdirectory of projectDir', () => {
      const contentDir = join(projectDir, 'content');
      mkdirSync(contentDir);
      writeFileSync(join(projectDir, '.gitignore'), 'dist/\n');

      const filter = createContentFilter({
        projectDir,
        contentDir,
        includePatterns: ['**/*.md'],
        excludePatterns: [],
      });

      // Paths are relative to contentDir for include matching,
      // but relative to projectDir for gitignore matching.
      // In practice, the watcher provides paths relative to contentDir.
      // The filter receives paths relative to contentDir.
      expect(filter.isExcluded('readme.md')).toBe(false);
    });
  });
});
