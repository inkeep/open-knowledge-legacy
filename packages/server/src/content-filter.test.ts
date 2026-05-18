import { afterEach, beforeEach, describe, expect, spyOn, test } from 'bun:test';
import { mkdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { context, metrics, trace } from '@opentelemetry/api';
import { AsyncLocalStorageContextManager } from '@opentelemetry/context-async-hooks';
import {
  BasicTracerProvider,
  InMemorySpanExporter,
  type ReadableSpan,
  SimpleSpanProcessor,
} from '@opentelemetry/sdk-trace-base';
import ignore from 'ignore';
import { createContentFilter } from './content-filter.ts';
import { installTestLoggers, loggerFactory } from './logger.ts';

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

      const filter = createContentFilter({ projectDir, contentDir: projectDir });

      expect(filter.isExcluded('dist/output.md')).toBe(true);
      expect(filter.isExcluded('tmp/scratch.md')).toBe(true);
      expect(filter.isExcluded('docs/readme.md')).toBe(false);
    });

    test('excludes .git directory even without .gitignore', () => {
      const filter = createContentFilter({ projectDir, contentDir: projectDir });

      expect(filter.isExcluded('.git/objects/readme.md')).toBe(true);
    });

    test('respects gitignore negation patterns', () => {
      writeFileSync(join(projectDir, '.gitignore'), 'logs/*\n!logs/important.md\n');

      const filter = createContentFilter({ projectDir, contentDir: projectDir });

      expect(filter.isExcluded('logs/debug.md')).toBe(true);
      expect(filter.isExcluded('logs/important.md')).toBe(false);
    });

    test('handles wildcard patterns in .gitignore', () => {
      writeFileSync(join(projectDir, '.gitignore'), '*.log\nbuild-*\n');

      const filter = createContentFilter({ projectDir, contentDir: projectDir });

      expect(filter.isExcluded('error.log')).toBe(true);
      expect(filter.isExcluded('docs/guide.md')).toBe(false);
    });
  });

  describe('.okignore filtering', () => {
    test('excludes files matching root .okignore patterns', () => {
      writeFileSync(join(projectDir, '.okignore'), 'drafts/\n');

      const filter = createContentFilter({ projectDir, contentDir: projectDir });

      expect(filter.isExcluded('drafts/wip.md')).toBe(true);
      expect(filter.isExcluded('docs/guide.md')).toBe(false);
    });

    test('cross-source negation — .okignore !pattern overrides .gitignore exclusion', () => {
      writeFileSync(join(projectDir, '.gitignore'), 'secret.md\n');
      writeFileSync(join(projectDir, '.okignore'), '!secret.md\n');

      const filter = createContentFilter({ projectDir, contentDir: projectDir });

      expect(filter.isExcluded('secret.md')).toBe(false);
    });

    test('nested .okignore at folder depth applies patterns with correct path prefix', () => {
      mkdirSync(join(projectDir, 'subdir'), { recursive: true });
      writeFileSync(join(projectDir, 'subdir', '.okignore'), 'private.md\n');

      const filter = createContentFilter({ projectDir, contentDir: projectDir });

      expect(filter.isExcluded('subdir/private.md')).toBe(true);
      expect(filter.isExcluded('private.md')).toBe(false);
    });

    test('mixed nested .gitignore + .okignore are both honored', () => {
      writeFileSync(join(projectDir, '.gitignore'), 'node_modules/\n');
      mkdirSync(join(projectDir, 'docs'), { recursive: true });
      writeFileSync(join(projectDir, 'docs', '.gitignore'), 'build/\n');
      writeFileSync(join(projectDir, 'docs', '.okignore'), 'wip/\n');
      mkdirSync(join(projectDir, 'docs', 'build'), { recursive: true });
      mkdirSync(join(projectDir, 'docs', 'wip'), { recursive: true });

      const filter = createContentFilter({ projectDir, contentDir: projectDir });

      expect(filter.isExcluded('docs/build/output.md')).toBe(true);
      expect(filter.isExcluded('docs/wip/draft.md')).toBe(true);
      expect(filter.isExcluded('docs/readme.md')).toBe(false);
    });

    test('malformed lines in .okignore are silently skipped (gitignore parity)', () => {
      writeFileSync(join(projectDir, '.okignore'), '   \n# valid comment\nvalid.md\n');

      const filter = createContentFilter({ projectDir, contentDir: projectDir });

      expect(filter.isExcluded('valid.md')).toBe(true);
      expect(filter.isExcluded('other.md')).toBe(false);
    });
  });

  describe('non-git graceful degradation', () => {
    test('works with no .gitignore and no .okignore', () => {
      const filter = createContentFilter({ projectDir, contentDir: projectDir });

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

      const filter = createContentFilter({ projectDir, contentDir: projectDir });

      expect(filter.isExcluded('subdir/build/output.md')).toBe(true);
      expect(filter.isExcluded('subdir/readme.md')).toBe(false);
    });

    test('skips already-excluded dirs during nested scan (avoids node_modules)', () => {
      writeFileSync(join(projectDir, '.gitignore'), 'node_modules/\n');
      mkdirSync(join(projectDir, 'node_modules', 'pkg'), { recursive: true });
      writeFileSync(join(projectDir, 'node_modules', 'pkg', '.gitignore'), 'test/\n');

      const filter = createContentFilter({ projectDir, contentDir: projectDir });

      expect(filter.isExcluded('node_modules/pkg/readme.md')).toBe(true);
    });
  });

  describe('getWatcherIgnoreGlobs', () => {
    test('returns gitignore + okignore patterns, dropping negation/comment lines', () => {
      writeFileSync(join(projectDir, '.gitignore'), 'dist/\ntmp/\n# comment\n!keep\n');
      writeFileSync(join(projectDir, '.okignore'), 'drafts/\n!important.md\n');

      const filter = createContentFilter({ projectDir, contentDir: projectDir });

      const globs = filter.getWatcherIgnoreGlobs();
      expect(globs).toContain('dist/');
      expect(globs).toContain('tmp/');
      expect(globs).toContain('drafts/');
      expect(globs).not.toContain('!keep');
      expect(globs).not.toContain('!important.md');
      expect(globs).not.toContain('# comment');
    });

    test('returns empty array when no patterns', () => {
      const filter = createContentFilter({ projectDir, contentDir: projectDir });

      expect(filter.getWatcherIgnoreGlobs()).toEqual([]);
    });
  });

  describe('isDirExcluded', () => {
    test('excludes directories matching gitignore directory patterns (trailing slash)', () => {
      writeFileSync(join(projectDir, '.gitignore'), 'node_modules/\ndist/\n');

      const filter = createContentFilter({ projectDir, contentDir: projectDir });

      expect(filter.isDirExcluded('node_modules')).toBe(true);
      expect(filter.isDirExcluded('dist')).toBe(true);
      expect(filter.isDirExcluded('src')).toBe(false);
      expect(filter.isDirExcluded('docs')).toBe(false);
    });

    test('excludes directories matching .okignore patterns', () => {
      writeFileSync(join(projectDir, '.okignore'), 'archive/\n');

      const filter = createContentFilter({ projectDir, contentDir: projectDir });

      expect(filter.isDirExcluded('archive')).toBe(true);
      expect(filter.isDirExcluded('docs')).toBe(false);
    });

    test('excludes built-in skip dirs even without an ignore-file entry', () => {
      const filter = createContentFilter({ projectDir, contentDir: projectDir });

      expect(filter.isDirExcluded('node_modules')).toBe(true);
      expect(filter.isDirExcluded('node_modules/some-pkg')).toBe(true);
      expect(filter.isDirExcluded('.venv')).toBe(true);
      expect(filter.isDirExcluded('vendor')).toBe(true);
      expect(filter.isDirExcluded('dist')).toBe(true);
      expect(filter.isDirExcluded('build')).toBe(true);
      expect(filter.isDirExcluded('.next')).toBe(true);
      expect(filter.isDirExcluded('.turbo')).toBe(true);
      expect(filter.isDirExcluded('coverage')).toBe(true);
      expect(filter.isDirExcluded('.git')).toBe(true);
      expect(filter.isDirExcluded('.ok')).toBe(true);
      expect(filter.isDirExcluded('.ok/local')).toBe(true);
      expect(filter.isDirExcluded('.ok/local/cache')).toBe(true);
      expect(filter.isDirExcluded('docs')).toBe(false);
      expect(filter.isDirExcluded('src')).toBe(false);
    });

    test('excludes BUILTIN_SKIP_DIRS at any path depth, not just top segment (FR-CF1)', () => {
      const filter = createContentFilter({ projectDir, contentDir: projectDir });

      expect(filter.isDirExcluded('meetings/.ok')).toBe(true);
      expect(filter.isDirExcluded('meetings/.ok/templates')).toBe(true);
      expect(filter.isDirExcluded('a/b/c/.ok/d')).toBe(true);

      expect(filter.isDirExcluded('packages/foo/node_modules')).toBe(true);
      expect(filter.isDirExcluded('packages/foo/node_modules/bar')).toBe(true);

      expect(filter.isDirExcluded('apps/web/dist')).toBe(true);
      expect(filter.isDirExcluded('apps/web/.next/cache')).toBe(true);

      expect(filter.isDirExcluded('meetings/prep-notes')).toBe(false);
      expect(filter.isDirExcluded('a/b/c')).toBe(false);
    });

    test('does not descend into node_modules during populateDirCount even with a symlink inside', () => {
      const nmDir = join(projectDir, 'node_modules');
      mkdirSync(nmDir);
      symlinkSync(join(nmDir, 'nonexistent-target'), join(nmDir, 'broken-link'));
      writeFileSync(join(nmDir, 'README.md'), '# Pkg\n');
      writeFileSync(join(projectDir, 'docs.md'), '# Docs\n');

      const filter = createContentFilter({ projectDir, contentDir: projectDir });

      expect(filter.isExcluded('node_modules/logo.png')).toBe(true);
    });

    test('does not descend into .ok during populateDirCount (BUILTIN_SKIP_DIRS)', () => {
      mkdirSync(join(projectDir, '.ok'), { recursive: true });
      writeFileSync(join(projectDir, '.ok', 'AGENTS.md'), '# Agents\n');
      writeFileSync(join(projectDir, 'docs.md'), '# Docs\n');

      const filter = createContentFilter({ projectDir, contentDir: projectDir });

      expect(filter.isDirExcluded('.ok')).toBe(true);
      expect(filter.isExcluded('.ok/logo.png')).toBe(true);
    });

    test('isExcluded rejects supported docs born inside BUILTIN_SKIP_DIRS', () => {
      const filter = createContentFilter({ projectDir, contentDir: projectDir });

      expect(filter.isExcluded('.ok/templates/daily.md')).toBe(true);
      expect(filter.isExcluded('meetings/.ok/templates/standup.md')).toBe(true);
      expect(filter.isExcluded('meetings/.ok/frontmatter.yml.md')).toBe(true);
      expect(filter.isExcluded('node_modules/some-pkg/README.md')).toBe(true);
      expect(filter.isExcluded('apps/web/dist/index.md')).toBe(true);

      expect(filter.isExcluded('meetings/prep-notes.md')).toBe(false);
      expect(filter.isExcluded('docs/intro.md')).toBe(false);
    });
  });

  describe('reserved system doc names', () => {
    test('excludes __system__.md', () => {
      const filter = createContentFilter({ projectDir, contentDir: projectDir });
      expect(filter.isExcluded('__system__.md')).toBe(true);
    });

    test('does not exclude files with __system__ in non-identity positions', () => {
      const filter = createContentFilter({ projectDir, contentDir: projectDir });

      expect(filter.isExcluded('notes/__system__-notes.md')).toBe(false);
      expect(filter.isExcluded('docs/about-__system__.md')).toBe(false);
    });
  });

  describe('reserved config doc names', () => {
    test('excludes __config__/project.md', () => {
      const filter = createContentFilter({ projectDir, contentDir: projectDir });

      expect(filter.isExcluded('__config__/project.md')).toBe(true);
      expect(filter.isExcluded('__config__/project.mdx')).toBe(true);
    });

    test('excludes __user__/config.yml.md', () => {
      const filter = createContentFilter({ projectDir, contentDir: projectDir });

      expect(filter.isExcluded('__user__/config.yml.md')).toBe(true);
      expect(filter.isExcluded('__user__/config.yml.mdx')).toBe(true);
    });

    test('does not exclude unrelated files in __config__/ or __user__/ paths', () => {
      const filter = createContentFilter({ projectDir, contentDir: projectDir });

      expect(filter.isExcluded('__config__/something-else.md')).toBe(false);
      expect(filter.isExcluded('__user__/notes.md')).toBe(false);
      expect(filter.isExcluded('config-workspace.md')).toBe(false);
    });
  });

  describe('contentDir different from projectDir', () => {
    test('filter works when contentDir is a subdirectory of projectDir', () => {
      const contentDir = join(projectDir, 'content');
      mkdirSync(contentDir);
      writeFileSync(join(projectDir, '.gitignore'), 'dist/\n');

      const filter = createContentFilter({ projectDir, contentDir });

      expect(filter.isExcluded('readme.md')).toBe(false);
    });

    test('root gitignore excludes paths mapped through contentRelPrefix', () => {
      const contentDir = join(projectDir, 'docs');
      mkdirSync(contentDir);
      mkdirSync(join(contentDir, 'generated'), { recursive: true });
      writeFileSync(join(projectDir, '.gitignore'), 'docs/generated/\n');

      const filter = createContentFilter({ projectDir, contentDir });

      expect(filter.isExcluded('generated/output.md')).toBe(true);
      expect(filter.isExcluded('guide.md')).toBe(false);
    });

    test('loads .gitignore at contentDir root when contentDir != projectDir', () => {
      const contentDir = join(projectDir, 'docs');
      mkdirSync(contentDir);
      writeFileSync(join(contentDir, '.gitignore'), 'drafts/\n');

      const filter = createContentFilter({ projectDir, contentDir });

      expect(filter.isExcluded('drafts/wip.md')).toBe(true);
      expect(filter.isExcluded('guide.md')).toBe(false);
    });

    test('loads .okignore at contentDir root when contentDir != projectDir', () => {
      const contentDir = join(projectDir, 'docs');
      mkdirSync(contentDir);
      writeFileSync(join(contentDir, '.okignore'), 'drafts/\n');

      const filter = createContentFilter({ projectDir, contentDir });

      expect(filter.isExcluded('drafts/wip.md')).toBe(true);
      expect(filter.isExcluded('guide.md')).toBe(false);
    });

    test('isDirExcluded works with split dirs', () => {
      const contentDir = join(projectDir, 'docs');
      mkdirSync(contentDir);
      writeFileSync(join(projectDir, '.gitignore'), 'docs/generated/\n');

      const filter = createContentFilter({ projectDir, contentDir });

      expect(filter.isDirExcluded('generated')).toBe(true);
      expect(filter.isDirExcluded('tutorials')).toBe(false);
    });

    test('handles contentDir completely outside projectDir (dotdot relative path)', async () => {
      const externalContentDir = await mkdtemp(join(tmpdir(), 'content-filter-external-'));
      try {
        mkdirSync(join(externalContentDir, 'sub'), { recursive: true });
        writeFileSync(join(externalContentDir, 'readme.md'), '# Hello');
        writeFileSync(join(externalContentDir, 'sub', 'nested.md'), '# Nested');

        const filter = createContentFilter({ projectDir, contentDir: externalContentDir });

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

      const filter = createContentFilter({ projectDir, contentDir: projectDir });

      expect(filter.isExcluded('docs/screenshot.png')).toBe(false);
      expect(filter.isExcluded('docs/photo.jpg')).toBe(false);
      expect(filter.isExcluded('docs/photo.jpeg')).toBe(false);
      expect(filter.isExcluded('docs/anim.gif')).toBe(false);
      expect(filter.isExcluded('docs/image.webp')).toBe(false);
    });

    test('includes SVG asset when sibling .md exists (D12)', () => {
      mkdirSync(join(projectDir, 'docs'));
      writeFileSync(join(projectDir, 'docs', 'guide.md'), '# Guide');

      const filter = createContentFilter({ projectDir, contentDir: projectDir });

      expect(filter.isExcluded('docs/diagram.svg')).toBe(false);
    });

    test('excludes allowlisted asset when no sibling .md exists', () => {
      mkdirSync(join(projectDir, 'assets'));

      const filter = createContentFilter({ projectDir, contentDir: projectDir });

      expect(filter.isExcluded('assets/foo.png')).toBe(true);
    });

    test('excludes non-allowlisted extension even with sibling .md', () => {
      mkdirSync(join(projectDir, 'docs'));
      writeFileSync(join(projectDir, 'docs', 'guide.md'), '# Guide');

      const filter = createContentFilter({ projectDir, contentDir: projectDir });

      expect(filter.isExcluded('docs/script.js')).toBe(true);
      expect(filter.isExcluded('docs/arbitrary.xyz')).toBe(true);
      expect(filter.isExcluded('docs/other.unknown')).toBe(true);
    });

    test('includes widened user-drop extensions when sibling .md exists (2026-04-24b)', () => {
      mkdirSync(join(projectDir, 'docs'));
      writeFileSync(join(projectDir, 'docs', 'guide.md'), '# Guide');

      const filter = createContentFilter({ projectDir, contentDir: projectDir });

      expect(filter.isExcluded('docs/clip.m4v')).toBe(false);
      expect(filter.isExcluded('docs/clip.mkv')).toBe(false);
      expect(filter.isExcluded('docs/song.flac')).toBe(false);
      expect(filter.isExcluded('docs/spec.docx')).toBe(false);
      expect(filter.isExcluded('docs/sheet.xlsx')).toBe(false);
      expect(filter.isExcluded('docs/data.csv')).toBe(false);
      expect(filter.isExcluded('docs/notes.txt')).toBe(false);
      expect(filter.isExcluded('docs/config.json')).toBe(false);
    });

    test('.okignore exclusion takes precedence over sibling-asset rule', () => {
      mkdirSync(join(projectDir, 'docs'));
      writeFileSync(join(projectDir, 'docs', 'guide.md'), '# Guide');
      writeFileSync(join(projectDir, '.okignore'), '**/*.png\n');

      const filter = createContentFilter({ projectDir, contentDir: projectDir });

      expect(filter.isExcluded('docs/screenshot.png')).toBe(true);
    });

    test('gitignore takes precedence over sibling-asset rule', () => {
      mkdirSync(join(projectDir, 'docs'));
      writeFileSync(join(projectDir, 'docs', 'guide.md'), '# Guide');
      writeFileSync(join(projectDir, '.gitignore'), '*.png\n');

      const filter = createContentFilter({ projectDir, contentDir: projectDir });

      expect(filter.isExcluded('docs/screenshot.png')).toBe(true);
    });

    test('refcount lifecycle: increment then decrement returns to original', () => {
      const filter = createContentFilter({ projectDir, contentDir: projectDir });

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

      const filter = createContentFilter({ projectDir, contentDir: projectDir });

      expect(filter.isExcluded('docs/img.png')).toBe(false);

      filter.decrementMdDir('docs');
      expect(filter.isExcluded('docs/img.png')).toBe(false);

      filter.decrementMdDir('docs');
      expect(filter.isExcluded('docs/img.png')).toBe(true);
    });

    test('sibling-asset rule works for root-level files', () => {
      writeFileSync(join(projectDir, 'readme.md'), '# README');

      const filter = createContentFilter({ projectDir, contentDir: projectDir });

      expect(filter.isExcluded('logo.png')).toBe(false);
    });

    test('sibling-asset rule with contentDir different from projectDir', () => {
      const contentDir = join(projectDir, 'content');
      mkdirSync(join(contentDir, 'docs'), { recursive: true });
      writeFileSync(join(contentDir, 'docs', 'guide.md'), '# Guide');

      const filter = createContentFilter({ projectDir, contentDir });

      expect(filter.isExcluded('docs/screenshot.png')).toBe(false);
      expect(filter.isExcluded('docs/script.js')).toBe(true);
    });
  });

  describe('isPathIgnored', () => {
    test('admits asset in directory without sibling .md (D11 not applied)', () => {
      mkdirSync(join(projectDir, 'assets'));

      const filter = createContentFilter({ projectDir, contentDir: projectDir });

      expect(filter.isExcluded('assets/logo.png')).toBe(true);
      expect(filter.isPathIgnored('assets/logo.png')).toBe(false);
    });

    test('rejects the reserved system doc name', () => {
      const filter = createContentFilter({ projectDir, contentDir: projectDir });

      expect(filter.isPathIgnored('__system__.md')).toBe(true);
    });

    test('rejects reserved config doc names', () => {
      const filter = createContentFilter({ projectDir, contentDir: projectDir });

      expect(filter.isPathIgnored('__config__/project.md')).toBe(true);
      expect(filter.isPathIgnored('__user__/config.yml.md')).toBe(true);
      expect(filter.isPathIgnored('__local__/project.md')).toBe(true);
    });

    test('rejects paths inside BUILTIN_SKIP_DIRS', () => {
      const filter = createContentFilter({ projectDir, contentDir: projectDir });

      expect(filter.isPathIgnored('node_modules/pkg/img.png')).toBe(true);
      expect(filter.isPathIgnored('dist/output.png')).toBe(true);
      expect(filter.isPathIgnored('.git/objects/pack/foo.png')).toBe(true);
      expect(filter.isPathIgnored('.ok/templates/img.png')).toBe(true);
      expect(filter.isPathIgnored('a/b/node_modules/c/img.png')).toBe(true);
    });

    test('rejects paths matched by .gitignore patterns', () => {
      writeFileSync(join(projectDir, '.gitignore'), 'tmp/\n*.bak.png\n');

      const filter = createContentFilter({ projectDir, contentDir: projectDir });

      expect(filter.isPathIgnored('tmp/foo.png')).toBe(true);
      expect(filter.isPathIgnored('docs/photo.bak.png')).toBe(true);
      expect(filter.isPathIgnored('docs/photo.png')).toBe(false);
    });

    test('rejects paths matched by .okignore patterns', () => {
      writeFileSync(join(projectDir, '.okignore'), 'private/\n');

      const filter = createContentFilter({ projectDir, contentDir: projectDir });

      expect(filter.isPathIgnored('private/diagram.png')).toBe(true);
      expect(filter.isPathIgnored('public/diagram.png')).toBe(false);
    });

    test('admits everything except BUILTIN_SKIP_DIRS when contentDir is outside projectDir', async () => {
      const contentDir = await mkdtemp(join(tmpdir(), 'content-filter-outside-'));
      try {
        writeFileSync(join(projectDir, '.gitignore'), 'tmp/\n');

        const filter = createContentFilter({ projectDir, contentDir });

        expect(filter.isPathIgnored('tmp/foo.png')).toBe(false);
        expect(filter.isPathIgnored('node_modules/foo.png')).toBe(true);
      } finally {
        await rm(contentDir, { recursive: true, force: true });
      }
    });

    test('matches isExcluded for path-level rejections (no sibling-asset case)', () => {
      writeFileSync(join(projectDir, '.gitignore'), 'private/\n');
      mkdirSync(join(projectDir, 'docs'));
      writeFileSync(join(projectDir, 'docs', 'guide.md'), '# Guide');

      const filter = createContentFilter({ projectDir, contentDir: projectDir });

      const cases = [
        '__system__.md',
        '__config__/project.md',
        'node_modules/pkg/img.png',
        'private/diagram.png',
      ];
      for (const p of cases) {
        expect(filter.isExcluded(p), p).toBe(true);
        expect(filter.isPathIgnored(p), p).toBe(true);
      }

      expect(filter.isExcluded('docs/screenshot.png')).toBe(false);
      expect(filter.isPathIgnored('docs/screenshot.png')).toBe(false);
    });
  });

  describe('rebuildIgnorePatterns', () => {
    test('reflects new patterns after .okignore is created on disk', async () => {
      const filter = createContentFilter({ projectDir, contentDir: projectDir });
      expect(filter.isExcluded('drafts/foo.md')).toBe(false);

      writeFileSync(join(projectDir, '.okignore'), 'drafts/\n');
      const result = await filter.rebuildIgnorePatterns();

      expect(result.ok).toBe(true);
      expect(filter.isExcluded('drafts/foo.md')).toBe(true);
      expect(filter.isExcluded('docs/guide.md')).toBe(false);
    });

    test('removes patterns when .okignore is deleted on disk', async () => {
      writeFileSync(join(projectDir, '.okignore'), 'drafts/\n');
      const filter = createContentFilter({ projectDir, contentDir: projectDir });
      expect(filter.isExcluded('drafts/foo.md')).toBe(true);

      rmSync(join(projectDir, '.okignore'));
      await filter.rebuildIgnorePatterns();

      expect(filter.isExcluded('drafts/foo.md')).toBe(false);
    });

    test('refreshes watcher globs when patterns change', async () => {
      writeFileSync(join(projectDir, '.okignore'), 'drafts/\n');
      const filter = createContentFilter({ projectDir, contentDir: projectDir });
      expect(filter.getWatcherIgnoreGlobs()).toContain('drafts/');

      writeFileSync(join(projectDir, '.okignore'), 'archive/\n');
      await filter.rebuildIgnorePatterns();

      const globs = filter.getWatcherIgnoreGlobs();
      expect(globs).toContain('archive/');
      expect(globs).not.toContain('drafts/');
    });

    test('refreshes sibling-asset dirCount against new exclusions', async () => {
      mkdirSync(join(projectDir, 'docs'));
      writeFileSync(join(projectDir, 'docs', 'guide.md'), '# Guide');
      const filter = createContentFilter({ projectDir, contentDir: projectDir });
      expect(filter.isExcluded('docs/screenshot.png')).toBe(false);

      writeFileSync(join(projectDir, '.okignore'), 'docs/\n');
      await filter.rebuildIgnorePatterns();

      expect(filter.isExcluded('docs/guide.md')).toBe(true);
      expect(filter.isExcluded('docs/screenshot.png')).toBe(true);
    });

    test('returns RebuildResult with success branch and bounded attrs', async () => {
      writeFileSync(join(projectDir, '.gitignore'), 'node_modules/\n');
      writeFileSync(join(projectDir, '.okignore'), 'drafts/\nscratch/\n');

      const filter = createContentFilter({ projectDir, contentDir: projectDir });
      const result = await filter.rebuildIgnorePatterns();

      expect(result.ok).toBe(true);
      if (!result.ok) throw new Error('unreachable');
      expect(result.patternCount).toBe(3);
      expect(result.nestedFileCount).toBe(0);
      expect(typeof result.bytes).toBe('number');
      expect(result.bytes).toBeGreaterThan(0);
      expect(typeof result.durationMs).toBe('number');
      expect(result.durationMs).toBeGreaterThanOrEqual(0);
    });

    test('counts nested ignore files correctly', async () => {
      writeFileSync(join(projectDir, '.okignore'), 'drafts/\n');
      mkdirSync(join(projectDir, 'subdir'));
      writeFileSync(join(projectDir, 'subdir', '.okignore'), 'private.md\n');
      mkdirSync(join(projectDir, 'subdir', 'deep'), { recursive: true });
      writeFileSync(join(projectDir, 'subdir', 'deep', '.gitignore'), 'tmp/\n');

      const filter = createContentFilter({ projectDir, contentDir: projectDir });
      const result = await filter.rebuildIgnorePatterns();

      expect(result.ok).toBe(true);
      if (!result.ok) throw new Error('unreachable');
      expect(result.nestedFileCount).toBe(2);
    });

    test('fires onAfterRebuild on success', async () => {
      let calls = 0;
      const filter = createContentFilter({
        projectDir,
        contentDir: projectDir,
        onAfterRebuild: () => {
          calls++;
        },
      });

      expect(calls).toBe(0);

      writeFileSync(join(projectDir, '.okignore'), 'drafts/\n');
      const result = await filter.rebuildIgnorePatterns();

      expect(result.ok).toBe(true);
      expect(calls).toBe(1);
    });

    test('does not fire onAfterRebuild on error (state rolls back)', async () => {
      writeFileSync(join(projectDir, '.okignore'), 'drafts/\n');
      let calls = 0;
      const filter = createContentFilter({
        projectDir,
        contentDir: projectDir,
        onAfterRebuild: () => {
          calls++;
        },
      });

      const sampleProto = Object.getPrototypeOf(ignore());
      const addSpy = spyOn(sampleProto, 'add').mockImplementationOnce(() => {
        throw new Error('forced ignore.add failure');
      });

      try {
        const result = await filter.rebuildIgnorePatterns();
        expect(result.ok).toBe(false);
        if (result.ok) throw new Error('unreachable');
        expect(result.error.message).toContain('forced ignore.add failure');
        expect(calls).toBe(0);
        expect(filter.isExcluded('drafts/foo.md')).toBe(true);
        expect(filter.isExcluded('docs/guide.md')).toBe(false);
      } finally {
        addSpy.mockRestore();
      }
    });

    test('rolls back state on error (ig + watcherGlobs + dirCount)', async () => {
      writeFileSync(join(projectDir, '.okignore'), 'drafts/\n');
      mkdirSync(join(projectDir, 'docs'));
      writeFileSync(join(projectDir, 'docs', 'guide.md'), '# Guide');

      const filter = createContentFilter({ projectDir, contentDir: projectDir });
      expect(filter.isExcluded('drafts/x.md')).toBe(true);
      expect(filter.isExcluded('docs/screenshot.png')).toBe(false);
      expect(filter.getWatcherIgnoreGlobs()).toContain('drafts/');

      const sampleProto = Object.getPrototypeOf(ignore());
      const addSpy = spyOn(sampleProto, 'add').mockImplementationOnce(() => {
        throw new Error('boom');
      });

      writeFileSync(join(projectDir, '.okignore'), 'archive/\n');

      try {
        const result = await filter.rebuildIgnorePatterns();
        expect(result.ok).toBe(false);

        expect(filter.isExcluded('drafts/x.md')).toBe(true);
        expect(filter.isExcluded('archive/x.md')).toBe(false);
        expect(filter.getWatcherIgnoreGlobs()).toContain('drafts/');
        expect(filter.getWatcherIgnoreGlobs()).not.toContain('archive/');
        expect(filter.isExcluded('docs/screenshot.png')).toBe(false);
      } finally {
        addSpy.mockRestore();
      }
    });

    test('callback throws are logged but do not roll back the rebuild', async () => {
      const filter = createContentFilter({
        projectDir,
        contentDir: projectDir,
        onAfterRebuild: () => {
          throw new Error('callback explosion');
        },
      });

      writeFileSync(join(projectDir, '.okignore'), 'drafts/\n');
      const result = await filter.rebuildIgnorePatterns();

      expect(result.ok).toBe(true);
      expect(filter.isExcluded('drafts/foo.md')).toBe(true);
    });
  });

  describe('rebuildIgnorePatterns telemetry', () => {
    let exporter: InMemorySpanExporter;
    let provider: BasicTracerProvider;

    beforeEach(() => {
      exporter = new InMemorySpanExporter();
      provider = new BasicTracerProvider({
        spanProcessors: [new SimpleSpanProcessor(exporter)],
      });
      trace.setGlobalTracerProvider(provider);
      context.setGlobalContextManager(new AsyncLocalStorageContextManager().enable());
      installTestLoggers();
    });

    afterEach(async () => {
      await provider.shutdown();
      trace.disable();
      metrics.disable();
      context.disable();
      loggerFactory.reset();
    });

    test('emits one config.ignore.rebuild span per call with bounded attrs', async () => {
      writeFileSync(join(projectDir, '.gitignore'), 'node_modules/\n');
      writeFileSync(join(projectDir, '.okignore'), 'drafts/\nscratch/\n');

      const filter = createContentFilter({ projectDir, contentDir: projectDir });
      const result = await filter.rebuildIgnorePatterns();
      expect(result.ok).toBe(true);

      const spans = exporter
        .getFinishedSpans()
        .filter((s: ReadableSpan) => s.name === 'config.ignore.rebuild');
      expect(spans.length).toBe(1);
      const span = spans[0];
      if (!span) throw new Error('no span');

      const attrs = span.attributes;
      expect(attrs['ok.ignore.pattern_count']).toBe(3);
      expect(attrs['ok.ignore.nested_file_count']).toBe(0);
      expect(typeof attrs['ok.ignore.bytes']).toBe('number');

      const allowedAttrKeys = new Set([
        'ok.ignore.pattern_count',
        'ok.ignore.nested_file_count',
        'ok.ignore.bytes',
      ]);
      for (const key of Object.keys(attrs)) {
        expect(allowedAttrKeys.has(key)).toBe(true);
      }
    });

    test('failed rebuild still emits the span, with ERROR status', async () => {
      const filter = createContentFilter({ projectDir, contentDir: projectDir });

      const sampleProto = Object.getPrototypeOf(ignore());
      const addSpy = spyOn(sampleProto, 'add').mockImplementationOnce(() => {
        throw new Error('boom');
      });

      try {
        const result = await filter.rebuildIgnorePatterns();
        expect(result.ok).toBe(false);
      } finally {
        addSpy.mockRestore();
      }

      const spans = exporter
        .getFinishedSpans()
        .filter((s: ReadableSpan) => s.name === 'config.ignore.rebuild');
      expect(spans.length).toBe(1);
      const span = spans[0];
      if (!span) throw new Error('no span');
      expect(span.status).toBeDefined();
    });
  });

  describe('rebuildIgnorePatterns performance gate (NFR Performance)', () => {
    test('rebuild on N=1000-doc workspace completes well under 500ms', async () => {
      writeFileSync(join(projectDir, '.gitignore'), 'node_modules/\n');
      writeFileSync(join(projectDir, '.okignore'), 'drafts/\n');
      for (let d = 0; d < 50; d++) {
        const dir = join(projectDir, `folder-${d}`);
        mkdirSync(dir);
        for (let f = 0; f < 20; f++) {
          writeFileSync(join(dir, `doc-${f}.md`), '# x');
        }
        if (d % 10 === 0) {
          writeFileSync(join(dir, '.okignore'), 'tmp/\n');
        }
      }

      const filter = createContentFilter({ projectDir, contentDir: projectDir });

      await filter.rebuildIgnorePatterns();

      const samples: number[] = [];
      const runs = 5;
      for (let i = 0; i < runs; i++) {
        const result = await filter.rebuildIgnorePatterns();
        expect(result.ok).toBe(true);
        if (!result.ok) throw new Error('unreachable');
        samples.push(result.durationMs);
      }
      const max = Math.max(...samples);
      expect(max).toBeLessThan(500);
    });
  });

  describe('FR15 default-shape regression', () => {
    test('default project (gitignore + no .okignore + no content.* keys) indexes the same .md/.mdx set as before the rename', () => {
      writeFileSync(join(projectDir, '.gitignore'), 'node_modules/\n');
      mkdirSync(join(projectDir, 'docs'), { recursive: true });
      writeFileSync(join(projectDir, 'docs', 'guide.md'), '# Guide');
      writeFileSync(join(projectDir, 'docs', 'overview.mdx'), '# Overview');
      mkdirSync(join(projectDir, 'node_modules', 'pkg'), { recursive: true });
      writeFileSync(join(projectDir, 'node_modules', 'pkg', 'README.md'), '# Pkg');
      writeFileSync(join(projectDir, 'README.md'), '# Project');
      writeFileSync(join(projectDir, 'script.ts'), 'export {}');

      const filter = createContentFilter({ projectDir, contentDir: projectDir });

      expect(filter.isExcluded('README.md')).toBe(false);
      expect(filter.isExcluded('docs/guide.md')).toBe(false);
      expect(filter.isExcluded('docs/overview.mdx')).toBe(false);

      expect(filter.isExcluded('node_modules/pkg/README.md')).toBe(true);
      expect(filter.isExcluded('script.ts')).toBe(true);
    });
  });

  describe('bypassFilters mode (Show All Files — FR6 / D12)', () => {
    test('admits .gitignored files', () => {
      writeFileSync(join(projectDir, '.gitignore'), 'secrets/\n*.log\n');
      const filter = createContentFilter({ projectDir, contentDir: projectDir });

      expect(filter.isExcluded('secrets/api-key.md')).toBe(true);
      expect(filter.isExcluded('debug.log')).toBe(true);

      expect(filter.isExcluded('secrets/api-key.md', { bypassFilters: true })).toBe(false);
      expect(filter.isExcluded('debug.log', { bypassFilters: true })).toBe(false);
    });

    test('admits .okignored files', () => {
      writeFileSync(join(projectDir, '.okignore'), 'drafts/\n');
      const filter = createContentFilter({ projectDir, contentDir: projectDir });

      expect(filter.isExcluded('drafts/wip.md')).toBe(true);
      expect(filter.isExcluded('drafts/wip.md', { bypassFilters: true })).toBe(false);
    });

    test('admits files inside BUILTIN_SKIP_DIRS (.git, .ok, node_modules, dist, etc.)', () => {
      const filter = createContentFilter({ projectDir, contentDir: projectDir });

      expect(filter.isExcluded('.git/objects/foo.md')).toBe(true);
      expect(filter.isExcluded('.ok/templates/daily.md')).toBe(true);
      expect(filter.isExcluded('node_modules/pkg/README.md')).toBe(true);
      expect(filter.isExcluded('apps/web/dist/index.md')).toBe(true);

      expect(filter.isExcluded('.git/objects/foo.md', { bypassFilters: true })).toBe(false);
      expect(filter.isExcluded('.ok/templates/daily.md', { bypassFilters: true })).toBe(false);
      expect(filter.isExcluded('node_modules/pkg/README.md', { bypassFilters: true })).toBe(false);
      expect(filter.isExcluded('apps/web/dist/index.md', { bypassFilters: true })).toBe(false);
    });

    test('admits non-md/non-asset extensions (.ts, .py, .sh, .yaml)', () => {
      const filter = createContentFilter({ projectDir, contentDir: projectDir });

      expect(filter.isExcluded('src/index.ts')).toBe(true);
      expect(filter.isExcluded('scripts/build.sh')).toBe(true);
      expect(filter.isExcluded('analysis.py')).toBe(true);
      expect(filter.isExcluded('config.yaml')).toBe(true);

      expect(filter.isExcluded('src/index.ts', { bypassFilters: true })).toBe(false);
      expect(filter.isExcluded('scripts/build.sh', { bypassFilters: true })).toBe(false);
      expect(filter.isExcluded('analysis.py', { bypassFilters: true })).toBe(false);
      expect(filter.isExcluded('config.yaml', { bypassFilters: true })).toBe(false);
    });

    test('STOP rule preserved — reserved system + config doc names stay hidden in bypass mode', () => {
      const filter = createContentFilter({ projectDir, contentDir: projectDir });

      expect(filter.isExcluded('__system__.md', { bypassFilters: true })).toBe(true);
      expect(filter.isExcluded('__config__/project.md', { bypassFilters: true })).toBe(true);
      expect(filter.isExcluded('__config__/project.mdx', { bypassFilters: true })).toBe(true);
      expect(filter.isExcluded('__config__/okignore.md', { bypassFilters: true })).toBe(true);
      expect(filter.isExcluded('__user__/config.yml.md', { bypassFilters: true })).toBe(true);
      expect(filter.isExcluded('__local__/project.md', { bypassFilters: true })).toBe(true);
    });

    test('isDirExcluded admits BUILTIN_SKIP_DIRS + gitignored dirs in bypass mode', () => {
      writeFileSync(join(projectDir, '.gitignore'), 'drafts/\n');
      const filter = createContentFilter({ projectDir, contentDir: projectDir });

      expect(filter.isDirExcluded('node_modules')).toBe(true);
      expect(filter.isDirExcluded('.git')).toBe(true);
      expect(filter.isDirExcluded('.ok/templates')).toBe(true);
      expect(filter.isDirExcluded('drafts')).toBe(true);

      expect(filter.isDirExcluded('node_modules', { bypassFilters: true })).toBe(false);
      expect(filter.isDirExcluded('.git', { bypassFilters: true })).toBe(false);
      expect(filter.isDirExcluded('.ok/templates', { bypassFilters: true })).toBe(false);
      expect(filter.isDirExcluded('drafts', { bypassFilters: true })).toBe(false);
    });

    test('isPathIgnored preserves STOP rule in bypass mode', () => {
      writeFileSync(join(projectDir, '.gitignore'), 'private/\n');
      const filter = createContentFilter({ projectDir, contentDir: projectDir });

      expect(filter.isPathIgnored('private/secret.md')).toBe(true);
      expect(filter.isPathIgnored('docs/readme.md')).toBe(false);
      expect(filter.isPathIgnored('__system__.md')).toBe(true);

      expect(filter.isPathIgnored('private/secret.md', { bypassFilters: true })).toBe(false);
      expect(filter.isPathIgnored('__system__.md', { bypassFilters: true })).toBe(true);
      expect(filter.isPathIgnored('__config__/project.md', { bypassFilters: true })).toBe(true);
    });

    test('default behavior (no opts) byte-equivalent to opts.bypassFilters === false', () => {
      writeFileSync(join(projectDir, '.gitignore'), 'dist/\n');
      const filter = createContentFilter({ projectDir, contentDir: projectDir });

      const paths = ['dist/out.md', 'docs/guide.md', '__system__.md', 'script.ts'];
      for (const p of paths) {
        expect(filter.isExcluded(p)).toBe(filter.isExcluded(p, { bypassFilters: false }));
        expect(filter.isDirExcluded(p)).toBe(filter.isDirExcluded(p, { bypassFilters: false }));
        expect(filter.isPathIgnored(p)).toBe(filter.isPathIgnored(p, { bypassFilters: false }));
      }
    });
  });
});
