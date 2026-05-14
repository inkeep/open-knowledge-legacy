import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import {
  buildManagedServerEntry,
  EDITOR_TARGETS,
  type EditorId,
  resolveAppSupportPath,
  resolveClaudeCodeConfigPath,
  resolveClaudeDesktopConfigPath,
  resolveCodexConfigPath,
  resolveCursorConfigPath,
  resolveEditorTargets,
} from './editors.ts';

describe('resolveAppSupportPath', () => {
  it('uses macOS Application Support under home', () => {
    expect(resolveAppSupportPath({ home: '/Users/alice', platformName: 'darwin' })).toBe(
      '/Users/alice/Library/Application Support',
    );
  });

  it('uses APPDATA on Windows when available', () => {
    expect(
      resolveAppSupportPath({
        home: 'C:\\Users\\Alice',
        platformName: 'win32',
        env: { APPDATA: 'C:\\Users\\Alice\\AppData\\Roaming' },
      }),
    ).toBe('C:\\Users\\Alice\\AppData\\Roaming');
  });

  it('falls back to AppData/Roaming on Windows when APPDATA is absent', () => {
    expect(
      resolveAppSupportPath({
        home: 'C:\\Users\\Alice',
        platformName: 'win32',
        env: {},
      }),
    ).toBe('C:\\Users\\Alice\\AppData\\Roaming');
  });

  it('uses XDG_CONFIG_HOME on Linux when available', () => {
    expect(
      resolveAppSupportPath({
        home: '/home/alice',
        platformName: 'linux',
        env: { XDG_CONFIG_HOME: '/tmp/xdg-config' },
      }),
    ).toBe('/tmp/xdg-config');
  });

  it('falls back to ~/.config on Linux when XDG_CONFIG_HOME is absent', () => {
    expect(resolveAppSupportPath({ home: '/home/alice', platformName: 'linux', env: {} })).toBe(
      '/home/alice/.config',
    );
  });
});

describe('resolveClaudeDesktopConfigPath', () => {
  it('builds the macOS config path', () => {
    expect(
      resolveClaudeDesktopConfigPath({
        home: '/Users/alice',
        platformName: 'darwin',
      }),
    ).toBe('/Users/alice/Library/Application Support/Claude/claude_desktop_config.json');
  });

  it('builds the Windows config path', () => {
    expect(
      resolveClaudeDesktopConfigPath({
        home: 'C:\\Users\\Alice',
        platformName: 'win32',
        env: { APPDATA: 'C:\\Users\\Alice\\AppData\\Roaming' },
      }),
    ).toBe('C:\\Users\\Alice\\AppData\\Roaming\\Claude\\claude_desktop_config.json');
  });

  it('rejects unsupported platforms', () => {
    expect(() =>
      resolveClaudeDesktopConfigPath({
        home: '/home/alice',
        platformName: 'linux',
        env: { XDG_CONFIG_HOME: '/home/alice/.config' },
      }),
    ).toThrow(/Claude Desktop is not available on linux\. Supported: macOS, Windows\./);
  });
});

describe('resolveClaudeCodeConfigPath', () => {
  it('builds the macOS config path', () => {
    expect(
      resolveClaudeCodeConfigPath({
        home: '/Users/alice',
        platformName: 'darwin',
      }),
    ).toBe('/Users/alice/.claude.json');
  });

  it('builds the Windows config path', () => {
    expect(
      resolveClaudeCodeConfigPath({
        home: 'C:\\Users\\Alice',
        platformName: 'win32',
      }),
    ).toBe('C:\\Users\\Alice\\.claude.json');
  });
});

describe('resolveCursorConfigPath', () => {
  it('builds the global Cursor config path', () => {
    expect(
      resolveCursorConfigPath({
        home: '/Users/alice',
        platformName: 'darwin',
      }),
    ).toBe('/Users/alice/.cursor/mcp.json');
  });
});

describe('resolveCodexConfigPath', () => {
  it('builds the default Codex config path', () => {
    expect(
      resolveCodexConfigPath({
        home: '/Users/alice',
        platformName: 'darwin',
        env: {},
      }),
    ).toBe('/Users/alice/.codex/config.toml');
  });

  it('honors CODEX_HOME when present', () => {
    expect(
      resolveCodexConfigPath({
        home: '/Users/alice',
        platformName: 'darwin',
        env: { CODEX_HOME: '/tmp/custom-codex-home' },
      }),
    ).toBe('/tmp/custom-codex-home/config.toml');
  });
});

