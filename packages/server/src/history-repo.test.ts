import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { parseCheckpoint } from '@inkeep/open-knowledge-core/history-repo-layout';
import simpleGit from 'simple-git';
import {
  commitUpstreamImport,
  commitWip,
  type HistoryHandle,
  historyGit,
  type InMemoryCheckpointParams,
  initHistoryRepo,
  type ParkableDoc,
  parkBranch,
  readParkedState,
  saveInMemoryCheckpoint,
  saveVersion,
  type WriterIdentity,
} from './history-repo';

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await mkdtemp(resolve(tmpdir(), 'ok-shadow-test-'));
});

afterEach(async () => {
  await rm(tmpDir, { recursive: true, force: true });
});

describe('initHistoryRepo', () => {
  test('creates shadow at .git/openknowledge/ when project .git/ exists', async () => {
    const projectRoot = resolve(tmpDir, 'project');
    mkdirSync(projectRoot, { recursive: true });

    // Init a real git repo
    const git = simpleGit(projectRoot);
    await git.init();
    await git.raw('config', 'user.name', 'Test');
    await git.raw('config', 'user.email', 'test@test.com');

    const shadow = await initHistoryRepo(projectRoot);

    expect(shadow.gitDir).toBe(resolve(projectRoot, '.git/openknowledge'));
    expect(shadow.workTree).toBe(projectRoot);
    expect(existsSync(resolve(shadow.gitDir, 'HEAD'))).toBe(true);

    // Verify config
    const sg = simpleGit().env({ GIT_DIR: shadow.gitDir });
    const worktree = (await sg.raw('config', 'core.worktree')).trim();
    expect(worktree).toBe(projectRoot);

    const userName = (await sg.raw('config', 'user.name')).trim();
    expect(userName).toBe('openknowledge');
  });

  test('does not modify .gitignore in integrated mode', async () => {
    const projectRoot = resolve(tmpDir, 'project');
    mkdirSync(projectRoot, { recursive: true });

    const git = simpleGit(projectRoot);
    await git.init();
    await git.raw('config', 'user.name', 'Test');
    await git.raw('config', 'user.email', 'test@test.com');

    await initHistoryRepo(projectRoot);

    expect(existsSync(resolve(projectRoot, '.gitignore'))).toBe(false);
  });

  test('creates shadow at .openknowledge/ when no project .git/ exists (standalone)', async () => {
    const projectRoot = resolve(tmpDir, 'standalone');
    mkdirSync(projectRoot, { recursive: true });

    const shadow = await initHistoryRepo(projectRoot);

    expect(shadow.gitDir).toBe(resolve(projectRoot, '.openknowledge'));
    expect(existsSync(resolve(shadow.gitDir, 'HEAD'))).toBe(true);

    // Verify .gitignore was created with .openknowledge/
    const gitignore = readFileSync(resolve(projectRoot, '.gitignore'), 'utf-8');
    expect(gitignore).toContain('.openknowledge/');
  });

  test('is idempotent — second call does not error', async () => {
    const projectRoot = resolve(tmpDir, 'project');
    mkdirSync(projectRoot, { recursive: true });

    const git = simpleGit(projectRoot);
    await git.init();
    await git.raw('config', 'user.name', 'Test');
    await git.raw('config', 'user.email', 'test@test.com');

    const shadow1 = await initHistoryRepo(projectRoot);
    const shadow2 = await initHistoryRepo(projectRoot);

    expect(shadow1.gitDir).toBe(shadow2.gitDir);
    expect(existsSync(resolve(shadow2.gitDir, 'HEAD'))).toBe(true);
  });
});

