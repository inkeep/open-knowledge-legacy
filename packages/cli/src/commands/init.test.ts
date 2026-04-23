import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { loadConfig } from '../config/loader.ts';
import { OK_DIR } from '../constants.ts';
import { previewContent } from '../content/preview.ts';
import {
  ALL_EDITOR_IDS,
  EDITOR_TARGETS,
  resolveClaudeCodeConfigPath,
  resolveClaudeDesktopConfigPath,
  resolveCodexConfigPath,
  resolveCursorConfigPath,
  resolveVsCodeConfigPath,
  resolveWindsurfConfigPath,
} from './editors.ts';
// `parseEditorFlag` removed by main PR #282 (#295) along with the `--editors`
// CLI flag — `ok init` now installs for a canonical default set instead of
// user-specified subsets. US-006's `writeUserMcpConfigs` exports are M6b-only
// additions that survive on top of main's refactor.
import {
  detectInstalledEditors,
  type EditorMcpResult,
  formatInitResult,
  readExistingMcpEntry,
  runInit,
  type UserMcpConfigsOptions,
  writeEditorMcpConfig,
  writeUserMcpConfigs,
} from './init.ts';

describe('runInit', () => {
  let testDir: string;
  let fakeHome: string;
  const originalPlatform = process.platform;
  const originalHome = process.env.HOME;

  const claudeConfigPath = () => resolveClaudeCodeConfigPath({ home: fakeHome });
  const cursorConfigPath = () => resolveCursorConfigPath({ home: fakeHome });
  const vsCodeConfigPath = () => resolveVsCodeConfigPath({ home: fakeHome });
  const codexConfigPath = () => resolveCodexConfigPath({ home: fakeHome, env: {} });
  const windsurfConfigPath = () => resolveWindsurfConfigPath({ home: fakeHome });
  const devRepoRoot = () => join(testDir, 'local-open-knowledge');
  const devCliEntryPath = () => join(devRepoRoot(), 'packages', 'cli', 'src', 'cli.ts');
  const expectedDevMcpEntry = () => ({
    command: 'node',
    args: [join(devRepoRoot(), 'packages', 'cli', 'dist', 'cli.mjs'), 'mcp'],
    env: {
      MCP_DEBUG: '1',
      OK_LOG_FILE: '/tmp/ok-mcp.log',
    },
  });
  const expectedDevLaunchEntry = () => ({
    name: 'open-knowledge-ui',
    runtimeExecutable: 'node',
    runtimeArgs: [join(devRepoRoot(), 'packages', 'cli', 'dist', 'cli.mjs'), 'ui'],
    port: 3000,
  });
  const runInitForTest = async (options: Parameters<typeof runInit>[0] = {}) =>
    runInit({ cwd: testDir, home: fakeHome, ...options });

  beforeEach(() => {
    testDir = resolve(
      tmpdir(),
      `init-command-test-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    );
    mkdirSync(testDir, { recursive: true });
    fakeHome = join(testDir, 'fakehome');
    mkdirSync(fakeHome, { recursive: true });
    mkdirSync(join(fakeHome, '.claude'), { recursive: true });
    process.env.HOME = fakeHome;
    Object.defineProperty(process, 'platform', { value: 'darwin', configurable: true });
  });

  afterEach(() => {
    Object.defineProperty(process, 'platform', {
      value: originalPlatform,
      configurable: true,
    });
    if (originalHome === undefined) {
      delete process.env.HOME;
    } else {
      process.env.HOME = originalHome;
    }
    rmSync(testDir, { recursive: true, force: true });
  });

  // -----------------------------------------------------------------------
  // Original tests — backward compat (default editors: ['claude'])
  // -----------------------------------------------------------------------

  it('scaffolds .open-knowledge/ and writes a fresh global Claude config', async () => {
    const result = await runInitForTest();

    expect(result.contentCreated.length).toBeGreaterThan(0);
    // Post-V0-24.2 scaffold: config-only, no content subdirs
    expect(existsSync(join(testDir, OK_DIR, 'cache'))).toBe(true);
    expect(existsSync(join(testDir, OK_DIR, 'AGENTS.md'))).toBe(true);
    expect(existsSync(join(testDir, OK_DIR, 'config.yml'))).toBe(true);
    expect(existsSync(join(testDir, OK_DIR, 'articles'))).toBe(false);
    expect(existsSync(join(testDir, OK_DIR, 'external-sources'))).toBe(false);
    expect(existsSync(join(testDir, OK_DIR, 'research'))).toBe(false);
    expect(existsSync(join(fakeHome, '.codeium'))).toBe(false);

    // Backward-compat fields
    expect(result.mcpAction).toBe('written');
    const mcpPath = claudeConfigPath();
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

  it('preserves other mcpServers entries when adding open-knowledge', async () => {
    writeFileSync(
      claudeConfigPath(),
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

    const result = await runInitForTest();
    expect(result.mcpAction).toBe('written');

    const config = JSON.parse(readFileSync(claudeConfigPath(), 'utf-8'));
    expect(config.mcpServers.someOtherServer).toEqual({
      command: 'node',
      args: ['./other.js'],
    });
    expect(config.mcpServers[result.editors[0].serverName]).toBeDefined();
  });

  it('writes a local dev MCP entry when --dev-mcp is enabled', async () => {
    const result = await runInitForTest({ devMcp: true, cliEntryPath: devCliEntryPath() });

    expect(result.mcpAction).toBe('written');

    const config = JSON.parse(readFileSync(claudeConfigPath(), 'utf-8'));
    expect(config.mcpServers[result.editors[0].serverName]).toEqual(expectedDevMcpEntry());
  });

  it('overwrites a differing open-knowledge entry by default', async () => {
    writeFileSync(
      claudeConfigPath(),
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

    const result = await runInitForTest();
    expect(result.mcpAction).toBe('overwritten');
    expect(result.editors[0].action).toBe('overwritten');

    const config = JSON.parse(readFileSync(claudeConfigPath(), 'utf-8'));
    expect(config.mcpServers['open-knowledge']).toEqual({
      command: 'npx',
      args: ['@inkeep/open-knowledge', 'mcp'],
    });
  });

  it('replaces user-added fields instead of merging them', async () => {
    writeFileSync(
      claudeConfigPath(),
      JSON.stringify(
        {
          mcpServers: {
            'open-knowledge': {
              command: 'npx',
              args: ['@inkeep/open-knowledge', 'mcp'],
              cwd: testDir,
              env: { OK_MODE: 'local' },
            },
          },
        },
        null,
        2,
      ),
    );

    const result = await runInitForTest();
    expect(result.mcpAction).toBe('overwritten');
    expect(result.editors[0].action).toBe('overwritten');

    const config = JSON.parse(readFileSync(claudeConfigPath(), 'utf-8'));
    expect(config.mcpServers['open-knowledge']).toEqual({
      command: 'npx',
      args: ['@inkeep/open-knowledge', 'mcp'],
    });
  });

  it('overwrites a published MCP entry in dev mode', async () => {
    writeFileSync(
      claudeConfigPath(),
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

    const result = await runInitForTest({ devMcp: true, cliEntryPath: devCliEntryPath() });
    expect(result.mcpAction).toBe('overwritten');
    expect(result.editors[0].action).toBe('overwritten');

    const config = JSON.parse(readFileSync(claudeConfigPath(), 'utf-8'));
    expect(config.mcpServers['open-knowledge']).toEqual(expectedDevMcpEntry());
  });

  it('does not touch ~/.claude.json when --no-mcp is passed', async () => {
    const result = await runInitForTest({ mcp: false });

    expect(result.mcpAction).toBe('skipped-flag');
    expect(existsSync(claudeConfigPath())).toBe(false);

    // But the .open-knowledge/ config scaffold IS created
    expect(existsSync(join(testDir, OK_DIR, 'AGENTS.md'))).toBe(true);
    expect(existsSync(join(testDir, OK_DIR, 'config.yml'))).toBe(true);
  });

  it('is idempotent — running twice produces the same end state', async () => {
    const firstResult = await runInitForTest();
    expect(firstResult.mcpAction).toBe('written');
    expect(firstResult.contentCreated.length).toBeGreaterThan(0);

    const firstConfig = readFileSync(claudeConfigPath(), 'utf-8');

    const secondResult = await runInitForTest();
    expect(secondResult.mcpAction).toBe('overwritten');
    expect(secondResult.contentCreated.length).toBe(0);
    expect(secondResult.contentSkipped.length).toBeGreaterThan(0);

    const secondConfig = readFileSync(claudeConfigPath(), 'utf-8');
    expect(secondConfig).toBe(firstConfig);
  });

  it('returns failed mcpAction when ~/.claude.json is invalid JSON', async () => {
    writeFileSync(claudeConfigPath(), '{not valid json');

    const result = await runInitForTest();
    expect(result.mcpAction).toBe('failed');
    expect(result.mcpError).toMatch(/invalid JSON/i);

    // Config scaffold should still have been created
    expect(existsSync(join(testDir, OK_DIR, 'AGENTS.md'))).toBe(true);
  });

  // -----------------------------------------------------------------------
  // Multi-editor tests
  // -----------------------------------------------------------------------

  describe('Cursor', () => {
    it('writes ~/.cursor/mcp.json with mcpServers key', async () => {
      mkdirSync(dirname(cursorConfigPath()), { recursive: true });
      const result = await runInitForTest({ editors: ['cursor'] });

      expect(result.editors).toHaveLength(1);
      expect(result.editors[0].editorId).toBe('cursor');
      expect(result.editors[0].action).toBe('written');

      const configPath = cursorConfigPath();
      expect(existsSync(configPath)).toBe(true);

      const config = JSON.parse(readFileSync(configPath, 'utf-8'));
      expect(config.mcpServers[result.editors[0].serverName]).toEqual({
        command: 'npx',
        args: ['@inkeep/open-knowledge', 'mcp'],
      });
    });

    it('preserves existing Cursor MCP entries', async () => {
      mkdirSync(dirname(cursorConfigPath()), { recursive: true });
      writeFileSync(
        cursorConfigPath(),
        JSON.stringify({ mcpServers: { other: { command: 'node', args: ['x'] } } }, null, 2),
      );

      const result = await runInitForTest({ editors: ['cursor'] });
      expect(result.editors[0].action).toBe('written');

      const config = JSON.parse(readFileSync(cursorConfigPath(), 'utf-8'));
      expect(config.mcpServers.other).toEqual({ command: 'node', args: ['x'] });
      expect(config.mcpServers[result.editors[0].serverName]).toBeDefined();
    });
  });

  describe('VS Code', () => {
    it('writes the user VS Code mcp.json with servers key and type: stdio', async () => {
      mkdirSync(dirname(vsCodeConfigPath()), { recursive: true });
      const result = await runInitForTest({ editors: ['vscode'] });

      expect(result.editors).toHaveLength(1);
      expect(result.editors[0].editorId).toBe('vscode');
      expect(result.editors[0].action).toBe('written');

      const configPath = vsCodeConfigPath();
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

  describe('Codex', () => {
    it('writes ~/.codex/config.toml with mcp_servers key', async () => {
      mkdirSync(dirname(codexConfigPath()), { recursive: true });
      const result = await runInitForTest({ editors: ['codex'] });

      expect(result.editors).toHaveLength(1);
      expect(result.editors[0].editorId).toBe('codex');
      expect(result.editors[0].action).toBe('written');

      const configPath = codexConfigPath();
      expect(existsSync(configPath)).toBe(true);

      const config = Bun.TOML.parse(readFileSync(configPath, 'utf-8'));
      expect(config.mcp_servers).toBeDefined();
      expect(config.mcp_servers[result.editors[0].serverName]).toEqual({
        command: 'npx',
        args: ['@inkeep/open-knowledge', 'mcp'],
      });
    });

    it('writes the dev MCP env block to Codex TOML configs', async () => {
      mkdirSync(dirname(codexConfigPath()), { recursive: true });
      const result = await runInitForTest({
        editors: ['codex'],
        devMcp: true,
        cliEntryPath: devCliEntryPath(),
      });

      expect(result.editors).toHaveLength(1);
      expect(result.editors[0].action).toBe('written');

      const config = Bun.TOML.parse(readFileSync(codexConfigPath(), 'utf-8'));
      expect(config.mcp_servers[result.editors[0].serverName]).toEqual(expectedDevMcpEntry());
    });

    it('preserves existing Codex MCP entries', async () => {
      mkdirSync(dirname(codexConfigPath()), { recursive: true });
      writeFileSync(
        codexConfigPath(),
        ['[mcp_servers.other]', 'command = "node"', 'args = ["x"]', ''].join('\n'),
      );

      const result = await runInitForTest({ editors: ['codex'] });
      expect(result.editors[0].action).toBe('written');

      const config = Bun.TOML.parse(readFileSync(codexConfigPath(), 'utf-8'));
      expect(config.mcp_servers.other).toEqual({ command: 'node', args: ['x'] });
      expect(config.mcp_servers[result.editors[0].serverName]).toEqual({
        command: 'npx',
        args: ['@inkeep/open-knowledge', 'mcp'],
      });
    });
  });

  describe('Claude Desktop', () => {
    it('writes the same simple global open-knowledge entry as the local editors', async () => {
      const fakeHome = join(testDir, 'fakehome');
      mkdirSync(fakeHome, { recursive: true });
      mkdirSync(dirname(resolveClaudeDesktopConfigPath({ home: fakeHome })), { recursive: true });

      const result = await runInitForTest({ editors: ['claude-desktop'] });

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

    it('overwrites existing claude-desktop drift by default', async () => {
      const fakeHome = join(testDir, 'fakehome');
      mkdirSync(fakeHome, { recursive: true });

      const configPath = resolveClaudeDesktopConfigPath({ home: fakeHome });
      const configDir = dirname(configPath);
      mkdirSync(configDir, { recursive: true });
      writeFileSync(
        configPath,
        JSON.stringify(
          {
            mcpServers: {
              'open-knowledge': {
                command: 'npx',
                args: ['some-old-package', 'mcp'],
              },
            },
          },
          null,
          2,
        ),
      );

      const result = await runInitForTest({ editors: ['claude-desktop'] });

      expect(result.editors[0].action).toBe('overwritten');

      const updatedConfig = JSON.parse(readFileSync(configPath, 'utf-8'));
      const entry = updatedConfig.mcpServers[result.editors[0].serverName];
      expect(entry).toEqual({
        command: 'npx',
        args: ['@inkeep/open-knowledge', 'mcp'],
      });
    });

    it('renders a restart hint after writing the Claude Desktop config', async () => {
      const fakeHome = join(testDir, 'fakehome');
      mkdirSync(fakeHome, { recursive: true });
      mkdirSync(dirname(resolveClaudeDesktopConfigPath({ home: fakeHome })), { recursive: true });

      const result = await runInitForTest({ editors: ['claude-desktop'] });
      const output = formatInitResult(result, testDir);

      expect(output).toContain('quit and relaunch Claude Desktop to activate');
    });

    it('refuses Claude Desktop target on unsupported platforms', async () => {
      Object.defineProperty(process, 'platform', { value: 'linux', configurable: true });

      const result = await runInitForTest({ editors: ['claude-desktop'] });

      expect(result.editors).toHaveLength(1);
      expect(result.editors[0].action).toBe('failed');
      expect(result.editors[0].error).toMatch(
        /Claude Desktop is not available on linux\. Supported: macOS, Windows\./,
      );
    });
  });

  describe('Windsurf', () => {
    it('skips Windsurf when ~/.codeium/windsurf is absent', async () => {
      const fakeHome = join(testDir, 'fakehome');
      mkdirSync(fakeHome, { recursive: true });

      const result = await runInitForTest({ editors: ['windsurf'] });

      expect(result.editors).toHaveLength(1);
      expect(result.editors[0].editorId).toBe('windsurf');
      expect(result.editors[0].action).toBe('skipped-missing');
      expect(existsSync(join(fakeHome, '.codeium'))).toBe(false);
    });

    it('writes to global path using home override when the config root exists', async () => {
      const fakeHome = join(testDir, 'fakehome');
      mkdirSync(fakeHome, { recursive: true });
      mkdirSync(dirname(windsurfConfigPath()), { recursive: true });

      const result = await runInitForTest({ editors: ['windsurf'] });

      expect(result.editors).toHaveLength(1);
      expect(result.editors[0].editorId).toBe('windsurf');
      expect(result.editors[0].action).toBe('written');

      const configPath = windsurfConfigPath();
      expect(existsSync(configPath)).toBe(true);

      const config = JSON.parse(readFileSync(configPath, 'utf-8'));
      expect(config.mcpServers[result.editors[0].serverName]).toEqual({
        command: 'npx',
        args: ['@inkeep/open-knowledge', 'mcp'],
      });
    });
  });

  describe('multi-editor', () => {
    it('writes Claude + Cursor configs in a single run', async () => {
      mkdirSync(dirname(cursorConfigPath()), { recursive: true });
      const result = await runInitForTest({ editors: ['claude', 'cursor'] });

      expect(result.editors).toHaveLength(2);
      expect(result.editors[0].editorId).toBe('claude');
      expect(result.editors[0].action).toBe('written');
      expect(result.editors[1].editorId).toBe('cursor');
      expect(result.editors[1].action).toBe('written');

      expect(existsSync(claudeConfigPath())).toBe(true);
      expect(existsSync(cursorConfigPath())).toBe(true);
    });

    it('writes all supported editors with editors: all', async () => {
      const fakeHome = join(testDir, 'fakehome');
      mkdirSync(fakeHome, { recursive: true });
      mkdirSync(dirname(resolveClaudeDesktopConfigPath({ home: fakeHome })), { recursive: true });
      mkdirSync(dirname(cursorConfigPath()), { recursive: true });
      mkdirSync(dirname(vsCodeConfigPath()), { recursive: true });
      mkdirSync(dirname(codexConfigPath()), { recursive: true });
      mkdirSync(dirname(windsurfConfigPath()), { recursive: true });

      const result = await runInitForTest({ editors: [...ALL_EDITOR_IDS] });

      expect(result.editors).toHaveLength(6);
      for (const editor of result.editors) {
        expect(editor.action).toBe('written');
      }

      expect(existsSync(claudeConfigPath())).toBe(true);
      expect(existsSync(resolveClaudeDesktopConfigPath({ home: fakeHome }))).toBe(true);
      expect(existsSync(cursorConfigPath())).toBe(true);
      expect(existsSync(vsCodeConfigPath())).toBe(true);
      expect(existsSync(codexConfigPath())).toBe(true);
      expect(existsSync(windsurfConfigPath())).toBe(true);
    });

    it('overwrites across all targeted editors', async () => {
      // Pre-populate Claude and Cursor with old entries
      writeFileSync(
        claudeConfigPath(),
        JSON.stringify({
          mcpServers: { 'open-knowledge': { command: 'old', args: [] } },
        }),
      );
      mkdirSync(dirname(cursorConfigPath()), { recursive: true });
      writeFileSync(
        cursorConfigPath(),
        JSON.stringify({
          mcpServers: { 'open-knowledge': { command: 'old', args: [] } },
        }),
      );

      const result = await runInitForTest({
        editors: ['claude', 'cursor'],
      });

      expect(result.editors[0].action).toBe('overwritten');
      expect(result.editors[1].action).toBe('overwritten');

      const claude = JSON.parse(readFileSync(claudeConfigPath(), 'utf-8'));
      expect(claude.mcpServers[result.editors[0].serverName].command).toBe('npx');

      const cursor = JSON.parse(readFileSync(cursorConfigPath(), 'utf-8'));
      expect(cursor.mcpServers[result.editors[1].serverName].command).toBe('npx');
    });

    it('partial failure — one editor fails, others succeed', async () => {
      // Write invalid JSON to Cursor config
      mkdirSync(dirname(cursorConfigPath()), { recursive: true });
      writeFileSync(cursorConfigPath(), '{broken');

      const result = await runInitForTest({ editors: ['claude', 'cursor'] });

      expect(result.editors[0].editorId).toBe('claude');
      expect(result.editors[0].action).toBe('written');
      expect(result.editors[1].editorId).toBe('cursor');
      expect(result.editors[1].action).toBe('failed');
      expect(result.editors[1].error).toMatch(/invalid JSON/i);
    });

    it('idempotent per-editor across two runs', async () => {
      mkdirSync(dirname(cursorConfigPath()), { recursive: true });
      const first = await runInitForTest({ editors: ['claude', 'cursor'] });
      expect(first.editors.every((e) => e.action === 'written')).toBe(true);

      const second = await runInitForTest({ editors: ['claude', 'cursor'] });
      expect(second.editors.every((e) => e.action === 'overwritten')).toBe(true);
    });

    it('--no-mcp skips all editors', async () => {
      const result = await runInitForTest({
        editors: ['claude', 'cursor', 'vscode', 'codex'],
        mcp: false,
      });

      expect(result.editors).toHaveLength(4);
      for (const editor of result.editors) {
        expect(editor.action).toBe('skipped-flag');
      }
      expect(existsSync(claudeConfigPath())).toBe(false);
      expect(existsSync(cursorConfigPath())).toBe(false);
      expect(existsSync(vsCodeConfigPath())).toBe(false);
      expect(existsSync(codexConfigPath())).toBe(false);
    });

    it('surfaces legacy project-local MCP configs after writing global ones', async () => {
      mkdirSync(dirname(cursorConfigPath()), { recursive: true });
      mkdirSync(join(testDir, '.cursor'), { recursive: true });
      writeFileSync(join(testDir, '.mcp.json'), JSON.stringify({ mcpServers: {} }, null, 2));
      writeFileSync(
        join(testDir, '.cursor', 'mcp.json'),
        JSON.stringify({ mcpServers: {} }, null, 2),
      );

      const result = await runInitForTest({ editors: ['claude', 'cursor'] });

      expect(result.legacyProjectConfigs).toEqual(
        expect.arrayContaining([
          { editorId: 'claude', label: 'Claude Code', path: join(testDir, '.mcp.json') },
          { editorId: 'cursor', label: 'Cursor', path: join(testDir, '.cursor', 'mcp.json') },
        ]),
      );

      const output = formatInitResult(result, testDir);
      expect(output).toContain('Legacy project MCP configs detected:');
      expect(output).toContain('.mcp.json');
      expect(output).toContain('.cursor/mcp.json');
    });

    it('renders launch.json beside the Claude MCP entry, not in the legacy warning block', async () => {
      mkdirSync(dirname(cursorConfigPath()), { recursive: true });
      mkdirSync(join(testDir, '.cursor'), { recursive: true });
      writeFileSync(join(testDir, '.mcp.json'), JSON.stringify({ mcpServers: {} }, null, 2));
      writeFileSync(
        join(testDir, '.cursor', 'mcp.json'),
        JSON.stringify({ mcpServers: {} }, null, 2),
      );

      const result = await runInitForTest({ editors: ['claude', 'cursor'] });
      const output = formatInitResult(result, testDir);

      const claudeIndex = output.indexOf('Claude Code');
      const launchJsonIndex = output.indexOf('launch.json');
      const legacyIndex = output.indexOf('Legacy project MCP configs detected:');

      expect(output).toContain('app preview server');
      expect(claudeIndex).toBeGreaterThanOrEqual(0);
      expect(launchJsonIndex).toBeGreaterThan(claudeIndex);
      expect(legacyIndex).toBeGreaterThan(launchJsonIndex);
    });
  });

  // -----------------------------------------------------------------------
  // Claude Code launch.json scaffolding (US-009 / D-020 / D-031)
  // -----------------------------------------------------------------------

  describe('launch.json scaffolding', () => {
    it('writes a fresh .claude/launch.json pointing at open-knowledge ui', async () => {
      const result = await runInitForTest();

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

    it('overwrites a stale open-knowledge-ui entry by default', async () => {
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

      const result = await runInitForTest();
      expect(result.launchJson?.action).toBe('merged');

      const parsed = JSON.parse(readFileSync(configPath, 'utf-8'));
      expect(parsed.configurations[0].runtimeArgs).toEqual(['@inkeep/open-knowledge', 'ui']);
    });

    it('writes a local dev launch target when --dev-mcp is enabled', async () => {
      const result = await runInitForTest({ devMcp: true, cliEntryPath: devCliEntryPath() });

      expect(result.launchJson?.action).toBe('created');

      const parsed = JSON.parse(readFileSync(join(testDir, '.claude', 'launch.json'), 'utf-8'));
      expect(parsed.configurations).toHaveLength(1);
      expect(parsed.configurations[0]).toEqual(expectedDevLaunchEntry());
    });

    it('rewrites an up-to-date open-knowledge-ui entry', async () => {
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

      const result = await runInitForTest();
      expect(result.launchJson?.action).toBe('merged');
    });

    it('overwrites the published launch target in dev mode', async () => {
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

      const result = await runInitForTest({ devMcp: true, cliEntryPath: devCliEntryPath() });
      expect(result.launchJson?.action).toBe('merged');

      const parsed = JSON.parse(readFileSync(configPath, 'utf-8'));
      expect(parsed.configurations[0]).toEqual(expectedDevLaunchEntry());
    });

    it('merges the new entry into an existing launch.json with other configurations', async () => {
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

      const result = await runInitForTest();
      expect(result.launchJson?.action).toBe('created');

      const parsed = JSON.parse(readFileSync(configPath, 'utf-8'));
      expect(parsed.configurations).toHaveLength(2);
      const ok = parsed.configurations.find(
        (c: { name: string }) => c.name === 'open-knowledge-ui',
      );
      expect(ok.runtimeArgs).toEqual(['@inkeep/open-knowledge', 'ui']);
      expect(ok.autoPort).toBeUndefined();
    });

    it('does NOT scaffold launch.json when Claude is not among selected editors', async () => {
      const result = await runInitForTest({ editors: ['cursor'] });
      expect(result.launchJson).toBeUndefined();
      expect(existsSync(join(testDir, '.claude', 'launch.json'))).toBe(false);
    });
  });

  // -----------------------------------------------------------------------
  // Per-editor instruction file injection (from main)
  // -----------------------------------------------------------------------

  describe('per-editor instruction file injection', () => {
    it('writes CLAUDE.md when claude editor is selected', async () => {
      const result = await runInitForTest({ editors: ['claude'] });

      expect(existsSync(join(testDir, 'CLAUDE.md'))).toBe(true);
      expect(readFileSync(join(testDir, 'CLAUDE.md'), 'utf-8')).toContain(
        '<!-- open-knowledge:begin -->',
      );
      const agentsEntry = result.rootInstructions.find((r) => r.file === 'AGENTS.md');
      const claudeEntry = result.rootInstructions.find((r) => r.file === 'CLAUDE.md');
      expect(agentsEntry?.action).toBe('created');
      expect(claudeEntry?.action).toBe('created');
    });

    it('writes only AGENTS.md for cursor (no rule-file scaffolding)', async () => {
      const result = await runInitForTest({ mcp: false, editors: ['cursor'] });

      // AGENTS.md is the tool-agnostic instruction surface; Cursor picks it up natively.
      expect(existsSync(join(testDir, 'AGENTS.md'))).toBe(true);
      expect(existsSync(join(testDir, '.cursorrules'))).toBe(false);
      expect(existsSync(join(testDir, '.cursor', 'rules', 'open-knowledge.mdc'))).toBe(false);
      expect(result.rootInstructions).toHaveLength(1);
      expect(result.rootInstructions[0].file).toBe('AGENTS.md');
    });

    it('writes only AGENTS.md for windsurf (no rule-file scaffolding)', async () => {
      const fakeHome = join(testDir, 'fakehome');
      mkdirSync(fakeHome, { recursive: true });
      const result = await runInitForTest({ mcp: false, editors: ['windsurf'] });

      expect(existsSync(join(testDir, 'AGENTS.md'))).toBe(true);
      expect(existsSync(join(testDir, '.windsurfrules'))).toBe(false);
      expect(existsSync(join(testDir, '.windsurf', 'rules', 'open-knowledge.md'))).toBe(false);
      expect(result.rootInstructions).toHaveLength(1);
      expect(result.rootInstructions[0].file).toBe('AGENTS.md');
    });

    it('writes no extra instruction files for vscode (no instructionsPath)', async () => {
      const result = await runInitForTest({ mcp: false, editors: ['vscode'] });

      // Only AGENTS.md — vscode has no instructionsPath
      expect(result.rootInstructions).toHaveLength(1);
      expect(result.rootInstructions[0].file).toBe('AGENTS.md');
      expect(existsSync(join(testDir, '.vscoderules'))).toBe(false);
    });

    it('writes AGENTS.md + CLAUDE.md for claude + cursor + windsurf combined', async () => {
      const fakeHome = join(testDir, 'fakehome');
      mkdirSync(fakeHome, { recursive: true });
      const result = await runInitForTest({
        mcp: false,
        editors: ['claude', 'cursor', 'windsurf'],
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
    it('renders Content block with file count and sample when preview succeeds', async () => {
      writeFileSync(join(testDir, 'readme.md'), '# Readme');
      mkdirSync(join(testDir, 'docs'));
      writeFileSync(join(testDir, 'docs', 'guide.md'), '# Guide');

      const result = await runInitForTest({ mcp: false });

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

    it('renders warning line when preview is undefined with previewWarning', async () => {
      const result = await runInitForTest({ mcp: false });
      result.preview = undefined;
      result.previewWarning = 'something went wrong';

      const output = formatInitResult(result, testDir);
      expect(output).toContain('Content preview unavailable: something went wrong');
      expect(output).not.toContain('Found');
    });

    it('omits Sample line when preview.totalCount is 0', async () => {
      const result = await runInitForTest({ mcp: false });
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

    it('renders an update summary when an MCP entry is replaced', async () => {
      writeFileSync(
        claudeConfigPath(),
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

      const result = await runInitForTest();
      const output = formatInitResult(result, testDir);
      expect(result.editors[0].action).toBe('overwritten');
      expect(output).toContain('updated');
      expect(output).not.toContain('re-run with --force');
    });

    it('loadConfig + previewContent integration: preview picks up scaffolded config', async () => {
      writeFileSync(join(testDir, 'readme.md'), '# Readme');
      mkdirSync(join(testDir, 'docs'));
      writeFileSync(join(testDir, 'docs', 'guide.md'), '# Guide');

      const result = await runInitForTest({ mcp: false });

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

  // -------------------------------------------------------------------------
  // US-005 — auto-git-init inside runInit
  // -------------------------------------------------------------------------

  describe('ensureProjectGit wiring (US-005)', () => {
    it('fresh tmpdir (no .git/) → runInit creates .git/ and reports didGitInit=true', async () => {
      const result = await runInit({ cwd: testDir, home: fakeHome, editors: ['claude'] });

      expect(result.didGitInit).toBe(true);
      expect(existsSync(join(testDir, '.git/HEAD'))).toBe(true);
      const head = readFileSync(join(testDir, '.git/HEAD'), 'utf-8');
      expect(head).toBe('ref: refs/heads/main\n');

      // formatInitResult includes the disclosure line
      const output = formatInitResult(result, testDir);
      expect(output).toContain(`Initialized git repo at ${testDir}/.git/ (default branch: main)`);
    });

    it('pre-existing .git/ → runInit does not re-init and reports didGitInit=false', async () => {
      mkdirSync(join(testDir, '.git'));

      const result = await runInit({ cwd: testDir, home: fakeHome, editors: ['claude'] });

      expect(result.didGitInit).toBe(false);
      // formatInitResult omits the disclosure line
      const output = formatInitResult(result, testDir);
      expect(output).not.toContain('Initialized git repo at');
    });

    it('git-missing environment → runInit throws ProjectGitInitError (no content scaffolded)', async () => {
      const originalPath = process.env.PATH;
      process.env.PATH = '/nonexistent';
      try {
        // Import the server error type lazily to keep the import surface minimal
        // for other tests in this file.
        const { ProjectGitInitError } = await import('@inkeep/open-knowledge-server');
        await expect(
          runInit({ cwd: testDir, home: fakeHome, editors: ['claude'] }),
        ).rejects.toBeInstanceOf(ProjectGitInitError);
      } finally {
        process.env.PATH = originalPath;
      }

      // Content scaffolding must NOT have fired when ensureProjectGit threw
      expect(existsSync(join(testDir, OK_DIR))).toBe(false);
      expect(existsSync(join(testDir, '.git'))).toBe(false);
    });
  });
});

// ---------------------------------------------------------------------------
// detectInstalledEditors — US-013 / FR-3.1 / D-013
// ---------------------------------------------------------------------------

describe('detectInstalledEditors', () => {
  let testDir: string;
  let fakeHome: string;
  const originalPlatform = process.platform;
  const originalHome = process.env.HOME;

  const cursorConfigPath = () => resolveCursorConfigPath({ home: fakeHome });
  const vsCodeConfigPath = () => resolveVsCodeConfigPath({ home: fakeHome });
  const codexConfigPath = () => resolveCodexConfigPath({ home: fakeHome, env: {} });
  const windsurfConfigPath = () => resolveWindsurfConfigPath({ home: fakeHome });

  beforeEach(() => {
    testDir = resolve(
      tmpdir(),
      `detect-editors-test-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    );
    mkdirSync(testDir, { recursive: true });
    fakeHome = join(testDir, 'fakehome');
    mkdirSync(fakeHome, { recursive: true });
    process.env.HOME = fakeHome;
    Object.defineProperty(process, 'platform', { value: 'darwin', configurable: true });
  });

  afterEach(() => {
    Object.defineProperty(process, 'platform', {
      value: originalPlatform,
      configurable: true,
    });
    if (originalHome === undefined) {
      delete process.env.HOME;
    } else {
      process.env.HOME = originalHome;
    }
    rmSync(testDir, { recursive: true, force: true });
  });

  it('detects Claude when ~/.claude exists', async () => {
    mkdirSync(join(fakeHome, '.claude'), { recursive: true });
    const detected = detectInstalledEditors(testDir, fakeHome);
    expect(detected).toContain('claude');
  });

  it('does NOT detect Claude when ~/.claude is absent', async () => {
    const detected = detectInstalledEditors(testDir, fakeHome);
    expect(detected).not.toContain('claude');
  });

  it('detects Cursor when ~/.cursor/ exists', async () => {
    mkdirSync(dirname(cursorConfigPath()), { recursive: true });
    const detected = detectInstalledEditors(testDir, fakeHome);
    expect(detected).toContain('cursor');
  });

  it('does NOT detect Cursor when ~/.cursor/ is absent', async () => {
    const detected = detectInstalledEditors(testDir, fakeHome);
    expect(detected).not.toContain('cursor');
  });

  it('detects VS Code when the user config dir exists', async () => {
    mkdirSync(dirname(vsCodeConfigPath()), { recursive: true });
    const detected = detectInstalledEditors(testDir, fakeHome);
    expect(detected).toContain('vscode');
  });

  it('detects Codex when ~/.codex/ exists', async () => {
    mkdirSync(dirname(codexConfigPath()), { recursive: true });
    const detected = detectInstalledEditors(testDir, fakeHome);
    expect(detected).toContain('codex');
  });

  it('detects Claude Desktop when its config directory exists', async () => {
    mkdirSync(dirname(resolveClaudeDesktopConfigPath({ home: fakeHome })), { recursive: true });
    const detected = detectInstalledEditors(testDir, fakeHome);
    expect(detected).toContain('claude-desktop');
  });

  it('does NOT detect Claude Desktop when its config dir is absent', async () => {
    const detected = detectInstalledEditors(testDir, fakeHome);
    expect(detected).not.toContain('claude-desktop');
  });

  it('detects Windsurf when ~/.codeium/windsurf/ exists (via home override)', async () => {
    mkdirSync(dirname(windsurfConfigPath()), { recursive: true });
    const detected = detectInstalledEditors(testDir, fakeHome);
    expect(detected).toContain('windsurf');
  });

  it('does NOT detect Windsurf when ~/.codeium/windsurf/ is absent', async () => {
    const detected = detectInstalledEditors(testDir, fakeHome);
    expect(detected).not.toContain('windsurf');
  });

  it('returns all supported editors when all editor config dirs exist', async () => {
    mkdirSync(join(fakeHome, '.claude'), { recursive: true });
    mkdirSync(dirname(resolveClaudeDesktopConfigPath({ home: fakeHome })), { recursive: true });
    mkdirSync(dirname(cursorConfigPath()), { recursive: true });
    mkdirSync(dirname(vsCodeConfigPath()), { recursive: true });
    mkdirSync(dirname(codexConfigPath()), { recursive: true });
    mkdirSync(dirname(windsurfConfigPath()), { recursive: true });
    const detected = detectInstalledEditors(testDir, fakeHome);
    expect(detected).toEqual(expect.arrayContaining([...ALL_EDITOR_IDS]));
    expect(detected).toHaveLength(6);
  });

  it('preserves EDITOR_TARGETS ordering in return value', async () => {
    mkdirSync(join(fakeHome, '.claude'), { recursive: true });
    mkdirSync(dirname(resolveClaudeDesktopConfigPath({ home: fakeHome })), { recursive: true });
    mkdirSync(dirname(cursorConfigPath()), { recursive: true });
    mkdirSync(dirname(vsCodeConfigPath()), { recursive: true });
    mkdirSync(dirname(codexConfigPath()), { recursive: true });
    const detected = detectInstalledEditors(testDir, fakeHome);
    // Order comes from ALL_EDITOR_IDS = ['claude', 'claude-desktop', 'cursor', 'vscode', 'windsurf', 'codex']
    expect(detected).toEqual(['claude', 'claude-desktop', 'cursor', 'vscode', 'codex']);
  });

  it('returns empty list when the cwd itself does not exist (zero-detected edge case)', () => {
    // Synthesizes the "zero detected" path where init should skip MCP wiring
    // rather than inventing new editor config roots.
    const missingCwd = join(testDir, 'does-not-exist');
    const missingHome = join(testDir, 'also-not-here');
    const detected = detectInstalledEditors(missingCwd, missingHome);
    expect(detected).toEqual([]);
  });
});

