import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import {
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
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
} from './editors.ts';
import {
  detectInstalledEditors,
  type EditorMcpResult,
  formatInitResult,
  initCommand,
  readExistingMcpEntry,
  resolveMcpScope,
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
  const originalArgv1 = process.argv[1];

  const claudeConfigPath = () => resolveClaudeCodeConfigPath({ home: fakeHome });
  const cursorConfigPath = () => resolveCursorConfigPath({ home: fakeHome });
  const codexConfigPath = () => resolveCodexConfigPath({ home: fakeHome, env: {} });
  const devRepoRoot = () => join(testDir, 'local-open-knowledge');
  const devCliEntryPath = () => join(devRepoRoot(), 'packages', 'cli', 'src', 'cli.ts');
  const enableDevMcp = () => {
    process.argv[1] = devCliEntryPath();
  };
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
  const defaultInstallUserSkill = async () => 'installed' as const;
  const runInitForTest = async (options: Parameters<typeof runInit>[0] = {}) =>
    runInit({
      cwd: testDir,
      home: fakeHome,
      installUserSkill: defaultInstallUserSkill,
      scope: 'user',
      ...options,
    });

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
    process.argv[1] = originalArgv1;
    rmSync(testDir, { recursive: true, force: true });
  });

  it('scaffolds .ok/ and writes a fresh global Claude config', async () => {
    const result = await runInitForTest();

    expect(result.contentCreated.length).toBeGreaterThan(0);
    expect(existsSync(join(testDir, OK_DIR, 'cache'))).toBe(false);
    expect(existsSync(join(testDir, OK_DIR, 'local'))).toBe(false);
    expect(existsSync(join(testDir, OK_DIR, 'AGENTS.md'))).toBe(false);
    expect(existsSync(join(testDir, OK_DIR, 'config.yml'))).toBe(true);
    expect(existsSync(join(testDir, OK_DIR, 'articles'))).toBe(false);
    expect(existsSync(join(testDir, OK_DIR, 'external-sources'))).toBe(false);
    expect(existsSync(join(testDir, OK_DIR, 'research'))).toBe(false);
    expect(existsSync(join(fakeHome, '.codeium'))).toBe(false);

    expect(result.mcpAction).toBe('written');
    const mcpPath = claudeConfigPath();
    expect(existsSync(mcpPath)).toBe(true);

    const config = JSON.parse(readFileSync(mcpPath, 'utf-8'));
    expect(config.mcpServers).toBeDefined();
    expect(config.mcpServers[result.editors[0].serverName]).toEqual({
      command: 'npx',
      args: ['@inkeep/open-knowledge', 'mcp'],
    });

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
    enableDevMcp();
    const result = await runInitForTest({ devMcp: true });

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

    enableDevMcp();
    const result = await runInitForTest({ devMcp: true });
    expect(result.mcpAction).toBe('overwritten');
    expect(result.editors[0].action).toBe('overwritten');

    const config = JSON.parse(readFileSync(claudeConfigPath(), 'utf-8'));
    expect(config.mcpServers['open-knowledge']).toEqual(expectedDevMcpEntry());
  });

  it('does not touch ~/.claude.json when --no-mcp is passed', async () => {
    const result = await runInitForTest({ mcp: false });

    expect(result.mcpAction).toBe('skipped-flag');
    expect(existsSync(claudeConfigPath())).toBe(false);

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

    expect(existsSync(join(testDir, OK_DIR, 'config.yml'))).toBe(true);
  });

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
      enableDevMcp();
      const result = await runInitForTest({
        editors: ['codex'],
        devMcp: true,
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

    it('flags claudeDesktopDetected=true when Claude config dir exists', async () => {
      mkdirSync(dirname(resolveClaudeDesktopConfigPath({ home: fakeHome })), { recursive: true });

      const result = await runInitForTest();

      expect(result.claudeDesktopDetected).toBe(true);
    });

    it('flags claudeDesktopDetected=false when Claude config dir is absent', async () => {
      const result = await runInitForTest();

      expect(result.claudeDesktopDetected).toBe(false);
    });

    it('renders the Cowork install hint when Claude Desktop is detected', async () => {
      mkdirSync(dirname(resolveClaudeDesktopConfigPath({ home: fakeHome })), { recursive: true });

      const result = await runInitForTest();
      const output = formatInitResult(result, testDir);

      expect(output).toContain('Claude Desktop App detected.');
      expect(output).toContain('Claude Chat & Cowork');
      expect(output).toContain('ok install-skill');
    });

    it('omits the Cowork install hint when Claude Desktop is absent', async () => {
      const result = await runInitForTest();
      const output = formatInitResult(result, testDir);

      expect(output).not.toContain('Claude Desktop detected. For Cowork:');
      expect(output).not.toContain('openknowledge.skill');
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
      mkdirSync(dirname(codexConfigPath()), { recursive: true });

      const result = await runInitForTest({ editors: [...ALL_EDITOR_IDS] });

      expect(result.editors).toHaveLength(ALL_EDITOR_IDS.length);
      for (const editor of result.editors) {
        expect(editor.action).toBe('written');
      }

      expect(existsSync(claudeConfigPath())).toBe(true);
      expect(existsSync(resolveClaudeDesktopConfigPath({ home: fakeHome }))).toBe(true);
      expect(existsSync(cursorConfigPath())).toBe(true);
      expect(existsSync(codexConfigPath())).toBe(true);
    });

    it('overwrites across all targeted editors', async () => {
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
        editors: ['claude', 'cursor', 'codex'],
        mcp: false,
      });

      expect(result.editors).toHaveLength(3);
      for (const editor of result.editors) {
        expect(editor.action).toBe('skipped-flag');
      }
      expect(existsSync(claudeConfigPath())).toBe(false);
      expect(existsSync(cursorConfigPath())).toBe(false);
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
      expect(output).toContain('Project MCP configs found:');
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
      const legacyIndex = output.indexOf('Project MCP configs found:');

      expect(output).toContain('app preview server');
      expect(claudeIndex).toBeGreaterThanOrEqual(0);
      expect(launchJsonIndex).toBeGreaterThan(claudeIndex);
      expect(legacyIndex).toBeGreaterThan(launchJsonIndex);
    });
  });

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
      enableDevMcp();
      const result = await runInitForTest({ devMcp: true });

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

      enableDevMcp();
      const result = await runInitForTest({ devMcp: true });
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

  describe('zero project-root file writes', () => {
    it('does not create root AGENTS.md when claude editor is selected', async () => {
      await runInitForTest({ editors: ['claude'] });

      expect(existsSync(join(testDir, 'AGENTS.md'))).toBe(false);
      expect(existsSync(join(testDir, 'CLAUDE.md'))).toBe(false);
    });

    it('does not create AGENTS.md for cursor', async () => {
      await runInitForTest({ mcp: false, editors: ['cursor'] });

      expect(existsSync(join(testDir, 'AGENTS.md'))).toBe(false);
      expect(existsSync(join(testDir, '.cursorrules'))).toBe(false);
      expect(existsSync(join(testDir, '.cursor', 'rules', 'open-knowledge.mdc'))).toBe(false);
    });

    it('does not create any root-level agent files for claude + cursor combined', async () => {
      await runInitForTest({
        mcp: false,
        editors: ['claude', 'cursor'],
      });

      expect(existsSync(join(testDir, 'AGENTS.md'))).toBe(false);
      expect(existsSync(join(testDir, 'CLAUDE.md'))).toBe(false);
      expect(existsSync(join(testDir, '.cursor', 'rules', 'open-knowledge.mdc'))).toBe(false);
      expect(existsSync(join(testDir, '.cursorrules'))).toBe(false);
    });
  });

  describe('legacy-injection non-interference', () => {
    it('leaves pre-existing open-knowledge marker blocks byte-identical in CLAUDE.md and AGENTS.md', async () => {
      const legacyClaudeBody = [
        '# My Project',
        '',
        'Some pre-existing content the user wrote themselves.',
        '',
        '<!-- open-knowledge:begin -->',
        '## Legacy Open Knowledge section',
        'Pretend this was injected by an older ok init version.',
        '<!-- open-knowledge:end -->',
        '',
        'Post-section notes.',
        '',
      ].join('\n');
      const legacyAgentsBody = [
        '<!-- open-knowledge:begin -->',
        '## Legacy section in AGENTS.md',
        '<!-- open-knowledge:end -->',
        '',
        '# Project agents notes',
        '',
      ].join('\n');

      const claudePath = join(testDir, 'CLAUDE.md');
      const agentsPath = join(testDir, 'AGENTS.md');
      writeFileSync(claudePath, legacyClaudeBody, 'utf-8');
      writeFileSync(agentsPath, legacyAgentsBody, 'utf-8');

      const beforeClaude = readFileSync(claudePath, 'utf-8');
      const beforeAgents = readFileSync(agentsPath, 'utf-8');

      await runInitForTest({ installUserSkill: async () => 'skip-current' });

      expect(readFileSync(claudePath, 'utf-8')).toBe(beforeClaude);
      expect(readFileSync(agentsPath, 'utf-8')).toBe(beforeAgents);
    });
  });

  describe('installUserSkill wiring', () => {
    it('returns skillInstall = "installed" when the install succeeds', async () => {
      const result = await runInitForTest({
        installUserSkill: async () => 'installed',
      });
      expect(result.skillInstall).toBe('installed');
      const output = formatInitResult(result, testDir);
      expect(output).toContain('User-global skill:');
      expect(output).toContain('installed to detected agent hosts');
    });

    it('returns skillInstall = "skip-current" when the sidecar is current', async () => {
      const result = await runInitForTest({
        installUserSkill: async () => 'skip-current',
      });
      expect(result.skillInstall).toBe('skip-current');
      const output = formatInitResult(result, testDir);
      expect(output).toContain('User-global skill:');
      expect(output).toContain('already installed at current version');
    });

    it('returns skillInstall = "failed" without throwing — init still exits 0 (QA-004)', async () => {
      const result = await runInitForTest({
        installUserSkill: async () => 'failed',
      });
      expect(result.skillInstall).toBe('failed');
      expect(result.mcpAction).toBe('written');
      const output = formatInitResult(result, testDir);
      expect(output).toContain('install failed');
      expect(output).toContain('npx skills');
    });

    it('passes opts.home through to installUserSkill (D15)', async () => {
      let capturedHome: string | undefined;
      await runInitForTest({
        installUserSkill: async (opts) => {
          capturedHome = opts?.home;
          return 'installed';
        },
      });
      expect(capturedHome).toBe(fakeHome);
    });
  });

  describe('content preview in init output', () => {
    it('renders Content block with file count and sample when preview succeeds', async () => {
      writeFileSync(join(testDir, 'readme.md'), '# Readme');
      mkdirSync(join(testDir, 'docs'));
      writeFileSync(join(testDir, 'docs', 'guide.md'), '# Guide');

      const result = await runInitForTest({ mcp: false });

      const preview = previewContent({
        projectDir: testDir,
        contentDir: testDir,
      });
      result.preview = preview;

      const output = formatInitResult(result, testDir);
      expect(output).toContain('Content:');
      expect(output).toContain(`Found ${preview.totalCount} markdown files`);
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
      });
      result.preview = preview;

      expect(preview.totalCount).toBeGreaterThanOrEqual(2);
      expect(preview.sample.some((p) => p.includes('readme.md'))).toBe(true);

      const output = formatInitResult(result, testDir);
      expect(output).toContain('Content:');
      expect(output).toContain(`Found ${preview.totalCount} markdown files`);
    });
  });

  describe('ensureProjectGit wiring (US-005)', () => {
    it('fresh tmpdir (no .git/) → runInit creates .git/ and reports didGitInit=true', async () => {
      const result = await runInitForTest({ editors: ['claude'] });

      expect(result.didGitInit).toBe(true);
      expect(existsSync(join(testDir, '.git/HEAD'))).toBe(true);
      const head = readFileSync(join(testDir, '.git/HEAD'), 'utf-8');
      expect(head).toBe('ref: refs/heads/main\n');

      const output = formatInitResult(result, testDir);
      expect(output).toContain(`Initialized git repo at ${testDir}/.git/ (default branch: main)`);
    });

    it('pre-existing .git/HEAD → runInit does not re-init and reports didGitInit=false', async () => {
      mkdirSync(join(testDir, '.git'));
      writeFileSync(join(testDir, '.git/HEAD'), 'ref: refs/heads/main\n');

      const result = await runInitForTest({ editors: ['claude'] });

      expect(result.didGitInit).toBe(false);
      const output = formatInitResult(result, testDir);
      expect(output).not.toContain('Initialized git repo at');
    });

    it('git-missing environment → runInit throws ProjectGitInitError (no content scaffolded)', async () => {
      const originalPath = process.env.PATH;
      process.env.PATH = '/nonexistent';
      try {
        const { ProjectGitInitError } = await import('@inkeep/open-knowledge-server');
        await expect(runInitForTest({ editors: ['claude'] })).rejects.toBeInstanceOf(
          ProjectGitInitError,
        );
      } finally {
        process.env.PATH = originalPath;
      }

      expect(existsSync(join(testDir, OK_DIR))).toBe(false);
      expect(existsSync(join(testDir, '.git'))).toBe(false);
    });
  });

  describe('mcp scope selection', () => {
    it('scope=user writes only user-level config (default runInitForTest behavior)', async () => {
      const result = await runInitForTest({ editors: ['claude'], scope: 'user' });
      expect(result.editors).toHaveLength(1);
      expect(result.editors[0].editorId).toBe('claude');
      expect(result.editors[0].action).toBe('written');
      expect(result.editors[0].configScope).toBeUndefined();
      expect(existsSync(claudeConfigPath())).toBe(true);
      expect(existsSync(join(testDir, '.mcp.json'))).toBe(false);
    });

    it('scope=project writes only project-level config for Claude Code', async () => {
      const result = await runInitForTest({ editors: ['claude'], scope: 'project' });
      expect(result.editors).toHaveLength(1);
      expect(result.editors[0].editorId).toBe('claude');
      expect(result.editors[0].action).toBe('written');
      expect(result.editors[0].configScope).toBe('project');
      expect(result.editors[0].configPath).toBe(join(testDir, '.mcp.json'));
      expect(existsSync(claudeConfigPath())).toBe(false);
      expect(existsSync(join(testDir, '.mcp.json'))).toBe(true);
      expect(result.projectSkills).toHaveLength(1);
      expect(result.projectSkills[0]).toMatchObject({
        editorId: 'claude',
        action: 'written',
        path: join(testDir, '.claude', 'skills', 'open-knowledge', 'SKILL.md'),
      });
      expect(existsSync(join(testDir, '.claude', 'skills', 'open-knowledge', 'SKILL.md'))).toBe(
        true,
      );
    });

    it('scope=project writes project-level configs for claude, cursor, codex', async () => {
      const result = await runInitForTest({
        editors: ['claude', 'cursor', 'codex'],
        scope: 'project',
      });
      expect(result.editors).toHaveLength(3);
      for (const r of result.editors) {
        expect(r.configScope).toBe('project');
        expect(r.action).toBe('written');
      }
      expect(existsSync(join(testDir, '.mcp.json'))).toBe(true);
      expect(existsSync(join(testDir, '.cursor', 'mcp.json'))).toBe(true);
      expect(existsSync(join(testDir, '.codex', 'config.toml'))).toBe(true);
      expect(result.projectSkills).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            editorId: 'claude',
            action: 'written',
            path: join(testDir, '.claude', 'skills', 'open-knowledge', 'SKILL.md'),
          }),
          expect.objectContaining({
            editorId: 'cursor',
            action: 'written',
            path: join(testDir, '.cursor', 'skills', 'open-knowledge', 'SKILL.md'),
          }),
          expect.objectContaining({ editorId: 'codex', action: 'skipped-unsupported' }),
        ]),
      );
      expect(existsSync(join(testDir, '.cursor', 'skills', 'open-knowledge', 'SKILL.md'))).toBe(
        true,
      );
    });

    it('scope=project silently skips editors without projectConfigPath (claude-desktop)', async () => {
      const result = await runInitForTest({
        editors: ['claude-desktop'],
        scope: 'project',
      });
      expect(result.editors).toHaveLength(0);
    });

    it('scope=both writes user-level AND project-level for claude', async () => {
      const result = await runInitForTest({ editors: ['claude'], scope: 'both' });
      expect(result.editors).toHaveLength(2);
      const userResult = result.editors.find((r) => r.configScope !== 'project');
      const projResult = result.editors.find((r) => r.configScope === 'project');
      expect(userResult).toBeDefined();
      expect(projResult).toBeDefined();
      expect(userResult?.action).toBe('written');
      expect(projResult?.action).toBe('written');
      expect(existsSync(claudeConfigPath())).toBe(true);
      expect(existsSync(join(testDir, '.mcp.json'))).toBe(true);
      expect(existsSync(join(testDir, '.claude', 'skills', 'open-knowledge', 'SKILL.md'))).toBe(
        true,
      );
    });

    it('scope=both suppresses project-config notice for paths just written', async () => {
      const result = await runInitForTest({ editors: ['claude'], scope: 'both' });
      expect(result.legacyProjectConfigs).toHaveLength(0);
      const output = formatInitResult(result, testDir);
      expect(output).not.toContain('Project MCP configs found:');
    });

    it('scope=project shows "(project)" label in output', async () => {
      const result = await runInitForTest({ editors: ['claude'], scope: 'project' });
      const output = formatInitResult(result, testDir);
      expect(output).toContain('Claude Code (project)');
      expect(output).toContain('Project-local skills:');
      expect(output).toContain('.claude/skills/open-knowledge/SKILL.md');
    });

    it('--no-mcp skips all MCP writes regardless of scope', async () => {
      const result = await runInitForTest({ editors: ['claude'], mcp: false, scope: 'both' });
      expect(result.editors).toHaveLength(1);
      expect(result.editors[0].action).toBe('skipped-flag');
      expect(existsSync(claudeConfigPath())).toBe(false);
      expect(existsSync(join(testDir, '.mcp.json'))).toBe(false);
    });

    it('scope=both "Next steps" deduplicates editor labels (no double-count)', async () => {
      const result = await runInitForTest({ editors: ['claude'], scope: 'both' });
      const output = formatInitResult(result, testDir);
      const nextStepsLine = output.split('\n').find((l) => l.includes('Open your editor'));
      expect(nextStepsLine).toBeDefined();
      const matches = nextStepsLine?.match(/Claude Code/g);
      expect(matches).toHaveLength(1);
    });

    const allocOutsideTestDir = (suffix: string): string =>
      resolve(
        tmpdir(),
        `init-symlink-escape-${suffix}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      );

    it('refuses project-scope write when target file is a symlink', async () => {
      const decoyTarget = allocOutsideTestDir('decoy');
      writeFileSync(decoyTarget, 'untouched\n', 'utf-8');
      try {
        symlinkSync(decoyTarget, join(testDir, '.mcp.json'));

        const result = await runInitForTest({ editors: ['claude'], scope: 'project' });

        const projResult = result.editors.find((r) => r.configScope === 'project');
        expect(projResult?.action).toBe('failed');
        expect(projResult?.error).toMatch(/symbolic link/);
        expect(readFileSync(decoyTarget, 'utf-8')).toBe('untouched\n');
        expect(lstatSync(join(testDir, '.mcp.json')).isSymbolicLink()).toBe(true);
      } finally {
        rmSync(decoyTarget, { force: true });
      }
    });

    it('refuses project-scope write when an ancestor directory escapes cwd via symlink', async () => {
      const escapeTarget = allocOutsideTestDir('cursor-escape');
      mkdirSync(escapeTarget, { recursive: true });
      try {
        symlinkSync(escapeTarget, join(testDir, '.cursor'));

        const result = await runInitForTest({ editors: ['cursor'], scope: 'project' });

        const projResult = result.editors.find((r) => r.editorId === 'cursor');
        expect(projResult?.action).toBe('failed');
        expect(projResult?.error).toMatch(/outside the project directory/);
        expect(existsSync(join(escapeTarget, 'mcp.json'))).toBe(false);
      } finally {
        rmSync(escapeTarget, { recursive: true, force: true });
      }
    });

    it('refuses project-scope skill write when ancestor escapes cwd via symlink', async () => {
      const escapeTarget = allocOutsideTestDir('skill-escape');
      mkdirSync(escapeTarget, { recursive: true });
      try {
        mkdirSync(join(testDir, '.claude'), { recursive: true });
        symlinkSync(escapeTarget, join(testDir, '.claude', 'skills'));
        writeFileSync(join(escapeTarget, 'sentinel.txt'), 'untouched\n', 'utf-8');

        const result = await runInitForTest({ editors: ['claude'], scope: 'project' });

        const skill = result.projectSkills.find((s) => s.editorId === 'claude');
        expect(skill?.action).toBe('failed');
        expect(skill?.error).toMatch(/outside the project directory/);
        expect(readFileSync(join(escapeTarget, 'sentinel.txt'), 'utf-8')).toBe('untouched\n');
      } finally {
        rmSync(escapeTarget, { recursive: true, force: true });
      }
    });

    it('allows project-scope write through a symlink that stays within cwd', async () => {
      const inProject = join(testDir, '.cursor-shared');
      mkdirSync(inProject, { recursive: true });
      symlinkSync(inProject, join(testDir, '.cursor'));

      const result = await runInitForTest({ editors: ['cursor'], scope: 'project' });

      const projResult = result.editors.find((r) => r.editorId === 'cursor');
      expect(projResult?.action).toBe('written');
      expect(existsSync(join(inProject, 'mcp.json'))).toBe(true);
    });
  });
});

describe('runInit — projectRoot threading', () => {
  let testDir: string;
  let fakeHome: string;
  const originalHome = process.env.HOME;
  const originalPlatform = process.platform;
  const defaultInstallUserSkill = async () => 'installed' as const;

  beforeEach(() => {
    const rawDir = resolve(
      tmpdir(),
      `init-projectroot-test-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    );
    mkdirSync(rawDir, { recursive: true });
    testDir = realpathSync(rawDir);
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

  it('returns projectRoot equal to git root when cwd sits in a sub-folder', async () => {
    const repo = join(fakeHome, 'repo');
    const sub = join(repo, 'sub');
    mkdirSync(sub, { recursive: true });
    Bun.spawnSync({ cmd: ['git', 'init', '-q', repo], stdout: 'ignore', stderr: 'ignore' });
    expect(existsSync(join(repo, '.git'))).toBe(true);

    const result = await runInit({
      cwd: sub,
      home: fakeHome,
      installUserSkill: defaultInstallUserSkill,
      scope: 'user',
    });

    expect(result.projectRoot).toBe(repo);
    expect(existsSync(join(repo, OK_DIR))).toBe(true);
    expect(existsSync(join(sub, OK_DIR))).toBe(false);
  });

  it('returns projectRoot equal to cwd when cwd is the git root', async () => {
    const repo = join(fakeHome, 'flat-repo');
    mkdirSync(repo, { recursive: true });
    Bun.spawnSync({ cmd: ['git', 'init', '-q', repo], stdout: 'ignore', stderr: 'ignore' });

    const result = await runInit({
      cwd: repo,
      home: fakeHome,
      installUserSkill: defaultInstallUserSkill,
      scope: 'user',
    });

    expect(result.projectRoot).toBe(repo);
    expect(existsSync(join(repo, OK_DIR))).toBe(true);
  });

  it('loadConfig succeeds when called against the resolved projectRoot', async () => {
    const repo = join(fakeHome, 'repo-loadconfig');
    const sub = join(repo, 'subdir');
    mkdirSync(sub, { recursive: true });
    Bun.spawnSync({ cmd: ['git', 'init', '-q', repo], stdout: 'ignore', stderr: 'ignore' });

    const result = await runInit({
      cwd: sub,
      home: fakeHome,
      installUserSkill: defaultInstallUserSkill,
      scope: 'user',
    });

    expect(result.projectRoot).toBe(repo);
    expect(existsSync(join(repo, OK_DIR, 'config.yml'))).toBe(true);
    const { config: rootConfig } = loadConfig(result.projectRoot);
    expect(rootConfig).toBeDefined();
    expect(rootConfig.content.dir).toBe('subdir');
  });
});