describe('commitWip', () => {
  let projectRoot: string;
  let shadow: HistoryHandle;
  let contentDir: string;

  const writer: WriterIdentity = {
    id: 'human-nick',
    name: 'Nick Gomez',
    email: 'nick@example.com',
  };

  beforeEach(async () => {
    projectRoot = resolve(tmpDir, 'project');
    mkdirSync(projectRoot, { recursive: true });
    contentDir = resolve(projectRoot, 'content/docs');
    mkdirSync(contentDir, { recursive: true });

    const git = simpleGit(projectRoot);
    await git.init();
    await git.raw('config', 'user.name', 'Test');
    await git.raw('config', 'user.email', 'test@test.com');

    shadow = await initHistoryRepo(projectRoot);
  });

  test('creates commit on refs/wip/<branch>/<writer-id>', async () => {
    writeFileSync(resolve(contentDir, 'intro.md'), '# Hello\n');

    const sha = await commitWip(shadow, writer, 'content/docs', 'WIP: intro');

    expect(sha).toHaveLength(40);

    // Verify ref exists (default branch = 'main')
    const sg = historyGit(shadow);
    const refSha = (await sg.raw('rev-parse', `refs/wip/main/${writer.id}`)).trim();
    expect(refSha).toBe(sha);

    // Verify commit message
    const msg = (await sg.raw('log', '-1', '--format=%s', sha)).trim();
    expect(msg).toBe('WIP: intro');
  });

  test('commit is authored by the writer', async () => {
    writeFileSync(resolve(contentDir, 'intro.md'), '# Hello\n');

    const sha = await commitWip(shadow, writer, 'content/docs', 'WIP: check author');

    const sg = historyGit(shadow);
    const authorName = (await sg.raw('log', '-1', '--format=%an', sha)).trim();
    const authorEmail = (await sg.raw('log', '-1', '--format=%ae', sha)).trim();
    expect(authorName).toBe(writer.name);
    expect(authorEmail).toBe(writer.email);

    // Committer is always openknowledge
    const committerName = (await sg.raw('log', '-1', '--format=%cn', sha)).trim();
    expect(committerName).toBe('openknowledge');
  });

  test('second commit parents the first', async () => {
    writeFileSync(resolve(contentDir, 'intro.md'), '# Hello\n');
    const sha1 = await commitWip(shadow, writer, 'content/docs', 'WIP: first');

    writeFileSync(resolve(contentDir, 'intro.md'), '# Hello World\n');
    const sha2 = await commitWip(shadow, writer, 'content/docs', 'WIP: second');

    expect(sha2).not.toBe(sha1);

    const sg = historyGit(shadow);
    const parent = (await sg.raw('log', '-1', '--format=%P', sha2)).trim();
    expect(parent).toBe(sha1);
  });

  test('different writers get independent refs', async () => {
    const agent: WriterIdentity = {
      id: 'agent-cursor',
      name: 'cursor-agent',
      email: 'cursor@openknowledge.local',
    };

    writeFileSync(resolve(contentDir, 'intro.md'), '# Hello from human\n');
    const humanSha = await commitWip(shadow, writer, 'content/docs', 'WIP: human edit');

    writeFileSync(resolve(contentDir, 'guide.md'), '# Agent guide\n');
    const agentSha = await commitWip(shadow, agent, 'content/docs', 'WIP: agent edit');

    const sg = historyGit(shadow);
    const humanRef = (await sg.raw('rev-parse', 'refs/wip/main/human-nick')).trim();
    const agentRef = (await sg.raw('rev-parse', 'refs/wip/main/agent-cursor')).trim();

    expect(humanRef).toBe(humanSha);
    expect(agentRef).toBe(agentSha);
  });

  test('branch-scoped WIP refs are isolated', async () => {
    writeFileSync(resolve(contentDir, 'intro.md'), '# Main content\n');
    const mainSha = await commitWip(shadow, writer, 'content/docs', 'WIP: main edit', 'main');

    writeFileSync(resolve(contentDir, 'intro.md'), '# Feature content\n');
    const featureSha = await commitWip(
      shadow,
      writer,
      'content/docs',
      'WIP: feature edit',
      'feature/xyz',
    );

    const sg = historyGit(shadow);
    const mainRef = (await sg.raw('rev-parse', 'refs/wip/main/human-nick')).trim();
    const featureRef = (await sg.raw('rev-parse', 'refs/wip/feature/xyz/human-nick')).trim();

    expect(mainRef).toBe(mainSha);
    expect(featureRef).toBe(featureSha);
    expect(mainRef).not.toBe(featureRef);
  });
});