describe('writeUserMcpConfigs', () => {
  let fakeHome: string;
  let testDir: string;
  const originalPlatform = process.platform;
  const originalHome = process.env.HOME;

  const CLI_PATH = '/Applications/Open Knowledge.app/Contents/Resources/cli/bin/ok.sh';

  beforeEach(() => {
    testDir = resolve(
      tmpdir(),
      `write-user-mcp-configs-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    );
    mkdirSync(testDir, { recursive: true });
    fakeHome = join(testDir, 'fakehome');
    mkdirSync(fakeHome, { recursive: true });
    process.env.HOME = fakeHome;
    Object.defineProperty(process, 'platform', { value: 'darwin', configurable: true });
  });

  afterEach(() => {
    Object.defineProperty(process, 'platform', {
      value: originalPlatform,
      configurable: true,
    });
    if (originalHome === undefined) {
      delete process.env.HOME;
    } else {
      process.env.HOME = originalHome;
    }
    rmSync(testDir, { recursive: true, force: true });
  });

  it('writes the cliPath shape for every selected editor', async () => {
    const opts: UserMcpConfigsOptions = {
      editors: ['claude', 'cursor'],
      cliPath: CLI_PATH,
      home: fakeHome,
    };
    const results: EditorMcpResult[] = await writeUserMcpConfigs(opts);

    expect(results).toHaveLength(2);
    expect(results.every((r) => r.action === 'written')).toBe(true);

    const claudeConfig = JSON.parse(
      readFileSync(resolveClaudeCodeConfigPath({ home: fakeHome }), 'utf-8'),
    );
    expect(claudeConfig.mcpServers['open-knowledge']).toEqual({
      command: CLI_PATH,
      args: ['mcp'],
    });

    const cursorConfig = JSON.parse(
      readFileSync(resolveCursorConfigPath({ home: fakeHome }), 'utf-8'),
    );
    expect(cursorConfig.mcpServers['open-knowledge']).toEqual({
      command: CLI_PATH,
      args: ['mcp'],
    });
  });

  it('falls back to the npx shape when cliPath is not provided', async () => {
    const results = await writeUserMcpConfigs({
      editors: ['claude'],
      home: fakeHome,
    });

    expect(results[0].action).toBe('written');

    const claudeConfig = JSON.parse(
      readFileSync(resolveClaudeCodeConfigPath({ home: fakeHome }), 'utf-8'),
    );
    expect(claudeConfig.mcpServers['open-knowledge']).toEqual({
      command: 'npx',
      args: ['@inkeep/open-knowledge', 'mcp'],
    });
  });

  it('preserves type:stdio on the VS Code entry with cliPath', async () => {
    await writeUserMcpConfigs({
      editors: ['vscode'],
      cliPath: CLI_PATH,
      home: fakeHome,
    });

    const vsConfig = JSON.parse(readFileSync(resolveVsCodeConfigPath({ home: fakeHome }), 'utf-8'));
    expect(vsConfig.servers['open-knowledge']).toEqual({
      type: 'stdio',
      command: CLI_PATH,
      args: ['mcp'],
    });
  });

  it('does NOT create .git, AGENTS.md, .open-knowledge, or launch.json under the fake HOME', async () => {
    await writeUserMcpConfigs({
      editors: ['claude', 'cursor', 'vscode'],
      cliPath: CLI_PATH,
      home: fakeHome,
    });

    // None of runInit's project-scoped side effects should fire
    expect(existsSync(join(fakeHome, '.git'))).toBe(false);
    expect(existsSync(join(fakeHome, 'AGENTS.md'))).toBe(false);
    expect(existsSync(join(fakeHome, 'CLAUDE.md'))).toBe(false);
    expect(existsSync(join(fakeHome, '.claude', 'launch.json'))).toBe(false);
    expect(existsSync(join(fakeHome, OK_DIR))).toBe(false);
    // Also verify no legacy project .mcp.json was scanned into existence
    expect(existsSync(join(fakeHome, '.mcp.json'))).toBe(false);
  });

  it('unconditionally overwrites a differing existing entry (M6b always-write semantic)', async () => {
    // Post-main-PR-#282 semantic (reconciled 2026-04-23): writeEditorMcpConfig
    // dropped its `force` parameter and now always overwrites. `writeUserMcpConfigs`
    // inherits that — the caller (mcp-wiring.ts confirmHandler) filters foreign
    // customizations via `computeForce` + `readExistingMcpEntry` BEFORE this call,
    // so every editor that reaches this function is one the caller decided to
    // overwrite.
    const claudePath = resolveClaudeCodeConfigPath({ home: fakeHome });
    mkdirSync(dirname(claudePath), { recursive: true });
    writeFileSync(
      claudePath,
      JSON.stringify(
        { mcpServers: { 'open-knowledge': { command: 'custom', args: ['old'] } } },
        null,
        2,
      ),
    );

    const results = await writeUserMcpConfigs({
      editors: ['claude'],
      cliPath: CLI_PATH,
      home: fakeHome,
    });

    expect(results[0].action).toBe('overwritten');

    const config = JSON.parse(readFileSync(claudePath, 'utf-8'));
    expect(config.mcpServers['open-knowledge']).toEqual({
      command: CLI_PATH,
      args: ['mcp'],
    });
  });

  it('caller controls which editors get overwritten by omitting them from the editors array', async () => {
    // Regression gate for the reconciliation with main PR #282: the
    // mcp-wiring.ts confirmHandler classifies existing entries via
    // `readExistingMcpEntry` + `computeForce` and only passes MANAGED-SHAPE
    // editors to writeUserMcpConfigs. This test proves the contract: if a
    // foreign editor is not in `editors[]`, its config is left untouched.
    const claudePath = resolveClaudeCodeConfigPath({ home: fakeHome });
    const cursorPath = resolveCursorConfigPath({ home: fakeHome });
    mkdirSync(dirname(claudePath), { recursive: true });
    mkdirSync(dirname(cursorPath), { recursive: true });

    writeFileSync(
      claudePath,
      JSON.stringify(
        { mcpServers: { 'open-knowledge': { command: 'custom', args: ['claude-old'] } } },
        null,
        2,
      ),
    );
    writeFileSync(
      cursorPath,
      JSON.stringify(
        { mcpServers: { 'open-knowledge': { command: 'custom', args: ['cursor-old'] } } },
        null,
        2,
      ),
    );

    // Only claude is in `editors` — caller has decided cursor's custom entry
    // should be preserved (via classification it didn't include here).
    const results = await writeUserMcpConfigs({
      editors: ['claude'],
      cliPath: CLI_PATH,
      home: fakeHome,
    });

    expect(results).toHaveLength(1);
    expect(results[0]?.editorId).toBe('claude');
    expect(results[0]?.action).toBe('overwritten');

    const claudeConfig = JSON.parse(readFileSync(claudePath, 'utf-8'));
    expect(claudeConfig.mcpServers['open-knowledge']).toEqual({
      command: CLI_PATH,
      args: ['mcp'],
    });
    // Cursor untouched — wasn't in the editors array.
    const cursorConfig = JSON.parse(readFileSync(cursorPath, 'utf-8'));
    expect(cursorConfig.mcpServers['open-knowledge']).toEqual({
      command: 'custom',
      args: ['cursor-old'],
    });
  });

  it('preserves unrelated mcpServers entries when writing the managed entry', async () => {
    const claudePath = resolveClaudeCodeConfigPath({ home: fakeHome });
    mkdirSync(dirname(claudePath), { recursive: true });
    writeFileSync(
      claudePath,
      JSON.stringify(
        { mcpServers: { 'other-server': { command: 'node', args: ['x.js'] } } },
        null,
        2,
      ),
    );

    await writeUserMcpConfigs({
      editors: ['claude'],
      cliPath: CLI_PATH,
      home: fakeHome,
    });

    const config = JSON.parse(readFileSync(claudePath, 'utf-8'));
    expect(config.mcpServers['other-server']).toEqual({
      command: 'node',
      args: ['x.js'],
    });
    expect(config.mcpServers['open-knowledge']).toEqual({
      command: CLI_PATH,
      args: ['mcp'],
    });
  });

  it('reports "overwritten" even when the entry already matches cliPath shape (main PR #282 always-overwrite)', async () => {
    // Post-rebase semantic (2026-04-23): `writeEditorMcpConfig` always
    // overwrites existing entries — "skipped-existing" and "skipped-conflict"
    // are gone. Re-running with the same cliPath is safe (byte-identical
    // result), but the action value reflects "there was an existing entry
    // that got re-written" not "the entry was idempotent."
    const claudePath = resolveClaudeCodeConfigPath({ home: fakeHome });
    mkdirSync(dirname(claudePath), { recursive: true });
    writeFileSync(
      claudePath,
      JSON.stringify(
        { mcpServers: { 'open-knowledge': { command: CLI_PATH, args: ['mcp'] } } },
        null,
        2,
      ),
    );

    const results = await writeUserMcpConfigs({
      editors: ['claude'],
      cliPath: CLI_PATH,
      home: fakeHome,
    });

    expect(results[0].action).toBe('overwritten');
    // Idempotency check: the written entry is byte-identical to the prior.
    const config = JSON.parse(readFileSync(claudePath, 'utf-8'));
    expect(config.mcpServers['open-knowledge']).toEqual({ command: CLI_PATH, args: ['mcp'] });
  });

  it('reports action:failed for unsupported editors without throwing', async () => {
    // Claude Desktop is unsupported on Linux — but resolveClaudeDesktopConfigPath
    // throws synchronously. writeEditorMcpConfig catches that path-resolution
    // throw and returns action:'failed' instead of bubbling.
    Object.defineProperty(process, 'platform', { value: 'linux', configurable: true });

    const results = await writeUserMcpConfigs({
      editors: ['claude-desktop'],
      cliPath: CLI_PATH,
      home: fakeHome,
    });

    expect(results[0].action).toBe('failed');
    expect(results[0].error).toMatch(/Claude Desktop is not available on linux/);
  });
});

describe('writeEditorMcpConfig (exported for Electron main)', () => {
  let fakeHome: string;
  let testDir: string;
  const originalPlatform = process.platform;
  const originalHome = process.env.HOME;

  const CLI_PATH = '/Applications/Open Knowledge.app/Contents/Resources/cli/bin/ok.sh';

  beforeEach(() => {
    testDir = resolve(
      tmpdir(),
      `write-editor-mcp-config-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    );
    mkdirSync(testDir, { recursive: true });
    fakeHome = join(testDir, 'fakehome');
    mkdirSync(fakeHome, { recursive: true });
    process.env.HOME = fakeHome;
    Object.defineProperty(process, 'platform', { value: 'darwin', configurable: true });
  });

  afterEach(() => {
    Object.defineProperty(process, 'platform', {
      value: originalPlatform,
      configurable: true,
    });
    if (originalHome === undefined) {
      delete process.env.HOME;
    } else {
      process.env.HOME = originalHome;
    }
    rmSync(testDir, { recursive: true, force: true });
  });

  it('is callable as a standalone export with a single target', () => {
    // Post-rebase signature (2026-04-23): `writeEditorMcpConfig(target, cwd,
    // installOptions, home?)` — the `force` 3rd arg was dropped when main
    // refactored to always-overwrite semantics. The M6b call-site
    // (writeUserMcpConfigs) passes `skipAvailabilityCheck: true` so the
    // user-toggled editor isn't silently rejected by the new
    // `isEditorTargetAvailable` guard.
    const result: EditorMcpResult = writeEditorMcpConfig(
      EDITOR_TARGETS.cursor,
      '',
      { cliPath: CLI_PATH, skipAvailabilityCheck: true },
      fakeHome,
    );
    expect(result.action).toBe('written');
    expect(result.editorId).toBe('cursor');
    const config = JSON.parse(readFileSync(resolveCursorConfigPath({ home: fakeHome }), 'utf-8'));
    expect(config.mcpServers['open-knowledge']).toEqual({
      command: CLI_PATH,
      args: ['mcp'],
    });
  });
});

