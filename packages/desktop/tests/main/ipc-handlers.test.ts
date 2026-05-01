
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  detectProtocol,
  isPathWithinProject,
  recordHandoff,
  STATS_FILE_RELATIVE_PATH,
  showItemInFolder,
  spawnCursor,
  validateSpawnPath,
} from '../../src/main/ipc-handlers.ts';
import type { HandoffStatsLine } from '../../src/shared/ipc-channels.ts';

describe('detectProtocol', () => {
  test('returns installed:true with displayName on macOS happy path', async () => {
    const result = await detectProtocol(
      {
        platform: 'darwin',
        getApplicationInfoForProtocol: async (url) => {
          expect(url).toBe('claude://');
          return { name: 'Claude', path: '/Applications/Claude.app' };
        },
      },
      'claude',
    );
    expect(result).toEqual({ installed: true, displayName: 'Claude' });
  });

  test('returns installed:true on Windows happy path', async () => {
    const result = await detectProtocol(
      {
        platform: 'win32',
        getApplicationInfoForProtocol: async () => ({
          name: 'Codex',
          path: 'C:\\Program Files\\Codex\\codex.exe',
        }),
      },
      'codex',
    );
    expect(result).toEqual({ installed: true, displayName: 'Codex' });
  });

  test('returns installed:false when Electron rejects (no handler registered)', async () => {
    const result = await detectProtocol(
      {
        platform: 'darwin',
        getApplicationInfoForProtocol: async () => {
          throw new Error('no handler');
        },
      },
      'codex',
    );
    expect(result).toEqual({ installed: false });
  });

  test('returns installed:false on Windows when handler returns empty', async () => {
    const result = await detectProtocol(
      {
        platform: 'win32',
        getApplicationInfoForProtocol: async () => ({ name: '', path: '' }),
      },
      'codex',
    );
    expect(result).toEqual({ installed: false });
  });

  test('returns installed:false on timeout', async () => {
    const result = await detectProtocol(
      {
        platform: 'darwin',
        getApplicationInfoForProtocol: () => new Promise(() => {}),
        timeoutMs: 20,
      },
      'claude',
    );
    expect(result).toEqual({ installed: false });
  });

  test('Linux path calls xdg-mime runner and returns installed:true on non-empty stdout', async () => {
    let calledScheme: string | null = null;
    const result = await detectProtocol(
      {
        platform: 'linux',
        getApplicationInfoForProtocol: async () => {
          throw new Error('should not be called on linux');
        },
        runXdgMime: async (scheme) => {
          calledScheme = scheme;
          return { stdout: 'anthropic-claude.desktop\n', code: 0 };
        },
      },
      'claude',
    );
    expect(calledScheme).toBe('claude');
    expect(result).toEqual({ installed: true });
  });

  test('Linux path returns installed:false on empty xdg-mime stdout', async () => {
    const result = await detectProtocol(
      {
        platform: 'linux',
        getApplicationInfoForProtocol: async () => {
          throw new Error('unused');
        },
        runXdgMime: async () => ({ stdout: '', code: 0 }),
      },
      'cursor',
    );
    expect(result).toEqual({ installed: false });
  });

  test('Linux path returns installed:false when xdg-mime runner throws', async () => {
    const result = await detectProtocol(
      {
        platform: 'linux',
        getApplicationInfoForProtocol: async () => {
          throw new Error('unused');
        },
        runXdgMime: async () => {
          throw new Error('xdg-mime not installed');
        },
      },
      'cursor',
    );
    expect(result).toEqual({ installed: false });
  });

  test('rejects malformed scheme strings (shell-injection guard)', async () => {
    let called = 0;
    const deps = {
      platform: 'linux' as const,
      getApplicationInfoForProtocol: async () => {
        called++;
        return { name: '', path: '' };
      },
      runXdgMime: async () => {
        called++;
        return { stdout: '', code: 0 };
      },
    };
    for (const bad of ['', '$(touch pwned)', 'claude;rm', 'hello world', '../etc/passwd']) {
      const result = await detectProtocol(deps, bad);
      expect(result).toEqual({ installed: false });
    }
    expect(called).toBe(0);
  });
});

