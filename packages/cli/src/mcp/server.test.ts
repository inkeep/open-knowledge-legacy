import { describe, expect, it } from 'bun:test';

describe('MCP server module', () => {
  it('server module exports startMcpServer without requiring Hocuspocus', async () => {
    // Import should succeed without a running server
    const { startMcpServer } = await import('./server.ts');
    expect(typeof startMcpServer).toBe('function');
  });

  it('startMcpServer is an async function', async () => {
    const mod = await import('./server.ts');
    expect(mod.startMcpServer.constructor.name).toBe('AsyncFunction');
  });
});
