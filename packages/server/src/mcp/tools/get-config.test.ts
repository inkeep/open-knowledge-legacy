import { describe as _bunDescribe, expect, test } from 'bun:test';

const describe = process.env.CI ? _bunDescribe.skip : _bunDescribe;

import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Config } from '../../config/schema.ts';
import { register } from './get-config.ts';
import type { ServerInstance } from './shared.ts';

const BASE_CONFIG: Config = {
  content: { dir: '.', include: ['**/*.md', '**/*.mdx'], exclude: [] },
  github: { oauthAppClientId: 'Ov23liqlSd0V1MwR6rhI' },
  server: { host: 'localhost', openOnAgentEdit: false },
  preview: {},
  folders: [],
  mcp: {
    autoStart: true,
    tools: {
      read_document: { historyDepth: 5 },
      grep: { maxResults: 50 },
    },
  },
  appearance: {},
};

interface ToolResult {
  content: Array<{ type: 'text'; text: string }>;
  structuredContent?: Record<string, unknown>;
  isError?: boolean;
}

type ToolHandler = (args: { path?: string[]; cwd?: string }) => Promise<ToolResult>;

function captureRegistration(cwd: string, configOverride?: Partial<Config>): ToolHandler {
  let captured: ToolHandler | null = null;
  const server = {
    registerTool(_name: string, _config: unknown, handler: ToolHandler) {
      captured = handler;
    },
    tool() {
      throw new Error('legacy tool() should not be called by get_config');
    },
  } as unknown as ServerInstance;
  register(server, {
    config: { ...BASE_CONFIG, ...(configOverride ?? {}) },
    resolveCwd: async () => cwd,
  });
  if (!captured) throw new Error('tool not registered');
  return captured;
}

describe('get_config tool', () => {
  test('returns the full effective merged config when path is omitted', async () => {
    const cwd = mkdtempSync(join(tmpdir(), 'ok-get-config-'));
    const handler = captureRegistration(cwd);
    const result = await handler({});
    expect(result.isError).toBeUndefined();
    const value = result.structuredContent?.value as Record<string, unknown>;
    expect(value.mcp).toBeDefined();
    expect((value.content as { include: string[] }).include).toEqual(['**/*.md', '**/*.mdx']);
  });

  test('returns sub-tree when path is provided', async () => {
    const cwd = mkdtempSync(join(tmpdir(), 'ok-get-config-'));
    const handler = captureRegistration(cwd);
    const result = await handler({ path: ['mcp', 'tools'] });
    const value = result.structuredContent?.value as {
      grep: { maxResults: number };
      read_document: { historyDepth: number };
    };
    expect(value.grep.maxResults).toBe(50);
    expect(value.read_document.historyDepth).toBe(5);
  });

  test('returns scalar leaf when path resolves to a primitive', async () => {
    const cwd = mkdtempSync(join(tmpdir(), 'ok-get-config-'));
    const handler = captureRegistration(cwd);
    const result = await handler({ path: ['mcp', 'tools', 'grep', 'maxResults'] });
    expect(result.structuredContent?.value).toBe(50);
  });

  test('returns null + exists:false for a nonexistent path', async () => {
    const cwd = mkdtempSync(join(tmpdir(), 'ok-get-config-'));
    const handler = captureRegistration(cwd);
    const result = await handler({ path: ['nonexistent', 'leaf'] });
    expect(result.structuredContent?.value).toBeNull();
    expect(result.structuredContent?.exists).toBe(false);
    expect(result.content[0]?.text).toContain('no value at nonexistent.leaf');
  });

  test('content[0].text is JSON-serialized for agent consumption', async () => {
    const cwd = mkdtempSync(join(tmpdir(), 'ok-get-config-'));
    const handler = captureRegistration(cwd);
    const result = await handler({ path: ['mcp', 'tools', 'grep', 'maxResults'] });
    expect(result.content[0]?.text).toBe('50');
  });

  test('reads no allowlist on read — returns github.oauthAppClientId without error', async () => {
    const cwd = mkdtempSync(join(tmpdir(), 'ok-get-config-'));
    const handler = captureRegistration(cwd);
    const result = await handler({ path: ['github', 'oauthAppClientId'] });
    expect(result.isError).toBeUndefined();
    expect(result.structuredContent?.value).toBe('Ov23liqlSd0V1MwR6rhI');
  });

  test('reflects on-disk config when caller passes a resolver that loads it', async () => {
    const cwd = mkdtempSync(join(tmpdir(), 'ok-get-config-disk-'));
    mkdirSync(join(cwd, '.ok'), { recursive: true });
    writeFileSync(
      join(cwd, '.ok', 'config.yml'),
      'mcp:\n  tools:\n    grep:\n      maxResults: 100\n',
    );
    const merged: Config = {
      ...BASE_CONFIG,
      mcp: {
        ...BASE_CONFIG.mcp,
        tools: {
          ...BASE_CONFIG.mcp.tools,
          grep: { maxResults: 100 },
        },
      },
    };
    let captured: ToolHandler | null = null;
    const server = {
      registerTool(_name: string, _cfg: unknown, h: ToolHandler) {
        captured = h;
      },
      tool() {
        throw new Error('not used');
      },
    } as unknown as ServerInstance;
    register(server, {
      config: async () => merged,
      resolveCwd: async () => cwd,
    });
    if (!captured) throw new Error('tool not registered');
    const result = await (captured as ToolHandler)({
      path: ['mcp', 'tools', 'grep', 'maxResults'],
    });
    expect(result.structuredContent?.value).toBe(100);
  });
});