describe('validateSpawnPath', () => {
  test('accepts absolute POSIX paths', () => {
    expect(validateSpawnPath('/Users/x/project', 'darwin')).toBe(true);
    expect(validateSpawnPath('/home/x/project', 'linux')).toBe(true);
  });

  test('accepts absolute Windows paths', () => {
    expect(validateSpawnPath('C:\\Users\\x\\project', 'win32')).toBe(true);
    expect(validateSpawnPath('C:/Users/x/project', 'win32')).toBe(true);
    expect(validateSpawnPath('\\\\server\\share\\project', 'win32')).toBe(true);
  });

  test('rejects empty string', () => {
    expect(validateSpawnPath('', 'darwin')).toBe(false);
  });

  test('rejects null-byte paths', () => {
    expect(validateSpawnPath('/etc/passwd\0.md', 'linux')).toBe(false);
  });

  test('rejects relative paths', () => {
    expect(validateSpawnPath('./project', 'darwin')).toBe(false);
    expect(validateSpawnPath('project', 'linux')).toBe(false);
    expect(validateSpawnPath('project\\sub', 'win32')).toBe(false);
  });

  test('rejects POSIX-absolute on Windows (not drive-letter)', () => {
    expect(validateSpawnPath('/Users/x', 'win32')).toBe(false);
  });
});

describe('isPathWithinProject — Review M5 confined-path check', () => {
  test('accepts identical paths (projectPath == userPath)', () => {
    expect(isPathWithinProject('/Users/x/project', '/Users/x/project', 'darwin')).toBe(true);
  });

  test('accepts sub-paths strictly under projectPath', () => {
    expect(isPathWithinProject('/Users/x/project/specs/foo', '/Users/x/project', 'darwin')).toBe(
      true,
    );
  });

  test('rejects sibling paths (sharing common parent but not under project)', () => {
    expect(isPathWithinProject('/Users/x/project-other', '/Users/x/project', 'darwin')).toBe(false);
  });

  test('rejects parent-traversal escape (..)', () => {
    expect(isPathWithinProject('/Users/x/other', '/Users/x/project', 'darwin')).toBe(false);
    expect(isPathWithinProject('/etc/passwd', '/Users/x/project', 'linux')).toBe(false);
  });

  test('rejects when userPath is the home dir (a compromised renderer could name .ssh)', () => {
    expect(isPathWithinProject('/Users/x/.ssh', '/Users/x/project', 'darwin')).toBe(false);
  });

  test('rejects when either path is invalid (relative / empty / null-byte)', () => {
    expect(isPathWithinProject('relative', '/Users/x/project', 'darwin')).toBe(false);
    expect(isPathWithinProject('/Users/x/project/sub', '', 'darwin')).toBe(false);
    expect(isPathWithinProject('/Users/x\0', '/Users/x/project', 'darwin')).toBe(false);
  });

  test('Windows: rejects cross-drive paths', () => {
    expect(isPathWithinProject('D:\\other', 'C:\\Users\\x\\project', 'win32')).toBe(false);
  });

  test('Windows: accepts same-drive subpaths', () => {
    expect(
      isPathWithinProject('C:\\Users\\x\\project\\specs', 'C:\\Users\\x\\project', 'win32'),
    ).toBe(true);
  });

  describe('lexical-only symlink contract', () => {
    let root: string;

    beforeAll(() => {
      root = mkdtempSync(join(tmpdir(), 'ok-pathcheck-symlink-'));
      mkdirSync(join(root, 'proj'), { recursive: true });
      mkdirSync(join(root, 'outside'), { recursive: true });
      writeFileSync(join(root, 'outside', 'secret.md'), 'OUT-OF-PROJECT TARGET');
      symlinkSync(join(root, 'outside', 'secret.md'), join(root, 'proj', 'link.md'));
    });

    afterAll(() => {
      rmSync(root, { recursive: true, force: true });
    });

    test('allows symlinked path inside project (lexical-only contract)', () => {
      const lexicalIn = join(root, 'proj', 'link.md');
      expect(isPathWithinProject(lexicalIn, join(root, 'proj'), process.platform)).toBe(true);
    });
  });
});

