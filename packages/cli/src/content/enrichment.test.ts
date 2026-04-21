import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { commitWip, initHistoryRepo, type WriterIdentity } from '@inkeep/open-knowledge-server';
import simpleGit from 'simple-git';
import type { FolderRule } from '../config/schema.ts';
import { enrichDirectory, enrichPath } from './enrichment.ts';

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await mkdtemp(resolve(tmpdir(), 'ok-enrich-test-'));
});

afterEach(async () => {
  await rm(tmpDir, { recursive: true, force: true });
});

async function bootstrapProject(): Promise<string> {
  const project = resolve(tmpDir, 'project');
  mkdirSync(project, { recursive: true });
  const git = simpleGit(project);
  await git.init();
  await git.raw('config', 'user.name', 'Test');
  await git.raw('config', 'user.email', 't@t.test');
  writeFileSync(resolve(project, 'README.md'), '# root\n');
  await git.add('README.md');
  await git.commit('init');
  return project;
}

describe('enrichPath — slim (multi-path) shape', () => {
  test('rich fields are null when includeRichFields is false/absent', async () => {
    const project = await bootstrapProject();
    const contentDir = resolve(project, 'content');
    mkdirSync(contentDir, { recursive: true });
    writeFileSync(
      resolve(contentDir, 'auth.md'),
      '---\ntitle: Auth\ndescription: OAuth\ntags:\n  - auth\n  - oauth\n---\n\nBody\n',
    );

    const meta = await enrichPath('content/auth.md', { projectDir: project });

    expect(meta.path).toBe('content/auth.md');
    expect(meta.title).toBe('Auth');
    expect(meta.description).toBe('OAuth');
    expect(meta.tags).toEqual(['auth', 'oauth']);
    // Rich fields are null (slim shape)
    expect(meta.backlinkCount).toBe(null);
    expect(meta.history).toBe(null);
    expect(meta.historySource).toBe(null);
  });

  test('tolerates missing frontmatter — title/description undefined, tags empty', async () => {
    const project = await bootstrapProject();
    const contentDir = resolve(project, 'content');
    mkdirSync(contentDir, { recursive: true });
    writeFileSync(resolve(contentDir, 'plain.md'), 'Just body\n');

    const meta = await enrichPath('content/plain.md', { projectDir: project });

    expect(meta.title).toBeUndefined();
    expect(meta.description).toBeUndefined();
    expect(meta.tags).toEqual([]);
  });

  test('missing file still returns a slim shape with tags=[]', async () => {
    const project = await bootstrapProject();
    const meta = await enrichPath('does-not-exist.md', { projectDir: project });
    expect(meta.path).toBe('does-not-exist.md');
    expect(meta.tags).toEqual([]);
  });
});

describe('enrichPath — rich (single-path) shape', () => {
  test('populates history from shadow repo and backlinkCount=null when no serverUrl', async () => {
    const project = await bootstrapProject();
    const shadow = await initHistoryRepo(project);
    const contentDir = resolve(project, 'content');
    mkdirSync(contentDir, { recursive: true });
    writeFileSync(resolve(contentDir, 'auth.md'), '---\ntitle: Auth\n---\nBody\n');
    const writer: WriterIdentity = { id: 'agent-x', name: 'X', email: 'x@t.test' };
    const branch = (await simpleGit(project).revparse(['--abbrev-ref', 'HEAD'])).trim();
    await commitWip(shadow, writer, contentDir, 'initial', branch);

    const meta = await enrichPath(
      'content/auth.md',
      { projectDir: project },
      { includeRichFields: true },
    );

    expect(meta.title).toBe('Auth');
    expect(meta.historySource).toBe('history-repo');
    expect(meta.history).not.toBeNull();
    expect(meta.history?.length).toBe(1);
    expect(meta.history?.[0].writerClassification).toBe('agent');
    expect(meta.history?.[0].message).toBe('initial');
    expect(meta.backlinkCount).toBe(null);
  });

  test('returns historySource="shadow-repo-absent" when no shadow repo exists', async () => {
    const project = await bootstrapProject();
    const contentDir = resolve(project, 'content');
    mkdirSync(contentDir, { recursive: true });
    writeFileSync(resolve(contentDir, 'auth.md'), '---\ntitle: Auth\n---\nBody\n');

    const meta = await enrichPath(
      'content/auth.md',
      { projectDir: project },
      { includeRichFields: true },
    );

    expect(meta.historySource).toBe('history-repo-absent');
    expect(meta.history).toEqual([]);
    expect(meta.backlinkCount).toBe(null);
  });
});

