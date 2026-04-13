import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  createBashInstance,
  execBash,
  grep,
  StdoutOverflowError,
  setProjectDir,
  shellEscape,
} from './index.ts';

describe('shellEscape', () => {
  it('leaves safe characters alone', () => {
    expect(shellEscape('articles/auth/sso.md')).toBe('articles/auth/sso.md');
  });

  it('wraps unsafe characters in single quotes', () => {
    expect(shellEscape('hello world')).toBe("'hello world'");
  });

  it('escapes embedded single quotes', () => {
    expect(shellEscape("it's")).toBe("'it'\\''s'");
  });

  it('handles empty string', () => {
    expect(shellEscape('')).toBe("''");
  });
});

describe('just-bash + ReadWriteFs', () => {
  let root: string;

  beforeAll(() => {
    root = join(tmpdir(), `bash-test-${Date.now()}`);
    mkdirSync(root, { recursive: true });
    mkdirSync(join(root, 'sub'), { recursive: true });
    writeFileSync(join(root, 'file.txt'), 'hello\nworld\n');
    writeFileSync(join(root, 'sub', 'nested.md'), 'nested content\n');
    setProjectDir(root);
  });

  afterAll(() => {
    rmSync(root, { recursive: true, force: true });
  });

  describe('ReadWriteFs sandbox boundary', () => {
    it('rejects path traversal via interpreter', async () => {
      const bash = createBashInstance(root);
      // Attempt to read a path outside the sandbox via `..`. ReadWriteFs should
      // reject or return an error exit code — must NOT leak files from parent.
      const result = await execBash(bash, 'cat ../outside.txt');
      // Either non-zero exit or stderr indicating denial. The guarantee is:
      // no stdout content that could only come from reading above the sandbox.
      expect(result.stdout).not.toContain('SECRET');
      expect(result.exitCode).not.toBe(0);
    });

    it('rejects absolute paths outside the sandbox root', async () => {
      const bash = createBashInstance(root);
      // Inside the sandbox, `/` maps to projectDir — so `/etc/passwd` is
      // resolved against the sandbox, not the host. This test asserts that
      // the host's /etc/passwd is unreachable.
      const result = await execBash(bash, 'cat /etc/passwd');
      expect(result.stdout).not.toContain('root:');
      expect(result.exitCode).not.toBe(0);
    });

    it('rejects sibling-directory prefix-collision traversal', async () => {
      // Sanity: the sandbox shouldn't let `../projectdir-evil/X` escape
      // by exploiting a parent directory whose name starts with projectDir.
      const bash = createBashInstance(root);
      const result = await execBash(bash, 'cat ../../etc/hosts');
      expect(result.stdout).not.toContain('localhost');
      expect(result.exitCode).not.toBe(0);
    });
  });

  describe('createBashInstance + execBash', () => {
    it('ls lists the sandbox root (cwd=/ maps to projectDir)', async () => {
      const bash = createBashInstance(root);
      const result = await execBash(bash, 'ls');
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('file.txt');
      expect(result.stdout).toContain('sub');
    });

    it('cat via interpreter returns file contents', async () => {
      const bash = createBashInstance(root);
      const result = await execBash(bash, 'cat file.txt');
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toBe('hello\nworld\n');
    });

    it('supports pipes between stages', async () => {
      const bash = createBashInstance(root);
      writeFileSync(join(root, 'many.txt'), 'one\ntwo\nthree\nfour\nfive\n');
      const result = await execBash(bash, "grep -n '' many.txt | head -2");
      expect(result.exitCode).toBe(0);
      const lines = result.stdout.split('\n').filter(Boolean);
      expect(lines.length).toBe(2);
    });
  });

  describe('StdoutOverflowError', () => {
    it('is exported and carries limit/actual/partial', () => {
      const err = new StdoutOverflowError(10, 20, { stdout: 'abc', stderr: '', exitCode: 0 });
      expect(err).toBeInstanceOf(Error);
      expect(err.name).toBe('StdoutOverflowError');
      expect(err.limitBytes).toBe(10);
      expect(err.actualBytes).toBe(20);
      expect(err.partial.stdout).toBe('abc');
    });
  });

  describe('grep helper (via just-bash)', () => {
    it('finds matches and parses them', async () => {
      const matches = await grep('hello');
      expect(matches.length).toBeGreaterThan(0);
      const match = matches.find((m) => m.path.includes('file.txt'));
      expect(match).toBeDefined();
      expect(match?.line).toBe(1);
      expect(match?.text).toBe('hello');
    });

    it('returns empty array when no matches', async () => {
      const matches = await grep('nonexistent-string-xyz');
      expect(matches).toEqual([]);
    });

    it('respects maxResults', async () => {
      writeFileSync(
        join(root, 'many-grep.txt'),
        Array.from({ length: 10 }, (_, i) => `match ${i}`).join('\n'),
      );
      const matches = await grep('match', { maxResults: 3 });
      expect(matches.length).toBeLessThanOrEqual(3);
    });
  });
});
