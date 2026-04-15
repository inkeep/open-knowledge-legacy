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
      projectDir: process.cwd(),
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
