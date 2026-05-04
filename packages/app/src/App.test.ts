import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const SRC_PATH = join(__dirname, 'App.tsx');
const src = readFileSync(SRC_PATH, 'utf-8');

describe('App module', () => {
  test('Component module imports cleanly', async () => {
    const mod = await import('./App');
    expect(typeof mod.App).toBe('function');
  });
});

describe('SettingsShortcutHandler wiring (US-010)', () => {
  test('imports isSettingsShortcut and SETTINGS_OPEN_HASH from use-settings-route', () => {
    expect(src).toContain('isSettingsShortcut');
    expect(src).toContain('SETTINGS_OPEN_HASH');
    expect(src).toMatch(/from\s*'@\/lib\/use-settings-route'/);
  });

  test('declares a SettingsShortcutHandler component and mounts it in App body', () => {
    expect(src).toContain('function SettingsShortcutHandler()');
    expect(src).toMatch(/<SettingsShortcutHandler\s*\/>/);
  });

  const handlerBlock =
    src
      .split('function SettingsShortcutHandler()')[1]
      ?.split('function NewItemShortcutHandler()')[0] ?? '';

  test('handler subscribes to window keydown and dispatches via isSettingsShortcut', () => {
    expect(handlerBlock).toContain("addEventListener('keydown'");
    expect(handlerBlock).toContain("removeEventListener('keydown'");
    expect(handlerBlock).toContain('isSettingsShortcut');
  });

  test('handler routes to the canonical SETTINGS_OPEN_HASH (no inlined literal)', () => {
    expect(handlerBlock).toContain('SETTINGS_OPEN_HASH');
    expect(handlerBlock).not.toContain("'#settings'");
  });

  test('SettingsShortcutHandler mount sits between NewItemShortcutHandler and InstallInClaudeDesktopTrigger', () => {
    const newItemIdx = src.indexOf('<NewItemShortcutHandler');
    const settingsIdx = src.indexOf('<SettingsShortcutHandler');
    const installIdx = src.indexOf('<InstallInClaudeDesktopTrigger');
    expect(newItemIdx).toBeGreaterThanOrEqual(0);
    expect(settingsIdx).toBeGreaterThan(newItemIdx);
    expect(installIdx).toBeGreaterThan(settingsIdx);
  });
});
