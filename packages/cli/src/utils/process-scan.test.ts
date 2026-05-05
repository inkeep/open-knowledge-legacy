import { describe as _bunDescribe, afterEach, beforeEach, expect, it, spyOn } from 'bun:test';

const describe = process.env.CI ? _bunDescribe.skip : _bunDescribe;

import type { SpawnSyncReturns } from 'node:child_process';
import * as cp from 'node:child_process';
import * as fs from 'node:fs';
import { discoverLockDirs, findOkProcessPids, pidCwd } from './process-scan.ts';

function makeSpawnResult(overrides: Partial<SpawnSyncReturns<string>>): SpawnSyncReturns<string> {
  return {
    pid: 0,
    output: [],
    stdout: '',
    stderr: '',
    status: 0,
    signal: null,
    error: undefined,
    ...overrides,
  };
}

describe('findOkProcessPids', () => {
  let spawnSyncSpy: ReturnType<typeof spyOn>;

  beforeEach(() => {
    spawnSyncSpy = spyOn(cp, 'spawnSync');
  });

  afterEach(() => {
    spawnSyncSpy.mockRestore();
  });

  it('returns PIDs parsed from pgrep output when pgrep is available', async () => {
    spawnSyncSpy.mockReturnValue(
      makeSpawnResult({
        stdout:
          '12345 /usr/local/bin/bun /path/to/open-knowledge/packages/cli/dist/cli.mjs start\n',
        status: 0,
      }),
    );

    const pids = await findOkProcessPids();
    expect(pids).toEqual([12345]);
    const [cmd] = spawnSyncSpy.mock.calls[0] as [string, string[]];
    expect(cmd).toBe('pgrep');
  });

  it('falls back to ps when pgrep is unavailable (ENOENT)', async () => {
    const enoent = Object.assign(new Error('pgrep not found'), { code: 'ENOENT' });

    spawnSyncSpy
      .mockReturnValueOnce(makeSpawnResult({ error: enoent as NodeJS.ErrnoException }))
      .mockReturnValueOnce(
        makeSpawnResult({
          stdout:
            'PID COMMAND\n' +
            ' 99999 /usr/local/bin/open-knowledge start\n' +
            '   123 some-other-process\n',
          status: 0,
        }),
      );

    const pids = await findOkProcessPids();
    expect(pids).toEqual([99999]);

    const calls = spawnSyncSpy.mock.calls as [string, string[]][];
    expect(calls[0]?.[0]).toBe('pgrep');
    expect(calls[1]?.[0]).toBe('ps');
  });

  it('returns empty array when pgrep exits 1 (no matches) — does NOT fall back to ps', async () => {
    spawnSyncSpy.mockReturnValue(makeSpawnResult({ stdout: '', status: 1 }));

    const pids = await findOkProcessPids();
    expect(pids).toEqual([]);
    expect(spawnSyncSpy.mock.calls.length).toBe(1);
  });

  it('filters out non-ok processes from ps output', async () => {
    const enoent = Object.assign(new Error('pgrep not found'), { code: 'ENOENT' });

    spawnSyncSpy
      .mockReturnValueOnce(makeSpawnResult({ error: enoent as NodeJS.ErrnoException }))
      .mockReturnValueOnce(
        makeSpawnResult({
          stdout:
            '  PID COMMAND\n' +
            '  111 /usr/bin/ruby some-script.rb\n' +
            '  222 /usr/local/bin/ok start\n' +
            '  333 /usr/local/bin/bun run dev packages/app\n',
          status: 0,
        }),
      );

    const pids = await findOkProcessPids();
    expect(pids).toContain(222);
    expect(pids).toContain(333);
    expect(pids).not.toContain(111);
  });
});

