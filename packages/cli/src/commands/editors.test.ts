import { describe, expect, it } from 'bun:test';
import {
  resolveAppSupportPath,
  resolveClaudeCodeConfigPath,
  resolveClaudeDesktopConfigPath,
  resolveCodexConfigPath,
  resolveCursorConfigPath,
  resolveVsCodeConfigPath,
  resolveWindsurfConfigPath,
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

describe('resolveVsCodeConfigPath', () => {
  it('builds the macOS VS Code config path', () => {
    expect(
      resolveVsCodeConfigPath({
        home: '/Users/alice',
        platformName: 'darwin',
      }),
    ).toBe('/Users/alice/Library/Application Support/Code/User/mcp.json');
  });

  it('builds the Linux VS Code config path', () => {
    expect(
      resolveVsCodeConfigPath({
        home: '/home/alice',
        platformName: 'linux',
        env: { XDG_CONFIG_HOME: '/tmp/xdg-config' },
      }),
    ).toBe('/tmp/xdg-config/Code/User/mcp.json');
  });
});

describe('resolveWindsurfConfigPath', () => {
  it('builds the global Windsurf config path', () => {
    expect(
      resolveWindsurfConfigPath({
        home: '/Users/alice',
        platformName: 'darwin',
      }),
    ).toBe('/Users/alice/.codeium/windsurf/mcp_config.json');
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