describe('spawnCursor', () => {
  test('rejects invalid path without calling resolve / spawn', async () => {
    let resolveCalls = 0;
    let spawnCalls = 0;
    const result = await spawnCursor(
      {
        platform: 'darwin',
        getApplicationInfoForProtocol: async () => {
          resolveCalls++;
          return { name: '', path: '' };
        },
        resolveCursorBinary: async () => {
          resolveCalls++;
          return null;
        },
        spawn: async () => {
          spawnCalls++;
          return { ok: true };
        },
      },
      './relative',
    );
    expect(result).toEqual({ ok: false, reason: 'invalid-path' });
    expect(resolveCalls).toBe(0);
    expect(spawnCalls).toBe(0);
  });

  test('rejects out-of-scope path when projectPath is bound (Review M5)', async () => {
    let resolveCalls = 0;
    let spawnCalls = 0;
    const result = await spawnCursor(
      {
        platform: 'darwin',
        projectPath: '/Users/x/project',
        getApplicationInfoForProtocol: async () => {
          resolveCalls++;
          return { name: 'Cursor', path: '/Applications/Cursor.app' };
        },
        resolveCursorBinary: async () => {
          resolveCalls++;
          return '/usr/local/bin/cursor';
        },
        spawn: async () => {
          spawnCalls++;
          return { ok: true };
        },
      },
      '/Users/x/.ssh',
    );
    expect(result).toEqual({ ok: false, reason: 'invalid-path' });
    expect(resolveCalls).toBe(0);
    expect(spawnCalls).toBe(0);
  });

  test('accepts in-scope subpath when projectPath is bound', async () => {
    let spawnedArgs: ReadonlyArray<string> | null = null;
    const result = await spawnCursor(
      {
        platform: 'darwin',
        projectPath: '/Users/x/project',
        getApplicationInfoForProtocol: async () => ({
          name: 'Cursor',
          path: '/Applications/Cursor.app/Contents/MacOS/Cursor',
        }),
        spawn: async (_exec, args) => {
          spawnedArgs = args;
          return { ok: true };
        },
      },
      '/Users/x/project',
    );
    expect(result).toEqual({ ok: true });
    expect(spawnedArgs).toEqual(['/Users/x/project']);
  });

  test('skips scope check when projectPath is not supplied (e.g. Navigator-invoked)', async () => {
    let spawnCalled = false;
    const result = await spawnCursor(
      {
        platform: 'darwin',
        getApplicationInfoForProtocol: async () => ({
          name: 'Cursor',
          path: '/Applications/Cursor.app/Contents/MacOS/Cursor',
        }),
        spawn: async () => {
          spawnCalled = true;
          return { ok: true };
        },
      },
      '/Users/x/any-path',
    );
    expect(result).toEqual({ ok: true });
    expect(spawnCalled).toBe(true);
  });

  test('uses Electron-resolved path first (never trusts $PATH on its own)', async () => {
    let spawnedExec: string | null = null;
    let spawnedArgs: ReadonlyArray<string> | null = null;
    const result = await spawnCursor(
      {
        platform: 'darwin',
        getApplicationInfoForProtocol: async () => ({
          name: 'Cursor',
          path: '/Applications/Cursor.app/Contents/MacOS/Cursor',
        }),
        resolveCursorBinary: async () => {
          throw new Error('fallback must not run when Electron succeeds');
        },
        spawn: async (exec, args) => {
          spawnedExec = exec;
          spawnedArgs = args;
          return { ok: true };
        },
      },
      '/Users/x/project',
    );
    expect(result).toEqual({ ok: true });
    expect(spawnedExec).toBe('/Applications/Cursor.app/Contents/MacOS/Cursor');
    expect(spawnedArgs).toEqual(['/Users/x/project']);
  });

  test('darwin bundle path is routed through `/usr/bin/open -a <bundle>` (spawn cannot exec a .app directory)', async () => {
    let spawnedExec: string | null = null;
    let spawnedArgs: ReadonlyArray<string> | null = null;
    const result = await spawnCursor(
      {
        platform: 'darwin',
        getApplicationInfoForProtocol: async () => ({
          name: 'Cursor',
          path: '/Applications/Cursor.app',
        }),
        spawn: async (exec, args) => {
          spawnedExec = exec;
          spawnedArgs = args;
          return { ok: true };
        },
      },
      '/Users/x/project',
    );
    expect(result).toEqual({ ok: true });
    expect(spawnedExec).toBe('/usr/bin/open');
    expect(spawnedArgs).toEqual(['-a', '/Applications/Cursor.app', '/Users/x/project']);
  });

  test('darwin bundle path with trailing slash is normalized before routing through `open -a`', async () => {
    let spawnedArgs: ReadonlyArray<string> | null = null;
    await spawnCursor(
      {
        platform: 'darwin',
        getApplicationInfoForProtocol: async () => ({
          name: 'Cursor',
          path: '/Applications/Cursor.app/',
        }),
        spawn: async (_exec, args) => {
          spawnedArgs = args;
          return { ok: true };
        },
      },
      '/Users/x/project',
    );
    expect(spawnedArgs).toEqual(['-a', '/Applications/Cursor.app', '/Users/x/project']);
  });

  test('falls back to resolveCursorBinary when Electron throws', async () => {
    const result = await spawnCursor(
      {
        platform: 'linux',
        getApplicationInfoForProtocol: async () => {
          throw new Error('unsupported on linux');
        },
        resolveCursorBinary: async () => '/usr/local/bin/cursor',
        spawn: async (exec, args) => {
          expect(exec).toBe('/usr/local/bin/cursor');
          expect(args).toEqual(['/home/x/project']);
          return { ok: true };
        },
      },
      '/home/x/project',
    );
    expect(result).toEqual({ ok: true });
  });

  test('returns not-installed when both resolvers fail', async () => {
    const result = await spawnCursor(
      {
        platform: 'linux',
        getApplicationInfoForProtocol: async () => {
          throw new Error('unavailable');
        },
        resolveCursorBinary: async () => null,
        spawn: async () => {
          throw new Error('should not be called');
        },
      },
      '/home/x/project',
    );
    expect(result).toEqual({ ok: false, reason: 'not-installed' });
  });

  test('returns the spawn outcome verbatim when spawn fails', async () => {
    const result = await spawnCursor(
      {
        platform: 'darwin',
        getApplicationInfoForProtocol: async () => ({
          name: 'Cursor',
          path: '/Applications/Cursor.app/Contents/MacOS/Cursor',
        }),
        spawn: async () => ({ ok: false, reason: 'timeout' }),
      },
      '/Users/x/project',
    );
    expect(result).toEqual({ ok: false, reason: 'timeout' });
  });

  test('forwards the spawn timeout dep', async () => {
    let seenTimeout: number | null = null;
    await spawnCursor(
      {
        platform: 'linux',
        getApplicationInfoForProtocol: async () => ({ name: 'C', path: '/c' }),
        spawn: async (_exec, _args, t) => {
          seenTimeout = t;
          return { ok: true };
        },
        spawnTimeoutMs: 1234,
      },
      '/home/x/project',
    );
    expect(seenTimeout).toBe(1234);
  });
});

