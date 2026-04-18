import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { loadConfig } from '../config/loader.ts';
import { OK_DIR } from '../constants.ts';
import { previewContent } from '../content/preview.ts';
import { ALL_EDITOR_IDS, resolveClaudeDesktopConfigPath } from './editors.ts';
import { detectInstalledEditors, formatInitResult, runInit } from './init.ts';

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

  // -----------------------------------------------------------------------
  // Original tests — backward compat (default editors: ['claude'])
  // -----------------------------------------------------------------------

  it('scaffolds .open-knowledge/ and writes a fresh .mcp.json', () => {
    const result = runInit({ cwd: testDir });

    expect(result.contentCreated.length).toBeGreaterThan(0);
    // Post-V0-24.2 scaffold: config-only, no content subdirs
    expect(existsSync(join(testDir, OK_DIR, 'cache'))).toBe(true);
    expect(existsSync(join(testDir, OK_DIR, 'AGENTS.md'))).toBe(true);
    expect(existsSync(join(testDir, OK_DIR, 'config.yml'))).toBe(true);
    expect(existsSync(join(testDir, OK_DIR, 'articles'))).toBe(false);
    expect(existsSync(join(testDir, OK_DIR, 'external-sources'))).toBe(false);
    expect(existsSync(join(testDir, OK_DIR, 'research'))).toBe(false);

    // Backward-compat fields
    expect(result.mcpAction).toBe('written');
    const mcpPath = join(testDir, '.mcp.json');
    expect(existsSync(mcpPath)).toBe(true);

    const config = JSON.parse(readFileSync(mcpPath, 'utf-8'));
    expect(config.mcpServers).toBeDefined();
    expect(config.mcpServers[result.editors[0].serverName]).toEqual({
      command: 'npx',
      args: ['@inkeep/open-knowledge', 'mcp'],
    });

    // New editors array
    expect(result.editors).toHaveLength(1);
    expect(result.editors[0].editorId).toBe('claude');
    expect(result.editors[0].action).toBe('written');
  });

  it('preserves other mcpServers entries when adding open-knowledge', () => {
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
    expect(config.mcpServers[result.editors[0].serverName]).toBeDefined();
  });

  it('flags a differing open-knowledge entry by default and leaves it untouched', () => {
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
    expect(result.mcpAction).toBe('skipped-conflict');
    expect(result.editors[0].action).toBe('skipped-conflict');

    const config = JSON.parse(readFileSync(join(testDir, '.mcp.json'), 'utf-8'));
    expect(config.mcpServers['open-knowledge'].command).toBe('node');
    expect(config.mcpServers['open-knowledge'].args).toEqual([
      './packages/cli/dist/cli.mjs',
      'mcp',
    ]);
  });

  it('skips an identical open-knowledge entry by default', () => {
    writeFileSync(
      join(testDir, '.mcp.json'),
      JSON.stringify(
        {
          mcpServers: {
            'open-knowledge': {
              command: 'npx',
              args: ['@inkeep/open-knowledge', 'mcp'],
            },
          },
        },
        null,
        2,
      ),
    );

    const result = runInit({ cwd: testDir });
    expect(result.mcpAction).toBe('skipped-existing');
    expect(result.editors[0].action).toBe('skipped-existing');
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

    // But the .open-knowledge/ config scaffold IS created
    expect(existsSync(join(testDir, OK_DIR, 'AGENTS.md'))).toBe(true);
    expect(existsSync(join(testDir, OK_DIR, 'config.yml'))).toBe(true);
  });

  it('is idempotent — running twice produces the same end state', () => {
    const firstResult = runInit({ cwd: testDir });
    expect(firstResult.mcpAction).toBe('written');
    expect(firstResult.contentCreated.length).toBeGreaterThan(0);

    const firstConfig = readFileSync(join(testDir, '.mcp.json'), 'utf-8');

    const secondResult = runInit({ cwd: testDir });
    expect(secondResult.mcpAction).toBe('skipped-existing');
    expect(secondResult.contentCreated.length).toBe(0);
    expect(secondResult.contentSkipped.length).toBeGreaterThan(0);

    const secondConfig = readFileSync(join(testDir, '.mcp.json'), 'utf-8');
    expect(secondConfig).toBe(firstConfig);
  });

  it('returns failed mcpAction when .mcp.json is invalid JSON', () => {
    writeFileSync(join(testDir, '.mcp.json'), '{not valid json');

    const result = runInit({ cwd: testDir });
    expect(result.mcpAction).toBe('failed');
    expect(result.mcpError).toMatch(/invalid JSON/i);

    // Config scaffold should still have been created
    expect(existsSync(join(testDir, OK_DIR, 'AGENTS.md'))).toBe(true);
  });

  // -----------------------------------------------------------------------
  // Multi-editor tests
  // -----------------------------------------------------------------------

  describe('Cursor', () => {
    it('writes .cursor/mcp.json with mcpServers key', () => {
      const result = runInit({ cwd: testDir, editors: ['cursor'] });

      expect(result.editors).toHaveLength(1);
      expect(result.editors[0].editorId).toBe('cursor');
      expect(result.editors[0].action).toBe('written');

      const configPath = join(testDir, '.cursor', 'mcp.json');
      expect(existsSync(configPath)).toBe(true);

      const config = JSON.parse(readFileSync(configPath, 'utf-8'));
      expect(config.mcpServers[result.editors[0].serverName]).toEqual({
        command: 'npx',
        args: ['@inkeep/open-knowledge', 'mcp'],
      });
    });

    it('preserves existing Cursor MCP entries', () => {
      mkdirSync(join(testDir, '.cursor'), { recursive: true });
      writeFileSync(
        join(testDir, '.cursor', 'mcp.json'),
        JSON.stringify({ mcpServers: { other: { command: 'node', args: ['x'] } } }, null, 2),
      );

      const result = runInit({ cwd: testDir, editors: ['cursor'] });
      expect(result.editors[0].action).toBe('written');

      const config = JSON.parse(readFileSync(join(testDir, '.cursor', 'mcp.json'), 'utf-8'));
      expect(config.mcpServers.other).toEqual({ command: 'node', args: ['x'] });
      expect(config.mcpServers[result.editors[0].serverName]).toBeDefined();
    });
  });

  describe('VS Code', () => {
    it('writes .vscode/mcp.json with servers key and type: stdio', () => {
      const result = runInit({ cwd: testDir, editors: ['vscode'] });

      expect(result.editors).toHaveLength(1);
      expect(result.editors[0].editorId).toBe('vscode');
      expect(result.editors[0].action).toBe('written');

      const configPath = join(testDir, '.vscode', 'mcp.json');
      expect(existsSync(configPath)).toBe(true);

      const config = JSON.parse(readFileSync(configPath, 'utf-8'));
      // VS Code uses 'servers' not 'mcpServers'
      expect(config.servers).toBeDefined();
      expect(config.mcpServers).toBeUndefined();
      expect(config.servers[result.editors[0].serverName]).toEqual({
        type: 'stdio',
        command: 'npx',
        args: ['@inkeep/open-knowledge', 'mcp'],
      });
    });
  });

  describe('Claude Desktop', () => {
    it('writes the same simple global open-knowledge entry as the local editors', () => {
      const fakeHome = join(testDir, 'fakehome');
      mkdirSync(fakeHome, { recursive: true });

      const result = runInit({ cwd: testDir, editors: ['claude-desktop'], home: fakeHome });

      expect(result.editors).toHaveLength(1);
      expect(result.editors[0].editorId).toBe('claude-desktop');
      expect(result.editors[0].action).toBe('written');
      expect(result.editors[0].serverName).toBe('open-knowledge');

      const configPath = resolveClaudeDesktopConfigPath({ home: fakeHome });
      expect(existsSync(configPath)).toBe(true);

      const config = JSON.parse(readFileSync(configPath, 'utf-8'));
      const entry = config.mcpServers[result.editors[0].serverName];

      expect(entry).toEqual({
        command: 'npx',
        args: ['@inkeep/open-knowledge', 'mcp'],
      });
    });

    it('flags existing claude-desktop drift by default and leaves it untouched', () => {
      const fakeHome = join(testDir, 'fakehome');
      mkdirSync(fakeHome, { recursive: true });

      const configPath = resolveClaudeDesktopConfigPath({ home: fakeHome });
      const configDir = dirname(configPath);
      mkdirSync(configDir, { recursive: true });

      // First run to create the entry with the correct serverName
      const firstResult = runInit({
        cwd: testDir,
        editors: ['claude-desktop'],
        home: fakeHome,
      });
      const serverName = firstResult.editors[0].serverName;
      if (!serverName) throw new Error('Expected serverName');

      // Now corrupt it with old data to test upsert
      const config = JSON.parse(readFileSync(configPath, 'utf-8'));
      config.mcpServers[serverName] = {
        command: 'npx',
        args: ['some-old-package', 'mcp'],
      };
      writeFileSync(configPath, JSON.stringify(config, null, 2));

      const secondResult = runInit({
        cwd: testDir,
        editors: ['claude-desktop'],
        home: fakeHome,
      });

      expect(secondResult.editors[0].action).toBe('skipped-conflict');

      const updatedConfig = JSON.parse(readFileSync(configPath, 'utf-8'));
      const entry = updatedConfig.mcpServers[secondResult.editors[0].serverName];
      expect(entry).toEqual({
        command: 'npx',
        args: ['some-old-package', 'mcp'],
      });
    });
  });

  describe('Windsurf', () => {
    it('writes to global path using home override', () => {
      const fakeHome = join(testDir, 'fakehome');
      mkdirSync(fakeHome, { recursive: true });

      const result = runInit({ cwd: testDir, editors: ['windsurf'], home: fakeHome });

      expect(result.editors).toHaveLength(1);
      expect(result.editors[0].editorId).toBe('windsurf');
      expect(result.editors[0].action).toBe('written');

      const configPath = join(fakeHome, '.codeium', 'windsurf', 'mcp_config.json');
      expect(existsSync(configPath)).toBe(true);

      const config = JSON.parse(readFileSync(configPath, 'utf-8'));
      expect(config.mcpServers[result.editors[0].serverName]).toEqual({
        command: 'npx',
        args: ['@inkeep/open-knowledge', 'mcp'],
      });
    });
  });

  describe('multi-editor', () => {
    it('writes Claude + Cursor configs in a single run', () => {
      const result = runInit({ cwd: testDir, editors: ['claude', 'cursor'] });

      expect(result.editors).toHaveLength(2);
      expect(result.editors[0].editorId).toBe('claude');
      expect(result.editors[0].action).toBe('written');
      expect(result.editors[1].editorId).toBe('cursor');
      expect(result.editors[1].action).toBe('written');

      expect(existsSync(join(testDir, '.mcp.json'))).toBe(true);
      expect(existsSync(join(testDir, '.cursor', 'mcp.json'))).toBe(true);
    });

    it('writes all supported editors with editors: all', () => {
      const fakeHome = join(testDir, 'fakehome');
      mkdirSync(fakeHome, { recursive: true });

      const result = runInit({
        cwd: testDir,
        editors: [...ALL_EDITOR_IDS],
        home: fakeHome,
      });

      expect(result.editors).toHaveLength(5);
      for (const editor of result.editors) {
        expect(editor.action).toBe('written');
      }

      expect(existsSync(join(testDir, '.mcp.json'))).toBe(true);
      expect(existsSync(resolveClaudeDesktopConfigPath({ home: fakeHome }))).toBe(true);
      expect(existsSync(join(testDir, '.cursor', 'mcp.json'))).toBe(true);
      expect(existsSync(join(testDir, '.vscode', 'mcp.json'))).toBe(true);
      expect(existsSync(join(fakeHome, '.codeium', 'windsurf', 'mcp_config.json'))).toBe(true);
    });

    it('--force overwrites across all targeted editors', () => {
      // Pre-populate Claude and Cursor with old entries
      writeFileSync(
        join(testDir, '.mcp.json'),
        JSON.stringify({
          mcpServers: { 'open-knowledge': { command: 'old', args: [] } },
        }),
      );
      mkdirSync(join(testDir, '.cursor'), { recursive: true });
      writeFileSync(
        join(testDir, '.cursor', 'mcp.json'),
        JSON.stringify({
          mcpServers: { 'open-knowledge': { command: 'old', args: [] } },
        }),
      );

      const result = runInit({
        cwd: testDir,
        editors: ['claude', 'cursor'],
        force: true,
      });

      expect(result.editors[0].action).toBe('overwritten');
      expect(result.editors[1].action).toBe('overwritten');

      const claude = JSON.parse(readFileSync(join(testDir, '.mcp.json'), 'utf-8'));
      expect(claude.mcpServers[result.editors[0].serverName].command).toBe('npx');

      const cursor = JSON.parse(readFileSync(join(testDir, '.cursor', 'mcp.json'), 'utf-8'));
      expect(cursor.mcpServers[result.editors[1].serverName].command).toBe('npx');
    });

    it('partial failure — one editor fails, others succeed', () => {
      // Write invalid JSON to Cursor config
      mkdirSync(join(testDir, '.cursor'), { recursive: true });
      writeFileSync(join(testDir, '.cursor', 'mcp.json'), '{broken');

      const result = runInit({ cwd: testDir, editors: ['claude', 'cursor'] });

      expect(result.editors[0].editorId).toBe('claude');
      expect(result.editors[0].action).toBe('written');
      expect(result.editors[1].editorId).toBe('cursor');
      expect(result.editors[1].action).toBe('failed');
      expect(result.editors[1].error).toMatch(/invalid JSON/i);
    });

    it('idempotent per-editor across two runs', () => {
      const first = runInit({ cwd: testDir, editors: ['claude', 'cursor'] });
      expect(first.editors.every((e) => e.action === 'written')).toBe(true);

      const second = runInit({ cwd: testDir, editors: ['claude', 'cursor'] });
      expect(second.editors.every((e) => e.action === 'skipped-existing')).toBe(true);
    });

    it('--no-mcp skips all editors', () => {
      const result = runInit({
        cwd: testDir,
        editors: ['claude', 'cursor', 'vscode'],
        mcp: false,
      });

      expect(result.editors).toHaveLength(3);
      for (const editor of result.editors) {
        expect(editor.action).toBe('skipped-flag');
      }
      expect(existsSync(join(testDir, '.mcp.json'))).toBe(false);
      expect(existsSync(join(testDir, '.cursor', 'mcp.json'))).toBe(false);
      expect(existsSync(join(testDir, '.vscode', 'mcp.json'))).toBe(false);
    });
  });

  // -----------------------------------------------------------------------
  // Claude Code launch.json scaffolding (US-009 / D-020 / D-031)
  // -----------------------------------------------------------------------

  describe('launch.json scaffolding', () => {
    it('writes a fresh .claude/launch.json pointing at open-knowledge ui', () => {
      const result = runInit({ cwd: testDir });

      expect(result.launchJson).toBeDefined();
      expect(result.launchJson?.action).toBe('created');

      const configPath = join(testDir, '.claude', 'launch.json');
      expect(existsSync(configPath)).toBe(true);
      const parsed = JSON.parse(readFileSync(configPath, 'utf-8'));

      expect(parsed.configurations).toHaveLength(1);
      const entry = parsed.configurations[0];
      expect(entry.name).toBe('open-knowledge-ui');
      expect(entry.runtimeExecutable).toBe('npx');
      expect(entry.runtimeArgs).toEqual(['@inkeep/open-knowledge', 'ui']);
      expect(entry.port).toBe(3000);
      expect(entry.autoPort).toBeUndefined();
    });

    it('flags a stale open-knowledge-ui entry without --force', () => {
      const configPath = join(testDir, '.claude', 'launch.json');
      mkdirSync(join(testDir, '.claude'), { recursive: true });
      writeFileSync(
        configPath,
        JSON.stringify(
          {
            version: '0.0.1',
            configurations: [
              {
                name: 'open-knowledge-ui',
                runtimeExecutable: 'npx',
                runtimeArgs: ['open-knowledge', 'start'],
                port: 3000,
              },
            ],
          },
          null,
          2,
        ),
      );

      const result = runInit({ cwd: testDir });
      expect(result.launchJson?.action).toBe('skipped-stale');
      expect(result.launchJson?.staleFields).toEqual(expect.arrayContaining(['runtimeArgs']));

      // Unchanged — still the old shape (user must re-run with --force)
      const parsed = JSON.parse(readFileSync(configPath, 'utf-8'));
      expect(parsed.configurations[0].runtimeArgs).toEqual(['open-knowledge', 'start']);
    });

    it('skips an up-to-date open-knowledge-ui entry without --force', () => {
      const configPath = join(testDir, '.claude', 'launch.json');
      mkdirSync(join(testDir, '.claude'), { recursive: true });
      writeFileSync(
        configPath,
        JSON.stringify(
          {
            version: '0.0.1',
            configurations: [
              {
                name: 'open-knowledge-ui',
                runtimeExecutable: 'npx',
                runtimeArgs: ['@inkeep/open-knowledge', 'ui'],
                port: 3000,
              },
            ],
          },
          null,
          2,
        ),
      );

      const result = runInit({ cwd: testDir });
      expect(result.launchJson?.action).toBe('skipped-existing');
      expect(result.launchJson?.staleFields).toBeUndefined();
    });

    it('migrates an existing open-knowledge-ui entry on --force', () => {
      const configPath = join(testDir, '.claude', 'launch.json');
      mkdirSync(join(testDir, '.claude'), { recursive: true });
      writeFileSync(
        configPath,
        JSON.stringify(
          {
            version: '0.0.1',
            configurations: [
              {
                name: 'open-knowledge-ui',
                runtimeExecutable: 'npx',
                runtimeArgs: ['open-knowledge', 'start'],
                port: 3000,
              },
            ],
          },
          null,
          2,
        ),
      );

      const result = runInit({ cwd: testDir, force: true });
      expect(result.launchJson?.action).toBe('merged');

      const parsed = JSON.parse(readFileSync(configPath, 'utf-8'));
      expect(parsed.configurations).toHaveLength(1);
      const entry = parsed.configurations[0];
      expect(entry.runtimeArgs).toEqual(['@inkeep/open-knowledge', 'ui']);
      expect(entry.port).toBe(3000);
      expect(entry.autoPort).toBeUndefined();
    });

    it('merges the new entry into an existing launch.json with other configurations', () => {
      const configPath = join(testDir, '.claude', 'launch.json');
      mkdirSync(join(testDir, '.claude'), { recursive: true });
      writeFileSync(
        configPath,
        JSON.stringify(
          {
            version: '0.0.1',
            configurations: [
              {
                name: 'some-other-server',
                runtimeExecutable: 'node',
                runtimeArgs: ['./server.js'],
              },
            ],
          },
          null,
          2,
        ),
      );

      const result = runInit({ cwd: testDir });
      expect(result.launchJson?.action).toBe('merged');

      const parsed = JSON.parse(readFileSync(configPath, 'utf-8'));
      expect(parsed.configurations).toHaveLength(2);
      const ok = parsed.configurations.find(
        (c: { name: string }) => c.name === 'open-knowledge-ui',
      );
      expect(ok.runtimeArgs).toEqual(['@inkeep/open-knowledge', 'ui']);
      expect(ok.autoPort).toBeUndefined();
    });

    it('does NOT scaffold launch.json when Claude is not among selected editors', () => {
      const result = runInit({ cwd: testDir, editors: ['cursor'] });
      expect(result.launchJson).toBeUndefined();
      expect(existsSync(join(testDir, '.claude', 'launch.json'))).toBe(false);
    });
  });

  // -----------------------------------------------------------------------
  // Per-editor instruction file injection (from main)
  // -----------------------------------------------------------------------

  describe('per-editor instruction file injection', () => {
    it('writes CLAUDE.md when claude editor is selected', () => {
      const result = runInit({ cwd: testDir, editors: ['claude'] });

      expect(existsSync(join(testDir, 'CLAUDE.md'))).toBe(true);
      expect(readFileSync(join(testDir, 'CLAUDE.md'), 'utf-8')).toContain(
        '<!-- open-knowledge:begin -->',
      );
      const agentsEntry = result.rootInstructions.find((r) => r.file === 'AGENTS.md');
      const claudeEntry = result.rootInstructions.find((r) => r.file === 'CLAUDE.md');
      expect(agentsEntry?.action).toBe('created');
      expect(claudeEntry?.action).toBe('created');
    });

    it('writes only AGENTS.md for cursor (no rule-file scaffolding)', () => {
      const result = runInit({ cwd: testDir, mcp: false, editors: ['cursor'] });

      // AGENTS.md is the tool-agnostic instruction surface; Cursor picks it up natively.
      expect(existsSync(join(testDir, 'AGENTS.md'))).toBe(true);
      expect(existsSync(join(testDir, '.cursorrules'))).toBe(false);
      expect(existsSync(join(testDir, '.cursor', 'rules', 'open-knowledge.mdc'))).toBe(false);
      expect(result.rootInstructions).toHaveLength(1);
      expect(result.rootInstructions[0].file).toBe('AGENTS.md');
    });

    it('writes only AGENTS.md for windsurf (no rule-file scaffolding)', () => {
      const fakeHome = join(testDir, 'fakehome');
      mkdirSync(fakeHome, { recursive: true });
      const result = runInit({ cwd: testDir, mcp: false, editors: ['windsurf'], home: fakeHome });

      expect(existsSync(join(testDir, 'AGENTS.md'))).toBe(true);
      expect(existsSync(join(testDir, '.windsurfrules'))).toBe(false);
      expect(existsSync(join(testDir, '.windsurf', 'rules', 'open-knowledge.md'))).toBe(false);
      expect(result.rootInstructions).toHaveLength(1);
      expect(result.rootInstructions[0].file).toBe('AGENTS.md');
    });

    it('writes no extra instruction files for vscode (no instructionsPath)', () => {
      const result = runInit({ cwd: testDir, mcp: false, editors: ['vscode'] });

      // Only AGENTS.md — vscode has no instructionsPath
      expect(result.rootInstructions).toHaveLength(1);
      expect(result.rootInstructions[0].file).toBe('AGENTS.md');
      expect(existsSync(join(testDir, '.vscoderules'))).toBe(false);
    });

    it('writes AGENTS.md + CLAUDE.md for claude + cursor + windsurf combined', () => {
      const fakeHome = join(testDir, 'fakehome');
      mkdirSync(fakeHome, { recursive: true });
      const result = runInit({
        cwd: testDir,
        mcp: false,
        editors: ['claude', 'cursor', 'windsurf'],
        home: fakeHome,
      });

      // Only Claude has an instructionsPath (CLAUDE.md). Cursor + Windsurf read
      // the root AGENTS.md natively, so no extra files are scaffolded for them.
      expect(existsSync(join(testDir, 'AGENTS.md'))).toBe(true);
      expect(existsSync(join(testDir, 'CLAUDE.md'))).toBe(true);
      expect(existsSync(join(testDir, '.cursor', 'rules', 'open-knowledge.mdc'))).toBe(false);
      expect(existsSync(join(testDir, '.windsurf', 'rules', 'open-knowledge.md'))).toBe(false);
      expect(existsSync(join(testDir, '.cursorrules'))).toBe(false);
      expect(existsSync(join(testDir, '.windsurfrules'))).toBe(false);
      expect(result.rootInstructions).toHaveLength(2);
    });
  });

  // -----------------------------------------------------------------------
  // Content preview integration (US-002)
  // -----------------------------------------------------------------------

  describe('content preview in init output', () => {
    it('renders Content block with file count and sample when preview succeeds', () => {
      writeFileSync(join(testDir, 'readme.md'), '# Readme');
      mkdirSync(join(testDir, 'docs'));
      writeFileSync(join(testDir, 'docs', 'guide.md'), '# Guide');

      const result = runInit({ cwd: testDir, mcp: false });

      const preview = previewContent({
        projectDir: testDir,
        contentDir: testDir,
        include: ['**/*.md'],
        exclude: [],
      });
      result.preview = preview;

      const output = formatInitResult(result, testDir);
      expect(output).toContain('Content:');
      expect(output).toContain(`Found ${preview.totalCount} markdown files`);
      expect(output).toContain('Scope: include=');
      expect(output).toContain('Re-check anytime: open-knowledge preview');
    });

    it('renders warning line when preview is undefined with previewWarning', () => {
      const result = runInit({ cwd: testDir, mcp: false });
      result.preview = undefined;
      result.previewWarning = 'something went wrong';

      const output = formatInitResult(result, testDir);
      expect(output).toContain('Content preview unavailable: something went wrong');
      expect(output).not.toContain('Found');
    });

    it('omits Sample line when preview.totalCount is 0', () => {
      const result = runInit({ cwd: testDir, mcp: false });
      result.preview = {
        totalCount: 0,
        sample: [],
        contentDir: testDir,
        include: ['**/*.md'],
        exclude: [],
        warnings: [],
      };

      const output = formatInitResult(result, testDir);
      expect(output).toContain('Found 0 markdown files');
      expect(output).not.toContain('Sample:');
    });

    it('renders rerun-with-force guidance when an MCP entry differs from defaults', () => {
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
      const output = formatInitResult(result, testDir);
      expect(result.editors[0].action).toBe('skipped-conflict');
      expect(output).toContain('differs from current defaults');
      expect(output).toContain('re-run with --force to replace');
    });

    it('loadConfig + previewContent integration: preview picks up scaffolded config', () => {
      writeFileSync(join(testDir, 'readme.md'), '# Readme');
      mkdirSync(join(testDir, 'docs'));
      writeFileSync(join(testDir, 'docs', 'guide.md'), '# Guide');

      const result = runInit({ cwd: testDir, mcp: false });

      const { config } = loadConfig(testDir);
      const contentDir = resolve(testDir, config.content.dir);
      const preview = previewContent({
        projectDir: testDir,
        contentDir,
        include: config.content.include,
        exclude: config.content.exclude,
      });
      result.preview = preview;

      expect(preview.totalCount).toBeGreaterThanOrEqual(2);
      expect(preview.sample.some((p) => p.includes('readme.md'))).toBe(true);

      const output = formatInitResult(result, testDir);
      expect(output).toContain('Content:');
      expect(output).toContain(`Found ${preview.totalCount} markdown files`);
    });
  });
});

