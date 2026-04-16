import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import type { ServerLockMetadata } from '@inkeep/open-knowledge-server';
import { type AutoStartDecision, decideAutoStart, ensureServerRunning } from './mcp.ts';

const aliveLock: ServerLockMetadata = {
  pid: 4242,
  hostname: 'test-host',
  port: 5173,
  startedAt: '2026-04-16T10:00:00Z',
  worktreeRoot: '/tmp/test',
};

const bootingLock: ServerLockMetadata = { ...aliveLock, port: 0 };

describe('decideAutoStart', () => {
  test('--port override with positive integer → connect', () => {
    const result = decideAutoStart({
      host: 'localhost',
      portOverride: '9999',
      envAutoStart: undefined,
      configAutoStart: true,
      readLock: () => null,
      isAlive: () => false,
    });
    expect(result).toEqual<AutoStartDecision>({
      action: 'connect',
      url: 'ws://localhost:9999',
      message: 'using --port override, connecting to ws://localhost:9999',
    });
  });

  test('--port=0 override → disk-only regardless of lock', () => {
    const result = decideAutoStart({
      host: 'localhost',
      portOverride: '0',
      envAutoStart: undefined,
      configAutoStart: true,
      readLock: () => aliveLock,
      isAlive: () => true,
    });
    expect(result.action).toBe('disk-only');
    expect(result.message).toContain('disk-only');
  });

  test('--port with non-numeric value → disk-only with invalid message', () => {
    const result = decideAutoStart({
      host: 'localhost',
      portOverride: 'abc',
      envAutoStart: undefined,
      configAutoStart: true,
      readLock: () => null,
      isAlive: () => false,
    });
    expect(result.action).toBe('disk-only');
    expect(result.message).toContain('invalid');
    expect(result.message).toContain('abc');
  });

  test('--port override uses provided host', () => {
    const result = decideAutoStart({
      host: '0.0.0.0',
      portOverride: '4444',
      envAutoStart: undefined,
      configAutoStart: true,
      readLock: () => null,
      isAlive: () => false,
    });
    expect(result.action).toBe('connect');
    if (result.action === 'connect') expect(result.url).toBe('ws://0.0.0.0:4444');
  });

  test('live lock with port > 0 → connect (no spawn)', () => {
    const result = decideAutoStart({
      host: 'localhost',
      portOverride: undefined,
      envAutoStart: undefined,
      configAutoStart: true,
      readLock: () => aliveLock,
      isAlive: (pid) => pid === aliveLock.pid,
    });
    expect(result).toMatchObject({
      action: 'connect',
      url: `ws://localhost:${aliveLock.port}`,
    });
  });

  test('live lock wins over opt-out (running server is resumable regardless)', () => {
    const result = decideAutoStart({
      host: 'localhost',
      portOverride: undefined,
      envAutoStart: '0',
      configAutoStart: false,
      readLock: () => aliveLock,
      isAlive: () => true,
    });
    expect(result.action).toBe('connect');
  });

  test('no lock + opt-out via env → disk-only', () => {
    const result = decideAutoStart({
      host: 'localhost',
      portOverride: undefined,
      envAutoStart: '0',
      configAutoStart: true,
      readLock: () => null,
      isAlive: () => false,
    });
    expect(result.action).toBe('disk-only');
    expect(result.message).toContain('OK_MCP_AUTOSTART=0');
  });

  test('no lock + opt-out via config → disk-only', () => {
    const result = decideAutoStart({
      host: 'localhost',
      portOverride: undefined,
      envAutoStart: undefined,
      configAutoStart: false,
      readLock: () => null,
      isAlive: () => false,
    });
    expect(result.action).toBe('disk-only');
    expect(result.message).toContain('config.mcp.autoStart=false');
  });

  test('env precedence — env=0 disables even when config=true', () => {
    const result = decideAutoStart({
      host: 'localhost',
      portOverride: undefined,
      envAutoStart: '0',
      configAutoStart: true,
      readLock: () => null,
      isAlive: () => false,
    });
    expect(result.action).toBe('disk-only');
    expect(result.message).toContain('OK_MCP_AUTOSTART=0');
  });

  test('env precedence — env unset defers to config', () => {
    const result = decideAutoStart({
      host: 'localhost',
      portOverride: undefined,
      envAutoStart: undefined,
      configAutoStart: false,
      readLock: () => null,
      isAlive: () => false,
    });
    expect(result.action).toBe('disk-only');
    expect(result.message).toContain('config.mcp.autoStart');
  });

  test('no lock + no opt-out → spawn', () => {
    const result = decideAutoStart({
      host: 'localhost',
      portOverride: undefined,
      envAutoStart: undefined,
      configAutoStart: true,
      readLock: () => null,
      isAlive: () => false,
    });
    expect(result.action).toBe('spawn');
  });

  test('lock with port=0 (still booting) → spawn when no opt-out', () => {
    const result = decideAutoStart({
      host: 'localhost',
      portOverride: undefined,
      envAutoStart: undefined,
      configAutoStart: true,
      readLock: () => bootingLock,
      isAlive: () => true,
    });
    expect(result.action).toBe('spawn');
    expect(result.message).toContain('port=0');
  });

  test('lock with dead pid → spawn (readLock side effect would null-out in prod)', () => {
    const result = decideAutoStart({
      host: 'localhost',
      portOverride: undefined,
      envAutoStart: undefined,
      configAutoStart: true,
      readLock: () => aliveLock,
      isAlive: () => false,
    });
    expect(result.action).toBe('spawn');
  });
});

