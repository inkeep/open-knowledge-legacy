import { describe, expect, it } from 'bun:test';
import { resolveAppSupportPath, resolveClaudeDesktopConfigPath } from './editors.ts';

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

  it('builds the Linux config path', () => {
    expect(
      resolveClaudeDesktopConfigPath({
        home: '/home/alice',
        platformName: 'linux',
        env: { XDG_CONFIG_HOME: '/home/alice/.config' },
      }),
    ).toBe('/home/alice/.config/Claude/claude_desktop_config.json');
  });
});
