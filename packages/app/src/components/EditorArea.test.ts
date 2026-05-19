import { describe, expect, test } from 'bun:test';
import SRC from './EditorArea?raw';

describe('EditorArea module', () => {
  test('exports EditorArea component', async () => {
    const mod = await import('./EditorArea');
    expect(typeof mod.EditorArea).toBe('function');
  });
});

describe('EditorArea SettingsDialogPortal source-level guards', () => {
  test('imports SettingsDialogShell synchronously (not via React.lazy)', () => {
    expect(SRC).toMatch(
      /import\s+\{\s*SettingsDialogShell\s*\}\s+from\s+['"]@\/components\/settings\/SettingsDialogShell['"]/,
    );
    expect(SRC).not.toMatch(/lazy\(\s*\(\s*\)\s*=>\s*import\(['"]@\/components\/settings/);
    expect(SRC).not.toMatch(/m\.SettingsDialogShell/);
  });

  test('the Settings portal never lazy-loads the Settings chunk', () => {
    expect(SRC).toMatch(/import\s+\{[^}]*\}\s+from\s+['"]react['"]/);
    expect(SRC).not.toMatch(/lazy\([\s\S]{0,160}?import\(\s*['"]@\/components\/settings/);
  });

  test('no `<Suspense fallback={null}>` wrapper around the shell', () => {
    expect(SRC).not.toMatch(/<Suspense\s+fallback=\{null\}/);
  });

  test('SettingsDialogPortal mounts the shell directly with no first-open gate', () => {
    expect(SRC).not.toMatch(/\bhasOpened\b/);
    expect(SRC).not.toMatch(/setHasOpened\b/);
    expect(SRC).toMatch(/function\s+SettingsDialogPortal\s*\(/);
    expect(SRC).toMatch(/useSettingsRoute\(\)/);
    expect(SRC).toMatch(/<SettingsDialogShell\b[\s\S]*?open=\{settingsRoute\.open\}/);
  });

  test('close path delegates to settingsRoute.close()', () => {
    expect(SRC).toMatch(/onOpenChange=\{[\s\S]*?settingsRoute\.close\(\)/);
  });
});