describe('ensureServerRunning', () => {
  let tmpDir: string;
  let lockDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(resolve(tmpdir(), 'ok-mcp-ensure-'));
    lockDir = resolve(tmpDir, '.open-knowledge');
  });
  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  type SpawnCall = {
    cmd: string;
    args: readonly string[];
    opts: {
      detached?: boolean;
      stdio?: readonly unknown[];
      cwd?: string;
    };
  };

  function makeMockSpawn(calls: SpawnCall[]): never {
    // Typed as never so callers can drop it into the opts.spawn slot without
    // fighting the full ChildProcess return-type tree in tests.
    return ((cmd: string, args: readonly string[], opts: unknown) => {
      calls.push({
        cmd,
        args,
        opts: opts as SpawnCall['opts'],
      });
      return {
        unref: () => {},
        on: () => {},
        kill: () => {},
      };
    }) as never;
  }

  test('connect fast-path — does not spawn when live lock present', async () => {
    const calls: SpawnCall[] = [];
    const result = await ensureServerRunning({
      lockDir,
      contentDir: tmpDir,
      host: 'localhost',
      portOverride: undefined,
      envAutoStart: undefined,
      configAutoStart: true,
      readLock: () => aliveLock,
      isAlive: () => true,
      spawn: makeMockSpawn(calls),
    });
    expect(result.serverUrl).toBe(`ws://localhost:${aliveLock.port}`);
    expect(calls.length).toBe(0);
  });

  test('disk-only — OK_MCP_AUTOSTART=0 does not spawn', async () => {
    const calls: SpawnCall[] = [];
    const result = await ensureServerRunning({
      lockDir,
      contentDir: tmpDir,
      host: 'localhost',
      portOverride: undefined,
      envAutoStart: '0',
      configAutoStart: true,
      readLock: () => null,
      isAlive: () => false,
      spawn: makeMockSpawn(calls),
    });
    expect(result.serverUrl).toBeUndefined();
    expect(calls.length).toBe(0);
  });

  test('disk-only — config.mcp.autoStart=false does not spawn', async () => {
    const calls: SpawnCall[] = [];
    const result = await ensureServerRunning({
      lockDir,
      contentDir: tmpDir,
      host: 'localhost',
      portOverride: undefined,
      envAutoStart: undefined,
      configAutoStart: false,
      readLock: () => null,
      isAlive: () => false,
      spawn: makeMockSpawn(calls),
    });
    expect(result.serverUrl).toBeUndefined();
    expect(calls.length).toBe(0);
  });

  test('spawn success — poll eventually sees port > 0', async () => {
    const calls: SpawnCall[] = [];
    let pollCount = 0;
    const result = await ensureServerRunning({
      lockDir,
      contentDir: tmpDir,
      host: 'localhost',
      portOverride: undefined,
      envAutoStart: undefined,
      configAutoStart: true,
      readLock: () => {
        pollCount++;
        if (pollCount < 3) return null;
        return aliveLock;
      },
      isAlive: () => true,
      sleep: async () => {},
      spawn: makeMockSpawn(calls),
      pollIntervalMs: 1,
      timeoutMs: 1000,
    });
    expect(result.serverUrl).toBe(`ws://localhost:${aliveLock.port}`);
    expect(calls.length).toBe(1);
    expect(calls[0]?.cmd).toBe('npx');
    expect(calls[0]?.args).toEqual(['@inkeep/open-knowledge', 'start']);
    expect(calls[0]?.opts.detached).toBe(true);
    expect(calls[0]?.opts.cwd).toBe(tmpDir);
    expect(calls[0]?.opts.stdio?.[0]).toBe('ignore');
    expect(calls[0]?.opts.stdio?.[1]).toBe('ignore');
    // stdio[2] is a numeric fd — kernel captures child's stderr.
    expect(typeof calls[0]?.opts.stdio?.[2]).toBe('number');
  });

  test('creates lockDir if missing before opening error log', async () => {
    expect(existsSync(lockDir)).toBe(false);
    const calls: SpawnCall[] = [];
    try {
      await ensureServerRunning({
        lockDir,
        contentDir: tmpDir,
        host: 'localhost',
        portOverride: undefined,
        envAutoStart: undefined,
        configAutoStart: true,
        readLock: () => null,
        isAlive: () => false,
        sleep: async () => {},
        spawn: makeMockSpawn(calls),
        pollIntervalMs: 1,
        timeoutMs: 3,
      });
    } catch {
      // timeout expected
    }
    expect(existsSync(lockDir)).toBe(true);
    expect(existsSync(resolve(lockDir, 'last-spawn-error.log'))).toBe(true);
  });

  test('poll timeout surfaces stderr content in thrown error', async () => {
    // Pre-populate error log (simulating what the spawn would have written).
    const errorLog = resolve(lockDir, 'last-spawn-error.log');
    const calls: SpawnCall[] = [];
    // Mock openErrorLog so we can write simulated stderr without truncation
    // fighting the test. We write the content AFTER the mock "opens" it.
    const openErrorLog = (path: string) => {
      // Create dir + empty file so poll-timeout read succeeds below.
      if (!existsSync(lockDir)) {
        require('node:fs').mkdirSync(lockDir, { recursive: true });
      }
      writeFileSync(path, 'spawn npx ENOENT\n', 'utf-8');
      // Return a fake fd; ensureServerRunning's closeFd will swallow errors.
      return 1234567;
    };

    await expect(
      ensureServerRunning({
        lockDir,
        contentDir: tmpDir,
        host: 'localhost',
        portOverride: undefined,
        envAutoStart: undefined,
        configAutoStart: true,
        readLock: () => null,
        isAlive: () => false,
        sleep: async () => {},
        spawn: makeMockSpawn(calls),
        pollIntervalMs: 1,
        timeoutMs: 5,
        openErrorLog,
        closeFd: () => {},
      }),
    ).rejects.toThrow(/did not start within.*stderr:/s);

    // Confirm the content made it to the log.
    expect(readFileSync(errorLog, 'utf-8')).toContain('ENOENT');
  });

  test('poll timeout with empty stderr throws a clean timeout message', async () => {
    const calls: SpawnCall[] = [];
    await expect(
      ensureServerRunning({
        lockDir,
        contentDir: tmpDir,
        host: 'localhost',
        portOverride: undefined,
        envAutoStart: undefined,
        configAutoStart: true,
        readLock: () => null,
        isAlive: () => false,
        sleep: async () => {},
        spawn: makeMockSpawn(calls),
        pollIntervalMs: 1,
        timeoutMs: 3,
      }),
    ).rejects.toThrow(/did not start within/);
  });

  test('--port override short-circuits spawn', async () => {
    const calls: SpawnCall[] = [];
    const result = await ensureServerRunning({
      lockDir,
      contentDir: tmpDir,
      host: 'localhost',
      portOverride: '4242',
      envAutoStart: undefined,
      configAutoStart: true,
      readLock: () => null,
      isAlive: () => false,
      spawn: makeMockSpawn(calls),
    });
    expect(result.serverUrl).toBe('ws://localhost:4242');
    expect(calls.length).toBe(0);
  });

  test('env precedence — OK_MCP_AUTOSTART=0 + config=true → disk-only', async () => {
    const calls: SpawnCall[] = [];
    const result = await ensureServerRunning({
      lockDir,
      contentDir: tmpDir,
      host: 'localhost',
      portOverride: undefined,
      envAutoStart: '0',
      configAutoStart: true,
      readLock: () => null,
      isAlive: () => false,
      spawn: makeMockSpawn(calls),
    });
    expect(result.serverUrl).toBeUndefined();
    expect(result.message).toContain('OK_MCP_AUTOSTART=0');
    expect(calls.length).toBe(0);
  });
});
