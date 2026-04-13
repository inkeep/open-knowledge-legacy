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

  describe('isDirExcluded', () => {
    test('excludes directories matching gitignore directory patterns (trailing slash)', () => {
      writeFileSync(join(projectDir, '.gitignore'), 'node_modules/\ndist/\n');

      const filter = createContentFilter({
        projectDir,
        contentDir: projectDir,
        includePatterns: ['**/*.md'],
        excludePatterns: [],
      });

      expect(filter.isDirExcluded('node_modules')).toBe(true);
      expect(filter.isDirExcluded('dist')).toBe(true);
      expect(filter.isDirExcluded('src')).toBe(false);
      expect(filter.isDirExcluded('docs')).toBe(false);
    });

    test('excludes directories matching config exclude patterns', () => {
      // Pattern 'archive/' excludes the directory itself; 'archive/**' only excludes contents.
      const filter = createContentFilter({
        projectDir,
        contentDir: projectDir,
        includePatterns: ['**/*.md'],
        excludePatterns: ['archive/'],
      });

      expect(filter.isDirExcluded('archive')).toBe(true);
      expect(filter.isDirExcluded('docs')).toBe(false);
    });

    test('does not apply include patterns to directories', () => {
      // Directories should not be excluded just because they don't match **/*.md
      const filter = createContentFilter({
        projectDir,
        contentDir: projectDir,
        includePatterns: ['**/*.md'],
        excludePatterns: [],
      });

      expect(filter.isDirExcluded('src')).toBe(false);
      expect(filter.isDirExcluded('docs')).toBe(false);
    });
  });

  describe('reserved system doc names', () => {
    test('excludes __system__.md regardless of include patterns', () => {
      const filter = createContentFilter({
        projectDir,
        contentDir: projectDir,
        includePatterns: ['**/*.md'],
        excludePatterns: [],
      });

      // Reserved system doc name is always excluded even though it matches **/*.md
      expect(filter.isExcluded('__system__.md')).toBe(true);
    });

    test('excludes __system__.md even when include patterns match it explicitly', () => {
      const filter = createContentFilter({
        projectDir,
        contentDir: projectDir,
        includePatterns: ['**/*.md', '__system__.md'],
        excludePatterns: [],
      });

      expect(filter.isExcluded('__system__.md')).toBe(true);
    });

    test('does not exclude files with __system__ in non-identity positions', () => {
      const filter = createContentFilter({
        projectDir,
        contentDir: projectDir,
        includePatterns: ['**/*.md'],
        excludePatterns: [],
      });

      // Only the exact reserved docName ('__system__') is blocked — subfolders / lookalikes pass
      expect(filter.isExcluded('notes/__system__-notes.md')).toBe(false);
      expect(filter.isExcluded('docs/about-__system__.md')).toBe(false);
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
      expect(filter.isExcluded('readme.md')).toBe(false);
    });

    test('root gitignore excludes paths mapped through contentRelPrefix', () => {
      const contentDir = join(projectDir, 'docs');
      mkdirSync(contentDir);
      mkdirSync(join(contentDir, 'generated'), { recursive: true });
      // Root .gitignore excludes docs/generated/ (project-relative)
      writeFileSync(join(projectDir, '.gitignore'), 'docs/generated/\n');

      const filter = createContentFilter({
        projectDir,
        contentDir,
        includePatterns: ['**/*.md'],
        excludePatterns: [],
      });

      // Path is contentDir-relative; filter maps to project-relative for gitignore
      expect(filter.isExcluded('generated/output.md')).toBe(true);
      expect(filter.isExcluded('guide.md')).toBe(false);
    });

    test('config exclude patterns work with split dirs', () => {
      const contentDir = join(projectDir, 'docs');
      mkdirSync(contentDir);

      const filter = createContentFilter({
        projectDir,
        contentDir,
        includePatterns: ['**/*.md'],
        excludePatterns: ['archive/**'],
      });

      // Config exclude is contentDir-relative, prefixed internally to docs/archive/**
      expect(filter.isExcluded('archive/old.md')).toBe(true);
      expect(filter.isExcluded('guide.md')).toBe(false);
    });

    test('loads .gitignore at contentDir root when contentDir != projectDir', () => {
      const contentDir = join(projectDir, 'docs');
      mkdirSync(contentDir);
      // .gitignore at contentDir root (not project root)
      writeFileSync(join(contentDir, '.gitignore'), 'drafts/\n');

      const filter = createContentFilter({
        projectDir,
        contentDir,
        includePatterns: ['**/*.md'],
        excludePatterns: [],
      });

      expect(filter.isExcluded('drafts/wip.md')).toBe(true);
      expect(filter.isExcluded('guide.md')).toBe(false);
    });

    test('isDirExcluded works with split dirs', () => {
      const contentDir = join(projectDir, 'docs');
      mkdirSync(contentDir);
      writeFileSync(join(projectDir, '.gitignore'), 'docs/generated/\n');

      const filter = createContentFilter({
        projectDir,
        contentDir,
        includePatterns: ['**/*.md'],
        excludePatterns: [],
      });

      expect(filter.isDirExcluded('generated')).toBe(true);
      expect(filter.isDirExcluded('tutorials')).toBe(false);
    });

    test('handles contentDir completely outside projectDir (dotdot relative path)', async () => {
      const externalContentDir = await mkdtemp(join(tmpdir(), 'content-filter-external-'));
      try {
        mkdirSync(join(externalContentDir, 'sub'), { recursive: true });
        writeFileSync(join(externalContentDir, 'readme.md'), '# Hello');
        writeFileSync(join(externalContentDir, 'sub', 'nested.md'), '# Nested');

        const filter = createContentFilter({
          projectDir,
          contentDir: externalContentDir,
          includePatterns: ['**/*.md'],
          excludePatterns: [],
        });

        expect(filter.isExcluded('readme.md')).toBe(false);
        expect(filter.isExcluded('sub/nested.md')).toBe(false);
        expect(filter.isDirExcluded('sub')).toBe(false);
      } finally {
        await rm(externalContentDir, { recursive: true, force: true });
      }
    });
  });

  describe('sibling-asset inclusion rule (D11)', () => {
    test('includes allowlisted asset when sibling .md exists', () => {
      mkdirSync(join(projectDir, 'docs'));
      writeFileSync(join(projectDir, 'docs', 'guide.md'), '# Guide');

      const filter = createContentFilter({
        projectDir,
        contentDir: projectDir,
        includePatterns: ['**/*.md'],
        excludePatterns: [],
      });

      expect(filter.isExcluded('docs/screenshot.png')).toBe(false);
      expect(filter.isExcluded('docs/photo.jpg')).toBe(false);
      expect(filter.isExcluded('docs/photo.jpeg')).toBe(false);
      expect(filter.isExcluded('docs/anim.gif')).toBe(false);
      expect(filter.isExcluded('docs/image.webp')).toBe(false);
    });

    test('includes SVG asset when sibling .md exists (D12)', () => {
      mkdirSync(join(projectDir, 'docs'));
      writeFileSync(join(projectDir, 'docs', 'guide.md'), '# Guide');

      const filter = createContentFilter({
        projectDir,
        contentDir: projectDir,
        includePatterns: ['**/*.md'],
        excludePatterns: [],
      });

      expect(filter.isExcluded('docs/diagram.svg')).toBe(false);
    });

    test('excludes allowlisted asset when no sibling .md exists', () => {
      mkdirSync(join(projectDir, 'assets'));

      const filter = createContentFilter({
        projectDir,
        contentDir: projectDir,
        includePatterns: ['**/*.md'],
        excludePatterns: [],
      });

      expect(filter.isExcluded('assets/foo.png')).toBe(true);
    });

    test('excludes non-allowlisted extension even with sibling .md', () => {
      mkdirSync(join(projectDir, 'docs'));
      writeFileSync(join(projectDir, 'docs', 'guide.md'), '# Guide');

      const filter = createContentFilter({
        projectDir,
        contentDir: projectDir,
        includePatterns: ['**/*.md'],
        excludePatterns: [],
      });

      expect(filter.isExcluded('docs/script.js')).toBe(true);
      expect(filter.isExcluded('docs/data.json')).toBe(true);
    });

    test('exclude takes precedence over sibling-asset rule', () => {
      mkdirSync(join(projectDir, 'docs'));
      writeFileSync(join(projectDir, 'docs', 'guide.md'), '# Guide');

      const filter = createContentFilter({
        projectDir,
        contentDir: projectDir,
        includePatterns: ['**/*.md'],
        excludePatterns: ['**/*.png'],
      });

      expect(filter.isExcluded('docs/screenshot.png')).toBe(true);
    });

    test('gitignore takes precedence over sibling-asset rule', () => {
      mkdirSync(join(projectDir, 'docs'));
      writeFileSync(join(projectDir, 'docs', 'guide.md'), '# Guide');
      writeFileSync(join(projectDir, '.gitignore'), '*.png\n');

      const filter = createContentFilter({
        projectDir,
        contentDir: projectDir,
        includePatterns: ['**/*.md'],
        excludePatterns: [],
      });

      expect(filter.isExcluded('docs/screenshot.png')).toBe(true);
    });

    test('refcount lifecycle: increment then decrement returns to original', () => {
      const filter = createContentFilter({
        projectDir,
        contentDir: projectDir,
        includePatterns: ['**/*.md'],
        excludePatterns: [],
      });

      expect(filter.isExcluded('docs/screenshot.png')).toBe(true);

      filter.incrementMdDir('docs');
      expect(filter.isExcluded('docs/screenshot.png')).toBe(false);

      filter.decrementMdDir('docs');
      expect(filter.isExcluded('docs/screenshot.png')).toBe(true);
    });

    test('refcount handles multiple .md files in same directory', () => {
      mkdirSync(join(projectDir, 'docs'));
      writeFileSync(join(projectDir, 'docs', 'a.md'), '# A');
      writeFileSync(join(projectDir, 'docs', 'b.md'), '# B');

      const filter = createContentFilter({
        projectDir,
        contentDir: projectDir,
        includePatterns: ['**/*.md'],
        excludePatterns: [],
      });

      expect(filter.isExcluded('docs/img.png')).toBe(false);

      filter.decrementMdDir('docs');
      expect(filter.isExcluded('docs/img.png')).toBe(false);

      filter.decrementMdDir('docs');
      expect(filter.isExcluded('docs/img.png')).toBe(true);
    });

    test('sibling-asset rule works for root-level files', () => {
      writeFileSync(join(projectDir, 'readme.md'), '# README');

      const filter = createContentFilter({
        projectDir,
        contentDir: projectDir,
        includePatterns: ['**/*.md'],
        excludePatterns: [],
      });

      expect(filter.isExcluded('logo.png')).toBe(false);
    });

    test('sibling-asset rule with contentDir different from projectDir', () => {
      const contentDir = join(projectDir, 'content');
      mkdirSync(join(contentDir, 'docs'), { recursive: true });
      writeFileSync(join(contentDir, 'docs', 'guide.md'), '# Guide');

      const filter = createContentFilter({
        projectDir,
        contentDir,
        includePatterns: ['**/*.md'],
        excludePatterns: [],
      });

      expect(filter.isExcluded('docs/screenshot.png')).toBe(false);
      expect(filter.isExcluded('docs/script.js')).toBe(true);
    });
  });
});
