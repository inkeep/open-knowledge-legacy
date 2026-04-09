import { describe, expect, test } from 'bun:test';

describe('MCP logging', () => {
  test('pino logger is available via getLogger', async () => {
    const { getLogger } = await import('@inkeep/open-knowledge-server');
    const logger = getLogger('mcp-test');
    expect(logger).toBeDefined();
    expect(typeof logger.info).toBe('function');
    expect(typeof logger.debug).toBe('function');
    expect(typeof logger.error).toBe('function');
  });

  test('MCP tools module imports without errors', async () => {
    // Verify the module loads cleanly (no import errors from getLogger)
    const mod = await import('./tools.ts');
    expect(mod.registerTools).toBeDefined();
  });
});
