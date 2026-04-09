import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import simpleGit from 'simple-git';
import {
  commitUpstreamImport,
  commitWip,
  initShadowRepo,
  type ShadowHandle,
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

  test('creates commit on refs/wip/<writer-id>', async () => {
    writeFileSync(resolve(contentDir, 'intro.md'), '# Hello\n');

    const sha = await commitWip(shadow, writer, 'content/docs', 'WIP: intro');

    expect(sha).toHaveLength(40);

    // Verify ref exists
    const sg = shadowGit(shadow);
    const refSha = (await sg.raw('rev-parse', `refs/wip/${writer.id}`)).trim();
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
    const humanRef = (await sg.raw('rev-parse', 'refs/wip/human-nick')).trim();
    const agentRef = (await sg.raw('rev-parse', 'refs/wip/agent-cursor')).trim();

    expect(humanRef).toBe(humanSha);
    expect(agentRef).toBe(agentSha);
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

  test('creates commit on refs/wip/upstream', async () => {
    writeFileSync(resolve(contentDir, 'api.md'), '# API Reference\n');

    const sha = await commitUpstreamImport(shadow, 'content/docs', 'aabbccdd', '11223344');

    expect(sha).toHaveLength(40);

    const sg = shadowGit(shadow);
    const refSha = (await sg.raw('rev-parse', 'refs/wip/upstream')).trim();
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