describe('commitUpstreamImport', () => {
  let projectRoot: string;
  let shadow: HistoryHandle;
  let contentDir: string;

  beforeEach(async () => {
    projectRoot = resolve(tmpDir, 'project');
    mkdirSync(projectRoot, { recursive: true });
    contentDir = resolve(projectRoot, 'content/docs');
    mkdirSync(contentDir, { recursive: true });

    const git = simpleGit(projectRoot);
    await git.init();
    await git.raw('config', 'user.name', 'Test');
    await git.raw('config', 'user.email', 'test@test.com');

    shadow = await initHistoryRepo(projectRoot);
  });

  test('creates commit on refs/wip/<branch>/upstream', async () => {
    writeFileSync(resolve(contentDir, 'api.md'), '# API Reference\n');

    const sha = await commitUpstreamImport(shadow, 'content/docs', 'aabbccdd', '11223344');

    expect(sha).toHaveLength(40);

    // Default branch = 'main'
    const sg = historyGit(shadow);
    const refSha = (await sg.raw('rev-parse', 'refs/wip/main/upstream')).trim();
    expect(refSha).toBe(sha);
  });

  test('commit message includes old..new head range', async () => {
    writeFileSync(resolve(contentDir, 'api.md'), '# API\n');

    const sha = await commitUpstreamImport(
      shadow,
      'content/docs',
      'aabbccddeeff0011',
      '1122334455667788',
    );

    const sg = historyGit(shadow);
    const msg = (await sg.raw('log', '-1', '--format=%s', sha)).trim();
    expect(msg).toBe('upstream: import from aabbccdd..11223344');
  });

  test('commit message handles null oldHead (initial import)', async () => {
    writeFileSync(resolve(contentDir, 'api.md'), '# API\n');

    const sha = await commitUpstreamImport(shadow, 'content/docs', null, '1122334455667788');

    const sg = historyGit(shadow);
    const msg = (await sg.raw('log', '-1', '--format=%s', sha)).trim();
    expect(msg).toBe('upstream: initial import at 11223344');
  });

  test('upstream commit is authored by upstream writer', async () => {
    writeFileSync(resolve(contentDir, 'api.md'), '# API\n');

    const sha = await commitUpstreamImport(shadow, 'content/docs', null, 'deadbeef');

    const sg = historyGit(shadow);
    const authorName = (await sg.raw('log', '-1', '--format=%an', sha)).trim();
    expect(authorName).toBe('upstream');
  });
});

