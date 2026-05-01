import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { mkdirSync, symlinkSync, writeFileSync } from 'node:fs';
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
      // Use logs/* (not logs/) so negation can un-ignore files within the dir.
      // This matches real git behavior: directory-level ignore blocks all negation.
      writeFileSync(join(projectDir, '.gitignore'), 'logs/*\n!logs/important.md\n');

      const filter = createContentFilter({ projectDir, contentDir: projectDir });

      expect(filter.isExcluded('logs/debug.md')).toBe(true);
      expect(filter.isExcluded('logs/important.md')).toBe(false);
    });

    test('handles wildcard patterns in .gitignore', () => {
      writeFileSync(join(projectDir, '.gitignore'), '*.log\nbuild-*\n');

      const filter = createContentFilter({ projectDir, contentDir: projectDir });

      // .log is not a supported doc extension; the upstream gate already
      // excludes it. Filter alone is consulted only with supported docs in
      // production, but the test asserts that the filter's gitignore matching
      // doesn't accidentally let it through either.
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

      // .gitignore alone would exclude. The negation in .okignore wins because
      // both files are loaded into the same `ignore` instance.
      expect(filter.isExcluded('secret.md')).toBe(false);
    });

    test('nested .okignore at folder depth applies patterns with correct path prefix', () => {
      mkdirSync(join(projectDir, 'subdir'), { recursive: true });
      writeFileSync(join(projectDir, 'subdir', '.okignore'), 'private.md\n');

      const filter = createContentFilter({ projectDir, contentDir: projectDir });

      expect(filter.isExcluded('subdir/private.md')).toBe(true);
      // The nested rule is folder-scoped — root-level same-named file is admitted.
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
      // node-ignore drops invalid patterns silently — same as git itself.
      writeFileSync(join(projectDir, '.okignore'), '   \n# valid comment\nvalid.md\n');

      const filter = createContentFilter({ projectDir, contentDir: projectDir });

      expect(filter.isExcluded('valid.md')).toBe(true);
      // Filter constructed without crashing; valid line still applies.
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
      // Should not include negation or comment patterns
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
      // BUILTIN_SKIP_DIRS prunes package-manager, runtime, build-output, and
      // per-project state directories regardless of user config.
      const filter = createContentFilter({ projectDir, contentDir: projectDir });

      // Package managers / runtimes
      expect(filter.isDirExcluded('node_modules')).toBe(true);
      expect(filter.isDirExcluded('node_modules/some-pkg')).toBe(true);
      expect(filter.isDirExcluded('.venv')).toBe(true);
      expect(filter.isDirExcluded('vendor')).toBe(true);
      // Build output
      expect(filter.isDirExcluded('dist')).toBe(true);
      expect(filter.isDirExcluded('build')).toBe(true);
      expect(filter.isDirExcluded('.next')).toBe(true);
      expect(filter.isDirExcluded('.turbo')).toBe(true);
      expect(filter.isDirExcluded('coverage')).toBe(true);
      // VCS / per-project state
      expect(filter.isDirExcluded('.git')).toBe(true);
      expect(filter.isDirExcluded('.ok')).toBe(true);
      expect(filter.isDirExcluded('.ok/cache')).toBe(true);
      // Normal dirs still pass
      expect(filter.isDirExcluded('docs')).toBe(false);
      expect(filter.isDirExcluded('src')).toBe(false);
    });

    test('does not descend into node_modules during populateDirCount even with a symlink inside', () => {
      // Create a node_modules dir with a broken symlink (simulates pnpm layout)
      const nmDir = join(projectDir, 'node_modules');
      mkdirSync(nmDir);
      // Broken symlink — target does not exist
      symlinkSync(join(nmDir, 'nonexistent-target'), join(nmDir, 'broken-link'));
      // A real .md inside node_modules — if populateDirCount descends, the dir
      // would count as having an included doc, making its sibling assets pass.
      writeFileSync(join(nmDir, 'README.md'), '# Pkg\n');
      writeFileSync(join(projectDir, 'docs.md'), '# Docs\n');

      const filter = createContentFilter({ projectDir, contentDir: projectDir });

      // node_modules was skipped: the .md inside it was NOT counted, so the
      // sibling-asset rule does not apply and its assets remain excluded.
      expect(filter.isExcluded('node_modules/logo.png')).toBe(true);
    });

    test('does not descend into .ok during populateDirCount (BUILTIN_SKIP_DIRS)', () => {
      // Adding `.ok` to BUILTIN_SKIP_DIRS skips the walker descent entirely,
      // independent of the committed `.ok/.gitignore` self-ignore. Without
      // this, tooling that runs against a project with markdown inside `.ok/`
      // (e.g. seed/starter scaffolding) would falsely admit assets next to
      // those internal docs.
      mkdirSync(join(projectDir, '.ok'), { recursive: true });
      writeFileSync(join(projectDir, '.ok', 'AGENTS.md'), '# Agents\n');
      writeFileSync(join(projectDir, 'docs.md'), '# Docs\n');

      const filter = createContentFilter({ projectDir, contentDir: projectDir });

      expect(filter.isDirExcluded('.ok')).toBe(true);
      // No descent → no dirCount entry for `.ok` → asset stays excluded.
      expect(filter.isExcluded('.ok/logo.png')).toBe(true);
    });
  });

  describe('reserved system doc names', () => {
    test('excludes __system__.md', () => {
      const filter = createContentFilter({ projectDir, contentDir: projectDir });
      expect(filter.isExcluded('__system__.md')).toBe(true);
    });

    test('does not exclude files with __system__ in non-identity positions', () => {
      const filter = createContentFilter({ projectDir, contentDir: projectDir });

      // Only the exact reserved docName ('__system__') is blocked — subfolders / lookalikes pass
      expect(filter.isExcluded('notes/__system__-notes.md')).toBe(false);
      expect(filter.isExcluded('docs/about-__system__.md')).toBe(false);
    });
  });

  describe('reserved config doc names', () => {
    // US-005: synthetic config-doc admission means the same content-filter
    // bypass that protects __system__.md must also reject any disk artifact
    // named after the project or user-global config docs. Sidecars or
    // accidental collisions on those names would otherwise round-trip into
    // the user's content tree.
    test('excludes __config__/project.md', () => {
      const filter = createContentFilter({ projectDir, contentDir: projectDir });

      expect(filter.isExcluded('__config__/project.md')).toBe(true);
      expect(filter.isExcluded('__config__/project.mdx')).toBe(true);
    });

    test('excludes __user__/config.yml.md', () => {
      const filter = createContentFilter({ projectDir, contentDir: projectDir });

      // After stripDocExtension, '__user__/config.yml.md' → '__user__/config.yml'
      // which is the reserved doc name for the user-global config.
      expect(filter.isExcluded('__user__/config.yml.md')).toBe(true);
      expect(filter.isExcluded('__user__/config.yml.mdx')).toBe(true);
    });

    test('does not exclude unrelated files in __config__/ or __user__/ paths', () => {
      const filter = createContentFilter({ projectDir, contentDir: projectDir });

      // Only the exact reserved synthetic names are blocked.
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

      // Paths are relative to contentDir for the filter API,
      // but mapped to projectDir-relative for the ignore lookup.
      expect(filter.isExcluded('readme.md')).toBe(false);
    });

    test('root gitignore excludes paths mapped through contentRelPrefix', () => {
      const contentDir = join(projectDir, 'docs');
      mkdirSync(contentDir);
      mkdirSync(join(contentDir, 'generated'), { recursive: true });
      // Root .gitignore excludes docs/generated/ (project-relative)
      writeFileSync(join(projectDir, '.gitignore'), 'docs/generated/\n');

      const filter = createContentFilter({ projectDir, contentDir });

      // Path is contentDir-relative; filter maps to project-relative for gitignore
      expect(filter.isExcluded('generated/output.md')).toBe(true);
      expect(filter.isExcluded('guide.md')).toBe(false);
    });

    test('loads .gitignore at contentDir root when contentDir != projectDir', () => {
      const contentDir = join(projectDir, 'docs');
      mkdirSync(contentDir);
      // .gitignore at contentDir root (not project root)
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

      // Script extensions and arbitrary unknown types stay excluded even when
      // a sibling .md is present.
      expect(filter.isExcluded('docs/script.js')).toBe(true);
      expect(filter.isExcluded('docs/arbitrary.xyz')).toBe(true);
      expect(filter.isExcluded('docs/other.unknown')).toBe(true);
    });

    test('includes widened user-drop extensions when sibling .md exists (2026-04-24b)', () => {
      // SPEC §Post-finalization amendment (2026-04-24b) — D-M accept-all
      // alignment. Pins the widened ASSET_EXTENSIONS set against the filter's
      // admission behavior — one representative from each user-visible class.
      mkdirSync(join(projectDir, 'docs'));
      writeFileSync(join(projectDir, 'docs', 'guide.md'), '# Guide');

      const filter = createContentFilter({ projectDir, contentDir: projectDir });

      // Video (the bug reporter's file type)
      expect(filter.isExcluded('docs/clip.m4v')).toBe(false);
      expect(filter.isExcluded('docs/clip.mkv')).toBe(false);
      // Audio
      expect(filter.isExcluded('docs/song.flac')).toBe(false);
      // Office docs
      expect(filter.isExcluded('docs/spec.docx')).toBe(false);
      expect(filter.isExcluded('docs/sheet.xlsx')).toBe(false);
      // Tabular / text
      expect(filter.isExcluded('docs/data.csv')).toBe(false);
      expect(filter.isExcluded('docs/notes.txt')).toBe(false);
      // Data serialization
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

  describe('FR15 default-shape regression', () => {
    test('default project (gitignore + no .okignore + no content.* keys) indexes the same .md/.mdx set as before the rename', () => {
      // FR15 verification: a project with only .gitignore + no custom config
      // and no .okignore must index the exact same files as the pre-rename
      // baseline did with `content.include = ['**/*.md', '**/*.mdx']` and
      // empty `content.exclude`.
      writeFileSync(join(projectDir, '.gitignore'), 'node_modules/\n');
      mkdirSync(join(projectDir, 'docs'), { recursive: true });
      writeFileSync(join(projectDir, 'docs', 'guide.md'), '# Guide');
      writeFileSync(join(projectDir, 'docs', 'overview.mdx'), '# Overview');
      mkdirSync(join(projectDir, 'node_modules', 'pkg'), { recursive: true });
      writeFileSync(join(projectDir, 'node_modules', 'pkg', 'README.md'), '# Pkg');
      writeFileSync(join(projectDir, 'README.md'), '# Project');
      writeFileSync(join(projectDir, 'script.ts'), 'export {}');

      const filter = createContentFilter({ projectDir, contentDir: projectDir });

      // Indexed: README.md, docs/guide.md, docs/overview.mdx
      expect(filter.isExcluded('README.md')).toBe(false);
      expect(filter.isExcluded('docs/guide.md')).toBe(false);
      expect(filter.isExcluded('docs/overview.mdx')).toBe(false);

      // Excluded: node_modules content (gitignore + BUILTIN_SKIP_DIRS), .ts
      // (not a supported doc), nothing else.
      expect(filter.isExcluded('node_modules/pkg/README.md')).toBe(true);
      expect(filter.isExcluded('script.ts')).toBe(true);
    });
  });
});
