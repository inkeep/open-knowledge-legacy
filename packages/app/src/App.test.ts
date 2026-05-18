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

describe('NavigationHandler folder-index downgrade', () => {
  test('hash-driven nav routes folder-index through downgradeFolderIndexForHashNav', () => {
    expect(src).toContain('downgradeFolderIndexForHashNav');
    expect(src).toMatch(/downgradeFolderIndexForHashNav\(\s*resolved\s*\)/);
    expect(src).toMatch(/openTargetTransition\(\s*target\s*\)/);
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

const DRAG_LITERAL = '[-webkit-app-region:drag]';

function hasIsElectronHostGatedDrag(appSrc: string): boolean {
  const lines = appSrc.split('\n');
  for (let i = 0; i < lines.length; i += 1) {
    if (!lines[i]?.includes(DRAG_LITERAL)) continue;
    const start = Math.max(0, i - 6);
    const end = Math.min(lines.length, i + 6);
    const context = lines.slice(start, end).join('\n');
    if (/isElectronHost\s*(?:&&|\?)/.test(context)) return true;
  }
  return false;
}

describe('Editor BrowserWindow — wrapper-strip drag region contract', () => {
  test('App.tsx declares an isElectronHost-gated drag region covering the y=0..y=8 wrapper strip', () => {
    expect(hasIsElectronHostGatedDrag(src)).toBe(true);
  });

  test('App.tsx uses the canonical isElectronHost detection idiom', () => {
    expect(src).toMatch(
      /typeof\s+window\s*!==\s*['"]undefined['"]\s*&&\s*window\.okDesktop\s*!=\s*null/,
    );
    expect(src).toContain('const isElectronHost');
  });

  test('the drag-strip element pins fixed-position 8px-tall full-width pointer-passthrough geometry', () => {
    const lines = src.split('\n');
    let geometryPinLanded = false;
    for (let i = 0; i < lines.length; i += 1) {
      const line = lines[i] ?? '';
      if (!line.includes(DRAG_LITERAL)) continue;
      const start = Math.max(0, i - 4);
      const end = Math.min(lines.length, i + 5);
      const context = lines.slice(start, end).join('\n');
      expect(context).toContain('fixed');
      expect(context).toContain('top-0');
      expect(context).toContain('h-2');
      expect(context).toContain('inset-x-0');
      expect(context).toContain('pointer-events-none');
      expect(context).toContain('z-50');
      geometryPinLanded = true;
    }
    expect(geometryPinLanded).toBe(true);
  });

  test('the drag region is conditional on isElectronHost (web mode is unchanged)', () => {
    const lines = src.split('\n');
    let dragLiteralFound = false;
    for (let i = 0; i < lines.length; i += 1) {
      const line = lines[i] ?? '';
      if (!line.includes(DRAG_LITERAL)) continue;
      dragLiteralFound = true;
      const start = Math.max(0, i - 6);
      const end = Math.min(lines.length, i + 6);
      const context = lines.slice(start, end).join('\n');
      expect(context).toMatch(/isElectronHost/);
    }
    expect(dragLiteralFound).toBe(true);
  });
});

describe('ActiveTargetBridgePush — renderer→main push for File menu', () => {
  test('declares an ActiveTargetBridgePush component and mounts it inside the App tree', () => {
    expect(src).toMatch(/function\s+ActiveTargetBridgePush\s*\(/);
    expect(src).toMatch(/<ActiveTargetBridgePush\s*\/>/);
  });

  const handlerBlock =
    src
      .split('function ActiveTargetBridgePush()')[1]
      ?.split('function NewItemShortcutHandler()')[0] ?? '';

  test('reads activeTarget via useDocumentContext (single source of truth)', () => {
    expect(handlerBlock).toContain('useDocumentContext');
    expect(handlerBlock).toMatch(/const\s*\{\s*activeTarget\s*\}\s*=\s*useDocumentContext\(\)/);
  });

  test('gates the push on the desktop bridge being present (web mode is no-op)', () => {
    expect(handlerBlock).toMatch(/window\.okDesktop\s*\?\?\s*null/);
    expect(handlerBlock).toMatch(/if\s*\(!bridge\)\s*return\s*;/);
  });

  test('invokes bridge.editor.notifyActiveTargetChanged with the normalized snapshot', () => {
    expect(handlerBlock).toMatch(/bridge\.editor\.notifyActiveTargetChanged\(/);
  });

  test('effect deps narrow to the discriminator + identifier (no full-target re-fires)', () => {
    expect(handlerBlock).toMatch(
      /useEffect\(\s*\(\)\s*=>\s*\{[\s\S]*?\},\s*\[\s*bridge\s*,\s*kind\s*,\s*identifier\s*\]\)/,
    );
  });

  test('collapses non-{doc,folder} kinds to the project-scope null snapshot', () => {
    expect(handlerBlock).toMatch(
      /activeTarget\?\.kind\s*===\s*'doc'\s*\|\|\s*activeTarget\?\.kind\s*===\s*'folder'/,
    );
    expect(handlerBlock).toMatch(/notifyActiveTargetChanged\(\s*\{\s*kind:\s*null\s*\}\s*\)/);
  });
});
