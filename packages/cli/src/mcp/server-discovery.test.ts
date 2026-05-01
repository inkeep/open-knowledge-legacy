import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { existsSync, mkdirSync, readFileSync, symlinkSync, writeFileSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import type { ServerLockMetadata } from '@inkeep/open-knowledge-server';
import type { Config } from '../config/schema.ts';
import {
  type AutoStartDecision,
  classifyMcpLaunchPath,
  createProjectServerUrlResolver,
  decideAutoStart,
  describeProtocolMismatchRemedy,
  describeSpawnEnoentRemedy,
  ensureServerRunning,
  isSpawnEnoentMessage,
  type McpLaunchShape,
} from './server-discovery.ts';

const aliveLock: ServerLockMetadata = {
  pid: 4242,
  hostname: 'test-host',
  port: 5173,
  startedAt: '2026-04-16T10:00:00Z',
  worktreeRoot: '/tmp/test',
  protocolVersion: 1,
  runtimeVersion: '0.2.0',
};

const bootingLock: ServerLockMetadata = { ...aliveLock, port: 0 };

const versionlessLock: ServerLockMetadata = {
  pid: 4242,
  hostname: 'test-host',
  port: 5173,
  startedAt: '2026-04-16T10:00:00Z',
  worktreeRoot: '/tmp/test',
};

const olderProtocolLock: ServerLockMetadata = {
  ...aliveLock,
  protocolVersion: 0,
};

const BASE_CONFIG: Config = {
  content: {
    dir: 'content',
    include: ['**/*.md', '**/*.mdx'],
    exclude: [],
  },
  github: { oauthAppClientId: 'Ov23liqlSd0V1MwR6rhI' },
  server: {
    host: 'localhost',
    openOnAgentEdit: false,
  },
  preview: {},
  folders: [],
  mcp: {
    autoStart: true,
    tools: {
      read_document: { historyDepth: 5 },
      search: { maxResults: 50 },
    },
  },
  appearance: {},
};

describe('server-discovery', () => {
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

    test('protocol mismatch → incompatible (older lock owner)', () => {
      const result = decideAutoStart({
        host: 'localhost',
        portOverride: undefined,
        envAutoStart: undefined,
        configAutoStart: true,
        readLock: () => olderProtocolLock,
        isAlive: () => true,
        expectedProtocolVersion: 1,
        launchPath: '/Users/x/.npm/_npx/abc/node_modules/@inkeep/open-knowledge/dist/cli.mjs',
      });
      expect(result.action).toBe('incompatible');
      if (result.action !== 'incompatible') throw new Error('expected incompatible');
      expect(result.expectedProtocolVersion).toBe(1);
      expect(result.actualProtocolVersion).toBe(0);
      expect(result.message).toContain('protocol v0');
      expect(result.message).toContain('protocol v1');
      expect(result.launchShape).toBe('npx-cache');
    });

    test('lock missing protocolVersion → incompatible (pre-version-field lock)', () => {
      const result = decideAutoStart({
        host: 'localhost',
        portOverride: undefined,
        envAutoStart: undefined,
        configAutoStart: true,
        readLock: () => versionlessLock,
        isAlive: () => true,
        expectedProtocolVersion: 1,
        launchPath: undefined,
      });
      expect(result.action).toBe('incompatible');
      if (result.action !== 'incompatible') throw new Error('expected incompatible');
      expect(result.actualProtocolVersion).toBeUndefined();
      expect(result.message).toContain('unknown');
    });

    test('incompatible diagnostic — npx-cache shape suggests stop-and-retry', () => {
      const result = decideAutoStart({
        host: 'localhost',
        portOverride: undefined,
        envAutoStart: undefined,
        configAutoStart: true,
        readLock: () => olderProtocolLock,
        isAlive: () => true,
        expectedProtocolVersion: 1,
        launchPath: '/Users/x/.npm/_npx/abc123/node_modules/@inkeep/open-knowledge/dist/cli.mjs',
      });
      if (result.action !== 'incompatible') throw new Error('expected incompatible');
      expect(result.launchShape).toBe('npx-cache');
      expect(result.message).toContain('package-manager cache');
      expect(result.message).toContain('ok init --pin');
    });

    test('incompatible diagnostic — stable-shim shape suggests close-and-reopen', () => {
      const result = decideAutoStart({
        host: 'localhost',
        portOverride: undefined,
        envAutoStart: undefined,
        configAutoStart: true,
        readLock: () => olderProtocolLock,
        isAlive: () => true,
        expectedProtocolVersion: 1,
        launchPath: '/usr/local/bin/ok',
      });
      if (result.action !== 'incompatible') throw new Error('expected incompatible');
      expect(result.launchShape).toBe('stable-shim');
      expect(result.message).toContain('shim was likely upgraded');
      expect(result.message).toContain('Close and reopen the project window');
    });

    test('incompatible diagnostic — absolute-pin shape suggests re-pin', () => {
      const pinned = '/Users/x/work/open-knowledge/packages/cli/dist/cli.mjs';
      const result = decideAutoStart({
        host: 'localhost',
        portOverride: undefined,
        envAutoStart: undefined,
        configAutoStart: true,
        readLock: () => olderProtocolLock,
        isAlive: () => true,
        expectedProtocolVersion: 1,
        launchPath: pinned,
      });
      if (result.action !== 'incompatible') throw new Error('expected incompatible');
      expect(result.launchShape).toBe('absolute-pin');
      expect(result.message).toContain('pinned path');
      expect(result.message).toContain(pinned);
      expect(result.message).toContain('Re-run `ok init --pin`');
    });

    test('incompatible diagnostic — unknown shape falls back to generic remedy', () => {
      const result = decideAutoStart({
        host: 'localhost',
        portOverride: undefined,
        envAutoStart: undefined,
        configAutoStart: true,
        readLock: () => olderProtocolLock,
        isAlive: () => true,
        expectedProtocolVersion: 1,
        launchPath: '',
      });
      if (result.action !== 'incompatible') throw new Error('expected incompatible');
      expect(result.launchShape).toBe('unknown');
      expect(result.message).toContain('align CLI versions');
    });

    test('matching protocol → connect', () => {
      const result = decideAutoStart({
        host: 'localhost',
        portOverride: undefined,
        envAutoStart: undefined,
        configAutoStart: true,
        readLock: () => aliveLock,
        isAlive: () => true,
        expectedProtocolVersion: 1,
      });
      expect(result.action).toBe('connect');
    });
  });

  describe('classifyMcpLaunchPath', () => {
    const cases: Array<{ name: string; path: string | undefined; expected: McpLaunchShape }> = [
      { name: 'undefined', path: undefined, expected: 'unknown' },
      { name: 'empty string', path: '', expected: 'unknown' },
      { name: 'relative path', path: 'dist/cli.mjs', expected: 'unknown' },
      {
        name: 'npx cache (npm)',
        path: '/Users/x/.npm/_npx/abc/node_modules/@inkeep/open-knowledge/dist/cli.mjs',
        expected: 'npx-cache',
      },
      {
        name: 'npx cache (legacy /_npx/)',
        path: '/var/folders/zz/_npx/123/node_modules/@inkeep/open-knowledge/dist/cli.mjs',
        expected: 'npx-cache',
      },
      {
        name: 'bunx cache',
        path: '/Users/x/.bun/install/cache/@inkeep+open-knowledge@0.3.0/dist/cli.mjs',
        expected: 'npx-cache',
      },
      { name: '/usr/local/bin/ok', path: '/usr/local/bin/ok', expected: 'stable-shim' },
      { name: '/opt/homebrew/bin/ok', path: '/opt/homebrew/bin/ok', expected: 'stable-shim' },
      {
        name: 'in-bundle CLI',
        path: '/Applications/Open Knowledge.app/Contents/Resources/cli/cli.mjs',
        expected: 'stable-shim',
      },
      {
        name: 'global npm bin',
        path: '/Users/x/.npm-global/bin/ok',
        expected: 'absolute-pin',
      },
      {
        name: 'monorepo dist',
        path: '/Users/x/work/open-knowledge/packages/cli/dist/cli.mjs',
        expected: 'absolute-pin',
      },
      {
        name: 'Linux path containing Applications segment is not bundle shim',
        path: '/home/alice/Applications/ok',
        expected: 'absolute-pin',
      },
    ];
    for (const c of cases) {
      test(c.name, () => {
        expect(classifyMcpLaunchPath(c.path)).toBe(c.expected);
      });
    }
  });

  describe('describeProtocolMismatchRemedy', () => {
    test('npx-cache mentions package-manager cache and --pin', () => {
      expect(describeProtocolMismatchRemedy('npx-cache', undefined)).toContain(
        'package-manager cache',
      );
      expect(describeProtocolMismatchRemedy('npx-cache', undefined)).toContain('ok init --pin');
    });
    test('stable-shim mentions close-and-reopen', () => {
      expect(describeProtocolMismatchRemedy('stable-shim', '/usr/local/bin/ok')).toContain(
        'Close and reopen',
      );
    });
    test('absolute-pin embeds the path and suggests re-pin', () => {
      const path = '/Users/x/.local/bin/ok';
      const remedy = describeProtocolMismatchRemedy('absolute-pin', path);
      expect(remedy).toContain(path);
      expect(remedy).toContain('Re-run `ok init --pin`');
    });
    test('absolute-pin without a path omits the parenthetical', () => {
      const remedy = describeProtocolMismatchRemedy('absolute-pin', undefined);
      expect(remedy).not.toContain('()');
      expect(remedy).toContain('pinned path');
    });
    test('unknown gives a generic remedy', () => {
      expect(describeProtocolMismatchRemedy('unknown', undefined)).toContain('align CLI versions');
    });
  });

  describe('isSpawnEnoentMessage', () => {
    test('detects ENOENT in typical Node spawn errors', () => {
      expect(isSpawnEnoentMessage('spawn ENOENT')).toBe(true);
      expect(isSpawnEnoentMessage('ENOENT: no such file or directory')).toBe(true);
      expect(isSpawnEnoentMessage('ENOENT')).toBe(true);
    });
    test('does not match permission errors', () => {
      expect(isSpawnEnoentMessage('EACCES')).toBe(false);
      expect(isSpawnEnoentMessage('')).toBe(false);
    });
  });

  describe('describeSpawnEnoentRemedy', () => {
    test('absolute-pin path gets reinstall / --pin guidance', () => {
      const t = describeSpawnEnoentRemedy('/Users/x/.npm-global/bin/ok');
      expect(t).toContain('ok init --pin');
      expect(t).toContain('CLI entry script');
    });
    test('stable-shim shape mentions missing shim', () => {
      expect(describeSpawnEnoentRemedy('/usr/local/bin/ok')).toContain('shim is missing');
    });
    test('npx-cache shape mentions cache', () => {
      expect(
        describeSpawnEnoentRemedy(
          '/Users/x/.npm/_npx/abc/node_modules/@inkeep/open-knowledge/dist/cli.mjs',
        ),
      ).toContain('package-manager cache');
    });
    test('unknown shape is still actionable', () => {
      expect(describeSpawnEnoentRemedy('dist/cli.mjs')).toContain('ok init --pin');
    });
  });

  describe('ensureServerRunning', () => {
    let tmpDir: string;
    let lockDir: string;

    beforeEach(async () => {
      tmpDir = await mkdtemp(resolve(tmpdir(), 'ok-mcp-ensure-'));
      lockDir = resolve(tmpDir, '.ok');
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
      expect(calls[0]?.cmd).toBe(process.execPath);
      expect(calls[0]?.args.length).toBe(2);
      expect(calls[0]?.args[1]).toBe('start');
      expect(calls[0]?.opts.detached).toBe(true);
      expect(calls[0]?.opts.cwd).toBe(tmpDir);
      expect(calls[0]?.opts.stdio?.[0]).toBe('ignore');
      expect(calls[0]?.opts.stdio?.[1]).toBe('ignore');
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
      }
      expect(existsSync(lockDir)).toBe(true);
      expect(existsSync(resolve(lockDir, 'last-spawn-error.log'))).toBe(true);
    });

    test('poll timeout surfaces stderr content in thrown error', async () => {
      const errorLog = resolve(lockDir, 'last-spawn-error.log');
      const calls: SpawnCall[] = [];
      const openErrorLog = (path: string) => {
        if (!existsSync(lockDir)) {
          mkdirSync(lockDir, { recursive: true });
        }
        writeFileSync(path, 'spawn npx ENOENT\n', 'utf-8');
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
      ).rejects.toThrow(/server did not start within.*stderr:/s);

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
      ).rejects.toThrow(/server did not start within/);
    });

    test('sync spawn throw surfaces a spawn-failed error', async () => {
      const throwingSpawn = (() => {
        throw new Error('EACCES');
      }) as never;

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
          spawn: throwingSpawn,
          pollIntervalMs: 1,
          timeoutMs: 5,
        });
        expect.unreachable('ensureServerRunning should throw');
      } catch (e) {
        expect(e).toBeInstanceOf(Error);
        const msg = (e as Error).message;
        expect(msg).toMatch(/spawn failed: EACCES/);
        expect(msg).not.toContain('CLI entry script');
        expect(msg).not.toContain('ok init --pin');
      }
    });

    test('async spawn error events surface a spawn-failed error', async () => {
      let emitError: ((err: unknown) => void) | undefined;
      const eventingSpawn = ((cmd: string, args: readonly string[], opts: unknown) => {
        const call = { cmd, args, opts };
        void call;
        return {
          unref: () => {},
          on: (event: string, listener: (err: unknown) => void) => {
            if (event === 'error') emitError = listener;
          },
          kill: () => {},
        };
      }) as never;
      let triggered = false;

      const pinned = '/Users/x/.npm-global/bin/ok';
      const err = await ensureServerRunning({
        lockDir,
        contentDir: tmpDir,
        host: 'localhost',
        portOverride: undefined,
        envAutoStart: undefined,
        configAutoStart: true,
        readLock: () => null,
        isAlive: () => false,
        sleep: async () => {
          if (!triggered) {
            triggered = true;
            emitError?.(new Error('ENOENT'));
          }
        },
        spawn: eventingSpawn,
        pollIntervalMs: 1,
        timeoutMs: 5,
        launchPath: pinned,
      }).catch((e: unknown) => e as Error);

      expect(err.message).toContain('spawn failed: ENOENT');
      expect(err.message).toContain(describeSpawnEnoentRemedy(pinned));
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

  describe('createProjectServerUrlResolver', () => {
    test('discovers per project cwd and caches independently', async () => {
      const calls: Array<{ lockDir: string; contentDir: string }> = [];
      const resolver = createProjectServerUrlResolver({
        startupCwd: '/workspace/a',
        resolveConfig: async (cwd) =>
          cwd === '/workspace/b'
            ? {
                ...BASE_CONFIG,
                content: { ...BASE_CONFIG.content, dir: 'knowledge-b' },
              }
            : BASE_CONFIG,
        host: 'localhost',
        portOverride: undefined,
        envAutoStart: undefined,
        cacheMs: 10_000,
        ensureServerRunningFn: async (opts) => {
          calls.push({ lockDir: opts.lockDir, contentDir: opts.contentDir });
          return {
            serverUrl: opts.contentDir.includes('/workspace/a/')
              ? 'ws://localhost:41001'
              : 'ws://localhost:41002',
            message: 'ok',
          };
        },
      });

      await expect(resolver('/workspace/a')).resolves.toBe('ws://localhost:41001');
      await expect(resolver('/workspace/a')).resolves.toBe('ws://localhost:41001');
      await expect(resolver('/workspace/b')).resolves.toBe('ws://localhost:41002');

      expect(calls).toEqual([
        {
          contentDir: '/workspace/a/content',
          lockDir: '/workspace/a/content/.ok',
        },
        {
          contentDir: '/workspace/b/knowledge-b',
          lockDir: '/workspace/b/knowledge-b/.ok',
        },
      ]);
    });

    test('forwards launchPath to ensureServerRunning', async () => {
      let seenLaunchPath: string | undefined;
      const resolver = createProjectServerUrlResolver({
        startupCwd: '/workspace/a',
        resolveConfig: async () => BASE_CONFIG,
        host: 'localhost',
        portOverride: undefined,
        envAutoStart: undefined,
        launchPath: '/custom/bin/ok',
        ensureServerRunningFn: async (opts) => {
          seenLaunchPath = opts.launchPath;
          return { serverUrl: 'ws://localhost:45001', message: 'ok' };
        },
      });
      await expect(resolver('/workspace/a')).resolves.toBe('ws://localhost:45001');
      expect(seenLaunchPath).toBe('/custom/bin/ok');
    });

    test('uses startup cwd when the caller does not provide one', async () => {
      const resolver = createProjectServerUrlResolver({
        startupCwd: '/workspace/startup',
        resolveConfig: async () => BASE_CONFIG,
        host: 'localhost',
        portOverride: undefined,
        envAutoStart: undefined,
        ensureServerRunningFn: async (opts) => ({
          serverUrl:
            opts.contentDir === '/workspace/startup/content' ? 'ws://localhost:42001' : undefined,
          message: 'ok',
        }),
      });

      await expect(resolver()).resolves.toBe('ws://localhost:42001');
    });

    test('positive port override returns a fixed url for every cwd', async () => {
      const resolver = createProjectServerUrlResolver({
        startupCwd: '/workspace/startup',
        resolveConfig: async () => BASE_CONFIG,
        host: 'localhost',
        portOverride: '9999',
        envAutoStart: undefined,
      });

      await expect(resolver('/workspace/a')).resolves.toBe('ws://localhost:9999');
      await expect(resolver('/workspace/b')).resolves.toBe('ws://localhost:9999');
    });

    test('normalizes cwd before server cache lookups', async () => {
      const tmp = resolve(
        tmpdir(),
        `ok-server-discovery-test-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      );
      const realProject = resolve(tmp, 'project-real');
      const symlinkProject = resolve(tmp, 'project-link');
      mkdirSync(realProject, { recursive: true });
      symlinkSync(realProject, symlinkProject);

      let resolveConfigCalls = 0;
      let ensureCalls = 0;
      const resolver = createProjectServerUrlResolver({
        startupCwd: realProject,
        resolveConfig: async () => {
          resolveConfigCalls += 1;
          return BASE_CONFIG;
        },
        host: 'localhost',
        portOverride: undefined,
        envAutoStart: undefined,
        cacheMs: 10_000,
        ensureServerRunningFn: async () => {
          ensureCalls += 1;
          return {
            serverUrl: 'ws://localhost:43001',
            message: 'ok',
          };
        },
      });

      await expect(resolver(realProject)).resolves.toBe('ws://localhost:43001');
      await expect(resolver(symlinkProject)).resolves.toBe('ws://localhost:43001');
      expect(resolveConfigCalls).toBe(1);
      expect(ensureCalls).toBe(1);
    });

    test('deduplicates concurrent resolutions for the same cwd', async () => {
      const tmp = resolve(
        tmpdir(),
        `ok-server-discovery-dedupe-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      );
      mkdirSync(tmp, { recursive: true });

      let resolveConfigCalls = 0;
      let ensureCalls = 0;
      let markEnsureStarted!: () => void;
      let releaseEnsure!: () => void;
      const ensureStarted = new Promise<void>((resolveStarted) => {
        markEnsureStarted = resolveStarted;
      });
      const blockedEnsure = new Promise<void>((resolveBlocked) => {
        releaseEnsure = resolveBlocked;
      });

      const resolver = createProjectServerUrlResolver({
        startupCwd: tmp,
        resolveConfig: async () => {
          resolveConfigCalls += 1;
          return BASE_CONFIG;
        },
        host: 'localhost',
        portOverride: undefined,
        envAutoStart: undefined,
        cacheMs: 10_000,
        ensureServerRunningFn: async () => {
          ensureCalls += 1;
          markEnsureStarted();
          await blockedEnsure;
          return {
            serverUrl: 'ws://localhost:44001',
            message: 'ok',
          };
        },
      });

      const first = resolver(tmp);
      const second = resolver(tmp);
      await ensureStarted;
      await Promise.resolve();

      expect(resolveConfigCalls).toBe(1);
      expect(ensureCalls).toBe(1);

      releaseEnsure();
      await expect(Promise.all([first, second])).resolves.toEqual([
        'ws://localhost:44001',
        'ws://localhost:44001',
      ]);
    });
  });
});
