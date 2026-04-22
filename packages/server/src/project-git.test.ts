import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { execFile } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { promisify } from 'node:util';
import { ensureProjectGit, ProjectGitInitError } from './project-git.ts';

const execFileAsync = promisify(execFile);

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await mkdtemp(resolve(tmpdir(), 'ok-project-git-test-'));
});

afterEach(async () => {
  await rm(tmpDir, { recursive: true, force: true });
});

describe('ensureProjectGit', () => {
  test('returns { didInit: false } when .git/ already exists', async () => {
    const projectRoot = resolve(tmpDir, 'has-git');
    mkdirSync(projectRoot, { recursive: true });
    mkdirSync(resolve(projectRoot, '.git'));

    const result = await ensureProjectGit(projectRoot);

    expect(result.didInit).toBe(false);
  });

  test('returns { didInit: false } when .git is a file (worktree-style pointer — D6 match-any)', async () => {
    const projectRoot = resolve(tmpDir, 'worktree');
    mkdirSync(projectRoot, { recursive: true });
    writeFileSync(resolve(projectRoot, '.git'), 'gitdir: /tmp/real-git\n');

    const result = await ensureProjectGit(projectRoot);

    expect(result.didInit).toBe(false);
  });

  test('runs git init --initial-branch=main when .git/ is missing', async () => {
    const projectRoot = resolve(tmpDir, 'fresh');
    mkdirSync(projectRoot, { recursive: true });

    const result = await ensureProjectGit(projectRoot);

    expect(result.didInit).toBe(true);
    expect(existsSync(resolve(projectRoot, '.git/HEAD'))).toBe(true);

    const head = readFileSync(resolve(projectRoot, '.git/HEAD'), 'utf-8');
    expect(head).toBe('ref: refs/heads/main\n');
  });

  test('throws ProjectGitInitError when the git binary is missing', async () => {
    const projectRoot = resolve(tmpDir, 'no-git-binary');
    mkdirSync(projectRoot, { recursive: true });

    const originalPath = process.env.PATH;
    process.env.PATH = '/nonexistent-path';
    try {
      await expect(ensureProjectGit(projectRoot)).rejects.toBeInstanceOf(ProjectGitInitError);
    } finally {
      process.env.PATH = originalPath;
    }

    // On failure, we should NOT have created .git/
    expect(existsSync(resolve(projectRoot, '.git'))).toBe(false);
  });

  test('throws ProjectGitInitError when git init succeeds but .git/HEAD is absent (partial init)', async () => {
    const projectRoot = resolve(tmpDir, 'partial');
    mkdirSync(projectRoot, { recursive: true });

    // Create a fake `git` binary that creates .git/ but NOT .git/HEAD.
    // Simulates a defensively-checked post-condition failure.
    const fakeBin = resolve(tmpDir, 'fake-bin');
    mkdirSync(fakeBin);
    const fakeGit = resolve(fakeBin, 'git');
    writeFileSync(
      fakeGit,
      `#!/bin/sh\n# args: init --initial-branch=main <path>\ntarget="$3"\nmkdir -p "$target/.git"\n# intentionally do not create HEAD\nexit 0\n`,
      'utf-8',
    );
    await execFileAsync('chmod', ['+x', fakeGit]);

    const originalPath = process.env.PATH;
    process.env.PATH = `${fakeBin}:${originalPath ?? ''}`;
    try {
      await expect(ensureProjectGit(projectRoot)).rejects.toBeInstanceOf(ProjectGitInitError);
    } finally {
      process.env.PATH = originalPath;
    }
  });
});
