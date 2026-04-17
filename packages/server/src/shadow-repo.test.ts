import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { parseCheckpoint } from '@inkeep/open-knowledge-core/shadow-repo-layout';
import simpleGit from 'simple-git';
import {
  commitUpstreamImport,
  commitWip,
  type InMemoryCheckpointParams,
  initShadowRepo,
  type ParkableDoc,
  parkBranch,
  readParkedState,
  type ShadowHandle,
  saveInMemoryCheckpoint,
  saveVersion,
  shadowGit,
  type WriterIdentity,
} from './shadow-repo';

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await mkdtemp(resolve(tmpdir(), 'ok-shadow-test-'));
});

afterEach(async () => {
  await rm(tmpDir, { recursive: true, force: true });
});

describe('initShadowRepo', () => {
  test('creates shadow at .git/openknowledge/ when project .git/ exists', async () => {
    const projectRoot = resolve(tmpDir, 'project');
    mkdirSync(projectRoot, { recursive: true });

    // Init a real git repo
    const git = simpleGit(projectRoot);
    await git.init();
    await git.raw('config', 'user.name', 'Test');
    await git.raw('config', 'user.email', 'test@test.com');

    const shadow = await initShadowRepo(projectRoot);

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

    await initShadowRepo(projectRoot);

    expect(existsSync(resolve(projectRoot, '.gitignore'))).toBe(false);
  });

  test('creates shadow at .openknowledge/ when no project .git/ exists (standalone)', async () => {
    const projectRoot = resolve(tmpDir, 'standalone');
    mkdirSync(projectRoot, { recursive: true });

    const shadow = await initShadowRepo(projectRoot);

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

    const shadow1 = await initShadowRepo(projectRoot);
    const shadow2 = await initShadowRepo(projectRoot);

    expect(shadow1.gitDir).toBe(shadow2.gitDir);
    expect(existsSync(resolve(shadow2.gitDir, 'HEAD'))).toBe(true);
  });
});

describe('commitWip', () => {
  let projectRoot: string;
  let shadow: ShadowHandle;
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

    shadow = await initShadowRepo(projectRoot);
  });

  test('creates commit on refs/wip/<branch>/<writer-id>', async () => {
    writeFileSync(resolve(contentDir, 'intro.md'), '# Hello\n');

    const sha = await commitWip(shadow, writer, 'content/docs', 'WIP: intro');

    expect(sha).toHaveLength(40);

    // Verify ref exists (default branch = 'main')
    const sg = shadowGit(shadow);
    const refSha = (await sg.raw('rev-parse', `refs/wip/main/${writer.id}`)).trim();
    expect(refSha).toBe(sha);

    // Verify commit message
    const msg = (await sg.raw('log', '-1', '--format=%s', sha)).trim();
    expect(msg).toBe('WIP: intro');
  });

  test('commit is authored by the writer', async () => {
    writeFileSync(resolve(contentDir, 'intro.md'), '# Hello\n');

    const sha = await commitWip(shadow, writer, 'content/docs', 'WIP: check author');

    const sg = shadowGit(shadow);
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

    const sg = shadowGit(shadow);
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

    const sg = shadowGit(shadow);
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

    const sg = shadowGit(shadow);
    const mainRef = (await sg.raw('rev-parse', 'refs/wip/main/human-nick')).trim();
    const featureRef = (await sg.raw('rev-parse', 'refs/wip/feature/xyz/human-nick')).trim();

    expect(mainRef).toBe(mainSha);
    expect(featureRef).toBe(featureSha);
    expect(mainRef).not.toBe(featureRef);
  });
});

describe('commitUpstreamImport', () => {
  let projectRoot: string;
  let shadow: ShadowHandle;
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

    shadow = await initShadowRepo(projectRoot);
  });

  test('creates commit on refs/wip/<branch>/upstream', async () => {
    writeFileSync(resolve(contentDir, 'api.md'), '# API Reference\n');

    const sha = await commitUpstreamImport(shadow, 'content/docs', 'aabbccdd', '11223344');

    expect(sha).toHaveLength(40);

    // Default branch = 'main'
    const sg = shadowGit(shadow);
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

    const sg = shadowGit(shadow);
    const msg = (await sg.raw('log', '-1', '--format=%s', sha)).trim();
    expect(msg).toBe('upstream: import from aabbccdd..11223344');
  });

  test('commit message handles null oldHead (initial import)', async () => {
    writeFileSync(resolve(contentDir, 'api.md'), '# API\n');

    const sha = await commitUpstreamImport(shadow, 'content/docs', null, '1122334455667788');

    const sg = shadowGit(shadow);
    const msg = (await sg.raw('log', '-1', '--format=%s', sha)).trim();
    expect(msg).toBe('upstream: initial import at 11223344');
  });

  test('upstream commit is authored by upstream writer', async () => {
    writeFileSync(resolve(contentDir, 'api.md'), '# API\n');

    const sha = await commitUpstreamImport(shadow, 'content/docs', null, 'deadbeef');

    const sg = shadowGit(shadow);
    const authorName = (await sg.raw('log', '-1', '--format=%an', sha)).trim();
    expect(authorName).toBe('upstream');
  });
});

