import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { commitWip, initShadowRepo, type WriterIdentity } from '@inkeep/open-knowledge-server';
import simpleGit from 'simple-git';
import { enrichPath } from './enrichment.ts';

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
