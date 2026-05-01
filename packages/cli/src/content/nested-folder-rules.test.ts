import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { nestedOkPath, parentFolderOf, resolveNestedFrontmatter } from './nested-folder-rules.ts';

describe('resolveNestedFrontmatter', () => {
  let projectDir: string;

  beforeEach(async () => {
    projectDir = await mkdtemp(join(tmpdir(), 'nested-folder-rules-'));
  });

  afterEach(async () => {
    await rm(projectDir, { recursive: true, force: true });
  });

  test('returns empty for project root or empty path', () => {
    expect(resolveNestedFrontmatter(projectDir, '')).toEqual({});
    expect(resolveNestedFrontmatter(projectDir, '.')).toEqual({});
    expect(resolveNestedFrontmatter(projectDir, '/')).toEqual({});
  });

  test('returns empty when no .ok/frontmatter.yml exists in any ancestor', () => {
    expect(resolveNestedFrontmatter(projectDir, 'meetings')).toEqual({});
    expect(resolveNestedFrontmatter(projectDir, 'meetings/prep-notes')).toEqual({});
  });

  test('reads a single nested .ok/frontmatter.yml', () => {
    mkdirSync(join(projectDir, 'meetings', '.ok'), { recursive: true });
    writeFileSync(
      join(projectDir, 'meetings', '.ok', 'frontmatter.yml'),
      'title: Meetings\ndescription: Meeting notes\ntags: [meeting]\n',
    );

    expect(resolveNestedFrontmatter(projectDir, 'meetings')).toEqual({
      title: 'Meetings',
      description: 'Meeting notes',
      tags: ['meeting'],
    });
  });

  test('cascade root → leaf: leaf wins per-key (replace, not merge)', () => {
    mkdirSync(join(projectDir, 'meetings', '.ok'), { recursive: true });
    writeFileSync(
      join(projectDir, 'meetings', '.ok', 'frontmatter.yml'),
      'title: Meetings\ndescription: Meeting notes\ntags: [meeting]\n',
    );
    mkdirSync(join(projectDir, 'meetings', 'prep-notes', '.ok'), { recursive: true });
    writeFileSync(
      join(projectDir, 'meetings', 'prep-notes', '.ok', 'frontmatter.yml'),
      'title: Prep Notes\ntags: [prep]\n',
    );

    // At meetings/prep-notes: title overridden, description inherited, tags REPLACED (D6)
    expect(resolveNestedFrontmatter(projectDir, 'meetings/prep-notes')).toEqual({
      title: 'Prep Notes',
      description: 'Meeting notes',
      tags: ['prep'],
    });

    // At just meetings/: only the meetings-level file applies
    expect(resolveNestedFrontmatter(projectDir, 'meetings')).toEqual({
      title: 'Meetings',
      description: 'Meeting notes',
      tags: ['meeting'],
    });
  });

  test('partial keys at intermediate level: only present keys override', () => {
    mkdirSync(join(projectDir, 'a', '.ok'), { recursive: true });
    writeFileSync(
      join(projectDir, 'a', '.ok', 'frontmatter.yml'),
      'title: A\ndescription: A desc\ntags: [a]\n',
    );
    mkdirSync(join(projectDir, 'a', 'b', '.ok'), { recursive: true });
    writeFileSync(join(projectDir, 'a', 'b', '.ok', 'frontmatter.yml'), 'title: B\n');

    // b overrides title only; description + tags inherited from a
    expect(resolveNestedFrontmatter(projectDir, 'a/b')).toEqual({
      title: 'B',
      description: 'A desc',
      tags: ['a'],
    });
  });

  test('skips project-root .ok/frontmatter.yml (handled by folders[])', () => {
    mkdirSync(join(projectDir, '.ok'), { recursive: true });
    writeFileSync(
      join(projectDir, '.ok', 'frontmatter.yml'),
      'title: Should Be Ignored\ntags: [root]\n',
    );

    expect(resolveNestedFrontmatter(projectDir, 'meetings')).toEqual({});
  });

  test('malformed YAML returns empty (read paths must not throw)', () => {
    mkdirSync(join(projectDir, 'broken', '.ok'), { recursive: true });
    writeFileSync(
      join(projectDir, 'broken', '.ok', 'frontmatter.yml'),
      'title: [malformed\nno closing\n',
    );

    expect(resolveNestedFrontmatter(projectDir, 'broken')).toEqual({});
  });

  test('non-string scalars are dropped, non-string tags are filtered', () => {
    mkdirSync(join(projectDir, 'mixed', '.ok'), { recursive: true });
    writeFileSync(
      join(projectDir, 'mixed', '.ok', 'frontmatter.yml'),
      'title: 42\ndescription: ok\ntags: [a, 1, b, true]\n',
    );

    // Non-string title is dropped; numeric/bool tags filtered out
    expect(resolveNestedFrontmatter(projectDir, 'mixed')).toEqual({
      description: 'ok',
      tags: ['a', 'b'],
    });
  });
});

describe('parentFolderOf', () => {
  test('extracts parent dir from a file path', () => {
    expect(parentFolderOf('meetings/foo.md')).toBe('meetings');
    expect(parentFolderOf('meetings/prep-notes/foo.md')).toBe('meetings/prep-notes');
  });

  test('returns empty for a top-level file', () => {
    expect(parentFolderOf('foo.md')).toBe('');
  });
});

describe('nestedOkPath', () => {
  test('joins folder + .ok + member', () => {
    expect(nestedOkPath('/proj', 'meetings', 'frontmatter.yml')).toBe(
      '/proj/meetings/.ok/frontmatter.yml',
    );
    expect(nestedOkPath('/proj', 'meetings/prep-notes', 'templates')).toBe(
      '/proj/meetings/prep-notes/.ok/templates',
    );
  });

  test('treats empty / "." as project root', () => {
    expect(nestedOkPath('/proj', '', 'frontmatter.yml')).toBe('/proj/.ok/frontmatter.yml');
    expect(nestedOkPath('/proj', '.', 'frontmatter.yml')).toBe('/proj/.ok/frontmatter.yml');
  });
});
