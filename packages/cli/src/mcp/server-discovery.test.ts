import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { existsSync, mkdirSync, readFileSync, symlinkSync, writeFileSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import type { ServerLockMetadata } from '@inkeep/open-knowledge-server';
import type { Config } from '../config/schema.ts';
import {
  type AutoStartDecision,
  createProjectServerUrlResolver,
  decideAutoStart,
  ensureServerRunning,
} from './server-discovery.ts';

const aliveLock: ServerLockMetadata = {
  pid: 4242,
  hostname: 'test-host',
  port: 5173,
  startedAt: '2026-04-16T10:00:00Z',
  worktreeRoot: '/tmp/test',
};

const bootingLock: ServerLockMetadata = { ...aliveLock, port: 0 };

const BASE_CONFIG: Config = {
  content: {
    dir: 'content',
    include: ['**/*.md', '**/*.mdx'],
    exclude: [],
  },
  server: {
    port: 0,
    host: 'localhost',
    openOnAgentEdit: false,
  },
  persistence: {
    debounceMs: 2000,
    maxDebounceMs: 10000,
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
      // Re-exec via the current CLI binary (not npx) to avoid cross-version
      // lockfile-ABI drift. `cmd` is the current runtime (node/bun), `args[0]` is
      // the CLI entry script, followed by the `start` subcommand.
      expect(calls[0]?.cmd).toBe(process.execPath);
      expect(calls[0]?.args.length).toBe(2);
      expect(calls[0]?.args[1]).toBe('start');
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
          mkdirSync(lockDir, { recursive: true });
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
      ).rejects.toThrow(/Error: server did not start within.*stderr:/s);

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
      ).rejects.toThrow(/Error: server did not start within/);
    });

    test('sync spawn throw surfaces a spawn-failed error', async () => {
      const throwingSpawn = (() => {
        throw new Error('EACCES');
      }) as never;

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
          spawn: throwingSpawn,
          pollIntervalMs: 1,
          timeoutMs: 5,
        }),
      ).rejects.toThrow(/Error: spawn failed: EACCES/);
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
          sleep: async () => {
            if (!triggered) {
              triggered = true;
              emitError?.(new Error('ENOENT'));
            }
          },
          spawn: eventingSpawn,
          pollIntervalMs: 1,
          timeoutMs: 5,
        }),
      ).rejects.toThrow(/Error: spawn failed: ENOENT/);
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
          lockDir: '/workspace/a/content/.open-knowledge',
        },
        {
          contentDir: '/workspace/b/knowledge-b',
          lockDir: '/workspace/b/knowledge-b/.open-knowledge',
        },
      ]);
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