describe('resolveMcpScope', () => {
  it('returns "user" when --scope user is passed, without calling promptFn', async () => {
    const promptFn = async (): Promise<'user' | 'project' | 'both' | null> => {
      throw new Error('promptFn should not be called');
    };
    const result = await resolveMcpScope({ scope: 'user', promptFn });
    expect(result).toBe('user');
  });

  it('returns "project" when --scope project is passed, without calling promptFn', async () => {
    const promptFn = async (): Promise<'user' | 'project' | 'both' | null> => {
      throw new Error('promptFn should not be called');
    };
    const result = await resolveMcpScope({ scope: 'project', promptFn });
    expect(result).toBe('project');
  });

  it('returns "both" when --scope both is passed, without calling promptFn', async () => {
    const promptFn = async (): Promise<'user' | 'project' | 'both' | null> => {
      throw new Error('promptFn should not be called');
    };
    const result = await resolveMcpScope({ scope: 'both', promptFn });
    expect(result).toBe('both');
  });

  it('returns "both" in non-TTY mode (isTTY=false), without calling promptFn', async () => {
    const promptFn = async (): Promise<'user' | 'project' | 'both' | null> => {
      throw new Error('promptFn should not be called');
    };
    const result = await resolveMcpScope({ isTTY: false, promptFn });
    expect(result).toBe('both');
  });

  it('calls promptFn and returns its result in TTY mode (isTTY=true)', async () => {
    let called = false;
    const promptFn = async (): Promise<'user' | 'project' | 'both' | null> => {
      called = true;
      return 'project';
    };
    const result = await resolveMcpScope({ isTTY: true, promptFn });
    expect(called).toBe(true);
    expect(result).toBe('project');
  });

  it('returns null when --no-mcp (mcp=false), without calling promptFn', async () => {
    const promptFn = async (): Promise<'user' | 'project' | 'both' | null> => {
      throw new Error('promptFn should not be called');
    };
    const result = await resolveMcpScope({ mcp: false, isTTY: true, promptFn });
    expect(result).toBeNull();
  });

  it('returns null when promptFn returns null (user cleared both checkboxes — equivalent to --no-mcp)', async () => {
    const promptFn = async (): Promise<'user' | 'project' | 'both' | null> => null;
    const result = await resolveMcpScope({ isTTY: true, promptFn });
    expect(result).toBeNull();
  });
});