describe('recordHandoff', () => {
  const makeStubs = () => {
    const calls: { appendFile: Array<{ path: string; content: string }>; mkdir: string[] } = {
      appendFile: [],
      mkdir: [],
    };
    const warnings: string[] = [];
    return {
      calls,
      warnings,
      deps: {
        homedir: () => '/Users/test',
        appendFile: async (path: string, content: string) => {
          calls.appendFile.push({ path, content });
        },
        mkdir: async (path: string) => {
          calls.mkdir.push(path);
        },
        warn: (m: string) => {
          warnings.push(m);
        },
      },
    };
  };

  const sampleLine: HandoffStatsLine = {
    target: 'claude-cowork',
    host: 'electron',
    outcome: 'ok',
    ts: '2026-04-22T01:55:00.000Z',
  };

  test('appends one JSONL line per call (3 calls → 3 lines)', async () => {
    const { calls, deps } = makeStubs();
    await recordHandoff(deps, { ...sampleLine, ts: '2026-04-22T00:00:01.000Z' });
    await recordHandoff(deps, { ...sampleLine, ts: '2026-04-22T00:00:02.000Z' });
    await recordHandoff(deps, { ...sampleLine, ts: '2026-04-22T00:00:03.000Z' });
    expect(calls.appendFile).toHaveLength(3);
    for (const call of calls.appendFile) {
      expect(call.content.endsWith('\n')).toBe(true);
      expect(call.content.split('\n').filter(Boolean)).toHaveLength(1);
    }
    const timestamps = calls.appendFile.map((c) => JSON.parse(c.content).ts as string);
    expect(timestamps).toEqual([
      '2026-04-22T00:00:01.000Z',
      '2026-04-22T00:00:02.000Z',
      '2026-04-22T00:00:03.000Z',
    ]);
  });

  test('writes to ~/.ok/stats.jsonl with mkdir(parent) called first', async () => {
    const { calls, deps } = makeStubs();
    await recordHandoff(deps, sampleLine);
    expect(calls.mkdir).toEqual(['/Users/test/.ok']);
    expect(calls.appendFile).toHaveLength(1);
    expect(calls.appendFile[0]?.path).toBe('/Users/test/.ok/stats.jsonl');
    expect(STATS_FILE_RELATIVE_PATH).toEqual(['.ok', 'stats.jsonl']);
  });

  test('serializes the full schema verbatim including optional reason on errors', async () => {
    const { calls, deps } = makeStubs();
    const errorLine: HandoffStatsLine = {
      target: 'cursor',
      host: 'electron',
      outcome: 'error',
      ts: '2026-04-22T01:55:00.000Z',
      reason: 'not-installed',
    };
    await recordHandoff(deps, errorLine);
    expect(calls.appendFile).toHaveLength(1);
    expect(JSON.parse(calls.appendFile[0]?.content ?? '')).toEqual(errorLine);
  });

  test('HOME unwritable (appendFile throws EACCES) → warn, no throw', async () => {
    const { warnings, deps } = makeStubs();
    const failingDeps = {
      ...deps,
      appendFile: async () => {
        throw Object.assign(new Error('EACCES: permission denied'), { code: 'EACCES' });
      },
    };
    await expect(recordHandoff(failingDeps, sampleLine)).resolves.toBeUndefined();
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain('EACCES');
    expect(warnings[0]).toContain('telemetry skipped');
  });

  test('mkdir throws (e.g., ENOSPC) → warn, no throw, no append attempted', async () => {
    const { calls, warnings, deps } = makeStubs();
    let appendCalled = 0;
    const failingDeps = {
      ...deps,
      mkdir: async () => {
        throw new Error('ENOSPC: no space left on device');
      },
      appendFile: async (path: string, content: string) => {
        appendCalled++;
        calls.appendFile.push({ path, content });
      },
    };
    await expect(recordHandoff(failingDeps, sampleLine)).resolves.toBeUndefined();
    expect(appendCalled).toBe(0);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain('ENOSPC');
  });

  test('mkdir is optional — skipped when dep absent', async () => {
    const calls: Array<{ path: string; content: string }> = [];
    await recordHandoff(
      {
        homedir: () => '/Users/test',
        appendFile: async (path, content) => {
          calls.push({ path, content });
        },
      },
      sampleLine,
    );
    expect(calls).toHaveLength(1);
  });

  test('non-Error thrown values are coerced via String() in the warn message', async () => {
    const { warnings, deps } = makeStubs();
    const failingDeps = {
      ...deps,
      appendFile: async () => {
        throw 'plain-string-failure';
      },
    };
    await expect(recordHandoff(failingDeps, sampleLine)).resolves.toBeUndefined();
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain('plain-string-failure');
  });
});

