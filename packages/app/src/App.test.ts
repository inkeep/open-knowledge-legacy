/**
 * App.tsx source-level guards (US-010 / FR-1 / D54).
 *
 * Regression coverage for the `SettingsShortcutHandler` mount + the
 * `isSettingsShortcut` predicate's keydown wiring. The pure predicate is
 * unit-tested in `lib/use-settings-route.test.ts`; this file pins the App-
 * scope wiring shape (handler is mounted, listens for keydown, sets the
 * canonical hash) so a future refactor that drops or relocates the handler
 * is caught here rather than in browser smoke tests.
 *
 * No @testing-library/react — full DOM exercise is deferred to Playwright
 * (manual verify in v0; sandbox blocks dev server bind).
 */
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
    // Mounted as a sibling to NewItemShortcutHandler in App's render tree.
    expect(src).toMatch(/<SettingsShortcutHandler\s*\/>/);
  });

  // Use the next sibling component declaration as the closing anchor so the
  // nested `function onKeyDown(...)` inside the useEffect body doesn't
  // truncate the handler block when splitting on the bare `function ` token.
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
    // Hash literal drift guard — handler must not duplicate the literal
    // `'#settings'` outside the canonical export.
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