describe('initCommand', () => {
  it('rejects --scope with an invalid value (non-zero exit)', () => {
    const cmd = initCommand();
    cmd.exitOverride();
    expect(() => cmd.parse(['--scope', 'bogus'], { from: 'user' })).toThrow();
  });
});

describe('detectInstalledEditors', () => {
  let testDir: string;
  let fakeHome: string;
  const originalPlatform = process.platform;
  const originalHome = process.env.HOME;

  const cursorConfigPath = () => resolveCursorConfigPath({ home: fakeHome });
  const codexConfigPath = () => resolveCodexConfigPath({ home: fakeHome, env: {} });

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

  it('returns all supported editors when all editor config dirs exist', async () => {
    mkdirSync(join(fakeHome, '.claude'), { recursive: true });
    mkdirSync(dirname(resolveClaudeDesktopConfigPath({ home: fakeHome })), { recursive: true });
    mkdirSync(dirname(cursorConfigPath()), { recursive: true });
    mkdirSync(dirname(codexConfigPath()), { recursive: true });
    const detected = detectInstalledEditors(testDir, fakeHome);
    expect(detected).toEqual(expect.arrayContaining([...ALL_EDITOR_IDS]));
    expect(detected).toHaveLength(ALL_EDITOR_IDS.length);
  });

  it('preserves EDITOR_TARGETS ordering in return value', async () => {
    mkdirSync(join(fakeHome, '.claude'), { recursive: true });
    mkdirSync(dirname(resolveClaudeDesktopConfigPath({ home: fakeHome })), { recursive: true });
    mkdirSync(dirname(cursorConfigPath()), { recursive: true });
    mkdirSync(dirname(codexConfigPath()), { recursive: true });
    const detected = detectInstalledEditors(testDir, fakeHome);
    expect(detected).toEqual(['claude', 'claude-desktop', 'cursor', 'codex']);
  });

  it('returns empty list when the cwd itself does not exist (zero-detected edge case)', () => {
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

  it('does NOT create .git, AGENTS.md, .ok, or launch.json under the fake HOME', async () => {
    await writeUserMcpConfigs({
      editors: ['claude', 'cursor'],
      cliPath: CLI_PATH,
      home: fakeHome,
    });

    expect(existsSync(join(fakeHome, '.git'))).toBe(false);
    expect(existsSync(join(fakeHome, 'AGENTS.md'))).toBe(false);
    expect(existsSync(join(fakeHome, 'CLAUDE.md'))).toBe(false);
    expect(existsSync(join(fakeHome, '.claude', 'launch.json'))).toBe(false);
    expect(existsSync(join(fakeHome, OK_DIR))).toBe(false);
    expect(existsSync(join(fakeHome, '.mcp.json'))).toBe(false);
  });

  it('unconditionally overwrites a differing existing entry (always-write semantic)', async () => {
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
    const config = JSON.parse(readFileSync(claudePath, 'utf-8'));
    expect(config.mcpServers['open-knowledge']).toEqual({ command: CLI_PATH, args: ['mcp'] });
  });

  it('reports action:failed for unsupported editors without throwing', async () => {
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
