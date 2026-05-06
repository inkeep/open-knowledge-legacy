import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { commitWip, initShadowRepo, type WriterIdentity } from '@inkeep/open-knowledge-server';
import simpleGit from 'simple-git';
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
    const shadow = await initShadowRepo(project);
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
    expect(meta.historySource).toBe('shadow-repo');
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

    expect(meta.historySource).toBe('shadow-repo-absent');
    expect(meta.history).toEqual([]);
    expect(meta.backlinkCount).toBe(null);
  });
});

describe('enrichPath — nested cascade (D6: scalars replace, tags union-and-dedup)', () => {
  test('file frontmatter wins per-scalar over nested cascade; tags union with first-occurrence preserved', async () => {
    const project = await bootstrapProject();
    mkdirSync(resolve(project, 'specs/.ok'), { recursive: true });
    writeFileSync(
      resolve(project, 'specs/foo.md'),
      '---\ntitle: File\ntags:\n  - file-tag\n---\nBody\n',
    );
    writeFileSync(
      resolve(project, 'specs/.ok/frontmatter.yml'),
      'title: Nested\ndescription: Nested desc\ntags:\n  - nested-tag\n',
    );

    const meta = await enrichPath('specs/foo.md', { projectDir: project });
    expect(meta.title).toBe('File');
    expect(meta.description).toBe('Nested desc');
    expect(meta.tags).toEqual(['nested-tag', 'file-tag']);
  });

  test('root .ok/frontmatter.yml seeds the cascade for root docs', async () => {
    const project = await bootstrapProject();
    mkdirSync(resolve(project, '.ok'), { recursive: true });
    writeFileSync(resolve(project, 'top.md'), '# top\n');
    writeFileSync(resolve(project, '.ok/frontmatter.yml'), 'title: Root Default\ntags:\n  - kb\n');

    const meta = await enrichPath('top.md', { projectDir: project });
    expect(meta.title).toBe('Root Default');
    expect(meta.tags).toEqual(['kb']);
  });

  test('root cascade reaches docs in nested folders (root → leaf)', async () => {
    const project = await bootstrapProject();
    mkdirSync(resolve(project, '.ok'), { recursive: true });
    mkdirSync(resolve(project, 'specs'), { recursive: true });
    writeFileSync(resolve(project, 'specs/foo.md'), '# foo\n');
    writeFileSync(
      resolve(project, '.ok/frontmatter.yml'),
      'description: From root\ntags:\n  - kb\n',
    );

    const meta = await enrichPath('specs/foo.md', { projectDir: project });
    expect(meta.description).toBe('From root');
    expect(meta.tags).toEqual(['kb']);
  });

  test('multi-level cascade: tags from root + ancestor + leaf union with first-occurrence preserved', async () => {
    const project = await bootstrapProject();
    mkdirSync(resolve(project, '.ok'), { recursive: true });
    mkdirSync(resolve(project, 'specs/.ok'), { recursive: true });
    mkdirSync(resolve(project, 'specs/2026-04-16/.ok'), { recursive: true });
    writeFileSync(resolve(project, '.ok/frontmatter.yml'), 'tags:\n  - kb\n');
    writeFileSync(resolve(project, 'specs/.ok/frontmatter.yml'), 'tags:\n  - spec\n');
    writeFileSync(
      resolve(project, 'specs/2026-04-16/.ok/frontmatter.yml'),
      'title: 2026-04-16\ntags:\n  - april\n',
    );
    writeFileSync(resolve(project, 'specs/2026-04-16/foo.md'), '# foo\n');

    const meta = await enrichPath('specs/2026-04-16/foo.md', { projectDir: project });
    expect(meta.title).toBe('2026-04-16');
    expect(meta.tags).toEqual(['kb', 'spec', 'april']);
  });
});

describe('enrichDirectory — nested cascade attachment', () => {
  test('no nested .ok/frontmatter.yml → DirectoryMeta has no title/description/tags', async () => {
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

  test('matching nested .ok/frontmatter.yml attaches title/description/tags to the directory', async () => {
    const project = await bootstrapProject();
    mkdirSync(resolve(project, 'specs/.ok'), { recursive: true });
    writeFileSync(resolve(project, 'specs/foo.md'), '---\ntitle: Foo\n---\nBody\n');
    writeFileSync(
      resolve(project, 'specs/.ok/frontmatter.yml'),
      'title: Specs\ndescription: Spec docs\ntags:\n  - spec\n',
    );

    const meta = await enrichDirectory('specs', { projectDir: project });
    expect(meta.title).toBe('Specs');
    expect(meta.description).toBe('Spec docs');
    expect(meta.tags).toEqual(['spec']);
    expect(meta.recursiveMdCount).toBe(1);
  });

  test('cascade reaches deeper directories: tags accumulate from root + parent + own', async () => {
    const project = await bootstrapProject();
    mkdirSync(resolve(project, '.ok'), { recursive: true });
    mkdirSync(resolve(project, 'specs/.ok'), { recursive: true });
    mkdirSync(resolve(project, 'specs/2026-04-16/.ok'), { recursive: true });
    writeFileSync(resolve(project, '.ok/frontmatter.yml'), 'tags:\n  - kb\n');
    writeFileSync(resolve(project, 'specs/.ok/frontmatter.yml'), 'tags:\n  - spec\n');
    writeFileSync(resolve(project, 'specs/2026-04-16/.ok/frontmatter.yml'), 'title: 2026-04-16\n');
    writeFileSync(resolve(project, 'specs/2026-04-16/foo.md'), '# foo\n');

    const meta = await enrichDirectory('specs/2026-04-16', { projectDir: project });
    expect(meta.title).toBe('2026-04-16');
    expect(meta.tags).toEqual(['kb', 'spec']);
  });
});

describe('enrichPath/enrichDirectory — defense-in-depth path containment', () => {
  test('enrichPath rejects `../` escape from projectDir', async () => {
    const project = await bootstrapProject();
    await expect(enrichPath('../etc/passwd', { projectDir: project })).rejects.toThrow(
      /escapes the configured root/,
    );
  });

  test('enrichPath rejects absolute path outside projectDir', async () => {
    const project = await bootstrapProject();
    await expect(enrichPath('/etc/passwd', { projectDir: project })).rejects.toThrow(
      /escapes the configured root/,
    );
  });

  test('enrichDirectory rejects `../` escape from projectDir', async () => {
    const project = await bootstrapProject();
    await expect(enrichDirectory('../', { projectDir: project })).rejects.toThrow(
      /escapes the configured root/,
    );
  });

  test('enrichDirectory rejects absolute path outside projectDir', async () => {
    const project = await bootstrapProject();
    await expect(enrichDirectory('/etc', { projectDir: project })).rejects.toThrow(
      /escapes the configured root/,
    );
  });
});