/**
 * Pass 0 Major #13 — direct unit coverage for `readExistingMcpEntry`.
 *
 * The function is the M6b consent-flow tolerance boundary: every reachable
 * fail mode (config absent, config unparseable, top-level not an object,
 * server entry not an object, configPath throws on platform mismatch) MUST
 * return `null`, never throw. A regression that makes any branch throw
 * crashes `confirmHandler`, leaves the marker absent, and creates an infinite
 * dialog re-fire loop on user machines with corrupted editor configs.
 *
 * The orchestration tests in `mcp-wiring.test.ts` stub this function, so
 * direct coverage here is the only guard against tolerance regressions.
 */
describe('readExistingMcpEntry (Pass 0 Major #13)', () => {
  let fakeHome: string;
  let testDir: string;
  const originalPlatform = process.platform;
  const originalHome = process.env.HOME;

  beforeEach(() => {
    testDir = resolve(
      tmpdir(),
      `read-existing-mcp-entry-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    );
    mkdirSync(testDir, { recursive: true });
    fakeHome = join(testDir, 'fakehome');
    mkdirSync(fakeHome, { recursive: true });
    process.env.HOME = fakeHome;
    Object.defineProperty(process, 'platform', { value: 'darwin', configurable: true });
  });

  afterEach(() => {
    Object.defineProperty(process, 'platform', {
      value: originalPlatform,
      configurable: true,
    });
    if (originalHome === undefined) {
      delete process.env.HOME;
    } else {
      process.env.HOME = originalHome;
    }
    rmSync(testDir, { recursive: true, force: true });
  });

  it('returns null when the editor config file is absent', () => {
    expect(readExistingMcpEntry(EDITOR_TARGETS.cursor, '', fakeHome)).toBeNull();
  });

  it('returns null when configPath throws (platform-mismatched target)', () => {
    // Claude Desktop's configPath only resolves on macOS / Windows. Switch to
    // linux so the configPath helper throws — readExistingMcpEntry MUST
    // catch + return null rather than propagate the throw.
    Object.defineProperty(process, 'platform', { value: 'linux', configurable: true });
    expect(readExistingMcpEntry(EDITOR_TARGETS['claude-desktop'], '', fakeHome)).toBeNull();
  });

  it('returns null on invalid JSON (corrupt config)', () => {
    const path = resolveCursorConfigPath({ home: fakeHome });
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, '{ this is not valid JSON', 'utf-8');
    expect(readExistingMcpEntry(EDITOR_TARGETS.cursor, '', fakeHome)).toBeNull();
  });

  it('returns null on invalid TOML (corrupt Codex config)', () => {
    const path = resolveCodexConfigPath({ home: fakeHome, env: {} });
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, 'not = valid = toml = at = all', 'utf-8');
    expect(readExistingMcpEntry(EDITOR_TARGETS.codex, '', fakeHome)).toBeNull();
  });

  it('returns null when top-level mcpServers key is not an object (e.g. array)', () => {
    const path = resolveCursorConfigPath({ home: fakeHome });
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, JSON.stringify({ mcpServers: ['not', 'an', 'object'] }), 'utf-8');
    expect(readExistingMcpEntry(EDITOR_TARGETS.cursor, '', fakeHome)).toBeNull();
  });

  it('returns null when the server entry exists but is not an object', () => {
    const path = resolveCursorConfigPath({ home: fakeHome });
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(
      path,
      JSON.stringify({ mcpServers: { 'open-knowledge': 'not-an-object' } }),
      'utf-8',
    );
    expect(readExistingMcpEntry(EDITOR_TARGETS.cursor, '', fakeHome)).toBeNull();
  });

  it('returns the parsed entry when JSON config is well-formed', () => {
    const path = resolveCursorConfigPath({ home: fakeHome });
    mkdirSync(dirname(path), { recursive: true });
    const entry = { command: 'npx', args: ['@inkeep/open-knowledge', 'mcp'] };
    writeFileSync(path, JSON.stringify({ mcpServers: { 'open-knowledge': entry } }), 'utf-8');
    expect(readExistingMcpEntry(EDITOR_TARGETS.cursor, '', fakeHome)).toEqual(entry);
  });

  it('returns the parsed entry when TOML config (Codex) is well-formed', () => {
    const path = resolveCodexConfigPath({ home: fakeHome, env: {} });
    mkdirSync(dirname(path), { recursive: true });
    // Codex's `mcp_servers."open-knowledge"` table — quoted key form so the
    // TOML parser keeps the dash-bearing name as one identifier (per
    // smol-toml grammar). Same shape Codex itself writes via `ok init`.
    writeFileSync(
      path,
      '[mcp_servers."open-knowledge"]\ncommand = "npx"\nargs = ["@inkeep/open-knowledge", "mcp"]\n',
      'utf-8',
    );
    const result = readExistingMcpEntry(EDITOR_TARGETS.codex, '', fakeHome);
    expect(result).toEqual({
      command: 'npx',
      args: ['@inkeep/open-knowledge', 'mcp'],
    });
  });

  it('returns null when config has the top-level key but no entry for our serverName', () => {
    const path = resolveCursorConfigPath({ home: fakeHome });
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(
      path,
      JSON.stringify({ mcpServers: { 'some-other-server': { command: 'foo' } } }),
      'utf-8',
    );
    expect(readExistingMcpEntry(EDITOR_TARGETS.cursor, '', fakeHome)).toBeNull();
  });

  it('returns null when the file exists but is empty', () => {
    const path = resolveCursorConfigPath({ home: fakeHome });
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, '', 'utf-8');
    expect(readExistingMcpEntry(EDITOR_TARGETS.cursor, '', fakeHome)).toBeNull();
  });
});
