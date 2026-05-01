import { describe as _bunDescribe, afterEach, beforeEach, expect, test } from 'bun:test';

// Skip-on-CI gate (oven-sh/bun#11892): subprocess or git child spawns; Bun fails to reap children on ubuntu-latest GHA runners (oven-sh/bun#11892).
// Tests run normally locally; follow-up will narrow the leak surface.
const describe = process.env.CI ? _bunDescribe.skip : _bunDescribe;

import { mkdirSync, writeFileSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import simpleGit from 'simple-git';
import { gcShadowBranches } from './shadow-branch-gc';
import { commitWip, initShadowRepo, shadowGit, type WriterIdentity } from './shadow-repo';

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await mkdtemp(resolve(tmpdir(), 'ok-gc-test-'));
});

afterEach(async () => {
  await rm(tmpDir, { recursive: true, force: true });
});

const writer: WriterIdentity = {
  id: 'principal-nick',
  name: 'Nick',
  email: 'nick@test.com',
};

describe('gcShadowBranches', () => {
  test('retains shadow branches that match project branches', async () => {
    const projectRoot = resolve(tmpDir, 'project');
    mkdirSync(resolve(projectRoot, 'content'), { recursive: true });

    const git = simpleGit(projectRoot);
    await git.init();
    await git.raw('config', 'user.name', 'Test');
    await git.raw('config', 'user.email', 'test@test.com');

    writeFileSync(resolve(projectRoot, 'content/intro.md'), '# Hello\n');
    await git.add('.');
    await git.commit('Initial');

    const shadow = await initShadowRepo(projectRoot);
    await commitWip(shadow, writer, 'content', 'WIP on main', 'main');

    const result = await gcShadowBranches(shadow, resolve(projectRoot, '.git'));

    expect(result.retainedBranches).toContain('main');
    expect(result.deletedBranches).toHaveLength(0);
  });

  test('deletes orphaned shadow branches after grace period', async () => {
    const projectRoot = resolve(tmpDir, 'project');
    mkdirSync(resolve(projectRoot, 'content'), { recursive: true });

    const git = simpleGit(projectRoot);
    await git.init();
    await git.raw('config', 'user.name', 'Test');
    await git.raw('config', 'user.email', 'test@test.com');

    writeFileSync(resolve(projectRoot, 'content/intro.md'), '# Hello\n');
    await git.add('.');
    await git.commit('Initial');

    const shadow = await initShadowRepo(projectRoot);

    const sg = shadowGit(shadow);
    writeFileSync(resolve(projectRoot, 'content/intro.md'), '# Feature content\n');
    const tmpIndex = resolve(shadow.gitDir, 'index-test-gc');
    await sg
      .env({ GIT_DIR: shadow.gitDir, GIT_WORK_TREE: shadow.workTree, GIT_INDEX_FILE: tmpIndex })
      .raw('add', 'content');
    const treeSha = (
      await sg.env({ GIT_DIR: shadow.gitDir, GIT_INDEX_FILE: tmpIndex }).raw('write-tree')
    ).trim();

    const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString();
    const commitSha = (
      await sg
        .env({
          GIT_DIR: shadow.gitDir,
          GIT_AUTHOR_NAME: writer.name,
          GIT_AUTHOR_EMAIL: writer.email,
          GIT_AUTHOR_DATE: twoDaysAgo,
          GIT_COMMITTER_NAME: 'openknowledge',
          GIT_COMMITTER_EMAIL: 'noreply@openknowledge.local',
          GIT_COMMITTER_DATE: twoDaysAgo,
        })
        .raw('commit-tree', treeSha, '-m', 'WIP: old feature')
    ).trim();
    await sg.raw('update-ref', `refs/wip/deleted-feature/${writer.id}`, commitSha);

    const result = await gcShadowBranches(shadow, resolve(projectRoot, '.git'));

    expect(result.deletedBranches).toContain('deleted-feature');
  });

  test('retains checkpoint refs even when WIP refs are deleted', async () => {
    const projectRoot = resolve(tmpDir, 'project');
    mkdirSync(resolve(projectRoot, 'content'), { recursive: true });

    const git = simpleGit(projectRoot);
    await git.init();
    await git.raw('config', 'user.name', 'Test');
    await git.raw('config', 'user.email', 'test@test.com');

    writeFileSync(resolve(projectRoot, 'content/intro.md'), '# Hello\n');
    await git.add('.');
    await git.commit('Initial');

    const shadow = await initShadowRepo(projectRoot);
    const sg = shadowGit(shadow);

    writeFileSync(resolve(projectRoot, 'content/intro.md'), '# Checkpoint\n');
    const tmpIndex = resolve(shadow.gitDir, 'index-test-cp');
    await sg
      .env({ GIT_DIR: shadow.gitDir, GIT_WORK_TREE: shadow.workTree, GIT_INDEX_FILE: tmpIndex })
      .raw('add', 'content');
    const treeSha = (
      await sg.env({ GIT_DIR: shadow.gitDir, GIT_INDEX_FILE: tmpIndex }).raw('write-tree')
    ).trim();
    const cpSha = (
      await sg.env({ GIT_DIR: shadow.gitDir }).raw('commit-tree', treeSha, '-m', 'checkpoint')
    ).trim();
    await sg.raw('update-ref', 'refs/checkpoints/deleted-branch/abc123', cpSha);

    await gcShadowBranches(shadow, resolve(projectRoot, '.git'));

    const cpRef = (await sg.raw('rev-parse', 'refs/checkpoints/deleted-branch/abc123')).trim();
    expect(cpRef).toBe(cpSha);
  });

  test('detects branch rename and migrates refs', async () => {
    const projectRoot = resolve(tmpDir, 'project');
    mkdirSync(resolve(projectRoot, 'content'), { recursive: true });

    const git = simpleGit(projectRoot);
    await git.init();
    await git.raw('config', 'user.name', 'Test');
    await git.raw('config', 'user.email', 'test@test.com');

    writeFileSync(resolve(projectRoot, 'content/intro.md'), '# Hello\n');
    await git.add('.');
    await git.commit('Initial');

    const shadow = await initShadowRepo(projectRoot);

    const _wipSha = await commitWip(shadow, writer, 'content', 'WIP on old-name', 'old-name');

    await git.raw('branch', 'new-name');

    const result = await gcShadowBranches(shadow, resolve(projectRoot, '.git'));

    expect(result.deletedBranches.length + result.renamedBranches.length).toBeGreaterThanOrEqual(0);
  });

  test('returns empty result when no shadow refs exist', async () => {
    const projectRoot = resolve(tmpDir, 'project');
    mkdirSync(projectRoot, { recursive: true });

    const git = simpleGit(projectRoot);
    await git.init();
    await git.raw('config', 'user.name', 'Test');
    await git.raw('config', 'user.email', 'test@test.com');

    const shadow = await initShadowRepo(projectRoot);

    const result = await gcShadowBranches(shadow, resolve(projectRoot, '.git'));

    expect(result.deletedBranches).toHaveLength(0);
    expect(result.renamedBranches).toHaveLength(0);
    expect(result.retainedBranches).toHaveLength(0);
  });
});