describe('showItemInFolder', () => {
  test('reveals path within project (POSIX)', () => {
    const calls: string[] = [];
    const result = showItemInFolder(
      {
        platform: 'darwin',
        projectPath: '/Users/me/proj',
        showItemInFolder: (p) => calls.push(p),
      },
      '/Users/me/proj/specs/foo.md',
    );
    expect(result).toEqual({ ok: true });
    expect(calls).toEqual(['/Users/me/proj/specs/foo.md']);
  });

  test('reveals project root itself', () => {
    const calls: string[] = [];
    const result = showItemInFolder(
      {
        platform: 'darwin',
        projectPath: '/Users/me/proj',
        showItemInFolder: (p) => calls.push(p),
      },
      '/Users/me/proj',
    );
    expect(result).toEqual({ ok: true });
    expect(calls).toEqual(['/Users/me/proj']);
  });

  test('refuses path outside project (parent escape) with reason "out-of-project"', () => {
    const calls: string[] = [];
    const result = showItemInFolder(
      {
        platform: 'darwin',
        projectPath: '/Users/me/proj',
        showItemInFolder: (p) => calls.push(p),
      },
      '/Users/me/other/secrets.txt',
    );
    expect(result).toEqual({ ok: false, reason: 'out-of-project' });
    expect(calls).toEqual([]);
  });

  test('refuses non-absolute path with reason "invalid-format"', () => {
    const calls: string[] = [];
    const result = showItemInFolder(
      {
        platform: 'darwin',
        projectPath: '/Users/me/proj',
        showItemInFolder: (p) => calls.push(p),
      },
      'relative/foo.md',
    );
    expect(result).toEqual({ ok: false, reason: 'invalid-format' });
    expect(calls).toEqual([]);
  });

  test('refuses path with null byte (reason "invalid-format")', () => {
    const calls: string[] = [];
    const result = showItemInFolder(
      {
        platform: 'darwin',
        projectPath: '/Users/me/proj',
        showItemInFolder: (p) => calls.push(p),
      },
      '/Users/me/proj/foo\0.md',
    );
    expect(result).toEqual({ ok: false, reason: 'invalid-format' });
    expect(calls).toEqual([]);
  });

  test('refuses every path when projectPath is undefined (Navigator window) with reason "no-project-bound"', () => {
    const calls: string[] = [];
    const result = showItemInFolder(
      {
        platform: 'darwin',
        projectPath: undefined,
        showItemInFolder: (p) => calls.push(p),
      },
      '/Users/me/proj/foo.md',
    );
    expect(result).toEqual({ ok: false, reason: 'no-project-bound' });
    expect(calls).toEqual([]);
  });

  test('Windows: reveals path within project', () => {
    const calls: string[] = [];
    const result = showItemInFolder(
      {
        platform: 'win32',
        projectPath: 'C:\\Users\\me\\proj',
        showItemInFolder: (p) => calls.push(p),
      },
      'C:\\Users\\me\\proj\\specs\\foo.md',
    );
    expect(result).toEqual({ ok: true });
    expect(calls).toEqual(['C:\\Users\\me\\proj\\specs\\foo.md']);
  });

  test('Windows: refuses cross-drive escape with reason "out-of-project"', () => {
    const calls: string[] = [];
    const result = showItemInFolder(
      {
        platform: 'win32',
        projectPath: 'C:\\Users\\me\\proj',
        showItemInFolder: (p) => calls.push(p),
      },
      'D:\\elsewhere\\foo.md',
    );
    expect(result).toEqual({ ok: false, reason: 'out-of-project' });
    expect(calls).toEqual([]);
  });
});
