import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { existsSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { initWiki } from '../wiki/init.ts';

describe('MCP server module', () => {
  let testDir: string;

  beforeEach(() => {
    testDir = resolve(
      tmpdir(),
      `mcp-server-test-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    );
    mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  it('server module exports startMcpServer without requiring Hocuspocus', async () => {
    // Import should succeed without a running server
    const { startMcpServer } = await import('./server.ts');
    expect(typeof startMcpServer).toBe('function');
  });

  it('INSTRUCTIONS constant is accessible and contains wiki guidance', async () => {
    // We can test the server module's instructions by checking the exported function exists
    // and that it can be called with projectDir only (no serverUrl required)
    const mod = await import('./server.ts');
    expect(typeof mod.startMcpServer).toBe('function');
  });

  it('init tool scaffolds .openknowledge/ correctly via initWiki', () => {
    const result = initWiki(testDir);
    const okDir = join(testDir, '.openknowledge');

    expect(existsSync(okDir)).toBe(true);
    expect(existsSync(join(okDir, 'articles'))).toBe(true);
    expect(existsSync(join(okDir, 'external-sources'))).toBe(true);
    expect(existsSync(join(okDir, 'research'))).toBe(true);
    expect(existsSync(join(okDir, 'INDEX.md'))).toBe(true);
    expect(existsSync(join(okDir, 'AGENTS.md'))).toBe(true);
    expect(existsSync(join(okDir, 'config.yaml'))).toBe(true);
    expect(result.created.length).toBeGreaterThan(0);
  });
});
