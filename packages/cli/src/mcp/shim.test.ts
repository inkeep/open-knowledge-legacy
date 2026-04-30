import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { setTimeout as wait } from 'node:timers/promises';
import type { ServerLockMetadata } from '@inkeep/open-knowledge-server';
import type { JSONRPCMessage } from '@modelcontextprotocol/sdk/types.js';
import {
  bridgeStdioToHttpMcp,
  parseSpawnTimeoutEnv,
  resolveMcpHttpUrl,
  resolveMcpKeepaliveWsUrl,
  startMcpShim,
} from './shim.ts';

// ---------------------------------------------------------------------------
// Fake transport helpers for bridge unit tests
// ---------------------------------------------------------------------------

interface FakeTransport {
  onerror: ((err: Error) => void) | undefined;
  onclose: (() => void) | undefined;
  onmessage: ((msg: JSONRPCMessage) => void) | undefined;
  setProtocolVersion: ((v: string) => void) | undefined;
  start(): Promise<void>;
  close(): Promise<void>;
  send(msg: JSONRPCMessage): Promise<void>;
}

function makeFakeTransport(
  overrides: {
    send?: (msg: JSONRPCMessage) => Promise<void>;
    start?: () => Promise<void>;
    close?: () => Promise<void>;
  } = {},
): FakeTransport {
  return {
    onerror: undefined,
    onclose: undefined,
    onmessage: undefined,
    setProtocolVersion: undefined,
    async start() {
      await overrides.start?.();
    },
    async close() {
      await overrides.close?.();
    },
    async send(msg: JSONRPCMessage) {
      await overrides.send?.(msg);
    },
  };
}

function makeStderr(): { write: (s: string) => void; output: () => string } {
  const parts: string[] = [];
  return {
    write: (s: string) => {
      parts.push(s);
    },
    output: () => parts.join(''),
  };
}

