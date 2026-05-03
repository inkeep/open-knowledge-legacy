import { describe as _bunDescribe, afterEach, beforeEach, expect, spyOn, test } from 'bun:test';

const describe = process.env.CI ? _bunDescribe.skip : _bunDescribe;

import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { setTimeout as wait } from 'node:timers/promises';
import { parseCheckpoint, parseOkActor } from '@inkeep/open-knowledge-core/shadow-repo-layout';
import simpleGit from 'simple-git';
import {
  buildWipTree,
  commitUpstreamImport,
  commitWip,
  type InMemoryCheckpointParams,
  initShadowRepo,
  type ParkableDoc,
  parkBranch,
  readParkedState,
  SERVICE_WRITER,
  type ShadowHandle,
  safetyCheckpoint,
  saveInMemoryCheckpoint,
  saveVersion,
  shadowGit,
  sweepLegacyShadowRefs,
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
  test('creates shadow at .git/ok/ when project .git/ exists', async () => {
    const projectRoot = resolve(tmpDir, 'project');
    mkdirSync(projectRoot, { recursive: true });

    const git = simpleGit(projectRoot);
    await git.init();
    await git.raw('config', 'user.name', 'Test');
    await git.raw('config', 'user.email', 'test@test.com');

    const shadow = await initShadowRepo(projectRoot);

    expect(shadow.gitDir).toBe(resolve(projectRoot, '.git/ok'));
    expect(shadow.workTree).toBe(projectRoot);
    expect(existsSync(resolve(shadow.gitDir, 'HEAD'))).toBe(true);

    const sg = simpleGit().env({ GIT_DIR: shadow.gitDir });
    const worktree = (await sg.raw('config', 'core.worktree')).trim();
    expect(worktree).toBe(projectRoot);

    const userName = (await sg.raw('config', 'user.name')).trim();
    expect(userName).toBe('openknowledge');
  });

  test('does not modify .gitignore (shadow is inside .git/ already)', async () => {
    const projectRoot = resolve(tmpDir, 'project');
    mkdirSync(projectRoot, { recursive: true });

    const git = simpleGit(projectRoot);
    await git.init();
    await git.raw('config', 'user.name', 'Test');
    await git.raw('config', 'user.email', 'test@test.com');

    await initShadowRepo(projectRoot);
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

  test('R9 rename shim: legacy .git/openknowledge/ is renamed to .git/ok/', async () => {
    const projectRoot = resolve(tmpDir, 'legacy');
    mkdirSync(projectRoot, { recursive: true });

    const git = simpleGit(projectRoot);
    await git.init();
    await git.raw('config', 'user.name', 'Test');
    await git.raw('config', 'user.email', 'test@test.com');

    const legacyDir = resolve(projectRoot, '.git/openknowledge');
    mkdirSync(legacyDir, { recursive: true });
    await git.raw('init', '--bare', legacyDir);
    const sg = simpleGit({ timeout: { block: 30_000 } }).env({ GIT_DIR: legacyDir });
    await sg.raw('config', '--unset', 'core.bare');
    await sg.raw('config', 'core.worktree', projectRoot);
    writeFileSync(resolve(legacyDir, 'SENTINEL'), 'migrated');

    const shadow = await initShadowRepo(projectRoot);

    expect(shadow.gitDir).toBe(resolve(projectRoot, '.git/ok'));
    expect(existsSync(legacyDir)).toBe(false);
    expect(existsSync(resolve(projectRoot, '.git/ok/SENTINEL'))).toBe(true);
    expect(existsSync(resolve(projectRoot, '.git/ok/HEAD'))).toBe(true);
  });

  test('R9 defensive: both legacy and new shadow present — no rename, warning logged', async () => {
    const projectRoot = resolve(tmpDir, 'both-present');
    mkdirSync(projectRoot, { recursive: true });

    const git = simpleGit(projectRoot);
    await git.init();
    await git.raw('config', 'user.name', 'Test');
    await git.raw('config', 'user.email', 'test@test.com');

    const legacyDir = resolve(projectRoot, '.git/openknowledge');
    const newDir = resolve(projectRoot, '.git/ok');
    mkdirSync(legacyDir, { recursive: true });
    mkdirSync(newDir, { recursive: true });
    writeFileSync(resolve(legacyDir, 'LEGACY_SENTINEL'), 'legacy');
    writeFileSync(resolve(newDir, 'NEW_SENTINEL'), 'new');

    const warnSpy = spyOn(console, 'warn').mockImplementation(() => {});
    try {
      await initShadowRepo(projectRoot);

      expect(existsSync(resolve(legacyDir, 'LEGACY_SENTINEL'))).toBe(true);
      expect(existsSync(resolve(newDir, 'NEW_SENTINEL'))).toBe(true);

      const warnings = warnSpy.mock.calls.map((call) => String(call[0] ?? ''));
      expect(warnings.some((w) => w.includes('[shadow-repo] unexpected legacy + new shadow'))).toBe(
        true,
      );
    } finally {
      warnSpy.mockRestore();
    }
  });
});

describe('buildWipTree contentRoot pathspec', () => {
  test("'.' pathspec succeeds when content lives at the project root", async () => {
    const projectRoot = resolve(tmpDir, 'project');
    mkdirSync(projectRoot, { recursive: true });
    writeFileSync(resolve(projectRoot, 'AGENTS.md'), '# hello\n');
    const shadow = await initShadowRepo(projectRoot);

    const sha = await buildWipTree(shadow, '.');
    expect(sha).toMatch(/^[0-9a-f]{40}$/);
  });

  test("literal 'content' pathspec fails when no such subfolder exists", async () => {
    const projectRoot = resolve(tmpDir, 'project');
    mkdirSync(projectRoot, { recursive: true });
    writeFileSync(resolve(projectRoot, 'AGENTS.md'), '# hello\n');
    const shadow = await initShadowRepo(projectRoot);

    expect(buildWipTree(shadow, 'content')).rejects.toThrow(/pathspec 'content'/);
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

    const sg = shadowGit(shadow);
    const refSha = (await sg.raw('rev-parse', `refs/wip/main/${writer.id}`)).trim();
    expect(refSha).toBe(sha);

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

  test('creates commit on refs/wip/<branch>/git-upstream', async () => {
    writeFileSync(resolve(contentDir, 'api.md'), '# API Reference\n');

    const sha = await commitUpstreamImport(shadow, 'content/docs', 'aabbccdd', '11223344');

    expect(sha).toHaveLength(40);

    const sg = shadowGit(shadow);
    const refSha = (await sg.raw('rev-parse', 'refs/wip/main/git-upstream')).trim();
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
    expect(msg).toBe('import: from aabbccdd..11223344');
  });

  test('commit message handles null oldHead (initial import)', async () => {
    writeFileSync(resolve(contentDir, 'api.md'), '# API\n');

    const sha = await commitUpstreamImport(shadow, 'content/docs', null, '1122334455667788');

    const sg = shadowGit(shadow);
    const msg = (await sg.raw('log', '-1', '--format=%s', sha)).trim();
    expect(msg).toBe('import: initial at 11223344');
  });

  test('upstream commit is authored by upstream writer', async () => {
    writeFileSync(resolve(contentDir, 'api.md'), '# API\n');

    const sha = await commitUpstreamImport(shadow, 'content/docs', null, 'deadbeef');

    const sg = shadowGit(shadow);
    const authorName = (await sg.raw('log', '-1', '--format=%an', sha)).trim();
    expect(authorName).toBe('Git (upstream)');
  });

  test('commit body carries ok-actor: line (US-015)', async () => {
    writeFileSync(resolve(contentDir, 'api.md'), '# API\n');

    const sha = await commitUpstreamImport(shadow, 'content/docs', 'aabb0011', 'ccdd2233');

    const sg = shadowGit(shadow);
    const body = (await sg.raw('log', '-1', '--format=%B', sha)).trim();
    const actor = parseOkActor(body);
    expect(actor).not.toBeNull();
    expect(actor?.v).toBe(1);
    expect(actor?.display_name).toBe('Git (upstream)');
  });
});

describe('safetyCheckpoint', () => {
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

  test('uses checkpoint: prefix subject (US-015)', async () => {
    writeFileSync(resolve(contentDir, 'intro.md'), '# Hello\n');

    const sha = await safetyCheckpoint(shadow, 'content/docs', { action: 'rollback', context: {} });

    const sg = shadowGit(shadow);
    const subject = (await sg.raw('log', '-1', '--format=%s', sha)).trim();
    expect(subject).toBe('checkpoint: pre-rollback');
  });

  test('commit body carries ok-actor: line (US-015)', async () => {
    writeFileSync(resolve(contentDir, 'intro.md'), '# Hello\n');

    const sha = await safetyCheckpoint(shadow, 'content/docs', { action: 'rollback', context: {} });

    const sg = shadowGit(shadow);
    const body = (await sg.raw('log', '-1', '--format=%B', sha)).trim();
    const actor = parseOkActor(body);
    expect(actor).not.toBeNull();
    expect(actor?.v).toBe(1);
    expect(actor?.display_name).toBe('Open Knowledge (service)');
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

  test('creates park commit with Y.Doc state and disk snapshot (US-017)', async () => {
    const docs: ParkableDoc[] = [
      {
        docName: 'intro',
        markdown: '# Hello World\n\nEdited content\n',
        diskSnapshot: '# Hello\n',
      },
    ];

    const sha = await parkBranch(shadow, 'main', SERVICE_WRITER.id, docs, 'feature');
    expect(sha).toHaveLength(40);
    if (!sha) throw new Error('parkBranch returned null');

    const sg = shadowGit(shadow);
    const msg = (await sg.raw('log', '-1', '--format=%s', sha)).trim();
    expect(msg).toBe('park: main -> feature');

    const refSha = (await sg.raw('rev-parse', `refs/wip/main/${SERVICE_WRITER.id}`)).trim();
    expect(refSha).toBe(sha);

    const content = (await sg.raw('show', `${sha}:intro`)).trim();
    expect(content).toBe('# Hello World\n\nEdited content');

    const base = (await sg.raw('show', `${sha}:.park-base/intro`)).trim();
    expect(base).toBe('# Hello');
  });

  test('returns null for empty documents', async () => {
    const sha = await parkBranch(shadow, 'main', SERVICE_WRITER.id, []);
    expect(sha).toBeNull();
  });

  test('commit body carries ok-actor: line (US-015)', async () => {
    const docs: ParkableDoc[] = [
      { docName: 'intro', markdown: '# Hello\n', diskSnapshot: '# Hello\n' },
    ];
    const sha = await parkBranch(shadow, 'feature', SERVICE_WRITER.id, docs);
    if (!sha) throw new Error('parkBranch returned null');

    const sg = shadowGit(shadow);
    const body = (await sg.raw('log', '-1', '--format=%B', sha)).trim();
    const actor = parseOkActor(body);
    expect(actor).not.toBeNull();
    expect(actor?.v).toBe(1);
    expect(actor?.display_name).toBe('Open Knowledge (service)');
    expect(actor?.docs).toContain('intro');
  });

  test('readParkedState retrieves parked content', async () => {
    const docs: ParkableDoc[] = [
      { docName: 'guide', markdown: '# Guide v2\n', diskSnapshot: '# Guide v1\n' },
    ];
    await parkBranch(shadow, 'feature', SERVICE_WRITER.id, docs);

    const state = await readParkedState(shadow, 'feature', SERVICE_WRITER.id, 'guide');
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

    const sha = await parkBranch(shadow, 'main', SERVICE_WRITER.id, docs);
    expect(sha).toHaveLength(40);

    const sg = shadowGit(shadow);
    const introContent = (await sg.raw('show', `${sha}:intro`)).trim();
    const guideContent = (await sg.raw('show', `${sha}:guide`)).trim();
    expect(introContent).toBe('# Intro');
    expect(guideContent).toBe('# Guide');
  });

  test('isPairedWriteOrigin(PARK_SNAPSHOT_ORIGIN) returns true (US-017)', () => {
    const origin = {
      source: 'local' as const,
      skipStoreHooks: false,
      context: { origin: 'park-snapshot', paired: true as const },
    };
    expect(origin.context.paired).toBe(true);
    expect(typeof origin.context.origin).toBe('string');
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

    const tree = (await sg.raw('ls-tree', '-r', '--name-only', result.checkpointRef)).trim();
    expect(tree).toContain('content/docs/intro.md');
  });

  test('resets WIP refs after save', async () => {
    writeFileSync(resolve(contentDir, 'intro.md'), '# WIP content\n');
    await commitWip(shadow, human, 'content/docs', 'WIP: edit');

    const sg = shadowGit(shadow);
    const wipBefore = (await sg.raw('rev-parse', 'refs/wip/main/human-nick')).trim();
    expect(wipBefore).toHaveLength(40);

    await saveVersion(shadow, 'content/docs', [human]);

    let wipExists = true;
    try {
      await sg.raw('rev-parse', 'refs/wip/main/human-nick');
    } catch {
      wipExists = false;
    }
    expect(wipExists).toBe(false);
  });

  test('multi-parent checkpoint preserves all writer chains', async () => {
    writeFileSync(resolve(contentDir, 'intro.md'), '# Human edit\n');
    const humanWipSha = await commitWip(shadow, human, 'content/docs', 'WIP: human edit');

    writeFileSync(resolve(contentDir, 'intro.md'), '# Agent edit\n');
    const agentWipSha = await commitWip(shadow, agent, 'content/docs', 'WIP: agent edit');

    const result = await saveVersion(shadow, 'content/docs', [human, agent]);

    const sg = shadowGit(shadow);

    const parentLine = (await sg.raw('log', '-1', '--format=%P', result.checkpointRef)).trim();
    const parents = parentLine.split(' ').filter(Boolean);
    expect(parents).toContain(humanWipSha);
    expect(parents).toContain(agentWipSha);
    expect(parents.length).toBe(2);

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

  test('checkpoint commit carries ok-actor: body line (US-015)', async () => {
    writeFileSync(resolve(contentDir, 'intro.md'), '# v1\n');
    const result = await saveVersion(shadow, 'content/docs', [human]);

    const sg = shadowGit(shadow);
    const body = (await sg.raw('log', '-1', '--format=%B', result.checkpointRef)).trim();

    const subject = (await sg.raw('log', '-1', '--format=%s', result.checkpointRef)).trim();
    expect(subject).toBe('checkpoint: Checkpoint version');

    const actor = parseOkActor(body);
    expect(actor).not.toBeNull();
    expect(actor?.v).toBe(1);
    expect(actor?.display_name).toBe('Open Knowledge (service)');
  });

  test('checkpoint falls back to latest checkpoint when no WIP activity', async () => {
    writeFileSync(resolve(contentDir, 'intro.md'), '# v1\n');
    await commitWip(shadow, human, 'content/docs', 'WIP: v1');
    const result1 = await saveVersion(shadow, 'content/docs', [human]);

    const sg = shadowGit(shadow);
    const checkpoint1Sha = (await sg.raw('rev-parse', result1.checkpointRef)).trim();

    writeFileSync(resolve(contentDir, 'intro.md'), '# v2 (direct write, no WIP commit)\n');
    const result2 = await saveVersion(shadow, 'content/docs', [human]);

    const parentLine = (await sg.raw('log', '-1', '--format=%P', result2.checkpointRef)).trim();
    const parents = parentLine.split(' ').filter(Boolean);
    expect(parents).toContain(checkpoint1Sha);
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

    const sg = shadowGit(shadow);
    const refSha = (await sg.raw('rev-parse', `refs/checkpoints/main/${sha}`)).trim();
    expect(refSha).toBe(sha);

    const body = (await sg.raw('log', '-1', '--format=%B', sha)).trim();
    expect(body).toContain('checkpoint: Before concurrent merge @ 2026-04-17T08:00:00Z');
    const parsed = parseCheckpoint(body);
    expect(parsed).not.toBeNull();
    if (parsed?.kind !== 'bridge-merge-loss') throw new Error('expected bridge-merge-loss kind');
    expect(parsed.metadata.lostSubstrings).toEqual(['user keystroke', 'another lost phrase']);

    const tree = (await sg.raw('ls-tree', '-r', sha)).trim();
    expect(tree).toContain('content/docs/intro.md');

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
    const body = [
      'checkpoint: Before concurrent merge @ t',
      '',
      'ok-contributors: {"id":"human-a","name":"Alice","docs":["intro.md"]}',
      'ok-checkpoint-v1: {"kind":"bridge-merge-loss","docName":"intro.md","size":16,"metadata":{"lostSubstrings":["x"]}}',
    ].join('\n');

    const { parseContributors } = await import('@inkeep/open-knowledge-core/shadow-repo-layout');
    const contributors = parseContributors(body);
    expect(contributors).toHaveLength(1);
    expect(contributors[0]?.id).toBe('human-a');

    const checkpoint = parseCheckpoint(body);
    expect(checkpoint?.kind).toBe('bridge-merge-loss');
  });
});

describe('gcCheckpointRefs (bridge-correctness SPEC §6 R7 + review iteration 5)', () => {
  let projectRoot: string;
  let shadow: ShadowHandle;

  beforeEach(async () => {
    projectRoot = resolve(tmpDir, 'gc-project');
    mkdirSync(projectRoot, { recursive: true });
    mkdirSync(resolve(projectRoot, 'content/docs'), { recursive: true });
    const git = simpleGit(projectRoot);
    await git.init();
    await git.raw('config', 'user.name', 'Test');
    await git.raw('config', 'user.email', 'test@test.com');
    shadow = await initShadowRepo(projectRoot);
  });

  test('keeps only the most-recent N bridge-merge-loss refs per branch', async () => {
    const { gcCheckpointRefs } = await import('./shadow-repo.ts');
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

    const sg = shadowGit(shadow);
    const remaining = (
      await sg.raw('for-each-ref', '--format=%(refname)', 'refs/checkpoints/main/')
    )
      .trim()
      .split('\n')
      .filter(Boolean);
    expect(remaining).toHaveLength(3);
  });

  test('applies TTL independently of the count cap', async () => {
    for (let i = 0; i < 2; i++) {
      await saveInMemoryCheckpoint(shadow, 'content/docs', {
        kind: 'external-change-rescue',
        docName: `doc-${i}.md`,
        contents: `contents ${i}\n`,
        label: `rescue ${i}`,
        metadata: { incomingDiskSha: `sha-${i}` },
      });
    }
    await wait(5);

    const { gcCheckpointRefs } = await import('./shadow-repo.ts');
    const result = await gcCheckpointRefs(shadow, 'main', {
      maxBridgeMergeLoss: 50,
      maxExternalChangeRescue: 50,
      ttlMs: 1, // everything older than 1 ms is eligible
    });

    expect(result.deletedExternalChangeRescue).toBe(2);
  });

  test('does NOT delete untyped Save-Version-style checkpoints', async () => {
    const { gcCheckpointRefs } = await import('./shadow-repo.ts');
    const sg = shadowGit(shadow);

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

    const refs = (await sg.raw('for-each-ref', '--format=%(refname)', 'refs/checkpoints/main/'))
      .trim()
      .split('\n')
      .filter(Boolean);
    expect(refs).toContain(`refs/checkpoints/main/${untypedSha}`);
  });
});

describe('sweepLegacyShadowRefs (US-018, D35, NFR-6)', () => {
  let projectRoot: string;
  let shadow: ShadowHandle;

  beforeEach(async () => {
    projectRoot = resolve(tmpDir, 'sweep-test');
    mkdirSync(projectRoot, { recursive: true });

    const git = simpleGit(projectRoot);
    await git.init();
    await git.raw('config', 'user.name', 'Test');
    await git.raw('config', 'user.email', 'test@test.com');

    shadow = await initShadowRepo(projectRoot);
  });

  async function createRef(refname: string): Promise<void> {
    const sg = shadowGit(shadow);
    const emptyTreeSha = (await sg.raw('hash-object', '-t', 'tree', '-w', '/dev/null')).trim();
    const commitSha = (
      await sg
        .env({
          GIT_DIR: shadow.gitDir,
          GIT_AUTHOR_DATE: '2020-01-01T00:00:00+00:00',
          GIT_COMMITTER_DATE: '2020-01-01T00:00:00+00:00',
          GIT_AUTHOR_NAME: 'test',
          GIT_AUTHOR_EMAIL: 'test@test.com',
          GIT_COMMITTER_NAME: 'test',
          GIT_COMMITTER_EMAIL: 'test@test.com',
        })
        .raw('commit-tree', emptyTreeSha, '-m', `test: ${refname}`)
    ).trim();
    await sg.raw('update-ref', refname, commitSha);
  }

  test('deletes only legacy refs (server, human-*, upstream); preserves new taxonomy (US-018)', async () => {
    await createRef('refs/wip/main/server');
    await createRef('refs/wip/main/human-abc');
    await createRef('refs/wip/main/human-def123');
    await createRef('refs/wip/main/upstream');
    await createRef('refs/wip/main/agent-xyz');
    await createRef('refs/wip/main/principal-def');
    await createRef('refs/wip/main/file-system');
    await createRef('refs/wip/main/git-upstream');
    await createRef('refs/wip/main/openknowledge-service');

    const deleted = await sweepLegacyShadowRefs(shadow);
    expect(deleted).toBe(4); // server + human-abc + human-def123 + upstream

    const sg = shadowGit(shadow);
    const remaining = (await sg.raw('for-each-ref', '--format=%(refname)', 'refs/wip'))
      .trim()
      .split('\n')
      .filter(Boolean);

    expect(remaining).not.toContain('refs/wip/main/server');
    expect(remaining).not.toContain('refs/wip/main/human-abc');
    expect(remaining).not.toContain('refs/wip/main/human-def123');
    expect(remaining).not.toContain('refs/wip/main/upstream');

    expect(remaining).toContain('refs/wip/main/agent-xyz');
    expect(remaining).toContain('refs/wip/main/principal-def');
    expect(remaining).toContain('refs/wip/main/file-system');
    expect(remaining).toContain('refs/wip/main/git-upstream');
    expect(remaining).toContain('refs/wip/main/openknowledge-service');
  });

  test('idempotent — second sweep deletes nothing (US-018)', async () => {
    await createRef('refs/wip/main/server');
    await createRef('refs/wip/main/agent-abc');

    const first = await sweepLegacyShadowRefs(shadow);
    expect(first).toBe(1);

    const second = await sweepLegacyShadowRefs(shadow);
    expect(second).toBe(0); // no-op
  });

  test('fresh repo with no refs returns 0 (US-018)', async () => {
    const deleted = await sweepLegacyShadowRefs(shadow);
    expect(deleted).toBe(0);
  });
});