describe('enrichPath — folder-rule merge', () => {
  test('no folderRules → identical behavior to today (file-only)', async () => {
    const project = await bootstrapProject();
    mkdirSync(resolve(project, 'specs'), { recursive: true });
    writeFileSync(resolve(project, 'specs/foo.md'), '---\ntitle: Foo\n---\nBody\n');

    const without = await enrichPath('specs/foo.md', { projectDir: project });
    const withEmpty = await enrichPath('specs/foo.md', {
      projectDir: project,
      folderRules: [],
    });

    expect(without.title).toBe('Foo');
    expect(withEmpty.title).toBe('Foo');
    expect(without.tags).toEqual([]);
    expect(withEmpty.tags).toEqual([]);
  });

  test('file has no frontmatter → folder rule fills in title/description/tags', async () => {
    const project = await bootstrapProject();
    mkdirSync(resolve(project, 'specs'), { recursive: true });
    writeFileSync(resolve(project, 'specs/foo.md'), 'Body only\n');

    const rules: FolderRule[] = [
      {
        match: 'specs/**',
        frontmatter: { title: 'Specs', description: 'Spec docs', tags: ['spec'] },
      },
    ];
    const meta = await enrichPath('specs/foo.md', { projectDir: project, folderRules: rules });
    expect(meta.title).toBe('Specs');
    expect(meta.description).toBe('Spec docs');
    expect(meta.tags).toEqual(['spec']);
  });

  test('file title wins over folder-rule title (scalar file-wins)', async () => {
    const project = await bootstrapProject();
    mkdirSync(resolve(project, 'specs'), { recursive: true });
    writeFileSync(resolve(project, 'specs/foo.md'), '---\ntitle: My Foo\n---\nBody\n');

    const rules: FolderRule[] = [{ match: 'specs/**', frontmatter: { title: 'Specs' } }];
    const meta = await enrichPath('specs/foo.md', { projectDir: project, folderRules: rules });
    expect(meta.title).toBe('My Foo');
  });

  test('tags concat folder then file with dedup (file last, first-occurrence preserved)', async () => {
    const project = await bootstrapProject();
    mkdirSync(resolve(project, 'specs'), { recursive: true });
    writeFileSync(resolve(project, 'specs/foo.md'), '---\ntitle: Foo\ntags:\n  - wip\n---\nBody\n');

    const rules: FolderRule[] = [{ match: 'specs/**', frontmatter: { tags: ['spec'] } }];
    const meta = await enrichPath('specs/foo.md', { projectDir: project, folderRules: rules });
    expect(meta.tags).toEqual(['spec', 'wip']);
  });

  test('tag dedup preserves first occurrence across folder + file', async () => {
    const project = await bootstrapProject();
    mkdirSync(resolve(project, 'specs'), { recursive: true });
    writeFileSync(
      resolve(project, 'specs/foo.md'),
      '---\ntitle: Foo\ntags:\n  - spec\n  - wip\n---\nBody\n',
    );

    const rules: FolderRule[] = [{ match: 'specs/**', frontmatter: { tags: ['spec'] } }];
    const meta = await enrichPath('specs/foo.md', { projectDir: project, folderRules: rules });
    expect(meta.tags).toEqual(['spec', 'wip']);
  });

  test('folder tags:[] is a no-op — file tags unchanged (QA-007)', async () => {
    const project = await bootstrapProject();
    mkdirSync(resolve(project, 'specs'), { recursive: true });
    writeFileSync(resolve(project, 'specs/foo.md'), '---\ntitle: Foo\ntags:\n  - wip\n---\nBody\n');

    const rules: FolderRule[] = [{ match: 'specs/**', frontmatter: { tags: [] } }];
    const meta = await enrichPath('specs/foo.md', { projectDir: project, folderRules: rules });
    expect(meta.tags).toEqual(['wip']);
  });

  test('multi-rule last-match positional precedence for scalars (QA-004)', async () => {
    const project = await bootstrapProject();
    mkdirSync(resolve(project, 'specs/2026-04-16'), { recursive: true });
    writeFileSync(resolve(project, 'specs/2026-04-16/foo.md'), 'Body only\n');

    const rules: FolderRule[] = [
      { match: 'specs/**', frontmatter: { title: 'Specs' } },
      { match: 'specs/2026-*/**', frontmatter: { title: '2026 Specs' } },
    ];
    const meta = await enrichPath('specs/2026-04-16/foo.md', {
      projectDir: project,
      folderRules: rules,
    });
    expect(meta.title).toBe('2026 Specs');
  });
});

