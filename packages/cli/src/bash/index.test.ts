import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  cat,
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

  describe('cat (direct fs)', () => {
    it('reads file contents relative to projectDir', async () => {
      const content = await cat('file.txt');
      expect(content).toBe('hello\nworld\n');
    });

    it('throws for missing file', async () => {
      await expect(cat('missing.txt')).rejects.toThrow();
    });

    it('rejects paths that escape projectDir', async () => {
      await expect(cat('../outside.txt')).rejects.toThrow(/outside project root/);
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
