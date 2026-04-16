import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { existsSync, readFileSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import {
  buildIdleShutdownHandler,
  decideUiSpawn,
  spawnOkUi,
  type UiSpawnDecision,
} from './start.ts';

describe('decideUiSpawn', () => {
  test('absent lock → spawn(absent)', () => {
    const result = decideUiSpawn({ uiLock: null, isAlive: () => true });
    expect(result).toEqual<UiSpawnDecision>({ action: 'spawn', reason: 'absent' });
  });

  test('lock with dead pid → spawn(stale)', () => {
    const result = decideUiSpawn({
      uiLock: { pid: 999999, port: 3000 },
      isAlive: () => false,
    });
    expect(result).toEqual<UiSpawnDecision>({
      action: 'spawn',
      reason: 'stale',
      stalePid: 999999,
    });
  });

  test('lock with live pid → skip(alive)', () => {
    const result = decideUiSpawn({
      uiLock: { pid: 4242, port: 3001 },
      isAlive: (pid) => pid === 4242,
    });
    expect(result).toEqual<UiSpawnDecision>({
      action: 'skip',
      reason: 'alive',
      pid: 4242,
      port: 3001,
    });
  });

  test('isAlive probe receives the lock pid', () => {
    const seen: number[] = [];
    decideUiSpawn({
      uiLock: { pid: 7777, port: 3000 },
      isAlive: (pid) => {
        seen.push(pid);
        return true;
      },
    });
    expect(seen).toEqual([7777]);
  });
});

describe('buildIdleShutdownHandler', () => {
  test('SIGTERMs UI sibling then awaits destroy when UI alive', async () => {
    const events: string[] = [];
    const onShutdown = buildIdleShutdownHandler({
      readUiLock: () => ({ pid: 1234, port: 3000 }),
      isAlive: () => true,
      killPid: (pid, sig) => {
        events.push(`kill:${pid}:${sig}`);
      },
      destroy: async () => {
        events.push('destroy');
      },
    });
    await onShutdown();
    expect(events).toEqual(['kill:1234:SIGTERM', 'destroy']);
  });

  test('skips kill when UI lock absent', async () => {
    const events: string[] = [];
    const onShutdown = buildIdleShutdownHandler({
      readUiLock: () => null,
      isAlive: () => true,
      killPid: (pid, sig) => events.push(`kill:${pid}:${sig}`),
      destroy: async () => {
        events.push('destroy');
      },
    });
    await onShutdown();
    expect(events).toEqual(['destroy']);
  });

  test('skips kill when UI process is dead (stale lock)', async () => {
    const events: string[] = [];
    const onShutdown = buildIdleShutdownHandler({
      readUiLock: () => ({ pid: 4242, port: 3000 }),
      isAlive: () => false,
      killPid: (pid, sig) => events.push(`kill:${pid}:${sig}`),
      destroy: async () => {
        events.push('destroy');
      },
    });
    await onShutdown();
    expect(events).toEqual(['destroy']);
  });

  test('still calls destroy when killPid throws', async () => {
    const events: string[] = [];
    const warned: object[] = [];
    const onShutdown = buildIdleShutdownHandler({
      readUiLock: () => ({ pid: 4242, port: 3000 }),
      isAlive: () => true,
      killPid: () => {
        throw new Error('EPERM');
      },
      destroy: async () => {
        events.push('destroy');
      },
      log: {
        info: () => {},
        warn: (obj) => warned.push(obj),
        error: () => {},
      },
    });
    await onShutdown();
    expect(events).toEqual(['destroy']);
    expect(warned[0]).toMatchObject({ pid: 4242 });
  });

  test('still calls destroy when readUiLock throws', async () => {
    const events: string[] = [];
    const onShutdown = buildIdleShutdownHandler({
      readUiLock: () => {
        throw new Error('lock read failed');
      },
      isAlive: () => true,
      killPid: () => {},
      destroy: async () => {
        events.push('destroy');
      },
      log: { info: () => {}, warn: () => {}, error: () => {} },
    });
    await onShutdown();
    expect(events).toEqual(['destroy']);
  });
});

describe('spawnOkUi', () => {
  let tmpDir: string;
  let lockDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(resolve(tmpdir(), 'ok-start-spawnui-'));
    lockDir = resolve(tmpDir, '.open-knowledge');
  });
  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  test('creates lockDir if missing and opens last-spawn-error.log', () => {
    const calls: Array<{ cmd: string; args: readonly string[]; opts: object }> = [];
    spawnOkUi({
      lockDir,
      cwd: tmpDir,
      // biome-ignore lint/suspicious/noExplicitAny: minimal mock matches ChildProcess shape
      spawn: ((cmd: string, args: readonly string[], opts: any) => {
        calls.push({ cmd, args, opts });
        return { unref: () => {}, on: () => {}, kill: () => {} } as unknown as ReturnType<
          typeof spawnOkUi
        >;
      }) as never,
    });

    expect(existsSync(lockDir)).toBe(true);
    expect(existsSync(join(lockDir, 'last-spawn-error.log'))).toBe(true);
    expect(calls.length).toBe(1);
    expect(calls[0]?.cmd).toBe('npx');
    expect(calls[0]?.args).toEqual(['@inkeep/open-knowledge', 'ui']);
  });

  test('passes detached + ignore stdio + cwd to spawn', () => {
    const calls: Array<{ opts: { detached?: boolean; cwd?: string; stdio?: unknown[] } }> = [];
    spawnOkUi({
      lockDir,
      cwd: tmpDir,
      spawn: ((_cmd: string, _args: readonly string[], opts: object) => {
        calls.push({ opts: opts as never });
        return { unref: () => {}, on: () => {}, kill: () => {} } as unknown as ReturnType<
          typeof spawnOkUi
        >;
      }) as never,
    });

    const opts = calls[0]?.opts;
    expect(opts?.detached).toBe(true);
    expect(opts?.cwd).toBe(tmpDir);
    expect(Array.isArray(opts?.stdio)).toBe(true);
    expect(opts?.stdio?.[0]).toBe('ignore');
    expect(opts?.stdio?.[1]).toBe('ignore');
    // The third stdio entry is a numeric file descriptor.
    expect(typeof opts?.stdio?.[2]).toBe('number');
  });

  test('honors custom args (e.g. testable arg list)', () => {
    const calls: Array<{ args: readonly string[] }> = [];
    spawnOkUi({
      lockDir,
      cwd: tmpDir,
      args: ['ui', '--port', '9999'],
      spawn: ((_cmd: string, args: readonly string[]) => {
        calls.push({ args });
        return { unref: () => {}, on: () => {}, kill: () => {} } as unknown as ReturnType<
          typeof spawnOkUi
        >;
      }) as never,
    });
    expect(calls[0]?.args).toEqual(['@inkeep/open-knowledge', 'ui', '--port', '9999']);
  });

  test('truncates last-spawn-error.log on each invocation', () => {
    // Pre-populate with some bytes to verify the next spawn truncates.
    const fs = require('node:fs');
    const errorLog = join(lockDir, 'last-spawn-error.log');
    fs.mkdirSync(lockDir, { recursive: true });
    fs.writeFileSync(errorLog, 'previous run error\n', 'utf-8');
    expect(readFileSync(errorLog, 'utf-8')).toBe('previous run error\n');

    spawnOkUi({
      lockDir,
      cwd: tmpDir,
      spawn: ((_cmd: string, _args: readonly string[]) =>
        ({ unref: () => {}, on: () => {}, kill: () => {} }) as unknown as ReturnType<
          typeof spawnOkUi
        >) as never,
    });

    expect(readFileSync(errorLog, 'utf-8')).toBe('');
  });
});
