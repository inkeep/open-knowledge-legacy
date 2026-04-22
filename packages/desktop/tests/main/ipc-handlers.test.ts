/**
 * Unit tests for the pure IPC handler impls used by main/index.ts to wire
 * the `ok:shell:detect-protocol` and `ok:shell:spawn-cursor` channels.
 *
 * The handlers are written as dependency-injected functions so these tests
 * can run under Bun without a real Electron `app` module. Real wiring is
 * smoke-tested by the integration surface (contract-equality + D19 scan).
 */

import { describe, expect, test } from 'bun:test';
import {
  detectProtocol,
  recordHandoff,
  STATS_FILE_RELATIVE_PATH,
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
        // A promise that never resolves — timeout race wins.
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

  test('uses Electron-resolved path first (never trusts $PATH on its own)', async () => {
    let spawnedBinary: string | null = null;
    let spawnedUserPath: string | null = null;
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
        spawn: async (binaryPath, userPath) => {
          spawnedBinary = binaryPath;
          spawnedUserPath = userPath;
          return { ok: true };
        },
      },
      '/Users/x/project',
    );
    expect(result).toEqual({ ok: true });
    expect(spawnedBinary).toBe('/Applications/Cursor.app/Contents/MacOS/Cursor');
    expect(spawnedUserPath).toBe('/Users/x/project');
  });

  test('falls back to resolveCursorBinary when Electron throws', async () => {
    const result = await spawnCursor(
      {
        platform: 'linux',
        getApplicationInfoForProtocol: async () => {
          throw new Error('unsupported on linux');
        },
        resolveCursorBinary: async () => '/usr/local/bin/cursor',
        spawn: async (binaryPath) => {
          expect(binaryPath).toBe('/usr/local/bin/cursor');
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
        platform: 'darwin',
        getApplicationInfoForProtocol: async () => ({ name: 'C', path: '/c' }),
        spawn: async (_b, _u, t) => {
          seenTimeout = t;
          return { ok: true };
        },
        spawnTimeoutMs: 1234,
      },
      '/Users/x/project',
    );
    expect(seenTimeout).toBe(1234);
  });
});

describe('recordHandoff', () => {
  /**
   * Build a fresh in-memory stub that captures appendFile + mkdir calls.
   * Each test gets its own instance — mutations don't leak between tests.
   */
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

  test('writes to ~/.open-knowledge/stats.jsonl with mkdir(parent) called first', async () => {
    const { calls, deps } = makeStubs();
    await recordHandoff(deps, sampleLine);
    expect(calls.mkdir).toEqual(['/Users/test/.open-knowledge']);
    expect(calls.appendFile).toHaveLength(1);
    expect(calls.appendFile[0]?.path).toBe('/Users/test/.open-knowledge/stats.jsonl');
    expect(STATS_FILE_RELATIVE_PATH).toEqual(['.open-knowledge', 'stats.jsonl']);
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
    // Must resolve to undefined — never throw — so dispatch path can continue.
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
        // Intentionally throws a non-Error to exercise the String(err) coercion
        // branch in `recordHandoff`'s catch block.
        throw 'plain-string-failure';
      },
    };
    await expect(recordHandoff(failingDeps, sampleLine)).resolves.toBeUndefined();
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain('plain-string-failure');
  });
});
