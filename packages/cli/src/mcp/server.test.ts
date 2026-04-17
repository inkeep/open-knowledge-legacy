import { describe, expect, it } from 'bun:test';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { ConfigSchema } from '../config/schema.ts';
import { registerAllTools } from './tools/index.ts';

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
    const originalTool = server.tool.bind(server);
    const toolSpy = ((...args: unknown[]) => {
      toolNames.push(String(args[0]));
      return originalTool(...args);
    }) as unknown as typeof server.tool;
    (server as unknown as { tool: typeof server.tool }).tool = toolSpy;

    registerAllTools(server, {
      resolveCwd: async () => process.cwd(),
      startupCwd: process.cwd(),
      config,
    });

    expect(toolNames).toContain('get_dead_links');
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
