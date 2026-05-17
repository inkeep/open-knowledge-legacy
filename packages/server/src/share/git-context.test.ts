import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { branchExistsOnOrigin, readGitHeadBranch, readOriginGitHubRepo } from './git-context.ts';

function seedRepo(
  root: string,
  spec: {
    head?: string;
    config?: string;
    branchRefs?: Record<string, string>;
    packedRefs?: string;
    gitDirAsFile?: { contents: string };
  } = {},
): void {
  if (spec.gitDirAsFile) {
    writeFileSync(join(root, '.git'), spec.gitDirAsFile.contents, 'utf-8');
    return;
  }
  const gitDir = join(root, '.git');
  mkdirSync(gitDir, { recursive: true });
  if (spec.head !== undefined) {
    writeFileSync(join(gitDir, 'HEAD'), spec.head, 'utf-8');
  }
  if (spec.config !== undefined) {
    writeFileSync(join(gitDir, 'config'), spec.config, 'utf-8');
  }
  if (spec.branchRefs) {
    const refDir = join(gitDir, 'refs', 'remotes', 'origin');
    mkdirSync(refDir, { recursive: true });
    for (const [branch, sha] of Object.entries(spec.branchRefs)) {
      const refPath = join(refDir, branch);
      mkdirSync(resolve(refPath, '..'), { recursive: true });
      writeFileSync(refPath, sha, 'utf-8');
    }
  }
  if (spec.packedRefs !== undefined) {
    writeFileSync(join(gitDir, 'packed-refs'), spec.packedRefs, 'utf-8');
  }
}

const CANONICAL_HEAD = 'ref: refs/heads/main\n';
const CANONICAL_CONFIG_HTTPS =
  '[remote "origin"]\n\turl = https://github.com/inkeep/open-knowledge.git\n\tfetch = +refs/heads/*:refs/remotes/origin/*\n';

describe('readGitHeadBranch', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'share-git-head-'));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  test('returns branch name for a normal symbolic-ref HEAD', () => {
    seedRepo(dir, { head: CANONICAL_HEAD });
    expect(readGitHeadBranch(dir)).toBe('main');
  });

  test('returns branch name with a slash for nested branches', () => {
    seedRepo(dir, { head: 'ref: refs/heads/feat/sharing-virality-flow\n' });
    expect(readGitHeadBranch(dir)).toBe('feat/sharing-virality-flow');
  });

  test('returns null for a detached HEAD (raw SHA)', () => {
    seedRepo(dir, { head: '0123456789abcdef0123456789abcdef01234567\n' });
    expect(readGitHeadBranch(dir)).toBeNull();
  });

  test('returns null when the project has no .git directory', () => {
    expect(readGitHeadBranch(dir)).toBeNull();
  });

  test('returns null when .git/HEAD is missing', () => {
    mkdirSync(join(dir, '.git'), { recursive: true });
    expect(readGitHeadBranch(dir)).toBeNull();
  });

  test('reads through a worktree pointer file', () => {
    const realGitDir = mkdtempSync(join(tmpdir(), 'share-git-real-'));
    writeFileSync(join(realGitDir, 'HEAD'), 'ref: refs/heads/feature-x\n', 'utf-8');
    seedRepo(dir, { gitDirAsFile: { contents: `gitdir: ${realGitDir}\n` } });
    expect(readGitHeadBranch(dir)).toBe('feature-x');
    rmSync(realGitDir, { recursive: true, force: true });
  });

  test('returns null when .git is an unreadable file (malformed worktree pointer)', () => {
    seedRepo(dir, { gitDirAsFile: { contents: 'not a worktree pointer\n' } });
    expect(readGitHeadBranch(dir)).toBeNull();
  });
});