describe('parkBranch', () => {
  let projectRoot: string;
  let shadow: HistoryHandle;

  beforeEach(async () => {
    projectRoot = resolve(tmpDir, 'project');
    mkdirSync(projectRoot, { recursive: true });

    const git = simpleGit(projectRoot);
    await git.init();
    await git.raw('config', 'user.name', 'Test');
    await git.raw('config', 'user.email', 'test@test.com');

    shadow = await initHistoryRepo(projectRoot);
  });

  test('creates park commit with Y.Doc state and disk snapshot', async () => {
    const docs: ParkableDoc[] = [
      {
        docName: 'intro',
        markdown: '# Hello World\n\nEdited content\n',
        diskSnapshot: '# Hello\n',
      },
    ];

    const sha = await parkBranch(shadow, 'main', 'session1', docs);
    expect(sha).toHaveLength(40);
    if (!sha) throw new Error('parkBranch returned null');

    // Verify commit message starts with park:
    const sg = historyGit(shadow);
    const msg = (await sg.raw('log', '-1', '--format=%s', sha)).trim();
    expect(msg.startsWith('park:')).toBe(true);

    // Verify ref
    const refSha = (await sg.raw('rev-parse', 'refs/wip/main/human-session1')).trim();
    expect(refSha).toBe(sha);

    // Verify Y.Doc state blob
    const content = (await sg.raw('show', `${sha}:intro`)).trim();
    expect(content).toBe('# Hello World\n\nEdited content');

    // Verify disk snapshot blob
    const base = (await sg.raw('show', `${sha}:.park-base/intro`)).trim();
    expect(base).toBe('# Hello');
  });

  test('returns null for empty documents', async () => {
    const sha = await parkBranch(shadow, 'main', 'session1', []);
    expect(sha).toBeNull();
  });

  test('readParkedState retrieves parked content', async () => {
    const docs: ParkableDoc[] = [
      { docName: 'guide', markdown: '# Guide v2\n', diskSnapshot: '# Guide v1\n' },
    ];
    await parkBranch(shadow, 'feature', 'sess1', docs);

    const state = await readParkedState(shadow, 'feature', 'sess1', 'guide');
    expect(state).not.toBeNull();
    expect(state?.markdown).toBe('# Guide v2');
    expect(state?.diskSnapshot).toBe('# Guide v1');
  });

  test('readParkedState returns null when no park exists', async () => {
    const state = await readParkedState(shadow, 'main', 'none', 'intro');
    expect(state).toBeNull();
  });

  test('parks multiple documents', async () => {
    const docs: ParkableDoc[] = [
      { docName: 'intro', markdown: '# Intro\n', diskSnapshot: '# Intro old\n' },
      { docName: 'guide', markdown: '# Guide\n', diskSnapshot: '# Guide old\n' },
    ];

    const sha = await parkBranch(shadow, 'main', 'sess1', docs);
    expect(sha).toHaveLength(40);

    const sg = historyGit(shadow);
    const introContent = (await sg.raw('show', `${sha}:intro`)).trim();
    const guideContent = (await sg.raw('show', `${sha}:guide`)).trim();
    expect(introContent).toBe('# Intro');
    expect(guideContent).toBe('# Guide');
  });
});

describe('saveVersion', () => {
  let projectRoot: string;
  let shadow: HistoryHandle;
  let contentDir: string;

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

  beforeEach(async () => {
    projectRoot = resolve(tmpDir, 'project');
    mkdirSync(projectRoot, { recursive: true });
    contentDir = resolve(projectRoot, 'content/docs');
    mkdirSync(contentDir, { recursive: true });

    const git = simpleGit(projectRoot);
    await git.init();
    await git.raw('config', 'user.name', 'Test');
    await git.raw('config', 'user.email', 'test@test.com');

    // Initial commit so HEAD exists
    writeFileSync(resolve(contentDir, 'intro.md'), '# Hello\n');
    await git.add('.');
    await git.commit('Initial commit');

    shadow = await initHistoryRepo(projectRoot);
  });

  test('creates checkpoint ref in shadow', async () => {
    writeFileSync(resolve(contentDir, 'intro.md'), '# Checkpoint\n');
    const result = await saveVersion(shadow, 'content/docs', [human]);

    const sg = historyGit(shadow);
    const checkpointSha = (await sg.raw('rev-parse', result.checkpointRef)).trim();
    expect(checkpointSha).toHaveLength(40);
    expect(result.checkpointRef).toBe(`refs/checkpoints/main/${checkpointSha}`);

    // Checkpoint tree contains the content
    const tree = (await sg.raw('ls-tree', '-r', '--name-only', result.checkpointRef)).trim();
    expect(tree).toContain('content/docs/intro.md');
  });

  test('resets WIP refs after save', async () => {
    writeFileSync(resolve(contentDir, 'intro.md'), '# WIP content\n');
    await commitWip(shadow, human, 'content/docs', 'WIP: edit');

    // Verify WIP ref exists
    const sg = historyGit(shadow);
    const wipBefore = (await sg.raw('rev-parse', 'refs/wip/main/human-nick')).trim();
    expect(wipBefore).toHaveLength(40);

    await saveVersion(shadow, 'content/docs', [human]);

    // WIP ref should be deleted (branch-scoped)
    let wipExists = true;
    try {
      await sg.raw('rev-parse', 'refs/wip/main/human-nick');
    } catch {
      wipExists = false;
    }
    expect(wipExists).toBe(false);
  });

  test('multi-parent checkpoint preserves all writer chains', async () => {
    // Both writers make WIP commits
    writeFileSync(resolve(contentDir, 'intro.md'), '# Human edit\n');
    const humanWipSha = await commitWip(shadow, human, 'content/docs', 'WIP: human edit');

    writeFileSync(resolve(contentDir, 'intro.md'), '# Agent edit\n');
    const agentWipSha = await commitWip(shadow, agent, 'content/docs', 'WIP: agent edit');

    const result = await saveVersion(shadow, 'content/docs', [human, agent]);

    const sg = historyGit(shadow);

    // Checkpoint commit should list both WIP SHAs as parents
    const parentLine = (await sg.raw('log', '-1', '--format=%P', result.checkpointRef)).trim();
    const parents = parentLine.split(' ').filter(Boolean);
    expect(parents).toContain(humanWipSha);
    expect(parents).toContain(agentWipSha);
    expect(parents.length).toBe(2);

    // --full-history from the checkpoint reaches both writer commits
    const authorEmails = (
      await sg.raw(
        'log',
        '--full-history',
        '--author-date-order',
        '--format=%ae',
        result.checkpointRef,
      )
    )
      .trim()
      .split('\n')
      .filter(Boolean);

    expect(authorEmails).toContain(human.email);
    expect(authorEmails).toContain(agent.email);
  });

  test('checkpoint falls back to latest checkpoint when no WIP activity', async () => {
    // First save version (creates first checkpoint)
    writeFileSync(resolve(contentDir, 'intro.md'), '# v1\n');
    await commitWip(shadow, human, 'content/docs', 'WIP: v1');
    const result1 = await saveVersion(shadow, 'content/docs', [human]);

    const sg = historyGit(shadow);
    const checkpoint1Sha = (await sg.raw('rev-parse', result1.checkpointRef)).trim();

    // Second save version with NO WIP activity since last checkpoint
    writeFileSync(resolve(contentDir, 'intro.md'), '# v2 (direct write, no WIP commit)\n');
    const result2 = await saveVersion(shadow, 'content/docs', [human]);

    // The second checkpoint should parent on the first checkpoint commit
    const parentLine = (await sg.raw('log', '-1', '--format=%P', result2.checkpointRef)).trim();
    const parents = parentLine.split(' ').filter(Boolean);
    expect(parents).toContain(checkpoint1Sha);
  });
});

