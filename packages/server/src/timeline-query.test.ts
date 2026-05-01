import { describe as _bunDescribe, afterEach, beforeEach, expect, test } from 'bun:test';

const describe = process.env.CI ? _bunDescribe.skip : _bunDescribe;

import { mkdirSync, writeFileSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import simpleGit from 'simple-git';
import {
  commitUpstreamImport,
  commitWip,
  initShadowRepo,
  type ParkableDoc,
  parkBranch,
  SERVICE_WRITER,
  saveVersion,
  type WriterIdentity,
} from './shadow-repo';
import { getDocumentHistory } from './timeline-query';

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await mkdtemp(resolve(tmpdir(), 'ok-timeline-test-'));
});

afterEach(async () => {
  await rm(tmpDir, { recursive: true, force: true });
});

async function setup() {
  const projectRoot = resolve(tmpDir, 'project');
  const contentDir = resolve(projectRoot, 'content/docs');
  mkdirSync(contentDir, { recursive: true });

  const git = simpleGit(projectRoot);
  await git.init();
  await git.raw('config', 'user.name', 'Test');
  await git.raw('config', 'user.email', 'test@test.com');

  writeFileSync(resolve(contentDir, 'intro.md'), '# Hello\n');
  await git.add('.');
  await git.commit('Initial commit');

  const shadow = await initShadowRepo(projectRoot);
  return { projectRoot, contentDir, shadow };
}

const human: WriterIdentity = {
  id: 'human-nick',
  name: 'Nick Gomez',
  email: 'nick@example.com',
};

const agent: WriterIdentity = {
  id: 'agent-cursor',
  name: 'cursor-agent',
  email: 'cursor@openknowledge.local',
};