describe('pidCwd', () => {
  let spawnSyncSpy: ReturnType<typeof spyOn>;

  beforeEach(() => {
    spawnSyncSpy = spyOn(cp, 'spawnSync');
  });

  afterEach(() => {
    spawnSyncSpy.mockRestore();
  });

  it('returns the CWD from lsof -Fn output', async () => {
    spawnSyncSpy.mockReturnValue(
      makeSpawnResult({
        stdout: 'p12345\nfcwd\nn/Users/mike/my-notes\n',
        status: 0,
      }),
    );

    const cwd = await pidCwd(12345);
    expect(cwd).toBe('/Users/mike/my-notes');
  });

  it('returns null when lsof is unavailable (ENOENT) — no crash', async () => {
    const enoent = Object.assign(new Error('lsof not found'), { code: 'ENOENT' });
    spawnSyncSpy.mockReturnValue(makeSpawnResult({ error: enoent as NodeJS.ErrnoException }));

    const cwd = await pidCwd(12345);
    expect(cwd).toBeNull();
  });

  it('returns null when lsof output has no cwd line', async () => {
    spawnSyncSpy.mockReturnValue(makeSpawnResult({ stdout: 'p12345\n', status: 0 }));

    const cwd = await pidCwd(12345);
    expect(cwd).toBeNull();
  });

  it('returns null on timeout (error but not ENOENT)', async () => {
    const timeoutErr = Object.assign(new Error('ETIMEDOUT'), { code: 'ETIMEDOUT' });
    spawnSyncSpy.mockReturnValue(makeSpawnResult({ error: timeoutErr as NodeJS.ErrnoException }));

    const cwd = await pidCwd(99999);
    expect(cwd).toBeNull();
  });
});

describe('discoverLockDirs', () => {
  let spawnSyncSpy: ReturnType<typeof spyOn>;
  let existsSyncSpy: ReturnType<typeof spyOn>;

  beforeEach(() => {
    spawnSyncSpy = spyOn(cp, 'spawnSync');
    existsSyncSpy = spyOn(fs, 'existsSync');
  });

  afterEach(() => {
    spawnSyncSpy.mockRestore();
    existsSyncSpy.mockRestore();
  });

  it('returns deduped lock dirs when multiple discovery routes find the same path', async () => {
    spawnSyncSpy
      .mockReturnValueOnce(
        makeSpawnResult({
          stdout: '111 /usr/local/bin/bun /path/packages/cli/dist/cli.mjs start\n',
          status: 0,
        }),
      )
      .mockReturnValueOnce(
        makeSpawnResult({
          stdout: 'p111\nfcwd\nn/Users/mike/notes\n',
          status: 0,
        }),
      )
      .mockReturnValueOnce(
        makeSpawnResult({
          stdout: 'COMMAND  PID USER   FD   TYPE\nbun      111 mike  ...\n',
          status: 0,
        }),
      );

    existsSyncSpy.mockImplementation((p: unknown) => p === '/Users/mike/notes/.ok');

    const dirs = await discoverLockDirs();
    expect(dirs).toHaveLength(1);
    expect(dirs[0]).toContain('.ok');
  });

  it('returns empty array when no ok processes and no .ok dirs exist', async () => {
    spawnSyncSpy
      .mockReturnValueOnce(makeSpawnResult({ stdout: '', status: 1 }))
      .mockReturnValueOnce(makeSpawnResult({ stdout: 'COMMAND PID USER\n', status: 0 }));

    existsSyncSpy.mockReturnValue(false);

    const dirs = await discoverLockDirs();
    expect(dirs).toHaveLength(0);
  });

  it('degrades gracefully when lsof is unavailable for pidCwd calls', async () => {
    const enoent = Object.assign(new Error('lsof not found'), { code: 'ENOENT' });

    spawnSyncSpy
      .mockReturnValueOnce(
        makeSpawnResult({
          stdout: '55 /usr/local/bin/ok start\n',
          status: 0,
        }),
      )
      .mockReturnValueOnce(makeSpawnResult({ error: enoent as NodeJS.ErrnoException }))
      .mockReturnValueOnce(makeSpawnResult({ error: enoent as NodeJS.ErrnoException }));

    existsSyncSpy.mockReturnValue(false);

    const dirs = await discoverLockDirs();
    expect(dirs).toHaveLength(0);
  });
});
