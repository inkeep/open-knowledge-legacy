import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { resolveGitDir } from './head-watcher';

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

    // .git is a file with gitdir: pointer
    writeFileSync(resolve(projectRoot, '.git'), `gitdir: ${realGitDir}\n`);

    const result = resolveGitDir(projectRoot);
    expect(result).toBe(realGitDir);
  });

  test('returns null when no .git exists (standalone mode)', () => {
    const projectRoot = resolve(tmpDir, 'standalone');
    mkdirSync(projectRoot, { recursive: true });

    const result = resolveGitDir(projectRoot);
    expect(result).toBeNull();
  });
});
