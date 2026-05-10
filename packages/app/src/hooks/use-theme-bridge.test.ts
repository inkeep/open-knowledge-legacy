import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const SRC_PATH = join(__dirname, 'use-theme-bridge.ts');
const src = readFileSync(SRC_PATH, 'utf-8');

describe('useThemeBridge — module surface', () => {
  test('exports the useThemeBridge hook', async () => {
    const mod = await import('./use-theme-bridge');
    expect(typeof mod.useThemeBridge).toBe('function');
  });
});

describe('useThemeBridge — setThemeSource wiring (1-way contract)', () => {
  test('pushes the unresolved themeValue through setThemeSource', () => {
    expect(src).toMatch(/setThemeSource\s*\(\s*themeValue\s*\)/);
  });

  test('guards on themeValue before invoking setThemeSource', () => {
    expect(src).toMatch(
      /themeValue\s*!==\s*['"]light['"]\s*&&\s*themeValue\s*!==\s*['"]dark['"]\s*&&\s*themeValue\s*!==\s*['"]system['"]/,
    );
  });

  test('reads the bridge through the parameter so web / CLI no-ops gracefully', () => {
    expect(src).toMatch(/if \(!bridge\) return/);
  });
});

describe('useThemeBridge — show-gate release contract', () => {
  test('signalThemeApplied fires in .finally() so IPC failure still releases the show-gate', () => {
    expect(src).toMatch(/signalThemeApplied/);
    expect(src).toMatch(/setThemeSource[\s\S]*?\.finally\([\s\S]*?signalThemeApplied/);
  });

  test('IPC failure handler emits a structured warn and does not throw', () => {
    expect(src).toMatch(/\.catch\(/);
    expect(src).toMatch(/['"]theme-source-set-failed['"]/);
    expect(src).toMatch(/console\.warn\(\s*JSON\.stringify\(/);
  });

  test('cancellation flag prevents stale signalThemeApplied across re-runs / unmount', () => {
    expect(src).toMatch(/let cancelled = false/);
    expect(src).toMatch(/if \(cancelled\) return/);
    expect(src).toMatch(/cancelled = true/);
  });
});

describe('useThemeBridge — prefers-reduced-transparency wiring', () => {
  test('reads matchMedia prefers-reduced-transparency at signal time', () => {
    expect(src).toMatch(/matchMedia\(\s*['"]\(prefers-reduced-transparency: reduce\)['"]/);
  });

  test('passes the reducedTransparency boolean through signalThemeApplied opts', () => {
    expect(src).toMatch(/signalThemeApplied\(\s*\{\s*reducedTransparency\b/);
  });

  test('subscribes to prefers-reduced-transparency change events for mid-session toggles', () => {
    expect(src).toMatch(/addEventListener\(\s*['"]change['"]/);
    expect(src).toMatch(/removeEventListener\(\s*['"]change['"]/);
  });

  test('the change listener cleans up on unmount (no leaks across re-mounts)', () => {
    expect(src).toMatch(/return\s*\(\)\s*=>\s*\{[\s\S]*?removeEventListener/);
  });
});