describe('parkBranch', () => {
  let projectRoot: string;
  let shadow: ShadowHandle;

  beforeEach(async () => {
    projectRoot = resolve(tmpDir, 'project');
    mkdirSync(projectRoot, { recursive: true });

    const git = simpleGit(projectRoot);
    await git.init();
    await git.raw('config', 'user.name', 'Test');
    await git.raw('config', 'user.email', 'test@test.com');

    shadow = await initShadowRepo(projectRoot);
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
    const sg = shadowGit(shadow);
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

    const sg = shadowGit(shadow);
    const introContent = (await sg.raw('show', `${sha}:intro`)).trim();
    const guideContent = (await sg.raw('show', `${sha}:guide`)).trim();
    expect(introContent).toBe('# Intro');
    expect(guideContent).toBe('# Guide');
  });
});

describe('saveVersion', () => {
  let projectRoot: string;
  let shadow: ShadowHandle;
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

    shadow = await initShadowRepo(projectRoot);
  });

  test('creates checkpoint ref in shadow', async () => {
    writeFileSync(resolve(contentDir, 'intro.md'), '# Checkpoint\n');
    const result = await saveVersion(shadow, 'content/docs', [human]);

    const sg = shadowGit(shadow);
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
    const sg = shadowGit(shadow);
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

    const sg = shadowGit(shadow);

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

    const sg = shadowGit(shadow);
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
  let shadow: ShadowHandle;
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

    shadow = await initShadowRepo(standaloneRoot);
  });

  test('creates shadow checkpoint', async () => {
    writeFileSync(resolve(contentDir, 'intro.md'), '# Standalone\n');
    await commitWip(shadow, human, 'content/docs', 'WIP: standalone edit');

    const result = await saveVersion(shadow, 'content/docs', [human]);

    // Shadow checkpoint ref exists and is valid
    const sg = shadowGit(shadow);
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

    const sg = shadowGit(shadow);
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

    const sg = shadowGit(shadow);
    const actualSha = (await sg.raw('rev-parse', result.checkpointRef)).trim();

    // The ref name must end with the shadow commit's own SHA
    expect(result.checkpointRef).toBe(`refs/checkpoints/main/${actualSha}`);
  });
});

describe('saveInMemoryCheckpoint (bridge-correctness SPEC §6 R7a)', () => {
  let projectRoot: string;
  let shadow: ShadowHandle;

  beforeEach(async () => {
    projectRoot = resolve(tmpDir, 'project');
    mkdirSync(projectRoot, { recursive: true });
    mkdirSync(resolve(projectRoot, 'content/docs'), { recursive: true });
    const git = simpleGit(projectRoot);
    await git.init();
    await git.raw('config', 'user.name', 'Test');
    await git.raw('config', 'user.email', 'test@test.com');
    shadow = await initShadowRepo(projectRoot);
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
    const sg = shadowGit(shadow);
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
    const sg = shadowGit(shadow);
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

    const sg = shadowGit(shadow);
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

    const sg = shadowGit(shadow);
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
      'ok-checkpoint-v1: {"kind":"bridge-merge-loss","metadata":{"lostSubstrings":["x"]}}',
    ].join('\n');

    // parseContributors must still pick up Alice
    const { parseContributors } = await import('@inkeep/open-knowledge-core/shadow-repo-layout');
    const contributors = parseContributors(body);
    expect(contributors).toHaveLength(1);
    expect(contributors[0]?.id).toBe('human-a');

    // parseCheckpoint picks up the sibling line
    const checkpoint = parseCheckpoint(body);
    expect(checkpoint?.kind).toBe('bridge-merge-loss');
  });
});
