import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { runInit } from './init.ts';

describe('runInit', () => {
  let testDir: string;

  beforeEach(() => {
    testDir = resolve(
      tmpdir(),
      `init-command-test-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    );
    mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  it('scaffolds .open-knowledge/ and writes a fresh .mcp.json', () => {
    const result = runInit({ cwd: testDir });

    // Content scaffolded
    expect(result.wikiCreated.length).toBeGreaterThan(0);
    expect(existsSync(join(testDir, '.open-knowledge', 'articles'))).toBe(true);
    expect(existsSync(join(testDir, '.open-knowledge', 'external-sources'))).toBe(true);
    expect(existsSync(join(testDir, '.open-knowledge', 'research'))).toBe(true);
    expect(existsSync(join(testDir, '.open-knowledge', 'AGENTS.md'))).toBe(true);

    // MCP config written
    expect(result.mcpAction).toBe('written');
    const mcpPath = join(testDir, '.mcp.json');
    expect(existsSync(mcpPath)).toBe(true);

    const config = JSON.parse(readFileSync(mcpPath, 'utf-8'));
    expect(config.mcpServers).toBeDefined();
    expect(config.mcpServers['open-knowledge']).toEqual({
      command: 'npx',
      args: ['@inkeep/open-knowledge', 'mcp'],
    });
  });

  it('preserves other mcpServers entries when adding open-knowledge', () => {
    // Pre-existing .mcp.json with a different server
    writeFileSync(
      join(testDir, '.mcp.json'),
      JSON.stringify(
        {
          mcpServers: {
            someOtherServer: {
              command: 'node',
              args: ['./other.js'],
            },
          },
        },
        null,
        2,
      ),
    );

    const result = runInit({ cwd: testDir });
    expect(result.mcpAction).toBe('written');

    const config = JSON.parse(readFileSync(join(testDir, '.mcp.json'), 'utf-8'));
    expect(config.mcpServers.someOtherServer).toEqual({
      command: 'node',
      args: ['./other.js'],
    });
    expect(config.mcpServers['open-knowledge']).toBeDefined();
  });

  it('skips existing open-knowledge entry by default', () => {
    // Pre-existing entry with a different command (e.g., dev path)
    writeFileSync(
      join(testDir, '.mcp.json'),
      JSON.stringify(
        {
          mcpServers: {
            'open-knowledge': {
              command: 'node',
              args: ['./packages/cli/dist/cli.mjs', 'mcp'],
            },
          },
        },
        null,
        2,
      ),
    );

    const result = runInit({ cwd: testDir });
    expect(result.mcpAction).toBe('skipped-existing');

    // Dev-path entry should be preserved
    const config = JSON.parse(readFileSync(join(testDir, '.mcp.json'), 'utf-8'));
    expect(config.mcpServers['open-knowledge'].command).toBe('node');
    expect(config.mcpServers['open-knowledge'].args).toEqual([
      './packages/cli/dist/cli.mjs',
      'mcp',
    ]);
  });

  it('overwrites existing open-knowledge entry with --force', () => {
    writeFileSync(
      join(testDir, '.mcp.json'),
      JSON.stringify(
        {
          mcpServers: {
            'open-knowledge': {
              command: 'node',
              args: ['./old/path.js'],
            },
          },
        },
        null,
        2,
      ),
    );

    const result = runInit({ cwd: testDir, force: true });
    expect(result.mcpAction).toBe('overwritten');

    const config = JSON.parse(readFileSync(join(testDir, '.mcp.json'), 'utf-8'));
    expect(config.mcpServers['open-knowledge']).toEqual({
      command: 'npx',
      args: ['@inkeep/open-knowledge', 'mcp'],
    });
  });

  it('does not touch .mcp.json when --no-mcp is passed', () => {
    const result = runInit({ cwd: testDir, mcp: false });

    expect(result.mcpAction).toBe('skipped-flag');
    expect(existsSync(join(testDir, '.mcp.json'))).toBe(false);

    // But the content IS scaffolded
    expect(existsSync(join(testDir, '.open-knowledge', 'articles'))).toBe(true);
  });

  it('is idempotent — running twice produces the same end state', () => {
    const firstResult = runInit({ cwd: testDir });
    expect(firstResult.mcpAction).toBe('written');
    expect(firstResult.wikiCreated.length).toBeGreaterThan(0);

    const firstConfig = readFileSync(join(testDir, '.mcp.json'), 'utf-8');

    const secondResult = runInit({ cwd: testDir });
    expect(secondResult.mcpAction).toBe('skipped-existing');
    // Content scaffolding is idempotent too — writeIfMissing skips existing files
    expect(secondResult.wikiCreated.length).toBe(0);
    expect(secondResult.wikiSkipped.length).toBeGreaterThan(0);

    const secondConfig = readFileSync(join(testDir, '.mcp.json'), 'utf-8');
    expect(secondConfig).toBe(firstConfig);
  });

  it('returns failed mcpAction when .mcp.json is invalid JSON', () => {
    writeFileSync(join(testDir, '.mcp.json'), '{not valid json');

    const result = runInit({ cwd: testDir });
    expect(result.mcpAction).toBe('failed');
    expect(result.mcpError).toMatch(/invalid JSON/i);

    // Content should still have been scaffolded (best-effort separation)
    expect(existsSync(join(testDir, '.open-knowledge', 'articles'))).toBe(true);
  });
});
