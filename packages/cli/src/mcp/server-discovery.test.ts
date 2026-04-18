import { describe, expect, test } from 'bun:test';
import { mkdirSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import type { Config } from '../config/schema.ts';
import { createProjectServerUrlResolver } from './server-discovery.ts';

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
});