const liveLock: ServerLockMetadata = {
  pid: 1234,
  hostname: 'test-host',
  port: 4123,
  startedAt: '2026-04-29T00:00:00Z',
  worktreeRoot: '/tmp/project',
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

  test('live lock resolves directly to the /mcp HTTP URL', async () => {
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

  test('config auto-start opt-out turns missing server into a short diagnostic', async () => {
    await expect(
      resolveMcpHttpUrl({
        lockDir,
        contentDir: tmp,
        host: 'localhost',
        configAutoStart: false,
        readLock: () => null,
        isAlive: () => false,
      }),
    ).rejects.toThrow('config mcp.autoStart=false');
  });

  test('valid port override bypasses discovery and formats wildcard host as localhost', async () => {
    const url = await resolveMcpHttpUrl({
      lockDir,
      contentDir: tmp,
      host: '0.0.0.0',
      portOverride: '6789',
      readLock: () => {
        throw new Error('should not read lock');
      },
      isAlive: () => false,
      spawn: (() => {
        throw new Error('should not spawn');
      }) as never,
    });

    expect(url).toBe('http://localhost:6789/mcp');
  });

  test('invalid port override rejects before spawn', async () => {
    await expect(
      resolveMcpHttpUrl({
        lockDir,
        contentDir: tmp,
        host: 'localhost',
        portOverride: 'not-a-port',
        spawn: (() => {
          throw new Error('should not spawn');
        }) as never,
      }),
    ).rejects.toThrow("invalid --port value 'not-a-port'");
  });

  test('sync spawn failure includes captured stderr', async () => {
    await expect(
      resolveMcpHttpUrl({
        lockDir,
        contentDir: tmp,
        host: 'localhost',
        readLock: () => null,
        isAlive: () => false,
        sleep: async () => {},
        openErrorLog: () => 123,
        closeFd: () => {},
        readErrorLog: () => 'boot failed loudly',
        spawn: (() => {
          throw new Error('spawn EACCES');
        }) as never,
        timeoutMs: 1000,
        pollIntervalMs: 1,
      }),
    ).rejects.toThrow('spawn failed: spawn EACCES stderr:\nboot failed loudly');
  });

  test('async spawn failure includes captured stderr', async () => {
    let errorHandler: ((err: Error) => void) | undefined;

    await expect(
      resolveMcpHttpUrl({
        lockDir,
        contentDir: tmp,
        host: 'localhost',
        readLock: () => null,
        isAlive: () => false,
        sleep: async () => {
          errorHandler?.(new Error('spawn ENOENT'));
        },
        openErrorLog: () => 123,
        closeFd: () => {},
        readErrorLog: () => 'binary missing',
        spawn: (() => ({
          on: (event: string, cb: (err: Error) => void) => {
            if (event === 'error') errorHandler = cb;
          },
          unref: () => {},
        })) as never,
        timeoutMs: 1000,
        pollIntervalMs: 1,
      }),
    ).rejects.toThrow('spawn failed: spawn ENOENT stderr:\nbinary missing');
  });

  test('spawn timeout includes captured stderr', async () => {
    await expect(
      resolveMcpHttpUrl({
        lockDir,
        contentDir: tmp,
        host: 'localhost',
        readLock: () => null,
        isAlive: () => false,
        sleep: async () => {},
        openErrorLog: () => 123,
        closeFd: () => {},
        readErrorLog: () => 'still starting',
        spawn: (() => ({ on: () => {}, unref: () => {} })) as never,
        timeoutMs: 1,
        pollIntervalMs: 1,
      }),
    ).rejects.toThrow('server did not start within 1ms stderr:\nstill starting');
  });

  test('spawn timeout env parser accepts positive integers only', () => {
    expect(parseSpawnTimeoutEnv(undefined)).toBeUndefined();
    expect(parseSpawnTimeoutEnv('')).toBeUndefined();
    expect(parseSpawnTimeoutEnv('0')).toBeUndefined();
    expect(parseSpawnTimeoutEnv('-1')).toBeUndefined();
    expect(parseSpawnTimeoutEnv('abc')).toBeUndefined();
    expect(parseSpawnTimeoutEnv('2500')).toBe(2500);
  });

  test('keepalive WS resolver follows the live lock unless a port override is explicit', () => {
    expect(
      resolveMcpKeepaliveWsUrl(
        {
          lockDir,
          contentDir: tmp,
          host: 'localhost',
          readLock: () => liveLock,
          isAlive: () => true,
        },
        'http://localhost:4123/mcp',
      ),
    ).toBe('ws://localhost:4123');

    expect(
      resolveMcpKeepaliveWsUrl(
        {
          lockDir,
          contentDir: tmp,
          host: 'localhost',
          readLock: () => liveLock,
          isAlive: () => false,
        },
        'http://localhost:4123/mcp',
      ),
    ).toBeUndefined();

    expect(
      resolveMcpKeepaliveWsUrl(
        {
          lockDir,
          contentDir: tmp,
          host: 'localhost',
          portOverride: '5123',
          readLock: () => null,
          isAlive: () => false,
        },
        'http://localhost:5123/mcp',
      ),
    ).toBe('ws://localhost:5123');
  });
});

// ---------------------------------------------------------------------------
// bridgeStdioToHttpMcp — error path unit tests
// ---------------------------------------------------------------------------

describe('bridgeStdioToHttpMcp error paths', () => {
  test('notification-forward failure logs to stderr and leaves bridge alive', async () => {
    const stderr = makeStderr();
    let httpSendCalled = false;

    const fakeHttp = makeFakeTransport({
      send: async () => {
        httpSendCalled = true;
        throw new Error('connection refused');
      },
    });
    const fakeStdio = makeFakeTransport({
      // Should NOT be called for notifications (no id → no error response).
      send: async () => {
        throw new Error('send should not be called for a notification');
      },
    });

    const bridge = await bridgeStdioToHttpMcp('http://localhost:9999/mcp', {
      stderr: stderr as unknown as NodeJS.WritableStream,
      createStdioTransport: () => fakeStdio,
      createHttpTransport: () => fakeHttp,
    });

    // Fire a notification (no `id` field).
    fakeStdio.onmessage?.({
      jsonrpc: '2.0',
      method: 'notifications/initialized',
    } as JSONRPCMessage);

    // Let the forward queue settle.
    await wait(20);

    expect(httpSendCalled).toBe(true);
    expect(stderr.output()).toContain('failed to forward stdio notification');
    expect(stderr.output()).toContain('connection refused');

    await bridge.close();
  });

  test('double-fault: http.send throws and stdio error-response send also throws — logs both', async () => {
    const stderr = makeStderr();

    const fakeHttp = makeFakeTransport({
      send: async () => {
        throw new Error('http send failed');
      },
    });
    const fakeStdio = makeFakeTransport({
      send: async () => {
        throw new Error('stdio send failed');
      },
    });

    const bridge = await bridgeStdioToHttpMcp('http://localhost:9999/mcp', {
      stderr: stderr as unknown as NodeJS.WritableStream,
      createStdioTransport: () => fakeStdio,
      createHttpTransport: () => fakeHttp,
    });

    // Fire a request (has `id` → expects an error-response write back on failure).
    fakeStdio.onmessage?.({
      jsonrpc: '2.0',
      id: 42,
      method: 'tools/list',
      params: {},
    } as JSONRPCMessage);

    await wait(20);

    const out = stderr.output();
    expect(out).toContain('failed to write stdio error response');
    expect(out).toContain('stdio send failed');

    await bridge.close();
  });
});

// ---------------------------------------------------------------------------
// startMcpShim lifecycle — keepalive cleanup on bridge start failure
// ---------------------------------------------------------------------------

describe('startMcpShim lifecycle', () => {
  let tmp: string;
  let lockDir: string;

  beforeEach(async () => {
    tmp = await mkdtemp(resolve(tmpdir(), 'ok-mcp-shim-lifecycle-'));
    lockDir = resolve(tmp, '.open-knowledge');
  });

  afterEach(async () => {
    await rm(tmp, { recursive: true, force: true });
  });

  test('bridge start failure closes keepalive before rethrowing', async () => {
    let keepaliveClosed = false;
    const bridgeError = new Error('bridge startup failed');

    await expect(
      startMcpShim({
        lockDir,
        contentDir: tmp,
        host: 'localhost',
        readLock: () => liveLock,
        isAlive: () => true,
        stderr: { write: () => {} } as unknown as NodeJS.WritableStream,
        startKeepalive: (() => ({
          close: () => {
            keepaliveClosed = true;
          },
          isConnected: () => false,
        })) as unknown as typeof import('./keepalive.ts').startKeepalive,
        bridgeFn: async () => {
          throw bridgeError;
        },
      }),
    ).rejects.toBe(bridgeError);

    expect(keepaliveClosed).toBe(true);
  });
});