describe('readOriginGitHubRepo', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'share-git-origin-'));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  test('parses HTTPS github.com origin URL', () => {
    seedRepo(dir, { config: CANONICAL_CONFIG_HTTPS });
    expect(readOriginGitHubRepo(dir)).toEqual({
      kind: 'ok',
      owner: 'inkeep',
      repo: 'open-knowledge',
    });
  });

  test('parses SSH SCP-style github.com origin URL', () => {
    seedRepo(dir, {
      config: '[remote "origin"]\n\turl = git@github.com:inkeep/open-knowledge.git\n',
    });
    expect(readOriginGitHubRepo(dir)).toEqual({
      kind: 'ok',
      owner: 'inkeep',
      repo: 'open-knowledge',
    });
  });

  test('parses ssh:// github.com origin URL', () => {
    seedRepo(dir, {
      config: '[remote "origin"]\n\turl = ssh://git@github.com/inkeep/open-knowledge.git\n',
    });
    expect(readOriginGitHubRepo(dir)).toEqual({
      kind: 'ok',
      owner: 'inkeep',
      repo: 'open-knowledge',
    });
  });

  test('returns ok when repo URL omits the .git suffix', () => {
    seedRepo(dir, {
      config: '[remote "origin"]\n\turl = https://github.com/inkeep/open-knowledge\n',
    });
    expect(readOriginGitHubRepo(dir)).toEqual({
      kind: 'ok',
      owner: 'inkeep',
      repo: 'open-knowledge',
    });
  });

  test('returns non-github for gitlab origin URL', () => {
    seedRepo(dir, {
      config: '[remote "origin"]\n\turl = git@gitlab.com:inkeep/open-knowledge.git\n',
    });
    expect(readOriginGitHubRepo(dir)).toEqual({ kind: 'non-github' });
  });

  test('returns non-github for HTTPS gitlab URL', () => {
    seedRepo(dir, {
      config: '[remote "origin"]\n\turl = https://gitlab.example.com/inkeep/open-knowledge.git\n',
    });
    expect(readOriginGitHubRepo(dir)).toEqual({ kind: 'non-github' });
  });

  test('returns no-remote when [remote "origin"] section is absent', () => {
    seedRepo(dir, { config: '[core]\n\trepositoryformatversion = 0\n' });
    expect(readOriginGitHubRepo(dir)).toEqual({ kind: 'no-remote' });
  });

  test('returns no-remote when origin section exists but has no url', () => {
    seedRepo(dir, { config: '[remote "origin"]\n\tfetch = +refs/heads/*:refs/remotes/origin/*\n' });
    expect(readOriginGitHubRepo(dir)).toEqual({ kind: 'no-remote' });
  });

  test('returns no-remote when .git/config is missing', () => {
    mkdirSync(join(dir, '.git'), { recursive: true });
    expect(readOriginGitHubRepo(dir)).toEqual({ kind: 'no-remote' });
  });

  test('returns no-remote when the project has no .git at all', () => {
    expect(readOriginGitHubRepo(dir)).toEqual({ kind: 'no-remote' });
  });

  test('treats unparseable origin url as non-github (defensive — origin field present but malformed)', () => {
    seedRepo(dir, { config: '[remote "origin"]\n\turl = totally-bogus\n' });
    expect(readOriginGitHubRepo(dir)).toEqual({ kind: 'non-github' });
  });

  test('uses the first url= line and ignores subsequent ones', () => {
    seedRepo(dir, {
      config:
        '[remote "origin"]\n\turl = https://github.com/inkeep/open-knowledge.git\n\turl = https://gitlab.com/x/y.git\n',
    });
    expect(readOriginGitHubRepo(dir)).toEqual({
      kind: 'ok',
      owner: 'inkeep',
      repo: 'open-knowledge',
    });
  });

  test('ignores url lines from other remote sections', () => {
    seedRepo(dir, {
      config:
        '[remote "upstream"]\n\turl = https://github.com/upstream/foo.git\n[remote "origin"]\n\turl = https://github.com/inkeep/open-knowledge.git\n',
    });
    expect(readOriginGitHubRepo(dir)).toEqual({
      kind: 'ok',
      owner: 'inkeep',
      repo: 'open-knowledge',
    });
  });
});

describe('branchExistsOnOrigin', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'share-git-branch-'));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  test('returns true when a loose ref exists', () => {
    seedRepo(dir, { branchRefs: { main: 'abc123\n' } });
    expect(branchExistsOnOrigin(dir, 'main')).toBe(true);
  });

  test('returns false when no ref file exists', () => {
    seedRepo(dir, { branchRefs: { main: 'abc123\n' } });
    expect(branchExistsOnOrigin(dir, 'feature-x')).toBe(false);
  });

  test('returns true for a packed-refs entry', () => {
    seedRepo(dir, {
      packedRefs:
        '# pack-refs with: peeled fully-peeled sorted\nabc123 refs/remotes/origin/main\ndef456 refs/remotes/origin/develop\n',
    });
    expect(branchExistsOnOrigin(dir, 'develop')).toBe(true);
  });

  test('returns false for an absent packed-refs entry', () => {
    seedRepo(dir, {
      packedRefs: '# pack-refs with: peeled fully-peeled sorted\nabc123 refs/remotes/origin/main\n',
    });
    expect(branchExistsOnOrigin(dir, 'feature-x')).toBe(false);
  });

  test('returns true when the branch is loose AND packed (loose wins)', () => {
    seedRepo(dir, {
      branchRefs: { main: 'abc123\n' },
      packedRefs: '# pack-refs with: peeled fully-peeled sorted\ndef456 refs/remotes/origin/main\n',
    });
    expect(branchExistsOnOrigin(dir, 'main')).toBe(true);
  });

  test('returns false when no .git at all', () => {
    expect(branchExistsOnOrigin(dir, 'main')).toBe(false);
  });

  test('handles branches with slashes in loose-ref form', () => {
    seedRepo(dir, { branchRefs: { 'feat/sharing': 'abc\n' } });
    expect(branchExistsOnOrigin(dir, 'feat/sharing')).toBe(true);
  });

  test('handles branches with slashes via packed-refs', () => {
    seedRepo(dir, {
      packedRefs: 'abc123 refs/remotes/origin/feat/sharing-virality-flow\n',
    });
    expect(branchExistsOnOrigin(dir, 'feat/sharing-virality-flow')).toBe(true);
  });
});
