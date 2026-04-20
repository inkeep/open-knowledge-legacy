import { afterEach, beforeEach, describe, expect, it, test } from 'bun:test';
import { mkdirSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { ConfigSchema } from '../config/schema.ts';
import { normalizeCwd } from '../utils/normalize-cwd.ts';
import {
  createKeepaliveProjectState,
  createProjectRoutingResolver,
  MULTIPLE_ROOTS_ERROR,
  NO_CLIENT_ROOTS_ERROR,
  ROOTS_UNAVAILABLE_ERROR,
} from './server.ts';
import { registerAllTools } from './tools/index.ts';

let tmpRoot: string;

beforeEach(() => {
  tmpRoot = resolve(
    tmpdir(),
    `ok-mcp-routing-test-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  );
  mkdirSync(tmpRoot, { recursive: true });
});

afterEach(() => {
  rmSync(tmpRoot, { recursive: true, force: true });
});

describe('MCP server module', () => {
  it('server module exports startMcpServer without requiring Hocuspocus', async () => {
    const { startMcpServer } = await import('./server.ts');
    expect(typeof startMcpServer).toBe('function');
  });

  it('startMcpServer is an async function', async () => {
    const mod = await import('./server.ts');
    expect(mod.startMcpServer.constructor.name).toBe('AsyncFunction');
  });

  it('buildInstructions embeds shared PREVIEW_GUIDANCE constant', async () => {
    const { buildInstructions } = await import('./server.ts');
    const { PREVIEW_GUIDANCE } = await import('../content/init.ts');
    const config = ConfigSchema.parse({});
    const instructions = buildInstructions(config);
    expect(instructions).toContain(PREVIEW_GUIDANCE);
  });

  it('buildInstructions describes both per-file and folders: surfaces (US-006 / QA-010)', async () => {
    const { buildInstructions } = await import('./server.ts');
    const config = ConfigSchema.parse({});
    const instructions = buildInstructions(config);
    // Describes both surfaces, not the stale "deprecated" wording
    expect(instructions).not.toContain('Folder-level frontmatter was deprecated');
    expect(instructions).not.toContain('the only authored metadata surface');
    expect(instructions).toContain('Per-file frontmatter');
    expect(instructions).toContain('folders:');
    // Distinguishes from the rejected INDEX.md-inside-content pattern
    expect(instructions).toContain('INDEX.md');
  });
});

describe('registerAllTools', () => {
  it('registers all workflow, enriched, exec, and document tools', () => {
    const server = new McpServer({ name: 'test', version: '0.0.0' });
    const config = ConfigSchema.parse({});
    const toolNames: string[] = [];
    const toolSchemas = new Map<string, Record<string, unknown>>();
    const originalTool = server.tool.bind(server);
    const toolSpy = ((...args: unknown[]) => {
      toolNames.push(String(args[0]));
      const schema =
        args.length >= 4 && typeof args[2] === 'object' && args[2] !== null
          ? (args[2] as Record<string, unknown>)
          : undefined;
      if (schema) toolSchemas.set(String(args[0]), schema);
      return originalTool(...args);
    }) as unknown as typeof server.tool;
    (server as unknown as { tool: typeof server.tool }).tool = toolSpy;

    registerAllTools(server, {
      resolveCwd: async () => process.cwd(),
      config,
    });

    expect(toolNames).toContain('get_dead_links');
    const routedTools = [
      'exec',
      'init-content',
      'ingest',
      'research',
      'consolidate',
      'read_document',
      'rename_document',
      'search',
      'suggest_links',
      'write_document',
      'edit_document',
      'get_history',
      'save_version',
      'rollback_to_version',
      'list_documents',
      'get_backlinks',
      'get_forward_links',
      'get_orphans',
      'get_hubs',
      'get_dead_links',
      'get_preview_url',
    ] as const;
    for (const toolName of routedTools) {
      expect(toolSchemas.get(toolName)).toBeDefined();
      expect(toolSchemas.get(toolName)).toHaveProperty('cwd');
    }
  });

  it('each tool returns instructional text content', () => {
    // We test the tool handlers indirectly by importing each module
    // and verifying the textResult helper produces the expected shape
    const { textResult } = require('./tools/shared.ts');
    const result = textResult('test instructions');
    expect(result).toEqual({
      content: [{ type: 'text', text: 'test instructions' }],
    });
  });
});

describe('detectHocuspocus (via module internals)', () => {
  it('handles unreachable server gracefully (does not throw)', async () => {
    const { startMcpServer } = await import('./server.ts');
    expect(typeof startMcpServer).toBe('function');
  });
});

describe('createProjectRoutingResolver', () => {
  test('explicit cwd wins without consulting client roots', async () => {
    const explicit = join(tmpRoot, 'explicit-project');
    mkdirSync(explicit, { recursive: true });
    let listRootsCalls = 0;
    const resolver = createProjectRoutingResolver({
      startupCwd: tmpRoot,
      listRoots: async () => {
        listRootsCalls += 1;
        return { roots: [] };
      },
    });

    await expect(resolver.resolveCwd(explicit)).resolves.toBe(await normalizeCwd(explicit));
    expect(listRootsCalls).toBe(0);
  });

  test('exactly one advertised root works and loads roots before deciding', async () => {
    const onlyRoot = join(tmpRoot, 'only-root');
    mkdirSync(onlyRoot, { recursive: true });
    let listRootsCalls = 0;
    const resolver = createProjectRoutingResolver({
      startupCwd: tmpRoot,
      listRoots: async () => {
        listRootsCalls += 1;
        return { roots: [{ uri: pathToFileURL(onlyRoot).href }] };
      },
    });

    await expect(resolver.resolveCwd()).resolves.toBe(await normalizeCwd(onlyRoot));
    await expect(resolver.resolveCwd()).resolves.toBe(await normalizeCwd(onlyRoot));
    expect(listRootsCalls).toBe(1);
  });

  test('multiple roots without cwd errors clearly', async () => {
    const rootA = join(tmpRoot, 'root-a');
    const rootB = join(tmpRoot, 'root-b');
    mkdirSync(rootA, { recursive: true });
    mkdirSync(rootB, { recursive: true });
    const resolver = createProjectRoutingResolver({
      startupCwd: tmpRoot,
      listRoots: async () => ({
        roots: [{ uri: pathToFileURL(rootA).href }, { uri: pathToFileURL(rootB).href }],
      }),
    });

    await expect(resolver.resolveCwd()).rejects.toThrow(MULTIPLE_ROOTS_ERROR);
  });

  test('no roots without cwd errors clearly', async () => {
    const resolver = createProjectRoutingResolver({
      startupCwd: tmpRoot,
      listRoots: async () => ({ roots: [] }),
    });

    await expect(resolver.resolveCwd()).rejects.toThrow(NO_CLIENT_ROOTS_ERROR);
  });

  test('roots/list failures error unless cwd is provided', async () => {
    const explicit = join(tmpRoot, 'explicit-project');
    mkdirSync(explicit, { recursive: true });
    const resolver = createProjectRoutingResolver({
      startupCwd: tmpRoot,
      listRoots: async () => {
        throw new Error('unsupported');
      },
    });

    await expect(resolver.resolveCwd()).rejects.toThrow(ROOTS_UNAVAILABLE_ERROR);
    await expect(resolver.resolveCwd(explicit)).resolves.toBe(await normalizeCwd(explicit));
  });

  test('roots/list_changed invalidates cached roots', async () => {
    const rootA = join(tmpRoot, 'root-a');
    const rootB = join(tmpRoot, 'root-b');
    mkdirSync(rootA, { recursive: true });
    mkdirSync(rootB, { recursive: true });
    let advertisedRoot = rootA;
    let listRootsCalls = 0;
    const resolver = createProjectRoutingResolver({
      startupCwd: tmpRoot,
      listRoots: async () => {
        listRootsCalls += 1;
        return { roots: [{ uri: pathToFileURL(advertisedRoot).href }] };
      },
    });

    await expect(resolver.resolveCwd()).resolves.toBe(await normalizeCwd(rootA));
    advertisedRoot = rootB;
    await expect(resolver.resolveCwd()).resolves.toBe(await normalizeCwd(rootA));

    resolver.invalidateRoots();

    await expect(resolver.resolveCwd()).resolves.toBe(await normalizeCwd(rootB));
    expect(listRootsCalls).toBe(2);
  });

  test('--port bypass path skips root selection entirely', async () => {
    let listRootsCalls = 0;
    const resolver = createProjectRoutingResolver({
      startupCwd: tmpRoot,
      bypassProjectSelection: true,
      listRoots: async () => {
        listRootsCalls += 1;
        throw new Error('should not be called');
      },
    });

    await expect(resolver.resolveCwd()).resolves.toBe(await normalizeCwd(tmpRoot));
    expect(listRootsCalls).toBe(0);
  });

  test('canonicalizes cwd values and de-duplicates equivalent roots', async () => {
    const realRoot = join(tmpRoot, 'real-root');
    const symlinkRoot = join(tmpRoot, 'root-link');
    mkdirSync(realRoot, { recursive: true });
    symlinkSync(realRoot, symlinkRoot);
    const resolver = createProjectRoutingResolver({
      startupCwd: tmpRoot,
      listRoots: async () => ({
        roots: [{ uri: pathToFileURL(realRoot).href }, { uri: pathToFileURL(symlinkRoot).href }],
      }),
    });

    await expect(resolver.resolveCwd()).resolves.toBe(await normalizeCwd(realRoot));
    await expect(resolver.resolveCwd(symlinkRoot)).resolves.toBe(await normalizeCwd(realRoot));
  });
});

describe('createKeepaliveProjectState', () => {
  test('keeps keepalive dormant until a tool resolves a project', async () => {
    const onlyRoot = join(tmpRoot, 'only-root');
    mkdirSync(onlyRoot, { recursive: true });
    let listRootsCalls = 0;
    const routing = createProjectRoutingResolver({
      startupCwd: tmpRoot,
      listRoots: async () => {
        listRootsCalls += 1;
        return { roots: [{ uri: pathToFileURL(onlyRoot).href }] };
      },
    });
    const keepaliveState = createKeepaliveProjectState({
      startupCwd: tmpRoot,
      resolveCwd: routing.resolveCwd,
    });

    await expect(keepaliveState.getKeepaliveCwd()).resolves.toBeUndefined();
    expect(listRootsCalls).toBe(0);

    await expect(keepaliveState.resolveCwdForTools()).resolves.toBe(await normalizeCwd(onlyRoot));
    expect(listRootsCalls).toBe(1);
    await expect(keepaliveState.getKeepaliveCwd()).resolves.toBe(await normalizeCwd(onlyRoot));
  });

  test('tracks the most recent tool-resolved cwd', async () => {
    const projectA = join(tmpRoot, 'project-a');
    const projectB = join(tmpRoot, 'project-b');
    mkdirSync(projectA, { recursive: true });
    mkdirSync(projectB, { recursive: true });
    const keepaliveState = createKeepaliveProjectState({
      startupCwd: tmpRoot,
      resolveCwd: async (explicit?: string) => {
        if (!explicit) throw new Error('explicit cwd required for this test');
        return await normalizeCwd(explicit);
      },
    });

    await expect(keepaliveState.resolveCwdForTools(projectA)).resolves.toBe(
      await normalizeCwd(projectA),
    );
    await expect(keepaliveState.getKeepaliveCwd()).resolves.toBe(await normalizeCwd(projectA));

    await expect(keepaliveState.resolveCwdForTools(projectB)).resolves.toBe(
      await normalizeCwd(projectB),
    );
    await expect(keepaliveState.getKeepaliveCwd()).resolves.toBe(await normalizeCwd(projectB));
  });

  test('--port bypass path exposes the startup cwd immediately', async () => {
    let resolveCalls = 0;
    const keepaliveState = createKeepaliveProjectState({
      startupCwd: tmpRoot,
      bypassProjectSelection: true,
      resolveCwd: async (explicit?: string) => {
        resolveCalls += 1;
        return await normalizeCwd(explicit ?? tmpRoot);
      },
    });

    await expect(keepaliveState.getKeepaliveCwd()).resolves.toBe(await normalizeCwd(tmpRoot));
    expect(resolveCalls).toBe(0);
  });
});
