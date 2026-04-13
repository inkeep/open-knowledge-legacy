import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { cat, gitLog, grep, setProjectDir, shellEscape } from './index.ts';

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

describe('bash wrapper', () => {
  let root: string;

  beforeAll(() => {
    root = join(tmpdir(), `bash-wrapper-test-${Date.now()}`);
    mkdirSync(root, { recursive: true });
    mkdirSync(join(root, 'sub'), { recursive: true });
    writeFileSync(join(root, 'file.txt'), 'hello\nworld\n');
    writeFileSync(join(root, 'sub', 'nested.md'), 'nested content\n');
    setProjectDir(root);
  });

  afterAll(() => {
    rmSync(root, { recursive: true, force: true });
  });

  describe('cat', () => {
    it('reads file contents relative to projectDir', async () => {
      const content = await cat('file.txt');
      expect(content).toBe('hello\nworld\n');
    });

    it('throws for missing file', async () => {
      await expect(cat('missing.txt')).rejects.toThrow();
    });
  });

  describe('grep', () => {
    it('finds matches and parses them', async () => {
      const matches = await grep('hello');
      expect(matches.length).toBeGreaterThan(0);
      const fileMatch = matches.find((m) => m.path.includes('file.txt'));
      expect(fileMatch).toBeDefined();
      expect(fileMatch?.line).toBe(1);
      expect(fileMatch?.text).toBe('hello');
    });

    it('returns empty array when no matches', async () => {
      const matches = await grep('nonexistent-string-xyz');
      expect(matches).toEqual([]);
    });

    it('respects maxResults', async () => {
      writeFileSync(
        join(root, 'many.txt'),
        Array.from({ length: 10 }, (_, i) => `match ${i}`).join('\n'),
      );
      const matches = await grep('match', { maxResults: 3 });
      expect(matches.length).toBeLessThanOrEqual(3);
    });

    it('respects exclude patterns', async () => {
      mkdirSync(join(root, 'excluded'), { recursive: true });
      writeFileSync(join(root, 'excluded', 'hidden.txt'), 'should-not-match\n');
      writeFileSync(join(root, 'visible.txt'), 'should-not-match\n');
      const matches = await grep('should-not-match', { exclude: ['excluded'] });
      expect(matches.some((m) => m.path.includes('visible.txt'))).toBe(true);
      expect(matches.some((m) => m.path.includes('excluded'))).toBe(false);
    });
  });

  describe('gitLog', () => {
    it('returns empty array when not a git repo', async () => {
      // tmpdir is not a git repo
      const entries = await gitLog('file.txt', 5);
      expect(entries).toEqual([]);
    });
  });
});

describe('gitLog in a real git repo', () => {
  let root: string;

  beforeAll(async () => {
    root = join(tmpdir(), `bash-git-test-${Date.now()}`);
    mkdirSync(root, { recursive: true });
    writeFileSync(join(root, 'tracked.md'), 'v1\n');
    setProjectDir(root);
    // Minimal git repo so we get a real commit to parse.
    const { execFile } = await import('node:child_process');
    const { promisify } = await import('node:util');
    const exec = promisify(execFile);
    await exec('git', ['init', '--quiet'], { cwd: root });
    await exec('git', ['config', 'user.email', 'test@example.invalid'], { cwd: root });
    await exec('git', ['config', 'user.name', 'Test'], { cwd: root });
    await exec('git', ['config', 'commit.gpgsign', 'false'], { cwd: root });
    await exec('git', ['add', 'tracked.md'], { cwd: root });
    await exec('git', ['commit', '--quiet', '-m', 'initial commit'], { cwd: root });
  });

  afterAll(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it('parses git log output into entries', async () => {
    const entries = await gitLog('tracked.md', 5);
    expect(entries.length).toBe(1);
    const entry = entries[0];
    expect(entry).toBeDefined();
    expect(entry?.hash).toMatch(/^[0-9a-f]{7,}$/);
    expect(entry?.date).toMatch(/^\d{4}-\d{2}-\d{2}/);
    expect(entry?.subject).toBe('initial commit');
  });
});