// ---------------------------------------------------------------------------
// detectInstalledEditors — US-013 / FR-3.1 / D-013
// ---------------------------------------------------------------------------

describe('detectInstalledEditors', () => {
  let testDir: string;
  let fakeHome: string;

  beforeEach(() => {
    testDir = resolve(
      tmpdir(),
      `detect-editors-test-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    );
    mkdirSync(testDir, { recursive: true });
    fakeHome = join(testDir, 'fakehome');
    mkdirSync(fakeHome, { recursive: true });
  });

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  it('always detects Claude because its config dir is cwd itself', () => {
    // No sibling dirs created; Claude's configPath is <cwd>/.mcp.json → dirname is cwd → exists
    const detected = detectInstalledEditors(testDir, fakeHome);
    expect(detected).toContain('claude');
  });

  it('detects Cursor when .cursor/ exists', () => {
    mkdirSync(join(testDir, '.cursor'), { recursive: true });
    const detected = detectInstalledEditors(testDir, fakeHome);
    expect(detected).toContain('cursor');
  });

  it('does NOT detect Cursor when .cursor/ is absent', () => {
    const detected = detectInstalledEditors(testDir, fakeHome);
    expect(detected).not.toContain('cursor');
  });

  it('detects VS Code when .vscode/ exists', () => {
    mkdirSync(join(testDir, '.vscode'), { recursive: true });
    const detected = detectInstalledEditors(testDir, fakeHome);
    expect(detected).toContain('vscode');
  });

  it('detects Claude Desktop when its config directory exists', () => {
    mkdirSync(join(resolveClaudeDesktopConfigPath({ home: fakeHome }), '..'), { recursive: true });
    const detected = detectInstalledEditors(testDir, fakeHome);
    expect(detected).toContain('claude-desktop');
  });

  it('does NOT detect Claude Desktop when its config dir is absent', () => {
    const detected = detectInstalledEditors(testDir, fakeHome);
    expect(detected).not.toContain('claude-desktop');
  });

  it('detects Windsurf when ~/.codeium/windsurf/ exists (via home override)', () => {
    mkdirSync(join(fakeHome, '.codeium', 'windsurf'), { recursive: true });
    const detected = detectInstalledEditors(testDir, fakeHome);
    expect(detected).toContain('windsurf');
  });

  it('does NOT detect Windsurf when ~/.codeium/windsurf/ is absent', () => {
    const detected = detectInstalledEditors(testDir, fakeHome);
    expect(detected).not.toContain('windsurf');
  });

  it('returns all supported editors when all editor config dirs exist', () => {
    mkdirSync(join(resolveClaudeDesktopConfigPath({ home: fakeHome }), '..'), { recursive: true });
    mkdirSync(join(testDir, '.cursor'), { recursive: true });
    mkdirSync(join(testDir, '.vscode'), { recursive: true });
    mkdirSync(join(fakeHome, '.codeium', 'windsurf'), { recursive: true });
    const detected = detectInstalledEditors(testDir, fakeHome);
    expect(detected).toEqual(expect.arrayContaining([...ALL_EDITOR_IDS]));
    expect(detected).toHaveLength(5);
  });

  it('preserves EDITOR_TARGETS ordering in return value', () => {
    mkdirSync(join(resolveClaudeDesktopConfigPath({ home: fakeHome }), '..'), { recursive: true });
    mkdirSync(join(testDir, '.cursor'), { recursive: true });
    mkdirSync(join(testDir, '.vscode'), { recursive: true });
    const detected = detectInstalledEditors(testDir, fakeHome);
    // Order comes from ALL_EDITOR_IDS = ['claude', 'claude-desktop', 'cursor', 'vscode', 'windsurf']
    expect(detected).toEqual(['claude', 'claude-desktop', 'cursor', 'vscode']);
  });

  it('returns empty list when the cwd itself does not exist (zero-detected edge case)', () => {
    // Synthesizes the "zero detected" non-TTY fallback path that exit 1s.
    // In real filesystems, cwd always exists (so Claude is always detected),
    // but with a synthetic nonexistent cwd + home, every editor's dirname
    // misses → no detections.
    const missingCwd = join(testDir, 'does-not-exist');
    const missingHome = join(testDir, 'also-not-here');
    const detected = detectInstalledEditors(missingCwd, missingHome);
    expect(detected).toEqual([]);
  });
});
