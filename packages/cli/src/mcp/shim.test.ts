import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import type { ServerLockMetadata } from '@inkeep/open-knowledge-server';
import { resolveMcpHttpUrl } from './shim.ts';

const liveLock: ServerLockMetadata = {
  pid: 1234,
  hostname: 'test-host',
  port: 4123,
  startedAt: '2026-04-29T00:00:00Z',
  worktreeRoot: '/tmp/project',
  protocolVersion: 999,
  runtimeVersion: '9.9.9',
};

describe('MCP stdio shim server resolution', () => {
  let tmp: string;
  let lockDir: string;

  beforeEach(async () => {
    tmp = await mkdtemp(resolve(tmpdir(), 'ok-mcp-shim-'));
    lockDir = resolve(tmp, '.open-knowledge');
  });

  afterEach(async () => {
    await rm(tmp, { recursive: true, force: true });
  });

  test('live lock resolves to /mcp without checking protocolVersion', async () => {
    const url = await resolveMcpHttpUrl({
      lockDir,
      contentDir: tmp,
      host: 'localhost',
      readLock: () => liveLock,
      isAlive: (pid) => pid === liveLock.pid,
      spawn: (() => {
        throw new Error('should not spawn');
      }) as never,
    });

    expect(url).toBe('http://localhost:4123/mcp');
  });

  test('missing lock spawns ok start and polls until a live port appears', async () => {
    const calls: Array<{ cmd: string; args: readonly string[]; cwd?: string }> = [];
    let pollCount = 0;

    const url = await resolveMcpHttpUrl({
      lockDir,
      contentDir: tmp,
      host: 'localhost',
      readLock: () => {
        pollCount += 1;
        return pollCount >= 3 ? liveLock : null;
      },
      isAlive: () => true,
      sleep: async () => {},
      openErrorLog: () => 123,
      closeFd: () => {},
      spawn: ((cmd: string, args: readonly string[], opts: { cwd?: string }) => {
        calls.push({ cmd, args, cwd: opts.cwd });
        return { on: () => {}, unref: () => {} };
      }) as never,
      timeoutMs: 1000,
      pollIntervalMs: 1,
    });

    expect(url).toBe('http://localhost:4123/mcp');
    expect(calls).toHaveLength(1);
    expect(calls[0]?.cmd).toBe(process.execPath);
    expect(calls[0]?.args.at(-1)).toBe('start');
    expect(calls[0]?.cwd).toBe(tmp);
  });

  test('auto-start opt-out turns missing server into a short diagnostic', async () => {
    await expect(
      resolveMcpHttpUrl({
        lockDir,
        contentDir: tmp,
        host: 'localhost',
        envAutoStart: '0',
        readLock: () => null,
        isAlive: () => false,
      }),
    ).rejects.toThrow('OK_MCP_AUTOSTART=0');
  });
});
