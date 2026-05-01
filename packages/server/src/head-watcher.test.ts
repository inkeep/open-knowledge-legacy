import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { readBranchFromHead, resolveGitDir } from './head-watcher';

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await mkdtemp(resolve(tmpdir(), 'ok-headwatch-test-'));
});

afterEach(async () => {
  await rm(tmpDir, { recursive: true, force: true });
});

describe('resolveGitDir', () => {
  test('returns .git path when .git is a directory', () => {
    const projectRoot = resolve(tmpDir, 'project');
    mkdirSync(resolve(projectRoot, '.git'), { recursive: true });

    const result = resolveGitDir(projectRoot);
    expect(result).toBe(resolve(projectRoot, '.git'));
  });

  test('resolves worktree .git pointer file', () => {
    const projectRoot = resolve(tmpDir, 'worktree');
    const realGitDir = resolve(tmpDir, 'real-git');
    mkdirSync(projectRoot, { recursive: true });
    mkdirSync(realGitDir, { recursive: true });

    writeFileSync(resolve(projectRoot, '.git'), `gitdir: ${realGitDir}\n`);

    const result = resolveGitDir(projectRoot);
    expect(result).toBe(realGitDir);
  });

  test('returns null when no .git exists', () => {
    const projectRoot = resolve(tmpDir, 'no-git');
    mkdirSync(projectRoot, { recursive: true });

    const result = resolveGitDir(projectRoot);
    expect(result).toBeNull();
  });
});

describe('readBranchFromHead', () => {
  test('reads branch name from symref HEAD', () => {
    const gitDir = resolve(tmpDir, 'git');
    mkdirSync(gitDir, { recursive: true });
    writeFileSync(resolve(gitDir, 'HEAD'), 'ref: refs/heads/main\n');

    expect(readBranchFromHead(gitDir)).toBe('main');
  });

  test('reads feature branch name', () => {
    const gitDir = resolve(tmpDir, 'git');
    mkdirSync(gitDir, { recursive: true });
    writeFileSync(resolve(gitDir, 'HEAD'), 'ref: refs/heads/feature/my-feature\n');

    expect(readBranchFromHead(gitDir)).toBe('feature/my-feature');
  });

  test('returns detached-<sha12> for raw SHA HEAD', () => {
    const gitDir = resolve(tmpDir, 'git');
    mkdirSync(gitDir, { recursive: true });
    const sha = 'abc123def456789012345678901234567890abcd';
    writeFileSync(resolve(gitDir, 'HEAD'), `${sha}\n`);

    expect(readBranchFromHead(gitDir)).toBe('detached-abc123def456');
  });

  test('returns null when .git/HEAD does not exist', () => {
    const gitDir = resolve(tmpDir, 'nonexistent');
    expect(readBranchFromHead(gitDir)).toBeNull();
  });

  test('returns null for invalid HEAD content', () => {
    const gitDir = resolve(tmpDir, 'git');
    mkdirSync(gitDir, { recursive: true });
    writeFileSync(resolve(gitDir, 'HEAD'), 'invalid\n');

    expect(readBranchFromHead(gitDir)).toBeNull();
  });
});
