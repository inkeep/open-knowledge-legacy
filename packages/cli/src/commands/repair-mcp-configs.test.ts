import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { chmodSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import {
  resolveClaudeCodeConfigPath,
  resolveClaudeDesktopConfigPath,
  resolveCodexConfigPath,
  resolveCursorConfigPath,
} from './editors.ts';
import {
  classifyMcpEntry,
  type RepairLogEvent,
  type RepairOutcome,
  repairMcpConfigs,
} from './repair-mcp-configs.ts';

const CANONICAL = { command: 'npx', args: ['-y', '@inkeep/open-knowledge@latest', 'mcp'] };
const LEGACY_BARE = { command: 'npx', args: ['@inkeep/open-knowledge', 'mcp'] };
const LEGACY_BARE_WITH_Y = { command: 'npx', args: ['-y', '@inkeep/open-knowledge', 'mcp'] };

describe('classifyMcpEntry', () => {
  it('returns "canonical" for the published @latest shape', () => {
    expect(classifyMcpEntry(CANONICAL)).toBe('canonical');
  });

  it('returns "legacy-bare" for the unpinned 2-arg npx shape', () => {
    expect(classifyMcpEntry(LEGACY_BARE)).toBe('legacy-bare');
  });

  it('returns "legacy-bare" for the unpinned -y 3-arg npx shape', () => {
    expect(classifyMcpEntry(LEGACY_BARE_WITH_Y)).toBe('legacy-bare');
  });

  it('returns "preserved" when the package is pinned to @beta', () => {
    expect(
      classifyMcpEntry({
        command: 'npx',
        args: ['-y', '@inkeep/open-knowledge@beta', 'mcp'],
      }),
    ).toBe('preserved');
  });

  it('returns "preserved" when the package is pinned to a concrete version', () => {
    expect(
      classifyMcpEntry({
        command: 'npx',
        args: ['-y', '@inkeep/open-knowledge@0.5.0', 'mcp'],
      }),
    ).toBe('preserved');
  });

  it('returns "preserved" when the bare @latest spec omits the -y flag', () => {
    expect(
      classifyMcpEntry({
        command: 'npx',
        args: ['@inkeep/open-knowledge@latest', 'mcp'],
      }),
    ).toBe('preserved');
  });

  it('returns "preserved" for dev-mode (command=node, dist path)', () => {
    expect(
      classifyMcpEntry({
        command: 'node',
        args: ['/path/to/packages/cli/dist/cli.mjs', 'mcp'],
      }),
    ).toBe('preserved');
  });

  it('returns "preserved" for the desktop-bundled wrapper path', () => {
    expect(
      classifyMcpEntry({
        command: '/Applications/Open Knowledge.app/Contents/Resources/cli/bin/ok.sh',
        args: ['mcp'],
      }),
    ).toBe('preserved');
  });

  it('returns "preserved" for the desktop-bundled /usr/local/bin/ok symlink', () => {
    expect(classifyMcpEntry({ command: '/usr/local/bin/ok', args: ['mcp'] })).toBe('preserved');
  });

  it('returns "preserved" for an arbitrary custom command', () => {
    expect(classifyMcpEntry({ command: 'my-wrapper', args: ['mcp'] })).toBe('preserved');
  });

  it('returns "preserved" for legacy bare shape with extra trailing args', () => {
    expect(
      classifyMcpEntry({
        command: 'npx',
        args: ['@inkeep/open-knowledge', 'mcp', '--cwd', '/some/path'],
      }),
    ).toBe('preserved');
  });

  it('returns "preserved" for entries with non-array args', () => {
    expect(classifyMcpEntry({ command: 'npx', args: 'mcp' })).toBe('preserved');
  });

  it('returns "preserved" for entries with non-string command', () => {
    expect(classifyMcpEntry({ command: 42, args: ['@inkeep/open-knowledge', 'mcp'] })).toBe(
      'preserved',
    );
  });

  it('returns "preserved" for empty entries', () => {
    expect(classifyMcpEntry({})).toBe('preserved');
  });
});

describe('repairMcpConfigs', () => {
  let testDir: string;
  let fakeHome: string;
  let projectDir: string;
  const originalPlatform = process.platform;
  let logEvents: RepairLogEvent[];
  const logger = (event: RepairLogEvent) => {
    logEvents.push(event);
  };

  let originalCodexHome: string | undefined;

  beforeEach(() => {
    testDir = resolve(
      tmpdir(),
      `repair-mcp-test-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    );
    fakeHome = join(testDir, 'fakehome');
    projectDir = join(testDir, 'project');
    mkdirSync(fakeHome, { recursive: true });
    mkdirSync(projectDir, { recursive: true });
    mkdirSync(join(fakeHome, '.claude'), { recursive: true });
    mkdirSync(join(fakeHome, '.cursor'), { recursive: true });
    mkdirSync(join(fakeHome, '.codex'), { recursive: true });
    Object.defineProperty(process, 'platform', { value: 'darwin', configurable: true });
    originalCodexHome = process.env.CODEX_HOME;
    delete process.env.CODEX_HOME;
    logEvents = [];
  });

  afterEach(() => {
    Object.defineProperty(process, 'platform', { value: originalPlatform, configurable: true });
    if (originalCodexHome === undefined) {
      delete process.env.CODEX_HOME;
    } else {
      process.env.CODEX_HOME = originalCodexHome;
    }
    rmSync(testDir, { recursive: true, force: true });
  });

  function writeUserClaude(entry: Record<string, unknown>): string {
    const path = resolveClaudeCodeConfigPath({ home: fakeHome });
    writeFileSync(path, JSON.stringify({ mcpServers: { 'open-knowledge': entry } }, null, 2));
    return path;
  }

  function writeUserCursor(entry: Record<string, unknown>): string {
    const path = resolveCursorConfigPath({ home: fakeHome });
    writeFileSync(path, JSON.stringify({ mcpServers: { 'open-knowledge': entry } }, null, 2));
    return path;
  }

  function writeUserCodexLegacy(): string {
    const path = resolveCodexConfigPath({ home: fakeHome, env: {} });
    writeFileSync(
      path,
      '[mcp_servers."open-knowledge"]\ncommand = "npx"\nargs = ["@inkeep/open-knowledge", "mcp"]\n',
    );
    return path;
  }

  function findOutcome(
    outcomes: readonly RepairOutcome[],
    scope: 'user' | 'project',
    editorId: string,
  ): RepairOutcome | undefined {
    return outcomes.find((o) => o.scope === scope && o.editorId === editorId);
  }

  it('rewrites a legacy bare entry forward to the canonical @latest shape', () => {
    const configPath = writeUserClaude(LEGACY_BARE);

    const result = repairMcpConfigs({ projectDir, home: fakeHome, logger });

    const claude = findOutcome(result.outcomes, 'user', 'claude');
    expect(claude?.outcome).toBe('repaired');
    expect(claude?.configPath).toBe(configPath);
    expect(result.repairedCount).toBe(1);

    const written = JSON.parse(readFileSync(configPath, 'utf-8'));
    expect(written.mcpServers['open-knowledge']).toEqual(CANONICAL);

    expect(logEvents).toContainEqual({
      event: 'mcp-config-repair-applied',
      scope: 'user',
      editorId: 'claude',
      configPath,
    });
  });

  it('rewrites the -y legacy variant forward', () => {
    writeUserClaude(LEGACY_BARE_WITH_Y);

    const result = repairMcpConfigs({ projectDir, home: fakeHome, logger });

    const claude = findOutcome(result.outcomes, 'user', 'claude');
    expect(claude?.outcome).toBe('repaired');
    const written = JSON.parse(
      readFileSync(resolveClaudeCodeConfigPath({ home: fakeHome }), 'utf-8'),
    );
    expect(written.mcpServers['open-knowledge']).toEqual(CANONICAL);
  });

  it('leaves an already-canonical entry untouched (outcome=canonical, no rewrite)', () => {
    const configPath = writeUserClaude(CANONICAL);
    const before = readFileSync(configPath, 'utf-8');

    const result = repairMcpConfigs({ projectDir, home: fakeHome, logger });

    const claude = findOutcome(result.outcomes, 'user', 'claude');
    expect(claude?.outcome).toBe('canonical');
    expect(result.repairedCount).toBe(0);
    expect(readFileSync(configPath, 'utf-8')).toBe(before);
    expect(logEvents.filter((e) => e.event === 'mcp-config-repair-applied')).toHaveLength(0);
  });

  it('preserves a @beta-pinned entry (user intent)', () => {
    const configPath = writeUserClaude({
      command: 'npx',
      args: ['-y', '@inkeep/open-knowledge@beta', 'mcp'],
    });
    const before = readFileSync(configPath, 'utf-8');

    const result = repairMcpConfigs({ projectDir, home: fakeHome, logger });

    const claude = findOutcome(result.outcomes, 'user', 'claude');
    expect(claude?.outcome).toBe('preserved');
    expect(readFileSync(configPath, 'utf-8')).toBe(before);
  });

  it('preserves a desktop-bundled wrapper entry', () => {
    const configPath = writeUserClaude({
      command: '/Applications/Open Knowledge.app/Contents/Resources/cli/bin/ok.sh',
      args: ['mcp'],
    });
    const before = readFileSync(configPath, 'utf-8');

    const result = repairMcpConfigs({ projectDir, home: fakeHome, logger });

    const claude = findOutcome(result.outcomes, 'user', 'claude');
    expect(claude?.outcome).toBe('preserved');
    expect(readFileSync(configPath, 'utf-8')).toBe(before);
  });

  it('preserves a dev-mode entry', () => {
    const configPath = writeUserClaude({
      command: 'node',
      args: ['/some/dist/cli.mjs', 'mcp'],
      env: { MCP_DEBUG: '1' },
    });
    const before = readFileSync(configPath, 'utf-8');

    const result = repairMcpConfigs({ projectDir, home: fakeHome, logger });

    const claude = findOutcome(result.outcomes, 'user', 'claude');
    expect(claude?.outcome).toBe('preserved');
    expect(readFileSync(configPath, 'utf-8')).toBe(before);
  });

  it('reports no-entry when an editor has no config file at all', () => {
    const result = repairMcpConfigs({ projectDir, home: fakeHome, logger });

    const claude = findOutcome(result.outcomes, 'user', 'claude');
    expect(claude?.outcome).toBe('no-entry');
  });

  it('reports no-entry when a config file exists but has no open-knowledge server', () => {
    const path = resolveClaudeCodeConfigPath({ home: fakeHome });
    writeFileSync(
      path,
      JSON.stringify({ mcpServers: { 'other-server': { command: 'foo' } } }, null, 2),
    );

    const result = repairMcpConfigs({ projectDir, home: fakeHome, logger });

    const claude = findOutcome(result.outcomes, 'user', 'claude');
    expect(claude?.outcome).toBe('no-entry');
  });

  it('repairs a TOML (Codex) legacy entry', () => {
    const configPath = writeUserCodexLegacy();

    const result = repairMcpConfigs({ projectDir, home: fakeHome, logger });

    const codex = findOutcome(result.outcomes, 'user', 'codex');
    expect(codex?.outcome).toBe('repaired');

    const rewritten = readFileSync(configPath, 'utf-8');
    expect(rewritten).toContain('"-y"');
    expect(rewritten).toContain('"@inkeep/open-knowledge@latest"');
    expect(rewritten).toContain('"mcp"');
  });

  it('repairs project-level configs in addition to user-level', () => {
    writeUserClaude(LEGACY_BARE);

    const projectMcp = join(projectDir, '.mcp.json');
    writeFileSync(
      projectMcp,
      JSON.stringify({ mcpServers: { 'open-knowledge': LEGACY_BARE } }, null, 2),
    );

    const result = repairMcpConfigs({ projectDir, home: fakeHome, logger });

    const userClaude = findOutcome(result.outcomes, 'user', 'claude');
    const projectClaude = findOutcome(result.outcomes, 'project', 'claude');
    expect(userClaude?.outcome).toBe('repaired');
    expect(projectClaude?.outcome).toBe('repaired');
    expect(projectClaude?.configPath).toBe(projectMcp);

    const written = JSON.parse(readFileSync(projectMcp, 'utf-8'));
    expect(written.mcpServers['open-knowledge']).toEqual(CANONICAL);
  });

  it('sweeps every editor in ALL_EDITOR_IDS independently', () => {
    writeUserClaude(LEGACY_BARE);
    writeUserCursor(LEGACY_BARE);

    const result = repairMcpConfigs({ projectDir, home: fakeHome, logger });

    expect(findOutcome(result.outcomes, 'user', 'claude')?.outcome).toBe('repaired');
    expect(findOutcome(result.outcomes, 'user', 'cursor')?.outcome).toBe('repaired');
    expect(findOutcome(result.outcomes, 'user', 'codex')?.outcome).toBe('no-entry');
    expect(findOutcome(result.outcomes, 'user', 'claude-desktop')?.outcome).toBe('no-entry');
    expect(result.repairedCount).toBe(2);
  });

  it('skips claude-desktop silently on platforms where its config path is unsupported', () => {
    Object.defineProperty(process, 'platform', { value: 'linux', configurable: true });

    const result = repairMcpConfigs({ projectDir, home: fakeHome, logger });

    expect(findOutcome(result.outcomes, 'user', 'claude-desktop')).toBeUndefined();
    expect(findOutcome(result.outcomes, 'user', 'claude')).toBeDefined();
  });

  it('emits a single stderr JSON line per repair when no logger is injected', () => {
    writeUserClaude(LEGACY_BARE);

    const writes: string[] = [];
    const origWrite = process.stderr.write.bind(process.stderr);
    process.stderr.write = ((chunk: string | Uint8Array) => {
      writes.push(typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString('utf-8'));
      return true;
    }) as typeof process.stderr.write;

    try {
      repairMcpConfigs({ projectDir, home: fakeHome });
    } finally {
      process.stderr.write = origWrite;
    }

    const appliedLines = writes.filter((w) => w.includes('"mcp-config-repair-applied"'));
    expect(appliedLines.length).toBe(1);
    const parsed = JSON.parse(appliedLines[0].trim());
    expect(parsed.event).toBe('mcp-config-repair-applied');
    expect(parsed.editorId).toBe('claude');
  });

  it('reports write-failed and emits the structured event when the config file is unwritable', () => {
    const configPath = writeUserClaude(LEGACY_BARE);
    chmodSync(configPath, 0o444);
    try {
      const result = repairMcpConfigs({ projectDir, home: fakeHome, logger });

      const claude = findOutcome(result.outcomes, 'user', 'claude');
      expect(claude?.outcome).toBe('write-failed');
      expect(typeof claude?.error).toBe('string');
      expect(claude?.error?.length ?? 0).toBeGreaterThan(0);
      expect(result.repairedCount).toBe(0);

      const writeFailed = logEvents.find((e) => e.event === 'mcp-config-repair-write-failed');
      expect(writeFailed).toBeDefined();
      expect(writeFailed?.scope).toBe('user');
      expect(writeFailed?.editorId).toBe('claude');
      expect(writeFailed?.configPath).toBe(configPath);
      expect(typeof writeFailed?.error).toBe('string');
    } finally {
      chmodSync(configPath, 0o644);
    }
  });

  it('does not create config files for editors that had no prior entry', () => {
    rmSync(join(fakeHome, '.claude'), { recursive: true, force: true });
    rmSync(join(fakeHome, '.cursor'), { recursive: true, force: true });
    rmSync(join(fakeHome, '.codex'), { recursive: true, force: true });

    repairMcpConfigs({ projectDir, home: fakeHome, logger });

    expect(existsSync(resolveClaudeCodeConfigPath({ home: fakeHome }))).toBe(false);
    expect(existsSync(resolveCursorConfigPath({ home: fakeHome }))).toBe(false);
    expect(existsSync(resolveCodexConfigPath({ home: fakeHome, env: {} }))).toBe(false);
    if (process.platform === 'darwin') {
      expect(existsSync(resolveClaudeDesktopConfigPath({ home: fakeHome }))).toBe(false);
    }
  });
});
