import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  nestedOkPath,
  parentFolderOf,
  resolveNestedFrontmatter,
  resolveNestedFrontmatterWithSources,
} from './nested-folder-rules.ts';

describe('resolveNestedFrontmatter', () => {
  let projectDir: string;

  beforeEach(async () => {
    projectDir = await mkdtemp(join(tmpdir(), 'nested-folder-rules-'));
  });

  afterEach(async () => {
    await rm(projectDir, { recursive: true, force: true });
  });

  test('returns empty for project root when no .ok/frontmatter.yml exists there', () => {
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

  test('cascade root → leaf: scalars replace last-wins, tags union-and-dedup (D6)', () => {
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

    expect(resolveNestedFrontmatter(projectDir, 'meetings/prep-notes')).toEqual({
      title: 'Prep Notes',
      description: 'Meeting notes',
      tags: ['meeting', 'prep'],
    });

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

    expect(resolveNestedFrontmatter(projectDir, 'a/b')).toEqual({
      title: 'B',
      description: 'A desc',
      tags: ['a'],
    });
  });

  test('reads project-root .ok/frontmatter.yml as the seed of the cascade', () => {
    mkdirSync(join(projectDir, '.ok'), { recursive: true });
    writeFileSync(join(projectDir, '.ok', 'frontmatter.yml'), 'title: Project\ntags: [kb]\n');

    expect(resolveNestedFrontmatter(projectDir, 'meetings')).toEqual({
      title: 'Project',
      tags: ['kb'],
    });
    expect(resolveNestedFrontmatter(projectDir, '')).toEqual({
      title: 'Project',
      tags: ['kb'],
    });
  });

  test('nested folder cascades: scalars replace, tags union with root cascade (D6)', () => {
    mkdirSync(join(projectDir, '.ok'), { recursive: true });
    writeFileSync(
      join(projectDir, '.ok', 'frontmatter.yml'),
      'title: Project\ndescription: Root desc\ntags: [kb]\n',
    );
    mkdirSync(join(projectDir, 'meetings', '.ok'), { recursive: true });
    writeFileSync(
      join(projectDir, 'meetings', '.ok', 'frontmatter.yml'),
      'title: Meetings\ntags: [meeting]\n',
    );

    expect(resolveNestedFrontmatter(projectDir, 'meetings')).toEqual({
      title: 'Meetings',
      description: 'Root desc',
      tags: ['kb', 'meeting'],
    });
  });

  test('tags union-and-dedup preserves first-occurrence order on duplicates (D6)', () => {
    mkdirSync(join(projectDir, '.ok'), { recursive: true });
    writeFileSync(join(projectDir, '.ok', 'frontmatter.yml'), 'tags: [a, b]\n');
    mkdirSync(join(projectDir, 'mid', '.ok'), { recursive: true });
    writeFileSync(join(projectDir, 'mid', '.ok', 'frontmatter.yml'), 'tags: [b, c]\n');

    expect(resolveNestedFrontmatter(projectDir, 'mid')).toEqual({
      tags: ['a', 'b', 'c'],
    });
  });

  test('partial-keys at intermediate level: tags inherited via cascade (D6)', () => {
    mkdirSync(join(projectDir, 'a', '.ok'), { recursive: true });
    writeFileSync(
      join(projectDir, 'a', '.ok', 'frontmatter.yml'),
      'title: A\ndescription: A desc\ntags: [a]\n',
    );
    mkdirSync(join(projectDir, 'a', 'b', 'c', '.ok'), { recursive: true });
    writeFileSync(join(projectDir, 'a', 'b', 'c', '.ok', 'frontmatter.yml'), 'tags: [c-tag]\n');

    expect(resolveNestedFrontmatter(projectDir, 'a/b/c')).toEqual({
      title: 'A',
      description: 'A desc',
      tags: ['a', 'c-tag'],
    });
  });

  test('malformed YAML returns empty (read paths must not throw)', () => {
    mkdirSync(join(projectDir, 'broken', '.ok'), { recursive: true });
    writeFileSync(
      join(projectDir, 'broken', '.ok', 'frontmatter.yml'),
      'title: [malformed\nno closing\n',
    );

    expect(resolveNestedFrontmatter(projectDir, 'broken')).toEqual({});
  });

  test('non-string scalars are dropped from well-known title; non-string tags filtered', () => {
    mkdirSync(join(projectDir, 'mixed', '.ok'), { recursive: true });
    writeFileSync(
      join(projectDir, 'mixed', '.ok', 'frontmatter.yml'),
      'title: 42\ndescription: ok\ntags: [a, 1, b, true]\n',
    );

    expect(resolveNestedFrontmatter(projectDir, 'mixed')).toEqual({
      description: 'ok',
      tags: ['a', 'b'],
    });
  });

  test('arbitrary keys cascade with per-type semantics (D6 generalized)', () => {
    mkdirSync(join(projectDir, '.ok'), { recursive: true });
    writeFileSync(
      join(projectDir, '.ok', 'frontmatter.yml'),
      'status: draft\nteam: eng\nowners: [alice]\nreview_cycle: 30\n',
    );
    mkdirSync(join(projectDir, 'specs', '.ok'), { recursive: true });
    writeFileSync(
      join(projectDir, 'specs', '.ok', 'frontmatter.yml'),
      'status: review\nowners: [bob, alice]\npriority: high\n',
    );

    const merged = resolveNestedFrontmatter(projectDir, 'specs');
    expect(merged.status).toBe('review');
    expect(merged.team).toBe('eng');
    expect(merged.review_cycle).toBe(30);
    expect(merged.priority).toBe('high');
    expect(merged.owners).toEqual(['alice', 'bob']);
  });

  test('arbitrary array keys union-and-dedup the same as tags', () => {
    mkdirSync(join(projectDir, '.ok'), { recursive: true });
    writeFileSync(join(projectDir, '.ok', 'frontmatter.yml'), 'reviewers: [alice, bob]\n');
    mkdirSync(join(projectDir, 'rfcs', '.ok'), { recursive: true });
    writeFileSync(join(projectDir, 'rfcs', '.ok', 'frontmatter.yml'), 'reviewers: [carol, bob]\n');

    expect(resolveNestedFrontmatter(projectDir, 'rfcs').reviewers).toEqual([
      'alice',
      'bob',
      'carol',
    ]);
  });
});

describe('resolveNestedFrontmatterWithSources', () => {
  let projectDir: string;

  beforeEach(async () => {
    projectDir = await mkdtemp(join(tmpdir(), 'nested-folder-rules-sources-'));
  });

  afterEach(async () => {
    await rm(projectDir, { recursive: true, force: true });
  });

  test('returns empty merged + sources when no .ok/frontmatter.yml exists anywhere', () => {
    expect(resolveNestedFrontmatterWithSources(projectDir, 'meetings')).toEqual({
      merged: {},
      sources: {},
    });
  });

  test('records project-root cascade source as empty string', () => {
    mkdirSync(join(projectDir, '.ok'), { recursive: true });
    writeFileSync(join(projectDir, '.ok', 'frontmatter.yml'), 'title: Project\ntags: [common]\n');

    const result = resolveNestedFrontmatterWithSources(projectDir, 'meetings');
    expect(result.merged).toEqual({ title: 'Project', tags: ['common'] });
    expect(result.sources).toEqual({ title: '', tags: '' });
  });

  test('per-key source is the deepest contributor for scalars (last-wins)', () => {
    mkdirSync(join(projectDir, 'meetings', '.ok'), { recursive: true });
    writeFileSync(
      join(projectDir, 'meetings', '.ok', 'frontmatter.yml'),
      'title: Meetings\ndescription: Notes\n',
    );
    mkdirSync(join(projectDir, 'meetings', 'prep-notes', '.ok'), { recursive: true });
    writeFileSync(
      join(projectDir, 'meetings', 'prep-notes', '.ok', 'frontmatter.yml'),
      'title: Prep Notes\n',
    );

    const result = resolveNestedFrontmatterWithSources(projectDir, 'meetings/prep-notes');
    expect(result.merged).toEqual({ title: 'Prep Notes', description: 'Notes' });
    expect(result.sources).toEqual({
      title: 'meetings/prep-notes',
      description: 'meetings',
    });
  });

  test('array source is the deepest contributing folder', () => {
    mkdirSync(join(projectDir, 'a', '.ok'), { recursive: true });
    writeFileSync(join(projectDir, 'a', '.ok', 'frontmatter.yml'), 'tags: [root]\n');
    mkdirSync(join(projectDir, 'a', 'b', '.ok'), { recursive: true });
    writeFileSync(join(projectDir, 'a', 'b', '.ok', 'frontmatter.yml'), 'tags: [leaf]\n');

    const result = resolveNestedFrontmatterWithSources(projectDir, 'a/b');
    expect(result.merged.tags).toEqual(['root', 'leaf']);
    expect(result.sources.tags).toBe('a/b');
  });

  test('arbitrary keys (not just title/description/tags) get sources tracked', () => {
    mkdirSync(join(projectDir, 'rfcs', '.ok'), { recursive: true });
    writeFileSync(
      join(projectDir, 'rfcs', '.ok', 'frontmatter.yml'),
      'status: draft\nteam: platform\n',
    );

    const result = resolveNestedFrontmatterWithSources(projectDir, 'rfcs');
    expect(result.merged).toMatchObject({ status: 'draft', team: 'platform' });
    expect(result.sources).toEqual({ status: 'rfcs', team: 'rfcs' });
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