describe('enrichDirectory — folder-rule attachment', () => {
  test('no folderRules → identical shape to today (no title/description/tags)', async () => {
    const project = await bootstrapProject();
    mkdirSync(resolve(project, 'specs'), { recursive: true });
    writeFileSync(resolve(project, 'specs/foo.md'), '---\ntitle: Foo\n---\nBody\n');

    const meta = await enrichDirectory('specs', { projectDir: project });
    expect(meta.type).toBe('directory');
    expect(meta.title).toBeUndefined();
    expect(meta.description).toBeUndefined();
    expect(meta.tags).toBeUndefined();
    expect(meta.recursiveMdCount).toBe(1);
  });

  test('matching folder rule attaches title/description/tags', async () => {
    const project = await bootstrapProject();
    mkdirSync(resolve(project, 'specs'), { recursive: true });
    writeFileSync(resolve(project, 'specs/foo.md'), '---\ntitle: Foo\n---\nBody\n');

    const rules: FolderRule[] = [
      {
        match: 'specs/**',
        frontmatter: { title: 'Specs', description: 'Spec docs', tags: ['spec'] },
      },
    ];
    const meta = await enrichDirectory('specs', { projectDir: project, folderRules: rules });
    expect(meta.title).toBe('Specs');
    expect(meta.description).toBe('Spec docs');
    expect(meta.tags).toEqual(['spec']);
    expect(meta.recursiveMdCount).toBe(1);
  });

  test('no matching folder rule → DirectoryMeta returned without folder fields (QA-006)', async () => {
    const project = await bootstrapProject();
    mkdirSync(resolve(project, 'specs'), { recursive: true });
    writeFileSync(resolve(project, 'specs/foo.md'), '# Foo\n');

    const rules: FolderRule[] = [{ match: 'reports/**', frontmatter: { title: 'Reports' } }];
    const meta = await enrichDirectory('specs', { projectDir: project, folderRules: rules });
    expect(meta.title).toBeUndefined();
    expect(meta.description).toBeUndefined();
    expect(meta.tags).toBeUndefined();
  });

  test('multi-rule last-match scalar precedence + tags concat+dedup', async () => {
    const project = await bootstrapProject();
    mkdirSync(resolve(project, 'specs/2026-04-16'), { recursive: true });
    writeFileSync(resolve(project, 'specs/2026-04-16/foo.md'), '# foo\n');

    // Use two patterns that BOTH match `specs/2026-04-16` directly:
    //   - `specs/**` — globstar matches zero+ segments, so matches `specs/2026-04-16`
    //   - `specs/*` — single-segment wildcard matches `specs/2026-04-16`
    // Picomatch globstar nuance: `specs/2026-*/**` matches only DESCENDANTS
    // of `specs/2026-X/` — it does NOT match `specs/2026-04-16` itself.
    const rules: FolderRule[] = [
      { match: 'specs/**', frontmatter: { title: 'Specs', tags: ['spec'] } },
      { match: 'specs/*', frontmatter: { title: '2026 Specs', tags: ['2026'] } },
    ];
    const meta = await enrichDirectory('specs/2026-04-16', {
      projectDir: project,
      folderRules: rules,
    });
    expect(meta.title).toBe('2026 Specs');
    expect(meta.tags).toEqual(['spec', '2026']);
  });
});