describe('saveVersion — standalone mode', () => {
  let standaloneRoot: string;
  let shadow: HistoryHandle;
  let contentDir: string;

  const human: WriterIdentity = {
    id: 'human-nick',
    name: 'Nick Gomez',
    email: 'nick@example.com',
  };

  beforeEach(async () => {
    // Standalone: no project .git/ repo
    standaloneRoot = resolve(tmpDir, 'standalone');
    contentDir = resolve(standaloneRoot, 'content/docs');
    mkdirSync(contentDir, { recursive: true });

    shadow = await initHistoryRepo(standaloneRoot);
  });

  test('creates shadow checkpoint', async () => {
    writeFileSync(resolve(contentDir, 'intro.md'), '# Standalone\n');
    await commitWip(shadow, human, 'content/docs', 'WIP: standalone edit');

    const result = await saveVersion(shadow, 'content/docs', [human]);

    // Shadow checkpoint ref exists and is valid
    const sg = historyGit(shadow);
    const checkpointSha = (await sg.raw('rev-parse', result.checkpointRef)).trim();
    expect(checkpointSha).toHaveLength(40);

    expect(result.checkpointRef).toContain(checkpointSha);
    expect(result.checkpointRef).toMatch(/^refs\/checkpoints\/main\//);

    // Checkpoint tree contains the content
    const tree = (await sg.raw('ls-tree', '-r', '--name-only', result.checkpointRef)).trim();
    expect(tree).toContain('content/docs/intro.md');
  });

  test('WIP refs are reset after Save Version', async () => {
    writeFileSync(resolve(contentDir, 'intro.md'), '# v1\n');
    await commitWip(shadow, human, 'content/docs', 'WIP: edit');

    await saveVersion(shadow, 'content/docs', [human]);

    const sg = historyGit(shadow);
    let wipExists = true;
    try {
      await sg.raw('rev-parse', 'refs/wip/main/human-nick');
    } catch {
      wipExists = false;
    }
    expect(wipExists).toBe(false);
  });

  test('checkpoint ref is named after shadow commit SHA', async () => {
    writeFileSync(resolve(contentDir, 'intro.md'), '# Standalone ref naming\n');
    await commitWip(shadow, human, 'content/docs', 'WIP: ref naming test');

    const result = await saveVersion(shadow, 'content/docs', [human]);

    const sg = historyGit(shadow);
    const actualSha = (await sg.raw('rev-parse', result.checkpointRef)).trim();

    // The ref name must end with the shadow commit's own SHA
    expect(result.checkpointRef).toBe(`refs/checkpoints/main/${actualSha}`);
  });
});

describe('saveInMemoryCheckpoint (bridge-correctness SPEC §6 R7a)', () => {
  let projectRoot: string;
  let shadow: HistoryHandle;

  beforeEach(async () => {
    projectRoot = resolve(tmpDir, 'project');
    mkdirSync(projectRoot, { recursive: true });
    mkdirSync(resolve(projectRoot, 'content/docs'), { recursive: true });
    const git = simpleGit(projectRoot);
    await git.init();
    await git.raw('config', 'user.name', 'Test');
    await git.raw('config', 'user.email', 'test@test.com');
    shadow = await initHistoryRepo(projectRoot);
  });

  test('round-trips a bridge-merge-loss checkpoint — ref exists, parseCheckpoint recovers metadata', async () => {
    const params: InMemoryCheckpointParams = {
      kind: 'bridge-merge-loss',
      docName: 'intro.md',
      contents: '# Pre-merge baseline\n',
      label: 'Before concurrent merge @ 2026-04-17T08:00:00Z',
      branch: 'main',
      metadata: { lostSubstrings: ['user keystroke', 'another lost phrase'] },
    };

    const sha = await saveInMemoryCheckpoint(shadow, 'content/docs', params);

    // Ref was created and points at the returned sha
    const sg = historyGit(shadow);
    const refSha = (await sg.raw('rev-parse', `refs/checkpoints/main/${sha}`)).trim();
    expect(refSha).toBe(sha);

    // Commit body contains the label + ok-checkpoint-v1 line
    const body = (await sg.raw('log', '-1', '--format=%B', sha)).trim();
    expect(body).toContain('checkpoint: Before concurrent merge @ 2026-04-17T08:00:00Z');
    const parsed = parseCheckpoint(body);
    expect(parsed).not.toBeNull();
    if (parsed?.kind !== 'bridge-merge-loss') throw new Error('expected bridge-merge-loss kind');
    expect(parsed.metadata.lostSubstrings).toEqual(['user keystroke', 'another lost phrase']);

    // Contents blob is stored at content/docs/intro.md
    const tree = (await sg.raw('ls-tree', '-r', sha)).trim();
    expect(tree).toContain('content/docs/intro.md');

    // bridge-correctness review iteration 5: docName + size are inlined in
    // the metadata so the rescue read path doesn't need ls-tree per commit.
    if (parsed.kind !== 'bridge-merge-loss') throw new Error('narrow');
    expect(parsed.docName).toBe('intro.md');
    expect(parsed.size).toBe(Buffer.byteLength('# Pre-merge baseline\n', 'utf-8'));
  });

  test('round-trips an external-change-rescue checkpoint', async () => {
    const params: InMemoryCheckpointParams = {
      kind: 'external-change-rescue',
      docName: 'intro.md',
      contents: '# Rescued in-memory content\n',
      label: 'External change recovered @ 2026-04-17T08:00:00Z',
      metadata: { incomingDiskSha: 'abc123def456' },
    };

    const sha = await saveInMemoryCheckpoint(shadow, 'content/docs', params);
    const sg = historyGit(shadow);
    const body = (await sg.raw('log', '-1', '--format=%B', sha)).trim();
    const parsed = parseCheckpoint(body);
    expect(parsed).not.toBeNull();
    if (parsed?.kind !== 'external-change-rescue') {
      throw new Error('expected external-change-rescue kind');
    }
    expect(parsed.metadata.incomingDiskSha).toBe('abc123def456');
  });

  test('does NOT touch refs/wip/* — distinct from saveVersion', async () => {
    // Create a WIP ref first via commitWip
    const writer: WriterIdentity = {
      id: 'human-nick',
      name: 'Nick',
      email: 'n@example.com',
    };
    const contentDir = resolve(projectRoot, 'content/docs');
    writeFileSync(resolve(contentDir, 'intro.md'), '# hello\n');
    await commitWip(shadow, writer, 'content/docs', 'WIP: setup');

    const sg = historyGit(shadow);
    const wipShaBefore = (await sg.raw('rev-parse', 'refs/wip/main/human-nick')).trim();

    await saveInMemoryCheckpoint(shadow, 'content/docs', {
      kind: 'bridge-merge-loss',
      docName: 'intro.md',
      contents: '# pre-merge\n',
      label: 'silent checkpoint',
      metadata: { lostSubstrings: ['foo'] },
    });

    const wipShaAfter = (await sg.raw('rev-parse', 'refs/wip/main/human-nick')).trim();
    expect(wipShaAfter).toBe(wipShaBefore); // unchanged
  });

  test('concurrent invocations on the same shadow produce distinct refs (Q8)', async () => {
    const params = (n: number): InMemoryCheckpointParams => ({
      kind: 'bridge-merge-loss',
      docName: `doc-${n}.md`,
      contents: `# contents ${n}\n`,
      label: `concurrent ${n}`,
      metadata: { lostSubstrings: [`lost-${n}`] },
    });

    const results = await Promise.all(
      [1, 2, 3, 4, 5].map((n) => saveInMemoryCheckpoint(shadow, 'content/docs', params(n))),
    );
    const unique = new Set(results);
    expect(unique.size).toBe(5);

    const sg = historyGit(shadow);
    for (const sha of results) {
      const refSha = (await sg.raw('rev-parse', `refs/checkpoints/main/${sha}`)).trim();
      expect(refSha).toBe(sha);
    }
  });

  test('parseContributors tolerates sibling ok-checkpoint-v1 body lines (Q7)', async () => {
    // Synthesize a body with BOTH ok-contributors: and ok-checkpoint-v1: lines
    const body = [
      'checkpoint: Before concurrent merge @ t',
      '',
      'ok-contributors: {"id":"human-a","name":"Alice","docs":["intro.md"]}',
      'ok-checkpoint-v1: {"kind":"bridge-merge-loss","docName":"intro.md","size":16,"metadata":{"lostSubstrings":["x"]}}',
    ].join('\n');

    // parseContributors must still pick up Alice
    const { parseContributors } = await import('@inkeep/open-knowledge-core/history-repo-layout');
    const contributors = parseContributors(body);
    expect(contributors).toHaveLength(1);
    expect(contributors[0]?.id).toBe('human-a');

    // parseCheckpoint picks up the sibling line
    const checkpoint = parseCheckpoint(body);
    expect(checkpoint?.kind).toBe('bridge-merge-loss');
  });
});

describe('gcCheckpointRefs (bridge-correctness SPEC §6 R7 + review iteration 5)', () => {
  let projectRoot: string;
  let shadow: HistoryHandle;

  beforeEach(async () => {
    projectRoot = resolve(tmpDir, 'gc-project');
    mkdirSync(projectRoot, { recursive: true });
    mkdirSync(resolve(projectRoot, 'content/docs'), { recursive: true });
    const git = simpleGit(projectRoot);
    await git.init();
    await git.raw('config', 'user.name', 'Test');
    await git.raw('config', 'user.email', 'test@test.com');
    shadow = await initHistoryRepo(projectRoot);
  });

  test('keeps only the most-recent N bridge-merge-loss refs per branch', async () => {
    const { gcCheckpointRefs } = await import('./history-repo.ts');
    for (let i = 0; i < 7; i++) {
      await saveInMemoryCheckpoint(shadow, 'content/docs', {
        kind: 'bridge-merge-loss',
        docName: `doc-${i}.md`,
        contents: `contents ${i}\n`,
        label: `loss ${i}`,
        metadata: { lostSubstrings: [`lost-${i}`] },
      });
    }

    const result = await gcCheckpointRefs(shadow, 'main', {
      maxBridgeMergeLoss: 3,
      maxExternalChangeRescue: 50,
      ttlMs: 0, // disable TTL; only count-based cap applies
    });

    expect(result.scanned).toBe(7);
    expect(result.deletedBridgeMergeLoss).toBe(4); // 7 - 3 kept
    expect(result.deletedExternalChangeRescue).toBe(0);

    const sg = historyGit(shadow);
    const remaining = (
      await sg.raw('for-each-ref', '--format=%(refname)', 'refs/checkpoints/main/')
    )
      .trim()
      .split('\n')
      .filter(Boolean);
    expect(remaining).toHaveLength(3);
  });

  test('applies TTL independently of the count cap', async () => {
    // Write 2 checkpoints with a TTL of 0 ms to force both past the deadline.
    for (let i = 0; i < 2; i++) {
      await saveInMemoryCheckpoint(shadow, 'content/docs', {
        kind: 'external-change-rescue',
        docName: `doc-${i}.md`,
        contents: `contents ${i}\n`,
        label: `rescue ${i}`,
        metadata: { incomingDiskSha: `sha-${i}` },
      });
    }
    // Sleep 5ms so the TTL check actually triggers.
    await new Promise((r) => setTimeout(r, 5));

    const { gcCheckpointRefs } = await import('./history-repo.ts');
    const result = await gcCheckpointRefs(shadow, 'main', {
      maxBridgeMergeLoss: 50,
      maxExternalChangeRescue: 50,
      ttlMs: 1, // everything older than 1 ms is eligible
    });

    expect(result.deletedExternalChangeRescue).toBe(2);
  });

  test('does NOT delete untyped Save-Version-style checkpoints', async () => {
    const { gcCheckpointRefs } = await import('./history-repo.ts');
    const sg = historyGit(shadow);

    // Create an untyped Save-Version-style checkpoint: a commit under
    // `refs/checkpoints/main/<sha>` whose body has NO `ok-checkpoint-v1:`
    // line. `parseCheckpoint` returns null for it, and `gcCheckpointRefs`
    // treats null-kind as permanently retained.
    //
    // Shortest path: pipe an empty tree into the well-known empty-tree SHA
    // via `git hash-object -t tree /dev/null`, then commit-tree.
    const emptyTreeSha = (await sg.raw('hash-object', '-t', 'tree', '-w', '/dev/null')).trim();
    const untypedSha = (
      await sg
        .env({
          GIT_DIR: shadow.gitDir,
          GIT_AUTHOR_NAME: 'test',
          GIT_AUTHOR_EMAIL: 'test@test',
          GIT_COMMITTER_NAME: 'test',
          GIT_COMMITTER_EMAIL: 'test@test',
        })
        .raw('commit-tree', emptyTreeSha, '-m', 'checkpoint: Save Version')
    ).trim();
    await sg.raw('update-ref', `refs/checkpoints/main/${untypedSha}`, untypedSha);

    // Plus one typed bridge-merge-loss that IS eligible.
    await saveInMemoryCheckpoint(shadow, 'content/docs', {
      kind: 'bridge-merge-loss',
      docName: 'intro.md',
      contents: '# pre-merge\n',
      label: 'silent',
      metadata: { lostSubstrings: ['x'] },
    });

    const result = await gcCheckpointRefs(shadow, 'main', {
      maxBridgeMergeLoss: 0, // forces deletion of the typed checkpoint
      maxExternalChangeRescue: 0,
      ttlMs: 0,
    });

    expect(result.deletedBridgeMergeLoss).toBe(1);

    // Save-Version checkpoint still exists.
    const refs = (await sg.raw('for-each-ref', '--format=%(refname)', 'refs/checkpoints/main/'))
      .trim()
      .split('\n')
      .filter(Boolean);
    expect(refs).toContain(`refs/checkpoints/main/${untypedSha}`);
  });
});