describe('getDocumentHistory', () => {
  test('returns empty result when shadow has no commits', async () => {
    const { shadow } = await setup();
    const result = await getDocumentHistory(shadow, { docName: 'intro' }, 'content/docs');
    expect(result.entries).toHaveLength(0);
    expect(result.total).toBe(0);
    expect(result.hasMore).toBe(false);
  });

  test('returns WIP entries as flat list when no checkpoints exist', async () => {
    const { contentDir, shadow } = await setup();

    writeFileSync(resolve(contentDir, 'intro.md'), '# Edit 1\n');
    await commitWip(shadow, human, 'content/docs', 'WIP: first human edit');

    writeFileSync(resolve(contentDir, 'intro.md'), '# Edit 2\n');
    await commitWip(shadow, human, 'content/docs', 'WIP: second human edit');

    const result = await getDocumentHistory(shadow, { docName: 'intro' }, 'content/docs');

    expect(result.entries.length).toBe(2);
    expect(result.total).toBe(2);
    expect(result.hasMore).toBe(false);
    expect(result.entries.every((e) => e.type === 'wip')).toBe(true);
  });

  test('classifies entry types from commit message prefix', async () => {
    const { contentDir, shadow } = await setup();

    writeFileSync(resolve(contentDir, 'intro.md'), '# WIP\n');
    await commitWip(shadow, human, 'content/docs', 'WIP: human edit');

    writeFileSync(resolve(contentDir, 'intro.md'), '# Upstream\n');
    await commitUpstreamImport(shadow, 'content/docs', 'abc', 'def');

    writeFileSync(resolve(contentDir, 'intro.md'), '# Checkpoint\n');
    await saveVersion(shadow, 'content/docs', [human]);

    const result = await getDocumentHistory(shadow, { docName: 'intro' }, 'content/docs');

    const types = result.entries.map((e) => e.type);
    expect(types).toContain('wip');
    expect(types).toContain('upstream');
    expect(types).toContain('checkpoint');
  });

  test('interleaves entries from multiple writers by author date', async () => {
    const { contentDir, shadow } = await setup();

    writeFileSync(resolve(contentDir, 'intro.md'), '# Human 1\n');
    await commitWip(shadow, human, 'content/docs', 'WIP: human edit 1');

    writeFileSync(resolve(contentDir, 'intro.md'), '# Agent 1\n');
    await commitWip(shadow, agent, 'content/docs', 'WIP: agent edit 1');

    writeFileSync(resolve(contentDir, 'intro.md'), '# Human 2\n');
    await commitWip(shadow, human, 'content/docs', 'WIP: human edit 2');

    const result = await getDocumentHistory(shadow, { docName: 'intro' }, 'content/docs');

    expect(result.entries.length).toBe(3);
    const authorEmails = result.entries.map((e) => e.authorEmail);
    expect(authorEmails).toContain(human.email);
    expect(authorEmails).toContain(agent.email);
  });

  test('type=checkpoint fast path returns only checkpoints', async () => {
    const { contentDir, shadow } = await setup();

    writeFileSync(resolve(contentDir, 'intro.md'), '# v1\n');
    await commitWip(shadow, human, 'content/docs', 'WIP: v1');
    await saveVersion(shadow, 'content/docs', [human]);

    writeFileSync(resolve(contentDir, 'intro.md'), '# v2\n');
    await commitWip(shadow, human, 'content/docs', 'WIP: v2');

    const result = await getDocumentHistory(
      shadow,
      { docName: 'intro', type: 'checkpoint' },
      'content/docs',
    );

    expect(result.entries.length).toBe(1);
    expect(result.entries[0]?.type).toBe('checkpoint');
  });

  test('supports filtering by author name/email', async () => {
    const { contentDir, shadow } = await setup();

    writeFileSync(resolve(contentDir, 'intro.md'), '# Human\n');
    await commitWip(shadow, human, 'content/docs', 'WIP: human');

    writeFileSync(resolve(contentDir, 'intro.md'), '# Agent\n');
    await commitWip(shadow, agent, 'content/docs', 'WIP: agent');

    const result = await getDocumentHistory(
      shadow,
      {
        docName: 'intro',
        author: human.email,
      },
      'content/docs',
    );

    expect(result.entries.every((e) => e.authorEmail === human.email)).toBe(true);
    expect(result.entries.length).toBeGreaterThanOrEqual(1);
  });

  test('supports excludeAuthor filter', async () => {
    const { contentDir, shadow } = await setup();

    writeFileSync(resolve(contentDir, 'intro.md'), '# Human\n');
    await commitWip(shadow, human, 'content/docs', 'WIP: human');

    writeFileSync(resolve(contentDir, 'intro.md'), '# Agent\n');
    await commitWip(shadow, agent, 'content/docs', 'WIP: agent');

    const result = await getDocumentHistory(
      shadow,
      {
        docName: 'intro',
        excludeAuthor: agent.email,
      },
      'content/docs',
    );

    expect(result.entries.every((e) => e.authorEmail !== agent.email)).toBe(true);
  });

  test('supports limit/offset pagination', async () => {
    const { contentDir, shadow } = await setup();

    for (let i = 1; i <= 5; i++) {
      writeFileSync(resolve(contentDir, 'intro.md'), `# Edit ${i}\n`);
      await commitWip(shadow, human, 'content/docs', `WIP: edit ${i}`);
    }

    const page1 = await getDocumentHistory(
      shadow,
      { docName: 'intro', limit: 2, offset: 0 },
      'content/docs',
    );
    expect(page1.entries.length).toBe(2);
    expect(page1.total).toBe(5);
    expect(page1.hasMore).toBe(true);

    const page2 = await getDocumentHistory(
      shadow,
      { docName: 'intro', limit: 2, offset: 2 },
      'content/docs',
    );
    expect(page2.entries.length).toBe(2);
    expect(page2.hasMore).toBe(true);

    const page3 = await getDocumentHistory(
      shadow,
      { docName: 'intro', limit: 2, offset: 4 },
      'content/docs',
    );
    expect(page3.entries.length).toBe(1);
    expect(page3.hasMore).toBe(false);
  });

  test('entries have all required fields', async () => {
    const { contentDir, shadow } = await setup();

    writeFileSync(resolve(contentDir, 'intro.md'), '# Test\n');
    await commitWip(shadow, human, 'content/docs', 'WIP: field check');

    const result = await getDocumentHistory(shadow, { docName: 'intro' }, 'content/docs');
    const entry = result.entries[0];

    expect(entry).toBeDefined();
    expect(entry?.sha).toHaveLength(40);
    expect(entry?.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(entry?.author).toBe(human.name);
    expect(entry?.authorEmail).toBe(human.email);
    expect(entry?.type).toBe('wip');
    expect(entry?.message).toContain('WIP');
  });

  test('returns empty result gracefully when shadow repo is corrupt/missing', async () => {
    const fakeShadow = {
      gitDir: resolve(tmpDir, 'nonexistent/.git/ok'),
      workTree: resolve(tmpDir, 'nonexistent'),
    };

    const result = await getDocumentHistory(fakeShadow, { docName: 'intro' });
    expect(result.entries).toHaveLength(0);
    expect(result.total).toBe(0);
    expect(result.hasMore).toBe(false);
  });

  test('hides park commits even when their tree-deletion shadows the doc path', async () => {
    const { contentDir, shadow } = await setup();

    writeFileSync(resolve(contentDir, 'intro.md'), '# Service edit\n');
    await commitWip(shadow, SERVICE_WRITER, 'content/docs', 'wip: service edit');

    const docs: ParkableDoc[] = [
      { docName: 'intro', markdown: '# Parked\n', diskSnapshot: '# Service edit\n' },
    ];
    const parkSha = await parkBranch(shadow, 'main', SERVICE_WRITER.id, docs, 'feature');
    expect(parkSha).toHaveLength(40);

    const result = await getDocumentHistory(shadow, { docName: 'intro' }, 'content/docs');
    expect(result.entries.some((e) => e.sha === parkSha)).toBe(false);
    expect(result.entries.every((e) => e.type !== 'park')).toBe(true);
  });

  test('deduplicates entries that appear in multiple ref walks', async () => {
    const { contentDir, shadow } = await setup();

    writeFileSync(resolve(contentDir, 'intro.md'), '# Shared\n');
    await commitWip(shadow, human, 'content/docs', 'WIP: shared ancestor');

    await saveVersion(shadow, 'content/docs', [human]);

    const result = await getDocumentHistory(shadow, { docName: 'intro' }, 'content/docs');

    const shas = result.entries.map((e) => e.sha);
    const uniqueShas = new Set(shas);
    expect(uniqueShas.size).toBe(shas.length);
  });
});