describe('buildManagedServerEntry', () => {
  const originalArgv1 = process.argv[1];
  beforeEach(() => {
    process.argv[1] = '/repo/packages/cli/src/cli.ts';
  });
  afterEach(() => {
    process.argv[1] = originalArgv1;
  });

  it('produces the canonical npx shape by default (no cliPath, published mode)', () => {
    expect(buildManagedServerEntry()).toEqual({
      command: 'npx',
      args: ['-y', '@inkeep/open-knowledge@latest', 'mcp'],
    });
  });

  it('produces the canonical npx shape when mode is explicitly published', () => {
    expect(buildManagedServerEntry({ mode: 'published' })).toEqual({
      command: 'npx',
      args: ['-y', '@inkeep/open-knowledge@latest', 'mcp'],
    });
  });

  it('produces the dev shape when mode is dev and no cliPath is set', () => {
    const entry = buildManagedServerEntry({ mode: 'dev' });
    expect(entry).toEqual({
      command: 'node',
      args: ['/repo/packages/cli/dist/cli.mjs', 'mcp'],
      env: { MCP_DEBUG: '1', OK_LOG_FILE: '/tmp/ok-mcp.log' },
    });
  });

  it('emits the cliPath shape as the highest-precedence branch', () => {
    expect(
      buildManagedServerEntry({
        cliPath: '/Applications/Open Knowledge.app/Contents/Resources/cli/bin/ok.sh',
      }),
    ).toEqual({
      command: '/Applications/Open Knowledge.app/Contents/Resources/cli/bin/ok.sh',
      args: ['mcp'],
    });
  });

  it('cliPath overrides dev mode (highest-precedence — no dev args leak through)', () => {
    const entry = buildManagedServerEntry({
      mode: 'dev',
      cliPath: '/usr/local/bin/ok',
    });
    expect(entry).toEqual({ command: '/usr/local/bin/ok', args: ['mcp'] });
    expect(entry.env).toBeUndefined();
  });

  it('cliPath entry contains no npx-shaped fields', () => {
    const entry = buildManagedServerEntry({ cliPath: '/usr/local/bin/ok' });
    expect(entry.command).toBe('/usr/local/bin/ok');
    expect((entry.args as string[]).includes('@inkeep/open-knowledge')).toBe(false);
    expect((entry.args as string[]).includes('npx')).toBe(false);
  });
});

describe('EDITOR_TARGETS.buildEntry with cliPath', () => {
  it('Claude Code emits command:cliPath without type:stdio', () => {
    const entry = EDITOR_TARGETS.claude.buildEntry('', { cliPath: '/usr/local/bin/ok' });
    expect(entry).toEqual({ command: '/usr/local/bin/ok', args: ['mcp'] });
    expect(entry.type).toBeUndefined();
  });

  it('Cursor emits command:cliPath without type:stdio', () => {
    const entry = EDITOR_TARGETS.cursor.buildEntry('', { cliPath: '/usr/local/bin/ok' });
    expect(entry).toEqual({ command: '/usr/local/bin/ok', args: ['mcp'] });
    expect(entry.type).toBeUndefined();
  });

  it('Codex emits command:cliPath (TOML format, no type:stdio)', () => {
    const entry = EDITOR_TARGETS.codex.buildEntry('', { cliPath: '/usr/local/bin/ok' });
    expect(entry).toEqual({ command: '/usr/local/bin/ok', args: ['mcp'] });
  });

  it('Claude Desktop emits command:cliPath', () => {
    const entry = EDITOR_TARGETS['claude-desktop'].buildEntry('', {
      cliPath: '/usr/local/bin/ok',
    });
    expect(entry).toEqual({ command: '/usr/local/bin/ok', args: ['mcp'] });
  });

  it('isCompatible returns true when existing matches cliPath shape', () => {
    const target = EDITOR_TARGETS.claude;
    const existing = { command: '/usr/local/bin/ok', args: ['mcp'] };
    expect(target.isCompatible(existing, '', { cliPath: '/usr/local/bin/ok' })).toBe(true);
  });

  it('isCompatible returns false when existing cliPath differs', () => {
    const target = EDITOR_TARGETS.claude;
    const existing = { command: '/opt/homebrew/bin/ok', args: ['mcp'] };
    expect(target.isCompatible(existing, '', { cliPath: '/usr/local/bin/ok' })).toBe(false);
  });
});

describe('resolveEditorTargets', () => {
  it('rejects prototype-chain editor IDs (toString, __proto__, hasOwnProperty)', () => {
    for (const evil of ['toString', '__proto__', 'hasOwnProperty', 'constructor']) {
      expect(() => resolveEditorTargets([evil as EditorId])).toThrow(/Unknown editor/);
    }
  });

  it('returns the matching targets for valid IDs', () => {
    const targets = resolveEditorTargets(['claude', 'cursor']);
    expect(targets).toHaveLength(2);
    expect(targets[0].id).toBe('claude');
    expect(targets[1].id).toBe('cursor');
  });
});