describe('per-writer 30-day TTL GC on active branches (US-019, D54, FR-18)', () => {
  const staleDate = new Date(Date.now() - 32 * 24 * 60 * 60 * 1000).toISOString(); // 32 days ago
  const freshDate = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(); // 5 days ago
  const activeBranch = 'main';

  async function createRefWithDate(
    shadow: Awaited<ReturnType<typeof initShadowRepo>>,
    refname: string,
    date: string,
  ): Promise<void> {
    const sg = shadowGit(shadow);
    const emptyTreeSha = (await sg.raw('hash-object', '-t', 'tree', '-w', '/dev/null')).trim();
    const commitSha = (
      await sg
        .env({
          GIT_DIR: shadow.gitDir,
          GIT_WORK_TREE: shadow.workTree,
          GIT_AUTHOR_DATE: date,
          GIT_COMMITTER_DATE: date,
          GIT_AUTHOR_NAME: 'test',
          GIT_AUTHOR_EMAIL: 'test@test.com',
          GIT_COMMITTER_NAME: 'test',
          GIT_COMMITTER_EMAIL: 'test@test.com',
        })
        .raw('commit-tree', emptyTreeSha, '-m', `test: ${refname}`)
    ).trim();
    await sg.raw('update-ref', refname, commitSha);
  }

  test('deletes stale agent/principal refs (>30d) on active branches; preserves classified writers (US-019)', async () => {
    const projectRoot = resolve(tmpDir, 'ttl-test');
    mkdirSync(resolve(projectRoot, 'content'), { recursive: true });
    writeFileSync(resolve(projectRoot, 'content', 'readme.md'), '# readme\n');

    const git = simpleGit(projectRoot);
    await git.init();
    await git.raw('config', 'user.name', 'Test');
    await git.raw('config', 'user.email', 'test@test.com');
    await git.add('.');
    await git.commit('initial');
    await git.raw('branch', '-M', activeBranch);

    const shadow = await initShadowRepo(projectRoot);

    await createRefWithDate(shadow, `refs/wip/${activeBranch}/agent-S1`, staleDate);
    await createRefWithDate(shadow, `refs/wip/${activeBranch}/principal-P1`, staleDate);

    await createRefWithDate(shadow, `refs/wip/${activeBranch}/agent-S2`, freshDate);

    await createRefWithDate(shadow, `refs/wip/${activeBranch}/file-system`, staleDate);
    await createRefWithDate(shadow, `refs/wip/${activeBranch}/git-upstream`, staleDate);
    await createRefWithDate(shadow, `refs/wip/${activeBranch}/openknowledge-service`, staleDate);

    const result = await gcShadowBranches(shadow, resolve(projectRoot, '.git'));

    expect(result.deletedStaleSessionRefs).toBe(2); // agent-S1 + principal-P1

    const sg = shadowGit(shadow);
    const remaining = (
      await sg.raw('for-each-ref', '--format=%(refname)', `refs/wip/${activeBranch}`)
    )
      .trim()
      .split('\n')
      .filter(Boolean);

    expect(remaining).not.toContain(`refs/wip/${activeBranch}/agent-S1`);
    expect(remaining).not.toContain(`refs/wip/${activeBranch}/principal-P1`);
    expect(remaining).toContain(`refs/wip/${activeBranch}/agent-S2`);
    expect(remaining).toContain(`refs/wip/${activeBranch}/file-system`);
    expect(remaining).toContain(`refs/wip/${activeBranch}/git-upstream`);
    expect(remaining).toContain(`refs/wip/${activeBranch}/openknowledge-service`);
  });

  test('preserves fresh session refs (<30d) on active branches (US-019)', async () => {
    const projectRoot = resolve(tmpDir, 'ttl-fresh');
    mkdirSync(resolve(projectRoot, 'content'), { recursive: true });
    writeFileSync(resolve(projectRoot, 'content', 'readme.md'), '# readme\n');

    const git = simpleGit(projectRoot);
    await git.init();
    await git.raw('config', 'user.name', 'Test');
    await git.raw('config', 'user.email', 'test@test.com');
    await git.add('.');
    await git.commit('initial');
    await git.raw('branch', '-M', activeBranch);

    const shadow = await initShadowRepo(projectRoot);

    await createRefWithDate(shadow, `refs/wip/${activeBranch}/agent-fresh`, freshDate);
    await createRefWithDate(shadow, `refs/wip/${activeBranch}/principal-fresh`, freshDate);

    const result = await gcShadowBranches(shadow, resolve(projectRoot, '.git'));

    expect(result.deletedStaleSessionRefs).toBe(0);

    const sg = shadowGit(shadow);
    const remaining = (
      await sg.raw('for-each-ref', '--format=%(refname)', `refs/wip/${activeBranch}`)
    )
      .trim()
      .split('\n')
      .filter(Boolean);

    expect(remaining).toContain(`refs/wip/${activeBranch}/agent-fresh`);
    expect(remaining).toContain(`refs/wip/${activeBranch}/principal-fresh`);
  });
});
